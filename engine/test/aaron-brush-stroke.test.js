import test from 'node:test';
import assert from 'node:assert/strict';
import { getAaronBrushProfile } from '../src/aaron-brushes.js';
import { applyMeasuredBrushVertices } from '../src/aaron-brush-stroke.js';
import { createAaronMaps } from '../src/aaron-maps.js';

const horizontal = [102, 103, 104, 118, 119, 120, 134, 135, 136, 150, 151, 152];
const vertical = [102, 103, 104, 105, 118, 119, 120, 121, 134, 135, 136, 137];
const brushTwoHorizontal = [
  86, 87, 88,
  101, 102, 103, 104, 105,
  117, 118, 119, 120, 121,
  133, 134, 135, 136, 137,
  149, 150, 151, 152, 153,
  166, 167, 168,
];

function nonzero(map) {
  return [...map].flatMap((value, index) => (value ? [[index, value]] : []));
}

test('matches the measured horizontal brush-1 footprint and value 1', () => {
  const maps = createAaronMaps(16, 16);
  const touched = applyMeasuredBrushVertices(
    maps,
    getAaronBrushProfile(1),
    [[7, 7], [8, 7]],
    1,
  );
  assert.deepEqual(touched, horizontal);
  assert.deepEqual(nonzero(maps.fillMap), horizontal.map((index) => [index, 1]));
  assert.deepEqual([...maps.patchMap].filter(Boolean), []);
});

test('matches the measured vertical transposition and direct value 3', () => {
  const maps = createAaronMaps(16, 16);
  const touched = applyMeasuredBrushVertices(
    maps,
    getAaronBrushProfile(1),
    [[7, 7], [7, 8]],
    3,
  );
  assert.deepEqual(touched, vertical);
  assert.deepEqual(nonzero(maps.fillMap), vertical.map((index) => [index, 3]));
});

test('matches the captured horizontal footprint for brush 2', () => {
  const maps = createAaronMaps(16, 16);
  const touched = applyMeasuredBrushVertices(
    maps,
    getAaronBrushProfile(2),
    [[7, 7], [8, 7]],
    1,
  );
  assert.deepEqual(touched, brushTwoHorizontal);
  assert.deepEqual(
    nonzero(maps.fillMap),
    brushTwoHorizontal.map((index) => [index, 1]),
  );
});

test('keeps the measured empty and singleton path boundary', () => {
  const profile = getAaronBrushProfile(1);
  const empty = createAaronMaps(16, 16);
  const singleton = createAaronMaps(16, 16);
  assert.deepEqual(applyMeasuredBrushVertices(empty, profile, [], 1), []);
  assert.deepEqual(
    applyMeasuredBrushVertices(singleton, profile, [[7, 7]], 1),
    [],
  );
  assert.deepEqual(nonzero(empty.fillMap), []);
  assert.deepEqual(nonzero(singleton.fillMap), []);
});
