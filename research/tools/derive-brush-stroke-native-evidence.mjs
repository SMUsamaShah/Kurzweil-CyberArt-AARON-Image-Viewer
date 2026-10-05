#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import {
  basename, dirname, isAbsolute, relative, resolve, sep,
} from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { mapCapturedFunctions } from './map-native-code-to-pll.mjs';
import { sha256 } from './index-allegro-image.mjs';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const read = path => readFileSync(resolve(path));
const readAt = (root, path) => readFileSync(resolve(root, path));
const parseJson = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const hexSha = (value, label) => {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value), `${label} is not a SHA-256`);
  return value.toLowerCase();
};
const equalArray = (actual, expected, label) => {
  assert(Array.isArray(actual) && same(actual, expected), `${label} differs`);
};
const within = (parent, candidate) => {
  const rel = relative(parent, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

const TARGETS = [
  {
    name: 'BRUSH-STROKE',
    file: 'brush-stroke.native-window.bin',
    entryCandidate: '0x1fe435c4',
    windowBytes: 16384,
    arglist: '((COMMON-GRAPHICS:PATH COMMON-GRAPHICS:VALUE COMMON-GRAPHICS-USER::CDEX COMMON-GRAPHICS-USER::SDEX) T)',
    arguments: [
      'COMMON-GRAPHICS:PATH', 'COMMON-GRAPHICS:VALUE',
      'COMMON-GRAPHICS-USER::CDEX', 'COMMON-GRAPHICS-USER::SDEX',
    ],
    constants: [
      ['COMMON-GRAPHICS-USER', 'SDEX'],
      ['COMMON-GRAPHICS-USER', 'BOUNDARY-VALUE'],
      ['COMMON-GRAPHICS-USER', 'SCREEN-AND-STORE'],
      ['COMMON-GRAPHICS-USER', 'BRUSH'],
      ['COMMON-GRAPHICS', 'WIDTH'],
      ['COMMON-GRAPHICS-USER', 'PERIM'],
      ['COMMON-GRAPHICS-USER', 'CORE'],
      ['COMMON-GRAPHICS-USER', 'X'],
      ['COMMON-GRAPHICS-USER', 'Y'],
      ['COMMON-GRAPHICS-USER', 'IN-SUB-FRAME'],
      ['COMMON-GRAPHICS-USER', 'FILL-MAP'],
      ['EXCL', '.INV-S-AREF'],
    ],
  },
  {
    name: 'IN-SUB-FRAME',
    file: 'in-sub-frame.native-window.bin',
    entryCandidate: '0x1fe0ea2c',
    windowBytes: 16384,
    arglist: '((COMMON-GRAPHICS-USER::X COMMON-GRAPHICS-USER::Y) T)',
    arguments: ['COMMON-GRAPHICS-USER::X', 'COMMON-GRAPHICS-USER::Y'],
    constants: [
      ['COMMON-GRAPHICS-USER', 'SUB-FRAME'],
      ['COMMON-GRAPHICS-USER', 'LX'],
      ['COMMON-GRAPHICS-USER', 'RX'],
      ['COMMON-GRAPHICS-USER', 'LY'],
      ['COMMON-GRAPHICS-USER', 'TY'],
    ],
  },
];

const HELPERS_LINE = 'HELPERS owner=#<The COMMON-GRAPHICS-USER package> arglist=ARGLIST count=EXCL::FUNCTION-CONSTANT-COUNT constant=EXCL::FUNCTION-CONSTANT memref=SYSTEM:MEMREF';
const RELEASE_MARKER = 'Native code snapshot parent finished';
const SOURCE_PATHS = [
  'research/introspection/brush-stroke-native-links.cl',
  'research/tools/derive-brush-stroke-native-evidence.mjs',
  'research/tools/map-native-code-to-pll.mjs',
  'research/tools/index-allegro-image.mjs',
];

function ownedRoot(rootArg, label) {
  assert(typeof rootArg === 'string' && rootArg.length > 0, `${label} root is required`);
  const root = resolve(rootArg);
  const artifacts = resolve('research/extracted/local-oracle');
  assert(within(artifacts, root), `${label} root is outside research/extracted/local-oracle`);
  return { root, name: basename(root) };
}

function readRun(rootArg, label, { native = false } = {}) {
  const { root, name } = ownedRoot(rootArg, label);
  const summaryBytes = readAt(root, 'summary.json');
  const summary = parseJson(summaryBytes);
  assert(summary.complete === true && summary.runId === name,
    `${label} summary does not identify a complete run rooted at its own directory`);
  assert(summary.mode === 'writer-stream-seed-1234' && summary.smallImage === false,
    `${label} is not the requested seed-1234 writer-stream, full-size run`);
  for (const key of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    summary[key] = hexSha(summary[key], `${label} ${key}`);
  }

  const aa0 = readAt(root, 'capture/aa0');
  const scene = readAt(root, 'capture/aaron-scene-state-snapshot.txt');
  const aa0Sha256 = sha256(aa0);
  const sceneSha256 = sha256(scene);
  assert(aa0Sha256 === hexSha(summary.aa0Sha256, `${label} AA0 summary hash`)
    && sceneSha256 === hexSha(summary.sceneReportSha256, `${label} scene summary hash`),
  `${label} summary does not bind the actual AA0/scene bytes`);

  if (native) {
    const requestBytes = readAt(root, 'pre-scene-probe-request.json');
    const request = parseJson(requestBytes);
    const expectedKeys = [
      'schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256',
      'pauseSeconds', 'releaseFile', 'probeOutputNames',
    ];
    assert(Object.keys(request).length === expectedKeys.length
      && expectedKeys.every(key => Object.hasOwn(request, key)), 'Native request fields differ');
    assert(request.schemaVersion === 1 && request.runId === summary.runId,
      'Native request and summary run identities differ');
    assert(request.releaseFile === 'C:\\temp\\aaron-native-code-release.txt',
      'Native request release-file path differs');
    assert(request.pauseSeconds === 90 && summary.preSceneProbePauseSeconds === 90,
      'Native snapshot pause must match the authorized 90-second request');
    equalArray(request.probeOutputNames, ['aaron-brush-stroke-native-links.txt'],
      'Native requested output names');
    equalArray(summary.probeOutputNames, request.probeOutputNames,
      'Native summary output names');

    const runtime = resolve(request.runtimeExecutable);
    const expectedRuntime = resolve(root, 'runtime', 'AARON.exe');
    assert(runtime.toLowerCase() === expectedRuntime.toLowerCase(),
      'Native request runtime executable is outside its owned run root');
    const source = read('research/introspection/brush-stroke-native-links.cl');
    const stagedSource = readAt(root, 'capture/aaron-pre-scene-probe.cl');
    const requestProbeSha256 = hexSha(request.probeSha256, 'Native request probe hash');
    const summaryProbeSha256 = hexSha(summary.preSceneProbeSha256, 'Native summary probe hash');
    assert(stagedSource.equals(source) && sha256(source) === requestProbeSha256
      && requestProbeSha256 === summaryProbeSha256,
    'Native current/staged/request/summary source bindings differ');
    assert(!existsSync(resolve(root, 'capture/aaron-brush-stroke-boundary.txt')),
      'Native metadata run unexpectedly contains a brush-stroke boundary report');

    return {
      root, name, summary, summaryBytes, summarySha256: sha256(summaryBytes),
      aa0, scene, aa0Sha256, sceneSha256,
      request, requestBytes, requestSha256: sha256(requestBytes),
      source, sourceSha256: sha256(source), stagedSourceSha256: sha256(stagedSource),
      runtime,
    };
  }

  assert(summary.preSceneProbeSha256 === null && summary.preSceneProbePauseSeconds === 0,
    'Control contains probe metadata');
  equalArray(summary.probeOutputNames, [], 'Control probe output names');
  for (const path of [
    'pre-scene-probe-request.json',
    'capture/aaron-pre-scene-probe.cl',
    'capture/aaron-brush-stroke-native-links.txt',
    'capture/aaron-native-code-release.txt',
  ]) {
    assert(!existsSync(resolve(root, path)), `Control contains an observer artifact: ${path}`);
  }
  return {
    root, name, summary, summaryBytes, summarySha256: sha256(summaryBytes),
    aa0, scene, aa0Sha256, sceneSha256,
  };
}

function validateNativeLinks(bytes, manifest) {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), 'Native links report is not valid round-trip UTF-8');
  const lines = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  const manifestFunctions = manifest.functions;
  assert(Array.isArray(manifestFunctions) && manifestFunctions.length === TARGETS.length,
    'Native manifest target count differs');
  const expectedLines = [
    'BEGIN brush-stroke-native-links',
    'LIMITS targets=2 header-bytes=64 constants-per-function=4096',
    HELPERS_LINE,
  ];
  let constantCount = 0;
  for (let index = 0; index < TARGETS.length; index += 1) {
    const target = TARGETS[index];
    const fn = manifestFunctions[index];
    assert(fn.name === target.name && fn.file === target.file
      && fn.entryCandidate === target.entryCandidate && fn.bytes === target.windowBytes,
      `Native manifest target ${index} differs`);
    assert(typeof fn.functionObjectHeaderHex === 'string'
      && /^[0-9a-f]{128}$/i.test(fn.functionObjectHeaderHex),
    `${target.name} captured function header is invalid`);
    expectedLines.push(`TARGET name="${target.name}" type=COMPILED-FUNCTION`);
    expectedLines.push(`ARGLIST name="${target.name}" values=${target.arglist}`);
    expectedLines.push(`HEADER name="${target.name}" bytes=${fn.functionObjectHeaderHex}`);
    expectedLines.push(`CONSTANT-COUNT name="${target.name}" count=${target.constants.length}`);
    target.constants.forEach(([pkg, symbol], constantIndex) => {
      expectedLines.push(`CONSTANT name="${target.name}" index=${constantIndex} value=(:SYMBOL "${pkg}" "${symbol}")`);
    });
    constantCount += target.constants.length;
  }
  expectedLines.push(`TOTALS targets=2 functions=2 headers=2 constants=${constantCount} errors=0 truncations=0`);
  expectedLines.push('ERROR-COUNT 0', 'TRUNCATION-COUNT 0', 'END brush-stroke-native-links');
  assert(lines.length === expectedLines.length
    && lines.every((line, index) => line === expectedLines[index]),
  'Native links report has missing, extra, reordered, or changed target metadata');
  return {
    sha256: sha256(bytes),
    counters: { targets: TARGETS.length, headers: TARGETS.length, constants: constantCount, errors: 0, truncations: 0 },
  };
}

function decodeAddress(value, label) {
  assert(typeof value === 'string' && /^0x[0-9a-f]{1,8}$/i.test(value), `${label} is not a 32-bit address`);
  return Number.parseInt(value.slice(2), 16);
}

function ranges(mask, selected) {
  const output = [];
  let start = -1;
  for (let offset = 0; offset <= mask.length; offset += 1) {
    const active = offset < mask.length && Boolean(mask[offset]) === selected;
    if (active && start < 0) start = offset;
    if (!active && start >= 0) {
      output.push({ start, endExclusive: offset, bytes: offset - start });
      start = -1;
    }
  }
  return output;
}

function validateInstructionReport(root, fn, payload, reportBytes) {
  const report = parseJson(reportBytes);
  const entry = decodeAddress(fn.runtime.entry, `${fn.name} mapped entry`);
  const payloadPath = resolve(root, 'native-code', 'mapped', fn.payloadFile);
  assert(report.schemaVersion === 1 && report.functionName === fn.name
    && report.entry === fn.runtime.entry && report.memoryBase === fn.runtime.entry,
  `${fn.name} Ghidra report target/entry differs`);
  assert(report.languageId === 'x86:LE:32:default' && report.compilerSpecId === 'windows'
    && report.ghidraVersion === '12.1.4', `${fn.name} Ghidra architecture/tool metadata differs`);
  assert(report.subject?.architecture === 'x86' && report.subject.format === 'raw'
    && report.subject.bytes === payload.length && report.subject.sha256 === sha256(payload)
    && resolve(report.subject.path).toLowerCase() === payloadPath.toLowerCase(),
  `${fn.name} Ghidra subject does not bind the mapped payload`);
  assert(report.decompilation?.completed === true && report.decompilation.error === '',
    `${fn.name} Ghidra decompilation is incomplete`);
  assert(Array.isArray(report.assembly) && report.assembly.length > 0
    && report.disassembledInstructions === report.assembly.length,
  `${fn.name} Ghidra instruction list is incomplete`);

  const byteCoverage = new Uint8Array(payload.length);
  const spans = [];
  for (const [index, instruction] of report.assembly.entries()) {
    assert(Number.isSafeInteger(instruction.offset) && instruction.offset >= 0,
      `${fn.name} instruction ${index} has an invalid offset`);
    assert(typeof instruction.bytes === 'string' && /^[0-9a-f]{2,30}$/i.test(instruction.bytes)
      && instruction.bytes.length % 2 === 0,
    `${fn.name} instruction ${index} has invalid bytes`);
    const address = decodeAddress(instruction.address, `${fn.name} instruction ${index} address`);
    const bytes = Buffer.from(instruction.bytes, 'hex');
    assert(address === entry + instruction.offset
      && instruction.offset + bytes.length <= payload.length,
    `${fn.name} instruction ${index} address/range differs from the mapped payload`);
    assert(payload.subarray(instruction.offset, instruction.offset + bytes.length).equals(bytes),
      `${fn.name} instruction ${index} bytes differ from the exact mapped payload`);
    for (let offset = instruction.offset; offset < instruction.offset + bytes.length; offset += 1) {
      assert(byteCoverage[offset] === 0, `${fn.name} instruction ranges overlap at byte ${offset}`);
      byteCoverage[offset] = 1;
    }
    spans.push({ start: instruction.offset, endExclusive: instruction.offset + bytes.length });
  }
  spans.sort((left, right) => left.start - right.start);
  assert(spans[0]?.start === 0, `${fn.name} disassembly does not begin at its mapped entry`);
  for (let index = 1; index < spans.length; index += 1) {
    assert(spans[index - 1].endExclusive <= spans[index].start,
      `${fn.name} instruction intervals are not ordered without overlap`);
  }
  const comparedBytes = byteCoverage.reduce((sum, byte) => sum + byte, 0);
  return {
    report,
    sha256: sha256(reportBytes),
    instructionCount: report.assembly.length,
    instructionBytesCompared: comparedBytes,
    payloadBytes: payload.length,
    payloadInstructionCoveragePercent: Number((100 * comparedBytes / payload.length).toFixed(4)),
    instructionRanges: ranges(byteCoverage, true),
    uncoveredPayloadRanges: ranges(byteCoverage, false),
  };
}

function validateReaRoundTrip(root, fn, payload, ghidra) {
  const stem = fn.name.toLowerCase();
  const dir = resolve(root, 'native-code', 'mapped', 'ghidra');
  const paths = {
    bundle: resolve(dir, `${stem}.rea-bundle.json`),
    exported: resolve(dir, `${stem}.rea-export.json`),
    imported: resolve(dir, `${stem}.rea-import.json`),
  };
  const bytes = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(path)]));
  const bundle = parseJson(bytes.bundle);
  const exported = parseJson(bytes.exported);
  const imported = parseJson(bytes.imported);
  const record = bundle.records?.[0];
  const report = ghidra.report;
  const payloadPath = resolve(root, 'native-code', 'mapped', fn.payloadFile);
  assert(bundle.records?.length === 1 && exported.records?.length === 1
    && same(bundle.records, exported.records), `${fn.name} canonical REA export differs from its bundle`);
  assert(imported.imported === 1 && imported.unknowns_added === 0 && imported.total === 1,
    `${fn.name} canonical REA import result differs`);
  assert(record && /^ev_[0-9a-f]{64}$/i.test(record.evidence_id),
    `${fn.name} REA Evidence ID is invalid`);
  assert(record.provider?.id === 'ghidra-standalone' && record.provider.version === '12.1.4'
    && record.authority === 'shipped-artifact' && record.confidence === 'observed',
  `${fn.name} REA provider or authority metadata differs`);
  assert(record.subject?.digest?.sha256 === sha256(payload)
    && record.subject.name === fn.payloadFile
    && resolve(record.subject.local_path).toLowerCase() === payloadPath.toLowerCase(),
  `${fn.name} REA subject does not bind the mapped payload`);
  assert(record.parameters?.rea_native_provider_session === false
    && record.normalized_result?.provenance?.rea_native_provider_session === false
    && record.normalized_result.provenance.source_report_sha256 === ghidra.sha256,
  `${fn.name} REA native-session/source-report provenance differs`);
  assert(same(record.raw_result, report), `${fn.name} REA raw result differs from its Ghidra report`);
  const canonicalAssembly = report.assembly.map(({ address, bytes: instructionBytes, flows, text }) => ({
    address, bytes: instructionBytes, flows, text,
  }));
  assert(same(record.normalized_result.assembly, canonicalAssembly),
    `${fn.name} REA normalized instruction rows differ from the captured report`);

  return {
    evidenceId: record.evidence_id,
    provider: { id: record.provider.id, name: record.provider.name, version: record.provider.version },
    nativeProviderSession: false,
    bundleSha256: sha256(bytes.bundle),
    canonicalExportSha256: sha256(bytes.exported),
    importResultSha256: sha256(bytes.imported),
    importResult: imported,
    sourceReportSha256: ghidra.sha256,
  };
}

function validateNativeFunctions(root, manifest, mapped, pll, readWindow) {
  assert(Array.isArray(mapped.functions) && mapped.functions.length === TARGETS.length,
    'Mapped native function count differs');
  const rederived = mapCapturedFunctions({ ...manifest, functions: manifest.functions }, readWindow, pll);
  assert(same(mapped.pll, rederived.report.pll)
    && same(mapped.functions, rederived.report.functions),
  'Preserved native map differs from exact window/PLL rederivation');

  return TARGETS.map((target, index) => {
    const fn = mapped.functions[index];
    assert(fn.name === target.name && fn.capture.file === target.file
      && fn.uniqueCompleteObjectByteMatch === true,
    `${target.name} mapped function identity or complete object match differs`);
    const expectedPayloadFile = `${target.name.toLowerCase()}.native-payload.bin`;
    assert(fn.payloadFile === expectedPayloadFile && basename(fn.payloadFile) === fn.payloadFile,
      `${target.name} payload path is invalid`);
    assert(fn.objectBytes === fn.payloadBytes + 4 && fn.payloadBytes > 0
      && fn.pll.rawEnd - fn.pll.objectOffset === fn.objectBytes
      && fn.pll.payloadOffset === fn.pll.objectOffset + 4,
    `${target.name} PLL object/payload boundaries differ`);
    const payload = readAt(resolve(root, 'native-code', 'mapped'), fn.payloadFile);
    assert(payload.equals(rederived.payloads.get(fn.name))
      && payload.length === fn.payloadBytes && sha256(payload) === fn.payloadSha256,
    `${target.name} retained payload differs from exact PLL object bytes`);

    const ghidraStem = resolve(root, 'native-code', 'mapped', 'ghidra', target.name.toLowerCase());
    const ghidraPath = `${ghidraStem}.ghidra.json`;
    const ghidraBytes = readFileSync(ghidraPath);
    const ghidra = validateInstructionReport(root, fn, payload, ghidraBytes);
    const rea = validateReaRoundTrip(root, fn, payload, ghidra);
    return {
      name: fn.name,
      arglist: target.arglist,
      argumentSymbols: target.arguments,
      functionConstants: target.constants.map(([pkg, symbol], constantIndex) => ({ index: constantIndex, package: pkg, name: symbol })),
      capture: {
        windowFile: fn.capture.file,
        windowSha256: fn.capture.sha256,
        windowBytes: fn.capture.bytes,
        windowBase: fn.capture.windowBase,
        functionObjectHeaderHex: fn.capture.functionObjectHeaderHex,
      },
      runtimeEntry: fn.runtime.entry,
      pll: fn.pll,
      compiledObject: {
        header: fn.header,
        encodedWords: fn.encodedWords,
        objectBytes: fn.objectBytes,
        objectSha256: fn.objectSha256,
        uniqueCompleteObjectByteMatch: fn.uniqueCompleteObjectByteMatch,
      },
      payload: { file: fn.payloadFile, bytes: payload.length, sha256: sha256(payload) },
      ghidra: {
        sha256: ghidra.sha256,
        version: ghidra.report.ghidraVersion,
        decompilationCompleted: true,
        instructionCount: ghidra.instructionCount,
        instructionBytesCompared: ghidra.instructionBytesCompared,
        payloadBytes: ghidra.payloadBytes,
        payloadInstructionCoveragePercent: ghidra.payloadInstructionCoveragePercent,
        instructionRanges: ghidra.instructionRanges,
        uncoveredPayloadRanges: ghidra.uncoveredPayloadRanges,
      },
      rea,
    };
  });
}

export function deriveBrushStrokeNativeEvidence(nativeRoot, controlRoot) {
  const native = readRun(nativeRoot, 'Native capture', { native: true });
  const control = readRun(controlRoot, 'Control capture');
  assert(native.name === 'brush-stroke-native-seed1234-20261005-e',
    'Native root is not the requested frozen seed-1234 capture');
  assert(native.summary.mode === control.summary.mode && native.summary.smallImage === control.summary.smallImage,
    'Native/control run mode or SmallImage differs');
  for (const key of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(native.summary[key] === control.summary[key], `Native/control setup differs: ${key}`);
  }
  assert(native.aa0.equals(control.aa0) && native.scene.equals(control.scene),
    'Native probe changed actual AA0 or scene-report bytes relative to control');

  const linksBytes = readAt(native.root, 'capture/aaron-brush-stroke-native-links.txt');
  const releaseBytes = readAt(native.root, 'capture/aaron-native-code-release.txt');
  assert(releaseBytes.toString('utf8').trimEnd() === RELEASE_MARKER,
    'Native snapshot release marker differs');
  const metadataBytes = readAt(native.root, 'native-code/function-object-metadata.txt');
  assert(metadataBytes.equals(linksBytes), 'Preserved function-object metadata differs from native links capture');

  const manifestBytes = readAt(native.root, 'native-code/manifest.json');
  const manifest = parseJson(manifestBytes);
  assert(manifest.schemaVersion === 1
    && manifest.method === 'Bounded ReadProcessMemory windows around pointer candidates from function-object metadata; no process memory writes'
    && manifest.scope === 'Pointer-field semantics, code boundaries and entry candidates require byte matching and instruction/runtime corroboration',
  'Native capture manifest method/scope differs');
  assert(Number.isSafeInteger(manifest.processId) && manifest.processId > 0,
    'Native capture process ID is invalid');
  assert(resolve(manifest.runtimeExecutable).toLowerCase() === native.runtime.toLowerCase(),
    'Native manifest runtime executable differs from the request');
  assert(hexSha(manifest.metadataSha256, 'Native manifest metadata hash') === sha256(linksBytes),
    'Native manifest does not bind the complete function-object metadata');
  validateNativeLinks(linksBytes, manifest);

  const mappedBytes = readAt(native.root, 'native-code/mapped/native-code-map.json');
  const mapped = parseJson(mappedBytes);
  assert(mapped.captureManifestSha256 === sha256(manifestBytes),
    'Mapped native report does not bind its capture manifest');
  const pll = readAt(native.root, 'runtime/AARON.pll');
  assert(mapped.pll?.bytes === pll.length && mapped.pll.sha256 === sha256(pll),
    'Mapped PLL identity differs from the preserved runtime PLL');
  const nativeCodeDir = resolve(native.root, 'native-code');
  const functions = validateNativeFunctions(native.root, manifest, mapped, pll, file => {
    assert(basename(file) === file && /^[a-z0-9-]+\.native-window\.bin$/.test(file),
      'Native window filename is unsafe');
    const path = resolve(nativeCodeDir, file);
    assert(within(nativeCodeDir, path), 'Native window escapes its owned root');
    return readFileSync(path);
  });

  const sources = SOURCE_PATHS.map(path => ({ path, sha256: sha256(read(path)) }));
  return {
    schemaVersion: 1,
    kind: 'Seed-1234 BRUSH-STROKE and IN-SUB-FRAME native mapping with byte-bound instruction reports and canonical REA import/export',
    sources,
    nativeCapture: {
      root: native.name,
      runId: native.summary.runId,
      mode: native.summary.mode,
      smallImage: native.summary.smallImage,
      summarySha256: native.summarySha256,
      requestSha256: native.requestSha256,
      request: {
        runId: native.request.runId,
        runtimeExecutableBasename: basename(native.runtime),
        runtimeRootMatches: true,
        pauseSeconds: native.request.pauseSeconds,
        releaseFileBasename: basename(native.request.releaseFile),
        probeOutputNames: native.request.probeOutputNames,
        sourceSha256: native.sourceSha256,
        stagedSourceSha256: native.stagedSourceSha256,
      },
      nativeLinksSha256: sha256(linksBytes),
      functionObjectMetadataSha256: sha256(metadataBytes),
      releaseMarkerSha256: sha256(releaseBytes),
      manifestSha256: sha256(manifestBytes),
      mappedReportSha256: sha256(mappedBytes),
      pll: mapped.pll,
      nativeMetadataCoverage: { targets: 2, headers: 2, constants: 17, errors: 0, truncations: 0 },
      functions,
    },
    control: {
      root: control.name,
      runId: control.summary.runId,
      mode: control.summary.mode,
      smallImage: control.summary.smallImage,
      summarySha256: control.summarySha256,
      aa0Sha256: control.aa0Sha256,
      sceneReportSha256: control.sceneSha256,
    },
    drawingParity: {
      aa0ByteIdentical: true,
      sceneReportByteIdentical: true,
      setupIdentical: true,
      observed: {
        aa0Sha256: native.aa0Sha256,
        aa0Bytes: native.aa0.length,
        sceneReportSha256: native.sceneSha256,
        sceneReportBytes: native.scene.length,
      },
      setup: {
        smallImage: native.summary.smallImage,
        installerSha256: native.summary.installerSha256,
        registryPatchSha256: native.summary.registryPatchSha256,
        licensePatchSha256: native.summary.licensePatchSha256,
      },
    },
    originalInputScope: {
      source: 'Captured compiled-function ARGLIST metadata; this preserves names and printed lambda-list records without inferring the native calling convention.',
      targets: TARGETS.map(({ name, arglist, arguments: argumentSymbols, constants }) => ({
        name, arglist, argumentSymbols,
        functionConstants: constants.map(([pkg, symbol], index) => ({ index, package: pkg, name: symbol })),
      })),
    },
    limitations: [
      'The mapped object bytes are a unique complete byte match in the indexed runtime PLL; matching and disassembly do not prove which calls executed in the painting run or recover the Lisp ABI/source.',
      'Ghidra instruction rows are independently checked against exact payload bytes. Uncovered payload ranges are retained because the report describes reachable decoded instructions and the mapped object can also contain data.',
      'REA evidence was imported from standalone Ghidra JSON; it is not a live REA native-provider session, and the raw subject format remains represented as unknown in REA 3.2.1.',
      'Argument names and function-constant references are metadata observations. They do not alone establish dynamic values, caller identity, or a complete call graph.',
      'AA0 and scene-report parity is established for this one seed-1234 writer-stream run with SmallImage disabled and the recorded setup hashes.',
    ],
  };
}
