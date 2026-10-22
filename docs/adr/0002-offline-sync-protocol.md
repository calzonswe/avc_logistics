# ADR 0002: Offline-First Sync Protocol

**Date**: 2026-10-13
**Status**: Accepted

## Context

Driver and Worker mobile apps must work fully offline (poor cellular at sites). Data includes: container fill levels, pit fill levels, damage reports, swap requests, transport order execution, container location updates. All mutations must sync when connectivity returns.

## Decision

### Client-Side (PWA / IndexedDB)

**Storage**: Dexie.js (wrapper over IndexedDB) for typed tables, indexes, and transactions.

**Data Model** (client mirrors server subset):
```typescript
interface OfflineQueueItem {
  id: string;              // UUID
  entityType: 'container' | 'pit' | 'transportOrder' | 'maintenanceTask' | 'damageReport';
  entityId: string;        // Server ID or temp ID for creates
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;  // Full entity snapshot for creates/updates
  timestamp: number;       // Client Unix ms
  synced: boolean;
  retryCount: number;
}
```

**Write Path**:
1. User action → optimistic UI update
2. Write to local entity table (e.g., `containers`)
3. Append to `offlineQueue` with `synced: false`
4. Register background sync (Service Worker `sync` event) + immediate `fetch` attempt

**Read Path**:
- Always read from local tables (instant, works offline)
- UI shows "last synced at" indicator

### Server-Side (REST API)

**Endpoints**:
```
POST   /api/sync              # Batch sync: client sends queue, server responds with results
GET    /api/sync/state        # Client pulls server state for entities it cares about
```

**Batch Sync Request**:
```json
{
  "clientId": "device-uuid",
  "lastSyncedAt": 1700000000000,
  "mutations": [
    { "id": "mu-1", "entityType": "container", "entityId": "cont-123", "operation": "update", "payload": { "fillLevel": 75, "locationId": "spot-456" }, "timestamp": 1700000100000 }
  ]
}
```

**Batch Sync Response**:
```json
{
  "results": [
    { "mutationId": "mu-1", "status": "applied", "serverEntity": { "id": "cont-123", "fillLevel": 75, "locationId": "spot-456", "updatedAt": 1700000200000 } },
    { "mutationId": "mu-2", "status": "conflict", "serverEntity": { "id": "cont-123", "fillLevel": 50, "updatedAt": 1700000150000 }, "resolution": "server-wins" }
  ],
  "serverTime": 1700000200000
}
```

**Conflict Resolution**: **Server Wins**
- Server applies mutations in timestamp order
- If server entity `updatedAt` > client mutation timestamp → conflict
- Response includes server entity; client overwrites local, re-renders
- Low probability: containers moved by one driver; pits updated by one site's workers

### Sync Triggers
1. **Immediate**: After each mutation, `navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-data'))`
2. **Periodic**: Every 30s when online (fallback if background sync unsupported)
3. **Manual**: "Sync Now" button in app header
4. **On Focus**: `window.addEventListener('focus', attemptSync)`

### Offline Capabilities by Role

| Action | Driver | Worker |
|--------|--------|--------|
| View assigned orders | ✅ | — |
| View container/pit list | ✅ | ✅ |
| Update fill level | — | ✅ |
| Report damage | — | ✅ |
| Request swap | — | ✅ |
| Execute transport (pickup/dropoff) | ✅ | — |
| Update container location | ✅ | — |
| Scan container QR | ✅ | ✅ |

### Out-of-Scope for MVP
- Real-time collaboration (two workers editing same pit)
- Conflict UI (auto-resolve server-wins; toast "Data updated from server")
- Partial sync (always full entity snapshot)
- Encryption at rest in IndexedDB (device storage assumed secure)

## Consequences

### Positive
- True offline-first: zero latency writes, works in dead zones
- Simple conflict model (server-wins) = predictable, no merge UI
- Dexie provides reactive queries; UI stays fast
- Batch sync reduces round-trips; efficient on flaky connections

### Negative
- Eventual consistency: two devices may briefly show different fill levels
- Server-wins loses local edits if conflict (mitigated: low contention domains)
- IndexedDB storage quota (~50-100MB) — sufficient for 50 containers × shifts of data
- iOS Safari limits background sync; manual sync button required

## Alternatives Considered

| Alternative | Rejected Because |
|-------------|------------------|
| CRDT / Automerge / Yjs | Overkill; data is low-contention, server-wins sufficient |
| Optimistic UI only (no local DB) | Data lost on refresh/close; not true offline |
| Separate offline DB per entity (RxDB, WatermelonDB) | Dexie is lighter, TypeScript-native, no RxJS dependency |
| Server-push (WebSocket/SSE) for sync | Doesn't work offline; adds complexity |

## Implementation Notes

- **Service Worker**: Workbox `generateSW` with `runtimeCaching` for API GETs; `backgroundSync` for POST `/api/sync`
- **Queue Processing**: FIFO; exponential backoff (1s, 2s, 4s, max 60s) on network errors
- **Temp IDs**: Client generates UUID for creates; server responds with real ID; client updates local references
- **Schema Migration**: Dexie versioning; add columns only (no deletes) for backward compatibility