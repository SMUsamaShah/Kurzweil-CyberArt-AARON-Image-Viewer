import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aaronMapIndex,
  createAaronMaps,
  initializeAaronMaps,
  writeAaronFillCell,
} from '../src/aaron-maps.js';

test('allocates separate measured patch and fill maps in width-by-height order', () => {
  const maps = createAaronMaps(3, 5);
  assert.deepEqual({ width: maps.width, height: maps.height }, { width: 3, height: 5 });
  assert.equal(maps.patchMap.constructor, Uint16Array);
  assert.equal(maps.fillMap.constructor, Uint8Array);
  assert.equal(maps.patchMap.length, 15);
  assert.equal(maps.fillMap.length, 15);
  assert.deepEqual([...maps.patchMap], new Array(15).fill(0));
  assert.deepEqual([...maps.fillMap], new Array(15).fill(0));
  assert.notEqual(maps.patchMap, maps.fillMap);
  assert.equal(Object.isFrozen(maps), true);
});

test('preserves asymmetric dimensions and creates fresh arrays on reinitialization', () => {
  const first = initializeAaronMaps(5, 3);
  const second = initializeAaronMaps(5, 3);
  assert.equal(first.patchMap.length, 15);
  assert.equal(first.fillMap.length, 15);
  assert.notEqual(first.patchMap, second.patchMap);
  assert.notEqual(first.fillMap, second.fillMap);
  const unit = createAaronMaps(1, 1);
  assert.equal(unit.patchMap[0], 0);
  assert.equal(unit.fillMap[0], 0);
});

test('rejects dimensions outside the measured positive private cases', () => {
  assert.throws(() => createAaronMaps(0, 1), RangeError);
  assert.throws(() => createAaronMaps(1, 0), RangeError);
  assert.throws(() => createAaronMaps(-1, 1), RangeError);
  assert.throws(() => createAaronMaps(1.5, 1), RangeError);
  assert.throws(() => createAaronMaps(Number.MAX_SAFE_INTEGER, 2), RangeError);
});

test('uses the measured first-coordinate-major map index', () => {
  assert.equal(aaronMapIndex(16, 16, 6, 6), 102);
  assert.equal(aaronMapIndex(16, 16, 8, 9), 137);
  const maps = createAaronMaps(3, 5);
  assert.equal(writeAaronFillCell(maps, 2, 4, 3), 14);
  assert.equal(maps.fillMap[14], 3);
  assert.throws(() => aaronMapIndex(3, 5, 3, 0), RangeError);
  assert.throws(() => aaronMapIndex(3, 5, 0, 5), RangeError);
  assert.throws(() => writeAaronFillCell(maps, 0, 0, 16), RangeError);
});
