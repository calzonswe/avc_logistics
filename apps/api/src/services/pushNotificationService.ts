// Push Notification Service - Server-side Web Push
import webpush from 'web-push';
import { config } from '../config/index.js';
import { db } from '../db/index.js';
import type { PushSubscription } from '@avc/shared-types/api.js';

/**
 * Web push is optional: without VAPID keys the app must still run (the
 * in-app notifications work) — so the initialisation is skipped and the send
 * functions report "disabled" instead of throwing.
 */
export const isPushEnabled = (): boolean =>
  Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);

if (isPushEnabled()) {
  webpush.setVapidDetails(
    config.VAPID_SUBJECT,
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('VAPID keys are not configured — web push is disabled (in-app notifications still work).');
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, any>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  requireInteraction?: boolean;
  silent?: boolean;
  timestamp?: number;
}

export async function savePushSubscription(userId: string, subscription: PushSubscriptionData): Promise<void> {
  await db
    .insertInto('push_subscriptions')
    .values({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    } as any)
    .onConflict((oc) => oc.column('user_id').doUpdateSet({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    }))
    .execute();
}

export async function removePushSubscription(userId: string): Promise<void> {
  await db
    .deleteFrom('push_subscriptions')
    .where('user_id', '=', userId)
    .execute();
}

export async function getUserPushSubscription(userId: string): Promise<PushSubscriptionData | null> {
  const sub = await db
    .selectFrom('push_subscriptions')
    .select(['endpoint', 'p256dh', 'auth'])
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (!sub) return null;

  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };
}

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<boolean> {
  if (!isPushEnabled()) return false;
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (error) {
    if (error instanceof webpush.WebPushError && error.statusCode === 410) {
      // Subscription expired or invalid - remove it
      console.warn('Push subscription expired, should be removed');
      return false;
    }
    console.error('Failed to send push notification:', error);
    return false;
  }
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<boolean> {
  if (!isPushEnabled()) return false;
  const subscription = await getUserPushSubscription(userId);
  if (!subscription) {
    console.warn(`No push subscription found for user ${userId}`);
    return false;
  }
  return sendPushNotification(subscription, payload);
}

export async function sendPushToMultipleUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const userId of userIds) {
    const successSent = await sendPushToUser(userId, payload);
    if (successSent) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}

// Predefined notification types
export const NotificationTemplates = {
  containerFull: (containerNumber: string, siteName: string) => ({
    title: 'Container Full',
    body: `Container ${containerNumber} at ${siteName} has reached 100% capacity`,
    icon: '/icons/container-full.png',
    badge: '/icons/badge.png',
    data: { type: 'container_full', action: 'view_container' },
    requireInteraction: true,
  }),

  pitAlert: (pitName: string, siteName: string, fillLevel: string) => ({
    title: 'Pit Alert',
    body: `Pit ${pitName} at ${siteName} is at ${fillLevel}% capacity`,
    icon: '/icons/pit-alert.png',
    badge: '/icons/badge.png',
    data: { type: 'pit_alert', action: 'view_pit' },
    requireInteraction: true,
  }),

  maintenanceDue: (containerNumber: string, siteName: string) => ({
    title: 'Maintenance Due',
    body: `Container ${containerNumber} at ${siteName} is due for maintenance`,
    icon: '/icons/maintenance.png',
    badge: '/icons/badge.png',
    data: { type: 'maintenance_due', action: 'view_maintenance' },
    requireInteraction: false,
  }),

  transportOrderAssigned: (orderNumber: string) => ({
    title: 'New Transport Order',
    body: `You have been assigned to transport order ${orderNumber}`,
    icon: '/icons/transport.png',
    badge: '/icons/badge.png',
    data: { type: 'transport_order', action: 'view_order' },
    requireInteraction: true,
  }),

  transportOrderStarted: (orderNumber: string) => ({
    title: 'Transport Started',
    body: `Transport order has been started`,
    icon: '/icons/transport.png',
    badge: '/icons/badge.png',
    data: { type: 'transport_started', action: 'view_order' },
    requireInteraction: false,
  }),

  transportOrderCompleted: (orderNumber: string) => ({
    title: 'Transport Completed',
    body: `Transport order ${orderNumber} has been completed`,
    icon: '/icons/transport-complete.png',
    badge: '/icons/badge.png',
    data: { type: 'transport_completed', action: 'view_order' },
    requireInteraction: false,
  }),

  pitNeedsEmptying: (pitName: string, siteName: string) => ({
    title: 'Pit Needs Emptying',
    body: `Pit ${pitName} at ${siteName} has reached 75% capacity and needs emptying`,
    icon: '/icons/pit-alert.png',
    badge: '/icons/badge.png',
    data: { type: 'pit_needs_emptying', action: 'view_pit' },
    requireInteraction: true,
  }),

  containerNeedsTransport: (containerNumber: string, siteName: string) => ({
    title: 'Container Needs Transport',
    body: `Container ${containerNumber} at ${siteName} is at 75%+ capacity`,
    icon: '/icons/container-full.png',
    badge: '/icons/badge.png',
    data: { type: 'container_needs_transport', action: 'view_container' },
    requireInteraction: true,
  }),

  systemAlert: (title: string, body: string) => ({
    title,
    body,
    icon: '/icons/alert.png',
    badge: '/icons/badge.png',
    data: { type: 'system_alert' },
    requireInteraction: true,
  }),
};