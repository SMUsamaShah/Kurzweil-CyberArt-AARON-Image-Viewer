#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const camel = name => name.toLowerCase().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const int = (value, label, low = Number.MIN_SAFE_INTEGER, high = Number.MAX_SAFE_INTEGER) => {
  assert(Number.isSafeInteger(value) && value >= low && value <= high, `${label}: invalid integer`);
  return value;
};
const keys = (value, expected, label) => {
  assert(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)),
  `${label}: fields differ`);
  return value;
};
const list = (value, label) => { assert(value === null || Array.isArray(value), `${label}: expected list`); return value ?? []; };
const bool = (value, label) => { assert(value === true || value === null, `${label}: expected T/NIL`); return value === true; };
const text = (value, label) => { assert(typeof value === 'string' && value.length > 0, `${label}: expected text`); return value; };
const CAPS = Object.freeze({ naturalCallCap: 300000, matrixCallCap: 300000, matrixMargin: 20,
  floatSamplePoints: 324, stateMapCellsPerCopy: 1000000, valuesPerCall: 16 });
function parserInput(line, name) {
  if (name !== 'ARGLIST') return { line, packageSymbols: null };
  assert(line === 'ARGLIST values=((COMMON-GRAPHICS-USER::X COMMON-GRAPHICS-USER::Y) T)',
    'FOOB arglist source differs');
  return {
    line: 'ARGLIST values=((FOOB-ARGLIST-X FOOB-ARGLIST-Y) T)',
    packageSymbols: new Map([
      ['FOOB-ARGLIST-X', 'COMMON-GRAPHICS-USER::X'],
      ['FOOB-ARGLIST-Y', 'COMMON-GRAPHICS-USER::Y']
    ])
  };
}

function decode(value, label, packageSymbols) {
  if (value === null || value === true) return value;
  if (value?.kind === 'number') {
    assert(/^[+-]?\d+$/.test(value.raw), `${label}: untyped noninteger`);
    return int(value.value, label);
  }
  if (value?.kind === 'string') return value.value;
  if (value?.kind === 'symbol') return { symbol: packageSymbols?.get(value.name) ?? value.name };
  if (value?.kind === 'keyword') return { keyword: value.name };
  assert(Array.isArray(value), `${label}: invalid Lisp value`);
  const tag = value[0]?.kind === 'keyword' ? value[0].name : null;
  if (['NIL', 'UNBOUND'].includes(tag)) {
    assert(value.length === 1, `${label}: descriptor arity`);
    return { kind: tag.toLowerCase() };
  }
  if (tag === 'BOOLEAN') {
    assert(value.length === 2, `${label}: Boolean descriptor arity`);
    return { kind: 'boolean', value: bool(decode(value[1], label, packageSymbols), label) };
  }
  if (tag === 'INTEGER') {
    assert(value.length === 2, `${label}: integer descriptor arity`);
    return { kind: 'integer', value: int(decode(value[1], label, packageSymbols), label) };
  }
  if (tag === 'NUMBER') {
    assert(value.length === 3, `${label}: number descriptor arity`);
    const raw = text(decode(value[1], label, packageSymbols), label), type = text(decode(value[2], label, packageSymbols), label);
    const parsed = parseLispRecord(`N value=${raw}`, 'N').value;
    assert(parsed?.kind === 'number' && ['SINGLE-FLOAT', 'DOUBLE-FLOAT'].includes(type), `${label}: unsupported number`);
    const numeric = type === 'SINGLE-FLOAT' ? Math.fround(parsed.value) : parsed.value;
    assert(Number.isFinite(numeric), `${label}: nonfinite number`);
    return { kind: 'number', raw, type, value: numeric };
  }
  if (tag === 'OBJECT') {
    assert(value.length === 2, `${label}: object descriptor arity`);
    return { kind: 'object', type: text(decode(value[1], label, packageSymbols), label) };
  }
  if (tag === 'SYMBOL') {
    assert(value.length === 3, `${label}: symbol descriptor arity`);
    return { kind: 'symbol', package: text(decode(value[1], label, packageSymbols), label), name: text(decode(value[2], label, packageSymbols), label) };
  }
  if (value.length > 0 && value.length % 2 === 0
      && value.every((entry, i) => i % 2 || entry?.kind === 'keyword')) {
    const result = {};
    for (let i = 0; i < value.length; i += 2) {
      const key = camel(value[i].name);
      assert(!Object.hasOwn(result, key), `${label}: duplicate property`);
      result[key] = decode(value[i + 1], `${label}.${key}`, packageSymbols);
    }
    return result;
  }
  return value.map((entry, i) => decode(entry, `${label}[${i}]`, packageSymbols));
}
function fields(line, name, expected) {
  const adapted = parserInput(line, name);
  const raw = parseLispRecord(adapted.line, name);
  assert(same(Object.keys(raw), expected), `${name}: field set/order differs`);
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [camel(key), decode(value, `${name}.${key}`, adapted.packageSymbols)]));
}
function dimension(value, label) {
  assert(value?.kind === 'integer', `${label}: dimension descriptor differs`);
  return int(value.value, label, 1, 1000000);
}
function numeric(value, label) {
  assert(value && ['integer', 'number'].includes(value.kind) && Number.isFinite(value.value), `${label}: numeric descriptor required`);
  return value.value;
}
function returnValue(values, label) {
  const result = list(values, label);
  assert(result.length === 1 && (result[0]?.kind === 'nil'
    || (result[0]?.kind === 'boolean' && result[0].value === true)), `${label}: expected one canonical NIL/T value`);
  return result[0].kind === 'boolean';
}
function state(value, width, height, label) {
  keys(value, ['width', 'height', 'fillMap', 'patchMap', 'brush', 'subFrame', 'rngPreview'], label);
  for (const [name, extent] of [['width', width], ['height', height]]) {
    const binding = keys(value[name], ['bound', 'type', 'value'], `${label}.${name}`);
    assert(binding.bound === true && binding.type === 'FIXNUM'
      && dimension(binding.value, label) === extent, `${label}: dimension binding differs`);
  }
  let copiedMapCells = 0;
  for (const name of ['fillMap', 'patchMap']) {
    const map = keys(value[name], ['bound', 'type', 'rank', 'dimensions', 'elementType', 'cells'], `${label}.${name}`);
    assert(map.bound === true && map.rank === 2 && same(map.dimensions, [width, height])
      && map.cells === width * height && map.cells <= CAPS.stateMapCellsPerCopy, `${label}.${name}: missing full array metadata`);
    const bits = name === 'fillMap' ? 4 : 16;
    assert(map.type === `(ARRAY (UNSIGNED-BYTE ${bits}) (${width} ${height}))`
      && same(map.elementType, [{ symbol: 'UNSIGNED-BYTE' }, bits]), `${label}.${name}: array type differs`);
    copiedMapCells += map.cells;
  }
  for (const name of ['brush', 'subFrame']) {
    const binding = keys(value[name], ['bound', 'type', 'value'], `${label}.${name}`);
    assert(binding.bound === true && typeof binding.type === 'string'
      && ['nil', 'boolean', 'object'].includes(binding.value?.kind), `${label}.${name}: binding summary differs`);
  }
  keys(value.rngPreview, ['random-100-1', 'random-100-2', 'random-100-3'], `${label}.rngPreview`);
  for (const n of Object.values(value.rngPreview)) int(n, `${label}.rngPreview`, 0, 99);
  return copiedMapCells;
}

export function parseFoobReport(source) {
  assert(typeof source === 'string' && Buffer.byteLength(source) <= 256 * 1024 * 1024, 'FOOB tape exceeds byte cap');
  const lines = source.replace(/^\uFEFF/u, '').split(/\r?\n/u);
  while (lines.at(-1) === '') lines.pop();
  assert(lines.shift() === 'BEGIN foob-capture v1' && lines.pop() === 'END foob-capture v1', 'FOOB framing incomplete');
  let cursor = 0;
  const read = (name, expected) => {
    assert(cursor < lines.length && lines[cursor].startsWith(`${name} `), `Expected ${name} at record ${cursor + 1}`);
    return fields(lines[cursor++], name, expected);
  };
  const caps = read('CAPS', ['natural-call-cap', 'matrix-call-cap', 'matrix-margin', 'float-sample-points', 'state-map-cells-per-copy', 'values-per-call']);
  assert(same(caps, CAPS), 'FOOB caps differ');
  const target = read('TARGET', ['name', 'package', 'type']);
  assert(target.name === 'FOOB' && target.package === 'COMMON-GRAPHICS-USER', 'FOOB target differs');
  const arglist = read('ARGLIST', ['values']);
  assert(same(arglist.values, [[{ symbol: 'COMMON-GRAPHICS-USER::X' }, { symbol: 'COMMON-GRAPHICS-USER::Y' }], true]), 'FOOB arglist differs');
  assert(target.type === 'COMPILED-FUNCTION', 'FOOB target is not compiled');
  const installs = [read('INSTALL', ['name', 'package', 'original-type']), read('INSTALL', ['name', 'original-type'])];
  assert(same(installs, [{ name: 'FOOB', package: 'COMMON-GRAPHICS-USER', originalType: 'COMPILED-FUNCTION' },
    { name: 'MAIN', originalType: 'COMPILED-FUNCTION' }]), 'FOOB/MAIN installations differ');
  assert(lines[cursor++] === 'READY', 'FOOB READY missing');
  const begin = read('MATRIX-BEGIN', ['invocation', 'trigger-natural-id']);
  assert(begin.invocation === 1 && begin.triggerNaturalId === 1, 'FOOB matrix trigger differs');
  const dimensions = read('DIMENSIONS', ['width', 'height', 'x-start', 'x-end', 'x-count', 'y-start', 'y-end', 'y-count', 'expected-calls']);
  const width = dimension(dimensions.width, 'width'), height = dimension(dimensions.height, 'height');
  const xStart = -20, yStart = -20, xCount = width + 41, yCount = height + 41, expectedCalls = xCount * yCount;
  assert(expectedCalls <= caps.matrixCallCap && dimensions.xStart === xStart && dimensions.xEnd === width + 20
    && dimensions.yStart === yStart && dimensions.yEnd === height + 20 && dimensions.xCount === xCount
    && dimensions.yCount === yCount && dimensions.expectedCalls === expectedCalls, 'FOOB integer domain differs');
  const integerBegin = read('MATRIX-INTEGER-BEGIN', ['x-start', 'x-end', 'x-count', 'y-start', 'y-end', 'y-count', 'expected-calls']);
  assert(same(integerBegin, { xStart, xEnd: width + 20, xCount, yStart, yEnd: height + 20, yCount, expectedCalls }),
    'FOOB integer BEGIN domain differs');
  const rows = [], histogram = { t: 0, nil: 0 };
  for (let i = 0; i < yCount; i++) {
    const row = read('MATRIX-ROW', ['y', 'x-start', 'x-count', 'calls', 'runs']);
    assert(row.y === yStart + i && row.xStart === xStart && row.xCount === xCount && row.calls === xCount, 'FOOB integer row order/coverage differs');
    row.runs = list(row.runs, 'row runs');
    let coverage = 0, previous;
    assert(row.runs.length > 0, 'Empty FOOB integer row');
    for (const pair of row.runs) {
      assert(Array.isArray(pair) && pair.length === 2, 'FOOB row run differs');
      const value = bool(pair[0], 'row value'), count = int(pair[1], 'run length', 1, xCount);
      assert(previous !== value, 'FOOB row RLE is not maximal'); previous = value; coverage += count;
      histogram[value ? 't' : 'nil'] += count;
      pair[0] = value;
    }
    assert(coverage === xCount, 'FOOB integer row incomplete');
    rows.push(row);
  }
  const integerEnd = read('MATRIX-INTEGER-END', ['rows', 'calls', 'expected-rows', 'expected-calls', 'complete']);
  assert(integerEnd.rows === yCount && integerEnd.calls === expectedCalls && integerEnd.expectedRows === yCount
    && integerEnd.expectedCalls === expectedCalls && integerEnd.complete === true, 'FOOB integer footer differs');
  const points = [], precisions = ['SINGLE-FLOAT', 'DOUBLE-FLOAT'];
  for (const xPrecision of precisions) for (const yPrecision of precisions) {
    const start = read('MATRIX-FLOAT-BEGIN', ['x-precision', 'y-precision', 'x-samples', 'y-samples', 'expected-points']);
    const precision = value => value?.symbol ?? value?.keyword ?? value;
    assert(precision(start.xPrecision) === xPrecision && precision(start.yPrecision) === yPrecision
      && start.xSamples === 9 && start.ySamples === 9 && start.expectedPoints === 81, 'FOOB float domain differs');
    const samples = extent => [-1, -0.5, 0, 0.5, extent - 1.5, extent - 1, extent - 0.5, extent, extent + 0.5];
    for (let yi = 0; yi < 9; yi++) for (let xi = 0; xi < 9; xi++) {
      const point = read('MATRIX-POINT', ['x-precision', 'y-precision', 'xi', 'yi', 'x', 'y', 'values']);
      assert(precision(point.xPrecision) === xPrecision && precision(point.yPrecision) === yPrecision
        && point.xi === xi && point.yi === yi && point.x.type === xPrecision && point.y.type === yPrecision
        && numeric(point.x, 'matrix x') === samples(width)[xi] && numeric(point.y, 'matrix y') === samples(height)[yi], 'FOOB float sample order/type differs');
      point.result = returnValue(point.values, 'matrix values'); points.push(point);
    }
    const end = read('MATRIX-FLOAT-END', ['x-precision', 'y-precision', 'points', 'calls', 'expected-points', 'complete']);
    assert(precision(end.xPrecision) === xPrecision && precision(end.yPrecision) === yPrecision
      && end.points === 81 && end.calls === 81 && end.expectedPoints === 81 && end.complete === true, 'FOOB float footer differs');
  }
  const matrixState = read('MATRIX-STATE', ['before', 'after', 'checks']);
  const copiedMapCells = state(matrixState.before, width, height, 'before');
  state(matrixState.after, width, height, 'after');
  assert(same(matrixState.before, matrixState.after), 'FOOB matrix state summaries changed');
  keys(matrixState.checks, ['fillMapEq', 'fillMapEqualp', 'fillMapMetaEqualp', 'patchMapEq', 'patchMapEqualp',
    'patchMapMetaEqualp', 'brushEq', 'subFrameEq', 'dimensionsEqual', 'rngEqual'], 'matrix checks');
  assert(Object.values(matrixState.checks).every(value => value === true), 'FOOB matrix changed map/binding/preview');
  const matrixEnd = read('MATRIX-END', ['integer-rows', 'integer-calls', 'expected-integer-rows', 'expected-integer-calls', 'float-points', 'float-calls', 'expected-float-points', 'expected-float-calls', 'complete', 'state-ok', 'errors']);
  assert(matrixEnd.integerRows === yCount && matrixEnd.integerCalls === expectedCalls && matrixEnd.expectedIntegerRows === yCount
    && matrixEnd.expectedIntegerCalls === expectedCalls && matrixEnd.floatPoints === 324 && matrixEnd.floatCalls === 324
    && matrixEnd.expectedFloatPoints === 324 && matrixEnd.expectedFloatCalls === 324
    && matrixEnd.complete === true && matrixEnd.stateOk === true && matrixEnd.errors === 0, 'FOOB matrix completion differs');
  const calls = [];
  while (lines[cursor]?.startsWith('CALL-BEGIN ')) {
    const call = read('CALL-BEGIN', ['id', 'argc', 'width', 'height', 'args']);
    assert(call.id === calls.length + 1 && call.argc === 2 && calls.length < caps.naturalCallCap, 'FOOB natural call sequence differs');
    call.width = dimension(call.width, 'natural width'); call.height = dimension(call.height, 'natural height');
    call.args = list(call.args, 'natural args');
    assert(call.args.length === 2, 'FOOB argument arity differs');
    call.args.forEach((value, i) => numeric(value, `arg ${i}`));
    const returned = read('CALL-RETURN', ['id', 'nvalues', 'values']);
    assert(returned.id === call.id && returned.nvalues === 1, 'FOOB return sequence/arity differs');
    call.values = returned.values; call.result = returnValue(returned.values, 'natural values'); calls.push(call);
  }
  assert(calls.length > 0, 'FOOB natural capture is empty');
  const complete = read('COMPLETE', ['main', 'natural-calls', 'logged-calls', 'matrix-integer-calls', 'matrix-float-calls',
    'matrix-errors', 'errors', 'aborts', 'overflow', 'active', 'matrix-started', 'matrix-complete', 'matrix-state-ok']);
  assert(cursor === lines.length, 'Unexpected trailing FOOB records');
  assert(complete.errors === 0 && complete.aborts === 0 && complete.overflow === null && complete.active === 0,
    'FOOB footer reports error/abort/overflow/active call');
  assert(same(complete.main, { keyword: 'NORMAL' }) && complete.naturalCalls === calls.length
    && complete.loggedCalls === calls.length && complete.matrixIntegerCalls === expectedCalls
    && complete.matrixFloatCalls === 324 && complete.matrixErrors === 0 && complete.matrixStarted === true
    && complete.matrixComplete === true && complete.matrixStateOk === true, 'FOOB final coverage differs');
  return { schemaVersion: 1, caps, target, arglist, installs, dimensions: { width, height, xStart, yStart, xCount, yCount },
    matrix: { begin, integerBegin, rows, integerEnd, points, state: matrixState, copiedMapCells, histogram, end: matrixEnd }, calls, complete };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assert(process.argv.length === 3, 'Usage: node research/tools/parse-foob-report.mjs <complete-foob-report.txt>');
    const bytes = readFileSync(resolve(process.argv[2])), report = parseFoobReport(bytes.toString('utf8'));
    process.stdout.write(JSON.stringify({ sourceSha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
      dimensions: report.dimensions, integerCalls: report.matrix.integerEnd.calls, floatPoints: report.matrix.points.length,
      naturalCalls: report.calls.length, complete: report.complete }, null, 2) + '\n');
  } catch (error) { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; }
}
