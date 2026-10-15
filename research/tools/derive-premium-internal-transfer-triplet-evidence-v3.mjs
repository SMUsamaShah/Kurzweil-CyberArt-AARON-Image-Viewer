#!/usr/bin/env node

// Offline, source-bound validation for the bounded PREMIUM JC-successor capture.
// It requires the first successor breakpoint after JC, while making no claim
// that the candidate indirect CALL executed or that its raw slot has an identity.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_MODE = 'writer-full-seed-456069';
const comparisonPathFor = tripletId => `research/extracted/local-oracle/premium-internal-transfer-triplet-v5-logs/${tripletId}/triplet-comparison.json`;
const COMPARISON_SOURCE_KEYS = ['coordinator', 'probe', 'runner', 'debuggerHelper', 'mapper', 'reaStaticCensus', 'extractedManifest'];
const READY_METADATA_BEGIN = 'BEGIN premium-callsite-metadata-v1';
const READY_METADATA_INSTALL = 'INSTALL target=SELECT-SUBJECT+PICK mode=READ-ONLY-METADATA';
const READY_METADATA_READY = 'READY premium-callsite-metadata-v1';
const READY_METADATA_RELEASE = 'CAPTURE-WAIT released=T';
const READY_METADATA_COMPLETE = 'COMPLETE execution=finished';
const READY_METADATA_END = 'END premium-callsite-metadata-v1';
const EXPECTED_AA0_HEADERS = {
  'writer-stream-seed-1234': '768 1080 148',
  'writer-full-seed-5678': '768 1080 148',
  'writer-full-seed-456069': '1920 1080 184',
};
const REQUIRED_ARTIFACTS = ['aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt'];
const REA_INPUT_PE = 'research/introspection/evidence/rea-inputs/premium-jc-20261015/premium-callsite-wide-window-v2.synthetic.bin';
const REA_SEED = 'research/introspection/evidence/rea-inputs/premium-jc-20261015/jc-seed.txt';
const REA_REPORT = 'research/introspection/evidence/rea-inputs/premium-jc-20261015/jc-instruction.json';
const REA_INVOCATION = 'research/introspection/evidence/rea-inputs/premium-jc-20261015/rea-invocation.json';
const REA_INPUT_PE_SHA256 = '88a5324f12cbab910c610327b2b667bfd4449244bb8baa54b786db4bce20be4a';
const REA_SEED_SHA256 = '261088b379dd45ac8488120a847da59c2fdf599af1c22a2186c158415751e050';
const REA_REPORT_SHA256 = 'e9662323122cf8a843182f66fa71e043dfbf7ac2f4317bc8c84f93953fd81b8a';
const REA_INVOCATION_SHA256 = 'a9598c707bb215e1ccd2588b9c2960055597b7005993521e46e559dd19c820c5';
const REQUIRED_SOURCES = {
  'writer-stream-seed-1234': [
    'planning-call-trace.cl', 'planning-random-seed-common.cl', 'scene-state-snapshot-seeded-1234.cl',
    'scene-state-snapshot-writer-seeded-1234.cl', 'scene-state-snapshot-writer-stream-seeded-1234.cl', 'scene-state-snapshot.cl',
  ],
  'writer-full-seed-5678': [
    'planning-call-trace.cl', 'planning-random-seed-common.cl', 'scene-state-snapshot-seeded-1234.cl',
    'scene-state-snapshot-writer-full-seeded-5678.cl', 'scene-state-snapshot.cl',
  ],
  'writer-full-seed-456069': [
    'planning-call-trace.cl', 'planning-random-seed-common.cl', 'scene-state-snapshot-seeded-1234.cl',
    'scene-state-snapshot-writer-full-seeded-456069.cl', 'scene-state-snapshot.cl',
  ],
};
const EXPECTED_WINDOW_PROFILE = [
  [23, 'ff975f030000'], [128, 'b102'], [130, '83e17f'], [133, '8b7315'],
  [136, '894df0'], [139, '39679b'], [142, '7209'], [144, 'eb85'],
  [153, '89442404'], [157, '89542408'], [161, 'ff6612'],
];
const HEX64 = /^[0-9a-f]{64}$/u;

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function hex32(value, label) {
  assert(typeof value === 'string' && /^0x[0-9a-f]{1,8}$/iu.test(value), `${label}: malformed 32-bit hex value`);
  return Number.parseInt(value.slice(2), 16) >>> 0;
}
function within(parent, child) {
  const rel = relative(parent, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function readFile(path) {
  const full = resolve(REPO, path);
  const bytes = readFileSync(full);
  return { path: relative(REPO, full).split(sep).join('/'), full, bytes, sha256: sha(bytes), text: bytes.toString('utf8') };
}
function checkHash(actual, expected, label) {
  assert(typeof expected === 'string' && HEX64.test(expected.toLowerCase()), `${label}: malformed SHA-256`);
  assert(actual === expected.toLowerCase(), `${label}: SHA-256 mismatch`);
}
function readbackDr(readback, slot, label) {
  return hex32(readback?.[`dr${slot}`], `${label} DR${slot}`);
}
function readbackHasAddresses(readback, addresses, label) {
  return addresses.every((address, slot) => readbackDr(readback, slot, label) === address);
}
function fileRecord(record, label, boundRoot) {
  assert(record && typeof record.path === 'string', `${label}: missing file record`);
  const full = resolve(record.path);
  const bytes = readFileSync(full);
  const actual = sha(bytes);
  assert(Number.isInteger(record.bytes) && bytes.length === record.bytes, `${label}: byte count mismatch`);
  checkHash(actual, record.sha256, label);
  if (boundRoot) assert(within(boundRoot, full), `${label}: path escaped its run root`);
  return { path: full, bytes: bytes.length, sha256: actual, text: bytes.toString('utf8') };
}
function jsonFile(path) {
  const file = readFile(path);
  try { return { ...file, value: JSON.parse(file.text.replace(/^\uFEFF/u, '')) }; }
  catch (error) { fail(`${path}: invalid JSON (${error.message})`); }
}
function parseArgs(argv) {
  const args = { tripletId: null, mode: DEFAULT_MODE, comparison: null, output: null, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--triplet-id') args.tripletId = argv[++i] ?? '';
    else if (key === '--mode') args.mode = argv[++i] ?? '';
    else if (key === '--comparison') args.comparison = argv[++i] ?? '';
    else if (key === '--out') args.output = argv[++i] ?? '';
    else if (key === '--overwrite') args.overwrite = true;
    else if (key === '--help') {
      process.stdout.write('Usage: node research/tools/derive-premium-internal-transfer-triplet-evidence-v3.mjs --triplet-id ID [--mode MODE] [--comparison PATH] [--out PATH] [--overwrite]\n');
      process.exit(0);
    } else fail(`Unknown argument: ${key}`);
  }
  assert(typeof args.tripletId === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(args.tripletId),
    '--triplet-id is required and must be a lowercase alphanumeric/hyphen ID');
  if (args.comparison === null) args.comparison = comparisonPathFor(args.tripletId);
  if (args.output === null) args.output = `research/introspection/evidence/premium-internal-transfer-jc-successor-${args.tripletId}.json`;
  return args;
}
function parseEnvelope(text) {
  const lines = text.replace(/\r\n/gu, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const begin = 'BEGIN premium-internal-transfer-breakpoint-v4';
  const end = 'END premium-internal-transfer-breakpoint-v4';
  assert(lines[0] === begin && lines.at(-1) === end && lines.filter(line => line === end).length === 1,
    'capture envelope is incomplete or duplicated');
  try { return JSON.parse(lines.slice(1, -1).join('\n')); }
  catch (error) { fail(`capture JSON is invalid (${error.message})`); }
}
function main() {
  const args = parseArgs(process.argv.slice(2));
  const reaPe = readFile(REA_INPUT_PE);
  const reaSeed = readFile(REA_SEED);
  const reaReportFile = jsonFile(REA_REPORT);
  const reaInvocationFile = jsonFile(REA_INVOCATION);
  const reaReport = reaReportFile.value;
  const reaInvocation = reaInvocationFile.value;
  checkHash(reaPe.sha256, REA_INPUT_PE_SHA256, 'REA synthetic PE');
  checkHash(reaSeed.sha256, REA_SEED_SHA256, 'REA JC code seed');
  checkHash(reaReportFile.sha256, REA_REPORT_SHA256, 'REA JC instruction report');
  checkHash(reaInvocationFile.sha256, REA_INVOCATION_SHA256, 'REA invocation metadata');
  assert(reaSeed.text === '0x1000108e\tcode\n', 'REA seed does not name the JC instruction byte');
  assert(reaReport.subject?.digest?.sha256 === REA_INPUT_PE_SHA256 &&
    reaReport.raw_result?.address === '0x1000108e' && reaReport.raw_result?.bytes === '7209' &&
    reaReport.raw_result?.mnemonic === 'JC' && reaReport.raw_result?.flow?.conditional === true &&
    reaReport.raw_result?.flow?.direct_destinations?.length === 1 &&
    reaReport.raw_result.flow.direct_destinations[0] === '0x10001099' &&
    reaReport.normalized_result?.bytes === '7209' &&
    reaReport.normalized_result?.flow?.direct_destinations?.[0] === '0x10001099' &&
    reaInvocation.staticOnly === true && reaInvocation.inputWasExecuted === false &&
    reaInvocation.operation === 'inspect-native-instruction' &&
    reaInvocation.input?.sha256 === REA_INPUT_PE_SHA256 &&
    reaInvocation.seed?.sha256 === REA_SEED_SHA256 &&
    reaInvocation.report?.sha256 === REA_REPORT_SHA256,
  'REA did not return the source-hash-bound static JC decode and direct target');
  const comparisonFile = jsonFile(args.comparison);
  const comparison = comparisonFile.value;
  assert(Object.hasOwn(REQUIRED_SOURCES, args.mode), `unsupported mode: ${args.mode}`);
  assert(comparison.schemaVersion === 3 && comparison.tripletId === args.tripletId &&
    comparison.mode === args.mode && comparison.aa0Header === EXPECTED_AA0_HEADERS[args.mode],
  'triplet identity, schema, mode, or canvas gate failed');
  assert(comparison.controlsMatch === true && comparison.beforeAfterPlanningTraceMatch === true,
    'fresh uninstrumented controls or planning traces differ');
  assert(Array.isArray(comparison.runs) && comparison.runs.length === 3,
    'expected exactly before, observer, and after runs');
  const comparisonSourceNames = Object.keys(comparison.sources ?? {}).sort();
  const expectedComparisonSourceNames = [...COMPARISON_SOURCE_KEYS].sort();
  assert(comparisonSourceNames.length === expectedComparisonSourceNames.length &&
    comparisonSourceNames.every((name, index) => name === expectedComparisonSourceNames[index]) &&
    comparisonSourceNames.every(name => typeof comparison.sources[name]?.path === 'string' &&
      HEX64.test(String(comparison.sources[name]?.sha256 ?? '').toLowerCase())),
  'comparison must contain exactly seven path/hash-bound source records');

  const requiredRoles = ['before', 'observer', 'after'];
  const requiredArtifacts = [...REQUIRED_ARTIFACTS];
  if (args.mode === 'writer-full-seed-5678' || args.mode === 'writer-full-seed-456069') requiredArtifacts.push('aaron-writer-full.txt');
  const expectedArtifactNames = new Set();
  const roles = new Map();
  const firstArtifacts = new Map();
  const firstStagedSources = new Map();
  let expectedSourceNames = null;
  const runRecords = [];
  for (let index = 0; index < requiredRoles.length; index += 1) {
    const run = comparison.runs[index];
    const role = requiredRoles[index];
    assert(run.role === role && run.complete === true && run.smallImage === false &&
      run.mode === comparison.mode && run.aa0Header === comparison.aa0Header,
    `${role}: identity/completion gate failed`);
    assert(!roles.has(role), `duplicate role: ${role}`);
    roles.set(role, run);
    const runRoot = resolve(REPO, run.root);
    assert(within(REPO, runRoot), `${role}: run root escaped repository`);
    const summaryFile = jsonFile(`${relative(REPO, runRoot).split(sep).join('/')}/summary.json`);
    checkHash(summaryFile.sha256, run.summarySha256, `${role} summary`);
    assert(summaryFile.value.complete === true && summaryFile.value.runId === run.runId &&
      summaryFile.value.mode === run.mode && summaryFile.value.runnerSha256 === run.runnerSha256,
    `${role}: on-disk summary does not match comparison`);
    assert(run.runnerSha256 === comparison.sources.runner.sha256,
      `${role}: runner hash differs from the comparison source binding`);

    const artifactNames = Object.keys(run.artifacts ?? {}).sort();
    assert(requiredArtifacts.every(name => artifactNames.includes(name)), `${role}: missing required drawing/scene artifacts`);
    if (index === 0) artifactNames.forEach(name => expectedArtifactNames.add(name));
    else assert(artifactNames.length === expectedArtifactNames.size && artifactNames.every(name => expectedArtifactNames.has(name)),
      `${role}: artifact set differs from other triplet legs`);
    const artifacts = {};
    for (const name of artifactNames) {
      const artifact = fileRecord(run.artifacts?.[name], `${role} artifact ${name}`, runRoot);
      artifacts[name] = { bytes: artifact.bytes, sha256: artifact.sha256 };
      const old = firstArtifacts.get(name);
      if (old) assert(old.bytes === artifact.bytes && old.sha256 === artifact.sha256, `${role}: ${name} differs from other triplet leg`);
      else firstArtifacts.set(name, artifacts[name]);
    }
    assert(artifacts.aa0.bytes > 0 && artifacts.aa0.sha256, `${role}: empty AA0`);
    const aa0Path = run.artifacts.aa0.path;
    const aa0 = readFileSync(aa0Path).subarray(0, 64).toString('utf8');
    const expectedAa0Header = EXPECTED_AA0_HEADERS[args.mode];
    assert(aa0.startsWith(`${expectedAa0Header}\n`) || aa0.startsWith(`${expectedAa0Header}\r\n`),
      `${role}: AA0 header mismatch (expected ${expectedAa0Header})`);

    const sources = run.sources ?? {};
    const sourceNames = Object.keys(sources).sort();
    const requiredSourceNames = [...REQUIRED_SOURCES[args.mode]].sort();
    assert(sourceNames.length === requiredSourceNames.length && sourceNames.every((name, i) => name === requiredSourceNames[i]),
      `${role}: staged scene source set differs from the expected ${args.mode} inputs`);
    if (index === 0) expectedSourceNames = sourceNames;
    else assert(sourceNames.length === expectedSourceNames.length && sourceNames.every((name, i) => name === expectedSourceNames[i]),
      `${role}: staged source names differ across triplet legs`);
    for (const [name, record] of Object.entries(sources)) {
      const source = fileRecord(record, `${role} staged source ${name}`, runRoot);
      const prior = firstStagedSources.get(name);
      if (prior) assert(prior.bytes === source.bytes && prior.sha256 === source.sha256,
        `${role}: staged source ${name} differs from another triplet leg`);
      else firstStagedSources.set(name, { bytes: source.bytes, sha256: source.sha256 });
    }
    if (args.mode === 'writer-full-seed-5678' || args.mode === 'writer-full-seed-456069') {
      const writerTape = fileRecord(run.artifacts['aaron-writer-full.txt'], `${role} full writer tape`, runRoot);
      assert(writerTape.text.trimEnd().endsWith('END writer-full'), `${role}: full writer tape is incomplete`);
    }
    const trace = fileRecord(run.planningTrace, `${role} planning trace`, runRoot);
    runRecords.push({ role, runId: run.runId, complete: run.complete, root: run.root, runnerSha256: run.runnerSha256, summarySha256: summaryFile.sha256, planningTrace: { bytes: trace.bytes, sha256: trace.sha256 }, artifacts, stagedSourceCount: Object.keys(sources).length });
    runRecords.at(-1).sources = Object.fromEntries(Object.entries(sources).map(([name, record]) => {
      const source = fileRecord(record, `${role} staged source ${name}`, runRoot);
      return [name, { bytes: source.bytes, sha256: source.sha256 }];
    }));

    const runtime = run.runtime ?? {};
    assert(runtime['AARON.exe'] && runtime['AARON.pll'], `${role}: missing runtime identity`);
    for (const name of ['AARON.exe', 'AARON.pll']) {
      const binary = fileRecord(runtime[name], `${role} runtime ${name}`, runRoot);
      runRecords.at(-1).runtime ??= {};
      runRecords.at(-1).runtime[name] = { bytes: binary.bytes, sha256: binary.sha256 };
    }
  }
  assert(runRecords[0].planningTrace.sha256 === runRecords[2].planningTrace.sha256,
    'before/after planning traces differ');
  for (const name of ['AARON.exe', 'AARON.pll']) {
    assert(new Set(runRecords.map(row => row.runtime[name].sha256)).size === 1, `${name} differs across triplet legs`);
  }

  const captureRecord = comparison.debuggerResult;
  assert(captureRecord?.path && HEX64.test(captureRecord.sha256 ?? ''), 'missing source-bound debugger report record');
  const captureFile = fileRecord({ path: captureRecord.path, bytes: readFileSync(captureRecord.path).length, sha256: captureRecord.sha256 }, 'debugger capture', resolve(REPO, roles.get('observer').root));
  const report = parseEnvelope(captureFile.text);
  const debugRecord = report.debugger;
  const mapping = report.mapping;
  assert(report.tripletId === args.tripletId && report.runId === roles.get('observer').runId &&
    report.mode === comparison.mode, 'capture report identity differs from observer run');
  assert(report.coordinatorScriptPath === comparison.sources?.coordinator?.path &&
    report.coordinatorScriptSha256 === comparison.sources?.coordinator?.sha256 &&
    report.debuggerHelperPath === comparison.sources?.debuggerHelper?.path &&
    report.helperSourceSha256AtLoad === comparison.sources?.debuggerHelper?.sha256 &&
    report.debuggerHelperSha256 === comparison.sources?.debuggerHelper?.sha256 &&
    report.metadata?.readyReportSha256 === captureRecord.readyMetadataSha256 &&
    report.metadata?.sourcePath === comparison.sources?.probe?.path &&
    report.metadata?.sourceSha256 === comparison.sources?.probe?.sha256,
  'coordinator, debugger helper, READY metadata, or probe source path/hash is not bound to comparison');
  assert(debugRecord?.attached === true && debugRecord.attachSucceeded === true && debugRecord.detached === true &&
    debugRecord.readyPauseReleased === true && debugRecord.debugRegistersRestored === true &&
    debugRecord.captureCompleted === true && debugRecord.callDebugRegistersRestoredBeforeDestination === true &&
    Array.isArray(debugRecord.cleanupErrors) && debugRecord.cleanupErrors.length === 0,
  'debugger lifecycle or cleanup gate failed');
  assert(Array.isArray(debugRecord.debugStateRestorations) && debugRecord.debugStateRestorations.length > 0 &&
    debugRecord.debugStateRestorations.every(row => row.exactMatch === true),
  'not every thread debug-register state was restored exactly');
  const selectedThreadRestorations = debugRecord.debugStateRestorations.filter(row =>
    row.threadId === debugRecord.selectedThreadId);
  const continueReceipt = debugRecord.successorContinueReceipt;
  const restoredRegisters = ['dr0', 'dr1', 'dr2', 'dr3', 'dr6', 'dr7'];
  const ownerRestore = selectedThreadRestorations[0];
  assert(Number.isInteger(debugRecord.selectedThreadId) && selectedThreadRestorations.length === 1 &&
    ownerRestore.exactMatch === true && ownerRestore.saved && ownerRestore.restored &&
    restoredRegisters.every(name => typeof ownerRestore.saved[name] === 'string' &&
      ownerRestore.saved[name] === ownerRestore.restored[name]) &&
    continueReceipt?.successorEventRecognized === true && continueReceipt.eventOrder === 4 &&
    continueReceipt.threadId === debugRecord.selectedThreadId && continueReceipt.restoreCompletedBeforeContinue === true &&
    continueReceipt.selectedOwnerRestoreExact === true && continueReceipt.selectedOwnerRestoreRecord?.exactMatch === true &&
    continueReceipt.selectedOwnerRestoreRecord?.threadId === debugRecord.selectedThreadId &&
    restoredRegisters.every(name => continueReceipt.selectedOwnerRestoreRecord?.saved?.[name] === ownerRestore.saved[name] &&
      continueReceipt.selectedOwnerRestoreRecord?.restored?.[name] === ownerRestore.restored[name]) &&
    continueReceipt.continueStatus === 'DBG_CONTINUE' && continueReceipt.continueCalled === true &&
    continueReceipt.continueSucceeded === true,
  'selected-thread DR0-DR3/DR6/DR7 restoration or successor restore-before-continue receipt failed');
  assert(Array.isArray(debugRecord.events) && debugRecord.events.length === debugRecord.eventCount &&
    debugRecord.events.length === 4 && debugRecord.events.every((event, index) =>
      event.threadId === debugRecord.selectedThreadId && event.eventOrder === index + 1),
  'expected exactly four ordered events on the selected thread');
  const window = debugRecord.targetWindow;
  assert(window?.requestedBytes === 256 && window.bytesRead === 256 && typeof window.bytesHex === 'string' &&
    /^[0-9a-f]{512}$/iu.test(window.bytesHex), 'target instruction window is incomplete');
  const windowBytes = Buffer.from(window.bytesHex, 'hex');
  checkHash(sha(windowBytes), window.bytesSha256, 'raw target-window bytes');
  checkHash(window.bytesSha256, comparison.debuggerResult.targetWindowSha256, 'comparison target-window hash');
  assert(window.historicalReferenceWindowBytesMatch === false &&
    window.referenceWindowSha256 === comparison.debuggerResult.referenceWindowSha256 &&
    window.instructionProfileMatches === true && mapping.instructionProfileMatches === true &&
    window.instructionProfileSha256 === window.expectedInstructionProfileSha256 &&
    mapping.instructionProfileSha256 === window.instructionProfileSha256,
  'target-window reference/profile identity differs from comparison');
  assert(Array.isArray(window.profileRecords) && window.profileRecords.length === EXPECTED_WINDOW_PROFILE.length,
    'target-window REA instruction profile is incomplete');
  for (let index = 0; index < EXPECTED_WINDOW_PROFILE.length; index += 1) {
    const [offset, expectedHex] = EXPECTED_WINDOW_PROFILE[index];
    const record = window.profileRecords[index];
    const actualHex = windowBytes.subarray(offset, offset + expectedHex.length / 2).toString('hex');
    assert(record.offset === offset && record.bytesHex === expectedHex && record.expectedBytesHex === expectedHex &&
      record.matched === true && actualHex === expectedHex,
    `target-window REA signature mismatch at offset ${offset}`);
  }
  const sites = mapping.internalSites;
  const callSite = sites?.find(site => site.name === 'CALL-EDI+35F');
  const jumpSite = sites?.find(site => site.name === 'JMP-ESI+12');
  const debuggerSites = debugRecord.sites;
  const callSiteState = debuggerSites?.find(site => site.name === 'CALL-EDI+35F');
  const jumpSiteState = debuggerSites?.find(site => site.name === 'JMP-ESI+12');
  assert(callSite?.offset === 23 && callSite.expectedBytesHex === 'ff975f030000' &&
    callSiteState?.name === 'CALL-EDI+35F' && typeof callSiteState.status === 'string' &&
    callSiteState.monitoringStatusAfterJC === 'DR0 reassigned to JC successors; CALL [EDI+0x35f] no longer monitored after JC',
  'CALL [EDI+0x35f] source signature or site record differs');
  assert(jumpSite?.offset === 161 && jumpSite.expectedBytesHex === 'ff6612' &&
    jumpSite.hitCount === 0 && jumpSite.destinationHitCount === 0 &&
    jumpSiteState?.status === 'armed' && jumpSiteState.hitCount === 0 && jumpSiteState.destinationHitCount === 0,
    'JMP [ESI+0x12] source signature or pre-branch stop boundary differs');
  const [outerCallEvent, outerDestinationEvent, branchEvent, successorEvent] = debugRecord.events;
  const branch = debugRecord.branchObservation;
  assert(outerCallEvent?.eventOrder === 1 && outerCallEvent.eip === mapping.callSiteAddress &&
    outerDestinationEvent?.eventOrder === 2 && outerDestinationEvent.eip === mapping.measuredOuterDestination &&
    branchEvent?.eventOrder === 3 && branchEvent.eip === branch?.address && branchEvent.liveBytesHex === '7209' &&
    successorEvent?.eventOrder === 4 && successorEvent.kind === 'successor-hit' &&
    ['JC-SUCCESSOR-FALLTHROUGH', 'JC-SUCCESSOR-TAKEN'].includes(successorEvent.site) &&
    outerCallEvent.kind === 'source-hit' && outerCallEvent.site === 'PREMIUM-CALL-EDI+27' && outerCallEvent.liveBytesHex === 'ff5727' &&
    outerDestinationEvent.kind === 'destination-hit' && outerDestinationEvent.site === 'PREMIUM-outer-destination' &&
    branchEvent.kind === 'branch-hit' && branchEvent.site === 'JC+8E' &&
    ['0x80000004', '0x4000001e'].includes(branchEvent.exceptionEvent?.code) &&
    branchEvent.exceptionEvent.firstChance === 1 && branchEvent.firstChance === true &&
    debugRecord.edges?.length === 0,
  'outer CALL/destination, JC, or successor event order differs from capture');
  const windowStart = Number.parseInt(String(window.windowStartAddress), 16);
  const jcAddress = `0x${(windowStart + 0x8e).toString(16).padStart(8, '0')}`;
  const eflags = hex32(branchEvent.registers?.eflags, 'JC event EFLAGS');
  const carry = eflags & 1;
  const edi = hex32(branchEvent.registers?.edi, 'JC event EDI');
  const esp = hex32(branchEvent.registers?.esp, 'JC event ESP');
  const compare = branch?.compareOperand;
  const compareBytes = Buffer.from(String(compare?.bytesHex ?? ''), 'hex');
  const candidate = branch?.candidateCallOperand;
  const candidateBytes = Buffer.from(String(candidate?.bytesHex ?? ''), 'hex');
  const compareValue = compareBytes.length === 4 ? compareBytes.readUInt32LE(0) : null;
  const candidateTarget = candidateBytes.length === 4 ? candidateBytes.readUInt32LE(0) : null;
  const expectedSuccessorOffset = carry === 1 ? 0x99 : 0x90;
  const expectedSuccessorOffsetHex = `0x${expectedSuccessorOffset.toString(16).padStart(8, '0')}`;
  const expectedSuccessor = `0x${(windowStart + expectedSuccessorOffset).toString(16).padStart(8, '0')}`;
  const expectedSuccessorBytesHex = carry === 1 ? '89442404' : 'eb85';
  const expectedSuccessorSite = carry === 1 ? 'JC-SUCCESSOR-TAKEN' : 'JC-SUCCESSOR-FALLTHROUGH';
  const expectedSuccessorSlot = carry === 1 ? 3 : 0;
  const expectedCallSite = windowStart + 0x17;
  const expectedJumpSite = windowStart + 0xa1;
  const expectedOuterContinuation = hex32(mapping.callSiteAddress, 'outer CALL source address') + 3;
  const jcBreakpointAddresses = [expectedCallSite, expectedJumpSite, expectedOuterContinuation, windowStart + 0x8e];
  const successorBreakpointAddresses = [windowStart + 0x90, expectedJumpSite, expectedOuterContinuation, windowStart + 0x99];
  const dr6CauseMask = 0xe00f;
  const dr7ControlMask = 0xffff0000;
  const branchDr6 = hex32(branchEvent.registers?.dr6, 'JC event DR6');
  const branchDr7 = hex32(branchEvent.registers?.dr7, 'JC event DR7');
  const branchArm = branch?.armReadback;
  const branchDisable = branch?.disableReadback;
  const armDr7 = hex32(branchArm?.dr7, 'JC arm DR7 readback');
  const disableDr7 = hex32(branchDisable?.dr7, 'JC disable DR7 readback');
  const branchDisableDr6 = hex32(branchDisable?.dr6, 'JC disable DR6 readback');
  const branchArmDr6 = hex32(branchArm?.dr6, 'JC arm DR6 readback');
  const branchDisableEflags = hex32(branchDisable?.eflags, 'JC disable EFLAGS readback');
  const branchArmEflags = hex32(branchArm?.eflags, 'JC arm EFLAGS readback');
  const fallthroughArm = branch?.dr0FallthroughArmReadback;
  const takenArm = branch?.dr3TakenArmReadback;
  const successorSlot = branch?.observedSuccessorSlot;
  assert(successorSlot === expectedSuccessorSlot, 'observed successor slot disagrees with the CF-derived arm');
  const successorArm = branch?.successorArmReadback;
  const dr0SuccessorDisable = branch?.dr0SuccessorDisableReadback;
  const dr3SuccessorDisable = branch?.dr3SuccessorDisableReadback;
  const successorDisable = branch?.successorDisableReadback;
  const successorArmDr7 = hex32(successorArm?.dr7, 'successor arm DR7 readback');
  const fallthroughArmDr7 = hex32(fallthroughArm?.dr7, 'fallthrough arm DR7 readback');
  const successorDisableDr7 = hex32(successorDisable?.dr7, 'successor disable DR7 readback');
  const dr0SuccessorDisableDr7 = hex32(dr0SuccessorDisable?.dr7, 'DR0 successor disable DR7 readback');
  const successorArmDr6 = hex32(successorArm?.dr6, 'successor arm DR6 readback');
  const fallthroughArmDr6 = hex32(fallthroughArm?.dr6, 'fallthrough arm DR6 readback');
  const dr0SuccessorDisableDr6 = hex32(dr0SuccessorDisable?.dr6, 'DR0 successor disable DR6 readback');
  const successorDisableDr6 = hex32(successorDisable?.dr6, 'successor disable DR6 readback');
  const successorArmEflags = hex32(successorArm?.eflags, 'successor arm EFLAGS readback');
  const fallthroughArmEflags = hex32(fallthroughArm?.eflags, 'fallthrough arm EFLAGS readback');
  const dr0SuccessorDisableEflags = hex32(dr0SuccessorDisable?.eflags, 'DR0 successor disable EFLAGS readback');
  const successorDisableEflags = hex32(successorDisable?.eflags, 'successor disable EFLAGS readback');
  const successorEventDr6 = hex32(successorEvent.registers?.dr6, 'successor event DR6');
  const successorEventDr7 = hex32(successorEvent.registers?.dr7, 'successor event DR7');
  const successorEventEflags = hex32(successorEvent.registers?.eflags, 'successor event EFLAGS');
  const successorEventAddress = hex32(successorEvent.eip, 'successor event EIP');
  const successorDisableDr3 = hex32(dr3SuccessorDisable?.dr3, 'DR3 successor disable DR3');
  const successorArmEip = hex32(successorArm?.eip, 'successor arm EIP');
  const successorDisableEip = hex32(successorDisable?.eip, 'successor disable EIP');
  const successorObservedBytes = windowBytes.subarray(expectedSuccessorOffset,
    expectedSuccessorOffset + expectedSuccessorBytesHex.length / 2).toString('hex');
  assert(branch?.armed === true && branch.hit === true && branch.address === jcAddress &&
    branchEvent.eip === jcAddress && branchEvent.slot === 3 &&
    (branchDr6 & dr6CauseMask) === 0x8 && (eflags & 0x100) === 0 &&
    (branchDr7 & 0xff) === 0x55 && (branchDr7 & dr7ControlMask) === 0 &&
    readbackHasAddresses(branchEvent.registers, jcBreakpointAddresses, 'JC event') &&
    branchArm?.threadId === debugRecord.selectedThreadId && branchDisable?.threadId === debugRecord.selectedThreadId &&
    (armDr7 & 0xff) === 0x55 && (armDr7 & dr7ControlMask) === 0 &&
    (disableDr7 & 0xff) === 0x15 && (disableDr7 & dr7ControlMask) === 0 &&
    readbackHasAddresses(branchArm, jcBreakpointAddresses, 'JC arm') &&
    readbackHasAddresses(branchDisable, jcBreakpointAddresses, 'JC disable') &&
    (branchArmDr6 & dr6CauseMask) === 0 && (branchDisableDr6 & dr6CauseMask) === 0 &&
    (branchArmEflags & 0x100) === 0 && (branchDisableEflags & 0x100) === 0 &&
    (carry === 0 || carry === 1) && branch.carryFlag === carry && branchEvent.carryFlag === carry &&
    branch.condition === (carry === 1 ? 'JC-taken' : 'JC-not-taken') &&
    branch.predictedSuccessorAddress === expectedSuccessor && branch.successorObserved === true &&
    branch.successorMatchesCfPrediction === true && branch.exactFourEventOrderMatched === true &&
    branch.dr0ReassignedFromCandidateCallAfterJC === true &&
    branch.observedSuccessorAddress === expectedSuccessor &&
    branch.observedSuccessorWindowOffset === expectedSuccessorOffsetHex &&
    branch.observedSuccessorBytesHex === expectedSuccessorBytesHex &&
    branch.observedSuccessorEventOrder === 4 && branch.observedSuccessorSlot === expectedSuccessorSlot &&
    continueReceipt.slot === expectedSuccessorSlot && continueReceipt.eip === expectedSuccessor &&
    branch.branchOutcomeObserved === true && branch.oneShotBreakpointDisabled === true &&
    successorEvent.kind === 'successor-hit' &&
    successorEvent.site === expectedSuccessorSite && successorEvent.eventOrder === 4 &&
    successorEvent.slot === expectedSuccessorSlot && successorEvent.eip === expectedSuccessor &&
    successorEventAddress === windowStart + expectedSuccessorOffset &&
    successorEvent.liveBytesHex === expectedSuccessorBytesHex && successorObservedBytes === expectedSuccessorBytesHex &&
    successorEvent.observedSuccessorAddress === expectedSuccessor &&
    successorEvent.observedSuccessorWindowOffset === expectedSuccessorOffsetHex &&
    successorEvent.observedSuccessorBytesHex === expectedSuccessorBytesHex &&
    successorEvent.expectedSuccessorBytesHex === expectedSuccessorBytesHex &&
    successorEvent.liveBytesMatchProfile === true && successorEvent.predictedSuccessorAddress === expectedSuccessor &&
    successorEvent.matchesCfPrediction === true && successorEvent.branchOutcomeObserved === true &&
    successorEvent.firstChance === true && ['0x80000004', '0x4000001e'].includes(successorEvent.exceptionEvent?.code) &&
    successorEvent.exceptionEvent.firstChance === 1 &&
    (successorEventDr6 & dr6CauseMask) === (1 << expectedSuccessorSlot) &&
    (successorEventEflags & 0x100) === 0 && readbackHasAddresses(successorEvent.registers, successorBreakpointAddresses, 'successor event') &&
    (successorEventDr7 & 0xff) === 0x55 && (successorEventDr7 & dr7ControlMask) === 0 &&
    fallthroughArm?.threadId === debugRecord.selectedThreadId && takenArm?.threadId === debugRecord.selectedThreadId &&
    successorArm?.threadId === debugRecord.selectedThreadId && dr0SuccessorDisable?.threadId === debugRecord.selectedThreadId &&
    dr3SuccessorDisable?.threadId === debugRecord.selectedThreadId && successorDisable?.threadId === debugRecord.selectedThreadId &&
    successorArmEip === windowStart + 0x8e && successorDisableEip === windowStart + expectedSuccessorOffset &&
    (fallthroughArmDr7 & 0xff) === 0x15 && (fallthroughArmDr7 & dr7ControlMask) === 0 &&
    (successorArmDr7 & 0xff) === 0x55 && (successorArmDr7 & dr7ControlMask) === 0 &&
    (dr0SuccessorDisableDr7 & 0xff) === 0x54 && (dr0SuccessorDisableDr7 & dr7ControlMask) === 0 &&
    (successorDisableDr7 & 0xff) === 0x14 && (successorDisableDr7 & dr7ControlMask) === 0 &&
    readbackHasAddresses(fallthroughArm, [windowStart + 0x90, expectedJumpSite, expectedOuterContinuation, windowStart + 0x8e], 'fallthrough arm') &&
    readbackHasAddresses(takenArm, successorBreakpointAddresses, 'taken arm') &&
    readbackHasAddresses(successorArm, successorBreakpointAddresses, 'successor arm') &&
    readbackHasAddresses(dr0SuccessorDisable, successorBreakpointAddresses, 'DR0 successor disable') &&
    readbackHasAddresses(dr3SuccessorDisable, successorBreakpointAddresses, 'DR3 successor disable') &&
    successorDisableDr3 === windowStart + 0x99 && branch.successorBreakpointsDisabled === true &&
    branch.successorDisableReadback?.dr7 === dr3SuccessorDisable?.dr7 &&
    (branch.successorDisableReadback?.dr0 === dr0SuccessorDisable?.dr0) &&
    (branch.successorDisableReadback?.dr1 === dr0SuccessorDisable?.dr1) &&
    (branch.successorDisableReadback?.dr2 === dr0SuccessorDisable?.dr2) &&
    (successorArmDr6 & dr6CauseMask) === 0 && (fallthroughArmDr6 & dr6CauseMask) === 0 &&
    (dr0SuccessorDisableDr6 & dr6CauseMask) === 0 && (successorDisableDr6 & dr6CauseMask) === 0 &&
    (successorArmEflags & 0x100) === 0 && (fallthroughArmEflags & 0x100) === 0 &&
    (dr0SuccessorDisableEflags & 0x100) === 0 && (successorDisableEflags & 0x100) === 0 &&
    compareValue !== null && compare.instruction === 'CMP [EDI-0x65],ESP' &&
    compare.instructionBytesHex === '39679b' && compare.baseRegister === 'EDI' &&
    hex32(compare.baseValue, 'CMP base value') === edi &&
    hex32(compare.address, 'CMP operand address') === edi - 0x65 &&
    hex32(compare.esp, 'CMP ESP') === esp &&
    compare.unsignedLessThan === (compareValue < esp) && compare.carryMatchesUnsignedComparison === true &&
    compare.unsignedLessThan === (carry === 1) &&
    candidateBytes.length === 4 && candidate.baseRegister === 'EDI' &&
    hex32(candidate.baseValue, 'candidate CALL base value') === edi &&
    Number.parseInt(String(candidate.offset), 16) === 0x35f &&
    hex32(candidate.address, 'candidate CALL slot address') === edi + 0x35f &&
    candidateTarget === hex32(branch.candidateCallTarget, 'candidate CALL raw value') &&
    branchEvent.candidateCallTarget === branch.candidateCallTarget,
  'JC condition, actual successor, hardware causes/readbacks, or raw candidate CALL slot failed validation');
  assert(outerCallEvent?.eip === mapping.callSiteAddress && outerDestinationEvent?.eip === mapping.measuredOuterDestination &&
    mapping.tailJumpDestinationAddress === null && mapping.tailJumpDestinationEqualsCurrentPick === false &&
    mapping.currentPickEntry,
  'outer destination or JC-successor capture boundary differs from mapping');
  assert(debugRecord.outerReturnGuard?.armed === true && debugRecord.outerReturnGuard.hit === false &&
    debugRecord.cleanupErrors.length === 0 && report.claims.continuousInstructionPathProven === false &&
    report.claims.directLispCallerProven === false && report.claims.jcConditionObservedBeforeInstruction === true &&
    report.claims.jcSuccessorObserved === true && report.claims.candidateInnerCallSlotCaptured === true &&
    report.claims.tailJumpEdgeBeforeOuterContinuation === false,
  'guard, cleanup, successor claim, or interpretation limitation gate failed');

  const observerRun = roles.get('observer');
  const observerMetadata = fileRecord(observerRun.metadata, 'observer metadata probe report', resolve(REPO, observerRun.root));
  const observerMetadataBytes = readFileSync(observerMetadata.path);
  const normalizedObserverMetadata = observerMetadata.text.replace(/\r\n/gu, '\n');
  assert(Buffer.from(observerMetadata.text, 'utf8').equals(observerMetadataBytes) &&
    !normalizedObserverMetadata.includes('\r') && normalizedObserverMetadata.endsWith(`${READY_METADATA_END}\n`),
  'observer metadata probe is not valid UTF-8 with a complete normalized line envelope');
  const metadataLines = normalizedObserverMetadata.slice(0, -1).split('\n');
  const metadataRecords = [
    READY_METADATA_BEGIN, READY_METADATA_INSTALL, READY_METADATA_READY,
    READY_METADATA_RELEASE, READY_METADATA_COMPLETE, READY_METADATA_END,
  ];
  let previousMetadataIndex = -1;
  const metadataRecordIndices = {};
  for (const marker of metadataRecords) {
    const matches = [];
    for (let index = 0; index < metadataLines.length; index += 1) {
      if (metadataLines[index] === marker) matches.push(index);
    }
    assert(matches.length === 1 && matches[0] > previousMetadataIndex,
      `observer metadata record is missing, duplicated, or out of order: ${marker}`);
    metadataRecordIndices[marker] = matches[0];
    previousMetadataIndex = matches[0];
  }
  assert(metadataLines[0] === READY_METADATA_BEGIN && metadataLines.at(-1) === READY_METADATA_END,
    'observer metadata BEGIN/END envelope is not exact');
  const readyMarkerBytes = Buffer.from(READY_METADATA_READY, 'utf8');
  const readyMarkerOffset = observerMetadataBytes.indexOf(readyMarkerBytes);
  const duplicateReadyMarkerOffset = observerMetadataBytes.indexOf(readyMarkerBytes, readyMarkerOffset + readyMarkerBytes.length);
  assert(readyMarkerOffset >= 0 && duplicateReadyMarkerOffset === -1,
    'raw observer metadata does not contain exactly one READY marker');
  const readyMarkerEnd = readyMarkerOffset + readyMarkerBytes.length;
  const readyLineEnd = observerMetadataBytes[readyMarkerEnd] === 0x0d && observerMetadataBytes[readyMarkerEnd + 1] === 0x0a
    ? readyMarkerEnd + 2
    : observerMetadataBytes[readyMarkerEnd] === 0x0a ? readyMarkerEnd + 1 : -1;
  assert(readyLineEnd > 0, 'raw observer READY marker is not followed by a line ending');
  const readyPrefixBytes = observerMetadataBytes.subarray(0, readyLineEnd);
  const readyPrefixSha256 = sha(readyPrefixBytes);
  checkHash(readyPrefixSha256, captureRecord.readyMetadataSha256, 'observer READY metadata prefix');
  checkHash(readyPrefixSha256, report.metadata.readyReportSha256, 'capture report READY metadata prefix');

  const observerRoot = resolve(REPO, roles.get('observer').root);
  const nativeMapPath = resolve(observerRoot, mapping.nativeMap);
  const nativeMapBytes = readFileSync(nativeMapPath);
  const nativeMapHash = sha(nativeMapBytes);
  checkHash(nativeMapHash, mapping.nativeMapSha256, 'native map');
  const manifestPath = resolve(observerRoot, mapping.nativeCaptureManifest);
  const manifestHash = sha(readFileSync(manifestPath));
  checkHash(manifestHash, mapping.nativeCaptureManifestSha256, 'native capture manifest');
  assert(comparison.debuggerResult.observerBinding?.status === 'source-bound-archive-revalidated' &&
    comparison.debuggerResult.observerBinding.nativeMapSha256 === nativeMapHash &&
    comparison.debuggerResult.observerBinding.recomputedNativeMapSha256 === nativeMapHash,
  'archived native map source binding was not independently revalidated');

  const topSources = {};
  const topSourcePaths = new Set();
  for (const [name, record] of Object.entries(comparison.sources ?? {})) {
    assert(typeof record.path === 'string' && typeof record.sha256 === 'string', `${name}: source path/hash record is malformed`);
    const source = readFile(record.path);
    assert(within(REPO, source.full) && record.path.replaceAll('\\', '/') === source.path,
      `${name}: source path is not a canonical repository-relative path`);
    assert(!topSourcePaths.has(source.path), `${name}: source path duplicates another bound source`);
    topSourcePaths.add(source.path);
    const matchesCapture = source.sha256 === record.sha256;
    checkHash(source.sha256, record.sha256, `comparison source ${name}`);
    topSources[name] = {
      path: source.path,
      bytes: source.bytes.length,
      capturedSha256: record.sha256,
      currentSha256: source.sha256,
      matchesCapture,
    };
  }
  assert(mapping.mapperSha256 === comparison.sources.mapper.sha256 &&
    mapping.reaStaticCensusPath === comparison.sources.reaStaticCensus.path &&
    mapping.reaStaticCensusSha256 === comparison.sources.reaStaticCensus.sha256,
  'native mapping mapper or REA census path/hash differs from top-level source bindings');

  const result = {
    schemaVersion: 1,
    status: 'accepted-complete-source-bound-native-triplet; jc-successor-observed; no-JavaScript-contract',
    triplet: {
      id: args.tripletId,
      mode: comparison.mode,
      canvas: comparison.aa0Header,
      roles: runRecords,
      controlsMatch: comparison.controlsMatch,
      beforeAfterPlanningTraceMatch: comparison.beforeAfterPlanningTraceMatch,
      comparisonSha256: comparisonFile.sha256,
      currentSourceInputs: topSources,
    },
    observation: {
      boundedScene: { mode: comparison.mode, canvas: comparison.aa0Header },
      outerCall: { address: mapping.callSiteAddress, destination: mapping.measuredOuterDestination, destinationRemainsAnonymous: true },
      branch: {
        instruction: 'JC rel8 +0x09', address: branch.address, bytesHex: branchEvent.liveBytesHex,
        predictedTargetWindowOffset: expectedSuccessorOffsetHex,
        carryFlag: branch.carryFlag, condition: branch.condition,
        reaStaticTakenTarget: {
          syntheticAddress: reaReport.raw_result.flow.direct_destinations[0],
          runtimeAddress: `0x${(windowStart + 0x99).toString(16).padStart(8, '0')}`,
          evidenceOnlyForTakenCase: true,
        },
        cmpOperand: branch.compareOperand,
        predictedSuccessorAddress: branch.predictedSuccessorAddress,
        successorObserved: true,
        branchOutcomeObserved: true,
        observedSuccessorAddress: branch.observedSuccessorAddress,
        observedSuccessorWindowOffset: branch.observedSuccessorWindowOffset,
        observedSuccessorBytesHex: branch.observedSuccessorBytesHex,
        observedSuccessorEventOrder: branch.observedSuccessorEventOrder,
        observedSuccessorSlot: branch.observedSuccessorSlot,
        dr0FallthroughArmReadback: branch.dr0FallthroughArmReadback,
        dr3TakenArmReadback: branch.dr3TakenArmReadback,
        successorArmReadback: branch.successorArmReadback,
        dr0SuccessorDisableReadback: branch.dr0SuccessorDisableReadback,
        dr3SuccessorDisableReadback: branch.dr3SuccessorDisableReadback,
        successorDisableReadback: branch.successorDisableReadback,
        observedSuccessor: {
          address: branch.observedSuccessorAddress,
          windowOffset: branch.observedSuccessorWindowOffset,
          bytesHex: branch.observedSuccessorBytesHex,
          site: successorEvent.site,
          eventOrder: branch.observedSuccessorEventOrder,
          slot: branch.observedSuccessorSlot,
          armReadback: branch.successorArmReadback,
          disableReadback: branch.successorDisableReadback,
        },
        candidateCallSlot: {
          instruction: '[EDI+0x35f]', address: branch.candidateCallOperand.address,
          bytesHex: branch.candidateCallOperand.bytesHex, rawValue: branch.candidateCallTarget,
          targetIdentityEstablished: false,
        },
      },
      innerCall: {
        instruction: 'CALL [EDI+0x35f]', address: callSite.address,
        sourceBreakpointStatusAtCaptureEnd: callSiteState.status,
        callExecutionEstablished: false, targetIdentityEstablished: false,
        status: 'not monitored through the JC successor event; no CALL edge or target identity is established',
        monitoringStatusAfterJC: callSiteState.monitoringStatusAfterJC,
      },
      tailJump: { instruction: 'JMP [ESI+0x12]', address: jumpSite.address, status: 'not-observed-before-successor-breakpoint' },
      limitations: [
        `This records one JC event and its first successor in one ${comparison.mode} scene at ${comparison.aa0Header}; it does not generalize to other seeds, scenes, or canvas regimes.`,
        'The anonymous outer destination and its direct Lisp caller remain unidentified.',
        'The observed successor agrees with the CF-derived JC condition; the successor instruction itself was stopped before execution.',
        'The [EDI+0x35f] value is a raw candidate slot; CALL execution and target identity are not established.',
        'The prior CALL source breakpoint may have been repurposed after JC; its later site status is not a CALL hit or no-hit result.',
        'Instructions and transfer sites after the observed successor remain outside this capture.',
        'This native capture adds no JavaScript behavior contract or painting parity.'
      ]
    },
    claims: {
      observedOuterCall: true,
      observedInnerCallDestinationEdge: false,
      observedInnerJumpDestinationEdge: false,
      jcConditionObservedBeforeInstruction: true,
      jcSuccessorObserved: true,
      candidateInnerCallSlotCaptured: true,
      tailJumpEdgeBeforeOuterContinuation: false,
      continuousInstructionPathProven: false,
      directLispCallerProven: false,
      candidateCallExecutionEstablished: false,
      candidateCallTargetIdentityEstablished: false,
    },
    nativeCapture: {
      reportPath: comparison.debuggerResult.path.replaceAll('\\', '/'),
      reportSha256: captureFile.sha256,
      readyMetadataSha256: comparison.debuggerResult.readyMetadataSha256,
      metadataProbe: {
        path: relative(REPO, observerMetadata.path).split(sep).join('/'),
        bytes: observerMetadata.bytes,
        sha256: observerMetadata.sha256,
        readyPrefixSha256,
        requiredRecords: metadataRecords,
      },
      debuggerDetached: debugRecord.detached,
      cleanupErrors: debugRecord.cleanupErrors,
      debuggerRegistersRestored: debugRecord.debugRegistersRestored,
      debugStateRestorationsExact: debugRecord.debugStateRestorations.every(row => row.exactMatch === true),
      selectedThreadRestoration: ownerRestore,
      successorContinueReceipt: continueReceipt,
      selectedThreadId: debugRecord.selectedThreadId,
      eventCount: debugRecord.eventCount,
      events: debugRecord.events,
      branchObservation: branch,
      targetWindowSha256: comparison.debuggerResult.targetWindowSha256,
      historicalReferenceWindowSha256: comparison.debuggerResult.referenceWindowSha256,
      pinnedInstructionProfileMatches: window.instructionProfileMatches,
      nativeMapSha256: nativeMapHash,
      nativeCaptureManifestSha256: manifestHash,
      outerReturnGuard: debugRecord.outerReturnGuard,
    },
    provenance: {
      comparison: comparisonFile.path,
      reaStaticInstruction: {
        inputPe: reaPe.path,
        inputPeSha256: reaPe.sha256,
        seed: reaSeed.path,
        seedSha256: reaSeed.sha256,
        report: reaReportFile.path,
        reportSha256: reaReportFile.sha256,
        invocation: reaInvocationFile.path,
        invocationSha256: reaInvocationFile.sha256,
      },
      nativeMapPath: relative(REPO, nativeMapPath).split(sep).join('/'),
      nativeCaptureManifestPath: relative(REPO, manifestPath).split(sep).join('/'),
      deriverPath: relative(REPO, fileURLToPath(import.meta.url)).split(sep).join('/'),
      deriverSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    },
  };
  const output = resolve(REPO, args.output);
  assert(within(REPO, output), 'output must stay inside repository');
  assert(args.overwrite || !existsSync(output), `refusing to overwrite ${args.output}`);
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(output, bytes, { flag: args.overwrite ? 'w' : 'wx' });
  process.stdout.write(`${JSON.stringify({ output: relative(REPO, output).split(sep).join('/'), sha256: sha(bytes), tripletId: args.tripletId, controlsMatch: true, sourceBoundComplete: true, jcCarryFlag: branch.carryFlag, observedSuccessorAddress: branch.observedSuccessorAddress, observedSuccessorWindowOffset: branch.observedSuccessorWindowOffset, successorObserved: true }, null, 2)}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
