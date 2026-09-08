import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const REQUIRED_TARGETS = new Set(['RPARSE', 'DRAW-CFORM', 'SCREEN-AND-STORE']);
const STATE_NAMES = [
  'MPLAN', 'SCRIPT', 'SDEX', 'FIGDEX', 'CFLIST', 'IDLIST', 'CFRAME',
  'COMPLAN', 'RPLANE', 'PLACES', 'BRUSH', 'FILL-MAP', 'RGB-MAP',
  'COLORDEX', 'PREFS',
];

function fail(lineNumber, message) {
  throw new Error(`Line ${lineNumber}: ${message}`);
}

function parseFields(text, lineNumber) {
  const fields = {};
  for (const token of text.trim().split(/\s+/)) {
    if (!token) continue;
    const match = /^([A-Za-z][A-Za-z0-9-]*)=(\S+)$/.exec(token);
    if (!match) fail(lineNumber, `malformed field ${token}`);
    if (Object.hasOwn(fields, match[1])) fail(lineNumber, `duplicate field ${match[1]}`);
    fields[match[1]] = match[2];
  }
  return fields;
}

function required(fields, name, lineNumber) {
  if (!Object.hasOwn(fields, name)) fail(lineNumber, `missing field ${name}`);
  return fields[name];
}

function parseInteger(value, name, lineNumber) {
  if (!/^[0-9]+$/.test(value)) fail(lineNumber, `invalid ${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(lineNumber, `invalid ${name}`);
  return parsed;
}

function parseBound(value, lineNumber) {
  if (value === 'T') return true;
  if (value === 'NIL') return false;
  if (value === 'UNKNOWN') return null;
  fail(lineNumber, `invalid bound state ${value}`);
}

function parseTarget(line, lineNumber) {
  const fields = parseFields(line.slice('TARGET-INSTALLED '.length), lineNumber);
  return {
    name: required(fields, 'name', lineNumber),
    actualPackage: required(fields, 'actual-package', lineNumber),
    actualName: required(fields, 'actual-name', lineNumber),
    kind: required(fields, 'kind', lineNumber),
  };
}

function parseBinding(line, lineNumber) {
  const fields = parseFields(line.slice('BINDING '.length), lineNumber);
  const name = required(fields, 'name', lineNumber);
  if (!STATE_NAMES.includes(name)) fail(lineNumber, `unknown binding ${name}`);
  return {
    name,
    requestedPackage: required(fields, 'requested-package', lineNumber),
    packageStatus: required(fields, 'package-status', lineNumber),
    symbolStatus: required(fields, 'symbol-status', lineNumber),
    actualPackage: required(fields, 'actual-package', lineNumber),
    actualName: required(fields, 'actual-name', lineNumber),
    bound: parseBound(required(fields, 'bound', lineNumber), lineNumber),
    type: required(fields, 'type', lineNumber),
    summary: required(fields, 'summary', lineNumber),
  };
}

function finalizeSnapshot(current, label, rows, lineNumber) {
  if (!current) fail(lineNumber, 'snapshot end without snapshot begin');
  if (current.label !== label) fail(lineNumber, 'mismatched snapshot label');
  if (current.rows.length !== rows) fail(lineNumber, `snapshot row count is ${current.rows.length}, expected ${rows}`);
  if (rows !== STATE_NAMES.length) fail(lineNumber, `snapshot must contain ${STATE_NAMES.length} binding rows`);
  if (current.rows.length !== new Set(current.rows.map(({name}) => name)).size) {
    fail(lineNumber, 'duplicate binding row');
  }
  if (!STATE_NAMES.every((name) => current.rows.some((row) => row.name === name))) {
    fail(lineNumber, 'snapshot is missing a required binding');
  }
  if (!current.planAccessorsSkipped) fail(lineNumber, 'missing PLAN accessor decision');
  return {
    label: current.label,
    rows: current.rows,
    planAccessors: {skipped: true, reason: current.planReason},
  };
}

/**
 * Parse the bounded scene-state companion report without evaluating or
 * interpreting any Lisp values.  The report contains sanitized key/value
 * summaries only; this parser preserves those summaries verbatim.
 */
export function parseSceneStateReport(text) {
  if (typeof text !== 'string') throw new TypeError('scene-state report must be text');
  const lines = text.split(/\r?\n/);
  let phase = 'outside';
  let sourceEntered = false;
  let traceLoaded = false;
  let probeReady = false;
  let ready = null;
  const targets = [];
  const boundaries = [];
  const snapshots = [];
  const nonObservations = [];
  let current = null;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (!line) continue;
    if (line === 'BEGIN scene-state-snapshot') {
      if (phase !== 'outside') fail(lineNumber, 'unexpected begin checkpoint');
      phase = 'body';
      continue;
    }
    if (line === 'END scene-state-snapshot') {
      if (phase !== 'body') fail(lineNumber, 'unexpected end checkpoint');
      if (current) fail(lineNumber, 'unterminated snapshot');
      phase = 'done';
      continue;
    }
    if (phase === 'done') fail(lineNumber, 'content after end checkpoint');
    if (phase !== 'body') fail(lineNumber, 'content outside probe');

    if (line === 'SOURCE-ENTERED') {
      if (sourceEntered) fail(lineNumber, 'duplicate SOURCE-ENTERED');
      sourceEntered = true;
      continue;
    }
    if (line === 'TRACE-LOADED') {
      if (traceLoaded) fail(lineNumber, 'duplicate TRACE-LOADED');
      traceLoaded = true;
      continue;
    }
    if (line === 'PROBE-READY') {
      if (probeReady) fail(lineNumber, 'duplicate PROBE-READY');
      probeReady = true;
      continue;
    }
    let match = /^TARGET-INSTALLED (.+)$/.exec(line);
    if (match) {
      const target = parseTarget(line, lineNumber);
      if (targets.some(({name}) => name === target.name)) fail(lineNumber, 'duplicate target');
      targets.push(target);
      continue;
    }
    if (/^NOT-READY required-targets=\d+ installed-targets=\d+ main-installed=(?:T|NIL)$/.test(line)) {
      continue;
    }
    match = /^READY required-targets=(\d+) installed-targets=(\d+)$/.exec(line);
    if (match) {
      if (ready) fail(lineNumber, 'duplicate READY');
      ready = {
        requiredTargets: parseInteger(match[1], 'required target count', lineNumber),
        installedTargets: parseInteger(match[2], 'installed target count', lineNumber),
      };
      continue;
    }
    match = /^BOUNDARY label=(\S+)$/.exec(line);
    if (match) {
      if (boundaries.includes(match[1])) fail(lineNumber, 'duplicate boundary');
      boundaries.push(match[1]);
      continue;
    }
    match = /^BOUNDARY-NOT-OBSERVED label=(\S+) reason=(\S+)$/.exec(line);
    if (match) {
      if (nonObservations.some(({label}) => label === match[1])) {
        fail(lineNumber, 'duplicate non-observation');
      }
      nonObservations.push({label: match[1], reason: match[2]});
      continue;
    }
    match = /^SNAPSHOT-BEGIN label=(\S+)$/.exec(line);
    if (match) {
      if (current) fail(lineNumber, 'nested snapshot');
      if (snapshots.some(({label}) => label === match[1])) fail(lineNumber, 'duplicate snapshot');
      current = {label: match[1], rows: [], planAccessorsSkipped: false, planReason: null};
      continue;
    }
    if (line.startsWith('BINDING ')) {
      if (!current) fail(lineNumber, 'binding outside snapshot');
      const row = parseBinding(line, lineNumber);
      if (current.rows.some(({name}) => name === row.name)) fail(lineNumber, 'duplicate binding row');
      current.rows.push(row);
      continue;
    }
    match = /^PLAN-ACCESSORS-SKIPPED reason=(\S+)$/.exec(line);
    if (match) {
      if (!current) fail(lineNumber, 'PLAN decision outside snapshot');
      if (current.planAccessorsSkipped) fail(lineNumber, 'duplicate PLAN decision');
      current.planAccessorsSkipped = true;
      current.planReason = match[1];
      continue;
    }
    match = /^SNAPSHOT-END label=(\S+) rows=(\d+)$/.exec(line);
    if (match) {
      const snapshot = finalizeSnapshot(
        current, match[1], parseInteger(match[2], 'snapshot row count', lineNumber), lineNumber,
      );
      snapshots.push(snapshot);
      current = null;
      continue;
    }
    if (/^PRE-RPARSE-BOUNDARY name=\S+$/.test(line)) continue;
    if (/^TARGET-(?:MISSING|UNBOUND) name=\S+$/.test(line)) continue;
    if (/^TARGET-INSTALL-ERROR name=\S+ type=\S+$/.test(line)) continue;
    if (/^TARGET-ERROR name=\S+ type=\S+$/.test(line)) continue;
    if (/^SNAPSHOT-ERROR label=\S+$/.test(line)) continue;
    fail(lineNumber, `unrecognized scene-state record ${line}`);
  }

  if (phase !== 'done') throw new Error('Truncated scene-state report');
  if (!sourceEntered) throw new Error('Missing SOURCE-ENTERED marker');
  if (!traceLoaded) throw new Error('Missing TRACE-LOADED marker');
  if (!probeReady) throw new Error('Missing PROBE-READY marker');
  if (!ready || ready.requiredTargets !== 3) throw new Error('Invalid READY marker');
  const installedRequired = [...REQUIRED_TARGETS].every((name) => (
    targets.some((target) => target.name === name)
  ));
  if (!installedRequired || ready.installedTargets < 3) {
    throw new Error('Required target installation is incomplete');
  }
  if (snapshots.some(({label}) => !boundaries.includes(label))) {
    throw new Error('Snapshot has no matching boundary');
  }
  if (current) throw new Error('Unclosed snapshot');
  return {
    schemaVersion: 1,
    sourceEntered,
    traceLoaded,
    probeReady,
    ready,
    targets,
    boundaries,
    nonObservations,
    snapshots,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [path, runUrl, ...extra] = process.argv.slice(2);
    if (!path || extra.length || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(runUrl ?? '')) {
      throw new Error('Usage: node parse-scene-state-report.mjs REPORT GITHUB_RUN_URL');
    }
    const bytes = readFileSync(path);
    const report = parseSceneStateReport(bytes.toString('utf8'));
    process.stdout.write(`${JSON.stringify({
      ...report,
      source: {runUrl, sha256: createHash('sha256').update(bytes).digest('hex')},
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
