import { aaDirectionDeltas } from './aa-format.js';

function increment(table, key) {
  table[key] = (table[key] ?? 0) + 1;
}

function includePoint(bounds, x, y) {
  if (bounds.empty) {
    bounds.minX = x;
    bounds.maxX = x;
    bounds.minY = y;
    bounds.maxY = y;
    bounds.empty = false;
    return;
  }
  bounds.minX = Math.min(bounds.minX, x);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function analyzeOperations(operations) {
  const commands = {};
  const brushWidths = {};
  const colorSelections = {};
  const bounds = { empty: true, minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let x = 0;
  let y = 0;
  let hasPosition = false;
  let moves = 0;
  let segments = 0;
  let chainSegments = 0;
  let distance = 0;

  for (const operation of operations) {
    increment(commands, operation.command);

    if (Object.hasOwn(aaDirectionDeltas, operation.command)) {
      if (!hasPosition) {
        includePoint(bounds, x, y);
        hasPosition = true;
      }
      const [deltaX, deltaY] = aaDirectionDeltas[operation.command];
      const nextX = x + deltaX;
      const nextY = y + deltaY;
      includePoint(bounds, nextX, nextY);
      distance += Math.hypot(deltaX, deltaY);
      x = nextX;
      y = nextY;
      segments += 1;
      chainSegments += 1;
      continue;
    }

    switch (operation.command) {
      case 'am':
        x = operation.x;
        y = operation.y;
        includePoint(bounds, x, y);
        hasPosition = true;
        moves += 1;
        break;
      case 'ad': {
        if (!hasPosition) {
          includePoint(bounds, x, y);
          hasPosition = true;
        }
        const nextX = operation.x;
        const nextY = operation.y;
        includePoint(bounds, nextX, nextY);
        distance += Math.hypot(nextX - x, nextY - y);
        x = nextX;
        y = nextY;
        segments += 1;
        break;
      }
      case 'nb':
        increment(brushWidths, operation.width);
        break;
      case 'nc':
        increment(colorSelections, operation.index);
        break;
    }
  }

  return {
    operations: operations.length,
    commands,
    moves,
    segments,
    chainSegments,
    distance,
    bounds: bounds.empty
      ? null
      : {
          minX: bounds.minX,
          maxX: bounds.maxX,
          minY: bounds.minY,
          maxY: bounds.maxY,
        },
    brushWidths,
    colorSelections,
  };
}

/** Produce compact, comparable measurements for a parsed AA document. */
export function analyzeAaDocument(document) {
  const channels = document.palette.flat();
  return {
    canvas: { width: document.width, height: document.height },
    palette: {
      entries: document.palette.length,
      channelMinimum: Math.min(...channels),
      channelMaximum: Math.max(...channels),
    },
    outline: analyzeOperations(document.outline),
    paint: analyzeOperations(document.paint),
  };
}
