#!/usr/bin/env node
// Strict offline validation for one in-sub-frame natural-rejects runner output.
// This script reads captured artifacts only; it never launches AARON.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VERSION = 'in-sub-frame-initial-window-v2';
const REPORT_NAME = 'aaron-in-sub-frame-initial-window-v2.txt';
const STAGE_NAME = 'aaron-in-sub-frame-initial-window-v2-stage.txt';
const STAGED_PROBE_NAME = 'aaron-pre-scene-probe.cl';
const REQUIRED_END = `END ${VERSION}`;
const EXPECTED_OUTPUT_NAMES = [REPORT_NAME, STAGE_NAME];
const HASH_RE = /^[0-9a-f]{64}$/;
const KNOWN_RECORDS = new Set([
  'BEGIN', 'CAPS', 'INSTALL', 'READY', 'FALSE', 'RESTORE', 'COMPLETE', 'END',
  'SAMPLE-ERROR', 'TRUNCATED', 'CALL-ERROR', 'ABORT', 'SETUP-ERROR',
]);

const fail = message => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysEqual = (value, expected, label) => {
  assert(isRecord(value), `${label} must be a JSON object`);
  const actual = Object.keys(value);
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} fields differ from the known runner schema`);
};
const fieldNamesEqual = (fields, expected, label) => {
  const actual = Object.keys(fields);
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} fields differ from the known report schema`);
};
const isKeyword = (value, name) => value?.kind === 'keyword' && value.name === name;
const isTrue = value => value?.kind === 'true';
const isInteger = value => value?.kind === 'integer';
const isString = value => value?.kind === 'string';
const isSymbol = (value, name) => value?.kind === 'symbol' && (name === undefined || value.name === name);
const intValue = (value, label, { min = 0n, max = null } = {}) => {
  assert(isInteger(value), `${label} must be an integer`);
  assert(value.value >= min && (max === null || value.value <= max), `${label} is out of range`);
  return value.value;
};
const stringValue = (value, label) => {
  assert(isString(value), `${label} must be a string`);
  return value.value;
};
const keywordValue = (value, label) => {
  assert(value?.kind === 'keyword', `${label} must be a keyword`);
  return value.name;
};
const listValue = (value, label) => {
  if (value === null) return [];
  assert(Array.isArray(value), `${label} must be a proper list`);
  return value;
};
const codePointLength = value => Array.from(value).length;

function decodeUtf8(bytes, label) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail(`${label} is not valid UTF-8`); }
}

function parseJson(bytes, label) {
  const text = decodeUtf8(bytes, label).replace(/^\uFEFF/, '');
  try { return JSON.parse(text); }
  catch (error) { fail(`${label} is malformed JSON: ${error.message}`); }
}

// Parse only the small, non-evaluating Common Lisp data syntax emitted by this
// probe. Reader macros, dotted lists, ratios, and arbitrary forms are rejected.
function parseLispExpr(source, start) {
  let index = start;
  const skipListWhitespace = () => {
    while (index < source.length && /[\t\n\r ]/.test(source[index])) index += 1;
  };
  const readString = () => {
    index += 1;
    let value = '';
    while (index < source.length) {
      const char = source[index++];
      if (char === '"') return { kind: 'string', value };
      if (char === '\\') {
        if (index >= source.length) fail('Unterminated Lisp string escape');
        // In Common Lisp, backslash quotes the next character; it is not a C
        // escape introducer. Preserve the quoted character literally.
        value += source[index++];
      } else value += char;
    }
    fail('Unterminated Lisp string');
  };
  const readAtom = () => {
    const begin = index;
    while (index < source.length && !/[\t\n\r ()]/.test(source[index])) index += 1;
    const raw = source.slice(begin, index);
    if (!raw || /^[#'`,;]/.test(raw) || raw.includes('\\')) fail(`Forbidden Lisp reader syntax: ${raw}`);
    if (/^NIL$/i.test(raw)) return null;
    if (/^T$/i.test(raw)) return { kind: 'true' };
    if (/^[+-]?\d+$/.test(raw)) return { kind: 'integer', value: BigInt(raw) };
    if (/^:[A-Za-z][A-Za-z0-9*+!-]*$/.test(raw)) {
      return { kind: 'keyword', name: raw.slice(1).toUpperCase() };
    }
    const symbolToken = /^(?:[A-Za-z0-9*+!$%&/<=>?@^_~.-]+::)?[A-Za-z0-9*+!$%&/<=>?@^_~.-]+$/;
    if (symbolToken.test(raw)) return { kind: 'symbol', name: raw.toUpperCase() };
    fail(`Unsupported Lisp atom: ${raw}`);
  };
  const read = () => {
    if (index >= source.length) fail('Expected Lisp expression');
    if (source[index] === '(') {
      index += 1;
      const values = [];
      for (;;) {
        skipListWhitespace();
        if (index >= source.length) fail('Unclosed Lisp list');
        if (source[index] === ')') { index += 1; return values; }
        if (source[index] === '.' && /[\t\n\r )]/.test(source[index + 1] ?? '')) {
          fail('Dotted Lisp lists are forbidden in report fields');
        }
        values.push(read());
      }
    }
    if (source[index] === ')') fail('Unexpected Lisp close parenthesis');
    if (source[index] === '"') return readString();
    return readAtom();
  };
  return { value: read(), end: index };
}

function readReportRecord(source, start, number) {
  let index = start;
  if (source[index] === '\n' || source[index] === '\r') fail(`Blank report record at record ${number}`);
  const tagStart = index;
  while (index < source.length && !/[\t\n\r ]/.test(source[index])) index += 1;
  const tag = source.slice(tagStart, index);
  assert(KNOWN_RECORDS.has(tag), `Unknown report record ${JSON.stringify(tag)} at record ${number}`);

  if (tag === 'BEGIN' || tag === 'END') {
    let lineEnd = index;
    while (lineEnd < source.length && source[lineEnd] !== '\n' && source[lineEnd] !== '\r') lineEnd += 1;
    const line = source.slice(start, lineEnd);
    const expected = tag === 'BEGIN' ? `BEGIN ${VERSION}` : REQUIRED_END;
    assert(line === expected, `Malformed ${tag} record at record ${number}`);
    return { tag, fields: Object.create(null), next: consumeRecordNewline(source, lineEnd, number) };
  }

  assert(source[index] === ' ', `Missing fields after ${tag} at record ${number}`);
  index += 1;
  const fields = Object.create(null);
  for (;;) {
    const fieldStart = index;
    while (source[index] === ' ' || source[index] === '\t') index += 1;
    if (source[index] === '\n' || source[index] === '\r' || index >= source.length) {
      assert(Object.keys(fields).length > 0, `Missing fields in ${tag} record ${number}`);
      assert(index === fieldStart, `Trailing whitespace in ${tag} record ${number}`);
      break;
    }
    const keyMatch = /^[A-Za-z][A-Za-z0-9-]*/.exec(source.slice(index));
    assert(keyMatch, `Malformed field name in ${tag} record ${number}`);
    const key = keyMatch[0].toLowerCase();
    index += keyMatch[0].length;
    assert(source[index] === '=', `Missing = after ${key} in ${tag} record ${number}`);
    assert(!Object.hasOwn(fields, key), `Duplicate ${key} field in ${tag} record ${number}`);
    index += 1;
    assert(index < source.length && source[index] !== ' ' && source[index] !== '\t'
      && source[index] !== '\n' && source[index] !== '\r', `Missing value for ${key} in ${tag} record ${number}`);
    const parsed = parseLispExpr(source, index);
    fields[key] = parsed.value;
    index = parsed.end;
    assert(index >= source.length || /[\t\n\r ]/.test(source[index]),
      `Malformed value boundary after ${key} in ${tag} record ${number}`);
  }
  return { tag, fields, next: consumeRecordNewline(source, index, number) };
}

function consumeRecordNewline(source, index, number) {
  if (source[index] === '\r') {
    assert(source[index + 1] === '\n', `Bare carriage return at record ${number}`);
    return index + 2;
  }
  assert(source[index] === '\n', `Report record ${number} is not newline terminated`);
  return index + 1;
}

function expectFields(record, names) {
  fieldNamesEqual(record.fields, names, record.tag);
  return record.fields;
}

function validateIntegerRecord(value, label) {
  const items = listValue(value, label);
  assert(isKeyword(items[0], 'INTEGER'), `${label} must start with :INTEGER`);
  if (items.length === 2) {
    assert(isInteger(items[1]), `${label} exact integer must be an integer`);
    const integer = items[1].value;
    const bits = integer === 0n ? 0 : (integer < 0n ? -integer : integer).toString(2).length;
    assert(bits <= 256, `${label} used exact form for an oversized integer`);
    return false;
  }
  assert(items.length === 6 && (isKeyword(items[1], 'NEGATIVE') || isKeyword(items[1], 'POSITIVE'))
    && isKeyword(items[2], 'BITS') && isInteger(items[3])
    && isKeyword(items[4], 'DIGITS-OMITTED') && isTrue(items[5]),
  `${label} has malformed omitted-digits integer shape`);
  const bits = intValue(items[3], `${label} bit count`, { min: 257n, max: 1000000n });
  void bits;
  return true;
}

function validateTypeRecord(value, label, state) {
  if (isKeyword(value, 'NON-SYMBOL-TYPE')) return false;
  return validateDescriptor(value, label, state, 0, new Set());
}

function registerObjectId(value, kind, label, state, { mustExist = false } = {}) {
  const id = intValue(value, `${label} id`, { min: 1n, max: BigInt(Number.MAX_SAFE_INTEGER) });
  const number = Number(id);
  const prior = state.objectIds.get(number);
  if (mustExist) {
    assert(prior === kind, `${label} repeated ID was not previously seen as ${kind}`);
    return number;
  }
  if (prior === undefined) {
    assert(number > state.maxObjectId, `${label} new object IDs are out of order`);
    state.objectIds.set(number, kind);
    state.maxObjectId = number;
  } else {
    assert(prior === kind, `${label} object ID ${number} changes descriptor kind`);
  }
  return number;
}

function validateSymbolRecord(value, label) {
  const items = listValue(value, label);
  assert(items.length === 5 && isKeyword(items[0], 'SYMBOL') && isKeyword(items[3], 'CLIPPED'),
    `${label} has malformed :SYMBOL shape`);
  const packageName = stringValue(items[1], `${label} package`);
  const name = stringValue(items[2], `${label} name`);
  assert(packageName.length > 0 && name.length > 0, `${label} symbol strings cannot be empty`);
  assert(codePointLength(packageName) <= 96 && codePointLength(name) <= 160,
    `${label} exceeds the declared symbol string caps`);
  const clipped = isTrue(items[4]);
  assert(items[4] === null || clipped, `${label} :CLIPPED must be T or NIL`);
  if (clipped) assert(codePointLength(packageName) === 96 || codePointLength(name) === 160,
    `${label} marks clipping without reaching a string cap`);
  return clipped;
}

function validateDescriptor(value, label, state, depth, localConsIds) {
  if (isKeyword(value, 'NIL') || isKeyword(value, 'NON-SYMBOL-TYPE')) return false;
  const items = listValue(value, label);
  if (items.length === 0) fail(`${label} cannot be an empty descriptor`);
  const tag = keywordValue(items[0], `${label} tag`);
  if (tag === 'INTEGER') return validateIntegerRecord(value, label);
  if (tag === 'RATIO') {
    assert(items.length === 3, `${label} has malformed :RATIO shape`);
    const first = validateIntegerRecord(items[1], `${label} numerator`);
    const second = validateIntegerRecord(items[2], `${label} denominator`);
    return first || second;
  }
  if (tag === 'FLOAT') {
    assert(items.length === 5 && isKeyword(items[1], 'TYPE') && isKeyword(items[3], 'VALUE'),
      `${label} has malformed :FLOAT shape`);
    const typeTruncated = validateTypeRecord(items[2], `${label} type`, state);
    stringValue(items[4], `${label} value`);
    return typeTruncated;
  }
  if (tag === 'COMPLEX') {
    assert(items.length === 3, `${label} has malformed :COMPLEX shape`);
    const realTruncated = validateDescriptor(items[1], `${label} real part`, state, depth + 1, localConsIds);
    const imaginaryTruncated = validateDescriptor(items[2], `${label} imaginary part`, state, depth + 1, localConsIds);
    return realTruncated || imaginaryTruncated;
  }
  if (tag === 'CHARACTER') {
    assert(items.length === 2, `${label} has malformed :CHARACTER shape`);
    intValue(items[1], `${label} character code`, { min: 0n, max: 0x10ffffn });
    return false;
  }
  if (tag === 'SYMBOL') return validateSymbolRecord(value, label);
  if (tag === 'STRING') {
    assert(items.length === 6 && isKeyword(items[2], 'LENGTH') && isKeyword(items[4], 'CLIPPED'),
      `${label} has malformed :STRING shape`);
    const actual = stringValue(items[1], `${label} value`);
    const declared = intValue(items[3], `${label} declared length`, { min: 0n, max: BigInt(Number.MAX_SAFE_INTEGER) });
    const actualLength = BigInt(codePointLength(actual));
    const clipped = isTrue(items[5]);
    assert(items[5] === null || clipped, `${label} :CLIPPED must be T or NIL`);
    assert(codePointLength(actual) <= 160, `${label} exceeds the declared string cap`);
    if (clipped) assert(declared > actualLength && actualLength === 160n,
      `${label} clipped length is inconsistent`);
    else assert(declared === actualLength, `${label} un-clipped length is inconsistent`);
    return clipped;
  }
  if (tag === 'CONS') {
    assert(items.length >= 4 && isKeyword(items[1], 'ID'), `${label} has malformed :CONS prefix`);
    const idValue = items[2];
    if (items[3] === undefined) fail(`${label} has missing :CONS body`);
    if (isKeyword(items[3], 'REPEATED')) {
      assert(items.length === 5 && isTrue(items[4]), `${label} has malformed repeated-cons shape`);
      const id = registerObjectId(idValue, 'CONS', label, state, { mustExist: true });
      assert(localConsIds.has(id), `${label} repeated cons was not seen in this descriptor tree`);
      return false;
    }
    const id = registerObjectId(idValue, 'CONS', label, state);
    assert(!localConsIds.has(id), `${label} duplicates a cons body within one descriptor tree`);
    localConsIds.add(id);
    if (isKeyword(items[3], 'CONTENTS')) {
      assert(items.length === 5 && isKeyword(items[4], 'DEPTH-CAP'), `${label} has malformed depth-cap cons shape`);
      assert(depth >= 4, `${label} reports a depth cap before the declared depth`);
      return true;
    }
    assert(isKeyword(items[3], 'ITEMS') && items.length === 7 && isKeyword(items[5], 'TAIL'),
      `${label} has malformed item-cons shape`);
    const children = listValue(items[4], `${label} items`);
    assert(children.length <= 8, `${label} exceeds the list item cap`);
    assert(depth < 4, `${label} descends beyond the declared list depth cap`);
    let truncated = false;
    for (let i = 0; i < children.length; i += 1) {
      truncated = validateDescriptor(children[i], `${label} item ${i}`, state, depth + 1, localConsIds) || truncated;
    }
    const tail = items[6];
    if (isKeyword(tail, 'PROPER-END')) return truncated;
    if (isKeyword(tail, 'REPEATED-TAIL')) {
      assert(localConsIds.size > 0, `${label} repeated tail has no preceding cons`);
      return truncated;
    }
    if (isKeyword(tail, 'MORE-THAN-8-CELLS')) {
      assert(children.length === 8, `${label} more-than-eight tail lacks eight retained cells`);
      return true;
    }
    const dotted = listValue(tail, `${label} dotted tail`);
    assert(dotted.length === 2 && isKeyword(dotted[0], 'DOTTED-TAIL'), `${label} has unknown cons tail marker`);
    return validateDescriptor(dotted[1], `${label} dotted tail value`, state, depth + 1, localConsIds) || truncated;
  }
  if (tag === 'HASH-TABLE') {
    assert(items.length === 5 && isKeyword(items[1], 'ID') && isKeyword(items[3], 'COUNT'),
      `${label} has malformed :HASH-TABLE shape`);
    registerObjectId(items[2], 'HASH-TABLE', label, state);
    intValue(items[4], `${label} entry count`, { min: 0n, max: BigInt(Number.MAX_SAFE_INTEGER) });
    return false;
  }
  if (tag === 'ARRAY') {
    assert(items.length === 9 && isKeyword(items[1], 'ID') && isKeyword(items[3], 'TYPE')
      && isKeyword(items[5], 'RANK') && isKeyword(items[7], 'DIMENSIONS'),
    `${label} has malformed :ARRAY shape`);
    registerObjectId(items[2], 'ARRAY', label, state);
    const typeTruncated = validateTypeRecord(items[4], `${label} type`, state);
    const rank = intValue(items[6], `${label} rank`, { min: 0n, max: 100n });
    const dimensions = listValue(items[8], `${label} dimensions`);
    assert(BigInt(dimensions.length) === rank, `${label} rank does not match dimensions`);
    for (const [i, dimension] of dimensions.entries()) {
      intValue(dimension, `${label} dimension ${i}`, { min: 0n, max: BigInt(Number.MAX_SAFE_INTEGER) });
    }
    return typeTruncated;
  }
  if (tag === 'OBJECT') {
    assert(items.length === 5 && isKeyword(items[1], 'ID') && isKeyword(items[3], 'TYPE'),
      `${label} has malformed :OBJECT shape`);
    registerObjectId(items[2], 'OBJECT', label, state);
    return validateTypeRecord(items[4], `${label} type`, state);
  }
  fail(`${label} has unsupported descriptor tag :${tag}`);
}

function validateDescriptorList(value, label, state) {
  const list = listValue(value, label);
  let truncated = false;
  for (const [index, descriptor] of list.entries()) {
    truncated = validateDescriptor(descriptor, `${label}[${index}]`, state, 0, new Set()) || truncated;
  }
  return list.length;
}

function restoreStatusValue(value, label) {
  const name = keywordValue(value, label);
  assert(name === 'RESTORED' || name === 'ALREADY-ORIGINAL', `${label} is not a successful restore status`);
  return name;
}

function validateRestoreSignal(value, expectedStatus, label) {
  const values = listValue(value, label).map((item, index) => restoreStatusValue(item, `${label}[${index}]`));
  const expected = expectedStatus === 'RESTORED' ? ['RESTORED', 'ALREADY-ORIGINAL'] : ['ALREADY-ORIGINAL'];
  assert(values.length === expected.length && values.every((item, index) => item === expected[index]),
    `${label} does not match its RESTORE record`);
}

function parseAndValidateReport(reportBytes, summary) {
  let source = decodeUtf8(reportBytes, 'Report');
  // Common Lisp's printer can label the shared restore-status list in the
  // COMPLETE record.  Expand only this exact, non-executable status tuple;
  // the report hash remains bound to the original captured bytes.
  const completeLines = source.split(/\r?\n/);
  const completeLineIndex = completeLines.findIndex(line => line.startsWith('COMPLETE '));
  if (completeLineIndex >= 0) {
    const line = completeLines[completeLineIndex];
    if (line.includes('target-restored=#') || line.includes('main-restored=#')) {
      const sharedRoot = /target-restored=#([1-9][0-9]*)=(\((?::RESTORED|:ALREADY-ORIGINAL)(?:\s+(?::RESTORED|:ALREADY-ORIGINAL))*\)) main-restored=#\1#/;
      const targetFullMainTail = /target-restored=\(:RESTORED \. #([1-9][0-9]*)=\(:ALREADY-ORIGINAL\)\) main-restored=#\1#/;
      const targetTailMainFull = /target-restored=#([1-9][0-9]*)=\(:ALREADY-ORIGINAL\) main-restored=\(:RESTORED \. #\1#\)/;
      let normalized = line.replace(sharedRoot, (_match, _id, tuple) =>
        `target-restored=${tuple} main-restored=${tuple}`);
      normalized = normalized.replace(targetFullMainTail,
        'target-restored=(:RESTORED :ALREADY-ORIGINAL) main-restored=(:ALREADY-ORIGINAL)');
      normalized = normalized.replace(targetTailMainFull,
        'target-restored=(:ALREADY-ORIGINAL) main-restored=(:RESTORED :ALREADY-ORIGINAL)');
      assert(normalized !== line, 'COMPLETE contains an unsupported shared restore value');
      completeLines[completeLineIndex] = normalized;
      source = completeLines.join('\n');
    }
  }
  assert(!source.startsWith('\uFEFF'), 'Report must not contain a UTF-8 BOM');
  assert(source.length <= 32 * 1024 * 1024, 'Report exceeds the offline validator size limit');
  const records = [];
  let offset = 0;
  while (offset < source.length) {
    const record = readReportRecord(source, offset, records.length + 1);
    records.push(record);
    offset = record.next;
  }
  assert(records.length >= 7, 'Report is incomplete');
  assert(records[0].tag === 'BEGIN' && records[1].tag === 'CAPS', 'BEGIN and CAPS must lead the report');
  assert(records[1].fields !== undefined, 'CAPS record is malformed');
  const caps = expectFields(records[1], ['false-samples', 'call-window', 'list-depth', 'list-items', 'string-chars']);
  assert(intValue(caps['false-samples'], 'CAPS false-samples') === 128n
    && intValue(caps['call-window'], 'CAPS call-window') === 1400n
    && intValue(caps['list-depth'], 'CAPS list-depth') === 4n
    && intValue(caps['list-items'], 'CAPS list-items') === 8n
    && intValue(caps['string-chars'], 'CAPS string-chars') === 160n,
  'CAPS values differ from the v2 contract');
  assert(records[records.length - 1].tag === 'END', 'END must be the final report record');
  assert(records[records.length - 1].fields !== undefined, 'END record is malformed');

  const runtime = records.slice(2, -1);
  assert(runtime.length >= 5, 'Required install, ready, restore, and complete records are missing');
  const state = { objectIds: new Map(), maxObjectId: 0 };
  const targetInstall = runtime[0];
  const mainInstall = runtime[1];
  const ready = runtime[2];
  assert(targetInstall.tag === 'INSTALL' && mainInstall.tag === 'INSTALL' && ready.tag === 'READY',
    'INSTALL target, INSTALL MAIN, and READY must follow CAPS in order');
  const targetFields = expectFields(targetInstall, ['name', 'package', 'type']);
  assert(stringValue(targetFields.name, 'IN-SUB-FRAME install name') === 'IN-SUB-FRAME'
    && stringValue(targetFields.package, 'IN-SUB-FRAME package') === 'COMMON-GRAPHICS-USER',
  'IN-SUB-FRAME installation identity differs');
  const targetTypeTruncated = validateTypeRecord(targetFields.type, 'IN-SUB-FRAME function type', state);
  assert(!targetTypeTruncated, 'IN-SUB-FRAME type record is truncated');
  const mainFields = expectFields(mainInstall, ['name', 'package', 'type', 'lifecycle-only']);
  assert(stringValue(mainFields.name, 'MAIN install name') === 'MAIN'
    && stringValue(mainFields.package, 'MAIN package') === 'COMMON-GRAPHICS-USER'
    && isTrue(mainFields['lifecycle-only']), 'MAIN installation identity/lifecycle flag differs');
  const mainTypeTruncated = validateTypeRecord(mainFields.type, 'MAIN function type', state);
  assert(!mainTypeTruncated, 'MAIN type record is truncated');
  const readyFields = expectFields(ready, ['target', 'lifecycle', 'seed']);
  assert(isSymbol(readyFields.target, 'COMMON-GRAPHICS-USER::IN-SUB-FRAME')
    && isSymbol(readyFields.lifecycle, 'COMMON-GRAPHICS-USER::MAIN')
    && intValue(readyFields.seed, 'READY seed') === 1234n,
  'READY target, lifecycle, or seed differs');

  const sampleRecords = [];
  const restores = [];
  let truncationRecord = null;
  let completeRecord = null;
  for (const record of runtime.slice(3)) {
    if (record.tag === 'FALSE') {
      assert(completeRecord === null && restores.length === 0 && truncationRecord === null,
        'FALSE record appears after truncation, restore, or completion');
      sampleRecords.push(record);
    } else if (record.tag === 'TRUNCATED') {
      assert(completeRecord === null && restores.length === 0 && truncationRecord === null,
        'Unexpected TRUNCATED position/count');
      truncationRecord = record;
    } else if (record.tag === 'RESTORE') {
      assert(completeRecord === null && restores.length < 2, 'Unexpected RESTORE position/count');
      restores.push(record);
    } else if (record.tag === 'COMPLETE') {
      assert(completeRecord === null, 'Duplicate COMPLETE record');
      completeRecord = record;
    } else if (['SAMPLE-ERROR', 'CALL-ERROR', 'ABORT', 'SETUP-ERROR'].includes(record.tag)) {
      fail(`Rejected report contains ${record.tag}`);
    } else {
      fail(`Unexpected ${record.tag} record in report body`);
    }
  }
  assert(restores.length === 2 && restores[0].tag === 'RESTORE' && restores[1].tag === 'RESTORE',
    'Exactly two RESTORE records are required');
  const restoreTarget = expectFields(restores[0], ['name', 'status']);
  const restoreMain = expectFields(restores[1], ['name', 'status']);
  assert(stringValue(restoreTarget.name, 'first restore name') === 'IN-SUB-FRAME'
    && stringValue(restoreMain.name, 'second restore name') === 'MAIN',
  'RESTORE records are not in target-then-MAIN order');
  const targetRestoreStatus = restoreStatusValue(restoreTarget.status, 'IN-SUB-FRAME restore status');
  const mainRestoreStatus = restoreStatusValue(restoreMain.status, 'MAIN restore status');
  assert(completeRecord !== null && runtime.at(-1) === completeRecord,
    'Exactly one COMPLETE must immediately precede END');
  const complete = expectFields(completeRecord,
    ['main', 'accepted', 'scope', 'call-window', 'calls', 'completed', 'false', 'truthy', 'samples', 'sample-cap',
      'sample-truncated', 'detail-truncated', 'errors', 'aborts', 'call-aborts', 'main-aborts',
      'target-restored', 'main-restored', 'report-broken']);
  assert(isKeyword(complete.main, 'WINDOW-COMPLETE') && isTrue(complete.accepted)
    && isKeyword(complete.scope, 'INITIAL-CALL-WINDOW'),
  'COMPLETE must report the accepted initial call window');
  const callWindow = intValue(complete['call-window'], 'COMPLETE call-window');
  const calls = intValue(complete.calls, 'COMPLETE calls', { max: BigInt(Number.MAX_SAFE_INTEGER) });
  const completed = intValue(complete.completed, 'COMPLETE completed', { max: BigInt(Number.MAX_SAFE_INTEGER) });
  const falseCount = intValue(complete.false, 'COMPLETE false', { max: BigInt(Number.MAX_SAFE_INTEGER) });
  const truthyCount = intValue(complete.truthy, 'COMPLETE truthy', { max: BigInt(Number.MAX_SAFE_INTEGER) });
  const samples = intValue(complete.samples, 'COMPLETE samples', { max: 128n });
  const sampleCap = intValue(complete['sample-cap'], 'COMPLETE sample-cap');
  const errors = intValue(complete.errors, 'COMPLETE errors');
  const aborts = intValue(complete.aborts, 'COMPLETE aborts');
  const callAborts = intValue(complete['call-aborts'], 'COMPLETE call-aborts');
  const mainAborts = intValue(complete['main-aborts'], 'COMPLETE main-aborts');
  const sampleTruncated = isTrue(complete['sample-truncated']);
  assert(complete['sample-truncated'] === null || sampleTruncated,
    'COMPLETE sample-truncated must be NIL or T');
  assert(sampleCap === 128n
    && complete['detail-truncated'] === null && complete['report-broken'] === null,
  'COMPLETE reports detail truncation or a broken report stream');
  assert(errors === 0n && aborts === 0n && callAborts === 0n && mainAborts === 0n,
    'COMPLETE reports errors or aborts');
  assert(callWindow === 1400n && calls === callWindow && completed === calls
    && calls === completed + aborts && falseCount + truthyCount === completed,
    'COMPLETE count equations do not balance');
  assert(aborts === callAborts + mainAborts, 'COMPLETE abort subtotals do not balance');
  assert(BigInt(sampleRecords.length) === samples && samples === (falseCount < 128n ? falseCount : 128n),
    'FALSE record count does not equal the capped false-result count');
  assert(sampleTruncated === (falseCount > 128n), 'Sample truncation flag does not match false-result count');
  if (sampleTruncated) {
    assert(truncationRecord !== null, 'Sample truncation flag has no TRUNCATED record');
    const truncated = expectFields(truncationRecord, ['kind', 'first-omitted', 'cap']);
    assert(isKeyword(truncated.kind, 'FALSE-SAMPLE')
      && intValue(truncated['first-omitted'], 'TRUNCATED first-omitted') === 129n
      && intValue(truncated.cap, 'TRUNCATED cap') === 128n,
    'TRUNCATED record differs from the declared false-sample cap');
  } else assert(truncationRecord === null, 'Unexpected TRUNCATED record without sample truncation');
  assert(samples <= 128n && calls >= completed, 'COMPLETE sample/call counts are inconsistent');
  validateRestoreSignal(complete['target-restored'], targetRestoreStatus, 'COMPLETE target-restored');
  validateRestoreSignal(complete['main-restored'], mainRestoreStatus, 'COMPLETE main-restored');

  const sampleIds = new Set();
  let detailTruncated = targetTypeTruncated || mainTypeTruncated;
  for (const [index, record] of sampleRecords.entries()) {
    const fields = expectFields(record, ['id', 'argc', 'args', 'value-count', 'values']);
    const id = intValue(fields.id, `FALSE[${index}] id`, { min: 1n, max: BigInt(Number.MAX_SAFE_INTEGER) });
    const numericId = Number(id);
    assert(id <= calls && !sampleIds.has(numericId), `FALSE[${index}] ID is duplicate or beyond calls`);
    sampleIds.add(numericId);
    const argc = intValue(fields.argc, `FALSE[${index}] argc`, { max: BigInt(Number.MAX_SAFE_INTEGER) });
    const argumentDescriptors = listValue(fields.args, `FALSE[${index}] args`);
    const argLength = validateDescriptorList(argumentDescriptors, `FALSE[${index}] args`, state);
    const valueCount = intValue(fields['value-count'], `FALSE[${index}] value-count`, { max: BigInt(Number.MAX_SAFE_INTEGER) });
    const valueDescriptors = listValue(fields.values, `FALSE[${index}] values`);
    const valuesLength = validateDescriptorList(valueDescriptors, `FALSE[${index}] values`, state);
    assert(argc === BigInt(argLength), `FALSE[${index}] argc does not match args length`);
    assert(valueCount === BigInt(valuesLength), `FALSE[${index}] value-count does not match values length`);
    // A later complete footer may not claim detail-truncated=NIL if any row
    // explicitly records an omitted integer, clipped string/symbol, or capped list.
    for (const descriptor of [...argumentDescriptors, ...valueDescriptors]) {
      detailTruncated = inspectDescriptorTruncation(descriptor) || detailTruncated;
    }
  }
  assert(!detailTruncated, 'Report descriptors contain details the COMPLETE footer claims were not truncated');
  assert(summary.requiredProbeEndMarker === REQUIRED_END, 'Runner required END marker differs');
  return {
    runId: summary.runId,
    calls: Number(calls),
    completed: Number(completed),
    false: Number(falseCount),
    truthy: Number(truthyCount),
    samples: Number(samples),
    scope: 'INITIAL-CALL-WINDOW',
    callWindow: Number(callWindow),
    completionStatus: 'WINDOW-COMPLETE',
    targetRestoreStatus,
    mainRestoreStatus,
  };
}

// Descriptor parsing already validates shapes; this pass collects the report's
// explicit loss markers so they cannot contradict detail-truncated=NIL.
function inspectDescriptorTruncation(value) {
  if (Array.isArray(value)) {
    if (isKeyword(value[0], 'INTEGER') && value.length === 6 && isTrue(value[5])) return true;
    if (isKeyword(value[0], 'SYMBOL') && isTrue(value[4])) return true;
    if (isKeyword(value[0], 'STRING') && isTrue(value[5])) return true;
    if (isKeyword(value[0], 'CONS') && isKeyword(value[3], 'CONTENTS')) return true;
    if (isKeyword(value[0], 'CONS') && value.some(item => isKeyword(item, 'MORE-THAN-8-CELLS'))) return true;
    return value.some(inspectDescriptorTruncation);
  }
  return false;
}

function validateSummary(summary, request, probeBytes, runnerBytes, summaryPath, reportPath) {
  keysEqual(summary, [
    'runId', 'mode', 'smallImage', 'preSceneProbeSha256', 'probeOutputNames',
    'preSceneProbePauseSeconds', 'requiredProbeOutputName', 'requiredProbeEndMarker',
    'probeCompletionSatisfied', 'runnerSha256', 'complete', 'startedAt', 'finishedAt',
    'installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'aa0Sha256', 'sceneReportSha256',
  ], 'Runner summary');
  assert(typeof summary.runId === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(summary.runId),
    'Runner summary runId is malformed');
  assert(summary.mode === 'seed-1234' && typeof summary.smallImage === 'boolean',
    'Runner summary must be for seed-1234 mode');
  assert(summary.complete === true && summary.probeCompletionSatisfied === true,
    'Runner summary does not report a complete required-probe run');
  assert(summary.requiredProbeOutputName === REPORT_NAME && summary.requiredProbeEndMarker === REQUIRED_END,
    'Runner summary required output or END marker differs');
  assert(Array.isArray(summary.probeOutputNames) && summary.probeOutputNames.length === EXPECTED_OUTPUT_NAMES.length
    && EXPECTED_OUTPUT_NAMES.every(name => summary.probeOutputNames.includes(name))
    && new Set(summary.probeOutputNames).size === EXPECTED_OUTPUT_NAMES.length,
  'Runner summary probe output names differ');
  assert(Number.isInteger(summary.preSceneProbePauseSeconds) && summary.preSceneProbePauseSeconds >= 0
    && summary.preSceneProbePauseSeconds <= 300, 'Runner summary probe pause is malformed');
  for (const [label, value] of [
    ['preSceneProbeSha256', summary.preSceneProbeSha256], ['runnerSha256', summary.runnerSha256],
    ['installerSha256', summary.installerSha256], ['registryPatchSha256', summary.registryPatchSha256],
    ['licensePatchSha256', summary.licensePatchSha256], ['aa0Sha256', summary.aa0Sha256],
    ['sceneReportSha256', summary.sceneReportSha256],
  ]) assert(typeof value === 'string' && HASH_RE.test(value), `Runner summary ${label} is malformed`);
  for (const label of ['startedAt', 'finishedAt']) {
    assert(typeof summary[label] === 'string' && Number.isFinite(Date.parse(summary[label])),
      `Runner summary ${label} is malformed`);
  }
  assert(Date.parse(summary.finishedAt) >= Date.parse(summary.startedAt), 'Runner summary timestamps are reversed');

  keysEqual(request, [
    'schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256', 'pauseSeconds', 'releaseFile',
    'probeOutputNames', 'requiredProbeOutputName', 'requiredProbeEndMarker', 'runnerSha256',
  ], 'Probe request');
  assert(request.schemaVersion === 1 && request.runId === summary.runId
    && request.probeSha256 === summary.preSceneProbeSha256
    && request.pauseSeconds === summary.preSceneProbePauseSeconds
    && request.requiredProbeOutputName === REPORT_NAME
    && request.requiredProbeEndMarker === REQUIRED_END
    && request.runnerSha256 === summary.runnerSha256,
  'Runner probe request and summary differ');
  assert(Array.isArray(request.probeOutputNames) && request.probeOutputNames.length === EXPECTED_OUTPUT_NAMES.length
    && EXPECTED_OUTPUT_NAMES.every(name => request.probeOutputNames.includes(name)),
  'Runner probe request output names differ');
  assert(typeof request.runtimeExecutable === 'string' && /(?:^|[\\/])AARON\.exe$/i.test(request.runtimeExecutable),
    'Runner probe request runtimeExecutable is malformed');
  assert(request.releaseFile === 'C:\\temp\\aaron-native-code-release.txt',
    'Runner probe request releaseFile differs');

  const runnerPath = fileURLToPath(new URL('../oracle/run-local-scene-state-required-probe.ps1', import.meta.url));
  const actualRunnerHash = sha256(runnerBytes);
  assert(summary.runnerSha256 === actualRunnerHash, 'Runner summary hash does not match the runner source');
  const actualProbeHash = sha256(probeBytes);
  assert(summary.preSceneProbeSha256 === actualProbeHash, 'Runner summary probe hash does not match captured probe bytes');
  const intendedProbePath = fileURLToPath(new URL('../introspection/in-sub-frame-initial-window-v2.cl', import.meta.url));
  const intendedProbeBytes = readFileSync(intendedProbePath);
  assert(probeBytes.equals(intendedProbeBytes), 'Archived probe source differs from the reviewed v2 source');
  const summaryDirectory = dirname(resolve(summaryPath));
  const expectedReportPath = resolve(summaryDirectory, 'capture', REPORT_NAME);
  assert(resolve(reportPath).toLowerCase() === expectedReportPath.toLowerCase(),
    `Report path must be the runner-captured ${REPORT_NAME}`);
  assert(basename(resolve(summaryPath)).toLowerCase() === 'summary.json', 'Runner summary input must be named summary.json');
  const expectedRuntimePath = resolve(summaryDirectory, 'runtime', 'AARON.exe');
  assert(resolve(request.runtimeExecutable).toLowerCase() === expectedRuntimePath.toLowerCase(),
    'Runner probe request runtimeExecutable is not the executable under this run root');
  const runtimeExecutableSha256 = sha256(readFileSync(expectedRuntimePath));
  const manifestPath = fileURLToPath(new URL('../extracted/aaron/manifest.json', import.meta.url));
  const manifestBytes = readFileSync(manifestPath);
  const manifest = parseJson(manifestBytes, 'Extracted runtime manifest');
  assert(Array.isArray(manifest.files), 'Extracted runtime manifest has no files list');
  assert(typeof manifest.source?.sha256 === 'string' && HASH_RE.test(manifest.source.sha256),
    'Extracted runtime manifest has no valid installer hash');
  assert(summary.installerSha256 === manifest.source.sha256,
    'Runner installer hash differs from the extracted runtime manifest');
  const runtimeEntry = manifest.files.find(entry => entry?.installedName === 'AARON.exe');
  assert(runtimeEntry && typeof runtimeEntry.sha256 === 'string'
    && HASH_RE.test(runtimeEntry.sha256) && Number.isInteger(runtimeEntry.bytes),
  'Extracted runtime manifest has no valid AARON.exe entry');
  const sourceRuntimePath = fileURLToPath(new URL('../extracted/aaron/application/AARON.exe', import.meta.url));
  const sourceRuntimeSha256 = sha256(readFileSync(sourceRuntimePath));
  assert(sourceRuntimeSha256 === runtimeEntry.sha256 && runtimeExecutableSha256 === runtimeEntry.sha256,
    'Run executable, extracted AARON.exe, and manifest hash differ');
  assert(readFileSync(expectedRuntimePath).length === runtimeEntry.bytes,
    'Run executable size differs from the extracted runtime manifest');
  const captureDirectory = resolve(summaryDirectory, 'capture');
  const capturedHashes = {
    registryPatchSha256: sha256(readFileSync(resolve(summaryDirectory, 'runtime', 'registry.dll'))),
    licensePatchSha256: sha256(readFileSync(resolve(summaryDirectory, 'runtime', 'license.dll'))),
    aa0Sha256: sha256(readFileSync(resolve(captureDirectory, 'aa0'))),
    sceneReportSha256: sha256(readFileSync(resolve(captureDirectory, 'aaron-scene-state-snapshot.txt'))),
  };
  for (const [label, actual] of Object.entries(capturedHashes)) {
    assert(summary[label] === actual, `Runner summary ${label} does not match the captured file`);
  }
  return {
    actualRunnerHash,
    actualProbeHash,
    runtimeExecutableSha256,
    manifestSha256: sha256(manifestBytes),
    capturedHashes,
    runnerPath,
  };
}

export function validateInSubFrameInitialWindow({ reportBytes, summaryBytes, requestBytes, probeBytes, runnerBytes, summaryPath, reportPath }) {
  assert(Buffer.isBuffer(reportBytes) && Buffer.isBuffer(summaryBytes) && Buffer.isBuffer(requestBytes)
    && Buffer.isBuffer(probeBytes) && Buffer.isBuffer(runnerBytes), 'All artifact inputs must be byte buffers');
  const summary = parseJson(summaryBytes, 'Runner summary');
  const request = parseJson(requestBytes, 'Probe request');
  const { actualRunnerHash, actualProbeHash, runtimeExecutableSha256, manifestSha256, capturedHashes } =
    validateSummary(summary, request, probeBytes, runnerBytes, summaryPath, reportPath);
  const reportResult = parseAndValidateReport(reportBytes, summary);
  const reportHash = sha256(reportBytes);
  const summaryHash = sha256(summaryBytes);
  const binding = {
    schemaVersion: 1,
    runId: summary.runId,
    reportName: REPORT_NAME,
    reportSha256: reportHash,
    summarySha256: summaryHash,
    probeSha256: actualProbeHash,
    runnerSha256: actualRunnerHash,
    runtimeExecutableSha256,
    manifestSha256,
    ...capturedHashes,
  };
  const bindingSha256 = sha256(Buffer.from(JSON.stringify(binding), 'utf8'));
  return { accepted: true, ...reportResult, ...binding, bindingSha256 };
}

function main(argv) {
  const [reportPathArg, summaryPathArg, ...extra] = argv;
  if (!reportPathArg || !summaryPathArg || extra.length) {
    fail('Usage: node research/tools/validate-in-sub-frame-initial-window-v2.mjs <capture/aaron-in-sub-frame-initial-window-v2.txt> <summary.json>');
  }
  const reportPath = resolve(reportPathArg);
  const summaryPath = resolve(summaryPathArg);
  const runDirectory = dirname(summaryPath);
  const requestPath = resolve(runDirectory, 'pre-scene-probe-request.json');
  const probePath = resolve(runDirectory, 'capture', STAGED_PROBE_NAME);
  const runnerPath = fileURLToPath(new URL('../oracle/run-local-scene-state-required-probe.ps1', import.meta.url));
  const result = validateInSubFrameInitialWindow({
    reportBytes: readFileSync(reportPath),
    summaryBytes: readFileSync(summaryPath),
    requestBytes: readFileSync(requestPath),
    probeBytes: readFileSync(probePath),
    runnerBytes: readFileSync(runnerPath),
    summaryPath,
    reportPath,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`Validation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
