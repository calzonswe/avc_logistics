# 07 — Manager: transport order builder with stops, assignment, suggestions

**Phase**: 3 — Complete the four views
**Blocked by**: 03, 04 (real container/driver/vehicle data must exist)

## Problems (from audit)
- `TransportOrdersPage` form has **no stops/containers editor** and driver/vehicle selects are `<Select options={[]}>` — the documented contract requires ≥1 stop with real container UUIDs, so *every UI create fails*.
- `Assigned` status is only reachable by PATCH; there's no assign workflow.
- `/transport-orders/suggest` (75%-threshold grouping) exists but has **no UI caller**.

## Deliverables
- Order builder: sequence of stops (site + spot/pit targets), containers per stop, driver select from real endpoint, vehicle select from real endpoint; multi-container orders supported per the contract.
- Assignment flow: Created(Planned) → Assign driver+vehicle → status `assigned` (+ in-app notification event, ticket 11).
- "Suggest orders" button filling the list with API suggestions for review/approval (grouped, threshold ≥75%); planner can accept into draft orders.
- Order list: filters by status/site/driver, lifecycle progression visible, archive action.

## Acceptance
- [x] Create a 2-stop order with containers via UI → 200, blocks verified in DB
- [x] Assign driver+vehicle → status becomes `assigned` and the driver sees it (after ticket 08)
- [x] Suggest list populates from a seeded 75% pit/container scenario
- [x] Vitest: order-creation schema rejects a stop without containers (test first)

## Completion notes (2026-10-21)

**API (`apps/api/src/routes/transportOrders.ts`)**
- `POST /transport-orders` now validates the body with `createTransportOrderSchema` (local `parseBody`
  helper → 400 `VALIDATION_ERROR`). Before, the raw body was used, so a stop **without containers** was
  silently accepted (201) — the UI could never build a valid order and the contract was unenforced.
- **New `POST /:id/assign`** — the assignment flow: driver + vehicle, order moves `planned → assigned`.
  Validates that the assignee really is an active `driver` (400 otherwise), that the vehicle exists and
  is active, and refuses to re-assign an order that already left `planned` (409).
- **New `POST /from-suggestion`** — accepts a suggestion (site → destination site + containers) and
  creates a real `planned` order with a pickup stop and a dropoff stop, the container links in both.
- `POST /suggest` now also proposes a **destination site**: the site with the most containers that is
  not the source site (ranking by container count keeps the suggestion meaningful even when the main
  site is the full one). `suggestedAction` names the destination.
- Shared contracts added in `packages/shared-types/src/api.ts`: `assignTransportOrderSchema`,
  `createOrderFromSuggestionSchema`.

**UI (`apps/web/src/pages/manager/TransportOrdersPage.tsx` — rewritten)**
- **Order builder**: a real stop editor — add/remove/reorder stops, per stop: type
  (upphämtning/avlämning), site, multi-select of the containers standing at that site, and an optional
  target spot (dropoff). Driver/vehicle selects are now populated from `/drivers` and `/vehicles`
  (they were hardcoded `options={[]}`). Client-side validation mirrors the contract
  (≥1 stop, ≥1 container per stop) and server errors are shown in a banner.
- **Assignment flow**: "Tilldela" on a planned order opens a modal (driver + vehicle) → `POST /:id/assign`.
- **Suggestions**: "Föreslå order" opens a panel with the per-site groups (containers at ≥75 %) and a
  "Skapa order" button per group → `POST /from-suggestion`.
- **List**: filters for status/site/driver, a lifecycle indicator (planned → assigned → in_progress →
  completed → archived), "Visa" opens a read-only detail modal (stops, containers, driver, vehicle,
  times) and "Arkivera" is available for completed orders.
- The detail endpoint returns a paginated single-item shape (`{ data: [order] }`) — the modal reads it
  accordingly.

**Verified in a real browser** (headless Chromium over CDP):
- Builder: stop 1 (AVC Centralterminal, 2 containers) + stop 2 (AVC Norr, 2 containers) → order
  **TO-2026-00007** created; DB shows 2 stops (sequence 1/2) with 2 container links each.
- Assignment: order `planned` → `assigned`, driver "Erik Andersson", vehicle "Lastbil 1".
- Suggestions: 3 groups (Centralterminal→Norr, Norr→Centralterminal, Söder→Centralterminal) with the
  container lists and working "Skapa order" buttons.
- Detail modal shows both stops and their containers; no console errors on the page.

**Tests (written first — 4 red → green)**: `apps/api/src/__tests__/transportOrderBuilder.test.ts`
covers the stop-without-containers 400, the empty-stops 400, unknown container 404, the persisted
2-stop order (sequence + container links in the DB), the assignment (status + stamps, double-assign
409, non-driver 400/404) and the suggestion grouping (≥75 % containers, destination site).
Suites: API **38/38**, web 3/3, `pnpm typecheck` 8/8.

**Bug found while verifying**: the auth store's `logout()` never reset `isLoading`, so a failed token
refresh (the access token lives only 15 minutes) left the app spinning forever with no way back to the
login page — a "stuck white/grey screen". `logout()` now clears `isLoading`, and `checkAuth` awaits it.
