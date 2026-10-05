#!/usr/bin/env node
// Compare independent JS outputs to complete original observations, with controls.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseBoundaryMapReport } from './parse-boundary-map-report.mjs';
import { parseFillPreparationReport } from './parse-fill-preparation-report.mjs';
import { mapCapturedFunctions } from './map-native-code-to-pll.mjs';
import { createAaronMaps, aaronMapIndex } from '../../engine/src/aaron-maps.js';
import { clearAaronFillMap, writeAaronListToFillMap } from '../../engine/src/aaron-boundary-map.js';
import { setAaronMedianRows, chooseAaronFillStart, applyAaronFillStrategy } from '../../engine/src/aaron-fill-preparation.js';
import { sha256 } from './index-allegro-image.mjs';

const [observed1234, control1234, observed5678, control5678, nativeArg, prep1234, prep5678, incompleteArg, outputArg, ...extra] = process.argv.slice(2);
if (!outputArg || extra.length) throw new Error('Usage: node derive-boundary-map-evidence.mjs <observed-1234> <control-1234> <observed-5678> <control-5678> <native-root> <prior-prep-1234> <prior-prep-5678> <incomplete-frame-root> <fresh-evidence.json>');
const output = resolve(outputArg);
if (existsSync(output)) throw new Error('Evidence output must be fresh');
const read = (p) => readFileSync(resolve(p));
const json = (p) => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const digest = (v) => sha256(Buffer.from(JSON.stringify(v)));
const modes = ['writer-stream-seed-1234', 'writer-full-seed-5678'];
const targets = ['CLEAR-FILL-MAP', 'WRITE-LIST-TO-FILL-MAP'];
const sourceSha256 = sha256(read('research/introspection/boundary-map-capture.cl'));
function run(rootArg, mode, probeName = null) {
  const root = resolve(rootArg), summaryPath = resolve(root, 'summary.json'), summary = json(summaryPath);
  const aa0 = read(resolve(root, 'capture/aa0')), scene = read(resolve(root, 'capture/aaron-scene-state-snapshot.txt'));
  assert(summary.complete === true && summary.mode === mode && sha256(aa0) === summary.aa0Sha256
    && sha256(scene) === summary.sceneReportSha256, 'Run completion/mode/output binding differs');
  if (probeName) assert(summary.probeOutputNames.includes(probeName)
    && sha256(read(resolve(root, 'capture/aaron-pre-scene-probe.cl'))) === summary.preSceneProbeSha256, 'Staged observer binding differs');
  else assert(summary.preSceneProbeSha256 === null && summary.probeOutputNames.length === 0, 'Expected an uninstrumented control');
  return { root, aa0, scene, record: { ...summary, summarySha256: sha256(read(summaryPath)) } };
}
function parity(observed, control) {
  assert(observed.aa0.equals(control.aa0) && observed.scene.equals(control.scene), 'Observed output differs from fresh control bytes');
  for (const k of ['mode', 'smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(observed.record[k] === control.record[k], `Control setup differs: ${k}`);
  }
  return { aa0ByteIdentical: true, sceneReportByteIdentical: true };
}
function expand(map) {
  const bytes = new Uint8Array(map.width * map.height);
  for (const row of map.rows) {
    let x = map.region?.x0 ?? 0;
    for (const [value, count] of row.runs) {
      for (let n = 0; n < count; n += 1) bytes[aaronMapIndex(map.width, map.height, x++, row.y)] = value;
    }
  }
  return bytes;
}
function regionBytes(map, storage) {
  const out = Buffer.alloc(map.cells); let i = 0;
  const r = map.region ?? { x0: 0, x1: map.width - 1, y0: 0, y1: map.height - 1 };
  for (let y = r.y0; y <= r.y1; y += 1) {
    for (let x = r.x0; x <= r.x1; x += 1) out[i++] = storage[aaronMapIndex(map.width, map.height, x, y)];
  }
  return out;
}
function add(target, source) { for (const [k, v] of Object.entries(source)) target[k] = (target[k] ?? 0) + v; }
function census(bytes) { const result = {}; for (const b of bytes) result[b] = (result[b] ?? 0) + 1; return result; }
function native(rootArg, control) {
  const captured = run(rootArg, modes[0], 'aaron-boundary-map-native-links.txt');
  const root = captured.root, mapPath = resolve(root, 'native-code/mapped/native-code-map.json');
  const mapped = json(mapPath), manifestPath = resolve(root, 'native-code/manifest.json'), manifest = json(manifestPath);
  const rederived = mapCapturedFunctions(manifest, (file) => {
    assert(basename(file) === file && /^[a-z0-9-]+\.native-window\.bin$/.test(file), 'Invalid native-window filename');
    return read(resolve(root, 'native-code', file));
  }, read(resolve(root, 'runtime/AARON.pll')));
  const { captureManifestSha256, ...persistedMap } = mapped;
  assert(isDeepStrictEqual(rederived.report, persistedMap), 'Rederived live-window/PLL map differs');
  const metadata = read(resolve(root, 'capture/aaron-boundary-map-native-links.txt'));
  assert(metadata.toString('utf8').includes('END boundary-map-native-links') && /ERROR-COUNT 0\b/.test(metadata.toString('utf8'))
    && /TARGET-COUNT 2\b/.test(metadata.toString('utf8')), 'Incomplete native metadata');
  assert(sha256(read('research/introspection/boundary-map-native-links.cl')) === captured.record.preSceneProbeSha256
    && manifest.metadataSha256 === sha256(metadata) && captureManifestSha256 === sha256(read(manifestPath)), 'Native source/manifest binding differs');
  const functions = mapped.functions.map((f) => {
    const prefix = f.name.toLowerCase(), reportPath = resolve(root, `native-code/mapped/ghidra-b/${prefix}.ghidra.json`);
    const report = json(reportPath), payload = read(resolve(root, 'native-code/mapped', f.payloadFile));
    assert(targets.includes(f.name) && f.uniqueCompleteObjectByteMatch === true && sha256(payload) === f.payloadSha256
      && payload.equals(rederived.payloads.get(f.name))
      && payload.length === f.payloadBytes && report.subject.sha256 === f.payloadSha256 && report.subject.bytes === f.payloadBytes
      && report.functionName === f.name && report.entry === f.runtime.entry && report.memoryBase === f.runtime.entry
      && report.languageId === 'x86:LE:32:default' && report.compilerSpecId === 'windows'
      && report.disassembledInstructions === report.assembly.length && report.decompilation.completed === true, 'Exact native/report binding differs');
    const covered = new Set();
    for (const instruction of report.assembly) {
      assert(Number.isSafeInteger(instruction.offset) && instruction.offset >= 0 && /^[0-9a-f]+$/i.test(instruction.bytes)
        && instruction.bytes.length % 2 === 0 && instruction.bytes.length >= 2 && instruction.bytes.length <= 30
        && /^0x[0-9a-f]{1,8}$/i.test(instruction.address)
        && Number.parseInt(instruction.address, 16) === Number.parseInt(f.runtime.entry, 16) + instruction.offset,
        'Invalid native instruction address/bytes');
      const bytes = Buffer.from(instruction.bytes, 'hex');
      assert(instruction.offset + bytes.length <= payload.length
        && payload.subarray(instruction.offset, instruction.offset + bytes.length).equals(bytes), 'Instruction differs from exact payload');
      for (let offset = instruction.offset; offset < instruction.offset + bytes.length; offset += 1) {
        assert(!covered.has(offset), 'Overlapping decoded instructions'); covered.add(offset);
      }
    }
    const bundlePath = resolve(root, `native-code/mapped/ghidra-b/${prefix}.rea-bundle.json`);
    const exportPath = resolve(root, `native-code/mapped/ghidra-b/${prefix}.rea-export.json`);
    const importPath = resolve(root, `native-code/mapped/ghidra-b/${prefix}.rea-import.json`);
    const bundle = json(bundlePath), exported = json(exportPath), imported = json(importPath), record = bundle.records?.[0];
    assert(bundle.records?.length === 1 && exported.records?.length === 1 && imported.imported === 1 && imported.unknowns_added === 0
      && isDeepStrictEqual(record, exported.records[0]) && record.provider.id === 'ghidra-standalone'
      && record.subject.digest.sha256 === f.payloadSha256 && record.parameters.rea_native_provider_session === false
      && record.normalized_result.provenance.rea_native_provider_session === false
      && record.normalized_result.provenance.source_report_sha256 === sha256(read(reportPath))
      && isDeepStrictEqual(record.raw_result, report), 'REA import/export binding differs');
    return { name: f.name, runtime: f.runtime, pll: f.pll, payloadBytes: f.payloadBytes, payloadSha256: f.payloadSha256,
      objectSha256: f.objectSha256, uniqueCompleteObjectByteMatch: true, reportSha256: sha256(read(reportPath)),
      instructionCount: report.disassembledInstructions, instructionBytesCompared: covered.size,
      languageId: report.languageId, compilerSpecId: report.compilerSpecId,
      rea: { version: '3.2.1', evidenceId: record.evidence_id, provider: record.provider, nativeProviderSession: false,
        bundleSha256: sha256(read(bundlePath)), canonicalExportSha256: sha256(read(exportPath)), importResult: imported,
        scope: 'Canonical record validation and external Ghidra evidence import/export; not authentication of native analysis' },
      interpretation: f.name === 'CLEAR-FILL-MAP' ? 'Tagged inclusive frame loops with a zero map store; frame slot symbols are constants'
        : 'List walk, integer picture-bound guards and an assignment of VAL at each accepted coordinate' };
  });
  assert(functions.length === 2 && targets.every((name) => functions.some((f) => f.name === name)), 'Missing native target');
  return { run: captured.record, comparison: parity(captured, control), metadataSha256: sha256(metadata),
    mapSha256: sha256(read(mapPath)), manifestSha256: sha256(read(manifestPath)), pll: mapped.pll, functions, liveWindowPllMatchesRederived: true,
    callerScope: 'Wrapped natural MY-FILL/BRUSH-FILL-SUBPART enclosures are measured separately; computed native call sites remain static candidates',
    abiScope: 'Ghidra C types and helper-call argument reconstruction are not recovered Allegro Lisp source or ABI' };
}
const priorEvidenceRaw = read('research/introspection/evidence/fill-preparation-parity-20261005.json'), priorEvidence = JSON.parse(priorEvidenceRaw);
assert(priorEvidence.status === 'measured' && priorEvidence.scenes.length === 2, 'Missing retained preparation evidence');
assert(sha256(read('engine/src/aaron-fill-preparation.js')) === priorEvidence.implementationSha256,
  'Composed preparation implementation differs from the retained milestone');
const observations = [run(observed1234, modes[0], 'aaron-boundary-map.txt'), run(observed5678, modes[1], 'aaron-boundary-map.txt')];
const controls = [run(control1234, modes[0]), run(control5678, modes[1])];
const prepRoots = [prep1234, prep5678];
assert(observations.every((r) => r.record.preSceneProbeSha256 === sourceSha256), 'Both captures must use the current inspected observer');
const scenes = observations.map((observed, sceneIndex) => {
  const raw = read(resolve(observed.root, 'capture/aaron-boundary-map.txt')), report = parseBoundaryMapReport(raw.toString('utf8'));
  const previousRun = run(prepRoots[sceneIndex], modes[sceneIndex], 'aaron-fill-preparation.txt');
  const previousRaw = read(resolve(previousRun.root, 'capture/aaron-fill-preparation.txt')), prep = parseFillPreparationReport(previousRaw.toString('utf8'));
  assert(sha256(previousRaw) === priorEvidence.scenes[sceneIndex].reportSha256
    && previousRun.record.preSceneProbeSha256 === priorEvidence.sourceSha256, 'Prior preparation evidence binding differs');
  const previousControlComparison = parity(previousRun, controls[sceneIndex]);
  const myParents = report.parents.filter((p) => p.name === 'MY-FILL'), subpartParents = report.parents.filter((p) => p.name === 'BRUSH-FILL-SUBPART');
  assert(myParents.length === prep.fills.length && myParents.every((p, i) => same(p.args,
    { mode: prep.fills[i].mode, cdex: prep.fills[i].cdex, sdex: prep.fills[i].sdex })), 'MY-FILL sequence differs from prior preparation capture');
  const coverage = { writerCalls: 0, clearCalls: 0, pointsCompared: 0, mapCellsCompared: 0, changedCells: 0,
    targetCellsCompared: 0, outsideTargetCellsCompared: 0, duplicateCoordinates: 0, repeatedPointIdentities: 0,
    skippedXPoints: 0, skippedYPoints: 0, cformChainsCompared: 0, cformChainMapCellsCompared: 0,
    frameTypes: {}, pointTypes: {}, writerValues: {}, dimensions: [], beforeMapValues: {}, afterMapValues: {}, cellTransitions: {},
    clearTransitions: {}, writerTransitions: {}, clearEdgeNonzeroToZero: { lx: 0, rx: 0, ly: 0, ty: 0 },
    writerPictureEdgePoints: { lx: 0, rx: 0, ly: 0, ty: 0 }, outsideNonzeroCellsPreserved: 0,
    writerLengthRange: [Infinity, -Infinity], pointXRange: [Infinity, -Infinity], pointYRange: [Infinity, -Infinity] };
  const examples = {};
  const rows = report.calls.map((call) => {
    const parent = report.parents[call.parent - 1], before = expand(call.before), after = expand(call.after);
    const maps = createAaronMaps(call.before.width, call.before.height), identity = maps.fillMap, touched = new Uint8Array(before.length);
    maps.fillMap.set(before);
    if (!coverage.dimensions.some((d) => same(d, [maps.width, maps.height]))) coverage.dimensions.push([maps.width, maps.height]);
    assert(same(call.values, [null]), 'Expected sole NIL helper return');
    let detail;
    if (call.name === 'CLEAR-FILL-MAP') {
      assert(parent.name === 'BRUSH-FILL-SUBPART' && same(parent.args, call.args) && call.readers.type === 'MAPFRAME'
        && call.readers.frameCalls === 1 && parent.calls.length === 1, 'Clear enclosure/frame differs');
      const frame = call.readers.bounds;
      assert(frame.lx <= frame.rx && frame.ly <= frame.ty, 'Observed empty frame: extend the comparison scope explicitly');
      assert(clearAaronFillMap({ maps, frame }) === null, 'Clear return differs');
      for (let x = frame.lx; x <= frame.rx; x += 1) {
        for (let y = frame.ly; y <= frame.ty; y += 1) touched[aaronMapIndex(maps.width, maps.height, x, y)] = 1;
      }
      coverage.clearCalls += 1; add(coverage.frameTypes, { [call.readers.type]: 1 });
      const edgeNonzeroToZero = { lx: 0, rx: 0, ly: 0, ty: 0 };
      for (const edge of ['lx', 'rx']) {
        for (let y = frame.ly; y <= frame.ty; y += 1) {
          const index = aaronMapIndex(maps.width, maps.height, frame[edge], y);
          if (before[index] !== 0 && after[index] === 0) edgeNonzeroToZero[edge] += 1;
        }
      }
      for (const edge of ['ly', 'ty']) {
        for (let x = frame.lx; x <= frame.rx; x += 1) {
          const index = aaronMapIndex(maps.width, maps.height, x, frame[edge]);
          if (before[index] !== 0 && after[index] === 0) edgeNonzeroToZero[edge] += 1;
        }
      }
      add(coverage.clearEdgeNonzeroToZero, edgeNonzeroToZero);
      detail = { frame, naturalCframeCalls: call.readers.frameCalls, frameSlotsUnchanged: true, edgeNonzeroToZero };
      examples.clear ??= { call: call.id, ...detail };
    } else {
      assert(parent.name === 'MY-FILL' && parent.args.mode === 'CFORM' && parent.calls.length === 1, 'Writer enclosure differs');
      const byId = new Map(call.readers.points.map((p) => [p.id, p])), points = call.args.order.map((id) => byId.get(id));
      assert(points.every(Boolean), 'Incomplete input points');
      const savedPoints = points.slice(), seenCoordinates = new Set(), occurrences = new Map();
      let duplicateCoordinates = 0, skippedX = 0, skippedY = 0;
      for (const p of points) {
        occurrences.set(p.id, (occurrences.get(p.id) ?? 0) + 1); add(coverage.pointTypes, { [p.type]: 1 });
        coverage.pointXRange[0] = Math.min(coverage.pointXRange[0], p.x); coverage.pointXRange[1] = Math.max(coverage.pointXRange[1], p.x);
        if (p.x < 0 || p.x >= maps.width) { skippedX += 1; continue; }
        assert(p.y !== null, 'Missing required natural Y');
        coverage.pointYRange[0] = Math.min(coverage.pointYRange[0], p.y); coverage.pointYRange[1] = Math.max(coverage.pointYRange[1], p.y);
        if (p.y < 0 || p.y >= maps.height) { skippedY += 1; continue; }
        if (p.x === 0) coverage.writerPictureEdgePoints.lx += 1;
        if (p.x === maps.width - 1) coverage.writerPictureEdgePoints.rx += 1;
        if (p.y === 0) coverage.writerPictureEdgePoints.ly += 1;
        if (p.y === maps.height - 1) coverage.writerPictureEdgePoints.ty += 1;
        const index = aaronMapIndex(maps.width, maps.height, p.x, p.y);
        if (seenCoordinates.has(index)) duplicateCoordinates += 1;
        seenCoordinates.add(index); touched[index] = 1;
      }
      for (const [id, count] of occurrences) {
        const p = byId.get(id), xValid = p.x >= 0 && p.x < maps.width, yValid = xValid && p.y >= 0 && p.y < maps.height;
        assert(p.xCalls === count * (yValid ? 2 : 1) && p.yCalls === count * (xValid ? yValid ? 2 : 1 : 0), 'Natural getter counts differ from guard/store path');
      }
      assert(writeAaronListToFillMap({ maps, points, value: call.args.value }) === null
        && points.every((p, i) => p === savedPoints[i]), 'Writer return/point identity differs');
      coverage.writerCalls += 1; coverage.pointsCompared += points.length; coverage.duplicateCoordinates += duplicateCoordinates;
      coverage.repeatedPointIdentities += points.length - byId.size; coverage.skippedXPoints += skippedX; coverage.skippedYPoints += skippedY;
      add(coverage.writerValues, { [call.args.value]: 1 });
      coverage.writerLengthRange[0] = Math.min(coverage.writerLengthRange[0], points.length);
      coverage.writerLengthRange[1] = Math.max(coverage.writerLengthRange[1], points.length);
      const previous = prep.fills[myParents.indexOf(parent)], [median, start, strategy] = previous.calls;
      assert(points.every((p) => p.y !== null) && same(points.map(({ id, type, x, y }) => ({ id, type, x, y })), start.before.outline.points),
        'Writer list differs from prior complete outline');
      assert(regionBytes(strategy.before.map, maps.fillMap).equals(regionBytes(strategy.before.map, expand(strategy.before.map))),
        'Writer output differs from preparation input region');
      const m = setAaronMedianRows(median.before.frame), s = chooseAaronFillStart(points);
      assert(m.loMedian === median.after.lo.value && m.hiMedian === median.after.hi.value && m.returnValue === median.values[0]
        && same(s.outline.map(({ id, type, x, y }) => ({ id, type, x, y })), start.after.outline.points), 'Composed median/start differs');
      const chainMaps = createAaronMaps(maps.width, maps.height); chainMaps.fillMap.set(maps.fillMap);
      assert(applyAaronFillStrategy({ maps: chainMaps, outline: s.outline, loMedian: m.loMedian, hiMedian: m.hiMedian }) === strategy.values[0],
        'Composed strategy return differs');
      assert(regionBytes(strategy.after.map, chainMaps.fillMap).equals(regionBytes(strategy.after.map, expand(strategy.after.map))),
        'Composed writer/median/start/strategy output differs');
      coverage.cformChainsCompared += 1; coverage.cformChainMapCellsCompared += strategy.after.map.cells;
      detail = { length: points.length, value: call.args.value, inputPointsSha256: digest(points), uniquePointObjects: byId.size,
        duplicateCoordinates, skippedX, skippedY, priorFill: previous.id, median: m, rotationIndex: s.rotationIndex,
        composedStrategyCellsCompared: strategy.after.map.cells, composedStrategyRegion: strategy.after.map.region,
        composedStrategyOutputSha256: sha256(regionBytes(strategy.after.map, chainMaps.fillMap)) };
      examples.writer ??= { call: call.id, ...detail };
      if (duplicateCoordinates) examples.duplicates ??= { call: call.id, duplicateCoordinates, length: points.length };
    }
    // Composed validation uses separate storage; the boundary output remains untouched.
    assert(maps.fillMap === identity && Buffer.from(maps.fillMap).equals(Buffer.from(after)), `Full-map mismatch at call ${call.id}`);
    let changed = 0, targetCells = 0, outsideCells = 0;
    for (let i = 0; i < before.length; i += 1) {
      if (before[i] !== after[i]) changed += 1;
      if (touched[i]) targetCells += 1;
      else {
        assert(before[i] === after[i], 'Unexpected change outside target coordinates'); outsideCells += 1;
        if (before[i] !== 0) coverage.outsideNonzeroCellsPreserved += 1;
      }
      const transition = { [`${before[i]}->${after[i]}`]: 1 };
      add(coverage.cellTransitions, transition); add(call.name === 'CLEAR-FILL-MAP' ? coverage.clearTransitions : coverage.writerTransitions, transition);
    }
    coverage.mapCellsCompared += before.length; coverage.changedCells += changed;
    coverage.targetCellsCompared += targetCells; coverage.outsideTargetCellsCompared += outsideCells;
    add(coverage.beforeMapValues, census(before)); add(coverage.afterMapValues, census(after));
    return { id: call.id, parent: call.parent, parentName: parent.name, parentArguments: parent.args, name: call.name,
      ...detail, returnValues: call.values, mapCellsCompared: before.length, inputMapSha256: sha256(Buffer.from(before)),
      outputMapSha256: sha256(Buffer.from(after)), changedCells: changed, targetCellsCompared: targetCells, outsideTargetCellsCompared: outsideCells };
  });
  assert(subpartParents.length === coverage.clearCalls && subpartParents.every((p) => p.calls.length === 1)
    && coverage.writerCalls === myParents.filter((p) => p.args.mode === 'CFORM').length
    && myParents.filter((p) => p.args.mode === 'SUBFORM').every((p) => p.calls.length === 0), 'Whole-scene boundary census differs');
  return { seed: sceneIndex === 0 ? 1234 : 5678, observedRun: observed.record, controlRun: controls[sceneIndex].record,
    comparison: parity(observed, controls[sceneIndex]), reportSha256: sha256(raw), reportBytes: raw.length, caps: report.caps,
    totals: report.totals, parentCounts: { myFill: myParents.length, brushFillSubpart: subpartParents.length },
    rngPreviewChecks: report.rngChecks, frameSlotPreviewChecks: report.slotChecks, naturalReaderCalls: report.readerCount,
    priorPreparation: { run: previousRun.record, reportSha256: sha256(previousRaw), freshControlComparison: previousControlComparison,
      scope: 'Separate same-painting observations aligned by all MY-FILL arguments and complete CFORM point sequences; bounded strategy regions' }, coverage, examples, rows };
});
const incomplete = run(incompleteArg, modes[0], 'aaron-boundary-map.txt'), incompleteRaw = read(resolve(incomplete.root, 'capture/aaron-boundary-map.txt'));
const incompleteLines = incompleteRaw.toString('utf8').trimEnd().split(/\r?\n/), missing = incompleteLines.filter((l) =>
  /^RETURN /.test(l) && l.includes(':FRAME-CALLS 1 :LX NIL :RX NIL :LY NIL :TY NIL'));
assert(incompleteLines[0] === 'BEGIN boundary-map v1' && incompleteLines.at(-1) === 'END boundary-map v1'
  && missing.length === 23 && !incompleteLines.some((l) => /^(ERROR|OVERFLOW|ABORT)\b/.test(l)), 'Incomplete-frame diagnostic differs');
const total = { writerCalls: 0, clearCalls: 0, pointsCompared: 0, mapCellsCompared: 0, changedCells: 0,
  targetCellsCompared: 0, outsideTargetCellsCompared: 0, duplicateCoordinates: 0, repeatedPointIdentities: 0,
  skippedXPoints: 0, skippedYPoints: 0, cformChainsCompared: 0, cformChainMapCellsCompared: 0 };
for (const scene of scenes) for (const key of Object.keys(total)) total[key] += scene.coverage[key];
const evidence = { schemaVersion: 1, status: 'measured', scope: 'Two natural boundary-map helpers in two complete paintings; every before/after FILL-MAP cell',
  comparisonUnits: { mapCells: 'Sum of full-map output cell comparisons for each call, not unique global positions',
    points: 'Ordered input list positions summed across writer calls; objects and coordinates can repeat',
    composedCells: 'Captured bounded strategy regions in retained separate same-painting preparation observations' },
  sourceSha256, parserSha256: sha256(read('research/tools/parse-boundary-map-report.mjs')),
  implementationSha256: sha256(read('engine/src/aaron-boundary-map.js')), derivationSha256: sha256(read('research/tools/derive-boundary-map-evidence.mjs')),
  dependencies: { mapImplementationSha256: sha256(read('engine/src/aaron-maps.js')),
    preparationImplementationSha256: sha256(read('engine/src/aaron-fill-preparation.js')),
    preparationParserSha256: sha256(read('research/tools/parse-fill-preparation-report.mjs')),
    nativeMapperSha256: sha256(read('research/tools/map-native-code-to-pll.mjs')) },
  native: native(nativeArg, controls[0]), priorPreparationEvidenceSha256: sha256(priorEvidenceRaw),
  originalInputsStillRequired: ['ordered point objects and integer coordinates', 'writer entry fill map', 'selected MAPFRAME slots',
    'MY-FILL CFORM frame LY/TY for the composed preparation comparison', 'scene/SCRIPT/CFLIST selection of CDEX/SDEX'],
  unmeasured: ['other paintings/dimensions/types', 'writer values other than measured census', 'noninteger coordinates and original error behavior',
    'empty/inverted frames or map-external clear bounds', 'out-of-bounds point branches if absent in the measured census',
    'PATCH-MAP or other untracked helper side effects', 'SUBFORM initial boundary construction', 'integrated JS MY-FILL/BRUSH-FILL and CFORM POST-FILL'],
  incompleteFrameDiagnostic: { run: incomplete.record, reportSha256: sha256(incompleteRaw), missingFrameInputs: missing.length,
    comparison: parity(incomplete, controls[0]), correction: 'Observe integer slots via SLOT-VALUE on each naturally returned CFRAME object; remove ineffective LX/RX/LY/TY function wrappers',
    causeScope: 'The wrappers observed no bound-reader calls in this workload. Computed native helper calls and slot symbols support slot-access interpretation; helper ABI is not resolved.' },
  total, scenes };
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output, sha256: sha256(read(output)), total, controls: scenes.map((s) => s.comparison) }));
