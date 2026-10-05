/**
 * Independent PATCH-EDGE and LIST-FRAME interpretation, with a composed
 * SUBFORM fill path. Original patch maps, seed points, maximum steps and form
 * counts remain inputs. See research/introspection/subform-boundary.md.
 * Input checks are adapter policy, not original-runtime error parity.
 */
import { aaronMapIndex } from './aaron-maps.js';
import { setAaronMedianRows, chooseAaronFillStart, applyAaronFillStrategy } from './aaron-fill-preparation.js';
import { postFillAaronSubform } from './aaron-post-fill.js';

const xIncrements = Object.freeze([1, 1, 0, -1, -1, -1, 0, 1]);
const yIncrements = Object.freeze([0, 1, 1, 1, 0, -1, -1, -1]);
function integer(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

/**
 * Follow the first matching patch neighbor in the eight-direction search.
 * Prepend each found point, retaining the original start object at the tail.
 * After each step set start.z to two directions before the accepted direction.
 * Stop on returning to the origin after three steps or after the inclusive
 * maximum. A stranded search returns NIL. Neither map is modified.
 */
export function traceAaronPatchEdge({ maps, start, maximum, patchId }) {
  if (!maps || !(maps.patchMap instanceof Uint16Array) || !start) {
    throw new TypeError('maps.patchMap and a start point are required');
  }
  const { width, height, patchMap } = maps;
  integer(width, 'width', 1, Number.MAX_SAFE_INTEGER);
  integer(height, 'height', 1, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(width * height) || patchMap.length !== width * height) {
    throw new RangeError('patchMap storage must match its dimensions');
  }
  integer(start.x, 'start.x', 0, width - 1); integer(start.y, 'start.y', 0, height - 1);
  integer(start.z, 'start.z', 0, 7); integer(maximum, 'maximum', 0, Number.MAX_SAFE_INTEGER - 1);
  integer(patchId, 'patchId', 0, 65535);
  const forward = [start];
  let x = start.x, y = start.y;
  for (let steps = 0; steps <= maximum; steps += 1) {
    if (steps > 2 && x === start.x && y === start.y) break;
    let found = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const direction = (start.z + attempt) % 8;
      const nextX = x + xIncrements[direction], nextY = y + yIncrements[direction];
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height
          || patchMap[aaronMapIndex(width, height, nextX, nextY)] !== patchId) continue;
      forward.push({ x: nextX, y: nextY, z: direction });
      start.z = (direction + 6) % 8;
      x = nextX; y = nextY; found = true; break;
    }
    if (!found) return null;
  }
  return forward.reverse();
}

/** Reduce the outline to a newly created frame, flooring lows and ceiling highs. */
export function makeAaronListFrame(outline) {
  if (!Array.isArray(outline)) throw new TypeError('outline must be an array');
  const frame = { lx: 100000, rx: -100000, ly: 100000, ty: -100000 };
  for (const point of outline) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new TypeError('outline must contain finite point coordinates');
    }
    if (point.x < frame.lx) frame.lx = Math.floor(point.x);
    if (point.x > frame.rx) frame.rx = Math.ceil(point.x);
    if (point.y < frame.ly) frame.ly = Math.floor(point.y);
    if (point.y > frame.ty) frame.ty = Math.ceil(point.y);
  }
  return frame;
}

/**
 * Compose the measured outline/frame builders, preparation and SUBFORM
 * post-fill rule. Preserve the caller's existing maps as strategy input.
 * This covers a successful boundary walk, not the surrounding BRUSH-FILL
 * scan, iris/brush branches or scene generation.
 */
export function fillAaronSubformFromBoundary({ maps, start, maximum, patchId, flagBit, cformCount }) {
  const boundary = traceAaronPatchEdge({ maps, start, maximum, patchId });
  if (boundary === null) return null;
  const frame = makeAaronListFrame(boundary);
  const medians = setAaronMedianRows(frame);
  const chosen = chooseAaronFillStart(boundary);
  applyAaronFillStrategy({ maps, outline: chosen.outline, loMedian: medians.loMedian, hiMedian: medians.hiMedian });
  const counts = postFillAaronSubform({ maps, frame, patchId, flagBit, cformCount });
  return { boundary, outline: chosen.outline, frame, medians, rotationIndex: chosen.rotationIndex, ...counts };
}
