import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseLineReport, readNumericList } from '../parse-line-report.mjs';

const report = readFileSync(new URL('../../introspection/evidence/line-behavior-33986804721.txt', import.meta.url), 'utf8');

test('reads measured values with original single/double precision and signed zero', () => {
  assert.deepEqual(readNumericList('(0.1 0.1d0 -0.0d0 (NIL 3))'), [Math.fround(0.1), 0.1, -0, [null, 3]]);
  const parsed = parseLineReport(report);
  assert.equal(parsed.cases.length, 30);
  assert.equal(parsed.cases.filter(x => x.error).length, 1);
  assert.deepEqual(parsed.cases[0].values, [null]);
});

test('rejects incomplete, mismatched, and nonnumeric report forms', () => {
  assert.throws(() => readNumericList('(#.(delete-file "x"))'), /Unsupported/);
  assert.throws(() => readNumericList('(1 (2)'), /Truncated/);
  assert.throws(() => parseLineReport(report.replace('END line-behavior', '')), /checkpoints/);
  assert.throws(() => parseLineReport(report.replace('RESULT "DIRECTION" values=(NIL)\n', '')), /Missing result/);
  assert.throws(() => parseLineReport(report.replace('RESULT "DIRECTION"', 'RESULT "ANGLE-DIF"')), /Unexpected/);
});
