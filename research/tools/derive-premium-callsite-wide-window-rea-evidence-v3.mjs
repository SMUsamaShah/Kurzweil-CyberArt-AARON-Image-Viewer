#!/usr/bin/env node

// Rebuild the static REA record for the captured PREMIUM destination window.
// This is offline: it does not launch AARON, a debugger, REA, or Ghidra.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CAPTURE_EVIDENCE = 'research/introspection/evidence/premium-callsite-wide-window-20261014-v3.json';
const PE_DIR = 'research/artifacts/rea-tools/premium-callsite-wide-window-v2-20261014-e-b228b66c';
const PE_PATH = `${PE_DIR}/premium-callsite-wide-window-v2.synthetic.exe`;
const BINDING_PATH = `${PE_DIR}/premium-callsite-wide-window-v2.binding.json`;
const WINDOW_SEED = `${PE_DIR}/premium-callsite-wide-window-v2.seeds.tsv`;
const TOOLCHAIN_PATH = 'research/artifacts/rea-tools/toolchain-current.json';
const ANALYST_BASE = 0x10001000n;
const HEX64 = /^[0-9a-f]{64}$/iu;
const QUERIES = [
  {
    id: 'branch-target-call',
    operation: 'inspect-native-instruction',
    address: '0x10001017',
    offset: 0x17,
    seed: `${PE_DIR}/seed-10001017.tsv`,
    output: 'research/artifacts/rea-tools/premium-callsite-wide-window-v2-20261014-e-rea-inspect-10001017',
    expected: { bytes: 'ff975f030000', mnemonic: 'CALL', disassembly: 'CALL dword ptr [EDI + 0x35f]', flowKind: 'call', computed: true },
  },
  {
    id: 'short-branch',
    operation: 'inspect-native-instruction',
    address: '0x10001090',
    offset: 0x90,
    seed: `${PE_DIR}/seed-10001090.tsv`,
    output: 'research/artifacts/rea-tools/premium-callsite-wide-window-v2-20261014-e-rea-inspect-10001090',
    expected: { bytes: 'eb85', mnemonic: 'JMP', disassembly: 'JMP 0x10001017', flowKind: 'call', computed: false },
  },
  {
    id: 'tail-dispatch',
    operation: 'inspect-native-instruction',
    address: '0x100010a1',
    offset: 0xa1,
    seed: `${PE_DIR}/seed-100010a1.tsv`,
    output: 'research/artifacts/rea-tools/premium-callsite-wide-window-v2-20261014-e-rea-inspect-100010a1',
    expected: { bytes: 'ff6612', mnemonic: 'JMP', disassembly: 'JMP dword ptr [ESI + 0x12]', flowKind: 'jump', computed: true },
  },
];
const CALL_RESOLUTION = {
  operation: 'resolve-native-call-targets',
  address: '0x10001017',
  output: 'research/artifacts/rea-tools/premium-callsite-wide-window-v2-20261014-e-rea-resolve-call-10001017',
};
const FUNCTION_DOSSIERS = [
  {
    address: '0x10001080',
    output: 'research/artifacts/rea-tools/premium-callsite-wide-window-v2-20261014-e-rea-function',
    reportName: 'premium-destination-window-v3-function.json',
  },
  {
    address: '0x10001017',
    output: 'research/artifacts/rea-tools/premium-callsite-wide-window-v2-20261014-e-rea-branch17',
    reportName: 'premium-destination-window-v3-branch17-function.json',
  },
];
const SOURCE_PATHS = [
  CAPTURE_EVIDENCE,
  BINDING_PATH,
  PE_PATH,
  WINDOW_SEED,
  TOOLCHAIN_PATH,
  'research/tools/prepare-premium-callsite-wide-window-pe-v2.mjs',
  'research/tools/invoke-rea-ghidra-query.ps1',
  'research/tools/derive-premium-callsite-wide-window-evidence-v2.mjs',
  'research/tools/derive-premium-callsite-wide-window-rea-evidence-v3.mjs',
];

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
function read(path) {
  const full = resolve(REPO, path);
  const bytes = readFileSync(full);
  return { full, bytes, text: bytes.toString('utf8'), sha256: sha(bytes) };
}
function readJson(path) {
  const file = read(path);
  try { return { ...file, value: JSON.parse(file.text.replace(/^\uFEFF/u, '')) }; }
  catch (error) { fail(`${path}: invalid JSON (${error.message})`); }
}
function relativePath(full) { return relative(REPO, full).split(sep).join('/'); }
function address(value, label) {
  assert(typeof value === 'string' && /^0x[0-9a-f]+$/iu.test(value), `${label}: expected a hex address`);
  return BigInt(value);
}
function checkHash(actual, expected, label) {
  assert(typeof expected === 'string' && HEX64.test(expected), `${label}: malformed SHA-256`);
  assert(actual === expected.toLowerCase(), `${label}: SHA-256 mismatch`);
}
function within(root, full) {
  const rel = relative(root, full);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function normalizeText(text) { return text.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n'); }
function parseArgs(argv) {
  const args = { out: 'research/introspection/evidence/premium-callsite-wide-window-rea-20261014-v3.json', overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = argv[++i] ?? '';
    else if (argv[i] === '--overwrite') args.overwrite = true;
    else if (argv[i] === '--help') {
      process.stdout.write('Usage: node research/tools/derive-premium-callsite-wide-window-rea-evidence-v3.mjs [--out PATH] [--overwrite]\n');
      process.exit(0);
    } else fail(`Unknown argument: ${argv[i]}`);
  }
  assert(args.out, '--out requires a path');
  const outFull = resolve(REPO, args.out);
  assert(within(REPO, outFull), 'output path must remain beneath the repository');
  args.outFull = outFull;
  return args;
}

function readInvocationAndReport(outputRoot, expectedOperation, expectedAddress, peHash, toolchainHash) {
  const invocationPath = `${outputRoot}/rea-invocation.json`;
  const invocationFile = readJson(invocationPath);
  const invocation = invocationFile.value;
  assert(invocation.operation === expectedOperation, `${invocationPath}: wrong operation`);
  assert(invocation.address === expectedAddress, `${invocationPath}: wrong address`);
  assert(invocation.provider === 'ghidra' && invocation.reaVersion === '6.4.0'
    && invocation.ghidraVersion === '12.1.4', `${invocationPath}: wrong REA/Ghidra version`);
  assert(invocation.staticOnly === true && invocation.inputWasExecuted === false,
    `${invocationPath}: static-only metadata missing`);
  assert(invocation.input?.path === PE_PATH, `${invocationPath}: wrong input path`);
  checkHash(invocation.input.sha256, peHash, `${invocationPath} input PE`);
  checkHash(invocation.toolchain?.sha256, toolchainHash, `${invocationPath} toolchain`);
  assert(invocation.toolchain.path === TOOLCHAIN_PATH, `${invocationPath}: wrong toolchain path`);

  const reportFull = resolve(REPO, outputRoot, invocation.report?.path ?? '');
  assert(within(resolve(REPO, outputRoot), reportFull), `${invocationPath}: report escapes its fresh output root`);
  const reportBytes = readFileSync(reportFull);
  const report = JSON.parse(reportBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const reportSha = sha(reportBytes);
  checkHash(invocation.report.sha256, reportSha, `${invocationPath} report`);
  assert(invocation.report.bytes === reportBytes.length, `${invocationPath}: report byte count differs`);
  const stderr = read(`${outputRoot}/rea-stderr.txt`);
  assert(stderr.bytes.length === 0, `${outputRoot}: REA stderr is not empty`);
  checkHash(invocation.stderr?.sha256, stderr.sha256, `${invocationPath} stderr`);
  assert(invocation.stderr.bytes === 0, `${invocationPath}: stderr byte count differs`);
  checkHash(report.subject?.digest?.sha256, peHash, `${outputRoot} report subject`);
  assert(report.provider?.id === 'ghidra' && report.provider.version === '12.1.4',
    `${outputRoot}: report provider mismatch`);
  assert(JSON.stringify(canonical(report.raw_result)) === JSON.stringify(canonical(report.normalized_result)),
    `${outputRoot}: raw and normalized results differ`);
  return { invocation, invocationFile, report, reportFull, reportBytes, reportSha, stderr };
}

function validateCodeSeed(path, addressText, invocation) {
  const file = read(path);
  const expected = `${addressText}\tcode\n`;
  assert(normalizeText(file.text) === expected, `${path}: seed is not exactly one matching code-only record`);
  checkHash(invocation.seed?.sha256, file.sha256, `${path} invocation seed`);
  assert(invocation.seed.path === path, `${path}: invocation seed path differs`);
  return { path, sha256: file.sha256, bytes: file.bytes.length, record: `${addressText}\tcode` };
}

function validateInstruction(spec, capturedBytes, runtimeStart, peHash, toolchainHash) {
  const files = readInvocationAndReport(spec.output, spec.operation, spec.address, peHash, toolchainHash);
  const seed = validateCodeSeed(spec.seed, spec.address, files.invocation);
  const result = files.report.normalized_result;
  assert(files.report.operation === 'inspect_native_instruction', `${spec.id}: wrong report operation`);
  assert(result.status === 'decoded' && result.address === spec.address, `${spec.id}: instruction not decoded`);
  assert(result.bytes?.toLowerCase() === spec.expected.bytes, `${spec.id}: report bytes differ from expected capture slice`);
  const offset = Number(address(spec.address, `${spec.id} address`) - ANALYST_BASE);
  assert(offset === spec.offset && offset >= 0 && offset + result.length <= capturedBytes.length,
    `${spec.id}: address falls outside the captured window`);
  assert(result.bytes.toLowerCase() === capturedBytes.subarray(offset, offset + result.length).toString('hex'),
    `${spec.id}: reported bytes do not match the captured runtime window`);
  assert(result.mnemonic === spec.expected.mnemonic && result.raw_disassembly === spec.expected.disassembly,
    `${spec.id}: instruction text differs from the reviewed result`);
  assert(result.flow?.kind === spec.expected.flowKind && result.flow.computed === spec.expected.computed,
    `${spec.id}: flow metadata differs from the reviewed result`);
  const profileSeeds = files.report.analysis_profile?.parameters?.analysis_seeds?.entries;
  assert(profileSeeds?.function === 0 && profileSeeds.code === 1 && profileSeeds.label === 0,
    `${spec.id}: analysis did not use exactly one code-only seed`);
  const references = result.references ?? [];
  if (spec.id === 'short-branch') {
    assert(result.flow.kind === 'call' && references.length === 1
      && references[0].type === 'UNCONDITIONAL_CALL' && references[0].target_address === '0x10001017',
    'short-branch: expected provider metadata conflict is absent');
  } else if (spec.id === 'branch-target-call') {
    assert(result.flow.kind === 'call' && result.flow.computed === true && references.length === 0,
      'branch-target-call: expected unresolved computed call metadata is absent');
  } else {
    assert(result.flow.kind === 'jump' && result.flow.computed === true && references.length === 0,
      'tail-dispatch: expected unresolved computed jump metadata is absent');
  }
  const runtimeAddress = runtimeStart + BigInt(offset);
  return {
    id: spec.id,
    operation: spec.operation,
    syntheticAddress: spec.address,
    capturedRuntimeAddress: `0x${runtimeAddress.toString(16)}`,
    capturedWindowOffset: offset,
    bytes: result.bytes.toLowerCase(),
    length: result.length,
    mnemonic: result.mnemonic,
    disassembly: result.raw_disassembly,
    flow: result.flow,
    references,
    source: {
      invocation: { path: relativePath(files.invocationFile.full), sha256: files.invocationFile.sha256 },
      report: { path: relativePath(files.reportFull), sha256: files.reportSha, bytes: files.reportBytes.length },
      stderr: { path: relativePath(files.stderr.full), sha256: files.stderr.sha256, bytes: 0 },
      seed,
      profileDigest: files.report.analysis_profile?.digest ?? null,
      provider: 'REA 6.4.0 / Ghidra 12.1.4',
    },
  };
}

function validateCallResolution(peHash, toolchainHash) {
  const files = readInvocationAndReport(CALL_RESOLUTION.output, CALL_RESOLUTION.operation,
    CALL_RESOLUTION.address, peHash, toolchainHash);
  const result = files.report.normalized_result;
  assert(files.report.operation === 'resolve_native_call_targets'
    && result.call_site === CALL_RESOLUTION.address
    && result.status === 'unresolved' && result.mechanism === 'computed'
    && Array.isArray(result.targets) && result.targets.length === 0,
  'Computed CALL resolution report is no longer the expected unresolved result');
  return {
    operation: CALL_RESOLUTION.operation,
    syntheticCallSite: result.call_site,
    status: result.status,
    mechanism: result.mechanism,
    targets: result.targets,
    limitations: result.limitations,
    source: {
      invocation: { path: relativePath(files.invocationFile.full), sha256: files.invocationFile.sha256 },
      report: { path: relativePath(files.reportFull), sha256: files.reportSha, bytes: files.reportBytes.length },
      stderr: { path: relativePath(files.stderr.full), sha256: files.stderr.sha256, bytes: 0 },
      profileDigest: files.report.analysis_profile?.digest ?? null,
    },
  };
}

function validateFunctionDossier(spec, peHash, toolchainHash) {
  const reportPath = `${spec.output}/${spec.reportName}`;
  const invocationFile = readJson(`${spec.output}/rea-invocation.json`);
  const invocation = invocationFile.value;
  assert(invocation.operation === 'function' && invocation.address === spec.address,
    `${spec.address}: wrong function query invocation`);
  assert(invocation.provider === 'ghidra' && invocation.reaVersion === '6.4.0'
    && invocation.ghidraVersion === '12.1.4' && invocation.staticOnly === true
    && invocation.inputWasExecuted === false, `${spec.address}: function query is not the expected static REA analysis`);
  assert(invocation.input.path === PE_PATH, `${spec.address}: wrong PE path`);
  checkHash(invocation.input.sha256, peHash, `${spec.address} function input PE`);
  checkHash(invocation.toolchain.sha256, toolchainHash, `${spec.address} function toolchain`);
  assert(invocation.report.path === spec.reportName, `${spec.address}: unexpected function report path`);
  const report = readJson(reportPath);
  checkHash(invocation.report.sha256, report.sha256, `${spec.address} function report`);
  assert(invocation.report.bytes === report.bytes.length, `${spec.address}: function report byte count mismatch`);
  checkHash(report.value.subject?.digest?.sha256, peHash, `${spec.address} function report subject`);
  const procedure = report.value.normalized_result?.procedure;
  assert(procedure?.address === spec.address && procedure.body?.available === true,
    `${spec.address}: function dossier entry differs`);
  return {
    address: procedure.address,
    ghidraName: procedure.name,
    body: procedure.body,
    report: { path: relativePath(report.full), sha256: report.sha256, bytes: report.bytes.length },
    source: { invocation: relativePath(invocationFile.full), sha256: invocationFile.sha256 },
    attribution: 'synthetic-image inference only; not an original AARON function boundary',
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assert(args.overwrite || !existsSync(args.outFull), `refusing to overwrite existing evidence: ${args.out}`);
  const capture = readJson(CAPTURE_EVIDENCE);
  assert(capture.value.schemaVersion === 2
    && capture.value.status === 'source-bound-wide-destination-captured'
    && capture.value.triplet?.controlsMatch === true
    && capture.value.triplet?.beforeAfterPlanningTraceMatch === true,
  'Source-bound triplet evidence is incomplete or controls do not match');
  const bindingFile = readJson(BINDING_PATH);
  const binding = bindingFile.value;
  const pe = read(PE_PATH);
  checkHash(pe.sha256, binding.generatedPe?.sha256, 'synthetic PE');
  assert(binding.generatedPe?.copiedBytes === 256 && binding.generatedPe?.onlyCapturedBytesMappedAsSectionContent === true,
    'Synthetic PE does not contain exactly the captured 256-byte window');
  const windowHex = capture.value.destinationWindow?.bytesHex?.toLowerCase();
  assert(typeof windowHex === 'string' && /^[0-9a-f]+$/u.test(windowHex), 'Captured window hex is malformed');
  const capturedBytes = Buffer.from(windowHex, 'hex');
  assert(capturedBytes.length === 256, 'Captured destination window is not exactly 256 bytes');
  checkHash(sha(capturedBytes), capture.value.destinationWindow.bytesSha256, 'captured destination window');
  assert(binding.runtimeWindow?.bytesHex?.toLowerCase() === windowHex
    && binding.runtimeWindow?.bytesSha256 === capture.value.destinationWindow.bytesSha256,
  'PE binding does not point to the selected source-bound capture window');
  const runtimeStart = address(capture.value.destinationWindow.windowStartAddress, 'runtime window start');
  const runtimeEip = address(capture.value.destinationWindow.address, 'runtime EIP');
  assert(runtimeEip - runtimeStart === BigInt(capture.value.destinationWindow.eipOffset),
    'Runtime EIP offset does not match the captured window');
  assert(binding.generatedPe.analystWindowAddress === `0x${ANALYST_BASE.toString(16)}`,
    'Unexpected analyst window base');
  const toolchain = readJson(TOOLCHAIN_PATH);
  const toolchainHash = toolchain.sha256;
  const instructions = QUERIES.map(query => validateInstruction(query, capturedBytes, runtimeStart, pe.sha256, toolchainHash));
  const callResolution = validateCallResolution(pe.sha256, toolchainHash);
  const functionDossiers = FUNCTION_DOSSIERS.map(query => validateFunctionDossier(query, pe.sha256, toolchainHash));
  const sourceBindings = SOURCE_PATHS.map(path => {
    const file = read(path);
    return { path: relativePath(file.full), sha256: file.sha256, bytes: file.bytes.length };
  });

  const output = {
    schemaVersion: 1,
    investigation: 'PREMIUM SELECT-SUBJECT destination-window exact REA instruction checks',
    status: 'captured-byte-static-checks-complete; computed transfers unresolved',
    originalRuntime: {
      sourceBoundTriplet: capture.value.triplet.id,
      controlsMatch: true,
      initialDestinationInstructionExecutedDuringCapture: false,
      branchExecutionObserved: false,
      directCpuEdgeToPick: false,
      callerFunctionRecovered: false,
      behaviorContractAdded: false,
    },
    sourceCapture: {
      evidence: { path: CAPTURE_EVIDENCE, sha256: capture.sha256 },
      tripletId: capture.value.triplet.id,
      runtimeEip: capture.value.destinationWindow.address,
      windowStart: capture.value.destinationWindow.windowStartAddress,
      windowEndExclusive: capture.value.destinationWindow.windowEndExclusive,
      bytes: capturedBytes.length,
      bytesSha256: capture.value.destinationWindow.bytesSha256,
    },
    analysisInput: {
      syntheticPe: { path: PE_PATH, sha256: pe.sha256, bytes: pe.bytes.length, executed: false },
      binding: { path: BINDING_PATH, sha256: bindingFile.sha256 },
      analystBase: `0x${ANALYST_BASE.toString(16)}`,
      toolchain: { path: TOOLCHAIN_PATH, sha256: toolchainHash, reaVersion: '6.4.0', ghidraVersion: '12.1.4' },
    },
    instructions,
    callResolution,
    functionDossiers,
    interpretation: {
      directBranch: 'Captured bytes at runtime offset +0x90 decode as JMP rel8 to offset +0x17. Ghidra flow/reference metadata labels this terminal JMP as a call; the evidence preserves the conflict rather than treating the reference type as authoritative.',
      branchTarget: 'The captured bytes at runtime offset +0x17 decode as CALL dword ptr [EDI+0x35f]. REA call-target resolution reports an unresolved computed call with no targets.',
      terminalTransfer: 'Captured bytes at runtime offset +0xa1 decode as JMP dword ptr [ESI+0x12], classified as a computed jump with no references.',
      scope: 'These are static observations on an analyst-generated PE containing the exact captured bytes. The synthetic Ghidra function names and boundaries are not original AARON names or boundaries. No intervening runtime instruction trace establishes whether these branches execute or where either computed transfer lands.',
    },
    limitations: [
      'The source capture stops before the destination instruction executes; the 256-byte range is a single read from one source-bound observer run.',
      'The initial branch decision, register roles, runtime call target at [EDI+0x35f], and computed jump target at [ESI+0x12] are unresolved.',
      'The direct JMP target is a static address inside the synthetic image; matching captured bytes establishes only the bounded byte mapping, not a general AARON code boundary.',
      'Ghidra reports CALL_TERMINATOR and UNCONDITIONAL_CALL metadata for bytes decoded as JMP at 0x10001090; this is an explicit provider conflict.',
      'No direct edge to PICK, Lisp function name, calling convention, general caller relation, or JavaScript behavior contract is established.',
    ],
    sourceBindings,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  writeFileSync(args.outFull, serialized, { flag: args.overwrite ? 'w' : 'wx' });
  process.stdout.write(JSON.stringify({
    output: args.out,
    sha256: sha(Buffer.from(serialized)),
    status: output.status,
    tripletId: capture.value.triplet.id,
    staticInstructionCount: instructions.length,
    resolvedComputedTargets: callResolution.targets.length,
    directCpuEdgeToPick: false,
    behaviorContractAdded: false,
  }, null, 2) + '\n');
}

main();
