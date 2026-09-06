import { readNumericList } from './parse-line-report.mjs';

export function parseStoreReport(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines[0] !== 'BEGIN store-behavior' || lines.at(-1) !== 'END store-behavior') {
    throw new Error('Missing store checkpoints');
  }
  const cases = [];
  let pending;
  for (const line of lines.slice(1, -1)) {
    const input = /^TRY method="(MOVE-TO|DRAW-TO|VECTOR|FILL)" mode="(LARGE|SMALL)" redraw=(NIL|T) plot=(NIL|T)(?: controls=(NIL|T))? previous=(\(.*?\)) args=(\(.*\))$/.exec(line);
    if (input) {
      if (pending) throw new Error('Unfinished store case');
      pending = { method: input[1], mode: input[2], redraw: input[3] === 'T', plot: input[4] === 'T',
        previousBefore: readNumericList(input[6]), args: readNumericList(input[7]) };
      if (input[5] !== undefined) pending.controls = input[5] === 'T';
      continue;
    }
    if (!pending) throw new Error('Store data without input');
    if (line.startsWith('OUTPUT ')) {
      if (Object.hasOwn(pending, 'output')) throw new Error('Duplicate output');
      const codes = line.slice(7) === 'NIL' ? [] : readNumericList(line.slice(7));
      if (!codes.every(n => Number.isInteger(n) && n >= 0 && n <= 127)) throw new Error('Unsupported output character');
      pending.output = codes.map(n => String.fromCharCode(n)).join('');
    } else if (line.startsWith('PREVIOUS ')) {
      if (Object.hasOwn(pending, 'previousAfter')) throw new Error('Duplicate previous point');
      pending.previousAfter = line.slice(9) === 'NIL' ? null : readNumericList(line.slice(9));
    } else if (line.startsWith('ERROR-CELL ')) {
      const cell = /^ERROR-CELL (NIL|"[A-Z-]+") "([A-Z0-9*?.-]+)"$/.exec(line);
      if (!cell || !pending.error || pending.errorCell) throw new Error('Unsupported error cell');
      pending.errorCell = { package: cell[1] === 'NIL' ? null : cell[1].slice(1, -1), name: cell[2] };
    } else if (/^ERROR [A-Z:-]+$/.test(line)) {
      if (pending.error) throw new Error('Duplicate error');
      pending.error = line.slice(6);
    } else if (line === 'ENDCASE') {
      if (!Object.hasOwn(pending, 'output') || !Object.hasOwn(pending, 'previousAfter')) {
        throw new Error('Incomplete store output/state');
      }
      cases.push(pending);
      pending = undefined;
    } else throw new Error(`Unsupported store record: ${line}`);
  }
  if (pending || !cases.length) throw new Error('Unfinished or empty store report');
  return { cases };
}
