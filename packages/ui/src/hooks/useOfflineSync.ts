// useOfflineSync - the offline write path (ADR 0002).
//
// The queue lives in Dexie (IndexedDB), the flush is a batch to
// POST /api/v1/sync and the conflicts are resolved server-wins. This hook is
// the React-facing view of that machinery; the app itself uses the service
// modules directly (see apps/web/src/services/*Api.ts).
import { useState, useEffect, useCallback } from 'react';
import {
  enqueueMutation,
  flushSyncQueue,
  getSyncQueueInfo,
  setConflictHandler,
  type OfflineMutation,
} from '../lib/syncService.js';

export interface OfflineSyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSynced: Date | null;
  pendingChanges: number;
  error: string | null;
}

export interface UseOfflineSyncOptions {
  /** Called when the server wins a conflict (the local copy is overwritten). */
  onConflict?: (entityType: string, serverEntity: Record<string, unknown>) => void;
  /** Interval for the periodic flush (default 30 s, per ADR). */
  syncInterval?: number;
}

export function useOfflineSync(options: UseOfflineSyncOptions = {}) {
  const [status, setStatus] = useState<OfflineSyncStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    lastSynced: null,
    pendingChanges: 0,
    error: null,
  });

  const refresh = useCallback(async () => {
    const info = await getSyncQueueInfo();
    setStatus((prev) => ({
      ...prev,
      pendingChanges: info.pending,
      lastSynced: info.lastSync ? new Date(info.lastSync) : prev.lastSynced,
    }));
  }, []);

  useEffect(() => {
    void refresh();

    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, isOnline: true, error: null }));
      void flushSyncQueue();
    };
    const handleOffline = () => setStatus((prev) => ({ ...prev, isOnline: false }));

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      setConflictHandler((entityType, serverEntity) => {
        options.onConflict?.(entityType, serverEntity);
        void refresh();
      });
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMutation = useCallback(
    async (
      entityType: OfflineMutation['entityType'],
      entityId: string,
      operation: OfflineMutation['operation'],
      payload: Record<string, unknown>
    ) => {
      await enqueueMutation(entityType, entityId, operation, payload);
      await refresh();
    },
    [refresh]
  );

  const triggerSync = useCallback(async () => {
    setStatus((prev) => ({ ...prev, isSyncing: true, error: null }));
    try {
      await flushSyncQueue();
      await refresh();
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Okänt fel vid synkronisering',
      }));
    } finally {
      setStatus((prev) => ({ ...prev, isSyncing: false }));
    }
  }, [refresh]);

  return {
    status,
    addMutation,
    forceSync: triggerSync,
    queue: [] as OfflineMutation[],
  };
}
