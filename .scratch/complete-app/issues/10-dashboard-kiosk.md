# 10 — Dashboard: kiosk mode + filled-in site map

**Phase**: 3 — Complete the four views
**Blocked by**: 03, 05 (map markers depend on map editor being real)

## Deliverables
- Kiosk mode: fullscreen layout route/parameter for the site dashboard — large glanceable cards, no navigation chrome, hide-sensitive actions; auto-refresh retained (30s exists).
- Map fills in per ticket 05: zone polygons, containers w/ color-coded fill level at their spots, pits colored by fill level.
- Mobile-supervisor variant usable with touch (already responsive; verify).
- Any dashboard-only endpoints it needs exist (30s polling is fine until ticket 12 adds WS events).

## Acceptance
- [x] Dashboard URL in kiosk mode fills a TV screen without scrollbars/controls; refreshes itself
- [x] Zones, containers, pits are drawn at true positions with correct fill colors (0=grey…, 75=orange, 100=red conventions consistent with `FillLevelIndicator`)
- [x] Both forms reachable by role: manager/admin on desktop, kiosk TV route, supervisor mobile

## Completion notes (2026-10-21)

**Kiosk mode** — `/dashboard/:siteId?kiosk=1` renders the dashboard **without any app chrome**:
`DashboardRoutes` reads the query param and skips the `Layout` (no sidebar, no buttons), and the page
switches to a fullscreen layout:
- `fixed inset-0` over the whole screen, dark background, **no scrollbars** (verified: document height
  == viewport height at 1920×1080), `overflow-hidden`.
- A header with the site name, the date and the time, plus a single small fullscreen toggle.
- Six **large, glanceable tiles** (containers, 100 %, 75 %, 50 %, 25 %, pits to empty) with the alert
  tiles highlighted in red.
- The map (2/3 of the width) and the pit list (1/3) fill the rest of the screen.
- Still auto-refreshes every 30 s (the query interval was already there).
- A "Kiosk" button in the normal dashboard header opens the kiosk URL in a new tab.

**The map is now really filled in** (ticket 05 built the pieces, ticket 10 makes them land correctly):
- **Zones**: the GeoJSON polygons drawn as SVG over the image, filled/stroked with `color_hex` and the
  zone name at the centroid.
- **Containers**: a dot per container at its real position, coloured by fill level (grey 0 %, green
  25 %, yellow 50 %, orange 75 %, red 100 %) with a tooltip (number, zone, spot, fill).
- **Pits**: a dot with a trash glyph, coloured by fill level, pulsing red when it is at/over its alert
  threshold.
- **Alignment fix**: the overlay is now positioned on the *rendered* image box (the wrapper shrink-wraps
  the image) — before, the polygons were drawn on the container while the image was letterboxed, so
  they did not line up.
- The **seed now generates a zone polygon per zone** (derived from the zone's parking spots), so the
  map shows real zones out of the box instead of empty outlines.

**Mobile supervisor variant** — verified in a real phone viewport (390×844):
- **Fixed: the sidebar covered the whole screen on a phone.** `Layout` opened the sidebar by default
  (`defaultSidebarOpen = true`) and the role views have no header, so there was no menu button at all —
  the content was unreachable on mobile. The sidebar now starts closed on small screens, and the Layout
  always renders a **mobile top bar** with a hamburger button (the desktop header is `hidden lg:block`).
- **Fixed: horizontal overflow** (the layout viewport expanded to 463 px): the dashboard header
  (title + site select + buttons) now stacks on small screens, the fill-level legend wraps, and the
  sync badge hides its "(N pending)" counter on phones. The page now measures exactly 390 px wide.

**Shared UI** (`packages/ui`): `Layout` (mobile top bar + collapsible sidebar),
`SyncStatusIndicator` (compact on phones).

**Verification** (headless Chromium, real rendering): kiosk at 1920×1080 → no sidebar, no scrollbars,
6 stat tiles, 4 zone polygons, 10 markers, the pit list; mobile at 390×844 → no overflow, menu button
present, everything readable; the normal dashboard unchanged. No console errors on any view.
Suites: API 42/42, web 3/3, `pnpm typecheck` 8/8, web build OK.
