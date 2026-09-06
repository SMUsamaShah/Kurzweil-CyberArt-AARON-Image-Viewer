import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// A reader for the numeric lists emitted by our probe, not a Lisp evaluator.
// Single-float decimal printing must be rounded back to binary32. Raw text
// stays in each record to preserve numeric types and signed-zero spelling.
export function readNumericList(text) {
  const tokens = text.match(/[()]|[^\s()]+/g) ?? [];
  let index = 0;
  function read(depth = 0) {
    if (depth > 8) throw new Error('Numeric list nesting exceeds probe bound');
    const token = tokens[index++];
    if (token === '(') {
      const items = [];
      while (tokens[index] !== ')') {
        if (index >= tokens.length) throw new Error('Truncated numeric list');
        items.push(read(depth + 1));
      }
      index++;
      return items;
    }
    if (token === 'NIL') return null;
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEfFdDsSlL][+-]?\d+)?$/.test(token ?? '')) {
      throw new Error(`Unsupported numeric token ${token}`);
    }
    let value = Number(token.replace(/[fFdDsSlL]/, 'e'));
    if (/[.eEfFsS]/.test(token) && !/[dDlL]/.test(token)) value = Math.fround(value);
    if (!Number.isFinite(value)) throw new Error('Non-finite numeric value');
    return value;
  }
  const value = read();
  if (index !== tokens.length || !Array.isArray(value)) throw new Error('Expected one numeric list');
  return value;
}

export function parseLineReport(text) {
  const lines = text.trim().split(/\r?\n/);
  const begin = /^BEGIN (line-behavior|line-validation|ran-float|point-behavior)$/.exec(lines[0]);
  if (!begin || lines.at(-1) !== `END ${begin[1]}`) throw new Error('Missing line probe checkpoints');
  const cases = [];
  const globals = [];
  let pending = null;
  let seed;
  for (const line of lines.slice(1, -1)) {
    let match = /^GLOBAL "([A-Z0-9*-]+)" value=(\S+) type=(\S+)$/.exec(line);
    if (match) {
      if (pending) throw new Error('Global interrupts pending call');
      globals.push({ name: match[1], value: readNumericList(`(${match[2]})`)[0], type: match[3], raw: match[2] });
      if (match[1] === 'SEED') seed = globals.at(-1).value;
      continue;
    }
    match = /^TRY "([A-Z-]+)" args=(\(.*\))$/.exec(line);
    if (match) {
      if (pending) throw new Error('Missing result before next call');
      pending = { name: match[1], args: readNumericList(match[2]), argsText: match[2] };
      if (seed !== undefined) pending.seed = seed;
      continue;
    }
    match = /^(RESULT|ERROR) "([A-Z-]+)" (.*)$/.exec(line);
    if (!match || !pending || pending.name !== match[2]) throw new Error(`Unexpected line result: ${line}`);
    if (match[1] === 'ERROR') cases.push({ ...pending, error: match[3] });
    else {
      if (!match[3].startsWith('values=')) throw new Error('Missing result values');
      const valuesText = match[3].slice(7);
      cases.push({ ...pending, values: readNumericList(valuesText), valuesText });
    }
    pending = null;
  }
  if (pending || !cases.length) throw new Error('Incomplete or empty line report');
  return { schemaVersion: 1, probe: begin[1], globals, cases };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [path, runUrl, ...extra] = process.argv.slice(2);
    if (!path || extra.length || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(runUrl ?? '')) {
      throw new Error('Usage: node parse-line-report.mjs REPORT GITHUB_RUN_URL');
    }
    const bytes = readFileSync(path);
    process.stdout.write(`${JSON.stringify({
      ...parseLineReport(bytes.toString('utf8')),
      source: { runUrl, sha256: createHash('sha256').update(bytes).digest('hex') },
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
