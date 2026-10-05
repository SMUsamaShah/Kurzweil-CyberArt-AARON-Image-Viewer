#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './index-allegro-image.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
// This tape contains package-qualified symbols. Read only its finite data
// grammar; reader macros, dotted pairs and executable Lisp are rejected.
function parseLispRecord(line, recordName) {
  assert(line.startsWith(`${recordName} `), `Expected ${recordName} record`);
  let index = recordName.length;
  const skip = () => { while (index < line.length && /\s/.test(line[index])) index += 1; };
  function value() {
    skip();
    assert(index < line.length, 'Missing field value');
    if (line[index] === '(') {
      index += 1;
      const items = [];
      for (;;) {
        skip();
        assert(index < line.length, 'Unclosed Lisp list');
        if (line[index] === ')') { index += 1; return items; }
        items.push(value());
      }
    }
    if (line[index] === '"') {
      index += 1;
      let output = '';
      while (index < line.length) {
        const ch = line[index++];
        if (ch === '"') return { kind: 'string', value: output };
        if (ch === '\\') {
          const escaped = line[index++];
          assert(escaped === '\\' || escaped === '"', 'Unsupported string escape');
          output += escaped;
        } else output += ch;
      }
      throw new Error('Unclosed Lisp string');
    }
    const start = index;
    while (index < line.length && !/[\s()]/.test(line[index])) index += 1;
    const raw = line.slice(start, index);
    if (raw === 'NIL') return null;
    if (raw === 'T') return true;
    if (/^[+-]?\d+$/.test(raw)) return { kind: 'number', raw, value: Number(raw) };
    if (/^:[A-Za-z][A-Za-z0-9*_\-]*$/.test(raw)) return { kind: 'keyword', name: raw.slice(1).toUpperCase() };
    assert(/^(?:[A-Za-z][A-Za-z0-9*_\-]*:{1,2})?[A-Za-z][A-Za-z0-9*_\-]*$/.test(raw), `Unsupported Lisp atom: ${raw}`);
    return { kind: 'symbol', name: raw.toUpperCase() };
  }
  const output = Object.create(null);
  for (;;) {
    skip();
    if (index === line.length) return output;
    const match = /^[A-Za-z][A-Za-z0-9-]*/.exec(line.slice(index));
    assert(match, 'Malformed field name');
    const key = match[0].toLowerCase(); index += match[0].length;
    assert(line[index++] === '=' && !Object.hasOwn(output, key), 'Missing separator or duplicate field');
    output[key] = value();
  }
}
function keys(object, required, label) {
  assert(Object.keys(object).length === required.length
    && required.every((key) => Object.hasOwn(object, key)), `${label} fields differ`);
  return object;
}
function fields(line, name, expected) { return keys(parseLispRecord(line, name), expected, name); }
function int(value, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  assert(value?.kind === 'number' && /^[+-]?\d+$/.test(value.raw)
    && Number.isSafeInteger(value.value) && value.value >= min && value.value <= max, 'Expected a bounded raw integer');
  return value.value;
}
function symbol(value, name) { return value?.name === name; }
function text(value) { assert(value?.kind === 'string', 'Expected a string'); return value.value; }
function list(value) { assert(value === null || Array.isArray(value), 'Expected a list'); return value ?? []; }
function plist(value, expected, label) {
  const items = list(value), out = {};
  assert(items.length % 2 === 0, `Malformed ${label} property list`);
  for (let i = 0; i < items.length; i += 2) {
    const key = items[i]?.kind === 'keyword' ? items[i].name : null;
    assert(key && !Object.hasOwn(out, key), `Invalid ${label} property`);
    out[key] = items[i + 1];
  }
  return keys(out, expected, label);
}
function binding(value) {
  const p = list(value), bound = p[1];
  if (bound === true) return { bound: true, value: int(plist(value, ['BOUND', 'VALUE'], 'binding').VALUE) };
  const b = plist(value, ['BOUND', 'STATUS'], 'unbound binding');
  assert(b.BOUND === null && symbol(b.STATUS, 'UNBOUND'), 'Unsupported binding status');
  return { bound: false };
}
function frame(value) {
  const p = plist(value, ['BOUND', 'TYPE', 'LX', 'RX', 'LY', 'TY', 'BOUNDS-STATUS'], 'frame');
  assert(p.BOUND === true && symbol(p['BOUNDS-STATUS'], 'COMPLETE'), 'Incomplete frame');
  return { type: p.TYPE, lx: int(p.LX), rx: int(p.RX), ly: int(p.LY), ty: int(p.TY) };
}
function map(value, bounds, bits, caps) {
  const p = plist(value, ['BOUND', 'TYPE', 'DIMENSIONS', 'ELEMENT-TYPE', 'STATUS', 'REGION',
    'CELLS', 'COVERED', 'RUNS', 'ROWS'], 'map');
  assert(p.BOUND === true && symbol(p.STATUS, 'COMPLETE'), 'Incomplete map');
  const dims = list(p.DIMENSIONS), element = list(p['ELEMENT-TYPE']), region = list(p.REGION);
  assert(dims.length === 2 && element.length === 2 && symbol(element[0], 'UNSIGNED-BYTE')
    && int(element[1]) === bits && region.length === 5, 'Map shape or element type differs');
  const width = int(dims[0], 1, 16384), height = int(dims[1], 1, 16384);
  assert(width * height <= 16777216, 'Map allocation exceeds parser cap');
  const [x0, x1, y0, y1, declaredCells] = region.map((v) => int(v, 0));
  const expectedX0 = Math.min(bounds.lx, bounds.rx), expectedX1 = Math.min(Math.max(bounds.lx, bounds.rx) + 1, width - 1);
  assert(x0 === expectedX0 && x1 === expectedX1 && y0 === Math.min(bounds.ly, bounds.ty)
    && y1 === Math.max(bounds.ly, bounds.ty) && x0 <= x1 && y0 <= y1
    && x1 < width && y1 < height, 'Captured region differs from frame bounds');
  const rowWidth = x1 - x0 + 1, cells = rowWidth * (y1 - y0 + 1);
  assert(cells === declaredCells && cells === int(p.CELLS, 1, caps.rectangleCells)
    && int(p.COVERED) === cells, 'Map cell coverage differs');
  const rawRows = list(p.ROWS);
  assert(rawRows.length === y1 - y0 + 1, 'Map row coverage differs');
  let runs = 0;
  const rows = rawRows.map((row, index) => {
    assert(Array.isArray(row), 'Expected a map row');
    const y = int(row[0]), r = plist(row.slice(1), ['RUNS', 'CELLS', 'COVERED'], 'row');
    assert(y === y0 + index && int(r.CELLS) === rowWidth && int(r.COVERED) === rowWidth, 'Row order or coverage differs');
    const pairs = list(r.RUNS).map((pair) => {
      assert(Array.isArray(pair) && pair.length === 2, 'Malformed RLE pair');
      return [int(pair[0], 0, 2 ** bits - 1), int(pair[1], 1, rowWidth)];
    });
    assert(pairs.reduce((n, pair) => n + pair[1], 0) === rowWidth
      && pairs.every((pair, i) => !i || pair[0] !== pairs[i - 1][0]), 'RLE coverage or maximal runs differ');
    runs += pairs.length;
    return { y, runs: pairs };
  });
  assert(runs === int(p.RUNS, 1, caps.serializedRuns), 'Map run count differs');
  return { width, height, bits, type: p.TYPE, region: { x0, x1, y0, y1 }, cells, runCount: runs, rows };
}
function readers(value, caps) {
  const expected = ['STATUS', 'READER-CALLS', 'PATCHDEX-CALLS', 'PATCHDEX-PRESENT', 'PATCHDEX-OBSERVED-RESULTS',
    'PATCHDEX-FIRST-RESULT', 'PATCHDEX-FIRST-RESULT-VALID', 'PATCHDEX-RESULT-MISMATCHES',
    'PATCHDEX-RESULT-CONSISTENT', 'PATCHDEX-ARGUMENT-EQ-FIRST', 'PATCHDEX-ARGUMENT-EQ-MISMATCHES',
    'PATCHDEX-ARGUMENT-COUNT-VIOLATIONS', 'PATCHDEX-NO-RETURN',
    'CFORM-COUNT-CALLS', 'CFORM-COUNT-OBSERVED-RESULTS', 'CFORM-COUNT-FIRST-RESULT',
    'CFORM-COUNT-FIRST-RESULT-VALID', 'CFORM-COUNT-RESULT-MISMATCHES',
    'CFORM-COUNT-ARGUMENT-EQ-PATCHDEX', 'CFORM-COUNT-ARGUMENT-EQ-MISMATCHES',
    'CFORM-COUNT-ARGUMENT-COUNT-VIOLATIONS', 'CFORM-COUNT-NO-RETURN', 'READER-OVERFLOW', 'READER-ERRORS'];
  const p = plist(value, expected, 'readers');
  const patchCalls = int(p['PATCHDEX-CALLS'], 0, caps.readerObservations);
  assert(symbol(p.STATUS, 'COMPLETE') && p['READER-OVERFLOW'] === null
    && p['PATCHDEX-PRESENT'] === (patchCalls ? true : null)
    && ['PATCHDEX-RESULT-MISMATCHES', 'PATCHDEX-ARGUMENT-EQ-MISMATCHES',
      'PATCHDEX-ARGUMENT-COUNT-VIOLATIONS', 'PATCHDEX-NO-RETURN',
      'CFORM-COUNT-RESULT-MISMATCHES', 'CFORM-COUNT-ARGUMENT-EQ-MISMATCHES',
      'CFORM-COUNT-ARGUMENT-COUNT-VIOLATIONS', 'CFORM-COUNT-NO-RETURN',
      'READER-ERRORS'].every((k) => int(p[k]) === 0)
    && int(p['PATCHDEX-OBSERVED-RESULTS']) === patchCalls
    && int(p['CFORM-COUNT-CALLS']) === 1 && int(p['CFORM-COUNT-OBSERVED-RESULTS']) === 1
    && p['CFORM-COUNT-FIRST-RESULT-VALID'] === true && int(p['READER-CALLS']) === patchCalls + 1,
  'Incomplete or inconsistent natural reader observations');
  if (patchCalls) assert(p['PATCHDEX-FIRST-RESULT-VALID'] === true && p['PATCHDEX-RESULT-CONSISTENT'] === true
    && p['PATCHDEX-ARGUMENT-EQ-FIRST'] === true && p['CFORM-COUNT-ARGUMENT-EQ-PATCHDEX'] === true,
  'Natural readers do not use one consistent target object');
  else assert(p['PATCHDEX-FIRST-RESULT-VALID'] === null && symbol(p['PATCHDEX-FIRST-RESULT'], 'ABSENT')
    && symbol(p['PATCHDEX-RESULT-CONSISTENT'], 'ABSENT')
    && symbol(p['PATCHDEX-ARGUMENT-EQ-FIRST'], 'ABSENT') && symbol(p['CFORM-COUNT-ARGUMENT-EQ-PATCHDEX'], 'ABSENT'),
  'Absent patch reader was not marked explicitly');
  return { calls: patchCalls + 1, patchCalls, patchId: patchCalls ? int(p['PATCHDEX-FIRST-RESULT'], 0, 65535) : null,
    cformCountBefore: int(p['CFORM-COUNT-FIRST-RESULT']), exactTargetObject: patchCalls ? true : null };
}
function state(value, after, caps) {
  const names = ['SUB-FRAME', 'SUBP-COUNT', 'FLAG-BIT', 'FILL-MAP', 'PATCH-MAP'];
  if (after) names.push('IDENTITY-EQ-ENTRY', 'READERS');
  const p = plist(value, names, 'state'), bounds = frame(p['SUB-FRAME']);
  const fillMap = map(p['FILL-MAP'], bounds, 4, caps), patchMap = map(p['PATCH-MAP'], bounds, 16, caps);
  assert(fillMap.width === patchMap.width && fillMap.height === patchMap.height
    && JSON.stringify(fillMap.region) === JSON.stringify(patchMap.region), 'Map dimensions/regions differ');
  const result = { frame: bounds, subpartCount: binding(p['SUBP-COUNT']), flagBit: binding(p['FLAG-BIT']), fillMap, patchMap };
  if (after) {
    const eq = plist(p['IDENTITY-EQ-ENTRY'], ['SUB-FRAME', 'FILL-MAP', 'PATCH-MAP'], 'identity');
    assert(Object.values(eq).every((v) => v === true), 'Frame or map object was replaced');
    result.identityPreserved = true;
    result.readers = readers(p.READERS, caps);
  }
  return result;
}

export function parsePostFillMapReport(source) {
  assert(Buffer.byteLength(source) <= 256 * 1024 * 1024, 'Report exceeds byte cap');
  const lines = source.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  assert(lines[0] === 'BEGIN post-fill-maps v1' && lines.at(-1) === 'END post-fill-maps v1', 'Incomplete map framing');
  const rawCaps = fields(lines[1], 'CAPS', ['post-fill', 'rectangle-cells', 'serialized-runs',
    'reader-observations', 'coordinate-order', 'inclusive', 'extra-right-x']);
  const caps = { postFill: int(rawCaps['post-fill'], 1, 500), rectangleCells: int(rawCaps['rectangle-cells'], 1, 153600),
    serializedRuns: int(rawCaps['serialized-runs'], 1, 1000000), readerObservations: int(rawCaps['reader-observations'], 1, 10000000) };
  assert(symbol(rawCaps['coordinate-order'], 'XY') && rawCaps.inclusive === true && rawCaps['extra-right-x'] === true, 'Unsupported region convention');
  const installed = fields(lines[2], 'INSTALL', ['post-fill-type', 'patchdex-type', 'cform-count-type', 'main-type']);
  assert(['post-fill-type', 'patchdex-type', 'cform-count-type']
    .every((k) => symbol(installed[k], 'STANDARD-GENERIC-FUNCTION'))
    && symbol(installed['main-type'], 'COMPILED-FUNCTION') && lines[3] === 'READY', 'Unexpected installation or readiness');
  const calls = [], stack = []; let totals, complete, priorId = 0, runCount = 0, readerCount = 0, phase = 'calls';
  for (const line of lines.slice(4, -1)) {
    assert(!/^(ERROR|OVERFLOW|ABORT)(?:\s|$)/.test(line), 'Diagnostic or aborted map report');
    if (phase === 'calls' && line.startsWith('CALL ')) {
      const r = fields(line, 'CALL', ['id', 'name', 'args', 'before']);
      const id = int(r.id, 1, caps.postFill), args = list(r.args);
      assert(id > priorId && text(r.name) === 'POST-FILL' && args.length === 3
        && ['SUBFORM', 'COMMON-GRAPHICS-USER:SUBFORM', 'COMMON-GRAPHICS-USER::SUBFORM']
          .some((name) => symbol(args[0], name)), 'Unexpected POST-FILL call');
      priorId = id;
      const c = { id, cdex: int(args[1], 0), sdex: int(args[2], 0), before: state(r.before, false, caps) };
      calls.push(c); stack.push(c);
    } else if (phase === 'calls' && line.startsWith('RETURN ')) {
      const r = fields(line, 'RETURN', ['id', 'values', 'after']);
      const c = stack.pop(), values = list(r.values);
      assert(c && int(r.id) === c.id && values.length === 1, 'Unpaired return or unsupported values');
      c.returnValue = int(values[0]); c.after = state(r.after, true, caps);
      assert(JSON.stringify(c.before.frame) === JSON.stringify(c.after.frame)
        && JSON.stringify(c.before.flagBit) === JSON.stringify(c.after.flagBit), 'Frame bounds or FLAG-BIT changed');
      for (const snapshot of [c.before, c.after]) runCount += snapshot.fillMap.runCount + snapshot.patchMap.runCount;
      readerCount += c.after.readers.calls;
      assert(runCount <= caps.serializedRuns && readerCount <= caps.readerObservations, 'Cumulative cap exceeded');
    } else if (phase === 'calls' && line.startsWith('TOTAL ')) {
      assert(stack.length === 0, 'Incomplete calls before totals');
      const r = fields(line, 'TOTAL', ['post-fill', 'subform', 'cform', 'other', 'readers', 'observed-readers', 'runs']);
      totals = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, int(v, 0)])); phase = 'total';
    } else if (phase === 'total' && line.startsWith('COMPLETE ')) {
      const r = fields(line, 'COMPLETE', ['main', 'status', 'errors', 'aborts', 'overflow', 'depth']);
      assert(symbol(r.main, 'NORMAL') && symbol(r.status, 'COMPLETE') && int(r.errors) === 0
        && int(r.aborts) === 0 && r.overflow === null && int(r.depth) === 0, 'Unsuccessful map completion');
      complete = true; phase = 'complete';
    } else throw new Error(`Unexpected map record or phase: ${line.slice(0, 90)}`);
  }
  assert(complete && phase === 'complete' && totals.subform === calls.length && totals.other === 0
    && totals['post-fill'] === totals.subform + totals.cform && totals['post-fill'] <= caps.postFill
    && totals.readers === readerCount && totals['observed-readers'] === readerCount && totals.runs === runCount,
  'Map capture totals or completeness differ');
  return { schemaVersion: 1, protocolVersion: 1, caps, totals, installed, calls,
    scope: 'Exact rectangular map cells, frame bounds and natural target readers around SUBFORM POST-FILL; cells outside these regions were not captured' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length) throw new Error('Usage: node parse-post-fill-map-report.mjs <report.txt> <fresh.json>');
  const bytes = readFileSync(input), report = parsePostFillMapReport(bytes.toString('utf8'));
  report.sourceSha256 = sha256(bytes);
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output, totals: report.totals, calls: report.calls.length }));
}
