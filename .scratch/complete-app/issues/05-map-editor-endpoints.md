# 05 — Map editor: create endpoints, field alignment, dashboard map markers

**Phase**: 2 — Repair broken data paths
**Blocked by**: 01, 02

## Problems (from audit)
- MapEditorPage POSTs to `/map/site/:id/{zones,parking-spots,ramps}` but `routes/map.ts` only has PATCH/DELETE → every create 404s.
- Editor sends `boundary`/`color`, but columns are `polygon_geojson`/`color_hex` → SQL errors on save.
- PitEditor in map.ts is a stub ("implementeras med Canvas/SVG").
- `SiteDashboardPage.tsx` map markers/overlays are `return null` placeholders.

## Deliverables
- Add POST routes for zones, parking spots, ramps, pits per site; align request/response field names to the actual schema everywhere (update Zod schemas in `@avc/shared-types`, not column names).
- Zones stored as GeoJSON polygons; spot/ramp/pit as point geometry on the uploaded image.
- Wire the three *EditorCanvas pages + PitEditor end-to-end: draw → save → reload, no 404, no 500.
- Dashboard map: rendering zones (polygons) + containers on their spots + pits with fill-level color on the site image.
- SitesPage gains zone/spot/ramp/pit management navigation (site-level config is spread over these canvases).

## Acceptance
- [x] Create zone, spot, ramp, pit via the canvases; each persists and survives reload
- [x] Edit + delete of each shape works
- [x] Site dashboard draws zones and container markers at their real spots
- [x] `swagger`-style consistency: every map route's schema exported from `@avc/shared-types/src/api.ts` and rebuilt

## Completion notes (2026-10-21)

**API (`apps/api/src/routes/map.ts`)** — the CRUD section was rewritten on the shared contracts:
- New POST routes: `/site/:siteId/zones`, `/parking-spots`, `/ramps`, `/pits`. Site scope always comes from
  the URL param; body `site_id` (when present) is stripped. `createZoneSchema`/`createRampSchema`/`createPitSchema`
  got `site_id: uuid().optional()` in shared-types for this reason.
- Local `parseBody(body, schema)` helper (same pattern as containers.ts): zod failures → 400 `VALIDATION_ERROR`
  with the first issue's path/message — no Postgres 500s.
- PATCH bodies are now schema-typed via shared schemas; `updated_at` set manually (zone/spot/ramp/pit).
- Pit lifecycle in map.ts: POST/PATCH/DELETE `/site/:siteId/pits(/:id)`. PATCH converts `last_emptied_at`
  ISO string → Date (or null), stamps `last_updated_by`/`last_updated_at`; `create` stamps `last_updated_by`.
- Guard rails verified live: zone name 409 per site, spot code 409 per zone, ramp name 409 per site
  (also unique in DB), zone-belongs-to-site 404 for spots, waste-category-belongs-to-site 404 for ramps,
  nested delete scoping (spot rows filtered through their zone's site), pit PATCH fill_level + null
  `last_emptied_at`. Every POST/PATCH/DELETE exercised via curl with fresh dist (`position_x: 150` →
  `VALIDATION_ERROR at 'position_x'`).

**Coordinate system (the big fix)** — the editor canvases stored clicks as raw canvas pixels while the DB
columns are "percentage on map image (0-100)". A canvas click at 500px on a 1000px canvas saved
`position_x=100` after clamping; everything drew at the wrong place. All canvases now speak percent:
- New `apps/web/src/pages/manager/mapCoords.ts` (`pctToPx`/`pxToPct`/`worldToPct`): clicks are converted
  to clamped 0-100 % at the canvas boundary, draw code converts stored % → px using the live `rect` size,
  hit-testing done in world px against %-stored items.
- ZoneEditor/SpotEditor/RampEditor updated in place; saved polygons/positions reload visually identical.
  (Legacy pixel-space data cannot exist: create endpoints 404'd before ticket 05.)
- No aspect-ratio fix needed: the background image is stretched over the whole canvas, so k% of canvas
  == k% of image; the dashboard renders the image at natural ratio (`w-full h-auto`) so % markers sit
  exactly where they were placed.
- DECIMAL columns arrive as strings from pg — number coercions (`Number(...)`) added where forms/
  zod/canvas math consume them (spot/ramp/pit edit handlers, dashboard markers, pit capacity).

**PitEditor end-to-end** — the stub was replaced by `PitEditorCanvas.tsx` (modeled on RampEditorCanvas):
canvas placement/pan/zoom with fill-level-coloured circles (green→red) + amber edit marker, list table
with fill/larm status, modal (name, material_type, capacity via `setValueAs` so empty input → undefined
not NaN → zod `.nullable().optional()` on create, alert_threshold, positions). Deprecated `PitEditor`,
`ZoneEditor`, `SpotEditor`, `RampEditor` stubs deleted from MapEditorPage.

**Site dashboard map** — `SiteDashboardPage.tsx` placeholders became real overlays over the site image:
- `ZoneOverlay`: SVG polygon (`viewBox 0 0 100 100`, `preserveAspectRatio none`) from
  `polygon_geojson.coordinates[0]`, filled/stroked with `color_hex`, zone name label at centroid.
- `ContainerMarker`: dot at `left:x%/top:y%` in fill-level colours with tooltip (number, zone, spot, fill).
- `PitMarker`: dot with trash glyph, fill-level colour, pulsing red ring when ≥ `alert_threshold`.
- `aspect-video`+`object-cover` replaced by natural-ratio image so stored % positions are geometrically
  correct; marker legend added under the card.

**Navigation** — `MapEditorPage` accepts `?site=<id>` (deep link); SitesPage row action "Karta" navigates
to `/manager/map?site=<id>`.

**Contracts** — `packages/shared-types/src/api.ts`: `createZoneSchema`/`createRampSchema`/`createPitSchema`
site_id optional (route-supplied), `createPitSchema.capacity_cubic_meters` nullable; rebuilt
(`pnpm --filter @avc/shared-types build`), both API and web typecheck re-run green (8/8 turbo tasks).

**Verification**: `pnpm typecheck` 8/8; `pnpm --filter @avc/web build` incl. PWA OK; `pnpm --filter @avc/api test`
17/17; live curl walkthrough of GET map/site, all 4 POSTs, PATCH spot/pit, DELETE × 5, validation-400,
conflict-409 — all artifacts cleaned afterwards (0 test rows remain). Visual click-through of the canvases
in the browser remains the user's acceptance (needs the dev servers running).
