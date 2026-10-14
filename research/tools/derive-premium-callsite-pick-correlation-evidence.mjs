#!/usr/bin/env node

// Validate the source-bound PREMIUM call destination/PICK correlation triplet
// and emit a compact record. This is offline: it launches no oracle or debugger.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '../..');
const DEFAULT_COMPARISON = 'research/extracted/local-oracle/premium-callsite-triplet-v1-logs/premium-pick-correlation-20261014-123439-dc725f61/triplet-comparison.json';
const DEFAULT_OUTPUT = 'research/introspection/evidence/premium-callsite-pick-correlation-20261014-v1.json';
const PROBE = 'research/introspection/premium-callsite-metadata-v1.cl';
const HELPER = 'research/oracle/AaronPremiumCallsitePickCorrelationV1.cs';
const COORDINATOR = 'research/tools/capture-premium-callsite-triplet-v1.ps1';
const RUNNER = 'research/oracle/run-local-scene-state-required-probe.ps1';
const MAPPER = 'research/tools/map-native-code-to-pll.mjs';
const CENSUS = 'research/introspection/evidence/select-subject-call-census-20261014-v1.json';
const MANIFEST = 'research/extracted/aaron/manifest.json';
const PRIOR_DESTINATION_EVIDENCE = 'research/introspection/evidence/premium-callsite-destination-breakpoint-20261014-v1.json';
const DERIVER = 'research/tools/derive-premium-callsite-pick-correlation-evidence.mjs';
const REQUIRED_ARTIFACTS = ['aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt'];
const HEX64 = /^[0-9a-f]{64}$/u;
const REPORT_NAME = 'aaron-premium-callsite-pick-correlation-v1.txt';
const BEGIN = 'BEGIN premium-callsite-pick-correlation-v1';
const END = 'END premium-callsite-pick-correlation-v1';

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function isWithin(root, full) {
  const rel = relative(root, full);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function read(root, path) {
  const full = resolve(root, path);
  const bytes = readFileSync(full);
  return { full, bytes, text: bytes.toString('utf8'), sha256: sha(bytes) };
}
function json(root, path) {
  const file = read(root, path);
  try { return { ...file, value: JSON.parse(file.text.replace(/^\uFEFF/u, '')) }; }
  catch (error) { fail(`${path}: invalid JSON (${error.message})`); }
}
function repoPath(root, path) { return relative(root, resolve(root, path)).split(sep).join('/'); }
function checkHash(actual, expected, label) {
  assert(typeof expected === 'string' && HEX64.test(expected.toLowerCase()), `${label}: malformed SHA-256`);
  assert(actual === expected.toLowerCase(), `${label}: SHA-256 mismatch`);
}
function sameHex(a, b) {
  try { return typeof a === 'string' && typeof b === 'string' && BigInt(a) === BigInt(b); }
  catch { return false; }
}
function hexValue(value) {
  try { return typeof value === 'string' ? BigInt(value) : null; }
  catch { return null; }
}
function parseArgs(argv) {
  const out = { root: DEFAULT_ROOT, comparison: DEFAULT_COMPARISON, output: DEFAULT_OUTPUT, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--repo-root') out.root = resolve(argv[++i] ?? '');
    else if (argv[i] === '--comparison') out.comparison = argv[++i] ?? '';
    else if (argv[i] === '--out') out.output = argv[++i] ?? '';
    else if (argv[i] === '--overwrite') out.overwrite = true;
    else if (argv[i] === '--help') {
      process.stdout.write('Usage: node research/tools/derive-premium-callsite-pick-correlation-evidence.mjs [--comparison PATH] [--out PATH] [--overwrite]\n');
      process.exit(0);
    } else fail(`Unknown argument: ${argv[i]}`);
  }
  assert(out.comparison && out.output, '--comparison and --out must be nonempty paths');
  return out;
}
function recordAt(root, record, label) {
  assert(record && typeof record.path === 'string', `${label}: path missing`);
  const file = read(root, record.path);
  assert(Number.isInteger(record.bytes) && file.bytes.length === record.bytes, `${label}: byte count mismatch`);
  checkHash(file.sha256, record.sha256, label);
  return file;
}
function parseEnvelope(text, label) {
  const normalized = text.replace(/\r\n/gu, '\n');
  assert(!normalized.includes('\r'), `${label}: lone CR in capture`);
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  assert(lines[0] === BEGIN && lines.at(-1) === END, `${label}: incomplete BEGIN/END markers`);
  assert(lines.filter(line => line === END).length === 1, `${label}: duplicate END marker`);
  try { return JSON.parse(lines.slice(1, -1).join('\n')); }
  catch (error) { fail(`${label}: invalid JSON (${error.message})`); }
}
function validateRun(root, comparison, run, role) {
  assert(run.role === role, `${role}: unexpected run order`);
  assert(run.complete === true && run.mode === 'writer-stream-seed-1234' && run.smallImage === false,
    `${role}: run is incomplete or uses another mode`);
  assert(run.aa0Header === '768 1080 148', `${role}: expected 768x1080 AA0 header`);
  const runRoot = resolve(root, run.root);
  assert(isWithin(root, runRoot), `${role}: run root escaped repository`);
  const summaryFile = json(root, `${repoPath(root, run.root)}/summary.json`);
  checkHash(summaryFile.sha256, run.summarySha256, `${role} summary`);
  const summary = summaryFile.value;
  assert(summary.runId === run.runId && summary.complete === true && summary.mode === run.mode,
    `${role}: on-disk summary identity/completion mismatch`);
  assert(summary.runnerSha256 === run.runnerSha256 && summary.runnerSha256 === comparison.sources.runner.sha256,
    `${role}: runner hash mismatch`);
  assert(summary.installerSha256 === run.installerSha256, `${role}: installer identity mismatch`);
  if (role === 'observer') {
    assert(summary.preSceneProbeSha256 === comparison.sources.probe.sha256,
      'observer summary is not bound to the selected metadata probe');
    assert(summary.requiredProbeOutputName === REPORT_NAME && summary.requiredProbeEndMarker === END &&
      summary.probeCompletionSatisfied === true && summary.probeOutputNames?.includes(REPORT_NAME),
    'observer did not satisfy the source-bound correlation report gate');
  } else {
    assert(!summary.preSceneProbeSha256 && !summary.requiredProbeOutputName &&
      !summary.requiredProbeOutputSha256 && !summary.requiredProbeEndMarker &&
      (summary.probeOutputNames ?? []).length === 0,
    `${role}: uninstrumented control contains probe configuration`);
  }

  const artifacts = {};
  for (const name of REQUIRED_ARTIFACTS) {
    const file = recordAt(root, run.artifacts?.[name], `${role} artifact ${name}`);
    assert(isWithin(runRoot, file.full), `${role}: artifact escaped run root (${name})`);
    artifacts[name] = { bytes: file.bytes.length, sha256: file.sha256 };
  }
  const sources = {};
  for (const [name, record] of Object.entries(run.sources ?? {})) {
    const file = recordAt(root, record, `${role} staged source ${name}`);
    assert(isWithin(runRoot, file.full), `${role}: staged source escaped run root (${name})`);
    sources[name] = { bytes: file.bytes.length, sha256: file.sha256 };
  }
  assert(Object.keys(sources).length === 6, `${role}: expected six staged scene sources`);
  const trace = recordAt(root, run.planningTrace, `${role} planning trace`);
  assert(isWithin(runRoot, trace.full), `${role}: planning trace escaped run root`);
  const runtime = {};
  for (const [name, record] of Object.entries(run.runtime ?? {})) {
    const file = recordAt(root, record, `${role} runtime ${name}`);
    assert(isWithin(runRoot, file.full), `${role}: runtime copy escaped run root (${name})`);
    runtime[name] = { bytes: file.bytes.length, sha256: file.sha256 };
  }
  assert(Object.keys(runtime).length === 2, `${role}: expected AARON.exe and AARON.pll copies`);
  return { run, summary, artifacts, sources, trace: { bytes: trace.bytes.length, sha256: trace.sha256 }, runtime };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root;
  const comparisonFile = json(root, args.comparison);
  const comparison = comparisonFile.value;
  assert(comparison.schemaVersion === 1 && comparison.mode === 'writer-stream-seed-1234', 'unexpected triplet schema/mode');
  assert(typeof comparison.tripletId === 'string' && /^premium-pick-(?:correlation|v\d+)-[a-z0-9-]+$/u.test(comparison.tripletId), 'unexpected triplet ID');
  assert(comparison.controlsMatch === true && comparison.beforeAfterPlanningTraceMatch === true,
    'source-bound fresh controls did not match');
  assert(Array.isArray(comparison.runs) && comparison.runs.length === 3, 'expected before/observer/after runs');
  const runs = [
    validateRun(root, comparison, comparison.runs[0], 'before'),
    validateRun(root, comparison, comparison.runs[1], 'observer'),
    validateRun(root, comparison, comparison.runs[2], 'after'),
  ];
  for (const name of REQUIRED_ARTIFACTS) {
    const rows = runs.map(row => row.artifacts[name]);
    assert(rows.every(row => row.bytes === rows[0].bytes && row.sha256 === rows[0].sha256), `scene/control mismatch: ${name}`);
  }
  for (const name of Object.keys(runs[0].sources)) {
    const rows = runs.map(row => row.sources[name]);
    assert(rows.length === 3 && rows.every(row => row.bytes === rows[0].bytes && row.sha256 === rows[0].sha256), `staged source mismatch: ${name}`);
  }
  assert(runs.every(row => row.trace.bytes === runs[0].trace.bytes && row.trace.sha256 === runs[0].trace.sha256),
    'planning trace differs across before/observer/after runs');
  assert(runs.every(row => row.run.runnerSha256 === runs[0].run.runnerSha256 && row.run.installerSha256 === runs[0].run.installerSha256),
    'runner/installer identities differ across triplet');
  for (const name of Object.keys(runs[0].runtime)) {
    const rows = runs.map(row => row.runtime[name]);
    assert(rows.every(row => row.bytes === rows[0].bytes && row.sha256 === rows[0].sha256), `runtime differs for ${name}`);
  }

  const sourceBindings = [COORDINATOR, PROBE, HELPER, RUNNER, MAPPER, CENSUS, MANIFEST, DERIVER].map(path => {
    const file = read(root, path);
    const names = {
      [COORDINATOR]: 'coordinator', [PROBE]: 'probe', [HELPER]: 'debuggerHelper',
      [RUNNER]: 'runner', [MAPPER]: 'mapper', [CENSUS]: 'reaStaticCensus',
      [MANIFEST]: 'extractedManifest',
    };
    const binding = names[path];
    if (binding) {
      const expected = comparison.sources[binding];
      assert(expected?.path === path, `triplet missing source binding for ${path}`);
      if (file.sha256 !== expected.sha256) {
        const snapshotBinding = expected.captureSourceSnapshot;
        assert(binding === 'coordinator' && snapshotBinding && typeof snapshotBinding.path === 'string',
          `current source ${path}: SHA-256 mismatch`);
        const snapshot = read(root, snapshotBinding.path);
        checkHash(snapshot.sha256, snapshotBinding.sha256, `captured source snapshot ${path}`);
        checkHash(snapshot.sha256, expected.sha256, `captured source binding ${path}`);
      }
    }
    const source = { path, bytes: file.bytes.length, sha256: file.sha256 };
    const snapshotBinding = binding ? comparison.sources[binding]?.captureSourceSnapshot : null;
    if (snapshotBinding) source.captureSourceSnapshot = snapshotBinding;
    return source;
  });
  const manifest = json(root, MANIFEST).value;
  for (const name of ['AARON.exe', 'AARON.pll']) {
    const entry = manifest.files.find(row => row.installedName === name);
    assert(entry && runs.every(row => row.run.runtime[name].sha256 === entry.sha256 && row.run.runtime[name].bytes === entry.bytes),
      `runtime identity does not match extracted manifest for ${name}`);
  }
  const priorDestinationFile = json(root, PRIOR_DESTINATION_EVIDENCE);
  assert(priorDestinationFile.value.destination?.address?.toLowerCase() === '0x20000983' &&
    priorDestinationFile.value.destination?.sha256 === 'eaa3cf34cd04bd79ab9eeb83a3e5489c43d04481f16e3898e1cb65427e64b57a',
  'prior accepted destination evidence does not identify the expected anonymous window');

  const observer = runs[1].run;
  const captureFile = recordAt(root, observer.debuggerResult, 'observer PICK-correlation report');
  const report = parseEnvelope(captureFile.text, 'observer PICK-correlation report');
  const mapping = report.mapping;
  const debug = report.debugger;
  const call = debug?.call;
  const destination = debug?.destinationBreakpoint;
  const pick = debug?.pickEntryObservation;
  const continuation = debug?.callContinuationObservation;
  const callSite = '0x1fe4c07c';
  const destinationAddress = '0x20000983';
  const pickEntry = '0x1fe00e8c';
  const expectedReturn = '0x1fe4c07f';
  assert(report.schemaVersion === 1 && report.tripletId === comparison.tripletId && report.runId === observer.runId &&
    report.oracleRunId === observer.runId && report.mode === 'writer-stream-seed-1234', 'debug report is not bound to observer run');
  assert(mapping?.premiumUniqueCompletePllMatch === true && mapping?.pickUniqueCompletePllMatch === true &&
    mapping.premiumPayloadBytes === 362 && mapping.pickPayloadBytes === 114 && mapping.pickEntry === pickEntry &&
    mapping.pickEntryBytesHex?.toLowerCase() === '558bec5683ec2c89450889550c8d4508',
  'PREMIUM/PICK complete PLL payload mapping is not unique and current');
  assert(report.coordinatorScriptPath === COORDINATOR && report.debuggerHelperPath === HELPER &&
    report.coordinatorScriptSha256 === comparison.sources.coordinator.sha256 &&
    report.debuggerHelperSha256 === comparison.sources.debuggerHelper.sha256,
  'debug report source identities do not match triplet');
  assert(debug?.schema === 'aaron-premium-callsite-pick-correlation-v1' && debug.callSiteAddress === callSite &&
    debug.callSiteValidation?.matched === true && debug.callSiteValidation?.bytesAtHitHex?.toLowerCase() === 'ff5727' &&
    call?.hit === true && call.status === 'call-destination-captured' && call.threadId === call.preCallRegisters?.threadId &&
    call.preCallRegisters?.eip?.toLowerCase() === callSite && call.preCallDispatchSlot?.offset?.toLowerCase() === '0x00000027' &&
    call.preCallDispatchSlot?.bytesHex?.toLowerCase() === '83090020' && call.preCallDispatchSlot?.value?.toLowerCase() === destinationAddress,
  'measured pre-CALL instruction, owner thread, or live slot value did not match');
  assert(destination?.hit === true && destination.completed === true && destination.status === 'destination-execute-breakpoint-hit-before-instruction' &&
    destination.expectedAddress?.toLowerCase() === destinationAddress && destination.targetEip?.toLowerCase() === destinationAddress &&
    destination.targetRegisters?.eip?.toLowerCase() === destinationAddress && destination.targetRegisters?.threadId === call.threadId &&
    destination.firstChance === true && destination.dr6B0Set === true && destination.addressMatchesPreCallSlot === true &&
    destination.espDecrementedByFour === true && destination.returnAddressMatchesCallContinuation === true &&
    destination.returnAddressAtEsp?.value?.toLowerCase() === expectedReturn,
  'direct CALL destination/stack breakpoint gates did not pass');
  assert(destination.debugRegistersRestored === true && debug.callDebugRegistersRestoredBeforeDestination === true &&
    debug.debugRegistersRestored === true && debug.debugRegistersAndTrapFlagRestored === true && debug.detached === true &&
    debug.readyPauseReleased === true && debug.captureError === null && (debug.cleanupErrors ?? []).length === 0,
  'debugger cleanup, detach, or READY release was incomplete');
  const window = destination.destinationWindow;
  const windowBytes = Buffer.from(window?.bytesHex ?? '', 'hex');
  assert(window?.eip?.toLowerCase() === destinationAddress && window.requestedBytes === 32 && window.bytesRead === 32 &&
    window.readError === null && windowBytes.length === 32 && window.bytesHex.length === 64,
  'anonymous destination window is incomplete');
  assert(sha(windowBytes) === priorDestinationFile.value.destination.sha256,
    'anonymous destination bytes differ from the prior accepted destination capture');
  assert(report.directCpuDestination?.address?.toLowerCase() === destinationAddress &&
    report.directCpuDestination.equalsCurrentPickEntry === false && destinationAddress !== mapping.pickEntry.toLowerCase(),
  'direct CALL destination was conflated with current PICK entry');

  const hitDr6 = hexValue(pick?.dr6);
  const hitRegisters = pick?.registersAtHit;
  const armedReadback = pick?.armedContextReadback;
  const armedDr6 = hexValue(armedReadback?.dr6);
  const armedDr7 = hexValue(armedReadback?.dr7);
  const armedEflags = hexValue(armedReadback?.eflags);
  assert(pick?.observed === true && pick.status === 'PICK-entry-hit-before-original-CALL-continuation' &&
    pick.configuredEntryAddress?.toLowerCase() === pickEntry && pick.eip?.toLowerCase() === pickEntry &&
    pick.threadId === call.threadId && pick.sameThreadAsCall === true && pick.firstChance === true && pick.dr6B0Set === true &&
    pick.dr6B1Clear === true &&
    pick.breakpointArmed === true && pick.debugRegistersRestoredAtObservation === true &&
    sameHex(pick.esp, destination.targetEsp) && sameHex(pick.ebp, destination.targetRegisters?.ebp) &&
    pick.savedStackValue?.toLowerCase() === expectedReturn &&
    pick.savedStackValueMatchesCallContinuation === true && pick.sameEspAsInitialDestination === true &&
    pick.sameReturnAddressAsInitialDestination === true && pick.sameEbpAsInitialDestination === true &&
    pick.sameOriginalStackFrame === true && pick.entryBytesAtHit?.toLowerCase() === mapping.pickEntryBytesHex.toLowerCase() &&
    hitDr6 !== null && (hitDr6 & 1n) !== 0n && (hitDr6 & 2n) === 0n &&
    hitRegisters?.threadId === call.threadId && sameHex(hitRegisters.eip, pick.eip) &&
    sameHex(hitRegisters.esp, pick.esp) && sameHex(hitRegisters.ebp, pick.ebp) && sameHex(hitRegisters.dr6, pick.dr6) &&
    sameHex(armedReadback?.eip, destination.targetEip) && sameHex(armedReadback?.esp, destination.targetEsp) &&
    sameHex(armedReadback?.dr0, pickEntry) && sameHex(armedReadback?.dr1, expectedReturn) &&
    armedDr6 === 0n && armedDr7 !== null && (armedDr7 & 0x00ff00ffn) === 0x00000005n &&
    armedEflags !== null && (armedEflags & 0x100n) === 0n &&
    pick.hitExceptionEvent?.firstChance === 1 && pick.hitExceptionEvent?.threadId === call.threadId &&
    sameHex(pick.hitExceptionEvent?.exceptionAddress, pickEntry),
  'PICK entry same-thread/frame/stack/native-byte correlation did not pass');
  assert(continuation?.configuredAddress?.toLowerCase() === expectedReturn && continuation.breakpointArmed === true &&
    continuation.observed === false && continuation.status === 'PICK-entry-hit-before-CALL-continuation' &&
    continuation.debugRegistersRestoredAtObservation === true,
  'call-continuation guard record is not consistent with PICK-first result');
  assert(report.claims?.directCpuEdgeToPick === false,
    'report must preserve that the direct CPU destination was not PICK');

  const result = {
    schemaVersion: 1,
    status: 'observed-current-PICK-entry-before-measured-CALL-continuation; intermediate-transfer-unresolved',
    triplet: {
      id: comparison.tripletId,
      mode: comparison.mode,
      canvas: runs[0].run.aa0Header,
      roles: runs.map(row => ({ role: row.run.role, runId: row.run.runId, complete: row.run.complete, root: row.run.root })),
      controlsMatch: true,
      beforeAfterPlanningTraceMatch: true,
      matchingDrawingSceneArtifacts: REQUIRED_ARTIFACTS,
      matchingStagedSourceCount: Object.keys(runs[0].sources).length,
      planningTrace: runs[0].trace,
      runnerSha256: runs[0].run.runnerSha256,
      installerSha256: runs[0].run.installerSha256,
    },
    call: {
      sourceFunction: 'COMMON-GRAPHICS-USER::SELECT-SUBJECT, method specialized on (EQL PREMIUM)',
      payloadOffset: 200,
      address: callSite,
      bytes: 'ff5727',
      instruction: 'CALL dword ptr [EDI + 0x27]',
      threadId: call.threadId,
      preCallRegisters: call.preCallRegisters,
      dispatchSlotAddress: call.preCallDispatchSlot.address,
      dispatchSlotBytes: call.preCallDispatchSlot.bytesHex,
      observedDirectCpuDestination: destinationAddress,
      directDestinationBeforeFirstInstruction: true,
    },
    pickEntryCorrelation: {
      address: pickEntry,
      sameThreadAsMeasuredCall: true,
      firstChanceDr0ExecuteBreakpoint: true,
      entryBytesAtHit: pick.entryBytesAtHit.toLowerCase(),
      registersAtHit: hitRegisters,
      sameEspAsInitialDestination: true,
      ebpAtPickEntry: pick.ebp,
      sameEbpAsInitialDestination: true,
      savedStackValue: pick.savedStackValue,
      savedStackMatchesCallContinuation: true,
      observedBeforeContinuationGuard: true,
      directCpuEdgeFromMeasuredCallDestination: false,
      guardAddress: expectedReturn,
      guardObserved: false,
    },
    anonymousDestination: {
      address: destinationAddress,
      equalsCurrentPickEntry: false,
      bytesHex: window.bytesHex.toLowerCase(),
      bytes: windowBytes.length,
      sha256: sha(windowBytes),
      region: window.region,
    },
    provenance: {
      comparison: { path: repoPath(root, args.comparison), sha256: comparisonFile.sha256 },
      debuggerReport: { path: observer.debuggerResult.path, sha256: captureFile.sha256 },
      priorDestinationEvidence: { path: PRIOR_DESTINATION_EVIDENCE, sha256: priorDestinationFile.sha256, tripletId: priorDestinationFile.value.triplet.id },
      currentSources: sourceBindings,
    },
    limitations: [
      'This is one source-bound 768x1080 seed-1234 scene; the correlation is not a general call graph.',
      'The direct CPU destination of CALL [EDI+0x27] was 0x20000983. PICK was observed later on the same thread with matching ESP, EBP, and saved continuation before the continuation guard fired.',
      'The capture does not record the native instructions or transfer that lead from the anonymous destination to PICK, and it does not prove a direct edge from that destination to PICK.',
      'The retained stack and frame markers reduce ambiguity but do not rule out every form of stack reuse or unobserved control transfer before the continuation guard.',
      'No native ABI, Lisp argument meaning, broader function behavior, JavaScript contract, or painting/scene parity is established by this caller-path observation.',
    ],
  };

  const outputPath = resolve(root, args.output);
  assert(isWithin(root, outputPath), 'output path must stay inside the repository');
  assert(args.overwrite || !existsSync(outputPath), `refusing to overwrite ${args.output}`);
  const outputText = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(outputPath, outputText, { flag: args.overwrite ? 'w' : 'wx' });
  process.stdout.write(`${JSON.stringify({ output: repoPath(root, outputPath), sha256: sha(Buffer.from(outputText)), tripletId: comparison.tripletId, directDestination: destinationAddress, pickEntry, controlsMatch: true }, null, 2)}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
