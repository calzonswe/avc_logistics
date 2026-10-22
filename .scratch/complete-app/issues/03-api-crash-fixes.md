# 03 — API crash fixes: order detail 500, dashboard stats mismatch, invalid enums

**Phase**: 1 — Unbreak
**Blocked by**: nothing (independent of 01/02 except testing via dev stack)

## Problems (from audit)
- `GET /transport-orders/:id` references an undefined `orders` variable → guaranteed 500 (`apps/api/src/routes/transportOrders.ts` ~line 246).
- Manager `Dashboard.tsx` calls `GET /dashboard/stats` which does not exist; the real endpoint is `/dashboard/manager/overview` → 404 shell page.
- Worker maintenance PATCH sends status `'scheduled'`, not in the DB enum (`due`/`in_progress`/`completed`/`overdue`) → always rejected.
- `POST /maintenance` uses the same invalid enum value.
- `SettingsPage` PATCHes `/auth/me` but auth routes are GET-only.
- `PATCH /drivers/:id` UI exists but **DELETE /drivers/:id** doesn't (UI delete always fails).

## Deliverables
- Fix the undefined-variable 500; add a test-first style contract check (Vitest) that `GET /transport-orders/:id` returns the order with stops and containers.
- Point the manager dashboard page at the real overview endpoint (or create the stats endpoint — pick one, document in shared-types).
- Align every maintenance status write to the legal enum; map UI options to `due`/`in_progress`/`completed`/`overdue`.
- Give `PATCH /auth/me` a real handler (safe self-profile fields only) or make the settings page read-only as fits.
- Add `DELETE /drivers/:id` (soft delete, per sites precedent) or remove the UI control — decide, then match API+UI.

## Acceptance
- [x] `GET /transport-orders/:id` returns 200 with detail for a seeded order
- [x] Manager dashboard page shows real numbers, no 404
- [x] Worker can set a maintenance task to `in_progress` and then `completed`
- [x] Settings page saves without error
- [x] Driver delete works from DriversPage (or the button is gone)

## Completion notes (2026-10-21)

**Delivered**
- **Order detail**: the audit's undefined-`orders` 500 was already fixed in ticket 01 — re-verified live (200, nested 2 stops, container links) and locked in with the repo's first Vitest suite: `apps/api/src/__tests__/transportOrderDetail.test.ts` (3 tests: 200 detail contract incl. ordered stops + container holdings, 404 unknown id, 401 unauthenticated). Needed `export` on `buildApp` in `index.ts` (test mode boots the app via `app.inject` without listening; the `start()` guard on `NODE_ENV !== 'test'` was already there).
- **Manager dashboard**: decision — kept the UI contract and extended the real endpoint `GET /dashboard/manager/overview` (no new `/dashboard/stats` endpoint; documented in shared-types). Endpoint now returns all six stats the page renders (`totalContainers`, `containersNeedingTransport`, `overdueMaintenance`, `openDamageReports`, `pendingSwapRequests`, `pitsNeedingAttention`) + `activeOrders` and a status×fill_level breakdown; bigint counts normalized to numbers. Contract type `managerOverviewSchema`/`ManagerOverview` added to `packages/shared-types/src/api.ts` (API consumes `dist/` — rebuilt). `Dashboard.tsx` switched to `/dashboard/manager/overview` with the shared type; local `DashboardStats` interface removed.
- **Maintenance enums**: `POST /maintenance` hard-coded `status: 'scheduled'` (not in the `maintenance_status` enum — every create up to now was invalid) → now `'due'`. Worker `WorkerPage.tsx` status dropdown/colors/labels used `'scheduled'` → mapped to legal `'due'` (label stays "Planerad"); worker flow verified end-to-end: create → `in_progress` → `completed`.
- **PATCH /auth/me**: real handler added — safe self-service fields only (`full_name`, `avatar_url`), server-side validation (name 1–100, avatar URL parse), returns sanitized user (no `password_hash`), rejects empty payloads; role/email/site_id deliberately not updatable here. Returns-shape identical to GET `/me`.
- **DELETE /drivers/:id**: added as soft delete (sites precedent): `is_active = false`, `role = 'driver'` guard so admin/manager/worker ids can never be deactivated through this route; DriversPage list already filters `is_active = true`, so the UI delete button now works.

**Verification (all green, live API on :3000)**
- `GET /transport-orders/:id` → 200 `TO-2026-00003` with 2 stops and container links; vitest suite `3 passed`.
- `GET /dashboard/manager/overview` → `{totalContainers: 20, containersNeedingTransport: 8, overdueMaintenance: 1, openDamageReports: 2, pendingSwapRequests: 0, pitsNeedingAttention: 1, activeOrders: 3}` — matches seeded data exactly.
- `POST /maintenance` → 201 `status: due`; PATCH → `in_progress` → `completed`; test row deleted afterwards.
- `PATCH /auth/me` → sanitized profile back.
- `DELETE /drivers/driver3` → `is_active = f`, disappears from list; PATCH-restored to active afterwards (verified in DB).
- Monorepo `pnpm typecheck` exit 0.

**Follow-ups**
- The worker "Ta bild och rapportera" card is still a stub (damage-report photo flow is ticket 06 territory).
- Settings "preferences" tab renders no preferences inputs yet (notification preferences arrive with tickets 11/13).
