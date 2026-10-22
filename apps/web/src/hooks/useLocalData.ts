// Offline read path (ticket 15).
//
// The driver/worker apps read from the local Dexie tables first (instant, works
// offline) and refresh in the background when online. The data is pulled when
// the app starts and after every reconnect.
import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { offlineDB } from '@avc/ui/lib/offlineDB';

export interface LocalData<T> {
  data: T[];
  isLoading: boolean;
  isFromCache: boolean;
  lastSyncedAt?: number;
  refresh: () => Promise<void>;
}

/** Pulls the data the role cares about into the local tables. */
export async function pullLocalData(options?: { driverId?: string; siteId?: string }): Promise<{ at: number; counts: Record<string, number> }> {
  const at = Date.now();
  const counts: Record<string, number> = {};

  // Containers
  try {
    const response = await api.get('/containers', { params: { limit: 200 } });
    const containers = response.data?.data ?? [];
    await offlineDB.containers.bulkPut(
      containers.map((c: any) => ({ ...c, _offline: false, _syncedAt: at }))
    );
    counts.containers = containers.length;
  } catch {
    // Offline — keep the cached rows.
  }

  // Pits (the worker's site)
  if (options?.siteId) {
    try {
      const response = await api.get(`/pits/site/${options.siteId}`);
      const pits = response.data ?? [];
      await offlineDB.pits.bulkPut(
        pits.map((p: any) => ({ ...p, _offline: false, _syncedAt: at }))
      );
      counts.pits = pits.length;
    } catch {
      // Offline
    }
  }

  // The driver's own orders (with their stops)
  if (options?.driverId) {
    try {
      const response = await api.get(`/dashboard/driver/${options.driverId}/shift`);
      const orders = response.data?.assigned_orders ?? [];
      await offlineDB.transportOrders.bulkPut(
        orders.map((o: any) => ({ ...o, _offline: false, _syncedAt: at }))
      );
      counts.transportOrders = orders.length;
    } catch {
      // Offline
    }
  }

  // Maintenance tasks
  try {
    const response = await api.get('/maintenance', { params: { limit: 100 } });
    const tasks = response.data?.data ?? [];
    await offlineDB.maintenanceTasks.bulkPut(
      tasks.map((t: any) => ({ ...t, _offline: false, _syncedAt: at }))
    );
    counts.maintenanceTasks = tasks.length;
  } catch {
    // Offline
  }

  // Sites (the names the views show)
  try {
    const response = await api.get('/sites');
    const sites = response.data?.data ?? response.data ?? [];
    await offlineDB.users.bulkPut(
      sites.map((s: any) => ({ ...s, _offline: false, _syncedAt: at }))
    );
    counts.sites = sites.length;
  } catch {
    // Offline
  }

  return { at, counts };
}

/**
 * The sites (with their names) — from the API when online, from the local
 * table when offline.
 */
export function useCachedSites(): any[] {
  const [cached, setCached] = useState<any[]>([]);
  const [online, setOnline] = useState<any[] | null>(null);

  useEffect(() => {
    const read = async () => {
      try {
        const response = await api.get('/sites');
        setOnline(response.data?.data ?? response.data ?? []);
      } catch {
        setOnline(null);
      }
      // The cached sites are always kept in sync (the names the views show).
      const local = await offlineDB.users.toArray();
      setCached(local);
    };
    void read();
    const onOnline = () => void read();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  return online && online.length > 0 ? online : cached;
}

/**
 * Reads a local table and refreshes it from the server when online.
 * The local rows are returned immediately (the UI never waits for the network).
 */
export function useLocalTable<T extends { id: string }>(
  tableName: 'containers' | 'pits' | 'transportOrders' | 'maintenanceTasks' | 'damageReports' | 'swapRequests',
  options?: { driverId?: string; siteId?: string; filter?: (row: T) => boolean }
): LocalData<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>(undefined);

  const table = (offlineDB as any)[tableName] as {
    toArray: () => Promise<T[]>;
  };

  const readLocal = async () => {
    const local = await table.toArray();
    setRows(local);
    setIsLoading(false);
  };

  const refresh = async () => {
    try {
      const result = await pullLocalData(options);
      setLastSyncedAt(result.at);
      setIsFromCache(false);
    } catch {
      // Offline — the cached rows stay.
    }
    await readLocal();
  };

  useEffect(() => {
    let cancelled = false;

    // 1. Render from the local tables immediately.
    (async () => {
      const local = await table.toArray();
      if (cancelled) return;
      setRows(local);
      setIsLoading(false);
      setIsFromCache(true);
    })();

    // 2. Refresh from the server in the background.
    void refresh();

    // 3. Refresh again when the connection comes back.
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);

    // 4. Keep it fresh while online (the same 30 s interval the app used
    //    before the offline path existed).
    const interval = window.setInterval(() => {
      if (navigator.onLine) void refresh();
    }, 30000);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, options?.driverId, options?.siteId]);

  const filtered = options?.filter ? rows.filter(options.filter) : rows;

  return {
    data: filtered,
    isLoading,
    isFromCache,
    ...(lastSyncedAt ? { lastSyncedAt } : {}),
    refresh,
  };
}
