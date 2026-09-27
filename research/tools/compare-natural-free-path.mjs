import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Allegro501Random } from '../../engine/src/allegro-random.js';
import { aaronFreePath } from '../../engine/src/aaron-point-geometry.js';
import { compactNaturalFreePathEvidence, parseNaturalFreePathReport } from './parse-natural-free-path-report.mjs';
import { parseNaturalFreePathRanReport, summarizeNaturalFreePathRanCall } from './parse-natural-free-path-ran-report.mjs';

function rngPreview(random) {
  const copy = random.clone();
  return [copy.nextInt(100), copy.nextInt(100), copy.nextInt(100)];
}

function matchingOffsets(seed, target, limit = 20000) {
  const stream = new Allegro501Random(seed);
  const draws = [];
  for (let index = 0; index < limit + 3; index += 1) draws.push(stream.nextInt(100));
  const offsets = [];
  for (let index = 0; index < limit; index += 1) {
    if (draws[index] === target[0] && draws[index + 1] === target[1] && draws[index + 2] === target[2]) offsets.push(index);
  }
  return offsets;
}

function reconstructAt(seed, offset) {
  const random = new Allegro501Random(seed);
  for (let index = 0; index < offset; index += 1) random.nextInt(100);
  return random;
}

function inputTriples(edge) {
  return edge.points.map(point => [point.x.value, point.y.value, point.vis.value]);
}

function typedEdgePrecisions(edge) {
  return edge.points.map((from, index) => {
    const to = edge.points[(index + 1) % edge.points.length];
    return [from.x.type, from.y.type, to.x.type, to.y.type].includes('DOUBLE-FLOAT') ? 'double' : 'single';
  });
}

function expectedTriples(pointList) {
  return pointList.points.map(point => [point.x.value, point.y.value, point.vis.value]);
}

function firstDifference(actual, expected) {
  const max = Math.max(actual.length, expected.length);
  for (let index = 0; index < max; index += 1) {
    const got = actual[index];
    const want = expected[index];
    if (!got || !want || got.some((value, axis) => value !== want[axis])) {
      const axes = [];
      for (const [axisIndex, axisName] of ['x', 'y', 'vis'].entries()) {
        if (!got || !want || got[axisIndex] !== want[axisIndex]) axes.push(axisName);
      }
      return { index, axes, expected: want ?? null, actual: got ?? null };
    }
  }
  return null;
}

function typedPointValues(point) {
  return [point.x.value, point.y.value, point.vis.value];
}

function samePointValues(left, right) {
  return left.every((value, axis) => value === right[axis]);
}

function runOneEdge(from, to, random, precision) {
  const wordsBefore = { value: 0 };
  const originalNextUint32 = random.nextUint32;
  random.nextUint32 = function countedNextUint32() {
    wordsBefore.value += 1;
    return originalNextUint32.call(this);
  };
  let path;
  try {
    path = aaronFreePath([
      [from.x.value, from.y.value, 0],
      [to.x.value, to.y.value, 1],
    ], random, { precision });
  } finally {
    random.nextUint32 = originalNextUint32;
  }
  // For the two-point fixture, the first active edge's interior points sit
  // between the source and its endpoint; the reverse edge is visibility-gated.
  return { points: path.slice(1, -3), randomWords: wordsBefore.value };
}

function diagnoseCallOneSingleEdge(call, seed, offset) {
  const inputs = call.edgeBefore.points;
  const returned = call.returned.first.points;
  const source = inputs[2], target = inputs[3];
  let repeatedSourceAt = -1;
  for (let index = 0; index + 1 < returned.length; index += 1) {
    if (samePointValues(typedPointValues(returned[index]), typedPointValues(source))
      && samePointValues(typedPointValues(returned[index + 1]), typedPointValues(source))) {
      repeatedSourceAt = index;
    }
  }
  if (repeatedSourceAt < 0) throw new Error('Could not locate call 1 bottom-edge source duplicate');
  let endpointAt = -1;
  for (let index = repeatedSourceAt + 2; index < returned.length; index += 1) {
    if (samePointValues(typedPointValues(returned[index]), typedPointValues(target))) {
      endpointAt = index;
      break;
    }
  }
  if (endpointAt < 0) throw new Error('Could not locate call 1 bottom-edge target');
  const expected = returned.slice(repeatedSourceAt + 2, endpointAt).map(typedPointValues);

  const random = reconstructAt(seed, offset);
  const first = runOneEdge(inputs[0], inputs[1], random, 'auto');
  const second = runOneEdge(inputs[1], inputs[2], random, 'auto');
  const edgeStartOffset = offset + first.randomWords + second.randomWords;
  const single = runOneEdge(source, target, random.clone(), 'single');
  const auto = runOneEdge(source, target, random.clone(), 'auto');
  const singleDifference = firstDifference(single.points, expected);
  const autoDifference = firstDifference(auto.points, expected);
  return {
    callId: call.id,
    zeroBasedEdgeIndex: 2,
    edgeStartOffset,
    pointsBeforeEdgeConsumed: first.randomWords + second.randomWords,
    endpointTypes: [
      { from: [source.x.type, source.y.type], to: [target.x.type, target.y.type] },
    ],
    oracleGeneratedPoints: expected.length,
    singlePrecisionReplay: {
      pointCount: single.points.length,
      exact: singleDifference === null,
      firstDivergence: singleDifference,
    },
    autoPrecisionReplay: {
      pointCount: auto.points.length,
      exact: autoDifference === null,
      firstDivergence: autoDifference,
    },
  };
}

function runCandidate(call, seed, offset, options) {
  const random = reconstructAt(seed, offset);
  const before = rngPreview(random);
  let rawDraws = 0;
  const originalNextUint32 = random.nextUint32.bind(random);
  random.nextUint32 = () => { rawDraws += 1; return originalNextUint32(); };
  const actual = aaronFreePath(inputTriples(call.edgeBefore), random, options);
  const after = rngPreview(random);
  const expected = call.returned?.first?.points ? expectedTriples(call.returned.first) : [];
  const difference = firstDifference(actual, expected);
  return {
    previewBefore: before,
    previewBeforeMatches: JSON.stringify(before) === JSON.stringify(call.rngBefore.random100),
    expectedPointCount: expected.length,
    jsPointCount: actual.length,
    pointCountMatches: actual.length === expected.length,
    coordinateMismatchCount: actual.reduce((count, point, index) => {
      const oracle = expected[index];
      return count + (oracle ? point.reduce((axisCount, value, axis) => axisCount + (value === oracle[axis] ? 0 : 1), 0) : 3);
    }, 0) + Math.max(0, expected.length - actual.length) * 3,
    firstDivergence: difference,
    rawRandomWordsConsumed: rawDraws,
    previewAfter: after,
    previewAfterMatches: JSON.stringify(after) === JSON.stringify(call.rngAfter?.random100 ?? []),
    nextPreviewOffset: offset + rawDraws,
  };
}

function compareOne(call, seed, candidateOffsets, nextCallOffsets, afterPreviewOffsets) {
  const expected = call.returned?.first?.points ? expectedTriples(call.returned.first) : [];
  const edgePrecisions = typedEdgePrecisions(call.edgeBefore);
  const candidates = candidateOffsets.map(offset => {
    const typed = runCandidate(call, seed, offset, { precision: 'auto', edgePrecisions });
    const legacyAuto = runCandidate(call, seed, offset, { precision: 'auto' });
    const nextCandidateOffsets = nextCallOffsets;
    return {
      offset,
      ...typed,
      edgePrecisions,
      legacyAuto,
      nextNaturalCallOffsets: nextCandidateOffsets,
      nextOffsetMatchesNaturalCall: nextCandidateOffsets.length
        ? nextCandidateOffsets.includes(offset + typed.rawRandomWordsConsumed) : null,
      nextPreviewOffsetCandidates: afterPreviewOffsets,
      nextOffsetMatchesReportedAfterPreview: afterPreviewOffsets.includes(offset + typed.rawRandomWordsConsumed),
    };
  });
  return { callId: call.id, incomingPreview: call.rngBefore.random100, candidateOffsets, edgePrecisions, candidates };
}

export function compareNaturalFreePathReport(parsed, { seed = 1234, searchLimit = 20000 } = {}) {
  const calls = parsed.capture.calls;
  const offsetsByCall = calls.map(call => matchingOffsets(seed, call.rngBefore.random100, searchLimit));
  const offsetsByAfterPreview = calls.map(call => matchingOffsets(seed, call.rngAfter?.random100 ?? [], searchLimit));
  const comparisons = calls.map((call, index) => compareOne(
    call,
    seed,
    offsetsByCall[index],
    offsetsByCall[index + 1] ?? [],
    offsetsByAfterPreview[index],
  ));
  const firstCallOffset = offsetsByCall[0]?.length === 1 ? offsetsByCall[0][0] : null;
  return {
    method: 'reconstruct incoming Allegro501Random state by advancing the verified seed stream with nextInt(100), match three-value cloned previews, then call aaronFreePath with typed numeric inputs and edge precision double when any endpoint coordinate is DOUBLE-FLOAT; captured random returns are never used as inputs',
    seed,
    offsetUnit: 'Allegro501Random nextInt(100) draws from seed state, zero-based position before preview',
    searchLimit,
    previewOffsetCandidates: offsetsByCall.map((offsets, index) => ({ callId: calls[index].id, offsets })),
    calls: comparisons,
    precisionDiagnostics: firstCallOffset === null || calls[0]?.returned?.first?.points?.length !== 48
      ? [] : [diagnoseCallOneSingleEdge(calls[0], seed, firstCallOffset)],
    alignedSequence: calls.length > 0 && comparisons.every((comparison, index) => {
      const expectedNext = comparisons[index + 1]?.candidates[0]?.offset;
      if (expectedNext === undefined) return true;
      return comparison.candidates.some(candidate => candidate.nextOffsetMatchesNaturalCall);
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [reportPath, summaryPath, outputPath, ranReportPath] = process.argv.slice(2);
  if (!reportPath || !summaryPath || !outputPath) {
    throw new Error('Usage: node compare-natural-free-path.mjs REPORT SCENE_SUMMARY_JSON OUTPUT_JSON [NESTED_RAN_REPORT]');
  }
  const reportBytes = readFileSync(reportPath);
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const seedMatch = /^natural-free-path-seed-(\d+)$/.exec(summary.mode);
  if (!seedMatch) throw new Error(`Unsupported natural FREE-PATH mode: ${summary.mode}`);
  const seed = Number(seedMatch[1]);
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
  const evidence = compactNaturalFreePathEvidence(parsed);
  evidence.comparison = compareNaturalFreePathReport(parsed, { seed });
  if (ranReportPath) {
    const ranBytes = readFileSync(ranReportPath);
    const ranSourceSummary = JSON.parse(readFileSync(join(dirname(dirname(ranReportPath)), 'summary.json'), 'utf8'));
    const ranSummary = parseNaturalFreePathRanReport(ranBytes.toString('utf8'));
    const ranCall = ranSummary.calls.find(call => call.id === 3);
    if (!ranCall || !ranSummary.completed) throw new Error('Nested RAN report lacks completed call 3 evidence');
    if (JSON.stringify(ranCall.rngBefore) !== JSON.stringify(parsed.capture.calls[2].rngBefore.random100)
      || JSON.stringify(ranCall.rngAfter) !== JSON.stringify(parsed.capture.calls[2].rngAfter.random100)) {
      throw new Error('Nested RAN call 3 previews do not match the natural FREE-PATH capture');
    }
    evidence.nestedRAN = {
      source: {
        reportPath: ranReportPath,
        reportSha256: createHash('sha256').update(ranBytes).digest('hex'),
        runId: ranSourceSummary.runId,
        mode: ranSourceSummary.mode,
        sceneRunComplete: ranSourceSummary.complete,
        aa0Sha256: ranSourceSummary.aa0Sha256,
        sceneReportSha256: ranSourceSummary.sceneReportSha256,
      },
      call3: {
        ...summarizeNaturalFreePathRanCall(ranCall),
        ran: ranCall.ran.map(event => ({
          ordinal: event.ordinal,
          args: event.args.map(value => [value.type, value.raw]),
          value: [event.values[0].type, event.values[0].raw],
        })),
      },
    };
  }
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    outputPath,
    alignedSequence: evidence.comparison.alignedSequence,
    calls: evidence.comparison.calls.map(call => ({
      callId: call.callId,
      candidateOffsets: call.candidateOffsets,
      outcomes: call.candidates.map(candidate => ({
        offset: candidate.offset,
        expectedPointCount: candidate.expectedPointCount,
        jsPointCount: candidate.jsPointCount,
        coordinateMismatchCount: candidate.coordinateMismatchCount,
        firstDivergence: candidate.firstDivergence,
        rawRandomWordsConsumed: candidate.rawRandomWordsConsumed,
        previewAfterMatches: candidate.previewAfterMatches,
        nextOffsetMatchesReportedAfterPreview: candidate.nextOffsetMatchesReportedAfterPreview,
        nextOffsetMatchesNaturalCall: candidate.nextOffsetMatchesNaturalCall,
        legacyAuto: {
          jsPointCount: candidate.legacyAuto.jsPointCount,
          coordinateMismatchCount: candidate.legacyAuto.coordinateMismatchCount,
          firstDivergence: candidate.legacyAuto.firstDivergence,
          rawRandomWordsConsumed: candidate.legacyAuto.rawRandomWordsConsumed,
          previewAfterMatches: candidate.legacyAuto.previewAfterMatches,
        },
      })),
    })),
    ...(evidence.nestedRAN ? { nestedRANCall3: {
      selectedSteps: evidence.nestedRAN.call3.stepCountCall.selectedSteps,
      ranCount: evidence.nestedRAN.call3.ranCount,
      iterations: evidence.nestedRAN.call3.iterationCount,
      scaleSumSingle: evidence.nestedRAN.call3.scaleSumSingle,
      firstCrossing: evidence.nestedRAN.call3.firstCumulativeCrossingAtOrAboveSelectedSteps,
    } } : {}),
  }, null, 2)}\n`);
}
