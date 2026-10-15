#!/usr/bin/env node

// Offline derivation of retained static REA observations for the synthetic PICK image.
// This helper reads source artifacts and shipped reports only; it never launches AARON or REA.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const RUN_ROOT = 'research/artifacts/rea-tools/pick-native-flow-20261015-a';
const BINDING_PATH = `${RUN_ROOT}/pick.binding.json`;
const PE_PATH = `${RUN_ROOT}/pick.synthetic.exe`;
const SEED_PATH = `${RUN_ROOT}/pick.seeds.tsv`;
const TOOLCHAIN_PATH = 'research/artifacts/rea-tools/toolchain-current.json';
const OUTPUT_PATH = 'research/introspection/evidence/pick-native-flow-rea-20261015-v1.json';
const PICK_ENTRY = '0x1fe00e8c';
const PICK_END = '0x1fe00ef4';
const BRANCH_TARGET = '0x1fe00ee8';
const EXPECTED_TOOLCHAIN_SHA256 = 'efa320886e71be20ddc1e0423d1d1f5c2fe43b921638678c2e5af8b3d0b96d04';
const EXPECTED_PE_SHA256 = 'bb96eae0446e0ad3c3dae06f268e3264765e700fcb17167c9dc9bc4ddf2aa221';
const EXPECTED_SEED_SHA256 = 'b625004a0fd377539089eb9c33560fa06b1efb3115d58364f8941243c07d8de5';
const SHA256 = /^[0-9a-f]{64}$/iu;

const RUNS = [
  {
    id: 'seeded-pick-function',
    directory: `${RUN_ROOT}/rea-function-seeded`,
    invocationOperation: 'function',
    reportOperation: 'analyze_function',
    address: PICK_ENTRY,
  },
  {
    id: 'call-edi-target-resolution',
    directory: `${RUN_ROOT}/rea-ran-call-target`,
    invocationOperation: 'resolve-native-call-targets',
    reportOperation: 'resolve_native_call_targets',
    address: '0x1fe00eba',
  },
  {
    id: 'branch-target-xrefs',
    directory: `${RUN_ROOT}/rea-branch-xrefs`,
    invocationOperation: 'xrefs',
    reportOperation: 'xrefs',
    address: BRANCH_TARGET,
  },
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
function sameJson(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
function within(root, full) {
  const rel = relative(root, full);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function repoFile(path) {
  assert(typeof path === 'string' && path.length > 0, 'Expected a non-empty repository-relative path');
  const full = resolve(REPO, path);
  assert(within(REPO, full), `Path escapes repository: ${path}`);
  return full;
}
function relativePath(full) { return relative(REPO, full).split(sep).join('/'); }
function read(path) {
  const full = repoFile(path);
  const bytes = readFileSync(full);
  return { path: relativePath(full), full, bytes, text: bytes.toString('utf8'), sha256: sha(bytes) };
}
function readJson(path) {
  const file = read(path);
  try { return { ...file, value: JSON.parse(file.text.replace(/^\uFEFF/u, '')) }; }
  catch (error) { fail(`${path}: invalid JSON (${error.message})`); }
}
function checkHash(actual, expected, label) {
  assert(typeof expected === 'string' && SHA256.test(expected), `${label}: malformed expected SHA-256`);
  assert(actual === expected.toLowerCase(), `${label}: SHA-256 mismatch`);
}
function address(value, label) {
  assert(typeof value === 'string' && /^0x[0-9a-f]+$/iu.test(value), `${label}: expected a hexadecimal address`);
  return BigInt(value);
}
function exactBytes(actual, expectedHex, label) {
  const expected = Buffer.from(expectedHex, 'hex');
  assert(actual.length === expected.length && actual.equals(expected), `${label}: bytes differ`);
  return actual.toString('hex');
}
function countOccurrences(haystack, needle) {
  const positions = [];
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, from);
    if (found < 0) break;
    positions.push(found);
    from = found + 1;
  }
  return positions;
}
function assertRunPath(path, expected, label) {
  assert(path === expected, `${label}: unexpected path (${path})`);
}

function validateSourceBinding(bindingFile) {
  const binding = bindingFile.value;
  assert(binding.schemaVersion === 1 && binding.functionName === 'PICK', 'PICK binding identity/schema differs');
  assert(binding.sourceMap?.path === 'research/extracted/local-oracle/external-runs/pick-native-links-20261014-v1/native-code/mapped/native-code-map.json',
    'PICK source-map path differs from the retained map');
  assert(binding.originalPll?.path === 'research/extracted/aaron/application/AARON.pll',
    'Original PLL path differs from the retained artifact');
  assert(binding.originalPayload?.path === 'research/extracted/local-oracle/external-runs/pick-native-links-20261014-v1/native-code/mapped/pick.native-payload.bin',
    'PICK payload path differs from the retained payload');

  const mapFile = readJson(binding.sourceMap.path);
  checkHash(mapFile.sha256, binding.sourceMap.sha256, 'native-code map');
  assert(mapFile.bytes.length === binding.sourceMap.bytes, 'native-code map byte count differs from binding');
  const map = mapFile.value;
  assert(map.schemaVersion === 1 && Array.isArray(map.functions), 'Native-code map schema is unexpected');
  const pickRows = map.functions.filter(item => item.name === 'PICK');
  assert(pickRows.length === 1, `Expected exactly one PICK map row; found ${pickRows.length}`);
  const mappedPick = pickRows[0];

  const pllFile = read(binding.originalPll.path);
  checkHash(pllFile.sha256, binding.originalPll.sha256, 'original AARON.pll');
  assert(pllFile.bytes.length === binding.originalPll.bytes, 'Original AARON.pll byte count differs from binding');
  checkHash(pllFile.sha256, map.pll?.sha256, 'native-code map PLL binding');
  assert(pllFile.bytes.length === map.pll?.bytes, 'Native-code map PLL byte count differs');

  const payloadFile = read(binding.originalPayload.path);
  const source = binding.originalPayload;
  assert(mappedPick.payloadFile === basename(source.path), 'PICK map payload filename differs from binding');
  checkHash(payloadFile.sha256, source.sha256, 'retained PICK payload');
  assert(payloadFile.bytes.length === source.bytes, 'Retained PICK payload byte count differs');
  assert(source.bytes === mappedPick.payloadBytes && source.sha256 === mappedPick.payloadSha256,
    'Binding payload metadata differs from the unique PICK map row');
  assert(source.objectSha256 === mappedPick.objectSha256 && source.uniqueCompleteObjectMatch === true
    && mappedPick.uniqueCompleteObjectByteMatch === true,
  'Binding/map do not assert the same unique complete PICK object');

  const objectOffset = source.pllObjectOffset;
  const payloadOffset = source.pllPayloadOffset;
  const endExclusive = source.pllEndExclusive;
  assert(Number.isInteger(objectOffset) && Number.isInteger(payloadOffset) && Number.isInteger(endExclusive),
    'PICK PLL offsets are not integers');
  assert(payloadOffset === objectOffset + 4 && endExclusive === payloadOffset + source.bytes,
    'PICK object/payload bounds do not match the four-byte header and payload length');
  assert(endExclusive - objectOffset === mappedPick.objectBytes, 'PICK complete-object length differs from map');
  assert(mappedPick.pll?.objectOffset === objectOffset && mappedPick.pll.payloadOffset === payloadOffset
    && mappedPick.pll.rawEnd === endExclusive,
  'PICK map PLL offsets differ from binding');

  const objectBytes = pllFile.bytes.subarray(objectOffset, endExclusive);
  const payloadBytes = pllFile.bytes.subarray(payloadOffset, endExclusive);
  assert(objectBytes.length === mappedPick.objectBytes && payloadBytes.length === source.bytes,
    'PICK source object/payload slice is outside the PLL or has an unexpected length');
  checkHash(sha(objectBytes), source.objectSha256, 'PICK complete source object');
  checkHash(sha(payloadBytes), source.sha256, 'PICK PLL payload slice');
  assert(payloadBytes.equals(payloadFile.bytes), 'Retained payload file does not equal the original PLL payload slice');
  assert(objectBytes.readUInt16LE(0) === Number.parseInt(mappedPick.header, 16)
    && objectBytes.readUInt16LE(2) === 0,
  'PICK encoded-object header does not match the map layout');
  assert(mappedPick.encodedWords * 2 === payloadBytes.length, 'PICK encoded word count differs from payload length');

  const objectMatches = countOccurrences(pllFile.bytes, objectBytes);
  assert(objectMatches.length === 1 && objectMatches[0] === objectOffset,
    `PICK complete source object is not unique at the bound offset (${objectMatches.length} matches)`);
  assert(mappedPick.runtime?.entry === PICK_ENTRY
    && mappedPick.runtime.objectBase === `0x${(address(PICK_ENTRY, 'PICK entry') - 4n).toString(16)}`,
  'PICK source-map runtime entry/object header relationship differs');
  assert(mappedPick.prefixHex?.toLowerCase() === payloadBytes.subarray(0, 16).toString('hex'),
    'PICK source-map prefix does not match the PLL payload bytes');

  return {
    bindingFile,
    binding,
    mapFile,
    map,
    mappedPick,
    pllFile,
    payloadFile,
    objectBytes,
    payloadBytes,
    objectMatches,
    offsets: { object: objectOffset, payload: payloadOffset, endExclusive },
  };
}

function validateSyntheticPe(binding, source) {
  const pe = read(PE_PATH);
  checkHash(pe.sha256, EXPECTED_PE_SHA256, 'synthetic PICK PE');
  checkHash(pe.sha256, binding.generatedPe?.sha256, 'synthetic PICK PE binding');
  assert(pe.bytes.length === binding.generatedPe?.bytes, 'Synthetic PE byte count differs from binding');
  assert(binding.generatedPe?.file === 'pick.synthetic.exe', 'Synthetic PE generation metadata is unexpected');
  assert(pe.bytes.length >= 0x40 && pe.bytes.toString('ascii', 0, 2) === 'MZ', 'Synthetic PE has no DOS MZ header');

  const peOffset = pe.bytes.readUInt32LE(0x3c);
  assert(peOffset + 24 <= pe.bytes.length && pe.bytes.toString('ascii', peOffset, peOffset + 4) === 'PE\0\0',
    'Synthetic PE signature/header is malformed');
  const machine = pe.bytes.readUInt16LE(peOffset + 4);
  const sectionCount = pe.bytes.readUInt16LE(peOffset + 6);
  const optionalSize = pe.bytes.readUInt16LE(peOffset + 20);
  const optionalOffset = peOffset + 24;
  assert(machine === 0x14c && sectionCount === 1 && optionalSize === 224,
    'Synthetic PE is not the expected one-section x86 PE32 image');
  assert(pe.bytes.readUInt16LE(optionalOffset) === 0x10b, 'Synthetic PE optional header is not PE32');

  const entryRva = pe.bytes.readUInt32LE(optionalOffset + 16);
  const imageBase = pe.bytes.readUInt32LE(optionalOffset + 28);
  const sectionAlignment = pe.bytes.readUInt32LE(optionalOffset + 32);
  const fileAlignment = pe.bytes.readUInt32LE(optionalOffset + 36);
  const sectionOffset = optionalOffset + optionalSize;
  const sectionName = pe.bytes.toString('ascii', sectionOffset, sectionOffset + 8).replace(/\0+$/u, '');
  const virtualSize = pe.bytes.readUInt32LE(sectionOffset + 8);
  const virtualAddress = pe.bytes.readUInt32LE(sectionOffset + 12);
  const rawSize = pe.bytes.readUInt32LE(sectionOffset + 16);
  const rawPointer = pe.bytes.readUInt32LE(sectionOffset + 20);
  const characteristics = pe.bytes.readUInt32LE(sectionOffset + 36);
  const generated = binding.generatedPe;
  const entryVa = BigInt(imageBase) + BigInt(entryRva);
  const boundEntry = address(generated.entry, 'Synthetic PE bound entry');
  const prefixBytes = generated.generatedPrefixBytes;
  const suffixBytes = generated.generatedSuffixBytes;
  const payloadLength = source.payloadBytes.length;
  const payloadFileOffset = generated.copiedPayloadFileOffset;

  assert(imageBase === Number.parseInt(generated.imageBase, 16), 'Synthetic PE image base differs from binding');
  assert(virtualAddress === generated.sectionRva && sectionName === '.text', 'Synthetic PE section identity differs from binding');
  assert(entryVa === boundEntry && boundEntry === address(PICK_ENTRY, 'PICK entry'), 'PE entry VA differs from mapped PICK entry');
  assert(entryRva === virtualAddress + prefixBytes, 'PE entry RVA is not at the generated prefix end');
  assert(rawPointer + prefixBytes === payloadFileOffset, 'Synthetic PE copied payload file offset differs from section layout');
  assert(generated.copiedPayloadBytes === payloadLength, 'Synthetic PE copied payload size differs from original payload');
  assert(virtualSize === prefixBytes + payloadLength, 'Synthetic PE virtual section size differs from generated content');
  assert(rawSize === prefixBytes + payloadLength + suffixBytes, 'Synthetic PE raw section size differs from generated layout');
  assert(rawPointer + rawSize === pe.bytes.length && rawPointer % fileAlignment === 0
    && virtualAddress % sectionAlignment === 0,
  'Synthetic PE section alignment or file bounds differ');
  assert(characteristics === 0x60000020, 'Synthetic PE section flags differ from read-only executable code');
  assert(payloadFileOffset + payloadLength <= pe.bytes.length, 'Synthetic PE copied payload is outside the file');

  const copiedPayload = pe.bytes.subarray(payloadFileOffset, payloadFileOffset + payloadLength);
  assert(copiedPayload.equals(source.payloadBytes), 'Synthetic PE copied payload differs from the original PLL bytes');
  checkHash(sha(copiedPayload), source.payloadFile.sha256, 'synthetic PE copied payload');
  assert(generated.generatedPrefixBytes + generated.copiedPayloadBytes + generated.generatedSuffixBytes === rawSize,
    'Synthetic PE prefix/payload/suffix do not fill the section');

  const seed = read(SEED_PATH);
  checkHash(seed.sha256, EXPECTED_SEED_SHA256, 'analyst PICK seed');
  checkHash(seed.sha256, binding.generatedSeed?.sha256, 'analyst PICK seed binding');
  assert(seed.bytes.length === binding.generatedSeed?.bytes && binding.generatedSeed.functions === 1
    && binding.generatedSeed.file === 'pick.seeds.tsv',
  'Analyst PICK seed metadata differs from binding');
  const expectedSeedText = `${PICK_ENTRY}\tfunction\tPICK\n`;
  assert(seed.text === expectedSeedText, 'PICK seed is not exactly the expected single analyst-name record');
  assert(binding.assertions?.headersAndLayout === 'analyst-generated static analysis input'
    && binding.assertions.seededName === 'analyst assertion from archived unique payload map'
    && binding.assertions.entryContext === 'archived measured address for static mapping; not a live process address'
    && binding.assertions.generatedExecutableRun === false,
  'Binding analyst assertions or non-execution assertion differ');

  return {
    pe,
    seed,
    layout: {
      architecture: 'x86',
      format: 'PE32',
      imageBase: `0x${imageBase.toString(16)}`,
      entryRva: `0x${entryRva.toString(16)}`,
      entry: `0x${entryVa.toString(16)}`,
      section: { name: sectionName, virtualAddress: `0x${virtualAddress.toString(16)}`, virtualSize, rawPointer, rawSize },
      copiedPayloadFileOffset: payloadFileOffset,
      generatedPrefixBytes: prefixBytes,
      copiedPayloadBytes: payloadLength,
      generatedSuffixBytes: suffixBytes,
    },
    copiedPayload,
  };
}

function readRun(spec, expectedHashes) {
  const invocationPath = `${spec.directory}/rea-invocation.json`;
  const invocationFile = readJson(invocationPath);
  const invocation = invocationFile.value;
  assert(invocation.schemaVersion === 1 && invocation.operation === spec.invocationOperation
    && invocation.address === spec.address,
  `${spec.id}: invocation identity differs`);
  assert(invocation.provider === 'ghidra' && invocation.reaVersion === '6.4.0'
    && invocation.ghidraVersion === '12.1.4', `${spec.id}: REA/Ghidra version differs`);
  assert(invocation.staticOnly === true && invocation.inputWasExecuted === false,
    `${spec.id}: static-only/non-execution invocation metadata is missing`);
  assertRunPath(invocation.input?.path, PE_PATH, `${spec.id} input`);
  checkHash(invocation.input.sha256, expectedHashes.pe, `${spec.id} input PE`);
  assertRunPath(invocation.seed?.path, SEED_PATH, `${spec.id} seed`);
  checkHash(invocation.seed?.sha256, expectedHashes.seed, `${spec.id} seed`);
  assertRunPath(invocation.toolchain?.path, TOOLCHAIN_PATH, `${spec.id} toolchain`);
  checkHash(invocation.toolchain?.sha256, expectedHashes.toolchain, `${spec.id} toolchain`);
  assertRunPath(invocation.report?.path, 'rea-result.json', `${spec.id} report`);
  assertRunPath(invocation.stderr?.path, 'rea-stderr.txt', `${spec.id} stderr`);

  const reportPath = `${spec.directory}/${invocation.report.path}`;
  const report = readJson(reportPath);
  checkHash(report.sha256, invocation.report.sha256, `${spec.id} report`);
  assert(report.bytes.length === invocation.report.bytes, `${spec.id}: report byte count differs`);
  assert(report.value.operation === spec.reportOperation, `${spec.id}: report operation differs`);
  assert(report.value.provider?.id === 'ghidra' && report.value.provider.version === '12.1.4',
    `${spec.id}: report provider differs`);
  checkHash(report.value.subject?.digest?.sha256, expectedHashes.pe, `${spec.id} report subject`);
  const profile = report.value.analysis_profile?.parameters;
  assert(profile?.architecture === 'x86', `${spec.id}: analysis profile architecture differs`);
  const seededEntries = profile.analysis_seeds?.entries;
  assert(seededEntries?.function === 1 && seededEntries.code === 0 && seededEntries.label === 0,
    `${spec.id}: analysis profile does not contain exactly the shared function seed`);
  checkHash(profile.analysis_seeds?.sha256, expectedHashes.seed, `${spec.id} report seed`);

  const stderr = read(`${spec.directory}/${invocation.stderr.path}`);
  checkHash(stderr.sha256, invocation.stderr.sha256, `${spec.id} stderr`);
  assert(stderr.bytes.length === invocation.stderr.bytes && stderr.bytes.length === 0,
    `${spec.id}: stderr is not the expected empty file`);

  const rawComparable = spec.reportOperation === 'analyze_function'
    ? report.value.raw_result?.value
    : report.value.raw_result;
  assert(sameJson(rawComparable, report.value.normalized_result), `${spec.id}: raw and normalized report results differ`);

  const reportSource = {
    path: relativePath(report.full),
    sha256: report.sha256,
    bytes: report.bytes.length,
  };
  const stderrSource = { path: relativePath(stderr.full), sha256: stderr.sha256, bytes: stderr.bytes.length };
  const invocationSource = { path: relativePath(invocationFile.full), sha256: invocationFile.sha256, bytes: invocationFile.bytes.length };
  return {
    spec,
    invocation,
    invocationSource,
    report: report.value,
    reportSource,
    stderrSource,
    profileDigest: report.value.analysis_profile.digest,
  };
}

function validateFunction(run, source, peInfo) {
  const result = run.report.normalized_result;
  const procedure = result.procedure;
  assert(procedure?.name === 'PICK' && procedure.address === PICK_ENTRY,
    'Seeded REA function report does not identify the synthetic PICK procedure');
  const body = procedure.body;
  assert(body?.available === true && body.provenance === 'ghidra-function-body-address-set'
    && body.contains_entry === true && body.non_contiguous === false
    && body.total_bytes === 105 && body.span_bytes === 105
    && sameJson(body.ranges, [{ start: PICK_ENTRY, end: PICK_END }]),
  'Synthetic PICK procedure body differs from the retained bounded body');

  const assembly = result.assembly;
  assert(Array.isArray(assembly), 'Seeded PICK report has no assembly listing');
  const expectedAssembly = [
    '0x1fe00eba: CALL EDI',
    '0x1fe00ebc: XOR EDX, EDX',
    '0x1fe00ebe: MOV DL, 0x4',
    '0x1fe00ec0: TEST AL, 0x3',
    '0x1fe00ec2: JNZ 0x1fe00ee8',
    '0x1fe00ec4: MOV EBX, EAX',
    '0x1fe00ec6: SUB EBX, EDX',
    '0x1fe00ec8: JO 0x1fe00ee8',
  ];
  for (const line of expectedAssembly) assert(assembly.includes(line), `PICK assembly is missing ${line}`);

  const branchBytes = [
    { address: '0x1fe00ec2', offsetFromEntry: 0x36, bytes: '7524', assembly: '0x1fe00ec2: JNZ 0x1fe00ee8' },
    { address: '0x1fe00ec8', offsetFromEntry: 0x3c, bytes: '701e', assembly: '0x1fe00ec8: JO 0x1fe00ee8' },
  ].map(item => {
    const sourceSlice = source.payloadBytes.subarray(item.offsetFromEntry, item.offsetFromEntry + item.bytes.length / 2);
    const peSlice = peInfo.copiedPayload.subarray(item.offsetFromEntry, item.offsetFromEntry + item.bytes.length / 2);
    exactBytes(sourceSlice, item.bytes, `${item.address} original PLL branch`);
    exactBytes(peSlice, item.bytes, `${item.address} synthetic PE branch`);
    assert(address(item.address, 'branch address') === address(PICK_ENTRY, 'PICK entry') + BigInt(item.offsetFromEntry),
      `${item.address}: address does not match its payload offset`);
    assert(assembly.includes(item.assembly), `${item.address}: exact branch disassembly differs`);
    return { address: item.address, payloadOffset: item.offsetFromEntry, bytes: item.bytes, disassembly: item.assembly.slice(item.assembly.indexOf(': ') + 2) };
  });

  const flow = result.native_value_flow;
  assert(flow?.available === true && flow.provenance && Array.isArray(flow.operations)
    && Array.isArray(flow.def_use), 'PICK high-pcode/native-value-flow evidence is unavailable');
  assert(flow.truncated === false && flow.omitted_operations_lower_bound === 0
    && flow.known_omitted_inputs === 0 && flow.known_omitted_edges === 0,
  'PICK high-pcode evidence is truncated or has omissions');

  const operation = id => {
    const matches = flow.operations.filter(item => item.id === id);
    assert(matches.length === 1, `PICK high-pcode operation ${id} is absent or duplicated`);
    return matches[0];
  };
  const call = operation('0x1fe00eba#61');
  const bitTest = operation('0x1fe00ec0#297');
  const compareZero = operation('0x1fe00ec0#76');
  const jnz = operation('0x1fe00ec2#82');
  const subtractFour = operation('0x1fe00ec6#85');
  const jo = operation('0x1fe00ec8#93');
  assert(call.opcode === 'CALLIND' && call.inputs?.[0]?.location === 'register:0x1c'
    && call.output?.location === 'register:0x0', 'PICK high-pcode CALL EDI does not define EAX');
  assert(bitTest.opcode === 'INT_AND' && bitTest.inputs?.[0]?.location === 'register:0x0'
    && bitTest.inputs?.[1]?.constant_hex === '3', 'PICK high-pcode TEST AL,3 dataflow differs');
  assert(compareZero.opcode === 'INT_NOTEQUAL' && compareZero.inputs?.[0]?.location === bitTest.output?.location
    && compareZero.inputs?.[1]?.constant_hex === '0', 'PICK high-pcode TEST comparison differs');
  assert(jnz.opcode === 'CBRANCH' && jnz.inputs?.[0]?.location === BRANCH_TARGET
    && jnz.inputs?.[1]?.location === compareZero.output?.location,
  'PICK high-pcode JNZ condition or branch target differs');
  assert(subtractFour.opcode === 'INT_SBORROW' && subtractFour.inputs?.[0]?.location === 'register:0x0'
    && subtractFour.inputs?.[1]?.constant_hex === '4', 'PICK high-pcode EAX-minus-four overflow condition differs');
  assert(jo.opcode === 'CBRANCH' && jo.inputs?.[0]?.location === BRANCH_TARGET
    && jo.inputs?.[1]?.location === subtractFour.output?.location,
  'PICK high-pcode JO condition or branch target differs');

  const expectedDefUse = [
    ['0x1fe00eba#61', '0x1fe00ec0#297', 0],
    ['0x1fe00ec0#297', '0x1fe00ec0#76', 0],
    ['0x1fe00ec0#76', '0x1fe00ec2#82', 1],
    ['0x1fe00eba#61', '0x1fe00ec6#85', 0],
    ['0x1fe00ec6#85', '0x1fe00ec8#93', 1],
  ];
  for (const [definition, use, inputIndex] of expectedDefUse) {
    const matches = flow.def_use.filter(edge => edge.definition === definition && edge.use === use && edge.input_index === inputIndex);
    assert(matches.length === 1, `PICK high-pcode def-use link ${definition} -> ${use} is absent or duplicated`);
  }

  const outgoingBranches = result.outgoing_references?.filter(ref =>
    ref.source_address === '0x1fe00ec2' || ref.source_address === '0x1fe00ec8') ?? [];
  assert(outgoingBranches.length === 2, 'PICK dossier does not contain exactly the two branch-source references');
  for (const ref of outgoingBranches) {
    assert(ref.target_address === BRANCH_TARGET && ref.kind?.type === 'CONDITIONAL_JUMP'
      && ref.kind.flow === true && ref.kind.jump === true && ref.kind.conditional === true
      && ref.kind.call === false,
    `${ref.source_address}: dossier reference is not the expected conditional edge`);
  }

  return {
    procedure: {
      syntheticAddress: procedure.address,
      seededName: procedure.name,
      body: {
        available: body.available,
        ranges: body.ranges,
        totalBytes: body.total_bytes,
        spanBytes: body.span_bytes,
        contiguous: !body.non_contiguous,
        containsEntry: body.contains_entry,
      },
    },
    keyAssembly: expectedAssembly,
    branchBytes,
    highPcode: {
      available: flow.available,
      provenance: flow.provenance,
      truncated: flow.truncated,
      omittedOperationsLowerBound: flow.omitted_operations_lower_bound,
      knownOmittedInputs: flow.known_omitted_inputs,
      knownOmittedEdges: flow.known_omitted_edges,
      operations: [call, bitTest, compareZero, jnz, subtractFour, jo].map(item => ({
        id: item.id,
        opcode: item.opcode,
        address: item.address,
        inputs: item.inputs,
        output: item.output,
      })),
      defUse: expectedDefUse.map(([definition, use, inputIndex]) => ({ definition, use, inputIndex })),
    },
    dossierBranchReferences: outgoingBranches.map(ref => ({
      source: ref.source_address,
      target: ref.target_address,
      type: ref.kind.type,
    })),
  };
}

function validateCallResolution(run) {
  const result = run.report.normalized_result;
  assert(result?.call_site === '0x1fe00eba' && result.procedure === PICK_ENTRY
    && result.status === 'unresolved' && result.mechanism === 'computed'
    && Array.isArray(result.targets) && result.targets.length === 0,
  'Computed CALL EDI target-resolution report is not unresolved with no targets');
  return {
    callSite: result.call_site,
    procedure: result.procedure,
    status: result.status,
    mechanism: result.mechanism,
    targets: result.targets,
  };
}

function validateXrefs(run) {
  const result = run.report.normalized_result;
  const expected = ['0x1fe00ec2', '0x1fe00ec8'];
  assert(Array.isArray(result) && sameJson(result, expected),
    'Branch-target xrefs are not exactly the two conditional instruction sources');
  return { queriedTarget: BRANCH_TARGET, sources: result };
}

function main() {
  const outputFull = repoFile(OUTPUT_PATH);
  assert(!existsSync(outputFull), `Refusing to overwrite existing evidence: ${OUTPUT_PATH}`);

  const bindingFile = readJson(BINDING_PATH);
  const source = validateSourceBinding(bindingFile);
  const peInfo = validateSyntheticPe(source.binding, source);
  const toolchain = readJson(TOOLCHAIN_PATH);
  checkHash(toolchain.sha256, EXPECTED_TOOLCHAIN_SHA256, 'REA toolchain');

  const expectedHashes = {
    pe: peInfo.pe.sha256,
    seed: peInfo.seed.sha256,
    toolchain: toolchain.sha256,
  };
  const runs = RUNS.map(spec => readRun(spec, expectedHashes));
  const [functionRun, callRun, xrefRun] = runs;
  const functionEvidence = validateFunction(functionRun, source, peInfo);
  const callResolution = validateCallResolution(callRun);
  const xrefs = validateXrefs(xrefRun);

  const helper = read(relativePath(fileURLToPath(import.meta.url)));
  const output = {
    schemaVersion: 1,
    investigation: 'PICK native branch flow from retained REA static reports',
    status: 'static synthetic-input evidence validated',
    sourceBinding: {
      functionName: source.mappedPick.name,
      attribution: 'The PICK name and mapping label are analyst assertions; object and payload bytes were independently rechecked.',
      sourceMap: { path: source.mapFile.path, sha256: source.mapFile.sha256, bytes: source.mapFile.bytes.length },
      originalPll: { path: source.pllFile.path, sha256: source.pllFile.sha256, bytes: source.pllFile.bytes.length },
      completeObject: {
        offset: source.offsets.object,
        payloadOffset: source.offsets.payload,
        endExclusive: source.offsets.endExclusive,
        bytes: source.objectBytes.length,
        sha256: sha(source.objectBytes),
        uniquePllMatches: source.objectMatches.length,
      },
      payload: {
        path: source.payloadFile.path,
        sha256: source.payloadFile.sha256,
        bytes: source.payloadFile.bytes.length,
        pllSliceMatchesPayloadFile: true,
        mappedPrefixHex: source.mappedPick.prefixHex.toLowerCase(),
      },
    },
    analysisInput: {
      syntheticPe: {
        path: peInfo.pe.path,
        sha256: peInfo.pe.sha256,
        bytes: peInfo.pe.bytes.length,
        executed: false,
        layout: peInfo.layout,
        copiedPayloadMatchesOriginal: true,
      },
      analystSeed: {
        path: peInfo.seed.path,
        sha256: peInfo.seed.sha256,
        bytes: peInfo.seed.bytes.length,
        record: '0x1fe00e8c\tfunction\tPICK',
        nameIsAnalystAssertion: true,
      },
      toolchain: {
        path: toolchain.path,
        sha256: toolchain.sha256,
        reaVersion: '6.4.0',
        ghidraVersion: '12.1.4',
      },
      binding: { path: bindingFile.path, sha256: bindingFile.sha256, bytes: bindingFile.bytes.length },
    },
    queryEvidence: runs.map(run => ({
      id: run.spec.id,
      operation: run.invocation.operation,
      address: run.invocation.address,
      staticOnly: run.invocation.staticOnly,
      inputWasExecuted: run.invocation.inputWasExecuted,
      input: run.invocation.input,
      seed: run.invocation.seed,
      toolchain: run.invocation.toolchain,
      profileDigest: run.profileDigest,
      sourceFiles: {
        invocation: run.invocationSource,
        report: run.reportSource,
        stderr: run.stderrSource,
      },
    })),
    function: functionEvidence,
    computedCall: callResolution,
    xrefs,
    sourceBytesRechecked: {
      pllPayloadSha256: source.payloadFile.sha256,
      syntheticCopiedPayloadSha256: sha(peInfo.copiedPayload),
      originalPllPayloadEqualsSyntheticCopy: true,
      branches: functionEvidence.branchBytes,
    },
    limits: [
      'The static analysis input is an analyst-generated synthetic PE containing copied PICK payload bytes; the PE and reports assert static-only analysis and inputWasExecuted=false.',
      'The seeded PICK name and source-map function label are analyst assertions; the PE function body is a Ghidra boundary on the synthetic image, not a recovered original-source boundary.',
      'No runtime branch execution, branch outcome, or path was observed.',
      'The computed CALL EDI remains unresolved with no static target addresses; no runtime call target was recovered.',
      'No caller, calling convention or native ABI, Lisp source, or JavaScript behavior was recovered.',
    ],
    derivedBy: { path: helper.path, sha256: helper.sha256, bytes: helper.bytes.length },
  };

  const serialized = `${JSON.stringify(output)}\n`;
  writeFileSync(outputFull, serialized, { flag: 'wx' });
  process.stdout.write(`Wrote ${OUTPUT_PATH} (${Buffer.byteLength(serialized)} bytes)\n`);
}

try { main(); }
catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
