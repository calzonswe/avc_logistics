# Plan: Complete the AVC Management App (production-ready)

> Basis: audit of 2026-10-21, `GLOSSARY.md`, ADR 0001–0004, and session decisions.
> Finish line: complete, production-ready application per `docs/adr/0004-scope-complete-application.md`.
> Start from the top. A ticket's **Blocked by** must be complete before starting it.

## How to use this checklist

- Each ticket is one file in `issues/` with its own acceptance checklist. Tick acceptance boxes in the ticket as you go, and tick the ticket's checkbox in the index below when done.
- Work tickets top-down unless a `Blocked by` edge says otherwise (an edge only blocks its own downstream ticket, so parallel work is fine).
- Development commands and known traps: see root `AGENTS.md`. Rules of domain: see `GLOSSARY.md`.

## Phase 1 — Unbreak (app can run, dev loop works)

- [x] [01 — Fix auth store, compile, login landing & role redirects](issues/01-fix-auth-store-and-routing.md)
- [x] [02 — Fix dev loop: root db scripts, uploads dir, seed overhaul](issues/02-fix-dev-loop-and-seed.md)
- [x] [03 — API crash fixes: order detail 500, dashboard stats mismatch, invalid enums](issues/03-api-crash-fixes.md)

## Phase 2 — Repair broken data paths (create/write actually works)

- [x] [04 — Companies endpoint + real container forms + ownership transfer UI](issues/04-companies-and-container-forms.md)
- [x] [05 — Map editor: create endpoints, field alignment, dashboard map markers](issues/05-map-editor-endpoints.md)
- [x] [06 — Damage reports & swap requests API (new routes + tables wired)](issues/06-damage-reports-and-swaps.md)

## Phase 3 — Complete the four views

- [x] [07 — Manager: transport order builder with stops, assignment, suggestions](issues/07-manager-transport-orders.md)
- [x] [08 — Driver app: shift start, order execution, real QR scanner](issues/08-driver-app.md)
- [x] [09 — Worker app: wire damage/swap handlers, site naming, verified flows](issues/09-worker-app.md)
- [x] [10 — Dashboard: kiosk mode + filled-in site map](issues/10-dashboard-kiosk.md)

## Phase 4 — Cross-cutting systems

- [x] [11 — In-app notification bell + event wiring (4 events)](issues/11-notification-bell.md)
- [x] [12 — Minimal WebSocket dispatch layer with polling fallback](issues/12-websocket-dispatch.md) *(blocked by 11)*
- [x] [13 — Web-push: schema, subscribe UI, service worker, VAPID](issues/13-web-push.md) *(blocked by 11; external: HTTPS access + VAPID secrets)*
- [x] [14 — Offline sync write path (queue → batch → server-wins)](issues/14-offline-write-path.md) *(blocked by 08, 09)*
- [x] [15 — Offline sync read path (cached reads, reconnection)](issues/15-offline-read-path.md) *(blocked by 14)*
- [x] [16 — i18n: Swedish primary + English](issues/16-i18n.md)

## Phase 5 — Production hardening

- [x] [17 — Production deploy: Dockerfiles, nginx, compose, prod env](issues/17-production-deploy.md) *(blocked by 01–16)*
- [x] [18 — Critical-path tests (order lifecycle, sync conflicts, ownership, guards)](issues/18-critical-path-tests.md) *(blocked by 14)*
- [x] [19 — Acceptance walkthrough: all four roles end-to-end, fix fallout](issues/19-acceptance-walkthrough.md) *(blocked by 17, 18)*

## Standing rules for every ticket

1. Respect `AGENTS.md` traps: shared-types rebuild, CWD-sensitive migrate, `.bak` files, no git (no rollback — keep patches small).
2. Domain rules live in `GLOSSARY.md`; ADR decisions already made are not re-litigated.
3. Tests first where the ticket owns a critical path (mark in ticket); Vitest exists in `@avc/api` and `@avc/web`.
4. Every API change keeps Zod validation and updates `packages/shared-types/src/api.ts` (rebuild `@avc/shared-types` after edits).
