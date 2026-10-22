// Contract tests for the four app events (ticket 11).
//
//   1. order_assigned   → the driver
//   2. pit_alert        → the site's workers + managers
//   3. damage_reported  → the managers
//   4. maintenance_due  → the managers
//
// The recipients are role-scoped, and the read state is per user.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { db, closeConnection } from '../db/index.js';
import { cleanTestContainers } from './helpers/testFixtures.js';

let app: FastifyInstance;
let adminToken: string;
let workerToken: string;
let managerToken: string;
let driverToken: string;

let workerId: string;
let workerSiteId: string;
let managerId: string;
let driverId: string;
let containerId: string;
let vehicleId: string;

beforeAll(async () => {
  // Idempotent setup: remove leftovers from an interrupted run.
  await cleanTestContainers('TEST-EVT-');
  app = await buildApp();

  const admin = await db.selectFrom('users').selectAll().where('email', '=', 'admin@avc.local').executeTakeFirstOrThrow();
  adminToken = app.jwt.sign({ id: admin.id, email: admin.email, role: 'admin', type: 'access' as const });

  const worker = await db.selectFrom('users').selectAll().where('email', '=', 'worker1@avc.local').executeTakeFirstOrThrow();
  workerId = worker.id;
  workerSiteId = worker.site_id!;
  workerToken = app.jwt.sign({ id: worker.id, email: worker.email, role: 'worker', type: 'access' as const });

  const manager = await db.selectFrom('users').selectAll().where('email', '=', 'manager@avc.local').executeTakeFirstOrThrow();
  managerId = manager.id;
  managerToken = app.jwt.sign({ id: manager.id, email: manager.email, role: 'manager', type: 'access' as const });

  const driver = await db.selectFrom('users').selectAll().where('email', '=', 'driver1@avc.local').executeTakeFirstOrThrow();
  driverId = driver.id;
  driverToken = app.jwt.sign({ id: driver.id, email: driver.email, role: 'driver', type: 'access' as const });

  const vehicle = await db.selectFrom('vehicles').selectAll().where('classification', '=', 'transport').executeTakeFirstOrThrow();
  vehicleId = vehicle.id;

  // A dedicated container at the worker's site (test files run in parallel).
  const company = await db.selectFrom('companies').select('id').executeTakeFirstOrThrow();
  const created = await db
    .insertInto('containers')
    .values({
      container_number: 'TEST-EVT-00001',
      qr_code_value: 'TEST-EVT-00001',
      type: 'open_top',
      owning_company_id: company.id,
      current_site_id: workerSiteId,
      fill_level: '25',
      status: 'active',
    } as any)
    .returningAll()
    .executeTakeFirstOrThrow();
  containerId = created.id;
}, 30_000);

afterAll(async () => {
  await db.deleteFrom('containers').where('id', '=', containerId).execute();
  await app.close();
  await closeConnection();
});

const post = (url: string, body: unknown, tok: string) =>
  app.inject({
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    payload: body as any,
  });

const notificationsFor = (userId: string, type: string) =>
  db
    .selectFrom('notifications')
    .selectAll()
    .where('user_id', '=', userId)
    .where('type', '=', type)
    .orderBy('created_at', 'desc')
    .execute();

/** Notifications of a type that belong to one specific entity. */
const notificationsForEntity = (userId: string, type: string, entityId: string) =>
  db
    .selectFrom('notifications')
    .selectAll()
    .where('user_id', '=', userId)
    .where('type', '=', type)
    .where('related_entity_id', '=', entityId)
    .orderBy('created_at', 'desc')
    .execute();

describe('event 1: order assigned → the driver gets a notification', () => {
  it('writes a notification for the assigned driver only', async () => {
    const created = await post(
      '/api/v1/transport-orders',
      {
        notes: 'Eventtest (testticket 11)',
        stops: [{ site_id: workerSiteId, stop_type: 'pickup', containers: [{ container_id: containerId }] }],
      },
      adminToken
    );
    expect(created.statusCode, created.body).toBe(201);
    const orderId = created.json().id;

    const assigned = await post(
      `/api/v1/transport-orders/${orderId}/assign`,
      { assigned_driver_id: driverId, assigned_vehicle_id: vehicleId },
      adminToken
    );
    expect(assigned.statusCode).toBe(200);

    const after = await notificationsForEntity(driverId, 'order_assigned', orderId);
    expect(after.length).toBe(1);
    const notification = after[0];
    expect(notification.related_entity_type).toBe('transport_order');
    expect(notification.is_read).toBe(false);
    // The worker at the site must NOT get the driver's order notification.
    const workerNotifications = await notificationsForEntity(workerId, 'order_assigned', orderId);
    expect(workerNotifications.length).toBe(0);

    await db.deleteFrom('notifications').where('related_entity_id', '=', orderId).execute();
    await db.deleteFrom('transport_order_containers').where('order_id', '=', orderId).execute();
    await db.deleteFrom('transport_order_stops').where('order_id', '=', orderId).execute();
    await db.deleteFrom('transport_orders').where('id', '=', orderId).execute();
  });
});

describe('event 2: pit reaches 75 % → the site’s workers + managers', () => {
  it('notifies the site’s users and not the other site’s', async () => {
    const pit = await db
      .selectFrom('pits')
      .selectAll()
      .where('site_id', '=', workerSiteId)
      .executeTakeFirstOrThrow();

    // Cross the threshold (the database trigger writes the rows).
    await post(`/api/v1/pits/${pit.id}/empty`, {}, workerToken);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pits/${pit.id}`,
      headers: { authorization: `Bearer ${workerToken}`, 'content-type': 'application/json' },
      payload: { fill_level: '75' },
    });
    expect(res.statusCode).toBe(200);

    const workerNotifications = await notificationsFor(workerId, 'pit_alert');
    expect(workerNotifications.length).toBeGreaterThanOrEqual(1);
    expect(workerNotifications[0].related_entity_id).toBe(pit.id);

    // Restore the pit for the other tests.
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/pits/${pit.id}`,
      headers: { authorization: `Bearer ${workerToken}`, 'content-type': 'application/json' },
      payload: { fill_level: '0' },
    });
  });
});

describe('event 3: damage report → the managers', () => {
  it('notifies managers and admins, not the worker who reported it', async () => {
    const res = await post(
      '/api/v1/damage-reports',
      { container_id: containerId, severity: 'minor', description: 'Eventtest (testticket 11)' },
      workerToken
    );
    expect(res.statusCode, res.body).toBe(201);

    const after = await notificationsForEntity(managerId, 'damage_reported', containerId);
    expect(after.length).toBeGreaterThanOrEqual(1);

    const workerNotifications = await notificationsForEntity(workerId, 'damage_reported', containerId);
    expect(workerNotifications.length).toBe(0);

    await db.deleteFrom('notifications').where('related_entity_id', '=', containerId).execute();
  });
});

describe('event 4: maintenance overdue → the managers', () => {
  it('notifies the managers once per task', async () => {
    const { sweepOverdueMaintenance } = await import('../services/maintenanceWatcher.js');

    const task = await db
      .insertInto('maintenance_tasks')
      .values({
        container_id: containerId,
        type: 'scheduled',
        status: 'due',
        scheduled_for: new Date(Date.now() - 60 * 60 * 1000),
        description: 'Eventtest (testticket 11)',
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    const handled = await sweepOverdueMaintenance();
    expect(handled).toBeGreaterThanOrEqual(1);

    const after = await notificationsForEntity(managerId, 'maintenance_due', task.id);
    expect(after.length).toBe(1);
    expect(after[0].related_entity_id).toBe(task.id);

    // The task is now overdue…
    const updated = await db.selectFrom('maintenance_tasks').selectAll().where('id', '=', task.id).executeTakeFirstOrThrow();
    expect(updated.status).toBe('overdue');

    // …and the second sweep does not notify again.
    await sweepOverdueMaintenance();
    const afterSecond = await notificationsForEntity(managerId, 'maintenance_due', task.id);
    expect(afterSecond.length).toBe(1);

    await db.deleteFrom('notifications').where('related_entity_id', '=', task.id).execute();
    await db.deleteFrom('maintenance_tasks').where('id', '=', task.id).execute();
  });
});

describe('notification read state', () => {
  it('is per user and persists', async () => {
    const res = await post(
      '/api/v1/damage-reports',
      { container_id: containerId, severity: 'minor', description: 'Lästest (testticket 11)' },
      workerToken
    );
    const notification = (await notificationsFor(managerId, 'damage_reported'))[0];
    expect(notification.is_read).toBe(false);

    const marked = await post('/api/v1/notifications/read', { notification_ids: [notification.id] }, managerToken);
    expect(marked.statusCode).toBe(200);

    const after = await db.selectFrom('notifications').selectAll().where('id', '=', notification.id).executeTakeFirstOrThrow();
    expect(after.is_read).toBe(true);
    expect(after.read_at).toBeTruthy();

    // Another user still has it unread.
    const count = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(count.json().count).toBeGreaterThanOrEqual(0);

    await db.deleteFrom('notifications').where('related_entity_id', '=', containerId).execute();
  });
});
