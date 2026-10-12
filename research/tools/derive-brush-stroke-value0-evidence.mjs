#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  basename, dirname, isAbsolute, relative, resolve, sep,
} from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { sha256 } from './index-allegro-image.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = path => readFileSync(resolve(path));
const json = path => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/, ''));
const sameBytes = (a, b) => a.equals(b);
const hexSha = (value, label) => {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value), `${label} is not a SHA-256`);
  return value.toLowerCase();
};
const within = (parent, candidate) => {
  const rel = relative(parent, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const integer = (value, label, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) => {
  assert(value?.kind === 'number' && /^[-+]?\d+$/.test(value.raw)
    && Number.isSafeInteger(value.value) && value.value >= minimum && value.value <= maximum,
  `${label} must be an integer in range`);
  return value.value;
};
const keyword = (value, label) => {
  assert(value?.kind === 'keyword', `${label} must be a keyword`);
  return value.name;
};
const symbol = (value, label) => {
  assert(value?.kind === 'symbol', `${label} must be a symbol`);
  return value.name;
};
const string = (value, label) => {
  assert(value?.kind === 'string', `${label} must be a string`);
  return value.value;
};
const list = (value, label) => {
  assert(Array.isArray(value), `${label} must be a proper list`);
  return value;
};

function plist(value, label) {
  const entries = list(value, label);
  assert(entries.length % 2 === 0, `${label} has an odd property count`);
  const result = Object.create(null);
  for (let index = 0; index < entries.length; index += 2) {
    const name = keyword(entries[index], `${label} key`);
    assert(!Object.hasOwn(result, name), `${label} has duplicate :${name}`);
    result[name] = entries[index + 1];
  }
  return result;
}

function portable(value) {
  if (value === null || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(portable);
  if (value?.kind === 'number') return value.value;
  if (value?.kind === 'keyword') return `:${value.name}`;
  if (value?.kind === 'symbol') return value.name;
  if (value?.kind === 'string') return value.value;
  throw new Error('Unsupported Lisp value in captured report');
}

function descriptor(value, label) {
  const values = list(value, label);
  assert(values.length >= 1, `${label} has no descriptor tag`);
  const tag = keyword(values[0], `${label} tag`);
  if (tag === 'NIL') {
    assert(values.length === 1, `${label} NIL descriptor has extra fields`);
    return { kind: 'nil' };
  }
  if (tag === 'INTEGER') {
    assert(values.length === 2, `${label} integer descriptor has the wrong arity`);
    return { kind: 'integer', value: integer(values[1], `${label} value`) };
  }
  if (tag === 'OBJECT') {
    assert(values.length === 3, `${label} object descriptor has the wrong arity`);
    return { kind: 'object', id: integer(values[1], `${label} object id`, 1), type: string(values[2], `${label} object type`) };
  }
  if (tag === 'SYMBOL') {
    assert(values.length === 3, `${label} symbol descriptor has the wrong arity`);
    return { kind: 'symbol', package: string(values[1], `${label} symbol package`), name: string(values[2], `${label} symbol name`) };
  }
  throw new Error(`${label} uses unsupported descriptor :${tag}`);
}

function exactRecord(line, name, expectedNames) {
  const fields = parseLispRecord(line, name);
  const keys = Object.keys(fields);
  assert(keys.length === expectedNames.length && expectedNames.every(key => Object.hasOwn(fields, key)),
    `${name} field set differs`);
  return fields;
}

function mapKey(map) {
  return `${map.sampleId}:${map.phase}`;
}

function parseMapBegin(line) {
  const f = exactRecord(line, 'MAP-BEGIN', ['phase', 'stroke', 'sample', 'event', 'id', 'type', 'element-type', 'width', 'height', 'cells']);
  const phase = keyword(f.phase, 'MAP-BEGIN phase');
  const type = string(f.type, 'MAP-BEGIN type');
  const elementType = list(f['element-type'], 'MAP-BEGIN element type');
  assert(elementType.length === 2 && symbol(elementType[0], 'MAP-BEGIN element type') === 'UNSIGNED-BYTE'
    && integer(elementType[1], 'MAP-BEGIN element bits') === 4, 'MAP-BEGIN is not an unsigned-byte-4 map');
  const width = integer(f.width, 'MAP-BEGIN width', 1, 4096);
  const height = integer(f.height, 'MAP-BEGIN height', 1, 4096);
  const cells = integer(f.cells, 'MAP-BEGIN cells', 1, 20_000_000);
  assert(type === `(ARRAY (UNSIGNED-BYTE 4) (${width} ${height}))` && cells === width * height,
    'MAP-BEGIN type or cell count differs from dimensions');
  return {
    phase, strokeId: integer(f.stroke, 'MAP-BEGIN stroke id', 1),
    sampleId: integer(f.sample, 'MAP-BEGIN sample id', 1),
    eventId: integer(f.event, 'MAP-BEGIN event id', 1),
    id: integer(f.id, 'MAP-BEGIN map id', 1), type, width, height, cells,
    rows: [], runCount: 0,
  };
}

function parseMapRow(line, map) {
  const f = exactRecord(line, 'MAP-ROW', ['phase', 'stroke', 'sample', 'event', 'y', 'runs']);
  assert(keyword(f.phase, 'MAP-ROW phase') === map.phase
    && integer(f.stroke, 'MAP-ROW stroke') === map.strokeId
    && integer(f.sample, 'MAP-ROW sample') === map.sampleId
    && integer(f.event, 'MAP-ROW event') === map.eventId,
  'MAP-ROW identity differs from its open map');
  const y = integer(f.y, 'MAP-ROW y', 0, map.height - 1);
  assert(y === map.rows.length, 'MAP-ROW rows are missing, duplicated, or reordered');
  const rawRuns = list(f.runs, 'MAP-ROW runs');
  assert(rawRuns.length > 0, 'MAP-ROW has no runs');
  let previous = null;
  let covered = 0;
  const runs = rawRuns.map((raw, index) => {
    const pair = list(raw, `MAP-ROW run ${index}`);
    assert(pair.length === 2, `MAP-ROW run ${index} is not a value/count pair`);
    const value = integer(pair[0], `MAP-ROW run ${index} value`, 0, 15);
    const count = integer(pair[1], `MAP-ROW run ${index} count`, 1, map.width);
    assert(previous === null || previous !== value, `MAP-ROW ${y} RLE is not maximal`);
    previous = value;
    covered += count;
    map.runCount += 1;
    return [value, count];
  });
  assert(covered === map.width, `MAP-ROW ${y} covers ${covered}/${map.width} cells`);
  map.rows.push({ y, runs });
}

function finishMap(line, map) {
  const f = exactRecord(line, 'MAP-END', ['phase', 'stroke', 'sample', 'event', 'id', 'rows', 'cells', 'covered', 'runs', 'complete']);
  assert(keyword(f.phase, 'MAP-END phase') === map.phase
    && integer(f.stroke, 'MAP-END stroke') === map.strokeId
    && integer(f.sample, 'MAP-END sample') === map.sampleId
    && integer(f.event, 'MAP-END event') === map.eventId
    && integer(f.id, 'MAP-END id') === map.id,
  'MAP-END identity differs from its open map');
  assert(integer(f.rows, 'MAP-END rows') === map.height && map.rows.length === map.height
    && integer(f.cells, 'MAP-END cells') === map.cells
    && integer(f.covered, 'MAP-END covered') === map.cells
    && integer(f.runs, 'MAP-END runs') === map.runCount && f.complete === true,
  'MAP-END coverage differs from its serialized rows');
  const bytes = new Uint8Array(map.cells);
  const counts = Object.fromEntries(Array.from({length: 16}, (_, value) => [value, 0]));
  for (const { y, runs } of map.rows) {
    let x = 0;
    for (const [value, count] of runs) {
      counts[value] += count;
      for (let offset = 0; offset < count; offset += 1) bytes[(x + offset) * map.height + y] = value;
      x += count;
    }
    assert(x === map.width, `MAP-END row ${y} did not cover its width`);
  }
  assert(Object.values(counts).reduce((total, count) => total + count, 0) === map.cells,
    'Expanded map value counts do not cover its cells');
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
    transitions[`${from}->${to}`] = (transitions[`${from}->${to}`] ?? 0) + 1;
    const x = Math.floor(index / before.height), y = index % before.height;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return {
    from: before.phase, to: after.phase, changedCells,
    transitions,
    boundsXY: changedCells ? { left: minX, right: maxX, top: minY, bottom: maxY } : null,
    mapSha256From: before.sha256, mapSha256To: after.sha256,
  };
}

function parseCapture(raw) {
  const text = raw.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(raw), 'Capture is not valid round-trip UTF-8');
  assert(!text.includes('\r') || text.replace(/\r\n/g, '').indexOf('\r') < 0, 'Capture has bare carriage returns');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  assert(lines[0] === 'BEGIN brush-stroke-value0 v4'
    && lines.at(-1) === 'END brush-stroke-value0-v4', 'Capture begin/end markers differ');
  const count = prefix => lines.filter(line => line.startsWith(prefix)).length;
  assert(count('READY') === 1 && count('COMPLETE ') === 1 && count('END brush-stroke-value0-v4') === 1,
    'Capture must contain exactly one READY, COMPLETE, and END');
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
  const maps = [];
  let currentMap;
  let complete;
  let capFields;
  let errorLines = [];

  for (const [lineIndex, line] of lines.entries()) {
    const lineOrder = lineIndex + 1;
    if (line.startsWith('CAPS ')) capFields = parseLispRecord(line, 'CAPS');
    else if (/^(?:ERROR|SETUP-ERROR|CAPTURE-ERROR|MAP-ERROR|OVERFLOW|ABORT)(?:\s|$)/.test(line)) errorLines.push(line);
    else if (line.startsWith('SAMPLE-SELECT ')) {
      const f = exactRecord(line, 'SAMPLE-SELECT', ['id', 'class', 'path-length', 'eligibility', 'mask']);
      selections.push({
        strokeId: integer(f.id, 'SAMPLE-SELECT stroke id', 1),
        class: keyword(f.class, 'SAMPLE-SELECT class'),
        pathLength: integer(f['path-length'], 'SAMPLE-SELECT path length', 0, 20_000),
        eligibility: keyword(f.eligibility, 'SAMPLE-SELECT eligibility'),
        mask: f.mask === null ? null : portable(f.mask),
      });
    } else if (line.startsWith('STROKE-BEGIN ')) {
      const f = parseLispRecord(line, 'STROKE-BEGIN');
      if (f.selected === true) {
        const id = integer(f.id, 'STROKE-BEGIN id', 1);
        assert(!selectedCalls.has(id), `Selected STROKE-BEGIN ${id} is duplicated`);
        const args = list(f.args, `STROKE-BEGIN ${id} args`);
        selectedCalls.set(id, {
          strokeId: id,
          eventId: integer(f.event, `STROKE-BEGIN ${id} event`, 1),
          argumentCount: integer(f.argc, `STROKE-BEGIN ${id} argc`, 0),
          arguments: args.map((item, index) => descriptor(item, `STROKE-BEGIN ${id} arg ${index}`)),
          value: descriptor(f.value, `STROKE-BEGIN ${id} value`),
          pathKind: keyword(f['path-kind'], `STROKE-BEGIN ${id} path kind`),
          sampleId: integer(f.sample, `STROKE-BEGIN ${id} sample id`, 1),
        });
      }
    } else if (line.startsWith('STROKE-INPUT ')) {
      const f = parseLispRecord(line, 'STROKE-INPUT');
      if (f.sample !== undefined && f.sample !== null) {
        const id = integer(f.id, 'STROKE-INPUT id', 1);
        assert(!inputs.has(id), `Selected STROKE-INPUT ${id} is duplicated`);
        inputs.set(id, {
          eventId: integer(f.event, `STROKE-INPUT ${id} event`, 1),
          sampleId: integer(f.sample, `STROKE-INPUT ${id} sample`, 1),
          data: plist(f.data, `STROKE-INPUT ${id} data`),
        });
      }
    } else if (line.startsWith('STROKE-RETURN ')) {
      const f = parseLispRecord(line, 'STROKE-RETURN');
      if (f.sample !== undefined && f.sample !== null) {
        const id = integer(f.id, 'STROKE-RETURN id', 1);
        assert(!returns.has(id), `Selected STROKE-RETURN ${id} is duplicated`);
        const data = plist(f.data, `STROKE-RETURN ${id} data`);
        returns.set(id, {
          eventId: integer(f.event, `STROKE-RETURN ${id} event`, 1),
          sampleId: integer(f.sample, `STROKE-RETURN ${id} sample`, 1),
          predicates: integer(f.predicates, `STROKE-RETURN ${id} predicates`, 0),
          screens: integer(f.screens, `STROKE-RETURN ${id} screens`, 0),
          values: portable(data.VALUES),
          returnPathEq: data['RETURN-PATH-EQ'] === true,
          lineOrder,
        });
      }
    } else if (line.startsWith('IN-SUB-FRAME ')) {
      const f = exactRecord(line, 'IN-SUB-FRAME', ['event', 'stroke', 'sample', 'args', 'values']);
      const strokeId = integer(f.stroke, 'IN-SUB-FRAME stroke id', 1);
      const record = {
        eventId: integer(f.event, 'IN-SUB-FRAME event id', 1),
        strokeId,
        sampleId: integer(f.sample, 'IN-SUB-FRAME sample id', 1),
        arguments: list(f.args, 'IN-SUB-FRAME arguments').map((item, index) => descriptor(item, `IN-SUB-FRAME argument ${index}`)),
        values: list(f.values, 'IN-SUB-FRAME values').map((item, index) => descriptor(item, `IN-SUB-FRAME value ${index}`)),
        lineOrder,
      };
      const records = predicateRecords.get(strokeId) ?? [];
      assert(!records.length || records.at(-1).lineOrder < lineOrder,
        `IN-SUB-FRAME records for stroke ${strokeId} are not ordered`);
      records.push(record);
      predicateRecords.set(strokeId, records);
    } else if (line.startsWith('SCREEN-BEGIN ')) {
      const f = parseLispRecord(line, 'SCREEN-BEGIN');
      if (f.sample !== undefined && f.sample !== null) {
        const strokeId = integer(f.stroke, 'SCREEN-BEGIN stroke id', 1);
        assert(!screens.has(strokeId), `Selected SCREEN-BEGIN for stroke ${strokeId} is duplicated`);
        screens.set(strokeId, {
          eventId: integer(f.event, `SCREEN-BEGIN ${strokeId} event`, 1),
          sampleId: integer(f.sample, `SCREEN-BEGIN ${strokeId} sample`, 1),
          args: portable(f.args), pathId: integer(f['path-id'], `SCREEN-BEGIN ${strokeId} path id`, 0),
          pathEq: f['path-eq'] === true, samplePathEq: f['sample-path-eq'] === true,
          cdex: portable(f.cdex), sdex: portable(f.sdex), detail: f.detail === true,
          lineOrder,
        });
      }
    } else if (line.startsWith('SCREEN-RETURN ')) {
      const f = parseLispRecord(line, 'SCREEN-RETURN');
      if (f.sample !== undefined && f.sample !== null) {
        const strokeId = integer(f.stroke, 'SCREEN-RETURN stroke id', 1);
        assert(!screenReturns.has(strokeId), `Selected SCREEN-RETURN for stroke ${strokeId} is duplicated`);
        screenReturns.set(strokeId, {
          eventId: integer(f.event, `SCREEN-RETURN ${strokeId} event`, 1),
          sampleId: integer(f.sample, `SCREEN-RETURN ${strokeId} sample`, 1),
          values: portable(f.values), returnPathEq: f['return-path-eq'] === true,
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
      const f = exactRecord(line, 'RESTORE', ['name', 'status']);
      restores.push({ name: string(f.name, 'RESTORE name'), status: keyword(f.status, 'RESTORE status') });
    } else if (line.startsWith('RNG-PREVIEW ')) {
      const f = exactRecord(line, 'RNG-PREVIEW', ['phase', 'before', 'after', 'unchanged']);
      const before = portable(f.before), after = portable(f.after);
      rngPreviews.push({ phase: keyword(f.phase, 'RNG-PREVIEW phase'), unchanged: f.unchanged === true });
      assert(f.unchanged === true && JSON.stringify(before) === JSON.stringify(after),
        'A sampled RNG preview changed across its three reported draws');
    } else if (line.startsWith('COMPLETE ')) {
      complete = parseLispRecord(line, 'COMPLETE');
    }
  }

  assert(!currentMap, 'Capture ended while a map was open');
  assert(!errorLines.length, `Capture contains error or overflow records: ${errorLines.slice(0, 3).join(' | ')}`);
  assert(complete, 'Capture has no parsed COMPLETE record');
  const counters = Object.create(null);
  for (const key of ['strokes', 'sampled', 'empty-sample', 'singleton-sample', 'multi-sample', 'events',
    'sampled-predicates', 'sample-screens', 'points', 'offsets', 'snapshots', 'cells', 'runs', 'objects', 'checks',
    'errors', 'aborts']) counters[key] = integer(complete[key], `COMPLETE ${key}`, 0);
  const completion = {
    main: keyword(complete.main, 'COMPLETE main'), accepted: complete.accepted === true,
    bindingsSafe: complete['bindings-safe'] === true, counters,
    rejected: portable(complete.rejected), captureDisabled: portable(complete['capture-disabled']),
    samplesComplete: complete['samples-complete'] === true,
    currentStroke: portable(complete['current-stroke']),
  };
  assert(completion.main === 'NORMAL' && completion.accepted && completion.bindingsSafe
    && completion.samplesComplete && completion.counters.errors === 0 && completion.counters.aborts === 0
    && completion.rejected === null && completion.captureDisabled === null && completion.currentStroke === null,
  'COMPLETE does not accept a normal, fully restored capture');
  assert(completion.counters.sampled === 3 && completion.counters.snapshots === 12
    && completion.counters.cells === maps.reduce((sum, map) => sum + map.cells, 0)
    && completion.counters.runs === maps.reduce((sum, map) => sum + map.runCount, 0),
  'COMPLETE sampling or serialized map totals differ');
  const parsedPredicateCount = [...predicateRecords.values()].reduce((sum, records) => sum + records.length, 0);
  assert(parsedPredicateCount === completion.counters['sampled-predicates']
    && count('IN-SUB-FRAME ') === parsedPredicateCount,
  'IN-SUB-FRAME records differ from the COMPLETE sampled-predicate counter');
  assert(selections.length === 3 && selectedCalls.size === 3 && inputs.size === 3
    && returns.size === 3 && screens.size === 3 && screenReturns.size === 3,
  'Capture does not contain one complete selected sample per path class');
  assert(maps.length === 12, 'Capture must contain 12 complete map snapshots');
  const expectedRestore = [
    { name: 'BRUSH-STROKE', status: 'RESTORED' },
    { name: 'SCREEN-AND-STORE', status: 'OUTER-WRAPPER-PRESERVED' },
    { name: 'IN-SUB-FRAME', status: 'RESTORED' },
    { name: 'MAIN', status: 'OUTER-WRAPPER-PRESERVED' },
  ];
  assert(JSON.stringify(restores) === JSON.stringify(expectedRestore), 'Binding restoration records differ');

  const selectionByStroke = new Map(selections.map(sample => [sample.strokeId, sample]));
  const samples = selections.map(selection => {
    const call = selectedCalls.get(selection.strokeId);
    const input = inputs.get(selection.strokeId);
    const returned = returns.get(selection.strokeId);
    const screen = screens.get(selection.strokeId);
    const screenReturn = screenReturns.get(selection.strokeId);
    const sampledPredicates = predicateRecords.get(selection.strokeId) ?? [];
    assert(call && input && returned && screen && screenReturn, `Sample stroke ${selection.strokeId} is incomplete`);
    assert(call.eventId === input.eventId && input.eventId === returned.eventId
      && call.sampleId === input.sampleId && input.sampleId === returned.sampleId
      && call.sampleId === screen.sampleId && screen.sampleId === screenReturn.sampleId,
    `Sample stroke ${selection.strokeId} event/sample identities differ`);
    assert(call.value.kind === 'integer' && call.value.value === 0
      && call.arguments.length === 4 && call.arguments[1].kind === 'integer'
      && call.arguments[1].value === 0 && returned.screens === 1
      && sampledPredicates.length === returned.predicates,
    `Sample stroke ${selection.strokeId} is not the observed four-argument VALUE=0 call`);
    assert(sampledPredicates.every(predicate => predicate.sampleId === call.sampleId
      && predicate.lineOrder > screenReturn.lineOrder && predicate.lineOrder < returned.lineOrder),
    `Sample stroke ${selection.strokeId} predicate records are not between screen return and stroke return`);
    assert(screen.lineOrder < screenReturn.lineOrder,
      `Sample stroke ${selection.strokeId} screen records are out of order`);
    if (sampledPredicates.length) {
      assert(sampledPredicates.every(predicate => predicate.arguments.length === 2
        && predicate.arguments.every(argument => argument.kind === 'integer')
        && predicate.values.length === 1 && predicate.values[0].kind === 'symbol'
        && predicate.values[0].package === 'COMMON-LISP' && predicate.values[0].name === 'T'),
      `Sample stroke ${selection.strokeId} predicate arguments or true results differ`);
    }

    const path = plist(input.data.PATH, `Sample ${call.sampleId} path`);
    const pathId = integer(path.ID, `Sample ${call.sampleId} path id`, 0);
    const pathType = string(path.TYPE, `Sample ${call.sampleId} path type`);
    const pathLength = integer(path.LENGTH, `Sample ${call.sampleId} path length`, 0, 20_000);
    const rawPoints = path.POINTS === null ? [] : list(path.POINTS, `Sample ${call.sampleId} path points`);
    const points = rawPoints.map((point, index) => {
      const fields = plist(point, `Sample ${call.sampleId} point ${index}`);
      return { id: integer(fields.ID, `Sample ${call.sampleId} point id`, 1),
        type: string(fields.TYPE, `Sample ${call.sampleId} point type`),
        x: integer(fields.X, `Sample ${call.sampleId} point x`),
        y: integer(fields.Y, `Sample ${call.sampleId} point y`) };
    });
    assert(pathLength === selection.pathLength && points.length === pathLength,
      `Sample ${call.sampleId} path length differs from its selected record`);
    const expectedClass = pathLength === 0 ? 'EMPTY' : pathLength === 1 ? 'SINGLETON' : 'MULTI';
    assert(selection.class === expectedClass, `Sample ${call.sampleId} path class differs from its length`);
    assert((pathLength === 0 && pathId === 0 && pathType === 'NULL')
      || (pathLength > 0 && pathId > 0 && pathType === 'CONS'),
    `Sample ${call.sampleId} path descriptor differs from its captured points`);

    const brush = plist(input.data.BRUSH, `Sample ${call.sampleId} brush`);
    const offsets = value => {
      const record = plist(value, `Sample ${call.sampleId} brush offsets`);
      const entries = record.OFFSETS === null ? [] : list(record.OFFSETS, `Sample ${call.sampleId} brush offset list`);
      return entries.map((entry, index) => {
        const pair = list(entry, `Sample ${call.sampleId} brush offset ${index}`);
        assert(pair.length === 2, `Sample ${call.sampleId} brush offset ${index} is not a pair`);
        return [integer(pair[0], 'Brush offset x'), integer(pair[1], 'Brush offset y')];
      });
    };
    const configuration = plist(input.data.CONFIGURATION, `Sample ${call.sampleId} configuration`);
    const subFrame = plist(configuration['SUB-FRAME'], `Sample ${call.sampleId} sub-frame`);
    const boundary = plist(configuration['BOUNDARY-VALUE'], `Sample ${call.sampleId} boundary value`);
    const boundaryValue = descriptor(boundary.BOUND, `Sample ${call.sampleId} boundary descriptor`);
    const mapInfo = plist(input.data.MAP, `Sample ${call.sampleId} map descriptor`);
    const mapIdentity = {
      id: integer(mapInfo.ID, `Sample ${call.sampleId} map id`, 1),
      type: string(mapInfo.TYPE, `Sample ${call.sampleId} map type`),
      width: integer(mapInfo.WIDTH, `Sample ${call.sampleId} map width`, 1),
      height: integer(mapInfo.HEIGHT, `Sample ${call.sampleId} map height`, 1),
      cells: integer(mapInfo.CELLS, `Sample ${call.sampleId} map cells`, 1),
      covered: integer(mapInfo.COVERED, `Sample ${call.sampleId} map covered cells`, 1),
      complete: mapInfo.COMPLETE === true,
    };
    assert(mapIdentity.cells === mapIdentity.width * mapIdentity.height
      && mapIdentity.covered === mapIdentity.cells && mapIdentity.complete
      && mapIdentity.type === `(ARRAY (UNSIGNED-BYTE 4) (${mapIdentity.width} ${mapIdentity.height}))`,
    `Sample ${call.sampleId} input map is not complete`);
    const sampleMaps = maps.filter(map => map.sampleId === call.sampleId);
    const phases = ['STROKE-ENTRY', 'SCREEN-ENTRY', 'SCREEN-RETURN', 'STROKE-RETURN'];
    assert(sampleMaps.length === phases.length && phases.every(phase => sampleMaps.some(map => map.phase === phase)),
      `Sample ${call.sampleId} lacks a required map phase`);
    for (const map of sampleMaps) {
      assert(map.strokeId === selection.strokeId && map.id === mapIdentity.id
        && map.width === mapIdentity.width && map.height === mapIdentity.height,
      `Sample ${call.sampleId} map snapshot identity differs from STROKE-INPUT`);
    }
    const byPhase = Object.fromEntries(sampleMaps.map(map => [map.phase, map]));
    const transitions = [
      compareMaps(byPhase['STROKE-ENTRY'], byPhase['SCREEN-ENTRY']),
      compareMaps(byPhase['SCREEN-ENTRY'], byPhase['SCREEN-RETURN']),
      compareMaps(byPhase['SCREEN-RETURN'], byPhase['STROKE-RETURN']),
      compareMaps(byPhase['STROKE-ENTRY'], byPhase['STROKE-RETURN']),
    ];
    const screenMapEntry = byPhase['SCREEN-ENTRY'];
    const screenMapReturn = byPhase['SCREEN-RETURN'];
    const candidateMap = Buffer.from(byPhase['STROKE-ENTRY'].bytes);
    const candidateCoordinates = new Set();
    const candidateEntryValues = Object.create(null);
    for (const predicate of sampledPredicates) {
      if (predicate.values[0].name !== 'T') continue;
      const [x, y] = predicate.arguments.map(argument => argument.value);
      assert(Number.isSafeInteger(x) && Number.isSafeInteger(y)
        && x >= 0 && x < mapIdentity.width && y >= 0 && y < mapIdentity.height,
      `Sample ${call.sampleId} predicate coordinate is outside the captured map`);
      const index = x * mapIdentity.height + y;
      candidateCoordinates.add(index);
      const beforeValue = candidateMap[index];
      candidateEntryValues[beforeValue] = (candidateEntryValues[beforeValue] ?? 0) + 1;
      candidateMap[index] = call.value.value;
    }
    const observedStrokeReturn = Buffer.from(byPhase['STROKE-RETURN'].bytes);
    const candidateSimulation = {
      rule: 'set each true IN-SUB-FRAME argument coordinate to the captured BRUSH-STROKE value',
      acceptedPredicateCalls: sampledPredicates.length,
      uniqueCandidateCoordinates: candidateCoordinates.size,
      candidateEntryValues,
      resultingMapSha256: sha256(candidateMap),
      matchesCapturedStrokeReturn: candidateMap.equals(observedStrokeReturn),
    };
    assert(candidateSimulation.matchesCapturedStrokeReturn,
      `Sample ${call.sampleId} does not match the predicate-coordinate write candidate`);
    assert(screen.eventId === screenReturn.eventId
      && screenMapEntry.eventId === screen.eventId
      && screenMapReturn.eventId === screen.eventId,
    `Sample ${call.sampleId} screen event does not match its map snapshots`);
    assert(screen.pathId === pathId && screen.samplePathEq && screen.detail,
      `Sample ${call.sampleId} screen call does not retain the sampled path identity`);

    return {
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
        id: integer(brush.ID, `Sample ${call.sampleId} brush id`, 1),
        type: string(brush.TYPE, `Sample ${call.sampleId} brush type`),
        index: integer(brush.INDEX, `Sample ${call.sampleId} brush index`, 0),
        width: integer(brush.WIDTH, `Sample ${call.sampleId} brush width`, 1),
        perim: offsets(brush.PERIM), core: offsets(brush.CORE),
      },
      configuration: {
        subFrame: {
          id: integer(subFrame.ID, `Sample ${call.sampleId} sub-frame id`, 1),
          type: string(subFrame.TYPE, `Sample ${call.sampleId} sub-frame type`),
          lx: integer(subFrame.LX, `Sample ${call.sampleId} LX`),
          rx: integer(subFrame.RX, `Sample ${call.sampleId} RX`),
          ly: integer(subFrame.LY, `Sample ${call.sampleId} LY`),
          ty: integer(subFrame.TY, `Sample ${call.sampleId} TY`),
        },
        width: integer(configuration.WIDTH, `Sample ${call.sampleId} width`, 1),
        boundaryValue,
      },
      inputMap: mapIdentity,
      screen: {
        eventId: screen.eventId, pathId: screen.pathId, pathEq: screen.pathEq,
        samplePathEq: screen.samplePathEq, cdex: screen.cdex, sdex: screen.sdex,
        args: screen.args, returnValues: screenReturn.values,
        returnPathEq: screenReturn.returnPathEq,
      },
      predicateCalls: sampledPredicates.map(predicate => ({
        eventId: predicate.eventId,
        arguments: predicate.arguments,
        values: predicate.values,
        lineOrder: predicate.lineOrder,
      })),
      observedRecordOrder: {
        screenBegin: screen.lineOrder,
        screenReturn: screenReturn.lineOrder,
        firstPredicate: sampledPredicates[0]?.lineOrder ?? null,
        lastPredicate: sampledPredicates.at(-1)?.lineOrder ?? null,
        strokeReturn: returned.lineOrder,
      },
      predicateCoordinateWriteCandidate: candidateSimulation,
      result: {
        predicates: returned.predicates, screenCalls: returned.screens,
        values: returned.values, returnPathEq: returned.returnPathEq,
      },
      maps: sampleMaps.map(map => ({ phase: map.phase, sha256: map.sha256, runCount: map.runCount, valueCounts: map.counts })),
      mapTransitions: transitions,
    };
  });

  const completeFields = Object.keys(complete);
  const cap = Object.fromEntries(Object.entries(capFields).map(([key, value]) => [key, portable(value)]));
  return {
    bytes: raw.length, sha256: sha256(raw), lineCount: lines.length, caps: cap,
    completion, restores, sampleSelections: selections.length,
    counters: {
      maps: maps.length, mapRows: maps.reduce((sum, map) => sum + map.rows.length, 0),
      mapRuns: maps.reduce((sum, map) => sum + map.runCount, 0),
      mapCells: maps.reduce((sum, map) => sum + map.cells, 0),
      rngPreviews: rngPreviews.length,
      completeFieldCount: completeFields.length,
    },
    samples,
  };
}

function readRun(rootArg, label, { observer = false, expectedProbeName = null, observerSource = null } = {}) {
  assert(typeof rootArg === 'string' && rootArg.length > 0, `${label} root is required`);
  const root = resolve(rootArg), rootName = basename(root);
  const allowed = resolve('research/extracted/local-oracle');
  assert(within(allowed, root), `${label} root is outside research/extracted/local-oracle`);
  const summaryBytes = readFileSync(resolve(root, 'summary.json'));
  const summary = JSON.parse(summaryBytes.toString('utf8').replace(/^\uFEFF/, ''));
  assert(summary.complete === true && summary.runId === rootName
    && summary.mode === 'writer-stream-seed-1234' && summary.smallImage === false,
  `${label} is not a complete current-size seed-1234 writer-stream run`);
  for (const field of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'aa0Sha256', 'sceneReportSha256']) {
    summary[field] = hexSha(summary[field], `${label} ${field}`);
  }
  const aa0 = readFileSync(resolve(root, 'capture/aa0'));
  const scene = readFileSync(resolve(root, 'capture/aaron-scene-state-snapshot.txt'));
  const state = readFileSync(resolve(root, 'scene-state.json'));
  assert(sha256(aa0) === summary.aa0Sha256 && sha256(scene) === summary.sceneReportSha256,
    `${label} summary does not bind AA0/scene bytes`);
  const runtime = {};
  for (const name of ['AARON.exe', 'AARON.dxl', 'AARON.pll']) {
    const bytes = readFileSync(resolve(root, 'runtime', name));
    runtime[name] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  let request, requestSha256 = null, stagedSourceSha256 = null, rawReport = null;
  if (observer) {
    const requestBytes = readFileSync(resolve(root, 'pre-scene-probe-request.json'));
    request = JSON.parse(requestBytes.toString('utf8').replace(/^\uFEFF/, ''));
    const keys = ['schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256', 'pauseSeconds', 'releaseFile', 'probeOutputNames'];
    assert(Object.keys(request).length === keys.length && keys.every(key => Object.hasOwn(request, key)),
      `${label} pre-scene request fields differ`);
    assert(request.schemaVersion === 1 && request.runId === rootName && request.pauseSeconds === 0
      && summary.preSceneProbePauseSeconds === 0
      && request.releaseFile === 'C:\\temp\\aaron-native-code-release.txt'
      && JSON.stringify(request.probeOutputNames) === JSON.stringify([expectedProbeName])
      && JSON.stringify(summary.probeOutputNames) === JSON.stringify(request.probeOutputNames),
    `${label} pre-scene request metadata differs`);
    const runtimeExecutable = resolve(request.runtimeExecutable);
    assert(runtimeExecutable.toLowerCase() === resolve(root, 'runtime', 'AARON.exe').toLowerCase(),
      `${label} executable is outside its owned runtime`);
    const staged = readFileSync(resolve(root, 'capture/aaron-pre-scene-probe.cl'));
    assert(staged.equals(observerSource) && sha256(staged) === request.probeSha256
      && request.probeSha256 === summary.preSceneProbeSha256,
    `${label} current/staged/request/summary observer source bindings differ`);
    rawReport = readFileSync(resolve(root, `capture/${expectedProbeName}`));
    requestSha256 = sha256(requestBytes);
    stagedSourceSha256 = sha256(staged);
  } else {
    assert(summary.preSceneProbeSha256 === null && summary.preSceneProbePauseSeconds === 0
      && Array.isArray(summary.probeOutputNames) && summary.probeOutputNames.length === 0,
    `${label} is not uninstrumented`);
    for (const path of ['pre-scene-probe-request.json', 'capture/aaron-pre-scene-probe.cl',
      'capture/aaron-brush-stroke-value0-v4.txt']) {
      assert(!existsSync(resolve(root, path)), `${label} contains observer artifact ${path}`);
    }
  }
  return {
    root, rootName, summary, summarySha256: sha256(summaryBytes),
    aa0Sha256: sha256(aa0), sceneSha256: sha256(scene), sceneStateSha256: sha256(state),
    aa0, scene, runtime, requestSha256, stagedSourceSha256, rawReport,
  };
}

function assertCompatible(a, b, label) {
  for (const key of ['mode', 'smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(a.summary[key] === b.summary[key], `${label}: ${key} differs`);
  }
  for (const name of ['AARON.exe', 'AARON.dxl', 'AARON.pll']) {
    assert(a.runtime[name].sha256 === b.runtime[name].sha256, `${label}: ${name} differs`);
  }
}

function sceneInfo(run) {
  return {
    root: run.rootName, runId: run.summary.runId, startedAt: run.summary.startedAt,
    finishedAt: run.summary.finishedAt, summarySha256: run.summarySha256,
    aa0Sha256: run.aa0Sha256, sceneReportSha256: run.sceneSha256,
    sceneStateSha256: run.sceneStateSha256, runtime: run.runtime,
  };
}

export function deriveBrushStrokeValue0Evidence({ captureRoot, controlBeforeA, controlBeforeB, controlAfter, output }) {
  const observerPath = 'research/introspection/brush-stroke-value0-capture-v4.cl';
  const observerSource = read(observerPath);
  const observed = readRun(captureRoot, 'VALUE=0 capture', {
    observer: true, expectedProbeName: 'aaron-brush-stroke-value0-v4.txt', observerSource,
  });
  const beforeA = readRun(controlBeforeA, 'before control A');
  const beforeB = readRun(controlBeforeB, 'before control B');
  const after = readRun(controlAfter, 'after control');
  for (const run of [beforeA, beforeB, after]) assertCompatible(observed, run, `${observed.rootName}/${run.rootName}`);
  for (const control of [beforeA, beforeB, after]) {
    assert(sameBytes(observed.aa0, control.aa0) && sameBytes(observed.scene, control.scene),
      `Instrumented capture and ${control.rootName} have different AA0/scene bytes`);
  }
  assert(Date.parse(beforeA.summary.finishedAt) < Date.parse(beforeB.summary.startedAt)
    && Date.parse(beforeB.summary.finishedAt) < Date.parse(observed.summary.startedAt)
    && Date.parse(observed.summary.finishedAt) < Date.parse(after.summary.startedAt),
  'Controls and capture are not in the required fresh before/capture/after order');
  const parsed = parseCapture(observed.rawReport);
  assert(parsed.sha256 === sha256(observed.rawReport), 'Parsed report hash differs from raw capture');
  const sourcePaths = [
    observerPath,
    'research/tools/derive-brush-stroke-value0-evidence.mjs',
    'research/tools/parse-natural-free-path-report.mjs',
    'research/tools/index-allegro-image.mjs',
  ];
  const sources = sourcePaths.map(path => ({ path, sha256: sha256(read(path)) }));
  const report = {
    schemaVersion: 3,
    kind: 'Bounded natural BRUSH-STROKE VALUE=0 map capture with fresh drawing/scene controls',
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
      'This is one completed seed-1234 writer-stream run with the first naturally encountered MULTI, EMPTY, and SINGLETON path samples selected by the observer. It is not an exhaustive BRUSH-STROKE domain.',
      'The captured samples all use integer VALUE=0, brush index 1 at width 3, the reported 768x1080 unsigned-byte-4 map, and their recorded natural inputs/configuration. Other values, brushes, map layouts, boundaries, and malformed inputs remain uncharacterized.',
      'Complete RLE snapshots support exact comparisons only at the four captured phases for these three strokes. The observer bypasses non-selected calls to their saved functions and preserves the exact observed outer MAIN and SCREEN-AND-STORE wrappers; matching uninstrumented AA0 and scene bytes do not establish that every unobserved internal effect is untouched.',
      'This report records original runtime behavior and map transitions. It does not establish a JavaScript implementation match, recover path construction or the direct caller, or map the native branch registers to Lisp arguments.',
      'The full capture tape and scene files remain in the local oracle run roots. The portable report binds them by hashes and summarizes sampled input and complete map coverage.',
    ],
  };
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [captureRoot, controlBeforeA, controlBeforeB, controlAfter, output, ...extra] = process.argv.slice(2);
  assert([captureRoot, controlBeforeA, controlBeforeB, controlAfter, output].every(Boolean) && extra.length === 0,
    'Usage: derive-brush-stroke-value0-evidence.mjs <capture-root> <control-before-a> <control-before-b> <control-after> <fresh-output.json>');
  const report = deriveBrushStrokeValue0Evidence({ captureRoot, controlBeforeA, controlBeforeB, controlAfter, output });
  console.log(JSON.stringify({ output: resolve(output), samples: report.observed.capture.samples.map(sample => ({
    sampleId: sample.sampleId, class: sample.class, pathLength: sample.path.length,
    argumentValue: sample.argumentValue, mapTransitions: sample.mapTransitions,
  })) }, null, 2));
}
