#!/usr/bin/env node

// Rebuild and validate the static REA call-target census for both
// SELECT-SUBJECT methods. This consumes only archived dossiers and REA output;
// it does not launch AARON, REA, Ghidra, or a debugger.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '../..');
const DEFAULT_OUTPUT = 'research/introspection/evidence/select-subject-call-census-20261014-v1.json';

const METHODS = [
  {
    index: 0,
    name: 'SELECT-SUBJECT-METHOD-0',
    specializer: 'FREE',
    entry: '0x1fe4be74',
    dossierRoot: 'research/artifacts/rea-tools/select-subject-method-20261014-method0-function-scoped-v1',
    bindingPath: 'research/artifacts/rea-tools/select-subject-method-20261014-method0-input-v1/select-subject-method-0.binding.json',
    queryRoots: {
      '0x1fe4be80': 'research/artifacts/rea-tools/select-subject-call-target-probe-v1-free-be80-elevated',
      '0x1fe4be89': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4be89',
      '0x1fe4bea4': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4bea4',
      '0x1fe4beac': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4beac',
      '0x1fe4beb7': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4beb7',
      '0x1fe4bed7': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4bed7',
      '0x1fe4bee2': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4bee2',
      '0x1fe4beed': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4beed',
      '0x1fe4befc': 'research/artifacts/rea-tools/select-subject-method-20261014-method0-callsite-retry-elevated-v1',
      '0x1fe4bf08': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4bf08',
      '0x1fe4bf18': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4bf18',
      '0x1fe4bf28': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4bf28',
      '0x1fe4bf38': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4bf38',
      '0x1fe4bf48': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4bf48',
      '0x1fe4bf58': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4bf58',
      '0x1fe4bf91': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4bf91',
      '0x1fe4bf9c': 'research/artifacts/rea-tools/select-subject-call-targets-v1-free-1fe4bf9c',
    },
  },
  {
    index: 1,
    name: 'SELECT-SUBJECT-METHOD-1',
    specializer: 'PREMIUM',
    entry: '0x1fe4bfb4',
    dossierRoot: 'research/artifacts/rea-tools/select-subject-method-20261014-function-scoped-v2',
    bindingPath: 'research/artifacts/rea-tools/select-subject-method-20261014-input/select-subject-method-1.binding.json',
    queryRoots: {
      '0x1fe4bfc0': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-a-bfc0',
      '0x1fe4bfc9': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-a-bfc9',
      '0x1fe4bfeb': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-a-bfeb',
      '0x1fe4bff6': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-a-bff6',
      '0x1fe4c001': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-a-c001',
      '0x1fe4c026': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-a-c026',
      '0x1fe4c031': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-a-c031',
      '0x1fe4c03c': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-a-c03c',
      '0x1fe4c05a': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-a-c05a',
      '0x1fe4c062': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-b-1fe4c062',
      '0x1fe4c06d': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-b-1fe4c06d',
      '0x1fe4c07c': 'research/artifacts/rea-tools/select-subject-method-20261014-callsite-scoped-v1',
      '0x1fe4c088': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-b-1fe4c088',
      '0x1fe4c098': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-b-1fe4c098',
      '0x1fe4c0a8': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-b-1fe4c0a8',
      '0x1fe4c0b8': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-b-1fe4c0b8',
      '0x1fe4c0cb': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-b-1fe4c0cb',
      '0x1fe4c104': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-b-1fe4c104',
      '0x1fe4c10f': 'research/artifacts/rea-tools/select-subject-call-targets-v1-premium-b-1fe4c10f',
    },
  },
];

const METHOD_IDENTITY_PATH = 'research/introspection/evidence/select-subject-method-identity-20261014-v2.json';
const HEX64 = /^[0-9a-f]{64}$/u;

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, output: DEFAULT_OUTPUT, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo-root') args.root = resolve(argv[++i] ?? '');
    else if (arg === '--out') args.output = argv[++i] ?? '';
    else if (arg === '--overwrite') args.overwrite = true;
    else if (arg === '--help') {
      process.stdout.write('Usage: node research/tools/derive-select-subject-call-census-evidence.mjs [--repo-root PATH] [--out PATH] [--overwrite]\n');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.output) throw new Error('--out requires a path');
  return args;
}

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
function repoRelative(root, path) {
  return relative(root, resolve(root, path)).split(sep).join('/');
}
function exactHash(actual, expected, context) {
  assert(typeof expected === 'string' && HEX64.test(expected), `${context}: expected SHA-256 is missing or malformed`);
  assert(actual === expected.toLowerCase(), `${context}: SHA-256 mismatch; actual=${actual}, expected=${expected}`);
}
function equalJson(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function normalizedAddress(value) { return typeof value === 'string' ? value.toLowerCase() : value; }

function requireReportPair(root, dir, expectedAddress, expectedOperation, binding, label) {
  const invocationPath = `${dir}/rea-invocation.json`;
  const reportPath = `${dir}/rea-result.json`;
  const invFile = json(root, invocationPath);
  const reportFile = json(root, reportPath);
  const invocation = invFile.value;
  const report = reportFile.value;

  assert(invocation.operation === expectedOperation, `${label}: unexpected REA operation ${invocation.operation}`);
  assert(normalizedAddress(invocation.address) === expectedAddress, `${label}: invocation address mismatch`);
  assert(invocation.provider === 'ghidra' && invocation.reaVersion === '6.4.0' && invocation.ghidraVersion === '12.1.4', `${label}: unexpected provider/tool versions`);
  assert(invocation.staticOnly === true && invocation.inputWasExecuted === false, `${label}: static-only / non-execution metadata is missing`);
  exactHash(reportFile.sha256, invocation.report?.sha256, `${label} report metadata`);
  assert(invocation.report.bytes === reportFile.bytes.length, `${label}: invocation report byte count mismatch`);
  exactHash(report.subject?.digest?.sha256, invocation.input?.sha256, `${label} report subject/input`);
  assert(report.provider?.id === 'ghidra' && report.provider?.version === invocation.ghidraVersion, `${label}: provider record mismatch`);
  const reportAddress = expectedOperation === 'function'
    ? report.parameters?.procedure
    : report.parameters?.address;
  assert(normalizedAddress(reportAddress) === expectedAddress, `${label}: report parameter address mismatch`);
  const seedHash = report.analysis_profile?.parameters?.analysis_seeds?.sha256;
  exactHash(seedHash, invocation.seed?.sha256, `${label} report seed metadata`);
  if (expectedOperation !== 'function') {
    const raw = report.raw_result;
    const normalized = report.normalized_result;
    assert(raw && normalized && equalJson(raw, normalized), `${label}: raw_result and normalized_result disagree`);
  }

  if (binding) {
    exactHash(invocation.input.sha256, binding.generatedPe.sha256, `${label} method PE binding`);
    exactHash(invocation.seed.sha256, binding.generatedSeed.sha256, `${label} method seed binding`);
  }
  return {
    invocation,
    report,
    invocationRecord: { path: repoRelative(root, invocationPath), sha256: invFile.sha256 },
    reportRecord: { path: repoRelative(root, reportPath), bytes: reportFile.bytes.length, sha256: reportFile.sha256 },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root;
  const identityFile = json(root, METHOD_IDENTITY_PATH);
  const identity = identityFile.value;
  assert(identity.schemaVersion === 1 && identity.finding?.methodCount === 2, 'Method identity evidence is not the expected two-method dossier record');
  const records = [];

  for (const method of METHODS) {
    const bindingFile = json(root, method.bindingPath);
    const binding = bindingFile.value;
    assert(binding.schemaVersion === 1 && binding.functionName === method.name, `${method.name}: unexpected synthetic input binding`);
    assert(binding.originalPayload?.uniqueCompleteObjectMatch === true, `${method.name}: original payload is not a unique complete PLL object`);

    const sourceMapFile = read(root, binding.sourceMap.path);
    exactHash(sourceMapFile.sha256, binding.sourceMap.sha256, `${method.name} source map binding`);
    const pllFile = read(root, binding.originalPll.path);
    exactHash(pllFile.sha256, binding.originalPll.sha256, `${method.name} original PLL binding`);
    const generatedPePath = `${dirname(method.bindingPath)}/${binding.generatedPe.file}`;
    const generatedPeFile = read(root, generatedPePath);
    exactHash(generatedPeFile.sha256, binding.generatedPe.sha256, `${method.name} generated PE file`);
    const generatedSeedPath = `${dirname(method.bindingPath)}/${binding.generatedSeed.file}`;
    const generatedSeedFile = read(root, generatedSeedPath);
    exactHash(generatedSeedFile.sha256, binding.generatedSeed.sha256, `${method.name} generated seed file`);
    assert(binding.assertions?.generatedExecutableRun === false, `${method.name}: binding does not prohibit execution of generated PE`);

    const payload = binding.originalPayload;
    const object = pllFile.bytes.subarray(payload.pllObjectOffset, payload.pllEndExclusive);
    const pllPayload = pllFile.bytes.subarray(payload.pllPayloadOffset, payload.pllEndExclusive);
    assert(object.length === payload.pllEndExclusive - payload.pllObjectOffset, `${method.name}: invalid full-object range`);
    assert(pllPayload.length === payload.bytes, `${method.name}: invalid payload range`);
    exactHash(sha(object), payload.objectSha256, `${method.name} complete PLL object`);
    exactHash(sha(pllPayload), payload.sha256, `${method.name} PLL payload`);

    const dossier = requireReportPair(root, method.dossierRoot, method.entry, 'function', binding, `${method.name} function dossier`);
    const procedure = dossier.report.normalized_result?.procedure;
    assert(procedure?.address === method.entry && procedure?.body?.available === true, `${method.name}: dossier does not describe expected procedure`);
    assert(procedure.name === method.name.replaceAll('-', '_'), `${method.name}: dossier name differs from binding`);
    const dossierAssembly = dossier.report.normalized_result.assembly;
    assert(Array.isArray(dossierAssembly), `${method.name}: dossier has no instruction listing`);
    const callInstructions = dossierAssembly.filter(line => typeof line === 'string' && /^0x[0-9a-f]+:\s+CALL\b/iu.test(line));
    const callsByAddress = new Map(callInstructions.map(line => [line.slice(0, line.indexOf(':')).toLowerCase(), line]));
    assert(callsByAddress.size === callInstructions.length, `${method.name}: duplicate call instruction address in dossier`);
    const expectedAddresses = Object.keys(method.queryRoots).sort((a, b) => Number.parseInt(a.slice(2), 16) - Number.parseInt(b.slice(2), 16));
    assert(expectedAddresses.length === (method.index === 0 ? 17 : 19), `${method.name}: query manifest has wrong cardinality`);
    assert(equalJson([...callsByAddress.keys()].sort((a, b) => Number.parseInt(a.slice(2), 16) - Number.parseInt(b.slice(2), 16)), expectedAddresses), `${method.name}: query manifest does not cover exactly every dossier CALL instruction`);

    const identityMethod = identity.finding.methods.find(item => item.name === method.name);
    const identityPayload = identityMethod?.mappedNativePayload;
    assert(identityMethod?.eqlSpecializer?.symbol === method.specializer, `${method.name}: identity dossier specializer mismatch`);
    assert(identityPayload?.runtimeEntry === method.entry, `${method.name}: identity dossier entry mismatch`);
    assert(identityPayload.completeUniquePllObjectMatch === true
      && identityPayload.pll.objectOffset === payload.pllObjectOffset
      && identityPayload.pll.payloadOffset === payload.pllPayloadOffset
      && identityPayload.pll.rawEnd === payload.pllEndExclusive
      && identityPayload.pll.objectBytes === object.length
      && identityPayload.pll.payloadBytes === pllPayload.length,
    `${method.name}: method identity dossier object/payload extents differ from binding`);
    exactHash(identityPayload.pll.objectSha256, payload.objectSha256, `${method.name} identity dossier object hash`);
    exactHash(identityPayload.pll.payloadSha256, payload.sha256, `${method.name} identity dossier payload hash`);
    exactHash(identityFile.sha256, identityFile.value ? sha(identityFile.bytes) : '', 'identity evidence');

    const queryRows = [];
    for (const address of expectedAddresses) {
      const instruction = callsByAddress.get(address);
      assert(instruction, `${method.name} ${address}: no exact call instruction in dossier`);
      const queryRoot = method.queryRoots[address];
      const queryPair = requireReportPair(root, queryRoot, address, 'resolve-native-call-targets', binding, `${method.name} ${address}`);
      const result = queryPair.report.normalized_result;
      assert(result.call_site === address && result.procedure === method.entry, `${method.name} ${address}: target query address/procedure mismatch`);
      assert(result.status === 'unresolved' && result.mechanism === 'computed'
        && Array.isArray(result.targets) && result.targets.length === 0,
      `${method.name} ${address}: expected unresolved computed call with no static targets`);
      queryRows.push({
        address,
        instruction,
        queryRoot: repoRelative(root, queryRoot),
        status: result.status,
        mechanism: result.mechanism,
        targets: result.targets,
        report: queryPair.reportRecord,
        invocation: queryPair.invocationRecord,
      });
    }

    records.push({
      method: method.name,
      methodIndex: method.index,
      specializer: { kind: 'EQL', symbol: method.specializer },
      entry: method.entry,
      sourceBinding: {
        binding: { path: repoRelative(root, method.bindingPath), sha256: bindingFile.sha256 },
        sourceMap: { path: repoRelative(root, binding.sourceMap.path), sha256: sourceMapFile.sha256 },
        originalPll: { path: repoRelative(root, binding.originalPll.path), bytes: pllFile.bytes.length, sha256: pllFile.sha256 },
        originalCompiledObject: {
          offset: payload.pllObjectOffset,
          bytes: object.length,
          sha256: payload.objectSha256,
        },
        originalPayload: {
          offset: payload.pllPayloadOffset,
          bytes: pllPayload.length,
          sha256: payload.sha256,
        },
        generatedPe: { path: repoRelative(root, generatedPePath), bytes: generatedPeFile.bytes.length, sha256: generatedPeFile.sha256 },
        generatedSeed: { path: repoRelative(root, generatedSeedPath), bytes: generatedSeedFile.bytes.length, sha256: generatedSeedFile.sha256 },
        generatedPeExecuted: false,
      },
      functionDossier: {
        report: dossier.reportRecord,
        invocation: dossier.invocationRecord,
        callInstructionCount: callInstructions.length,
      },
      calls: queryRows,
    });
  }

  const allCalls = records.flatMap(row => row.calls);
  assert(allCalls.length === 36 && new Set(allCalls.map(call => call.address)).size === 36, 'Expected 36 distinct, validated call-site queries');
  const output = {
    schemaVersion: 1,
    status: 'validated-static-callsite-census-targets-unresolved',
    question: 'Does REA resolve any computed indirect call target in either SELECT-SUBJECT method?',
    summary: {
      methodCount: records.length,
      callsiteQueryCount: allCalls.length,
      freeCallsiteCount: records[0].calls.length,
      premiumCallsiteCount: records[1].calls.length,
      unresolvedComputedCount: allCalls.filter(call => call.status === 'unresolved' && call.mechanism === 'computed' && call.targets.length === 0).length,
      resolvedTargetCount: allCalls.reduce((sum, call) => sum + call.targets.length, 0),
      perMethodPeAndSeedHashesConsistent: true,
      rawAndNormalizedResultsAgreeForEveryQuery: true,
      allInputsStaticOnlyAndNotExecuted: true,
    },
    methodIdentityDossier: {
      path: METHOD_IDENTITY_PATH,
      sha256: identityFile.sha256,
    },
    methods: records,
    interpretation: 'All 36 calls are present in the REA function dossiers, and their targeted static queries report unresolved computed calls with no targets. This is a static-reference result only; it is not an application-wide runtime call graph.',
    limitations: [
      'REA/Ghidra analyzed analyst-generated synthetic PE files containing exact copied AARON.pll method payloads plus generated headers and padding. The synthetic PE files were not executed.',
      'The queries report static Ghidra call-reference observations. An unresolved computed call does not identify its runtime target, and no runtime execution or call target was captured by this census.',
      'The census does not establish the Lisp calling convention, function names behind the indirect calls, or whole-program caller/callee behavior.',
    ],
  };

  const outputPath = resolve(root, args.output);
  const bytes = Buffer.from(`${JSON.stringify(output, null, 2)}\n`, 'utf8');
  const flag = args.overwrite ? 'w' : 'wx';
  writeFileSync(outputPath, bytes, { flag });
  process.stdout.write(`${JSON.stringify({ output: repoRelative(root, outputPath), bytes: bytes.length, sha256: sha(bytes), ...output.summary }, null, 2)}\n`);
}

try { main(); }
catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
