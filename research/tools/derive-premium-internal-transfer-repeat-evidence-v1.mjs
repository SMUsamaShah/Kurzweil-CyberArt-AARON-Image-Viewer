#!/usr/bin/env node

// Offline, source-bound validation for the 2026-10-15 repeat no-TF capture.
// This records a repeat of an existing edge, not a new JavaScript contract.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TRIPLET_ID = 'prem-internal-next-20261015-102743-42be241d';
const DEFAULT_COMPARISON = `research/extracted/local-oracle/premium-internal-transfer-triplet-v3-logs/${TRIPLET_ID}/triplet-comparison.json`;
const DEFAULT_OUTPUT = 'research/introspection/evidence/premium-internal-transfer-repeat-20261015.json';
const REQUIRED_ARTIFACTS = ['aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt'];
const HEX64 = /^[0-9a-f]{64}$/u;

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
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
  const args = { comparison: DEFAULT_COMPARISON, output: DEFAULT_OUTPUT, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--comparison') args.comparison = argv[++i] ?? '';
    else if (argv[i] === '--out') args.output = argv[++i] ?? '';
    else if (argv[i] === '--overwrite') args.overwrite = true;
    else if (argv[i] === '--help') {
      process.stdout.write('Usage: node research/tools/derive-premium-internal-transfer-repeat-evidence-v1.mjs [--comparison PATH] [--out PATH] [--overwrite]\n');
      process.exit(0);
    } else fail(`Unknown argument: ${argv[i]}`);
  }
  return args;
}
function parseEnvelope(text) {
  const lines = text.replace(/\r\n/gu, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const begin = 'BEGIN premium-internal-transfer-breakpoint-v2';
  const end = 'END premium-internal-transfer-breakpoint-v2';
  assert(lines[0] === begin && lines.at(-1) === end && lines.filter(line => line === end).length === 1,
    'capture envelope is incomplete or duplicated');
  try { return JSON.parse(lines.slice(1, -1).join('\n')); }
  catch (error) { fail(`capture JSON is invalid (${error.message})`); }
}
function main() {
  const args = parseArgs(process.argv.slice(2));
  const comparisonFile = jsonFile(args.comparison);
  const comparison = comparisonFile.value;
  assert(comparison.schemaVersion === 2 && comparison.tripletId === TRIPLET_ID &&
    comparison.mode === 'writer-stream-seed-1234' && comparison.aa0Header === '768 1080 148',
  'triplet identity, schema, mode, or canvas gate failed');
  assert(comparison.controlsMatch === true && comparison.beforeAfterPlanningTraceMatch === true,
    'fresh uninstrumented controls or planning traces differ');
  assert(Array.isArray(comparison.runs) && comparison.runs.length === 3,
    'expected exactly before, observer, and after runs');

  const requiredRoles = ['before', 'observer', 'after'];
  const roles = new Map();
  const firstArtifacts = new Map();
  const firstSources = new Map();
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

    const artifacts = {};
    for (const name of REQUIRED_ARTIFACTS) {
      const artifact = fileRecord(run.artifacts?.[name], `${role} artifact ${name}`, runRoot);
      artifacts[name] = { bytes: artifact.bytes, sha256: artifact.sha256 };
      const old = firstArtifacts.get(name);
      if (old) assert(old.bytes === artifact.bytes && old.sha256 === artifact.sha256, `${role}: ${name} differs from other triplet leg`);
      else firstArtifacts.set(name, artifacts[name]);
    }
    assert(artifacts.aa0.bytes > 0 && artifacts.aa0.sha256, `${role}: empty AA0`);
    const aa0Path = run.artifacts.aa0.path;
    const aa0 = readFileSync(aa0Path).subarray(0, 64).toString('utf8');
    assert(/^768 1080 148(?:\r?\n)/u.test(aa0), `${role}: AA0 header mismatch`);

    const sources = run.sources ?? {};
    assert(Object.keys(sources).length === 6, `${role}: expected six staged scene sources`);
    for (const [name, record] of Object.entries(sources)) {
      const source = fileRecord(record, `${role} staged source ${name}`, runRoot);
      const key = `${name}:${source.sha256}`;
      firstSources.set(key, true);
    }
    const trace = fileRecord(run.planningTrace, `${role} planning trace`, runRoot);
    if (role === 'before') runRecords.push({ role, runId: run.runId, complete: run.complete, root: run.root, runnerSha256: run.runnerSha256, summarySha256: summaryFile.sha256, planningTrace: { bytes: trace.bytes, sha256: trace.sha256 }, artifacts, stagedSourceCount: Object.keys(sources).length });
    else runRecords.push({ role, runId: run.runId, complete: run.complete, root: run.root, runnerSha256: run.runnerSha256, summarySha256: summaryFile.sha256, planningTrace: { bytes: trace.bytes, sha256: trace.sha256 }, artifacts, stagedSourceCount: Object.keys(sources).length });
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
  assert(report.tripletId === TRIPLET_ID && report.runId === roles.get('observer').runId &&
    report.mode === comparison.mode, 'capture report identity differs from observer run');
  assert(debugRecord?.attached === true && debugRecord.attachSucceeded === true && debugRecord.detached === true &&
    debugRecord.readyPauseReleased === true && debugRecord.debugRegistersRestored === true &&
    debugRecord.captureCompleted === true && debugRecord.callDebugRegistersRestoredBeforeDestination === true &&
    Array.isArray(debugRecord.cleanupErrors) && debugRecord.cleanupErrors.length === 0,
  'debugger lifecycle or cleanup gate failed');
  assert(Array.isArray(debugRecord.debugStateRestorations) && debugRecord.debugStateRestorations.length > 0 &&
    debugRecord.debugStateRestorations.every(row => row.exactMatch === true),
  'not every thread debug-register state was restored exactly');
  assert(debugRecord.events?.length === 4 && debugRecord.events.every(event => event.threadId === debugRecord.selectedThreadId),
    'expected four same-thread breakpoint events');
  const sites = mapping.internalSites;
  const callSite = sites?.find(site => site.name === 'CALL-EDI+35F');
  const jumpSite = sites?.find(site => site.name === 'JMP-ESI+12');
  assert(callSite?.address === '0x2000091a' && callSite.hitCount === 0 && callSite.destinationHitCount === 0,
    'CALL [EDI+0x35f] did not satisfy the measured no-hit record');
  assert(jumpSite?.address === '0x200009a4' && jumpSite.hitCount === 1 && jumpSite.destinationHitCount === 1,
    'JMP [ESI+0x12] edge count differs from capture');
  assert(debugRecord.events[1].eip === mapping.measuredOuterDestination &&
    debugRecord.events[2].eip === jumpSite.address && debugRecord.events[3].eip === mapping.tailJumpDestinationAddress &&
    mapping.tailJumpDestinationEqualsCurrentPick === true &&
    mapping.tailJumpDestinationAddress === mapping.currentPickEntry,
  'outer destination / tail-jump / mapped PICK edge differs from capture');
  assert(debugRecord.outerReturnGuard?.armed === true && debugRecord.outerReturnGuard.hit === false &&
    debugRecord.cleanupErrors.length === 0 && report.claims.continuousInstructionPathProven === false &&
    report.claims.directLispCallerProven === false,
  'guard, cleanup, or interpretation limitation gate failed');

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
  for (const [name, record] of Object.entries(comparison.sources ?? {})) {
    const source = readFile(record.path);
    checkHash(source.sha256, record.sha256, `comparison source ${name}`);
    topSources[name] = { path: source.path, bytes: source.bytes.length, sha256: source.sha256 };
  }

  const result = {
    schemaVersion: 1,
    status: 'accepted-complete-source-bound-repeat; no-new-behavior-contract',
    triplet: {
      id: TRIPLET_ID,
      mode: comparison.mode,
      canvas: comparison.aa0Header,
      roles: runRecords,
      controlsMatch: comparison.controlsMatch,
      beforeAfterPlanningTraceMatch: comparison.beforeAfterPlanningTraceMatch,
      comparisonSha256: comparisonFile.sha256,
      currentSourceInputs: topSources,
    },
    observation: {
      outerCall: { address: mapping.callSiteAddress, destination: mapping.measuredOuterDestination, destinationRemainsAnonymous: true },
      innerCall: { instruction: 'CALL [EDI+0x35f]', address: callSite.address, hitCount: callSite.hitCount, destinationHitCount: callSite.destinationHitCount },
      tailJump: { instruction: 'JMP [ESI+0x12]', address: jumpSite.address, hitCount: jumpSite.hitCount, destination: mapping.tailJumpDestinationAddress, currentMappedPickEntry: mapping.currentPickEntry, sameThread: true },
      limitations: [
        'This repeats the same 768x1080 seed-1234 scene and does not test another scene, seed, or canvas regime.',
        'The anonymous outer destination and its direct Lisp caller remain unidentified.',
        'The capture observes selected breakpoint edges, not a continuous instruction path.',
        'The zero-hit CALL is a bounded no-hit in this scene only; it is not evidence that the site is unreachable.',
        'The repeated native edge adds no JavaScript behavior contract or painting parity.'
      ]
    },
    nativeCapture: {
      reportPath: comparison.debuggerResult.path.replaceAll('\\', '/'),
      reportSha256: captureFile.sha256,
      readyMetadataSha256: comparison.debuggerResult.readyMetadataSha256,
      debuggerDetached: debugRecord.detached,
      cleanupErrors: debugRecord.cleanupErrors,
      debuggerRegistersRestored: debugRecord.debugRegistersRestored,
      debugStateRestorationsExact: debugRecord.debugStateRestorations.every(row => row.exactMatch === true),
      selectedThreadId: debugRecord.selectedThreadId,
      eventCount: debugRecord.eventCount,
      targetWindowSha256: comparison.debuggerResult.targetWindowSha256,
      historicalReferenceWindowSha256: comparison.debuggerResult.referenceWindowSha256,
      pinnedInstructionProfileMatches: true,
      nativeMapSha256: nativeMapHash,
      nativeCaptureManifestSha256: manifestHash,
      outerReturnGuard: debugRecord.outerReturnGuard,
    },
    provenance: { comparison: comparisonFile.path, nativeMapPath: relative(REPO, nativeMapPath).split(sep).join('/'), nativeCaptureManifestPath: relative(REPO, manifestPath).split(sep).join('/') },
  };
  const output = resolve(REPO, args.output);
  assert(within(REPO, output), 'output must stay inside repository');
  assert(args.overwrite || !existsSync(output), `refusing to overwrite ${args.output}`);
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(output, bytes, { flag: args.overwrite ? 'w' : 'wx' });
  process.stdout.write(`${JSON.stringify({ output: relative(REPO, output).split(sep).join('/'), sha256: sha(bytes), tripletId: TRIPLET_ID, controlsMatch: true, sourceBoundComplete: true, callHitCount: callSite.hitCount, jumpDestination: mapping.tailJumpDestinationAddress }, null, 2)}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
