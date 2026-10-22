# 11 — In-app notification bell + event wiring (4 events)

**Phase**: 4 — Cross-cutting systems
**Blocked by**: 03, 06, 09 (events need real sources)

## Problems (from audit)
- DB trigger `check_pit_alert` writes `notifications` rows at 75% but **no UI or route ever reads them** — alerts are invisible.
- No toasts/bells for order dispatch, damage reports, or overdue maintenance.

## Deliverables
- `GET /notifications` (+ mark-as-read routes) if absent; notification drawer + bell badge in the shared layout, with per-role filtering.
- Event wiring (the four agreed in ADR 0004):
  1. Order assigned/re-assigned to a driver → notification for that driver (in-app path; push comes in ticket 13)
  2. Pit reaching 75% → for site's workers + managers
  3. Damage report created → managers
  4. Maintenance task overdue → managers
- Dropdown/toast presentation consistent with existing design system (`@avc/ui` toast hook exists).

## Acceptance
- [x] Set a pit to 75% via worker/API → bell badge increments, drawer lists the alert for the site's workers+managers only
- [x] Assign an order in manager view → driver gets a bell item
- [x] Overdue maintenance (seed one backdated) → manager bell item
- [x] Unread/read state persists per user

## Completion notes (2026-10-21)

**One event source** — `apps/api/src/services/events.ts` is the single emitter (ADR 0004's four events).
`emitAppEvent()` writes the in-app notification rows (one per recipient) and then notifies the
in-process listeners, so the WebSocket (ticket 12) and web-push (ticket 13) subscribe to the *same*
events instead of every route broadcasting on its own.

| Event | Source | Recipients |
| --- | --- | --- |
| `order_assigned` | `POST /transport-orders/:id/assign` | the assigned driver |
| `pit_alert` | `PATCH /pits/:id` (crossing 75 %/100 %) | the site's workers + managers |
| `damage_reported` | `POST /damage-reports` | managers + admins |
| `maintenance_due` | the maintenance watcher (sweep) | managers + admins |

- The pit rows are written by the existing `check_pit_alert` **database trigger**; the API only
  detects the crossing and broadcasts (no duplicate rows). The trigger's text was translated to
  Swedish (the app is Swedish-primary).
- **New `apps/api/src/services/maintenanceWatcher.ts`**: a sweep (at boot + every 60 s) flips
  past-due tasks to `overdue` and notifies the managers — exactly once per task (it checks for an
  existing notification for that task).

**Bell + drawer** — `apps/web/src/components/NotificationBell.tsx`: the unread badge (polls every
30 s), a drawer with an icon per event type, the title/message and a relative time, "mark as read"
per item and "mark all as read". The recipients are role-scoped **on the server** (the API only ever
returns the caller's own rows), so a worker never sees another site's alerts.
`@avc/ui`'s `Layout` got a `headerActions` slot; the bell is rendered **once** in a single
responsive header (before, the mobile bar and the desktop header each rendered their own copy, so
the drawer state was split in two).

**Verified** (headless Chromium): the manager sees a badge of 4 and the drawer lists the pit alert,
the damage report and the overdue maintenance; the API shows the right rows per role (driver1:
`order_assigned`; worker1: `pit_alert`; manager: all four types) and the read state persists per
user (`POST /notifications/read` → `is_read` + `read_at`).

**Tests** — `apps/api/src/__tests__/appEvents.test.ts` (5 tests): the driver gets the order
notification (and the worker does not), the pit crossing notifies the site's users, the damage
report notifies the managers (and not the reporting worker), the overdue sweep notifies once per task
and flips the status, and the read state is per user.

**Two production bugs found while testing**
1. **Concurrent order creates picked the same order number** → `duplicate key … transport_orders_order_number_key`
   → 409 "Resursen finns redan" for the second order. The number is now generated **inside** the
   transaction under a `pg_advisory_xact_lock` (both the normal create and `from-suggestion`).
2. **The test fixtures were not idempotent** — a run that was interrupted left `TEST-%` containers
   behind and the next run died on the unique constraint. New helper
   `apps/api/src/__tests__/helpers/testFixtures.ts` (`cleanTestContainers(prefix)`) cleans **only the
   calling file's** prefix (the files run in parallel and must not delete each other's fixtures).
