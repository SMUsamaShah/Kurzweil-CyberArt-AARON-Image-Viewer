import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AaronStrokeWriter } from '../src/aaron-stroke-writer.js';
import { parseStoreIsolatedReport } from '../../research/tools/parse-store-isolated-report.mjs';

const text = readFileSync(new URL('../../research/introspection/evidence/store-isolated-34031149136.txt', import.meta.url), 'utf8');
const report = parseStoreIsolatedReport(text);

test('isolated evidence preserves the intervention, screen calls, failures and floats', () => {
  assert.equal(report.cases.length, 240);
  assert.equal(report.cases.filter(c => c.error).length, 24);
  for (const c of report.cases) {
    assert.deepEqual(c.plotCalls, [c.args]);
    if (c.error) {
      assert.equal(c.method, 'VECTOR');
      assert.equal(c.previousBefore, null);
      assert.equal(c.error, 'PROGRAM-ERROR');
      assert.equal(c.output, '');
      assert.equal(c.previousAfter, null);
    }
  }
  assert.throws(() => parseStoreIsolatedReport(text.replace('RESTORED T', 'RESTORED NIL')));
  assert.throws(() => parseStoreIsolatedReport(text.replace('ENDCASE', '')));
});

test('integer VECTOR/FILL stream effects match original methods with PLOT isolated', () => {
  let successes = 0;
  let failures = 0;
  for (const c of report.cases.filter(c => c.args.flat().every(Number.isSafeInteger))) {
    const writer = new AaronStrokeWriter({ mode: c.mode, previous: c.previousBefore });
    const invoke = () => writer[c.method.toLowerCase()](...c.args, { redraw: c.redraw });
    if (c.error) {
      assert.throws(invoke, /initial previous point/);
      failures++;
    } else {
      invoke();
      successes++;
    }
    assert.equal(writer.output, c.output, JSON.stringify(c));
    assert.deepEqual(writer.previous, c.previousAfter);
  }
  assert.equal(successes, 72);
  assert.equal(failures, 8);
});
