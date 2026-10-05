#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { sha256 } from './index-allegro-image.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const list = v => { assert(v === null || Array.isArray(v), 'Expected a data list'); return v ?? []; };
const int = (v, lo = Number.MIN_SAFE_INTEGER, hi = Number.MAX_SAFE_INTEGER) => {
  assert(v?.kind === 'number' && /^[+-]?\d+$/.test(v.raw) && Number.isSafeInteger(v.value)
    && v.value >= lo && v.value <= hi, 'Expected a bounded raw integer'); return v.value;
};
const str = v => { assert(v?.kind === 'string', 'Expected string'); return v.value; };
const fields = (line, name, names) => {
  const p = parseLispRecord(line, name);
  assert(Object.keys(p).length === names.length && names.every(k => Object.hasOwn(p, k)), `${name} keys differ`); return p;
};
function point(v) {
  if (v === null) return null;
  const p = list(v); assert(p.length === 4, 'Incomplete point');
  return { type: str(p[0]), x: int(p[1]), y: int(p[2]), z: int(p[3]) };
}
function rows(v, width, height, expected) {
  const result = list(v).map((row, index) => {
    const r = list(row); assert(r.length === 2 && int(r[0]) === expected[index], 'Row order differs');
    const runs = list(r[1]).map(run => {
      const p = list(run); assert(p.length === 2, 'Invalid run'); return [int(p[0], 0, 65535), int(p[1], 1, width)];
    });
    assert(runs.reduce((n, r) => n + r[1], 0) === width
      && runs.every((r, i) => !i || runs[i - 1][0] !== r[0]), 'Row coverage or maximal runs differ');
    return { y: int(r[0], 0, height - 1), runs };
  });
  assert(result.length === expected.length, 'Missing rows'); return result;
}
export function parseScanRowReport(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  assert(lines.shift() === 'BEGIN scan-row v2' && lines.pop() === 'END scan-row v2', 'Incomplete scan tape');
  assert(lines.shift() === 'CAPS parents=250 scans=10000 neighbors=2000000 patches=1000', 'Caps differ');
  const d = fields(lines.shift(), 'DIRECTIONS', ['x', 'y']);
  const directions = { x: list(d.x).map(v => int(v, -1, 1)), y: list(d.y).map(v => int(v, -1, 1)) };
  for (const name of ['SCAN-ROW', 'NEIGHBORS']) {
    const p = fields(lines.shift(), 'TARGET', ['name', 'type']);
    assert(str(p.name) === name && str(p.type) === 'COMPILED-FUNCTION', 'Expected original target');
  }
  assert(lines.shift() === 'READY', 'Missing ready');
  const parents = [], scans = [], patches = [], masks = [], layouts = [], queries = [];
  let parent = null, pending = null, matrix = false, matrixEnd = false, complete = null, neighborCalls = 0;
  for (const line of lines) {
    if (line.startsWith('PARENT ')) {
      assert(!matrix && !parent && !pending, 'Overlapping parent');
      const p = fields(line, 'PARENT', ['id', 'args']);
      parent = { id: int(p.id, 1, 250), args: list(p.args).map(v => int(v)), scanIds: [], patchIds: [] };
      assert(parent.id === parents.length + 1 && parent.args.length === 2, 'Parent sequence differs'); parents.push(parent);
    } else if (line.startsWith('END-PARENT ')) {
      const p = fields(line, 'END-PARENT', ['id']); assert(parent && !pending && int(p.id) === parent.id, 'Parent end differs'); parent = null;
    } else if (line.startsWith('SCAN ')) {
      assert(parent && !matrix && !pending, 'Unexpected scan');
      const p = fields(line, 'SCAN', ['id', 'parent', 'args', 'rows']), a = list(p.args).map(v => int(v));
      assert(a.length === 4, 'Scan arity differs');
      const r = list(p.rows); assert(r.length === 3, 'Missing row dimensions');
      const width = int(r[0], 1, 320), height = int(r[1], 1, 480), expected = [a[2] - 1, a[2], a[2] + 1].filter(y => y >= 0 && y < height);
      pending = { id: int(p.id, 1, 10000), parent: int(p.parent), lx: a[0], rx: a[1], y: a[2], patchId: a[3], width, height,
        rows: rows(r[2], width, height, expected) };
      assert(pending.id === scans.length + 1 && pending.parent === parent.id, 'Scan sequence differs');
      parent.scanIds.push(pending.id);
    } else if (line.startsWith('RESULT ')) {
      const p = fields(line, 'RESULT', ['id', 'point', 'neighbors', 'flash', 'map-equality', 'rng-same']);
      assert(pending && int(p.id) === pending.id && p['rng-same'] === true, 'Return pairing or random preview differs');
      pending.point = point(p.point);
      pending.neighbors = list(p.neighbors).map(row => {
        const r = list(row); assert(r.length === 4, 'Neighbor arity differs'); return r.map((v, i) => int(v, i === 3 ? 0 : Number.MIN_SAFE_INTEGER, i === 3 ? 3 : Number.MAX_SAFE_INTEGER));
      });
      pending.flash = list(p.flash).map(v => {
        const f = list(v); assert(f.length === 2 && list(f[0]).length === 0 && list(f[1]).length === 1 && list(f[1])[0] === null, 'Flash call differs'); return { arguments: [], values: [null] };
      });
      const equality = list(p['map-equality']); assert(equality.length === 4 && equality.every(v => v === true), 'Scanner changed map identity or complete contents');
      pending.mapEquality = { fillIdentity: true, patchIdentity: true, fillContents: true, patchContents: true };
      neighborCalls += pending.neighbors.length; assert(neighborCalls <= 2000000, 'Neighbor cap exceeded');
      scans.push(pending); pending = null;
    } else if (line.startsWith('PATCH ')) {
      const p = fields(line, 'PATCH', ['id', 'parent', 'scan', 'start', 'max', 'p', 'scan-result-eq', 'natural-count']);
      assert(parent && !pending && !matrix && p['scan-result-eq'] === true, 'Missing scan result identity link');
      const patch = { id: int(p.id, 1, 1000), parent: int(p.parent), scanId: int(p.scan, 1, scans.length), start: point(p.start),
        maximum: int(p.max, 0), patchId: int(p.p, 0, 65535), naturalCount: p['natural-count'] === null ? null : int(p['natural-count'], 0), scanResultIdentity: true };
      assert(patch.id === patches.length + 1 && patch.parent === parent.id && scans.at(-1).id === patch.scanId, 'Patch sequence differs');
      parent.patchIds.push(patch.id); patches.push(patch);
    } else if (line === 'MATRIX-BEGIN') {
      assert(!parent && !pending && !matrix, 'Unexpected matrix start'); matrix = true;
    } else if (line.startsWith('MASK ')) {
      assert(matrix && !matrixEnd && !layouts.length, 'Unexpected mask');
      const p = fields(line, 'MASK', ['width', 'height', 'x', 'y', 'p', 'center', 'mask', 'value']);
      masks.push({ width: int(p.width, 1, 5), height: int(p.height, 1, 5), x: int(p.x, 0, 4), y: int(p.y, 0, 4),
        patchId: int(p.p, 0, 65535), center: int(p.center, 0, 1), mask: int(p.mask, 0, 255), value: int(p.value, 0, 3) });
      assert(masks.length <= 44544, 'Mask cap exceeded');
    } else if (line.startsWith('LAYOUT ')) {
      const p = fields(line, 'LAYOUT', ['id', 'p', 'rows']); assert(matrix && !matrixEnd && masks.length === 44544, 'Premature layout');
      const layout = { id: int(p.id, 1, 48), patchId: int(p.p, 0, 65535), rows: rows(p.rows, 5, 5, [0, 1, 2, 3, 4]) };
      assert(layout.id === layouts.length + 1, 'Layout sequence differs'); layouts.push(layout);
    } else if (line.startsWith('QUERY ')) {
      assert(matrix && !matrixEnd && layouts.length > 0, 'Unexpected query');
      const p = fields(line, 'QUERY', ['layout', 'lx', 'rx', 'y', 'p', 'point']);
      queries.push({ layout: int(p.layout, 1, layouts.length), lx: int(p.lx, 0, 5), rx: int(p.rx, 0, 5), y: int(p.y, -1, 4),
        patchId: int(p.p, 0, 65535), point: point(p.point) }); assert(queries.length <= 10368, 'Query cap exceeded');
    } else if (line.startsWith('MATRIX-END ')) {
      const p = fields(line, 'MATRIX-END', ['neighbors', 'scans', 'restored', 'maps-same', 'rng-same']);
      assert(matrix && !matrixEnd && masks.length === int(p.neighbors) && queries.length === int(p.scans)
        && p.restored === true && p['maps-same'] === true && p['rng-same'] === true, 'Matrix completion/restoration differs'); matrixEnd = true;
    } else if (line.startsWith('COMPLETE ')) {
      const p = fields(line, 'COMPLETE', ['main', 'parents', 'scans', 'neighbors', 'patches', 'matrix-neighbors', 'matrix-scans', 'checks', 'errors', 'aborts', 'overflow', 'parent-depth']);
      assert(!complete && matrixEnd && p.main?.kind === 'keyword' && p.main.name === 'NORMAL'
        && int(p.parents) === parents.length && int(p.scans) === scans.length && int(p.neighbors) === neighborCalls && int(p.patches) === patches.length
        && int(p['matrix-neighbors']) === 44544 && int(p['matrix-scans']) === 10368 && layouts.length === 48
        && int(p.checks) === scans.length * 3 + patches.length + 1 && int(p.errors) === 0 && int(p.aborts) === 0
        && p.overflow === null && int(p['parent-depth']) === 0, 'Incomplete or erroneous capture');
      complete = { parents: parents.length, scans: scans.length, neighbors: neighborCalls, patches: patches.length, checks: int(p.checks) };
    } else throw new Error(`Unsupported scan record: ${line.slice(0, 100)}`);
    assert(!complete || line.startsWith('COMPLETE '), 'Records after completion');
  }
  assert(complete && !parent && !pending, 'Unfinished capture');
  return { schemaVersion: 1, rawSha256: sha256(Buffer.from(text)), directions, parents, scans, patches, masks, layouts, queries, complete };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2); assert(input && output, 'Usage: parse-scan-row-report.mjs <raw> <fresh summary.json>');
  const report = parseScanRowReport(readFileSync(input, 'utf8'));
  writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, rawSha256: report.rawSha256, complete: report.complete, matrixNeighbors: report.masks.length, matrixScans: report.queries.length }, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(report.complete));
}
