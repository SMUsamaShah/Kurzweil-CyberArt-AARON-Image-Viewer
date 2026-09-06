import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Allegro501Random } from '../src/allegro-random.js';
import { aaronLockWiggle, aaronXYDistance } from '../src/aaron-point-geometry.js';
import { parseLineReport } from '../../research/tools/parse-line-report.mjs';

test('matches 192 original LOCK-WIGGLE paths, distances, and subsequent random state', () => {
  const report = parseLineReport(readFileSync(new URL(
    '../../research/introspection/evidence/point-behavior-34002307774.txt', import.meta.url,
  ), 'utf8'));
  assert.equal(report.cases.length, 144);
  let paths = 0;
  for (let i = 0; i < report.cases.length; i += 3) {
    const [distance, wiggle, sentinel] = report.cases.slice(i, i + 3);
    assert.deepEqual([distance.name, wiggle.name, sentinel.name], ['XYDIST', 'LOCK-WIGGLE', 'RANDOM']);
    assert.deepEqual(distance.args, wiggle.args);
    const options = { precision: /d[+-]?\d/i.test(wiggle.argsText) ? 'double' : 'single' };
    const label = `seed=${wiggle.seed} bounds=${wiggle.argsText}`;
    assert.equal(aaronXYDistance(...distance.args, options), distance.values[0], label);
    const random = new Allegro501Random(wiggle.seed);
    for (const expected of wiggle.values) {
      assert.deepEqual(aaronLockWiggle(...wiggle.args, random, options), expected, label);
      paths++;
    }
    assert.equal(random.nextInt(...sentinel.args), sentinel.values[0], `subsequent state: ${label}`);
  }
  assert.equal(paths, 192);
});
