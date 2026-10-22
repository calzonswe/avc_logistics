// Maintenance Routes
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  maintenanceTaskSchema,
  createMaintenanceTaskSchema,
  updateMaintenanceTaskSchema
} from '@avc/shared-types/api.js';
import { paginatedResponseSchema } from '@avc/shared-types/api.js';
import { requireRole, AppError } from '../middleware/errorHandler.js';

export async function maintenanceRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  app.get<{ Querystring: z.infer<typeof import('@avc/shared-types/api').maintenanceTaskQuerySchema> }>(
    '/',
    async (request) => {
      const { page = 1, limit = 20, status, container_id, assigned_to, type, overdue_only } = request.query;

      let query = db
        .selectFrom('maintenance_tasks')
        .leftJoin('containers', 'maintenance_tasks.container_id', 'containers.id')
        .leftJoin('sites', 'containers.current_site_id', 'sites.id')
        .leftJoin('users', 'maintenance_tasks.assigned_to', 'users.id')
        .select([
          'maintenance_tasks.id',
          'maintenance_tasks.container_id',
          'containers.container_number',
          'containers.type as container_type',
          'containers.current_site_id',
          'sites.name as site_name',
          'maintenance_tasks.type',
          'maintenance_tasks.status',
          'maintenance_tasks.scheduled_for',
          'maintenance_tasks.started_at',
          'maintenance_tasks.completed_at',
          'maintenance_tasks.assigned_to',
          'users.full_name as assigned_to_name',
          'maintenance_tasks.description',
          'containers.maintenance_interval_months',
          'containers.last_maintenance_at',
        ]);

      if (status) query = query.where('maintenance_tasks.status', '=', status);
      if (container_id) query = query.where('maintenance_tasks.container_id', '=', container_id);
      if (assigned_to) query = query.where('maintenance_tasks.assigned_to', '=', assigned_to);
      if (type) query = query.where('maintenance_tasks.type', '=', type);
      if (overdue_only) query = query.where('maintenance_tasks.scheduled_for', '<=', new Date()).where('maintenance_tasks.status', '!=', 'completed');

      const pageNum = Number(page);
      const limitNum = Number(limit);

      // Build count query (without joins to avoid GROUP BY issues)
      let countQuery = db.selectFrom('maintenance_tasks');
      if (status) countQuery = countQuery.where('status', '=', status);
      if (container_id) countQuery = countQuery.where('container_id', '=', container_id);
      if (assigned_to) countQuery = countQuery.where('assigned_to', '=', assigned_to);
      if (type) countQuery = countQuery.where('type', '=', type);
      if (overdue_only) countQuery = countQuery.where('scheduled_for', '<=', new Date()).where('status', '!=', 'completed');

      const total = await countQuery.select((eb) => eb.fn.count('id').as('count')).executeTakeFirst();
      const tasks = await query
        .orderBy('maintenance_tasks.scheduled_for')
        .limit(limitNum)
        .offset((pageNum - 1) * limitNum)
        .execute();

      return { data: tasks, meta: { page: pageNum, limit: limitNum, total: Number(total?.count || 0), totalPages: Math.ceil(Number(total?.count || 0) / limitNum) } };
    }
  );

  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const task = await db
      .selectFrom('maintenance_tasks')
      .leftJoin('containers', 'maintenance_tasks.container_id', 'containers.id')
      .leftJoin('sites', 'containers.current_site_id', 'sites.id')
      .leftJoin('users', 'maintenance_tasks.assigned_to', 'users.id')
      .select([
        'maintenance_tasks.id',
        'maintenance_tasks.container_id',
        'containers.container_number',
        'containers.type as container_type',
        'containers.current_site_id',
        'sites.name as site_name',
        'maintenance_tasks.type',
        'maintenance_tasks.status',
        'maintenance_tasks.scheduled_for',
        'maintenance_tasks.started_at',
        'maintenance_tasks.completed_at',
        'maintenance_tasks.assigned_to',
        'users.full_name as assigned_to_name',
        'maintenance_tasks.description',
      ])
      .where('maintenance_tasks.id', '=', request.params.id)
      .executeTakeFirst();

    if (!task) throw new AppError('Underhållsuppgift hittades inte', 'NOT_FOUND', 404);
    return task;
  });

  app.post<{ Body: z.infer<typeof import('@avc/shared-types/api').createMaintenanceTaskSchema> }>('/', {
    preHandler: requireRole('admin', 'manager'),
  }, async (request, reply) => {
    // `due` is the legal status for a newly created task ('scheduled' is not in
    // the maintenance_status enum: due/in_progress/completed/overdue).
    const task = await db.insertInto('maintenance_tasks').values({ ...request.body, status: 'due' } as any).returningAll().executeTakeFirstOrThrow();
    return reply.code(201).send(task);
  });

  app.patch<{ Params: { id: string }; Body: z.infer<typeof import('@avc/shared-types/api').updateMaintenanceTaskSchema> }>('/:id', {
    preHandler: requireRole('admin', 'manager', 'worker'),
  }, async (request) => {
    // Validated: an illegal status (e.g. 'scheduled') must be a clean 400, not
    // a Postgres enum error (500).
    const parsed = updateMaintenanceTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const path = first?.path?.length ? ` at '${first.path.join('.')}'` : '';
      throw new AppError(`Ogiltigt anrop${path}: ${first?.message ?? 'validering misslyckades'}`, 'VALIDATION_ERROR', 400);
    }
    const body = parsed.data as any;
    if (body.scheduled_for) body.scheduled_for = new Date(body.scheduled_for);
    if (body.started_at) body.started_at = new Date(body.started_at);
    if (body.completed_at) body.completed_at = new Date(body.completed_at);
    const task = await db.updateTable('maintenance_tasks').set(body).where('id', '=', request.params.id).returningAll().executeTakeFirst();
    if (!task) throw new AppError('Underhållsuppgift hittades inte', 'NOT_FOUND', 404);
    return task;
  });

  // Get overdue maintenance tasks
  app.get('/overdue', async (request) => {
    return db
      .selectFrom('maintenance_tasks')
      .leftJoin('containers', 'maintenance_tasks.container_id', 'containers.id')
      .leftJoin('sites', 'containers.current_site_id', 'sites.id')
      .select([
        'maintenance_tasks.id',
        'maintenance_tasks.container_id',
        'containers.container_number',
        'containers.type as container_type',
        'containers.current_site_id',
        'sites.name as site_name',
        'maintenance_tasks.type',
        'maintenance_tasks.status',
        'maintenance_tasks.scheduled_for',
        'maintenance_tasks.description',
      ])
      .where('maintenance_tasks.scheduled_for', '<=', new Date())
      .where('maintenance_tasks.status', '!=', 'completed')
      .orderBy('maintenance_tasks.scheduled_for')
      .execute();
  });
}