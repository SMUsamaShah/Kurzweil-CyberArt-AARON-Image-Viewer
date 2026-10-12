#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  basename, isAbsolute, relative, resolve, sep,
} from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { sha256 } from './index-allegro-image.mjs';
import { applyObservedNaturalBrushStrokeValue0 } from '../../engine/src/aaron-brush-stroke.js';
import { AARON_BRUSH_PROFILES } from '../../engine/src/aaron-brushes.js';
import { createAaronMaps } from '../../engine/src/aaron-maps.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = path => readFileSync(resolve(path));
const sameBytes = (left, right) => left.equals(right);
const within = (parent, candidate) => {
  const rel = relative(parent, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
};
const integer = (value, label, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) => {
  assert(value?.kind === 'number' && /^[-+]?\d+$/.test(value.raw)
    && Number.isSafeInteger(value.value) && value.value >= minimum && value.value <= maximum,
  label + ' must be an integer in range');
  return value.value;
};
const keyword = (value, label) => {
  assert(value?.kind === 'keyword', label + ' must be a keyword');
  return value.name;
};
const symbol = (value, label) => {
  assert(value?.kind === 'symbol', label + ' must be a symbol');
  return value.name;
};
const string = (value, label) => {
  assert(value?.kind === 'string', label + ' must be a string');
  return value.value;
};
const list = (value, label) => {
  assert(Array.isArray(value), label + ' must be a proper list');
  return value;
};
const hexSha = (value, label) => {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value), label + ' is not a SHA-256');
  return value.toLowerCase();
};

function plist(value, label) {
  const entries = list(value, label);
  assert(entries.length % 2 === 0, label + ' has an odd property count');
  const result = Object.create(null);
  for (let index = 0; index < entries.length; index += 2) {
    const name = keyword(entries[index], label + ' key');
    assert(!Object.hasOwn(result, name), label + ' has duplicate :' + name);
    result[name] = entries[index + 1];
  }
  return result;
}

function portable(value) {
  if (value === null || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(portable);
  if (value?.kind === 'number') return value.value;
  if (value?.kind === 'keyword') return ':' + value.name;
  if (value?.kind === 'symbol') return value.name;
  if (value?.kind === 'string') return value.value;
  throw new Error('Unsupported Lisp value in captured report');
}

function descriptor(value, label) {
  const values = list(value, label);
  assert(values.length >= 1, label + ' has no descriptor tag');
  const tag = keyword(values[0], label + ' tag');
  if (tag === 'NIL') {
    assert(values.length === 1, label + ' NIL descriptor has extra fields');
    return { kind: 'nil' };
  }
  if (tag === 'INTEGER') {
    assert(values.length === 2, label + ' integer descriptor has the wrong arity');
    return { kind: 'integer', value: integer(values[1], label + ' value') };
  }
  if (tag === 'OBJECT') {
    assert(values.length === 3, label + ' object descriptor has the wrong arity');
    return {
      kind: 'object',
      id: integer(values[1], label + ' object id', 1),
      type: string(values[2], label + ' object type'),
    };
  }
  if (tag === 'SYMBOL') {
    assert(values.length === 3, label + ' symbol descriptor has the wrong arity');
    return {
      kind: 'symbol',
      package: string(values[1], label + ' symbol package'),
      name: string(values[2], label + ' symbol name'),
    };
  }
  throw new Error(label + ' uses unsupported descriptor :' + tag);
}

function exactRecord(line, name, expectedNames) {
  const fields = parseLispRecord(line, name);
  const keys = Object.keys(fields);
  assert(keys.length === expectedNames.length && expectedNames.every(key => Object.hasOwn(fields, key)),
    name + ' field set differs');
  return fields;
}

function parseMapBegin(line) {
  const fields = exactRecord(line, 'MAP-BEGIN', [
    'phase', 'stroke', 'sample', 'event', 'id', 'type', 'element-type',
    'width', 'height', 'cells',
  ]);
  const phase = keyword(fields.phase, 'MAP-BEGIN phase');
  const type = string(fields.type, 'MAP-BEGIN type');
  const elementType = list(fields['element-type'], 'MAP-BEGIN element type');
  assert(elementType.length === 2
    && symbol(elementType[0], 'MAP-BEGIN element type') === 'UNSIGNED-BYTE'
    && integer(elementType[1], 'MAP-BEGIN element bits') === 4,
  'MAP-BEGIN is not an unsigned-byte-4 map');
  const width = integer(fields.width, 'MAP-BEGIN width', 1, 4096);
  const height = integer(fields.height, 'MAP-BEGIN height', 1, 4096);
  const cells = integer(fields.cells, 'MAP-BEGIN cells', 1, 20_000_000);
  assert(type === '(ARRAY (UNSIGNED-BYTE 4) (' + width + ' ' + height + '))'
    && cells === width * height, 'MAP-BEGIN type or cell count differs from dimensions');
  return {
    phase,
    strokeId: integer(fields.stroke, 'MAP-BEGIN stroke id', 1),
    sampleId: integer(fields.sample, 'MAP-BEGIN sample id', 1),
    eventId: integer(fields.event, 'MAP-BEGIN event id', 1),
    id: integer(fields.id, 'MAP-BEGIN map id', 1),
    type, width, height, cells, rows: [], runCount: 0,
  };
}

function parseMapRow(line, map) {
  const fields = exactRecord(line, 'MAP-ROW', ['phase', 'stroke', 'sample', 'event', 'y', 'runs']);
  assert(keyword(fields.phase, 'MAP-ROW phase') === map.phase
    && integer(fields.stroke, 'MAP-ROW stroke') === map.strokeId
    && integer(fields.sample, 'MAP-ROW sample') === map.sampleId
    && integer(fields.event, 'MAP-ROW event') === map.eventId,
  'MAP-ROW identity differs from its open map');
  const y = integer(fields.y, 'MAP-ROW y', 0, map.height - 1);
  assert(y === map.rows.length, 'MAP-ROW rows are missing, duplicated, or reordered');
  const rawRuns = list(fields.runs, 'MAP-ROW runs');
  assert(rawRuns.length > 0, 'MAP-ROW has no runs');
  let previous = null;
  let covered = 0;
  const runs = rawRuns.map((raw, index) => {
    const pair = list(raw, 'MAP-ROW run ' + index);
    assert(pair.length === 2, 'MAP-ROW run ' + index + ' is not a value/count pair');
    const value = integer(pair[0], 'MAP-ROW run ' + index + ' value', 0, 15);
    const count = integer(pair[1], 'MAP-ROW run ' + index + ' count', 1, map.width);
    assert(previous === null || previous !== value, 'MAP-ROW ' + y + ' RLE is not maximal');
    previous = value;
    covered += count;
    map.runCount += 1;
    return [value, count];
  });
  assert(covered === map.width, 'MAP-ROW ' + y + ' covers ' + covered + '/' + map.width + ' cells');
  map.rows.push({ y, runs });
}

function finishMap(line, map) {
  const fields = exactRecord(line, 'MAP-END', [
    'phase', 'stroke', 'sample', 'event', 'id', 'rows', 'cells', 'covered', 'runs', 'complete',
  ]);
  assert(keyword(fields.phase, 'MAP-END phase') === map.phase
    && integer(fields.stroke, 'MAP-END stroke') === map.strokeId
    && integer(fields.sample, 'MAP-END sample') === map.sampleId
    && integer(fields.event, 'MAP-END event') === map.eventId
    && integer(fields.id, 'MAP-END id') === map.id,
  'MAP-END identity differs from its open map');
  assert(integer(fields.rows, 'MAP-END rows') === map.height && map.rows.length === map.height
    && integer(fields.cells, 'MAP-END cells') === map.cells
    && integer(fields.covered, 'MAP-END covered') === map.cells
    && integer(fields.runs, 'MAP-END runs') === map.runCount && fields.complete === true,
  'MAP-END coverage differs from its serialized rows');
  const bytes = new Uint8Array(map.cells);
  const counts = Object.fromEntries(Array.from({ length: 16 }, (_, value) => [value, 0]));
  for (const row of map.rows) {
    let x = 0;
    for (const [value, count] of row.runs) {
      counts[value] += count;
      for (let offset = 0; offset < count; offset += 1) {
        bytes[(x + offset) * map.height + row.y] = value;
      }
      x += count;
    }
    assert(x === map.width, 'MAP-END row ' + row.y + ' did not cover its width');
  }
  assert(Object.values(counts).reduce((total, count) => total + count, 0) === map.cells,
    'Expanded map value counts do not cover all cells');
  return { ...map, counts, sha256: sha256(Buffer.from(bytes)), bytes };
}

function compareMaps(before, after) {
  assert(before.width === after.width && before.height === after.height
    && before.id === after.id && before.type === after.type,
  'Map identity or dimensions changed between snapshots');
  const transitions = Object.create(null);
  let changedCells = 0;
  let minX = before.width, maxX = -1, minY = before.height, maxY = -1;
  for (let index = 0; index < before.bytes.length; index += 1) {
    const from = before.bytes[index], to = after.bytes[index];
    if (from === to) continue;
    changedCells += 1;
    transitions[from + '->' + to] = (transitions[from + '->' + to] ?? 0) + 1;
    const x = Math.floor(index / before.height), y = index % before.height;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    from: before.phase,
    to: after.phase,
    changedCells,
    transitions,
    boundsXY: changedCells ? { left: minX, right: maxX, top: minY, bottom: maxY } : null,
    mapSha256From: before.sha256,
    mapSha256To: after.sha256,
  };
}

function descriptorTruth(value, label) {
  const item = descriptor(value, label);
  if (item.kind === 'nil') return false;
  assert(item.kind === 'symbol' && item.package === 'COMMON-LISP'
    && item.name === 'T', label + ' must return exactly T or NIL');
  return true;
}

function parseCapture(raw) {
  const text = raw.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(raw), 'Capture is not valid round-trip UTF-8');
  assert(!text.includes('\r') || text.replace(/\r\n/g, '').indexOf('\r') < 0,
    'Capture has bare carriage returns');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  assert(lines[0] === 'BEGIN brush-stroke-value0 v6 index4'
    && lines.at(-1) === 'END brush-stroke-value0-v6-index4',
  'Capture v6 index-4 begin/end markers differ');
  const count = prefix => lines.filter(line => line.startsWith(prefix)).length;
  assert(count('READY') === 1 && count('COMPLETE version=6 ') === 1
    && count('END brush-stroke-value0-v6-index4') === 1,
  'Capture must contain exactly one READY, v6 COMPLETE, and END');
  assert(count('CAPS ') === 1, 'Capture must contain exactly one CAPS record');

  const selections = [];
  const selectedCalls = new Map();
  const inputs = new Map();
  const returns = new Map();
  const predicateRecords = new Map();
  const screens = new Map();
  const screenReturns = new Map();
  const restores = [];
  const rngPreviews = [];
  const installNames = [];
  const maps = [];
  let currentMap;
  let complete;
  let caps;
  const errorLines = [];

  for (const [lineIndex, line] of lines.entries()) {
    const lineOrder = lineIndex + 1;
    if (line.startsWith('CAPS ')) {
      caps = parseLispRecord(line, 'CAPS');
    } else if (/^(?:ERROR|SETUP-ERROR|CAPTURE-ERROR|MAP-ERROR|OVERFLOW|ABORT)(?:\s|$)/.test(line)) {
      errorLines.push(line);
    } else if (line.startsWith('INSTALL ')) {
      const fields = exactRecord(line, 'INSTALL', ['name', 'type']);
      installNames.push(string(fields.name, 'INSTALL name'));
      string(fields.type, 'INSTALL type');
    } else if (line.startsWith('SAMPLE-SELECT ')) {
      const fields = exactRecord(line, 'SAMPLE-SELECT', ['id', 'class', 'path-length', 'eligibility', 'mask']);
      selections.push({
        strokeId: integer(fields.id, 'SAMPLE-SELECT stroke id', 1),
        class: keyword(fields.class, 'SAMPLE-SELECT class'),
        pathLength: integer(fields['path-length'], 'SAMPLE-SELECT path length', 0, 20_000),
        eligibility: keyword(fields.eligibility, 'SAMPLE-SELECT eligibility'),
        mask: fields.mask === null ? null : portable(fields.mask),
      });
    } else if (line.startsWith('STROKE-BEGIN ')) {
      const fields = parseLispRecord(line, 'STROKE-BEGIN');
      if (fields.selected === true) {
        const id = integer(fields.id, 'STROKE-BEGIN id', 1);
        assert(!selectedCalls.has(id), 'Selected STROKE-BEGIN ' + id + ' is duplicated');
        const args = list(fields.args, 'STROKE-BEGIN args');
        selectedCalls.set(id, {
          strokeId: id,
          eventId: integer(fields.event, 'STROKE-BEGIN event', 1),
          argumentCount: integer(fields.argc, 'STROKE-BEGIN argc', 0),
          arguments: args.map((item, index) => descriptor(item, 'STROKE-BEGIN arg ' + index)),
          value: descriptor(fields.value, 'STROKE-BEGIN value'),
          pathKind: keyword(fields['path-kind'], 'STROKE-BEGIN path kind'),
          sampleId: integer(fields.sample, 'STROKE-BEGIN sample id', 1),
        });
      }
    } else if (line.startsWith('STROKE-INPUT ')) {
      const fields = parseLispRecord(line, 'STROKE-INPUT');
      if (fields.sample !== undefined && fields.sample !== null) {
        const id = integer(fields.id, 'STROKE-INPUT id', 1);
        assert(!inputs.has(id), 'Selected STROKE-INPUT ' + id + ' is duplicated');
        inputs.set(id, {
          eventId: integer(fields.event, 'STROKE-INPUT event', 1),
          sampleId: integer(fields.sample, 'STROKE-INPUT sample', 1),
          data: plist(fields.data, 'STROKE-INPUT data'),
        });
      }
    } else if (line.startsWith('STROKE-RETURN ')) {
      const fields = parseLispRecord(line, 'STROKE-RETURN');
      if (fields.sample !== undefined && fields.sample !== null) {
        const id = integer(fields.id, 'STROKE-RETURN id', 1);
        assert(!returns.has(id), 'Selected STROKE-RETURN ' + id + ' is duplicated');
        const data = plist(fields.data, 'STROKE-RETURN data');
        returns.set(id, {
          eventId: integer(fields.event, 'STROKE-RETURN event', 1),
          sampleId: integer(fields.sample, 'STROKE-RETURN sample', 1),
          predicates: integer(fields.predicates, 'STROKE-RETURN predicates', 0),
          screens: integer(fields.screens, 'STROKE-RETURN screens', 0),
          values: portable(data.VALUES),
          returnPathEq: data['RETURN-PATH-EQ'] === true,
          lineOrder,
        });
      }
    } else if (line.startsWith('IN-SUB-FRAME ')) {
      const fields = exactRecord(line, 'IN-SUB-FRAME', ['event', 'stroke', 'sample', 'args', 'values']);
      const strokeId = integer(fields.stroke, 'IN-SUB-FRAME stroke id', 1);
      const args = list(fields.args, 'IN-SUB-FRAME args')
        .map((item, index) => descriptor(item, 'IN-SUB-FRAME arg ' + index));
      const values = list(fields.values, 'IN-SUB-FRAME values');
      assert(values.length === 1, 'IN-SUB-FRAME must return exactly one value');
      const record = {
        eventId: integer(fields.event, 'IN-SUB-FRAME event', 1),
        strokeId,
        sampleId: integer(fields.sample, 'IN-SUB-FRAME sample', 1),
        arguments: args,
        accepted: descriptorTruth(values[0], 'IN-SUB-FRAME result'),
        lineOrder,
      };
      const records = predicateRecords.get(strokeId) ?? [];
      assert(!records.length || records.at(-1).lineOrder < lineOrder,
        'IN-SUB-FRAME records for stroke ' + strokeId + ' are not ordered');
      records.push(record);
      predicateRecords.set(strokeId, records);
    } else if (line.startsWith('SCREEN-BEGIN ')) {
      const fields = parseLispRecord(line, 'SCREEN-BEGIN');
      if (fields.sample !== undefined && fields.sample !== null) {
        const strokeId = integer(fields.stroke, 'SCREEN-BEGIN stroke id', 1);
        assert(!screens.has(strokeId), 'Selected SCREEN-BEGIN for stroke ' + strokeId + ' is duplicated');
        screens.set(strokeId, {
          eventId: integer(fields.event, 'SCREEN-BEGIN event', 1),
          sampleId: integer(fields.sample, 'SCREEN-BEGIN sample', 1),
          args: portable(fields.args),
          pathId: integer(fields['path-id'], 'SCREEN-BEGIN path id', 0),
          pathEq: fields['path-eq'] === true,
          samplePathEq: fields['sample-path-eq'] === true,
          cdex: portable(fields.cdex),
          sdex: portable(fields.sdex),
          detail: fields.detail === true,
          lineOrder,
        });
      }
    } else if (line.startsWith('SCREEN-RETURN ')) {
      const fields = parseLispRecord(line, 'SCREEN-RETURN');
      if (fields.sample !== undefined && fields.sample !== null) {
        const strokeId = integer(fields.stroke, 'SCREEN-RETURN stroke id', 1);
        assert(!screenReturns.has(strokeId), 'Selected SCREEN-RETURN for stroke ' + strokeId + ' is duplicated');
        screenReturns.set(strokeId, {
          eventId: integer(fields.event, 'SCREEN-RETURN event', 1),
          sampleId: integer(fields.sample, 'SCREEN-RETURN sample', 1),
          values: portable(fields.values),
          returnPathEq: fields['return-path-eq'] === true,
          lineOrder,
        });
      }
    } else if (line.startsWith('MAP-BEGIN ')) {
      assert(!currentMap, 'Nested MAP-BEGIN records are not allowed');
      currentMap = parseMapBegin(line);
    } else if (line.startsWith('MAP-ROW ')) {
      assert(currentMap, 'MAP-ROW appears outside a map');
      parseMapRow(line, currentMap);
    } else if (line.startsWith('MAP-END ')) {
      assert(currentMap, 'MAP-END appears outside a map');
      maps.push(finishMap(line, currentMap));
      currentMap = undefined;
    } else if (line.startsWith('RESTORE ')) {
      const fields = exactRecord(line, 'RESTORE', ['name', 'status']);
      restores.push({
        name: string(fields.name, 'RESTORE name'),
        status: keyword(fields.status, 'RESTORE status'),
      });
    } else if (line.startsWith('RNG-PREVIEW ')) {
      const fields = exactRecord(line, 'RNG-PREVIEW', ['phase', 'before', 'after', 'unchanged']);
      const before = portable(fields.before), after = portable(fields.after);
      rngPreviews.push({ phase: keyword(fields.phase, 'RNG-PREVIEW phase'), unchanged: fields.unchanged === true });
      assert(fields.unchanged === true && JSON.stringify(before) === JSON.stringify(after),
        'A sampled RNG preview changed across its three reported draws');
    } else if (line.startsWith('COMPLETE ')) {
      complete = parseLispRecord(line, 'COMPLETE');
    }
  }

  assert(!currentMap, 'Capture ended while a map was open');
  assert(!errorLines.length, 'Capture contains errors or overflow: ' + errorLines.slice(0, 3).join(' | '));
  assert(complete, 'Capture has no parsed COMPLETE record');
  assert(JSON.stringify(installNames) === JSON.stringify([
    'IN-SUB-FRAME', 'SCREEN-AND-STORE', 'BRUSH-STROKE', 'MAIN',
  ]), 'INSTALL records or order differ');
  const counters = Object.create(null);
  for (const key of [
    'strokes', 'sampled', 'multi-sample', 'events', 'sampled-predicates',
    'sample-screens', 'points', 'offsets', 'snapshots', 'cells', 'runs',
    'objects', 'checks', 'errors', 'aborts',
  ]) counters[key] = integer(complete[key], 'COMPLETE ' + key, 0);
  const completion = {
    version: integer(complete.version, 'COMPLETE version', 6, 6),
    main: keyword(complete.main, 'COMPLETE main'),
    accepted: complete.accepted === true,
    bindingsSafe: complete['bindings-safe'] === true,
    counters,
    rejected: portable(complete.rejected),
    captureDisabled: portable(complete['capture-disabled']),
    sampleComplete: complete['sample-complete'] === true,
    currentStroke: portable(complete['current-stroke']),
  };
  assert(completion.version === 6 && completion.main === 'NORMAL' && completion.accepted
    && completion.bindingsSafe && completion.sampleComplete && completion.counters.errors === 0
    && completion.counters.aborts === 0 && completion.rejected === null
    && completion.captureDisabled === null && completion.currentStroke === null,
  'COMPLETE does not accept one normal, fully restored v6 sample');
  assert(completion.counters.sampled === 1 && completion.counters['multi-sample'] === 1
    && completion.counters['sample-screens'] === 1 && completion.counters.snapshots === 4
    && completion.counters.cells === maps.reduce((sum, map) => sum + map.cells, 0)
    && completion.counters.runs === maps.reduce((sum, map) => sum + map.runCount, 0),
  'COMPLETE sample/map totals differ');
  const cap = Object.fromEntries(Object.entries(caps ?? {}).map(([key, value]) => [key, portable(value)]));
  assert(cap.sampled === 1 && cap.snapshots === 6 && cap['map-cells'] === 829440,
    'CAPS do not match the v6 one-sample capture contract');

  const parsedPredicateCount = [...predicateRecords.values()].reduce((sum, records) => sum + records.length, 0);
  assert(parsedPredicateCount === completion.counters['sampled-predicates']
    && count('IN-SUB-FRAME ') === parsedPredicateCount,
  'IN-SUB-FRAME records differ from COMPLETE sampled-predicate counter');
  assert(selections.length === 1 && selectedCalls.size === 1 && inputs.size === 1
    && returns.size === 1 && screens.size === 1 && screenReturns.size === 1,
  'Capture does not contain exactly one complete selected sample');
  assert(maps.length === 4, 'Capture must contain four complete map snapshots');
  const expectedRestore = [
    { name: 'BRUSH-STROKE', status: 'RESTORED' },
    { name: 'SCREEN-AND-STORE', status: 'OUTER-WRAPPER-PRESERVED' },
    { name: 'IN-SUB-FRAME', status: 'RESTORED' },
    { name: 'MAIN', status: 'OUTER-WRAPPER-PRESERVED' },
  ];
  assert(JSON.stringify(restores) === JSON.stringify(expectedRestore), 'Binding restoration records differ');

  const selection = selections[0];
  const call = selectedCalls.get(selection.strokeId);
  const input = inputs.get(selection.strokeId);
  const returned = returns.get(selection.strokeId);
  const screen = screens.get(selection.strokeId);
  const screenReturn = screenReturns.get(selection.strokeId);
  const sampledPredicates = predicateRecords.get(selection.strokeId) ?? [];
  assert(call && input && returned && screen && screenReturn, 'Selected v6 sample is incomplete');
  assert(selection.class === 'MULTI'
    && selection.eligibility === 'NATURAL-MULTI-INDEX4-WIDTH13-LENGTH-RANGE'
    && selection.pathLength >= 2 && selection.pathLength <= 39,
  'Selection is not a natural multi-point VALUE=0 index-4 width-13 sample');
  assert(call.eventId === input.eventId && input.eventId === returned.eventId
    && call.sampleId === input.sampleId && input.sampleId === returned.sampleId
    && call.sampleId === screen.sampleId && screen.sampleId === screenReturn.sampleId
    && call.sampleId === 1,
  'Selected sample event/sample identities differ');
  assert(call.value.kind === 'integer' && call.value.value === 0
    && call.arguments.length === 4 && call.arguments[1].kind === 'integer'
    && call.arguments[1].value === 0 && returned.screens === 1
    && sampledPredicates.length === returned.predicates,
  'Selected sample is not a four-argument VALUE=0 call with one screen call');
  assert(sampledPredicates.every(predicate => predicate.sampleId === call.sampleId
    && predicate.lineOrder > screenReturn.lineOrder && predicate.lineOrder < returned.lineOrder),
  'Predicate records are not between SCREEN-RETURN and stroke return');
  assert(screen.lineOrder < screenReturn.lineOrder, 'Screen records are out of order');

  const path = plist(input.data.PATH, 'Sample path');
  const pathId = integer(path.ID, 'Sample path id', 1);
  const pathType = string(path.TYPE, 'Sample path type');
  const pathLength = integer(path.LENGTH, 'Sample path length', 2, 39);
  const rawPoints = list(path.POINTS, 'Sample path points');
  const points = rawPoints.map((point, index) => {
    const fields = plist(point, 'Sample point ' + index);
    return {
      id: integer(fields.ID, 'Sample point id', 1),
      type: string(fields.TYPE, 'Sample point type'),
      x: integer(fields.X, 'Sample point x'),
      y: integer(fields.Y, 'Sample point y'),
    };
  });
  assert(pathLength === selection.pathLength && points.length === pathLength && pathType === 'CONS',
    'Captured path differs from selected path length or type');

  const brush = plist(input.data.BRUSH, 'Sample brush');
  const offsets = (value, label) => {
    const record = plist(value, label);
    const entries = record.OFFSETS === null ? [] : list(record.OFFSETS, label + ' offsets');
    return entries.map((entry, index) => {
      const pair = list(entry, label + ' offset ' + index);
      assert(pair.length === 2, label + ' offset ' + index + ' is not a pair');
      return [
        integer(pair[0], label + ' offset x'),
        integer(pair[1], label + ' offset y'),
      ];
    });
  };
  const capturedBrushIndex = integer(brush.INDEX, 'Captured ALL-BRUSHES index', 0);
  const capturedBrushWidth = integer(brush.WIDTH, 'Captured brush width', 1);
  const capturedBrushCore = offsets(brush.CORE, 'Captured CORE');
  const capturedBrushPerim = offsets(brush.PERIM, 'Captured PERIM');
  assert(capturedBrushIndex === 4 && capturedBrushWidth === 13,
    'Captured BRUSH is not ALL-BRUSHES index 4 at width 13');
  const engineProfiles = AARON_BRUSH_PROFILES.filter(profile => profile.width === capturedBrushWidth);
  assert(engineProfiles.length === 1
    && JSON.stringify(engineProfiles[0].core) === JSON.stringify(capturedBrushCore),
  'Captured CORE does not exactly match the unique JavaScript profile at width 13');
  const engineProfile = engineProfiles[0];

  const configuration = plist(input.data.CONFIGURATION, 'Sample configuration');
  const subFrame = plist(configuration['SUB-FRAME'], 'Sample sub-frame');
  const boundary = plist(configuration['BOUNDARY-VALUE'], 'Sample boundary value');
  const boundaryValue = descriptor(boundary.BOUND, 'Sample boundary descriptor');
  const mapInfo = plist(input.data.MAP, 'Sample map descriptor');
  const mapIdentity = {
    id: integer(mapInfo.ID, 'Sample map id', 1),
    type: string(mapInfo.TYPE, 'Sample map type'),
    width: integer(mapInfo.WIDTH, 'Sample map width', 1),
    height: integer(mapInfo.HEIGHT, 'Sample map height', 1),
    cells: integer(mapInfo.CELLS, 'Sample map cells', 1),
    covered: integer(mapInfo.COVERED, 'Sample map covered cells', 1),
    complete: mapInfo.COMPLETE === true,
  };
  assert(mapIdentity.cells === mapIdentity.width * mapIdentity.height
    && mapIdentity.covered === mapIdentity.cells && mapIdentity.complete
    && mapIdentity.type === '(ARRAY (UNSIGNED-BYTE 4) ('
      + mapIdentity.width + ' ' + mapIdentity.height + '))'
    && mapIdentity.cells <= cap['map-cells'],
  'Input map is not a complete capped unsigned-byte-4 map');
  const sampleMaps = maps.filter(map => map.sampleId === call.sampleId);
  const phases = ['STROKE-ENTRY', 'SCREEN-ENTRY', 'SCREEN-RETURN', 'STROKE-RETURN'];
  assert(sampleMaps.length === phases.length
    && phases.every(phase => sampleMaps.filter(map => map.phase === phase).length === 1),
  'Sample lacks exactly one complete map for each required phase');
  for (const map of sampleMaps) {
    assert(map.strokeId === selection.strokeId && map.id === mapIdentity.id
      && map.width === mapIdentity.width && map.height === mapIdentity.height
      && map.type === mapIdentity.type && map.cells === mapIdentity.cells,
    'Map snapshot identity differs from STROKE-INPUT');
  }
  const byPhase = Object.fromEntries(sampleMaps.map(map => [map.phase, map]));
  const transitions = [
    compareMaps(byPhase['STROKE-ENTRY'], byPhase['SCREEN-ENTRY']),
    compareMaps(byPhase['SCREEN-ENTRY'], byPhase['SCREEN-RETURN']),
    compareMaps(byPhase['SCREEN-RETURN'], byPhase['STROKE-RETURN']),
    compareMaps(byPhase['STROKE-ENTRY'], byPhase['STROKE-RETURN']),
  ];

  assert(screen.eventId === screenReturn.eventId
    && byPhase['SCREEN-ENTRY'].eventId === screen.eventId
    && byPhase['SCREEN-RETURN'].eventId === screen.eventId,
  'Screen event does not match its map snapshots');
  assert(screen.pathId === pathId && screen.pathEq && screen.samplePathEq && screen.detail,
    'SCREEN-BEGIN does not retain the selected path identity');
  assert(returned.returnPathEq, 'BRUSH-STROKE did not return the original path by EQ');
  const cdex = screen.cdex?.[0] === ':INTEGER' ? screen.cdex[1] : undefined;
  const sdex = screen.sdex?.[0] === ':INTEGER' ? screen.sdex[1] : undefined;
  assert(Number.isSafeInteger(cdex) && Number.isSafeInteger(sdex),
    'Captured screen indices are not integers');

  const predicateCoordinates = [];
  const predicateDecisionByCoordinate = new Map();
  for (const [index, predicate] of sampledPredicates.entries()) {
    assert(predicate.arguments.length === 2
      && predicate.arguments.every(argument => argument.kind === 'integer'),
    'IN-SUB-FRAME argument ' + index + ' is not an integer coordinate pair');
    const [x, y] = predicate.arguments.map(argument => argument.value);
    const key = x + ',' + y;
    const prior = predicateDecisionByCoordinate.get(key);
    assert(prior === undefined || prior === predicate.accepted,
      'Repeated predicate coordinate has inconsistent captured results');
    predicateDecisionByCoordinate.set(key, predicate.accepted);
    predicateCoordinates.push({ x, y, accepted: predicate.accepted, eventId: predicate.eventId });
  }
  const expectedPredicateCoordinates = [];
  for (const point of points) {
    for (const [dx, dy] of capturedBrushCore) {
      expectedPredicateCoordinates.push([point.x + dx, point.y + dy]);
    }
  }
  assert(sampledPredicates.length === expectedPredicateCoordinates.length
    && sampledPredicates.every((predicate, index) => {
      const pair = expectedPredicateCoordinates[index];
      return predicate.arguments[0].value === pair[0] && predicate.arguments[1].value === pair[1];
    }),
  'Natural predicate coordinate sequence differs from path-by-CORE traversal');

  const acceptedCoordinates = new Set(
    predicateCoordinates.filter(predicate => predicate.accepted)
      .map(predicate => predicate.x + ',' + predicate.y),
  );
  const predicateCandidateMap = Buffer.from(byPhase['SCREEN-RETURN'].bytes);
  for (const coordinate of acceptedCoordinates) {
    const parts = coordinate.split(',').map(Number);
    const x = parts[0], y = parts[1];
    assert(Number.isSafeInteger(x) && Number.isSafeInteger(y)
      && x >= 0 && x < mapIdentity.width && y >= 0 && y < mapIdentity.height,
    'Accepted IN-SUB-FRAME coordinate is outside the captured map');
    predicateCandidateMap[x * mapIdentity.height + y] = 0;
  }
  const predicateCandidateMatches = predicateCandidateMap.equals(byPhase['STROKE-RETURN'].bytes);
  assert(predicateCandidateMatches,
    'Accepted IN-SUB-FRAME coordinate writes from SCREEN-RETURN do not match STROKE-RETURN');

  const jsMaps = createAaronMaps(mapIdentity.width, mapIdentity.height);
  jsMaps.fillMap.set(byPhase['STROKE-ENTRY'].bytes);
  const jsPath = points.map(point => [point.x, point.y]);
  let jsScreenCalls = 0;
  let jsScreenEntry;
  let jsScreenReturnMap;
  let insideFrameCalls = 0;
  const jsResultPath = applyObservedNaturalBrushStrokeValue0(jsMaps, engineProfile, jsPath, {
    cdex,
    sdex,
    insideFrame: (first, second) => {
      insideFrameCalls += 1;
      const decision = predicateDecisionByCoordinate.get(first + ',' + second);
      assert(decision !== undefined, 'JavaScript candidate visited an uncaptured predicate coordinate');
      return decision;
    },
    screenAndStore: (pathArgument, observedCdex, observedSdex) => {
      jsScreenCalls += 1;
      assert(pathArgument === jsPath && observedCdex === cdex && observedSdex === sdex,
        'JavaScript screen callback arguments differ from captured path/indexes');
      jsScreenEntry = Buffer.from(jsMaps.fillMap);
      jsMaps.fillMap.set(byPhase['SCREEN-RETURN'].bytes);
      jsScreenReturnMap = Buffer.from(jsMaps.fillMap);
    },
  });
  const jsFinalMap = Buffer.from(jsMaps.fillMap);
  const jsCandidateMatches = jsResultPath === jsPath
    && jsScreenCalls === 1
    && insideFrameCalls === expectedPredicateCoordinates.length
    && jsScreenEntry.equals(byPhase['SCREEN-ENTRY'].bytes)
    && jsScreenReturnMap.equals(byPhase['SCREEN-RETURN'].bytes)
    && jsFinalMap.equals(byPhase['STROKE-RETURN'].bytes);
  assert(jsCandidateMatches,
    'JavaScript map adapter differs from captured order or one of the selected map snapshots');

  const jsCandidate = {
    function: 'applyObservedNaturalBrushStrokeValue0',
    profileId: engineProfile.id,
    profileWidth: engineProfile.width,
    profileCoreMatchesCapturedBrush: true,
    capturedPredicateResultsUsedAsInsideFrameCallback: true,
    predicateCalls: sampledPredicates.length,
    acceptedPredicateCalls: sampledPredicates.filter(predicate => predicate.accepted).length,
    rejectedPredicateCalls: sampledPredicates.filter(predicate => !predicate.accepted).length,
    uniqueAcceptedCoordinates: acceptedCoordinates.size,
    screenCalls: jsScreenCalls,
    insideFrameCalls,
    screenMapEntryMatches: true,
    injectedScreenReturnMapMatches: true,
    returnedSameJavaScriptPathObject: true,
    finalFillMapSha256: sha256(jsFinalMap),
    matchesCapturedStrokeReturn: true,
    screenRoutine: 'captured SCREEN-RETURN fill map injected; screen implementation is not tested',
  };
  const capturedCandidateSimulation = {
    rule: 'apply zero at the coordinates accepted by the captured IN-SUB-FRAME results, after captured SCREEN-RETURN',
    acceptedPredicateCalls: sampledPredicates.filter(predicate => predicate.accepted).length,
    uniqueAcceptedCoordinates: acceptedCoordinates.size,
    resultingMapSha256: sha256(predicateCandidateMap),
    matchesCapturedStrokeReturn: predicateCandidateMatches,
  };

  const sample = {
    sampleId: call.sampleId,
    strokeId: call.strokeId,
    eventId: call.eventId,
    class: selection.class,
    eligibility: selection.eligibility,
    mask: selection.mask,
    path: { id: pathId, type: pathType, length: pathLength, points },
    arguments: call.arguments,
    argumentValue: call.value,
    brush: {
      objectId: integer(brush.ID, 'Sample brush object id', 1),
      type: string(brush.TYPE, 'Sample brush type'),
      index: capturedBrushIndex,
      width: capturedBrushWidth,
      perim: capturedBrushPerim,
      core: capturedBrushCore,
      matchedJavaScriptProfileId: engineProfile.id,
    },
    configuration: {
      subFrame: {
        id: integer(subFrame.ID, 'Sample sub-frame id', 1),
        type: string(subFrame.TYPE, 'Sample sub-frame type'),
        lx: integer(subFrame.LX, 'Sample LX'),
        rx: integer(subFrame.RX, 'Sample RX'),
        ly: integer(subFrame.LY, 'Sample LY'),
        ty: integer(subFrame.TY, 'Sample TY'),
      },
      width: integer(configuration.WIDTH, 'Sample configuration width', 1),
      boundaryValue,
    },
    inputMap: mapIdentity,
    screen: {
      eventId: screen.eventId,
      pathId: screen.pathId,
      pathEq: screen.pathEq,
      samplePathEq: screen.samplePathEq,
      cdex: screen.cdex,
      sdex: screen.sdex,
      args: screen.args,
      returnValues: screenReturn.values,
      returnPathEq: screenReturn.returnPathEq,
    },
    predicateCalls: predicateCoordinates.map((predicate, index) => ({
      eventId: predicate.eventId,
      arguments: [
        { kind: 'integer', value: predicate.x },
        { kind: 'integer', value: predicate.y },
      ],
      accepted: predicate.accepted,
      lineOrder: sampledPredicates[index].lineOrder,
    })),
    observedRecordOrder: {
      screenBegin: screen.lineOrder,
      screenReturn: screenReturn.lineOrder,
      firstPredicate: sampledPredicates[0]?.lineOrder ?? null,
      lastPredicate: sampledPredicates.at(-1)?.lineOrder ?? null,
      strokeReturn: returned.lineOrder,
    },
    acceptedCoordinateWriteCandidate: capturedCandidateSimulation,
    javaScriptCandidate: jsCandidate,
    result: {
      predicates: returned.predicates,
      screenCalls: returned.screens,
      values: returned.values,
      returnPathEq: returned.returnPathEq,
    },
    maps: sampleMaps.map(map => ({
      phase: map.phase,
      sha256: map.sha256,
      runCount: map.runCount,
      valueCounts: map.counts,
    })),
    mapTransitions: transitions,
  };

  assert(sample.brush.index === 4 && sample.brush.width === 13
    && sample.path.length >= 2 && sample.path.length <= 39,
  'Final sample properties differ from the v6 index-4 selector');
  const completeFields = Object.keys(complete);
  return {
    bytes: raw.length,
    sha256: sha256(raw),
    lineCount: lines.length,
    caps: cap,
    completion,
    installs: installNames,
    restores,
    sampleSelections: selections.length,
    counters: {
      maps: maps.length,
      mapRows: maps.reduce((sum, map) => sum + map.rows.length, 0),
      mapRuns: maps.reduce((sum, map) => sum + map.runCount, 0),
      mapCells: maps.reduce((sum, map) => sum + map.cells, 0),
      rngPreviews: rngPreviews.length,
      completeFieldCount: completeFields.length,
    },
    samples: [sample],
  };
}

function readRun(rootArg, label, {
  observer = false, expectedProbeName = null, observerSource = null,
} = {}) {
  assert(typeof rootArg === 'string' && rootArg.length > 0, label + ' root is required');
  const root = resolve(rootArg), rootName = basename(root);
  const allowed = resolve('research/extracted/local-oracle');
  assert(within(allowed, root), label + ' root is outside research/extracted/local-oracle');
  const summaryBytes = readFileSync(resolve(root, 'summary.json'));
  const summary = JSON.parse(summaryBytes.toString('utf8').replace(/^\uFEFF/, ''));
  assert(summary.complete === true && summary.runId === rootName
    && summary.mode === 'writer-stream-seed-1234' && summary.smallImage === false,
  label + ' is not a complete current-size seed-1234 writer-stream run');
  for (const field of [
    'installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'aa0Sha256', 'sceneReportSha256',
  ]) summary[field] = hexSha(summary[field], label + ' ' + field);
  const aa0 = readFileSync(resolve(root, 'capture/aa0'));
  const scene = readFileSync(resolve(root, 'capture/aaron-scene-state-snapshot.txt'));
  const state = readFileSync(resolve(root, 'scene-state.json'));
  assert(sha256(aa0) === summary.aa0Sha256 && sha256(scene) === summary.sceneReportSha256,
    label + ' summary does not bind AA0/scene bytes');
  const runtime = {};
  for (const name of ['AARON.exe', 'AARON.dxl', 'AARON.pll']) {
    const bytes = readFileSync(resolve(root, 'runtime', name));
    runtime[name] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  let requestSha256 = null, stagedSourceSha256 = null, rawReport = null;
  if (observer) {
    const requestBytes = readFileSync(resolve(root, 'pre-scene-probe-request.json'));
    const request = JSON.parse(requestBytes.toString('utf8').replace(/^\uFEFF/, ''));
    const keys = [
      'schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256',
      'pauseSeconds', 'releaseFile', 'probeOutputNames',
    ];
    assert(Object.keys(request).length === keys.length && keys.every(key => Object.hasOwn(request, key)),
      label + ' pre-scene request fields differ');
    assert(request.schemaVersion === 1 && request.runId === rootName && request.pauseSeconds === 0
      && summary.preSceneProbePauseSeconds === 0
      && request.releaseFile === 'C:\\temp\\aaron-native-code-release.txt'
      && JSON.stringify(request.probeOutputNames) === JSON.stringify([expectedProbeName])
      && JSON.stringify(summary.probeOutputNames) === JSON.stringify(request.probeOutputNames),
    label + ' pre-scene request metadata differs');
    const runtimeExecutable = resolve(request.runtimeExecutable);
    assert(runtimeExecutable.toLowerCase() === resolve(root, 'runtime', 'AARON.exe').toLowerCase(),
      label + ' executable is outside its owned runtime');
    const staged = readFileSync(resolve(root, 'capture/aaron-pre-scene-probe.cl'));
    assert(staged.equals(observerSource) && sha256(staged) === request.probeSha256
      && request.probeSha256 === summary.preSceneProbeSha256,
    label + ' current/staged/request/summary observer source bindings differ');
    rawReport = readFileSync(resolve(root, 'capture/' + expectedProbeName));
    requestSha256 = sha256(requestBytes);
    stagedSourceSha256 = sha256(staged);
  } else {
    assert(summary.preSceneProbeSha256 === null && summary.preSceneProbePauseSeconds === 0
      && Array.isArray(summary.probeOutputNames) && summary.probeOutputNames.length === 0,
    label + ' is not uninstrumented');
    for (const path of [
      'pre-scene-probe-request.json',
      'capture/aaron-pre-scene-probe.cl',
      'capture/aaron-brush-stroke-value0-v4.txt',
      'capture/aaron-brush-stroke-value0-v5-index5.txt',
      'capture/aaron-brush-stroke-value0-v6-index4.txt',
    ]) assert(!existsSync(resolve(root, path)), label + ' contains observer artifact ' + path);
  }
  return {
    root, rootName, summary, summarySha256: sha256(summaryBytes),
    aa0Sha256: sha256(aa0), sceneSha256: sha256(scene), sceneStateSha256: sha256(state),
    aa0, scene, runtime, requestSha256, stagedSourceSha256, rawReport,
  };
}

function assertCompatible(observed, control, label) {
  for (const key of [
    'mode', 'smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256',
  ]) assert(observed.summary[key] === control.summary[key], label + ': ' + key + ' differs');
  for (const name of ['AARON.exe', 'AARON.dxl', 'AARON.pll']) {
    assert(observed.runtime[name].sha256 === control.runtime[name].sha256,
      label + ': ' + name + ' differs');
  }
}

function sceneInfo(run) {
  return {
    root: run.rootName,
    runId: run.summary.runId,
    startedAt: run.summary.startedAt,
    finishedAt: run.summary.finishedAt,
    summarySha256: run.summarySha256,
    aa0Sha256: run.aa0Sha256,
    sceneReportSha256: run.sceneSha256,
    sceneStateSha256: run.sceneStateSha256,
    runtime: run.runtime,
  };
}

export function deriveBrushStrokeValue0Index4Evidence({
  captureRoot, controlBeforeA, controlBeforeB, controlAfter, output,
}) {
  const observerPath = 'research/introspection/brush-stroke-value0-capture-v6-index4.cl';
  const observerSource = read(observerPath);
  const observed = readRun(captureRoot, 'VALUE=0 index-4 capture', {
    observer: true,
    expectedProbeName: 'aaron-brush-stroke-value0-v6-index4.txt',
    observerSource,
  });
  const beforeA = readRun(controlBeforeA, 'before control A');
  const beforeB = readRun(controlBeforeB, 'before control B');
  const after = readRun(controlAfter, 'after control');
  for (const control of [beforeA, beforeB, after]) {
    assertCompatible(observed, control, observed.rootName + '/' + control.rootName);
    assert(sameBytes(observed.aa0, control.aa0) && sameBytes(observed.scene, control.scene),
      'Instrumented capture and ' + control.rootName + ' have different AA0/scene bytes');
  }
  assert(Date.parse(beforeA.summary.finishedAt) < Date.parse(beforeB.summary.startedAt)
    && Date.parse(beforeB.summary.finishedAt) < Date.parse(observed.summary.startedAt)
    && Date.parse(observed.summary.finishedAt) < Date.parse(after.summary.startedAt),
  'Controls and capture are not in fresh before-A/before-B/capture/after order');

  const parsed = parseCapture(observed.rawReport);
  assert(parsed.sha256 === sha256(observed.rawReport), 'Parsed report hash differs from raw capture');
  const sourcePaths = [
    observerPath,
    'research/tools/derive-brush-stroke-value0-index4-evidence.mjs',
    'research/tools/derive-brush-stroke-value0-index5-evidence.mjs',
    'research/tools/parse-natural-free-path-report.mjs',
    'research/tools/index-allegro-image.mjs',
    'engine/src/aaron-brush-stroke.js',
    'engine/src/aaron-brushes.js',
    'engine/src/aaron-maps.js',
    'engine/package.json',
  ];
  const sources = sourcePaths.map(path => ({ path, sha256: sha256(read(path)) }));
  const report = {
    schemaVersion: 1,
    kind: 'Single natural BRUSH-STROKE VALUE=0 map sample for ALL-BRUSHES index 4, width 13, with fresh drawing/scene controls',
    selectionPolicy: {
      sample: 'first natural VALUE=0 multi-point path of length 2..39 while BRUSH is ALL-BRUSHES index 4 and WIDTH is 13',
      profileMatch: 'captured ordered CORE must equal the unique JavaScript brush profile whose width is 13',
      insideFrameCallback: 'the adapter receives the captured per-coordinate IN-SUB-FRAME decisions',
    },
    sources,
    observed: {
      ...sceneInfo(observed),
      observerSha256: observed.stagedSourceSha256,
      requestSha256: observed.requestSha256,
      rawReportSha256: parsed.sha256,
      rawReportBytes: parsed.bytes,
      lineCount: parsed.lineCount,
      capture: parsed,
    },
    controls: [beforeA, beforeB, after].map(sceneInfo),
    allAA0ByteIdentical: true,
    allSceneReportByteIdentical: true,
    controlsUninstrumented: true,
    limitations: [
      'This is one completed seed-1234 writer-stream multi-point VALUE=0 sample selected from a 2 through 39 point path with ALL-BRUSHES index 4 and width 13. It is not an exhaustive BRUSH-STROKE domain.',
      'The JavaScript adapter is compared on the captured path and maps. Its screen callback receives the captured SCREEN-RETURN FILL-MAP, and its insideFrame callback replays captured IN-SUB-FRAME decisions. This tests only the bounded map adapter for this sample; it does not implement or validate SCREEN-AND-STORE.',
      'Matching the captured STROKE-RETURN map does not establish screen rendering, full scene parity, a general JavaScript implementation match, path construction, a direct caller, or native-register meanings.',
      'Complete RLE snapshots support exact comparisons only at the four captured phases for this sample. Matching fresh uninstrumented AA0 and scene-report bytes establishes control stability, not complete internal-state parity.',
      'The full capture tape and scene files remain in the local oracle run roots. This report binds them by hashes and records the complete parsed path, predicate trace, and map snapshots.',
    ],
  };
  writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [captureRoot, controlBeforeA, controlBeforeB, controlAfter, output, ...extra] = process.argv.slice(2);
  assert([captureRoot, controlBeforeA, controlBeforeB, controlAfter, output].every(Boolean)
    && extra.length === 0,
  'Usage: derive-brush-stroke-value0-index4-evidence.mjs <capture-root> <control-before-a> <control-before-b> <control-after> <fresh-output.json>');
  const report = deriveBrushStrokeValue0Index4Evidence({
    captureRoot, controlBeforeA, controlBeforeB, controlAfter, output,
  });
  console.log(JSON.stringify({
    output: resolve(output),
    sample: report.observed.capture.samples[0],
  }, null, 2));
}
