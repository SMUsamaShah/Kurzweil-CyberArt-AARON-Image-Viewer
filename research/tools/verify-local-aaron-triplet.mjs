#!/usr/bin/env node

// Read-only gate for a fresh uninstrumented / observer / uninstrumented
// writer-stream-seed-1234 triplet. Explicit observer-only outputs are compared
// between the fresh controls and retained from the observer. The optional
// PICK-return scene report is accepted only when its sole delta is the one
// expected FIRST-PICK-RETURN snapshot block.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const outputNames = [
  'aa0',
  'image',
  'image-id',
  'aaron-scene-state-snapshot.txt',
  'aaron-planning-call-trace.txt',
  'aaron-random-seed-loaded.txt',
];

const probeOnlySources = new Set([
  'aaron-pre-scene-probe.cl',
  'aaron-probe-loader.cl',
]);

// These outputs may change only for the explicitly gated PICK-return
// intervention runner. Ordinary triplets remain byte-strict by default.
const allowedIntentionalDivergenceOutputs = new Set(['aa0', 'image', 'image-id']);

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function fileHash(filePath) {
  await access(filePath);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function loadRun(label, runPath) {
  const summaryPath = path.join(runPath, 'summary.json');
  const capturePath = path.join(runPath, 'capture');
  // PowerShell's JSON writer may emit a UTF-8 BOM; JSON.parse rejects it.
  const summaryText = (await readFile(summaryPath, 'utf8')).replace(/^\uFEFF/, '');
  const summary = JSON.parse(summaryText);
  requireValue(summary.complete === true, `${label} summary is incomplete`);
  requireValue(summary.probeCompletionSatisfied === true,
    `${label} probe completion marker was not satisfied`);
  await access(capturePath);
  return { label, runPath, capturePath, summary };
}

function requireSafeName(name, label) {
  requireValue(typeof name === 'string' && name.length > 0 &&
    path.basename(name) === name, `${label} contains an invalid output name`);
}

async function compareNamedFile(runs, name, category) {
  const entries = await Promise.all(runs.map(async (run) => {
    const filePath = path.join(run.capturePath, name);
    return { run, sha256: await fileHash(filePath) };
  }));
  const expected = entries[0].sha256;
  for (const entry of entries.slice(1)) {
    requireValue(entry.sha256 === expected,
      `${category} differs for ${name}: ${entries[0].label}=${expected}, ` +
      `${entry.run.label}=${entry.sha256}`);
  }
  return expected;
}

async function requireOnlyPickReturnSnapshot(beforePath, observerPath) {
  const normalizeLines = (text) => text.replace(/\r\n?/g, '\n').trimEnd().split('\n');
  const beforeLines = normalizeLines(await readFile(beforePath, 'utf8'));
  const observerLines = normalizeLines(await readFile(observerPath, 'utf8'));
  const boundary = 'BOUNDARY label=FIRST-PICK-RETURN';
  const begin = 'SNAPSHOT-BEGIN label=FIRST-PICK-RETURN';
  const boundaryIndexes = observerLines.flatMap((line, index) => line === boundary ? [index] : []);
  const beginIndexes = observerLines.flatMap((line, index) => line === begin ? [index] : []);
  requireValue(boundaryIndexes.length === 1 && beginIndexes.length === 1,
    'observer-only scene report must contain one complete FIRST-PICK-RETURN snapshot');
  const boundaryIndex = boundaryIndexes[0];
  const beginIndex = beginIndexes[0];
  const endIndex = observerLines.findIndex((line, index) => index > beginIndex &&
    /^SNAPSHOT-END label=FIRST-PICK-RETURN rows=\d+$/.test(line));
  requireValue(boundaryIndex + 1 === beginIndex && endIndex > beginIndex,
    'FIRST-PICK-RETURN scene snapshot is malformed or truncated');
  const observerWithoutPickSnapshot = [
    ...observerLines.slice(0, boundaryIndex),
    ...observerLines.slice(endIndex + 1),
  ];
  requireValue(JSON.stringify(observerWithoutPickSnapshot) === JSON.stringify(beforeLines),
    'observer scene report differs beyond its single FIRST-PICK-RETURN snapshot block');
}

async function stagedSources(run) {
  const names = (await readdir(run.capturePath, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.cl') &&
      !probeOnlySources.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  requireValue(names.length > 0, `${run.label} has no ordinary staged Lisp sources`);
  return names;
}

export async function verifyLocalAaronTriplet(beforePath, observerPath, afterPath, options = {}) {
  const observerOnlyOutputNames = new Set(options.observerOnlyOutputNames ?? []);
  const intentionalDifferenceNames = new Set(options.intentionalDifferenceNames ?? []);
  for (const name of intentionalDifferenceNames) {
    requireSafeName(name, 'intentional-difference output');
    requireValue(allowedIntentionalDivergenceOutputs.has(name),
      `intentional observer divergence is not allowed for ${name}`);
    requireValue(!observerOnlyOutputNames.has(name),
      `${name} cannot be both observer-only and an intentional divergence`);
  }
  for (const name of observerOnlyOutputNames) {
    requireSafeName(name, 'observer-only output');
    requireValue(outputNames.includes(name),
      `observer-only comparison is unsupported for ${name}`);
  }
  const runs = await Promise.all([
    loadRun('before', path.resolve(beforePath)),
    loadRun('observer', path.resolve(observerPath)),
    loadRun('after', path.resolve(afterPath)),
  ]);
  const [before, observer, after] = runs;

  requireValue(before.summary.preSceneProbeSha256 == null &&
    after.summary.preSceneProbeSha256 == null,
  'bracketing controls must be uninstrumented');
  requireValue(typeof observer.summary.preSceneProbeSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(observer.summary.preSceneProbeSha256),
  'observer has no source-bound probe hash');

  const probeSourceHash = await fileHash(
    path.join(observer.capturePath, 'aaron-pre-scene-probe.cl'));
  requireValue(probeSourceHash === observer.summary.preSceneProbeSha256,
    'observer probe source hash does not match the runner summary');

  const requiredReport = observer.summary.requiredProbeOutputName;
  const endMarker = observer.summary.requiredProbeEndMarker;
  requireSafeName(requiredReport, 'required probe output');
  requireValue(typeof endMarker === 'string' && endMarker.startsWith('END '),
    'observer has no required terminal marker');
  requireValue(observer.summary.probeOutputNames.includes(requiredReport),
    'required report is not in the observer output manifest');
  for (const name of observer.summary.probeOutputNames) {
    requireSafeName(name, 'probe output');
    await access(path.join(observer.capturePath, name));
  }
  const report = (await readFile(path.join(observer.capturePath, requiredReport), 'utf8'))
    .replace(/\r\n?/g, '\n')
    .trimEnd();
  requireValue(report.endsWith(endMarker),
    `required report does not end with ${JSON.stringify(endMarker)}`);
  if (intentionalDifferenceNames.size > 0) {
    requireValue(/^aaron-screen-unit-context-v(?:11|12|13)\.txt$/.test(requiredReport),
      'intentional image divergence is reserved for the source-bound PICK intervention probes');
    for (const marker of ['PICK-SUBSTITUTION ', 'PICK-CALLER-RETURN ',
      'PICK-INTERVENTION-COMPLETE ']) {
      requireValue(report.split('\n').filter((line) => line.startsWith(marker)).length === 1,
        `intervention report must contain exactly one ${marker.trim()} record`);
    }
  }

  const sourceSets = await Promise.all(runs.map(stagedSources));
  const sourceNames = sourceSets[0];
  for (let index = 1; index < sourceSets.length; index++) {
    requireValue(JSON.stringify(sourceSets[index]) === JSON.stringify(sourceNames),
      `ordinary staged source names differ between ${runs[0].label} and ${runs[index].label}`);
  }

  const artifactHashes = [];
  const observerOnlyOutputHashes = {};
  const intentionalDifferenceOutputHashes = {};
  for (const name of outputNames) {
    if (observerOnlyOutputNames.has(name)) {
      const controlHash = await compareNamedFile([before, after], name, 'bracketing control output');
      const observerHash = await fileHash(path.join(observer.capturePath, name));
      if (name === 'aaron-scene-state-snapshot.txt') {
        await requireOnlyPickReturnSnapshot(
          path.join(before.capturePath, name),
          path.join(observer.capturePath, name),
        );
      }
      artifactHashes.push([name, controlHash]);
      observerOnlyOutputHashes[name] = observerHash;
    } else if (intentionalDifferenceNames.has(name)) {
      const controlHash = await compareNamedFile([before, after], name,
        'bracketing control output');
      const observerHash = await fileHash(path.join(observer.capturePath, name));
      artifactHashes.push([name, controlHash]);
      intentionalDifferenceOutputHashes[name] = observerHash;
    } else {
      artifactHashes.push([name, await compareNamedFile(runs, name, 'scene output')]);
    }
  }
  for (const run of runs) {
    const expectedAa0Hash = run.label === 'observer' &&
      intentionalDifferenceOutputHashes.aa0
      ? intentionalDifferenceOutputHashes.aa0
      : artifactHashes.find(([name]) => name === 'aa0')[1];
    requireValue(run.summary.aa0Sha256 === expectedAa0Hash,
      `${run.label} AA0 summary hash does not match its captured bytes`);
    const sceneReportHash = run.label === 'observer' &&
      observerOnlyOutputHashes['aaron-scene-state-snapshot.txt']
      ? observerOnlyOutputHashes['aaron-scene-state-snapshot.txt']
      : artifactHashes.find(([name]) => name === 'aaron-scene-state-snapshot.txt')[1];
    requireValue(run.summary.sceneReportSha256 === sceneReportHash,
    `${run.label} scene summary hash does not match its captured report`);
  }
  const sourceHashes = [];
  for (const name of sourceNames) {
    sourceHashes.push([name, await compareNamedFile(runs, name, 'staged source')]);
  }

  return {
    runs,
    probeSourceHash,
    requiredReport,
    endMarker,
    reportHash: await fileHash(path.join(observer.capturePath, requiredReport)),
    artifactHashes: Object.fromEntries(artifactHashes),
    observerOnlyOutputHashes,
    intentionalDifferenceOutputHashes,
    sourceHashes: Object.fromEntries(sourceHashes),
  };
}

async function main() {
  const [beforePath, observerPath, afterPath, ...comparisonArgs] = process.argv.slice(2);
  if (!beforePath || !observerPath || !afterPath) {
    console.error(
      'Usage: node research/tools/verify-local-aaron-triplet.mjs ' +
      '<control-before-root> <observer-root> <control-after-root> ' +
      '[observer-only-output-name ...] [--allow-observer-difference=aa0|image|image-id]');
    process.exitCode = 2;
    return;
  }

  const observerOnlyOutputNames = [];
  const intentionalDifferenceNames = [];
  for (const argument of comparisonArgs) {
    if (argument.startsWith('--allow-observer-difference=')) {
      intentionalDifferenceNames.push(argument.slice('--allow-observer-difference='.length));
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown triplet comparison option ${argument}`);
    } else {
      observerOnlyOutputNames.push(argument);
    }
  }
  const verified = await verifyLocalAaronTriplet(beforePath, observerPath, afterPath, {
    observerOnlyOutputNames,
    intentionalDifferenceNames,
  });
  const [before, observer] = verified.runs;

  console.log(`PASS: three complete ${before.summary.mode} runs`);
  console.log(`PASS: observer source-bound by ${verified.probeSourceHash}`);
  console.log(`PASS: required report ends with ${JSON.stringify(verified.endMarker)}`);
  console.log(`PASS: ${Object.keys(verified.artifactHashes).length} outputs agree across fresh bracketing controls`);
  if (Object.keys(verified.observerOnlyOutputHashes).length) {
    console.log(`PASS: ${Object.keys(verified.observerOnlyOutputHashes).length} observer-only outputs archived and hash-bound`);
    for (const [name, hash] of Object.entries(verified.observerOnlyOutputHashes)) {
      console.log(`  observer-only output ${name} ${hash}`);
    }
  }
  if (Object.keys(verified.intentionalDifferenceOutputHashes).length) {
    console.log('PASS fresh controls match; intervention observer outputs are separately hash-bound');
    for (const [name, hash] of Object.entries(verified.intentionalDifferenceOutputHashes)) {
      console.log(`INTERVENTION-OUTPUT ${name} ${hash}`);
    }
  }
  console.log(`PASS: ${Object.keys(verified.sourceHashes).length} ordinary staged Lisp sources match`);
  for (const [name, hash] of Object.entries(verified.artifactHashes)) console.log(`  output ${name} ${hash}`);
  for (const [name, hash] of Object.entries(verified.sourceHashes)) console.log(`  source ${name} ${hash}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => fail(error.message));
}
