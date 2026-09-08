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
export function applyMeasuredBrushVertices(maps, profile, path, value, {
  insideFrame = null,
} = {}) {
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
      if (insideFrame && !insideFrame(targetFirst, targetSecond)) continue;
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

/**
 * Apply the measured dependency-isolated BRUSH-STROKE boundary.
 *
 * For the captured nonempty paths, the original calls SCREEN-AND-STORE once
 * with the complete path and CDEX/SDEX, regardless of whether the
 * IN-SUB-FRAME predicate accepts the core-mask cells. Accepted cells are
 * written to FILL-MAP using the measured helper above. Empty and singleton
 * paths produce neither a screen call nor map writes in the retained cases.
 * This adapter deliberately does not model the unresolved downstream screen,
 * fill, colour, or brush-state routines.
 */
export function applyMeasuredBrushStroke(
  maps,
  profile,
  path,
  value,
  {
    insideFrame = null,
    screenAndStore = null,
    cdex = 0,
    sdex = 0,
  } = {},
) {
  requireProfile(profile);
  requirePath(path);
  if (!Number.isSafeInteger(cdex) || !Number.isSafeInteger(sdex)) {
    throw new TypeError('CDEX and SDEX must be safe integers');
  }
  if (screenAndStore !== null && typeof screenAndStore !== 'function') {
    throw new TypeError('screenAndStore must be a function or null');
  }
  const touched = applyMeasuredBrushVertices(maps, profile, path, value, {
    insideFrame,
  });
  if (path.length < 2) {
    return Object.freeze({ touched, screenCalls: 0 });
  }
  if (screenAndStore) screenAndStore(path, cdex, sdex);
  return Object.freeze({
    touched,
    screenCalls: screenAndStore ? 1 : 0,
  });
}
