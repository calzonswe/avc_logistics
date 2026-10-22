# 04 — Companies endpoint + real container forms + ownership transfer UI

**Phase**: 2 — Repair broken data paths
**Blocked by**: 01, 02, 03

## Problems (from audit)
- `ContainersPage.tsx` hardcodes fake IDs `company-1..3` / `site-1..3` (not UUIDs; no `/companies` endpoint exists) → create/update always fails.
- `PATCH /containers/:id/fill-level` is sent by the UI with an unsupported `spot_id` field → contract mismatch.
- Ownership transfer exists in the API (`POST /containers/:id/transfer-ownership`, writes `container_ownership_history`) but has **no UI**; the "Flytta" button actually re-sends the fill level.

## Deliverables
- `GET /companies` route + Zod schema in `@avc/shared-types`; CompaniesPage implications noted (read-only is fine for MVP).
- ContainersPage rebuilt on real data: company select, site select from `/sites`, create + update against true UUID endpoints, fill-level PATCH matching the documented contract.
- Real ownership-transfer dialog: pick target company, confirm, audit-trail entry created.
- Container history view: read endpoint for `container_ownership_history` (+ movements if present) shown as a timeline on the container detail.

## Acceptance
- [x] Create container via UI succeeds with a real company + site
- [x] Fill level update from the UI works and matches the API schema exactly
- [x] Transfer ownership via UI; history timeline shows the old → new company with actor
- [x] Vitest: fill-level validation rejects values outside the discrete scale (API test, written first)

## Completion notes (2026-10-21)

**Delivered**
- **`GET /companies`** (new `routes/companies.ts`, registered under `/api/v1/companies`): active-name-ordered list incl. per-company container count; contract documented as `companyOverviewSchema`/`CompanyOverview` in shared-types (extends the domain `companySchema` — reuse, no duplicate `Company` type).
- **Fill-level contract**: `updateContainerFillLevelSchema` is now **strict** `{ fill_level }` only — the phantom `spot_id` removed (spot moves are the swap/move flow, ticket 06; a fill PATCH must never double as a move). All container write routes (create, update, fill-level, transfer) now `safeParse` their bodies against the shared schemas via a local `parseBody` helper that surfaces a clean `400 VALIDATION_ERROR` with the zod path/message instead of a Postgres 500. Create/update additionally validate: spot exists + active **and belongs to the chosen site**, spot not occupied by another (non-retired) container on update as well (previously create-only).
- **ContainersPage rebuilt on real data**: company select from `/companies` (with counts), site select from `/sites`, spot select from `/sites/:siteId/parking-spots` filtered client-side to `is_active`, spot cleared automatically when the site changes; empty-string uuid fields stripped before send; create/update mutations surface server errors in the modal. The old free-text "Parkeringsplats (ID)" input is gone.
- **"Flytta" button replaced** by "Överlåt ägande" (it previously just re-sent the same fill level): TransferOwnershipDialog with candidate companies (current owner excluded, count shown) + reason; calls `PATCH /containers/:id/transfer-ownership`; container detail view also exposes the transfer action.
- **History endpoint** `GET /containers/:id/history` (worker+ roles): `ownership` rows (from→to company names, actor `changed_by_name`, reason, ISO changed_at) + `movements` (linked transport-order stops with planned/loaded/unloaded), newest first, both from `container_ownership_history` / `transport_order_containers`. Rendered as a timeline in the container detail modal; invalidated after a transfer so old→new shows immediately.
- **Test-first (red→green)**: `containerFillLevel.test.ts` written BEFORE the route validation — 9 asserts red (invalid values 500/`AppError`, strict extra-fields accepted, create passing invalid enums through) → then green.
- Vitest multi-suite discovery exposed a latent `@avc/shared-types` exports-map gap: added `./api.js`, `./db.js`, `./domain.js` subpaths to its `exports` (imports across the monorepo use `.js` suffixes; vite/strict-resolvers need them).

**Verification (all green)**
- Live manager-token flow: create `XX-04201` with real company/site/spot UUIDs → 201 (checks ran: occupancy, site-zones match); fill `37` → `400 VALIDATION_ERROR 'Invalid enum value…'`; fill `75` → 200; transfer to another company → `{success:true}`; history shows `AVC Recycling AB → AVC Transport AB` with actor + reason; movements endpoint returns seeded order links (`TO-2026-00001 pickup @ Centralterminal`). Test container retired afterwards.
- Vitest 17/17 across both suites; monorepo `pnpm typecheck` exit 0; `pnpm --filter @avc/web build` (incl. PWA) succeeds.

**Follow-ups**
- `POST /containers/:id/transfer-ownership` remains a PATCH (matching the shared route naming); fine since ticket 05+ work keys off the real UI paths.
- Spot occupancy display in the form select (mark occupied spots) left to ticket 05's map work — server conflict guard already covers it.
- Composition date/updated_at on `CompanyOverview` are ISO strings after JSON serialization (zod datetime safe).
