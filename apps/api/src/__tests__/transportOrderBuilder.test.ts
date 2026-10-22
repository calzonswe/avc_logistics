// Contract tests for the manager transport-order builder (ticket 07).
//
// The documented contract requires at least one stop, and every stop must
// carry at least one container. Before this ticket the API used the raw
// request body, so a stop without containers was silently accepted (201) and
// the UI could never build a valid order.
//
// Covered here:
//  - order creation rejects a stop without containers / an empty stop list
//  - a valid 2-stop order is persisted with ordered stops + container links
//  - assignment (driver + vehicle) moves the order to 'assigned'
//  - /suggest groups containers at >= 75% fill level per site
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { db, closeConnection } from '../db/index.js';
import { cleanTestContainers } from './helpers/testFixtures.js';

let app: FastifyInstance;
let token: string;

let siteId: string;
let targetSiteId: string;
let containerId: string;
let targetContainerId: string;
let driverId: string;
let vehicleId: string;

// Created rows, removed in afterAll.
const createdOrderIds: string[] = [];

beforeAll(async () => {
  // Idempotent setup: remove leftovers from an interrupted run.
  await cleanTestContainers('TEST-BLD-');
  app = await buildApp();

  const admin = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', 'admin@avc.local')
    .executeTakeFirstOrThrow();
  token = app.jwt.sign({ id: admin.id, email: admin.email, role: 'admin', type: 'access' as const });

  const sites = await db.selectFrom('sites').selectAll().orderBy('name').execute();
  if (sites.length < 2) throw new Error('Seed data missing: need at least two sites.');
  siteId = sites[0].id;
  targetSiteId = sites[1].id;

  // Dedicated containers: test files run in parallel against the same database,
  // so each file owns its fixtures.
  const company = await db.selectFrom('companies').select('id').executeTakeFirstOrThrow();
  const created = await db
    .insertInto('containers')
    .values([
      {
        container_number: 'TEST-BLD-00001',
        qr_code_value: 'TEST-BLD-00001',
        type: 'roll_off',
        owning_company_id: company.id,
        current_site_id: siteId,
        fill_level: '50',
        status: 'active',
      },
      {
        container_number: 'TEST-BLD-00002',
        qr_code_value: 'TEST-BLD-00002',
        type: 'open_top',
        owning_company_id: company.id,
        current_site_id: siteId,
        fill_level: '50',
        status: 'active',
      },
    ] as any)
    .returningAll()
    .execute();
  containerId = created[0].id;
  targetContainerId = created[1].id;

  const driver = await db
    .selectFrom('users')
    .selectAll()
    .where('role', '=', 'driver')
    .where('is_active', '=', true)
    .executeTakeFirst();
  if (!driver) throw new Error('Seed data missing: need an active driver.');
  driverId = driver.id;

  const vehicle = await db
    .selectFrom('vehicles')
    .selectAll()
    .where('classification', '=', 'transport')
    .executeTakeFirst();
  if (!vehicle) throw new Error('Seed data missing: need a transport vehicle.');
  vehicleId = vehicle.id;
}, 30_000);

afterAll(async () => {
  for (const id of createdOrderIds) {
    await db.deleteFrom('transport_order_containers').where('order_id', '=', id).execute();
    await db.deleteFrom('transport_order_stops').where('order_id', '=', id).execute();
    await db.deleteFrom('transport_orders').where('id', '=', id).execute();
  }
  // Remove the dedicated test containers.
  for (const id of [containerId, targetContainerId]) {
    await db.deleteFrom('containers').where('id', '=', id).execute();
  }
  await app.close();
  await closeConnection();
});

const post = (url: string, body: unknown, tok = token) =>
  app.inject({
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    payload: body as any,
  });

describe('POST /api/v1/transport-orders — order builder contract', () => {
  it('rejects a stop without containers with 400 (never a 500, never a silent 201)', async () => {
    const res = await post('/api/v1/transport-orders', {
      stops: [{ site_id: siteId, stop_type: 'pickup', containers: [] }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: expect.stringMatching(/VALIDATION|BAD_REQUEST/) } });
  });

  it('rejects an order without stops with 400', async () => {
    const res = await post('/api/v1/transport-orders', { stops: [] });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a stop with an unknown container with 404', async () => {
    const res = await post('/api/v1/transport-orders', {
      stops: [
        {
          site_id: siteId,
          stop_type: 'pickup',
          containers: [{ container_id: '00000000-0000-0000-0000-000000000000' }],
        },
      ],
    });
    expect(res.statusCode).toBe(404);
  });

  it('creates a 2-stop order and persists ordered stops + container links', async () => {
    const res = await post('/api/v1/transport-orders', {
      notes: 'Testorder (testticket 07)',
      stops: [
        { site_id: siteId, stop_type: 'pickup', containers: [{ container_id: containerId }] },
        { site_id: targetSiteId, stop_type: 'dropoff', containers: [{ container_id: containerId }] },
      ],
    });
    expect(res.statusCode, res.body).toBe(201);
    const order = res.json();
    createdOrderIds.push(order.id);
    expect(order.status).toBe('planned');
    expect(order.order_number).toMatch(/^TO-\d{4}-\d{5}$/);

    const stops = await db
      .selectFrom('transport_order_stops')
      .selectAll()
      .where('order_id', '=', order.id)
      .orderBy('sequence')
      .execute();
    expect(stops).toHaveLength(2);
    expect(stops[0]).toMatchObject({ sequence: 1, stop_type: 'pickup', site_id: siteId });
    expect(stops[1]).toMatchObject({ sequence: 2, stop_type: 'dropoff', site_id: targetSiteId });

    const links = await db
      .selectFrom('transport_order_containers')
      .selectAll()
      .where('order_id', '=', order.id)
      .execute();
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.container_id === containerId)).toBe(true);
  });
});

describe('POST /api/v1/transport-orders/:id/assign', () => {
  it('assigns driver + vehicle and moves the order to assigned', async () => {
    const created = await post('/api/v1/transport-orders', {
      stops: [{ site_id: siteId, stop_type: 'pickup', containers: [{ container_id: containerId }] }],
    });
    expect(created.statusCode, created.body).toBe(201);
    const orderId = created.json().id;
    createdOrderIds.push(orderId);

    const res = await post(`/api/v1/transport-orders/${orderId}/assign`, {
      assigned_driver_id: driverId,
      assigned_vehicle_id: vehicleId,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'assigned',
      assigned_driver_id: driverId,
      assigned_vehicle_id: vehicleId,
    });

    // Assigning twice is not a legal move.
    const again = await post(`/api/v1/transport-orders/${orderId}/assign`, {
      assigned_driver_id: driverId,
      assigned_vehicle_id: vehicleId,
    });
    expect(again.statusCode).toBe(409);
  });

  it('rejects a non-driver user id with 400/404', async () => {
    const created = await post('/api/v1/transport-orders', {
      stops: [{ site_id: siteId, stop_type: 'pickup', containers: [{ container_id: containerId }] }],
    });
    const orderId = created.json().id;
    createdOrderIds.push(orderId);

    const manager = await db
      .selectFrom('users')
      .select('id')
      .where('role', '=', 'manager')
      .executeTakeFirstOrThrow();

    const res = await post(`/api/v1/transport-orders/${orderId}/assign`, {
      assigned_driver_id: manager.id,
      assigned_vehicle_id: vehicleId,
    });
    expect([400, 404]).toContain(res.statusCode);
    expect(res.json().error).toBeDefined();
  });
});

describe('POST /api/v1/transport-orders/suggest', () => {
  it('groups containers at >= 75% fill level per site', async () => {
    // Make sure the scenario exists: one container at 75% on the first site.
    const before = await db
      .selectFrom('containers')
      .select('id')
      .where('current_site_id', '=', siteId)
      .where('fill_level', 'in', ['75', '100'])
      .execute();
    expect(before.length).toBeGreaterThanOrEqual(1);

    const res = await post('/api/v1/transport-orders/suggest', {});
    expect(res.statusCode).toBe(200);
    const suggestions = res.json().suggestions ?? [];
    expect(suggestions.length).toBeGreaterThanOrEqual(1);

    const group = suggestions.find((s: any) => s.fromSiteId === siteId);
    expect(group).toBeTruthy();
    expect(group.containerCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(group.containers)).toBe(true);
    // Every suggested container is at the 75%/100% threshold.
    expect(group.containers.every((c: any) => ['75', '100'].includes(c.fill_level))).toBe(true);
    // A destination site is proposed so the planner can accept the suggestion.
    expect(group.toSiteId).toBeTruthy();
    expect(group.toSiteId).not.toBe(group.fromSiteId);
  });
});
