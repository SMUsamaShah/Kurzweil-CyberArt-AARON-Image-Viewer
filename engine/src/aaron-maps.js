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
