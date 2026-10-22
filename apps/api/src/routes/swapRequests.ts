// Swap Request Routes
//
// Worker App action "request container swap" (GLOSSARY). Lifecycle:
// pending → approved → fulfilled, or cancelled from pending/approved.
// approval/fulfilment identity is stamped server-side; managers pick which
// container fulfils the request via PATCH { status, new_container_id }.
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  createSwapRequestSchema,
  updateSwapRequestSchema,
  swapRequestQuerySchema,
} from '@avc/shared-types/api.js';
import { AppError, NotFoundError, requireRole } from '../middleware/errorHandler.js';

/** Throws AppError(VALIDATION_ERROR) when the payload violates the shared contract. */
function parseBody(body: unknown, schema: z.ZodTypeAny) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.length ? ` at '${first.path.join('.')}'` : '';
    throw new AppError(`Ogiltigt anrop${path}: ${first?.message ?? 'validering misslyckades'}`, 'VALIDATION_ERROR', 400);
  }
  return parsed.data;
}

// Legal status transitions. cancelled is terminal from pending/approved;
// fulfilled is terminal and requires (or creates) the replacement container.
// pending → fulfilled is allowed: a manager may complete a same-day swap
// without a separate approval step.
const LEGAL_TRANSITIONS: Record<string, string[]> = {
  pending: ['approved', 'fulfilled', 'cancelled'],
  approved: ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};

export async function swapRequestRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  app.get<{ Querystring: z.infer<typeof swapRequestQuerySchema> }>('/', async (request) => {
    const filters = swapRequestQuerySchema.safeParse(request.query);
    if (!filters.success) {
      const first = filters.error.issues[0];
      const path = first?.path?.length ? ` at '${first.path.join('.')}'` : '';
      throw new AppError(`Ogiltig fråga${path}: ${first?.message ?? 'validering misslyckades'}`, 'VALIDATION_ERROR', 400);
    }
    const { page = 1, limit = 20, status, site_id, requested_by } = filters.data;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    const user = request.user!;
    const scopeSiteId = ['driver', 'worker'].includes(user.role) ? user.site_id : site_id;

    const baseFilters = (query: any) => {
      let q = query;
      // Column names must be table-qualified: the joins below bring in
      // containers.status / users.site_id, which would otherwise be ambiguous.
      if (status) q = q.where('swap_requests.status', '=', status);
      if (scopeSiteId) q = q.where('swap_requests.site_id', '=', scopeSiteId);
      if (requested_by) q = q.where('swap_requests.requested_by', '=', requested_by);
      return q;
    };

    // Row count + list with actor names for the manager UI.
    const total = await baseFilters(
      db.selectFrom('swap_requests').select((eb) => eb.fn.count('swap_requests.id').as('count'))
    ).executeTakeFirstOrThrow();

    // NOTE: selectAll() must be scoped to the base table — with joins it would
    // expand to every joined table (leaking user credentials and clobbering id).
    const requests = await baseFilters(
      db
        .selectFrom('swap_requests')
        .selectAll('swap_requests')
        .leftJoin('users as requester', 'swap_requests.requested_by', 'requester.id')
        .leftJoin('users as approver', 'swap_requests.approved_by', 'approver.id')
        .leftJoin('containers as current_container', 'swap_requests.current_container_id', 'current_container.id')
        .leftJoin('containers as new_container', 'swap_requests.new_container_id', 'new_container.id')
        .select([
          'requester.full_name as requested_by_name',
          'approver.full_name as approved_by_name',
          'current_container.container_number as current_container_number',
          'new_container.container_number as new_container_number',
        ])
    )
      .orderBy('swap_requests.created_at', 'desc')
      .limit(limitNum)
      .offset((pageNum - 1) * limitNum)
      .execute();

    return {
      data: requests,
      meta: {
        page: pageNum,
        limit: limitNum,
        total: Number(total?.count ?? 0),
        totalPages: Math.max(1, Math.ceil(Number(total?.count ?? 0) / limitNum)),
      },
    };
  });

  // Create. Workers/drivers request swaps on their own site; managers/admins on
  // any site. `requested_by` is always the caller.
  app.post<{ Body: z.infer<typeof createSwapRequestSchema> }>(
    '/',
    { preHandler: requireRole('admin', 'manager', 'driver', 'worker') },
    async (request, reply) => {
      const data = parseBody(request.body, createSwapRequestSchema);
      const user = request.user!;

      // Workers/drivers may only request swaps for their own site.
      if (['driver', 'worker'].includes(user.role) && user.site_id && data.site_id !== user.site_id) {
        throw new AppError('Du kan bara skapa bytbegäranden på din egen plats', 'FORBIDDEN', 403);
      }

      // Site must exist.
      const site = await db.selectFrom('sites').select('id').where('id', '=', data.site_id).executeTakeFirst();
      if (!site) throw new AppError('Plats hittades inte', 'NOT_FOUND', 404);

      // Referenced container/spot/category must belong to that site (or be unset).
      if (data.current_container_id) {
        const c = await db
          .selectFrom('containers')
          .select('id')
          .where('id', '=', data.current_container_id)
          .where('current_site_id', '=', data.site_id)
          .executeTakeFirst();
        if (!c) throw new AppError('Container hittades inte på platsen', 'NOT_FOUND', 404);
      }
      if (data.current_spot_id) {
        const s = await db
          .selectFrom('parking_spots')
          .select('id')
          .leftJoin('zones', 'parking_spots.zone_id', 'zones.id')
          .where('parking_spots.id', '=', data.current_spot_id)
          .where('zones.site_id', '=', data.site_id)
          .executeTakeFirst();
        if (!s) throw new AppError('Parkeringsplats hittades inte på platsen', 'NOT_FOUND', 404);
      }
      if (data.waste_category_id) {
        const w = await db
          .selectFrom('waste_categories')
          .select('id')
          .where('id', '=', data.waste_category_id)
          .where('site_id', '=', data.site_id)
          .executeTakeFirst();
        if (!w) throw new AppError('Avfallskategori hittades inte på platsen', 'NOT_FOUND', 404);
      }

      const swapRequest = await db
        .insertInto('swap_requests')
        .values({
          site_id: data.site_id,
          requested_by: request.currentUserId!,
          current_container_id: data.current_container_id ?? null,
          current_spot_id: data.current_spot_id ?? null,
          waste_category_id: data.waste_category_id ?? null,
          preferred_container_type: data.preferred_container_type ?? null,
          reason: data.reason ?? null,
          status: 'pending',
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      return reply.code(201).send(swapRequest);
    }
  );

  // Lifecycle transitions — managers/admins only. approved_by/approved_at/
  // fulfilled_by/fulfilled_at are server-stamped; the client never sets identity.
  app.patch<{ Params: { id: string }; Body: z.infer<typeof updateSwapRequestSchema> }>(
    '/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
    const data = parseBody(request.body, updateSwapRequestSchema);

    const existing = await db
      .selectFrom('swap_requests')
      .selectAll()
      .where('id', '=', request.params.id)
      .executeTakeFirst();
    if (!existing) throw new NotFoundError('Bytbegäran', request.params.id);

    if (!data.status) {
      throw new AppError(
        'Endast statusändringar stöds (approve/fulfil/cancel). Använd POST för nya begäranden.',
        'VALIDATION_ERROR',
        400
      );
    }
    const allowed = LEGAL_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(data.status)) {
      throw new AppError(
        `Ogiltig statusövergång: '${existing.status}' → '${data.status}'. Giltiga: ${allowed.length ? allowed.join(', ') : 'ingen (slutstatus)'}`,
        'CONFLICT',
        409
      );
    }

    const now = new Date();
    const values: Record<string, unknown> = { status: data.status, updated_at: now };
    if (data.status === 'approved') {
      values.approved_by = request.currentUserId!;
      values.approved_at = now;
      if (data.new_container_id != null) values.new_container_id = data.new_container_id;
    }
    if (data.status === 'fulfilled') {
      values.fulfilled_by = request.currentUserId!;
      values.fulfilled_at = now;
      if (data.new_container_id != null) values.new_container_id = data.new_container_id;
    }
    // new_container_id is only stored together with approved/fulfilled.

    const swapRequest = await db
      .updateTable('swap_requests')
      .set(values as any)
      .where('id', '=', request.params.id)
      .returningAll()
      .executeTakeFirst();
    if (!swapRequest) throw new NotFoundError('Bytbegäran', request.params.id);
    return swapRequest;
  });

  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const swapRequest = await db
      .selectFrom('swap_requests')
      .selectAll()
      .where('id', '=', request.params.id)
      .executeTakeFirst();
    if (!swapRequest) throw new NotFoundError('Bytbegäran', request.params.id);

    const user = request.user;
    if (user && ['driver', 'worker'].includes(user.role) && user.site_id && swapRequest.site_id !== user.site_id) {
      throw new NotFoundError('Bytbegäran', request.params.id); // don't leak foreign-site rows
    }
    return swapRequest;
  });
}
