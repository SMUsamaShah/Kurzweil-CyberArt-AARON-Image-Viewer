#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { isPointOutsideAaronPicture } from '../../engine/src/aaron-picture-bounds.js';
import { parseFoobReport } from './parse-foob-report.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const truthCounts = () => ({ t: 0, nil: 0 });
const comparisonCounts = () => ({ compared: 0, mismatches: 0 });

function typeCounts() {
  return { x: {}, y: {}, tuples: {} };
}

function bump(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function bumpTypePair(counts, x, y) {
  bump(counts.x, x);
  bump(counts.y, y);
  bump(counts.tuples, `${x}/${y}`);
}

function numberType(descriptor, label) {
  assert(descriptor && typeof descriptor === 'object', `${label}: numeric descriptor missing`);
  if (descriptor.kind === 'integer') {
    assert(Number.isSafeInteger(descriptor.value), `${label}: integer is not safe`);
    return 'INTEGER';
  }
  assert(descriptor.kind === 'number'
    && ['SINGLE-FLOAT', 'DOUBLE-FLOAT'].includes(descriptor.type)
    && Number.isFinite(descriptor.value), `${label}: unsupported numeric descriptor`);
  return descriptor.type;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  assert(encoded !== undefined, 'parsed array contains a non-JSON value');
  return encoded;
}

function parsedArrayHash(value, label) {
  assert(Array.isArray(value), `${label}: expected parsed array`);
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function recordComparison(counts, expected, observed, label, context) {
  counts.compared += 1;
  if (observed !== expected) {
    counts.mismatches += 1;
    throw new Error(`FOOB mismatch (${label}): ${JSON.stringify(context)}; expected ${expected ? 'T' : 'NIL'}, observed ${observed ? 'T' : 'NIL'}`);
  }
}

function addOutcome(histogram, result) {
  histogram[result ? 't' : 'nil'] += 1;
}

function summarizeHistogram(histogram, label) {
  assert(histogram && Number.isSafeInteger(histogram.t) && Number.isSafeInteger(histogram.nil),
    `${label}: invalid parsed histogram`);
  return { t: histogram.t, nil: histogram.nil };
}

function descriptorContext(value) {
  return value.kind === 'integer'
    ? { kind: value.kind, value: value.value }
    : { kind: value.kind, type: value.type, raw: value.raw, value: value.value };
}

/**
 * Compare every FOOB input in a complete parsed capture with the measured
 * integer pixel-bound candidate. The parser validates capture framing and
 * coverage; this function independently checks all reported inputs.
 */
export function compareFoobCapture(report) {
  assert(report && report.schemaVersion === 1, 'expected parsed FOOB report v1');
  const dimensions = report.dimensions;
  assert(dimensions && Number.isSafeInteger(dimensions.width) && dimensions.width > 0
    && Number.isSafeInteger(dimensions.height) && dimensions.height > 0,
  'FOOB dimensions must be positive safe integers');
  assert(report.matrix && Array.isArray(report.matrix.rows) && Array.isArray(report.matrix.points)
    && Array.isArray(report.calls), 'FOOB parsed arrays are missing');
  assert(report.matrix.end?.complete === true && report.matrix.end.stateOk === true
    && report.matrix.end.errors === 0, 'FOOB matrix did not complete cleanly');
  assert(report.matrix.integerEnd?.complete === true, 'FOOB integer grid did not complete');
  assert(report.complete?.errors === 0 && report.complete.aborts === 0
    && report.complete.overflow === null && report.complete.active === 0
    && report.complete.naturalCalls === report.calls.length
    && report.complete.loggedCalls === report.calls.length,
  'FOOB natural capture did not complete cleanly');

  const size = { width: dimensions.width, height: dimensions.height };
  const integerComparisons = comparisonCounts();
  const floatComparisons = comparisonCounts();
  const naturalComparisons = comparisonCounts();
  const integerHistogram = truthCounts();
  const floatHistogram = truthCounts();
  const naturalHistogram = truthCounts();
  const floatTypes = typeCounts();
  const naturalTypes = typeCounts();
  const floatPairs = {};
  const naturalDimensions = {};

  // Expand the parser's maximal row runs so every integer x/y pair is checked.
  assert(report.matrix.rows.length === dimensions.yCount, 'FOOB integer row count differs from dimensions');
  for (let rowIndex = 0; rowIndex < report.matrix.rows.length; rowIndex += 1) {
    const row = report.matrix.rows[rowIndex];
    assert(row.y === dimensions.yStart + rowIndex, `FOOB row order differs at y=${row.y}`);
    let x = dimensions.xStart;
    for (const [observed, count] of row.runs) {
      assert(typeof observed === 'boolean' && Number.isSafeInteger(count) && count > 0,
        `FOOB row ${row.y}: invalid run`);
      for (let offset = 0; offset < count; offset += 1) {
        const pointX = x + offset;
        const expected = isPointOutsideAaronPicture(pointX, row.y, size);
        recordComparison(integerComparisons, expected, observed, 'integer grid', {
          row: rowIndex, x: pointX, y: row.y, width: size.width, height: size.height,
        });
        addOutcome(integerHistogram, observed);
      }
      x += count;
    }
    assert(x === dimensions.xStart + dimensions.xCount, `FOOB row ${row.y}: x coverage differs`);
  }
  assert(integerComparisons.compared === report.matrix.integerEnd.calls,
    'FOOB integer comparison count differs from the parsed footer');
  assert(isDeepStrictEqual(integerHistogram, summarizeHistogram(report.matrix.histogram, 'integer')),
    'FOOB integer outcomes differ from the parser histogram');

  // Check each typed sample separately; no float probes are synthesized here.
  for (const point of report.matrix.points) {
    const xType = numberType(point.x, `float point ${point.xi},${point.yi} x`);
    const yType = numberType(point.y, `float point ${point.xi},${point.yi} y`);
    bumpTypePair(floatTypes, xType, yType);
    bump(floatPairs, `${xType}/${yType}`);
    const expected = isPointOutsideAaronPicture(point.x.value, point.y.value, size);
    recordComparison(floatComparisons, expected, point.result, 'typed float point', {
      x: descriptorContext(point.x), y: descriptorContext(point.y),
      xPrecision: point.xPrecision, yPrecision: point.yPrecision, xi: point.xi, yi: point.yi,
      width: size.width, height: size.height,
    });
    addOutcome(floatHistogram, point.result);
  }
  assert(floatComparisons.compared === report.matrix.points.length
    && floatComparisons.compared === report.matrix.end.floatPoints,
  'FOOB float comparison count differs from parsed coverage');

  // Natural inputs keep their own call dimensions and parsed numeric types.
  for (const call of report.calls) {
    const x = call.args[0], y = call.args[1];
    const xType = numberType(x, `natural call ${call.id} x`);
    const yType = numberType(y, `natural call ${call.id} y`);
    bumpTypePair(naturalTypes, xType, yType);
    bump(naturalDimensions, `${call.width}x${call.height}`);
    const expected = isPointOutsideAaronPicture(x.value, y.value, {
      width: call.width, height: call.height,
    });
    recordComparison(naturalComparisons, expected, call.result, 'natural call', {
      id: call.id, x: descriptorContext(x), y: descriptorContext(y),
      width: call.width, height: call.height,
    });
    addOutcome(naturalHistogram, call.result);
  }

  assert(integerComparisons.mismatches === 0 && floatComparisons.mismatches === 0
    && naturalComparisons.mismatches === 0, 'FOOB comparisons contain mismatches');
  const state = report.matrix.state;
  assert(state && isDeepStrictEqual(state.before, state.after)
    && Object.values(state.checks).every(value => value === true),
  'FOOB matrix changed state summaries');

  return {
    schemaVersion: 1,
    model: {
      trueMeans: 'outside',
      falseMeans: 'inside',
      bounds: 'inclusive coordinates 0 through dimension - 1',
      evidence: 'complete integer grid, typed float samples, and observed natural calls',
    },
    coverage: {
      integer: { rows: report.matrix.rows.length, calls: integerComparisons.compared },
      float: { points: report.matrix.points.length, calls: floatComparisons.compared },
      natural: { calls: report.calls.length },
    },
    comparisons: {
      integer: integerComparisons,
      float: floatComparisons,
      natural: naturalComparisons,
    },
    histograms: {
      integer: integerHistogram,
      float: floatHistogram,
      natural: naturalHistogram,
    },
    types: {
      integerGrid: {
        x: { INTEGER: integerComparisons.compared },
        y: { INTEGER: integerComparisons.compared },
      },
      floatPoints: floatTypes,
      naturalCalls: naturalTypes,
    },
    matrix: {
      dimensions: {
        width: size.width, height: size.height,
        xStart: dimensions.xStart, yStart: dimensions.yStart,
        xCount: dimensions.xCount, yCount: dimensions.yCount,
      },
      bounds: { xMin: 0, xMax: size.width - 1, yMin: 0, yMax: size.height - 1 },
      floatPrecisionPairs: floatPairs,
      state: {
        beforeAfterEqual: true,
        copiedMapCells: report.matrix.copiedMapCells,
        checks: state.checks,
        rngPreview: state.before.rngPreview,
      },
      complete: report.matrix.end.complete,
      stateOk: report.matrix.end.stateOk,
    },
    natural: {
      calls: report.calls.length,
      dimensions: naturalDimensions,
    },
    parsedArrayHashes: {
      integerRowsSha256: parsedArrayHash(report.matrix.rows, 'integer rows'),
      floatPointsSha256: parsedArrayHash(report.matrix.points, 'float points'),
      naturalCallsSha256: parsedArrayHash(report.calls, 'natural calls'),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assert(process.argv.length === 3,
      'Usage: node research/tools/compare-foob-capture.mjs <complete-foob-report.txt>');
    const bytes = readFileSync(resolve(process.argv[2]));
    const report = parseFoobReport(bytes.toString('utf8'));
    const summary = compareFoobCapture(report);
    process.stdout.write(JSON.stringify({
      sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      ...summary,
    }, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
