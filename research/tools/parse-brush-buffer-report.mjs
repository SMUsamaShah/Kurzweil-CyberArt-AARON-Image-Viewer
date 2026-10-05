#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_BYTES = 256 * 1024 * 1024;
const camel = name => name.toLowerCase().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const keys = (value, expected, label) => {
  assert(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)), `${label}: fields differ`);
  return value;
};
const integer = (value, label, low = Number.MIN_SAFE_INTEGER, high = Number.MAX_SAFE_INTEGER) => {
  assert(Number.isSafeInteger(value) && value >= low && value <= high, `${label}: expected an in-range integer`);
  return value;
};
const bool = (value, label) => { assert(value === true || value === null, `${label}: expected T/NIL`); return value === true; };
const text = (value, label) => { assert(typeof value === 'string' && value.length > 0, `${label}: expected a nonempty string`); return value; };

function decode(value, objects, label) {
  if (value === null || value === true) return value;
  if (value?.kind === 'number') {
    assert(/^[+-]?\d+$/.test(value.raw) && Number.isSafeInteger(value.value), `${label}: untyped noninteger field`);
    return value.value;
  }
  if (value?.kind === 'string') return value.value;
  if (value?.kind === 'keyword') return { keyword: value.name };
  if (value?.kind === 'symbol') return { symbol: value.name };
  assert(Array.isArray(value), `${label}: unsupported Lisp value`);
  const tag = value[0]?.kind === 'keyword' ? value[0].name : null;
  if (tag === 'NIL') { assert(value.length === 1, `${label}: NIL descriptor arity`); return { kind: 'nil' }; }
  if (tag === 'INTEGER') {
    assert(value.length === 2, `${label}: INTEGER descriptor arity`);
    return { kind: 'integer', value: integer(decode(value[1], objects, label), label) };
  }
  if (tag === 'NUMBER') {
    assert(value.length === 3, `${label}: NUMBER descriptor arity`);
    const raw = text(decode(value[1], objects, label), label), type = text(decode(value[2], objects, label), label);
    const number = parseLispRecord(`N value=${raw}`, 'N').value;
    assert(number?.kind === 'number' && ['SINGLE-FLOAT', 'DOUBLE-FLOAT'].includes(type), `${label}: unsupported numeric type`);
    const numeric = type === 'SINGLE-FLOAT' ? Math.fround(number.value) : number.value;
    assert(Number.isFinite(numeric), `${label}: nonfinite reconstructed number`);
    return { kind: 'number', raw, type, value: numeric };
  }
  if (tag === 'SYMBOL') {
    assert(value.length === 3, `${label}: SYMBOL descriptor arity`);
    return { kind: 'symbol', package: text(decode(value[1], objects, label), label), name: text(decode(value[2], objects, label), label) };
  }
  if (tag === 'OBJECT') {
    assert(value.length === 3, `${label}: OBJECT descriptor arity`);
    const id = integer(decode(value[1], objects, label), label, 1, 50000), type = text(decode(value[2], objects, label), label);
    assert(objects.get(id) === type, `${label}: object descriptor is undeclared or type differs`);
    return { kind: 'object', id, type };
  }
  if (tag === 'CHARACTER') {
    assert(value.length === 2, `${label}: CHARACTER descriptor arity`);
    return { kind: 'character', code: integer(decode(value[1], objects, label), label, 0, 0x10ffff) };
  }
  if (tag === 'STRING') {
    assert(value.length === 3, `${label}: STRING descriptor arity`);
    const result = decode(value[1], objects, label), length = integer(decode(value[2], objects, label), label, 0);
    assert(typeof result === 'string' && result.length === Math.min(256, length), `${label}: string preview length differs`);
    return { kind: 'string', value: result, originalLength: length, truncated: length > 256 };
  }
  if (tag && value.length % 2 === 0 && value.every((entry, i) => i % 2 || entry?.kind === 'keyword')) {
    const result = {};
    for (let i = 0; i < value.length; i += 2) {
      const key = camel(value[i].name);
      assert(!Object.hasOwn(result, key), `${label}: duplicate property ${key}`);
      result[key] = decode(value[i + 1], objects, `${label}.${key}`);
    }
    return result;
  }
  return value.map((entry, i) => decode(entry, objects, `${label}[${i}]`));
}
function fields(line, name, expected, objects) {
  const raw = parseLispRecord(line, name);
  assert(same(Object.keys(raw), expected), `${name}: field set/order differs`);
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [camel(key), decode(value, objects, `${name}.${key}`)]));
}
function reference(value, objects, label, nullable = false) {
  const id = integer(value.id, `${label}.id`, 0, 50000), type = text(value.type, `${label}.type`);
  assert(id === 0 ? nullable && type === 'NULL' : objects.get(id) === type, `${label}: object reference differs`);
}
function descriptor(value, label) {
  assert(value && ['nil', 'integer', 'number', 'symbol', 'object', 'character', 'string'].includes(value.kind), `${label}: missing typed descriptor`);
  return value;
}
function descriptors(values, label) {
  assert(values === null || Array.isArray(values), `${label}: expected a proper descriptor list`);
  const result = values ?? [];
  assert(result.length <= 16, `${label}: value cap exceeded`);
  result.forEach((value, i) => descriptor(value, `${label}[${i}]`));
  return result;
}
function map(value, objects, totals, label) {
  keys(value, ['id', 'type', 'elementType', 'width', 'height', 'cells', 'covered', 'complete', 'runs', 'rows'], label);
  reference(value, objects, label);
  const width = integer(value.width, `${label}.width`, 1, 153600), height = integer(value.height, `${label}.height`, 1, 153600);
  const cells = integer(width * height, `${label}.cells`, 1, 153600);
  assert(value.type === `(ARRAY (UNSIGNED-BYTE 4) (${width} ${height}))`
    && same(value.elementType, [{ symbol: 'UNSIGNED-BYTE' }, 4]), `${label}: map type/dimensions differ`);
  assert(value.cells === cells && value.covered === cells && value.complete === true, `${label}: incomplete map coverage`);
  assert(Array.isArray(value.rows) && value.rows.length === height, `${label}: map row count differs`);
  let runCount = 0;
  const rows = value.rows.map((row, y) => {
    assert(Array.isArray(row) && row.length === 2 && row[0] === y && Array.isArray(row[1]) && row[1].length > 0, `${label}: malformed row ${y}`);
    let covered = 0, prior = -1;
    for (const pair of row[1]) {
      assert(Array.isArray(pair) && pair.length === 2, `${label}: malformed run`);
      const next = integer(pair[0], `${label}: run value`, 0, 15), count = integer(pair[1], `${label}: run count`, 1, width);
      assert(next !== prior, `${label}: nonmaximal RLE`); prior = next; covered += count; runCount++;
    }
    assert(covered === width, `${label}: row ${y} coverage differs`);
    return { y, runs: row[1] };
  });
  assert(value.runs === runCount, `${label}: run count differs`);
  totals.cells += cells; totals.runs += runCount;
  assert(totals.cells <= 150000000 && totals.runs <= 8000000, `${label}: cumulative map cap exceeded`);
  return { id: value.id, type: value.type, width, height, cells, covered: cells, complete: true, bits: 4, runCount, rows };
}
function path(value, objects, totals, label, { kind = false, omitted = false } = {}) {
  keys(value, kind ? ['kind', 'id', 'type', 'length', 'points'] : ['id', 'type', 'length', 'points'], label);
  reference(value, objects, label, true);
  integer(value.length, `${label}.length`, 0, 20000);
  if (omitted && value.id !== 0) {
    assert(same(value.points, { keyword: 'OMITTED' }), `${label}: unsampled path points must be omitted`);
    return value;
  }
  const points = value.points ?? [];
  assert(Array.isArray(points) && points.length === value.length && (value.id !== 0 || value.length === 0), `${label}: path coverage differs`);
  points.forEach((point, i) => {
    keys(point, ['id', 'type', 'x', 'y'], `${label}.point${i}`); reference(point, objects, `${label}.point${i}`, true);
    if (point.id === 0) assert(point.x.kind === 'nil' && point.y.kind === 'nil', `${label}: NIL point shape differs`);
    else assert(['integer', 'number'].includes(descriptor(point.x, label).kind)
      && ['integer', 'number'].includes(descriptor(point.y, label).kind), `${label}: coordinate descriptors are not numeric`);
  });
  totals.points += points.filter(point => point.id !== 0).length;
  assert(totals.points <= 1000000, `${label}: cumulative point cap exceeded`);
  return { ...value, points };
}

const TARGETS = ['BRUSH-FILL-SUBPART', 'BUFFER-HEAD', 'BUFFER-ANYTHING', 'BUFFER-FEATURE',
  'BUFFER-HOLE', 'EDGE', 'ZERO-EDGE', 'CFRAME', 'IN-SUB-FRAME', 'FOOB', 'BRUSH-STROKE', 'CLEAR-FILL-MAP'];
const CAPS = { parents: 250, buffers: 500, children: 5000, strokes: 5000, markers: 250, clears: 250,
  predicates: 2000000, events: 4000000, points: 1000000, 'cells-per-snapshot': 153600,
  'total-cells': 150000000, runs: 8000000, objects: 50000, 'proper-list': 20000,
  offsets: 10000, values: 16 };
const CONTEXT = ['parent', 'subpart', 'buffer', 'child', 'stroke', 'clear'];
const CALL_PREFIX = ['event', 'target', 'id', ...CONTEXT];
const SCOPE = { 'BRUSH-FILL-SUBPART': 'subpart', 'BUFFER-HEAD': 'buffer', 'BUFFER-ANYTHING': 'buffer',
  'BUFFER-FEATURE': 'child', 'BUFFER-HOLE': 'child', 'BRUSH-STROKE': 'stroke', 'CLEAR-FILL-MAP': 'clear' };
const zeroContext = () => ({ subpart: 0, buffer: 0, child: 0, stroke: 0, clear: 0 });
function context(call, prior) {
  const expected = { parent: prior.subpart, ...prior };
  if (SCOPE[call.target]) expected[SCOPE[call.target]] = call.id;
  for (const key of CONTEXT) assert(call[key] === expected[key], `${call.target} ${call.id}: ${key} scope differs`);
}
function bounds(value, objects, label) {
  keys(value, ['id', 'type', 'bounds'], label); reference(value, objects, label);
  assert(Array.isArray(value.bounds) && value.bounds.length === 4, `${label}: bounds count differs`);
  const result = {};
  value.bounds.forEach((pair, i) => {
    assert(Array.isArray(pair) && pair.length === 2 && pair[0] === ['LX', 'RX', 'LY', 'TY'][i]
      && descriptor(pair[1], label).kind === 'integer', `${label}: frame bounds differ`);
    result[pair[0].toLowerCase()] = pair[1].value;
  });
  return { ...value, bounds: result };
}
function meta(value, objects, label) {
  keys(value, ['id', 'type', 'rank', 'elementType', 'width', 'height'], label); reference(value, objects, label);
  integer(value.width, label, 1, 153600); integer(value.height, label, 1, 153600);
  assert(value.rank === 2 && value.width * value.height <= 153600
    && value.type === `(ARRAY (UNSIGNED-BYTE 4) (${value.width} ${value.height}))`
    && same(value.elementType, [{ symbol: 'UNSIGNED-BYTE' }, 4]), `${label}: map metadata differs`);
  return value;
}
function state(value, objects, totals, label) {
  keys(value, ['brush', 'subFrame', 'boundaryValue', 'fillMap', 'mapBefore'], label);
  const brush = keys(value.brush, ['id', 'type', 'width', 'core', 'perim'], `${label}.brush`);
  reference(brush, objects, label);
  assert(descriptor(brush.width, label).kind === 'integer', `${label}: brush WIDTH must be integer`);
  for (const name of ['core', 'perim']) {
    assert(Array.isArray(brush[name]) && brush[name].length <= 10000, `${label}: mask shape/cap differs`);
    for (const pair of brush[name]) {
      assert(Array.isArray(pair) && pair.length === 2, `${label}: mask offset shape differs`);
      pair.forEach(entry => integer(entry, label));
    }
  }
  return { ...value, subFrame: bounds(value.subFrame, objects, label),
    boundaryValue: descriptor(value.boundaryValue, label), fillMap: meta(value.fillMap, objects, label),
    mapBefore: map(value.mapBefore, objects, totals, label) };
}
function detail(call, phase, objects, totals) {
  const value = call.detail, label = `${call.target} ${call.id} ${phase}`;
  switch (call.target) {
    case 'BUFFER-HEAD': case 'BUFFER-ANYTHING':
      return map(value, objects, totals, label);
    case 'CLEAR-FILL-MAP':
      if (phase === 'begin') return map(value, objects, totals, label);
      assert(value === null, `${label}: unexpected detail`); return null;
    case 'BUFFER-FEATURE': case 'BUFFER-HOLE':
      if (phase === 'begin') return state(value, objects, totals, label);
      keys(value, ['brushId', 'subFrameId', 'fillMap', 'boundaryValue', 'mapAfter'], label);
      integer(value.brushId, label, 0, 50000); integer(value.subFrameId, label, 0, 50000);
      return { ...value, fillMap: meta(value.fillMap, objects, label), boundaryValue: descriptor(value.boundaryValue, label),
        mapAfter: map(value.mapAfter, objects, totals, label) };
    case 'BRUSH-STROKE':
      if (phase === 'begin') {
        keys(value, ['path', 'value', 'markerP'], label);
        const marker = bool(value.markerP, label);
        assert(call.args.length === 4 && same(value.value, call.args[1]), `${label}: stroke value/arity differs`);
        assert(marker === (value.value.kind === 'integer' && value.value.value === 3), `${label}: marker flag differs`);
        const list = path(value.path, objects, totals, label, { omitted: !marker });
        assert(list.id === (call.args[0].kind === 'nil' ? 0 : call.args[0].id), `${label}: path identity differs`);
        return { ...value, markerP: marker, path: list };
      }
      keys(value, ['returnPathEq', 'mapAfter'], label);
      assert(value.returnPathEq === true, `${label}: original path return identity differs`);
      return { returnPathEq: true, mapAfter: same(value.mapAfter, { keyword: 'NOT-SAMPLED' })
        ? null : map(value.mapAfter, objects, totals, label) };
    case 'EDGE': case 'ZERO-EDGE':
      if (phase === 'return') {
        keys(value, ['pointList'], label);
        const list = path(value.pointList, objects, totals, label, { kind: true });
        assert(list.kind === call.target, `${label}: point list KIND differs`);
        const returned = call.values[0];
        assert(returned && list.id === (returned.kind === 'nil' ? 0 : returned.id), `${label}: return list identity differs`);
        return { pointList: list };
      }
      break;
    case 'CFRAME':
      if (phase === 'return') {
        keys(value, ['frame'], label);
        const frame = bounds(value.frame, objects, label);
        assert(call.values[0]?.kind === 'object' && call.values[0].id === frame.id, `${label}: CFRAME return identity differs`);
        return { frame };
      }
      break;
  }
  assert(value === null, `${label}: unexpected detail`); return null;
}
function counts(value, label) {
  assert(Array.isArray(value) && value.length === TARGETS.length, `${label}: target count differs`);
  return Object.fromEntries(value.map((pair, i) => {
    assert(Array.isArray(pair) && pair.length === 2 && pair[0] === TARGETS[i], `${label}: target order differs`);
    return [pair[0], integer(pair[1], label, 0, 10000000)];
  }));
}

/** Strict complete natural buffer-boundary tape parser. Incomplete v1 is excluded. */
export function parseBrushBufferReport(source) {
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source, 'utf8');
  assert(bytes.length > 0 && bytes.length <= MAX_BYTES, 'Buffer report byte cap exceeded');
  const input = bytes.toString('utf8').replace(/^\uFEFF/, '');
  assert(Buffer.from(input, 'utf8').equals(bytes) || Buffer.from('\uFEFF' + input, 'utf8').equals(bytes), 'Report is not valid UTF-8');
  const objects = new Map(), calls = [], intervals = [], sequence = [], stack = [];
  const totals = { points: 0, cells: 0, runs: 0 }, observedCounts = Object.fromEntries(TARGETS.map(name => [name, 0]));
  let stage = 0, installed = 0, lastEvent = 0, lastId = 0, interval = null, pendingClear = null, pendingMarker = null, complete = null;
  const next = (record) => {
    assert(record.event === lastEvent + 1 && record.event <= CAPS.events, 'Logged event IDs are not complete and contiguous');
    lastEvent = record.event; sequence.push(record);
  };
  for (const line of input.split(/\r?\n/)) {
    if (!line) continue;
    assert(!line.includes('\r'), 'Bare carriage return in buffer report');
    if (stage === 0) { assert(line === 'BEGIN brush-buffer v2', 'Buffer report BEGIN differs'); stage = 1; continue; }
    if (stage === 1) {
      const cap = fields(line, 'CAPS', Object.keys(CAPS), objects);
      assert(same(cap, Object.fromEntries(Object.entries(CAPS).map(([name, value]) => [camel(name), value]))), 'Buffer cap values differ');
      stage = 2; continue;
    }
    if (stage === 2) {
      if (line === 'READY') { assert(installed === TARGETS.length + 1, 'Missing function installation'); stage = 3; continue; }
      const name = [...TARGETS, 'MAIN'][installed];
      const expected = name === 'MAIN' ? ['name', 'original-type'] : ['name', 'package', 'original-type'];
      const install = fields(line, 'INSTALL', expected, objects);
      assert(install.name === name && install.originalType === (['EDGE', 'CFRAME'].includes(name)
        ? 'STANDARD-GENERIC-FUNCTION' : 'COMPILED-FUNCTION'), 'Installation order/type differs');
      if (name !== 'MAIN') assert(install.package === 'COMMON-GRAPHICS-USER', 'Target installation package differs');
      installed++; continue;
    }
    if (stage === 4) { assert(line === 'END brush-buffer v2', 'Buffer report END differs'); stage = 5; continue; }
    assert(stage === 3, 'Unexpected content after buffer END');
    if (line.startsWith('OBJECT ')) {
      const object = fields(line, 'OBJECT', ['id', 'type'], objects);
      assert(object.id === objects.size + 1 && object.id <= CAPS.objects, 'Object IDs are not contiguous');
      objects.set(object.id, text(object.type, 'OBJECT.type')); continue;
    }
    if (line.startsWith('CALL-BEGIN ')) {
      const call = fields(line, 'CALL-BEGIN', [...CALL_PREFIX, 'args', 'detail'], objects);
      assert(TARGETS.includes(call.target) && call.id === ++lastId, 'Call target/ID differs');
      const prior = stack.length ? Object.fromEntries(Object.keys(zeroContext()).map(key => [key, stack.at(-1)[key]])) : zeroContext();
      context(call, prior); call.args = descriptors(call.args, `${call.target} args`);
      if (!SCOPE[call.target]) assert(call.target === 'CFRAME' ? prior.subpart > 0 || prior.clear > 0 : prior.child > 0,
        'Helper sampled outside its declared active scope');
      if (call.target === 'CLEAR-FILL-MAP') {
        assert(pendingClear === call.id && interval === null, 'Clear entry is not preceded by matching interval close'); pendingClear = null;
      }
      call.detail = detail(call, 'begin', objects, totals); call.kind = 'call-begin'; next(call);
      if (pendingMarker !== null) {
        assert(call.id === pendingMarker && call.target === 'BRUSH-STROKE' && call.detail.markerP,
          'Next-marker interval close is not followed by the matching marker');
        pendingMarker = null;
      }
      calls.push(call); stack.push(call); observedCounts[call.target]++; continue;
    }
    if (line.startsWith('CALL-RETURN ')) {
      const returned = fields(line, 'CALL-RETURN', [...CALL_PREFIX, 'values', 'detail'], objects), call = stack.at(-1);
      assert(call && call.target === returned.target && call.id === returned.id
        && CONTEXT.every(key => call[key] === returned[key]), 'Unpaired/nonnested call return');
      returned.values = descriptors(returned.values, `${returned.target} values`);
      returned.detail = detail(returned, 'return', objects, totals);
      if (call.target === 'BRUSH-STROKE') {
        assert(Boolean(returned.detail.mapAfter) === call.detail.markerP, 'Stroke sampling branch differs');
        const expectedId = call.detail.path.id, value = returned.values[0];
        assert(returned.values.length === 1 && (expectedId === 0 ? value.kind === 'nil'
          : value.kind === 'object' && value.id === expectedId), 'Stroke returned path identity differs');
      }
      returned.kind = 'call-return'; next(returned); call.returned = returned; stack.pop(); continue;
    }
    if (line.startsWith('INTERVAL-BEGIN ')) {
      const started = fields(line, 'INTERVAL-BEGIN', ['event', 'marker', 'parent', 'buffer', 'child', 'stroke'], objects);
      const marker = calls.findLast(call => call.id === started.marker);
      assert(interval === null && marker?.target === 'BRUSH-STROKE' && marker.detail.markerP && marker.id === started.marker
        && marker.returned?.event === lastEvent && started.stroke === marker.id && started.parent === marker.subpart
        && started.buffer === marker.buffer && started.child === marker.child, 'Interval does not immediately follow its complete marker');
      started.kind = 'interval-begin'; next(started); interval = { ...started }; intervals.push(interval); continue;
    }
    if (line.startsWith('INTERVAL-END ')) {
      const ended = fields(line, 'INTERVAL-END', ['event', 'marker', 'clear', 'reason', 'parent', 'buffer', 'child', 'stroke'], objects);
      assert(interval && interval.marker === ended.marker && ['parent', 'buffer', 'child', 'stroke'].every(key => interval[key] === ended[key]),
        'Interval end context differs');
      if (same(ended.reason, { keyword: 'CLEAR-ENTRY' })) {
        assert(ended.clear === lastId + 1, 'Interval end/clear association differs'); pendingClear = ended.clear;
      } else {
        assert(same(ended.reason, { keyword: 'NEXT-VALUE3-MARKER' }) && ended.clear === 0, 'Unexpected interval close reason');
        pendingMarker = lastId + 1;
      }
      ended.kind = 'interval-end'; next(ended); interval.ended = ended; interval = null; continue;
    }
    if (line.startsWith('COMPLETE ')) {
      complete = fields(line, 'COMPLETE', ['main', 'parents', 'buffers', 'children', 'strokes', 'markers', 'clears', 'predicates', 'global-counts', 'sampled-counts',
        'events', 'points', 'cells', 'runs', 'objects', 'checks', 'errors', 'aborts', 'overflow', 'interval-active', 'active'], objects);
      assert(same(complete.main, { keyword: 'NORMAL' }) && complete.errors === 0 && complete.aborts === 0
        && complete.overflow === null && complete.intervalActive === null && same(complete.active, { parent: 0, buffer: 0, child: 0, stroke: 0, clear: 0 })
        && stack.length === 0 && interval === null && pendingClear === null && pendingMarker === null, 'Incomplete/failed buffer capture');
      complete.globalCounts = counts(complete.globalCounts, 'global counts'); complete.sampledCounts = counts(complete.sampledCounts, 'sampled counts');
      assert(same(complete.sampledCounts, observedCounts), 'Sampled event counters differ');
      for (const name of TARGETS) assert(complete.globalCounts[name] >= observedCounts[name], `${name}: sampled exceeds global count`);
      for (const name of TARGETS.filter(name => SCOPE[name])) assert(complete.globalCounts[name] === observedCounts[name], `${name}: natural calls missing`);
      const count = (...names) => names.reduce((n, name) => n + observedCounts[name], 0);
      for (const [name, total] of Object.entries({ parents: count('BRUSH-FILL-SUBPART'), buffers: count('BUFFER-HEAD', 'BUFFER-ANYTHING'),
        children: count('BUFFER-FEATURE', 'BUFFER-HOLE'), strokes: count('BRUSH-STROKE'), markers: intervals.length,
        clears: count('CLEAR-FILL-MAP'), events: lastEvent, ...totals, objects: objects.size }))
        assert(complete[name] === total, `Complete ${name} counter differs`);
      assert(lastEvent === 2 * (calls.length + intervals.length), 'Complete event equation differs');
      assert(complete.globalCounts['IN-SUB-FRAME'] + complete.globalCounts.FOOB <= CAPS.predicates, 'Predicate cap exceeded');
      assert(complete.predicates === complete.globalCounts['IN-SUB-FRAME'] + complete.globalCounts.FOOB, 'Natural predicate counter differs');
      const expectedChecks = 2 * complete.buffers + 2 * complete.children + complete.strokes + complete.markers + complete.clears
        + count('EDGE', 'ZERO-EDGE', 'CFRAME');
      assert(complete.checks === expectedChecks, 'Snapshot preview check equation differs');
      for (const name of ['parents', 'buffers', 'children', 'strokes', 'markers', 'clears']) integer(complete[name], `Complete ${name}`, 0, CAPS[name]);
      stage = 4; continue;
    }
    throw new Error(`Unsupported/failed buffer record: ${line.slice(0, 100)}`);
  }
  assert(stage === 5 && complete, 'Missing complete buffer END');
  return { schemaVersion: 2, source: { bytes: bytes.length, sha256: hash(bytes) }, caps: CAPS,
    complete, calls, intervals, sequence, objects: [...objects].map(([id, type]) => ({ id, type })) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [input, output, ...extra] = process.argv.slice(2);
    assert(input && output && extra.length === 0, 'Usage: parse-brush-buffer-report.mjs <report> <fresh JSON>');
    const parsed = parseBrushBufferReport(readFileSync(resolve(input)));
    writeFileSync(resolve(output), JSON.stringify(parsed, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify({ source: parsed.source, complete: parsed.complete }) + '\n');
  } catch (error) { process.stderr.write(`parse-brush-buffer-report: ${error.message}\n`); process.exitCode = 1; }
}
