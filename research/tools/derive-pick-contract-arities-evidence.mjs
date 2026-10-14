#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Allegro501Random } from '../../engine/src/allegro-random.js';
import { verifyLocalAaronTriplet } from './verify-local-aaron-triplet.mjs';

const EXPECTED_PROBE_SHA256 =
  'aa6e499c17749d4903113f32cf740dbec592bb279db2b5b225caa69b75366343';
const EXPECTED_REPORT = 'aaron-pick-contract-arities.txt';
const EXPECTED_END_MARKER = 'END pick-contract-arities-v1';
const EXPECTED_MODE = 'writer-stream-seed-1234';
const SEEDS = [1234, 5678, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 77, 2026, 65535];
const CANDIDATES = Object.freeze({
  2: [41, 47],
  4: [61, 67, 73, 79],
});
const ARITIES = Object.freeze([2, 4]);
const SETUP_PHASES = Object.freeze(['pick', 'direct', 'no-draw']);
const SETUP_STAGE_COUNTS = Object.freeze({
  'factory-lookup': 1,
  'factory-call-begin': 1,
  'factory-call-end': 1,
  'set-state-begin': 2,
  'set-state-end': 2,
  'set-seed-begin': 1,
  'set-seed-end': 1,
  complete: 1,
});
const CASE_STAGES = Object.freeze([
  'case-enter',
  'setup-begin',
  'seeded',
  'pick-call-begin',
  'pick-return',
  'random-comparisons-complete',
]);
const RUNTIME_FILES = Object.freeze(['AARON.exe', 'AARON.pll', 'registry.dll', 'license.dll']);

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function hashFile(filePath) {
  return sha256(await readFile(filePath));
}

function requireHash(value, label) {
  requireValue(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
    `${label} is missing or is not a lowercase SHA-256`);
  return value;
}

function requireOne(lines, exactLine, label) {
  const matches = lines.flatMap((line, index) => line === exactLine ? [index] : []);
  requireValue(matches.length === 1,
    `${label} must occur exactly once; found ${matches.length}`);
  return matches[0];
}

function integer(text, label) {
  const value = Number(text);
  requireValue(Number.isSafeInteger(value), `${label} is not a safe integer`);
  return value;
}

function parseReport(reportBytes) {
  requireValue(reportBytes.length > 0, 'PICK arity report is empty');
  requireValue(reportBytes.at(-1) === 0x0a,
    'PICK arity report is truncated or lacks its final newline');
  let reportText;
  try {
    reportText = new TextDecoder('utf-8', { fatal: true }).decode(reportBytes);
  } catch {
    throw new Error('PICK arity report is not complete valid UTF-8');
  }
  requireValue(!reportText.includes('\0'), 'PICK arity report contains a NUL byte');
  const normalized = reportText.replace(/\r\n?/g, '\n');
  requireValue(normalized.endsWith('\n') && !normalized.endsWith('\n\n'),
    'PICK arity report has a missing or extra terminal newline');
  const lines = normalized.slice(0, -1).split('\n');
  requireValue(lines.every((line) => line.length > 0),
    'PICK arity report contains a blank or truncated record');
  return { lines, normalized };
}

function expectedRows() {
  return ARITIES.flatMap((argc) => SEEDS.map((seed) => ({
    seed,
    argc,
    arguments: [...CANDIDATES[argc]],
  })));
}

function validateEnvelope(lines) {
  requireValue(lines[0] === 'BEGIN pick-contract-arities-v1',
    'PICK arity report lacks its exact BEGIN record');
  requireValue(lines.at(-1) === EXPECTED_END_MARKER,
    'PICK arity report lacks its exact terminal END record');
  requireValue(lines.filter((line) => line === 'BEGIN pick-contract-arities-v1').length === 1,
    'PICK arity report has duplicate BEGIN records');
  requireValue(lines.filter((line) => line === EXPECTED_END_MARKER).length === 1,
    'PICK arity report has duplicate END records');
  requireOne(lines, 'LOAD-HELPERS-READY', 'helper-ready record');

  const ready = lines.filter((line) => line.startsWith('READY '));
  requireValue(ready.length === 1 && ready[0] ===
    'READY pick-package=COMMON-GRAPHICS-USER ran-package=COMMON-GRAPHICS-USER ' +
    'state-symbols=2 seed-symbols=1 arities=2,4 seeds=16',
  'PICK arity report did not resolve the expected functions, bindings, and cases');
  const complete = 'COMPLETE cases=32 errors=0 fatal=NIL restore-error=NIL';
  requireValue(lines.at(-2) === complete,
    'PICK arity report is incomplete or records an error');
  requireValue(lines.filter((line) => line.startsWith('COMPLETE ')).length === 1,
    'PICK arity report must have exactly one COMPLETE record');
  requireValue(lines.filter((line) => line.startsWith('CASE-ERROR ')).length === 0 &&
    lines.filter((line) => line.startsWith('FATAL ')).length === 0 &&
    lines.filter((line) => line.startsWith('RESTORE-ERROR ')).length === 0,
  'PICK arity report contains a probe or restoration error');

  for (const line of lines) {
    const accepted = line === 'BEGIN pick-contract-arities-v1' ||
      line === 'LOAD-HELPERS-READY' || line.startsWith('READY ') ||
      line.startsWith('SETUP ') || line.startsWith('CASE-STAGE ') ||
      line.startsWith('CASE seed=') || line.startsWith('COMPLETE ') ||
      line === EXPECTED_END_MARKER;
    requireValue(accepted, `Unexpected or error record in PICK arity report: ${line}`);
  }
}

function validateSetupRecords(lines, rows) {
  const expectedKeys = new Set(rows.flatMap(({ seed, argc }) =>
    SETUP_PHASES.map((phase) => `${seed}/${argc}/${phase}`)));
  const grouped = new Map();
  const setupLines = lines.filter((line) => line.startsWith('SETUP '));
  const pattern = /^SETUP seed=(\d+) argc=(\d+) phase=(pick|direct|no-draw) stage=([a-z-]+)(?: symbol=(\S+))?$/;

  for (const line of setupLines) {
    const match = pattern.exec(line);
    requireValue(match, `Malformed random-state setup record: ${line}`);
    const seed = integer(match[1], 'setup seed');
    const argc = integer(match[2], 'setup arity');
    const phase = match[3];
    const stage = match[4];
    const symbol = match[5] ?? null;
    const key = `${seed}/${argc}/${phase}`;
    requireValue(expectedKeys.has(key), `Unexpected random-state setup key ${key}`);
    requireValue(Object.hasOwn(SETUP_STAGE_COUNTS, stage),
      `Unknown random-state setup phase ${stage}`);
    const symbolStages = new Set([
      'set-state-begin', 'set-state-end', 'set-seed-begin', 'set-seed-end',
    ]);
    requireValue(symbolStages.has(stage) ? symbol !== null : symbol === null,
      `Random-state setup record has an invalid symbol field: ${line}`);
    const entries = grouped.get(key) ?? [];
    entries.push({ stage, symbol, line });
    grouped.set(key, entries);
  }

  requireValue(setupLines.length === rows.length * SETUP_PHASES.length * 10,
    `Expected ${rows.length * SETUP_PHASES.length * 10} setup records, got ${setupLines.length}`);
  requireValue(grouped.size === expectedKeys.size,
    `Expected ${expectedKeys.size} seeded setup passes, got ${grouped.size}`);

  for (const key of expectedKeys) {
    const entries = grouped.get(key) ?? [];
    const counts = new Map();
    for (const entry of entries) counts.set(entry.stage, (counts.get(entry.stage) ?? 0) + 1);
    for (const [stage, count] of Object.entries(SETUP_STAGE_COUNTS)) {
      requireValue(counts.get(stage) === count,
        `${key} has ${counts.get(stage) ?? 0} ${stage} records; expected ${count}`);
    }
    const stateBegins = entries.filter((entry) => entry.stage === 'set-state-begin')
      .map((entry) => entry.symbol).sort();
    const stateEnds = entries.filter((entry) => entry.stage === 'set-state-end')
      .map((entry) => entry.symbol).sort();
    const seedBegins = entries.filter((entry) => entry.stage === 'set-seed-begin')
      .map((entry) => entry.symbol);
    const seedEnds = entries.filter((entry) => entry.stage === 'set-seed-end')
      .map((entry) => entry.symbol);
    requireValue(new Set(stateBegins).size === 2 &&
      JSON.stringify(stateBegins) === JSON.stringify(stateEnds),
    `${key} did not set and confirm two distinct random-state bindings`);
    requireValue(seedBegins.length === 1 && seedBegins[0] === seedEnds[0],
      `${key} did not set and confirm its single random-seed binding`);
  }
}

function validateCaseStages(lines, rows, resultsByKey) {
  const stageLines = lines.filter((line) => line.startsWith('CASE-STAGE '));
  requireValue(stageLines.length === rows.length * CASE_STAGES.length,
    `Expected ${rows.length * CASE_STAGES.length} case progress records, got ${stageLines.length}`);

  for (const { seed, argc } of rows) {
    const key = `${seed}/${argc}`;
    const result = resultsByKey.get(key);
    requireValue(result, `No parsed result exists for ${key}`);
    const indexByStage = new Map();
    for (const stage of CASE_STAGES) {
      let exact;
      if (stage === 'pick-return') {
        exact = `CASE-STAGE seed=${seed} argc=${argc} stage=pick-return ` +
          `result=(${result.returnValue}) pick-next=${result.nextRANAfterPick}`;
      } else {
        exact = `CASE-STAGE seed=${seed} argc=${argc} stage=${stage}`;
      }
      indexByStage.set(stage, requireOne(lines, exact, `${key} ${stage} checkpoint`));
    }
    const orderedIndices = CASE_STAGES.map((stage) => indexByStage.get(stage));
    requireValue(orderedIndices.every((value, index) => index === 0 ||
      orderedIndices[index - 1] < value),
    `${key} progress checkpoints are out of order`);
  }
}

function validateRows(lines, rows) {
  const caseLines = lines.filter((line) => line.startsWith('CASE seed='));
  requireValue(caseLines.length === rows.length,
    `Expected ${rows.length} PICK rows, got ${caseLines.length}`);
  const pattern = /^CASE seed=(\d+) argc=(\d+) args=\(([^()]*)\) result=\((\d+)\) pick-next=(\d+) direct-index=(\d+) direct-next=(\d+) no-draw-next=(\d+)$/;
  const resultsByKey = new Map();
  const cases = [];

  for (let index = 0; index < rows.length; index += 1) {
    const expected = rows[index];
    const line = caseLines[index];
    const match = pattern.exec(line);
    requireValue(match, `Malformed PICK arity case: ${line}`);
    const seed = integer(match[1], 'case seed');
    const argc = integer(match[2], 'case arity');
    const returnValue = integer(match[4], 'PICK return value');
    const nextRANAfterPick = integer(match[5], 'PICK next RAN value');
    const directRANIndex = integer(match[6], 'direct RAN index');
    const nextRANAfterDirectDraw = integer(match[7], 'direct-draw next RAN value');
    const nextRANWithoutPick = integer(match[8], 'no-draw next RAN value');
    requireValue(seed === expected.seed && argc === expected.argc,
      `PICK arity/seed order differs at row ${index}: ${seed}/${argc}`);
    requireValue(match[3] === expected.arguments.join(' '),
      `PICK arguments differ for ${seed}/${argc}: (${match[3]})`);
    requireValue(directRANIndex >= 0 && directRANIndex < argc,
      `Direct RAN index is out of range for ${seed}/${argc}`);
    requireValue(returnValue === expected.arguments[directRANIndex],
      `PICK did not select the direct RAN position for ${seed}/${argc}`);

    const directRandom = new Allegro501Random(seed);
    const expectedDirectIndex = directRandom.integer(0, argc - 1);
    const expectedDirectNext = directRandom.integer(0, 1000000);
    requireValue(directRANIndex === expectedDirectIndex,
      `Original direct RAN index differs from Allegro501Random for ${seed}/${argc}`);
    requireValue(nextRANAfterPick === nextRANAfterDirectDraw &&
      nextRANAfterDirectDraw === expectedDirectNext,
    `PICK post-call state differs from one direct RAN draw for ${seed}/${argc}`);

    const noDrawRandom = new Allegro501Random(seed);
    const expectedNoDrawNext = noDrawRandom.integer(0, 1000000);
    requireValue(nextRANWithoutPick === expectedNoDrawNext,
      `No-draw random-state reference differs for ${seed}/${argc}`);

    const javascriptRandom = new Allegro501Random(seed);
    const javascriptReturn = javascriptRandom.pick(expected.arguments);
    const javascriptNext = javascriptRandom.integer(0, 1000000);
    requireValue(javascriptReturn === returnValue && javascriptNext === nextRANAfterPick,
      `Allegro501Random.pick differs from the original for ${seed}/${argc}`);

    const result = {
      seed,
      argumentCount: argc,
      arguments: expected.arguments,
      original: {
        returnValue,
        directRANIndex,
        nextRANAfterPick,
        nextRANAfterDirectDraw,
        nextRANWithoutPick,
        selectionMatchesDirectRAN: true,
        stateMatchesOneDirectRANDraw: true,
      },
      javascript: {
        returnValue: javascriptReturn,
        nextRANAfterPick: javascriptNext,
        matchesOriginal: true,
      },
    };
    resultsByKey.set(`${seed}/${argc}`, result.original);
    cases.push(result);
  }

  return { cases, resultsByKey };
}

async function runtimeIdentity(run) {
  const summary = run.summary;
  const installerSha256 = requireHash(summary.installerSha256,
    `${run.label} installer hash`);
  const registryPatchSha256 = requireHash(summary.registryPatchSha256,
    `${run.label} registry patch hash`);
  const licensePatchSha256 = requireHash(summary.licensePatchSha256,
    `${run.label} license patch hash`);
  const files = {};
  for (const name of RUNTIME_FILES) {
    const bytes = await readFile(path.join(run.runPath, 'runtime', name));
    requireValue(bytes.length > 0, `${run.label} runtime ${name} is empty`);
    files[name] = sha256(bytes);
  }
  requireValue(files['registry.dll'] === registryPatchSha256,
    `${run.label} registry patch hash does not bind its runtime DLL`);
  requireValue(files['license.dll'] === licensePatchSha256,
    `${run.label} license patch hash does not bind its runtime DLL`);
  return { installerSha256, registryPatchSha256, licensePatchSha256, files };
}

export async function derivePickContractAritiesEvidence(
  outputPath, beforePath, observerPath, afterPath,
) {
  const triplet = await verifyLocalAaronTriplet(beforePath, observerPath, afterPath);
  const [before, observer, after] = triplet.runs;
  requireValue(before.summary.mode === EXPECTED_MODE &&
    observer.summary.mode === EXPECTED_MODE && after.summary.mode === EXPECTED_MODE,
  `PICK arity triplet mode must be ${EXPECTED_MODE}`);

  const runnerHashes = triplet.runs.map((run) => requireHash(
    run.summary.runnerSha256, `${run.label} runner hash`));
  requireValue(runnerHashes.every((hash) => hash === runnerHashes[0]),
    'PICK arity triplet uses different scene runners');
  const currentRunnerSha256 = await hashFile(
    'research/oracle/run-local-scene-state-required-probe.ps1');
  requireValue(currentRunnerSha256 === runnerHashes[0],
    'Current required-probe runner differs from the captured triplet runner');

  const runtimeIdentities = await Promise.all(triplet.runs.map(runtimeIdentity));
  const runtimeIdentityJson = JSON.stringify(runtimeIdentities[0]);
  requireValue(runtimeIdentities.every((identity) =>
    JSON.stringify(identity) === runtimeIdentityJson),
  'PICK arity triplet runtime or patch identities differ');

  const probePath = 'research/introspection/pick-contract-arities-v1.cl';
  const probeSourceBytes = await readFile(probePath);
  const probeSourceSha256 = sha256(probeSourceBytes);
  requireValue(probeSourceSha256 === EXPECTED_PROBE_SHA256,
    'Current PICK arity probe differs from the exact source hash pinned by this deriver');
  requireValue(probeSourceSha256 === triplet.probeSourceHash &&
    observer.summary.preSceneProbeSha256 === probeSourceSha256,
  'PICK arity observer capture is not bound to the exact current probe source');
  const stagedProbeBytes = await readFile(
    path.join(observer.capturePath, 'aaron-pre-scene-probe.cl'));
  requireValue(sha256(stagedProbeBytes) === probeSourceSha256 &&
    stagedProbeBytes.equals(probeSourceBytes),
  'Staged PICK arity probe differs byte-for-byte from the current source');

  requireValue(triplet.requiredReport === EXPECTED_REPORT &&
    triplet.endMarker === EXPECTED_END_MARKER,
  'Observer triplet does not require the exact PICK arity report and END marker');
  requireValue(observer.summary.probeOutputNames.includes(EXPECTED_REPORT) &&
    observer.summary.requiredProbeOutputName === EXPECTED_REPORT &&
    observer.summary.requiredProbeEndMarker === EXPECTED_END_MARKER &&
    observer.summary.probeCompletionSatisfied === true,
  'Observer runner summary does not confirm the required PICK arity report');
  const reportPath = path.join(observer.capturePath, EXPECTED_REPORT);
  const reportBytes = await readFile(reportPath);
  const reportSha256 = sha256(reportBytes);
  requireValue(requireHash(observer.summary.requiredProbeOutputSha256,
    'observer required-report hash') === reportSha256 && triplet.reportHash === reportSha256,
  'PICK arity report bytes do not match the source-bound runner summary');
  const { lines } = parseReport(reportBytes);
  validateEnvelope(lines);

  const rows = expectedRows();
  const parsed = validateRows(lines, rows);
  validateSetupRecords(lines, rows);
  validateCaseStages(lines, rows, parsed.resultsByKey);

  const coverageByArity = ARITIES.map((argc) => {
    const arityCases = parsed.cases.filter((entry) => entry.argumentCount === argc);
    const expectedIndices = [...new Set(SEEDS.map((seed) =>
      new Allegro501Random(seed).integer(0, argc - 1)))].sort((a, b) => a - b);
    const observedIndices = [...new Set(arityCases.map((entry) =>
      entry.original.directRANIndex))].sort((a, b) => a - b);
    requireValue(JSON.stringify(observedIndices) === JSON.stringify(expectedIndices),
      `Observed direct-index coverage differs from the fixed-seed projection for arity ${argc}`);
    const allPositions = Array.from({ length: argc }, (_, index) => index);
    const allPositionsAttainable = expectedIndices.length === argc;
    if (allPositionsAttainable) {
      requireValue(JSON.stringify(observedIndices) === JSON.stringify(allPositions),
        `Fixed seeds can cover every direct index for arity ${argc}, but the capture does not`);
    }
    return {
      argumentCount: argc,
      observedDirectIndices: observedIndices,
      allCandidatePositions: allPositions,
      allPositionsAttainableWithFixedSeeds: allPositionsAttainable,
      allCandidatePositionsCovered: JSON.stringify(observedIndices) ===
        JSON.stringify(allPositions),
      cases: arityCases.length,
    };
  });

  const javascriptMatches = parsed.cases.filter((entry) =>
    entry.javascript.matchesOriginal).length;
  requireValue(javascriptMatches === rows.length,
    `Allegro501Random.pick matched only ${javascriptMatches}/${rows.length} cases`);

  const evidence = {
    schemaVersion: 1,
    function: 'PICK',
    evidenceLevel: 'bounded original-runtime arity evidence',
    scope: {
      positionalArgumentCounts: ARITIES,
      candidateLists: CANDIDATES,
      randomSeeds: SEEDS,
      cases: rows.length,
      invocation: 'explicit bounded pre-scene experiment',
    },
    observedBehavior: {
      selectionMatchesDirectRAN: true,
      directRANBoundsByArity: Object.fromEntries(ARITIES.map((argc) =>
        [argc, [0, argc - 1]])),
      postCallStateMatchesOneDirectRANDraw: true,
      directIndexCoverageByArity: coverageByArity,
      javascriptAdapter: 'Allegro501Random.pick(array)',
      javascriptMatches: `${javascriptMatches}/${rows.length}`,
    },
    provenance: {
      observerRunId: observer.summary.runId,
      controlBeforeRunId: before.summary.runId,
      controlAfterRunId: after.summary.runId,
      mode: observer.summary.mode,
      requiredReport: triplet.requiredReport,
      requiredEndMarker: triplet.endMarker,
      probeSourcePath: probePath,
      probeSourceSha256,
      reportSha256,
      runnerSha256: runnerHashes[0],
      currentRunnerSha256,
      runtimeIdentity: runtimeIdentities[0],
      controlOutputHashes: triplet.artifactHashes,
      ordinaryStagedSourceHashes: triplet.sourceHashes,
    },
    cases: parsed.cases,
    limitations: [
      'This is a bounded explicit pre-scene experiment; it does not establish a natural scene-call arity or caller census.',
      'Only two and four positional arguments from the listed distinct positive fixnum candidate lists and 16 fixed seeds are covered.',
      'The existing three-argument PICK contract remains separate evidence and is not re-derived by this extension.',
      'Other arities, general Lisp value types, other argument values, and non-seeded startup states are uncharacterized.',
      'This does not establish drawing, color-write, image, or whole-painting parity.',
    ],
  };

  const bytes = `${JSON.stringify(evidence, null, 2)}\n`;
  const absoluteOutput = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, bytes, 'utf8');
  return { evidence, sha256: sha256(Buffer.from(bytes)), outputPath: absoluteOutput };
}

async function main() {
  const [outputPath, beforePath, observerPath, afterPath] = process.argv.slice(2);
  if (!outputPath || !beforePath || !observerPath || !afterPath) {
    throw new Error('Usage: node research/tools/derive-pick-contract-arities-evidence.mjs ' +
      '<evidence.json> <before-root> <observer-root> <after-root>');
  }
  const derived = await derivePickContractAritiesEvidence(
    outputPath, beforePath, observerPath, afterPath);
  console.log(`PASS: ${derived.evidence.scope.cases} source-bound PICK arity cases`);
  console.log('PASS: original PICK matches direct RAN selection and one-draw state');
  console.log(`PASS: Allegro501Random.pick matched ${derived.evidence.observedBehavior.javascriptMatches} rows`);
  for (const coverage of derived.evidence.observedBehavior.directIndexCoverageByArity) {
    console.log(`Direct indices for argc=${coverage.argumentCount}: ` +
      `${coverage.observedDirectIndices.join(',')} ` +
      `(all positions covered: ${coverage.allCandidatePositionsCovered})`);
  }
  console.log(`PASS: fresh controls match ${Object.keys(derived.evidence.provenance.controlOutputHashes).length} outputs and ${Object.keys(derived.evidence.provenance.ordinaryStagedSourceHashes).length} staged sources`);
  console.log(`Evidence SHA-256 ${derived.sha256}`);
  console.log(`Wrote ${derived.outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
