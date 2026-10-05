/** Measured feature buffer kernel. Plan/form/EDGE selection remains an input. */
import { aaronMapIndex } from './aaron-maps.js';
import { isPointInAaronSubFrame } from './aaron-boundary-brush.js';

const integer = (value, label) => {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer`);
  return value;
};
function storage(maps, boundaryValue) {
  if (boundaryValue !== 3) throw new RangeError('This buffer model is restricted to boundary value 3');
  if (!maps || !(maps.fillMap instanceof Uint8Array)) throw new TypeError('Typed fill-map storage is required');
  integer(maps.width, 'width'); integer(maps.height, 'height');
  if (maps.width <= 0 || maps.height <= 0 || !Number.isSafeInteger(maps.width * maps.height)
      || maps.fillMap.length !== maps.width * maps.height) throw new RangeError('Map dimensions differ from storage');
  for (const value of maps.fillMap) if (value > 15) throw new RangeError('Fill values must fit four bits');
}
function pointCoordinates(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new TypeError(`${label} must provide finite X/Y coordinates`);
}
function maskOffsets(offsets) {
  if (!Array.isArray(offsets)) throw new TypeError('An ordered brush mask is required');
  for (const offset of offsets) {
    if (!Array.isArray(offset) || offset.length !== 2) throw new TypeError('Offsets must be integer pairs');
    integer(offset[0], 'offset x'); integer(offset[1], 'offset y');
  }
  return offsets;
}
function rounded(value) {
  if (!Number.isFinite(value)) throw new RangeError('Translated coordinate must be finite');
  const lower = Math.floor(value), fraction = value - lower;
  return integer(fraction < 0.5 || (fraction === 0.5 && lower % 2 === 0) ? lower : lower + 1,
    'rounded coordinate');
}
function numericSum(value, offset, precision) {
  if (precision === 'integer') integer(value, 'integer coordinate');
  const sum = value + offset;
  if (precision === 'double' || precision === 'integer') return sum;
  throw new RangeError('Measured coordinate precision must be integer or double');
}
function collector(maps) {
  const candidates = [], touched = new Set(), changed = new Set();
  return {
    candidates, touched, changed,
    candidate(x, y, accepted) {
      candidates.push({ x, y, accepted });
      if (!accepted) return;
      const index = aaronMapIndex(maps.width, maps.height, x, y);
      touched.add(index);
      if (maps.fillMap[index] !== 3) changed.add(index);
      maps.fillMap[index] = 3;
    },
    result(maskName) {
      const accepted = candidates.reduce((n, candidate) => n + Number(candidate.accepted), 0);
      return { returnValue: null, maskName, candidates, predicateCalls: candidates.length, accepted,
        rejected: candidates.length - accepted, touched: [...touched].sort((a, b) => a - b),
        changed: [...changed].sort((a, b) => a - b) };
    },
  };
}

/** Direct feature EDGE input, CORE mask, inclusive SUB-FRAME and coordinate ROUND. */
export function markAaronFeatureBuffer({ maps, profile, edge, frame, boundaryValue = 3 }) {
  storage(maps, boundaryValue);
  if (!Array.isArray(edge)) throw new TypeError('An ordered feature edge is required');
  const offsets = maskOffsets(profile?.core), collect = collector(maps);
  for (const point of edge) {
    pointCoordinates(point, 'feature point');
    for (const [dx, dy] of offsets) {
      const x = rounded(numericSum(point.x, dx, point.xPrecision ?? 'integer'));
      const y = rounded(numericSum(point.y, dy, point.yPrecision ?? 'integer'));
      collect.candidate(x, y, isPointInAaronSubFrame(x, y, frame));
    }
  }
  return collect.result('core');
}
