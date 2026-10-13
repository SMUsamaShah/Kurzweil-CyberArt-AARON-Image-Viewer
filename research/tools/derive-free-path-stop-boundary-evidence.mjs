#!/usr/bin/env node

// Validate a complete original-runtime FREE-PATH near-boundary capture,
// compare those bounded inputs with JS, and retain portable control hashes.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Allegro501Random } from '../../engine/src/allegro-random.js';
import { aaronFreePath } from '../../engine/src/aaron-point-geometry.js';
import { verifyLocalAaronTriplet } from './verify-local-aaron-triplet.mjs';

const numberToken = /^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+))(?:[eEsSfFdDlL][+-]?\d+)?$/;
const casePattern = /^CASE seed=(\d+) name=([A-Za-z0-9-]+) POINTS (.+) FDEX (-?\d+) TDEX (-?\d+) FROM (-?\d+) TO (-?\d+)$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function numeric(token) {
  assert(numberToken.test(token), `Unsupported Lisp number: ${token}`);
  return Number(token.replace(/[sSfFdDlL]/g, 'e'));
}

function parseNumericList(source) {
  let index = 0;
  const skipSpace = () => { while (/\s/.test(source[index] ?? '')) index += 1; };
  const read = () => {
    skipSpace();
    assert(index < source.length, 'Unexpected end of Lisp list');
    if (source[index] === '(') {
      index += 1;
      const values = [];
      for (;;) {
        skipSpace();
        assert(index < source.length, 'Unclosed Lisp list');
        if (source[index] === ')') { index += 1; return values; }
        values.push(read());
      }
    }
    const start = index;
    while (index < source.length && !/[\s()]/.test(source[index])) index += 1;
    return numeric(source.slice(start, index));
  };
  const value = read();
  skipSpace();
  assert(index === source.length, 'Unexpected text after Lisp list');
  return value;
}

function parseCaseHead(line) {
  const match = casePattern.exec(line);
  assert(match, `Malformed CASE header: ${line.slice(0, 180)}`);
  const points = parseNumericList(match[3]);
  assert(Array.isArray(points) && points.length === 2 &&
    points.every((point) => Array.isArray(point) && point.length === 3),
  'Expected a two-point list of triples');
  return {
    seed: Number(match[1]), name: match[2], points,
    fdex: Number(match[4]), tdex: Number(match[5]),
    from: Number(match[6]), to: Number(match[7]),
    distanceCalls: [], randomCalls: [], result: null,
    edgeAfter: null, nextRandom: null,
  };
}

function parseReport(text, requiredEndMarker) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  assert(lines[0] === 'BEGIN free-path-stop-boundary', 'Probe BEGIN marker is missing');
  assert(lines.at(-2) === requiredEndMarker && lines.at(-1) === '',
    'Probe report is missing its terminal END marker');
  assert(lines.includes('INSTALL main-wrapper=OUTER-OF-WRITER-STREAM'),
    'Post-MAIN wrapper installation marker is missing');

  const cases = [];
  let current = null;
  let restored = false;
  let errorCount = 0;
  let endCount = 0;
  for (const line of lines) {
    if (line.startsWith('CASE ')) {
      assert(current === null, 'Nested CASE record');
      current = parseCaseHead(line);
    } else if (line.startsWith('XYDIST ')) {
      assert(current !== null, 'XYDIST outside a CASE');
      const arrow = line.indexOf(' => ');
      assert(arrow > 0, 'Malformed XYDIST record');
      const points = parseNumericList(`(${line.slice('XYDIST '.length, arrow)})`);
      assert(Array.isArray(points) && points.length === 2,
        'XYDIST needs two points');
      current.distanceCalls.push({ points, result: numeric(line.slice(arrow + 4)) });
    } else if (line.startsWith('RAN ')) {
      assert(current !== null, 'RAN outside a CASE');
      const arrow = line.indexOf(' => ');
      assert(arrow > 0, 'Malformed RAN record');
      const args = parseNumericList(line.slice('RAN '.length, arrow));
      assert(Array.isArray(args) && args.length === 2, 'RAN needs two arguments');
      current.randomCalls.push({ args, value: numeric(line.slice(arrow + 4)) });
    } else if (line.startsWith('RESULT ')) {
      assert(current !== null, 'RESULT outside a CASE');
      current.result = parseNumericList(line.slice('RESULT '.length));
    } else if (line.startsWith('EDGE-AFTER ')) {
      assert(current !== null, 'EDGE-AFTER outside a CASE');
      current.edgeAfter = parseNumericList(line.slice('EDGE-AFTER '.length));
    } else if (line.startsWith('NEXT-RANDOM ')) {
      assert(current !== null, 'NEXT-RANDOM outside a CASE');
      const match = /^NEXT-RANDOM (\d+) STATUS (OK|ERROR)$/.exec(line);
      assert(match, `Malformed NEXT-RANDOM record: ${line}`);
      current.nextRandom = { value: Number(match[1]), status: match[2] };
    } else if (line.startsWith('ERROR ')) {
      errorCount += 1;
    } else if (line === 'ENDCASE') {
      assert(current !== null, 'ENDCASE outside a CASE');
      assert(current.result !== null && current.edgeAfter !== null && current.nextRandom,
        `Incomplete CASE ${current.name}`);
      assert(current.nextRandom.status === 'OK', `Random checkpoint failed in ${current.name}`);
      assert(JSON.stringify(current.edgeAfter) === JSON.stringify(current.points),
        `FREE-PATH changed the private input list in ${current.name}`);
      assert(Array.isArray(current.result) &&
        current.result.every((point) => Array.isArray(point) && point.length === 3),
      `FREE-PATH returned a malformed point list in ${current.name}`);
      current.resultPointCount = current.result.length;
      current.randomCallCount = current.randomCalls.length;
      current.distanceCallCount = current.distanceCalls.length;
      cases.push(current);
      current = null;
      endCount += 1;
    } else if (line === 'RESTORED T') {
      restored = true;
    }
  }
  assert(current === null, 'Probe ended during a CASE');
  assert(cases.length === 2 && endCount === 2, 'Expected two complete CASE records');
  assert(errorCount === 0, `Probe reported ${errorCount} errors`);
  assert(restored, 'RAN/XYDIST restoration was not confirmed');
  assert(JSON.stringify(cases.map(({ seed, name }) => [seed, name])) ===
    JSON.stringify([[830687, 'nearest-below'], [522862, 'early-crossing']]),
  'Unexpected seeds or case ordering');
  return { cases, errorCount, restored, endCount };
}

function splitEdges(item) {
  const edges = [];
  let index = 0;
  while (index < item.randomCalls.length) {
    const selection = item.randomCalls[index++];
    assert(JSON.stringify(selection.args) === '[8,14]',
      `Expected RAN(8,14) at the start of edge ${edges.length + 1}`);
    const selected = selection.value;
    const iterations = [];
    while (index < item.randomCalls.length &&
        JSON.stringify(item.randomCalls[index].args) !== '[8,14]') {
      assert(index + 2 < item.randomCalls.length, 'Partial FREE-PATH iteration in report');
      const scale = item.randomCalls[index++];
      const wiggle = item.randomCalls[index++];
      const angle = item.randomCalls[index++];
      assert(JSON.stringify(scale.args) === '[0.7,1.3]' &&
        JSON.stringify(wiggle.args) === '[0.015,0.03]' &&
        JSON.stringify(angle.args) === '[0,6.28]',
      'Unexpected FREE-PATH random argument sequence');
      iterations.push({ scale: scale.value, wiggle: wiggle.value, angle: angle.value });
    }
    edges.push({ selected, iterations });
  }
  assert(edges.length === item.distanceCalls.length && edges.length === 2,
    `${item.name} random groups do not match its two measured distances`);
  return edges.map((edge, index) => {
    const distance = item.distanceCalls[index].result;
    let progressed = 0;
    let crossingIteration = null;
    let progressAtCrossing = null;
    const progressTrace = [];
    for (const [stepIndex, iteration] of edge.iterations.entries()) {
      const step = Math.fround(Math.fround(distance / edge.selected) *
        Math.fround(iteration.scale));
      progressed = Math.fround(progressed + step);
      progressTrace.push(progressed);
      if (distance > 0 && progressed >= distance && crossingIteration === null) {
        crossingIteration = stepIndex + 1;
        progressAtCrossing = progressed;
      }
    }
    return {
      edgeIndex: index,
      distance,
      selectedSteps: edge.selected,
      consumedSteps: edge.iterations.length,
      progressTrace,
      modeledCrossingIteration: crossingIteration,
      modeledProgressAtFirstCrossing: progressAtCrossing,
      modeledMarginAtFirstCrossing: progressAtCrossing === null
        ? null : progressAtCrossing - distance,
      finalModeledProgress: progressed,
      finalModeledMargin: progressed - distance,
      scaleValues: edge.iterations.map(({ scale }) => scale),
      stoppedBeforeSelectedBudget: edge.iterations.length < edge.selected,
    };
  });
}

function observeJs(item) {
  const random = new Allegro501Random(item.seed);
  const calls = [];
  const observedRandom = {
    integer(minimum, maximum) {
      const value = random.integer(minimum, maximum);
      calls.push({ args: [minimum, maximum], value });
      return value;
    },
    ranFloat(a, b, options) {
      const value = random.ranFloat(a, b, options);
      calls.push({ args: [a, b], value });
      return value;
    },
  };
  const result = aaronFreePath(item.points, observedRandom);
  const nextRandom = random.nextInt(100000);
  const roundOriginal = (value) => Number.isInteger(value) ? value : Math.fround(value);
  const originalCalls = item.randomCalls.map(({ args, value }) => ({
    args, value: roundOriginal(value),
  }));
  const callsMatch = JSON.stringify(calls) === JSON.stringify(originalCalls);
  const pointsMatch = JSON.stringify(result) === JSON.stringify(item.result.map((point) =>
    point.map(roundOriginal)));
  const nextRandomMatches = nextRandom === item.nextRandom.value;
  const originalPoints = item.result.map((point) => point.map(roundOriginal));
  const firstPointMismatch = pointsMatch ? null : Array.from({
    length: Math.max(result.length, originalPoints.length),
  }, (_, index) => index).find((index) =>
    JSON.stringify(result[index]) !== JSON.stringify(originalPoints[index]));
  const firstCallMismatch = callsMatch ? null : Array.from({
    length: Math.max(calls.length, originalCalls.length),
  }, (_, index) => index).find((index) =>
    JSON.stringify(calls[index]) !== JSON.stringify(originalCalls[index]));
  return {
    randomCallsMatch: callsMatch,
    returnedPointsMatch: pointsMatch,
    followingRandom100000: { original: item.nextRandom.value, javascript: nextRandom },
    originalRandomCallCount: originalCalls.length,
    javascriptRandomCallCount: calls.length,
    firstRandomCallMismatch: firstCallMismatch === null ? null : {
      index: firstCallMismatch,
      original: originalCalls[firstCallMismatch] ?? null,
      javascript: calls[firstCallMismatch] ?? null,
    },
    originalResultPointCount: item.result.length,
    javascriptResultPointCount: result.length,
    firstPointMismatch: firstPointMismatch === null ? null : {
      index: firstPointMismatch,
      original: originalPoints[firstPointMismatch] ?? null,
      javascript: result[firstPointMismatch] ?? null,
    },
    boundedParity: callsMatch && pointsMatch && nextRandomMatches,
  };
}

async function main() {
  const [beforePath, observerPath, afterPath, outputPath] = process.argv.slice(2);
  if (!beforePath || !observerPath || !afterPath || !outputPath || process.argv.length !== 6) {
    console.error('Usage: node research/tools/derive-free-path-stop-boundary-evidence.mjs ' +
      '<control-before-root> <observer-root> <control-after-root> <output.json>');
    process.exitCode = 2;
    return;
  }
  const verified = await verifyLocalAaronTriplet(beforePath, observerPath, afterPath);
  const [before, observer, after] = verified.runs;
  assert(observer.summary.requiredProbeOutputName === 'aaron-free-path-stop-boundary.txt',
    'Unexpected required report name');
  const reportPath = path.join(observer.capturePath, verified.requiredReport);
  const reportBytes = await readFile(reportPath);
  const parsed = parseReport(reportBytes.toString('utf8'), verified.endMarker);
  const sourcePath = path.resolve('research/introspection/free-path-stop-boundary.cl');
  const sourceHash = createHash('sha256').update(await readFile(sourcePath)).digest('hex');
  assert(sourceHash === verified.probeSourceHash,
    'Checked-in observer source differs from the captured source');

  const cases = parsed.cases.map((item) => {
    const edges = splitEdges(item);
    const firstEdge = edges[0];
    const parity = observeJs(item);
    assert(firstEdge.distance === 10 &&
      firstEdge.selectedSteps === (item.seed === 830687 ? 9 : 10),
    `Unexpected first-edge distance or selected budget for ${item.name}`);
    const predictedConsumedSteps = firstEdge.modeledCrossingIteration ?? firstEdge.selectedSteps;
    return {
      seed: item.seed,
      name: item.name,
      points: item.points,
      fdex: item.fdex, tdex: item.tdex, from: item.from, to: item.to,
      distanceCalls: item.distanceCalls,
      randomCalls: item.randomCalls,
      firstEdgeBoundary: {
        ...firstEdge,
        predictedConsumedSteps,
        candidatePredictionMatchesObserved: firstEdge.consumedSteps === predictedConsumedSteps,
      },
      result: item.result,
      edgeAfter: item.edgeAfter,
      nextRandom: item.nextRandom,
      javascriptComparison: parity,
    };
  });

  const aa0 = await readFile(path.join(observer.capturePath, 'aa0'));
  const headerLine = aa0.subarray(0, 64).toString('ascii').split(/\r?\n/, 1)[0].trim();
  const [width, height, headerBytes] = headerLine.split(/\s+/).map(Number);
  assert(Number.isInteger(width) && Number.isInteger(height) && Number.isInteger(headerBytes),
    `Unrecognized AA0 header: ${headerLine}`);
  const runSummary = (run) => ({
    runId: run.summary.runId,
    mode: run.summary.mode,
    complete: run.summary.complete,
    startedAt: run.summary.startedAt,
    finishedAt: run.summary.finishedAt,
    runnerSha256: run.summary.runnerSha256,
    installerSha256: run.summary.installerSha256,
    aa0Sha256: run.summary.aa0Sha256,
    sceneReportSha256: run.summary.sceneReportSha256,
  });
  const evidence = {
    schema: 'aaron-free-path-stop-boundary-evidence-v1',
    question: 'Do two seed-selected near-boundary cases confirm the modeled distance-stop rule in the original runtime?',
    controls: {
      before: runSummary(before), observer: runSummary(observer), after: runSummary(after),
      observerProbeSha256: verified.probeSourceHash,
      checkedInProbePath: path.relative(process.cwd(), sourcePath).split(path.sep).join('/'),
      checkedInProbeSha256: sourceHash,
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
      endCaseCount: parsed.endCount,
      errorCount: parsed.errorCount,
      functionBindingsRestored: parsed.restored,
      allPrivateInputListsUnchanged: true,
      javascriptComparisonsPassed: cases.every(({ javascriptComparison }) =>
        javascriptComparison.boundedParity),
      javascriptMismatchesRetained: cases.some(({ javascriptComparison }) =>
        !javascriptComparison.boundedParity),
    },
    cases,
    interpretation: [
      'For seed 830687, original RAN records show nine selected and nine consumed first-edge steps; the reconstructed single-float sum remains just below distance 10.',
      'For seed 522862, the selected JavaScript model predicts a crossing on step 9 of 10, but the original RAN trace consumes all 10 first-edge steps. This falsifies that near-boundary prediction for this capture.',
      'The accumulator is reconstructed from recorded scale values using the existing JavaScript precision model; it was not directly instrumented inside the compiled function.',
      'Any JavaScript mismatch is retained explicitly; no parity is claimed for a case that differs.',
    ],
    limitations: [
      'Two seeds and one length-10 integer-coordinate edge do not define the full FREE-PATH domain.',
      'The capture does not expose the compiled function internal accumulator or recover its source/assembly.',
      'Bounded case parity does not establish natural-caller or whole-painting generator parity.',
    ],
  };
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    outputPath,
    cases: cases.map(({ seed, name, firstEdgeBoundary, javascriptComparison }) => ({
      seed, name,
      selectedSteps: firstEdgeBoundary.selectedSteps,
      consumedSteps: firstEdgeBoundary.consumedSteps,
      finalModeledMargin: firstEdgeBoundary.finalModeledMargin,
      modeledMarginAtFirstCrossing: firstEdgeBoundary.modeledMarginAtFirstCrossing,
      modeledCrossingIteration: firstEdgeBoundary.modeledCrossingIteration,
      javascriptComparison,
    })),
    outputHashesMatch: true,
    aa0Header: evidence.controls.aa0Header,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
}
