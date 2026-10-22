// Contract test: GET /transport-orders/:id must return the order with nested
// stops and containers (this endpoint previously 500'd on an undefined variable
// — ticket 03). Integration-style: runs against the local dev database seeded
// by `pnpm db:seed`, which always contains one in_progress order.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { db, closeConnection } from '../db/index.js';

let app: FastifyInstance;
let token: string;
let orderId: string;

beforeAll(async () => {
  app = await buildApp();

  const admin = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', 'admin@avc.local')
    .executeTakeFirst();
  if (!admin) throw new Error('Seed data missing: admin@avc.local. Run `pnpm db:seed`.');

  // Sign the same token shape the auth route issues (auth.ts claim contract).
  token = app.jwt.sign({
    id: admin.id,
    email: admin.email,
    role: 'admin',
    type: 'access' as const,
  });

  const order = await db
    .selectFrom('transport_orders')
    .selectAll()
    .where('status', '=', 'in_progress')
    .orderBy('order_number')
    .executeTakeFirst();
  if (!order) throw new Error('Seed data missing: no in_progress transport order. Run `pnpm db:seed`.');
  orderId = order.id;
}, 30_000);

afterAll(async () => {
  await app.close();
  await closeConnection();
});

describe('GET /api/v1/transport-orders/:id', () => {
  it('returns 200 with the order including nested stops and containers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/transport-orders/${orderId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: Array<{
        order_number: string;
        status: string;
        stops: Array<{
          sequence: number;
          stop_type: string;
          site_name: string | null;
          containers: Array<{ container_number: string; container_type: string }>;
        }>;
      }>;
      meta: { total: number };
    };

    expect(body.data).toHaveLength(1);
    const detail = body.data[0];
    expect(detail).toMatchObject({ status: 'in_progress' });
    expect(detail.order_number).toMatch(/^TO-\d{4}-/);
    expect(detail.stops.length).toBeGreaterThanOrEqual(1);

    // Stops ordered by sequence, each carrying the site name and containers.
    const sequences = detail.stops.map((s) => s.sequence);
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
    expect(detail.stops.every((s) => typeof s.stop_type === 'string')).toBe(true);
    expect(detail.stops.every((s) => Array.isArray(s.containers))).toBe(true);

    // The seeded in_progress order picks up two containers at its first stop.
    const firstPickup = detail.stops.find((s) => s.stop_type === 'pickup');
    expect(firstPickup).toBeDefined();
    expect(firstPickup!.containers.length).toBeGreaterThanOrEqual(1);
    expect(firstPickup!.containers.every((c) => c.container_number.length > 0)).toBe(true);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/transport-orders/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/transport-orders/${orderId}`,
    });
    expect(res.statusCode).toBe(401);
  });
});
