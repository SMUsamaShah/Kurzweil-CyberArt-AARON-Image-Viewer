/**
 * Independent boundary-map helpers from exact native payloads and natural
 * before/after observations. See research/introspection/boundary-map.md.
 * The caller supplies the selected frame or complete ordered point list.
 * Creating those inputs and resolving CDEX/SDEX remain separate work.
 * Validation is JavaScript adapter policy, not original error parity.
 */
import { aaronMapIndex } from './aaron-maps.js';

function integer(value, name, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} through ${max}`);
  }
  return value;
}
function storage(maps) {
  if (!maps || !(maps.fillMap instanceof Uint8Array)) throw new TypeError('maps must contain fillMap storage');
  integer(maps.width, 'width', 1); integer(maps.height, 'height', 1);
  if (!Number.isSafeInteger(maps.width * maps.height) || maps.fillMap.length !== maps.width * maps.height) {
    throw new RangeError('fillMap storage must match its dimensions');
  }
  for (const value of maps.fillMap) if (value > 15) throw new RangeError('fillMap values must fit four bits');
  return maps;
}

/** Zero the inclusive frame rectangle in place and return NIL. */
export function clearAaronFillMap({ maps, frame }) {
  storage(maps);
  if (!frame) throw new TypeError('frame must contain lx, rx, ly and ty');
  const lx = integer(frame.lx, 'lx', 0, maps.width - 1), rx = integer(frame.rx, 'rx', 0, maps.width - 1);
  const ly = integer(frame.ly, 'ly', 0, maps.height - 1), ty = integer(frame.ty, 'ty', 0, maps.height - 1);
  for (let x = lx; x <= rx; x += 1) {
    for (let y = ly; y <= ty; y += 1) maps.fillMap[aaronMapIndex(maps.width, maps.height, x, y)] = 0;
  }
  return null;
}

/** Assign value at each in-bounds point, retaining the list and point objects; return NIL. */
export function writeAaronListToFillMap({ maps, points, value }) {
  storage(maps); integer(value, 'value', 0, 15);
  if (!Array.isArray(points)) throw new TypeError('points must be an array');
  for (const point of points) {
    if (!point || typeof point !== 'object') throw new TypeError('points must contain point objects');
    const x = integer(point.x, 'point.x');
    if (x < 0 || x >= maps.width) continue;
    const y = integer(point.y, 'point.y');
    if (y < 0 || y >= maps.height) continue;
    maps.fillMap[aaronMapIndex(maps.width, maps.height, x, y)] = value;
  }
  return null;
}
