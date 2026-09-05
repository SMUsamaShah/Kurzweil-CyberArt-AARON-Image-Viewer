import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Allegro501Random } from '../src/allegro-random.js';

const reference = JSON.parse(readFileSync(new URL('./fixtures/random-reference.json', import.meta.url)));
const validation = JSON.parse(readFileSync(new URL('./fixtures/random-validation.json', import.meta.url)));

test('matches original Allegro integer, float, and RAN reference vectors', () => {
  assert.equal(reference.vectors.length, 48);
  assert.equal(reference.errors.length, 4);
  for (const row of reference.vectors) {
    const random = new Allegro501Random(row.seed);
    const type = row.type ?? row.boundType;
    const actual = row.values.map(() => {
      if (row.kind === 'RAN') {
        if (type === 'SINGLE-FLOAT') assert.deepEqual(row.bounds, [0, 1]);
        return type === 'FIXNUM' ? random.integer(...row.bounds) : random.nextFloat();
      }
      if (type === 'SINGLE-FLOAT') return random.nextFloat(row.limit);
      if (type === 'DOUBLE-FLOAT') return random.nextDouble(row.limit);
      return random.nextInt(row.limit);
    });
    const expected = type === 'SINGLE-FLOAT' ? row.values.map(Math.fround) : row.values;
    assert.deepEqual(actual, expected, `seed=${row.seed} type=${type} limit=${row.limit} bounds=${row.bounds}`);
  }
});

test('matches 6,140 independent values, including multiple twist cycles and numeric boundaries', () => {
  assert.equal(validation.vectors.length, 73);
  assert.deepEqual(validation.errors, []);
  let count = 0;
  for (const row of validation.vectors) {
    const random = new Allegro501Random(row.seed);
    for (const [index, value] of row.values.entries()) {
      const actual = row.type === 'SINGLE-FLOAT' ? random.nextFloat(row.limit)
        : row.type === 'DOUBLE-FLOAT' ? random.nextDouble(row.limit) : random.nextInt(row.limit);
      const expected = row.type === 'SINGLE-FLOAT' ? Math.fround(value) : value;
      assert.equal(actual, expected, `seed=${row.seed} type=${row.type} limit=${row.limit} index=${index}`);
      count += 1;
    }
  }
  assert.equal(count, 6140);
});

test('reversed RAN bounds fail before consuming state; clones keep position', () => {
  for (const seed of [1, 1234, 5678, 5489]) {
    const random = new Allegro501Random(seed);
    random.nextFloat();
    const copy = random.clone();
    assert.throws(() => random.integer(10, 0), RangeError);
    assert.equal(random.nextDouble(), copy.nextDouble());
    assert.equal(random.nextInt(1000), copy.nextInt(1000));
    for (let i = 0; i < 1300; i += 1) assert.equal(random.nextFloat(), copy.nextFloat());
  }
});

test('supports the random-source interface used by the provisional planner', () => {
  const random = new Allegro501Random(1234);
  assert.equal(random.pick(['a']), 'a');
  assert.deepEqual(random.shuffle([1]), [1]);
  const value = random.between(-2, 2);
  assert(value >= -2 && value <= 2);
});
