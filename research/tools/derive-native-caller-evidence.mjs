#!/usr/bin/env node

// Retain hashes, named object mappings and bounded call-site observations.
// Complete native payloads and decompiler output remain in ignored storage.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { sha256 } from './index-allegro-image.mjs';

const [mapArg, callerArg, controlArg, outputArg, repeatArg, ...extra] = process.argv.slice(2);
if (!mapArg || !callerArg || !controlArg || !outputArg || extra.length) {
  throw new Error('Usage: node derive-native-caller-evidence.mjs <native-code-map.json> <caller-run> <control-run> <fresh-evidence.json> [repeat-caller-run]');
}
const output = resolve(outputArg);
if (existsSync(output)) throw new Error('Evidence output must be fresh');
const mapPath = resolve(mapArg);
const mappedRoot = dirname(mapPath);
const read = (path) => readFileSync(path);
const json = (path) => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/, ''));
const map = json(mapPath);
if (map.schemaVersion !== 1 || map.functions.length !== 5) throw new Error('Unexpected native map');

function capturedRun(rootArg, withBreakpoint) {
  const root = resolve(rootArg);
  const summary = json(resolve(root, 'summary.json'));
  const aa0 = read(resolve(root, 'capture/aa0'));
  const scene = read(resolve(root, 'capture/aaron-scene-state-snapshot.txt'));
  if (!summary.complete || summary.mode !== 'writer-stream-seed-1234'
    || sha256(aa0) !== summary.aa0Sha256 || sha256(scene) !== summary.sceneReportSha256) {
    throw new Error('Run identity, completion or captured-file hash mismatch');
  }
  const retained = { ...summary, summarySha256: sha256(read(resolve(root, 'summary.json'))) };
  if (withBreakpoint) {
    const reportFile = resolve(root, 'select-brush-native-caller.json');
    const report = json(reportFile);
    if (report.schemaVersion !== 1 || !report.brushFillCallSiteConfirmed
      || !report.hit.debugRegistersRestored || !report.hit.detached
      || report.sourceMapSha256 !== sha256(read(mapPath))
      || sha256(read(resolve(root, 'capture/aaron-select-brush-native-links.txt'))) !== report.metadataSha256
      || sha256(read(resolve(root, 'capture/aaron-pre-scene-probe.cl'))) !== summary.preSceneProbeSha256) {
      throw new Error('Caller report binding, capture or cleanup validation failed');
    }
    for (const fn of map.functions) {
      const live = report.functions.find((item) => item.name === fn.name);
      if (!live?.exactLivePayloadMatch || live.payloadSha256 !== fn.payloadSha256
        || live.payloadBytes !== fn.payloadBytes) throw new Error('Caller live code identity mismatch');
    }
    const displayFrame = report.frameReturns[0];
    if (report.immediateReturn.function !== 'BRUSH-FILL' || report.immediateReturn.offset !== 1676
      || displayFrame.function !== 'DISPLAY-COLOR-PATCHES' || displayFrame.offset !== 858) {
      throw new Error('Unexpected measured application call path');
    }
    retained.breakpoint = {
      reportSha256: sha256(read(reportFile)), metadataSha256: report.metadataSha256,
      capturedAt: report.capturedAt, processId: report.hit.processId, threadId: report.hit.threadId,
      firstChance: report.hit.firstChance, exceptionCode: report.hit.exceptionCode,
      eip: report.hit.eip, eax: report.hit.eax, ecx: report.hit.ecx,
      esp: report.hit.esp, ebp: report.hit.ebp,
      immediateReturn: report.immediateReturn, firstCallerFrameReturn: displayFrame,
      armedThreads: report.hit.armedThreads,
      debugRegistersRestored: report.hit.debugRegistersRestored, detached: report.hit.detached,
    };
  }
  return { retained, aa0, scene };
}

const control = capturedRun(controlArg, false);
const calls = [capturedRun(callerArg, true), ...(repeatArg ? [capturedRun(repeatArg, true)] : [])];
const comparisons = calls.map((call) => {
  if (!call.aa0.equals(control.aa0) || !call.scene.equals(control.scene)) {
    throw new Error('Debugger scene differs from the fresh control');
  }
  for (const field of ['smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    if (call.retained[field] !== control.retained[field]) throw new Error(`Run setup mismatch: ${field}`);
  }
  return { callerRun: call.retained.runId, controlRun: control.retained.runId,
    aa0ByteIdentical: true, sceneReportByteIdentical: true };
});

const metadataText = read(resolve(callerArg, 'capture/aaron-select-brush-native-links.txt')).toString('utf8');
const census = /^SUMMARY bindings=(\d+) compiled-scanned=(\d+) references=(\d+) errors=(\d+) truncated=(\d+)\r?$/m.exec(metadataText);
if (!census || census[3] !== '1' || census[4] !== '0' || census[5] !== '0'
  || !metadataText.includes('REFERENCE root="BRUSH-FILL" path=NIL index=26 kind=:SYMBOL')) {
  throw new Error('The completed constant census does not establish the reported selector reference');
}
const constantReferences = [
  { function: 'BRUSH-FILL', index: 25, symbol: 'COMMON-GRAPHICS-USER:SUBP-COUNT' },
  { function: 'BRUSH-FILL', index: 26, symbol: 'COMMON-GRAPHICS-USER:SELECT-BRUSH' },
  { function: 'BRUSH-FILL', index: 27, symbol: 'COMMON-GRAPHICS-USER:BRUSH' },
  { function: 'DISPLAY-COLOR-PATCHES', index: 21, symbol: 'COMMON-GRAPHICS-USER:BRUSH-FILL' },
];
for (const constant of constantReferences) {
  const [owner, symbol] = constant.symbol.split(':');
  const line = `CONSTANT name="${constant.function}" index=${constant.index} value=(:SYMBOL "${owner}" "${symbol}")`;
  if (!metadataText.split(/\r?\n/).includes(line)) throw new Error(`Missing measured constant: ${constant.symbol}`);
}

const sites = [
  { name: 'BRUSH-FILL', start: 1649, end: 1685, callee: 'SELECT-BRUSH',
    constantIndex: 26, loadOffset: 1666, callOffset: 1674, returnOffset: 1676 },
  { name: 'DISPLAY-COLOR-PATCHES', start: 846, end: 858, callee: 'BRUSH-FILL',
    constantIndex: 21, loadOffset: 849, callOffset: 855, returnOffset: 858 },
].map((site) => {
  const fn = map.functions.find((item) => item.name === site.name);
  const reportFile = resolve(mappedRoot, 'ghidra', `${site.name.toLowerCase()}.ghidra.json`);
  const report = json(reportFile);
  const payload = read(resolve(mappedRoot, fn.payloadFile));
  if (sha256(payload) !== fn.payloadSha256 || report.subject.sha256 !== fn.payloadSha256
    || report.functionName !== fn.name || report.languageId !== 'x86:LE:32:default') {
    throw new Error('Ghidra report or payload binding mismatch');
  }
  const instructions = report.assembly.filter((item) => item.offset >= site.start && item.offset <= site.end);
  for (const instruction of instructions) {
    const bytes = Buffer.from(instruction.bytes, 'hex');
    if (!payload.subarray(instruction.offset, instruction.offset + bytes.length).equals(bytes)) {
      throw new Error('Retained instruction bytes do not match the mapped payload');
    }
  }
  if (!instructions.some((item) => item.offset === site.callOffset && item.flowType === 'COMPUTED_CALL')) {
    throw new Error('Expected computed call site is absent');
  }
  return { ...site, ghidraReportSha256: sha256(read(reportFile)), instructions };
});

const bundleFile = resolve(mappedRoot, 'ghidra/brush-fill.rea-bundle.json');
const exportFile = resolve(mappedRoot, 'ghidra/brush-fill.rea-export.json');
const bundle = json(bundleFile);
const exported = json(exportFile);
const imported = json(resolve(mappedRoot, 'ghidra/brush-fill.rea-import-full.json'));
if (bundle.records.length !== 1 || exported.records.length !== 1 || imported.imported !== 1
  || bundle.records[0].evidence_id !== exported.records[0].evidence_id
  || bundle.records[0].provider.id !== 'ghidra-standalone') throw new Error('REA import/export identity mismatch');

const evidence = {
  schemaVersion: 1, status: 'measured',
  observedApplicationCallPath: ['DISPLAY-COLOR-PATCHES', 'BRUSH-FILL', 'SELECT-BRUSH'],
  scope: 'First SELECT-BRUSH entry in each fresh seed-1234 writer-stream scene, using exact PLL byte matches and an execute hardware breakpoint',
  nativeMapSha256: sha256(read(mapPath)),
  pll: map.pll,
  namedFunctions: map.functions.map(({ name, runtime, pll, header, encodedWords, objectBytes,
    objectSha256, payloadBytes, payloadSha256, uniqueCompleteObjectByteMatch }) => ({
    name, runtime, pll, header, encodedWords, objectBytes, objectSha256, payloadBytes,
    payloadSha256, uniqueCompleteObjectByteMatch,
  })),
  constantReferences,
  constantScan: { ownApplicationBindings: Number(census[1]), compiledObjectsScanned: Number(census[2]),
    selectorReferences: Number(census[3]), referenceFunction: 'BRUSH-FILL', referenceIndex: 26,
    errors: Number(census[4]), truncated: Number(census[5]),
    scope: 'Own CGU bindings and nested compiled constants; generic method bodies are not comprehensively scanned' },
  callSites: sites,
  callerRuns: calls.map((call) => call.retained), controlRun: control.retained, comparisons,
  rea: {
    version: '3.2.1', ghidraVersion: '12.1.4', nativeProviderSession: false,
    provider: bundle.records[0].provider, evidenceId: bundle.records[0].evidence_id,
    bundleSha256: sha256(read(bundleFile)), canonicalExportSha256: sha256(read(exportFile)),
    importResult: imported, exportedRecords: exported.records.length,
    interpretation: 'Canonical record validation and offline import/export of an external Ghidra report; not authentication of native analysis',
  },
  limitations: [
    'Addresses belong to these runs; rediscover and validate entries before every new debugger attachment.',
    'Only one entry hit per captured run is measured. Other branches, scenes and dynamic rebinding are not established.',
    'The Ghidra Windows x86 compiler specification does not model Allegro Lisp types, tagged values or register calling conventions.',
    'The entry EAX word 0x6f6c agrees with the prior 7131 observation under a two-bit fixnum shift; this report does not establish a general numeric ABI.',
    'The complete BRUSH-FILL algorithm, upstream SUBP-COUNT generation, and integrated JavaScript brush assignment remain to be characterized.',
    'Complete binary windows, payloads, decompiler output and REA bundles remain local and ignored.',
  ],
};
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output, callerRuns: calls.length, path: evidence.observedApplicationCallPath,
  comparisons, evidenceSha256: sha256(read(output)) }, null, 2));
