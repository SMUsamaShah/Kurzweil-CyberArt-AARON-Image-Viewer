import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseStoreReport } from '../parse-store-report.mjs';

const captured = readFileSync(
  new URL('../../introspection/evidence/store-behavior-34016834286.txt', import.meta.url),
  'utf8',
);

test('parses the completed STORE-IN-FILE capture and preserves failures', () => {
  const report = parseStoreReport(captured);
  assert.equal(report.cases.length, 192);
  assert.equal(report.cases.filter((entry) => entry.error === 'UNBOUND-VARIABLE').length, 96);
  assert.equal(report.cases.filter((entry) => !entry.error).length, 96);
  assert.equal(report.cases.some((entry) => Object.hasOwn(entry, 'controls')), false);
});

test('accepts the controls-visible field used by the follow-up probe', () => {
  const report = [
    'BEGIN store-behavior',
    'TRY method="VECTOR" mode="LARGE" redraw=NIL plot=T controls=T previous=(10 20) args=((10 20) (11 20))',
    'OUTPUT (97 109 32 49 46 48 48 32 50 46 48 48 10)',
    'PREVIOUS (11 20)',
    'ENDCASE',
    'END store-behavior',
  ].join('\n');
  const parsed = parseStoreReport(report);
  assert.deepEqual(parsed.cases[0].controls, true);
  assert.equal(parsed.cases[0].plot, true);
  assert.equal(parsed.cases[0].output, 'am 1.00 2.00\n');
});

test('rejects an incomplete STORE-IN-FILE case', () => {
  assert.throws(
    () => parseStoreReport(captured.replace('PREVIOUS (10 20)\nENDCASE', 'ENDCASE')),
    /Incomplete store output\/state/,
  );
});
