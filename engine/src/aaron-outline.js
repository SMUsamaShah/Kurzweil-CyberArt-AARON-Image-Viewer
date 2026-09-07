import { aaronFreePath } from './aaron-point-geometry.js';

function requirePolygon(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 2) {
    throw new TypeError('outline polygon requires at least two points');
  }
  for (const point of polygon) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
      throw new TypeError('outline polygon points must be finite [x, y] pairs');
    }
  }
}

/**
 * Apply the measured FREE-PATH subset to one generated outline.
 *
 * The caller policy is intentionally explicit and provisional: every input
 * edge is visible, coordinates use single precision, and the closed polygon
 * is emitted as a cyclic path.  This connects an oracle-calibrated primitive
 * to the clean-room generator without claiming that every AARON polygon uses
 * this exact caller setup.
 */
export function createFreePathOutline(polygon, random, { precision = 'single' } = {}) {
  requirePolygon(polygon);
  const visiblePoints = polygon.map(([x, y]) => [Math.fround(x), Math.fround(y), 1]);
  const path = aaronFreePath(visiblePoints, random, { precision });
  return Object.freeze(path.map(([x, y]) => Object.freeze([x, y])));
}

