#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual as same } from 'node:util';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { deriveBrushBufferPredicateNativeEvidence } from './derive-brush-buffer-predicate-native-evidence.mjs';

const PROJECT_ROOT = resolve('.');
const LOCAL_ORACLE_ROOT = 'research/extracted/local-oracle';
const PROBE_PATH = 'research/introspection/zero-edge-contract-v4.cl';
const EXPECTED_PROBE_SHA256 = '400cf8a4a5bf1fecfa9fd5e302f1d6226827f34eb84e2382114912044bb2bca2';
const EXPECTED_REPORT_SHA256 = '1f28f7df8ca0d28b72169d91e4474a5cbf3b8e3f8736128a5d2e345801d2a46f';
const NATIVE_EVIDENCE_PATH = 'research/introspection/evidence/brush-buffer-predicate-native-20261006.json';
const EXPECTED_NATIVE_EVIDENCE_SHA256 = 'd6ffe3fa63958b79ea14199c098f121f3d4d3ce94d68cc3aa010ac750f28f0f4';
const RUN = Object.freeze({
  root: `${LOCAL_ORACLE_ROOT}/zero-edge-contract-seed1234-20261006-g`,
  runId: 'zero-edge-contract-seed1234-20261006-g',
  mode: 'writer-stream-seed-1234',
  outputName: 'aaron-zero-edge-contract-v4.txt',
  loadedSceneSource: 'scene-state-snapshot-writer-stream-seeded-1234.cl',
});
const CONTROL = Object.freeze({
  root: `${LOCAL_ORACLE_ROOT}/zero-edge-contract-control-seed1234-20261006-h`,
  runId: 'zero-edge-contract-control-seed1234-20261006-h',
  mode: 'writer-stream-seed-1234',
  loadedSceneSource: RUN.loadedSceneSource,
});
const OUTPUT_ROOT = RUN.root;
const DEFAULT_OUTPUT = `${OUTPUT_ROOT}/zero-edge-contract-derived-evidence.json`;
const RELEASE_FILE = 'C:\\temp\\aaron-native-code-release.txt';
const EXPECTED_OUTPUT_NAMES = [RUN.outputName];
const EXPECTED_APPLICATION_FILES = [
  'AARON_ScreenSaver.scr', 'AARON.dxl', 'AARON.exe', 'AARON.pll', 'acl5016.dll',
  'ktiCompress.dll', 'license.dll', 'mfc42.dll', 'msvcirt.dll', 'registry.dll',
  'upload.dll', 'UserDocumentation.html',
];
const COMMON_LISP_SOURCES = [
  ['planning-call-trace.cl', 'research/introspection/planning-call-trace.cl'],
  ['planning-random-seed-common.cl', 'research/oracle/planning-random-seed-common.cl'],
  ['scene-state-snapshot.cl', 'research/introspection/scene-state-snapshot.cl'],
  ['scene-state-snapshot-seeded-1234.cl', 'research/introspection/scene-state-snapshot-seeded-1234.cl'],
  ['scene-state-snapshot-writer-seeded-1234.cl', 'research/introspection/scene-state-snapshot-writer-seeded-1234.cl'],
  ['scene-state-snapshot-writer-stream-seeded-1234.cl', 'research/introspection/scene-state-snapshot-writer-stream-seeded-1234.cl'],
];
const SUPPORT_SOURCES = [
  PROBE_PATH,
  'research/tools/parse-natural-free-path-report.mjs',
  'research/tools/derive-brush-buffer-predicate-native-evidence.mjs',
  'research/tools/map-native-code-to-pll.mjs',
  'research/tools/index-allegro-image.mjs',
  'research/oracle/run-local-scene-state.ps1',
  'research/tools/patch-registry-running.ps1',
  'research/tools/patch-license-user-registry.ps1',
  'research/tools/parse-scene-state-report.mjs',
  'research/extracted/aaron/manifest.json',
];
const EXPECTED_NATIVE_HASHES = 56;
const EXPECTED_FUNCTIONS = ['ZERO-EDGE', 'MAKE-TRIPT', 'X', 'Y', 'Z', 'MAIN'];
const EXPECTED_TAG_COUNTS = Object.freeze({
  BEGIN: 1, SCOPE: 1, LIMITS: 1, HELPER: 1, FUNCTION: 6, ARGLIST: 6,
  BINDING: 3, GATE: 1, 'MAIN-GATE': 1, INSTALL: 1, READY: 1,
  'MAIN-FINISH': 1, 'RNG-HELPER': 1, 'RNG-PREVIEW': 1,
  'STATE-BINDING': 6, 'SAMPLE-INPUT': 1, 'RNG-CHECK': 11,
  'SAMPLE-RETURN': 1, 'SLOT-READ': 6, ACCESSOR: 3, 'SAMPLE-POINT': 1,
  'STATE-DELTA': 3, 'POST-SAMPLE-RNG': 1, COMPLETE: 1, END: 1,
});

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = path => path.replaceAll('\\', '/');
const parseJson = (bytes, label) => {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), `${label} is not round-trip UTF-8`);
  try { return JSON.parse(text.replace(/^\uFEFF/u, '')); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
};
const within = (parent, candidate) => {
  const rel = relative(parent, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const trackedSources = new Map();

function trackedRead(path, label = path) {
  const absolute = resolve(path);
  assert(within(PROJECT_ROOT, absolute), `${label} escapes the checkout`);
  const bytes = readFileSync(absolute);
  const rel = portable(relative(PROJECT_ROOT, absolute));
  const row = { path: rel, sha256: sha(bytes), bytes: bytes.length };
  const previous = trackedSources.get(rel);
  assert(!previous || same(previous, row), `${label} changed during evidence derivation`);
  trackedSources.set(rel, row);
  return bytes;
}

function expectKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)),
  `${label} fields differ`);
  return value;
}

function hashField(value, label) {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/iu.test(value), `${label} is not a SHA-256`);
  return value.toLowerCase();
}

function assertIgnored(path, label) {
  const rel = portable(relative(PROJECT_ROOT, resolve(path)));
  const result = spawnSync('git', ['check-ignore', '--quiet', '--', rel], {
    cwd: PROJECT_ROOT, encoding: 'utf8', windowsHide: true,
  });
  assert(!result.error && result.status === 0, `${label} is not covered by workspace ignore rules`);
}

function revalidateTrackedSources() {
  const rows = [...trackedSources.values()].sort((left, right) => left.path.localeCompare(right.path));
  for (const row of rows) {
    const bytes = readFileSync(resolve(row.path));
    assert(bytes.length === row.bytes && sha(bytes) === row.sha256,
      `Source changed before evidence freeze: ${row.path}`);
  }
  return rows;
}

function readSetupBaseline() {
  const manifestBytes = trackedRead('research/extracted/aaron/manifest.json', 'extracted AARON setup manifest');
  const manifest = parseJson(manifestBytes, 'extracted AARON setup manifest');
  assert(manifest && typeof manifest === 'object' && manifest.source
    && Array.isArray(manifest.files) && manifest.files.length === 12,
  'AARON setup manifest must bind exactly 12 application files');
  const names = manifest.files.map(row => row?.installedName);
  assert(same([...names].sort(), [...EXPECTED_APPLICATION_FILES].sort()),
    'AARON setup manifest application file set differs from the expected 12-file runtime');
  const source = manifest.source;
  const installerSha256 = hashField(source.sha256, 'setup installer hash');
  const embeddedMsiSha256 = hashField(source.embeddedMsiSha256, 'embedded MSI hash');
  const msi = trackedRead('research/extracted/aaron/installer/AARON.msi', 'extracted AARON MSI');
  assert(msi.length === source.embeddedMsiBytes && sha(msi) === embeddedMsiSha256,
    'Extracted MSI bytes differ from the setup manifest');
  const seen = new Set();
  const applicationFiles = manifest.files.map((row, index) => {
    assert(row && typeof row.installedName === 'string' && basename(row.installedName) === row.installedName
      && !seen.has(row.installedName), `Setup manifest file ${index} name is invalid or duplicated`);
    seen.add(row.installedName);
    const bytes = trackedRead(resolve('research/extracted/aaron/application', row.installedName),
      `extracted original ${row.installedName}`);
    const expectedHash = hashField(row.sha256, `manifest ${row.installedName} hash`);
    assert(bytes.length === row.bytes && sha(bytes) === expectedHash,
      `Extracted original differs from the setup manifest: ${row.installedName}`);
    return { name: row.installedName, bytes: bytes.length, sha256: expectedHash };
  });
  return {
    manifest,
    manifestSha256: sha(manifestBytes),
    installerSha256,
    msiSha256: embeddedMsiSha256,
    msiBytes: msi.length,
    applicationFiles,
  };
}

function readNativeBaseline() {
  const bytes = trackedRead(NATIVE_EVIDENCE_PATH, 'portable FOOB/ZERO-EDGE native evidence');
  const digest = sha(bytes);
  assert(digest === EXPECTED_NATIVE_EVIDENCE_SHA256,
    `Pinned native evidence hash changed: ${digest}`);
  const stored = parseJson(bytes, 'portable FOOB/ZERO-EDGE native evidence');
  assert(Array.isArray(stored.sourceHashes) && stored.sourceHashes.length === EXPECTED_NATIVE_HASHES,
    `Portable native evidence must bind exactly ${EXPECTED_NATIVE_HASHES} source files`);
  const seen = new Set();
  for (const [index, row] of stored.sourceHashes.entries()) {
    expectKeys(row, ['path', 'sha256', 'bytes'], `native source binding ${index}`);
    assert(typeof row.path === 'string' && row.path.length > 0 && !seen.has(row.path),
      `Native source binding ${index} path is empty or repeated`);
    seen.add(row.path);
    assert(Number.isSafeInteger(row.bytes) && row.bytes >= 0,
      `Native source binding ${index} byte count is invalid`);
    const current = trackedRead(row.path, `current native source ${row.path}`);
    assert(current.length === row.bytes && sha(current) === hashField(row.sha256, `native source ${row.path}`),
      `Native source no longer matches portable evidence: ${row.path}`);
  }
  const derived = deriveBrushBufferPredicateNativeEvidence();
  assert(same(derived, stored), 'Portable native JSON differs from the complete current native derivation');
  const canonicalBytes = Buffer.from(`${JSON.stringify(derived, null, 2)}\n`, 'utf8');
  assert(canonicalBytes.equals(bytes), 'Portable native evidence is not the canonical current serialization');
  const nativeArglist = stored.nativeRuns?.[0]?.metadataSummary?.arglists
    ?.find(row => row.name === 'ZERO-EDGE');
  assert(nativeArglist?.values === '((COMMON-GRAPHICS-USER::START COMMON-GRAPHICS-USER::PERIM) T)',
    'Pinned native ZERO-EDGE arglist differs from the captured source record');
  return {
    path: NATIVE_EVIDENCE_PATH,
    sha256: digest,
    bytes: bytes.length,
    sourceCount: stored.sourceHashes.length,
    sourceClosureRevalidated: true,
    currentDerivationMatches: true,
    zeroEdgeArglist: nativeArglist.values,
    inspectedFunctions: stored.nativeRuns[0].metadataSummary.targetNames,
  };
}

function validateSummary(summary, config, instrumented, setupBaseline) {
  expectKeys(summary, [
    'runId', 'mode', 'smallImage', 'preSceneProbeSha256', 'probeOutputNames',
    'preSceneProbePauseSeconds', 'complete', 'startedAt', 'finishedAt',
    'installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'aa0Sha256', 'sceneReportSha256',
  ], `${config.runId} runner summary`);
  assert(summary.complete === true && summary.runId === config.runId && summary.mode === config.mode
    && summary.smallImage === false && summary.preSceneProbePauseSeconds === 0,
  `${config.runId} summary is incomplete or has a wrong mode/image/pause setting`);
  assert(typeof summary.startedAt === 'string' && Number.isFinite(Date.parse(summary.startedAt))
    && typeof summary.finishedAt === 'string' && Number.isFinite(Date.parse(summary.finishedAt)),
  `${config.runId} summary timestamps are invalid`);
  const expectedNames = instrumented ? EXPECTED_OUTPUT_NAMES : [];
  assert(Array.isArray(summary.probeOutputNames) && same(summary.probeOutputNames, expectedNames),
    `${config.runId} summary probe-output declaration differs`);
  if (instrumented) {
    assert(hashField(summary.preSceneProbeSha256, `${config.runId} summary probe hash`) === EXPECTED_PROBE_SHA256,
      `${config.runId} summary does not bind frozen v4`);
  } else {
    assert(summary.preSceneProbeSha256 === null, `${config.runId} control has probe hash metadata`);
  }
  const setup = {
    installerSha256: hashField(summary.installerSha256, `${config.runId} installer SHA-256`),
    registryPatchSha256: hashField(summary.registryPatchSha256, `${config.runId} registry patch SHA-256`),
    licensePatchSha256: hashField(summary.licensePatchSha256, `${config.runId} license patch SHA-256`),
  };
  assert(setup.installerSha256 === setupBaseline.installerSha256,
    `${config.runId} installer does not match the current extracted setup`);
  return setup;
}

function readCoreCapture(root, config, summary, setupBaseline, runSetup) {
  const aa0 = trackedRead(resolve(root, 'capture/aa0'), `${config.runId} AA0 image`);
  const scene = trackedRead(resolve(root, 'capture/aaron-scene-state-snapshot.txt'), `${config.runId} raw scene report`);
  const sceneJsonBytes = trackedRead(resolve(root, 'scene-state.json'), `${config.runId} parsed scene-state JSON`);
  const sceneJson = parseJson(sceneJsonBytes, `${config.runId} parsed scene-state JSON`);
  const image = trackedRead(resolve(root, 'capture/image'), `${config.runId} original image`);
  const imageId = trackedRead(resolve(root, 'capture/image-id'), `${config.runId} original image ID`);
  const executable = trackedRead(resolve(root, 'runtime/AARON.exe'), `${config.runId} runtime executable`);
  const pll = trackedRead(resolve(root, 'runtime/AARON.pll'), `${config.runId} runtime PLL`);
  assert(aa0.length > 0 && scene.length > 0 && image.length > 0 && imageId.length > 0
    && executable.length > 0 && pll.length > 0,
  `${config.runId} has an empty required drawing/setup artifact`);
  const runtimeFiles = setupBaseline.applicationFiles.map(file => {
    const original = trackedRead(resolve('research/extracted/aaron/application', file.name),
      `current original ${file.name}`);
    const bytes = trackedRead(resolve(root, 'runtime', file.name), `${config.runId} runtime ${file.name}`);
    const patched = ['registry.dll', 'license.dll'].includes(file.name.toLowerCase());
    if (patched) assert(!bytes.equals(original), `${config.runId} expected ${file.name} to be patched`);
    else assert(bytes.equals(original), `${config.runId} runtime ${file.name} differs from extracted original`);
    return { name: file.name, bytes, sha256: sha(bytes), originalSha256: sha(original), patched };
  });
  for (const runtimeName of ['AARON.exe', 'AARON.pll']) {
    const runtimeRow = runtimeFiles.find(row => row.name.toLowerCase() === runtimeName.toLowerCase());
    assert(runtimeRow && runtimeRow.bytes.equals(runtimeName === 'AARON.exe' ? executable : pll),
      `${config.runId} runtime ${runtimeName} does not match its captured image`);
  }
  const registry = runtimeFiles.find(row => row.name.toLowerCase() === 'registry.dll');
  const license = runtimeFiles.find(row => row.name.toLowerCase() === 'license.dll');
  assert(registry && license && registry.sha256 === runSetup.registryPatchSha256
    && license.sha256 === runSetup.licensePatchSha256,
  `${config.runId} summary patch hashes do not bind patched runtime DLLs`);
  const aa0Sha256 = sha(aa0);
  const sceneSha256 = sha(scene);
  assert(aa0Sha256 === hashField(summary.aa0Sha256, `${config.runId} AA0 summary hash`)
    && sceneSha256 === hashField(summary.sceneReportSha256, `${config.runId} scene summary hash`),
  `${config.runId} summary does not bind exact AA0 and raw scene report bytes`);
  assert(sceneJson.schemaVersion === 1 && sceneJson.source?.localRunId === config.runId
    && hashField(sceneJson.source?.sha256, `${config.runId} parsed-scene input hash`) === sceneSha256,
  `${config.runId} parsed scene JSON is not bound to its raw scene report`);
  return {
    aa0, scene, image, imageId, executable, pll, runtimeFiles,
    aa0Sha256, aa0Bytes: aa0.length,
    sceneSha256, sceneBytes: scene.length,
    sceneJsonSha256: sha(sceneJsonBytes), sceneJsonBytes: sceneJsonBytes.length,
    imageSha256: sha(image), imageBytes: image.length,
    imageIdSha256: sha(imageId), imageIdBytes: imageId.length,
    executableSha256: sha(executable), executableBytes: executable.length,
    pllSha256: sha(pll), pllBytes: pll.length,
  };
}

function portableCoreCapture(core) {
  const { aa0, scene, image, imageId, executable, pll, runtimeFiles, ...summary } = core;
  return {
    ...summary,
    runtimeFiles: runtimeFiles.map(({ bytes, ...file }) => ({ ...file, bytes: bytes.length })),
  };
}

function sourceSpecsForMode(config) {
  const specs = new Map(COMMON_LISP_SOURCES);
  specs.set(config.loadedSceneSource, `research/introspection/${config.loadedSceneSource}`);
  return [...specs.entries()];
}

function readLoadedSourceBindings(root, config, { loader = false } = {}) {
  const loadedSources = sourceSpecsForMode(config).map(([filename, sourcePath]) => {
    const current = trackedRead(sourcePath, `${config.runId} current Lisp ${filename}`);
    const stagedPath = resolve(root, 'capture', filename);
    const staged = trackedRead(stagedPath, `${config.runId} staged Lisp ${filename}`);
    assert(current.equals(staged), `${config.runId} staged source differs from current source: ${filename}`);
    return {
      filename,
      sourcePath,
      stagedPath: portable(relative(PROJECT_ROOT, stagedPath)),
      sha256: sha(current),
      stagedSha256: sha(staged),
      bytes: current.length,
      byteIdentical: true,
    };
  });
  const runtimeInit = {};
  const runtimeInitBytes = {};
  for (const filename of ['.clinit.cl', 'clinit.cl']) {
    const bytes = trackedRead(resolve(root, 'runtime', filename), `${config.runId} ${filename}`);
    runtimeInitBytes[filename] = bytes;
    runtimeInit[filename] = { sha256: sha(bytes), bytes: bytes.length };
  }
  const modeBytes = trackedRead(resolve(root, 'capture', config.loadedSceneSource),
    `${config.runId} selected scene mode source`);
  let runtimeLoaderSha256 = null;
  let startupRoute;
  if (loader) {
    const loaderBytes = trackedRead(resolve(root, 'capture/aaron-probe-loader.cl'),
      `${config.runId} staged probe loader`);
    const runtimeLoader = trackedRead(resolve(root, 'runtime/aaron-probe-loader.cl'),
      `${config.runId} runtime probe loader`);
    const expectedLoader = Buffer.from(
      `(set 'aaron-pre-scene-probe-pause-seconds 0)\r\n(load "C:\\\\temp\\\\aaron-pre-scene-probe.cl")\r\n(load "C:\\\\temp\\\\${config.loadedSceneSource}")\r\n`,
      'utf8',
    );
    assert(loaderBytes.equals(runtimeLoader) && loaderBytes.equals(expectedLoader),
      `${config.runId} probe loader bytes differ from expected v4 routing`);
    assert(runtimeInitBytes['.clinit.cl'].equals(runtimeLoader)
      && runtimeInitBytes['clinit.cl'].equals(runtimeLoader),
    `${config.runId} Lisp init files do not match the staged v4 loader`);
    runtimeLoaderSha256 = sha(runtimeLoader);
    startupRoute = {
      kind: 'probe-loader-then-mode-source',
      modeSource: config.loadedSceneSource,
      modeSourceSha256: sha(modeBytes),
      loaderSha256: runtimeLoaderSha256,
    };
  } else {
    assert(runtimeInitBytes['.clinit.cl'].equals(modeBytes)
      && runtimeInitBytes['clinit.cl'].equals(modeBytes),
    `${config.runId} control Lisp init files do not match its direct mode source`);
    startupRoute = {
      kind: 'direct-mode-source',
      modeSource: config.loadedSceneSource,
      modeSourceSha256: sha(modeBytes),
    };
  }
  return { loadedSources, runtimeInit, runtimeLoaderSha256, startupRoute, runtimeRoutingValidated: true };
}

function readProbeRequest(root, config) {
  const requestBytes = trackedRead(resolve(root, 'pre-scene-probe-request.json'), `${config.runId} probe request`);
  const request = parseJson(requestBytes, `${config.runId} probe request`);
  expectKeys(request, [
    'schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256', 'pauseSeconds', 'releaseFile', 'probeOutputNames',
  ], `${config.runId} probe request`);
  assert(request.schemaVersion === 1 && request.runId === config.runId && request.pauseSeconds === 0
    && request.releaseFile === RELEASE_FILE,
  `${config.runId} probe request identity, pause, or release-file policy differs`);
  assert(same(request.probeOutputNames, EXPECTED_OUTPUT_NAMES),
    `${config.runId} probe request output names differ`);
  const currentProbe = trackedRead(PROBE_PATH, 'current frozen v4 probe');
  const stagedProbe = trackedRead(resolve(root, 'capture/aaron-pre-scene-probe.cl'),
    `${config.runId} staged v4 probe`);
  const probeHash = hashField(request.probeSha256, `${config.runId} request probe hash`);
  assert(sha(currentProbe) === EXPECTED_PROBE_SHA256 && probeHash === EXPECTED_PROBE_SHA256
    && stagedProbe.equals(currentProbe),
  `${config.runId} current/staged/request probe hashes do not bind frozen v4`);
  const runtimeExecutable = resolve(root, 'runtime/AARON.exe');
  assert(typeof request.runtimeExecutable === 'string'
    && resolve(request.runtimeExecutable).toLowerCase() === runtimeExecutable.toLowerCase(),
  `${config.runId} request runtime executable is not owned by the capture root`);
  return {
    requestSha256: sha(requestBytes),
    probeSha256: EXPECTED_PROBE_SHA256,
    probeBytes: currentProbe.length,
    stagedProbeSha256: sha(stagedProbe),
    request,
  };
}

function readInstrumented(setupBaseline) {
  const root = resolve(RUN.root);
  assert(within(resolve(LOCAL_ORACLE_ROOT), root) && basename(root) === RUN.runId,
    'Instrumented capture root is not the named owned local-oracle root');
  const summaryBytes = trackedRead(resolve(root, 'summary.json'), `${RUN.runId} summary`);
  const summary = parseJson(summaryBytes, `${RUN.runId} summary`);
  const setup = validateSummary(summary, RUN, true, setupBaseline);
  const request = readProbeRequest(root, RUN);
  assert(hashField(summary.preSceneProbeSha256, `${RUN.runId} summary probe hash`) === request.probeSha256,
    `${RUN.runId} summary does not agree with its probe request`);
  const core = readCoreCapture(root, RUN, summary, setupBaseline, setup);
  const loadedSourceBindings = readLoadedSourceBindings(root, RUN, { loader: true });
  const report = trackedRead(resolve(root, 'capture', RUN.outputName), `${RUN.runId} v4 contract report`);
  assert(sha(report) === EXPECTED_REPORT_SHA256,
    `${RUN.runId} report hash differs from the root-reviewed completed v4 capture`);
  const reportText = report.toString('utf8');
  assert(Buffer.from(reportText, 'utf8').equals(report), `${RUN.runId} report is not UTF-8`);
  const parsedReport = parseZeroEdgeContractReport(reportText);
  const stagedProbe = trackedRead(resolve(root, 'capture/aaron-pre-scene-probe.cl'), `${RUN.runId} staged v4 probe`);
  return {
    runId: RUN.runId,
    root: portable(relative(PROJECT_ROOT, root)),
    mode: summary.mode,
    smallImage: summary.smallImage,
    summarySha256: sha(summaryBytes),
    setup,
    request: request.request,
    requestSha256: request.requestSha256,
    probe: { path: PROBE_PATH, sha256: request.probeSha256,
      stagedSha256: sha(stagedProbe), bytes: stagedProbe.length, outputName: RUN.outputName,
      pauseSeconds: 0, smallImage: false },
    loadedSourceBindings,
    capture: core,
    report: {
      path: portable(relative(PROJECT_ROOT, resolve(root, 'capture', RUN.outputName))),
      sha256: sha(report),
      bytes: report.length,
      lineCount: parsedReport.lineCount,
      parsed: parsedReport,
    },
  };
}

function sourceProjection(bindings) {
  return bindings.map(({ filename, sourcePath, sha256, stagedSha256, bytes, byteIdentical }) =>
    ({ filename, sourcePath, sha256, stagedSha256, bytes, byteIdentical }));
}

function readControl(instrumented, setupBaseline) {
  const root = resolve(CONTROL.root);
  assert(within(resolve(LOCAL_ORACLE_ROOT), root) && basename(root) === CONTROL.runId,
    'Control root is not the named owned local-oracle root');
  const summaryBytes = trackedRead(resolve(root, 'summary.json'), `${CONTROL.runId} summary`);
  const summary = parseJson(summaryBytes, `${CONTROL.runId} summary`);
  const setup = validateSummary(summary, CONTROL, false, setupBaseline);
  const core = readCoreCapture(root, CONTROL, summary, setupBaseline, setup);
  const loadedSourceBindings = readLoadedSourceBindings(root, CONTROL, { loader: false });
  for (const rel of [
    'pre-scene-probe-request.json',
    'capture/aaron-pre-scene-probe.cl',
    `capture/${RUN.outputName}`,
    'capture/aaron-probe-loader.cl',
    'runtime/aaron-probe-loader.cl',
  ]) {
    assert(!existsSync(resolve(root, rel)), `${CONTROL.runId} control unexpectedly contains ${rel}`);
  }
  assert(same(setup, instrumented.setup), `${CONTROL.runId} setup patch hashes differ from instrumented run`);
  assert(same(sourceProjection(loadedSourceBindings.loadedSources),
    sourceProjection(instrumented.loadedSourceBindings.loadedSources)),
  'Control and instrumented run do not bind identical current/staged mode sources');
  assert(core.aa0.equals(instrumented.capture.aa0)
    && core.scene.equals(instrumented.capture.scene)
    && core.image.equals(instrumented.capture.image)
    && core.imageId.equals(instrumented.capture.imageId)
    && core.executable.equals(instrumented.capture.executable)
    && core.pll.equals(instrumented.capture.pll),
  'Control raw AA0, scene, image, image ID, executable, or PLL bytes differ');
  assert(core.runtimeFiles.length === instrumented.capture.runtimeFiles.length
    && core.runtimeFiles.every((file, index) => file.name === instrumented.capture.runtimeFiles[index].name
      && file.bytes.equals(instrumented.capture.runtimeFiles[index].bytes)),
  'Control runtime application file bytes differ from the instrumented run');
  return {
    runId: CONTROL.runId,
    root: portable(relative(PROJECT_ROOT, root)),
    mode: summary.mode,
    smallImage: summary.smallImage,
    summarySha256: sha(summaryBytes),
    setup,
    capture: core,
    loadedSourceBindings,
    startupRouteValidated: loadedSourceBindings.runtimeRoutingValidated,
    probeArtifactsAbsent: true,
    parity: {
      sameSetupHashes: true,
      loadedCurrentAndStagedModeSourcesByteIdentical: true,
      aa0ByteIdentical: true,
      rawSceneReportByteIdentical: true,
      originalImageByteIdentical: true,
      imageIdByteIdentical: true,
      runtimeExecutableByteIdentical: true,
      runtimePllByteIdentical: true,
      runtimeApplicationFilesByteIdentical: true,
      runtimeRoutingValidatedPerRun: true,
    },
  };
}

function qualifiedAtomRewrite(line) {
  let output = '';
  const symbols = new Map();
  let index = 0;
  let inString = false;
  let escaped = false;
  const atomChar = char => Boolean(char) && !/[\s()"]/.test(char);
  while (index < line.length) {
    const char = line[index];
    if (inString) {
      output += char;
      index += 1;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      index += 1;
      continue;
    }
    if (!atomChar(char)) {
      output += char;
      index += 1;
      continue;
    }
    const start = index;
    while (atomChar(line[index])) index += 1;
    const atom = line.slice(start, index);
    const match = /^([A-Za-z][A-Za-z0-9-]*)(::?)([A-Za-z][A-Za-z0-9*-]*)$/u.exec(atom);
    if (!match) {
      output += atom;
      continue;
    }
    const placeholder = `QUALIFIEDSYMBOL${symbols.size}`;
    symbols.set(placeholder, {
      kind: 'qualified-symbol',
      package: match[1].toUpperCase(),
      separator: match[2],
      name: match[3].toUpperCase(),
    });
    output += placeholder;
  }
  assert(!inString, 'Unclosed string in report record');
  return { line: output, symbols };
}

function restoreQualifiedSymbols(value, symbols) {
  if (Array.isArray(value)) return value.map(item => restoreQualifiedSymbols(item, symbols));
  if (value?.kind === 'symbol' && symbols.has(value.name)) return symbols.get(value.name);
  if (value && typeof value === 'object' && !Object.hasOwn(value, 'kind')) {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, restoreQualifiedSymbols(item, symbols)]));
  }
  return value;
}

function parseRecordLine(line, tag) {
  const rewritten = qualifiedAtomRewrite(line);
  return restoreQualifiedSymbols(parseLispRecord(rewritten.line, tag), rewritten.symbols);
}

function tagAndFields(line) {
  const match = /^([A-Z-]+)\s/u.exec(line);
  assert(match, `Malformed report record: ${line.slice(0, 80)}`);
  const tag = match[1];
  if (tag === 'HELPER') {
    assert(line === 'HELPER name=EXCL:ARGLIST present=T fbound=T type=COMPILED-FUNCTION compiled=T',
      'EXCL:ARGLIST helper line differs from the frozen completed report');
    return { tag, fields: { name: 'EXCL:ARGLIST', present: true, fbound: true,
      type: { kind: 'symbol', name: 'COMPILED-FUNCTION' }, compiled: true } };
  }
  if (tag === 'RNG-HELPER') {
    const expected = 'RNG-HELPER phase=:after-main fbound=#<Interpreted Function AARON-RANDOM-STATE-PREVIEW>';
    assert(line === expected,
      'RNG helper line differs from the exact Allegro FBOUNDP function-object printout');
    return { tag, fields: {
      phase: { kind: 'keyword', name: 'AFTER-MAIN' },
      fbound: { kind: 'observed-function-object', name: 'AARON-RANDOM-STATE-PREVIEW' },
    } };
  }
  if (tag === 'BEGIN' || tag === 'END' || tag === 'SCOPE' || tag === 'LIMITS') {
    return { tag, raw: line, fields: null };
  }
  return { tag, fields: parseRecordLine(line, tag) };
}

function recordsByTag(records, tag) { return records.filter(record => record.tag === tag); }
function onlyRecord(records, tag) {
  const rows = recordsByTag(records, tag);
  assert(rows.length === 1, `Expected exactly one ${tag} record; got ${rows.length}`);
  return rows[0];
}
function symbolName(value, label) {
  assert(value?.kind === 'symbol', `${label} is not a Lisp symbol`);
  return value.name;
}
function keywordName(value, label) {
  assert(value?.kind === 'keyword', `${label} is not a Lisp keyword`);
  return value.name;
}
function fieldName(fields, label) {
  const value = fields?.name;
  if (typeof value === 'string') return value;
  if (value?.kind === 'string' || value?.kind === 'symbol') return value.value ?? value.name;
  throw new Error(`${label} name is not a Lisp string or symbol`);
}
function expectBoolean(value, expected, label) {
  let actual;
  if (value === true || value === null) actual = value === true;
  else if (value?.kind === 'symbol' && value.name === 'T') actual = true;
  else if (value?.kind === 'symbol' && value.name === 'NIL') actual = false;
  else throw new Error(`${label} is not a bare T/NIL value`);
  assert(actual === expected, `${label} is not ${expected ? 'T' : 'NIL'}`);
}
function expectInteger(value, expected, label) {
  assert(value?.kind === 'number' && /^[-+]?\d+$/u.test(value.raw) && value.value === expected,
    `${label} is not integer ${expected}`);
}
function descriptorValue(value, label) {
  assert(Array.isArray(value) && value.length === 3 && keywordName(value[0], `${label} tag`) === 'NUMBER',
    `${label} is not a numeric value summary`);
  const type = symbolName(value[1], `${label} type`);
  assert(value[2]?.kind === 'number' && Number.isFinite(value[2].value), `${label} value is not finite numeric`);
  return { type, value: value[2].value, raw: value[2].raw };
}

function parseAxisList(value, expected, label) {
  assert(Array.isArray(value) && value.length === 10 && keywordName(value[0], `${label} tag`) === 'LIST',
    `${label} summary is not a bounded list summary`);
  assert(Array.isArray(value[1]) && value[1].length === expected.length,
    `${label} list length differs from the expected captured value`);
  const values = value[1].map((row, index) => {
    const descriptor = descriptorValue(row, `${label}[${index}]`);
    assert(descriptor.type === 'FIXNUM' && descriptor.value === expected[index],
      `${label}[${index}] differs from expected FIXNUM ${expected[index]}`);
    return descriptor.value;
  });
  assert(keywordName(value[2], `${label} count key`) === 'COUNT'
    && value[3]?.kind === 'number' && value[3].value === expected.length,
  `${label} bounded summary count differs`);
  assert(keywordName(value[4], `${label} proper key`) === 'PROPER', `${label} proper key differs`);
  expectBoolean(value[5], true, `${label} proper list`);
  assert(keywordName(value[6], `${label} truncated key`) === 'TRUNCATED', `${label} truncated key differs`);
  expectBoolean(value[7], false, `${label} truncation flag`);
  assert(keywordName(value[8], `${label} tail key`) === 'TAIL'
    && keywordName(value[9], `${label} tail value`) === 'NONE',
  `${label} summary does not have a NIL tail`);
  return values;
}

function parseOneTypedValue(value, expectedType, expectedNumber, label) {
  assert(Array.isArray(value) && value.length === 1, `${label} must return exactly one typed value`);
  const row = value[0];
  assert(Array.isArray(row) && row.length === 4 && keywordName(row[0], `${label} descriptor`) === 'TYPE'
    && symbolName(row[1], `${label} type`) === expectedType
    && keywordName(row[2], `${label} value key`) === 'VALUE',
  `${label} typed return descriptor differs`);
  const number = descriptorValue(row[3], `${label} numeric value`);
  assert(number.type === expectedType && number.value === expectedNumber,
    `${label} did not return FIXNUM ${expectedNumber}`);
  return { type: expectedType, value: number.value };
}

function parsePreview(value, label) {
  const names = ['RANDOM-100-1', 'RANDOM-100-2', 'RANDOM-100-3'];
  assert(Array.isArray(value) && value.length === 6, `${label} is not a three-draw preview`);
  const draws = names.map((name, index) => {
    assert(keywordName(value[index * 2], `${label} draw ${index + 1} label`) === name,
      `${label} draw labels differ`);
    const number = value[index * 2 + 1];
    assert(number?.kind === 'number' && /^\d+$/u.test(number.raw)
      && number.value >= 0 && number.value < 100,
    `${label} draw ${index + 1} is outside [0,100)`);
    return number.value;
  });
  return draws;
}

function decodeArglist(value, label) {
  assert(Array.isArray(value) && value.length === 2,
    `${label} arglist metadata must have one return convention marker`);
  expectBoolean(value[1], true, `${label} arglist return marker`);
  const params = value[0];
  if (params === null) return { parameters: [], returnMarker: true };
  assert(Array.isArray(params), `${label} parameters are not a list`);
  const names = params.map((parameter, index) => {
    assert(parameter?.kind === 'qualified-symbol' && parameter.package === 'COMMON-GRAPHICS-USER'
      && parameter.separator === '::', `${label} parameter ${index} is not an internal CGU symbol`);
    return parameter.name;
  });
  return { parameters: names, returnMarker: true };
}

function validateReportRecords(source) {
  const lines = source.replace(/\r\n/gu, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  assert(lines.every(line => line.length > 0), 'Report has blank or malformed framing lines');
  const records = lines.map(tagAndFields);
  const actualCounts = Object.fromEntries([...new Set(records.map(row => row.tag))]
    .map(tag => [tag, recordsByTag(records, tag).length]));
  assert(same(actualCounts, EXPECTED_TAG_COUNTS),
    `Report record counts differ: ${JSON.stringify(actualCounts)}`);
  assert(records[0].tag === 'BEGIN' && records[0].raw === 'BEGIN zero-edge-contract v4'
    && records.at(-1).tag === 'END' && records.at(-1).raw === 'END zero-edge-contract v4',
  'Report BEGIN/END framing is incomplete or version-mismatched');
  assert(onlyRecord(records, 'SCOPE').raw === 'SCOPE zero-edge-called=nil zero-edge-wrapped=nil constructor-sample=single-gated-after-main main-values=preserved main-errors=propagated state-restoration=none',
    'Report scope declaration differs from frozen v4');
  assert(onlyRecord(records, 'LIMITS').raw === 'LIMITS value-nodes=256 list-items=64 array-items=64 depth=4 string-prefix=256 condition-control-prefix=256 state-bindings=3',
    'Report summary limits differ from frozen v4');
  return { lines, records };
}

function validateReportSemantics(source) {
  const { lines, records } = validateReportRecords(source);
  const helper = onlyRecord(records, 'HELPER').fields;
  assert(helper.name === 'EXCL:ARGLIST' && helper.present === true && helper.fbound === true
    && symbolName(helper.type, 'ARGLIST helper type') === 'COMPILED-FUNCTION' && helper.compiled === true,
  'EXCL:ARGLIST helper is not present and compiled');

  const functionRows = recordsByTag(records, 'FUNCTION');
  const arglistRows = recordsByTag(records, 'ARGLIST');
  const arglists = Object.create(null);
  for (const name of EXPECTED_FUNCTIONS) {
    const functionRecord = functionRows.find(row => fieldName(row.fields, `${name} function`) === name);
    assert(functionRecord, `Report lacks function metadata for ${name}`);
    const functionFields = functionRecord.fields;
    expectBoolean(functionFields.present, true, `${name} present`);
    expectBoolean(functionFields.fbound, true, `${name} fbound`);
    expectBoolean(functionFields.compiled, true, `${name} compiled flag`);
    assert(keywordName(functionFields.status, `${name} status`) === 'INTERNAL', `${name} is not INTERNAL`);
    const expectedType = ['X', 'Y', 'Z'].includes(name) ? 'STANDARD-GENERIC-FUNCTION' : 'COMPILED-FUNCTION';
    assert(symbolName(functionFields.type, `${name} function type`) === expectedType,
      `${name} function object type differs from the reviewed observation`);
    const arglistRecord = arglistRows.find(row => fieldName(row.fields, `${name} arglist`) === name);
    assert(arglistRecord, `Report lacks arglist for ${name}`);
    arglists[name] = decodeArglist(arglistRecord.fields.values, `${name}`);
  }
  assert(same(arglists['ZERO-EDGE'], { parameters: ['START', 'PERIM'], returnMarker: true }),
    'ZERO-EDGE runtime arglist is not the exact positional START/PERIM arglist');
  assert(same(arglists['MAKE-TRIPT'], { parameters: ['X', 'Y', 'Z'], returnMarker: true }),
    'MAKE-TRIPT runtime arglist is not fixed positional X/Y/Z');
  assert(same(arglists.X, { parameters: ['TWOPT'], returnMarker: true })
    && same(arglists.Y, { parameters: ['TWOPT'], returnMarker: true })
    && same(arglists.Z, { parameters: ['TRIPT'], returnMarker: true }),
  'X/Y/Z generic getter arglists differ from the observed TWOPT/TRIPT parameter names');
  assert(same(arglists.MAIN, { parameters: [], returnMarker: true }), 'MAIN runtime arglist differs');

  const initialBindings = new Map();
  for (const row of recordsByTag(records, 'BINDING')) {
    const fields = row.fields;
    const name = fieldName(fields, 'initial binding');
    assert(['XINCS', 'YINCS', 'START'].includes(name) && !initialBindings.has(name),
      `Unexpected or duplicate initial binding ${String(name)}`);
    initialBindings.set(name, fields);
  }
  const expectedIncrements = { XINCS: [1, 1, 0, -1, -1, -1, 0, 1], YINCS: [0, 1, 1, 1, 0, -1, -1, -1] };
  for (const name of ['XINCS', 'YINCS']) {
    const fields = initialBindings.get(name);
    assert(fields && keywordName(fields.status, `${name} initial status`) === 'INTERNAL'
      && symbolName(fields.type, `${name} initial type`) === 'CONS',
    `${name} initial binding metadata differs`);
    expectBoolean(fields.present, true, `${name} initial presence`);
    expectBoolean(fields.bound, true, `${name} initial boundness`);
    parseAxisList(fields.value, expectedIncrements[name], `${name} initial value`);
  }
  const startBinding = initialBindings.get('START');
  assert(startBinding && keywordName(startBinding.status, 'START initial status') === 'INTERNAL'
    && !Object.hasOwn(startBinding, 'value'), 'START must be present but unbound before MAIN');
  expectBoolean(startBinding.present, true, 'START initial presence');
  expectBoolean(startBinding.bound, false, 'START initial boundness');

  const gate = onlyRecord(records, 'GATE').fields;
  for (const key of ['make-tript-fixed-positional-x-y-z', 'maker-compiled', 'accessors-fbound', 'errors-zero']) {
    expectBoolean(gate[key], true, `constructor gate ${key}`);
  }
  const mainGate = onlyRecord(records, 'MAIN-GATE').fields;
  expectBoolean(mainGate.present, true, 'MAIN present');
  expectBoolean(mainGate.fbound, true, 'MAIN fbound');
  assert(symbolName(mainGate['original-type'], 'MAIN original type') === 'COMPILED-FUNCTION',
    'MAIN original function type differs');
  const install = onlyRecord(records, 'INSTALL').fields;
  assert(fieldName(install, 'MAIN install') === 'MAIN'
    && symbolName(install['original-type'], 'installed MAIN original type') === 'COMPILED-FUNCTION',
    'MAIN wrapper installation does not preserve the original compiled function');
  const ready = onlyRecord(records, 'READY').fields;
  expectInteger(ready['metadata-errors'], 0, 'READY metadata error count');
  expectBoolean(ready['constructor-gate'], true, 'READY constructor gate');
  expectBoolean(ready['main-wrapper-installed'], true, 'READY main wrapper');
  const mainFinish = onlyRecord(records, 'MAIN-FINISH').fields;
  assert(keywordName(mainFinish.status, 'MAIN status') === 'NORMAL', 'MAIN did not finish normally');

  const randomHelper = onlyRecord(records, 'RNG-HELPER').fields;
  assert(keywordName(randomHelper.phase, 'RNG helper phase') === 'AFTER-MAIN'
    && randomHelper.fbound?.kind === 'observed-function-object'
    && randomHelper.fbound.name === 'AARON-RANDOM-STATE-PREVIEW',
  'Three-draw random preview helper did not report the expected bound function object');
  const previewRow = onlyRecord(records, 'RNG-PREVIEW').fields;
  assert(keywordName(previewRow.phase, 'initial random preview phase') === 'POST-MAIN-BEFORE-SAMPLE',
    'Initial random preview was not sampled after MAIN');
  expectBoolean(previewRow.valid, true, 'initial random preview valid');
  const preview = parsePreview(previewRow.preview, 'post-MAIN preview');

  const stateRows = recordsByTag(records, 'STATE-BINDING');
  const states = new Map();
  for (const row of stateRows) {
    const fields = row.fields;
    const phase = keywordName(fields.phase, 'binding state phase');
    const name = fieldName(fields, 'binding state');
    const key = `${phase}:${name}`;
    assert(['BEFORE-SAMPLE:START', 'BEFORE-SAMPLE:XINCS', 'BEFORE-SAMPLE:YINCS',
      'AFTER-SAMPLE:START', 'AFTER-SAMPLE:XINCS', 'AFTER-SAMPLE:YINCS'].includes(key)
      && !states.has(key), `Unexpected or duplicate binding state ${key}`);
    expectBoolean(fields.present, true, `${key} present`);
    assert(keywordName(fields.status, `${key} status`) === 'INTERNAL', `${key} status differs`);
    if (name === 'START') {
      expectBoolean(fields.bound, false, `${key} boundness`);
      assert(!Object.hasOwn(fields, 'value'), `${key} unexpectedly has a value`);
    } else {
      expectBoolean(fields.bound, true, `${key} boundness`);
      assert(symbolName(fields.type, `${key} type`) === 'CONS', `${key} type differs`);
      parseAxisList(fields.value, expectedIncrements[name], `${key} summary`);
    }
    states.set(key, fields);
  }

  const sampleInput = onlyRecord(records, 'SAMPLE-INPUT').fields;
  expectInteger(sampleInput.x, 17, 'sample x input');
  expectInteger(sampleInput.y, 23, 'sample y input');
  expectInteger(sampleInput.z, 6, 'sample z input');
  const rngChecks = recordsByTag(records, 'RNG-CHECK');
  const expectedRngPhases = [
    ':CONSTRUCTOR',
    '(:SLOT X :BEFORE-ACCESSORS)', '(:SLOT Y :BEFORE-ACCESSORS)', '(:SLOT Z :BEFORE-ACCESSORS)',
    '(:ACCESSOR X)', '(:ACCESSOR Y)', '(:ACCESSOR Z)',
    '(:SLOT X :AFTER-ACCESSORS)', '(:SLOT Y :AFTER-ACCESSORS)', '(:SLOT Z :AFTER-ACCESSORS)',
    ':POST-MAIN',
  ];
  const phaseKey = value => {
    if (value?.kind === 'keyword') return `:${value.name}`;
    assert(Array.isArray(value), 'RNG check phase is neither keyword nor descriptor list');
    return `(${value.map(item => item?.kind === 'keyword' ? `:${item.name}`
      : item?.kind === 'string' ? item.value.toUpperCase() : '?').join(' ')})`;
  };
  assert(rngChecks.length === expectedRngPhases.length, 'RNG preview check count is not eleven');
  for (const [index, row] of rngChecks.entries()) {
    const fields = row.fields;
    assert(phaseKey(fields.phase) === expectedRngPhases[index], `RNG check ${index + 1} phase differs`);
    expectBoolean(fields.valid, true, `RNG check ${index + 1} valid`);
    expectBoolean(fields.stable, true, `RNG check ${index + 1} stable`);
    assert(same(parsePreview(fields['preview-before'], `RNG check ${index + 1} before`), preview)
      && same(parsePreview(fields['preview-after'], `RNG check ${index + 1} after`), preview),
    `RNG check ${index + 1} preview differs from the post-MAIN preview`);
  }

  const sampleReturn = onlyRecord(records, 'SAMPLE-RETURN').fields;
  expectInteger(sampleReturn.arity, 1, 'constructor return arity');
  expectBoolean(sampleReturn['rng-preview-valid'], true, 'constructor preview valid');
  expectBoolean(sampleReturn['rng-preview-stable'], true, 'constructor preview stable');
  assert(Array.isArray(sampleReturn.values) && sampleReturn.values.length === 1,
    'MAKE-TRIPT did not return exactly one object');
  const objectDesc = sampleReturn.values[0];
  assert(Array.isArray(objectDesc) && objectDesc.length === 4
    && keywordName(objectDesc[0], 'constructor object descriptor tag') === 'TYPE'
    && symbolName(objectDesc[1], 'constructor object type') === 'TRIPT'
    && keywordName(objectDesc[2], 'constructor object descriptor value') === 'VALUE'
    && Array.isArray(objectDesc[3]) && keywordName(objectDesc[3][0], 'constructor object value tag') === 'OBJECT'
    && symbolName(objectDesc[3][1], 'constructor object value type') === 'TRIPT',
  'MAKE-TRIPT returned object is not reported as TRIPT');

  const slotRows = recordsByTag(records, 'SLOT-READ');
  const accessorRows = recordsByTag(records, 'ACCESSOR');
  const axisValues = { X: 17, Y: 23, Z: 6 };
  const slotObservations = Object.create(null);
  for (const axis of ['X', 'Y', 'Z']) {
    const beforeRow = slotRows.find(row => fieldName(row.fields, `${axis} slot`) === axis
      && keywordName(row.fields.phase, `${axis} slot phase`) === 'BEFORE-ACCESSORS');
    const afterRow = slotRows.find(row => fieldName(row.fields, `${axis} slot`) === axis
      && keywordName(row.fields.phase, `${axis} slot phase`) === 'AFTER-ACCESSORS');
    const accessorRow = accessorRows.find(row => fieldName(row.fields, `${axis} accessor`) === axis);
    assert(beforeRow && afterRow && accessorRow, `${axis} slot/getter observations are incomplete`);
    const beforeFields = beforeRow.fields;
    const afterFields = afterRow.fields;
    const getterFields = accessorRow.fields;
    for (const [label, fields] of [[`${axis} slot before`, beforeFields],
      [`${axis} getter`, getterFields], [`${axis} slot after`, afterFields]]) {
      expectInteger(fields.arity, 1, `${label} arity`);
      expectBoolean(fields['rng-preview-valid'], true, `${label} preview valid`);
      expectBoolean(fields['rng-preview-stable'], true, `${label} preview stable`);
    }
    const before = parseOneTypedValue(beforeFields.values, 'FIXNUM', axisValues[axis], `${axis} slot before`);
    const getter = parseOneTypedValue(getterFields.values, 'FIXNUM', axisValues[axis], `${axis} getter`);
    const after = parseOneTypedValue(afterFields.values, 'FIXNUM', axisValues[axis], `${axis} slot after`);
    slotObservations[axis.toLowerCase()] = { slotBefore: before, getter, slotAfter: after,
      matchesInput: true, getterMatchesSlot: true, slotUnchangedAcrossGetter: true };
  }
  const point = onlyRecord(records, 'SAMPLE-POINT').fields;
  assert(symbolName(point.type, 'sample point type') === 'TRIPT', 'Sample point type differs from TRIPT');
  const pointCoords = {};
  for (const axis of ['x', 'y', 'z']) {
    const descriptor = descriptorValue(point[axis], `sample point ${axis}`);
    const expected = axis === 'x' ? 17 : axis === 'y' ? 23 : 6;
    assert(descriptor.type === 'FIXNUM' && descriptor.value === expected,
      `Sample point ${axis} summary differs from constructor input`);
    pointCoords[axis] = { type: descriptor.type, value: descriptor.value };
  }
  for (const key of ['accessor-input-match', 'slot-before-input-match', 'accessor-slot-match', 'slots-after-getters-equal']) {
    expectBoolean(point[key], true, `sample point ${key}`);
  }

  const deltas = new Map();
  for (const row of recordsByTag(records, 'STATE-DELTA')) {
    const fields = row.fields;
    const name = fieldName(fields, 'state delta');
    assert(['START', 'XINCS', 'YINCS'].includes(name) && !deltas.has(name),
      `Unexpected or duplicate state delta ${String(name)}`);
    expectBoolean(fields['present-same'], true, `${name} symbol presence stability`);
    expectBoolean(fields['symbol-eq'], true, `${name} symbol identity stability`);
    const before = states.get(`BEFORE-SAMPLE:${name}`);
    const after = states.get(`AFTER-SAMPLE:${name}`);
    assert(before && after, `${name} state snapshots are incomplete`);
    expectBoolean(fields['bound-before'], name !== 'START', `${name} before boundness`);
    expectBoolean(fields['bound-after'], name !== 'START', `${name} after boundness`);
    if (name === 'START') {
      assert(fields['value-eq'] === null && fields['summary-equalp'] === null,
        'Unbound START value-eq/summary-equalp must remain NIL and non-comparable');
    } else {
      expectBoolean(fields['value-eq'], true, `${name} value identity`);
      expectBoolean(fields['summary-equalp'], true, `${name} bounded summary equality`);
    }
    deltas.set(name, fields);
  }
  const afterMainRng = onlyRecord(records, 'POST-SAMPLE-RNG').fields;
  expectBoolean(afterMainRng.valid, true, 'post-sample preview valid');
  expectBoolean(afterMainRng.stable, true, 'post-sample preview stable');
  const complete = onlyRecord(records, 'COMPLETE').fields;
  assert(keywordName(complete['main-status'], 'footer MAIN status') === 'NORMAL',
    'Footer MAIN status is not normal');
  expectBoolean(complete['main-wrapper-installed'], true, 'footer MAIN wrapper installed');
  expectBoolean(complete['sample-attempted'], true, 'footer sample attempted');
  expectBoolean(complete['sample-returned'], true, 'footer sample returned');
  expectBoolean(complete['sample-completed'], true, 'footer sample completed');
  expectInteger(complete['zero-edge-calls'], 0, 'probe-explicit ZERO-EDGE call count');
  expectInteger(complete['zero-edge-wrappers'], 0, 'probe ZERO-EDGE wrapper count');
  expectInteger(complete.errors, 0, 'footer error count');

  const nativeParsed = { arglists: {
    zeroEdge: '((COMMON-GRAPHICS-USER::START COMMON-GRAPHICS-USER::PERIM) T)',
  } };
  return {
    lineCount: lines.length,
    functions: Object.fromEntries(EXPECTED_FUNCTIONS.map(name => [name, {
      functionType: symbolName(functionRows.find(row => fieldName(row.fields, `${name} function`) === name).fields.type, `${name} type`),
      compiledFlag: true,
      arglist: arglists[name],
    }])),
    constructor: {
      constructor: 'MAKE-TRIPT',
      inputs: { x: 17, y: 23, z: 6 },
      resultType: 'TRIPT',
      coordinateOrderVerified: true,
      accessors: slotObservations,
      samplePoint: pointCoords,
      pointAssertions: { accessorInputMatch: true, slotBeforeInputMatch: true,
        accessorSlotMatch: true, slotsAfterGettersEqual: true },
    },
    bindings: {
      START: {
        present: true, symbolIdentitySame: true,
        boundBefore: false, boundAfter: false, boundnessUnchanged: true,
        valueIdentityComparable: false, summaryEqualityComparable: false,
        valueEqReportedNil: true, summaryEqualpReportedNil: true,
      },
      XINCS: {
        present: true, type: 'CONS', initialAndBefore: expectedIncrements.XINCS,
        after: expectedIncrements.XINCS, symbolIdentitySame: true,
        valueIdentitySame: true, boundedSummaryEqual: true,
        summaryProper: true, summaryTruncated: false,
      },
      YINCS: {
        present: true, type: 'CONS', initialAndBefore: expectedIncrements.YINCS,
        after: expectedIncrements.YINCS, symbolIdentitySame: true,
        valueIdentitySame: true, boundedSummaryEqual: true,
        summaryProper: true, summaryTruncated: false,
      },
    },
    randomPreview: {
      helper: 'AARON-RANDOM-STATE-PREVIEW',
      helperFboundValue: 'Interpreted Function object observed by FBOUNDP',
      helperLine: 'RNG-HELPER phase=:after-main fbound=#<Interpreted Function AARON-RANDOM-STATE-PREVIEW>',
      phase: 'post-MAIN-before-sample',
      values: preview,
      checks: rngChecks.length,
      allChecksValidAndStable: true,
      scope: 'Three preview draws only; no full random-state claim.',
    },
    nativeStaticArglist: {
      zeroEdge: nativeParsed.arglists.zeroEdge,
      matchesRuntimeMetadata: true,
      perimDomainResolved: false,
    },
    probeScope: {
      zeroEdgeCalledByProbe: false,
      zeroEdgeWrappedByProbe: false,
      footerProbeCalls: 0,
      footerProbeWrappers: 0,
      footerCallsAreNaturalSceneCensus: false,
      mainValuesPreserved: true,
      mainErrorsPropagated: true,
      mainCompletedNormally: true,
    },
    errors: 0,
    recordCounts: EXPECTED_TAG_COUNTS,
  };
}

export function parseZeroEdgeContractReport(source) {
  assert(typeof source === 'string', 'ZERO-EDGE report input must be text');
  const bytes = Buffer.from(source, 'utf8');
  assert(sha(bytes) === EXPECTED_REPORT_SHA256,
    'ZERO-EDGE v4 report does not match the root-reviewed completed capture hash');
  const parsed = validateReportSemantics(source);
  return { ...parsed, sha256: sha(bytes), bytes: bytes.length };
}

export function deriveZeroEdgeContractEvidence() {
  trackedSources.clear();
  trackedRead(fileURLToPath(import.meta.url), 'zero-edge contract evidence helper source');
  for (const path of SUPPORT_SOURCES) trackedRead(path, `support source ${path}`);
  const nativeBaseline = readNativeBaseline();
  const setupBaseline = readSetupBaseline();
  const instrumented = readInstrumented(setupBaseline);
  const control = readControl(instrumented, setupBaseline);
  const sourceHashes = revalidateTrackedSources();
  const portableInstrumented = { ...instrumented, capture: portableCoreCapture(instrumented.capture) };
  const portableControl = { ...control, capture: portableCoreCapture(control.capture) };
  return {
    schemaVersion: 1,
    kind: 'zero-edge-contract-capture-evidence',
    setup: {
      manifestSha256: setupBaseline.manifestSha256,
      installerSha256: setupBaseline.installerSha256,
      msiSha256: setupBaseline.msiSha256,
      msiBytes: setupBaseline.msiBytes,
      applicationFiles: setupBaseline.applicationFiles,
    },
    nativeBaseline,
    probe: {
      path: PROBE_PATH,
      sha256: EXPECTED_PROBE_SHA256,
      outputName: RUN.outputName,
      pauseSeconds: 0,
      smallImage: false,
      mode: RUN.mode,
    },
    instrumented: portableInstrumented,
    control: portableControl,
    controlParity: control.parity,
    limitations: [
      'The probe inspects ZERO-EDGE metadata but never calls or replaces ZERO-EDGE. Footer zero-edge-calls=0 counts only explicit calls made by this probe and is not a natural scene call census.',
      'Static ZERO-EDGE arglist metadata names START and PERIM. This capture does not resolve PERIM domain, establish a caller, or characterize ZERO-EDGE behavior.',
      'MAKE-TRIPT evidence is one gated post-MAIN sample at (17, 23, 6), followed by X/Y/Z getters and direct slot reads for that returned TRIPT only.',
      'Binding evidence covers symbol identity, presence/boundness, value identity, and the probe bounded summaries. Unbound START value-eq/summary-equalp NIL values are non-comparable; arbitrary objects are not fully deep-compared.',
      'Random-state evidence is limited to three preview draws around the listed observations and does not prove full random-state purity.',
      'Scene parity compares actual AA0, raw scene report, original image and ID, runtime executable/PLL, and application runtime bytes against the fresh direct-mode control.',
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: node research/tools/derive-zero-edge-contract-evidence.mjs [--output <fresh-ignored-json-under-seed1234-g>]\n');
    return;
  }
  const outputPath = resolve(args.output ?? DEFAULT_OUTPUT);
  const allowedOutputRoot = resolve(OUTPUT_ROOT);
  assert(within(allowedOutputRoot, outputPath),
    'Derived evidence output must be under the owned seed-1234-g root');
  assert(!existsSync(outputPath), 'Derived evidence output must be fresh; refusing to overwrite');
  assertIgnored(outputPath, 'Derived evidence output');
  const evidence = deriveZeroEdgeContractEvidence();
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(outputPath, bytes, { flag: 'wx' });
  process.stdout.write(JSON.stringify({
    outputPath: portable(relative(PROJECT_ROOT, outputPath)),
    outputSha256: sha(bytes),
    instrumented: { runId: evidence.instrumented.runId,
      reportSha256: evidence.instrumented.report.sha256,
      lineCount: evidence.instrumented.report.lineCount,
      errors: evidence.instrumented.report.parsed.errors,
      sample: evidence.instrumented.report.parsed.constructor.inputs },
    control: { runId: evidence.control.runId, parity: evidence.control.parity },
    nativeBaseline: evidence.nativeBaseline,
    sourceCount: evidence.sourceHashes.length,
  }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
