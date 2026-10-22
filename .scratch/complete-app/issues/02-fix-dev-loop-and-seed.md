# 02 — Fix dev loop: root db scripts, uploads dir, seed overhaul

**Phase**: 1 — Unbreak
**Blocked by**: nothing

## Problems (from audit)
- Root `pnpm db:migrate`/`db:seed`/`db:studio` target `@avc/db`, which has no such scripts — README quick start is wrong.
- `migrate.ts` resolves `docs/schema.sql` relative to CWD, only safe when run from `apps/api` via pnpm filter.
- `UPLOAD_DIR=./uploads/maps` is never created → first map upload 500s.
- Seed (`apps/api/src/db/seed.ts`) is missing: a manager user, transport orders, maintenance tasks, damage reports, notifications; and it assigns **all containers in a site the same parking spot**, violating the 1-container-1-spot rule.

## Deliverables
- Root `package.json` db scripts retexted to run against `@avc/api` (`--filter @avc/api`) so `pnpm db:migrate` / `pnpm db:seed` work from the repo root — or `@avc/db` grows real script (choose the minimal correct one).
- API creates `UPLOAD_DIR` recursively at boot if missing.
- Seed overhaul: manager account (`manager@avc.local`), containers spread 1-per-spot across zones, a handful of planned transport orders, maintenance tasks due, one pit pre-set near 75% (useful for alert demos), realistic fill levels spread across the 0/25/50/75/100 scale.

## Acceptance
- [x] `pnpm docker:up && pnpm db:migrate && pnpm db:seed` succeeds from the repo root on a fresh volume
- [x] `pnpm dev` starts API+web; login works for admin, manager, driver1, worker1
- [x] Fresh-seeded data shows distinct parking spots per container, orders visible in manager view, one pit at 75%
- [x] Upload a map image in the map editor → succeeds (no 500)

## Completion notes (2026-10-21)

**Delivered**
- Root `db:migrate`/`db:seed` retexted to `pnpm --filter @avc/api …`; the dead `db:studio` script removed at both levels (`studio.ts` never existed).
- `migrate.ts` rewritten with a real SQL tokenizer: handles `$$`-quoted function bodies, `'…'` string literals, and (inline) line comments. Previously the naive `split(';')` shredded statements after the first function definition and even after inline comments containing apostrophes (e.g. `-- worker's assigned site`), while reporting "Migrations completed!" — it now exits non-zero on any failed statement.
- `docs/schema.sql` fixes surfaced by the fresh-volume runs (all real schema bugs, verified via psql):
  - §08 no longer seeds companies/admin from SQL — all seed data lives in `apps/api/src/db/seed.ts` (removed hardcoded bcrypt hash + double-seed conflict that made the seed guard always skip).
  - Invalid `CREATE INDEX idx_parking_spots_container … WHERE id IN (SELECT …)` (Postgres can't use subqueries in index predicates) replaced by `CREATE UNIQUE INDEX uq_containers_active_spot ON containers(current_spot_id) WHERE current_spot_id IS NOT NULL` — DB-level enforcement of the 1-container-per-spot rule.
  - Views `v_transport_order_detail` / `v_driver_shift` used the reserved-word alias `to` (renamed `t_order`); `u_fullname()` moved above the views that call it.
- Boot (`apps/api/src/index.ts`): creates `<UPLOAD_DIR>` and `<UPLOAD_DIR>/maps` recursively at startup.
- Seed overhaul (`apps/api/src/db/seed.ts`, deterministic, guard keeps single-seed semantics): manager account `manager@avc.local/manager123` (site-scoped), 3 drivers + 3 workers (all 4 role logins in README), 20 containers spread **one-per-distinct-spot**, fill levels cycling 0/25/50/75/100, 4 transport orders (2 planned — one unassigned one assigned, 1 in_progress, 1 completed) with stops + container links, maintenance tasks (1 overdue, 2 due, 1 completed), 2 damage reports, 6 in-app notifications wired to **real entity ids** (order/pit/damage/maintenance) for the bell (ticket 11), main-site pit `Trädgårdsgrop 1` at exactly 75%.
- `map.ts`: upload now writes to `join(config.UPLOAD_DIR, 'maps')` (was `process.env.UPLOAD_DIR` root — the file 404'd from its own returned URL); multipart bounds read from `data.fields` (with `{value}`-wrapper tolerance).
- `auth.ts`: `/uploads` added to public paths — all map images render via plain `<img src>`, which cannot send `Authorization`; verified GET returns `200 image/png`.

**Verification (all green)**
- Fresh volume: `DROP SCHEMA public CASCADE` → root `pnpm db:migrate` → `123 statements, Migrations completed!` exit 0 → root `pnpm db:seed` clean on first run; re-run correctly skips.
- SQL invariants: 0 duplicate `current_spot_id`, 0 unplaced containers, unique index rejects a violating insert, pit at 75%, orders/stops/links 4/8/8, maintenance mix `completed,overdue,due,due`, 2 damage reports, 6 notifications.
- Logins: admin/manager/driver1/worker1 all `200` (watch the auth rate limiter when scripting repeat logins — 429 after a few attempts/minute).
- Full REST round-trip of map upload via curl (PNG → `/api/v1/map/site/:id/image` → file in `apps/api/uploads/maps/` → URL serves `200 image/png`); bounds JSON persisted on the site row.
- Monorepo-wide `pnpm typecheck` exit 0; web dev server up on :5173.

**Follow-ups (next tickets)**
- Map-editor CRUD endpoints (`/map/...` zones/spots/ramps) were exercised only for upload; payload schemas belong with ticket 05.
- Seed is single-shot; if a partial seed ever fails midway, fix by dropping schema + re-running both scripts (documented here instead of building resume logic).
