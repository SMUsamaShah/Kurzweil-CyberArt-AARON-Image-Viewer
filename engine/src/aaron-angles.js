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

const TWO_PI = 2 * Math.PI;

/** Measured Allegro double MOD path for a positive divisor. */
export function allegroDoubleModulo(value, divisor) {
  if (!Number.isFinite(value) || !Number.isFinite(divisor) || divisor <= 0) {
    throw new RangeError('MOD requires a finite value and positive finite divisor');
  }
  const quotient = value / divisor;
  if (!Number.isFinite(quotient)) throw new RangeError('MOD quotient overflow');
  // Preserve operation order. JS % or value - floor(value/divisor)*divisor
  // rounds differently from the delivered Allegro runtime.
  const remainder = (quotient - Math.trunc(quotient)) * divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

/** Original NORM-A: normalize radians into (-pi, pi]. */
export function aaronNormAngle(angle) {
  const wrapped = allegroDoubleModulo(angle, TWO_PI);
  return wrapped > Math.PI ? wrapped - TWO_PI : wrapped;
}

/** Original ANGLE-DIF: magnitude, preserving the observed B-minus-A order. */
export function aaronAngleDifference(a, b) {
  return Math.abs(aaronNormAngle(
    allegroDoubleModulo(b, TWO_PI) - allegroDoubleModulo(a, TWO_PI),
  ));
}
