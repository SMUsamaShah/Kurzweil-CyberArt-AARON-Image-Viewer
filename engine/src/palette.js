import { AaronRandom } from './random.js';

const DEFAULT_HUES = Object.freeze([
  0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240, 264, 288, 312, 336,
]);

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function hueToRgb(p, q, t) {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

/** Convert HSL components to the normalized RGB triplets used by AA files. */
export function hslToRgb(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = clamp(saturation);
  const l = clamp(lightness);
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToRgb(p, q, h + 1 / 3),
    hueToRgb(p, q, h),
    hueToRgb(p, q, h - 1 / 3),
  ];
}

/**
 * Build a deterministic, three-shade-per-family palette.
 *
 * AARON's observed palettes are arranged in small families of related RGB
 * triplets (usually three entries per family). The exact family table is still
 * being recovered, so this function provides a stable clean-room palette
 * source for generated scenes rather than claiming to reproduce a particular
 * original palette byte-for-byte.
 */
export function createAaronPalette(options = {}) {
  const size = options.size ?? 148;
  if (!Number.isInteger(size) || size <= 0) throw new RangeError('palette size must be positive');
  const random = options.random ?? new AaronRandom(options.seed ?? 0xaa70);
  const hueShift = options.hueShift ?? random.between(-12, 12);
  const saturation = options.saturation ?? 0.72;
  const lightness = options.lightness ?? 0.56;
  const palette = [];
  let family = 0;
  while (palette.length < size) {
    const baseHue = DEFAULT_HUES[family % DEFAULT_HUES.length]
      + hueShift + random.between(-5, 5);
    const baseSaturation = clamp(saturation + random.between(-0.08, 0.08));
    const baseLightness = clamp(lightness + random.between(-0.08, 0.08));
    const variants = [
      [baseSaturation, baseLightness + 0.08],
      [clamp(baseSaturation + 0.04), baseLightness],
      [clamp(baseSaturation - 0.04), baseLightness - 0.08],
    ];
    for (const [variantSaturation, variantLightness] of variants) {
      if (palette.length >= size) break;
      palette.push(hslToRgb(baseHue, variantSaturation, variantLightness));
    }
    family += 1;
  }
  return palette;
}

export function clampPalette(palette) {
  return palette.map((rgb) => rgb.map((channel) => clamp(channel)));
}
