#!/usr/bin/env node

// Compare the retained source-bound FREE-PATH boundary matrix with the
// current JavaScript API. This is an offline derivation; it never starts the
// original runtime or alters the source evidence.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Allegro501Random } from '../../engine/src/allegro-random.js';
import { aaronFreePath } from '../../engine/src/aaron-point-geometry.js';

const DEFAULT_EVIDENCE = 'research/introspection/evidence/free-path-boundaries-20261013.json';
const DEFAULT_PROBE = 'research/introspection/free-path-boundaries.cl';
const DEFAULT_OUTPUT = 'research/extracted/local-oracle/free-path-boundary-js-comparison-20261013.json';
const NUMBER_TOKEN = /^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+))(?:[eEsSfFdDlL][+-]?\d+)?$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseLispList(source) {
  let index = 0;
  const skipSpace = () => {
    while (/\s/.test(source[index] ?? '')) index += 1;
  };
  const read = () => {
    skipSpace();
    assert(index < source.length, 'Unexpected end of Lisp list');
    if (source[index] === '(') {
      index += 1;
      const values = [];
      for (;;) {
        skipSpace();
        assert(index < source.length, 'Unclosed Lisp list');
        if (source[index] === ')') {
          index += 1;
          return values;
        }
        values.push(read());
      }
    }
    const start = index;
    while (index < source.length && !/[\s()]/.test(source[index])) index += 1;
    const token = source.slice(start, index);
    assert(NUMBER_TOKEN.test(token), `Unsupported Lisp number token: ${token}`);
    return token;
  };
  const value = read();
  skipSpace();
  assert(index === source.length, `Unexpected text after Lisp list: ${source.slice(index)}`);
  return value;
}

function parseLispNumber(raw) {
  assert(typeof raw === 'string' && NUMBER_TOKEN.test(raw), `Invalid Lisp number: ${raw}`);
  const integer = /^[+-]?\d+$/.test(raw);
  const suffix = integer ? null : /([esfdl])([+-]?\d+)$/i.exec(raw)?.[1]?.toLowerCase() ?? null;
  const normalized = raw.replace(/([sfdl])(?=[+-]?\d+$)/i, 'e').replace(/E/g, 'e');
  const value = Number(normalized);
  assert(Number.isFinite(value), `Non-finite Lisp number: ${raw}`);
  let lispType;
  let effectivePrecision;
  if (integer) {
    lispType = 'integer';
    effectivePrecision = 'exact';
  } else if (suffix === 'd') {
    lispType = 'double-float';
    effectivePrecision = 'double';
  } else if (suffix === 'l') {
    lispType = 'long-float';
    effectivePrecision = 'unsupported-long';
  } else if (suffix === 's' || suffix === 'f' || suffix === 'e') {
    lispType = `${suffix}-float`;
    effectivePrecision = 'single';
  } else {
    // In the retained probe, an unsuffixed decimal is printed in the image's
    // default single-float format. Source literals are retained separately.
    lispType = 'default-float-unmarked';
    effectivePrecision = 'single';
  }
  return { raw, value, lispType, effectivePrecision };
}

function comparedLispValue(raw) {
  const parsed = parseLispNumber(raw);
  return parsed.effectivePrecision === 'single' ? Math.fround(parsed.value) : parsed.value;
}

function parseProbeSpecs(probeText) {
  const specs = [];
  for (const line of probeText.split(/\r?\n/)) {
    if (!line.includes('(list :name')) continue;
    const name = /:name "([A-Za-z0-9-]+)"/.exec(line)?.[1];
    const pointsText = /:points '\((.+?)\) :fdex -?\d+ :tdex -?\d+ :from -?\d+ :to -?\d+\)/.exec(line)?.[1];
    const indexes = /:fdex (-?\d+) :tdex (-?\d+) :from (-?\d+) :to (-?\d+)\)/.exec(line);
    assert(name && pointsText && indexes, `Malformed source spec line: ${line}`);
    const points = parseLispList(`(${pointsText})`);
    assert(Array.isArray(points) && points.length >= 2 &&
      points.every(point => Array.isArray(point) && point.length === 3),
    `Source points for ${name} are not triples`);
    specs.push({
      name,
      points,
      fdex: Number(indexes[1]),
      tdex: Number(indexes[2]),
      from: Number(indexes[3]),
      to: Number(indexes[4]),
    });
  }
  assert(specs.length === 20, `Expected 20 source specs, found ${specs.length}`);
  assert(new Set(specs.map(spec => spec.name)).size === specs.length, 'Duplicate source spec name');
  return specs;
}

function numberForJson(value) {
  return Object.is(value, -0) ? '-0' : value;
}

function pointListForJson(points) {
  return points.map(point => point.map(numberForJson));
}

function hashes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sameNumericTree(source, observed) {
  if (!Array.isArray(source) || !Array.isArray(observed) || source.length !== observed.length) return false;
  return source.every((item, index) => {
    if (Array.isArray(item)) return sameNumericTree(item, observed[index]);
    return Object.is(comparedLispValue(item), comparedLispValue(observed[index]));
  });
}

function hasSignedZeroDifference(source, observed) {
  if (!Array.isArray(source) || !Array.isArray(observed) || source.length !== observed.length) return false;
  return source.some((item, index) => {
    if (Array.isArray(item)) return hasSignedZeroDifference(item, observed[index]);
    const left = parseLispNumber(item).value;
    const right = parseLispNumber(observed[index]).value;
    return left === 0 && right === 0 && !Object.is(left, right);
  });
}

function validateObserverReport(reportText, expectedCases, sourceSpecs) {
  const normalized = reportText.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  assert(lines[0] === 'BEGIN free-path-boundaries', 'Observer report BEGIN marker is missing');
  assert(lines.at(-2) === 'END free-path-boundaries' && lines.at(-1) === '',
    'Observer report END marker is missing or not final');
  const expectedByPair = new Map(expectedCases.map(item => [`${item.seed}/${item.name}`, item]));
  const actualCases = [];
  const markers = new Map();
  let current = null;
  let errorCount = 0;
  for (const line of lines) {
    if (line === '') continue;
    if (line.startsWith('CASE ')) {
      assert(current === null, 'Observer report has a nested CASE');
      const match = /^CASE seed=(\d+) name=([A-Za-z0-9-]+) POINTS (.+) FDEX (-?\d+) TDEX (-?\d+) FROM (-?\d+) TO (-?\d+)$/.exec(line);
      assert(match, `Malformed observer CASE header: ${line}`);
      const seed = Number(match[1]);
      const name = match[2];
      const pair = `${seed}/${name}`;
      const expected = expectedByPair.get(pair);
      assert(expected, `Observer report contains unexpected CASE ${pair}`);
      const points = parseLispList(match[3]);
      const indexes = [Number(match[4]), Number(match[5]), Number(match[6]), Number(match[7])];
      assert(JSON.stringify(indexes) === JSON.stringify([expected.fdex, expected.tdex, expected.from, expected.to]),
        `Observer CASE index inputs differ from evidence for ${pair}`);
      assert(JSON.stringify(points) === JSON.stringify(expected.points),
        `Observer CASE point tokens differ from evidence for ${pair}`);
      current = { seed, name, pair, randomCallCount: 0, distanceCallCount: 0,
        resultCount: 0, edgeAfterCount: 0, nextRandomCount: 0, error: false };
      actualCases.push(current);
      continue;
    }
    if (line === 'ENDCASE') {
      assert(current !== null, 'Observer report has ENDCASE without CASE');
      assert(current.resultCount === 1 && current.edgeAfterCount === 1 && current.nextRandomCount === 1,
        `Observer CASE ${current.pair} lacks exactly one result/input-after/checkpoint`);
      current = null;
      continue;
    }
    if (line.startsWith('RAN ')) {
      assert(current !== null && /^RAN \(.+\) => .+$/.test(line), `Malformed or misplaced RAN record: ${line}`);
      current.randomCallCount += 1;
      continue;
    }
    if (line.startsWith('XYDIST ')) {
      assert(current !== null && /^XYDIST .+ => .+$/.test(line), `Malformed or misplaced XYDIST record: ${line}`);
      current.distanceCallCount += 1;
      continue;
    }
    if (line.startsWith('RESULT ')) {
      assert(current !== null, 'Misplaced RESULT record');
      parseLispList(line.slice('RESULT '.length));
      current.resultCount += 1;
      continue;
    }
    if (line.startsWith('EDGE-AFTER ')) {
      assert(current !== null, 'Misplaced EDGE-AFTER record');
      parseLispList(line.slice('EDGE-AFTER '.length));
      current.edgeAfterCount += 1;
      continue;
    }
    if (line.startsWith('NEXT-RANDOM ')) {
      assert(current !== null && /^NEXT-RANDOM \d+ STATUS OK$/.test(line),
        `Malformed or misplaced NEXT-RANDOM record: ${line}`);
      current.nextRandomCount += 1;
      continue;
    }
    if (line.startsWith('ERROR ')) {
      assert(current !== null, `Misplaced probe error record: ${line}`);
      errorCount += 1;
      current.error = true;
      continue;
    }
    if (line.startsWith('TYPE-DATUM ')) {
      assert(current !== null, `Misplaced TYPE-DATUM record: ${line}`);
      continue;
    }
    if (line === 'BEGIN free-path-boundaries' ||
        line === 'DEFERRED UNTIL OUTER MAIN RETURN' ||
        line === 'MAIN-RETURNED T' ||
        line === 'CASES 40' ||
        line === 'INSTALL main-wrapper=OUTER-OF-WRITER-STREAM' ||
        line === 'RESTORED T' ||
        line === 'END free-path-boundaries') {
      assert(current === null, `Marker appears inside CASE: ${line}`);
      markers.set(line, (markers.get(line) ?? 0) + 1);
      continue;
    }
    throw new Error(`Unknown observer report record: ${line}`);
  }
  assert(current === null, 'Observer report ended inside a CASE');
  for (const marker of ['BEGIN free-path-boundaries', 'DEFERRED UNTIL OUTER MAIN RETURN', 'MAIN-RETURNED T',
    'CASES 40', 'INSTALL main-wrapper=OUTER-OF-WRITER-STREAM', 'RESTORED T', 'END free-path-boundaries']) {
    assert(markers.get(marker) === 1, `Expected exactly one ${marker} record`);
  }
  assert(actualCases.length === 40 && new Set(actualCases.map(item => item.pair)).size === 40,
    `Expected 40 unique observer CASE pairs, found ${actualCases.length}`);
  assert(errorCount === 0 && actualCases.every(item => !item.error),
    `Observer report contains ${errorCount} errors`);
  const expectedPairs = new Set(expectedCases.map(item => `${item.seed}/${item.name}`));
  const actualPairs = new Set(actualCases.map(item => item.pair));
  assert([...expectedPairs].every(pair => actualPairs.has(pair)) && [...actualPairs].every(pair => expectedPairs.has(pair)),
    'Observer report CASE pair set differs from the retained evidence');
  for (const record of actualCases) {
    const evidenceCase = expectedByPair.get(record.pair);
    assert(record.randomCallCount === evidenceCase.randomCallCount &&
      record.distanceCallCount === evidenceCase.distanceCallCount,
    `Observer call counts differ from evidence for ${record.pair}`);
  }
  assert(sourceSpecs.length === 20 && actualCases.length === sourceSpecs.length * 2,
    'Observer report is not the complete two-seed source matrix');
  return { caseCount: actualCases.length, errorCount, markers: Object.fromEntries(markers), actualCases };
}

function sourceEdgePrecisions(points) {
  return points.map((from, index) => {
    const to = points[(index + 1) % points.length];
    const coordinateTypes = [from[0], from[1], to[0], to[1]].map(parseLispNumber);
    if (coordinateTypes.some(value => value.effectivePrecision === 'unsupported-long')) return null;
    return coordinateTypes.some(value => value.effectivePrecision === 'double') ? 'double' : 'single';
  });
}

function captureJsRandom(random) {
  const calls = [];
  const originalInteger = random.integer.bind(random);
  const originalRanFloat = random.ranFloat.bind(random);
  random.integer = (minimum, maximum) => {
    const value = originalInteger(minimum, maximum);
    calls.push({ method: 'integer', args: [minimum, maximum], value: numberForJson(value) });
    return value;
  };
  random.ranFloat = (left, right, options = {}) => {
    const value = originalRanFloat(left, right, options);
    calls.push({
      method: 'ranFloat',
      args: [left, right],
      endpointPrecisions: [options.aPrecision ?? 'double', options.bPrecision ?? 'double'],
      value: numberForJson(value),
    });
    return value;
  };
  return calls;
}

function expectedRandomCall(event) {
  const args = event.args.map(parseLispNumber);
  const integer = args.every(value => value.effectivePrecision === 'exact');
  return {
    method: integer ? 'integer' : 'ranFloat',
    args: event.args,
    value: event.value,
    expectedEndpointPrecisions: integer ? null : args.map(value =>
      value.effectivePrecision === 'double' ? 'double' : 'single'),
  };
}

function randomCallParity(expectedEvent, actualEvent) {
  if (!expectedEvent || !actualEvent || expectedEvent.method !== actualEvent.method ||
      expectedEvent.args.length !== actualEvent.args.length) return false;
  const argsMatch = expectedEvent.args.every((raw, index) => {
    const actualArgument = actualEvent.method === 'ranFloat' && actualEvent.endpointPrecisions[index] === 'single'
      ? Math.fround(actualEvent.args[index])
      : actualEvent.args[index];
    return Object.is(comparedLispValue(raw), actualArgument);
  });
  const valueMatch = Object.is(comparedLispValue(expectedEvent.value), actualEvent.value === '-0' ? -0 : actualEvent.value);
  const precisionMatch = expectedEvent.method !== 'ranFloat' ||
    JSON.stringify(expectedEvent.expectedEndpointPrecisions) === JSON.stringify(actualEvent.endpointPrecisions);
  return argsMatch && valueMatch && precisionMatch;
}

function firstRandomDifference(expectedCalls, actualCalls) {
  const length = Math.max(expectedCalls.length, actualCalls.length);
  for (let index = 0; index < length; index += 1) {
    if (!randomCallParity(expectedCalls[index], actualCalls[index])) {
      return { index, expected: expectedCalls[index] ?? null, actual: actualCalls[index] ?? null };
    }
  }
  return null;
}

function firstPointDifference(expectedPoints, actualPoints) {
  const length = Math.max(expectedPoints.length, actualPoints.length);
  for (let index = 0; index < length; index += 1) {
    const expected = expectedPoints[index];
    const actual = actualPoints[index];
    if (!expected || !actual) {
      return {
        index,
        axes: ['x', 'y', 'visibility'],
        expected: expected ?? null,
        actual: actual ? actual.map(numberForJson) : null,
      };
    }
    const axes = ['x', 'y', 'visibility'].filter((axis, component) =>
      !Object.is(comparedLispValue(expected[component]), actual[component]));
    if (axes.length) {
      return { index, axes, expected, actual: actual.map(numberForJson) };
    }
  }
  return null;
}

function countMismatchedCoordinates(expectedPoints, actualPoints) {
  let count = Math.abs(expectedPoints.length - actualPoints.length) * 3;
  for (let index = 0; index < Math.min(expectedPoints.length, actualPoints.length); index += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      if (!Object.is(comparedLispValue(expectedPoints[index][axis]), actualPoints[index][axis])) count += 1;
    }
  }
  return count;
}

function compareCase(item, spec) {
  const indexInputs = { fdex: item.fdex, tdex: item.tdex, from: item.from, to: item.to };
  const expectedIndexInputs = { fdex: spec.fdex, tdex: spec.tdex, from: spec.from, to: spec.to };
  assert(JSON.stringify(indexInputs) === JSON.stringify(expectedIndexInputs),
    `Source/report index inputs differ for seed ${item.seed} ${item.name}`);

  const sourceReportNumericMatch = sameNumericTree(spec.points, item.points);
  const sourceReportSignedZeroMismatch = hasSignedZeroDifference(spec.points, item.points);
  const canonicalIndexes = item.fdex === 0 && item.tdex === spec.points.length - 1 && item.from === 0 && item.to === 1;
  const edgePrecisions = sourceEdgePrecisions(spec.points);
  const reasons = [];
  if (!canonicalIndexes) {
    reasons.push('The current aaronFreePath API has no FDEX/TDEX/FROM/TO inputs; this noncanonical call mapping is unclassified.');
  }
  if (!sourceReportNumericMatch) {
    reasons.push(sourceReportSignedZeroMismatch
      ? 'The probe source has a signed-zero value that the captured CASE header prints as positive zero; the exact signed-zero state is not claimed.'
      : 'The probe source and captured CASE header differ numerically; the exact input cannot be reconstructed.');
  }
  if (edgePrecisions.includes(null)) {
    reasons.push('The probe uses a coordinate float type that the current API cannot express as single or double precision.');
  }
  const supported = canonicalIndexes && sourceReportNumericMatch && !edgePrecisions.includes(null);

  const row = {
    seed: item.seed,
    name: item.name,
    classification: supported ? 'compared' : 'unclassified',
    classificationReasons: reasons,
    input: {
      indexArguments: indexInputs,
      sourceIndexArguments: expectedIndexInputs,
      indexArgumentMapping: canonicalIndexes
        ? 'Matches the canonical closed-list regime represented by aaronFreePath.'
        : 'No index transform, rotation, slice, or reverse mapping was applied.',
      sourcePointTokens: spec.points,
      observedCaseHeaderPointTokens: item.points,
      sourceAndObservedNumericInputsMatch: sourceReportNumericMatch,
      sourceAndObservedSignedZeroMismatch: sourceReportSignedZeroMismatch,
      sourceNumericTypes: spec.points.map(point => point.map(parseLispNumber)),
      edgePrecisions,
    },
    stateReconstruction: {
      original: {
        method: 'The probe calls MAKE-RANDOM-STATE-FROM-SEED once for each CASE and binds that fresh state to *RANDOM-STATE*.',
        seed: item.seed,
        offsetBeforeCall: 0,
      },
      javascript: {
        method: 'new Allegro501Random(seed), with no draws before aaronFreePath',
        seed: item.seed,
        offsetBeforeCall: 0,
        initialPreviewNextInt100: (() => {
          const preview = new Allegro501Random(item.seed);
          return [preview.nextInt(100), preview.nextInt(100), preview.nextInt(100)];
        })(),
      },
      observedValuesUsedToSeedOrAdvanceJavascriptState: false,
    },
    observed: {
      randomCalls: item.randomCalls.map(expectedRandomCall),
      returnedPoints: item.result,
      inputAfter: item.edgeAfter,
      nextRandomRaw: item.nextRandom,
      distanceCallCount: item.distanceCallCount,
      distanceCalls: item.distanceCalls,
      inputUnchanged: JSON.stringify(item.points) === JSON.stringify(item.edgeAfter),
    },
  };

  if (!supported) {
    row.javascript = null;
    row.comparison = null;
    return row;
  }

  const random = new Allegro501Random(item.seed);
  const javascriptRandomCalls = captureJsRandom(random);
  const inputPoints = spec.points.map(point => point.map(raw => {
    const parsed = parseLispNumber(raw);
    return parsed.effectivePrecision === 'single' ? Math.fround(parsed.value) : parsed.value;
  }));
  const inputBefore = pointListForJson(inputPoints);
  const actualPoints = aaronFreePath(inputPoints, random, { edgePrecisions });
  const inputUnchanged = JSON.stringify(inputBefore) === JSON.stringify(pointListForJson(inputPoints));
  const nextRandom = random.nextInt(100000);
  const randomDifference = firstRandomDifference(row.observed.randomCalls, javascriptRandomCalls);
  const pointDifference = firstPointDifference(item.result, actualPoints);
  const randomSequenceMatches = randomDifference === null && item.randomCalls.length === javascriptRandomCalls.length;
  const returnedPointsMatch = pointDifference === null;
  const nextRandomMatches = nextRandom === item.nextRandom.value;
  const inputImmutabilityMatches = row.observed.inputUnchanged && inputUnchanged;
  row.javascript = {
    randomCalls: javascriptRandomCalls,
    returnedPoints: pointListForJson(actualPoints),
    inputBefore: inputBefore,
    inputAfter: pointListForJson(inputPoints),
    inputUnchanged,
    nextRandom,
  };
  row.comparison = {
    randomSequence: {
      matches: randomSequenceMatches,
      observedCount: item.randomCalls.length,
      javascriptCount: javascriptRandomCalls.length,
      firstDifference: randomDifference,
    },
    returnedPoints: {
      matches: returnedPointsMatch,
      observedCount: item.result.length,
      javascriptCount: actualPoints.length,
      mismatchedCoordinateCount: countMismatchedCoordinates(item.result, actualPoints),
      firstDifference: pointDifference,
    },
    inputImmutability: {
      observedInputUnchanged: row.observed.inputUnchanged,
      javascriptInputUnchanged: inputUnchanged,
      matches: inputImmutabilityMatches,
    },
    nextRandom: {
      matches: nextRandomMatches,
      observed: item.nextRandom.value,
      javascript: nextRandom,
    },
    strictParity: randomSequenceMatches && returnedPointsMatch && nextRandomMatches && inputImmutabilityMatches,
  };
  return row;
}

async function main() {
  const [evidencePath = DEFAULT_EVIDENCE, probePath = DEFAULT_PROBE, outputPath = DEFAULT_OUTPUT] = process.argv.slice(2);
  assert(process.argv.length <= 5,
    'Usage: node research/tools/compare-free-path-boundary-matrix.mjs [EVIDENCE.json] [PROBE.cl] [OUTPUT.json]');
  const [evidenceBytes, probeBytes, apiBytes, randomBytes, comparisonHelperBytes] = await Promise.all([
    readFile(evidencePath),
    readFile(probePath),
    readFile('engine/src/aaron-point-geometry.js'),
    readFile('engine/src/allegro-random.js'),
    readFile('research/tools/compare-free-path-boundary-matrix.mjs'),
  ]);
  const evidence = JSON.parse(evidenceBytes.toString('utf8'));
  const probeText = probeBytes.toString('utf8');
  const sourceSpecs = parseProbeSpecs(probeText);
  assert(evidence.schema === 'aaron-free-path-boundary-evidence-v1', 'Unexpected source evidence schema');
  assert(evidence.cases.length === 40 && evidence.captureChecks?.errorCount === 0,
    'Source evidence is not the complete error-free 40-case matrix');
  const probeSha256 = hashes(probeBytes);
  assert(probeSha256 === evidence.controls.checkedInProbeSha256 &&
    probeSha256 === evidence.controls.observerProbeSha256,
  'Checked-in probe bytes differ from the source-bound evidence');
  assert(evidence.controls.allComparedOutputsAndSourcesMatch === true,
    'Source-bound scene triplet is not marked matched in retained evidence');
  const observerReportPath = evidence.controls.observerReportPath;
  const observerReportBytes = await readFile(observerReportPath);
  const observerReportSha256 = hashes(observerReportBytes);
  assert(observerReportSha256 === evidence.controls.observerReportSha256,
    'Raw observer report hash differs from the retained source-bound evidence');
  const observerReportChecks = validateObserverReport(
    observerReportBytes.toString('utf8'), evidence.cases, sourceSpecs,
  );
  const expectedNames = sourceSpecs.map(spec => spec.name);
  const expectedPairs = new Set([1, 1234].flatMap(seed => expectedNames.map(name => `${seed}/${name}`)));
  const evidencePairs = evidence.cases.map(item => `${item.seed}/${item.name}`);
  assert(evidencePairs.length === 40 && new Set(evidencePairs).size === 40 &&
    evidencePairs.every(pair => expectedPairs.has(pair)) && expectedPairs.size === 40,
  'Evidence must contain exactly all 40 (seed,name) pairs');

  const specByName = new Map(sourceSpecs.map(spec => [spec.name, spec]));
  const rows = evidence.cases.map(item => {
    const spec = specByName.get(item.name);
    assert(spec, `No source spec for case ${item.name}`);
    return compareCase(item, spec);
  });
  const compared = rows.filter(row => row.classification === 'compared');
  const unclassified = rows.filter(row => row.classification === 'unclassified');
  assert(rows.length === 40 && compared.length === 30 && unclassified.length === 10,
    `Unexpected comparison scope: ${compared.length} compared / ${unclassified.length} unclassified`);
  const strictParityCount = compared.filter(row => row.comparison.strictParity).length;
  const randomParityCount = compared.filter(row => row.comparison.randomSequence.matches).length;
  const returnedPointParityCount = compared.filter(row => row.comparison.returnedPoints.matches).length;
  const nextRandomParityCount = compared.filter(row => row.comparison.nextRandom.matches).length;
  const inputImmutabilityParityCount = compared.filter(row => row.comparison.inputImmutability.matches).length;

  const report = {
    schema: 'aaron-free-path-boundary-js-comparison-v1',
    generatedAt: new Date().toISOString(),
    method: {
      runtime: 'Offline JavaScript only; no original-runtime execution or native debugger use.',
      inputEvidencePath: path.relative(process.cwd(), path.resolve(evidencePath)).split(path.sep).join('/'),
      inputEvidenceSha256: hashes(evidenceBytes),
      inputEvidenceBytes: evidenceBytes.length,
      probeSourcePath: path.relative(process.cwd(), path.resolve(probePath)).split(path.sep).join('/'),
      probeSourceSha256: probeSha256,
      probeSourceBytes: probeBytes.length,
      observerReportPath,
      observerReportSha256,
      observerReportBytes: observerReportBytes.length,
      observerReportChecks: {
        completeCaseCount: observerReportChecks.caseCount,
        errorCount: observerReportChecks.errorCount,
        mainReturned: true,
        noUnknownRecords: true,
        exactCasePairs: true,
      },
      javascriptApiPath: 'engine/src/aaron-point-geometry.js',
      javascriptApiSha256: hashes(apiBytes),
      javascriptApiBytes: apiBytes.length,
      randomImplementationPath: 'engine/src/allegro-random.js',
      randomImplementationSha256: hashes(randomBytes),
      randomImplementationBytes: randomBytes.length,
      comparisonHelperPath: 'research/tools/compare-free-path-boundary-matrix.mjs',
      comparisonHelperSha256: hashes(comparisonHelperBytes),
      comparisonHelperBytes: comparisonHelperBytes.length,
      inputStateReconstruction: 'Each case gets a fresh original state from MAKE-RANDOM-STATE-FROM-SEED(seed); JavaScript uses a fresh Allegro501Random(seed) at offset zero. Captured RAN returns and point results are comparison targets only, never inputs to state reconstruction.',
      numericTypeHandling: 'Source probe literals are retained verbatim, including s0/d0. Lisp single-float report values without a suffix are compared after Math.fround; double-float values retain binary64 precision. Negative-zero source/report disagreement is unclassified.',
      distanceCallHandling: 'The portable evidence stores RAN and XYDIST calls in separate arrays. This comparison checks the full RAN sequence and preserves the XYDIST records, but the split arrays do not preserve or establish shared RAN/XYDIST event interleaving.',
      representabilityRule: 'Strict replay is limited to FDEX=0, TDEX=point-count-1, FROM=0, TO=1, where the closed-list API input shape applies. No range rows are sliced, rotated, or reversed.',
      comparedRows: compared.length,
      unclassifiedRows: unclassified.length,
      strictParityRows: strictParityCount,
      randomSequenceParityRows: randomParityCount,
      returnedPointParityRows: returnedPointParityCount,
      nextRandomParityRows: nextRandomParityCount,
      inputImmutabilityParityRows: inputImmutabilityParityCount,
      wholePaintingParity: false,
    },
    unclassifiedSummary: {
      noncanonicalIndexRows: unclassified.filter(row =>
        row.input.indexArguments.fdex !== 0 ||
        row.input.indexArguments.tdex !== row.input.sourcePointTokens.length - 1 ||
        row.input.indexArguments.from !== 0 || row.input.indexArguments.to !== 1).length,
      signedZeroInputRows: unclassified.filter(row => row.input.sourceAndObservedSignedZeroMismatch).length,
      reasonCounts: Object.fromEntries([...new Set(unclassified.flatMap(row => row.classificationReasons))].map(reason => [
        reason,
        unclassified.filter(row => row.classificationReasons.includes(reason)).length,
      ])),
    },
    limitations: [
      'The 30 strict comparisons cover only canonical closed-list calls with source/report input agreement; they do not establish a complete FREE-PATH contract.',
      'Eight noncanonical FDEX/TDEX/FROM/TO cases remain unclassified because the current JavaScript API cannot accept those index values; no index mapping is inferred.',
      'The two negative-zero rows remain unclassified because the probe source contains -0.0d0 while the captured CASE header records +0.0d0.',
      'This comparison does not establish natural caller policy, scene-generation parity, or whole-painting parity.',
    ],
    cases: rows,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    outputPath,
    inputEvidenceSha256: report.method.inputEvidenceSha256,
    probeSourceSha256: report.method.probeSourceSha256,
    totalRows: rows.length,
    comparedRows: compared.length,
    unclassifiedRows: unclassified.length,
    strictParityRows: strictParityCount,
    randomSequenceParityRows: randomParityCount,
    returnedPointParityRows: returnedPointParityCount,
    nextRandomParityRows: nextRandomParityCount,
    inputImmutabilityParityRows: inputImmutabilityParityCount,
    unclassifiedByName: unclassified.map(row => ({ seed: row.seed, name: row.name, reasons: row.classificationReasons })),
  }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
