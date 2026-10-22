// Push Notification Routes
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { pushSubscriptionSchema, pushNotificationPayloadSchema } from '@avc/shared-types/api.js';
import { requireRole } from '../middleware/auth.js';
import {
  savePushSubscription,
  removePushSubscription,
  sendPushToUser,
  sendPushToMultipleUsers,
  NotificationTemplates,
  getUserPushSubscription,
} from '../services/pushNotificationService.js';

export async function pushNotificationRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {

  // Public configuration for the browser: the VAPID public key and whether
  // web push is configured at all.
  app.get('/config', async () => {
    const { isPushEnabled } = await import('../services/pushNotificationService.js');
    const { config } = await import('../config/index.js');
    return {
      enabled: isPushEnabled(),
      public_key: isPushEnabled() ? config.VAPID_PUBLIC_KEY : '',
    };
  });

  // Subscribe to push notifications
  app.post<{ Body: z.infer<typeof pushSubscriptionSchema> }>(
    '/subscribe',
    async (request, reply) => {
      const subscription = request.body;
      const userId = request.user!.id;

      try {
        await savePushSubscription(userId, subscription);
        return reply.send({ success: true });
      } catch (error) {
        console.error('Failed to save push subscription:', error);
        return reply.status(500).send({ error: 'Failed to save subscription' });
      }
    }
  );

  // Unsubscribe from push notifications
  app.post('/unsubscribe', async (request, reply) => {
    const userId = request.user!.id;

    try {
      await removePushSubscription(userId);
      return reply.send({ success: true });
    } catch (error) {
      console.error('Failed to remove push subscription:', error);
      return reply.status(500).send({ error: 'Failed to remove subscription' });
    }
  });

  // Get current subscription status
  app.get('/subscription', async (request) => {
    const userId = request.user!.id;
    const subscription = await getUserPushSubscription(userId);
    return { subscribed: !!subscription };
  });

  // Send test notification
  app.post<{ Body: z.infer<typeof pushNotificationPayloadSchema> }>(
    '/test',
    async (request, reply) => {
      const userId = request.user!.id;
      const { title, body, data, requireInteraction, icon, badge, actions, silent, timestamp } = request.body;

      const payload = {
        title,
        body,
        data,
        requireInteraction,
        icon,
        badge,
        actions,
        silent,
        timestamp,
      };

      const success = await sendPushToUser(userId, payload);

      if (success) {
        return reply.send({ success: true, message: 'Test notification sent' });
      } else {
        return reply.status(500).send({ success: false, message: 'Failed to send notification' });
      }
    }
  );

  // Send notification to multiple users (admin/manager only)
  app.post<{ Body: { userIds: string[]; payload: z.infer<typeof pushNotificationPayloadSchema> } }>(
    '/send',
    { preHandler: requireRole('admin', 'manager') },
    async (request, reply) => {
      const { userIds, payload } = request.body;

      const result = await sendPushToMultipleUsers(userIds, payload);
      return reply.send({ success: true, sent: result.success, failed: result.failed });
    }
  );

  // Send template notification
  app.post<{ Body: { userIds: string[]; template: string; params: Record<string, any> } }>(
    '/template',
    { preHandler: requireRole('admin', 'manager') },
    async (request, reply) => {
      const { userIds, template, params } = request.body;

      const templateFn = NotificationTemplates[template as keyof typeof NotificationTemplates];
      if (!templateFn) {
        return reply.status(400).send({ error: 'Invalid template' });
      }

      const paramsArray = Object.values(params) as [string, string, string?];
      const payload = templateFn(paramsArray[0], paramsArray[1], paramsArray[2] ?? '""');

      const result = await sendPushToMultipleUsers(userIds, payload);

      return reply.send({ success: true, sent: result.success, failed: result.failed });
    }
  );

}