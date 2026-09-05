import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function fail(lineNumber, message) {
  throw new Error(`Line ${lineNumber}: ${message}`);
}

function parseLispString(token, lineNumber) {
  if (!/^"(?:[^"\\]|\\.)*"$/.test(token)) fail(lineNumber, 'malformed string');
  return token.slice(1, -1).replace(/\\(.)/g, '$1');
}

function parseNumber(token, lineNumber) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEfFdDsSlL][+-]?\d+)?$/.test(token)) {
    fail(lineNumber, `malformed numeric summary ${token}`);
  }
  const value = Number(token.replace(/[fFdDsSlL]/, 'e'));
  if (!Number.isFinite(value)) fail(lineNumber, `non-finite numeric summary ${token}`);
  return value;
}

/**
 * Parse the bounded function-constants probe without evaluating Lisp.
 *
 * The report intentionally contains only summaries produced by the probe.
 * Keep both a normalized value and the original summary text so newly
 * observed Allegro types remain inspectable without making this parser a Lisp
 * interpreter.
 */
export function parseFunctionConstants(text) {
  let phase = 'outside';
  let current = null;
  let helpers = null;
  const candidates = [];
  const names = new Set();
  const lines = text.split(/\r?\n/);

  const closeCandidate = (lineNumber) => {
    if (!current) fail(lineNumber, 'result without a TRY checkpoint');
    if (!['constants', 'count-unavailable', 'count-only', 'unavailable', 'error']
      .includes(current.status)) {
      fail(lineNumber, `incomplete candidate ${current.name}`);
    }
    if (current.status !== 'error' && !current.functionType) {
      fail(lineNumber, `missing function record ${current.name}`);
    }
    if (current.status === 'constants' && current.constants.length !== current.count) {
      fail(lineNumber, `incomplete constants for ${current.name}: expected ${current.count}`);
    }
    candidates.push(current);
    current = null;
  };

  const parseSummary = (raw, lineNumber) => {
    const value = raw.trim();
    if (value === 'NIL') return { kind: 'nil', raw: value };
    let match = /^\(:NUMBER\s+([^\s)]+)\)$/.exec(value);
    if (match) return { kind: 'number', value: parseNumber(match[1], lineNumber), raw: value };
    match = /^\(:STRING\s+(\d+)\)$/.exec(value);
    if (match) return { kind: 'string', length: Number(match[1]), raw: value };
    match = /^\(:SYMBOL\s+("(?:[^"\\]|\\.)*"|NIL)\s+("(?:[^"\\]|\\.)*")\)$/.exec(value);
    if (match) {
      return {
        kind: 'symbol',
        package: match[1] === 'NIL' ? null : parseLispString(match[1], lineNumber),
        name: parseLispString(match[2], lineNumber),
        raw: value,
      };
    }
    match = /^\(:((?:LIST|TYPE|ERROR))\s+([^\s)]+)\)$/.exec(value);
    if (match) return { kind: match[1].toLowerCase(), type: match[2], raw: value };
    // The original generic-function dispatch constants use array type
    // specifiers. Preserve their text; never evaluate a Lisp reader form.
    match = /^\(:TYPE (\(SIMPLE-ARRAY [A-Z][A-Z0-9:-]* \(\d+(?: \d+)*\)\))\)$/.exec(value);
    if (match) return { kind: 'type', type: match[1], raw: value };
    fail(lineNumber, `unsupported summary ${value}`);
  };

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (!line.trim()) continue;
    if (line === 'BEGIN function-constants') {
      if (phase !== 'outside') fail(lineNumber, 'unexpected begin checkpoint');
      phase = 'body';
      continue;
    }
    if (line === 'END function-constants') {
      if (phase !== 'body') fail(lineNumber, 'unexpected end checkpoint');
      if (current) closeCandidate(lineNumber);
      phase = 'done';
      continue;
    }
    if (phase !== 'body') fail(lineNumber, 'content outside completed probe');

    let match = /^HELPERS count=(\S+) constant=(\S+)$/.exec(line);
    if (match) {
      if (helpers) fail(lineNumber, 'duplicate HELPERS record');
      if (current || candidates.length) fail(lineNumber, 'HELPERS must precede candidates');
      helpers = { count: match[1], constant: match[2] };
      continue;
    }
    match = /^TRY "([^"\\]+)"$/.exec(line);
    if (match) {
      if (!helpers) fail(lineNumber, 'Missing HELPERS record');
      if (current) closeCandidate(lineNumber);
      if (names.has(match[1])) fail(lineNumber, 'duplicate candidate');
      names.add(match[1]);
      current = { name: match[1], functionType: null, count: null, constants: [], status: 'pending' };
      continue;
    }
    if (!current) fail(lineNumber, 'record before TRY checkpoint');
    match = /^FUNCTION type=(\S+)$/.exec(line);
    if (match) {
      if (current.status !== 'pending') fail(lineNumber, 'unexpected FUNCTION record');
      current.functionType = match[1];
      current.status = 'function';
      continue;
    }
    match = /^COUNT (.+)$/.exec(line);
    if (match) {
      if (!current.functionType) fail(lineNumber, 'missing function record');
      if (current.status !== 'function') fail(lineNumber, 'unexpected COUNT record');
      current.count = match[1] === 'NIL' ? null : parseNumber(match[1], lineNumber);
      if (current.count !== null
        && (!Number.isInteger(current.count) || current.count < 0)) {
        fail(lineNumber, 'constant count must be a non-negative integer');
      }
      current.status = current.count === null
        ? 'count-unavailable'
        : current.count > 256 ? 'count-only' : 'constants';
      continue;
    }
    match = /^CONSTANT (\d+) (.+)$/.exec(line);
    if (match) {
      if (current.status !== 'constants') fail(lineNumber, 'unexpected CONSTANT record');
      const indexValue = Number(match[1]);
      if (indexValue !== current.constants.length) {
        fail(lineNumber, 'constant indexes must be contiguous');
      }
      if (current.count === null || indexValue >= current.count || current.count > 256) {
        fail(lineNumber, 'constant index exceeds bounded count');
      }
      current.constants.push({ index: indexValue, value: parseSummary(match[2], lineNumber) });
      continue;
    }
    match = /^UNAVAILABLE$/.exec(line);
    if (match) {
      if (current.status !== 'function') fail(lineNumber, 'unexpected UNAVAILABLE record');
      current.status = 'unavailable';
      continue;
    }
    match = /^ERROR (.+)$/.exec(line);
    if (match) {
      if (['error', 'unavailable'].includes(current.status)) fail(lineNumber, 'duplicate terminal result');
      current.status = 'error';
      current.errorType = match[1];
      continue;
    }
    fail(lineNumber, `unrecognized report line ${line}`);
  }

  if (phase !== 'done') throw new Error('Truncated function-constants report');
  if (!helpers) throw new Error('Missing HELPERS record');
  if (!candidates.length) throw new Error('No function candidates');
  if (current) throw new Error('Unclosed candidate');
  return { schemaVersion: 1, helpers, candidates };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [path, runUrl, ...extra] = process.argv.slice(2);
    if (!path || extra.length || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(runUrl ?? '')) {
      throw new Error('Usage: node parse-function-constants.mjs REPORT GITHUB_RUN_URL');
    }
    const bytes = readFileSync(path);
    const report = parseFunctionConstants(bytes.toString('utf8'));
    process.stdout.write(`${JSON.stringify({
      ...report,
      source: { runUrl, sha256: createHash('sha256').update(bytes).digest('hex') },
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
