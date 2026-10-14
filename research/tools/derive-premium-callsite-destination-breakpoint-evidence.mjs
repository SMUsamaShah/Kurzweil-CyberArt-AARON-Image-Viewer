#!/usr/bin/env node

// Validate the source-bound PREMIUM call destination breakpoint triplet and
// emit a compact record. This does not launch AARON, a debugger, REA, or Ghidra.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '../..');
const DEFAULT_COMPARISON = 'research/extracted/local-oracle/premium-callsite-triplet-v1-logs/premium-destination-20261014-121303-a73bf9c8/triplet-comparison.json';
const DEFAULT_OUTPUT = 'research/introspection/evidence/premium-callsite-destination-breakpoint-20261014-v1.json';
const REA_EVIDENCE = 'research/introspection/evidence/premium-callsite-destination-window-rea-20261014-v1.json';
const DERIVER = 'research/tools/derive-premium-callsite-destination-breakpoint-evidence.mjs';
const PROBE = 'research/introspection/premium-callsite-metadata-v1.cl';
const HELPER = 'research/oracle/AaronPremiumCallsiteDestinationBreakpointV1.cs';
const RUNNER = 'research/oracle/run-local-scene-state-required-probe.ps1';
const MAPPER = 'research/tools/map-native-code-to-pll.mjs';
const CENSUS = 'research/introspection/evidence/select-subject-call-census-20261014-v1.json';
const MANIFEST = 'research/extracted/aaron/manifest.json';
const REQUIRED_ARTIFACTS = ['aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt'];
const HEX64 = /^[0-9a-f]{64}$/u;

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
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
function parseArgs(argv) {
  const out = { root: DEFAULT_ROOT, comparison: DEFAULT_COMPARISON, output: DEFAULT_OUTPUT, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--repo-root') out.root = resolve(argv[++i] ?? '');
    else if (argv[i] === '--comparison') out.comparison = argv[++i] ?? '';
    else if (argv[i] === '--out') out.output = argv[++i] ?? '';
    else if (argv[i] === '--overwrite') out.overwrite = true;
    else if (argv[i] === '--help') {
      process.stdout.write('Usage: node research/tools/derive-premium-callsite-destination-breakpoint-evidence.mjs [--comparison PATH] [--out PATH] [--overwrite]\n');
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
function parseEnvelope(text, begin, end, label) {
  const normalized = text.replace(/\r\n/gu, '\n');
  assert(!normalized.includes('\r'), `${label}: lone CR characters in required capture`);
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  assert(lines[0] === begin && lines.at(-1) === end, `${label}: incomplete BEGIN/END markers`);
  assert(lines.filter(line => line === end).length === 1, `${label}: duplicate END marker`);
  try { return JSON.parse(lines.slice(1, -1).join('\n')); }
  catch (error) { fail(`${label}: invalid envelope JSON (${error.message})`); }
}
function validateRun(root, comparison, run, role, tripletId) {
  assert(run.role === role, `${role}: unexpected run ordering`);
  assert(run.complete === true && run.mode === 'writer-stream-seed-1234' && run.smallImage === false,
    `${role}: run summary is incomplete or uses another mode`);
  assert(run.aa0Header === '768 1080 148', `${role}: expected 768x1080 AA0 header`);
  const runRoot = resolve(root, run.root);
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
      'observer summary does not bind the current metadata probe');
    assert(summary.requiredProbeOutputName === 'aaron-premium-callsite-destination-breakpoint-v1.txt',
      'observer required output name mismatch');
    assert(summary.requiredProbeEndMarker === 'END premium-callsite-destination-breakpoint-v1',
      'observer required output end marker mismatch');
    assert(summary.probeCompletionSatisfied === true, 'observer did not satisfy its required probe completion');
  } else {
    assert(!summary.preSceneProbeSha256 && !summary.requiredProbeOutputName &&
      !summary.requiredProbeOutputSha256 && !summary.requiredProbeEndMarker &&
      (summary.probeOutputNames ?? []).length === 0,
    `${role}: control is instrumented`);
  }

  const artifacts = {};
  for (const name of REQUIRED_ARTIFACTS) {
    const record = run.artifacts?.[name];
    const file = recordAt(root, record, `${role} artifact ${name}`);
    artifacts[name] = { bytes: file.bytes.length, sha256: file.sha256 };
    assert(resolve(file.full).startsWith(runRoot + sep), `${role} artifact escaped its run root: ${name}`);
  }
  const sources = {};
  for (const [name, record] of Object.entries(run.sources ?? {})) {
    const file = recordAt(root, record, `${role} staged source ${name}`);
    sources[name] = { bytes: file.bytes.length, sha256: file.sha256 };
    assert(resolve(file.full).startsWith(runRoot + sep), `${role} staged source escaped its run root: ${name}`);
  }
  assert(Object.keys(sources).length === 6, `${role}: expected six staged Lisp sources`);
  const trace = recordAt(root, run.planningTrace, `${role} planning trace`);
  assert(resolve(trace.full).startsWith(runRoot + sep), `${role}: planning trace escaped its run root`);

  for (const [name, runtimeRecord] of Object.entries(run.runtime ?? {})) {
    const file = recordAt(root, runtimeRecord, `${role} runtime ${name}`);
    assert(resolve(file.full).startsWith(runRoot + sep), `${role}: runtime copy escaped its run root`);
  }
  assert(Object.keys(run.runtime ?? {}).length === 2, `${role}: expected the two manifested runtime files`);
  return { run, summary, artifacts, sources, trace: { bytes: trace.bytes.length, sha256: trace.sha256 } };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root;
  const comparisonFile = json(root, args.comparison);
  const comparison = comparisonFile.value;
  assert(comparison.schemaVersion === 1 && comparison.mode === 'writer-stream-seed-1234', 'unexpected triplet schema or mode');
  assert(typeof comparison.tripletId === 'string' && comparison.tripletId.startsWith('premium-destination-'), 'unexpected triplet ID');
  assert(comparison.controlsMatch === true && comparison.beforeAfterPlanningTraceMatch === true,
    'source-bound scene/control comparison did not pass');
  assert(Array.isArray(comparison.runs) && comparison.runs.length === 3, 'expected a before/observer/after triplet');

  const runs = [
    validateRun(root, comparison, comparison.runs[0], 'before', comparison.tripletId),
    validateRun(root, comparison, comparison.runs[1], 'observer', comparison.tripletId),
    validateRun(root, comparison, comparison.runs[2], 'after', comparison.tripletId),
  ];
  for (const name of REQUIRED_ARTIFACTS) {
    const rows = runs.map(row => row.artifacts[name]);
    assert(rows.every(row => row.bytes === rows[0].bytes && row.sha256 === rows[0].sha256), `scene/control artifact mismatch: ${name}`);
  }
  for (const name of Object.keys(runs[0].sources)) {
    const rows = runs.map(row => row.sources[name]);
    assert(rows.length === 3 && rows.every(row => row.bytes === rows[0].bytes && row.sha256 === rows[0].sha256), `staged source mismatch: ${name}`);
  }
  assert(runs.every(row => row.trace.bytes === runs[0].trace.bytes && row.trace.sha256 === runs[0].trace.sha256),
    'planning trace mismatch across before/observer/after runs');
  assert(runs.every(row => row.run.runnerSha256 === runs[0].run.runnerSha256 && row.run.installerSha256 === runs[0].run.installerSha256),
    'runner/installer identities differ across triplet');
  for (const name of Object.keys(runs[0].run.runtime)) {
    const records = runs.map(row => row.run.runtime[name]);
    assert(records.every(row => row.bytes === records[0].bytes && row.sha256 === records[0].sha256), `runtime identity differs for ${name}`);
  }

  const sourceBindings = [PROBE, HELPER, RUNNER, MAPPER, CENSUS, MANIFEST, DERIVER].map(path => {
    const file = read(root, path);
    const bindingName = {
      [PROBE]: 'probe', [RUNNER]: 'runner', [HELPER]: 'debuggerHelper', [MAPPER]: 'mapper',
      [CENSUS]: 'reaStaticCensus', [MANIFEST]: 'extractedManifest',
    }[path];
    if (bindingName) {
      const bound = comparison.sources[bindingName];
      assert(bound?.path === path, `triplet comparison missing source binding for ${path}`);
      checkHash(file.sha256, bound.sha256, `current source ${path}`);
    }
    return { path, bytes: file.bytes.length, sha256: file.sha256 };
  });
  const manifest = json(root, MANIFEST).value;
  for (const name of ['AARON.exe', 'AARON.pll']) {
    const entry = manifest.files.find(row => row.installedName === name);
    assert(entry && runs.every(row => row.run.runtime[name].sha256 === entry.sha256 && row.run.runtime[name].bytes === entry.bytes),
      `triplet runtime does not match extracted manifest for ${name}`);
  }

  const observer = runs[1].run;
  const captureRecord = observer.debuggerResult;
  const captureFile = recordAt(root, captureRecord, 'observer destination-breakpoint report');
  const debuggerReport = parseEnvelope(captureFile.text,
    'BEGIN premium-callsite-destination-breakpoint-v1', 'END premium-callsite-destination-breakpoint-v1',
    'observer destination-breakpoint report');
  assert(debuggerReport.schemaVersion === 1 && debuggerReport.tripletId === comparison.tripletId &&
    debuggerReport.runId === observer.runId && debuggerReport.mapping.premiumUniqueCompletePllMatch === true &&
    debuggerReport.mapping.pickUniqueCompletePllMatch === true && debuggerReport.mapping.premiumPayloadBytes === 362,
  'debugger report is not bound to the current complete PREMIUM and PICK objects');
  const debug = debuggerReport.debugger;
  const call = debug?.call;
  const target = debug?.destinationBreakpoint;
  const callSite = '0x1fe4c07c';
  const expectedReturn = '0x1fe4c07f';
  assert(debug.schema === 'aaron-premium-callsite-destination-breakpoint-v1' &&
    debug.callSiteAddress === callSite && debug.callSiteValidation?.matched === true &&
    debug.callSiteValidation?.bytesAtHitHex?.toLowerCase() === 'ff5727' &&
    debug.callSiteValidation?.bytesAtHitMatched === true && call.hit === true &&
    call.preCallRegisters?.eip?.toLowerCase() === callSite &&
    call.preCallDispatchSlot?.offset?.toLowerCase() === '0x00000027' &&
    call.preCallDispatchSlot?.bytesHex?.toLowerCase() === '83090020' &&
    call.preCallDispatchSlot?.value?.toLowerCase() === '0x20000983',
  'pre-CALL live instruction, registers, or slot operand did not match');
  assert(target.attempted === true && target.hit === true && target.completed === true &&
    target.status === 'destination-execute-breakpoint-hit-before-instruction' &&
    target.expectedAddress?.toLowerCase() === call.preCallDispatchSlot.value.toLowerCase() &&
    target.targetEip?.toLowerCase() === target.expectedAddress.toLowerCase() &&
    target.targetRegisters?.eip?.toLowerCase() === target.targetEip.toLowerCase() &&
    target.targetRegisters?.threadId === call.threadId && target.firstChance === true &&
    target.dr6B0Set === true && target.addressMatchesPreCallSlot === true &&
    target.espDecrementedByFour === true && target.returnAddressMatchesCallContinuation === true &&
    target.returnAddressAtEsp?.value?.toLowerCase() === expectedReturn,
  'independent DR0 target/stack gate did not pass');
  assert(target.debugRegistersRestored === true && debug.callDebugRegistersRestoredBeforeDestination === true &&
    debug.debugRegistersRestored === true && debug.detached === true && debug.readyPauseReleased === true &&
    (debug.cleanupErrors ?? []).length === 0 && debug.captureError === null,
  'debugger cleanup/release was incomplete');
  const window = target.destinationWindow;
  const windowBytes = Buffer.from(window?.bytesHex ?? '', 'hex');
  assert(window?.eip?.toLowerCase() === target.targetEip.toLowerCase() &&
    window.requestedBytes === 32 && window.bytesRead === 32 && window.readError === null &&
    windowBytes.length === 32 && window.bytesHex.length === 64,
  'destination read is not a complete 32-byte window');
  assert(window.region?.state?.toLowerCase() === '0x00001000' &&
    window.region?.protection?.toLowerCase() === '0x00000004' &&
    window.region?.type?.toLowerCase() === '0x00040000',
  'destination region metadata differs from the observed committed MEM_MAPPED/PAGE_READWRITE region');
  const windowSha = sha(windowBytes);
  const observerPll = recordAt(root, observer.runtime['AARON.pll'], 'observer AARON.pll');
  let exactPllWindowMatches = 0;
  for (let offset = observerPll.bytes.indexOf(windowBytes); offset >= 0; offset = observerPll.bytes.indexOf(windowBytes, offset + 1)) {
    exactPllWindowMatches += 1;
  }
  assert(exactPllWindowMatches === 0, 'destination window unexpectedly matches bytes in the captured AARON.pll');

  const reaFile = json(root, REA_EVIDENCE);
  const rea = reaFile.value;
  assert(rea.reaSummary?.staticOnly === true && rea.reaSummary.generatedPeExecuted === false &&
    rea.reaSummary.queryCount === 8 && rea.reaSummary.functionSeeds === 0 &&
    rea.reaSummary.decodedInstructionBytes === 22 && rea.staticInput.windowBytesSha256 === windowSha,
  'bounded REA report is not bound to this exact runtime destination window');

  const result = {
    schemaVersion: 1,
    status: 'accepted-direct-runtime-destination; anonymous target identity unresolved',
    triplet: {
      id: comparison.tripletId,
      mode: comparison.mode,
      canvas: runs[0].run.aa0Header,
      roles: runs.map(row => ({ role: row.run.role, runId: row.run.runId, complete: row.run.complete, root: row.run.root })),
      controlsMatch: true,
      beforeAfterPlanningTraceMatch: true,
      matchingArtifacts: REQUIRED_ARTIFACTS,
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
      dispatchSlotValue: call.preCallDispatchSlot.value,
    },
    destination: {
      address: target.targetEip,
      sameThreadAsCall: target.targetRegisters.threadId === call.threadId,
      stoppedBeforeFirstDestinationInstruction: true,
      dr0ExecuteBreakpointHit: true,
      dr6B0Set: true,
      espDecrementedByFour: true,
      stackReturnAddress: target.returnAddressAtEsp.value,
      stackReturnMatchesCallContinuation: true,
      equalsCurrentPickEntry: false,
      directCpuEdgeToPick: false,
      region: window.region,
      bytesHex: window.bytesHex.toLowerCase(),
      bytes: windowBytes.length,
      sha256: windowSha,
      exactWindowMatchesInCapturedPll: exactPllWindowMatches,
    },
    rea: {
      evidencePath: REA_EVIDENCE,
      evidenceSha256: reaFile.sha256,
      provider: rea.reaSummary.provider,
      queryCount: rea.reaSummary.queryCount,
      functionSeeds: rea.reaSummary.functionSeeds,
      decodedInstructionBytes: rea.reaSummary.decodedInstructionBytes,
      exactDestinationBytes: true,
      functionBoundaryRecovered: false,
    },
    provenance: {
      comparison: { path: repoPath(root, args.comparison), sha256: comparisonFile.sha256 },
      debuggerReport: { path: captureRecord.path, sha256: captureFile.sha256 },
      currentSources: sourceBindings,
    },
    limitations: [
      'The direct CPU destination is an observed runtime address for this run; it is not mapped to a named Lisp function or complete native function boundary.',
      'The destination differs from PICK entry. This capture does not show whether or how the target later transfers to PICK.',
      'The destination region was reported committed MEM_MAPPED with PAGE_READWRITE; this protection is not itself proof of an executable section or file-backed mapping.',
      'REA statically decoded only eight queried instruction starts, covering 22 bytes of the 32-byte window. It created zero functions and the generated PE was never executed.',
      'The relative branch outside the window is a static candidate only; no branch execution or memory read at that external candidate was captured.',
      'No Lisp behavior contract, ABI, calling convention, or whole-painting parity is established.',
    ],
  };

  const outputPath = resolve(root, args.output);
  assert(outputPath.startsWith(`${root}${sep}`), 'Output path must stay inside the repository');
  assert(args.overwrite || !existsSync(outputPath), `Refusing to overwrite ${args.output}`);
  const outputText = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(outputPath, outputText, { flag: args.overwrite ? 'w' : 'wx' });
  process.stdout.write(`${JSON.stringify({ output: repoPath(root, outputPath), sha256: sha(Buffer.from(outputText)), destination: result.destination.address, destinationWindowSha256: windowSha, controlsMatch: true, reaQueries: result.rea.queryCount }, null, 2)}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
