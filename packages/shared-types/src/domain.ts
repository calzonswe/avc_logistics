// Domain Types - Core business entities matching GLOSSARY.md and database schema
// These are the canonical TypeScript types used across API and Web

import { z } from 'zod';

// ============================================================================
// Enums (matching PostgreSQL enums)
// ============================================================================

export const ContainerType = {
  OpenTop: 'open_top',
  Closed: 'closed',
  Compactor: 'compactor',
  RollOff: 'roll_off',
} as const;

export type ContainerType = (typeof ContainerType)[keyof typeof ContainerType];

export const FillLevel = {
  Empty: '0',
  Quarter: '25',
  Half: '50',
  ThreeQuarters: '75',
  Full: '100',
} as const;

export type FillLevel = (typeof FillLevel)[keyof typeof FillLevel];

export const TransportOrderStatus = {
  Planned: 'planned',
  Assigned: 'assigned',
  InProgress: 'in_progress',
  Completed: 'completed',
  Archived: 'archived',
} as const;

export type TransportOrderStatus = (typeof TransportOrderStatus)[keyof typeof TransportOrderStatus];

export const VehicleClassification = {
  LocationBound: 'location_bound',
  Transport: 'transport',
} as const;

export type VehicleClassification = (typeof VehicleClassification)[keyof typeof VehicleClassification];

export const UserRole = {
  Admin: 'admin',
  Manager: 'manager',
  Driver: 'driver',
  Worker: 'worker',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const MaintenanceType = {
  Scheduled: 'scheduled',
  ConditionBased: 'condition_based',
} as const;

export type MaintenanceType = (typeof MaintenanceType)[keyof typeof MaintenanceType];

export const MaintenanceStatus = {
  Due: 'due',
  InProgress: 'in_progress',
  Completed: 'completed',
  Overdue: 'overdue',
} as const;

export type MaintenanceStatus = (typeof MaintenanceStatus)[keyof typeof MaintenanceStatus];

export const DamageSeverity = {
  Minor: 'minor',
  Major: 'major',
  Critical: 'critical',
} as const;

export type DamageSeverity = (typeof DamageSeverity)[keyof typeof DamageSeverity];

export const StopType = {
  Pickup: 'pickup',
  Dropoff: 'dropoff',
} as const;

export type StopType = (typeof StopType)[keyof typeof StopType];

// ============================================================================
// Zod Schemas for Validation (shared between API and Web)
// ============================================================================

export const fillLevelSchema = z.enum(['0', '25', '50', '75', '100']);
export const containerTypeSchema = z.enum(['open_top', 'closed', 'compactor', 'roll_off']);
export const transportOrderStatusSchema = z.enum(['planned', 'assigned', 'in_progress', 'completed', 'archived']);
export const vehicleClassificationSchema = z.enum(['location_bound', 'transport']);
export const userRoleSchema = z.enum(['admin', 'manager', 'driver', 'worker']);
export const maintenanceTypeSchema = z.enum(['scheduled', 'condition_based']);
export const maintenanceStatusSchema = z.enum(['due', 'in_progress', 'completed', 'overdue']);
export const damageSeveritySchema = z.enum(['minor', 'major', 'critical']);
export const stopTypeSchema = z.enum(['pickup', 'dropoff']);

// Base entity fields
const baseEntitySchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      total: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
    }),
  });

// ============================================================================
// Core Entity Types
// ============================================================================

export interface Company extends z.infer<typeof companySchema> {}
export const companySchema = baseEntitySchema.extend({
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
});

export interface Site extends z.infer<typeof siteSchema> {}
export const siteSchema = baseEntitySchema.extend({
  name: z.string().min(1).max(100),
  address: z.string().nullable(),
  gps_lat: z.number().nullable(),
  gps_lng: z.number().nullable(),
  map_image_url: z.string().nullable(),
  map_image_bounds: z.record(z.number()).nullable(), // {north, south, east, west}
  is_active: z.boolean(),
});

export interface WasteCategory extends z.infer<typeof wasteCategorySchema> {}
export const wasteCategorySchema = baseEntitySchema.extend({
  site_id: z.string().uuid(),
  name: z.string().min(1).max(50),
  description: z.string().nullable(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  sort_order: z.number().int(),
});

export interface Zone extends z.infer<typeof zoneSchema> {}
export const zoneSchema = baseEntitySchema.extend({
  site_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  polygon_geojson: z.record(z.unknown()).nullable(), // GeoJSON Polygon
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  sort_order: z.number().int(),
});

export interface ParkingSpot extends z.infer<typeof parkingSpotSchema> {}
export const parkingSpotSchema = baseEntitySchema.extend({
  zone_id: z.string().uuid(),
  spot_code: z.string().min(1).max(20),
  position_x: z.number(), // 0-100 percentage on map image
  position_y: z.number(),
  gps_lat: z.number().nullable(),
  gps_lng: z.number().nullable(),
  allowed_container_types: z.array(containerTypeSchema).nullable(),
  is_active: z.boolean(),
});

export interface Ramp extends z.infer<typeof rampSchema> {}
export const rampSchema = baseEntitySchema.extend({
  site_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  waste_category_id: z.string().uuid(),
  position_x: z.number(),
  position_y: z.number(),
  gps_lat: z.number().nullable(),
  gps_lng: z.number().nullable(),
  is_active: z.boolean(),
});

export interface Pit extends z.infer<typeof pitSchema> {}
export const pitSchema = baseEntitySchema.extend({
  site_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  material_type: z.string().min(1).max(100),
  capacity_cubic_meters: z.number().nullable(),
  position_x: z.number(),
  position_y: z.number(),
  gps_lat: z.number().nullable(),
  gps_lng: z.number().nullable(),
  fill_level: fillLevelSchema,
  alert_threshold: fillLevelSchema.default('75'),
  last_emptied_at: z.string().datetime().nullable(),
  last_updated_by: z.string().uuid().nullable(),
  last_updated_at: z.string().datetime(),
  is_active: z.boolean(),
});

export interface User extends z.infer<typeof userSchema> {}
export const userSchema = baseEntitySchema.extend({
  email: z.string().email(),
  full_name: z.string().min(1).max(150),
  role: userRoleSchema,
  site_id: z.string().uuid().nullable(),
  avatar_url: z.string().url().nullable(),
  is_active: z.boolean(),
  last_login_at: z.string().datetime().nullable(),
});

// Safe user (without password hash - already excluded from userSchema)
export const userSafeSchema = userSchema;
export type UserSafe = z.infer<typeof userSafeSchema>;

export interface Vehicle extends z.infer<typeof vehicleSchema> {}
export const vehicleSchema = baseEntitySchema.extend({
  registration_number: z.string().min(1).max(20),
  name: z.string().nullable(),
  type: z.string().min(1).max(100),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  year: z.number().int().nullable(),
  classification: vehicleClassificationSchema,
  home_site_id: z.string().uuid().nullable(),
  max_containers: z.number().int().positive(),
  qr_code_value: z.string().nullable(),
  is_active: z.boolean(),
});

export interface Container extends z.infer<typeof containerSchema> {}
export const containerSchema = baseEntitySchema.extend({
  container_number: z.string().min(1).max(30),
  qr_code_value: z.string().min(1),
  type: containerTypeSchema,
  owning_company_id: z.string().uuid(),
  current_site_id: z.string().uuid().nullable(),
  current_spot_id: z.string().uuid().nullable(),
  fill_level: fillLevelSchema,
  last_maintenance_at: z.string().datetime().nullable(),
  next_maintenance_due: z.string().datetime().nullable(),
  maintenance_interval_months: z.number().int().positive(),
  status: z.string().default('active'),
  notes: z.string().nullable(),
});

export interface ContainerOwnershipHistory extends z.infer<typeof containerOwnershipHistorySchema> {}
export const containerOwnershipHistorySchema = baseEntitySchema.extend({
  container_id: z.string().uuid(),
  from_company_id: z.string().uuid().nullable(),
  to_company_id: z.string().uuid(),
  changed_by: z.string().uuid(),
  reason: z.string().nullable(),
});

export interface TransportOrder extends z.infer<typeof transportOrderSchema> {}
export const transportOrderSchema = baseEntitySchema.extend({
  order_number: z.string().min(1).max(30),
  status: transportOrderStatusSchema,
  planned_by: z.string().uuid(),
  assigned_driver_id: z.string().uuid().nullable(),
  assigned_vehicle_id: z.string().uuid().nullable(),
  planned_start_at: z.string().datetime().nullable(),
  actual_start_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  notes: z.string().nullable(),
});

export interface TransportOrderStop extends z.infer<typeof transportOrderStopSchema> {}
// NB: join tables (transport_order_stops/containers) have no created_at/updated_at
// columns in the schema — only id is inherited here on purpose.
export const transportOrderStopSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  sequence: z.number().int().positive(),
  site_id: z.string().uuid(),
  stop_type: stopTypeSchema,
  planned_at: z.string().datetime().nullable(),
  actual_at: z.string().datetime().nullable(),
  notes: z.string().nullable(),
});

export interface TransportOrderContainer extends z.infer<typeof transportOrderContainerSchema> {}
export const transportOrderContainerSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  stop_id: z.string().uuid(),
  container_id: z.string().uuid(),
  target_spot_id: z.string().uuid().nullable(),
  loaded_at: z.string().datetime().nullable(),
  unloaded_at: z.string().datetime().nullable(),
  notes: z.string().nullable(),
});

export interface MaintenanceTask extends z.infer<typeof maintenanceTaskSchema> {}
export const maintenanceTaskSchema = baseEntitySchema.extend({
  container_id: z.string().uuid(),
  type: maintenanceTypeSchema,
  status: maintenanceStatusSchema,
  scheduled_for: z.string().datetime(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  assigned_to: z.string().uuid().nullable(),
  description: z.string().nullable(),
  resolution: z.string().nullable(),
  created_by: z.string().uuid().nullable(),
});

export interface DamageReport extends z.infer<typeof damageReportSchema> {}
export const damageReportSchema = baseEntitySchema.extend({
  container_id: z.string().uuid(),
  reported_by: z.string().uuid(),
  severity: damageSeveritySchema,
  description: z.string().min(1),
  photos: z.array(z.object({
    url: z.string().url(),
    caption: z.string().nullable(),
    taken_at: z.string().datetime(),
  })).nullable(),
  status: z.enum(['open', 'acknowledged', 'resolved']).default('open'),
  acknowledged_by: z.string().uuid().nullable(),
  acknowledged_at: z.string().datetime().nullable(),
  resolved_by: z.string().uuid().nullable(),
  resolved_at: z.string().datetime().nullable(),
  resolution_notes: z.string().nullable(),
});

export interface SwapRequest extends z.infer<typeof swapRequestSchema> {}
export const swapRequestSchema = baseEntitySchema.extend({
  site_id: z.string().uuid(),
  requested_by: z.string().uuid(),
  current_container_id: z.string().uuid().nullable(),
  current_spot_id: z.string().uuid().nullable(),
  waste_category_id: z.string().uuid().nullable(),
  preferred_container_type: containerTypeSchema.nullable(),
  reason: z.string().nullable(),
  status: z.enum(['pending', 'approved', 'fulfilled', 'cancelled']).default('pending'),
  approved_by: z.string().uuid().nullable(),
  approved_at: z.string().datetime().nullable(),
  fulfilled_by: z.string().uuid().nullable(),
  fulfilled_at: z.string().datetime().nullable(),
  new_container_id: z.string().uuid().nullable(),
});

export interface Notification extends z.infer<typeof notificationSchema> {}
export const notificationSchema = baseEntitySchema.extend({
  user_id: z.string().uuid(),
  type: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  message: z.string().nullable(),
  related_entity_type: z.string().nullable(),
  related_entity_id: z.string().uuid().nullable(),
  is_read: z.boolean().default(false),
  read_at: z.string().datetime().nullable(),
});

export interface AuditLog extends z.infer<typeof auditLogSchema> {}
export const auditLogSchema = baseEntitySchema.extend({
  entity_type: z.string().min(1).max(50),
  entity_id: z.string().uuid(),
  action: z.string().min(1).max(50),
  changed_by: z.string().uuid().nullable(),
  old_values: z.record(z.unknown()).nullable(),
  new_values: z.record(z.unknown()).nullable(),
  metadata: z.record(z.unknown()).nullable(),
});

export interface SyncQueue extends z.infer<typeof syncQueueSchema> {}
export const syncQueueSchema = baseEntitySchema.extend({
  client_id: z.string().uuid(),
  user_id: z.string().uuid(),
  entity_type: z.string().min(1).max(50),
  entity_id: z.string().uuid().nullable(),
  operation: z.enum(['create', 'update', 'delete']),
  payload: z.record(z.unknown()),
  client_timestamp: z.string().datetime(),
  server_timestamp: z.string().datetime(),
  status: z.enum(['pending', 'applied', 'conflict', 'failed']).default('pending'),
  conflict_resolution: z.record(z.unknown()).nullable(),
});

// ============================================================================
// Composite/View Types (for API responses)
// ============================================================================

export interface ContainerOverview extends Container {
  owning_company_name: string;
  current_site_name: string | null;
  spot_code: string | null;
  zone_name: string | null;
  maintenance_status: 'overdue' | 'due_soon' | 'ok';
}

export interface PitOverview extends Pit {
  site_name: string;
  alert_level: 'critical' | 'warning' | 'moderate' | 'ok';
}

export interface TransportOrderDetail extends TransportOrder {
  planner_name: string | null;
  driver_name: string | null;
  vehicle_registration: string | null;
  vehicle_name: string | null;
  stops: Array<TransportOrderStop & {
    site_name: string;
    containers: Array<TransportOrderContainer & {
      container_number: string;
      container_type: ContainerType;
      fill_level: FillLevel;
      target_spot_code: string | null;
    }>;
  }>;
}

export interface MaintenanceOverview extends MaintenanceTask {
  container_number: string;
  container_type: ContainerType;
  site_name: string | null;
  assigned_to_name: string | null;
}

export interface SiteDashboard {
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

export interface DriverShiftView {
  driver_id: string;
  driver_name: string;
  assigned_orders: Array<TransportOrderDetail>;
  available_vehicles: Array<Vehicle>;
}

// ============================================================================
// Request/Response Types for API
// ============================================================================

// Auth
export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  user: userSafeSchema,
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshTokenRequestSchema = z.object({
  refresh_token: z.string(),
});
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;

// Sync (offline-first)
export const syncRequestSchema = z.object({
  client_id: z.string().uuid(),
  last_synced_at: z.string().datetime(),
  mutations: z.array(z.object({
    id: z.string().uuid(),
    entity_type: z.string().min(1).max(50),
    entity_id: z.string().uuid().nullable(),
    operation: z.enum(['create', 'update', 'delete']),
    payload: z.record(z.unknown()),
    timestamp: z.string().datetime(),
  })),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export const syncResponseSchema = z.object({
  results: z.array(z.object({
    mutation_id: z.string().uuid(),
    status: z.enum(['applied', 'conflict', 'failed']),
    server_entity: z.record(z.unknown()).nullable(),
    resolution: z.enum(['server-wins', 'client-wins', 'merged']).nullable(),
  })),
  server_time: z.string().datetime(),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;

// Error response
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).nullable(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// ============================================================================
// Type Guards
// ============================================================================

export function isFillLevel(value: string): value is FillLevel {
  return ['0', '25', '50', '75', '100'].includes(value);
}

export function isContainerType(value: string): value is ContainerType {
  return ['open_top', 'closed', 'compactor', 'roll_off'].includes(value);
}

export function isTransportOrderStatus(value: string): value is TransportOrderStatus {
  return ['planned', 'assigned', 'in_progress', 'completed', 'archived'].includes(value);
}

export function isUserRole(value: string): value is UserRole {
  return ['admin', 'manager', 'driver', 'worker'].includes(value);
}

export function isVehicleClassification(value: string): value is VehicleClassification {
  return ['location_bound', 'transport'].includes(value);
}

// ============================================================================
// Utility Types
// ============================================================================

export type EntityId = string & { readonly __brand: unique symbol };
export function entityId(id: string): EntityId { return id as EntityId; }

export type UUID = string & { readonly __brand: unique symbol };
export function uuid(id: string): UUID { return id as UUID; }

export type ISODateString = string & { readonly __brand: unique symbol };
export function isoDate(date: string): ISODateString { return date as ISODateString; }

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;