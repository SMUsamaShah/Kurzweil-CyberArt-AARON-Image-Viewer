import { readNumericList } from './parse-line-report.mjs';

// Keep dependency-isolated evidence distinct from unmodified method calls.
export function parseStoreIsolatedReport(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.shift() !== 'BEGIN store-isolated' || lines.shift() !== 'INTERVENTION PLOT-FUNCTION-STUB'
      || lines.pop() !== 'END store-isolated' || lines.pop() !== 'RESTORED T') {
    throw new Error('Missing isolated store checkpoints or restoration');
  }
  const cases = [];
  let pending;
  for (const line of lines) {
    const input = /^TRY method="(VECTOR|FILL)" mode="(LARGE|SMALL)" redraw=(NIL|T) stub=(NIL|T) previous=(NIL|\(.*?\)) args=(\(.*\))$/.exec(line);
    if (input) {
      if (pending) throw new Error('Unfinished isolated case');
      pending = { method: input[1], mode: input[2].toLowerCase(), redraw: input[3] === 'T',
        stubResult: input[4] === 'T', previousBefore: input[5] === 'NIL' ? null : readNumericList(input[5]),
        args: readNumericList(input[6]), argsText: input[6], plotCalls: [] };
      continue;
    }
    if (!pending) throw new Error('Isolated data without input');
    if (line.startsWith('PLOT-CALL ')) pending.plotCalls.push(readNumericList(line.slice(10)));
    else if (line.startsWith('OUTPUT ')) {
      if (Object.hasOwn(pending, 'output')) throw new Error('Duplicate output');
      const codes = line.slice(7) === 'NIL' ? [] : readNumericList(line.slice(7));
      if (!codes.every(n => Number.isInteger(n) && n >= 0 && n <= 127)) throw new Error('Unsupported output code');
      pending.output = codes.map(n => String.fromCharCode(n)).join('');
    } else if (line.startsWith('PREVIOUS ')) {
      if (Object.hasOwn(pending, 'previousAfter')) throw new Error('Duplicate point state');
      pending.previousAfter = line.slice(9) === 'NIL' ? null : readNumericList(line.slice(9));
    } else if (/^ERROR [A-Z:-]+$/.test(line)) {
      if (pending.error) throw new Error('Duplicate error');
      pending.error = line.slice(6);
    } else if (line === 'ENDCASE') {
      if (!Object.hasOwn(pending, 'output') || !Object.hasOwn(pending, 'previousAfter')) throw new Error('Incomplete isolated case');
      cases.push(pending);
      pending = undefined;
    } else throw new Error(`Unsupported isolated record: ${line}`);
  }
  if (pending || !cases.length) throw new Error('Unfinished or empty isolated report');
  return { intervention: 'PLOT-FUNCTION-STUB', restored: true, cases };
}
