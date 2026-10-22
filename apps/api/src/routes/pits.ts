// Pit Routes
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { pitSchema, createPitSchema, updatePitSchema } from '@avc/shared-types/api.js';
import { paginatedResponseSchema } from '@avc/shared-types/api.js';
import { requireRole, AppError, NotFoundError } from '../middleware/errorHandler.js';
import { emitAppEvent, siteAlertUserIds } from '../services/events.js';

export async function pitRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  app.get<{ Params: { siteId: string } }>(
    '/site/:siteId',
    async (request) => {
      return db
        .selectFrom('pits')
        .selectAll()
        .where('site_id', '=', request.params.siteId)
        .where('is_active', '=', true)
        .orderBy('name')
        .execute();
    }
  );

  app.post<{ Params: { siteId: string }; Body: z.infer<typeof import('@avc/shared-types/api').createPitSchema> }>('/site/:siteId', {
    preHandler: requireRole('admin', 'manager'),
  }, async (request, reply) => {
    const pit = await db.insertInto('pits').values({ ...request.body, site_id: request.params.siteId, is_active: true } as any).returningAll().executeTakeFirstOrThrow();
    return reply.code(201).send(pit);
  });

  app.patch<{ Params: { id: string }; Body: z.infer<typeof import('@avc/shared-types/api').updatePitSchema> }>('/:id', {
    preHandler: requireRole('admin', 'manager', 'worker'),
  }, async (request) => {
    // Validated: an illegal fill level must be a clean 400 (not a Postgres
    // enum error).
    const parsed = updatePitSchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const path = first?.path?.length ? ` at '${first.path.join('.')}'` : '';
      throw new AppError(`Ogiltigt anrop${path}: ${first?.message ?? 'validering misslyckades'}`, 'VALIDATION_ERROR', 400);
    }

    // Read the previous level so we can detect the 75 % crossing (the
    // `check_pit_alert` database trigger writes the notification rows for the
    // site's workers and managers; the app only broadcasts the event).
    const before = await db
      .selectFrom('pits')
      .select(['id', 'name', 'site_id', 'fill_level'])
      .where('id', '=', request.params.id)
      .executeTakeFirst();
    if (!before) throw new NotFoundError('Grop', request.params.id);

    const now = new Date();
    const data = { ...(parsed.data as any), last_updated_at: now, last_updated_by: request.currentUserId };
    const pit = await db.updateTable('pits').set(data as any).where('id', '=', request.params.id).returningAll().executeTakeFirst();
    if (!pit) throw new NotFoundError('Grop', request.params.id);

    // Event 2: the pit crossed the 75 % threshold.
    const crossed =
      (pit.fill_level === '75' || pit.fill_level === '100') &&
      (before.fill_level !== '75' && before.fill_level !== '100');
    if (crossed) {
      const recipients = await siteAlertUserIds(pit.site_id);
      await emitAppEvent({
        type: 'pit_alert',
        userIds: recipients,
        title: `Gropen ${pit.name} behöver tömning`,
        message: `Fyllnadsgraden nådde ${pit.fill_level} %.`,
        related_entity_type: 'pit',
        related_entity_id: pit.id,
        site_id: pit.site_id,
        data: { pit_name: pit.name, fill_level: pit.fill_level, alert_threshold: pit.alert_threshold ?? null },
        // The database trigger already inserted the notification rows.
        insertNotifications: false,
      });
    }

    return pit;
  });

  // Empty pit (worker confirms emptying)
  app.post<{ Params: { id: string } }>('/:id/empty', {
    preHandler: requireRole('admin', 'manager', 'worker')
  }, async (request) => {
    const now = new Date();
    const pit = await db
      .updateTable('pits')
      .set({ fill_level: '0', last_emptied_at: now, last_updated_at: now, last_updated_by: request.currentUserId! } as any)
      .where('id', '=', request.params.id)
      .returningAll()
      .executeTakeFirst();
    if (!pit) throw new NotFoundError('Grop', request.params.id);
    return pit;
  });
}