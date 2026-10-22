// Contract tests for the driver execution path (ticket 08).
//
// A driver executes an assigned order step by step: start -> pickup ->
// dropoff -> complete. The container location must move exactly at dropoff,
// and no other driver may execute someone else's order.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { db, closeConnection } from '../db/index.js';
import { cleanTestContainers } from './helpers/testFixtures.js';

let app: FastifyInstance;
let adminToken: string;
let driverToken: string;
let otherDriverToken: string;
let workerToken: string;

let driverId: string;
let driverSiteId: string;
let containerSiteId: string;
let otherDriverId: string;
let orderId: string;
let pickupStopId: string;
let dropoffStopId: string;
let containerId: string;
let dropoffSpotId: string;
let dropoffSiteId: string;
let vehicleId: string;

beforeAll(async () => {
  // Idempotent setup: remove leftovers from an interrupted run.
  await cleanTestContainers('TEST-DRV-');
  app = await buildApp();

  const admin = await db.selectFrom('users').selectAll().where('email', '=', 'admin@avc.local').executeTakeFirstOrThrow();
  adminToken = app.jwt.sign({ id: admin.id, email: admin.email, role: 'admin', type: 'access' as const });

  const driver = await db.selectFrom('users').selectAll().where('email', '=', 'driver1@avc.local').executeTakeFirstOrThrow();
  driverId = driver.id;
  driverSiteId = driver.site_id!;
  driverToken = app.jwt.sign({ id: driver.id, email: driver.email, role: 'driver', type: 'access' as const });

  const other = await db.selectFrom('users').selectAll().where('email', '=', 'driver2@avc.local').executeTakeFirstOrThrow();
  otherDriverId = other.id;
  otherDriverToken = app.jwt.sign({ id: other.id, email: other.email, role: 'driver', type: 'access' as const });

  const worker = await db.selectFrom('users').selectAll().where('email', '=', 'worker1@avc.local').executeTakeFirstOrThrow();
  workerToken = app.jwt.sign({ id: worker.id, email: worker.email, role: 'worker', type: 'access' as const });

  const vehicle = await db.selectFrom('vehicles').selectAll().where('classification', '=', 'transport').executeTakeFirstOrThrow();
  vehicleId = vehicle.id;

  // Pick an active container at the driver's site plus a free spot at another site.
  // Dedicated container: test files run in parallel against the same database,
  // so each file must own its fixtures (a shared container would be moved by
  // the other file mid-test).
  const company = await db.selectFrom('companies').select('id').executeTakeFirstOrThrow();
  const testContainer = await db
    .insertInto('containers')
    .values({
      container_number: 'TEST-DRV-00001',
      qr_code_value: 'TEST-DRV-00001',
      type: 'roll_off',
      owning_company_id: company.id,
      current_site_id: driverSiteId,
      fill_level: '50',
      status: 'active',
    } as any)
    .returningAll()
    .executeTakeFirstOrThrow();
  containerId = testContainer.id;
  containerSiteId = driverSiteId;

  // A spot at another site that is not occupied by a container (the dropoff
  // refuses an occupied spot with 409).
  const spot = await db
    .selectFrom('parking_spots')
    .selectAll()
    .where('zone_id', 'in', db.selectFrom('zones').select('id').where('site_id', '!=', driverSiteId))
    .where('id', 'not in', db.selectFrom('containers').select('current_spot_id').where('current_spot_id', 'is not', null))
    .orderBy('spot_code')
    .executeTakeFirstOrThrow();
  dropoffSpotId = spot.id;
  dropoffSiteId = (await db.selectFrom('zones').select('site_id').where('id', '=', spot.zone_id).executeTakeFirstOrThrow()).site_id;

  // Build a real assigned order through the API (as a manager would).
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/transport-orders',
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    payload: {
      notes: 'Drivertest (testticket 08)',
      stops: [
        { site_id: driverSiteId, stop_type: 'pickup', containers: [{ container_id: containerId }] },
        { site_id: dropoffSiteId, stop_type: 'dropoff', containers: [{ container_id: containerId }] },
      ],
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  orderId = created.json().id;

  const assigned = await app.inject({
    method: 'POST',
    url: `/api/v1/transport-orders/${orderId}/assign`,
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    payload: { assigned_driver_id: driverId, assigned_vehicle_id: vehicleId },
  });
  expect(assigned.statusCode).toBe(200);

  const stops = await db
    .selectFrom('transport_order_stops')
    .selectAll()
    .where('order_id', '=', orderId)
    .orderBy('sequence')
    .execute();
  pickupStopId = stops[0].id;
  dropoffStopId = stops[1].id;
}, 30_000);

afterAll(async () => {
  await db.deleteFrom('transport_order_containers').where('order_id', '=', orderId).execute();
  await db.deleteFrom('transport_order_stops').where('order_id', '=', orderId).execute();
  await db.deleteFrom('transport_orders').where('id', '=', orderId).execute();
  // Remove the dedicated test container.
  await db.deleteFrom('containers').where('id', '=', containerId).execute();
  await app.close();
  await closeConnection();
});

const execute = (body: unknown, tok = driverToken) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/transport-orders/${orderId}/execute`,
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    payload: body as any,
  });

const containerState = () =>
  db.selectFrom('containers').selectAll().where('id', '=', containerId).executeTakeFirstOrThrow();

describe('driver order execution (ticket 08)', () => {
  it('rejects execution by another driver and by a non-driver (403)', async () => {
    const other = await execute({ action: 'start', stop_id: pickupStopId, container_ids: [containerId] }, otherDriverToken);
    expect(other.statusCode).toBe(403);

    const worker = await execute({ action: 'start', stop_id: pickupStopId, container_ids: [containerId] }, workerToken);
    expect(worker.statusCode).toBe(403);
  });

  it('walks the order: start -> pickup -> dropoff -> complete, moving the container at dropoff', async () => {
    // --- start ---
    const start = await execute({ action: 'start', stop_id: pickupStopId, container_ids: [containerId] });
    expect(start.statusCode, `start failed: ${start.body}`).toBe(200);
    let order = await db.selectFrom('transport_orders').selectAll().where('id', '=', orderId).executeTakeFirstOrThrow();
    expect(order.status).toBe('in_progress');
    expect(order.actual_start_at).toBeTruthy();

    // --- pickup (container leaves the site, in transit) ---
    const pickup = await execute({ action: 'pickup', stop_id: pickupStopId, container_ids: [containerId] });
    expect(pickup.statusCode).toBe(200);
    let container = await containerState();
    expect(container.current_site_id).toBeNull();
    expect(container.current_spot_id).toBeNull();

    // --- dropoff (container is placed on the target spot) ---
    const dropoff = await execute({
      action: 'dropoff',
      stop_id: dropoffStopId,
      container_ids: [containerId],
      spot_id: dropoffSpotId,
    });
    expect(dropoff.statusCode).toBe(200);
    container = await containerState();
    expect(container.current_site_id).toBe(dropoffSiteId);
    expect(container.current_spot_id).toBe(dropoffSpotId);

    // --- complete ---
    const complete = await execute({ action: 'complete', stop_id: dropoffStopId, container_ids: [containerId] });
    expect(complete.statusCode).toBe(200);
    order = await db.selectFrom('transport_orders').selectAll().where('id', '=', orderId).executeTakeFirstOrThrow();
    expect(order.status).toBe('completed');
    expect(order.completed_at).toBeTruthy();
  });

  it('requires one parking spot per container at a dropoff (one container per spot)', async () => {
    // A second free spot at the dropoff site for the two-container case.
    const secondSpot = await db
      .selectFrom('parking_spots')
      .selectAll()
      .where('zone_id', 'in', db.selectFrom('zones').select('id').where('site_id', '=', dropoffSiteId))
      .where('id', 'not in', db.selectFrom('containers').select('current_spot_id').where('current_spot_id', 'is not', null))
      .where('id', '!=', dropoffSpotId)
      .executeTakeFirstOrThrow();

    // Put the container back at the pickup site and build a fresh order.
    await db
      .updateTable('containers')
      .set({ current_site_id: containerSiteId, current_spot_id: null })
      .where('id', '=', containerId)
      .execute();

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/transport-orders',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: {
        stops: [
          { site_id: driverSiteId, stop_type: 'pickup', containers: [{ container_id: containerId }] },
          { site_id: dropoffSiteId, stop_type: 'dropoff', containers: [{ container_id: containerId }] },
        ],
      },
    });
    const orderId2 = created.json().id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/transport-orders/${orderId2}/assign`,
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: { assigned_driver_id: driverId, assigned_vehicle_id: vehicleId },
    });
    const stops2 = await db
      .selectFrom('transport_order_stops')
      .selectAll()
      .where('order_id', '=', orderId2)
      .orderBy('sequence')
      .execute();

    await app.inject({
      method: 'POST',
      url: `/api/v1/transport-orders/${orderId2}/execute`,
      headers: { authorization: `Bearer ${driverToken}`, 'content-type': 'application/json' },
      payload: { action: 'start', stop_id: stops2[0].id, container_ids: [containerId] },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/transport-orders/${orderId2}/execute`,
      headers: { authorization: `Bearer ${driverToken}`, 'content-type': 'application/json' },
      payload: { action: 'pickup', stop_id: stops2[0].id, container_ids: [containerId] },
    });

    // Two containers on the SAME spot must be refused (the DB allows one
    // container per spot).
    const second = await db
      .insertInto('containers')
      .values({
        container_number: 'TEST-DRV-00002',
        qr_code_value: 'TEST-DRV-00002',
        type: 'open_top',
        owning_company_id: (await db.selectFrom('companies').select('id').executeTakeFirstOrThrow()).id,
        current_site_id: containerSiteId,
        fill_level: '50',
        status: 'active',
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();
    await db
      .insertInto('transport_order_containers')
      .values([
        { order_id: orderId2, stop_id: stops2[1].id, container_id: containerId },
        { order_id: orderId2, stop_id: stops2[1].id, container_id: second.id },
      ] as any)
      .execute();

    const sameSpot = await app.inject({
      method: 'POST',
      url: `/api/v1/transport-orders/${orderId2}/execute`,
      headers: { authorization: `Bearer ${driverToken}`, 'content-type': 'application/json' },
      payload: {
        action: 'dropoff',
        stop_id: stops2[1].id,
        container_ids: [containerId, second.id],
        container_spots: [
          { container_id: containerId, spot_id: dropoffSpotId },
          { container_id: second.id, spot_id: dropoffSpotId },
        ],
      },
    });
    expect(sameSpot.statusCode).toBe(409);

    // One spot per container works.
    const ok = await app.inject({
      method: 'POST',
      url: `/api/v1/transport-orders/${orderId2}/execute`,
      headers: { authorization: `Bearer ${driverToken}`, 'content-type': 'application/json' },
      payload: {
        action: 'dropoff',
        stop_id: stops2[1].id,
        container_ids: [containerId, second.id],
        container_spots: [
          { container_id: containerId, spot_id: dropoffSpotId },
          { container_id: second.id, spot_id: secondSpot.id },
        ],
      },
    });
    expect(ok.statusCode).toBe(200);

    const placed = await db.selectFrom('containers').selectAll().where('id', 'in', [containerId, second.id]).execute();
    expect(new Set(placed.map((c) => c.current_spot_id)).size).toBe(2);

    await db.deleteFrom('transport_order_containers').where('order_id', '=', orderId2).execute();
    await db.deleteFrom('transport_order_stops').where('order_id', '=', orderId2).execute();
    await db.deleteFrom('transport_orders').where('id', '=', orderId2).execute();
    await db.deleteFrom('containers').where('id', '=', second.id).execute();
  });

  it('refuses to complete while a stop is still open (409)', async () => {
    // The previous test moved the container to the dropoff site — put it back
    // so the new order can pick it up.
    await db
      .updateTable('containers')
      .set({ current_site_id: containerSiteId, current_spot_id: null })
      .where('id', '=', containerId)
      .execute();

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/transport-orders',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: {
        stops: [
          { site_id: driverSiteId, stop_type: 'pickup', containers: [{ container_id: containerId }] },
          { site_id: dropoffSiteId, stop_type: 'dropoff', containers: [{ container_id: containerId }] },
        ],
      },
    });
    const order2 = second.json();
    await app.inject({
      method: 'POST',
      url: `/api/v1/transport-orders/${order2.id}/assign`,
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: { assigned_driver_id: driverId, assigned_vehicle_id: vehicleId },
    });

    const stops = await db
      .selectFrom('transport_order_stops')
      .selectAll()
      .where('order_id', '=', order2.id)
      .orderBy('sequence')
      .execute();

    await app.inject({
      method: 'POST',
      url: `/api/v1/transport-orders/${order2.id}/execute`,
      headers: { authorization: `Bearer ${driverToken}`, 'content-type': 'application/json' },
      payload: { action: 'start', stop_id: stops[0].id, container_ids: [containerId] },
    });

    // Only the pickup stop is done -> complete must be refused.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/transport-orders/${order2.id}/execute`,
      headers: { authorization: `Bearer ${driverToken}`, 'content-type': 'application/json' },
      payload: { action: 'complete', stop_id: stops[1].id, container_ids: [containerId] },
    });
    expect(res.statusCode).toBe(409);

    await db.deleteFrom('transport_order_containers').where('order_id', '=', order2.id).execute();
    await db.deleteFrom('transport_order_stops').where('order_id', '=', order2.id).execute();
    await db.deleteFrom('transport_orders').where('id', '=', order2.id).execute();
  });
});
