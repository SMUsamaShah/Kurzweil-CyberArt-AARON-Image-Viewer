#!/usr/bin/env node

// Search local Allegro seed streams for FREE-PATH stop-model discriminators.
// This is a candidate finder, not original-runtime evidence.
import process from 'node:process';
import { Allegro501Random } from '../../engine/src/allegro-random.js';

const DEFAULT_LENGTHS = [2, 5, 10, 20, 40];
const DEFAULT_SEED_START = 1;
const DEFAULT_SEED_END = 200000;
const EXAMPLE_LIMIT = 3;
const SINGLE_FLOAT_RANGE = { aPrecision: 'single', bPrecision: 'single' };

function usage() {
  return [
    'Usage: node research/tools/find-free-path-stop-model-seeds.mjs [options]',
    '',
    'Options:',
    '  --seed-start <integer>  First inclusive Allegro seed (default: 1)',
    '  --seed-end <integer>    Last inclusive Allegro seed (default: 200000)',
    '  --lengths <list>        Comma-separated positive edge lengths (default: 2,5,10,20,40)',
    '  --help                  Show this help',
  ].join('\n');
}

function parseIntegerOption(name, value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe integer`);
  }
  return parsed;
}

function parseLengths(value) {
  const lengths = value.split(',').map((part) => Number(part.trim()));
  if (lengths.length === 0 || lengths.some((length) =>
    !Number.isFinite(length) || length <= 0)) {
    throw new Error('--lengths must be a comma-separated list of positive finite numbers');
  }
  return lengths;
}

function parseOptions(args) {
  const options = {
    seedStart: DEFAULT_SEED_START,
    seedEnd: DEFAULT_SEED_END,
    lengths: [...DEFAULT_LENGTHS],
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--help') {
      options.help = true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${option}`);
    }
    if (option === '--seed-start') {
      options.seedStart = parseIntegerOption(option, value);
    } else if (option === '--seed-end') {
      options.seedEnd = parseIntegerOption(option, value);
    } else if (option === '--lengths') {
      options.lengths = parseLengths(value);
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
    index += 1;
  }
  if (options.seedStart < -0x80000000 || options.seedStart > 0xffffffff ||
      options.seedEnd < -0x80000000 || options.seedEnd > 0xffffffff) {
    throw new Error('Seed bounds must fit the signed or unsigned 32-bit Allegro seed range');
  }
  if (options.seedEnd < options.seedStart) {
    throw new Error('--seed-end must be greater than or equal to --seed-start');
  }
  return options;
}

function replayModels(seed, distance) {
  const random = new Allegro501Random(seed);
  const selected = random.integer(8, 14);
  let progressed = 0;
  let spineX = 0;
  let spineY = 0;
  let stepSumStop = null;
  let emittedPointDistanceStop = null;
  let bareWiggleStop = null;
  let spatialOffsetStop = null;
  let stepSumMargin = null;
  let emittedPointDistanceMargin = null;
  let bareWiggleMargin = null;
  let spatialOffsetMargin = null;
  for (let index = 0; index < selected; index += 1) {
    const scale = random.ranFloat(0.7, 1.3, SINGLE_FLOAT_RANGE);
    const wiggle = random.ranFloat(0.015, 0.03, SINGLE_FLOAT_RANGE);
    const angle = random.ranFloat(0, 6.28, SINGLE_FLOAT_RANGE);
    const step = Math.fround(Math.fround(distance / selected) * scale);
    progressed = Math.fround(progressed + step);
    spineX = Math.fround(spineX + step);
    const offsetLength = Math.fround(step * wiggle);
    const pointX = Math.fround(spineX + Math.fround(
      offsetLength * Math.fround(Math.cos(angle)),
    ));
    const pointY = Math.fround(spineY + Math.fround(
      offsetLength * Math.fround(Math.sin(angle)),
    ));
    const startDx = Math.fround(pointX);
    const startDy = Math.fround(pointY);
    const endDx = Math.fround(distance - pointX);
    const endDy = Math.fround(pointY);
    const fromStart = Math.fround(Math.sqrt(startDx * startDx + startDy * startDy));
    const fromTarget = Math.fround(Math.sqrt(endDx * endDx + endDy * endDy));
    const stepNumber = index + 1;
    if (stepSumStop === null && progressed >= distance) {
      stepSumStop = stepNumber;
      stepSumMargin = progressed - distance;
    }
    if (emittedPointDistanceStop === null && fromStart >= distance) {
      emittedPointDistanceStop = stepNumber;
      emittedPointDistanceMargin = fromStart - distance;
    }
    if (bareWiggleStop === null && fromTarget <= wiggle) {
      bareWiggleStop = stepNumber;
      bareWiggleMargin = wiggle - fromTarget;
    }
    if (spatialOffsetStop === null && fromTarget <= offsetLength) {
      spatialOffsetStop = stepNumber;
      spatialOffsetMargin = offsetLength - fromTarget;
    }
  }
  const predictions = {
    stepSum: stepSumStop ?? selected,
    sourceToEmittedPoint: emittedPointDistanceStop ?? selected,
    bareWiggle: bareWiggleStop ?? selected,
    stepTimesWiggle: spatialOffsetStop ?? selected,
  };
  return {
    selected,
    predictions,
    uncapped: Object.values(predictions).every((steps) => steps < selected),
    allDistinct: new Set(Object.values(predictions)).size === 4,
    boundaryMargins: {
      stepSum: stepSumMargin,
      sourceToEmittedPoint: emittedPointDistanceMargin,
      bareWiggle: bareWiggleMargin,
      stepTimesWiggle: spatialOffsetMargin,
    },
  };
}

function compactExample(seed, distance, replay) {
  return {
    seed,
    edgePoints: [[0, 0, 0], [distance, 0, 1]],
    selectedSteps: replay.selected,
    predictedConsumedSteps: replay.predictions,
    allPredictionsUncapped: replay.uncapped,
    allPredictionsDistinct: replay.allDistinct,
    boundaryMargins: replay.boundaryMargins,
  };
}

function searchLength(distance, seedStart, seedEnd) {
  const counts = {
    seedsScanned: 0,
    uncappedByModel: {
      stepSum: 0,
      sourceToEmittedPoint: 0,
      bareWiggle: 0,
      stepTimesWiggle: 0,
    },
    allFourUncapped: 0,
    allFourDistinctAndUncapped: 0,
    bareDiffersAmongUncapped: {
      stepSum: 0,
      sourceToEmittedPoint: 0,
      stepTimesWiggle: 0,
    },
  };
  const uncappedExamples = [];
  const discriminatingUncappedExamples = [];
  const distinctUncappedExamples = [];
  for (let seed = seedStart; seed <= seedEnd; seed += 1) {
    const replay = replayModels(seed, distance);
    counts.seedsScanned += 1;
    for (const [name, steps] of Object.entries(replay.predictions)) {
      if (steps < replay.selected) counts.uncappedByModel[name] += 1;
    }
    if (!replay.uncapped) continue;
    counts.allFourUncapped += 1;
    if (replay.predictions.bareWiggle !== replay.predictions.stepSum) {
      counts.bareDiffersAmongUncapped.stepSum += 1;
    }
    if (replay.predictions.bareWiggle !== replay.predictions.sourceToEmittedPoint) {
      counts.bareDiffersAmongUncapped.sourceToEmittedPoint += 1;
    }
    if (replay.predictions.bareWiggle !== replay.predictions.stepTimesWiggle) {
      counts.bareDiffersAmongUncapped.stepTimesWiggle += 1;
    }
    const example = compactExample(seed, distance, replay);
    if (uncappedExamples.length < EXAMPLE_LIMIT) uncappedExamples.push(example);
    if (new Set(Object.values(replay.predictions)).size > 1 &&
        discriminatingUncappedExamples.length < EXAMPLE_LIMIT) {
      discriminatingUncappedExamples.push(example);
    }
    if (replay.allDistinct) {
      counts.allFourDistinctAndUncapped += 1;
      if (distinctUncappedExamples.length < EXAMPLE_LIMIT) {
        distinctUncappedExamples.push(example);
      }
    }
  }
  return {
    length: distance,
    counts,
    uncappedExamples,
    discriminatingUncappedExamples,
    distinctUncappedExamples,
  };
}

function main() {
  let options;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }
  console.log(JSON.stringify({
    method: 'Allegro501Random with v5 single-float FREE-PATH replay arithmetic; candidate predictions only',
    seedRange: { startInclusive: options.seedStart, endInclusive: options.seedEnd },
    lengths: options.lengths,
    boundaryMarginConvention: 'Positive margins satisfy the corresponding threshold at its first crossing; null means the model reached the selected-step cap.',
    results: options.lengths.map((distance) =>
      searchLength(distance, options.seedStart, options.seedEnd)),
  }, null, 2));
}

main();
