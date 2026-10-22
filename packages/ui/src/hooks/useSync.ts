// Sync Hook - React hook for the offline sync (ADR 0002)
import { useState, useEffect, useCallback } from 'react';
import {
  startSyncService,
  stopSyncService,
  forceSync,
  getSyncQueueInfo,
  setConflictHandler,
  enqueueMutation,
  type OfflineMutation,
} from '../lib/syncService.js';

export interface SyncStatus {
  pending: number;
  failed: number;
  lastSync?: number;
  isSyncing: boolean;
  isOnline: boolean;
}

export interface UseSyncOptions {
  /** Called when the server wins a conflict (the local copy is overwritten). */
  onConflict?: (entityType: string, serverEntity: Record<string, unknown>) => void;
}

export function useSync(options: UseSyncOptions = {}): {
  status: SyncStatus;
  forceSync: () => Promise<void>;
  queueMutation: (
    entityType: OfflineMutation['entityType'],
    entityId: string,
    operation: OfflineMutation['operation'],
    payload: any
  ) => Promise<void>;
} {
  const [status, setStatus] = useState<SyncStatus>({
    pending: 0,
    failed: 0,
    isSyncing: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  });

  useEffect(() => {
    const updateStatus = async () => {
      try {
        const info = await getSyncQueueInfo();
        setStatus((prev) => ({
          ...prev,
          pending: info.pending,
          failed: info.failed,
          ...(info.lastSync ? { lastSync: info.lastSync } : {}),
        }));
      } catch (err) {
        console.error('Failed to get sync queue info:', err);
      }
    };

    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, isOnline: true }));
      void updateStatus();
    };
    const handleOffline = () => setStatus((prev) => ({ ...prev, isOnline: false }));

    if (typeof window !== 'undefined') {
      (window as any).__avc_sync_callback = setStatus;
      startSyncService();

      // Server-wins conflicts are reported to the app (toast "Data updated
      // from server").
      setConflictHandler((entityType, serverEntity) => {
        options.onConflict?.(entityType, serverEntity);
      });

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      void updateStatus();
    }

    return () => {
      if (typeof window !== 'undefined') {
        (window as any).__avc_sync_callback = null;
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
      stopSyncService();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleForceSync = useCallback(async () => {
    setStatus((prev) => ({ ...prev, isSyncing: true }));
    try {
      await forceSync();
      const info = await getSyncQueueInfo();
      setStatus((prev) => ({
        ...prev,
        pending: info.pending,
        failed: info.failed,
        ...(info.lastSync ? { lastSync: info.lastSync } : {}),
        isSyncing: false,
      }));
    } catch (err) {
      console.error('Force sync failed:', err);
      setStatus((prev) => ({ ...prev, isSyncing: false }));
    }
  }, []);

  const handleQueueMutation = useCallback(
    async (
      entityType: OfflineMutation['entityType'],
      entityId: string,
      operation: OfflineMutation['operation'],
      payload: any
    ) => {
      await enqueueMutation(entityType, entityId, operation, payload);
      const info = await getSyncQueueInfo();
      setStatus((prev) => ({ ...prev, pending: info.pending }));
    },
    []
  );

  return {
    status,
    forceSync: handleForceSync,
    queueMutation: handleQueueMutation,
  };
}
