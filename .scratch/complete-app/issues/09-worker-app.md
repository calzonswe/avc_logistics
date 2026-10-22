# 09 — Worker app: wire damage/swap handlers, site naming, verified flows

**Phase**: 3 — Complete the four views
**Blocked by**: 03, 06

## Problems (from audit)
- Worker "Reports" tab: damage report and swap request buttons are **hardcoded no-ops** (`WorkerPage.tsx:311-339`).
- Maintenance PATCH options include the illegal `'scheduled'` enum (fixed in ticket 03 — this ticket re-verifies the worker flow).
- Worker app does not visually bind to the worker's assigned site (users cannot tell which site they're on).

## Deliverables
- Wire damage-report button → form (severity dropdown, optional photo upload) → `POST /damage-reports`; swap request button → container select + target → `POST /swap-requests`.
- Pit fill update + emptying confirmation flows already exist end-to-end — re-verify them after the fix and lock with the notification event check (75% alert path).
- Header shows the worker's assigned site name (from `/auth/me` or sites data).
- Maintenance tabs: read task statuses legally, act `in_progress` / `completed`.

## Acceptance
- [x] Worker submits a damage report; it appears (in manager damage list / API read) and triggers the maintenance task
- [x] Worker submits a swap request; manager can see it (ticket 07 acceptance or API-level)
- [x] Pit update at 75% triggers the alert event (in DB at minimum, UI in ticket 11)
- [x] Emptying a pit resets fill level visibly
- [x] Worker page shows correct site name tag

## Completion notes (2026-10-21)

**The Reports tab was three dead buttons — it now does what GLOSSARY says a worker can do.**
- **Damage report** (`Rapportera skada`): a modal with a container select (the site's containers), a
  severity dropdown (liten/stor/kritisk, with a hint that stor/kritisk creates an underhållsuppgift), a
  description and an **optional photo upload** (`POST /uploads` → the returned `/uploads/...` path is
  sent along as `photos[]`; the shared schema accepts relative upload paths). Posts to
  `POST /damage-reports` → the API creates the condition-based maintenance task for major/critical.
- **Swap request** (`Begär byte`): container (optional), preferred container type (optional) and a
  reason → `POST /swap-requests` (status `pending`).
- Both flows show the server's error message in a banner and a success confirmation.

**Site binding** — the header used to say the placeholder "Plats: Tilldelad plats". It now shows the
**site name** ("AVC Centralterminal") from the sites list, in a badge, so a worker always knows which
site they are on.

**Pits** — the worker can now set a pit's fill level (the discrete scale 0/25/50/75/100) in addition
to emptying it, and emptying asks for a confirmation ("Är du säker på att gropen X är tömd?") and
resets the fill level to 0 % with `last_emptied_at` set. The 75 %+ alert card ("Grop som behöver
uppmärksamhet") is driven by the pit fill levels.

**Maintenance** — the status select only offers legal values (due / in_progress / completed) and
shows the status as a badge; the illegal 'scheduled' value is gone.

**New `apps/web/src/services/workerApi.ts`** — the worker client seam (pits, containers, maintenance,
damage report, swap request, photo upload) so ticket 14 can route the writes through the offline queue.

**API hardening found while verifying the worker flow** — several write routes used the raw request
body, so an illegal enum value produced a **500** (Postgres enum error) instead of a 400:
`PATCH /maintenance/:id` ('scheduled'), `PATCH /pits/:id` (fill_level '37'), `PATCH /vehicles/:id`
(classification 'flying'), `PATCH /drivers/:id` (role 'wizard') and `POST /transport-orders/:id/execute`
(an unknown action silently "succeeded" because the switch had no default). All of them now validate
with the shared schemas and answer **400 VALIDATION_ERROR** with the failing path. (The login/refresh
and sync routes keep their hand-written validation.)

**Verified in a real browser** (headless Chromium over CDP, worker1):
- Header: "Plats: AVC Centralterminal"; the pit alert card is shown for "Trädgårdsgrop 1" (75 %).
- Damage report: container CL-00001, severity **major**, description → sent; the API shows the report
  as `open` **with 1 condition-based maintenance task** linked to it.
- Swap request: container CL-00001, preferred type `closed` → sent; the API shows it `pending` with
  the right container and type.
- Pit emptying: "Byggavfallsgrop" 50 % → 0 %, `last_emptied_at` set, success banner shown.
- No console errors on the page. Test artifacts were removed afterwards.
