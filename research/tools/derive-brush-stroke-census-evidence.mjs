#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseBrushStrokeCensusReport } from './parse-brush-stroke-census-report.mjs';
import { sha256 } from './index-allegro-image.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const read = path => readFileSync(resolve(path));
const parseJson = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const exactArray = (value, expected, label) => {
  assert(Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected), `${label} differs`);
};
const hexSha = (value, label) => {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value), `${label} is not a SHA-256`);
  return value.toLowerCase();
};
const add = (object, key, amount = 1) => { object[key] = (object[key] ?? 0) + amount; };
const pathKind = length => length === 0 ? 'empty' : length === 1 ? 'singleton' : 'multi';
const sortedCounts = counts => Object.fromEntries(Object.entries(counts)
  .sort((left, right) => Number(left[0]) - Number(right[0])));
const sortedNamedCounts = counts => Object.fromEntries(Object.entries(counts)
  .sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));

function run(rootArg, expected, currentProbe) {
  const root = resolve(rootArg);
  const rootName = basename(root);
  const summaryBytes = read(`${root}/summary.json`);
  const summary = parseJson(summaryBytes);
  assert(summary.complete === true, `${rootName} is not a complete oracle run`);
  assert(summary.runId === rootName && summary.mode === expected.mode, `${rootName} run identity/mode differs`);
  assert(typeof summary.smallImage === 'boolean', `${rootName} smallImage setting is missing`);
  for (const key of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    summary[key] = hexSha(summary[key], `${rootName} ${key}`);
  }

  const aa0 = read(`${root}/capture/aa0`);
  const scene = read(`${root}/capture/aaron-scene-state-snapshot.txt`);
  const aa0Sha256 = sha256(aa0);
  const sceneSha256 = sha256(scene);
  assert(aa0Sha256 === hexSha(summary.aa0Sha256, `${rootName} summary AA0 hash`)
    && sceneSha256 === hexSha(summary.sceneReportSha256, `${rootName} summary scene hash`),
  `${rootName} summary hashes do not match actual output bytes`);

  let requestSha256 = null;
  let stagedSourceSha256 = null;
  let requestInfo = null;
  if (expected.observed) {
    const requestPath = `${root}/pre-scene-probe-request.json`;
    const stagedPath = `${root}/capture/aaron-pre-scene-probe.cl`;
    assert(existsSync(requestPath) && existsSync(stagedPath), `${rootName} lacks its staged probe/request`);
    const requestBytes = read(requestPath);
    const request = parseJson(requestBytes);
    const requestKeys = ['schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256',
      'pauseSeconds', 'releaseFile', 'probeOutputNames'];
    assert(Object.keys(request).length === requestKeys.length
      && requestKeys.every(key => Object.hasOwn(request, key)), `${rootName} request fields differ`);
    assert(request.schemaVersion === 1 && request.runId === summary.runId,
      `${rootName} request ID differs from summary`);
    assert(request.releaseFile === 'C:\\temp\\aaron-native-code-release.txt',
      `${rootName} request release-file path differs`);
    const runtime = resolve(request.runtimeExecutable);
    assert(basename(runtime).toLowerCase() === 'aaron.exe'
      && dirname(runtime).toLowerCase() === resolve(root, 'runtime').toLowerCase(),
    `${rootName} request runtime is outside the owned run root`);
    assert(request.pauseSeconds === 0 && summary.preSceneProbePauseSeconds === 0,
      `${rootName} probe pause was not zero`);
    exactArray(request.probeOutputNames, ['aaron-brush-stroke-census.txt'], `${rootName} request outputs`);
    exactArray(summary.probeOutputNames, request.probeOutputNames, `${rootName} summary outputs`);

    const staged = read(stagedPath);
    assert(staged.equals(currentProbe), `${rootName} staged source differs byte-for-byte from the current probe`);
    stagedSourceSha256 = sha256(staged);
    const requestProbeSha256 = hexSha(request.probeSha256, `${rootName} request probe hash`);
    const summaryProbeSha256 = hexSha(summary.preSceneProbeSha256, `${rootName} summary probe hash`);
    assert(stagedSourceSha256 === requestProbeSha256 && requestProbeSha256 === summaryProbeSha256,
      `${rootName} staged/request/summary probe hashes differ`);
    requestSha256 = sha256(requestBytes);
    requestInfo = {
      present: true,
      schemaVersion: request.schemaVersion,
      runId: request.runId,
      runtimeExecutableBasename: basename(runtime),
      runtimeRunRoot: rootName,
      runtimeRootMatches: true,
      pauseSeconds: request.pauseSeconds,
      probeOutputNames: request.probeOutputNames,
    };
  } else {
    assert(summary.preSceneProbeSha256 === null && summary.preSceneProbePauseSeconds === 0,
      `${rootName} control has probe metadata`);
    exactArray(summary.probeOutputNames, [], `${rootName} control probe outputs`);
    for (const path of [
      `${root}/pre-scene-probe-request.json`,
      `${root}/capture/aaron-pre-scene-probe.cl`,
      `${root}/capture/aaron-brush-stroke-census.txt`,
    ]) assert(!existsSync(path), `${rootName} control contains a pre-scene probe artifact`);
    requestInfo = {
      present: false,
      preSceneProbeSha256: null,
      pauseSeconds: summary.preSceneProbePauseSeconds,
      probeOutputNames: summary.probeOutputNames,
    };
  }

  let census = null;
  let rawSha256 = null;
  if (expected.observed) {
    const raw = read(`${root}/capture/aaron-brush-stroke-census.txt`);
    rawSha256 = sha256(raw);
    census = parseBrushStrokeCensusReport(raw.toString('utf8'));
    assert(census.sourceSha256 === rawSha256, `${rootName} strict parser raw hash differs`);
  }

  return {
    root: rootName,
    summary,
    summarySha256: sha256(summaryBytes),
    requestSha256,
    requestInfo,
    stagedSourceSha256,
    censusRawSha256: rawSha256,
    census,
    aa0,
    scene,
    aa0Sha256,
    sceneSha256,
    outputBytes: { aa0: aa0.length, sceneReport: scene.length },
  };
}

function tallyCalls(report) {
  const byValue = Object.create(null);
  const byValueAndPath = Object.create(null);
  const byBrush = Object.create(null);
  const pathKinds = Object.create(null);
  const screensPerCall = Object.create(null);
  const resultArities = Object.create(null);
  const resultDescriptors = Object.create(null);
  const sampledCallRows = Object.create(null);
  report.calls.forEach(call => {
    const kind = pathKind(call.pathLength);
    const brushKey = call.brushIndex === null ? `unindexed:${call.brushType}` : String(call.brushIndex);
    const brush = byBrush[brushKey] ??= {
      brushIndex: call.brushIndex, brushType: call.brushType,
      calls: 0, byValue: Object.create(null), pathKinds: Object.create(null),
      screensPerCall: Object.create(null), screenCalls: 0,
    };
    const valueGroup = byValue[String(call.value)] ??= {
      value: call.value, calls: 0, pathKinds: Object.create(null),
      screensPerCall: Object.create(null), screenCalls: 0,
      withinStrokePredicateCalls: 0, acceptedPredicateResults: 0, rejectedPredicateResults: 0,
    };
    const valuePathGroup = byValueAndPath[String(call.value)] ??= Object.create(null);
    const valuePath = valuePathGroup[kind] ??= {
      calls: 0, screensPerCall: Object.create(null), returnArities: Object.create(null),
      resultDescriptors: Object.create(null),
    };
    const brushValue = brush.byValue[String(call.value)] ??= { calls: 0, pathKinds: Object.create(null) };

    add(pathKinds, kind);
    add(screensPerCall, String(call.counts.screens));
    add(valueGroup.pathKinds, kind);
    add(valueGroup.screensPerCall, String(call.counts.screens));
    add(valueGroup, 'calls');
    add(valueGroup, 'screenCalls', call.counts.screens);
    add(valueGroup, 'withinStrokePredicateCalls', call.counts.predicates + call.counts.screenPredicates);
    add(valueGroup, 'acceptedPredicateResults', call.counts.accepted);
    add(valueGroup, 'rejectedPredicateResults', call.counts.rejected);
    add(valuePath, 'calls');
    add(valuePath.screensPerCall, String(call.counts.screens));
    add(valuePath.returnArities, String(call.values.length));

    add(brush, 'calls');
    add(brush, 'screenCalls', call.counts.screens);
    add(brush.pathKinds, kind);
    add(brush.screensPerCall, String(call.counts.screens));
    add(brushValue, 'calls');
    add(brushValue.pathKinds, kind);

    add(resultArities, String(call.values.length));
    for (const value of call.values) {
      const key = value.kind === 'object' ? `object:${value.type}` : value.kind;
      add(resultDescriptors, key);
      const byValueDescriptor = valueGroup.resultDescriptors ??= Object.create(null);
      add(byValueDescriptor, key);
      add(valuePath.resultDescriptors, key);
    }

    const row = {
      id: call.id,
      pathLength: call.pathLength,
      pathKind: kind,
      value: call.value,
      cdex: call.cdex,
      sdex: call.sdex,
      brushIndex: call.brushIndex,
      brushType: call.brushType,
      mapDimensions: call.mapDimensions,
      returnedValues: call.values,
      counts: call.counts,
    };
    const valueSamples = sampledCallRows[String(call.value)] ??= Object.create(null);
    if (!Object.hasOwn(valueSamples, kind)) {
      valueSamples[kind] = {
        selection: 'first observed call for this VALUE and path kind',
        row,
      };
    }
  });

  for (const bucket of Object.values(byValue)) {
    bucket.pathKinds = sortedNamedCounts(bucket.pathKinds);
    bucket.screensPerCall = sortedCounts(bucket.screensPerCall);
    bucket.resultDescriptors = sortedNamedCounts(bucket.resultDescriptors ?? {});
  }
  for (const pathGroups of Object.values(byValueAndPath)) {
    for (const path of Object.values(pathGroups)) {
      path.screensPerCall = sortedCounts(path.screensPerCall);
      path.returnArities = sortedCounts(path.returnArities);
      path.resultDescriptors = sortedNamedCounts(path.resultDescriptors);
    }
  }
  for (const brush of Object.values(byBrush)) {
    brush.byValue = Object.fromEntries(Object.entries(brush.byValue)
      .sort((left, right) => Number(left[0]) - Number(right[0]))
      .map(([value, bucket]) => [value, { ...bucket, pathKinds: sortedNamedCounts(bucket.pathKinds) }]));
    brush.pathKinds = sortedNamedCounts(brush.pathKinds);
    brush.screensPerCall = sortedCounts(brush.screensPerCall);
  }

  const complete = report.complete;
  const withinStrokePredicateCalls = complete.localSums.predicates + complete.localSums.screenPredicates;
  const canonicalCallsJson = JSON.stringify(report.calls);
  const canonicalCallsBytes = Buffer.from(canonicalCallsJson, 'utf8');
  return {
    callArrayCommitment: {
      count: report.calls.length,
      canonicalJsonUtf8Bytes: canonicalCallsBytes.length,
      canonicalJsonSha256: sha256(canonicalCallsBytes),
      canonicalization: 'UTF-8 bytes of JSON.stringify(strictly parsed census.calls array)',
      sampledRows: {
        selection: 'first observed row for each VALUE and path kind; these samples are illustrative and are not the complete call list',
        byValueAndPath: Object.fromEntries(Object.entries(sampledCallRows)
          .sort((left, right) => Number(left[0]) - Number(right[0]))),
      },
    },
    aggregates: {
      calls: report.calls.length,
      byValue: Object.fromEntries(Object.entries(byValue).sort((left, right) => Number(left[0]) - Number(right[0]))),
      byValueAndPath: Object.fromEntries(Object.entries(byValueAndPath)
        .sort((left, right) => Number(left[0]) - Number(right[0]))),
      pathKinds: sortedNamedCounts(pathKinds),
      byBrush: Object.fromEntries(Object.entries(byBrush).sort((left, right) => {
        const a = left[1].brushIndex; const b = right[1].brushIndex;
        return a === null ? (b === null ? left[0].localeCompare(right[0]) : 1)
          : b === null ? -1 : a - b;
      })),
      screensPerCall: sortedCounts(screensPerCall),
      naturalReturnValueArities: sortedCounts(resultArities),
      naturalReturnDescriptors: sortedCounts(resultDescriptors),
      predicateCounts: {
        naturalCallsGlobal: complete.predicates,
        inStrokeCalls: withinStrokePredicateCalls,
        inStrokeNonScreenCalls: complete.localSums.predicates,
        inStrokeScreenCalls: complete.localSums.screenPredicates,
        acceptedResults: complete.localSums.accepted,
        rejectedResults: complete.localSums.rejected,
        outsideStrokeCalls: complete.predicates - withinStrokePredicateCalls,
      },
      naturalReaderAndBoundaryCounts: {
        clears: complete.clears,
        screensGlobal: complete.screens,
        screensWithinStrokes: complete.localSums.screens,
        xReadsGlobal: complete['x-reads'],
        xReadsWithinStrokes: complete.localSums.xReads,
        yReadsGlobal: complete['y-reads'],
        yReadsWithinStrokes: complete.localSums.yReads,
        coreReadsGlobal: complete['core-reads'],
        coreReadsWithinStrokes: complete.localSums.coreReads,
        randomPreviewChecks: complete.checks,
      },
    },
  };
}

function comparePair(observed, control, seed) {
  assert(observed.summary.mode === control.summary.mode, `Seed ${seed} observed/control modes differ`);
  assert(observed.summary.smallImage === control.summary.smallImage, `Seed ${seed} smallImage differs`);
  for (const key of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(observed.summary[key] === control.summary[key], `Seed ${seed} setup differs: ${key}`);
  }
  assert(observed.aa0.equals(control.aa0) && observed.scene.equals(control.scene),
    `Seed ${seed} actual AA0 or scene report bytes differ`);
  return {
    seed,
    mode: observed.summary.mode,
    aa0ByteIdentical: true,
    sceneReportByteIdentical: true,
    setupIdentical: true,
    observed: {
      root: observed.root, runId: observed.summary.runId,
      mode: observed.summary.mode, smallImage: observed.summary.smallImage,
      summarySha256: observed.summarySha256, requestSha256: observed.requestSha256,
      stagedProbeSha256: observed.stagedSourceSha256, rawCensusSha256: observed.censusRawSha256,
      request: observed.requestInfo,
      aa0Sha256: observed.aa0Sha256, sceneReportSha256: observed.sceneSha256,
      outputBytes: observed.outputBytes,
    },
    control: {
      root: control.root, runId: control.summary.runId,
      mode: control.summary.mode, smallImage: control.summary.smallImage,
      summarySha256: control.summarySha256,
      request: control.requestInfo,
      aa0Sha256: control.aa0Sha256, sceneReportSha256: control.sceneSha256,
      outputBytes: control.outputBytes,
    },
    setup: {
      smallImage: observed.summary.smallImage,
      installerSha256: observed.summary.installerSha256,
      registryPatchSha256: observed.summary.registryPatchSha256,
      licensePatchSha256: observed.summary.licensePatchSha256,
    },
    census: {
      ...tallyCalls(observed.census),
      brushes: observed.census.brushes,
      globalComplete: observed.census.complete,
    },
  };
}

export function deriveBrushStrokeCensusEvidence(observed1234Root, control1234Root,
  observed5678Root, control5678Root) {
  const currentProbe = read('research/introspection/brush-stroke-census-capture.cl');
  const parserBytes = read('research/tools/parse-brush-stroke-census-report.mjs');
  const probeSha256 = sha256(currentProbe);
  const scenes = [];
  for (const [seed, observedRoot, controlRoot, mode] of [
    [1234, observed1234Root, control1234Root, 'writer-stream-seed-1234'],
    [5678, observed5678Root, control5678Root, 'writer-full-seed-5678'],
  ]) {
    const observed = run(observedRoot, { seed, mode, observed: true }, currentProbe);
    const control = run(controlRoot, { seed, mode, observed: false }, currentProbe);
    assert(observed.stagedSourceSha256 === probeSha256, `Seed ${seed} staged source is not current`);
    scenes.push(comparePair(observed, control, seed));
  }

  assert(scenes.every(scene => scene.observed.stagedProbeSha256 === probeSha256), 'Observed probe hashes differ');
  for (const key of ['smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    const values = scenes.map(scene => scene.setup[key]);
    assert(values.every(value => value === values[0]), `${key} differs between seed runs`);
  }

  const sourcePaths = [
    'research/introspection/brush-stroke-census-capture.cl',
    'research/tools/parse-brush-stroke-census-report.mjs',
    'research/tools/derive-brush-stroke-census-evidence.mjs',
    'research/tools/index-allegro-image.mjs',
    'research/tools/parse-natural-free-path-report.mjs',
  ];
  const sources = sourcePaths.map(path => {
    const bytes = path === 'research/introspection/brush-stroke-census-capture.cl'
      ? currentProbe : path === 'research/tools/parse-brush-stroke-census-report.mjs'
        ? parserBytes : read(path);
    return { path, sha256: sha256(bytes) };
  });

  return {
    schemaVersion: 1,
    kind: 'Complete natural BRUSH-STROKE call census with byte-identical uninstrumented controls',
    probeSha256,
    sources,
    scenes,
    limitations: [
      'The census records natural call arguments as compact path lengths, counters, brush index/type and a first-seen CORE snapshot; it does not record path coordinates or FILL-MAP contents/history.',
      'Predicate counters are call attempts and outcomes, not unique pixels or verified array writes. Accepted results alone do not prove BRUSH-STROKE stored a value.',
      'The wrappers do not retain caller stacks or event chronology, so they do not establish direct callers or the order of SCREEN-AND-STORE relative to other internal work.',
      'Return values retain NIL, integer values or object type names only; they do not preserve object identity.',
      'Brush CORE data is joined through the ALL-BRUSHES position and is captured once when each brush object is first seen; it does not prove the mask stayed unchanged across later calls.',
      'The census does not report PERIM coordinates or path/candidate coordinates, so predicate-count ratios cannot establish PERIM use or per-offset coverage.',
      'The VALUE=0 empty/singleton-path rows are natural observations distinct from the older dependency-isolated adapter cases; they are retained as observations, not generalized behavior rules.',
      'Random preview checks compare copied-state snapshots around the observer read; they do not prove the original drawing functions consume no randomness.',
      'Complete output parity binds separate observed/control runs for each seed. It does not make the instrumented scene a direct proof of map writes or call-graph edges.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [observed1234, control1234, observed5678, control5678, output, ...extra] = process.argv.slice(2);
  assert([observed1234, control1234, observed5678, control5678, output].every(Boolean) && extra.length === 0,
    'Usage: node derive-brush-stroke-census-evidence.mjs <observed1234> <control1234> <observed5678> <control5678> <fresh-output.json>');
  const evidence = deriveBrushStrokeCensusEvidence(observed1234, control1234, observed5678, control5678);
  writeFileSync(resolve(output), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(evidence.scenes.map(scene => ({ seed: scene.seed, mode: scene.mode,
    calls: scene.census.aggregates.calls, byValue: scene.census.aggregates.byValue,
    pathKinds: scene.census.aggregates.pathKinds,
    predicateCounts: scene.census.aggregates.predicateCounts,
    returnArities: scene.census.aggregates.naturalReturnValueArities,
  })), null, 2));
}
