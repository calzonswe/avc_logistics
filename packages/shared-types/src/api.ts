// API Types - Request/Response schemas for REST endpoints
// These define the contract between API and Web clients

import { z } from 'zod';
import {
  paginationSchema,
  paginatedResponseSchema,
  errorResponseSchema,
  type Pagination,
  type ContainerType,
  type FillLevel,
  type TransportOrderStatus,
  type UserRole,
  type VehicleClassification,
  type MaintenanceType,
  type MaintenanceStatus,
  type DamageSeverity,
  type StopType,
  loginRequestSchema,
  loginResponseSchema,
  refreshTokenRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type RefreshTokenRequest,
  // Entity schemas (from domain.ts)
  companySchema,
  siteSchema,
  wasteCategorySchema,
  zoneSchema,
  parkingSpotSchema,
  rampSchema,
  pitSchema,
  userSchema,
  userSafeSchema,
  vehicleSchema,
  containerSchema,
  containerOwnershipHistorySchema,
  transportOrderSchema,
  transportOrderStopSchema,
  transportOrderContainerSchema,
  maintenanceTaskSchema,
  damageReportSchema,
  swapRequestSchema,
  notificationSchema,
  auditLogSchema,
  syncQueueSchema,
  // Sync schemas (from domain.ts)
  syncRequestSchema,
  syncResponseSchema,
  // Type guards (from domain.ts)
  isFillLevel,
  isContainerType,
  isTransportOrderStatus,
  isUserRole,
  isVehicleClassification,
} from './domain.js';

// Re-export all domain types and schemas
export * from './domain.js';

// Re-export auth schemas explicitly
export { loginRequestSchema, loginResponseSchema, refreshTokenRequestSchema };
export type { LoginRequest, LoginResponse, RefreshTokenRequest };

// ============================================================================
// Query Parameters (defined locally in api.ts)
// ============================================================================

export const containerQuerySchema = paginationSchema.extend({
  site_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  type: z.enum(['open_top', 'closed', 'compactor', 'roll_off']).optional(),
  fill_level: z.enum(['0', '25', '50', '75', '100']).optional(),
  status: z.string().optional(),
  needs_maintenance: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export type ContainerQuery = z.infer<typeof containerQuerySchema>;

export const transportOrderQuerySchema = paginationSchema.extend({
  status: z.enum(['planned', 'assigned', 'in_progress', 'completed', 'archived']).optional(),
  driver_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
  site_id: z.string().uuid().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});

export type TransportOrderQuery = z.infer<typeof transportOrderQuerySchema>;

export const maintenanceTaskQuerySchema = paginationSchema.extend({
  status: z.enum(['due', 'in_progress', 'completed', 'overdue']).optional(),
  container_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  type: z.enum(['scheduled', 'condition_based']).optional(),
  overdue_only: z.coerce.boolean().optional(),
});

export type MaintenanceTaskQuery = z.infer<typeof maintenanceTaskQuerySchema>;

export const damageReportQuerySchema = paginationSchema.extend({
  status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
  container_id: z.string().uuid().optional(),
  site_id: z.string().uuid().optional(), // damage reports are container-scoped; site filters join containers.current_site_id
  severity: z.enum(['minor', 'major', 'critical']).optional(),
  reported_by: z.string().uuid().optional(),
});

export type DamageReportQuery = z.infer<typeof damageReportQuerySchema>;

export const swapRequestQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'approved', 'fulfilled', 'cancelled']).optional(),
  site_id: z.string().uuid().optional(),
  requested_by: z.string().uuid().optional(),
});

export type SwapRequestQuery = z.infer<typeof swapRequestQuerySchema>;

export const notificationQuerySchema = paginationSchema.extend({
  is_read: z.coerce.boolean().optional(),
  type: z.string().optional(),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

export const auditLogQuerySchema = paginationSchema.extend({
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  action: z.string().optional(),
  changed_by: z.string().uuid().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

// ============================================================================
// Create/Update Payloads (defined locally in api.ts)
// ============================================================================

// Sites
export const createSiteSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().optional(),
  gps_lat: z.number().min(-90).max(90).optional(),
  gps_lng: z.number().min(-180).max(180).optional(),
});
export type CreateSite = z.infer<typeof createSiteSchema>;

export const updateSiteSchema = createSiteSchema.partial().extend({
  map_image_url: z.string().url().nullable().optional(),
  map_image_bounds: z.record(z.number()).nullable().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateSite = z.infer<typeof updateSiteSchema>;

// Waste Categories
export const createWasteCategorySchema = z.object({
  site_id: z.string().uuid(),
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sort_order: z.number().int().default(0),
});
export type CreateWasteCategory = z.infer<typeof createWasteCategorySchema>;

export const updateWasteCategorySchema = createWasteCategorySchema.partial();
export type UpdateWasteCategory = z.infer<typeof updateWasteCategorySchema>;

// Zones
// site_id comes from the route param (/map/site/:siteId/...), not the body.
export const createZoneSchema = z.object({
  site_id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  polygon_geojson: z.record(z.unknown()).optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sort_order: z.number().int().default(0),
});
export type CreateZone = z.infer<typeof createZoneSchema>;

export const updateZoneSchema = createZoneSchema.partial();
export type UpdateZone = z.infer<typeof updateZoneSchema>;

// Parking Spots
export const createParkingSpotSchema = z.object({
  zone_id: z.string().uuid(),
  spot_code: z.string().min(1).max(20),
  position_x: z.number().min(0).max(100),
  position_y: z.number().min(0).max(100),
  gps_lat: z.number().min(-90).max(90).optional(),
  gps_lng: z.number().min(-180).max(180).optional(),
  allowed_container_types: z.array(z.enum(['open_top', 'closed', 'compactor', 'roll_off'])).optional(),
});
export type CreateParkingSpot = z.infer<typeof createParkingSpotSchema>;

export const updateParkingSpotSchema = createParkingSpotSchema.partial().extend({
  is_active: z.boolean().optional(),
});
export type UpdateParkingSpot = z.infer<typeof updateParkingSpotSchema>;

// Ramps
// site_id comes from the route param.
export const createRampSchema = z.object({
  site_id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  waste_category_id: z.string().uuid(),
  position_x: z.number().min(0).max(100),
  position_y: z.number().min(0).max(100),
  gps_lat: z.number().min(-90).max(90).optional(),
  gps_lng: z.number().min(-180).max(180).optional(),
});
export type CreateRamp = z.infer<typeof createRampSchema>;

export const updateRampSchema = createRampSchema.partial().extend({
  is_active: z.boolean().optional(),
});
export type UpdateRamp = z.infer<typeof updateRampSchema>;

// Pits
// site_id comes from the route param.
export const createPitSchema = z.object({
  site_id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  material_type: z.string().min(1).max(100),
  capacity_cubic_meters: z.number().positive().nullable().optional(),
  position_x: z.number().min(0).max(100),
  position_y: z.number().min(0).max(100),
  gps_lat: z.number().min(-90).max(90).optional(),
  gps_lng: z.number().min(-180).max(180).optional(),
  alert_threshold: z.enum(['0', '25', '50', '75', '100']).default('75'),
});
export type CreatePit = z.infer<typeof createPitSchema>;

export const updatePitSchema = createPitSchema.partial().extend({
  fill_level: z.enum(['0', '25', '50', '75', '100']).optional(),
  last_emptied_at: z.string().datetime().nullable().optional(),
  is_active: z.boolean().optional(),
});
export type UpdatePit = z.infer<typeof updatePitSchema>;

// Users
export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1).max(150),
  role: z.enum(['admin', 'manager', 'driver', 'worker']),
  site_id: z.string().uuid().optional(),
});
export type CreateUser = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.omit({ password: true }).partial().extend({
  password: z.string().min(8).optional(),
  avatar_url: z.string().url().nullable().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateUser = z.infer<typeof updateUserSchema>;

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});
export type ChangePassword = z.infer<typeof changePasswordSchema>;

// Vehicles
export const createVehicleSchema = z.object({
  registration_number: z.string().min(1).max(20),
  name: z.string().max(100).optional(),
  type: z.string().min(1).max(100),
  manufacturer: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
  classification: z.enum(['location_bound', 'transport']),
  home_site_id: z.string().uuid().optional(),
  max_containers: z.number().int().positive().default(1),
});
export type CreateVehicle = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = createVehicleSchema.partial().extend({
  qr_code_value: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateVehicle = z.infer<typeof updateVehicleSchema>;

// Containers
export const createContainerSchema = z.object({
  container_number: z.string().min(1).max(30),
  qr_code_value: z.string().min(1),
  type: z.enum(['open_top', 'closed', 'compactor', 'roll_off']),
  owning_company_id: z.string().uuid(),
  current_site_id: z.string().uuid().optional(),
  current_spot_id: z.string().uuid().optional(),
  fill_level: z.enum(['0', '25', '50', '75', '100']).default('0'),
  maintenance_interval_months: z.number().int().positive().default(6),
  notes: z.string().optional(),
});
export type CreateContainer = z.infer<typeof createContainerSchema>;

export const updateContainerSchema = createContainerSchema.partial().extend({
  status: z.string().optional(),
  last_maintenance_at: z.string().datetime().nullable().optional(),
});
export type UpdateContainer = z.infer<typeof updateContainerSchema>;

// Fill-level update: ONLY the discrete scale. Spot relocations are a separate
// flow (swaps/moves, ticket 06) — a fill-level PATCH must never silently
// double as a move. Strict so unknown keys (e.g. a legacy `spot_id`) fail loudly.
export const updateContainerFillLevelSchema = z
  .object({
    fill_level: z.enum(['0', '25', '50', '75', '100']),
  })
  .strict();
export type UpdateContainerFillLevel = z.infer<typeof updateContainerFillLevelSchema>;

export const transferContainerOwnershipSchema = z.object({
  to_company_id: z.string().uuid(),
  reason: z.string().optional(),
});
export type TransferContainerOwnership = z.infer<typeof transferContainerOwnershipSchema>;

// ============================================================================
// Companies (read-only for all: real departments owning containers)
// ============================================================================

// Row shape of GET /api/v1/companies — extends the domain Company with the
// live container count the list endpoint computes.
export const companyOverviewSchema = companySchema.extend({
  container_count: z.number().default(0),
  updated_at: z.string().optional(),
});
export type CompanyOverview = z.infer<typeof companyOverviewSchema>;

// ============================================================================
// Container history (ownership transfers + physical movements)
// ============================================================================

export const ownershipHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  from_company_id: z.string().uuid().nullable(),
  from_company_name: z.string().nullable(),
  to_company_id: z.string().uuid(),
  to_company_name: z.string(),
  changed_by: z.string().uuid(),
  changed_by_name: z.string(),
  changed_at: z.string(),
  reason: z.string().nullable(),
});
export type OwnershipHistoryEntry = z.infer<typeof ownershipHistoryEntrySchema>;

export const containerMovementSchema = z.object({
  order_id: z.string().uuid(),
  order_number: z.string(),
  order_status: z.string(),
  stop_type: z.string(),
  site_name: z.string().nullable(),
  planned_at: z.string().nullable(),
  loaded_at: z.string().nullable(),
  unloaded_at: z.string().nullable(),
});
export type ContainerMovement = z.infer<typeof containerMovementSchema>;

export const containerHistorySchema = z.object({
  ownership: z.array(ownershipHistoryEntrySchema),
  movements: z.array(containerMovementSchema),
});
export type ContainerHistory = z.infer<typeof containerHistorySchema>;

// Transport Orders
export const createTransportOrderSchema = z.object({
  planned_start_at: z.string().datetime().optional(),
  assigned_driver_id: z.string().uuid().optional(),
  assigned_vehicle_id: z.string().uuid().optional(),
  notes: z.string().optional(),
  stops: z.array(z.object({
    site_id: z.string().uuid(),
    stop_type: z.enum(['pickup', 'dropoff']),
    planned_at: z.string().datetime().optional(),
    containers: z.array(z.object({
      container_id: z.string().uuid(),
      target_spot_id: z.string().uuid().optional(),
    })).min(1),
  })).min(1),
});
export type CreateTransportOrder = z.infer<typeof createTransportOrderSchema>;

// Assignment: manager picks driver + vehicle for a planned order.
export const assignTransportOrderSchema = z.object({
  assigned_driver_id: z.string().uuid(),
  assigned_vehicle_id: z.string().uuid(),
  planned_start_at: z.string().datetime().optional(),
});
export type AssignTransportOrder = z.infer<typeof assignTransportOrderSchema>;

// Accept a transport suggestion into a real (planned) order.
export const createOrderFromSuggestionSchema = z.object({
  site_id: z.string().uuid(),
  to_site_id: z.string().uuid(),
  container_ids: z.array(z.string().uuid()).min(1),
  notes: z.string().optional(),
});
export type CreateOrderFromSuggestion = z.infer<typeof createOrderFromSuggestionSchema>;

export const updateTransportOrderSchema = z.object({
  status: z.enum(['planned', 'assigned', 'in_progress', 'completed', 'archived']).optional(),
  assigned_driver_id: z.string().uuid().nullable().optional(),
  assigned_vehicle_id: z.string().uuid().nullable().optional(),
  planned_start_at: z.string().datetime().nullable().optional(),
  actual_start_at: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateTransportOrder = z.infer<typeof updateTransportOrderSchema>;

export const executeTransportOrderActionSchema = z.object({
  action: z.enum(['start', 'pickup', 'dropoff', 'complete']),
  stop_id: z.string().uuid(),
  container_ids: z.array(z.string().uuid()),
  spot_id: z.string().uuid().optional(),
  // A dropoff places every container on its own parking spot (the DB enforces
  // one container per spot). When several containers are delivered, the client
  // sends one spot per container.
  container_spots: z.array(z.object({
    container_id: z.string().uuid(),
    spot_id: z.string().uuid(),
  })).optional(),
  notes: z.string().optional(),
});
export type ExecuteTransportOrderAction = z.infer<typeof executeTransportOrderActionSchema>;

// Maintenance Tasks
export const createMaintenanceTaskSchema = z.object({
  container_id: z.string().uuid(),
  type: z.enum(['scheduled', 'condition_based']),
  scheduled_for: z.string().datetime(),
  assigned_to: z.string().uuid().optional(),
  description: z.string().optional(),
});
export type CreateMaintenanceTask = z.infer<typeof createMaintenanceTaskSchema>;

export const updateMaintenanceTaskSchema = z.object({
  status: z.enum(['due', 'in_progress', 'completed', 'overdue']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  resolution: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});
export type UpdateMaintenanceTask = z.infer<typeof updateMaintenanceTaskSchema>;

// Damage Reports
export const createDamageReportSchema = z.object({
  container_id: z.string().uuid(),
  severity: z.enum(['minor', 'major', 'critical']),
  description: z.string().min(1),
  // Photos come from POST /uploads, which returns a relative path
  // ("/uploads/<file>") — absolute URLs are accepted too.
  photos: z.array(z.object({
    url: z.string().min(1).refine(
      (v) => v.startsWith('/') || /^https?:\/\//i.test(v),
      'Måste vara en uppladdad sökväg eller en http(s)-URL'
    ),
    caption: z.string().optional(),
    taken_at: z.string().datetime().optional(),
  })).optional(),
});
export type CreateDamageReport = z.infer<typeof createDamageReportSchema>;

export const updateDamageReportSchema = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
  acknowledged_by: z.string().uuid().nullable().optional(),
  resolved_by: z.string().uuid().nullable().optional(),
  resolution_notes: z.string().nullable().optional(),
});
export type UpdateDamageReport = z.infer<typeof updateDamageReportSchema>;

// Swap Requests
export const createSwapRequestSchema = z.object({
  site_id: z.string().uuid(),
  // Optional references accept null — the Worker App sends explicit nulls for
  // "no container / no spot" rather than omitting the key.
  current_container_id: z.string().uuid().nullable().optional(),
  current_spot_id: z.string().uuid().nullable().optional(),
  waste_category_id: z.string().uuid().nullable().optional(),
  preferred_container_type: z.enum(['open_top', 'closed', 'compactor', 'roll_off']).nullable().optional(),
  reason: z.string().nullable().optional(),
});
export type CreateSwapRequest = z.infer<typeof createSwapRequestSchema>;

export const updateSwapRequestSchema = z.object({
  status: z.enum(['pending', 'approved', 'fulfilled', 'cancelled']).optional(),
  approved_by: z.string().uuid().nullable().optional(),
  approved_at: z.string().datetime().nullable().optional(),
  fulfilled_by: z.string().uuid().nullable().optional(),
  fulfilled_at: z.string().datetime().nullable().optional(),
  new_container_id: z.string().uuid().nullable().optional(),
});
export type UpdateSwapRequest = z.infer<typeof updateSwapRequestSchema>;

// Notifications
export const markNotificationReadSchema = z.object({
  notification_ids: z.array(z.string().uuid()).min(1),
});
export type MarkNotificationRead = z.infer<typeof markNotificationReadSchema>;

// ============================================================================
// Response Types (using domain view types)
// ============================================================================

import type {
  ContainerOverview,
  PitOverview,
  TransportOrderDetail,
  MaintenanceOverview,
  SiteDashboard,
  DriverShiftView,
} from './domain.js';

export type {
  ContainerOverview,
  PitOverview,
  TransportOrderDetail,
  MaintenanceOverview,
  SiteDashboard,
  DriverShiftView,
};

// Paginated responses
export const containerListResponseSchema = paginatedResponseSchema(z.any());
export const transportOrderListResponseSchema = paginatedResponseSchema(z.any());
export const maintenanceTaskListResponseSchema = paginatedResponseSchema(z.any());
export const damageReportListResponseSchema = paginatedResponseSchema(z.any());
export const swapRequestListResponseSchema = paginatedResponseSchema(z.any());
export const notificationListResponseSchema = paginatedResponseSchema(z.any());
export const auditLogListResponseSchema = paginatedResponseSchema(z.any());

// ============================================================================
// WebSocket Events (for real-time updates)
// ============================================================================

export const wsEventSchema = z.object({
  event: z.enum([
    'container.updated',
    'pit.updated',
    'transport_order.updated',
    'maintenance_task.updated',
    'damage_report.created',
    'swap_request.updated',
    'notification.created',
    'sync.required',
  ]),
  payload: z.record(z.unknown()),
  timestamp: z.string().datetime(),
});
export type WSEvent = z.infer<typeof wsEventSchema>;

// ============================================================================
// Map Editor Types
// ============================================================================

export const mapImageUploadSchema = z.object({
  site_id: z.string().uuid(),
  file: z.any(), // File is browser-only, validated at runtime
  bounds: z.object({
    north: z.number(),
    south: z.number(),
    east: z.number(),
    west: z.number(),
  }),
});
export type MapImageUpload = z.infer<typeof mapImageUploadSchema>;

export const mapElementSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(['zone', 'parking_spot', 'ramp', 'pit']),
  data: z.record(z.unknown()),
  position: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  }),
});
export type MapElement = z.infer<typeof mapElementSchema>;

export const saveSiteMapSchema = z.object({
  site_id: z.string().uuid(),
  elements: z.array(mapElementSchema),
  bounds: z.object({
    north: z.number(),
    south: z.number(),
    east: z.number(),
    west: z.number(),
  }).optional(),
});
export type SaveSiteMap = z.infer<typeof saveSiteMapSchema>;

// ============================================================================
// Dashboard
// ============================================================================

// GET /api/v1/dashboard/manager/overview — the manager dashboard's numbers.
// The web page (manager/Dashboard.tsx) renders all six stats below;
// containerStats is a status × fill_level breakdown kept for future widgets.
export const managerOverviewSchema = z.object({
  totalContainers: z.number(),
  containersNeedingTransport: z.number(),
  overdueMaintenance: z.number(),
  openDamageReports: z.number(),
  pendingSwapRequests: z.number(),
  pitsNeedingAttention: z.number(),
  activeOrders: z.number(),
  containerStats: z.array(
    z.object({
      status: z.string(),
      fill_level: z.string(),
      count: z.number(),
    })
  ),
});
export type ManagerOverview = z.infer<typeof managerOverviewSchema>;

// ============================================================================
// Report/Analytics Types
// ============================================================================

export const containerUtilizationReportSchema = z.object({
  site_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  date_from: z.string().datetime(),
  date_to: z.string().datetime(),
});
export type ContainerUtilizationReport = z.infer<typeof containerUtilizationReportSchema>;

export const driverEfficiencyReportSchema = z.object({
  driver_id: z.string().uuid().optional(),
  date_from: z.string().datetime(),
  date_to: z.string().datetime(),
});
export type DriverEfficiencyReport = z.infer<typeof driverEfficiencyReportSchema>;

export const turnaroundTimeReportSchema = z.object({
  site_id: z.string().uuid().optional(),
  date_from: z.string().datetime(),
  date_to: z.string().datetime(),
});
export type TurnaroundTimeReport = z.infer<typeof turnaroundTimeReportSchema>;


// ============================================================================
// Push Notification Types
// ============================================================================

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;

export const pushNotificationPayloadSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  icon: z.string().url().optional(),
  badge: z.string().url().optional(),
  data: z.record(z.unknown()).optional(),
  actions: z.array(z.object({
    action: z.string().min(1),
    title: z.string().min(1),
    icon: z.string().url().optional(),
  })).optional(),
  requireInteraction: z.boolean().optional(),
  silent: z.boolean().optional(),
  timestamp: z.number().optional(),
});

export type PushNotificationPayload = z.infer<typeof pushNotificationPayloadSchema>;

// Push notification action types for the client
export const PushActionType = {
  VIEW_CONTAINER: 'view_container',
  VIEW_PIT: 'view_pit',
  VIEW_ORDER: 'view_order',
  VIEW_MAINTENANCE: 'view_maintenance',
  DISMISS: 'dismiss',
} as const;

export type PushActionType = typeof PushActionType[keyof typeof PushActionType];
