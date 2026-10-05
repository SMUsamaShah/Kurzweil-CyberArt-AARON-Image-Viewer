#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { sha256 } from './index-allegro-image.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const targets = ['CLEAR-FILL-MAP', 'WRITE-LIST-TO-FILL-MAP'];
const parentNames = ['MY-FILL', 'BRUSH-FILL-SUBPART'];
const readerNames = ['CFRAME', 'X', 'Y'];
const list = (v) => { assert(v === null || Array.isArray(v), 'Expected a data list'); return v ?? []; };
const int = (v, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => {
  assert(v?.kind === 'number' && /^[+-]?\d+$/.test(v.raw) && Number.isSafeInteger(v.value)
    && v.value >= min && v.value <= max, 'Expected a bounded raw integer'); return v.value;
};
const str = (v) => { assert(v?.kind === 'string', 'Expected a string'); return v.value; };
const kw = (v, name) => v?.kind === 'keyword' && v.name === name;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function keys(o, expected, label) {
  assert(Object.keys(o).length === expected.length && expected.every((k) => Object.hasOwn(o, k)), `${label} fields differ`); return o;
}
function fields(line, name, expected) { return keys(parseLispRecord(line, name), expected, name); }
function plist(v, expected, label) {
  const p = list(v), o = {};
  assert(p.length % 2 === 0, `Malformed ${label} plist`);
  for (let i = 0; i < p.length; i += 2) {
    assert(p[i]?.kind === 'keyword' && !Object.hasOwn(o, p[i].name), `Invalid or duplicate ${label} key`);
    o[p[i].name] = p[i + 1];
  }
  return keys(o, expected, label);
}
function map(v, caps) {
  const p = plist(v, ['TYPE', 'DIMENSIONS', 'ELEMENT-TYPE', 'CELLS', 'COVERED', 'RUNS', 'COMPLETE', 'ROWS'], 'map');
  const d = list(p.DIMENSIONS), e = list(p['ELEMENT-TYPE']);
  assert(d.length === 2 && e.length === 2 && e[0]?.kind === 'symbol' && e[0].name === 'UNSIGNED-BYTE'
    && int(e[1]) === 4 && p.COMPLETE === true, 'Map type or completion differs');
  const width = int(d[0], 1, 16384), height = int(d[1], 1, 16384), cells = width * height, type = str(p.TYPE);
  assert(type === `(ARRAY (UNSIGNED-BYTE 4) (${width} ${height}))` && cells === int(p.CELLS, 1, caps.mapCells)
    && int(p.COVERED) === cells, 'Map declaration/coverage differs');
  let runCount = 0;
  const rows = list(p.ROWS).map((row, index) => {
    assert(Array.isArray(row) && row.length === 3 && kw(row[1], 'RUNS') && int(row[0]) === index, 'Map row order/shape differs');
    const runs = list(row[2]).map((r) => {
      assert(Array.isArray(r) && r.length === 2, 'Malformed map run'); return [int(r[0], 0, 15), int(r[1], 1, width)];
    });
    assert(runs.reduce((n, r) => n + r[1], 0) === width && runs.every((r, i) => !i || r[0] !== runs[i - 1][0]),
      'Map row coverage/maximal runs differ');
    runCount += runs.length; return { y: index, runs };
  });
  assert(rows.length === height && runCount === int(p.RUNS, 1, caps.mapRuns), 'Map run/row count differs');
  return { type, width, height, cells, runCount, rows };
}
function parentArgs(v, name) {
  const a = list(v);
  if (name === 'MY-FILL') {
    assert(a.length === 3, 'MY-FILL arguments differ'); const mode = str(a[0]);
    assert(['CFORM', 'SUBFORM'].includes(mode), 'Unknown MY-FILL mode');
    return { mode, cdex: int(a[1], 0), sdex: int(a[2], 0) };
  }
  assert(a.length === 2, 'Subpart arguments differ'); return { cdex: int(a[0], 0), sdex: int(a[1], 0) };
}
function callArgs(v, name, caps) {
  if (name === 'CLEAR-FILL-MAP') {
    const a = list(v); assert(a.length === 2, 'Clear arguments differ'); return { cdex: int(a[0], 0), sdex: int(a[1], 0) };
  }
  const p = plist(v, ['LENGTH', 'VALUE', 'ORDER'], 'writer arguments');
  const length = int(p.LENGTH, 0, caps.listPoints), order = list(p.ORDER).map((id) => int(id, 1, caps.listPoints));
  assert(order.length === length, 'Writer list coverage differs');
  return { length, value: int(p.VALUE, 0, 15), order };
}
function readers(v, call, caps) {
  if (call.name === 'CLEAR-FILL-MAP') {
    const p = plist(v, ['TYPE', 'FRAME-CALLS', 'SOURCE', 'BEFORE', 'AFTER'], 'frame readers');
    const result = { type: str(p.TYPE), frameCalls: int(p['FRAME-CALLS'], 1, caps.readers), bounds: {} };
    const before = list(p.BEFORE), after = list(p.AFTER);
    assert(str(p.SOURCE) === 'SLOT-VALUE' && before.length === 8 && same(before, after), 'Missing or changed direct frame slots');
    for (const [i, key] of ['LX', 'RX', 'LY', 'TY'].entries()) {
      assert(str(before[i * 2]) === key, 'Frame slot order differs'); result.bounds[key.toLowerCase()] = int(before[i * 2 + 1]);
    }
    return { ...result, source: 'SLOT-VALUE', slotsUnchanged: true, count: result.frameCalls };
  }
  const p = plist(v, ['POINTS', 'ORDER-EQUAL'], 'point readers');
  assert(p['ORDER-EQUAL'] === true, 'Writer changed its ordered point list');
  let count = 0;
  const points = list(p.POINTS).map((row, i) => {
    assert(Array.isArray(row) && row.length === 6 && int(row[0], 1, caps.listPoints) === i + 1, 'Point identity coverage/order differs');
    const xCalls = int(row[4], 1, caps.readers), yCalls = int(row[5], 0, caps.readers);
    const point = { id: i + 1, type: str(row[1]), x: int(row[2]), y: yCalls === 0 ? null : int(row[3]), xCalls, yCalls };
    assert(yCalls > 0 || row[3] === null, 'Unobserved Y must be NIL'); count += xCalls + yCalls; return point;
  });
  const ids = new Set(call.args.order);
  assert(points.length === ids.size && points.every((point) => ids.has(point.id)), 'Point identities differ from complete list');
  return { points, orderPreserved: true, count };
}
export function parseBoundaryMapReport(source) {
  assert(Buffer.byteLength(source) <= 256 * 1024 * 1024, 'Report byte cap exceeded');
  const lines = source.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  assert(lines[0] === 'BEGIN boundary-map v2' && lines.at(-1) === 'END boundary-map v2', 'Incomplete report framing');
  const c = fields(lines[1], 'CAPS', ['calls', 'parents', 'list-points', 'total-points', 'map-cells', 'total-cells', 'map-runs', 'readers']);
  const caps = { calls: int(c.calls, 1, 500), parents: int(c.parents, 1, 1000), listPoints: int(c['list-points'], 1, 10000),
    totalPoints: int(c['total-points'], 1, 1000000), mapCells: int(c['map-cells'], 1, 153600),
    totalCells: int(c['total-cells'], 1, 60000000), mapRuns: int(c['map-runs'], 1, 2000000), readers: int(c.readers, 1, 5000000) };
  const installed = {}; let i = 2;
  for (; lines[i]?.startsWith('INSTALL '); i += 1) {
    const r = fields(lines[i], 'INSTALL', ['name', 'type']), name = str(r.name);
    assert(!Object.hasOwn(installed, name), 'Duplicate installation'); installed[name] = str(r.type);
  }
  keys(installed, [...readerNames, ...targets, ...parentNames, 'MAIN'], 'installations');
  assert([...targets, 'BRUSH-FILL-SUBPART', 'MAIN'].every((n) => installed[n] === 'COMPILED-FUNCTION')
    && ['MY-FILL', ...readerNames].every((n) => ['STANDARD-GENERIC-FUNCTION', 'COMPILED-FUNCTION'].includes(installed[n]))
    && lines[i++] === 'READY', 'Installation differs');
  const parents = [], calls = [], parentStack = [], callStack = [], totals = {};
  let phase = 'calls', complete = false, pointCount = 0, cellCount = 0, runCount = 0, readerCount = 0;
  for (const line of lines.slice(i, -1)) {
    assert(!/^(ERROR|OVERFLOW|ABORT)(?:[-\s]|$)/.test(line), 'Rejected observation, overflow or abort');
    if (phase === 'calls' && line.startsWith('PARENT ')) {
      const r = fields(line, 'PARENT', ['id', 'parent', 'name', 'args']), name = str(r.name);
      assert(parentNames.includes(name) && !callStack.length, 'Unexpected parent name/nesting');
      const parent = { id: int(r.id, 1, caps.parents), parent: int(r.parent, 0), name, args: parentArgs(r.args, name), calls: [] };
      assert(parent.id === parents.length + 1 && parent.parent === (parentStack.at(-1)?.id ?? 0), 'Parent order differs');
      parents.push(parent); parentStack.push(parent);
    } else if (phase === 'calls' && line.startsWith('END-PARENT ')) {
      const r = fields(line, 'END-PARENT', ['id']), parent = parentStack.pop();
      assert(parent && int(r.id) === parent.id && !callStack.length, 'Unpaired parent return');
    } else if (phase === 'calls' && line.startsWith('CALL ')) {
      const r = fields(line, 'CALL', ['id', 'parent', 'name', 'args', 'before']), name = str(r.name);
      assert(targets.includes(name) && !callStack.length && parentStack.length, 'Target outside parent or nested target');
      const call = { id: int(r.id, 1, caps.calls), parent: int(r.parent, 1), name, args: callArgs(r.args, name, caps), before: map(r.before, caps) };
      assert(call.id === calls.length + 1 && call.parent === parentStack.at(-1).id, 'Target call order/parent differs');
      calls.push(call); parentStack.at(-1).calls.push(call.id); callStack.push(call);
      pointCount += call.args.length ?? 0;
    } else if (phase === 'calls' && line.startsWith('RETURN ')) {
      const r = fields(line, 'RETURN', ['id', 'values', 'readers', 'after', 'map-eq-entry']), call = callStack.pop();
      assert(call && int(r.id) === call.id && r['map-eq-entry'] === true, 'Unpaired return or changed map identity');
      call.values = list(r.values).map((v) => v === null ? null : int(v));
      assert(call.values.length <= 16, 'Return value cap exceeded');
      call.readers = readers(r.readers, call, caps); call.after = map(r.after, caps); call.mapIdentityPreserved = true;
      assert(call.before.type === call.after.type && call.before.width === call.after.width && call.before.height === call.after.height,
        'Map storage changed');
      for (const m of [call.before, call.after]) { cellCount += m.cells; runCount += m.runCount; }
      readerCount += call.readers.count;
      assert(pointCount <= caps.totalPoints && cellCount <= caps.totalCells && runCount <= caps.mapRuns && readerCount <= caps.readers,
        'Cumulative observation cap exceeded');
    } else if ((phase === 'calls' || phase === 'totals') && line.startsWith('TOTAL ')) {
      assert(!parentStack.length && !callStack.length, 'Unfinished calls before totals');
      const r = fields(line, 'TOTAL', ['name', 'calls']), name = str(r.name);
      assert(targets.includes(name) && !Object.hasOwn(totals, name), 'Unexpected/duplicate total');
      totals[name] = int(r.calls, 0, caps.calls); phase = 'totals';
    } else if (phase === 'totals' && line.startsWith('COMPLETE ')) {
      const r = fields(line, 'COMPLETE', ['main', 'calls', 'parents', 'points', 'cells', 'runs', 'readers', 'rng-checks', 'slot-checks', 'errors', 'aborts', 'overflow', 'depth', 'parent-depth']);
      keys(totals, targets, 'totals');
      assert(kw(r.main, 'NORMAL') && int(r.calls) === calls.length && int(r.parents) === parents.length
        && int(r.points) === pointCount && int(r.cells) === cellCount && int(r.runs) === runCount && int(r.readers) === readerCount
        && int(r['rng-checks']) === calls.length * 2 && int(r['slot-checks']) === totals['CLEAR-FILL-MAP'] * 2
        && int(r.errors) === 0 && int(r.aborts) === 0 && r.overflow === null
        && int(r.depth) === 0 && int(r['parent-depth']) === 0 && targets.every((n) => totals[n] === calls.filter((c) => c.name === n).length),
        'Unsuccessful completion or mismatched totals');
      phase = 'complete'; complete = true;
    } else throw new Error(`Unexpected report record/phase: ${line.slice(0, 100)}`);
  }
  assert(complete && calls.length > 0 && cellCount === calls.reduce((n, c) => n + c.before.cells + c.after.cells, 0), 'Incomplete capture');
  return { schemaVersion: 1, caps, installed, totals, pointCount, cellCount, runCount, readerCount,
    rngChecks: calls.length * 2, slotChecks: totals['CLEAR-FILL-MAP'] * 2, parents, calls };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length) throw new Error('Usage: node parse-boundary-map-report.mjs <report.txt> <fresh.json>');
  const raw = readFileSync(input), report = parseBoundaryMapReport(raw.toString('utf8'));
  report.sourceSha256 = sha256(raw); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output, totals: report.totals, points: report.pointCount, cells: report.cellCount, readers: report.readerCount }));
}
