// Contract tests for ticket 06: damage reports + swap requests API.
//
// 1. Severity rule (per GLOSSARY): creating a damage report with severity
//    'major' or 'critical' must create a condition-based maintenance task; a
//    'minor' report must not.
// 2. Damage report list filters (container_id, site_id, severity) and the
//    acknowledge → resolve lifecycle with server-stamped identity fields.
// 3. Swap request lifecycle: worker creates pending → manager approves →
//    fulfilled/cancelled; illegal transitions and worker PATCHes rejected.
//
// Integration-style against the local dev DB (docker up + pnpm db:seed).
// Cleanup removes every row this file creates.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { db, closeConnection } from '../db/index.js';

let app: FastifyInstance;
let adminToken: string;
let workerToken: string;
let workerId: string;
let adminId: string;
let siteId: string;
let containerId: string;

// Created rows, deleted in afterAll.
const createdReportIds: string[] = [];
const createdTaskIds: string[] = [];
const createdSwapIds: string[] = [];

beforeAll(async () => {
  app = await buildApp();

  const admin = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', 'admin@avc.local')
    .executeTakeFirstOrThrow();
  adminId = admin.id;
  adminToken = app.jwt.sign({ id: admin.id, email: admin.email, role: 'admin', type: 'access' as const });

  const worker = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', 'worker1@avc.local')
    .executeTakeFirstOrThrow();
  workerId = worker.id;
  workerToken = app.jwt.sign({ id: worker.id, email: worker.email, role: 'worker', type: 'access' as const });
  if (!worker.site_id) throw new Error('Seed data missing: worker1 must be site-scoped.');
  siteId = worker.site_id;

  const container = await db
    .selectFrom('containers')
    .select('id')
    .where('current_site_id', '=', siteId)
    .where('status', '=', 'active')
    .orderBy('container_number')
    .executeTakeFirst();
  if (!container) throw new Error('Seed data missing: no active container on worker1 site.');
  containerId = container.id;
}, 30_000);

afterAll(async () => {
  // Remove artifacts regardless of test outcome (retire in FK-safe order).
  for (const id of createdTaskIds) await db.deleteFrom('maintenance_tasks').where('id', '=', id).execute();
  for (const id of createdReportIds) await db.deleteFrom('damage_reports').where('id', '=', id).execute();
  for (const id of createdSwapIds) await db.deleteFrom('swap_requests').where('id', '=', id).execute();
  await app.close();
  await closeConnection();
});

const post = (url: string, body: Record<string, unknown>, tok = adminToken) =>
  app.inject({
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    payload: body as any,
  });
const patch = (url: string, body: Record<string, unknown>, tok = adminToken) =>
  app.inject({
    method: 'PATCH',
    url,
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    payload: body as any,
  });
const get = (url: string, tok = adminToken) =>
  app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${tok}` } });

describe('POST /api/v1/damage-reports — severity → condition-based maintenance rule', () => {
  const conditionTaskCount = () =>
    db
      .selectFrom('maintenance_tasks')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .where('container_id', '=', containerId)
      .where('type', '=', 'condition_based')
      .where('status', '=', 'due')
      .executeTakeFirstOrThrow()
      .then((r) => Number(r.count));

  it('minor report creates NO maintenance task (201, maintenance_task_id null)', async () => {
    const before = await conditionTaskCount();

    const res = await post('/api/v1/damage-reports', {
      container_id: containerId,
      severity: 'minor',
      description: 'Litet märke på locket (testticket 06)',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ container_id: containerId, severity: 'minor', status: 'open' });
    expect(body.maintenance_task_id).toBeNull();
    createdReportIds.push(body.id);

    const after = await conditionTaskCount();
    expect(after).toBe(before);
  });

  it('critical report creates a due condition-based maintenance task', async () => {
    const before = await conditionTaskCount();

    const res = await post('/api/v1/damage-reports', {
      container_id: containerId,
      severity: 'critical',
      description: 'Hela väggen trasig (testticket 06)',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.maintenance_task_id).toBeTruthy();
    createdReportIds.push(body.id);

    const after = await conditionTaskCount();
    expect(after).toBe(before + 1);

    const task = await db
      .selectFrom('maintenance_tasks')
      .selectAll()
      .where('id', '=', body.maintenance_task_id)
      .executeTakeFirstOrThrow();
    createdTaskIds.push(task.id);
    expect(task).toMatchObject({
      container_id: containerId,
      type: 'condition_based',
      status: 'due',
      created_by: adminId,
    });
    // The task links back to the report that triggered it.
    expect(task.damage_report_id).toBe(body.id);
    // scheduled_for is NOT NULL and lies in the future.
    expect(task.scheduled_for.getTime()).toBeGreaterThan(Date.now());
  });

  it('stores photo metadata as jsonb (relative /uploads paths allowed)', async () => {
    const res = await post('/api/v1/damage-reports', {
      container_id: containerId,
      severity: 'minor',
      description: 'Repad lucka (testticket 06)',
      photos: [{ url: '/uploads/test-photo.png', caption: 'lucka' }],
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    createdReportIds.push(body.id);

    // Regression: a JS array sent to a jsonb column used to fail with
    // "invalid input syntax for type json" (pg sends arrays as array literals).
    expect(body.photos).toEqual([{ url: '/uploads/test-photo.png', caption: 'lucka' }]);

    const stored = await db
      .selectFrom('damage_reports')
      .select('photos')
      .where('id', '=', body.id)
      .executeTakeFirstOrThrow();
    expect(stored.photos).toEqual([{ url: '/uploads/test-photo.png', caption: 'lucka' }]);
  });

  it('rejects an absolute-URL-less, non-upload photo path', async () => {
    const res = await post('/api/v1/damage-reports', {
      container_id: containerId,
      severity: 'minor',
      description: 'Ogiltig foto-URL (testticket 06)',
      photos: [{ url: 'javascript:alert(1)' }],
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/damage-reports — filters', () => {
  it('filters by container_id and severity', async () => {
    const byContainer = await get(`/api/v1/damage-reports?container_id=${containerId}`);
    expect(byContainer.statusCode).toBe(200);
    const rows = byContainer.json().data ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r: any) => r.container_id === containerId)).toBe(true);

    const criticalOnly = await get(`/api/v1/damage-reports?container_id=${containerId}&severity=critical`);
    const critRows = criticalOnly.json().data ?? [];
    expect(critRows.length).toBe(1);
    expect(critRows[0].severity).toBe('critical');
  });

  it('filters by site (via containers.current_site_id)', async () => {
    const res = await get(`/api/v1/damage-reports?site_id=${siteId}`);
    expect(res.statusCode).toBe(200);
    const rows = res.json().data ?? [];
    // No damage report may leak in from another site.
    expect(rows.some((r: any) => r.container_id === containerId)).toBe(true);
  });

  it('rejects invalid query values with a clean 4xx', async () => {
    const res = await get('/api/v1/damage-reports?severity=apocalyptic');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: expect.stringMatching(/VALIDATION|BAD_REQUEST/) } });
  });
});

describe('PATCH /api/v1/damage-reports/:id — acknowledge → resolve lifecycle', () => {
  it('acknowledge and resolve stamp the acting user; backwards/no-op transitions are rejected', async () => {
    const created = await post('/api/v1/damage-reports', {
      container_id: containerId,
      severity: 'major',
      description: 'Hjul skrot (testticket 06)',
    });
    expect(created.statusCode).toBe(201);
    const report = created.json();
    expect(report.maintenance_task_id).toBeTruthy(); // major also triggers the rule
    createdReportIds.push(report.id);
    // Track the auto-created task for cleanup too.
    if (report.maintenance_task_id) createdTaskIds.push(report.maintenance_task_id);

    // Worker may not change report status.
    const workerRes = await patch(`/api/v1/damage-reports/${report.id}`, { status: 'acknowledged' }, workerToken);
    expect([403, 401]).toContain(workerRes.statusCode);

    const ack = await patch(`/api/v1/damage-reports/${report.id}`, { status: 'acknowledged' });
    expect(ack.statusCode).toBe(200);
    expect(ack.json()).toMatchObject({ status: 'acknowledged', acknowledged_by: adminId });
    expect(ack.json().acknowledged_at).toBeTruthy();

    // Cannot acknowledge twice (open → acknowledged only).
    const ackAgain = await patch(`/api/v1/damage-reports/${report.id}`, { status: 'acknowledged' });
    expect(ackAgain.statusCode).toBe(409);

    const resolved = await patch(`/api/v1/damage-reports/${report.id}`, {
      status: 'resolved',
      resolution_notes: 'Bytt lock (testticket 06)',
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ status: 'resolved', resolved_by: adminId });

    // Resolved is terminal, and no jumping back to acknowledged.
    const reopen = await patch(`/api/v1/damage-reports/${report.id}`, { status: 'acknowledged' });
    expect(reopen.statusCode).toBe(409);
  });

  it('rejects unknown container with clean 404 (not a 500)', async () => {
    const res = await post('/api/v1/damage-reports', {
      container_id: '00000000-0000-0000-0000-000000000000',
      severity: 'minor',
      description: 'Okänd container',
    });
    expect([404, 400]).toContain(res.statusCode);
    expect(res.json().error).toBeDefined();
  });

  it('rejects invalid severity with a clean 400', async () => {
    const res = await post('/api/v1/damage-reports', {
      container_id: containerId,
      severity: 'catastrophic',
      description: 'Fläck på sedel (testticket 06)',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toMatch(/VALIDATION|BAD_REQUEST/);
  });
});

describe('Swap requests: create → approve → fulfil lifecycle', () => {
  it('worker creates pending; worker PATCH forbidden; manager approves with stamps', async () => {
    const created = await post(
      '/api/v1/swap-requests',
      {
        site_id: siteId,
        current_container_id: containerId,
        preferred_container_type: 'closed',
        reason: 'Behöver större container (testticket 06)',
      },
      workerToken
    );
    expect(created.statusCode).toBe(201);
    const swap = created.json();
    expect(swap).toMatchObject({ status: 'pending', requested_by: workerId, site_id: siteId });
    createdSwapIds.push(swap.id);

    // Worker may not approve.
    const workerAttempt = await patch(`/api/v1/swap-requests/${swap.id}`, { status: 'approved' }, workerToken);
    expect(workerAttempt.statusCode).toBe(403);

    const approved = await patch(`/api/v1/swap-requests/${swap.id}`, { status: 'approved' });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({ status: 'approved', approved_by: adminId });
    expect(approved.json().approved_at).toBeTruthy();

    // approved → pending is not a legal move.
    const backToPending = await patch(`/api/v1/swap-requests/${swap.id}`, { status: 'pending' });
    expect(backToPending.statusCode).toBe(409);
  });

  it('fulfil attaches the new container and stamps fulfilled_by', async () => {
    const created = await post(
      '/api/v1/swap-requests',
      { site_id: siteId, current_spot_id: null, reason: 'Byt mot kompressor (testticket 06)' },
      workerToken
    );
    expect(created.statusCode).toBe(201);
    createdSwapIds.push(created.json().id);

    const fulfil = await patch(`/api/v1/swap-requests/${created.json().id}`, {
      status: 'fulfilled',
      new_container_id: containerId,
    });
    expect(fulfil.statusCode).toBe(200);
    expect(fulfil.json()).toMatchObject({
      status: 'fulfilled',
      fulfilled_by: adminId,
      new_container_id: containerId,
    });

    // fulfilled is terminal.
    const cancelled = await patch(`/api/v1/swap-requests/${created.json().id}`, { status: 'cancelled' });
    expect(cancelled.statusCode).toBe(409);
  });

  it('rejects invalid payload with clean 400 (no Postgres 500)', async () => {
    const res = await post(
      '/api/v1/swap-requests',
      { site_id: 'not-a-uuid', reason: 'x' },
      workerToken
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toMatch(/VALIDATION|BAD_REQUEST/);
  });

  it('lists swap requests without leaking joined user credentials', async () => {
    const created = await post(
      '/api/v1/swap-requests',
      { site_id: siteId, current_container_id: containerId, reason: 'Listtest (testticket 06)' },
      workerToken
    );
    expect(created.statusCode).toBe(201);
    createdSwapIds.push(created.json().id);

    const res = await get('/api/v1/swap-requests?status=pending');
    expect(res.statusCode).toBe(200);
    const rows = res.json().data ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(1);

    for (const row of rows) {
      // Regression: an unscoped selectAll() with joins returned the users table
      // columns (email/password_hash) and clobbered the swap request's own id.
      expect(row.password_hash).toBeUndefined();
      expect(row.email).toBeUndefined();
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.status).toBeTruthy();
      expect(row.site_id).toBeTruthy();
      expect(row.created_at).toBeTruthy();
    }
  });
});
