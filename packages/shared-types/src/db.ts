// Database Types - Kysely schema types for type-safe SQL queries
// Generated from the PostgreSQL schema in docs/schema.sql

import type {
  ContainerType,
  FillLevel,
  TransportOrderStatus,
  VehicleClassification,
  UserRole,
  MaintenanceType,
  MaintenanceStatus,
  DamageSeverity,
  StopType,
} from './domain.js';

// ============================================================================
// Table Definitions (matching PostgreSQL schema exactly)
// ============================================================================

export interface CompanyTable {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SiteTable {
  id: string;
  name: string;
  address: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  map_image_url: string | null;
  map_image_bounds: Record<string, number> | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface WasteCategoryTable {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  color_hex: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface ZoneTable {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  polygon_geojson: Record<string, unknown> | null;
  color_hex: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface ParkingSpotTable {
  id: string;
  zone_id: string;
  spot_code: string;
  position_x: number;
  position_y: number;
  gps_lat: number | null;
  gps_lng: number | null;
  allowed_container_types: ContainerType[] | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RampTable {
  id: string;
  site_id: string;
  name: string;
  waste_category_id: string;
  position_x: number;
  position_y: number;
  gps_lat: number | null;
  gps_lng: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PitTable {
  id: string;
  site_id: string;
  name: string;
  material_type: string;
  capacity_cubic_meters: number | null;
  position_x: number;
  position_y: number;
  gps_lat: number | null;
  gps_lng: number | null;
  fill_level: FillLevel;
  alert_threshold: FillLevel;
  last_emptied_at: Date | null;
  last_updated_by: string | null;
  last_updated_at: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserTable {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  site_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface VehicleTable {
  id: string;
  registration_number: string;
  name: string | null;
  type: string;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  classification: VehicleClassification;
  home_site_id: string | null;
  max_containers: number;
  qr_code_value: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ContainerTable {
  id: string;
  container_number: string;
  qr_code_value: string;
  type: ContainerType;
  owning_company_id: string;
  current_site_id: string | null;
  current_spot_id: string | null;
  fill_level: FillLevel;
  last_maintenance_at: Date | null;
  next_maintenance_due: Date | null;
  maintenance_interval_months: number;
  status: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ContainerOwnershipHistoryTable {
  id: string;
  container_id: string;
  from_company_id: string | null;
  to_company_id: string;
  changed_by: string;
  changed_at: Date;
  reason: string | null;
}

export interface TransportOrderTable {
  id: string;
  order_number: string;
  status: TransportOrderStatus;
  planned_by: string;
  assigned_driver_id: string | null;
  assigned_vehicle_id: string | null;
  planned_start_at: Date | null;
  actual_start_at: Date | null;
  completed_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TransportOrderStopTable {
  id: string;
  order_id: string;
  sequence: number;
  site_id: string;
  stop_type: StopType;
  planned_at: Date | null;
  actual_at: Date | null;
  notes: string | null;
}

export interface TransportOrderContainerTable {
  id: string;
  order_id: string;
  stop_id: string;
  container_id: string;
  target_spot_id: string | null;
  loaded_at: Date | null;
  unloaded_at: Date | null;
  notes: string | null;
}

export interface DriverShiftTable {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  started_at: Date;
  ended_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MaintenanceTaskTable {
  id: string;
  container_id: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  scheduled_for: Date;
  started_at: Date | null;
  completed_at: Date | null;
  assigned_to: string | null;
  description: string | null;
  resolution: string | null;
  created_by: string | null;
  /** Set when the task was auto-created from a damage report (ticket 06). */
  damage_report_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DamageReportTable {
  id: string;
  container_id: string;
  reported_by: string;
  severity: DamageSeverity;
  description: string;
  photos: Array<{ url: string; caption: string | null; taken_at: Date }> | null;
  status: 'open' | 'acknowledged' | 'resolved';
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  resolution_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SwapRequestTable {
  id: string;
  site_id: string;
  requested_by: string;
  current_container_id: string | null;
  current_spot_id: string | null;
  waste_category_id: string | null;
  preferred_container_type: ContainerType | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'fulfilled' | 'cancelled';
  approved_by: string | null;
  approved_at: Date | null;
  fulfilled_by: string | null;
  fulfilled_at: Date | null;
  new_container_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationTable {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
}

export interface PushSubscriptionTable {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLogTable {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changed_by: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface PushSubscriptionTable {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SyncQueueTable {
  id: string;
  client_id: string;
  user_id: string;
  entity_type: string;
  entity_id: string | null;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  client_timestamp: Date;
  server_timestamp: Date;
  status: 'pending' | 'applied' | 'conflict' | 'failed';
  conflict_resolution: Record<string, unknown> | null;
  created_at: Date;
}

// ============================================================================
// Database Interface (for Kysely)
// ============================================================================

export interface Database {
  companies: CompanyTable;
  sites: SiteTable;
  waste_categories: WasteCategoryTable;
  zones: ZoneTable;
  parking_spots: ParkingSpotTable;
  ramps: RampTable;
  pits: PitTable;
  users: UserTable;
  vehicles: VehicleTable;
  containers: ContainerTable;
  container_ownership_history: ContainerOwnershipHistoryTable;
  transport_orders: TransportOrderTable;
  transport_order_stops: TransportOrderStopTable;
  transport_order_containers: TransportOrderContainerTable;
  driver_shifts: DriverShiftTable;
  maintenance_tasks: MaintenanceTaskTable;
  damage_reports: DamageReportTable;
  swap_requests: SwapRequestTable;
  notifications: NotificationTable;
  push_subscriptions: PushSubscriptionTable;
  audit_log: AuditLogTable;
  sync_queue: SyncQueueTable;
}

// ============================================================================
// View Types (matching the views in schema.sql)
// ============================================================================

export interface ContainerOverviewView {
  id: string;
  container_number: string;
  qr_code_value: string;
  type: ContainerType;
  fill_level: FillLevel;
  status: string;
  owning_company_id: string;
  owning_company_name: string;
  current_site_id: string | null;
  current_site_name: string | null;
  current_spot_id: string | null;
  spot_code: string | null;
  zone_name: string | null;
  last_maintenance_at: Date | null;
  next_maintenance_due: Date | null;
  maintenance_interval_months: number;
  maintenance_status: 'overdue' | 'due_soon' | 'ok';
  updated_at: Date;
}

export interface PitOverviewView {
  id: string;
  name: string;
  material_type: string;
  fill_level: FillLevel;
  alert_threshold: FillLevel;
  capacity_cubic_meters: number | null;
  site_id: string;
  site_name: string;
  position_x: number;
  position_y: number;
  last_emptied_at: Date | null;
  last_updated_at: Date;
  alert_level: 'critical' | 'warning' | 'moderate' | 'ok';
}

export interface TransportOrderDetailView {
  order_id: string;
  order_number: string;
  status: TransportOrderStatus;
  planned_by: string;
  planner_name: string | null;
  assigned_driver_id: string | null;
  driver_name: string | null;
  assigned_vehicle_id: string | null;
  vehicle_registration: string | null;
  vehicle_name: string | null;
  planned_start_at: Date | null;
  actual_start_at: Date | null;
  completed_at: Date | null;
  stops: Array<{
    stop_id: string;
    sequence: number;
    site_id: string;
    site_name: string;
    stop_type: StopType;
    planned_at: Date | null;
    actual_at: Date | null;
    containers: Array<{
      container_id: string;
      container_number: string;
      container_type: ContainerType;
      fill_level: FillLevel;
      target_spot_id: string | null;
      target_spot_code: string | null;
      loaded_at: Date | null;
      unloaded_at: Date | null;
    }>;
  }>;
}

export interface MaintenanceOverviewView {
  id: string;
  container_id: string;
  container_number: string;
  container_type: ContainerType;
  current_site_id: string | null;
  site_name: string | null;
  type: MaintenanceType;
  status: MaintenanceStatus;
  scheduled_for: Date;
  started_at: Date | null;
  completed_at: Date | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  description: string | null;
  maintenance_interval_months: number;
  last_maintenance_at: Date | null;
}

export interface SiteDashboardView {
  site_id: string;
  site_name: string;
  map_image_url: string | null;
  map_image_bounds: Record<string, number> | null;
  containers: Array<{
    id: string;
    container_number: string;
    type: ContainerType;
    fill_level: FillLevel;
    spot_id: string | null;
    spot_code: string | null;
    zone_id: string | null;
    zone_name: string | null;
    position_x: number | null;
    position_y: number | null;
  }>;
  pits: Array<{
    id: string;
    name: string;
    material_type: string;
    fill_level: FillLevel;
    alert_threshold: FillLevel;
    position_x: number;
    position_y: number;
    alert_level: 'critical' | 'warning' | 'ok';
  }>;
  zones: Array<{
    id: string;
    name: string;
    polygon_geojson: Record<string, unknown> | null;
    color_hex: string | null;
  }>;
}

export interface DriverShiftViewDb {
  driver_id: string;
  driver_name: string;
  assigned_orders: Array<TransportOrderDetailView>;
  available_vehicles: Array<VehicleTable>;
}

// ============================================================================
// Helper Types for Insert/Update
// ============================================================================

export type CompanyInsert = Omit<CompanyTable, 'id' | 'created_at' | 'updated_at'>;
export type CompanyUpdate = Partial<CompanyInsert>;

export type SiteInsert = Omit<SiteTable, 'id' | 'created_at' | 'updated_at'>;
export type SiteUpdate = Partial<SiteInsert>;

export type WasteCategoryInsert = Omit<WasteCategoryTable, 'id' | 'created_at' | 'updated_at'>;
export type WasteCategoryUpdate = Partial<WasteCategoryInsert>;

export type ZoneInsert = Omit<ZoneTable, 'id' | 'created_at' | 'updated_at'>;
export type ZoneUpdate = Partial<ZoneInsert>;

export type ParkingSpotInsert = Omit<ParkingSpotTable, 'id' | 'created_at' | 'updated_at'>;
export type ParkingSpotUpdate = Partial<ParkingSpotInsert>;

export type RampInsert = Omit<RampTable, 'id' | 'created_at' | 'updated_at'>;
export type RampUpdate = Partial<RampInsert>;

export type PitInsert = Omit<PitTable, 'id' | 'created_at' | 'updated_at' | 'last_updated_at'>;
export type PitUpdate = Partial<PitInsert> & { last_updated_at?: Date };

export type UserInsert = Omit<UserTable, 'id' | 'created_at' | 'updated_at' | 'last_login_at'>;
export type UserUpdate = Partial<UserInsert>;

export type VehicleInsert = Omit<VehicleTable, 'id' | 'created_at' | 'updated_at'>;
export type VehicleUpdate = Partial<VehicleInsert>;

export type ContainerInsert = Omit<ContainerTable, 'id' | 'created_at' | 'updated_at'>;
export type ContainerUpdate = Partial<ContainerInsert>;

export type TransportOrderInsert = Omit<TransportOrderTable, 'id' | 'created_at' | 'updated_at' | 'order_number'>;
export type TransportOrderUpdate = Partial<TransportOrderInsert>;

export type MaintenanceTaskInsert = Omit<MaintenanceTaskTable, 'id' | 'created_at' | 'updated_at'>;
export type MaintenanceTaskUpdate = Partial<MaintenanceTaskInsert>;

export type DamageReportInsert = Omit<DamageReportTable, 'id' | 'created_at' | 'updated_at'>;
export type DamageReportUpdate = Partial<DamageReportInsert>;

export type SwapRequestInsert = Omit<SwapRequestTable, 'id' | 'created_at' | 'updated_at'>;
export type SwapRequestUpdate = Partial<SwapRequestInsert>;

export type NotificationInsert = Omit<NotificationTable, 'id' | 'created_at'>;
export type PushSubscriptionInsert = Omit<PushSubscriptionTable, 'id' | 'created_at' | 'updated_at'>;
export type PushSubscriptionUpdate = Partial<PushSubscriptionInsert>;
export type AuditLogInsert = Omit<AuditLogTable, 'id' | 'created_at'>;
export type SyncQueueInsert = Omit<SyncQueueTable, 'id' | 'created_at' | 'server_timestamp'>;