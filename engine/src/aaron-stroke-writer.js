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
}
