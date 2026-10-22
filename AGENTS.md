# AGENTS.md — AVC Management App (recycling logistics, multi-site)

pnpm 9 + Turborepo monorepo: `apps/api` (Fastify + Kysely, port 3000) and `apps/web` (React 18 + Vite PWA, port 5173), with `packages/{shared-types,ui,db}`. Node 20+.

## Sources of truth (read before domain work)

- `GLOSSARY.md` — domain model, roles, and business rules (discrete fill levels, container always at exactly one spot, 75% pit alert, etc.). Don't reinvent domain rules; this file was accepted as the spec.
- `docs/schema.sql` — single-file PostgreSQL schema (tables, enums, triggers, views). There is **no migration history**; `apps/api/src/db/migrate.ts` just re-executes this file as raw SQL (skips "already exists" errors).
- `docs/adr/` — tech stack and offline-sync decisions.

## Commands

```bash
pnpm install
pnpm docker:up                  # PostgreSQL 16 + Redis only
pnpm dev                        # API (tsx watch, :3000) + web (Vite, :5173)
pnpm --filter @avc/api db:migrate   # apply docs/schema.sql
pnpm --filter @avc/api db:seed
pnpm lint / typecheck / test    # via turbo; typecheck auto-builds deps (^build)
```

Single package: `pnpm --filter @avc/api lint` (names: `@avc/api`, `@avc/web`, `@avc/shared-types`, `@avc/ui`, `@avc/db`).

## Gotchas (these bite)

- **Root `pnpm db:migrate` / `db:seed` work from the repo root** (they delegate to `@avc/api`; no more turbo filter on `@avc/db`). Note `docs/schema.sql` §8 no longer seeds anything — all seed data lives in `apps/api/src/db/seed.ts`.
- **Migration runner is CWD-sensitive**: `migrate.ts` reads `../../docs/schema.sql` relative to `process.cwd()`. Root scripts keep CWD at `apps/api` (never invoke `tsx src/db/migrate.ts` from the repo root directly).
- **`packages/shared-types` compiles to `dist/` and the API consumes `dist/`** (per its `main`/`exports`). After editing `packages/shared-types/src/**`, rebuild (`turbo build --filter=@avc/shared-types`) or the API keeps stale types. The web app is unaffected in dev (Vite aliases `@avc/*` to `src/`). Its `exports` map carries both `./api` and `./api.js` (etc.) because imports use `.js` suffixes that strict resolvers (vite/vitest) can't remap.
- `packages/ui` and `packages/db` have no build step — they're imported straight from `src/`.
- **Env comes from the single root `.env`** (copy `.env.example`). The API locates it by walking up from `apps/api/src/config`, then validates with Zod at boot: `JWT_SECRET` ≥ 32 chars, `DATABASE_URL`/`REDIS_URL` must be valid URLs or the API exits.
- Postgres container auto-applies `docs/schema.sql` when its volume starts empty — on an existing volume, only the migrate runner applies schema changes.
- Fill levels are a Postgres enum of strings `'0','25','50','75','100'` — never send arbitrary integers.
- **First Vitest suite exists** (`apps/api/src/__tests__/transportOrderDetail.test.ts`, integration-style against the local dev DB — needs `docker:up` + `pnpm db:seed` for seed data). Run it with `pnpm --filter @avc/api test`; it signs a JWT directly (never POSTs `/auth/login`, which is rate-limited). Seed fixtures it depends on: `admin@avc.local` user and one `in_progress` transport order.
- `apps/api/src/routes/sites.ts.bak` and `containers.ts.bak` are stale copies — edit the real files, never the `.bak` ones.
- **This directory is not a git repo** — no VCS, no branches/PRs; don't rely on git history or generate commit-based diffs.

### Frontend gotchas (these bit hard — 2026-10-21)

- **Nested route paths must be RELATIVE to their splat parent.** The role views are nested inside
  `<Route path="/manager/*" element={<ManagerRoutes/>} />`, and React Router strips the parent's
  pathBase before matching the child `<Routes>`. With absolute child paths (`path="/manager/containers"`)
  the URL `/manager/containers` is matched as `/containers` → **no route matches and the content area
  renders completely empty** (no error, no red screen — just the sidebar and a white/grey body).
  Use `path="containers"` + `<Route index …/>` for the section root, and a `path="*"` fallback so an
  unknown URL shows "Sidan hittades inte" instead of a blank page.
- **The service worker must only be registered in production** (`import.meta.env.PROD`): in dev `/sw.js`
  doesn't exist and a previously registered SW keeps serving the cached bundle — a browser cache clear
  does *not* unregister it, which leaves the dev app on a stale/blank page. `main.tsx` now unregisters
  any SW in dev on every load.
- **`@avc/ui` `createActionsColumn` accepts both icon *elements* (`<Eye />`) and icon *components*
  (`Eye`)** — lucide icons are `forwardRef` objects, so a `typeof icon === 'function'` check is not
  enough (renders the object as a child → "Objects are not valid as a React child" → the whole page
  crashes). `packages/ui/src/components/Table.tsx` has `isComponentType()` for this; use it for any
  new icon prop.
- The seed generates a real site-plan PNG for the main site
  (`apps/api/src/db/placeholderMap.ts` → `<UPLOAD_DIR>/maps/seed-<site-id>.png`). The map editor and the
  dashboard map need that file to exist; if you wipe `apps/api/uploads/`, re-run the seed or regenerate
  the file, otherwise the dashboard shows a broken image with markers on an empty strip.
- **Mobile: the sidebar must start closed** and the Layout always renders a mobile top bar with a
  hamburger button (`packages/ui/src/components/Layout.tsx`). The role views have no desktop header,
  so without that bar a phone could not open the menu at all — the sidebar covered the whole screen.
  Watch the horizontal overflow at 390 px: a non-wrapping flex row (legend + heading) widens the layout
  viewport beyond the screen.

### API gotchas

- **`selectAll()` with a join expands to every joined table.** It leaks the other table's columns
  (e.g. `email`/`password_hash` from `users`) and clobbers the base table's own `id`/`status`. Always
  write `selectAll('my_table')` and alias the joined columns.
- **Filter columns must be table-qualified when the query joins** — `where('status', …)` becomes
  ambiguous as soon as another joined table has a `status` column (`containers.status`).
- **Validate write bodies with the shared schemas.** An unvalidated body means an illegal enum value
  ("scheduled" as a maintenance status) becomes a Postgres error → **500** instead of a clean 400, and
  an unknown action in the order-execute endpoint silently "succeeds".
- **JSONB columns need a JSON string** for arrays: `pg` sends a JS array as a Postgres array literal
  (`invalid input syntax for type json`). Use `JSON.stringify(arr)` — a plain object is serialised as
  JSON by `pg`.
- **One container per parking spot** (DB rule `uq_containers_active_spot`): a dropoff must send one
  spot per container (`container_spots`), never a single `spot_id` for all of them.
- **Test files run in parallel against the same database** — each Vitest file must create its own
  fixtures (its own containers) and clean them up, or one file moves a container while another builds
  an order with it.

### Verifying the UI without a human

`scripts/cdp-*.mjs` (Chromium over the DevTools protocol — no Playwright package needed, the browser
binary lives in `~/.cache/ms-playwright/chromium-*`): render a route with a seeded session, assert the
`<main>` has content, capture console errors and take a screenshot. Every view in this app was
verified that way; the browser is the only way to catch the blank-page class of bugs.
Run `node scripts/cdp-routes.mjs` for the full route sweep (needs the API on :3000, the web dev server
on :5173 and a signed token in `/tmp/opencode/tokens.txt` — `scripts/sign-tokens.sh` writes them; they
expire after **15 minutes**).

### Phase 4 (cross-cutting) gotchas

- **The API is rate limited to 100 requests/minute.** A route sweep over all views exhausts it and the
  later pages show stale data (the `/auth/me` call gets a 429 → the app keeps the persisted user →
  "Ingen plats tilldelad"). Sign a fresh token and test the affected page in isolation when a sweep
  shows something odd.
- **`react-i18next` must be a single instance** for `@avc/ui` and `@avc/web` — otherwise the shared
  components do not see the app's bundles. Both packages depend on the same version and `.npmrc`
  hoists `react-i18next`/`i18next` to the workspace root (`public-hoist-pattern`).
- **The offline write path** (`packages/ui/src/lib/syncService.ts`): the client sends one **batch** to
  `POST /api/v1/sync` with the shared contract (snake_case). The entity types are mapped on the
  client (`damageReport` → `damage_report`) — the server rejects unknown types, and the mutation id
  must be a **UUID** (not the Dexie auto-increment key).
- **`navigator.serviceWorker.ready` never resolves in dev** (no service worker is registered there) —
  never `await` it without a timeout, or every write hangs.
- **The offline cold start needs the production build** (the service worker precaches the shell). The
  dev server deliberately has no service worker (it would serve stale modules and break HMR) —
  `pnpm --filter @avc/web preview` serves the built app with the same API proxy.
- `checkAuth` must call `/auth/me` even without a refresh token, otherwise the app keeps a stale user
  (a changed site or role would not be picked up).

## Architecture notes

- One SPA serving four role views under `apps/web/src/pages/`: `manager/`, `dashboard/`, `driver/`, `worker/` (role-based routing/guards using the `auth` store).
- Web dev server proxies `/api`, `/uploads`, `/ws` to `localhost:3000`; the axios client defaults to the relative base `/api/v1`.
- Auth: JWT access token from `localStorage` + refresh token flow (`/auth/refresh`); roles `admin`, `manager`, `driver`, `worker` map into the four views.
- Offline-first for Driver/Worker only: Dexie (IndexedDB) write-ahead + background/periodic sync against `apps/api/src/routes/sync.ts` (batch endpoint), **server-wins** conflict resolution — see `docs/adr/0002-offline-sync-protocol.md`. Don't add offline state without keeping server-wins semantics.
- Shared types first: domain types in `packages/shared-types/src/domain.ts`, API req/res schemas (Zod) in `api.ts`; API routes validate with Zod.
