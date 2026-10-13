#!/usr/bin/env node
// Offline derivation only. This helper never launches AARON or attaches a debugger.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAP_PATH = 'research/extracted/local-oracle/zero-edge-native-caller-map-20261013-a/native-code-map.json';
const STATIC_MAP_PATH = 'research/extracted/local-oracle/brush-buffer-native-seed1234-20261005-c/native-code/mapped/native-code-map.json';
const PLL_PATH = 'research/extracted/aaron/application/AARON.pll';
const MANIFEST_PATH = 'research/extracted/aaron/manifest.json';
const TOOLCHAIN_PATH = 'research/artifacts/rea-tools/toolchain-current.json';
const STATIC_ROOT = 'research/artifacts/rea-tools/buffer-hole-static-20261013';
const FUNCTION_ROOT = 'research/artifacts/rea-tools/buffer-hole-function-20261013';
const CALL_ROOT = 'research/artifacts/rea-tools/buffer-hole-calltarget-20261013';
const RAW_GHIDRA_PATH = 'research/extracted/local-oracle/brush-buffer-native-seed1234-20261005-c/native-code/mapped/ghidra/buffer-hole.ghidra.json';
const RUNNER_PATH = 'research/oracle/run-local-scene-state-required-probe.ps1';
const CAPTURE_PATH = 'research/tools/capture-buffer-hole-caller.ps1';
const DEBUGGER_PATH = 'research/oracle/AaronCallerBreakpoint.cs';
const PROBE_PATH = 'research/introspection/zero-edge-native-caller-links.cl';
const DEFAULT_OUTPUT = 'research/introspection/evidence/buffer-hole-native-investigation-20261013.json';
const RUNS = Object.freeze({
  before: 'research/extracted/local-oracle/external-runs/buffer-hole-canvas-control-20261013',
  observer: 'research/extracted/local-oracle/external-runs/buffer-hole-native-caller-observer-20261013',
  after: 'research/extracted/local-oracle/external-runs/buffer-hole-native-caller-control-after-20261013',
});
const FILES = Object.freeze({
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
const END_MARKER = 'END zero-edge-native-caller-links';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = path => path.replaceAll('\\', '/');
const inside = (base, path) => {
  const value = relative(base, path);
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`) && !/^[A-Z]:/iu.test(value);
};
const sources = new Map();

function bind(path, label = portable(path)) {
  const absolute = resolve(ROOT, path);
  assert(inside(ROOT, absolute), `Source path escapes the repository: ${path}`);
  const bytes = readFileSync(absolute);
  const row = { path: label, bytes: bytes.length, sha256: sha256(bytes) };
  const previous = sources.get(label);
  assert(!previous || (previous.row.bytes === row.bytes && previous.row.sha256 === row.sha256),
    `Source changed while deriving evidence: ${label}`);
  sources.set(label, { absolute, row });
  return bytes;
}

function readJson(path) {
  return JSON.parse(bind(path).toString('utf8').replace(/^\uFEFF/u, ''));
}

function runInfo(rootRel, role, manifest, expectedRunnerHash, expectedProbeHash) {
  const root = resolve(ROOT, rootRel);
  assert(inside(ROOT, root), `${role}: run root escapes the repository`);
  const summaryPath = `${rootRel}/summary.json`;
  const summary = readJson(summaryPath);
  const runId = rootRel.split('/').at(-1);
  assert(summary.runId === runId && summary.complete === true && summary.probeCompletionSatisfied === true,
    `${role}: run is incomplete or has an unexpected run ID`);
  assert(summary.mode === 'writer-stream-seed-1234' && summary.smallImage === false,
    `${role}: wrong AARON mode`);
  assert(summary.runnerSha256 === expectedRunnerHash && summary.installerSha256 === manifest.source.sha256,
    `${role}: runner or installer source differs`);
  const manifestExe = manifest.files.find(file => file.installedName === 'AARON.exe');
  const manifestPll = manifest.files.find(file => file.installedName === 'AARON.pll');
  assert(manifestExe && manifestPll, 'Extracted manifest lacks AARON.exe or AARON.pll');
  const executable = bind(`${rootRel}/runtime/AARON.exe`);
  const pll = bind(`${rootRel}/runtime/AARON.pll`);
  assert(executable.length === manifestExe.bytes && sha256(executable) === manifestExe.sha256,
    `${role}: disposable executable differs from the manifest`);
  assert(pll.length === manifestPll.bytes && sha256(pll) === manifestPll.sha256,
    `${role}: disposable PLL differs from the manifest`);
  bind(`${rootRel}/runtime/registry.dll`);
  bind(`${rootRel}/runtime/license.dll`);

  const files = Object.fromEntries(Object.entries(FILES).map(([key, name]) => {
    const path = `${rootRel}/capture/${name}`;
    const bytes = bind(path);
    return [key, { path, bytes: bytes.length, sha256: sha256(bytes) }];
  }));
  const sceneSources = Object.fromEntries(SCENE_SOURCES.map(name => {
    const path = `${rootRel}/capture/${name}`;
    const bytes = bind(path);
    return [name, { path, bytes: bytes.length, sha256: sha256(bytes) }];
  }));
  assert(summary.aa0Sha256 === files.aa0.sha256 && summary.sceneReportSha256 === files.sceneSnapshot.sha256,
    `${role}: summary hashes differ from archived outputs`);
  const header = files.aa0.path && readFileSync(resolve(ROOT, files.aa0.path)).toString('ascii').split(/\r?\n/u, 1)[0];
  const dimensions = /^(\d+)\s+(\d+)\s+(\d+)$/u.exec(header ?? '');
  assert(dimensions, `${role}: AA0 header is malformed`);
  const aa0Dimensions = { width: Number(dimensions[1]), height: Number(dimensions[2]), headerValue: Number(dimensions[3]) };
  const summaryBytes = readFileSync(resolve(ROOT, summaryPath));
  const start = Date.parse(summary.startedAt), finish = Date.parse(summary.finishedAt);
  assert(Number.isFinite(start) && Number.isFinite(finish) && finish >= start, `${role}: invalid run times`);
  const row = {
    runId, role, path: rootRel, complete: summary.complete,
    mode: summary.mode, smallImage: summary.smallImage, aa0Dimensions,
    runnerSha256: summary.runnerSha256,
    installerSha256: summary.installerSha256,
    registryPatchSha256: summary.registryPatchSha256,
    licensePatchSha256: summary.licensePatchSha256,
    startedAt: summary.startedAt, finishedAt: summary.finishedAt,
    runnerSessionSeconds: Math.round((finish - start) / 100) / 10,
    files, sceneSources,
  };
  if (role === 'BUFFER-HOLE entry observer') {
    assert(summary.preSceneProbeSha256 === expectedProbeHash && summary.probeOutputNames.includes('aaron-zero-edge-native-caller-links.txt') &&
      summary.requiredProbeOutputName === 'aaron-zero-edge-native-caller-links.txt' &&
      summary.requiredProbeEndMarker === END_MARKER && summary.probeCompletionSatisfied === true,
    `${role}: required source-bound probe is missing or incomplete`);
    row.preSceneProbeSha256 = summary.preSceneProbeSha256;
    row.preSceneProbePauseSeconds = summary.preSceneProbePauseSeconds;
  } else {
    assert(summary.preSceneProbeSha256 === null && summary.probeOutputNames.length === 0 &&
      summary.requiredProbeOutputName === '' && summary.requiredProbeEndMarker === '',
    `${role}: control was instrumented`);
  }
  return row;
}

const manifest = readJson(MANIFEST_PATH);
const runnerBytes = bind(RUNNER_PATH);
const runnerHash = sha256(runnerBytes);
const probeBytes = bind(PROBE_PATH);
const probeHash = sha256(probeBytes);
const captureBytes = bind(CAPTURE_PATH);
const captureHash = sha256(captureBytes);
bind(DEBUGGER_PATH);
const map = readJson(MAP_PATH);
const pll = bind(PLL_PATH);
assert(map.pll.bytes === pll.length && map.pll.sha256 === sha256(pll), 'PLL differs from the archived native map');
const mappedFunctions = ['BUFFER-HOLE', 'ZERO-EDGE'].map(name => {
  const rows = map.functions.filter(fn => fn.name === name);
  assert(rows.length === 1 && rows[0].uniqueCompleteObjectByteMatch === true,
    `Native map lacks one unique complete ${name} object`);
  const fn = rows[0];
  const payloadPath = `${dirname(MAP_PATH)}/${fn.payloadFile}`;
  const payload = bind(payloadPath);
  assert(payload.length === fn.payloadBytes && sha256(payload) === fn.payloadSha256,
    `${name}: payload hash or length differs`);
  const object = pll.subarray(fn.pll.objectOffset, fn.pll.rawEnd);
  assert(fn.pll.payloadOffset === fn.pll.objectOffset + 4 &&
    fn.pll.rawEnd - fn.pll.payloadOffset === payload.length &&
    payload.equals(pll.subarray(fn.pll.payloadOffset, fn.pll.rawEnd)) &&
    sha256(object) === fn.objectSha256 && pll.indexOf(object) === fn.pll.objectOffset &&
    pll.indexOf(object, fn.pll.objectOffset + 1) === -1,
  `${name}: complete object is not the exact unique PLL slice`);
  return { name, entry: fn.runtime.entry, payloadBytes: payload.length,
    payloadSha256: fn.payloadSha256, pllPayloadOffset: fn.pll.payloadOffset };
});

const toolchain = readJson(TOOLCHAIN_PATH);
assert(toolchain.reaVersion === '6.4.0', 'Unexpected current REA version');
const bindingPath = `${STATIC_ROOT}/buffer-hole.binding.json`;
const binding = readJson(bindingPath);
const staticMap = readJson(STATIC_MAP_PATH);
const staticBufferRows = staticMap.functions.filter(fn => fn.name === 'BUFFER-HOLE');
assert(staticBufferRows.length === 1 && staticBufferRows[0].payloadSha256 === mappedFunctions[0].payloadSha256,
  'REA static map and live caller map disagree on BUFFER-HOLE bytes');
const pePath = `${STATIC_ROOT}/buffer-hole.synthetic.exe`;
const pe = bind(pePath);
const peHash = sha256(pe);
const seedPath = `${STATIC_ROOT}/buffer-hole.seeds.tsv`;
const seed = bind(seedPath);
assert(binding.functionName === 'BUFFER-HOLE' && binding.generatedPe.sha256 === peHash &&
  binding.generatedPe.bytes === pe.length &&
  binding.assertions.generatedExecutableRun === false && binding.sourceMap.path === STATIC_MAP_PATH &&
  binding.sourceMap.sha256 === sources.get(STATIC_MAP_PATH).row.sha256 &&
  binding.originalPll.sha256 === sha256(pll) &&
  binding.generatedSeed.sha256 === sha256(seed) &&
  binding.originalPayload.sha256 === mappedFunctions[0].payloadSha256,
  'Generated static PE binding differs from exact BUFFER-HOLE inputs');
const functionReportPath = `${FUNCTION_ROOT}/rea-result.json`;
const functionReport = readJson(functionReportPath);
const functionInvocationPath = `${FUNCTION_ROOT}/rea-invocation.json`;
const functionInvocation = readJson(functionInvocationPath);
const functionStderr = bind(`${FUNCTION_ROOT}/rea-stderr.txt`);
const functionReportBytes = bind(functionReportPath);
assert(functionStderr.length === 0 && functionReport.operation === 'analyze_function' &&
  functionReport.subject.digest.sha256 === peHash && functionReport.normalized_result.procedure.address === mappedFunctions[0].entry &&
  functionInvocation.operation === 'function' && functionInvocation.input.sha256 === peHash &&
  functionInvocation.toolchain.sha256 === sources.get(TOOLCHAIN_PATH).row.sha256 &&
  functionInvocation.seed.sha256 === sha256(seed) &&
  functionInvocation.report.sha256 === sha256(functionReportBytes) &&
  functionInvocation.report.bytes === functionReportBytes.length && functionInvocation.staticOnly === true &&
  functionInvocation.inputWasExecuted === false,
'REA BUFFER-HOLE function report is incomplete or not bound to the static PE');
const normalized = functionReport.normalized_result;
const valueFlow = normalized.native_value_flow;
const calls = normalized.assembly.filter(line => /:\s+CALL\b/iu.test(line));
assert(normalized.assembly.length === 170 && normalized.procedure.body.total_bytes === 465 &&
  normalized.basic_blocks.length === 39 && normalized.outgoing_references.length === 63 &&
  normalized.callers.length === 0 && normalized.callees.length === 0 && calls.length === 32 &&
  valueFlow.available === true && valueFlow.operations.length === 246 && valueFlow.def_use.length === 228 &&
  valueFlow.truncated === false && valueFlow.omitted_operations_lower_bound === 0 &&
  valueFlow.known_omitted_inputs === 0 && valueFlow.known_omitted_edges === 0,
'REA BUFFER-HOLE function summary differs from the measured dossier');
const ghidra = readJson(RAW_GHIDRA_PATH);
assert(ghidra.subject.sha256 === mappedFunctions[0].payloadSha256 && ghidra.assembly.length === 170 &&
  ghidra.disassembledInstructions === 170, 'Standalone Ghidra BUFFER-HOLE input differs');
const instruction = text => text.toLowerCase().replace(/,\s*/gu, ', ').trim();
const rawAssembly = ghidra.assembly.map(row => `${row.address}: ${row.text}`);
assert(rawAssembly.length === normalized.assembly.length && rawAssembly.every((line, index) =>
  instruction(line) === instruction(normalized.assembly[index])),
'REA and standalone Ghidra BUFFER-HOLE instruction sequences differ');
const callSite = '0x1fe12d17';
assert(normalized.assembly.some(line => line.toLowerCase() === `${callSite}: call dword ptr [edi + 0x27]`),
  'Selected computed call site is absent from the function report');
const callReportPath = `${CALL_ROOT}/rea-result.json`;
const callReportBytes = bind(callReportPath);
const callReport = JSON.parse(callReportBytes.toString('utf8').replace(/^\uFEFF/u, ''));
const callInvocationPath = `${CALL_ROOT}/rea-invocation.json`;
const callInvocation = readJson(callInvocationPath);
const callStderr = bind(`${CALL_ROOT}/rea-stderr.txt`);
assert(callStderr.length === 0 && callReport.operation === 'resolve_native_call_targets' &&
  callReport.subject.digest.sha256 === peHash && callReport.normalized_result.call_site === callSite &&
  callReport.normalized_result.status === 'unresolved' && callReport.normalized_result.mechanism === 'computed' &&
  callReport.normalized_result.targets.length === 0 && callInvocation.report.sha256 === sha256(callReportBytes) &&
  callInvocation.toolchain.sha256 === sources.get(TOOLCHAIN_PATH).row.sha256 &&
  callInvocation.seed.sha256 === sha256(seed) &&
  callInvocation.staticOnly === true && callInvocation.inputWasExecuted === false,
'REA computed-call target query differs or lacks static PE binding');
const reaAnalysis = {
  version: toolchain.reaVersion,
  ghidraVersion: '12.1.4',
  staticOnly: true,
  generatedExecutableRun: false,
  generatedPe: { path: pePath, bytes: pe.length, sha256: peHash },
  functionReport: {
    path: functionReportPath,
    sha256: sha256(functionReportBytes),
    bytes: functionReportBytes.length,
    bodyBytes: normalized.procedure.body.total_bytes,
    payloadBytes: mappedFunctions[0].payloadBytes,
    instructions: normalized.assembly.length,
    basicBlocks: normalized.basic_blocks.length,
    outgoingReferences: normalized.outgoing_references.length,
    callInstructions: calls.length,
    callersInIsolatedPe: normalized.callers.length,
    calleesInIsolatedPe: normalized.callees.length,
    highPcodeOperations: valueFlow.operations.length,
    defUseEdges: valueFlow.def_use.length,
    highPcodeTruncated: valueFlow.truncated,
    knownOmittedInputs: valueFlow.known_omitted_inputs,
    knownOmittedEdges: valueFlow.known_omitted_edges,
    instructionSequenceMatchesStandaloneGhidra: true,
  },
  representativeComputedCall: {
    address: callSite,
    instruction: 'CALL dword ptr [EDI + 0x27]',
    status: callReport.normalized_result.status,
    mechanism: callReport.normalized_result.mechanism,
    targets: callReport.normalized_result.targets,
    reportPath: callReportPath,
    reportSha256: sha256(callReportBytes),
  },
  limitations: [
    'Synthetic PE headers, layout, function name and address context are analyst assertions; original payload bytes remain exact.',
    'The isolated static image contains no cross-object call graph; computed Lisp dispatch targets remain unresolved.',
    'The C signature and pseudocode do not recover the Lisp ABI or original source.',
  ],
};

const runRows = Object.entries(RUNS).map(([key, path]) => runInfo(path,
  key === 'observer' ? 'BUFFER-HOLE entry observer' : `fresh uninstrumented control ${key}`,
  manifest, runnerHash, probeHash));
const [before, observer, after] = runRows;
const equalOutputs = Object.entries(FILES).map(([key, name]) => {
  const a = before.files[key], b = observer.files[key], c = after.files[key];
  assert(a.sha256 === b.sha256 && a.sha256 === c.sha256 && a.bytes === b.bytes && a.bytes === c.bytes,
    `Drawing/scene output differs across before/observer/after: ${name}`);
  return { name, sha256: a.sha256, bytes: a.bytes };
});
const equalSceneSources = SCENE_SOURCES.map(name => {
  const a = before.sceneSources[name], b = observer.sceneSources[name], c = after.sceneSources[name];
  assert(a.sha256 === b.sha256 && a.sha256 === c.sha256 && a.bytes === b.bytes && a.bytes === c.bytes,
    `Staged scene source differs across before/observer/after: ${name}`);
  return { name, sha256: a.sha256, bytes: a.bytes };
});
assert(before.aa0Dimensions.width === observer.aa0Dimensions.width &&
  before.aa0Dimensions.width === after.aa0Dimensions.width &&
  before.aa0Dimensions.height === observer.aa0Dimensions.height &&
  before.aa0Dimensions.height === after.aa0Dimensions.height,
'Canvas differs across before/observer/after controls');
assert(before.aa0Dimensions.width === 320 && before.aa0Dimensions.height === 480,
  'This evidence derivation is pinned to the measured 320x480 scene');

const metadataPath = `${RUNS.observer}/capture/aaron-zero-edge-native-caller-links.txt`;
const metadataBytes = bind(metadataPath);
const metadata = metadataBytes.toString('utf8').replace(/\r\n/gu, '\n');
assert(metadata.startsWith('BEGIN zero-edge-native-caller-links\n') && metadata.endsWith(`${END_MARKER}\n`) &&
  /^TOTALS targets=2 functions=2 headers=2 constants=\d+ errors=0 truncations=0$/mu.test(metadata) &&
  /^ERROR-COUNT 0$/mu.test(metadata) && /^TRUNCATION-COUNT 0$/mu.test(metadata),
'Native headers report is incomplete, truncated, or contains errors');
const headers = new Map([...metadata.matchAll(/^HEADER name="([A-Z][A-Z0-9-]*)" bytes=([0-9a-fA-F]{128})$/gmu)]
  .map(match => [match[1], Buffer.from(match[2], 'hex')]));
assert(headers.size === 2, 'Expected fresh headers for BUFFER-HOLE and ZERO-EDGE');
for (const fn of mappedFunctions) {
  const header = headers.get(fn.name);
  assert(header && `0x${header.readUInt32LE(18).toString(16).padStart(8, '0')}` === fn.entry,
    `${fn.name}: live header entry differs from the archived mapping`);
}

const captureReportPath = `${RUNS.observer}/buffer-hole-native-caller.json`;
const captureReport = readJson(captureReportPath);
assert(captureReport.targetFunction === 'BUFFER-HOLE' && captureReport.oracleRunId === observer.runId &&
  captureReport.captureHelperSha256 === captureHash && captureReport.outcome === 'no-entry-within-deadline' &&
  captureReport.hit === null && captureReport.immediateReturnAddress === null,
'BUFFER-HOLE caller report differs from the expected bounded no-hit');
assert(captureReport.functions.length === 2 && mappedFunctions.every(fn => {
  const found = captureReport.functions.find(row => row.name === fn.name);
  return found && found.entry === fn.entry && found.payloadBytes === fn.payloadBytes &&
    found.payloadSha256 === fn.payloadSha256 && found.exactLivePayloadMatch === true;
}), 'Live function records do not match the complete PLL payloads');
assert(observer.preSceneProbePauseSeconds === 90, 'Unexpected required-probe pause duration');

const selfPath = portable(relative(ROOT, fileURLToPath(import.meta.url)));
bind(selfPath);
const outputPath = resolve(ROOT, process.argv[2] ?? DEFAULT_OUTPUT);
assert(inside(ROOT, outputPath), 'Evidence output must remain inside the repository');
assert(!existsSync(outputPath), `Refusing to overwrite evidence output: ${portable(relative(ROOT, outputPath))}`);
const evidence = {
  schemaVersion: 1,
  status: 'complete',
  claimScope: 'One source-bound 320x480 writer-stream scene; exact live code was checked before one entry breakpoint.',
  result: {
    targetFunction: 'BUFFER-HOLE',
    outcome: 'no-entry-before-process-exit',
    preSceneProbePauseSeconds: observer.preSceneProbePauseSeconds,
    observerRunnerSessionSeconds: observer.runnerSessionSeconds,
    functions: mappedFunctions,
    livePayloadChecks: captureReport.functions,
    returnAddress: null,
    observedCanvas: observer.aa0Dimensions,
  },
  reaStaticAnalysis: reaAnalysis,
  controls: {
    mode: 'writer-stream-seed-1234',
    smallImage: false,
    before: before.runId,
    observer: observer.runId,
    after: after.runId,
    outputsByteIdenticalAcrossAllThree: true,
    sceneSourcesByteIdenticalAcrossAllThree: true,
    equalOutputs,
    equalSceneSources,
  },
  runs: runRows,
  captureReport: { path: captureReportPath, sha256: sources.get(captureReportPath).row.sha256,
    bytes: sources.get(captureReportPath).row.bytes },
  preSceneMetadata: { path: metadataPath, sha256: sources.get(metadataPath).row.sha256,
    bytes: sources.get(metadataPath).row.bytes, errors: 0, truncations: 0 },
  limitations: [
    'BUFFER-HOLE was not entered in this process; no direct caller or return address was observed.',
    'This result does not show whether ZERO-EDGE is called from BUFFER-HOLE or another function.',
    'The no-hit applies only to this 320x480 writer-stream scene and process lifetime.',
    'The separate 768x1080 run remains a different canvas regime with an unresolved setup cause.',
  ],
  sources: [...sources.values()].map(item => item.row).sort((a, b) => a.path.localeCompare(b.path)),
};
const outputBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(outputPath, outputBytes, { flag: 'wx' });
console.log(JSON.stringify({ output: portable(relative(ROOT, outputPath)), bytes: outputBytes.length,
  sha256: sha256(outputBytes), sourceCount: evidence.sources.length,
  outputs: equalOutputs.length, sceneSources: equalSceneSources.length,
  canvas: `${observer.aa0Dimensions.width}x${observer.aa0Dimensions.height}`,
  observerRunnerSessionSeconds: observer.runnerSessionSeconds }, null, 2));
