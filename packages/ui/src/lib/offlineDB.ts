// Offline Database - Dexie wrapper for IndexedDB
import Dexie, { Table } from 'dexie';
import type { Container, TransportOrder, MaintenanceTask, Pit, User } from '@avc/shared-types';

export interface OfflineMutation {
  /** The local (auto-increment) key. */
  id?: number;
  /** The id the server knows the mutation by (ADR 0002: a UUID). */
  mutationId: string;
  entityType:
    | 'container'
    | 'transportOrder'
    | 'maintenanceTask'
    | 'pit'
    | 'user'
    | 'damageReport'
    | 'swapRequest';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: any;
  timestamp: number;
  synced: boolean;
  retryCount: number;
  error?: string;
}

export interface OfflineContainer extends Container {
  _offline?: boolean;
  _syncedAt?: number;
}

export interface OfflineTransportOrder extends TransportOrder {
  _offline?: boolean;
  _syncedAt?: number;
}

export interface OfflineMaintenanceTask extends MaintenanceTask {
  _offline?: boolean;
  _syncedAt?: number;
}

export interface OfflinePit extends Pit {
  _offline?: boolean;
  _syncedAt?: number;
}

export interface OfflineUser extends User {
  _offline?: boolean;
  _syncedAt?: number;
}

export interface OfflineDamageReport {
  id: string;
  container_id: string;
  severity: 'minor' | 'major' | 'critical';
  description: string;
  photos?: unknown;
  status: 'open' | 'acknowledged' | 'resolved';
  created_at?: string;
  _offline?: boolean;
  _syncedAt?: number;
}

export interface OfflineSwapRequest {
  id: string;
  site_id: string;
  current_container_id?: string | null;
  preferred_container_type?: string | null;
  reason?: string | null;
  status: 'pending' | 'approved' | 'fulfilled' | 'cancelled';
  created_at?: string;
  _offline?: boolean;
  _syncedAt?: number;
}

class OfflineDB extends Dexie {
  containers!: Table<OfflineContainer>;
  transportOrders!: Table<OfflineTransportOrder>;
  maintenanceTasks!: Table<OfflineMaintenanceTask>;
  pits!: Table<OfflinePit>;
  users!: Table<OfflineUser>;
  damageReports!: Table<OfflineDamageReport>;
  swapRequests!: Table<OfflineSwapRequest>;
  mutations!: Table<OfflineMutation>;

  constructor() {
    super('AVC_OfflineDB');
    this.version(1).stores({
      containers: 'id, container_number, qr_code_value, type, fill_level, status, owning_company_id, current_site_id, current_spot_id, updated_at',
      transportOrders: 'id, order_number, status, assigned_driver_id, assigned_vehicle_id, planned_start_at, updated_at',
      maintenanceTasks: 'id, container_id, type, status, scheduled_for, assigned_to, updated_at',
      pits: 'id, site_id, name, fill_level, is_active, updated_at',
      users: 'id, email, full_name, role, site_id, is_active',
      mutations: '++id, entityType, entityId, operation, timestamp, synced',
    });
    // Version 2 adds the worker's own entities (damage reports, swap requests).
    this.version(2).stores({
      damageReports: 'id, container_id, severity, status, created_at',
      swapRequests: 'id, site_id, status, created_at',
    });
  }
}

export const offlineDB = new OfflineDB();

// Dev aid: inspect the queue from the browser console.
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  (window as any).__avcOfflineDB = offlineDB;
}

// Initialize database
offlineDB.open().catch(err => {
  console.error('Failed to open offline database:', err);
});

// Mutation queue functions
export async function queueMutation(
  entityType: OfflineMutation['entityType'],
  entityId: string,
  operation: OfflineMutation['operation'],
  payload: any
): Promise<number> {
  return offlineDB.mutations.add({
    mutationId: crypto.randomUUID(),
    entityType,
    entityId,
    operation,
    payload,
    timestamp: Date.now(),
    synced: false,
    retryCount: 0,
  });
}

export async function getPendingMutations(): Promise<OfflineMutation[]> {
  return offlineDB.mutations
    .filter(m => !m.synced)
    .sortBy('timestamp');
}

export async function markMutationSynced(id: number): Promise<void> {
  await offlineDB.mutations.update(id, { synced: true });
}

export async function markMutationFailed(id: number, error: string): Promise<void> {
  const current = await offlineDB.mutations.get(id);
  await offlineDB.mutations.update(id, {
    error,
    retryCount: (current?.retryCount ?? 0) + 1,
  });
}

export async function clearOldSyncedMutations(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const cutoff = Date.now() - olderThanMs;
  await offlineDB.mutations
    .filter(m => m.synced && m.timestamp < cutoff)
    .delete();
}

// Entity cache functions
export async function cacheContainer(container: any): Promise<void> {
  await offlineDB.containers.put({ ...container, _offline: false, _syncedAt: Date.now() });
}

export async function getCachedContainer(id: string): Promise<any | undefined> {
  return offlineDB.containers.get(id);
}

export async function getAllCachedContainers(): Promise<any[]> {
  return offlineDB.containers.toArray();
}

export async function cacheTransportOrder(order: any): Promise<void> {
  await offlineDB.transportOrders.put({ ...order, _offline: false, _syncedAt: Date.now() });
}

export async function getCachedTransportOrder(id: string): Promise<any | undefined> {
  return offlineDB.transportOrders.get(id);
}

export async function getAllCachedTransportOrders(): Promise<any[]> {
  return offlineDB.transportOrders.toArray();
}

export async function cacheMaintenanceTask(task: any): Promise<void> {
  await offlineDB.maintenanceTasks.put({ ...task, _offline: false, _syncedAt: Date.now() });
}

export async function getCachedMaintenanceTask(id: string): Promise<any | undefined> {
  return offlineDB.maintenanceTasks.get(id);
}

export async function cachePit(pit: any): Promise<void> {
  await offlineDB.pits.put({ ...pit, _offline: false, _syncedAt: Date.now() });
}

export async function getCachedPit(id: string): Promise<any | undefined> {
  return offlineDB.pits.get(id);
}

export async function getAllCachedPits(): Promise<any[]> {
  return offlineDB.pits.toArray();
}

export async function cacheUser(user: any): Promise<void> {
  await offlineDB.users.put({ ...user, _offline: false, _syncedAt: Date.now() });
}

export async function getCachedUser(id: string): Promise<any | undefined> {
  return offlineDB.users.get(id);
}

// Sync status
export async function getSyncStatus(): Promise<{
  pendingMutations: number;
  failedMutations: number;
  lastSync?: number;
}> {
  const [pending, failed] = await Promise.all([
    offlineDB.mutations.filter(m => !m.synced).count(),
    offlineDB.mutations.filter(m => !m.synced && m.retryCount > 3).count(),
  ]);
  
  const lastSyncedMutation = await offlineDB.mutations
    .filter(m => m.synced)
    .sortBy('timestamp')
    .then(arr => arr[arr.length - 1]);

  return {
    pendingMutations: pending,
    failedMutations: failed,
    lastSync: lastSyncedMutation?.timestamp,
  };
}