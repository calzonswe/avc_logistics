// Container Routes - CRUD for containers, fill level updates, ownership transfer
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  containerSchema,
  createContainerSchema,
  updateContainerSchema,
  updateContainerFillLevelSchema,
  transferContainerOwnershipSchema,
} from '@avc/shared-types/api.js';
import { ContainerOverview, paginatedResponseSchema } from '@avc/shared-types/api.js';
import { requireRole, requireSiteAccess, AppError, NotFoundError } from '../middleware/errorHandler.js';

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

export async function containerRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // List containers with overview data
  app.get<{ Querystring: z.infer<typeof import('@avc/shared-types/api').containerQuerySchema> }>(
    '/',
    async (request) => {
      const { page = 1, limit = 20, site_id, company_id, type, fill_level, status, needs_maintenance, search } = request.query;
      const pageNum = Number(page);
      const limitNum = Number(limit);

      // Build base query for data
      let query = db
        .selectFrom('containers')
        .innerJoin('companies', 'containers.owning_company_id', 'companies.id')
        .leftJoin('sites', 'containers.current_site_id', 'sites.id')
        .leftJoin('parking_spots', 'containers.current_spot_id', 'parking_spots.id')
        .leftJoin('zones', 'parking_spots.zone_id', 'zones.id')
        .select([
          'containers.id',
          'containers.container_number',
          'containers.qr_code_value',
          'containers.type',
          'containers.fill_level',
          'containers.status',
          'containers.owning_company_id',
          'companies.name as owning_company_name',
          'containers.current_site_id',
          'sites.name as current_site_name',
          'containers.current_spot_id',
          'parking_spots.spot_code',
          'zones.name as zone_name',
          'containers.last_maintenance_at',
          'containers.next_maintenance_due',
          'containers.maintenance_interval_months',
          'containers.updated_at',
        ]);

      // Build count query (without joins to avoid GROUP BY issues)
      let countQuery = db.selectFrom('containers').where('containers.status', '=', 'active');

      if (site_id) {
        query = query.where('containers.current_site_id', '=', site_id);
        countQuery = countQuery.where('containers.current_site_id', '=', site_id);
      }
      if (company_id) {
        query = query.where('containers.owning_company_id', '=', company_id);
        countQuery = countQuery.where('containers.owning_company_id', '=', company_id);
      }
      if (type) {
        query = query.where('containers.type', '=', type);
        countQuery = countQuery.where('containers.type', '=', type);
      }
      if (fill_level) {
        query = query.where('containers.fill_level', '=', fill_level);
        countQuery = countQuery.where('containers.fill_level', '=', fill_level);
      }
      if (status) {
        query = query.where('containers.status', '=', status);
        countQuery = countQuery.where('containers.status', '=', status);
      }
      if (needs_maintenance) {
        query = query.where('containers.next_maintenance_due', '<=', new Date());
        countQuery = countQuery.where('containers.next_maintenance_due', '<=', new Date());
      }
      if (search) {
        query = query.where((eb) =>
          eb.or([
            eb('containers.container_number', 'ilike', `%${search}%`),
            eb('containers.qr_code_value', 'ilike', `%${search}%`),
          ])
        );
        countQuery = countQuery.where((eb) =>
          eb.or([
            eb('containers.container_number', 'ilike', `%${search}%`),
            eb('containers.qr_code_value', 'ilike', `%${search}%`),
          ])
        );
      }

      const total = await countQuery.select((eb) => eb.fn.count('id').as('count')).executeTakeFirst();
      const containers = await query
        .orderBy('containers.container_number')
        .limit(limitNum)
        .offset((pageNum - 1) * limitNum)
        .execute();

      return { data: containers, meta: { page: pageNum, limit: limitNum, total: Number(total?.count || 0), totalPages: Math.ceil(Number(total?.count || 0) / limitNum) } };
    }
  );

  // Get container by QR code (for mobile scanning)
  app.get<{ Params: { qrCode: string } }>(
    '/qr/:qrCode',
    async (request) => {
      const container = await db
        .selectFrom('containers')
        .innerJoin('companies', 'containers.owning_company_id', 'companies.id')
        .leftJoin('sites', 'containers.current_site_id', 'sites.id')
        .leftJoin('parking_spots', 'containers.current_spot_id', 'parking_spots.id')
        .leftJoin('zones', 'parking_spots.zone_id', 'zones.id')
        .select([
          'containers.id',
          'containers.container_number',
          'containers.qr_code_value',
          'containers.type',
          'containers.fill_level',
          'containers.status',
          'containers.owning_company_id',
          'companies.name as owning_company_name',
          'containers.current_site_id',
          'sites.name as current_site_name',
          'containers.current_spot_id',
          'parking_spots.spot_code',
          'zones.name as zone_name',
        ])
        .where('containers.qr_code_value', '=', request.params.qrCode)
        .executeTakeFirst();

      if (!container) throw new NotFoundError('Container', request.params.qrCode);
      return container;
    }
  );

  // Create container
  app.post<{ Body: z.infer<typeof import('@avc/shared-types/api').createContainerSchema> }>(
    '/',
    {
      preHandler: requireRole('admin', 'manager'),
    },
    async (request, reply) => {
      const body = parseBody(request.body, createContainerSchema);
      // Verify spot exists and is available
      if (body.current_spot_id) {
        const spot = await db
          .selectFrom('parking_spots')
          .selectAll()
          .where('id', '=', body.current_spot_id)
          .executeTakeFirst();
        if (!spot) throw new AppError('Parkeringsplats hittades inte', 'NOT_FOUND', 404);
        if (!spot.is_active) throw new AppError('Parkeringsplats är inaktiv', 'CONFLICT', 409);
        if (body.current_site_id) {
          const zone = await db.selectFrom('zones').select('site_id').where('id', '=', spot.zone_id).executeTakeFirst();
          if (zone?.site_id !== body.current_site_id) {
            throw new AppError('Parkeringsplatsen tillhör inte vald plats', 'VALIDATION_ERROR', 400);
          }
        }

        // Check if spot already occupied
        const occupied = await db
          .selectFrom('containers')
          .select('id')
          .where('current_spot_id', '=', body.current_spot_id)
          .where('status', '!=', 'retired')
          .executeTakeFirst();
        if (occupied) throw new AppError('Parkeringsplats är redan upptagen', 'CONFLICT', 409);
      }

      // Verify site exists
      if (body.current_site_id) {
        const site = await db.selectFrom('sites').select('id').where('id', '=', body.current_site_id).executeTakeFirst();
        if (!site) throw new AppError('Plats hittades inte', 'NOT_FOUND', 404);
      }

      // Verify company exists
      const company = await db.selectFrom('companies').select('id').where('id', '=', body.owning_company_id).executeTakeFirst();
      if (!company) throw new AppError('Företag hittades inte', 'NOT_FOUND', 404);

      const container = await db
        .insertInto('containers')
        .values(request.body as any)
        .returningAll()
        .executeTakeFirstOrThrow();

      return reply.code(201).send(container);
    }
  );

  // Update container
  app.patch<{ Params: { id: string }; Body: z.infer<typeof import('@avc/shared-types/api').updateContainerSchema> }>(
    '/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const data = parseBody(request.body, updateContainerSchema);

      // If the update relocates the container, verify the new spot like on create.
      if (data.current_spot_id) {
        const existing = await db
          .selectFrom('containers')
          .select(['current_spot_id'])
          .where('id', '=', request.params.id)
          .executeTakeFirst();
        if (existing?.current_spot_id !== data.current_spot_id) {
          const spot = await db
            .selectFrom('parking_spots')
            .selectAll()
            .where('id', '=', data.current_spot_id)
            .executeTakeFirst();
          if (!spot) throw new AppError('Parkeringsplats hittades inte', 'NOT_FOUND', 404);
          if (!spot.is_active) throw new AppError('Parkeringsplats är inaktiv', 'CONFLICT', 409);
          if (data.current_site_id) {
            const zone = await db.selectFrom('zones').select('site_id').where('id', '=', spot.zone_id).executeTakeFirst();
            if (zone?.site_id !== data.current_site_id) {
              throw new AppError('Parkeringsplatsen tillhör inte vald plats', 'VALIDATION_ERROR', 400);
            }
          }
          const occupied = await db
            .selectFrom('containers')
            .select('id')
            .where('current_spot_id', '=', data.current_spot_id)
            .where('status', '!=', 'retired')
            .where('id', '!=', request.params.id)
            .executeTakeFirst();
          if (occupied) throw new AppError('Parkeringsplats är redan upptagen', 'CONFLICT', 409);
        }
      }

      const container = await db
        .updateTable('containers')
        .set({ ...data, updated_at: new Date() } as any)
        .where('id', '=', request.params.id)
        .returningAll()
        .executeTakeFirst();
      if (!container) throw new NotFoundError('Container', request.params.id);
      return container;
    }
  );

  // Update container fill level
  app.patch<{ Params: { id: string }; Body: z.infer<typeof import('@avc/shared-types/api').updateContainerFillLevelSchema> }>(
    '/:id/fill-level',
    { preHandler: requireRole('admin', 'manager', 'worker') },
    async (request) => {
      const { fill_level } = parseBody(request.body, updateContainerFillLevelSchema);
      const container = await db
        .updateTable('containers')
        .set({ fill_level, updated_at: new Date() } as any)
        .where('id', '=', request.params.id)
        .returningAll()
        .executeTakeFirst();
      if (!container) throw new NotFoundError('Container', request.params.id);
      return container;
    }
  );

  // Transfer container ownership
  app.patch<{ Params: { id: string }; Body: z.infer<typeof import('@avc/shared-types/api').transferContainerOwnershipSchema> }>(
    '/:id/transfer-ownership',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const container = await db.selectFrom('containers').selectAll().where('id', '=', request.params.id).executeTakeFirst();
      if (!container) throw new NotFoundError('Container', request.params.id);

      const toCompany = await db.selectFrom('companies').select('id').where('id', '=', request.body.to_company_id).executeTakeFirst();
      if (!toCompany) throw new AppError('Mottagande företag hittades inte', 'NOT_FOUND', 404);

      await db.transaction().execute(async (trx) => {
        // Update container ownership
        await trx
          .updateTable('containers')
          .set({ owning_company_id: request.body.to_company_id } as any)
          .where('id', '=', request.params.id)
          .execute();

        // Record in ownership history
        await trx.insertInto('container_ownership_history').values({
          container_id: request.params.id,
          from_company_id: container.owning_company_id,
          to_company_id: request.body.to_company_id,
          changed_by: request.currentUserId!,
          reason: request.body.reason,
        } as any).execute();
      });

      return { success: true };
    }
  );

  // Container history: ownership transfers + physical movements (timeline data)
  app.get<{ Params: { id: string } }>(
    '/:id/history',
    { preHandler: requireRole('admin', 'manager', 'worker') },
    async (request) => {
      const container = await db
        .selectFrom('containers')
        .select('id')
        .where('id', '=', request.params.id)
        .executeTakeFirst();
      if (!container) throw new NotFoundError('Container', request.params.id);

      const ownership = await db
        .selectFrom('container_ownership_history')
        .leftJoin('companies as from_company', 'container_ownership_history.from_company_id', 'from_company.id')
        .innerJoin('companies as to_company', 'container_ownership_history.to_company_id', 'to_company.id')
        .innerJoin('users', 'container_ownership_history.changed_by', 'users.id')
        .select([
          'container_ownership_history.id',
          'container_ownership_history.from_company_id',
          'from_company.name as from_company_name',
          'container_ownership_history.to_company_id',
          'to_company.name as to_company_name',
          'container_ownership_history.changed_by',
          'users.full_name as changed_by_name',
          'container_ownership_history.changed_at',
          'container_ownership_history.reason',
        ])
        .where('container_ownership_history.container_id', '=', request.params.id)
        .orderBy('container_ownership_history.changed_at', 'desc')
        .execute();

      const movements = await db
        .selectFrom('transport_order_containers')
        .innerJoin('transport_order_stops', 'transport_order_containers.stop_id', 'transport_order_stops.id')
        .innerJoin('transport_orders', 'transport_order_stops.order_id', 'transport_orders.id')
        .leftJoin('sites', 'transport_order_stops.site_id', 'sites.id')
        .select([
          'transport_orders.id as order_id',
          'transport_orders.order_number',
          'transport_orders.status as order_status',
          'transport_order_stops.stop_type',
          'sites.name as site_name',
          'transport_order_stops.planned_at',
          'transport_order_containers.loaded_at',
          'transport_order_containers.unloaded_at',
        ])
        .where('transport_order_containers.container_id', '=', request.params.id)
        .orderBy('transport_order_stops.planned_at', 'desc')
        .limit(50)
        .execute();

      return {
        ownership: ownership.map((row) => ({ ...row, changed_at: row.changed_at.toISOString() })),
        movements: movements.map((row) => ({
          ...row,
          planned_at: row.planned_at ? row.planned_at.toISOString() : null,
        })),
      };
    }
  );

  // Delete container (soft - set status to retired)
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
      const container = await db
        .updateTable('containers')
        .set({ status: 'retired', updated_at: new Date() } as any)
        .where('id', '=', request.params.id)
        .returningAll()
        .executeTakeFirst();
      if (!container) throw new NotFoundError('Container', request.params.id);
      return { success: true };
    }
  );
}