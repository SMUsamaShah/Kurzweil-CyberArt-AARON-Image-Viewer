#!/usr/bin/env node

// Rank fixed-geometry seed candidates using only local Allegro RNG and
// single-float arithmetic. This reads no oracle captures and asserts no rule.
import { Allegro501Random } from '../../engine/src/allegro-random.js';

const SEED_START = 1;
const SEED_END = 200000;
const TARGET_Y = Math.fround(0.2); // Lisp input: 0.2f0
const SELECTED_SPLIT = 'stepSum=sourceToEmittedPoint != stepTimesWiggle';

function float32Ulp(value) {
  const rounded = Math.abs(Math.fround(value));
  if (rounded === 0) return 2 ** -149;
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, rounded, false);
  const bits = view.getUint32(0, false);
  view.setUint32(0, bits + 1, false);
  return view.getFloat32(0, false) - rounded;
}

function replay(seed) {
  const random = new Allegro501Random(seed);
  const distance = Math.fround(Math.sqrt(TARGET_Y * TARGET_Y));
  const heading = Math.fround(Math.atan2(TARGET_Y, 0));
  const selected = random.integer(8, 14);
  let progressed = 0;
  let spineX = 0;
  let spineY = 0;
  const firstCrossings = {
    stepSum: null,
    sourceToEmittedPoint: null,
    stepTimesWiggle: null,
  };

  for (let index = 0; index < selected; index += 1) {
    const scale = random.ranFloat(0.7, 1.3,
      { aPrecision: 'single', bPrecision: 'single' });
    const wiggle = random.ranFloat(0.015, 0.03,
      { aPrecision: 'single', bPrecision: 'single' });
    const angle = random.ranFloat(0, 6.28,
      { aPrecision: 'single', bPrecision: 'single' });
    const step = Math.fround(Math.fround(distance / selected) * scale);
    progressed = Math.fround(progressed + step);
    spineX = Math.fround(spineX + Math.fround(step * Math.fround(Math.cos(heading))));
    spineY = Math.fround(spineY + Math.fround(step * Math.fround(Math.sin(heading))));
    const offsetLength = Math.fround(step * wiggle);
    const pointX = Math.fround(spineX +
      Math.fround(offsetLength * Math.fround(Math.cos(angle))));
    const pointY = Math.fround(spineY +
      Math.fround(offsetLength * Math.fround(Math.sin(angle))));
    const startDx = Math.fround(pointX);
    const startDy = Math.fround(pointY);
    const endDx = Math.fround(-pointX);
    const endDy = Math.fround(TARGET_Y - pointY);
    const fromStart = Math.fround(Math.sqrt(startDx * startDx + startDy * startDy));
    const fromTarget = Math.fround(Math.sqrt(endDx * endDx + endDy * endDy));
    const stepNumber = index + 1;

    const crossing = (margin, comparisonUlp) => ({
      step: stepNumber,
      margin,
      comparisonUlp,
      marginInFloat32Ulps: margin / comparisonUlp,
    });
    if (firstCrossings.stepSum === null && progressed >= distance) {
      firstCrossings.stepSum = crossing(progressed - distance, float32Ulp(distance));
    }
    if (firstCrossings.sourceToEmittedPoint === null && fromStart >= distance) {
      firstCrossings.sourceToEmittedPoint = crossing(fromStart - distance, float32Ulp(distance));
    }
    if (firstCrossings.stepTimesWiggle === null && fromTarget <= offsetLength) {
      firstCrossings.stepTimesWiggle = crossing(offsetLength - fromTarget,
        Math.max(float32Ulp(offsetLength), float32Ulp(fromTarget)));
    }
  }

  const predictions = Object.fromEntries(Object.entries(firstCrossings)
    .map(([name, crossing]) => [name, crossing?.step ?? selected]));
  const uncapped = Object.values(predictions).every((step) => step < selected);
  const split = predictions.stepSum === predictions.sourceToEmittedPoint &&
    predictions.stepTimesWiggle !== predictions.stepSum;
  const marginsInUlps = Object.values(firstCrossings)
    .map((crossing) => crossing?.marginInFloat32Ulps ?? -Infinity);
  return {
    seed,
    points: [[0, 0, 0], [0, TARGET_Y, 1]],
    pointTypes: '((FIXNUM FIXNUM FIXNUM) (FIXNUM SINGLE-FLOAT FIXNUM))',
    distance,
    selectedSteps: selected,
    predictions,
    allThreeUncapped: uncapped,
    targetSplit: split,
    firstCrossingMargins: firstCrossings,
    minimumBoundaryMarginInFloat32Ulps: Math.min(...marginsInUlps),
  };
}

const ranked = [];
let seedsScanned = 0;
for (let seed = SEED_START; seed <= SEED_END; seed += 1) {
  seedsScanned += 1;
  const candidate = replay(seed);
  if (!candidate.allThreeUncapped || !candidate.targetSplit) continue;
  ranked.push(candidate);
}
ranked.sort((left, right) =>
  right.minimumBoundaryMarginInFloat32Ulps - left.minimumBoundaryMarginInFloat32Ulps ||
  left.seed - right.seed);

console.log(JSON.stringify({
  method: 'Local Allegro501Random replay with single-float FREE-PATH candidate arithmetic; no oracle data',
  geometry: {
    lispPoints: '((0 0 0) (0 0.2f0 1))',
    pointTypes: '((FIXNUM FIXNUM FIXNUM) (FIXNUM SINGLE-FLOAT FIXNUM))',
    seedRange: { startInclusive: SEED_START, endInclusive: SEED_END },
  },
  candidateRequirement: 'All three predictions uncapped, with stepSum=sourceToEmittedPoint and stepTimesWiggle different',
  ranking: 'Descending minimum first-crossing margin measured in Float32 ULPs; ascending seed breaks ties',
  marginConvention: 'Distance and source-to-point comparisons divide by ULP(distance); the offset comparison divides by the larger ULP of its two Float32 operands.',
  seedsScanned,
  qualifyingCandidateCount: ranked.length,
  bestCandidate: ranked[0] ?? null,
  nextCandidates: ranked.slice(1, 4),
}, null, 2));
