// App event bus — the single source for the four events (ADR 0004).
//
//   1. order_assigned   → the driver the order was assigned to
//   2. pit_alert        → the site's workers + managers
//   3. damage_reported  → the managers
//   4. maintenance_due  → the managers
//
// The bus does three things per event:
//   - writes the in-app notification row (one per recipient)
//   - notifies the in-process listeners (WebSocket broadcast, ticket 12)
//   - hands the event to the web-push sender (ticket 13)
//
// Everything that wants to react to an event subscribes here — no route may
// broadcast on its own.
import { db } from '../db/index.js';

export type AppEventType =
  | 'order_assigned'
  | 'pit_alert'
  | 'damage_reported'
  | 'maintenance_due';

export interface AppEvent {
  type: AppEventType;
  /** Recipients (user ids). */
  userIds: string[];
  title: string;
  message?: string;
  related_entity_type?: 'container' | 'pit' | 'transport_order' | 'maintenance_task' | 'swap_request';
  related_entity_id?: string | null;
  /** Site of the event — used for scoping (pit alerts, site dashboards). */
  site_id?: string | null;
  data?: Record<string, unknown>;
}

export interface AppEventInput extends Omit<AppEvent, 'userIds'> {
  userIds: string[];
  /**
   * Set to false when the notification rows are written elsewhere (the
   * `check_pit_alert` database trigger writes the pit rows itself).
   */
  insertNotifications?: boolean;
}

export interface AppEventPayload {
  id: string;
  type: AppEventType;
  title: string;
  message?: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  site_id?: string | null;
  data?: Record<string, unknown>;
  created_at: string;
}

type Listener = (event: AppEventPayload, userIds: string[]) => void | Promise<void>;

const listeners = new Set<Listener>();

/** Subscribes to every event. Returns an unsubscribe function. */
export function onAppEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Emits an event: writes the in-app notifications, then notifies the
 * listeners (WebSocket / web-push).
 */
export async function emitAppEvent(input: AppEventInput): Promise<AppEventPayload> {
  const recipients = [...new Set(input.userIds.filter(Boolean))];

  if (input.insertNotifications !== false && recipients.length > 0) {
    await db
      .insertInto('notifications')
      .values(
        recipients.map((userId) => ({
          user_id: userId,
          type: input.type,
          title: input.title,
          message: input.message ?? null,
          related_entity_type: input.related_entity_type ?? null,
          related_entity_id: input.related_entity_id ?? null,
        })) as any
      )
      .execute();
  }

  const payload: AppEventPayload = {
    id: `${input.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    title: input.title,
    message: input.message,
    related_entity_type: input.related_entity_type,
    related_entity_id: input.related_entity_id,
    site_id: input.site_id ?? null,
    data: input.data,
    created_at: new Date().toISOString(),
  };

  // Web push (ticket 13) — the same event, sent to the recipients' devices.
  // A missing VAPID key or a failing push must never break the request.
  if (recipients.length > 0) {
    try {
      const { sendPushToMultipleUsers } = await import('./pushNotificationService.js');
      await sendPushToMultipleUsers(recipients, {
        title: input.title,
        body: input.message ?? input.title,
        data: {
          type: input.type,
          related_entity_type: input.related_entity_type ?? null,
          related_entity_id: input.related_entity_id ?? null,
          url: input.related_entity_type === 'transport_order' ? '/driver' : '/dashboard',
        },
        requireInteraction: input.type === 'pit_alert' || input.type === 'maintenance_due',
      });
    } catch (err) {
      console.error('Web push delivery failed:', err);
    }
  }

  for (const listener of listeners) {
    try {
      await listener(payload, recipients);
    } catch (err) {
      // A failing listener (e.g. a dead websocket) must not break the request.
      console.error('App event listener failed:', err);
    }
  }

  return payload;
}

/** All users who should receive manager-level events (managers + admins). */
export async function managerUserIds(): Promise<string[]> {
  const rows = await db
    .selectFrom('users')
    .select('id')
    .where('role', 'in', ['manager', 'admin'])
    .where('is_active', '=', true)
    .execute();
  return rows.map((r) => r.id);
}

/** All active workers + managers of a site (the pit-alert recipients). */
export async function siteAlertUserIds(siteId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('users')
    .select('id')
    .where('site_id', '=', siteId)
    .where('role', 'in', ['worker', 'manager'])
    .where('is_active', '=', true)
    .execute();
  return rows.map((r) => r.id);
}
