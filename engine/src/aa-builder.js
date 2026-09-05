import { aaDirectionDeltas, serializeAaFile } from './aa-format.js';

const DIRECTIONS = Object.freeze(Object.fromEntries(
  Object.entries(aaDirectionDeltas).map(([command, [x, y]]) => [command, { command, x, y }]),
));

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return Number(value);
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be positive`);
  return value;
}

function colorIndex(value, palette) {
  if (!Number.isInteger(value) || value < 0 || value >= palette.length) {
    throw new RangeError(`colour index must be between 0 and ${palette.length - 1}`);
  }
  return value;
}

function copyOperation(operation) {
  return { ...operation };
}

/**
 * Stateful emitter for the two-phase AA interchange format.
 *
 * It intentionally models only observable file operations. Scene and brush
 * code can therefore be tested without a Canvas implementation, and the
 * emitter remains useful when new original commands are discovered.
 */
export class AaBuilder {
  constructor({ width, height, palette }) {
    this.width = positiveInteger(width, 'width');
    this.height = positiveInteger(height, 'height');
    if (!Array.isArray(palette) || palette.length === 0) {
      throw new TypeError('palette must be a non-empty array');
    }
    this.palette = palette.map((rgb) => {
      if (!Array.isArray(rgb) || rgb.length !== 3 || rgb.some((channel) => !Number.isFinite(channel))) {
        throw new TypeError('palette entries must contain three finite channels');
      }
      return [...rgb];
    });
    this.outline = [];
    this.paint = [];
    this.phase = 'outline';
    this.position = { outline: null, paint: null };
  }

  get operations() {
    return this.phase === 'outline' ? this.outline : this.paint;
  }

  usePaint() {
    this.phase = 'paint';
    return this;
  }

  useOutline() {
    this.phase = 'outline';
    return this;
  }

  add(operation) {
    this.operations.push(copyOperation(operation));
    return this;
  }

  move(x, y, { z = false } = {}) {
    const point = { x: finite(x, 'x'), y: finite(y, 'y') };
    this.add({ command: z ? 'zm' : 'am', ...point });
    this.position[this.phase] = point;
    return this;
  }

  draw(x, y, { z = false } = {}) {
    const point = { x: finite(x, 'x'), y: finite(y, 'y') };
    this.add({ command: z ? 'zd' : 'ad', ...point });
    this.position[this.phase] = point;
    return this;
  }

  brush(width) {
    this.add({ command: 'nb', width: positiveInteger(width, 'brush width') });
    return this;
  }

  color(index) {
    this.add({ command: 'nc', index: colorIndex(index, this.palette) });
    return this;
  }

  direction(command) {
    const direction = DIRECTIONS[command];
    if (!direction) throw new RangeError(`unknown AA direction ${JSON.stringify(command)}`);
    const position = this.position[this.phase] ?? { x: 0, y: 0 };
    this.add({ command });
    this.position[this.phase] = {
      x: position.x + direction.x,
      y: position.y + direction.y,
    };
    return this;
  }

  /** Move using an 8-connected unit chain until the target is reached. */
  chainTo(x, y) {
    const target = { x: finite(x, 'x'), y: finite(y, 'y') };
    const position = this.position[this.phase];
    if (!position) return this.move(target.x, target.y);
    if (!Number.isInteger(position.x) || !Number.isInteger(position.y)
      || !Number.isInteger(target.x) || !Number.isInteger(target.y)) {
      throw new RangeError('chain endpoints must be integer coordinates');
    }
    let currentX = position.x;
    let currentY = position.y;
    while (currentX !== target.x || currentY !== target.y) {
      const dx = Math.sign(target.x - currentX);
      const dy = Math.sign(target.y - currentY);
      const command = Object.entries(aaDirectionDeltas)
        .find(([, [xDelta, yDelta]]) => xDelta === dx && yDelta === dy)?.[0];
      if (!command) throw new Error(`cannot chain from ${currentX},${currentY} to ${target.x},${target.y}`);
      this.direction(command);
      currentX += dx;
      currentY += dy;
    }
    return this;
  }

  polyline(points, options = {}) {
    if (!points?.length) return this;
    const [first, ...rest] = points;
    this.move(first[0], first[1], options);
    for (const point of rest) this.draw(point[0], point[1], options);
    return this;
  }

  document() {
    return Object.freeze({
      width: this.width,
      height: this.height,
      palette: Object.freeze(this.palette.map((rgb) => Object.freeze([...rgb]))),
      outline: Object.freeze(this.outline.map((operation) => Object.freeze(copyOperation(operation)))),
      paint: Object.freeze(this.paint.map((operation) => Object.freeze(copyOperation(operation)))),
    });
  }

  text(options) {
    return serializeAaFile(this.document(), options);
  }
}

export function createAaBuilder(options) {
  return new AaBuilder(options);
}
