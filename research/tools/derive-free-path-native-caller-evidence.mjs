#!/usr/bin/env node

// Offline evidence derivation for one bounded FREE-PATH native caller capture.
// This reads archived triplet/map artifacts only; it never launches AARON.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TRIPLET_ID = 'free-path-caller-20261013-231321-ef4d1afe';
const RUN_BASE = 'research/extracted/local-oracle/external-runs';
const DEFAULT_RUNS = Object.freeze({
  before: `${RUN_BASE}/${TRIPLET_ID}-before`,
  observer: `${RUN_BASE}/${TRIPLET_ID}-observer`,
  after: `${RUN_BASE}/${TRIPLET_ID}-after`,
});
const DEFAULT_LOGS = `research/extracted/local-oracle/caller-triplet-logs/${TRIPLET_ID}`;
const DEFAULT_MAP = `${RUN_BASE}/freepath-caller-map-20261013-f/native-code/mapped/native-code-map.json`;
const DEFAULT_OUTPUT = 'research/introspection/evidence/free-path-native-caller-20261014.json';
const RUNNER_PATH = 'research/oracle/run-local-scene-state-required-probe.ps1';
const MANIFEST_PATH = 'research/extracted/aaron/manifest.json';
const ARCHIVE_EXE = 'research/extracted/aaron/application/AARON.exe';
const ARCHIVE_PLL = 'research/extracted/aaron/application/AARON.pll';
const CALLER_HELPER = 'research/tools/capture-free-path-caller.ps1';
const TRIPLET_HELPER = 'research/tools/capture-free-path-caller-triplet.ps1';
const DEBUGGER_HELPER = 'research/oracle/AaronCallerBreakpoint.cs';
const PROBE_SOURCE = 'research/introspection/free-path-caller-native-links.cl';
const MAP_CAPTURE_ROOT = `${RUN_BASE}/freepath-caller-map-20261013-f/native-code`;
const ARTIFACT_NAMES = Object.freeze([
  'aa0',
  'image',
  'image-id',
  'aaron-scene-state-snapshot.txt',
  'aaron-random-seed-loaded.txt',
]);
const SOURCE_PATHS = Object.freeze({
  'planning-call-trace.cl': 'research/introspection/planning-call-trace.cl',
  'planning-random-seed-common.cl': 'research/oracle/planning-random-seed-common.cl',
  'scene-state-snapshot-seeded-1234.cl': 'research/introspection/scene-state-snapshot-seeded-1234.cl',
  'scene-state-snapshot-writer-seeded-1234.cl': 'research/introspection/scene-state-snapshot-writer-seeded-1234.cl',
  'scene-state-snapshot-writer-stream-seeded-1234.cl': 'research/introspection/scene-state-snapshot-writer-stream-seeded-1234.cl',
  'scene-state-snapshot.cl': 'research/introspection/scene-state-snapshot.cl',
});
const EXPECTED_FUNCTIONS = Object.freeze(['FREE-PATH', 'DRAW-CFORM']);
const READY_MARKER = 'READY free-path-caller-native-links';
const WAIT_MARKER = 'NATIVE-CAPTURE-WAIT released=T';
const END_MARKER = 'END free-path-caller-native-links';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = path => readFileSync(path);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = path => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/u, ''));
const relativePath = path => relative(ROOT, path).split(sep).join('/');
const resolveRepo = value => resolve(ROOT, value);
const pathInsideRoot = path => {
  const value = relative(ROOT, path);
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`);
};
const record = path => {
  const bytes = read(path);
  return { path: relativePath(path), bytes: bytes.length, sha256: sha256(bytes) };
};
const sameResolvedPath = (a, b) => resolve(ROOT, a).toLowerCase() === resolve(ROOT, b).toLowerCase();
const hexAddress = value => {
  assert(typeof value === 'string' && /^0x[0-9a-f]{1,8}$/iu.test(value), `Invalid 32-bit address: ${value}`);
  return BigInt(value);
};
const addressString = value => `0x${value.toString(16).padStart(8, '0')}`;

function countOccurrences(haystack, needle) {
  assert(needle.length > 0, 'Cannot count an empty byte sequence');
  let count = 0;
  let offset = 0;
  while (offset <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, offset);
    if (found < 0) break;
    count += 1;
    offset = found + 1;
  }
  return count;
}

function summarizeRun(rootRel, role, manifest, runnerHash, archiveFiles) {
  const root = resolveRepo(rootRel);
  assert(pathInsideRoot(root), `${role}: run root escapes the repository`);
  const summaryPath = resolve(root, 'summary.json');
  const summaryBytes = read(summaryPath);
  const summary = readJson(summaryPath);
  const runId = basename(root);
  assert(summary.runId === runId, `${role}: summary run ID differs from its directory`);
  assert(summary.complete === true && summary.mode === 'writer-stream-seed-1234'
    && summary.smallImage === false && summary.probeCompletionSatisfied === true
    && summary.runnerSha256 === runnerHash,
  `${role}: run is incomplete or bound to a different runner/mode`);
  assert(summary.installerSha256 === manifest.source.sha256,
    `${role}: installer hash differs from the extracted-runtime manifest`);

  const runtime = {};
  for (const name of ['AARON.exe', 'AARON.pll']) {
    const path = resolve(root, 'runtime', name);
    const bytes = read(path);
    const digest = sha256(bytes);
    const expected = archiveFiles[name];
    assert(bytes.length === expected.bytes && digest === expected.sha256,
      `${role}: runtime ${name} differs from the extracted manifest`);
    runtime[name] = { path: relativePath(path), bytes: bytes.length, sha256: digest };
  }

  const artifacts = Object.fromEntries(ARTIFACT_NAMES.map(name => {
    const artifact = record(resolve(root, 'capture', name));
    return [name, artifact];
  }));
  assert(summary.aa0Sha256 === artifacts.aa0.sha256,
    `${role}: summary AA0 hash differs from captured AA0`);
  assert(summary.sceneReportSha256 === artifacts['aaron-scene-state-snapshot.txt'].sha256,
    `${role}: summary scene-report hash differs from captured report`);
  const aa0Header = read(resolve(root, 'capture/aa0')).toString('ascii').split(/\r?\n/u, 1)[0];
  const dimensions = /^(\d+)\s+(\d+)\s+(\d+)$/u.exec(aa0Header);
  assert(dimensions && Number(dimensions[1]) === 320 && Number(dimensions[2]) === 480
    && Number(dimensions[3]) === 148,
  `${role}: expected the triplet's 320x480 AA0 header`);

  const stagedSources = Object.fromEntries(Object.keys(SOURCE_PATHS).map(name => [name,
    record(resolve(root, 'capture', name))]));
  const planningTrace = record(resolve(root, 'capture/aaron-planning-call-trace.txt'));
  const planningTraceText = read(resolve(root, 'capture/aaron-planning-call-trace.txt')).toString('utf8');
  return {
    root,
    summary,
    artifactPaths: Object.fromEntries(ARTIFACT_NAMES.map(name => [name, resolve(root, 'capture', name)])),
    sourcePaths: Object.fromEntries(Object.keys(SOURCE_PATHS).map(name => [name, resolve(root, 'capture', name)])),
    planningTracePath: resolve(root, 'capture/aaron-planning-call-trace.txt'),
    row: {
      runId,
      role,
      path: relativePath(root),
      complete: summary.complete,
      mode: summary.mode,
      smallImage: summary.smallImage,
      preSceneProbeSha256: summary.preSceneProbeSha256 ?? null,
      probeOutputNames: summary.probeOutputNames,
      preSceneProbePauseSeconds: summary.preSceneProbePauseSeconds,
      requiredProbeOutputName: summary.requiredProbeOutputName,
      requiredProbeEndMarker: summary.requiredProbeEndMarker,
      probeCompletionSatisfied: summary.probeCompletionSatisfied,
      installerSha256: summary.installerSha256,
      registryPatchSha256: summary.registryPatchSha256,
      licensePatchSha256: summary.licensePatchSha256,
      runnerSha256: summary.runnerSha256,
      summary: { path: relativePath(summaryPath), bytes: summaryBytes.length, sha256: sha256(summaryBytes) },
      runtime,
      aa0Header: { width: Number(dimensions[1]), height: Number(dimensions[2]), thirdValue: Number(dimensions[3]) },
      artifacts,
      stagedSources,
      planningTrace,
      planningTraceExplicitlyUnwrapsFreePath: planningTraceText.includes('UNWRAPPED-TARGETS ("FREE-PATH")'),
    },
  };
}

function parseReadyHeaders(metadataText) {
  const normalized = metadataText.replace(/\r\n/gu, '\n');
  assert(!normalized.includes('\r') && normalized.endsWith('\n'),
    'Observer metadata has mixed line endings or no complete final record');
  const lines = normalized.slice(0, -1).split('\n');
  assert(lines.length === 13
    && lines[0] === 'BEGIN free-path-caller-native-links'
    && lines[1] === 'INSTALL targets=2 mode=READ-ONLY-METADATA'
    && lines[2] === 'FUNCTION name="FREE-PATH" type=COMPILED-FUNCTION'
    && lines[4] === 'FUNCTION name="DRAW-CFORM" type=COMPILED-FUNCTION'
    && lines[6] === 'TOTALS targets=2 functions=2 headers=2 errors=0 truncations=0'
    && lines[7] === 'ERROR-COUNT 0'
    && lines[8] === 'TRUNCATION-COUNT 0'
    && lines[9] === READY_MARKER
    && lines[10] === WAIT_MARKER
    && lines[11] === 'COMPLETE free-path-caller-native-links'
    && lines[12] === END_MARKER,
  'Observer metadata is not the complete, error-free READY/COMPLETE/END pair report');
  assert(!/^ERROR /mu.test(normalized) && !/^TRUNCATION /mu.test(normalized),
    'Observer metadata contains an error or truncation record');

  const headers = {};
  for (const lineIndex of [3, 5]) {
    const match = /^HEADER name="(FREE-PATH|DRAW-CFORM)" bytes=([0-9a-f]{128})$/iu.exec(lines[lineIndex]);
    assert(match, `Malformed function header at metadata record ${lineIndex}`);
    const name = match[1];
    assert(!headers[name], `Duplicate metadata header for ${name}`);
    const bytes = Buffer.from(match[2], 'hex');
    headers[name] = {
      name,
      headerHex: match[2].toLowerCase(),
      entry: addressString(BigInt(bytes.readUInt32LE(18))),
    };
  }
  assert(Object.keys(headers).length === EXPECTED_FUNCTIONS.length
    && EXPECTED_FUNCTIONS.every(name => headers[name]),
  'Observer metadata does not contain exactly FREE-PATH and DRAW-CFORM');
  return { normalized, lines, headers };
}

function deriveFunctionIdentities({ map, captureManifest, captureRoot, pllBytes, mapPath, liveReport, mappedReport, readyHeaders }) {
  assert(map.schemaVersion === 1 && Array.isArray(map.functions)
    && map.functions.length === EXPECTED_FUNCTIONS.length,
  'Unexpected native code map schema or function set');
  assert(captureManifest.schemaVersion === 1 && Array.isArray(captureManifest.functions)
    && captureManifest.functions.length === EXPECTED_FUNCTIONS.length,
  'Native capture manifest is incomplete or has an unexpected function set');
  assert(Array.isArray(liveReport) && Array.isArray(mappedReport)
    && liveReport.length === EXPECTED_FUNCTIONS.length && mappedReport.length === EXPECTED_FUNCTIONS.length,
  'Caller report does not contain exactly two mapped and live function identities');

  const functions = EXPECTED_FUNCTIONS.map(name => {
    const mapping = map.functions.find(item => item.name === name);
    const captured = captureManifest.functions.find(item => item.name === name);
    const mappedLive = mappedReport.find(item => item.name === name);
    const live = liveReport.find(item => item.name === name);
    assert(mapping && captured && mappedLive && live,
      `${name}: missing from map, capture manifest, or live caller report`);
    const entry = mapping.runtime?.entry;
    const objectOffset = mapping.pll?.objectOffset;
    const payloadOffset = mapping.pll?.payloadOffset;
    const objectBytes = mapping.objectBytes;
    const payloadBytes = mapping.payloadBytes;
    assert(Number.isSafeInteger(objectOffset) && Number.isSafeInteger(payloadOffset)
      && Number.isSafeInteger(objectBytes) && Number.isSafeInteger(payloadBytes)
      && payloadOffset === objectOffset + 4 && objectBytes === payloadBytes + 4,
    `${name}: native object and payload offsets/lengths are inconsistent`);
    assert(mapping.capture?.file === captured.file
      && mapping.capture?.sha256 === captured.sha256
      && mapping.capture?.bytes === captured.bytes
      && mapping.capture?.windowBase === captured.windowBase
      && mapping.capture?.functionObjectHeaderHex === captured.functionObjectHeaderHex
      && mapping.uniqueCompleteObjectByteMatch === true,
    `${name}: mapped function disagrees with its source capture manifest`);
    const captureWindowPath = resolve(captureRoot, captured.file);
    const captureWindowBytes = read(captureWindowPath);
    assert(captureWindowBytes.length === captured.bytes && sha256(captureWindowBytes) === captured.sha256,
      `${name}: retained live memory window differs from its source capture manifest`);
    assert(live.entry === entry && mappedLive.entry === entry
      && readyHeaders[name].entry === entry
      && live.payloadBytes === payloadBytes && mappedLive.payloadBytes === payloadBytes
      && live.payloadSha256 === mapping.payloadSha256 && mappedLive.payloadSha256 === mapping.payloadSha256
      && live.pllPayloadOffset === payloadOffset && mappedLive.pllPayloadOffset === payloadOffset
      && live.pllObjectOffset === objectOffset && mappedLive.pllObjectOffset === objectOffset
      && live.exactPllObjectMatch === true && mappedLive.exactPllObjectMatch === true
      && live.exactCurrentLivePayloadMatch === true && mappedLive.exactCurrentLivePayloadMatch === true,
    `${name}: READY header, map and two live report identities do not agree`);

    const object = pllBytes.subarray(objectOffset, objectOffset + objectBytes);
    assert(object.length === objectBytes && sha256(object) === mapping.objectSha256,
      `${name}: complete object bytes differ from the capture manifest`);
    assert(countOccurrences(pllBytes, object) === 1,
      `${name}: complete function object is not unique in archived AARON.pll`);
    const payload = object.subarray(4);
    assert(payload.length === payloadBytes && payloadOffset === objectOffset + 4
      && sha256(payload) === mapping.payloadSha256,
    `${name}: PLL payload slice differs from the mapped payload identity`);
    const payloadPath = resolve(dirname(mapPath), mapping.payloadFile);
    const payloadFile = read(payloadPath);
    assert(payloadFile.equals(payload), `${name}: retained mapped payload differs from PLL payload bytes`);

    return {
      name,
      liveEntry: entry,
      readyHeaderHex: readyHeaders[name].headerHex,
      payloadBytes,
      payloadSha256: mapping.payloadSha256,
      pllObjectOffset: objectOffset,
      pllPayloadOffset: payloadOffset,
      completeObjectBytes: objectBytes,
      completeObjectSha256: mapping.objectSha256,
      uniqueCompleteObjectByteMatch: true,
      exactPllObjectMatch: live.exactPllObjectMatch,
      exactCurrentLivePayloadMatch: live.exactCurrentLivePayloadMatch,
      capturedMemoryWindow: record(captureWindowPath),
      payload: record(payloadPath),
    };
  });
  return functions;
}

function main() {
  const [outputArg, beforeArg, observerArg, afterArg, logsArg, mapArg, ...extra] = process.argv.slice(2);
  assert(extra.length === 0,
    'Usage: node derive-free-path-native-caller-evidence.mjs [output.json] [before-root] [observer-root] [after-root] [logs-root] [native-map.json]');
  const output = resolveRepo(outputArg ?? DEFAULT_OUTPUT);
  assert(pathInsideRoot(output), 'Evidence output must remain inside the repository');
  assert(!existsSync(output), `Evidence output must be fresh: ${relativePath(output)}`);

  const runnerPath = resolveRepo(RUNNER_PATH);
  const runnerHash = sha256(read(runnerPath));
  const manifestPath = resolveRepo(MANIFEST_PATH);
  const manifest = readJson(manifestPath);
  const archiveFiles = {};
  for (const name of ['AARON.exe', 'AARON.pll']) {
    const entry = manifest.files.find(item => item.installedName === name);
    assert(entry, `Extracted manifest is missing ${name}`);
    const path = resolveRepo(name === 'AARON.exe' ? ARCHIVE_EXE : ARCHIVE_PLL);
    const bytes = read(path);
    assert(bytes.length === entry.bytes && sha256(bytes) === entry.sha256,
      `Archived ${name} differs from the extracted-runtime manifest`);
    archiveFiles[name] = { bytes: entry.bytes, sha256: entry.sha256, path, bytesValue: bytes };
  }
  const runs = [
    summarizeRun(beforeArg ?? DEFAULT_RUNS.before, 'fresh uninstrumented control before', manifest, runnerHash, archiveFiles),
    summarizeRun(observerArg ?? DEFAULT_RUNS.observer, 'native caller observer', manifest, runnerHash, archiveFiles),
    summarizeRun(afterArg ?? DEFAULT_RUNS.after, 'fresh uninstrumented control after', manifest, runnerHash, archiveFiles),
  ];
  const [before, observer, after] = runs;
  const setupFields = ['installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'runnerSha256'];
  for (const field of setupFields) {
    assert(before.row[field] === observer.row[field] && observer.row[field] === after.row[field],
      `Triplet setup differs for ${field}`);
  }
  for (const name of ['AARON.exe', 'AARON.pll']) {
    const expected = before.row.runtime[name].sha256;
    assert(observer.row.runtime[name].sha256 === expected && after.row.runtime[name].sha256 === expected,
      `Triplet runs do not share the same ${name}`);
  }
  for (const control of [before, after]) {
    assert(control.row.preSceneProbeSha256 === null && control.row.probeOutputNames.length === 0
      && control.row.preSceneProbePauseSeconds === 0
      && control.row.requiredProbeOutputName === '' && control.row.requiredProbeEndMarker === '',
    `${control.row.runId}: expected a no-probe, no-pause control`);
    assert(!existsSync(resolve(control.root, 'free-path-native-caller.json')),
      `${control.row.runId}: control unexpectedly contains a caller report`);
  }

  const equalArtifacts = ARTIFACT_NAMES.map(name => {
    const expected = read(before.artifactPaths[name]);
    assert(read(observer.artifactPaths[name]).equals(expected) && read(after.artifactPaths[name]).equals(expected),
      `Before/observer/after required output is not byte-identical: ${name}`);
    return { name, bytes: expected.length, sha256: sha256(expected) };
  });
  const equalStagedSources = Object.keys(SOURCE_PATHS).map(name => {
    const expected = read(before.sourcePaths[name]);
    assert(read(observer.sourcePaths[name]).equals(expected) && read(after.sourcePaths[name]).equals(expected),
      `Before/observer/after staged source is not byte-identical: ${name}`);
    const currentPath = resolveRepo(SOURCE_PATHS[name]);
    const current = read(currentPath);
    assert(expected.equals(current), `${name}: staged source differs from current repository source`);
    return { name, bytes: expected.length, sha256: sha256(expected), repositorySourcePath: relativePath(currentPath) };
  });
  assert(read(before.planningTracePath).equals(read(after.planningTracePath)),
    'The bracketing uninstrumented planning traces differ');
  assert(observer.row.planningTraceExplicitlyUnwrapsFreePath
    && observer.row.planningTrace.sha256 !== before.row.planningTrace.sha256
    && observer.row.planningTrace.sha256 !== after.row.planningTrace.sha256,
  'Observer planning trace does not record its intentional FREE-PATH unwrap difference');

  const observerRoot = observer.root;
  const requestPath = resolve(observerRoot, 'pre-scene-probe-request.json');
  const requestBytes = read(requestPath);
  const request = readJson(requestPath);
  const probePath = resolve(observerRoot, 'capture/aaron-pre-scene-probe.cl');
  const probeBytes = read(probePath);
  const metadataPath = resolve(observerRoot, 'capture/aaron-free-path-caller-native-links.txt');
  const metadataBytes = read(metadataPath);
  const metadataText = new TextDecoder('utf-8', { fatal: true }).decode(metadataBytes);
  const callerPath = resolve(observerRoot, 'free-path-native-caller.json');
  const callerBytes = read(callerPath);
  const caller = readJson(callerPath);
  const expectedRuntime = resolve(observerRoot, 'runtime/AARON.exe');
  const probeHash = sha256(probeBytes);
  const requestHash = sha256(requestBytes);
  const fullMetadataHash = sha256(metadataBytes);
  assert(request.schemaVersion === 1 && request.runId === observer.row.runId
    && request.runtimeExecutable === expectedRuntime
    && request.releaseFile === 'C:\\temp\\aaron-native-code-release.txt'
    && request.pauseSeconds === 90
    && request.runnerSha256 === runnerHash
    && request.requiredProbeOutputName === 'aaron-free-path-caller-native-links.txt'
    && request.requiredProbeEndMarker === END_MARKER
    && request.probeOutputNames?.length === 1
    && request.probeOutputNames[0] === request.requiredProbeOutputName,
  'Observer request is not the expected runner-owned FREE-PATH caller probe pause');
  assert(probeHash === request.probeSha256 && probeHash === observer.row.preSceneProbeSha256,
    'Staged observer probe hash differs from request or runner summary');
  assert(observer.row.probeOutputNames.length === 1
    && observer.row.probeOutputNames[0] === request.requiredProbeOutputName
    && observer.row.preSceneProbePauseSeconds === 90
    && observer.row.requiredProbeOutputName === request.requiredProbeOutputName
    && observer.row.requiredProbeEndMarker === END_MARKER,
  'Observer summary does not bind the expected probe, output and completion marker');
  const { normalized: normalizedMetadata, lines: metadataLines, headers: readyHeaders } = parseReadyHeaders(metadataText);
  const waitIndex = metadataText.indexOf(WAIT_MARKER);
  assert(waitIndex >= 0, 'Observer metadata lacks the successful caller-capture release record');
  const readyPrefixText = metadataText.slice(0, waitIndex);
  const readyPrefixBytes = Buffer.from(readyPrefixText, 'utf8');
  assert(readyPrefixText.endsWith(`${READY_MARKER}\n`) || readyPrefixText.endsWith(`${READY_MARKER}\r\n`),
    'READY prefix does not end exactly after the complete READY record');
  const readyPrefixHash = sha256(readyPrefixBytes);

  const logsRoot = resolveRepo(logsArg ?? DEFAULT_LOGS);
  assert(pathInsideRoot(logsRoot), 'Caller-triplet diagnostics root escapes the repository');
  const comparisonPath = resolve(logsRoot, 'triplet-comparison.json');
  const comparisonBytes = read(comparisonPath);
  const comparison = readJson(comparisonPath);
  assert(comparison.schemaVersion === 1 && comparison.tripletId === TRIPLET_ID
    && comparison.mode === 'writer-stream-seed-1234'
    && comparison.aa0Header === '320 480 148',
  'Triplet comparison belongs to a different run or scene regime');
  const expectedRoles = ['before', 'observer', 'after'];
  assert(comparison.runs?.length === expectedRoles.length, 'Triplet comparison does not contain three runs');
  for (let index = 0; index < expectedRoles.length; index += 1) {
    const item = comparison.runs[index];
    assert(item.role === expectedRoles[index] && item.runId === runs[index].row.runId
      && item.complete === true && sameResolvedPath(item.outputRoot, runs[index].root),
    `Triplet comparison run ${expectedRoles[index]} does not bind to the archived summary`);
  }
  const expectedChecks = [
    'aa0HeaderAndBytesMatch', 'imageBytesMatch', 'imageIdBytesMatch',
    'sceneStateReportBytesMatch', 'randomSeedLoadedReportBytesMatch',
    'sixStagedSourceHashesMatch', 'bracketPlanningTracesMatch',
    'observerPlanningTraceExplicitlyUnwrapsFreePath', 'observerOnlyPlanningTraceDifference',
    'callerEntryHitCaptured', 'callerIdentified',
  ];
  assert(expectedChecks.every(name => comparison.checks?.[name] === true),
    'Triplet comparison records an incomplete or failed check');

  const mapPath = resolveRepo(mapArg ?? DEFAULT_MAP);
  assert(pathInsideRoot(mapPath), 'Native map must remain inside the repository');
  const mapBytes = read(mapPath);
  const map = readJson(mapPath);
  const pllPath = resolveRepo(ARCHIVE_PLL);
  const pllBytes = read(pllPath);
  const mapCaptureManifestPath = resolveRepo(`${MAP_CAPTURE_ROOT}/manifest.json`);
  const mapCaptureManifestBytes = read(mapCaptureManifestPath);
  const mapCaptureManifest = readJson(mapCaptureManifestPath);
  const mapMetadataPath = resolveRepo(`${MAP_CAPTURE_ROOT}/function-object-metadata.txt`);
  const mapMetadataBytes = read(mapMetadataPath);
  assert(map.pll?.bytes === pllBytes.length && map.pll.sha256 === sha256(pllBytes)
    && map.captureManifestSha256 === sha256(mapCaptureManifestBytes)
    && mapCaptureManifest.metadataSha256 === sha256(mapMetadataBytes)
    && mapMetadataBytes.equals(readyPrefixBytes)
    && mapCaptureManifest.metadataSha256 === readyPrefixHash
    && caller.metadataSha256 === readyPrefixHash,
  'Native map, capture manifest, mapper metadata and helper-recorded READY-prefix hash do not agree');
  const mapCaptureRuntime = resolveRepo(`${RUN_BASE}/freepath-caller-map-20261013-f/runtime/AARON.exe`);
  assert(sameResolvedPath(mapCaptureManifest.runtimeExecutable, mapCaptureRuntime)
    && sha256(read(mapCaptureRuntime)) === archiveFiles['AARON.exe'].sha256,
  'Native map capture manifest is not bound to the extracted AARON executable');

  assert(caller.schemaVersion === 1 && caller.targetFunction === 'FREE-PATH'
    && caller.outcome === 'entry-hit' && caller.oracleRunId === observer.row.runId
    && caller.runtimeExecutable === expectedRuntime
    && caller.sourceProbeSha256 === probeHash && caller.stagedProbeSha256 === probeHash
    && caller.runnerSha256 === runnerHash && caller.requestSha256 === requestHash
    && caller.metadataSha256 === readyPrefixHash
    && caller.sourceMapSha256 === sha256(mapBytes)
    && caller.mapCaptureManifestSha256 === sha256(mapCaptureManifestBytes)
    && caller.captureHelperSha256 === sha256(read(resolveRepo(CALLER_HELPER)))
    && caller.debuggerHelperSha256 === sha256(read(resolveRepo(DEBUGGER_HELPER)))
    && caller.runtimeExecutableSha256 === archiveFiles['AARON.exe'].sha256
    && caller.runtimePllSha256 === sha256(pllBytes)
    && caller.extractedExeSha256 === archiveFiles['AARON.exe'].sha256
    && caller.extractedPllSha256 === sha256(pllBytes)
    && caller.captureError === null && caller.failure === null,
  'Caller report is not source-bound to the archived observer, map, helper sources and extracted runtime');

  const functions = deriveFunctionIdentities({
    map,
    captureManifest: mapCaptureManifest,
    captureRoot: resolveRepo(MAP_CAPTURE_ROOT),
    pllBytes,
    mapPath,
    liveReport: caller.liveFunctions,
    mappedReport: caller.mappedFunctions,
    readyHeaders,
  });
  const freePathFunction = functions.find(item => item.name === 'FREE-PATH');
  const drawCformFunction = functions.find(item => item.name === 'DRAW-CFORM');
  const hit = caller.hit;
  const returned = caller.immediateReturn;
  assert(hit && hit.entry === freePathFunction.liveEntry && hit.eip === freePathFunction.liveEntry
    && hit.firstChance === 1 && hit.exceptionCode === '0x4000001e'
    && hit.returnAddress === returned?.address
    && hit.debugRegistersRestored === true && hit.debugSessionEndedByTargetExit === true
    && hit.detached === false,
  'Captured entry hit is not a clean first FREE-PATH breakpoint hit');
  const returnAddress = hexAddress(returned.address);
  const callerEntry = hexAddress(drawCformFunction.liveEntry);
  const returnOffset = returnAddress - callerEntry;
  assert(returned.status === 'unique-mapped-interval'
    && returned.function === 'DRAW-CFORM'
    && Number(returnOffset) === returned.offset && returned.offset === 359
    && returnOffset >= 0n && returnOffset < BigInt(drawCformFunction.payloadBytes)
    && returned.matchingIntervals?.length === 1
    && returned.matchingIntervals[0].function === 'DRAW-CFORM'
    && returned.matchingIntervals[0].entry === drawCformFunction.liveEntry
    && returned.matchingIntervals[0].offset === returned.offset
    && returned.matchingIntervals[0].payloadBytes === drawCformFunction.payloadBytes,
  'FREE-PATH immediate return does not uniquely fall inside the validated DRAW-CFORM payload');

  const comparisonCaller = comparison.callerCapture;
  const helperStdoutPath = resolve(logsRoot, 'observer-caller-helper.stdout.txt');
  const helperStderrPath = resolve(logsRoot, 'observer-caller-helper.stderr.txt');
  const helperStdoutBytes = read(helperStdoutPath);
  const helperStdoutText = helperStdoutBytes.toString('utf8').trim();
  const helperStdoutReport = JSON.parse(helperStdoutText.replace(/^\uFEFF/u, ''));
  const helperProcess = comparisonCaller?.helperProcess;
  assert(helperProcess?.exitStatus === 0 && helperProcess.x64 === true
    && sameResolvedPath(helperProcess.sourcePath, resolveRepo(CALLER_HELPER))
    && helperProcess.sourceSha256 === caller.captureHelperSha256
    && helperProcess.stdout?.sha256 === sha256(helperStdoutBytes)
    && helperProcess.stderr?.sha256 === sha256(read(helperStderrPath))
    && JSON.stringify(helperStdoutReport) === JSON.stringify(caller)
    && comparisonCaller.report?.sha256 === sha256(callerBytes)
    && comparisonCaller.report?.bytes === callerBytes.length
    && sameResolvedPath(comparisonCaller.report?.path, callerPath)
    && comparisonCaller.outcome === caller.outcome
    && comparisonCaller.entryHit === true
    && comparisonCaller.callerIdentified === true
    && comparisonCaller.immediateReturnUniquelyResolvesToDrawCform === true,
  'Triplet comparison/helper logs do not bind to the archived caller report');

  const releasePath = resolve(observerRoot, 'capture/aaron-native-code-release.txt');
  const tripletLogFiles = {
    beforeStdout: record(resolve(logsRoot, 'before.stdout.txt')),
    beforeStderr: record(resolve(logsRoot, 'before.stderr.txt')),
    observerStdout: record(resolve(logsRoot, 'observer.stdout.txt')),
    observerStderr: record(resolve(logsRoot, 'observer.stderr.txt')),
    afterStdout: record(resolve(logsRoot, 'after.stdout.txt')),
    afterStderr: record(resolve(logsRoot, 'after.stderr.txt')),
    callerHelperStdout: record(helperStdoutPath),
    callerHelperStderr: record(helperStderrPath),
    comparison: { path: relativePath(comparisonPath), bytes: comparisonBytes.length, sha256: sha256(comparisonBytes) },
  };
  const sourceFilePaths = [
    resolveRepo(CALLER_HELPER),
    resolveRepo(TRIPLET_HELPER),
    runnerPath,
    resolveRepo(DEBUGGER_HELPER),
    resolveRepo(PROBE_SOURCE),
    resolveRepo(MANIFEST_PATH),
    resolveRepo(ARCHIVE_EXE),
    pllPath,
    resolveRepo(`${MAP_CAPTURE_ROOT}/manifest.json`),
    resolveRepo(`${MAP_CAPTURE_ROOT}/function-object-metadata.txt`),
    mapPath,
    ...functions.map(item => resolveRepo(item.capturedMemoryWindow.path)),
    ...functions.map(item => resolveRepo(item.payload.path)),
    ...Object.values(SOURCE_PATHS).map(resolveRepo),
    resolveRepo('research/tools/derive-free-path-native-caller-evidence.mjs'),
  ];
  const sourceBindings = [...new Set(sourceFilePaths)].map(record);
  const requiredArtifactsSummary = runs.map(run => run.row);
  const evidence = {
    schemaVersion: 1,
    status: 'measured',
    investigation: 'free-path-first-natural-native-caller-20261013',
    claim: {
      firstNaturalEntry: 'FREE-PATH',
      immediateCaller: 'DRAW-CFORM',
      returnAddress: returned.address,
      returnOffsetDecimal: Number(returnOffset),
      returnOffsetHex: `0x${returnOffset.toString(16)}`,
      scope: 'The first FREE-PATH native entry in one complete writer-stream seed-1234 observer run, with both live payloads validated against unique complete AARON.pll objects.',
    },
    nativeMap: {
      map: record(mapPath),
      captureManifest: record(mapCaptureManifestPath),
      mapMetadata: record(mapMetadataPath),
      archivedPll: record(pllPath),
      captureManifestPll: mapCaptureManifest.pll,
      functions,
    },
    capture: {
      probeRequest: {
        ...record(requestPath),
        schemaVersion: request.schemaVersion,
        runId: request.runId,
        pauseSeconds: request.pauseSeconds,
        probeOutputNames: request.probeOutputNames,
        requiredProbeOutputName: request.requiredProbeOutputName,
        requiredProbeEndMarker: request.requiredProbeEndMarker,
        releaseMarkerLeaf: basename(request.releaseFile),
      },
      stagedProbe: record(probePath),
      nativeMetadata: {
        fullReport: { ...record(metadataPath), complete: true, records: metadataLines.length },
        readyPrefix: {
          bytes: readyPrefixBytes.length,
          sha256: readyPrefixHash,
          sha256RecordedByCaptureHelper: caller.metadataSha256,
          exactBytesMatchMapperMetadata: mapMetadataBytes.equals(readyPrefixBytes),
        },
        functions: EXPECTED_FUNCTIONS.map(name => readyHeaders[name]),
        endMarker: END_MARKER,
      },
      releaseMarker: record(releasePath),
      callerReport: {
        ...record(callerPath),
        helperStdout: tripletLogFiles.callerHelperStdout,
        helperStderr: tripletLogFiles.callerHelperStderr,
        outcome: caller.outcome,
        targetFunction: caller.targetFunction,
        capturedAt: caller.capturedAt,
        hit: {
          processId: hit.processId,
          threadId: hit.threadId,
          entry: hit.entry,
          eip: hit.eip,
          exceptionCode: hit.exceptionCode,
          firstChance: hit.firstChance,
          returnAddress: hit.returnAddress,
          stack64Hex: hit.stack64Hex,
          armedThreads: hit.armedThreads,
          debugRegistersRestored: hit.debugRegistersRestored,
          detached: hit.detached,
          debugSessionEndedByTargetExit: hit.debugSessionEndedByTargetExit,
        },
        immediateReturn: {
          status: returned.status,
          address: returned.address,
          function: returned.function,
          offset: returned.offset,
          matchingIntervals: returned.matchingIntervals,
        },
      },
    },
    controlComparison: {
      runIds: runs.map(run => run.row.runId),
      mode: 'writer-stream-seed-1234',
      canvas: { width: 320, height: 480, thirdHeaderValue: 148 },
      sharedSetup: {
        installerSha256: before.row.installerSha256,
        registryPatchSha256: before.row.registryPatchSha256,
        licensePatchSha256: before.row.licensePatchSha256,
        runnerSha256: before.row.runnerSha256,
        runtime: before.row.runtime,
      },
      runs: requiredArtifactsSummary,
      equalRequiredArtifacts: equalArtifacts,
      equalStagedSources,
      planningTraces: {
        before: before.row.planningTrace,
        observer: observer.row.planningTrace,
        after: after.row.planningTrace,
        observerExplicitlyUnwrapsFreePath: observer.row.planningTraceExplicitlyUnwrapsFreePath,
        bracketingControlsByteIdentical: true,
        observerOnlyDifferenceExpected: true,
      },
      tripletComparison: tripletLogFiles.comparison,
      logs: tripletLogFiles,
    },
    sourceBindings,
    reproduction: {
      command: 'node research/tools/derive-free-path-native-caller-evidence.mjs research/introspection/evidence/free-path-native-caller-repro.json',
      note: 'Offline derivation from the three archived run roots, caller-triplet logs, extracted runtime manifest, and repository-local paired native map; no runtime launch or debugger attachment.',
    },
    limitations: [
      'This identifies the immediate native return interval for the first FREE-PATH entry in this one seeded observer run; later entries may have different callers.',
      'The mapping names a bounded native caller interval and does not recover Lisp source, a Lisp ABI, or a general caller relationship.',
      'Matching required outputs support this bounded capture; they do not establish general observer transparency or whole-painting parity.',
      'The observer planning trace intentionally unwraps FREE-PATH and differs from both controls; only its required drawing/scene outputs and six staged Lisp sources are compared byte-for-byte across all three runs.',
    ],
  };
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({
    accepted: true,
    output: relativePath(output),
    evidenceSha256: sha256(read(output)),
    immediateCaller: evidence.claim,
    readyPrefixSha256: readyPrefixHash,
    equalRequiredArtifacts: equalArtifacts.map(item => item.name),
    equalStagedSources: equalStagedSources.map(item => item.name),
    runIds: runs.map(run => run.row.runId),
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) {
    process.stderr.write(`Evidence derivation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
