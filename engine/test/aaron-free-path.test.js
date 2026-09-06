import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Allegro501Random } from '../src/allegro-random.js';
import { aaronFreePath } from '../src/aaron-point-geometry.js';
import { parseFreePathReport } from '../../research/tools/parse-free-path-report.mjs';

const evidence = parseFreePathReport(readFileSync(
  new URL('../../research/introspection/evidence/free-path-validation-34031848492.txt', import.meta.url),
  'utf8',
));

test('FREE-PATH matches all traced and unwrapped original sequences', () => {
  for (const fixture of evidence.cases) {
    const random = new Allegro501Random(fixture.seed);
    const actual = aaronFreePath(fixture.points, random);
    assert.deepEqual(actual, fixture.actual[0], fixture.pointsText);
    assert.deepEqual([random.nextInt(1000)], [fixture.actual[2]], fixture.pointsText);
    assert.equal(fixture.match, true);
  }
});

test('FREE-PATH keeps zero-target edges straight and retains closed-edge duplicates', () => {
  const random = new Allegro501Random(1);
  assert.deepEqual(
    aaronFreePath([[0, 0, 0], [10, 0, 0]], random),
    [[0, 0, 0], [10, 0, 0], [10, 0, 0], [0, 0, 0]],
  );
});

test('FREE-PATH validates point shape, visibility, precision, and random source', () => {
  assert.throws(() => aaronFreePath([[0, 0]], new Allegro501Random(1)), /at least two/);
  assert.throws(() => aaronFreePath([[0, 0, 1], [10, 0]], new Allegro501Random(1)), /triples/);
  assert.throws(() => aaronFreePath([[0, 0, 1], [10, 0, 1]], {}, {}), /random source/);
  assert.throws(() => aaronFreePath([[0, 0, 1], [10, 0, 1]], new Allegro501Random(1), { precision: 'bad' }), /precision/);
});
