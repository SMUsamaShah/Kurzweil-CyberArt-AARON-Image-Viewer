/**
 * Clean-room representation of the maps allocated by the original
 * INIT-MAPS routine.
 *
 * Measured behavior (run 34069679558): for dimensions (width height), the
 * original creates two independent, fresh, zero-filled rank-2 arrays. The
 * patch map has element type (UNSIGNED-BYTE 16); the fill map has element type
 * (UNSIGNED-BYTE 4). JavaScript has no four-bit typed array, so Uint8Array is
 * used for the fill storage and callers must keep its values in 0..15 until
 * WRITE-LIST-TO-FILL-MAP is recovered.
 *
 * This module intentionally does not claim the original coordinate-to-index
 * convention or implement CLEAR-FILL-MAP/WRITE-LIST-TO-FILL-MAP.
 */

function positiveDimension(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

/** Allocate fresh measured PATCH-MAP and FILL-MAP storage. */
export function createAaronMaps(width, height) {
  const mapWidth = positiveDimension(width, 'width');
  const mapHeight = positiveDimension(height, 'height');
  const size = mapWidth * mapHeight;
  if (!Number.isSafeInteger(size)) throw new RangeError('map size is too large');

  return Object.freeze({
    width: mapWidth,
    height: mapHeight,
    patchMap: new Uint16Array(size),
    fillMap: new Uint8Array(size),
  });
}

/** The original call replaces both map objects rather than reusing them. */
export function initializeAaronMaps(width, height) {
  return createAaronMaps(width, height);
}

/**
 * Convert the two measured map coordinates to Allegro's rank-2 row-major
 * offset.  The original arrays are dimensioned `(width height)` and the
 * brush probes establish `first * height + second` for the tested writes.
 * Coordinate names stay neutral because broader callers are not measured.
 */
export function aaronMapIndex(width, height, first, second) {
  const mapWidth = positiveDimension(width, 'width');
  const mapHeight = positiveDimension(height, 'height');
  if (!Number.isSafeInteger(first) || first < 0 || first >= mapWidth) {
    throw new RangeError('first map coordinate is out of bounds');
  }
  if (!Number.isSafeInteger(second) || second < 0 || second >= mapHeight) {
    throw new RangeError('second map coordinate is out of bounds');
  }
  return first * mapHeight + second;
}

/** Write one measured four-bit-compatible value to a fill map cell. */
export function writeAaronFillCell(maps, first, second, value) {
  if (!maps || !maps.fillMap || !Number.isSafeInteger(maps.width)
      || !Number.isSafeInteger(maps.height)) {
    throw new TypeError('maps must be an Aaron map bundle');
  }
  if (!Number.isSafeInteger(value) || value < 0 || value > 15) {
    throw new RangeError('fill-map value must be an integer from 0 through 15');
  }
  const index = aaronMapIndex(maps.width, maps.height, first, second);
  maps.fillMap[index] = value;
  return index;
}
