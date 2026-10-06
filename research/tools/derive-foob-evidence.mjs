#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual as same } from 'node:util';
import { parseFoobReport } from './parse-foob-report.mjs';
import { compareFoobCapture } from './compare-foob-capture.mjs';
import { deriveBrushBufferPredicateNativeEvidence } from './derive-brush-buffer-predicate-native-evidence.mjs';

const PROJECT_ROOT = resolve('.');
const LOCAL_ORACLE_ROOT = resolve('research/extracted/local-oracle');
const PROBE_PATH = 'research/introspection/foob-capture.cl';
const EXPECTED_PROBE_SHA256 = '98ee018bae7791bdccf6a4cb675ea81e59710ec81053242d5d203337acf47801';
const NATIVE_EVIDENCE_PATH = 'research/introspection/evidence/brush-buffer-predicate-native-20261006.json';
const EXPECTED_NATIVE_EVIDENCE_SHA256 = 'd6ffe3fa63958b79ea14199c098f121f3d4d3ce94d68cc3aa010ac750f28f0f4';
const OUTPUT_ROOT = 'research/extracted/local-oracle/foob-capture-seed1234-20261006-a';
const DEFAULT_OUTPUT = `${OUTPUT_ROOT}/foob-capture-derived-evidence.json`;
const SETUP_HASHES = ['installerSha256', 'registryPatchSha256', 'licensePatchSha256'];
const EXPECTED_OUTPUT_NAMES = ['aaron-foob.txt'];
const RELEASE_FILE = 'C:\\temp\\aaron-native-code-release.txt';
const RUNS = [
  {
    root: 'research/extracted/local-oracle/foob-capture-seed1234-20261006-a',
    runId: 'foob-capture-seed1234-20261006-a',
    mode: 'writer-stream-seed-1234',
    expectedNaturalCalls: 63794,
    loadedSceneSource: 'scene-state-snapshot-writer-stream-seeded-1234.cl',
    stagedLispSources: ['scene-state-snapshot-writer-seeded-1234.cl'],
    controlRoot: 'research/extracted/local-oracle/foob-capture-control-seed1234-20261006-b',
    controlId: 'foob-capture-control-seed1234-20261006-b',
  },
  {
    root: 'research/extracted/local-oracle/foob-capture-seed5678-20261006-c',
    runId: 'foob-capture-seed5678-20261006-c',
    mode: 'writer-full-seed-5678',
    expectedNaturalCalls: 102278,
    loadedSceneSource: 'scene-state-snapshot-writer-full-seeded-5678.cl',
    stagedLispSources: [],
    controlRoot: 'research/extracted/local-oracle/foob-capture-control-seed5678-20261006-d',
    controlId: 'foob-capture-control-seed5678-20261006-d',
  },
];
const CODE_SOURCES = [
  PROBE_PATH,
  'research/tools/parse-foob-report.mjs',
  'research/tools/parse-natural-free-path-report.mjs',
  'research/tools/compare-foob-capture.mjs',
  'engine/src/aaron-picture-bounds.js',
  'research/tools/derive-brush-buffer-predicate-native-evidence.mjs',
  'research/oracle/run-local-scene-state.ps1',
  'research/tools/patch-registry-running.ps1',
  'research/tools/patch-license-user-registry.ps1',
  'research/tools/parse-scene-state-report.mjs',
  'research/extracted/aaron/manifest.json',
];
const COMMON_LISP_SOURCES = [
  ['planning-call-trace.cl', 'research/introspection/planning-call-trace.cl'],
  ['planning-random-seed-common.cl', 'research/oracle/planning-random-seed-common.cl'],
  ['scene-state-snapshot.cl', 'research/introspection/scene-state-snapshot.cl'],
  ['scene-state-snapshot-seeded-1234.cl', 'research/introspection/scene-state-snapshot-seeded-1234.cl'],
];

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const parseJson = (bytes, label) => {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), `${label} is not round-trip UTF-8`);
  return JSON.parse(text.replace(/^\uFEFF/u, ''));
};
const portable = path => path.replaceAll('\\', '/');
const within = (parent, candidate) => {
  const rel = relative(parent, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

const sources = new Map();
function trackedRead(path, label = path) {
  const absolute = resolve(path);
  assert(within(PROJECT_ROOT, absolute), `${label} escapes the checkout`);
  const bytes = readFileSync(absolute);
  const rel = portable(relative(PROJECT_ROOT, absolute));
  const entry = { path: rel, sha256: sha(bytes), bytes: bytes.length };
  const previous = sources.get(rel);
  assert(!previous || same(previous, entry), `${label} changed during evidence derivation`);
  sources.set(rel, entry);
  return bytes;
}

function requireObject(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value;
}

function expectKeys(value, expected, label) {
  requireObject(value, label);
  assert(Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)),
    `${label} fields differ`);
  return value;
}

function hashField(value, label) {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/iu.test(value), `${label} is not a SHA-256`);
  return value.toLowerCase();
}

function equalArray(actual, expected, label) {
  assert(Array.isArray(actual) && same(actual, expected), `${label} differs`);
}

function assertIgnored(path, label) {
  const rel = portable(relative(PROJECT_ROOT, resolve(path)));
  const result = spawnSync('git', ['check-ignore', '--quiet', '--', rel], {
    cwd: PROJECT_ROOT, encoding: 'utf8', windowsHide: true,
  });
  assert(!result.error && result.status === 0, `${label} is not covered by workspace ignore rules`);
}

function sourceIdentity(bindings) {
  return bindings.map(({ filename, sourcePath, sha256, stagedSha256, bytes, byteIdentical }) =>
    ({ filename, sourcePath, sha256, stagedSha256, bytes, byteIdentical }));
}

function readSetupBaseline() {
  const manifestBytes = trackedRead('research/extracted/aaron/manifest.json', 'AARON extracted setup manifest');
  const manifest = parseJson(manifestBytes, 'AARON extracted setup manifest');
  requireObject(manifest.source, 'AARON setup manifest source');
  assert(Array.isArray(manifest.files) && manifest.files.length === 12, 'AARON setup manifest file list differs');
  const installerSha256 = hashField(manifest.source.sha256, 'setup installer SHA-256');
  const msi = trackedRead('research/extracted/aaron/installer/AARON.msi', 'extracted AARON MSI');
  const embeddedMsiSha256 = hashField(manifest.source.embeddedMsiSha256, 'embedded MSI SHA-256');
  assert(msi.length === manifest.source.embeddedMsiBytes && sha(msi) === embeddedMsiSha256,
    'Extracted AARON MSI differs from setup manifest');
  const seen = new Set();
  const applicationFiles = manifest.files.map((row, index) => {
    requireObject(row, `setup manifest file ${index}`);
    assert(typeof row.installedName === 'string' && basename(row.installedName) === row.installedName
      && !seen.has(row.installedName), `setup manifest file ${index} name is invalid or duplicated`);
    seen.add(row.installedName);
    const bytes = trackedRead(resolve('research/extracted/aaron/application', row.installedName),
      `extracted original ${row.installedName}`);
    assert(bytes.length === row.bytes && sha(bytes) === hashField(row.sha256, `manifest ${row.installedName} hash`),
      `Extracted AARON application file differs from manifest: ${row.installedName}`);
    return { name: row.installedName, bytes: row.bytes, sha256: row.sha256.toLowerCase() };
  });
  return { manifest, manifestSha256: sha(manifestBytes), installerSha256,
    msiSha256: embeddedMsiSha256, msiBytes: msi.length, applicationFiles };
}

function readPortableNativeEvidence() {
  const bytes = trackedRead(NATIVE_EVIDENCE_PATH, 'portable predicate-native evidence JSON');
  const digest = sha(bytes);
  assert(digest === EXPECTED_NATIVE_EVIDENCE_SHA256,
    `Portable predicate-native evidence hash changed: ${digest}`);
  const stored = parseJson(bytes, 'portable predicate-native evidence JSON');
  assert(Array.isArray(stored.sourceHashes) && stored.sourceHashes.length === 56,
    'Portable predicate-native evidence source closure differs from the pinned 56-file audit');
  const seen = new Set();
  for (const [index, row] of stored.sourceHashes.entries()) {
    expectKeys(row, ['path', 'sha256', 'bytes'], `native source hash ${index}`);
    assert(typeof row.path === 'string' && row.path.length > 0 && !seen.has(row.path),
      `native source hash ${index} path is invalid or duplicated`);
    seen.add(row.path);
    assert(Number.isSafeInteger(row.bytes) && row.bytes >= 0, `native source hash ${index} byte count is invalid`);
    const live = trackedRead(row.path, `current native binding ${row.path}`);
    assert(live.length === row.bytes && sha(live) === hashField(row.sha256, `native source hash ${index}`),
      `Portable predicate-native source changed: ${row.path}`);
  }
  const derived = deriveBrushBufferPredicateNativeEvidence();
  assert(same(derived, stored), 'Portable predicate-native JSON differs from current complete derivation');
  const canonicalBytes = Buffer.from(`${JSON.stringify(derived, null, 2)}\n`, 'utf8');
  assert(canonicalBytes.equals(bytes), 'Portable predicate-native JSON is not the canonical derived serialization');
  return {
    path: NATIVE_EVIDENCE_PATH,
    sha256: digest,
    bytes: bytes.length,
    sourceCount: stored.sourceHashes.length,
    sourceClosureRevalidated: true,
    currentDerivationMatches: true,
    functions: stored.nativeMapping.functions.map(fn => fn.name),
  };
}

function validateSummary(summary, config, instrumented, setupBaseline) {
  requireObject(summary, `${config.runId} summary`);
  assert(summary.complete === true && summary.runId === config.runId
    && summary.mode === config.mode && summary.smallImage === false,
  `${config.runId} summary is incomplete or has the wrong mode/image size`);
  assert(summary.preSceneProbePauseSeconds === 0, `${config.runId} probe pause is not zero`);
  equalArray(summary.probeOutputNames, instrumented ? EXPECTED_OUTPUT_NAMES : [],
    `${config.runId} probe output names`);
  if (instrumented) {
    assert(hashField(summary.preSceneProbeSha256, `${config.runId} summary probe`) === EXPECTED_PROBE_SHA256,
      `${config.runId} summary does not bind the frozen FOOB probe`);
  } else {
    assert(summary.preSceneProbeSha256 === null, `${config.runId} control unexpectedly has probe metadata`);
  }
  const setup = {};
  for (const key of SETUP_HASHES) setup[key] = hashField(summary[key], `${config.runId} ${key}`);
  assert(setup.installerSha256 === setupBaseline.installerSha256,
    `${config.runId} installer hash differs from the current extracted setup manifest`);
  return setup;
}

function readCoreCapture(root, runId, summary, setupManifest) {
  const aa0 = trackedRead(resolve(root, 'capture/aa0'), `${runId} AA0 image`);
  const scene = trackedRead(resolve(root, 'capture/aaron-scene-state-snapshot.txt'), `${runId} scene report`);
  const sceneJsonBytes = trackedRead(resolve(root, 'scene-state.json'), `${runId} structured scene capture`);
  const sceneJson = parseJson(sceneJsonBytes, `${runId} structured scene capture`);
  const image = trackedRead(resolve(root, 'capture/image'), `${runId} original image`);
  const imageId = trackedRead(resolve(root, 'capture/image-id'), `${runId} original image id`);
  const executable = trackedRead(resolve(root, 'runtime/AARON.exe'), `${runId} runtime executable`);
  const pll = trackedRead(resolve(root, 'runtime/AARON.pll'), `${runId} runtime image`);
  const runtimeFiles = setupManifest.files.map(row => {
    const original = trackedRead(resolve('research/extracted/aaron/application', row.installedName),
      `${runId} current original ${row.installedName}`);
    const bytes = trackedRead(resolve(root, 'runtime', row.installedName), `${runId} runtime ${row.installedName}`);
    const patched = ['registry.dll', 'license.dll'].includes(row.installedName.toLowerCase());
    if (!patched) assert(bytes.equals(original), `${runId} runtime ${row.installedName} differs from the extracted original`);
    return { name: row.installedName, bytes, sha256: sha(bytes), originalSha256: sha(original), patched };
  });
  const registryRuntime = runtimeFiles.find(file => file.name.toLowerCase() === 'registry.dll');
  const licenseRuntime = runtimeFiles.find(file => file.name.toLowerCase() === 'license.dll');
  assert(registryRuntime && licenseRuntime
    && registryRuntime.sha256 === hashField(summary.registryPatchSha256, `${runId} registry patch output`)
    && licenseRuntime.sha256 === hashField(summary.licensePatchSha256, `${runId} license patch output`),
  `${runId} summary patch hashes do not bind the patched runtime DLLs`);
  const aa0Sha256 = sha(aa0), sceneSha256 = sha(scene);
  assert(aa0Sha256 === hashField(summary.aa0Sha256, `${runId} summary AA0`)
    && sceneSha256 === hashField(summary.sceneReportSha256, `${runId} summary scene report`),
  `${runId} summary hashes do not bind AA0 and the scene report`);
  assert(sceneJson.schemaVersion === 1 && sceneJson.source?.localRunId === runId
    && hashField(sceneJson.source?.sha256, `${runId} structured-scene source`) === sceneSha256,
  `${runId} structured scene JSON does not bind its exact scene report/run`);
  return {
    aa0, scene, sceneJson, image, imageId, executable, pll,
    runtimeFiles,
    aa0Sha256, sceneSha256,
    imageSha256: sha(image), imageBytes: image.length,
    imageIdSha256: sha(imageId), imageIdBytes: imageId.length,
    sceneJsonSha256: sha(sceneJsonBytes), sceneJsonBytes: sceneJsonBytes.length,
    runtimeExecutableSha256: sha(executable), runtimeExecutableBytes: executable.length,
    runtimeImageSha256: sha(pll), runtimeImageBytes: pll.length,
  };
}

function readLoadedSourceBindings(root, config, loader = null) {
  const sourcesForMode = [...COMMON_LISP_SOURCES,
    ...config.stagedLispSources.map(filename => [filename, `research/introspection/${filename}`]),
    [config.loadedSceneSource, `research/introspection/${config.loadedSceneSource}`]];
  const loadedSources = sourcesForMode.map(([filename, sourcePath]) => {
    const current = trackedRead(sourcePath, `${config.runId} current source ${filename}`);
    const staged = trackedRead(resolve(root, 'capture', filename), `${config.runId} staged source ${filename}`);
    assert(current.equals(staged), `${config.runId} staged Lisp source differs from current original ${filename}`);
    return {
      filename,
      sourcePath,
      stagedPath: portable(relative(PROJECT_ROOT, resolve(root, 'capture', filename))),
      sha256: sha(current),
      stagedSha256: sha(staged),
      bytes: current.length,
      byteIdentical: true,
    };
  });
  const runtimeInit = {};
  const runtimeInitBytes = {};
  for (const filename of ['.clinit.cl', 'clinit.cl']) {
    const bytes = trackedRead(resolve(root, 'runtime', filename), `${config.runId} loaded runtime ${filename}`);
    runtimeInitBytes[filename] = bytes;
    runtimeInit[filename] = { sha256: sha(bytes), bytes: bytes.length };
  }
  const sceneSourceBytes = trackedRead(resolve(root, 'capture', config.loadedSceneSource),
    `${config.runId} selected mode source`);
  let runtimeLoaderSha256 = null;
  let startupRoute;
  if (loader) {
    const modeLoad = `load "C:\\\\temp\\\\${config.loadedSceneSource}"`;
    assert(loader.toString('utf8').includes(modeLoad), `${config.runId} loader does not load its recorded mode source`);
    const runtimeLoader = trackedRead(resolve(root, 'runtime/aaron-probe-loader.cl'), `${config.runId} runtime probe loader`);
    const captureLoader = trackedRead(resolve(root, 'capture/aaron-probe-loader.cl'), `${config.runId} staged probe loader`);
    assert(runtimeLoader.equals(captureLoader) && runtimeLoader.equals(loader),
      `${config.runId} runtime/staged probe loader bytes differ`);
    assert(runtimeInitBytes['.clinit.cl'].equals(runtimeLoader)
      && runtimeInitBytes['clinit.cl'].equals(runtimeLoader),
    `${config.runId} startup Lisp files do not byte-match the probe loader`);
    runtimeLoaderSha256 = sha(runtimeLoader);
    startupRoute = { kind: 'probe-loader-then-mode-source', modeSource: config.loadedSceneSource,
      modeSourceSha256: sha(sceneSourceBytes), probeLoaderSha256: runtimeLoaderSha256 };
  } else {
    assert(runtimeInitBytes['.clinit.cl'].equals(sceneSourceBytes)
      && runtimeInitBytes['clinit.cl'].equals(sceneSourceBytes),
    `${config.runId} control startup Lisp files do not byte-match the selected mode source`);
    startupRoute = { kind: 'direct-mode-source', modeSource: config.loadedSceneSource,
      modeSourceSha256: sha(sceneSourceBytes) };
  }
  return { loadedSources, runtimeInit, runtimeLoaderSha256, startupRoute, runtimeRoutingValidated: true };
}

function readProbeRequest(root, config) {
  const requestBytes = trackedRead(resolve(root, 'pre-scene-probe-request.json'), `${config.runId} probe request`);
  const request = parseJson(requestBytes, `${config.runId} probe request`);
  expectKeys(request, ['schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256',
    'pauseSeconds', 'releaseFile', 'probeOutputNames'], `${config.runId} probe request`);
  assert(request.schemaVersion === 1 && request.runId === config.runId && request.pauseSeconds === 0
    && request.releaseFile === RELEASE_FILE,
  `${config.runId} request identity/pause/release policy differs`);
  equalArray(request.probeOutputNames, EXPECTED_OUTPUT_NAMES, `${config.runId} request output names`);
  const currentProbe = trackedRead(PROBE_PATH, 'current frozen FOOB probe');
  const stagedProbe = trackedRead(resolve(root, 'capture/aaron-pre-scene-probe.cl'), `${config.runId} staged FOOB probe`);
  const probeHash = hashField(request.probeSha256, `${config.runId} request probe hash`);
  assert(sha(currentProbe) === EXPECTED_PROBE_SHA256 && probeHash === EXPECTED_PROBE_SHA256
    && stagedProbe.equals(currentProbe) && hashField(config.summary.preSceneProbeSha256,
      `${config.runId} summary probe hash`) === EXPECTED_PROBE_SHA256,
  `${config.runId} current/staged/request/summary frozen-probe bindings differ`);
  const executablePath = resolve(root, 'runtime/AARON.exe');
  assert(resolve(request.runtimeExecutable).toLowerCase() === executablePath.toLowerCase(),
    `${config.runId} request executable is not its owned runtime image`);
  const loader = trackedRead(resolve(root, 'capture/aaron-probe-loader.cl'), `${config.runId} probe loader`);
  assert(loader.toString('utf8').includes('load "C:\\\\temp\\\\aaron-pre-scene-probe.cl"'),
    `${config.runId} probe loader does not load the staged FOOB source`);
  const sourceBindings = readLoadedSourceBindings(root, config, loader);
  const tape = trackedRead(resolve(root, 'capture/aaron-foob.txt'), `${config.runId} FOOB report`);
  return {
    request, requestSha256: sha(requestBytes),
    probeSha256: EXPECTED_PROBE_SHA256, probeBytes: currentProbe.length,
    stagedProbeSha256: sha(stagedProbe), loaderSha256: sha(loader),
    sourceBindings,
    tape, tapeSha256: sha(tape), tapeBytes: tape.length,
  };
}

function validateControl(config, instrumented, instrumentedCore, setupBaseline) {
  const root = resolve(config.controlRoot);
  assert(within(LOCAL_ORACLE_ROOT, root) && basename(root) === config.controlId,
    `${config.controlId} is outside its named local-oracle root`);
  const summaryBytes = trackedRead(resolve(root, 'summary.json'), `${config.controlId} summary`);
  const summary = parseJson(summaryBytes, `${config.controlId} summary`);
  const setup = validateSummary(summary, { ...config, runId: config.controlId }, false, setupBaseline);
  const core = readCoreCapture(root, config.controlId, summary, setupBaseline.manifest);
  const sourceBindings = readLoadedSourceBindings(root, { ...config, runId: config.controlId });
  for (const rel of ['pre-scene-probe-request.json', 'capture/aaron-pre-scene-probe.cl',
    'capture/aaron-foob.txt', 'capture/aaron-probe-loader.cl']) {
    assert(!existsSync(resolve(root, rel)), `${config.controlId} control contains probe artifact ${rel}`);
  }
  return {
    runId: config.controlId,
    pairedRunId: instrumented.runId,
    root: portable(relative(PROJECT_ROOT, root)),
    summarySha256: sha(summaryBytes),
    mode: summary.mode,
    smallImage: summary.smallImage,
    setup,
    capture: core,
    loadedSourceBindings: sourceBindings,
    parity: {
      originalImageByteIdentical: core.image.equals(instrumentedCore.image),
      imageIdByteIdentical: core.imageId.equals(instrumentedCore.imageId),
      aa0ByteIdentical: core.aa0.equals(instrumentedCore.aa0),
      sceneReportByteIdentical: core.scene.equals(instrumentedCore.scene),
      runtimeExecutableByteIdentical: core.executable.equals(instrumentedCore.executable),
      runtimeImageByteIdentical: core.pll.equals(instrumentedCore.pll),
      loadedSourcesByteIdentical: same(sourceIdentity(sourceBindings.loadedSources),
        sourceIdentity(instrumented.loadedSourceBindings.loadedSources)),
      startupRoutesBoundToSameModeSource: sourceBindings.startupRoute.modeSource === instrumented.loadedSourceBindings.startupRoute.modeSource
        && sourceBindings.startupRoute.modeSourceSha256 === instrumented.loadedSourceBindings.startupRoute.modeSourceSha256,
      runtimeFilesByteIdentical: core.runtimeFiles.length === instrumentedCore.runtimeFiles.length
        && core.runtimeFiles.every((file, index) => file.name === instrumentedCore.runtimeFiles[index].name
          && file.bytes.equals(instrumentedCore.runtimeFiles[index].bytes)),
      sameSetupHashes: same(setup, instrumented.setup),
    },
  };
}

function descriptorType(value, label) {
  assert(value && typeof value === 'object', `${label} is missing a typed numeric descriptor`);
  if (value.kind === 'integer') return 'INTEGER';
  if (value.kind === 'number' && ['SINGLE-FLOAT', 'DOUBLE-FLOAT'].includes(value.type)) return value.type;
  throw new Error(`${label} has unsupported observed type ${String(value.kind)}`);
}

function histogram(values) {
  const counts = Object.create(null);
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function sumHistogram(hist) {
  return Object.values(hist).reduce((total, count) => total + count, 0);
}

function comparisonHistogram(hist) {
  return { t: hist.T ?? 0, nil: hist.NIL ?? 0 };
}

function naturalSummary(report) {
  const xTypes = [], yTypes = [], pairs = [];
  for (const [index, call] of report.calls.entries()) {
    xTypes.push(descriptorType(call.args[0], `natural call ${index} x`));
    yTypes.push(descriptorType(call.args[1], `natural call ${index} y`));
    pairs.push(`${descriptorType(call.args[0], `natural call ${index} x`)}/${descriptorType(call.args[1], `natural call ${index} y`)}`);
  }
  const dimensions = [...new Set(report.calls.map(call => `${call.width}x${call.height}`))]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const returnHistogram = histogram(report.calls.map(call => call.result ? 'T' : 'NIL'));
  const xValues = report.calls.map(call => call.args[0].value);
  const yValues = report.calls.map(call => call.args[1].value);
  const valueRange = values => values.reduce((range, value) => ({
    min: Math.min(range.min, value), max: Math.max(range.max, value),
  }), { min: Infinity, max: -Infinity });
  const sampledWindow = { xMin: -20, xMax: report.dimensions.width + 20,
    yMin: -20, yMax: report.dimensions.height + 20 };
  const dimensionHistogram = histogram(report.calls.map(call => `${call.width}x${call.height}`));
  const observed = report.calls.map(call => ({ width: call.width, height: call.height,
    x: call.args[0], y: call.args[1], result: call.result }));
  return {
    calls: report.calls.length,
    dimensions,
    dimensionHistogram,
    argumentRanges: {
      x: valueRange(xValues),
      y: valueRange(yValues),
      sampledIntegerWindow: sampledWindow,
      allArgumentsWithinSampledIntegerWindow: report.calls.every(call =>
        call.args[0].value >= sampledWindow.xMin && call.args[0].value <= sampledWindow.xMax
        && call.args[1].value >= sampledWindow.yMin && call.args[1].value <= sampledWindow.yMax),
    },
    xArgumentTypes: histogram(xTypes),
    yArgumentTypes: histogram(yTypes),
    argumentTypePairs: histogram(pairs),
    returnHistogram,
    observedCallsSha256: sha(Buffer.from(JSON.stringify(observed), 'utf8')),
  };
}

function floatSummary(points) {
  const typePairs = histogram(points.map(point => `${point.x.type}/${point.y.type}`));
  const shortName = type => type === 'SINGLE-FLOAT' ? 'S' : 'D';
  const axisPairs = { SS: 0, SD: 0, DS: 0, DD: 0 };
  for (const point of points) axisPairs[`${shortName(point.x.type)}${shortName(point.y.type)}`] += 1;
  assert(same(axisPairs, { SS: 81, SD: 81, DS: 81, DD: 81 }), 'FOOB float precision pair coverage is incomplete');
  const resultHistogram = histogram(points.map(point => point.result ? 'T' : 'NIL'));
  const observations = points.map(point => ({
    xPrecision: point.x.type,
    yPrecision: point.y.type,
    xi: point.xi,
    yi: point.yi,
    x: point.x,
    y: point.y,
    result: point.result,
  }));
  return {
    points: points.length,
    axisPairs,
    typedAxisPairs: typePairs,
    perPairPoints: 81,
    sampleRule: 'Nine axis samples per dimension: -1, -0.5, 0, 0.5, extent-1.5, extent-1, extent-0.5, extent, extent+0.5; x/y precisions independently cover SS, SD, DS, DD.',
    returnHistogram: resultHistogram,
    observationsSha256: sha(Buffer.from(JSON.stringify(observations), 'utf8')),
  };
}

function validateComparison(comparison, report, config) {
  requireObject(comparison, `${config.runId} comparison`);
  assert(comparison.schemaVersion === 1 && comparison.model?.trueMeans === 'outside'
    && comparison.model?.falseMeans === 'inside'
    && comparison.coverage && comparison.histograms && comparison.types
    && comparison.matrix && comparison.natural,
  `${config.runId} comparer result is missing required sections`);
  const integerCalls = (report.dimensions.width + 41) * (report.dimensions.height + 41);
  assert(integerCalls === 188081 && report.dimensions.width === 320 && report.dimensions.height === 480,
    `${config.runId} matrix dimensions/call count are not the expected 320x480, 188081 grid`);
  assert(comparison.coverage.integer?.calls === integerCalls
    && comparison.coverage.integer?.rows === 521
    && comparison.coverage.float?.calls === 324 && comparison.coverage.float?.points === 324
    && comparison.coverage.natural?.calls === report.calls.length,
  `${config.runId} comparer did not cover every expected integer, float, and natural call`);
  assert(comparison.matrix.dimensions?.width === 320 && comparison.matrix.dimensions?.height === 480
    && same(comparison.matrix.bounds, { xMin: 0, xMax: 319, yMin: 0, yMax: 479 }),
  `${config.runId} comparer picture bounds differ`);
  assert(same(comparison.matrix.floatPrecisionPairs, {
    'SINGLE-FLOAT/SINGLE-FLOAT': 81,
    'SINGLE-FLOAT/DOUBLE-FLOAT': 81,
    'DOUBLE-FLOAT/SINGLE-FLOAT': 81,
    'DOUBLE-FLOAT/DOUBLE-FLOAT': 81,
  }), `${config.runId} comparer float precision pairs differ`);
  const required = [
    ['integer', integerCalls], ['float', 324], ['natural', report.calls.length],
  ];
  for (const [kind, count] of required) {
    const row = comparison.comparisons?.[kind];
    assert(row?.compared === count && row.mismatches === 0,
      `${config.runId} ${kind} model comparison is incomplete or has mismatches`);
  }
  expectKeys(comparison.parsedArrayHashes,
    ['integerRowsSha256', 'floatPointsSha256', 'naturalCallsSha256'], `${config.runId} parsed-array hashes`);
  for (const [name, digest] of Object.entries(comparison.parsedArrayHashes)) hashField(digest, `${config.runId} ${name}`);
  return {
    model: comparison.model,
    coverage: comparison.coverage,
    comparisons: comparison.comparisons,
    histograms: comparison.histograms,
    types: comparison.types,
    matrix: comparison.matrix,
    natural: comparison.natural,
    parsedArrayHashes: comparison.parsedArrayHashes,
  };
}

function readInstrumented(config, setupBaseline) {
  const root = resolve(config.root);
  assert(within(LOCAL_ORACLE_ROOT, root) && basename(root) === config.runId,
    `${config.runId} is outside its named local-oracle root`);
  const summaryBytes = trackedRead(resolve(root, 'summary.json'), `${config.runId} summary`);
  const summary = parseJson(summaryBytes, `${config.runId} summary`);
  const setup = validateSummary(summary, config, true, setupBaseline);
  const core = readCoreCapture(root, config.runId, summary, setupBaseline.manifest);
  const prepared = readProbeRequest(root, { ...config, summary });
  const report = parseFoobReport(prepared.tape.toString('utf8'));
  const comparison = compareFoobCapture(report);
  const validatedComparison = validateComparison(comparison, report, config);
  assert(report.calls.length === config.expectedNaturalCalls,
    `${config.runId} natural FOOB call count differs from the completed tape`);
  const integerExpected = (report.dimensions.width + 41) * (report.dimensions.height + 41);
  assert(report.matrix.integerEnd.calls === integerExpected && report.matrix.integerEnd.rows === 521
    && report.matrix.points.length === 324 && report.calls.length > 0,
  `${config.runId} parser coverage differs from full expected capture`);
  assert(sumHistogram(report.matrix.histogram) === integerExpected,
    `${config.runId} parsed integer return histogram does not cover the full grid`);
  const floatStats = floatSummary(report.matrix.points);
  const naturalStats = naturalSummary(report);
  assert(same(comparison.histograms.float, comparisonHistogram(floatStats.returnHistogram))
    && same(comparison.histograms.natural, comparisonHistogram(naturalStats.returnHistogram)),
  `${config.runId} compared float/natural return histograms differ from derived observations`);
  assert(same(comparison.types.naturalCalls, {
    x: naturalStats.xArgumentTypes,
    y: naturalStats.yArgumentTypes,
    tuples: naturalStats.argumentTypePairs,
  }) && same(comparison.natural.dimensions, naturalStats.dimensionHistogram),
  `${config.runId} compared natural type/dimension histograms differ from derived observations`);
  return {
    config,
    runId: config.runId,
    root: portable(relative(PROJECT_ROOT, root)),
    mode: config.mode,
    smallImage: false,
    summarySha256: sha(summaryBytes),
    setup,
    capture: core,
    loadedSourceBindings: prepared.sourceBindings,
    requestSha256: prepared.requestSha256,
    probe: {
      sourcePath: PROBE_PATH,
      sha256: prepared.probeSha256,
      bytes: prepared.probeBytes,
      stagedSha256: prepared.stagedProbeSha256,
      loaderSha256: prepared.loaderSha256,
      outputName: EXPECTED_OUTPUT_NAMES[0],
      reportSha256: prepared.tapeSha256,
      reportBytes: prepared.tapeBytes,
    },
    report: {
      target: { name: report.target.name, package: report.target.package, type: report.target.type },
      arglist: report.arglist,
      dimensions: report.dimensions,
      matrix: {
        integer: {
          rows: report.matrix.integerEnd.rows,
          calls: report.matrix.integerEnd.calls,
          argumentTypes: { x: 'INTEGER', y: 'INTEGER' },
          bounds: { xMin: -20, xMax: report.dimensions.width + 20, yMin: -20, yMax: report.dimensions.height + 20 },
          returnHistogram: report.matrix.histogram,
        },
        float: floatStats,
        state: {
          copiedMapCells: report.matrix.copiedMapCells,
          checks: report.matrix.state.checks,
          unchanged: same(report.matrix.state.before, report.matrix.state.after),
        },
      },
      natural: naturalStats,
      completion: report.complete,
    },
    modelComparison: validatedComparison,
    parityControlId: config.controlId,
  };
}

function deriveFoobEvidence() {
  sources.clear();
  const nativeBaseline = readPortableNativeEvidence();
  const setupBaseline = readSetupBaseline();
  for (const file of CODE_SOURCES) trackedRead(file, `FOOB derivation source ${file}`);
  const runs = RUNS.map(config => readInstrumented(config, setupBaseline));
  const controls = [];
  for (const run of runs) {
    const config = run.config;
    const control = validateControl(config, run, run.capture, setupBaseline);
    for (const key of SETUP_HASHES) {
      assert(control.setup[key] === run.setup[key], `${run.runId}/${control.runId} ${key} differs`);
    }
    for (const field of ['originalImageByteIdentical', 'imageIdByteIdentical', 'aa0ByteIdentical',
      'sceneReportByteIdentical', 'runtimeExecutableByteIdentical', 'runtimeImageByteIdentical',
      'loadedSourcesByteIdentical', 'startupRoutesBoundToSameModeSource', 'runtimeFilesByteIdentical']) {
      assert(control.parity[field] === true, `${run.runId}/${control.runId} ${field} failed`);
    }
    assert(control.parity.sameSetupHashes === true, `${run.runId}/${control.runId} setup hash parity failed`);
    controls.push(control);
  }
  for (const file of CODE_SOURCES) trackedRead(file, `FOOB derivation source closure ${file}`);
  trackedRead('research/tools/derive-foob-evidence.mjs', 'this FOOB derivation source');
  const sourceHashes = [...sources.values()].sort((left, right) => left.path.localeCompare(right.path));
  return {
    schemaVersion: 1,
    kind: 'Seeded AARON FOOB capture compared against the explicit picture-bounds candidate with full integer, typed-float, and natural-call coverage',
    nativeBaseline,
    setupBaseline: {
      manifestSha256: setupBaseline.manifestSha256,
      installerSha256: setupBaseline.installerSha256,
      msiSha256: setupBaseline.msiSha256,
      msiBytes: setupBaseline.msiBytes,
      applicationFiles: setupBaseline.applicationFiles,
    },
    probe: {
      path: PROBE_PATH,
      sha256: EXPECTED_PROBE_SHA256,
      outputName: EXPECTED_OUTPUT_NAMES[0],
      pauseSeconds: 0,
      smallImage: false,
    },
    captures: runs.map(run => ({
      runId: run.runId,
      root: run.root,
      mode: run.mode,
      smallImage: run.smallImage,
      summarySha256: run.summarySha256,
      requestSha256: run.requestSha256,
      probe: run.probe,
      runtime: {
        executableSha256: run.capture.runtimeExecutableSha256,
        executableBytes: run.capture.runtimeExecutableBytes,
        imageSha256: run.capture.runtimeImageSha256,
        imageBytes: run.capture.runtimeImageBytes,
        files: run.capture.runtimeFiles.map(file => ({ name: file.name, bytes: file.bytes.length,
          sha256: file.sha256, originalSha256: file.originalSha256, patched: file.patched })),
        clFiles: run.loadedSourceBindings.runtimeInit,
      },
      loadedLispSources: run.loadedSourceBindings.loadedSources,
      runtimeProbeLoaderSha256: run.loadedSourceBindings.runtimeLoaderSha256,
      startupRoute: run.loadedSourceBindings.startupRoute,
      runtimeRoutingValidated: run.loadedSourceBindings.runtimeRoutingValidated,
      originalImage: {
        sha256: run.capture.imageSha256,
        bytes: run.capture.imageBytes,
        idSha256: run.capture.imageIdSha256,
        idBytes: run.capture.imageIdBytes,
      },
      setup: run.setup,
      drawing: {
        aa0Sha256: run.capture.aa0Sha256,
        aa0Bytes: run.capture.aa0.length,
        sceneReportSha256: run.capture.sceneSha256,
        sceneReportBytes: run.capture.scene.length,
        structuredSceneSha256: run.capture.sceneJsonSha256,
        structuredSceneBytes: run.capture.sceneJsonBytes,
      },
      report: run.report,
      modelComparison: run.modelComparison,
      parityControlId: run.parityControlId,
    })),
    controls: controls.map(control => ({
      runId: control.runId,
      root: control.root,
      mode: control.mode,
      smallImage: control.smallImage,
      summarySha256: control.summarySha256,
      setup: control.setup,
      originalImage: { sha256: control.capture.imageSha256, bytes: control.capture.imageBytes,
        idSha256: control.capture.imageIdSha256, idBytes: control.capture.imageIdBytes },
      runtime: { executableSha256: control.capture.runtimeExecutableSha256,
        executableBytes: control.capture.runtimeExecutableBytes,
        imageSha256: control.capture.runtimeImageSha256, imageBytes: control.capture.runtimeImageBytes,
        files: control.capture.runtimeFiles.map(file => ({ name: file.name, bytes: file.bytes.length,
          sha256: file.sha256, originalSha256: file.originalSha256, patched: file.patched })),
        clFiles: control.loadedSourceBindings.runtimeInit },
      loadedLispSources: control.loadedSourceBindings.loadedSources,
      startupRoute: control.loadedSourceBindings.startupRoute,
      runtimeRoutingValidated: control.loadedSourceBindings.runtimeRoutingValidated,
      runtimeClFiles: control.loadedSourceBindings.runtimeInit,
      drawing: { aa0Sha256: control.capture.aa0Sha256, aa0Bytes: control.capture.aa0.length,
        sceneReportSha256: control.capture.sceneSha256, sceneReportBytes: control.capture.scene.length,
        structuredSceneSha256: control.capture.sceneJsonSha256, structuredSceneBytes: control.capture.sceneJsonBytes },
    })),
    drawingParity: controls.map(control => ({ runId: control.pairedRunId,
      controlRunId: control.runId, ...control.parity })),
    limitations: [
      'The native predicate comparison covers the captured 320x480 image, its integer sample grid from -20 through each dimension plus 20, 324 typed float samples, and all natural FOOB calls logged by the probe.',
      'The JavaScript candidate uses finite numeric coordinates and inclusive pixel bounds 0 through dimension minus one; this evidence does not recover broader Allegro Lisp coercion or type behavior.',
      'The probe records only three preview random draws around the sampled matrix; it does not establish full random-state purity.',
      'The probe captures FOOB only. It does not establish that ZERO-EDGE was called in either scene.',
      'Natural mixed integer/float argument behavior is reported only when present in the captured call tape; no synthetic mixed-type calls are introduced.',
    ],
    sourceHashes,
  };
}

function parseArgs(args) {
  let output = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--output') {
      const value = args[index + 1];
      assert(value && !value.startsWith('--'), '--output requires a path');
      output = value;
      index += 1;
    } else if (arg.startsWith('--output=')) output = arg.slice('--output='.length);
    else throw new Error(`Unknown option ${arg}`);
  }
  return { help: false, output };
}

export { deriveFoobEvidence as deriveFoobCaptureEvidence };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: node research/tools/derive-foob-evidence.mjs [--output <fresh-ignored-json-under-seed1234-a>]\n');
    return;
  }
  const outputPath = resolve(args.output ?? DEFAULT_OUTPUT);
  const allowedOutputRoot = resolve(OUTPUT_ROOT);
  assert(within(allowedOutputRoot, outputPath), 'Derived evidence output must be under the owned seed-1234-a root');
  assert(!existsSync(outputPath), 'Derived evidence output must be fresh; refusing to overwrite');
  assertIgnored(outputPath, 'Derived evidence output');
  const evidence = deriveFoobEvidence();
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(outputPath, bytes, { flag: 'wx' });
  process.stdout.write(JSON.stringify({
    outputPath: portable(relative(PROJECT_ROOT, outputPath)),
    outputSha256: sha(bytes),
    captures: evidence.captures.map(run => ({ runId: run.runId, reportSha256: run.probe.reportSha256,
      dimensions: run.report.dimensions, integerCalls: run.report.matrix.integer.calls,
      floatPoints: run.report.matrix.float.points, naturalCalls: run.report.natural.calls,
      comparison: run.modelComparison.comparisons })),
    controls: evidence.controls.map(control => ({ runId: control.runId,
      aa0Sha256: control.drawing.aa0Sha256, sceneReportSha256: control.drawing.sceneReportSha256 })),
    nativeBaseline: evidence.nativeBaseline,
    sources: evidence.sourceHashes.length,
  }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
