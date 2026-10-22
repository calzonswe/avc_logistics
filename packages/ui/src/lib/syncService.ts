// Sync Service - the offline write path (ADR 0002).
//
// Every driver/worker mutation goes: optimistic UI → local Dexie table →
// queue item → background sync + immediate flush. The flush is a **batch** to
// POST /api/v1/sync (not a replay of the individual CRUD routes).
//
// Conflicts are resolved **server-wins**: the server's entity overwrites the
// local copy and the user gets a toast.
import {
  offlineDB,
  getPendingMutations,
  markMutationSynced,
  markMutationFailed,
  clearOldSyncedMutations,
  getSyncStatus,
  queueMutation,
  type OfflineMutation,
} from './offlineDB.js';

const SYNC_INTERVAL = 30000; // 30 seconds (ADR: periodic sync)
const SYNC_TAG = 'avc-sync';
const MAX_BACKOFF_MS = 60000; // ADR: 1s -> 2s -> 4s, cap 60s

let syncInterval: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let apiClient: any = null;
let clientId = '';

/** The client id (a stable per-device uuid). */
export function getClientId(): string {
  if (clientId) return clientId;
  const stored = localStorage.getItem('avc_client_id');
  if (stored) {
    clientId = stored;
    return clientId;
  }
  clientId = crypto.randomUUID();
  localStorage.setItem('avc_client_id', clientId);
  return clientId;
}

export function setApiClient(client: any): void {
  apiClient = client;
}

export function setSyncStatusCallback(cb: (status: { pending: number; failed: number; lastSync?: number }) => void): void {
  if (typeof window !== 'undefined') {
    (window as any).__avc_sync_callback = cb;
  }
}

async function notifySyncStatus(): Promise<void> {
  if (typeof window !== 'undefined') {
    const cb = (window as any).__avc_sync_callback;
    if (cb) {
      const status = await getSyncStatus();
      cb(status);
    }
  }
}

/** Called when the server's entity wins a conflict. */
let conflictHandler: ((entityType: string, serverEntity: Record<string, unknown>) => void) | null = null;
export function setConflictHandler(handler: (entityType: string, serverEntity: Record<string, unknown>) => void): void {
  conflictHandler = handler;
}

/**
 * The entity types the client uses (camelCase, as in the Dexie schema) and the
 * names the server expects (snake_case, as in the API contract).
 */
const SERVER_ENTITY_TYPE: Record<string, string> = {
  container: 'container',
  transportOrder: 'transport_order',
  maintenanceTask: 'maintenance_task',
  pit: 'pit',
  damageReport: 'damage_report',
  swapRequest: 'swap_request',
  user: 'user',
};

const CLIENT_ENTITY_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(SERVER_ENTITY_TYPE).map(([client, server]) => [server, client])
);

/** Writes the server's entity into the local table (server-wins). */
async function applyServerEntity(entityType: string, serverEntity: Record<string, unknown> | null): Promise<void> {
  if (!serverEntity) return;
  const id = (serverEntity as any).id;
  if (!id) return;
  const row = { ...serverEntity, _offline: false, _syncedAt: Date.now() };
  const localType = CLIENT_ENTITY_TYPE[entityType] ?? entityType;
  switch (localType) {
    case 'container':
      await offlineDB.containers.put(row as any);
      break;
    case 'pit':
      await offlineDB.pits.put(row as any);
      break;
    case 'transportOrder':
      await offlineDB.transportOrders.put(row as any);
      break;
    case 'maintenanceTask':
      await offlineDB.maintenanceTasks.put(row as any);
      break;
    case 'damageReport':
      await offlineDB.damageReports.put(row as any);
      break;
    case 'swapRequest':
      await offlineDB.swapRequests.put(row as any);
      break;
  }
}

/**
 * Flushes the queue: one batch request to POST /api/v1/sync.
 * Returns the number of mutations that were applied.
 */
export async function flushSyncQueue(): Promise<{ applied: number; conflicts: number; failed: number }> {
  if (!apiClient) {
    console.warn('No API client configured for sync');
    return { applied: 0, conflicts: 0, failed: 0 };
  }
  if (isSyncing) return { applied: 0, conflicts: 0, failed: 0 };

  const pending = await getPendingMutations();
  if (pending.length === 0) return { applied: 0, conflicts: 0, failed: 0 };

  isSyncing = true;
  let applied = 0;
  let conflicts = 0;
  let failed = 0;

  try {
    const response = await apiClient.post('/sync', {
      client_id: getClientId(),
      last_synced_at: new Date().toISOString(),
      mutations: pending.map((m) => ({
        // The server identifies a mutation by this id (a UUID, ADR 0002).
        id: m.mutationId,
        // The server uses snake_case entity types.
        entity_type: SERVER_ENTITY_TYPE[m.entityType] ?? m.entityType,
        entity_id: m.entityId,
        operation: m.operation,
        payload: m.payload,
        timestamp: new Date(m.timestamp).toISOString(),
      })),
    });

    const results: Array<{
      mutation_id: string;
      status: 'applied' | 'conflict' | 'failed';
      server_entity?: Record<string, unknown> | null;
      error?: string;
    }> = response.data?.results ?? [];
    const byId = new Map(results.map((r) => [String(r.mutation_id), r]));

    for (const mutation of pending) {
      const result = byId.get(mutation.mutationId);
      if (!result) {
        // The server did not answer for this mutation — keep it queued.
        await markMutationFailed(mutation.id!, 'Inget svar från servern');
        failed++;
        continue;
      }

      if (result.status === 'applied') {
        await applyServerEntity(mutation.entityType, result.server_entity ?? null);
        await markMutationSynced(mutation.id!);
        applied++;
      } else if (result.status === 'conflict') {
        // Server wins: overwrite the local copy with the server's entity.
        await applyServerEntity(mutation.entityType, result.server_entity ?? null);
        await markMutationSynced(mutation.id!);
        conflicts++;
        conflictHandler?.(mutation.entityType, result.server_entity ?? {});
      } else {
        await markMutationFailed(mutation.id!, result.error ?? 'Okänt fel');
        failed++;
      }
    }

    await notifySyncStatus();
    return { applied, conflicts, failed };
  } catch (err) {
    // Network error: keep the queue and retry with a backoff.
    for (const mutation of pending) {
      await markMutationFailed(mutation.id!, err instanceof Error ? err.message : 'Nätverksfel');
    }
    await notifySyncStatus();
    return { applied, conflicts, failed: pending.length };
  } finally {
    isSyncing = false;
  }
}

/** Registers the background sync (the service worker flushes the queue). */
async function registerBackgroundSync(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    // `navigator.serviceWorker.ready` never resolves when no service worker is
    // registered (the dev server does not register one) — race it with a
    // timeout so the queue is never blocked.
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2000)),
    ]);
    if (!registration) return;
    const syncManager = (registration as any).sync;
    if (syncManager?.register) {
      await syncManager.register(SYNC_TAG);
    }
  } catch {
    // Background sync is not supported (iOS Safari) — the periodic sync covers it.
  }
}

/**
 * Queues a mutation and tries to flush immediately.
 * This is the entry point for every driver/worker write.
 */
export async function enqueueMutation(
  entityType: OfflineMutation['entityType'],
  entityId: string,
  operation: OfflineMutation['operation'],
  payload: any
): Promise<number> {
  const id = await queueMutation(entityType, entityId, operation, payload);
  await notifySyncStatus();
  // Fire and forget: the background sync registration must never block the write.
  void registerBackgroundSync();
  // Immediate flush — the queue is still there if the network is down.
  void flushSyncQueue();
  return id;
}

/** Starts the periodic sync + the focus listener (ADR: sync triggers). */
export function startSyncService(): void {
  if (syncInterval) return;

  syncInterval = setInterval(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void flushSyncQueue();
    }
  }, SYNC_INTERVAL);

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => {
      if (navigator.onLine) void flushSyncQueue();
    });
    window.addEventListener('online', () => {
      void flushSyncQueue();
    });
  }
}

/** Stops the periodic sync (tests). */
export function stopSyncService(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export { getSyncStatus, clearOldSyncedMutations, queueMutation };
export type { OfflineMutation };

/** Manual "Sync now" (ADR: manual trigger). */
export async function forceSync(): Promise<{ applied: number; conflicts: number; failed: number }> {
  return flushSyncQueue();
}

/** The queue info for the status indicator. */
export async function getSyncQueueInfo(): Promise<{
  pending: number;
  failed: number;
  lastSync?: number;
}> {
  const status = await getSyncStatus();
  return {
    pending: status.pendingMutations,
    failed: status.failedMutations,
    ...(status.lastSync ? { lastSync: status.lastSync } : {}),
  };
}
