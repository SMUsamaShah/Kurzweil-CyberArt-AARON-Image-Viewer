/**
 * Return whether a point lies outside the captured AARON picture rectangle.
 * The measured rectangle includes both coordinate edges: 0 through width - 1
 * and 0 through height - 1. FOOB returned T outside and NIL inside for the
 * captured integer grid and single/double-float sample pairs.
 *
 * These guards define this JavaScript helper's supported inputs; they do not
 * describe FOOB's behavior for other Lisp numeric types or error cases.
 */
export function isPointOutsideAaronPicture(x, y, { width, height } = {}) {
  if (typeof x !== 'number' || !Number.isFinite(x)
      || typeof y !== 'number' || !Number.isFinite(y)) {
    throw new TypeError('x and y must be finite JavaScript numbers');
  }
  if (!Number.isSafeInteger(width) || width < 1
      || !Number.isSafeInteger(height) || height < 1) {
    throw new RangeError('width and height must be positive safe integers');
  }

  return x < 0 || x > width - 1 || y < 0 || y > height - 1;
}
