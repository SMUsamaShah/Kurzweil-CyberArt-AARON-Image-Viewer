#!/usr/bin/env node
// Revalidate one completed V2 PREMIUM destination triplet and write compact,
// dynamic-address evidence. This utility launches no oracle, debugger, or REA.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseV2CaptureEnvelope, validateV2CaptureReport } from './validate-premium-callsite-wide-window-v2.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '../..');
const DEFAULT_OUTPUT = 'research/introspection/evidence/premium-callsite-wide-window-20261014-v2.json';
const COORDINATOR = 'research/tools/capture-premium-callsite-wide-window-triplet-v2.ps1';
const HELPER = 'research/oracle/AaronPremiumCallsitePickCorrelationV2.cs';
const PROBE = 'research/introspection/premium-callsite-metadata-v1.cl';
const RUNNER = 'research/oracle/run-local-scene-state-required-probe.ps1';
const MAPPER = 'research/tools/map-native-code-to-pll.mjs';
const CENSUS = 'research/introspection/evidence/select-subject-call-census-20261014-v1.json';
const MANIFEST = 'research/extracted/aaron/manifest.json';
const VALIDATOR = 'research/tools/validate-premium-callsite-wide-window-v2.mjs';
const COMPARISON_DERIVER = 'research/tools/derive-premium-callsite-wide-window-triplet-comparison-v2.mjs';
const EVIDENCE_DERIVER = 'research/tools/derive-premium-callsite-wide-window-evidence-v2.mjs';
const PE_PREPARER = 'research/tools/prepare-premium-callsite-wide-window-pe-v2.mjs';
const MODE = 'writer-stream-seed-1234';
const REPORT_NAME = 'aaron-premium-callsite-pick-correlation-v2.txt';
const REQUIRED_ARTIFACTS = ['aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt'];
const REQUIRED_STAGED_SOURCES = 6;
const HEX64 = /^[0-9a-f]{64}$/iu;

function fail(message) { throw new Error(message); }
function assert(ok, message) { if (!ok) fail(message); }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function isWithin(root, full) {
  const rel = relative(root, full);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}
function repoPath(root, full, label) {
  assert(isWithin(root, full), label + ': path escaped repository');
  return relative(root, full).split(sep).join('/');
}
function read(root, path, allowedRoot) {
  const full = resolve(root, path);
  assert(isWithin(root, full) && existsSync(full), 'missing or out-of-repository file: ' + path);
  if (allowedRoot) assert(isWithin(allowedRoot, full), 'file escaped its run root: ' + path);
  const bytes = readFileSync(full);
  return { full, path: repoPath(root, full, path), bytes: bytes.length, sha256: hash(bytes), text: bytes.toString('utf8') };
}
function json(root, path, allowedRoot) {
  const file = read(root, path, allowedRoot);
  try { return { ...file, value: JSON.parse(file.text.replace(/^\uFEFF/u, '')) }; }
  catch (error) { fail(path + ': invalid JSON (' + error.message + ')'); }
}
function checkHash(actual, expected, label) {
  assert(typeof expected === 'string' && HEX64.test(expected), label + ': malformed SHA-256');
  assert(actual === expected.toLowerCase(), label + ': SHA-256 mismatch');
}
function recordAt(root, record, label, allowedRoot) {
  assert(record && typeof record.path === 'string', label + ': path missing');
  const file = read(root, record.path, allowedRoot);
  assert(Number.isInteger(record.bytes) && file.bytes === record.bytes, label + ': byte count mismatch');
  checkHash(file.sha256, record.sha256, label);
  return file;
}
function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, output: DEFAULT_OUTPUT, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--repo-root') args.root = resolve(argv[++i] ?? '');
    else if (argv[i] === '--comparison') args.comparison = argv[++i] ?? '';
    else if (argv[i] === '--out') args.output = argv[++i] ?? '';
    else if (argv[i] === '--overwrite') args.overwrite = true;
    else if (argv[i] === '--help') {
      process.stdout.write('Usage: node research/tools/derive-premium-callsite-wide-window-evidence-v2.mjs --comparison PATH [--out PATH] [--overwrite]\n');
      process.exit(0);
    } else fail('Unknown argument: ' + argv[i]);
  }
  assert(args.comparison && args.output, '--comparison and --out must be nonempty paths');
  return args;
}
function validateRun(root, comparison, run, role) {
  assert(run.role === role && run.complete === true && run.mode === MODE
    && run.smallImage === false && run.aa0Header === '768 1080 148',
  role + ': invalid role/completion/mode/canvas in comparison');
  const runRoot = resolve(root, run.root);
  assert(isWithin(root, runRoot), role + ': run root escaped repository');
  const summaryFile = json(root, run.root + '/summary.json', runRoot);
  checkHash(summaryFile.sha256, run.summarySha256, role + ' summary');
  const summary = summaryFile.value;
  assert(summary.runId === run.runId && summary.complete === true && summary.mode === MODE
    && summary.runnerSha256 === run.runnerSha256 && summary.runnerSha256 === comparison.sources.runner.sha256
    && summary.installerSha256 === run.installerSha256,
  role + ': source/runtime summary identity differs from comparison');
  if (role === 'observer') {
    assert(summary.preSceneProbeSha256 === comparison.sources.probe.sha256
      && summary.preSceneProbePauseSeconds === 150
      && summary.requiredProbeOutputName === REPORT_NAME
      && summary.requiredProbeEndMarker === 'END premium-callsite-pick-correlation-v2'
      && summary.probeCompletionSatisfied === true
      && Array.isArray(summary.probeOutputNames)
      && summary.probeOutputNames[0] === 'aaron-premium-callsite-metadata-v1.txt'
      && summary.probeOutputNames[1] === REPORT_NAME,
    'observer summary is not bound to the expected READY/report/END probe setup');
  } else {
    assert(!summary.preSceneProbeSha256 && !summary.requiredProbeOutputName
      && !summary.requiredProbeOutputSha256 && !summary.requiredProbeEndMarker
      && (summary.probeOutputNames ?? []).length === 0
      && (summary.preSceneProbePauseSeconds ?? 0) === 0,
    role + ': purported uninstrumented control contains a probe');
  }

  const artifacts = {};
  for (const name of REQUIRED_ARTIFACTS) {
    const file = recordAt(root, run.artifacts?.[name], role + ' artifact ' + name, runRoot);
    artifacts[name] = { bytes: file.bytes, sha256: file.sha256 };
  }
  const sources = {};
  for (const [name, sourceRecord] of Object.entries(run.sources ?? {})) {
    const file = recordAt(root, sourceRecord, role + ' staged source ' + name, runRoot);
    sources[name] = { bytes: file.bytes, sha256: file.sha256 };
  }
  assert(Object.keys(sources).length === REQUIRED_STAGED_SOURCES, role + ': expected exactly six staged sources');
  const planningTrace = recordAt(root, run.planningTrace, role + ' planning trace', runRoot);
  const runtime = {};
  for (const name of ['AARON.exe', 'AARON.pll']) {
    runtime[name] = recordAt(root, run.runtime?.[name], role + ' runtime ' + name, runRoot);
  }

  let metadata = null;
  let debuggerResult = null;
  if (role === 'observer') {
    metadata = recordAt(root, run.metadata, 'observer READY metadata', runRoot);
    debuggerResult = recordAt(root, run.debuggerResult, 'observer V2 debugger report', runRoot);
    checkHash(debuggerResult.sha256, summary.requiredProbeOutputSha256, 'observer completed-report summary binding');
    const normalized = metadata.text.replace(/\r\n/gu, '\n');
    assert(!normalized.includes('\r') && normalized.endsWith('END premium-callsite-metadata-v1\n'),
      'observer metadata report has a CR or missing terminal END');
    const lines = normalized.trimEnd().split('\n');
    const readyIndex = lines.indexOf('READY premium-callsite-metadata-v1');
    const releasedIndex = lines.indexOf('CAPTURE-WAIT released=T');
    const completeMarkers = lines.filter(line => line === 'COMPLETE execution=finished');
    const completeIndex = lines.indexOf('COMPLETE execution=finished');
    assert(readyIndex >= 0 && releasedIndex > readyIndex && completeMarkers.length === 1
      && completeIndex > releasedIndex && lines.at(-1) === 'END premium-callsite-metadata-v1',
    'observer metadata does not contain the complete READY/release/COMPLETE/END handshake');
    const readyMetadataPath = resolve(runRoot, 'native-code/ready-metadata.bin');
    assert(existsSync(readyMetadataPath), 'observer READY metadata byte snapshot is missing');
    const readyMetadataBytes = readFileSync(readyMetadataPath);
    const completeMetadataBytes = readFileSync(metadata.full);
    const debuggerReport = parseV2CaptureEnvelope(debuggerResult.text);
    assert(debuggerReport.metadata?.readyReportSha256 === hash(readyMetadataBytes)
      && readyMetadataBytes.length <= completeMetadataBytes.length
      && completeMetadataBytes.subarray(0, readyMetadataBytes.length).equals(readyMetadataBytes),
    'observer READY hash does not match the exact archived prefix of the complete metadata report');
    run.readyMetadata = {
      path: repoPath(root, readyMetadataPath, 'observer READY metadata snapshot'),
      bytes: readyMetadataBytes.length,
      sha256: hash(readyMetadataBytes),
    };
  }

  return { run, summary, runRoot, artifacts, sources, planningTrace, runtime, metadata, debuggerResult };
}
function assertTripletSame(rows, key, label) {
  const first = rows[0][key];
  assert(rows.every(row => row[key].bytes === first.bytes && row[key].sha256 === first.sha256),
    'fresh triplet mismatch: ' + label);
}
function assertRecordsSame(records, label) {
  const first = records[0];
  assert(records.every(row => row.bytes === first.bytes && row.sha256 === first.sha256),
    'fresh triplet mismatch: ' + label);
}
function currentSourceBindings(root, comparison) {
  const required = {
    coordinator: COORDINATOR, probe: PROBE, runner: RUNNER, debuggerHelper: HELPER,
    mapper: MAPPER, reaStaticCensus: CENSUS, extractedManifest: MANIFEST,
    wideWindowValidator: VALIDATOR,
    comparisonDeriver: COMPARISON_DERIVER,
    evidenceDeriver: EVIDENCE_DERIVER,
    pePreparer: PE_PREPARER,
  };
  const rows = [];
  for (const [name, path] of Object.entries(required)) {
    const binding = comparison.sources?.[name];
    assert(binding?.path === path, 'comparison lacks expected source path binding: ' + name);
    const file = read(root, path);
    checkHash(file.sha256, binding.sha256, 'current source ' + name);
    rows.push({ name, path, bytes: file.bytes, sha256: file.sha256 });
  }
  return rows;
}
export function validateV2TripletComparison(root, comparison) {
  root = resolve(root);
  assert(comparison.schemaVersion === 1 && comparison.mode === MODE
    && comparison.controlsMatch === true && comparison.beforeAfterPlanningTraceMatch === true
    && Array.isArray(comparison.runs) && comparison.runs.length === 3,
  'comparison is not an accepted source-bound V2 before/observer/after triplet');
  const runs = [
    validateRun(root, comparison, comparison.runs[0], 'before'),
    validateRun(root, comparison, comparison.runs[1], 'observer'),
    validateRun(root, comparison, comparison.runs[2], 'after'),
  ];
  for (const name of REQUIRED_ARTIFACTS) assertRecordsSame(runs.map(row => row.artifacts[name]), name);
  const sourceNames = Object.keys(runs[0].sources).sort();
  assert(runs.every(row => JSON.stringify(Object.keys(row.sources).sort()) === JSON.stringify(sourceNames)),
    'triplet staged-source inventories differ');
  for (const name of sourceNames) {
    assert(runs.every(row => row.sources[name].bytes === runs[0].sources[name].bytes
      && row.sources[name].sha256 === runs[0].sources[name].sha256), 'staged source differs: ' + name);
  }
  assert(runs[0].planningTrace.bytes === runs[2].planningTrace.bytes
    && runs[0].planningTrace.sha256 === runs[2].planningTrace.sha256,
  'fresh uninstrumented before/after planning traces differ');
  for (const name of ['AARON.exe', 'AARON.pll']) assertRecordsSame(runs.map(row => row.runtime[name]), name);

  const observer = runs[1];
  const reportFile = observer.debuggerResult;
  assert(comparison.debuggerResult?.path === reportFile.path
    && comparison.debuggerResult?.sha256 === reportFile.sha256,
  'top-level debugger report record differs from observer capture');
  const report = parseV2CaptureEnvelope(reportFile.text);
  const parsed = validateV2CaptureReport(report, {
    tripletId: comparison.tripletId,
    runId: observer.run.runId,
    sources: comparison.sources,
  });
  const sourceBindings = currentSourceBindings(root, comparison);
  return { runs, observer, reportFile, parsed, sourceBindings };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root;
  const comparisonFile = read(root, args.comparison);
  const comparison = JSON.parse(comparisonFile.text.replace(/^\uFEFF/u, ''));
  const validated = validateV2TripletComparison(root, comparison);
  const { runs, observer, reportFile, parsed, sourceBindings } = validated;
  const endpoint = parsed.endpoint;
  const outputPath = resolve(root, args.output);
  assert(isWithin(root, outputPath), 'output path must stay inside the repository');
  assert(args.overwrite || !existsSync(outputPath), 'refusing to overwrite existing evidence: ' + args.output);

  const result = {
    schemaVersion: 2,
    status: 'source-bound-wide-destination-captured',
    triplet: {
      id: comparison.tripletId,
      mode: comparison.mode,
      canvas: comparison.aa0Header,
      roles: runs.map(row => ({ role: row.run.role, runId: row.run.runId, complete: row.run.complete, root: row.run.root })),
      controlsMatch: comparison.controlsMatch,
      beforeAfterPlanningTraceMatch: comparison.beforeAfterPlanningTraceMatch,
      matchingDrawingSceneArtifacts: REQUIRED_ARTIFACTS,
      matchingStagedSourceCount: REQUIRED_STAGED_SOURCES,
      plannerTrace: {
        before: { bytes: runs[0].planningTrace.bytes, sha256: runs[0].planningTrace.sha256 },
        observer: { bytes: runs[1].planningTrace.bytes, sha256: runs[1].planningTrace.sha256 },
        after: { bytes: runs[2].planningTrace.bytes, sha256: runs[2].planningTrace.sha256 },
      },
    },
    mapping: {
      premiumEntry: parsed.mapping.premiumEntry,
      premiumPayloadBytes: parsed.mapping.premiumPayloadBytes,
      premiumPayloadSha256: parsed.mapping.premiumPayloadSha256,
      pickEntry: parsed.mapping.pickEntry,
      pickPayloadBytes: parsed.mapping.pickPayloadBytes,
      pickPayloadSha256: parsed.mapping.pickPayloadSha256,
      callPayloadOffset: parsed.mapping.callPayloadOffset,
      callSiteAddress: parsed.mapping.callSiteAddress,
      callSiteBytesHex: parsed.mapping.callSiteBytesHex,
    },
    call: {
      instruction: 'CALL dword ptr [EDI + 0x27]',
      threadId: parsed.call.threadId,
      preCallRegisters: parsed.call.preCallRegisters,
      dispatchSlot: parsed.call.preCallDispatchSlot,
      directDestinationAddress: parsed.destination.targetEip,
      directDestinationEqualsCurrentPickEntry: parsed.directIsPick,
      returnAddressAtDestination: parsed.destination.returnAddressAtEsp.value,
      stoppedBeforeDestinationInstruction: true,
    },
    pickCorrelation: {
      firstEndpoint: endpoint.endpoint,
      pickObservation: endpoint.pick,
      continuationObservation: endpoint.continuation,
      directCpuEdgeToPick: parsed.report.claims.directCpuEdgeToPick,
    },
    destinationWindow: {
      address: parsed.window.eip,
      windowStartAddress: parsed.window.windowStartAddress,
      windowEndExclusive: parsed.window.windowEndExclusive,
      eipOffset: parsed.window.eipOffset,
      requestedBytes: parsed.window.requestedBytes,
      bytesRead: parsed.window.bytesRead,
      bytesHex: parsed.window.bytesHex.toLowerCase(),
      bytesSha256: hash(parsed.windowBytes),
      maximumBytes: parsed.window.maximumBytes,
      centeringPolicy: 'half-open [EIP-128,EIP+128), clipped to this VirtualQueryEx region and the WOW64 32-bit address space',
      includesPriorBranchCandidate: parsed.includesPriorBranchCandidate,
      bytesAfterEip: parsed.bytesAfterEip,
      region: parsed.region,
    },
    provenance: {
      comparison: { path: comparisonFile.path, bytes: comparisonFile.bytes, sha256: comparisonFile.sha256 },
      debuggerReport: { path: reportFile.path, bytes: reportFile.bytes, sha256: reportFile.sha256 },
      readyMetadata: observer.readyMetadata,
      currentSources: sourceBindings,
    },
    limitations: [
      'This result describes one completed 768x1080 seed-1234 invocation and its matching no-probe controls; it is not a general call graph or behavior contract.',
      'The direct CPU target and PICK/continuation endpoint are captured separately. A same-thread/frame observation does not reveal unobserved instructions between those addresses.',
      'The captured bytes are only the exact centered/clipped memory interval recorded at the destination breakpoint. No address outside that interval is reconstructed.',
      'If the window excludes the prior EIP-0x69 candidate, that static candidate is not covered by this capture.',
      'No native ABI, Lisp argument meaning, anonymous function name, function boundary, JavaScript contract, or whole-painting parity is established.',
    ],
  };
  const text = JSON.stringify(result, null, 2) + '\n';
  writeFileSync(outputPath, text, { flag: args.overwrite ? 'w' : 'wx' });
  process.stdout.write(JSON.stringify({
    output: repoPath(root, outputPath, 'evidence output'),
    sha256: hash(Buffer.from(text)),
    tripletId: comparison.tripletId,
    directDestination: parsed.destination.targetEip,
    pickEntry: parsed.mapping.pickEntry,
    windowBytes: parsed.window.bytesRead,
    includesPriorBranchCandidate: parsed.includesPriorBranchCandidate,
    controlsMatch: true,
  }, null, 2) + '\n');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(); }
  catch (error) { process.stderr.write((error.stack ?? error.message) + '\n'); process.exitCode = 1; }
}
