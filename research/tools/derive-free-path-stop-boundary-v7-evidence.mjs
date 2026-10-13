#!/usr/bin/env node

// Verify a source-bound single-edge FREE-PATH discriminator and compare it
// with the existing JavaScript contract and local arithmetic hypotheses.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Allegro501Random } from '../../engine/src/allegro-random.js';
import { aaronFreePath } from '../../engine/src/aaron-point-geometry.js';
import { verifyLocalAaronTriplet } from './verify-local-aaron-triplet.mjs';

const expectedCase = [388, 'fractional-length-0-2-single-edge'];
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

function singleFloatTree(value) {
  return Array.isArray(value) ? value.map(singleFloatTree) : Math.fround(value);
}

function parseReport(text, requiredEnd) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  assert(lines[0] === 'BEGIN free-path-stop-boundary-v7', 'Probe BEGIN marker missing');
  assert(lines.at(-2) === requiredEnd && lines.at(-1) === '', 'Probe END marker is not terminal');
  assert(lines.includes('INSTALL planning-trace-post-event=STORE-IN-FILE-EXIT'),
    'Planning trace post-event installation marker missing');
  let current = null;
  let restored = false;
  let errors = 0;
  let endCases = 0;
  let item = null;
  let caseStart = null;
  let caseEnd = null;
  let hookEntry = null;
  let hookExit = null;
  for (const [lineIndex, line] of lines.entries()) {
    if (line.startsWith('HOOK-ENTER ')) {
      const match = /^HOOK-ENTER event=:EXIT name=STORE-IN-FILE depth=(\d+)$/.exec(line);
      assert(match && !hookEntry, `Malformed or duplicate trace hook entry: ${line}`);
      hookEntry = { lineIndex, depth: Number(match[1]), event: ':exit', name: 'STORE-IN-FILE' };
    } else if (line.startsWith('HOOK-EXIT ')) {
      const match = /^HOOK-EXIT status=(OK|ERROR)$/.exec(line);
      assert(match && !hookExit, `Malformed or duplicate trace hook exit: ${line}`);
      hookExit = { lineIndex, status: match[1] };
    } else if (line.startsWith('CASE-START ')) {
      assert(!caseStart, `Duplicate case start: ${line}`);
      const match = /^CASE-START seed=(\d+) name=([a-z0-9-]+)$/.exec(line);
      assert(match, `Malformed case start: ${line}`);
      caseStart = { lineIndex, seed: Number(match[1]), name: match[2] };
    } else if (line === 'CASE-END') {
      assert(!caseEnd, 'Duplicate CASE-END marker');
      caseEnd = lineIndex;
    }
    if (line.startsWith('CASE ')) {
      assert(current === null, 'Nested CASE record');
      const match = /^CASE seed=(\d+) name=([a-z0-9-]+) POINTS (.+) FDEX 0 TDEX 1 FROM 0 TO 1$/.exec(line);
      assert(match, `Malformed case header: ${line}`);
      const points = readNumbers(match[3]);
      assert(JSON.stringify(singleFloatTree(points)) ===
        JSON.stringify([[0, 0, 0], [Math.fround(0.2), 0, 1]]),
        'Expected the requested fractional single-float edge and visibility-gated closing edge');
      current = {
        seed: Number(match[1]), name: match[2], points,
        pointTypes: null, randomCalls: [], distanceCalls: [], result: null, edgeAfter: null, nextRandom: null,
      };
    } else if (line.startsWith('POINT-TYPES ')) {
      assert(current !== null && current.pointTypes === null, 'Unexpected or duplicate point types');
      const types = line.slice('POINT-TYPES '.length).replace(/\s+/g, '').toUpperCase();
      assert(types === '((FIXNUMFIXNUMFIXNUM)(SINGLE-FLOATFIXNUMFIXNUM))',
        `Unexpected input point types: ${line}`);
      current.pointTypes = types;
    } else if (line.startsWith('RAN ')) {
      assert(current !== null, 'RAN outside CASE');
      const arrow = line.indexOf(' => ');
      assert(arrow > 0, 'Malformed RAN row');
      const args = readNumbers(line.slice('RAN '.length, arrow));
      assert(Array.isArray(args) && args.length === 2, 'RAN needs a two-number interval');
      current.randomCalls.push({ args, value: readNumber(line.slice(arrow + 4)) });
    } else if (line.startsWith('XYDIST ')) {
      assert(current !== null, 'XYDIST outside CASE');
      const arrow = line.indexOf(' => ');
      assert(arrow > 0, 'Malformed XYDIST row');
      const typeMarker = line.lastIndexOf(' TYPE ');
      assert(typeMarker > arrow, 'XYDIST result type is missing');
      const points = readNumbers(`(${line.slice('XYDIST '.length, arrow)})`);
      assert(Array.isArray(points) && points.length === 2, 'XYDIST needs two point triples');
      const resultType = line.slice(typeMarker + ' TYPE '.length);
      assert(/^[A-Z][A-Z0-9-]*$/.test(resultType), `Malformed XYDIST result type: ${line}`);
      current.distanceCalls.push({ points,
        result: readNumber(line.slice(arrow + 4, typeMarker)), resultType });
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
      assert(current !== null && current.pointTypes !== null && current.result !== null && current.edgeAfter !== null &&
        current.nextRandom !== null, 'Incomplete case record');
      assert(current.nextRandom.status === 'OK', 'Random checkpoint failed');
      assert(JSON.stringify(singleFloatTree(current.edgeAfter)) ===
        JSON.stringify(singleFloatTree(current.points)),
        'FREE-PATH mutated the private input list');
      assert(Array.isArray(current.result) && current.result.every((point) =>
        Array.isArray(point) && point.length === 3), 'Malformed result points');
      item = current;
      current = null;
      endCases += 1;
    } else if (line === 'RESTORED T') {
      restored = true;
    }
  }
  assert(current === null, 'Report ended within a case');
  assert(endCases === 1 && item, `Expected one complete case, got ${endCases}`);
  assert(item.seed === expectedCase[0] && item.name === expectedCase[1], 'Unexpected case seed/name');
  assert(errors === 0, `Probe reported ${errors} errors`);
  assert(restored, 'RAN and XYDIST restoration was not confirmed');
  assert(hookEntry && hookExit && caseStart && caseEnd !== null,
    'The traced STORE-IN-FILE event and enclosed case markers are incomplete');
  assert(caseStart.seed === expectedCase[0] && caseStart.name === expectedCase[1],
    'Unexpected case-start seed/name');
  assert(hookEntry.lineIndex < caseStart.lineIndex && caseStart.lineIndex < caseEnd &&
    caseEnd < hookExit.lineIndex, 'The controlled case did not run inside the traced event callback');
  assert(hookExit.status === 'OK', 'The trace callback or its case reported an error');
  assert(item.distanceCalls.length === 1 && item.distanceCalls[0].resultType === 'SINGLE-FLOAT' &&
    Math.fround(item.distanceCalls[0].result) === Math.fround(0.2) &&
    JSON.stringify(singleFloatTree(item.distanceCalls[0].points)) ===
      JSON.stringify(singleFloatTree(item.points)),
  'Expected exactly one single-float distance for the requested 0.2 edge');
  item.originalConsumedSteps = (item.randomCalls.length - 1) / 3;
  assert(Number.isInteger(item.originalConsumedSteps), 'Random call count is not one selection plus 3 per step');
  item.resultPointCount = item.result.length;
  return {
    item, errorCount: errors, restored, endCaseCount: endCases,
    hookEntry, hookExit,
  };
}

function rounded(value) {
  return Number.isInteger(value) ? value : Math.fround(value);
}

function replayModels(item) {
  const random = new Allegro501Random(item.seed);
  const selected = random.integer(8, 14);
  const modeledCalls = [{ args: [8, 14], value: selected }];
  const steps = [];
  const start = item.points[0].slice(0, 2).map(Math.fround);
  const target = item.points[1].slice(0, 2).map(Math.fround);
  const distance = Math.fround(item.distanceCalls[0].result);
  const heading = Math.fround(Math.atan2(Math.fround(target[1] - start[1]),
    Math.fround(target[0] - start[0])));
  let progressed = 0;
  let spineX = start[0];
  let spineY = start[1];
  let stepSumStop = null;
  let emittedPointDistanceStop = null;
  let bareWiggleStop = null;
  let spatialOffsetStop = null;
  for (let index = 0; index < selected; index += 1) {
    const scale = random.ranFloat(0.7, 1.3, { aPrecision: 'single', bPrecision: 'single' });
    const wiggle = random.ranFloat(0.015, 0.03, { aPrecision: 'single', bPrecision: 'single' });
    const angle = random.ranFloat(0, 6.28, { aPrecision: 'single', bPrecision: 'single' });
    modeledCalls.push({ args: [0.7, 1.3], value: scale },
      { args: [0.015, 0.03], value: wiggle }, { args: [0, 6.28], value: angle });
    const step = Math.fround(Math.fround(distance / selected) * scale);
    progressed = Math.fround(progressed + step);
    spineX = Math.fround(spineX + Math.fround(step * Math.fround(Math.cos(heading))));
    spineY = Math.fround(spineY + Math.fround(step * Math.fround(Math.sin(heading))));
    const offsetLength = Math.fround(step * wiggle);
    const pointX = Math.fround(spineX + Math.fround(offsetLength * Math.fround(Math.cos(angle))));
    const pointY = Math.fround(spineY + Math.fround(offsetLength * Math.fround(Math.sin(angle))));
    const startDx = Math.fround(pointX - start[0]);
    const startDy = Math.fround(pointY - start[1]);
    const endDx = Math.fround(target[0] - pointX);
    const endDy = Math.fround(target[1] - pointY);
    const fromStart = Math.fround(Math.sqrt(startDx * startDx + startDy * startDy));
    const fromTarget = Math.fround(Math.sqrt(endDx * endDx + endDy * endDy));
    const stepNumber = index + 1;
    if (stepSumStop === null && progressed >= distance) stepSumStop = stepNumber;
    if (emittedPointDistanceStop === null && fromStart >= distance) emittedPointDistanceStop = stepNumber;
    if (bareWiggleStop === null && fromTarget <= wiggle) bareWiggleStop = stepNumber;
    if (spatialOffsetStop === null && fromTarget <= offsetLength) spatialOffsetStop = stepNumber;
    steps.push({ step: stepNumber, scale, wiggle, angle, progressed, point: [pointX, pointY],
      fromStart, fromTarget, offsetLength });
  }
  const seedCalls = modeledCalls.map(({ args, value }) => ({ args, value: rounded(value) }));
  const observedCalls = item.randomCalls.map(({ args, value }) => ({ args, value: rounded(value) }));
  const exactPrefix = JSON.stringify(observedCalls) ===
    JSON.stringify(seedCalls.slice(0, observedCalls.length));
  assert(selected === item.randomCalls[0]?.value, 'Selected-step value differs from captured RAN');
  assert(exactPrefix, 'Captured RAN prefix differs from the local Allegro seed stream');
  return {
    selectedSteps: selected,
    originalConsumedSteps: item.originalConsumedSteps,
    localRngPrefixMatchesCapture: exactPrefix,
    predictions: {
      stepSumThreshold: stepSumStop ?? selected,
      emittedPointDistanceThreshold: emittedPointDistanceStop ?? selected,
      terminalDistanceAtMostBareWiggle: bareWiggleStop ?? selected,
      terminalDistanceAtMostStepTimesWiggle: spatialOffsetStop ?? selected,
    },
    reconstructedFinalSteps: steps.slice(Math.max(0, item.originalConsumedSteps - 2), item.originalConsumedSteps + 1),
    traceBasis: 'Local single-float replay checked against every captured RAN call; original internal variables are not observed.',
  };
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
  const result = aaronFreePath(item.points, observed, { precision: 'single' });
  const nextRandom = random.nextInt(100000);
  const originalCalls = item.randomCalls.map(({ args, value }) => ({ args, value: rounded(value) }));
  const javascriptCalls = calls.map(({ args, value }) => ({ args, value: rounded(value) }));
  const originalResult = item.result.map((point) => point.map(rounded));
  const javascriptResult = result.map((point) => point.map(rounded));
  const randomCallsMatch = JSON.stringify(javascriptCalls) === JSON.stringify(originalCalls);
  const returnedPointsMatch = JSON.stringify(javascriptResult) === JSON.stringify(originalResult);
  return {
    randomCallsMatch,
    returnedPointsMatch,
    followingRandomMatches: nextRandom === item.nextRandom.value,
    followingRandom: { original: item.nextRandom.value, javascript: nextRandom },
    originalRandomCallCount: originalCalls.length,
    javascriptRandomCallCount: javascriptCalls.length,
    originalResultPointCount: originalResult.length,
    javascriptResultPointCount: javascriptResult.length,
    boundedParity: randomCallsMatch && returnedPointsMatch && nextRandom === item.nextRandom.value,
  };
}

async function main() {
  const [beforeRoot, observerRoot, afterRoot, outputPath] = process.argv.slice(2);
  if (!beforeRoot || !observerRoot || !afterRoot || !outputPath || process.argv.length !== 6) {
    console.error('Usage: node research/tools/derive-free-path-stop-boundary-v7-evidence.mjs <before-root> <observer-root> <after-root> <output.json>');
    process.exitCode = 2;
    return;
  }
  const verified = await verifyLocalAaronTriplet(beforeRoot, observerRoot, afterRoot, {
    observerOnlyOutputNames: ['aaron-planning-call-trace.txt'],
  });
  const [before, observer, after] = verified.runs;
  assert([before, observer, after].every((run) => run.summary.mode === 'writer-stream-seed-1234'),
    'All captures must use writer-stream-seed-1234 mode');
  assert(observer.summary.requiredProbeOutputName === 'aaron-free-path-stop-boundary-v7.txt',
    'Unexpected required report name');
  const reportPath = path.join(observer.capturePath, verified.requiredReport);
  const reportBytes = await readFile(reportPath);
  const parsed = parseReport(reportBytes.toString('utf8'), verified.endMarker);
  const probePath = path.resolve('research/introspection/free-path-stop-boundary-v7.cl');
  const probeHash = createHash('sha256').update(await readFile(probePath)).digest('hex');
  assert(probeHash === verified.probeSourceHash, 'Checked-in probe differs from captured source');
  const item = parsed.item;
  const comparison = replayModels(item);
  const javascriptComparison = compareJavaScript(item);
  const controlTraceHash = verified.artifactHashes['aaron-planning-call-trace.txt'];
  const observerTraceHash = verified.observerOnlyOutputHashes['aaron-planning-call-trace.txt'];
  assert(controlTraceHash && observerTraceHash && controlTraceHash !== observerTraceHash,
    'Expected a distinct observer-only planning trace diagnostic');
  const drawingAndSceneOutputHashes = Object.fromEntries(
    Object.entries(verified.artifactHashes)
      .filter(([name]) => name !== 'aaron-planning-call-trace.txt'));
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
    schema: 'aaron-free-path-stop-boundary-evidence-v7',
    question: 'Does one visibility-isolated 0.2 single-float edge distinguish local FREE-PATH stop candidates when invoked at a traced STORE-IN-FILE return?',
    controls: {
      before: summarize(before), observer: summarize(observer), after: summarize(after),
      observerProbeSha256: verified.probeSourceHash,
      checkedInProbePath: path.relative(process.cwd(), probePath).split(path.sep).join('/'),
      checkedInProbeSha256: probeHash,
      observerReportSha256: createHash('sha256').update(reportBytes).digest('hex'),
      observerReportPath: path.relative(process.cwd(), reportPath).split(path.sep).join('/'),
      requiredEndMarker: verified.endMarker,
      drawingAndSceneOutputHashes,
      bracketingPlanningTraceSha256: controlTraceHash,
      observerPlanningTraceSha256: observerTraceHash,
      observerPlanningTraceIsDiagnosticOnly: true,
      ordinaryStagedSourceHashes: verified.sourceHashes,
      allDrawingAndSceneOutputsAndOrdinarySourcesMatch: true,
      aa0Header: { width, height, headerBytes },
    },
    captureChecks: {
      caseCount: parsed.endCaseCount,
      errorCount: parsed.errorCount,
      bracketingPlanningTracesMatch: true,
      observerPlanningTraceDiffers: true,
      ranAndXydistBindingsRestored: parsed.restored,
      traceHook: { event: parsed.hookEntry.event, name: parsed.hookEntry.name, depth: parsed.hookEntry.depth },
      callbackStatus: parsed.hookExit.status,
      allPrivateInputListsUnchanged: true,
      oneForwardVisibleEdgeOnly: true,
      exactSeedPrefix: comparison.localRngPrefixMatchesCapture,
    },
    case: {
      seed: item.seed, name: item.name, points: item.points,
      pointTypes: item.pointTypes, precision: 'single',
      fdex: 0, tdex: 1, from: 0, to: 1,
      distanceCall: item.distanceCalls[0],
      randomCalls: item.randomCalls,
      result: item.result, nextRandom: item.nextRandom,
      stopModelComparison: comparison,
      javascriptComparison,
    },
    interpretation: [
      'The one-XYDIST capture isolates the visible forward edge; the zero-visibility start suppresses the closing edge in this case.',
      'Stop predictions replay captured seeded random values with single-float arithmetic; they do not observe the original function internal variables.',
      'One seed can discriminate local candidates but cannot establish a general stop rule.',
      'JavaScript parity is reported separately for captured random calls, returned points and the next random checkpoint.',
    ],
    limitations: [
      'This is one fractional single-float, length-0.2 edge and one seed.',
      'The controlled FREE-PATH case runs inside the first successful traced STORE-IN-FILE exit callback; it is not a natural FREE-PATH caller observation.',
      'The post-event callback and one-shot flag remain installed until this disposable oracle process exits.',
      'This does not establish the FREE-PATH domain, native Lisp ABI, or whole-painting parity.',
    ],
  };
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    outputPath,
    aa0Header: evidence.controls.aa0Header,
    drawingAndSceneOutputsAndSourcesMatch: true,
    observerPlanningTraceDiffersAsDeclared: true,
    seed: item.seed,
    selected: comparison.selectedSteps,
    originalConsumed: comparison.originalConsumedSteps,
    predictions: comparison.predictions,
    javascriptComparison,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
}
