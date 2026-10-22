// Contract test: PATCH /containers/:id/fill-level must accept only values on
// the discrete fill scale ('0','25','50','75','100') and reject anything else
// with a clean 400 (never a Postgres enum 500) — ticket 04.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { db, closeConnection } from '../db/index.js';

let app: FastifyInstance;
let token: string;
let containerId: string;

beforeAll(async () => {
  app = await buildApp();

  const admin = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', 'admin@avc.local')
    .executeTakeFirst();
  if (!admin) throw new Error('Seed data missing: admin@avc.local. Run `pnpm db:seed`.');
  token = app.jwt.sign({ id: admin.id, email: admin.email, role: 'admin', type: 'access' as const });

  const container = await db
    .selectFrom('containers')
    .select('id')
    .where('status', '=', 'active')
    .orderBy('container_number')
    .executeTakeFirst();
  if (!container) throw new Error('Seed data missing: no active container. Run `pnpm db:seed`.');
  containerId = container.id;
}, 30_000);

afterAll(async () => {
  await app.close();
  await closeConnection();
});

describe('PATCH /api/v1/containers/:id/fill-level', () => {
  it.each(['10', '37', '50.5', '-25', '120', 'abc', ''])(
    'rejects invalid fill level %p with 400 (no 500)',
    async (invalid) => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/containers/${containerId}/fill-level`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { fill_level: invalid },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({
        error: { code: expect.stringMatching(/VALIDATION|BAD_REQUEST/) },
      });
    }
  );

  it.each(['0', '25', '50', '75', '100'])('accepts discrete fill level %p with 200', async (valid) => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/containers/${containerId}/fill-level`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { fill_level: valid },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ fill_level: valid });
  });

  it('rejects extra fields not in the contract (spot_id is not a fill-level concern)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/containers/${containerId}/fill-level`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { fill_level: '50', spot_id: '00000000-0000-0000-0000-000000000000' },
    });
    // Strict schema: unknown keys are rejected so the route can't silently
    // accept an implied move it never performs.
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/containers (create)', () => {
  it('rejects unknown owning company + invalid enums with clean 4xx and rejects invalid fill_level', async () => {
    // invalid fill level on create must be a 400, not a 500
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/containers',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: {
        container_number: 'T37-00001',
        qr_code_value: 'T37-00001',
        type: 'closed',
        owning_company_id: '00000000-0000-0000-0000-000000000000',
        current_site_id: '00000000-0000-0000-0000-000000000000',
        fill_level: '37',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
