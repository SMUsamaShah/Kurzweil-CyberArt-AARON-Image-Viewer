/**
 * Independent bounded ZERO-EDGE model.
 *
 * The model matches the 160 captured matrix inputs and 39 holdout inputs,
 * including tiny/rectangular maps and larger PERIM values. The comparison
 * covers their recorded returns, mutations and identities; it does not
 * establish ZERO-EDGE's general behavior or intermediate helper calls.
 * Input limits below are adapter bounds for these fixtures, not a recovered
 * original-runtime interface or error contract.
 *
 * `traceAaronZeroEdge` returns null or a newest-first path array. A successful
 * path ends with the exact supplied `start` object. Accepted candidate points
 * are fresh objects. The function mutates only `start.z`; it reads but never
 * writes `maps.fillMap`. It has no RNG or dependency hooks.
 */

const X_INCREMENTS = Object.freeze([1, 1, 0, -1, -1, -1, 0, 1]);
const Y_INCREMENTS = Object.freeze([0, 1, 1, 1, 0, -1, -1, -1]);
const MAX_MAP_CELLS = 128;
const MAX_PERIM = 20;
const MAX_PATH_POINTS = 64;

function safeInteger(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function readStartSlots(start) {
  if (!start || typeof start !== 'object') {
    throw new TypeError('start must be a mutable point object');
  }

  // Require own data slots so traversal cannot invoke accessors as callbacks,
  // and require writable Z because accepted steps mutate that original slot.
  const xSlot = Object.getOwnPropertyDescriptor(start, 'x');
  const ySlot = Object.getOwnPropertyDescriptor(start, 'y');
  const zSlot = Object.getOwnPropertyDescriptor(start, 'z');
  if (!xSlot || !ySlot || !zSlot || !Object.hasOwn(xSlot, 'value') ||
      !Object.hasOwn(ySlot, 'value') || !Object.hasOwn(zSlot, 'value') ||
      zSlot.writable !== true) {
    throw new TypeError('start must have own data slots x, y, and writable z');
  }
  return { x: xSlot.value, y: ySlot.value, z: zSlot.value };
}

function validateInput({ maps, start, perim }) {
  if (!maps || typeof maps !== 'object') {
    throw new TypeError('maps.fillMap must be a Uint8Array');
  }
  const fillMap = maps.fillMap;
  if (!(fillMap instanceof Uint8Array)) {
    throw new TypeError('maps.fillMap must be a Uint8Array');
  }

  const width = safeInteger(maps.width, 'maps.width', 1, MAX_MAP_CELLS);
  const height = safeInteger(maps.height, 'maps.height', 1, MAX_MAP_CELLS);
  const cellCount = width * height;
  if (!Number.isSafeInteger(cellCount) || cellCount > MAX_MAP_CELLS ||
      fillMap.length !== cellCount) {
    throw new RangeError(`maps.fillMap must contain exactly width*height cells (at most ${MAX_MAP_CELLS})`);
  }

  const slots = readStartSlots(start);
  safeInteger(slots.x, 'start.x', 0, width - 1);
  safeInteger(slots.y, 'start.y', 0, height - 1);
  safeInteger(slots.z, 'start.z', 0, 7);
  safeInteger(perim, 'perim', 0, MAX_PERIM);

  // Uint8Array stands in for the original UBYTE4 storage. Reject bytes that
  // could not occur in the measured four-bit map.
  for (let index = 0; index < cellCount; index += 1) {
    if (fillMap[index] > 15) {
      throw new RangeError(`maps.fillMap[${index}] must be from 0 through 15`);
    }
  }

  return { width, height, fillMap, start, perim, x: slots.x, y: slots.y, z: slots.z };
}

function directionModulo8(value) {
  return ((value % 8) + 8) % 8;
}

/**
 * Run the bounded model against `{ maps:{width,height,fillMap}, start,
 * perim }`. `fillMap[x * height + y]` represents `(aref map x y)`.
 *
 * Validated outputs are limited to the recorded input cases. Intermediate
 * closure/bounds/budget/map ordering is inferred from native branches and
 * the matching model, with no helper-call trace. Wider inputs remain open.
 */
export function traceAaronZeroEdge(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('input must contain maps, start, and perim');
  }
  const { width, height, fillMap, start, perim, x: originX, y: originY } = validateInput(input);
  let currentX = originX;
  let currentY = originY;
  let acceptedSteps = 0;
  let candidateChecks = 0;
  const reversePath = [start];

  // With this candidate's `acceptedSteps > perim` check, at most perim+1
  // points can be accepted before the next candidate terminates. Each outer
  // pass checks at most eight directions; this guard is fail-closed if the
  // implementation ever departs from that bounded flow.
  const maxCandidateChecks = 8 * (perim + 2);

  while (true) {
    if (acceptedSteps > 2 && currentX === originX && currentY === originY) {
      if (reversePath.length > MAX_PATH_POINTS) {
        throw new RangeError('candidate path exceeded the bounded output capacity');
      }
      return reversePath;
    }

    let accepted = false;
    const baseDirection = directionModulo8(start.z);
    for (let retry = 0; retry < 8; retry += 1) {
      candidateChecks += 1;
      if (candidateChecks > maxCandidateChecks) {
        throw new RangeError('candidate traversal exceeded its bounded direction budget');
      }

      const direction = directionModulo8(baseDirection + retry);
      const candidateX = currentX + X_INCREMENTS[direction];
      const candidateY = currentY + Y_INCREMENTS[direction];

      // The frozen native FOOB-result branch precedes the later PERIM/map
      // path; intermediate calls were not traced. Applying the measured
      // 320x480 rule to supplied scratch dimensions remains an extrapolation.
      if (candidateX < 0 || candidateX >= width ||
          candidateY < 0 || candidateY >= height) {
        return null;
      }
      if (acceptedSteps > perim) return null;

      const mapValue = fillMap[candidateX * height + candidateY];
      if (mapValue !== 0) continue;

      const point = { x: candidateX, y: candidateY, z: direction };
      reversePath.unshift(point);
      if (reversePath.length > MAX_PATH_POINTS) {
        throw new RangeError('candidate path exceeded the bounded output capacity');
      }
      currentX = candidateX;
      currentY = candidateY;
      start.z = directionModulo8(direction - 2);
      acceptedSteps += 1;
      accepted = true;
      break;
    }

    if (!accepted) return null;
  }
}
