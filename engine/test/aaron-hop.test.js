import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aaronHopOrDraw } from '../src/aaron-hop.js';
import { parseHopReport } from '../../research/tools/parse-hop-report.mjs';

test('hop selector matches 186 original results including all local offsets at three origins', () => {
  let count = 0;
  for (const file of ['hop-behavior-34016252902', 'hop-validation-34016410110']) {
    const report = parseHopReport(readFileSync(new URL(
      `../../research/introspection/evidence/${file}.txt`, import.meta.url,
    ), 'utf8'));
    for (const row of report.cases) {
      assert.equal(row.error, undefined);
      const precision = /d[+-]?\d/i.test(row.argsText) ? 'double' : 'single';
      assert.equal(aaronHopOrDraw(...row.args, { mode: row.mode.toLowerCase(), precision }), row.value,
        `${row.mode} ${row.argsText}`);
      count++;
    }
  }
  assert.equal(count, 186);
});
