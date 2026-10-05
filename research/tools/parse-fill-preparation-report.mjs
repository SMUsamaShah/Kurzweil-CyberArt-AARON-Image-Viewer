#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { sha256 } from './index-allegro-image.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const names = ['SET-MEDIANS', 'GOOD-START', 'FILL-STRATEGY'];
const list = (value) => { assert(value === null || Array.isArray(value), 'Expected a proper data list'); return value ?? []; };
const integer = (value, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => {
  assert(value?.kind === 'number' && /^[+-]?\d+$/.test(value.raw) && Number.isSafeInteger(value.value)
    && value.value >= min && value.value <= max, 'Expected a bounded raw integer'); return value.value;
};
const string = (value) => { assert(value?.kind === 'string', 'Expected a string'); return value.value; };
const keyword = (value, name) => value?.kind === 'keyword' && value.name === name;
function keys(value, expected, label) {
  assert(Object.keys(value).length === expected.length && expected.every((k) => Object.hasOwn(value, k)), `${label} fields differ`);
  return value;
}
function fields(line, prefix, expected) { return keys(parseLispRecord(line, prefix), expected, prefix); }
function plist(value, expected, label) {
  const p = list(value), out = {};
  assert(p.length % 2 === 0, `Malformed ${label} property list`);
  for (let i = 0; i < p.length; i += 2) {
    assert(p[i]?.kind === 'keyword' && !Object.hasOwn(out, p[i].name), `Duplicate or invalid ${label} key`);
    out[p[i].name] = p[i + 1];
  }
  return keys(out, expected, label);
}
function binding(value) {
  const p = list(value);
  if (p[1] === true) return { bound: true, value: integer(plist(value, ['BOUND', 'VALUE'], 'binding').VALUE) };
  assert(plist(value, ['BOUND'], 'unbound binding').BOUND === null, 'Invalid unbound marker');
  return { bound: false };
}
function outline(value, caps) {
  const p = plist(value, ['LENGTH', 'COMPLETE', 'POINTS'], 'outline');
  const length = integer(p.LENGTH, 0, caps.listPoints), rows = list(p.POINTS);
  assert(p.COMPLETE === true && rows.length === length, 'Incomplete outline');
  const byId = new Map();
  const points = rows.map((row) => {
    assert(Array.isArray(row) && row.length === 4, 'Malformed point');
    const point = { id: integer(row[0], 1), type: string(row[1]), x: integer(row[2]), y: integer(row[3]) };
    if (byId.has(point.id)) assert(JSON.stringify(point) === JSON.stringify(byId.get(point.id)), 'One identity has conflicting coordinates');
    byId.set(point.id, point); return point;
  });
  return { length, points };
}
function map(value, points, lo, hi, caps) {
  const p = plist(value, ['TYPE', 'DIMENSIONS', 'ELEMENT-TYPE', 'REGION', 'CELLS', 'COVERED', 'RUNS', 'COMPLETE', 'ROWS'], 'map');
  const dims = list(p.DIMENSIONS), element = list(p['ELEMENT-TYPE']), bounds = list(p.REGION);
  assert(dims.length === 2 && element.length === 2 && element[0]?.name === 'UNSIGNED-BYTE'
    && integer(element[1]) === 4 && bounds.length === 5 && p.COMPLETE === true, 'Map type or completion differs');
  const width = integer(dims[0], 1, 16384), height = integer(dims[1], 1, 16384);
  const type = string(p.TYPE);
  assert(type === `(ARRAY (UNSIGNED-BYTE 4) (${width} ${height}))`, 'Map type string differs from storage declaration');
  assert(width * height <= 16777216 && lo.bound && hi.bound, 'Map allocation or median input differs');
  const [x0, x1, y0, y1, declaredCells] = bounds.map((v) => integer(v, 0));
  const wanted = points.length ? {
    x0: Math.max(0, Math.min(...points.map((p) => p.x)) - 1), x1: Math.min(width - 1, Math.max(...points.map((p) => p.x)) + 1),
    y0: Math.max(0, Math.min(lo.value, ...points.map((p) => p.y)) - 1),
    y1: Math.min(height - 1, Math.max(hi.value, ...points.map((p) => p.y)) + 1),
  } : { x0: 0, x1: width - 1, y0: 0, y1: height - 1 };
  assert(JSON.stringify({ x0, x1, y0, y1 }) === JSON.stringify(wanted) && x0 <= x1 && y0 <= y1
    && x1 < width && y1 < height && points.every((p) => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height), 'Captured region differs from outline/medians');
  const rowWidth = x1 - x0 + 1, cells = rowWidth * (y1 - y0 + 1);
  assert(cells === declaredCells && cells === integer(p.CELLS, 1, caps.mapCells) && integer(p.COVERED) === cells, 'Map cell coverage differs');
  let runCount = 0;
  const rows = list(p.ROWS).map((row, index) => {
    assert(Array.isArray(row) && row.length === 3 && keyword(row[1], 'RUNS'), 'Malformed map row');
    const y = integer(row[0]); assert(y === y0 + index, 'Map row order differs');
    const runs = list(row[2]).map((pair) => {
      assert(Array.isArray(pair) && pair.length === 2, 'Malformed RLE pair');
      return [integer(pair[0], 0, 15), integer(pair[1], 1, rowWidth)];
    });
    assert(runs.reduce((n, p) => n + p[1], 0) === rowWidth
      && runs.every((p, i) => !i || p[0] !== runs[i - 1][0]), 'Map row coverage or maximal runs differ');
    runCount += runs.length; return { y, runs };
  });
  assert(rows.length === y1 - y0 + 1 && runCount === integer(p.RUNS, 1, caps.mapRuns), 'Map run/row coverage differs');
  return { type, width, height, region: { x0, x1, y0, y1 }, cells, runCount, rows };
}
function state(value, name, after, caps) {
  const expected = ['LO', 'HI', name === 'SET-MEDIANS' ? 'FRAME' : 'OUTLINE'];
  if (name === 'FILL-STRATEGY') expected.push('MAP');
  if (after) expected.push('OUTLINE-EQ-ENTRY', 'MAP-EQ-ENTRY');
  const p = plist(value, expected, 'state'), result = { lo: binding(p.LO), hi: binding(p.HI) };
  if (name === 'SET-MEDIANS') {
    const f = plist(p.FRAME, ['TYPE', 'LY', 'TY'], 'frame');
    result.frame = { type: string(f.TYPE), ly: integer(f.LY), ty: integer(f.TY) };
  } else result.outline = outline(p.OUTLINE, caps);
  if (name === 'FILL-STRATEGY') result.map = map(p.MAP, result.outline.points, result.lo, result.hi, caps);
  if (after) {
    assert([true, null].includes(p['OUTLINE-EQ-ENTRY']) && p['MAP-EQ-ENTRY'] === true, 'Invalid list/map identity observation');
    result.outlineIdentityPreserved = p['OUTLINE-EQ-ENTRY'] === true;
    result.mapIdentityPreserved = true;
  }
  return result;
}
function returns(value, caps) {
  const values = list(value); assert(values.length <= caps.values, 'Too many return values');
  return values.map((v) => {
    if (v === null) return null;
    if (v?.kind === 'number') return integer(v);
    const p = plist(v, ['LIST-IDS', 'EQ-OUTLINE'], 'list return');
    assert([true, null].includes(p['EQ-OUTLINE']), 'Invalid return identity');
    return { ids: list(p['LIST-IDS']).map((i) => integer(i, 1)), equalsOutline: p['EQ-OUTLINE'] === true };
  });
}

export function parseFillPreparationReport(source) {
  assert(Buffer.byteLength(source) <= 256 * 1024 * 1024, 'Report exceeds byte cap');
  const lines = source.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  assert(lines[0] === 'BEGIN fill-preparation v1' && lines.at(-1) === 'END fill-preparation v1', 'Incomplete report framing');
  const c = fields(lines[1], 'CAPS', ['calls', 'fills', 'list-points', 'total-points', 'map-cells', 'map-runs', 'values']);
  const caps = { calls: integer(c.calls, 1, 2000), fills: integer(c.fills, 1, 500), listPoints: integer(c['list-points'], 1, 10000),
    totalPoints: integer(c['total-points'], 1, 1000000), mapCells: integer(c['map-cells'], 1, 153600), mapRuns: integer(c['map-runs'], 1, 2000000), values: integer(c.values, 1, 16) };
  const installed = {};
  let index = 2;
  for (; lines[index]?.startsWith('INSTALL '); index += 1) {
    const r = fields(lines[index], 'INSTALL', ['name', 'type']), name = string(r.name);
    assert(!Object.hasOwn(installed, name), 'Duplicate install'); installed[name] = string(r.type);
  }
  keys(installed, [...names, 'MY-FILL', 'MAIN'], 'installed');
  assert(names.every((n) => installed[n] === 'COMPILED-FUNCTION') && installed.MAIN === 'COMPILED-FUNCTION'
    && installed['MY-FILL'] === 'STANDARD-GENERIC-FUNCTION' && lines[index++] === 'READY', 'Unexpected installation');
  const fills = [], calls = [], callStack = [], totals = {};
  let active = null, phase = 'calls', pointCount = 0, runCount = 0, complete = false;
  for (const line of lines.slice(index, -1)) {
    assert(!/^(ERROR|OVERFLOW|ABORT)(?:[-\s]|$)/.test(line), 'Observation errors, overflow or aborted capture');
    if (phase === 'calls' && line.startsWith('FILL ')) {
      const r = fields(line, 'FILL', ['id', 'mode', 'cdex', 'sdex']);
      assert(active === null && callStack.length === 0, 'Nested or unfinished fill');
      active = { id: integer(r.id, 1, caps.fills), mode: string(r.mode), cdex: integer(r.cdex, 0), sdex: integer(r.sdex, 0), calls: [] };
      assert(active.id === fills.length + 1 && ['SUBFORM', 'CFORM'].includes(active.mode), 'Unexpected fill order/mode'); fills.push(active);
    } else if (phase === 'calls' && line.startsWith('CALL ')) {
      const r = fields(line, 'CALL', ['id', 'fill', 'name', 'before']), name = string(r.name);
      const id = integer(r.id, 1, caps.calls);
      assert(active && integer(r.fill) === active.id && id === calls.length + 1 && name === names[active.calls.length]
        && callStack.length === 0, 'Unexpected helper order or nesting');
      const call = { id, fill: active.id, name, before: state(r.before, name, false, caps) };
      calls.push(call); active.calls.push(call); callStack.push(call);
    } else if (phase === 'calls' && line.startsWith('RETURN ')) {
      const r = fields(line, 'RETURN', ['id', 'values', 'after']), call = callStack.pop();
      assert(call && integer(r.id) === call.id, 'Unpaired helper return');
      call.values = returns(r.values, caps); call.after = state(r.after, call.name, true, caps);
      for (const s of [call.before, call.after]) {
        pointCount += s.outline?.length ?? 0; runCount += s.map?.runCount ?? 0;
      }
      assert(pointCount <= caps.totalPoints && runCount <= caps.mapRuns, 'Cumulative cap exceeded');
      if (call.name === 'SET-MEDIANS') assert(JSON.stringify(call.before.frame) === JSON.stringify(call.after.frame), 'Frame bounds changed');
      else assert(JSON.stringify(call.before.lo) === JSON.stringify(call.after.lo) && JSON.stringify(call.before.hi) === JSON.stringify(call.after.hi), 'Median bindings changed');
      if (call.name === 'FILL-STRATEGY') assert(call.after.outlineIdentityPreserved
        && JSON.stringify(call.before.outline) === JSON.stringify(call.after.outline)
        && JSON.stringify(call.before.map.region) === JSON.stringify(call.after.map.region), 'Strategy changed its outline/region');
    } else if (phase === 'calls' && line.startsWith('END-FILL ')) {
      const r = fields(line, 'END-FILL', ['id', 'values']);
      assert(active && integer(r.id) === active.id && callStack.length === 0 && active.calls.length === 3, 'Incomplete fill helpers');
      active.values = returns(r.values, caps); active = null;
    } else if ((phase === 'calls' || phase === 'totals') && line.startsWith('TOTAL ')) {
      assert(active === null && callStack.length === 0, 'Unfinished call before totals');
      const r = fields(line, 'TOTAL', ['name', 'calls']), name = string(r.name);
      assert(names.includes(name) && !Object.hasOwn(totals, name), 'Unexpected or duplicate total');
      totals[name] = integer(r.calls, 0, caps.calls); phase = 'totals';
    } else if (phase === 'totals' && line.startsWith('COMPLETE ')) {
      const r = fields(line, 'COMPLETE', ['main', 'calls', 'fills', 'points', 'runs', 'rng-checks', 'errors', 'aborts', 'overflow', 'depth']);
      keys(totals, names, 'totals');
      assert(keyword(r.main, 'NORMAL') && integer(r.calls) === calls.length && integer(r.fills) === fills.length
        && integer(r.points) === pointCount && integer(r.runs) === runCount && integer(r.errors) === 0
        && integer(r['rng-checks']) === calls.length * 2
        && integer(r.aborts) === 0 && r.overflow === null && integer(r.depth) === 0
        && names.every((n) => totals[n] === fills.length), 'Unsuccessful completion or mismatched totals');
      complete = true; phase = 'complete';
    } else throw new Error(`Unexpected report record/phase: ${line.slice(0, 90)}`);
  }
  assert(complete && fills.length > 0 && calls.length === fills.length * 3, 'Incomplete helper capture');
  return { schemaVersion: 1, caps, installed, totals, pointCount, runCount, rngChecks: calls.length * 2, fills, calls };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length) throw new Error('Usage: node parse-fill-preparation-report.mjs <report.txt> <fresh.json>');
  const raw = readFileSync(input), report = parseFillPreparationReport(raw.toString('utf8'));
  report.sourceSha256 = sha256(raw); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output, fills: report.fills.length, totals: report.totals, points: report.pointCount, runs: report.runCount }));
}
