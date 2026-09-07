import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {parseBrushStrokeReport} from '../parse-brush-stroke-report.mjs';

const sample = [
  'BEGIN brush-stroke-isolated',
  'RESOLVER-OK',
  'STAGE-23-BRUSH-MATRIX-BEGIN',
  'MATRIX-CASE b1 BRUSH 1 VALUE 3 CDEX 1 SDEX 0 INSIDE NIL',
  'MATRIX-SCREEN b1 1 1 0',
  'MATRIX-POINT b1 0 10 10',
  'MATRIX-POINT b1 1 11 10',
  'MATRIX-FILL b1 100 3',
  'MATRIX-SCREEN-COUNT b1 1',
  'MATRIX-INSIDE-COUNT b1 8',
  'MATRIX-RETURNED',
  'MATRIX-CASE edge BRUSH 1 VALUE 1 CDEX 0 SDEX 0 INSIDE T',
  'MATRIX-ERROR edge SIMPLE-ERROR',
  'MATRIX-FILL edge 0 1',
  'MATRIX-SCREEN-COUNT edge 0',
  'MATRIX-INSIDE-COUNT edge 1',
  'MATRIX-ERRORED',
  'STAGE-23-BRUSH-MATRIX-END',
  'STAGE-1-RESOLUTION-ONLY',
  'END brush-stroke-isolated',
].join('\n');

test('parses Stage 23 matrix cases and preserves returned/error boundaries', () => {
  const report = parseBrushStrokeReport(sample);
  assert.equal(report.cases.length, 2);
  assert.deepEqual(report.cases[0], {
    name: 'b1', brushId: 1, value: 3, cdex: 1, sdex: 0, inside: false,
    screens: [{call: 1, cdex: 1, sdex: 0, points: [
      {index: 0, x: 10, y: 10}, {index: 1, x: 11, y: 10},
    ]}],
    fillCells: [{index: 100, value: 3}], patchCells: [],
    screenCount: 1, insideCount: 8, outcome: 'returned',
  });
  assert.equal(report.cases[1].error, 'SIMPLE-ERROR');
  assert.equal(report.cases[1].outcome, 'errored');
  assert.deepEqual(report.cases[1].fillCells, [{index: 0, value: 1}]);
});

test('parses the completed original-engine brush capture', () => {
  const evidence = readFileSync(new URL(
    '../../introspection/evidence/brush-stroke-isolated-34146017804.txt',
    import.meta.url,
  ), 'utf8');
  const report = parseBrushStrokeReport(evidence);
  assert.equal(report.cases.length, 6);
  assert.equal(report.cases[0].name, 'b1-horizontal');
  assert.equal(report.cases[0].outcome, 'returned');
  assert.equal(report.cases[0].screens[0].points.length, 2);
  assert.deepEqual(report.cases[0].fillCells, [
    {index: 102, value: 1}, {index: 103, value: 1}, {index: 104, value: 1},
    {index: 118, value: 1}, {index: 119, value: 1}, {index: 120, value: 1},
    {index: 134, value: 1}, {index: 135, value: 1}, {index: 136, value: 1},
    {index: 150, value: 1}, {index: 151, value: 1}, {index: 152, value: 1},
  ]);
  assert.equal(report.cases[1].name, 'b2-horizontal');
  assert.equal(report.cases[1].fillCells.length, 26);
  assert.equal(report.cases[1].screenCount, 1);
  assert.equal(report.cases[1].insideCount, 42);
  for (const [index, fillCount, insideCount] of [[2, 70, 122], [3, 108, 194]]) {
    assert.equal(report.cases[index].name, `b${index + 1}-horizontal`);
    assert.equal(report.cases[index].fillCells.length, fillCount);
    assert.deepEqual(report.cases[index].patchCells, []);
    assert.equal(report.cases[index].screenCount, 1);
    assert.equal(report.cases[index].insideCount, insideCount);
    assert.equal(report.cases[index].outcome, 'returned');
  }
  const overlap = report.cases[4];
  assert.equal(overlap.name, 'b1-overlap-horizontal');
  assert.deepEqual(overlap.fillCells, report.cases[0].fillCells);
  assert.deepEqual(overlap.screens[0].points, [
    {index: 0, x: 7, y: 7}, {index: 1, x: 8, y: 7},
    {index: 2, x: 7, y: 7},
  ]);
  assert.equal(overlap.screenCount, 1);
  assert.equal(overlap.insideCount, 27);
  assert.equal(overlap.outcome, 'returned');
  const edge = report.cases[5];
  assert.equal(edge.name, 'b1-edge-horizontal');
  assert.equal(edge.error, 'SIMPLE-ERROR');
  assert.deepEqual(edge.fillCells, [{index: 0, value: 1}]);
  assert.deepEqual(edge.patchCells, []);
  assert.deepEqual(edge.screens[0].points, [
    {index: 0, x: 0, y: 0}, {index: 1, x: 1, y: 0},
  ]);
  assert.equal(edge.screenCount, 1);
  assert.equal(edge.insideCount, 2);
  assert.equal(edge.outcome, 'errored');
});

test('rejects a partial Stage 23 case', () => {
  assert.throws(
    () => parseBrushStrokeReport(sample.replace('MATRIX-RETURNED', 'MATRIX-SCREEN-COUNT b1 1\nMATRIX-RETURNED')),
    /Duplicate screenCount/,
  );
});

test('rejects a report without matrix cases', () => {
  const empty = sample
    .replace(/MATRIX-CASE[\s\S]*?STAGE-23-BRUSH-MATRIX-END\n/, 'STAGE-23-BRUSH-MATRIX-END\n');
  assert.throws(() => parseBrushStrokeReport(empty), /Empty brush matrix report/);
});
