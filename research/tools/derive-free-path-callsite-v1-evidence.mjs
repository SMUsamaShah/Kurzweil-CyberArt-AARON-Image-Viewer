#!/usr/bin/env node

// Strict offline derivation for one FREE-PATH three-call-site capture triplet.
// This program reads saved files only; it never launches the original runtime.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER = 'research/oracle/run-local-scene-state-required-probe.ps1';
const PROBE = 'research/introspection/free-path-caller-native-links.cl';
const CAPTURE_HELPER = 'research/tools/capture-free-path-callsite-v1.ps1';
const TRIPLET_HELPER = 'research/tools/capture-free-path-callsite-triplet-v1.ps1';
const DEBUGGER_HELPER = 'research/oracle/AaronFreePathCallsitesV1.cs';
const MANIFEST = 'research/extracted/aaron/manifest.json';
const PLL = 'research/extracted/aaron/application/AARON.pll';
const MODE = 'writer-stream-seed-1234';
const READY = 'READY free-path-caller-native-links';
const END = 'END free-path-caller-native-links';
const WAIT = 'NATIVE-CAPTURE-WAIT released=T';
const PAYLOAD_SHA = '93b018cb03d3d8cec18eaaa4cd813d7c4cdfa32bb02b5f3a5b11a4b51feea787';
const SYNTHETIC_PE_SHA = '70f11471b178d1526a74348b158ab68f8a4657ac2a4997bf84eb4dc783f42cf7';
const SITES = Object.freeze([
  { offset: 0x39a, bytes: 'ff5727', mnemonic: 'CALL', description: 'CALL dword ptr [EDI+0x27]' },
  { offset: 0x3ac, bytes: '7f52', mnemonic: 'JG', description: 'JG +0x400' },
  { offset: 0x3e4, bytes: 'ff5727', mnemonic: 'CALL', description: 'CALL dword ptr [EDI+0x27]' },
]);
const STATIC_REFS = Object.freeze([
  { path: 'research/artifacts/rea-tools/free-path-callsite-rea-20261014-b/inspect-da1e.json', sha256: 'f3818feffa66bb2856008895201332984eddbe23aaee959a0cf4ae9e0121ab8f', kind: 'inspect-call-before-branch', address: '0x1fdfda1e', bytes: 'ff5727' },
  { path: 'research/artifacts/rea-tools/free-path-callsite-rea-20261014-c/1fdfda30.json', sha256: '827ef729cc8cd5f522273708f0e72dd007bd6f8c80b5b030476273139672fb96', kind: 'inspect-conditional-branch', address: '0x1fdfda30', bytes: '7f52' },
  { path: 'research/artifacts/rea-tools/free-path-callsite-rea-20261014-c/1fdfda68.json', sha256: 'c4cfb5923dfd7670bc92d53981418a03d7f9154dbe600236a78dd33f21c2d017', kind: 'inspect-call-after-branch', address: '0x1fdfda68', bytes: 'ff5727' },
  { path: 'research/artifacts/rea-tools/free-path-callsite-target-20261014-a/rea-result.json', sha256: '3943fffbae4ca9ddad0a7a480f0309f2db464bb3798358babde648a0ad07b577', kind: 'target-resolution-at-plus-3e4' },
  { path: 'research/artifacts/rea-tools/free-path-callsite-value-trace-20261014-c/trace-native-values.json', sha256: 'bd33cc589e7bfcfcf85a500ee58d0a5400cc9800490b16c68f00a6dbe7489e81', kind: 'complete-value-trace' },
  { path: 'research/artifacts/rea-tools/free-path-callsite-value-trace-20261014-a/trace-native-values.json', sha256: '150bfea429b4159531447df9bf2e88f92c53073f79b239eb1db35344007b2619', kind: 'diagnostic-truncated-value-trace' },
  { path: 'research/artifacts/rea-tools/free-path-native-rea-20261013-a/free-path.synthetic.exe', sha256: SYNTHETIC_PE_SHA, kind: 'static-analysis-container' },
]);
const ARTIFACTS = Object.freeze(['aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt']);
const SOURCE_PATHS = Object.freeze({
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
const parseJson = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
const readJson = path => parseJson(read(path));
const rel = path => relative(ROOT, path).split(sep).join('/');
const repoPath = value => resolve(ROOT, value);
const record = path => {
  const bytes = read(path);
  return { path: rel(path), bytes: bytes.length, sha256: sha256(bytes) };
};
const withinRoot = path => {
  const value = relative(ROOT, path);
  return value === '' || (value !== '..' && !value.startsWith(`..${sep}`));
};
const equalFiles = (a, b) => read(a).equals(read(b));
const safeInteger = (value, label) => {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} is not a safe nonnegative integer`);
  return value;
};
const u32hex = (value, label) => {
  assert(typeof value === 'string' && /^0x[0-9a-f]{8}$/u.test(value), `${label} is not an exact lowercase 32-bit hex value`);
  return BigInt(value);
};
const fmtU32 = value => `0x${value.toString(16).padStart(8, '0')}`;

function verifySlotRead(slot, edi, label) {
  assert(slot && typeof slot === 'object', `${label}: missing [EDI+0x27] read record`);
  const slotAddress = edi + 0x27n;
  if (slotAddress > 0xffffffffn) {
    assert(slot.address === null && slot.value === null && slot.bytesHex === null
      && typeof slot.readError === 'string' && slot.targetAddressPreview == null,
    `${label}: overflowing [EDI+0x27] record is inconsistent`);
    return;
  }
  assert(u32hex(slot.address, `${label} slot address`) === slotAddress,
    `${label}: slot address is not EDI+0x27`);
  if (slot.value === null) {
    assert(typeof slot.readError === 'string' && slot.bytesHex === null && slot.targetAddressPreview == null,
      `${label}: failed slot read has inconsistent value/error/preview fields`);
    return;
  }
  const target = u32hex(slot.value, `${label} raw slot value`);
  assert(slot.readError === null && typeof slot.bytesHex === 'string'
    && /^[0-9a-f]{8}$/u.test(slot.bytesHex), `${label}: successful slot read lacks exact four bytes`);
  const bytes = Buffer.from(slot.bytesHex, 'hex');
  assert(bytes.readUInt32LE(0) === Number(target), `${label}: slot bytes are not the little-endian raw target value`);
  const preview = slot.targetAddressPreview;
  assert(preview && typeof preview === 'object' && preview.requestedBytes === 16
    && u32hex(preview.address, `${label} preview address`) === target,
  `${label}: bounded target preview is not bound to the raw slot value`);
  if (target === 0n) {
    assert(preview.status === 'null-address' && preview.bytesHex === null && preview.sha256 === null
      && preview.readError === null, `${label}: null target preview has unexpected fields`);
  } else if (target > 0xfffffff0n) {
    assert(preview.status === 'address-overflow' && preview.bytesHex === null && preview.sha256 === null
      && typeof preview.readError === 'string', `${label}: overflowing target preview has unexpected fields`);
  } else if (preview.status === 'read') {
    assert(typeof preview.bytesHex === 'string' && /^[0-9a-f]{32}$/u.test(preview.bytesHex)
      && preview.sha256 === sha256(Buffer.from(preview.bytesHex, 'hex')) && preview.readError === null,
    `${label}: successful 16-byte target preview/hash is inconsistent`);
  } else {
    assert(preview.status === 'unreadable' && preview.bytesHex === null && preview.sha256 === null
      && typeof preview.readError === 'string', `${label}: unreadable target preview has unexpected fields`);
  }
}

function verifyNativeCapture(native, mappedFunction, archivedReadyHeaderHex) {
  const capture = native.capture;
  assert(capture && typeof capture === 'object' && capture.attached === true
    && capture.breakpointsArmed === true && capture.captureReleased === true,
  'Native capture did not prove successful debugger attach, breakpoint arming, and READY release');
  assert(capture.debugRegistersRestored === true
    && (capture.detached === true || capture.debugSessionEndedByTargetExit === true)
    && (!capture.cleanupErrors || capture.cleanupErrors.length === 0),
  'Native helper does not prove safe debugger cleanup');
  assert(capture.detached !== true || capture.debugSessionEndedByTargetExit !== true,
    'Native helper reports both detach and target-exit termination');
  assert(native.failure === null || native.failure === undefined,
    'Native helper report contains an outer capture/runtime failure');

  const entry = u32hex(native.mappedFunction.liveEntry, 'Validated live FREE-PATH entry');
  assert(native.liveFunction?.entryPointer === fmtU32(entry)
    && native.liveFunction.exactCurrentLivePayloadMatch === true
    && native.liveFunction.currentLivePayloadSha256 === PAYLOAD_SHA,
  'Current entry was not accepted after an exact complete live-payload match');
  const readyHeaderHex = native.liveFunction.readyHeaderHex;
  const mappedHeaderHex = native.liveFunction.mappedHeaderHex;
  assert(typeof readyHeaderHex === 'string' && /^[0-9a-f]{128}$/u.test(readyHeaderHex)
    && typeof mappedHeaderHex === 'string' && /^[0-9a-f]{128}$/u.test(mappedHeaderHex)
    && native.liveFunction.entryPointerFieldOffset === 18,
  'READY and mapped headers do not identify the entry-pointer field');
  const readyHeader = Buffer.from(readyHeaderHex, 'hex');
  const mappedHeader = Buffer.from(mappedHeaderHex, 'hex');
  assert(typeof archivedReadyHeaderHex === 'string' && /^[0-9a-f]{128}$/u.test(archivedReadyHeaderHex)
    && readyHeader.equals(Buffer.from(archivedReadyHeaderHex, 'hex')),
  'Reported READY header differs byte-for-byte from the source-bound observer metadata');
  assert(typeof mappedFunction?.functionObjectHeaderHex === 'string'
    && mappedHeader.equals(Buffer.from(mappedFunction.functionObjectHeaderHex, 'hex')),
  'Reported mapped header differs byte-for-byte from the verified native map');
  const mappedEntry = u32hex(native.mappedFunction.mappedCaptureEntry, 'Mapped capture FREE-PATH entry');
  assert(mappedEntry === u32hex(mappedFunction.mappedEntry, 'Verified map FREE-PATH entry')
    && BigInt(mappedHeader.readUInt32LE(18)) === mappedEntry,
    'Mapped capture entry does not match its recorded function header');
  assert(BigInt(readyHeader.readUInt32LE(18)) === entry,
    'Validated live entry does not equal the READY header pointer');
  assert(entry > 0n && entry + 1330n <= 0x100000000n,
    'Validated live FREE-PATH payload range is outside 32-bit memory');

  const addressNames = ['callBeforeBranch', 'conditionalBranch', 'callAfterBranch'];
  const addresses = capture.addresses;
  assert(addresses && typeof addresses === 'object', 'Native capture omits call-site addresses');
  const expectedAddresses = SITES.map(site => entry + BigInt(site.offset));
  for (let index = 0; index < SITES.length; index += 1) {
    const address = expectedAddresses[index];
    assert(address <= 0xffffffffn, `FREE-PATH+0x${SITES[index].offset.toString(16)} address overflows`);
    assert(u32hex(addresses[addressNames[index]], `${addressNames[index]} breakpoint address`) === address,
      `Native breakpoint address mismatch at FREE-PATH+0x${SITES[index].offset.toString(16)}`);
    const row = native.instructionSites[index];
    assert(u32hex(row?.address, `Instruction site ${index} address`) === address,
      `Instruction-site address mismatch at FREE-PATH+0x${SITES[index].offset.toString(16)}`);
  }

  const chronology = capture.chronology;
  const byName = capture.sites;
  const names = SITES.map(site => site.offset === 0x39a ? 'call-before-branch'
    : site.offset === 0x3ac ? 'conditional-branch' : 'call-after-branch');
  assert(Array.isArray(chronology) && chronology.length <= 3 && byName
    && names.every(name => byName[name]), 'Native capture omits bounded call-site results');
  const chronologyNames = chronology.map(event => event.site);
  assert(new Set(chronologyNames).size === chronologyNames.length
    && chronology.every((event, index) => event.sequence === index + 1
      && event.threadId === capture.ownerThreadId),
  'Native call-site chronology is duplicated, unsequenced, or crosses threads');
  let hitCount = 0;
  for (let index = 0; index < SITES.length; index += 1) {
    const name = names[index]; const site = byName[name]; const address = expectedAddresses[index];
    assert(site.name === name && site.offset === `0x${SITES[index].offset.toString(16)}`
      && u32hex(site.address, `${name} site address`) === address,
    `${name}: site identity or address is inconsistent`);
    assert(typeof site.hit === 'boolean' && site.hit === (site.status === 'hit')
      && site.hit === (site.event !== null), `${name}: status and event/hit disagree`);
    if (!site.hit) {
      assert(site.status === 'not-observed-within-capture-window', `${name}: unsupported no-hit status`);
      continue;
    }
    hitCount += 1;
    const event = site.event;
    const chronologyEvent = chronology.find(row => row.site === name);
    assert(event.site === name && event.threadId === capture.ownerThreadId
      && chronologyEvent && JSON.stringify(event) === JSON.stringify(chronologyEvent),
    `${name}: event identity differs from its unique chronology entry`);
    for (const register of ['eax', 'ecx', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp', 'eflags', 'dr6'])
      u32hex(event[register], `${name} ${register.toUpperCase()}`);
    assert(u32hex(event.eip, `${name} EIP`) === address
      && (u32hex(event.dr6, `${name} DR6`) & (1n << BigInt(index))) !== 0n,
    `${name}: EIP or hardware-breakpoint DR6 bit does not match the site`);
    if (index === 0 || index === 2) {
      const edi = u32hex(event.edi, `${name} EDI`);
      verifySlotRead(event.ediSlot, edi, name);
    } else {
      assert(event.ediSlot === null, 'Conditional-branch record unexpectedly contains a [EDI+0x27] read');
      const eflags = u32hex(event.eflags, '+0x3ac EFLAGS');
      const zf = (eflags & 0x40n) !== 0n; const sf = (eflags & 0x80n) !== 0n; const of = (eflags & 0x800n) !== 0n;
      assert(event.jgConditionFromCapturedFlags === (!zf && sf === of),
        'Captured +0x3ac JG condition does not match EFLAGS bits');
    }
  }
  assert(chronology.length === hitCount && chronologyNames.every(name => names.includes(name)),
    'Native chronology and per-site hit records do not form the same unique event set');
  assert(capture.allThreeSitesHit === (hitCount === 3), 'allThreeSitesHit disagrees with unique hit count');

  const deadlineErrors = new Map([
    [0, 'No selected FREE-PATH call-site breakpoint observed within the deadline'],
    [1, 'Capture window ended before every selected call-site was observed'],
    [2, 'Capture window ended before every selected call-site was observed'],
  ]);
  const targetExitErrors = new Map([
    [0, 'Target exited before a selected FREE-PATH call-site breakpoint was observed'],
    [1, 'Target exited before every selected FREE-PATH call-site was observed'],
    [2, 'Target exited before every selected FREE-PATH call-site was observed'],
  ]);
  assert(typeof capture.targetExitEventObserved === 'boolean'
    && typeof capture.captureWindowExpired === 'boolean'
    && !(capture.targetExitEventObserved && capture.captureWindowExpired),
  'Capture stop-reason flags are missing or contradictory');
  if (hitCount === 3) {
    assert(native.outcome === 'three-call-sites-hit' && capture.captureError === null,
      'Three-hit capture has inconsistent outcome or captureError');
  } else {
    const deadlineBounded = !capture.targetExitEventObserved && capture.captureWindowExpired
      && capture.captureError === deadlineErrors.get(hitCount);
    const targetExitBounded = capture.targetExitEventObserved && !capture.captureWindowExpired
      && capture.debugSessionEndedByTargetExit === true
      && capture.captureError === targetExitErrors.get(hitCount);
    assert(native.outcome === (hitCount === 0 ? 'no-call-site-hit' : 'partial-call-site-hits')
      && (deadlineBounded || targetExitBounded),
    'No-hit/partial result is not a bounded deadline or observed target exit; runtime, attach, and cleanup failures are inadmissible');
  }
  const captureErrorClass = hitCount === 3 ? 'all-sites-observed'
    : capture.targetExitEventObserved ? 'bounded-target-exit-partial'
      : hitCount === 0 ? 'bounded-no-hit-deadline' : 'bounded-partial-deadline';
  return { chronology, byName, hitCount, captureErrorClass };
}

function verifyStaticReferences() {
  const references = STATIC_REFS.map(reference => {
    const path = repoPath(reference.path);
    const bytes = read(path);
    assert(sha256(bytes) === reference.sha256, `REA static reference hash mismatch: ${reference.path}`);
    const item = { ...reference, record: record(path) };
    if (reference.kind.startsWith('inspect-')) {
      const json = parseJson(bytes);
      const row = json.raw_result;
      assert(json.operation === 'inspect_native_instruction' && json.subject?.digest?.sha256 === SYNTHETIC_PE_SHA,
        `${reference.path}: operation or synthetic PE identity changed`);
      assert(row?.address === reference.address && row.bytes === reference.bytes && row.status === 'decoded',
        `${reference.path}: decoded address/bytes/status mismatch`);
      item.instruction = row.raw_disassembly;
      if (reference.kind === 'inspect-call-before-branch' || reference.kind === 'inspect-call-after-branch') {
        assert(row.mnemonic === 'CALL' && row.flow?.computed === true && row.flow?.direct_destinations?.length === 0,
          `${reference.path}: expected computed CALL with no direct destination`);
      } else {
        assert(row.mnemonic === 'JG' && row.flow?.conditional === true && row.flow?.computed === false,
          `${reference.path}: expected conditional direct JG`);
        item.directDestinations = row.flow.direct_destinations;
      }
    } else if (reference.kind === 'target-resolution-at-plus-3e4') {
      const json = parseJson(bytes);
      const row = json.raw_result;
      assert(json.operation === 'resolve_native_call_targets' && row?.call_site === '0x1fdfda68'
        && row.status === 'unresolved' && row.mechanism === 'computed'
        && Array.isArray(row.targets) && row.targets.length === 0,
      'REA +0x3e4 target-resolution result is no longer unresolved');
      item.status = row.status;
      item.mechanism = row.mechanism;
      item.targets = row.targets;
    } else if (reference.kind === 'complete-value-trace') {
      const json = parseJson(bytes);
      const row = json.normalized_result;
      assert(json.operation === 'trace_native_values' && json.subject?.digest?.sha256 === SYNTHETIC_PE_SHA
        && row?.total_nodes === 623 && row.total_edges === 552 && row.decompilations === 1
        && row.truncated === false && row.unknowns?.length === 81,
      'REA value trace is not the pinned complete 623-node/552-edge report');
      const operation = (address, opcode) => row.nodes.find(node => node.operation?.address === address && node.operation?.opcode === opcode);
      const call39a = operation('0x1fdfda1e', 'CALLIND');
      const cast3ac = operation('0x1fdfda30', 'CAST');
      const compare3ac = operation('0x1fdfda30', 'INT_SLESS');
      const branch3ac = operation('0x1fdfda30', 'CBRANCH');
      const call3e4 = operation('0x1fdfda68', 'CALLIND');
      assert(call39a?.operation?.output?.kind === 'register'
        && call39a.operation.output.location === 'register:0x0'
        && cast3ac?.operation?.inputs?.[0]?.kind === 'register'
        && cast3ac.operation.inputs[0].location === 'register:0x0'
        && compare3ac && branch3ac && call3e4?.operation?.output === null,
      'REA value trace no longer contains the bounded EAX-to-compare/branch relation and outputless +0x3e4 CALLIND');
      assert(row.edges.some(edge => edge.source === call39a.id && edge.target === cast3ac.id)
        && row.edges.some(edge => edge.source === compare3ac.id && edge.target === branch3ac.id),
      'REA value trace is missing the direct def-use edges to the +0x3ac compare/branch');
      item.totalNodes = row.total_nodes;
      item.totalEdges = row.total_edges;
      item.truncated = row.truncated;
      item.decompilations = row.decompilations;
      item.unknownCallTargets = row.unknowns.length;
      item.valueFlowFinding = 'CALLIND at +0x39a yields register:0x0 (EAX); that value reaches the +0x3ac compare and conditional branch. CALLIND at +0x3e4 has no modeled output.';
    } else if (reference.kind === 'diagnostic-truncated-value-trace') {
      const json = parseJson(bytes);
      const row = json.normalized_result;
      assert(json.operation === 'trace_native_values' && json.subject?.digest?.sha256 === SYNTHETIC_PE_SHA
        && row?.total_nodes === 500 && row.total_edges === 434 && row.truncated === true,
      'Capped REA diagnostic trace identity changed');
      item.totalNodes = row.total_nodes;
      item.totalEdges = row.total_edges;
      item.truncated = row.truncated;
      item.diagnosticOnly = true;
    }
    return item;
  });
  const pe = references.find(item => item.kind === 'static-analysis-container');
  assert(pe.record.sha256 === SYNTHETIC_PE_SHA, 'Synthetic PE digest mismatch');
  return references;
}

function verifyMap(mapPath, expectedHash) {
  const bytes = read(mapPath);
  assert(sha256(bytes) === expectedHash, 'Native map hash differs from the triplet manifest');
  const map = parseJson(bytes);
  const pllBytes = read(repoPath(PLL));
  const pllDigest = sha256(pllBytes);
  assert(map.schemaVersion === 1 && map.pll?.bytes === pllBytes.length && map.pll.sha256 === pllDigest,
    'Native map is not bound to the extracted AARON.pll');
  const fn = map.functions?.find(item => item.name === 'FREE-PATH');
  assert(fn && map.functions.length === 2 && fn.uniqueCompleteObjectByteMatch === true
    && fn.payloadBytes === 1330 && fn.payloadSha256 === PAYLOAD_SHA,
  'Native map does not contain the pinned complete FREE-PATH payload');
  const objectOffset = safeInteger(fn.pll?.objectOffset, 'PLL object offset');
  const payloadOffset = safeInteger(fn.pll?.payloadOffset, 'PLL payload offset');
  const objectBytes = safeInteger(fn.objectBytes, 'PLL object byte length');
  const payloadBytes = safeInteger(fn.payloadBytes, 'payload byte length');
  assert(payloadOffset === objectOffset + 4 && objectBytes === payloadBytes + 4
    && objectOffset + objectBytes <= pllBytes.length,
  'FREE-PATH PLL object bounds are inconsistent');
  const object = pllBytes.subarray(objectOffset, objectOffset + objectBytes);
  const payload = pllBytes.subarray(payloadOffset, payloadOffset + payloadBytes);
  assert(sha256(object) === fn.objectSha256 && sha256(payload) === PAYLOAD_SHA,
    'FREE-PATH object/payload hash mismatch');
  let found = pllBytes.indexOf(object);
  assert(found === objectOffset, 'Mapped FREE-PATH object not found at its claimed PLL offset');
  assert(pllBytes.indexOf(object, found + 1) < 0, 'Mapped FREE-PATH complete object is not unique in the PLL');
  const mapDir = dirname(mapPath);
  const payloadFile = read(resolve(mapDir, fn.payloadFile));
  assert(payloadFile.equals(payload), 'Mapped payload file differs from PLL payload bytes');
  const captureRoot = resolve(mapDir, '..');
  const manifestPath = resolve(captureRoot, 'manifest.json');
  const captureManifestBytes = read(manifestPath);
  assert(sha256(captureManifestBytes) === map.captureManifestSha256,
    'Map capture-manifest hash mismatch');
  const captureManifest = parseJson(captureManifestBytes);
  const captured = captureManifest.functions?.find(item => item.name === 'FREE-PATH');
  assert(captured && captured.file === fn.capture.file && captured.sha256 === fn.capture.sha256
    && captured.bytes === fn.capture.bytes && captured.windowBase === fn.capture.windowBase
    && typeof fn.capture.functionObjectHeaderHex === 'string'
    && /^[0-9a-fA-F]{128}$/u.test(fn.capture.functionObjectHeaderHex)
    && captured.functionObjectHeaderHex?.toLowerCase() === fn.capture.functionObjectHeaderHex.toLowerCase(),
  'Map function differs from its native capture manifest');
  const mappedEntry = u32hex(fn.runtime?.entry, 'Verified map FREE-PATH entry');
  const functionObjectHeaderHex = fn.capture.functionObjectHeaderHex.toLowerCase();
  assert(BigInt(Buffer.from(functionObjectHeaderHex, 'hex').readUInt32LE(18)) === mappedEntry,
    'Verified map entry does not match its source-bound function header');
  const windowBytes = read(resolve(captureRoot, captured.file));
  assert(windowBytes.length === captured.bytes && sha256(windowBytes) === captured.sha256,
    'Captured FREE-PATH memory window failed its manifest hash');
  const headerOffset = safeInteger(fn.runtime?.headerOffsetInWindow, 'window header offset');
  const complete = windowBytes.subarray(headerOffset, headerOffset + objectBytes);
  assert(complete.length === objectBytes && complete.equals(object),
    'Captured native window does not contain the exact complete PLL object');
  for (const site of SITES) {
    assert(payload.subarray(site.offset, site.offset + site.bytes.length / 2).toString('hex') === site.bytes,
      `Mapped PLL instruction bytes changed at +0x${site.offset.toString(16)}`);
  }
  return {
    record: record(mapPath), pll: record(repoPath(PLL)),
    function: {
      name: 'FREE-PATH', payloadBytes, payloadSha256: PAYLOAD_SHA,
      mappedEntry: fmtU32(mappedEntry), functionObjectHeaderHex,
      pllObjectOffset: objectOffset, pllPayloadOffset: payloadOffset,
      completeObjectBytes: objectBytes, completeObjectSha256: sha256(object),
      uniqueCompleteObjectByteMatch: true, mappedPayloadFile: record(resolve(mapDir, fn.payloadFile)),
      capturedMemoryWindow: record(resolve(captureRoot, captured.file)),
    },
    instructions: SITES.map(site => ({ offset: `0x${site.offset.toString(16)}`, bytes: site.bytes, instruction: site.description })),
  };
}

function verifyRun(run, manifest, runnerHash, probeHash, observer, mapEvidence) {
  const root = repoPath(run.root);
  assert(withinRoot(root) && existsSync(root), `${run.role}: output root is missing or escapes workspace`);
  const summaryPath = resolve(root, 'summary.json');
  const summaryBytes = read(summaryPath);
  const summary = parseJson(summaryBytes);
  assert(run.complete === true && run.runId === basename(root) && summary.runId === run.runId
    && summary.complete === true && summary.mode === MODE && summary.smallImage === false
    && summary.probeCompletionSatisfied === true && summary.runnerSha256 === runnerHash
    && summary.installerSha256 === manifest.source.sha256,
  `${run.role}: runner summary is incomplete or source identity differs`);
  assert(sha256(summaryBytes) === run.summarySha256, `${run.role}: summary hash differs from triplet record`);
  if (observer) {
    assert(summary.preSceneProbeSha256 === probeHash && summary.requiredProbeOutputName === 'aaron-free-path-caller-native-links.txt'
      && summary.requiredProbeEndMarker === END && summary.probeCompletionSatisfied === true
      && Array.isArray(summary.probeOutputNames) && summary.probeOutputNames.length === 1
      && summary.probeOutputNames[0] === summary.requiredProbeOutputName,
    'Observer summary does not bind the required source probe and terminal marker');
  } else {
    assert(!summary.preSceneProbeSha256 && (!summary.probeOutputNames || summary.probeOutputNames.length === 0)
      && summary.preSceneProbePauseSeconds === 0 && !summary.requiredProbeOutputName && !summary.requiredProbeEndMarker,
    `${run.role}: control was instrumented`);
  }
  const runtime = {};
  for (const name of ['AARON.exe', 'AARON.pll']) {
    const path = resolve(root, 'runtime', name);
    const bytes = read(path);
    const expected = manifest.files.find(item => item.installedName === name);
    assert(expected && bytes.length === expected.bytes && sha256(bytes) === expected.sha256,
      `${run.role}: runtime ${name} differs from manifest`);
    runtime[name] = record(path);
  }
  const artifacts = {};
  for (const name of ARTIFACTS) {
    const path = resolve(root, 'capture', name);
    artifacts[name] = record(path);
  }
  const aa0Bytes = read(resolve(root, 'capture/aa0'));
  const aa0Lines = aa0Bytes.toString('ascii').split(/\r?\n/u);
  assert(aa0Lines.at(-2) === 'end', `${run.role}: AA0 lacks the terminal end line`);
  const header = /^(\d+) (\d+) (\d+)$/u.exec(aa0Lines[0]);
  assert(header && run.aa0Header === aa0Lines[0], `${run.role}: AA0 header differs from triplet summary`);
  const sceneBytes = read(resolve(root, 'capture/aaron-scene-state-snapshot.txt'));
  assert(sha256(aa0Bytes) === summary.aa0Sha256 && sha256(sceneBytes) === summary.sceneReportSha256
    && sceneBytes.toString('utf8').includes('END scene-state-snapshot'),
  `${run.role}: drawing or scene output is not complete and summary-bound`);
  const sources = {};
  for (const [name, repoRel] of Object.entries(SOURCE_PATHS)) {
    const sourcePath = resolve(root, 'capture', name);
    const current = read(repoPath(repoRel));
    const staged = read(sourcePath);
    const stagedRecord = record(sourcePath);
    assert(staged.equals(current), `${run.role}: staged source differs from current ${name}`);
    assert(run.sources?.[name]?.sha256 === stagedRecord.sha256,
      `${run.role}: triplet source record hash mismatch for ${name}`);
    sources[name] = stagedRecord;
  }
  const tracePath = resolve(root, 'capture/aaron-planning-call-trace.txt');
  const traceBytes = read(tracePath);
  const traceText = traceBytes.toString('utf8');
  if (observer) assert(traceText.includes('UNWRAPPED-TARGETS ("FREE-PATH")'), 'Observer trace does not keep FREE-PATH unwrapped');
  else assert(!traceText.includes('UNWRAPPED-TARGETS'), `${run.role}: no-probe planning trace unexpectedly contains observer instrumentation`);
  const artifactsInTriplet = Object.fromEntries(ARTIFACTS.map(name => [name, record(resolve(root, 'capture', name))]));
  assert(run.artifacts?.aa0?.sha256 === artifactsInTriplet.aa0.sha256, `${run.role}: triplet AA0 record mismatch`);

  let observerProof = null;
  if (observer) {
    const metadataPath = resolve(root, 'capture/aaron-free-path-caller-native-links.txt');
    const metadataBytes = read(metadataPath);
    const text = metadataBytes.toString('utf8').replace(/\r\n/gu, '\n');
    assert(!text.includes('\r') && text.endsWith('\n'), 'Observer metadata line endings or final record are incomplete');
    const lines = text.slice(0, -1).split('\n');
    assert(lines.length === 13 && lines[0] === 'BEGIN free-path-caller-native-links'
      && lines[1] === 'INSTALL targets=2 mode=READ-ONLY-METADATA'
      && lines[2] === 'FUNCTION name="FREE-PATH" type=COMPILED-FUNCTION'
      && lines[4] === 'FUNCTION name="DRAW-CFORM" type=COMPILED-FUNCTION'
      && lines[6] === 'TOTALS targets=2 functions=2 headers=2 errors=0 truncations=0'
      && lines[7] === 'ERROR-COUNT 0' && lines[8] === 'TRUNCATION-COUNT 0'
      && lines[9] === READY && lines[10] === WAIT
      && lines[11] === 'COMPLETE free-path-caller-native-links' && lines[12] === END,
    'Observer metadata lacks the complete ordered READY/wait/COMPLETE/END protocol');
    const readyHeaderMatch = /^HEADER name="FREE-PATH" bytes=([0-9a-fA-F]{128})$/u.exec(lines[3]);
    assert(readyHeaderMatch, 'Observer metadata line 3 lacks the exact FREE-PATH READY header bytes');
    const archivedReadyHeaderHex = readyHeaderMatch[1].toLowerCase();
    const rawText = metadataBytes.toString('utf8');
    const readyOffset = rawText.indexOf(READY);
    const readyLineEnd = rawText.indexOf('\n', readyOffset);
    assert(readyOffset >= 0 && readyOffset === rawText.lastIndexOf(READY) && readyLineEnd > readyOffset,
      'Archived observer metadata has no unique raw READY-line terminator');
    const prefixBytes = Buffer.from(rawText.slice(0, readyLineEnd + 1), 'utf8');
    const nativePath = resolve(root, 'free-path-callsite-v1.json');
    const nativeBytes = read(nativePath);
    const native = parseJson(nativeBytes);
    assert(native.schemaVersion === 1 && native.oracleRunId === run.runId
      && native.sourceProbeSha256 === probeHash && native.stagedProbeSha256 === probeHash
      && native.runnerSha256 === runnerHash && native.readyPrefixSha256 === sha256(prefixBytes)
      && native.captureHelperSha256 === sha256(read(repoPath(CAPTURE_HELPER)))
      && native.debuggerHelperSha256 === sha256(read(repoPath(DEBUGGER_HELPER)))
      && native.sourceMapSha256 === mapEvidence.record.sha256,
    'Native helper report is not bound to current probe, READY prefix, code helpers, and map');
    assert(typeof native.liveFunction?.readyHeaderHex === 'string'
      && Buffer.from(native.liveFunction.readyHeaderHex, 'hex').equals(Buffer.from(archivedReadyHeaderHex, 'hex')),
    'Native READY header is not byte-for-byte bound to observer metadata line 3');
    assert(native.mappedFunction?.payloadSha256 === PAYLOAD_SHA && native.mappedFunction.payloadBytes === 1330
      && native.liveFunction?.exactCurrentLivePayloadMatch === true
      && native.instructionSites?.length === SITES.length,
    'Native helper lacks its exact mapped/live FREE-PATH payload and instruction checks');
    for (let index = 0; index < SITES.length; index += 1) {
      const expected = SITES[index];
      const actual = native.instructionSites[index];
      assert(actual.offset === `0x${expected.offset.toString(16)}` && actual.bytes === expected.bytes
        && actual.bytesMatchMappedPllPayload === true && actual.bytesMatchCurrentLivePayload === true,
      `Native helper instruction identity mismatch at +0x${expected.offset.toString(16)}`);
    }
    const { chronology, byName, hitCount, captureErrorClass } = verifyNativeCapture(native,
      mapEvidence.function, archivedReadyHeaderHex);
    observerProof = {
      metadata: record(metadataPath),
      readyPrefixSha256: sha256(prefixBytes),
      report: record(nativePath),
      outcome: native.outcome,
      captureError: native.capture.captureError,
      captureErrorClass,
      attached: native.capture.attached,
      breakpointsArmed: native.capture.breakpointsArmed,
      captureReleased: native.capture.captureReleased,
      ownerThreadId: native.capture.ownerThreadId,
      chronology,
      sites: byName,
      debugRegistersRestored: native.capture.debugRegistersRestored,
      detached: native.capture.detached,
      targetExited: native.capture.debugSessionEndedByTargetExit,
    };
  }
  return {
    row: {
      role: run.role, runId: run.runId, path: run.root, complete: summary.complete,
      mode: summary.mode, smallImage: summary.smallImage, summary: record(summaryPath),
      installerSha256: summary.installerSha256, registryPatchSha256: summary.registryPatchSha256,
      licensePatchSha256: summary.licensePatchSha256, runnerSha256: summary.runnerSha256,
      runtime, aa0Header: { width: Number(header[1]), height: Number(header[2]), thirdValue: Number(header[3]) },
      artifacts: artifactsInTriplet, stagedSources: sources,
      planningTrace: record(tracePath), planningTraceExplicitlyUnwrapsFreePath: traceText.includes('UNWRAPPED-TARGETS ("FREE-PATH")'),
      requiredProbeSha256: summary.preSceneProbeSha256 ?? null, observerProof,
    },
    paths: { root, artifacts: Object.fromEntries(ARTIFACTS.map(name => [name, resolve(root, 'capture', name)])),
      sources: Object.fromEntries(Object.keys(SOURCE_PATHS).map(name => [name, resolve(root, 'capture', name)])),
      trace: tracePath },
  };
}

function derive(comparisonPath, outputPath) {
  const comparisonBytes = read(comparisonPath);
  const comparison = parseJson(comparisonBytes);
  assert(comparison.schemaVersion === 1 && comparison.mode === MODE && Array.isArray(comparison.runs)
    && comparison.runs.length === 3,
  'Input is not a version 1 FREE-PATH call-site before/observer/after triplet');
  assert(typeof comparison.tripletId === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(comparison.tripletId),
  'Triplet identity is not a safe bounded identifier');
  assert(comparison.checks?.allRunsComplete && comparison.checks?.observerReadyEndSourceBound
    && comparison.checks?.artifactsMatch && comparison.checks?.sixStagedSourcesMatch
    && comparison.checks?.bracketPlanningTracesMatch,
  'Triplet capture helper did not attest all source-bound control checks');
  const expectedRoles = ['before', 'observer', 'after'];
  const canonicalRunRoots = new Set();
  for (let index = 0; index < expectedRoles.length; index += 1) {
    const run = comparison.runs[index];
    const role = expectedRoles[index];
    const expectedRunId = `${comparison.tripletId}-${role}`;
    assert(run.role === role && run.runId === expectedRunId,
      'Triplet roles or exact `${tripletId}-${role}` run IDs are reordered or duplicated');
    assert(typeof run.root === 'string' && run.root.length > 0,
      `${role}: output root is missing`);
    const lexicalRoot = resolve(ROOT, run.root);
    assert(withinRoot(lexicalRoot) && existsSync(lexicalRoot)
      && basename(lexicalRoot) === expectedRunId,
    `${role}: output root is not the canonical root named by its run ID`);
    const canonicalRoot = realpathSync(lexicalRoot);
    const canonicalKey = canonicalRoot.toLowerCase();
    assert(!canonicalRunRoots.has(canonicalKey),
      'Triplet runs do not resolve to three distinct canonical output roots');
    canonicalRunRoots.add(canonicalKey);
  }
  const manifest = readJson(repoPath(MANIFEST));
  const runnerHash = sha256(read(repoPath(RUNNER)));
  const probeHash = sha256(read(repoPath(PROBE)));
  const captureHelperHash = sha256(read(repoPath(CAPTURE_HELPER)));
  const tripletHelperHash = sha256(read(repoPath(TRIPLET_HELPER)));
  const debuggerHash = sha256(read(repoPath(DEBUGGER_HELPER)));
  const tripletHelperSourceBound = comparison.tripletHelperSha256 === tripletHelperHash;
  assert(comparison.tripletHelperSha256 === undefined || tripletHelperSourceBound,
    'Triplet coordinator helper hash differs from the captured source');
  assert(comparison.runnerSha256 === runnerHash && comparison.probeSha256 === probeHash
    && comparison.captureHelperSha256 === captureHelperHash && comparison.debuggerHelperSha256 === debuggerHash,
  'Triplet input/helper hashes differ from current checked-in sources');
  const preflight = comparison.powershellPreflight;
  assert(preflight && typeof preflight.reportPath === 'string'
    && /^[0-9a-f]{64}$/u.test(preflight.reportSha256),
  'Triplet lacks its source-hashed Windows PowerShell child preflight');
  const preflightPath = repoPath(preflight.reportPath);
  const diagnosticsRoot = repoPath(comparison.diagnosticsPath);
  const expectedPreflightPath = resolve(diagnosticsRoot, 'windows-powershell-preflight.json');
  assert(withinRoot(preflightPath)
    && preflightPath === expectedPreflightPath
    && existsSync(diagnosticsRoot)
    && relative(realpathSync(diagnosticsRoot), realpathSync(preflightPath)) === 'windows-powershell-preflight.json',
  'Windows PowerShell preflight report is outside the triplet diagnostics root');
  const preflightBytes = read(preflightPath);
  assert(sha256(preflightBytes) === preflight.reportSha256,
    'Windows PowerShell preflight report hash does not match its saved bytes');
  const preflightReport = parseJson(preflightBytes);
  assert(preflight.result && preflightReport.schemaVersion === 1
    && preflightReport.status === 'ok' && preflightReport.preflightOnly === true
    && preflightReport.runId === `${comparison.tripletId}-preflight`
    && preflightReport.runnerSha256 === runnerHash
    && preflightReport.getFileHashCommand === 'Get-FileHash'
    && /^5\./u.test(preflightReport.powershellVersion)
    && preflightReport.is64BitProcess === true
    && typeof preflightReport.utilityModulePath === 'string'
    && /Microsoft\.PowerShell\.Utility\.psd1$/u.test(preflightReport.utilityModulePath)
    && /^[0-9a-f]{64}$/u.test(preflightReport.utilityModuleSha256),
  'Windows PowerShell preflight does not prove the exact 64-bit runner/module setup');
  assert(preflight.result.schemaVersion === preflightReport.schemaVersion
    && preflight.result.status === preflightReport.status
    && preflight.result.preflightOnly === preflightReport.preflightOnly
    && preflight.result.runId === preflightReport.runId
    && preflight.result.runnerSha256 === preflightReport.runnerSha256
    && preflight.result.getFileHashCommand === preflightReport.getFileHashCommand
    && preflight.result.powershellVersion === preflightReport.powershellVersion
    && preflight.result.is64BitProcess === preflightReport.is64BitProcess
    && preflight.result.utilityModulePath === preflightReport.utilityModulePath
    && preflight.result.utilityModuleSha256 === preflightReport.utilityModuleSha256,
  'Comparison preflight result differs from the saved source-hashed report');
  const mapPath = comparison.mapPath.startsWith('\\') || /^[A-Za-z]:\\/u.test(comparison.mapPath)
    ? resolve(comparison.mapPath) : repoPath(comparison.mapPath);
  assert(withinRoot(mapPath), 'Native map path escapes the workspace');
  const mapEvidence = verifyMap(mapPath, comparison.mapSha256);
  const staticRefs = verifyStaticReferences();
  const runs = comparison.runs.map((run, index) => verifyRun(run, manifest, runnerHash, probeHash, index === 1, mapEvidence));
  const before = runs[0]; const observer = runs[1]; const after = runs[2];
  assert(before.row.aa0Header.width === observer.row.aa0Header.width
    && before.row.aa0Header.height === observer.row.aa0Header.height
    && before.row.aa0Header.thirdValue === observer.row.aa0Header.thirdValue
    && before.row.aa0Header.width === after.row.aa0Header.width
    && before.row.aa0Header.height === after.row.aa0Header.height
    && before.row.aa0Header.thirdValue === after.row.aa0Header.thirdValue,
  'AA0 dimensions/header differ across the fresh triplet');
  for (const artifact of ARTIFACTS) {
    const left = before.paths.artifacts[artifact];
    assert(equalFiles(left, observer.paths.artifacts[artifact]) && equalFiles(left, after.paths.artifacts[artifact]),
      `Drawing/scene artifact differs across the fresh controls: ${artifact}`);
  }
  for (const sourceName of Object.keys(SOURCE_PATHS)) {
    const left = before.paths.sources[sourceName];
    assert(equalFiles(left, observer.paths.sources[sourceName]) && equalFiles(left, after.paths.sources[sourceName]),
      `Staged source differs across triplet: ${sourceName}`);
  }
  assert(equalFiles(before.paths.trace, after.paths.trace), 'Fresh uninstrumented bracketing planning traces differ');
  assert(observer.row.planningTrace.sha256 !== before.row.planningTrace.sha256
    && observer.row.planningTrace.sha256 !== after.row.planningTrace.sha256,
  'Observer trace does not show its declared FREE-PATH-unwrapped diagnostic difference');
  const output = {
    schemaVersion: 1,
    kind: 'bounded-free-path-native-callsite-capture',
    tripletId: comparison.tripletId,
    mode: MODE,
    scope: 'One source-bound writer-stream-seed-1234 before/observer/after triplet. First hit per selected native site only; no general call graph or stop-rule claim.',
    sources: {
      comparison: { path: rel(comparisonPath), bytes: comparisonBytes.length, sha256: sha256(comparisonBytes) },
      runner: record(repoPath(RUNNER)), probe: record(repoPath(PROBE)),
      captureHelper: record(repoPath(CAPTURE_HELPER)),
      tripletHelper: {
        ...record(repoPath(TRIPLET_HELPER)),
        recordedSha256: comparison.tripletHelperSha256 ?? null,
        boundToTripletComparison: tripletHelperSourceBound,
      },
      debuggerHelper: record(repoPath(DEBUGGER_HELPER)), map: mapEvidence,
      powershellPreflight: { report: record(preflightPath), ...preflightReport },
      reaStaticReferences: staticRefs,
    },
    staticFindings: {
      syntheticPeSha256: SYNTHETIC_PE_SHA,
      payloadSha256: PAYLOAD_SHA,
      callSites: mapEvidence.instructions,
      valueFlow: 'The pinned complete REA value trace has 623 nodes, 552 edges, and 81 unknown call targets. The CALLIND result at +0x39a flows from EAX into the compare and conditional branch at +0x3ac; the +0x3e4 CALLIND has no modeled output. Computed callee/caller and Lisp-level meaning remain unresolved.',
      branchLimit: 'Record captured EFLAGS at +0x3ac and independently report whether +0x3e4 was hit. No branch step-over, same-invocation association, or causal claim is made.',
    },
    runs: runs.map(run => run.row),
    result: observer.row.observerProof,
    controls: {
      allRunnerSummariesComplete: true,
      fullSourceBoundObserverReadyCompleteEnd: true,
      freshUninstrumentedBeforeAfterControls: true,
      fiveDrawingAndSceneArtifactsMatchByteForByte: true,
      sixStagedSourcesMatchCurrentFilesAndEachOther: true,
      beforeAfterPlanningTracesMatchByteForByte: true,
      dimensionsReadFromAa0Header: before.row.aa0Header,
    },
    limitations: [
      'Only the first hit at each selected address during one bounded seeded run is captured; each site is disabled after that hit.',
      'After the first native hit, other threads are restored and excluded; no claim is made for their calls.',
      'At +0x39a and +0x3e4, [EDI+0x27] is a four-byte raw read. It is not interpreted as a resolved function, source name, or ABI.',
      'The +0x3ac flag-derived JG condition and a later +0x3e4 hit are separate observations. The capture does not single-step or prove they belong to the same invocation.',
      'Static REA/Ghidra reports use the generated synthetic PE container; it is not an original runtime image and was not executed.',
      ...(tripletHelperSourceBound ? [] : ['This saved legacy comparison does not contain the triplet-helper source hash; the current helper hash is recorded at derivation time only.']),
      'This is one bounded call-site capture and does not establish a general FREE-PATH stop rule, complete caller graph, or whole-painting parity.',
    ],
  };
  const outputResolved = resolve(outputPath);
  assert(withinRoot(outputResolved), 'Evidence output path must remain in the repository');
  assert(!existsSync(outputResolved), 'Evidence output already exists; choose a fresh path');
  writeFileSync(outputResolved, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx' });
  return { output: rel(outputResolved), sha256: sha256(read(outputResolved)), runs: runs.map(run => run.row.runId), outcome: observer.row.observerProof.outcome };
}

function main(args) {
  assert(args.length === 2,
    'Usage: node derive-free-path-callsite-v1-evidence.mjs <triplet-comparison.json> <fresh-output.json>');
  const comparisonPath = resolve(args[0]);
  const outputPath = resolve(args[1]);
  assert(withinRoot(comparisonPath) && withinRoot(outputPath), 'Input/output paths must remain within this repository');
  return derive(comparisonPath, outputPath);
}

try {
  process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
