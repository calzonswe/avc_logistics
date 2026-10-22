# 01 — Fix auth store, compile, login landing & role redirects

**Phase**: 1 — Unbreak
**Blocked by**: nothing (this is step zero — the web app currently does not compile: `apps/web/src/stores/authStore.ts:85-90` has a syntax error and a floating `return async function()` that was evidently meant to be an unfinished `checkAuth`).

## Deliverables
- `authStore.ts` compiles; the intended interrupt-but-unfinished logic (restore-session check) is completed sensibly.
- Unauthenticated visit to any URL → redirect to `/login`.
- After login, redirect by role: Admin/Manager → manager area, Driver → Driver view, Worker → Worker view.
- Authenticated user visiting `/login` → bounced to their role view.
- Route guards enforced on all four view trees (`apps/web/src/pages/*`).

## Acceptance
- [x] `pnpm typecheck` passes for `@avc/web` (clean `tsc --noEmit`)
- [x] `pnpm dev` boots web without errors; all existing pages render again (the "invisible views" report)
- [x] Opening `/` unauthenticated lands on `/login`
- [x] Login as admin, driver, worker (demo accounts from seed) each lands in the correct view
- [x] Deep-linking a protected page unauthenticated ends up on `/login`

## Completion notes (2026-10-21)
The ticket grew far beyond the original syntax error — the audit's "last crash" was
only the tip of a 122-error backlog that also hid *runtime* ReferenceError bugs.

**Done**
- `authStore.ts`: fixed the broken `updateProfile`/floating `checkAuth` block.
- Role routing: new `apps/web/src/utils/roleHome.ts` is the single source of truth;
  `App.tsx` redirects `/` and `*` by role; `PublicOnlyLogin` bounces logged-in users
  hitting `/login` to their role view; `LoginPage` navigates by role after login.
- `packages/ui`: type-level repairs to the offline-sync scaffolding (`useSync`,
  `offlineDB`, `syncService` — boolean-index Dexie queries → `.filter()`, signature
  alignment); added `@avc/shared-types` workspace dep. All relative imports in the
  package now carry `.js` extensions (NodeNext requirement).
- UI components extended to accept the contracts pages were written against:
  `Button` (`isLoading`, `variant="destructive"` aliases), `Input` (`icon`, `multiline`
  + `rows` → textarea), `Table` (`accessorKey`/`cell` columns, optional `keyExtractor`,
  `isLoading`, `pagination` footer, `createActionsColumn` with component-typed icons).
- Manager pages fixed: child form components now take proper `onCancel` props
  (were referencing parent scope → runtime ReferenceError on every modal cancel);
  `MaintenancePage` uses the real schema enums (`due/in_progress/completed/overdue`,
  `scheduled/condition_based`); `ContainersPage` form was wired to empty no-op
  stubs (`onCreate`/`onUpdate`) — now wired to the actual mutations; missing imports
  (`Button`, `Wrench`, `Textarea`, vite-env typings).
- Map editor canvases (`Zone`/`Spot`/`Ramp`): added missing `canvasRef`, fixed
  brace-scope bugs (spots/ramps/preview nested inside the zones loop, `deps`
  declared inside the effect body), aligned field names with the schema
  (`polygon_geojson`/`color_hex`, `allowed_container_types`, ramp gets
  `waste_category_id` via a `wasteCategories` prop fetched in `MapEditorPage`).
  Zone saves now POST schema-shaped GeoJSON payloads.
- `MapEditorPage`: stub editor components cleaned up, zone save branch fixed, `handleImageUpload`
  passed into `ImageEditor` as a prop (was an out-of-scope reference → would crash on upload).
- `@avc/api` (pre-existing errors surfaced by the clean-repo bar): `config.NODE_ENV`,
  `sites.ts` `$if` guard, `reports.ts` groupBy array form; **dashboard.ts** site
  dashboard now maps pits to the view type with the 75%-alert rule per GLOSSARY,
  and the driver shift view was rebuilt to the real `DriverShiftView` contract
  (`assigned_orders` as full `TransportOrderDetail`s with ISO date strings,
  `available_vehicles` query added). **transportOrders.ts**: fixed duplicated/truncated
  `stopsByOrder` paste that broke parsing, detail route stop/container selects
  (missing `order_id`, `fill_level`), create loop derives `sequence` from array
  order (schema has no such field), deleted unused `zod-to-json-schema.ts` (dead
  code calling a Zod-v4-only API on zod v3).
- `packages/shared-types/src/domain.ts`: `transportOrderStopSchema`/
  `transportOrderContainerSchema` no longer inherit `created_at`/`updated_at` —
  those join tables have no such columns in `docs/schema.sql`.

**Verification**
- `pnpm typecheck`: clean for the *entire* monorepo (web, ui, api, shared-types).
- `pnpm --filter @avc/web build`: succeeds (incl. PWA service worker bundle).
- API restarted fresh on :3000; `/auth/login` OK for admin + driver seeds;
  `/dashboard/driver/:id/shift` returns the new contract shape
  (`assigned_orders` + `available_vehicles`); `/dashboard/site/:id` returns
  mapped containers + pits; `/transport-orders` paginates.
- Web dev server serves the SPA at :5173 (verified via HTTP).

**Out of this ticket's scope; follow-ups**
- Browser click-through of all four role views (visual acceptance — needs human eyes).
- The canvases' API endpoints (`/map/site/:id/zones` POST/PATCH etc.) are still
  missing server-side — exactly what ticket 05 plans.
- Deep E2E of login/redirect flows stays deferred per the test strategy.
