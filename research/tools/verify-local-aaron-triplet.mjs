#!/usr/bin/env node

// Read-only gate for a fresh uninstrumented / observer / uninstrumented
// writer-stream-seed-1234 triplet. The observer's own probe report and loader
// are intentionally excluded; scene outputs and ordinary staged Lisp sources
// must be byte-identical across all three runs.
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

async function stagedSources(run) {
  const names = (await readdir(run.capturePath, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.cl') &&
      !probeOnlySources.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  requireValue(names.length > 0, `${run.label} has no ordinary staged Lisp sources`);
  return names;
}

export async function verifyLocalAaronTriplet(beforePath, observerPath, afterPath) {
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

  const sourceSets = await Promise.all(runs.map(stagedSources));
  const sourceNames = sourceSets[0];
  for (let index = 1; index < sourceSets.length; index++) {
    requireValue(JSON.stringify(sourceSets[index]) === JSON.stringify(sourceNames),
      `ordinary staged source names differ between ${runs[0].label} and ${runs[index].label}`);
  }

  const artifactHashes = [];
  for (const name of outputNames) {
    artifactHashes.push([name, await compareNamedFile(runs, name, 'scene output')]);
  }
  for (const run of runs) {
    requireValue(run.summary.aa0Sha256 === artifactHashes.find(([name]) => name === 'aa0')[1],
      `${run.label} AA0 summary hash does not match its captured bytes`);
    requireValue(run.summary.sceneReportSha256 === artifactHashes.find(([name]) =>
      name === 'aaron-scene-state-snapshot.txt')[1],
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
    sourceHashes: Object.fromEntries(sourceHashes),
  };
}

async function main() {
  const [beforePath, observerPath, afterPath] = process.argv.slice(2);
  if (!beforePath || !observerPath || !afterPath || process.argv.length !== 5) {
    console.error(
      'Usage: node research/tools/verify-local-aaron-triplet.mjs ' +
      '<control-before-root> <observer-root> <control-after-root>');
    process.exitCode = 2;
    return;
  }

  const verified = await verifyLocalAaronTriplet(beforePath, observerPath, afterPath);
  const [before, observer] = verified.runs;

  console.log(`PASS: three complete ${before.summary.mode} runs`);
  console.log(`PASS: observer source-bound by ${verified.probeSourceHash}`);
  console.log(`PASS: required report ends with ${JSON.stringify(verified.endMarker)}`);
  console.log(`PASS: ${Object.keys(verified.artifactHashes).length} drawing/scene outputs match`);
  console.log(`PASS: ${Object.keys(verified.sourceHashes).length} ordinary staged Lisp sources match`);
  for (const [name, hash] of Object.entries(verified.artifactHashes)) console.log(`  output ${name} ${hash}`);
  for (const [name, hash] of Object.entries(verified.sourceHashes)) console.log(`  source ${name} ${hash}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => fail(error.message));
}
