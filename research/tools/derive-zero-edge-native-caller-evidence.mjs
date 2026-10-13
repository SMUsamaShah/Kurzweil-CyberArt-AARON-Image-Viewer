#!/usr/bin/env node

// Offline validation of a source-hashed ZERO-EDGE entry/caller capture.
// This script never launches AARON or attaches a debugger.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER_PATH = resolve(ROOT, 'research/oracle/run-local-scene-state-required-probe.ps1');
const CAPTURE_HELPER_PATH = resolve(ROOT, 'research/tools/capture-zero-edge-caller.ps1');
const DEBUGGER_HELPER_PATH = resolve(ROOT, 'research/oracle/AaronCallerBreakpoint.cs');
const PROBE_PATH = resolve(ROOT, 'research/introspection/zero-edge-native-caller-links.cl');
const MANIFEST_PATH = resolve(ROOT, 'research/extracted/aaron/manifest.json');
const STATIC_EVIDENCE_PATH = resolve(ROOT, 'research/introspection/evidence/zero-edge-native-links-20261013.json');
const DEFAULT_MAP = 'research/extracted/local-oracle/zero-edge-native-caller-map-20261013-a/native-code-map.json';
const MERGE_HELPER_PATH = resolve(ROOT, 'research/tools/merge-zero-edge-caller-native-maps.mjs');
const DEFAULT_RUNS = Object.freeze({
  before: 'research/extracted/local-oracle/zero-edge-native-caller-20261013-control-before-d',
  observer: 'research/extracted/local-oracle/zero-edge-native-caller-20261013-observer-e',
  after: 'research/extracted/local-oracle/zero-edge-native-caller-20261013-control-after-f',
});
const OUTPUT_NAME = 'aaron-zero-edge-native-caller-links.txt';
const END_MARKER = 'END zero-edge-native-caller-links';
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
const REQUIRED_FUNCTIONS = ['BUFFER-HOLE', 'ZERO-EDGE'];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFileSync(path);
const json = path => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/u, ''));
const rel = path => relative(ROOT, path).split(sep).join('/');
const insideRoot = path => {
  const value = relative(ROOT, path);
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`);
};
const bind = path => {
  const bytes = read(path);
  return { path: rel(path), bytes: bytes.length, sha256: sha256(bytes) };
};

function capture(root, name) {
  const path = resolve(root, 'capture', name);
  const bytes = read(path);
  return { path: rel(path), bytes: bytes.length, sha256: sha256(bytes) };
}

function runInfo(rootRel, role, expectedRunnerHash, manifest) {
  const root = resolve(ROOT, rootRel);
  assert(insideRoot(root), `${role}: run root escapes the repository`);
  const summaryPath = resolve(root, 'summary.json');
  const summaryBytes = read(summaryPath);
  const summary = json(summaryPath);
  const exePath = resolve(root, 'runtime/AARON.exe');
  const pllPath = resolve(root, 'runtime/AARON.pll');
  const exe = read(exePath);
  const pll = read(pllPath);
  const manifestExe = manifest.files.find(item => item.installedName === 'AARON.exe');
  const manifestPll = manifest.files.find(item => item.installedName === 'AARON.pll');
  assert(summary.runId === root.split(sep).at(-1), `${role}: run ID differs from its directory`);
  assert(summary.complete === true && summary.mode === 'writer-stream-seed-1234'
    && summary.smallImage === false && summary.probeCompletionSatisfied === true
    && summary.runnerSha256 === expectedRunnerHash,
  `${role}: incomplete run, wrong mode, or runner-source mismatch`);
  assert(summary.installerSha256 === manifest.source.sha256,
    `${role}: installer differs from the extracted manifest`);
  assert(manifestExe && exe.length === manifestExe.bytes && sha256(exe) === manifestExe.sha256,
    `${role}: runtime executable differs from the manifest`);
  assert(manifestPll && pll.length === manifestPll.bytes && sha256(pll) === manifestPll.sha256,
    `${role}: runtime PLL differs from the manifest`);
  const files = Object.fromEntries(Object.entries(ARTIFACTS).map(([key, name]) => [key, capture(root, name)]));
  const sceneSources = Object.fromEntries(SCENE_SOURCE_NAMES.map(name => [name, capture(root, name)]));
  assert(summary.aa0Sha256 === files.aa0.sha256 && summary.sceneReportSha256 === files.sceneSnapshot.sha256,
    `${role}: runner output hashes disagree with archived files`);
  const header = read(resolve(ROOT, files.aa0.path)).toString('ascii').split(/\r?\n/u, 1)[0];
  const dimensions = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(header);
  assert(dimensions, `${role}: malformed AA0 dimension header`);
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
      summarySha256: sha256(summaryBytes), probeSha256: summary.preSceneProbeSha256 ?? null,
      probeOutputNames: summary.probeOutputNames,
      probePauseSeconds: summary.preSceneProbePauseSeconds,
      probeCompletionSatisfied: summary.probeCompletionSatisfied,
      requiredProbeOutputName: summary.requiredProbeOutputName,
      requiredProbeEndMarker: summary.requiredProbeEndMarker,
      aa0Dimensions: { width: Number(dimensions[1]), height: Number(dimensions[2]), headerValue: Number(dimensions[3]) },
      files, sceneSources,
    },
  };
}

function parseMetadata(path) {
  const bytes = read(path);
  const text = bytes.toString('utf8').replace(/\r\n/gu, '\n');
  assert(text.startsWith('BEGIN zero-edge-native-caller-links\n')
    && text.endsWith(`${END_MARKER}\n`), 'Live metadata report has no exact BEGIN/END boundary');
  const summary = /^TOTALS targets=2 functions=2 headers=2 constants=(\d+) errors=0 truncations=0$/mu.exec(text);
  assert(summary && text.includes('ERROR-COUNT 0\n') && text.includes('TRUNCATION-COUNT 0\n'),
    'Live metadata is incomplete, erroneous, or truncated');
  const headers = [...text.matchAll(/^HEADER name="([A-Z][A-Z0-9-]*)" bytes=([0-9a-fA-F]{128})$/gmu)]
    .map(match => ({ name: match[1], bytes: Buffer.from(match[2], 'hex') }));
  assert(headers.length === 2 && REQUIRED_FUNCTIONS.every(name => headers.some(item => item.name === name)),
    'Live metadata does not contain exactly BUFFER-HOLE and ZERO-EDGE headers');
  return { bytes, text, headers, totalConstants: Number(summary[1]) };
}

function main() {
  const [outputArg, beforeArg, observerArg, afterArg, mapArg, ...extra] = process.argv.slice(2);
  assert(extra.length === 0,
    'Usage: node derive-zero-edge-native-caller-evidence.mjs [output.json] [before-root] [observer-root] [after-root] [native-map.json]');
  const output = resolve(ROOT, outputArg ?? 'research/introspection/evidence/zero-edge-native-caller-20261013.json');
  assert(insideRoot(output) && !existsSync(output), 'Evidence output must remain inside the repo and be fresh');
  const runnerBytes = read(RUNNER_PATH);
  const runnerHash = sha256(runnerBytes);
  const manifest = json(MANIFEST_PATH);
  const mapPath = resolve(ROOT, mapArg ?? DEFAULT_MAP);
  const mapBytes = read(mapPath);
  const map = json(mapPath);
  assert(insideRoot(mapPath) && map.schemaVersion === 1 && Array.isArray(map.functions),
    'Unexpected or out-of-repository PLL map');
  const manifestPll = manifest.files.find(item => item.installedName === 'AARON.pll');
  assert(manifestPll && map.pll.sha256 === manifestPll.sha256,
    'Reusable native map does not match the current verified PLL');
  assert(map.provenance?.sources?.length === 2
    && map.provenance.mergeHelper?.path === rel(MERGE_HELPER_PATH)
    && map.provenance.mergeHelper.sha256 === sha256(read(MERGE_HELPER_PATH))
    && map.provenance.manifest?.sha256 === sha256(read(MANIFEST_PATH)),
  'Combined map does not bind both source maps, merge helper and runtime manifest');
  const sourceMaps = map.provenance.sources.map(source => {
    const sourcePath = resolve(ROOT, source.mapPath);
    const sourceBytes = read(sourcePath);
    assert(insideRoot(sourcePath) && sha256(sourceBytes) === source.mapSha256,
      `Combined-map input changed: ${source.mapPath}`);
    const sourceMap = JSON.parse(sourceBytes.toString('utf8').replace(/^\uFEFF/u, ''));
    assert(sourceMap.pll.sha256 === manifestPll.sha256
      && sourceMap.functions.some(fn => fn.name === source.function
        && fn.payloadSha256 === source.mappedPayloadSha256 && fn.uniqueCompleteObjectByteMatch === true),
    `Combined-map provenance does not verify ${source.function}`);
    return { ...source, bytes: sourceBytes.length };
  });
  const mappedFunctions = Object.fromEntries(REQUIRED_FUNCTIONS.map(name => {
    const fn = map.functions.find(item => item.name === name);
    assert(fn?.uniqueCompleteObjectByteMatch === true, `No unique complete PLL mapping for ${name}`);
    const payloadPath = resolve(dirname(mapPath), fn.payloadFile);
    const payload = read(payloadPath);
    assert(payload.length === fn.payloadBytes && sha256(payload) === fn.payloadSha256,
      `Mapped PLL payload mismatch for ${name}`);
    return [name, { fn, payloadPath, payload }];
  }));

  const runs = [
    runInfo(beforeArg ?? DEFAULT_RUNS.before, 'fresh uninstrumented control before', runnerHash, manifest),
    runInfo(observerArg ?? DEFAULT_RUNS.observer, 'ZERO-EDGE caller observer', runnerHash, manifest),
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
  'Before/observer/after canvas dimensions differ');
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
  const request = JSON.parse(requestBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const stagedProbePath = resolve(observer.root, 'capture/aaron-pre-scene-probe.cl');
  const stagedProbe = read(stagedProbePath);
  const metadataPath = resolve(observer.root, `capture/${OUTPUT_NAME}`);
  const metadata = parseMetadata(metadataPath);
  const callerPath = resolve(observer.root, 'zero-edge-native-caller.json');
  const callerBytes = read(callerPath);
  const caller = JSON.parse(callerBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const currentProbeHash = sha256(read(PROBE_PATH));
  assert(sha256(stagedProbe) === currentProbeHash && request.probeSha256 === currentProbeHash
    && request.runnerSha256 === runnerHash && request.pauseSeconds > 0
    && request.pauseSeconds === observer.summary.preSceneProbePauseSeconds
    && request.runId === observer.row.runId
    && request.runtimeExecutable === resolve(observer.root, 'runtime/AARON.exe')
    && request.requiredProbeOutputName === OUTPUT_NAME
    && request.requiredProbeEndMarker === END_MARKER
    && request.probeOutputNames.length === 1 && request.probeOutputNames[0] === OUTPUT_NAME,
  'Observer request does not bind the exact staged probe and required report');
  assert(observer.row.probeSha256 === currentProbeHash && observer.row.probePauseSeconds > 0
    && observer.row.requiredProbeOutputName === OUTPUT_NAME
    && observer.row.requiredProbeEndMarker === END_MARKER,
  'Observer runner summary does not bind the required probe');
  assert(caller.schemaVersion === 1 && ['entry-hit', 'no-entry-within-deadline'].includes(caller.outcome)
    && caller.runtimeExecutable === resolve(observer.root, 'runtime/AARON.exe')
    && caller.runtimeExecutableSha256 === observer.row.runtimeExecutableSha256
    && caller.runtimePllSha256 === observer.row.runtimePllSha256
    && caller.probeSha256 === currentProbeHash && caller.runnerSha256 === runnerHash
    && caller.requestSha256 === sha256(requestBytes)
    && caller.metadataSha256 === sha256(metadata.bytes)
    && caller.sourceMapSha256 === sha256(mapBytes)
    && caller.captureHelperSha256 === sha256(read(CAPTURE_HELPER_PATH))
    && caller.debuggerHelperSha256 === sha256(read(DEBUGGER_HELPER_PATH)),
  'Caller report is not source-bound to this request, runner, map, helpers and runtime');
  assert(caller.functions.length === 2, 'Caller report has an unexpected live function set');
  const liveFunctions = REQUIRED_FUNCTIONS.map(name => {
    const live = caller.functions.find(item => item.name === name);
    const mapped = mappedFunctions[name].fn;
    const header = metadata.headers.find(item => item.name === name);
    const liveEntry = `0x${header.bytes.readUInt32LE(18).toString(16).padStart(8, '0')}`;
    assert(live?.exactLivePayloadMatch === true && live.entry === liveEntry
      && live.payloadBytes === mapped.payloadBytes && live.payloadSha256 === mapped.payloadSha256
      && live.pllPayloadOffset === mapped.pll.payloadOffset,
    `${name}: current live function does not match its unique complete PLL object`);
    return {
      name, entry: live.entry, payloadBytes: live.payloadBytes,
      payloadSha256: live.payloadSha256, pllPayloadOffset: live.pllPayloadOffset,
      uniqueCompleteObjectByteMatch: true, exactLivePayloadMatch: true,
      payload: bind(mappedFunctions[name].payloadPath),
      metadataHeaderSha256: sha256(header.bytes),
    };
  });

  let observedApplicationCaller = null;
  if (caller.outcome === 'entry-hit') {
    const zeroEdge = liveFunctions.find(item => item.name === 'ZERO-EDGE');
    assert(caller.hit && caller.hit.entry === caller.hit.eip && caller.hit.entry === zeroEdge.entry
      && caller.hit.firstChance === 1
      && ['0x80000004', '0x4000001e'].includes(caller.hit.exceptionCode)
      && caller.hit.debugRegistersRestored === true
      && (caller.hit.debugSessionEndedByTargetExit === true || caller.hit.detached === true),
    'ZERO-EDGE entry report lacks the expected clean first-chance breakpoint capture');
    const returned = caller.immediateReturn;
    assert(returned && returned.address === caller.hit.returnAddress,
      'ZERO-EDGE immediate return address is missing');
    if (returned.function) {
      const callerFn = liveFunctions.find(item => item.name === returned.function);
      assert(callerFn && returned.offset === Number(BigInt(returned.address) - BigInt(callerFn.entry))
        && returned.offset < callerFn.payloadBytes,
      'Immediate return address is outside the reported live-matched function range');
      observedApplicationCaller = { function: callerFn.name, returnOffset: returned.offset, address: returned.address };
    } else {
      assert(returned.offset === null, 'Unmapped immediate return must not claim an offset');
      observedApplicationCaller = { function: null, returnOffset: null, address: returned.address };
    }
  } else {
    assert(caller.hit === null && caller.immediateReturn === null
      && typeof caller.noHitError === 'string'
      && caller.noHitError.includes('No selected entry breakpoint observed within the deadline'),
    'No-hit outcome does not contain the expected bounded debugger result');
  }

  const staticEvidence = json(STATIC_EVIDENCE_PATH);
  assert(staticEvidence.result.staticReferenceCount === 1
    && staticEvidence.result.staticReferenceCandidates[0].root === 'BUFFER-HOLE'
    && staticEvidence.result.staticReferenceCandidates[0].constantIndex === 1
    && staticEvidence.result.staticReferenceCandidates[0].kind === 'symbol',
  'Prior ZERO-EDGE reference candidate does not match the expected static evidence');
  const evidence = {
    schemaVersion: 1,
    status: caller.outcome === 'entry-hit' ? 'measured' : 'bounded-no-hit',
    question: 'Was ZERO-EDGE entered naturally in this writer-stream-seed-1234 scene, and where did its first native return address land?',
    outcome: caller.outcome,
    observedApplicationCaller,
    priorStaticCandidate: {
      function: 'BUFFER-HOLE', constantIndex: 1, kind: 'symbol',
      evidencePath: rel(STATIC_EVIDENCE_PATH), sha256: sha256(read(STATIC_EVIDENCE_PATH)),
    },
    functions: liveFunctions,
    callerFrames: caller.frameReturns,
    controls: {
      mode: 'writer-stream-seed-1234', smallImage: false,
      canvas: observer.row.aa0Dimensions,
      sixOutputsByteIdenticalAcrossBeforeObserverAfter: true,
      sixSceneSourcesByteIdenticalAcrossBeforeObserverAfter: true,
      equalOutputs: equalArtifacts, equalSceneSources,
      runs: runs.map(run => run.row),
    },
    capture: {
      helperReport: { path: rel(callerPath), bytes: callerBytes.length, sha256: sha256(callerBytes) },
      metadataReport: { path: rel(metadataPath), bytes: metadata.bytes.length, sha256: sha256(metadata.bytes), totalConstants: metadata.totalConstants },
      request: { path: rel(requestPath), bytes: requestBytes.length, sha256: sha256(requestBytes) },
      stagedProbe: bind(stagedProbePath), sourceProbe: bind(PROBE_PATH),
      runner: bind(RUNNER_PATH), captureHelper: bind(CAPTURE_HELPER_PATH),
      debuggerHelper: bind(DEBUGGER_HELPER_PATH), mergeHelper: bind(MERGE_HELPER_PATH),
      sourceMaps, nativeMap: { path: rel(mapPath), bytes: mapBytes.length, sha256: sha256(mapBytes) },
      manifest: bind(MANIFEST_PATH), deriver: bind(fileURLToPath(import.meta.url)),
    },
    limitations: [
      'The result covers only the first ZERO-EDGE entry, or the bounded no-hit period, in one controlled scene.' ,
      'A return address inside BUFFER-HOLE establishes one immediate native caller for this hit; the earlier symbol constant alone does not.',
      'Frame walking is bounded and heuristic. Only ZERO-EDGE and BUFFER-HOLE code ranges are symbolized.',
      'The result applies only to the AA0 canvas dimensions recorded above and does not establish parity for a separate composite-loader regime.',
      'The capture does not characterize ZERO-EDGE arguments, traversal semantics, later callers, or whole-painting JavaScript parity.',
    ],
  };
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${rel(output)}\n${sha256(read(output))}\n`);
}

main();
