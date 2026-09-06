import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aaronAngleRange, aaronNormAngle, aaronAngleDifference, allegroDoubleModulo } from '../src/aaron-angles.js';
import { parseLineReport } from '../../research/tools/parse-line-report.mjs';

for (const [name, expectedCount] of [
  ['line-behavior-33986804721', 7], ['line-validation-33987111580', 13],
]) {
  test(`ANGLE-RANGE matches all measured output bits: ${name}`, () => {
    const path = new URL(`../../research/introspection/evidence/${name}.txt`, import.meta.url);
    const cases = parseLineReport(readFileSync(path, 'utf8')).cases.filter(x => x.name === 'ANGLE-RANGE');
    assert.equal(cases.length, expectedCount);
    for (const entry of cases) {
      const precision = /d[+-]?\d/i.test(entry.argsText) ? 'double' : 'single';
      assert.deepEqual(aaronAngleRange(...entry.args, { precision }), entry.values[0], entry.argsText);
    }
  });
}

test('normalization, difference, and MOD match every recovered double exactly', () => {
  const functions = { 'NORM-A': aaronNormAngle, 'ANGLE-DIF': aaronAngleDifference, MOD: allegroDoubleModulo };
  const counts = { 'NORM-A': 0, 'ANGLE-DIF': 0, MOD: 0 };
  for (const file of ['line-behavior-33986804721', 'line-validation-34001269267']) {
    const path = new URL(`../../research/introspection/evidence/${file}.txt`, import.meta.url);
    for (const entry of parseLineReport(readFileSync(path, 'utf8')).cases) {
      const fn = functions[entry.name];
      if (!fn) continue;
      counts[entry.name]++;
      assert.equal(fn(...entry.args), entry.values[0], `${entry.name} ${entry.argsText}`);
    }
  }
  assert.deepEqual(counts, { 'NORM-A': 51, 'ANGLE-DIF': 116, MOD: 51 });
});
