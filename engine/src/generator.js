import { createAaBuilder } from './aa-builder.js';
import { Allegro501Random } from './allegro-random.js';
import { AaronRandom } from './random.js';
import { createAaronPalette } from './palette.js';
import { createAaronPlanner } from './planner.js';
import { createFreePathOutline } from './aaron-outline.js';
import {
  ellipsePoints,
  pointInPolygon,
  polygonBounds,
  roundedRect,
  scanlineIntersections,
} from './geometry.js';

const LARGE_MODE = Object.freeze({ width: 1024, height: 768, paletteSize: 148 });
const SMALL_MODE = Object.freeze({ width: 640, height: 480, paletteSize: 184 });
// The licensed oracle uses the same compact geometry family but normally
// keeps the 148-colour palette. It remains an approximate composition profile
// until the original pose/colour tables are recovered.
const PREMIUM_MODE = Object.freeze({ width: 640, height: 480, paletteSize: 148 });
const LARGE_CANVAS_PROFILES = Object.freeze({
  portrait: 487 / 768,
  tall: 650 / 768,
  square: 1,
  wide: 1024 / 768,
});
const SMALL_CANVAS_PROFILES = Object.freeze({
  portrait: 320 / 480,
  wide: 640 / 480,
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function integer(value) {
  return Math.round(value);
}

function paletteIndex(value, palette) {
  return ((Math.round(value) % palette.length) + palette.length) % palette.length;
}

function makeShape(kind, polygon, fill, options = {}) {
  return {
    kind,
    polygon,
    fill,
    outline: options.outline ?? true,
    zPath: options.zPath ?? false,
    brush: options.brush ?? 1,
  };
}

function addClosedOutline(builder, polygon, zPath = false, {
  mode = 'polygon',
  random = null,
} = {}) {
  if (polygon.length < 2) return { inputEdges: 0, emittedPoints: 0 };
  const path = mode === 'free-path-subset'
    ? createFreePathOutline(polygon, random)
    : polygon;
  builder.move(path[0][0], path[0][1], { z: zPath });
  for (let index = 1; index < path.length; index += 1) {
    builder.draw(path[index][0], path[index][1], { z: zPath });
  }
  if (mode === 'polygon') builder.draw(polygon[0][0], polygon[0][1], { z: zPath });
  return { inputEdges: polygon.length, emittedPoints: path.length + (mode === 'polygon' ? 1 : 0) };
}

function shapesBounds(shapes) {
  let result = null;
  for (const shape of shapes) {
    const bounds = polygonBounds(shape.polygon);
    if (!bounds) continue;
    result = result
      ? {
        minX: Math.min(result.minX, bounds.minX),
        minY: Math.min(result.minY, bounds.minY),
        maxX: Math.max(result.maxX, bounds.maxX),
        maxY: Math.max(result.maxY, bounds.maxY),
      }
      : { ...bounds };
  }
  return result;
}

function fitShapesToFrame(shapes, frame) {
  const sourceBounds = shapesBounds(shapes);
  if (!sourceBounds) return { shapes, sourceBounds: null, bounds: null, scale: 1 };
  const inset = Math.min(frame.width, frame.height) * 0.02;
  const inner = {
    x: frame.x + inset,
    y: frame.y + inset,
    width: Math.max(0, frame.width - inset * 2),
    height: Math.max(0, frame.height - inset * 2),
  };
  const sourceWidth = Math.max(sourceBounds.maxX - sourceBounds.minX, Number.EPSILON);
  const sourceHeight = Math.max(sourceBounds.maxY - sourceBounds.minY, Number.EPSILON);
  const scale = Math.min(inner.width / sourceWidth, inner.height / sourceHeight);
  const offsetX = inner.x + (inner.width - sourceWidth * scale) / 2 - sourceBounds.minX * scale;
  // Keep the provisional figure bottom-aligned inside its accepted frame.
  const offsetY = inner.y - sourceBounds.minY * scale;
  const transformed = shapes.map((shape) => ({
    ...shape,
    polygon: shape.polygon.map(([x, y]) => [
      x * scale + offsetX,
      y * scale + offsetY,
    ]),
  }));
  return {
    shapes: transformed,
    sourceBounds,
    bounds: shapesBounds(transformed),
    scale,
  };
}

function fillPolygon(builder, shape, random, palette) {
  const bounds = polygonBounds(shape.polygon);
  if (!bounds) return;
  const spacing = Math.max(2, shape.brush + 1);
  const baseColor = paletteIndex(shape.fill, palette);
  builder.brush(shape.brush).color(baseColor);
  for (let y = integer(bounds.minY); y <= bounds.maxY; y += spacing) {
    const intersections = scanlineIntersections(shape.polygon, y);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      let left = integer(intersections[index]);
      let right = integer(intersections[index + 1]);
      if (right < left) [left, right] = [right, left];
      if (right <= left) continue;
      // Keep generated endpoints inside the canvas and on the scanline.
      builder.move(left, y);
      if (right - left > 2 && random.nextFloat() < 0.35) {
        builder.chainTo(right, y);
      } else {
        builder.draw(right, y);
      }
    }
  }

  // Sparse dry-brush texture. It uses the same one-pixel chain language as
  // observed AA paint phases but is intentionally a replaceable approximation.
  const textureColor = paletteIndex(baseColor + (random.nextFloat() < 0.5 ? 1 : -1), palette);
  builder.brush(Math.max(1, shape.brush - 2)).color(textureColor);
  for (let index = 0; index < 4; index += 1) {
    const y = integer(random.between(bounds.minY, bounds.maxY));
    const x = integer(random.between(bounds.minX, bounds.maxX));
    if (!pointInPolygon([x, y], shape.polygon)) continue;
    const length = integer(random.between(8, Math.max(9, (bounds.maxX - bounds.minX) / 3)));
    const endX = clamp(x + length, 0, builder.width);
    builder.move(x, y).chainTo(endX, y);
  }
}

function makeBackground(random, width, height, palette) {
  const shapes = [];
  const colorBase = random.integer(0, palette.length - 1);
  const bandCount = 5 + random.integer(0, 2);
  for (let index = 0; index < bandCount; index += 1) {
    const y = (index / bandCount) * height;
    const nextY = ((index + 1) / bandCount) * height;
    const slant = random.between(-width * 0.2, width * 0.2);
    shapes.push(makeShape('background-band', [
      [0, y],
      [width, y + slant],
      [width, nextY + slant],
      [0, nextY],
    ], colorBase + index * 3, { brush: 5, zPath: true }));
  }
  return shapes;
}

function makeFigure(random, width, height, index, total, palette, placement = null) {
  const scale = random.between(0.72, 1.08);
  const centerX = placement?.frame
    ? placement.frame.x + placement.frame.width / 2
    : ((index + 1) / (total + 1)) * width + random.between(-width * 0.08, width * 0.08);
  const floor = height * random.between(0.06, 0.14);
  const torsoWidth = width * 0.10 * scale;
  const torsoHeight = height * 0.26 * scale;
  const headRadius = width * 0.055 * scale;
  const shoulderY = floor + torsoHeight * 1.4;
  const neckY = shoulderY + torsoHeight * 0.70;
  const headY = neckY + headRadius * 1.25;
  const skin = random.integer(0, palette.length - 1);
  const cloth = random.integer(0, palette.length - 1);
  const hair = random.integer(0, palette.length - 1);
  const shapes = [];

  shapes.push(makeShape('torso', [
    [centerX - torsoWidth, shoulderY],
    [centerX - torsoWidth * 0.82, neckY],
    [centerX + torsoWidth * 0.78, neckY],
    [centerX + torsoWidth, shoulderY],
    [centerX + torsoWidth * 0.62, floor + torsoHeight * 0.08],
    [centerX - torsoWidth * 0.62, floor + torsoHeight * 0.08],
  ], cloth, { brush: 5 }));

  const head = ellipsePoints(centerX, headY, headRadius, headRadius * 1.15, 18,
    random.between(-0.15, 0.15));
  shapes.push(makeShape('head', head, skin, { brush: 3 }));
  shapes.push(makeShape('hair', [
    ...ellipsePoints(centerX, headY + headRadius * 0.16, headRadius * 1.02,
      headRadius * 0.62, 12, random.between(-0.15, 0.15)),
  ], hair, { brush: 3 }));

  const armWidth = torsoWidth * 0.32;
  const armLength = torsoHeight * 0.95;
  const leftArm = [
    [centerX - torsoWidth * 0.84, shoulderY],
    [centerX - torsoWidth * 0.84 - armWidth, shoulderY - armLength * 0.48],
    [centerX - torsoWidth * 0.64 - armWidth, floor + torsoHeight * 0.04],
    [centerX - torsoWidth * 0.42, floor + torsoHeight * 0.10],
    [centerX - torsoWidth * 0.46, shoulderY - armLength * 0.38],
  ];
  const rightArm = leftArm.map(([x, y]) => [centerX * 2 - x, y]);
  shapes.push(makeShape('left-arm', leftArm, skin, { brush: 3 }));
  shapes.push(makeShape('right-arm', rightArm, skin, { brush: 3 }));

  const legWidth = torsoWidth * 0.44;
  const legHeight = Math.min(torsoHeight * 0.95, floor * 0.92);
  const leftLeg = [
    [centerX - torsoWidth * 0.54, floor + torsoHeight * 0.10],
    [centerX - legWidth, floor - legHeight],
    [centerX - legWidth * 0.1, floor - legHeight],
    [centerX - torsoWidth * 0.02, floor + torsoHeight * 0.1],
  ];
  const rightLeg = leftLeg.map(([x, y]) => [centerX * 2 - x, y]);
  shapes.push(makeShape('left-leg', leftLeg, cloth, { brush: 5 }));
  shapes.push(makeShape('right-leg', rightLeg, cloth, { brush: 5 }));

  if (!placement?.frame) {
    return { kind: 'figure', index, centerX, floor, headY, placement: null, shapes };
  }
  const fitted = fitShapesToFrame(shapes, placement.frame);
  return {
    kind: 'figure',
    index,
    centerX,
    floor,
    headY,
    placement: {
      frame: { ...placement.frame },
      sourceBounds: fitted.sourceBounds,
      bounds: fitted.bounds,
      scale: fitted.scale,
    },
    shapes: fitted.shapes,
  };
}

function makePlant(random, width, height, palette) {
  const centerX = random.between(width * 0.08, width * 0.92);
  const floor = height * random.between(0.08, 0.16);
  const potWidth = width * random.between(0.06, 0.11);
  const potHeight = height * random.between(0.08, 0.13);
  const pot = roundedRect(centerX - potWidth / 2, floor, potWidth, potHeight, potWidth * 0.14, 5);
  const shapes = [makeShape('pot', pot, random.integer(0, palette.length - 1), { brush: 5 })];
  const stem = height * random.between(0.16, 0.28);
  const stemTop = floor + potHeight + stem;
  shapes.push(makeShape('stem', [
    [centerX - potWidth * 0.06, floor + potHeight],
    [centerX + random.between(-potWidth, potWidth), floor + potHeight + stem * 0.45],
    [centerX + random.between(-potWidth, potWidth), stemTop],
    [centerX + potWidth * 0.06, floor + potHeight],
  ], random.integer(0, palette.length - 1), { brush: 3, zPath: true }));
  const leaves = 4 + random.integer(0, 4);
  for (let index = 0; index < leaves; index += 1) {
    const leafY = floor + potHeight + stem * (0.25 + (index / leaves) * 0.7);
    const leafX = centerX + random.between(-potWidth * 2.2, potWidth * 2.2);
    const leaf = ellipsePoints(leafX, leafY, potWidth * 1.8, potWidth * 0.55, 10,
      random.between(-0.8, 0.8));
    shapes.push(makeShape('leaf', leaf, random.integer(0, palette.length - 1), { brush: 3, zPath: true }));
  }
  return { kind: 'plant', centerX, shapes };
}

function makeTable(random, width, height, palette) {
  const x = width * random.between(0.08, 0.18);
  const y = height * random.between(0.26, 0.38);
  const tableWidth = width * random.between(0.48, 0.78);
  const tableHeight = height * random.between(0.04, 0.08);
  const top = roundedRect(x, y, tableWidth, tableHeight, tableHeight * 0.2, 5);
  const legWidth = tableWidth * 0.05;
  const legHeight = height * random.between(0.14, 0.22);
  const shapes = [makeShape('table-top', top, random.integer(0, palette.length - 1), { brush: 5 })];
  for (const legX of [x + tableWidth * 0.12, x + tableWidth * 0.84]) {
    shapes.push(makeShape('table-leg', [
      [legX, y], [legX + legWidth, y],
      [legX + legWidth * 0.82, y - legHeight], [legX - legWidth * 0.1, y - legHeight],
    ], random.integer(0, palette.length - 1), { brush: 5 }));
  }
  return { kind: 'table', shapes };
}

/**
 * Generate a deterministic AA scene using the recovered interchange format.
 *
 * This is the first clean-room composition layer, deliberately separated from
 * the oracle-calibrated rules. It provides a useful JS engine today while the
 * exact Harold Cohen planning/pose tables are recovered incrementally.
 */
export class AaronGenerator {
  constructor(options = {}) {
    this.seed = options.seed ?? 0xaa70;
    this.random = options.random ?? new AaronRandom(this.seed);
    this.premium = Boolean(options.premium);
    this.smallImage = Boolean(options.smallImage || this.premium);
    this.outlineMode = options.outlineMode ?? 'polygon';
    if (!['polygon', 'free-path-subset'].includes(this.outlineMode)) {
      throw new RangeError(`unknown outline mode ${JSON.stringify(this.outlineMode)}`);
    }
    this.outlineSeed = options.outlineSeed;
    if (this.outlineMode === 'free-path-subset') {
      if (!Number.isInteger(this.outlineSeed)
        || this.outlineSeed < -0x80000000 || this.outlineSeed >= 0x100000000) {
        throw new RangeError('outlineSeed must be a signed or unsigned 32-bit integer in free-path-subset mode');
      }
      // Keep experimental outline sampling separate from scene randomness so
      // enabling it does not silently change composition or palette draws.
      this.outlineRandom = new Allegro501Random(this.outlineSeed);
    } else {
      this.outlineRandom = null;
    }
    const mode = this.premium ? PREMIUM_MODE : (this.smallImage ? SMALL_MODE : LARGE_MODE);
    // The original compact branch keeps two retained screen-size variables.
    // Its saved AA header stores half the requested width, while preserving
    // the requested height.  Keep those knobs explicit so callers can use the
    // recovered full-HD path without confusing an output width with the
    // internal screen-width setting.
    const requestedScreenWidth = options.smallImageScreenWidth;
    const requestedScreenHeight = options.smallImageScreenHeight;
    if (requestedScreenWidth !== undefined &&
        (!Number.isFinite(requestedScreenWidth) || requestedScreenWidth <= 0)) {
      throw new RangeError('smallImageScreenWidth must be a positive number');
    }
    if (requestedScreenHeight !== undefined &&
        (!Number.isFinite(requestedScreenHeight) || requestedScreenHeight <= 0)) {
      throw new RangeError('smallImageScreenHeight must be a positive number');
    }
    this.requestedScreenWidth = requestedScreenWidth;
    this.requestedScreenHeight = requestedScreenHeight;
    this.height = options.height ?? requestedScreenHeight ?? mode.height;
    this.profile = options.profile ?? null;
    const profiles = this.smallImage ? SMALL_CANVAS_PROFILES : LARGE_CANVAS_PROFILES;
    const profileRatio = this.profile ? profiles[this.profile]
      : undefined;
    if (this.profile && profileRatio === undefined) {
      throw new RangeError(`unknown AARON canvas profile ${JSON.stringify(this.profile)}`);
    }
    const compactWidth = requestedScreenWidth === undefined
      ? undefined
      : Math.round(requestedScreenWidth / 2);
    this.width = options.width ?? compactWidth ?? (profileRatio === undefined
      ? mode.width
      : Math.round(this.height * profileRatio));
    this.figureCount = options.figureCount;
    this.palette = options.palette ?? createAaronPalette({
      size: options.paletteSize ?? mode.paletteSize,
      random: this.random,
    });
  }

  generate(options = {}) {
    const builder = createAaBuilder({ width: this.width, height: this.height, palette: this.palette });
    const random = this.random;
    const scenes = [];
    const background = makeBackground(random, this.width, this.height, this.palette);
    scenes.push({ kind: 'background', shapes: background });

    const figureCount = options.figureCount ?? this.figureCount
      ?? random.integer(this.smallImage ? 1 : 1, this.smallImage ? 2 : 3);
    const planner = options.planning === false ? null : createAaronPlanner({
      width: this.width,
      height: this.height,
      random: random.clone(),
      cellSize: options.cellSize ?? 16,
      roughness: options.roughness ?? 0,
    });
    const plannedFigures = planner?.planFigureFrames({
      count: figureCount,
      width: this.width * 0.18,
      height: this.height * 0.52,
    }) ?? [];
    const figurePlans = planner
      ? plannedFigures
      : Array.from({ length: figureCount }, (_, index) => ({ index, frame: null }));
    const figures = [];
    for (const plan of figurePlans) {
      const figure = makeFigure(
        random,
        this.width,
        this.height,
        plan.index,
        figureCount,
        this.palette,
        plan.frame ? plan : null,
      );
      figures.push(figure);
      scenes.push(figure);
    }
    if (options.includeTable ?? !this.smallImage) {
      scenes.push(makeTable(random, this.width, this.height, this.palette));
    }
    if (options.includePlant ?? true) scenes.push(makePlant(random, this.width, this.height, this.palette));

    let outlineInputEdges = 0;
    let outlineEmittedPoints = 0;
    for (const scene of scenes) {
      for (const shape of scene.shapes) {
        if (!shape.outline) continue;
        const metrics = addClosedOutline(builder, shape.polygon, shape.zPath, {
          mode: this.outlineMode,
          random: this.outlineRandom,
        });
        outlineInputEdges += metrics.inputEdges;
        outlineEmittedPoints += metrics.emittedPoints;
      }
    }

    builder.usePaint();
    for (const scene of scenes) {
      for (const shape of scene.shapes) fillPolygon(builder, shape, random, this.palette);
    }

    return {
      document: builder.document(),
      scene: {
        width: this.width,
        height: this.height,
        seed: this.seed,
        premium: this.premium,
        smallImage: this.smallImage,
        requestedScreenWidth: this.requestedScreenWidth,
        requestedScreenHeight: this.requestedScreenHeight,
        profile: this.profile,
        outlineMode: this.outlineMode,
        outlineSeed: this.outlineSeed ?? null,
        outlineSampling: {
          inputEdges: outlineInputEdges,
          emittedPoints: outlineEmittedPoints,
        },
        figures: figures.length,
        composition: {
          status: planner ? 'provisional-planned' : 'unplanned',
          requestedFigures: figureCount,
          acceptedFigures: figures.length,
          rejectedFigureIndices: planner
            ? Array.from({ length: figureCount }, (_, index) => index)
              .filter((index) => !plannedFigures.some((figure) => figure.index === index))
            : [],
        },
        figurePlacements: figures.map(({ index, placement }) => ({
          index,
          frame: placement?.frame ?? null,
          sourceBounds: placement?.sourceBounds ?? null,
          bounds: placement?.bounds ?? null,
          scale: placement?.scale ?? null,
        })),
        planner: planner?.snapshot() ?? null,
        objects: scenes.map(({ kind, shapes }) => ({ kind, shapeCount: shapes.length })),
      },
    };
  }
}

export function generateAaron(options) {
  return new AaronGenerator(options).generate();
}

export const aaronModes = Object.freeze({ large: LARGE_MODE, small: SMALL_MODE, premium: PREMIUM_MODE });
export const aaronCanvasProfiles = Object.freeze({
  large: LARGE_CANVAS_PROFILES,
  small: SMALL_CANVAS_PROFILES,
});
