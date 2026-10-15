#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidencePath = 'research/introspection/evidence/premium-callsite-wide-window-20261014-v3.json';
const reaDossierPath = 'research/introspection/evidence/premium-callsite-wide-window-rea-20261014-v3.json';
const bindingPath = 'research/artifacts/rea-tools/premium-callsite-wide-window-v2-20261014-e-b228b66c/premium-callsite-wide-window-v2.binding.json';
const pePath = 'research/artifacts/rea-tools/premium-callsite-wide-window-v2-20261014-e-b228b66c/premium-callsite-wide-window-v2.synthetic.exe';
const functionReportPath = 'research/artifacts/rea-tools/premium-callsite-wide-window-v2-20261014-e-rea-function/premium-destination-window-v3-function.json';
const toolchainPath = 'research/artifacts/rea-tools/toolchain-current.json';
const queryRoot = 'research/artifacts/rea-tools/premium-branch-recheck-elevated-20261015-936b84768de74c1ca570f54055b80d7f';
const outputPath = path.join(repoRoot, 'research/introspection/evidence/premium-callsite-branch-snapshot-20261015.json');

function fail(message) {
  throw new Error(message);
}

function bytesAt(evidence, address, count) {
  const start = BigInt(evidence.destinationWindow.windowStartAddress);
  const target = BigInt(address);
  const offset = target - start;
  const hex = evidence.destinationWindow.bytesHex;
  if (offset < 0n || offset + BigInt(count) > BigInt(hex.length / 2)) {
    fail(`Requested bytes fall outside captured window at ${address}`);
  }
  return hex.slice(Number(offset) * 2, Number(offset + BigInt(count)) * 2).toLowerCase();
}

function hashBytes(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function readBounded(relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  if (!absolutePath.startsWith(repoRoot + path.sep)) fail(`Path escapes repository: ${relativePath}`);
  const bytes = readFileSync(absolutePath);
  return { absolutePath, bytes, sha256: hashBytes(bytes) };
}

function readJson(relativePath) {
  const source = readBounded(relativePath);
  try {
    return { ...source, json: JSON.parse(source.bytes.toString('utf8').replace(/^\uFEFF/, '')) };
  } catch (error) {
    fail(`Could not parse ${relativePath}: ${error.message}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function relativeBinding(relativePath) {
  const file = readBounded(relativePath);
  return { path: relativePath.replaceAll('\\', '/'), bytes: file.bytes.length, sha256: file.sha256 };
}

function loadQuery(folder, address, operation, expected) {
  const prefix = `${queryRoot}/${folder}`;
  const invocationPath = `${prefix}/rea-invocation.json`;
  const reportPath = `${prefix}/rea-result.json`;
  const invocation = readJson(invocationPath);
  const report = readJson(reportPath);
  assertEqual(invocation.json.operation, operation, `${folder} operation`);
  assertEqual(invocation.json.address, address, `${folder} address`);
  assertEqual(invocation.json.provider, 'ghidra', `${folder} provider`);
  assertEqual(invocation.json.input.sha256, '88a5324f12cbab910c610327b2b667bfd4449244bb8baa54b786db4bce20be4a', `${folder} input PE hash`);
  assertEqual(invocation.json.staticOnly, true, `${folder} static-only flag`);
  assertEqual(invocation.json.inputWasExecuted, false, `${folder} PE execution flag`);
  if (operation === 'inspect-native-instruction') {
    const result = report.json.normalized_result;
    assertEqual(result.address, address, `${folder} decoded address`);
    assertEqual(result.bytes.toLowerCase(), expected.bytes, `${folder} instruction bytes`);
    assertEqual(result.mnemonic, expected.mnemonic, `${folder} mnemonic`);
    assertEqual(result.raw_disassembly.replace(/\s+/g, ' ').trim(), expected.disassembly, `${folder} disassembly`);
  } else {
    const refs = report.json.normalized_result;
    const sources = Array.isArray(refs) ? refs : typeof refs === 'string' ? [refs] : [];
    assertEqual(JSON.stringify(sources), JSON.stringify(expected.sources), `${folder} xref source list`);
  }
  return {
    operation,
    address,
    invocation: relativeBinding(invocationPath),
    report: relativeBinding(reportPath),
    seed: invocation.json.seed ? relativeBinding(invocation.json.seed.path) : null,
    result: operation === 'inspect-native-instruction'
      ? { bytes: report.json.normalized_result.bytes.toLowerCase(), mnemonic: report.json.normalized_result.mnemonic, disassembly: report.json.normalized_result.raw_disassembly }
      : { sources: Array.isArray(report.json.normalized_result) ? report.json.normalized_result : [report.json.normalized_result] }
  };
}

const evidenceFile = readJson(evidencePath);
const reaDossier = readJson(reaDossierPath);
const binding = readJson(bindingPath);
const functionReport = readJson(functionReportPath);
const toolchain = readJson(toolchainPath);

assertEqual(evidenceFile.json.status, 'source-bound-wide-destination-captured', 'accepted capture status');
assertEqual(evidenceFile.json.triplet.controlsMatch, true, 'fresh control equality');
assertEqual(evidenceFile.json.triplet.roles.length, 3, 'triplet role count');
assertEqual(evidenceFile.json.destinationWindow.bytesRead, 256, 'captured window byte count');
assertEqual(evidenceFile.json.destinationWindow.bytesHex.length, 512, 'captured window hex length');
assertEqual(binding.json.generatedPe.sha256, '88a5324f12cbab910c610327b2b667bfd4449244bb8baa54b786db4bce20be4a', 'synthetic PE identity');
assertEqual(binding.json.generatedPe.sourceWindowStart, evidenceFile.json.destinationWindow.windowStartAddress, 'runtime-to-synthetic mapping start');
assertEqual(binding.json.generatedPe.analystWindowAddress, '0x10001000', 'synthetic mapping base');
assertEqual(functionReport.json.normalized_result.assembly.includes('0x1000108e: JC 0x10001099'), true, 'function REA branch listing');
assertEqual(functionReport.json.normalized_result.assembly.includes('0x10001082: AND ECX, 0x7f'), true, 'function REA mask listing');

const context = evidenceFile.json.pickCorrelation.pickObservation.armedContextReadback;
assertEqual(context.eip, evidenceFile.json.destinationWindow.address, 'captured context at first destination instruction');
const edi = BigInt(context.edi);
const esp = BigInt(context.esp);
const ebx = BigInt(context.ebx);
const compareAddress = edi - 0x65n;
const esiPointerSourceAddress = ebx + 0x15n;
const indirectCallSlotAddress = edi + 0x35fn;
const compareBytes = bytesAt(evidenceFile.json, compareAddress, 4);
const memoryValue = BigInt(`0x${compareBytes.match(/../g).reverse().join('')}`);
const unsignedLessThan = memoryValue < esp;

assertEqual(bytesAt(evidenceFile.json, '0x2000091a', 6), 'ff975f030000', 'indirect CALL bytes');
assertEqual(bytesAt(evidenceFile.json, '0x20000983', 2), 'b102', 'destination entry bytes');
assertEqual(bytesAt(evidenceFile.json, '0x20000985', 3), '83e17f', 'mask instruction bytes');
assertEqual(bytesAt(evidenceFile.json, '0x20000988', 3), '8b7315', 'ESI load bytes');
assertEqual(bytesAt(evidenceFile.json, '0x2000098b', 3), '894df0', 'stack store bytes');
assertEqual(bytesAt(evidenceFile.json, '0x2000098e', 3), '39679b', 'CMP bytes');
assertEqual(bytesAt(evidenceFile.json, '0x20000991', 2), '7209', 'JC bytes');
assertEqual(bytesAt(evidenceFile.json, '0x20000993', 2), 'eb85', 'fallback relative JMP bytes');
assertEqual(bytesAt(evidenceFile.json, '0x2000099c', 4), '89442404', 'branch-block EAX store bytes');
assertEqual(bytesAt(evidenceFile.json, '0x200009a0', 4), '89542408', 'branch-block EDX store bytes');
assertEqual(bytesAt(evidenceFile.json, '0x200009a4', 3), 'ff6612', 'indirect tail JMP bytes');
assertEqual(unsignedLessThan, true, 'snapshot unsigned CMP relation');

const recheckedQueries = [
  loadQuery('inspect-10001085', '0x10001085', 'inspect-native-instruction', {
    bytes: '8b7315', mnemonic: 'MOV', disassembly: 'MOV ESI,dword ptr [EBX + 0x15]'
  }),
  loadQuery('inspect-1000108b', '0x1000108b', 'inspect-native-instruction', {
    bytes: '39679b', mnemonic: 'CMP', disassembly: 'CMP dword ptr [EDI + -0x65],ESP'
  }),
  loadQuery('inspect-1000108e', '0x1000108e', 'inspect-native-instruction', {
    bytes: '7209', mnemonic: 'JC', disassembly: 'JC 0x10001099'
  }),
  loadQuery('xrefs-10001099', '0x10001099', 'xrefs', { sources: ['0x1000108e'] }),
  loadQuery('inspect-100010a1', '0x100010a1', 'inspect-native-instruction', {
    bytes: 'ff6612', mnemonic: 'JMP', disassembly: 'JMP dword ptr [ESI + 0x12]'
  })
];

const sourceBindings = [
  relativeBinding(evidencePath),
  relativeBinding(reaDossierPath),
  relativeBinding(bindingPath),
  relativeBinding(pePath),
  relativeBinding(functionReportPath),
  relativeBinding(toolchainPath),
  ...recheckedQueries.flatMap((query) => [query.invocation, query.report, ...(query.seed ? [query.seed] : [])])
];

const predictedPath = unsignedLessThan ? 'conditional branch to the block at runtime offset +0x99' : 'fall through to the relative JMP at runtime offset +0x90';
const output = {
  schemaVersion: 1,
  investigation: 'PREMIUM anonymous destination branch prediction from one captured state snapshot',
  status: 'snapshot-predicts-JC-taken-if-values-remain-stable; runtime-branch-not-observed',
  sourceCapture: {
    evidencePath,
    evidenceSha256: evidenceFile.sha256,
    tripletId: evidenceFile.json.triplet.id,
    controlsMatch: evidenceFile.json.triplet.controlsMatch,
    canvas: evidenceFile.json.triplet.canvas,
    runtimeWindowStart: evidenceFile.json.destinationWindow.windowStartAddress,
    runtimeDestination: evidenceFile.json.destinationWindow.address,
    runtimeWindowBytes: evidenceFile.json.destinationWindow.bytesRead,
    runtimeWindowSha256: evidenceFile.json.destinationWindow.bytesSha256,
    capturedBeforeDestinationInstruction: evidenceFile.json.call.stoppedBeforeDestinationInstruction,
    region: evidenceFile.json.destinationWindow.region,
    context: {
      eip: context.eip,
      threadId: context.threadId,
      esp: context.esp,
      ebx: context.ebx,
      esiBeforeWindowCode: context.esi,
      edi: context.edi,
      ebp: context.ebp
    }
  },
  staticAnalysis: {
    provider: 'REA 6.4.0 / Ghidra 12.1.4',
    staticOnly: true,
    syntheticPeExecuted: false,
    syntheticPeSha256: binding.json.generatedPe.sha256,
    runtimeWindowStart: binding.json.generatedPe.sourceWindowStart,
    syntheticWindowStart: binding.json.generatedPe.analystWindowAddress,
    recheckedQueries,
    instructions: [
      { runtimeAddress: '0x2000091a', syntheticAddress: '0x10001017', bytes: 'ff975f030000', disassembly: 'CALL dword ptr [EDI + 0x35f]' },
      { runtimeAddress: '0x20000983', syntheticAddress: '0x10001080', bytes: 'b102', disassembly: 'MOV CL, 0x2' },
      { runtimeAddress: '0x20000985', syntheticAddress: '0x10001082', bytes: '83e17f', disassembly: 'AND ECX, 0x7f' },
      { runtimeAddress: '0x20000988', syntheticAddress: '0x10001085', bytes: '8b7315', disassembly: 'MOV ESI, dword ptr [EBX + 0x15]' },
      { runtimeAddress: '0x2000098b', syntheticAddress: '0x10001088', bytes: '894df0', disassembly: 'MOV dword ptr [EBP - 0x10], ECX' },
      { runtimeAddress: '0x2000098e', syntheticAddress: '0x1000108b', bytes: '39679b', disassembly: 'CMP dword ptr [EDI - 0x65], ESP' },
      { runtimeAddress: '0x20000991', syntheticAddress: '0x1000108e', bytes: '7209', disassembly: 'JC 0x10001099' },
      { runtimeAddress: '0x20000993', syntheticAddress: '0x10001090', bytes: 'eb85', disassembly: 'JMP 0x10001017' },
      { runtimeAddress: '0x2000099c', syntheticAddress: '0x10001099', bytes: '89442404', disassembly: 'MOV dword ptr [ESP + 0x4], EAX' },
      { runtimeAddress: '0x200009a0', syntheticAddress: '0x1000109d', bytes: '89542408', disassembly: 'MOV dword ptr [ESP + 0x8], EDX' },
      { runtimeAddress: '0x200009a4', syntheticAddress: '0x100010a1', bytes: 'ff6612', disassembly: 'JMP dword ptr [ESI + 0x12]' }
    ]
  },
  prediction: {
    status: 'conditional-inference-only',
    compare: {
      instruction: 'CMP dword ptr [EDI - 0x65], ESP',
      effectiveAddress: `0x${compareAddress.toString(16).padStart(8, '0')}`,
      capturedValue: `0x${memoryValue.toString(16).padStart(8, '0')}`,
      esp: `0x${esp.toString(16).padStart(8, '0')}`,
      unsignedLessThan: true,
      predictedCarryFlag: true
    },
    branch: {
      instruction: 'JC +0x99',
      predictedTaken: true,
      predictedPath: predictedPath,
      runtimeBranchTarget: '0x2000099c',
      branchHitCaptured: false
    },
    downstream: {
      esiPointerSourceAddress: `0x${esiPointerSourceAddress.toString(16).padStart(8, '0')}`,
      esiPointerValueCaptured: false,
      indirectCallSlotAddress: `0x${indirectCallSlotAddress.toString(16).padStart(8, '0')}`,
      indirectCallTargetCaptured: false,
      indirectCallTargetCaptured: false,
      tailTransferInstruction: 'JMP dword ptr [ESI + 0x12]',
      tailTransferOperandValueCaptured: false,
      dynamicDestinationCaptured: false,
      destinationEqualsPick: null
    }
  },
  claims: {
    observedBranchOutcome: false,
    directEdgeToPickProven: false,
    callerFunctionRecovered: false,
    behaviorContractAdded: false,
    parityClaimed: false
  },
  limitations: [
    'The instruction bytes are mapped into an analyst-generated PE; its addresses are synthetic static coordinates, not original executable addresses.',
    'The branch outcome is predicted from one captured register and memory snapshot under the assumption that the compared values remain stable until CMP executes. The debugger stopped before the destination instruction, so the branch was not observed.',
    'The captured code page was MEM_MAPPED/PAGE_READWRITE. Its full-window bytes changed in a separate rejected observer attempt; the changed offsets remain unexplained.',
    'The value at [EBX+0x15] and the resulting [ESI+0x12] target are outside the captured window and unresolved.',
    'The computed CALL [EDI+0x35f] operand is also outside the captured window; neither its execution nor target is known.',
    'A same-thread/frame PICK observation after the original call does not establish a direct CPU edge from this destination to PICK.',
    'No Lisp function name, native ABI, general call graph, JavaScript behavior contract, or whole-painting parity follows from this result.'
  ],
  recommendedNextCapture: {
    route: 'existing no-TF hardware execute-breakpoint observer, not Frida Interceptor',
    sourceBoundTargets: [
      'rediscover the PREMIUM CALL and direct destination in the observer runtime',
      'read and bind the complete centered 256-byte window in that observer run',
      'validate the full mapped instruction signature sequence at relative offsets 0x17, 0x80, 0x82, 0x85, 0x88, 0x8b, 0x8e, 0x90, 0x99, 0x9d, and 0xa1',
      'observe the source site and computed destination for JMP [ESI+0x12], checking same thread, EIP, stack, return continuation, and debug-register restoration'
    ],
    requireFreshUninstrumentedControls: true,
    requireCompleteSourceBoundTriplet: true
  },
  sourceBindings
};

const profileLines = [
  'profile=premium-callsite-instruction-profile-v1',
  'windowStart=0x20000903',
  `referenceWindowSha256=${evidenceFile.json.destinationWindow.bytesSha256}`,
  `reaEvidenceSha256=${reaDossier.sha256}`,
  ...output.staticAnalysis.instructions.map((instruction) => {
    const offset = BigInt(instruction.runtimeAddress) - BigInt(output.staticAnalysis.runtimeWindowStart);
    return `${offset.toString(16).padStart(2, '0')}:${instruction.bytes}`;
  })
];
output.instructionProfile = {
  id: 'premium-callsite-instruction-profile-v1',
  sha256: hashBytes(Buffer.from(profileLines.join('\n'), 'utf8')),
  referenceWindowSha256: evidenceFile.json.destinationWindow.bytesSha256,
  reaEvidenceSha256: reaDossier.sha256,
  offsetsAndBytes: output.staticAnalysis.instructions.map((instruction) => ({
    offset: `0x${(BigInt(instruction.runtimeAddress) - BigInt(output.staticAnalysis.runtimeWindowStart)).toString(16)}`,
    bytes: instruction.bytes
  }))
};
assertEqual(output.instructionProfile.sha256, '25daebb65b53736fb37a208f44cc9a86162ec398f64703aa6bb86b351310fabe', 'canonical 11-span instruction profile identity');

if (existsSync(outputPath) && !process.argv.includes('--overwrite')) {
  fail(`Evidence output already exists; pass --overwrite to replace it: ${outputPath}`);
}
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
process.stdout.write(`${path.relative(repoRoot, outputPath).replaceAll('\\', '/')}\n`);
