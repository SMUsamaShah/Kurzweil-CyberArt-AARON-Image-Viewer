#!/usr/bin/env node

// Strict offline derivation for the saved PICK dispatch-slot triplet.
// Reads only saved files, never launches AARON, and writes portable evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_TRIPLET = 'research/extracted/local-oracle/pick-caller-triplet-v1-logs/pick-dispatch-v3-20261014-103044-d699903f/triplet-comparison.json';
const DEFAULT_OUTPUT = 'research/introspection/evidence/pick-dispatch-slot-20261014-v1.json';
const RUNNER = 'research/oracle/run-local-scene-state-required-probe.ps1';
const PROBE = 'research/introspection/pick-native-links.cl';
const TRIPLET_HELPER = 'research/tools/capture-pick-caller-triplet-v1.ps1';
const CAPTURE_HELPER = 'research/tools/capture-pick-caller.ps1';
const DEBUGGER_HELPER = 'research/oracle/AaronCallerBreakpoint.cs';
const SCENE_SOURCES = Object.freeze({
  'planning-call-trace.cl': 'research/introspection/planning-call-trace.cl',
  'planning-random-seed-common.cl': 'research/oracle/planning-random-seed-common.cl',
  'scene-state-snapshot-seeded-1234.cl': 'research/introspection/scene-state-snapshot-seeded-1234.cl',
  'scene-state-snapshot-writer-seeded-1234.cl': 'research/introspection/scene-state-snapshot-writer-seeded-1234.cl',
  'scene-state-snapshot-writer-stream-seeded-1234.cl': 'research/introspection/scene-state-snapshot-writer-stream-seeded-1234.cl',
  'scene-state-snapshot.cl': 'research/introspection/scene-state-snapshot.cl',
});
const DRAWING_SCENE_ARTIFACTS = Object.freeze({
  aa0: 'aa0',
  image: 'image',
  imageId: 'image-id',
  sceneSnapshot: 'aaron-scene-state-snapshot.txt',
  loadedRandomSeed: 'aaron-random-seed-loaded.txt',
});

const fail = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (path) => readFileSync(path);
const readJson = (path) => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/u, ''));
const toPortablePath = (path) => relative(ROOT, path).split(sep).join('/');
const isInsideRoot = (path) => {
  const rel = relative(ROOT, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`);
};
const samePath = (left, right) => resolve(left).toLowerCase() === resolve(right).toLowerCase();

function repoPath(path, label) {
  fail(typeof path === 'string' && path.length > 0, `${label}: missing path`);
  const absolute = isAbsolute(path) ? resolve(path) : resolve(ROOT, path);
  fail(isInsideRoot(absolute), `${label}: path escapes the repository`);
  return absolute;
}

function fingerprint(path) {
  const bytes = read(path);
  return { path: toPortablePath(path), bytes: bytes.length, sha256: sha256(bytes) };
}

function verifyRecord(record, path, label) {
  const actualPath = repoPath(path, label);
  const actual = fingerprint(actualPath);
  fail(record && typeof record === 'object', `${label}: no recorded file identity`);
  fail(samePath(repoPath(record.path, `${label} recorded`), actualPath), `${label}: recorded path differs`);
  fail(record.bytes === actual.bytes, `${label}: recorded byte count differs`);
  fail(record.sha256 === actual.sha256, `${label}: recorded SHA-256 differs`);
  return actual;
}

function verifyHash(expected, actual, label) {
  fail(typeof expected === 'string' && /^[0-9a-f]{64}$/iu.test(expected), `${label}: invalid recorded SHA-256`);
  fail(expected.toLowerCase() === actual.toLowerCase(), `${label}: SHA-256 differs`);
}

function address(value, label) {
  fail(typeof value === 'string' && /^0x[0-9a-f]{1,8}$/iu.test(value), `${label}: invalid 32-bit address`);
  return Number.parseInt(value.slice(2), 16);
}

function summarizeRun(run, role, runnerSha256) {
  fail(run?.role === role, `${role}: run role mismatch`);
  fail(run.complete === true, `${role}: triplet comparison does not mark the run complete`);
  const root = repoPath(run.root, `${role} root`);
  const summaryPath = resolve(root, 'summary.json');
  const summaryBytes = read(summaryPath);
  const summary = JSON.parse(summaryBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const summaryFile = fingerprint(summaryPath);

  fail(summary.runId === run.runId && summary.runId === root.split(sep).at(-1), `${role}: run ID/root mismatch`);
  fail(run.summarySha256 === summaryFile.sha256, `${role}: saved summary hash mismatch`);
  fail(run.summary?.runId === summary.runId && run.summary?.complete === summary.complete,
    `${role}: triplet comparison summary is not bound to the saved summary`);
  fail(summary.complete === true && summary.probeCompletionSatisfied === true,
    `${role}: runner summary is incomplete`);
  fail(summary.mode === 'writer-stream-seed-1234' && summary.smallImage === false,
    `${role}: unexpected scene mode or image size`);
  verifyHash(summary.runnerSha256, runnerSha256, `${role} runner`);
  fail(summary.startedAt && summary.finishedAt, `${role}: runner summary lacks completion timestamps`);

  const runtime = {};
  for (const name of ['AARON.exe', 'AARON.pll']) {
    const path = resolve(root, 'runtime', name);
    const actual = fingerprint(path);
    const recorded = run.runtime?.[name];
    fail(recorded && samePath(repoPath(recorded.path, `${role} ${name} recorded`), path),
      `${role}: ${name} path differs from triplet record`);
    fail(recorded.bytes === actual.bytes && recorded.sha256 === actual.sha256,
      `${role}: ${name} hash/size differs from triplet record`);
    runtime[name] = actual;
  }

  const artifacts = {};
  for (const [key, name] of Object.entries(DRAWING_SCENE_ARTIFACTS)) {
    const path = resolve(root, 'capture', name);
    artifacts[key] = verifyRecord(run.artifacts?.[name], path, `${role} artifact ${name}`);
  }
  verifyHash(summary.aa0Sha256, artifacts.aa0.sha256, `${role} summary AA0`);
  verifyHash(summary.sceneReportSha256, artifacts.sceneSnapshot.sha256, `${role} summary scene snapshot`);

  const sceneSources = {};
  for (const name of Object.keys(SCENE_SOURCES)) {
    const path = resolve(root, 'capture', name);
    sceneSources[name] = verifyRecord(run.sources?.[name], path, `${role} Lisp source ${name}`);
  }

  const tracePath = resolve(root, 'capture', 'aaron-planning-call-trace.txt');
  const trace = verifyRecord(run.planningTrace, tracePath, `${role} planning trace`);
  const aa0Header = read(resolve(root, 'capture', 'aa0')).toString('ascii').split(/\r?\n/u, 1)[0];
  fail(aa0Header === run.aa0Header,
    `${role}: AA0 header differs from saved triplet records`);

  if (role === 'observer') {
    fail(run.observerProbe && run.pickDispatchSlotCapture, 'observer: missing captured probe/report records');
    fail(summary.preSceneProbeSha256 && summary.requiredProbeEndMarker === 'END pick-native-links',
      'observer: missing required probe binding or END marker');
  } else {
    fail(run.observerProbe === null && run.pickDispatchSlotCapture === null,
      `${role}: control contains observer-only capture records`);
    fail(summary.preSceneProbeSha256 === null && summary.probeOutputNames.length === 0
      && summary.preSceneProbePauseSeconds === 0 && (summary.requiredProbeOutputName ?? '') === ''
      && (summary.requiredProbeEndMarker ?? '') === '', `${role}: expected an uninstrumented no-probe control`);
  }

  return { root, summary, summaryFile, runtime, artifacts, sceneSources, trace, aa0Header };
}

function main() {
  const args = process.argv.slice(2);
  const overwrite = args.includes('--overwrite');
  const positional = args.filter((arg) => arg !== '--overwrite');
  fail(positional.length <= 2, 'Usage: node derive-pick-dispatch-slot-evidence.mjs [output.json] [triplet-comparison.json] [--overwrite]');

  const outputPath = repoPath(positional[0] ?? DEFAULT_OUTPUT, 'output');
  const tripletPath = repoPath(positional[1] ?? DEFAULT_TRIPLET, 'triplet comparison');
  fail(!existsSync(outputPath) || overwrite, `Output exists; pass --overwrite to replace ${toPortablePath(outputPath)}`);

  const tripletBytes = read(tripletPath);
  const triplet = JSON.parse(tripletBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  fail(triplet.schemaVersion === 1 && triplet.tripletId === 'pick-dispatch-v3-20261014-103044-d699903f',
    'Unexpected PICK dispatch-slot triplet identity/schema');
  fail(triplet.mode === 'writer-stream-seed-1234', 'Unexpected triplet scene mode');
  for (const name of ['allRunsComplete', 'observerReadyCompleteEndSourceBound', 'artifactsMatch',
    'sixStagedSourcesMatch', 'uninstrumentedControlTraceMatch', 'schemaVersion3DispatchSlotCaptured',
    'ediRelativeSlotReadValidated']) {
    fail(triplet.checks?.[name] === true, `Triplet comparison check failed: ${name}`);
  }

  const runnerPath = repoPath(RUNNER, 'runner source');
  const runner = fingerprint(runnerPath);
  verifyHash(triplet.runnerSha256, runner.sha256, 'triplet runner source');

  const preflightPath = repoPath(triplet.powershellPreflight.reportPath, 'PowerShell preflight report');
  const preflight = readJson(preflightPath);
  const preflightFile = fingerprint(preflightPath);
  verifyHash(triplet.powershellPreflight.reportSha256, preflightFile.sha256, 'PowerShell preflight report');
  fail(preflight.schemaVersion === 1 && preflight.status === 'ok' && preflight.preflightOnly === true,
    'PowerShell preflight did not complete successfully');
  fail(preflight.runId === `${triplet.tripletId}-preflight` && preflight.getFileHashCommand === 'Get-FileHash',
    'PowerShell preflight identity differs');
  verifyHash(preflight.runnerSha256, runner.sha256, 'preflight runner');
  fail(preflight.powershellVersion === triplet.powershellPreflight.result.powershellVersion
    && preflight.utilityModuleSha256 === triplet.powershellPreflight.result.utilityModuleSha256,
  'Preflight report content differs from triplet comparison');

  const probePath = repoPath(PROBE, 'PICK metadata probe source');
  const probe = fingerprint(probePath);
  verifyHash(triplet.probeSha256, probe.sha256, 'triplet probe source');
  const tripletHelper = fingerprint(repoPath(TRIPLET_HELPER, 'triplet helper source'));
  verifyHash(triplet.tripletHelperSha256, tripletHelper.sha256, 'triplet helper source');
  const captureHelper = fingerprint(repoPath(CAPTURE_HELPER, 'PICK capture helper source'));
  verifyHash(triplet.captureHelperSha256, captureHelper.sha256, 'PICK capture helper source');
  const debuggerHelper = fingerprint(repoPath(DEBUGGER_HELPER, 'debugger helper source'));
  verifyHash(triplet.debuggerHelperSha256, debuggerHelper.sha256, 'debugger helper source');

  const mapPath = repoPath(triplet.mapPath, 'native-code map');
  const map = readJson(mapPath);
  const mapFile = fingerprint(mapPath);
  verifyHash(triplet.mapSha256, mapFile.sha256, 'native-code map');
  const mapManifestPath = resolve(dirname(mapPath), '..', 'manifest.json');
  const mapManifest = readJson(mapManifestPath);
  const mapManifestFile = fingerprint(mapManifestPath);
  verifyHash(map.captureManifestSha256, mapManifestFile.sha256, 'native-code capture manifest');

  fail(Array.isArray(triplet.runs) && triplet.runs.length === 3, 'Triplet must contain exactly three runs');
  const runs = [
    summarizeRun(triplet.runs[0], 'before', runner.sha256),
    summarizeRun(triplet.runs[1], 'observer', runner.sha256),
    summarizeRun(triplet.runs[2], 'after', runner.sha256),
  ];
  const [before, observer, after] = runs;
  const summaries = [before, observer, after];

  for (const field of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'runnerSha256']) {
    fail(before.summary[field] === observer.summary[field] && observer.summary[field] === after.summary[field],
      `Triplet run setup differs for ${field}`);
  }
  for (const name of ['AARON.exe', 'AARON.pll']) {
    const expected = before.runtime[name];
    fail(summaries.every((item) => item.runtime[name].sha256 === expected.sha256
      && item.runtime[name].bytes === expected.bytes), `Triplet runtime differs for ${name}`);
  }
  fail(before.aa0Header === observer.aa0Header && observer.aa0Header === after.aa0Header
    && before.aa0Header === triplet.aa0Header, 'Triplet AA0 header differs');
  const dimensions = /^([0-9]+)\s+([0-9]+)\s+([0-9]+)$/u.exec(before.aa0Header);
  fail(dimensions, 'Malformed AA0 dimensions header');

  const artifactMatches = Object.keys(DRAWING_SCENE_ARTIFACTS).map((key) => {
    const first = before.artifacts[key];
    fail(observer.artifacts[key].sha256 === first.sha256 && after.artifacts[key].sha256 === first.sha256
      && observer.artifacts[key].bytes === first.bytes && after.artifacts[key].bytes === first.bytes,
    `Before/observer/after drawing or scene artifact differs: ${key}`);
    return { name: key, ...first, matchesBeforeObserverAfter: true };
  });

  const lispSourceMatches = Object.entries(SCENE_SOURCES).map(([name, sourcePath]) => {
    const original = fingerprint(repoPath(sourcePath, `current Lisp source ${name}`));
    const first = before.sceneSources[name];
    fail(original.sha256 === first.sha256 && original.bytes === first.bytes
      && observer.sceneSources[name].sha256 === first.sha256
      && after.sceneSources[name].sha256 === first.sha256
      && observer.sceneSources[name].bytes === first.bytes
      && after.sceneSources[name].bytes === first.bytes,
    `Staged/current Lisp source differs: ${name}`);
    return { name, currentSource: original, stagedBefore: first, matchesAllRunsAndCurrentSource: true };
  });

  fail(before.trace.sha256 === after.trace.sha256 && before.trace.bytes === after.trace.bytes,
    'Uninstrumented before/after planning traces differ');
  fail(observer.trace.sha256 === before.trace.sha256 && observer.trace.bytes === before.trace.bytes,
    'Observer planning trace differs from the uninstrumented controls');
  const controls = {
    runs: summaries.map((item, index) => ({
      role: ['before', 'observer', 'after'][index],
      runId: item.summary.runId,
      complete: item.summary.complete,
      startedAt: item.summary.startedAt,
      finishedAt: item.summary.finishedAt,
      summary: item.summaryFile,
      runtime: item.runtime,
    })),
    fiveDrawingAndSceneArtifacts: artifactMatches,
    sixLispSources: lispSourceMatches,
    uninstrumentedPlanningTrace: {
      before: before.trace,
      after: after.trace,
      observer: observer.trace,
      beforeAfterMatch: true,
      observerMatchesControls: true,
    },
    aa0Dimensions: { width: Number(dimensions[1]), height: Number(dimensions[2]), thirdValue: Number(dimensions[3]) },
  };

  const observerRun = triplet.runs[1];
  const observerRoot = observer.root;
  const requestPath = resolve(observerRoot, 'pre-scene-probe-request.json');
  const request = readJson(requestPath);
  const requestFile = fingerprint(requestPath);
  const stagedProbePath = resolve(observerRoot, 'capture', 'aaron-pre-scene-probe.cl');
  const stagedProbe = fingerprint(stagedProbePath);
  verifyHash(stagedProbe.sha256, probe.sha256, 'staged observer probe source');
  fail(request.schemaVersion === 1 && request.runId === observerRun.runId
    && request.requiredProbeOutputName === 'aaron-pick-native-links.txt'
    && request.requiredProbeEndMarker === 'END pick-native-links'
    && request.probeOutputNames.length === 1 && request.probeOutputNames[0] === 'aaron-pick-native-links.txt'
    && request.pauseSeconds === 90,
  'Observer request is not the expected source-bound 90-second PICK capture');
  verifyHash(request.probeSha256, probe.sha256, 'observer request probe source');
  verifyHash(request.runnerSha256, runner.sha256, 'observer request runner');
  verifyHash(observer.summary.preSceneProbeSha256, probe.sha256, 'observer summary probe source');

  const metadataPath = repoPath(observerRun.observerProbe.path, 'observer metadata output');
  const metadataBytes = read(metadataPath);
  const metadata = metadataBytes.toString('utf8');
  const metadataFile = verifyRecord(observerRun.observerProbe, metadataPath, 'observer metadata output');
  verifyHash(observer.summary.requiredProbeOutputSha256, metadataFile.sha256, 'observer summary metadata output');
  fail(observer.summary.probeCompletionSatisfied === true
    && observer.summary.requiredProbeOutputName === 'aaron-pick-native-links.txt'
    && observer.summary.requiredProbeEndMarker === 'END pick-native-links',
  'Observer runner summary does not bind the required metadata END marker');
  const metadataLines = metadata.split(/\r?\n/u);
  const summaryMarker = metadataLines.filter((line) => line.startsWith('SUMMARY '));
  const exactMarkers = [
    'BEGIN pick-native-links',
    'SUMMARY bindings=1347 compiled-scanned=1380 references=9 metadata-functions=11 errors=0 truncated=0',
    'READY pick-native-links',
    'NATIVE-CAPTURE-WAIT released=T',
    'END pick-native-links',
  ];
  fail(metadataLines[0] === exactMarkers[0] && summaryMarker.length === 1
    && summaryMarker[0] === exactMarkers[1] && metadataLines.includes(exactMarkers[2])
    && metadataLines.includes(exactMarkers[3]) && metadataLines.at(-2) === exactMarkers[4],
  'Observer metadata does not contain the exact ordered BEGIN/SUMMARY/READY/released/END markers');
  fail(exactMarkers.every((marker) => metadataLines.filter((line) => line === marker).length === 1),
    'Observer metadata marker lines are not unique');
  const markerIndexes = exactMarkers.map((marker) => metadataLines.indexOf(marker));
  fail(markerIndexes.every((index, i) => index >= 0 && (i === 0 || index > markerIndexes[i - 1])),
    'Observer metadata markers are missing, duplicated, or out of order');

  const reportPath = repoPath(observerRun.pickDispatchSlotCapture.report.path, 'schema-v3 dispatch-slot report');
  const reportBytes = read(reportPath);
  const report = JSON.parse(reportBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const reportFile = fingerprint(reportPath);
  verifyRecord(observerRun.pickDispatchSlotCapture.report, reportPath, 'schema-v3 dispatch-slot report');
  fail(report.schemaVersion === 3 && report.targetFunction === 'PICK' && report.outcome === 'entry-hit'
    && report.oracleRunId === observerRun.runId && report.expectedMode === triplet.mode,
  'Observer report is not a schema-v3 PICK entry hit for this triplet');
  fail(observerRun.pickDispatchSlotCapture.schemaVersion === 3
    && observerRun.pickDispatchSlotCapture.outcome === report.outcome
    && observerRun.pickDispatchSlotCapture.captureDispatchSlot === true,
  'Triplet comparison does not record the schema-v3 dispatch-slot capture');
  const helper = triplet.observerHelperProcess;
  fail(helper?.exitCode === 0 && helper.captureDispatchSlot === true,
    'Observer capture helper did not complete the dispatch-slot capture');
  const stdoutPath = repoPath(helper.stdout, 'observer helper stdout');
  const stderrPath = repoPath(helper.stderr, 'observer helper stderr');
  const helperStdout = readJson(stdoutPath);
  const helperStderrBytes = read(stderrPath);
  assert.deepStrictEqual(helperStdout, report, 'Observer helper stdout report differs from the saved schema-v3 report');
  fail(helperStderrBytes.length === 0, 'Observer helper wrote unexpected stderr output');

  const nativeMap = map;
  verifyHash(report.sourceProbeSha256, probe.sha256, 'schema-v3 report source probe');
  verifyHash(report.stagedProbeSha256, stagedProbe.sha256, 'schema-v3 report staged probe');
  verifyHash(report.runnerSha256, runner.sha256, 'schema-v3 report runner');
  verifyHash(report.requestSha256, requestFile.sha256, 'schema-v3 report request');
  verifyHash(report.sourceMapSha256, mapFile.sha256, 'schema-v3 report native map');
  verifyHash(report.mapCaptureManifestSha256, mapManifestFile.sha256, 'schema-v3 report map manifest');
  verifyHash(report.captureHelperSha256, captureHelper.sha256, 'schema-v3 report capture helper');
  verifyHash(report.debuggerHelperSha256, debuggerHelper.sha256, 'schema-v3 report debugger helper');
  verifyHash(report.currentPllSha256, observer.runtime['AARON.pll'].sha256, 'schema-v3 report runtime PLL');
  const readyMarkerBytes = Buffer.from('READY pick-native-links', 'utf8');
  const readyMarkerOffset = metadataBytes.indexOf(readyMarkerBytes);
  fail(readyMarkerOffset >= 0, 'Observer metadata has no raw READY marker bytes');
  const readyLineEnd = metadataBytes.indexOf(0x0a, readyMarkerOffset + readyMarkerBytes.length);
  fail(readyLineEnd >= 0, 'Observer READY marker has no complete line ending');
  const readyPrefixSha256 = sha256(metadataBytes.subarray(0, readyLineEnd + 1));
  verifyHash(report.metadataSha256, readyPrefixSha256, 'schema-v3 report READY-prefix metadata');

  const pllPath = resolve(observerRoot, 'runtime', 'AARON.pll');
  const pllBytes = read(pllPath);
  const mappedFunctions = nativeMap.functions;
  fail(Array.isArray(mappedFunctions) && mappedFunctions.length === 11
    && Array.isArray(report.liveFunctions) && report.liveFunctions.length === mappedFunctions.length,
  'PICK native map/live report does not contain the expected 11 validated entries');
  const runtimeBases = new Set();
  for (const fn of mappedFunctions) {
    const live = report.liveFunctions.find((item) => item.name === fn.name);
    fail(live && fn.uniqueCompleteObjectByteMatch === true && live.exactPllObjectMatch === true
      && live.exactCurrentLivePayloadMatch === true && live.entry === fn.runtime.entry
      && live.payloadBytes === fn.payloadBytes && live.payloadSha256 === fn.payloadSha256,
    `Mapped/live function evidence differs for ${fn.name}`);
    fail(live.pllObjectOffset === fn.pll.objectOffset && live.pllPayloadOffset === fn.pll.payloadOffset,
      `Mapped/live PLL offsets differ for ${fn.name}`);
    const offset = fn.pll.payloadOffset;
    const payload = pllBytes.subarray(offset, offset + fn.payloadBytes);
    fail(payload.length === fn.payloadBytes && sha256(payload) === fn.payloadSha256,
      `Current PLL payload differs from mapped bytes for ${fn.name}`);
    runtimeBases.add(address(fn.runtime.entry, `${fn.name} live entry`) - offset);
  }
  fail(runtimeBases.size === 1, 'Live mapped functions do not share one current runtime/PLL address base');
  const runtimeBase = [...runtimeBases][0];
  const pickMap = mappedFunctions.find((fn) => fn.name === 'PICK');
  const pickLive = report.liveFunctions.find((fn) => fn.name === 'PICK');
  fail(pickMap && pickLive && report.hit?.entry === pickLive.entry
    && report.hit?.eip === pickLive.entry && report.hit?.firstChance === 1,
  'Captured entry does not match the live-validated PICK entry');
  const pickPayloadOffset = pickMap.pll.payloadOffset;
  const pickPayload = pllBytes.subarray(pickPayloadOffset, pickPayloadOffset + pickMap.payloadBytes);
  fail(pickLive.exactPllObjectMatch === true && pickLive.exactCurrentLivePayloadMatch === true
    && pickLive.payloadSha256 === sha256(pickPayload), 'Live PICK entry payload does not match the current PLL');

  const callSite = report.immediateCallSite;
  const callRuntimeAddress = address(callSite.address, 'immediate call site');
  const returnAddress = address(callSite.returnAddress, 'immediate return address');
  fail(returnAddress === address(report.hit.returnAddress, 'PICK hit return address')
    && returnAddress === callRuntimeAddress + 3
    && callRuntimeAddress - runtimeBase === callSite.pllOffset
    && callRuntimeAddress === address(report.hit.immediateCallSiteAddress, 'hit call site address'),
  'Immediate return/call-site addresses do not agree with the shared live/PLL address base');
  const callBytes = pllBytes.subarray(callSite.pllOffset, callSite.pllOffset + 3);
  const callBytesHex = callBytes.toString('hex');
  fail(callBytes.length === 3 && callBytesHex === callSite.pllBytesHex
    && callBytesHex === callSite.liveBytesHex && callBytesHex === report.hit.immediateCallSiteBytesHex
    && callSite.matchesCurrentPll === true && callBytesHex === 'ff5727',
  'Measured return-callsite bytes do not match the current PLL bytes');

  const slot = report.ediRelativeSlotRead;
  const slotAddress = address(slot.address, 'EDI-relative slot address');
  const ediBase = address(slot.baseValue, 'EDI base value');
  const offsetValue = Number.parseInt(slot.offset, 16);
  const observedDword = Buffer.from(slot.bytesHex, 'hex').readUInt32LE(0);
  const observedDwordFromReport = address(slot.targetValue, 'observed slot dword');
  fail(slot.baseRegister === 'EDI' && /^0x0*27$/iu.test(slot.offset)
    && slotAddress === ediBase + offsetValue
    && slot.bytesHex === report.hit.ediRelativeSlotRead?.bytesHex
    && observedDword === observedDwordFromReport
    && slot.targetMatchesPickEntry === (observedDword === address(pickLive.entry, 'live PICK entry'))
    && slot.targetMatchesPickEntry === false
    && slot.capturedAtPickEntryBeforePrologue === true
    && slot.liveCallSite?.address === callSite.address
    && slot.liveCallSite?.returnAddress === callSite.returnAddress
    && slot.liveCallSite?.pllOffset === callSite.pllOffset,
  'EDI+0x27 raw slot read does not match the saved PICK hit/call-site evidence');
  fail(report.hit.ediRelativeSlotRead?.targetMatchesHitEntry === slot.targetMatchesPickEntry,
    'Hit-level EDI+0x27 comparison differs from the schema-v3 report');

  const evidence = {
    schemaVersion: 1,
    status: 'observed-bounded-pick-dispatch-slot',
    tripletId: triplet.tripletId,
    scope: 'One source-bound writer-stream-seed-1234 EDI+0x27 dword read at a captured PICK entry; it is not a pre-CALL slot sample, and no function-name attribution or JavaScript contract is asserted.',
    sourceHashes: {
      tripletComparison: fingerprint(tripletPath),
      powershellPreflight: preflightFile,
      runner,
      metadataProbe: probe,
      nativeCodeMap: mapFile,
      mapCaptureManifest: mapManifestFile,
      tripletCaptureHelper: tripletHelper,
      pickCaptureHelper: captureHelper,
      debuggerHelper,
    },
    preflight: {
      status: preflight.status,
      preflightOnly: preflight.preflightOnly,
      powershellVersion: preflight.powershellVersion,
      is64BitProcess: preflight.is64BitProcess,
      utilityModuleSha256: preflight.utilityModuleSha256,
      getFileHashCommand: preflight.getFileHashCommand,
      runnerSha256: preflight.runnerSha256,
    },
    controls,
    observer: {
      runId: observer.summary.runId,
      complete: observer.summary.complete,
      mode: observer.summary.mode,
      summary: observer.summaryFile,
      probeSource: probe,
      stagedProbe,
      request: requestFile,
      metadataOutput: metadataFile,
      reportReadyPrefixSha256: readyPrefixSha256,
      exactMetadataMarkerLines: exactMarkers,
      helperProcess: {
        exitCode: helper.exitCode,
        captureDispatchSlot: helper.captureDispatchSlot,
        stdout: fingerprint(stdoutPath),
        stderr: fingerprint(stderrPath),
      },
      report: {
        ...reportFile,
        schemaVersion: report.schemaVersion,
        outcome: report.outcome,
        targetFunction: report.targetFunction,
      },
      livePickEntry: {
        address: pickLive.entry,
        payloadBytes: pickLive.payloadBytes,
        payloadSha256: pickLive.payloadSha256,
        pllPayloadOffset: pickLive.pllPayloadOffset,
        exactPllObjectMatch: pickLive.exactPllObjectMatch,
        exactCurrentLivePayloadMatch: pickLive.exactCurrentLivePayloadMatch,
      },
      returnCallsite: {
        runtimeAddress: callSite.address,
        returnAddress: callSite.returnAddress,
        pllFileOffset: callSite.pllOffset,
        liveBytesHex: callSite.liveBytesHex,
        pllBytesHex: callBytesHex,
        matchesCurrentPll: true,
        encoding: callSite.encoding,
      },
      ediPlus27SlotRead: {
        baseRegister: 'EDI',
        baseValue: slot.baseValue,
        offset: '0x27',
        address: slot.address,
        bytesHex: slot.bytesHex,
        rawSlotDword: slot.targetValue,
        targetMatchesPickEntry: slot.targetMatchesPickEntry,
        capturedAtPickEntryBeforePrologue: slot.capturedAtPickEntryBeforePrologue,
      },
    },
    limitations: [
      'This is one bounded source-bound runtime slot observation and does not establish a general call graph.',
      'The EDI+0x27 dword was read at PICK entry, after the caller CALL; it is not proven to equal the slot operand the caller read because EDI may change before PICK entry.',
      'The matched CALL bytes identify the return call-site encoding; they do not resolve the value read at PICK entry to a function or prove that value was the caller destination.',
      'The evidence does not establish a JavaScript behavior contract or whole-scene parity.',
    ],
  };

  const output = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(outputPath, output, 'utf8');
  const written = read(outputPath).toString('utf8');
  fail(written === output, 'Evidence output did not round-trip byte-for-byte');
  console.log(JSON.stringify({
    output: toPortablePath(outputPath),
    sha256: sha256(Buffer.from(output, 'utf8')),
    fiveArtifacts: artifactMatches.length,
    sixLispSources: lispSourceMatches.length,
    completeRuns: controls.runs.every((run) => run.complete),
    observerMarkers: exactMarkers,
    slot: evidence.observer.ediPlus27SlotRead,
    callsiteBytesMatchPll: evidence.observer.returnCallsite.matchesCurrentPll,
  }, null, 2));
}

main();
