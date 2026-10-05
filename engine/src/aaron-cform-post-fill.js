/** CFORM POST-FILL map rule. Natural frame/patch inputs remain dependencies. */
import { writeAaronListToFillMap } from './aaron-boundary-map.js';
import { setAaronMedianRows, chooseAaronFillStart, applyAaronFillStrategy } from './aaron-fill-preparation.js';

export function postFillAaronCform({ maps, frame, patchId, background }) {
  if (!maps || !frame || !(maps.fillMap instanceof Uint8Array) || !(maps.patchMap instanceof Uint16Array))
    throw new TypeError('maps and frame must provide AARON storage and bounds');
  const { width, height, fillMap, patchMap } = maps;
  const integer = (value, name, lo, hi) => {
    if (!Number.isSafeInteger(value) || value < lo || value > hi) throw new RangeError(`${name} must be an integer from ${lo} through ${hi}`);
    return value;
  };
  integer(width, 'width', 1, Number.MAX_SAFE_INTEGER); integer(height, 'height', 1, Number.MAX_SAFE_INTEGER);
  const size = width * height;
  if (!Number.isSafeInteger(size) || fillMap.length !== size || patchMap.length !== size) throw new RangeError('Map storage does not match its dimensions');
  const lx = integer(frame.lx, 'lx', 0, width), rx = integer(frame.rx, 'rx', 0, width);
  const ly = integer(frame.ly, 'ly', 0, height), ty = integer(frame.ty, 'ty', 0, height);
  integer(patchId, 'patchId', 0, 65535); integer(background, 'background', 0, 65535);
  // Validate before mutation; checks and empty/inverted behavior are adapter
  // policy until those original domains are exercised.
  for (let y = ly; y < ty; y++) for (let x = lx; x < rx; x++)
    if (fillMap[x * height + y] > 15) throw new RangeError('Fill values must fit four bits');
  let count = 0;
  for (let y = ly; y < ty; y++) for (let x = lx; x < rx; x++) {
    const index = x * height + y;
    if (fillMap[index] === 0) continue;
    if (patchMap[index] === background) { patchMap[index] = patchId; count++; }
    fillMap[index] = 0;
  }
  return count;
}

/** Compose the measured CFORM list/median/start/strategy/post-fill boundary. */
export function fillAaronCformFromOutline({ maps, frame, points, patchId, background, boundaryValue = 2 }) {
  writeAaronListToFillMap({ maps, points, value: boundaryValue });
  const median = setAaronMedianRows(frame), start = chooseAaronFillStart(points);
  const strategyReturn = applyAaronFillStrategy({ maps, outline: start.outline, loMedian: median.loMedian, hiMedian: median.hiMedian });
  const count = postFillAaronCform({ maps, frame, patchId, background });
  return { count, median, outline: start.outline, rotationIndex: start.rotationIndex, strategyReturn };
}
