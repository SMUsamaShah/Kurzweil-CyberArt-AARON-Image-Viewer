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
    const minimumX = -bounds.minX + margin;
    const maximumX = this.grid.width - bounds.maxX - margin;
    const minimumY = -bounds.minY + margin;
    const maximumY = this.grid.height - bounds.maxY - margin;
    // A rejected proposal is a normal planning outcome. Do not pass an
    // inverted range to the random source when the candidate cannot fit.
    if (maximumX < minimumX || maximumY < minimumY) return null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const x = this.random.between(minimumX, maximumX);
      const y = this.random.between(minimumY, maximumY);
      const polygon = translatePolygon(footprint, x, y);
      const metadata = typeof options.metadata === 'function'
        ? options.metadata(polygon, { attempt, x, y })
        : options.metadata;
      const record = this.place(kind, polygon, metadata, {
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

  /**
   * Reserve rectangular figure frames for the composition layer.
   *
   * The rectangle is deliberately a planning contract, not an artistic rule:
   * the original PLAN/MAPPING placement policy is still unresolved. Keeping
   * the accepted frame explicit lets generated geometry honour the proposal
   * that the planner actually accepted and makes later oracle measurements
   * replace this scaffold without changing the generator boundary.
   */
  planFigureFrames({ count = 1, width = this.grid.width * 0.18, height = this.grid.height * 0.52 } = {}) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('figure count must be a non-negative integer');
    }
    if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      throw new RangeError('figure frame dimensions must be positive and finite');
    }
    const footprint = [[0, 0], [width, 0], [width, height], [0, height]];
    const frames = [];
    for (let index = 0; index < count; index += 1) {
      const record = this.findPlacement('figure', footprint, {
        attempts: 96,
        margin: this.grid.cellSize,
        allowRough: true,
        metadata: (polygon) => {
          const bounds = polygonBounds(polygon);
          return {
            index,
            frame: {
              x: bounds.minX,
              y: bounds.minY,
              width: bounds.maxX - bounds.minX,
              height: bounds.maxY - bounds.minY,
            },
          };
        },
      });
      if (record) frames.push(record);
    }
    return frames;
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
