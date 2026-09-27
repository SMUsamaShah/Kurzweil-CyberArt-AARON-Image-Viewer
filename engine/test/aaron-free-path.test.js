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
const naturalEvidence = JSON.parse(readFileSync(new URL(
  '../../research/introspection/evidence/natural-free-path-seed-1234-a.json', import.meta.url,
), 'utf8'));
const naturalHoldoutEvidence = JSON.parse(readFileSync(new URL(
  '../../research/introspection/evidence/natural-free-path-seed-5678-a.json', import.meta.url,
), 'utf8'));

function measuredNumber([type, raw]) {
  const value = Number(raw.replace(/[dD]/g, 'e'));
  return type === 'SINGLE-FLOAT' ? Math.fround(value) : value;
}

function measuredPoints(list) {
  return list.points.map(([, x, y, visibility]) => [
    measuredNumber(x), measuredNumber(y), measuredNumber(visibility),
  ]);
}

function measuredEdgePrecisions(points) {
  return points.map((from, index) => {
    const to = points[(index + 1) % points.length];
    return [from[1], from[2], to[1], to[2]].some(([type]) => type === 'DOUBLE-FLOAT')
      ? 'double' : 'single';
  });
}

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

test('FREE-PATH reproduces natural paths and following random states on two seeds', () => {
  for (const fixture of [
    { evidence: naturalEvidence, seed: 1234, offsets: [2677, 2813, 2841], words: [136, 28, 37] },
    { evidence: naturalHoldoutEvidence, seed: 5678, offsets: [2527], words: [133] },
  ]) {
    assert.equal(fixture.evidence.capture.completed, true);
    assert.equal(fixture.evidence.capture.callCount, fixture.offsets.length);
    for (const [index, call] of fixture.evidence.capture.calls.entries()) {
      const random = new Allegro501Random(fixture.seed);
      for (let draw = 0; draw < fixture.offsets[index]; draw += 1) random.nextInt(100);
      const input = measuredPoints(call.edgeBefore);
      const expected = measuredPoints(call.return.first);
      const edgePrecisions = measuredEdgePrecisions(call.edgeBefore.points);
      let words = 0;
      const next = random.nextUint32.bind(random);
      random.nextUint32 = () => { words += 1; return next(); };
      const actual = aaronFreePath(input, random, { edgePrecisions });
      assert.deepEqual(actual, expected, `seed ${fixture.seed} natural call ${call.id} points`);
      assert.equal(words, fixture.words[index], `seed ${fixture.seed} natural call ${call.id} RNG words`);
      const following = random.clone();
      assert.deepEqual([following.nextInt(100), following.nextInt(100), following.nextInt(100)],
        call.rngAfter.random100, `seed ${fixture.seed} natural call ${call.id} following RNG state`);
    }
  }
});

test('FREE-PATH validates point shape, visibility, precision, and random source', () => {
  assert.throws(() => aaronFreePath([[0, 0]], new Allegro501Random(1)), /at least two/);
  assert.throws(() => aaronFreePath([[0, 0, 1], [10, 0]], new Allegro501Random(1)), /triples/);
  assert.throws(() => aaronFreePath([[0, 0, 1], [10, 0, 1]], {}, {}), /random source/);
  assert.throws(() => aaronFreePath([[0, 0, 1], [10, 0, 1]], new Allegro501Random(1), { precision: 'bad' }), /precision/);
  assert.throws(() => aaronFreePath([[0, 0, 1], [10, 0, 1]], new Allegro501Random(1), { edgePrecisions: ['single'] }), /edgePrecisions/);
});
