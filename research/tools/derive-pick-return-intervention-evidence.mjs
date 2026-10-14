#!/usr/bin/env node

// Derive one controlled caller-visible PICK return substitution from a
// fresh uninstrumented / intervention / uninstrumented triplet.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { deriveScreenUnitContextEvidence } from './derive-screen-unit-context-evidence.mjs';

const expectedByProbe = {
  'screen-unit-context-v11': { pickOrdinal: 1, unitOrdinal: 2, policy: 'toggle' },
  'screen-unit-context-v12': { pickOrdinal: 2, unitOrdinal: 2, policy: 'toggle' },
  'screen-unit-context-v13': {
    pickOrdinal: 1,
    unitOrdinal: 2,
    policy: 'force-fixed-33',
    mode: 'screen-unit-seed-1234',
    canvas: [768, 1080],
    arguments: [33, 34, 35],
    nativeReturn: 34,
    prevdex: 35,
    callerReturn: 33,
    randomIndex: 1,
  },
  'screen-unit-context-v14': {
    pickOrdinal: 3,
    unitOrdinal: 6,
    policy: 'force-fixed-27',
    mode: 'screen-unit-seed-1234',
    canvas: [320, 480],
    arguments: [27, 28, 29],
    nativeReturn: 28,
    prevdex: 28,
    callerReturn: 27,
    randomIndex: 1,
  },
  'screen-unit-context-v15': {
    pickOrdinal: 2,
    unitOrdinal: 6,
    policy: 'force-fixed-35',
    mode: 'screen-unit-seed-5678',
    canvas: [768, 1080],
    arguments: [33, 34, 35],
    nativeReturn: 34,
    prevdex: 34,
    callerReturn: 35,
    randomIndex: 1,
    requireFollowingPick: true,
  },
};

function one(lines, pattern, label) {
  const matches = lines.filter((line) => pattern.test(line));
  assert.equal(matches.length, 1, `Expected one ${label}, found ${matches.length}`);
  return matches[0];
}

function parseIntegerList(text, label) {
  assert.match(text, /^\(\s*-?\d+(?:\s+-?\d+)*\s*\)$/, `${label} is not a flat integer list`);
  return text.slice(1, -1).trim().split(/\s+/).map(Number);
}

function parseTypedFixnumSummary(text, label) {
  const prefix = '(:CONS (';
  const suffix = ') :TAIL :NIL)';
  assert.ok(text.startsWith(prefix) && text.endsWith(suffix),
    `${label} is not a proper typed FIXNUM summary`);
  const body = text.slice(prefix.length, -suffix.length);
  const matches = [...body.matchAll(/\(:NUMBER FIXNUM (-?\d+)\)/g)];
  assert.ok(matches.length > 0, `${label} has no FIXNUM values`);
  assert.equal(body, matches.map((match) => match[0]).join(' '),
    `${label} contains non-FIXNUM or malformed values`);
  return matches.map((match) => Number(match[1]));
}

function parseNativeReturn(line) {
  const match = /^PICK-NATIVE-RETURN call-id=(\d+) ordinal=(\d+) values=(.*?) prevdex=(NIL|-?\d+)$/.exec(line);
  assert.ok(match, `Malformed PICK-NATIVE-RETURN row: ${line}`);
  return {
    callId: Number(match[1]),
    ordinal: Number(match[2]),
    values: parseTypedFixnumSummary(match[3], 'native PICK return'),
    prevdex: match[4] === 'NIL' ? null : Number(match[4]),
  };
}

export async function derivePickReturnInterventionEvidence(beforePath, observerPath, afterPath) {
  const context = await deriveScreenUnitContextEvidence(beforePath, observerPath, afterPath);
  const expected = expectedByProbe[context.source.probeVersion];
  assert.ok(expected, `Unsupported intervention probe ${context.source.probeVersion}`);
  assert.equal(context.selectedUnit.ordinal, expected.unitOrdinal,
    `PICK intervention must be bound to post-RPARSE screen unit ${expected.unitOrdinal}`);
  if (expected.mode) {
    assert.equal(context.source.mode, expected.mode,
      `${context.source.probeVersion} intervention mode changed`);
  }
  if (['screen-unit-context-v14', 'screen-unit-context-v15'].includes(context.source.probeVersion)) {
    assert.match(context.source.requiredProbeOutputSha256 ?? '', /^[a-f0-9]{64}$/,
      `${context.source.probeVersion} intervention has no runner-recorded required-report hash`);
  }
  if (expected.canvas) {
    assert.deepEqual(context.selectedUnit.entryContext.fillMap?.dimensions, expected.canvas,
      `${context.source.probeVersion} intervention canvas changed`);
  }

  const observerSummary = JSON.parse(
    readFileSync(path.join(observerPath, 'summary.json'), 'utf8').replace(/^\uFEFF/, ''),
  );
  const reportPath = path.join(observerPath, 'capture', observerSummary.requiredProbeOutputName);
  const report = readFileSync(reportPath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd();
  const lines = report.split('\n');
  assert.equal(lines[0], `BEGIN ${context.source.probeVersion}`);
  assert.equal(lines.at(-1), `END ${context.source.probeVersion}`);
  assert.ok(!lines.some((line) => /^(?:INCOMPLETE|OVERFLOW|OBSERVER-ERROR|INTERVENTION-PRECONDITION-FAILED)\b/.test(line)),
    'intervention report contains a failed or incomplete record');

  const transformInstalled = one(lines, /^PICK-TRANSFORM-INSTALLED /, 'transform installation marker');
  const expectedTransformMarker = expected.policy === 'toggle'
    ? `PICK-TRANSFORM-INSTALLED target-ordinal=${expected.pickOrdinal} ` +
      'replacement-policy=toggle-PREVDEX-equality enabled=T'
    : `PICK-TRANSFORM-INSTALLED target-ordinal=${expected.pickOrdinal} ` +
      `replacement-policy=${expected.policy} canvas=${expected.canvas.join('x')} enabled=T`;
  assert.equal(transformInstalled, expectedTransformMarker);

  const completion = one(lines, /^PICK-INTERVENTION-COMPLETE /, 'intervention completion marker');
  const completionMatch = /^PICK-INTERVENTION-COMPLETE target-ordinal=(\d+) selected-pick-count=(\d+) substitution-count=(\d+) target-call-id=(\d+) native=(-?\d+) caller=(-?\d+) prevdex=(-?\d+)$/.exec(completion);
  assert.ok(completionMatch, 'Malformed PICK-INTERVENTION-COMPLETE marker');
  assert.equal(Number(completionMatch[1]), expected.pickOrdinal);
  assert.equal(Number(completionMatch[2]), context.selectedUnit.pickCalls.length,
    'completed PICK count differs from the captured call rows');
  assert.equal(Number(completionMatch[3]), 1);

  const nativeRows = lines.filter((line) => line.startsWith('PICK-NATIVE-RETURN '))
    .map(parseNativeReturn).sort((a, b) => a.ordinal - b.ordinal);
  assert.equal(nativeRows.length, context.selectedUnit.pickCalls.length,
    'every selected-unit PICK must have one explicit native-return row');
  assert.deepEqual(nativeRows.map((row) => row.ordinal),
    nativeRows.map((_, index) => index + 1), 'PICK ordinals must be contiguous');
  for (const row of nativeRows) {
    const pick = context.selectedUnit.pickCalls.find((item) => item.id === row.callId);
    assert.ok(pick, `Native-return call ${row.callId} is absent from the selected unit`);
    assert.deepEqual(parseTypedFixnumSummary(pick.valuesSummary, `PICK ${row.callId} trace return`),
      row.values, `PICK ${row.callId} natural return summaries disagree`);
    const args = parseTypedFixnumSummary(pick.argsSummary, `PICK ${row.callId} arguments`);
    assert.equal(args.length, 3, `PICK ${row.callId} must have three integer choices`);
    assert.equal(row.values.length, 1, `PICK ${row.callId} must return one integer`);
  }

  const substitutionLine = one(lines, /^PICK-SUBSTITUTION /, 'PICK substitution');
  const substitutionMatch = /^PICK-SUBSTITUTION call-id=(\d+) ordinal=(\d+) args=(\([^)]*\)) native-values=(\([^)]*\)) caller-values=(\([^)]*\)) prevdex=(-?\d+) policy=([A-Za-z0-9-]+)$/.exec(substitutionLine);
  assert.ok(substitutionMatch, 'Malformed PICK-SUBSTITUTION row');
  const substitution = {
    callId: Number(substitutionMatch[1]),
    pickOrdinal: Number(substitutionMatch[2]),
    arguments: parseIntegerList(substitutionMatch[3], 'substitution arguments'),
    nativeReturnValues: parseIntegerList(substitutionMatch[4], 'native substitution values'),
    callerReturnValues: parseIntegerList(substitutionMatch[5], 'caller substitution values'),
    prevdex: Number(substitutionMatch[6]),
    policy: substitutionMatch[7],
  };
  assert.equal(substitution.callId, Number(completionMatch[4]));
  assert.equal(substitution.pickOrdinal, expected.pickOrdinal);
  assert.equal(substitution.arguments.length, 3);
  assert.equal(substitution.nativeReturnValues.length, 1);
  assert.equal(substitution.callerReturnValues.length, 1);
  const [nativeReturn] = substitution.nativeReturnValues;
  const [callerReturn] = substitution.callerReturnValues;
  const expectedCallerReturn = expected.callerReturn !== undefined
    ? expected.callerReturn
    : expected.policy === 'force-PREVDEX-difference'
      ? substitution.arguments.find((value) => value !== substitution.prevdex)
    : nativeReturn === substitution.prevdex
      ? substitution.arguments.find((value) => value !== substitution.prevdex)
      : substitution.prevdex;
  const expectedPolicy = expected.callerReturn !== undefined
    ? expected.policy
    : expected.policy === 'force-PREVDEX-difference'
      ? 'force-PREVDEX-difference'
    : nativeReturn === substitution.prevdex
      ? 'force-PREVDEX-difference'
      : 'force-PREVDEX-equality';
  if (expected.callerReturn !== undefined) {
    assert.deepEqual(substitution.arguments, expected.arguments,
      `${context.source.probeVersion} target argument choices changed`);
    assert.equal(nativeReturn, expected.nativeReturn,
      `${context.source.probeVersion} target native return changed`);
    assert.equal(substitution.prevdex, expected.prevdex,
      `${context.source.probeVersion} target PREVDEX changed`);
  }
  if (expected.policy === 'force-PREVDEX-difference') {
    assert.equal(nativeReturn, substitution.prevdex,
      `${context.source.probeVersion} target must be naturally equal to PREVDEX before substitution`);
  }
  assert.notEqual(expectedCallerReturn, undefined,
    'the three choices must contain a value distinct from PREVDEX');
  assert.equal(callerReturn, expectedCallerReturn,
    'caller-visible result does not match the recorded substitution policy');
  assert.notEqual(callerReturn, nativeReturn,
    'intervention must change the natural PICK result');
  assert.equal(substitution.policy, expectedPolicy);
  assert.equal(Number(completionMatch[5]), nativeReturn);
  assert.equal(Number(completionMatch[6]), callerReturn);
  assert.equal(Number(completionMatch[7]), substitution.prevdex);

  const targetNative = nativeRows.find((row) => row.callId === substitution.callId);
  assert.ok(targetNative, 'Substituted call has no native-return record');
  assert.equal(targetNative.ordinal, expected.pickOrdinal);
  assert.deepEqual(targetNative.values, [nativeReturn]);
  assert.equal(targetNative.prevdex, substitution.prevdex);
  const targetPick = context.selectedUnit.pickCalls.find((call) => call.id === substitution.callId);
  assert.ok(targetPick, 'Substituted PICK is absent from the selected unit');
  assert.deepEqual(parseTypedFixnumSummary(targetPick.argsSummary, 'substituted PICK arguments'),
    substitution.arguments, 'substitution arguments differ from the captured PICK entry');

  const callerLine = one(lines, /^PICK-CALLER-RETURN /, 'caller-visible PICK return');
  const callerMatch = /^PICK-CALLER-RETURN call-id=(\d+) ordinal=(\d+) values=(.*)$/.exec(callerLine);
  assert.ok(callerMatch, 'Malformed PICK-CALLER-RETURN row');
  assert.equal(Number(callerMatch[1]), substitution.callId);
  assert.equal(Number(callerMatch[2]), expected.pickOrdinal);
  assert.deepEqual(parseTypedFixnumSummary(callerMatch[3], 'caller-visible PICK return'),
    [callerReturn]);

  const randomChildren = context.selectedUnit.randomCalls
    .filter((call) => call.parentId === substitution.callId);
  assert.equal(randomChildren.length, 1,
    'the substituted PICK must retain exactly one natural nested RAN call');
  const [random] = randomChildren;
  assert.deepEqual(random.args, ['0', '2']);
  assert.equal(random.values.length, 1);
  assert.equal(context.selectedUnit.pickCalls.find((call) => call.id === substitution.callId).id,
    substitution.callId);
  const randomPrevDexMatches = [...random.entryContextSummary.matchAll(
    /:NAME "PREVDEX" :BOUND T :VALUE \(:NUMBER FIXNUM (-?\d+)\)/g,
  )];
  assert.equal(randomPrevDexMatches.length, 1,
    'target nested RAN entry must contain one typed PREVDEX snapshot');
  const prevdexAtRandomEntry = Number(randomPrevDexMatches[0][1]);
  assert.equal(prevdexAtRandomEntry, substitution.prevdex);
  const randomIndex = Number(random.values[0]);
  assert.ok(Number.isInteger(randomIndex) && randomIndex >= 0 && randomIndex <= 2);
  if (expected.randomIndex !== undefined) {
    assert.equal(randomIndex, expected.randomIndex,
      `${context.source.probeVersion} nested RAN(0,2) selected an unexpected argument index`);
  }
  assert.equal(substitution.arguments[randomIndex], nativeReturn,
    'native PICK result does not match its natural RAN(0,2) index');

  const orderedPicks = [...context.selectedUnit.pickCalls].sort((a, b) => a.id - b.id);
  const nextPickId = orderedPicks.find((call) => call.id > substitution.callId)?.id ?? Infinity;
  if (expected.requireFollowingPick) {
    assert.ok(Number.isFinite(nextPickId),
      `${context.source.probeVersion} target has no observed following PICK to bound the prediction`);
  }
  const followingHdexWrites = context.selectedUnit.colorSelections
    .filter((write) => write.id > substitution.callId && write.id < nextPickId)
    .map((write) => ({ callId: write.id, writerOrdinal: write.writerOrdinal, index: write.index }));
  const predictsWrite = callerReturn !== prevdexAtRandomEntry;
  const observedCandidateMatch = predictsWrite
    ? followingHdexWrites.length === 1 && followingHdexWrites[0].index === callerReturn
    : followingHdexWrites.length === 0;

  const controlHashes = context.source.matchedControlOutputs;
  const treatmentHashes = context.source.intentionalObserverOutputHashes ?? {};
  const outputHashComparisons = Object.fromEntries(Object.entries(treatmentHashes).map(([name, hash]) => [
    name, { controlSha256: controlHashes[name], interventionSha256: hash, differs: controlHashes[name] !== hash },
  ]));

  const policyEvidenceField = expected.policy === 'toggle'
    ? { equalityTogglePolicy: substitution.policy }
    : { returnPolicy: substitution.policy };
  const targetScopeLimitation = `The captured natural return and caller-visible substitute are tied to this one source-bound ${context.source.mode} unit-${expected.unitOrdinal} intervention at the measured ${expected.canvas?.join('x') ?? 'unrecorded'} canvas regime.`;

  return {
    schemaVersion: 1,
    evidenceKind: 'controlled-pick-return-intervention',
    parityClaim: false,
    source: context.source,
    verifiedUnitByteReplay: context.verifiedUnitByteReplay,
    selectedUnit: {
      ordinal: context.selectedUnit.ordinal,
      id: context.selectedUnit.id,
      nearestObservedParentName: context.selectedUnit.nearestObservedParentName,
      canvasMapDimensions: context.selectedUnit.entryContext.fillMap?.dimensions ?? null,
      entryContext: context.selectedUnit.entryContext,
      nativePickCalls: context.selectedUnit.pickCalls,
      randomCalls: context.selectedUnit.randomCalls,
      colorSelections: context.selectedUnit.colorSelections,
      traceReturnSemantics: 'CALL-RETURN rows record the natural value before the explicit caller-visible substitution row.',
    },
    intervention: {
      pickOrdinal: expected.pickOrdinal,
      callId: substitution.callId,
      arguments: substitution.arguments,
      nativeReturn,
      callerVisibleReturn: callerReturn,
      prevdexAtNestedRandomEntry: prevdexAtRandomEntry,
      naturalRandomCallId: random.id,
      naturalRandomIndex: randomIndex,
      ...policyEvidenceField,
      predictedFollowingHdexWrite: predictsWrite,
      followingHdexWrites,
      candidateMatchesThisIntervention: observedCandidateMatch,
      classification: 'intentional output intervention; not natural parity',
    },
    outputHashComparisons,
    limitations: [
      targetScopeLimitation,
      'The observed caller label is a captured trace wrapper boundary; unwrapped helpers may intervene between the selected functions.',
      'A match or mismatch here does not establish a general color rule or a JavaScript color contract.',
      'Fresh uninstrumented controls establish a stable baseline; the intervention outputs are intentionally allowed to diverge.',
    ],
  };
}

async function main() {
  const [beforePath, observerPath, afterPath, outputPath] = process.argv.slice(2);
  if (!beforePath || !observerPath || !afterPath || !outputPath || process.argv.length !== 6) {
    console.error('Usage: derive-pick-return-intervention-evidence.mjs BEFORE OBSERVER AFTER OUTPUT.json');
    process.exitCode = 2;
    return;
  }
  const evidence = await derivePickReturnInterventionEvidence(
    beforePath, observerPath, afterPath,
  );
  const absoluteOutput = path.resolve(outputPath);
  writeFileSync(absoluteOutput, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    outputPath: absoluteOutput,
    probeVersion: evidence.source.probeVersion,
    pickOrdinal: evidence.intervention.pickOrdinal,
    nativeReturn: evidence.intervention.nativeReturn,
    callerVisibleReturn: evidence.intervention.callerVisibleReturn,
    prevdex: evidence.intervention.prevdexAtNestedRandomEntry,
    followingHdexWrites: evidence.intervention.followingHdexWrites,
    candidateMatchesThisIntervention: evidence.intervention.candidateMatchesThisIntervention,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
