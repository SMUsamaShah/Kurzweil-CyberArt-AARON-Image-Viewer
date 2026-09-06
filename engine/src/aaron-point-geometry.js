// Measured point helpers from the 2001 image. See research/point-findings.md.
const single = Math.fround;

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
    point = [
      cast(point[0] + cast(cast(Math.cos(angle)) * step)),
      cast(point[1] + cast(cast(Math.sin(angle)) * step)),
    ];
    path.push(point);
  }
  return path.reverse();
}
