#!/usr/bin/env node

// Derive a conditional JC prediction from accepted PREMIUM capture snapshots.
// REA supplies static instruction/xref evidence; the branch itself is not traced.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_PATHS = [
  'research/introspection/evidence/premium-internal-transfer-triplet-v3-20261015.json',
  'research/introspection/evidence/premium-internal-transfer-repeat-20261015.json',
  'research/introspection/evidence/premium-internal-transfer-seed5678-20261015.json',
];
const REA_REPORT = 'research/artifacts/rea-tools/premium-backedge-xrefs-20261015-6805e58/premium-backedge-xrefs.json';
const REA_INVOCATION = 'research/artifacts/rea-tools/premium-backedge-xrefs-20261015-6805e58/rea-invocation.json';
const BRANCH_SNAPSHOT = 'research/introspection/evidence/premium-callsite-branch-snapshot-20261015.json';
const SYNTHETIC_PE = 'research/artifacts/rea-tools/premium-callsite-wide-window-v2-20261014-e-b228b66c/premium-callsite-wide-window-v2.synthetic.exe';
const OUTPUT = 'research/introspection/evidence/premium-loop-backedge-prediction-20261015.json';
const BEGIN = 'BEGIN premium-internal-transfer-breakpoint-v2';
const END = 'END premium-internal-transfer-breakpoint-v2';
const PROFILE = [
  [0x17, 'ff975f030000'], [0x80, 'b102'], [0x82, '83e17f'], [0x85, '8b7315'],
  [0x88, '894df0'], [0x8b, '39679b'], [0x8e, '7209'], [0x90, 'eb85'],
  [0x99, '89442404'], [0x9d, '89542408'], [0xa1, 'ff6612'],
];
const HEX64 = /^[0-9a-f]{64}$/u;

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function insideRepo(path) {
  const full = resolve(REPO, path);
  const rel = relative(REPO, full);
  assert(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `path escapes repository: ${path}`);
  return full;
}
function jsonFile(path) {
  const full = insideRepo(path);
  const bytes = readFileSync(full);
  return { path: relative(REPO, full).split(sep).join('/'), bytes, sha256: sha(bytes), value: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, '')) };
}
function parseEnvelope(bytes, path) {
  const lines = bytes.toString('utf8').replace(/\r\n/gu, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  assert(lines[0] === BEGIN && lines.at(-1) === END && lines.filter(line => line === END).length === 1,
    `${path}: debugger capture envelope is incomplete or duplicated`);
  return JSON.parse(lines.slice(1, -1).join('\n'));
}
function hex32(text, label) {
  assert(typeof text === 'string' && /^0x[0-9a-f]{8}$/iu.test(text), `${label}: malformed 32-bit value`);
  return BigInt(text);
}
function printable(value) { return `0x${value.toString(16).padStart(8, '0')}`; }

function deriveCapture(evidencePath) {
  const evidenceFile = jsonFile(evidencePath);
  const evidence = evidenceFile.value;
  assert(typeof evidence.status === 'string' && evidence.status.startsWith('accepted-complete'),
    `${evidencePath}: capture is not accepted complete evidence`);
  const triplet = evidence.triplet;
  assert(triplet && triplet.canvas === '768 1080 148' && triplet.controlsMatch === true &&
    triplet.beforeAfterPlanningTraceMatch === true && Array.isArray(triplet.roles) && triplet.roles.length === 3 &&
    triplet.roles.every(run => run.complete === true), `${evidencePath}: source-bound controls/completion gate failed`);

  const reportPath = evidence.nativeCapture?.reportPath ?? evidence.provenance?.captureReport?.path;
  const reportExpectedSha = evidence.nativeCapture?.reportSha256 ?? evidence.provenance?.captureReport?.sha256;
  assert(typeof reportPath === 'string' && typeof reportExpectedSha === 'string' && HEX64.test(reportExpectedSha),
    `${evidencePath}: missing captured debugger report binding`);
  const reportFull = insideRepo(reportPath);
  const reportBytes = readFileSync(reportFull);
  const reportSha = sha(reportBytes);
  assert(reportSha === reportExpectedSha, `${evidencePath}: debugger report hash mismatch`);
  const report = parseEnvelope(reportBytes, reportPath);
  const debuggerRecord = report.debugger;
  assert(debuggerRecord?.attached === true && debuggerRecord.attachSucceeded === true && debuggerRecord.detached === true &&
    debuggerRecord.debugRegistersRestored === true && debuggerRecord.captureCompleted === true &&
    Array.isArray(debuggerRecord.cleanupErrors) && debuggerRecord.cleanupErrors.length === 0,
  `${evidencePath}: debugger lifecycle/cleanup gate failed`);

  const window = debuggerRecord.targetWindow;
  assert(window?.windowStartAddress === '0x0000000020000903' && window.bytesRead === 256 &&
    typeof window.bytesHex === 'string' && /^[0-9a-f]{512}$/iu.test(window.bytesHex) &&
    window.validationPassed === true && window.instructionProfileMatches === true,
  `${evidencePath}: captured target window/profile gate failed`);
  const windowBytes = Buffer.from(window.bytesHex, 'hex');
  assert(sha(windowBytes) === window.bytesSha256, `${evidencePath}: target-window hash mismatch`);
  assert(Array.isArray(window.profileRecords) && window.profileRecords.length === PROFILE.length,
    `${evidencePath}: REA instruction profile is incomplete`);
  for (let i = 0; i < PROFILE.length; i += 1) {
    const [offset, expected] = PROFILE[i];
    const actual = windowBytes.subarray(offset, offset + expected.length / 2).toString('hex');
    const record = window.profileRecords[i];
    assert(actual === expected && record.offset === offset && record.bytesHex === expected && record.matched === true,
      `${evidencePath}: instruction profile mismatch at +0x${offset.toString(16)}`);
  }

  const outer = debuggerRecord.events.find(event => event.kind === 'destination-hit' && event.site === 'PREMIUM-outer-destination');
  assert(outer?.eip === '0x20000983' && outer.registers?.threadId === outer.threadId,
    `${evidencePath}: missing source-bound outer destination state`);
  const edi = hex32(outer.registers.edi, 'EDI');
  const esp = hex32(outer.registers.esp, 'ESP');
  const ebp = hex32(outer.registers.ebp, 'EBP');
  const windowBase = 0x20000903n;
  const compareAddress = edi - 0x65n;
  const storeAddress = ebp - 0x10n;
  const compareOffset = Number(compareAddress - windowBase);
  assert(compareOffset >= 0 && compareOffset + 4 <= windowBytes.length,
    `${evidencePath}: CMP operand is outside the captured window`);
  const compareBytes = windowBytes.subarray(compareOffset, compareOffset + 4);
  const compareValue = BigInt(compareBytes.readUInt32LE(0));

  const callSite = debuggerRecord.sites.find(site => site.name === 'CALL-EDI+35F');
  const jumpSite = debuggerRecord.sites.find(site => site.name === 'JMP-ESI+12');
  const branchWasObserved = debuggerRecord.events.some(event => event.eip === '0x20000991' || event.site === 'PREMIUM-JC-STACK-COMPARE');
  assert(callSite?.hitCount === 0 && callSite.destinationHitCount === 0 && jumpSite?.hitCount === 1 &&
    jumpSite.destinationHitCount === 1 && !branchWasObserved,
  `${evidencePath}: observed edge counts differ or branch was unexpectedly marked observed`);
  const tailSource = debuggerRecord.events.find(event => event.kind === 'source-hit' && event.site === 'JMP-ESI+12');
  const tailDestination = debuggerRecord.events.find(event => event.kind === 'destination-hit' && event.site === 'JMP-ESI+12');
  assert(tailSource && tailDestination && tailSource.threadId === outer.threadId && tailDestination.threadId === outer.threadId,
    `${evidencePath}: tail edge does not match the selected thread`);

  return {
    evidence: { path: evidenceFile.path, sha256: evidenceFile.sha256, tripletId: triplet.id, mode: triplet.mode, canvas: triplet.canvas },
    captureReport: { path: relative(REPO, reportFull).split(sep).join('/'), sha256: reportSha, threadId: outer.threadId },
    state: {
      eip: outer.eip,
      edi: printable(edi),
      esp: printable(esp),
      ebp: printable(ebp),
      compareAddress: printable(compareAddress),
      compareBytesHex: compareBytes.toString('hex'),
      compareValue: printable(compareValue),
      cmpStoreAddress: printable(storeAddress),
      cmpStoreAliasesCompare: storeAddress === compareAddress,
      unsignedLessThan: compareValue < esp,
      predictedCarry: compareValue < esp,
      predictedJcTaken: compareValue < esp,
      branchOutcomeObserved: false,
      innerCallHitCount: callSite.hitCount,
      tailJumpHitCount: jumpSite.hitCount,
    },
  };
}

function main() {
  const reaReport = jsonFile(REA_REPORT);
  const reaInvocation = jsonFile(REA_INVOCATION);
  const branchSnapshot = jsonFile(BRANCH_SNAPSHOT);
  const syntheticPe = readFileSync(insideRepo(SYNTHETIC_PE));
  const query = reaReport.value;
  const peSha = sha(syntheticPe);
  assert(query.operation === 'xrefs' && query.parameters?.address === '0x10001017' &&
    query.subject?.digest?.sha256 === peSha && branchSnapshot.value.staticAnalysis?.syntheticPeSha256 === peSha &&
    Array.isArray(query.raw_result) && query.raw_result.length === 1 && query.raw_result[0] === '0x10001090',
  'REA xrefs result is not bound to the expected synthetic PE/backedge query');
  assert(reaInvocation.value.input?.sha256 === peSha || reaInvocation.value.inputHash === peSha,
    'REA invocation does not bind the queried synthetic PE hash');

  const captures = EVIDENCE_PATHS.map(deriveCapture);
  assert(captures.every(row => row.state.predictedJcTaken === true),
    'captured scenes do not all predict the same JC outcome; review before deriving a combined result');
  const scriptPath = fileURLToPath(import.meta.url);
  const result = {
    schemaVersion: 1,
    status: 'source-bound-cross-capture-prediction; JC-outcome-not-observed',
    question: 'Does the captured stack comparison route around the +0x90 loop-backedge and its +0x17 CALL?',
    reaStaticEvidence: {
      provider: `${query.provider?.name} ${query.provider?.version}`,
      inputPe: SYNTHETIC_PE,
      inputPeSha256: peSha,
      query: 'xrefs 0x10001017',
      rawSources: query.raw_result,
      normalizedSources: query.normalized_result,
      sourceAddress: '0x10001090',
      runtimeWindowStart: '0x20000903',
      runtimeBackedgeOffset: '+0x90',
      runtimeCallOffset: '+0x17',
      queryReport: { path: reaReport.path, sha256: reaReport.sha256 },
      invocation: { path: reaInvocation.path, sha256: reaInvocation.sha256 },
      originalBranchOutcomeObserved: false,
    },
    instructionSemantics: {
      cmp: { offset: '+0x8b', bytesHex: '39679b', text: 'CMP dword ptr [EDI-0x65],ESP' },
      branch: { offset: '+0x8e', bytesHex: '7209', text: 'JC +0x99', condition: 'CF=1', takenTarget: '+0x99' },
      backedge: { offset: '+0x90', bytesHex: 'eb85', text: 'JMP +0x17' },
      interveningStore: { offset: '+0x88', bytesHex: '894df0', text: 'MOV [EBP-0x10],ECX' },
      capturedStates: captures,
    },
    interpretation: {
      predictedForAllThreeCapturedEntries: true,
      predictedRoute: 'JC +0x99; the +0x90 JMP back to +0x17 is skipped under this prediction',
      consistency: 'This prediction is consistent with the bounded zero-hit at CALL [EDI+0x35f] in these scenes.',
      assumptions: [
        'The captured dword and EDI/ESP values remain stable between the outer-destination breakpoint and CMP.',
        'The instruction sequence before CMP leaves EDI and ESP unchanged; the MOV [EBP-0x10],ECX destination was distinct from [EDI-0x65] in all three captures.',
      ],
      limitations: [
        'The JC instruction was not directly observed; the derived outcome remains a prediction from captured state and static instruction bytes.',
        'Selected hardware-breakpoint edges do not prove a continuous instruction path through CMP, JC, the backedge, or the tail jump.',
        'The compared dword meaning is unidentified; this does not name the anonymous block or the conditional CALL target.',
        'This adds no JavaScript behavior contract or painting parity.',
      ],
    },
    provenance: {
      branchSnapshot: { path: branchSnapshot.path, sha256: branchSnapshot.sha256 },
      derivationScript: relative(REPO, scriptPath).split(sep).join('/'),
      derivationScriptSha256: sha(readFileSync(scriptPath)),
    },
  };
  const output = insideRepo(OUTPUT);
  assert(!existsSync(output), `refusing to overwrite ${OUTPUT}`);
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(output, bytes, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ output: OUTPUT, sha256: sha(bytes), captures: captures.length, allPredictedJcTaken: true, branchObserved: false, reaBackedgeSources: query.raw_result }, null, 2)}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
