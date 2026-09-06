import { readNumericList } from './parse-line-report.mjs';

/** Parse only the measured hop probe grammar; never evaluate Lisp. */
export function parseHopReport(text) {
  const lines = text.trim().split(/\r?\n/);
  const begin = /^BEGIN (hop-behavior|hop-validation)$/.exec(lines[0]);
  if (!begin || lines.at(-1) !== `END ${begin[1]}`) throw new Error('Missing hop checkpoints');
  const cases = [];
  let pending;
  for (const line of lines.slice(1, -1)) {
    const input = /^TRY mode="(LARGE|SMALL)" args=(\(.*\))$/.exec(line);
    if (input) {
      if (pending) throw new Error('Missing hop result');
      const args = readNumericList(input[2]);
      if (args.length !== 2 || !args.every(p => Array.isArray(p) && p.length === 2
        && p.every(Number.isFinite))) throw new Error('Expected two numeric points');
      pending = { mode: input[1], args, argsText: input[2] };
      continue;
    }
    if (!pending) throw new Error('Hop result without input');
    const result = /^RESULT \((NIL|"[e-l]")\)$/.exec(line);
    const error = /^ERROR ([A-Z:-]+)$/.exec(line);
    if (result) cases.push({ ...pending, value: result[1] === 'NIL' ? null : result[1][1] });
    else if (error) cases.push({ ...pending, error: error[1] });
    else throw new Error(`Unsupported hop result: ${line}`);
    pending = undefined;
  }
  if (pending || !cases.length) throw new Error('Incomplete hop report');
  return { probe: begin[1], cases };
}
