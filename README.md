# AVC Management - Recycling Logistics System

A comprehensive logistics management system for a recycling company with multiple geographically separated sites.

## 🎯 Features

- **4 User Views**: Manager (desktop), Dashboard (kiosk/mobile), Driver (mobile PWA), Worker (mobile PWA)
- **Container Management**: Track location, fill levels (0/25/50/75/100%), ownership, maintenance
- **Transport Planning**: Multi-stop routes with assisted suggestions based on fill thresholds
- **Site Management**: Zones, parking spots, ramps, pits with visual map editor
- **Offline-First**: Full PWA support with IndexedDB sync for drivers/workers in poor coverage areas
- **Maintenance**: Scheduled (auto-generated) + condition-based with audit trail
- **Real-time Dashboard**: Color-coded fill levels, pit alerts at 75%+

## 🏗️ Architecture

```
avc_management_app/
├── apps/
│   ├── api/          # Fastify/TypeScript backend
│   └── web/          # React/Vite PWA frontend
├── packages/
│   ├── shared-types/ # TypeScript types (Zod schemas, domain types)
│   ├── ui/           # Shared React components (Tailwind)
│   └── db/           # Database utilities (Kysely)
├── docs/
│   ├── schema.sql    # PostgreSQL schema
│   └── adr/          # Architecture Decision Records
├── docker-compose.yml
└── turbo.json        # Turborepo config
```

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite, PWA (Workbox), React Router, TanStack Query, Zustand, Tailwind CSS
- **Backend**: Fastify, TypeScript, Kysely (type-safe SQL), PostgreSQL, Redis
- **Database**: PostgreSQL 16 with full audit trail, JSONB for flexible config
- **Deployment**: Docker Compose, self-hosted
- **Monorepo**: pnpm workspaces + Turborepo

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Development

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL + Redis)
pnpm docker:up

# Run database migrations
pnpm db:migrate

# Seed with demo data
pnpm db:seed

# Start development servers
pnpm dev
```

This starts:
- API at http://localhost:3000
- Web at http://localhost:5173
- PostgreSQL at localhost:5432
- Redis at localhost:6379

### Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@avc.local | admin123 |
| Manager | manager@avc.local | manager123 |
| Driver | driver1@avc.local | driver123 |
| Worker | worker1@avc.local | worker123 |

## 📦 Production Build

```bash
# Build all packages
pnpm build

# Build Docker images
docker-compose build

# Start production stack
docker-compose up -d
```

## 📁 Key Directories

### Apps
- `apps/api/src/` - Backend routes, middleware, database, config
- `apps/web/src/` - Frontend pages, components, stores, utils

### Packages
- `packages/shared-types/src/domain.ts` - Core domain types (Container, Site, Order, etc.)
- `packages/shared-types/src/api.ts` - API request/response schemas
- `packages/ui/src/components/` - Reusable UI components (Button, Table, Modal, etc.)

### Database
- `docs/schema.sql` - Complete PostgreSQL schema with triggers, views, indexes

## 🔐 Authentication

- JWT access tokens (15 min) + refresh tokens (7 days)
- Role-based access: Admin, Manager, Driver, Worker
- HttpOnly cookies for refresh tokens (production)

## 📱 PWA / Offline Support

- Service Worker with Workbox
- IndexedDB (Dexie) for offline mutations
- Background sync when online
- Server-wins conflict resolution

## 🗺️ Map Editor

- Upload site map image (JPG/PNG/WebP)
- Define zones as polygons
- Place parking spots, ramps, pits visually
- GeoJSON storage for rendering

## 📊 Reports & Analytics

- Container utilization by site/company
- Driver efficiency (orders completed)
- Turnaround time analysis
- Maintenance compliance rate

## 🔧 Configuration

Environment variables (`.env`):

```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/avc_management
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
APP_PORT=3000
WEB_URL=http://localhost:5173
```

## 📝 API Documentation

API base: `/api/v1`

Key endpoints:
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh token
- `GET /containers` - List containers (with filters)
- `PATCH /containers/:id/fill-level` - Update fill level
- `POST /transport-orders` - Create transport order
- `POST /transport-orders/:id/execute` - Driver actions (start/pickup/dropoff/complete)
- `GET /dashboard/site/:siteId` - Site dashboard data
- `GET /reports/*` - Various reports

## 🧪 Testing

```bash
# Run all tests
pnpm test

# API tests only
pnpm test:api

# Web tests only
pnpm test:web
```

## 📚 Documentation

- `GLOSSARY.md` - Domain model and terminology
- `docs/adr/0001-architecture-and-tech-stack.md` - Architecture decisions
- `docs/adr/0002-offline-sync-protocol.md` - Offline sync design

## 🤝 Contributing

1. Follow the domain model in `GLOSSARY.md`
2. Add types to `packages/shared-types/` first
3. Implement API routes with Zod validation
4. Build UI components in `@avc/ui`
5. Write tests for critical paths

## 📄 License

Internal use only - AVC Recycling AB