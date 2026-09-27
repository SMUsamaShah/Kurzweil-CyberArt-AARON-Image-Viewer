import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AARON_BRUSH_PROFILES,
  findAaronBrushBand,
  getAaronBrushProfile,
  selectAaronBrushProfile,
} from '../src/aaron-brushes.js';

const evidencePath = new URL(
  '../../research/introspection/evidence/brush-census-34068649921.txt',
  import.meta.url,
);
const selectMatrixEvidencePath = new URL(
  '../../research/introspection/evidence/select-brush-matrix-seed1234-20260927.json',
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

test('measured profiles and SELECT-BRUSH band helpers are exposed', () => {
  assert.equal(getAaronBrushProfile(4), AARON_BRUSH_PROFILES[4]);
  assert.equal(getAaronBrushProfile(99), undefined);
  assert.equal(findAaronBrushBand(0), undefined);
  assert.equal(findAaronBrushBand(100), undefined);
  assert.equal(findAaronBrushBand(3000).id, 1);
  assert.equal(findAaronBrushBand(199999).id, 6);
  assert.equal(findAaronBrushBand(200000).id, 6);
  assert.equal(findAaronBrushBand(200001).id, 6);
  assert.equal(findAaronBrushBand(-1).id, 6);
  assert.throws(() => findAaronBrushBand(Number.NaN), TypeError);
});

test('SELECT-BRUSH adapter reproduces the archived integer boundary matrix', () => {
  const evidence = JSON.parse(fs.readFileSync(selectMatrixEvidencePath, 'utf8'));
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.source.runId, 'select-brush-matrix-seed-1234-a');
  assert.match(evidence.source.matrixReportSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    evidence.source.aa0Sha256,
    '0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1',
  );
  assert.equal(
    evidence.source.sceneReportSha256,
    'de6101789722dedc9e7a122e1f3e742f7735daf80e4620e799de83b55e8c6476',
  );
  assert.deepEqual(evidence.source.baselineRunIds, [
    'transition-seed-1234-v5-a',
    'transition-seed-1234-v5-b',
  ]);
  assert.deepEqual(evidence.stateChecks, {
    profileIdsAndEnvirPrePostEqual: true,
    brushUnboundBeforeAndAfterEveryCase: true,
    rngPreviewPerCase: '1210,62228,39458',
    rngUnchangedEveryCase: true,
    ambientRngUnchanged: true,
    allReturnedBrushObjectsEqualTheirAllBrushesEntry: true,
  });

  const cases = evidence.cases;
  assert.equal(cases.length, 25);
  assert.deepEqual(
    cases.map(({input, status, resultId}) => [input, status, resultId]),
    [
      [-1, 'VALUE', 6], [0, 'NIL', null], [1, 'NIL', null],
      [99, 'NIL', null], [100, 'NIL', null], [101, 'VALUE', 1],
      [2999, 'VALUE', 1], [3000, 'VALUE', 1], [3001, 'VALUE', 2],
      [7999, 'VALUE', 2], [8000, 'VALUE', 2], [8001, 'VALUE', 3],
      [15999, 'VALUE', 3], [16000, 'VALUE', 3], [16001, 'VALUE', 4],
      [59999, 'VALUE', 4], [60000, 'VALUE', 4], [60001, 'VALUE', 5],
      [119999, 'VALUE', 5], [120000, 'VALUE', 5], [120001, 'VALUE', 6],
      [199999, 'VALUE', 6], [200000, 'VALUE', 6], [200001, 'VALUE', 6],
      [7131, 'VALUE', 2],
    ],
  );
  assert.deepEqual(
    evidence.profiles,
    AARON_BRUSH_PROFILES.map(({id, envir}) => ({id, envir})),
  );
  for (const sample of cases) {
    assert.equal(sample.condition, 'NONE', `condition at input ${sample.input}`);
    assert.equal(sample.valueCount, 1, `value count at input ${sample.input}`);
    const actual = selectAaronBrushProfile(sample.input);
    if (sample.status === 'NIL') {
      assert.equal(sample.resultId, null, `recorded NIL ID at input ${sample.input}`);
      assert.equal(sample.allBrushesIndex, null, `recorded NIL identity at input ${sample.input}`);
      assert.equal(actual, undefined, `SELECT-BRUSH(${sample.input})`);
      assert.equal(findAaronBrushBand(sample.input), undefined);
    } else {
      assert.equal(sample.status, 'VALUE', `status at input ${sample.input}`);
      assert.equal(sample.allBrushesIndex, sample.resultId, `identity at input ${sample.input}`);
      assert.equal(actual, getAaronBrushProfile(sample.resultId), `SELECT-BRUSH(${sample.input})`);
      assert.equal(findAaronBrushBand(sample.input), actual);
    }
  }

  assert.equal(selectAaronBrushProfile(1), undefined);
  assert.equal(selectAaronBrushProfile(1, {outOfRange: 'clamp'}).id, 0);
  assert.equal(selectAaronBrushProfile(-1).id, 6);
  assert.equal(selectAaronBrushProfile(200000, {outOfRange: 'clamp'}).id, 6);
  assert.equal(selectAaronBrushProfile(200001).id, 6);
  assert.throws(
    () => selectAaronBrushProfile(1, {outOfRange: 'error'}),
    /outOfRange/,
  );
});
