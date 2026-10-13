#!/usr/bin/env node

// Revalidates the 320x480 evidence and a fresh 768x1080 observer/control
// triplet, then writes a deterministic portable source-closure report.
// This script reads captures and never executes the original or synthetic PE.
import { createHash } from 'node:crypto';
import {
  existsSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import {
  dirname, isAbsolute, relative, resolve, sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const portable = (value) => value.replaceAll('\\', '/');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const inside = (base, file) => {
  const rel = relative(base, file);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep)
    && !isAbsolute(rel);
};

const outputNames = [
  'aa0',
  'image',
  'image-id',
  'aaron-scene-state-snapshot.txt',
  'aaron-planning-call-trace.txt',
  'aaron-random-seed-loaded.txt',
];
const sceneSourceNames = [
  'planning-call-trace.cl',
  'planning-random-seed-common.cl',
  'scene-state-snapshot-seeded-1234.cl',
  'scene-state-snapshot-writer-seeded-1234.cl',
  'scene-state-snapshot-writer-stream-seeded-1234.cl',
  'scene-state-snapshot.cl',
];
const stateNames = [
  '*SCREEN-WIDTH*', '*SCREEN-HEIGHT*',
  'SMALL-IMAGE-SCREEN-WIDTH', 'SMALL-IMAGE-SCREEN-HEIGHT',
  '*PIC-WIDE*', '*PIC-HIGH*',
  'A-WIDTH', 'B-WIDTH', 'C-WIDTH', 'D-WIDTH', 'E-WIDTH',
];

function repoPath(value, label) {
  assert(typeof value === 'string' && value.length > 0, label + ' is required');
  const full = resolve(ROOT, value);
  assert(inside(ROOT, full), label + ' must remain inside the repository');
  return full;
}

function relativePath(full) {
  const rel = relative(ROOT, full);
  assert(inside(ROOT, full), 'Source escaped repository: ' + full);
  return portable(rel);
}

function readBytes(value) {
  return readFileSync(repoPath(value, 'Source path'));
}

function readJson(value) {
  return JSON.parse(readBytes(value).toString('utf8').replace(/^\uFEFF/u, ''));
}

function parseArgs(argv) {
  const allowed = new Set([
    '--before-root', '--observer-root', '--after-root',
    '--mapped-root', '--prior-320-evidence', '--output',
  ]);
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
    process.stdout.write(
      'Usage: node research/tools/derive-canvas-size-evidence.mjs '
      + '--before-root <run> --observer-root <run> --after-root <run> '
      + '--mapped-root <directory> '
      + '--prior-320-evidence <json> --output <fresh-json>\n',
    );
    return null;
  }
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    assert(allowed.has(key) && value && !value.startsWith('--')
      && !Object.hasOwn(args, key), 'Invalid arguments; see --help');
    args[key] = value;
  }
  assert(Object.keys(args).length === allowed.size, 'Invalid arguments; see --help');
  return args;
}

const sources = new Map();
function bindFile(value) {
  const full = repoPath(value, 'Source path');
  const bytes = readFileSync(full);
  const record = {
    path: relativePath(full),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
  const old = sources.get(record.path);
  assert(!old || (old.sha256 === record.sha256 && old.bytes === record.bytes),
    'Source changed while deriving evidence: ' + record.path);
  sources.set(record.path, record);
  return { full, bytes, record };
}

function bindTree(value) {
  const base = repoPath(value, 'Tree path');
  assert(statSync(base).isDirectory(), 'Expected source directory: ' + value);
  const files = {};
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const full = resolve(directory, entry.name);
      assert(inside(base, full), 'Tree entry escaped its root');
      if (entry.isFile()) {
        const rel = relativePath(full);
        const record = bindFile(rel).record;
        files[portable(relative(directory, full))] = {
          bytes: record.bytes,
          sha256: record.sha256,
        };
      } else if (entry.isDirectory()) {
        walk(full);
      } else {
        throw new Error('Unsupported non-file tree entry: ' + full);
      }
    }
  };
  walk(base);
  return files;
}

function hashFile(value) {
  const bytes = readBytes(value);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function aa0Dimensions(value) {
  const bytes = readBytes(value);
  const firstLine = bytes.subarray(0, Math.min(bytes.length, 80))
    .toString('ascii').split(/\r?\n/u, 1)[0];
  const match = /^(\d+) (\d+) (\d+)$/u.exec(firstLine);
  assert(match, 'AA0 header is not a three-integer line: ' + value);
  return {
    width: Number(match[1]),
    height: Number(match[2]),
    headerValue: Number(match[3]),
  };
}

function runRecord(rootValue, expectedProbe = null) {
  const root = repoPath(rootValue, 'Run root');
  assert(statSync(root).isDirectory(), 'Run root does not exist: ' + rootValue);
  const rootRel = relativePath(root);
  const summaryPath = rootRel + '/summary.json';
  const summary = readJson(summaryPath);
  assert(summary.complete === true
    && summary.probeCompletionSatisfied === true
    && summary.mode === 'writer-stream-seed-1234'
    && summary.smallImage === false,
  'Run is incomplete or does not match the controlled writer-stream mode: ' + rootValue);
  if (expectedProbe === 'canvas-size') {
    assert(summary.requiredProbeOutputName === 'aaron-canvas-size-native-links.txt'
      && summary.requiredProbeEndMarker === 'END canvas-size-native-links'
      && summary.probeOutputNames.includes('aaron-canvas-size-native-links.txt'),
    'Observer summary does not bind the expected probe');
  } else if (expectedProbe === false) {
    assert(!summary.requiredProbeOutputName && !summary.preSceneProbeSha256,
      'Control run was instrumented');
  }
  const outputHashes = {};
  for (const name of outputNames) {
    const path = rootRel + '/capture/' + name;
    bindFile(path);
    outputHashes[name] = hashFile(path);
  }
  const sceneSources = {};
  for (const name of sceneSourceNames) {
    const path = rootRel + '/capture/' + name;
    bindFile(path);
    sceneSources[name] = hashFile(path);
  }
  bindFile(summaryPath);
  bindFile(rootRel + '/scene-state.json');
  for (const name of ['stdout.txt', 'stderr.txt']) {
    bindFile(rootRel + '/' + name);
  }
  const runtimeFiles = bindTree(rootRel + '/runtime');
  bindTree(rootRel + '/capture');
  const dimensions = aa0Dimensions(rootRel + '/capture/aa0');
  return {
    root: rootRel,
    runId: summary.runId,
    complete: summary.complete,
    probeCompletionSatisfied: summary.probeCompletionSatisfied,
    probe: expectedProbe === 'canvas-size' ? {
      requiredOutput: summary.requiredProbeOutputName,
      requiredEndMarker: summary.requiredProbeEndMarker,
      sourceSha256: summary.preSceneProbeSha256,
    } : null,
    mode: summary.mode,
    smallImage: summary.smallImage,
    runnerSha256: summary.runnerSha256,
    installerSha256: summary.installerSha256,
    registryPatchSha256: summary.registryPatchSha256,
    licensePatchSha256: summary.licensePatchSha256,
    dimensions,
    outputs: outputHashes,
    sceneSources,
    runtimeFiles,
  };
}

function equalHashes(records, names, field) {
  const result = {};
  for (const name of names) {
    const values = records.map((run) => run[field][name].sha256);
    assert(values.every((value) => value === values[0]),
      'Controls differ for ' + field + ' file ' + name);
    result[name] = records[0][field][name];
  }
  return result;
}

function runtimeInputComparison(runs) {
  const probeLoaderFiles = new Set([
    '.clinit.cl', 'clinit.cl', 'aaron-probe-loader.cl',
  ]);
  const names = [...new Set(runs.flatMap((run) => Object.keys(run.runtimeFiles)))]
    .sort();
  const changed = names.filter((name) => {
    const hashes = runs.map((run) => run.runtimeFiles[name]?.sha256 ?? null);
    return hashes.some((hash) => hash !== hashes[0]);
  });
  assert(changed.every((name) => probeLoaderFiles.has(name)),
    'Unexpected runtime copy differences: ' + changed.join(', '));
  const [before, observer, after] = runs;
  const beforeLoader = before.sceneSources[
    'scene-state-snapshot-writer-stream-seeded-1234.cl'
  ];
  const afterLoader = after.sceneSources[
    'scene-state-snapshot-writer-stream-seeded-1234.cl'
  ];
  const observerLoader = hashFile(
    observer.root + '/capture/aaron-probe-loader.cl',
  );
  assert(before.runtimeFiles['.clinit.cl']?.sha256 === beforeLoader.sha256
    && after.runtimeFiles['.clinit.cl']?.sha256 === afterLoader.sha256,
  'No-probe controls do not stage the expected scene loader');
  assert(observer.runtimeFiles['.clinit.cl']?.sha256 === observerLoader.sha256
    && observer.runtimeFiles['aaron-probe-loader.cl']?.sha256 === observerLoader.sha256
    && (!observer.runtimeFiles['clinit.cl']
      || observer.runtimeFiles['clinit.cl'].sha256 === observerLoader.sha256),
  'Observer runtime loader copies do not match the captured probe loader');
  return {
    unchangedRuntimeFiles: names.filter((name) => !probeLoaderFiles.has(name)),
    intentionalProbeLoaderDifferences: changed,
    noProbeControlsUseSceneLoader: true,
    observerLoaderCopiesMatchCapturedLoader: true,
  };
}

function eventChunk(trace, marker) {
  const start = trace.indexOf(marker);
  assert(start >= 0, 'Missing trace event: ' + marker);
  const next = /\nTRACE-(?:ENTER|EXIT|ERROR|OVERFLOW)\b/gu;
  next.lastIndex = start + marker.length;
  const match = next.exec(trace);
  return trace.slice(start, match ? match.index : trace.length);
}

function bindingValue(chunk, name) {
  const escaped = name.replace(/[.*+?^$|(){}[\]\\]/gu, '\\$&');
  const pattern = new RegExp(
    '\\(:SYMBOL\\s+\\(:SYMBOL\\s+"COMMON-GRAPHICS-USER"\\s+"'
      + escaped
      + '"\\)\\s+:BOUND\\s+(T|NIL)'
      + '(?:\\s+:TYPE\\s+[A-Z-]+\\s+:SHAPE\\s+NIL\\s+:VALUE\\s+(-?\\d+))?',
    'u',
  );
  const match = pattern.exec(chunk);
  assert(match, 'Missing binding summary for ' + name);
  return match[1] === 'T' ? Number(match[2]) : null;
}

function traceBoundary(tracePath) {
  bindFile(tracePath);
  const trace = readBytes(tracePath).toString('utf8').replace(/^\uFEFF/u, '');
  const markers = {
    setupEntry: 'TRACE-ENTER 1 DEPTH 0 NAME SET-UP-SCREEN-SIZE',
    setupExit: 'TRACE-EXIT 2 DEPTH 0 NAME SET-UP-SCREEN-SIZE',
    selectEntry: 'TRACE-ENTER 12 DEPTH 5 NAME SELECT-CANVAS',
    selectExit: 'TRACE-EXIT 15 DEPTH 5 NAME SELECT-CANVAS',
  };
  const chunks = Object.fromEntries(Object.entries(markers).map(([key, marker]) => [
    key, eventChunk(trace, marker),
  ]));
  const state = Object.fromEntries(Object.entries(chunks).map(([key, chunk]) => [
    key,
    Object.fromEntries(stateNames.map((name) => [name, bindingValue(chunk, name)])),
  ]));
  const squareSelector = /:SYMBOL\s+"ACLWIN"\s+"SQUARE"/u.test(chunks.selectEntry);
  assert(squareSelector, 'SELECT-CANVAS input is not the captured ACLWIN::SQUARE symbol');
  return { state, selectCanvasInput: 'ACLWIN::SQUARE' };
}

function probeSummary(root) {
  const path = relativePath(resolve(repoPath(root, 'Run root'),
    'capture/aaron-canvas-size-native-links.txt'));
  bindFile(path);
  const lines = readBytes(path).toString('utf8').replace(/^\uFEFF/u, '')
    .split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  assert(lines[0] === 'BEGIN canvas-size-native-links'
    && lines.at(-1) === 'END canvas-size-native-links',
  'Observer terminal marker is missing or not the final line');
  assert(lines.includes('READY canvas-size-native-links')
    && lines.includes('NATIVE-CAPTURE-WAIT released=T')
    && lines.includes('SUMMARY functions=2 errors=0 truncated=0')
    && !lines.some((line) => line.startsWith('ERROR ')),
  'Observer metadata or pause/release handshake is incomplete');
  const names = lines.filter((line) => line.startsWith('FUNCTION name='))
    .map((line) => /^FUNCTION name="([^"]+)"/u.exec(line)?.[1]);
  assert(names.length === 2
    && names.includes('SET-UP-SCREEN-SIZE')
    && names.includes('SELECT-CANVAS'),
  'Observer did not report exactly the two selected compiled functions');
  const constantCounts = {};
  for (const name of names) {
    const line = lines.find((candidate) => candidate.startsWith(
      'CONSTANT-COUNT name="' + name + '" ',
    ));
    const match = line && /count=(\d+)/u.exec(line);
    assert(match, 'Missing function constant count for ' + name);
    constantCounts[name] = Number(match[1]);
  }
  return { functions: names, constantCounts, errors: 0, truncated: 0 };
}

function revalidatePrior320(evidencePath) {
  bindFile(evidencePath);
  const evidence = readJson(evidencePath);
  assert(evidence.schemaVersion === 1
    && evidence.status === 'complete'
    && evidence.result?.observedCanvas?.width === 320
    && evidence.result?.observedCanvas?.height === 480
    && evidence.controls?.outputsByteIdenticalAcrossAllThree === true
    && evidence.controls?.sceneSourcesByteIdenticalAcrossAllThree === true,
  'Prior 320x480 evidence is not complete and control-matched');
  assert(Array.isArray(evidence.sources) && evidence.sources.length > 0,
    'Prior 320x480 evidence has no source closure');
  for (const source of evidence.sources) {
    const measured = bindFile(source.path).record;
    assert(measured.bytes === source.bytes && measured.sha256 === source.sha256,
      'Prior 320 source hash mismatch: ' + source.path);
  }
  const runs = evidence.runs.map((run) => runRecord(run.path));
  assert(runs.length === 3 && runs.every((run) => (
    run.dimensions.width === 320 && run.dimensions.height === 480
  )), 'Prior 320x480 control set no longer matches its source-bound claim');
  equalHashes(runs, outputNames, 'outputs');
  equalHashes(runs, sceneSourceNames, 'sceneSources');
  const observer = runs.find((run) => /observer/u.test(run.runId));
  assert(observer, 'Prior 320x480 observer run is missing');
  const tracePath = observer.root + '/capture/aaron-planning-call-trace.txt';
  const trace = traceBoundary(tracePath);
  return {
    evidencePath: relativePath(repoPath(evidencePath, 'Prior evidence')),
    evidenceStatus: evidence.status,
    runs,
    trace,
    controls: {
      outputsByteIdenticalAcrossAllThree: true,
      sceneSourcesByteIdenticalAcrossAllThree: true,
      outputFiles: outputNames,
      sourceFiles: sceneSourceNames,
      revalidatedOriginalSources: evidence.sources.length,
    },
  };
}

function staticAnalysis(mappedRootValue) {
  const mappedRoot = relativePath(repoPath(mappedRootValue, 'Mapped root'));
  const mapPath = mappedRoot + '/native-code-map.json';
  bindFile(mapPath);
  const map = readJson(mapPath);
  const oldGhidraRoot =
    'research/extracted/local-oracle/external-runs/'
    + 'canvas-size-native-observer-20261013-a/native-code/mapped';
  const oldGhidraReports = oldGhidraRoot + '/ghidra';
  const names = ['SET-UP-SCREEN-SIZE', 'SELECT-CANVAS'];
  assert(map.schemaVersion === 1 && map.pll.sha256 ===
    '7ffc7dc9e3e62b1c5ba3612630b8747778324fa674dac42916be3e90bb96504c',
  'Unexpected live native map or archived PLL');
  const functions = {};
  const peDirs = {
    'SET-UP-SCREEN-SIZE': 'research/artifacts/rea-tools/canvas-size-setup-20261013',
    'SELECT-CANVAS': 'research/artifacts/rea-tools/canvas-size-select-20261013',
  };
  const reaDirs = {
    'SET-UP-SCREEN-SIZE': 'research/artifacts/rea-tools/canvas-size-setup-rea-function-20261013',
    'SELECT-CANVAS': 'research/artifacts/rea-tools/canvas-size-select-rea-function-20261013',
  };
  for (const name of names) {
    const mapped = map.functions.find((fn) => fn.name === name);
    assert(mapped?.uniqueCompleteObjectByteMatch === true,
      'Live native function lacks a unique complete PLL match: ' + name);
    const payloadPath = mappedRoot + '/' + mapped.payloadFile;
    const payload = bindFile(payloadPath);
    assert(payload.record.bytes === mapped.payloadBytes
      && payload.record.sha256 === mapped.payloadSha256,
    'Live native payload differs from its mapping: ' + name);
    const peDir = peDirs[name];
    const reaDir = reaDirs[name];
    bindTree(peDir);
    bindTree(reaDir);
    const stem = name.toLowerCase();
    const peBinding = readJson(peDir + '/' + stem + '.binding.json');
    const invocation = readJson(reaDir + '/rea-invocation.json');
    const resultPath = reaDir + '/rea-result.json';
    const resultSource = bindFile(resultPath).record;
    const result = readJson(resultPath);
    const normalized = result.normalized_result;
    assert(peBinding.originalPayload?.sha256 === mapped.payloadSha256
      && peBinding.originalPayload?.bytes === mapped.payloadBytes,
    'Static PE binding does not point at the newly verified native payload: ' + name);
    assert(invocation.staticOnly === true && invocation.inputWasExecuted === false
      && invocation.input?.sha256 === peBinding.generatedPe?.sha256,
    'REA query was not recorded as static-only for the bound PE: ' + name);
    assert(invocation.report?.path === 'rea-result.json'
      && invocation.report?.sha256 === resultSource.sha256
      && invocation.report?.bytes === resultSource.bytes,
    'REA invocation does not bind the saved function report: ' + name);
    const toolchain = bindFile(invocation.toolchain?.path).record;
    assert(invocation.toolchain?.sha256 === toolchain.sha256,
      'REA invocation does not bind its current toolchain file: ' + name);
    assert(normalized?.procedure?.name === name.replaceAll('-', '_'),
      'REA did not decode the mapped function: ' + name);
    const ghidraPath = oldGhidraReports + '/' + stem + '.ghidra.json';
    bindFile(ghidraPath);
    const ghidra = readJson(ghidraPath);
    assert(ghidra.subject?.sha256 === mapped.payloadSha256
      && ghidra.functionName === name
      && ghidra.decompilation?.completed === true,
    'Ghidra report does not decode the newly verified native payload: ' + name);
    const assembly = Array.isArray(normalized.assembly) ? normalized.assembly : [];
    const indirectCalls = assembly.filter((line) => /:\s*CALL\s+(?:dword ptr\s+\[|EDI\b)/iu.test(line));
    functions[name] = {
      liveEntry: mapped.runtime.entry,
      livePayloadBytes: mapped.payloadBytes,
      livePayloadSha256: mapped.payloadSha256,
      completeUniquePllObjectMatch: true,
      ghidraInstructionCount: Array.isArray(ghidra.disassembledInstructions)
        ? ghidra.disassembledInstructions.length : ghidra.disassembledInstructions,
      ghidraDecompilationCompleted: ghidra.decompilation.completed,
      reaVersion: invocation.reaVersion,
      reaInputWasExecuted: false,
      reaInstructionCount: assembly.length,
      reaBasicBlockCount: Array.isArray(normalized.basic_blocks)
        ? normalized.basic_blocks.length : null,
      reaIndirectCallSiteCount: indirectCalls.length,
      reaIndirectCallSiteExamples: indirectCalls.slice(0, 5),
      limitations: normalized.limitations,
    };
  }
  bindTree(oldGhidraRoot);
  for (const path of [
    'research/tools/prepare-rea-payload-pe.mjs',
    'research/tools/invoke-rea-ghidra-query.ps1',
    'research/tools/map-native-code-to-pll.mjs',
    'research/tools/capture-aaron-native-code.ps1',
    'research/oracle/run-local-scene-state-required-probe.ps1',
    'research/introspection/canvas-size-native-links.cl',
  ]) bindFile(path);
  return {
    mapPath,
    pllSha256: map.pll.sha256,
    functions,
    generatedPeWasExecuted: false,
    conclusion: 'REA 6.4 decoded exact bodies and CFGs, but the screen/context calls remain indirect runtime dispatch; this does not name the OS API, identify an original caller, or recover Lisp source/ABI.',
  };
}

export function deriveCanvasSizeEvidence({
  beforeRoot, observerRoot, afterRoot, mappedRoot, prior320Evidence,
}) {
  const before = runRecord(beforeRoot, false);
  const observer = runRecord(observerRoot, 'canvas-size');
  const after = runRecord(afterRoot, false);
  const currentRuns = [before, observer, after];
  assert(currentRuns.every((run) => run.dimensions.width === 768
    && run.dimensions.height === 1080),
  'Current controlled captures are not all 768x1080');
  assert(currentRuns.every((run) => (
    run.mode === before.mode
    && run.runnerSha256 === before.runnerSha256
    && run.installerSha256 === before.installerSha256
    && run.registryPatchSha256 === before.registryPatchSha256
    && run.licensePatchSha256 === before.licensePatchSha256
  )), 'Current control/observer source configurations differ');
  const runtimeInputs = runtimeInputComparison(currentRuns);
  const equalOutputs = equalHashes(currentRuns, outputNames, 'outputs');
  const equalSceneSources = equalHashes(currentRuns, sceneSourceNames, 'sceneSources');
  const observerTracePath = observer.root + '/capture/aaron-planning-call-trace.txt';
  const currentTrace = traceBoundary(observerTracePath);
  const probe = probeSummary(observer.root);
  const probeSource = bindFile('research/introspection/canvas-size-native-links.cl').record;
  assert(observer.probe?.sourceSha256 === probeSource.sha256,
    'Observer summary does not bind the checked-in probe');
  const prior320 = revalidatePrior320(prior320Evidence);
  const setupEntry320 = prior320.trace.state.setupEntry;
  const setupEntry768 = currentTrace.state.setupEntry;
  assert(JSON.stringify(setupEntry320) === JSON.stringify(setupEntry768),
    'SET-UP-SCREEN-SIZE entry state changed between the measured regimes');
  const priorObserver = prior320.runs.find((run) => /observer/u.test(run.runId));
  assert(priorObserver
    && priorObserver.runnerSha256 === observer.runnerSha256
    && priorObserver.installerSha256 === observer.installerSha256
    && priorObserver.registryPatchSha256 === observer.registryPatchSha256
    && priorObserver.licensePatchSha256 === observer.licensePatchSha256,
  'The 320 and 768 captures do not share runner, installer, and compatibility-patch hashes');
  const staticReport = staticAnalysis(mappedRoot);
  const priorPath = 'research/introspection/evidence/buffer-hole-native-investigation-20261013.json';
  bindFile(priorPath);
  bindFile('research/tools/derive-canvas-size-evidence.mjs');
  const sourcesOut = [...sources.values()].sort((a, b) => a.path.localeCompare(b.path));
  return {
    schemaVersion: 1,
    status: 'measured',
    investigation: 'canvas-size-screen-context-20261013',
    claimScope: 'Two source-bound writer-stream-seed-1234 regimes, with a complete native metadata observer and fresh no-probe controls for the current 768x1080 regime.',
    result: {
      regimes: {
        '320x480': {
          sourceEvidence: relativePath(repoPath(prior320Evidence, 'Prior evidence')),
          observerRunId: priorObserver.runId,
          trace: prior320.trace,
          outputsAndSceneSourcesMatchControls: true,
        },
        '768x1080': {
          observerRunId: observer.runId,
          trace: currentTrace,
          outputsAndSceneSourcesMatchControls: true,
        },
      },
      firstObservedBoundaryDifference: {
        function: 'SET-UP-SCREEN-SIZE',
        entryStateIdentical: true,
        entryState: setupEntry768,
        after320: prior320.trace.state.setupExit,
        after768: currentTrace.state.setupExit,
        scope: 'The probe samples function boundaries only; it does not identify which internal instruction or external API produced the change.',
      },
      selectCanvas: {
        input: currentTrace.selectCanvasInput,
        after320: prior320.trace.state.selectExit,
        after768: currentTrace.state.selectExit,
        scope: 'The same observed ACLWIN::SQUARE argument leads to different recorded canvas widths in the two regimes; this is a bounded observation, not a general selection rule.',
      },
      currentControls: {
        runIds: currentRuns.map((run) => run.runId),
        outputsByteIdenticalAcrossAllThree: true,
        sceneSourcesByteIdenticalAcrossAllThree: true,
        equalOutputs,
        equalSceneSources,
        runtimeInputs,
        probe,
      },
      prior320Controls: prior320.controls,
      sameHarnessAcrossRegimes: {
        mode: observer.mode,
        smallImage: observer.smallImage,
        runnerSha256: observer.runnerSha256,
        installerSha256: observer.installerSha256,
        registryPatchSha256: observer.registryPatchSha256,
        licensePatchSha256: observer.licensePatchSha256,
      },
      nativeStaticAnalysis: staticReport,
      JavaScriptContractsAdded: 0,
      wholePaintingParityClaimed: false,
    },
    limitations: [
      'The difference between 320x480 and 768x1080 remains unexplained, including the earlier 320x480 result on a reported 1920x1080 desktop.',
      'SET-UP-SCREEN-SIZE and SELECT-CANVAS were observed at wrapped boundaries; a direct caller is not established.',
      'REA and Ghidra output is static disassembly/decompilation of exact mapped payloads, not original Lisp source or ABI recovery.',
      'The current evidence adds no JavaScript contract and does not claim painting parity.',
    ],
    sources: sourcesOut,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) return;
  const output = repoPath(args['--output'], 'Output path');
  assert(inside(resolve(ROOT, 'research/introspection/evidence'), output)
    && !existsSync(output),
  'Output must be fresh under research/introspection/evidence');
  const evidence = deriveCanvasSizeEvidence({
    beforeRoot: args['--before-root'],
    observerRoot: args['--observer-root'],
    afterRoot: args['--after-root'],
    mappedRoot: args['--mapped-root'],
    prior320Evidence: args['--prior-320-evidence'],
  });
  const bytes = Buffer.from(JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  writeFileSync(output, bytes, { flag: 'wx' });
  process.stdout.write(JSON.stringify({
    output: relativePath(output),
    sha256: sha256(bytes),
    bytes: bytes.length,
    sourceCount: evidence.sources.length,
    currentCanvas: evidence.result.regimes['768x1080'].trace.state.selectExit['*PIC-WIDE*'],
    priorCanvas: evidence.result.regimes['320x480'].trace.state.selectExit['*PIC-WIDE*'],
    contractsAdded: evidence.result.JavaScriptContractsAdded,
  }, null, 2) + '\n');
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(String(error.stack || error) + '\n');
    process.exitCode = 1;
  }
}
