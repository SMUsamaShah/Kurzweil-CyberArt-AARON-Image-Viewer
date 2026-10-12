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
 * BRUSH-STROKE routine has been recovered. The original NIL and singleton
 * probes showed no map changes; snapshots cannot distinguish zero-value
 * stores from no stores. The two-point horizontal and vertical probes changed
 * the union of the translated CORE masks. This helper preserves that
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
 * Apply the older dependency-isolated BRUSH-STROKE boundary.
 *
 * The dependency-isolated nonempty probes call SCREEN-AND-STORE once with the
 * complete path and CDEX/SDEX, regardless of whether IN-SUB-FRAME accepts the
 * CORE cells. Accepted cells are written with the measured helper above. The
 * old isolated empty/singleton samples produced no screen call. The later
 * natural VALUE=0 capture differs; use the separate explicitly bounded
 * applyObservedNaturalBrushStrokeValue0 candidate for those observations.
 * This adapter does not model the downstream screen, fill, colour, or brush
 * state routines.
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

/**
 * Apply a bounded candidate for the three captured natural VALUE=0 samples.
 *
 * The 2026-10-12 capture places SCREEN-AND-STORE before the selected
 * IN-SUB-FRAME calls for its empty, singleton and nine-point paths. The
 * candidate applies zero to accepted CORE coordinates and returns the same
 * path object. The capture does not distinguish a zero store from no store
 * where the entry cell was already zero, and it does not validate other
 * brushes, path shapes, map layouts, or frame-boundary cases. This function
 * remains separate from applyMeasuredBrushStroke, whose older isolated-probe
 * contract has different empty/singleton screen behavior.
 */
export function applyObservedNaturalBrushStrokeValue0(
  maps,
  profile,
  path,
  {
    insideFrame = null,
    screenAndStore = null,
    cdex = 0,
    sdex = 0,
  } = {},
) {
  requireProfile(profile);
  requirePath(path);
  if (!maps || !maps.fillMap) throw new TypeError('maps must include fillMap');
  if (!Number.isSafeInteger(cdex) || !Number.isSafeInteger(sdex)) {
    throw new TypeError('CDEX and SDEX must be safe integers');
  }
  if (screenAndStore !== null && typeof screenAndStore !== 'function') {
    throw new TypeError('screenAndStore must be a function or null');
  }

  if (screenAndStore) screenAndStore(path, cdex, sdex);

  for (const [first, second] of path) {
    for (const [deltaFirst, deltaSecond] of profile.core) {
      const targetFirst = first + deltaFirst;
      const targetSecond = second + deltaSecond;
      if (insideFrame && !insideFrame(targetFirst, targetSecond)) continue;
      if (targetFirst < 0 || targetFirst >= maps.width
          || targetSecond < 0 || targetSecond >= maps.height) {
        continue;
      }
      writeAaronFillCell(maps, targetFirst, targetSecond, 0);
    }
  }

  return path;
}
