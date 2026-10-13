#!/usr/bin/env node

// Derive a compact, source-bound record from a complete FREE-PATH boundary
// probe. The observer must be bracketed by uninstrumented writer-stream runs.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { verifyLocalAaronTriplet } from './verify-local-aaron-triplet.mjs';

const numberToken = /^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+))(?:[eEsSfFdDlL][+-]?\d+)?$/;
const casePattern = /^CASE seed=(\d+) name=([A-Za-z0-9-]+) POINTS (.+) FDEX (-?\d+) TDEX (-?\d+) FROM (-?\d+) TO (-?\d+)$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseNumericList(source) {
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
    assert(numberToken.test(token), `Unsupported number in probe report: ${token}`);
    return token;
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
  assert(Array.isArray(points) && points.length >= 2 &&
    points.every((point) => Array.isArray(point) && point.length === 3),
  'CASE points must be triples');
  return {
    seed: Number(match[1]),
    name: match[2],
    points,
    fdex: Number(match[4]),
    tdex: Number(match[5]),
    from: Number(match[6]),
    to: Number(match[7]),
    distanceCalls: [],
    randomCalls: [],
    result: null,
    edgeAfter: null,
    nextRandom: null,
  };
}

function parseReport(text, expectedEndMarker) {
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  assert(lines[0] === 'BEGIN free-path-boundaries', 'Probe BEGIN marker is missing');
  assert(lines.at(-2) === expectedEndMarker && lines.at(-1) === '',
    `Probe report must end with ${JSON.stringify(expectedEndMarker)}`);

  const cases = [];
  let current = null;
  let restored = false;
  let errorCount = 0;
  let endCount = 0;
  for (const line of lines) {
    if (line.startsWith('CASE ')) {
      assert(current === null, 'Nested CASE record');
      current = parseCaseHead(line);
      cases.push(current);
      continue;
    }
    if (!current) {
      if (line.startsWith('ERROR ')) errorCount += 1;
      if (line === 'RESTORED T') restored = true;
      continue;
    }
    if (line.startsWith('XYDIST ')) {
      const arrow = line.indexOf(' => ');
      assert(arrow > 0, 'Malformed XYDIST record');
      const points = parseNumericList(`(${line.slice('XYDIST '.length, arrow)})`);
      assert(Array.isArray(points) && points.length === 2 &&
        points.every((point) => Array.isArray(point) && point.length === 3),
      'XYDIST record must have two point triples');
      current.distanceCalls.push({
        points,
        result: line.slice(arrow + 4),
      });
    } else if (line.startsWith('RAN ')) {
      const arrow = line.indexOf(' => ');
      assert(arrow > 0, 'Malformed RAN record');
      const args = parseNumericList(line.slice('RAN '.length, arrow));
      assert(Array.isArray(args) && args.length === 2, 'RAN record needs two arguments');
      const value = line.slice(arrow + 4);
      assert(numberToken.test(value), `Malformed RAN result: ${value}`);
      current.randomCalls.push({ args, value });
    } else if (line.startsWith('RESULT ')) {
      current.result = parseNumericList(line.slice('RESULT '.length));
    } else if (line.startsWith('EDGE-AFTER ')) {
      current.edgeAfter = parseNumericList(line.slice('EDGE-AFTER '.length));
    } else if (line.startsWith('NEXT-RANDOM ')) {
      const match = /^NEXT-RANDOM (\d+) STATUS (OK|ERROR)$/.exec(line);
      assert(match, `Malformed NEXT-RANDOM record: ${line}`);
      current.nextRandom = { value: Number(match[1]), status: match[2] };
    } else if (line.startsWith('ERROR ')) {
      errorCount += 1;
    } else if (line === 'ENDCASE') {
      assert(current.result !== null && current.edgeAfter !== null && current.nextRandom,
        'CASE is missing result, input-after, or random checkpoint');
      assert(current.nextRandom.status === 'OK', 'A CASE random checkpoint failed');
      assert(JSON.stringify(current.edgeAfter) === JSON.stringify(current.points),
        `FREE-PATH changed the private input list in ${current.name}`);
      assert(Array.isArray(current.result) &&
        current.result.every((point) => Array.isArray(point) && point.length === 3),
      `FREE-PATH result is not a point list in ${current.name}`);
      current.resultPointCount = current.result.length;
      current.randomCallCount = current.randomCalls.length;
      current.distanceCallCount = current.distanceCalls.length;
      endCount += 1;
      current = null;
    }
  }

  assert(current === null, 'Probe ended during a CASE');
  assert(cases.length === 40 && endCount === 40,
    `Expected 40 complete cases, found ${cases.length} CASE / ${endCount} ENDCASE`);
  assert(errorCount === 0, `Probe reported ${errorCount} errors`);
  assert(restored, 'RAN/XYDIST restoration was not confirmed');
  assert(JSON.stringify([...new Set(cases.map((item) => item.seed))]) === '[1,1234]',
    'Expected seed groups 1 and 1234');
  return { cases, errorCount, restored, endCount };
}

async function main() {
  const [beforePath, observerPath, afterPath, outputPath] = process.argv.slice(2);
  if (!beforePath || !observerPath || !afterPath || !outputPath || process.argv.length !== 6) {
    console.error(
      'Usage: node research/tools/derive-free-path-boundary-evidence.mjs ' +
      '<control-before-root> <observer-root> <control-after-root> <output.json>');
    process.exitCode = 2;
    return;
  }

  const verified = await verifyLocalAaronTriplet(beforePath, observerPath, afterPath);
  const [before, observer, after] = verified.runs;
  assert(observer.summary.requiredProbeOutputName === 'aaron-free-path-boundaries.txt',
    'Unexpected required FREE-PATH report name');
  const reportPath = path.join(observer.capturePath, verified.requiredReport);
  const reportBytes = await readFile(reportPath);
  const reportText = reportBytes.toString('utf8');
  const parsed = parseReport(reportText, verified.endMarker);
  const currentProbePath = path.resolve('research/introspection/free-path-boundaries.cl');
  const currentProbeHash = createHash('sha256')
    .update(await readFile(currentProbePath)).digest('hex');
  assert(currentProbeHash === verified.probeSourceHash,
    'Checked-in FREE-PATH probe differs from the source-bound observer copy');
  const aa0 = await readFile(path.join(observer.capturePath, 'aa0'));
  const headerLine = aa0.subarray(0, Math.min(64, aa0.length)).toString('ascii')
    .split(/\r?\n/, 1)[0].trim();
  const [width, height, headerBytes] = headerLine.split(/\s+/).map(Number);
  assert(Number.isInteger(width) && Number.isInteger(height) &&
    Number.isInteger(headerBytes), `Unrecognized AA0 header: ${headerLine}`);
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
    schema: 'aaron-free-path-boundary-evidence-v1',
    scope: {
      seedValues: [1, 1234],
      completeCases: parsed.cases.length,
      shapeCountPerSeed: 20,
      sceneGenerationComparison: 'not claimed; matrix executes after MAIN returns',
      javascriptParity: 'not compared in this evidence',
      wholePaintingParity: false,
    },
    controls: {
      before: runSummary(before),
      observer: runSummary(observer),
      after: runSummary(after),
      observerProbeSha256: verified.probeSourceHash,
      checkedInProbePath: path.relative(process.cwd(), currentProbePath).split(path.sep).join('/'),
      checkedInProbeSha256: currentProbeHash,
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
    },
    cases: parsed.cases,
    limitations: [
      'The 40 rows are finite direct-call samples, not a complete FREE-PATH domain.',
      'The cases do not identify the natural caller policy or general integration behavior.',
      'This capture does not compare the rows with the JavaScript implementation.',
    ],
  };

  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    outputPath,
    runId: observer.summary.runId,
    observerReportSha256: evidence.controls.observerReportSha256,
    aa0Header: evidence.controls.aa0Header,
    completeCases: parsed.cases.length,
    errors: parsed.errorCount,
    restored: parsed.restored,
    outputsMatch: true,
    sourcesMatch: true,
    resultPointCountMin: Math.min(...parsed.cases.map((item) => item.resultPointCount)),
    resultPointCountMax: Math.max(...parsed.cases.map((item) => item.resultPointCount)),
    randomCallCountMin: Math.min(...parsed.cases.map((item) => item.randomCallCount)),
    randomCallCountMax: Math.max(...parsed.cases.map((item) => item.randomCallCount)),
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
