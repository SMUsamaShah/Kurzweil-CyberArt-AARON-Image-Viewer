#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { sha256 } from './index-allegro-image.mjs';
import { parseBrushStrokeBoundaryReport } from './parse-brush-stroke-boundary-report.mjs';
import { parseBrushStrokeCensusReport } from './parse-brush-stroke-census-report.mjs';
import { deriveBrushStrokeNativeEvidence } from './derive-brush-stroke-native-evidence.mjs';
import { markAaronBoundaryBrush, isPointInAaronSubFrame, selectAaronBrushMask } from '../../engine/src/aaron-boundary-brush.js';
import { clearAaronFillMap } from '../../engine/src/aaron-boundary-map.js';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const read = path => readFileSync(resolve(path));
const json = path => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/, ''));
const add = (object, key, n = 1) => { object[key] = (object[key] ?? 0) + n; };
const recordHash = value => sha256(Buffer.from(JSON.stringify(value), 'utf8'));
const info = run => ({ root: run.rootName, ...run.summary, summarySha256: run.summarySha256,
  requestSha256: run.requestSha256, stagedSourceSha256: run.stagedSourceSha256 });

function run(rootArg, mode, probeName = null, probeSource = null) {
  const root = resolve(rootArg), rootName = basename(root), summaryBytes = read(`${root}/summary.json`), summary = json(`${root}/summary.json`);
  assert(summary.complete === true && summary.runId === rootName && summary.mode === mode && summary.smallImage === false,
    `${rootName}: incomplete run or differing run identity/configuration`);
  for (const field of ['installerSha256', 'registryPatchSha256', 'licensePatchSha256', 'aa0Sha256', 'sceneReportSha256'])
    assert(/^[0-9a-f]{64}$/.test(summary[field]), `${rootName}: invalid ${field}`);
  const aa0 = read(`${root}/capture/aa0`), scene = read(`${root}/capture/aaron-scene-state-snapshot.txt`);
  assert(sha256(aa0) === summary.aa0Sha256 && sha256(scene) === summary.sceneReportSha256, `${rootName}: output/summary hash mismatch`);
  let requestSha256 = null, stagedSourceSha256 = null;
  if (probeName) {
    const requestBytes = read(`${root}/pre-scene-probe-request.json`), request = json(`${root}/pre-scene-probe-request.json`);
    const keys = ['schemaVersion', 'runId', 'runtimeExecutable', 'probeSha256', 'pauseSeconds', 'releaseFile', 'probeOutputNames'];
    assert(Object.keys(request).length === keys.length && keys.every(key => Object.hasOwn(request, key)), `${rootName}: request fields differ`);
    assert(request.schemaVersion === 1 && request.runId === rootName && request.pauseSeconds === 0
      && summary.preSceneProbePauseSeconds === 0 && request.releaseFile === 'C:\\temp\\aaron-native-code-release.txt'
      && same(request.probeOutputNames, [probeName]) && same(summary.probeOutputNames, [probeName]), `${rootName}: probe request differs`);
    const runtime = resolve(request.runtimeExecutable);
    assert(basename(runtime).toLowerCase() === 'aaron.exe' && dirname(runtime).toLowerCase() === resolve(root, 'runtime').toLowerCase(),
      `${rootName}: executable is outside the owned runtime`);
    const staged = read(`${root}/capture/aaron-pre-scene-probe.cl`);
    assert(staged.equals(read(probeSource)) && sha256(staged) === request.probeSha256 && request.probeSha256 === summary.preSceneProbeSha256,
      `${rootName}: staged/current/request/summary source binding differs`);
    requestSha256 = sha256(requestBytes); stagedSourceSha256 = sha256(staged);
  } else {
    assert(summary.preSceneProbeSha256 === null && summary.preSceneProbePauseSeconds === 0 && same(summary.probeOutputNames, []),
      `${rootName}: control is instrumented`);
    for (const file of ['pre-scene-probe-request.json', 'capture/aaron-pre-scene-probe.cl',
      'capture/aaron-brush-stroke-boundary.txt', 'capture/aaron-brush-stroke-census.txt', 'capture/aaron-brush-stroke-native-links.txt'])
      assert(!existsSync(`${root}/${file}`), `${rootName}: control contains ${file}`);
  }
  return { root, rootName, summary, summarySha256: sha256(summaryBytes), requestSha256, stagedSourceSha256, aa0, scene };
}
function parity(a, b) {
  assert(a.aa0.equals(b.aa0) && a.scene.equals(b.scene), `${a.rootName}/${b.rootName}: whole drawing/scene bytes differ`);
  for (const key of ['mode', 'smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256'])
    assert(a.summary[key] === b.summary[key], `${a.rootName}/${b.rootName}: ${key} differs`);
}
function expand(map) {
  const result = new Uint8Array(map.width * map.height);
  for (const { y, runs } of map.rows) {
    let x = 0;
    for (const [value, count] of runs) for (let n = 0; n < count; n++) result[x++ * map.height + y] = value;
    assert(x === map.width, 'RLE row coverage differs');
  }
  return result;
}
function arraysEqual(actual, expected, label, height) {
  assert(actual.length === expected.length, `${label}: lengths differ`);
  for (let i = 0; i < actual.length; i++) if (actual[i] !== expected[i])
    throw new Error(`${label}: index ${i} (${Math.floor(i / height)},${i % height}), actual ${actual[i]}, expected ${expected[i]}`);
}
function resultEqPath(stroke) {
  assert(stroke.values.length === 1 && stroke.returnPathEq === true, `Stroke ${stroke.id}: original return is not EQ to path`);
  if (stroke.pathId === 0) assert(stroke.values[0].kind === 'nil', `Stroke ${stroke.id}: NIL path return differs`);
  else assert(stroke.values[0].kind === 'object' && stroke.values[0].id === stroke.pathId
    && stroke.values[0].type === 'CONS', `Stroke ${stroke.id}: returned list identity differs`);
}

export function compareBrushStrokeBoundaryScene(root, controlRoot, censusRoot, index) {
  const seed = index ? 5678 : 1234, mode = index ? 'writer-full-seed-5678' : 'writer-stream-seed-1234';
  const observed = run(root, mode, 'aaron-brush-stroke-boundary.txt', 'research/introspection/brush-stroke-boundary-capture.cl');
  const control = run(controlRoot, mode), censusRun = run(censusRoot, mode, 'aaron-brush-stroke-census.txt', 'research/introspection/brush-stroke-census-capture.cl');
  parity(observed, control); parity(observed, censusRun);
  const raw = read(`${observed.root}/capture/aaron-brush-stroke-boundary.txt`), report = parseBrushStrokeBoundaryReport(raw.toString('utf8'));
  const censusRaw = read(`${censusRun.root}/capture/aaron-brush-stroke-census.txt`), census = parseBrushStrokeCensusReport(censusRaw.toString('utf8'));
  const previous = json('research/introspection/evidence/brush-stroke-census-20261005.json'), previousScene = previous.scenes[index];
  for (const source of previous.sources) assert(sha256(read(source.path)) === source.sha256, `Earlier census source changed: ${source.path}`);
  assert(previous.probeSha256 === censusRun.stagedSourceSha256 && previousScene.observed.root === censusRun.rootName
    && previousScene.observed.summarySha256 === censusRun.summarySha256 && previousScene.observed.requestSha256 === censusRun.requestSha256
    && previousScene.observed.rawCensusSha256 === sha256(censusRaw), 'Earlier census evidence binding differs');
  assert(report.source.sha256 === sha256(raw) && census.sourceSha256 === sha256(censusRaw) && report.strokes.length === census.calls.length,
    'Parser hash or complete stroke alignment differs');
  assert(report.complete.predicates === census.complete.predicates && report.complete.screens === census.complete.screens
    && report.complete.clears === census.complete.clears, 'Complete global predicate/screen/clear census counts differ');
  const coverage = { totalStrokes: report.strokes.length, boundaryStrokes: 0, otherStrokes: 0, clears: report.clears.length,
    returnPathEqCalls: 0, boundaryMapCellsCompared: 0, clearMapCellsCompared: 0, pathPositions: 0,
    predicateCallsCompared: 0, acceptedPredicates: 0, rejectedPredicates: 0, boundaryScreenCalls: 0,
    maskChoices: {}, brushIndices: {}, brushWidths: {}, frameTypes: {}, predicateEqualityEdges: { lx: 0, rx: 0, ly: 0, ty: 0 },
    acceptedPredicateEqualityEdges: { lx: 0, rx: 0, ly: 0, ty: 0 },
    boundaryTouchedCells: 0, boundaryChangedCells: 0, boundaryFillTransitions: {}, clearFillTransitions: {},
    clearOutsideNonzeroPreserved: 0, clearOutsideValue3Preserved: 0, markerChangedPositionsAtClear: {},
    markerChangedPositionsStill3InsideClear: 0, markerChangedPositionsStill3OutsideClear: 0,
    markerTouchedPositionsStill3InsideClear: 0, markerTouchedPositionsStill3OutsideClear: 0,
    clearInputValue3Inside: 0, clearInputValue3Outside: 0, clearInputValue3InsideNotInLinkedMarkerTouchedSet: 0,
    additionalValue3Already3AtMarkerExit: 0, additionalValue3Became3AfterMarkerExit: 0,
    additionalValue3MarkerExitValues: {},
    naturalFrameReads: 0, snapshotPreviewChecks: report.complete.checks };
  const strokeRows = [], clearRows = [], profiles = {}, markerResults = new Map();
  let mapIdentity = null;
  for (let i = 0; i < report.strokes.length; i++) {
    const s = report.strokes[i], prior = census.calls[i];
    assert(s.valueDescriptor.kind === 'integer' && s.valueDescriptor.value === s.value && s.id === prior.id && s.value === prior.value && s.pathLength === prior.pathLength && s.cdex === prior.cdex && s.sdex === prior.sdex,
      `Stroke ${s.id}: complete census alignment differs`);
    resultEqPath(s); coverage.returnPathEqCalls++;
    assert(s.values.length === prior.values.length && s.values.every((v, j) => v.kind === prior.values[j].kind
      && (v.kind !== 'object' || v.type === prior.values[j].type)), `Stroke ${s.id}: earlier return descriptor differs`);
    if (!s.sampled) { coverage.otherStrokes++; continue; }
    coverage.boundaryStrokes++;
    const a = s.before, b = s.after;
    assert(s.value === 3 && a.path.id === s.pathId && a.path.length === s.pathLength && same(a.path, b.path)
      && same(a.brush, b.brush) && same(a.configuration, b.configuration), `Stroke ${s.id}: path/brush/configuration mutation`);
    assert(a.configuration.boundaryValue.kind === 'bound' && a.configuration.boundaryValue.value.kind === 'integer'
      && a.configuration.boundaryValue.value.value === 3, `Stroke ${s.id}: BOUNDARY-VALUE differs`);
    assert(a.brush.index === prior.brushIndex && a.brush.type === prior.brushType && a.brush.id > 0
      && same([a.map.width, a.map.height], prior.mapDimensions), `Stroke ${s.id}: earlier brush/map input differs`);
    assert(a.map.id === b.map.id && a.map.type === b.map.type && a.map.width === b.map.width && a.map.height === b.map.height,
      `Stroke ${s.id}: map storage identity/shape differs`);
    mapIdentity ??= { id: a.map.id, type: a.map.type, width: a.map.width, height: a.map.height };
    assert(same(mapIdentity, { id: a.map.id, type: a.map.type, width: a.map.width, height: a.map.height }), 'Natural FILL-MAP identity/shape changed');
    const frame = a.configuration.subFrame.bounds, path = a.path.points, width = a.configuration.width;
    const profile = { width, perim: a.brush.perim.offsets, core: a.brush.core.offsets }, mask = selectAaronBrushMask(path.length, profile);
    const input = expand(a.map), output = expand(b.map), maps = { width: a.map.width, height: a.map.height, fillMap: input.slice() };
    let ordinal = 0, accepted = 0, rejected = 0;
    const acceptedPositions = new Set();
    for (const p of path) for (const [dx, dy] of mask.offsets) {
      const x = p.x + dx, y = p.y + dy, predicate = s.predicates[ordinal++];
      assert(predicate && predicate.args.length === 2 && predicate.args[0].kind === 'integer' && predicate.args[0].value === x
        && predicate.args[1].kind === 'integer' && predicate.args[1].value === y && predicate.values.length === 1,
        `Stroke ${s.id}: ordered predicate arguments differ at ${ordinal}`);
      const expected = isPointInAaronSubFrame(x, y, frame), value = predicate.values[0];
      assert(expected ? value.kind === 'symbol' && value.package === 'COMMON-LISP' && value.name === 'T' : value.kind === 'nil',
        `Stroke ${s.id}: clipping result differs at ${ordinal}`);
      if (expected) {
        assert(x >= 0 && x < maps.width && y >= 0 && y < maps.height,
          `Stroke ${s.id}: natural accepted coordinate lies outside the picture`);
        accepted++; acceptedPositions.add(x * maps.height + y);
      } else rejected++;
      for (const edge of ['lx', 'rx']) if (x === frame[edge]) {
        coverage.predicateEqualityEdges[edge]++; if (expected) coverage.acceptedPredicateEqualityEdges[edge]++;
      }
      for (const edge of ['ly', 'ty']) if (y === frame[edge]) {
        coverage.predicateEqualityEdges[edge]++; if (expected) coverage.acceptedPredicateEqualityEdges[edge]++;
      }
    }
    assert(ordinal === s.predicates.length && accepted + rejected === prior.counts.predicates + prior.counts.screenPredicates
      && accepted === prior.counts.accepted && rejected === prior.counts.rejected && s.screens.length === 0 && prior.counts.screens === 0,
      `Stroke ${s.id}: predicate/screen coverage differs`);
    const actual = markAaronBoundaryBrush({ maps, profile, path, frame });
    assert(actual.returnValue === path && actual.maskName === mask.name && actual.predicateCalls === ordinal && actual.accepted === accepted && actual.rejected === rejected
      && actual.screenCalls === s.screens.length, `Stroke ${s.id}: JS return/counter differs`);
    assert(same(actual.touched, [...acceptedPositions].sort((a, b) => a - b)),
      `Stroke ${s.id}: unique accepted-coordinate set differs`);
    arraysEqual(maps.fillMap, output, `Stroke ${s.id} complete FILL output`, maps.height);
    const changed = [];
    for (let j = 0; j < input.length; j++) if (input[j] !== output[j]) {
      changed.push(j); add(coverage.boundaryFillTransitions, `${input[j]}->${output[j]}`);
    }
    assert(same(actual.changed, changed), `Stroke ${s.id}: changed-position set differs`);
    coverage.boundaryMapCellsCompared += input.length; coverage.pathPositions += path.length; coverage.predicateCallsCompared += ordinal;
    coverage.acceptedPredicates += accepted; coverage.rejectedPredicates += rejected; coverage.boundaryScreenCalls += s.screens.length;
    coverage.boundaryTouchedCells += actual.touched.length; coverage.boundaryChangedCells += changed.length;
    add(coverage.maskChoices, actual.maskName); add(coverage.brushIndices, a.brush.index); add(coverage.brushWidths, width); add(coverage.frameTypes, a.configuration.subFrame.type);
    const profileKey = recordHash(profile);
    profiles[profileKey] ??= { sha256: profileKey, brushIndex: a.brush.index, brushType: a.brush.type, ...profile };
    assert(profiles[profileKey].brushIndex === a.brush.index, 'Identical geometry belongs to different observed brush indices: extend profile key');
    const row = { id: s.id, cdex: s.cdex, sdex: s.sdex, pathId: s.pathId, pathPositions: path.length,
      pathSha256: recordHash(path), frame: a.configuration.subFrame, brushId: a.brush.id, brushIndex: a.brush.index,
      brushProfileSha256: profileKey, maskName: actual.maskName, maskOffsets: mask.offsets.length,
      predicateCalls: ordinal, accepted, rejected, predicateSequenceSha256: recordHash(s.predicates),
      inputFillSha256: sha256(Buffer.from(input)), outputFillSha256: sha256(Buffer.from(output)),
      touchedPositions: actual.touched.length, touchedPositionsSha256: recordHash(actual.touched),
      changedPositions: changed.length, changedPositionsSha256: recordHash(changed),
      screenCalls: s.screens.length, originalReturnPathEq: s.returnPathEq, allOutputCellsEqual: true };
    strokeRows.push(row); markerResults.set(s.id, { stroke: s, row, touched: actual.touched, changed, markerOutput: output });
  }
  const linked = new Set();
  for (const c of report.clears) {
    assert(c.frames.length === 1 && c.values.length === 1 && c.values[0].kind === 'nil', `Clear ${c.id}: natural frame/return coverage differs`);
    const selected = c.frames[0], frame = selected.bounds, marker = markerResults.get(c.latestValue3);
    assert(marker && !linked.has(c.latestValue3) && c.cdex === marker.stroke.cdex && c.sdex === marker.stroke.sdex,
      `Clear ${c.id}: marker lineage or form indices differ`);
    linked.add(c.latestValue3);
    assert(selected.args.length === 1 && selected.args[0].kind === 'object' && selected.args[0].id === selected.argumentId
      && selected.values.length === 1 && selected.values[0].kind === 'object' && selected.values[0].id === selected.frameId,
      `Clear ${c.id}: natural CFRAME argument/return identity differs`);
    assert(c.beforeMap.id === c.afterMap.id && c.beforeMap.type === c.afterMap.type && c.beforeMap.width === c.afterMap.width && c.beforeMap.height === c.afterMap.height
      && same(mapIdentity, { id: c.beforeMap.id, type: c.beforeMap.type, width: c.beforeMap.width, height: c.beforeMap.height }),
      `Clear ${c.id}: map storage changed`);
    const input = expand(c.beforeMap), output = expand(c.afterMap), maps = { width: c.beforeMap.width, height: c.beforeMap.height, fillMap: input.slice() };
    assert(clearAaronFillMap({ maps, frame }) === null, 'JS clear return differs');
    arraysEqual(maps.fillMap, output, `Clear ${c.id} complete FILL output`, maps.height);
    coverage.clearMapCellsCompared += input.length; coverage.naturalFrameReads++;
    const inside = j => { const x = Math.floor(j / maps.height), y = j % maps.height;
      return frame.lx <= x && x <= frame.rx && frame.ly <= y && y <= frame.ty; };
    const touched = new Set(marker.touched), markerChangesAtClear = {}, correlation = { changedStill3Inside: 0, changedStill3Outside: 0,
      touchedStill3Inside: 0, touchedStill3Outside: 0, inputValue3Inside: 0, inputValue3Outside: 0, inputValue3InsideNotInMarkerTouchedSet: 0,
      additionalValue3Already3AtMarkerExit: 0, additionalValue3Became3AfterMarkerExit: 0, additionalValue3MarkerExitValues: {} };
    for (const j of marker.changed) {
      add(markerChangesAtClear, input[j]); add(coverage.markerChangedPositionsAtClear, input[j]);
      if (input[j] === 3) correlation[inside(j) ? 'changedStill3Inside' : 'changedStill3Outside']++;
    }
    for (const j of marker.touched) if (input[j] === 3) correlation[inside(j) ? 'touchedStill3Inside' : 'touchedStill3Outside']++;
    for (let j = 0; j < input.length; j++) {
      if (inside(j)) {
        add(coverage.clearFillTransitions, `${input[j]}->${output[j]}`);
        if (input[j] === 3) {
          correlation.inputValue3Inside++;
          if (!touched.has(j)) {
            correlation.inputValue3InsideNotInMarkerTouchedSet++;
            add(correlation.additionalValue3MarkerExitValues, marker.markerOutput[j]);
            add(coverage.additionalValue3MarkerExitValues, marker.markerOutput[j]);
            if (marker.markerOutput[j] === 3) correlation.additionalValue3Already3AtMarkerExit++;
            else correlation.additionalValue3Became3AfterMarkerExit++;
          }
        }
      } else {
        assert(input[j] === output[j], `Clear ${c.id}: outside cell changed`);
        if (input[j] > 0) coverage.clearOutsideNonzeroPreserved++;
        if (input[j] === 3) { coverage.clearOutsideValue3Preserved++; correlation.inputValue3Outside++; }
      }
    }
    coverage.markerChangedPositionsStill3InsideClear += correlation.changedStill3Inside;
    coverage.markerChangedPositionsStill3OutsideClear += correlation.changedStill3Outside;
    coverage.markerTouchedPositionsStill3InsideClear += correlation.touchedStill3Inside;
    coverage.markerTouchedPositionsStill3OutsideClear += correlation.touchedStill3Outside;
    coverage.clearInputValue3Inside += correlation.inputValue3Inside; coverage.clearInputValue3Outside += correlation.inputValue3Outside;
    coverage.clearInputValue3InsideNotInLinkedMarkerTouchedSet += correlation.inputValue3InsideNotInMarkerTouchedSet;
    coverage.additionalValue3Already3AtMarkerExit += correlation.additionalValue3Already3AtMarkerExit;
    coverage.additionalValue3Became3AfterMarkerExit += correlation.additionalValue3Became3AfterMarkerExit;
    clearRows.push({ id: c.id, cdex: c.cdex, sdex: c.sdex, latestValue3: c.latestValue3, otherStrokesAfterValue3: c.otherStrokesAfterValue3,
      naturalFrame: selected, inputFillSha256: sha256(Buffer.from(input)), outputFillSha256: sha256(Buffer.from(output)),
      markerChangesAtClear, correlation, allOutputCellsEqual: true,
      correlationScope: 'Marker changes and unique accepted-predicate coordinates are observed again at clear entry; intermediate write ownership is not captured.' });
  }
  assert(linked.size === markerResults.size && coverage.boundaryStrokes === report.complete.sampled && coverage.clears === report.complete.clears,
    'Complete marker-to-clear coverage differs');
  return { seed, observed: { ...info(observed), rawReportSha256: sha256(raw), rawReportBytes: raw.length }, control: info(control),
    aa0ByteIdentical: true, sceneReportByteIdentical: true, setupIdentical: true, complete: report.complete, mapIdentity, coverage,
    brushProfiles: Object.values(profiles), boundaryStrokes: strokeRows, clears: clearRows,
    allStrokeSequence: { calls: report.strokes.length, sha256: recordHash(report.strokes.map(s => ({ id: s.id, event: s.event, cdex: s.cdex,
      sdex: s.sdex, value: s.value, pathId: s.pathId, pathLength: s.pathLength, values: s.values, returnPathEq: s.returnPathEq }))) },
    earlierCensus: { ...info(censusRun), rawReportSha256: sha256(censusRaw), completeCallAlignment: true } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [a, ca, censusA, b, cb, censusB, nativeRoot, output, ...extra] = process.argv.slice(2);
  assert([a, ca, censusA, b, cb, censusB, nativeRoot, output].every(Boolean) && extra.length === 0,
    'Usage: derive-brush-stroke-boundary-evidence.mjs <observed1234> <control1234> <census1234> <observed5678> <control5678> <census5678> <native-root> <fresh output>');
  const scenes = [compareBrushStrokeBoundaryScene(a, ca, censusA, 0), compareBrushStrokeBoundaryScene(b, cb, censusB, 1)];
  const native = deriveBrushStrokeNativeEvidence(nativeRoot, ca);
  const sources = ['engine/src/aaron-boundary-brush.js', 'engine/src/aaron-boundary-map.js', 'engine/src/aaron-maps.js',
    'research/introspection/brush-stroke-boundary-capture.cl', 'research/introspection/brush-stroke-census-capture.cl', 'research/introspection/brush-stroke-native-links.cl',
    'research/tools/parse-brush-stroke-boundary-report.mjs', 'research/tools/parse-brush-stroke-census-report.mjs',
    'research/tools/derive-brush-stroke-boundary-evidence.mjs', 'research/tools/derive-brush-stroke-native-evidence.mjs',
    'research/tools/parse-natural-free-path-report.mjs', 'research/tools/map-native-code-to-pll.mjs', 'research/tools/index-allegro-image.mjs',
    'research/tools/rea-evidence-bundle.mjs', 'research/introspection/evidence/brush-stroke-census-20261005.json'];
  const result = { schemaVersion: 1, kind: 'Complete natural BRUSH-STROKE value-3 marking and subsequent clear comparisons',
    sources: sources.map(path => ({ path, sha256: sha256(read(path)) })), native, scenes,
    limitations: ['Original path lists, brush geometry, SUB-FRAME bounds and existing FILL-MAPs remain inputs; this does not recover their creation or the complete painter.',
      'Only naturally observed value-3 branch inputs are compared in JS. Every original stroke return identity is observed, but value-0 screen and map behavior is not ported here.',
      'Mask branches and integer clipping coverage are retained per scene. Unobserved short boundary paths, other numeric domains, malformed inputs and original errors are not characterized.',
      'Marker-to-clear lineage and coordinate correlations do not establish all intermediate writes or continuous ownership of cells that still contain 3.',
      'The touched-position set is derived from natural accepted predicates and checked against JS diagnostics; the observer does not log individual native array stores.',
      'CDEX/SDEX agree across linked stroke/clear boundaries. Numeric-index-to-natural-CFRAME-object selection is not recovered by this observer.',
      'Full source-bound reports and native bytes remain in ignored run roots. Portable rows retain hashes and coverage; they do not include every raw predicate or map cell.',
      'Canonical REA records represent external standalone Ghidra analysis; no stock REA Windows x86 native-provider session is claimed.'] };
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(scenes.map(s => ({ seed: s.seed, coverage: s.coverage })), null, 2));
}
