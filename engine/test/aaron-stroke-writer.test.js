import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AaronStrokeWriter } from '../src/aaron-stroke-writer.js';
import { parseStoreReport } from '../../research/tools/parse-store-report.mjs';

test('move/draw emission matches 96 original byte strings and previous-point states', () => {
  const rows = parseStoreReport(readFileSync(new URL(
    '../../research/introspection/evidence/store-behavior-34016651940.txt', import.meta.url,
  ), 'utf8')).cases;
  assert.equal(rows.length, 192);
  let count = 0;
  for (const row of rows) {
    if (row.method !== 'MOVE-TO' && row.method !== 'DRAW-TO') continue;
    assert.equal(row.error, undefined);
    const writer = new AaronStrokeWriter({ mode: row.mode.toLowerCase(), previous: row.previousBefore });
    if (row.method === 'MOVE-TO') writer.moveTo(row.args[0], { redraw: row.redraw });
    else writer.drawTo(row.args[1], { redraw: row.redraw });
    assert.equal(writer.output, row.output, JSON.stringify(row));
    assert.deepEqual(writer.previous, row.previousAfter, JSON.stringify(row));
    count++;
  }
  assert.equal(count, 96);
});
