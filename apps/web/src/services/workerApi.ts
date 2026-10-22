// Worker client seam.
//
// All worker reads/writes go through this module so ticket 14 (offline write
// path) can route them through the Dexie queue without touching the UI.
//
// The write path (ADR 0002): optimistic local write → local table → queue item
// → background sync + immediate flush. When the device is online the flush
// happens right away; offline the mutation waits in the queue.
import { api } from '../utils/api';
import { enqueueMutation } from '@avc/ui/lib/syncService';
import { offlineDB } from '@avc/ui/lib/offlineDB';

export type FillLevel = '0' | '25' | '50' | '75' | '100';
export type MaintenanceStatus = 'due' | 'in_progress' | 'completed' | 'overdue';

export interface WorkerPit {
  id: string;
  name: string;
  material_type: string;
  capacity_cubic_meters: number | null;
  fill_level: string;
  alert_threshold: string;
  position_x: number;
  position_y: number;
  is_active: boolean;
}

export interface WorkerContainer {
  id: string;
  container_number: string;
  type: string;
  fill_level: string;
  zone_name?: string | null;
  spot_code?: string | null;
}

export interface WorkerMaintenanceTask {
  id: string;
  container_id: string;
  container_number?: string | null;
  type: 'scheduled' | 'condition_based';
  status: 'due' | 'in_progress' | 'completed' | 'overdue';
  scheduled_for: string;
  description?: string | null;
}

export interface DamageReportInput {
  container_id: string;
  severity: 'minor' | 'major' | 'critical';
  description: string;
  photos?: Array<{ url: string; caption?: string; taken_at?: string }>;
}

export interface SwapRequestInput {
  site_id: string;
  current_container_id?: string | null;
  preferred_container_type?: 'open_top' | 'closed' | 'compactor' | 'roll_off' | null;
  reason?: string | null;
}

/** Pits at a site. */
export async function listSitePits(siteId: string): Promise<WorkerPit[]> {
  const response = await api.get(`/pits/site/${siteId}`);
  return response.data ?? [];
}

/** Containers at a site. */
export async function listSiteContainers(siteId: string): Promise<WorkerContainer[]> {
  const response = await api.get('/containers', { params: { site_id: siteId, limit: 100 } });
  return response.data?.data ?? [];
}

/** Maintenance tasks (site scoped). */
export async function listMaintenanceTasks(siteId: string): Promise<WorkerMaintenanceTask[]> {
  const response = await api.get('/maintenance', { params: { site_id: siteId, limit: 50 } });
  return response.data?.data ?? [];
}

/**
 * Sets a pit's fill level (discrete scale only).
 * Optimistic: the local copy is updated immediately, the change is queued and
 * flushed to the server.
 */
export async function updatePitFillLevel(pitId: string, fillLevel: FillLevel): Promise<void> {
  const pit = await offlineDB.pits.get(pitId);
  if (pit) {
    await offlineDB.pits.put({ ...pit, fill_level: fillLevel, _offline: true, _syncedAt: Date.now() });
  }
  await enqueueMutation('pit', pitId, 'update', { fill_level: fillLevel });
}

/** Empties a pit (resets the fill level to 0). */
export async function emptyPit(pitId: string): Promise<void> {
  const pit = await offlineDB.pits.get(pitId);
  if (pit) {
    await offlineDB.pits.put({ ...pit, fill_level: '0', _offline: true, _syncedAt: Date.now() });
  }
  await enqueueMutation('pit', pitId, 'update', { empty: true });
}

/** Sets a container's fill level. */
export async function updateContainerFillLevel(containerId: string, fillLevel: FillLevel): Promise<void> {
  const container = await offlineDB.containers.get(containerId);
  if (container) {
    await offlineDB.containers.put({ ...container, fill_level: fillLevel, _offline: true, _syncedAt: Date.now() });
  }
  await enqueueMutation('container', containerId, 'update', { fill_level: fillLevel });
}

/** Sets a maintenance task's status (due / in_progress / completed). */
export async function updateMaintenanceStatus(taskId: string, status: MaintenanceStatus): Promise<void> {
  const task = await offlineDB.maintenanceTasks.get(taskId);
  if (task) {
    await offlineDB.maintenanceTasks.put({ ...task, status, _offline: true, _syncedAt: Date.now() });
  }
  await enqueueMutation('maintenanceTask', taskId, 'update', { status });
}

/** Uploads a photo and returns its URL. */
export async function uploadPhoto(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.url as string;
}

/**
 * Reports container damage (creates a condition-based task for major/critical).
 * The report gets a temporary id until the server confirms it.
 */
export async function createDamageReport(input: DamageReportInput): Promise<string> {
  const tempId = crypto.randomUUID();
  await offlineDB.damageReports.put({
    id: tempId,
    container_id: input.container_id,
    severity: input.severity,
    description: input.description,
    photos: input.photos ?? [],
    status: 'open',
    created_at: new Date().toISOString(),
    _offline: true,
    _syncedAt: Date.now(),
  });
  await enqueueMutation('damageReport', tempId, 'create', { ...input, id: tempId });
  return tempId;
}

/** Requests a container swap. */
export async function createSwapRequest(input: SwapRequestInput): Promise<string> {
  const tempId = crypto.randomUUID();
  await offlineDB.swapRequests.put({
    id: tempId,
    site_id: input.site_id,
    current_container_id: input.current_container_id ?? null,
    preferred_container_type: input.preferred_container_type ?? null,
    reason: input.reason ?? null,
    status: 'pending',
    created_at: new Date().toISOString(),
    _offline: true,
    _syncedAt: Date.now(),
  });
  await enqueueMutation('swapRequest', tempId, 'create', { ...input, id: tempId });
  return tempId;
}
