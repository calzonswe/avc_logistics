// Notification Routes
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { notificationSchema, paginatedResponseSchema } from '@avc/shared-types/api.js';

export async function notificationRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  app.get<{ Querystring: z.infer<typeof import('@avc/shared-types/api').notificationQuerySchema> }>(
    '/',
    async (request) => {
      const { page = 1, limit = 20, is_read, type } = request.query;
      const pageNum = Number(page);
      const limitNum = Number(limit);

      let query = db
        .selectFrom('notifications')
        .selectAll()
        .where('user_id', '=', request.currentUserId!);

      if (typeof is_read === 'boolean') query = query.where('is_read', '=', is_read);
      if (type) query = query.where('type', '=', type);

      // Build count query
      let countQuery = db.selectFrom('notifications').where('user_id', '=', request.currentUserId!);
      if (typeof is_read === 'boolean') countQuery = countQuery.where('is_read', '=', is_read);
      if (type) countQuery = countQuery.where('type', '=', type);

      const total = await countQuery.select((eb) => eb.fn.count('id').as('count')).executeTakeFirst();
      const notifications = await query
        .orderBy('created_at', 'desc')
        .limit(limitNum)
        .offset((pageNum - 1) * limitNum)
        .execute();

      return { data: notifications, meta: { page: pageNum, limit: limitNum, total: Number(total?.count || 0), totalPages: Math.ceil(Number(total?.count || 0) / limitNum) } };
    }
  );

  // Get unread count
  app.get('/unread-count', async (request) => {
    const count = await db
      .selectFrom('notifications')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('user_id', '=', request.currentUserId!)
      .where('is_read', '=', false)
      .executeTakeFirst();
    return { count: Number(count?.count || 0) };
  });

  // Mark as read
  app.post<{ Body: { notification_ids: string[] } }>(
    '/read',
    async (request) => {
      const { notification_ids } = request.body;
      await db
        .updateTable('notifications')
        .set({ is_read: true, read_at: new Date() })
        .where('id', 'in', notification_ids)
        .where('user_id', '=', request.currentUserId!)
        .execute();
      return { success: true };
    }
  );

  // Mark all as read
  app.post('/read-all', async (request) => {
    await db
      .updateTable('notifications')
      .set({ is_read: true, read_at: new Date() })
      .where('user_id', '=', request.currentUserId!)
      .where('is_read', '=', false)
      .execute();
    return { success: true };
  });
}