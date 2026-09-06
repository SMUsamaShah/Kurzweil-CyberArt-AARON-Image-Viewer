import { readNumericList } from './parse-line-report.mjs';

export function parseFreePathReport(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.shift() !== 'BEGIN free-path-validation' || lines.pop() !== 'END free-path-validation'
      || lines.pop() !== 'RESTORED T') throw new Error('Missing free-path checkpoints or restoration');
  const cases = [];
  let pending;
  for (const line of lines) {
    let match = /^TRY seed=(\d+) points=(.*)$/.exec(line);
    if (match) {
      if (pending) throw new Error('Unfinished free-path case');
      pending = { seed: Number(match[1]), points: readNumericList(match[2]), pointsText: match[2], trace: [] };
      continue;
    }
    if (!pending) throw new Error('Free-path record without input');
    if (line === 'WARMED') {
      if (pending.warmed) throw new Error('Duplicate warmup');
      pending.warmed = true;
    } else if ((match = /^RAN (\(.*?\)) => (\S+)$/.exec(line))) {
      pending.trace.push({ name: 'RAN', args: readNumericList(match[1]), value: readNumericList(`(${match[2]})`)[0] });
    } else if ((match = /^POL-VPT (\(.*?\)) (\S+) (\S+) (\S+) => (\(.*\))$/.exec(line))) {
      pending.trace.push({ name: 'POL-VPT', args: [readNumericList(match[1]), ...readNumericList(`(${match[2]} ${match[3]} ${match[4]})`)], value: readNumericList(match[5]) });
    } else if ((match = /^XYDIST (\(.*?\)) (\(.*?\)) => (\S+)$/.exec(line))) {
      pending.trace.push({ name: 'XYDIST', args: [readNumericList(match[1]), readNumericList(match[2])], value: readNumericList(`(${match[3]})`)[0] });
    } else if ((match = /^(ACTUAL|BASELINE) (.*)$/.exec(line))) {
      const field = match[1].toLowerCase();
      if (Object.hasOwn(pending, field)) throw new Error('Duplicate measurement');
      pending[field] = readNumericList(match[2]);
    } else if ((match = /^CALLS (\d+)$/.exec(line))) {
      if (Object.hasOwn(pending, 'calls')) throw new Error('Duplicate call count');
      pending.calls = Number(match[1]);
    } else if ((match = /^MATCH (T|NIL)$/.exec(line))) {
      if (Object.hasOwn(pending, 'match')) throw new Error('Duplicate match');
      pending.match = match[1] === 'T';
    } else if (line === 'ENDCASE') {
      if (!pending.warmed || !pending.actual || !pending.baseline || !Object.hasOwn(pending, 'match')
          || pending.trace.length !== pending.calls) throw new Error('Incomplete free-path comparison');
      cases.push(pending);
      pending = undefined;
    } else throw new Error(`Unsupported free-path record: ${line}`);
  }
  if (pending || !cases.length) throw new Error('Unfinished or empty free-path report');
  return { cases };
}
