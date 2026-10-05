/**
 * Independent fill preparation from SET-MEDIANS, GOOD-START and FILL-STRATEGY.
 * The oracle supplies integer outline points, a frame and the initial fill map.
 * Both controlled paintings match all 427 calls per function and 1,883,204
 * output cell comparisons summed over captured regions for each call.
 * See research/introspection/fill-preparation.md.
 * Creating those inputs and the surrounding scene remains separate work.
 * Input checks below are JavaScript adapter policy, not original error parity.
 */
import { aaronMapIndex } from './aaron-maps.js';

function integer(value, name, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function points(outline) {
  if (!Array.isArray(outline)) throw new TypeError('outline must be an array of points');
  for (const point of outline) {
    if (!point || typeof point !== 'object') throw new TypeError('outline must contain points');
    integer(point.x, 'point.x'); integer(point.y, 'point.y');
  }
  return outline;
}

/** Round the midpoint to the nearest integer, with half ties to even; return its successor. */
export function setAaronMedianRows(frame) {
  if (!frame) throw new TypeError('frame must contain ly and ty');
  const ly = integer(frame.ly, 'ly'), ty = integer(frame.ty, 'ty');
  const sum = integer(ly + ty, 'ly + ty');
  const lower = Math.floor(sum / 2);
  const loMedian = sum % 2 === 0 || lower % 2 === 0 ? lower : lower + 1;
  const hiMedian = integer(loMedian + 1, 'hiMedian');
  return { loMedian, hiMedian, returnValue: hiMedian };
}

/**
 * Starting at index 1, find three cyclic neighbors with distinct X values and
 * equal X steps. Rotate the array at the middle point, retaining point objects.
 * If no position qualifies, return NIL and retain the original outline object.
 */
export function chooseAaronFillStart(outline) {
  points(outline);
  if (outline.length > 7) {
    for (let i = 1; i < outline.length; i += 1) {
      const a = outline[i - 1].x, b = outline[i].x, c = outline[(i + 1) % outline.length].x;
      if (a !== b && a !== c && b !== c && c - b === b - a) {
        const rotated = outline.slice(i).concat(outline.slice(0, i));
        return { outline: rotated, returnValue: rotated, rotationIndex: i };
      }
    }
  }
  return { outline, returnValue: null, rotationIndex: null };
}

/**
 * Walk the cyclic outline. At repeated horizontal directions, scan from the
 * point's adjacent row toward the relevant median, including that median row.
 * Toggle bit 0 of each visited cell except value 2. Return NIL.
 */
export function applyAaronFillStrategy({ maps, outline, loMedian, hiMedian }) {
  points(outline);
  if (outline.length < 2) throw new RangeError('fill strategy requires at least two points');
  if (!maps || !(maps.fillMap instanceof Uint8Array)) {
    throw new TypeError('maps must contain fillMap storage');
  }
  const { width, height, fillMap } = maps;
  integer(width, 'width', 1); integer(height, 'height', 1);
  if (!Number.isSafeInteger(width * height) || fillMap.length !== width * height) {
    throw new RangeError('fillMap storage must match its dimensions');
  }
  integer(loMedian, 'loMedian', 0, height - 1);
  integer(hiMedian, 'hiMedian', 0, height);
  for (const point of outline) {
    integer(point.x, 'point.x', 0, width - 1);
    integer(point.y, 'point.y', 0, height - 1);
  }
  for (const value of fillMap) {
    if (value > 15) throw new RangeError('fillMap values must fit four bits');
  }
  let previousDirection = Math.sign(outline[1].x - outline[0].x);
  for (let i = 0; i < outline.length; i += 1) {
    const point = outline[i], next = outline[(i + 1) % outline.length];
    if (next.x === point.x) continue;
    const direction = Math.sign(next.x - point.x);
    if (direction === previousDirection) {
      if (point.y > hiMedian) {
        for (let y = point.y - 1; y >= hiMedian; y -= 1) {
          const index = aaronMapIndex(width, height, point.x, y);
          if (fillMap[index] !== 2) fillMap[index] ^= 1;
        }
      } else {
        for (let y = point.y + 1; y <= loMedian; y += 1) {
          const index = aaronMapIndex(width, height, point.x, y);
          if (fillMap[index] !== 2) fillMap[index] ^= 1;
        }
      }
    }
    previousDirection = direction;
  }
  return null;
}
