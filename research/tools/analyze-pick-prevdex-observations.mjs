#!/usr/bin/env node

// Compare source-bound natural PICK returns with their nested RAN context and
// the next HDEX writer event within the same selected screen unit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactFixnumList(summary, label) {
  const prefix = '(:CONS (';
  const suffix = ') :TAIL :NIL)';
  assert.ok(summary.startsWith(prefix) && summary.endsWith(suffix),
    `${label} is not a proper captured FIXNUM list`);
  const body = summary.slice(prefix.length, -suffix.length);
  const entries = [...body.matchAll(/\(:NUMBER FIXNUM (-?\d+)\)/g)];
  assert.ok(entries.length > 0, `${label} has no fixnums`);
  assert.equal(body, entries.map((entry) => entry[0]).join(' '),
    `${label} contains non-FIXNUM or malformed values`);
  return entries.map((entry) => Number(entry[1]));
}

function prevdexAtRandomEntry(context) {
  assert.equal(typeof context, 'string', 'nested RAN has no entry context');
  const matches = [...context.matchAll(/\(:NAME "PREVDEX" :BOUND T :VALUE \(:NUMBER FIXNUM (-?\d+)\)\)/g)];
  assert.equal(matches.length, 1, 'nested RAN context must contain one typed PREVDEX binding');
  return Number(matches[0][1]);
}

function readEvidence(filePath) {
  const bytes = readFileSync(filePath);
  const evidence = JSON.parse(bytes.toString('utf8'));
  assert.ok(evidence.source && evidence.selectedUnit,
    `${filePath} is not screen-unit context evidence`);
  assert.equal(evidence.source.mode, 'screen-unit-seed-1234');
  assert.equal(Object.keys(evidence.source.matchedControlOutputs ?? {}).length, 6,
    `${filePath} is missing fresh-control output comparisons`);
  assert.equal(evidence.source.matchedOrdinarySceneSources, 10,
    `${filePath} is missing the ordinary scene-source comparisons`);
  assert.equal(evidence.source.controlRunIds?.length, 2,
    `${filePath} is missing both fresh control run IDs`);
  assert.ok(evidence.source.observerRunId,
    `${filePath} is missing its observer run ID`);
  assert.equal(Object.keys(evidence.source.observerOnlyOutputHashes ?? {}).length, 2,
    `${filePath} is missing the two observer-only report hashes`);
  assert.ok(evidence.source.probeSourceSha256,
    `${filePath} is missing the source-bound probe hash`);
  return { bytes, evidence, filePath: path.resolve(filePath), sha256: sha256(bytes) };
}

function analyzeUnit(input) {
  const { evidence, filePath, sha256: evidenceSha256 } = input;
  const unit = evidence.selectedUnit;
  const expected = {
    2: 'screen-unit-context-v9',
    3: 'screen-unit-context-v10',
    5: 'screen-unit-context-v8',
    6: 'screen-unit-context-v6',
  }[unit.ordinal];
  assert.ok(expected, `Unexpected natural screen-unit ordinal ${unit.ordinal}`);
  assert.equal(evidence.source.probeVersion, expected);
  assert.equal(unit.pickCalls.length, 3,
    `Unit ${unit.ordinal} must contain exactly three captured PICK calls`);

  const picks = [...unit.pickCalls].sort((a, b) => a.id - b.id);
  const cases = picks.map((pick, index) => {
    assert.equal(pick.parentId, unit.id,
      `PICK ${pick.id} is not nested under the selected screen unit`);
    const args = exactFixnumList(pick.argsSummary, `PICK ${pick.id} arguments`);
    assert.equal(args.length, 3, `PICK ${pick.id} does not have three fixnum arguments`);
    assert.deepEqual(args, [27, 28, 29],
      `PICK ${pick.id} is outside the fixed candidate input list`);
    const returns = exactFixnumList(pick.valuesSummary, `PICK ${pick.id} return`);
    assert.equal(returns.length, 1, `PICK ${pick.id} does not have one fixnum return`);
    const [value] = returns;
    const children = unit.randomCalls.filter((call) => call.parentId === pick.id);
    assert.equal(children.length, 1, `PICK ${pick.id} does not have exactly one captured RAN child`);
    const [random] = children;
    assert.deepEqual(random.args, ['0', '2'], `PICK ${pick.id} child is not RAN(0,2)`);
    assert.equal(random.typedArgsSummary, '((:NUMBER FIXNUM 0) (:NUMBER FIXNUM 2))',
      `PICK ${pick.id} child does not use two captured FIXNUM bounds`);
    const draw = Number(random.values[0]);
    assert.ok(Number.isInteger(draw) && draw >= 0 && draw <= 2,
      `PICK ${pick.id} child returned an invalid candidate index`);
    assert.equal(random.typedValuesSummary, `((:NUMBER FIXNUM ${draw}))`,
      `PICK ${pick.id} child return is not the captured FIXNUM index`);
    assert.equal(value, args[draw],
      `PICK ${pick.id} return does not match its captured RAN index`);

    const prevdex = prevdexAtRandomEntry(random.entryContextSummary);
    const nextPickId = picks[index + 1]?.id ?? Infinity;
    const writes = unit.colorSelections
      .filter((write) => write.id > pick.id && write.id < nextPickId);
    assert.ok(writes.length <= 1,
      `PICK ${pick.id} has multiple HDEX writes before the next PICK`);
    if (writes.length === 1) {
      assert.equal(writes[0].index, value,
        `PICK ${pick.id} return and following HDEX index differ`);
      const pairedPrepLines = unit.decisionTimeline.filter((event) =>
        event.event === 'PREP-LINE' && event.id > writes[0].id && event.id < nextPickId);
      assert.equal(pairedPrepLines.length, 1,
        `HDEX ${writes[0].id} is not followed by one PREP-LINE before the next PICK`);
      assert.equal(pairedPrepLines[0].colorIndex, writes[0].index,
        `PREP-LINE after HDEX ${writes[0].id} uses a different color`);
    }
    const predictedWrite = value !== prevdex;
    const observedWrite = writes.length === 1;
    return {
      screenUnitOrdinal: unit.ordinal,
      pickCallId: pick.id,
      arguments: args,
      randomCallId: random.id,
      randomIndex: draw,
      returnValue: value,
      prevdexAtNestedRandomEntry: prevdex,
      followingHdexWrite: writes.length === 1
        ? { callId: writes[0].id, writerOrdinal: writes[0].writerOrdinal, index: writes[0].index }
        : null,
      candidatePredictsWrite: predictedWrite,
      candidateMatchesObservation: predictedWrite === observedWrite,
      returnDiffersFromPrevDex: predictedWrite,
    };
  });

  return {
    evidencePath: path.relative(process.cwd(), filePath).replaceAll('\\', '/'),
    evidenceSha256,
    probeVersion: evidence.source.probeVersion,
    probeSourceSha256: evidence.source.probeSourceSha256,
    screenUnitOrdinal: unit.ordinal,
    aa0Sha256: evidence.source.aa0Sha256,
    matchedControlOutputCount: Object.keys(evidence.source.matchedControlOutputs).length,
    matchedOrdinarySceneSourceCount: evidence.source.matchedOrdinarySceneSources,
    cases,
  };
}

export function analyzePickPrevDexEvidence(...evidencePaths) {
  assert.ok(evidencePaths.length >= 2, 'At least two source-bound unit evidence files are required');
  const observations = evidencePaths.map(readEvidence)
    .map(analyzeUnit);
  const ordinals = observations.map((observation) => observation.screenUnitOrdinal);
  assert.equal(new Set(ordinals).size, ordinals.length,
    'Each natural screen-unit ordinal may appear only once');
  assert.equal(new Set(observations.map((observation) => observation.aa0Sha256)).size, 1,
    'All units must belong to the same source-bound AA0 painting');
  const cases = observations.flatMap((observation) => observation.cases);
  const matches = cases.filter((item) => item.candidateMatchesObservation).length;
  const differingReturnWrites = cases.filter((item) =>
    item.returnDiffersFromPrevDex && item.followingHdexWrite).length;
  const equalReturnWithoutWrites = cases.filter((item) =>
    !item.returnDiffersFromPrevDex && !item.followingHdexWrite).length;
  return {
    schemaVersion: 1,
    question: 'Does an HDEX write follow a natural PICK exactly when its return differs from PREVDEX observed at the nested RAN(0,2) entry?',
    result: {
      observedCases: cases.length,
      candidateMatches: matches,
      candidateMismatches: cases.length - matches,
      differingReturnWrites,
      equalReturnWithoutWrites,
      candidateFitsTheseObservations: matches === cases.length,
    },
    observations,
    limitations: [
      `These are ${cases.length} natural calls from ${observations.length} screen units of one seed-1234 painting, not independent seeds or controlled downstream inputs.`,
      'PREVDEX is sampled at the captured nested RAN entry; this does not prove the Lisp-level caller or exact native state slot.',
      'The candidate is not a general color rule and must not be implemented as recovered behavior without an independent falsifying test.',
      'No JavaScript color-selection contract or whole-painting parity is established.',
    ],
  };
}

async function main() {
  const [outputPath, ...evidencePaths] = process.argv.slice(2);
  if (!outputPath || evidencePaths.length < 2) {
    throw new Error('Usage: node research/tools/analyze-pick-prevdex-observations.mjs <output.json> <at-least-two-unit-evidence.json> ...');
  }
  const report = analyzePickPrevDexEvidence(...evidencePaths);
  const bytes = `${JSON.stringify(report, null, 2)}\n`;
  const absoluteOutput = path.resolve(outputPath);
  writeFileSync(absoluteOutput, bytes, { flag: 'wx' });
  console.log(`Natural PICK/PREVDEX cases: ${report.result.candidateMatches}/${report.result.observedCases} match the candidate`);
  console.log(`No color rule or JS contract promoted; evidence written to ${absoluteOutput}`);
  console.log(`Analysis SHA-256 ${sha256(Buffer.from(bytes))}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
