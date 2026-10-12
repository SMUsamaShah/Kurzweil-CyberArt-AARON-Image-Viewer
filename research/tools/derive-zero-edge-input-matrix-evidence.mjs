#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual as same } from 'node:util';
import { deriveZeroEdgeInputEvidence } from './derive-zero-edge-input-evidence.mjs';

const PROJECT_ROOT = resolve('.');
const LOCAL_ORACLE_ROOT = 'research/extracted/local-oracle';
const MODE = 'writer-stream-seed-1234';
const LOADED_SCENE_SOURCE = 'scene-state-snapshot-writer-stream-seeded-1234.cl';
const REQUIRED_RUNNER_PATH = 'research/oracle/run-local-scene-state-required-probe.ps1';
const REQUIRED_RUNNER_SHA256 = '1fe4546ea847bd31b28b2bcbab6228356b7f44ea8d61bde006ccbad58c788ec9';
const REQUIRED_RUNNER_BYTES = 27295;
const MAX_CASES = 160;
const MAX_RETURNED_PATH_ITEMS = 64;
const EXPECTED_APPLICATION_FILES = Object.freeze([
  'AARON_ScreenSaver.scr', 'AARON.dxl', 'AARON.exe', 'AARON.pll', 'acl5016.dll',
  'ktiCompress.dll', 'license.dll', 'mfc42.dll', 'msvcirt.dll', 'registry.dll',
  'upload.dll', 'UserDocumentation.html',
]);
const COMMON_LISP_SOURCES = Object.freeze([
  ['planning-call-trace.cl', 'research/introspection/planning-call-trace.cl'],
  ['planning-random-seed-common.cl', 'research/oracle/planning-random-seed-common.cl'],
  ['scene-state-snapshot.cl', 'research/introspection/scene-state-snapshot.cl'],
  ['scene-state-snapshot-seeded-1234.cl', 'research/introspection/scene-state-snapshot-seeded-1234.cl'],
  ['scene-state-snapshot-writer-seeded-1234.cl', 'research/introspection/scene-state-snapshot-writer-seeded-1234.cl'],
  ['scene-state-snapshot-writer-stream-seeded-1234.cl', 'research/introspection/scene-state-snapshot-writer-stream-seeded-1234.cl'],
]);
const RUNS = Object.freeze({
  before: Object.freeze({ runId: 'zero-edge-matrix-control-seed1234-20261012-p', instrumented: false }),
  matrix: Object.freeze({ runId: 'zero-edge-matrix-seed1234-20261012-q', instrumented: true }),
  after: Object.freeze({ runId: 'zero-edge-matrix-control-after-seed1234-20261012-r', instrumented: false }),
});

// Frozen matrix source and report pins for the completed v2 capture.
const MATRIX_PINS = Object.freeze({
  probePath: 'research/introspection/zero-edge-input-matrix-v2.cl',
  probeSha256: '70ece663045eb5d852aef397d348f63ede577f95ba0d9d7f2d0ade0520772612',
  probeBytes: 81556,
  outputName: 'aaron-zero-edge-input-matrix-v2.txt',
  endMarker: 'END zero-edge-input-matrix-v2',
  reportSha256: '4e06a2f1c030efeb5cbd0001a60467c22a43cc44ad44c5736e8f1dfca7b8bbba',
  reportBytes: 2831887,
  reportLines: 12389,
  scopeRecord: 'SCOPE post-main-bounded-input-matrix planned=160 cases=A40-center-(3,3)-dirs0to7-perim0to4-zero-map,B64-boundary-positions-dirs0to7-perim4-zero-map,C56-center-dirs0to7-perim4-seven-shapes first-four=allones,centerzero-restones,single(3,2)=1,center3x3zero-restones appended=single(3,2)=2/3/15-restzero zero-edge-wrapped=nil outcomes=unknown scratch=7x7-ubyte4-fresh-per-case main-values=preserved main-errors=propagated rng-reset=none state-reset=none',
  limitsRecord: 'LIMITS calls=160 cases=160 value-nodes=256 list-items=64 array-items=64 multiple-values=64 depth=4 string-prefix=256 condition-control-prefix=256 state-bindings=7 original-map-cells=1048576 scratch-map-cells=49 returned-path-items=64',
});

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = path => path.replaceAll('\\', '/');
const within = (parent, candidate) => {
  const rel = relative(parent, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const trackedSources = new Map();

function trackedRead(path, label = path) {
  const absolute = resolve(path);
  assert(within(PROJECT_ROOT, absolute), `${label} escapes the checkout`);
  const bytes = readFileSync(absolute);
  const rel = portable(relative(PROJECT_ROOT, absolute));
  const row = { path: rel, sha256: sha(bytes), bytes: bytes.length };
  const previous = trackedSources.get(rel);
  assert(!previous || same(previous, row), `${label} changed during evidence derivation`);
  trackedSources.set(rel, row);
  return bytes;
}

function expectKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)),
  `${label} fields differ`);
  return value;
}

function parseJson(bytes, label) {
  const encoding = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8';
  const text = bytes.toString(encoding);
  assert(Buffer.from(text, encoding).equals(bytes), `${label} is not round-trip ${encoding.toUpperCase()}`);
  try { return JSON.parse(text.replace(/^\uFEFF/u, '')); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
}

function hashField(value, label) {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/iu.test(value), `${label} is not a SHA-256`);
  return value.toLowerCase();
}

// Parse the report directly. This deliberately accepts only bounded Lisp data syntax and
// qualified symbols from the captured package; reader macros and dotted lists stay forbidden.
function parseMatrixRecord(line) {
  const tagMatch = /^([A-Z][A-Z0-9-]*)\s/u.exec(line);
  assert(tagMatch, `Malformed matrix report record: ${line.slice(0, 120)}`);
  const tag = tagMatch[1];
  if (['BEGIN', 'SCOPE', 'LIMITS', 'END'].includes(tag)) return { tag, raw: line, fields: null };
  if (tag === 'HELPER') {
    const expected = 'HELPER name=EXCL:ARGLIST present=T fbound=T type=COMPILED-FUNCTION compiled=T';
    assert(line === expected, 'EXCL:ARGLIST helper record differs from its exact accepted form');
    return { tag, raw: line, fields: { name: 'EXCL:ARGLIST', present: true, fbound: true,
      type: { kind: 'symbol', name: 'COMPILED-FUNCTION' }, compiled: true } };
  }
  let index = tag.length;
  const fields = Object.create(null);
  const skip = () => { while (/\s/u.test(line[index] ?? '')) index += 1; };
  const readString = () => {
    index += 1;
    let value = '';
    while (index < line.length) {
      const char = line[index++];
      if (char === '"') return { kind: 'string', value };
      if (char === '\\') {
        assert(index < line.length, 'Unterminated matrix-report string escape');
        const escaped = line[index++];
        assert(escaped === '"' || escaped === '\\', `Unsupported matrix-report string escape: \\${escaped}`);
        value += escaped;
      } else value += char;
    }
    throw new Error('Unterminated matrix-report string');
  };
  const readExpression = () => {
    skip();
    assert(index < line.length, `Missing value in ${tag} report record`);
    if (line[index] === '(') {
      index += 1;
      const list = [];
      for (;;) {
        skip();
        assert(index < line.length, `Unclosed list in ${tag} report record`);
        if (line[index] === ')') { index += 1; return list; }
        assert(!(line[index] === '.' && /[\s)]/u.test(line[index + 1] ?? '')),
          `Dotted Lisp lists are forbidden in ${tag} report records`);
        list.push(readExpression());
      }
    }
    assert(line[index] !== ')', `Unexpected close parenthesis in ${tag} report record`);
    if (line[index] === '"') return readString();
    const start = index;
    while (index < line.length && !/[\s()]/u.test(line[index])) index += 1;
    const raw = line.slice(start, index);
    assert(raw.length > 0 && !raw.startsWith('#') && !/^[`',]/u.test(raw),
      `Forbidden Lisp reader syntax in ${tag} report record: ${raw}`);
    if (raw.toUpperCase() === 'NIL') return null;
    if (raw.toUpperCase() === 'T') return true;
    if (/^:[A-Za-z][A-Za-z0-9*-]*$/u.test(raw)) return { kind: 'keyword', name: raw.slice(1).toUpperCase() };
    if (/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eEsSfFdDlL][+-]?\d+)?$/u.test(raw)) {
      const value = Number(raw.replace(/[sSfFdDlL]/u, 'e'));
      assert(Number.isFinite(value), `Non-finite matrix-report number ${raw}`);
      return { kind: 'number', raw, value };
    }
    const qualified = /^([A-Za-z][A-Za-z0-9-]*)(::)([A-Za-z*][A-Za-z0-9*-]*)$/u.exec(raw);
    if (qualified) return { kind: 'qualified-symbol', package: qualified[1].toUpperCase(),
      separator: '::', name: qualified[3].toUpperCase() };
    if (/^(?:[A-Za-z*][A-Za-z0-9*-]*|&[A-Za-z][A-Za-z0-9-]*)$/u.test(raw)) {
      return { kind: 'symbol', name: raw.toUpperCase() };
    }
    throw new Error(`Unsupported matrix-report atom ${raw}`);
  };
  while (index < line.length) {
    skip();
    if (index >= line.length) break;
    const fieldMatch = /^[A-Za-z][A-Za-z0-9-]*/u.exec(line.slice(index));
    assert(fieldMatch, `Malformed ${tag} field name`);
    const key = fieldMatch[0].toLowerCase();
    index += fieldMatch[0].length;
    assert(line[index] === '=', `Missing = after ${key} in ${tag} record`);
    index += 1;
    assert(!Object.hasOwn(fields, key), `Duplicate ${key} field in ${tag} record`);
    fields[key] = readExpression();
  }
  return { tag, raw: line, fields };
}

function expectRecordFields(fields, expected, label) {
  assert(fields && typeof fields === 'object' && !Array.isArray(fields)
    && Object.keys(fields).length === expected.length && expected.every(key => Object.hasOwn(fields, key)),
  `${label} fields differ`);
}

function lispSymbolName(value, label) {
  assert(value?.kind === 'symbol' || value?.kind === 'qualified-symbol', `${label} is not a symbol`);
  return value.kind === 'symbol' ? value.name : `${value.package}${value.separator}${value.name}`;
}

function lispSymbolLeaf(value, label) {
  return lispSymbolName(value, label).split('::').at(-1);
}

function lispKeywordName(value, label) {
  assert(value?.kind === 'keyword', `${label} is not a keyword`);
  return value.name;
}

function lispString(value, label) {
  assert(value?.kind === 'string', `${label} is not a Lisp string`);
  return value.value;
}

function lispBoolean(value, label) {
  assert(value === true || value === null, `${label} is not bare T or NIL`);
  return value === true;
}

function lispInteger(value, label) {
  assert(value?.kind === 'number' && /^[-+]?\d+$/u.test(value.raw)
    && Number.isSafeInteger(value.value), `${label} is not a safe Lisp integer`);
  return value.value;
}

function lispPlist(value, label) {
  assert(Array.isArray(value) && value.length % 2 === 0, `${label} is not an even-length plist`);
  const result = new Map();
  for (let index = 0; index < value.length; index += 2) {
    const key = lispKeywordName(value[index], `${label} key ${index / 2}`);
    assert(!result.has(key), `${label} repeats :${key}`);
    result.set(key, value[index + 1]);
  }
  return result;
}

function expectPlistKeys(fields, expected, label) {
  assert(fields.size === expected.length && expected.every(key => fields.has(key)), `${label} plist keys differ`);
}

function plistGet(fields, key, label) {
  assert(fields.has(key), `${label} lacks :${key}`);
  return fields.get(key);
}

function parseGenericType(value, label) {
  if (value?.kind === 'symbol' || value?.kind === 'qualified-symbol') return lispSymbolName(value, label);
  if (value?.kind === 'keyword') return `:${value.name}`;
  if (value?.kind === 'number') return value.value;
  if (value?.kind === 'string') return value.value;
  if (Array.isArray(value)) return value.map((item, index) => parseGenericType(item, `${label}[${index}]`));
  throw new Error(`${label} is not a bounded Lisp type form`);
}

function parseNumberSummary(value, label, expectedType = null) {
  assert(Array.isArray(value) && value.length === 3 && lispKeywordName(value[0], `${label} marker`) === 'NUMBER',
    `${label} is not a :NUMBER summary`);
  const type = lispSymbolLeaf(value[1], `${label} number type`);
  assert(value[2]?.kind === 'number' && Number.isFinite(value[2].value), `${label} numeric payload is invalid`);
  if (expectedType !== null) assert(type === expectedType, `${label} type differs from ${expectedType}`);
  return { type, raw: value[2].raw, value: value[2].value };
}

function parseBoundedSummary(value, label, depth = 0) {
  assert(depth <= 8, `${label} exceeds the structural parser depth`);
  if (value === null || value === true) return value;
  if (value?.kind === 'string') return value.value;
  if (value?.kind === 'number') return { number: value.value, raw: value.raw };
  if (value?.kind === 'symbol' || value?.kind === 'qualified-symbol') return { symbol: lispSymbolName(value, label) };
  if (value?.kind === 'keyword') return { marker: value.name };
  assert(Array.isArray(value) && value.length > 0, `${label} is not a bounded summary`);
  const marker = lispKeywordName(value[0], `${label} summary marker`);
  if (marker === 'NUMBER') {
    const parsed = parseNumberSummary(value, label);
    return { number: parsed.value, raw: parsed.raw, type: parsed.type };
  }
  if (marker === 'SYMBOL') {
    assert(value.length === 3, `${label} symbol summary is malformed`);
    return { symbolPackage: lispString(value[1], `${label} symbol package`),
      symbolName: lispString(value[2], `${label} symbol name`) };
  }
  if (marker === 'CHARACTER') {
    assert(value.length === 3, `${label} character summary is malformed`);
    return { characterType: lispSymbolLeaf(value[1], `${label} character type`),
      characterCode: lispInteger(value[2], `${label} character code`) };
  }
  if (marker === 'STRING') {
    const fields = lispPlist(value, label);
    expectPlistKeys(fields, ['STRING', 'LENGTH', 'PREFIX', 'TRUNCATED'], label);
    const length = lispInteger(plistGet(fields, 'LENGTH', label), `${label} length`);
    const prefix = lispString(plistGet(fields, 'PREFIX', label), `${label} prefix`);
    const truncated = lispBoolean(plistGet(fields, 'TRUNCATED', label), `${label} truncation`);
    assert(length >= prefix.length && prefix.length === Math.min(length, 256) && truncated === (length > 256),
      `${label} string bound is inconsistent`);
    return { stringLength: length, prefix, truncated };
  }
  if (marker === 'LIST') {
    const fields = lispPlist(value, label);
    expectPlistKeys(fields, ['LIST', 'COUNT', 'PROPER', 'TRUNCATED', 'TAIL'], label);
    const rawItems = plistGet(fields, 'LIST', label);
    const items = rawItems === null ? [] : rawItems;
    assert(Array.isArray(items), `${label} bounded list items are malformed`);
    const count = lispInteger(plistGet(fields, 'COUNT', label), `${label} count`);
    assert(count === items.length && count <= 64, `${label} bounded list count is inconsistent`);
    const proper = lispBoolean(plistGet(fields, 'PROPER', label), `${label} proper`);
    const truncated = lispBoolean(plistGet(fields, 'TRUNCATED', label), `${label} truncated`);
    const tail = plistGet(fields, 'TAIL', label);
    if (proper) assert(tail?.kind === 'keyword' && tail.name === 'NONE', `${label} proper list tail is not :NONE`);
    if (truncated) assert(count === 64, `${label} did not reach the 64-item bound`);
    return { list: items.map((item, index) => parseBoundedSummary(item, `${label}[${index}]`, depth + 1)),
      count, proper, truncated, tail: parseBoundedSummary(tail, `${label} tail`, depth + 1) };
  }
  if (marker === 'ARRAY') {
    const fields = lispPlist(value, label);
    expectPlistKeys(fields, ['ARRAY', 'RANK', 'DIMENSIONS', 'ELEMENT-TYPE', 'TOTAL', 'VALUES', 'SHOWN', 'TRUNCATED'], label);
    const type = parseGenericType(plistGet(fields, 'ARRAY', label), `${label} array type`);
    const rank = lispInteger(plistGet(fields, 'RANK', label), `${label} rank`);
    const rawDimensions = plistGet(fields, 'DIMENSIONS', label);
    assert(rank >= 0 && rank <= 4 && Array.isArray(rawDimensions) && rawDimensions.length === rank,
      `${label} array rank/dimensions are invalid`);
    const dimensions = rawDimensions.map((item, index) => lispInteger(item, `${label} dimension ${index}`));
    assert(dimensions.every(value => value >= 0), `${label} has a negative dimension`);
    const total = lispInteger(plistGet(fields, 'TOTAL', label), `${label} total`);
    const product = dimensions.reduce((a, b) => a * b, 1);
    assert(total === product && total <= 1048576, `${label} array total exceeds or contradicts the bound`);
    const rawElementType = plistGet(fields, 'ELEMENT-TYPE', label);
    assert(Array.isArray(rawElementType), `${label} element type is malformed`);
    const elementType = rawElementType.map((item, index) => parseGenericType(item, `${label} element type ${index}`));
    const rawValues = plistGet(fields, 'VALUES', label);
    const values = rawValues === null ? [] : rawValues;
    assert(Array.isArray(values), `${label} array values are malformed`);
    const shown = lispInteger(plistGet(fields, 'SHOWN', label), `${label} shown`);
    const truncated = lispBoolean(plistGet(fields, 'TRUNCATED', label), `${label} truncated`);
    assert(shown === values.length && shown <= Math.min(total, 64)
      && truncated === (total > 64 || shown < total), `${label} array summary is inconsistent`);
    if (total > 64) assert(shown === 0, `${label} oversized array exposes a partial snapshot`);
    return { arrayType: type, rank, dimensions, elementType, total, shown, truncated,
      values: values.map((item, index) => parseBoundedSummary(item, `${label} value ${index}`, depth + 1)) };
  }
  if (marker === 'OBJECT') {
    assert(value.length === 2, `${label} object summary is malformed`);
    return { objectType: parseGenericType(value[1], `${label} object type`) };
  }
  if (marker === 'TYPE') {
    assert(value.length === 4 && lispKeywordName(value[2], `${label} type marker`) === 'DEPTH-LIMIT'
      && lispBoolean(value[3], `${label} depth-limit marker`), `${label} type summary is malformed`);
    return { type: parseGenericType(value[1], `${label} limited type`), depthLimited: true };
  }
  if (marker === 'NODE-LIMIT') {
    assert(value.length === 1, `${label} node-limit marker is malformed`);
    return { nodeLimited: true };
  }
  throw new Error(`${label} uses unsupported summary marker :${marker}`);
}

function plistValueSummary(value, label) {
  const fields = lispPlist(value, label);
  return fields;
}

function parseTypedValues(value, label) {
  assert(Array.isArray(value), `${label} is not a typed-values list`);
  return value.map((row, index) => {
    const fields = lispPlist(row, `${label}[${index}]`);
    expectPlistKeys(fields, ['TYPE', 'VALUE'], `${label}[${index}]`);
    const type = parseGenericType(plistGet(fields, 'TYPE', label), `${label}[${index}] type`);
    const rawValue = plistGet(fields, 'VALUE', label);
    const summary = parseBoundedSummary(rawValue, `${label}[${index}] value`);
    return { type, summary, raw: rawValue };
  });
}

function parseTypedFixnums(value, expectedLength, label, expected = null) {
  const rows = parseTypedValues(value, label);
  if (expectedLength !== null) assert(rows.length === expectedLength, `${label} length differs`);
  const result = rows.map((row, index) => {
    assert(row.type === 'FIXNUM', `${label}[${index}] is not FIXNUM`);
    const number = parseNumberSummary(row.raw, `${label}[${index}] value`, 'FIXNUM');
    assert(Number.isSafeInteger(number.value), `${label}[${index}] is not a safe integer`);
    return number.value;
  });
  if (expected !== null) assert(same(result, expected), `${label} differs from source-bound coordinates`);
  return result;
}

function parsePreview(value, label) {
  const fields = lispPlist(value, label);
  expectPlistKeys(fields, ['RANDOM-100-1', 'RANDOM-100-2', 'RANDOM-100-3'], label);
  const draws = ['RANDOM-100-1', 'RANDOM-100-2', 'RANDOM-100-3']
    .map(key => lispInteger(plistGet(fields, key, label), `${label} ${key}`));
  assert(draws.every(value => value >= 0 && value < 100), `${label} draw is outside 0..99`);
  return draws;
}

function parseScratchCells(value, label, expectedValues = null) {
  assert(Array.isArray(value), `${label} is not a scratch-cell list`);
  const expectedCoordinates = [];
  for (let x = 0; x < 7; x += 1) for (let y = 0; y < 7; y += 1) expectedCoordinates.push([x, y]);
  assert(value.length === 49, `${label} does not expose all 49 scratch cells`);
  const cells = value.map((row, index) => {
    assert(Array.isArray(row) && row.length === 3, `${label}[${index}] is not x/y/value`);
    const tuple = row.map((item, field) => lispInteger(item, `${label}[${index}][${field}]`));
    assert(tuple[0] === expectedCoordinates[index][0] && tuple[1] === expectedCoordinates[index][1]
      && tuple[2] >= 0 && tuple[2] <= 15, `${label}[${index}] is invalid or out of coordinate order`);
    return tuple;
  });
  if (expectedValues) assert(same(cells.map(([, , value]) => value), expectedValues),
    `${label} cells differ from the exact expected matrix input`);
  return cells;
}

function parseChangedCells(value, before, after, label) {
  const rows = value === null ? [] : value;
  assert(Array.isArray(rows), `${label} is not a changed-cell list`);
  const actual = rows.map((row, index) => {
    assert(Array.isArray(row) && row.length === 4, `${label}[${index}] is not x/y/before/after`);
    return row.map((item, field) => lispInteger(item, `${label}[${index}][${field}]`));
  });
  const expected = [];
  for (let index = 0; index < 49; index += 1) {
    const [x, y, oldValue] = before[index];
    const newValue = after[index][2];
    if (oldValue !== newValue) expected.push([x, y, oldValue, newValue]);
  }
  assert(same(actual, expected), `${label} does not match the full scratch before/after maps`);
  return actual;
}

function recordsByTag(records, tag) { return records.filter(record => record.tag === tag); }
function onlyRecord(records, tag) {
  const rows = recordsByTag(records, tag);
  assert(rows.length === 1, `Expected one ${tag} record; found ${rows.length}`);
  return rows[0];
}

function tagCounts(records) {
  const counts = Object.create(null);
  for (const row of records) counts[row.tag] = (counts[row.tag] ?? 0) + 1;
  return counts;
}

function matrixValue(record, key, label = record.tag) {
  assert(record.fields && Object.hasOwn(record.fields, key), `${label} lacks ${key}`);
  return record.fields[key];
}

function matrixBoolean(record, key, expected, label = record.tag) {
  const actual = lispBoolean(matrixValue(record, key, label), `${label} ${key}`);
  assert(actual === expected, `${label} ${key} is ${actual}, expected ${expected}`);
  return actual;
}

function matrixInteger(record, key, expected, label = record.tag) {
  const actual = lispInteger(matrixValue(record, key, label), `${label} ${key}`);
  if (expected !== null) assert(actual === expected, `${label} ${key} is ${actual}, expected ${expected}`);
  return actual;
}

function matrixKeyword(record, key, expected, label = record.tag) {
  const actual = lispKeywordName(matrixValue(record, key, label), `${label} ${key}`);
  if (expected !== null) assert(actual === expected, `${label} ${key} is :${actual}, expected :${expected}`);
  return actual;
}

function matrixOrdinal(record, expected, label = record.tag) {
  return matrixInteger(record, 'ordinal', expected, label);
}

function matrixIntegerList(value, expectedLength, label) {
  assert(Array.isArray(value) && (expectedLength === null || value.length === expectedLength),
    `${label} is not the expected integer list`);
  return value.map((item, index) => lispInteger(item, `${label}[${index}]`));
}

function assertNoSummaryTruncation(value, label, depth = 0) {
  assert(depth <= 12, `${label} exceeds bounded typed-value depth`);
  if (!Array.isArray(value)) return;
  if (value.length > 0 && value[0]?.kind === 'keyword') {
    const marker = value[0].name;
    if (marker === 'NODE-LIMIT') throw new Error(`${label} contains a node-limit summary`);
    if (marker === 'TYPE' && value.length === 4 && value[2]?.kind === 'keyword'
        && value[2].name === 'DEPTH-LIMIT' && value[3] === true) {
      throw new Error(`${label} contains a depth-limit summary`);
    }
    if (['LIST', 'ARRAY', 'STRING'].includes(marker)) {
      const summary = lispPlist(value, `${label} ${marker.toLowerCase()} summary`);
      assert(!lispBoolean(plistGet(summary, 'TRUNCATED', label), `${label} truncated`),
        `${label} contains a truncated ${marker.toLowerCase()} summary`);
    }
  }
  for (const [index, item] of value.entries()) assertNoSummaryTruncation(item, `${label}[${index}]`, depth + 1);
}

function parseMatrixMetadata(value, label, expectedBits) {
  const fields = lispPlist(value, label);
  expectPlistKeys(fields, ['TYPE', 'RANK', 'DIMENSIONS', 'ELEMENT-TYPE', 'TOTAL'], label);
  const type = parseGenericType(plistGet(fields, 'TYPE', label), `${label} type`);
  const rank = lispInteger(plistGet(fields, 'RANK', label), `${label} rank`);
  const dimensions = matrixIntegerList(plistGet(fields, 'DIMENSIONS', label), 2, `${label} dimensions`);
  const rawElementType = plistGet(fields, 'ELEMENT-TYPE', label);
  assert(Array.isArray(rawElementType) && rawElementType.length === 2,
    `${label} element type is not a two-item unsigned-byte type`);
  const elementType = rawElementType.map((item, index) => parseGenericType(item, `${label} element type ${index}`));
  const total = lispInteger(plistGet(fields, 'TOTAL', label), `${label} total`);
  assert(rank === 2 && dimensions.every(value => value > 0)
    && elementType[0] === 'UNSIGNED-BYTE' && elementType[1] === expectedBits
    && total === dimensions[0] * dimensions[1] && total <= 1048576,
  `${label} rank, dimensions, element type, or bounded total is invalid`);
  return { type, rank, dimensions, elementType, total };
}

function parseMatrixArraySummary(value, label) {
  const parsed = parseBoundedSummary(value, label);
  assert(parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && Object.hasOwn(parsed, 'arrayType') && Number.isSafeInteger(parsed.rank)
    && Array.isArray(parsed.dimensions) && Array.isArray(parsed.elementType)
    && Number.isSafeInteger(parsed.total) && Number.isSafeInteger(parsed.shown)
    && typeof parsed.truncated === 'boolean' && Array.isArray(parsed.values),
  `${label} is not a bounded array summary`);
  return parsed;
}

function validateOriginalMapSummary(value, metadata, label) {
  const summary = parseMatrixArraySummary(value, label);
  assert(same(summary.arrayType, metadata.type) && summary.rank === metadata.rank
    && same(summary.dimensions, metadata.dimensions) && same(summary.elementType, metadata.elementType)
    && summary.total === metadata.total,
  `${label} array summary differs from its original-map metadata`);
  // Only natural FILL-MAP/PATCH-MAP header summaries may omit cells; their separate full-copy stages and
  // every identity/full-cell boundary check remain mandatory. Scratch and returned value/path parsers reject truncation.
  if (metadata.total > 64) assert(summary.shown === 0 && summary.truncated,
    `${label} unexpectedly exposes a partial oversized-map summary`);
  else assert(summary.shown === metadata.total && !summary.truncated,
    `${label} small-map summary is incomplete`);
  return summary;
}

function parseMapSnapshotStages(records, mapMetadata) {
  const stageRows = recordsByTag(records, 'MAP-SNAPSHOT-STAGE');
  assert(stageRows.length === 12, `Expected 12 map snapshot-stage records, found ${stageRows.length}`);
  const result = Object.create(null);
  let cursor = 0;
  for (const name of ['FILL-MAP', 'PATCH-MAP']) {
    const bits = name === 'FILL-MAP' ? 4 : 16;
    const metadata = mapMetadata[name];
    const expectedStages = ['BEGIN', 'METADATA', 'FLATTEN-BEGIN', 'FLATTEN-AFTER', 'COPY-BEGIN', 'COPY-AFTER'];
    const observed = stageRows.slice(cursor, cursor + expectedStages.length);
    assert(observed.length === expectedStages.length, `${name} snapshot-stage sequence is incomplete`);
    for (let index = 0; index < expectedStages.length; index += 1) {
      const row = observed[index];
      expectRecordFields(row.fields,
        index === 0 ? ['map', 'stage', 'dimension-limit', 'total-size-limit']
          : index === 1 ? ['map', 'stage', 'metadata']
            : index === 2 ? ['map', 'stage']
              : index === 3 ? ['map', 'stage', 'type', 'rank', 'total']
                : index === 4 ? ['map', 'stage', 'length']
                  : ['map', 'stage', 'type', 'length'],
        `${name} snapshot stage ${expectedStages[index]}`);
      assert(lispString(matrixValue(row, 'map', name), `${name} map name`) === name,
        `${name} snapshot stage has a different map name`);
      assert(matrixKeyword(row, 'stage', null, `${name} snapshot stage`) === expectedStages[index],
        `${name} snapshot stage order differs`);
      if (index === 0) {
        const dimensionLimit = matrixInteger(row, 'dimension-limit', null, `${name} map stage`);
        const totalLimit = matrixInteger(row, 'total-size-limit', null, `${name} map stage`);
        assert(dimensionLimit >= Math.max(...metadata.dimensions) && totalLimit >= metadata.total,
          `${name} map flatten limits are below the original map size`);
      } else if (index === 1) {
        const stageMetadata = parseMatrixMetadata(matrixValue(row, 'metadata', name), `${name} copied metadata`, bits);
        assert(same(stageMetadata, metadata), `${name} snapshot metadata differs from original-map preflight`);
      } else if (index === 3) {
        const type = parseGenericType(matrixValue(row, 'type', name), `${name} flattened type`);
        assert(type !== null && matrixInteger(row, 'rank', 1, `${name} flattened map`) === 1
          && matrixInteger(row, 'total', metadata.total, `${name} flattened map`) === metadata.total,
        `${name} flattened map did not expose its complete row-major size`);
      } else if (index === 4) {
        matrixInteger(row, 'length', metadata.total, `${name} copy input`);
      } else if (index === 5) {
        const type = parseGenericType(matrixValue(row, 'type', name), `${name} copied array type`);
        assert(type !== null && matrixInteger(row, 'length', metadata.total, `${name} copied array`) === metadata.total,
          `${name} full copied array length differs from original map`);
      }
    }
    result[name] = { metadata, stages: expectedStages, fullCopyCompleted: true,
      fullCellEqualityCheckedAtEveryBoundary: true };
    cursor += expectedStages.length;
  }
  assert(cursor === stageRows.length, 'Unexpected trailing map snapshot-stage records');
  return result;
}

function parseStateBinding(record, label) {
  const name = lispString(matrixValue(record, 'name', label), `${label} name`);
  expectRecordFields(record.fields, Object.hasOwn(record.fields, 'type')
    ? ['phase', 'name', 'present', 'status', 'bound', 'type', 'value']
    : ['phase', 'name', 'present', 'status', 'bound'], label);
  const phase = matrixKeyword(record, 'phase', null, label);
  matrixBoolean(record, 'present', true, label);
  const bound = lispBoolean(matrixValue(record, 'bound', label), `${label} bound`);
  const status = lispKeywordName(matrixValue(record, 'status', label), `${label} symbol status`);
  let type = null; let rawValue = null; let summary = null;
  if (bound) {
    assert(Object.hasOwn(record.fields, 'type') && Object.hasOwn(record.fields, 'value'),
      `${label} bound state lacks its type or value`);
    type = parseGenericType(matrixValue(record, 'type', label), `${label} value type`);
    rawValue = matrixValue(record, 'value', label);
    summary = parseBoundedSummary(rawValue, `${label} value summary`);
  } else assert(!Object.hasOwn(record.fields, 'type') && !Object.hasOwn(record.fields, 'value'),
    `${label} unbound state includes a type or value`);
  return { name, phase, status, bound, type, rawValue, summary };
}

function parseStateBindingGroup(records, phase, label) {
  const rows = records.filter(row => row.tag === 'STATE-BINDING'
    && lispKeywordName(matrixValue(row, 'phase', label), `${label} phase`) === phase);
  assert(rows.length === 7, `${label} has ${rows.length} state bindings, expected 7`);
  const expectedNames = ['START', 'XINCS', 'YINCS', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*'];
  const parsed = rows.map((row, index) => {
    const binding = parseStateBinding(row, `${label} state ${index}`);
    assert(binding.phase === phase && binding.name === expectedNames[index],
      `${label} state-binding names or order differ at ${index}`);
    assert(binding.status === 'INTERNAL' && binding.bound === (binding.name !== 'START'),
      `${label} ${binding.name} is not in the exact expected present/bound state`);
    return binding;
  });
  return Object.fromEntries(parsed.map(row => [row.name, row]));
}

function validateOuterStateGroup(group, baseline, label) {
  for (const name of ['START', 'XINCS', 'YINCS', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*']) {
    const current = group[name]; const original = baseline[name];
    assert(current.status === original.status && current.bound === original.bound && same(current.type, original.type)
      && same(current.rawValue, original.rawValue), `${label} changed the outer ${name} binding summary`);
  }
}

function validateDynamicStateGroup(group, baseline, scratchValues, label) {
  for (const name of ['START', 'XINCS', 'YINCS', 'PATCH-MAP']) {
    const current = group[name]; const original = baseline[name];
    assert(current.status === original.status && current.bound === original.bound && same(current.type, original.type)
      && same(current.rawValue, original.rawValue), `${label} changed static ${name} state inside dynamic bindings`);
  }
  const scratch = parseMatrixArraySummary(group['FILL-MAP'].rawValue, `${label} temporary FILL-MAP`);
  assert(scratch.rank === 2 && same(scratch.dimensions, [7, 7])
    && same(scratch.elementType, ['UNSIGNED-BYTE', 4]) && scratch.total === 49
    && scratch.shown === 49 && !scratch.truncated
    && same(scratch.values.map((item, index) => {
      assert(item && typeof item === 'object' && Number.isSafeInteger(item.number),
        `${label} temporary FILL-MAP cell ${index} is not numeric`);
      return item.number;
    }), scratchValues), `${label} temporary FILL-MAP is not the full expected 7x7 scratch map`);
  for (const name of ['*PIC-WIDE*', '*PIC-HIGH*']) {
    const summary = group[name].summary;
    assert(summary && typeof summary === 'object' && summary.number === 7,
      `${label} ${name} is not dynamically bound to 7`);
  }
  return { temporaryFillMapMatchesInput: true, temporaryDimensions: { wide: 7, high: 7 },
    staticBindingsMatchPostMain: true };
}

function validateStateDeltas(records, label) {
  const rows = records.filter(row => row.tag === 'STATE-DELTA');
  assert(rows.length === 21, `${label} has ${rows.length} state deltas, expected three seven-binding groups`);
  const expectedNames = ['START', 'XINCS', 'YINCS', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*'];
  for (let group = 0; group < 3; group += 1) {
    for (let index = 0; index < 7; index += 1) {
      const row = rows[group * 7 + index];
      expectRecordFields(row.fields, ['name', 'present-same', 'symbol-eq', 'bound-before', 'bound-after', 'value-eq', 'summary-equalp'],
        `${label} state delta ${group}:${index}`);
      assert(lispString(matrixValue(row, 'name', label), `${label} delta name`) === expectedNames[index],
        `${label} state delta name/order differs`);
      for (const key of ['present-same', 'symbol-eq']) matrixBoolean(row, key, true, `${label} state delta`);
      const globallyBound = expectedNames[index] !== 'START';
      for (const key of ['bound-before', 'bound-after', 'value-eq', 'summary-equalp']) {
        matrixBoolean(row, key, globallyBound, `${label} state delta ${expectedNames[index]}`);
      }
    }
  }
  return { groups: 3, bindingsPerGroup: 7, allOriginalBindingsAndValuesUnchanged: true };
}

function validateTagCounts(records) {
  const expected = {
    BEGIN: 1, SCOPE: 1, LIMITS: 1, HELPER: 1, 'TRIPT-TYPE': 1,
    FUNCTION: 6, ARGLIST: 6, BINDING: 7, GATE: 1, 'MAIN-GATE': 1,
    INSTALL: 1, READY: 1, 'MAIN-FINISH': 1, 'POST-MAIN-GATE': 1,
    'MAP-SNAPSHOT-STAGE': 12, 'ORIGINAL-MAP-PREFLIGHT': 1,
    CASE: 160, 'CASE-PREFLIGHT': 160, 'CONSTRUCTOR-RETURN': 160,
    'CONSTRUCTOR-POINT': 160, 'CONSTRUCTOR-GATE': 160,
    'DYNAMIC-SYMBOL-GATE': 160, 'CALL-GATE': 160, 'DYNAMIC-PREFLIGHT': 160,
    'CASE-RETURN': 160, 'RETURNED-TRIPT-PATH': 160,
    'START-DIRECT-XYZ': 160, 'SCRATCH-MAP': 160, 'CASE-RNG': 160,
    'DYNAMIC-OBSERVATION': 160, 'CASE-OBSERVATIONS-READY': 160,
    'CASE-END': 160, 'MATRIX-BOUNDARY': 481, 'MATRIX-FINAL-BOUNDARY': 1,
    'MATRIX-ACCOUNTING': 1, 'STATE-BINDING': 5614, 'STATE-DELTA': 3367,
    'RNG-CHECK': 320, COMPLETE: 1, END: 1,
  };
  const actual = tagCounts(records);
  assert(Object.keys(actual).length === Object.keys(expected).length
    && Object.entries(expected).every(([tag, count]) => actual[tag] === count),
  `Matrix report tag counts differ from the exact 160-case completed schema: ${JSON.stringify(actual)}`);
  return actual;
}

function validateProbeStartup(records, expectedInputs) {
  assert(onlyRecord(records, 'BEGIN').raw === 'BEGIN zero-edge-input-matrix-v2',
    'Matrix report BEGIN framing differs');
  assert(onlyRecord(records, 'SCOPE').raw === MATRIX_PINS.scopeRecord,
    'Matrix report SCOPE differs from the frozen source');
  assert(onlyRecord(records, 'LIMITS').raw === MATRIX_PINS.limitsRecord,
    'Matrix report LIMITS differs from the frozen source');
  assert(onlyRecord(records, 'END').raw === MATRIX_PINS.endMarker,
    'Matrix report END marker differs');

  const helper = onlyRecord(records, 'HELPER');
  assert(helper.raw === 'HELPER name=EXCL:ARGLIST present=T fbound=T type=COMPILED-FUNCTION compiled=T',
    'EXCL:ARGLIST helper is not the exact required compiled function');
  const triptType = onlyRecord(records, 'TRIPT-TYPE');
  expectRecordFields(triptType.fields, ['lookup-status', 'resolved', 'symbol-name', 'symbol-package'], 'TRIPT-TYPE');
  matrixBoolean(triptType, 'resolved', true, 'TRIPT-TYPE');
  assert(lispString(matrixValue(triptType, 'symbol-name', 'TRIPT-TYPE'), 'TRIPT-TYPE symbol name') === 'TRIPT'
    && lispString(matrixValue(triptType, 'symbol-package', 'TRIPT-TYPE'), 'TRIPT-TYPE package') === 'COMMON-GRAPHICS-USER',
  'Matrix probe did not resolve the expected COMMON-GRAPHICS-USER::TRIPT type');
  lispKeywordName(matrixValue(triptType, 'lookup-status', 'TRIPT-TYPE'), 'TRIPT-TYPE lookup status');

  const expectedFunctions = ['ZERO-EDGE', 'MAKE-TRIPT', 'X', 'Y', 'Z', 'MAIN'];
  const functions = recordsByTag(records, 'FUNCTION');
  const functionInfo = new Map();
  for (let index = 0; index < expectedFunctions.length; index += 1) {
    const row = functions[index];
    expectRecordFields(row.fields, ['name', 'present', 'status', 'fbound', 'type', 'compiled'], `FUNCTION ${index}`);
    const name = lispString(matrixValue(row, 'name', 'FUNCTION'), 'FUNCTION name');
    assert(name === expectedFunctions[index], `FUNCTION order/name differs at index ${index}`);
    matrixBoolean(row, 'present', true, `FUNCTION ${name}`);
    matrixBoolean(row, 'fbound', true, `FUNCTION ${name}`);
    const status = lispKeywordName(matrixValue(row, 'status', `FUNCTION ${name}`), `FUNCTION ${name} status`);
    const type = parseGenericType(matrixValue(row, 'type', `FUNCTION ${name}`), `FUNCTION ${name} type`);
    const compiled = lispBoolean(matrixValue(row, 'compiled', `FUNCTION ${name}`), `FUNCTION ${name} compiled`);
    if (name === 'ZERO-EDGE' || name === 'MAKE-TRIPT') {
      assert(compiled, `FUNCTION ${name} is not compiled`);
    }
    functionInfo.set(name, { status, type, compiled });
  }
  const arglists = recordsByTag(records, 'ARGLIST');
  const arglistNames = [];
  for (const row of arglists) {
    expectRecordFields(row.fields, ['name', 'values'], 'ARGLIST');
    const name = lispString(matrixValue(row, 'name', 'ARGLIST'), 'ARGLIST name');
    arglistNames.push(name);
    const values = matrixValue(row, 'values', `ARGLIST ${name}`);
    assert(Array.isArray(values) && values.length >= 1 && values.length <= 4,
      `ARGLIST ${name} values are not a bounded multiple-value list`);
    values.forEach((value, index) => {
      if (value !== null && value !== true) parseGenericType(value, `ARGLIST ${name} value ${index}`);
    });
    if (name === 'MAKE-TRIPT' || name === 'ZERO-EDGE') {
      assert(values.length === 2 && values[1] === true && Array.isArray(values[0]),
        `ARGLIST ${name} did not report its fixed positional lambda list`);
      const params = values[0].map((value, index) => lispSymbolLeaf(value, `ARGLIST ${name} parameter ${index}`));
      const wanted = name === 'MAKE-TRIPT' ? ['X', 'Y', 'Z'] : ['START', 'PERIM'];
      assert(same(params, wanted) && values[0].every(value => value.kind === 'qualified-symbol'
        && value.package === 'COMMON-GRAPHICS-USER'), `ARGLIST ${name} differs from its exact positional contract`);
    }
  }
  assert(same(arglistNames, expectedFunctions), 'ARGLIST records are not in the exact inspected-function order');

  const bindings = recordsByTag(records, 'BINDING');
  const bindingNames = ['XINCS', 'YINCS', 'START', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*'];
  const initialBindings = [];
  for (let index = 0; index < bindings.length; index += 1) {
    const row = bindings[index];
    const name = lispString(matrixValue(row, 'name', 'BINDING'), 'BINDING name');
    assert(name === bindingNames[index], `Initial BINDING order/name differs at ${index}`);
    expectRecordFields(row.fields, Object.hasOwn(row.fields, 'type')
      ? ['name', 'present', 'status', 'bound', 'type', 'value']
      : ['name', 'present', 'status', 'bound'], `BINDING ${index}`);
    matrixBoolean(row, 'present', true, `BINDING ${name}`);
    const bound = lispBoolean(matrixValue(row, 'bound', `BINDING ${name}`), `BINDING ${name} bound`);
    const status = lispKeywordName(matrixValue(row, 'status', `BINDING ${name}`), `BINDING ${name} status`);
    const expectedBound = name === 'XINCS' || name === 'YINCS';
    assert(status === 'INTERNAL' && bound === expectedBound,
      `Initial ${name} global binding status/bound state differs from the accepted runtime`);
    let type = null; let value = null;
    if (bound) {
      assert(Object.hasOwn(row.fields, 'type') && Object.hasOwn(row.fields, 'value'),
        `Bound initial ${name} binding lacks its type or value summary`);
      type = parseGenericType(matrixValue(row, 'type', `BINDING ${name}`), `BINDING ${name} type`);
      value = parseBoundedSummary(matrixValue(row, 'value', `BINDING ${name}`), `BINDING ${name} initial value`);
      const expectedIncrements = name === 'XINCS'
        ? [1, 1, 0, -1, -1, -1, 0, 1]
        : [0, 1, 1, 1, 0, -1, -1, -1];
      assert(type === 'CONS' && value?.proper === true && value.truncated === false
        && value.count === 8 && value.list.length === 8
        && same(value.list.map(item => item?.number), expectedIncrements),
      `Initial ${name} direction list is not the complete eight-FIXNUM binding`);
    } else assert(!Object.hasOwn(row.fields, 'type') && !Object.hasOwn(row.fields, 'value'),
      `Unbound initial ${name} binding unexpectedly includes a value`);
    initialBindings.push({ name, status, bound, ...(bound ? { type, value } : {}) });
  }

  const gate = onlyRecord(records, 'GATE');
  expectRecordFields(gate.fields, ['maker-fixed-positional-x-y-z', 'maker-compiled',
    'zero-edge-fixed-start-perim', 'zero-edge-compiled', 'accessors-fbound', 'errors-zero'], 'GATE');
  for (const key of Object.keys(gate.fields)) matrixBoolean(gate, key, true, 'GATE');
  const mainGate = onlyRecord(records, 'MAIN-GATE');
  expectRecordFields(mainGate.fields, ['present', 'fbound', 'original-type'], 'MAIN-GATE');
  matrixBoolean(mainGate, 'present', true, 'MAIN-GATE');
  matrixBoolean(mainGate, 'fbound', true, 'MAIN-GATE');
  parseGenericType(matrixValue(mainGate, 'original-type', 'MAIN-GATE'), 'MAIN-GATE original type');
  const install = onlyRecord(records, 'INSTALL');
  expectRecordFields(install.fields, ['name', 'original-type'], 'INSTALL');
  assert(lispSymbolLeaf(matrixValue(install, 'name', 'INSTALL'), 'INSTALL name') === 'MAIN',
    'Probe did not install its wrapper around MAIN');
  parseGenericType(matrixValue(install, 'original-type', 'INSTALL'), 'INSTALL original type');
  const ready = onlyRecord(records, 'READY');
  expectRecordFields(ready.fields, ['metadata-errors', 'zero-edge-input-matrix-gate', 'planned-cases', 'main-wrapper-installed'], 'READY');
  matrixInteger(ready, 'metadata-errors', 0, 'READY');
  matrixBoolean(ready, 'zero-edge-input-matrix-gate', true, 'READY');
  matrixInteger(ready, 'planned-cases', MAX_CASES, 'READY');
  matrixBoolean(ready, 'main-wrapper-installed', true, 'READY');
  assert(expectedInputs.length === MAX_CASES, 'Source-bound matrix input list is incomplete');
  return { functions: expectedFunctions, initialBindings,
    metadataGate: true, mainWrapperInstalled: true, ready: true };
}

function validatePostMainGate(records) {
  const row = onlyRecord(records, 'POST-MAIN-GATE');
  expectRecordFields(row.fields, ['metadata-ready', 'runtime-ready', 'rng-preview-valid', 'rng-baseline-ready',
    'rng-preview', 'rng-baseline', 'planned-cases'], 'POST-MAIN-GATE');
  for (const key of ['metadata-ready', 'runtime-ready', 'rng-preview-valid', 'rng-baseline-ready']) {
    matrixBoolean(row, key, true, 'POST-MAIN-GATE');
  }
  const preview = parsePreview(matrixValue(row, 'rng-preview', 'POST-MAIN-GATE'), 'POST-MAIN-GATE preview');
  const baseline = parsePreview(matrixValue(row, 'rng-baseline', 'POST-MAIN-GATE'), 'POST-MAIN-GATE baseline');
  assert(same(preview, baseline), 'POST-MAIN-GATE preview and baseline differ');
  matrixInteger(row, 'planned-cases', MAX_CASES, 'POST-MAIN-GATE');
  return preview;
}

function validateMatrixBoundary(row, expectedPhase, postMainPreview, label) {
  expectRecordFields(row.fields, ['phase', 'ready', 'states-recorded', 'bindings-same',
    'fill-map-identity-and-full-cells-same', 'patch-map-identity-and-full-cells-same',
    'rng-valid', 'rng-baseline-stable', 'rng-preview'], label);
  assert(matrixKeyword(row, 'phase', expectedPhase, label) === expectedPhase, `${label} phase differs`);
  for (const key of ['ready', 'states-recorded', 'bindings-same', 'fill-map-identity-and-full-cells-same',
    'patch-map-identity-and-full-cells-same', 'rng-valid', 'rng-baseline-stable']) {
    matrixBoolean(row, key, true, label);
  }
  const preview = parsePreview(matrixValue(row, 'rng-preview', label), `${label} preview`);
  assert(same(preview, postMainPreview), `${label} RNG preview differs from POST-MAIN-GATE baseline`);
  return { phase: expectedPhase, ready: true, originalBindingsSame: true,
    originalFillMapIdentityAndCellsSame: true, originalPatchMapIdentityAndCellsSame: true,
    rngPreview: preview, rngBaselineStable: true };
}

function matrixShapeKeyword(shape) {
  const names = {
    zero: 'ZERO', 'all-ones': 'ALL-ONES', 'center-zero-rest-ones': 'CENTER-ZERO-REST-ONES',
    'single-3-2-value-1': 'SINGLE-3-2', 'center-3x3-zero-rest-ones': 'CENTER-3X3-ZERO-REST-ONES',
    'single-3-2-value-2': 'SINGLE-3-2-VALUE-2', 'single-3-2-value-3': 'SINGLE-3-2-VALUE-3',
    'single-3-2-value-15': 'SINGLE-3-2-VALUE-15',
  };
  assert(Object.hasOwn(names, shape), `Unknown source-bound matrix shape ${shape}`);
  return names[shape];
}

function parseMatrixCaseHeader(row, expected) {
  const label = `CASE ordinal ${expected.ordinal}`;
  expectRecordFields(row.fields, ['ordinal', 'group', 'x', 'y', 'direction', 'perim', 'shape',
    'scratch-dimensions', 'scratch-element-type'], label);
  matrixOrdinal(row, expected.ordinal, label);
  assert(matrixKeyword(row, 'group', expected.group, label) === expected.group,
    `${label} group differs`);
  const start = [
    matrixInteger(row, 'x', expected.start[0], label),
    matrixInteger(row, 'y', expected.start[1], label),
    matrixInteger(row, 'direction', expected.start[2], label),
  ];
  matrixInteger(row, 'perim', expected.perim, label);
  const shape = matrixKeyword(row, 'shape', matrixShapeKeyword(expected.shape), label);
  assert(same(matrixIntegerList(matrixValue(row, 'scratch-dimensions', label), 2, `${label} scratch dimensions`), [7, 7]),
    `${label} scratch dimensions differ from the bounded 7x7 input`);
  assert(same(parseGenericType(matrixValue(row, 'scratch-element-type', label), `${label} scratch element type`),
    ['UNSIGNED-BYTE', 4]), `${label} scratch type differs from UBYTE4`);
  return { ordinal: expected.ordinal, group: expected.group, start, perim: expected.perim,
    shape: expected.shape, sourceShape: shape, scratchBeforeXMajorYMinor: expected.scratchBeforeXMajorYMinor };
}

function validateRngCheck(row, expectedPhase, baseline, label) {
  expectRecordFields(row.fields, ['phase', 'valid', 'stable', 'preview-before', 'preview-after'], label);
  matrixKeyword(row, 'phase', expectedPhase, label);
  matrixBoolean(row, 'valid', true, label);
  matrixBoolean(row, 'stable', true, label);
  const before = parsePreview(matrixValue(row, 'preview-before', label), `${label} before`);
  const after = parsePreview(matrixValue(row, 'preview-after', label), `${label} after`);
  assert(same(before, baseline) && same(after, baseline), `${label} RNG previews differ from the post-MAIN baseline`);
  return { phase: expectedPhase, valid: true, stable: true, previewBefore: before, previewAfter: after };
}

function parsePointPathSummary(value, label) {
  const fields = lispPlist(value, label);
  expectPlistKeys(fields, ['PROPER', 'CIRCULAR', 'IMPROPER', 'TRUNCATED', 'COUNT', 'TAIL',
    'RESULT-EQ-START', 'TAIL-EQ-START', 'ITEMS'], label);
  const proper = lispBoolean(plistGet(fields, 'PROPER', label), `${label} proper`);
  const circular = lispBoolean(plistGet(fields, 'CIRCULAR', label), `${label} circular`);
  const improper = lispBoolean(plistGet(fields, 'IMPROPER', label), `${label} improper`);
  const truncated = lispBoolean(plistGet(fields, 'TRUNCATED', label), `${label} truncated`);
  const count = lispInteger(plistGet(fields, 'COUNT', label), `${label} count`);
  const resultEqStart = lispBoolean(plistGet(fields, 'RESULT-EQ-START', label), `${label} result eq START`);
  const tailEqStart = lispBoolean(plistGet(fields, 'TAIL-EQ-START', label), `${label} tail eq START`);
  const rawItems = plistGet(fields, 'ITEMS', label);
  const items = rawItems === null ? [] : rawItems;
  assert(Array.isArray(items) && count === items.length && count <= MAX_RETURNED_PATH_ITEMS && !truncated,
    `${label} path item count is incomplete, truncated, or above its cap`);
  const tailRaw = plistGet(fields, 'TAIL', label);
  let tail;
  if (tailRaw?.kind === 'keyword') tail = { marker: tailRaw.name };
  else {
    const tailFields = lispPlist(tailRaw, `${label} improper tail`);
    expectPlistKeys(tailFields, ['TYPE', 'SUMMARY'], `${label} improper tail`);
    tail = { type: parseGenericType(plistGet(tailFields, 'TYPE', label), `${label} tail type`),
      summary: parseBoundedSummary(plistGet(tailFields, 'SUMMARY', label), `${label} tail summary`) };
  }
  const flags = [proper, circular, improper].filter(Boolean).length;
  assert(flags === 1, `${label} must be exactly one of proper, circular, or improper`);
  if (proper) assert(tail.marker === 'NONE' && !resultEqStart && !tailEqStart,
    `${label} proper-list tail or identity flags are inconsistent`);
  if (circular) assert(tail.marker === 'REPEATED-CONS' && !resultEqStart && !tailEqStart,
    `${label} circular-list tail or identity flags are inconsistent`);
  if (improper) assert(!tail.marker && (tail.marker === undefined) && typeof tail.type !== 'undefined',
    `${label} improper tail summary is absent`);
  if (resultEqStart) assert(improper && count === 0 && !circular && !proper,
    `${label} result EQ START is inconsistent with list shape`);
  if (tailEqStart) assert(improper && (count > 0 || resultEqStart),
    `${label} tail EQ START is inconsistent with list shape`);
  if (resultEqStart || tailEqStart) {
    assert(tail.type && String(tail.type).split('::').at(-1) === 'TRIPT',
      `${label} START identity does not refer to a TRIPT tail`);
  }
  if (improper) assertNoSummaryTruncation(tail.summary, `${label} improper tail summary`);
  const seenFirstIndices = new Map();
  const parsedItems = items.map((item, index) => {
    const itemFields = lispPlist(item, `${label} point ${index}`);
    expectPlistKeys(itemFields, ['INDEX', 'CONS-EQ-START', 'CONS-CDR-EQ-START', 'CONS-EQ-PREVIOUS-CDR',
      'POINT-TYPE', 'POINT-IS-TRIPT', 'POINT-EQ-START', 'POINT-FIRST-EQ-INDEX', 'XYZ'], `${label} point ${index}`);
    const pointIndex = lispInteger(plistGet(itemFields, 'INDEX', label), `${label} point index`);
    const consEqStart = lispBoolean(plistGet(itemFields, 'CONS-EQ-START', label), `${label} cons eq START`);
    const consCdrEqStart = lispBoolean(plistGet(itemFields, 'CONS-CDR-EQ-START', label), `${label} cons cdr eq START`);
    const consEqPreviousCdr = lispBoolean(plistGet(itemFields, 'CONS-EQ-PREVIOUS-CDR', label), `${label} cons eq previous cdr`);
    const pointType = parseGenericType(plistGet(itemFields, 'POINT-TYPE', label), `${label} point type`);
    const pointIsTript = lispBoolean(plistGet(itemFields, 'POINT-IS-TRIPT', label), `${label} point is TRIPT`);
    const pointEqStart = lispBoolean(plistGet(itemFields, 'POINT-EQ-START', label), `${label} point eq START`);
    const firstEqIndex = lispInteger(plistGet(itemFields, 'POINT-FIRST-EQ-INDEX', label), `${label} first EQ index`);
    const xyzRaw = plistGet(itemFields, 'XYZ', label);
    assert(pointIndex === index && firstEqIndex >= 0 && firstEqIndex <= index,
      `${label} point indices are out of range or order`);
    const pointTypeRaw = plistGet(itemFields, 'POINT-TYPE', label);
    const pointTypeLeaf = pointTypeRaw?.kind === 'symbol' || pointTypeRaw?.kind === 'qualified-symbol'
      ? lispSymbolLeaf(pointTypeRaw, `${label} point type`) : null;
    assert(pointIsTript === (pointTypeLeaf === 'TRIPT'),
      `${label} point TRIPT type marker disagrees with the reported type`);
    assert(!consEqStart, `${label} list cons cell cannot be identical to the supplied TRIPT START object`);
    assert(consEqPreviousCdr === (index > 0), `${label} proper traversal cdr identity is inconsistent at point ${index}`);
    if (consCdrEqStart) assert(tailEqStart && index === items.length - 1,
      `${label} cons cdr EQ START is not on the final improper point`);
    let xyz = null;
    if (pointIsTript) {
      assert(Array.isArray(xyzRaw), `${label} TRIPT point ${index} has no complete XYZ slots`);
      xyz = parseTypedFixnums(xyzRaw, 3, `${label} point ${index} XYZ`);
    } else {
      assert(xyzRaw === null, `${label} non-TRIPT point unexpectedly reports XYZ slots`);
    }
    if (firstEqIndex < index) {
      const first = seenFirstIndices.get(firstEqIndex);
      assert(first && first.pointEqStart === pointEqStart,
        `${label} point ${index} first-EQ identity does not refer to a prior matching point`);
    } else {
      assert(firstEqIndex === index && !seenFirstIndices.has(index),
        `${label} point ${index} first-EQ index is not its first occurrence`);
    }
    if (pointEqStart) assert(pointIsTript, `${label} non-TRIPT point is EQ to the TRIPT START object`);
    const result = { index, consEqStart, consCdrEqStart, consEqPreviousCdr,
      pointType, pointIsTript, pointEqStart, pointFirstEqIndex: firstEqIndex, xyz };
    if (firstEqIndex === index) seenFirstIndices.set(index, result);
    return result;
  });
  return { proper, circular, improper, truncated, count, tail, resultEqStart, tailEqStart, items: parsedItems };
}

function parseTypedValueRows(value, label) {
  const rows = value === null ? [] : parseTypedValues(value, label);
  for (const [index, row] of rows.entries()) assertNoSummaryTruncation(row.raw, `${label}[${index}]`);
  return rows.map(row => ({ type: row.type, summary: row.summary }));
}

function validateReturnedPath(returnRow, pathRow, value, label) {
  const arity = matrixInteger(returnRow, 'arity', null, `${label} return`);
  const returnRows = parseTypedValueRows(matrixValue(returnRow, 'values', `${label} return`), `${label} typed return`);
  assert(returnRows.length === arity, `${label} typed return arity differs from captured values`);
  matrixOrdinal(pathRow, value.ordinal, `${label} returned path`);
  let path;
  if (arity === 0) {
    expectRecordFields(pathRow.fields, ['ordinal', 'present', 'reason'], `${label} no-primary path`);
    matrixBoolean(pathRow, 'present', false, `${label} no-primary path`);
    matrixKeyword(pathRow, 'reason', 'NO-PRIMARY-VALUE', `${label} no-primary path`);
    path = { present: false, reason: 'no-primary-value', count: 0, items: [] };
  } else {
    expectRecordFields(pathRow.fields, ['ordinal', 'summary'], `${label} returned path`);
    const rawPrimary = parseTypedValues(matrixValue(returnRow, 'values', `${label} return`), `${label} typed return`)[0].raw;
    const pathSummary = parsePointPathSummary(matrixValue(pathRow, 'summary', `${label} returned path`), `${label} path summary`);
    if (rawPrimary === null) {
      assert(pathSummary.proper && pathSummary.count === 0 && pathSummary.tail.marker === 'NONE',
        `${label} NIL primary return does not match its empty proper path summary`);
    } else if (Array.isArray(rawPrimary) && rawPrimary[0]?.kind === 'keyword' && rawPrimary[0].name === 'LIST') {
      const primaryList = parseBoundedSummary(rawPrimary, `${label} primary return list`);
      assert(!primaryList.truncated && primaryList.count === pathSummary.count
        && primaryList.proper === pathSummary.proper && primaryList.truncated === pathSummary.truncated,
      `${label} typed primary list and full point-path summary disagree`);
      assert(primaryList.list.length === pathSummary.items.length,
        `${label} typed primary list and detailed point path have different item counts`);
      for (const [index, item] of primaryList.list.entries()) {
        const detailed = pathSummary.items[index];
        if (item && typeof item === 'object' && Object.hasOwn(item, 'objectType')) {
          assert(String(item.objectType).split('::').at(-1) === String(detailed.pointType).split('::').at(-1),
            `${label} typed primary item ${index} type differs from its point-path type`);
        }
        if (detailed.pointIsTript) assert(item && typeof item === 'object' && item.objectType
          && String(item.objectType).split('::').at(-1) === 'TRIPT',
        `${label} TRIPT point ${index} lacks matching typed primary object evidence`);
      }
    } else {
      assert(pathSummary.improper && pathSummary.count === 0,
        `${label} non-list primary return does not match its improper path summary`);
      const primarySummary = parseBoundedSummary(rawPrimary, `${label} primary return summary`);
      assert(same(pathSummary.tail.summary, primarySummary),
        `${label} improper path tail differs from the typed primary return`);
      assert(String(pathSummary.tail.type).split('::').at(-1) === String(returnRows[0].type).split('::').at(-1),
        `${label} improper path tail type differs from the typed primary return`);
      if (pathSummary.resultEqStart || pathSummary.tailEqStart) {
        assert(String(returnRows[0].type).split('::').at(-1) === 'TRIPT',
          `${label} direct START identity is not a TRIPT return`);
      }
    }
    path = { present: true, ...pathSummary };
  }
  return { arity, values: returnRows, path };
}

function validateMatrixCase(records, expected, baselineState, postMainPreview) {
  const ordinal = expected.ordinal;
  const label = `matrix case ${ordinal}`;
  const startIndex = records.findIndex(row => row.tag === 'CASE' && lispInteger(matrixValue(row, 'ordinal', label), label) === ordinal);
  const endIndex = records.findIndex((row, index) => index > startIndex && row.tag === 'CASE-END'
    && lispInteger(matrixValue(row, 'ordinal', label), label) === ordinal);
  assert(startIndex >= 0 && endIndex > startIndex, `${label} does not have a complete ordered CASE segment`);
  const segment = records.slice(startIndex, endIndex + 1);
  const header = parseMatrixCaseHeader(segment[0], expected);
  const wantedOrder = ['CASE', 'MATRIX-BOUNDARY', 'CASE-PREFLIGHT', 'MATRIX-BOUNDARY', 'RNG-CHECK',
    'CONSTRUCTOR-RETURN', 'CONSTRUCTOR-POINT', 'CONSTRUCTOR-GATE', 'DYNAMIC-SYMBOL-GATE',
    'CALL-GATE', 'DYNAMIC-PREFLIGHT', 'CASE-RETURN', 'RETURNED-TRIPT-PATH',
    'RNG-CHECK', 'START-DIRECT-XYZ', 'SCRATCH-MAP', 'CASE-RNG', 'DYNAMIC-OBSERVATION',
    'MATRIX-BOUNDARY', 'CASE-OBSERVATIONS-READY', 'CASE-END'];
  const meaningfulOrder = segment.filter(row => wantedOrder.includes(row.tag)).map(row => row.tag);
  assert(same(meaningfulOrder, wantedOrder), `${label} records are missing, duplicated, or out of source order`);

  const one = tag => {
    const rows = segment.filter(row => row.tag === tag);
    assert(rows.length === 1, `${label} expected exactly one ${tag} record, found ${rows.length}`);
    return rows[0];
  };
  const boundaries = segment.filter(row => row.tag === 'MATRIX-BOUNDARY');
  const boundaryPhases = ['BEFORE-CONSTRUCTOR', 'AFTER-CONSTRUCTOR', 'AFTER-TARGET'];
  const parsedBoundaries = boundaries.map((row, index) => validateMatrixBoundary(row, boundaryPhases[index], postMainPreview,
    `${label} boundary ${boundaryPhases[index]}`));
  const preflight = one('CASE-PREFLIGHT');
  expectRecordFields(preflight.fields, ['ordinal', 'baseline-boundary-ready'], `${label} preflight`);
  matrixOrdinal(preflight, ordinal, `${label} preflight`);
  matrixBoolean(preflight, 'baseline-boundary-ready', true, `${label} preflight`);

  const statePhases = ['BEFORE-CONSTRUCTOR', 'AFTER-CONSTRUCTOR', 'INSIDE-PROGV-BEFORE',
    'INSIDE-PROGV-AFTER', 'AFTER-TARGET'];
  const stateGroups = Object.fromEntries(statePhases.map(phase => [phase,
    parseStateBindingGroup(segment, phase, `${label} ${phase}`)]));
  for (const phase of ['BEFORE-CONSTRUCTOR', 'AFTER-CONSTRUCTOR', 'AFTER-TARGET']) {
    validateOuterStateGroup(stateGroups[phase], baselineState, `${label} ${phase}`);
  }
  const dynamicBefore = validateDynamicStateGroup(stateGroups['INSIDE-PROGV-BEFORE'], baselineState,
    expected.scratchBeforeXMajorYMinor, `${label} dynamic preflight`);
  const dynamicAfter = validateDynamicStateGroup(stateGroups['INSIDE-PROGV-AFTER'], baselineState,
    expected.scratchBeforeXMajorYMinor, `${label} dynamic restoration`);
  const delta = validateStateDeltas(segment, label);

  const rngChecks = segment.filter(row => row.tag === 'RNG-CHECK');
  assert(rngChecks.length === 2, `${label} lacks constructor and target RNG checks`);
  const constructorRng = validateRngCheck(rngChecks[0], 'CONSTRUCTOR', postMainPreview, `${label} constructor RNG`);
  const targetRngCheck = validateRngCheck(rngChecks[1], 'ZERO-EDGE', postMainPreview, `${label} target RNG`);

  const constructorReturn = one('CONSTRUCTOR-RETURN');
  expectRecordFields(constructorReturn.fields, ['ordinal', 'arity', 'values'], `${label} constructor return`);
  matrixOrdinal(constructorReturn, ordinal, `${label} constructor return`);
  matrixInteger(constructorReturn, 'arity', 1, `${label} constructor return`);
  const constructorValues = parseTypedValueRows(matrixValue(constructorReturn, 'values', label), `${label} constructor typed values`);
  assert(constructorValues.length === 1, `${label} constructor did not return exactly one typed value`);
  assert(String(constructorValues[0].type).split('::').at(-1) === 'TRIPT'
    && String(constructorValues[0].summary?.objectType).split('::').at(-1) === 'TRIPT',
  `${label} constructor value is not a TRIPT object`);

  const constructorPoint = one('CONSTRUCTOR-POINT');
  expectRecordFields(constructorPoint.fields, ['ordinal', 'type', 'type-is-tript', 'direct-xyz',
    'expected-xyz', 'slots-match', 'identity-unique', 'first-ordinal'], `${label} constructor point`);
  matrixOrdinal(constructorPoint, ordinal, `${label} constructor point`);
  const constructorType = parseGenericType(matrixValue(constructorPoint, 'type', label), `${label} constructor type`);
  assert(String(constructorType).split('::').at(-1) === 'TRIPT', `${label} constructor point type is not TRIPT`);
  matrixBoolean(constructorPoint, 'type-is-tript', true, `${label} constructor point`);
  const directXyz = parseTypedFixnums(matrixValue(constructorPoint, 'direct-xyz', label), 3, `${label} constructor direct XYZ`, expected.start);
  const expectedXyz = matrixIntegerList(matrixValue(constructorPoint, 'expected-xyz', label), 3, `${label} expected XYZ`);
  assert(same(expectedXyz, expected.start) && same(directXyz, expected.start), `${label} constructor XYZ differs from source input`);
  matrixBoolean(constructorPoint, 'slots-match', true, `${label} constructor point`);
  matrixBoolean(constructorPoint, 'identity-unique', true, `${label} constructor point`);
  assert(matrixValue(constructorPoint, 'first-ordinal', label) === null,
    `${label} constructor reused a previously observed TRIPT instance`);

  const constructorGate = one('CONSTRUCTOR-GATE');
  expectRecordFields(constructorGate.fields, ['ordinal', 'ready', 'type-is-tript', 'slots-match', 'identity-unique',
    'rng-preview-valid', 'rng-preview-stable', 'baseline-state-and-maps-same'], `${label} constructor gate`);
  matrixOrdinal(constructorGate, ordinal, `${label} constructor gate`);
  for (const key of ['ready', 'type-is-tript', 'slots-match', 'identity-unique', 'rng-preview-valid',
    'rng-preview-stable', 'baseline-state-and-maps-same']) matrixBoolean(constructorGate, key, true, `${label} constructor gate`);

  const dynamicSymbolGate = one('DYNAMIC-SYMBOL-GATE');
  expectRecordFields(dynamicSymbolGate.fields, ['ordinal', 'ready', 'fill-symbol-eq-post-main',
    'pic-wide-symbol-eq-post-main', 'pic-high-symbol-eq-post-main'], `${label} dynamic symbol gate`);
  matrixOrdinal(dynamicSymbolGate, ordinal, `${label} dynamic symbol gate`);
  for (const key of ['ready', 'fill-symbol-eq-post-main', 'pic-wide-symbol-eq-post-main', 'pic-high-symbol-eq-post-main']) {
    matrixBoolean(dynamicSymbolGate, key, true, `${label} dynamic symbol gate`);
  }

  const dynamicPreflight = one('DYNAMIC-PREFLIGHT');
  expectRecordFields(dynamicPreflight.fields, ['ordinal', 'temporary-bindings-recorded', 'fill-map-eq-scratch',
    'pic-wide', 'pic-high', 'scratch-before'], `${label} dynamic preflight`);
  matrixOrdinal(dynamicPreflight, ordinal, `${label} dynamic preflight`);
  matrixBoolean(dynamicPreflight, 'temporary-bindings-recorded', true, `${label} dynamic preflight`);
  matrixBoolean(dynamicPreflight, 'fill-map-eq-scratch', true, `${label} dynamic preflight`);
  matrixInteger(dynamicPreflight, 'pic-wide', 7, `${label} dynamic preflight`);
  matrixInteger(dynamicPreflight, 'pic-high', 7, `${label} dynamic preflight`);
  const dynamicScratchBefore = parseScratchCells(matrixValue(dynamicPreflight, 'scratch-before', label),
    `${label} dynamic scratch before`, expected.scratchBeforeXMajorYMinor);

  const callGate = one('CALL-GATE');
  expectRecordFields(callGate.fields, ['ordinal', 'ready', 'metadata-ready', 'runtime-ready', 'constructor-ready',
    'dynamic-state-ready', 'exact-scratch-shape', 'pre-call-rng-valid', 'pre-call-rng-baseline-stable',
    'call-cap-available'], `${label} call gate`);
  matrixOrdinal(callGate, ordinal, `${label} call gate`);
  for (const key of ['ready', 'metadata-ready', 'runtime-ready', 'constructor-ready', 'dynamic-state-ready',
    'exact-scratch-shape', 'pre-call-rng-valid', 'pre-call-rng-baseline-stable', 'call-cap-available']) {
    matrixBoolean(callGate, key, true, `${label} call gate`);
  }

  const returnRow = one('CASE-RETURN');
  expectRecordFields(returnRow.fields, ['ordinal', 'arity', 'values'], `${label} return`);
  matrixOrdinal(returnRow, ordinal, `${label} return`);
  const returnPath = validateReturnedPath(returnRow, one('RETURNED-TRIPT-PATH'),
    { ordinal, startAfter: null }, label);

  const startRow = one('START-DIRECT-XYZ');
  expectRecordFields(startRow.fields, ['ordinal', 'before', 'after', 'unchanged', 'expected-before'], `${label} START slots`);
  matrixOrdinal(startRow, ordinal, `${label} START slots`);
  const startBefore = parseTypedFixnums(matrixValue(startRow, 'before', label), 3, `${label} START before`, expected.start);
  const startAfter = parseTypedFixnums(matrixValue(startRow, 'after', label), 3, `${label} START after`);
  const startUnchanged = matrixBoolean(startRow, 'unchanged', same(startBefore, startAfter), `${label} START slots`);
  const expectedBefore = matrixIntegerList(matrixValue(startRow, 'expected-before', label), 3, `${label} expected START before`);
  assert(same(expectedBefore, expected.start), `${label} expected START before differs from source input`);
  returnPath.path.items?.forEach((point, index) => {
    if (point.pointEqStart && Array.isArray(point.xyz)) {
      assert(same(point.xyz, startAfter), `${label} returned path point ${index} EQ START has stale coordinates`);
    }
  });

  const scratchRow = one('SCRATCH-MAP');
  expectRecordFields(scratchRow.fields, ['ordinal', 'dimensions', 'element-type', 'shape', 'exact-shape-before',
    'exact-shape-after', 'cells-before', 'cells-after', 'changed-cells'], `${label} scratch map`);
  matrixOrdinal(scratchRow, ordinal, `${label} scratch map`);
  assert(same(matrixIntegerList(matrixValue(scratchRow, 'dimensions', label), 2, `${label} scratch dimensions`), [7, 7]),
    `${label} scratch output dimensions differ`);
  assert(same(parseGenericType(matrixValue(scratchRow, 'element-type', label), `${label} scratch output type`),
    ['UNSIGNED-BYTE', 4]), `${label} scratch output type differs`);
  matrixKeyword(scratchRow, 'shape', matrixShapeKeyword(expected.shape), `${label} scratch map`);
  matrixBoolean(scratchRow, 'exact-shape-before', true, `${label} scratch map`);
  matrixBoolean(scratchRow, 'exact-shape-after', true, `${label} scratch map`);
  const scratchBefore = parseScratchCells(matrixValue(scratchRow, 'cells-before', label), `${label} scratch before`,
    expected.scratchBeforeXMajorYMinor);
  const scratchAfter = parseScratchCells(matrixValue(scratchRow, 'cells-after', label), `${label} scratch after`,
    expected.scratchBeforeXMajorYMinor);
  const changedCells = parseChangedCells(matrixValue(scratchRow, 'changed-cells', label), scratchBefore, scratchAfter,
    `${label} changed cells`);
  assert(same(dynamicScratchBefore, scratchBefore), `${label} dynamic preflight differs from captured scratch map`);

  const caseRng = one('CASE-RNG');
  expectRecordFields(caseRng.fields, ['ordinal', 'before-valid', 'after-valid', 'stable', 'baseline-stable',
    'preview-before', 'preview-after'], `${label} target RNG`);
  matrixOrdinal(caseRng, ordinal, `${label} target RNG`);
  for (const key of ['before-valid', 'after-valid', 'stable', 'baseline-stable']) matrixBoolean(caseRng, key, true, `${label} target RNG`);
  const targetPreviewBefore = parsePreview(matrixValue(caseRng, 'preview-before', label), `${label} target RNG before`);
  const targetPreviewAfter = parsePreview(matrixValue(caseRng, 'preview-after', label), `${label} target RNG after`);
  assert(same(targetPreviewBefore, postMainPreview) && same(targetPreviewAfter, postMainPreview),
    `${label} target RNG previews differ from POST-MAIN-GATE baseline`);

  const dynamicObservation = one('DYNAMIC-OBSERVATION');
  expectRecordFields(dynamicObservation.fields, ['ordinal', 'before-recorded', 'after-recorded', 'before-ready', 'after-ready'],
    `${label} dynamic observation`);
  matrixOrdinal(dynamicObservation, ordinal, `${label} dynamic observation`);
  for (const key of ['before-recorded', 'after-recorded', 'before-ready', 'after-ready']) {
    matrixBoolean(dynamicObservation, key, true, `${label} dynamic observation`);
  }

  const observations = one('CASE-OBSERVATIONS-READY');
  expectRecordFields(observations.fields, ['ordinal', 'ready', 'return-or-condition', 'starts-recorded',
    'scratch-recorded', 'dynamic-state-recorded', 'original-state-and-maps-same', 'rng-valid', 'rng-stable',
    'rng-baseline-stable', 'overflow'], `${label} observations`);
  matrixOrdinal(observations, ordinal, `${label} observations`);
  for (const key of ['ready', 'return-or-condition', 'starts-recorded', 'scratch-recorded', 'dynamic-state-recorded',
    'original-state-and-maps-same', 'rng-valid', 'rng-stable', 'rng-baseline-stable']) {
    matrixBoolean(observations, key, true, `${label} observations`);
  }
  matrixBoolean(observations, 'overflow', false, `${label} observations`);

  const caseEnd = one('CASE-END');
  expectRecordFields(caseEnd.fields, ['ordinal', 'attempted', 'returned', 'completed', 'calls', 'active', 'overflow',
    'observer-errors', 'target-condition'], `${label} CASE-END`);
  matrixOrdinal(caseEnd, ordinal, `${label} CASE-END`);
  matrixBoolean(caseEnd, 'attempted', true, `${label} CASE-END`);
  matrixBoolean(caseEnd, 'returned', true, `${label} CASE-END`);
  matrixBoolean(caseEnd, 'completed', true, `${label} CASE-END`);
  matrixInteger(caseEnd, 'calls', ordinal, `${label} CASE-END cumulative calls`);
  matrixBoolean(caseEnd, 'active', false, `${label} CASE-END`);
  matrixBoolean(caseEnd, 'overflow', false, `${label} CASE-END`);
  matrixInteger(caseEnd, 'observer-errors', 0, `${label} CASE-END`);
  assert(matrixValue(caseEnd, 'target-condition', label) === null, `${label} captured a target condition`);

  return {
    ...header,
    constructor: { arity: 1, type: constructorValues[0].type, summary: constructorValues[0].summary,
      xyz: directXyz, uniqueInstance: true, firstOrdinal: null, gateReady: true, rng: constructorRng },
    target: { callGateReady: true, return: returnPath, startBefore, startAfter, startUnchanged,
      scratchBefore, scratchAfter, changedCells, rng: { before: targetPreviewBefore, after: targetPreviewAfter,
        valid: true, stable: true, baselineStable: true },
      dynamicStateBefore: dynamicBefore, dynamicStateAfter: dynamicAfter,
      stateDeltas: delta, boundaries: parsedBoundaries,
      originalStateAndMapsSame: true, completed: true, calls: ordinal },
  };
}

function validateOriginalMapPreflight(records, baselineState) {
  const preflight = onlyRecord(records, 'ORIGINAL-MAP-PREFLIGHT');
  expectRecordFields(preflight.fields, ['ready', 'fill', 'patch', 'snapshots', 'cell-cap'], 'ORIGINAL-MAP-PREFLIGHT');
  matrixBoolean(preflight, 'ready', true, 'ORIGINAL-MAP-PREFLIGHT');
  assert(lispSymbolLeaf(matrixValue(preflight, 'snapshots', 'ORIGINAL-MAP-PREFLIGHT'), 'ORIGINAL-MAP-PREFLIGHT snapshots')
    === 'ONE-IMMUTABLE-BASELINE-PER-MAP',
  'ORIGINAL-MAP-PREFLIGHT snapshot policy differs');
  matrixInteger(preflight, 'cell-cap', 1048576, 'ORIGINAL-MAP-PREFLIGHT');
  const mapMetadata = {
    'FILL-MAP': parseMatrixMetadata(matrixValue(preflight, 'fill', 'ORIGINAL-MAP-PREFLIGHT'), 'FILL-MAP original metadata', 4),
    'PATCH-MAP': parseMatrixMetadata(matrixValue(preflight, 'patch', 'ORIGINAL-MAP-PREFLIGHT'), 'PATCH-MAP original metadata', 16),
  };
  validateOriginalMapSummary(baselineState['FILL-MAP'].rawValue, mapMetadata['FILL-MAP'], 'post-MAIN FILL-MAP');
  validateOriginalMapSummary(baselineState['PATCH-MAP'].rawValue, mapMetadata['PATCH-MAP'], 'post-MAIN PATCH-MAP');
  const snapshots = parseMapSnapshotStages(records, mapMetadata);
  return { ready: true, mapMetadata, snapshots,
    naturalMapSummaryTruncationPolicy: 'metadata-only; full flattened/copy lengths and full-cell identity checks required',
    originalCellCopiesCompleted: true, fullCellEqualityCheckedAtEachBoundary: true };
}

function validateMatrixFooter(records, postMainPreview, baselineState) {
  const boundaryRows = recordsByTag(records, 'MATRIX-BOUNDARY');
  const finalRow = boundaryRows.at(-1);
  assert(finalRow && matrixKeyword(finalRow, 'phase', null, 'final matrix boundary') === 'FINAL',
    'Final MATRIX-BOUNDARY record is not the final row in its source phase');
  validateMatrixBoundary(finalRow, 'FINAL', postMainPreview, 'final matrix boundary');
  const explicitFinal = onlyRecord(records, 'MATRIX-FINAL-BOUNDARY');
  expectRecordFields(explicitFinal.fields, ['ready', 'rng-preview'], 'MATRIX-FINAL-BOUNDARY');
  matrixBoolean(explicitFinal, 'ready', true, 'MATRIX-FINAL-BOUNDARY');
  const explicitPreview = parsePreview(matrixValue(explicitFinal, 'rng-preview', 'MATRIX-FINAL-BOUNDARY'),
    'MATRIX-FINAL-BOUNDARY preview');
  assert(same(explicitPreview, postMainPreview), 'MATRIX-FINAL-BOUNDARY RNG preview differs from baseline');

  const accounting = onlyRecord(records, 'MATRIX-ACCOUNTING');
  expectRecordFields(accounting.fields, ['planned', 'attempted', 'completed', 'calls', 'ready', 'aborted',
    'final-boundary', 'active', 'overflow', 'errors', 'complete'], 'MATRIX-ACCOUNTING');
  for (const key of ['planned', 'attempted', 'completed', 'calls']) matrixInteger(accounting, key, MAX_CASES, 'MATRIX-ACCOUNTING');
  for (const key of ['ready', 'final-boundary', 'complete']) matrixBoolean(accounting, key, true, 'MATRIX-ACCOUNTING');
  for (const key of ['aborted', 'active', 'overflow']) matrixBoolean(accounting, key, false, 'MATRIX-ACCOUNTING');
  matrixInteger(accounting, 'errors', 0, 'MATRIX-ACCOUNTING');

  const mainFinish = onlyRecord(records, 'MAIN-FINISH');
  expectRecordFields(mainFinish.fields, ['status'], 'MAIN-FINISH');
  matrixKeyword(mainFinish, 'status', 'NORMAL', 'MAIN-FINISH');
  const complete = onlyRecord(records, 'COMPLETE');
  expectRecordFields(complete.fields, ['main-status', 'main-wrapper-installed', 'planned', 'attempted', 'completed',
    'zero-edge-calls', 'active', 'overflow', 'errors', 'complete', 'aborted', 'ready'], 'COMPLETE');
  matrixKeyword(complete, 'main-status', 'NORMAL', 'COMPLETE');
  matrixBoolean(complete, 'main-wrapper-installed', true, 'COMPLETE');
  for (const key of ['planned', 'attempted', 'completed', 'zero-edge-calls']) matrixInteger(complete, key, MAX_CASES, 'COMPLETE');
  for (const key of ['complete', 'ready']) matrixBoolean(complete, key, true, 'COMPLETE');
  for (const key of ['active', 'overflow', 'aborted']) matrixBoolean(complete, key, false, 'COMPLETE');
  matrixInteger(complete, 'errors', 0, 'COMPLETE');
  const finalState = parseStateBindingGroup(records, 'FINAL', 'final original-state check');
  validateOuterStateGroup(finalState, baselineState, 'final original-state check');
  return { mainStatus: 'normal', wrapperInstalled: true, planned: MAX_CASES, attempted: MAX_CASES,
    completed: MAX_CASES, calls: MAX_CASES, active: false, overflow: false, errors: 0,
    finalBoundaryReady: true, outerBindingsRestored: true, rngPreview: explicitPreview };
}

function validateMatrixReport(source) {
  requireMatrixReportPins();
  assert(typeof source === 'string' && (source.endsWith('\n') || source.endsWith('\r\n')),
    'Matrix report must end with its final newline');
  const lines = source.replace(/\r?\n$/u, '').split(/\r?\n/u);
  assert(lines.length === MATRIX_PINS.reportLines && lines.every(line => line.length > 0),
    `Matrix report has ${lines.length} nonempty lines, expected ${MATRIX_PINS.reportLines}`);
  const records = lines.map(parseMatrixRecord);
  const observedTagCounts = validateTagCounts(records);
  validateProbeStartup(records, deriveExpectedMatrixInputs());
  const postMainPreview = validatePostMainGate(records);
  const baselineState = parseStateBindingGroup(records, 'POST-MAIN-BASELINE', 'post-MAIN baseline state');
  const maps = validateOriginalMapPreflight(records, baselineState);

  const caseRows = recordsByTag(records, 'CASE');
  const cases = deriveExpectedMatrixInputs();
  assert(caseRows.length === cases.length, 'Matrix case header count differs from the source-bound 160 inputs');
  const observedCases = caseRows.map((row, index) => {
    matrixOrdinal(row, index + 1, `matrix case header ${index + 1}`);
    return validateMatrixCase(records, cases[index], baselineState, postMainPreview);
  });
  const footer = validateMatrixFooter(records, postMainPreview, baselineState);
  return {
    framing: { begin: lines[0], scope: lines[1], limits: lines[2], end: lines.at(-1),
      terminalEndVerified: true, lines: lines.length },
    completion: { planned: MAX_CASES, attempted: MAX_CASES, completed: MAX_CASES, calls: MAX_CASES,
      errors: 0, overflow: false, active: false, complete: true },
    postMainRngPreview: postMainPreview,
    originalMaps: maps,
    caseCount: observedCases.length,
    cases: observedCases,
    footer,
    tagCounts: observedTagCounts,
  };
}

function deriveExpectedMatrixInputs() {
  const cases = [];
  const zero = Array(49).fill(0);
  const shapes = [
    ['all-ones', () => Array(49).fill(1)],
    ['center-zero-rest-ones', () => Array.from({ length: 49 }, (_, i) => i === 24 ? 0 : 1)],
    ['single-3-2-value-1', () => Array.from({ length: 49 }, (_, i) => i === 3 * 7 + 2 ? 1 : 0)],
    ['center-3x3-zero-rest-ones', () => Array.from({ length: 49 }, (_, i) => {
      const x = Math.floor(i / 7); const y = i % 7;
      return x >= 2 && x <= 4 && y >= 2 && y <= 4 ? 0 : 1;
    })],
    ['single-3-2-value-2', () => Array.from({ length: 49 }, (_, i) => i === 3 * 7 + 2 ? 2 : 0)],
    ['single-3-2-value-3', () => Array.from({ length: 49 }, (_, i) => i === 3 * 7 + 2 ? 3 : 0)],
    ['single-3-2-value-15', () => Array.from({ length: 49 }, (_, i) => i === 3 * 7 + 2 ? 15 : 0)],
  ];
  for (let direction = 0; direction < 8; direction += 1) {
    for (let perim = 0; perim <= 4; perim += 1) {
      cases.push({ ordinal: cases.length + 1, group: 'A', start: [3, 3, direction], perim, shape: 'zero', scratchBeforeXMajorYMinor: [...zero] });
    }
  }
  const boundaryPositions = [[0, 0], [0, 3], [0, 6], [3, 0], [3, 6], [6, 0], [6, 3], [6, 6]];
  for (const [x, y] of boundaryPositions) {
    for (let direction = 0; direction < 8; direction += 1) {
      cases.push({ ordinal: cases.length + 1, group: 'B', start: [x, y, direction], perim: 4, shape: 'zero', scratchBeforeXMajorYMinor: [...zero] });
    }
  }
  for (const [shape, makeScratch] of shapes) {
    for (let direction = 0; direction < 8; direction += 1) {
      cases.push({ ordinal: cases.length + 1, group: 'C', start: [3, 3, direction], perim: 4, shape, scratchBeforeXMajorYMinor: makeScratch() });
    }
  }
  assert(cases.length === MAX_CASES, `Expected exactly ${MAX_CASES} planned matrix inputs`);
  for (const row of cases) {
    assert(row.scratchBeforeXMajorYMinor.length === 49
      && row.scratchBeforeXMajorYMinor.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 15),
    `Matrix ordinal ${row.ordinal} has an invalid 7x7 UBYTE4 input`);
  }
  return cases;
}

function requireMatrixSourcePins() {
  for (const key of ['probePath', 'probeSha256', 'probeBytes', 'outputName', 'endMarker', 'scopeRecord', 'limitsRecord']) {
    const value = MATRIX_PINS[key];
    assert(value !== null && value !== undefined, `Matrix source/report pin ${key} is pending producer freeze`);
  }
  hashField(MATRIX_PINS.probeSha256, 'Frozen matrix probe hash');
  assert(Number.isSafeInteger(MATRIX_PINS.probeBytes) && MATRIX_PINS.probeBytes > 0,
    'Frozen matrix probe byte pin is invalid');
  assert(typeof MATRIX_PINS.probePath === 'string' && MATRIX_PINS.probePath.startsWith('research/introspection/')
    && MATRIX_PINS.probePath.endsWith('.cl') && typeof MATRIX_PINS.outputName === 'string'
    && basename(MATRIX_PINS.outputName) === MATRIX_PINS.outputName && MATRIX_PINS.outputName.endsWith('.txt')
    && typeof MATRIX_PINS.endMarker === 'string' && typeof MATRIX_PINS.scopeRecord === 'string'
    && typeof MATRIX_PINS.limitsRecord === 'string', 'Frozen matrix source/framing pins are malformed');
}

function requireMatrixReportPins() {
  requireMatrixSourcePins();
  for (const key of ['reportSha256', 'reportBytes', 'reportLines']) {
    const value = MATRIX_PINS[key];
    assert(value !== null && value !== undefined, `Accepted matrix report pin ${key} is pending`);
  }
  hashField(MATRIX_PINS.reportSha256, 'Accepted matrix report hash');
  assert(Number.isSafeInteger(MATRIX_PINS.probeBytes) && MATRIX_PINS.probeBytes > 0
    && Number.isSafeInteger(MATRIX_PINS.reportBytes) && MATRIX_PINS.reportBytes > 0
    && Number.isSafeInteger(MATRIX_PINS.reportLines) && MATRIX_PINS.reportLines > 0,
  'Frozen matrix byte/line pins are invalid');
}

function assertIgnored(path, label) {
  const rel = portable(relative(PROJECT_ROOT, resolve(path)));
  const result = spawnSync('git', ['check-ignore', '--quiet', '--', rel], {
    cwd: PROJECT_ROOT, encoding: 'utf8', windowsHide: true,
  });
  assert(!result.error && result.status === 0, `${label} is not covered by workspace ignore rules`);
}

function trackBaselineClosure(baseline) {
  assert(Array.isArray(baseline.sourceHashes) && baseline.sourceHashes.length === 199,
    'Frozen two-case input derivation no longer binds exactly 199 source/artifact files');
  const seen = new Set();
  for (const [index, row] of baseline.sourceHashes.entries()) {
    expectKeys(row, ['path', 'sha256', 'bytes'], `baseline source binding ${index}`);
    assert(typeof row.path === 'string' && row.path.length > 0 && !seen.has(row.path),
      `Baseline source binding ${index} path is invalid or repeated`);
    seen.add(row.path);
    const bytes = trackedRead(row.path, `current baseline closure ${row.path}`);
    assert(bytes.length === row.bytes && sha(bytes) === hashField(row.sha256, `baseline ${row.path} hash`),
      `Current matrix derivation differs from frozen baseline closure at ${row.path}`);
  }
  return seen;
}

function readSetupBaseline(baseline) {
  const applicationFiles = baseline.setup?.applicationFiles;
  assert(Array.isArray(applicationFiles) && applicationFiles.length === EXPECTED_APPLICATION_FILES.length
    && same(applicationFiles.map(row => row.name).sort(), [...EXPECTED_APPLICATION_FILES].sort()),
  'Re-derived baseline does not bind the exact 12-file AARON runtime');
  return baseline.setup;
}

function validateRunnerCurrent() {
  const bytes = trackedRead(REQUIRED_RUNNER_PATH, 'reviewed required-probe runner');
  assert(bytes.length === REQUIRED_RUNNER_BYTES && sha(bytes) === REQUIRED_RUNNER_SHA256,
    'The reviewed required-probe runner hash/length changed');
  return { path: REQUIRED_RUNNER_PATH, sha256: sha(bytes), bytes: bytes.length };
}

function validateSummary(summary, config, setupBaseline) {
  expectKeys(summary, [
    'runId', 'mode', 'smallImage', 'preSceneProbeSha256', 'probeOutputNames',
    'preSceneProbePauseSeconds', 'requiredProbeOutputName', 'requiredProbeEndMarker',
    'probeCompletionSatisfied', 'runnerSha256', 'complete', 'startedAt', 'finishedAt',
    'installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'aa0Sha256', 'sceneReportSha256',
  ], `${config.runId} required-probe runner summary`);
  assert(summary.runId === config.runId && summary.mode === MODE && summary.smallImage === false
    && summary.preSceneProbePauseSeconds === 0 && summary.complete === true,
  `${config.runId} summary is incomplete or has the wrong identity/mode/image/pause`);
  assert(hashField(summary.runnerSha256, `${config.runId} runner hash`) === REQUIRED_RUNNER_SHA256,
    `${config.runId} summary does not bind the reviewed required-probe runner`);
  assert(typeof summary.startedAt === 'string' && Number.isFinite(Date.parse(summary.startedAt))
    && typeof summary.finishedAt === 'string' && Number.isFinite(Date.parse(summary.finishedAt))
    && Date.parse(summary.finishedAt) >= Date.parse(summary.startedAt),
  `${config.runId} summary timestamps are invalid`);
  const instrumented = config.instrumented;
  const expectedNames = instrumented ? [MATRIX_PINS.outputName] : [];
  assert(Array.isArray(summary.probeOutputNames) && same(summary.probeOutputNames, expectedNames),
    `${config.runId} probe-output declaration differs`);
  if (instrumented) {
    assert(hashField(summary.preSceneProbeSha256, `${config.runId} probe hash`) === MATRIX_PINS.probeSha256
      && summary.requiredProbeOutputName === MATRIX_PINS.outputName
      && summary.requiredProbeEndMarker === MATRIX_PINS.endMarker
      && summary.probeCompletionSatisfied === true,
    `${config.runId} required-probe completion binding is incomplete or differs`);
  } else {
    assert(summary.preSceneProbeSha256 === null && summary.requiredProbeOutputName === ''
      && summary.requiredProbeEndMarker === '' && summary.probeCompletionSatisfied === true,
    `${config.runId} uninstrumented control contains wrong required-probe metadata`);
  }
  const setup = {
    installerSha256: hashField(summary.installerSha256, `${config.runId} installer hash`),
    registryPatchSha256: hashField(summary.registryPatchSha256, `${config.runId} registry patch hash`),
    licensePatchSha256: hashField(summary.licensePatchSha256, `${config.runId} license patch hash`),
  };
  assert(setup.installerSha256 === setupBaseline.installerSha256,
    `${config.runId} installer differs from the current extracted setup`);
  return setup;
}

function readCoreCapture(root, config, summary, setupBaseline, runSetup) {
  const aa0 = trackedRead(resolve(root, 'capture/aa0'), `${config.runId} AA0`);
  const scene = trackedRead(resolve(root, 'capture/aaron-scene-state-snapshot.txt'), `${config.runId} raw scene report`);
  const sceneJsonBytes = trackedRead(resolve(root, 'scene-state.json'), `${config.runId} scene-state JSON`);
  const sceneJson = parseJson(sceneJsonBytes, `${config.runId} scene-state JSON`);
  const image = trackedRead(resolve(root, 'capture/image'), `${config.runId} image`);
  const imageId = trackedRead(resolve(root, 'capture/image-id'), `${config.runId} image ID`);
  const executable = trackedRead(resolve(root, 'runtime/AARON.exe'), `${config.runId} executable`);
  const pll = trackedRead(resolve(root, 'runtime/AARON.pll'), `${config.runId} PLL`);
  assert([aa0, scene, image, imageId, executable, pll].every(bytes => bytes.length > 0),
    `${config.runId} has an empty drawing or runtime artifact`);
  const runtimeFiles = setupBaseline.applicationFiles.map(file => {
    const original = trackedRead(resolve('research/extracted/aaron/application', file.name),
      `current extracted ${file.name}`);
    const bytes = trackedRead(resolve(root, 'runtime', file.name), `${config.runId} runtime ${file.name}`);
    const patched = ['registry.dll', 'license.dll'].includes(file.name.toLowerCase());
    assert(patched ? !bytes.equals(original) : bytes.equals(original),
      `${config.runId} runtime ${file.name} does not match its expected patch state`);
    return { name: file.name, bytes, sha256: sha(bytes), patched };
  });
  assert(runtimeFiles.length === 12 && runtimeFiles.some(row => row.name === 'AARON.exe'
    && row.bytes.equals(executable)) && runtimeFiles.some(row => row.name === 'AARON.pll'
    && row.bytes.equals(pll)), `${config.runId} runtime copies do not cover all 12 files or match captured exe/PLL`);
  const registry = runtimeFiles.find(row => row.name.toLowerCase() === 'registry.dll');
  const license = runtimeFiles.find(row => row.name.toLowerCase() === 'license.dll');
  assert(registry.sha256 === runSetup.registryPatchSha256 && license.sha256 === runSetup.licensePatchSha256,
    `${config.runId} summary patch hashes do not bind the patched runtime DLLs`);
  assert(sha(aa0) === hashField(summary.aa0Sha256, `${config.runId} AA0 hash`)
    && sha(scene) === hashField(summary.sceneReportSha256, `${config.runId} scene hash`),
  `${config.runId} summary does not bind AA0 and raw scene bytes`);
  assert(sceneJson.schemaVersion === 1 && sceneJson.source?.localRunId === config.runId
    && hashField(sceneJson.source?.sha256, `${config.runId} parsed-scene source hash`) === sha(scene),
  `${config.runId} parsed scene-state JSON is not bound to its raw report`);
  return { aa0, scene, image, imageId, executable, pll, runtimeFiles,
    hashes: { aa0: sha(aa0), scene: sha(scene), image: sha(image), imageId: sha(imageId), executable: sha(executable), pll: sha(pll) },
    lengths: { aa0: aa0.length, scene: scene.length, image: image.length, imageId: imageId.length,
      executable: executable.length, pll: pll.length } };
}

function validateLoadedSources(root, config, pins) {
  const loadedSources = COMMON_LISP_SOURCES.map(([filename, sourcePath]) => {
    const current = trackedRead(sourcePath, `${config.runId} current Lisp ${filename}`);
    const stagedPath = resolve(root, 'capture', filename);
    const staged = trackedRead(stagedPath, `${config.runId} staged Lisp ${filename}`);
    assert(current.equals(staged), `${config.runId} staged Lisp source differs: ${filename}`);
    return { filename, sourcePath, sha256: sha(current), stagedSha256: sha(staged), bytes: current.length };
  });
  const modeSource = trackedRead(resolve(root, 'capture', LOADED_SCENE_SOURCE), `${config.runId} loaded mode source`);
  const currentModeSource = trackedRead(`research/introspection/${LOADED_SCENE_SOURCE}`,
    `${config.runId} current loaded mode source`);
  assert(modeSource.equals(currentModeSource), `${config.runId} loaded mode source differs from current source`);
  const runtimeInit = {};
  const runtimeInitBytes = {};
  for (const filename of ['.clinit.cl', 'clinit.cl']) {
    const bytes = trackedRead(resolve(root, 'runtime', filename), `${config.runId} ${filename}`);
    runtimeInit[filename] = { sha256: sha(bytes), bytes: bytes.length };
    runtimeInitBytes[filename] = bytes;
  }
  let startupRoute;
  if (config.instrumented) {
    const captureLoader = trackedRead(resolve(root, 'capture/aaron-probe-loader.cl'), `${config.runId} staged probe loader`);
    const runtimeLoader = trackedRead(resolve(root, 'runtime/aaron-probe-loader.cl'), `${config.runId} runtime probe loader`);
    const probeCopy = trackedRead(resolve(root, 'capture/aaron-pre-scene-probe.cl'), `${config.runId} staged probe source`);
    const currentProbe = trackedRead(MATRIX_PINS.probePath, `${config.runId} current frozen matrix probe`);
    assert(currentProbe.length === MATRIX_PINS.probeBytes && sha(currentProbe) === MATRIX_PINS.probeSha256
      && probeCopy.equals(currentProbe), `${config.runId} current/staged matrix probe differs from its frozen pin`);
    const expectedLoader = Buffer.from(
      `(set 'aaron-pre-scene-probe-pause-seconds 0)\r\n(load "C:\\\\temp\\\\aaron-pre-scene-probe.cl")\r\n(load "C:\\\\temp\\\\${LOADED_SCENE_SOURCE}")\r\n`,
      'utf8');
    assert(captureLoader.equals(expectedLoader) && runtimeLoader.equals(expectedLoader)
      && runtimeInitBytes['.clinit.cl'].equals(expectedLoader)
      && runtimeInitBytes['clinit.cl'].equals(expectedLoader),
    `${config.runId} loader/init routing does not exactly load the matrix probe and selected scene source`);
    startupRoute = { kind: 'required-probe-loader-then-mode-source', sha256: sha(expectedLoader) };
  } else {
    assert(runtimeInitBytes['.clinit.cl'].equals(modeSource) && runtimeInitBytes['clinit.cl'].equals(modeSource),
      `${config.runId} uninstrumented control does not route directly to the selected scene source`);
    for (const rel of ['pre-scene-probe-request.json', 'capture/aaron-pre-scene-probe.cl',
      'capture/aaron-probe-loader.cl', 'runtime/aaron-probe-loader.cl']) {
      assert(!existsSync(resolve(root, rel)), `${config.runId} uninstrumented control unexpectedly contains ${rel}`);
    }
    startupRoute = { kind: 'direct-mode-source', sha256: sha(modeSource) };
  }
  assert(modeSource.equals(trackedRead(resolve(root, 'capture', LOADED_SCENE_SOURCE),
    `${config.runId} repeat loaded mode source`)), `${config.runId} mode source changed during validation`);
  return { loadedSources, runtimeInit, startupRoute, modeSourceSha256: sha(modeSource),
    routingValidated: true, ...(pins ? { probeSha256: pins.probeSha256 } : {}) };
}

function readProbeRequest(root, config) {
  const requestBytes = trackedRead(resolve(root, 'pre-scene-probe-request.json'), `${config.runId} request`);
  const request = parseJson(requestBytes, `${config.runId} request`);
  expectKeys(request, ['schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256', 'pauseSeconds',
    'releaseFile', 'probeOutputNames', 'requiredProbeOutputName', 'requiredProbeEndMarker', 'runnerSha256'],
  `${config.runId} required-probe request`);
  assert(request.schemaVersion === 1 && request.runId === config.runId && request.pauseSeconds === 0
    && request.releaseFile === 'C:\\temp\\aaron-native-code-release.txt'
    && same(request.probeOutputNames, [MATRIX_PINS.outputName])
    && request.requiredProbeOutputName === MATRIX_PINS.outputName
    && request.requiredProbeEndMarker === MATRIX_PINS.endMarker
    && hashField(request.runnerSha256, `${config.runId} request runner hash`) === REQUIRED_RUNNER_SHA256
    && hashField(request.probeSha256, `${config.runId} request probe hash`) === MATRIX_PINS.probeSha256,
  `${config.runId} required-probe request fields differ from the accepted run`);
  const probe = trackedRead(MATRIX_PINS.probePath, `${config.runId} current probe`);
  const staged = trackedRead(resolve(root, 'capture/aaron-pre-scene-probe.cl'), `${config.runId} staged probe`);
  assert(probe.length === MATRIX_PINS.probeBytes && sha(probe) === MATRIX_PINS.probeSha256
    && staged.equals(probe), `${config.runId} request/current/staged probe hashes disagree`);
  assert(typeof request.runtimeExecutable === 'string'
    && resolve(request.runtimeExecutable).toLowerCase() === resolve(root, 'runtime/AARON.exe').toLowerCase(),
  `${config.runId} request executable is outside the capture root`);
  return { request, sha256: sha(requestBytes), probeSha256: sha(probe), probeBytes: probe.length };
}

function readRun(config, setupBaseline) {
  const root = resolve(LOCAL_ORACLE_ROOT, config.runId);
  assert(within(resolve(LOCAL_ORACLE_ROOT), root) && basename(root) === config.runId,
    `${config.runId} run root is not the named local-oracle root`);
  const summaryBytes = trackedRead(resolve(root, 'summary.json'), `${config.runId} summary`);
  const summary = parseJson(summaryBytes, `${config.runId} summary`);
  const setup = validateSummary(summary, config, setupBaseline);
  const request = config.instrumented ? readProbeRequest(root, config) : null;
  if (config.instrumented) {
    assert(hashField(summary.preSceneProbeSha256, `${config.runId} summary probe hash`) === request.probeSha256,
      `${config.runId} summary does not match its request probe hash`);
  }
  const capture = readCoreCapture(root, config, summary, setupBaseline, setup);
  const loaded = validateLoadedSources(root, config, request);
  let report = null;
  if (config.instrumented) {
    const bytes = trackedRead(resolve(root, 'capture', MATRIX_PINS.outputName), `${config.runId} matrix report`);
    assert(bytes.length === MATRIX_PINS.reportBytes && sha(bytes) === MATRIX_PINS.reportSha256,
      `${config.runId} report differs from the accepted root-owned matrix capture`);
    const text = bytes.toString('utf8');
    assert(Buffer.from(text, 'utf8').equals(bytes), `${config.runId} matrix report is not round-trip UTF-8`);
    report = validateMatrixReport(text);
  }
  return {
    runId: config.runId, root: portable(relative(PROJECT_ROOT, root)),
    timestamps: { startedAt: summary.startedAt, finishedAt: summary.finishedAt },
    summarySha256: sha(summaryBytes), setup, request, loaded, capture, report,
  };
}

function compareCaptureBytes(left, right, label) {
  for (const key of ['aa0', 'scene', 'image', 'imageId', 'executable', 'pll']) {
    assert(left[key].equals(right[key]), `${label} ${key} bytes differ`);
  }
  assert(left.runtimeFiles.length === 12 && right.runtimeFiles.length === 12
    && left.runtimeFiles.every((row, index) => row.name === right.runtimeFiles[index].name
      && row.bytes.equals(right.runtimeFiles[index].bytes)),
  `${label} all-12 runtime application bytes differ`);
  return { drawingOutputsByteIdentical: true, executableAndPllByteIdentical: true,
    all12RuntimeApplicationFilesByteIdentical: true };
}

function portableRun(run) {
  return {
    runId: run.runId,
    root: run.root,
    timestamps: run.timestamps,
    summarySha256: run.summarySha256,
    setup: run.setup,
    request: run.request,
    loaded: run.loaded,
    capture: {
      hashes: run.capture.hashes,
      lengths: run.capture.lengths,
      runtimeFiles: run.capture.runtimeFiles.map(file => ({
        name: file.name, sha256: file.sha256, bytes: file.bytes.length, patched: file.patched,
      })),
    },
    report: run.report,
  };
}

function assertPortableEvidence(value, label = 'evidence', seen = new Set()) {
  assert(!Buffer.isBuffer(value), `${label} contains raw binary bytes`);
  if (!value || typeof value !== 'object') return;
  assert(!(value.type === 'Buffer' && Array.isArray(value.data)), `${label} contains serialized Buffer data`);
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item, index) => assertPortableEvidence(item, `${label}[${index}]`, seen));
  else for (const [key, item] of Object.entries(value)) assertPortableEvidence(item, `${label}.${key}`, seen);
}

function revalidateSources() {
  const rows = [...trackedSources.values()].sort((a, b) => a.path.localeCompare(b.path));
  for (const row of rows) {
    const bytes = readFileSync(resolve(row.path));
    assert(bytes.length === row.bytes && sha(bytes) === row.sha256,
      `Bound source/artifact changed before matrix evidence freeze: ${row.path}`);
  }
  return rows;
}

export function deriveZeroEdgeInputMatrixEvidence() {
  trackedSources.clear();
  trackedRead(fileURLToPath(import.meta.url), 'matrix evidence helper source');
  requireMatrixReportPins();
  const baseline = deriveZeroEdgeInputEvidence();
  const baselinePaths = trackBaselineClosure(baseline);
  const setupBaseline = readSetupBaseline(baseline);
  const runner = validateRunnerCurrent();
  const probe = trackedRead(MATRIX_PINS.probePath, 'frozen matrix probe source');
  assert(probe.length === MATRIX_PINS.probeBytes && sha(probe) === MATRIX_PINS.probeSha256,
    'Current matrix probe differs from its frozen source pin');
  const matrixInputs = deriveExpectedMatrixInputs();
  const before = readRun({ ...RUNS.before }, setupBaseline);
  const matrix = readRun({ ...RUNS.matrix }, setupBaseline);
  const after = readRun({ ...RUNS.after }, setupBaseline);
  assert(Date.parse(before.timestamps.finishedAt) <= Date.parse(matrix.timestamps.startedAt),
    'Fresh before-control did not finish before the matrix run began');
  assert(Date.parse(after.timestamps.startedAt) >= Date.parse(matrix.timestamps.finishedAt),
    'Fresh after-control did not start after the matrix run finished');
  assert(same(before.setup, matrix.setup) && same(matrix.setup, after.setup),
    'Before, matrix, and after runs have different setup patch hashes');
  assert(same(before.loaded.loadedSources, matrix.loaded.loadedSources)
    && same(matrix.loaded.loadedSources, after.loaded.loadedSources),
  'Runs do not bind identical current/staged six-source Lisp sets');
  const beforeParity = compareCaptureBytes(matrix.capture, before.capture, 'Matrix vs preceding control');
  const afterParity = compareCaptureBytes(matrix.capture, after.capture, 'Matrix vs following control');
  const controlsParity = compareCaptureBytes(before.capture, after.capture, 'Fresh matrix controls');
  const sourceHashes = revalidateSources();
  assert(sourceHashes.length >= baselinePaths.size + 20,
    'Matrix derivation failed to bind its runner, probe, report, and three run roots');
  return {
    schemaVersion: 1,
    kind: 'zero-edge-bounded-input-matrix-evidence',
    scope: {
      plannedCases: MAX_CASES,
      maxReturnedPathItems: MAX_RETURNED_PATH_ITEMS,
      matrixInputs,
      interpretation: 'Each ordinal is limited to the exact source-bound START, numeric PERIM value, and full 7x7 UBYTE4 input recorded for that case.',
    },
    baseline: {
      kind: baseline.kind,
      spec: baseline.spec,
      sourceCount: baseline.sourceHashes.length,
      nativeBaseline: baseline.nativeBaseline,
    },
    runner,
    probe: { path: MATRIX_PINS.probePath, sha256: MATRIX_PINS.probeSha256, bytes: MATRIX_PINS.probeBytes,
      outputName: MATRIX_PINS.outputName, endMarker: MATRIX_PINS.endMarker },
    runs: { before: portableRun(before), matrix: portableRun(matrix), after: portableRun(after) },
    parity: { before: beforeParity, after: afterParity, controls: controlsParity },
    sourceHashes,
  };
}

function parseArgs(args) {
  let output = null;
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg !== '--output' && !arg.startsWith('--output=')) throw new Error(`Unknown option ${arg}`);
    assert(!seen.has('--output'), '--output may be specified only once');
    seen.add('--output');
    if (arg === '--output') {
      output = args[index + 1];
      assert(output && !output.startsWith('--'), '--output requires a path');
      index += 1;
    } else output = arg.slice('--output='.length);
    assert(typeof output === 'string' && output.length > 0, '--output path is empty');
  }
  return { help: false, output };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: node research/tools/derive-zero-edge-input-matrix-evidence.mjs [--output <fresh-ignored-json-under-matrix-run-q>]\n');
    return;
  }
  requireMatrixReportPins();
  const outputRoot = resolve(LOCAL_ORACLE_ROOT, RUNS.matrix.runId);
  const outputPath = resolve(args.output ?? resolve(outputRoot, 'aaron-zero-edge-input-matrix-evidence-20261012.json'));
  assert(within(outputRoot, outputPath), 'Derived matrix evidence output must be under the named final matrix run root');
  assert(!existsSync(outputPath), 'Derived matrix evidence output must be fresh; refusing to overwrite');
  assertIgnored(outputPath, 'Derived matrix evidence output');
  const evidence = deriveZeroEdgeInputMatrixEvidence();
  assertPortableEvidence(evidence);
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(outputPath, bytes, { flag: 'wx' });
  process.stdout.write(JSON.stringify({
    outputPath: portable(relative(PROJECT_ROOT, outputPath)),
    outputSha256: sha(bytes),
    plannedCases: evidence.scope.plannedCases,
    observedCases: evidence.runs.matrix.report?.cases?.length ?? null,
    controls: [evidence.runs.before.runId, evidence.runs.after.runId],
    controlsByteIdentical: true,
    runnerSha256: evidence.runner.sha256,
    sourceCount: evidence.sourceHashes.length,
  }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
