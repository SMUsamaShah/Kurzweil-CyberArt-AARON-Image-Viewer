import { pointInPolygon, polygonBounds } from './geometry.js';

export const GRID_EMPTY = 0;
export const GRID_ROUGH = 1;
export const GRID_OCCUPIED = 2;
export const GRID_BOUNDARY = 3;

function integer(value) {
  return Math.floor(value);
}

function sign(value) {
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}

/**
 * Coarse occupancy model for the planner/mapping layer.
 *
 * Rows are measured from the bottom of the image, matching AA coordinates.
 * Diagonal raster steps reserve their two orthogonal neighbours as well, so a
 * path never relies on corner-only contact between cells.
 */
export class SpatialGrid {
  constructor({ width, height, columns, rows, cellSize = 8 }) {
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError('grid dimensions must be positive integers');
    }
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.columns = columns ?? Math.ceil(width / cellSize);
    this.rows = rows ?? Math.ceil(height / cellSize);
    if (!Number.isInteger(this.columns) || this.columns <= 0 || !Number.isInteger(this.rows) || this.rows <= 0) {
      throw new RangeError('grid columns and rows must be positive integers');
    }
    this.cells = new Uint8Array(this.columns * this.rows);
  }

  clone() {
    const copy = new SpatialGrid({
      width: this.width,
      height: this.height,
      columns: this.columns,
      rows: this.rows,
      cellSize: this.cellSize,
    });
    copy.cells.set(this.cells);
    return copy;
  }

  index(column, row) {
    return row * this.columns + column;
  }

  validCell(column, row) {
    return column >= 0 && column < this.columns && row >= 0 && row < this.rows;
  }

  cellForPoint(x, y) {
    const column = Math.floor((x / this.width) * this.columns);
    const row = Math.floor((y / this.height) * this.rows);
    return { column, row };
  }

  pointForCell(column, row) {
    return [
      (column + 0.5) * this.width / this.columns,
      (row + 0.5) * this.height / this.rows,
    ];
  }

  get(column, row) {
    return this.validCell(column, row) ? this.cells[this.index(column, row)] : GRID_BOUNDARY;
  }

  set(column, row, value) {
    if (this.validCell(column, row)) this.cells[this.index(column, row)] = value;
    return this;
  }

  markCell(column, row, value = GRID_OCCUPIED) {
    return this.set(column, row, Math.max(this.get(column, row), value));
  }

  *neighbors(column, row, diagonal = true) {
    const directions = diagonal
      ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
      : [[0, -1], [-1, 0], [1, 0], [0, 1]];
    for (const [dx, dy] of directions) {
      const nextColumn = column + dx;
      const nextRow = row + dy;
      if (this.validCell(nextColumn, nextRow)) yield { column: nextColumn, row: nextRow };
    }
  }

  markLine(first, last, value = GRID_BOUNDARY) {
    let x0 = this.cellForPoint(first[0], first[1]);
    const x1 = this.cellForPoint(last[0], last[1]);
    let column = x0.column;
    let row = x0.row;
    const targetColumn = x1.column;
    const targetRow = x1.row;
    const deltaColumn = Math.abs(targetColumn - column);
    const deltaRow = Math.abs(targetRow - row);
    const stepColumn = sign(targetColumn - column);
    const stepRow = sign(targetRow - row);
    let error = deltaColumn - deltaRow;
    while (true) {
      this.markCell(column, row, value);
      if (column === targetColumn && row === targetRow) break;
      const previousColumn = column;
      const previousRow = row;
      const twice = 2 * error;
      if (twice > -deltaRow) {
        error -= deltaRow;
        column += stepColumn;
      }
      if (twice < deltaColumn) {
        error += deltaColumn;
        row += stepRow;
      }
      // Prevent corner-only links: reserve an orthogonal bridge when both
      // coordinates changed in a single Bresenham step.
      if (column !== previousColumn && row !== previousRow) {
        this.markCell(column, previousRow, value);
        this.markCell(previousColumn, row, value);
      }
    }
    return this;
  }

  markPolygon(polygon, value = GRID_OCCUPIED) {
    if (polygon.length < 3) return this;
    for (let index = 0; index < polygon.length; index += 1) {
      this.markLine(polygon[index], polygon[(index + 1) % polygon.length], GRID_BOUNDARY);
    }
    const bounds = polygonBounds(polygon);
    const minimum = this.cellForPoint(bounds.minX, bounds.minY);
    const maximum = this.cellForPoint(bounds.maxX, bounds.maxY);
    for (let row = Math.max(0, minimum.row); row <= Math.min(this.rows - 1, maximum.row); row += 1) {
      for (let column = Math.max(0, minimum.column); column <= Math.min(this.columns - 1, maximum.column); column += 1) {
        if (pointInPolygon(this.pointForCell(column, row), polygon)) this.markCell(column, row, value);
      }
    }
    return this;
  }

  canPlacePolygon(polygon, { allowRough = false, margin = 0 } = {}) {
    const bounds = polygonBounds(polygon);
    if (!bounds) return false;
    if (bounds.minX < margin || bounds.minY < margin
      || bounds.maxX > this.width - margin || bounds.maxY > this.height - margin) return false;
    const minimum = this.cellForPoint(bounds.minX - margin, bounds.minY - margin);
    const maximum = this.cellForPoint(bounds.maxX + margin, bounds.maxY + margin);
    for (let row = Math.max(0, minimum.row); row <= Math.min(this.rows - 1, maximum.row); row += 1) {
      for (let column = Math.max(0, minimum.column); column <= Math.min(this.columns - 1, maximum.column); column += 1) {
        const status = this.get(column, row);
        if (status >= GRID_OCCUPIED || (status === GRID_ROUGH && !allowRough)) return false;
      }
    }
    return true;
  }

  reservePolygon(polygon, options = {}) {
    if (!this.canPlacePolygon(polygon, options)) return false;
    this.markPolygon(polygon, GRID_OCCUPIED);
    return true;
  }

  roughen(random, fraction = 0.12) {
    if (!random || typeof random.nextFloat !== 'function') throw new TypeError('roughen requires a seeded random source');
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        if (random.nextFloat() < fraction) this.markCell(column, row, GRID_ROUGH);
      }
    }
    return this;
  }

  density() {
    let occupied = 0;
    for (const value of this.cells) if (value >= GRID_OCCUPIED) occupied += 1;
    return occupied / this.cells.length;
  }

  counts() {
    const counts = { empty: 0, rough: 0, occupied: 0, boundary: 0 };
    for (const value of this.cells) {
      if (value === GRID_EMPTY) counts.empty += 1;
      else if (value === GRID_ROUGH) counts.rough += 1;
      else if (value === GRID_OCCUPIED) counts.occupied += 1;
      else counts.boundary += 1;
    }
    return counts;
  }
}

export function createSpatialGrid(options) {
  return new SpatialGrid(options);
}
