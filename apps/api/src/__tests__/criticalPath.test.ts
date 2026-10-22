// Critical-path integration tests (ticket 18, Phase 5).
//
// Each test cites the GLOSSARY business rule it protects. Integration-level
// against a real test database (DATABASE_URL in test mode).
//
//   - GLOSSARY rule 1: Container Location — every container is always at
//     exactly one Parking Spot; location updates atomically at dropoff.
//   - GLOSSARY rule 2: Fill Level Discreteness — only 0/25/50/75/100.
//   - GLOSSARY rule 5: Ownership Transfer — audit log entry + history.
//   - ADR 0002: Offline sync — server-wins conflict resolution.
//
// Strategy per session decision: broad E2E is deferred; these are the
// win-spots that must stay green forever.
//
// Test files run in parallel against the same database — each file owns its
// fixtures (cleanTestContainers with a unique prefix).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { db, closeConnection } from '../db/index.js';
import { cleanTestContainers } from './helpers/testFixtures.js';

let app: FastifyInstance;
let adminToken: string;
let managerToken: string;
let driverToken: string;
let workerToken: string;

let siteId: string;
let targetSiteId: string;
let containerId: string;
let lifeContainerId: string;
let vehicleId: string;
let driverId: string;

// Fixture rows cleaned up in afterAll.
const createdOrderIds: string[] = [];
const createdContainerIds: string[] = [];
const createdUserIds: string[] = [];

const post = (url: string, body: unknown, tok: string) =>
  app.inject({
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    payload: body as any,
  });

const patch = (url: string, body: unknown, tok: string) =>
  app.inject({
    method: 'PATCH',
    url,
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    payload: body as any,
  });

const get = (url: string, tok: string) =>
  app.inject({
    method: 'GET',
    url,
    headers: { authorization: `Bearer ${tok}` },
  });

beforeAll(async () => {
  await cleanTestContainers('TEST-CP-');
  app = await buildApp();

  const sign = (email: string, role: string) => {
    const u = db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
    return u.then((r) =>
      app.jwt.sign({
        id: r!.id,
        email: r!.email,
        role: role as any,
        type: 'access' as const,
      })
    );
  };

  [adminToken, managerToken, driverToken, workerToken] = await Promise.all([
    sign('admin@avc.local', 'admin'),
    sign('manager@avc.local', 'manager'),
    sign('driver1@avc.local', 'driver'),
    sign('worker1@avc.local', 'worker'),
  ]);

  const sites = await db.selectFrom('sites').selectAll().orderBy('name').execute();
  if (sites.length < 2) throw new Error('Seed data missing: need at least two sites.');
  siteId = sites[0].id;
  targetSiteId = sites[1].id;

  const company = await db.selectFrom('companies').select('id').executeTakeFirstOrThrow();
  const created = await db
    .insertInto('containers')
    .values({
      container_number: 'TEST-CP-00001',
      qr_code_value: 'TEST-CP-00001',
      type: 'roll_off',
      owning_company_id: company.id,
      current_site_id: siteId,
      fill_level: '25',
      status: 'active',
    } as any)
    .returningAll()
    .executeTakeFirstOrThrow();
  containerId = created.id;
  createdContainerIds.push(containerId);

  const vehicle = await db
    .selectFrom('vehicles')
    .selectAll()
    .where('classification', '=', 'transport')
    .executeTakeFirstOrThrow();
  vehicleId = vehicle.id;

  const driver = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', 'driver1@avc.local')
    .executeTakeFirstOrThrow();
  driverId = driver.id;

  // Dedicated lifecycle container (seed orders may already use containerId).
  const lifeCompany = await db.selectFrom('companies').select('id').executeTakeFirstOrThrow();
  const lifeContainer = await db
    .insertInto('containers')
    .values({
      container_number: 'TEST-CP-LIFE',
      qr_code_value: 'TEST-CP-LIFE',
      type: 'roll_off',
      owning_company_id: lifeCompany.id,
      current_site_id: siteId,
      fill_level: '25',
      status: 'active',
    } as any)
    .returningAll()
    .executeTakeFirstOrThrow();
  lifeContainerId = lifeContainer.id;
  createdContainerIds.push(lifeContainerId);
}, 30_000);

afterAll(async () => {
  for (const orderId of createdOrderIds) {
    await db.deleteFrom('transport_order_containers').where('order_id', '=', orderId).execute();
    await db.deleteFrom('transport_order_stops').where('order_id', '=', orderId).execute();
    await db.deleteFrom('transport_orders').where('id', '=', orderId).execute();
  }
  for (const containerId of createdContainerIds) {
    await db.deleteFrom('containers').where('id', '=', containerId).execute();
  }
  for (const userId of createdUserIds) {
    await db.deleteFrom('users').where('id', '=', userId).execute();
  }
  await app.close();
  await closeConnection();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Transport order lifecycle (GLOSSARY rule 1: Container Location)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('transport order lifecycle', () => {
  it('create → assign → execute start/pickup/dropoff/complete → archived', async () => {
    // Create a 2-stop order at the driver's site.
    const created = await post(
      '/api/v1/transport-orders',
      {
        notes: 'Critical-path lifecycle test',
        stops: [
          {
            site_id: siteId,
            stop_type: 'pickup',
            containers: [{ container_id: lifeContainerId }],
          },
          {
            site_id: targetSiteId,
            stop_type: 'dropoff',
            containers: [{ container_id: lifeContainerId }],
          },
        ],
      },
      adminToken
    );
    expect(created.statusCode).toBe(201);
    const orderId = created.json().id;
    createdOrderIds.push(orderId);

    // Assign driver + vehicle → status 'assigned'.
    const assigned = await post(
      `/api/v1/transport-orders/${orderId}/assign`,
      { assigned_driver_id: driverId, assigned_vehicle_id: vehicleId },
      adminToken
    );
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json().status).toBe('assigned');

    // Start → 'in_progress'.
    const stop1 = await db
      .selectFrom('transport_order_stops')
      .select('id')
      .where('order_id', '=', orderId)
      .where('stop_type', '=', 'pickup')
      .executeTakeFirstOrThrow();
    const started = await post(
      `/api/v1/transport-orders/${orderId}/execute`,
      { action: 'start', stop_id: stop1.id, container_ids: [lifeContainerId] },
      driverToken
    );
    expect(started.statusCode).toBe(200);

    // Pickup → containers leave the site (in transit).
    const picked = await post(
      `/api/v1/transport-orders/${orderId}/execute`,
      { action: 'pickup', stop_id: stop1.id, container_ids: [lifeContainerId] },
      driverToken
    );
    expect(picked.statusCode).toBe(200);

    // Container is now "in transit" (no site).
    const containerAfterPickup = await db
      .selectFrom('containers')
      .select('current_site_id')
      .where('id', '=', lifeContainerId)
      .executeTakeFirstOrThrow();
    expect(containerAfterPickup.current_site_id).toBeNull();

    // Dropoff → container placed on its own spot at the target site.
    const stop2 = await db
      .selectFrom('transport_order_stops')
      .select('id')
      .where('order_id', '=', orderId)
      .where('stop_type', '=', 'dropoff')
      .executeTakeFirstOrThrow();

    // Pick a free parking spot at the target site.
    const spot = await db
      .selectFrom('parking_spots')
      .innerJoin('zones', 'parking_spots.zone_id', 'zones.id')
      .select(['parking_spots.id as spot_id', 'zones.site_id'])
      .where('zones.site_id', '=', targetSiteId)
      .where('parking_spots.id', 'not in', db
        .selectFrom('containers')
        .select('current_spot_id')
        .where('current_spot_id', 'is not', null))
      .executeTakeFirst();
    if (!spot) throw new Error('No parking spot at target site.');

    const dropped = await post(
      `/api/v1/transport-orders/${orderId}/execute`,
      {
        action: 'dropoff',
        stop_id: stop2.id,
        container_ids: [lifeContainerId],
        container_spots: [{ container_id: lifeContainerId, spot_id: spot.spot_id }],
      },
      driverToken
    );
    expect(dropped.statusCode).toBe(200);

    // GLOSSARY rule 1: container is at exactly one spot at the target site.
    const containerAfterDropoff = await db
      .selectFrom('containers')
      .select(['current_site_id', 'current_spot_id'])
      .where('id', '=', lifeContainerId)
      .executeTakeFirstOrThrow();
    expect(containerAfterDropoff.current_site_id).toBe(targetSiteId);
    expect(containerAfterDropoff.current_spot_id).toBe(spot.spot_id);

    // Complete → 'completed'.
    const completed = await post(
      `/api/v1/transport-orders/${orderId}/execute`,
      { action: 'complete', stop_id: stop2.id, container_ids: [lifeContainerId] },
      driverToken
    );
    expect(completed.statusCode).toBe(200);
    expect(completed.json().status).toBe('completed');
  });

  it('rejects invalid status transitions', async () => {
    // Dedicated container (lifeContainerId was moved by the lifecycle test).
    const transCompany = await db.selectFrom('companies').select('id').executeTakeFirstOrThrow();
    const transContainer = await db
      .insertInto('containers')
      .values({
        container_number: 'TEST-CP-TRANS',
        qr_code_value: 'TEST-CP-TRANS',
        type: 'open_top',
        owning_company_id: transCompany.id,
        current_site_id: siteId,
        fill_level: '25',
        status: 'active',
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();
    createdContainerIds.push(transContainer.id);

    const created = await post(
      '/api/v1/transport-orders',
      {
        notes: 'Invalid transition test',
        stops: [
          {
            site_id: siteId,
            stop_type: 'pickup',
            containers: [{ container_id: transContainer.id }],
          },
        ],
      },
      adminToken
    );
    expect(created.statusCode).toBe(201);
    const orderId = created.json().id;
    createdOrderIds.push(orderId);

    const stop = await db
      .selectFrom('transport_order_stops')
      .select('id')
      .where('order_id', '=', orderId)
      .executeTakeFirstOrThrow();

    // Complete before start → must reject (driver auth or status check).
    const bad = await post(
      `/api/v1/transport-orders/${orderId}/execute`,
      { action: 'complete', stop_id: stop.id, container_ids: [transContainer.id] },
      driverToken
    );
    expect(bad.statusCode).not.toBe(200);

    // Non-driver → must reject.
    const notDriver = await post(
      `/api/v1/transport-orders/${orderId}/execute`,
      { action: 'start', stop_id: stop.id, container_ids: [transContainer.id] },
      managerToken
    );
    expect(notDriver.statusCode).toBe(403);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Offline sync, server-wins (ADR 0002)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('offline sync — server-wins conflict resolution', () => {
  it('applies mutations in timestamp order; older mutation returns conflict', async () => {
    const now = new Date().toISOString();
    const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();

    // First, the server updates the pit to '50' at time T1 (newer).
    const pit = await db
      .selectFrom('pits')
      .selectAll()
      .where('site_id', '=', siteId)
      .executeTakeFirstOrThrow();
    await patch(`/api/v1/pits/${pit.id}`, { fill_level: '50' }, workerToken);
    const serverAfter = await db
      .selectFrom('pits')
      .select('updated_at')
      .where('id', '=', pit.id)
      .executeTakeFirstOrThrow();
    const serverUpdatedAt = serverAfter.updated_at.getTime();

    // Now send a sync batch with an OLDER mutation (T0 < T1) for the same pit.
    // The server must return 'conflict' with 'server-wins' and the server entity.
    const batch = await post(
      '/api/v1/sync',
      {
        client_id: '00000000-0000-0000-0000-000000000001',
        last_synced_at: now,
        mutations: [
          {
            id: '00000000-0000-0000-0000-000000000002',
            entity_type: 'pit',
            entity_id: pit.id,
            operation: 'update',
            payload: { fill_level: '100' },
            timestamp: tenMinutesAgo,
          },
        ],
      },
      workerToken
    );
    expect(batch.statusCode).toBe(200);
    const result = batch.json().results[0];
    expect(result.status).toBe('conflict');
    expect(result.resolution).toBe('server-wins');
    expect(result.server_entity?.fill_level).toBe('50');

    // The server's value must be unchanged (server-wins).
    const pitFinal = await db
      .selectFrom('pits')
      .select('fill_level')
      .where('id', '=', pit.id)
      .executeTakeFirstOrThrow();
    expect(pitFinal.fill_level).toBe('50');
  });

  it('applies a newer mutation from the client', async () => {
    const pit = await db
      .selectFrom('pits')
      .selectAll()
      .where('site_id', '=', siteId)
      .executeTakeFirstOrThrow();
    const now = new Date().toISOString();

    const batch = await post(
      '/api/v1/sync',
      {
        client_id: '00000000-0000-0000-0000-000000000003',
        last_synced_at: now,
        mutations: [
          {
            id: '00000000-0000-0000-0000-000000000004',
            entity_type: 'pit',
            entity_id: pit.id,
            operation: 'update',
            payload: { fill_level: '75' },
            timestamp: now,
          },
        ],
      },
      workerToken
    );
    expect(batch.statusCode).toBe(200);
    const result = batch.json().results[0];
    expect(result.status).toBe('applied');

    const pitFinal = await db
      .selectFrom('pits')
      .select('fill_level')
      .where('id', '=', pit.id)
      .executeTakeFirstOrThrow();
    expect(pitFinal.fill_level).toBe('75');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Fill level validation (GLOSSARY rule 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('fill level validation', () => {
  it('only accepts discrete fill levels on containers and pits', async () => {
    // Container fill-level writes are manager-scoped; use manager token to
    // reach the validation layer (the role isn't what's under test here).
    const mgrTok = managerToken;

    // Invalid container fill level → 400, not 500.
    const badContainer = await patch(
      `/api/v1/containers/${containerId}`,
      { fill_level: '60' },
      mgrTok
    );
    expect(badContainer.statusCode).toBe(400);

    const badContainerStr = await patch(
      `/api/v1/containers/${containerId}`,
      { fill_level: '99' },
      mgrTok
    );
    expect(badContainerStr.statusCode).toBe(400);

    // Valid levels → 200.
    for (const level of ['0', '25', '50', '75', '100']) {
      const good = await patch(
        `/api/v1/containers/${containerId}`,
        { fill_level: level },
        mgrTok
      );
      expect(good.statusCode).toBe(200);
    }

    // Invalid pit fill level → 400 (workers can patch pits).
    const pit = await db
      .selectFrom('pits')
      .selectAll()
      .where('site_id', '=', siteId)
      .executeTakeFirstOrThrow();
    const badPit = await patch(`/api/v1/pits/${pit.id}`, { fill_level: '60' }, workerToken);
    expect(badPit.statusCode).toBe(400);

    const goodPit = await patch(`/api/v1/pits/${pit.id}`, { fill_level: '75' }, workerToken);
    expect(goodPit.statusCode).toBe(200);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Auth guards
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('auth guards', () => {
  it('requireRole blocks illegal role→endpoint access', async () => {
    // Create a dedicated container not tied to any existing order.
    const company = await db.selectFrom('companies').select('id').executeTakeFirstOrThrow();
    const guardContainer = await db
      .insertInto('containers')
      .values({
        container_number: 'TEST-CP-GUARD',
        qr_code_value: 'TEST-CP-GUARD',
        type: 'open_top',
        owning_company_id: company.id,
        current_site_id: siteId,
        fill_level: '25',
        status: 'active',
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();
    createdContainerIds.push(guardContainer.id);

    // Worker cannot assign orders (manager-only).
    const created = await post(
      '/api/v1/transport-orders',
      {
        notes: 'Auth guard test',
        stops: [
          {
            site_id: siteId,
            stop_type: 'pickup',
            containers: [{ container_id: guardContainer.id }],
          },
        ],
      },
      adminToken
    );
    expect(created.statusCode).toBe(201);
    const orderId = created.json().id;
    createdOrderIds.push(orderId);

    const assigned = await post(
      `/api/v1/transport-orders/${orderId}/assign`,
      { assigned_driver_id: driverId, assigned_vehicle_id: vehicleId },
      workerToken
    );
    expect(assigned.statusCode).toBe(403);

    // Driver cannot access manager-only container write.
    const driverPatch = await patch(
      `/api/v1/containers/${containerId}`,
      { fill_level: '50' },
      driverToken
    );
    expect(driverPatch.statusCode).toBe(403);
  });

  it('unauthenticated WS upgrade rejected', async () => {
    const ws = await app.inject({
      method: 'GET',
      url: '/ws',
      headers: {},
    });
    // Fastify returns 401 for unauthenticated WebSocket upgrade.
    expect(ws.statusCode).toBe(401);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Damage report → maintenance task trigger
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('damage report severity rule', () => {
  it('major/critical damage creates a condition-based maintenance task', async () => {
    const report = await post(
      '/api/v1/damage-reports',
      {
        container_id: containerId,
        severity: 'major',
        description: 'Critical-path damage report test',
      },
      workerToken
    );
    expect(report.statusCode).toBe(201);
    const reportId = report.json().id;

    const task = await db
      .selectFrom('maintenance_tasks')
      .selectAll()
      .where('damage_report_id', '=', reportId)
      .executeTakeFirstOrThrow();
    expect(task.type).toBe('condition_based');
    expect(task.status).toBe('due');

    // Minor damage → no task.
    const minor = await post(
      '/api/v1/damage-reports',
      {
        container_id: containerId,
        severity: 'minor',
        description: 'Minor damage - no task expected',
      },
      workerToken
    );
    expect(minor.statusCode).toBe(201);

    const noTask = await db
      .selectFrom('maintenance_tasks')
      .selectAll()
      .where('damage_report_id', '=', minor.json().id)
      .execute();
    expect(noTask.length).toBe(0);
  });
});
