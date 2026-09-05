/**
 * Recovered numeric helper ANGLE-RANGE(Z, LX, RX).
 * See research/angle-findings.md and the original-engine report fixtures.
 * This supplies a primitive; it does not implement the freehand line system.
 */
export function aaronAngleRange(z, lx, rx, { precision = 'single' } = {}) {
  if (![z, lx, rx].every(Number.isFinite)) throw new TypeError('coordinates must be finite');
  if (!['single', 'double'].includes(precision)) throw new RangeError('precision must be single or double');
  const cast = precision === 'single' ? Math.fround : value => value;
  const coords = [z, lx, rx].map(cast);
  if (!coords.every(Number.isFinite)) throw new RangeError('coordinates exceed selected precision');
  const [depth, left, right] = coords;
  return [left, right].map(x => cast(Math.atan2(x, depth)));
}
