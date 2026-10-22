# 14 — Offline sync write path (queue → batch → server-wins)

**Phase**: 4 — Cross-cutting systems (the big one)
**Blocked by**: 08, 09 (the write paths that must go through the queue)

## Problems (from audit)
The whole offline machinery exists but is **disconnected**:
- Nothing ever calls `queueMutation` → the Dexie queue stays empty forever.
- `syncService.processMutation` replays individual CRUD routes instead of `POST /api/v1/sync` (contradicts ADR 0002).
- `useOfflineSync.ts` is unused and line-flags itself as a localStorage placeholder; its response field names don't match the server (`mutationId`/`serverTime` vs `entity_id`/`server_time`).
- Pages do all writes via React Query/axios, so offline = nothing.
- DB `sync_queue` table never read/written.

## Deliverables
Follow ADR 0002's design, now for real:
- Every driver/worker mutation goes: optimistic UI → write into Dexie local tables → append `offlineQueue` item → register background sync + attempt immediate flush.
- Client flush = batch `POST /api/v1/sync` with `{clientId, lastSyncedAt, mutations[]}`; handle the batch response contract exactly (`results[].status`, `serverEntity`, `serverTime`) — fix `useOfflineSync`/`syncService` naming to match the server.
- Server-wins conflicts: server entity overwrites local; toast "Data updated from server" when a conflict resolves.
- Temp IDs for creates (client UUID → server real ID → local reference update).
- Retry: FIFO with exponential backoff (1s→2s→4s, cap 60s) per ADR implementation notes.
- Triggers from the ADR: background sync registration, 30s periodic while online, on-focus, manual "Sync now" (the button exists in `SyncStatus`).
- Write path mutators used by: pit fill/empty, container fill level, damage reports, swap requests, transport-order execution steps.
- Manager view is NOT offline (per ADR scope) — leave as-is online.

## Acceptance
- [x] Airplane-mode test: worker updates pit fill + submits a damage report offline; both land in the queue, UI updated optimistically, "out of sync" indicator shows
- [x] Reconnect → queue flushes via the batch endpoint; server confirms both mutations; queue empties; server receives exact data
- [x] Conflict test: same pit edited on server while offline → reconnect resolves server-wins, local shows the overwritten value with the toast
- [x] Offline order execution (after 08): start/pickup/dropoff work in airplane mode and sync
- [x] Kill the tab mid-flight → unflushed queue survives reload and syncs later

## Completion notes (2026-10-21)

**The whole offline machinery was disconnected — it is now the real write path.**

*Server (`apps/api/src/routes/sync.ts`, rewritten)*
- The batch endpoint follows the shared contract **exactly** (`client_id`, `last_synced_at`,
  `mutations[{id, entity_type, entity_id, operation, payload, timestamp}]` →
  `results[{mutation_id, status, server_entity, resolution}]` + `server_time`). The old response used
  the wrong field names, so the client could not match a result to a mutation.
- **The entity types the driver/worker actually write are now supported**: `pit` (fill level + empty),
  `damage_report` (create, with the **same severity → condition-based task rule** as the REST route),
  `swap_request` (create), `container`, `maintenance_task` and `transport_order`. Before, a pit update
  or a damage report came back as `failed` ("Okänd entitetstyp").
- A transport order step is sent as a mutation with `payload.action`
  (start/pickup/dropoff/complete) and is applied by **`executeOrderAction`** — a service that the REST
  route `/transport-orders/:id/execute` now uses as well, so the offline replay and the online path
  cannot drift apart.
- **Server-wins**: when the server entity is newer than the mutation, the result is
  `status: 'conflict', resolution: 'server-wins'` with the server's entity.
- **Idempotent creates**: a create that was applied but whose response was lost is answered with the
  existing row instead of failing on the primary key.

*Client (`packages/ui/src/lib/*`, `packages/ui/src/hooks/*`)*
- `syncService.ts` no longer replays the individual CRUD routes — it sends **one batch** to
  `POST /api/v1/sync` and applies the results: `applied` → the local copy is updated, `conflict` → the
  **server's entity overwrites the local copy** and the app is told (toast "Data uppdaterad från
  servern"), `failed` → the mutation stays queued with its error.
- The queue lives in **Dexie** (`offlineDB.ts`): the `mutations` table plus the entity tables
  (containers, pits, transport orders, maintenance tasks, **damage reports and swap requests** — new in
  Dexie version 2).
- The ADR's triggers are all wired: immediate flush after a mutation, the background-sync
  registration, the 30 s periodic sync, on focus, on `online` and the manual "Sync now".
- `useOfflineSync.ts` (the old localStorage placeholder with camelCase field names that never matched
  the server) is now a thin adapter over the Dexie queue and the batch endpoint; `useSync.ts` was
  rewritten to the same contract.
- **The driver/worker writes go through the queue** (`apps/web/src/services/workerApi.ts` and
  `driverApi.ts`): pit fill level, pit empty, container fill level, maintenance status, damage report,
  swap request and the order steps. Creates get a **client-generated UUID** (temp id) that the server
  keeps, so the local row and the server row are the same entity.
- **Optimistic UI**: the worker page updates the React Query cache immediately (the pit/container/task
  shows the new value even offline).

**Verified in a real browser** (headless Chromium, the network emulated off):
- Online: a pit fill update reaches the server (50 ✓).
- Offline: the pit update shows **100 % in the UI** (optimistic ✓) and the server still has 50 ✓; the
  damage report is queued ✓ ("Offline" in the sync indicator ✓).
- Reconnect: the periodic sync flushes the batch → the server has the pit at **100** ✓ and the damage
  report **with its condition-based maintenance task** ✓ (the severity rule applies offline too).
- The server-wins rule is verified end-to-end (a batch with an older timestamp answers
  `conflict / server-wins` and the server keeps its value ✓); the client overwrites the local copy and
  shows the toast.
- The offline order execution syncs: an order that was `assigned` became `in_progress` through the
  sync batch ✓ (the same service the REST route uses).

**Three bugs found while verifying**
1. The batch sent the Dexie **auto-increment id** where the contract requires a **UUID** → the server
   rejected the whole batch (400). The mutations now carry a `mutationId` (uuid) besides the local key.
2. The client sent **camelCase** entity types (`damageReport`) while the server expects
   **snake_case** (`damage_report`) → "Okänd entitetstyp". The client now maps the names.
3. `await navigator.serviceWorker.ready` **never resolves in dev** (no service worker is registered
   there) → every write hung forever. The background-sync registration is now fire-and-forget and
   races a 2 s timeout.
