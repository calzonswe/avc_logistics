// Driver Routes
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { userSchema, createUserSchema, updateUserSchema } from '@avc/shared-types/api.js';
import { paginatedResponseSchema } from '@avc/shared-types/api.js';
import { requireRole, AppError } from '../middleware/errorHandler.js';
import bcrypt from 'bcrypt';
import { config } from '../config/index.js';

export async function driverRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  app.get<{ Querystring: { page?: string; limit?: string; search?: string } }>(
    '/',
    async (request) => {
      const { page = 1, limit = 20, search } = request.query;
      const pageNum = Number(page);
      const limitNum = Number(limit);

      // Build base query for data
      let query = db
        .selectFrom('users')
        .select(['id', 'email', 'full_name', 'role', 'site_id', 'avatar_url', 'is_active', 'last_login_at', 'created_at'])
        .where('role', '=', 'driver')
        .where('is_active', '=', true);

      // Build count query (without select to avoid GROUP BY issues)
      let countQuery = db
        .selectFrom('users')
        .where('role', '=', 'driver')
        .where('is_active', '=', true);

      if (search) {
        query = query.where((eb) =>
          eb.or([eb('full_name', 'ilike', `%${search}%`), eb('email', 'ilike', `%${search}%`)])
        );
        countQuery = countQuery.where((eb) =>
          eb.or([eb('full_name', 'ilike', `%${search}%`), eb('email', 'ilike', `%${search}%`)])
        );
      }

      const total = await countQuery.select((eb) => eb.fn.count('id').as('count')).executeTakeFirst();
      const drivers = await query
        .orderBy('full_name')
        .limit(limitNum)
        .offset((pageNum - 1) * limitNum)
        .execute();

      return { data: drivers, meta: { page: pageNum, limit: limitNum, total: Number(total?.count || 0), totalPages: Math.ceil(Number(total?.count || 0) / limitNum) } };
    }
  );

  app.post<{ Body: z.infer<typeof import('@avc/shared-types/api').createUserSchema> }>('/', {
    preHandler: requireRole('admin', 'manager'),
  }, async (request, reply) => {
    const { password, ...userData } = request.body;
    const password_hash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
    const user = await db.insertInto('users').values({ ...userData, password_hash, role: 'driver', is_active: true } as any).returningAll().executeTakeFirstOrThrow();
    const { password_hash: _, ...safeUser } = user;
    return reply.code(201).send(safeUser);
  });

  app.patch<{ Params: { id: string }; Body: z.infer<typeof import('@avc/shared-types/api').updateUserSchema> }>('/:id', {
    preHandler: requireRole('admin', 'manager'),
  }, async (request) => {
    // Validated: an illegal role/status must be a clean 400, not a Postgres
    // enum error.
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const path = first?.path?.length ? ` at '${first.path.join('.')}'` : '';
      throw new AppError(`Ogiltigt anrop${path}: ${first?.message ?? 'validering misslyckades'}`, 'VALIDATION_ERROR', 400);
    }
    const { password, ...data } = parsed.data as any;
    const updateData = { ...data } as any;
    if (password) updateData.password_hash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
    const user = await db.updateTable('users').set(updateData).where('id', '=', request.params.id).returningAll().executeTakeFirst();
    if (!user) throw new AppError('Förare hittades inte', 'NOT_FOUND', 404);
    const safeUser = Object.fromEntries(
      Object.entries(user as Record<string, any>).filter(([key]) => key !== 'password_hash')
    );
    return safeUser;
  });

  // Soft delete (sites precedent): deactivate instead of hard-deleting so
  // transport-order history and audit log keep referencing a real user.
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: requireRole('admin', 'manager'),
  }, async (request) => {
    const result = await db
      .updateTable('users')
      .set({ is_active: false })
      .where('id', '=', request.params.id)
      .where('role', '=', 'driver') // never deactivates admins/managers/workers via this route
      .returning(['id', 'email', 'is_active'])
      .executeTakeFirst();
    if (!result) throw new AppError('Förare hittades inte', 'NOT_FOUND', 404);
    return { success: true };
  });
}