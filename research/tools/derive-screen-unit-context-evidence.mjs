#!/usr/bin/env node

// Derive one compact, source-bound SCREEN-AND-STORE context sample from a
// fresh uninstrumented / observer / uninstrumented triplet.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { deriveScreenUnitEvidence } from './derive-screen-unit-evidence.mjs';
import { verifyLocalAaronTriplet } from './verify-local-aaron-triplet.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactlyOne(lines, pattern, label) {
  const matches = lines.filter((line) => pattern.test(line));
  assert.equal(matches.length, 1, `Expected one ${label}, found ${matches.length}`);
  return matches[0];
}

function parseSimpleNumberList(text, label) {
  assert.match(text, /^\([^()]*\)$/, `${label} is not a flat printed list`);
  const body = text.slice(1, -1).trim();
  if (!body) return [];
  const values = body.split(/\s+/);
  assert.ok(values.every((value) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)),
    `${label} contains a non-numeric value`);
  return values;
}

function contextNumber(context, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`:NAME "${escaped}" :BOUND T :VALUE \\(:NUMBER [^ )]+ (-?\\d+)\\)`).exec(context);
  return match ? Number(match[1]) : null;
}

function contextMapShape(context, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`:NAME "${escaped}" :BOUND T :VALUE \\(:ARRAY-TYPE \\(ARRAY .*?#\\d+=\\((\\d+) (\\d+)\\)\\) :RANK (\\d+) :DIMENSIONS #\\d+#\\)`).exec(context);
  return match ? { rank: Number(match[3]), dimensions: [Number(match[1]), Number(match[2])] } : null;
}

function parseContextReport(text, probeTag) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd();
  const lines = normalized.split('\n');
  assert.equal(lines[0], `BEGIN ${probeTag}`);
  assert.equal(lines.at(-1), `END ${probeTag}`);
  assert.ok(lines.some((line) => /^INSTALL .* ran=T hook=post-event$/.test(line)),
    'observer did not record installation');
  const ready = exactlyOne(lines, new RegExp(`^READY ${probeTag} `), 'READY marker');
  assert.match(ready, /"MAIN"/);
  assert.match(ready, /"RPARSE"/);
  assert.match(ready, /"SCREEN-AND-STORE"/);
  assert.match(ready, /"PREP-LINE"/);
  assert.match(ready, /"STORE-IN-FILE"/);
  const optionalTargetsInstalled = lines
    .filter((line) => line.startsWith('OPTIONAL-TARGET-INSTALLED '))
    .map((line) => {
      const match = /^OPTIONAL-TARGET-INSTALLED name=([A-Z0-9-]+)$/.exec(line);
      assert.ok(match, `malformed optional-target event: ${line}`);
      return match[1];
    });
  if (!optionalTargetsInstalled.length && ready.includes('"BRUSH-STROKE"')) {
    optionalTargetsInstalled.push('BRUSH-STROKE');
  }
  assert.ok(!lines.some((line) => /^(?:INCOMPLETE|OVERFLOW|OBSERVER-ERROR)\b/.test(line)),
    'observer report contains an incomplete, overflow, or error record');

  const selected = exactlyOne(lines, /^UNIT-SELECT /, 'selected natural unit');
  const selectMatch = /^UNIT-SELECT ordinal=(\d+) call-id=(\d+) parent-id=(\d+)$/.exec(selected);
  assert.ok(selectMatch, 'malformed UNIT-SELECT marker');
  const [, ordinalText, idText, parentText] = selectMatch;
  const selectedOrdinal = Number(ordinalText);
  const unitId = Number(idText);
  const parentId = Number(parentText);
  const expectedOrdinal = {
    'screen-unit-context-v1': 1,
    'screen-unit-context-v2': 1,
    'screen-unit-context-v3': 2,
    'screen-unit-context-v4': 3,
    'screen-unit-context-v5': 5,
  }[probeTag];
  assert.ok(expectedOrdinal, `unexpected screen-unit context probe version: ${probeTag}`);
  assert.equal(selectedOrdinal, expectedOrdinal,
    `${probeTag} must select post-RPARSE screen unit ${expectedOrdinal}`);

  const ancestors = [];
  for (const line of lines.filter((candidate) => candidate.startsWith('ANCESTOR '))) {
    const match = /^ANCESTOR id=(\d+) parent-id=(NIL|\d+) name=([A-Z0-9-]+) trace-depth=(\d+) args=(.*)$/.exec(line);
    assert.ok(match, `malformed ancestor row: ${line.slice(0, 100)}`);
    ancestors.push({
      id: Number(match[1]),
      parentId: match[2] === 'NIL' ? null : Number(match[2]),
      name: match[3],
      traceDepth: Number(match[4]),
      argsSummary: match[5],
    });
  }
  assert.equal(ancestors.at(-1)?.id, parentId,
    'UNIT-SELECT parent must be the nearest captured ancestor');

  const entered = exactlyOne(lines, /^UNIT-ENTER /, 'unit entry');
  const enterMatch = /^UNIT-ENTER ordinal=(\d+) id=(\d+) parent-id=(\d+) trace-depth=(\d+) args=(.*?) context=(.*?) path-rng-source=(\S+) color-map-source=(\S+) writer-source=(\S+)$/.exec(entered);
  assert.ok(enterMatch, 'malformed UNIT-ENTER row');
  assert.equal(Number(enterMatch[1]), selectedOrdinal);
  assert.equal(Number(enterMatch[2]), unitId);
  assert.equal(Number(enterMatch[3]), parentId);

  const exited = exactlyOne(lines, /^UNIT-EXIT /, 'unit exit');
  const exitMatch = /^UNIT-EXIT id=(\d+) status=SUCCESS prep-count=(\d+) store-count=(\d+) context=(.*)$/.exec(exited);
  assert.ok(exitMatch, 'malformed UNIT-EXIT row');
  assert.equal(Number(exitMatch[1]), unitId);

  const complete = exactlyOne(lines, /^COMPLETE /, 'COMPLETE marker');
  const completeMatch = /^COMPLETE unit-id=(\d+) prep-count=(\d+) store-count=(\d+) writer-first=(\d+) writer-last=(\d+) ran-count=(\d+)$/.exec(complete);
  assert.ok(completeMatch, 'malformed COMPLETE marker');
  const [, completeId, prepText, storeText, firstText, lastText, ranText] = completeMatch;
  assert.equal(Number(completeId), unitId);
  assert.equal(lines.at(-2), complete);

  const callEnters = lines.filter((line) => line.startsWith('CALL-ENTER ')).map((line) => {
    const match = /^CALL-ENTER id=(\d+) parent-id=(NIL|\d+) name=([A-Z0-9-]+) trace-depth=(\d+) writer-ordinal=(NIL|\d+) args=(.*)$/.exec(line);
    assert.ok(match, `malformed call entry: ${line.slice(0, 100)}`);
    return {
      id: Number(match[1]),
      parentId: match[2] === 'NIL' ? null : Number(match[2]),
      name: match[3],
      traceDepth: Number(match[4]),
      writerOrdinal: match[5] === 'NIL' ? null : Number(match[5]),
      argsSummary: match[6],
    };
  });
  const callEnds = new Map(lines.filter((line) => line.startsWith('CALL-END ')).map((line) => {
    const match = /^CALL-END id=(\d+) parent-id=(NIL|\d+) name=([A-Z0-9-]+) trace-depth=(\d+) status=([A-Z]+)$/.exec(line);
    assert.ok(match, `malformed call end: ${line.slice(0, 100)}`);
    return [Number(match[1]), {
      parentId: match[2] === 'NIL' ? null : Number(match[2]),
      name: match[3], traceDepth: Number(match[4]), status: match[5],
    }];
  }));
  const screenCalls = callEnters.filter((call) => call.name === 'SCREEN-AND-STORE');
  assert.equal(screenCalls.length, 1);
  assert.equal(screenCalls[0].id, unitId);
  assert.equal(screenCalls[0].parentId, parentId);
  assert.equal(callEnds.get(unitId)?.status, 'SUCCESS');
  assert.equal(callEnds.get(unitId)?.name, 'SCREEN-AND-STORE');

  for (const call of callEnters) {
    const end = callEnds.get(call.id);
    assert.ok(end, `call ${call.id} has no paired exit`);
    assert.equal(end.status, 'SUCCESS', `call ${call.id} did not return normally`);
    assert.equal(end.name, call.name);
    assert.equal(end.parentId, call.parentId);
  }
  for (const [id, end] of callEnds) {
    const entry = callEnters.find((call) => call.id === id);
    if (!entry) {
      const ancestor = ancestors.find((frame) => frame.id === id);
      assert.ok(ancestor, `unpaired exit ${id} is not a captured ancestor`);
      assert.equal(end.name, ancestor.name);
      assert.equal(end.parentId, ancestor.parentId);
      assert.equal(end.traceDepth, ancestor.traceDepth);
      assert.equal(end.status, 'SUCCESS');
    }
  }

  const prepCalls = callEnters.filter((call) => call.name === 'PREP-LINE');
  const writerCalls = callEnters.filter((call) => call.name === 'STORE-IN-FILE');
  assert.equal(prepCalls.length, Number(prepText));
  assert.equal(writerCalls.length, Number(storeText));
  assert.equal(prepCalls.length, Number(exitMatch[2]));
  assert.equal(writerCalls.length, Number(exitMatch[3]));
  assert.ok(writerCalls.every((call) => call.parentId === unitId && call.writerOrdinal !== null),
    'writer calls must belong to the selected screen unit and have full-tape ordinals');
  const writerOrdinals = writerCalls.map((call) => call.writerOrdinal);
  assert.equal(writerOrdinals[0], Number(firstText));
  assert.equal(writerOrdinals.at(-1), Number(lastText));
  assert.ok(writerOrdinals.every((ordinal, index) => index === 0 || ordinal === writerOrdinals[index - 1] + 1),
    'writer ordinals are not contiguous');

  const colorStates = new Map(lines.filter((line) => line.startsWith('COLOR-STATE ')).map((line) => {
    const match = /^COLOR-STATE id=(\d+) writer-ordinal=(\d+) args=(.*?) context=(.*)$/.exec(line);
    assert.ok(match, `malformed COLOR-STATE row: ${line.slice(0, 100)}`);
    return [Number(match[1]), {
      writerOrdinal: Number(match[2]), argsSummary: match[3], contextSummary: match[4],
    }];
  }));
  const prepStates = new Map(lines.filter((line) => line.startsWith('PREP-STATE ')).map((line) => {
    const match = /^PREP-STATE id=(\d+) args=(.*?) context=(.*)$/.exec(line);
    assert.ok(match, `malformed PREP-STATE row: ${line.slice(0, 100)}`);
    return [Number(match[1]), { argsSummary: match[2], contextSummary: match[3] }];
  }));
  const colors = writerCalls.flatMap((call) => {
    const match = /\(:SYMBOL "COMMON-GRAPHICS-USER" "AARGB"\) \(:SYMBOL "KEYWORD" "HDEX"\) \(:NUMBER FIXNUM (-?\d+)\)/.exec(call.argsSummary);
    if (!match) return [];
    const state = colorStates.get(call.id);
    if (state) assert.equal(state.writerOrdinal, call.writerOrdinal);
    return [{
      id: call.id,
      writerOrdinal: call.writerOrdinal,
      index: Number(match[1]),
      argsSummary: state?.argsSummary ?? null,
      contextSummary: state?.contextSummary ?? null,
    }];
  });
  if (['screen-unit-context-v3', 'screen-unit-context-v4'].includes(probeTag)) {
    assert.equal(colorStates.size, colors.length,
      'typed context probes must snapshot every AARGB HDEX writer call');
    assert.equal(prepStates.size, prepCalls.length,
      'typed context probes must snapshot every PREP-LINE call');
  }

  const ranEnters = new Map(lines.filter((line) => line.startsWith('RAN-ENTER ')).map((line) => {
    const match = /^RAN-ENTER id=(\d+) parent-id=(NIL|\d+) screen-id=(\d+) args=(\([^()]*\))(?: typed-args=(.*?) context=(.*))?$/.exec(line);
    assert.ok(match, `malformed RAN-ENTER row: ${line.slice(0, 100)}`);
    return [Number(match[1]), {
      parentId: match[2] === 'NIL' ? null : Number(match[2]),
      screenId: Number(match[3]),
      args: parseSimpleNumberList(match[4], 'RAN arguments'),
      typedArgsSummary: match[5] ?? null,
      entryContextSummary: match[6] ?? null,
    }];
  }));
  const ranReturns = new Map(lines.filter((line) => line.startsWith('RAN-RETURN ')).map((line) => {
    const match = /^RAN-RETURN id=(\d+) values=(\([^()]*\))(?: typed-values=(.*?) context=(.*))?$/.exec(line);
    assert.ok(match, `malformed RAN-RETURN row: ${line.slice(0, 100)}`);
    return [Number(match[1]), {
      values: parseSimpleNumberList(match[2], 'RAN values'),
      typedValuesSummary: match[3] ?? null,
      returnContextSummary: match[4] ?? null,
    }];
  }));
  assert.equal(ranEnters.size, Number(ranText));
  assert.equal(ranReturns.size, ranEnters.size);
  const randomCalls = [...ranEnters].map(([id, call]) => {
    assert.equal(call.screenId, unitId);
    assert.ok(ranReturns.has(id), `RAN call ${id} has no return`);
    const returned = ranReturns.get(id);
    assert.equal(returned.values.length, 1, `RAN call ${id} returned an unexpected number of values`);
    return {
      id, parentId: call.parentId, args: call.args, values: returned.values,
      typedArgsSummary: call.typedArgsSummary,
      entryContextSummary: call.entryContextSummary,
      typedValuesSummary: returned.typedValuesSummary,
      returnContextSummary: returned.returnContextSummary,
    };
  });

  const prepLineEvents = prepCalls.map((call) => {
    const match = /^\(:CONS \(\(:NUMBER FIXNUM (-?\d+)\)/.exec(call.argsSummary);
    assert.ok(match, `PREP-LINE call ${call.id} has no numeric color argument`);
    const state = prepStates.get(call.id);
    return {
      id: call.id, colorIndex: Number(match[1]),
      argsSummary: state?.argsSummary ?? null,
      contextSummary: state?.contextSummary ?? null,
    };
  });
  const decisionTimeline = [
    ...randomCalls.map(({ id, args, values, typedArgsSummary, entryContextSummary,
      typedValuesSummary, returnContextSummary }) => ({
      id, event: 'RAN', args, values, typedArgsSummary, entryContextSummary,
      typedValuesSummary, returnContextSummary,
    })),
    ...colors.map(({ id, writerOrdinal, index, argsSummary, contextSummary }) => ({
      id, event: 'AARGB-HDEX', writerOrdinal, index, argsSummary, contextSummary,
    })),
    ...prepLineEvents.map(({ id, colorIndex, argsSummary, contextSummary }) => ({
      id, event: 'PREP-LINE', colorIndex, argsSummary, contextSummary,
    })),
  ].sort((a, b) => a.id - b.id);

  const entryContext = enterMatch[6];
  const exitContext = exitMatch[4];
  const mapState = (context) => ({
    rplane: contextNumber(context, 'RPLANE'),
    sdex: contextNumber(context, 'SDEX'),
    boundaryValue: contextNumber(context, 'BOUNDARY-VALUE'),
    prevdex: contextNumber(context, 'PREVDEX'),
    brushType: /:NAME "BRUSH" :BOUND T :VALUE \(:OBJECT-TYPE ([^)]+)\)/.exec(context)?.[1] ?? null,
    fillMap: contextMapShape(context, 'FILL-MAP'),
    patchMap: contextMapShape(context, 'PATCH-MAP'),
  });

  return {
    selectedUnit: {
      ordinal: selectedOrdinal,
      id: unitId,
      nearestObservedParentId: parentId,
      nearestObservedParentName: ancestors.at(-1)?.name ?? null,
      optionalTargetsInstalled,
      traceDepth: Number(enterMatch[4]),
      argsSummary: enterMatch[5],
      nearestObservedAncestry: ancestors,
      entryContext: mapState(entryContext),
      exitContext: mapState(exitContext),
      prepLineCalls: prepCalls.length,
      writerCalls: writerCalls.length,
      writerOrdinals: [Number(firstText), Number(lastText)],
      colorSelections: colors,
      decisionTimeline,
      randomCalls,
    },
  };
}

export async function deriveScreenUnitContextEvidence(beforePath, observerPath, afterPath) {
  const verified = await verifyLocalAaronTriplet(beforePath, observerPath, afterPath, {
    observerOnlyOutputNames: ['aaron-planning-call-trace.txt'],
  });
  const [before, observer, after] = verified.runs;
  assert.ok(['screen-unit-seed-1234', 'screen-unit-seed-5678'].includes(observer.summary.mode));
  const probeMatch = /^aaron-(screen-unit-context-v[12345])\.txt$/.exec(observer.summary.requiredProbeOutputName);
  assert.ok(probeMatch, 'unexpected screen-unit context probe output name');
  const probeTag = probeMatch[1];
  assert.equal(observer.summary.requiredProbeEndMarker, `END ${probeTag}`);

  const capture = observer.capturePath;
  const reportBytes = readFileSync(path.join(capture, observer.summary.requiredProbeOutputName));
  const writerBytes = readFileSync(path.join(capture, 'aaron-writer-full.txt'));
  const screenBytes = readFileSync(path.join(capture, 'aaron-screen-units.txt'));
  const imageBytes = readFileSync(path.join(capture, 'image'));
  const colorPath = path.join(capture, 'aaron-screen-color-data.txt');
  const colorBytes = existsSync(colorPath) ? readFileSync(colorPath) : null;
  const screenEvidence = deriveScreenUnitEvidence(
    screenBytes, writerBytes, imageBytes, observer.summary,
  );
  const contextEvidence = parseContextReport(reportBytes.toString('utf8'), probeTag);
  const selected = contextEvidence.selectedUnit;
  const correspondingScreen = screenEvidence.units[selected.ordinal - 1];
  assert.ok(correspondingScreen, `screen report has no unit ordinal ${selected.ordinal}`);
  assert.deepEqual(selected.writerOrdinals, correspondingScreen.writerOrdinals);
  assert.equal(selected.writerCalls, correspondingScreen.writerCallCount);
  assert.deepEqual(selected.colorSelections.map((item) => item.index),
    correspondingScreen.colorEvents.map((item) => item.index));
  assert.ok(selected.entryContext.fillMap?.rank > 0,
    'selected unit has no observable fill-map shape');

  return {
    schemaVersion: 1,
    source: {
      mode: observer.summary.mode,
      probeVersion: probeTag,
      controlRunIds: [before.summary.runId, after.summary.runId],
      observerRunId: observer.summary.runId,
      aa0Sha256: observer.summary.aa0Sha256,
      probeSourceSha256: verified.probeSourceHash,
      contextReportSha256: sha256(reportBytes),
      screenUnitReportSha256: sha256(screenBytes),
      writerTapeSha256: sha256(writerBytes),
      writerTapeComplete: !screenEvidence.source.writerTapeOverflow,
      writerTapeRecordedCalls: screenEvidence.source.writerTapeRecordedCalls,
      writerTapeTotalCalls: screenEvidence.source.writerTapeTotalCalls,
      writerTapeCoverageThroughOutputPosition: screenEvidence.source.writerTapeCoveredThroughOutputPosition,
      imageSha256: sha256(imageBytes),
      colorMapReportSha256: colorBytes ? sha256(colorBytes) : null,
      matchedControlOutputs: verified.artifactHashes,
      matchedOrdinarySceneSources: Object.keys(verified.sourceHashes).length,
    },
    verifiedUnitByteReplay: {
      screenUnitOrdinal: selected.ordinal,
      pointCount: correspondingScreen.points.length,
      colorEvents: correspondingScreen.colorEvents,
      writerCalls: correspondingScreen.writerCallCount,
      writerOrdinals: correspondingScreen.writerOrdinals,
      byteLength: correspondingScreen.byteLength,
      byteSha256: correspondingScreen.byteSha256,
    },
    ...contextEvidence,
    interpretation: [
      'Nearest observed target ancestry is not proof of a direct Lisp caller; unwrapped functions may intervene.',
      'This is one selected natural screen unit from one controlled seed and the DISPLAY-COLOR-PATCHES path, not a general color-selection rule.',
      'The observer records current map dimensions and selected bindings, not full map contents or deltas.',
      'A capped global writer tape is used only when the selected screen-unit byte interval is fully inside the recorded prefix; no behavior after that prefix is inferred.',
      'The JS screen writer still receives path points and color events as captured inputs; this evidence does not add an upstream JS contract.',
    ],
  };
}

async function main() {
  const [beforePath, observerPath, afterPath, outputPath] = process.argv.slice(2);
  if (!beforePath || !observerPath || !afterPath || !outputPath || process.argv.length !== 6) {
    console.error('Usage: derive-screen-unit-context-evidence.mjs BEFORE OBSERVER AFTER OUTPUT.json');
    process.exitCode = 2;
    return;
  }
  const evidence = await deriveScreenUnitContextEvidence(beforePath, observerPath, afterPath);
  const absoluteOutput = path.resolve(outputPath);
  writeFileSync(absoluteOutput, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({
    outputPath: absoluteOutput,
    aa0Sha256: evidence.source.aa0Sha256,
    unit: evidence.selectedUnit.id,
    nearestObservedParent: evidence.selectedUnit.nearestObservedAncestry.at(-1)?.name,
    randomCalls: evidence.selectedUnit.randomCalls.length,
    writerCalls: evidence.selectedUnit.writerCalls,
    verifiedPointCount: evidence.verifiedUnitByteReplay.pointCount,
    verifiedUnitBytes: evidence.verifiedUnitByteReplay.byteLength,
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
