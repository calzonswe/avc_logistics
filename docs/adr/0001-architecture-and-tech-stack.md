# ADR 0001: Architecture and Technology Stack

**Date**: 2026-10-13
**Status**: Accepted

## Context

We need to build a logistics system for a recycling company with 4 distinct user views (Manager, Dashboard, Driver, Worker), supporting offline-first mobile usage, running on self-hosted Docker infrastructure.

## Decision

### Overall Architecture
- **Monolithic backend** (Node.js/TypeScript or Python/FastAPI) with REST API
- **Single React PWA frontend** serving all four views via role-based routing
- **PostgreSQL** for primary data (full ACID, audit trails, complex queries)
- **Redis** for sessions, caching, background job queue
- **Docker Compose** for orchestration; reverse proxy/DNS managed externally
- **`.env` file** for all configuration

### Frontend: React PWA (Single Codebase)
- **Why not native apps**: Team size favors single codebase; PWA provides offline-first, installability, push notifications (future)
- **Why React**: Large ecosystem, good PWA tooling (Vite + Workbox), TypeScript support
- **Role-based views**: Route guards render Manager/Dashboard/Driver/Worker interfaces
- **Offline**: Workbox for asset caching; IndexedDB (via idb or Dexie) for data; background sync on reconnect

### Backend: Node.js/TypeScript (Recommended) or Python/FastAPI
- **Node/TS preferred**: Shared types with frontend, single language across stack, good PostgreSQL drivers (pg, Kysely, or Prisma)
- **Alternative Python/FastAPI**: If team has stronger Python skills; requires separate type definitions for frontend

### Database: PostgreSQL
- **Why**: Relational model fits domain (sites, containers, orders, maintenance); JSONB for flexible site config; full audit trail via triggers or application-level event log; mature tooling for backups/replication

### Offline-First Sync Strategy
- **Client**: Optimistic UI writes to IndexedDB immediately; queues mutations
- **Server**: Receives mutations with client timestamps; last-write-wins with server timestamp authority
- **Conflict resolution**: Simple — server wins; client refreshes on sync. Low conflict probability (drivers/workers at different sites, containers moved by one driver at a time)

### Deployment
- **Docker Compose** on single VM initially; Swarm-ready compose file for future multi-node
- **Hourly pg_dump** to mounted volume / offsite; 1-hour RTO via point-in-time recovery (WAL archiving)
- **No Kubernetes**: Overhead not justified for 5-10 sites scale

## Consequences

### Positive
- Single deployable unit; simple operations
- Shared types eliminate API drift
- PWA works on any device; no app store friction
- PostgreSQL handles audit trails and complex queries naturally
- Docker Compose is portable across Linux hosts

### Negative
- Monolith couples all domains; future extraction requires effort
- Offline sync is eventually consistent; brief divergence possible
- React PWA has limited background execution on iOS (mitigated: driver/worker use during shifts, not 24/7)
- Single database = single point of failure (mitigated: hourly backups, read replica optional later)

## Alternatives Considered

| Alternative | Rejected Because |
|-------------|------------------|
| Microservices + Event Sourcing | Too complex for team/scale; audit trail achievable in monolith |
| Native iOS/Android + Web Admin | 3x frontend effort; offline harder in native without Expo/EAS |
| Firebase/Supabase (BaaS) | Self-hosting requirement; vendor lock-in |
| Kubernetes (k3s) | Operational overhead; single-node Compose sufficient for years |

## Related Decisions
- ADR 0002: Offline Sync Protocol (to be written)
- ADR 0003: Database Schema Strategy (to be written)