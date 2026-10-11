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
const PROBE_PATH = 'research/introspection/zero-edge-traversal-single-v3.cl';
const EXPECTED_PROBE_SHA256 = '0f1fde96c9b76d902e9cd47ceb5f099c2bc5ac935e94b514639c6918ad810802';
const EXPECTED_REPORT_SHA256 = 'f992fd22bb7240b2ef309f8f30467b4143e161bc14978fadf85d9e85e98e323f';
const EXPECTED_CASE_RESULT = Object.freeze({
  outcome: 'returned',
  targetConditionType: null,
  returnArity: 1,
});
const NATIVE_EVIDENCE_PATH = 'research/introspection/evidence/brush-buffer-predicate-native-20261006.json';
const EXPECTED_NATIVE_EVIDENCE_SHA256 = 'd6ffe3fa63958b79ea14199c098f121f3d4d3ce94d68cc3aa010ac750f28f0f4';
const RUN = Object.freeze({
  root: `${LOCAL_ORACLE_ROOT}/zero-edge-single-v3-seed1234-20261011-e`,
  runId: 'zero-edge-single-v3-seed1234-20261011-e',
  mode: 'writer-stream-seed-1234',
  outputName: 'aaron-zero-edge-traversal-single-v3.txt',
  loadedSceneSource: 'scene-state-snapshot-writer-stream-seeded-1234.cl',
});
const CONTROL = Object.freeze({
  root: `${LOCAL_ORACLE_ROOT}/zero-edge-single-control-seed1234-20261011-b`,
  runId: 'zero-edge-single-control-seed1234-20261011-b',
  mode: 'writer-stream-seed-1234',
  loadedSceneSource: RUN.loadedSceneSource,
});
const CONTROL_REPEAT = Object.freeze({
  root: `${LOCAL_ORACLE_ROOT}/zero-edge-single-control-repeat-seed1234-20261011-c`,
  runId: 'zero-edge-single-control-repeat-seed1234-20261011-c',
  mode: 'writer-stream-seed-1234',
  loadedSceneSource: RUN.loadedSceneSource,
});
const OUTPUT_ROOT = RUN.root;
const DEFAULT_OUTPUT = `${OUTPUT_ROOT}/zero-edge-traversal-single-v3-derived-evidence-20261011.json`;
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
const EXPECTED_DIRECTION_LISTS = Object.freeze({
  XINCS: [1, 1, 0, -1, -1, -1, 0, 1],
  YINCS: [0, 1, 1, 1, 0, -1, -1, -1],
});
const EXPECTED_STATE_NAMES = ['START', 'XINCS', 'YINCS', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*'];
const EXPECTED_STATE_PHASES = [
  'AFTER-MAIN-BEFORE-CASE', 'AFTER-CONSTRUCTOR', 'INSIDE-PROGV-BEFORE',
  'INSIDE-PROGV-AFTER', 'AFTER-PROGV',
];
const EXPECTED_OPAQUE_RNG_HELPER_LINE =
  'RNG-HELPER phase=:after-main fbound=#<Interpreted Function AARON-RANDOM-STATE-PREVIEW>';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = path => path.replaceAll('\\', '/');
const parseJson = (bytes, label) => {
  const encoding = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8';
  const text = bytes.toString(encoding);
  assert(Buffer.from(text, encoding).equals(bytes), `${label} is not round-trip ${encoding.toUpperCase()}`);
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

function requireFrozenExpectations() {
  hashField(EXPECTED_PROBE_SHA256, 'frozen traversal probe hash');
  assert(typeof EXPECTED_REPORT_SHA256 === 'string',
    'Accepted traversal report hash is pending the accepted capture');
  hashField(EXPECTED_REPORT_SHA256, 'accepted traversal report hash');
  assert(EXPECTED_CASE_RESULT && typeof EXPECTED_CASE_RESULT === 'object',
    'Expected single-call result is pending the accepted capture');
  if (EXPECTED_CASE_RESULT.outcome === 'returned') {
    assert(EXPECTED_CASE_RESULT.targetConditionType === null
      && Number.isSafeInteger(EXPECTED_CASE_RESULT.returnArity) && EXPECTED_CASE_RESULT.returnArity >= 0,
    'Expected returned-call result must bind a nonnegative arity and no target condition');
  } else if (EXPECTED_CASE_RESULT.outcome === 'target-error') {
    assert(typeof EXPECTED_CASE_RESULT.targetConditionType === 'string'
      && EXPECTED_CASE_RESULT.targetConditionType.length > 0 && EXPECTED_CASE_RESULT.returnArity === null,
    'Expected target-error result must bind its condition type and no return arity');
  } else throw new Error('Expected single-call result is pending the accepted capture');
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
    && Array.isArray(manifest.files) && manifest.files.length === EXPECTED_APPLICATION_FILES.length,
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
  assert(digest === EXPECTED_NATIVE_EVIDENCE_SHA256, `Pinned native evidence hash changed: ${digest}`);
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
      `${config.runId} summary does not bind frozen traversal probe`);
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
  return [...new Map(COMMON_LISP_SOURCES).entries()];
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
      `${config.runId} probe loader bytes differ from expected traversal-probe routing`);
    assert(runtimeInitBytes['.clinit.cl'].equals(runtimeLoader)
      && runtimeInitBytes['clinit.cl'].equals(runtimeLoader),
    `${config.runId} Lisp init files do not match the staged probe loader`);
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
  const currentProbe = trackedRead(PROBE_PATH, 'current frozen traversal probe');
  const stagedProbe = trackedRead(resolve(root, 'capture/aaron-pre-scene-probe.cl'),
    `${config.runId} staged traversal probe`);
  const probeHash = hashField(request.probeSha256, `${config.runId} request probe hash`);
  assert(sha(currentProbe) === EXPECTED_PROBE_SHA256 && probeHash === EXPECTED_PROBE_SHA256
    && stagedProbe.equals(currentProbe),
  `${config.runId} current/staged/request probe hashes do not bind the frozen traversal probe`);
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

function sourceProjection(bindings) {
  return bindings.map(({ filename, sourcePath, sha256, stagedSha256, bytes, byteIdentical }) =>
    ({ filename, sourcePath, sha256, stagedSha256, bytes, byteIdentical }));
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
  const report = trackedRead(resolve(root, 'capture', RUN.outputName), `${RUN.runId} traversal report`);
  assert(sha(report) === EXPECTED_REPORT_SHA256,
    `${RUN.runId} report hash differs from the accepted root-owned capture`);
  const reportText = report.toString('utf8');
  assert(Buffer.from(reportText, 'utf8').equals(report), `${RUN.runId} report is not UTF-8`);
  const parsedReport = parseZeroEdgeTraversalSingleReport(reportText);
  const stagedProbe = trackedRead(resolve(root, 'capture/aaron-pre-scene-probe.cl'),
    `${RUN.runId} staged traversal probe`);
  return {
    runId: RUN.runId,
    root: portable(relative(PROJECT_ROOT, root)),
    mode: summary.mode,
    smallImage: summary.smallImage,
    summarySha256: sha(summaryBytes),
    setup,
    request: request.request,
    requestSha256: request.requestSha256,
    probe: {
      path: PROBE_PATH,
      sha256: request.probeSha256,
      stagedSha256: sha(stagedProbe),
      bytes: stagedProbe.length,
      outputName: RUN.outputName,
      pauseSeconds: 0,
      smallImage: false,
    },
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

function readControl(instrumented, setupBaseline, config = CONTROL) {
  const root = resolve(config.root);
  assert(within(resolve(LOCAL_ORACLE_ROOT), root) && basename(root) === config.runId,
    'Control root is not the named owned local-oracle root');
  const summaryBytes = trackedRead(resolve(root, 'summary.json'), `${config.runId} summary`);
  const summary = parseJson(summaryBytes, `${config.runId} summary`);
  const setup = validateSummary(summary, config, false, setupBaseline);
  const core = readCoreCapture(root, config, summary, setupBaseline, setup);
  const loadedSourceBindings = readLoadedSourceBindings(root, config, { loader: false });
  for (const rel of [
    'pre-scene-probe-request.json',
    'capture/aaron-pre-scene-probe.cl',
    `capture/${RUN.outputName}`,
    'capture/aaron-probe-loader.cl',
    'runtime/aaron-probe-loader.cl',
  ]) {
    assert(!existsSync(resolve(root, rel)), `${config.runId} control unexpectedly contains ${rel}`);
  }
  assert(same(setup, instrumented.setup), `${config.runId} setup patch hashes differ from instrumented run`);
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
    runId: config.runId,
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
  assert(match, `Malformed report record: ${line.slice(0, 100)}`);
  const tag = match[1];
  if (tag === 'HELPER') {
    const expected = 'HELPER name=EXCL:ARGLIST present=T fbound=T type=COMPILED-FUNCTION compiled=T';
    assert(line === expected, 'EXCL:ARGLIST helper line differs from the expected compiled-function record');
    return { tag, raw: line, fields: {
      name: 'EXCL:ARGLIST', present: true, fbound: true,
      type: { kind: 'symbol', name: 'COMPILED-FUNCTION' }, compiled: true,
    } };
  }
  if (tag === 'RNG-HELPER') {
    assert(line === EXPECTED_OPAQUE_RNG_HELPER_LINE,
      'Opaque RNG helper line differs from its one recognized Allegro printout');
    return { tag, raw: line, fields: {
      phase: { kind: 'keyword', name: 'AFTER-MAIN' },
      fbound: { kind: 'observed-function-object', name: 'AARON-RANDOM-STATE-PREVIEW' },
    } };
  }
  if (['BEGIN', 'END', 'SCOPE', 'LIMITS'].includes(tag)) {
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

function expectMap(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} is not a field map`);
  return value;
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
  assert(value?.kind === 'number' && /^[-+]?\d+$/u.test(value.raw)
    && Number.isSafeInteger(value.value) && value.value === expected,
  `${label} is not integer ${expected}`);
}

function integerValue(value, label) {
  assert(value?.kind === 'number' && /^[-+]?\d+$/u.test(value.raw)
    && Number.isSafeInteger(value.value), `${label} is not a safe integer`);
  return value.value;
}

function plist(value, label) {
  assert(Array.isArray(value) && value.length % 2 === 0, `${label} is not a proper even-length plist`);
  const result = new Map();
  for (let index = 0; index < value.length; index += 2) {
    const key = keywordName(value[index], `${label} key ${index / 2}`);
    assert(!result.has(key), `${label} repeats :${key}`);
    result.set(key, value[index + 1]);
  }
  return result;
}

function plistField(fields, key, label) {
  assert(fields.has(key), `${label} lacks :${key}`);
  return fields.get(key);
}

function expectPlistKeys(fields, expected, label) {
  const keys = [...fields.keys()];
  assert(keys.length === expected.length && expected.every(key => fields.has(key)),
    `${label} plist keys differ`);
}

function symbolOrQualifiedName(value, label) {
  if (value?.kind === 'symbol') return value.name;
  if (value?.kind === 'qualified-symbol') return `${value.package}${value.separator}${value.name}`;
  throw new Error(`${label} is not a symbol`);
}

function expectList(value, label) {
  assert(Array.isArray(value), `${label} is not a list`);
  return value;
}

function integerList(value, expectedLength, label) {
  const values = expectList(value, label);
  if (expectedLength !== null) assert(values.length === expectedLength,
    `${label} length is ${values.length}, expected ${expectedLength}`);
  return values.map((item, index) => integerValue(item, `${label}[${index}]`));
}

function parseNumberSummary(value, label, expectedType = null) {
  assert(Array.isArray(value) && value.length === 3
    && keywordName(value[0], `${label} number marker`) === 'NUMBER',
  `${label} is not the exact bounded :NUMBER summary`);
  const type = symbolName(value[1], `${label} number type`);
  const number = value[2];
  assert(number?.kind === 'number' && Number.isFinite(number.value), `${label} number is not finite`);
  if (expectedType !== null) assert(type === expectedType, `${label} number type differs from ${expectedType}`);
  return { type, value: number.value, raw: number.raw };
}

function parseTypedValues(value, label) {
  return expectList(value, label).map((row, index) => {
    const fields = plist(row, `${label}[${index}]`);
    expectPlistKeys(fields, ['TYPE', 'VALUE'], `${label}[${index}]`);
    const type = parseGenericType(plistField(fields, 'TYPE', label), `${label}[${index}] type`);
    return { type, value: parseBoundedSummary(plistField(fields, 'VALUE', label), `${label}[${index}] value`) };
  });
}

function parseAxisList(value, expected, label) {
  const fields = plist(value, label);
  expectPlistKeys(fields, ['LIST', 'COUNT', 'PROPER', 'TRUNCATED', 'TAIL'], label);
  const rawItems = expectList(plistField(fields, 'LIST', label), `${label} items`);
  assert(rawItems.length === expected.length, `${label} item count differs from the expected direction list`);
  const items = rawItems.map((row, index) => {
    const number = parseNumberSummary(row, `${label}[${index}]`, 'FIXNUM');
    assert(number.value === expected[index], `${label}[${index}] differs from its expected direction increment`);
    return number.value;
  });
  expectInteger(plistField(fields, 'COUNT', label), expected.length, `${label} count`);
  expectBoolean(plistField(fields, 'PROPER', label), true, `${label} proper list`);
  expectBoolean(plistField(fields, 'TRUNCATED', label), false, `${label} truncation`);
  assert(keywordName(plistField(fields, 'TAIL', label), `${label} tail`) === 'NONE',
    `${label} tail is not NIL`);
  return items;
}

function arraySummary(value, expectedDimensions, expectedBits, label, expectedCells = null) {
  const fields = plist(value, label);
  expectPlistKeys(fields, ['ARRAY', 'RANK', 'DIMENSIONS', 'ELEMENT-TYPE', 'TOTAL', 'VALUES', 'SHOWN', 'TRUNCATED'], label);
  expectInteger(plistField(fields, 'RANK', label), 2, `${label} rank`);
  const dimensions = integerList(plistField(fields, 'DIMENSIONS', label), 2, `${label} dimensions`);
  assert(same(dimensions, expectedDimensions), `${label} dimensions differ`);
  const elementType = expectList(plistField(fields, 'ELEMENT-TYPE', label), `${label} element type`);
  assert(elementType.length === 2 && symbolName(elementType[0], `${label} element type name`) === 'UNSIGNED-BYTE',
    `${label} element type is not UNSIGNED-BYTE`);
  expectInteger(elementType[1], expectedBits, `${label} element bit width`);
  const total = expectedDimensions[0] * expectedDimensions[1];
  expectInteger(plistField(fields, 'TOTAL', label), total, `${label} total elements`);
  const values = expectList(plistField(fields, 'VALUES', label), `${label} values`);
  const shown = integerValue(plistField(fields, 'SHOWN', label), `${label} shown count`);
  const truncated = total > 64;
  expectBoolean(plistField(fields, 'TRUNCATED', label), truncated, `${label} truncation`);
  if (truncated) {
    assert(shown === 0 && values.length === 0, `${label} oversized summary must not expose partial values`);
    assert(expectedCells === null, `${label} cannot be compared cell-by-cell from a bounded summary`);
    return { dimensions, bits: expectedBits, total, values: null, truncated: true };
  }
  assert(shown === total && values.length === total, `${label} does not expose its full bounded cell array`);
  const cells = values.map((item, index) => parseNumberSummary(item, `${label} value ${index}`, 'FIXNUM').value);
  if (expectedCells !== null) assert(same(cells, expectedCells), `${label} cells differ from the full scratch-cell capture`);
  return { dimensions, bits: expectedBits, total, values: cells, truncated: false };
}

function parseScratchCells(value, label, expectedZero = false) {
  const cells = expectList(value, label).map((row, index) => {
    const tuple = expectList(row, `${label}[${index}]`);
    assert(tuple.length === 3, `${label}[${index}] does not have x/y/value`);
    const [x, y, cell] = tuple.map((entry, field) => integerValue(entry, `${label}[${index}][${field}]`));
    assert(x >= 0 && x < 7 && y >= 0 && y < 7 && cell >= 0 && cell <= 15,
      `${label}[${index}] is outside the bounded 7x7 UBYTE4 map`);
    return [x, y, cell];
  });
  assert(cells.length === 49, `${label} does not contain all 49 map cells`);
  const expectedOrder = [];
  for (let x = 0; x < 7; x += 1) for (let y = 0; y < 7; y += 1) expectedOrder.push([x, y]);
  assert(cells.every(([x, y], index) => x === expectedOrder[index][0] && y === expectedOrder[index][1]),
    `${label} cell coordinates are missing, duplicated, or out of row-major order`);
  if (expectedZero) assert(cells.every(([, , cell]) => cell === 0), `${label} is not zero-filled`);
  return cells;
}

function parseChangedCells(value, before, after, label) {
  const actual = listOrNil(value, label).map((row, index) => {
    const tuple = expectList(row, `${label}[${index}]`);
    assert(tuple.length === 4, `${label}[${index}] does not have x/y/before/after`);
    const result = tuple.map((entry, field) => integerValue(entry, `${label}[${index}][${field}]`));
    assert(result[0] >= 0 && result[0] < 7 && result[1] >= 0 && result[1] < 7
      && result[2] >= 0 && result[2] <= 15 && result[3] >= 0 && result[3] <= 15,
    `${label}[${index}] is outside the bounded scratch map`);
    return result;
  });
  const derived = [];
  for (let index = 0; index < 49; index += 1) {
    const [x, y, beforeValue] = before[index];
    const [, , afterValue] = after[index];
    if (beforeValue !== afterValue) derived.push([x, y, beforeValue, afterValue]);
  }
  assert(same(actual, derived), `${label} does not match the full before/after cells`);
  return actual;
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

function tagCounts(records) {
  const result = Object.create(null);
  for (const record of records) result[record.tag] = (result[record.tag] ?? 0) + 1;
  return result;
}

const REQUIRED_TAG_COUNTS = Object.freeze({
  BEGIN: 1, SCOPE: 1, LIMITS: 1, HELPER: 1,
  'TRIPT-TYPE': 1,
  FUNCTION: 6, ARGLIST: 6, BINDING: 7,
  GATE: 1, 'MAIN-GATE': 1, INSTALL: 1, READY: 1, 'MAIN-FINISH': 1,
  'POST-MAIN-GATE': 1, 'CONSTRUCTOR-RETURN': 1, 'CONSTRUCTOR-POINT': 1,
  'CONSTRUCTOR-GATE': 1, 'CALL-GATE': 1, 'DYNAMIC-PREFLIGHT': 1,
  'MAP-SNAPSHOT-STAGE': 12, 'ORIGINAL-MAP-PREFLIGHT': 1,
  'CASE-BEGIN': 1, 'START-DIRECT-XYZ': 1, 'SCRATCH-MAP': 1, 'RNG-CHECK': 2,
  'CASE-OBSERVATION': 1, 'CASE-OBSERVATIONS-READY': 1,
  'ORIGINAL-BINDINGS-AFTER-PROGV': 1,
  'DYNAMIC-RESTORATION': 1, 'ORIGINAL-MAP-CHECK': 1,
  'STATE-AND-MAP-OUTCOME': 1, 'STATE-BINDING': 35, 'STATE-DELTA': 14,
  'CASE-END': 1, COMPLETE: 1, END: 1,
});
const OPTIONAL_TAG_COUNTS = Object.freeze({
  'CASE-RETURN': [0, 1], 'CASE-ERROR': [0, 1], 'RETURNED-TRIPT-PATH': [0, 1], 'RNG-HELPER': [0, 1],
});
const FORBIDDEN_TAGS = Object.freeze([
  'ERROR', 'CONSTRUCTOR-ERROR', 'MAP-SNAPSHOT-ERROR', 'CASE-OBSERVER-ERROR',
  'CASE-FINALIZATION-ERROR', 'CASE-SKIPPED',
]);

function validateRecordFraming(source) {
  assert(typeof source === 'string', 'ZERO-EDGE traversal report input must be text');
  const lines = source.replace(/\r\n/gu, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  assert(lines.length > 0 && lines.every(line => line.length > 0),
    'Report has blank or malformed framing lines');
  const records = lines.map(tagAndFields);
  const known = new Set([...Object.keys(REQUIRED_TAG_COUNTS), ...Object.keys(OPTIONAL_TAG_COUNTS), ...FORBIDDEN_TAGS]);
  for (const record of records) assert(known.has(record.tag), `Unexpected report tag ${record.tag}`);
  const counts = tagCounts(records);
  for (const [tag, expected] of Object.entries(REQUIRED_TAG_COUNTS)) {
    assert((counts[tag] ?? 0) === expected, `Report must contain exactly ${expected} ${tag} records`);
  }
  for (const [tag, [minimum, maximum]] of Object.entries(OPTIONAL_TAG_COUNTS)) {
    const count = counts[tag] ?? 0;
    assert(count >= minimum && count <= maximum, `Report ${tag} count ${count} is outside ${minimum}..${maximum}`);
  }
  for (const tag of FORBIDDEN_TAGS) {
    assert((counts[tag] ?? 0) === 0, `Report contains forbidden ${tag} observer/gate record`);
  }
  assert((counts['CASE-RETURN'] ?? 0) + (counts['CASE-ERROR'] ?? 0) === 1,
    'Report must contain exactly one target return or captured target condition');
  assert(records[0].tag === 'BEGIN' && records[0].raw === 'BEGIN zero-edge-traversal-single v3'
    && records.at(-1).tag === 'END' && records.at(-1).raw === 'END zero-edge-traversal-single v3',
  'Report BEGIN/END framing is incomplete or version-mismatched');
  assert(onlyRecord(records, 'SCOPE').raw ===
    'SCOPE one-post-main-zero-edge-call gated-by-metadata-runtime-constructor zero-edge-wrapped=nil candidate-perim=0 hypothesis-only scratch=7x7-ubyte4-zero main-values=preserved main-errors=propagated rng-reset=none state-reset=none',
  'Report scope declaration differs from the reviewed single-call scope');
  assert(onlyRecord(records, 'LIMITS').raw ===
    'LIMITS value-nodes=256 list-items=64 array-items=64 depth=4 string-prefix=256 condition-control-prefix=256 state-bindings=7 original-map-cells=1048576 scratch-map-cells=49 returned-path-items=64',
  'Report summary limits differ from the reviewed single-call bounds');
  return { lines, records, counts };
}

function listOrNil(value, label) {
  if (value === null) return [];
  return expectList(value, label);
}

function parseGenericType(value, label) {
  if (value?.kind === 'symbol' || value?.kind === 'keyword') return value.name;
  if (value?.kind === 'qualified-symbol') return `${value.package}${value.separator}${value.name}`;
  if (value?.kind === 'number') return value.value;
  if (value?.kind === 'string') return value.value;
  if (Array.isArray(value)) return value.map((item, index) => parseGenericType(item, `${label}[${index}]`));
  throw new Error(`${label} is not a supported Lisp type form`);
}

function typeLeafName(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('::');
  return parts.at(-1);
}

function flattenTypeNames(value, result = []) {
  if (typeof value === 'string') result.push(value);
  else if (Array.isArray(value)) for (const item of value) flattenTypeNames(item, result);
  return result;
}

function parseBoundedArraySummary(value, label) {
  const fields = plist(value, label);
  expectPlistKeys(fields, ['ARRAY', 'RANK', 'DIMENSIONS', 'ELEMENT-TYPE', 'TOTAL', 'VALUES', 'SHOWN', 'TRUNCATED'], label);
  const type = parseGenericType(plistField(fields, 'ARRAY', label), `${label} array type`);
  const rank = integerValue(plistField(fields, 'RANK', label), `${label} rank`);
  assert(rank >= 0 && rank <= 4, `${label} rank exceeds the probe bound`);
  const dimensions = integerList(plistField(fields, 'DIMENSIONS', label), rank, `${label} dimensions`);
  assert(dimensions.every(dimension => dimension >= 0), `${label} has a negative dimension`);
  const elementTypeRaw = expectList(plistField(fields, 'ELEMENT-TYPE', label), `${label} element type`);
  const elementType = elementTypeRaw.map((item, index) => parseGenericType(item, `${label} element type[${index}]`));
  const total = integerValue(plistField(fields, 'TOTAL', label), `${label} total elements`);
  const calculatedTotal = dimensions.reduce((product, dimension) => product * dimension, 1);
  assert(total === calculatedTotal && total <= 1048576, `${label} total does not match its bounded dimensions`);
  const values = listOrNil(plistField(fields, 'VALUES', label), `${label} values`);
  const shown = integerValue(plistField(fields, 'SHOWN', label), `${label} shown count`);
  const truncated = total > 64 || shown < total;
  expectBoolean(plistField(fields, 'TRUNCATED', label), truncated, `${label} truncation`);
  assert(shown === values.length && shown <= Math.min(total, 64), `${label} shown count is inconsistent`);
  if (!truncated) assert(shown === total, `${label} untruncated array is incomplete`);
  const parsedValues = values.map((item, index) => parseBoundedSummary(item, `${label} value ${index}`));
  return { type, rank, dimensions, elementType, total, shown, truncated, values: parsedValues };
}

function parseBoundedListSummary(value, label) {
  const fields = plist(value, label);
  expectPlistKeys(fields, ['LIST', 'COUNT', 'PROPER', 'TRUNCATED', 'TAIL'], label);
  const rawItems = listOrNil(plistField(fields, 'LIST', label), `${label} items`);
  const count = integerValue(plistField(fields, 'COUNT', label), `${label} count`);
  assert(count === rawItems.length && count <= 64, `${label} item count exceeds or contradicts the bounded list`);
  const proper = booleanValue(plistField(fields, 'PROPER', label), `${label} proper`);
  const truncated = booleanValue(plistField(fields, 'TRUNCATED', label), `${label} truncated`);
  const tail = plistField(fields, 'TAIL', label);
  if (proper) assert(tail?.kind === 'keyword' && tail.name === 'NONE', `${label} proper list lacks :NONE tail`);
  else if (tail?.kind === 'keyword') {
    assert(['LIST-LIMIT', 'NODE-LIMIT', 'NOT-REACHED'].includes(tail.name), `${label} has an unknown bounded tail marker`);
  } else parseBoundedSummary(tail, `${label} improper tail`);
  if (truncated) assert(count === 64, `${label} truncation did not reach the 64-item bound`);
  return { items: rawItems.map((item, index) => parseBoundedSummary(item, `${label}[${index}]`)), count, proper, truncated,
    tail: tail?.kind === 'keyword' ? tail.name : parseBoundedSummary(tail, `${label} tail`) };
}

function parseBoundedSummary(value, label) {
  if (value === null) return null;
  if (value === true) return true;
  if (value?.kind === 'symbol') return { symbol: value.name };
  if (value?.kind === 'keyword') return { marker: value.name };
  if (value?.kind === 'number') return { number: value.value, raw: value.raw };
  if (value?.kind === 'string') return value.value;
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} is not a bounded value summary`);
  const marker = keywordName(value[0], `${label} summary marker`);
  if (marker === 'NUMBER') {
    const number = parseNumberSummary(value, label);
    return { number: number.value, raw: number.raw, type: number.type };
  }
  if (marker === 'CHARACTER') {
    assert(value.length === 3, `${label} character summary is malformed`);
    const type = symbolName(value[1], `${label} character type`);
    const code = integerValue(value[2], `${label} character code`);
    assert(code >= 0 && code <= 0x10ffff, `${label} character code is invalid`);
    return { characterCode: code, type };
  }
  if (marker === 'SYMBOL') {
    assert(value.length === 3 && value[1]?.kind === 'string' && value[2]?.kind === 'string',
      `${label} symbol summary is malformed`);
    return { symbolPackage: value[1].value, symbolName: value[2].value };
  }
  if (marker === 'STRING') {
    const fields = plist(value, label);
    expectPlistKeys(fields, ['STRING', 'LENGTH', 'PREFIX', 'TRUNCATED'], label);
    const length = integerValue(plistField(fields, 'LENGTH', label), `${label} string length`);
    const prefix = plistField(fields, 'PREFIX', label);
    assert(prefix?.kind === 'string' && length >= prefix.value.length && prefix.value.length === Math.min(length, 256),
      `${label} string prefix does not match its bound`);
    const truncated = length > 256;
    expectBoolean(plistField(fields, 'TRUNCATED', label), truncated, `${label} string truncation`);
    return { stringLength: length, prefix: prefix.value, truncated };
  }
  if (marker === 'LIST') return parseBoundedListSummary(value, label);
  if (marker === 'ARRAY') return parseBoundedArraySummary(value, label);
  if (marker === 'OBJECT') {
    assert(value.length === 2, `${label} object summary is malformed`);
    return { objectType: parseGenericType(value[1], `${label} object type`) };
  }
  if (marker === 'NODE-LIMIT') {
    assert(value.length === 1, `${label} node-limit marker is malformed`);
    return { marker };
  }
  throw new Error(`${label} uses unsupported bounded summary marker :${marker}`);
}

function booleanValue(value, label) {
  if (value === true || value === null) return value === true;
  if (value?.kind === 'symbol' && (value.name === 'T' || value.name === 'NIL')) return value.name === 'T';
  throw new Error(`${label} is not a bare T/NIL value`);
}

function parseTypedFixnums(value, expectedLength, label, expectedValues = null) {
  const rows = listOrNil(value, label);
  if (expectedLength !== null) assert(rows.length === expectedLength, `${label} count differs`);
  const result = rows.map((row, index) => {
    const fields = plist(row, `${label}[${index}]`);
    expectPlistKeys(fields, ['TYPE', 'VALUE'], `${label}[${index}]`);
    assert(symbolName(plistField(fields, 'TYPE', label), `${label}[${index}] type`) === 'FIXNUM',
      `${label}[${index}] is not a FIXNUM`);
    return parseNumberSummary(plistField(fields, 'VALUE', label), `${label}[${index}] value`, 'FIXNUM').value;
  });
  if (expectedValues !== null) assert(same(result, expectedValues), `${label} differs from its expected coordinates`);
  return result;
}

function parseArglists(records) {
  const rows = recordsByTag(records, 'ARGLIST');
  const result = Object.create(null);
  const expected = {
    'ZERO-EDGE': ['START', 'PERIM'],
    'MAKE-TRIPT': ['X', 'Y', 'Z'],
    X: ['TWOPT'], Y: ['TWOPT'], Z: ['TRIPT'], MAIN: [],
  };
  for (const name of EXPECTED_FUNCTIONS) {
    const row = rows.find(candidate => fieldName(candidate.fields, `${name} arglist`) === name);
    assert(row, `Report lacks arglist metadata for ${name}`);
    result[name] = decodeArglist(row.fields.values, `${name} arglist`);
    assert(same(result[name].parameters, expected[name]), `${name} runtime arglist differs`);
  }
  return result;
}

function parseFunctionMetadata(records) {
  const rows = recordsByTag(records, 'FUNCTION');
  const result = Object.create(null);
  for (const name of EXPECTED_FUNCTIONS) {
    const row = rows.find(candidate => fieldName(candidate.fields, `${name} function`) === name);
    assert(row, `Report lacks function metadata for ${name}`);
    const fields = row.fields;
    expectBoolean(fields.present, true, `${name} present`);
    expectBoolean(fields.fbound, true, `${name} fbound`);
    expectBoolean(fields.compiled, true, `${name} compiled`);
    assert(keywordName(fields.status, `${name} symbol status`) === 'INTERNAL', `${name} is not INTERNAL`);
    const type = symbolName(fields.type, `${name} function type`);
    const expectedType = ['X', 'Y', 'Z'].includes(name) ? 'STANDARD-GENERIC-FUNCTION' : 'COMPILED-FUNCTION';
    assert(type === expectedType, `${name} function object type differs from the reviewed metadata`);
    result[name] = { type, compiled: true, arglist: null };
  }
  return result;
}

function parseDirectionBinding(fields, name, label) {
  assert(fieldName(fields, label) === name, `${label} name differs`);
  expectBoolean(fields.present, true, `${label} present`);
  assert(keywordName(fields.status, `${label} status`) === 'INTERNAL', `${label} is not INTERNAL`);
  expectBoolean(fields.bound, true, `${label} bound`);
  assert(symbolName(fields.type, `${label} type`) === 'CONS', `${label} value is not CONS`);
  const expected = name === 'XINCS' ? EXPECTED_DIRECTION_LISTS.XINCS : EXPECTED_DIRECTION_LISTS.YINCS;
  const values = parseBoundedListSummary(fields.value, `${label} value`);
  assert(values.proper && !values.truncated && same(values.items.map(item => item?.number), expected),
    `${label} does not match the full direction list`);
  return expected;
}

function parseBindingValue(fields, label, phase = 'INITIAL') {
  expectBoolean(fields.present, true, `${label} present`);
  assert(keywordName(fields.status, `${label} status`) === 'INTERNAL', `${label} is not INTERNAL`);
  const name = fieldName(fields, label);
  const mutationMayBeObserved = phase === 'INSIDE-PROGV-AFTER' || phase === 'AFTER-PROGV';
  const startupMapMayBeUnbound = phase === 'INITIAL'
    && ['FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*'].includes(name);
  if (name === 'START') {
    const bound = booleanValue(fields.bound, `${label} bound`);
    if (!bound) {
      assert(!Object.hasOwn(fields, 'type') && !Object.hasOwn(fields, 'value'), `${label} unbound record contains a value`);
      if (!mutationMayBeObserved) expectBoolean(fields.bound, false, `${label} must be unbound`);
      return { name, present: true, bound: false };
    }
    assert(mutationMayBeObserved && Object.hasOwn(fields, 'type') && Object.hasOwn(fields, 'value'),
      `${label} START binding is unexpectedly bound before the target call`);
    return { name, present: true, bound: true, type: parseGenericType(fields.type, `${label} type`),
      value: parseBoundedSummary(fields.value, `${label} value`) };
  }
  const bound = booleanValue(fields.bound, `${label} bound`);
  if (!bound) {
    assert((mutationMayBeObserved || startupMapMayBeUnbound)
      && !Object.hasOwn(fields, 'type') && !Object.hasOwn(fields, 'value'),
      `${label} is unexpectedly unbound before the target call`);
    return { name, present: true, bound: false };
  }
  const type = parseGenericType(fields.type, `${label} type`);
  if (name === 'XINCS' || name === 'YINCS') {
    const direction = parseDirectionBinding(fields, name, label);
    return { name, present: true, bound: true, type, value: direction };
  }
  const parsed = parseBoundedSummary(fields.value, `${label} value`);
  if (mutationMayBeObserved) return { name, present: true, bound: true, type, value: parsed };
  if (name === 'FILL-MAP') {
    const scratchPhase = phase.startsWith('INSIDE-PROGV-');
    assert(flattenTypeNames(type).some(item => item.includes('ARRAY')) && parsed?.rank === 2
      && same(parsed.elementType, ['UNSIGNED-BYTE', 4])
      && parsed.total === parsed.dimensions[0] * parsed.dimensions[1]
      && parsed.total <= 1048576
      && (!scratchPhase || same(parsed.dimensions, [7, 7])),
    `${label} dimensions or element type differ`);
  } else if (name === 'PATCH-MAP') {
    assert(flattenTypeNames(type).some(item => item.includes('ARRAY'))
      && parsed?.rank === 2 && same(parsed.elementType, ['UNSIGNED-BYTE', 16])
      && parsed.total === parsed.dimensions[0] * parsed.dimensions[1] && parsed.total <= 1048576,
    `${label} is not a bounded original UBYTE16 map`);
  } else if (name === '*PIC-WIDE*' || name === '*PIC-HIGH*') {
    assert(type === 'FIXNUM' && Number.isSafeInteger(parsed?.number) && parsed.number > 0,
      `${label} dimension is not a positive FIXNUM`);
  } else throw new Error(`${label} has an unexpected name`);
  return { name, present: true, bound: true, type, value: parsed };
}

function checkStateRows(records) {
  const rows = recordsByTag(records, 'STATE-BINDING');
  const names = ['START', 'XINCS', 'YINCS', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*'];
  assert(rows.length === names.length * EXPECTED_STATE_PHASES.length,
    'STATE-BINDING coverage does not contain every name in every phase');
  const states = new Map();
  for (const [index, row] of rows.entries()) {
    const fields = row.fields;
    const phase = keywordName(fields.phase, `STATE-BINDING ${index} phase`);
    const name = fieldName(fields, `STATE-BINDING ${index} name`);
    const phaseIndex = Math.floor(index / names.length);
    const nameIndex = index % names.length;
    assert(phase === EXPECTED_STATE_PHASES[phaseIndex] && name === names[nameIndex],
      `STATE-BINDING ${index} is out of phase/name order`);
    const key = `${phase}:${name}`;
    assert(!states.has(key), `Duplicate STATE-BINDING ${key}`);
    const parsed = parseBindingValue(fields, key, phase);
    states.set(key, parsed);
  }
  const outsidePhases = ['AFTER-MAIN-BEFORE-CASE', 'AFTER-CONSTRUCTOR', 'AFTER-PROGV'];
  for (const phase of outsidePhases.slice(0, 2)) {
    assert(states.get(`${phase}:START`)?.bound === false, `${phase} START must remain globally unbound`);
    for (const name of ['XINCS', 'YINCS', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*']) {
      const value = states.get(`${phase}:${name}`);
      assert(value?.bound === true, `${phase} ${name} is unexpectedly unbound`);
    }
    for (const name of ['XINCS', 'YINCS']) {
      const value = states.get(`${phase}:${name}`);
      assert(same(value.value, EXPECTED_DIRECTION_LISTS[name]), `${phase} ${name} differs`);
    }
  }
  for (const name of names) {
    const before = states.get(`INSIDE-PROGV-BEFORE:${name}`);
    const after = states.get(`INSIDE-PROGV-AFTER:${name}`);
    assert(before && after && before.present && after.present, `Inside-PROGV ${name} snapshots are missing`);
  }
  for (const name of names) {
    const after = states.get(`AFTER-PROGV:${name}`);
    assert(after && after.present, `AFTER-PROGV ${name} snapshot is missing`);
  }
  const fillBefore = states.get('INSIDE-PROGV-BEFORE:FILL-MAP');
  const wideBefore = states.get('INSIDE-PROGV-BEFORE:*PIC-WIDE*');
  const highBefore = states.get('INSIDE-PROGV-BEFORE:*PIC-HIGH*');
  for (const phase of outsidePhases.slice(0, 2)) {
    const width = states.get(`${phase}:*PIC-WIDE*`).value.number;
    const height = states.get(`${phase}:*PIC-HIGH*`).value.number;
    assert(width * height <= 1048576
      && same(states.get(`${phase}:FILL-MAP`).value.dimensions, [width, height])
      && same(states.get(`${phase}:PATCH-MAP`).value.dimensions, [width, height]),
    `${phase} map dimensions do not match the bound picture dimensions`);
  }
  const originalPatchDimensions = states.get('AFTER-MAIN-BEFORE-CASE:PATCH-MAP').value.dimensions;
  assert(same(states.get('AFTER-CONSTRUCTOR:PATCH-MAP').value.dimensions, originalPatchDimensions)
    && same(states.get('INSIDE-PROGV-BEFORE:PATCH-MAP').value.dimensions, originalPatchDimensions),
  'PATCH-MAP dimensions changed before the call or inside the temporary PROGV');
  assert(fillBefore.value.rank === 2 && same(fillBefore.value.dimensions, [7, 7])
    && same(fillBefore.value.elementType, ['UNSIGNED-BYTE', 4])
    && wideBefore.value.number === 7 && highBefore.value.number === 7,
  'INSIDE-PROGV-BEFORE does not show the temporary 7x7 UBYTE4 scratch bindings');
  const baselineFill = states.get('AFTER-MAIN-BEFORE-CASE:FILL-MAP').value.dimensions;
  const baselinePatch = states.get('AFTER-MAIN-BEFORE-CASE:PATCH-MAP').value.dimensions;
  assert(same(states.get('AFTER-CONSTRUCTOR:FILL-MAP').value.dimensions, baselineFill)
    && same(states.get('AFTER-CONSTRUCTOR:PATCH-MAP').value.dimensions, baselinePatch),
  'Constructor changed an original map dimension');
  return { states, names };
}

function parseStateDeltas(records, states, names) {
  const rows = recordsByTag(records, 'STATE-DELTA');
  assert(rows.length === names.length * 2, 'STATE-DELTA coverage must contain two full seven-binding comparisons');
  const groups = [
    { phase: 'constructor', before: 'AFTER-MAIN-BEFORE-CASE', after: 'AFTER-CONSTRUCTOR' },
    { phase: 'restoration', before: 'AFTER-CONSTRUCTOR', after: 'AFTER-PROGV' },
  ];
  const parsedGroups = [];
  for (const [groupIndex, group] of groups.entries()) {
    const parsed = [];
    for (const [nameIndex, name] of names.entries()) {
      const row = rows[groupIndex * names.length + nameIndex];
      const fields = row.fields;
      assert(fieldName(fields, `STATE-DELTA ${group.phase}`) === name,
        `STATE-DELTA ${group.phase} order/name differs at ${nameIndex}`);
      const before = states.get(`${group.before}:${name}`);
      const after = states.get(`${group.after}:${name}`);
      assert(before && after, `STATE-DELTA ${group.phase} lacks ${name} snapshots`);
      const presentSame = booleanValue(fields['present-same'], `${group.phase} ${name} presence stability`);
      const symbolEq = booleanValue(fields['symbol-eq'], `${group.phase} ${name} symbol identity`);
      const boundBefore = booleanValue(fields['bound-before'], `${group.phase} ${name} bound-before`);
      const boundAfter = booleanValue(fields['bound-after'], `${group.phase} ${name} bound-after`);
      assert(presentSame === (before.present === after.present)
        && boundBefore === before.bound && boundAfter === after.bound,
      `${group.phase} ${name} delta disagrees with state snapshots`);
      const rawValueEq = fields['value-eq'];
      const rawSummaryEqualp = fields['summary-equalp'];
      let valueEq = null;
      let summaryEqualp = null;
      if (boundBefore && boundAfter) {
        valueEq = booleanValue(rawValueEq, `${group.phase} ${name} value identity`);
        summaryEqualp = booleanValue(rawSummaryEqualp, `${group.phase} ${name} summary equality`);
        assert(summaryEqualp === same(before.value, after.value),
          `${group.phase} ${name} summary-equalp disagrees with the bounded snapshots`);
      } else {
        assert(rawValueEq === null && rawSummaryEqualp === null,
          `${group.phase} ${name} unbound values must remain non-comparable`);
      }
      // Symbols are found by the same package/name in every phase; the probe's EQ observation must agree.
      assert(symbolEq === true, `${group.phase} ${name} symbol identity changed`);
      const sameBinding = presentSame && symbolEq && boundBefore === boundAfter
        && (!boundBefore || valueEq && summaryEqualp);
      parsed.push({ name, presentSame, symbolEq, boundBefore, boundAfter, valueEq, summaryEqualp, sameBinding });
    }
    parsedGroups.push({ ...group, rows: parsed, allSame: parsed.every(row => row.sameBinding) });
  }
  assert(parsedGroups[0].allSame, 'Constructor changed a pre-call binding or its bounded summary');
  const constructorGate = onlyRecord(records, 'CONSTRUCTOR-GATE').fields;
  expectBoolean(constructorGate['bindings-unchanged'], parsedGroups[0].allSame,
    'constructor binding preservation gate');
  const restorationGate = onlyRecord(records, 'ORIGINAL-BINDINGS-AFTER-PROGV').fields;
  const reportedBindingsUnchanged = booleanValue(restorationGate.unchanged,
    'original bindings after PROGV preservation result');
  assert(reportedBindingsUnchanged === parsedGroups[1].allSame,
    'ORIGINAL-BINDINGS-AFTER-PROGV does not match its complete STATE-DELTA set');
  return parsedGroups;
}

function parsePreview(value, label) {
  const names = ['RANDOM-100-1', 'RANDOM-100-2', 'RANDOM-100-3'];
  assert(Array.isArray(value) && value.length === 6, `${label} is not a three-draw preview`);
  return names.map((name, index) => {
    assert(keywordName(value[index * 2], `${label} draw ${index + 1} label`) === name,
      `${label} draw labels differ`);
    const draw = value[index * 2 + 1];
    assert(draw?.kind === 'number' && /^\d+$/u.test(draw.raw)
      && Number.isSafeInteger(draw.value) && draw.value >= 0 && draw.value < 100,
    `${label} draw ${index + 1} is outside [0,100)`);
    return draw.value;
  });
}

function parseRngChecks(records, postMainPreview) {
  const rows = recordsByTag(records, 'RNG-CHECK');
  assert(rows.length === 2, 'RNG-CHECK must cover constructor and target-call phases exactly once');
  const phases = ['CONSTRUCTOR', 'ZERO-EDGE'];
  const checks = [];
  for (const [index, row] of rows.entries()) {
    const fields = row.fields;
    assert(keywordName(fields.phase, `RNG-CHECK ${index} phase`) === phases[index],
      `RNG-CHECK ${index} phase differs`);
    expectBoolean(fields.valid, true, `RNG-CHECK ${index} valid`);
    const before = parsePreview(fields['preview-before'], `RNG-CHECK ${index} before`);
    const after = parsePreview(fields['preview-after'], `RNG-CHECK ${index} after`);
    const stable = same(before, after);
    expectBoolean(fields.stable, stable, `RNG-CHECK ${index} stability`);
    if (index === 0) {
      assert(same(before, postMainPreview), 'Constructor RNG preview did not start at post-MAIN preview');
      assert(stable, 'Constructor changed the pre-call RNG preview');
    } else {
      assert(same(before, checks[0].after), 'Target-call RNG preview did not start at the constructor preview');
    }
    checks.push({ phase: phases[index].toLowerCase(), before, after, stable, valid: true });
  }
  return checks;
}

function parseScratchMap(fields) {
  const dimensions = integerList(fields.dimensions, 2, 'SCRATCH-MAP dimensions');
  assert(same(dimensions, [7, 7]), 'SCRATCH-MAP dimensions are not 7x7');
  const elementType = expectList(fields['element-type'], 'SCRATCH-MAP element type');
  assert(elementType.length === 2 && symbolName(elementType[0], 'SCRATCH-MAP element type name') === 'UNSIGNED-BYTE',
    'SCRATCH-MAP is not an unsigned-byte array');
  expectInteger(elementType[1], 4, 'SCRATCH-MAP element width');
  const before = parseScratchCells(fields['cells-before'], 'SCRATCH-MAP before', true);
  const after = parseScratchCells(fields['cells-after'], 'SCRATCH-MAP after');
  const changed = parseChangedCells(fields['changed-cells'], before, after, 'SCRATCH-MAP changed cells');
  return { dimensions, elementType: ['UNSIGNED-BYTE', 4], total: 49,
    before: before.map(([x, y, value]) => ({ x, y, value })),
    after: after.map(([x, y, value]) => ({ x, y, value })),
    changed: changed.map(([x, y, beforeValue, afterValue]) => ({ x, y, before: beforeValue, after: afterValue })) };
}

function parsePointPathSummary(value) {
  const fields = plist(value, 'RETURNED-TRIPT-PATH summary');
  expectPlistKeys(fields, ['PROPER', 'CIRCULAR', 'IMPROPER', 'TRUNCATED', 'COUNT', 'TAIL',
    'RESULT-EQ-START', 'TAIL-EQ-START', 'ITEMS'], 'RETURNED-TRIPT-PATH');
  const proper = booleanValue(plistField(fields, 'PROPER', 'path'), 'path proper');
  const circular = booleanValue(plistField(fields, 'CIRCULAR', 'path'), 'path circular');
  const improper = booleanValue(plistField(fields, 'IMPROPER', 'path'), 'path improper');
  const truncated = booleanValue(plistField(fields, 'TRUNCATED', 'path'), 'path truncated');
  const count = integerValue(plistField(fields, 'COUNT', 'path'), 'path count');
  const items = listOrNil(plistField(fields, 'ITEMS', 'path'), 'path items');
  assert(count === items.length && count <= 64, 'Returned point path count exceeds or contradicts its bound');
  assert(!(proper && (circular || improper)) && !(circular && improper), 'Returned path shape flags conflict');
  assert(truncated === (count === 64 && !proper && !circular && !improper),
    'Returned path truncation does not match its bounded shape');
  const tail = plistField(fields, 'TAIL', 'path');
  if (proper) assert(tail?.kind === 'keyword' && tail.name === 'NONE', 'Proper path must have :NONE tail');
  else if (circular) assert(tail?.kind === 'keyword' && tail.name === 'REPEATED-CONS', 'Circular path tail marker differs');
  else if (truncated) assert(tail?.kind === 'keyword' && tail.name === 'POINT-LIMIT', 'Truncated path tail marker differs');
  else assert(improper, 'Path is neither proper, circular, improper, nor truncated');
  const resultEqStart = booleanValue(plistField(fields, 'RESULT-EQ-START', 'path'), 'path result-eq-start');
  const tailEqStart = booleanValue(plistField(fields, 'TAIL-EQ-START', 'path'), 'path tail-eq-start');
  const parsedItems = items.map((item, index) => {
    const itemFields = plist(item, `path point ${index}`);
    expectPlistKeys(itemFields, ['INDEX', 'CONS-EQ-START', 'CONS-CDR-EQ-START', 'CONS-EQ-PREVIOUS-CDR',
      'POINT-TYPE', 'POINT-IS-TRIPT', 'POINT-EQ-START', 'POINT-FIRST-EQ-INDEX', 'XYZ'], `path point ${index}`);
    expectInteger(plistField(itemFields, 'INDEX', `path point ${index}`), index, `path point ${index} index`);
    const consEqStart = booleanValue(plistField(itemFields, 'CONS-EQ-START', 'path point'), `path point ${index} cons-eq-start`);
    const consCdrEqStart = booleanValue(plistField(itemFields, 'CONS-CDR-EQ-START', 'path point'), `path point ${index} cons-cdr-eq-start`);
    const previousCdr = booleanValue(plistField(itemFields, 'CONS-EQ-PREVIOUS-CDR', 'path point'), `path point ${index} cons-eq-previous-cdr`);
    assert(previousCdr === (index > 0), `path point ${index} previous-cdr relation differs`);
    const pointType = parseGenericType(plistField(itemFields, 'POINT-TYPE', 'path point'), `path point ${index} type`);
    const pointIsTript = booleanValue(plistField(itemFields, 'POINT-IS-TRIPT', 'path point'), `path point ${index} type flag`);
    const pointEqStart = booleanValue(plistField(itemFields, 'POINT-EQ-START', 'path point'), `path point ${index} point-eq-start`);
    const firstEqIndex = integerValue(plistField(itemFields, 'POINT-FIRST-EQ-INDEX', 'path point'), `path point ${index} first-eq-index`);
    assert(firstEqIndex >= 0 && firstEqIndex <= index, `path point ${index} repeated-point index is out of range`);
    const xyzRaw = plistField(itemFields, 'XYZ', 'path point');
    let xyz = null;
    if (pointIsTript) {
      xyz = parseTypedFixnums(xyzRaw, 3, `path point ${index} XYZ`);
    } else if (xyzRaw !== null) {
      const slotError = expectList(xyzRaw, `path point ${index} XYZ status`);
      assert(slotError.length === 2 && keywordName(slotError[0], `path point ${index} slot status`) === 'SLOT-ERROR',
        `path point ${index} has an unsupported XYZ summary`);
      symbolName(slotError[1], `path point ${index} slot error type`);
      xyz = { slotError: symbolName(slotError[1], `path point ${index} slot error type`) };
    }
    assert(pointIsTript === (typeLeafName(pointType) === 'TRIPT'), `path point ${index} TRIPT type flag disagrees`);
    return { index, consEqStart, consCdrEqStart, consEqPreviousCdr: previousCdr,
      pointType, pointIsTript, pointEqStart, firstEqualPointIndex: firstEqIndex, xyz };
  });
  if (proper) assert(!truncated && !circular && !improper, 'Proper returned path has incompatible flags');
  let parsedTail = tail?.kind === 'keyword' ? tail.name : null;
  if (improper) {
    const tailFields = plist(tail, 'improper path tail');
    expectPlistKeys(tailFields, ['TYPE', 'SUMMARY'], 'improper path tail');
    parsedTail = { type: parseGenericType(plistField(tailFields, 'TYPE', 'path tail'), 'path tail type'),
      summary: parseBoundedSummary(plistField(tailFields, 'SUMMARY', 'path tail'), 'path tail summary') };
  }
  return { proper, circular, improper, truncated, count, tail: parsedTail,
    resultEqStart, tailEqStart, points: parsedItems };
}

function parseInitialBindings(records) {
  const names = ['XINCS', 'YINCS', 'START', 'FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*'];
  const rows = recordsByTag(records, 'BINDING');
  assert(rows.length === names.length, 'Initial BINDING metadata does not cover all seven runtime names');
  const values = new Map();
  for (const [index, name] of names.entries()) {
    const fields = rows[index].fields;
    assert(fieldName(fields, `initial BINDING ${index}`) === name,
      `Initial BINDING ${index} is out of reviewed order`);
    values.set(name, parseBindingValue(fields, `initial:${name}`));
  }
  assert(same(values.get('XINCS').value, EXPECTED_DIRECTION_LISTS.XINCS)
    && same(values.get('YINCS').value, EXPECTED_DIRECTION_LISTS.YINCS)
    && values.get('START').bound === false,
  'Initial global START or direction bindings differ');
  for (const name of ['FILL-MAP', 'PATCH-MAP', '*PIC-WIDE*', '*PIC-HIGH*']) {
    assert(values.get(name)?.bound === false, `Startup ${name} must be unbound before MAIN`);
  }
  return values;
}

function expectStringValue(value, expected, label) {
  assert(value?.kind === 'string' && value.value === expected, `${label} differs`);
}

function parseMapMetadata(value, expectedState, bits, label) {
  const fields = plist(value, label);
  expectPlistKeys(fields, ['TYPE', 'RANK', 'DIMENSIONS', 'ELEMENT-TYPE', 'TOTAL'], label);
  const type = parseGenericType(plistField(fields, 'TYPE', label), `${label} type`);
  const rank = integerValue(plistField(fields, 'RANK', label), `${label} rank`);
  const dimensions = integerList(plistField(fields, 'DIMENSIONS', label), 2, `${label} dimensions`);
  const elementTypeRaw = expectList(plistField(fields, 'ELEMENT-TYPE', label), `${label} element type`);
  assert(elementTypeRaw.length === 2
    && symbolName(elementTypeRaw[0], `${label} element type name`) === 'UNSIGNED-BYTE',
  `${label} element type is not UNSIGNED-BYTE`);
  const elementBits = integerValue(elementTypeRaw[1], `${label} element width`);
  const total = integerValue(plistField(fields, 'TOTAL', label), `${label} total`);
  assert(rank === 2 && dimensions.every(value => Number.isSafeInteger(value) && value > 0)
    && elementBits === bits && total === dimensions[0] * dimensions[1]
    && total <= 1048576,
  `${label} metadata is not a bounded rank-two UBYTE${bits} map`);
  assert(same(type, ['ARRAY', ['UNSIGNED-BYTE', bits], dimensions]),
    `${label} array type does not match its dimensions and element type`);
  assert(expectedState?.bound === true && same(type, expectedState.type)
    && same(dimensions, expectedState.value.dimensions)
    && same(expectedState.value.elementType, ['UNSIGNED-BYTE', bits])
    && total === expectedState.value.total,
  `${label} metadata differs from the original before-case state`);
  return { type, rank, dimensions, elementType: ['UNSIGNED-BYTE', bits], total };
}

function validateLinearArrayType(value, bits, length, label) {
  const type = parseGenericType(value, `${label} type`);
  assert(Array.isArray(type) && ['ARRAY', 'SIMPLE-ARRAY'].includes(type[0])
    && same(type[1], ['UNSIGNED-BYTE', bits]) && Array.isArray(type[2])
    && type[2].length === 1 && (type[2][0] === '*' || type[2][0] === length),
  `${label} is not a bounded rank-one UBYTE${bits} array type`);
  return type;
}

function parseMapSnapshotStages(records, states) {
  const rows = recordsByTag(records, 'MAP-SNAPSHOT-STAGE');
  const preflightIndex = records.findIndex(record => record.tag === 'ORIGINAL-MAP-PREFLIGHT');
  const caseBeginIndex = records.findIndex(record => record.tag === 'CASE-BEGIN');
  const stageIndexes = records.flatMap((record, index) => record.tag === 'MAP-SNAPSHOT-STAGE' ? [index] : []);
  assert(preflightIndex > 0 && caseBeginIndex > preflightIndex
    && stageIndexes.length === 12 && stageIndexes.every(index => index < preflightIndex),
  'Full original-map snapshots must finish before preflight and the single target call');
  const expectedStages = [
    ['BEGIN', ['map', 'stage', 'dimension-limit', 'total-size-limit']],
    ['METADATA', ['map', 'stage', 'metadata']],
    ['FLATTEN-BEGIN', ['map', 'stage']],
    ['FLATTEN-AFTER', ['map', 'stage', 'type', 'rank', 'total']],
    ['COPY-BEGIN', ['map', 'stage', 'length']],
    ['COPY-AFTER', ['map', 'stage', 'type', 'length']],
  ];
  const maps = [];
  let index = 0;
  for (const [name, bits] of [['FILL-MAP', 4], ['PATCH-MAP', 16]]) {
    const state = states.get(`AFTER-MAIN-BEFORE-CASE:${name}`);
    assert(state?.bound === true, `${name} original map state is missing before snapshot`);
    const expectedCells = state.value.total;
    const dimensions = state.value.dimensions;
    const stages = [];
    for (const [stageName, keys] of expectedStages) {
      const row = rows[index++];
      assert(row, `MAP-SNAPSHOT-STAGE lacks ${name} ${stageName}`);
      const fields = row.fields;
      expectKeys(fields, keys, `${name} ${stageName} stage record`);
      expectStringValue(fields.map, name, `${name} ${stageName} map name`);
      assert(keywordName(fields.stage, `${name} stage`) === stageName,
        `${name} map snapshot stage order differs`);
      if (stageName === 'BEGIN') {
        const dimensionLimit = integerValue(fields['dimension-limit'], `${name} dimension limit`);
        const totalSizeLimit = integerValue(fields['total-size-limit'], `${name} total-size limit`);
        assert(dimensionLimit >= Math.max(...dimensions) && totalSizeLimit >= expectedCells,
          `${name} current array limits do not admit the original map`);
        stages.push({ stage: stageName.toLowerCase(), dimensionLimit, totalSizeLimit });
      } else if (stageName === 'METADATA') {
        const metadata = parseMapMetadata(fields.metadata, state, bits, `${name} map snapshot metadata`);
        stages.push({ stage: stageName.toLowerCase(), metadata });
      } else if (stageName === 'FLATTEN-AFTER') {
        validateLinearArrayType(fields.type, bits, expectedCells, `${name} flattened copy`);
        expectInteger(fields.rank, 1, `${name} flattened rank`);
        expectInteger(fields.total, expectedCells, `${name} flattened total`);
        stages.push({ stage: stageName.toLowerCase(), rank: 1, total: expectedCells });
      } else if (stageName === 'COPY-BEGIN') {
        expectInteger(fields.length, expectedCells, `${name} full-copy length`);
        stages.push({ stage: stageName.toLowerCase(), length: expectedCells });
      } else if (stageName === 'COPY-AFTER') {
        validateLinearArrayType(fields.type, bits, expectedCells, `${name} completed full copy`);
        expectInteger(fields.length, expectedCells, `${name} completed full-copy length`);
        stages.push({ stage: stageName.toLowerCase(), length: expectedCells });
      } else stages.push({ stage: stageName.toLowerCase() });
    }
    maps.push({ name, bits, dimensions, total: expectedCells, stages });
  }
  assert(index === rows.length, 'Unexpected extra MAP-SNAPSHOT-STAGE records');
  const preflight = onlyRecord(records, 'ORIGINAL-MAP-PREFLIGHT').fields;
  expectKeys(preflight, ['fill', 'patch', 'total-cell-cap'], 'ORIGINAL-MAP-PREFLIGHT');
  expectInteger(preflight['total-cell-cap'], 1048576, 'original map snapshot cap');
  const fill = parseMapMetadata(preflight.fill, states.get('AFTER-MAIN-BEFORE-CASE:FILL-MAP'), 4,
    'ORIGINAL-MAP-PREFLIGHT FILL-MAP');
  const patch = parseMapMetadata(preflight.patch, states.get('AFTER-MAIN-BEFORE-CASE:PATCH-MAP'), 16,
    'ORIGINAL-MAP-PREFLIGHT PATCH-MAP');
  assert(same(fill, maps[0].stages[1].metadata) && same(patch, maps[1].stages[1].metadata),
    'ORIGINAL-MAP-PREFLIGHT metadata differs from the staged full-map snapshots');
  return { cellCap: 1048576, maps, preflight: { fill, patch } };
}

function parseNativeMetadata(records) {
  const helper = onlyRecord(records, 'HELPER').fields;
  assert(helper.name === 'EXCL:ARGLIST' && helper.present === true && helper.fbound === true
    && symbolName(helper.type, 'EXCL:ARGLIST helper type') === 'COMPILED-FUNCTION' && helper.compiled === true,
  'EXCL:ARGLIST helper is not present and compiled');
  const tript = onlyRecord(records, 'TRIPT-TYPE').fields;
  assert(keywordName(tript['lookup-status'], 'TRIPT lookup status') === 'INTERNAL',
    'TRIPT symbol is not INTERNAL');
  expectBoolean(tript.resolved, true, 'TRIPT type resolved');
  assert(tript['symbol-name']?.kind === 'string' && tript['symbol-name'].value === 'TRIPT'
    && tript['symbol-package']?.kind === 'string'
    && tript['symbol-package'].value === 'COMMON-GRAPHICS-USER',
  'TRIPT type symbol identity differs');
  const functions = parseFunctionMetadata(records);
  const arglists = parseArglists(records);
  for (const name of EXPECTED_FUNCTIONS) functions[name].arglist = arglists[name];
  return { helper: 'compiled EXCL:ARGLIST', triptType: 'COMMON-GRAPHICS-USER::TRIPT', functions };
}

function parseConstructor(records, states, deltaGroups, postMainPreview) {
  const postGate = onlyRecord(records, 'POST-MAIN-GATE').fields;
  expectBoolean(postGate['metadata-ready'], true, 'post-MAIN metadata gate');
  expectBoolean(postGate['runtime-ready'], true, 'post-MAIN runtime gate');
  expectBoolean(postGate['rng-preview-valid'], true, 'post-MAIN RNG preview valid');
  const preview = parsePreview(postGate['rng-preview'], 'post-MAIN preview');
  const constructorReturn = onlyRecord(records, 'CONSTRUCTOR-RETURN').fields;
  expectInteger(constructorReturn.arity, 1, 'constructor return arity');
  const values = listOrNil(constructorReturn.values, 'constructor return values');
  assert(values.length === 1, 'Constructor did not return exactly one value');
  const constructorTyped = parseTypedValues(values, 'constructor returned values');
  assert(typeLeafName(constructorTyped[0].type) === 'TRIPT'
    && typeLeafName(constructorTyped[0].value?.objectType) === 'TRIPT',
  'Constructor result is not a TRIPT object');
  const point = onlyRecord(records, 'CONSTRUCTOR-POINT').fields;
  assert(typeLeafName(parseGenericType(point.type, 'constructor direct type')) === 'TRIPT',
    'Constructor point type differs');
  expectBoolean(point['type-is-tript'], true, 'constructor type check');
  const directXYZ = parseTypedFixnums(point['direct-xyz'], 3, 'constructor direct XYZ', [3, 3, 0]);
  const expectedXYZ = integerList(point['expected-xyz'], 3, 'constructor expected XYZ');
  assert(same(expectedXYZ, [3, 3, 0]), 'Constructor expected coordinates differ');
  expectBoolean(point['slots-match'], true, 'constructor slot match');
  const gate = onlyRecord(records, 'CONSTRUCTOR-GATE').fields;
  for (const key of ['ready', 'type-is-tript', 'slots-match', 'rng-preview-valid', 'rng-preview-stable',
    'bindings-unchanged', 'fill-map-identity-and-full-cells-same', 'patch-map-identity-and-full-cells-same']) {
    expectBoolean(gate[key], true, `constructor gate ${key}`);
  }
  assert(deltaGroups[0].allSame, 'Constructor binding delta failed its gate');
  assert(same(directXYZ, [3, 3, 0]) && same(postMainPreview, preview),
    'Constructor evidence is not anchored to this post-MAIN state');
  return { input: { x: directXYZ[0], y: directXYZ[1], z: directXYZ[2] },
    returnedValues: constructorTyped, rngPreview: preview,
    bindingsUnchanged: deltaGroups[0].allSame,
    fillMapIdentityAndFullCellsSame: true, patchMapIdentityAndFullCellsSame: true };
}

function parseConditionDetails(value, label) {
  const fields = plist(value, label);
  expectPlistKeys(fields, ['UNDEFINED-FUNCTION', 'MESSAGE'], label);
  const undefinedFunction = plistField(fields, 'UNDEFINED-FUNCTION', label);
  if (undefinedFunction?.kind === 'keyword') {
    assert(['NOT-UNDEFINED-FUNCTION', 'CELL-ERROR-NAME-UNAVAILABLE', 'CELL-ERROR-NAME-FAILED']
      .includes(undefinedFunction.name), `${label} has an unknown undefined-function marker`);
  } else {
    const detail = expectList(undefinedFunction, `${label} undefined-function detail`);
    const marker = keywordName(detail[0], `${label} undefined-function detail tag`);
    if (marker === 'SYMBOL') {
      assert(detail.length === 3 && detail[1]?.kind === 'string' && detail[2]?.kind === 'string',
        `${label} undefined-function identity is malformed`);
    } else {
      assert(marker === 'TYPE' && detail.length === 2, `${label} undefined-function detail is unsupported`);
      parseGenericType(detail[1], `${label} undefined-function name type`);
    }
  }
  const messageRaw = plistField(fields, 'MESSAGE', label);
  if (messageRaw?.kind === 'keyword') {
    assert(messageRaw.name === 'UNAVAILABLE', `${label} has an unknown unavailable message marker`);
    return { undefinedFunction: undefinedFunction?.kind === 'keyword' ? undefinedFunction.name : 'identity-recorded',
      messageKind: 'unavailable' };
  }
  const message = plist(messageRaw, `${label} message`);
  if (message.has('KIND')) {
    const kind = keywordName(plistField(message, 'KIND', label), `${label} message kind`);
    if (kind === 'CONDITION-TEXT') {
      expectPlistKeys(message, ['KIND', 'PREFIX', 'TRUNCATED'], `${label} condition-text message`);
      const prefix = plistField(message, 'PREFIX', label);
      assert(prefix?.kind === 'string' && prefix.value.length <= 256,
        `${label} condition-text prefix exceeds its bound`);
      const truncated = booleanValue(plistField(message, 'TRUNCATED', label),
        `${label} condition-text truncation`);
      assert(!truncated || prefix.value.length === 256,
        `${label} truncated condition-text prefix does not fill the bound`);
    } else throw new Error(`${label} has an unknown condition message kind`);
  } else {
    expectPlistKeys(message, ['UNAVAILABLE'], `${label} unavailable message`);
    assert(keywordName(plistField(message, 'UNAVAILABLE', label), `${label} unavailable marker`) === 'UNAVAILABLE',
      `${label} unavailable message marker differs`);
  }
  return { undefinedFunction: undefinedFunction?.kind === 'keyword' ? undefinedFunction.name : 'identity-recorded',
    messageKind: message.has('KIND') ? keywordName(plistField(message, 'KIND', label), `${label} message kind`) : 'unavailable' };
}

function parseCallOutcome(records) {
  const returnedRows = recordsByTag(records, 'CASE-RETURN');
  const errorRows = recordsByTag(records, 'CASE-ERROR');
  assert(returnedRows.length + errorRows.length === 1, 'Exactly one CASE-RETURN or CASE-ERROR must be captured');
  if (returnedRows.length === 1) {
    const fields = returnedRows[0].fields;
    const arity = integerValue(fields.arity, 'CASE-RETURN arity');
    assert(arity >= 0 && arity <= 256, 'CASE-RETURN arity exceeds the result bound');
    const values = listOrNil(fields.values, 'CASE-RETURN values');
    assert(values.length === arity, 'CASE-RETURN values do not match multiple-value arity');
    const parsedValues = values.map((row, index) => {
      const typed = plist(row, `CASE-RETURN value ${index}`);
      expectPlistKeys(typed, ['TYPE', 'VALUE'], `CASE-RETURN value ${index}`);
      return { type: parseGenericType(plistField(typed, 'TYPE', `return ${index}`), `return ${index} type`),
        value: parseBoundedSummary(plistField(typed, 'VALUE', `return ${index}`), `return ${index} value`) };
    });
    const pathRows = recordsByTag(records, 'RETURNED-TRIPT-PATH');
    assert(pathRows.length === (arity > 0 ? 1 : 0),
      'RETURNED-TRIPT-PATH coverage does not match a non-empty multiple-value result');
    const path = pathRows.length === 1 ? parsePointPathSummary(pathRows[0].fields.summary) : null;
    return { outcome: 'returned', targetConditionType: null, returnArity: arity,
      values: parsedValues, returnedPath: path };
  }
  const fields = errorRows[0].fields;
  const type = symbolName(fields.type, 'CASE-ERROR target condition type');
  const details = parseConditionDetails(fields.details, 'CASE-ERROR details');
  assert(recordsByTag(records, 'RETURNED-TRIPT-PATH').length === 0,
    'A target condition cannot have a returned TRIPT path record');
  return { outcome: 'target-error', targetConditionType: type, returnArity: null, values: null,
    returnedPath: null, conditionDetails: details };
}

function validateReportSemantics(source) {
  const { lines, records, counts } = validateRecordFraming(source);
  const native = parseNativeMetadata(records);
  const initialBindings = parseInitialBindings(records);
  const gate = onlyRecord(records, 'GATE').fields;
  for (const key of ['maker-fixed-positional-x-y-z', 'maker-compiled', 'zero-edge-fixed-start-perim',
    'zero-edge-compiled', 'accessors-fbound', 'errors-zero']) {
    expectBoolean(gate[key], true, `metadata gate ${key}`);
  }
  const mainGate = onlyRecord(records, 'MAIN-GATE').fields;
  expectBoolean(mainGate.present, true, 'MAIN present');
  expectBoolean(mainGate.fbound, true, 'MAIN fbound');
  assert(symbolName(mainGate['original-type'], 'MAIN original type') === 'COMPILED-FUNCTION',
    'MAIN original function type differs');
  const install = onlyRecord(records, 'INSTALL').fields;
  assert(fieldName(install, 'MAIN install') === 'MAIN'
    && symbolName(install['original-type'], 'installed MAIN original type') === 'COMPILED-FUNCTION',
  'MAIN wrapper installation differs');
  const ready = onlyRecord(records, 'READY').fields;
  expectInteger(ready['metadata-errors'], 0, 'READY metadata errors');
  expectBoolean(ready['zero-edge-case-gate'], true, 'READY ZERO-EDGE metadata gate');
  expectBoolean(ready['main-wrapper-installed'], true, 'READY MAIN wrapper installed');
  const mainFinish = onlyRecord(records, 'MAIN-FINISH').fields;
  assert(keywordName(mainFinish.status, 'MAIN finish status') === 'NORMAL', 'MAIN did not finish normally');
  const states = checkStateRows(records);
  const deltas = parseStateDeltas(records, states.states, states.names);
  const originalMapSnapshots = parseMapSnapshotStages(records, states.states);
  const postMainGate = onlyRecord(records, 'POST-MAIN-GATE').fields;
  expectBoolean(postMainGate['rng-preview-valid'], true, 'post-MAIN preview validity');
  const postMainPreview = parsePreview(postMainGate['rng-preview'], 'post-MAIN RNG preview');
  const constructor = parseConstructor(records, states.states, deltas, postMainPreview);
  const rngChecks = parseRngChecks(records, postMainPreview);
  const callGate = onlyRecord(records, 'CALL-GATE').fields;
  for (const key of ['ready', 'metadata-ready', 'runtime-ready', 'constructor-ready',
    'zero-edge-fixed-start-perim-arglist', 'scratch-zero-49-cells', 'pre-call-rng-preview-valid']) {
    expectBoolean(callGate[key], true, `call gate ${key}`);
  }
  const preflight = onlyRecord(records, 'DYNAMIC-PREFLIGHT').fields;
  for (const key of ['ready', 'temporary-bindings-recorded', 'fill-symbol-eq-post-main',
    'pic-wide-symbol-eq-post-main', 'pic-high-symbol-eq-post-main', 'fill-map-eq-scratch']) {
    expectBoolean(preflight[key], true, `dynamic preflight ${key}`);
  }
  expectInteger(preflight['pic-wide'], 7, 'temporary picture width');
  expectInteger(preflight['pic-high'], 7, 'temporary picture height');
  const scratchBefore = parseScratchCells(preflight['scratch-before'], 'DYNAMIC-PREFLIGHT scratch before', true);
  const preflightFill = states.states.get('INSIDE-PROGV-BEFORE:FILL-MAP');
  assert(preflightFill.value.values?.length === 49
    && preflightFill.value.values.every(row => row.number === 0),
  'Temporary FILL-MAP state is not the complete zero-filled scratch array');
  const caseBegin = onlyRecord(records, 'CASE-BEGIN').fields;
  expectInteger(caseBegin.call, 1, 'CASE-BEGIN call count');
  assert(symbolName(caseBegin.function, 'CASE-BEGIN function') === 'ZERO-EDGE'
    && typeLeafName(parseGenericType(caseBegin['start-type'], 'CASE-BEGIN START type')) === 'TRIPT',
  'CASE-BEGIN target or START type differs');
  expectBoolean(caseBegin['start-is-tript'], true, 'CASE-BEGIN START type check');
  const startAtCall = parseTypedFixnums(caseBegin['start-direct-xyz'], 3, 'CASE-BEGIN direct START XYZ', [3, 3, 0]);
  assert(same(integerList(caseBegin['expected-xyz'], 3, 'CASE-BEGIN expected XYZ'), [3, 3, 0]),
    'CASE-BEGIN expected coordinates differ');
  assert(symbolName(caseBegin['budget-type'], 'CASE-BEGIN PERIM type') === 'FIXNUM',
    'CASE-BEGIN PERIM is not a FIXNUM');
  expectInteger(caseBegin.perim, 0, 'CASE-BEGIN PERIM');
  expectBoolean(caseBegin['perim-is-hypothesis'], true, 'CASE-BEGIN PERIM hypothesis marker');
  assert(same(integerList(caseBegin['scratch-dimensions'], 2, 'CASE-BEGIN scratch dimensions'), [7, 7]),
    'CASE-BEGIN scratch dimensions differ');
  const caseElement = expectList(caseBegin['scratch-element-type'], 'CASE-BEGIN scratch element type');
  assert(caseElement.length === 2 && symbolName(caseElement[0], 'CASE-BEGIN scratch element type') === 'UNSIGNED-BYTE',
    'CASE-BEGIN scratch element type differs');
  expectInteger(caseElement[1], 4, 'CASE-BEGIN scratch element width');
  expectInteger(caseBegin['scratch-cells'], 49, 'CASE-BEGIN scratch cell count');
  assert(same(startAtCall, [3, 3, 0]) && same(scratchBefore.map(row => row[2]), Array(49).fill(0)),
    'Actual target input differs from the gated single-case setup');
  const outcome = parseCallOutcome(records);
  const startDirect = onlyRecord(records, 'START-DIRECT-XYZ').fields;
  const startBefore = parseTypedFixnums(startDirect.before, 3, 'START before target call', [3, 3, 0]);
  const startAfter = parseTypedFixnums(startDirect.after, 3, 'START after target call');
  expectBoolean(startDirect.unchanged, same(startBefore, startAfter), 'START direct XYZ change flag');
  const scratch = parseScratchMap(onlyRecord(records, 'SCRATCH-MAP').fields);
  assert(same(scratch.before.map(row => [row.x, row.y, row.value]), scratchBefore),
    'SCRATCH-MAP before cells differ from the dynamic preflight capture');
  const stateScratchAfterSummary = states.states.get('INSIDE-PROGV-AFTER:FILL-MAP');
  const dynamicWidthAfter = states.states.get('INSIDE-PROGV-AFTER:*PIC-WIDE*');
  const dynamicHeightAfter = states.states.get('INSIDE-PROGV-AFTER:*PIC-HIGH*');
  const dynamicFillMapAfterMatchesScratch = stateScratchAfterSummary.bound
    && stateScratchAfterSummary.value?.rank === 2
    && same(stateScratchAfterSummary.value.dimensions, [7, 7])
    && stateScratchAfterSummary.value.values?.length === 49
    && same(stateScratchAfterSummary.value.values.map(row => row.number), scratch.after.map(row => row.value));
  assert(dynamicWidthAfter?.bound === true && dynamicHeightAfter?.bound === true
    && dynamicWidthAfter.value.number === 7 && dynamicHeightAfter.value.number === 7,
  'Temporary picture dimensions changed during the target call');
  assert(same(startAfter, parseTypedFixnums(onlyRecord(records, 'START-DIRECT-XYZ').fields.after,
    3, 'START after target call')), 'START after coordinates failed repeat parse');
  const callObservation = onlyRecord(records, 'CASE-OBSERVATION').fields;
  expectBoolean(callObservation['inside-progv-before-state-recorded'], true, 'pre-call PROGV state recorded');
  expectBoolean(callObservation['inside-progv-after-state-recorded'], true, 'post-call PROGV state recorded');
  const observationsReady = onlyRecord(records, 'CASE-OBSERVATIONS-READY').fields;
  for (const key of ['ready', 'return-or-condition', 'start-before-after', 'scratch-before-after',
    'state-sets-captured', 'original-maps-capturable', 'rng-preview-valid']) {
    expectBoolean(observationsReady[key], true, `complete observation ${key}`);
  }
  const stateAndMaps = onlyRecord(records, 'STATE-AND-MAP-OUTCOME').fields;
  expectBoolean(stateAndMaps['start-binding-and-directions-captured'], true,
    'global START and direction bindings were captured');
  const originalWidth = states.states.get('AFTER-CONSTRUCTOR:*PIC-WIDE*').value.number;
  const originalHeight = states.states.get('AFTER-CONSTRUCTOR:*PIC-HIGH*').value.number;
  const expectedMapElements = originalWidth * originalHeight;
  assert(expectedMapElements <= 1048576, 'Original map cell count exceeds the reviewed bound');
  expectInteger(stateAndMaps['fill-map-copy-elements'], expectedMapElements, 'full FILL-MAP copied element count');
  expectInteger(stateAndMaps['patch-map-copy-elements'], expectedMapElements, 'full PATCH-MAP copied element count');
  const originalBindings = onlyRecord(records, 'ORIGINAL-BINDINGS-AFTER-PROGV').fields;
  const mapCheck = onlyRecord(records, 'ORIGINAL-MAP-CHECK').fields;
  const fillMapSame = booleanValue(mapCheck['fill-map-identity-and-full-cells-same'],
    'FILL-MAP original identity/full-cell comparison');
  const patchMapSame = booleanValue(mapCheck['patch-map-identity-and-full-cells-same'],
    'PATCH-MAP original identity/full-cell comparison');
  const dynamicRestoration = onlyRecord(records, 'DYNAMIC-RESTORATION').fields;
  const reportedRestored = booleanValue(dynamicRestoration.restored, 'dynamic restoration result');
  const expectedRestored = deltas[1].allSame && fillMapSame && patchMapSame;
  assert(reportedRestored === expectedRestored,
    'DYNAMIC-RESTORATION does not match binding and complete original-map checks');
  const caseEnd = onlyRecord(records, 'CASE-END').fields;
  expectBoolean(caseEnd.attempted, true, 'CASE-END attempted');
  expectBoolean(caseEnd.returned, outcome.outcome === 'returned', 'CASE-END returned outcome');
  expectBoolean(caseEnd.completed, true, 'CASE-END completed');
  expectInteger(caseEnd.calls, 1, 'CASE-END explicit ZERO-EDGE call count');
  expectBoolean(caseEnd.active, false, 'CASE-END active flag');
  expectBoolean(caseEnd.overflow, false, 'CASE-END overflow flag');
  expectInteger(caseEnd['observer-errors'], 0, 'CASE-END observer error count');
  if (outcome.outcome === 'returned') {
    assert(caseEnd['target-condition'] === null, 'Successful target call has a target condition');
  } else {
    assert(symbolName(caseEnd['target-condition'], 'CASE-END target condition') === outcome.targetConditionType,
      'CASE-END target condition differs from CASE-ERROR');
  }
  const complete = onlyRecord(records, 'COMPLETE').fields;
  assert(keywordName(complete['main-status'], 'COMPLETE MAIN status') === 'NORMAL', 'COMPLETE MAIN was not normal');
  expectBoolean(complete['main-wrapper-installed'], true, 'COMPLETE MAIN wrapper installed');
  expectBoolean(complete['case-attempted'], true, 'COMPLETE case attempted');
  expectBoolean(complete['case-returned'], outcome.outcome === 'returned', 'COMPLETE case returned');
  expectBoolean(complete['case-completed'], true, 'COMPLETE case completed');
  expectInteger(complete['zero-edge-calls'], 1, 'COMPLETE explicit ZERO-EDGE call count');
  expectBoolean(complete['case-active'], false, 'COMPLETE case active');
  expectBoolean(complete.overflow, false, 'COMPLETE overflow');
  expectInteger(complete.errors, 0, 'COMPLETE observer errors');
  assert(deltas[1].allSame === booleanValue(originalBindings.unchanged,
    'ORIGINAL-BINDINGS-AFTER-PROGV unchanged'), 'Binding restoration summary differs');
  assert(deltas[1].allSame && fillMapSame && patchMapSame && reportedRestored,
    'Accepted single-call evidence requires restored dynamic bindings and both original maps unchanged by identity and full cells');
  if (EXPECTED_CASE_RESULT !== null) {
    assert(outcome.outcome === EXPECTED_CASE_RESULT.outcome
      && outcome.targetConditionType === EXPECTED_CASE_RESULT.targetConditionType
      && outcome.returnArity === EXPECTED_CASE_RESULT.returnArity,
    'Single-call outcome differs from the root-reviewed accepted capture');
  }
  return {
    lineCount: lines.length,
    functionMetadata: native,
    initialBindings: Object.fromEntries([...initialBindings.entries()]),
    gates: { metadata: true, main: true, constructor: true, preflight: true, call: true,
      completed: true, explicitCalls: 1, observerErrors: 0 },
    case: {
      input: { start: startAtCall, perim: 0, perimScope: 'hypothesis-only',
        scratchDimensions: [7, 7], scratchElementType: 'UNSIGNED-BYTE 4' },
      outcome,
      startDirect: { before: startBefore, after: startAfter, unchanged: same(startBefore, startAfter) },
      scratch,
      dynamicFillMapAfterMatchesScratch,
      dynamicDimensions: { before: [7, 7], after: [dynamicWidthAfter.value.number, dynamicHeightAfter.value.number] },
      rngChecks,
      stateSnapshots: Object.fromEntries([...states.states.entries()]),
      constructor,
    },
    restoration: {
      stateDeltas: deltas,
      originalBindingsUnchanged: deltas[1].allSame,
      fillMapIdentityAndFullCellsSame: fillMapSame,
      patchMapIdentityAndFullCellsSame: patchMapSame,
      dynamicBindingsAndOriginalMapsRestored: reportedRestored,
      originalMapDimensions: [originalWidth, originalHeight],
      originalMapElements: expectedMapElements,
      originalMapSnapshots,
      diagnostic: reportedRestored ? null : 'Probe reported an original binding or original map preservation mismatch.',
    },
    recordCounts: counts,
    errors: 0,
  };
}

export function parseZeroEdgeTraversalSingleReport(source) {
  requireFrozenExpectations();
  assert(typeof source === 'string', 'ZERO-EDGE traversal report input must be text');
  const bytes = Buffer.from(source, 'utf8');
  assert(Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes), 'Traversal report is not round-trip UTF-8');
  assert(sha(bytes) === EXPECTED_REPORT_SHA256,
    'ZERO-EDGE traversal report does not match the accepted root-owned capture hash');
  const parsed = validateReportSemantics(source);
  return { ...parsed, sha256: sha(bytes), bytes: bytes.length };
}

export function deriveZeroEdgeTraversalSingleEvidence() {
  requireFrozenExpectations();
  trackedSources.clear();
  trackedRead(fileURLToPath(import.meta.url), 'zero-edge traversal single evidence helper source');
  for (const path of SUPPORT_SOURCES) trackedRead(path, `support source ${path}`);
  const nativeBaseline = readNativeBaseline();
  const setupBaseline = readSetupBaseline();
  const instrumented = readInstrumented(setupBaseline);
  const control = readControl(instrumented, setupBaseline);
  const repeatControl = readControl(instrumented, setupBaseline, CONTROL_REPEAT);
  assert(control.runId !== repeatControl.runId && control.runId !== instrumented.runId
    && repeatControl.runId !== instrumented.runId,
  'Instrumented and two control captures are not distinct runs');
  assert(control.capture.aa0.equals(repeatControl.capture.aa0)
    && control.capture.scene.equals(repeatControl.capture.scene)
    && control.capture.image.equals(repeatControl.capture.image)
    && control.capture.imageId.equals(repeatControl.capture.imageId)
    && control.capture.executable.equals(repeatControl.capture.executable)
    && control.capture.pll.equals(repeatControl.capture.pll)
    && control.capture.runtimeFiles.length === repeatControl.capture.runtimeFiles.length
    && control.capture.runtimeFiles.every((file, index) => file.name === repeatControl.capture.runtimeFiles[index].name
      && file.bytes.equals(repeatControl.capture.runtimeFiles[index].bytes)),
  'Fresh uninstrumented control captures do not reproduce byte-for-byte');
  const sourceHashes = revalidateTrackedSources();
  const portableInstrumented = { ...instrumented, capture: portableCoreCapture(instrumented.capture) };
  const portableControl = { ...control, capture: portableCoreCapture(control.capture) };
  const portableRepeatControl = { ...repeatControl, capture: portableCoreCapture(repeatControl.capture) };
  return {
    schemaVersion: 1,
    kind: 'zero-edge-traversal-single-capture-evidence',
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
    repeatControl: portableRepeatControl,
    controlParity: {
      instrumentedMatchesControlB: control.parity,
      instrumentedMatchesControlC: repeatControl.parity,
      controlsBAndCByteIdentical: true,
    },
    limitations: [
      'The observation is one explicit ZERO-EDGE call with START direct coordinates (3, 3, 0), PERIM 0, and a fresh zero-filled 7x7 UBYTE4 scratch FILL-MAP. PERIM 0 remains a hypothesis for this captured case.',
      'The captured return or target condition, START slot changes, all 49 scratch cells, RNG preview changes, dynamic bindings, and full original-map preservation checks are limited to this single post-MAIN invocation.',
      'No general behavior is inferred for other START coordinates, PERIM values, map dimensions, callers, scene contexts, or native call paths.',
      'Original FILL-MAP and PATCH-MAP dimensions are read from this run’s current picture bindings and are bounded to 1,048,576 cells; probe-reported identity/full-cell comparisons are retained as observed diagnostics.',
      'Random-state evidence is limited to the probe’s three bounded preview draws around the constructor and target call; it does not establish full random-state purity.',
      'Two fresh uninstrumented controls are byte-compared with each other and with the instrumented capture for AA0, raw scene report, image, image ID, executable, PLL, and all runtime application files.',
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
    process.stdout.write('Usage: node research/tools/derive-zero-edge-traversal-single-evidence.mjs [--output <fresh-ignored-json-under-zero-edge-single-v3-seed1234-20261011-e>]\n');
    return;
  }
  const outputPath = resolve(args.output ?? DEFAULT_OUTPUT);
  const allowedOutputRoot = resolve(OUTPUT_ROOT);
  assert(within(allowedOutputRoot, outputPath), 'Derived evidence output must be under the owned instrumented run root');
  assert(!existsSync(outputPath), 'Derived evidence output must be fresh; refusing to overwrite');
  assertIgnored(outputPath, 'Derived evidence output');
  const evidence = deriveZeroEdgeTraversalSingleEvidence();
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(outputPath, bytes, { flag: 'wx' });
  process.stdout.write(JSON.stringify({
    outputPath: portable(relative(PROJECT_ROOT, outputPath)),
    outputSha256: sha(bytes),
    instrumented: {
      runId: evidence.instrumented.runId,
      reportSha256: evidence.instrumented.report.sha256,
      lineCount: evidence.instrumented.report.lineCount,
      recordCounts: evidence.instrumented.report.parsed.recordCounts,
      outcome: evidence.instrumented.report.parsed.case.outcome,
      start: evidence.instrumented.report.parsed.case.input.start,
      perim: evidence.instrumented.report.parsed.case.input.perim,
      scratchChangedCells: evidence.instrumented.report.parsed.case.scratch.changed.length,
      restoration: evidence.instrumented.report.parsed.restoration,
    },
    controls: [evidence.control.runId, evidence.repeatControl.runId],
    controlsByteIdentical: evidence.controlParity.controlsBAndCByteIdentical,
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
