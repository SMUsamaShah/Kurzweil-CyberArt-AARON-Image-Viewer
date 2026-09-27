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

function parseArgument(line, lineNumber) {
  const fields = parseFields(line.slice('ARGUMENT '.length), lineNumber);
  return {
    index: parseInteger(required(fields, 'index', lineNumber), 'argument index', lineNumber),
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
    arguments: current.arguments,
    brushId: current.brushId,
    writerStream: current.writerStream,
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
  const writerCalls = [];
  let writerSequenceSummary = null;
  const writerSelectorSummary = [];
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
    if (line.startsWith('WRITER-CALL-ENTER ')) {
      const fields = parseFields(line.slice('WRITER-CALL-ENTER '.length), lineNumber);
      const callIndex = parseInteger(required(fields, 'index', lineNumber), 'writer index', lineNumber);
      if (callIndex !== writerCalls.length) fail(lineNumber, 'writer call indexes must be sequential');
      writerCalls.push({
        index: callIndex,
        ordinal: Object.hasOwn(fields, 'ordinal')
          ? parseInteger(fields.ordinal, 'writer ordinal', lineNumber) : undefined,
        depth: parseInteger(required(fields, 'depth', lineNumber), 'writer depth', lineNumber),
        selector: required(fields, 'selector', lineNumber),
        redraw: required(fields, 'redraw', lineNumber),
        pta: {
          x: required(fields, 'pta-x', lineNumber),
          y: required(fields, 'pta-y', lineNumber),
          vis: required(fields, 'pta-vis', lineNumber),
        },
        ptb: {
          x: required(fields, 'ptb-x', lineNumber),
          y: required(fields, 'ptb-y', lineNumber),
          vis: required(fields, 'ptb-vis', lineNumber),
        },
        ...(Object.hasOwn(fields, 'previous-x') ? {previousBefore: {
          x: fields['previous-x'],
          y: required(fields, 'previous-y', lineNumber),
          vis: required(fields, 'previous-vis', lineNumber),
        }} : {}),
        ...(Object.hasOwn(fields, 'file-size') ? {fileSize: fields['file-size']} : {}),
        enterPosition: required(fields, 'position', lineNumber),
        exitPosition: null,
        status: null,
      });
      continue;
    }
    if (line.startsWith('WRITER-CALL-EXIT ')) {
      const fields = parseFields(line.slice('WRITER-CALL-EXIT '.length), lineNumber);
      const callIndex = parseInteger(required(fields, 'index', lineNumber), 'writer index', lineNumber);
      const call = writerCalls[callIndex];
      const depth = parseInteger(required(fields, 'depth', lineNumber), 'writer depth', lineNumber);
      if (!call || call.depth !== depth || call.exitPosition !== null) {
        fail(lineNumber, 'writer exit has no matching open entry');
      }
      const status = required(fields, 'status', lineNumber);
      if (status !== 'SUCCESS' && status !== 'ERROR') fail(lineNumber, 'invalid writer status');
      call.status = status;
      call.exitPosition = required(fields, 'position', lineNumber);
      if (Object.hasOwn(fields, 'previous-x')) {
        call.previousAfter = {
          x: fields['previous-x'],
          y: required(fields, 'previous-y', lineNumber),
          vis: required(fields, 'previous-vis', lineNumber),
        };
      }
      continue;
    }
    if (line.startsWith('WRITER-CALL-ARG ')) {
      const fields = parseFields(line.slice('WRITER-CALL-ARG '.length), lineNumber);
      const callIndex = parseInteger(required(fields, 'index', lineNumber), 'writer index', lineNumber);
      const slot = parseInteger(required(fields, 'slot', lineNumber), 'writer argument slot', lineNumber);
      const call = writerCalls[callIndex];
      if (!call || call.exitPosition !== null || slot >= 8) {
        fail(lineNumber, 'writer argument has no matching open call');
      }
      call.arguments ??= [];
      if (slot !== call.arguments.length) fail(lineNumber, 'writer argument slots must be sequential');
      call.arguments.push({
        slot,
        type: required(fields, 'type', lineNumber),
        summary: required(fields, 'summary', lineNumber),
        x: required(fields, 'x', lineNumber),
        y: required(fields, 'y', lineNumber),
        vis: required(fields, 'vis', lineNumber),
      });
      continue;
    }
    if (line.startsWith('WRITER-SEQUENCE-SUMMARY ')) {
      if (writerSequenceSummary) fail(lineNumber, 'duplicate writer sequence summary');
      const fields = parseFields(line.slice('WRITER-SEQUENCE-SUMMARY '.length), lineNumber);
      writerSequenceSummary = {
        total: parseInteger(required(fields, 'total', lineNumber), 'writer total', lineNumber),
        recorded: parseInteger(required(fields, 'recorded', lineNumber), 'writer recorded', lineNumber),
        limit: parseInteger(required(fields, 'limit', lineNumber), 'writer limit', lineNumber),
      };
      continue;
    }
    if (line.startsWith('WRITER-SELECTOR-SUMMARY ')) {
      const fields = parseFields(line.slice('WRITER-SELECTOR-SUMMARY '.length), lineNumber);
      const selector = required(fields, 'selector', lineNumber);
      if (writerSelectorSummary.some((row) => row.selector === selector)) {
        fail(lineNumber, 'duplicate writer selector summary');
      }
      writerSelectorSummary.push({
        selector,
        count: parseInteger(required(fields, 'count', lineNumber), 'writer selector count', lineNumber),
        firstOrdinal: parseInteger(required(fields, 'first-ordinal', lineNumber), 'writer selector first ordinal', lineNumber),
      });
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
      current = {
        label: match[1], rows: [], arguments: [], brushId: null,
        writerStream: null,
        planAccessorsSkipped: false, planReason: null,
      };
      continue;
    }
    if (line.startsWith('BINDING ')) {
      if (!current) fail(lineNumber, 'binding outside snapshot');
      const row = parseBinding(line, lineNumber);
      if (current.rows.some(({name}) => name === row.name)) fail(lineNumber, 'duplicate binding row');
      current.rows.push(row);
      continue;
    }
    if (line.startsWith('ARGUMENT ')) {
      if (!current) fail(lineNumber, 'argument outside snapshot');
      const argument = parseArgument(line, lineNumber);
      if (argument.index !== current.arguments.length || argument.index >= 8) {
        fail(lineNumber, 'argument indexes must be sequential and capped at eight');
      }
      current.arguments.push(argument);
      continue;
    }
    if (line.startsWith('ARGUMENT-VISPT ')) {
      if (!current) fail(lineNumber, 'VISPT detail outside snapshot');
      const fields = parseFields(line.slice('ARGUMENT-VISPT '.length), lineNumber);
      const argumentIndex = parseInteger(required(fields, 'index', lineNumber), 'VISPT index', lineNumber);
      const argument = current.arguments[argumentIndex];
      if (!argument || argument.vispt || argument.visptError) {
        fail(lineNumber, 'VISPT detail has no preceding argument or is duplicate');
      }
      argument.vispt = {
        x: required(fields, 'x', lineNumber),
        y: required(fields, 'y', lineNumber),
        vis: required(fields, 'vis', lineNumber),
      };
      continue;
    }
    match = /^ARGUMENT-VISPT-ERROR index=(\d+)$/.exec(line);
    if (match) {
      if (!current) fail(lineNumber, 'VISPT error outside snapshot');
      const argumentIndex = parseInteger(match[1], 'VISPT error index', lineNumber);
      const argument = current.arguments[argumentIndex];
      if (!argument || argument.vispt || argument.visptError) {
        fail(lineNumber, 'VISPT error has no preceding argument or is duplicate');
      }
      argument.visptError = true;
      continue;
    }
    match = /^ARGUMENT-BRUSH-ID index=(\d+) value=(\S+)$/.exec(line);
    if (match) {
      if (!current) fail(lineNumber, 'argument brush ID outside snapshot');
      const argumentIndex = parseInteger(match[1], 'argument brush ID index', lineNumber);
      if (!current.arguments[argumentIndex] || current.arguments[argumentIndex].brushId) {
        fail(lineNumber, 'argument brush ID has no preceding argument or is duplicate');
      }
      current.arguments[argumentIndex].brushId = match[2];
      continue;
    }
    match = /^BRUSH-ID value=(\S+)$/.exec(line);
    if (match) {
      if (!current) fail(lineNumber, 'brush ID outside snapshot');
      if (current.brushId) fail(lineNumber, 'duplicate brush ID');
      current.brushId = match[1];
      continue;
    }
    if (line.startsWith('WRITER-STREAM ')) {
      if (!current) fail(lineNumber, 'writer stream outside snapshot');
      if (current.writerStream) fail(lineNumber, 'duplicate writer stream');
      const fields = parseFields(line.slice('WRITER-STREAM '.length), lineNumber);
      current.writerStream = {
        status: required(fields, 'status', lineNumber),
        type: required(fields, 'type', lineNumber),
        output: required(fields, 'output', lineNumber),
        position: required(fields, 'position', lineNumber),
      };
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
  if (writerCalls.some(({exitPosition}) => exitPosition === null)) {
    throw new Error('Writer sequence has an unclosed call');
  }
  if (writerCalls.length && (!writerSequenceSummary
      || writerSequenceSummary.recorded !== writerCalls.length
      || writerSequenceSummary.recorded > writerSequenceSummary.limit
      || writerSequenceSummary.total < writerSequenceSummary.recorded)) {
    throw new Error('Writer sequence summary does not match calls');
  }
  if (writerSelectorSummary.length && writerSelectorSummary.reduce((sum, row) => sum + row.count, 0)
      !== writerSequenceSummary?.total) {
    throw new Error('Writer selector counts do not match total calls');
  }
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
    writerCalls,
    writerSequenceSummary,
    ...(writerSelectorSummary.length ? {writerSelectorSummary} : {}),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [path, origin, ...extra] = process.argv.slice(2);
    const githubRun = /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(origin ?? '');
    const localRun = /^local:[a-z0-9][a-z0-9-]{0,63}$/.exec(origin ?? '');
    if (!path || extra.length || (!githubRun && !localRun)) {
      throw new Error('Usage: node parse-scene-state-report.mjs REPORT GITHUB_RUN_URL|local:RUN_ID');
    }
    const bytes = readFileSync(path);
    const report = parseSceneStateReport(bytes.toString('utf8'));
    process.stdout.write(`${JSON.stringify({
      ...report,
      source: {
        ...(githubRun ? {runUrl: origin} : {localRunId: localRun[0].slice('local:'.length)}),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
