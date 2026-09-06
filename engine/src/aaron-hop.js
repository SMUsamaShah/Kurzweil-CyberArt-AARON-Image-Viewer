const DIRECTION_CODES = new Map([
  ['1,0', 'e'], ['1,1', 'f'], ['0,1', 'g'], ['-1,1', 'h'],
  ['-1,0', 'i'], ['0,-1', 'k'], ['1,-1', 'l'],
]);

/** Measured HOP-OR-DRAW selector; NIL in Lisp is represented by null. */
export function aaronHopOrDraw(a, b, { mode = 'small', precision = 'single' } = {}) {
  if (mode !== 'small' && mode !== 'large') throw new RangeError('mode must be small or large');
  if (precision !== 'single' && precision !== 'double') throw new RangeError('precision must be single or double');
  if (![a, b].every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) {
    throw new TypeError('points must contain two finite coordinates');
  }
  if (mode === 'large') return null;
  const cast = precision === 'single' ? Math.fround : value => value;
  const dx = cast(cast(b[0]) - cast(a[0]));
  const dy = cast(cast(b[1]) - cast(a[1]));
  // The original declines (-1,-1) in all measured cases despite retaining
  // a "j" literal. Preserve this encoding behavior; j remains valid to decode.
  return DIRECTION_CODES.get(`${dx},${dy}`) ?? null;
}
