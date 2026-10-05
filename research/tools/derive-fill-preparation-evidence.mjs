#!/usr/bin/env node
// Original-runtime comparisons, not generated or self-referential fixtures.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFillPreparationReport } from './parse-fill-preparation-report.mjs';
import { createAaronMaps, aaronMapIndex } from '../../engine/src/aaron-maps.js';
import { setAaronMedianRows, chooseAaronFillStart, applyAaronFillStrategy } from '../../engine/src/aaron-fill-preparation.js';
import { sha256 } from './index-allegro-image.mjs';

const [observed1234, control1234, observed5678, control5678, helperArg, diagnosticArg, outputArg, ...extra] = process.argv.slice(2);
if (!outputArg || extra.length) throw new Error('Usage: node derive-fill-preparation-evidence.mjs <observed-1234> <control-1234> <observed-5678> <control-5678> <prior-helper-evidence.json> <getter-diagnostic-root> <fresh-evidence.json>');
const output = resolve(outputArg);
if (existsSync(output)) throw new Error('Evidence output must be fresh');
const read = (path) => readFileSync(path);
const json = (path) => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/, ''));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const digest = (value) => sha256(Buffer.from(JSON.stringify(value)));
const names = ['SET-MEDIANS', 'GOOD-START', 'FILL-STRATEGY'];
function run(rootArg, mode, observed) {
  const root = resolve(rootArg), summaryFile = resolve(root, 'summary.json'), summary = json(summaryFile);
  const aa0 = read(resolve(root, 'capture/aa0')), scene = read(resolve(root, 'capture/aaron-scene-state-snapshot.txt'));
  assert(summary.complete && summary.mode === mode && sha256(aa0) === summary.aa0Sha256
    && sha256(scene) === summary.sceneReportSha256, 'Run completion, mode or output binding differs');
  if (observed) assert(summary.probeOutputNames.includes('aaron-fill-preparation.txt')
    && sha256(read(resolve(root, 'capture/aaron-pre-scene-probe.cl'))) === summary.preSceneProbeSha256, 'Staged observer differs');
  else assert(summary.preSceneProbeSha256 === null && summary.probeOutputNames.length === 0, 'Expected an uninstrumented control');
  return { root, aa0, scene, record: { ...summary, summarySha256: sha256(read(summaryFile)) } };
}
function parity(observed, control) {
  assert(observed.aa0.equals(control.aa0) && observed.scene.equals(control.scene), 'Observer differs from fresh control bytes');
  for (const k of ['mode', 'smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(observed.record[k] === control.record[k], `Control setup differs: ${k}`);
  }
  return { aa0ByteIdentical: true, sceneReportByteIdentical: true };
}
function expand(map, destination) {
  for (const row of map.rows) {
    let x = map.region.x0;
    for (const [value, count] of row.runs) {
      for (let n = 0; n < count; n += 1) destination[aaronMapIndex(map.width, map.height, x++, row.y)] = value;
    }
  }
}
function regionBytes(map, data) {
  const bytes = Buffer.alloc(map.cells);
  let cursor = 0;
  for (let y = map.region.y0; y <= map.region.y1; y += 1) {
    for (let x = map.region.x0; x <= map.region.x1; x += 1) bytes[cursor++] = data[aaronMapIndex(map.width, map.height, x, y)];
  }
  return bytes;
}
function census(bytes) {
  const counts = {};
  for (const b of bytes) counts[b] = (counts[b] ?? 0) + 1;
  return counts;
}
function add(target, source) {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + value;
}

const helperRaw = read(resolve(helperArg)), helper = JSON.parse(helperRaw.toString('utf8'));
assert(helper.status === 'measured' && helper.scenes.length === 2 && helper.native.functions.length === 6, 'Expected the retained helper/native evidence');
const modes = ['writer-stream-seed-1234', 'writer-full-seed-5678'];
const observed = [run(observed1234, modes[0], true), run(observed5678, modes[1], true)];
const controls = [run(control1234, modes[0], false), run(control5678, modes[1], false)];
const sourceSha256 = sha256(read(resolve('research/introspection/fill-preparation-capture.cl')));
assert(observed.every((r) => r.record.preSceneProbeSha256 === sourceSha256), 'Both runs must use the current inspected source');
const scenes = observed.map((captured, sceneIndex) => {
  const raw = read(resolve(captured.root, 'capture/aaron-fill-preparation.txt'));
  const report = parseFillPreparationReport(raw.toString('utf8'));
  const previous = helper.scenes[sceneIndex], seed = sceneIndex === 0 ? 1234 : 5678;
  assert(previous.seed === seed && previous.totals['MY-FILL'] === report.fills.length
    && previous.observedRun.aa0Sha256 === captured.record.aa0Sha256, 'Previous complete helper scene differs');
  const coverage = { medianCalls: 0, integralMidpoints: 0, halfMidpointsRoundedDown: 0, halfMidpointsRoundedUp: 0,
    startCalls: 0, rotatedOutlines: 0, shortUnchangedOutlines: 0, longerUnchangedOutlines: 0,
    strategyCalls: 0, pointsCompared: 0, mapCellsCompared: 0, changedCells: 0, guardCellsCompared: 0,
    beforeMapValues: {}, afterMapValues: {}, cellTransitions: {}, preservedValue2Cells: 0, positiveHorizontalEdges: 0, negativeHorizontalEdges: 0,
    verticalEdges: 0, repeatedDirections: 0, directionChanges: 0, downScans: 0, upScans: 0, emptyScans: 0,
    scanCellVisits: 0, visitedValue2Cells: 0, repeatedCellVisits: 0, toggledCellVisits: 0,
    frameTypes: {}, pointTypes: {}, mapDimensions: [], outlineLengthRange: [Infinity, -Infinity] };
  const examples = {};
  const rows = report.fills.map((fill) => {
    const [median, start, strategy] = fill.calls;
    const prior = previous.rows[fill.id - 1];
    assert(prior && prior.mode === fill.mode && prior.cdex === fill.cdex && prior.sdex === fill.sdex
      && same(fill.values, [prior.returnValue]), 'Fill arguments/returns differ from the prior complete helper sequence');
    assert(names.every((name, i) => fill.calls[i].name === name && fill.calls[i].values.length === 1), 'Helper shape differs');
    assert(median.before.frame.type === 'MAPFRAME' && start.before.outline.points.every((p) => ['VISPT', 'TRIPT'].includes(p.type)),
      'Unexpected frame/point type');
    add(coverage.frameTypes, { [median.before.frame.type]: 1 });
    assert(same(median.after.lo, start.before.lo) && same(median.after.hi, start.before.hi)
      && same(start.after.lo, strategy.before.lo) && same(start.after.hi, strategy.before.hi)
      && same(start.after.outline, strategy.before.outline), 'Inputs are discontinuous between helpers');
    const m = setAaronMedianRows(median.before.frame);
    assert(median.after.lo.bound && median.after.hi.bound && m.loMedian === median.after.lo.value
      && m.hiMedian === median.after.hi.value && m.returnValue === median.values[0], `Median mismatch at fill ${fill.id}`);
    coverage.medianCalls += 1;
    const sum = median.before.frame.ly + median.before.frame.ty;
    const medianBranch = sum % 2 === 0 ? 'integralMidpoints'
      : m.loMedian === Math.floor(sum / 2) ? 'halfMidpointsRoundedDown' : 'halfMidpointsRoundedUp';
    coverage[medianBranch] += 1;
    examples[medianBranch] ??= { fill: fill.id, ly: median.before.frame.ly, ty: median.before.frame.ty, ...m };
    const inputOutline = start.before.outline.points, s = chooseAaronFillStart(inputOutline);
    for (const point of inputOutline) add(coverage.pointTypes, { [point.type]: 1 });
    coverage.outlineLengthRange[0] = Math.min(coverage.outlineLengthRange[0], inputOutline.length);
    coverage.outlineLengthRange[1] = Math.max(coverage.outlineLengthRange[1], inputOutline.length);
    assert(same(s.outline, start.after.outline.points)
      && start.after.outlineIdentityPreserved === (s.outline === inputOutline), `Outline or identity mismatch at fill ${fill.id}`);
    if (s.returnValue === null) assert(start.values[0] === null, 'Expected NIL start return');
    else assert(start.values[0].equalsOutline && same(start.values[0].ids, s.outline.map((p) => p.id))
      && s.returnValue === s.outline, 'Rotated list return or identity differs');
    coverage.startCalls += 1;
    coverage.pointsCompared += inputOutline.length;
    const startBranch = s.rotationIndex !== null ? 'rotatedOutlines'
      : inputOutline.length <= 7 ? 'shortUnchangedOutlines' : 'longerUnchangedOutlines';
    coverage[startBranch] += 1;
    examples[startBranch] ??= { fill: fill.id, length: inputOutline.length, rotationIndex: s.rotationIndex,
      qualifyingTriple: s.rotationIndex === null ? null : [-1, 0, 1].map((offset) => {
        const p = inputOutline[(s.rotationIndex + offset + inputOutline.length) % inputOutline.length];
        return { id: p.id, x: p.x, y: p.y };
      }) };
    const before = strategy.before.map, after = strategy.after.map;
    if (!coverage.mapDimensions.some(([width, height]) => width === before.width && height === before.height)) {
      coverage.mapDimensions.push([before.width, before.height]);
    }
    const maps = createAaronMaps(before.width, before.height);
    expand(before, maps.fillMap);
    const inputBytes = regionBytes(before, maps.fillMap), metricMap = maps.fillMap.slice(), visits = new Uint32Array(metricMap.length);
    // Coverage accounting is separate from the independent implementation.
    // The complete original output, not this accounting walk, is the expected result.
    const scans = { downScans: 0, upScans: 0, emptyScans: 0, scanCellVisits: 0, visitedValue2Cells: 0,
      repeatedCellVisits: 0, toggledCellVisits: 0, repeatedDirections: 0, directionChanges: 0,
      verticalEdges: 0, positiveHorizontalEdges: 0, negativeHorizontalEdges: 0 };
    let previousDirection = Math.sign(s.outline[1].x - s.outline[0].x);
    for (let i = 0; i < s.outline.length; i += 1) {
      const p = s.outline[i], next = s.outline[(i + 1) % s.outline.length], direction = Math.sign(next.x - p.x);
      if (direction === 0) { scans.verticalEdges += 1; continue; }
      scans[direction > 0 ? 'positiveHorizontalEdges' : 'negativeHorizontalEdges'] += 1;
      if (direction === previousDirection) {
        scans.repeatedDirections += 1;
        const down = p.y > m.hiMedian, end = down ? m.hiMedian : m.loMedian, step = down ? -1 : 1;
        let count = 0;
        for (let y = p.y + step; down ? y >= end : y <= end; y += step) {
          assert(p.x >= before.region.x0 && p.x <= before.region.x1 && y >= before.region.y0 && y <= before.region.y1,
            'Predicted scan extends beyond captured region');
          const index = aaronMapIndex(before.width, before.height, p.x, y);
          scans.scanCellVisits += 1; count += 1;
          if (visits[index]++ > 0) scans.repeatedCellVisits += 1;
          if (metricMap[index] === 2) scans.visitedValue2Cells += 1;
          else { metricMap[index] ^= 1; scans.toggledCellVisits += 1; }
        }
        scans[count === 0 ? 'emptyScans' : down ? 'downScans' : 'upScans'] += 1;
      } else scans.directionChanges += 1;
      previousDirection = direction;
    }
    const originalOutlineObjects = s.outline.slice(), fillIdentity = maps.fillMap;
    assert(applyAaronFillStrategy({ maps, outline: s.outline, loMedian: m.loMedian, hiMedian: m.hiMedian }) === strategy.values[0]
      && strategy.values[0] === null && maps.fillMap === fillIdentity
      && s.outline.every((p, i) => p === originalOutlineObjects[i]), 'Strategy return/object behavior differs');
    const expected = new Uint8Array(before.width * before.height); expand(after, expected);
    const outputBytes = regionBytes(after, expected), predictedBytes = regionBytes(after, maps.fillMap);
    assert(outputBytes.equals(predictedBytes), `Predicted map differs at fill ${fill.id}`);
    let changedCells = 0, preservedValue2Cells = 0, guardCells = 0;
    for (let i = 0; i < inputBytes.length; i += 1) {
      if (inputBytes[i] !== outputBytes[i]) changedCells += 1;
      if (inputBytes[i] === 2 && outputBytes[i] === 2) preservedValue2Cells += 1;
      add(coverage.cellTransitions, { [`${inputBytes[i]}->${outputBytes[i]}`]: 1 });
    }
    for (let y = before.region.y0; y <= before.region.y1; y += 1) {
      for (let x = before.region.x0; x <= before.region.x1; x += 1) {
        if (x !== before.region.x0 && x !== before.region.x1 && y !== before.region.y0 && y !== before.region.y1) continue;
        const index = aaronMapIndex(before.width, before.height, x, y);
        assert(expected[index] === fillIdentity[index], 'Guard cell mismatch'); guardCells += 1;
      }
    }
    coverage.strategyCalls += 1; coverage.mapCellsCompared += before.cells; coverage.changedCells += changedCells;
    coverage.guardCellsCompared += guardCells; coverage.preservedValue2Cells += preservedValue2Cells;
    add(coverage.beforeMapValues, census(inputBytes)); add(coverage.afterMapValues, census(outputBytes)); add(coverage, scans);
    return { fill: fill.id, mode: fill.mode, cdex: fill.cdex, sdex: fill.sdex, parentReturnValues: fill.values,
      frame: median.before.frame, median: m, medianBranch, outlineLength: inputOutline.length, rotationIndex: s.rotationIndex,
      inputOutlineSha256: digest(inputOutline), outputOutlineSha256: digest(s.outline),
      mapRegion: before.region, mapCellsCompared: before.cells, inputMapSha256: sha256(inputBytes), outputMapSha256: sha256(outputBytes),
      changedCells, preservedValue2Cells, ...scans };
  });
  return { seed, observedRun: captured.record, controlRun: controls[sceneIndex].record, comparison: parity(captured, controls[sceneIndex]),
    reportSha256: sha256(raw), reportBytes: raw.length, sourceSha256, caps: report.caps, installed: report.installed,
    rngPreviewChecks: report.rngChecks, coverage, examples, rows };
});

const diagnostic = run(diagnosticArg, modes[0], true);
for (const key of ['mode', 'smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
  assert(diagnostic.record[key] === controls[0].record[key], `Diagnostic setup differs: ${key}`);
}
const diagnosticRaw = read(resolve(diagnostic.root, 'capture/aaron-fill-preparation.txt'));
const diagnosticLines = diagnosticRaw.toString('utf8').trimEnd().split(/\r?\n/);
const changes = diagnosticLines.filter((l) => /^(GETTER-RNG|TYPE-RNG|RNG-CHANGE)\b/.test(l));
assert(changes.length === 2 && changes[0] === 'GETTER-RNG name="RX" before=(:RANDOM-100-1 3 :RANDOM-100-2 57 :RANDOM-100-3 98) after=(:RANDOM-100-1 57 :RANDOM-100-2 98 :RANDOM-100-3 37)'
  && changes[1].startsWith('RNG-CHANGE id=1 phase=:BEFORE ') && !diagnostic.aa0.equals(controls[0].aa0)
  && diagnostic.scene.equals(controls[0].scene), 'Diagnostic isolation differs');
const total = { medianCalls: 0, startCalls: 0, strategyCalls: 0, pointsCompared: 0, mapCellsCompared: 0, changedCells: 0,
  preservedValue2Cells: 0, visitedValue2Cells: 0, rotatedOutlines: 0, shortUnchangedOutlines: 0, longerUnchangedOutlines: 0 };
for (const scene of scenes) for (const key of Object.keys(total)) total[key] += scene.coverage[key];
const evidence = { schemaVersion: 1, status: 'measured', scope: 'Three fill-preparation functions in two complete controlled paintings; complete outlines and bounded map regions',
  comparisonUnits: { mapCells: 'Sum of output-cell comparisons in the captured region of every call, not unique global positions',
    points: 'Sum of complete outline point positions for every call', preservedValue2Cells: 'Sum of input value-2 cells preserved in each captured region' },
  sourceSha256, parserSha256: sha256(read(resolve('research/tools/parse-fill-preparation-report.mjs'))),
  implementationSha256: sha256(read(resolve('engine/src/aaron-fill-preparation.js'))), derivationSha256: sha256(read(resolve('research/tools/derive-fill-preparation-evidence.mjs'))),
  originalInputsStillRequired: ['integer LY/TY frame values', 'ordered point objects and X/Y coordinates', 'initial FILL-MAP region'],
  unmeasured: ['cells outside captured regions', 'other paintings and dimensions', 'other point/frame types and noninteger coordinates',
    'original error behavior', 'fill values other than those in each scene census', 'integrated JavaScript MY-FILL/BRUSH-FILL'],
  native: { priorEvidenceSha256: sha256(helperRaw), pll: helper.native.pll,
    functions: helper.native.functions.filter((f) => names.includes(f.name)), interpretation: 'Native constants and tagged operations informed candidates; captured original outputs establish the stated comparisons' },
  rejectedDiagnostic: { run: diagnostic.record, reportSha256: sha256(diagnosticRaw), changes,
    aa0ByteIdenticalToControl: false, sceneReportByteIdenticalToControl: true,
    correction: 'Remove unused LX/RX observations; record only LY/TY and require copied random-state previews to stay equal around every snapshot',
    internalReaderMechanism: 'unresolved' }, total, scenes };
assert(evidence.native.functions.length === 3 && evidence.native.functions.every((f) => f.uniqueCompleteObjectByteMatch), 'Missing exact native matches');
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output, sha256: sha256(read(output)), total, controls: scenes.map((s) => s.comparison) }));
