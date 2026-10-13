#!/usr/bin/env node

// Offline, source-bound evidence derivation for the first natural
// IN-SUB-FRAME native caller capture. This never launches or attaches to AARON.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_MAP = 'research/extracted/local-oracle/brush-stroke-native-seed1234-20261005-e/native-code/mapped/native-code-map.json';
const RUNNER_PATH = resolve(ROOT, 'research/oracle/run-local-scene-state-required-probe.ps1');
const MANIFEST_PATH = resolve(ROOT, 'research/extracted/aaron/manifest.json');
const DEFAULT_RUNS = Object.freeze({
  before: 'research/extracted/local-oracle/in-sub-frame-caller-20261013-control-before-c',
  observer: 'research/extracted/local-oracle/in-sub-frame-caller-20261013-observer-e',
  after: 'research/extracted/local-oracle/in-sub-frame-caller-20261013-control-after-e',
});
const ARTIFACTS = Object.freeze({
  aa0: 'aa0',
  image: 'image',
  imageId: 'image-id',
  sceneSnapshot: 'aaron-scene-state-snapshot.txt',
  planningTrace: 'aaron-planning-call-trace.txt',
  loadedSeed: 'aaron-random-seed-loaded.txt',
});
const SCENE_SOURCE_NAMES = Object.freeze([
  'planning-call-trace.cl',
  'planning-random-seed-common.cl',
  'scene-state-snapshot-seeded-1234.cl',
  'scene-state-snapshot-writer-seeded-1234.cl',
  'scene-state-snapshot-writer-stream-seeded-1234.cl',
  'scene-state-snapshot.cl',
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFileSync(path);
const readJson = path => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/u, ''));
const rel = path => relative(ROOT, path).split(sep).join('/');
const pathInsideRoot = path => {
  const value = relative(ROOT, path);
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`);
};

function capture(root, name) {
  const path = resolve(root, 'capture', name);
  const bytes = read(path);
  return { path: rel(path), sha256: sha256(bytes), bytes: bytes.length };
}

function summarizeRun(rootRel, role) {
  const root = resolve(ROOT, rootRel);
  assert(pathInsideRoot(root), `${role}: run root escapes the repository`);
  const summaryPath = resolve(root, 'summary.json');
  const summaryBytes = read(summaryPath);
  const summary = readJson(summaryPath);
  const runnerSha256 = sha256(read(RUNNER_PATH));
  const manifest = readJson(MANIFEST_PATH);
  assert(summary.runId === root.split(sep).at(-1), `${role}: run ID differs from its directory`);
  assert(summary.complete === true && summary.mode === 'writer-stream-seed-1234'
    && summary.smallImage === false && summary.probeCompletionSatisfied === true
    && summary.runnerSha256 === runnerSha256, `${role}: incomplete run or runner-source mismatch`);
  assert(summary.installerSha256 === manifest.source.sha256,
    `${role}: installer hash differs from the extracted-runtime manifest`);
  const runtimePath = resolve(root, 'runtime/AARON.exe');
  const runtimeBytes = read(runtimePath);
  const runtimeSha256 = sha256(runtimeBytes);
  const manifestExe = manifest.files.find(item => item.installedName === 'AARON.exe');
  assert(manifestExe && runtimeBytes.length === manifestExe.bytes && runtimeSha256 === manifestExe.sha256,
    `${role}: disposable runtime executable differs from the extracted manifest`);

  const files = Object.fromEntries(Object.entries(ARTIFACTS).map(([key, name]) => [key, capture(root, name)]));
  const sceneSources = Object.fromEntries(SCENE_SOURCE_NAMES.map(name => [name, capture(root, name)]));
  assert(summary.aa0Sha256 === files.aa0.sha256, `${role}: runner AA0 hash differs from captured AA0`);
  assert(summary.sceneReportSha256 === files.sceneSnapshot.sha256,
    `${role}: runner scene-report hash differs from captured scene snapshot`);
  const aa0Header = read(resolve(ROOT, files.aa0.path)).toString('ascii').split(/\r?\n/u, 1)[0];
  const dimensions = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(aa0Header);
  assert(dimensions && Number(dimensions[1]) === 768 && Number(dimensions[2]) === 1080,
    `${role}: expected the observed 768x1080 canvas`);

  return {
    root,
    summary,
    row: {
      runId: summary.runId,
      role,
      path: rel(root),
      complete: summary.complete,
      mode: summary.mode,
      smallImage: summary.smallImage,
      preSceneProbeSha256: summary.preSceneProbeSha256 ?? null,
      probeOutputNames: summary.probeOutputNames,
      preSceneProbePauseSeconds: summary.preSceneProbePauseSeconds,
      probeCompletionSatisfied: summary.probeCompletionSatisfied,
      installerSha256: summary.installerSha256,
      registryPatchSha256: summary.registryPatchSha256,
      licensePatchSha256: summary.licensePatchSha256,
      runnerSha256: summary.runnerSha256,
      runtimeExecutableSha256: runtimeSha256,
      summarySha256: sha256(summaryBytes),
      aa0Dimensions: { width: Number(dimensions[1]), height: Number(dimensions[2]), headerValue: Number(dimensions[3]) },
      files,
      sceneSources,
    },
  };
}

function bindFile(path) {
  const bytes = read(path);
  return { path: rel(path), bytes: bytes.length, sha256: sha256(bytes) };
}

function main() {
  const [outputArg, beforeArg, observerArg, afterArg, mapArg, ...extra] = process.argv.slice(2);
  assert(extra.length === 0,
    'Usage: node derive-in-sub-frame-caller-evidence.mjs [output.json] [before-root] [observer-root] [after-root] [native-map.json]');
  const output = resolve(ROOT, outputArg ?? 'research/introspection/evidence/in-sub-frame-native-caller-20261013.json');
  assert(pathInsideRoot(output), 'Evidence output must remain inside the repository');
  assert(!existsSync(output), `Evidence output must be fresh: ${rel(output)}`);

  const runs = [
    summarizeRun(beforeArg ?? DEFAULT_RUNS.before, 'fresh uninstrumented control before'),
    summarizeRun(observerArg ?? DEFAULT_RUNS.observer, 'native caller observer'),
    summarizeRun(afterArg ?? DEFAULT_RUNS.after, 'fresh uninstrumented control after'),
  ];
  const [before, observer, after] = runs;
  for (const field of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(before.row[field] === observer.row[field] && observer.row[field] === after.row[field],
      `Run setup differs for ${field}`);
  }
  assert(before.row.runtimeExecutableSha256 === observer.row.runtimeExecutableSha256
    && observer.row.runtimeExecutableSha256 === after.row.runtimeExecutableSha256,
  'The three runs do not share the same verified AARON executable');
  for (const control of [before, after]) {
    assert(control.row.preSceneProbeSha256 === null && control.row.probeOutputNames.length === 0
      && control.row.preSceneProbePauseSeconds === 0
      && control.summary.requiredProbeOutputName === '' && control.summary.requiredProbeEndMarker === '',
    `${control.row.runId}: expected a no-probe, no-pause control`);
    assert(!existsSync(resolve(control.root, 'in-sub-frame-native-caller.json')),
      `${control.row.runId}: control unexpectedly contains a caller report`);
  }

  const equalArtifacts = Object.keys(ARTIFACTS).map(key => {
    const expected = before.row.files[key].sha256;
    assert(observer.row.files[key].sha256 === expected && after.row.files[key].sha256 === expected,
      `Before/observer/after artifacts differ: ${key}`);
    return { name: key, sha256: expected, bytes: before.row.files[key].bytes };
  });
  const equalSceneSources = SCENE_SOURCE_NAMES.map(name => {
    const expected = before.row.sceneSources[name].sha256;
    assert(observer.row.sceneSources[name].sha256 === expected && after.row.sceneSources[name].sha256 === expected,
      `Before/observer/after scene source differs: ${name}`);
    return { name, sha256: expected, bytes: before.row.sceneSources[name].bytes };
  });

  const probeRequestPath = resolve(observer.root, 'pre-scene-probe-request.json');
  const probeRequestBytes = read(probeRequestPath);
  const probeRequest = readJson(probeRequestPath);
  const probePath = resolve(observer.root, 'capture/aaron-pre-scene-probe.cl');
  const probeBytes = read(probePath);
  const metadataPath = resolve(observer.root, 'capture/aaron-brush-stroke-native-links.txt');
  const metadataBytes = read(metadataPath);
  const metadata = metadataBytes.toString('utf8').replace(/\r\n/gu, '\n');
  const callerPath = resolve(observer.root, 'in-sub-frame-native-caller.json');
  const callerBytes = read(callerPath);
  const caller = JSON.parse(callerBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const expectedRuntime = resolve(observer.root, 'runtime/AARON.exe');
  assert(probeRequest.schemaVersion === 1 && probeRequest.runId === observer.row.runId
    && probeRequest.runtimeExecutable === expectedRuntime
    && probeRequest.releaseFile === 'C:\\temp\\aaron-native-code-release.txt'
    && probeRequest.pauseSeconds === 90
    && probeRequest.runnerSha256 === observer.summary.runnerSha256
    && probeRequest.requiredProbeOutputName === 'aaron-brush-stroke-native-links.txt'
    && probeRequest.requiredProbeEndMarker === 'END brush-stroke-native-links'
    && probeRequest.probeOutputNames.length === 1
    && probeRequest.probeOutputNames[0] === 'aaron-brush-stroke-native-links.txt',
  'Observer request is not the expected runner-owned paused native metadata probe');
  const probeHash = sha256(probeBytes);
  assert(probeHash === probeRequest.probeSha256 && probeHash === observer.summary.preSceneProbeSha256,
    'Captured pre-scene probe hash differs from request or runner summary');
  assert(observer.row.probeOutputNames.length === 1
    && observer.row.probeOutputNames[0] === 'aaron-brush-stroke-native-links.txt'
    && observer.row.preSceneProbePauseSeconds === 90
    && observer.summary.requiredProbeOutputName === 'aaron-brush-stroke-native-links.txt'
    && observer.summary.requiredProbeEndMarker === 'END brush-stroke-native-links',
  'Observer runner summary does not bind the expected probe output and pause');
  assert(metadata.includes('BEGIN brush-stroke-native-links\n')
    && metadata.includes('END brush-stroke-native-links\n')
    && metadata.includes('TOTALS targets=2 functions=2 headers=2 constants=17 errors=0 truncations=0\n')
    && metadata.includes('ERROR-COUNT 0\n') && metadata.includes('TRUNCATION-COUNT 0\n')
    && !/^ERROR /mu.test(metadata) && !/^TRUNCATION /mu.test(metadata),
  'Native metadata capture is incomplete or reports errors/truncation');

  const mapPath = resolve(ROOT, mapArg ?? DEFAULT_MAP);
  const mapBytes = read(mapPath);
  const map = readJson(mapPath);
  assert(map.schemaVersion === 1 && Array.isArray(map.functions), 'Unexpected native code map schema');
  const pllPath = resolve(ROOT, 'research/extracted/aaron/application/AARON.pll');
  const pllBytes = read(pllPath);
  const manifest = readJson(MANIFEST_PATH);
  const manifestPll = manifest.files.find(item => item.installedName === 'AARON.pll');
  assert(manifestPll && pllBytes.length === manifestPll.bytes && map.pll.bytes === manifestPll.bytes
    && map.pll.sha256 === manifestPll.sha256 && sha256(pllBytes) === manifestPll.sha256,
  'Native map does not identify the exact archived AARON.pll');
  assert(caller.schemaVersion === 1 && caller.sourceMapSha256 === sha256(mapBytes)
    && caller.metadataSha256 === sha256(metadataBytes)
    && caller.captureHelperSha256 === sha256(read(resolve(ROOT, 'research/tools/capture-in-sub-frame-caller.ps1')))
    && caller.debuggerHelperSha256 === sha256(read(resolve(ROOT, 'research/oracle/AaronCallerBreakpoint.cs')))
    && caller.runtimeExecutable === expectedRuntime,
  'Caller report is not bound to this run metadata, map, debugger helpers and executable');
  assert(caller.hit?.entry === caller.hit?.eip && caller.hit?.firstChance === 1
    && caller.hit?.exceptionCode === '0x4000001e'
    && caller.hit?.debugRegistersRestored === true
    && caller.hit?.debugSessionEndedByTargetExit === true
    && caller.hit?.detached === false,
  'Caller report does not show a clean first entry capture ending with target exit');

  const wantedNames = ['BRUSH-STROKE', 'IN-SUB-FRAME'];
  assert(map.functions.length === wantedNames.length, 'Native map contains an unexpected function set');
  const headerEntries = new Map();
  for (const match of metadata.matchAll(/^HEADER name="([A-Z][A-Z0-9-]*)" bytes=([0-9a-f]{128})$/gmu)) {
    const bytes = Buffer.from(match[2], 'hex');
    headerEntries.set(match[1], `0x${bytes.readUInt32LE(18).toString(16).padStart(8, '0')}`);
  }
  const functions = wantedNames.map(name => {
    const mapped = map.functions.find(item => item.name === name);
    const live = caller.functions.find(item => item.name === name);
    assert(mapped?.uniqueCompleteObjectByteMatch === true && live?.exactLivePayloadMatch === true,
      `${name}: missing unique PLL mapping or live full-payload match`);
    assert(live.payloadBytes === mapped.payloadBytes && live.payloadSha256 === mapped.payloadSha256
      && live.pllPayloadOffset === mapped.pll.payloadOffset
      && live.entry === headerEntries.get(name), `${name}: live metadata, mapped payload and report disagree`);
    const payloadPath = resolve(dirname(mapPath), mapped.payloadFile);
    const payloadBytes = read(payloadPath);
    assert(payloadBytes.length === mapped.payloadBytes && sha256(payloadBytes) === mapped.payloadSha256,
      `${name}: retained native payload hash/size mismatch`);
    return {
      name,
      liveEntry: live.entry,
      payloadBytes: mapped.payloadBytes,
      payloadSha256: mapped.payloadSha256,
      pllPayloadOffset: mapped.pll.payloadOffset,
      uniqueCompleteObjectByteMatch: mapped.uniqueCompleteObjectByteMatch,
      exactLivePayloadMatch: live.exactLivePayloadMatch,
      payload: bindFile(payloadPath),
    };
  });

  const target = functions.find(item => item.name === 'IN-SUB-FRAME');
  const callerFn = functions.find(item => item.name === 'BRUSH-STROKE');
  const returned = caller.immediateReturn;
  const computedOffset = BigInt(returned.address) - BigInt(callerFn.liveEntry);
  assert(caller.immediateCallerMapped === true && caller.hit.entry === target.liveEntry
    && returned.address === caller.hit.returnAddress && returned.function === 'BRUSH-STROKE'
    && computedOffset === BigInt(returned.offset) && returned.offset === 463
    && returned.offset < callerFn.payloadBytes,
  'The first IN-SUB-FRAME return address does not resolve inside the validated BRUSH-STROKE payload');

  const codeMapRelative = rel(mapPath);
  const sourceFiles = [
    resolve(ROOT, 'research/tools/capture-in-sub-frame-caller.ps1'),
    resolve(ROOT, 'research/oracle/AaronCallerBreakpoint.cs'),
    RUNNER_PATH,
    resolve(ROOT, 'research/introspection/brush-stroke-native-links.cl'),
    resolve(ROOT, 'research/tools/derive-in-sub-frame-caller-evidence.mjs'),
    MANIFEST_PATH,
    resolve(ROOT, 'research/extracted/aaron/application/AARON.exe'),
    pllPath,
    resolve(observer.root, 'runtime/AARON.exe'),
    mapPath,
    ...SCENE_SOURCE_NAMES.map(name => resolve(observer.root, 'capture', name)),
    ...functions.map(item => resolve(ROOT, item.payload.path)),
  ];
  const evidence = {
    schemaVersion: 1,
    status: 'measured',
    investigation: 'in-sub-frame-first-natural-native-caller-20261013',
    claim: {
      firstNaturalEntry: 'IN-SUB-FRAME',
      immediateCaller: 'BRUSH-STROKE',
      returnOffsetDecimal: Number(computedOffset),
      returnOffsetHex: `0x${computedOffset.toString(16)}`,
      scope: 'The first native entry in one complete seed-1234 writer-stream run, with current live code revalidated against exact PLL payloads.',
    },
    nativeMap: {
      path: codeMapRelative,
      sha256: sha256(mapBytes),
      archivedPllSha256: map.pll.sha256,
      functions,
    },
    capture: {
      callerReport: { path: rel(callerPath), bytes: callerBytes.length, sha256: sha256(callerBytes) },
      metadata: { path: rel(metadataPath), bytes: metadataBytes.length, sha256: sha256(metadataBytes), complete: true },
      probeRequest: { path: rel(probeRequestPath), bytes: probeRequestBytes.length, sha256: sha256(probeRequestBytes) },
      stagedProbe: { path: rel(probePath), bytes: probeBytes.length, sha256: probeHash },
      hit: {
        processId: caller.hit.processId,
        threadId: caller.hit.threadId,
        entry: caller.hit.entry,
        exceptionCode: caller.hit.exceptionCode,
        firstChance: caller.hit.firstChance,
        returnAddress: caller.hit.returnAddress,
        immediateCaller: returned,
        armedThreads: caller.hit.armedThreads,
        debugRegistersRestored: caller.hit.debugRegistersRestored,
        detached: caller.hit.detached,
        debugSessionEndedByTargetExit: caller.hit.debugSessionEndedByTargetExit,
      },
    },
    controlComparison: {
      runs: runs.map(run => run.row),
      equalArtifacts,
      equalSceneSources,
      canvas: observer.row.aa0Dimensions,
      interpretation: 'The observer run is bracketed by fresh same-mode runs without the probe or debugger; the six listed AA0, image, scene, planning and loaded-seed artifacts are byte-identical across all three.',
    },
    sourceBindings: sourceFiles.map(bindFile),
    limitations: [
      'Only the first natural IN-SUB-FRAME entry in this one controlled run is captured; later entries may have different callers.',
      'The caller is established from the immediate return address inside the validated BRUSH-STROKE payload. The outer Lisp call chain is not symbolized here.',
      'This result does not bind the separate 1,400-call false-result census rows to frames or callers.',
      'The finding does not expand the bounded integer predicate contract to fractional, malformed, error or other runtime inputs.',
      'Matching scene artifacts support this bounded debugger capture; they do not establish general observer transparency or whole-painting JavaScript parity.',
    ],
  };
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ accepted: true, output: rel(output), evidenceSha256: sha256(read(output)),
    caller: evidence.claim, allEqualArtifacts: equalArtifacts.map(item => item.name),
    runIds: runs.map(run => run.row.runId) }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) {
    process.stderr.write(`Evidence derivation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
