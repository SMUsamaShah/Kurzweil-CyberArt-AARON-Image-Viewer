#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { sha256 } from './index-allegro-image.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const targets = ['PATCH-EDGE', 'LIST-FRAME', 'MY-FILL'];
const list = (v) => { assert(v === null || Array.isArray(v), 'Expected a data list'); return v ?? []; };
const int = (v, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => {
  assert(v?.kind === 'number' && /^[+-]?\d+$/.test(v.raw) && Number.isSafeInteger(v.value)
    && v.value >= min && v.value <= max, 'Expected a bounded raw integer'); return v.value;
};
const str = (v) => { assert(v?.kind === 'string', 'Expected a string'); return v.value; };
const kw = (v, name) => v?.kind === 'keyword' && v.name === name;
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
function point(v) {
  const p = list(v); assert(p.length === 4, 'Incomplete point slots');
  return { type: str(p[0]), x: int(p[1]), y: int(p[2]), z: int(p[3]) };
}
function frame(v) {
  const p = list(v); assert(p.length === 5, 'Incomplete frame slots');
  return { type: str(p[0]), lx: int(p[1]), rx: int(p[2]), ly: int(p[3]), ty: int(p[4]) };
}
function outline(v, caps, totals) {
  const result = list(v).map(point); assert(result.length <= caps.listPoints, 'Outline point cap exceeded');
  totals.points += result.length; return result;
}
function map(v, bits, caps, totals) {
  const p = plist(v, ['TYPE', 'DIMENSIONS', 'ELEMENT-TYPE', 'CELLS', 'COVERED', 'RUNS', 'COMPLETE', 'ROWS'], 'map');
  const d = list(p.DIMENSIONS), e = list(p['ELEMENT-TYPE']);
  assert(d.length === 2 && e.length === 2 && e[0]?.kind === 'symbol' && e[0].name === 'UNSIGNED-BYTE'
    && int(e[1]) === bits && p.COMPLETE === true, 'Map type/completion differs');
  const width = int(d[0], 1, 16384), height = int(d[1], 1, 16384), cells = width * height, type = str(p.TYPE);
  assert(type === `(ARRAY (UNSIGNED-BYTE ${bits}) (${width} ${height}))`
    && int(p.CELLS, 1, caps.mapCells) === cells && int(p.COVERED) === cells, 'Map coverage differs');
  let runCount = 0;
  const rows = list(p.ROWS).map((row, index) => {
    assert(Array.isArray(row) && row.length === 3 && kw(row[1], 'RUNS') && int(row[0]) === index, 'Map row order/shape differs');
    const runs = list(row[2]).map((r) => {
      assert(Array.isArray(r) && r.length === 2, 'Malformed map run'); return [int(r[0], 0, (2 ** bits) - 1), int(r[1], 1, width)];
    });
    assert(runs.reduce((n, r) => n + r[1], 0) === width && runs.every((r, i) => !i || r[0] !== runs[i - 1][0]), 'Map row coverage/maximal runs differ');
    runCount += runs.length; return { y: index, runs };
  });
  assert(rows.length === height && runCount === int(p.RUNS, 1, caps.mapRuns), 'Map run/row count differs');
  totals.cells += cells; totals.runs += runCount;
  return { type, bits, width, height, cells, runCount, rows };
}
function maps(v, caps, totals) {
  const p = plist(v, ['FILL', 'PATCH'], 'maps'), fill = map(p.FILL, 4, caps, totals), patch = map(p.PATCH, 16, caps, totals);
  assert(fill.width === patch.width && fill.height === patch.height, 'Map dimensions differ'); return { fill, patch };
}
function inputEquality(v) {
  const p = plist(v, ['FILL-IDENTITY', 'PATCH-IDENTITY', 'FILL-CONTENTS', 'PATCH-CONTENTS'], 'input map equality');
  assert(Object.values(p).every((v) => v === true), 'Producer changed map identity or complete contents');
  return { fillIdentity: true, patchIdentity: true, fillContents: true, patchContents: true };
}
function state(v, call, phase, caps, totals) {
  if (call.name === 'PATCH-EDGE') {
    const p = plist(v, phase === 'before' ? ['START', 'MAX', 'PDEX', 'MAPS'] : ['OUTLINE', 'START', 'INPUT-MAP-EQUALITY'], 'patch-edge state');
    return phase === 'before'
      ? { start: point(p.START), max: int(p.MAX, 0), pdex: int(p.PDEX, 0, 65535), maps: maps(p.MAPS, caps, totals) }
      : { outline: outline(p.OUTLINE, caps, totals), start: point(p.START), inputMapEquality: inputEquality(p['INPUT-MAP-EQUALITY']) };
  }
  if (call.name === 'LIST-FRAME') {
    const p = plist(v, phase === 'before' ? ['OUTLINE', 'OUT-LIST-EQ', 'PATCH-RESULT-EQ'] : ['FRAME', 'OUTLINE', 'OUT-LIST-EQ'], 'list-frame state');
    assert(p['OUT-LIST-EQ'] === true, 'Natural LIST-FRAME argument differs from OUT-LIST');
    if (phase === 'before') assert(p['PATCH-RESULT-EQ'] === true, 'LIST-FRAME input differs from PATCH-EDGE return identity');
    return { outline: outline(p.OUTLINE, caps, totals), ...(phase === 'after' ? { frame: frame(p.FRAME) } : {}), outListEqualsArgument: true };
  }
  const p = plist(v, phase === 'before'
    ? ['OUTLINE', 'FRAME', 'PATCH-RESULT-EQ', 'FRAME-RESULT-EQ', 'FLAG-BIT', 'SUBP-COUNT', 'INPUT-MAP-EQUALITY']
    : ['VALUES', 'OUTLINE', 'FRAME', 'SUBP-COUNT', 'READERS', 'MAPS'], 'SUBFORM state');
  const result = { outline: outline(p.OUTLINE, caps, totals), frame: frame(p.FRAME),
    subpCountBound: !(phase === 'before' && kw(p['SUBP-COUNT'], 'UNBOUND')),
    subpCount: phase === 'before' && kw(p['SUBP-COUNT'], 'UNBOUND') ? null : int(p['SUBP-COUNT']) };
  if (phase === 'before') {
    assert(p['PATCH-RESULT-EQ'] === true && p['FRAME-RESULT-EQ'] === true, 'SUBFORM outline/frame differs from producer return identities');
    result.flagBit = int(p['FLAG-BIT'], 0, 65535);
    result.inputMapEquality = inputEquality(p['INPUT-MAP-EQUALITY']);
  }
  else {
    result.values = list(p.VALUES).map((v) => v === null ? null : int(v));
    result.maps = maps(p.MAPS, caps, totals);
    result.readers = list(p.READERS).map((r) => {
      assert(Array.isArray(r) && r.length === 2, 'Malformed natural reader'); const name = str(r[0]);
      assert(['PATCHDEX', 'CFORM-COUNT'].includes(name), 'Unexpected natural reader'); return { name, value: int(r[1]) };
    });
  }
  return result;
}
export function parseSubformBoundaryReport(source) {
  assert(Buffer.byteLength(source) <= 256 * 1024 * 1024, 'Report byte cap exceeded');
  const lines = source.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  assert(lines[0] === 'BEGIN subform-boundary v3' && lines.at(-1) === 'END subform-boundary v3', 'Incomplete report framing');
  const c = fields(lines[1], 'CAPS', ['calls', 'parents', 'list-points', 'total-points', 'map-cells', 'total-cells', 'map-runs']);
  const caps = { calls: int(c.calls, 1, 1000), parents: int(c.parents, 1, 250), listPoints: int(c['list-points'], 1, 10000),
    totalPoints: int(c['total-points'], 1, 1000000), mapCells: int(c['map-cells'], 1, 153600),
    totalCells: int(c['total-cells'], 1, 400000000), mapRuns: int(c['map-runs'], 1, 10000000) };
  const d = fields(lines[2], 'DIRECTIONS', ['xincs', 'yincs']);
  const directions = { x: list(d.xincs).map((v) => int(v, -1, 1)), y: list(d.yincs).map((v) => int(v, -1, 1)) };
  assert(directions.x.length === 8 && directions.y.length === 8, 'Incomplete direction vectors');
  const installed = {}; let i = 3;
  for (; lines[i]?.startsWith('INSTALL '); i += 1) {
    const r = fields(lines[i], 'INSTALL', ['name', 'type']), name = str(r.name);
    assert(!Object.hasOwn(installed, name), 'Duplicate installation'); installed[name] = str(r.type);
  }
  keys(installed, ['PATCHDEX', 'CFORM-COUNT', ...targets, 'BRUSH-FILL', 'MAIN'], 'installations');
  assert(['PATCH-EDGE', 'LIST-FRAME', 'BRUSH-FILL', 'MAIN'].every((n) => installed[n] === 'COMPILED-FUNCTION')
    && ['MY-FILL', 'PATCHDEX', 'CFORM-COUNT'].every((n) => installed[n] === 'STANDARD-GENERIC-FUNCTION')
    && lines[i++] === 'READY', 'Installation differs');
  const calls = [], fills = [], parents = [], parentStack = [], callStack = [], totals = {}, sizes = { points: 0, cells: 0, runs: 0 };
  let phase = 'calls';
  for (const line of lines.slice(i, -1)) {
    assert(!/^(ERROR|OVERFLOW|ABORT)(?:[-\s]|$)/.test(line), `Rejected observation: ${line.slice(0, 100)}`);
    if (phase === 'calls' && line.startsWith('PARENT ')) {
      const r = fields(line, 'PARENT', ['id', 'args']), a = list(r.args);
      assert(a.length === 2 && !parentStack.length && !callStack.length, 'Unexpected parent arguments/nesting');
      const p = { id: int(r.id, 1, caps.parents), cdex: int(a[0], 0), sdex: int(a[1], 0), calls: [] };
      assert(p.id === parents.length + 1, 'Parent order differs'); parents.push(p); parentStack.push(p);
    } else if (phase === 'calls' && line.startsWith('END-PARENT ')) {
      const r = fields(line, 'END-PARENT', ['id']), p = parentStack.pop();
      assert(p && int(r.id) === p.id && !callStack.length, 'Unpaired parent return');
    } else if (phase === 'calls' && line.startsWith('FILL ')) {
      const r = fields(line, 'FILL', ['id', 'parent', 'mode', 'cdex', 'sdex']);
      const f = { id: int(r.id, 1, 1000), parent: int(r.parent, 0), mode: str(r.mode), cdex: int(r.cdex, 0), sdex: int(r.sdex, 0) };
      assert(f.id === fills.length + 1 && ['CFORM', 'SUBFORM'].includes(f.mode) && f.parent === (parentStack.at(-1)?.id ?? 0), 'Fill sequence differs'); fills.push(f);
    } else if (phase === 'calls' && line.startsWith('CALL ')) {
      const r = fields(line, 'CALL', ['id', 'parent', 'fill', 'name', 'before']);
      const call = { id: int(r.id, 1, caps.calls), parent: int(r.parent, 1), fill: int(r.fill, 0), name: str(r.name) };
      assert(targets.includes(call.name) && !callStack.length && parentStack.at(-1)?.id === call.parent
        && call.id === calls.length + 1 && (call.name === 'MY-FILL' ? fills.at(-1)?.id === call.fill && fills.at(-1)?.mode === 'SUBFORM' : call.fill === 0), 'Target order/enclosure differs');
      call.before = state(r.before, call, 'before', caps, sizes); calls.push(call); callStack.push(call); parentStack.at(-1).calls.push(call.id);
    } else if (phase === 'calls' && line.startsWith('RETURN ')) {
      const r = fields(line, 'RETURN', ['id', 'after', 'map-identities']), call = callStack.pop(), identities = list(r['map-identities']);
      assert(call && int(r.id) === call.id && identities.length === 2 && identities.every((v) => v === true), 'Unpaired return or changed map identity');
      call.after = state(r.after, call, 'after', caps, sizes); call.mapIdentitiesPreserved = true;
      assert(sizes.points <= caps.totalPoints && sizes.cells <= caps.totalCells && sizes.runs <= caps.mapRuns, 'Cumulative observation cap exceeded');
    } else if ((phase === 'calls' || phase === 'totals') && line.startsWith('TOTAL ')) {
      const r = fields(line, 'TOTAL', ['name', 'calls']), name = str(r.name);
      assert(targets.includes(name) && !Object.hasOwn(totals, name) && !parentStack.length && !callStack.length, 'Unexpected total');
      totals[name] = int(r.calls, 0, caps.calls); phase = 'totals';
    } else if (phase === 'totals' && line.startsWith('COMPLETE ')) {
      const r = fields(line, 'COMPLETE', ['main', 'calls', 'fills', 'parents', 'points', 'cells', 'runs', 'checks', 'errors', 'aborts', 'overflow', 'depth', 'parent-depth']);
      keys(totals, targets, 'totals');
      assert(kw(r.main, 'NORMAL') && int(r.calls) === calls.length && int(r.fills) === fills.length && int(r.parents) === parents.length
        && int(r.points) === sizes.points && int(r.cells) === sizes.cells && int(r.runs) === sizes.runs && int(r.checks) === calls.length * 2
        && int(r.errors) === 0 && int(r.aborts) === 0 && r.overflow === null && int(r.depth) === 0 && int(r['parent-depth']) === 0
        && targets.every((n) => totals[n] === calls.filter((c) => c.name === n).length), 'Incomplete observation or mismatched totals'); phase = 'complete';
    } else throw new Error(`Unexpected record/phase: ${line.slice(0, 100)}`);
  }
  assert(phase === 'complete' && calls.length > 0, 'Incomplete capture');
  for (const fill of fills) {
    const children = calls.filter((call) => call.name === 'MY-FILL' && call.fill === fill.id);
    assert(children.length === (fill.mode === 'SUBFORM' ? 1 : 0)
      && children.every((call) => call.parent === fill.parent), 'Fill record has missing, duplicate or mismatched observed method');
  }
  return { schemaVersion: 1, caps, directions, installed, totals, sizes, checks: calls.length * 2, parents, fills, calls };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length) throw new Error('Usage: node parse-subform-boundary-report.mjs <report.txt> <fresh-summary.json>');
  const raw = readFileSync(input), report = parseSubformBoundaryReport(raw.toString('utf8'));
  const summary = { schemaVersion: 1, sourceSha256: sha256(raw), totals: report.totals, sizes: report.sizes,
    fills: report.fills.length, parents: report.parents.length, checks: report.checks, directions: report.directions };
  writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' }); console.log(JSON.stringify(summary));
}
