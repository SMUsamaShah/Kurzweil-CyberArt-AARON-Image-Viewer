#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual as same } from 'node:util';
import { compareBrushBufferTape } from './compare-brush-buffer-capture.mjs';
import { deriveBrushBufferNativeEvidence } from './derive-brush-buffer-native-evidence.mjs';
import { parseBrushBufferReport } from './parse-brush-buffer-report.mjs';
import { parseBrushStrokeBoundaryReport } from './parse-brush-stroke-boundary-report.mjs';
import { sha256 } from './index-allegro-image.mjs';

const PROJECT_ROOT = resolve('.');
const LOCAL_ORACLE_ROOT = resolve('research/extracted/local-oracle');
const PROBE_SOURCE = 'research/introspection/brush-buffer-capture.cl';
const BOUNDARY_EVIDENCE = 'research/introspection/evidence/brush-stroke-boundary-parity-20261005.json';
const NATIVE_EVIDENCE = 'research/introspection/evidence/brush-buffer-native-20261006.json';
const BOUNDARY_SCENES = [
  {
    seed: 1234,
    mode: 'writer-stream-seed-1234',
    observedRoot: 'brush-stroke-boundary-seed1234-20261005-f',
    controlRoot: 'brush-stroke-boundary-control-seed1234-20261005-g',
  },
  {
    seed: 5678,
    mode: 'writer-full-seed-5678',
    observedRoot: 'brush-stroke-boundary-seed5678-20261005-h',
    controlRoot: 'brush-stroke-boundary-control-seed5678-20261005-i',
  },
];
const BUFFER_SCENES = [
  {
    seed: 1234,
    mode: 'writer-stream-seed-1234',
    observedRoot: 'brush-buffer-capture-seed1234-20261006-a',
    controlRoot: 'brush-buffer-capture-control-seed1234-20261006-b',
  },
  {
    seed: 5678,
    mode: 'writer-full-seed-5678',
    observedRoot: 'brush-buffer-capture-seed5678-20261006-c',
    controlRoot: 'brush-buffer-capture-control-seed5678-20261006-d',
  },
];
const REPORT_NAME = 'aaron-brush-buffer.txt';
const RELEASE_FILE = 'C:\\temp\\aaron-native-code-release.txt';
const SOURCE_FILES = [
  PROBE_SOURCE,
  'research/tools/compare-brush-buffer-capture.mjs',
  'research/tools/parse-brush-buffer-report.mjs',
  'research/tools/parse-brush-stroke-boundary-report.mjs',
  'research/tools/parse-natural-free-path-report.mjs',
  'research/tools/derive-brush-stroke-boundary-evidence.mjs',
  'research/tools/derive-brush-buffer-native-evidence.mjs',
  'research/tools/index-allegro-image.mjs',
  'engine/src/aaron-buffer-brush.js',
  'engine/src/aaron-boundary-brush.js',
  'engine/src/aaron-maps.js',
];

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const sha = bytes => sha256(bytes);
const json = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
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
  const sourcePath = portable(relative(PROJECT_ROOT, absolute));
  const digest = sha(bytes);
  const previous = sources.get(sourcePath);
  assert(!previous || (previous.sha256 === digest && previous.bytes === bytes.length),
    `${label} changed while the evidence was being derived`);
  sources.set(sourcePath, { path: sourcePath, sha256: digest, bytes: bytes.length });
  return bytes;
}

function hexSha(value, label) {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/iu.test(value), `${label} is not a SHA-256 digest`);
  return value.toLowerCase();
}

function expectKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)),
  `${label} fields differ`);
}

function assertIgnored(path, label) {
  const rel = portable(relative(PROJECT_ROOT, resolve(path)));
  const result = spawnSync('git', ['check-ignore', '--quiet', '--', rel], {
    cwd: PROJECT_ROOT, encoding: 'utf8', windowsHide: true,
  });
  assert(!result.error && result.status === 0, `${label} is not covered by the workspace ignore rules`);
}

function readSceneRun(rootName, mode, {
  probe = false,
  reportName = REPORT_NAME,
  probeSource = PROBE_SOURCE,
  probeOutputs = [reportName],
} = {}) {
  const root = resolve(LOCAL_ORACLE_ROOT, rootName);
  assert(within(LOCAL_ORACLE_ROOT, root) && basename(root) === rootName,
    `${rootName} is outside the named local-oracle root`);
  const summaryBytes = trackedRead(resolve(root, 'summary.json'), `${rootName} summary`);
  const summary = json(summaryBytes);
  assert(summary.complete === true && summary.runId === rootName
    && summary.mode === mode && summary.smallImage === false,
  `${rootName} is incomplete or has a different run/mode/size`);
  for (const key of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'aa0Sha256', 'sceneReportSha256']) {
    summary[key] = hexSha(summary[key], `${rootName} ${key}`);
  }

  const aa0 = trackedRead(resolve(root, 'capture/aa0'), `${rootName} AA0`);
  const scene = trackedRead(resolve(root, 'capture/aaron-scene-state-snapshot.txt'), `${rootName} scene report`);
  const aa0Sha256 = sha(aa0), sceneSha256 = sha(scene);
  assert(aa0Sha256 === summary.aa0Sha256 && sceneSha256 === summary.sceneReportSha256,
    `${rootName} summary hashes do not bind its drawing and scene report`);
  const runtime = resolve(root, 'runtime/AARON.exe');
  const executable = trackedRead(runtime, `${rootName} AARON.exe`);
  const pll = trackedRead(resolve(root, 'runtime/AARON.pll'), `${rootName} AARON.pll`);

  let request = null, requestSha256 = null, probeSha256 = null, report = null, rawReport = null;
  if (probe) {
    const requestBytes = trackedRead(resolve(root, 'pre-scene-probe-request.json'), `${rootName} probe request`);
    request = json(requestBytes);
    expectKeys(request, ['schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256',
      'pauseSeconds', 'releaseFile', 'probeOutputNames'], `${rootName} probe request`);
    const currentProbe = trackedRead(probeSource, `${rootName} current probe source`);
    const stagedProbe = trackedRead(resolve(root, 'capture/aaron-pre-scene-probe.cl'), `${rootName} staged probe`);
    probeSha256 = sha(currentProbe);
    assert(request.schemaVersion === 1 && request.runId === rootName
      && request.pauseSeconds === 0 && summary.preSceneProbePauseSeconds === 0
      && request.releaseFile === RELEASE_FILE
      && resolve(request.runtimeExecutable).toLowerCase() === runtime.toLowerCase()
      && request.probeSha256 === probeSha256 && summary.preSceneProbeSha256 === probeSha256
      && currentProbe.equals(stagedProbe),
    `${rootName} probe request/runtime/staged/current source binding differs`);
    assert(same(request.probeOutputNames, probeOutputs)
      && same(summary.probeOutputNames, probeOutputs), `${rootName} probe output names differ`);
    const loader = trackedRead(resolve(root, 'capture/aaron-probe-loader.cl'), `${rootName} probe loader`);
    assert(loader.toString('utf8').includes('load "C:\\\\temp\\\\aaron-pre-scene-probe.cl"'),
      `${rootName} loader does not load the staged probe`);
    requestSha256 = sha(requestBytes);

    rawReport = trackedRead(resolve(root, `capture/${reportName}`), `${rootName} natural buffer tape`);
    if (reportName === REPORT_NAME) {
      report = parseBrushBufferReport(rawReport);
      assert(report.schemaVersion === 2 && report.source.bytes === rawReport.length
        && report.source.sha256 === sha(rawReport) && report.complete.errors === 0
        && report.complete.aborts === 0 && report.complete.overflow === null,
      `${rootName} parser result is incomplete or not bound to its raw tape`);
    } else {
      assert(reportName === 'aaron-brush-stroke-boundary.txt', `${rootName}: unknown prior tape schema`);
      report = parseBrushStrokeBoundaryReport(rawReport.toString('utf8'));
      assert(report.source.sha256 === sha(rawReport), `${rootName}: prior tape source hash differs`);
    }
  } else {
    assert(summary.preSceneProbeSha256 === null && summary.preSceneProbePauseSeconds === 0
      && same(summary.probeOutputNames, []), `${rootName} control contains probe metadata`);
    for (const path of [
      'pre-scene-probe-request.json',
      'capture/aaron-pre-scene-probe.cl',
      `capture/${REPORT_NAME}`,
      'capture/aaron-brush-stroke-boundary.txt',
    ]) assert(!existsSync(resolve(root, path)), `${rootName} control unexpectedly contains ${path}`);
  }

  return {
    root, rootName, mode, summary, summarySha256: sha(summaryBytes),
    request, requestSha256, probeSha256,
    aa0, aa0Sha256, scene, sceneSha256,
    executableSha256: sha(executable), pllSha256: sha(pll),
    rawReport, report,
  };
}

function assertRunParity(observed, control) {
  assert(observed.mode === control.mode && observed.summary.mode === control.summary.mode
    && observed.summary.smallImage === control.summary.smallImage
    && observed.aa0.equals(control.aa0) && observed.scene.equals(control.scene)
    && observed.executableSha256 === control.executableSha256
    && observed.pllSha256 === control.pllSha256,
  `${observed.rootName}/${control.rootName} outputs, runtime, or mode differ`);
  for (const key of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(observed.summary[key] === control.summary[key], `${observed.rootName}/${control.rootName} ${key} differs`);
  }
}

function validateSourceClosure(items, label) {
  assert(Array.isArray(items) && items.length > 0, `${label} has no source closure`);
  const seen = new Set();
  for (const item of items) {
    assert(item && typeof item === 'object' && !Array.isArray(item)
      && (same(Object.keys(item), ['path', 'sha256'])
        || same(Object.keys(item), ['path', 'sha256', 'bytes'])),
    `${label} source record fields differ`);
    assert(typeof item.path === 'string' && !seen.has(item.path), `${label} has a duplicate/invalid source path`);
    seen.add(item.path);
    const bytes = trackedRead(item.path, `${label} source ${item.path}`);
    assert(sha(bytes) === hexSha(item.sha256, `${label} ${item.path} hash`), `${label} source changed: ${item.path}`);
    if (Object.hasOwn(item, 'bytes')) assert(Number.isSafeInteger(item.bytes) && item.bytes === bytes.length,
      `${label} source length changed: ${item.path}`);
  }
}

function validatePreviousBoundaryEvidence() {
  const evidenceBytes = trackedRead(BOUNDARY_EVIDENCE, 'prior boundary evidence v3');
  const evidence = json(evidenceBytes);
  assert(evidence.schemaVersion === 1
    && evidence.kind === 'Complete natural BRUSH-STROKE value-3 marking and subsequent clear comparisons'
    && Array.isArray(evidence.scenes) && evidence.scenes.length === 2,
  'Prior boundary evidence is not the expected complete two-seed v3 artifact');
  validateSourceClosure(evidence.sources, 'prior boundary evidence');
  const sceneReports = [];
  for (const config of BOUNDARY_SCENES) {
    const prior = evidence.scenes.find(scene => scene.seed === config.seed);
    assert(prior && prior.observed.root === config.observedRoot
      && prior.control.root === config.controlRoot && prior.observed.mode === config.mode
      && prior.control.mode === config.mode && prior.aa0ByteIdentical === true
      && prior.sceneReportByteIdentical === true && prior.setupIdentical === true,
    `Prior boundary evidence for seed ${config.seed} has different roots or parity`);
    const observed = readSceneRun(config.observedRoot, config.mode, {
      probe: true, reportName: 'aaron-brush-stroke-boundary.txt',
      probeSource: 'research/introspection/brush-stroke-boundary-capture.cl',
      probeOutputs: ['aaron-brush-stroke-boundary.txt'],
    });
    const control = readSceneRun(config.controlRoot, config.mode);
    assertRunParity(observed, control);
    const reportPath = resolve(observed.root, 'capture/aaron-brush-stroke-boundary.txt');
    const parsed = parseBrushStrokeBoundaryReport(observed.rawReport.toString('utf8'), {
      sourceMetadata: { reportPath: portable(relative(PROJECT_ROOT, reportPath)), reportSha256: sha(observed.rawReport) },
    });
    assert(parsed.source.sha256 === sha(observed.rawReport)
      && parsed.complete.main === 'NORMAL' && parsed.complete.errors === 0 && parsed.complete.aborts === 0
      && same(parsed.complete, prior.complete),
    `Prior boundary seed ${config.seed} raw tape does not match its derived source-bound evidence`);
    assert(prior.observed.summarySha256 === observed.summarySha256
      && prior.observed.requestSha256 === observed.requestSha256
      && prior.observed.stagedSourceSha256 === observed.probeSha256
      && prior.observed.rawReportSha256 === sha(observed.rawReport)
      && prior.control.summarySha256 === control.summarySha256
      && prior.observed.aa0Sha256 === observed.aa0Sha256
      && prior.observed.sceneReportSha256 === observed.sceneSha256,
    `Prior boundary seed ${config.seed} summary/request/report/output hash binding differs`);
    sceneReports.push({ config, prior, observed, control, parsed });
  }
  return { path: BOUNDARY_EVIDENCE, sha256: sha(evidenceBytes), evidence, scenes: sceneReports };
}

function validateNativeEvidence() {
  const nativeEvidence = deriveBrushBufferNativeEvidence(
    'research/extracted/local-oracle/brush-painting-native-seed1234-20261005-a',
    'research/extracted/local-oracle/brush-buffer-native-seed1234-20261005-c',
    'research/extracted/local-oracle/brush-painting-native-control-seed1234-20261005-b',
  );
  const bytes = trackedRead(NATIVE_EVIDENCE, 'completed native brush-buffer evidence');
  const saved = json(bytes);
  assert(same(saved, nativeEvidence), 'Saved native evidence differs from the current three-root native-helper result');
  validateSourceClosure(nativeEvidence.sourceHashes, 'native brush-buffer evidence');
  assert(nativeEvidence.drawingParity?.aa0ByteIdenticalToFreshControl === true
    && nativeEvidence.drawingParity?.sceneReportByteIdenticalToFreshControl === true
    && nativeEvidence.nativeMapping?.functions?.length === 6,
  'Native brush-buffer evidence is incomplete or lacks fresh-control parity');
  return {
    path: NATIVE_EVIDENCE,
    sha256: sha(bytes),
    sourceCount: nativeEvidence.sourceHashes.length,
    nativeRuns: nativeEvidence.nativeRuns.map(run => ({ runId: run.runId, aa0Sha256: run.aa0Sha256, sceneReportSha256: run.sceneReportSha256 })),
    control: nativeEvidence.control,
    functions: nativeEvidence.nativeMapping.functions.map(fn => ({
      name: fn.name, runId: fn.nativeRunId, payloadSha256: fn.payload.sha256,
      reportSha256: fn.ghidra.reportSha256, instructionCount: fn.ghidra.instructionCount,
      instructionBytesCompared: fn.ghidra.instructionBytesCompared,
      provider: fn.rea.provider.id, nativeProviderSession: fn.rea.nativeProviderSession,
    })),
    limitations: nativeEvidence.limitations,
  };
}

function runInfo(run) {
  return {
    root: run.rootName,
    mode: run.summary.mode,
    smallImage: run.summary.smallImage,
    summarySha256: run.summarySha256,
    requestSha256: run.requestSha256,
    stagedProbeSha256: run.probeSha256,
    runtimeExecutableSha256: run.executableSha256,
    runtimePllSha256: run.pllSha256,
    aa0Sha256: run.aa0Sha256,
    sceneReportSha256: run.sceneSha256,
    ...(run.rawReport ? {
      rawReportSha256: sha(run.rawReport), rawReportBytes: run.rawReport.length,
      parserSource: run.report.source,
      complete: run.report.complete,
    } : {}),
  };
}

export function deriveBrushBufferEvidence() {
  sources.clear();
  for (const path of SOURCE_FILES) trackedRead(path, `source ${path}`);
  const native = validateNativeEvidence();
  const priorBoundary = validatePreviousBoundaryEvidence();
  const scenes = [];
  for (const config of BUFFER_SCENES) {
    const observed = readSceneRun(config.observedRoot, config.mode, { probe: true });
    const control = readSceneRun(config.controlRoot, config.mode);
    assertRunParity(observed, control);
    const priorBoundaryScene = priorBoundary.scenes.find(scene => scene.config.seed === config.seed);
    assert(priorBoundaryScene, `Missing prior BRUSH-STROKE tape for seed ${config.seed}`);
    assertRunParity(observed, priorBoundaryScene.observed);
    const comparison = compareBrushBufferTape(observed.report, priorBoundaryScene.parsed);
    assert(comparison && comparison.coverage && Array.isArray(comparison.children)
      && Array.isArray(comparison.buffers) && Array.isArray(comparison.intervals)
      && Array.isArray(comparison.profiles) && Array.isArray(comparison.limits),
    `Buffer comparator returned an incomplete result for seed ${config.seed}`);
    scenes.push({
      seed: config.seed,
      observed: runInfo(observed),
      control: runInfo(control),
      previousBoundary: {
        root: priorBoundaryScene.observed.rootName,
        controlRoot: priorBoundaryScene.control.rootName,
        rawReportSha256: sha(priorBoundaryScene.observed.rawReport),
        complete: priorBoundaryScene.parsed.complete,
      },
      parity: {
        aa0ByteIdenticalToFreshControl: observed.aa0.equals(control.aa0),
        sceneReportByteIdenticalToFreshControl: observed.scene.equals(control.scene),
        runtimeFilesIdentical: observed.executableSha256 === control.executableSha256
          && observed.pllSha256 === control.pllSha256,
        setupIdentical: true,
      },
      comparison,
    });
  }

  trackedRead(BOUNDARY_EVIDENCE, 'prior boundary evidence artifact');
  trackedRead(NATIVE_EVIDENCE, 'native evidence artifact');
  trackedRead(fileURLToPath(import.meta.url), 'this deriver source');
  const sourceHashes = [...sources.values()].sort((a, b) => a.path.localeCompare(b.path));
  return {
    schemaVersion: 1,
    kind: 'Two-seed natural BUFFER-FEATURE boundaries and added value-3 provenance',
    nativeEvidence: native,
    priorBoundaryEvidence: {
      path: priorBoundary.path,
      sha256: priorBoundary.sha256,
      sceneRoots: priorBoundary.scenes.map(scene => ({
        seed: scene.config.seed, observed: runInfo(scene.observed), control: runInfo(scene.control),
        rawTapeSha256: sha(scene.observed.rawReport),
        complete: scene.parsed.complete,
      })),
    },
    scenes,
    aggregation: {
      policy: 'Coverage and child/buffer/interval rows are retained per seed; no cross-seed numeric aggregation is asserted.',
    },
    limitations: [
      'Only the two complete natural captures named here are compared. The incomplete -d diagnostic is not an input.',
      'Feature results are restricted to the observed calls, masks, frames, existing maps and original EDGE point lists. DOUBLE-FLOAT and integer coordinates are measured.',
      'BUFFER-HOLE and BUFFER-ANYTHING have zero natural calls in both tapes; no JS behavior is published for them.',
      'The comparison observes complete function-boundary maps; it does not trace each underlying array store or continuous ownership between child calls.',
      'BUFFER-HEAD feature indices and BUFFER-ANYTHING plan/frame selection remain captured inputs; this derivation does not independently generate those selections.',
      'The six native functions are selected offline Ghidra reports with canonical standalone Evidence imports; no native REA provider session is claimed.',
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
      output = args[index + 1];
      assert(output && !output.startsWith('--'), '--output requires a path');
      index += 1;
    } else if (arg.startsWith('--output=')) output = arg.slice('--output='.length);
    else throw new Error(`Unknown option ${arg}`);
  }
  return { help: false, output };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: node research/tools/derive-brush-buffer-evidence.mjs [--output <fresh-ignored-json>]\n');
    return;
  }
  const defaultPath = resolve(LOCAL_ORACLE_ROOT,
    'brush-buffer-capture-seed1234-20261006-a/brush-buffer-evidence.json');
  const outputPath = resolve(args.output ?? defaultPath);
  assert(within(LOCAL_ORACLE_ROOT, outputPath), 'Derived buffer evidence must stay under the local-oracle root');
  assert(!existsSync(outputPath), 'Derived buffer evidence output must be fresh');
  assertIgnored(outputPath, 'Derived buffer evidence output');
  const evidence = deriveBrushBufferEvidence();
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(outputPath, bytes, { flag: 'wx' });
  process.stdout.write(JSON.stringify({
    outputPath: portable(relative(PROJECT_ROOT, outputPath)),
    outputSha256: sha(bytes),
    sourceCount: evidence.sourceHashes.length,
    nativeFunctionCount: evidence.nativeEvidence.functions.length,
    scenes: evidence.scenes.map(scene => ({
      seed: scene.seed, observed: scene.observed.root, control: scene.control.root,
      aa0Parity: scene.parity.aa0ByteIdenticalToFreshControl,
      sceneParity: scene.parity.sceneReportByteIdenticalToFreshControl,
      complete: scene.observed.complete,
      coverage: scene.comparison.coverage,
    })),
  }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
