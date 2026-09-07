import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { RAN_HAND_JOINTS, ranHand } from '../src/aaron-hand.js';

const fixture = JSON.parse(readFileSync(new URL(
  './fixtures/ran-hand-post-init.json', import.meta.url,
), 'utf8'));

test('matches the measured RAN-HAND joint order, rounding, and return value', () => {
  assert.deepEqual(RAN_HAND_JOINTS, fixture.jointNames);
  for (const row of fixture.calls) {
    const joints = Object.fromEntries(fixture.jointNames.map((name, index) => [
      name, row.before[index],
    ]));
    const remaining = [...row.deltas];
    const calls = [];
    const random = {
      ranFloat(minimum, maximum, options) {
        calls.push({ minimum, maximum, options });
        return remaining.shift();
      },
    };

    assert.equal(ranHand(joints, random), Math.fround(row.returned));
    assert.deepEqual(
      fixture.jointNames.map(name => joints[name]),
      row.after.map(Math.fround),
      JSON.stringify(row),
    );
    assert.deepEqual(calls, row.deltas.map(() => ({
      minimum: fixture.random.minimum,
      maximum: fixture.random.maximum,
      options: {
        aPrecision: fixture.random.aPrecision,
        bPrecision: fixture.random.bPrecision,
      },
    })));
    assert.equal(remaining.length, 0);
    assert.equal(row.sampleAfter - row.sampleBefore, fixture.random.samplesPerCall);
  }
});

test('rejects incomplete hand state or a missing random source', () => {
  assert.throws(() => ranHand({}, { ranFloat() { return 0; } }), /joint TJ3X/);
  assert.throws(() => ranHand({ TJ3X: 0 }, { ranFloat() { return 0; } }), /joint TJ2X/);
  assert.throws(() => ranHand({}, null), /random source/);
});
