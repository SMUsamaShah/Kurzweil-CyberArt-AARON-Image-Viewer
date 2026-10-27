#!/usr/bin/env node

// Offline derivation of retained static SCREEN-AND-STORE observations.
// This helper reads bound source artifacts and shipped REA reports only; it
// never launches AARON, REA, or the generated executable.

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const RUN_ROOT = 'research/artifacts/rea-tools/screen-store-return-flow-20261015-a';
const BINDING_PATH = `${RUN_ROOT}/screen-and-store.binding.json`;
const PE_PATH = `${RUN_ROOT}/screen-and-store.synthetic.exe`;
const SEED_PATH = `${RUN_ROOT}/screen-and-store.seeds.tsv`;
const TOOLCHAIN_PATH = 'research/artifacts/rea-tools/toolchain-6.8.0-20261027.json';
const QUERY_ROOT = 'research/artifacts/rea-tools/screen-store-return-flow-20261027-rea68-a';
const DEFAULT_OUTPUT_PATH = 'research/introspection/evidence/screen-and-store-call-return-flow-rea-20261027-v1.json';

const ENTRY = '0x1fe24a6c';
const BODY_END = '0x1fe24f2b';
const CALL_SITE = '0x1fe24d12';
const LATER_CALL = '0x1fe24d25';
const LOW_TAG_TEST = '0x1fe24d2c';
const EXPECTED_BINDING_SHA256 = '9182783e41dcc7b611716090ca28541e062b55067d91b420f6b29fad5c0c3200';
const EXPECTED_MAP_SHA256 = '5ac2fcf6ee9b87daa3100dc903b6555799523ce0d5ec48442a372ed60f4d4177';
const EXPECTED_PLL_SHA256 = '7ffc7dc9e3e62b1c5ba3612630b8747778324fa674dac42916be3e90bb96504c';
const EXPECTED_PAYLOAD_SHA256 = '1ac15580adf6ea0ead549a875d8d442b25d10fd267fb558d891bd919d46da872';
const EXPECTED_OBJECT_SHA256 = 'f96487d52953a1e8d5748d6d5b0d168a8eca65d0ab83eb2cecab478c80c0b54a';
const EXPECTED_PE_SHA256 = 'd083595b441640a47ec15cb29cf016729f1db3d89e8f25ffd1ff9fe5fdccb686';
const EXPECTED_SEED_SHA256 = '569c180e2e14d5749aa1b6dec777783b888df8e18a1957ead89cfd0c2999fa79';
const EXPECTED_TOOLCHAIN_SHA256 = '3e84aceb7c23ea8b04a83c9ba9d969f1a07fbcecd4ed3c5f338fe0aec28a7490';
const EXPECTED_PROFILE_DIGEST = '8cdf13b3543954fbea5d3ca573e7cc0eaebf3502bb0f332ee33656eb90c50951';
const SHA256 = /^[0-9a-f]{64}$/iu;

const RUNS = [
  {
    id: 'screen-and-store-function',
    directory: `${QUERY_ROOT}/function`,
    invocationOperation: 'function',
    reportOperation: 'analyze_function',
    address: ENTRY,
    expectedInvocationSha256: 'd8e36b1f41ad73cfd192f2de53b5adaff4dacd2f8014b0bb2ee7019b17e54f5c',
    expectedInvocationBytes: 1425,
    expectedReportSha256: '72a6c018c782c3e0b80e99bbae8abb27350b44210b9c0695a0ab1570778a9a5b',
    expectedReportBytes: 563503,
  },
  {
    id: 'screen-and-store-call-target',
    directory: `${QUERY_ROOT}/call-target`,
    invocationOperation: 'resolve-native-call-targets',
    reportOperation: 'resolve_native_call_targets',
    address: CALL_SITE,
    expectedInvocationSha256: '35b9f297abe300e8b291eb5592c0cf034f1a4612fbc4053e684c8f1dbc6acfb4',
    expectedInvocationBytes: 1442,
    expectedReportSha256: '625945b46bff8ae86e9be97899f43714bfb10e8b7e8aaf30efd1f6bd7d0b7383',
    expectedReportBytes: 5445,
  },
  {
    id: 'screen-and-store-later-call-target',
    directory: `${QUERY_ROOT}/second-call-target`,
    invocationOperation: 'resolve-native-call-targets',
    reportOperation: 'resolve_native_call_targets',
    address: LATER_CALL,
    expectedInvocationSha256: '37788dcef82ba9f6ba80d74259602d8756cd2d31b2bb851adc046b930b96c3fe',
    expectedInvocationBytes: 1442,
    expectedReportSha256: '186937cfbfd8cb6bb776be53f114af4d7eccf07e7137a76e2174392c52b28a08',
    expectedReportBytes: 5445,
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
function outputPathFromArgs(args) {
  if (args.length === 0) return DEFAULT_OUTPUT_PATH;
  assert(args.length === 2 && args[0] === '--output',
    'Usage: node derive-screen-and-store-call-return-flow-rea-v1.mjs [--output <repo-relative-path>]');
  const candidate = args[1];
  assert(typeof candidate === 'string' && candidate.length > 0, '--output requires a repo-relative path');
  assert(!isAbsolute(candidate) && !/^[a-z]:/iu.test(candidate)
    && !candidate.startsWith('\\\\') && !candidate.startsWith('//'),
    '--output must be a repo-relative path');
  assert(!candidate.split(/[\\/]+/u).includes('..'), '--output path must not contain parent-directory segments');
  const full = repoFile(candidate);
  return relativePath(full);
}
function safeOutputFullPath(path) {
  const full = repoFile(path);
  const realRepo = realpathSync(REPO);
  const realParent = realpathSync(dirname(full));
  assert(realParent === realRepo || within(realRepo, realParent),
    `Output parent escapes repository through a symbolic link: ${path}`);
  const prospectiveTarget = resolve(realParent, basename(full));
  assert(within(realRepo, prospectiveTarget), `Output escapes repository: ${path}`);
  try {
    lstatSync(full);
    fail(`Refusing to overwrite existing evidence: ${path}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
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
  assert(typeof actual === 'string' && actual.toLowerCase() === expected.toLowerCase(), `${label}: SHA-256 mismatch`);
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
  checkHash(bindingFile.sha256, EXPECTED_BINDING_SHA256, 'SCREEN-AND-STORE binding');
  assert(binding.schemaVersion === 1 && binding.functionName === 'SCREEN-AND-STORE',
    'SCREEN-AND-STORE binding identity/schema differs');
  assert(binding.sourceMap?.path === 'research/extracted/local-oracle/external-runs/pick-native-links-20261014-v1/native-code/mapped/native-code-map.json',
    'SCREEN-AND-STORE source-map path differs from the retained map');
  assert(binding.originalPll?.path === 'research/extracted/aaron/application/AARON.pll',
    'Original PLL path differs from the retained artifact');
  assert(binding.originalPayload?.path === 'research/extracted/local-oracle/external-runs/pick-native-links-20261014-v1/native-code/mapped/screen-and-store.native-payload.bin',
    'SCREEN-AND-STORE payload path differs from the retained payload');

  const mapFile = readJson(binding.sourceMap.path);
  checkHash(mapFile.sha256, EXPECTED_MAP_SHA256, 'native-code map');
  checkHash(mapFile.sha256, binding.sourceMap.sha256, 'native-code map binding');
  assert(mapFile.bytes.length === binding.sourceMap.bytes, 'Native-code map byte count differs from binding');
  const map = mapFile.value;
  assert(map.schemaVersion === 1 && Array.isArray(map.functions), 'Native-code map schema is unexpected');
  const rows = map.functions.filter(item => item.name === 'SCREEN-AND-STORE');
  assert(rows.length === 1, `Expected exactly one SCREEN-AND-STORE map row; found ${rows.length}`);
  const mappedFunction = rows[0];

  const pllFile = read(binding.originalPll.path);
  checkHash(pllFile.sha256, EXPECTED_PLL_SHA256, 'original AARON.pll');
  checkHash(pllFile.sha256, binding.originalPll.sha256, 'original AARON.pll binding');
  assert(pllFile.bytes.length === binding.originalPll.bytes, 'Original AARON.pll byte count differs from binding');
  checkHash(pllFile.sha256, map.pll?.sha256, 'native-code map PLL binding');
  assert(pllFile.bytes.length === map.pll?.bytes, 'Native-code map PLL byte count differs');

  const payloadFile = read(binding.originalPayload.path);
  const source = binding.originalPayload;
  checkHash(payloadFile.sha256, EXPECTED_PAYLOAD_SHA256, 'retained SCREEN-AND-STORE payload');
  checkHash(payloadFile.sha256, source.sha256, 'SCREEN-AND-STORE payload binding');
  assert(payloadFile.bytes.length === source.bytes, 'Retained SCREEN-AND-STORE payload byte count differs');
  assert(mappedFunction.payloadFile === basename(source.path), 'Map payload filename differs from binding');
  assert(source.bytes === mappedFunction.payloadBytes && source.sha256 === mappedFunction.payloadSha256,
    'Binding payload metadata differs from the unique SCREEN-AND-STORE map row');
  assert(source.objectSha256 === mappedFunction.objectSha256 && source.uniqueCompleteObjectMatch === true
    && mappedFunction.uniqueCompleteObjectByteMatch === true,
  'Binding/map do not assert the same unique complete SCREEN-AND-STORE object');

  const objectOffset = source.pllObjectOffset;
  const payloadOffset = source.pllPayloadOffset;
  const endExclusive = source.pllEndExclusive;
  assert(Number.isInteger(objectOffset) && Number.isInteger(payloadOffset) && Number.isInteger(endExclusive),
    'SCREEN-AND-STORE PLL offsets are not integers');
  assert(payloadOffset === objectOffset + 4 && endExclusive === payloadOffset + source.bytes,
    'SCREEN-AND-STORE object/payload bounds do not match its four-byte header and payload length');
  assert(endExclusive - objectOffset === mappedFunction.objectBytes, 'Complete-object length differs from map');
  assert(mappedFunction.pll?.objectOffset === objectOffset && mappedFunction.pll.payloadOffset === payloadOffset
    && mappedFunction.pll.rawEnd === endExclusive,
  'SCREEN-AND-STORE map PLL offsets differ from binding');

  const objectBytes = pllFile.bytes.subarray(objectOffset, endExclusive);
  const payloadBytes = pllFile.bytes.subarray(payloadOffset, endExclusive);
  assert(objectBytes.length === mappedFunction.objectBytes && payloadBytes.length === source.bytes,
    'SCREEN-AND-STORE source object/payload slice is outside the PLL or has an unexpected length');
  checkHash(sha(objectBytes), EXPECTED_OBJECT_SHA256, 'SCREEN-AND-STORE complete source object');
  checkHash(sha(objectBytes), source.objectSha256, 'SCREEN-AND-STORE complete-object binding');
  checkHash(sha(payloadBytes), source.sha256, 'SCREEN-AND-STORE PLL payload slice');
  assert(payloadBytes.equals(payloadFile.bytes), 'Retained payload file does not equal the original PLL payload slice');
  assert(objectBytes.readUInt32LE(0) === Number.parseInt(mappedFunction.header, 16),
    'SCREEN-AND-STORE encoded-object header does not match the map');
  assert(mappedFunction.encodedWords * 2 === payloadBytes.length, 'SCREEN-AND-STORE encoded word count differs from payload length');

  const objectMatches = countOccurrences(pllFile.bytes, objectBytes);
  assert(objectMatches.length === 1 && objectMatches[0] === objectOffset,
    `SCREEN-AND-STORE complete source object is not unique at the bound offset (${objectMatches.length} matches)`);
  assert(mappedFunction.runtime?.entry === ENTRY
    && mappedFunction.runtime.objectBase === `0x${(address(ENTRY, 'SCREEN-AND-STORE entry') - 4n).toString(16)}`,
  'SCREEN-AND-STORE source-map runtime entry/object-header relationship differs');
  assert(mappedFunction.prefixHex?.toLowerCase() === payloadBytes.subarray(0, 16).toString('hex'),
    'SCREEN-AND-STORE source-map prefix does not match the PLL payload bytes');

  return {
    bindingFile,
    binding,
    mapFile,
    map,
    mappedFunction,
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
  checkHash(pe.sha256, EXPECTED_PE_SHA256, 'synthetic SCREEN-AND-STORE PE');
  checkHash(pe.sha256, binding.generatedPe?.sha256, 'synthetic SCREEN-AND-STORE PE binding');
  assert(pe.bytes.length === binding.generatedPe?.bytes, 'Synthetic PE byte count differs from binding');
  assert(binding.generatedPe?.file === 'screen-and-store.synthetic.exe', 'Synthetic PE generation metadata is unexpected');
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
  assert(entryVa === boundEntry && boundEntry === address(ENTRY, 'SCREEN-AND-STORE entry'),
    'Synthetic PE entry VA differs from mapped SCREEN-AND-STORE entry');
  assert(entryRva === virtualAddress + prefixBytes, 'PE entry RVA is not at the generated prefix end');
  assert(rawPointer + prefixBytes === payloadFileOffset, 'Synthetic PE copied payload file offset differs from section layout');
  assert(generated.copiedPayloadBytes === payloadLength, 'Synthetic PE copied payload size differs from original payload');
  assert(virtualSize === prefixBytes + payloadLength, 'Synthetic PE virtual section size differs from generated content');
  assert(rawSize === prefixBytes + payloadLength + suffixBytes, 'Synthetic PE raw section size differs from generated layout');
  assert(fileAlignment > 0 && sectionAlignment > 0 && rawPointer + rawSize === pe.bytes.length
    && rawPointer % fileAlignment === 0 && virtualAddress % sectionAlignment === 0,
  'Synthetic PE section alignment or file bounds differ');
  assert(characteristics === 0x60000020, 'Synthetic PE section flags differ from read-only executable code');
  assert(payloadFileOffset + payloadLength <= pe.bytes.length, 'Synthetic PE copied payload is outside the file');

  const copiedPayload = pe.bytes.subarray(payloadFileOffset, payloadFileOffset + payloadLength);
  assert(copiedPayload.equals(source.payloadBytes), 'Synthetic PE copied payload differs from the original PLL bytes');
  checkHash(sha(copiedPayload), source.payloadFile.sha256, 'synthetic PE copied payload');
  assert(prefixBytes + generated.copiedPayloadBytes + suffixBytes === rawSize,
    'Synthetic PE prefix/payload/suffix do not fill the section');

  const seed = read(SEED_PATH);
  checkHash(seed.sha256, EXPECTED_SEED_SHA256, 'SCREEN-AND-STORE analyst seed');
  checkHash(seed.sha256, binding.generatedSeed?.sha256, 'SCREEN-AND-STORE seed binding');
  assert(seed.bytes.length === binding.generatedSeed?.bytes && binding.generatedSeed.functions === 1
    && binding.generatedSeed.file === 'screen-and-store.seeds.tsv',
  'SCREEN-AND-STORE seed metadata differs from binding');
  const expectedSeedText = `${ENTRY}\tfunction\tSCREEN_AND_STORE\n`;
  assert(seed.text === expectedSeedText, 'SCREEN-AND-STORE seed is not exactly the expected analyst-name record');
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
  checkHash(invocationFile.sha256, spec.expectedInvocationSha256, `${spec.id} invocation`);
  assert(invocationFile.bytes.length === spec.expectedInvocationBytes, `${spec.id}: invocation byte count differs`);
  const invocation = invocationFile.value;
  assert(invocation.schemaVersion === 1 && invocation.operation === spec.invocationOperation
    && invocation.address === spec.address,
  `${spec.id}: invocation identity differs`);
  assert(invocation.provider === 'ghidra' && invocation.reaVersion === '6.8.0'
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

  const report = readJson(`${spec.directory}/${invocation.report.path}`);
  checkHash(report.sha256, invocation.report.sha256, `${spec.id} report invocation binding`);
  checkHash(report.sha256, spec.expectedReportSha256, `${spec.id} retained report`);
  assert(report.bytes.length === invocation.report.bytes && report.bytes.length === spec.expectedReportBytes,
    `${spec.id}: report byte count differs`);
  assert(report.value.operation === spec.reportOperation, `${spec.id}: report operation differs`);
  assert(report.value.provider?.id === 'ghidra' && report.value.provider.version === '12.1.4',
    `${spec.id}: report provider differs`);
  checkHash(report.value.subject?.digest?.sha256, expectedHashes.pe, `${spec.id} report subject`);
  const profile = report.value.analysis_profile;
  assert(profile?.provider?.id === 'ghidra' && profile.provider.version === '12.1.4'
    && profile.digest === EXPECTED_PROFILE_DIGEST,
  `${spec.id}: analysis profile provider/digest differs`);
  const parameters = profile.parameters;
  assert(parameters?.architecture === 'x86', `${spec.id}: analysis profile architecture differs`);
  const seededEntries = parameters.analysis_seeds?.entries;
  assert(seededEntries?.function === 1 && seededEntries.code === 0 && seededEntries.label === 0,
    `${spec.id}: analysis profile does not contain exactly the shared function seed`);
  checkHash(parameters.analysis_seeds?.sha256, expectedHashes.seed, `${spec.id} report seed`);
  assert(report.value.authority === 'shipped-artifact' && report.value.confidence === 'observed',
    `${spec.id}: report authority/confidence differs`);

  const stderr = read(`${spec.directory}/${invocation.stderr.path}`);
  checkHash(stderr.sha256, invocation.stderr.sha256, `${spec.id} stderr invocation binding`);
  assert(stderr.bytes.length === invocation.stderr.bytes && stderr.bytes.length === 0,
    `${spec.id}: stderr is not the expected empty file`);

  const normalized = report.value.normalized_result;
  assert(normalized && typeof normalized === 'object', `${spec.id}: normalized result is missing`);
  assert(report.value.raw_result === null, `${spec.id}: retained report raw_result shape differs`);
  const expectedParameter = spec.reportOperation === 'analyze_function'
    ? { procedure: ENTRY }
    : { address: spec.address };
  assert(sameJson(report.value.parameters, expectedParameter), `${spec.id}: query parameter differs`);

  return {
    spec,
    invocation,
    invocationSource: {
      path: relativePath(invocationFile.full),
      sha256: invocationFile.sha256,
      bytes: invocationFile.bytes.length,
    },
    report: report.value,
    reportSource: { path: relativePath(report.full), sha256: report.sha256, bytes: report.bytes.length },
    stderrSource: { path: relativePath(stderr.full), sha256: stderr.sha256, bytes: stderr.bytes.length },
    profileDigest: profile.digest,
  };
}

function validateStaticReferenceInventory(result) {
  const callers = result.callers;
  const callees = result.callees;
  const unresolvedCalls = result.unresolved_calls;
  const incomingReferences = result.incoming_references;
  assert(Array.isArray(callers) && sameJson(callers, []),
    'SCREEN-AND-STORE normalized caller inventory is not exactly empty');
  assert(Array.isArray(callees) && sameJson(callees, []),
    'SCREEN-AND-STORE normalized callee inventory is not exactly empty');
  assert(Array.isArray(unresolvedCalls) && unresolvedCalls.length === 72,
    'SCREEN-AND-STORE normalized unresolved-call inventory does not contain exactly 72 entries');
  const unresolvedAddresses = unresolvedCalls.map(item => {
    assert(item.reason === 'Instruction decoder identifies a call but ReferenceManager supplies no call destination',
      'SCREEN-AND-STORE unresolved-call inventory has an unexpected reason');
    const callAddress = address(item.address, 'unresolved-call address');
    assert(callAddress >= address(ENTRY, 'entry') && callAddress <= address(BODY_END, 'body end'),
      `Unresolved call ${item.address} is outside the reported function body`);
    return item.address;
  });
  assert(new Set(unresolvedAddresses).size === 72, 'SCREEN-AND-STORE unresolved-call addresses are duplicated');
  assert(unresolvedAddresses.includes(CALL_SITE) && unresolvedAddresses.includes(LATER_CALL),
    'SCREEN-AND-STORE unresolved-call inventory omits one of the queried computed calls');

  const expectedIncomingReference = {
    source_address: '0x1fe200a8',
    target_address: ENTRY,
    source_procedure: null,
    target_procedure: {
      address: ENTRY,
      name: result.procedure?.name,
      symbol: result.procedure?.symbol,
      classification: result.procedure?.classification,
      body: result.procedure?.body,
    },
    kind: {
      available: true,
      provenance: 'ghidra-reference-manager',
      type: 'DATA',
      flow: false,
      call: false,
      jump: false,
      data: true,
      read: false,
      write: false,
      indirect: false,
      computed: false,
      conditional: false,
      terminal: false,
      primary: true,
      operand_index: 0,
      external: false,
    },
  };
  assert(Array.isArray(incomingReferences) && incomingReferences.length === 1
    && sameJson(incomingReferences, [expectedIncomingReference]),
  'SCREEN-AND-STORE normalized incoming-reference inventory is not the single expected DATA reference');

  return {
    callerCount: callers.length,
    calleeCount: callees.length,
    unresolvedCallCount: unresolvedCalls.length,
    incomingReferences: incomingReferences.map(reference => ({
      sourceAddress: reference.source_address,
      targetAddress: reference.target_address,
      type: reference.kind.type,
      call: reference.kind.call,
      data: reference.kind.data,
      classification: 'non-call static data reference; not a caller',
    })),
  };
}

function validateFunction(run, source, peInfo) {
  const result = run.report.normalized_result;
  const referenceInventory = validateStaticReferenceInventory(result);
  const procedure = result.procedure;
  assert(procedure?.name === 'SCREEN_AND_STORE' && procedure.address === ENTRY,
    'Seeded REA function report does not identify the synthetic SCREEN-AND-STORE procedure');
  const body = procedure.body;
  assert(body?.available === true && body.provenance === 'ghidra-function-body-address-set'
    && body.contains_entry === true && body.non_contiguous === false
    && body.total_bytes === 1216 && body.span_bytes === 1216
    && sameJson(body.ranges, [{ start: ENTRY, end: BODY_END }]),
  'Synthetic SCREEN-AND-STORE procedure body differs from the retained complete bounded body');
  assert(address(BODY_END, 'body end') - address(ENTRY, 'entry') + 1n === 1216n,
    'SCREEN-AND-STORE body address range does not span 1216 inclusive bytes');
  const payloadBodyDifference = source.payloadBytes.length - body.total_bytes;
  assert(source.payloadBytes.length === 1224 && body.total_bytes === 1216 && payloadBodyDifference === 8,
    'SCREEN-AND-STORE payload/body byte-length difference differs from the retained source and report');

  const assembly = result.assembly;
  assert(Array.isArray(assembly) && assembly.length === 424,
    'SCREEN-AND-STORE function report does not contain exactly 424 decoded instructions');
  const assemblyAddresses = assembly.map(line => {
    const match = line.match(/^(0x[0-9a-f]+): /iu);
    assert(match, 'SCREEN-AND-STORE assembly line has no address');
    const addressValue = address(match[1], 'assembly address');
    assert(addressValue >= address(ENTRY, 'entry') && addressValue <= address(BODY_END, 'body end'),
      `Assembly address ${match[1]} is outside the reported function body`);
    return match[1].toLowerCase();
  });
  assert(new Set(assemblyAddresses).size === 424, 'SCREEN-AND-STORE assembly addresses are duplicated');
  assert(Array.isArray(result.basic_blocks) && result.basic_blocks.length === 79,
    'SCREEN-AND-STORE function report does not contain exactly 79 basic blocks');

  const expectedAssembly = [
    '0x1fe24d12: CALL EDI',
    '0x1fe24d14: MOV dword ptr [EBP + -0x44], EAX',
    '0x1fe24d17: MOV EAX, dword ptr [EBP + -0x44]',
    '0x1fe24d20: CMP EDX, dword ptr [EDI + -0x41]',
    '0x1fe24d23: JNZ 0x1fe24d28',
    '0x1fe24d25: CALL dword ptr [EDI + -0x71]',
    '0x1fe24d2c: TEST BL, 0x3',
    '0x1fe24d2f: JNZ 0x1fe24d90',
  ];
  const instructionIndices = expectedAssembly.map(line => {
    const index = assembly.indexOf(line);
    assert(index >= 0, `SCREEN-AND-STORE assembly is missing ${line}`);
    return index;
  });
  assert(instructionIndices.every((index, i) => i === 0 || instructionIndices[i - 1] < index),
    'SCREEN-AND-STORE return save/reload, conditional call, and low-tag test order differs');
  assert(instructionIndices[5] < instructionIndices[6], 'Later indirect call is not before the low-tag test');

  const flow = result.native_value_flow;
  assert(flow?.available === true && flow.provenance === 'ghidra-high-pcode'
    && Array.isArray(flow.operations) && Array.isArray(flow.def_use),
  'SCREEN-AND-STORE high-pcode/native-value-flow evidence is unavailable');
  assert(flow.truncated === false && flow.omitted_operations_lower_bound === 0
    && flow.known_omitted_inputs === 0 && flow.known_omitted_edges === 0
    && flow.operations.length === 755 && flow.def_use.length === 799,
  'SCREEN-AND-STORE high-pcode evidence is truncated, incomplete, or has omissions');
  const operationById = new Map(flow.operations.map(item => [item.id, item]));
  assert(operationById.size === 755, 'SCREEN-AND-STORE high-pcode operation IDs are duplicated');
  for (const edge of flow.def_use) {
    const definition = operationById.get(edge.definition);
    const use = operationById.get(edge.use);
    assert(definition && use, 'SCREEN-AND-STORE high-pcode def-use edge references an absent operation');
    assert(definition.output && Number.isInteger(edge.input_index)
      && edge.input_index >= 0 && edge.input_index < use.inputs.length,
    'SCREEN-AND-STORE high-pcode def-use edge has an invalid output or input index');
  }

  const operation = id => {
    const found = flow.operations.filter(item => item.id === id);
    assert(found.length === 1, `SCREEN-AND-STORE high-pcode operation ${id} is absent or duplicated`);
    return found[0];
  };
  const call = operation('0x1fe24d12#1005');
  const compare = operation('0x1fe24d20#1025');
  const branchAroundLaterCall = operation('0x1fe24d23#1031');
  const laterCallAddress = operation('0x1fe24d25#1032');
  const laterCallAddressCast = operation('0x1fe24d25#6352');
  const laterCallTarget = operation('0x1fe24d25#1033');
  const laterCall = operation('0x1fe24d25#1037');
  const lowTagAnd = operation('0x1fe24d2c#3435');
  const lowTagZeroCheck = operation('0x1fe24d2c#1052');
  const lowTagBranch = operation('0x1fe24d2f#1058');
  assert(call.opcode === 'CALLIND' && call.inputs?.[0]?.location === 'register:0x1c'
    && call.output?.location === 'register:0x0',
  'SCREEN-AND-STORE high-pcode CALL EDI does not identify EDI as a computed target and EAX as output');
  assert(compare.opcode === 'INT_EQUAL' && compare.output?.location === 'register:0x206'
    && branchAroundLaterCall.opcode === 'CBRANCH'
    && branchAroundLaterCall.inputs?.[0]?.location === '0x1fe24d28',
  'SCREEN-AND-STORE conditional control-flow operation before the later indirect call differs');
  assert(laterCallAddress.opcode === 'PTRADD' && laterCallAddress.inputs?.[0]?.location === 'register:0x1c'
    && laterCallAddress.inputs?.[1]?.constant_hex === 'ffffff8f'
    && laterCallAddressCast.opcode === 'CAST'
    && laterCallAddressCast.inputs?.[0]?.location === laterCallAddress.output?.location
    && laterCallTarget.opcode === 'LOAD'
    && laterCallTarget.inputs?.[1]?.location === laterCallAddressCast.output?.location
    && laterCall.opcode === 'CALLIND'
    && laterCall.inputs?.[0]?.location === laterCallTarget.output?.location,
  'SCREEN-AND-STORE later computed call does not follow the reported EDI-0x71 target-load sequence');
  assert(lowTagAnd.opcode === 'INT_AND' && lowTagAnd.inputs?.[1]?.constant_hex === '3'
    && lowTagZeroCheck.opcode === 'INT_EQUAL'
    && lowTagZeroCheck.inputs?.[0]?.location === lowTagAnd.output?.location
    && lowTagZeroCheck.inputs?.[1]?.constant_hex === '0'
    && lowTagBranch.opcode === 'CBRANCH'
    && lowTagBranch.inputs?.[0]?.location === '0x1fe24d90',
  'SCREEN-AND-STORE high-pcode low-tag test/branch differs');

  const expectedDefUse = [
    ['0x1fe24d20#1025', '0x1fe24d23#1031', 1],
    ['0x1fe24d25#1032', '0x1fe24d25#6352', 0],
    ['0x1fe24d25#6352', '0x1fe24d25#1033', 1],
    ['0x1fe24d25#1033', '0x1fe24d25#1037', 0],
    ['0x1fe24d2a#1041', '0x1fe24d2c#3435', 0],
    ['0x1fe24d2c#3435', '0x1fe24d2c#1052', 0],
    ['0x1fe24d2c#1052', '0x1fe24d2f#1058', 1],
  ];
  for (const [definition, use, inputIndex] of expectedDefUse) {
    const matches = flow.def_use.filter(edge => edge.definition === definition && edge.use === use
      && edge.input_index === inputIndex);
    assert(matches.length === 1, `SCREEN-AND-STORE high-pcode def-use link ${definition} -> ${use} is absent or duplicated`);
  }

  const branchBytes = [
    { address: '0x1fe24d23', offsetFromEntry: 0x2b7, bytes: '7503', assembly: expectedAssembly[4] },
    { address: '0x1fe24d2f', offsetFromEntry: 0x2c3, bytes: '755f', assembly: expectedAssembly[7] },
  ].map(item => {
    const sourceSlice = source.payloadBytes.subarray(item.offsetFromEntry, item.offsetFromEntry + item.bytes.length / 2);
    const peSlice = peInfo.copiedPayload.subarray(item.offsetFromEntry, item.offsetFromEntry + item.bytes.length / 2);
    exactBytes(sourceSlice, item.bytes, `${item.address} original PLL branch`);
    exactBytes(peSlice, item.bytes, `${item.address} synthetic PE branch`);
    assert(address(item.address, 'branch address') === address(ENTRY, 'entry') + BigInt(item.offsetFromEntry),
      `${item.address}: address does not match its payload offset`);
    assert(assembly.includes(item.assembly), `${item.address}: exact branch disassembly differs`);
    return {
      address: item.address,
      payloadOffset: item.offsetFromEntry,
      bytes: item.bytes,
      sourceAndCopiedPeBytesMatch: true,
      disassembly: item.assembly.slice(item.assembly.indexOf(': ') + 2),
    };
  });
  const callReturnBytes = [
    { address: CALL_SITE, offsetFromEntry: 0x2a6, bytes: 'ffd7', assembly: expectedAssembly[0] },
    { address: '0x1fe24d14', offsetFromEntry: 0x2a8, bytes: '8945bc', assembly: expectedAssembly[1] },
    { address: '0x1fe24d17', offsetFromEntry: 0x2ab, bytes: '8b45bc', assembly: expectedAssembly[2] },
  ].map(item => {
    const sourceSlice = source.payloadBytes.subarray(item.offsetFromEntry, item.offsetFromEntry + item.bytes.length / 2);
    const peSlice = peInfo.copiedPayload.subarray(item.offsetFromEntry, item.offsetFromEntry + item.bytes.length / 2);
    exactBytes(sourceSlice, item.bytes, `${item.address} original PLL instruction`);
    exactBytes(peSlice, item.bytes, `${item.address} synthetic PE instruction`);
    assert(address(item.address, 'instruction address') === address(ENTRY, 'entry') + BigInt(item.offsetFromEntry),
      `${item.address}: instruction address does not match its payload offset`);
    assert(assembly.includes(item.assembly), `${item.address}: exact instruction disassembly differs`);
    return {
      address: item.address,
      payloadOffset: item.offsetFromEntry,
      bytes: item.bytes,
      sourceAndCopiedPeBytesMatch: true,
      disassembly: item.assembly.slice(item.assembly.indexOf(': ') + 2),
    };
  });

  return {
    procedure: {
      syntheticAddress: procedure.address,
      seededLabel: procedure.name,
      labelIsAnalystAssertion: true,
      body: {
        available: body.available,
        ranges: body.ranges,
        totalBytes: body.total_bytes,
        spanBytes: body.span_bytes,
        contiguous: !body.non_contiguous,
        containsEntry: body.contains_entry,
      },
      instructionCount: assembly.length,
      basicBlockCount: result.basic_blocks.length,
    },
    sourceLengthComparison: {
      payloadBytes: source.payloadBytes.length,
      bodyBytes: body.total_bytes,
      payloadMinusBodyBytes: payloadBodyDifference,
    },
    referenceInventory,
    callReturnAndFollowingFlow: {
      assembly: expectedAssembly,
      instructionIndices,
      callReturnBytes,
      callOperation: { id: call.id, opcode: call.opcode, inputs: call.inputs, output: call.output },
      laterCallTargetOperations: [laterCallAddress, laterCallAddressCast, laterCallTarget, laterCall].map(item => ({
        id: item.id, opcode: item.opcode, inputs: item.inputs, output: item.output,
      })),
      conditionalBranchOperation: {
        id: branchAroundLaterCall.id,
        opcode: branchAroundLaterCall.opcode,
        inputs: branchAroundLaterCall.inputs,
      },
      lowTagOperations: [lowTagAnd, lowTagZeroCheck, lowTagBranch].map(item => ({
        id: item.id, opcode: item.opcode, inputs: item.inputs, output: item.output,
      })),
      defUse: expectedDefUse.map(([definition, use, inputIndex]) => ({ definition, use, inputIndex })),
      branchBytes,
    },
    highPcodeCompleteness: {
      available: flow.available,
      provenance: flow.provenance,
      truncated: flow.truncated,
      operations: flow.operations.length,
      defUseEdges: flow.def_use.length,
      omittedOperationsLowerBound: flow.omitted_operations_lower_bound,
      knownOmittedInputs: flow.known_omitted_inputs,
      knownOmittedEdges: flow.known_omitted_edges,
      uniqueOperationIds: operationById.size,
      allDefUseReferencesValid: true,
    },
  };
}

function validateCallResolution(run, expectedCallSite) {
  const result = run.report.normalized_result;
  assert(result?.call_site === expectedCallSite && result.procedure === ENTRY
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

function main() {
  const outputPath = outputPathFromArgs(process.argv.slice(2));
  const outputFull = safeOutputFullPath(outputPath);

  const bindingFile = readJson(BINDING_PATH);
  const source = validateSourceBinding(bindingFile);
  const peInfo = validateSyntheticPe(source.binding, source);
  const toolchain = readJson(TOOLCHAIN_PATH);
  checkHash(toolchain.sha256, EXPECTED_TOOLCHAIN_SHA256, 'REA 6.8.0 toolchain record');
  assert(toolchain.value.reaVersion === '6.8.0' && toolchain.value.releaseTag === 'rea-agents-6.8.0'
    && toolchain.value.releaseCommitShort === '160d821', 'REA 6.8.0 toolchain record identity differs');

  const expectedHashes = {
    pe: peInfo.pe.sha256,
    seed: peInfo.seed.sha256,
    toolchain: toolchain.sha256,
  };
  const runs = RUNS.map(spec => readRun(spec, expectedHashes));
  const [functionRun, callRun, laterCallRun] = runs;
  assert(new Set(runs.map(run => run.profileDigest)).size === 1,
    'Function and computed-call reports do not share the same REA/Ghidra analysis profile');
  const functionEvidence = validateFunction(functionRun, source, peInfo);
  const callResolution = validateCallResolution(callRun, CALL_SITE);
  const laterCallResolution = validateCallResolution(laterCallRun, LATER_CALL);

  const helper = read(relativePath(fileURLToPath(import.meta.url)));
  const output = {
    schemaVersion: 1,
    investigation: 'SCREEN-AND-STORE computed-call return and following conditional flow from retained REA static reports',
    status: 'static synthetic-input evidence validated',
    sourceBinding: {
      functionName: source.mappedFunction.name,
      attribution: 'The SCREEN-AND-STORE name and mapping label are analyst assertions; object and payload bytes were independently rechecked.',
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
        mappedPrefixHex: source.mappedFunction.prefixHex.toLowerCase(),
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
        record: `${ENTRY}\tfunction\tSCREEN_AND_STORE`,
        nameIsAnalystAssertion: true,
      },
      toolchain: {
        path: toolchain.path,
        sha256: toolchain.sha256,
        reaVersion: toolchain.value.reaVersion,
        releaseTag: toolchain.value.releaseTag,
        releaseCommitShort: toolchain.value.releaseCommitShort,
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
    conditionalLaterCall: laterCallResolution,
    sourceBytesRechecked: {
      pllPayloadSha256: source.payloadFile.sha256,
      syntheticCopiedPayloadSha256: sha(peInfo.copiedPayload),
      originalPllPayloadEqualsSyntheticCopy: true,
      branchBytes: functionEvidence.callReturnAndFollowingFlow.branchBytes,
    },
    limits: [
      'The static analysis input is an analyst-generated synthetic PE containing copied SCREEN-AND-STORE payload bytes; the PE and reports assert static-only analysis and inputWasExecuted=false.',
      'The seeded SCREEN-AND-STORE label and source-map function name are analyst assertions; the reported function body is a Ghidra boundary on the synthetic image, not a recovered original-source boundary.',
      'The disassembly shows CALL EDI followed by a return-value save and reload, then a conditional later indirect call before the low-tag test; no runtime path or branch outcome was observed.',
      'Both computed calls remain unresolved with no static target addresses; no runtime call target was recovered.',
      'No direct Lisp caller, runtime identity or behavior, native ABI, or calling convention was established.',
    ],
    derivedBy: { path: helper.path, sha256: helper.sha256, bytes: helper.bytes.length },
  };

  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  writeFileSync(outputFull, serialized, { flag: 'wx' });
  process.stdout.write(`Wrote ${outputPath} (${Buffer.byteLength(serialized)} bytes)\n`);
}

try { main(); }
catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
