import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aaronAngleRange } from '../src/aaron-angles.js';
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
