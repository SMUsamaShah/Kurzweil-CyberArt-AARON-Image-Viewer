#!/usr/bin/env node

// Offline derivation for the bounded ZERO-EDGE compiled-constant reference census.
// Static references are candidates only; this script never executes AARON.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER_PATH = resolve(ROOT, 'research/oracle/run-local-scene-state-required-probe.ps1');
const MANIFEST_PATH = resolve(ROOT, 'research/extracted/aaron/manifest.json');
const PROBE_PATH = resolve(ROOT, 'research/introspection/zero-edge-native-links.cl');
const DEFAULT_RUNS = Object.freeze({
  before: 'research/extracted/local-oracle/zero-edge-native-links-20261013-control-before-a',
  observer: 'research/extracted/local-oracle/zero-edge-native-links-20261013-observer-b',
  after: 'research/extracted/local-oracle/zero-edge-native-links-20261013-control-after-c',
});
const OUTPUT_NAME = 'aaron-zero-edge-native-links.txt';
const END_MARKER = 'END zero-edge-native-links';
const ARTIFACTS = Object.freeze({
  aa0: 'aa0', image: 'image', imageId: 'image-id',
  sceneSnapshot: 'aaron-scene-state-snapshot.txt',
  planningTrace: 'aaron-planning-call-trace.txt',
  loadedSeed: 'aaron-random-seed-loaded.txt',
});
const SCENE_SOURCE_NAMES = Object.freeze([
  'planning-call-trace.cl', 'planning-random-seed-common.cl',
  'scene-state-snapshot-seeded-1234.cl', 'scene-state-snapshot-writer-seeded-1234.cl',
  'scene-state-snapshot-writer-stream-seeded-1234.cl', 'scene-state-snapshot.cl',
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFileSync(path);
const readJson = path => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/u, ''));
const rel = path => relative(ROOT, path).split(sep).join('/');
const insideRoot = path => {
  const value = relative(ROOT, path);
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`);
};
const bind = path => ({ path: rel(path), bytes: read(path).length, sha256: sha256(read(path)) });

function artifact(root, name) {
  const path = resolve(root, 'capture', name);
  const bytes = read(path);
  return { path: rel(path), bytes: bytes.length, sha256: sha256(bytes) };
}

function runInfo(rootRel, role, expectedRunnerHash, manifest) {
  const root = resolve(ROOT, rootRel);
  assert(insideRoot(root), `${role}: run root escapes the repository`);
  const summaryPath = resolve(root, 'summary.json');
  const summaryBytes = read(summaryPath);
  const summary = readJson(summaryPath);
  const manifestExe = manifest.files.find(item => item.installedName === 'AARON.exe');
  const manifestPll = manifest.files.find(item => item.installedName === 'AARON.pll');
  const exePath = resolve(root, 'runtime/AARON.exe');
  const pllPath = resolve(root, 'runtime/AARON.pll');
  const exe = read(exePath);
  const pll = read(pllPath);
  assert(summary.runId === root.split(sep).at(-1), `${role}: run ID differs from its directory`);
  assert(summary.complete === true && summary.mode === 'writer-stream-seed-1234'
    && summary.smallImage === false && summary.probeCompletionSatisfied === true
    && summary.runnerSha256 === expectedRunnerHash,
  `${role}: incomplete run, wrong drawing mode, or runner-source mismatch`);
  assert(summary.installerSha256 === manifest.source.sha256,
    `${role}: installer differs from the extracted-runtime manifest`);
  assert(manifestExe && exe.length === manifestExe.bytes && sha256(exe) === manifestExe.sha256,
    `${role}: runtime executable differs from its manifest`);
  assert(manifestPll && pll.length === manifestPll.bytes && sha256(pll) === manifestPll.sha256,
    `${role}: runtime PLL differs from its manifest`);
  const files = Object.fromEntries(Object.entries(ARTIFACTS).map(([key, name]) => [key, artifact(root, name)]));
  const sceneSources = Object.fromEntries(SCENE_SOURCE_NAMES.map(name => [name, artifact(root, name)]));
  assert(summary.aa0Sha256 === files.aa0.sha256 && summary.sceneReportSha256 === files.sceneSnapshot.sha256,
    `${role}: runner output hashes disagree with archived files`);
  const header = read(resolve(ROOT, files.aa0.path)).toString('ascii').split(/\r?\n/u, 1)[0];
  const dimensions = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(header);
  assert(dimensions, `${role}: AA0 dimensions header is malformed`);
  const canvasDimensions = { width: Number(dimensions[1]), height: Number(dimensions[2]), headerValue: Number(dimensions[3]) };
  return {
    root, summary,
    row: {
      runId: summary.runId, role, path: rel(root), complete: summary.complete,
      mode: summary.mode, smallImage: summary.smallImage,
      installerSha256: summary.installerSha256,
      registryPatchSha256: summary.registryPatchSha256,
      licensePatchSha256: summary.licensePatchSha256,
      runnerSha256: summary.runnerSha256,
      runtimeExecutableSha256: sha256(exe), runtimePllSha256: sha256(pll),
      summarySha256: sha256(summaryBytes),
      probeSha256: summary.preSceneProbeSha256 ?? null,
      probeOutputNames: summary.probeOutputNames,
      probePauseSeconds: summary.preSceneProbePauseSeconds,
      probeCompletionSatisfied: summary.probeCompletionSatisfied,
      requiredProbeOutputName: summary.requiredProbeOutputName,
      requiredProbeEndMarker: summary.requiredProbeEndMarker,
      aa0Dimensions: canvasDimensions,
      files, sceneSources,
    },
  };
}

function parseMetadata(path) {
  const bytes = read(path);
  const text = bytes.toString('utf8').replace(/\r\n/gu, '\n');
  assert(text.startsWith('BEGIN zero-edge-native-links\n')
    && text.endsWith(`${END_MARKER}\n`), 'ZERO-EDGE scan lacks its exact BEGIN/END boundary');
  const summary = /^SUMMARY bindings=(\d+) compiled-scanned=(\d+) references=(\d+) errors=(\d+) truncated=(\d+)$/mu.exec(text);
  assert(summary, 'ZERO-EDGE scan summary is missing or malformed');
  const [, bindings, compiledScanned, referenceCount, errors, truncated] = summary;
  assert(Number(errors) === 0 && Number(truncated) === 0,
    `ZERO-EDGE scan is incomplete (errors=${errors}, truncated=${truncated})`);
  assert(text.includes('FUNCTION name="ZERO-EDGE" type=COMPILED-FUNCTION'),
    'ZERO-EDGE compiled-function metadata was not captured');
  const references = [...text.matchAll(/^REFERENCE root="([^"]+)" path=(.*?) index=(\d+) kind=:(SYMBOL|FUNCTION)$/gmu)]
    .map(match => ({ root: match[1], path: match[2], constantIndex: Number(match[3]), kind: match[4].toLowerCase() }));
  assert(references.length === Number(referenceCount), 'Reference rows do not match the summary count');
  return {
    bytes, text,
    result: {
      ownPackageFunctionBindings: Number(bindings),
      uniqueCompiledFunctionsScanned: Number(compiledScanned),
      staticReferenceCount: Number(referenceCount), errors: Number(errors), truncations: Number(truncated),
      staticReferenceCandidates: references,
      targetFunctionLine: text.split('\n').find(line => line.startsWith('FUNCTION name="ZERO-EDGE"')),
      targetConstantCountLine: text.split('\n').find(line => line.startsWith('CONSTANT-COUNT name="ZERO-EDGE"')),
    },
  };
}

function main() {
  const [outputArg, beforeArg, observerArg, afterArg, ...extra] = process.argv.slice(2);
  assert(extra.length === 0,
    'Usage: node derive-zero-edge-native-links-evidence.mjs [output.json] [before-root] [observer-root] [after-root]');
  const output = resolve(ROOT, outputArg ?? 'research/introspection/evidence/zero-edge-native-links-20261013.json');
  assert(insideRoot(output) && !existsSync(output), 'Evidence path must be inside the repo and fresh');
  const runnerBytes = read(RUNNER_PATH);
  const runnerHash = sha256(runnerBytes);
  const manifest = readJson(MANIFEST_PATH);
  const runs = [
    runInfo(beforeArg ?? DEFAULT_RUNS.before, 'fresh uninstrumented control before', runnerHash, manifest),
    runInfo(observerArg ?? DEFAULT_RUNS.observer, 'ZERO-EDGE static-reference observer', runnerHash, manifest),
    runInfo(afterArg ?? DEFAULT_RUNS.after, 'fresh uninstrumented control after', runnerHash, manifest),
  ];
  const [before, observer, after] = runs;
  for (const field of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256',
    'runtimeExecutableSha256', 'runtimePllSha256']) {
    assert(before.row[field] === observer.row[field] && observer.row[field] === after.row[field],
      `Run setup differs for ${field}`);
  }
  const expectedDimensions = JSON.stringify(before.row.aa0Dimensions);
  assert(JSON.stringify(observer.row.aa0Dimensions) === expectedDimensions
    && JSON.stringify(after.row.aa0Dimensions) === expectedDimensions,
  'Before/observer/after AA0 dimensions differ');
  for (const control of [before, after]) {
    assert(control.row.probeSha256 === null && control.row.probeOutputNames.length === 0
      && control.row.probePauseSeconds === 0 && control.row.requiredProbeOutputName === ''
      && control.row.requiredProbeEndMarker === '',
    `${control.row.runId}: expected a no-probe control`);
  }
  const equalArtifacts = Object.keys(ARTIFACTS).map(key => {
    const expected = before.row.files[key].sha256;
    assert(observer.row.files[key].sha256 === expected && after.row.files[key].sha256 === expected,
      `Before/observer/after output differs: ${key}`);
    return { name: key, sha256: expected, bytes: before.row.files[key].bytes };
  });
  const equalSceneSources = SCENE_SOURCE_NAMES.map(name => {
    const expected = before.row.sceneSources[name].sha256;
    assert(observer.row.sceneSources[name].sha256 === expected && after.row.sceneSources[name].sha256 === expected,
      `Before/observer/after scene source differs: ${name}`);
    return { name, sha256: expected, bytes: before.row.sceneSources[name].bytes };
  });

  const requestPath = resolve(observer.root, 'pre-scene-probe-request.json');
  const requestBytes = read(requestPath);
  const request = readJson(requestPath);
  const stagedProbePath = resolve(observer.root, 'capture/aaron-pre-scene-probe.cl');
  const stagedProbe = read(stagedProbePath);
  const reportPath = resolve(observer.root, `capture/${OUTPUT_NAME}`);
  const parsed = parseMetadata(reportPath);
  const stagedProbeHash = sha256(stagedProbe);
  assert(request.schemaVersion === 1 && request.runId === observer.row.runId
    && request.runtimeExecutable === resolve(observer.root, 'runtime/AARON.exe')
    && request.probeSha256 === stagedProbeHash && request.probeSha256 === observer.row.probeSha256
    && request.pauseSeconds === 0 && request.runnerSha256 === runnerHash
    && request.requiredProbeOutputName === OUTPUT_NAME && request.requiredProbeEndMarker === END_MARKER
    && request.probeOutputNames.length === 1 && request.probeOutputNames[0] === OUTPUT_NAME,
  'Runner request does not bind the captured observer source/output/mode');
  assert(observer.row.probeOutputNames.length === 1 && observer.row.probeOutputNames[0] === OUTPUT_NAME
    && observer.row.probePauseSeconds === 0 && observer.row.requiredProbeOutputName === OUTPUT_NAME
    && observer.row.requiredProbeEndMarker === END_MARKER,
  'Observer summary does not bind the required probe terminal marker');
  assert(stagedProbeHash === sha256(read(PROBE_PATH)), 'Staged source differs from the reviewed repository probe');

  const evidence = {
    schemaVersion: 1,
    status: 'measured',
    question: 'Which COMMON-GRAPHICS-USER compiled-function constant tables contain a ZERO-EDGE symbol or function reference?',
    interpretation: 'Static constant references are candidate relationships only. They do not establish a direct call, dynamic execution, caller ordering, or ZERO-EDGE behavior.',
    result: parsed.result,
    controls: {
      mode: 'writer-stream-seed-1234', smallImage: false,
      canvas: observer.row.aa0Dimensions,
      allSixOutputsByteIdenticalAcrossBeforeObserverAfter: true,
      allSixSceneSourcesByteIdenticalAcrossBeforeObserverAfter: true,
      equalOutputs: equalArtifacts, equalSceneSources,
      runs: runs.map(run => run.row),
    },
    capturedProbe: {
      source: bind(PROBE_PATH), stagedSource: bind(stagedProbePath),
      request: { path: rel(requestPath), bytes: requestBytes.length, sha256: sha256(requestBytes) },
      report: { path: rel(reportPath), bytes: parsed.bytes.length, sha256: sha256(parsed.bytes) },
      runner: { path: rel(RUNNER_PATH), bytes: runnerBytes.length, sha256: runnerHash },
      manifest: bind(MANIFEST_PATH),
      deriver: bind(fileURLToPath(import.meta.url)),
    },
    limitations: [
      'The scan is bounded by depth 8, 4096 constants per object, and 10000 unique compiled functions; zero truncations were required for this result.',
      'A reference can be a data value or function object constant. It does not prove that a call occurs.',
      'The shared output controls support observer transparency for this one measured canvas and seed-1234 writer-stream setup only.',
      'No ZERO-EDGE JavaScript contract count changes as a result of this static census.',
    ],
  };
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${rel(output)}\n${sha256(read(output))}\n`);
}

main();
