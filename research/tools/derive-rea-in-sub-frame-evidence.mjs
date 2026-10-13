#!/usr/bin/env node
// Offline derivation only: never launches REA, Ghidra, AARON or the generated PE.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = 'research/introspection/evidence/rea-in-sub-frame-20261012.json';
const MAP = 'research/extracted/local-oracle/brush-stroke-native-seed1234-20261005-e/native-code/mapped/native-code-map.json';
const PLL = 'research/extracted/aaron/application/AARON.pll';
const PAYLOAD = 'research/extracted/local-oracle/brush-stroke-native-seed1234-20261005-e/native-code/mapped/in-sub-frame.native-payload.bin';
const BUNDLE = 'research/artifacts/rea-tools/rea-in-sub-frame-20261012-b';
const REA_PACKAGE = 'research/artifacts/rea-tools/rea-6.4.0/node_modules/rea-agents/package.json';
const REA_REPORT = `${BUNDLE}/in-sub-frame.rea-function.json`;
const V6_EVIDENCE = 'research/introspection/evidence/brush-stroke-value0-20261012-index4-v6.json';
const V6_OBSERVER = 'research/introspection/brush-stroke-value0-capture-v6-index4.cl';
const V6_RUN = 'research/extracted/local-oracle/brush-stroke-value0-index4-capture-20261012-a';
const V6_SUMMARY = `${V6_RUN}/summary.json`;
const V6_TAPE = `${V6_RUN}/capture/aaron-brush-stroke-value0-v6-index4.txt`;
const ENTRY = '0x1fe0ea2c';
const PIN = Object.freeze({
  map: '790523f2eea2f2e02afd674a596b7751f3155fc302bc4ac0b236ddd8d53dc786',
  pll: '7ffc7dc9e3e62b1c5ba3612630b8747778324fa674dac42916be3e90bb96504c',
  payload: 'e2eac4f8f846d8d4ef5e46502af4ac8fe7b409a6ef1e80a49d19b135ee372dc4',
  binding: '1d88a54dec061912a95268c511b4bcc5008cbb6ade900a88535d4e8d485b72fb',
  pe: '817fb2ae120d2a20e767a1a8ecee34ae576b2ade703b04ea87437ae796888920',
  seed: 'f0e4ad3b190d4cdb915370722fb3353f0f7b049ac0790692a8ab5a6ce9d8a3c5',
  reaPackage: '1c6244e5689db5354fffc0e92f4ee0e0237c3a6d645de564ade2d8375fa570f9',
  reaReport: 'd3d0872def64b69df2f082fbb4d4fd6625552649cac051e292eb4eb6cd79b36d',
  v6Evidence: 'ac37cc749eea4afaacbfb2b9984168a0b0c50ecceaf4b94b8efc672e74f92580',
  v6Observer: '4e3818e78627048e5126b107a26c66949406918c41207014382fb9dcb2c996d6',
  v6Summary: 'da9bf8bc72f8ed2d902fe94181c91ba2e2db33612a365820f59686fd8322fb43',
  v6Tape: '64df9e9bdff47c06fe12eb0d5e3562ed5bb5d9e0e0157f965139c37c88100821',
});

const sources = new Map();
const assert = (condition, message) => { if (!condition) throw Error(message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = path => path.replaceAll('\\', '/');
const inside = (base, path) => {
  const rel = relative(base, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

function read(path, expectedSha256) {
  const absolute = resolve(ROOT, path);
  assert(inside(ROOT, absolute), `Input escapes repository: ${path}`);
  const bytes = readFileSync(absolute), digest = sha(bytes);
  assert(!expectedSha256 || digest === expectedSha256, `Source hash differs: ${path}`);
  const row = { path: portable(relative(ROOT, absolute)), sha256: digest, bytes: bytes.length };
  const previous = sources.get(row.path);
  assert(!previous || same(previous.row, row), `Source changed: ${row.path}`);
  sources.set(row.path, { absolute, row });
  return bytes;
}

function json(path, expectedSha256) {
  return JSON.parse(read(path, expectedSha256).toString('utf8').replace(/^\uFEFF/u, ''));
}

function sourceRow(path) {
  const found = sources.get(path);
  assert(found, `Source was not bound: ${path}`);
  return found.row;
}

function expectedPredicateTapeLine(sample, call) {
  assert(Number.isSafeInteger(call.eventId) && call.eventId >= 1,
    'IN-SUB-FRAME evidence eventId must be a positive safe integer');
  assert(Number.isSafeInteger(sample.strokeId) && sample.strokeId >= 1
    && Number.isSafeInteger(sample.sampleId) && sample.sampleId >= 1,
  'IN-SUB-FRAME evidence sample identity must use positive safe integers');
  assert(Array.isArray(call.arguments) && call.arguments.length === 2,
    'IN-SUB-FRAME evidence must contain exactly two arguments');
  assert(typeof call.accepted === 'boolean', 'IN-SUB-FRAME evidence result must be boolean');
  const args = call.arguments.map((argument, index) => {
    assert(argument?.kind === 'integer' && Number.isSafeInteger(argument.value),
      `IN-SUB-FRAME evidence argument ${index} must be a safe integer`);
    return `(:INTEGER ${argument.value})`;
  });
  // The v6 parser maps its single Lisp return to accepted=true (T) or false (NIL).
  const result = call.accepted ? '(:SYMBOL "COMMON-LISP" "T")' : '(:NIL)';
  return `IN-SUB-FRAME event=${call.eventId} stroke=${sample.strokeId} sample=${sample.sampleId}`
    + ` args=(${args.join(' ')}) values=(${result})`;
}

function derive() {
  const map = json(MAP, PIN.map);
  const pll = read(PLL, PIN.pll);
  const payload = read(PAYLOAD, PIN.payload);
  const bindingPath = `${BUNDLE}/in-sub-frame.binding.json`;
  const binding = json(bindingPath, PIN.binding);
  const pePath = `${BUNDLE}/${binding.generatedPe.file}`;
  const pe = read(pePath, PIN.pe);
  const seedPath = `${BUNDLE}/${binding.generatedSeed.file}`;
  const seed = read(seedPath, PIN.seed).toString('utf8');
  const reaPackage = json(REA_PACKAGE, PIN.reaPackage);
  const report = json(REA_REPORT, PIN.reaReport);
  const v6 = json(V6_EVIDENCE, PIN.v6Evidence);
  assert(Array.isArray(v6.sources) && v6.sources.length >= 9,
    'v6 evidence source manifest is missing expected transitive sources');
  const v6SourcePaths = new Set();
  for (const [index, source] of v6.sources.entries()) {
    assert(typeof source?.path === 'string' && source.path.length > 0 && !isAbsolute(source.path)
      && typeof source.sha256 === 'string' && /^[0-9a-f]{64}$/u.test(source.sha256),
    `Invalid v6 source manifest row ${index + 1}`);
    read(source.path, source.sha256);
    const normalizedPath = portable(relative(ROOT, resolve(ROOT, source.path)));
    assert(!v6SourcePaths.has(normalizedPath), `Duplicate v6 source manifest path: ${normalizedPath}`);
    v6SourcePaths.add(normalizedPath);
  }
  const observer = read(V6_OBSERVER, PIN.v6Observer);
  const summaryBytes = read(V6_SUMMARY, PIN.v6Summary);
  const summary = JSON.parse(summaryBytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const tapeBytes = read(V6_TAPE, PIN.v6Tape);
  const tape = tapeBytes.toString('utf8');
  const tapeLines = tape.split(/\r?\n/u);
  const lineCount = tapeLines.at(-1) === '' ? tapeLines.length - 1 : tapeLines.length;

  assert(map.pll.sha256 === PIN.pll && map.pll.bytes === pll.length, 'Archived map PLL identity differs');
  const fn = map.functions.find(item => item.name === 'IN-SUB-FRAME');
  assert(fn && fn.uniqueCompleteObjectByteMatch === true && fn.runtime.entry === ENTRY, 'Archived mapped function identity differs');
  assert(fn.payloadFile === 'in-sub-frame.native-payload.bin' && payload.length === fn.payloadBytes
    && fn.payloadBytes === 278 && fn.payloadSha256 === PIN.payload, 'Mapped payload identity differs');
  assert(fn.pll.payloadOffset === fn.pll.objectOffset + 4 && fn.pll.rawEnd === fn.pll.payloadOffset + payload.length
    && fn.pll.rawEnd === 2550594 && fn.pll.payloadOffset === 2550316, 'Archived PLL slice offsets differ');
  const completeObject = pll.subarray(fn.pll.objectOffset, fn.pll.rawEnd);
  assert(completeObject.length === fn.objectBytes && sha(completeObject) === fn.objectSha256
    && fn.objectBytes === payload.length + 4, 'Complete PLL object hash or size differs');
  assert(payload.equals(pll.subarray(fn.pll.payloadOffset, fn.pll.rawEnd)), 'Mapped payload is not the exact PLL payload slice');

  assert(binding.schemaVersion === 1 && binding.functionName === 'IN-SUB-FRAME'
    && binding.sourceMap.path === MAP && binding.sourceMap.sha256 === PIN.map
    && binding.originalPll.path === PLL && binding.originalPll.sha256 === PIN.pll
    && binding.originalPayload.path === PAYLOAD && binding.originalPayload.sha256 === PIN.payload
    && binding.originalPayload.pllObjectOffset === fn.pll.objectOffset
    && binding.originalPayload.pllPayloadOffset === fn.pll.payloadOffset
    && binding.originalPayload.pllEndExclusive === fn.pll.rawEnd
    && binding.originalPayload.uniqueCompleteObjectMatch === true, 'Synthetic PE binding does not bind the archived source');
  assert(binding.generatedPe.sha256 === PIN.pe && binding.generatedPe.bytes === pe.length
    && binding.generatedPe.entry === ENTRY
    && binding.assertions.generatedExecutableRun === false, 'Generated PE metadata differs');
  assert(pe.subarray(0, 2).toString('ascii') === 'MZ' && pe.readUInt32LE(60) === 128
    && pe.toString('ascii', 128, 132) === 'PE\0\0', 'Synthetic PE signature differs');
  const payloadFileOffset = binding.generatedPe.copiedPayloadFileOffset;
  assert(binding.generatedPe.copiedPayloadBytes === payload.length
    && pe.subarray(payloadFileOffset, payloadFileOffset + payload.length).equals(payload), 'Synthetic PE payload copy differs');
  assert(Number(binding.generatedPe.imageBase) + binding.generatedPe.sectionRva
    + binding.generatedPe.generatedPrefixBytes === Number(ENTRY)
    && payloadFileOffset === 512 + binding.generatedPe.generatedPrefixBytes, 'Synthetic PE entry/layout relation differs');
  assert(binding.generatedSeed.sha256 === PIN.seed && binding.generatedSeed.bytes === 33
    && seed === `${ENTRY}\tfunction\tIN_SUB_FRAME\n`, 'Generated analysis seed differs');

  assert(reaPackage.version === '6.4.0', 'REA package version differs');
  assert(report.operation === 'analyze_function' && report.subject.format === 'pe'
    && report.subject.digest.sha256 === PIN.pe && report.subject.local_path === resolve(ROOT, pePath)
    && report.provider.id === 'ghidra' && report.provider.version === '12.1.4'
    && report.analysis_profile.provider.version === '12.1.4', 'REA evidence identity or Ghidra provider differs');
  const profile = report.analysis_profile.parameters;
  assert(profile.language_id === 'x86:LE:32:default' && profile.compiler_spec_id === 'windows'
    && profile.analysis_seeds.sha256 === PIN.seed && profile.analysis_seeds.entries.function === 1
    && profile.analysis_seeds.entries.code === 0 && profile.analysis_seeds.entries.label === 0,
  'REA analysis profile or seed binding differs');
  const value = report.raw_result.value;
  assert(same(value, report.normalized_result), 'REA normalized function report differs from raw result');
  const body = value.procedure.body;
  assert(value.procedure.name === 'IN_SUB_FRAME' && value.procedure.address === ENTRY
    && body.available === true && body.total_bytes === 270 && body.span_bytes === 270
    && body.ranges.length === 1 && body.ranges[0].start === ENTRY && body.ranges[0].end === '0x1fe0eb39',
  'REA function entry or body differs');
  const blocks = value.basic_blocks;
  const cfgEdges = blocks.reduce((count, block) => count + block.successors.length, 0);
  const calls = value.assembly.filter(line => /: CALL /u.test(line)).map(line => {
    const match = /^(0x[0-9a-f]+): (CALL .+)$/u.exec(line);
    assert(match, `Unparsed CALL instruction: ${line}`);
    assert(/^CALL dword ptr \[[^\]]+\]$/u.test(match[2]), `CALL is not an indirect memory call: ${line}`);
    return { address: match[1], instruction: match[2], targetKind: 'indirect-memory' };
  });
  assert(blocks.length === 24 && value.assembly.length === 93 && calls.length === 11
    && new Set(calls.map(call => call.address)).size === calls.length, 'CFG, instruction, or indirect-call counts differ');
  const flow = value.native_value_flow;
  assert(flow.available === true && flow.operations.length === 109 && flow.def_use.length === 95
    && flow.truncated === false && flow.omitted_operations_lower_bound === 0
    && flow.known_omitted_inputs === 0 && flow.known_omitted_edges === 0, 'REA p-code counts or completeness differ');
  assert(value.callers.length === 0 && value.callees.length === 0, 'Isolated dossier reference inventory differs');

  const observed = v6.observed;
  const capture = observed.capture;
  const sample = capture.samples[0];
  const predicateRows = [];
  for (const [lineIndex, line] of tapeLines.entries()) {
    if (!line.startsWith('IN-SUB-FRAME ')) continue;
    const match = /^IN-SUB-FRAME event=(\d+) stroke=(\d+) sample=(\d+) args=(.+) values=(.+)$/u.exec(line);
    assert(match, `Malformed IN-SUB-FRAME tape row at line ${lineIndex + 1}`);
    const [eventId, strokeId, sampleId] = match.slice(1, 4).map(Number);
    assert([eventId, strokeId, sampleId].every(Number.isSafeInteger),
      `IN-SUB-FRAME tape identity is not a safe integer at line ${lineIndex + 1}`);
    if (strokeId === sample.strokeId && sampleId === sample.sampleId) {
      predicateRows.push({ lineOrder: lineIndex + 1, eventId, line });
    }
  }
  assert(Array.isArray(sample.predicateCalls), 'v6 sample predicateCalls must be an array');
  const acceptedCalls = sample.predicateCalls.filter(call => call.accepted === true);
  const distinctAcceptedPairs = new Set(acceptedCalls.map(call => JSON.stringify(call.arguments))).size;
  assert(predicateRows.length === sample.predicateCalls.length,
    'Target IN-SUB-FRAME tape row count differs from v6 predicateCalls');
  for (const [index, call] of sample.predicateCalls.entries()) {
    const row = predicateRows[index];
    const expectedLine = expectedPredicateTapeLine(sample, call);
    assert(row.lineOrder === call.lineOrder && row.eventId === call.eventId && row.line === expectedLine,
      `IN-SUB-FRAME tape row differs from v6 record at sample call ${index + 1}`);
  }
  const selectionLine = tapeLines.find(line => line.startsWith('SAMPLE-SELECT id=47 '));
  const inputLine = tapeLines.find(line => line.startsWith('STROKE-INPUT id=47 '));
  assert(v6.schemaVersion === 1 && observed.runId === 'brush-stroke-value0-index4-capture-20261012-a'
    && capture.completion.version === 6 && capture.completion.main === 'NORMAL'
    && capture.completion.accepted === true && capture.completion.sampleComplete === true
    && capture.completion.counters.errors === 0 && capture.completion.counters.aborts === 0,
  'v6 capture completion record differs');
  assert(summary.runId === observed.runId && summary.complete === true
    && observed.summarySha256 === PIN.v6Summary && capture.sha256 === PIN.v6Tape
    && capture.bytes === tapeBytes.length && capture.lineCount === lineCount,
  'v6 run summary or tape binding differs');
  assert(lineCount === 14791 && tapeLines[0] === 'BEGIN brush-stroke-value0 v6 index4'
    && tapeLines.includes('READY') && tapeLines.at(-2) === 'END brush-stroke-value0-v6-index4'
    && tapeLines.some(line => line.startsWith('COMPLETE version=6 main=:NORMAL accepted=T')),
  'v6 tape boundary records differ');
  assert(sample.sampleId === 1 && sample.strokeId === 47 && sample.class === 'MULTI'
    && sample.path.length === 29 && sample.brush.index === 4 && sample.brush.width === 13
    && sample.argumentValue.kind === 'integer' && sample.argumentValue.value === 0
    && sample.predicateCalls.length === 2813 && acceptedCalls.length === 2813
    && predicateRows.length === 2813 && distinctAcceptedPairs === 308
    && capture.completion.counters['sampled-predicates'] === 2813,
  'v6 natural sample or recorded predicate-call counts differ');
  assert(selectionLine?.includes('class=:MULTI path-length=29')
    && inputLine?.includes(':INDEX 4 :WIDTH 13') && inputLine.includes(':ARGUMENT-VALUE (:INTEGER 0)'),
  'v6 tape selected sample identity differs');
  assert(v6.sources.some(source => source.path === V6_OBSERVER && source.sha256 === PIN.v6Observer)
    && observer.length > 0, 'v6 evidence does not bind its observer source');

  const sourceHashes = [...sources.values()].map(({ row }) => row)
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert(v6.sources.every(source => sourceHashes.some(row => row.path === source.path && row.sha256 === source.sha256)),
    'Not every transitive v6 source is bound in the output source hash manifest');
  for (const { absolute, row } of sources.values()) {
    const current = readFileSync(absolute);
    assert(current.length === row.bytes && sha(current) === row.sha256, `Source changed during derivation: ${row.path}`);
  }

  return {
    schemaVersion: 1,
    investigation: 'rea-6.4-in-sub-frame-static-dossier-with-v6-comparison-anchor-20261012',
    scope: {
      deriverLaunchedOriginalAaron: false,
      retainedOriginalAaronCaptureReferenced: true,
      generatedPeRun: false,
      debuggerAttached: false,
      directLispCallerIdentified: false,
      nativeLispAbiEstablished: false,
      inferredOperandsLabelledAsFrameCoordinates: false,
    },
    toolchain: { rea: reaPackage.version, ghidra: report.provider.version, language: profile.language_id, compilerSpec: profile.compiler_spec_id },
    function: {
      name: 'IN-SUB-FRAME',
      entry: ENTRY,
      entryContext: 'archived measured address reused only as static synthetic-PE context; not a live process address',
      mapping: {
        map: sourceRow(MAP),
        pll: sourceRow(PLL),
        payload: sourceRow(PAYLOAD),
        payloadBytes: payload.length,
        pllObjectOffset: fn.pll.objectOffset,
        pllPayloadOffset: fn.pll.payloadOffset,
        pllEndExclusive: fn.pll.rawEnd,
        objectSha256: fn.objectSha256,
        uniqueCompleteObjectMatch: true,
      },
      syntheticAnalysisInput: {
        binding: sourceRow(bindingPath),
        pe: sourceRow(pePath),
        seed: sourceRow(seedPath),
        headersAndLayout: 'analyst-generated static analysis input',
        seededFunctionName: 'analyst assertion from the archived unique payload map',
        generatedExecutableRun: false,
      },
      rea: {
        report: sourceRow(REA_REPORT),
        evidenceId: report.evidence_id,
        provider: report.provider,
        body: { ranges: body.ranges, bytes: body.total_bytes },
        cfg: { basicBlocks: blocks.length, successorEdges: cfgEdges },
        instructions: value.assembly.length,
        pcode: {
          operations: flow.operations.length,
          defUseEdges: flow.def_use.length,
          effects: flow.effects.length,
          truncated: flow.truncated,
          omittedOperationsLowerBound: flow.omitted_operations_lower_bound,
          knownOmittedInputs: flow.known_omitted_inputs,
          knownOmittedEdges: flow.known_omitted_edges,
        },
        references: { resolvedCallers: value.callers.length, resolvedCallees: value.callees.length },
        indirectCalls: calls,
      },
    },
    dynamicReference: {
      evidence: sourceRow(V6_EVIDENCE),
      tape: sourceRow(V6_TAPE),
      runSummary: sourceRow(V6_SUMMARY),
      observer: sourceRow(V6_OBSERVER),
      sample: {
        captureVersion: capture.completion.version,
        runId: observed.runId,
        sampleId: sample.sampleId,
        strokeId: sample.strokeId,
        kind: sample.class,
        pathLength: sample.path.length,
        brushIndex: sample.brush.index,
        brushWidth: sample.brush.width,
        brushStrokeArgumentValue: sample.argumentValue.value,
        inSubFrameInvocations: sample.predicateCalls.length,
        acceptedInvocations: acceptedCalls.length,
        distinctAcceptedArgumentPairs: distinctAcceptedPairs,
      },
      relation: 'A separate natural capture anchor for bounded comparison; it does not map these runtime records to static indirect-call sites or identify a direct Lisp caller.',
    },
    limitations: [
      'The isolated synthetic PE contains the mapped function without the original surrounding Lisp object graph; its REA/Ghidra dossier cannot identify the direct Lisp caller.',
      'Generated PE headers, layout, and seeded name are analyst assertions. The PE was not executed; the entry is archived static context, not a live address.',
      'Assembly operands are retained as Ghidra text. No register or memory operand is assigned frame-coordinate meaning.',
      'Ghidra signature, locals, CFG, and p-code are analysis observations, not recovered Lisp source or a verified native Lisp ABI.',
      'The v6 tape records one natural sample. Its runtime records do not resolve which isolated-PE indirect call site, if any, corresponds to an observed Lisp call.',
    ],
    sourceHashes,
  };
}

function main() {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--output'),
    'Usage: node research/tools/derive-rea-in-sub-frame-evidence.mjs [--output <repository-relative-path>]');
  const outputRelative = args.length === 2 ? args[1] : OUTPUT;
  assert(outputRelative.length > 0 && !isAbsolute(outputRelative), 'Output path must be repository-relative');
  const outputPath = resolve(ROOT, outputRelative);
  assert(inside(ROOT, outputPath), `Output escapes repository: ${outputRelative}`);
  const evidence = derive();
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(outputPath, bytes);
  process.stdout.write(`Wrote ${portable(relative(ROOT, outputPath))} sha256=${sha(bytes)} bytes=${bytes.length} sources=${evidence.sourceHashes.length}\n`);
}

main();
