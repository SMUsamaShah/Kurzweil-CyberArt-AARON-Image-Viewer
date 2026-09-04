const DIRECTION_DELTAS = Object.freeze({
  e: [1, 0],
  f: [1, 1],
  g: [0, 1],
  h: [-1, 1],
  i: [-1, 0],
  j: [-1, -1],
  k: [0, -1],
  l: [1, -1],
});

export class AaFormatError extends Error {
  constructor(message, lineNumber) {
    super(lineNumber ? `Line ${lineNumber}: ${message}` : message);
    this.name = 'AaFormatError';
    this.lineNumber = lineNumber;
  }
}

function finiteNumber(value, label, lineNumber) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new AaFormatError(`${label} must be a finite number`, lineNumber);
  }
  return number;
}

function positiveInteger(value, label, lineNumber) {
  const number = finiteNumber(value, label, lineNumber);
  if (!Number.isInteger(number) || number <= 0) {
    throw new AaFormatError(`${label} must be a positive integer`, lineNumber);
  }
  return number;
}

function expectArity(parts, arity, lineNumber) {
  if (parts.length !== arity + 1) {
    throw new AaFormatError(
      `${parts[0]} expects ${arity} argument${arity === 1 ? '' : 's'}`,
      lineNumber,
    );
  }
}

function parseOperation(line, lineNumber, colorCount) {
  const parts = line.split(/\s+/);
  const command = parts[0];

  if (command in DIRECTION_DELTAS) {
    expectArity(parts, 0, lineNumber);
    return { command, lineNumber };
  }

  switch (command) {
    case 'am':
    case 'ad':
      expectArity(parts, 2, lineNumber);
      return {
        command,
        x: finiteNumber(parts[1], 'x', lineNumber),
        y: finiteNumber(parts[2], 'y', lineNumber),
        lineNumber,
      };

    case 'nb': {
      expectArity(parts, 1, lineNumber);
      const width = positiveInteger(parts[1], 'brush width', lineNumber);
      return { command, width, lineNumber };
    }

    case 'nc': {
      expectArity(parts, 1, lineNumber);
      const index = finiteNumber(parts[1], 'colour index', lineNumber);
      if (!Number.isInteger(index) || index < 0 || index >= colorCount) {
        throw new AaFormatError(
          `colour index must be between 0 and ${colorCount - 1}`,
          lineNumber,
        );
      }
      return { command, index, lineNumber };
    }

    default:
      throw new AaFormatError(`unknown command ${JSON.stringify(command)}`, lineNumber);
  }
}

/**
 * Parse the plain-text format emitted by KCAT AARON 2001.
 *
 * The result preserves AARON's two drawing phases. `outline` contains the
 * structural paths before the `color` marker; `paint` contains the painterly
 * brush operations between `color` and `end`.
 */
export function parseAaFile(text) {
  if (typeof text !== 'string') {
    throw new TypeError('AA input must be a string');
  }

  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  while (lines.length && lines.at(-1).trim() === '') lines.pop();
  if (!lines.length) throw new AaFormatError('AA input is empty');

  const header = lines[0].trim().split(/\s+/);
  if (header.length !== 3) {
    throw new AaFormatError('header must contain width, height, and colour count', 1);
  }

  const width = positiveInteger(header[0], 'width', 1);
  const height = positiveInteger(header[1], 'height', 1);
  const colorCount = positiveInteger(header[2], 'colour count', 1);
  if (lines.length < colorCount + 3) {
    throw new AaFormatError('file ends before its declared palette and commands');
  }

  const palette = [];
  for (let index = 0; index < colorCount; index += 1) {
    const lineNumber = index + 2;
    const parts = lines[lineNumber - 1].trim().split(/\s+/);
    if (parts.length !== 3) {
      throw new AaFormatError('palette entry must contain red, green, and blue', lineNumber);
    }
    const rgb = parts.map((part, channel) =>
      finiteNumber(part, ['red', 'green', 'blue'][channel], lineNumber),
    );
    if (rgb.some((value) => value < 0 || value > 1)) {
      throw new AaFormatError('palette channels must be between 0 and 1', lineNumber);
    }
    palette.push(Object.freeze(rgb));
  }

  const outline = [];
  const paint = [];
  let phase = 'outline';
  let sawColor = false;
  let sawEnd = false;

  for (let index = colorCount + 1; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index].trim();
    if (!line) continue;

    if (line === 'color') {
      if (sawColor) throw new AaFormatError('duplicate color marker', lineNumber);
      sawColor = true;
      phase = 'paint';
      continue;
    }

    if (line === 'end') {
      if (!sawColor) throw new AaFormatError('end appears before color', lineNumber);
      if (index !== lines.length - 1) {
        throw new AaFormatError('commands appear after end', lineNumber);
      }
      sawEnd = true;
      break;
    }

    const operation = parseOperation(line, lineNumber, colorCount);
    (phase === 'outline' ? outline : paint).push(operation);
  }

  if (!sawColor) throw new AaFormatError('missing color marker');
  if (!sawEnd) throw new AaFormatError('missing end marker');

  return Object.freeze({
    width,
    height,
    palette: Object.freeze(palette),
    outline: Object.freeze(outline),
    paint: Object.freeze(paint),
  });
}

function cssColor(rgb) {
  const [red, green, blue] = rgb.map((channel) => channel * 100);
  return `rgb(${red}% ${green}% ${blue}%)`;
}

function drawOperations(context, operations, palette, initialStyle) {
  let x = 0;
  let y = 0;
  let previousX = 0;
  let previousY = 0;
  context.strokeStyle = initialStyle.color;
  context.lineWidth = initialStyle.width;

  const lineTo = (nextX, nextY) => {
    context.beginPath();
    context.moveTo(previousX, previousY);
    context.lineTo(nextX, nextY);
    context.stroke();
    previousX = nextX;
    previousY = nextY;
    x = nextX;
    y = nextY;
  };

  for (const operation of operations) {
    if (operation.command in DIRECTION_DELTAS) {
      const [deltaX, deltaY] = DIRECTION_DELTAS[operation.command];
      lineTo(x + deltaX, y + deltaY);
      continue;
    }

    switch (operation.command) {
      case 'am':
        x = operation.x;
        y = operation.y;
        previousX = x;
        previousY = y;
        break;
      case 'ad':
        lineTo(operation.x, operation.y);
        break;
      case 'nb':
        context.lineWidth = operation.width;
        break;
      case 'nc':
        context.strokeStyle = cssColor(palette[operation.index]);
        break;
    }
  }
}

/** Render a parsed AA document to a CanvasRenderingContext2D-compatible API. */
export function renderAaFile(document, context, options = {}) {
  const background = options.background ?? '#c8c8c8';
  context.canvas.width = document.width;
  context.canvas.height = document.height;
  context.lineCap = 'round';
  context.translate(0, document.height);
  context.scale(1, -1);
  context.fillStyle = background;
  context.fillRect(0, 0, document.width, document.height);

  // This order intentionally matches the historical viewer: an initial
  // structural pass, the colour/brush pass, then fine outlines on top.
  drawOperations(context, document.outline, document.palette, {
    color: '#000',
    width: 1,
  });
  drawOperations(context, document.paint, document.palette, {
    color: '#000',
    width: 1,
  });
  drawOperations(context, document.outline, document.palette, {
    color: '#000',
    width: 0.5,
  });
}

export const aaDirectionDeltas = DIRECTION_DELTAS;
