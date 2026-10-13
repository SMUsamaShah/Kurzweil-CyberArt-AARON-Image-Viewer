#!/usr/bin/env node

// Candidate finder only: search the locally implemented Allegro RNG stream for
// FREE-PATH scale sums close to the selected-step threshold. Confirm every
// candidate with a fresh original-runtime capture before drawing conclusions.
import process from 'node:process';
import { Allegro501Random } from '../../engine/src/allegro-random.js';

function inspectSeed(seed, distance) {
  const random = new Allegro501Random(seed);
  const selected = random.integer(8, 14);
  let progressed = 0;
  let crossing = null;
  const iterations = [];
  for (let index = 0; index < selected; index += 1) {
    const scale = random.ranFloat(0.7, 1.3, {
      aPrecision: 'single',
      bPrecision: 'single',
    });
    const wiggle = random.ranFloat(0.015, 0.03, {
      aPrecision: 'single',
      bPrecision: 'single',
    });
    const angle = random.ranFloat(0, 6.28, {
      aPrecision: 'single',
      bPrecision: 'single',
    });
    const step = Math.fround(Math.fround(distance / selected) * scale);
    const previous = progressed;
    progressed = Math.fround(progressed + step);
    iterations.push({ scale, wiggle, angle, previous, progressed });
    if (distance > 0 && progressed >= distance) {
      crossing = index + 1;
      break;
    }
  }

  const absoluteMargin = progressed - distance;
  return {
    seed,
    distance,
    selected,
    iterations,
    crossing,
    progressed,
    absoluteMargin,
    relativeMargin: absoluteMargin / distance,
  };
}

function main() {
  const maxSeed = Number(process.argv[2] ?? 100000);
  const distance = Number(process.argv[3] ?? 10);
  if (!Number.isSafeInteger(maxSeed) || maxSeed < 1 ||
      !Number.isFinite(distance) || distance <= 0) {
    throw new Error('Usage: node find-free-path-stop-boundary-seeds.mjs [maxSeed>=1] [distance>0]');
  }

  let closestBelow = null;
  let closestEarlyAbove = null;
  let closestFinalCrossing = null;
  for (let seed = 1; seed <= maxSeed; seed += 1) {
    const candidate = inspectSeed(seed, distance);
    if (candidate.crossing === null) {
      if (!closestBelow || candidate.absoluteMargin > closestBelow.absoluteMargin) {
        closestBelow = candidate;
      }
    } else if (candidate.crossing < candidate.selected) {
      if (!closestEarlyAbove || candidate.absoluteMargin < closestEarlyAbove.absoluteMargin) {
        closestEarlyAbove = candidate;
      }
    } else if (!closestFinalCrossing ||
        candidate.absoluteMargin < closestFinalCrossing.absoluteMargin) {
      closestFinalCrossing = candidate;
    }
  }

  console.log(JSON.stringify({
    method: 'Allegro501Random candidate scan; not original-runtime evidence',
    maxSeed,
    distance,
    closestBelow,
    closestEarlyAbove,
    closestFinalCrossing,
    confirmationRequired: true,
  }, null, 2));
}

main();
