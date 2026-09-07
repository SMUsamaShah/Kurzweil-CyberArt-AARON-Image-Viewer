import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AARON_BRUSH_PROFILES,
  findAaronBrushBand,
  getAaronBrushProfile,
} from '../src/aaron-brushes.js';

const evidencePath = new URL(
  '../../research/introspection/evidence/brush-census-34068649921.txt',
  import.meta.url,
);

function points(text) {
  return [...text.matchAll(/\((-?\d+) (-?\d+)\)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);
}

function parseMeasuredProfiles() {
  const lines = fs.readFileSync(evidencePath, 'utf8').trim().split(/\r?\n/);
  const profiles = [];
  for (let index = 0; index < lines.length; index += 1) {
    const scalarMatch = lines[index].match(
      /^BRUSH-SCALARS (\d+) ID=(\d+) WIDTH=(\d+) RAD=(\d+) CELLS=(\d+)/,
    );
    if (!scalarMatch) continue;
    const shapeLine = lines[index + 1];
    const environmentMatch = shapeLine.match(/ENVIR=\((-?\d+) (-?\d+)\)/);
    const perimeterMatch = shapeLine.match(/PERIM=(.*) CORE-TYPE/);
    const coreMatch = shapeLine.match(/ CORE=(.*)$/);
    profiles.push({
      id: Number(scalarMatch[2]),
      width: Number(scalarMatch[3]),
      radius: Number(scalarMatch[4]),
      cells: Number(scalarMatch[5]),
      envir: [Number(environmentMatch[1]), Number(environmentMatch[2])],
      perimeter: perimeterMatch ? points(perimeterMatch[1]) : [],
      core: coreMatch ? points(coreMatch[1]) : [],
    });
  }
  return profiles;
}

test('startup profiles reproduce the full measured seven-brush census', () => {
  assert.deepEqual(AARON_BRUSH_PROFILES, parseMeasuredProfiles());
  assert.deepEqual(
    AARON_BRUSH_PROFILES.map(({ id, width, radius, cells, envir }) => ({
      id,
      width,
      radius,
      cells,
      envir,
    })),
    [
      { id: 0, width: 0, radius: 0, cells: 0, envir: [0, 100] },
      { id: 1, width: 3, radius: 1, cells: 5, envir: [100, 3000] },
      { id: 2, width: 5, radius: 2, cells: 12, envir: [3000, 8000] },
      { id: 3, width: 7, radius: 3, cells: 49, envir: [8000, 16000] },
      { id: 4, width: 13, radius: 6, cells: 121, envir: [16000, 60000] },
      { id: 5, width: 17, radius: 8, cells: 239, envir: [60000, 120000] },
      { id: 6, width: 19, radius: 9, cells: 329, envir: [120000, 200000] },
    ],
  );
});

test('profile data is immutable and preserves ordered irregular masks', () => {
  assert.equal(Object.isFrozen(AARON_BRUSH_PROFILES), true);
  assert.equal(Object.isFrozen(AARON_BRUSH_PROFILES[6].core), true);
  assert.equal(AARON_BRUSH_PROFILES[1].core.length, 9);
  assert.equal(AARON_BRUSH_PROFILES[1].cells, 5);
  const irregularStart = AARON_BRUSH_PROFILES[6].core.findIndex(
    ([x, y]) => x === -9 && y === 2,
  );
  assert.deepEqual(AARON_BRUSH_PROFILES[6].core.slice(irregularStart, irregularStart + 13), [
    [-9, 2], [-8, 2], [-7, 2], [-6, 2], [-5, 2], [-4, 2], [-3, 2],
    [-1, 2], [0, 2], [9, 2], [8, 2], [7, 2], [6, 2],
  ]);
});

test('measured profile and provisional ENVIR-band helpers are exposed', () => {
  assert.equal(getAaronBrushProfile(4), AARON_BRUSH_PROFILES[4]);
  assert.equal(getAaronBrushProfile(99), undefined);
  assert.equal(findAaronBrushBand(0).id, 0);
  assert.equal(findAaronBrushBand(3000).id, 2);
  assert.equal(findAaronBrushBand(199999).id, 6);
  assert.equal(findAaronBrushBand(200000), undefined);
  assert.throws(() => findAaronBrushBand(Number.NaN), TypeError);
});
