#!/usr/bin/env node
// Compare complete original SUBFORM outputs to independently composed JS.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSubformBoundaryReport } from './parse-subform-boundary-report.mjs';
import { validateAaronNativeEvidence } from './validate-aaron-native-evidence.mjs';
import { createAaronMaps, aaronMapIndex } from '../../engine/src/aaron-maps.js';
import { traceAaronPatchEdge, makeAaronListFrame, fillAaronSubformFromBoundary } from '../../engine/src/aaron-subform-boundary.js';
import { sha256 } from './index-allegro-image.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = p => readFileSync(resolve(p));
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const digest = v => sha256(Buffer.from(JSON.stringify(v)));
const xyz = p => ({ x: p.x, y: p.y, z: p.z });
const bounds = f => ({ lx: f.lx, rx: f.rx, ly: f.ly, ty: f.ty });
const add = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const range = (r, n) => { r[0] = Math.min(r[0], n); r[1] = Math.max(r[1], n); };
const modeNames = ['writer-stream-seed-1234', 'writer-full-seed-5678'];
function run(rootArg, mode, probeName = null) {
  const root = resolve(rootArg), summaryPath = resolve(root, 'summary.json'), summary = json(summaryPath);
  const aa0 = read(resolve(root, 'capture/aa0')), scene = read(resolve(root, 'capture/aaron-scene-state-snapshot.txt'));
  assert(summary.complete === true && summary.mode === mode && sha256(aa0) === summary.aa0Sha256
    && sha256(scene) === summary.sceneReportSha256, 'Run completion/mode/output binding differs');
  if (probeName) assert(summary.probeOutputNames.includes(probeName)
    && sha256(read(resolve(root, 'capture/aaron-pre-scene-probe.cl'))) === summary.preSceneProbeSha256, 'Staged probe binding differs');
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
  const data = map.bits === 4 ? new Uint8Array(map.cells) : new Uint16Array(map.cells);
  for (const row of map.rows) {
    let x = 0;
    for (const [value, count] of row.runs) for (let n = 0; n < count; n++) data[aaronMapIndex(map.width, map.height, x++, row.y)] = value;
  }
  return data;
}
function mapDigest(data, bits) {
  if (bits === 4) return sha256(Buffer.from(data));
  const bytes = Buffer.alloc(data.length * 2);
  for (let i = 0; i < data.length; i++) bytes.writeUInt16LE(data[i], i * 2);
  return sha256(bytes);
}
export function compareSubformScene(observedArg, controlArg, sceneIndex) {
  const mode = modeNames[sceneIndex], observed = run(observedArg, mode, 'aaron-subform-boundary.txt'), control = run(controlArg, mode);
  const sourceSha256 = sha256(read('research/introspection/subform-boundary-capture.cl'));
  assert(observed.record.preSceneProbeSha256 === sourceSha256, 'Current inspected observer differs from capture');
  const raw = read(resolve(observed.root, 'capture/aaron-subform-boundary.txt'));
  const report = parseSubformBoundaryReport(raw.toString('utf8'));
  assert(same(report.directions, { x: [1, 1, 0, -1, -1, -1, 0, 1], y: [0, 1, 1, 1, 0, -1, -1, -1] }), 'Direction arrays differ from implementation');
  const coverage = { chainsCompared: 0, outlinePointsCompared: 0, framesCompared: 0, countsCompared: 0, returnsCompared: 0,
    fullOutputMapCellsCompared: 0, fillCellsChanged: 0, patchCellsChanged: 0, outsideFrameMapCellsCompared: 0,
    upstreamWholeMapEqualityChecks: 0, upstreamWholeMapCellsChecked: 0, startDirectionChanges: 0, unboundEntryCounts: 0,
    naturalPatchReaderCalls: 0, naturalCountReaderCalls: 0, fillsWithoutPatchReader: 0,
    zeroCountFills: 0, noPatchReaderZeroCountFills: 0,
    closedOutlines: 0, maximumTerminations: 0, inputFillValues: {}, inputPatchValues: {}, outputFillValues: {},
    fillTransitions: {}, patchTransitions: {}, stepDirections: {}, frameTypes: {}, pointTypes: {},
    lengthRange: [Infinity, -Infinity], maximumRange: [Infinity, -Infinity], patchIdRange: [Infinity, -Infinity], dimensions: [] };
  const chains = [], examples = {};
  for (const parent of report.parents) {
    assert(parent.calls.length % 3 === 0, 'Incomplete producer/frame/method chain');
    for (let i = 0; i < parent.calls.length; i += 3) {
      const [patch, frameCall, fill] = parent.calls.slice(i, i + 3).map(id => report.calls[id - 1]);
      assert(patch.name === 'PATCH-EDGE' && frameCall.name === 'LIST-FRAME' && fill.name === 'MY-FILL', 'Unexpected chain order');
      const fillRecord = report.fills[fill.fill - 1];
      assert(fillRecord.cdex === parent.cdex && fillRecord.sdex === parent.sdex, 'SUBFORM arguments differ from parent');
      assert(same(patch.after.outline, frameCall.before.outline) && same(frameCall.before.outline, frameCall.after.outline)
        && same(patch.after.outline, fill.before.outline) && same(frameCall.after.frame, fill.before.frame)
        && same(fill.before.frame, fill.after.frame), 'Producer/list/frame boundary content differs');
      const natural = fill.after.readers;
      assert(natural.length >= 1 && natural.at(-1).name === 'CFORM-COUNT'
        && natural.slice(0, -1).every(r => r.name === 'PATCHDEX' && r.value === patch.before.pdex),
        `Natural post-fill reader sequence/target differs at fill ${fill.fill}`);
      const cformCountInput = natural.at(-1).value;
      coverage.naturalPatchReaderCalls += natural.length - 1; coverage.naturalCountReaderCalls++;
      if (natural.length === 1) coverage.fillsWithoutPatchReader++;
      const inputFill = expand(patch.before.maps.fill), inputPatch = expand(patch.before.maps.patch);
      const expectedFill = expand(fill.after.maps.fill), expectedPatch = expand(fill.after.maps.patch);
      const maps = createAaronMaps(patch.before.maps.fill.width, patch.before.maps.fill.height);
      assert(fill.after.maps.fill.width === maps.width && fill.after.maps.fill.height === maps.height, 'Map dimensions changed');
      maps.fillMap.set(inputFill); maps.patchMap.set(inputPatch);
      const fillIdentity = maps.fillMap, patchIdentity = maps.patchMap, standaloneStart = xyz(patch.before.start);
      const standaloneOutline = traceAaronPatchEdge({ maps, start: standaloneStart, maximum: patch.before.max, patchId: patch.before.pdex });
      assert(standaloneOutline !== null && same(standaloneOutline.map(xyz), patch.after.outline.map(xyz))
        && same(standaloneStart, xyz(patch.after.start)), `PATCH-EDGE output/start differs at fill ${fill.fill}`);
      assert(standaloneOutline.at(-1) === standaloneStart, 'JS patch walker lost start reference');
      assert(maps.fillMap.every((v, j) => v === inputFill[j]) && maps.patchMap.every((v, j) => v === inputPatch[j]), 'JS producer changed maps');
      const standaloneFrame = makeAaronListFrame(standaloneOutline);
      assert(same(standaloneFrame, bounds(frameCall.after.frame)), `LIST-FRAME output differs at fill ${fill.fill}`);
      const start = xyz(patch.before.start), result = fillAaronSubformFromBoundary({ maps, start, maximum: patch.before.max,
        patchId: patch.before.pdex, flagBit: fill.before.flagBit, cformCount: cformCountInput });
      assert(result && same(result.boundary.map(xyz), patch.after.outline.map(xyz))
        && same(result.outline.map(xyz), fill.after.outline.map(xyz)) && same(result.frame, bounds(fill.after.frame))
        && same(start, xyz(patch.after.start)), `Composed outline/frame/start differs at fill ${fill.fill}`);
      assert(result.subpartCount === fill.after.subpCount && fill.after.subpCountBound === true
        && same(fill.after.values, [result.cformCount]), `Composed count/return differs at fill ${fill.fill}`);
      if (result.subpartCount === 0) coverage.zeroCountFills++;
      if (natural.length === 1) {
        assert(result.subpartCount === 0, 'No PATCHDEX read but positive observed count'); coverage.noPatchReaderZeroCountFills++;
      }
      assert(maps.fillMap === fillIdentity && maps.patchMap === patchIdentity, 'JS composition changed map storage');
      let fillChanged = 0, patchChanged = 0, outsideCells = 0;
      const frame = result.frame;
      for (let x = 0; x < maps.width; x++) for (let y = 0; y < maps.height; y++) {
        const j = aaronMapIndex(maps.width, maps.height, x, y);
        assert(maps.fillMap[j] === expectedFill[j] && maps.patchMap[j] === expectedPatch[j], `Complete composed map differs at fill ${fill.fill}, (${x},${y})`);
        add(coverage.inputFillValues, inputFill[j]); add(coverage.inputPatchValues, inputPatch[j]); add(coverage.outputFillValues, expectedFill[j]);
        if (inputFill[j] !== expectedFill[j]) { fillChanged++; add(coverage.fillTransitions, `${inputFill[j]}->${expectedFill[j]}`); }
        if (inputPatch[j] !== expectedPatch[j]) { patchChanged++; add(coverage.patchTransitions, `${inputPatch[j]}->${expectedPatch[j]}`); }
        if (x < frame.lx || x > frame.rx || y < frame.ly || y > frame.ty) {
          assert(inputFill[j] === expectedFill[j] && inputPatch[j] === expectedPatch[j], 'Observed map changed outside computed frame'); outsideCells += 2;
        }
      }
      coverage.chainsCompared++; coverage.outlinePointsCompared += standaloneOutline.length;
      coverage.framesCompared++; coverage.countsCompared++; coverage.returnsCompared++;
      coverage.fullOutputMapCellsCompared += maps.fillMap.length * 2;
      coverage.fillCellsChanged += fillChanged; coverage.patchCellsChanged += patchChanged;
      coverage.outsideFrameMapCellsCompared += outsideCells; coverage.upstreamWholeMapEqualityChecks += 4;
      coverage.upstreamWholeMapCellsChecked += maps.fillMap.length * 4;
      if (patch.before.start.z !== patch.after.start.z) coverage.startDirectionChanges++;
      if (!fill.before.subpCountBound) coverage.unboundEntryCounts++;
      const closed = standaloneOutline[0].x === start.x && standaloneOutline[0].y === start.y;
      if (closed) coverage.closedOutlines++; else { coverage.maximumTerminations++; assert(standaloneOutline.length === patch.before.max + 2, 'Unexpected nonclosed termination'); }
      range(coverage.lengthRange, standaloneOutline.length); range(coverage.maximumRange, patch.before.max); range(coverage.patchIdRange, patch.before.pdex);
      for (const p of patch.after.outline) add(coverage.pointTypes, p.type);
      for (const p of standaloneOutline.slice(0, -1)) add(coverage.stepDirections, p.z);
      add(coverage.frameTypes, frameCall.after.frame.type);
      if (!coverage.dimensions.some(d => same(d, [maps.width, maps.height]))) coverage.dimensions.push([maps.width, maps.height]);
      const row = { fill: fill.fill, parent: parent.id, cdex: parent.cdex, sdex: parent.sdex,
        startBefore: xyz(patch.before.start), startAfter: xyz(patch.after.start), maximum: patch.before.max, patchId: patch.before.pdex,
        outlineLength: standaloneOutline.length, outlineSha256: digest(standaloneOutline.map(xyz)), frame, rotationIndex: result.rotationIndex,
        flagBit: fill.before.flagBit, cformCountInput, subpartCount: result.subpartCount, returnValue: result.cformCount,
        patchDexReaderCalls: natural.length - 1, cformCountReaderCalls: 1,
        inputFillSha256: mapDigest(inputFill, 4), inputPatchSha256: mapDigest(inputPatch, 16), outputFillSha256: mapDigest(expectedFill, 4),
        outputPatchSha256: mapDigest(expectedPatch, 16), fillChanged, patchChanged, closed, fullOutputCellsCompared: maps.fillMap.length * 2 };
      chains.push(row);
      examples.first ??= row;
      if (!examples.shortest || row.outlineLength < examples.shortest.outlineLength) examples.shortest = row;
      if (!examples.longest || row.outlineLength > examples.longest.outlineLength) examples.longest = row;
      if (patch.before.start.z !== patch.after.start.z) examples.changedStartDirection ??= row;
    }
  }
  assert(coverage.chainsCompared === report.totals['PATCH-EDGE'] && report.totals['LIST-FRAME'] === coverage.chainsCompared
    && report.totals['MY-FILL'] === coverage.chainsCompared, 'Incomplete chain comparison');
  return { run: observed.record, control: control.record, comparison: parity(observed, control), reportSha256: sha256(raw),
    observation: { totals: report.totals, sizes: report.sizes, checks: report.checks, parents: report.parents.length,
      fills: report.fills.length, fillSequenceSha256: digest(report.fills.map(({ mode, cdex, sdex }) => ({ mode, cdex, sdex }))),
      completeTypedInputVectorCopies: true, originalInputMapsEqualAtPatchExitAndSubformEntry: true,
      naturalOutlineAndFrameReturnIdentityLinks: true, pointSlotSource: 'SLOT-VALUE' }, coverage, examples, chains };
}
function rejected(rootArg, runId, version, issueContext) {
  const root = resolve(rootArg), requestPath = resolve(root, 'pre-scene-probe-request.json'), request = json(requestPath);
  const raw = read(resolve(root, 'capture/aaron-subform-boundary.txt')), probe = read(resolve(root, 'capture/aaron-pre-scene-probe.cl'));
  assert(!existsSync(resolve(root, 'summary.json')) && request.schemaVersion === 1
    && request.runId === runId && raw.toString('utf8').startsWith(`BEGIN subform-boundary v${version}`)
    && resolve(request.runtimeExecutable) === resolve(root, 'runtime/AARON.exe')
    && request.probeOutputNames.includes('aaron-subform-boundary.txt') && sha256(probe) === request.probeSha256
    && !/^END subform-boundary v[123]\r?$/m.test(raw.toString('utf8')), 'Rejected diagnostic source/completion binding differs');
  const errorRecords = raw.toString('utf8').split(/\r?\n/).filter(line => line.startsWith('ERROR '));
  assert(version === 1 ? errorRecords.length === 1 && /^ERROR id=3 phase=:BEFORE type="SIMPLE-ERROR"$/.test(errorRecords[0])
    : errorRecords.length === 0, 'Rejected diagnostic error record differs');
  let rejected = false; try { parseSubformBoundaryReport(raw.toString('utf8')); } catch { rejected = true; }
  assert(rejected, 'Incomplete diagnostic unexpectedly accepted');
  return { runId: request.runId, completion: 'No successful runner summary or observer END marker',
    requestSha256: sha256(read(requestPath)), probeSha256: sha256(probe), reportSha256: sha256(raw),
    parserRejected: true, errorRecords, issueContext,
    contextSource: 'Owning runner invocation and investigation log; exact capture/source bindings and incomplete/error markers are independently checked',
    includedInParityCounts: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [obs1234, ctrl1234, obs5678, ctrl5678, nativeRoot, unboundRoot, timeoutRoot, outputArg, ...extra] = process.argv.slice(2);
  if (!outputArg || extra.length) throw new Error('Usage: node derive-subform-boundary-evidence.mjs <obs1234> <control1234> <obs5678> <control5678> <native-root> <unbound-rejected-root> <timeout-rejected-root> <fresh-evidence.json>');
  assert(!existsSync(resolve(outputArg)), 'Evidence output must be fresh');
  const sources = ['research/introspection/subform-boundary-capture.cl', 'research/introspection/subform-boundary-native-links.cl',
    'research/tools/parse-subform-boundary-report.mjs', 'research/tools/validate-aaron-native-evidence.mjs',
    'research/tools/derive-subform-boundary-evidence.mjs', 'engine/src/aaron-subform-boundary.js', 'engine/src/aaron-maps.js',
    'engine/src/aaron-fill-preparation.js', 'engine/src/aaron-post-fill.js'];
  const dependencies = ['fill-preparation-parity-20261005.json', 'post-fill-map-parity-20261005.json'].map((name, i) => {
    const path = `research/introspection/evidence/${name}`, data = json(path);
    assert(data.status === 'measured' && data.implementationSha256 === sha256(read(sources[i + 7])), 'Composed dependency differs from measured implementation');
    return { path, sha256: sha256(read(path)), implementationSha256: data.implementationSha256 };
  });
  const scenes = [compareSubformScene(obs1234, ctrl1234, 0), compareSubformScene(obs5678, ctrl5678, 1)];
  const nativeRun = run(nativeRoot, modeNames[0], 'aaron-subform-boundary-native-links.txt');
  const native = validateAaronNativeEvidence(nativeRoot, { names: ['PATCH-EDGE', 'LIST-FRAME', 'NEIGHBORS'],
    metadataName: 'aaron-subform-boundary-native-links.txt', marker: 'subform-boundary-native-links', probePath: sources[1] });
  native.run = nativeRun.record; native.comparison = parity(nativeRun, run(ctrl1234, modeNames[0]));
  const evidence = { schemaVersion: 1, status: 'measured',
    scope: 'Complete natural PATCH-EDGE and LIST-FRAME outputs, existing maps preserved upstream, and composed SUBFORM fill outputs for two paintings',
    sourceSha256: sha256(read(sources[0])), implementationSha256: sha256(read(sources[5])),
    files: sources.map(path => ({ path, sha256: sha256(read(path)) })), dependencies, native, scenes,
    rejectedDiagnostics: [rejected(unboundRoot, 'subform-boundary-1234-b', 1, 'v1 observer required SUBP-COUNT before its first binding; stopped owned runtime, excluded'),
      rejected(timeoutRoot, 'subform-boundary-1234-c', 2, 'v2 repeated full map snapshots exceeded the 280-second run limit; incomplete, excluded')],
    limitations: ['Original complete entry maps, scan-row start/MAX/patch inputs, FLAG-BIT and natural CFORM-COUNT remain required; their generation is not recovered.',
      'Natural outlines are nonempty integer TRIPT lists; fractional/empty LIST-FRAME behavior, PATCH-EDGE stranded/NIL and maximum termination branches lack observed holdouts.',
      'Retaining the start object at the output tail is a native cons interpretation; natural capture measures its values and mutation, not that tail-object identity.',
      'POST-FILL value-2-to-1 conversion is still native inference; the observed composed fill maps have no value-2 changes.',
      'Whole-map EQUALP flags measure unchanged inputs at PATCH exit and MY-FILL entry; a false flag is rejected and requires a new full intermediate capture.',
      'The composed fill covers successful SUBFORM boundaries only; the surrounding BRUSH-FILL scan, iris branches, painting/brush clearing and integrated scene generation remain open.',
      'Wrapper enclosures and return object links establish measured boundaries, not direct native callers. NEIGHBORS is mapped but not characterized or ported.',
      'All-cell SHA-256 encoding is x*height+y order; patch values use explicit little-endian unsigned 16-bit encoding.',
      'Standalone Ghidra uses a generic x86 Windows compiler model; its C types and reconstructed helper arguments are not the recovered Allegro Lisp ABI.'] };
  writeFileSync(resolve(outputArg), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output: outputArg, evidenceSha256: sha256(read(outputArg)), scenes: scenes.map(s => s.coverage) }));
}
