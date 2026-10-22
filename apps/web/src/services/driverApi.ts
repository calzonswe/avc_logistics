// Driver client seam.
//
// Every driver write goes through this module so ticket 14 (offline write
// path) can swap the implementation for the Dexie queue without touching the
// UI components. The functions below are the only place that talks to the
// order/shift API from the driver app.
import { api } from '../utils/api';
import { enqueueMutation } from '@avc/ui/lib/syncService';
import { offlineDB } from '@avc/ui/lib/offlineDB';

export type OrderAction = 'start' | 'pickup' | 'dropoff' | 'complete';

export interface ExecuteOrderInput {
  orderId: string;
  action: OrderAction;
  stopId: string;
  containerIds: string[];
  spotId?: string;
  /** One parking spot per container (a dropoff places each container on its own spot). */
  containerSpots?: Array<{ container_id: string; spot_id: string }>;
  notes?: string;
}

export interface DriverShift {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  started_at: string;
  ended_at: string | null;
  notes?: string | null;
  vehicle_registration?: string | null;
  vehicle_name?: string | null;
  vehicle_classification?: string | null;
}

export interface ShiftResponse {
  shift: DriverShift | null;
  is_open: boolean;
}

export interface ContainerLookup {
  id: string;
  container_number: string;
  qr_code_value: string;
  type: string;
  fill_level: string;
  status: string;
  current_site_id: string | null;
  current_site_name: string | null;
  spot_code: string | null;
  zone_name: string | null;
}

/**
 * Executes one step of an order (start/pickup/dropoff/complete).
 *
 * The step is queued (ADR 0002) so it also works in a dead zone: the local
 * order copy is updated optimistically, the mutation waits in the queue and is
 * flushed to the server as soon as the network is back.
 */
export async function executeOrderStep(input: ExecuteOrderInput): Promise<void> {
  const order = await offlineDB.transportOrders.get(input.orderId);
  if (order) {
    const nextStatus =
      input.action === 'start'
        ? 'in_progress'
        : input.action === 'complete'
          ? 'completed'
          : order.status;
    await offlineDB.transportOrders.put({
      ...order,
      status: nextStatus,
      _offline: true,
      _syncedAt: Date.now(),
    });
  }

  await enqueueMutation('transportOrder', input.orderId, 'update', {
    action: input.action,
    stop_id: input.stopId,
    container_ids: input.containerIds,
    ...(input.spotId ? { spot_id: input.spotId } : {}),
    ...(input.containerSpots && input.containerSpots.length > 0
      ? { container_spots: input.containerSpots }
      : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  });
}

/** The driver's shift view: assigned orders, stops, containers, vehicles. */
export async function fetchDriverShift(driverId: string) {
  const response = await api.get(`/dashboard/driver/${driverId}/shift`);
  return response.data;
}

/** The driver's open shift (or the latest one). */
export async function fetchShift(): Promise<ShiftResponse> {
  const response = await api.get('/driver-shift');
  return response.data;
}

/** Starts (or re-uses) a shift with the chosen vehicle. */
export async function startShift(vehicleId: string): Promise<DriverShift> {
  const response = await api.post('/driver-shift/start', { vehicle_id: vehicleId });
  return response.data;
}

/** Ends the open shift. */
export async function endShift(): Promise<DriverShift> {
  const response = await api.post('/driver-shift/end', {});
  return response.data;
}

/** Resolves a scanned QR code to a container. */
export async function lookupContainerByQr(qr: string): Promise<ContainerLookup> {
  const response = await api.get(`/containers/qr/${encodeURIComponent(qr)}`);
  return response.data;
}

/** Free parking spots at a site (used for the dropoff target). */
export async function listSpots(siteId: string) {
  const response = await api.get(`/sites/${siteId}/parking-spots`);
  return (response.data?.data ?? response.data ?? []) as Array<{
    id: string;
    spot_code: string;
    zone_id: string;
    zone_name?: string | null;
    is_active?: boolean;
    occupied_by_container_id?: string | null;
    occupied_by_container_number?: string | null;
  }>;
}
