#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';

const MAX_REPORT_BYTES = 128 * 1024 * 1024;
const CAPS = Object.freeze({
  strokes: 5000,
  sampled: 250,
  clears: 250,
  events: 4_000_000,
  points: 1_000_000,
  mapCells: 153_600,
  totalCells: 100_000_000,
  runs: 6_000_000,
  predicates: 2_000_000,
  objects: 30_000,
  values: 16,
  path: 20_000,
  offsets: 10_000,
});
const INSTALL_ORDER = [
  'IN-SUB-FRAME', 'SCREEN-AND-STORE', 'CFRAME', 'BRUSH-STROKE', 'CLEAR-FILL-MAP', 'MAIN',
];
const EXPECTED_CAP_ORDER = [
  'strokes', 'sampled', 'clears', 'events', 'points', 'map-cells', 'total-cells',
  'runs', 'predicates', 'objects', 'values', 'path', 'offsets',
];

const assert = (condition, message) => { if (!condition) throw new Error(message); };

function* linesOf(text) {
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline < 0 ? text.length : newline;
    let line = text.slice(start, end);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    assert(!line.includes('\r'), 'Bare carriage return in report');
    yield line;
    start = newline < 0 ? text.length : newline + 1;
  }
}

function exactKeys(object, expected, label) {
  const keys = Object.keys(object);
  assert(keys.length === expected.length && expected.every((key) => Object.hasOwn(object, key)),
    `${label} fields differ`);
  return object;
}

function record(line, name, expected) {
  const fields = parseLispRecord(line, name);
  assert(Object.keys(fields).length === expected.length
    && expected.every((key, index) => Object.keys(fields)[index] === key),
  `${name} field set or order differs`);
  return fields;
}

function int(value, label, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  assert(value?.kind === 'number' && /^[+-]?\d+$/.test(value.raw)
    && Number.isSafeInteger(value.value) && value.value >= minimum && value.value <= maximum,
  `${label} must be an in-range raw integer`);
  return value.value;
}

function str(value, label, { nonempty = true } = {}) {
  assert(value?.kind === 'string' && (!nonempty || value.value.length > 0),
    `${label} must be ${nonempty ? 'a nonempty ' : 'a '}string`);
  return value.value;
}

function keyword(value, name, label) {
  assert(value?.kind === 'keyword' && value.name === name, `${label} must be :${name}`);
}

function bool(value, label) {
  assert(value === true || value === null, `${label} must be T or NIL`);
  return value === true;
}

function properList(value, label, max = Number.MAX_SAFE_INTEGER) {
  assert(value === null || Array.isArray(value), `${label} must be a proper list`);
  const result = value ?? [];
  assert(result.length <= max, `${label} exceeds its list cap`);
  return result;
}

function plist(value, expected, label) {
  const values = properList(value, label, expected.length * 2);
  assert(values.length % 2 === 0, `${label} has an odd property count`);
  const result = Object.create(null);
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    assert(key?.kind === 'keyword' && !Object.hasOwn(result, key.name),
      `${label} has an invalid or duplicate property`);
    result[key.name] = values[index + 1];
  }
  exactKeys(result, expected, label);
  assert(expected.every((name, index) => values[index * 2]?.name === name),
    `${label} property order differs`);
  return result;
}

function ref(idValue, typeValue, label, objects, { nullable = false } = {}) {
  const id = int(idValue, `${label} object id`, 0, CAPS.objects);
  const type = str(typeValue, `${label} object type`);
  if (id === 0) {
    assert(nullable && type === 'NULL', `${label} cannot use reserved object id 0`);
    return { id: 0, type };
  }
  assert(objects.has(id), `${label} refers to undeclared object ${id}`);
  assert(objects.get(id) === type, `${label} type differs from OBJECT ${id}`);
  return { id, type };
}

function descriptor(value, label, objects) {
  const parts = properList(value, label, 3);
  assert(parts.length > 0, `${label} has no descriptor tag`);
  keyword(parts[0], parts[0]?.name, `${label} descriptor tag`);
  switch (parts[0].name) {
    case 'NIL':
      assert(parts.length === 1, `${label} NIL descriptor has extra fields`);
      return { kind: 'nil' };
    case 'INTEGER':
      assert(parts.length === 2, `${label} INTEGER descriptor has wrong arity`);
      return { kind: 'integer', value: int(parts[1], `${label} integer`) };
    case 'CHARACTER': {
      assert(parts.length === 2, `${label} CHARACTER descriptor has wrong arity`);
      const code = int(parts[1], `${label} character code`, 0, 0x10ffff);
      return { kind: 'character', code };
    }
    case 'STRING': {
      assert(parts.length === 3, `${label} STRING descriptor has wrong arity`);
      const valueText = str(parts[1], `${label} string value`, { nonempty: false });
      const originalLength = int(parts[2], `${label} original string length`, valueText.length, 0x7fffffff);
      assert(valueText.length <= 256 && (originalLength <= 256
        ? valueText.length === originalLength : valueText.length === 256),
      `${label} string preview length is inconsistent`);
      return { kind: 'string', value: valueText, originalLength, truncated: originalLength > valueText.length };
    }
    case 'SYMBOL': {
      assert(parts.length === 3, `${label} SYMBOL descriptor has wrong arity`);
      const packageName = str(parts[1], `${label} symbol package`, { nonempty: false });
      const name = str(parts[2], `${label} symbol name`, { nonempty: false });
      if (packageName === 'UNINTERNED') assert(name.length >= 0, `${label} invalid uninterned symbol`);
      else assert(packageName.length > 0, `${label} has an empty package name`);
      return { kind: 'symbol', package: packageName, name };
    }
    case 'NUMBER': {
      assert(parts.length === 2, `${label} NUMBER descriptor has wrong arity`);
      const printed = str(parts[1], `${label} printed number`);
      assert(/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eEsSfFdDlL][+-]?\d+)?$/.test(printed),
        `${label} has an unsupported printed number`);
      return { kind: 'number', printed };
    }
    case 'OBJECT': {
      assert(parts.length === 3, `${label} OBJECT descriptor has wrong arity`);
      const object = ref(parts[1], parts[2], label, objects);
      return { kind: 'object', id: object.id, type: object.type };
    }
    default:
      throw new Error(`${label} has unsupported descriptor tag :${parts[0].name}`);
  }
}

function descriptors(value, label, objects, maximum = CAPS.values) {
  return properList(value, label, maximum).map((item, index) => descriptor(item, `${label}[${index}]`, objects));
}

function sameObjectId(descriptorValue, expectedId) {
  if (descriptorValue?.kind === 'object') return descriptorValue.id === expectedId;
  if (descriptorValue?.kind === 'nil') return expectedId === 0;
  return null;
}

function parseOffsets(value, label) {
  const offsets = properList(value, label, CAPS.offsets);
  return offsets.map((entry, index) => {
    const pair = properList(entry, `${label}[${index}]`, 2);
    assert(pair.length === 2, `${label}[${index}] must contain two integers`);
    return [int(pair[0], `${label}[${index}].x`), int(pair[1], `${label}[${index}].y`)];
  });
}

function parseOffsetRecord(value, label) {
  if (value === null) return null;
  const fields = plist(value, ['LENGTH', 'OFFSETS'], label);
  const length = int(fields.LENGTH, `${label} length`, 0, CAPS.offsets);
  const offsets = parseOffsets(fields.OFFSETS, `${label} offsets`);
  assert(length === offsets.length, `${label} length differs from offsets`);
  return { length, offsets };
}

function parseBrush(value, label, objects) {
  const fields = plist(value, ['ID', 'TYPE', 'INDEX', 'PERIM', 'CORE'], label);
  const id = int(fields.ID, `${label} id`, 0, CAPS.objects);
  const type = str(fields.TYPE, `${label} type`);
  const index = fields.INDEX === null ? null : int(fields.INDEX, `${label} index`, 0, 1000);
  const perim = parseOffsetRecord(fields.PERIM, `${label} PERIM`);
  const core = parseOffsetRecord(fields.CORE, `${label} CORE`);
  if (id === 0) {
    assert(type === 'NULL' && index === null && perim === null && core === null,
      `${label} NULL shape is inconsistent`);
  } else {
    assert(objects.has(id) && objects.get(id) === type && type !== 'NULL',
      `${label} refers to undeclared or mismatched brush object`);
  }
  return { id, type, index, perim, core };
}

function parsePoint(value, label, objects) {
  const fields = plist(value, ['ID', 'TYPE', 'X', 'Y'], label);
  const id = int(fields.ID, `${label} id`, 0, CAPS.objects);
  const type = str(fields.TYPE, `${label} type`);
  if (id === 0) {
    assert(type === 'NULL' && fields.X === null && fields.Y === null, `${label} NULL point shape is inconsistent`);
    return { id: 0, type, x: null, y: null };
  }
  assert(objects.has(id) && objects.get(id) === type && type !== 'NULL',
    `${label} refers to undeclared or mismatched point object`);
  return { id, type, x: int(fields.X, `${label} x`), y: int(fields.Y, `${label} y`) };
}

function parsePath(value, label, objects, totals) {
  const fields = plist(value, ['ID', 'TYPE', 'LENGTH', 'POINTS'], label);
  const id = int(fields.ID, `${label} id`, 0, CAPS.objects);
  const type = str(fields.TYPE, `${label} type`);
  const length = int(fields.LENGTH, `${label} length`, 0, CAPS.path);
  const points = properList(fields.POINTS, `${label} points`, CAPS.path)
    .map((point, index) => parsePoint(point, `${label} point ${index}`, objects));
  assert(points.length === length, `${label} length differs from point list`);
  if (id === 0) assert(type === 'NULL' && length === 0, `${label} NULL shape is inconsistent`);
  else assert(objects.has(id) && objects.get(id) === type && type !== 'NULL',
    `${label} refers to undeclared or mismatched path object`);
  totals.points += length;
  assert(totals.points <= CAPS.points, 'Point observation cap exceeded');
  return { id, type, length, points };
}

function parseBounds(value, label) {
  const bounds = properList(value, label, 4);
  assert(bounds.length === 4, `${label} must contain four direct bounds`);
  const expected = ['LX', 'RX', 'LY', 'TY'];
  const result = Object.create(null);
  bounds.forEach((pairValue, index) => {
    const pair = properList(pairValue, `${label}[${index}]`, 2);
    assert(pair.length === 2, `${label}[${index}] must be a name/value pair`);
    const name = str(pair[0], `${label}[${index}] name`);
    assert(name === expected[index], `${label} names/order differ`);
    result[name.toLowerCase()] = int(pair[1], `${label}.${name}`);
  });
  return result;
}

function parseConfiguration(value, label, objects) {
  const fields = plist(value, ['SUB-FRAME', 'WIDTH', 'BOUNDARY-VALUE'], label);
  const frameFields = plist(fields['SUB-FRAME'], ['ID', 'TYPE', 'BOUNDS'], `${label} SUB-FRAME`);
  const frame = ref(frameFields.ID, frameFields.TYPE, `${label} SUB-FRAME`, objects);
  const bounds = parseBounds(frameFields.BOUNDS, `${label} SUB-FRAME bounds`);
  const width = int(fields.WIDTH, `${label} WIDTH`);
  const bound = properList(fields['BOUNDARY-VALUE'], `${label} BOUNDARY-VALUE`, 2);
  let boundaryValue;
  if (bound.length === 1) {
    keyword(bound[0], 'UNBOUND', `${label} BOUNDARY-VALUE tag`);
    boundaryValue = { kind: 'unbound' };
  } else {
    assert(bound.length === 2, `${label} BOUNDARY-VALUE has wrong shape`);
    keyword(bound[0], 'BOUND', `${label} BOUNDARY-VALUE tag`);
    boundaryValue = { kind: 'bound', value: descriptor(bound[1], `${label} BOUNDARY-VALUE value`, objects) };
  }
  return { subFrame: { id: frame.id, type: frame.type, bounds }, width, boundaryValue };
}

function parseMap(value, label, objects, totals) {
  const fields = plist(value, ['ID', 'TYPE', 'ELEMENT-TYPE', 'WIDTH', 'HEIGHT', 'CELLS', 'COVERED', 'COMPLETE', 'RUNS', 'ROWS'], label);
  const id = int(fields.ID, `${label} id`, 1, CAPS.objects);
  const type = str(fields.TYPE, `${label} type`);
  assert(objects.has(id) && objects.get(id) === type, `${label} map object is undeclared or mismatched`);
  const elementType = properList(fields['ELEMENT-TYPE'], `${label} element type`, 2);
  assert(elementType.length === 2 && elementType[0]?.kind === 'symbol'
    && elementType[0].name === 'UNSIGNED-BYTE' && int(elementType[1], `${label} element width`) === 4,
  `${label} element type must be (UNSIGNED-BYTE 4)`);
  const width = int(fields.WIDTH, `${label} width`, 1, CAPS.mapCells);
  const height = int(fields.HEIGHT, `${label} height`, 1, CAPS.mapCells);
  const cells = width * height;
  assert(Number.isSafeInteger(cells) && cells <= CAPS.mapCells, `${label} exceeds the per-map cell cap`);
  assert(type === `(ARRAY (UNSIGNED-BYTE 4) (${width} ${height}))`, `${label} array type/dimensions differ`);
  assert(int(fields.CELLS, `${label} cells`, 0, CAPS.mapCells) === cells,
    `${label} cell count differs from dimensions`);
  assert(int(fields.COVERED, `${label} covered`, 0, CAPS.mapCells) === cells,
    `${label} coverage differs from dimensions`);
  assert(fields.COMPLETE === true, `${label} must explicitly report complete RLE coverage`);

  const rowsRaw = properList(fields.ROWS, `${label} rows`, height);
  assert(rowsRaw.length === height, `${label} row count differs from height`);
  let runCount = 0;
  const rows = rowsRaw.map((rowValue, index) => {
    const row = properList(rowValue, `${label} row ${index}`, 2);
    assert(row.length === 2 && int(row[0], `${label} row index`, 0, height - 1) === index,
      `${label} row indexes are not contiguous from zero`);
    const runsRaw = properList(row[1], `${label} row ${index} runs`, width);
    assert(runsRaw.length > 0, `${label} row ${index} has no runs`);
    let covered = 0;
    let previousValue = null;
    const runs = runsRaw.map((runValue, runIndex) => {
      const pair = properList(runValue, `${label} row ${index} run ${runIndex}`, 2);
      assert(pair.length === 2, `${label} row ${index} run ${runIndex} must be [value,count]`);
      const runValueNumber = int(pair[0], `${label} row ${index} run ${runIndex} value`, 0, 15);
      const count = int(pair[1], `${label} row ${index} run ${runIndex} count`, 1, width);
      assert(previousValue === null || previousValue !== runValueNumber,
        `${label} row ${index} RLE is not maximal`);
      previousValue = runValueNumber;
      covered += count;
      runCount += 1;
      return [runValueNumber, count];
    });
    assert(covered === width, `${label} row ${index} does not cover its width`);
    return { y: index, runs };
  });
  assert(int(fields.RUNS, `${label} run count`, 0, CAPS.runs) === runCount,
    `${label} RUNS differs from row data`);
  totals.cells += cells;
  totals.runs += runCount;
  assert(totals.cells <= CAPS.totalCells, 'Total map cell cap exceeded');
  assert(totals.runs <= CAPS.runs, 'Total map run cap exceeded');
  return { id, type, bits: 4, width, height, cells, covered: cells, runCount, rows };
}

function parseSample(value, label, objects, totals, { output = false } = {}) {
  const fields = plist(value, output
    ? ['VALUES', 'RETURN-PATH-EQ', 'PATH', 'BRUSH', 'BRUSH-BOUNDARY-VALUE',
      'CONFIGURATION', 'MAP', 'MAP-OBJECT-ID', 'BRUSH-OBJECT-ID']
    : ['PATH', 'BRUSH', 'BRUSH-BOUNDARY-VALUE', 'CONFIGURATION', 'MAP',
      'MAP-OBJECT-ID', 'BRUSH-OBJECT-ID'], label);
  const values = output ? descriptors(fields.VALUES, `${label} values`, objects) : null;
  const returnPathEq = output ? bool(fields['RETURN-PATH-EQ'], `${label} return-path-eq`) : null;
  const path = parsePath(fields.PATH, `${label} path`, objects, totals);
  const brush = parseBrush(fields.BRUSH, `${label} brush`, objects);
  const brushBoundaryValue = descriptor(fields['BRUSH-BOUNDARY-VALUE'], `${label} brush-boundary-value`, objects);
  const configuration = parseConfiguration(fields.CONFIGURATION, `${label} configuration`, objects);
  const map = parseMap(fields.MAP, `${label} map`, objects, totals);
  const mapObjectId = int(fields['MAP-OBJECT-ID'], `${label} map object id`, 1, CAPS.objects);
  const brushObjectId = int(fields['BRUSH-OBJECT-ID'], `${label} brush object id`, 0, CAPS.objects);
  assert(map.id === mapObjectId, `${label} map identity flag differs from map snapshot`);
  assert(brush.id === brushObjectId, `${label} brush identity flag differs from brush snapshot`);
  if (output && values.length > 0) {
    const returnedPathIdentity = sameObjectId(values[0], path.id);
    if (returnedPathIdentity !== null) assert(returnedPathIdentity === returnPathEq,
      `${label} return-path-eq disagrees with returned path identity`);
  }
  return { ...(output ? { values, returnPathEq } : {}), path, brush, brushBoundaryValue,
    configuration, map, mapObjectId, brushObjectId };
}

function parseFrame(value, label, objects) {
  const fields = plist(value, ['EVENT', 'ARGS', 'VALUES', 'ARGUMENT-ID', 'FRAME-ID', 'FRAME-TYPE', 'BOUNDS'], label);
  const event = int(fields.EVENT, `${label} event`, 1, CAPS.events);
  const args = descriptors(fields.ARGS, `${label} args`, objects);
  const values = descriptors(fields.VALUES, `${label} values`, objects);
  const argumentId = int(fields['ARGUMENT-ID'], `${label} argument id`, 0, CAPS.objects);
  const frameId = int(fields['FRAME-ID'], `${label} frame id`, 0, CAPS.objects);
  const frameType = str(fields['FRAME-TYPE'], `${label} frame type`);
  let bounds = null;
  if (frameId === 0) assert(frameType === 'NULL' && fields.BOUNDS === null,
    `${label} NULL frame shape is inconsistent`);
  else {
    const frameRef = ref(fields['FRAME-ID'], fields['FRAME-TYPE'], `${label} frame`, objects);
    bounds = parseBounds(fields.BOUNDS, `${label} direct bounds`);
    assert(values.length > 0 && sameObjectId(values[0], frameRef.id) === true,
      `${label} first returned value is not the captured frame`);
  }
  if (args[0]?.kind === 'object') assert(args[0].id === argumentId,
    `${label} argument identity differs from first object argument`);
  if (args[0]?.kind === 'nil') assert(argumentId === 0, `${label} NIL argument identity differs`);
  return { event, args, values, argumentId, frameId, frameType, bounds };
}

function descriptorIdentity(descriptorValue) {
  if (descriptorValue?.kind === 'object') return descriptorValue.id;
  if (descriptorValue?.kind === 'nil') return 0;
  return null;
}

export function parseBrushStrokeBoundaryReport(source, { sourceMetadata = {} } = {}) {
  assert(typeof source === 'string', 'Report source must be UTF-8 text');
  assert(Buffer.byteLength(source, 'utf8') <= MAX_REPORT_BYTES, 'Report exceeds byte cap');
  const iterator = linesOf(source);
  let lineNumber = 0;
  const next = (label) => {
    const step = iterator.next();
    lineNumber += 1;
    assert(!step.done, `Missing ${label} at end of report`);
    return step.value;
  };

  assert(next('BEGIN') === 'BEGIN brush-stroke-boundary v1', 'Missing brush-stroke-boundary v1 header');
  const capsFields = record(next('CAPS'), 'CAPS', EXPECTED_CAP_ORDER);
  const capValues = Object.create(null);
  for (const key of EXPECTED_CAP_ORDER) {
    const expected = key === 'map-cells' ? CAPS.mapCells
      : key === 'total-cells' ? CAPS.totalCells
        : key === 'path' ? CAPS.path : CAPS[key];
    capValues[key] = int(capsFields[key], `CAPS ${key}`, 1);
    assert(capValues[key] === expected, `CAPS ${key} differs from the v1 protocol`);
  }

  const installations = [];
  for (const expectedName of INSTALL_ORDER) {
    const fields = record(next('INSTALL'), 'INSTALL', ['name', 'type']);
    const name = str(fields.name, 'INSTALL name');
    assert(name === expectedName, `INSTALL order differs at ${expectedName}`);
    installations.push({ name, type: str(fields.type, `INSTALL ${name} type`) });
  }
  assert(next('READY') === 'READY', 'Missing READY after INSTALL records');

  const objects = new Map();
  const objectRecords = [];
  const strokes = [];
  const clears = [];
  const strokeStack = [];
  const clearStack = [];
  const allScreens = new Map();
  const observedEvents = new Set();
  const totals = { points: 0, cells: 0, runs: 0, predicates: 0, screens: 0, frameReads: 0 };
  let latestValue3 = 0;
  let otherStrokesAfterValue3 = 0;
  let sampledCount = 0;
  let maxObservedEvent = 0;
  let complete = null;
  let ended = false;

  function claimEvent(value, label) {
    const event = int(value, `${label} event`, 1, CAPS.events);
    assert(!observedEvents.has(event), `${label} duplicates event ${event}`);
    observedEvents.add(event);
    if (event > maxObservedEvent) maxObservedEvent = event;
    return event;
  }

  function currentStroke(label) {
    const current = strokeStack.at(-1);
    assert(current, `${label} appears outside BRUSH-STROKE`);
    return current;
  }

  function currentClear(label) {
    const current = clearStack.at(-1);
    assert(current, `${label} appears outside CLEAR-FILL-MAP`);
    return current;
  }

  for (;;) {
    const line = next('record or END');
    assert(line.length > 0, `Blank record at line ${lineNumber}`);
    if (line === 'END brush-stroke-boundary v1') {
      assert(complete, 'END appears before COMPLETE');
      assert(strokeStack.length === 0 && clearStack.length === 0 && allScreens.size === 0,
        'END appears with an active stroke, clear, or screen call');
      ended = true;
      break;
    }
    assert(!complete, 'Record appears after COMPLETE');

    if (line.startsWith('OBJECT ')) {
      const fields = record(line, 'OBJECT', ['id', 'type']);
      const id = int(fields.id, 'OBJECT id', 1, CAPS.objects);
      const type = str(fields.type, `OBJECT ${id} type`);
      assert(id === objectRecords.length + 1, 'OBJECT ids are not contiguous and first-use ordered');
      objects.set(id, type);
      objectRecords.push({ id, type });
      assert(objectRecords.length <= CAPS.objects, 'OBJECT cap exceeded');
    } else if (line.startsWith('STROKE-BEGIN ')) {
      const fields = record(line, 'STROKE-BEGIN',
        ['id', 'event', 'argc', 'args', 'value', 'path-id', 'path-length', 'sampled']);
      const id = int(fields.id, 'STROKE-BEGIN id', 1, CAPS.strokes);
      assert(id === strokes.length + 1, 'STROKE-BEGIN ids are not contiguous');
      const event = claimEvent(fields.event, `STROKE-BEGIN ${id}`);
      const argc = int(fields.argc, `STROKE-BEGIN ${id} argc`, 0, CAPS.values);
      assert(argc === 4, `STROKE-BEGIN ${id} must have exactly four arguments`);
      const args = descriptors(fields.args, `STROKE-BEGIN ${id} args`, objects);
      assert(args.length === argc, `STROKE-BEGIN ${id} argc differs from args`);
      const value = descriptor(fields.value, `STROKE-BEGIN ${id} value`, objects);
      const pathId = int(fields['path-id'], `STROKE-BEGIN ${id} path id`, 0, CAPS.objects);
      const pathLength = int(fields['path-length'], `STROKE-BEGIN ${id} path length`, 0, CAPS.path);
      const sampled = bool(fields.sampled, `STROKE-BEGIN ${id} sampled`);
      assert(args[1].kind === 'integer' && value.kind === 'integer' && args[1].value === value.value,
        `STROKE-BEGIN ${id} value must be an integer matching the second argument`);
      assert(args[2].kind === 'integer' && args[3].kind === 'integer',
        `STROKE-BEGIN ${id} CDEX/SDEX must be integers`);
      assert(sampled === (value.kind === 'integer' && value.value === 3),
        `STROKE-BEGIN ${id} sampled flag differs from value`);
      assert(descriptorIdentity(args[0]) === pathId, `STROKE-BEGIN ${id} path identity differs from args`);
      assert(pathLength === 0 ? pathId === 0 : pathId > 0, `STROKE-BEGIN ${id} path id/length shape differs`);
      if (sampled) assert(pathLength > 0, `Sampled STROKE-BEGIN ${id} has an empty path`);
      if (value.kind === 'integer' && value.value === 3) {
        latestValue3 = id;
        otherStrokesAfterValue3 = 0;
      } else if (latestValue3 > 0) otherStrokesAfterValue3 += 1;
      const call = {
        id, event, parentStrokeId: strokeStack.at(-1)?.id ?? null,
        argc, args, value: value.value, valueDescriptor: value, cdex: args[2].value, sdex: args[3].value,
        pathId, pathLength, sampled, before: null, after: null,
        predicates: [], screens: [], values: null, returnPathEq: null,
        _pendingScreens: new Set(),
      };
      strokes.push(call);
      strokeStack.push(call);
      assert(strokes.length <= CAPS.strokes, 'STROKES cap exceeded');
      if (sampled) {
        sampledCount += 1;
        assert(sampledCount <= CAPS.sampled, 'Sampled stroke cap exceeded');
      }
    } else if (line.startsWith('STROKE-INPUT ')) {
      const fields = record(line, 'STROKE-INPUT', ['id', 'event', 'data']);
      const call = currentStroke('STROKE-INPUT');
      const id = int(fields.id, 'STROKE-INPUT id', 1, CAPS.strokes);
      const event = int(fields.event, `STROKE-INPUT ${id} event`, 1, CAPS.events);
      assert(id === call.id && event === call.event && call.sampled && call.before === null,
        `STROKE-INPUT ${id} does not match a fresh sampled call`);
      call.before = parseSample(fields.data, `STROKE-INPUT ${id}`, objects, totals);
      assert(call.before.path.id === call.pathId && call.before.path.length === call.pathLength,
        `STROKE-INPUT ${id} path identity/length differs from entry`);
      assert(call.before.brushBoundaryValue.kind === 'integer'
        && call.before.brushBoundaryValue.value === 3,
      `STROKE-INPUT ${id} brush boundary value differs from sampled value`);
    } else if (line.startsWith('IN-SUB-FRAME ')) {
      const fields = record(line, 'IN-SUB-FRAME', ['event', 'stroke', 'args', 'values']);
      const call = currentStroke('IN-SUB-FRAME');
      const event = claimEvent(fields.event, 'IN-SUB-FRAME');
      const strokeId = int(fields.stroke, 'IN-SUB-FRAME stroke id', 1, CAPS.strokes);
      assert(strokeId === call.id && call.sampled && call.before && call.after === null,
        `IN-SUB-FRAME does not belong to the active sampled stroke`);
      const args = descriptors(fields.args, `IN-SUB-FRAME ${event} args`, objects);
      assert(args.length === 2 && args.every((arg) => arg.kind === 'integer'),
        `IN-SUB-FRAME ${event} must have two integer arguments`);
      const values = descriptors(fields.values, `IN-SUB-FRAME ${event} values`, objects);
      call.predicates.push({ event, args, values });
      totals.predicates += 1;
      assert(totals.predicates <= CAPS.predicates, 'Captured predicate cap exceeded');
    } else if (line.startsWith('SCREEN-BEGIN ')) {
      const fields = record(line, 'SCREEN-BEGIN',
        ['event', 'stroke', 'args', 'path-id', 'path-eq', 'cdex', 'sdex']);
      const call = currentStroke('SCREEN-BEGIN');
      const event = claimEvent(fields.event, 'SCREEN-BEGIN');
      const strokeId = int(fields.stroke, 'SCREEN-BEGIN stroke id', 1, CAPS.strokes);
      assert(strokeId === call.id && call.sampled && call.before && call.after === null,
        'SCREEN-BEGIN does not belong to the active sampled stroke');
      const args = descriptors(fields.args, `SCREEN-BEGIN ${event} args`, objects);
      assert(args.length === 3, `SCREEN-BEGIN ${event} must have three arguments`);
      const pathId = int(fields['path-id'], `SCREEN-BEGIN ${event} path id`, 0, CAPS.objects);
      const pathEq = bool(fields['path-eq'], `SCREEN-BEGIN ${event} path-eq`);
      const cdex = descriptor(fields.cdex, `SCREEN-BEGIN ${event} CDEX`, objects);
      const sdex = descriptor(fields.sdex, `SCREEN-BEGIN ${event} SDEX`, objects);
      assert(pathEq && pathId === call.pathId && descriptorIdentity(args[0]) === pathId,
        `SCREEN-BEGIN ${event} path is not the active stroke path`);
      assert(args[1].kind === 'integer' && args[2].kind === 'integer'
        && cdex.kind === 'integer' && sdex.kind === 'integer'
        && args[1].value === cdex.value && args[2].value === sdex.value
        && cdex.value === call.cdex && sdex.value === call.sdex,
      `SCREEN-BEGIN ${event} indices differ from BRUSH-STROKE arguments`);
      const screen = { event, args, pathId, pathEq, cdex: cdex.value, sdex: sdex.value,
        values: null, returnPathEq: null };
      call.screens.push(screen);
      call._pendingScreens.add(event);
      allScreens.set(event, { call, screen });
      totals.screens += 1;
    } else if (line.startsWith('SCREEN-RETURN ')) {
      const fields = record(line, 'SCREEN-RETURN', ['event', 'stroke', 'values', 'return-path-eq']);
      const event = int(fields.event, 'SCREEN-RETURN event', 1, CAPS.events);
      const strokeId = int(fields.stroke, 'SCREEN-RETURN stroke id', 1, CAPS.strokes);
      const pending = allScreens.get(event);
      assert(pending && pending.call.id === strokeId && pending.call === strokeStack.at(-1),
        `SCREEN-RETURN ${event} has no matching active SCREEN-BEGIN`);
      const values = descriptors(fields.values, `SCREEN-RETURN ${event} values`, objects);
      const returnPathEq = bool(fields['return-path-eq'], `SCREEN-RETURN ${event} return-path-eq`);
      if (values.length > 0) {
        const identity = sameObjectId(values[0], pending.call.pathId);
        if (identity !== null) assert(identity === returnPathEq,
          `SCREEN-RETURN ${event} identity flag disagrees with first value`);
      }
      pending.screen.values = values;
      pending.screen.returnPathEq = returnPathEq;
      pending.call._pendingScreens.delete(event);
      allScreens.delete(event);
    } else if (line.startsWith('STROKE-RETURN ')) {
      const fieldsRaw = parseLispRecord(line, 'STROKE-RETURN');
      const call = currentStroke('STROKE-RETURN');
      const id = int(fieldsRaw.id, 'STROKE-RETURN id', 1, CAPS.strokes);
      const event = int(fieldsRaw.event, `STROKE-RETURN ${id} event`, 1, CAPS.events);
      assert(id === call.id && event === call.event && call._pendingScreens.size === 0,
        `STROKE-RETURN ${id} does not match active call or has pending screens`);
      if (call.sampled) {
        exactKeys(fieldsRaw, ['id', 'event', 'predicates', 'screens', 'data'], 'STROKE-RETURN sampled');
        assert(call.before, `STROKE-RETURN ${id} lacks STROKE-INPUT`);
        const predicateCount = int(fieldsRaw.predicates, `STROKE-RETURN ${id} predicate count`, 0, CAPS.predicates);
        const screenCount = int(fieldsRaw.screens, `STROKE-RETURN ${id} screen count`, 0, CAPS.events);
        assert(predicateCount === call.predicates.length && screenCount === call.screens.length,
          `STROKE-RETURN ${id} local predicate/screen counts differ`);
        const outputState = parseSample(fieldsRaw.data, `STROKE-RETURN ${id}`, objects, totals, { output: true });
        call.values = outputState.values;
        call.returnPathEq = outputState.returnPathEq;
        delete outputState.values;
        delete outputState.returnPathEq;
        call.after = outputState;
        assert(call.after.path.id === call.pathId && call.after.path.length === call.pathLength,
          `STROKE-RETURN ${id} path identity/length differs from entry`);
        call._sampleCounts = { predicates: predicateCount, screens: screenCount };
      } else {
        exactKeys(fieldsRaw, ['id', 'event', 'values', 'return-path-eq'], 'STROKE-RETURN unsampled');
        call.values = descriptors(fieldsRaw.values, `STROKE-RETURN ${id} values`, objects);
        call.returnPathEq = bool(fieldsRaw['return-path-eq'], `STROKE-RETURN ${id} return-path-eq`);
        if (call.values.length > 0) {
          const identity = sameObjectId(call.values[0], call.pathId);
          if (identity !== null) assert(identity === call.returnPathEq,
            `STROKE-RETURN ${id} identity flag disagrees with first value`);
        }
      }
      call.returnEvent = event;
      delete call._pendingScreens;
      delete call._sampleCounts;
      strokeStack.pop();
    } else if (line.startsWith('CLEAR-BEGIN ')) {
      const fields = record(line, 'CLEAR-BEGIN',
        ['id', 'event', 'args', 'latest-value3', 'other-strokes-after-value3', 'map']);
      const id = int(fields.id, 'CLEAR-BEGIN id', 1, CAPS.clears);
      assert(id === clears.length + 1, 'CLEAR-BEGIN ids are not contiguous');
      const event = claimEvent(fields.event, `CLEAR-BEGIN ${id}`);
      const args = descriptors(fields.args, `CLEAR-BEGIN ${id} args`, objects);
      assert(args.length === 2 && args.every((arg) => arg.kind === 'integer'),
        `CLEAR-BEGIN ${id} must have two integer arguments`);
      const observedLatest = int(fields['latest-value3'], `CLEAR-BEGIN ${id} latest-value3`, 0, CAPS.strokes);
      const observedOther = int(fields['other-strokes-after-value3'],
        `CLEAR-BEGIN ${id} other-strokes-after-value3`, 0, CAPS.strokes);
      assert(observedLatest === latestValue3 && observedOther === otherStrokesAfterValue3,
        `CLEAR-BEGIN ${id} chronology counters differ from observed stroke stream`);
      const beforeMap = parseMap(fields.map, `CLEAR-BEGIN ${id} map`, objects, totals);
      const clear = { id, event, args, cdex: args[0].value, sdex: args[1].value,
        latestValue3: observedLatest, otherStrokesAfterValue3: observedOther,
        beforeMap, afterMap: null, frames: [], values: null, returnEvent: null };
      clears.push(clear);
      clearStack.push(clear);
    } else if (line.startsWith('CFRAME ')) {
      const fields = record(line, 'CFRAME', ['event', 'clear', 'data']);
      const clear = currentClear('CFRAME');
      const event = claimEvent(fields.event, 'CFRAME');
      const clearId = int(fields.clear, 'CFRAME clear id', 1, CAPS.clears);
      assert(clearId === clear.id, 'CFRAME refers to a nonactive CLEAR-FILL-MAP');
      const frame = parseFrame(fields.data, `CFRAME ${event}`, objects);
      assert(frame.event === event, `CFRAME ${event} inner event differs`);
      clear.frames.push(frame);
      totals.frameReads += 1;
    } else if (line.startsWith('CLEAR-RETURN ')) {
      const fields = record(line, 'CLEAR-RETURN',
        ['id', 'event', 'values', 'latest-value3', 'other-strokes-after-value3', 'frames', 'map']);
      const clear = currentClear('CLEAR-RETURN');
      const id = int(fields.id, 'CLEAR-RETURN id', 1, CAPS.clears);
      const event = int(fields.event, `CLEAR-RETURN ${id} event`, 1, CAPS.events);
      assert(id === clear.id && event === clear.event, `CLEAR-RETURN ${id} does not match active clear`);
      const latest = int(fields['latest-value3'], `CLEAR-RETURN ${id} latest-value3`, 0, CAPS.strokes);
      const other = int(fields['other-strokes-after-value3'],
        `CLEAR-RETURN ${id} other-strokes-after-value3`, 0, CAPS.strokes);
      assert(latest === latestValue3 && other === otherStrokesAfterValue3,
        `CLEAR-RETURN ${id} chronology counters differ from observed stroke stream`);
      const values = descriptors(fields.values, `CLEAR-RETURN ${id} values`, objects);
      const framesRaw = properList(fields.frames, `CLEAR-RETURN ${id} frames`, CAPS.events);
      const frames = framesRaw.map((frame, index) => parseFrame(frame, `CLEAR-RETURN ${id} frame ${index}`, objects));
      assert(frames.length === clear.frames.length
        && frames.every((frame, index) => isDeepStrictEqual(frame, clear.frames[index])),
      `CLEAR-RETURN ${id} frame list differs from natural CFRAME records`);
      clear.afterMap = parseMap(fields.map, `CLEAR-RETURN ${id} map`, objects, totals);
      clear.values = values;
      clear.latestValue3 = latest;
      clear.otherStrokesAfterValue3 = other;
      clear.returnEvent = event;
      clearStack.pop();
    } else if (line.startsWith('COMPLETE ')) {
      assert(strokeStack.length === 0 && clearStack.length === 0 && allScreens.size === 0,
        'COMPLETE appears with active calls');
      const fields = record(line, 'COMPLETE', ['main', 'strokes', 'sampled', 'clears', 'events',
        'predicates', 'screens', 'frame-reads', 'points', 'cells', 'runs', 'objects', 'checks',
        'errors', 'aborts', 'overflow', 'stroke-active', 'clear-active']);
      keyword(fields.main, 'NORMAL', 'COMPLETE main status');
      const counters = Object.create(null);
      for (const name of ['strokes', 'sampled', 'clears', 'events', 'predicates', 'screens',
        'frame-reads', 'points', 'cells', 'runs', 'objects', 'checks', 'errors', 'aborts']) {
        counters[name] = int(fields[name], `COMPLETE ${name}`, 0);
      }
      assert(fields.overflow === null && fields['stroke-active'] === null && fields['clear-active'] === null,
        'COMPLETE reports overflow or active calls');
      assert(counters.errors === 0 && counters.aborts === 0, 'COMPLETE reports observer errors or aborts');
      assert(counters.strokes === strokes.length && counters.sampled === sampledCount
        && counters.clears === clears.length, 'COMPLETE stroke/sample/clear totals differ from records');
      assert(counters.events >= maxObservedEvent,
        'COMPLETE event total is below an observed event id');
      assert(counters.events === counters.predicates + counters.screens + counters.strokes
        + counters.clears + counters['frame-reads'],
      'COMPLETE event total differs from the frozen v1 event allocation equation');
      assert(counters.predicates >= totals.predicates && counters.screens >= totals.screens,
        'COMPLETE predicate/screen totals are below the sampled event stream');
      assert(counters['frame-reads'] === totals.frameReads,
        'COMPLETE frame-read total differs from captured CFRAME calls');
      assert(counters.points === totals.points && counters.cells === totals.cells && counters.runs === totals.runs,
        'COMPLETE points/cells/runs differ from serialized snapshots');
      assert(counters.objects === objectRecords.length, 'COMPLETE object total differs from declarations');
      const expectedChecks = 2 * counters.strokes + counters.sampled
        + 2 * totals.screens + 2 * counters.clears + totals.frameReads;
      assert(counters.checks === expectedChecks,
        `COMPLETE checks ${counters.checks} differ from derived observation count ${expectedChecks}`);
      assert(counters.strokes <= CAPS.strokes && counters.sampled <= CAPS.sampled
        && counters.clears <= CAPS.clears && counters.events <= CAPS.events
        && counters.predicates <= CAPS.predicates && counters.points <= CAPS.points
        && counters.cells <= CAPS.totalCells && counters.runs <= CAPS.runs
        && counters.objects <= CAPS.objects,
      'COMPLETE exceeds a declared v1 cap');
      complete = { main: 'NORMAL', ...counters,
        sampledPredicateRecords: totals.predicates, sampledScreenRecords: totals.screens,
        capturedFrameReads: totals.frameReads, observations: {
          eventIdsUnique: observedEvents.size,
          entryAndReturnPairsMatch: true,
          clearFramesMatchCframeRecords: true,
        } };
    } else if (/^(ERROR|ABORT|OVERFLOW)(?: |$)/.test(line)) {
      throw new Error(`Rejected ${line.split(' ', 1)[0]} record: ${line.slice(0, 160)}`);
    } else {
      throw new Error(`Unsupported or rejected record at line ${lineNumber}: ${line.slice(0, 120)}`);
    }
  }

  assert(ended && complete, 'Missing terminal END or COMPLETE record');
  const trailing = iterator.next();
  assert(trailing.done, 'Data follows terminal END record');
  assert(strokes.every((call) => call.values !== null && call.returnPathEq !== null
    && (!call.sampled || (call.before !== null && call.after !== null))),
  'One or more BRUSH-STROKE calls lack a paired return or required snapshots');
  assert(clears.every((clear) => clear.afterMap !== null && clear.values !== null && clear.returnEvent !== null),
    'One or more CLEAR-FILL-MAP calls lack a paired return/map');

  const sourceBytes = Buffer.from(source, 'utf8');
  const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const report = {
    schema: 'aaron-brush-stroke-boundary-evidence-v1',
    schemaVersion: 1,
    sourceSha256,
    source: { ...sourceMetadata, sha256: sourceSha256 },
    caps: { ...CAPS, reportBytes: MAX_REPORT_BYTES },
    installations,
    objects: objectRecords,
    strokes: strokes.map(({ _pendingScreens, _sampleCounts, ...call }) => call),
    clears,
    complete,
  };
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, ...extra] = process.argv.slice(2);
  assert(input && output && extra.length === 0,
    'Usage: node parse-brush-stroke-boundary-report.mjs <report.txt> <fresh.json>');
  const bytes = readFileSync(input);
  assert(bytes.byteLength <= MAX_REPORT_BYTES, 'Report exceeds byte cap');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const report = parseBrushStrokeBoundaryReport(source, {
    sourceMetadata: { reportPath: input, reportSha256: createHash('sha256').update(bytes).digest('hex') },
  });
  writeFileSync(output, `${JSON.stringify(report)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ output, ...report.complete })}\n`);
}
