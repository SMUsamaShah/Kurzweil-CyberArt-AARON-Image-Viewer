#!/usr/bin/env node

// Rebuild the compact triplet-comparison envelope from completed oracle runs.
// This offline recovery path avoids retaining all PowerShell objects from three
// runs in memory after the AARON processes have already exited.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseV2CaptureEnvelope, validateV2CaptureReport } from './validate-premium-callsite-wide-window-v2.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODE = 'writer-stream-seed-1234';
const SCENE_SOURCES = [
  'planning-call-trace.cl',
  'planning-random-seed-common.cl',
  'scene-state-snapshot-seeded-1234.cl',
  'scene-state-snapshot-writer-seeded-1234.cl',
  'scene-state-snapshot-writer-stream-seeded-1234.cl',
  'scene-state-snapshot.cl',
];
const SCENE_SOURCE_PATHS = {
  'planning-call-trace.cl': 'research/introspection/planning-call-trace.cl',
  'planning-random-seed-common.cl': 'research/oracle/planning-random-seed-common.cl',
  'scene-state-snapshot-seeded-1234.cl': 'research/introspection/scene-state-snapshot-seeded-1234.cl',
  'scene-state-snapshot-writer-seeded-1234.cl': 'research/introspection/scene-state-snapshot-writer-seeded-1234.cl',
  'scene-state-snapshot-writer-stream-seeded-1234.cl': 'research/introspection/scene-state-snapshot-writer-stream-seeded-1234.cl',
  'scene-state-snapshot.cl': 'research/introspection/scene-state-snapshot.cl',
};
const ARTIFACTS = ['aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt'];
const CURRENT_SOURCES = {
  coordinator: 'research/tools/capture-premium-callsite-wide-window-triplet-v2.ps1',
  probe: 'research/introspection/premium-callsite-metadata-v1.cl',
  runner: 'research/oracle/run-local-scene-state-required-probe.ps1',
  debuggerHelper: 'research/oracle/AaronPremiumCallsitePickCorrelationV2.cs',
  mapper: 'research/tools/map-native-code-to-pll.mjs',
  reaStaticCensus: 'research/introspection/evidence/select-subject-call-census-20261014-v1.json',
  extractedManifest: 'research/extracted/aaron/manifest.json',
  wideWindowValidator: 'research/tools/validate-premium-callsite-wide-window-v2.mjs',
  comparisonDeriver: 'research/tools/derive-premium-callsite-wide-window-triplet-comparison-v2.mjs',
  evidenceDeriver: 'research/tools/derive-premium-callsite-wide-window-evidence-v2.mjs',
  pePreparer: 'research/tools/prepare-premium-callsite-wide-window-pe-v2.mjs',
};

function fail(message) { throw new Error(message); }
function assert(ok, message) { if (!ok) fail(message); }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function repoPath(full, label) {
  const rel = relative(REPO, full);
  assert(rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label}: path escaped repository`);
  return rel.split(sep).join('/');
}
function read(full, label) {
  assert(existsSync(full), `${label}: missing ${full}`);
  const bytes = readFileSync(full);
  return { path: repoPath(full, label), bytes: bytes.length, sha256: hash(bytes), text: bytes.toString('utf8') };
}
function jsonFile(full, label) {
  const record = read(full, label);
  try { return { ...record, value: JSON.parse(record.text.replace(/^\uFEFF/u, '')) }; }
  catch (error) { fail(`${label}: invalid JSON (${error.message})`); }
}
function record(full, label) {
  const { path, bytes, sha256 } = read(full, label);
  return { path, bytes, sha256 };
}
function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--overwrite') { result.overwrite = true; continue; }
    if (!['--triplet-id', '--before-root', '--observer-root', '--after-root', '--diagnostics', '--out', '--coordinator-capture-snapshot'].includes(key)) {
      fail(`Unknown argument: ${key}`);
    }
    result[key.slice(2)] = argv[++i] ?? '';
  }
  for (const key of ['triplet-id', 'before-root', 'observer-root', 'after-root', 'diagnostics', 'out']) {
    assert(result[key], `Missing required argument ${key}`);
  }
  return result;
}
function resolveRepoPath(path, label) {
  const full = resolve(REPO, path);
  repoPath(full, label);
  return full;
}
function parseEnvelope(text, begin, end, label) {
  const normalized = text.replace(/\r\n/gu, '\n');
  assert(!normalized.includes('\r'), `${label}: lone CR`);
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  assert(lines[0] === begin && lines.at(-1) === end && lines.filter(line => line === end).length === 1,
    `${label}: incomplete or duplicate envelope markers`);
  try { return JSON.parse(lines.slice(1, -1).join('\n')); }
  catch (error) { fail(`${label}: invalid JSON (${error.message})`); }
}
function fileRecord(root, relPath, label) { return record(resolve(root, relPath), label); }

function buildRun(role, runRoot, tripletId, sourceMap, manifest) {
  const runId = `${tripletId}-${role}`;
  const root = resolveRepoPath(runRoot, `${role} root`);
  const rootRepo = repoPath(root, `${role} root`);
  const summaryFile = jsonFile(resolve(root, 'summary.json'), `${role} summary`);
  const summary = summaryFile.value;
  assert(summary.runId === runId && summary.complete === true && summary.probeCompletionSatisfied === true,
    `${role}: run identity/completion mismatch`);
  assert(summary.mode === MODE && summary.smallImage === false, `${role}: unexpected scene mode or image size`);
  assert(summary.runnerSha256 === sourceMap.runner.sha256, `${role}: current runner hash mismatch`);

  const runtime = {};
  for (const name of ['AARON.exe', 'AARON.pll']) {
    const row = fileRecord(root, `runtime/${name}`, `${role} runtime ${name}`);
    const manifestRow = manifest.files.find(item => item.installedName === name);
    assert(manifestRow && row.bytes === manifestRow.bytes && row.sha256 === manifestRow.sha256,
      `${role}: ${name} does not match the extracted manifest`);
    runtime[name] = row;
  }
  const artifacts = {};
  for (const name of ARTIFACTS) artifacts[name] = fileRecord(root, `capture/${name}`, `${role} artifact ${name}`);
  const aa0Text = readFileSync(resolve(root, 'capture/aa0'), 'utf8');
  const aa0Header = aa0Text.split(/\r?\n/u, 1)[0];
  assert(aa0Text.trimEnd().endsWith('end'), `${role}: AA0 capture has no terminal end marker`);
  assert(artifacts.aa0.sha256 === summary.aa0Sha256, `${role}: AA0 summary hash mismatch`);
  const sceneText = readFileSync(resolve(root, 'capture/aaron-scene-state-snapshot.txt'), 'utf8');
  assert(sceneText.includes('END scene-state-snapshot') && artifacts['aaron-scene-state-snapshot.txt'].sha256 === summary.sceneReportSha256,
    `${role}: scene report is incomplete or not summary-bound`);

  const sources = {};
  for (const name of SCENE_SOURCES) {
    const staged = fileRecord(root, `capture/${name}`, `${role} staged source ${name}`);
    const current = sourceMap.sceneSources[name];
    assert(staged.sha256 === current.sha256 && staged.bytes === current.bytes, `${role}: staged scene source changed: ${name}`);
    sources[name] = staged;
  }
  const planningTrace = fileRecord(root, 'capture/aaron-planning-call-trace.txt', `${role} planning trace`);

  let metadata = null;
  let debuggerResult = null;
  if (role === 'observer') {
    const probeHash = sourceMap.probe.sha256;
    assert(summary.preSceneProbeSha256 === probeHash && summary.preSceneProbePauseSeconds === 150,
      'observer: READY metadata probe is not bound to the current source and pause');
    assert(summary.requiredProbeOutputName === 'aaron-premium-callsite-pick-correlation-v2.txt' &&
      summary.requiredProbeEndMarker === 'END premium-callsite-pick-correlation-v2' &&
      Array.isArray(summary.probeOutputNames) && summary.probeOutputNames.length === 2 &&
      summary.probeOutputNames[0] === 'aaron-premium-callsite-metadata-v1.txt' &&
      summary.probeOutputNames[1] === summary.requiredProbeOutputName,
    'observer: required probe output list is not exact');
    metadata = fileRecord(root, 'capture/aaron-premium-callsite-metadata-v1.txt', 'observer metadata report');
    debuggerResult = fileRecord(root, `capture/${summary.requiredProbeOutputName}`, 'observer debugger report');
    assert(debuggerResult.sha256 === summary.requiredProbeOutputSha256, 'observer debugger report hash differs from completed summary');
    const metadataText = readFileSync(resolve(root, 'capture/aaron-premium-callsite-metadata-v1.txt'), 'utf8').replace(/\r\n/gu, '\n');
    const metadataLines = metadataText.trimEnd().split('\n');
    const completeMarkers = metadataLines.filter(line => line === 'COMPLETE execution=finished');
    const readyIndex = metadataLines.indexOf('READY premium-callsite-metadata-v1');
    const releaseIndex = metadataLines.indexOf('CAPTURE-WAIT released=T');
    const completeIndex = metadataLines.indexOf('COMPLETE execution=finished');
    const endMarkers = metadataLines.filter(line => line === 'END premium-callsite-metadata-v1');
    const readyMarkers = metadataLines.filter(line => line === 'READY premium-callsite-metadata-v1');
    const releaseMarkers = metadataLines.filter(line => line === 'CAPTURE-WAIT released=T');
    assert(metadataText.endsWith('END premium-callsite-metadata-v1\n')
      && readyMarkers.length === 1 && releaseMarkers.length === 1 && endMarkers.length === 1
      && readyIndex >= 0 && releaseIndex > readyIndex && completeMarkers.length === 1
      && completeIndex > releaseIndex && metadataLines.at(-1) === 'END premium-callsite-metadata-v1',
    'observer metadata READY/release/COMPLETE/END handshake is incomplete');
    const reportText = readFileSync(resolve(root, `capture/${summary.requiredProbeOutputName}`), 'utf8');
    const report = parseV2CaptureEnvelope(reportText);
    assert(report.tripletId === tripletId && report.runId === runId && report.oracleRunId === runId,
      'observer debugger report is not bound to this triplet/run');
    assert(report.coordinatorScriptPath === CURRENT_SOURCES.coordinator
      && report.coordinatorScriptSha256 === sourceMap.coordinator.sha256
      && report.debuggerHelperPath === CURRENT_SOURCES.debuggerHelper
      && report.debuggerHelperSha256 === sourceMap.debuggerHelper.sha256,
    'observer debugger report source hashes do not match current source');
    const readyMetadataPath = resolve(root, 'native-code/ready-metadata.bin');
    const readyMetadataBytes = readFileSync(readyMetadataPath);
    const completeMetadataBytes = readFileSync(resolve(root, 'capture/aaron-premium-callsite-metadata-v1.txt'));
    assert(report.metadata?.readyReportSha256 === hash(readyMetadataBytes)
      && readyMetadataBytes.length <= completeMetadataBytes.length
      && completeMetadataBytes.subarray(0, readyMetadataBytes.length).equals(readyMetadataBytes),
    'READY metadata hash does not match the exact archived prefix of the completed metadata report');
    validateV2CaptureReport(report, { tripletId, runId, sources: sourceMap });
    debuggerResult = {
      ...debuggerResult,
      readyMetadataSha256: report.metadata.readyReportSha256,
      readyMetadata: {
        path: repoPath(readyMetadataPath, 'READY metadata prefix'),
        bytes: readyMetadataBytes.length,
        sha256: hash(readyMetadataBytes),
      },
      directCpuEdgeToPick: report.claims.directCpuEdgeToPick,
      callSiteAddress: report.mapping.callSiteAddress,
      directDestination: report.directCpuDestination,
      pickEntryStackCheck: report.pickEntryStackCheck,
      pickEntryCorrelation: report.pickEntryCorrelation,
      callContinuationGuard: report.callContinuationGuard,
      nativeMap: repoPath(resolve(root, 'native-code/mapped/native-code-map.json'), 'native map'),
    };
    assert(fsHash(resolve(root, 'native-code/mapped/native-code-map.json')) === report.mapping.nativeMapSha256,
      'observer live native map hash differs from debugger report');
  } else {
    assert(!summary.preSceneProbeSha256 && !summary.requiredProbeOutputName && !summary.requiredProbeOutputSha256 &&
      !summary.requiredProbeEndMarker && (summary.probeOutputNames ?? []).length === 0 &&
      (summary.preSceneProbePauseSeconds ?? 0) === 0,
    `${role}: control is not uninstrumented`);
  }

  return {
    role, runId, root: rootRepo, complete: summary.complete, mode: summary.mode, smallImage: summary.smallImage,
    runnerSha256: summary.runnerSha256, installerSha256: summary.installerSha256,
    summarySha256: summaryFile.sha256, runtime, aa0Header, artifacts, sources, planningTrace, metadata, debuggerResult,
  };
}
function fsHash(path) { return hash(readFileSync(path)); }

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tripletId = args['triplet-id'];
  assert(/^(?:premium-pick-(?:correlation|v[0-9]+)|prem-callsite-wide-v2|prem-v2)-[a-z0-9-]+$/u.test(tripletId), 'unexpected PICK/wide-window triplet ID');
  const comparisonOut = resolveRepoPath(args.out, 'comparison output');
  assert(args.overwrite || !existsSync(comparisonOut), 'comparison output exists; use --overwrite to replace it');
  const sourceMap = {};
  for (const [key, path] of Object.entries(CURRENT_SOURCES)) sourceMap[key] = record(resolveRepoPath(path, key), key);
  if (args['coordinator-capture-snapshot']) {
    const currentCoordinator = sourceMap.coordinator;
    const snapshot = record(resolveRepoPath(args['coordinator-capture-snapshot'], 'coordinator capture snapshot'), 'coordinator capture snapshot');
    sourceMap.coordinator = { ...snapshot, workspaceSha256: currentCoordinator.sha256 };
  }
  sourceMap.sceneSources = Object.fromEntries(SCENE_SOURCES.map(name => [name,
    record(resolveRepoPath(SCENE_SOURCE_PATHS[name], `scene source ${name}`), `scene source ${name}`)]));
  const manifest = jsonFile(resolveRepoPath(CURRENT_SOURCES.extractedManifest, 'manifest'), 'manifest').value;

  const runs = [
    buildRun('before', args['before-root'], tripletId, sourceMap, manifest),
    buildRun('observer', args['observer-root'], tripletId, sourceMap, manifest),
    buildRun('after', args['after-root'], tripletId, sourceMap, manifest),
  ];
  const before = runs[0]; const observer = runs[1]; const after = runs[2];
  assert(before.aa0Header === '768 1080 148' && runs.every(row => row.aa0Header === before.aa0Header),
    'triplet AA0 headers differ or canvas is unexpected');
  for (const name of ARTIFACTS) {
    assert(runs.every(row => row.artifacts[name].bytes === before.artifacts[name].bytes && row.artifacts[name].sha256 === before.artifacts[name].sha256),
      `fresh drawing/scene control mismatch: ${name}`);
  }
  for (const name of SCENE_SOURCES) {
    assert(runs.every(row => row.sources[name].sha256 === before.sources[name].sha256), `staged source mismatch: ${name}`);
  }
  assert(before.planningTrace.bytes === after.planningTrace.bytes && before.planningTrace.sha256 === after.planningTrace.sha256,
    'fresh uninstrumented before/after planning traces differ');
  assert(runs.every(row => row.runnerSha256 === before.runnerSha256 && row.installerSha256 === before.installerSha256),
    'runner/installer identities differ across triplet');
  for (const name of ['AARON.exe', 'AARON.pll']) {
    assert(runs.every(row => row.runtime[name].bytes === before.runtime[name].bytes && row.runtime[name].sha256 === before.runtime[name].sha256),
      `runtime identity differs across triplet: ${name}`);
  }

  const reportBytes = readFileSync(resolve(resolveRepoPath(args['observer-root'], 'observer root'),
    'capture/aaron-premium-callsite-pick-correlation-v2.txt'));
  const report = parseEnvelope(reportBytes.toString('utf8'), 'BEGIN premium-callsite-pick-correlation-v2',
    'END premium-callsite-pick-correlation-v2', 'observer debugger report');
  const sourceBindings = {};
  for (const [key, path] of Object.entries(CURRENT_SOURCES)) {
    sourceBindings[key] = { path, sha256: sourceMap[key].sha256 };
    if (key === 'coordinator' && args['coordinator-capture-snapshot']) {
      sourceBindings[key].captureSourceSnapshot = { path: sourceMap[key].path, sha256: sourceMap[key].sha256 };
      sourceBindings[key].currentWorkspaceSha256 = sourceMap[key].workspaceSha256;
    }
  }
  const comparison = {
    schemaVersion: 1,
    tripletId,
    mode: MODE,
    aa0Header: before.aa0Header,
    observerMethod: 'CLOS PREMIUM and PICK addresses were rediscovered from this READY pause; both complete compiled objects matched the current run PLL before a same-thread DR0 destination capture. A direct PICK destination is recorded at that event; otherwise same-thread DR0 PICK-entry and DR1 call-continuation guards are deferred from the destination pause.',
    sources: sourceBindings,
    controlsMatch: true,
    beforeAfterPlanningTraceMatch: true,
    debuggerResult: observer.debuggerResult,
    runs,
    diagnostics: repoPath(resolveRepoPath(args.diagnostics, 'diagnostic root'), 'diagnostic root'),
  };
  const serialized = `${JSON.stringify(comparison, null, 2)}\n`;
  writeFileSync(comparisonOut, serialized, { flag: args.overwrite ? 'w' : 'wx' });
  process.stdout.write(`${repoPath(comparisonOut, 'comparison output')}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; }
