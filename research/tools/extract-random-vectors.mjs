import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Convert our own probe's numeric records without evaluating Lisp reader forms.
function number(token) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[efd][+-]?\d+)?$/i.test(token)) {
    throw new Error(`Unsupported numeric token: ${token}`);
  }
  const value = Number(token.replace(/[fd]/i, 'e'));
  if (!Number.isFinite(value)) throw new Error(`Non-finite token: ${token}`);
  return value;
}

const [path, runUrl, probe] = process.argv.slice(2);
if (!path || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(runUrl)
  || !['random-reference', 'random-validation'].includes(probe)) {
  throw new Error('Usage: node extract-random-vectors.mjs REPORT GITHUB_RUN_URL PROBE');
}
const bytes = readFileSync(path);
const lines = bytes.toString('utf8').trim().split(/\r?\n/);
if (lines[0] !== `BEGIN ${probe}` || lines.at(-1) !== `END ${probe}`) {
  throw new Error('Missing probe completion checkpoints');
}
const vectors = [];
const errors = [];
let pending = false;
for (const line of lines.slice(1, -1)) {
  if (line.startsWith('TRY ')) {
    if (pending) throw new Error('Missing result before next checkpoint');
    pending = true;
    continue;
  }
  if (!pending) throw new Error('Result without a TRY checkpoint');
  if (line.includes('ERROR ')) {
    errors.push(line);
  } else {
    const match = /^(VECTOR|LONG|RAN) seed=(-?\d+) (?:limit=(\S+) type=(\S+)|bounds=\(([^)]*)\)) values=\(([^)]*)\)$/.exec(line);
    if (!match) throw new Error(`Malformed vector: ${line.slice(0, 100)}`);
    const [, kind, seed, limit, type, bounds, body] = match;
    const tokens = body.trim().split(/\s+/);
    const values = tokens.map(number);
    const expectedLength = kind === 'LONG' ? 1300 : probe === 'random-reference' ? 20 : 32;
    if (values.length !== expectedLength) throw new Error('Incorrect vector length');
    vectors.push({
      kind, seed: number(seed),
      ...(bounds ? { bounds: bounds.split(/\s+/).map(number),
        boundType: bounds.includes('.') ? 'SINGLE-FLOAT' : 'FIXNUM' }
        : { limit: number(limit), type }),
      values,
    });
  }
  pending = false;
}
if (pending || vectors.length === 0) throw new Error('Incomplete or empty result set');
process.stdout.write(`${JSON.stringify({
  source: { runUrl, probe, sha256: createHash('sha256').update(bytes).digest('hex') },
  errors, vectors,
}, null, 2)}\n`);
