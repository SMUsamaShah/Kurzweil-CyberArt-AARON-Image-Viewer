#!/usr/bin/env node

// Rebuild a compact static REA record from the preserved, rejected PREMIUM
// callsite diagnostics. This never launches AARON, REA, Ghidra, or a debugger.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '../..');
const DEFAULT_OUTPUT = 'research/introspection/evidence/premium-callsite-destination-window-rea-20261014-v1.json';
const TOOL_ROOT = 'research/artifacts/rea-tools';
const PE_ROOT = `${TOOL_ROOT}/premium-callsite-window-pe-v1`;
const BINDING_PATH = `${PE_ROOT}/debugger-window.binding.json`;
const PE_PATH = `${PE_ROOT}/debugger-window.synthetic.exe`;
const STAGED_DIAGNOSTIC = 'research/artifacts/rea-tools/premium-callsite-window-source-v1/debugger-capture-diagnostic.json';
const DERIVER_PATH = 'research/tools/derive-premium-callsite-window-rea-evidence.mjs';
const SOURCE_BINDING_PATHS = [
  DERIVER_PATH,
  'research/tools/prepare-debugger-window-pe.mjs',
  'research/tools/invoke-rea-ghidra-query.ps1',
  'research/native-analysis-workflow.md',
  'research/oracle/AaronPremiumCallsiteStepV1.cs',
];
const ANALYST_BASE = 0x10001000;
const WINDOW_SIZE = 32;
const HEX64 = /^[0-9a-f]{64}$/u;

const DIAGNOSTICS = [
  'research/extracted/local-oracle/external-runs/premium-callsite-triplet-v1-20261014-113903-579e54ff-observer/native-code/debugger-capture-diagnostic.json',
  'research/extracted/local-oracle/external-runs/premium-callsite-triplet-v1-20261014-114556-77d0e6c5-observer/native-code/debugger-capture-diagnostic.json',
];

const QUERIES = [
  { offset: 0, address: '0x10001000', root: `${TOOL_ROOT}/premium-callsite-window-query-v2`, seed: `${PE_ROOT}/debugger-window.seeds.tsv` },
  { offset: 2, address: '0x10001002', root: `${TOOL_ROOT}/premium-callsite-window-query-v3`, seed: `${PE_ROOT}/debugger-window-seed-02.tsv` },
  { offset: 5, address: '0x10001005', root: `${TOOL_ROOT}/premium-callsite-window-query-offset-05`, seed: `${PE_ROOT}/debugger-window-seed-05.tsv` },
  { offset: 8, address: '0x10001008', root: `${TOOL_ROOT}/premium-callsite-window-query-offset-08`, seed: `${PE_ROOT}/debugger-window-seed-08.tsv` },
  { offset: 11, address: '0x1000100b', root: `${TOOL_ROOT}/premium-callsite-window-query-offset-0b`, seed: `${PE_ROOT}/debugger-window-seed-0b.tsv` },
  { offset: 14, address: '0x1000100e', root: `${TOOL_ROOT}/premium-callsite-window-query-offset-0e`, seed: `${PE_ROOT}/debugger-window-seed-0e.tsv` },
  { offset: 16, address: '0x10001010', root: `${TOOL_ROOT}/premium-callsite-window-query-offset-10`, seed: `${PE_ROOT}/debugger-window-seed-10.tsv` },
  { offset: 25, address: '0x10001019', root: `${TOOL_ROOT}/premium-callsite-window-query-offset-19`, seed: `${PE_ROOT}/debugger-window-seed-19.tsv` },
];

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function read(root, path) {
  const full = resolve(root, path);
  const bytes = readFileSync(full);
  return { bytes, full, sha256: sha(bytes), text: bytes.toString('utf8') };
}
function json(root, path) {
  const file = read(root, path);
  try { return { ...file, value: JSON.parse(file.text) }; }
  catch (error) { fail(`Invalid JSON ${path}: ${error.message}`); }
}
function relativePath(root, path) { return relative(root, resolve(root, path)).split(sep).join('/'); }
function checkHash(actual, expected, label) {
  assert(typeof expected === 'string' && HEX64.test(expected.toLowerCase()), `${label}: malformed SHA-256`);
  assert(actual === expected.toLowerCase(), `${label}: SHA-256 mismatch`);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
function numericHex(value, label) {
  assert(typeof value === 'string' && /^0x[0-9a-f]+$/iu.test(value), `${label}: expected a hexadecimal address`);
  return Number.parseInt(value.slice(2), 16);
}
function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, output: DEFAULT_OUTPUT, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--repo-root') options.root = resolve(argv[++i] ?? '');
    else if (argv[i] === '--out') options.output = argv[++i] ?? '';
    else if (argv[i] === '--overwrite') options.overwrite = true;
    else if (argv[i] === '--help') {
      process.stdout.write('Usage: node research/tools/derive-premium-callsite-window-rea-evidence.mjs [--repo-root PATH] [--out PATH] [--overwrite]\n');
      process.exit(0);
    } else fail(`Unknown argument: ${argv[i]}`);
  }
  assert(options.output, '--out requires a path');
  return options;
}

function validateDiagnostic(root, path) {
  const file = json(root, path);
  const diagnostic = file.value;
  const raw = diagnostic.rawDebuggerResult;
  const call = raw?.call;
  const step = raw?.singleStep;
  const window = step?.destinationWindow;
  assert(diagnostic.schemaVersion === 1 && raw?.schema === 'aaron-premium-callsite-step-v1', `${path}: unexpected diagnostic schema`);
  assert(call?.hit === true && call.bytesAtHitHex?.toLowerCase() === 'ff5727' && call.bytesAtHitMatched === true,
    `${path}: measured callsite is not the validated FF 57 27 instruction`);
  assert(step?.completed === false && step.dr6BsSet === false && step.firstChanceTrap === true,
    `${path}: diagnostic no longer represents the rejected DR6.BS gate`);
  assert(step.postStepEipEqualsPreCallSlotValue === true && step.espDecrementedByFour === true
    && step.returnAddressMatchesCallContinuation === true,
  `${path}: destination/stack diagnostics do not match the captured CALL effects`);
  assert(raw.callDebugRegistersRestoredBeforeStep === true && raw.debugRegistersAndTrapFlagRestored === true
    && raw.detached === true && raw.readyPauseReleased === true && (raw.cleanupErrors ?? []).length === 0,
  `${path}: debugger cleanup/release did not complete cleanly`);
  assert(call.threadId === step.postStepRegisters?.threadId, `${path}: call and destination thread IDs differ`);
  const callAddress = numericHex(call.preCallRegisters?.eip, `${path} call EIP`);
  const slotValue = numericHex(call.preCallDispatchSlot?.value, `${path} pre-call slot`);
  const destination = numericHex(step.postStepEip, `${path} post-step EIP`);
  const stackAddress = numericHex(step.returnAddressAtEsp?.value, `${path} stack return`);
  assert(callAddress === 0x1fe4c07c && slotValue === 0x20000983 && destination === slotValue,
    `${path}: numeric call-site destination differs`);
  assert(stackAddress === callAddress + 3, `${path}: saved return address is not callsite+3`);
  assert(window?.bytesRead === WINDOW_SIZE && window.requestedBytes === WINDOW_SIZE
    && window.eip?.toLowerCase() === step.postStepEip.toLowerCase()
    && /^[0-9a-f]{64}$/iu.test(window.bytesHex ?? ''),
  `${path}: destination window is not a complete 32-byte read`);
  return {
    file,
    diagnostic,
    callAddress,
    slotValue,
    destination,
    bytesHex: window.bytesHex.toLowerCase(),
    threadId: call.threadId,
    callSite: call,
    singleStep: step,
  };
}

function validateQuery(root, binding, windowBytes, query) {
  const invocationPath = `${query.root}/rea-invocation.json`;
  const reportPath = `${query.root}/rea-result.json`;
  const invocationFile = json(root, invocationPath);
  const reportFile = json(root, reportPath);
  const seedFile = read(root, query.seed);
  const invocation = invocationFile.value;
  const report = reportFile.value;
  const label = query.address;

  assert(invocation.operation === 'inspect-native-instruction' && invocation.address === label,
    `${label}: unexpected REA invocation`);
  assert(invocation.provider === 'ghidra' && invocation.reaVersion === '6.4.0' && invocation.ghidraVersion === '12.1.4',
    `${label}: unexpected REA/Ghidra version`);
  assert(invocation.staticOnly === true && invocation.inputWasExecuted === false, `${label}: static-only metadata missing`);
  assert(invocation.input.path === `${PE_ROOT}/debugger-window.synthetic.exe`, `${label}: unexpected input PE path`);
  checkHash(invocation.input.sha256, binding.generatedPe.sha256, `${label} invocation PE`);
  checkHash(invocation.seed.sha256, seedFile.sha256, `${label} invocation seed`);
  checkHash(invocation.report.sha256, reportFile.sha256, `${label} invocation report`);
  assert(invocation.report.bytes === reportFile.bytes.length, `${label}: report byte count mismatch`);
  assert(seedFile.text.trim() === `${label}\tcode`, `${label}: seed is not exactly one matching code-only record`);
  checkHash(report.subject?.digest?.sha256, binding.generatedPe.sha256, `${label} report subject`);
  assert(report.provider?.id === 'ghidra' && report.provider.version === '12.1.4'
    && report.operation === 'inspect_native_instruction', `${label}: report provider/operation mismatch`);
  assert(report.analysis_profile?.parameters?.language_id === 'x86:LE:32:default'
    && report.analysis_profile?.parameters?.compiler_spec_id === 'windows', `${label}: unexpected analysis language`);
  const seeds = report.analysis_profile?.parameters?.analysis_seeds?.entries;
  assert(seeds?.function === 0 && seeds.code === 1 && seeds.label === 0, `${label}: code seed counts differ`);
  assert(JSON.stringify(canonical(report.raw_result)) === JSON.stringify(canonical(report.normalized_result)),
    `${label}: raw/normalized REA results differ after key-order normalization`);
  const result = report.normalized_result;
  assert(result.status === 'decoded' && result.address === label, `${label}: instruction not decoded at requested address`);
  assert(result.procedure === '0x10001000', `${label}: unexpected analyst-window base in result`);
  assert(Number.isInteger(result.length) && result.length > 0 && query.offset + result.length <= WINDOW_SIZE,
    `${label}: decoded instruction crosses the 32-byte source boundary`);
  const expectedBytes = windowBytes.subarray(query.offset, query.offset + result.length).toString('hex');
  assert(result.bytes?.toLowerCase() === expectedBytes, `${label}: REA instruction bytes differ from the captured window`);
  const sources = report.limitations ?? [];
  assert(sources.some(line => line.includes('0 functions created') && line.includes('1 code seeds decoded')),
    `${label}: analysis does not confirm code-only seed without function creation`);

  const translatedReferences = (result.references ?? []).map(reference => {
    const staticTarget = reference.target_address;
    if (!/^0x[0-9a-f]+$/iu.test(staticTarget ?? '')) return { ...reference, translatedRuntimeCandidate: null };
    const target = numericHex(staticTarget, `${label} reference target`);
    const mappedOffset = target - ANALYST_BASE;
    return {
      ...reference,
      translatedRuntimeCandidate: `0x${(binding.runtimeWindow.originalEipNumber + mappedOffset).toString(16)}`,
      targetInsideCapturedWindow: mappedOffset >= 0 && mappedOffset < WINDOW_SIZE,
      branchExecutionObserved: false,
    };
  });

  return {
    query: { operation: invocation.operation, address: label, offsetFromRuntimeEntry: query.offset, provider: 'REA 6.4.0 / Ghidra 12.1.4' },
    source: {
      invocation: { path: relativePath(root, invocationPath), sha256: invocationFile.sha256 },
      report: { path: relativePath(root, reportPath), sha256: reportFile.sha256, bytes: reportFile.bytes.length },
      seed: { path: relativePath(root, query.seed), sha256: seedFile.sha256, line: seedFile.text.trim() },
      inputPeSha256: invocation.input.sha256,
      functionSeedCount: seeds.function,
      codeSeedCount: seeds.code,
    },
    instruction: {
      address: label,
      mappedRuntimeAddress: `0x${(binding.runtimeWindow.originalEipNumber + query.offset).toString(16)}`,
      bytes: result.bytes.toLowerCase(),
      length: result.length,
      mnemonic: result.mnemonic,
      disassembly: result.raw_disassembly,
      flow: result.flow,
      references: translatedReferences,
      procedureFieldIsAnalystQueryContextOnly: true,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root;
  const bindingFile = json(root, BINDING_PATH);
  const binding = bindingFile.value;
  const stagedDiagnosticFile = read(root, STAGED_DIAGNOSTIC);
  const sourceDiagnostic = json(root, STAGED_DIAGNOSTIC).value;
  checkHash(stagedDiagnosticFile.sha256, binding.sourceDiagnostic.sha256, 'Staged diagnostic binding');
  assert(binding.generatedPe?.copiedBytes === WINDOW_SIZE && binding.generatedSeed?.functionNameSeed === false,
    'Generated input is not the expected bounded code-only PE');
  const peFile = read(root, PE_PATH);
  checkHash(peFile.sha256, binding.generatedPe.sha256, 'Generated PE binding');
  const sourceWindow = binding.runtimeWindow;
  const windowBytes = Buffer.from(sourceWindow.bytesHex, 'hex');
  assert(windowBytes.length === WINDOW_SIZE && sha(windowBytes) === sourceWindow.bytesSha256,
    'Captured 32-byte window/hash mismatch');
  const runtimeEntry = numericHex(sourceWindow.originalEip, 'runtime window entry');
  binding.runtimeWindow.originalEipNumber = runtimeEntry;

  const observations = DIAGNOSTICS.map(path => validateDiagnostic(root, path));
  assert(observations[0].bytesHex === observations[1].bytesHex, 'Repeated diagnostic windows do not match');
  assert(observations[0].bytesHex === sourceWindow.bytesHex.toLowerCase(), 'Staged REA source does not match the repeated diagnostics');
  assert(observations[1].file.sha256 === stagedDiagnosticFile.sha256, 'Staged diagnostic is not the selected observer record');
  assert(sourceDiagnostic.runId === observations[1].diagnostic.runId, 'Staged diagnostic run identity mismatch');

  const rows = QUERIES.map(query => validateQuery(root, binding, windowBytes, query));
  assert(rows.length === 8, 'Expected exactly eight bounded instruction queries');
  const decodedCoveredBytes = rows.reduce((total, row) => total + row.instruction.length, 0);
  const sourceBindings = SOURCE_BINDING_PATHS.map(path => {
    const file = read(root, path);
    return { path: relativePath(root, file.full), sha256: file.sha256, bytes: file.bytes.length };
  });

  const output = {
    schemaVersion: 1,
    investigation: 'PREMIUM SELECT-SUBJECT CALL destination bounded REA instruction review',
    status: 'static-window-decoded; source debugger captures remain diagnostic-only',
    originalRuntime: {
      completeBeforeObserverAfterTriplet: false,
      afterControlCaptured: false,
      acceptedCallsiteGate: false,
      repeatedRawNumericDestinationObservationCount: observations.length,
      acceptedCalleeIdentity: false,
      sameThreadPickEntryCorrelation: false,
      behaviorContractAdded: false,
    },
    diagnostics: observations.map(item => ({
      path: relativePath(root, item.file.full),
      sha256: item.file.sha256,
      runId: item.diagnostic.runId,
      callSiteAddress: `0x${item.callAddress.toString(16)}`,
      callSiteBytes: item.callSite.bytesAtHitHex.toLowerCase(),
      preCallOperandValue: `0x${item.slotValue.toString(16)}`,
      postStepEip: `0x${item.destination.toString(16)}`,
      sameThreadId: item.threadId,
      espDecrementedByFour: item.singleStep.espDecrementedByFour,
      savedReturnMatchesCallsitePlusThree: item.singleStep.returnAddressMatchesCallContinuation,
      firstChanceSingleStepEvent: item.singleStep.firstChanceTrap,
      dr6BsReported: item.singleStep.dr6BsSet,
      strictStepAccepted: item.singleStep.completed,
      destinationWindow: {
        eip: item.singleStep.destinationWindow.eip.toLowerCase(),
        bytesHex: item.bytesHex,
        sha256: sha(Buffer.from(item.bytesHex, 'hex')),
        bytes: item.singleStep.destinationWindow.bytesRead,
        protection: item.singleStep.destinationWindow.region.protection,
        type: item.singleStep.destinationWindow.region.type,
      },
    })),
    staticInput: {
      sourceDiagnostic: { path: STAGED_DIAGNOSTIC, sha256: stagedDiagnosticFile.sha256 },
      binding: { path: BINDING_PATH, sha256: bindingFile.sha256 },
      windowBytesSha256: sourceWindow.bytesSha256,
      syntheticPe: { path: PE_PATH, sha256: peFile.sha256, wasExecuted: false },
      analystAddress: binding.generatedPe.analystAddress,
      mapping: { analystBase: '0x10001000', runtimeBase: sourceWindow.originalEip, bytes: WINDOW_SIZE },
    },
    derivationSources: sourceBindings,
    reaSummary: {
      provider: 'REA 6.4.0 / Ghidra 12.1.4',
      queryCount: rows.length,
      functionSeeds: 0,
      codeSeeds: rows.length,
      decodedInstructionBytes: decodedCoveredBytes,
      staticOnly: true,
      generatedPeExecuted: false,
      instructions: rows,
    },
    limitations: [
      'Both source-bound observer attempts failed the strict DR6.BS single-step acceptance gate and stopped before an after-control; their numeric target/stack observations are retained as diagnostics, not accepted direct-caller evidence.',
      'The destination memory region was reported PAGE_READWRITE and MEM_MAPPED. REA analyzed a copy marked executable inside a synthetic PE; runtime page protection and static PE section flags are different evidence.',
      'Each REA query used one code-only seed. No function-name seed was supplied and Ghidra reports zero functions created; procedure fields describe only the analyst query context.',
      'Only eight instruction starts were queried. Bytes not covered by those rows are not classified, and any instruction crossing the 32-byte window boundary is excluded.',
      'Relative destinations are translated only as static candidates using the known byte-offset mapping. No branch was observed executing and no bytes were read at destinations outside the captured window.',
      'No Lisp function name, original function boundary, calling convention, ABI, source behavior, JavaScript contract, or whole-painting parity is established.',
    ],
  };

  const outputPath = resolve(root, args.output);
  assert(outputPath.startsWith(`${root}${sep}`), 'Output path must stay inside the repository');
  assert(args.overwrite || !existsSync(outputPath), `Refusing to overwrite ${args.output}`);
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: args.overwrite ? 'w' : 'wx' });
  process.stdout.write(`${JSON.stringify({ output: relativePath(root, outputPath), sha256: sha(Buffer.from(`${JSON.stringify(output, null, 2)}\n`)), queries: rows.length, decodedInstructionBytes: decodedCoveredBytes, acceptedCallsiteGate: false }, null, 2)}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
