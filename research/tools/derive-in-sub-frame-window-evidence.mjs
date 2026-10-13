#!/usr/bin/env node
// Offline validation and evidence derivation for the matched v2 IN-SUB-FRAME
// call-window capture. This script reads saved oracle artifacts only.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateInSubFrameInitialWindow } from './validate-in-sub-frame-initial-window-v2.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_JSON = 'research/introspection/evidence/in-sub-frame-initial-window-v2-20261013.json';
const OUTPUT_REPORT = 'research/introspection/evidence/in-sub-frame-initial-window-v2-20261013.txt';
const NO_WRAPPER_PROBE_SHA256 = '4f9c6e80c1f88a831cab09ce7357cb3c2c0fba9aebf515d34edcc3a7ceddab7d';
const RUN_ROOTS = Object.freeze({
  directBefore: 'research/extracted/local-oracle/in-sub-frame-initial-window-v2-20261013-before',
  directAfter: 'research/extracted/local-oracle/in-sub-frame-initial-window-v2-20261013-after',
  loaderBefore: 'research/extracted/local-oracle/in-sub-frame-window-matched-20261013-before-loader-control',
  observer: 'research/extracted/local-oracle/in-sub-frame-window-matched-20261013-observer',
  loaderAfter: 'research/extracted/local-oracle/in-sub-frame-window-matched-20261013-after-loader-control',
});
const COMPARABLE_FILES = Object.freeze({
  aa0: 'capture/aa0',
  image: 'capture/image',
  imageId: 'capture/image-id',
  sceneSnapshot: 'capture/aaron-scene-state-snapshot.txt',
  planningCallTrace: 'capture/aaron-planning-call-trace.txt',
  loadedSeedRecord: 'capture/aaron-random-seed-loaded.txt',
});
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const insideRoot = path => {
  const rel = relative(ROOT, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const readJson = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''));

function capture(runRoot, name) {
  const path = resolve(runRoot, 'capture', name);
  const bytes = readFileSync(path);
  return { path, bytes, sha256: sha256(bytes), bytesLength: bytes.length };
}

function summarizeRun(label, rootRel, role) {
  const root = resolve(ROOT, rootRel);
  assert(insideRoot(root), `${label} output root escapes the repository`);
  const summaryPath = resolve(root, 'summary.json');
  const summaryBytes = readFileSync(summaryPath);
  const summary = readJson(summaryPath);
  assert(summary.complete === true, `${label} runner summary is incomplete`);
  assert(summary.mode === 'seed-1234', `${label} is not a seed-1234 run`);
  const aa0 = capture(root, 'aa0');
  const header = aa0.bytes.toString('ascii').split(/\r?\n/u, 1)[0];
  const dimensions = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(header);
  assert(dimensions, `${label} AA0 header is malformed`);
  const files = Object.fromEntries(Object.entries(COMPARABLE_FILES).map(([key, path]) => {
    const data = capture(root, path.replace(/^capture\//u, ''));
    return [key, { sha256: data.sha256, bytes: data.bytesLength }];
  }));
  const stagedProbePath = resolve(root, 'capture/aaron-pre-scene-probe.cl');
  const stagedProbe = existsSync(stagedProbePath) ? readFileSync(stagedProbePath) : null;
  const stagedProbeSha256 = stagedProbe === null ? null : sha256(stagedProbe);
  assert(stagedProbeSha256 === (summary.preSceneProbeSha256 ?? null),
    `${label} staged probe hash differs from its runner summary`);
  const summaryRow = {
    runId: summary.runId,
    role,
    path: rootRel,
    complete: summary.complete,
    mode: summary.mode,
    smallImage: summary.smallImage,
    probeSha256: summary.preSceneProbeSha256,
    probeOutputNames: summary.probeOutputNames,
    probeCompletionSatisfied: summary.probeCompletionSatisfied,
    runnerSha256: summary.runnerSha256,
    installerSha256: summary.installerSha256,
    registryPatchSha256: summary.registryPatchSha256,
    licensePatchSha256: summary.licensePatchSha256,
    aa0Sha256: summary.aa0Sha256,
    sceneReportSha256: summary.sceneReportSha256,
    summarySha256: sha256(summaryBytes),
    dimensions: {
      width: Number(dimensions[1]),
      height: Number(dimensions[2]),
      headerValue: Number(dimensions[3]),
    },
    files,
  };
  assert(summaryRow.aa0Sha256 === files.aa0.sha256, `${label} summary AA0 hash differs from its capture`);
  assert(summaryRow.sceneReportSha256 === files.sceneSnapshot.sha256,
    `${label} summary scene-report hash differs from its capture`);
  return { root, summary, summaryPath, summaryBytes, row: summaryRow };
}

function main() {
  const [outputJsonArg, outputReportArg, ...extra] = process.argv.slice(2);
  assert(extra.length === 0, 'Usage: node research/tools/derive-in-sub-frame-window-evidence.mjs [output.json] [output.txt]');
  const outputJson = resolve(ROOT, outputJsonArg ?? OUTPUT_JSON);
  const outputReport = resolve(ROOT, outputReportArg ?? OUTPUT_REPORT);
  assert(insideRoot(outputJson) && insideRoot(outputReport), 'Evidence output must remain inside the repository');

  const directBefore = summarizeRun('direct before', RUN_ROOTS.directBefore, 'direct-mode control before');
  const directAfter = summarizeRun('direct after', RUN_ROOTS.directAfter, 'direct-mode control after');
  const loaderBefore = summarizeRun('loader before', RUN_ROOTS.loaderBefore, 'no-wrapper composite-loader control before');
  const observer = summarizeRun('observer', RUN_ROOTS.observer, 'IN-SUB-FRAME observer');
  const loaderAfter = summarizeRun('loader after', RUN_ROOTS.loaderAfter, 'no-wrapper composite-loader control after');

  const directComparable = ['aa0', 'image', 'imageId', 'sceneSnapshot'];
  for (const key of directComparable) {
    assert(directBefore.row.files[key].sha256 === directAfter.row.files[key].sha256,
      `Direct-mode controls differ for ${key}`);
  }
  const matched = [loaderBefore, observer, loaderAfter];
  for (const key of Object.keys(COMPARABLE_FILES)) {
    const expected = loaderBefore.row.files[key].sha256;
    assert(observer.row.files[key].sha256 === expected && loaderAfter.row.files[key].sha256 === expected,
      `Matched loader controls and observer differ for ${key}`);
  }
  assert(loaderBefore.row.dimensions.width === 768 && loaderBefore.row.dimensions.height === 1080
    && observer.row.dimensions.width === 768 && observer.row.dimensions.height === 1080
    && loaderAfter.row.dimensions.width === 768 && loaderAfter.row.dimensions.height === 1080,
  'Matched composite-loader runs do not all use the observed 768x1080 canvas');
  assert(directBefore.row.dimensions.width === 320 && directBefore.row.dimensions.height === 480
    && directAfter.row.dimensions.width === 320 && directAfter.row.dimensions.height === 480,
  'Direct-mode control dimensions differ from the recorded 320x480 setup');

  const noWrapperProbeHash = loaderBefore.row.probeSha256;
  assert(noWrapperProbeHash === NO_WRAPPER_PROBE_SHA256
    && loaderAfter.row.probeSha256 === noWrapperProbeHash,
    'No-wrapper control probe hashes differ');
  for (const run of [loaderBefore, loaderAfter]) {
    assert(run.row.probeOutputNames.length === 1
      && run.row.probeOutputNames[0] === 'aaron-in-sub-frame-loader-only.txt',
    `${run.row.runId} did not declare the expected no-wrapper report`);
    const probe = readFileSync(resolve(run.root, 'capture/aaron-pre-scene-probe.cl'), 'utf8');
    const report = readFileSync(resolve(run.root, 'capture/aaron-in-sub-frame-loader-only.txt'), 'utf8');
    assert(probe.includes('no wrappers, reads, or AARON calls')
      && !/\(setf\s+\(symbol-function\b/iu.test(probe),
    `${run.row.runId} is not the reviewed no-wrapper diagnostic`);
    assert(report.includes('READY no wrappers') && report.includes('END in-sub-frame-loader-only'),
      `${run.row.runId} no-wrapper report is incomplete`);
  }

  const reportPath = resolve(observer.root, 'capture/aaron-in-sub-frame-initial-window-v2.txt');
  const reportBytes = readFileSync(reportPath);
  const requestPath = resolve(observer.root, 'pre-scene-probe-request.json');
  const requestBytes = readFileSync(requestPath);
  const probeBytes = readFileSync(resolve(observer.root, 'capture/aaron-pre-scene-probe.cl'));
  const runnerPath = resolve(ROOT, 'research/oracle/run-local-scene-state-required-probe.ps1');
  const runnerBytes = readFileSync(runnerPath);
  const validation = validateInSubFrameInitialWindow({
    reportBytes,
    summaryBytes: observer.summaryBytes,
    requestBytes,
    probeBytes,
    runnerBytes,
    summaryPath: observer.summaryPath,
    reportPath,
  });
  assert(validation.accepted && validation.calls === 1400 && validation.false === 224
    && validation.truthy === 1176 && validation.samples === 128,
  'Observer report differs from the accepted v2 call-window result');
  assert(sha256(reportBytes) === validation.reportSha256, 'Validator report hash differs from raw report');
  if (existsSync(outputReport)) {
    assert(sha256(readFileSync(outputReport)) === validation.reportSha256,
      `Refusing to replace a different archived report at ${outputReport}`);
  } else {
      writeFileSync(outputReport, reportBytes, { flag: 'wx' });
  }

  const evidence = {
    schemaVersion: 1,
    investigation: 'in-sub-frame-matched-initial-call-window-seed-1234-20261013',
    scope: {
      naturalCallWindowBounded: true,
      directCallerIdentified: false,
      generalObserverTransparencyEstablished: false,
      jsPredicateParityEstablished: false,
      systemClockChanged: false,
    },
    observation: {
      calls: validation.calls,
      completed: validation.completed,
      false: validation.false,
      truthy: validation.truthy,
      retainedFalseRows: validation.samples,
      falseRowsOmittedByDeclaredCap: validation.false - validation.samples,
      callWindow: validation.callWindow,
      completionStatus: validation.completionStatus,
      errors: 0,
      aborts: 0,
      targetRestoreStatus: validation.targetRestoreStatus,
      mainRestoreStatus: validation.mainRestoreStatus,
      canvas: observer.row.dimensions,
      report: {
        path: 'research/introspection/evidence/in-sub-frame-initial-window-v2-20261013.txt',
        sha256: validation.reportSha256,
        bytes: reportBytes.length,
      },
      binding: Object.fromEntries(Object.entries(validation)
        .filter(([key]) => /Sha256$/.test(key))),
    },
    controls: {
      directMode: [directBefore.row, directAfter.row],
      matchedCompositeLoader: matched.map(run => run.row),
      equalFilesInMatchedBracket: Object.keys(COMPARABLE_FILES),
      note: 'The direct-mode controls use a 320x480 AA0. The no-wrapper composite-loader controls and observer use a 768x1080 AA0. Matched controls establish the observer result only for the latter setup.',
    },
    limitations: [
      'Only the first 1,400 IN-SUB-FRAME calls after MAIN begins were observed.',
      'The report retains 128 of 224 false rows; 96 false-call argument rows were omitted by the declared sample cap.',
      'The observer performs synchronous reporting during the call window. Matching AA0, image, image-id, scene snapshot, planning trace, and loaded-seed record support this capture but do not prove general observer transparency.',
      'Auxiliary random-sample logs contain runtime CURRENT-DAY-TIME values and are not claimed as byte-identical random-state evidence.',
      'The result is not a JavaScript implementation or parity claim; the direct caller and general predicate boundary remain unresolved.',
    ],
  };
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(outputJson, bytes);
  process.stdout.write(`${JSON.stringify({ accepted: true, evidence: outputJson, report: outputReport,
    observation: evidence.observation, matchedRuns: matched.map(run => run.row.runId) }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) {
    process.stderr.write(`Evidence derivation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
