#!/usr/bin/env node

// Validate a source-bound, post-MAIN FREE-PATH observer and compare its
// isolated forward edges with JS plus two explicitly provisional stop models.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Allegro501Random } from '../../engine/src/allegro-random.js';
import { aaronFreePath } from '../../engine/src/aaron-point-geometry.js';
import { verifyLocalAaronTriplet } from './verify-local-aaron-triplet.mjs';

const expectedCases = [
  [522862, 'known-counterexample'],
  [256819, 'step-sum-early'],
  [348048, 'point-distance-early'],
];
const numericToken = /^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+))(?:[eEsSfFdDlL][+-]?\d+)?$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readNumbers(source) {
  let index = 0;
  const skip = () => { while (/\s/.test(source[index] ?? '')) index += 1; };
  const read = () => {
    skip();
    assert(index < source.length, 'Unexpected end of Lisp number list');
    if (source[index] === '(') {
      index += 1;
      const values = [];
      for (;;) {
        skip();
        assert(index < source.length, 'Unclosed Lisp number list');
        if (source[index] === ')') { index += 1; return values; }
        values.push(read());
      }
    }
    const start = index;
    while (index < source.length && !/[\s()]/.test(source[index])) index += 1;
    const token = source.slice(start, index);
    assert(numericToken.test(token), `Unsupported Lisp number: ${token}`);
    return Number(token.replace(/[sSfFdDlL]/g, 'e'));
  };
  const value = read();
  skip();
  assert(index === source.length, 'Unexpected text after Lisp number list');
  return value;
}

function readNumber(source) {
  const values = readNumbers(`(${source})`);
  assert(values.length === 1 && Number.isFinite(values[0]), `Malformed Lisp number: ${source}`);
  return values[0];
}

function parseReport(text, requiredEnd) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  assert(lines[0] === 'BEGIN free-path-stop-boundary-v2', 'Probe BEGIN marker missing');
  assert(lines.at(-2) === requiredEnd && lines.at(-1) === '', 'Probe END marker is not terminal');
  assert(lines.includes('INSTALL main-wrapper=OUTER-OF-WRITER-STREAM'),
    'Post-MAIN MAIN-wrapper installation marker missing');
  let current = null;
  let restored = false;
  let errors = 0;
  let endCases = 0;
  for (const line of lines) {
    if (line.startsWith('CASE ')) {
      assert(current === null, 'Nested CASE record');
      const match = /^CASE seed=(\d+) name=([a-z0-9-]+) POINTS (.+) FDEX 0 TDEX 1 FROM 0 TO 1$/.exec(line);
      assert(match, `Malformed case header: ${line}`);
      const points = readNumbers(match[3]);
      assert(JSON.stringify(points) === JSON.stringify([[0, 0, 0], [10, 0, 1]]),
        'Expected a single visible forward edge and visibility-gated closing edge');
      current = {
        seed: Number(match[1]), name: match[2], points,
        randomCalls: [], distanceCalls: [], result: null, edgeAfter: null, nextRandom: null,
      };
    } else if (line.startsWith('RAN ')) {
      assert(current !== null, 'RAN outside CASE');
      const arrow = line.indexOf(' => ');
      assert(arrow > 0, 'Malformed RAN row');
      const args = readNumbers(line.slice('RAN '.length, arrow));
      assert(Array.isArray(args) && args.length === 2, 'RAN needs a two-number interval');
      const value = readNumber(line.slice(arrow + 4));
      current.randomCalls.push({ args, value });
    } else if (line.startsWith('XYDIST ')) {
      assert(current !== null, 'XYDIST outside CASE');
      const arrow = line.indexOf(' => ');
      assert(arrow > 0, 'Malformed XYDIST row');
      const points = readNumbers(`(${line.slice('XYDIST '.length, arrow)})`);
      assert(Array.isArray(points) && points.length === 2, 'XYDIST needs two point triples');
      current.distanceCalls.push({ points, result: readNumber(line.slice(arrow + 4)) });
    } else if (line.startsWith('RESULT ')) {
      assert(current !== null, 'RESULT outside CASE');
      current.result = readNumbers(line.slice('RESULT '.length));
    } else if (line.startsWith('EDGE-AFTER ')) {
      assert(current !== null, 'EDGE-AFTER outside CASE');
      current.edgeAfter = readNumbers(line.slice('EDGE-AFTER '.length));
    } else if (line.startsWith('NEXT-RANDOM ')) {
      const match = /^NEXT-RANDOM (\d+) STATUS (OK|ERROR)$/.exec(line);
      assert(current !== null && match, `Malformed NEXT-RANDOM row: ${line}`);
      current.nextRandom = { value: Number(match[1]), status: match[2] };
    } else if (line.startsWith('ERROR ')) {
      errors += 1;
    } else if (line === 'ENDCASE') {
      assert(current !== null && current.result !== null && current.edgeAfter !== null &&
        current.nextRandom !== null, 'Incomplete case record');
      assert(current.nextRandom.status === 'OK', `Random checkpoint failed for ${current.name}`);
      assert(JSON.stringify(current.edgeAfter) === JSON.stringify(current.points),
        `FREE-PATH mutated input for ${current.name}`);
      assert(Array.isArray(current.result) && current.result.every((point) =>
        Array.isArray(point) && point.length === 3), `Malformed result points for ${current.name}`);
      current.resultPointCount = current.result.length;
      current = null;
      endCases += 1;
    } else if (line === 'RESTORED T') {
      restored = true;
    }
  }
  assert(current === null, 'Report ended within a case');
  assert(endCases === expectedCases.length, `Expected ${expectedCases.length} complete cases`);
  assert(errors === 0, `Probe reported ${errors} errors`);
  assert(restored, 'RAN and XYDIST restoration was not confirmed');
  // Re-parse case boundaries to preserve order and reject unexpected seeds.
  const headers = lines.filter((line) => line.startsWith('CASE ')).map((line) => {
    const match = /^CASE seed=(\d+) name=([a-z0-9-]+)/.exec(line);
    assert(match, `Malformed case header: ${line}`);
    return [Number(match[1]), match[2]];
  });
  assert(JSON.stringify(headers) === JSON.stringify(expectedCases), 'Unexpected seed order or names');

  const parsed = [];
  current = null;
  for (const line of lines) {
    if (line.startsWith('CASE ')) {
      const match = /^CASE seed=(\d+) name=([a-z0-9-]+) POINTS (.+) FDEX 0 TDEX 1 FROM 0 TO 1$/.exec(line);
      current = { seed: Number(match[1]), name: match[2], points: readNumbers(match[3]),
        randomCalls: [], distanceCalls: [], result: null, edgeAfter: null, nextRandom: null };
    } else if (current && line.startsWith('RAN ')) {
      const arrow = line.indexOf(' => ');
      current.randomCalls.push({ args: readNumbers(line.slice(4, arrow)), value: readNumber(line.slice(arrow + 4)) });
    } else if (current && line.startsWith('XYDIST ')) {
      const arrow = line.indexOf(' => ');
      current.distanceCalls.push({ points: readNumbers(`(${line.slice(7, arrow)})`), result: readNumber(line.slice(arrow + 4)) });
    } else if (current && line.startsWith('RESULT ')) current.result = readNumbers(line.slice(7));
    else if (current && line.startsWith('EDGE-AFTER ')) current.edgeAfter = readNumbers(line.slice(11));
    else if (current && line.startsWith('NEXT-RANDOM ')) {
      const match = /^NEXT-RANDOM (\d+) STATUS (OK|ERROR)$/.exec(line);
      current.nextRandom = { value: Number(match[1]), status: match[2] };
    } else if (line === 'ENDCASE' && current) { parsed.push(current); current = null; }
  }
  return { cases: parsed, errorCount: errors, restored, endCaseCount: endCases };
}

function rounded(value) {
  return Number.isInteger(value) ? value : Math.fround(value);
}

function compareJavaScript(item) {
  const random = new Allegro501Random(item.seed);
  const calls = [];
  const observed = {
    integer(min, max) {
      const value = random.integer(min, max); calls.push({ args: [min, max], value }); return value;
    },
    ranFloat(a, b, options) {
      const value = random.ranFloat(a, b, options); calls.push({ args: [a, b], value }); return value;
    },
  };
  const result = aaronFreePath(item.points, observed);
  const nextRandom = random.nextInt(100000);
  const originalCalls = item.randomCalls.map(({ args, value }) => ({ args, value: rounded(value) }));
  const originalResult = item.result.map((point) => point.map(rounded));
  const jsResult = result.map((point) => point.map(rounded));
  const callsMatch = JSON.stringify(calls) === JSON.stringify(originalCalls);
  const pointsMatch = JSON.stringify(jsResult) === JSON.stringify(originalResult);
  return {
    randomCallsMatch: callsMatch,
    returnedPointsMatch: pointsMatch,
    followingRandomMatches: nextRandom === item.nextRandom.value,
    followingRandom: { original: item.nextRandom.value, javascript: nextRandom },
    originalRandomCallCount: originalCalls.length,
    javascriptRandomCallCount: calls.length,
    originalResultPointCount: originalResult.length,
    javascriptResultPointCount: jsResult.length,
    firstRandomMismatch: callsMatch ? null : Array.from({ length: Math.max(calls.length, originalCalls.length) },
      (_, index) => index).find((index) => JSON.stringify(calls[index]) !== JSON.stringify(originalCalls[index])) ?? null,
    firstPointMismatch: pointsMatch ? null : Array.from({ length: Math.max(jsResult.length, originalResult.length) },
      (_, index) => index).find((index) => JSON.stringify(jsResult[index]) !== JSON.stringify(originalResult[index])) ?? null,
    boundedParity: callsMatch && pointsMatch && nextRandom === item.nextRandom.value,
  };
}

function compareStopModels(item) {
  const selection = item.randomCalls[0];
  assert(JSON.stringify(selection.args) === '[8,14]', `Unexpected edge selector in ${item.name}`);
  const random = new Allegro501Random(item.seed);
  const selected = random.integer(8, 14);
  assert(selected === selection.value, `Seed model selection differs from captured RAN in ${item.name}`);
  const modeledCalls = [{ args: [8, 14], value: selected }];
  const iterations = [];
  for (let index = 0; index < selected; index += 1) {
    const scale = random.ranFloat(0.7, 1.3, { aPrecision: 'single', bPrecision: 'single' });
    const wiggle = random.ranFloat(0.015, 0.03, { aPrecision: 'single', bPrecision: 'single' });
    const angle = random.ranFloat(0, 6.28, { aPrecision: 'single', bPrecision: 'single' });
    modeledCalls.push({ args: [0.7, 1.3], value: scale },
      { args: [0.015, 0.03], value: wiggle }, { args: [0, 6.28], value: angle });
    iterations.push({ scale, wiggle, angle });
  }
  const capturedCalls = item.randomCalls.map(({ args, value }) => ({ args, value: rounded(value) }));
  const matchedPrefix = JSON.stringify(capturedCalls) ===
    JSON.stringify(modeledCalls.slice(0, capturedCalls.length).map(({ args, value }) => ({
      args, value: rounded(value),
    })));
  assert(matchedPrefix, `Captured random calls diverge from the seed stream before FREE-PATH stops in ${item.name}`);
  const capturedSteps = (item.randomCalls.length - 1) / 3;
  assert(Number.isInteger(capturedSteps) && item.distanceCalls.length === 1 &&
    item.distanceCalls[0].result === 10,
  `Expected exactly one length-10 visible edge in ${item.name}`);
  let progressed = 0;
  let spineX = 0;
  let spineY = 0;
  let stepCrossing = null;
  let pointCrossing = null;
  const trace = iterations.map(({ scale, wiggle, angle }, index) => {
    const step = Math.fround(Math.fround(10 / selected) * scale);
    progressed = Math.fround(progressed + step);
    spineX = Math.fround(spineX + step);
    const offsetLength = Math.fround(step * wiggle);
    const pointX = Math.fround(spineX + Math.fround(offsetLength * Math.fround(Math.cos(angle))));
    const pointY = Math.fround(spineY + Math.fround(offsetLength * Math.fround(Math.sin(angle))));
    const pointDistance = Math.fround(Math.sqrt(pointX * pointX + pointY * pointY));
    if (stepCrossing === null && progressed >= 10) stepCrossing = index + 1;
    if (pointCrossing === null && pointDistance >= 10) pointCrossing = index + 1;
    return { step, progressed, pointX, pointY, pointDistance };
  });
  return {
    selectedSteps: selected,
    originalConsumedSteps: capturedSteps,
    capturedRandomPrefixMatchesSeedModel: matchedPrefix,
    modeledStepSumStop: stepCrossing ?? selected,
    modeledEmittedPointDistanceStop: pointCrossing ?? selected,
    modelAgreementWithOriginal: {
      stepSum: capturedSteps === (stepCrossing ?? selected),
      emittedPointDistance: capturedSteps === (pointCrossing ?? selected),
    },
    reconstructedProgressTrace: trace,
    traceBasis: 'single-float replay of the local seeded RNG; every captured RAN call is checked as an exact rounded prefix, but no original internal variable is observed',
  };
}

async function main() {
  const [beforeRoot, observerRoot, afterRoot, outputPath] = process.argv.slice(2);
  if (!beforeRoot || !observerRoot || !afterRoot || !outputPath || process.argv.length !== 6) {
    console.error('Usage: node research/tools/derive-free-path-stop-boundary-v2-evidence.mjs <before-root> <observer-root> <after-root> <output.json>');
    process.exitCode = 2;
    return;
  }
  const verified = await verifyLocalAaronTriplet(beforeRoot, observerRoot, afterRoot);
  const [before, observer, after] = verified.runs;
  assert(observer.summary.requiredProbeOutputName === 'aaron-free-path-stop-boundary-v2.txt',
    'Unexpected required report name');
  const reportPath = path.join(observer.capturePath, verified.requiredReport);
  const reportBytes = await readFile(reportPath);
  const parsed = parseReport(reportBytes.toString('utf8'), verified.endMarker);
  const probePath = path.resolve('research/introspection/free-path-stop-boundary-v2.cl');
  const probeHash = createHash('sha256').update(await readFile(probePath)).digest('hex');
  assert(probeHash === verified.probeSourceHash, 'Checked-in probe differs from captured source');

  const cases = parsed.cases.map((item, index) => {
    const expected = expectedCases[index];
    assert(item.seed === expected[0] && item.name === expected[1], 'Unexpected case order');
    assert(JSON.stringify(item.points) === JSON.stringify([[0, 0, 0], [10, 0, 1]]),
      'Visibility gate did not isolate the forward edge');
    return {
      seed: item.seed,
      name: item.name,
      points: item.points,
      fdex: 0, tdex: 1, from: 0, to: 1,
      distanceCall: item.distanceCalls[0],
      randomCalls: item.randomCalls,
      stopModelComparison: compareStopModels(item),
      result: item.result,
      edgeAfter: item.edgeAfter,
      nextRandom: item.nextRandom,
      javascriptComparison: compareJavaScript(item),
    };
  });
  const aa0 = await readFile(path.join(observer.capturePath, 'aa0'));
  const headerLine = aa0.subarray(0, 64).toString('ascii').split(/\r?\n/, 1)[0].trim();
  const [width, height, headerBytes] = headerLine.split(/\s+/).map(Number);
  assert([width, height, headerBytes].every(Number.isInteger), `Invalid AA0 header: ${headerLine}`);
  const summarize = (run) => ({
    runId: run.summary.runId, mode: run.summary.mode, complete: run.summary.complete,
    startedAt: run.summary.startedAt, finishedAt: run.summary.finishedAt,
    runnerSha256: run.summary.runnerSha256, installerSha256: run.summary.installerSha256,
    aa0Sha256: run.summary.aa0Sha256, sceneReportSha256: run.summary.sceneReportSha256,
  });
  const evidence = {
    schema: 'aaron-free-path-stop-boundary-evidence-v2',
    question: 'Do visibility-isolated length-10 edges distinguish two candidate FREE-PATH stop models?',
    controls: {
      before: summarize(before), observer: summarize(observer), after: summarize(after),
      observerProbeSha256: verified.probeSourceHash,
      checkedInProbePath: path.relative(process.cwd(), probePath).split(path.sep).join('/'),
      checkedInProbeSha256: probeHash,
      observerReportSha256: createHash('sha256').update(reportBytes).digest('hex'),
      observerReportPath: path.relative(process.cwd(), reportPath).split(path.sep).join('/'),
      requiredEndMarker: verified.endMarker,
      drawingAndSceneOutputHashes: verified.artifactHashes,
      ordinaryStagedSourceHashes: verified.sourceHashes,
      allComparedOutputsAndSourcesMatch: true,
      aa0Header: { width, height, headerBytes },
    },
    captureChecks: {
      caseCount: parsed.cases.length,
      endCaseCount: parsed.endCaseCount,
      errorCount: parsed.errorCount,
      functionBindingsRestored: parsed.restored,
      allPrivateInputListsUnchanged: true,
      onlyForwardEdgeExecuted: true,
      javascriptComparisonsPassed: cases.every(({ javascriptComparison }) => javascriptComparison.boundedParity),
    },
    cases,
    interpretation: [
      'A zero-visibility first vertex suppresses the closed path’s reverse edge because FREE-PATH gates each edge by its target visibility; the observed single XYDIST call verifies one-edge isolation.',
      'The step-sum and emitted-point-distance traces are candidate arithmetic models reconstructed from captured RAN values; neither trace directly reads an original internal variable.',
      'Original consumed-step counts decide whether either candidate predicts these finite cases. Agreement does not prove that model generally.',
      'JavaScript parity is reported independently for random calls, returned points, and the following random checkpoint.',
    ],
    limitations: [
      'Three seeds and one single-float, integer-coordinate, length-10 forward edge do not define the full FREE-PATH domain.',
      'The post-MAIN call does not establish a natural caller or expose the compiled function source or internal stop variable.',
      'Bounded edge parity does not establish natural-caller or whole-painting generator parity.',
    ],
  };
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    outputPath,
    aa0Header: evidence.controls.aa0Header,
    outputsAndSourcesMatch: true,
    cases: cases.map(({ seed, name, stopModelComparison, javascriptComparison }) => ({
      seed, name,
      selected: stopModelComparison.selectedSteps,
      originalConsumed: stopModelComparison.originalConsumedSteps,
      stepSumPrediction: stopModelComparison.modeledStepSumStop,
      emittedPointPrediction: stopModelComparison.modeledEmittedPointDistanceStop,
      modelAgreementWithOriginal: stopModelComparison.modelAgreementWithOriginal,
      javascriptComparison,
    })),
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
}
