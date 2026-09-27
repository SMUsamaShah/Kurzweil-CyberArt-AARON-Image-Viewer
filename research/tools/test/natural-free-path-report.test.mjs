import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNaturalFreePathReport } from '../parse-natural-free-path-report.mjs';
import { compareNaturalFreePathReport } from '../compare-natural-free-path.mjs';
import { parseNaturalFreePathRanReport, summarizeNaturalFreePathRanCall } from '../parse-natural-free-path-ran-report.mjs';

const reportText = readFileSync(new URL(
  '../../extracted/local-oracle/natural-free-path-seed-1234-a/capture/aaron-free-path-natural.txt',
  import.meta.url,
), 'utf8');

test('natural FREE-PATH parser retains typed input and output points and pairs every call', () => {
  const report = parseNaturalFreePathReport(reportText);
  assert.equal(report.capture.completed, true);
  assert.equal(report.capture.callCount, 3);
  assert.equal(report.capture.returnCount, 3);
  assert.deepEqual(report.capture.calls.map(call => call.returned.first.points.length), [48, 16, 19]);
  assert.deepEqual(report.capture.calls.map(call => call.inputMutation.changed), [false, false, false]);
  const first = report.capture.calls[0];
  assert.equal(first.edgeBefore.points[0].x.type, 'SINGLE-FLOAT');
  assert.equal(first.edgeBefore.points[0].y.type, 'DOUBLE-FLOAT');
  assert.equal(first.returned.first.points[27].x.type, 'SINGLE-FLOAT');
  assert.equal(first.returned.first.points[27].x.value, Math.fround(262.31464));
  assert.deepEqual(first.rngBefore.random100, [68, 34, 27]);
  assert.deepEqual(first.rngAfter.random100, [53, 91, 3]);
  assert.deepEqual(first.bindingsBefore.map(binding => binding.bound), [false, false, false, false]);
});

test('natural FREE-PATH parser rejects Common Lisp reader evaluation syntax', () => {
  const unsafe = reportText.replace('31.248453', '#.(progn 1)');
  assert.throws(() => parseNaturalFreePathReport(unsafe), /Reader syntax is forbidden/);
});

test('natural FREE-PATH parser preserves condition and overflow markers', () => {
  const marked = reportText
    .replace('RETURN id=1', 'CONDITION id=1 type=TEST-CONDITION\nRETURN id=1')
    .replace('RETURN id=3', 'OVERFLOW call=3 field=RESULT reason=POINT-LIMIT limit=256\nRETURN id=3');
  const report = parseNaturalFreePathReport(marked);
  assert.equal(report.capture.completed, false);
  assert.deepEqual(report.capture.conditions, [{ id: 1, type: 'TEST-CONDITION' }]);
  assert.deepEqual(report.capture.calls[0].conditions, [{ id: 1, type: 'TEST-CONDITION' }]);
  assert.deepEqual(report.capture.overflows, [{
    kind: 'point-list', callId: 3, field: 'RESULT', reason: 'POINT-LIMIT', limit: 256,
  }]);
});

test('natural JS comparison reconstructs real seeded states and reports path divergences', () => {
  const report = parseNaturalFreePathReport(reportText);
  const comparison = compareNaturalFreePathReport(report);
  assert.deepEqual(comparison.previewOffsetCandidates.map(item => item.offsets), [[2677], [2813], [2841]]);
  assert.equal(comparison.alignedSequence, true);
  const [first, second, third] = comparison.calls.map(call => call.candidates[0]);
  assert.equal(first.coordinateMismatchCount, 0);
  assert.equal(first.firstDivergence, null);
  assert.equal(first.rawRandomWordsConsumed, 136);
  assert.equal(first.previewAfterMatches, true);
  assert.equal(first.legacyAuto.firstDivergence.index, 27);
  const precisionCheck = comparison.precisionDiagnostics[0];
  assert.equal(precisionCheck.edgeStartOffset, 2751);
  assert.equal(precisionCheck.singlePrecisionReplay.exact, true);
  assert.equal(precisionCheck.autoPrecisionReplay.exact, false);
  assert.equal(second.coordinateMismatchCount, 0);
  assert.equal(second.jsPointCount, 16);
  assert.equal(third.expectedPointCount, 19);
  assert.equal(third.coordinateMismatchCount, 0);
  assert.equal(third.jsPointCount, 19);
  assert.equal(third.rawRandomWordsConsumed, 37);
  assert.equal(third.previewAfterMatches, true);
  assert.equal(third.nextOffsetMatchesReportedAfterPreview, true);
  assert.equal(third.nextOffsetMatchesNaturalCall, null);
});

test('nested natural RAN trace records call 3 early termination candidate', () => {
  const text = readFileSync(new URL(
    '../../extracted/local-oracle/natural-free-path-ran-seed-1234-a/capture/aaron-free-path-ran.txt',
    import.meta.url,
  ), 'utf8');
  const report = parseNaturalFreePathRanReport(text);
  assert.equal(report.completed, true);
  const call = report.calls.find(item => item.id === 3);
  const summary = summarizeNaturalFreePathRanCall(call);
  assert.equal(summary.stepCountCall.selectedSteps, 13);
  assert.equal(summary.iterationCount, 12);
  assert.equal(summary.ranCount, 37);
  assert.equal(summary.firstCumulativeCrossingAtOrAboveSelectedSteps, 12);
  assert.ok(summary.scaleSumSingle > 13);
});
