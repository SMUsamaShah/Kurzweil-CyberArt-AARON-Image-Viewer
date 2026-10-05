#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual as same } from 'node:util';
import { mapCapturedFunctions } from './map-native-code-to-pll.mjs';
import { sha256 } from './index-allegro-image.mjs';

const PROJECT_ROOT = resolve('.');
const LOCAL_ORACLE_ROOT = resolve('research/extracted/local-oracle');
const EXPECTED_MODE = 'writer-stream-seed-1234';
const RELEASE_MARKER = 'Native code snapshot parent finished';
const EXPECTED_REA_VERSION = '3.2.1';
const NATIVE_ROOTS = [
  {
    root: 'research/extracted/local-oracle/brush-buffer-predicate-native-seed1234-20261006-a',
    runId: 'brush-buffer-predicate-native-seed1234-20261006-a',
    probeSource: 'research/introspection/brush-buffer-predicate-native-links.cl',
    probeOutput: 'aaron-brush-buffer-predicate-native-links.txt',
    reportHeader: 'brush-buffer-predicate-native-links',
    functions: ['FOOB', 'ZERO-EDGE'],
  },
];
const CONTROL_ROOT = 'research/extracted/local-oracle/brush-buffer-predicate-native-control-seed1234-20261006-b';
const SHARED_SOURCE_FILES = [
  'research/oracle/run-local-scene-state.ps1',
  'research/tools/capture-aaron-native-code.ps1',
  'research/tools/map-native-code-to-pll.mjs',
  'research/tools/index-allegro-image.mjs',
  'research/tools/rea-evidence-bundle.mjs',
  'research/tools/run-aaron-ghidra.ps1',
  'research/tools/ghidra/AaronNativeReport.java',
  'research/artifacts/rea-tools/toolchain.json',
];
const REA_USED_FILES = [
  'package.json',
  'scripts/rea.mjs',
  'dist/domain/evidence.js',
  'dist/domain/analysisProfile.js',
  'dist/domain/evidenceBundle.js',
  'dist/application/EvidenceLedger.js',
  'dist/application/EvidenceBundleFiles.js',
  'dist/cliEvidenceCommands.js',
  'dist/application/EvidenceBundleCommands.js',
];

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha = bytes => sha256(bytes);
const parseJson = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
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
  const digest = sha(bytes);
  const previous = sources.get(rel);
  assert(!previous || (previous.sha256 === digest && previous.bytes === bytes.length),
    `${label} changed during evidence processing`);
  sources.set(rel, { path: rel, sha256: digest, bytes: bytes.length });
  return bytes;
}

function expectKeys(object, keys, label) {
  assert(object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key)),
  `${label} fields differ`);
  return object;
}

function hexSha(value, label) {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value), `${label} is not a SHA-256`);
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
  assert(!result.error && result.status === 0, `${label} is not covered by the workspace ignore rules`);
}

function parseArgs(args) {
  let output = null;
  let reaPackage = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--output' || arg === '--rea-package') {
      const value = args[index + 1];
      assert(value && !value.startsWith('--'), `${arg} requires a path`);
      if (arg === '--output') output = value;
      else reaPackage = value;
      index += 1;
    } else if (arg.startsWith('--output=')) output = arg.slice('--output='.length);
    else if (arg.startsWith('--rea-package=')) reaPackage = arg.slice('--rea-package='.length);
    else throw new Error(`Unknown option ${arg}`);
  }
  return { help: false, output, reaPackage };
}

function readNativeRun(config) {
  const root = resolve(config.root);
  assert(within(LOCAL_ORACLE_ROOT, root) && basename(root) === config.runId,
    `${config.runId} is outside its named local-oracle root`);
  const summaryBytes = trackedRead(resolve(root, 'summary.json'), `${config.runId} summary`);
  const summary = parseJson(summaryBytes);
  assert(summary.complete === true && summary.runId === config.runId
    && summary.mode === EXPECTED_MODE && summary.smallImage === false,
  `${config.runId} is incomplete or is not a full-size seed-1234 writer-stream run`);
  for (const key of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    summary[key] = hexSha(summary[key], `${config.runId} ${key}`);
  }
  const aa0 = trackedRead(resolve(root, 'capture/aa0'), `${config.runId} AA0`);
  const scene = trackedRead(resolve(root, 'capture/aaron-scene-state-snapshot.txt'), `${config.runId} scene report`);
  const aa0Sha256 = sha(aa0);
  const sceneSha256 = sha(scene);
  assert(aa0Sha256 === hexSha(summary.aa0Sha256, `${config.runId} summary AA0`)
    && sceneSha256 === hexSha(summary.sceneReportSha256, `${config.runId} summary scene report`),
  `${config.runId} summary hashes do not bind the captured drawing/scene files`);

  const requestBytes = trackedRead(resolve(root, 'pre-scene-probe-request.json'), `${config.runId} probe request`);
  const request = parseJson(requestBytes);
  expectKeys(request, ['schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256',
    'pauseSeconds', 'releaseFile', 'probeOutputNames'], `${config.runId} request`);
  assert(request.schemaVersion === 1 && request.runId === config.runId
    && request.pauseSeconds === 90 && summary.preSceneProbePauseSeconds === 90
    && request.releaseFile === 'C:\\temp\\aaron-native-code-release.txt',
  `${config.runId} request identity/pause/release policy differs`);
  equalArray(request.probeOutputNames, [config.probeOutput], `${config.runId} request output names`);
  equalArray(summary.probeOutputNames, request.probeOutputNames, `${config.runId} summary output names`);

  const runtime = resolve(root, 'runtime/AARON.exe');
  assert(resolve(request.runtimeExecutable).toLowerCase() === runtime.toLowerCase(),
    `${config.runId} request runtime is not its owned AARON.exe`);
  const executableBytes = trackedRead(runtime, `${config.runId} executable`);
  const pll = trackedRead(resolve(root, 'runtime/AARON.pll'), `${config.runId} AARON.pll`);
  const probeSource = trackedRead(config.probeSource, `${config.runId} current probe source`);
  const stagedProbe = trackedRead(resolve(root, 'capture/aaron-pre-scene-probe.cl'), `${config.runId} staged probe`);
  const requestProbeSha256 = hexSha(request.probeSha256, `${config.runId} request probe hash`);
  const summaryProbeSha256 = hexSha(summary.preSceneProbeSha256, `${config.runId} summary probe hash`);
  assert(probeSource.equals(stagedProbe) && sha(probeSource) === requestProbeSha256
    && requestProbeSha256 === summaryProbeSha256,
  `${config.runId} current/staged/request/summary probe source bindings differ`);
  const loader = trackedRead(resolve(root, 'capture/aaron-probe-loader.cl'), `${config.runId} probe loader`);
  assert(loader.toString('utf8').includes('load "C:\\\\temp\\\\aaron-pre-scene-probe.cl"'),
    `${config.runId} loader does not load the staged probe`);

  const release = trackedRead(resolve(root, 'capture/aaron-native-code-release.txt'), `${config.runId} release marker`);
  assert(release.toString('utf8').trim() === RELEASE_MARKER, `${config.runId} native capture release marker differs`);
  const links = trackedRead(resolve(root, `capture/${config.probeOutput}`), `${config.runId} metadata report`);
  const metadata = trackedRead(resolve(root, 'native-code/function-object-metadata.txt'), `${config.runId} function metadata`);
  assert(links.equals(metadata), `${config.runId} preserved metadata is not byte-identical to the probe output`);
  const manifestBytes = trackedRead(resolve(root, 'native-code/manifest.json'), `${config.runId} manifest`);
  const manifest = parseJson(manifestBytes);
  assert(manifest.schemaVersion === 1 && manifest.runtimeExecutable.toLowerCase() === runtime.toLowerCase()
    && hexSha(manifest.metadataSha256, `${config.runId} manifest metadata hash`) === sha(metadata),
  `${config.runId} native manifest does not bind its runtime and raw metadata report`);
  assert(Array.isArray(manifest.functions) && manifest.functions.length === config.functions.length
    && same(manifest.functions.map(fn => fn.name), config.functions),
  `${config.runId} manifest target names/order differ from the requested capture`);
  const metadataSummary = validateMetadataReport(metadata, config, manifest.functions);
  assert(metadataSummary.headers.length === manifest.functions.length
    && metadataSummary.headers.every((header, index) => {
      const manifestFunction = manifest.functions[index];
      const bytes = Buffer.from(header.bytesHex, 'hex');
      const entryCandidate = bytes.readUInt32LE(18);
      const taggedVectorCandidate = bytes.readUInt32LE(30);
      return header.name === manifestFunction.name
        && header.bytesHex === manifestFunction.functionObjectHeaderHex
        && entryCandidate === parseAddress(manifestFunction.entryCandidate, `${header.name} manifest entry candidate`)
        && taggedVectorCandidate === parseAddress(manifestFunction.taggedVectorCandidate, `${header.name} tagged vector candidate`)
        && taggedVectorCandidate - 2 === parseAddress(manifestFunction.vectorBaseCandidate, `${header.name} vector base candidate`)
        && (taggedVectorCandidate & 7) === 2;
    }),
  `${config.runId} manifest pointers or function headers differ from the captured metadata report`);

  return {
    config, root, summary, summarySha256: sha(summaryBytes), request, requestSha256: sha(requestBytes),
    requestProbeSha256, aa0, aa0Sha256, scene, sceneSha256, runtime, executableBytes, executableSha256: sha(executableBytes),
    pll, pllSha256: sha(pll), probeSourceSha256: sha(probeSource), stagedProbeSha256: sha(stagedProbe),
    loaderSha256: sha(loader), releaseSha256: sha(release), linksSha256: sha(links), metadataSha256: sha(metadata),
    metadataSummary, manifest, manifestBytes, manifestSha256: sha(manifestBytes),
  };
}

function validateMetadataReport(bytes, config, manifestFunctions) {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), `${config.runId} metadata report is not valid round-trip UTF-8`);
  const normalized = text.replace(/^\uFEFF/u, '').replace(/\r\n/gu, '\n').replace(/\r/gu, '\n');
  const lines = normalized.split('\n');
  while (lines.at(-1) === '') lines.pop();
  assert(lines[0] === `BEGIN ${config.reportHeader}` && lines.at(-1) === `END ${config.reportHeader}`,
    `${config.runId} metadata framing differs`);

  const startPattern = /^(BEGIN|LIMITS|HELPERS|TARGET|ARGLIST|HEADER|CONSTANT-COUNT|CONSTANT|TOTALS|ERROR-COUNT|TRUNCATION-COUNT|END)\b/u;
  const logicalRecords = [];
  for (const line of lines) {
    const match = startPattern.exec(line);
    if (match) logicalRecords.push({ kind: match[1], firstLine: line, continuationLines: 0 });
    else {
      assert(logicalRecords.length > 0, `${config.runId} metadata has an unowned continuation line`);
      logicalRecords.at(-1).continuationLines += 1;
    }
  }
  const byKind = kind => logicalRecords.filter(record => record.kind === kind);
  assert(byKind('LIMITS').length === 1
    && byKind('LIMITS')[0].firstLine === 'LIMITS targets=2 header-bytes=64 max-constant-count=65536 constants-per-function=4096',
  `${config.runId} metadata bounds differ from the frozen two-target probe`);
  assert(byKind('HELPERS').length === 1
    && byKind('HELPERS')[0].firstLine === 'HELPERS owner=#<The COMMON-GRAPHICS-USER package> arglist=ARGLIST count=EXCL::FUNCTION-CONSTANT-COUNT constant=EXCL::FUNCTION-CONSTANT memref=SYSTEM:MEMREF',
  `${config.runId} metadata helper availability differs from the frozen probe`);
  const targets = byKind('TARGET').map(record => {
    const match = /^TARGET name="([A-Z0-9-]+)" type=COMPILED-FUNCTION$/u.exec(record.firstLine);
    assert(match, `${config.runId} has a malformed TARGET logical record`);
    return match[1];
  });
  assert(same(targets, config.functions), `${config.runId} metadata target order differs from its manifest`);
  assert(byKind('BEGIN').length === 1 && byKind('LIMITS').length === 1 && byKind('HELPERS').length === 1
    && byKind('ARGLIST').length === config.functions.length && byKind('HEADER').length === config.functions.length
    && byKind('CONSTANT-COUNT').length === config.functions.length && byKind('TOTALS').length === 1
    && byKind('ERROR-COUNT').length === 1 && byKind('TRUNCATION-COUNT').length === 1 && byKind('END').length === 1,
  `${config.runId} metadata logical-record counts differ`);
  const constantCounts = byKind('CONSTANT-COUNT').map(record => {
    const match = /^CONSTANT-COUNT name="([A-Z0-9-]+)" count=(\d+)$/u.exec(record.firstLine);
    assert(match, `${config.runId} has a malformed CONSTANT-COUNT logical record`);
    return { name: match[1], count: Number(match[2]) };
  });
  assert(same(constantCounts, [{ name: 'FOOB', count: 2 }, { name: 'ZERO-EDGE', count: 12 }]),
    `${config.runId} CONSTANT-COUNT names/order differ`);
  const expectedKinds = ['BEGIN', 'LIMITS', 'HELPERS'];
  for (const row of constantCounts) {
    expectedKinds.push('TARGET', 'ARGLIST', 'HEADER', 'CONSTANT-COUNT', ...Array(row.count).fill('CONSTANT'));
  }
  expectedKinds.push('TOTALS', 'ERROR-COUNT', 'TRUNCATION-COUNT', 'END');
  assert(same(logicalRecords.map(record => record.kind), expectedKinds),
    `${config.runId} metadata logical-record order differs from the frozen probe`);
  const arglists = byKind('ARGLIST').map(record => {
    const match = /^ARGLIST name="([A-Z0-9-]+)" values=(.+)$/u.exec(record.firstLine);
    assert(match && record.continuationLines === 0, `${config.runId} has a malformed or wrapped ARGLIST record`);
    return { name: match[1], values: match[2] };
  });
  assert(same(arglists, [
    { name: 'FOOB', values: '((COMMON-GRAPHICS-USER::X COMMON-GRAPHICS-USER::Y) T)' },
    { name: 'ZERO-EDGE', values: '((COMMON-GRAPHICS-USER::START COMMON-GRAPHICS-USER::PERIM) T)' },
  ]), `${config.runId} target argument lists differ from the frozen probe capture`);
  const constants = byKind('CONSTANT').map(record => {
    const match = /^CONSTANT name="([A-Z0-9-]+)" index=(\d+) value=(.*)$/u.exec(record.firstLine);
    assert(match, `${config.runId} has a malformed CONSTANT record`);
    return { name: match[1], index: Number(match[2]), printedValue: match[3], continuationLines: record.continuationLines };
  });
  let constantCursor = 0;
  for (const row of constantCounts) {
    const functionConstants = constants.slice(constantCursor, constantCursor + row.count);
    assert(functionConstants.length === row.count && functionConstants.every((item, index) =>
      item.name === row.name && item.index === index),
    `${config.runId} ${row.name} metadata constants are incomplete or out of order`);
    constantCursor += row.count;
  }
  const expectedConstants = [
    ['FOOB', 0, '(:SYMBOL "COMMON-GRAPHICS-USER" "*PIC-WIDE*")'],
    ['FOOB', 1, '(:SYMBOL "COMMON-GRAPHICS-USER" "*PIC-HIGH*")'],
    ...['START', 'X', 'Y', 'Z', 'XINCS'].map((name, index) =>
      ['ZERO-EDGE', index, `(:SYMBOL "COMMON-GRAPHICS-USER" "${name}")`]),
    ['ZERO-EDGE', 5, '(:SYMBOL "COMMON-LISP" "NTHCDR")'],
    ['ZERO-EDGE', 6, '(:SYMBOL "COMMON-GRAPHICS-USER" "YINCS")'],
    ['ZERO-EDGE', 7, '(:SYMBOL "COMMON-GRAPHICS-USER" "FOOB")'],
    ['ZERO-EDGE', 8, '(:SYMBOL "COMMON-GRAPHICS-USER" "FILL-MAP")'],
    ['ZERO-EDGE', 9, '(:SYMBOL "COMMON-LISP" "AREF")'],
    ['ZERO-EDGE', 10, '(:SYMBOL "COMMON-GRAPHICS-USER" "MAKE-TRIPT")'],
    ['ZERO-EDGE', 11, '(:SYMBOL "COMMON-LISP" "MOD")'],
  ];
  assert(same(constants.map(item => [item.name, item.index, item.printedValue]), expectedConstants),
    `${config.runId} target constant names/packages/order differ from the captured predicate metadata`);
  assert(constants.every(item => item.continuationLines === 0),
    `${config.runId} a predicate constant record wrapped unexpectedly`);
  const totalLine = byKind('TOTALS')[0].firstLine;
  const totalsMatch = /^TOTALS targets=(\d+) functions=(\d+) headers=(\d+) constants=(\d+) errors=(\d+) truncations=(\d+)$/u.exec(totalLine);
  assert(totalsMatch, `${config.runId} has malformed metadata TOTALS`);
  const reported = {
    targets: Number(totalsMatch[1]), functions: Number(totalsMatch[2]), headers: Number(totalsMatch[3]),
    constants: Number(totalsMatch[4]), errors: Number(totalsMatch[5]), truncations: Number(totalsMatch[6]),
  };
  const constantRecordCount = byKind('CONSTANT').length;
  const declaredConstantCount = constantCounts.reduce((sum, item) => sum + item.count, 0);
  assert(reported.targets === config.functions.length && reported.functions === config.functions.length
    && reported.headers === config.functions.length && reported.constants === declaredConstantCount
    && constantRecordCount === declaredConstantCount && reported.errors === 0 && reported.truncations === 0,
  `${config.runId} metadata totals or top-level constant record counts differ`);
  assert(byKind('ERROR-COUNT')[0].firstLine === 'ERROR-COUNT 0'
    && byKind('TRUNCATION-COUNT')[0].firstLine === 'TRUNCATION-COUNT 0',
  `${config.runId} metadata reports errors or truncation`);

  const boundedNestedSummaries = byKind('CONSTANT').flatMap(record => {
    if (!record.firstLine.includes('(:TYPE CONS)')) return [];
    const match = /^CONSTANT name="([A-Z0-9-]+)" index=(\d+) value=/u.exec(record.firstLine);
    assert(match, `${config.runId} has an unidentifiable bounded nested constant summary`);
    return [{ functionName: match[1], index: Number(match[2]), marker: '(:TYPE CONS)' }];
  });
  const headers = byKind('HEADER').map(record => {
    const match = /^HEADER name="([A-Z0-9-]+)" bytes=([0-9a-f]{128})$/iu.exec(record.firstLine);
    assert(match, `${config.runId} has a malformed or non-64-byte HEADER logical record`);
    return { name: match[1], bytesHex: match[2].toLowerCase() };
  });
  return {
    logicalRecordCounts: Object.fromEntries(['TARGET', 'ARGLIST', 'HEADER', 'CONSTANT-COUNT', 'CONSTANT']
      .map(kind => [kind.toLowerCase().replace('-', ''), byKind(kind).length])),
    targetNames: targets,
    arglists,
    constants,
    headers,
    pointerCandidates: headers.map(header => {
      const bytes = Buffer.from(header.bytesHex, 'hex');
      const entryCandidate = bytes.readUInt32LE(18);
      const taggedVectorCandidate = bytes.readUInt32LE(30);
      return {
        name: header.name,
        entryCandidate: `0x${entryCandidate.toString(16)}`,
        taggedVectorCandidate: `0x${taggedVectorCandidate.toString(16)}`,
        vectorBaseCandidate: `0x${(taggedVectorCandidate - 2).toString(16)}`,
      };
    }),
    reportedTotals: reported,
    declaredConstantCounts: constantCounts,
    physicallyWrappedLogicalRecordCount: logicalRecords.filter(record => record.continuationLines > 0).length,
    boundedNestedSummaries,
    constantValueInterpretation: 'Raw metadata is byte-hashed and record-head counted. Nested printed cons summaries marked (:TYPE CONS) are depth-bounded and are not treated as complete constant lists.',
  };
}

function readControlRun(rootArg) {
  const root = resolve(rootArg);
  assert(within(LOCAL_ORACLE_ROOT, root) && basename(root) === 'brush-buffer-predicate-native-control-seed1234-20261006-b',
    'Control root is outside its named local-oracle directory');
  const summaryBytes = trackedRead(resolve(root, 'summary.json'), 'fresh control summary');
  const summary = parseJson(summaryBytes);
  assert(summary.complete === true && summary.runId === basename(root)
    && summary.mode === EXPECTED_MODE && summary.smallImage === false,
  'Fresh control is incomplete or does not match seed-1234 full-size mode');
  for (const key of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    summary[key] = hexSha(summary[key], `fresh control ${key}`);
  }
  assert(summary.preSceneProbeSha256 === null && summary.preSceneProbePauseSeconds === 0,
    'Fresh control contains pre-scene probe metadata');
  equalArray(summary.probeOutputNames, [], 'fresh control probe output names');
  for (const path of ['pre-scene-probe-request.json', 'capture/aaron-pre-scene-probe.cl',
    'capture/aaron-brush-buffer-predicate-native-links.txt',
    'capture/aaron-native-code-release.txt']) {
    assert(!existsSync(resolve(root, path)), `Fresh control contains probe artifact ${path}`);
  }
  const aa0 = trackedRead(resolve(root, 'capture/aa0'), 'fresh control AA0');
  const scene = trackedRead(resolve(root, 'capture/aaron-scene-state-snapshot.txt'), 'fresh control scene report');
  const runtime = resolve(root, 'runtime/AARON.exe');
  const executableBytes = trackedRead(runtime, 'fresh control executable');
  const pll = trackedRead(resolve(root, 'runtime/AARON.pll'), 'fresh control AARON.pll');
  const aa0Sha256 = sha(aa0);
  const sceneSha256 = sha(scene);
  assert(aa0Sha256 === hexSha(summary.aa0Sha256, 'fresh control summary AA0')
    && sceneSha256 === hexSha(summary.sceneReportSha256, 'fresh control summary scene report'),
  'Fresh control summary hashes do not bind the actual outputs');
  return {
    root, name: basename(root), summary, summarySha256: sha(summaryBytes), aa0, aa0Sha256,
    scene, sceneSha256, executableBytes, executableSha256: sha(executableBytes), pll, pllSha256: sha(pll),
  };
}

function validateSetupAndParity(nativeRuns, control) {
  assert(nativeRuns.length === 1, 'Predicate-native derivation requires exactly one instrumented run');
  for (const run of nativeRuns) {
    assert(run.summary.mode === control.summary.mode && run.summary.smallImage === control.summary.smallImage,
      `${run.config.runId}/control mode or SmallImage differs`);
    for (const key of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
      assert(run.summary[key] === control.summary[key], `${run.config.runId}/control ${key} differs`);
    }
    assert(run.aa0.equals(control.aa0) && run.scene.equals(control.scene),
      `${run.config.runId} differs from the fresh control AA0/scene bytes`);
    assert(run.executableSha256 === control.executableSha256 && run.pllSha256 === control.pllSha256,
      `${run.config.runId}/control runtime files differ`);
  }
}

function parseAddress(value, label) {
  assert(typeof value === 'string' && /^0x[0-9a-f]{1,8}$/iu.test(value), `${label} is not a 32-bit hexadecimal address`);
  return Number.parseInt(value.slice(2), 16);
}

function booleanRanges(coverage, selected) {
  const result = [];
  let start = -1;
  for (let index = 0; index <= coverage.length; index += 1) {
    const active = index < coverage.length && Boolean(coverage[index]) === selected;
    if (active && start < 0) start = index;
    if (!active && start >= 0) {
      result.push({ start, endExclusive: index, bytes: index - start });
      start = -1;
    }
  }
  return result;
}

function validateInstructionReport(run, fn, payload, reportBytes) {
  const report = parseJson(reportBytes);
  const entry = parseAddress(fn.runtime.entry, `${fn.name} mapped entry`);
  const payloadPath = resolve(run.root, 'native-code/mapped', fn.payloadFile);
  assert(report.schemaVersion === 1 && report.functionName === fn.name
    && report.entry === fn.runtime.entry && report.memoryBase === fn.runtime.entry,
  `${fn.name} Ghidra report function/entry/memory base differs from mapped object`);
  assert(report.ghidraVersion === '12.1.4' && report.languageId === 'x86:LE:32:default'
    && report.compilerSpecId === 'windows', `${fn.name} Ghidra x86/tool profile differs`);
  assert(report.subject?.format === 'raw' && report.subject.architecture === 'x86'
    && report.subject.bytes === payload.length && report.subject.sha256 === sha(payload)
    && resolve(report.subject.path).toLowerCase() === payloadPath.toLowerCase(),
  `${fn.name} Ghidra subject does not bind the exact mapped raw payload`);
  assert(report.decompilation?.completed === true && report.decompilation.error === ''
    && typeof report.decompilation.text === 'string', `${fn.name} Ghidra decompilation is incomplete`);
  assert(Array.isArray(report.assembly) && report.assembly.length > 0
    && report.disassembledInstructions === report.assembly.length,
  `${fn.name} Ghidra reachable-instruction rows are incomplete`);
  assert(Array.isArray(report.limitations) && report.limitations.some(item => typeof item === 'string'
    && /standalone ghidra raw import/i.test(item)), `${fn.name} report omits standalone-Ghidra limitation`);

  const coverage = new Uint8Array(payload.length);
  const spans = [];
  let comparedBytes = 0;
  let previousOffset = -1;
  for (const [index, instruction] of report.assembly.entries()) {
    assert(Number.isSafeInteger(instruction.offset) && instruction.offset >= 0
      && instruction.offset > previousOffset, `${fn.name} instruction ${index} offset/order is invalid`);
    previousOffset = instruction.offset;
    assert(typeof instruction.bytes === 'string' && /^[0-9a-f]{2,30}$/iu.test(instruction.bytes)
      && instruction.bytes.length % 2 === 0, `${fn.name} instruction ${index} has malformed byte text`);
    assert(typeof instruction.text === 'string' && instruction.text.length > 0
      && Array.isArray(instruction.flows), `${fn.name} instruction ${index} lacks decoded metadata`);
    const instructionBytes = Buffer.from(instruction.bytes, 'hex');
    const address = parseAddress(instruction.address, `${fn.name} instruction ${index} address`);
    assert(address === entry + instruction.offset
      && instruction.offset + instructionBytes.length <= payload.length,
    `${fn.name} instruction ${index} address/extent differs from payload`);
    assert(payload.subarray(instruction.offset, instruction.offset + instructionBytes.length).equals(instructionBytes),
      `${fn.name} instruction ${index} bytes differ from exact PLL payload`);
    for (let offset = instruction.offset; offset < instruction.offset + instructionBytes.length; offset += 1) {
      assert(coverage[offset] === 0, `${fn.name} instruction ${index} overlaps prior bytes at ${offset}`);
      coverage[offset] = 1;
      comparedBytes += 1;
    }
    spans.push({ start: instruction.offset, endExclusive: instruction.offset + instructionBytes.length });
  }
  assert(spans[0]?.start === 0, `${fn.name} disassembly does not begin at its mapped entry`);
  for (let index = 1; index < spans.length; index += 1) {
    assert(spans[index - 1].endExclusive <= spans[index].start,
      `${fn.name} instruction intervals overlap or go out of order`);
  }
  return {
    report, reportSha256: sha(reportBytes), instructionCount: report.assembly.length,
    instructionBytesCompared: comparedBytes, payloadBytes: payload.length,
    payloadInstructionCoveragePercent: Number((100 * comparedBytes / payload.length).toFixed(4)),
    instructionRanges: booleanRanges(coverage, true), uncoveredPayloadRanges: booleanRanges(coverage, false),
  };
}

function validateReaRecord(bundleBytes, exportBytes, importBytes, report,
  reportSha256, payload, payloadPath, payloadFile, label) {
  const bundle = parseJson(bundleBytes);
  const exported = parseJson(exportBytes);
  const importResult = parseJson(importBytes);
  const record = bundle.records?.[0];
  assert(bundle.records?.length === 1 && exported.records?.length === 1
    && same(bundle.records, exported.records), `${label} REA export differs from canonical bundle`);
  assert(importResult.imported === 1 && importResult.unknowns_added === 0 && importResult.total === 1,
    `${label} REA Evidence import result differs`);
  assert(record && /^ev_[0-9a-f]{64}$/iu.test(record.evidence_id), `${label} Evidence ID is malformed`);
  assert(record.provider?.id === 'ghidra-standalone' && record.provider.version === report.ghidraVersion
    && record.operation === 'standalone_ghidra_function_analysis'
    && record.authority === 'shipped-artifact' && record.confidence === 'observed',
  `${label} REA provider, operation, or authority metadata differs`);
  assert(record.subject?.digest?.sha256 === sha(payload) && record.subject.name === payloadFile
    && resolve(record.subject.local_path).toLowerCase() === payloadPath.toLowerCase(),
  `${label} REA subject does not bind the raw mapped payload`);
  assert(record.parameters?.rea_native_provider_session === false
    && record.parameters?.source_subject_format === 'raw'
    && record.normalized_result?.provenance?.rea_native_provider_session === false
    && record.normalized_result.provenance.source_report_sha256 === reportSha256
    && record.normalized_result.subject.reported_format === 'raw'
    && record.normalized_result.subject.evidence_format === 'unknown',
  `${label} REA provenance or raw-format limitation differs`);
  assert(same(record.raw_result, report), `${label} raw REA result differs from the Ghidra report`);
  const normalizedAssembly = report.assembly.map(({ address, bytes, flows, text }) => ({ address, bytes, flows, text }));
  assert(same(record.normalized_result.assembly, normalizedAssembly),
    `${label} normalized REA instruction rows differ from source report`);
  return {
    evidenceId: record.evidence_id,
    provider: { id: record.provider.id, name: record.provider.name, version: record.provider.version },
    operation: record.operation,
    nativeProviderSession: false,
    authority: record.authority,
    confidence: record.confidence,
    bundleSha256: sha(bundleBytes),
    canonicalExportSha256: sha(exportBytes),
    importResultSha256: sha(importBytes),
    importResult,
    sourceReportSha256: reportSha256,
  };
}

function resolvePackage(value) {
  const packageRoot = resolve(value ?? 'research/artifacts/rea-tools/rea-3.2.1/node_modules/rea-agents');
  const toolchainBytes = trackedRead('research/artifacts/rea-tools/toolchain.json', 'local native-analysis toolchain');
  const toolchain = parseJson(toolchainBytes);
  assert(toolchain.reaVersion === EXPECTED_REA_VERSION
    && typeof toolchain.ghidra === 'string' && typeof toolchain.javaHome === 'string'
    && typeof toolchain.reaCli === 'string', 'Pinned local Ghidra/JDK/REA toolchain metadata differs');
  const ghidraHome = resolve(toolchain.ghidra);
  const javaHome = resolve(toolchain.javaHome);
  assert(/ghidra_12\.1\.4_PUBLIC$/iu.test(basename(ghidraHome))
    && /21\.0\.12\.1\+1$/u.test(basename(javaHome)), 'Pinned Ghidra/JDK directory versions differ');
  const ghidraLauncher = trackedRead(resolve(ghidraHome, 'support/analyzeHeadless.bat'), 'Ghidra headless launcher');
  const ghidraProperties = trackedRead(resolve(ghidraHome, 'Ghidra/application.properties'), 'Ghidra application metadata');
  const javaExecutable = trackedRead(resolve(javaHome, 'bin/java.exe'), 'pinned Java executable');
  const javaRelease = trackedRead(resolve(javaHome, 'release'), 'pinned Java release metadata');
  const packageBytes = trackedRead(resolve(packageRoot, 'package.json'), 'REA package metadata');
  const metadata = parseJson(packageBytes);
  assert(metadata.name === 'rea-agents' && metadata.version === EXPECTED_REA_VERSION,
    `Expected rea-agents ${EXPECTED_REA_VERSION}; found ${metadata.name} ${metadata.version}`);
  if (value === null || value === undefined) assert(resolve(toolchain.reaCli).toLowerCase()
    === resolve(packageRoot, 'scripts/rea.mjs').toLowerCase(), 'Pinned REA CLI path differs from package root');
  for (const file of REA_USED_FILES) trackedRead(resolve(packageRoot, file), `REA helper ${file}`);
  return {
    root: packageRoot, metadata, packageSha256: sha(packageBytes),
    toolchain: {
      path: 'research/artifacts/rea-tools/toolchain.json', sha256: sha(toolchainBytes),
      ghidraHome: toolchain.ghidra, javaHome: toolchain.javaHome, reaCli: toolchain.reaCli,
      ghidraLauncherSha256: sha(ghidraLauncher), ghidraPropertiesSha256: sha(ghidraProperties),
      javaExecutableSha256: sha(javaExecutable), javaReleaseSha256: sha(javaRelease),
    },
  };
}

function validateReaRoundTrip(run, row) {
  const stem = row.name.toLowerCase();
  const ghidraDir = resolve(run.root, 'native-code/mapped/ghidra');
  const payload = trackedRead(row.payloadPath, `${row.name} exact PLL payload for REA validation`);
  assert(payload.length === row.payloadBytes && sha(payload) === row.payloadSha256,
    `${row.name} REA validation payload differs from the verified mapped object`);
  const paths = {
    bundle: resolve(ghidraDir, `${stem}.rea-bundle.json`),
    import: resolve(ghidraDir, `${stem}.rea-import.json`),
    exported: resolve(ghidraDir, `${stem}.rea-export.json`),
  };
  for (const [kind, path] of Object.entries(paths)) {
    assert(within(ghidraDir, path), `${row.name} ${kind} path escapes its Ghidra root`);
    assertIgnored(path, `${row.name} ${kind}`);
  }
  const bundleBytes = trackedRead(paths.bundle, `${row.name} REA Evidence bundle`);
  const importBytes = trackedRead(paths.import, `${row.name} REA import receipt`);
  const exportBytes = trackedRead(paths.exported, `${row.name} canonical REA export`);
  const rea = validateReaRecord(bundleBytes, exportBytes, importBytes,
    row.report, row.ghidraReportSha256, payload, row.payloadPath,
    row.payloadFile, row.name);
  rea.importResultPath = portable(relative(PROJECT_ROOT, paths.import));
  rea.bundlePath = portable(relative(PROJECT_ROOT, paths.bundle));
  rea.exportPath = portable(relative(PROJECT_ROOT, paths.exported));
  return rea;
}

function deriveEvidence(nativeRuns, control, reaPackage, sourceScriptPath) {
  validateSetupAndParity(nativeRuns, control);
  const allFunctions = [];
  for (const run of nativeRuns) {
    const mappedBytes = trackedRead(resolve(run.root, 'native-code/mapped/native-code-map.json'),
      `${run.config.runId} mapped code index`);
    const mapped = parseJson(mappedBytes);
    assert(mapped.schemaVersion === 1 && Array.isArray(mapped.functions)
      && same(mapped.functions.map(fn => fn.name), run.config.functions)
      && mapped.captureManifestSha256 === run.manifestSha256,
    `${run.config.runId} mapped-code report identity or manifest binding differs`);

    const rederived = mapCapturedFunctions(run.manifest, file => {
      assert(basename(file) === file && /^[a-z0-9-]+\.native-window\.bin$/u.test(file),
        `${run.config.runId} has an unsafe native window filename`);
      const path = resolve(run.root, 'native-code', file);
      assert(within(resolve(run.root, 'native-code'), path), `${run.config.runId} window escapes native-code root`);
      return trackedRead(path, `${run.config.runId} ${file}`);
    }, run.pll);
    assert(same(mapped.pll, rederived.report.pll) && same(mapped.functions, rederived.report.functions),
      `${run.config.runId} mapped output differs from exact manifest/window/PLL rederivation`);
    assert(mapped.pll.bytes === run.pll.length && mapped.pll.sha256 === run.pllSha256,
      `${run.config.runId} mapped PLL identity differs from its preserved runtime`);

    for (const [index, target] of run.config.functions.entries()) {
      const fn = mapped.functions[index];
      assert(fn.name === target && fn.uniqueCompleteObjectByteMatch === true,
        `${run.config.runId} ${target} is not a unique complete-object match`);
      const manifestFn = run.manifest.functions[index];
      assert(fn.capture.file === manifestFn.file && fn.capture.sha256 === manifestFn.sha256
        && fn.capture.bytes === manifestFn.bytes && fn.capture.windowBase === manifestFn.windowBase
        && fn.capture.functionObjectHeaderHex === manifestFn.functionObjectHeaderHex,
      `${run.config.runId} ${target} capture metadata differs from manifest`);
      const window = trackedRead(resolve(run.root, 'native-code', manifestFn.file),
        `${run.config.runId} ${target} native window`);
      const entry = parseAddress(fn.runtime.entry, `${target} runtime entry`);
      const windowBase = parseAddress(fn.capture.windowBase, `${target} window base`);
      const entryCandidate = parseAddress(manifestFn.entryCandidate, `${target} captured entry candidate`);
      const headerOffset = entry - windowBase - 4;
      assert(entry === entryCandidate && fn.runtime.entry === manifestFn.entryCandidate
        && parseAddress(fn.runtime.objectBase, `${target} runtime object base`) === entry - 4
        && fn.runtime.headerOffsetInWindow === headerOffset,
      `${run.config.runId} ${target} mapped entry/object base differs from the captured candidate/window offset`);
      assert(fn.objectBytes === fn.payloadBytes + 4 && fn.payloadBytes > 0
        && fn.pll.rawEnd - fn.pll.objectOffset === fn.objectBytes
        && fn.pll.payloadOffset === fn.pll.objectOffset + 4,
      `${run.config.runId} ${target} complete PLL object boundaries differ`);
      const liveObjectEnd = headerOffset + fn.objectBytes;
      const pllObject = run.pll.subarray(fn.pll.objectOffset, fn.pll.rawEnd);
      assert(headerOffset >= 0 && liveObjectEnd <= window.length && pllObject.length === fn.objectBytes
        && window.subarray(headerOffset, liveObjectEnd).equals(pllObject)
        && sha(pllObject) === fn.objectSha256,
      `${run.config.runId} ${target} captured code object bytes differ from the complete PLL object`);
      const payloadPath = resolve(run.root, 'native-code/mapped', fn.payloadFile);
      assert(within(resolve(run.root, 'native-code/mapped'), payloadPath)
        && basename(fn.payloadFile) === fn.payloadFile,
      `${run.config.runId} ${target} payload path escapes mapped root`);
      const payload = trackedRead(payloadPath, `${run.config.runId} ${target} exact PLL payload`);
      assert(payload.equals(rederived.payloads.get(fn.name)) && payload.length === fn.payloadBytes
        && sha(payload) === fn.payloadSha256,
      `${run.config.runId} ${target} payload differs from exact indexed PLL object bytes`);
      const ghidraPath = resolve(run.root, 'native-code/mapped/ghidra', `${target.toLowerCase()}.ghidra.json`);
      const ghidraBytes = trackedRead(ghidraPath, `${run.config.runId} ${target} Ghidra JSON report`);
      const ghidraLogPath = resolve(run.root, 'native-code/mapped/ghidra', `${target.toLowerCase()}.headless.log`);
      const ghidraLog = trackedRead(ghidraLogPath, `${run.config.runId} ${target} Ghidra headless log`);
      const ghidra = validateInstructionReport(run, fn, payload, ghidraBytes);
      const row = {
        name: fn.name,
        nativeRunId: run.config.runId,
        root: portable(relative(PROJECT_ROOT, run.root)),
        runtimeEntryForThisRun: fn.runtime.entry,
        capture: {
          windowFile: fn.capture.file, windowSha256: fn.capture.sha256, windowBytes: fn.capture.bytes,
          windowBase: fn.capture.windowBase, functionObjectHeaderHex: fn.capture.functionObjectHeaderHex,
          headerOffsetInWindow: fn.runtime.headerOffsetInWindow,
        },
        pll: fn.pll,
        compiledObject: {
          header: fn.header, encodedWords: fn.encodedWords, objectBytes: fn.objectBytes,
          objectSha256: fn.objectSha256, uniqueCompleteObjectByteMatch: true,
          runtimeObjectBase: fn.runtime.objectBase,
          liveWindowSliceSha256: fn.objectSha256,
        },
        payloadFile: fn.payloadFile,
        payloadPath,
        payloadBytes: payload.length,
        payloadSha256: sha(payload),
        ghidraReportPath: ghidraPath,
        ghidraReportSha256: ghidra.reportSha256,
        ghidraLogSha256: sha(ghidraLog),
        ghidraVersion: ghidra.report.ghidraVersion,
        report: ghidra.report,
        instructionValidation: {
          instructionCount: ghidra.instructionCount,
          instructionBytesCompared: ghidra.instructionBytesCompared,
          payloadBytes: ghidra.payloadBytes,
          payloadInstructionCoveragePercent: ghidra.payloadInstructionCoveragePercent,
          instructionRanges: ghidra.instructionRanges,
          uncoveredPayloadRanges: ghidra.uncoveredPayloadRanges,
        },
      };
      allFunctions.push(row);
    }
  }

  assert(allFunctions.length === 2 && same(allFunctions.map(row => row.name), ['FOOB', 'ZERO-EDGE']),
    'Predicate-native evidence does not contain the two requested distinct mapped functions in order');
  for (const run of nativeRuns) {
    for (const row of allFunctions.filter(item => item.nativeRunId === run.config.runId)) {
      row.rea = validateReaRoundTrip(run, row);
    }
  }

  for (const file of SHARED_SOURCE_FILES) trackedRead(file, `shared evidence source ${file}`);
  for (const run of nativeRuns) trackedRead(run.config.probeSource, `${run.config.runId} probe source`);
  for (const file of ['research/tools/derive-brush-stroke-native-evidence.mjs']) trackedRead(file, file);
  for (const file of REA_USED_FILES) trackedRead(resolve(reaPackage.root, file), `REA used helper ${file}`);
  trackedRead(sourceScriptPath, 'this derivation source');

  const sourcesOutput = [...sources.values()].sort((left, right) => left.path.localeCompare(right.path));
  const runOutput = run => ({
    runId: run.config.runId,
    root: portable(relative(PROJECT_ROOT, run.root)),
    mode: run.summary.mode,
    smallImage: run.summary.smallImage,
    summarySha256: run.summarySha256,
    requestSha256: run.requestSha256,
    probeSourceSha256: run.probeSourceSha256,
    stagedProbeSha256: run.stagedProbeSha256,
    outputNames: run.request.probeOutputNames,
    pauseSeconds: run.request.pauseSeconds,
    releaseMarkerSha256: run.releaseSha256,
    nativeLinksSha256: run.linksSha256,
    functionObjectMetadataSha256: run.metadataSha256,
    metadataSummary: run.metadataSummary,
    manifestSha256: run.manifestSha256,
    runtimeExecutableSha256: run.executableSha256,
    runtimePllSha256: run.pllSha256,
    aa0Sha256: run.aa0Sha256,
    sceneReportSha256: run.sceneSha256,
  });
  return {
    schemaVersion: 1,
    kind: 'Seed-1234 brush-buffer predicate native mapping with byte-validated standalone Ghidra reports and canonical REA evidence round-trips',
    rea: {
      package: reaPackage.metadata.name, version: reaPackage.metadata.version,
      packageJsonSha256: reaPackage.packageSha256, toolchain: reaPackage.toolchain,
    },
    nativeRuns: nativeRuns.map(runOutput),
    control: {
      runId: control.name,
      root: portable(relative(PROJECT_ROOT, control.root)),
      summarySha256: control.summarySha256,
      aa0Sha256: control.aa0Sha256,
      sceneReportSha256: control.sceneSha256,
      runtimeExecutableSha256: control.executableSha256,
      runtimePllSha256: control.pllSha256,
    },
    drawingParity: {
      aa0ByteIdenticalToFreshControl: true,
      sceneReportByteIdenticalToFreshControl: true,
      sameSetupHashes: true,
      checkedNativeRunIds: nativeRuns.map(run => run.config.runId),
      setup: {
        mode: EXPECTED_MODE,
        smallImage: false,
        installerSha256: control.summary.installerSha256,
        registryPatchSha256: control.summary.registryPatchSha256,
        licensePatchSha256: control.summary.licensePatchSha256,
      },
    },
    nativeMapping: {
      uniqueCompletePllObjects: allFunctions.length,
      functions: allFunctions.map(row => ({
        name: row.name, nativeRunId: row.nativeRunId, runtimeEntryForThisRun: row.runtimeEntryForThisRun,
        capture: row.capture, pll: row.pll, compiledObject: row.compiledObject,
        payload: { file: row.payloadFile, bytes: row.payloadBytes, sha256: row.payloadSha256 },
        ghidra: {
          version: row.ghidraVersion,
          languageId: 'x86:LE:32:default', compilerSpecId: 'windows',
          reportSha256: row.ghidraReportSha256, headlessLogSha256: row.ghidraLogSha256,
          decompilationCompleted: true,
          instructionCount: row.instructionValidation.instructionCount,
          instructionBytesCompared: row.instructionValidation.instructionBytesCompared,
          payloadBytes: row.instructionValidation.payloadBytes,
          payloadInstructionCoveragePercent: row.instructionValidation.payloadInstructionCoveragePercent,
          instructionRanges: row.instructionValidation.instructionRanges,
          uncoveredPayloadRanges: row.instructionValidation.uncoveredPayloadRanges,
        },
        rea: row.rea,
      })),
    },
    limitations: [
      'REA Evidence was imported from standalone Ghidra JSON using provider id ghidra-standalone and operation standalone_ghidra_function_analysis; no REA native Ghidra provider session was launched.',
      'REA 3.2.1 has no raw-binary subject format. Each bundle preserves reported_format raw in its result and parameters while representing the Evidence subject format as unknown.',
      'The REA bundle helper verifies report structure and subject-file SHA binding; this derivation independently compares every reported instruction byte to the exact mapped PLL payload but does not authenticate how Ghidra produced the JSON.',
      'The x86 Windows compiler specification does not model Allegro Lisp register conventions or tagged objects; Ghidra C types, arguments and expressions are not recovered Lisp source.',
      'The captured 64-byte SYSTEM::MEMREF functionObjectHeaderHex is live function metadata, not the serialized PLL code header. Complete code-object bytes are checked at the mapper-reported entry-minus-window-base offset, which can vary when a captured window is clamped.',
      'Native metadata is preserved byte-for-byte and hash-bound. Bounded nested cons summaries marked (:TYPE CONS) are not treated as full constant lists, and metadata does not establish dynamic calls or a complete call graph.',
      'Only FOOB and ZERO-EDGE from this seed-1234 capture are included; runtime entry addresses are per-run observations, not fixed addresses across builds.',
      'The target list and constant records are static inspection candidates; they do not establish that either function ran in the captured scene or that Ghidra C expressions reproduce Allegro Lisp semantics.',
      'Only reachable Ghidra instructions are reported. Uncovered payload ranges are retained and not labeled as code or data.',
    ],
    sourceHashes: sourcesOutput,
  };
}

function deriveFromRoots(nativeRoot, controlRoot, reaPackagePath = null) {
  sources.clear();
  const expected = NATIVE_ROOTS[0];
  const absolute = resolve(nativeRoot);
  assert(basename(absolute) === expected.runId,
    `Expected ${expected.runId} as the predicate-native root`);
  const nativeRuns = [readNativeRun({ ...expected, root: absolute })];
  const control = readControlRun(controlRoot);
  const reaPackage = resolvePackage(reaPackagePath);
  return deriveEvidence(nativeRuns, control, reaPackage, fileURLToPath(import.meta.url));
}

export function deriveBrushBufferPredicateNativeEvidence(nativeRoot = NATIVE_ROOTS[0].root, controlRoot = CONTROL_ROOT) {
  return deriveFromRoots(nativeRoot, controlRoot);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: node research/tools/derive-brush-buffer-predicate-native-evidence.mjs [--output <fresh-ignored-json>] [--rea-package <rea-agents-3.2.1-directory>]\n');
    return;
  }
  const nativeRoot = resolve(NATIVE_ROOTS[0].root);
  const defaultOutput = resolve(nativeRoot, 'native-code/mapped/predicate-native-evidence.json');
  const outputPath = resolve(args.output ?? defaultOutput);
  const allowedOutputRoot = resolve(nativeRoot, 'native-code/mapped');
  assert(within(allowedOutputRoot, outputPath), 'Derived JSON must be written under the owned predicate-native mapped root');
  assert(!existsSync(outputPath), 'Derived evidence output must be fresh');
  assertIgnored(outputPath, 'Derived evidence output');
  const evidence = args.reaPackage
    ? deriveFromRoots(nativeRoot, CONTROL_ROOT, args.reaPackage)
    : deriveBrushBufferPredicateNativeEvidence(nativeRoot, CONTROL_ROOT);
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(outputPath, bytes, { flag: 'wx' });
  process.stdout.write(JSON.stringify({
    outputPath: portable(relative(PROJECT_ROOT, outputPath)),
    outputSha256: sha(bytes),
    nativeRuns: evidence.nativeRuns.map(run => ({ runId: run.runId, aa0Sha256: run.aa0Sha256, sceneReportSha256: run.sceneReportSha256 })),
    functions: evidence.nativeMapping.functions.map(fn => ({ name: fn.name, runId: fn.nativeRunId,
      instructionCount: fn.ghidra.instructionCount, instructionBytesCompared: fn.ghidra.instructionBytesCompared,
      payloadBytes: fn.payload.bytes, provider: fn.rea.provider.id, nativeProviderSession: fn.rea.nativeProviderSession,
      evidenceId: fn.rea.evidenceId })),
    controlParity: evidence.drawingParity,
    sources: evidence.sourceHashes.length,
    reaVersion: evidence.rea.version,
  }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
