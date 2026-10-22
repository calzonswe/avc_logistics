// Damage Report Routes
//
// Workers/drivers report container damage (Worker App actions per GLOSSARY);
// managers acknowledge and resolve. Per GLOSSARY "Maintenance": condition-based
// tasks are triggered by damage reports — a report with severity 'major' or
// 'critical' automatically creates a due maintenance task for the container.
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  createDamageReportSchema,
  updateDamageReportSchema,
  damageReportQuerySchema,
} from '@avc/shared-types/api.js';
import { AppError, requireRole } from '../middleware/errorHandler.js';
import { emitAppEvent, managerUserIds } from '../services/events.js';

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

// SLA for auto-created condition-based tasks (documented in ticket 06 notes):
// critical damage needs attention within 24h, major within 48h.
const TASK_SLA_MS: Record<string, number> = { major: 48 * 3600 * 1000, critical: 24 * 3600 * 1000 };

// Legal status transitions (open → acknowledged → resolved; open → resolved).
// Nothing may move backwards, resolved is terminal.
const LEGAL_TRANSITIONS: Record<string, string[]> = {
  open: ['acknowledged', 'resolved'],
  acknowledged: ['resolved'],
  resolved: [],
};

export async function damageReportRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // List — filters: status, container_id, severity, reported_by, site_id.
  // site_id is matched via containers.current_site_id (damage_reports has no
  // site column). Workers/drivers are always scope-locked to their own site.
  app.get<{ Querystring: z.infer<typeof damageReportQuerySchema> }>('/', async (request) => {
    const filters = damageReportQuerySchema.safeParse(request.query);
    if (!filters.success) {
      const first = filters.error.issues[0];
      const path = first?.path?.length ? ` at '${first.path.join('.')}'` : '';
      throw new AppError(`Ogiltig fråga${path}: ${first?.message ?? 'validering misslyckades'}`, 'VALIDATION_ERROR', 400);
    }
    const { page = 1, limit = 20, status, container_id, site_id, severity, reported_by } = filters.data;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    const user = request.user!;
    const scopeSiteId = ['driver', 'worker'].includes(user.role) ? user.site_id : site_id;

    const baseFilters = (query: any) => {
      let q = query;
      if (status) q = q.where('damage_reports.status', '=', status);
      if (container_id) q = q.where('damage_reports.container_id', '=', container_id);
      if (severity) q = q.where('damage_reports.severity', '=', severity);
      if (reported_by) q = q.where('damage_reports.reported_by', '=', reported_by);
      if (scopeSiteId) q = q.where('containers.current_site_id', '=', scopeSiteId);
      return q;
    };

    const rows = await baseFilters(
      db
        .selectFrom('damage_reports')
        .selectAll('damage_reports')
        .leftJoin('containers', 'damage_reports.container_id', 'containers.id')
        // Extra context for list rendering (dashboard/UI convenience).
        .select(['containers.container_number', 'containers.current_site_id as site_id'])
        .leftJoin('maintenance_tasks', 'maintenance_tasks.damage_report_id', 'damage_reports.id')
        .select('maintenance_tasks.id as maintenance_task_id')
    )
      .orderBy('damage_reports.created_at', 'desc')
      .limit(limitNum)
      .offset((pageNum - 1) * limitNum)
      .execute();

    const total = await baseFilters(
      db
        .selectFrom('damage_reports')
        .leftJoin('containers', 'damage_reports.container_id', 'containers.id')
        .select((eb) => eb.fn.count('damage_reports.id').as('count'))
    ).executeTakeFirstOrThrow();

    return {
      data: rows,
      meta: {
        page: pageNum,
        limit: limitNum,
        total: Number(total?.count ?? 0),
        totalPages: Math.max(1, Math.ceil(Number(total?.count ?? 0) / limitNum)),
      },
    };
  });

  // Create. Any role may report damage (Worker App action per GLOSSARY).
  app.post<{ Body: z.infer<typeof createDamageReportSchema> }>('/', async (request, reply) => {
    const data = parseBody(request.body, createDamageReportSchema);

    const container = await db
      .selectFrom('containers')
      .select(['id', 'current_site_id'])
      .where('id', '=', data.container_id)
      .where('status', '!=', 'retired')
      .executeTakeFirst();
    if (!container) throw new AppError('Container hittades inte', 'NOT_FOUND', 404);

    // Workers/drivers may only report damage they can see (their own site).
    const user = request.user!;
    if (['driver', 'worker'].includes(user.role) && user.site_id && container.current_site_id !== user.site_id) {
      throw new AppError('Du kan bara rapportera skador på containrar på din egen plats', 'FORBIDDEN', 403);
    }

    const report = await db
      .insertInto('damage_reports')
      .values({
        container_id: container.id,
        reported_by: request.currentUserId!,
        severity: data.severity,
        description: data.description,
        // pg sends JS arrays as Postgres array literals; jsonb needs a JSON string.
        photos: JSON.stringify(data.photos ?? []),
        status: 'open',
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    // GLOSSARY: condition-based maintenance is triggered by damage reports.
    // 'major' → task due within 48h, 'critical' → within 24h; 'minor' → no task.
    let maintenanceTaskId: string | null = null;
    if (data.severity in TASK_SLA_MS) {
      const task = await db
        .insertInto('maintenance_tasks')
        .values({
          container_id: container.id,
          type: 'condition_based',
          status: 'due',
          scheduled_for: new Date(Date.now() + TASK_SLA_MS[data.severity]),
          description: `Tillståndsbaserat underhåll utlöst av ${data.severity} skaderapport: ${data.description}`,
          created_by: request.currentUserId!,
          damage_report_id: report.id,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();
      maintenanceTaskId = task.id;
    }

    // Event 3: a damage report was created → the managers are informed.
    const managers = await managerUserIds();
    await emitAppEvent({
      type: 'damage_reported',
      userIds: managers,
      title: `Ny skaderapport (${data.severity})`,
      message: data.description,
      related_entity_type: 'container',
      related_entity_id: container.id,
      site_id: container.current_site_id,
      data: { severity: data.severity, report_id: report.id, container_id: container.id },
    });

    return reply.code(201).send({ ...report, maintenance_task_id: maintenanceTaskId });
  });

  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const base = db
      .selectFrom('damage_reports')
      .selectAll('damage_reports')
      .leftJoin('containers', 'damage_reports.container_id', 'containers.id')
      .select('containers.current_site_id as site_id')
      .leftJoin('maintenance_tasks', 'maintenance_tasks.damage_report_id', 'damage_reports.id')
      .select('maintenance_tasks.id as maintenance_task_id');
    const report = await base.where('damage_reports.id', '=', request.params.id).executeTakeFirst();
    if (!report) throw new AppError('Skaderapport hittades inte', 'NOT_FOUND', 404);

    const user = request.user;
    if (user && ['driver', 'worker'].includes(user.role) && user.site_id && report.site_id !== user.site_id) {
      throw new AppError('Skaderapport hittades inte', 'NOT_FOUND', 404); // don't leak foreign-site rows
    }
    return report;
  });

  // Lifecycle transitions — managers/admins only; identity fields are stamped
  // server-side (the shared schema carries them for response shapes, never for
  // client input).
  app.patch<{ Params: { id: string }; Body: z.infer<typeof updateDamageReportSchema> }>(
    '/:id',
    { preHandler: requireRole('admin', 'manager') },
    async (request) => {
    const data = parseBody(request.body, updateDamageReportSchema);

    const existing = await db
      .selectFrom('damage_reports')
      .selectAll()
      .where('id', '=', request.params.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('Skaderapport hittades inte', 'NOT_FOUND', 404);

    if (!data.status) throw new AppError('Endast statusändringar stöds (acknowledge/resolve)', 'VALIDATION_ERROR', 400);
    const allowed = LEGAL_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(data.status)) {
      throw new AppError(
        `Ogiltig statusövergång: '${existing.status}' → '${data.status}'. Giltiga: ${allowed.length ? allowed.join(', ') : 'ingen'}`,
        'CONFLICT',
        409
      );
    }

    const now = new Date();
    const values: Record<string, unknown> = { status: data.status, updated_at: now };
    if (data.status === 'acknowledged') {
      values.acknowledged_by = request.currentUserId!;
      values.acknowledged_at = now;
    }
    if (data.status === 'resolved') {
      values.resolved_by = request.currentUserId!;
      values.resolved_at = now;
      if (data.resolution_notes != null) values.resolution_notes = data.resolution_notes;
    }
    // acknowledged_by/resolved_by from the body are never honoured — server-stamped only.

    const report = await db
      .updateTable('damage_reports')
      .set(values as any)
      .where('id', '=', request.params.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    const task = await db
      .selectFrom('maintenance_tasks')
      .select('id')
      .where('damage_report_id', '=', report.id)
      .executeTakeFirst();

    return { ...report, maintenance_task_id: task?.id ?? null };
  });
}
