#!/usr/bin/env node

// Offline, source-bound derivation for the first natural PICK entry hit.
// This checks the saved triplet and indexed PLL; it never launches AARON.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_PLL_LAYOUT, parseCompiledObjectTable, parseIndexTable, sha256,
} from './index-allegro-image.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER_PATH = resolve(ROOT, 'research/oracle/run-local-scene-state-required-probe.ps1');
const MANIFEST_PATH = resolve(ROOT, 'research/extracted/aaron/manifest.json');
const EXECUTED_HELPER_PATH = resolve(ROOT, 'research/tools/capture-pick-caller-executed-20261014.ps1');
const CURRENT_HELPER_PATH = resolve(ROOT, 'research/tools/capture-pick-caller.ps1');
const DEBUGGER_HELPER_PATH = resolve(ROOT, 'research/oracle/AaronCallerBreakpoint.cs');
const DEFAULT_RUNS = Object.freeze({
  before: 'research/extracted/local-oracle/pick-caller-20261014-control-before-v1',
  observer: 'research/extracted/local-oracle/pick-caller-20261014-observer-v1',
  after: 'research/extracted/local-oracle/pick-caller-20261014-control-after-v1',
});
const DEFAULT_MAP = 'research/extracted/local-oracle/external-runs/pick-native-links-20261014-v1/native-code/mapped/native-code-map.json';
const NATIVE_MANIFEST = 'research/extracted/local-oracle/external-runs/pick-native-links-20261014-v1/native-code/manifest.json';
const ARTIFACTS = Object.freeze({
  aa0: 'aa0',
  image: 'image',
  imageId: 'image-id',
  sceneSnapshot: 'aaron-scene-state-snapshot.txt',
  planningTrace: 'aaron-planning-call-trace.txt',
  loadedSeed: 'aaron-random-seed-loaded.txt',
});
const SCENE_SOURCES = Object.freeze([
  'planning-call-trace.cl',
  'planning-random-seed-common.cl',
  'scene-state-snapshot-seeded-1234.cl',
  'scene-state-snapshot-writer-seeded-1234.cl',
  'scene-state-snapshot-writer-stream-seeded-1234.cl',
  'scene-state-snapshot.cl',
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (path) => readFileSync(path);
const readJson = (path) => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/u, ''));
const rel = (path) => relative(ROOT, path).split(sep).join('/');
const insideRoot = (path) => {
  const value = relative(ROOT, path);
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`);
};
const address = (value, label) => {
  assert(typeof value === 'string' && /^0x[0-9a-f]{1,8}$/iu.test(value), `${label} is not a 32-bit address`);
  return Number.parseInt(value.slice(2), 16);
};

function fingerprint(path) {
  const bytes = read(path);
  return { path: rel(path), bytes: bytes.length, sha256: hash(bytes) };
}

function capture(root, name) {
  return fingerprint(resolve(root, 'capture', name));
}

function summarizeRun(rootArg, role, manifest, runnerSha256) {
  const root = resolve(ROOT, rootArg);
  assert(insideRoot(root), `${role}: run path escapes the repository`);
  const summaryPath = resolve(root, 'summary.json');
  const summaryBytes = read(summaryPath);
  const summary = JSON.parse(summaryBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  assert(summary.runId === root.split(sep).at(-1), `${role}: run ID does not match its directory`);
  assert(summary.complete === true && summary.mode === 'writer-stream-seed-1234'
    && summary.smallImage === false && summary.probeCompletionSatisfied === true
    && summary.runnerSha256 === runnerSha256,
  `${role}: incomplete run or runner-source mismatch`);
  assert(summary.installerSha256 === manifest.source.sha256,
    `${role}: installer hash differs from extracted manifest`);
  const exePath = resolve(root, 'runtime/AARON.exe');
  const exe = read(exePath);
  const manifestExe = manifest.files.find((item) => item.installedName === 'AARON.exe');
  assert(manifestExe && exe.length === manifestExe.bytes && hash(exe) === manifestExe.sha256,
    `${role}: runtime executable differs from extracted manifest`);
  const files = Object.fromEntries(Object.entries(ARTIFACTS)
    .map(([key, name]) => [key, capture(root, name)]));
  const sceneSources = Object.fromEntries(SCENE_SOURCES.map((name) => [name, capture(root, name)]));
  assert(summary.aa0Sha256 === files.aa0.sha256, `${role}: AA0 hash differs from runner summary`);
  assert(summary.sceneReportSha256 === files.sceneSnapshot.sha256,
    `${role}: scene-state report hash differs from runner summary`);
  const header = read(resolve(ROOT, files.aa0.path)).toString('ascii').split(/\r?\n/u, 1)[0];
  const dimensions = /^(\d+)\s+(\d+)\s+(\d+)$/u.exec(header);
  assert(dimensions, `${role}: malformed AA0 dimensions header`);
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
      probePauseSeconds: summary.preSceneProbePauseSeconds,
      probeCompletionSatisfied: summary.probeCompletionSatisfied,
      installerSha256: summary.installerSha256,
      registryPatchSha256: summary.registryPatchSha256,
      licensePatchSha256: summary.licensePatchSha256,
      runnerSha256: summary.runnerSha256,
      runtimeExecutableSha256: hash(exe),
      runtimePllSha256: hash(read(resolve(root, 'runtime/AARON.pll'))),
      summarySha256: hash(summaryBytes),
      aa0Dimensions: { width: Number(dimensions[1]), height: Number(dimensions[2]), headerValue: Number(dimensions[3]) },
      files,
      sceneSources,
    },
  };
}

function main() {
  const [outputArg, beforeArg, observerArg, afterArg, mapArg, ...extra] = process.argv.slice(2);
  assert(extra.length === 0,
    'Usage: node derive-pick-native-caller-evidence.mjs [output.json] [before-root] [observer-root] [after-root] [native-code-map.json]');
  const output = resolve(ROOT, outputArg ?? 'research/introspection/evidence/pick-native-caller-20261014.json');
  assert(insideRoot(output), 'Evidence output must remain inside the repository');
  assert(!existsSync(output), `Evidence output must be fresh: ${rel(output)}`);

  const manifest = readJson(MANIFEST_PATH);
  const runnerSha256 = hash(read(RUNNER_PATH));
  const runs = [
    summarizeRun(beforeArg ?? DEFAULT_RUNS.before, 'fresh uninstrumented control before', manifest, runnerSha256),
    summarizeRun(observerArg ?? DEFAULT_RUNS.observer, 'PICK caller observer', manifest, runnerSha256),
    summarizeRun(afterArg ?? DEFAULT_RUNS.after, 'fresh uninstrumented control after', manifest, runnerSha256),
  ];
  const [before, observer, after] = runs;
  for (const field of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'runtimeExecutableSha256', 'runtimePllSha256']) {
    assert(before.row[field] === observer.row[field] && observer.row[field] === after.row[field],
      `Triplet setup differs for ${field}`);
  }
  for (const control of [before, after]) {
    assert(control.row.preSceneProbeSha256 === null && control.row.probeOutputNames.length === 0
      && control.row.probePauseSeconds === 0
      && (control.summary.requiredProbeOutputName ?? '') === ''
      && (control.summary.requiredProbeEndMarker ?? '') === '',
    `${control.row.runId}: expected a no-probe, no-pause control`);
  }

  const equalArtifacts = Object.keys(ARTIFACTS).map((key) => {
    const expected = before.row.files[key].sha256;
    assert(observer.row.files[key].sha256 === expected && after.row.files[key].sha256 === expected,
      `Before/observer/after output differs: ${key}`);
    return { name: key, ...before.row.files[key] };
  });
  const equalSources = SCENE_SOURCES.map((name) => {
    const expected = before.row.sceneSources[name].sha256;
    assert(observer.row.sceneSources[name].sha256 === expected && after.row.sceneSources[name].sha256 === expected,
      `Before/observer/after ordinary scene source differs: ${name}`);
    return { name, ...before.row.sceneSources[name] };
  });

  const observerRoot = observer.root;
  const requestPath = resolve(observerRoot, 'pre-scene-probe-request.json');
  const requestBytes = read(requestPath);
  const request = JSON.parse(requestBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const probePath = resolve(observerRoot, 'capture/aaron-pre-scene-probe.cl');
  const probeBytes = read(probePath);
  const metadataPath = resolve(observerRoot, 'capture/aaron-pick-native-links.txt');
  const metadataBytes = read(metadataPath);
  const metadata = metadataBytes.toString('utf8').replace(/\r\n/gu, '\n');
  const endMarker = 'END pick-native-links';
  assert(request.schemaVersion === 1 && request.runId === observer.row.runId
    && request.pauseSeconds === 120 && request.runnerSha256 === runnerSha256
    && request.requiredProbeOutputName === 'aaron-pick-native-links.txt'
    && request.requiredProbeEndMarker === endMarker
    && request.probeOutputNames.length === 1 && request.probeOutputNames[0] === 'aaron-pick-native-links.txt',
  'Observer request is not the expected source-bound PICK metadata pause');
  const probeSha256 = hash(probeBytes);
  assert(probeSha256 === request.probeSha256 && probeSha256 === observer.summary.preSceneProbeSha256,
    'Observer probe source does not match its request and runner summary');
  assert(metadata.startsWith('BEGIN pick-native-links\n')
    && metadata.includes('READY pick-native-links\n')
    && metadata.endsWith(`NATIVE-CAPTURE-WAIT released=T\n${endMarker}\n`),
  'Observer metadata lacks its complete source-bound READY/capture/END sequence');
  assert(hash(metadataBytes) === observer.summary.requiredProbeOutputSha256,
    'Observer metadata output hash differs from its runner summary');

  const callerPath = resolve(observerRoot, 'pick-native-caller.json');
  const callerBytes = read(callerPath);
  const caller = JSON.parse(callerBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const mapPath = resolve(ROOT, mapArg ?? DEFAULT_MAP);
  const mapBytes = read(mapPath);
  const map = JSON.parse(mapBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const nativeManifestPath = resolve(ROOT, NATIVE_MANIFEST);
  const nativeManifestBytes = read(nativeManifestPath);
  const nativeManifest = JSON.parse(nativeManifestBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const mapSha256 = hash(mapBytes);
  const nativeManifestSha256 = hash(nativeManifestBytes);
  const executedHelper = fingerprint(EXECUTED_HELPER_PATH);
  const currentHelper = fingerprint(CURRENT_HELPER_PATH);
  const debuggerHelper = fingerprint(DEBUGGER_HELPER_PATH);
  assert(caller.schemaVersion === 1 && caller.outcome === 'entry-hit'
    && caller.oracleRunId === observer.row.runId && caller.expectedMode === 'writer-stream-seed-1234'
    && caller.sourceProbeSha256 === probeSha256 && caller.stagedProbeSha256 === probeSha256
    && caller.runnerSha256 === runnerSha256 && caller.sourceMapSha256 === mapSha256
    && caller.mapCaptureManifestSha256 === nativeManifestSha256
    && caller.captureHelperSha256 === executedHelper.sha256
    && caller.debuggerHelperSha256 === debuggerHelper.sha256
    && caller.currentPllSha256 === observer.row.runtimePllSha256,
  'Caller report is not bound to the current observer, captured helper, native map and runtime images');
  assert(map.captureManifestSha256 === nativeManifestSha256
    && map.pll.sha256 === observer.row.runtimePllSha256
    && map.functions.length === 11 && nativeManifest.functions.length === 11,
  'Native map or source capture manifest identity is incomplete');
  const reportNames = [...caller.liveFunctions].map((fn) => fn.name).sort();
  const mapNames = [...map.functions].map((fn) => fn.name).sort();
  assert(reportNames.join(',') === mapNames.join(','), 'Caller report and map function sets differ');
  for (const fn of map.functions) {
    const live = caller.liveFunctions.find((item) => item.name === fn.name);
    assert(fn.uniqueCompleteObjectByteMatch && live?.exactPllObjectMatch
      && live?.exactCurrentLivePayloadMatch && live.payloadSha256 === fn.payloadSha256
      && live.payloadBytes === fn.payloadBytes && live.entry === fn.runtime.entry,
    `Mapped/live payload identity failed for ${fn.name}`);
  }
  assert(caller.hit?.debugRegistersRestored === true
    && caller.hit?.debugSessionEndedByTargetExit === true
    && caller.hit?.returnAddress === caller.immediateReturn?.address
    && caller.immediateReturn?.status === 'unresolved-outside-mapped-intervals'
    && caller.boundedFrameReturns.length === 8
    && caller.boundedFrameReturns.every((frame) => frame.return.status === 'unresolved-outside-mapped-intervals'),
  'PICK entry hit or its bounded stack-return result differs from the observed unresolved caller');

  const pllPath = resolve(observerRoot, 'runtime/AARON.pll');
  const pll = read(pllPath);
  const table = parseIndexTable(pll, DEFAULT_PLL_LAYOUT.firstTableOffset, {
    expectedCount: DEFAULT_PLL_LAYOUT.firstTableCount,
    label: 'PICK caller PLL object table',
  });
  const index = parseCompiledObjectTable(pll, table, {
    objectBase: table.offset,
    expectedTag: 0x6c,
    finalBoundary: DEFAULT_PLL_LAYOUT.stringTableOffset,
  });
  for (const flag of ['objectOffsetsDistinct', 'allExpectedTag', 'allLengthFieldsMatchSecondWord',
    'boundaryAgreement', 'finalBoundaryMatchesExpected', 'allPaddingZero']) {
    assert(index[flag] === true, `PLL indexed object validation failed: ${flag}`);
  }
  const bases = [...new Set(map.functions.map((fn) => (
    address(fn.runtime.entry, `${fn.name} entry`) - fn.pll.payloadOffset
  )))];
  assert(bases.length === 1, 'The 11 current live-validated functions do not share one runtime/PLL address base');
  const runtimeBase = bases[0];
  const returnAddress = address(caller.hit.returnAddress, 'PICK immediate return address');
  const pllPayloadOffset = returnAddress - runtimeBase;
  const containing = index.objects.filter((object) => (
    pllPayloadOffset >= object.objectOffset + 4 && pllPayloadOffset < object.rawEnd
  ));
  assert(containing.length === 1, `Expected one indexed PLL code object at the return address; found ${containing.length}`);
  const object = containing[0];
  const payloadOffset = object.objectOffset + 4;
  const payloadLength = object.rawEnd - payloadOffset;
  const payload = pll.subarray(payloadOffset, object.rawEnd);
  const entry = runtimeBase + payloadOffset;
  const inNamedCandidates = map.functions.filter((fn) => {
    const start = address(fn.runtime.entry, `${fn.name} entry`);
    return returnAddress >= start && returnAddress < start + fn.payloadBytes;
  });
  assert(inNamedCandidates.length === 0 && caller.immediateReturn.function === null,
    'The immediate return unexpectedly falls inside a named live-validated candidate');
  const returnOffset = returnAddress - entry;
  const callAddress = returnAddress - 3;
  const callOffset = callAddress - runtimeBase;
  const callBytes = pll.subarray(callOffset, callOffset + 3);
  assert(returnOffset === 203 && callBytes.toString('hex') === 'ff5727',
    'The indexed object bytes do not match the measured immediate return/call site');

  const references = [...metadata.matchAll(/^REFERENCE root="([A-Z][A-Z0-9-]*)" path=/gmu)]
    .map((match) => match[1]).sort();
  const referenceNames = [...new Set(references)];
  assert(referenceNames.length === 9 && new Set(caller.candidateNames).size === 9
    && referenceNames.join(',') === [...caller.candidateNames].sort().join(','),
  'The completed metadata census differs from the nine recorded candidate roots');

  const failurePath = resolve(observerRoot, 'pick-native-caller-validation-failure-1.json');
  const evidence = {
    schemaVersion: 1,
    status: 'measured-bounded-native-caller-object',
    scope: 'First natural PICK entry hit in one source-bound seed-1234 writer-stream scene at measured 320x480',
    directCaller: {
      outcome: 'return-address-mapped-to-one-anonymous-compiled-object',
      lispFunctionName: null,
      nameResolution: 'unresolved; the current metadata and static references do not uniquely name this compiled object',
      runtime: { addressBase: `0x${runtimeBase.toString(16)}`, entry: `0x${entry.toString(16)}`,
        returnAddress: `0x${returnAddress.toString(16)}`, payloadOffset: returnOffset,
        returnOutsideElevenNamedCandidates: true },
      pll: { sha256: sha256(pll), indexedObjectCount: index.objectCount,
        recordOffset: object.recordOffset, objectOffset: object.objectOffset, payloadOffset,
        rawEnd: object.rawEnd, nextBoundary: object.nextBoundary, payloadBytes: payloadLength,
        payloadSha256: sha256(payload), objectSha256: sha256(pll.subarray(object.objectOffset, object.rawEnd)) },
      callSite: { runtimeAddress: `0x${callAddress.toString(16)}`, payloadOffset: returnOffset - 3,
        bytesHex: callBytes.toString('hex'), encoding: 'x86 indirect near CALL [EDI+0x27]',
        returnsToCapturedPickEntry: true, dynamicTargetResolved: false },
    },
    callerCapture: {
      report: fingerprint(callerPath), runId: observer.row.runId,
      entryAddress: caller.hit.entry, exceptionCode: caller.hit.exceptionCode,
      firstChance: caller.hit.firstChance, returnAddress: caller.hit.returnAddress,
      debugRegistersRestored: caller.hit.debugRegistersRestored,
      debuggerSessionEndedByTargetExit: caller.hit.debugSessionEndedByTargetExit,
      eightBoundedFrameReturnsRemainUnresolved: true,
    },
    controls: {
      runs: runs.map(({ row }) => row),
      outputsMatchAcrossBeforeObserverAfter: equalArtifacts,
      ordinaryStagedSourcesMatchAcrossBeforeObserverAfter: equalSources,
      callerWasSourceBoundToCompleteProbe: true,
      aa0Dimensions: before.row.aa0Dimensions,
      sceneOutputsByteIdentical: true,
      sceneInputsByteIdentical: true,
    },
    sourceBinding: {
      runnerSha256,
      probeSha256,
      requiredProbeOutputSha256: hash(metadataBytes),
      request: fingerprint(requestPath),
      archivedProbeSource: fingerprint(probePath),
      archivedMetadata: fingerprint(metadataPath),
      sourceMap: { ...fingerprint(mapPath), sourceCaptureManifestSha256: nativeManifestSha256 },
      pll: fingerprint(pllPath),
      executedCaptureHelper: executedHelper,
      currentReusableCaptureHelper: currentHelper,
      debuggerHelper,
      preservedInitialFailureReport: existsSync(failurePath) ? fingerprint(failurePath) : null,
    },
    staticReferenceCensus: {
      ownBindings: 1347, compiledScanned: 1380, referenceCount: references.length,
      uniqueReferenceRoots: referenceNames,
      errors: 0, truncated: 0,
      interpretation: 'Static symbol references identify candidates only; none establishes this direct caller.',
    },
    limitations: [
      'This result covers only the first PICK entry in this one 320x480 seed-1234 scene.',
      'The 11 named candidate payloads were matched completely to the PLL and live process; the anonymous caller payload was located by the shared address base and validated PLL object table, but its bytes were not separately read from live process memory.',
      'The call target stored through [EDI+0x27] was not recovered, and the containing Lisp function name remains unresolved.',
      'Eight bounded EBP frame returns do not identify further callers or a general call graph.',
      'This adds no JavaScript behavior contract and proves no scene or painting parity.',
    ],
  };
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output: rel(output), status: evidence.status,
    callerObject: evidence.directCaller.runtime, callBytes: callBytes.toString('hex'),
    controlsMatch: true, evidenceSha256: hash(read(output)) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
