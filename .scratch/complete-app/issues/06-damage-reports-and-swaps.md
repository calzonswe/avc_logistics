# 06 — Damage reports & swap requests API

**Phase**: 2 — Repair broken data paths
**Blocked by**: 01, 02

## Problems (from audit)
- `damage_reports` table exists in `docs/schema.sql` but has **no route, no UI, no offline support** (despite ADR 0002's sync matrix listing it).
- Same for `swap_requests`.
- Condition-based maintenance (`triggered by damage reports`) cannot exist until damage reports flow.

## Deliverables
- API routes: `POST/GET/PATCH /damage-reports` (create with severity `minor/major/critical`, photo upload optional via existing uploads, list filters by site/container/status) and `POST/GET/PATCH /swap-requests`.
- Creating a damage report with severity `major`/`critical` **creates a condition-based maintenance task** (per GLOSSARY business rules).
- Zod request/response schemas in `@avc/shared-types`.
- Keep the payload shapes aligned to what the Worker page buttons will send (ticket 09 wires them).

## Acceptance
- [x] Create a damage report via API with severity; a maintenance task exists afterwards
- [x] List damage reports filtered by container and site
- [x] Swap request lifecycle: create → (manager) approve/reject via PATCH
- [x] Vitest: severity → maintenance-task creation rule (test written first)

## Completion notes (2026-10-21)

**New API — `apps/api/src/routes/damageReports.ts`** (registered at `/api/v1/damage-reports`):
- `POST /` — any role may report damage (Worker App action per GLOSSARY); validates via
  `createDamageReportSchema` (local `parseBody` helper → 400 `VALIDATION_ERROR` with the zod path, never
  a Postgres 500). Container must exist and not be `retired` → 404. Workers/drivers may only report
  damage for containers on their own site → 403.
- **Severity rule (GLOSSARY: condition-based maintenance is triggered by damage reports)**:
  `minor` → no task; `major` → `due` condition-based task within 48h; `critical` → within 24h.
  The task is linked back to the report (`maintenance_tasks.damage_report_id`) and the response returns
  `maintenance_task_id`.
- `GET /` — filters `status`, `container_id`, `severity`, `reported_by`, `site_id` (site filters via
  `containers.current_site_id`; `damage_reports` has no site column) + pagination. Workers/drivers are
  always scope-locked to their own site, even when they pass a foreign `site_id` (verified live).
  Rows carry `container_number` and `maintenance_task_id` for the UI.
- `GET /:id`, `PATCH /:id` — lifecycle `open → acknowledged → resolved` (open → resolved allowed);
  illegal transitions → **409** with the legal set in the message. `acknowledged_by`/`acknowledged_at`/
  `resolved_by`/`resolved_at` are **server-stamped** (admin/manager only) — the body can never set them.

**Schema change** — `docs/schema.sql`: `ALTER TABLE maintenance_tasks ADD COLUMN IF NOT EXISTS
damage_report_id UUID REFERENCES damage_reports(id) ON DELETE SET NULL` + index, placed after
`damage_reports` (maintenance_tasks is created earlier in the file, so the FK can't live in the
CREATE TABLE). The statement is idempotent, so the migration runner re-runs it cleanly on existing
databases (verified: `pnpm db:migrate` exit 0, column + index + FK present).
`packages/shared-types/src/db.ts`: `MaintenanceTaskTable.damage_report_id`.

**Hardened `apps/api/src/routes/swapRequests.ts`** (existed but was unvalidated):
- Bodies now validated with the shared schemas → 400 instead of a Postgres 500 on a bad uuid.
- Referenced container/spot/waste-category must belong to the site → 404. Workers/drivers can only
  request swaps for their own site → 403.
- Lifecycle enforcement: `pending → approved → fulfilled`, `cancelled` from pending/approved;
  `pending → fulfilled` allowed (same-day swap). Illegal moves → **409**. `approved_by`/`approved_at`/
  `fulfilled_by`/`fulfilled_at` are server-stamped; workers may not PATCH (403).
- Workers/drivers are site-scoped on list and detail (foreign rows return 404, not 403, so nothing leaks).

**Two real bugs found and fixed while verifying** (both now covered by regression tests):
1. `photos` (jsonb) — pg sends a JS array as a *Postgres array literal*, so every damage report with a
   photo failed with `invalid input syntax for type json`. Fixed by `JSON.stringify`-ing the array.
   Also relaxed the shared schema: `photos[].url` now accepts relative `/uploads/...` paths (what
   `POST /uploads` actually returns) as well as absolute http(s) URLs, and `taken_at` is optional.
2. **`selectAll()` with joins leaked user credentials** — the swap list used an unscoped `selectAll()`,
   so Kysely expanded it over the joined `users` table: the response contained `email` and
   **`password_hash`**, and the joined columns clobbered `id`/`status`/`site_id` (all null). Fixed with
   `selectAll('swap_requests')`. Audited every route for the same pattern — this was the only instance.
   The filter columns are now table-qualified: `containers.status` made `status` ambiguous
   (`column reference "status" is ambiguous` → 500) once the joins were correct.

**Shared types** (`packages/shared-types/src/api.ts`): `damageReportQuerySchema` gained `site_id`;
`createSwapRequestSchema` optional refs accept `null` (the worker app sends explicit nulls);
`createDamageReportSchema.photos` accepts upload paths.

**UI — new `apps/web/src/pages/manager/IncidentsPage.tsx`** ("Skador & byten", route
`/manager/incidents`, sidebar link): two tabs — damage reports (filter by status/severity/site,
Acknowledge, Resolve with notes) and swap requests (filter by status/site, Approve, Cancel). Server
errors are surfaced in a banner instead of failing silently. `@avc/ui` extended centrally: damage
severities (`minor`/`major`/`critical`) added to `getStatusColor`.

**Tests** — `apps/api/src/__tests__/damageReports.test.ts` (written first, 10 red → green): severity →
maintenance rule, photo jsonb round-trip, filters (container/site/severity) + invalid query 4xx,
acknowledge/resolve lifecycle with server-stamped identity and illegal-transition 409s, worker
role-gating, unknown container 404, invalid severity 400, swap create→approve→fulfil lifecycle,
worker PATCH 403, and the credential-leak regression. Suite: **31/31** (3 files).

**Verification**: `pnpm typecheck` 8/8; `pnpm --filter @avc/web build` (incl. PWA) OK;
`pnpm --filter @avc/api test` 31/31; live curl walkthrough of both resources (create/list/filter/
lifecycle/role-gating, site-scope enforcement, jsonb photos) — all test rows removed afterwards.

**Still open (by design)**: the Worker App buttons that *create* damage reports and swap requests
land with ticket 09, and offline support for both resources lands with tickets 14/15 (ADR 0002's sync
matrix) — the payload shapes here are what those tickets will send.

---

## Post-verification: the white/grey screen (2026-10-21, after this ticket)

The user reported that the web app showed only the sidebar ("headlines to the left") and a white/grey
body. Reproduced headlessly (Chromium over CDP) and **three separate defects** were found — the first
one was masking the other two, which is why they had never been noticed:

1. **Nested route paths were absolute under a splat parent (root cause of the blank content area).**
   The role views are nested inside `<Route path="/manager/*" element={<ManagerRoutes/>} />`. React
   Router strips the parent's pathBase before matching the nested `<Routes>`, so the URL
   `/manager/containers` was matched as `/containers` and the absolute child path `/manager/containers`
   never matched → **React Router rendered nothing at all** (no error, no red screen — the sidebar
   rendered, the `<main>` element had zero children). This affected **all four role views**, which is
   why no page had ever been verified visually.
   Fix: relative child paths (`path="containers"`) + `<Route index …/>` for the section root, and a
   `path="*"` fallback (`NotFoundPanel` — "Sidan hittades inte") so an unknown URL can never produce a
   blank page again. Paths now live in `apps/web/src/routes.ts` (`MANAGER_PATHS`, `DASHBOARD_PATHS`,
   `ROLE_SECTIONS`) and are consumed by `App.tsx`.
2. **`@avc/ui` `createActionsColumn` crashed on lucide icons.** It only detected `typeof icon ===
   'function'`, but lucide icons are `forwardRef` **objects** → the component object was rendered as a
   child → "Objects are not valid as a React child" → the whole page crashed (6 manager pages).
   Fix: `isComponentType()` in `packages/ui/src/components/Table.tsx` accepts string tags, functions
   and object components (forwardRef/memo) while explicitly *excluding* already-rendered elements
   (`<Eye />`), which some pages pass instead.
3. **The service worker was registered in dev.** `/sw.js` doesn't exist in the dev server, and a SW
   registered earlier keeps serving the cached bundle — a browser cache clear does *not* unregister it,
   which is exactly why clearing the cache changed nothing for the user. Fix: register only when
   `import.meta.env.PROD`; in dev `main.tsx` now unregisters any existing SW on every load.

Additionally, the seeded site pointed at a **map image that no longer existed** (the test PNG had been
cleaned up during ticket 02/05 verification) → the dashboard map showed a broken image with markers on
an empty strip. Fix: the seed now generates a real site-plan PNG (`apps/api/src/db/placeholderMap.ts`,
a dependency-free PNG encoder) into `<UPLOAD_DIR>/maps/seed-<site-id>.png` and points the site at it.

**Verification**: every route of every role view was rendered in headless Chromium and asserted to have
real content (16/16 OK, screenshots inspected); `apps/web/src/__tests__/routing.test.ts` (new web
Vitest suite, 3 tests) locks the routing invariant — it fails if a child path becomes absolute again.
Suites: API 31/31, web 3/3, `pnpm typecheck` 8/8, web build OK.
