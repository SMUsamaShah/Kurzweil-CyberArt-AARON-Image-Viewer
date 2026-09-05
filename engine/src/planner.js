import { polygonBounds } from './geometry.js';
import { SpatialGrid } from './spatial-grid.js';

function translatePolygon(polygon, x, y) {
  return polygon.map(([pointX, pointY]) => [pointX + x, pointY + y]);
}

function defaultFootprint(width, height) {
  return [
    [-width / 2, 0],
    [width / 2, 0],
    [width * 0.42, height],
    [-width * 0.42, height],
  ];
}

/** Planner/mapping boundary for clean-room scene rules. */
export class AaronPlanner {
  constructor({ width, height, random, cellSize = 16, roughness = 0.08 } = {}) {
    if (!random) throw new TypeError('planner requires a seeded random source');
    this.random = random;
    this.grid = new SpatialGrid({ width, height, cellSize });
    this.grid.roughen(random, roughness);
    this.objects = [];
  }

  place(kind, polygon, metadata = {}, options = {}) {
    if (!this.grid.reservePolygon(polygon, options)) return null;
    const record = Object.freeze({ kind, polygon, ...metadata });
    this.objects.push(record);
    return record;
  }

  findPlacement(kind, footprint, options = {}) {
    const bounds = polygonBounds(footprint);
    if (!bounds) return null;
    const attempts = options.attempts ?? 64;
    const margin = options.margin ?? 0;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const x = this.random.between(-bounds.minX + margin, this.grid.width - bounds.maxX - margin);
      const y = this.random.between(-bounds.minY + margin, this.grid.height - bounds.maxY - margin);
      const polygon = translatePolygon(footprint, x, y);
      const record = this.place(kind, polygon, options.metadata, {
        allowRough: options.allowRough ?? false,
        margin,
      });
      if (record) return record;
    }
    return null;
  }

  planFigures({ count = 1, width = this.grid.width * 0.18, height = this.grid.height * 0.52 } = {}) {
    const figures = [];
    for (let index = 0; index < count; index += 1) {
      const footprint = defaultFootprint(width, height);
      const record = this.findPlacement('figure', footprint, {
        attempts: 96,
        margin: this.grid.cellSize,
        allowRough: true,
        metadata: { index },
      });
      if (record) figures.push(record);
    }
    return figures;
  }

  snapshot() {
    return {
      width: this.grid.width,
      height: this.grid.height,
      columns: this.grid.columns,
      rows: this.grid.rows,
      density: this.grid.density(),
      counts: this.grid.counts(),
      objects: this.objects.map(({ kind, polygon, ...metadata }) => ({ kind, polygon, ...metadata })),
    };
  }
}

export function createAaronPlanner(options) {
  return new AaronPlanner(options);
}
