/**
 * Independent SUBFORM post-fill rule. Its retained original-runtime evidence
 * supplies a rectangular frame, both maps, a target patch ID and a form count.
 * Scene planning and creation of those inputs remain separate dependencies.
 * The 278 original comparisons exercise fill values 0/1 and FLAG-BIT 32768.
 * The value-2 conversion is inferred from native instructions and still needs
 * an original-runtime holdout. Input validation is a JavaScript adapter policy.
 */
import { aaronMapIndex } from './aaron-maps.js';

function integer(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

/**
 * Mutate the maps within an inclusive integer frame. Positive fill
 * cells belonging to the target patch are counted and flagged. Other positive
 * fill cells are cleared. Accepted fill value 2 becomes 1.
 */
export function postFillAaronSubform({ maps, frame, patchId, flagBit, cformCount }) {
  if (!maps || !frame || !(maps.fillMap instanceof Uint8Array)
      || !(maps.patchMap instanceof Uint16Array)) {
    throw new TypeError('maps and frame must contain Aaron map storage and frame bounds');
  }
  const { width, height, fillMap, patchMap } = maps;
  integer(width, 'width', 1, Number.MAX_SAFE_INTEGER);
  integer(height, 'height', 1, Number.MAX_SAFE_INTEGER);
  const size = width * height;
  if (!Number.isSafeInteger(size) || fillMap.length !== size || patchMap.length !== size) {
    throw new RangeError('map storage must match its dimensions');
  }
  const lx = integer(frame.lx, 'lx', 0, width - 1);
  const rx = integer(frame.rx, 'rx', 0, width - 1);
  const ly = integer(frame.ly, 'ly', 0, height - 1);
  const ty = integer(frame.ty, 'ty', 0, height - 1);
  integer(patchId, 'patchId', 0, 65535);
  integer(flagBit, 'flagBit', 0, 65535 - patchId);
  const area = Math.max(0, rx - lx + 1) * Math.max(0, ty - ly + 1);
  integer(cformCount, 'cformCount', Number.MIN_SAFE_INTEGER + area, Number.MAX_SAFE_INTEGER);

  // Validate the four-bit fill representation before changing either map.
  for (let x = lx; x <= rx; x += 1) {
    for (let y = ly; y <= ty; y += 1) {
      if (fillMap[aaronMapIndex(width, height, x, y)] > 15) {
        throw new RangeError('fill-map values must fit four bits');
      }
    }
  }
  let subpartCount = 0;
  const flaggedPatch = patchId + flagBit;
  for (let y = ly; y <= ty; y += 1) {
    for (let x = lx; x <= rx; x += 1) {
      const index = aaronMapIndex(width, height, x, y);
      if (fillMap[index] === 0) continue;
      if (patchMap[index] !== patchId) {
        fillMap[index] = 0;
        continue;
      }
      patchMap[index] = flaggedPatch;
      if (fillMap[index] === 2) fillMap[index] = 1;
      subpartCount += 1;
    }
  }
  return { subpartCount, cformCount: cformCount - subpartCount };
}
