import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SYMBOL_RE = /^[A-Za-z][A-Za-z0-9*-]*$/;
const KEYWORD_RE = /^:[A-Za-z][A-Za-z0-9*-]*$/;
const INTEGER_RE = /^[+-]?\d+$/;
const FLOAT_RE = /^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eEsSfFdDlL][+-]?\d+)?$/;

function parseNumber(raw) {
  if (!INTEGER_RE.test(raw) && !FLOAT_RE.test(raw)) throw new Error(`Unsupported Lisp number: ${raw}`);
  const value = Number(raw.replace(/[sSfFdDlL]/, 'e'));
  if (!Number.isFinite(value)) throw new Error(`Non-finite Lisp number: ${raw}`);
  return { kind: 'number', raw, value };
}

function parseExpr(source, start = 0) {
  let index = start;
  const skip = () => { while (/\s/.test(source[index] ?? '')) index += 1; };
  const readString = () => {
    index += 1;
    let value = '';
    while (index < source.length) {
      const char = source[index++];
      if (char === '"') return { kind: 'string', value };
      if (char === '\\') {
        if (index >= source.length) throw new Error('Unterminated Lisp string escape');
        const escaped = source[index++];
        if (escaped !== '"' && escaped !== '\\') throw new Error(`Unsupported Lisp string escape: \\${escaped}`);
        value += escaped;
      } else value += char;
    }
    throw new Error('Unterminated Lisp string');
  };
  const readAtom = () => {
    const begin = index;
    while (index < source.length && !/[\s()]/.test(source[index])) index += 1;
    const raw = source.slice(begin, index);
    if (!raw || raw.startsWith('#') || /^[`',]/.test(raw)) throw new Error(`Reader syntax is forbidden in report: ${raw}`);
    if (raw === 'NIL') return null;
    if (raw === 'T') return true;
    if (KEYWORD_RE.test(raw)) return { kind: 'keyword', name: raw.slice(1).toUpperCase() };
    if (INTEGER_RE.test(raw) || FLOAT_RE.test(raw)) return parseNumber(raw);
    if (SYMBOL_RE.test(raw)) return { kind: 'symbol', name: raw.toUpperCase() };
    throw new Error(`Unsupported Lisp atom: ${raw}`);
  };
  const read = () => {
    skip();
    if (index >= source.length) throw new Error('Expected Lisp expression');
    if (source[index] === '(') {
      index += 1;
      const list = [];
      for (;;) {
        skip();
        if (index >= source.length) throw new Error('Unclosed Lisp list');
        if (source[index] === ')') { index += 1; return list; }
        if (source[index] === '.' && /[\s)]/.test(source[index + 1] ?? '')) {
          throw new Error('Dotted Lisp lists are not accepted in report fields');
        }
        list.push(read());
      }
    }
    if (source[index] === ')') throw new Error('Unexpected close parenthesis');
    if (source[index] === '"') return readString();
    return readAtom();
  };
  const value = read();
  return { value, end: index };
}

function parseRecord(line, expectedName) {
  if (!line.startsWith(`${expectedName} `)) throw new Error(`Expected ${expectedName} record`);
  let index = expectedName.length;
  const fields = Object.create(null);
  while (index < line.length) {
    while (/\s/.test(line[index] ?? '')) index += 1;
    if (index >= line.length) break;
    const keyMatch = /^[A-Za-z][A-Za-z0-9-]*/.exec(line.slice(index));
    if (!keyMatch) throw new Error(`Malformed field name in ${expectedName} record`);
    const key = keyMatch[0].toLowerCase();
    index += keyMatch[0].length;
    if (line[index++] !== '=') throw new Error(`Missing = after ${key}`);
    if (Object.hasOwn(fields, key)) throw new Error(`Duplicate ${key} field`);
    const parsed = parseExpr(line, index);
    fields[key] = parsed.value;
    index = parsed.end;
  }
  return fields;
}

function symbolName(value, label) {
  if (!value || value.kind !== 'symbol') throw new Error(`${label} must be a Lisp symbol`);
  return value.name;
}

function keywordName(value, label) {
  if (!value || value.kind !== 'keyword') throw new Error(`${label} must be a keyword`);
  return value.name;
}

function typeName(value, label) {
  if (value?.kind === 'symbol' || value?.kind === 'keyword') return value.name;
  throw new Error(`${label} must be a Lisp type name`);
}

function stringValue(value, label) {
  if (!value || value.kind !== 'string') throw new Error(`${label} must be a string`);
  return value.value;
}

function intValue(value, label) {
  if (!value || value.kind !== 'number' || !INTEGER_RE.test(value.raw)) throw new Error(`${label} must be an integer`);
  return value.value;
}

function plist(value, label) {
  if (!Array.isArray(value) || value.length % 2 !== 0) throw new Error(`${label} must be a proper plist`);
  const result = Object.create(null);
  for (let index = 0; index < value.length; index += 2) {
    const key = keywordName(value[index], `${label} key`);
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate :${key} in ${label}`);
    result[key] = value[index + 1];
  }
  return result;
}

function exactKeys(object, required, optional = [], label = 'plist') {
  const permitted = new Set([...required, ...optional]);
  for (const key of required) if (!Object.hasOwn(object, key)) throw new Error(`${label} missing :${key}`);
  for (const key of Object.keys(object)) if (!permitted.has(key)) throw new Error(`${label} has unsupported :${key}`);
}

function generic(value) {
  if (value === null || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(generic);
  if (value.kind === 'number') return { kind: 'number', raw: value.raw, value: value.value };
  if (value.kind === 'symbol' || value.kind === 'keyword') return { kind: value.kind, name: value.name };
  if (value.kind === 'string') return value.value;
  throw new Error('Unsupported value in report');
}

function typedScalar(value, label) {
  const fields = plist(value, label);
  exactKeys(fields, ['TYPE', 'VALUE'], [], label);
  const type = typeName(fields.TYPE, `${label} :TYPE`);
  if (['FIXNUM', 'SINGLE-FLOAT', 'DOUBLE-FLOAT'].includes(type)) {
    if (!fields.VALUE || fields.VALUE.kind !== 'number') throw new Error(`${label} ${type} value must be numeric`);
    if (type === 'FIXNUM' && !INTEGER_RE.test(fields.VALUE.raw)) throw new Error(`${label} FIXNUM value is not an integer`);
    const valueNumber = type === 'SINGLE-FLOAT' ? Math.fround(fields.VALUE.value) : fields.VALUE.value;
    return { type, raw: fields.VALUE.raw, value: valueNumber };
  }
  if (type === 'SYMBOL') return { type, raw: generic(fields.VALUE), value: generic(fields.VALUE) };
  throw new Error(`${label} has unsupported scalar type ${type}`);
}

function point(value, label) {
  const fields = plist(value, label);
  exactKeys(fields, ['POINT-TYPE', 'X', 'Y', 'VIS'], [], label);
  return {
    pointType: symbolName(fields['POINT-TYPE'], `${label} :POINT-TYPE`),
    x: typedScalar(fields.X, `${label} :X`),
    y: typedScalar(fields.Y, `${label} :Y`),
    vis: typedScalar(fields.VIS, `${label} :VIS`),
  };
}

function pointList(value, label) {
  const fields = plist(value, label);
  exactKeys(fields, ['POINTS', 'SHOWN', 'TRUNCATED', 'PROPER'], ['IMPROPER-TAIL'], label);
  if (fields.TRUNCATED !== null && typeof fields.TRUNCATED !== 'boolean') throw new Error(`${label} :TRUNCATED must be T or NIL`);
  if (fields.PROPER !== null && typeof fields.PROPER !== 'boolean') throw new Error(`${label} :PROPER must be T or NIL`);
  if (fields.POINTS !== null && !Array.isArray(fields.POINTS)) throw new Error(`${label} :POINTS must be a list`);
  const points = (fields.POINTS ?? []).map((item, index) => point(item, `${label} point ${index}`));
  const shown = intValue(fields.SHOWN, `${label} :SHOWN`);
  if (shown !== points.length) throw new Error(`${label} :SHOWN does not match the captured point count`);
  return {
    points,
    shown,
    truncated: fields.TRUNCATED === true,
    proper: fields.PROPER === true,
    ...(Object.hasOwn(fields, 'IMPROPER-TAIL') ? { improperTail: generic(fields['IMPROPER-TAIL']) } : {}),
  };
}

function bindings(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list`);
  return value.map((item, index) => {
    const fields = plist(item, `${label} item ${index}`);
    exactKeys(fields, ['NAME'], ['BOUND', 'VALUE', 'SYMBOL-MISSING', 'BINDING-ERROR'], `${label} item ${index}`);
    const result = { name: stringValue(fields.NAME, `${label} name`) };
    if (Object.hasOwn(fields, 'BOUND')) {
      if (fields.BOUND !== null && typeof fields.BOUND !== 'boolean') throw new Error(`${label} bound must be T or NIL`);
      result.bound = fields.BOUND === true;
    }
    if (Object.hasOwn(fields, 'VALUE')) result.value = generic(fields.VALUE);
    if (Object.hasOwn(fields, 'SYMBOL-MISSING')) result.symbolMissing = generic(fields['SYMBOL-MISSING']);
    if (Object.hasOwn(fields, 'BINDING-ERROR')) result.bindingError = generic(fields['BINDING-ERROR']);
    return result;
  });
}

function rngPreview(value, label) {
  const fields = plist(value, label);
  if (Object.hasOwn(fields, 'RANDOM-100')) {
    exactKeys(fields, ['RANDOM-100'], [], label);
    if (!Array.isArray(fields['RANDOM-100']) || fields['RANDOM-100'].length !== 3) throw new Error(`${label} requires three RANDOM-100 draws`);
    return { random100: fields['RANDOM-100'].map((item, index) => intValue(item, `${label} draw ${index}`)) };
  }
  if (Object.hasOwn(fields, 'PREVIEW-ERROR')) {
    exactKeys(fields, ['PREVIEW-ERROR'], [], label);
    return { previewError: generic(fields['PREVIEW-ERROR']) };
  }
  throw new Error(`${label} has no supported preview marker`);
}

function resultSummary(value, label) {
  const fields = plist(value, label);
  exactKeys(fields, ['VALUES-COUNT', 'FIRST', 'EXTRA'], [], label);
  const first = fields.FIRST;
  let firstResult;
  if (first && first.kind === 'keyword' && first.name === 'NO-VALUES') firstResult = { noValues: true };
  else if (first === null || Array.isArray(first)) firstResult = pointList(first, `${label} :FIRST`);
  else firstResult = { value: generic(first) };
  if (fields.EXTRA !== null && !Array.isArray(fields.EXTRA)) throw new Error(`${label} :EXTRA must be a list`);
  return {
    valuesCount: intValue(fields['VALUES-COUNT'], `${label} :VALUES-COUNT`),
    first: firstResult,
    extra: (fields.EXTRA ?? []).map(generic),
  };
}

function semanticPoint(point) {
  if (!point) return null;
  return [point.pointType,
    [point.x.type, point.x.value], [point.y.type, point.y.value], [point.vis.type, point.vis.value]];
}

function semanticPointList(list) {
  return JSON.stringify({
    points: list.points.map(semanticPoint),
    shown: list.shown, truncated: list.truncated, proper: list.proper,
    improperTail: list.improperTail,
  });
}

function mutation(before, after) {
  const changedPointIndexes = [];
  const max = Math.max(before.points.length, after.points.length);
  for (let index = 0; index < max; index += 1) {
    if (JSON.stringify(semanticPoint(before.points[index])) !== JSON.stringify(semanticPoint(after.points[index]))) changedPointIndexes.push(index);
  }
  return {
    changed: semanticPointList(before) !== semanticPointList(after),
    changedPointIndexes,
    beforePointCount: before.points.length,
    afterPointCount: after.points.length,
  };
}

function parseCall(fields) {
  exactKeys(fields, ['id', 'arg-count', 'edge', 'bindings', 'rng-before'], [], 'CALL record');
  const id = intValue(fields.id, 'CALL id');
  return {
    id,
    argCount: intValue(fields['arg-count'], 'CALL arg-count'),
    edgeBefore: pointList(fields.edge, `CALL ${id} edge`),
    bindingsBefore: bindings(fields.bindings, `CALL ${id} bindings`),
    rngBefore: rngPreview(fields['rng-before'], `CALL ${id} rng-before`),
    conditions: [],
    status: 'pending',
  };
}

function parseReturn(fields, call) {
  exactKeys(fields, ['id', 'result', 'edge-after', 'bindings-after', 'rng-after'], [], 'RETURN record');
  const id = intValue(fields.id, 'RETURN id');
  if (id !== call.id) throw new Error(`RETURN ${id} does not match pending CALL ${call.id}`);
  const edgeAfter = pointList(fields['edge-after'], `RETURN ${id} edge-after`);
  const returned = resultSummary(fields.result, `RETURN ${id} result`);
  call.returned = returned;
  call.edgeAfter = edgeAfter;
  call.bindingsAfter = bindings(fields['bindings-after'], `RETURN ${id} bindings-after`);
  call.rngAfter = rngPreview(fields['rng-after'], `RETURN ${id} rng-after`);
  call.inputMutation = mutation(call.edgeBefore, edgeAfter);
  call.status = 'returned';
}

export function parseNaturalFreePathReport(text, { source = {} } = {}) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.shift() !== 'BEGIN natural-free-path-capture v1') throw new Error('Missing natural FREE-PATH report header');
  const capsLine = lines.shift();
  const capsMatch = /^CAPS calls=(\d+) points-per-list=(\d+)$/.exec(capsLine ?? '');
  if (!capsMatch) throw new Error('Missing or malformed report caps');
  const caps = { calls: Number(capsMatch[1]), pointsPerList: Number(capsMatch[2]) };
  const installLine = lines.shift();
  const installMatch = /^INSTALL target=FREE-PATH original-type=([A-Z0-9-]+)$/.exec(installLine ?? '');
  const installErrorMatch = /^INSTALL-ERROR target=FREE-PATH reason=([A-Z0-9-]+)$/.exec(installLine ?? '');
  if (!installMatch && !installErrorMatch) throw new Error('Missing or malformed FREE-PATH installation record');
  const report = {
    schema: 'aaron-natural-free-path-evidence-v1',
    source,
    capture: {
      caps,
      installation: installMatch ? { target: 'FREE-PATH', originalType: installMatch[1] }
        : { target: 'FREE-PATH', installError: installErrorMatch[1] },
      calls: [],
      overflows: [],
      aborts: [],
      conditions: [],
    },
  };
  let pending = null;
  const seenIds = new Set();
  for (const [lineIndex, line] of lines.entries()) {
    if (!line) continue;
    if (line.startsWith('CALL ')) {
      if (pending) throw new Error(`CALL begins before pending CALL ${pending.id} completed (line ${lineIndex + 4})`);
      const call = parseCall(parseRecord(line, 'CALL'));
      if (seenIds.has(call.id)) throw new Error(`Duplicate CALL id ${call.id}`);
      seenIds.add(call.id);
      report.capture.calls.push(call);
      pending = call;
    } else if (line.startsWith('RETURN ')) {
      if (!pending) throw new Error(`RETURN without a pending CALL (line ${lineIndex + 4})`);
      parseReturn(parseRecord(line, 'RETURN'), pending);
      pending = null;
    } else if (line.startsWith('CONDITION ')) {
      const fields = parseRecord(line, 'CONDITION');
      exactKeys(fields, ['id', 'type'], [], 'CONDITION record');
      const id = intValue(fields.id, 'CONDITION id');
      const condition = { id, type: symbolName(fields.type, 'CONDITION type') };
      report.capture.conditions.push(condition);
      if (pending?.id === id) pending.conditions.push(condition);
    } else if (line.startsWith('ABORT ')) {
      const fields = parseRecord(line, 'ABORT');
      exactKeys(fields, ['id', 'reason'], [], 'ABORT record');
      const abort = { id: intValue(fields.id, 'ABORT id'), reason: symbolName(fields.reason, 'ABORT reason') };
      report.capture.aborts.push(abort);
      if (pending?.id !== abort.id) throw new Error(`ABORT ${abort.id} does not match pending CALL`);
      pending.status = 'aborted';
      pending.abort = abort;
      pending = null;
    } else if (line.startsWith('OVERFLOW ')) {
      const fields = parseRecord(line, 'OVERFLOW');
      const kind = Object.hasOwn(fields, 'call') ? 'point-list' : 'call-limit';
      if (kind === 'point-list') {
        exactKeys(fields, ['call', 'field', 'reason', 'limit'], [], 'OVERFLOW record');
        report.capture.overflows.push({
          kind,
          callId: intValue(fields.call, 'OVERFLOW call'),
          field: symbolName(fields.field, 'OVERFLOW field'),
          reason: symbolName(fields.reason, 'OVERFLOW reason'),
          limit: intValue(fields.limit, 'OVERFLOW limit'),
        });
      } else {
        exactKeys(fields, ['reason', 'limit', 'next-call'], [], 'OVERFLOW record');
        report.capture.overflows.push({
          kind,
          reason: symbolName(fields.reason, 'OVERFLOW reason'),
          limit: intValue(fields.limit, 'OVERFLOW limit'),
          nextCall: intValue(fields['next-call'], 'OVERFLOW next-call'),
        });
      }
    } else throw new Error(`Unsupported natural FREE-PATH record at line ${lineIndex + 4}: ${line.slice(0, 80)}`);
  }
  if (pending?.status === 'pending') throw new Error(`Unfinished CALL ${pending.id} without RETURN or ABORT`);
  const calls = report.capture.calls;
  report.capture.callCount = calls.length;
  report.capture.returnCount = calls.filter(call => call.status === 'returned').length;
  report.capture.completed = report.capture.installation.originalType !== undefined
    && calls.every(call => call.status === 'returned')
    && report.capture.overflows.length === 0 && report.capture.aborts.length === 0;
  report.capture.callSummaries = calls.map(call => ({
    id: call.id,
    status: call.status,
    inputPoints: call.edgeBefore.points.length,
    returnedPoints: call.returned?.first?.points?.length ?? 0,
    inputChanged: call.inputMutation?.changed ?? null,
    rngBefore: call.rngBefore,
    rngAfter: call.rngAfter ?? null,
    conditions: call.conditions,
  }));
  return report;
}

function compactScalar(scalar) {
  return [scalar.type, scalar.raw];
}

function compactPoint(pointValue) {
  return [pointValue.pointType, compactScalar(pointValue.x), compactScalar(pointValue.y), compactScalar(pointValue.vis)];
}

function compactPointList(list) {
  return {
    points: list.points.map(compactPoint),
    shown: list.shown,
    truncated: list.truncated,
    proper: list.proper,
    ...(Object.hasOwn(list, 'improperTail') ? { improperTail: list.improperTail } : {}),
  };
}

export function compactNaturalFreePathEvidence(report) {
  const capture = report.capture;
  return {
    schema: report.schema,
    source: report.source,
    capture: {
      caps: capture.caps,
      installation: capture.installation,
      callCount: capture.callCount,
      returnCount: capture.returnCount,
      completed: capture.completed,
      overflows: capture.overflows,
      aborts: capture.aborts,
      conditions: capture.conditions,
      calls: capture.calls.map(call => ({
        id: call.id,
        status: call.status,
        argCount: call.argCount,
        edgeBefore: compactPointList(call.edgeBefore),
        bindingsBefore: call.bindingsBefore,
        rngBefore: call.rngBefore,
        ...(call.returned ? {
          return: {
            valuesCount: call.returned.valuesCount,
            first: call.returned.first.points ? compactPointList(call.returned.first) : call.returned.first,
            extra: call.returned.extra,
          },
          edgeAfter: compactPointList(call.edgeAfter),
          bindingsAfter: call.bindingsAfter,
          rngAfter: call.rngAfter,
          inputMutation: call.inputMutation,
        } : {}),
        conditions: call.conditions,
        ...(call.abort ? { abort: call.abort } : {}),
      })),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [reportPath, summaryPath, outputPath] = process.argv.slice(2);
  if (!reportPath || !summaryPath || !outputPath) {
    throw new Error('Usage: node parse-natural-free-path-report.mjs REPORT SCENE_SUMMARY_JSON OUTPUT_JSON');
  }
  const reportBytes = readFileSync(reportPath);
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const parsed = parseNaturalFreePathReport(reportBytes.toString('utf8'), {
    source: {
      reportPath,
      reportSha256: createHash('sha256').update(reportBytes).digest('hex'),
      runId: summary.runId,
      mode: summary.mode,
      sceneRunComplete: summary.complete,
      aa0Sha256: summary.aa0Sha256,
      sceneReportSha256: summary.sceneReportSha256,
    },
  });
  writeFileSync(outputPath, `${JSON.stringify(compactNaturalFreePathEvidence(parsed), null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ outputPath, calls: parsed.capture.callSummaries }, null, 2)}\n`);
}
