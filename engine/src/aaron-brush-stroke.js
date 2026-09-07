import { aaronMapIndex, writeAaronFillCell } from './aaron-maps.js';

function requirePath(path) {
  if (!Array.isArray(path)) throw new TypeError('brush path must be an array');
  for (const point of path) {
    if (!Array.isArray(point) || point.length !== 2
        || !Number.isSafeInteger(point[0])
        || !Number.isSafeInteger(point[1])) {
      throw new TypeError('brush path points must be [first, second] integer pairs');
    }
  }
  return path;
}

function requireProfile(profile) {
  if (!profile || !Array.isArray(profile.core)) {
    throw new TypeError('brush profile must expose a core mask');
  }
  return profile;
}

/**
 * Apply the measured core-mask behavior observed for a nonempty path.
 *
 * This is deliberately a small clean-room layer, not a claim that the whole
 * BRUSH-STROKE routine has been recovered.  The original NIL and singleton
 * probes wrote no cells; the two-point horizontal and vertical probes wrote
 * the union of the translated CORE masks.  This helper preserves that
 * observed boundary and uses the measured map index convention. Out-of-map
 * offsets are currently skipped as a provisional clean-room policy. The
 * private edge experiment (run 34074489559) forced IN-SUB-FRAME true and
 * instead observed a SIMPLE-ERROR after one partial fill write; that is an
 * unchecked boundary-write result, not enough evidence to claim a general
 * clipping rule for integrated callers.
 */
export function applyMeasuredBrushVertices(maps, profile, path, value) {
  requireProfile(profile);
  requirePath(path);
  if (!maps || !maps.fillMap) throw new TypeError('maps must include fillMap');
  if (!Number.isSafeInteger(value) || value < 0 || value > 15) {
    throw new RangeError('fill-map value must be an integer from 0 through 15');
  }
  if (path.length < 2) return Object.freeze([]);

  const touched = new Set();
  for (const [first, second] of path) {
    for (const [deltaFirst, deltaSecond] of profile.core) {
      const targetFirst = first + deltaFirst;
      const targetSecond = second + deltaSecond;
      if (targetFirst < 0 || targetFirst >= maps.width
          || targetSecond < 0 || targetSecond >= maps.height) {
        continue;
      }
      const index = aaronMapIndex(
        maps.width, maps.height, targetFirst, targetSecond,
      );
      writeAaronFillCell(maps, targetFirst, targetSecond, value);
      touched.add(index);
    }
  }
  return Object.freeze([...touched].sort((left, right) => left - right));
}
