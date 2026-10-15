#!/usr/bin/env node

// Offline, source-bound validation for accepted PREMIUM no-TF triplets.
// The report records measured native edges without inferring a Lisp ABI.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_TRIPLET_ID = 'prem-internal-next-20261015-102743-42be241d';
const DEFAULT_MODE = 'writer-stream-seed-1234';
const DEFAULT_COMPARISON = `research/extracted/local-oracle/premium-internal-transfer-triplet-v3-logs/${DEFAULT_TRIPLET_ID}/triplet-comparison.json`;
const DEFAULT_OUTPUT = 'research/introspection/evidence/premium-internal-transfer-repeat-20261015.json';
const REQUIRED_ARTIFACTS = ['aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt'];
const REQUIRED_SOURCES = {
  'writer-stream-seed-1234': [
    'planning-call-trace.cl', 'planning-random-seed-common.cl', 'scene-state-snapshot-seeded-1234.cl',
    'scene-state-snapshot-writer-seeded-1234.cl', 'scene-state-snapshot-writer-stream-seeded-1234.cl', 'scene-state-snapshot.cl',
  ],
  'writer-full-seed-5678': [
    'planning-call-trace.cl', 'planning-random-seed-common.cl', 'scene-state-snapshot-seeded-1234.cl',
    'scene-state-snapshot-writer-full-seeded-5678.cl', 'scene-state-snapshot.cl',
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
  const args = { tripletId: DEFAULT_TRIPLET_ID, mode: DEFAULT_MODE, comparison: DEFAULT_COMPARISON, output: DEFAULT_OUTPUT, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--triplet-id') args.tripletId = argv[++i] ?? '';
    else if (key === '--mode') args.mode = argv[++i] ?? '';
    else if (key === '--comparison') args.comparison = argv[++i] ?? '';
    else if (key === '--out') args.output = argv[++i] ?? '';
    else if (key === '--overwrite') args.overwrite = true;
    else if (key === '--help') {
      process.stdout.write('Usage: node research/tools/derive-premium-internal-transfer-triplet-evidence-v1.mjs [--triplet-id ID] [--mode MODE] [--comparison PATH] [--out PATH] [--overwrite]\n');
      process.exit(0);
    } else fail(`Unknown argument: ${key}`);
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
  assert(Object.hasOwn(REQUIRED_SOURCES, args.mode), `unsupported mode: ${args.mode}`);
  assert(comparison.schemaVersion === 2 && comparison.tripletId === args.tripletId &&
    comparison.mode === args.mode && comparison.aa0Header === '768 1080 148',
  'triplet identity, schema, mode, or canvas gate failed');
  assert(comparison.controlsMatch === true && comparison.beforeAfterPlanningTraceMatch === true,
    'fresh uninstrumented controls or planning traces differ');
  assert(Array.isArray(comparison.runs) && comparison.runs.length === 3,
    'expected exactly before, observer, and after runs');

  const requiredRoles = ['before', 'observer', 'after'];
  const requiredArtifacts = [...REQUIRED_ARTIFACTS];
  if (args.mode === 'writer-full-seed-5678') requiredArtifacts.push('aaron-writer-full.txt');
  const expectedArtifactNames = new Set();
  const roles = new Map();
  const firstArtifacts = new Map();
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
    assert(/^768 1080 148(?:\r?\n)/u.test(aa0), `${role}: AA0 header mismatch`);

    const sources = run.sources ?? {};
    const sourceNames = Object.keys(sources).sort();
    const requiredSourceNames = [...REQUIRED_SOURCES[args.mode]].sort();
    assert(sourceNames.length === requiredSourceNames.length && sourceNames.every((name, i) => name === requiredSourceNames[i]),
      `${role}: staged scene source set differs from the expected ${args.mode} inputs`);
    if (index === 0) expectedSourceNames = sourceNames;
    else assert(sourceNames.length === expectedSourceNames.length && sourceNames.every((name, i) => name === expectedSourceNames[i]),
      `${role}: staged source names differ across triplet legs`);
    for (const [name, record] of Object.entries(sources)) {
      fileRecord(record, `${role} staged source ${name}`, runRoot);
    }
    if (args.mode === 'writer-full-seed-5678') {
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
  assert(debugRecord?.attached === true && debugRecord.attachSucceeded === true && debugRecord.detached === true &&
    debugRecord.readyPauseReleased === true && debugRecord.debugRegistersRestored === true &&
    debugRecord.captureCompleted === true && debugRecord.callDebugRegistersRestoredBeforeDestination === true &&
    Array.isArray(debugRecord.cleanupErrors) && debugRecord.cleanupErrors.length === 0,
  'debugger lifecycle or cleanup gate failed');
  assert(Array.isArray(debugRecord.debugStateRestorations) && debugRecord.debugStateRestorations.length > 0 &&
    debugRecord.debugStateRestorations.every(row => row.exactMatch === true),
  'not every thread debug-register state was restored exactly');
  assert(Array.isArray(debugRecord.events) && debugRecord.events.length === debugRecord.eventCount &&
    debugRecord.events.length >= 4 && debugRecord.events.every(event => event.threadId === debugRecord.selectedThreadId),
  'breakpoint event count or selected-thread gate failed');
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
  assert(callSite?.offset === 23 && callSite.expectedBytesHex === 'ff975f030000' &&
    Number.isInteger(callSite.hitCount) && callSite.hitCount >= 0 &&
    callSite.destinationHitCount === callSite.hitCount,
  'CALL [EDI+0x35f] hit/destination counts or source signature differ');
  assert(jumpSite?.offset === 161 && jumpSite.expectedBytesHex === 'ff6612' &&
    jumpSite.hitCount === 1 && jumpSite.destinationHitCount === 1,
    'JMP [ESI+0x12] edge count differs from capture');
  const findEvent = (kind, site) => debugRecord.events.find(event => event.kind === kind && event.site === site);
  const outerCallEvent = findEvent('source-hit', 'PREMIUM-CALL-EDI+27');
  const outerDestinationEvent = findEvent('destination-hit', 'PREMIUM-outer-destination');
  const jumpSourceEvent = findEvent('source-hit', 'JMP-ESI+12');
  const jumpDestinationEvent = findEvent('destination-hit', 'JMP-ESI+12');
  const innerCallSourceEvents = debugRecord.events.filter(event => event.kind === 'source-hit' && event.site === 'CALL-EDI+35F');
  const innerCallDestinationEvents = debugRecord.events.filter(event => event.kind === 'destination-hit' && event.site === 'CALL-EDI+35F');
  assert(outerCallEvent?.eip === mapping.callSiteAddress && outerDestinationEvent?.eip === mapping.measuredOuterDestination &&
    jumpSourceEvent?.eip === jumpSite.address && jumpDestinationEvent?.eip === mapping.tailJumpDestinationAddress &&
    innerCallSourceEvents.length === callSite.hitCount && innerCallDestinationEvents.length === callSite.destinationHitCount &&
    outerCallEvent.eventOrder < outerDestinationEvent.eventOrder &&
    outerDestinationEvent.eventOrder < jumpSourceEvent.eventOrder && jumpSourceEvent.eventOrder < jumpDestinationEvent.eventOrder &&
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
    const matchesCapture = source.sha256 === record.sha256;
    if (name !== 'coordinator') checkHash(source.sha256, record.sha256, `comparison source ${name}`);
    topSources[name] = {
      path: source.path,
      bytes: source.bytes.length,
      capturedSha256: record.sha256,
      currentSha256: source.sha256,
      matchesCapture,
    };
  }

  const result = {
    schemaVersion: 1,
    status: 'accepted-complete-source-bound-native-triplet; no-JavaScript-contract',
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
      innerCall: { instruction: 'CALL [EDI+0x35f]', address: callSite.address, hitCount: callSite.hitCount, destinationHitCount: callSite.destinationHitCount, boundedNoHit: callSite.hitCount === 0, observedEvents: innerCallSourceEvents.map((event, index) => ({ sourceOrder: event.eventOrder, destinationOrder: innerCallDestinationEvents[index]?.eventOrder, sourceEip: event.eip, destinationEip: innerCallDestinationEvents[index]?.eip })) },
      tailJump: { instruction: 'JMP [ESI+0x12]', address: jumpSite.address, hitCount: jumpSite.hitCount, destination: mapping.tailJumpDestinationAddress, currentMappedPickEntry: mapping.currentPickEntry, sameThread: true },
      limitations: [
        `This records one ${comparison.mode} scene at ${comparison.aa0Header}; it does not generalize to other seeds, scenes, or canvas regimes.`,
        'The anonymous outer destination and its direct Lisp caller remain unidentified.',
        'The capture observes selected breakpoint edges, not a continuous instruction path.',
        'A zero-hit CALL is a bounded no-hit in this scene only, not evidence that the site is unreachable.',
        'The native edge does not add JavaScript behavior or painting parity.'
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
      pinnedInstructionProfileMatches: window.instructionProfileMatches,
      nativeMapSha256: nativeMapHash,
      nativeCaptureManifestSha256: manifestHash,
      outerReturnGuard: debugRecord.outerReturnGuard,
    },
    provenance: {
      comparison: comparisonFile.path,
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
  process.stdout.write(`${JSON.stringify({ output: relative(REPO, output).split(sep).join('/'), sha256: sha(bytes), tripletId: args.tripletId, controlsMatch: true, sourceBoundComplete: true, callHitCount: callSite.hitCount, jumpDestination: mapping.tailJumpDestinationAddress }, null, 2)}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
