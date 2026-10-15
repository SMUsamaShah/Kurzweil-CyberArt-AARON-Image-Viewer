#!/usr/bin/env node

// Revalidate one accepted PREMIUM internal-transfer capture and emit a compact
// evidence record. This is offline: it launches no AARON process or debugger.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '../..');
const TRIPLET_ID = 'prem-it-v3-crlf-20261015-062149-42409a0d';
const DEFAULT_COMPARISON = `research/extracted/local-oracle/premium-internal-transfer-triplet-v3-logs/${TRIPLET_ID}/triplet-comparison.json`;
const DEFAULT_OUTPUT = 'research/introspection/evidence/premium-internal-transfer-triplet-v3-20261015.json';
const FAILED_RERUN_ID = 'prem-it-v3-final-20261015-062543-6f3ff028';
const CAPTURE_NAME = 'aaron-premium-internal-transfer-breakpoint-v2.txt';
const BEGIN = 'BEGIN premium-internal-transfer-breakpoint-v2';
const END = 'END premium-internal-transfer-breakpoint-v2';
const REQUIRED_ARTIFACTS = ['aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt'];
const HEX64 = /^[0-9a-f]{64}$/u;

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function within(parent, child) {
  const rel = relative(parent, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function read(root, path) {
  const full = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const bytes = readFileSync(full);
  return { full, bytes, text: bytes.toString('utf8'), sha256: sha(bytes) };
}
function json(root, path) {
  const file = read(root, path);
  try { return { ...file, value: JSON.parse(file.text.replace(/^\uFEFF/u, '')) }; }
  catch (error) { fail(`${path}: invalid JSON (${error.message})`); }
}
function checkHash(actual, expected, label) {
  assert(typeof expected === 'string' && HEX64.test(expected.toLowerCase()), `${label}: malformed SHA-256`);
  assert(actual === expected.toLowerCase(), `${label}: SHA-256 mismatch`);
}
function fileRecord(root, record, label, boundRoot = null) {
  assert(record && typeof record.path === 'string', `${label}: missing file record`);
  const file = read(root, record.path);
  assert(Number.isInteger(record.bytes) && record.bytes === file.bytes.length, `${label}: byte count mismatch`);
  checkHash(file.sha256, record.sha256, label);
  if (boundRoot) assert(within(boundRoot, file.full), `${label}: path escaped its run root`);
  return file;
}
function parseEnvelope(text) {
  const normalized = text.replace(/\r\n/gu, '\n');
  assert(!normalized.includes('\r'), 'capture has a lone CR');
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  assert(lines[0] === BEGIN && lines.at(-1) === END, 'capture envelope is incomplete');
  assert(lines.filter(line => line === END).length === 1, 'capture has a duplicate END marker');
  try { return JSON.parse(lines.slice(1, -1).join('\n')); }
  catch (error) { fail(`capture JSON is invalid (${error.message})`); }
}
function asBigInt(value, label) {
  try { return BigInt(value); } catch { return fail(`${label}: invalid integer address`); }
}
function parseArgs(argv) {
  const result = { root: DEFAULT_ROOT, comparison: DEFAULT_COMPARISON, output: DEFAULT_OUTPUT, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--repo-root') result.root = resolve(argv[++i] ?? '');
    else if (argv[i] === '--comparison') result.comparison = argv[++i] ?? '';
    else if (argv[i] === '--out') result.output = argv[++i] ?? '';
    else if (argv[i] === '--overwrite') result.overwrite = true;
    else if (argv[i] === '--help') {
      process.stdout.write('Usage: node research/tools/derive-premium-internal-transfer-edge-evidence-v1.mjs [--comparison PATH] [--out PATH] [--overwrite]\n');
      process.exit(0);
    } else fail(`Unknown argument: ${argv[i]}`);
  }
  return result;
}

function validateRun(root, run, role) {
  assert(run.role === role && run.complete === true && run.smallImage === false &&
    run.mode === 'writer-stream-seed-1234' && run.aa0Header === '768 1080 148', `${role}: run identity/completion gate failed`);
  const runRoot = resolve(root, run.root);
  assert(within(root, runRoot), `${role}: run root escaped the repository`);
  const summary = json(root, `${relative(root, runRoot).split(sep).join('/')}/summary.json`);
  checkHash(summary.sha256, run.summarySha256, `${role} summary`);
  assert(summary.value.complete === true && summary.value.runId === run.runId &&
    summary.value.mode === run.mode && summary.value.runnerSha256 === run.runnerSha256,
  `${role}: on-disk summary does not match comparison`);
  const artifacts = {};
  for (const name of REQUIRED_ARTIFACTS) artifacts[name] = fileRecord(root, run.artifacts?.[name], `${role} artifact ${name}`, runRoot);
  const sources = {};
  for (const [name, record] of Object.entries(run.sources ?? {})) sources[name] = fileRecord(root, record, `${role} source ${name}`, runRoot);
  assert(Object.keys(sources).length === 6, `${role}: expected six staged scene sources`);
  const trace = fileRecord(root, run.planningTrace, `${role} planning trace`, runRoot);
  const runtime = {};
  for (const [name, record] of Object.entries(run.runtime ?? {})) runtime[name] = fileRecord(root, record, `${role} runtime ${name}`, runRoot);
  assert(Object.keys(runtime).length === 2 && runtime['AARON.exe'] && runtime['AARON.pll'], `${role}: expected runtime EXE and PLL`);
  assert(artifacts.aa0.text.split(/\r?\n/u, 1)[0] === '768 1080 148', `${role}: AA0 header mismatch`);
  return { run, runRoot, summary: summary.value, artifacts, sources, trace, runtime };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root;
  const comparisonFile = json(root, args.comparison);
  const comparison = comparisonFile.value;
  assert(comparison.schemaVersion === 2 && comparison.tripletId === TRIPLET_ID &&
    comparison.mode === 'writer-stream-seed-1234', 'unexpected triplet ID, schema, or mode');
  assert(comparison.controlsMatch === true && comparison.beforeAfterPlanningTraceMatch === true &&
    Array.isArray(comparison.runs) && comparison.runs.length === 3, 'triplet controls or run count failed');
  const runs = [
    validateRun(root, comparison.runs[0], 'before'),
    validateRun(root, comparison.runs[1], 'observer'),
    validateRun(root, comparison.runs[2], 'after'),
  ];
  for (const name of REQUIRED_ARTIFACTS) {
    const files = runs.map(row => row.artifacts[name]);
    assert(files.every(file => file.bytes.length === files[0].bytes.length && file.sha256 === files[0].sha256),
      `before/observer/after artifact mismatch: ${name}`);
  }
  for (const name of Object.keys(runs[0].sources)) {
    const files = runs.map(row => row.sources[name]);
    assert(files.length === 3 && files.every(file => file.bytes.length === files[0].bytes.length && file.sha256 === files[0].sha256),
      `staged source mismatch: ${name}`);
  }
  assert(runs.every(row => row.trace.bytes.length === runs[0].trace.bytes.length && row.trace.sha256 === runs[0].trace.sha256),
    'planning traces differ across the triplet');
  for (const name of Object.keys(runs[0].runtime)) {
    const files = runs.map(row => row.runtime[name]);
    assert(files.every(file => file.bytes.length === files[0].bytes.length && file.sha256 === files[0].sha256),
      `runtime identity mismatch: ${name}`);
  }

  assert(comparison.debuggerResult && typeof comparison.debuggerResult.path === 'string', 'observer capture path missing');
  const captureFile = read(root, comparison.debuggerResult.path);
  assert(within(root, captureFile.full), 'observer capture escaped the repository');
  checkHash(captureFile.sha256, comparison.debuggerResult.sha256, 'observer capture');
  const report = parseEnvelope(captureFile.text);
  assert(report.schemaVersion === 2 && report.tripletId === TRIPLET_ID &&
    report.runId === runs[1].run.runId && report.oracleRunId === runs[1].run.runId,
  'debugger report is not bound to the accepted observer run');
  const mapping = report.mapping;
  const debugRecord = report.debugger;
  const binding = comparison.debuggerResult.observerBinding;
  assert(binding?.status === 'source-bound-archive-revalidated' &&
    binding.requestSha256 === debugRecord.ownedRequestSha256 &&
    binding.tailJumpDestinationAddress === mapping.tailJumpDestinationAddress &&
    binding.tailJumpDestinationEqualsCurrentPick === true,
  'archived observer binding or recomputed tail edge failed');
  assert(report.debuggerHelperSha256 === report.helperSourceSha256AtLoad &&
    report.debuggerHelperSha256 === comparison.sources.debuggerHelper.sha256,
  'loaded debugger helper hash does not match the source-bound comparison');
  assert(report.coordinatorScriptSha256 === comparison.sources.coordinator.sha256 &&
    comparison.sources.runner.sha256 === runs[0].run.runnerSha256 &&
    comparison.sources.mapper.sha256 === mapping.mapperSha256,
  'coordinator, runner, or mapper source binding mismatch');

  const observerRoot = runs[1].runRoot;
  const pll = read(root, `${relative(root, observerRoot).split(sep).join('/')}/runtime/AARON.pll`);
  checkHash(pll.sha256, report.currentPllSha256, 'observer PLL');
  const nativeRoot = `${relative(root, observerRoot).split(sep).join('/')}/${mapping.nativeCaptureManifest.replaceAll('\\', '/')}`;
  const manifest = json(root, nativeRoot);
  checkHash(manifest.sha256, mapping.nativeCaptureManifestSha256, 'live native capture manifest');
  const mapFile = json(root, `${relative(root, observerRoot).split(sep).join('/')}/${mapping.nativeMap.replaceAll('\\', '/')}`);
  checkHash(mapFile.sha256, mapping.nativeMapSha256, 'live PLL map');
  const revalidatedMapPath = `${relative(root, observerRoot).split(sep).join('/')}/native-code/archived-map-revalidation/native-code-map.json`;
  const revalidatedMap = json(root, revalidatedMapPath);
  checkHash(revalidatedMap.sha256, binding.recomputedNativeMapSha256, 'recomputed archived PLL map');
  assert(revalidatedMap.sha256 === mapFile.sha256 && mapFile.value.pll.sha256 === pll.sha256,
    'live and independently recomputed map/PLL hashes differ');
  const premiumName = `SELECT-SUBJECT-METHOD-${report.metadata.premiumMethodIndex}`;
  const premiumRows = mapFile.value.functions.filter(row => row.name === premiumName);
  const pickRows = mapFile.value.functions.filter(row => row.name === 'PICK');
  assert(premiumRows.length === 1 && pickRows.length === 1, 'native map lacks unique PREMIUM/PICK entries');
  const premium = premiumRows[0];
  const pick = pickRows[0];
  assert(premium.uniqueCompleteObjectByteMatch === true && pick.uniqueCompleteObjectByteMatch === true &&
    premium.payloadSha256 === mapping.premiumPayloadSha256 && pick.payloadSha256 === mapping.pickPayloadSha256 &&
    premium.runtime.entry === mapping.premiumEntry && pick.runtime.entry === mapping.currentPickEntry,
  'mapped PREMIUM/PICK objects do not match the live report');
  const mappedDir = `${relative(root, observerRoot).split(sep).join('/')}/native-code/mapped`;
  const premiumBytes = read(root, `${mappedDir}/${premium.payloadFile}`).bytes;
  const pickBytes = read(root, `${mappedDir}/${pick.payloadFile}`).bytes;
  checkHash(sha(premiumBytes), mapping.premiumPayloadSha256, 'PREMIUM payload');
  checkHash(sha(pickBytes), mapping.pickPayloadSha256, 'PICK payload');
  const callOffset = Number(mapping.callPayloadOffset);
  const callAddress = asBigInt(mapping.premiumEntry, 'PREMIUM entry') + BigInt(callOffset);
  assert(Number.isInteger(callOffset) && callAddress === asBigInt(mapping.callSiteAddress, 'call site') &&
    premiumBytes.subarray(callOffset, callOffset + 3).toString('hex') === 'ff5727' && mapping.callSiteBytesHex === 'ff5727',
  'outer PREMIUM CALL bytes/address do not match the unique live PLL payload');

  const windowBytes = Buffer.from(debugRecord.targetWindow.bytesHex, 'hex');
  checkHash(sha(windowBytes), debugRecord.targetWindow.bytesSha256, 'captured 256-byte target window');
  assert(windowBytes.length === 256 && debugRecord.targetWindow.windowStartAddress === mapping.targetWindowStart &&
    debugRecord.targetWindow.eip === mapping.targetWindowEip && debugRecord.targetWindow.validationPassed === true &&
    debugRecord.targetWindow.instructionProfileMatches === true && mapping.instructionProfileMatches === true &&
    debugRecord.targetWindow.historicalReferenceWindowBytesMatch === false,
  'live target window/profile status is inconsistent');
  const profile = debugRecord.targetWindow.profileRecords;
  assert(Array.isArray(profile) && profile.length === 11 && profile.every(row => row.matched === true),
    'the 11 pinned instruction spans did not all match');
  const tailSite = debugRecord.sites.find(row => row.name === 'JMP-ESI+12');
  const innerCallSite = debugRecord.sites.find(row => row.name === 'CALL-EDI+35F');
  const edge = debugRecord.edges.find(row => row.site === 'JMP-ESI+12');
  const expectedPickEntry = mapping.currentPickEntry.toLowerCase();
  const events = debugRecord.events;
  assert(tailSite?.hitCount === 1 && tailSite.destinationHitCount === 1 && innerCallSite?.hitCount === 0 &&
    edge?.sourceEventOrder === 3 && edge.destinationEventOrder === 4 && edge.sameThread === true &&
    edge.targetAddress.toLowerCase() === expectedPickEntry && mapping.tailJumpDestinationAddress.toLowerCase() === expectedPickEntry &&
    mapping.tailJumpDestinationEqualsCurrentPick === true,
  'required tail-JMP source/destination edge does not equal the mapped PICK entry');
  assert(events[0]?.kind === 'source-hit' && events[0]?.site === 'PREMIUM-CALL-EDI+27' &&
    events[1]?.kind === 'destination-hit' && events[1]?.site === 'PREMIUM-outer-destination' &&
    events[2]?.eip.toLowerCase() === edge.sourceAddress.toLowerCase() &&
    events[3]?.eip.toLowerCase() === edge.targetAddress.toLowerCase() &&
    events.slice(0, 4).every(event => event.threadId === edge.threadId),
  'expected four-event same-thread call/outer-destination/tail-edge order did not match');
  assert(edge.espUnchanged === true && edge.sourceEsp === edge.targetEsp &&
    edge.sourceStackAtEsp.bytesHex === '7fc0e41f' && edge.targetStackAtEsp.bytesHex === '7fc0e41f' &&
    edge.sourceStackAtEsp.value === '0x1fe4c07f' && edge.targetStackAtEsp.value === '0x1fe4c07f',
  'tail edge did not preserve the outer call continuation stack dword');
  assert(debugRecord.outerReturnGuard.address === '0x1fe4c07f' && debugRecord.outerReturnGuard.armed === true &&
    debugRecord.outerReturnGuard.hit === false && debugRecord.detached === true && debugRecord.cleanupErrors.length === 0 &&
    debugRecord.debugRegistersRestored === true && debugRecord.trapFlagUntouched === true && debugRecord.captureCompleted === true,
  'accepted capture cleanup or outer-continuation guard gate failed');
  assert(report.claims.directLispCallerProven === false && report.claims.continuousInstructionPathProven === false &&
    report.claims.observedInnerCallDestinationEdge === false,
  'report overclaims caller/path or records an inner CALL edge');

  const failedDiagPath = `research/extracted/local-oracle/external-runs/${FAILED_RERUN_ID}-observer/native-code/debugger-capture-diagnostic.json`;
  const failedDiagFile = json(root, failedDiagPath);
  const failedRaw = failedDiagFile.value.rawDebuggerResult;
  assert(failedDiagFile.value.acceptanceFailure === 'No-TF capture did not complete with READY release, exact debug-state restoration, detach, and clean cleanup' &&
    failedRaw.detached === false && failedRaw.cleanupErrors?.includes('DebugActiveProcessStop failed: 5') &&
    !existsSync(resolve(root, `research/extracted/local-oracle/external-runs/${FAILED_RERUN_ID}-after`)),
  'the latest rerun is not the documented rejected detach attempt');
  const failedComparisonPath = `research/extracted/local-oracle/premium-internal-transfer-triplet-v3-logs/${FAILED_RERUN_ID}/triplet-comparison.json`;
  assert(!existsSync(resolve(root, failedComparisonPath)), 'failed rerun unexpectedly has an accepted triplet comparison');

  const currentCoordinator = read(root, 'research/tools/capture-premium-internal-transfer-triplet-v3.ps1');
  const oldText = report.claims.interpretation;
  const result = {
    schemaVersion: 1,
    status: 'accepted-complete-triplet; interpretation-addendum-corrects-stale-summary-sentence',
    triplet: {
      id: comparison.tripletId,
      mode: comparison.mode,
      canvas: comparison.aa0Header,
      roles: runs.map(row => ({ role: row.run.role, runId: row.run.runId, complete: row.run.complete, root: row.run.root })),
      controlsMatch: comparison.controlsMatch,
      beforeAfterPlanningTraceMatch: comparison.beforeAfterPlanningTraceMatch,
      matchingArtifacts: Object.fromEntries(REQUIRED_ARTIFACTS.map(name => [name, { bytes: runs[0].artifacts[name].bytes.length, sha256: runs[0].artifacts[name].sha256 }])),
      matchingStagedSourceCount: Object.keys(runs[0].sources).length,
      planningTrace: { bytes: runs[0].trace.bytes.length, sha256: runs[0].trace.sha256 },
      runnerSha256: runs[0].run.runnerSha256,
      installerSha256: runs[0].run.installerSha256,
    },
    observedCallAndEdge: {
      outerCall: { payloadEntry: mapping.premiumEntry, payloadOffset: callOffset, address: mapping.callSiteAddress, bytes: 'ff5727', destination: mapping.measuredOuterDestination },
      innerTailJump: { instruction: 'JMP [ESI+0x12]', source: edge.sourceAddress, destination: edge.targetAddress, destinationEqualsFreshlyMappedPickEntry: true, pickEntry: mapping.currentPickEntry },
      eventOrder: events.slice(0, 4).map(event => ({ eventOrder: event.eventOrder, kind: event.kind, site: event.site, eip: event.eip, threadId: event.threadId })),
      stack: { sameThread: edge.sameThread, espUnchanged: edge.espUnchanged, sourceEsp: edge.sourceEsp, destinationEsp: edge.targetEsp, sourceStackDword: edge.sourceStackAtEsp.value, destinationStackDword: edge.targetStackAtEsp.value, originalOuterContinuation: debugRecord.outerReturnGuard.address, continuationGuardHit: debugRecord.outerReturnGuard.hit },
      instructionWindow: { start: debugRecord.targetWindow.windowStartAddress, eip: debugRecord.targetWindow.eip, bytes: windowBytes.length, sha256: sha(windowBytes), historicalReferenceSha256: debugRecord.targetWindow.referenceWindowSha256, historicalReferenceBytesMatch: false, matchingSignatureSpans: profile.filter(row => row.matched).length, signatureSpanCount: profile.length },
      mappedObjects: { premiumPayloadSha256: premium.payloadSha256, premiumObjectBytes: premium.objectBytes, premiumUniqueCompletePllMatch: premium.uniqueCompleteObjectByteMatch, pickPayloadSha256: pick.payloadSha256, pickObjectBytes: pick.objectBytes, pickUniqueCompletePllMatch: pick.uniqueCompleteObjectByteMatch, mapSha256: mapFile.sha256, independentlyRecomputedMapSha256: revalidatedMap.sha256, pllSha256: pll.sha256 },
    },
    interpretationCorrection: {
      rawAcceptedReportSentence: oldText,
      rawSentenceContradictsMeasuredBoolean: mapping.tailJumpDestinationEqualsCurrentPick === true,
      correctedStatement: 'The measured tail JMP destination equals the current PICK entry uniquely mapped from the same observer run PLL. The evidence shows this direct CPU edge in one outer-call frame; it does not identify a direct Lisp caller or prove continuous execution between all observed sites.',
      currentCoordinatorSha256: currentCoordinator.sha256,
      coordinatorSha256RecordedAtCapture: report.coordinatorScriptSha256,
      historicalCoordinatorSourceIndependentlyRehashed: false,
      note: 'The archived run and its comparison record the coordinator source hash used and accepted at run time. The exact historical coordinator bytes were not retained, so the old hash cannot be independently reconstructed from the current source.'
    },
    excludedRerun: {
      tripletId: FAILED_RERUN_ID,
      diagnosticPath: failedDiagPath,
      rejected: true,
      detached: failedRaw.detached,
      cleanupErrors: failedRaw.cleanupErrors,
      afterControlProduced: false,
      acceptedComparisonProduced: false,
      useForBehaviorClaims: false,
    },
    limitations: [
      'This is one complete 768x1080 seed-1234 triplet; it does not establish repeatability across seeds or canvas regimes.',
      'The destination of the outer PREMIUM CALL remains an anonymous dynamic block at 0x20000983; this capture does not recover its function boundary or Lisp caller identity.',
      'The measured JMP [ESI+0x12] edge reaches the current mapped PICK entry, but the breakpoints do not record every instruction between the outer destination and that jump.',
      'The 256-byte target-window hash differs from the historical reference, although all 11 pinned instruction spans match; do not treat other bytes or alignments as validated.',
      'The separately identified CALL [EDI+0x35f] did not execute in the accepted capture.',
      'No JavaScript behavior contract, caller policy, complete generator reconstruction, or painting parity follows from this native edge.'
    ],
    provenance: {
      comparison: { path: args.comparison.replaceAll('\\', '/'), sha256: comparisonFile.sha256 },
      captureReport: { path: comparison.debuggerResult.path, sha256: captureFile.sha256 },
      map: { path: mapping.nativeMap, sha256: mapFile.sha256, independentlyRecomputedSha256: revalidatedMap.sha256 },
      currentFiles: [
        { path: 'research/tools/capture-premium-internal-transfer-triplet-v3.ps1', sha256: currentCoordinator.sha256 },
        { path: 'research/oracle/AaronPremiumInternalTransferBreakpointV2.cs', sha256: report.debuggerHelperSha256 },
        { path: 'research/oracle/run-local-scene-state-required-probe.ps1', sha256: comparison.sources.runner.sha256 },
        { path: 'research/tools/map-native-code-to-pll.mjs', sha256: comparison.sources.mapper.sha256 }
      ]
    }
  };

  const output = resolve(root, args.output);
  assert(within(root, output), 'output path must stay inside the repository');
  assert(args.overwrite || !existsSync(output), `refusing to overwrite ${args.output}`);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(output, text, { flag: args.overwrite ? 'w' : 'wx' });
  process.stdout.write(`${JSON.stringify({ output: relative(root, output).split(sep).join('/'), sha256: sha(Buffer.from(text)), tripletId: TRIPLET_ID, destination: edge.targetAddress, pickEntry: mapping.currentPickEntry, controlsMatch: true, rejectedRerun: FAILED_RERUN_ID }, null, 2)}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
