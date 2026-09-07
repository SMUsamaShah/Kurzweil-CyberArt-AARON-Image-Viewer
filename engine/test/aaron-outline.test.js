import assert from 'node:assert/strict';
import test from 'node:test';

import { Allegro501Random } from '../src/allegro-random.js';
import { createFreePathOutline } from '../src/aaron-outline.js';

test('free-path outline adapter preserves cyclic vertices and input immutability', () => {
  const polygon = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const original = structuredClone(polygon);
  const path = createFreePathOutline(polygon, new Allegro501Random(1234));

  assert.deepEqual(polygon, original);
  assert(path.length > polygon.length);
  assert.deepEqual(path[0], path.at(-1));
  assert(path.every((point) => point.length === 2 && point.every(Number.isFinite)));
  assert(Object.isFrozen(path));
  assert(Object.isFrozen(path[0]));
});

test('free-path outline adapter keeps the measured random-source boundary', () => {
  assert.throws(
    () => createFreePathOutline([[0, 0], [10, 0]], {}),
    /random source/,
  );
  assert.throws(
    () => createFreePathOutline([[0, 0]], new Allegro501Random(1)),
    /at least two/,
  );
});

