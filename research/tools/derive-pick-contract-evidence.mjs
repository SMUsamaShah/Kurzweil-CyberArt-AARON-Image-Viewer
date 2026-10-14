#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Allegro501Random } from '../../engine/src/allegro-random.js';
import { verifyLocalAaronTriplet } from './verify-local-aaron-triplet.mjs';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function hashFile(filePath) {
  return sha256(await readFile(filePath));
}

function matchSingle(line, pattern, description) {
  const match = pattern.exec(line);
  requireValue(match, `Malformed ${description}: ${line}`);
  return match;
}

export async function derivePickContractEvidence(outputPath, beforePath, observerPath, afterPath) {
  const triplet = await verifyLocalAaronTriplet(beforePath, observerPath, afterPath);
  const [before, observer, after] = triplet.runs;
  requireValue(before.summary.mode === 'writer-stream-seed-1234' &&
    observer.summary.mode === before.summary.mode && after.summary.mode === before.summary.mode,
  'PICK triplet mode is not writer-stream-seed-1234');
  requireValue(before.summary.installerSha256 === observer.summary.installerSha256 &&
    before.summary.installerSha256 === after.summary.installerSha256 &&
    before.summary.registryPatchSha256 === observer.summary.registryPatchSha256 &&
    before.summary.registryPatchSha256 === after.summary.registryPatchSha256 &&
    before.summary.licensePatchSha256 === observer.summary.licensePatchSha256 &&
    before.summary.licensePatchSha256 === after.summary.licensePatchSha256,
  'PICK triplet runtime/patch identities differ');

  const probePath = path.resolve('research/introspection/pick-contract-v1.cl');
  const probeSourceSha256 = await hashFile(probePath);
  requireValue(probeSourceSha256 === triplet.probeSourceHash,
    'Current PICK probe differs from the source-bound observer capture');
  const probeSourceBytes = await readFile(
    path.join(observer.capturePath, 'aaron-pre-scene-probe.cl'));
  requireValue(sha256(probeSourceBytes) === probeSourceSha256,
    'Staged PICK probe differs from the current source');

  const reportPath = path.join(observer.capturePath, triplet.requiredReport);
  const reportBytes = await readFile(reportPath);
  const report = reportBytes.toString('utf8').replace(/\r\n?/g, '\n').trimEnd();
  const lines = report.split('\n');
  requireValue(lines[0] === 'BEGIN pick-contract-v1' &&
    lines.at(-1) === 'END pick-contract-v1', 'PICK report lacks exact BEGIN/END markers');
  requireValue(lines.filter((line) => line === 'BEGIN pick-contract-v1').length === 1 &&
    lines.filter((line) => line === 'END pick-contract-v1').length === 1,
  'PICK report has duplicate boundary markers');
  requireValue(lines.filter((line) => line.startsWith('READY ')).length === 1 &&
    lines.includes('READY pick-package=COMMON-GRAPHICS-USER ran-package=COMMON-GRAPHICS-USER state-symbols=2 seed-symbols=1'),
  'PICK report did not resolve both functions and the expected seeded-state bindings');
  requireValue(lines.filter((line) => line.startsWith('CASE-ERROR ')).length === 0,
    'PICK probe reported a failed case');

  const complete = matchSingle(lines.at(-2), /^COMPLETE cases=(\d+)$/,
    'PICK completion record');
  requireValue(Number(complete[1]) === 16, 'PICK probe did not complete all 16 cases');
  const expectedSeeds = [1234, 5678, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 77, 2026, 65535];
  const caseLines = lines.filter((line) => line.startsWith('CASE seed='));
  requireValue(caseLines.length === expectedSeeds.length,
    `Expected ${expectedSeeds.length} PICK rows, got ${caseLines.length}`);

  const cases = caseLines.map((line, index) => {
    const match = matchSingle(line,
      /^CASE seed=(\d+) argc=3 args=\(27 28 29\) result=\((\d+)\) pick-next=(\d+) direct-index=(\d+) direct-next=(\d+) no-draw-next=(\d+)$/,
      'PICK case');
    const [, seedText, resultText, pickNextText, directIndexText,
      directNextText, noDrawNextText] = match;
    const seed = Number(seedText);
    const result = Number(resultText);
    const pickNext = Number(pickNextText);
    const directIndex = Number(directIndexText);
    const directNext = Number(directNextText);
    const noDrawNext = Number(noDrawNextText);
    requireValue(seed === expectedSeeds[index],
      `PICK seed order differs at row ${index}: ${seed}`);
    requireValue(directIndex >= 0 && directIndex <= 2,
      `PICK direct RAN index is out of range for seed ${seed}`);
    requireValue(result === [27, 28, 29][directIndex],
      `PICK result does not match the direct RAN index for seed ${seed}`);
    requireValue(pickNext === directNext,
      `PICK random state differs from one direct RAN draw for seed ${seed}`);
    requireValue(lines.includes(`CASE-STAGE seed=${seed} argc=3 stage=case-enter`) &&
      lines.includes(`CASE-STAGE seed=${seed} argc=3 stage=seeded`) &&
      lines.includes(`CASE-STAGE seed=${seed} argc=3 stage=pick-return result=(${result})`) &&
      lines.includes(`CASE-STAGE seed=${seed} argc=3 stage=random-comparisons-complete`),
    `PICK case ${seed} is missing a required progress checkpoint`);

    const jsRandom = new Allegro501Random(seed);
    const jsPick = jsRandom.pick([27, 28, 29]);
    const jsNext = jsRandom.integer(0, 1000000);
    return {
      seed,
      argc: 3,
      arguments: [27, 28, 29],
      original: {
        returnValue: result,
        directRANIndex: directIndex,
        nextRANAfterPick: pickNext,
        nextRANAfterDirectDraw: directNext,
        nextRANWithoutPick: noDrawNext,
        selectionMatchesDirectRAN: true,
        stateMatchesOneDirectRANDraw: true,
      },
      javascript: {
        returnValue: jsPick,
        nextRANAfterPick: jsNext,
        matchesOriginal: jsPick === result && jsNext === pickNext,
      },
    };
  });
  const selectedIndices = [...new Set(cases.map((entry) => entry.original.directRANIndex))]
    .sort((a, b) => a - b);
  requireValue(JSON.stringify(selectedIndices) === JSON.stringify([0, 1, 2]),
    'The 16 controlled states did not exercise all three candidate positions');
  const javascriptMatches = cases.filter((entry) => entry.javascript.matchesOriginal).length;
  requireValue(javascriptMatches === cases.length,
    `Allegro501Random.pick matched only ${javascriptMatches}/${cases.length} cases`);
  const statesDifferFromNoPick = cases.filter((entry) =>
    entry.original.nextRANAfterPick !== entry.original.nextRANWithoutPick).length;
  requireValue(statesDifferFromNoPick === cases.length,
    `PICK did not advance to a distinct next-RAN result in ${cases.length - statesDifferFromNoPick} cases`);

  const currentRunnerBytes = await readFile('research/oracle/run-local-scene-state-required-probe.ps1');
  const currentRunnerSha256 = sha256(currentRunnerBytes);
  requireValue(currentRunnerSha256 === observer.summary.runnerSha256,
    'Current required-probe runner differs from the captured runner');
  const evidence = {
    schemaVersion: 1,
    function: 'PICK',
    evidenceLevel: 'bounded original-runtime contract',
    scope: {
      positionalArgumentCount: 3,
      argumentValues: [27, 28, 29],
      randomSeeds: expectedSeeds,
      cases: cases.length,
    },
    observedBehavior: {
      selectedCandidatePositionMatchesDirectRAN: true,
      directRANBounds: [0, 2],
      nextRANStateMatchesOneDirectDraw: true,
      nextRANStateDiffersFromNoPick: `${statesDifferFromNoPick}/${cases.length}`,
      exercisedCandidatePositions: selectedIndices,
      javascriptAdapter: 'Allegro501Random.pick(array)',
      javascriptMatches: `${javascriptMatches}/${cases.length}`,
    },
    provenance: {
      observerRunId: observer.summary.runId,
      controlBeforeRunId: before.summary.runId,
      controlAfterRunId: after.summary.runId,
      mode: observer.summary.mode,
      requiredReport: triplet.requiredReport,
      requiredEndMarker: triplet.endMarker,
      probeSourcePath: 'research/introspection/pick-contract-v1.cl',
      probeSourceSha256,
      reportSha256: sha256(reportBytes),
      runnerSha256: observer.summary.runnerSha256,
      currentRunnerSha256,
      runtimeHashes: {
        installer: observer.summary.installerSha256,
        registryPatch: observer.summary.registryPatchSha256,
        licensePatch: observer.summary.licensePatchSha256,
      },
      controlOutputHashes: triplet.artifactHashes,
      ordinaryStagedSourceHashes: triplet.sourceHashes,
    },
    cases,
    limitations: [
      'Only three positional fixnums (27, 28, 29) and 16 seeded states are covered.',
      'Zero-argument, singleton, other arities, other value types, and non-seeded startup states are uncharacterized.',
      'Matching one-draw state advancement does not prove a direct source-level PICK-to-RAN call edge.',
      'This does not establish when PICK results are written as colors, a general color rule, or whole-painting parity.',
    ],
  };
  const bytes = `${JSON.stringify(evidence, null, 2)}\n`;
  const absoluteOutput = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, bytes, 'utf8');
  return { evidence, sha256: sha256(Buffer.from(bytes)), outputPath: absoluteOutput };
}

async function main() {
  const [outputPath, beforePath, observerPath, afterPath] = process.argv.slice(2);
  if (!outputPath || !beforePath || !observerPath || !afterPath) {
    throw new Error('Usage: node research/tools/derive-pick-contract-evidence.mjs <evidence.json> <before-root> <observer-root> <after-root>');
  }
  const derived = await derivePickContractEvidence(
    outputPath, beforePath, observerPath, afterPath);
  console.log(`PASS: 16 source-bound PICK cases; all three candidate positions exercised`);
  console.log(`PASS: original PICK equals direct RAN(0,2) selection and one-draw state`);
  console.log(`JavaScript adapter comparison: ${derived.evidence.observedBehavior.javascriptMatches} rows match`);
  console.log(`PASS: fresh controls match ${Object.keys(derived.evidence.provenance.controlOutputHashes).length} outputs and ${Object.keys(derived.evidence.provenance.ordinaryStagedSourceHashes).length} staged sources`);
  console.log(`Evidence SHA-256 ${derived.sha256}`);
  console.log(`Wrote ${derived.outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
