function integer(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${field}`);
  return parsed;
}

function boolean(value) {
  if (value === 'T') return true;
  if (value === 'NIL') return false;
  throw new Error('Invalid Boolean field');
}

/**
 * Parse the bounded Stage 23 BRUSH-STROKE matrix while preserving every
 * observed map cell, forwarded screen path, counter, and error boundary.
 * Earlier stages in the same report are intentionally ignored.
 */
export function parseBrushStrokeReport(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.shift() !== 'BEGIN brush-stroke-isolated'
      || lines.pop() !== 'END brush-stroke-isolated') {
    throw new Error('Missing brush-stroke checkpoints');
  }

  const start = lines.indexOf('STAGE-23-BRUSH-MATRIX-BEGIN');
  const end = lines.indexOf('STAGE-23-BRUSH-MATRIX-END');
  if (start < 0 || end < start) throw new Error('Missing Stage 23 checkpoints');

  const cases = [];
  let pending;
  let currentScreen;
  for (const line of lines.slice(start + 1, end)) {
    let match = /^MATRIX-CASE (\S+) BRUSH (\d+) VALUE (\d+) CDEX (-?\d+) SDEX (-?\d+) INSIDE (NIL|T)$/.exec(line);
    if (match) {
      if (pending) throw new Error('Unfinished brush matrix case');
      pending = {
        name: match[1],
        brushId: integer(match[2], 'brush id'),
        value: integer(match[3], 'value'),
        cdex: integer(match[4], 'CDEX'),
        sdex: integer(match[5], 'SDEX'),
        inside: boolean(match[6]),
        screens: [],
        fillCells: [],
        patchCells: [],
      };
      currentScreen = undefined;
      continue;
    }
    if (!pending) continue;

    match = /^MATRIX-SCREEN (\S+) (\d+) (-?\d+) (-?\d+)$/.exec(line);
    if (match) {
      if (match[1] !== pending.name) throw new Error('Mismatched screen case');
      const call = integer(match[2], 'screen call');
      if (pending.screens.some((screen) => screen.call === call)) {
        throw new Error('Duplicate screen call');
      }
      currentScreen = {call, cdex: integer(match[3], 'screen CDEX'),
        sdex: integer(match[4], 'screen SDEX'), points: []};
      pending.screens.push(currentScreen);
      continue;
    }

    match = /^MATRIX-POINT (\S+) (\d+) (-?\d+) (-?\d+)$/.exec(line);
    if (match) {
      if (match[1] !== pending.name || !currentScreen) {
        throw new Error('Point without a screen call');
      }
      currentScreen.points.push({
        index: integer(match[2], 'point index'),
        x: integer(match[3], 'point x'),
        y: integer(match[4], 'point y'),
      });
      continue;
    }

    match = /^MATRIX-(FILL|PATCH) (\S+) (\d+) (\d+)$/.exec(line);
    if (match) {
      if (match[2] !== pending.name) throw new Error('Mismatched map case');
      const cells = match[1] === 'FILL' ? pending.fillCells : pending.patchCells;
      cells.push({index: integer(match[3], 'cell index'), value: integer(match[4], 'cell value')});
      continue;
    }

    match = /^MATRIX-(SCREEN-COUNT|INSIDE-COUNT) (\S+) (\d+)$/.exec(line);
    if (match) {
      if (match[2] !== pending.name) throw new Error('Mismatched counter case');
      const field = match[1] === 'SCREEN-COUNT' ? 'screenCount' : 'insideCount';
      if (Object.hasOwn(pending, field)) throw new Error(`Duplicate ${field}`);
      pending[field] = integer(match[3], field);
      continue;
    }

    match = /^MATRIX-ERROR (\S+) (\S+)$/.exec(line);
    if (match) {
      if (match[1] !== pending.name || pending.error) throw new Error('Duplicate or mismatched matrix error');
      pending.error = match[2];
      continue;
    }
    if (line === 'MATRIX-RETURNED' || line === 'MATRIX-ERRORED') {
      if (pending.outcome) throw new Error('Duplicate matrix outcome');
      pending.outcome = line === 'MATRIX-RETURNED' ? 'returned' : 'errored';
      if (!Object.hasOwn(pending, 'screenCount')
          || !Object.hasOwn(pending, 'insideCount')) {
        throw new Error('Incomplete matrix counters');
      }
      if (pending.outcome === 'errored' && !pending.error) {
        throw new Error('Errored matrix case has no error record');
      }
      cases.push(pending);
      pending = undefined;
      currentScreen = undefined;
      continue;
    }
    if (line === 'MATRIX-RESOLVED'
        || /^MATRIX-(BEFORE|AFTER)-STROKE \S+$/.test(line)) continue;
    if (/^MATRIX-POINT-ERROR \S+ \d+$/.test(line)
        || line === 'MATRIX-IMPROPER-TAIL') continue;
    throw new Error(`Unsupported Stage 23 record: ${line}`);
  }

  if (pending) throw new Error('Unfinished brush matrix case');
  if (!cases.length) throw new Error('Empty brush matrix report');
  return {cases};
}
