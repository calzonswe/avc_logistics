# 08 — Driver app: shift start, order execution, real QR scanner

**Phase**: 3 — Complete the four views
**Blocked by**: 03, 07 (orders must exist and be assignable)

## Problems (from audit)
- `ActiveOrderCard.tsx` is a gutted stub (header only; 20 of 27 lines dead) — no start/pickup/dropoff buttons.
- `QRScanner.tsx` is self-labeled "Placeholder"; suspicious per-frame `decodeFromVideoDevice` loop instead of the zxing single-shot/readFromVideoDevice API.
- **No shift-start / vehicle-selection UI anywhere** — the `driver_shift` route exists but is not written to or from.
- No offline usage (awaiting ticket 14 — this ticket only needs to leave write paths routeable through a seam that 14 can wrap).

## Deliverables
- Shift start: select vehicle → view of pre-assigned orders + active order.
- `ActiveOrderCard`: full step-through execution — start, pickup, dropoff, complete — each calling `/transport-orders/:id/execute` with the correct action, updating order + container location atomically server-side.
- Real QR scanner using `@zxing/browser` correctly (continuous decode via `decodeFromVideoDevice` streaming reader or the documented API — verify against the library, not the placeholder); binding to container QR so pickup/dropoff can scan-confirm instead of list-pick.
- Orders list with status change visibility; container confirm via scan or list.
- Keep the execution calls behind one client module so ticket 14 can swap it for the offline queue without re-touching UI.

## Acceptance
- [x] Driver selects a vehicle at shift start; shift persists across reload
- [x] Execute a seeded assigned order end-to-end (start→pickup→dropoff→complete); container location moved exactly at dropoff
- [x] QR scan identifies a container and pre-fills the step
- [x] A second driver cannot execute another driver's assigned order (authorization holds)

## Completion notes (2026-10-21)

**API**
- **New `driver_shifts` table** (`docs/schema.sql`, plus the shared-types table type): a shift is real
  server state (driver, vehicle, started_at, ended_at) with a partial unique index
  (`uq_driver_shifts_open`) that allows only one open shift per driver.
- **New routes** `apps/api/src/routes/driverShift.ts` → `GET /api/v1/driver-shift` (the driver's open or
  latest shift), `POST /driver-shift/start` (pick a vehicle; re-using the same vehicle returns the open
  shift, a different vehicle closes the old one first), `POST /driver-shift/end`. The GLOSSARY's
  "Shift Start: Selects vehicle" is now implemented instead of being a client-only concept.
- **Dropoff places each container on its own spot.** The old API took one `spot_id` for all containers,
  which violates the DB rule "one container per spot" (`uq_containers_active_spot`) — a 2-container
  dropoff failed with "Resursen finns redan". `executeTransportOrderActionSchema` now accepts
  `container_spots: [{container_id, spot_id}]`; the API validates every spot (exists, at the stop's
  site, free, not used twice) and places the containers one by one. A single `spot_id` is still
  accepted for a one-container dropoff.
- `GET /sites/:id/parking-spots` now returns the occupant
  (`occupied_by_container_id`/`occupied_by_container_number`) — the driver needs to know which spots
  are free.

**UI**
- **`apps/web/src/services/driverApi.ts`** — the single client seam for the driver app (execute step,
  shift start/end, QR lookup, spots). Ticket 14 (offline write path) swaps this module for the Dexie
  queue without touching a component.
- **`DriverPage.tsx`** — shift start (vehicle select from the real vehicle list, "Avsluta skift"),
  the order list (click an order to work on it, status badge per order) and the active order card.
  The shift is server state, so it survives a reload.
- **`ActiveOrderCard.tsx`** — the full step-through: the stop list with done/pending state, "Starta
  order" → per-container checkboxes + "Skanna QR" → "Hämta container" → a **spot per container** at
  the dropoff → "Läm av container" → "Slutför order". Server errors are shown in a banner.
- **`QRScanner.tsx`** — rewritten against the real `@zxing/browser` API: `decodeFromConstraints()`
  streams the camera into the `<video>` and decodes continuously, returning `IScannerControls` whose
  `stop()` ends the scan. The placeholder called `decodeFromVideoDevice()` inside a
  requestAnimationFrame loop, which started a **new decoder every frame** and never stopped any of
  them. A scanned code is resolved with `GET /containers/qr/:value` and pre-fills the step (unknown
  containers are rejected with a message); without a camera the modal shows a clear error and a
  "Försök igen" button.

**Seed fixes** (the seeded data could not be executed end-to-end)
- Containers are now linked to **both** stops of an order (picked up at A, delivered at B) — the
  dropoff stop had no containers, so no order could ever be completed.
- The order with a driver + vehicle is now `assigned` (it was `planned` with a driver attached).

**Verified in a real browser** (headless Chromium over CDP, driver1):
- Shift start: vehicle "GHI 789 · Terminalvagn" → shift open → **still open after a reload** ✓.
- The seeded assigned order **TO-2026-00002**: `assigned` → "Starta order" → `in_progress` →
  "Hämta container" (the container leaves the site, in transit) → "Läm av container" with one spot
  per container → the containers sit on their own spots at AVC Norr → "Slutför order" →
  `completed` ✓. The container location moved exactly at the dropoff.
- The QR modal opens and degrades gracefully without a camera; no console errors anywhere.

**Tests (written first)**: `apps/api/src/__tests__/driverExecution.test.ts` — another driver and a
worker get 403 on execute, the full start→pickup→dropoff→complete walk (the container leaves the
site at the pickup and is placed on the target spot at the dropoff), "two containers on one spot" is
refused (409) while one spot per container works, and completing with an open stop is refused (409).
Suites: API **42/42**, web 3/3, `pnpm typecheck` 8/8.

**Note on test isolation**: the Vitest files run in parallel against the same database, so each file
now creates its **own** containers (and the driver test uses a free spot) — otherwise one file moved a
container while another was building an order with it.

**Bug found while verifying**: the shift GET used an unscoped `selectAll()` with a join, so the
joined vehicle's columns leaked into the response and clobbered the shift's own `id` (same trap as
the swap-request list in ticket 06). Now `selectAll('driver_shifts')` with aliased vehicle columns.
