// Map coordinate conversions shared by the map editor canvases.
//
// All persisted map coordinates are percentages of the map image (0-100),
// matching the DB columns (`position_x`/`position_y` DECIMAL(6,2) — "percentage
// on map image (0-100)") and the dashboard overlays that position markers with
// `left: x% / top: y%`. The editor canvases draw on a stretched canvas, so a
// click at k% of the canvas is at k% of the image — converting at the canvas
// boundary keeps save/reload/dashboard rendering in the same space.

/** Percent (0-100) -> canvas world pixels. */
export const pctToPx = (v: number, sizePx: number): number => (v / 100) * sizePx;

/** Canvas world pixels -> percent (0-100). */
export const pxToPct = (v: number, sizePx: number): number => (v / sizePx) * 100;

/** Canvas world pixels -> clamped {x, y} percentages. */
export const worldToPct = (
  worldX: number,
  worldY: number,
  widthPx: number,
  heightPx: number
): { x: number; y: number } => ({
  x: Math.max(0, Math.min(100, pxToPct(worldX, widthPx))),
  y: Math.max(0, Math.min(100, pxToPct(worldY, heightPx))),
});
