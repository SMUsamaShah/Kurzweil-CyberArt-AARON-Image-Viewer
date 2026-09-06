import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseStoreReport } from '../parse-store-report.mjs';
import { summarizeStoreReport } from '../summarize-store-report.mjs';

const report = parseStoreReport(readFileSync(
  new URL('../../introspection/evidence/store-behavior-34016834286.txt', import.meta.url),
  'utf8',
));

test('summarizes old captures without inventing controls data', () => {
  assert.deepEqual(summarizeStoreReport(report), {
    caseCount: 192,
    successCount: 96,
    errorCount: 96,
    methods: { 'DRAW-TO': 48, FILL: 48, 'MOVE-TO': 48, VECTOR: 48 },
    modes: { LARGE: 96, SMALL: 96 },
    controls: {},
    errors: { 'UNBOUND-VARIABLE': 96 },
    errorCells: { 'COMMON-GRAPHICS-USER::CONTROLS-VISIBLE': 96 },
  });
});

test('summarizes explicit controls values separately', () => {
  const controlled = {
    cases: [
      { method: 'VECTOR', mode: 'LARGE', controls: false },
      { method: 'VECTOR', mode: 'LARGE', controls: true, error: 'UNBOUND-VARIABLE' },
    ],
  };
  const summary = summarizeStoreReport(controlled);
  assert.deepEqual(summary.controls, { false: 1, true: 1 });
  assert.equal(summary.successCount, 1);
  assert.equal(summary.errorCells['COMMON-GRAPHICS-USER::CONTROLS-VISIBLE'], undefined);
});
