#!/usr/bin/env node

// Validate follow-up REA queries against the retained 32-byte destination
// window. This is offline; it launches no AARON runtime, debugger, or REA.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '../..');
const DEFAULT_OUTPUT = 'research/introspection/evidence/premium-callsite-destination-window-rea-20261014-v2.json';
const TOOL_ROOT = 'research/artifacts/rea-tools';
const PE_ROOT = `${TOOL_ROOT}/premium-callsite-window-pe-v1`;
const BASE_EVIDENCE = 'research/introspection/evidence/premium-callsite-destination-window-rea-20261014-v1.json';
const BINDING = `${PE_ROOT}/debugger-window.binding.json`;
const PE = `${PE_ROOT}/debugger-window.synthetic.exe`;
const TOOLCHAIN = `${TOOL_ROOT}/toolchain-current.json`;
const SEED_ROOT = `${TOOL_ROOT}/premium-callsite-window-seeds-v2`;
const DERIVER = 'research/tools/derive-premium-callsite-window-rea-followup-evidence.mjs';
const WRAPPER = 'research/tools/invoke-rea-ghidra-query.ps1';
const ANALYST_BASE = 0x10001000;
const WINDOW_BYTES = 32;
const HEX64 = /^[0-9a-f]{64}$/iu;
const ALIGNMENTS = Array.from({ length: 7 }, (_, index) => {
  const offset = 18 + index;
  const suffix = offset.toString(16).padStart(2, '0');
  return {
    offset,
    address: `0x${(ANALYST_BASE + offset).toString(16)}`,
    root: `${TOOL_ROOT}/premium-callsite-window-query-start-${suffix}-v1`,
    seed: `${SEED_ROOT}/seed-${suffix}.tsv`,
  };
});
const XREF = {
  address: '0x10001019',
  root: `${TOOL_ROOT}/premium-callsite-window-xrefs-target-v1`,
  seed: `${PE_ROOT}/debugger-window.seeds.tsv`,
};

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
function relativePath(root, full) { return relative(root, full).split(sep).join('/'); }
function checkHash(actual, expected, label) {
  assert(typeof expected === 'string' && HEX64.test(expected), `${label}: malformed SHA-256`);
  assert(actual === expected.toLowerCase(), `${label}: SHA-256 mismatch`);
}
function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, output: DEFAULT_OUTPUT, overwrite: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--repo-root') options.root = resolve(argv[++index] ?? '');
    else if (argv[index] === '--out') options.output = argv[++index] ?? '';
    else if (argv[index] === '--overwrite') options.overwrite = true;
    else if (argv[index] === '--help') {
      process.stdout.write('Usage: node research/tools/derive-premium-callsite-window-rea-followup-evidence.mjs [--repo-root PATH] [--out PATH] [--overwrite]\n');
      process.exit(0);
    } else fail(`Unknown argument: ${argv[index]}`);
  }
  assert(options.output, '--out must be a nonempty path');
  return options;
}

function checkInvocation(root, query, expectedOperation, peSha, toolchainSha) {
  const invocationPath = `${query.root}/rea-invocation.json`;
  const reportPath = `${query.root}/rea-result.json`;
  const invocationFile = json(root, invocationPath);
  const reportFile = json(root, reportPath);
  const seedFile = read(root, query.seed);
  const invocation = invocationFile.value;
  const report = reportFile.value;
  const label = query.address;

  assert(invocation.operation === expectedOperation && invocation.address === label,
    `${label}: unexpected REA invocation`);
  assert(invocation.provider === 'ghidra' && invocation.reaVersion === '6.4.0'
    && invocation.ghidraVersion === '12.1.4' && invocation.staticOnly === true
    && invocation.inputWasExecuted === false, `${label}: REA version or static-only marker differs`);
  assert(invocation.input.path === PE, `${label}: unexpected synthetic PE path`);
  checkHash(invocation.input.sha256, peSha, `${label} input PE`);
  checkHash(invocation.toolchain.sha256, toolchainSha, `${label} toolchain`);
  checkHash(invocation.seed.sha256, seedFile.sha256, `${label} seed`);
  checkHash(invocation.report.sha256, reportFile.sha256, `${label} report`);
  assert(invocation.report.bytes === reportFile.bytes.length, `${label}: report byte count differs`);
  checkHash(report.subject?.digest?.sha256, peSha, `${label} report subject`);
  assert(report.provider?.id === 'ghidra' && report.provider?.version === '12.1.4',
    `${label}: unexpected Ghidra report provider`);
  const seeds = report.analysis_profile?.parameters?.analysis_seeds?.entries;
  assert(seeds?.function === 0 && seeds.code === 1 && seeds.label === 0,
    `${label}: expected exactly one code seed and no function/name seeds`);
  assert((report.limitations ?? []).some(line => line.includes('0 functions created') && line.includes('1 code seeds decoded')),
    `${label}: Ghidra seed outcome is missing or created a function`);
  return { invocation, invocationFile, report, reportFile, seedFile, seeds };
}

function validateAlignment(root, query, windowBytes, peSha, toolchainSha, runtimeBase) {
  const files = checkInvocation(root, query, 'inspect-native-instruction', peSha, toolchainSha);
  const expectedSeed = `${query.address}\tcode`;
  assert(files.seedFile.text.trim() === expectedSeed, `${query.address}: seed is not the exact code-only row`);
  assert(files.report.operation === 'inspect_native_instruction'
    && files.report.parameters?.address === query.address, `${query.address}: report operation/address differs`);
  assert(JSON.stringify(canonical(files.report.raw_result)) === JSON.stringify(canonical(files.report.normalized_result)),
    `${query.address}: raw and normalized REA instruction records differ`);
  const result = files.report.normalized_result;
  assert(result?.status === 'decoded' && result.address === query.address,
    `${query.address}: instruction was not decoded at the selected byte start`);
  assert(Number.isInteger(result.length) && result.length > 0 && query.offset + result.length <= WINDOW_BYTES,
    `${query.address}: decoded instruction crosses the captured-byte boundary`);
  const expectedBytes = windowBytes.subarray(query.offset, query.offset + result.length).toString('hex');
  assert(result.bytes?.toLowerCase() === expectedBytes, `${query.address}: decoded bytes differ from captured window`);
  assert(result.mnemonic?.toUpperCase() !== 'CALL', `${query.address}: unexpected CALL in alternate-start query`);
  return {
    offset: query.offset,
    address: query.address,
    mappedRuntimeCandidate: `0x${(runtimeBase + query.offset).toString(16)}`,
    bytes: result.bytes.toLowerCase(),
    length: result.length,
    mnemonic: result.mnemonic,
    disassembly: result.raw_disassembly,
    interpretation: 'alternate byte-start decoding only; not an established instruction boundary or reachable path',
    sources: {
      seed: { path: relativePath(root, files.seedFile.full), sha256: files.seedFile.sha256, line: files.seedFile.text.trim() },
      invocation: { path: relativePath(root, files.invocationFile.full), sha256: files.invocationFile.sha256 },
      report: { path: relativePath(root, files.reportFile.full), sha256: files.reportFile.sha256, bytes: files.reportFile.bytes.length },
      inputPeSha256: peSha,
      functionSeedCount: files.seeds.function,
      codeSeedCount: files.seeds.code,
    },
  };
}

function validateXref(root, peSha, toolchainSha, runtimeBase) {
  const query = { ...XREF, address: XREF.address };
  const files = checkInvocation(root, query, 'xrefs', peSha, toolchainSha);
  const seedLines = files.seedFile.text.trim().split(/\r?\n/u);
  assert(seedLines.length === 1 && seedLines[0] === '0x10001000\tcode',
    'xrefs query seed is not the exact original window-base code seed');
  assert(files.report.operation === 'xrefs' && files.report.parameters?.address === XREF.address,
    'xrefs report operation/address differs');
  assert(JSON.stringify(canonical(files.report.raw_result)) === JSON.stringify(canonical(files.report.normalized_result)),
    'xrefs raw and normalized results differ');
  const incoming = files.report.normalized_result;
  assert(Array.isArray(incoming) && incoming.length === 1 && incoming[0] === '0x1000100e',
    'expected the sole in-window predecessor at offset +14');
  return {
    operation: 'xrefs',
    targetAddress: XREF.address,
    targetRuntimeCandidate: `0x${(runtimeBase + 25).toString(16)}`,
    sourceAddresses: incoming,
    sourceRuntimeCandidates: incoming.map(address => `0x${(runtimeBase + (Number.parseInt(address, 16) - ANALYST_BASE)).toString(16)}`),
    interpretation: 'static Ghidra reference only; the branch outcome was not observed at runtime',
    sources: {
      seed: { path: relativePath(root, files.seedFile.full), sha256: files.seedFile.sha256, lines: seedLines },
      invocation: { path: relativePath(root, files.invocationFile.full), sha256: files.invocationFile.sha256 },
      report: { path: relativePath(root, files.reportFile.full), sha256: files.reportFile.sha256, bytes: files.reportFile.bytes.length },
      inputPeSha256: peSha,
      functionSeedCount: files.seeds.function,
      codeSeedCount: files.seeds.code,
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = options.root;
  const baseFile = json(root, BASE_EVIDENCE);
  const base = baseFile.value;
  assert(base.schemaVersion === 1 && base.staticInput?.windowBytesSha256
    && base.reaSummary?.queryCount === 8 && base.reaSummary?.functionSeeds === 0,
  'base v1 REA evidence is missing or has a different scope');
  const bindingFile = json(root, BINDING);
  const binding = bindingFile.value;
  const peFile = read(root, PE);
  const toolchainFile = read(root, TOOLCHAIN);
  checkHash(peFile.sha256, base.staticInput.syntheticPe.sha256, 'base synthetic PE');
  checkHash(peFile.sha256, binding.generatedPe.sha256, 'generated PE binding');
  checkHash(sha(Buffer.from(binding.runtimeWindow.bytesHex, 'hex')), base.staticInput.windowBytesSha256, 'captured byte window');
  const windowBytes = Buffer.from(binding.runtimeWindow.bytesHex, 'hex');
  assert(windowBytes.length === WINDOW_BYTES, 'captured window is not exactly 32 bytes');
  const runtimeBase = Number.parseInt(binding.runtimeWindow.originalEip.slice(2), 16);
  const rows = ALIGNMENTS.map(query => validateAlignment(root, query, windowBytes, peFile.sha256, toolchainFile.sha256, runtimeBase));
  assert(rows.length === 7, 'expected every candidate byte start from +18 through +24');
  const xref = validateXref(root, peFile.sha256, toolchainFile.sha256, runtimeBase);

  const sourceBindings = [BASE_EVIDENCE, BINDING, PE, TOOLCHAIN, DERIVER, WRAPPER].map(path => {
    const file = read(root, path);
    return { path, bytes: file.bytes.length, sha256: file.sha256 };
  });
  const output = {
    schemaVersion: 1,
    investigation: 'PREMIUM anonymous CALL destination exact-window REA follow-up',
    status: 'alternate-byte-starts-decoded; no CALL identified; original transfer path unresolved',
    baseEvidence: { path: BASE_EVIDENCE, sha256: baseFile.sha256 },
    window: {
      runtimeBase: binding.runtimeWindow.originalEip.toLowerCase(),
      bytes: WINDOW_BYTES,
      bytesSha256: base.staticInput.windowBytesSha256,
      syntheticPe: { path: PE, sha256: peFile.sha256, wasExecuted: false },
      analystBase: `0x${ANALYST_BASE.toString(16)}`,
    },
    rea: { provider: 'REA 6.4.0 / Ghidra 12.1.4', staticOnly: true, functionSeeds: 0, alternateStartQueries: rows, branchXref: xref },
    derivationSources: sourceBindings,
    findings: [
      'The existing captured-window queries report a conditional branch from runtime candidate +14 to +25 and an unconditional jump from +16 to an address outside the 32-byte window.',
      'The seven extra code-only queries at byte starts +18 through +24 each decoded within the captured bytes and none reported a CALL. These are alternate alignments in bytes skipped by the sequential path, not evidence that each offset begins an instruction.',
      'REA xrefs for +25 returned the conditional branch at +14 as its sole source in the synthetic image. This is static reference evidence and does not establish the branch outcome or destination behavior.',
      'The alternate-start queries and xrefs query created no functions and supplied no function-name seed. No Lisp name, function boundary, ABI, or behavior contract is recovered.',
    ],
    limitations: [
      'Only the same 32 captured destination bytes were analyzed; there is still no byte evidence at the out-of-window jump target.',
      'The synthetic PE copies exact captured bytes but its image layout and addresses are analyst context; it was not executed.',
      'Alternate-start decodes are not control-flow evidence and may decode embedded data or operands.',
      'No branch was observed executing, and the intervening transfer from 0x20000983 to PICK remains untraced.',
    ],
  };
  const outputPath = resolve(root, options.output);
  assert(isWithin(root, outputPath), 'Output path must stay inside the repository');
  assert(options.overwrite || !existsSync(outputPath), `Refusing to overwrite ${options.output}`);
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: options.overwrite ? 'w' : 'wx' });
  process.stdout.write(`${JSON.stringify({ output: relativePath(root, outputPath), sha256: sha(Buffer.from(`${JSON.stringify(output, null, 2)}\n`)), alternateStartQueries: rows.length, xrefs: xref.sourceAddresses }, null, 2)}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; }
