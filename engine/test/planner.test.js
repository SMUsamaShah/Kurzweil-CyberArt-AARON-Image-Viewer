import assert from 'node:assert/strict';
import test from 'node:test';

import { AaronRandom } from '../src/random.js';
import { AaronPlanner } from '../src/planner.js';
import { SpatialGrid, GRID_BOUNDARY, GRID_OCCUPIED } from '../src/spatial-grid.js';

test('spatial grid blocks occupied polygons and bridges diagonal lines', () => {
  const grid = new SpatialGrid({ width: 100, height: 100, columns: 10, rows: 10 });
  grid.markLine([0, 0], [100, 100], GRID_BOUNDARY);
  assert.equal(grid.get(1, 0), GRID_BOUNDARY);
  assert.equal(grid.get(0, 1), GRID_BOUNDARY);
  const polygon = [[20, 20], [60, 20], [60, 60], [20, 60]];
  grid.markPolygon(polygon, GRID_OCCUPIED);
  assert.equal(grid.canPlacePolygon(polygon), false);
});

test('planner produces reproducible non-overlapping figure placements', () => {
  const left = new AaronPlanner({ width: 320, height: 240, random: new AaronRandom(7), roughness: 0 });
  const right = new AaronPlanner({ width: 320, height: 240, random: new AaronRandom(7), roughness: 0 });
  const leftFigures = left.planFigures({ count: 3 });
  const rightFigures = right.planFigures({ count: 3 });
  assert.deepEqual(leftFigures, rightFigures);
  assert(leftFigures.length > 0);
  assert(leftFigures.length <= 3);
  assert(leftFigures.every(({ polygon }) => left.grid.canPlacePolygon(polygon) === false));
});

test('planner exposes accepted rectangular figure frames and preserves indices', () => {
  const planner = new AaronPlanner({ width: 320, height: 240, random: new AaronRandom(7), roughness: 0 });
  const frames = planner.planFigureFrames({ count: 10, width: 57.6, height: 124.8 });
  assert.equal(frames.length, 3);
  assert.deepEqual(frames.map(({ index }) => index), [0, 1, 2]);
  for (const frame of frames) {
    assert.equal(frame.frame.x, frame.polygon[0][0]);
    assert.equal(frame.frame.y, frame.polygon[0][1]);
    assert(Math.abs(frame.frame.width - 57.6) < 1e-9);
    assert(Math.abs(frame.frame.height - 124.8) < 1e-9);
    assert(frame.frame.x >= planner.grid.cellSize);
    assert(frame.frame.y >= planner.grid.cellSize);
    assert(frame.frame.x + frame.frame.width <= planner.grid.width - planner.grid.cellSize);
    assert(frame.frame.y + frame.frame.height <= planner.grid.height - planner.grid.cellSize);
  }
});

test('planner rejects an impossible frame without an inverted random range', () => {
  const planner = new AaronPlanner({ width: 32, height: 240, random: new AaronRandom(7), roughness: 0 });
  assert.deepEqual(planner.planFigureFrames({ count: 1, width: 16, height: 120 }), []);
});
