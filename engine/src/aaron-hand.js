// The zero-argument RAN-HAND helper recovered from the shipped AARON image.
// Its caller and the wider hand/figure model are still unresolved.

export const RAN_HAND_JOINTS = Object.freeze([
  'TJ3X', 'TJ2X', 'TJ1Z', 'TJ1Y',
  'FJ3X', 'FJ2X', 'FJ1X', 'FJ1Z',
  'IJ3X', 'IJ2X', 'IJ1X', 'IJ1Z',
  'MJ3X', 'MJ2X', 'MJ1X', 'MJ1Z',
  'PJ3X', 'PJ2X', 'PJ1X', 'PJ1Z',
]);

/**
 * Apply the measured RAN-HAND joint perturbation in place.
 *
 * Four post-INIT-RANDOM calls in the original engine each consumed one
 * single-float RAN(-0.1, 0.1) value per joint, in RAN_HAND_JOINTS order. Each
 * value was added as a single-float and the final delta was returned.
 */
export function ranHand(joints, random) {
  if (joints === null || typeof joints !== 'object') {
    throw new TypeError('RAN-HAND joints must be an object');
  }
  if (!random || typeof random.ranFloat !== 'function') {
    throw new TypeError('RAN-HAND requires a ranFloat random source');
  }

  let lastDelta;
  for (const name of RAN_HAND_JOINTS) {
    const current = joints[name];
    if (!Number.isFinite(current)) {
      throw new TypeError(`RAN-HAND joint ${name} must be finite`);
    }
    const delta = Math.fround(random.ranFloat(-0.1, 0.1, {
      aPrecision: 'single',
      bPrecision: 'single',
    }));
    if (!Number.isFinite(delta)) {
      throw new TypeError('RAN-HAND random delta must be finite');
    }
    joints[name] = Math.fround(Math.fround(current) + delta);
    lastDelta = delta;
  }
  return lastDelta;
}
