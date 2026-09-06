import { aaronHopOrDraw } from './aaron-hop.js';

function integerPoint(point) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isSafeInteger)) {
    throw new TypeError('this measured writer requires two safe integer coordinates');
  }
  return [...point];
}

/** Recovered STORE-IN-FILE point decisions, producing AA stream fragments. */
export class AaronStrokeWriter {
  constructor({ mode = 'small', previous = null } = {}) {
    if (mode !== 'small' && mode !== 'large') throw new RangeError('mode must be small or large');
    this.mode = mode;
    this.previous = previous === null ? null : integerPoint(previous);
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
    const start = integerPoint(from);
    const next = integerPoint(to);
    if (this.previous === null) throw new Error('vector requires an initial previous point');
    const family = redraw ? 'a' : 'z';
    if (start[0] !== this.previous[0] || start[1] !== this.previous[1]) {
      this.output += `${family}m ${start[0]}.00 ${start[1]}.00\n`;
    }
    this.output += `${family}d ${next[0]}.00 ${next[1]}.00\n`;
    this.previous = next;
    return this;
  }

  /** FILL emits absolute paint commands and preserves previous-point state. */
  fill(from, to) {
    const start = integerPoint(from);
    const next = integerPoint(to);
    this.output += `am ${start[0]}.00 ${start[1]}.00\nad ${next[0]}.00 ${next[1]}.00\n`;
    return this;
  }
}
