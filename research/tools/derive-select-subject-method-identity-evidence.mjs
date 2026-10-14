#!/usr/bin/env node

// Offline derivation binding a live PICK return site to a CLOS method body.
// This validates archived captures and static reports; it never launches AARON.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER_PATH = 'research/oracle/run-local-scene-state-required-probe.ps1';
const RUNTIME_MANIFEST_PATH = 'research/extracted/aaron/manifest.json';
const PROBE_PATH = 'research/introspection/select-subject-methods.cl';
const MAP_PATH = 'research/extracted/local-oracle/select-subject-methods-native-map-20261014-v1/native-code-map.json';
const PICK_EVIDENCE_PATH = 'research/introspection/evidence/pick-native-caller-live-site-20261014-v4.json';
const REA_INPUT_DIR = 'research/artifacts/rea-tools/select-subject-method-20261014-input';
const REA_FUNCTION_DIR = 'research/artifacts/rea-tools/select-subject-method-20261014-function-scoped-v2';
const REA_CALL_DIR = 'research/artifacts/rea-tools/select-subject-method-20261014-callsite-scoped-v1';
const DEFAULT_RUNS = Object.freeze({
  before: 'research/extracted/local-oracle/external-runs/select-subject-methods-20261014-control-before-v2',
  observer: 'research/extracted/local-oracle/external-runs/select-subject-methods-20261014-observer-v2',
  after: 'research/extracted/local-oracle/external-runs/select-subject-methods-20261014-control-after-v2',
});
const OUTPUT_NAME = 'aaron-select-subject-methods.txt';
const END_MARKER = 'END select-subject-methods';
const ARTIFACTS = Object.freeze({
  aa0: 'aa0',
  image: 'image',
  imageId: 'image-id',
  sceneSnapshot: 'aaron-scene-state-snapshot.txt',
  planningTrace: 'aaron-planning-call-trace.txt',
  loadedSeed: 'aaron-random-seed-loaded.txt',
});
const SCENE_SOURCES = Object.freeze({
  'planning-call-trace.cl': 'research/introspection/planning-call-trace.cl',
  'planning-random-seed-common.cl': 'research/oracle/planning-random-seed-common.cl',
  'scene-state-snapshot-seeded-1234.cl': 'research/introspection/scene-state-snapshot-seeded-1234.cl',
  'scene-state-snapshot-writer-seeded-1234.cl': 'research/introspection/scene-state-snapshot-writer-seeded-1234.cl',
  'scene-state-snapshot-writer-stream-seeded-1234.cl': 'research/introspection/scene-state-snapshot-writer-stream-seeded-1234.cl',
  'scene-state-snapshot.cl': 'research/introspection/scene-state-snapshot.cl',
});

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = path => readFileSync(path);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = path => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/u, ''));
const repoPath = path => resolve(ROOT, path);
const relativePath = path => relative(ROOT, path).split(sep).join('/');
const insideRoot = path => {
  const value = relative(ROOT, path);
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`);
};
const fingerprint = path => {
  const bytes = read(path);
  return { path: relativePath(path), bytes: bytes.length, sha256: sha256(bytes) };
};
const hexAddress = (value, label) => {
  assert(typeof value === 'string' && /^0x[0-9a-f]{1,8}$/iu.test(value), `${label}: invalid 32-bit address`);
  return Number.parseInt(value.slice(2), 16);
};
const addressString = value => `0x${value.toString(16).padStart(8, '0')}`;

function runInfo(rootRel, role, expectedRunner, runtimeManifest) {
  const root = repoPath(rootRel);
  assert(insideRoot(root), `${role}: run root escapes repository`);
  const summaryPath = resolve(root, 'summary.json');
  const summaryBytes = read(summaryPath);
  const summary = JSON.parse(summaryBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  assert(summary.runId === basename(root), `${role}: run ID differs from its directory`);
  assert(summary.complete === true && summary.mode === 'writer-stream-seed-1234'
    && summary.smallImage === false && summary.probeCompletionSatisfied === true
    && summary.runnerSha256 === expectedRunner,
  `${role}: incomplete run or runner/mode mismatch`);
  assert(summary.installerSha256 === runtimeManifest.source.sha256,
    `${role}: installer differs from extracted-runtime manifest`);

  const runtime = {};
  for (const name of ['AARON.exe', 'AARON.pll']) {
    const path = resolve(root, 'runtime', name);
    const bytes = read(path);
    const expected = runtimeManifest.files.find(item => item.installedName.toLowerCase() === name.toLowerCase());
    assert(expected && bytes.length === expected.bytes && sha256(bytes) === expected.sha256,
      `${role}: ${name} differs from extracted-runtime manifest`);
    runtime[name] = { path: relativePath(path), bytes: bytes.length, sha256: sha256(bytes) };
  }

  const files = Object.fromEntries(Object.entries(ARTIFACTS).map(([key, name]) => {
    const value = fingerprint(resolve(root, 'capture', name));
    return [key, value];
  }));
  const sceneSources = Object.fromEntries(Object.keys(SCENE_SOURCES).map(name => {
    const value = fingerprint(resolve(root, 'capture', name));
    assert(value.sha256 === sha256(read(repoPath(SCENE_SOURCES[name]))),
      `${role}: archived scene source differs from repository source: ${name}`);
    return [name, value];
  }));
  assert(summary.aa0Sha256 === files.aa0.sha256, `${role}: AA0 hash disagrees with summary`);
  assert(summary.sceneReportSha256 === files.sceneSnapshot.sha256,
    `${role}: scene report hash disagrees with summary`);
  const header = read(resolve(root, 'capture/aa0')).toString('ascii').split(/\r?\n/u, 1)[0];
  const dimensions = /^(\d+)\s+(\d+)\s+(\d+)$/u.exec(header);
  assert(dimensions && Number(dimensions[1]) === 320 && Number(dimensions[2]) === 480,
    `${role}: expected measured 320x480 AA0 header`);

  return {
    root,
    summary,
    row: {
      runId: summary.runId,
      role,
      path: relativePath(root),
      complete: summary.complete,
      mode: summary.mode,
      smallImage: summary.smallImage,
      runnerSha256: summary.runnerSha256,
      installerSha256: summary.installerSha256,
      registryPatchSha256: summary.registryPatchSha256,
      licensePatchSha256: summary.licensePatchSha256,
      runtime,
      aa0Header: { width: Number(dimensions[1]), height: Number(dimensions[2]), value: Number(dimensions[3]) },
      summary: { path: relativePath(summaryPath), bytes: summaryBytes.length, sha256: sha256(summaryBytes) },
      files,
      sceneSources,
      probe: {
        sourceSha256: summary.preSceneProbeSha256 ?? null,
        outputNames: summary.probeOutputNames,
        pauseSeconds: summary.preSceneProbePauseSeconds,
        requiredOutputName: summary.requiredProbeOutputName ?? '',
        requiredEndMarker: summary.requiredProbeEndMarker ?? '',
        completionSatisfied: summary.probeCompletionSatisfied,
        reportSha256: summary.requiredProbeOutputSha256 ?? null,
      },
    },
  };
}

function parseMethodReport(reportPath, summary) {
  const bytes = read(reportPath);
  const text = bytes.toString('utf8').replace(/\r\n/gu, '\n');
  assert(!text.includes('\r') && text.endsWith('\n'), 'Probe report has mixed line endings or no final newline');
  assert(text.startsWith('BEGIN select-subject-methods\n')
    && text.endsWith(`${END_MARKER}\n`), 'Probe report lacks exact BEGIN/END framing');
  assert(sha256(bytes) === summary.requiredProbeOutputSha256,
    'Probe report hash differs from runner summary');
  for (const marker of [
    'INSTALL target=SELECT-SUBJECT mode=read-only',
    'TARGET name="SELECT-SUBJECT" package="COMMON-GRAPHICS-USER" type=STANDARD-GENERIC-FUNCTION arglist=(COMMON-GRAPHICS-USER::STATUS)',
    'METHOD-COUNT total=2 emitted=2 limit=64 status=:COMPLETE truncated=NIL',
    'ENUMERATION-STATUS :COMPLETE',
    'ERROR-COUNT 0',
    'TRUNCATION-COUNT 0',
    'READY select-subject-methods',
    'CAPTURE-WAIT released=T',
    'COMPLETE execution=finished',
    END_MARKER,
  ]) assert(text.includes(`${marker}\n`), `Probe report lacks required record: ${marker}`);
  assert(!/^ERROR /mu.test(text) && !/^TRUNCATION /mu.test(text),
    'Probe report contains an error or truncation record');

  const lines = text.trimEnd().split('\n');
  const methods = [0, 1].map(index => {
    const name = `SELECT-SUBJECT-METHOD-${index}`;
    const specialization = index === 0 ? 'FREE' : 'PREMIUM';
    const required = [
      `METHOD index=${index} type=STANDARD-METHOD`,
      `QUALIFIERS index=${index} values=NIL`,
      `SPECIALIZERS index=${index} values=((:EQL (:SYMBOL "COMMON-GRAPHICS-USER" "${specialization}")))`,
      `METHOD-FUNCTION name="${name}" type=COMPILED-FUNCTION`,
      `ARGLIST name="${name}" values=(COMMON-GRAPHICS-USER::STATUS)`,
    ];
    for (const marker of required) assert(lines.includes(marker), `Missing method metadata: ${marker}`);
    const headerLine = lines.find(line => line.startsWith(`HEADER name="${name}" bytes=`));
    const headerMatch = new RegExp(`^HEADER name="${name}" bytes=([0-9a-f]{128})$`, 'iu').exec(headerLine ?? '');
    assert(headerMatch, `Malformed compiled-function header for ${name}`);
    return {
      index,
      name,
      methodType: 'STANDARD-METHOD',
      qualifiers: [],
      eqlSpecializer: { package: 'COMMON-GRAPHICS-USER', symbol: specialization },
      methodFunctionType: 'COMPILED-FUNCTION',
      arglist: ['COMMON-GRAPHICS-USER::STATUS'],
      functionObjectHeaderHex: headerMatch[1].toLowerCase(),
    };
  });
  return { bytes, text, methods, lines };
}

function parseReaInvocation(dirRel, expectedPeHash, expectedSeedPath) {
  const dir = repoPath(dirRel);
  const invocationPath = resolve(dir, 'rea-invocation.json');
  const invocation = readJson(invocationPath);
  const reportPath = resolve(dir, 'rea-result.json');
  const stderrPath = resolve(dir, 'rea-stderr.txt');
  const reportBytes = read(reportPath);
  const report = JSON.parse(reportBytes.toString('utf8'));
  const stderr = read(stderrPath);
  assert(invocation.schemaVersion === 1 && invocation.provider === 'ghidra'
    && invocation.reaVersion === '6.4.0' && invocation.ghidraVersion === '12.1.4'
    && invocation.staticOnly === true && invocation.inputWasExecuted === false,
  `${dirRel}: REA invocation is not a recorded static-only 6.4.0/Ghidra 12.1.4 run`);
  assert(invocation.input.sha256 === expectedPeHash && report.subject?.digest?.sha256 === expectedPeHash,
    `${dirRel}: REA report subject differs from exact synthetic PE`);
  assert(invocation.report.sha256 === sha256(reportBytes) && invocation.report.bytes === reportBytes.length
    && invocation.stderr.sha256 === sha256(stderr) && stderr.length === 0,
  `${dirRel}: REA report/stderr hashes do not match invocation record`);
  assert(invocation.seed.path === expectedSeedPath,
    `${dirRel}: REA seed path differs from method binding`);
  return {
    invocation,
    report,
    invocationRecord: fingerprint(invocationPath),
    reportRecord: fingerprint(reportPath),
    stderrRecord: fingerprint(stderrPath),
  };
}

function main() {
  const [outputArg, beforeArg, observerArg, afterArg, mapArg, ...extra] = process.argv.slice(2);
  assert(extra.length === 0,
    'Usage: node derive-select-subject-method-identity-evidence.mjs [output.json] [before-root] [observer-root] [after-root] [native-code-map.json]');
  const output = repoPath(outputArg ?? 'research/introspection/evidence/select-subject-method-identity-20261014-v2.json');
  assert(insideRoot(output) && !existsSync(output), `Evidence output must be fresh inside repository: ${relativePath(output)}`);

  const runtimeManifest = readJson(repoPath(RUNTIME_MANIFEST_PATH));
  const runnerBytes = read(repoPath(RUNNER_PATH));
  const runnerSha256 = sha256(runnerBytes);
  const runs = [
    runInfo(beforeArg ?? DEFAULT_RUNS.before, 'fresh uninstrumented control before', runnerSha256, runtimeManifest),
    runInfo(observerArg ?? DEFAULT_RUNS.observer, 'SELECT-SUBJECT method observer', runnerSha256, runtimeManifest),
    runInfo(afterArg ?? DEFAULT_RUNS.after, 'fresh uninstrumented control after', runnerSha256, runtimeManifest),
  ];
  const [before, observer, after] = runs;
  for (const field of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(before.row[field] === observer.row[field] && observer.row[field] === after.row[field],
      `Triplet setup differs for ${field}`);
  }
  for (const runtimeName of ['AARON.exe', 'AARON.pll']) {
    const expected = before.row.runtime[runtimeName].sha256;
    assert(observer.row.runtime[runtimeName].sha256 === expected && after.row.runtime[runtimeName].sha256 === expected,
      `Triplet runtime differs for ${runtimeName}`);
  }
  const expectedDimensions = JSON.stringify(before.row.aa0Header);
  assert(JSON.stringify(observer.row.aa0Header) === expectedDimensions
    && JSON.stringify(after.row.aa0Header) === expectedDimensions,
  'Before/observer/after AA0 dimensions differ');
  for (const control of [before, after]) {
    assert(control.row.probe.sourceSha256 === null && control.row.probe.outputNames.length === 0
      && control.row.probe.pauseSeconds === 0 && control.row.probe.requiredOutputName === ''
      && control.row.probe.requiredEndMarker === '', `${control.row.runId}: expected a fresh uninstrumented control`);
  }

  const equalArtifacts = Object.keys(ARTIFACTS).map(key => {
    const expected = before.row.files[key].sha256;
    assert(observer.row.files[key].sha256 === expected && after.row.files[key].sha256 === expected,
      `Before/observer/after output differs: ${key}`);
    return { name: ARTIFACTS[key], ...before.row.files[key] };
  });
  const equalSources = Object.keys(SCENE_SOURCES).map(name => {
    const expected = before.row.sceneSources[name].sha256;
    assert(observer.row.sceneSources[name].sha256 === expected && after.row.sceneSources[name].sha256 === expected,
      `Before/observer/after staged scene source differs: ${name}`);
    return { name, ...before.row.sceneSources[name] };
  });

  const observerRoot = observer.root;
  const requestPath = resolve(observerRoot, 'pre-scene-probe-request.json');
  const requestBytes = read(requestPath);
  const request = JSON.parse(requestBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const probeBytes = read(repoPath(PROBE_PATH));
  const stagedProbePath = resolve(observerRoot, 'capture/aaron-pre-scene-probe.cl');
  const stagedProbeBytes = read(stagedProbePath);
  const stagedProbeSha = sha256(stagedProbeBytes);
  const reportPath = resolve(observerRoot, `capture/${OUTPUT_NAME}`);
  const report = parseMethodReport(reportPath, observer.summary);
  assert(request.schemaVersion === 1 && request.runId === observer.row.runId
    && request.runtimeExecutable === resolve(observerRoot, 'runtime/AARON.exe')
    && request.probeSha256 === stagedProbeSha && stagedProbeSha === sha256(probeBytes)
    && stagedProbeSha === observer.row.probe.sourceSha256
    && request.runnerSha256 === runnerSha256 && request.pauseSeconds === 120
    && request.requiredProbeOutputName === OUTPUT_NAME && request.requiredProbeEndMarker === END_MARKER
    && request.probeOutputNames.length === 1 && request.probeOutputNames[0] === OUTPUT_NAME,
  'Observer request does not bind the reviewed source, run, READY pause and required output');
  assert(observer.row.probe.requiredOutputName === OUTPUT_NAME
    && observer.row.probe.requiredEndMarker === END_MARKER
    && observer.row.probe.outputNames.length === 1 && observer.row.probe.outputNames[0] === OUTPUT_NAME,
  'Observer summary does not bind the required probe output');

  const manifestPath = resolve(observerRoot, 'native-code/manifest.json');
  const manifestBytes = read(manifestPath);
  const nativeManifest = readJson(manifestPath);
  const nativeMetadataPath = resolve(dirname(manifestPath), 'function-object-metadata.txt');
  const nativeMetadataBytes = read(nativeMetadataPath);
  const readyLine = 'READY select-subject-methods\n';
  const readyEnd = report.text.indexOf(readyLine) + readyLine.length;
  assert(readyEnd >= readyLine.length && nativeManifest.metadataSha256 === sha256(nativeMetadataBytes)
    && nativeMetadataBytes.toString('utf8').replace(/\r\n/gu, '\n') === report.text.slice(0, readyEnd),
  'Native capture manifest does not bind the exact READY metadata prefix');
  assert(nativeManifest.functions.length === report.methods.length,
    'Native capture count differs from complete method enumeration');
  for (const method of report.methods) {
    const captured = nativeManifest.functions.find(item => item.name === method.name);
    assert(captured && captured.functionObjectHeaderHex.toLowerCase() === method.functionObjectHeaderHex,
      `Native capture header differs from CLOS report for ${method.name}`);
    const windowPath = resolve(dirname(manifestPath), captured.file);
    const window = read(windowPath);
    assert(window.length === captured.bytes && sha256(window) === captured.sha256,
      `Native capture window hash/length differs for ${method.name}`);
    method.nativeWindow = fingerprint(windowPath);
    method.nativeEntryCandidate = captured.entryCandidate;
  }

  const mapPath = repoPath(mapArg ?? MAP_PATH);
  const mapBytes = read(mapPath);
  const map = readJson(mapPath);
  const pllPath = resolve(observerRoot, 'runtime/AARON.pll');
  const pll = read(pllPath);
  assert(map.schemaVersion === 1 && map.captureManifestSha256 === sha256(manifestBytes)
    && map.pll.sha256 === sha256(pll) && map.pll.bytes === pll.length,
  'Native map is not bound to this observer capture and exact archived PLL');
  assert(map.functions.length === 2 && nativeManifest.functions.length === 2,
    'Native map/method count is not the complete two-method census');
  const mappedMethods = report.methods.map(method => {
    const mapped = map.functions.find(item => item.name === method.name);
    assert(mapped && mapped.uniqueCompleteObjectByteMatch === true,
      `No unique complete PLL object mapping for ${method.name}`);
    const payloadPath = resolve(dirname(mapPath), mapped.payloadFile);
    const payload = read(payloadPath);
    const object = pll.subarray(mapped.pll.objectOffset, mapped.pll.rawEnd);
    assert(payload.length === mapped.payloadBytes && sha256(payload) === mapped.payloadSha256
      && object.length === mapped.objectBytes && sha256(object) === mapped.objectSha256
      && payload.equals(pll.subarray(mapped.pll.payloadOffset, mapped.pll.rawEnd)),
    `Mapped payload is not the exact full PLL object slice for ${method.name}`);
    assert(mapped.capture.functionObjectHeaderHex.toLowerCase() === method.functionObjectHeaderHex,
      `Mapped header differs from CLOS metadata for ${method.name}`);
    return {
      name: method.name,
      eqlSpecializer: method.eqlSpecializer,
      runtimeEntry: mapped.runtime.entry,
      runtimeAddressBase: addressString(hexAddress(mapped.runtime.entry, `${method.name} entry`) - mapped.pll.payloadOffset),
      pll: {
        objectOffset: mapped.pll.objectOffset,
        payloadOffset: mapped.pll.payloadOffset,
        rawEnd: mapped.pll.rawEnd,
        objectBytes: mapped.objectBytes,
        objectSha256: mapped.objectSha256,
        payloadBytes: payload.length,
        payloadSha256: sha256(payload),
      },
      nativeWindow: method.nativeWindow,
      completeUniquePllObjectMatch: true,
      payloadPath: relativePath(payloadPath),
      payloadBytesAtCallSite: method.index === 1 ? payload.subarray(200, 203).toString('hex') : null,
    };
  });
  assert(mappedMethods[0].runtimeAddressBase === mappedMethods[1].runtimeAddressBase,
    'Two mapped method objects do not share one runtime-to-PLL base');

  const pickEvidencePath = repoPath(PICK_EVIDENCE_PATH);
  const pickEvidenceBytes = read(pickEvidencePath);
  const pickEvidence = readJson(pickEvidencePath);
  const previousCaller = pickEvidence.directCaller;
  const method1 = mappedMethods.find(item => item.name === 'SELECT-SUBJECT-METHOD-1');
  assert(method1 && previousCaller?.outcome === 'return-address-mapped-to-one-anonymous-compiled-object'
    && previousCaller.lispFunctionName === null
    && previousCaller.runtime.returnAddress === '0x1fe4c07f'
    && previousCaller.runtime.entry === method1.runtimeEntry
    && previousCaller.runtime.payloadOffset === 203
    && previousCaller.pll.payloadSha256 === method1.pll.payloadSha256
    && previousCaller.pll.objectSha256 === method1.pll.objectSha256
    && previousCaller.callSite.runtimeAddress === '0x1fe4c07c'
    && previousCaller.callSite.payloadOffset === 200
    && previousCaller.callSite.bytesHex === 'ff5727'
    && previousCaller.callSite.liveRead.matchesCurrentPll === true,
  'Previously observed live PICK return/call site does not match the now-identified complete method payload');
  assert(method1.payloadBytesAtCallSite === 'ff5727',
    'Mapped SELECT-SUBJECT premium method does not contain the measured CALL bytes at payload offset 200');

  const bindingPath = resolve(repoPath(REA_INPUT_DIR), 'select-subject-method-1.binding.json');
  const bindingBytes = read(bindingPath);
  const binding = JSON.parse(bindingBytes.toString('utf8'));
  const pePath = resolve(repoPath(REA_INPUT_DIR), 'select-subject-method-1.synthetic.exe');
  const peHash = sha256(read(pePath));
  assert(binding.functionName === 'SELECT-SUBJECT-METHOD-1'
    && binding.originalPayload.sha256 === method1.pll.payloadSha256
    && binding.originalPayload.bytes === method1.pll.payloadBytes
    && binding.generatedPe.sha256 === peHash && binding.assertions.generatedExecutableRun === false,
  'REA synthetic PE binding differs from the exact live-mapped method payload');
  const seedPath = 'research/artifacts/rea-tools/select-subject-method-20261014-input/select-subject-method-1.seeds.tsv';
  const functionRea = parseReaInvocation(REA_FUNCTION_DIR, peHash, seedPath);
  const functionResult = functionRea.report.normalized_result;
  const methodEntry = method1.runtimeEntry;
  const expectedCall = `${'0x'}${(hexAddress(methodEntry, 'method entry') + 200).toString(16)}`;
  const expectedReturn = `${'0x'}${(hexAddress(methodEntry, 'method entry') + 203).toString(16)}`;
  const callInstruction = functionResult.assembly.find(line => line.startsWith(`${expectedCall}: `));
  const returnInstruction = functionResult.assembly.find(line => line.startsWith(`${expectedReturn}: `));
  assert(functionRea.report.provider.id === 'ghidra' && functionRea.report.provider.version === '12.1.4'
    && functionResult.procedure.address === methodEntry
    && callInstruction === `${expectedCall}: CALL dword ptr [EDI + 0x27]`
    && returnInstruction === `${expectedReturn}: MOV EDX, EAX`,
  'REA function report does not decode the measured method call and return site');
  const queryRea = parseReaInvocation(REA_CALL_DIR, peHash, seedPath);
  const callQuery = queryRea.report.normalized_result;
  assert(callQuery.call_site === expectedCall && callQuery.procedure === methodEntry
    && callQuery.status === 'unresolved' && callQuery.mechanism === 'computed'
    && Array.isArray(callQuery.targets) && callQuery.targets.length === 0,
  'REA targeted call query differs from the measured unresolved computed dispatch');

  const files = {
    probe: fingerprint(repoPath(PROBE_PATH)),
    stagedProbe: fingerprint(stagedProbePath),
    request: fingerprint(requestPath),
    metadata: fingerprint(reportPath),
    nativeMetadataPrefix: fingerprint(nativeMetadataPath),
    captureManifest: fingerprint(manifestPath),
    mapping: fingerprint(mapPath),
    oldPickEvidence: fingerprint(pickEvidencePath),
    reaBinding: fingerprint(bindingPath),
    syntheticPe: fingerprint(pePath),
  };

  const evidence = {
    schemaVersion: 1,
    status: 'identified-live-direct-caller-method',
    question: 'Which runtime CLOS method contains the measured return site from the first natural PICK entry?',
    finding: {
      genericFunction: { name: 'SELECT-SUBJECT', package: 'COMMON-GRAPHICS-USER', type: 'STANDARD-GENERIC-FUNCTION', arglist: ['COMMON-GRAPHICS-USER::STATUS'] },
      methodCount: 2,
      methods: report.methods.map((method, index) => ({ ...method, mappedNativePayload: mappedMethods[index] })),
      identifiedCaller: {
        method: 'SELECT-SUBJECT-METHOD-1',
        dispatchSpecializer: { kind: 'EQL', package: 'COMMON-GRAPHICS-USER', symbol: 'PREMIUM' },
        entry: method1.runtimeEntry,
        payloadSha256: method1.pll.payloadSha256,
        exactCompletePllObjectMatch: true,
        relationToPriorPICKCapture: 'The prior live PICK return address and call-site bytes fall at the same offsets in this complete method payload; the payload hash and complete object hash are identical.',
      },
      pickCallSite: {
        address: expectedCall,
        payloadOffset: 200,
        liveBytesHex: 'ff5727',
        disassembly: callInstruction,
        nextInstruction: returnInstruction,
        returnAddress: expectedReturn,
        directlyObservedInPriorPICKEntryCapture: true,
      },
      reaCallQuery: {
        status: callQuery.status,
        mechanism: callQuery.mechanism,
        targets: callQuery.targets,
        interpretation: 'REA confirms that the static instruction is a computed indirect call but does not resolve its target.',
      },
    },
    controls: {
      mode: 'writer-stream-seed-1234',
      canvas: observer.row.aa0Header,
      allSixDrawingAndSceneOutputsByteIdenticalAcrossBeforeObserverAfter: true,
      equalOutputs: equalArtifacts,
      allSixOrdinarySceneSourcesByteIdenticalAcrossBeforeObserverAfter: true,
      equalSceneSources: equalSources,
      runs: runs.map(run => run.row),
    },
    rea: {
      version: functionRea.invocation.reaVersion,
      ghidraVersion: functionRea.invocation.ghidraVersion,
      staticOnly: true,
      generatedPeExecuted: false,
      inputPeSha256: peHash,
      function: {
        invocation: functionRea.invocationRecord,
        report: functionRea.reportRecord,
        bodyBytes: functionResult.procedure.body.total_bytes,
      },
      callQuery: {
        invocation: queryRea.invocationRecord,
        report: queryRea.reportRecord,
      },
    },
    sourceBinding: {
      runner: fingerprint(repoPath(RUNNER_PATH)),
      runtimeManifest: fingerprint(repoPath(RUNTIME_MANIFEST_PATH)),
      pll: fingerprint(pllPath),
      files,
      deriver: fingerprint(fileURLToPath(import.meta.url)),
    },
    limits: [
      'This identifies the direct caller for the captured natural PICK entry only; it does not establish an application-wide call graph or prove the method is the only caller.',
      'The captured method function is selected by the observed EQL PREMIUM specializer, but this probe did not invoke the generic or method and did not record the method return value or full argument state.',
      'The indirect target at [EDI+0x27] remains unresolved by REA; no target function name or Lisp ABI is inferred.',
      'The current method census and prior PICK-entry hit are from different source-bound runs and canvases; their linkage is through the same unique complete payload, object hash, runtime entry and call-site offset, not a same-process stack snapshot.',
      'This adds a caller identity, not a JavaScript behavior contract or whole-painting parity result.',
    ],
  };
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ output: relativePath(output), sha256: sha256(read(output)), finding: evidence.finding.identifiedCaller, matchedControls: true }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}
