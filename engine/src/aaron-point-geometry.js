// Measured point helpers from the 2001 image. See research/point-findings.md.
const single = Math.fround;

/** [cos, sin] for the bounded headings used by LOCK-WIGGLE. */
export function aaronPointTrig(angle) {
  if (!Number.isFinite(angle) || Math.abs(angle) > 3.25) {
    throw new RangeError('point heading must be finite and within [-3.25, 3.25]');
  }
  if (Math.abs(angle) < 2 ** -30) return [1, angle];
  // V8's double SIN/COS differ from the original in some final bits. Evaluate
  // the Taylor series with 192 fractional bits, then round once to binary64.
  // No range reduction is needed for atan2 +/- 0.05. This is a bounded numeric
  // reconstruction, not an implementation of Allegro's general math library.
  const scale = 1n << 192n;
  const scaleNumber = 2 ** 192;
  const x = BigInt(angle * scaleNumber);
  const square = (x * x) / scale;
  let cosine = scale, sine = x, cosineTerm = scale, sineTerm = x;
  for (let k = 1n; k <= 48n; k++) {
    cosineTerm = -(cosineTerm * square) / (scale * (2n * k - 1n) * (2n * k));
    sineTerm = -(sineTerm * square) / (scale * (2n * k) * (2n * k + 1n));
    cosine += cosineTerm;
    sine += sineTerm;
    if (cosineTerm === 0n && sineTerm === 0n) break;
  }
  return [Number(cosine) / scaleNumber, Number(sine) / scaleNumber];
}

function pointArithmetic(a, b, precision) {
  if (precision !== 'single' && precision !== 'double') {
    throw new RangeError('point precision must be single or double');
  }
  if (![a, b].every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) {
    throw new TypeError('points must contain two finite coordinates');
  }
  const cast = precision === 'single' ? single : value => value;
  const first = a.map(cast), last = b.map(cast);
  const dx = cast(last[0] - first[0]), dy = cast(last[1] - first[1]);
  // XYDIST returns a single float even with double coordinate arguments.
  // The held-out XYDIST cases rule out rounding the squares/sum to single.
  const distance = single(Math.sqrt(dx * dx + dy * dy));
  if (!Number.isFinite(distance)) throw new RangeError('point distance exceeds the measured finite range');
  return { cast, first, dx, dy, distance };
}

export function aaronXYDistance(a, b, { precision = 'single' } = {}) {
  return pointArithmetic(a, b, precision).distance;
}

/**
 * LOCK-WIGGLE returns 2–4 perturbed steps plus the origin, in reverse order.
 * This is one path helper, not the complete freehand line algorithm.
 * Pass Allegro501Random to reproduce the original seeded numeric behavior.
 */
export function aaronLockWiggle(a, b, random, { precision = 'single' } = {}) {
  const { cast, first, dx, dy, distance } = pointArithmetic(a, b, precision);
  const heading = cast(Math.atan2(dy, dx));
  const count = random.integer(2, 4);
  const step = single(single(single(distance / (count + 1)) * single(0.8)) * single(1.2));
  let point = first;
  const path = [point];
  for (let i = 0; i < count; i++) {
    const angle = cast(heading + random.ranFloat(-0.05, 0.05, {
      aPrecision: 'single', bPrecision: 'single',
    }));
    const [cosine, sine] = precision === 'double' ? aaronPointTrig(angle)
      : [single(Math.cos(angle)), single(Math.sin(angle))];
    point = [
      cast(point[0] + cast(cosine * step)),
      cast(point[1] + cast(sine * step)),
    ];
    path.push(point);
  }
  return path.reverse();
}
