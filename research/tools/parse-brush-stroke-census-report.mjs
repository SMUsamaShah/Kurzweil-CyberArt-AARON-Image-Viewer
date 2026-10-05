#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { sha256 } from './index-allegro-image.mjs';

const MAX_REPORT_BYTES = 64 * 1024 * 1024;
const INSTALL_ORDER = [
  'IN-SUB-FRAME', 'X', 'Y', 'CORE',
  'BRUSH-STROKE', 'SCREEN-AND-STORE', 'CLEAR-FILL-MAP',
];
const COUNT_FIELDS = [
  ['PREDICATES', 'predicates'], ['SCREEN-PREDICATES', 'screenPredicates'],
  ['ACCEPTED', 'accepted'], ['REJECTED', 'rejected'], ['SCREENS', 'screens'],
  ['X-READS', 'xReads'], ['Y-READS', 'yReads'], ['CORE-READS', 'coreReads'],
];

const assert = (ok, message) => { if (!ok) throw new Error(message); };

function exactKeys(object, expected, label) {
  assert(Object.keys(object).length === expected.length
    && expected.every((key) => Object.hasOwn(object, key)), `${label} fields differ`);
  return object;
}

function fields(line, name, expected) {
  return exactKeys(parseLispRecord(line, name), expected, name);
}

function plist(value, expected, label) {
  assert(value === null || Array.isArray(value), `${label} must be a plist`);
  const values = value ?? [];
  assert(values.length % 2 === 0, `${label} has an odd property count`);
  const output = Object.create(null);
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    assert(key?.kind === 'keyword' && !Object.hasOwn(output, key.name), `${label} has an invalid or duplicate key`);
    output[key.name] = values[index + 1];
  }
  return exactKeys(output, expected, label);
}

function list(value, label) {
  assert(value === null || Array.isArray(value), `${label} must be a proper list`);
  return value ?? [];
}

function integer(value, label, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  assert(value?.kind === 'number' && /^[+-]?\d+$/.test(value.raw)
    && Number.isSafeInteger(value.value) && value.value >= min && value.value <= max,
  `${label} must be a bounded raw integer`);
  return value.value;
}

function keyword(value, expected, label) {
  assert(value?.kind === 'keyword' && value.name === expected, `${label} must be :${expected}`);
}

function string(value, label) {
  assert(value?.kind === 'string' && value.value.length > 0, `${label} must be a nonempty string`);
  return value.value;
}

function parseCore(value, label) {
  const offsets = list(value, label);
  assert(offsets.length <= 10000, `${label} exceeds the probe's list cap`);
  return offsets.map((offset, index) => {
    const pair = list(offset, `${label} offset ${index}`);
    assert(pair.length === 2, `${label} offset ${index} must contain exactly two integers`);
    return [integer(pair[0], `${label} offset ${index} x`),
      integer(pair[1], `${label} offset ${index} y`)];
  });
}

function parseResult(value, callId) {
  return list(value, `CALL ${callId} values`).map((descriptor, index) => {
    const item = list(descriptor, `CALL ${callId} value ${index}`);
    assert(item.length >= 1, `CALL ${callId} value ${index} has no tag`);
    if (item.length === 1) {
      keyword(item[0], 'NIL', `CALL ${callId} value ${index} tag`);
      return { kind: 'nil' };
    }
    if (item.length === 2 && item[0]?.kind === 'keyword' && item[0].name === 'INTEGER') {
      return { kind: 'integer', value: integer(item[1], `CALL ${callId} integer result`) };
    }
    if (item.length === 2 && item[0]?.kind === 'keyword' && item[0].name === 'OBJECT') {
      return { kind: 'object', type: string(item[1], `CALL ${callId} object result type`) };
    }
    throw new Error(`CALL ${callId} value ${index} has an unsupported result descriptor`);
  });
}

function dimensions(value, label) {
  const items = list(value, label);
  assert(items.length === 2, `${label} must have rank two`);
  const width = integer(items[0], `${label} width`, 1, 153600);
  const height = integer(items[1], `${label} height`, 1, 153600);
  assert(width * height <= 153600, `${label} exceeds the map cell cap`);
  return [width, height];
}

function parseCounts(value, callId) {
  const p = plist(value, COUNT_FIELDS.map(([field]) => field), `CALL ${callId} counts`);
  const result = Object.create(null);
  for (const [field, key] of COUNT_FIELDS) result[key] = integer(p[field], `CALL ${callId} ${field}`, 0);
  assert(result.predicates + result.screenPredicates === result.accepted + result.rejected,
    `CALL ${callId} predicate outcome totals differ`);
  return result;
}

export function parseBrushStrokeCensusReport(source) {
  assert(Buffer.byteLength(source, 'utf8') <= MAX_REPORT_BYTES, 'Report exceeds byte cap');
  const lines = source.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  assert(lines[0] === 'BEGIN brush-stroke-census v1'
    && lines.at(-1) === 'END brush-stroke-census v1', 'Incomplete census framing');
  assert(lines.length >= 11, 'Census report is too short');

  const caps = fields(lines[1], 'CAPS', ['calls', 'path', 'values']);
  assert(integer(caps.calls, 'calls cap', 1, 50000) === 50000
    && integer(caps.path, 'path cap', 1, 10000) === 10000
    && integer(caps.values, 'values cap', 1, 16) === 16, 'Census caps differ');

  const installs = [];
  for (let index = 0; index < INSTALL_ORDER.length; index += 1) {
    const p = fields(lines[index + 2], 'INSTALL', ['name', 'type']);
    const name = string(p.name, 'INSTALL name');
    assert(name === INSTALL_ORDER[index], `INSTALL order differs at ${index}`);
    installs.push({ name, type: string(p.type, `INSTALL ${name} type`) });
  }
  assert(lines[2 + INSTALL_ORDER.length] === 'READY', 'Missing READY after installations');

  const brushes = [];
  const brushByIndex = new Map();
  const calls = [];
  let current = null;
  let complete = null;
  const localSums = { predicates: 0, screenPredicates: 0, accepted: 0, rejected: 0,
    screens: 0, xReads: 0, yReads: 0, coreReads: 0 };

  for (const line of lines.slice(3 + INSTALL_ORDER.length, -1)) {
    assert(!complete, 'Records appear after COMPLETE');

    if (line.startsWith('BRUSH ')) {
      assert(!current, 'BRUSH record appears inside a stroke');
      assert(brushes.length < 1000, 'BRUSH record cap exceeded');
      const p = fields(line, 'BRUSH', ['index', 'type', 'core']);
      const index = p.index === null ? null : integer(p.index, 'BRUSH index', 0, 6);
      const type = string(p.type, 'BRUSH type');
      const core = parseCore(p.core, `BRUSH ${index ?? 'unindexed'} CORE`);
      if (index !== null) {
        assert(!brushByIndex.has(index), `Duplicate BRUSH index ${index}`);
        const brush = { index, type, core };
        brushByIndex.set(index, brush);
        brushes.push(brush);
      } else brushes.push({ index, type, core });
    } else if (line.startsWith('CALL ')) {
      assert(!current, 'Nested CALL record');
      const p = fields(line, 'CALL', ['id', 'before']);
      const id = integer(p.id, 'CALL id', 1, 50000);
      assert(id === calls.length + 1, 'CALL sequence is not contiguous');
      const before = plist(p.before,
        ['PATH-LENGTH', 'VALUE', 'CDEX', 'SDEX', 'BRUSH-INDEX', 'BRUSH-TYPE', 'MAP-DIMENSIONS'],
        `CALL ${id} before`);
      const pathLength = integer(before['PATH-LENGTH'], `CALL ${id} path length`, 0, 10000);
      const value = integer(before.VALUE, `CALL ${id} value`, 0, 15);
      const cdex = integer(before.CDEX, `CALL ${id} CDEX`);
      const sdex = integer(before.SDEX, `CALL ${id} SDEX`);
      const brushIndex = before['BRUSH-INDEX'] === null
        ? null : integer(before['BRUSH-INDEX'], `CALL ${id} brush index`, 0, 6);
      const brushType = string(before['BRUSH-TYPE'], `CALL ${id} brush type`);
      const mapDimensions = dimensions(before['MAP-DIMENSIONS'], `CALL ${id} map dimensions`);
      if (brushIndex !== null) {
        const brush = brushByIndex.get(brushIndex);
        assert(brush && brush.type === brushType, `CALL ${id} brush lacks a matching complete CORE record`);
      } else assert(brushType === 'NULL', `CALL ${id} has a non-NULL brush that cannot be joined to a CORE record`);
      current = { id, pathLength, value, cdex, sdex, brushIndex, brushType, mapDimensions };
      calls.push(current);
    } else if (line.startsWith('RETURN ')) {
      const p = fields(line, 'RETURN', ['id', 'values', 'counts']);
      assert(current, 'RETURN without a CALL');
      const id = integer(p.id, 'RETURN id', 1, 50000);
      assert(id === current.id, 'RETURN does not match the active CALL');
      current.values = parseResult(p.values, id);
      assert(current.values.length <= 16, `CALL ${id} exceeds result value cap`);
      current.counts = parseCounts(p.counts, id);
      for (const [key, value] of Object.entries(current.counts)) {
        const total = localSums[key] + value;
        assert(Number.isSafeInteger(total), `In-stroke ${key} total exceeds safe integer range`);
        localSums[key] = total;
      }
      current = null;
    } else if (line.startsWith('COMPLETE ')) {
      assert(!current, 'COMPLETE while a CALL is active');
      const p = fields(line, 'COMPLETE', ['main', 'calls', 'clears', 'screens', 'predicates',
        'x-reads', 'y-reads', 'core-reads', 'checks', 'errors', 'aborts', 'overflow', 'active']);
      keyword(p.main, 'NORMAL', 'COMPLETE main');
      const totals = Object.create(null);
      for (const key of ['calls', 'clears', 'screens', 'predicates', 'x-reads', 'y-reads',
        'core-reads', 'checks', 'errors', 'aborts']) {
        totals[key] = integer(p[key], `COMPLETE ${key}`, 0);
      }
      assert(totals.calls > 0 && totals.calls === calls.length
        && totals.checks === totals.calls, 'COMPLETE call/check totals differ');
      assert(totals.errors === 0 && totals.aborts === 0 && p.overflow === null && p.active === null,
        'Census contains errors, aborts, overflow or active work');
      assert(totals.screens >= localSums.screens
        && totals.predicates >= localSums.predicates + localSums.screenPredicates
        && totals['x-reads'] >= localSums.xReads
        && totals['y-reads'] >= localSums.yReads
        && totals['core-reads'] >= localSums.coreReads,
      'Global reader/predicate/screen counters are below in-stroke totals');
      complete = { ...totals, localSums };
    } else {
      throw new Error(`Unsupported or rejected census record: ${line.slice(0, 120)}`);
    }
  }

  assert(complete && !current && calls.every((call) => Array.isArray(call.values) && call.counts),
    'Missing COMPLETE or unmatched CALL');
  return {
    schemaVersion: 1,
    sourceSha256: sha256(Buffer.from(source, 'utf8')),
    caps: { calls: 50000, path: 10000, values: 16, reportBytes: MAX_REPORT_BYTES },
    installs,
    brushes,
    calls,
    complete,
    interpretation: 'Natural observations only; path length and return behavior are retained per call without assuming a zero/nonzero-path rule.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, ...extra] = process.argv.slice(2);
  assert(input && output && extra.length === 0,
    'Usage: node parse-brush-stroke-census-report.mjs <report.txt> <fresh.json>');
  const raw = readFileSync(input);
  assert(raw.byteLength <= MAX_REPORT_BYTES, 'Report exceeds byte cap');
  const report = parseBrushStrokeCensusReport(raw.toString('utf8'));
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output, calls: report.calls.length, brushes: report.brushes.length, complete: report.complete }));
}
