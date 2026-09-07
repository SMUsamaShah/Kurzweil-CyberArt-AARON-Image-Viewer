import { aaronHopOrDraw } from './aaron-hop.js';

function integerPoint(point) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isSafeInteger)) {
    throw new TypeError('this measured writer requires two safe integer coordinates');
  }
  return [...point];
}

function numericPoint(point) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
    throw new TypeError('writer points must contain two finite coordinates');
  }
  return [...point];
}

/**
 * Format the two-decimal `~$` values used by VECTOR and FILL.
 *
 * The observed Allegro/ACL formatter truncates toward zero at the half-cent
 * (1.125 -> 1.12, -20.375 -> -20.37) and preserves a negative sign when a
 * negative value truncates to zero (-0.004 -> -0.00).
 * This deliberately stays small and deterministic rather than using
 * JavaScript's `toFixed`, whose binary tie handling differs for 1.125.
 */
function formatFixed(value, digits = 2) {
  if (!Number.isFinite(value)) throw new TypeError('writer coordinates must be finite');
  const scale = 10 ** digits;
  const scaled = Math.abs(value) * scale;
  const rounded = Math.floor(scaled);

  const sign = value < 0 || Object.is(value, -0) ? '-' : '';
  const whole = Math.floor(rounded / scale);
  const fractionText = String(rounded % scale).padStart(digits, '0');
  return `${sign}${whole}.${fractionText}`;
}

/** Recovered STORE-IN-FILE point decisions, producing AA stream fragments. */
export class AaronStrokeWriter {
  constructor({ mode = 'small', previous = null } = {}) {
    if (mode !== 'small' && mode !== 'large') throw new RangeError('mode must be small or large');
    this.mode = mode;
    this.previous = previous === null ? null : numericPoint(previous);
    this.output = '';
  }

  dimensions(width, height) {
    if (![width, height].every(Number.isSafeInteger)) throw new TypeError('dimensions must be safe integers');
    this.output += `dims ${width} ${height}\nnb 1\n`;
    return this;
  }

  brush(width) {
    if (!Number.isSafeInteger(width) || width <= 0) throw new RangeError('brush width must be positive');
    this.output += `nb ${width}\n`;
    return this;
  }

  color(index) {
    if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('colour index must be non-negative');
    this.output += `nc ${index}\n`;
    return this;
  }

  colorMode() {
    this.output += 'color\n';
    return this;
  }

  end(width, height) {
    if (![width, height].every(Number.isSafeInteger)) throw new TypeError('end dimensions must be safe integers');
    this.output += `am ${width} ${height}\nend\n`;
    return this;
  }

  moveTo(point, { redraw = false } = {}) {
    const next = integerPoint(point);
    this.output += `${redraw ? 'am' : 'zm'} ${next[0]} ${next[1]}\n`;
    this.previous = next;
    return this;
  }

  drawTo(point, { redraw = false } = {}) {
    const next = integerPoint(point);
    if (this.previous === null) throw new Error('drawTo requires an initial previous point');
    const hop = aaronHopOrDraw(this.previous, next, { mode: this.mode, precision: 'double' });
    this.output += hop === null ? `${redraw ? 'ad' : 'zd'} ${next[0]} ${next[1]}\n` : `${hop}\n`;
    this.previous = next;
    return this;
  }

  /** Stream effect measured with PLOT replaced; no screen drawing is performed. */
  vector(from, to, { redraw = false } = {}) {
    const start = numericPoint(from);
    const next = numericPoint(to);
    if (this.previous === null) throw new Error('vector requires an initial previous point');
    const family = redraw ? 'a' : 'z';
    if (start[0] !== this.previous[0] || start[1] !== this.previous[1]) {
      this.output += `${family}m ${formatFixed(start[0])} ${formatFixed(start[1])}\n`;
    }
    this.output += `${family}d ${formatFixed(next[0])} ${formatFixed(next[1])}\n`;
    this.previous = next;
    return this;
  }

  /** FILL emits absolute paint commands and preserves previous-point state. */
  fill(from, to) {
    const start = numericPoint(from);
    const next = numericPoint(to);
    this.output += `am ${formatFixed(start[0])} ${formatFixed(start[1])}\nad ${formatFixed(next[0])} ${formatFixed(next[1])}\n`;
    return this;
  }
}
