/**
 * Independent numeric NEIGHBORS / SCAN-ROW interpretation. PATCH-MAP remains
 * an input. An optional callback supplies the original FLASH-SPOT boundary;
 * its graphics effects are not reconstructed here. Adapter checks do not
 * reproduce the archived runtime's errors for unsupported inputs.
 */
import { fillAaronSubformFromBoundary } from './aaron-subform-boundary.js';

const offsets = Object.freeze([[0, -1], [-1, -1], [1, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [0, 1]]);
function integer(value, name, low, high) {
  if (!Number.isSafeInteger(value) || value < low || value > high) {
    throw new RangeError(`${name} must be an integer from ${low} through ${high}`);
  }
}
function mapShape(maps) {
  if (!maps || !(maps.patchMap instanceof Uint16Array)) throw new TypeError('A typed patch map is required');
  integer(maps.width, 'width', 1, Number.MAX_SAFE_INTEGER);
  integer(maps.height, 'height', 1, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(maps.width * maps.height) || maps.patchMap.length !== maps.width * maps.height) {
    throw new RangeError('Patch map storage must match dimensions');
  }
}
function neighbors(maps, x, y, patchId) {
  let count = 0;
  for (const [dx, dy] of offsets) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < maps.width && ny >= 0 && ny < maps.height
        && maps.patchMap[nx * maps.height + ny] === patchId) {
      count += 1;
      if (count === 3) return count;
    }
  }
  return count;
}

/** Count in-picture matching neighbors, stopping at three; exclude the center. */
export function countAaronPatchNeighbors({ maps, x, y, patchId }) {
  mapShape(maps);
  integer(x, 'x', 0, maps.width - 1); integer(y, 'y', 0, maps.height - 1);
  integer(patchId, 'patchId', 0, 65535);
  return neighbors(maps, x, y, patchId);
}

/**
 * Scan [lx, rx) for the first matching cell with at least three matching
 * neighbors. Return {x,y,z:4}, or NIL. Y=-1 is measured returning NIL before
 * FLASH-SPOT; more-negative Y follows the native sign-guard interpretation.
 * For nonnegative Y the callback runs even for an empty range.
 */
export function scanAaronPatchRow({ maps, lx, rx, y, patchId, flashSpot }) {
  mapShape(maps);
  integer(lx, 'lx', 0, maps.width); integer(rx, 'rx', 0, maps.width);
  integer(y, 'y', Number.MIN_SAFE_INTEGER, maps.height - 1); integer(patchId, 'patchId', 0, 65535);
  if (flashSpot !== undefined && typeof flashSpot !== 'function') throw new TypeError('flashSpot must be a function');
  if (y < 0) return null;
  if (flashSpot) flashSpot();
  for (let x = lx; x < rx; x += 1) {
    if (maps.patchMap[x * maps.height + y] === patchId && neighbors(maps, x, y, patchId) > 2) {
      return { x, y, z: 4 };
    }
  }
  return null;
}

/** Compose one successful row seed with boundary construction and SUBFORM fill. */
export function fillAaronSubformFromRow({ maps, lx, rx, y, patchId, maximum, flagBit, cformCount, flashSpot }) {
  const start = scanAaronPatchRow({ maps, lx, rx, y, patchId, flashSpot });
  if (start === null) return null;
  const seedStart = { ...start };
  const result = fillAaronSubformFromBoundary({ maps, start, maximum, patchId, flagBit, cformCount });
  return result === null ? null : { seedStart, start, ...result };
}
