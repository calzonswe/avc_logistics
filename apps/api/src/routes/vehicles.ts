// Vehicle Routes
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { vehicleSchema, createVehicleSchema, updateVehicleSchema } from '@avc/shared-types/api.js';
import { paginatedResponseSchema } from '@avc/shared-types/api.js';
import { requireRole, AppError } from '../middleware/errorHandler.js';

export async function vehicleRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  app.get<{ Querystring: { page?: string; limit?: string; classification?: string; search?: string } }>(
    '/',
    async (request) => {
      const { page = 1, limit = 20, classification, search } = request.query;
      const pageNum = Number(page);
      const limitNum = Number(limit);

      // Build base query for data
      let query = db.selectFrom('vehicles').selectAll().where('is_active', '=', true);

      // Build count query (without selectAll to avoid GROUP BY issues)
      let countQuery = db.selectFrom('vehicles').where('is_active', '=', true);

      if (classification) {
        query = query.where('classification', '=', classification as any);
        countQuery = countQuery.where('classification', '=', classification as any);
      }
      if (search) {
        query = query.where((eb) =>
          eb.or([
            eb('registration_number', 'ilike', `%${search}%`),
            eb('name', 'ilike', `%${search}%`),
            eb('type', 'ilike', `%${search}%`),
          ])
        );
        countQuery = countQuery.where((eb) =>
          eb.or([
            eb('registration_number', 'ilike', `%${search}%`),
            eb('name', 'ilike', `%${search}%`),
            eb('type', 'ilike', `%${search}%`),
          ])
        );
      }

      const total = await countQuery.select((eb) => eb.fn.count('id').as('count')).executeTakeFirst();
      const vehicles = await query
        .orderBy('registration_number')
        .limit(limitNum)
        .offset((pageNum - 1) * limitNum)
        .execute();

      return { data: vehicles, meta: { page: pageNum, limit: limitNum, total: Number(total?.count || 0), totalPages: Math.ceil(Number(total?.count || 0) / limitNum) } };
    }
  );

  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const vehicle = await db.selectFrom('vehicles').selectAll().where('id', '=', request.params.id).executeTakeFirst();
    if (!vehicle) throw new AppError('Fordon hittades inte', 'NOT_FOUND', 404);
    return vehicle;
  });

  app.post<{ Body: z.infer<typeof createVehicleSchema> }>('/', {
    preHandler: requireRole('admin', 'manager')
  }, async (request, reply) => {
    const vehicle = await db.insertInto('vehicles').values({ ...request.body, is_active: true } as any).returningAll().executeTakeFirstOrThrow();
    return reply.code(201).send(vehicle);
  });

  app.patch<{ Params: { id: string }; Body: z.infer<typeof updateVehicleSchema> }>('/:id', {
    preHandler: requireRole('admin', 'manager')
  }, async (request) => {
    // Validated: an illegal classification must be a clean 400, not a Postgres
    // enum error.
    const parsed = updateVehicleSchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const path = first?.path?.length ? ` at '${first.path.join('.')}'` : '';
      throw new AppError(`Ogiltigt anrop${path}: ${first?.message ?? 'validering misslyckades'}`, 'VALIDATION_ERROR', 400);
    }
    const vehicle = await db.updateTable('vehicles').set(parsed.data as any).where('id', '=', request.params.id).returningAll().executeTakeFirst();
    if (!vehicle) throw new AppError('Fordon hittades inte', 'NOT_FOUND', 404);
    return vehicle;
  });

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('admin') }, async (request) => {
    await db.updateTable('vehicles').set({ is_active: false }).where('id', '=', request.params.id).execute();
    return { success: true };
  });
}