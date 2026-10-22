# Glossary - AVC Recycling Logistics System

> **Context**: Logistics management for a recycling company with multiple geographically separated sites. Four user views: Manager (desktop), Dashboard (kiosk/mobile), Driver (mobile PWA), Worker (mobile PWA).

---

## Core Entities

### Site
A geographically distinct recycling facility. Each site has:
- **Ramps**: Public drop-off points for specific waste categories (configurable per site)
- **Pits**: In-ground disposal areas for materials like garden waste (admin-definable material type)
- **Parking Zones**: Named areas (e.g., "Storage Area", "Loading Zone") containing **Parking Spots**
- **Parking Spot**: A single designated position for exactly one container (1:1 mapping)

### Container
A mobile waste receptacle owned by one of three internal companies.
- **Type**: Fixed at creation — Open-top, Closed, Compactor, Roll-off
- **Ownership**: Transferable between the three companies; full audit trail maintained
- **Fill Level**: Discrete scale only — 0%, 25%, 50%, 75%, 100% (enforced via dropdown)
- **Maintenance**: Both scheduled (auto-generated at configurable intervals, e.g., every 6 months) and condition-based (triggered by damage reports/inspections)
- **Location**: Always assigned to exactly one Parking Spot at a Site
- **QR/Barcode**: Affixed for scanning during transport operations

### Vehicle
Company-owned transport asset.
- **Classification**: Location-bound (stays at one site) or Transport (moves between sites)
- **Attributes**: Type, manufacturer
- **Assignment**: Any driver can operate any vehicle; no certification restrictions

### Driver
Employee who operates vehicles and executes transport orders.
- **Authentication**: Mobile-friendly login (PWA)
- **Shift Start**: Selects vehicle → sees pre-assigned orders + receives real-time dispatches
- **Container Tracking**: Updates container locations via QR scan (preferred) or list selection

### Transport Order
A planned movement of one or more containers.
- **Structure**: Flexible — supports both simple A→B moves and multi-stop routes
- **Lifecycle**: `Planned` → `Assigned` → `In Progress` → `Completed` → `Archived`
- **Planning**: System suggests orders based on fill-level thresholds; planner approves/modifies
- **Multi-container**: Single order can reference multiple containers

### Pit
In-ground disposal area at a site.
- **Material Type**: Admin-definable (e.g., garden waste, construction debris)
- **Fill Level**: Same discrete scale as containers (0/25/50/75/100%)
- **Alerting**: Automatic in-app notification (badge/toast) when fill level reaches 75%+
- **Emptying**: Workers confirm emptying via Worker view; resets fill level

### Waste Category
A classification of waste material accepted at a ramp.
- **Scope**: Configurable per site (each site defines its own categories)
- **Examples**: Wood, Metal, Plastic, Paper, Garden, Mixed, Hazardous
- **Mapping**: No enforced 1:1 mapping to container types; compatibility is advisory

---

## User Roles & Views

| Role | Permissions | Primary View |
|------|-------------|--------------|
| **Admin** | Full system configuration, user management, all sites | Manager + Dashboard |
| **Manager** | Create/edit transport orders, container overview, maintenance schedule, all sites | Manager (desktop) |
| **Driver** | Execute assigned orders, update container locations, view own shift | Driver App (mobile PWA) |
| **Worker** | Update container/pit fill levels, report damage, request swap, own site | Worker App (mobile PWA) |

**Note**: Roles have fixed permissions. No site-scoped roles or custom permission matrix.

---

## Views

### 1. Manager View (Desktop)
Primary operational interface for planners/managers.
- **Key Tasks**: Create/edit transport orders, container status overview, maintenance schedule management
- **Transport Planning**: Assisted — system proposes moves based on fill thresholds; planner approves
- **Site Configuration**: Ramps, waste categories, zones, parking spots, pit definitions
- **Reporting**: Operational KPIs (utilization, turnaround time, driver efficiency)

### 2. Dashboard View (Kiosk TV + Mobile Supervisor)
Read-heavy, glanceable site overview.
- **Kiosk Mode**: Large screen at site, auto-refresh, passive viewing
- **Mobile Supervisor**: Touch-friendly, interactive, drill-down capability
- **Map Visualization**: Static site image (uploaded) with zones and spots; color-coded fill levels

### 3. Driver App (Mobile PWA, Offline-First)
- **Shift Start**: Vehicle selection → assigned orders + real-time dispatches
- **Execution**: Step through order stops, scan container QR codes, confirm pickup/dropoff
- **Offline**: Full read/write offline; background sync when connectivity restored
- **Notifications**: In-app only (badges, toasts) for new/updated orders

### 4. Worker App (Mobile PWA, Offline-First)
- **Actions**: Update container fill level, update pit fill level, report container damage, request container swap
- **Offline**: Full read/write offline; background sync
- **Site-Scoped**: Workers see only their assigned site

---

## Technical Architecture

### Stack
- **Frontend**: React (PWA) — single codebase for all four views, responsive
- **Backend**: Node.js (TypeScript) or Python (FastAPI) — REST API
- **Database**: PostgreSQL (primary, full audit trail, infinite retention)
- **Cache/Queue**: Redis (sessions, caching, background jobs)
- **Deployment**: Docker Compose, self-hosted; `.env` for configuration
- **Reverse Proxy/DNS**: Managed separately (outside compose)

### Data & Sync
- **Offline-First**: IndexedDB in PWA; conflict resolution via last-write-wins with server timestamp
- **Sync**: Background sync on reconnect; manual "sync now" button
- **Backups/TLS/Monitoring**: Handled by external infrastructure, outside this app's scope (ADR 0003)

### Internationalization
- **Languages**: Swedish (primary) + English
- **Framework**: Full i18n ready for future languages

### Internationalization
- **Languages**: Swedish (primary) + English
- **Framework**: Full i18n ready for future languages

### Testing Strategy
- **Unit + Integration**: Critical paths (order lifecycle, container movements, maintenance scheduling)
- **E2E**: Key workflows (driver shift, worker updates, planner order creation)
- **No external integrations** — standalone system

---

## Key Business Rules

1. **Container Location**: Every container is always at exactly one Parking Spot. No "in transit" state — location updates atomically at dropoff confirmation.
2. **Fill Level Discreteness**: Only 0, 25, 50, 75, 100% allowed. Enforced at API and UI level.
3. **Pit Alert Threshold**: 75% fill triggers in-app notification to relevant workers/supervisors.
4. **Maintenance Auto-Generation**: Runs nightly; creates tasks for containers due per their interval.
5. **Ownership Transfer**: Creates audit log entry; container history preserved.
6. **Order Suggestion**: Evaluates all containers at or above 75% fill; groups by site/destination; proposes efficient routes.
7. **Data Retention**: All events, movements, fill-level changes, maintenance records kept forever.

---

## Out of Scope (decided in ADR 0004)

Deliberately excluded; the shipped application is complete without these. New features are added one at a time after completion.

- Sensor-based fill levels (IoT)
- Webhooks / REST API for ERP integration
- Advanced route optimization algorithms (the fill-threshold order suggester stays as-is)
- Native mobile apps (React Native / Flutter) — PWA covers the mobile story
- Site-scoped roles / custom RBAC (roles remain the fixed four: Admin, Manager, Driver, Worker)