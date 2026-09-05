import { createAaBuilder } from './aa-builder.js';
import { AaronRandom } from './random.js';
import { createAaronPalette } from './palette.js';
import { createAaronPlanner } from './planner.js';
import {
  ellipsePoints,
  pointInPolygon,
  polygonBounds,
  roundedRect,
  scanlineIntersections,
} from './geometry.js';

const LARGE_MODE = Object.freeze({ width: 1024, height: 768, paletteSize: 148 });
const SMALL_MODE = Object.freeze({ width: 640, height: 480, paletteSize: 184 });
const LARGE_CANVAS_PROFILES = Object.freeze({
  portrait: 487 / 768,
  tall: 650 / 768,
  square: 1,
  wide: 1024 / 768,
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

function addClosedOutline(builder, polygon, zPath = false) {
  if (polygon.length < 2) return;
  builder.move(polygon[0][0], polygon[0][1], { z: zPath });
  for (let index = 1; index < polygon.length; index += 1) {
    builder.draw(polygon[index][0], polygon[index][1], { z: zPath });
  }
  builder.draw(polygon[0][0], polygon[0][1], { z: zPath });
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
  const plannedBounds = placement ? polygonBounds(placement.polygon) : null;
  const centerX = plannedBounds
    ? (plannedBounds.minX + plannedBounds.maxX) / 2
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

  return { kind: 'figure', centerX, floor, headY, shapes };
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
    this.smallImage = Boolean(options.smallImage);
    const mode = this.smallImage ? SMALL_MODE : LARGE_MODE;
    this.height = options.height ?? mode.height;
    this.profile = options.profile ?? null;
    const profileRatio = !this.smallImage && this.profile
      ? LARGE_CANVAS_PROFILES[this.profile]
      : undefined;
    if (this.profile && profileRatio === undefined) {
      throw new RangeError(`unknown AARON canvas profile ${JSON.stringify(this.profile)}`);
    }
    this.width = options.width ?? (profileRatio === undefined
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
    const plannedFigures = planner?.planFigures({
      count: figureCount,
      width: this.width * 0.18,
      height: this.height * 0.52,
    }) ?? [];
    const figures = [];
    for (let index = 0; index < figureCount; index += 1) {
      const figure = makeFigure(
        random,
        this.width,
        this.height,
        index,
        figureCount,
        this.palette,
        plannedFigures[index],
      );
      figures.push(figure);
      scenes.push(figure);
    }
    if (options.includeTable ?? !this.smallImage) {
      scenes.push(makeTable(random, this.width, this.height, this.palette));
    }
    if (options.includePlant ?? true) scenes.push(makePlant(random, this.width, this.height, this.palette));

    for (const scene of scenes) {
      for (const shape of scene.shapes) {
        if (shape.outline) addClosedOutline(builder, shape.polygon, shape.zPath);
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
        smallImage: this.smallImage,
        profile: this.profile,
        figures: figures.length,
        planner: planner?.snapshot() ?? null,
        objects: scenes.map(({ kind, shapes }) => ({ kind, shapeCount: shapes.length })),
      },
    };
  }
}

export function generateAaron(options) {
  return new AaronGenerator(options).generate();
}

export const aaronModes = Object.freeze({ large: LARGE_MODE, small: SMALL_MODE });
export const aaronCanvasProfiles = LARGE_CANVAS_PROFILES;
