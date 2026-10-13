#!/usr/bin/env node

// Candidate selector only. Compare two local hypotheses for a horizontal
// length-10 edge: cumulative ideal steps vs. distance of each emitted jittered
// point from the source. Original-runtime captures must decide between them.
import process from 'node:process';
import { Allegro501Random } from '../../engine/src/allegro-random.js';

const singleRange = { aPrecision: 'single', bPrecision: 'single' };

function inspectSeed(seed, distance) {
  const random = new Allegro501Random(seed);
  const selected = random.integer(8, 14);
  let spineX = 0;
  let spineY = 0;
  let progressed = 0;
  let stepCrossing = null;
  let pointCrossing = null;
  let stepProgress = null;
  let pointProgress = null;
  const iterations = [];
  for (let index = 0; index < selected; index += 1) {
    const scale = random.ranFloat(0.7, 1.3, singleRange);
    const wiggle = random.ranFloat(0.015, 0.03, singleRange);
    const angle = random.ranFloat(0, 6.28, singleRange);
    const step = Math.fround(Math.fround(distance / selected) * scale);
    const previousSpine = [spineX, spineY];
    spineX = Math.fround(spineX + Math.fround(step * Math.fround(Math.cos(0))));
    spineY = Math.fround(spineY + Math.fround(step * Math.fround(Math.sin(0))));
    const offsetLength = Math.fround(step * wiggle);
    const pointX = Math.fround(spineX + Math.fround(offsetLength * Math.fround(Math.cos(angle))));
    const pointY = Math.fround(spineY + Math.fround(offsetLength * Math.fround(Math.sin(angle))));
    const pointDistance = Math.fround(Math.sqrt(pointX * pointX + pointY * pointY));
    progressed = Math.fround(progressed + step);
    if (stepCrossing === null && progressed >= distance) {
      stepCrossing = index + 1;
      stepProgress = progressed;
    }
    if (pointCrossing === null && pointDistance >= distance) {
      pointCrossing = index + 1;
      pointProgress = pointDistance;
    }
    iterations.push({
      scale, wiggle, angle, step, progressed, pointX, pointY, pointDistance,
      spineBefore: previousSpine,
    });
  }
  return {
    seed, distance, selected,
    stepCrossing, stepProgress,
    pointCrossing, pointProgress,
    iterations,
  };
}

function rankByBoundary(candidate) {
  const stepMargin = candidate.stepProgress === null
    ? Infinity : Math.abs(candidate.stepProgress - candidate.distance);
  const pointMargin = candidate.pointProgress === null
    ? Infinity : Math.abs(candidate.pointProgress - candidate.distance);
  return stepMargin + pointMargin;
}

function main() {
  const maxSeed = Number(process.argv[2] ?? 1000000);
  const distance = Number(process.argv[3] ?? 10);
  if (!Number.isSafeInteger(maxSeed) || maxSeed < 1 ||
      !Number.isFinite(distance) || distance <= 0) {
    throw new Error('Usage: node find-free-path-emitted-point-boundary-seeds.mjs [maxSeed>=1] [distance>0]');
  }
  const candidateGroups = {
    emittedPointBeforeStepSum: [],
    stepSumBeforeEmittedPoint: [],
    bothModelsStopEarlyDifferently: [],
  };
  for (let seed = 1; seed <= maxSeed; seed += 1) {
    const candidate = inspectSeed(seed, distance);
    const stepStop = candidate.stepCrossing ?? candidate.selected;
    const pointStop = candidate.pointCrossing ?? candidate.selected;
    if (stepStop === pointStop) continue;
    const key = pointStop < stepStop
      ? 'emittedPointBeforeStepSum' : 'stepSumBeforeEmittedPoint';
    candidateGroups[key].push({
      ...candidate,
      predictedStepsIfUsingStepSum: stepStop,
      predictedStepsIfUsingEmittedPointDistance: pointStop,
      rankingScore: rankByBoundary(candidate),
    });
    candidateGroups[key].sort((a, b) => a.rankingScore - b.rankingScore);
    if (candidateGroups[key].length > 8) candidateGroups[key].pop();

    if (candidate.stepCrossing !== null && candidate.pointCrossing !== null &&
        candidate.stepCrossing < candidate.selected &&
        candidate.pointCrossing < candidate.selected &&
        candidate.stepCrossing !== candidate.pointCrossing) {
      candidateGroups.bothModelsStopEarlyDifferently.push({
        ...candidate,
        predictedStepsIfUsingStepSum: candidate.stepCrossing,
        predictedStepsIfUsingEmittedPointDistance: candidate.pointCrossing,
        rankingScore: rankByBoundary(candidate),
      });
      candidateGroups.bothModelsStopEarlyDifferently.sort((a, b) =>
        Math.abs(a.predictedStepsIfUsingStepSum - a.predictedStepsIfUsingEmittedPointDistance) -
          Math.abs(b.predictedStepsIfUsingStepSum - b.predictedStepsIfUsingEmittedPointDistance) ||
        a.rankingScore - b.rankingScore);
      if (candidateGroups.bothModelsStopEarlyDifferently.length > 8) {
        candidateGroups.bothModelsStopEarlyDifferently.pop();
      }
    }
  }
  console.log(JSON.stringify({
    method: 'Allegro501Random candidate scan with single-float point construction; not original-runtime evidence',
    maxSeed,
    distance,
    candidateGroups: Object.fromEntries(Object.entries(candidateGroups).map(([name, candidates]) =>
      [name, candidates.map((candidate) => ({
        seed: candidate.seed,
        selected: candidate.selected,
        stepCrossing: candidate.stepCrossing,
        stepProgress: candidate.stepProgress,
        pointCrossing: candidate.pointCrossing,
        pointProgress: candidate.pointProgress,
        pointAtStepCrossing: candidate.stepCrossing === null ? null :
          candidate.iterations[candidate.stepCrossing - 1],
        pointAtPointCrossing: candidate.pointCrossing === null ? null :
          candidate.iterations[candidate.pointCrossing - 1],
        predictedStepsIfUsingStepSum: candidate.predictedStepsIfUsingStepSum,
        predictedStepsIfUsingEmittedPointDistance: candidate.predictedStepsIfUsingEmittedPointDistance,
        rankingScore: candidate.rankingScore,
      }))])),
    confirmationRequired: true,
  }, null, 2));
}

main();
