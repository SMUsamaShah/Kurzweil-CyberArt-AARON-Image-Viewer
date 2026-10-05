#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { sha256 } from './index-allegro-image.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const list = v => { assert(v === null || Array.isArray(v), 'Expected list'); return v ?? []; };
const int = (v, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => {
  assert(v?.kind === 'number' && /^[+-]?\d+$/.test(v.raw) && Number.isSafeInteger(v.value)
    && v.value >= min && v.value <= max, 'Expected bounded raw integer'); return v.value;
};
const str = v => { assert(v?.kind === 'string', 'Expected string'); return v.value; };
function keys(p, names) { assert(Object.keys(p).length === names.length && names.every(k => Object.hasOwn(p, k)), 'Record fields differ'); return p; }
const fields = (line, name, names) => keys(parseLispRecord(line, name), names);
function plist(v, names) {
  const a = list(v), p = {}; assert(a.length % 2 === 0, 'Malformed plist');
  for (let i = 0; i < a.length; i += 2) {
    assert(a[i]?.kind === 'keyword' && !Object.hasOwn(p, a[i].name), 'Invalid plist key'); p[a[i].name] = a[i + 1];
  } return keys(p, names);
}
function shape(v, bits) {
  const a = list(v); assert(a.length === 4 && int(a[3]) === bits, 'Map shape/type differs');
  const s = { type: str(a[0]), width: int(a[1], 1, 153600), height: int(a[2], 1, 153600), bits };
  assert(s.width * s.height <= 153600, 'Map cell cap exceeded'); return s;
}
export function parseCformPostFillReport(text) {
  assert(Buffer.byteLength(text) <= 128 * 1024 * 1024, 'Report byte cap exceeded');
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  assert(lines.shift() === 'BEGIN cform-post-fill v2' && lines.pop() === 'END cform-post-fill v2', 'Incomplete report');
  assert(lines.shift() === 'CAPS calls=250 objects=2000 map=153600 cells=160000000 runs=8000000 readers=8000000', 'Caps differ');
  const installs = [];
  for (const name of ['CFRAME', 'PATCHDEX', 'POST-FILL']) {
    const p = fields(lines.shift(), 'INSTALL', ['name', 'type']); assert(str(p.name) === name, 'Install order differs'); installs.push({ name, type: str(p.type) });
  }
  assert(installs.every(i => i.type === 'STANDARD-GENERIC-FUNCTION') && lines.shift() === 'READY', 'Generic installation/ready differs');
  const objects = [], calls = []; let current = null, complete = null, cells = 0, runs = 0, readers = 0, frames = 0;
  const id = v => int(v, 1, objects.length);
  function map(v, bits) {
    const p = plist(v, ['SHAPE', 'CELLS', 'COVERED', 'RUNS', 'ROWS']), s = shape(p.SHAPE, bits), count = s.width * s.height;
    assert(int(p.CELLS) === count && int(p.COVERED) === count, 'Map cell coverage differs');
    const rawRows = list(p.ROWS); assert(rawRows.length === s.height, 'Map row coverage differs'); let runCount = 0;
    const rows = rawRows.map((r, y) => {
      const row = list(r); assert(row.length === 2 && int(row[0]) === y, 'Row index/order differs');
      const pairs = list(row[1]).map(pair => { const a = list(pair); assert(a.length === 2, 'Malformed run'); return [int(a[0], 0, 2 ** bits - 1), int(a[1], 1, s.width)]; });
      assert(pairs.reduce((n, a) => n + a[1], 0) === s.width && pairs.every((a,i) => !i || a[0] !== pairs[i-1][0]), 'RLE is incomplete/nonmaximal');
      runCount += pairs.length; return { y, runs: pairs };
    });
    assert(int(p.RUNS) === runCount, 'Map run count differs'); cells += count; runs += runCount;
    assert(cells <= 160000000 && runs <= 8000000, 'Cumulative cap exceeded'); return { ...s, cells: count, runCount, rows };
  }
  for (const line of lines) {
    assert(!complete, 'Records after completion');
    if (line.startsWith('OBJECT ')) {
      const p = fields(line, 'OBJECT', ['id', 'type']); assert(int(p.id, 1, 2000) === objects.length + 1, 'Object sequence differs'); objects.push({ id: objects.length + 1, type: str(p.type) });
    } else if (line.startsWith('CALL ')) {
      const p = fields(line, 'CALL', ['id', 'argc', 'cdex', 'sdex', 'before']), b = plist(p.before, ['BACKGROUND', 'FILL-SHAPE', 'PATCH-SHAPE']);
      assert(!current && int(p.id, 1, 250) === calls.length + 1 && int(p.argc) === 3, 'Call sequence/nesting/arity differs');
      current = { id: calls.length + 1, cdex: int(p.cdex, 0), sdex: int(p.sdex, 0), before: { background: int(b.BACKGROUND, 0, 65535),
        fillShape: shape(b['FILL-SHAPE'], 4), patchShape: shape(b['PATCH-SHAPE'], 16) } }; calls.push(current);
    } else if (line.startsWith('RETURN ')) {
      const p = fields(line, 'RETURN', ['id', 'after']); assert(current && int(p.id) === current.id, 'Unpaired return');
      const a = plist(p.after, ['VALUES', 'BACKGROUND', 'IDENTITIES', 'FRAMES', 'PATCH-READ', 'MAPS']), values = list(a.VALUES).map(v => int(v));
      assert(values.length === 1 && JSON.stringify(list(a.IDENTITIES)) === '[true,true]', 'Return arity/map identity differs');
      const observedFrames = list(a.FRAMES).map(v => {
        const r = list(v); assert(r.length === 2, 'Malformed frame reader'); const f = list(r[1]); assert(f.length === 5, 'Incomplete frame');
        return { form: id(r[0]), frame: { id: id(f[0]), lx: int(f[1]), rx: int(f[2]), ly: int(f[3]), ty: int(f[4]) } };
      });
      assert(observedFrames.length > 0, 'Missing natural CFRAME'); frames += observedFrames.length;
      const r = list(a['PATCH-READ']); assert(r.length === 5 && int(r[3]) === 0 && int(r[4]) === 0, 'Natural PATCHDEX consistency differs');
      const patchCalls = int(r[0], 0, 8000000); readers += patchCalls;
      const patchRead = { calls: patchCalls, form: patchCalls ? id(r[1]) : int(r[1], 0, 0), value: patchCalls ? int(r[2], 0, 65535) : null };
      if (!patchCalls) assert(r[2] === null, 'Unexpected unobserved patch value');
      const m = plist(a.MAPS, ['FILL-IN', 'PATCH-IN', 'FILL-OUT', 'PATCH-OUT']), maps = { fillIn: map(m['FILL-IN'], 4), patchIn: map(m['PATCH-IN'], 16), fillOut: map(m['FILL-OUT'], 4), patchOut: map(m['PATCH-OUT'], 16) };
      for (const [name, expected] of [['fillIn', current.before.fillShape], ['patchIn', current.before.patchShape], ['fillOut', current.before.fillShape], ['patchOut', current.before.patchShape]])
        assert(['type', 'width', 'height', 'bits'].every(k => maps[name][k] === expected[k]), 'Entry/exit map shape changed');
      current.after = { values, background: int(a.BACKGROUND, 0, 65535), identities: [true, true], frames: observedFrames, patchRead, maps }; current = null;
    } else if (line.startsWith('COMPLETE ')) {
      const p = fields(line, 'COMPLETE', ['main', 'calls', 'objects', 'checks', 'readers', 'cells', 'runs', 'errors', 'aborts', 'overflow', 'active']);
      assert(!current && p.main?.kind === 'keyword' && p.main.name === 'NORMAL' && int(p.calls) === calls.length && int(p.objects) === objects.length
        && int(p.checks) === 2 * calls.length + frames && int(p.readers) === readers && readers <= 8000000 && int(p.cells) === cells && int(p.runs) === runs
        && int(p.errors) === 0 && int(p.aborts) === 0 && p.overflow === null && p.active === null, 'Incomplete/erroneous capture');
      complete = { calls: calls.length, objects: objects.length, checks: int(p.checks), readers, cells, runs, frames };
    } else throw new Error(`Unsupported record: ${line.slice(0, 100)}`);
  }
  assert(complete && calls.every(c => c.after), 'Missing completion');
  return { schemaVersion: 1, rawSha256: sha256(Buffer.from(text)), installs, objects, calls, complete };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, ...extra] = process.argv.slice(2); assert(input && !extra.length, 'Usage: parse-cform-post-fill-report.mjs <raw report> [fresh normalized output]');
  const result = parseCformPostFillReport(readFileSync(input, 'utf8'));
  if (output) writeFileSync(output, `${JSON.stringify(result)}\n`, { flag: 'wx' }); console.log(JSON.stringify(result.complete, null, 2));
}
