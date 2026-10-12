#!/usr/bin/env node
// Offline, source-bound derivation for a complete natural BRUSH-FILL row/iris tape.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { parseSceneStateReport } from './parse-scene-state-report.mjs';
import { sha256 } from './index-allegro-image.mjs';
import { deriveReaPayloadAnalysisEvidence } from './derive-rea-payload-analysis-evidence.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL_ROOT = resolve(ROOT, 'research/extracted/local-oracle');
const OUTPUT_ROOT = resolve(ROOT, 'research/artifacts/brush-fill-row-iris');
const MANIFEST_PATH = 'research/extracted/aaron/manifest.json';
const RUNNER_PATH = 'research/oracle/run-local-scene-state-required-probe.ps1';
const PROBE_PATH = 'research/introspection/brush-fill-row-iris-capture-v1.cl';
const FROZEN_PROBE_BYTES = 23185;
const FROZEN_PROBE_SHA256 = '05f07d8312561ef7dd19641d4b0b3fb11105ac066ade801e15e3ddd2fb5b7bc8';
const PROBE_OUTPUT = 'aaron-brush-fill-row-iris.txt';
const END_MARKER = 'END brush-fill-row-iris-v1';
const REA_EVIDENCE_PATH = 'research/introspection/evidence/rea-payload-analysis-20261012.json';
const REA_DERIVER_PATH = 'research/tools/derive-rea-payload-analysis-evidence.mjs';
const PATCH_SCRIPTS = [
  'research/tools/patch-registry-running.ps1',
  'research/tools/patch-license-user-registry.ps1',
];
const TARGETS = [
  'BRUSH-FILL', 'FILL-IRIS', 'CFRAME', 'SCAN-ROW', 'PATCH-EDGE',
  'MY-FILL', 'SELECT-BRUSH', 'IDLIST', 'CFORM-COUNT', 'MAIN',
];
const STATEFUL_TARGETS = new Set(['FILL-IRIS', 'MY-FILL', 'SELECT-BRUSH', 'CFORM-COUNT']);
const RESTORE_ORDER = [...TARGETS.filter((name) => name !== 'MAIN').reverse(), 'MAIN'];
const APPLICATION_NAMES = [
  'AARON_ScreenSaver.scr', 'AARON.dxl', 'AARON.exe', 'AARON.pll',
  'acl5016.dll', 'ktiCompress.dll', 'license.dll', 'mfc42.dll',
  'msvcirt.dll', 'registry.dll', 'upload.dll', 'UserDocumentation.html',
];
const COMMON_STAGED = [
  ['planning-call-trace.cl', 'research/introspection/planning-call-trace.cl'],
  ['planning-random-seed-common.cl', 'research/oracle/planning-random-seed-common.cl'],
  ['scene-state-snapshot.cl', 'research/introspection/scene-state-snapshot.cl'],
  ['scene-state-snapshot-seeded-1234.cl', 'research/introspection/scene-state-snapshot-seeded-1234.cl'],
];
const MODES = Object.freeze({
  'writer-stream-seed-1234': {
    sceneSource: 'scene-state-snapshot-writer-stream-seeded-1234.cl',
    staged: [
      ['scene-state-snapshot-writer-seeded-1234.cl', 'research/introspection/scene-state-snapshot-writer-seeded-1234.cl'],
      ['scene-state-snapshot-writer-stream-seeded-1234.cl', 'research/introspection/scene-state-snapshot-writer-stream-seeded-1234.cl'],
    ],
  },
  'natural-free-path-seed-5678': {
    sceneSource: 'scene-state-snapshot-natural-free-path-seeded-5678.cl',
    staged: [
      ['scene-state-snapshot-natural-free-path-seeded-5678.cl', 'research/introspection/scene-state-snapshot-natural-free-path-seeded-5678.cl'],
      ['aaron-natural-free-path-capture.cl', 'research/introspection/natural-free-path-capture.cl'],
    ],
  },
});
const CAPS = Object.freeze({ parents: 500, calls: 150000, objects: 30000, values: 64, listItems: 1024, listDepth: 6 });
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const sha = (bytes) => sha256(bytes);
const portable = (path) => path.replaceAll('\\', '/');
const isWithin = (parent, candidate) => {
  const part = relative(parent, candidate);
  return part !== '' && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
};
const sources = new Map();

function sourceRead(path, label = path) {
  const absolute = resolve(ROOT, path);
  assert(isWithin(ROOT, absolute), label + ' escapes the checkout');
  const bytes = readFileSync(absolute);
  const rel = portable(relative(ROOT, absolute));
  const row = { path: rel, sha256: sha(bytes), bytes: bytes.length };
  const previous = sources.get(rel);
  assert(!previous || same(previous.row, row), label + ' changed during derivation');
  sources.set(rel, { absolute, row });
  return bytes;
}

function captureRead(root, path, label) {
  const absolute = resolve(root, path);
  assert(isWithin(LOCAL_ROOT, absolute), label + ' escapes the local-oracle archive');
  return sourceRead(absolute, label);
}

function parseJson(bytes, label) {
  const utf16le = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  const encoding = utf16le ? 'utf16le' : 'utf8';
  if (utf16le) assert(bytes.length % 2 === 0, label + ' has an odd-length UTF-16LE byte stream');
  const text = bytes.toString(encoding);
  assert(Buffer.from(text, encoding).equals(bytes), label + ' is not round-trip ' + encoding);
  try { return JSON.parse(text.replace(/^\uFEFF/u, '')); }
  catch (error) { throw new Error(label + ' is not valid JSON: ' + error.message); }
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key)), label + ' fields differ');
  return value;
}

function lispFields(line, recordName, expected, label) {
  const fields = parseLispRecord(line, recordName);
  return exactKeys(fields, expected, label);
}

function list(value, label) {
  assert(value === null || Array.isArray(value), label + ' must be a list or NIL');
  return value ?? [];
}

function lispString(value, label) {
  assert(value?.kind === 'string', label + ' must be a Lisp string');
  return value.value;
}

function lispKeyword(value, label) {
  assert(value?.kind === 'keyword', label + ' must be a Lisp keyword');
  return value.name;
}

function lispInteger(value, label, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  assert(value?.kind === 'number' && /^[+-]?\d+$/u.test(value.raw)
    && Number.isSafeInteger(value.value) && value.value >= minimum && value.value <= maximum,
  label + ' must be a bounded Lisp integer');
  return value.value;
}

function bool(value, label) {
  assert(value === true || value === null, label + ' must be T or NIL');
  return value === true;
}

function plist(value, expected, label) {
  const items = list(value, label);
  assert(items.length % 2 === 0, label + ' is an odd-length plist');
  const result = Object.create(null);
  for (let i = 0; i < items.length; i += 2) {
    const key = lispKeyword(items[i], label + ' key');
    assert(!Object.hasOwn(result, key), label + ' has duplicate :' + key);
    result[key] = items[i + 1];
  }
  return exactKeys(result, expected, label);
}

function typedDatum(value, depth = 0) {
  assert(depth <= CAPS.listDepth, 'Typed value exceeds the observed list-depth cap');
  assert(Array.isArray(value) && value.length >= 1 && value[0]?.kind === 'keyword',
    'Typed datum must begin with a tag keyword');
  const tag = value[0].name;
  if (tag === 'NIL') {
    assert(value.length === 1, 'NIL datum has extra fields');
    return { kind: 'nil' };
  }
  if (tag === 'NUMBER') {
    assert(value.length === 3, 'NUMBER datum fields differ');
    const type = lispString(value[1], 'NUMBER type');
    assert(value[2]?.kind === 'number', 'NUMBER payload is not a Lisp number');
    return { kind: 'number', type, raw: value[2].raw, value: value[2].value };
  }
  if (tag === 'SYMBOL') {
    assert(value.length === 3, 'SYMBOL datum fields differ');
    return { kind: 'symbol', package: lispString(value[1], 'SYMBOL package'), name: lispString(value[2], 'SYMBOL name') };
  }
  if (tag === 'STRING') {
    assert(value.length === 2, 'STRING datum fields differ');
    return { kind: 'string', value: lispString(value[1], 'STRING payload') };
  }
  if (tag === 'LIST') {
    const p = plist(value.slice(1), ['ITEMS', 'SHOWN', 'PROPER', 'TRUNCATED', 'TAIL'], 'LIST datum');
    const items = list(p.ITEMS, 'LIST items');
    const shown = lispInteger(p.SHOWN, 'LIST shown count', 0, CAPS.listItems);
    const proper = bool(p.PROPER, 'LIST proper flag');
    const truncated = bool(p.TRUNCATED, 'LIST truncated flag');
    assert(!truncated && shown === items.length, 'Nested Lisp list is truncated or item-count inconsistent');
    const tailItems = list(p.TAIL, 'LIST tail');
    let tail;
    if (tailItems.length === 1 && tailItems[0]?.kind === 'keyword' && tailItems[0].name === 'TRUNCATED') {
      tail = { kind: 'sentinel', value: 'truncated' };
    } else if (tailItems.length === 1 && tailItems[0]?.kind === 'keyword' && tailItems[0].name === 'NIL') {
      tail = { kind: 'nil' };
    } else tail = typedDatum(p.TAIL, depth + 1);
    assert(proper && tail.kind === 'nil', 'Nested Lisp list is improper or has a non-NIL tail');
    return { kind: 'list', items: items.map((item) => typedDatum(item, depth + 1)),
      shown, proper, truncated, tail };
  }
  if (tag === 'ARRAY') {
    const p = plist(value.slice(1), ['EQ', 'TYPE', 'RANK', 'DIMS'], 'ARRAY datum');
    const dims = list(p.DIMS, 'ARRAY dimensions').map((item) => lispInteger(item, 'ARRAY dimension', 0));
    const rank = lispInteger(p.RANK, 'ARRAY rank', 0, CAPS.listItems);
    assert(rank === dims.length, 'ARRAY rank and dimensions disagree');
    return { kind: 'array', eq: lispInteger(p.EQ, 'ARRAY EQ id', 1, CAPS.objects),
      type: lispString(p.TYPE, 'ARRAY type'), rank, dims };
  }
  if (tag === 'OBJECT') {
    const raw = value.slice(1);
    const hasOpaqueContents = raw.some((item) => item?.kind === 'keyword' && item.name === 'CONTENTS');
    const p = plist(raw, hasOpaqueContents ? ['EQ', 'TYPE', 'CONTENTS'] : ['EQ', 'TYPE'], 'OBJECT datum');
    const opaqueContents = hasOpaqueContents && lispKeyword(p.CONTENTS, 'OBJECT contents') === 'OMITTED';
    if (hasOpaqueContents) assert(opaqueContents, 'OBJECT contents marker differs');
    return { kind: 'object', eq: lispInteger(p.EQ, 'OBJECT EQ id', 1, CAPS.objects),
      type: lispString(p.TYPE, 'OBJECT type'), ...(opaqueContents ? { contentsOmitted: true } : {}) };
  }
  throw new Error('Unsupported typed datum tag :' + tag);
}

function valueSummary(value, label) {
  const p = plist(value, ['ITEMS', 'COUNT', 'TRUNCATED'], label);
  const raw = list(p.ITEMS, label + ' items');
  const count = lispInteger(p.COUNT, label + ' count', 0, CAPS.values);
  const truncated = bool(p.TRUNCATED, label + ' truncation flag');
  assert(!truncated && count === raw.length, label + ' is truncated or item-count inconsistent');
  return raw.map((item) => typedDatum(item));
}

function parseEqObject(value, label) {
  const p = plist(value, ['EQ', 'TYPE'], label);
  return { eq: lispInteger(p.EQ, label + ' EQ id', 1, CAPS.objects), type: lispString(p.TYPE, label + ' type') };
}

function parseNullableEq(value, label) {
  const items = list(value, label);
  if (items.length === 1 && items[0]?.kind === 'keyword' && items[0].name === 'NIL') return null;
  return parseEqObject(value, label);
}

function assertIdentityMatchesDatum(identity, datum, label) {
  if (identity === null) {
    assert(datum === undefined || datum?.kind === 'nil', label + ' identity is NIL but its generic datum is not NIL');
    return;
  }
  assert(datum !== undefined && datum?.kind !== 'nil', label + ' identity is non-NIL but its generic datum is NIL or absent');
  if (datum.kind === 'object' || datum.kind === 'array') {
    assert(datum.eq === identity.eq && datum.type === identity.type,
      label + ' EQ identity/type differs between context and generic datum');
  } else if (datum.kind === 'number') {
    assert(datum.type === identity.type, label + ' type differs between context and generic numeric datum');
  } else if (datum.kind === 'symbol') {
    assert(identity.type.toUpperCase() === 'SYMBOL', label + ' type differs between context and generic symbol datum');
  } else if (datum.kind === 'string') {
    assert(identity.type.toUpperCase().includes('STRING'), label + ' type differs between context and generic string datum');
  } else {
    throw new Error(label + ' generic datum cannot be reconciled with an object identity');
  }
}

function assertSameIdentity(left, right, label) {
  assert((left?.eq ?? 0) === (right?.eq ?? 0) && (left?.type ?? null) === (right?.type ?? null),
    label + ' identity differs');
}

function parseFrameInfo(value, label) {
  if (value === null || (Array.isArray(value) && value.length === 1 && value[0]?.kind === 'keyword' && value[0].name === 'NIL')) return null;
  const p = plist(value, ['EQ', 'TYPE', 'LY', 'TY'], label);
  return { eq: lispInteger(p.EQ, label + ' EQ id', 1, CAPS.objects), type: lispString(p.TYPE, label + ' type'),
    ly: parseSlot(p.LY, label + ' LY'), ty: parseSlot(p.TY, label + ' TY') };
}

function parseSlot(value, label) {
  const items = list(value, label);
  assert(items.length >= 1 && items[0]?.kind === 'keyword', label + ' slot summary has no tag');
  const tag = items[0].name;
  if (tag === 'INTEGER') {
    assert(items.length === 2, label + ' INTEGER slot shape differs');
    return { kind: 'integer', value: lispInteger(items[1], label + ' slot value') };
  }
  if (tag === 'UNBOUND' || tag === 'MISSING') {
    assert(items.length === 1, label + ' slot marker has extra fields');
    return { kind: tag.toLowerCase() };
  }
  if (tag === 'NON-INTEGER') {
    assert(items.length === 2, label + ' NON-INTEGER slot shape differs');
    return { kind: 'non-integer', value: typedDatum(items[1]) };
  }
  throw new Error(label + ' slot summary is unsupported');
}

function parsePointInfo(value, label) {
  if (value === null || (Array.isArray(value) && value.length === 1 && value[0]?.kind === 'keyword' && value[0].name === 'NIL')) return null;
  const p = plist(value, ['EQ', 'TYPE', 'X', 'Y', 'Z'], label);
  return { eq: lispInteger(p.EQ, label + ' EQ id', 1, CAPS.objects), type: lispString(p.TYPE, label + ' type'),
    x: parseSlot(p.X, label + ' X'), y: parseSlot(p.Y, label + ' Y'), z: parseSlot(p.Z, label + ' Z') };
}

function bindingRows(value, label, kind) {
  const raw = list(value, label);
  const seen = new Set();
  return raw.map((entry, index) => {
    assert(Array.isArray(entry) && (entry.length === 2 || entry.length === 3), label + ' entry ' + index + ' shape differs');
    const name = lispString(entry[0], label + ' entry name');
    assert(name.length > 0 && !seen.has(name), label + ' name is empty or repeated');
    seen.add(name);
    const status = lispKeyword(entry[1], label + ' status');
    assert(['BOUND', 'UNBOUND', 'MISSING'].includes(status), label + ' status is unsupported');
    assert(entry.length === (status === 'BOUND' ? 3 : 2), label + ' status/value shape differs');
    let valueSummary;
    if (status === 'BOUND') {
      valueSummary = typedDatum(entry[2]);
      if (kind === 'map') {
        if (valueSummary.kind === 'array') assert(valueSummary.rank === 2, label + ' ' + name + ' is not rank 2');
        else assert(valueSummary.kind !== 'list', label + ' ' + name + ' contents were unexpectedly traversed');
      }
    }
    return { name, status: status.toLowerCase(), ...(status === 'BOUND' ? { value: valueSummary } : {}) };
  });
}

function stateSummary(value, name) {
  const sentinel = list(value, name + ' state sentinel');
  if (sentinel.length === 1 && sentinel[0]?.kind === 'keyword' && sentinel[0].name === 'NONE') {
    assert(!STATEFUL_TARGETS.has(name), name + ' is missing its required state summary');
    return null;
  }
  if (name === 'FILL-IRIS') {
    const p = plist(value, ['GLOBALS', 'MAPS'], 'FILL-IRIS state');
    const globals = bindingRows(p.GLOBALS, 'FILL-IRIS globals', 'global');
    const maps = bindingRows(p.MAPS, 'FILL-IRIS maps', 'map');
    assert(same(globals.map((row) => row.name), ['SUBP-COUNT', 'CFORM-COUNT', 'BRUSH', 'HEAD-DONE'])
      && same(maps.map((row) => row.name), ['FILL-MAP', 'PATCH-MAP']),
    'FILL-IRIS state binding set or order differs');
    return { globals, maps };
  }
  if (name === 'MY-FILL' || name === 'SELECT-BRUSH' || name === 'CFORM-COUNT') {
    const p = plist(value, ['GLOBALS'], name + ' state');
    const globals = bindingRows(p.GLOBALS, name + ' globals', 'global');
    assert(same(globals.map((row) => row.name), ['SUBP-COUNT', 'CFORM-COUNT', 'BRUSH', 'HEAD-DONE']),
      name + ' global binding set or order differs');
    return { globals };
  }
  throw new Error(name + ' unexpectedly reports state data');
}

function parseContext(value, name, phase, call) {
  if (name === 'BRUSH-FILL') {
    const p = plist(value, ['FILL-ORDINAL'], name + ' ' + phase + ' context');
    const fillOrdinal = lispInteger(p['FILL-ORDINAL'], name + ' fill ordinal', 1);
    assert(fillOrdinal === call.ordinal, 'BRUSH-FILL context ordinal differs from its CALL ordinal');
    return { fillOrdinal };
  }
  if (name === 'FILL-IRIS' || name === 'MY-FILL' || name === 'SELECT-BRUSH' || name === 'CFORM-COUNT') {
    const p = plist(value, ['FILL-ORDINAL'], name + ' ' + phase + ' context');
    const fillOrdinal = lispInteger(p['FILL-ORDINAL'], name + ' context fill ordinal', 0);
    assert(fillOrdinal === call.fill, name + ' context fill ordinal differs from CALL.fill');
    return { fillOrdinal };
  }
  if (name === 'CFRAME') {
    if (phase === 'entry') {
      const p = plist(value, ['FORM'], name + ' entry context');
      const form = parseNullableEq(p.FORM, 'CFRAME entry form');
      assertIdentityMatchesDatum(form, call.args[0], 'CFRAME entry FORM/args[0]');
      return { form };
    }
    const p = plist(value, ['FORM', 'FRAME', 'CFRAME-ID'], name + ' return context');
    const form = parseNullableEq(p.FORM, 'CFRAME returned form');
    const frame = parseFrameInfo(p.FRAME, 'CFRAME returned frame');
    const cframeId = lispInteger(p['CFRAME-ID'], 'CFRAME context call id', 1, CAPS.calls);
    assert(cframeId === call.id, 'CFRAME return context references a different call');
    assertSameIdentity(form, call.before.context.form, 'CFRAME returned form identity differs from entry');
    assertIdentityMatchesDatum(form, call.args[0], 'CFRAME returned FORM/args[0]');
    assertIdentityMatchesDatum(frame, call.values[0], 'CFRAME returned FRAME/values[0]');
    return { form, frame, cframeId };
  }
  if (name === 'SCAN-ROW') {
    if (phase === 'entry') {
      const p = plist(value, ['CFRAME', 'SCAN-ORDINAL'], 'SCAN-ROW entry context');
      const frame = plist(p.CFRAME, ['CFRAME-ID', 'FORM-EQ', 'FRAME-EQ'], 'SCAN-ROW current CFRAME context');
      return { cframeId: lispInteger(frame['CFRAME-ID'], 'SCAN-ROW CFRAME id', 0, CAPS.calls),
        formEq: lispInteger(frame['FORM-EQ'], 'SCAN-ROW form EQ id', 0, CAPS.objects),
        frameEq: lispInteger(frame['FRAME-EQ'], 'SCAN-ROW frame EQ id', 0, CAPS.objects),
        scanOrdinal: lispInteger(p['SCAN-ORDINAL'], 'SCAN-ROW ordinal', 1) };
    }
    const p = plist(value, ['CFRAME', 'SCAN-ORDINAL', 'POINT'], 'SCAN-ROW return context');
    const frame = plist(p.CFRAME, ['CFRAME-ID', 'FORM-EQ', 'FRAME-EQ'], 'SCAN-ROW returned CFRAME context');
    return { cframeId: lispInteger(frame['CFRAME-ID'], 'SCAN-ROW return CFRAME id', 0, CAPS.calls),
      formEq: lispInteger(frame['FORM-EQ'], 'SCAN-ROW returned form EQ id', 0, CAPS.objects),
      frameEq: lispInteger(frame['FRAME-EQ'], 'SCAN-ROW returned frame EQ id', 0, CAPS.objects),
      scanOrdinal: lispInteger(p['SCAN-ORDINAL'], 'SCAN-ROW returned ordinal', 1),
      point: parsePointInfo(p.POINT, 'SCAN-ROW returned point') };
  }
  if (name === 'PATCH-EDGE') {
    const p = plist(value, ['START', 'SCAN-LINKS'], 'PATCH-EDGE ' + phase + ' context');
    const links = list(p['SCAN-LINKS'], 'PATCH-EDGE scan links').map((entry, index) => {
      const link = plist(entry, ['SCAN-CALL-ID', 'SCAN-ORDINAL', 'POINT-EQ'], 'PATCH-EDGE scan link ' + index);
      return { scanCallId: lispInteger(link['SCAN-CALL-ID'], 'PATCH-EDGE linked scan id', 1, CAPS.calls),
        scanOrdinal: lispInteger(link['SCAN-ORDINAL'], 'PATCH-EDGE linked ordinal', 1),
        pointEq: lispInteger(link['POINT-EQ'], 'PATCH-EDGE linked point EQ id', 1, CAPS.objects) };
    });
    assert(links.length <= CAPS.listItems, 'PATCH-EDGE scan-link list exceeds its capture cap');
    const start = parseNullableEq(p.START, 'PATCH-EDGE start identity');
    assertIdentityMatchesDatum(start, call.args[0], 'PATCH-EDGE START/args[0]');
    return { start, scanLinks: links };
  }
  if (name === 'IDLIST') {
    const p = plist(value, ['FORM'], 'IDLIST ' + phase + ' context');
    const form = parseNullableEq(p.FORM, 'IDLIST form');
    assertIdentityMatchesDatum(form, call.args[0], 'IDLIST FORM/args[0]');
    if (phase === 'return') {
      assertSameIdentity(form, call.before.context.form, 'IDLIST returned form identity differs from entry');
    }
    return { form };
  }
  const p = plist(value, ['FILL-ORDINAL'], name + ' ' + phase + ' context');
  const fillOrdinal = lispInteger(p['FILL-ORDINAL'], name + ' context fill ordinal', 0);
  assert(fillOrdinal === call.fill, name + ' context fill ordinal differs from CALL.fill');
  return { fillOrdinal };
}

function rngCheck(value, label) {
  const p = plist(value, ['BEFORE', 'AFTER', 'STABLE'], label + ' copied RNG check');
  const preview = (v, name) => {
    const datum = typedDatum(v);
    assert(datum.kind === 'list' && datum.proper && !datum.truncated && datum.tail.kind === 'nil'
      && datum.items.length === 6, label + ' RNG ' + name + ' preview shape differs');
    const expectedNames = ['RANDOM-100-1', 'RANDOM-100-2', 'RANDOM-100-3'];
    for (let index = 0; index < expectedNames.length; index += 1) {
      const symbol = datum.items[index * 2];
      const draw = datum.items[index * 2 + 1];
      assert(symbol.kind === 'symbol' && symbol.package === 'KEYWORD' && symbol.name === expectedNames[index],
        label + ' RNG ' + name + ' preview label differs at draw ' + index);
      assert(draw.kind === 'number' && Number.isSafeInteger(draw.value) && draw.value >= 0 && draw.value <= 99,
        label + ' RNG ' + name + ' preview draw is outside 0..99');
    }
    return datum;
  };
  const before = preview(p.BEFORE, 'before');
  const after = preview(p.AFTER, 'after');
  const stable = bool(p.STABLE, label + ' RNG stable flag');
  assert(stable && same(before, after), label + ' copied RNG previews differ or were marked unstable');
  return { stable: true, beforeSha256: sha(Buffer.from(JSON.stringify(before))),
    afterSha256: sha(Buffer.from(JSON.stringify(after))) };
}

function idListSummary(resultValue, values, label) {
  const p = plist(resultValue, ['ITEMS', 'COUNT', 'PROPER', 'TRUNCATED', 'TAIL'], label + ' IDLIST result');
  const raw = list(p.ITEMS, label + ' IDLIST items');
  const items = raw.map((item) => typedDatum(item));
  const count = lispInteger(p.COUNT, label + ' IDLIST item count', 0, CAPS.listItems);
  const proper = bool(p.PROPER, label + ' IDLIST proper flag');
  const truncated = bool(p.TRUNCATED, label + ' IDLIST truncated flag');
  const tailItems = list(p.TAIL, label + ' IDLIST tail');
  assert(tailItems.length === 1 && tailItems[0]?.kind === 'keyword' && tailItems[0].name === 'NIL',
    label + ' IDLIST tail is not NIL');
  assert(proper && !truncated && count === items.length, label + ' IDLIST is incomplete or improper');
  assert(values.length === 1, label + ' IDLIST did not return exactly one value');
  const value = values[0];
  assert((value.kind === 'nil' && count === 0)
    || (value.kind === 'object' && value.type === 'CONS' && value.contentsOmitted === true),
  label + ' IDLIST generic return is not NIL or an opaque CONS summary');
  for (const [index, item] of items.entries()) assertCompleteTypedLists(item, label + ' IDLIST item ' + index);
  return { items, count, proper, truncated: false, tail: { kind: 'nil' } };
}

function assertCompleteTypedLists(value, label) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertCompleteTypedLists(item, label);
    return;
  }
  if (value.kind === 'list') {
    assert(value.proper && !value.truncated, label + ' contains an improper or truncated nested list');
    for (const item of value.items) assertCompleteTypedLists(item, label);
    assertCompleteTypedLists(value.tail, label);
  }
}

function observationSummary(value, name, phase, call, rng, label) {
  const p = plist(value, ['STATE', 'CONTEXT'], name + ' ' + phase + ' observation');
  return { state: stateSummary(p.STATE, name), context: parseContext(p.CONTEXT, name, phase, call), rng };
}

function parseCaps(line) {
  const match = /^CAPS parents=(\d+) calls=(\d+) objects=(\d+) values=(\d+) list-items=(\d+) list-depth=(\d+)$/u.exec(line);
  assert(match, 'CAPS record differs');
  const actual = { parents: Number(match[1]), calls: Number(match[2]), objects: Number(match[3]),
    values: Number(match[4]), listItems: Number(match[5]), listDepth: Number(match[6]) };
  assert(same(actual, CAPS), 'CAPS values differ from the frozen observer protocol');
  return actual;
}

function validateTapeMapDimensions(calls, dimensions, runId) {
  const expected = dimensions?.dims;
  assert(Array.isArray(expected) && same(expected, [768, 1080]),
    runId + ' parsed scene does not provide the current map dimensions');
  for (const call of calls.filter((row) => row.name === 'FILL-IRIS')) {
    for (const phase of ['before', 'after']) {
      for (const map of call[phase].state?.maps ?? []) {
        if (map.status === 'bound' && map.value?.kind === 'array') {
          assert(same(map.value.dims, expected),
            runId + ' ' + phase + ' ' + map.name + ' dimensions differ from parsed scene metadata');
        }
      }
    }
  }
}

function parseCaptureTape(bytes, runId, dimensions) {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), runId + ' observer tape is not round-trip UTF-8');
  assert(bytes.length <= 256 * 1024 * 1024, runId + ' observer tape exceeds the byte cap');
  const lines = text.replace(/^\uFEFF/u, '').split(/\r?\n/u);
  while (lines.at(-1) === '') lines.pop();
  const rawLineCount = lines.length;
  assert(lines.shift() === 'BEGIN brush-fill-row-iris v1', runId + ' observer BEGIN differs');
  const caps = parseCaps(lines.shift() ?? '');
  const installed = [];
  for (const expectedName of TARGETS) {
    const line = lines.shift();
    assert(line?.startsWith('INSTALL '), 'Missing INSTALL for ' + expectedName);
    const fields = lispFields(line, 'INSTALL', ['name', 'status'], 'INSTALL ' + expectedName);
    assert(lispString(fields.name, 'INSTALL name') === expectedName
      && lispKeyword(fields.status, 'INSTALL status') === 'OK',
    'INSTALL order/name differs at ' + expectedName);
    installed.push(expectedName);
  }
  assert(lines.shift() === 'READY', 'Missing observer READY');
  assert(lines.at(-1) === END_MARKER, runId + ' observer END marker differs');
  lines.pop();

  const calls = [], stack = [], restores = [], totals = Object.create(null), overflows = [];
  let complete = null, phase = 'events', eventOrdinal = 0, completeLineIndex = -1;
  const countByName = Object.fromEntries(TARGETS.map((name) => [name, { calls: 0, returns: 0, aborts: 0 }]));
  for (const [lineIndex, line] of lines.entries()) {
    const location = runId + ' observer line ' + (lineIndex + TARGETS.length + 4);
    assert(line.length > 0, location + ' is blank');
    if (phase === 'events' && line.startsWith('CALL ')) {
      const f = lispFields(line, 'CALL', ['id', 'parent', 'fill', 'ordinal', 'name', 'args', 'before', 'rng'], location + ' CALL');
      const id = lispInteger(f.id, location + ' call id', 1, CAPS.calls);
      const parent = lispInteger(f.parent, location + ' parent id', 0, CAPS.calls);
      const fill = lispInteger(f.fill, location + ' fill ordinal', 0);
      const ordinal = lispInteger(f.ordinal, location + ' target ordinal', 1);
      const name = lispString(f.name, location + ' function name');
      assert(TARGETS.includes(name) && id === calls.length + 1, location + ' CALL name/id sequence differs');
      assert(ordinal === countByName[name].calls + 1, location + ' target ordinal is not monotone');
      assert(parent === (stack.at(-1)?.id ?? 0), location + ' immediate wrapped parent id differs');
      const activeFill = name === 'BRUSH-FILL' ? ordinal : (stack.findLast((item) => item.name === 'BRUSH-FILL')?.ordinal ?? 0);
      assert(fill === activeFill, location + ' active BRUSH-FILL ordinal differs');
      const call = { id, parent, fill, ordinal, name, entryEvent: ++eventOrdinal,
        fillCallId: name === 'BRUSH-FILL' ? id : (stack.findLast((item) => item.name === 'BRUSH-FILL')?.id ?? 0),
        args: valueSummary(f.args, location + ' arguments'), before: null, values: null,
        after: null, idlist: null, returnEvent: null };
      const rng = rngCheck(f.rng, location + ' CALL');
      call.before = observationSummary(f.before, name, 'entry', call, rng, location);
      if (name === 'SCAN-ROW') {
        assert(call.args.length === 4 && call.args.every((item) => item.kind === 'number'
          && Number.isSafeInteger(item.value) && /^[+-]?\d+$/u.test(item.raw)),
          location + ' SCAN-ROW argument signature differs');
      }
      calls.push(call);
      stack.push(call);
      countByName[name].calls += 1;
      continue;
    }
    if (phase === 'events' && line.startsWith('RETURN ')) {
      const raw = parseLispRecord(line, 'RETURN');
      const name = lispString(raw.name, location + ' RETURN name');
      const fields = name === 'IDLIST'
        ? ['id', 'name', 'values', 'idlist', 'after', 'rng']
        : ['id', 'name', 'values', 'after', 'rng'];
      const f = exactKeys(raw, fields, location + ' RETURN');
      const id = lispInteger(f.id, location + ' return id', 1, CAPS.calls);
      const call = stack.pop();
      assert(call && call.id === id && call.name === name, location + ' RETURN does not match top open CALL');
      call.values = valueSummary(f.values, location + ' return values');
      if (name === 'IDLIST') call.idlist = idListSummary(f.idlist, call.values, location);
      const rng = rngCheck(f.rng, location + ' RETURN');
      call.after = observationSummary(f.after, call.name, 'return', call, rng, location);
      if (name === 'SCAN-ROW') {
        assertIdentityMatchesDatum(call.after.context.point, call.values[0],
          location + ' SCAN-ROW POINT/values[0]');
      }
      call.returnEvent = ++eventOrdinal;
      countByName[call.name].returns += 1;
      continue;
    }
    if (phase === 'events' && line.startsWith('ABORT ')) {
      const f = lispFields(line, 'ABORT', ['id', 'name', 'fill'], location + ' ABORT');
      const call = stack.pop();
      const id = lispInteger(f.id, location + ' abort id', 1, CAPS.calls);
      const name = lispString(f.name, location + ' abort name');
      const fill = lispInteger(f.fill, location + ' abort fill', 0);
      assert(call && call.id === id && call.name === name && call.fill === fill,
        location + ' ABORT does not match top open CALL');
      call.aborted = true;
      call.returnEvent = ++eventOrdinal;
      countByName[name].aborts += 1;
      continue;
    }
    if (phase === 'events' && line.startsWith('OVERFLOW ')) {
      const f = lispFields(line, 'OVERFLOW', ['kind', 'detail'], location + ' OVERFLOW');
      overflows.push(lispKeyword(f.kind, location + ' overflow kind'));
      continue;
    }
    if (phase === 'events' && line.startsWith('OBSERVATION-ERROR ')) {
      const f = lispFields(line, 'OBSERVATION-ERROR', ['id', 'name', 'phase', 'reason'], location);
      throw new Error(location + ' reports an observation error: ' + lispString(f.name, 'error target'));
    }
    if (phase === 'events' && line.startsWith('SETUP-ERROR ')) {
      const f = lispFields(line, 'SETUP-ERROR', ['reason'], location);
      throw new Error(location + ' reports setup error: ' + lispKeyword(f.reason, 'setup error reason'));
    }
    if (phase === 'events' && line.startsWith('RESTORE ')) phase = 'restores';
    if (phase === 'restores' && line.startsWith('RESTORE ')) {
      const f = lispFields(line, 'RESTORE', ['name', 'status'], location + ' RESTORE');
      const name = lispString(f.name, location + ' restore name');
      const status = lispKeyword(f.status, location + ' restore status');
      restores.push({ name, status: status.toLowerCase() });
      continue;
    }
    if (phase === 'restores' && line.startsWith('TOTAL ')) phase = 'totals';
    if (phase === 'totals' && line.startsWith('TOTAL ')) {
      const f = lispFields(line, 'TOTAL', ['name', 'calls', 'returns', 'aborts'], location + ' TOTAL');
      const name = lispString(f.name, location + ' total name');
      assert(name === TARGETS[Object.keys(totals).length], location + ' TOTAL order differs');
      totals[name] = { calls: lispInteger(f.calls, location + ' total calls', 0, CAPS.calls),
        returns: lispInteger(f.returns, location + ' total returns', 0, CAPS.calls),
        aborts: lispInteger(f.aborts, location + ' total aborts', 0, CAPS.calls) };
      continue;
    }
    if (phase === 'totals' && line.startsWith('COMPLETE ')) {
      const f = lispFields(line, 'COMPLETE', ['main', 'parents', 'calls', 'returns', 'objects', 'records',
        'errors', 'aborts', 'overflow', 'depth', 'busy'], location + ' COMPLETE');
      const mainValue = f.main;
      const main = mainValue?.kind === 'symbol' ? mainValue.name.toLowerCase()
        : mainValue?.kind === 'keyword' ? mainValue.name.toLowerCase() : '';
      assert(main.length > 0, location + ' MAIN completion status is not a symbol');
      complete = { main, parents: lispInteger(f.parents, location + ' parent count', 0, CAPS.parents),
        calls: lispInteger(f.calls, location + ' call count', 0, CAPS.calls),
        returns: lispInteger(f.returns, location + ' return count', 0, CAPS.calls),
        objects: lispInteger(f.objects, location + ' object count', 0, CAPS.objects),
        records: lispInteger(f.records, location + ' record count', 0),
        errors: lispInteger(f.errors, location + ' error count', 0),
        aborts: lispInteger(f.aborts, location + ' abort count', 0, CAPS.calls),
        overflow: bool(f.overflow, location + ' overflow flag'),
        depth: lispInteger(f.depth, location + ' final depth', 0, CAPS.calls),
        busy: lispInteger(f.busy, location + ' final busy count', 0, CAPS.calls) };
      completeLineIndex = lineIndex;
      phase = 'complete';
      continue;
    }
    throw new Error(location + ' has an unexpected record or ordering');
  }
  assert(phase === 'complete' && complete, runId + ' observer COMPLETE is missing');
  assert(stack.length === 0, runId + ' observer has open calls at completion');
  assert(restores.length === RESTORE_ORDER.length
    && restores.every((row, index) => row.name === RESTORE_ORDER[index]
      && ['restored', 'changed'].includes(row.status)),
  runId + ' observer restoration list/status differs');
  assert(Object.keys(totals).length === TARGETS.length, runId + ' observer per-target totals are incomplete');
  for (const name of TARGETS) {
    assert(same(totals[name], countByName[name]), runId + ' observer total differs for ' + name);
  }
  const returned = calls.filter((call) => call.returnEvent !== null && !call.aborted).length;
  const aborted = calls.filter((call) => call.aborted).length;
  const parentCount = calls.filter((call) => call.name === 'BRUSH-FILL').length;
  assert(complete.records === rawLineCount && completeLineIndex >= 0,
    runId + ' COMPLETE record counter differs from the full tape line count');
  assert(complete.main === 'normal' && complete.parents === parentCount
    && complete.calls === calls.length && complete.returns === returned
    && complete.errors === 0 && complete.aborts === 0 && aborted === 0
    && complete.overflow === false && overflows.length === 0 && complete.depth === 0 && complete.busy === 0,
  runId + ' observer completion counters or exit state differ');
  assert(countByName.MAIN.calls === 1 && countByName.MAIN.returns === 1,
    runId + ' observer did not capture one normal MAIN completion');
  validateTapeMapDimensions(calls, dimensions, runId);
  for (const call of calls) {
    assert(call.returnEvent !== null && !call.aborted, runId + ' has an incomplete call ' + call.id);
    if (call.name === 'SCAN-ROW') {
      assert(call.before.context.scanOrdinal === call.after.context.scanOrdinal
        && call.before.context.cframeId === call.after.context.cframeId
        && call.before.context.formEq === call.after.context.formEq
        && call.before.context.frameEq === call.after.context.frameEq,
        runId + ' SCAN-ROW entry/return ordinal differs');
    }
    if (call.name === 'IDLIST') assert(call.idlist?.proper === true, runId + ' IDLIST did not capture a complete proper list');
  }
  validateScanFrameContexts(calls, runId);
  validatePatchScanLinks(calls, runId);
  const objectIds = collectObjectIds(calls);
  assert(objectIds.size === complete.objects
    && (complete.objects === 0 || Math.max(...objectIds) === complete.objects),
  runId + ' COMPLETE object count differs from captured EQ identity table');
  return { caps, installed, calls, restores, totals, complete, overflows,
    rngChecks: calls.length * 2, byteCount: bytes.length, sha256: sha(bytes), lineCount: rawLineCount };
}

function collectObjectIds(value, result = new Set()) {
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value)) {
    for (const item of value) collectObjectIds(item, result);
    return result;
  }
  for (const [key, item] of Object.entries(value)) {
    if (['eq', 'formEq', 'frameEq', 'pointEq'].includes(key)
        && Number.isSafeInteger(item) && item > 0) result.add(item);
    collectObjectIds(item, result);
  }
  return result;
}

function validateScanFrameContexts(calls, runId) {
  const frames = new Map(calls.filter((call) => call.name === 'CFRAME').map((call) => [call.id, call]));
  for (const scan of calls.filter((call) => call.name === 'SCAN-ROW')) {
    const context = scan.before.context;
    const cframe = frames.get(context.cframeId);
    if (context.cframeId === 0) {
      assert(context.formEq === 0 && context.frameEq === 0 && !cframe,
        runId + ' SCAN-ROW zero CFRAME sentinel is inconsistent');
    } else {
      assert(cframe && cframe.returnEvent < scan.entryEvent && cframe.fillCallId === scan.fillCallId,
        runId + ' SCAN-ROW does not reference an earlier same-fill CFRAME return');
      assert((cframe.after.context.form?.eq ?? 0) === context.formEq
        && (cframe.after.context.frame?.eq ?? 0) === context.frameEq,
      runId + ' SCAN-ROW form/frame EQ IDs differ from its referenced CFRAME return');
    }
  }
}

function validatePatchScanLinks(calls, runId) {
  for (const patch of calls.filter((call) => call.name === 'PATCH-EDGE')) {
    const validateContext = (context, beforeEvent, label) => {
      const start = context.start;
      const expected = calls.filter((scan) => scan.name === 'SCAN-ROW'
        && scan.fillCallId === patch.fillCallId && scan.returnEvent < beforeEvent
        && start && scan.after.context.point?.eq === start.eq)
        .sort((a, b) => a.returnEvent - b.returnEvent);
      const actual = context.scanLinks;
      assert(actual.length === expected.length,
        runId + ' PATCH-EDGE ' + label + ' scan-link count differs from earlier EQ matches');
      for (const [index, link] of actual.entries()) {
        const scan = expected[index];
        assert(link.scanCallId === scan.id && link.scanOrdinal === scan.ordinal
          && link.pointEq === scan.after.context.point.eq,
        runId + ' PATCH-EDGE ' + label + ' scan link differs from earlier same-fill EQ match');
      }
    };
    validateContext(patch.before.context, patch.entryEvent, 'entry');
    validateContext(patch.after.context, patch.returnEvent, 'return');
    assert(patch.before.context.start?.eq === patch.after.context.start?.eq,
      runId + ' PATCH-EDGE start EQ identity changed across the call');
  }
}

function trackedInputs() {
  sourceRead(PROBE_PATH, 'current BRUSH-FILL observer');
  const runnerBytes = sourceRead(RUNNER_PATH, 'current local scene runner');
  const sceneParserBytes = sourceRead('research/tools/parse-scene-state-report.mjs', 'scene report parser');
  sourceRead('research/tools/parse-natural-free-path-report.mjs', 'non-evaluating Lisp parser');
  sourceRead('research/tools/index-allegro-image.mjs', 'hash helper');
  sourceRead('research/tools/derive-brush-fill-row-iris-evidence.mjs', 'this evidence deriver');
  const patchScriptHashes = PATCH_SCRIPTS.map((path) => {
    const bytes = sourceRead(path, 'current DLL patcher ' + path);
    return { path, sha256: sha(bytes), bytes: bytes.length };
  });
  const manifestBytes = sourceRead(MANIFEST_PATH, 'setup manifest');
  const manifest = parseJson(manifestBytes, 'setup manifest');
  assert(manifest.source && Array.isArray(manifest.files) && manifest.files.length === APPLICATION_NAMES.length,
    'Setup manifest does not bind exactly 12 application files');
  const names = manifest.files.map((entry) => entry?.installedName);
  assert(same([...names].sort(), [...APPLICATION_NAMES].sort()), 'Setup manifest 12-file set differs');
  const originalFiles = manifest.files.map((entry) => {
    assert(entry && Number.isSafeInteger(entry.bytes) && entry.bytes > 0
      && typeof entry.sha256 === 'string' && /^[0-9a-f]{64}$/u.test(entry.sha256),
    'Setup manifest entry shape differs');
    const bytes = sourceRead('research/extracted/aaron/application/' + entry.installedName,
      'current extracted original ' + entry.installedName);
    assert(bytes.length === entry.bytes && sha(bytes) === entry.sha256,
      'Extracted original differs from manifest: ' + entry.installedName);
    return { name: entry.installedName, bytes: bytes.length, sha256: entry.sha256 };
  });
  sourceRead(REA_EVIDENCE_PATH, 'published REA analysis');
  sourceRead(REA_DERIVER_PATH, 'REA analysis deriver');
  const sourcePairs = [...COMMON_STAGED];
  for (const mode of Object.values(MODES)) sourcePairs.push(...mode.staged);
  for (const [, path] of sourcePairs) sourceRead(path, 'current staged Lisp source ' + path);
  return { manifest, manifestSha256: sha(manifestBytes), originalFiles, patchScriptHashes,
    runnerSha256: sha(runnerBytes), sceneParserSha256: sha(sceneParserBytes) };
}

function stagedSources(runRoot, modeName, instrumented) {
  const mode = MODES[modeName];
  assert(mode, 'Unsupported captured mode: ' + modeName);
  const specs = [...COMMON_STAGED, ...mode.staged];
  const seen = new Set();
  const rows = specs.map(([filename, sourcePath]) => {
    assert(!seen.has(filename), 'Staged-source filename is duplicated: ' + filename);
    seen.add(filename);
    const current = sourceRead(sourcePath, 'current source ' + sourcePath);
    const staged = captureRead(runRoot, 'capture/' + filename, 'staged source ' + filename);
    assert(current.equals(staged), basename(runRoot) + ' staged source differs: ' + filename);
    return { filename, sourcePath, bytes: current.length, sha256: sha(current), stagedSha256: sha(staged), byteIdentical: true };
  });
  const scene = rows.find((row) => row.filename === mode.sceneSource);
  assert(scene, 'Selected scene source is not in the staged source set');
  if (!instrumented) {
    for (const path of ['capture/aaron-pre-scene-probe.cl', 'capture/aaron-probe-loader.cl',
      'runtime/aaron-probe-loader.cl']) {
      assert(!existsSync(resolve(runRoot, path)), basename(runRoot) + ' control contains probe artifact ' + path);
    }
    return { rows, scene, startupRoute: 'direct-mode-source' };
  }
  const currentProbe = sourceRead(PROBE_PATH, 'current observer source');
  const stagedProbe = captureRead(runRoot, 'capture/aaron-pre-scene-probe.cl', 'staged observer source');
  assert(currentProbe.equals(stagedProbe), basename(runRoot) + ' staged observer differs from current source');
  const loader = captureRead(runRoot, 'capture/aaron-probe-loader.cl', 'staged observer loader');
  const runtimeLoader = captureRead(runRoot, 'runtime/aaron-probe-loader.cl', 'runtime observer loader');
  const expectedLoader = Buffer.from(
    '(set \'aaron-pre-scene-probe-pause-seconds 0)\r\n' +
    '(load "C:\\\\temp\\\\aaron-pre-scene-probe.cl")\r\n' +
    '(load "C:\\\\temp\\\\' + mode.sceneSource + '")\r\n', 'utf8');
  assert(loader.equals(expectedLoader) && runtimeLoader.equals(expectedLoader),
    basename(runRoot) + ' staged/runtime loader does not load observer then selected mode source');
  for (const name of ['.clinit.cl', 'clinit.cl']) {
    const init = captureRead(runRoot, 'runtime/' + name, basename(runRoot) + ' ' + name);
    assert(init.equals(expectedLoader), basename(runRoot) + ' Lisp startup file differs from observer loader');
  }
  rows.push({ filename: 'aaron-pre-scene-probe.cl', sourcePath: PROBE_PATH, bytes: currentProbe.length,
    sha256: sha(currentProbe), stagedSha256: sha(stagedProbe), byteIdentical: true });
  return { rows, scene, probe: { bytes: currentProbe.length, sha256: sha(currentProbe), stagedSha256: sha(stagedProbe) },
    loaderSha256: sha(loader), loaderBytes: loader.length, startupRoute: 'probe-loader-then-mode-source' };
}

function reportDimensions(scene) {
  const rows = [];
  for (const snapshot of scene.snapshots ?? []) {
    assert(Array.isArray(snapshot.rows), 'Scene snapshot rows are missing');
    for (const row of snapshot.rows) if (row.name === 'FILL-MAP') rows.push(row);
  }
  assert(rows.length > 0, 'Parsed scene metadata has no FILL-MAP rows');
  const dimensions = rows.map((row) => {
    const match = /^ARRAY-RANK=2-D0=(\d+),D1=(\d+)-TOTAL=(\d+)-ELEMENT=CONS$/u.exec(row.summary ?? '');
    assert(match, 'Parsed FILL-MAP dimensions are unsupported');
    const dims = [Number(match[1]), Number(match[2])], total = Number(match[3]);
    assert(dims[0] * dims[1] === total, 'Parsed FILL-MAP dimensions/total disagree');
    return { rank: 2, dims, total, element: 'CONS' };
  });
  assert(dimensions.every((row) => same(row, dimensions[0])), 'Scene FILL-MAP dimensions vary between snapshots');
  assert(same(dimensions[0].dims, [768, 1080]), 'Capture is not in the current 768x1080 scene mode');
  return dimensions[0];
}

function coreCapture(runRoot, summary, setup, label) {
  const files = [
    ['aa0', 'capture/aa0'],
    ['scene', 'capture/aaron-scene-state-snapshot.txt'],
    ['image', 'capture/image'],
    ['imageId', 'capture/image-id'],
  ].map(([name, path]) => {
    const bytes = captureRead(runRoot, path, label + ' ' + name);
    assert(bytes.length > 0, label + ' ' + name + ' is empty');
    return [name, { bytes, sha256: sha(bytes), length: bytes.length }];
  });
  const raw = Object.fromEntries(files);
  const parsedSceneBytes = captureRead(runRoot, 'scene-state.json', label + ' parsed scene metadata');
  const parsedScene = parseJson(parsedSceneBytes, label + ' parsed scene metadata');
  assert(summary.aa0Sha256 === raw.aa0.sha256 && summary.sceneReportSha256 === raw.scene.sha256,
    label + ' summary hashes do not bind AA0 and raw scene report');
  const parsed = parseSceneStateReport(raw.scene.bytes.toString('utf8'));
  const boundParsed = { ...parsed, source: { localRunId: summary.runId, sha256: raw.scene.sha256 } };
  assert(same(parsedScene, boundParsed), label + ' parsed scene metadata does not rederive from raw report');
  assert(parsedScene.schemaVersion === 1 && parsedScene.source?.localRunId === summary.runId
    && parsedScene.source?.sha256 === raw.scene.sha256, label + ' parsed scene source binding differs');
  const dimensions = reportDimensions(parsedScene);

  const runtimeFiles = setup.manifest.files.map((entry) => {
    const original = sourceRead('research/extracted/aaron/application/' + entry.installedName,
      'current original ' + entry.installedName);
    const bytes = captureRead(runRoot, 'runtime/' + entry.installedName, label + ' runtime ' + entry.installedName);
    const patched = ['registry.dll', 'license.dll'].includes(entry.installedName.toLowerCase());
    assert(patched ? !bytes.equals(original) : bytes.equals(original),
      label + ' runtime original/patched identity differs for ' + entry.installedName);
    const row = { name: entry.installedName, bytes: bytes.length, sha256: sha(bytes),
      originalSha256: sha(original), patched };
    return { ...row, buffer: bytes };
  });
  const registry = runtimeFiles.find((row) => row.name.toLowerCase() === 'registry.dll');
  const license = runtimeFiles.find((row) => row.name.toLowerCase() === 'license.dll');
  assert(registry && license && registry.sha256 === setup.registryPatchSha256
    && license.sha256 === setup.licensePatchSha256, label + ' patched runtime DLL hashes differ from runner summary');
  for (const name of ['AARON.exe', 'AARON.pll']) {
    const row = runtimeFiles.find((item) => item.name.toLowerCase() === name.toLowerCase());
    assert(row, label + ' missing runtime ' + name);
  }
  const stderr = captureRead(runRoot, 'stderr.txt', label + ' stderr');
  assert(stderr.length === 0, label + ' runner stderr is nonempty');
  return { files: raw, parsedScene: { bytes: parsedSceneBytes.length, sha256: sha(parsedSceneBytes) },
    dimensions, runtimeFiles, stderrBytes: stderr.length, stderrSha256: sha(stderr) };
}

function rootArgument(value) {
  const absolute = resolve(ROOT, value);
  assert(isWithin(LOCAL_ROOT, absolute), 'Run root must be beneath research/extracted/local-oracle');
  return absolute;
}

function readRun(rootValue, role, setup, runnerSha256) {
  const runRoot = rootArgument(rootValue);
  const summaryBytes = captureRead(runRoot, 'summary.json', basename(runRoot) + ' summary');
  const summary = parseJson(summaryBytes, basename(runRoot) + ' summary');
  exactKeys(summary, ['runId', 'mode', 'smallImage', 'preSceneProbeSha256', 'probeOutputNames',
    'preSceneProbePauseSeconds', 'requiredProbeOutputName', 'requiredProbeEndMarker',
    'probeCompletionSatisfied', 'runnerSha256', 'complete', 'startedAt', 'finishedAt',
    'installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'aa0Sha256', 'sceneReportSha256'],
  basename(runRoot) + ' runner summary');
  const runId = basename(runRoot);
  assert(summary.runId === runId && MODES[summary.mode] && summary.complete === true
    && summary.smallImage === false && summary.preSceneProbePauseSeconds === 0,
  runId + ' runner summary is incomplete or outside the finite supported modes');
  const startedAt = Date.parse(summary.startedAt), finishedAt = Date.parse(summary.finishedAt);
  assert(Number.isFinite(startedAt) && Number.isFinite(finishedAt) && finishedAt >= startedAt,
    runId + ' runner timestamps are invalid');
  assert(typeof summary.runnerSha256 === 'string' && summary.runnerSha256 === runnerSha256,
    runId + ' does not bind the current runner source hash');
  assert(summary.installerSha256 === setup.manifest.source.sha256,
    runId + ' installer hash differs from extracted setup manifest');
  assert(/^[0-9a-f]{64}$/u.test(summary.registryPatchSha256)
    && /^[0-9a-f]{64}$/u.test(summary.licensePatchSha256),
  runId + ' patched DLL hashes are invalid');

  const instrumented = role === 'observed';
  if (instrumented) {
    assert(same(summary.probeOutputNames, [PROBE_OUTPUT]) && summary.requiredProbeOutputName === PROBE_OUTPUT
      && summary.requiredProbeEndMarker === END_MARKER && summary.probeCompletionSatisfied === true
      && typeof summary.preSceneProbeSha256 === 'string',
    runId + ' runner summary does not require the complete observer tape');
  } else {
    assert(Array.isArray(summary.probeOutputNames) && summary.probeOutputNames.length === 0
      && summary.preSceneProbeSha256 === null && summary.requiredProbeOutputName === ''
      && summary.requiredProbeEndMarker === '' && summary.probeCompletionSatisfied === true,
    runId + ' control is instrumented or did not complete its uninstrumented run');
  }
  const patchHashes = {
    registryPatchSha256: summary.registryPatchSha256.toLowerCase(),
    licensePatchSha256: summary.licensePatchSha256.toLowerCase(),
  };
  const loaded = stagedSources(runRoot, summary.mode, instrumented);
  const core = coreCapture(runRoot, summary, { ...setup, ...patchHashes }, runId);
  let request = null, tape = null;
  if (instrumented) {
    const requestBytes = captureRead(runRoot, 'pre-scene-probe-request.json', runId + ' probe request');
    request = parseJson(requestBytes, runId + ' probe request');
    exactKeys(request, ['schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256', 'pauseSeconds',
      'releaseFile', 'probeOutputNames', 'requiredProbeOutputName', 'requiredProbeEndMarker', 'runnerSha256'],
    runId + ' probe request');
    assert(request.schemaVersion === 1 && request.runId === runId && request.pauseSeconds === 0
      && request.releaseFile === 'C:\\temp\\aaron-native-code-release.txt'
      && same(request.probeOutputNames, [PROBE_OUTPUT]) && request.requiredProbeOutputName === PROBE_OUTPUT
      && request.requiredProbeEndMarker === END_MARKER && request.runnerSha256 === runnerSha256
      && request.probeSha256 === loaded.probe.sha256
      && summary.preSceneProbeSha256 === request.probeSha256,
    runId + ' probe request, source, and runner binding differs');
    const runtimeExe = resolve(runRoot, 'runtime/AARON.exe');
    assert(typeof request.runtimeExecutable === 'string'
      && resolve(request.runtimeExecutable).toLowerCase() === runtimeExe.toLowerCase(),
    runId + ' probe request runtime path differs');
    const tapeBytes = captureRead(runRoot, 'capture/' + PROBE_OUTPUT, runId + ' observer tape');
    tape = parseCaptureTape(tapeBytes, runId, core.dimensions);
    for (const path of ['capture/' + PROBE_OUTPUT, 'capture/aaron-pre-scene-probe.cl',
      'pre-scene-probe-request.json', 'capture/aaron-probe-loader.cl', 'runtime/aaron-probe-loader.cl']) {
      assert(existsSync(resolve(runRoot, path)), runId + ' is missing required observer binding ' + path);
    }
      request = { sha256: sha(requestBytes), bytes: requestBytes.length, schemaVersion: request.schemaVersion,
        runId: request.runId, probeSha256: request.probeSha256, pauseSeconds: request.pauseSeconds,
        releaseFile: request.releaseFile, probeOutputNames: request.probeOutputNames,
        requiredProbeOutputName: request.requiredProbeOutputName,
        requiredProbeEndMarker: request.requiredProbeEndMarker,
        runnerSha256: request.runnerSha256, runtimeExecutableBoundToRun: true };
  } else {
    for (const path of ['pre-scene-probe-request.json', 'capture/' + PROBE_OUTPUT]) {
      assert(!existsSync(resolve(runRoot, path)), runId + ' control unexpectedly contains ' + path);
    }
  }
  return {
    runId, path: portable(relative(ROOT, runRoot)), role, mode: summary.mode,
    summary: { sha256: sha(summaryBytes), bytes: summaryBytes.length, startedAt: summary.startedAt,
      finishedAt: summary.finishedAt, installerSha256: summary.installerSha256, ...patchHashes },
    sourceBindings: loaded.rows, startupRoute: loaded.startupRoute,
    ...(instrumented ? { probe: loaded.probe, loader: { sha256: loaded.loaderSha256, bytes: loaded.loaderBytes },
      request, tape } : {}),
    core,
    _buffers: { files: core.files, runtimeFiles: core.runtimeFiles },
    _times: { startedAt, finishedAt },
    _sceneSources: loaded.rows.filter(({ filename }) => filename !== 'aaron-pre-scene-probe.cl')
      .map(({ filename, sha256: hash, bytes }) => ({ filename, sha256: hash, bytes })),
  };
}

function compareRuns(observed, before, after) {
  assert(observed.mode === before.mode && observed.mode === after.mode,
    observed.runId + ' controls do not use the same scene mode');
  assert(before._times.finishedAt <= observed._times.startedAt
    && observed._times.finishedAt <= after._times.startedAt,
  observed.runId + ' controls do not bracket the observed run in time');
  assert(same(before._sceneSources, observed._sceneSources)
    && same(after._sceneSources, observed._sceneSources),
  observed.runId + ' current/staged mode sources differ across controls');
  for (const key of ['aa0', 'scene', 'image', 'imageId']) {
    assert(before._buffers.files[key].bytes.equals(observed._buffers.files[key].bytes)
      && after._buffers.files[key].bytes.equals(observed._buffers.files[key].bytes),
    observed.runId + ' raw ' + key + ' bytes differ from same-mode controls');
  }
  assert(before._buffers.runtimeFiles.length === observed._buffers.runtimeFiles.length
    && after._buffers.runtimeFiles.length === observed._buffers.runtimeFiles.length,
  observed.runId + ' runtime file counts differ');
  for (let index = 0; index < observed._buffers.runtimeFiles.length; index += 1) {
    const o = observed._buffers.runtimeFiles[index], b = before._buffers.runtimeFiles[index], a = after._buffers.runtimeFiles[index];
    assert(o.name === b.name && o.name === a.name && o.buffer.equals(b.buffer) && o.buffer.equals(a.buffer),
      observed.runId + ' runtime file differs from same-mode controls: ' + o.name);
  }
  assert(same(observed.core.dimensions, before.core.dimensions)
    && same(observed.core.dimensions, after.core.dimensions),
  observed.runId + ' parsed scene dimensions differ from controls');
  return {
    beforeControl: before.runId, afterControl: after.runId,
    sameMode: true, timeBracketed: true, stagedSourcesByteIdentical: true,
    aa0ByteIdentical: true, rawSceneReportByteIdentical: true,
    originalImageByteIdentical: true, imageIdByteIdentical: true,
    all12RuntimeFilesByteIdentical: true, parsedDimensionsIdentical: true,
    dimensions: observed.core.dimensions,
  };
}

function portableCore(run) {
  const core = run.core;
  return {
    files: Object.fromEntries(Object.entries(core.files).map(([name, file]) =>
      [name, { bytes: file.length, sha256: file.sha256 }])),
    parsedScene: core.parsedScene,
    dimensions: core.dimensions,
    runtimeFiles: core.runtimeFiles.map(({ buffer, ...file }) => file),
    stderr: { bytes: core.stderrBytes, sha256: core.stderrSha256 },
  };
}

function compactValue(value) {
  if (Array.isArray(value)) return value.map((item) => compactValue(item));
  if (!value || typeof value !== 'object') return value;
  if (value.kind === 'list' && Array.isArray(value.items)) {
    return {
      kind: 'list', count: value.items.length, shown: value.shown,
      proper: value.proper, truncated: value.truncated, tail: compactValue(value.tail),
      itemsSha256: sha(Buffer.from(JSON.stringify(value.items), 'utf8')),
      firstItems: value.items.slice(0, 2).map((item) => compactValue(item)),
      lastItem: value.items.length ? compactValue(value.items.at(-1)) : null,
    };
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactValue(item)]));
}

function compactDatumTuple(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.kind === 'nil') return ['nil'];
  if (value.kind === 'number') return ['number', value.type, value.raw];
  if (value.kind === 'symbol') return ['symbol', value.package, value.name];
  if (value.kind === 'string') return ['string', value.value];
  if (value.kind === 'object') return ['object', value.eq, value.type, value.contentsOmitted ?? false];
  if (value.kind === 'array') return ['array', value.eq, value.type, value.rank, value.dims];
  if (value.kind === 'list') return ['list', value.items.length, value.proper, value.truncated,
    sha(Buffer.from(JSON.stringify(value.items), 'utf8'))];
  return compactValue(value);
}

function compactSlot(slot) {
  if (!slot) return null;
  if (slot.kind === 'integer') return slot.value;
  return [slot.kind, ...(Object.hasOwn(slot, 'value') ? [compactDatumTuple(slot.value)] : [])];
}

function compactIdList(idlist) {
  if (!idlist) return null;
  return {
    count: idlist.count, proper: idlist.proper, truncated: idlist.truncated, tail: idlist.tail,
    itemsSha256: sha(Buffer.from(JSON.stringify(idlist.items), 'utf8')),
    firstItems: idlist.items.slice(0, 2), lastItem: idlist.items.at(-1) ?? null,
  };
}

function callReference(call) {
  return compactValue({ id: call.id, name: call.name, parent: call.parent, fill: call.fill, ordinal: call.ordinal,
    entryEvent: call.entryEvent, returnEvent: call.returnEvent, args: call.args, values: call.values,
    ...(call.name === 'IDLIST' ? { idlist: compactIdList(call.idlist) } : {}),
    before: call.before, after: call.after });
}

function globalBinding(state, name) {
  const binding = state?.globals?.find((row) => row.name === name);
  return binding ?? null;
}

function nearestReference(call) {
  if (!call) return null;
  return [call.id, call.ordinal, call.entryEvent, call.returnEvent];
}

function nearestEvents(calls, scan) {
  const names = ['CFRAME', 'FILL-IRIS', 'MY-FILL', 'SELECT-BRUSH', 'IDLIST', 'CFORM-COUNT'];
  const result = [];
  for (const name of names) {
    const rows = calls.filter((call) => call.fillCallId === scan.fillCallId && call.name === name);
    const previous = name === 'CFRAME'
      ? rows.find((call) => call.id === scan.before.context.cframeId) ?? null
      : rows.filter((call) => call.returnEvent < scan.entryEvent)
        .sort((left, right) => right.returnEvent - left.returnEvent)[0] ?? null;
    const next = rows.filter((call) => call.entryEvent > scan.entryEvent)
      .sort((left, right) => left.entryEvent - right.entryEvent)[0] ?? null;
    result.push([name, nearestReference(previous), nearestReference(next)]);
  }
  return result;
}

function slotInteger(slot) {
  return slot?.kind === 'integer' ? slot.value : null;
}

function scanRowY(call) {
  const value = call.args[2];
  assert(value?.kind === 'number' && Number.isSafeInteger(value.value) && /^[+-]?\d+$/u.test(value.raw),
    'SCAN-ROW Y argument is not a safe captured integer');
  return value.value;
}

// Compact evidence tuple layouts:
// scan=[id,ordinal,entry,return,Y,cframeId,formEQ,frameEQ,[frameEQ,LY,TY],point]
// positive=[scanId,matchingPatchIds,laterMatchingIds,noMatch,nearestByTarget]
// nearestByTarget=[[target,previousRef,nextRef],...], ref=[id,ordinal,entry,return]
// patch=[id,ordinal,entry,return,start,scanLinks], IDLIST=[id,entry,return,count]
// CFORM-COUNT=[id,entry,return,values]. Keep these aligned with the findings doc.
function deriveFillObservations(parsed, runId) {
  const calls = parsed.calls;
  const fillCalls = calls.filter((call) => call.name === 'BRUSH-FILL');
  const fills = fillCalls.map((fillCall) => {
    const children = calls.filter((call) => call.fillCallId === fillCall.id && call.id !== fillCall.id)
      .sort((a, b) => a.entryEvent - b.entryEvent);
    const counts = Object.fromEntries(TARGETS.filter((name) => name !== 'BRUSH-FILL' && name !== 'MAIN')
      .map((name) => [name, children.filter((call) => call.name === name).length]));
    const scans = children.filter((call) => call.name === 'SCAN-ROW');
    const patches = children.filter((call) => call.name === 'PATCH-EDGE');
    const cframes = new Map(children.filter((call) => call.name === 'CFRAME').map((call) => [call.id, call]));
    const scanFrame = (scan) => scan.before.context.cframeId > 0
      ? cframes.get(scan.before.context.cframeId)?.after.context.frame ?? null : null;
    const transitions = [];
    for (let index = 1; index < scans.length; index += 1) {
      const previous = scans[index - 1], current = scans[index];
      const fromY = scanRowY(previous), toY = scanRowY(current);
      const previousFrame = scanFrame(previous), frame = scanFrame(current);
      const previousLY = slotInteger(previousFrame?.ly), frameLY = slotInteger(frame?.ly), frameTY = slotInteger(frame?.ty);
      transitions.push({ previousScan: previous.id, scan: current.id, fromY, toY, delta: toY - fromY,
        previousCframeId: previous.before.context.cframeId,
        cframeId: current.before.context.cframeId,
        previousFrameLY: previousLY, frameLY, frameTY,
        toYMinusFrameLY: frameLY === null ? null : toY - frameLY });
    }
    const positiveScans = scans.filter((scan) => scan.after.context.point !== null).map((scan) => {
      const point = scan.after.context.point;
      const matchingPatches = patches.filter((patch) => patch.before.context.start?.eq === point.eq);
      const laterMatchingPatches = matchingPatches.filter((patch) => patch.entryEvent > scan.returnEvent);
      return [scan.id, matchingPatches.map((patch) => patch.id),
        laterMatchingPatches.map((patch) => patch.id), matchingPatches.length === 0,
        nearestEvents(children, scan)];
    });
    const rowJumps = transitions.filter((row) => row.delta !== -1);
    const irisCalls = children.filter((call) => call.name === 'FILL-IRIS').map(callReference);
    const idListCalls = children.filter((call) => call.name === 'IDLIST');
    const cformCountCalls = children.filter((call) => call.name === 'CFORM-COUNT');
    const scanRows = scans.map((scan) => {
      const frame = scanFrame(scan);
      const compactPoint = scan.after.context.point;
      return [scan.id, scan.ordinal, scan.entryEvent, scan.returnEvent, scanRowY(scan),
        scan.before.context.cframeId, scan.before.context.formEq, scan.before.context.frameEq,
        frame ? [frame.eq, compactSlot(frame.ly), compactSlot(frame.ty)] : null,
        compactPoint ? [compactPoint.eq, compactPoint.type, compactSlot(compactPoint.x),
          compactSlot(compactPoint.y), compactSlot(compactPoint.z)] : null];
    });
    const idListEventRows = idListCalls.map((call) => [call.id, call.entryEvent,
      call.returnEvent, call.idlist.count]);
    const cformCountEventRows = cformCountCalls.map((call) => [call.id,
      call.entryEvent, call.returnEvent, call.values.map(compactDatumTuple)]);
    const fillDecisionCalls = children.filter((call) => call.name === 'MY-FILL' || call.name === 'SELECT-BRUSH')
      .map((call) => [call.name, call.id, call.ordinal, call.entryEvent, call.returnEvent,
        compactValue(call.args), call.values.map(compactDatumTuple),
        ['SUBP-COUNT', 'CFORM-COUNT', 'BRUSH', 'HEAD-DONE'].map((name) => globalBinding(call.before.state, name)),
        ['SUBP-COUNT', 'CFORM-COUNT', 'BRUSH', 'HEAD-DONE'].map((name) => globalBinding(call.after.state, name))]);
    return {
      fill: fillCall.ordinal, fillCallId: fillCall.id,
      wrappedParent: fillCall.parent === 0 ? null : {
        id: fillCall.parent, name: calls[fillCall.parent - 1]?.name ?? null,
        note: 'Immediate wrapper-stack parent only; it does not establish an unwrapped native caller.',
      },
      args: compactValue(fillCall.args), values: compactValue(fillCall.values),
      nestedCallCounts: counts, scanCount: scans.length, patchEdgeCount: patches.length,
      scans: scanRows,
      nonUnitScanRowDifferences: rowJumps.map((row) => [row.previousScan, row.scan, row.fromY, row.toY,
        row.delta, row.previousFrameLY, row.frameLY, row.frameTY, row.toYMinusFrameLY]),
      positiveScans, fillIrisCalls: irisCalls, fillDecisionCalls,
      idListCallCount: idListCalls.length, cformCountCallCount: cformCountCalls.length,
      idListCallRows: idListEventRows, cformCountCallRows: cformCountEventRows,
      patchEdges: patches.map((patch) => [patch.id, patch.ordinal, patch.entryEvent, patch.returnEvent,
        patch.before.context.start, patch.before.context.scanLinks]),
    };
  });
  const totals = Object.fromEntries(TARGETS.map((name) => [name, parsed.totals[name]]));
  return { parentCount: parsed.complete.parents, fillCount: fillCalls.length, fills, totals,
    calls: calls.length, returnedCalls: parsed.complete.returns, runId };
}

function trackedSourceRows() {
  const rows = [...sources.values()].map((item) => item.row)
    .sort((left, right) => left.path.localeCompare(right.path));
  for (const row of rows) {
    const bytes = readFileSync(resolve(ROOT, row.path));
    assert(bytes.length === row.bytes && sha(bytes) === row.sha256, 'Source changed before evidence freeze: ' + row.path);
  }
  return rows;
}

async function verifyReaEvidence() {
  const storedBytes = sourceRead(REA_EVIDENCE_PATH, 'published REA analysis');
  const stored = parseJson(storedBytes, 'published REA analysis');
  const derived = await deriveReaPayloadAnalysisEvidence();
  const canonical = Buffer.from(JSON.stringify(derived, null, 2) + '\n', 'utf8');
  assert(canonical.equals(storedBytes), 'Published REA analysis differs from current offline derivation');
  assert(Array.isArray(stored.sourceHashes) && stored.sourceHashes.length === 70,
    'Published REA analysis must revalidate exactly 70 source bindings');
  assert(derived.sourceHashes.length === 70, 'Current REA derivation source closure is not 70 files');
  return { path: REA_EVIDENCE_PATH, sha256: sha(storedBytes), bytes: storedBytes.length,
    sourceCount: stored.sourceHashes.length, sourceHashes: stored.sourceHashes,
    sourceClosureRevalidated: true,
    currentDerivationByteIdentical: true, functions: stored.functions.map((fn) => fn.name),
    limitations: stored.scope };
}

function parseCli(args) {
  const captures = [];
  let index = 0;
  while (args[index] === '--capture') {
    assert(args.length >= index + 4, 'Each --capture requires observed, preceding control, and following control roots');
    captures.push({ observed: args[index + 1], before: args[index + 2], after: args[index + 3] });
    index += 4;
  }
  assert(captures.length === 1 || captures.length === 2, 'Provide one or two --capture groups');
  assert(args[index] === '--output' && args[index + 1] && index + 2 === args.length,
    'Usage: node research/tools/derive-brush-fill-row-iris-evidence.mjs --capture <observed> <before-control> <after-control> [--capture <observed> <before-control> <after-control>] --output <fresh-ignored-json>');
  return { captures, output: args[index + 1] };
}

function validateOutputPath(value) {
  const output = resolve(ROOT, value);
  assert(isWithin(OUTPUT_ROOT, output), 'Output must be under research/artifacts/brush-fill-row-iris');
  assert(existsSync(dirname(output)) && !existsSync(output), 'Output parent must exist and output must be fresh');
  const ignoreBytes = sourceRead('.gitignore', 'repository ignore rules for the evidence output');
  const ignoreRules = ignoreBytes.toString('utf8').split(/\r?\n/u).map((rule) => rule.trim());
  assert(ignoreRules.includes('/research/artifacts/'),
    'Repository ignore rules do not exclude research/artifacts');
  assert(!ignoreRules.some((rule) => /^!\/?research\/artifacts(?:\/|$)/u.test(rule)),
    'Repository ignore rules contain an artifact-path exception');
  return output;
}

async function derive(captureSpecs) {
  const setup = trackedInputs();
  const observerBytes = sourceRead(PROBE_PATH, 'frozen current observer source');
  const observerSha = sha(observerBytes);
  assert(observerBytes.length === FROZEN_PROBE_BYTES && observerSha === FROZEN_PROBE_SHA256,
    'Current BRUSH-FILL observer differs from its frozen source pin');
  const runnerSha = setup.runnerSha256;
  const result = [];
  const usedRunIds = new Set();
  for (const spec of captureSpecs) {
    const observed = readRun(spec.observed, 'observed', setup, runnerSha);
    const before = readRun(spec.before, 'control', setup, runnerSha);
    const after = readRun(spec.after, 'control', setup, runnerSha);
    for (const run of [observed, before, after]) {
      assert(!usedRunIds.has(run.runId), 'A run root is reused across capture groups: ' + run.runId);
      usedRunIds.add(run.runId);
      assert(run.mode === observed.mode, 'Capture/control mode mismatch: ' + run.runId);
    }
    assert(observed.probe.sha256 === observerSha && observed.probe.stagedSha256 === observerSha,
      observed.runId + ' probe does not bind the current observer');
    const parity = compareRuns(observed, before, after);
    const observations = deriveFillObservations(observed.tape, observed.runId);
    result.push({ mode: observed.mode, dimensions: observed.core.dimensions,
      observed: { runId: observed.runId, path: observed.path, summary: observed.summary,
        request: observed.request, probe: observed.probe, loader: observed.loader,
        capture: portableCore(observed),
        sourceBindings: observed.sourceBindings, tape: { sha256: observed.tape.sha256,
          bytes: observed.tape.byteCount, lineCount: observed.tape.lineCount,
          caps: observed.tape.caps, installs: observed.tape.installed,
          restores: observed.tape.restores, complete: observed.tape.complete,
          totals: observed.tape.totals } },
      controls: [before, after].map((run) => ({ runId: run.runId, path: run.path,
        summary: run.summary, capture: portableCore(run), sourceBindings: run.sourceBindings })),
      parity, observations });
  }
  const reaEvidence = await verifyReaEvidence();
  const sourceHashes = trackedSourceRows();
  return {
    schemaVersion: 1,
    investigation: 'source-bound-natural-brush-fill-row-iris-observations-20261012',
    scope: { capturedRuns: result.length, currentDimensions: [768, 1080],
      finiteCapturedModes: result.map((run) => run.mode),
      naturalOracleCapture: true, probeTapeComplete: true, directNativeCallerRecovered: false,
      generalizedRowScheduleRecovered: false, fillIrisBranchConditionRecovered: false,
      completeMapCellSnapshotsRetained: false, runtimeInputsBeyondCapturedModesValidated: false },
    reaStaticAnalysis: reaEvidence,
    setup: { manifestPath: MANIFEST_PATH, manifestSha256: setup.manifestSha256,
      installerSha256: setup.manifest.source.sha256, originalFiles: setup.originalFiles,
      patchScripts: setup.patchScriptHashes, runnerPath: RUNNER_PATH, runnerSha256: setup.runnerSha256 },
    observerSource: { path: PROBE_PATH, sha256: observerSha, bytes: observerBytes.length,
      outputName: PROBE_OUTPUT, endMarker: END_MARKER },
    captures: result,
    limitations: [
      'This portable record is limited to the captured current 768x1080 modes and their bracketed uninstrumented controls.',
      'CALL parent IDs describe the observer wrapper stack. Their order does not establish a direct native or Lisp caller.',
      'EQ links are checked only among the observer-captured SCAN-ROW returns and PATCH-EDGE starts in the same BRUSH-FILL group.',
      'PATCH-EDGE multiple-value summaries retain outer count/order and typed top-level identity; cons contents are deliberately omitted, so the tape does not describe complete path geometry.',
      'SCAN-ROW row differences and nearby CFRAME, FILL-IRIS, MY-FILL, SELECT-BRUSH, IDLIST, and CFORM-COUNT records are chronological observations, not recovered branch conditions or causal proofs.',
      'Map records preserve sampled identity, rank, and dimensions; the observer does not serialize full map contents.',
      'The REA evidence is static payload analysis and does not establish original Lisp source, native Lisp ABI, or runtime control flow.',
    ],
    sourceHashes,
  };
}

async function main() {
  const { captures, output: outputArgument } = parseCli(process.argv.slice(2));
  sources.clear();
  const output = validateOutputPath(outputArgument);
  const evidence = await derive(captures);
  const bytes = Buffer.from(JSON.stringify(evidence) + '\n', 'utf8');
  writeFileSync(output, bytes, { flag: 'wx' });
  process.stdout.write(JSON.stringify({ output: portable(relative(ROOT, output)), sha256: sha(bytes),
    bytes: bytes.length, captures: evidence.captures.length, sourceCount: evidence.sourceHashes.length,
    reaSourceCount: evidence.reaStaticAnalysis.sourceCount }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
}
