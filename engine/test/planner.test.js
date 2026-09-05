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
