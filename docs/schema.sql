-- AVC Recycling Logistics System - PostgreSQL Schema
-- Generated from GLOSSARY.md domain model
-- Run order: 01_extensions, 02_enums, 03_tables, 04_indexes, 05_triggers, 06_views, 07_rls, 08_seed

-- ============================================================================
-- 01_extensions.sql
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ============================================================================
-- 02_enums.sql
-- ============================================================================
CREATE TYPE container_type AS ENUM ('open_top', 'closed', 'compactor', 'roll_off');
CREATE TYPE fill_level AS ENUM ('0', '25', '50', '75', '100');
CREATE TYPE transport_order_status AS ENUM ('planned', 'assigned', 'in_progress', 'completed', 'archived');
CREATE TYPE vehicle_classification AS ENUM ('location_bound', 'transport');
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'driver', 'worker');
CREATE TYPE maintenance_type AS ENUM ('scheduled', 'condition_based');
CREATE TYPE maintenance_status AS ENUM ('due', 'in_progress', 'completed', 'overdue');
CREATE TYPE damage_severity AS ENUM ('minor', 'major', 'critical');

-- ============================================================================
-- 03_tables.sql
-- ============================================================================

-- Companies (internal departments that own containers)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sites (geographically distinct recycling facilities)
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    address TEXT,
    gps_lat DECIMAL(10, 8),
    gps_lng DECIMAL(11, 8),
    map_image_url TEXT,              -- uploaded static site map image
    map_image_bounds JSONB,          -- {north, south, east, west} for geo-referencing
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Waste Categories (configurable per site)
CREATE TABLE waste_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    color_hex CHAR(7),               -- for UI display (e.g., #FF5733)
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (site_id, name)
);

-- Zones (named areas within a site: "Storage Area", "Loading Zone", etc.)
CREATE TABLE zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    polygon_geojson JSONB,           -- GeoJSON polygon for map rendering
    color_hex CHAR(7),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (site_id, name)
);

-- Parking Spots (exactly 1 container per spot)
CREATE TABLE parking_spots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    spot_code VARCHAR(20) NOT NULL,  -- human-readable: "A-01", "B-12"
    position_x DECIMAL(6, 2) NOT NULL,  -- percentage on map image (0-100)
    position_y DECIMAL(6, 2) NOT NULL,
    gps_lat DECIMAL(10, 8),
    gps_lng DECIMAL(11, 8),
    allowed_container_types container_type[],  -- NULL = any type
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (zone_id, spot_code)
);

-- Ramps (public drop-off points)
CREATE TABLE ramps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    waste_category_id UUID NOT NULL REFERENCES waste_categories(id) ON DELETE RESTRICT,
    position_x DECIMAL(6, 2) NOT NULL,
    position_y DECIMAL(6, 2) NOT NULL,
    gps_lat DECIMAL(10, 8),
    gps_lng DECIMAL(11, 8),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (site_id, name)
);

-- Pits (in-ground disposal areas)
CREATE TABLE pits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    material_type VARCHAR(100) NOT NULL,  -- admin-definable: "garden waste", "construction debris"
    capacity_cubic_meters DECIMAL(8, 2),  -- optional volume capacity
    position_x DECIMAL(6, 2) NOT NULL,
    position_y DECIMAL(6, 2) NOT NULL,
    gps_lat DECIMAL(10, 8),
    gps_lng DECIMAL(11, 8),
    fill_level fill_level NOT NULL DEFAULT '0',
    alert_threshold fill_level NOT NULL DEFAULT '75',
    last_emptied_at TIMESTAMPTZ,
    last_updated_by UUID,              -- references users(id)
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (site_id, name)
);

-- Users (all roles: admin, manager, driver, worker)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role user_role NOT NULL DEFAULT 'worker',
    site_id UUID REFERENCES sites(id) ON DELETE SET NULL,  -- worker's assigned site
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vehicles
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_number VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100),               -- display name: "Truck 1", "Volvo FH16"
    type VARCHAR(100) NOT NULL,      -- e.g., "Hook lift", "Skip loader", "Roll-off truck"
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    year INT,
    classification vehicle_classification NOT NULL DEFAULT 'transport',
    home_site_id UUID REFERENCES sites(id) ON DELETE SET NULL,  -- for location_bound vehicles
    max_containers INT NOT NULL DEFAULT 1,
    qr_code_value TEXT,              -- for vehicle identification
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Containers
CREATE TABLE containers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    container_number VARCHAR(30) NOT NULL UNIQUE,  -- physical ID on container
    qr_code_value TEXT NOT NULL UNIQUE,            -- for scanning
    type container_type NOT NULL,
    owning_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    current_site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
    current_spot_id UUID REFERENCES parking_spots(id) ON DELETE SET NULL,
    fill_level fill_level NOT NULL DEFAULT '0',
    last_maintenance_at TIMESTAMPTZ,
    next_maintenance_due TIMESTAMPTZ,              -- computed by scheduler
    maintenance_interval_months INT NOT NULL DEFAULT 6,
    status VARCHAR(30) NOT NULL DEFAULT 'active',  -- active, maintenance, retired
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Container Ownership History (audit trail for transfers)
CREATE TABLE container_ownership_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    from_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    to_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT
);

-- Transport Orders
CREATE TABLE transport_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(30) NOT NULL UNIQUE,      -- human-readable: "TO-2026-00123"
    status transport_order_status NOT NULL DEFAULT 'planned',
    planned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    planned_start_at TIMESTAMPTZ,
    actual_start_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transport Order Stops (multi-stop routes)
CREATE TABLE transport_order_stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES transport_orders(id) ON DELETE CASCADE,
    sequence INT NOT NULL,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
    stop_type VARCHAR(20) NOT NULL CHECK (stop_type IN ('pickup', 'dropoff')),
    planned_at TIMESTAMPTZ,
    actual_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE (order_id, sequence)
);

-- Transport Order Containers (many-to-many: order <-> containers at each stop)
CREATE TABLE transport_order_containers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES transport_orders(id) ON DELETE CASCADE,
    stop_id UUID NOT NULL REFERENCES transport_order_stops(id) ON DELETE CASCADE,
    container_id UUID NOT NULL REFERENCES containers(id) ON DELETE RESTRICT,
    target_spot_id UUID REFERENCES parking_spots(id) ON DELETE SET NULL,  -- for dropoff
    loaded_at TIMESTAMPTZ,
    unloaded_at TIMESTAMPTZ,
    notes TEXT
);

-- Driver shifts: the driver picks a vehicle at shift start (GLOSSARY) and the
-- shift stays open until it is ended. One open shift per driver.
CREATE TABLE driver_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_shifts_open ON driver_shifts(driver_id) WHERE ended_at IS NULL;

-- Push subscriptions (web push, ticket 13). One subscription per user: the
-- browser registers a new endpoint and the old one is replaced.
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Maintenance Tasks
CREATE TABLE maintenance_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    type maintenance_type NOT NULL,
    status maintenance_status NOT NULL DEFAULT 'due',
    scheduled_for TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    resolution TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- system or user
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Damage Reports
CREATE TABLE damage_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    reported_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    severity damage_severity NOT NULL DEFAULT 'minor',
    description TEXT NOT NULL,
    photos JSONB,                    -- array of {url, caption, taken_at}
    status VARCHAR(20) NOT NULL DEFAULT 'open',  -- open, acknowledged, resolved
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link from a condition-based maintenance task back to the damage report that
-- triggered it (ticket 06). maintenance_tasks is created before damage_reports
-- in this file, so the FK is added here with IF NOT EXISTS — the statement is
-- idempotent and re-runs cleanly via the migration runner.
ALTER TABLE maintenance_tasks
    ADD COLUMN IF NOT EXISTS damage_report_id UUID REFERENCES damage_reports(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_damage_report ON maintenance_tasks(damage_report_id);

-- Container Swap Requests (worker requests container replacement)
CREATE TABLE swap_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    current_container_id UUID REFERENCES containers(id) ON DELETE SET NULL,
    current_spot_id UUID REFERENCES parking_spots(id) ON DELETE SET NULL,
    waste_category_id UUID REFERENCES waste_categories(id) ON DELETE SET NULL,
    preferred_container_type container_type,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, approved, fulfilled, cancelled
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    fulfilled_by UUID REFERENCES users(id) ON DELETE SET NULL,
    fulfilled_at TIMESTAMPTZ,
    new_container_id UUID REFERENCES containers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications (in-app only: badges, toasts)
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,       -- pit_alert, maintenance_due, order_assigned, order_updated, damage_reported
    title VARCHAR(200) NOT NULL,
    message TEXT,
    related_entity_type VARCHAR(30), -- container, pit, transport_order, maintenance_task
    related_entity_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit Log (immutable event store for all significant changes)
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,     -- create, update, delete, status_change, transfer
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    old_values JSONB,
    new_values JSONB,
    metadata JSONB,                  -- IP, user agent, correlation_id, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- Offline Sync Queue (server-side tracking for PWA sync)
CREATE TABLE sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL,         -- device UUID from PWA
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    operation VARCHAR(20) NOT NULL,  -- create, update, delete
    payload JSONB NOT NULL,
    client_timestamp TIMESTAMPTZ NOT NULL,
    server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, applied, conflict, failed
    conflict_resolution JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sync_queue_user_status ON sync_queue(user_id, status);
CREATE INDEX idx_sync_queue_client ON sync_queue(client_id);

-- ============================================================================
-- 04_indexes.sql
-- ============================================================================

-- Sites
CREATE INDEX idx_sites_active ON sites(is_active) WHERE is_active;

-- Zones
CREATE INDEX idx_zones_site ON zones(site_id);

-- Parking Spots
CREATE INDEX idx_parking_spots_zone ON parking_spots(zone_id);
CREATE INDEX idx_parking_spots_active ON parking_spots(is_active) WHERE is_active;
CREATE UNIQUE INDEX uq_containers_active_spot ON containers(current_spot_id) WHERE current_spot_id IS NOT NULL;

-- Ramps
CREATE INDEX idx_ramps_site ON ramps(site_id);
CREATE INDEX idx_ramps_waste_category ON ramps(waste_category_id);

-- Pits
CREATE INDEX idx_pits_site ON pits(site_id);
CREATE INDEX idx_pits_active ON pits(is_active) WHERE is_active;
CREATE INDEX idx_pits_fill_level ON pits(fill_level) WHERE fill_level IN ('75', '100');

-- Users
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_site ON users(site_id);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active;

-- Vehicles
CREATE INDEX idx_vehicles_classification ON vehicles(classification);
CREATE INDEX idx_vehicles_home_site ON vehicles(home_site_id);
CREATE INDEX idx_vehicles_active ON vehicles(is_active) WHERE is_active;

-- Containers
CREATE INDEX idx_containers_site ON containers(current_site_id);
CREATE INDEX idx_containers_spot ON containers(current_spot_id);
CREATE INDEX idx_containers_company ON containers(owning_company_id);
CREATE INDEX idx_containers_fill_level ON containers(fill_level);
CREATE INDEX idx_containers_next_maintenance ON containers(next_maintenance_due) WHERE next_maintenance_due IS NOT NULL;
CREATE INDEX idx_containers_qr ON containers(qr_code_value);
CREATE INDEX idx_containers_number ON containers(container_number);

-- Transport Orders
CREATE INDEX idx_transport_orders_status ON transport_orders(status);
CREATE INDEX idx_transport_orders_driver ON transport_orders(assigned_driver_id);
CREATE INDEX idx_transport_orders_vehicle ON transport_orders(assigned_vehicle_id);
CREATE INDEX idx_transport_orders_planned_start ON transport_orders(planned_start_at);
CREATE INDEX idx_transport_orders_number ON transport_orders(order_number);

-- Transport Order Stops
CREATE INDEX idx_transport_order_stops_order ON transport_order_stops(order_id);
CREATE INDEX idx_transport_order_stops_site ON transport_order_stops(site_id);

-- Transport Order Containers
CREATE INDEX idx_transport_order_containers_order ON transport_order_containers(order_id);
CREATE INDEX idx_transport_order_containers_stop ON transport_order_containers(stop_id);
CREATE INDEX idx_transport_order_containers_container ON transport_order_containers(container_id);

-- Maintenance Tasks
CREATE INDEX idx_maintenance_tasks_container ON maintenance_tasks(container_id);
CREATE INDEX idx_maintenance_tasks_status ON maintenance_tasks(status);
CREATE INDEX idx_maintenance_tasks_scheduled ON maintenance_tasks(scheduled_for);
CREATE INDEX idx_maintenance_tasks_assigned ON maintenance_tasks(assigned_to);

-- Damage Reports
CREATE INDEX idx_damage_reports_container ON damage_reports(container_id);
CREATE INDEX idx_damage_reports_status ON damage_reports(status);
CREATE INDEX idx_damage_reports_reported_by ON damage_reports(reported_by);

-- Swap Requests
CREATE INDEX idx_swap_requests_site ON swap_requests(site_id);
CREATE INDEX idx_swap_requests_status ON swap_requests(status);

-- Notifications
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read) WHERE NOT is_read;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- Container Ownership History
CREATE INDEX idx_container_ownership_container ON container_ownership_history(container_id);
CREATE INDEX idx_container_ownership_changed_at ON container_ownership_history(changed_at DESC);

-- ============================================================================
-- 05_triggers.sql
-- ============================================================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_zones_updated_at BEFORE UPDATE ON zones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_parking_spots_updated_at BEFORE UPDATE ON parking_spots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ramps_updated_at BEFORE UPDATE ON ramps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pits_updated_at BEFORE UPDATE ON pits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_containers_updated_at BEFORE UPDATE ON containers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transport_orders_updated_at BEFORE UPDATE ON transport_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_maintenance_tasks_updated_at BEFORE UPDATE ON maintenance_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_damage_reports_updated_at BEFORE UPDATE ON damage_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_swap_requests_updated_at BEFORE UPDATE ON swap_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_waste_categories_updated_at BEFORE UPDATE ON waste_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit log trigger function
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_action TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'create';
        v_old := NULL;
        v_new := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        v_old := to_jsonb(OLD);
        v_new := NULL;
    END IF;

    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_action, current_setting('app.current_user_id', TRUE)::UUID, v_old, v_new);

    RETURN NULL; -- AFTER trigger
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to key tables
CREATE TRIGGER audit_sites AFTER INSERT OR UPDATE OR DELETE ON sites FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER audit_containers AFTER INSERT OR UPDATE OR DELETE ON containers FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER audit_transport_orders AFTER INSERT OR UPDATE OR DELETE ON transport_orders FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER audit_maintenance_tasks AFTER INSERT OR UPDATE OR DELETE ON maintenance_tasks FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER audit_damage_reports AFTER INSERT OR UPDATE OR DELETE ON damage_reports FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER audit_swap_requests AFTER INSERT OR UPDATE OR DELETE ON swap_requests FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER audit_pits AFTER INSERT OR UPDATE OR DELETE ON pits FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER audit_vehicles AFTER INSERT OR UPDATE OR DELETE ON vehicles FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- Pit fill level alert trigger
CREATE OR REPLACE FUNCTION check_pit_alert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.fill_level IN ('75', '100') AND (OLD.fill_level IS NULL OR OLD.fill_level NOT IN ('75', '100')) THEN
        -- Notify all workers and managers at this site
        INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
        SELECT u.id, 'pit_alert',
               'Gropen ' || NEW.name || ' behöver uppmärksamhet',
               'Fyllnadsgraden nådde ' || NEW.fill_level || '% för ' || NEW.name,
               'pit', NEW.id
        FROM users u
        WHERE u.site_id = NEW.site_id
          AND u.role IN ('worker', 'manager', 'admin')
          AND u.is_active;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pit_fill_level_alert
AFTER UPDATE OF fill_level ON pits
FOR EACH ROW EXECUTE FUNCTION check_pit_alert();

-- Container fill level change -> check if transport suggestion needed
CREATE OR REPLACE FUNCTION check_container_transport_suggestion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.fill_level IN ('75', '100') AND (OLD.fill_level IS NULL OR OLD.fill_level NOT IN ('75', '100')) THEN
        -- Could trigger a background job to suggest transport orders
        -- For now, just log; actual suggestion logic in application layer
        INSERT INTO audit_log (entity_type, entity_id, action, new_values, metadata)
        VALUES ('container', NEW.id, 'fill_threshold_reached',
                jsonb_build_object('fill_level', NEW.fill_level, 'site_id', NEW.current_site_id),
                jsonb_build_object('trigger', 'transport_suggestion_candidate'));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER container_fill_level_transport_suggestion
AFTER UPDATE OF fill_level ON containers
FOR EACH ROW EXECUTE FUNCTION check_container_transport_suggestion();

-- Auto-set next_maintenance_due on container insert/update
CREATE OR REPLACE FUNCTION update_next_maintenance_due()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.last_maintenance_at IS NOT NULL AND NEW.maintenance_interval_months > 0 THEN
        NEW.next_maintenance_due := NEW.last_maintenance_at + (NEW.maintenance_interval_months || ' months')::INTERVAL;
    ELSE
        NEW.next_maintenance_due := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER container_next_maintenance
BEFORE INSERT OR UPDATE ON containers
FOR EACH ROW EXECUTE FUNCTION update_next_maintenance_due();

-- ============================================================================
-- 06_views.sql
-- ============================================================================

-- Container Overview (for Manager view)
CREATE VIEW v_container_overview AS
SELECT
    c.id,
    c.container_number,
    c.qr_code_value,
    c.type,
    c.fill_level,
    c.status,
    c.owning_company_id,
    co.name AS owning_company_name,
    c.current_site_id,
    s.name AS current_site_name,
    c.current_spot_id,
    ps.spot_code,
    z.name AS zone_name,
    c.last_maintenance_at,
    c.next_maintenance_due,
    c.maintenance_interval_months,
    CASE
        WHEN c.next_maintenance_due IS NOT NULL AND c.next_maintenance_due < NOW() THEN 'overdue'
        WHEN c.next_maintenance_due IS NOT NULL AND c.next_maintenance_due < NOW() + INTERVAL '30 days' THEN 'due_soon'
        ELSE 'ok'
    END AS maintenance_status,
    c.updated_at
FROM containers c
JOIN companies co ON c.owning_company_id = co.id
LEFT JOIN sites s ON c.current_site_id = s.id
LEFT JOIN parking_spots ps ON c.current_spot_id = ps.id
LEFT JOIN zones z ON ps.zone_id = z.id;

-- Pit Overview (for Dashboard/Worker)
CREATE VIEW v_pit_overview AS
SELECT
    p.id,
    p.name,
    p.material_type,
    p.fill_level,
    p.alert_threshold,
    p.capacity_cubic_meters,
    p.site_id,
    s.name AS site_name,
    p.position_x,
    p.position_y,
    p.last_emptied_at,
    p.last_updated_at,
    CASE
        WHEN p.fill_level = '100' THEN 'critical'
        WHEN p.fill_level = '75' THEN 'warning'
        WHEN p.fill_level = '50' THEN 'moderate'
        ELSE 'ok'
    END AS alert_level
FROM pits p
JOIN sites s ON p.site_id = s.id
WHERE p.is_active AND s.is_active;

-- Transport Order with Stops (for Driver/Planner)
-- Helper function for user full name
CREATE OR REPLACE FUNCTION u_fullname(user_id UUID) RETURNS TEXT AS $$
    SELECT full_name FROM users WHERE id = user_id;
$$ LANGUAGE sql STABLE;

CREATE VIEW v_transport_order_detail AS
SELECT
    t_order.id AS order_id,
    t_order.order_number,
    t_order.status,
    t_order.planned_by,
    u_fullname(t_order.planned_by) AS planner_name,
    t_order.assigned_driver_id,
    u_fullname(t_order.assigned_driver_id) AS driver_name,
    t_order.assigned_vehicle_id,
    v.registration_number,
    v.name AS vehicle_name,
    t_order.planned_start_at,
    t_order.actual_start_at,
    t_order.completed_at,
    jsonb_agg(
        jsonb_build_object(
            'stop_id', tos.id,
            'sequence', tos.sequence,
            'site_id', tos.site_id,
            'site_name', s.name,
            'stop_type', tos.stop_type,
            'planned_at', tos.planned_at,
            'actual_at', tos.actual_at,
            'containers', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'container_id', toc.container_id,
                        'container_number', c.container_number,
                        'container_type', c.type,
                        'fill_level', c.fill_level,
                        'target_spot_id', toc.target_spot_id,
                        'target_spot_code', ps.spot_code,
                        'loaded_at', toc.loaded_at,
                        'unloaded_at', toc.unloaded_at
                    )
                )
                FROM transport_order_containers toc
                JOIN containers c ON toc.container_id = c.id
                LEFT JOIN parking_spots ps ON toc.target_spot_id = ps.id
                WHERE toc.stop_id = tos.id
            )
        ) ORDER BY tos.sequence
    ) AS stops
FROM transport_orders t_order
LEFT JOIN users u_planner ON t_order.planned_by = u_planner.id
LEFT JOIN users u_driver ON t_order.assigned_driver_id = u_driver.id
LEFT JOIN vehicles v ON t_order.assigned_vehicle_id = v.id
LEFT JOIN transport_order_stops tos ON t_order.id = tos.order_id
LEFT JOIN sites s ON tos.site_id = s.id
GROUP BY t_order.id, u_planner.full_name, u_driver.full_name, v.registration_number, v.name;
-- Maintenance Overview
CREATE VIEW v_maintenance_overview AS
SELECT
    mt.id,
    mt.container_id,
    c.container_number,
    c.type AS container_type,
    c.current_site_id,
    s.name AS site_name,
    mt.type AS maintenance_type,
    mt.status,
    mt.scheduled_for,
    mt.started_at,
    mt.completed_at,
    mt.assigned_to,
    u.full_name AS assigned_to_name,
    mt.description,
    c.maintenance_interval_months,
    c.last_maintenance_at
FROM maintenance_tasks mt
JOIN containers c ON mt.container_id = c.id
LEFT JOIN sites s ON c.current_site_id = s.id
LEFT JOIN users u ON mt.assigned_to = u.id;

-- Site Dashboard Summary (for kiosk/mobile dashboard)
CREATE VIEW v_site_dashboard AS
SELECT
    s.id AS site_id,
    s.name AS site_name,
    s.map_image_url,
    s.map_image_bounds,
    -- Containers at site
    jsonb_agg(DISTINCT jsonb_build_object(
        'id', c.id,
        'container_number', c.container_number,
        'type', c.type,
        'fill_level', c.fill_level,
        'spot_id', c.current_spot_id,
        'spot_code', ps.spot_code,
        'zone_id', z.id,
        'zone_name', z.name,
        'position_x', ps.position_x,
        'position_y', ps.position_y
    )) FILTER (WHERE c.id IS NOT NULL) AS containers,
    -- Pits at site
    jsonb_agg(DISTINCT jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'material_type', p.material_type,
        'fill_level', p.fill_level,
        'alert_threshold', p.alert_threshold,
        'position_x', p.position_x,
        'position_y', p.position_y,
        'alert_level', CASE
            WHEN p.fill_level = '100' THEN 'critical'
            WHEN p.fill_level = '75' THEN 'warning'
            ELSE 'ok'
        END
    )) FILTER (WHERE p.id IS NOT NULL) AS pits,
    -- Zones for map rendering
    jsonb_agg(DISTINCT jsonb_build_object(
        'id', z.id,
        'name', z.name,
        'polygon_geojson', z.polygon_geojson,
        'color_hex', z.color_hex
    )) FILTER (WHERE z.id IS NOT NULL) AS zones
FROM sites s
LEFT JOIN containers c ON c.current_site_id = s.id
LEFT JOIN parking_spots ps ON c.current_spot_id = ps.id
LEFT JOIN zones z ON ps.zone_id = z.id OR z.site_id = s.id
LEFT JOIN pits p ON p.site_id = s.id AND p.is_active
WHERE s.is_active
GROUP BY s.id, s.name, s.map_image_url, s.map_image_bounds;

-- Driver Shift View (assigned orders + available vehicles)
CREATE VIEW v_driver_shift AS
SELECT
    u.id AS driver_id,
    u.full_name AS driver_name,
    -- Assigned orders (planned or assigned to this driver)
    jsonb_agg(DISTINCT jsonb_build_object(
        'order_id', t_order.id,
        'order_number', t_order.order_number,
        'status', t_order.status,
        'planned_start_at', t_order.planned_start_at,
        'stops', (
            SELECT jsonb_agg(jsonb_build_object(
                'stop_id', tos.id,
                'sequence', tos.sequence,
                'site_id', tos.site_id,
                'site_name', s.name,
                'stop_type', tos.stop_type,
                'planned_at', tos.planned_at,
                'containers', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'container_id', toc.container_id,
                        'container_number', c.container_number,
                        'container_type', c.type,
                        'target_spot_id', toc.target_spot_id,
                        'target_spot_code', ps.spot_code
                    ))
                    FROM transport_order_containers toc
                    JOIN containers c ON toc.container_id = c.id
                    LEFT JOIN parking_spots ps ON toc.target_spot_id = ps.id
                    WHERE toc.stop_id = tos.id
                )
            ) ORDER BY tos.sequence)
            FROM transport_order_stops tos
            JOIN sites s ON tos.site_id = s.id
            WHERE tos.order_id = t_order.id
        )
    )) FILTER (WHERE t_order.id IS NOT NULL) AS assigned_orders,
    -- Available vehicles (all active transport vehicles + location-bound at driver's site)
    jsonb_agg(DISTINCT jsonb_build_object(
        'id', v.id,
        'registration_number', v.registration_number,
        'name', v.name,
        'type', v.type,
        'classification', v.classification,
        'home_site_id', v.home_site_id,
        'max_containers', v.max_containers,
        'qr_code_value', v.qr_code_value
    )) FILTER (WHERE v.id IS NOT NULL) AS available_vehicles
FROM users u
LEFT JOIN transport_orders t_order ON t_order.assigned_driver_id = u.id AND t_order.status IN ('planned', 'assigned', 'in_progress')
LEFT JOIN vehicles v ON v.is_active AND (v.classification = 'transport' OR v.home_site_id = u.site_id)
WHERE u.role = 'driver' AND u.is_active
GROUP BY u.id, u.full_name;

-- ============================================================================
-- 07_rls.sql (Row Level Security - for future multi-tenancy if needed)
-- ============================================================================
-- Currently all users see everything (internal departments).
-- RLS policies can be enabled later if company isolation is needed.
-- ALTER TABLE containers ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY containers_company_isolation ON containers
--     USING (owning_company_id = current_setting('app.current_company_id')::UUID);

-- ============================================================================
-- 08_reference_functions.sql
-- (Reference data and demo accounts are seeded by apps/api/src/db/seed.ts —
--  `pnpm db:seed` — not here, so bcrypt cost and demo data stay in one place.)

-- Example: Create a function to generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number() RETURNS TEXT AS $$
DECLARE
    v_year INT := EXTRACT(YEAR FROM NOW())::INT;
    v_seq INT;
BEGIN
    LOCK TABLE transport_orders IN EXCLUSIVE MODE;
    SELECT COALESCE(MAX(
        SUBSTRING(order_number FROM 'TO-' || v_year || '-(\d+)')::INT
    ), 0) + 1 INTO v_seq
    FROM transport_orders
    WHERE order_number LIKE 'TO-' || v_year || '-%';
    RETURN 'TO-' || v_year || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Example: Create a function to generate container numbers
CREATE OR REPLACE FUNCTION generate_container_number(p_type container_type) RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT;
    v_seq INT;
BEGIN
    v_prefix := CASE p_type
        WHEN 'open_top' THEN 'OT'
        WHEN 'closed' THEN 'CL'
        WHEN 'compactor' THEN 'CP'
        WHEN 'roll_off' THEN 'RO'
    END;
    LOCK TABLE containers IN EXCLUSIVE MODE;
    SELECT COALESCE(MAX(
        SUBSTRING(container_number FROM v_prefix || '-(\d+)')::INT
    ), 0) + 1 INTO v_seq
    FROM containers
    WHERE container_number LIKE v_prefix || '-%';
    RETURN v_prefix || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Helper: Set current user for audit triggers (call from application)
-- ============================================================================
-- In application code, run: SET LOCAL app.current_user_id = '<user-uuid>';
-- before any write operation. This is captured by audit_log_trigger().

-- ============================================================================
-- End of schema
-- ============================================================================