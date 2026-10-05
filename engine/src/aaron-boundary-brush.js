/** Boundary-marker branch of BRUSH-STROKE; original path/profile/frame are inputs. */
import { aaronMapIndex } from './aaron-maps.js';

const integer = (value, name) => {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${name} must be a safe integer`);
  return value;
};
function requireFrame(frame) {
  if (!frame) throw new TypeError('A SUB-FRAME is required');
  for (const name of ['lx', 'rx', 'ly', 'ty']) integer(frame[name], name);
  return frame;
}
export function isPointInAaronSubFrame(x, y, frame) {
  integer(x, 'x'); integer(y, 'y'); requireFrame(frame);
  return frame.lx <= x && x <= frame.rx && frame.ly <= y && y <= frame.ty;
}
/** Native mask-branch model; natural boundary comparisons cover PERIM only. */
export function selectAaronBrushMask(pathLength, profile) {
  integer(pathLength, 'pathLength');
  if (pathLength < 0 || !profile || integer(profile.width, 'brush width') < 0
      || !Array.isArray(profile.core) || !Array.isArray(profile.perim))
    throw new TypeError('A nonnegative path length and complete brush profile are required');
  const threshold = integer(3 * profile.width, 'mask threshold');
  const name = pathLength > threshold ? 'perim' : 'core';
  for (const offset of profile[name]) {
    if (!Array.isArray(offset) || offset.length !== 2) throw new TypeError('Mask offsets must be integer pairs');
    integer(offset[0], 'mask x'); integer(offset[1], 'mask y');
  }
  return { name, offsets: profile[name] };
}

/**
 * VALUE=BOUNDARY-VALUE=3: no screen call; returnValue preserves path identity.
 * Natural comparisons cover long nonempty paths. Short/empty boundary paths
 * and original malformed-input errors remain uncharacterized.
 */
export function markAaronBoundaryBrush({ maps, profile, path, frame, value = 3, boundaryValue = 3 }) {
  if (value !== 3 || boundaryValue !== 3) throw new RangeError('The measured boundary-marker domain is value 3');
  if (!maps || !(maps.fillMap instanceof Uint8Array) || !Array.isArray(path))
    throw new TypeError('Typed fill-map storage and an ordered path are required');
  integer(maps.width, 'width'); integer(maps.height, 'height');
  if (maps.width <= 0 || maps.height <= 0 || !Number.isSafeInteger(maps.width * maps.height)
      || maps.fillMap.length !== maps.width * maps.height) throw new RangeError('Map dimensions differ from storage');
  for (const value of maps.fillMap) if (value > 15) throw new RangeError('fillMap values must fit four bits');
  requireFrame(frame);
  for (const point of path) {
    if (!point) throw new TypeError('Path points must provide integer coordinates');
    integer(point.x, 'point x'); integer(point.y, 'point y');
  }
  const mask = selectAaronBrushMask(path.length, profile), touched = new Set(), changed = new Set();
  let accepted = 0, rejected = 0;
  for (const point of path) for (const [dx, dy] of mask.offsets) {
    const x = integer(point.x + dx, 'translated x'), y = integer(point.y + dy, 'translated y');
    if (!(frame.lx <= x && x <= frame.rx && frame.ly <= y && y <= frame.ty)) { rejected++; continue; }
    // No implicit picture clipping. Invalid accepted coordinates use adapter
    // errors; original malformed-input/partial-write behavior is outside scope.
    const index = aaronMapIndex(maps.width, maps.height, x, y);
    accepted++; touched.add(index);
    if (maps.fillMap[index] !== value) changed.add(index);
    maps.fillMap[index] = value;
  }
  return { returnValue: path, maskName: mask.name, predicateCalls: accepted + rejected,
    accepted, rejected, screenCalls: 0, touched: [...touched].sort((a,b) => a-b), changed: [...changed].sort((a,b) => a-b) };
}
