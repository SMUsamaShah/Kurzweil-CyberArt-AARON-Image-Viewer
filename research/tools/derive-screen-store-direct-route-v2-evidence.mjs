import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const tripletId = 'sstore-v2-20261027-104238-18bd6013';
const localOracle = 'research/extracted/local-oracle';
const summaryRelative = `${localOracle}/screen-store-call-return-triplet-v2-logs/${tripletId}/source-bound-triplet-summary.json`;
const summary = readJson(summaryRelative);
const observerRelative = `${localOracle}/external-runs/${tripletId}-observer`;
const reportRelative = `${observerRelative}/capture/screen-store-call-return-no-tf-v2.json`;
const report = readJson(reportRelative);
const capture = report.debuggerResult;
const metadataRelative = `${observerRelative}/capture/aaron-screen-store-call-return-metadata-v1.txt`;
const mapRelative = `${observerRelative}/native-code/mapped/native-code-map.json`;
const manifestRelative = `${observerRelative}/native-code/manifest.json`;
const payloadRelative = `${observerRelative}/native-code/mapped/screen-and-store.native-payload.bin`;
const windowRelative = `${observerRelative}/native-code/screen-and-store.native-window.bin`;
const requestRelative = `${observerRelative}/pre-scene-probe-request.json`;
const outputRelative = 'research/introspection/evidence/screen-and-store-direct-route-sstore-v2-20261027.json';

function readBytes(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(readBytes(relativePath));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function shaFile(relativePath) {
  return sha256(readBytes(relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkHash(relativePath, expected, label = relativePath) {
  const actual = shaFile(relativePath);
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`);
  return actual;
}

assert(summary.tripletId === tripletId, 'Unexpected triplet id');
assert(summary.status === 'accepted' && summary.accepted === true && summary.tripletValid === true,
  'The completed triplet summary is not accepted and valid');
assert(summary.pathOutcome === 'direct-331' && summary.reached331 === true,
  'The completed triplet summary does not establish direct-331');
assert(report.accepted === true && capture.accepted === true && capture.reached331 === true,
  'The observer report did not accept the +0x331 route');
assert(capture.terminalInstructionNotYetExecuted === true,
  'The observer did not stop before the +0x331 instruction');
assert(summary.controls.coreSceneDrawingPlanningAndStagedSourceVerifierPassed === true,
  'The fresh triplet controls did not pass');
assert(summary.settings.allRunsFresh === true && summary.settings.serialized === true,
  'The triplet was not fresh and serialized');
assert(['before', 'observer', 'after'].every((name) => summary.runSummaries[name]?.complete === true),
  'At least one bracketed run is incomplete');

const summarySha256 = checkHash(summaryRelative, 'b84627590552ec980d8769d4b026eaef9cdd85344b4db89f9e17fafa0d2f894e', 'triplet summary');
const reportSha256 = checkHash(reportRelative, summary.observerCapture.reportSha256, 'raw debugger report');
const metadataSha256 = checkHash(metadataRelative, summary.observerMetadata.sha256, 'compiled-function metadata');
const mapSha256 = checkHash(mapRelative, summary.observerCapture.mapSha256, 'native code map');
const manifestSha256 = checkHash(manifestRelative, 'b82d03c94708b49e0702e93d64714daa2d9866f84847a77b7417efd5f5d7f3ee', 'native capture manifest');
const payloadSha256 = checkHash(payloadRelative, summary.observerCapture.payloadSha256, 'mapped native payload');
const rawWindowSha256 = checkHash(windowRelative, '38d636f56b905291c0d19afe5ec05bd8084347a7fd95f0978dce1de1d2a06e20', 'native window');
const requestSha256 = checkHash(requestRelative, summary.observerCapture.requestSha256, 'observer request');

const metadataBytes = readBytes(metadataRelative);
const metadata = metadataBytes.toString('utf8');
assert(metadata.includes(summary.observerMetadata.ready) && metadata.includes(summary.observerMetadata.end),
  'Metadata READY/END markers are missing');
const readyMarkerAt = metadataBytes.indexOf(Buffer.from(summary.observerMetadata.ready, 'utf8'));
const readyLineEnd = metadataBytes.indexOf(0x0a, readyMarkerAt);
assert(readyMarkerAt >= 0 && readyLineEnd >= readyMarkerAt, 'Could not find the complete READY line');
const readyPrefixSha256 = sha256(metadataBytes.subarray(0, readyLineEnd + 1));
assert(readyPrefixSha256 === summary.observerMetadata.readyPrefixSha256,
  'The READY-prefix hash does not match the triplet summary');

const map = readJson(mapRelative);
const mappedFunction = map.functions.find((fn) => fn.name === 'SCREEN-AND-STORE');
assert(mappedFunction?.uniqueCompleteObjectByteMatch === true, 'Unique complete PLL object match is absent');
assert(mappedFunction.payloadSha256 === payloadSha256 && mappedFunction.payloadBytes === 1224,
  'Mapped function payload identity does not match the debugger report');
assert(mappedFunction.runtime.entry === capture.liveEntry, 'Live entry differs from the native map');

const sourceBindings = {};
for (const [name, binding] of Object.entries(summary.sourceHashes)) {
  const actual = shaFile(binding.path);
  assert(actual === binding.sha256, `Source binding changed: ${name} (${binding.path})`);
  sourceBindings[name] = { path: binding.path, sha256: actual };
}

const controlHashes = summary.controls.comparedSceneDrawingAndPlanningOutputs;
const runRoots = Object.fromEntries(['before', 'observer', 'after'].map((name) => [
  name,
  `${localOracle}/external-runs/${tripletId}-${name}`,
]));
const comparedControlHashes = {};
for (const [artifact, expectedHash] of Object.entries(controlHashes)) {
  const copies = {};
  for (const [runName, runRoot] of Object.entries(runRoots)) {
    const actual = shaFile(`${runRoot}/${artifact}`);
    assert(actual === expectedHash, `${runName} control ${artifact} differs from the accepted summary`);
    copies[runName] = actual;
  }
  comparedControlHashes[artifact] = { sha256: expectedHash, runs: copies };
}

const stagedSourceCopies = {};
for (const [name, expectedHash] of Object.entries(summary.controls.stagedSourceHashes)) {
  const copies = {};
  for (const [runName, runRoot] of Object.entries(runRoots)) {
    const actual = shaFile(`${runRoot}/capture/${name}`);
    assert(actual === expectedHash, `${runName} staged source ${name} differs from the accepted summary`);
    copies[runName] = actual;
  }
  stagedSourceCopies[name] = { sha256: expectedHash, runs: copies };
}

const events = capture.events;
assert(events.length === 10, `Expected 10 ordered events, got ${events.length}`);
const processIds = new Set(events.map((event) => event.processId));
const threadIds = new Set(events.map((event) => event.threadId));
const ebps = new Set(events.map((event) => event.registers.ebp));
assert(processIds.size === 1 && threadIds.size === 1 && ebps.size === 1,
  'The route events do not share a process, thread, and EBP frame');
const eventOffsets = [0x2a6, null, 0x2a8, 0x2b7, 0x2bc, 0x2c3, 0x2c5, 0x2c7, 0x2cd, 0x331];
const eventProjection = events.map((event, index) => ({
  order: event.order,
  kind: event.kind,
  threadId: event.threadId,
  ...(eventOffsets[index] === null ? {} : { payloadOffset: `0x${eventOffsets[index].toString(16)}` }),
  address: event.registers.eip,
  bytesHex: event.details.callBytesHex ?? event.details.branchBytesHex ?? event.details.targetBytesHex ?? event.details.jumpBytesHex ?? event.details.targetWindowAtEntryHex,
  registers: Object.fromEntries(['esp', 'ebp', 'eax', 'edx', 'edi', 'eflags'].filter((name) => event.registers[name] !== undefined)
    .map((name) => [name, event.registers[name]])),
  details: event.details,
}));

assert(capture.routeInstructionRechecks.length === 12 && capture.routeInstructionRechecks.every((check) => check.allExact === true),
  'One or more of the twelve route instruction rechecks failed');
assert(capture.payloadRechecks.length === 11 && capture.payloadRechecks.every((check) => check.exactMatch === true),
  'One or more complete-payload rechecks failed');
assert(capture.debugRegistersRestored && capture.detachSucceeded && capture.cleanupErrors.length === 0,
  'Debugger restoration, detach, or cleanup gate failed');

const evidence = {
  schemaVersion: 1,
  investigation: 'Source-bound SCREEN-AND-STORE route through the direct +0x331 successor',
  status: 'accepted-bounded-native-observation; no-JavaScript-contract',
  triplet: {
    id: tripletId,
    mode: summary.mode,
    allThreeRunsFresh: summary.settings.allRunsFresh,
    serialized: summary.settings.serialized,
    runs: Object.fromEntries(Object.entries(summary.runSummaries).map(([name, run]) => [name, {
      id: run.runId,
      complete: run.complete,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      aa0Sha256: run.aa0Sha256,
      sceneReportSha256: run.sceneReportSha256,
    }])),
    verifierPassed: summary.controls.coreSceneDrawingPlanningAndStagedSourceVerifierPassed,
    comparedControlHashes,
    stagedSourceHashes: stagedSourceCopies,
  },
  sourceBinding: {
    runtimeExecutableSha256: summary.sourceHashes.extractedAaronExe.sha256,
    runtimePllSha256: summary.sourceHashes.extractedAaronPll.sha256,
    functionObject: {
      name: 'COMMON-GRAPHICS-USER::SCREEN-AND-STORE',
      type: 'COMPILED-FUNCTION',
      metadataSha256,
      readyPrefixSha256,
      endMarkerObserved: true,
    },
    mappedNativePayload: {
      liveEntry: capture.liveEntry,
      bytes: mappedFunction.payloadBytes,
      sha256: payloadSha256,
      nativeMapSha256: mapSha256,
      rawWindowSha256,
      pllObjectOffset: mappedFunction.pll.objectOffset,
      pllPayloadOffset: mappedFunction.pll.payloadOffset,
      objectBytes: mappedFunction.objectBytes,
      objectSha256: mappedFunction.objectSha256,
      uniqueCompleteObjectByteMatch: mappedFunction.uniqueCompleteObjectByteMatch,
    },
    captureSources: sourceBindings,
    originalArtifacts: {
      tripletSummary: { path: summaryRelative, sha256: summarySha256 },
      noTfCaptureReport: { path: reportRelative, sha256: reportSha256 },
      nativeMap: { path: mapRelative, sha256: mapSha256 },
      nativeManifest: { path: manifestRelative, sha256: manifestSha256 },
      observerRequest: { path: requestRelative, sha256: requestSha256 },
    },
  },
  observation: {
    pathOutcome: capture.pathOutcome,
    reached331: capture.reached331,
    tripletValidityEstablishedInObserverReport: report.tripletValidityEstablished,
    tripletValidityEstablishedByCompletedSummary: summary.tripletValid,
    sameProcess: true,
    sameThread: true,
    sameEbpFrame: true,
    processId: capture.processId,
    threadId: [...threadIds][0],
    events: eventProjection,
    completePayloadRechecks: {
      count: capture.payloadRechecks.length,
      allExact: true,
      sha256: payloadSha256,
    },
    routeInstructionRechecks: {
      count: capture.routeInstructionRechecks.length,
      allExact: true,
      phases: capture.routeInstructionRechecks.map((check) => check.phase),
    },
    debugger: {
      initialAndPreReleaseFileIdentityMatched: capture.preReleaseSameIdentityAsInitial,
      breakpointsArmedBeforeRelease: capture.breakpointsArmedBeforeRelease,
      readyPauseReleased: capture.readyPauseReleased,
      debugRegistersRestored: capture.debugRegistersRestored,
      detached: capture.detachSucceeded,
      cleanupErrors: capture.cleanupErrors,
      debugStateTransitionCount: capture.debugStateTransitions.length,
      debugStateRestorationCount: capture.debugStateRestorations.length,
      cleanupReceipt: capture.cleanupReceipt,
    },
  },
  scope: {
    proves: [
      'In this source-bound invocation, the observed +0x2b7 JNZ took its +0x2bc successor, the +0x2c3 JNZ fell through to +0x2c5, the +0x2c7 JZ fell through to +0x2cd, and the +0x2cd short JMP reached +0x331 on the same thread.',
      'The +0x331 execute event occurred before bytes 8b 46 7e executed.',
      'The completed before/observer/after triplet passed the saved drawing, scene, planning, and staged-source comparisons; nine compared artifacts and ten staged sources match across all three roots.',
      'The mapped 1,224-byte payload is a unique complete object match in the bound original PLL, and all eleven complete-payload and twelve route-instruction recheck groups passed.',
    ],
    doesNotProve: [
      'Execution of the +0x331 instruction or any instruction-by-instruction trace from +0x331 through +0x34a.',
      'Execution, target entry, or return for the second CALL EDI at +0x34a; the capture stopped at +0x331.',
      'A Lisp name, source body, ABI, or semantic type for any raw native target or register value.',
      'A direct Lisp caller relationship, a JavaScript behavior contract, or whole-painting parity.',
      'That this route or branch outcome is universal; it is one bounded invocation.',
    ],
  },
};

const outputBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
const outputPath = path.join(repoRoot, outputRelative);
if (process.argv.includes('--verify')) {
  const existing = fs.readFileSync(outputPath);
  assert(existing.equals(outputBytes), 'Existing evidence differs from deterministic derivation');
  process.stdout.write(`verified ${outputRelative} ${sha256(outputBytes)}\n`);
} else {
  fs.writeFileSync(outputPath, outputBytes);
  process.stdout.write(`wrote ${outputRelative} ${sha256(outputBytes)}\n`);
}
