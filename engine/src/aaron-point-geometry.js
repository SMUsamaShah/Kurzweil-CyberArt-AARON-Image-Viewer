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

function freePathDistance(a, b) {
  const dx = single(single(b[0]) - single(a[0]));
  const dy = single(single(b[1]) - single(a[1]));
  return single(Math.sqrt(dx * dx + dy * dy));
}

function polarVisPoint(point, angle, distance, visibility, { baseDouble = false, angleDouble = false } = {}) {
  if (angleDouble) {
    const [cosine, sine] = aaronPointTrig(angle);
    return [
      point[0] + distance * cosine,
      point[1] + distance * sine,
      visibility,
    ];
  }
  // Allegro's single-float COS/SIN and product are rounded before the
  // coordinate addition. A double coordinate retains that single-float delta;
  // a single coordinate is rounded again after the addition.
  const dx = single(distance * single(Math.cos(angle)));
  const dy = single(distance * single(Math.sin(angle)));
  return [
    baseDouble ? point[0] + dx : single(point[0] + dx),
    baseDouble ? point[1] + dy : single(point[1] + dy),
    visibility,
  ];
}

function freePathEdge(from, to, random, doubleCoordinates) {
  const distance = freePathDistance(from, to);
  const count = random.integer(8, 14);
  const dx = single(to[0]) - single(from[0]);
  const dy = single(to[1]) - single(from[1]);
  const heading = doubleCoordinates ? Math.atan2(dy, dx) : single(Math.atan2(dy, dx));
  let spine = doubleCoordinates ? [from[0], from[1]] : [single(from[0]), single(from[1])];
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const scale = random.ranFloat(0.7, 1.3, { aPrecision: 'single', bPrecision: 'single' });
    const wiggle = random.ranFloat(0.015, 0.03, { aPrecision: 'single', bPrecision: 'single' });
    const step = single(single(distance / count) * scale);
    spine = polarVisPoint(spine, heading, step, 1, {
      baseDouble: doubleCoordinates,
      angleDouble: doubleCoordinates,
    });
    const angle = random.ranFloat(0, 6.28, { aPrecision: 'single', bPrecision: 'single' });
    const offset = polarVisPoint(spine, angle, single(step * wiggle), 1, {
      baseDouble: doubleCoordinates,
    });
    // The original still computes the final offset (and consumes its random
    // angle), but drops it before appending the endpoint.
    if (index < count - 1) result.push(offset);
  }
  return result;
}

/**
 * Measured FREE-PATH subset from the 2001 image.
 *
 * The input is a closed list of [x, y, visibility] points. A segment whose
 * target visibility is zero is copied straight through. Other segments use
 * the recovered 8–14-step randomized path and preserve the duplicate vertex
 * between successive edges. `precision: 'auto'` treats non-integer coordinates
 * as double-float inputs; callers can select single/double explicitly when
 * the original Lisp numeric type is known.
 */
export function aaronFreePath(points, random, { precision = 'auto' } = {}) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new TypeError('FREE-PATH requires at least two points');
  }
  if (!random || typeof random.integer !== 'function' || typeof random.ranFloat !== 'function') {
    throw new TypeError('FREE-PATH requires an Allegro-compatible random source');
  }
  if (!['auto', 'single', 'double'].includes(precision)) {
    throw new RangeError('FREE-PATH precision must be auto, single, or double');
  }
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) {
      throw new TypeError('FREE-PATH points must be finite [x, y, visibility] triples');
    }
  }
  const result = [[...points[0]]];
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    // Each segment starts with its source vertex. This intentionally retains
    // the duplicate vertices visible in the original returned list.
    if (index > 0) result.push([...from]);
    const doubleCoordinates = precision === 'double'
      || (precision === 'auto' && from.slice(0, 2).some(value => !Number.isInteger(value)));
    if (to[2] !== 0) result.push(...freePathEdge(from, to, random, doubleCoordinates));
    result.push([...to]);
  }
  return result;
}
