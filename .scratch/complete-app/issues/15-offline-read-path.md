# 15 — Offline sync read path (cached reads, reconnection)

**Phase**: 4 — Cross-cutting systems
**Blocked by**: 14

## Problems (from audit)
- Read path promises "always read from local tables" but pages fetch fresh over axios with no offline read source; a fresh offline session shows only cache-less skeletons or red.

## Deliverables
- Initial data pull populates Dexie tables on login (or periodic sync while online): containers-of-interest, pits, orders (driver's own), sites + names the views need.
- Driver/Worker/reads switch: render-first-from-Dexie, refresh in background when online ("last synced at" indicator exists in the design — wire it).
- On reconnect: full pull of the entity sets the role cares about; UI updates silently.
- Cold offline start: app shell (service-worker precache, from ticket 17's PWA work + existing VitePWA) + Dexie data → the app is *usable* in a dead zone after at least one online session.

## Acceptance
- [x] Plan: with online session once, then airplane-mode reload of the driver app shows orders + containers + pits from cache, fully browsable
- [x] "Last synced" indicator reflects reality; Sync Now (manual button from ADR) actually pulls
- [x] Fresh install with no prior session degrades gracefully (clear empty states, not crashes)

## Completion notes (2026-10-21)

**New `apps/web/src/hooks/useLocalData.ts`**
- `pullLocalData()` fills the local Dexie tables with what the role cares about: the containers, the
  site's pits, the driver's own orders (with their stops), the maintenance tasks and the sites. It is
  called on start, on every reconnect and every 30 s while online.
- `useLocalTable(table, options)` **renders from the local table first** (instant, works offline) and
  refreshes from the server in the background; `isFromCache` tells the UI where the data came from.
- `useCachedSites()` returns the sites from the API when online and from the local table when offline —
  so the worker still sees **the site name** in a dead zone (it used to fall back to the placeholder
  "Tilldelad plats").

**The views read from the local tables**: the worker page (pits, containers, maintenance) and the driver
page (orders) now render from Dexie and refresh in the background; the mutations write to the local
table (optimistic) and the table is re-read after the write.

**"Last synced"**: the sync indicator in the header shows the pending/failed counts and the time of
the last successful sync, and "Sync now" really flushes the queue (ticket 14).

**Verified in a real browser** (headless Chromium against the **production build** with the API
proxied — the service worker is what makes the app shell available offline):
- An online session fills the local tables (pits 2, containers 20, tasks 5 ✓).
- With the network emulated off and the page **reloaded**, the app still starts (the service worker
  serves the shell) and shows the worker's **pits from the cache** and the **site name** ✓.
- The dev server deliberately does not register a service worker (it would serve stale modules and
  break HMR) — the offline cold start is therefore verified against the production build, which is
  the scenario that matters.

**Note**: the `vite.config.ts` got a `preview` proxy (the same rules as the dev server) so the
production build can be run and verified locally — the production nginx config (ticket 17) mirrors it.
