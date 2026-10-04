#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { sha256 } from './index-allegro-image.mjs';

const TARGETS = ['BRUSH-FILL', 'SCAN-ROW', 'LIST-FRAME', 'MY-FILL',
  'FILL-IRIS', 'SELECT-BRUSH', 'BRUSH-FILL-SUBPART', 'RECORD-BRUSH'];
const MAX_CAPS = { calls: 50000, listItems: 128, listDepth: 3, values: 16 };
const keyword = (value) => value?.kind === 'keyword' ? value.name : null;

function exactKeys(object, required, label) {
  const expected = new Set(required);
  for (const key of required) {
    if (!Object.hasOwn(object, key)) throw new Error(`${label} missing ${key}`);
  }
  for (const key of Object.keys(object)) {
    if (!expected.has(key)) throw new Error(`${label} has unsupported ${key}`);
  }
}

function record(line, name, keys) {
  const fields = parseLispRecord(line, name);
  exactKeys(fields, keys, `${name} record`);
  return fields;
}

function number(value) {
  if (value?.kind !== 'number' || !Number.isFinite(value.value)) {
    throw new Error('Expected a finite number');
  }
  return value.value;
}

function integer(value) {
  if (value?.kind !== 'number' || !/^[+-]?\d+$/.test(value.raw)) {
    throw new Error('Expected raw integer syntax');
  }
  const n = number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Expected a nonnegative safe integer');
  return n;
}

function string(value) {
  if (value?.kind !== 'string') throw new Error('Expected a quoted string');
  return value.value;
}

function boolean(value) {
  if (value !== true && value !== null) throw new Error('Expected T or NIL');
  return value === true;
}

function plist(values) {
  if (!Array.isArray(values) || values.length % 2) throw new Error('Malformed property list');
  const out = Object.create(null);
  for (let i = 0; i < values.length; i += 2) {
    const key = keyword(values[i]);
    if (!key || Object.hasOwn(out, key)) throw new Error('Invalid or duplicate property');
    out[key] = values[i + 1];
  }
  return out;
}

function typedListItems(value, shown, caps, label) {
  const items = value === null ? [] : value;
  if (!Array.isArray(items)) throw new Error(`${label} items must be a list`);
  if (items.length !== shown || shown > caps.listItems) throw new Error(`${label} item count exceeds or disagrees with caps`);
  return items;
}

function datum(value, depth, caps, geometryCoverage) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Expected a typed datum');
  switch (keyword(value[0])) {
    case 'NIL':
      if (value.length !== 1) throw new Error('NIL datum has unsupported fields');
      return null;
    case 'NUMBER': {
      if (value.length !== 3) throw new Error('NUMBER datum has unsupported fields');
      const type = string(value[1]);
      const numeric = value[2];
      const n = number(numeric);
      if (!type || ((type === 'FIXNUM' || type === 'BIGNUM') && !/^[+-]?\d+$/.test(numeric.raw))) {
        throw new Error('NUMBER datum type or raw value is invalid');
      }
      return { kind: 'number', type, value: n, raw: numeric.raw };
    }
    case 'SYMBOL': {
      if (value.length !== 3) throw new Error('SYMBOL datum has unsupported fields');
      return { kind: 'symbol', package: value[1] === null ? null : string(value[1]), name: string(value[2]) };
    }
    case 'BRUSH': {
      const p = plist(value.slice(1));
      exactKeys(p, ['INDEX', 'ID'], 'BRUSH datum');
      return { kind: 'brush', index: p.INDEX === null ? null : integer(p.INDEX), id: integer(p.ID) };
    }
    case 'LIST': {
      const p = plist(value.slice(1));
      if (Object.hasOwn(p, 'OMITTED')) {
        exactKeys(p, ['OMITTED'], 'OMITTED LIST datum');
        if (p.OMITTED !== true || depth < caps.listDepth) throw new Error('OMITTED LIST datum at invalid depth');
        if (geometryCoverage) geometryCoverage.omittedLists += 1;
        return { kind: 'list', omitted: true };
      }
      exactKeys(p, ['ITEMS', 'SHOWN', 'PROPER', 'TRUNCATED'], 'LIST datum');
      const shown = integer(p.SHOWN);
      const proper = boolean(p.PROPER);
      const truncated = boolean(p.TRUNCATED);
      const items = typedListItems(p.ITEMS, shown, caps, 'LIST datum')
        .map((item) => datum(item, depth + 1, caps, geometryCoverage));
      if (truncated && (proper || shown !== caps.listItems)) throw new Error('Invalid truncated LIST summary');
      if (geometryCoverage) {
        if (truncated) geometryCoverage.truncatedLists += 1;
        if (!proper && !truncated) geometryCoverage.improperLists += 1;
      }
      return { kind: 'list', items, proper, truncated };
    }
    case 'OBJECT':
      if (value.length !== 2) throw new Error('OBJECT datum has unsupported fields');
      if (geometryCoverage) geometryCoverage.opaqueObjects += 1;
      return { kind: 'object', type: string(value[1]) };
    default:
      throw new Error('Unsupported datum or observation error');
  }
}

function values(value, version, caps, geometryCoverage = null) {
  if (version === 1) {
    if (value !== null && !Array.isArray(value)) throw new Error('Legacy values must be a list or NIL');
    const rawItems = value ?? [];
    return rawItems.map((item) => datum(item, 0, caps, geometryCoverage));
  }
  const p = plist(value);
  exactKeys(p, ['ITEMS', 'SHOWN', 'TRUNCATED'], 'Value summary');
  const truncated = boolean(p.TRUNCATED);
  const shown = integer(p.SHOWN);
  const rawItems = typedListItems(p.ITEMS, shown, { ...caps, listItems: caps.values }, 'Value summary');
  if (truncated) throw new Error('Top-level argument or return values were truncated');
  return rawItems.map((item) => datum(item, 0, caps, geometryCoverage));
}

function state(value, caps) {
  const p = plist(value);
  exactKeys(p, ['BINDINGS', 'SELECTION-KNOWN', 'BRUSH-EQ-SELECTED'], 'State');
  if (!Array.isArray(p.BINDINGS)) throw new Error('State bindings must be a list');
  const bindings = {};
  for (const item of p.BINDINGS) {
    if (!Array.isArray(item) || (item.length !== 2 && item.length !== 3)) throw new Error('Malformed binding');
    const name = string(item[0]);
    if (Object.hasOwn(bindings, name)) throw new Error('Duplicate binding');
    const status = keyword(item[1]);
    if (!['BOUND', 'UNBOUND', 'MISSING'].includes(status)
        || item.length !== (status === 'BOUND' ? 3 : 2)) throw new Error('Unexpected binding status or shape');
    bindings[name] = { status, ...(status === 'BOUND' ? { value: datum(item[2], 0, caps, null) } : {}) };
  }
  if (Object.keys(bindings).join(',') !== 'SUBP-COUNT,CFORM-COUNT,BRUSH,HEAD-DONE') {
    throw new Error('Unexpected state binding set or order');
  }
  return {
    bindings,
    selectionKnown: boolean(p['SELECTION-KNOWN']),
    brushEqSelected: boolean(p['BRUSH-EQ-SELECTED']),
  };
}

function parseCaps(line, version) {
  const fields = version === 2
    ? /^CAPS calls=(\d+) list-items=(\d+) list-depth=(\d+) values=(\d+)$/.exec(line)
    : /^CAPS calls=(\d+) list-items=(\d+) list-depth=(\d+)$/.exec(line);
  if (!fields) throw new Error(`Invalid CAPS line for protocol v${version}`);
  const caps = {
    calls: Number(fields[1]),
    listItems: Number(fields[2]),
    listDepth: Number(fields[3]),
    values: version === 2 ? Number(fields[4]) : null,
  };
  if (Object.values(caps).some((n) => n !== null && !Number.isSafeInteger(n))
      || caps.calls < 1 || caps.calls > MAX_CAPS.calls
      || caps.listItems < 1 || caps.listItems > MAX_CAPS.listItems
      || caps.listDepth < 1 || caps.listDepth > MAX_CAPS.listDepth
      || (version === 2 && (caps.values < 1 || caps.values > MAX_CAPS.values))) {
    throw new Error('CAPS values exceed supported bounds');
  }
  return caps;
}

function rejectDiagnosis(line) {
  if (/^(?:ABORT|ABORT-MAIN|OVERFLOW)(?:\s|$)/.test(line)) {
    throw new Error(`Capture contains diagnosis-only record: ${line.slice(0, 80)}`);
  }
}

export function parseBrushFillReport(text) {
  if (Buffer.byteLength(text) > 256 * 1024 * 1024) throw new Error('Report exceeds byte cap');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  while (lines.at(-1) === '') lines.pop();
  const version = lines[0] === 'BEGIN brush-fill-natural v2' ? 2
    : lines[0] === 'BEGIN brush-fill-natural v1' ? 1 : 0;
  if (!version || lines.at(-1) !== 'END brush-fill-natural') throw new Error('Report framing is incomplete');
  if (lines.length < 4) throw new Error('Report is too short');
  const caps = parseCaps(lines[1], version);

  const calls = [], stack = [], installed = {}, totals = {};
  const geometryCoverage = { truncatedLists: 0, omittedLists: 0, improperLists: 0, opaqueObjects: 0 };
  let index = 2, eventOrdinal = 0, complete = false;

  for (const name of TARGETS) {
    const line = lines[index++];
    if (!line?.startsWith('INSTALL ')) throw new Error(`Expected INSTALL for ${name}`);
    const f = record(line, 'INSTALL', ['name', 'original-type']);
    if (string(f.name) !== name) throw new Error(`INSTALL order mismatch at ${name}`);
    installed[name] = string(f['original-type']);
  }
  if (lines[index++] !== 'READY') throw new Error('Expected READY after all installations');

  let phase = 'events';
  for (; index < lines.length - 1; index += 1) {
    const line = lines[index];
    if (!line) throw new Error('Unexpected blank line');
    rejectDiagnosis(line);

    if (phase === 'events' && line.startsWith('CALL ')) {
      const f = record(line, 'CALL', ['id', 'name', 'parent', 'fill', 'args', 'before']);
      const id = integer(f.id), name = string(f.name), parent = integer(f.parent);
      if (id !== calls.length + 1 || id > caps.calls || !TARGETS.includes(name)
          || parent !== (stack.at(-1)?.id ?? 0)) throw new Error('Call sequence, cap, or parent mismatch');
      const fill = name === 'BRUSH-FILL' ? id : stack.findLast((call) => call.name === 'BRUSH-FILL')?.id ?? 0;
      if (integer(f.fill) !== fill) throw new Error('Containing fill mismatch');
      const call = {
        id, name, parent, fill, entryEvent: ++eventOrdinal,
        args: values(f.args, version, caps, geometryCoverage),
        before: state(f.before, caps),
      };
      calls.push(call);
      stack.push(call);
      continue;
    }

    if (phase === 'events' && line.startsWith('RETURN ')) {
      const f = record(line, 'RETURN', ['id', 'values', 'after']);
      const call = stack.pop();
      if (!call || call.id !== integer(f.id)) throw new Error('Return sequence mismatch');
      call.returnEvent = ++eventOrdinal;
      call.values = values(f.values, version, caps);
      call.after = state(f.after, caps);
      continue;
    }

    if (phase === 'events' && line.startsWith('TOTAL ')) phase = 'totals';
    if (phase === 'totals' && line.startsWith('TOTAL ')) {
      if (stack.length) throw new Error('Totals before all returns');
      const expected = TARGETS[Object.keys(totals).length];
      const f = record(line, 'TOTAL', ['name', 'calls']);
      const name = string(f.name);
      if (name !== expected) throw new Error('TOTAL order mismatch');
      totals[name] = integer(f.calls);
      continue;
    }

    if (phase === 'totals' && line.startsWith('COMPLETE ')) {
      if (Object.keys(totals).length !== TARGETS.length || stack.length) {
        throw new Error('COMPLETE before all target totals and returns');
      }
      const fields = version === 2
        ? ['calls', 'errors', 'aborts', 'overflow', 'depth']
        : ['calls', 'errors', 'overflow', 'depth'];
      const f = record(line, 'COMPLETE', fields);
      if (complete || integer(f.calls) !== calls.length || integer(f.errors) !== 0
          || (version === 2 && integer(f.aborts) !== 0) || boolean(f.overflow) || integer(f.depth) !== 0) {
        throw new Error('Capture completion, observation, or abort validation failed');
      }
      for (const name of TARGETS) {
        if (totals[name] !== calls.filter((call) => call.name === name).length) {
          throw new Error(`Target total mismatch for ${name}`);
        }
      }
      complete = true;
      phase = 'complete';
      continue;
    }

    throw new Error(`Unexpected record or invalid phase: ${line.slice(0, 80)}`);
  }

  if (!complete || phase !== 'complete' || lines[index] !== 'END brush-fill-natural'
      || calls.length !== calls.filter((call) => Object.hasOwn(call, 'returnEvent')).length
      || eventOrdinal !== calls.length * 2) throw new Error('Incomplete capture or event stream');

  return {
    schemaVersion: 1,
    protocolVersion: version,
    caps,
    installed,
    totals,
    observationScope: {
      eventStreamComplete: true,
      countAndBrushObservationsComplete: true,
      argumentGeometryComplete: false,
      argumentGeometryRepresentation: 'bounded datum summaries; list prefixes are capped and opaque object internals are omitted',
      truncatedLists: geometryCoverage.truncatedLists,
      omittedLists: geometryCoverage.omittedLists,
      improperLists: geometryCoverage.improperLists,
      opaqueObjects: geometryCoverage.opaqueObjects,
    },
    calls,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length) throw new Error('Usage: node parse-brush-fill-report.mjs <report.txt> <fresh-report.json>');
  const bytes = readFileSync(input);
  const report = parseBrushFillReport(bytes.toString('utf8'));
  report.sourceSha256 = sha256(bytes);
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output, protocolVersion: report.protocolVersion, totals: report.totals,
    observationScope: report.observationScope }, null, 2));
}
