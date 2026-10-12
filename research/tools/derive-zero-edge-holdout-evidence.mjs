#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual as same } from 'node:util';
import { deriveZeroEdgeInputMatrixEvidence } from './derive-zero-edge-input-matrix-evidence.mjs';

const PROJECT_ROOT = resolve('.');
const LOCAL_ORACLE_ROOT = 'research/extracted/local-oracle';
const SPEC_PATH = 'research/introspection/zero-edge-holdout-cases-20261012.json';
const SPEC_SHA256 = '25d70f8ea33dd87ba9e92e14120114c40f542bcaba8225452424a0f6a1b95c72';
const SPEC_BYTES = 49758;
const MODE = 'writer-stream-seed-1234';
const LOADED_SCENE_SOURCE = 'scene-state-snapshot-writer-stream-seeded-1234.cl';
const REQUIRED_RUNNER_PATH = 'research/oracle/run-local-scene-state-required-probe.ps1';
const REQUIRED_RUNNER_SHA256 = '1fe4546ea847bd31b28b2bcbab6228356b7f44ea8d61bde006ccbad58c788ec9';
const REQUIRED_RUNNER_BYTES = 27295;
const MAX_CASES = 39;
const MAX_WIDTH = 9;
const MAX_HEIGHT = 11;
const MAX_SCRATCH_CELLS = 99;
const MAX_ARRAY_ITEMS = 128;
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
  before: Object.freeze({ runId: 'zero-edge-holdout-control-seed1234-20261012-s', instrumented: false }),
  base: Object.freeze({ runId: 'zero-edge-holdout-base-seed1234-20261012-t', instrumented: true, batch: 'base-v1' }),
  ring: Object.freeze({ runId: 'zero-edge-holdout-ring-seed1234-20261012-u', instrumented: true, batch: 'ring-v1' }),
  after: Object.freeze({ runId: 'zero-edge-holdout-control-after-seed1234-20261012-v', instrumented: false }),
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

// This accepts only bounded Lisp data syntax; reader macros, dotted lists, and
// unescaped reader labels are deliberately unsupported.
function parseHoldoutRecord(line) {
  const tagMatch = /^([A-Z][A-Z0-9-]*)\s/u.exec(line);
  assert(tagMatch, `Malformed holdout report record: ${line.slice(0, 120)}`);
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
        assert(index < line.length, 'Unterminated holdout-report string escape');
        const escaped = line[index++];
        assert(escaped === '"' || escaped === '\\', `Unsupported holdout-report escape: \\${escaped}`);
        value += escaped;
      } else value += char;
    }
    throw new Error('Unterminated holdout-report string');
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
      assert(Number.isFinite(value), `Non-finite holdout-report number ${raw}`);
      return { kind: 'number', raw, value };
    }
    const qualified = /^([A-Za-z][A-Za-z0-9-]*)(::)([A-Za-z*][A-Za-z0-9*-]*)$/u.exec(raw);
    if (qualified) return { kind: 'qualified-symbol', package: qualified[1].toUpperCase(),
      separator: '::', name: qualified[3].toUpperCase() };
    if (/^(?:[A-Za-z*][A-Za-z0-9*-]*|&[A-Za-z][A-Za-z0-9-]*)$/u.test(raw)) {
      return { kind: 'symbol', name: raw.toUpperCase() };
    }
    throw new Error(`Unsupported holdout-report atom ${raw}`);
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

function lispSymbolName(value, label) {
  assert(value?.kind === 'symbol' || value?.kind === 'qualified-symbol', `${label} is not a symbol`);
  return value.kind === 'symbol' ? value.name : `${value.package}${value.separator}${value.name}`;
}

function lispSymbolLeaf(value, label) { return lispSymbolName(value, label).split('::').at(-1); }

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
  assert(depth <= 8, `${label} exceeds structural parser depth`);
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
    assert(count === items.length && count <= MAX_RETURNED_PATH_ITEMS, `${label} bounded list count is inconsistent`);
    const proper = lispBoolean(plistGet(fields, 'PROPER', label), `${label} proper`);
    const truncated = lispBoolean(plistGet(fields, 'TRUNCATED', label), `${label} truncated`);
    const tail = plistGet(fields, 'TAIL', label);
    if (proper) assert(tail?.kind === 'keyword' && tail.name === 'NONE', `${label} proper-list tail is not :NONE`);
    if (truncated) assert(count === MAX_RETURNED_PATH_ITEMS, `${label} did not reach the path-item bound`);
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
    assert(dimensions.every(item => item >= 0), `${label} array has a negative dimension`);
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
    assert(shown === values.length && shown <= Math.min(total, MAX_ARRAY_ITEMS)
      && truncated === (total > MAX_ARRAY_ITEMS || shown < total), `${label} array summary is inconsistent`);
    if (total > MAX_ARRAY_ITEMS) assert(shown === 0, `${label} oversized array exposes a partial snapshot`);
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

function parseTypedValues(value, label) {
  assert(Array.isArray(value), `${label} is not a typed-values list`);
  return value.map((row, index) => {
    const fields = lispPlist(row, `${label}[${index}]`);
    expectPlistKeys(fields, ['TYPE', 'VALUE'], `${label}[${index}]`);
    const type = parseGenericType(plistGet(fields, 'TYPE', label), `${label}[${index}] type`);
    const raw = plistGet(fields, 'VALUE', label);
    return { type, summary: parseBoundedSummary(raw, `${label}[${index}] value`), raw };
  });
}

function parseTypedFixnums(value, expectedLength, label, expected = null) {
  const rows = parseTypedValues(value, label);
  if (expectedLength !== null) assert(rows.length === expectedLength, `${label} length differs`);
  const values = rows.map((row, index) => {
    assert(row.type === 'FIXNUM', `${label}[${index}] is not FIXNUM`);
    const number = parseNumberSummary(row.raw, `${label}[${index}] value`, 'FIXNUM');
    assert(Number.isSafeInteger(number.value), `${label}[${index}] is not a safe integer`);
    return number.value;
  });
  if (expected !== null) assert(same(values, expected), `${label} differs from source-bound values`);
  return values;
}

function parsePreview(value, label) {
  const fields = lispPlist(value, label);
  expectPlistKeys(fields, ['RANDOM-100-1', 'RANDOM-100-2', 'RANDOM-100-3'], label);
  const draws = ['RANDOM-100-1', 'RANDOM-100-2', 'RANDOM-100-3']
    .map(key => lispInteger(plistGet(fields, key, label), `${label} ${key}`));
  assert(draws.every(item => item >= 0 && item < 100), `${label} RNG draw is outside 0..99`);
  return draws;
}

function parseScratchCells(value, width, height, label, expectedValues = null) {
  assert(Array.isArray(value), `${label} is not a scratch-cell list`);
  const count = width * height;
  assert(Number.isSafeInteger(count) && count > 0 && count <= MAX_SCRATCH_CELLS && value.length === count,
    `${label} does not expose every bounded scratch cell`);
  const cells = value.map((row, index) => {
    assert(Array.isArray(row) && row.length === 3, `${label}[${index}] is not x/y/value`);
    const tuple = row.map((item, field) => lispInteger(item, `${label}[${index}][${field}]`));
    const expectedX = Math.floor(index / height); const expectedY = index % height;
    assert(tuple[0] === expectedX && tuple[1] === expectedY && tuple[2] >= 0 && tuple[2] <= 15,
      `${label}[${index}] is invalid or outside x-major/y-minor coordinate order`);
    return tuple;
  });
  if (expectedValues) assert(same(cells.map(([, , valueAtCell]) => valueAtCell), expectedValues),
    `${label} cells differ from the full source-bound scratch input`);
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
  assert(before.length === after.length, `${label} before/after cell counts differ`);
  for (let index = 0; index < before.length; index += 1) {
    const [x, y, oldValue] = before[index];
    const newValue = after[index][2];
    if (oldValue !== newValue) expected.push([x, y, oldValue, newValue]);
  }
  assert(same(actual, expected), `${label} does not match the complete scratch before/after maps`);
  return actual;
}

function matrixOrdinal(record, expected, label = record.tag) {
  const actual = lispInteger(matrixValue(record, 'ordinal', label), `${label} ordinal`);
  assert(actual === expected, `${label} ordinal is ${actual}, expected ${expected}`);
  return actual;
}

function parseTypedValueRows(value, label) {
  const rows = value === null ? [] : parseTypedValues(value, label);
  for (const [index, row] of rows.entries()) assertNoSummaryTruncation(row.raw, `${label}[${index}]`);
  return rows.map(row => ({ type: row.type, summary: row.summary }));
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
  if (improper) assert(!tail.marker && typeof tail.type !== 'undefined', `${label} improper tail summary is absent`);
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
    const pointTypeRaw = plistGet(itemFields, 'POINT-TYPE', label);
    const pointType = parseGenericType(pointTypeRaw, `${label} point type`);
    const pointTypeLeaf = pointTypeRaw?.kind === 'symbol' || pointTypeRaw?.kind === 'qualified-symbol'
      ? lispSymbolLeaf(pointTypeRaw, `${label} point type`) : null;
    const pointIsTript = lispBoolean(plistGet(itemFields, 'POINT-IS-TRIPT', label), `${label} point is TRIPT`);
    const pointEqStart = lispBoolean(plistGet(itemFields, 'POINT-EQ-START', label), `${label} point eq START`);
    const firstEqIndex = lispInteger(plistGet(itemFields, 'POINT-FIRST-EQ-INDEX', label), `${label} first EQ index`);
    const xyzRaw = plistGet(itemFields, 'XYZ', label);
    assert(pointIndex === index && firstEqIndex >= 0 && firstEqIndex <= index,
      `${label} point indices are out of range or order`);
    assert(pointIsTript === (pointTypeLeaf === 'TRIPT'), `${label} point TRIPT marker disagrees with its type`);
    assert(!consEqStart, `${label} list cons cell cannot be identical to the supplied TRIPT START object`);
    assert(consEqPreviousCdr === (index > 0), `${label} proper traversal cdr identity is inconsistent at point ${index}`);
    if (consCdrEqStart) assert(tailEqStart && index === items.length - 1,
      `${label} cons cdr EQ START is not on the final improper point`);
    let xyz = null;
    if (pointIsTript) {
      assert(Array.isArray(xyzRaw), `${label} TRIPT point ${index} has no readable complete XYZ slots`);
      xyz = parseTypedFixnums(xyzRaw, 3, `${label} point ${index} XYZ`);
    } else assert(xyzRaw === null, `${label} non-TRIPT point unexpectedly reports XYZ slots`);
    if (firstEqIndex < index) {
      const first = seenFirstIndices.get(firstEqIndex);
      assert(first && first.pointEqStart === pointEqStart,
        `${label} point ${index} first-EQ identity does not refer to a prior matching point`);
    } else assert(firstEqIndex === index && !seenFirstIndices.has(index),
      `${label} point ${index} first-EQ index is not its first occurrence`);
    if (pointEqStart) assert(pointIsTript, `${label} non-TRIPT point is EQ to the supplied TRIPT START`);
    const result = { index, consEqStart, consCdrEqStart, consEqPreviousCdr,
      pointType, pointIsTript, pointEqStart, pointFirstEqIndex: firstEqIndex, xyz };
    if (firstEqIndex === index) seenFirstIndices.set(index, result);
    return result;
  });
  return { proper, circular, improper, truncated, count, tail, resultEqStart, tailEqStart, items: parsedItems };
}

function validateReturnedPath(returnRow, pathRow, expected, label) {
  const arity = matrixInteger(returnRow, 'arity', null, `${label} return`);
  assert(arity >= 0 && arity <= 64, `${label} return arity exceeds the bounded capture`);
  const rawValues = matrixValue(returnRow, 'values', `${label} return`);
  const parsedValues = rawValues === null ? [] : parseTypedValues(rawValues, `${label} typed return`);
  assert(parsedValues.length === arity, `${label} typed return arity differs from captured values`);
  const values = parseTypedValueRows(rawValues, `${label} typed return`);
  matrixOrdinal(pathRow, expected.ordinal, `${label} returned path`);
  assert(lispInteger(matrixValue(pathRow, 'local-call', label), `${label} path local-call`) === expected.localCall
    && lispSymbolName(matrixValue(pathRow, 'batch', label), `${label} path batch`) === expected.batch.toUpperCase(),
  `${label} returned-path identity differs from its source-bound case`);
  let path;
  if (arity === 0) {
    expectRecordFields(pathRow.fields, ['ordinal', 'local-call', 'batch', 'present', 'reason'], `${label} no-primary path`);
    matrixBoolean(pathRow, 'present', false, `${label} no-primary path`);
    matrixKeyword(pathRow, 'reason', 'NO-PRIMARY-VALUE', `${label} no-primary path`);
    path = { present: false, reason: 'no-primary-value', count: 0, items: [] };
  } else {
    expectRecordFields(pathRow.fields, ['ordinal', 'local-call', 'batch', 'summary'], `${label} returned path`);
    const rawPrimary = parsedValues[0].raw;
    const pathSummary = parsePointPathSummary(matrixValue(pathRow, 'summary', `${label} returned path`), `${label} path summary`);
    if (rawPrimary === null) {
      assert(pathSummary.proper && pathSummary.count === 0 && pathSummary.tail.marker === 'NONE',
        `${label} NIL primary return differs from its empty proper path summary`);
    } else if (Array.isArray(rawPrimary) && rawPrimary[0]?.kind === 'keyword' && rawPrimary[0].name === 'LIST') {
      const primaryList = parseBoundedSummary(rawPrimary, `${label} primary return list`);
      assert(!primaryList.truncated && primaryList.count === pathSummary.count
        && primaryList.proper === pathSummary.proper && primaryList.truncated === pathSummary.truncated
        && primaryList.list.length === pathSummary.items.length,
      `${label} typed primary list and complete point-path summary disagree`);
      for (const [index, item] of primaryList.list.entries()) {
        const detailed = pathSummary.items[index];
        if (item && typeof item === 'object' && Object.hasOwn(item, 'objectType')) {
          assert(String(item.objectType).split('::').at(-1) === String(detailed.pointType).split('::').at(-1),
            `${label} typed primary item ${index} type differs from the full path point type`);
        }
        if (detailed.pointIsTript) assert(item && typeof item === 'object' && item.objectType
          && String(item.objectType).split('::').at(-1) === 'TRIPT',
        `${label} TRIPT point ${index} lacks matching typed-return object evidence`);
      }
    } else {
      assert(pathSummary.improper && pathSummary.count === 0,
        `${label} non-list primary return does not match its improper path summary`);
      const primarySummary = parseBoundedSummary(rawPrimary, `${label} primary return summary`);
      assert(same(pathSummary.tail.summary, primarySummary)
        && String(pathSummary.tail.type).split('::').at(-1) === String(parsedValues[0].type).split('::').at(-1),
      `${label} improper path tail differs from the typed primary return`);
      if (pathSummary.resultEqStart || pathSummary.tailEqStart) assert(
        String(parsedValues[0].type).split('::').at(-1) === 'TRIPT',
      `${label} direct START identity is not a TRIPT return`);
    }
    path = { present: true, ...pathSummary };
  }
  return { arity, values, path };
}

function parseStateBinding(record, label) {
  const name = lispString(matrixValue(record, 'name', label), `${label} name`);
  expectRecordFields(record.fields, Object.hasOwn(record.fields, 'type')
    ? ['phase', 'name', 'present', 'status', 'bound', 'type', 'value']
    : ['phase', 'name', 'present', 'status', 'bound'], label);
  const phase = matrixKeyword(record, 'phase', null, label);
  matrixBoolean(record, 'present', true, label);
  const bound = lispBoolean(matrixValue(record, 'bound', label), `${label} bound`);
  const status = lispKeywordName(matrixValue(record, 'status', label), `${label} status`);
  let type = null; let rawValue = null; let summary = null;
  if (bound) {
    assert(Object.hasOwn(record.fields, 'type') && Object.hasOwn(record.fields, 'value'),
      `${label} bound state lacks type/value`);
    type = parseGenericType(matrixValue(record, 'type', label), `${label} type`);
    rawValue = matrixValue(record, 'value', label);
    summary = parseBoundedSummary(rawValue, `${label} summary`);
  } else assert(!Object.hasOwn(record.fields, 'type') && !Object.hasOwn(record.fields, 'value'),
    `${label} unbound state contains type/value`);
  return { name, phase, status, bound, type, rawValue, summary };
}

function parseStateBindingGroup(records, phase, label) {
  const rows = records.filter(row => row.tag === 'STATE-BINDING'
    && lispKeywordName(matrixValue(row, 'phase', label), `${label} phase`) === phase);
  assert(rows.length === 7, `${label} has ${rows.length} state bindings, expected seven`);
  const names = ['START', 'XINCS', 'YINCS', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*'];
  const parsed = rows.map((row, index) => {
    const binding = parseStateBinding(row, `${label} state ${index}`);
    assert(binding.phase === phase && binding.name === names[index], `${label} names/order differ at ${index}`);
    assert(binding.status === 'INTERNAL' && binding.bound === (binding.name !== 'START'),
      `${label} ${binding.name} is not in the required present/bound state`);
    return binding;
  });
  return Object.fromEntries(parsed.map(row => [row.name, row]));
}

function validateOuterStateGroup(group, baseline, label) {
  for (const name of ['START', 'XINCS', 'YINCS', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*']) {
    const current = group[name]; const original = baseline[name];
    assert(current.status === original.status && current.bound === original.bound
      && same(current.type, original.type) && same(current.rawValue, original.rawValue),
    `${label} changed outer ${name} binding/value`);
  }
}

function validateDynamicStateGroup(group, baseline, scratchValues, width, height, label) {
  for (const name of ['START', 'XINCS', 'YINCS', 'PATCH-MAP']) {
    const current = group[name]; const original = baseline[name];
    assert(current.status === original.status && current.bound === original.bound
      && same(current.type, original.type) && same(current.rawValue, original.rawValue),
    `${label} changed static ${name} binding/value`);
  }
  const scratch = parseMatrixArraySummary(group['FILL-MAP'].rawValue, `${label} temporary FILL-MAP`);
  assert(scratch.rank === 2 && same(scratch.dimensions, [width, height])
    && same(scratch.elementType, ['UNSIGNED-BYTE', 4]) && scratch.total === width * height
    && scratch.shown === width * height && !scratch.truncated
    && same(scratch.values.map((item, index) => {
      assert(item && typeof item === 'object' && Number.isSafeInteger(item.number),
        `${label} FILL-MAP cell ${index} is not a complete integer`);
      return item.number;
    }), scratchValues), `${label} temporary FILL-MAP differs from the full scratch cell snapshot`);
  const wide = group['*PIC-WIDE*']; const high = group['*PIC-HIGH*'];
  assert(wide.type === 'FIXNUM' && wide.summary?.number === width
    && high.type === 'FIXNUM' && high.summary?.number === height,
  `${label} temporary dimension bindings differ from the scratch map`);
  return { temporaryFillMapMatchesSnapshot: true, temporaryDimensions: { width, height },
    staticBindingsMatchPostMain: true };
}

function validateStateDeltaBlock(records, groups, label) {
  const rows = records.filter(row => row.tag === 'STATE-DELTA');
  assert(rows.length === groups * 7, `${label} has ${rows.length} state deltas, expected ${groups * 7}`);
  const names = ['START', 'XINCS', 'YINCS', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*'];
  for (let group = 0; group < groups; group += 1) {
    for (let index = 0; index < names.length; index += 1) {
      const row = rows[group * 7 + index];
      expectRecordFields(row.fields, ['name', 'present-same', 'symbol-eq', 'bound-before', 'bound-after',
        'value-eq', 'summary-equalp'], `${label} state delta ${group}:${index}`);
      assert(lispString(matrixValue(row, 'name', label), `${label} delta name`) === names[index],
        `${label} state delta order differs at ${group}:${index}`);
      matrixBoolean(row, 'present-same', true, label);
      matrixBoolean(row, 'symbol-eq', true, label);
      const globallyBound = names[index] !== 'START';
      for (const key of ['bound-before', 'bound-after', 'value-eq', 'summary-equalp']) {
        matrixBoolean(row, key, globallyBound, `${label} delta ${names[index]}`);
      }
    }
  }
  return { groups, bindingsPerGroup: 7, allOriginalBindingsAndValuesUnchanged: true };
}

function validateRequiredRuntimeState(group, mapMetadata, label) {
  const start = group.START;
  assert(start.status === 'INTERNAL' && !start.bound, `${label} global START should be present and unbound`);
  for (const name of ['XINCS', 'YINCS']) {
    const row = group[name];
    assert(row.status === 'INTERNAL' && row.bound && row.type === 'CONS'
      && row.summary?.proper === true && row.summary?.truncated === false && row.summary?.count === 8
      && row.summary.list?.length === 8
      && row.summary.list.every(item => Number.isSafeInteger(item?.number)),
    `${label} ${name} is not a complete eight-integer direction list`);
  }
  const expectedDirections = {
    XINCS: [1, 1, 0, -1, -1, -1, 0, 1],
    YINCS: [0, 1, 1, 1, 0, -1, -1, -1],
  };
  for (const name of ['XINCS', 'YINCS']) {
    assert(same(group[name].summary.list.map(item => item.number), expectedDirections[name]),
      `${label} ${name} direction vector differs from the complete runtime binding`);
  }
  const fill = parseMatrixArraySummary(group['FILL-MAP'].rawValue, `${label} original FILL-MAP`);
  const patch = parseMatrixArraySummary(group['PATCH-MAP'].rawValue, `${label} original PATCH-MAP`);
  for (const [name, row, bits] of [['FILL-MAP', fill, 4], ['PATCH-MAP', patch, 16]]) {
    const metadata = mapMetadata[name];
    assert(group[name].status === 'INTERNAL' && group[name].bound
      && same(row.arrayType, metadata.type) && row.rank === metadata.rank
      && same(row.dimensions, metadata.dimensions) && same(row.elementType, metadata.elementType)
      && row.total === metadata.total && row.total <= 1048576
      && (bits === 4 ? row.elementType[1] === 4 : row.elementType[1] === 16),
    `${label} ${name} full map metadata differs from original map preflight`);
    if (row.total > MAX_ARRAY_ITEMS) assert(row.shown === 0 && row.truncated,
      `${label} natural ${name} summary must be metadata-only when above the array item cap`);
    else assert(row.shown === row.total && !row.truncated, `${label} ${name} summary is incomplete`);
  }
  const dimensions = mapMetadata['FILL-MAP'].dimensions;
  assert(same(mapMetadata['PATCH-MAP'].dimensions, dimensions), `${label} original map dimensions differ`);
  for (const [name, expectedValue] of [['*PIC-WIDE*', dimensions[0]], ['*PIC-HIGH*', dimensions[1]]]) {
    assert(group[name].status === 'INTERNAL' && group[name].bound && group[name].type === 'FIXNUM'
      && group[name].summary?.number === expectedValue,
    `${label} ${name} does not match actual original-map dimensions`);
  }
  return { dimensions, fillCells: mapMetadata['FILL-MAP'].total, patchCells: mapMetadata['PATCH-MAP'].total };
}

function parseMapSnapshotStages(records, mapMetadata) {
  const rows = recordsByTag(records, 'MAP-SNAPSHOT-STAGE');
  assert(rows.length === 12, `Expected 12 original-map snapshot stages, found ${rows.length}`);
  const result = Object.create(null);
  let cursor = 0;
  for (const name of ['FILL-MAP', 'PATCH-MAP']) {
    const bits = name === 'FILL-MAP' ? 4 : 16;
    const metadata = mapMetadata[name];
    const stages = ['BEGIN', 'METADATA', 'FLATTEN-BEGIN', 'FLATTEN-AFTER', 'COPY-BEGIN', 'COPY-AFTER'];
    const observed = rows.slice(cursor, cursor + stages.length);
    assert(observed.length === stages.length, `${name} original-map copy stage sequence is incomplete`);
    for (let index = 0; index < stages.length; index += 1) {
      const row = observed[index];
      const fields = index === 0 ? ['map', 'stage', 'dimension-limit', 'total-size-limit']
        : index === 1 ? ['map', 'stage', 'metadata']
          : index === 2 ? ['map', 'stage']
            : index === 3 ? ['map', 'stage', 'type', 'rank', 'total']
              : index === 4 ? ['map', 'stage', 'length'] : ['map', 'stage', 'type', 'length'];
      expectRecordFields(row.fields, fields, `${name} map snapshot ${stages[index]}`);
      assert(lispString(matrixValue(row, 'map', name), `${name} map name`) === name
        && matrixKeyword(row, 'stage', stages[index], `${name} map stage`) === stages[index],
      `${name} original-map snapshot stage/name differs`);
      if (index === 0) {
        const dimensionLimit = matrixInteger(row, 'dimension-limit', null, `${name} map stage`);
        const totalLimit = matrixInteger(row, 'total-size-limit', null, `${name} map stage`);
        assert(dimensionLimit >= Math.max(...metadata.dimensions) && totalLimit >= metadata.total,
          `${name} map flatten limits are below full original dimensions/size`);
      } else if (index === 1) {
        const copied = parseMatrixMetadata(matrixValue(row, 'metadata', name), `${name} snapshot metadata`, bits);
        assert(same(copied, metadata), `${name} snapshot metadata differs from original-map preflight`);
      } else if (index === 3) {
        const type = parseGenericType(matrixValue(row, 'type', name), `${name} flattened type`);
        assert(type !== null && matrixInteger(row, 'rank', 1, `${name} flattened rank`) === 1
          && matrixInteger(row, 'total', metadata.total, `${name} flattened total`) === metadata.total,
        `${name} flattened map does not expose its full row-major length`);
      } else if (index === 4) matrixInteger(row, 'length', metadata.total, `${name} copy input`);
      else if (index === 5) {
        const type = parseGenericType(matrixValue(row, 'type', name), `${name} copied type`);
        assert(type !== null && matrixInteger(row, 'length', metadata.total, `${name} copied length`) === metadata.total,
          `${name} full copied array length differs from original map`);
      }
    }
    result[name] = { metadata, stages, fullCopyCompleted: true, fullCellEqualityCheckedAtEveryBoundary: true };
    cursor += stages.length;
  }
  assert(cursor === rows.length, 'Unexpected trailing original-map snapshot-stage records');
  return result;
}

function validateOriginalMapPreflight(records, baselineState) {
  const row = onlyRecord(records, 'ORIGINAL-MAP-PREFLIGHT');
  expectRecordFields(row.fields, ['ready', 'fill', 'patch', 'snapshots', 'cell-cap'], 'ORIGINAL-MAP-PREFLIGHT');
  matrixBoolean(row, 'ready', true, 'ORIGINAL-MAP-PREFLIGHT');
  assert(lispSymbolLeaf(matrixValue(row, 'snapshots', 'ORIGINAL-MAP-PREFLIGHT'), 'snapshot policy')
    === 'ONE-IMMUTABLE-BASELINE-PER-MAP', 'Original-map snapshot policy differs');
  matrixInteger(row, 'cell-cap', 1048576, 'ORIGINAL-MAP-PREFLIGHT');
  const mapMetadata = {
    'FILL-MAP': parseMatrixMetadata(matrixValue(row, 'fill', 'ORIGINAL-MAP-PREFLIGHT'), 'FILL-MAP metadata', 4),
    'PATCH-MAP': parseMatrixMetadata(matrixValue(row, 'patch', 'ORIGINAL-MAP-PREFLIGHT'), 'PATCH-MAP metadata', 16),
  };
  validateOriginalMapSummary(baselineState['FILL-MAP'].rawValue, mapMetadata['FILL-MAP'], 'post-MAIN FILL-MAP');
  validateOriginalMapSummary(baselineState['PATCH-MAP'].rawValue, mapMetadata['PATCH-MAP'], 'post-MAIN PATCH-MAP');
  assert(same(mapMetadata['FILL-MAP'].dimensions, mapMetadata['PATCH-MAP'].dimensions),
    'FILL-MAP and PATCH-MAP natural dimensions differ');
  validateRequiredRuntimeState(baselineState, mapMetadata, 'POST-MAIN baseline state');
  return { ready: true, mapMetadata, snapshots: parseMapSnapshotStages(records, mapMetadata),
    fullOriginalMapCopiesAndChecks: true };
}

function validateProbeStartup(records, batch) {
  const pins = batch.probe;
  assert(onlyRecord(records, 'BEGIN').raw === pins.beginMarker, `${batch.name} BEGIN framing differs`);
  assert(onlyRecord(records, 'SCOPE').raw === pins.scopeRecord, `${batch.name} SCOPE differs from frozen source`);
  assert(onlyRecord(records, 'LIMITS').raw === pins.limitsRecord, `${batch.name} LIMITS differs from frozen source`);
  assert(onlyRecord(records, 'END').raw === pins.endMarker, `${batch.name} END framing differs`);

  const helper = onlyRecord(records, 'HELPER');
  assert(helper.raw === 'HELPER name=EXCL:ARGLIST present=T fbound=T type=COMPILED-FUNCTION compiled=T',
    'EXCL:ARGLIST is not the exact required compiled helper');
  const tript = onlyRecord(records, 'TRIPT-TYPE');
  expectRecordFields(tript.fields, ['lookup-status', 'resolved', 'symbol-name', 'symbol-package'], 'TRIPT-TYPE');
  matrixBoolean(tript, 'resolved', true, 'TRIPT-TYPE');
  assert(lispString(matrixValue(tript, 'symbol-name', 'TRIPT-TYPE'), 'TRIPT type name') === 'TRIPT'
    && lispString(matrixValue(tript, 'symbol-package', 'TRIPT-TYPE'), 'TRIPT type package') === 'COMMON-GRAPHICS-USER',
  'Probe did not resolve COMMON-GRAPHICS-USER::TRIPT');
  lispKeywordName(matrixValue(tript, 'lookup-status', 'TRIPT-TYPE'), 'TRIPT lookup status');

  const expectedFunctions = ['ZERO-EDGE', 'MAKE-TRIPT', 'X', 'Y', 'Z', 'MAIN'];
  const functions = recordsByTag(records, 'FUNCTION');
  assert(functions.length === expectedFunctions.length, 'Inspected FUNCTION record count differs');
  for (let index = 0; index < expectedFunctions.length; index += 1) {
    const row = functions[index]; const name = expectedFunctions[index];
    expectRecordFields(row.fields, ['name', 'present', 'status', 'fbound', 'type', 'compiled'], `FUNCTION ${index}`);
    assert(lispString(matrixValue(row, 'name', 'FUNCTION'), 'FUNCTION name') === name,
      `FUNCTION order/name differs at ${index}`);
    matrixBoolean(row, 'present', true, `FUNCTION ${name}`);
    matrixBoolean(row, 'fbound', true, `FUNCTION ${name}`);
    lispKeywordName(matrixValue(row, 'status', name), `${name} symbol status`);
    parseGenericType(matrixValue(row, 'type', name), `${name} function type`);
    const compiled = lispBoolean(matrixValue(row, 'compiled', name), `${name} compiled`);
    if (['ZERO-EDGE', 'MAKE-TRIPT'].includes(name)) assert(compiled, `${name} is not compiled`);
  }

  const arglists = recordsByTag(records, 'ARGLIST');
  assert(arglists.length === expectedFunctions.length, 'ARGLIST record count differs');
  for (let index = 0; index < expectedFunctions.length; index += 1) {
    const row = arglists[index]; const name = expectedFunctions[index];
    expectRecordFields(row.fields, ['name', 'values'], `ARGLIST ${name}`);
    assert(lispString(matrixValue(row, 'name', 'ARGLIST'), 'ARGLIST name') === name,
      `ARGLIST order/name differs at ${index}`);
    const values = matrixValue(row, 'values', `ARGLIST ${name}`);
    assert(Array.isArray(values) && values.length >= 1 && values.length <= 4,
      `${name} ARGLIST multiple values are outside the bound`);
    values.forEach((value, itemIndex) => {
      if (value !== null && value !== true) parseGenericType(value, `${name} ARGLIST value ${itemIndex}`);
    });
    if (name === 'MAKE-TRIPT' || name === 'ZERO-EDGE') {
      assert(values.length === 2 && values[1] === true && Array.isArray(values[0]),
        `${name} ARGLIST is not a fixed positional contract`);
      const params = values[0].map((value, paramIndex) => lispSymbolLeaf(value, `${name} parameter ${paramIndex}`));
      const wanted = name === 'MAKE-TRIPT' ? ['X', 'Y', 'Z'] : ['START', 'PERIM'];
      assert(same(params, wanted) && values[0].every(value => value.kind === 'qualified-symbol'
        && value.package === 'COMMON-GRAPHICS-USER'), `${name} ARGLIST differs from its exact positional contract`);
    }
  }

  const bindings = recordsByTag(records, 'BINDING');
  const names = ['XINCS', 'YINCS', 'START', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*'];
  assert(bindings.length === names.length, 'Initial BINDING record count differs');
  const initialBindings = [];
  for (let index = 0; index < names.length; index += 1) {
    const row = bindings[index]; const name = names[index];
    assert(lispString(matrixValue(row, 'name', 'BINDING'), 'BINDING name') === name,
      `Initial BINDING order/name differs at ${index}`);
    expectRecordFields(row.fields, Object.hasOwn(row.fields, 'type')
      ? ['name', 'present', 'status', 'bound', 'type', 'value']
      : ['name', 'present', 'status', 'bound'], `BINDING ${name}`);
    matrixBoolean(row, 'present', true, `BINDING ${name}`);
    const status = matrixKeyword(row, 'status', 'INTERNAL', `BINDING ${name}`);
    const bound = lispBoolean(matrixValue(row, 'bound', name), `${name} bound`);
    assert(bound === (name === 'XINCS' || name === 'YINCS'), `${name} initial bound state differs`);
    let type = null; let value = null;
    if (bound) {
      type = parseGenericType(matrixValue(row, 'type', name), `${name} initial type`);
      value = parseBoundedSummary(matrixValue(row, 'value', name), `${name} initial summary`);
      const wanted = name === 'XINCS' ? [1, 1, 0, -1, -1, -1, 0, 1] : [0, 1, 1, 1, 0, -1, -1, -1];
      assert(type === 'CONS' && value?.proper === true && value?.truncated === false
        && value.count === 8 && value.list?.length === 8
        && same(value.list.map(item => item?.number), wanted),
      `${name} initial direction list is not the complete eight-integer binding`);
    } else assert(!Object.hasOwn(row.fields, 'type') && !Object.hasOwn(row.fields, 'value'),
      `${name} unbound initial state includes type/value`);
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
  expectRecordFields(ready.fields, ['batch', 'global-ordinal-start', 'global-ordinal-end', 'metadata-errors',
    'zero-edge-holdout-gate', 'planned-cases', 'main-wrapper-installed'], 'READY');
  assert(lispSymbolName(matrixValue(ready, 'batch', 'READY'), 'READY batch') === batch.name.toUpperCase()
    && matrixInteger(ready, 'global-ordinal-start', batch.firstOrdinal, 'READY') === batch.firstOrdinal
    && matrixInteger(ready, 'global-ordinal-end', batch.lastOrdinal, 'READY') === batch.lastOrdinal,
  'READY batch/global ordinal interval differs from the source-bound batch');
  matrixInteger(ready, 'metadata-errors', 0, 'READY');
  matrixBoolean(ready, 'zero-edge-holdout-gate', true, 'READY');
  matrixInteger(ready, 'planned-cases', batch.plannedCases, 'READY');
  matrixBoolean(ready, 'main-wrapper-installed', true, 'READY');
  return { functions: expectedFunctions, initialBindings, metadataGate: true, mainWrapperInstalled: true, ready: true };
}

function validatePostMainGate(records, plannedCases) {
  const row = onlyRecord(records, 'POST-MAIN-GATE');
  expectRecordFields(row.fields, ['metadata-ready', 'runtime-ready', 'rng-preview-valid', 'rng-baseline-ready',
    'rng-preview', 'rng-baseline', 'planned-cases'], 'POST-MAIN-GATE');
  for (const key of ['metadata-ready', 'runtime-ready', 'rng-preview-valid', 'rng-baseline-ready']) {
    matrixBoolean(row, key, true, 'POST-MAIN-GATE');
  }
  const preview = parsePreview(matrixValue(row, 'rng-preview', 'POST-MAIN-GATE'), 'POST-MAIN-GATE preview');
  const baseline = parsePreview(matrixValue(row, 'rng-baseline', 'POST-MAIN-GATE'), 'POST-MAIN-GATE baseline');
  assert(same(preview, baseline), 'POST-MAIN-GATE preview and baseline differ');
  matrixInteger(row, 'planned-cases', plannedCases, 'POST-MAIN-GATE');
  return preview;
}

function validateBoundary(row, phase, postMainPreview, label) {
  expectRecordFields(row.fields, ['phase', 'ready', 'states-recorded', 'bindings-same',
    'fill-map-identity-and-full-cells-same', 'patch-map-identity-and-full-cells-same',
    'rng-valid', 'rng-baseline-stable', 'rng-preview'], label);
  matrixKeyword(row, 'phase', phase, label);
  for (const key of ['ready', 'states-recorded', 'bindings-same', 'fill-map-identity-and-full-cells-same',
    'patch-map-identity-and-full-cells-same', 'rng-valid', 'rng-baseline-stable']) matrixBoolean(row, key, true, label);
  const preview = parsePreview(matrixValue(row, 'rng-preview', label), `${label} preview`);
  assert(same(preview, postMainPreview), `${label} RNG preview differs from POST-MAIN baseline`);
  return { phase, ready: true, originalBindingsSame: true, fillMapIdentityAndFullCellsSame: true,
    patchMapIdentityAndFullCellsSame: true, rngPreview: preview };
}

function validateRngCheck(row, expectedPhase, baseline, label) {
  expectRecordFields(row.fields, ['phase', 'valid', 'stable', 'preview-before', 'preview-after'], label);
  matrixKeyword(row, 'phase', expectedPhase, label);
  matrixBoolean(row, 'valid', true, label);
  matrixBoolean(row, 'stable', true, label);
  const before = parsePreview(matrixValue(row, 'preview-before', label), `${label} before`);
  const after = parsePreview(matrixValue(row, 'preview-after', label), `${label} after`);
  assert(same(before, baseline) && same(after, baseline), `${label} RNG previews differ from POST-MAIN baseline`);
  return { phase: expectedPhase, valid: true, stable: true, previewBefore: before, previewAfter: after };
}

function validateCaseIdentity(row, expected, label, dimensionsOnly = false) {
  matrixOrdinal(row, expected.ordinal, label);
  assert(lispInteger(matrixValue(row, 'local-call', label), `${label} local call`) === expected.localCall,
    `${label} local-call differs from input spec`);
  assert(lispSymbolName(matrixValue(row, 'batch', label), `${label} batch`) === expected.batch.toUpperCase(),
    `${label} batch differs from input spec`);
  matrixInteger(row, 'width', expected.width, label);
  matrixInteger(row, 'height', expected.height, label);
  if (dimensionsOnly) return;
  for (const [key, value] of [['width', expected.width], ['height', expected.height],
    ['x', expected.start[0]], ['y', expected.start[1]], ['direction', expected.start[2]],
    ['perim', expected.perim]]) {
    matrixInteger(row, key, value, label);
  }
  matrixKeyword(row, 'shape', expected.shape.toUpperCase(), label);
}

function validateCaseHeader(row, expected) {
  const label = `holdout case ${expected.ordinal} header`;
  expectRecordFields(row.fields, ['ordinal', 'local-call', 'batch', 'width', 'height', 'x', 'y', 'direction',
    'perim', 'shape', 'scratch-element-type'], label);
  validateCaseIdentity(row, expected, label);
  assert(same(parseGenericType(matrixValue(row, 'scratch-element-type', label), `${label} scratch type`),
    ['UNSIGNED-BYTE', 4]), `${label} scratch element type is not UBYTE4`);
  return { ordinal: expected.ordinal, localCall: expected.localCall, batch: expected.batch,
    width: expected.width, height: expected.height, start: [...expected.start], perim: expected.perim,
    shape: expected.shape, scratchBeforeXMajorYMinor: [...expected.scratchBeforeXMajorYMinor] };
}

function repeatTag(tag, count) { return Array.from({ length: count }, () => tag); }

function expectedCaseTagOrder() {
  return [
    'CASE-BEGIN',
    ...repeatTag('STATE-BINDING', 7), ...repeatTag('STATE-DELTA', 7), 'MATRIX-BOUNDARY',
    'CASE-PREFLIGHT',
    ...repeatTag('STATE-BINDING', 7), ...repeatTag('STATE-DELTA', 7), 'MATRIX-BOUNDARY', 'RNG-CHECK',
    'CONSTRUCTOR-RETURN', 'CONSTRUCTOR-POINT', 'CONSTRUCTOR-GATE', 'SCRATCH-IDENTITY',
    'DYNAMIC-SYMBOL-GATE', ...repeatTag('STATE-BINDING', 7), 'CALL-GATE', 'DYNAMIC-PREFLIGHT',
    'CASE-RETURN', 'RETURNED-TRIPT-PATH', ...repeatTag('STATE-BINDING', 7), 'RNG-CHECK',
    'START-DIRECT-XYZ', 'SCRATCH-MAP', 'CASE-RNG', 'DYNAMIC-OBSERVATION',
    ...repeatTag('STATE-BINDING', 7), ...repeatTag('STATE-DELTA', 7), 'MATRIX-BOUNDARY',
    'CASE-OBSERVATIONS-READY', 'CASE-END',
  ];
}

function validateHoldoutCase(records, expected, baselineState, postMainPreview) {
  const label = `holdout case ${expected.ordinal}`;
  const startIndex = records.findIndex(row => row.tag === 'CASE-BEGIN'
    && lispInteger(matrixValue(row, 'ordinal', label), label) === expected.ordinal);
  const endIndex = records.findIndex((row, index) => index > startIndex && row.tag === 'CASE-END'
    && lispInteger(matrixValue(row, 'ordinal', label), label) === expected.ordinal);
  assert(startIndex >= 0 && endIndex > startIndex, `${label} lacks an ordered complete CASE-BEGIN/CASE-END segment`);
  const segment = records.slice(startIndex, endIndex + 1);
  const header = validateCaseHeader(segment[0], expected);
  assert(same(segment.map(row => row.tag), expectedCaseTagOrder()),
    `${label} complete record sequence differs from the frozen source schema`);
  const statePhases = segment.filter(row => row.tag === 'STATE-BINDING')
    .map(row => matrixKeyword(row, 'phase', null, `${label} state binding`));
  const wantedStatePhases = [
    ...repeatTag('BEFORE-CONSTRUCTOR', 7), ...repeatTag('AFTER-CONSTRUCTOR', 7),
    ...repeatTag('INSIDE-PROGV-BEFORE', 7), ...repeatTag('INSIDE-PROGV-AFTER', 7),
    ...repeatTag('AFTER-TARGET', 7),
  ];
  assert(same(statePhases, wantedStatePhases), `${label} state-binding phase order differs from the frozen source`);
  const one = tag => {
    const rows = segment.filter(row => row.tag === tag);
    assert(rows.length === 1, `${label} expected one ${tag}, found ${rows.length}`);
    return rows[0];
  };

  const boundaries = segment.filter(row => row.tag === 'MATRIX-BOUNDARY');
  const boundaryPhases = ['BEFORE-CONSTRUCTOR', 'AFTER-CONSTRUCTOR', 'AFTER-TARGET'];
  const parsedBoundaries = boundaries.map((row, index) => validateBoundary(row, boundaryPhases[index], postMainPreview,
    `${label} boundary ${boundaryPhases[index]}`));

  const preflight = one('CASE-PREFLIGHT');
  expectRecordFields(preflight.fields, ['ordinal', 'baseline-boundary-ready'], `${label} preflight`);
  matrixOrdinal(preflight, expected.ordinal, `${label} preflight`);
  matrixBoolean(preflight, 'baseline-boundary-ready', true, `${label} preflight`);

  const phases = ['BEFORE-CONSTRUCTOR', 'AFTER-CONSTRUCTOR', 'INSIDE-PROGV-BEFORE',
    'INSIDE-PROGV-AFTER', 'AFTER-TARGET'];
  const stateGroups = Object.fromEntries(phases.map(phase => [phase,
    parseStateBindingGroup(segment, phase, `${label} ${phase}`)]));
  for (const phase of ['BEFORE-CONSTRUCTOR', 'AFTER-CONSTRUCTOR', 'AFTER-TARGET']) {
    validateOuterStateGroup(stateGroups[phase], baselineState, `${label} ${phase}`);
  }

  const constructorRng = validateRngCheck(segment.filter(row => row.tag === 'RNG-CHECK')[0],
    'CONSTRUCTOR', postMainPreview, `${label} constructor RNG`);
  const targetRngCheck = validateRngCheck(segment.filter(row => row.tag === 'RNG-CHECK')[1],
    'ZERO-EDGE', postMainPreview, `${label} target RNG`);
  assert(segment.filter(row => row.tag === 'RNG-CHECK').length === 2, `${label} lacks both required RNG checks`);

  const constructorReturn = one('CONSTRUCTOR-RETURN');
  expectRecordFields(constructorReturn.fields, ['ordinal', 'arity', 'values'], `${label} constructor return`);
  matrixOrdinal(constructorReturn, expected.ordinal, `${label} constructor return`);
  matrixInteger(constructorReturn, 'arity', 1, `${label} constructor return`);
  const constructorValues = parseTypedValueRows(matrixValue(constructorReturn, 'values', label),
    `${label} constructor values`);
  assert(constructorValues.length === 1 && String(constructorValues[0].type).split('::').at(-1) === 'TRIPT'
    && String(constructorValues[0].summary?.objectType).split('::').at(-1) === 'TRIPT',
  `${label} constructor did not return one fully summarized TRIPT`);

  const constructorPoint = one('CONSTRUCTOR-POINT');
  expectRecordFields(constructorPoint.fields, ['ordinal', 'type', 'type-is-tript', 'direct-xyz', 'expected-xyz',
    'slots-match', 'identity-unique', 'first-ordinal'], `${label} constructor point`);
  matrixOrdinal(constructorPoint, expected.ordinal, `${label} constructor point`);
  const constructorType = parseGenericType(matrixValue(constructorPoint, 'type', label), `${label} constructor type`);
  assert(String(constructorType).split('::').at(-1) === 'TRIPT', `${label} constructed point type is not TRIPT`);
  matrixBoolean(constructorPoint, 'type-is-tript', true, `${label} constructor point`);
  const directXyz = parseTypedFixnums(matrixValue(constructorPoint, 'direct-xyz', label), 3,
    `${label} constructor XYZ`, expected.start);
  const expectedXyz = matrixIntegerList(matrixValue(constructorPoint, 'expected-xyz', label), 3,
    `${label} expected constructor XYZ`);
  assert(same(directXyz, expected.start) && same(expectedXyz, expected.start),
    `${label} constructor coordinates differ from source input`);
  matrixBoolean(constructorPoint, 'slots-match', true, `${label} constructor point`);
  matrixBoolean(constructorPoint, 'identity-unique', true, `${label} constructor point`);
  assert(matrixValue(constructorPoint, 'first-ordinal', label) === null,
    `${label} constructor reused an earlier TRIPT instance`);

  const constructorGate = one('CONSTRUCTOR-GATE');
  expectRecordFields(constructorGate.fields, ['ordinal', 'ready', 'type-is-tript', 'slots-match',
    'identity-unique', 'rng-preview-valid', 'rng-preview-stable', 'baseline-state-and-maps-same'],
  `${label} constructor gate`);
  matrixOrdinal(constructorGate, expected.ordinal, `${label} constructor gate`);
  for (const key of ['ready', 'type-is-tript', 'slots-match', 'identity-unique', 'rng-preview-valid',
    'rng-preview-stable', 'baseline-state-and-maps-same']) matrixBoolean(constructorGate, key, true, `${label} constructor gate`);

  const scratchIdentity = one('SCRATCH-IDENTITY');
  expectRecordFields(scratchIdentity.fields, ['ordinal', 'local-call', 'batch', 'unique', 'checked', 'first-ordinal'],
    `${label} scratch identity`);
  assert(lispInteger(matrixValue(scratchIdentity, 'ordinal', label), `${label} scratch identity ordinal`) === expected.ordinal
    && lispInteger(matrixValue(scratchIdentity, 'local-call', label), `${label} scratch identity local-call`) === expected.localCall
    && lispSymbolName(matrixValue(scratchIdentity, 'batch', label), `${label} scratch identity batch`) === expected.batch.toUpperCase(),
  `${label} scratch identity case coordinates differ`);
  matrixBoolean(scratchIdentity, 'unique', true, `${label} scratch identity`);
  matrixBoolean(scratchIdentity, 'checked', true, `${label} scratch identity`);
  assert(matrixValue(scratchIdentity, 'first-ordinal', label) === null, `${label} scratch map was reused`);

  const dynamicSymbols = one('DYNAMIC-SYMBOL-GATE');
  expectRecordFields(dynamicSymbols.fields, ['ordinal', 'ready', 'fill-symbol-eq-post-main',
    'pic-wide-symbol-eq-post-main', 'pic-high-symbol-eq-post-main'], `${label} dynamic symbol gate`);
  matrixOrdinal(dynamicSymbols, expected.ordinal, `${label} dynamic symbols`);
  for (const key of ['ready', 'fill-symbol-eq-post-main', 'pic-wide-symbol-eq-post-main', 'pic-high-symbol-eq-post-main']) {
    matrixBoolean(dynamicSymbols, key, true, `${label} dynamic symbols`);
  }

  const callGate = one('CALL-GATE');
  expectRecordFields(callGate.fields, ['ordinal', 'local-call', 'batch', 'width', 'height', 'ready',
    'metadata-ready', 'runtime-ready', 'constructor-ready', 'dynamic-state-ready', 'scratch-identity-checked',
    'scratch-identity-unique', 'exact-scratch-shape', 'pre-call-rng-valid', 'pre-call-rng-baseline-stable',
    'call-cap-available'], `${label} call gate`);
  validateCaseIdentity(callGate, expected, `${label} call gate`, true);
  for (const key of ['ready', 'metadata-ready', 'runtime-ready', 'constructor-ready', 'dynamic-state-ready',
    'scratch-identity-checked', 'scratch-identity-unique', 'exact-scratch-shape', 'pre-call-rng-valid',
    'pre-call-rng-baseline-stable', 'call-cap-available']) matrixBoolean(callGate, key, true, `${label} call gate`);

  const dynamicPreflight = one('DYNAMIC-PREFLIGHT');
  expectRecordFields(dynamicPreflight.fields, ['ordinal', 'local-call', 'batch', 'width', 'height',
    'temporary-bindings-recorded', 'fill-map-eq-scratch', 'pic-wide', 'pic-high', 'scratch-before'],
  `${label} dynamic preflight`);
  validateCaseIdentity(dynamicPreflight, expected, `${label} dynamic preflight`, true);
  matrixBoolean(dynamicPreflight, 'temporary-bindings-recorded', true, `${label} dynamic preflight`);
  matrixBoolean(dynamicPreflight, 'fill-map-eq-scratch', true, `${label} dynamic preflight`);
  matrixInteger(dynamicPreflight, 'pic-wide', expected.width, `${label} dynamic preflight`);
  matrixInteger(dynamicPreflight, 'pic-high', expected.height, `${label} dynamic preflight`);
  const dynamicScratchBefore = parseScratchCells(matrixValue(dynamicPreflight, 'scratch-before', label),
    expected.width, expected.height, `${label} dynamic scratch before`, expected.scratchBeforeXMajorYMinor);

  const returnRow = one('CASE-RETURN');
  expectRecordFields(returnRow.fields, ['ordinal', 'local-call', 'batch', 'width', 'height', 'x', 'y', 'direction',
    'perim', 'shape', 'arity', 'values'], `${label} return`);
  validateCaseIdentity(returnRow, expected, `${label} return`);
  const returnPath = validateReturnedPath(returnRow, one('RETURNED-TRIPT-PATH'), expected, label);

  const startRow = one('START-DIRECT-XYZ');
  expectRecordFields(startRow.fields, ['ordinal', 'local-call', 'batch', 'width', 'height', 'x', 'y', 'direction',
    'perim', 'shape', 'before', 'after', 'unchanged', 'expected-before'], `${label} START slots`);
  validateCaseIdentity(startRow, expected, `${label} START slots`);
  const startBefore = parseTypedFixnums(matrixValue(startRow, 'before', label), 3, `${label} START before`, expected.start);
  const startAfter = parseTypedFixnums(matrixValue(startRow, 'after', label), 3, `${label} START after`);
  const startUnchanged = matrixBoolean(startRow, 'unchanged', same(startBefore, startAfter), `${label} START slots`);
  assert(same(matrixIntegerList(matrixValue(startRow, 'expected-before', label), 3,
    `${label} expected START before`), expected.start), `${label} expected START slots differ from input`);
  returnPath.path.items?.forEach((point, index) => {
    if (point.pointEqStart) assert(point.pointIsTript && Array.isArray(point.xyz)
      && same(point.xyz, startAfter), `${label} returned point ${index} EQ START has incomplete/stale coordinates`);
  });

  const scratchRow = one('SCRATCH-MAP');
  expectRecordFields(scratchRow.fields, ['ordinal', 'local-call', 'batch', 'width', 'height', 'x', 'y', 'direction',
    'perim', 'shape', 'dimensions', 'element-type', 'exact-shape-before', 'metadata-valid-after',
    'cells-before', 'cells-after', 'changed-cells'], `${label} scratch map`);
  validateCaseIdentity(scratchRow, expected, `${label} scratch map`);
  assert(same(matrixIntegerList(matrixValue(scratchRow, 'dimensions', label), 2, `${label} scratch dimensions`),
    [expected.width, expected.height]), `${label} scratch dimensions differ from source input`);
  assert(same(parseGenericType(matrixValue(scratchRow, 'element-type', label), `${label} scratch element type`),
    ['UNSIGNED-BYTE', 4]), `${label} scratch element type is not UBYTE4`);
  matrixBoolean(scratchRow, 'exact-shape-before', true, `${label} scratch map`);
  matrixBoolean(scratchRow, 'metadata-valid-after', true, `${label} scratch map`);
  const scratchBefore = parseScratchCells(matrixValue(scratchRow, 'cells-before', label),
    expected.width, expected.height, `${label} cells before`, expected.scratchBeforeXMajorYMinor);
  const scratchAfter = parseScratchCells(matrixValue(scratchRow, 'cells-after', label),
    expected.width, expected.height, `${label} cells after`);
  const changedCells = parseChangedCells(matrixValue(scratchRow, 'changed-cells', label), scratchBefore,
    scratchAfter, `${label} changed cells`);
  assert(same(dynamicScratchBefore, scratchBefore), `${label} dynamic preflight differs from scratch before map`);
  const scratchValuesAfter = scratchAfter.map(([, , value]) => value);
  const dynamicBefore = validateDynamicStateGroup(stateGroups['INSIDE-PROGV-BEFORE'], baselineState,
    expected.scratchBeforeXMajorYMinor, expected.width, expected.height, `${label} dynamic preflight state`);
  const dynamicAfter = validateDynamicStateGroup(stateGroups['INSIDE-PROGV-AFTER'], baselineState,
    scratchValuesAfter, expected.width, expected.height, `${label} dynamic after-target state`);

  const caseRng = one('CASE-RNG');
  expectRecordFields(caseRng.fields, ['ordinal', 'before-valid', 'after-valid', 'stable', 'baseline-stable',
    'preview-before', 'preview-after'], `${label} target RNG`);
  matrixOrdinal(caseRng, expected.ordinal, `${label} target RNG`);
  for (const key of ['before-valid', 'after-valid', 'stable', 'baseline-stable']) matrixBoolean(caseRng, key, true, `${label} target RNG`);
  const targetPreviewBefore = parsePreview(matrixValue(caseRng, 'preview-before', label), `${label} RNG before`);
  const targetPreviewAfter = parsePreview(matrixValue(caseRng, 'preview-after', label), `${label} RNG after`);
  assert(same(targetPreviewBefore, postMainPreview) && same(targetPreviewAfter, postMainPreview),
    `${label} target RNG previews differ from POST-MAIN baseline`);

  const dynamicObservation = one('DYNAMIC-OBSERVATION');
  expectRecordFields(dynamicObservation.fields, ['ordinal', 'before-recorded', 'after-recorded', 'before-ready', 'after-ready'],
    `${label} dynamic observation`);
  matrixOrdinal(dynamicObservation, expected.ordinal, `${label} dynamic observation`);
  for (const key of ['before-recorded', 'after-recorded', 'before-ready', 'after-ready']) {
    matrixBoolean(dynamicObservation, key, true, `${label} dynamic observation`);
  }
  const observations = one('CASE-OBSERVATIONS-READY');
  expectRecordFields(observations.fields, ['ordinal', 'ready', 'return-or-condition', 'starts-recorded',
    'scratch-recorded', 'dynamic-state-recorded', 'original-state-and-maps-same', 'rng-valid', 'rng-stable',
    'rng-baseline-stable', 'overflow'], `${label} observations`);
  matrixOrdinal(observations, expected.ordinal, `${label} observations`);
  for (const key of ['ready', 'return-or-condition', 'starts-recorded', 'scratch-recorded', 'dynamic-state-recorded',
    'original-state-and-maps-same', 'rng-valid', 'rng-stable', 'rng-baseline-stable']) {
    matrixBoolean(observations, key, true, `${label} observations`);
  }
  matrixBoolean(observations, 'overflow', false, `${label} observations`);

  const deltas = validateStateDeltaBlock(segment, 3, label);
  const caseEnd = one('CASE-END');
  expectRecordFields(caseEnd.fields, ['ordinal', 'local-call', 'batch', 'width', 'height', 'x', 'y', 'direction',
    'perim', 'shape', 'attempted', 'returned', 'completed', 'calls', 'active', 'overflow',
    'observer-errors', 'target-condition'], `${label} CASE-END`);
  validateCaseIdentity(caseEnd, expected, `${label} CASE-END`);
  matrixBoolean(caseEnd, 'attempted', true, `${label} CASE-END`);
  matrixBoolean(caseEnd, 'returned', true, `${label} CASE-END`);
  matrixBoolean(caseEnd, 'completed', true, `${label} CASE-END`);
  matrixInteger(caseEnd, 'calls', expected.localCall, `${label} cumulative local calls`);
  matrixBoolean(caseEnd, 'active', false, `${label} CASE-END`);
  matrixBoolean(caseEnd, 'overflow', false, `${label} CASE-END`);
  matrixInteger(caseEnd, 'observer-errors', 0, `${label} CASE-END`);
  assert(matrixValue(caseEnd, 'target-condition', label) === null, `${label} reports a target condition`);

  return { ...header,
    constructor: { arity: 1, type: constructorValues[0].type, summary: constructorValues[0].summary,
      xyz: directXyz, uniqueInstance: true, firstOrdinal: null, gateReady: true, rng: constructorRng },
    target: { callGateReady: true, return: returnPath, startBefore, startAfter, startUnchanged,
      scratchBefore, scratchAfter, changedCells,
      rng: { before: targetPreviewBefore, after: targetPreviewAfter, valid: true, stable: true, baselineStable: true },
      dynamicStateBefore: dynamicBefore, dynamicStateAfter: dynamicAfter,
      stateDeltas: deltas, boundaries: parsedBoundaries, originalStateAndMapsSame: true,
      completed: true, calls: expected.localCall },
  };
}

function validateHoldoutTagCounts(records, batch) {
  const n = batch.plannedCases;
  const expected = {
    BEGIN: 1, SCOPE: 1, LIMITS: 1, HELPER: 1, 'TRIPT-TYPE': 1,
    FUNCTION: 6, ARGLIST: 6, BINDING: 7, GATE: 1, 'MAIN-GATE': 1,
    INSTALL: 1, READY: 1, 'MAIN-FINISH': 1, 'POST-MAIN-GATE': 1,
    'MAP-SNAPSHOT-STAGE': 12, 'ORIGINAL-MAP-PREFLIGHT': 1,
    'CASE-BEGIN': n, 'CASE-PREFLIGHT': n, 'CONSTRUCTOR-RETURN': n, 'CONSTRUCTOR-POINT': n,
    'CONSTRUCTOR-GATE': n, 'SCRATCH-IDENTITY': n, 'DYNAMIC-SYMBOL-GATE': n,
    'CALL-GATE': n, 'DYNAMIC-PREFLIGHT': n, 'CASE-RETURN': n, 'RETURNED-TRIPT-PATH': n,
    'START-DIRECT-XYZ': n, 'SCRATCH-MAP': n, 'CASE-RNG': n, 'DYNAMIC-OBSERVATION': n,
    'CASE-OBSERVATIONS-READY': n, 'CASE-END': n, 'MATRIX-BOUNDARY': 3 * n + 1,
    'STATE-BINDING': 7 * (5 * n + 2), 'STATE-DELTA': 7 * (3 * n + 1), 'RNG-CHECK': 2 * n,
    'MATRIX-FINAL-BOUNDARY': 1, 'MATRIX-ACCOUNTING': 1, COMPLETE: 1, END: 1,
  };
  const actual = recordTagCounts(records);
  assert(Object.keys(actual).length === Object.keys(expected).length
    && Object.entries(expected).every(([tag, count]) => actual[tag] === count),
  `${batch.name} report tag counts differ from the exact completed case schema: ${JSON.stringify(actual)}`);
  return actual;
}

function validateHoldoutRecordOrder(records, batch) {
  const expected = [
    'BEGIN', 'SCOPE', 'LIMITS', 'HELPER', 'TRIPT-TYPE',
    ...Array.from({ length: 6 }, () => ['FUNCTION', 'ARGLIST']).flat(), ...repeatTag('BINDING', 7),
    'GATE', 'MAIN-GATE', 'INSTALL', 'READY', 'MAIN-FINISH',
    ...repeatTag('STATE-BINDING', 7), 'POST-MAIN-GATE',
    ...repeatTag('MAP-SNAPSHOT-STAGE', 12), 'ORIGINAL-MAP-PREFLIGHT',
  ];
  for (const input of batch.cases) expected.push(...expectedCaseTagOrder());
  expected.push(...repeatTag('STATE-BINDING', 7), ...repeatTag('STATE-DELTA', 7), 'MATRIX-BOUNDARY',
    'MATRIX-FINAL-BOUNDARY', 'MATRIX-ACCOUNTING', 'COMPLETE', 'END');
  assert(same(records.map(row => row.tag), expected),
    `${batch.name} report tags are missing, duplicated, or out of frozen source order`);
}

function validateHoldoutFooter(records, batch, postMainPreview, baselineState) {
  const endIndex = records.findIndex(row => row.tag === 'CASE-END'
    && lispInteger(matrixValue(row, 'ordinal', 'final case')) === batch.lastOrdinal);
  assert(endIndex >= 0, `${batch.name} final CASE-END is missing`);
  const footerRecords = records.slice(endIndex + 1);
  const finalState = parseStateBindingGroup(records, 'FINAL', `${batch.name} final state`);
  validateOuterStateGroup(finalState, baselineState, `${batch.name} final state`);
  const finalBoundaryRecord = onlyRecord(footerRecords, 'MATRIX-BOUNDARY');
  const finalBoundaryObservation = validateBoundary(finalBoundaryRecord, 'FINAL', postMainPreview,
    `${batch.name} final matrix boundary`);
  const finalBoundary = onlyRecord(footerRecords, 'MATRIX-FINAL-BOUNDARY');
  expectRecordFields(finalBoundary.fields, ['batch', 'global-ordinal-start', 'global-ordinal-end', 'ready', 'rng-preview'],
    `${batch.name} final boundary`);
  assert(lispSymbolName(matrixValue(finalBoundary, 'batch', 'final boundary'), 'final boundary batch') === batch.name.toUpperCase()
    && matrixInteger(finalBoundary, 'global-ordinal-start', batch.firstOrdinal, 'final boundary') === batch.firstOrdinal
    && matrixInteger(finalBoundary, 'global-ordinal-end', batch.lastOrdinal, 'final boundary') === batch.lastOrdinal,
  `${batch.name} final boundary ordinal interval differs`);
  matrixBoolean(finalBoundary, 'ready', true, `${batch.name} final boundary`);
  const finalPreview = parsePreview(matrixValue(finalBoundary, 'rng-preview', `${batch.name} final boundary`),
    `${batch.name} final RNG preview`);
  assert(same(finalPreview, postMainPreview), `${batch.name} final RNG preview differs from POST-MAIN baseline`);

  const accounting = onlyRecord(footerRecords, 'MATRIX-ACCOUNTING');
  expectRecordFields(accounting.fields, ['batch', 'global-ordinal-start', 'global-ordinal-end', 'planned',
    'attempted', 'completed', 'calls', 'ready', 'aborted', 'final-boundary', 'active', 'overflow', 'errors', 'complete'],
  `${batch.name} accounting`);
  assert(lispSymbolName(matrixValue(accounting, 'batch', 'accounting'), 'accounting batch') === batch.name.toUpperCase()
    && matrixInteger(accounting, 'global-ordinal-start', batch.firstOrdinal, 'accounting') === batch.firstOrdinal
    && matrixInteger(accounting, 'global-ordinal-end', batch.lastOrdinal, 'accounting') === batch.lastOrdinal,
  `${batch.name} accounting ordinal interval differs`);
  for (const key of ['planned', 'attempted', 'completed', 'calls']) {
    matrixInteger(accounting, key, batch.plannedCases, `${batch.name} accounting`);
  }
  for (const key of ['ready', 'final-boundary', 'complete']) matrixBoolean(accounting, key, true, `${batch.name} accounting`);
  for (const key of ['aborted', 'active', 'overflow']) matrixBoolean(accounting, key, false, `${batch.name} accounting`);
  matrixInteger(accounting, 'errors', 0, `${batch.name} accounting`);

  const complete = onlyRecord(footerRecords, 'COMPLETE');
  expectRecordFields(complete.fields, ['batch', 'global-ordinal-start', 'global-ordinal-end', 'main-status',
    'main-wrapper-installed', 'planned', 'attempted', 'completed', 'zero-edge-calls', 'active', 'overflow',
    'errors', 'complete', 'aborted', 'ready'], `${batch.name} COMPLETE`);
  assert(lispSymbolName(matrixValue(complete, 'batch', 'COMPLETE'), 'COMPLETE batch') === batch.name.toUpperCase()
    && matrixInteger(complete, 'global-ordinal-start', batch.firstOrdinal, 'COMPLETE') === batch.firstOrdinal
    && matrixInteger(complete, 'global-ordinal-end', batch.lastOrdinal, 'COMPLETE') === batch.lastOrdinal,
  `${batch.name} COMPLETE ordinal interval differs`);
  matrixKeyword(complete, 'main-status', 'NORMAL', `${batch.name} COMPLETE`);
  matrixBoolean(complete, 'main-wrapper-installed', true, `${batch.name} COMPLETE`);
  for (const key of ['planned', 'attempted', 'completed', 'zero-edge-calls']) {
    matrixInteger(complete, key, batch.plannedCases, `${batch.name} COMPLETE`);
  }
  for (const key of ['complete', 'ready']) matrixBoolean(complete, key, true, `${batch.name} COMPLETE`);
  for (const key of ['active', 'overflow', 'aborted']) matrixBoolean(complete, key, false, `${batch.name} COMPLETE`);
  matrixInteger(complete, 'errors', 0, `${batch.name} COMPLETE`);

  validateStateDeltaBlock(footerRecords, 1, `${batch.name} final state delta`);
  assert(footerRecords.findIndex(row => row.tag === 'MATRIX-FINAL-BOUNDARY')
    < footerRecords.findIndex(row => row.tag === 'MATRIX-ACCOUNTING')
    && footerRecords.findIndex(row => row.tag === 'MATRIX-ACCOUNTING')
    < footerRecords.findIndex(row => row.tag === 'COMPLETE')
    && footerRecords.findIndex(row => row.tag === 'COMPLETE') < footerRecords.findIndex(row => row.tag === 'END'),
  `${batch.name} final records are out of order`);
  return { batch: batch.name, globalOrdinalStart: batch.firstOrdinal, globalOrdinalEnd: batch.lastOrdinal,
    mainStatus: 'normal', wrapperInstalled: true, planned: batch.plannedCases,
    attempted: batch.plannedCases, completed: batch.plannedCases, calls: batch.plannedCases,
    errors: 0, overflow: false, active: false, complete: true, finalBoundaryReady: true,
    outerBindingsRestored: true, finalStateBoundary: finalBoundaryObservation, rngPreview: finalPreview };
}

function validateHoldoutReport(source, batch, baselineState) {
  assert(typeof source === 'string' && (source.endsWith('\n') || source.endsWith('\r\n')),
    `${batch.name} report lacks a final newline`);
  const lines = source.replace(/\r?\n$/u, '').split(/\r?\n/u);
  assert(lines.length === batch.probe.reportLines && lines.every(line => line.length > 0),
    `${batch.name} report has ${lines.length} nonempty lines, expected ${batch.probe.reportLines}`);
  assert(lines[0] === batch.probe.beginMarker && lines.at(-1) === batch.probe.endMarker,
    `${batch.name} report framing is not at the first and terminal lines`);
  const records = lines.map(parseHoldoutRecord);
  validateHoldoutRecordOrder(records, batch);
  const tagCounts = validateHoldoutTagCounts(records, batch);
  validateProbeStartup(records, batch);
  const mainFinish = onlyRecord(records, 'MAIN-FINISH');
  expectRecordFields(mainFinish.fields, ['status'], `${batch.name} MAIN-FINISH`);
  matrixKeyword(mainFinish, 'status', 'NORMAL', `${batch.name} MAIN-FINISH`);
  const postMainPreview = validatePostMainGate(records, batch.plannedCases);
  assert(records.indexOf(mainFinish) < records.indexOf(onlyRecord(records, 'POST-MAIN-GATE')),
    `${batch.name} MAIN-FINISH is not before the post-MAIN probe gate`);
  const observedBaselineState = parseStateBindingGroup(records, 'POST-MAIN-BASELINE', `${batch.name} POST-MAIN baseline`);
  const originalMaps = validateOriginalMapPreflight(records, observedBaselineState);
  const initialDimensions = originalMaps.mapMetadata['FILL-MAP'].dimensions;
  assert(same(initialDimensions, originalMaps.mapMetadata['PATCH-MAP'].dimensions),
    `${batch.name} original maps have different dimensions`);
  for (const name of ['START', 'XINCS', 'YINCS', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*']) {
    assert(observedBaselineState[name].status === baselineState[name].status
      && observedBaselineState[name].bound === baselineState[name].bound
      && same(observedBaselineState[name].type, baselineState[name].type)
      && same(observedBaselineState[name].rawValue, baselineState[name].rawValue),
    `${batch.name} POST-MAIN ${name} differs from the validated matrix baseline`);
  }
  const caseRows = recordsByTag(records, 'CASE-BEGIN');
  assert(caseRows.length === batch.cases.length, `${batch.name} CASE-BEGIN count differs from source-bound inputs`);
  const cases = batch.cases.map((expected, index) => {
    matrixOrdinal(caseRows[index], expected.ordinal, `${batch.name} case header ${index + 1}`);
    return validateHoldoutCase(records, expected, observedBaselineState, postMainPreview);
  });
  const footer = validateHoldoutFooter(records, batch, postMainPreview, observedBaselineState);
  return {
    framing: { begin: lines[0], scope: lines[1], limits: lines[2], end: lines.at(-1),
      terminalEndVerified: true, lines: lines.length },
    completion: { planned: batch.plannedCases, attempted: batch.plannedCases, completed: batch.plannedCases,
      calls: batch.plannedCases, errors: 0, overflow: false, active: false, complete: true },
    postMainRngPreview: postMainPreview,
    originalMaps: originalMaps,
    originalStateMatchesMatrixBaseline: true,
    caseCount: cases.length, cases, footer, tagCounts,
  };
}

function matrixValue(record, key, label = record.tag) { return expectRecordValue(record, key, label); }

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
        && value[2].name === 'DEPTH-LIMIT' && value[3] === true) throw new Error(`${label} contains a depth-limit summary`);
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
  assert(Array.isArray(rawElementType) && rawElementType.length === 2, `${label} element type is malformed`);
  const elementType = rawElementType.map((item, index) => parseGenericType(item, `${label} element type ${index}`));
  const total = lispInteger(plistGet(fields, 'TOTAL', label), `${label} total`);
  assert(rank === 2 && dimensions.every(item => item > 0)
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
    && summary.total === metadata.total, `${label} array summary differs from map metadata`);
  if (metadata.total > MAX_ARRAY_ITEMS) assert(summary.shown === 0 && summary.truncated,
    `${label} oversized natural map summary exposes partial cells`);
  else assert(summary.shown === metadata.total && !summary.truncated, `${label} natural map summary is incomplete`);
  return summary;
}

function expectRecordValue(row, key, label) {
  assert(Object.hasOwn(row.fields ?? {}, key), `${label} has no ${key} field`);
  return row.fields[key];
}

function recordsByTag(records, tag) { return records.filter(row => row.tag === tag); }

function onlyRecord(records, tag) {
  const rows = recordsByTag(records, tag);
  assert(rows.length === 1, `Expected one ${tag} record, found ${rows.length}`);
  return rows[0];
}

function recordTagCounts(records) {
  const counts = Object.create(null);
  for (const row of records) counts[row.tag] = (counts[row.tag] ?? 0) + 1;
  return counts;
}

function assertIgnored(path, label) {
  const rel = portable(relative(PROJECT_ROOT, resolve(path)));
  const result = spawnSync('git', ['check-ignore', '--quiet', '--', rel], {
    cwd: PROJECT_ROOT, encoding: 'utf8', windowsHide: true,
  });
  assert(!result.error && result.status === 0, `${label} is not covered by workspace ignore rules`);
}

function trackBaselineClosure(baseline) {
  assert(Array.isArray(baseline.sourceHashes) && baseline.sourceHashes.length === 285,
    'Frozen matrix derivation no longer binds exactly 285 source/artifact files');
  assert(baseline.baseline?.sourceCount === 199
    && baseline.baseline?.nativeBaseline?.sourceCount === 56
    && baseline.baseline.nativeBaseline.sourceClosureRevalidated === true
    && baseline.baseline.nativeBaseline.currentDerivationMatches === true,
  'Frozen matrix derivation no longer validates the 199-case and native56 source baselines');
  const seen = new Set();
  for (const [index, row] of baseline.sourceHashes.entries()) {
    expectKeys(row, ['path', 'sha256', 'bytes'], `matrix baseline source binding ${index}`);
    assert(typeof row.path === 'string' && row.path.length > 0 && !seen.has(row.path),
      `Matrix baseline source binding ${index} path is invalid or repeated`);
    seen.add(row.path);
    const bytes = trackedRead(row.path, `current matrix baseline closure ${row.path}`);
    assert(bytes.length === row.bytes && sha(bytes) === hashField(row.sha256, `matrix baseline ${row.path} hash`),
      `Current holdout derivation differs from frozen matrix closure at ${row.path}`);
  }
  return seen;
}

function readSetupBaseline(matrixEvidence) {
  const applicationRoot = 'research/extracted/aaron/application/';
  const applicationFiles = EXPECTED_APPLICATION_FILES.map(name => {
    const rows = matrixEvidence.sourceHashes.filter(row => row.path === `${applicationRoot}${name}`);
    assert(rows.length === 1, `285-source matrix closure does not bind exactly one extracted ${name}`);
    return { name, sha256: hashField(rows[0].sha256, `matrix baseline ${name} hash`), bytes: rows[0].bytes };
  });
  const setup = matrixEvidence.runs?.matrix?.setup;
  assert(applicationFiles.length === EXPECTED_APPLICATION_FILES.length
    && same(applicationFiles.map(row => row.name).sort(), [...EXPECTED_APPLICATION_FILES].sort())
    && setup && typeof setup.installerSha256 === 'string'
    && typeof setup.registryPatchSha256 === 'string' && typeof setup.licensePatchSha256 === 'string',
  'Re-derived matrix baseline does not bind the setup and exact 12-file AARON runtime');
  return { ...setup, applicationFiles };
}

function expectedScratchValues(shape, width, height) {
  return Array.from({ length: width * height }, (_, index) => {
    const x = Math.floor(index / height); const y = index % height;
    if (shape === 'zero') return 0;
    if (shape === 'single-4-3-value-0') return 0;
    if (shape === 'single-4-3-value-1') return x === 4 && y === 3 ? 1 : 0;
    if (shape === 'single-4-3-value-15') return x === 4 && y === 3 ? 15 : 0;
    if (shape === 'zero-rectangle-ring-rest-ones') {
      const zeroRing = ((x === 2 || x === 6) && y >= 2 && y <= 8)
        || ((y === 2 || y === 8) && x >= 2 && x <= 6);
      return zeroRing ? 0 : 1;
    }
    throw new Error(`Unsupported source-bound holdout shape ${shape}`);
  });
}

function validateSpec(spec, specBytes) {
  assert(SPEC_SHA256 !== null && SPEC_BYTES !== null,
    'Holdout specification hash/length pins are pending reviewed source freeze');
  assert(specBytes.length === SPEC_BYTES && sha(specBytes) === SPEC_SHA256,
    'Holdout specification differs from the frozen input pins');
  expectKeys(spec, ['schemaVersion', 'kind', 'status', 'scope', 'runner', 'controls', 'batches'],
    'holdout input spec');
  assert(spec.schemaVersion === 1 && spec.kind === 'zero-edge-variable-dimension-holdout-input-spec'
    && spec.status === 'frozen', 'Holdout input spec is not the reviewed frozen version');
  expectKeys(spec.scope, ['plannedCases', 'maxWidth', 'maxHeight', 'maxScratchCells',
    'maxArrayItems', 'maxReturnedPathItems', 'cellOrder', 'scratchElementType', 'outcomeExpectations'],
  'holdout scope');
  assert(spec.scope.plannedCases === MAX_CASES && spec.scope.maxWidth === MAX_WIDTH
    && spec.scope.maxHeight === MAX_HEIGHT && spec.scope.maxScratchCells === MAX_SCRATCH_CELLS
    && spec.scope.maxArrayItems === MAX_ARRAY_ITEMS && spec.scope.maxReturnedPathItems === MAX_RETURNED_PATH_ITEMS
    && spec.scope.cellOrder === 'x-major-y-minor' && spec.scope.scratchElementType === '(UNSIGNED-BYTE 4)'
    && spec.scope.outcomeExpectations === 'none', 'Holdout bounds or observation-only scope differ');
  expectKeys(spec.runner, ['path', 'sha256', 'bytes', 'mode', 'pauseSeconds', 'smallImage'], 'holdout runner spec');
  assert(spec.runner.path === REQUIRED_RUNNER_PATH && hashField(spec.runner.sha256, 'spec runner hash') === REQUIRED_RUNNER_SHA256
    && spec.runner.bytes === REQUIRED_RUNNER_BYTES && spec.runner.mode === MODE && spec.runner.pauseSeconds === 0
    && spec.runner.smallImage === false, 'Holdout runner specification differs from the reviewed required runner');
  expectKeys(spec.controls, ['before', 'after'], 'holdout controls spec');
  assert(spec.controls.before === RUNS.before.runId && spec.controls.after === RUNS.after.runId,
    'Holdout control run names differ from the accepted fresh control roots');
  assert(Array.isArray(spec.batches) && spec.batches.length === 2, 'Holdout spec must contain exactly two batches');
  const expectedBatches = [
    { name: 'base-v1', runId: RUNS.base.runId, first: 1, last: 33, count: 33,
      probePath: 'research/introspection/zero-edge-holdout-base-v1.cl',
      outputName: 'aaron-zero-edge-holdout-base-v1.txt', endMarker: 'END zero-edge-holdout-base-v1' },
    { name: 'ring-v1', runId: RUNS.ring.runId, first: 34, last: 39, count: 6,
      probePath: 'research/introspection/zero-edge-holdout-ring-v1.cl',
      outputName: 'aaron-zero-edge-holdout-ring-v1.txt', endMarker: 'END zero-edge-holdout-ring-v1' },
  ];
  const allCases = [];
  for (let index = 0; index < expectedBatches.length; index += 1) {
    const expected = expectedBatches[index];
    const batch = spec.batches[index];
    expectKeys(batch, ['name', 'runId', 'firstOrdinal', 'lastOrdinal', 'plannedCases', 'probe', 'cases'],
      `holdout batch ${index}`);
    assert(batch.name === expected.name && batch.runId === expected.runId
      && batch.firstOrdinal === expected.first && batch.lastOrdinal === expected.last
      && batch.plannedCases === expected.count && Array.isArray(batch.cases)
      && batch.cases.length === expected.count,
    `Holdout batch ${expected.name} identity or count differs`);
    expectKeys(batch.probe, ['path', 'sha256', 'bytes', 'outputName', 'beginMarker', 'endMarker',
      'scopeRecord', 'limitsRecord', 'reportSha256', 'reportBytes', 'reportLines'],
    `${expected.name} probe pins`);
    assert(batch.probe.path === expected.probePath && batch.probe.outputName === expected.outputName
      && batch.probe.beginMarker === `BEGIN ${expected.name === 'base-v1' ? 'zero-edge-holdout-base-v1' : 'zero-edge-holdout-ring-v1'}`
      && batch.probe.endMarker === expected.endMarker,
    `${expected.name} source or report framing names differ`);
    hashField(batch.probe.sha256, `${expected.name} source hash`);
    hashField(batch.probe.reportSha256, `${expected.name} report hash`);
    assert(Number.isSafeInteger(batch.probe.bytes) && batch.probe.bytes > 0
      && Number.isSafeInteger(batch.probe.reportBytes) && batch.probe.reportBytes > 0
      && Number.isSafeInteger(batch.probe.reportLines) && batch.probe.reportLines > 0
      && typeof batch.probe.scopeRecord === 'string' && typeof batch.probe.limitsRecord === 'string',
    `${expected.name} source/report byte pins are incomplete`);
    assert(batch.cases.every((row, localIndex) => row.ordinal === expected.first + localIndex
      && row.localCall === localIndex + 1 && row.batch === expected.name),
    `${expected.name} cases are not in exact global/local order`);
    for (const [caseIndex, row] of batch.cases.entries()) {
      expectKeys(row, ['ordinal', 'localCall', 'batch', 'width', 'height', 'start', 'perim', 'shape',
        'scratchBeforeXMajorYMinor'], `${expected.name} input ${caseIndex}`);
      assert(Number.isSafeInteger(row.width) && row.width >= 1 && row.width <= MAX_WIDTH
        && Number.isSafeInteger(row.height) && row.height >= 1 && row.height <= MAX_HEIGHT
        && row.width * row.height <= MAX_SCRATCH_CELLS,
      `${expected.name} input ${caseIndex} dimensions exceed the bounded parser`);
      assert(Array.isArray(row.start) && row.start.length === 3
        && row.start.every(Number.isSafeInteger) && row.start[0] >= 0 && row.start[0] < row.width
        && row.start[1] >= 0 && row.start[1] < row.height && row.start[2] >= 0 && row.start[2] <= 7,
      `${expected.name} input ${caseIndex} has an invalid START triple`);
      assert(Number.isSafeInteger(row.perim) && row.perim >= 0 && row.perim <= 64
        && typeof row.shape === 'string' && /^[a-z0-9-]+$/u.test(row.shape),
      `${expected.name} input ${caseIndex} has an invalid bounded PERIM/shape`);
      assert(Array.isArray(row.scratchBeforeXMajorYMinor)
        && row.scratchBeforeXMajorYMinor.length === row.width * row.height
        && row.scratchBeforeXMajorYMinor.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 15),
      `${expected.name} input ${caseIndex} does not contain the complete UBYTE4 scratch map`);
      assert(same(row.scratchBeforeXMajorYMinor,
        expectedScratchValues(row.shape, row.width, row.height)),
      `${expected.name} input ${caseIndex} full scratch cells disagree with its source-bound shape`);
      allCases.push(row);
    }
  }
  assert(allCases.length === MAX_CASES && allCases.every((row, index) => row.ordinal === index + 1),
    'Holdout input ordinals are not complete and consecutive');
  return { spec, cases: allCases };
}

function validateRunnerCurrent() {
  const bytes = trackedRead(REQUIRED_RUNNER_PATH, 'reviewed required-probe runner');
  assert(bytes.length === REQUIRED_RUNNER_BYTES && sha(bytes) === REQUIRED_RUNNER_SHA256,
    'The reviewed required-probe runner hash/length changed');
  return { path: REQUIRED_RUNNER_PATH, sha256: sha(bytes), bytes: bytes.length };
}

function validateSummary(summary, config, setupBaseline, batchPins = null) {
  expectKeys(summary, [
    'runId', 'mode', 'smallImage', 'preSceneProbeSha256', 'probeOutputNames',
    'preSceneProbePauseSeconds', 'requiredProbeOutputName', 'requiredProbeEndMarker',
    'probeCompletionSatisfied', 'runnerSha256', 'complete', 'startedAt', 'finishedAt',
    'installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'aa0Sha256', 'sceneReportSha256',
  ], `${config.runId} required-probe runner summary`);
  assert(summary.runId === config.runId && summary.mode === MODE && summary.smallImage === false
    && summary.preSceneProbePauseSeconds === 0 && summary.complete === true,
  `${config.runId} summary is incomplete or has wrong identity/mode/image/pause`);
  assert(hashField(summary.runnerSha256, `${config.runId} runner hash`) === REQUIRED_RUNNER_SHA256,
    `${config.runId} summary does not bind the reviewed required-probe runner`);
  assert(typeof summary.startedAt === 'string' && Number.isFinite(Date.parse(summary.startedAt))
    && typeof summary.finishedAt === 'string' && Number.isFinite(Date.parse(summary.finishedAt))
    && Date.parse(summary.finishedAt) >= Date.parse(summary.startedAt),
  `${config.runId} summary timestamps are invalid`);
  const expectedNames = batchPins ? [batchPins.outputName] : [];
  assert(Array.isArray(summary.probeOutputNames) && same(summary.probeOutputNames, expectedNames),
    `${config.runId} probe-output declaration differs`);
  if (batchPins) {
    assert(hashField(summary.preSceneProbeSha256, `${config.runId} probe hash`) === batchPins.sha256
      && summary.requiredProbeOutputName === batchPins.outputName
      && summary.requiredProbeEndMarker === batchPins.endMarker
      && summary.probeCompletionSatisfied === true,
    `${config.runId} required-probe completion binding is incomplete or differs`);
  } else {
    assert(summary.preSceneProbeSha256 === null && summary.requiredProbeOutputName === ''
      && summary.requiredProbeEndMarker === '' && summary.probeCompletionSatisfied === true,
    `${config.runId} uninstrumented control has wrong required-probe metadata`);
  }
  const setup = {
    installerSha256: hashField(summary.installerSha256, `${config.runId} installer hash`),
    registryPatchSha256: hashField(summary.registryPatchSha256, `${config.runId} registry patch hash`),
    licensePatchSha256: hashField(summary.licensePatchSha256, `${config.runId} license patch hash`),
  };
  assert(setup.installerSha256 === setupBaseline.installerSha256,
    `${config.runId} installer differs from the frozen matrix baseline`);
  assert(setup.registryPatchSha256 === setupBaseline.registryPatchSha256
    && setup.licensePatchSha256 === setupBaseline.licensePatchSha256,
  `${config.runId} runtime patch hashes differ from the frozen matrix baseline`);
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
  const runtimeFiles = EXPECTED_APPLICATION_FILES.map(name => {
    const original = trackedRead(resolve('research/extracted/aaron/application', name), `current extracted ${name}`);
    const baselineFile = setupBaseline.applicationFiles.find(file => file.name === name);
    assert(baselineFile && original.length === baselineFile.bytes && sha(original) === baselineFile.sha256,
      `${config.runId} current extracted ${name} differs from the matrix-validated baseline`);
    const bytes = trackedRead(resolve(root, 'runtime', name), `${config.runId} runtime ${name}`);
    const patched = ['registry.dll', 'license.dll'].includes(name.toLowerCase());
    assert(patched ? !bytes.equals(original) : bytes.equals(original),
      `${config.runId} runtime ${name} does not match its expected patch state`);
    return { name, bytes, sha256: sha(bytes), patched };
  });
  assert(runtimeFiles.length === 12 && runtimeFiles.some(row => row.name === 'AARON.exe' && row.bytes.equals(executable))
    && runtimeFiles.some(row => row.name === 'AARON.pll' && row.bytes.equals(pll)),
  `${config.runId} runtime copy does not cover all 12 application files or match exe/PLL`);
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

function validateLoadedSources(root, config, batchPins = null) {
  const loadedSources = COMMON_LISP_SOURCES.map(([filename, sourcePath]) => {
    const current = trackedRead(sourcePath, `${config.runId} current Lisp ${filename}`);
    const staged = trackedRead(resolve(root, 'capture', filename), `${config.runId} staged Lisp ${filename}`);
    assert(current.equals(staged), `${config.runId} staged Lisp source differs: ${filename}`);
    return { filename, sourcePath, sha256: sha(current), stagedSha256: sha(staged), bytes: current.length };
  });
  const modeSource = trackedRead(resolve(root, 'capture', LOADED_SCENE_SOURCE), `${config.runId} loaded mode source`);
  const currentModeSource = trackedRead(`research/introspection/${LOADED_SCENE_SOURCE}`, `${config.runId} current loaded mode source`);
  assert(modeSource.equals(currentModeSource), `${config.runId} loaded mode source differs from current source`);
  const runtimeInit = {};
  const runtimeInitBytes = {};
  for (const filename of ['.clinit.cl', 'clinit.cl']) {
    const bytes = trackedRead(resolve(root, 'runtime', filename), `${config.runId} ${filename}`);
    runtimeInit[filename] = { sha256: sha(bytes), bytes: bytes.length };
    runtimeInitBytes[filename] = bytes;
  }
  let startupRoute;
  if (batchPins) {
    const captureLoader = trackedRead(resolve(root, 'capture/aaron-probe-loader.cl'), `${config.runId} staged probe loader`);
    const runtimeLoader = trackedRead(resolve(root, 'runtime/aaron-probe-loader.cl'), `${config.runId} runtime probe loader`);
    const probeCopy = trackedRead(resolve(root, 'capture/aaron-pre-scene-probe.cl'), `${config.runId} staged probe source`);
    const currentProbe = trackedRead(batchPins.path, `${config.runId} current frozen probe`);
    assert(currentProbe.length === batchPins.bytes && sha(currentProbe) === batchPins.sha256
      && probeCopy.equals(currentProbe), `${config.runId} current/staged probe differs from its frozen pin`);
    const expectedLoader = Buffer.from(
      `(set 'aaron-pre-scene-probe-pause-seconds 0)\r\n(load "C:\\\\temp\\\\aaron-pre-scene-probe.cl")\r\n(load "C:\\\\temp\\\\${LOADED_SCENE_SOURCE}")\r\n`,
      'utf8');
    assert(captureLoader.equals(expectedLoader) && runtimeLoader.equals(expectedLoader)
      && runtimeInitBytes['.clinit.cl'].equals(expectedLoader) && runtimeInitBytes['clinit.cl'].equals(expectedLoader),
    `${config.runId} loader/init routing does not load the exact probe before selected scene source`);
    startupRoute = { kind: 'required-probe-loader-then-mode-source', sha256: sha(expectedLoader) };
  } else {
    assert(runtimeInitBytes['.clinit.cl'].equals(modeSource) && runtimeInitBytes['clinit.cl'].equals(modeSource),
      `${config.runId} uninstrumented control does not route directly to selected scene source`);
    for (const rel of ['pre-scene-probe-request.json', 'capture/aaron-pre-scene-probe.cl',
      'capture/aaron-probe-loader.cl', 'runtime/aaron-probe-loader.cl']) {
      assert(!existsSync(resolve(root, rel)), `${config.runId} uninstrumented control unexpectedly contains ${rel}`);
    }
    startupRoute = { kind: 'direct-mode-source', sha256: sha(modeSource) };
  }
  assert(modeSource.equals(trackedRead(resolve(root, 'capture', LOADED_SCENE_SOURCE),
    `${config.runId} repeat loaded mode source`)), `${config.runId} mode source changed during validation`);
  return { loadedSources, runtimeInit, startupRoute, modeSourceSha256: sha(modeSource), routingValidated: true };
}

function readProbeRequest(root, config, pins) {
  const requestBytes = trackedRead(resolve(root, 'pre-scene-probe-request.json'), `${config.runId} request`);
  const request = parseJson(requestBytes, `${config.runId} request`);
  expectKeys(request, ['schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256', 'pauseSeconds',
    'releaseFile', 'probeOutputNames', 'requiredProbeOutputName', 'requiredProbeEndMarker', 'runnerSha256'],
  `${config.runId} required-probe request`);
  assert(request.schemaVersion === 1 && request.runId === config.runId && request.pauseSeconds === 0
    && request.releaseFile === 'C:\\temp\\aaron-native-code-release.txt'
    && same(request.probeOutputNames, [pins.outputName])
    && request.requiredProbeOutputName === pins.outputName && request.requiredProbeEndMarker === pins.endMarker
    && hashField(request.runnerSha256, `${config.runId} request runner hash`) === REQUIRED_RUNNER_SHA256
    && hashField(request.probeSha256, `${config.runId} request probe hash`) === pins.sha256,
  `${config.runId} required-probe request differs from the frozen batch`);
  const probe = trackedRead(pins.path, `${config.runId} current probe`);
  const staged = trackedRead(resolve(root, 'capture/aaron-pre-scene-probe.cl'), `${config.runId} staged probe`);
  assert(probe.length === pins.bytes && sha(probe) === pins.sha256 && staged.equals(probe),
    `${config.runId} request/current/staged source hashes disagree`);
  assert(typeof request.runtimeExecutable === 'string'
    && resolve(request.runtimeExecutable).toLowerCase() === resolve(root, 'runtime/AARON.exe').toLowerCase(),
  `${config.runId} request executable is outside the capture root`);
  return { request, sha256: sha(requestBytes), probeSha256: sha(probe), probeBytes: probe.length };
}

function readMatrixBaselineState(matrixEvidence) {
  const matrixRun = matrixEvidence.runs?.matrix;
  assert(matrixRun && typeof matrixRun.root === 'string'
    && typeof matrixEvidence.probe?.outputName === 'string',
  'Re-derived matrix evidence lacks its source-bound report location');
  const reportPath = portable(relative(PROJECT_ROOT,
    resolve(matrixRun.root, 'capture', matrixEvidence.probe.outputName)));
  const bindings = matrixEvidence.sourceHashes.filter(row => row.path === reportPath);
  assert(bindings.length === 1, '285-source matrix closure does not bind exactly one matrix report');
  const bytes = trackedRead(reportPath, 'frozen matrix report for POST-MAIN state baseline');
  assert(bytes.length === bindings[0].bytes && sha(bytes) === hashField(bindings[0].sha256, 'matrix report hash'),
    'Current matrix report differs from the re-derived source closure');
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), 'Matrix report is not round-trip UTF-8');
  const stateLines = text.split(/\r?\n/u).filter(line => /^STATE-BINDING phase=:POST-MAIN-BASELINE(?:\s|$)/u.test(line));
  assert(stateLines.length === 7, `Matrix report has ${stateLines.length} POST-MAIN state bindings, expected seven`);
  const stateRecords = stateLines.map(parseHoldoutRecord);
  const baselineState = parseStateBindingGroup(stateRecords, 'POST-MAIN-BASELINE', 'matrix POST-MAIN baseline');
  const mapMetadata = matrixRun.report?.originalMaps?.mapMetadata;
  assert(mapMetadata && matrixRun.report.originalMaps.ready === true
    && matrixRun.report.originalMaps.originalCellCopiesCompleted === true
    && matrixRun.report.originalMaps.fullCellEqualityCheckedAtEachBoundary === true,
  'Re-derived matrix evidence does not confirm complete original-map snapshots and checks');
  validateRequiredRuntimeState(baselineState, mapMetadata, 'matrix POST-MAIN baseline state');
  return { baselineState, reportPath, reportSha256: sha(bytes), reportBytes: bytes.length,
    postMainRngPreview: matrixRun.report.postMainRngPreview, originalMaps: matrixRun.report.originalMaps };
}

function readRun(config, setupBaseline, batch, baselineState) {
  const root = resolve(LOCAL_ORACLE_ROOT, config.runId);
  assert(within(resolve(LOCAL_ORACLE_ROOT), root) && basename(root) === config.runId,
    `${config.runId} run root is not the exact named local-oracle root`);
  const summaryBytes = trackedRead(resolve(root, 'summary.json'), `${config.runId} required-runner summary`);
  const summary = parseJson(summaryBytes, `${config.runId} summary`);
  const batchPins = batch?.probe ?? null;
  const setup = validateSummary(summary, config, setupBaseline, batchPins);
  const request = batchPins ? readProbeRequest(root, config, batchPins) : null;
  if (batchPins) {
    assert(hashField(summary.preSceneProbeSha256, `${config.runId} summary probe hash`) === request.probeSha256,
      `${config.runId} summary does not bind its required request probe`);
  }
  const capture = readCoreCapture(root, config, summary, setupBaseline, setup);
  const loaded = validateLoadedSources(root, config, batchPins);
  let report = null;
  if (batchPins) {
    const reportBytes = trackedRead(resolve(root, 'capture', batchPins.outputName), `${config.runId} probe report`);
    assert(reportBytes.length === batchPins.reportBytes && sha(reportBytes) === batchPins.reportSha256,
      `${config.runId} report differs from its frozen complete-capture pins`);
    const reportText = reportBytes.toString('utf8');
    assert(Buffer.from(reportText, 'utf8').equals(reportBytes), `${config.runId} report is not round-trip UTF-8`);
    const reportLines = reportText.split(/\r?\n/u);
    assert(reportLines.length === batchPins.reportLines + 1 && reportLines.at(-1) === '',
      `${config.runId} report newline/line count differs from its frozen pins`);
    report = validateHoldoutReport(reportText, batch, baselineState);
    report = { ...report, sha256: sha(reportBytes), bytes: reportBytes.length };
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
      && row.bytes.equals(right.runtimeFiles[index].bytes)), `${label} all-12 runtime application bytes differ`);
  return { drawingOutputsByteIdentical: true, executableAndPllByteIdentical: true,
    all12RuntimeApplicationFilesByteIdentical: true };
}

function portableRun(run) {
  return {
    runId: run.runId, root: run.root, timestamps: run.timestamps,
    summarySha256: run.summarySha256, setup: run.setup, request: run.request, loaded: run.loaded,
    capture: {
      hashes: run.capture.hashes, lengths: run.capture.lengths,
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
      `Bound source/artifact changed before holdout evidence freeze: ${row.path}`);
  }
  return rows;
}

export function deriveZeroEdgeHoldoutEvidence() {
  trackedSources.clear();
  trackedRead(fileURLToPath(import.meta.url), 'holdout evidence helper source');
  const specBytes = trackedRead(SPEC_PATH, 'frozen holdout input specification');
  const spec = parseJson(specBytes, 'holdout input specification');
  const { cases } = validateSpec(spec, specBytes);
  const runner = validateRunnerCurrent();

  const matrixEvidence = deriveZeroEdgeInputMatrixEvidence();
  const baselinePaths = trackBaselineClosure(matrixEvidence);
  const setupBaseline = readSetupBaseline(matrixEvidence);
  const matrixState = readMatrixBaselineState(matrixEvidence);
  assert(same(matrixEvidence.runner, runner), 'Holdout and frozen matrix evidence bind different required runners');

  const baseBatch = spec.batches[0];
  const ringBatch = spec.batches[1];
  assert(baseBatch.name === RUNS.base.batch && ringBatch.name === RUNS.ring.batch,
    'Frozen holdout batches do not match their run routing');
  const before = readRun(RUNS.before, setupBaseline, null, matrixState.baselineState);
  const base = readRun(RUNS.base, setupBaseline, baseBatch, matrixState.baselineState);
  const ring = readRun(RUNS.ring, setupBaseline, ringBatch, matrixState.baselineState);
  const after = readRun(RUNS.after, setupBaseline, null, matrixState.baselineState);

  const times = [before, base, ring, after].map(run => ({
    start: Date.parse(run.timestamps.startedAt), finish: Date.parse(run.timestamps.finishedAt),
  }));
  assert(times.every(row => Number.isFinite(row.start) && Number.isFinite(row.finish) && row.finish >= row.start),
    'One or more source-bound run timestamps are invalid');
  assert(times[0].finish <= times[1].start && times[1].finish <= times[2].start
    && times[2].finish <= times[3].start,
  'Fresh before, base, ring, and after runs are not strictly chronological');
  assert(same(before.setup, base.setup) && same(base.setup, ring.setup) && same(ring.setup, after.setup)
    && same(before.setup, { installerSha256: setupBaseline.installerSha256,
      registryPatchSha256: setupBaseline.registryPatchSha256, licensePatchSha256: setupBaseline.licensePatchSha256 }),
  'Before, base, ring, and after runs do not share the matrix-validated setup');
  assert(same(before.loaded.loadedSources, base.loaded.loadedSources)
    && same(base.loaded.loadedSources, ring.loaded.loadedSources)
    && same(ring.loaded.loadedSources, after.loaded.loadedSources),
  'Runs do not bind identical current/staged six-source Lisp files and mode source');

  const beforeBase = compareCaptureBytes(base.capture, before.capture, 'Base probe vs preceding control');
  const beforeRing = compareCaptureBytes(ring.capture, before.capture, 'Ring probe vs preceding control');
  const baseRing = compareCaptureBytes(base.capture, ring.capture, 'Base vs ring probe');
  const baseAfter = compareCaptureBytes(base.capture, after.capture, 'Base probe vs following control');
  const ringAfter = compareCaptureBytes(ring.capture, after.capture, 'Ring probe vs following control');
  const controlParity = compareCaptureBytes(before.capture, after.capture, 'Fresh before/after controls');

  assert(base.report?.completion?.complete === true && base.report.caseCount === 33,
    'Base report is not a complete accepted 33-case capture');
  assert(ring.report?.completion?.complete === true && ring.report.caseCount === 6,
    'Ring report is not a complete accepted 6-case capture');
  assert(base.report.cases.length + ring.report.cases.length === cases.length
    && same([...base.report.cases, ...ring.report.cases].map(row => row.ordinal), cases.map(row => row.ordinal)),
  'Parsed base and ring observations do not cover all 39 source-bound input cases in order');

  const sourceHashes = revalidateSources();
  assert(sourceHashes.length >= baselinePaths.size + 20,
    'Holdout derivation did not bind its runner, two probes/reports, and four fresh run roots');
  const matrixReportBinding = matrixEvidence.sourceHashes.find(row => row.path === matrixState.reportPath);
  assert(matrixReportBinding && matrixReportBinding.sha256 === matrixState.reportSha256
    && matrixReportBinding.bytes === matrixState.reportBytes,
  'Holdout matrix-baseline raw report binding is incomplete');

  const evidence = {
    schemaVersion: 1,
    kind: 'zero-edge-variable-dimension-holdout-evidence',
    scope: {
      plannedCases: MAX_CASES,
      base: { firstOrdinal: baseBatch.firstOrdinal, lastOrdinal: baseBatch.lastOrdinal, count: baseBatch.plannedCases },
      ring: { firstOrdinal: ringBatch.firstOrdinal, lastOrdinal: ringBatch.lastOrdinal, count: ringBatch.plannedCases },
      maxWidth: MAX_WIDTH, maxHeight: MAX_HEIGHT, maxScratchCells: MAX_SCRATCH_CELLS,
      maxArrayItems: MAX_ARRAY_ITEMS, maxReturnedPathItems: MAX_RETURNED_PATH_ITEMS,
      cellOrder: 'x-major-y-minor', scratchElementType: '(UNSIGNED-BYTE 4)',
      interpretation: 'Each observation is limited to the exact source-bound START, numeric PERIM, dimensions, and complete scratch input listed in the frozen case specification.',
    },
    inputSpec: { path: SPEC_PATH, sha256: sha(specBytes), bytes: specBytes.length,
      cases: cases.map(row => ({ ...row, start: [...row.start],
        scratchBeforeXMajorYMinor: [...row.scratchBeforeXMajorYMinor] })) },
    baseline: matrixEvidence.baseline,
    matrixBaseline: {
      sourceCount: matrixEvidence.sourceHashes.length,
      sourceClosureRevalidated: true,
      probe: matrixEvidence.probe,
      report: { path: matrixState.reportPath, sha256: matrixState.reportSha256, bytes: matrixState.reportBytes },
      postMainRngPreview: matrixState.postMainRngPreview,
      originalMaps: matrixState.originalMaps,
    },
    runner,
    probes: spec.batches.map(batch => ({
      name: batch.name, path: batch.probe.path, sha256: batch.probe.sha256, bytes: batch.probe.bytes,
      outputName: batch.probe.outputName, reportSha256: batch.probe.reportSha256,
      reportBytes: batch.probe.reportBytes, reportLines: batch.probe.reportLines,
    })),
    runs: { before: portableRun(before), base: portableRun(base), ring: portableRun(ring), after: portableRun(after) },
    chronology: {
      beforeFinishesBeforeBase: true, baseFinishesBeforeRing: true, ringFinishesBeforeAfter: true,
      timestamps: Object.fromEntries([before, base, ring, after].map(run => [run.runId, run.timestamps])),
    },
    parity: { baseVsBefore: beforeBase, ringVsBefore: beforeRing, baseVsRing: baseRing,
      baseVsAfter: baseAfter, ringVsAfter: ringAfter, controls: controlParity },
    sourceHashes,
  };
  assertPortableEvidence(evidence);
  return evidence;
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
    process.stdout.write('Usage: node research/tools/derive-zero-edge-holdout-evidence.mjs [--output <fresh-ignored-json-under-ring-run-u>]\n');
    return;
  }
  const evidence = deriveZeroEdgeHoldoutEvidence();
  const runRoot = resolve(LOCAL_ORACLE_ROOT, RUNS.ring.runId);
  const outputPath = resolve(args.output ?? resolve(runRoot, 'aaron-zero-edge-holdout-evidence-20261012.json'));
  assert(within(runRoot, outputPath), 'Holdout evidence output must be inside the ring run root');
  assert(!existsSync(outputPath), `Holdout evidence output already exists: ${outputPath}`);
  assertIgnored(outputPath, 'Fresh holdout evidence output');
  assertPortableEvidence(evidence);
  const output = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(outputPath, output, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({
    output: portable(relative(PROJECT_ROOT, outputPath)), sha256: sha(output), bytes: output.length,
    cases: evidence.scope.plannedCases, baseCases: evidence.runs.base.report.caseCount,
    ringCases: evidence.runs.ring.report.caseCount, sourceCount: evidence.sourceHashes.length,
    controlsAndInstrumentedDrawingsByteIdentical: true, all12RuntimeFilesByteIdentical: true,
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
