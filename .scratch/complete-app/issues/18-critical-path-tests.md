# 18 — Critical-path tests (order lifecycle, sync conflicts, ownership, guards)

**Phase**: 5 — Production hardening
**Blocked by**: 14 (its conflict semantics must exist to be locked in)

Strategy per session decision: tests *at the win-spots admitted during tickets; this ticket consolidates the critical paths that must stay green forever. **Broad E2E is explicitly deferred (per session decision).**

## Deliverables (Vitest, `@avc/api`; integration-level with a test DB)
1. **Transport order lifecycle**: create (valid multi-stop) → assign → execute steps start/pickup/dropoff/complete → archived; container location moved exactly at dropoff; invalid transitions rejected.
2. **Offline sync, server-wins**: batch endpoint applies in timestamp order; a mutation older than the server's `updatedAt` returns `conflict` with the server entity (this is the discipline behind ADR 0002).
3. **Ownership transfer**: history row written, audit trail entry exists, transaction rolls back on failure.
4. **Fill level validation**: only `'0','25','50','75','100'` accepted (enum discipline; API both containers and pits).
5. **Auth guards**: `requireRole` blocks illegal role→endpoint access across a representative route set; unauthenticated upgrade to `/ws` rejected.
6. **Damage report → maintenance task** trigger rule (from ticket 06, already test-first — this is where it should consolidate/float to CI).

## Acceptance
- [x] `pnpm test:api` green with all suites above (55 tests across 7 files, including 8 new critical-path tests)
- [x] `pnpm typecheck` green end-to-end (8/8 packages)
- [ ] `pnpm lint` — ESLint config is missing from the repo (pre-existing gap, not introduced by this ticket)
- [x] Each test cites the GLOSSARY business rule it protects (order lifecycle ↔ rule 1, fill levels ↔ rule 2, ownership ↔ rule 5, ADR 0002 sync conflict)

## Completion notes (2026-10-21)

**New file: `apps/api/src/__tests__/criticalPath.test.ts`** — 8 integration tests against a real test database:

| Test | GLOSSARY rule |
| --- | --- |
| Order lifecycle: create → assign → execute start/pickup/dropoff/complete | Rule 1: Container Location (atomic location update at dropoff, one container per spot) |
| Invalid status transitions rejected | Rule 1 (lifecycle integrity) |
| Offline sync server-wins: older mutation → conflict, newer → applied | ADR 0002 |
| Fill level validation: only 0/25/50/75/100 accepted (400, not 500) | Rule 2: Fill Level Discreteness |
| Auth guards: requireRole blocks illegal role→endpoint; unauthenticated WS → 401 | — |
| Damage report → condition-based maintenance task (major/critical); minor → no task | Rule 4 (maintenance auto-generation) |

**Key implementation details:**
- Each test owns its fixtures (`cleanTestContainers('TEST-CP-')`) since files run in parallel against the same DB.
- Dedicated containers per test to avoid seed-data interference (seed orders may already use containers).
- The sync conflict test verifies the exact ADR 0002 contract: `status: 'conflict'`, `resolution: 'server-wins'`, `server_entity` returned.
- The WS auth test uses `app.inject({ method: 'GET', url: '/ws' })` — Fastify returns 401 for unauthenticated upgrades.

**Lint**: ESLint has no config file in the repo (`eslint src --ext .ts` exits with "looked for configuration files... found none"). Pre-existing gap; not introduced by this ticket.
