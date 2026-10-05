#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseScanRowReport } from './parse-scan-row-report.mjs';
import { parseSubformBoundaryReport } from './parse-subform-boundary-report.mjs';
import { validateAaronNativeEvidence } from './validate-aaron-native-evidence.mjs';
import { createAaronMaps } from '../../engine/src/aaron-maps.js';
import { countAaronPatchNeighbors, scanAaronPatchRow, fillAaronSubformFromRow } from '../../engine/src/aaron-scan-row.js';
import { sha256 } from './index-allegro-image.mjs';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const read = p => readFileSync(resolve(p));
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const same = isDeepStrictEqual;
const digest = v => sha256(Buffer.from(JSON.stringify(v)));
const add = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const xyz = p => p === null ? null : ({ x: p.x, y: p.y, z: p.z });
function loadRun(root, mode, probe) {
  const summary = json(`${root}/summary.json`), aa0 = read(`${root}/capture/aa0`), scene = read(`${root}/capture/aaron-scene-state-snapshot.txt`);
  assert(summary.complete === true && summary.mode === mode && summary.aa0Sha256 === sha256(aa0) && summary.sceneReportSha256 === sha256(scene), 'Run completion/output binding differs');
  if (probe) assert(summary.probeOutputNames.includes(probe) && summary.preSceneProbeSha256 === sha256(read(`${root}/capture/aaron-pre-scene-probe.cl`)), 'Staged observer differs');
  else assert(summary.preSceneProbeSha256 === null && summary.probeOutputNames.length === 0, 'Expected fresh uninstrumented control');
  return { summary, aa0, scene, summarySha256: sha256(read(`${root}/summary.json`)) };
}
function expandRows(rows, width, height, storage) {
  for (const row of rows) {
    let x = 0;
    for (const [value, count] of row.runs) for (let n = 0; n < count; n++) storage[x++ * height + row.y] = value;
    assert(x === width, 'Row does not cover map width');
  }
}
function matrix(report) {
  const histogram = {}, dimensions = {}, centerStates = {}, patchIds = {};
  const dx = [1, 1, 0, -1, -1, -1, 0, 1], dy = [0, 1, 1, 1, 0, -1, -1, -1];
  let index = 0, queries = 0, layouts = 0;
  for (const [width, height] of [[1, 1], [1, 3], [3, 1], [2, 2], [3, 3], [5, 5]]) {
    const maps = createAaronMaps(width, height);
    for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
      if (width === 5 && (![0, 2, 4].includes(x) || ![0, 2, 4].includes(y))) continue;
      for (const patchId of [0, 7, 65535]) for (const center of [0, 1]) for (let mask = 0; mask < 256; mask++) {
        const row = report.masks[index++], expected = { width, height, x, y, patchId, center, mask };
        assert(row && same(Object.fromEntries(Object.keys(expected).map(k => [k, row[k]])), expected), 'Mask domain/order incomplete');
        const other = patchId === 0 ? 9 : 0; maps.patchMap.fill(other); maps.patchMap[x * height + y] = center ? patchId : other;
        for (let d = 0; d < 8; d++) {
          const nx = x + dx[d], ny = y + dy[d];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && (mask & (1 << d))) maps.patchMap[nx * height + ny] = patchId;
        }
        const input = maps.patchMap.slice(), observed = countAaronPatchNeighbors({ maps, x, y, patchId });
        assert(observed === row.value && same(maps.patchMap, input), `Neighbor mask mismatch ${index}`);
        add(histogram, row.value); add(dimensions, `${width}x${height}`); add(centerStates, center); add(patchIds, patchId);
      }
    }
  }
  assert(index === report.masks.length, 'Extra mask cases');
  const maps = createAaronMaps(5, 5);
  for (let pattern = 0; pattern < 16; pattern++) for (const patchId of [0, 7, 65535]) {
    const layout = report.layouts[layouts++], other = patchId === 0 ? 9 : 0;
    assert(layout.id === layouts && layout.patchId === patchId, 'Layout domain differs');
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      const match = pattern === 0 ? false : pattern === 1 ? true : pattern === 2 ? x === 2 : pattern === 3 ? y === 2
        : pattern === 4 ? x === 2 && y === 2 : pattern === 5 ? x === 0 || x === 4 || y === 0 || y === 4
        : pattern === 6 ? (x + y) % 2 === 0 : (x * 17 + y * 31 + pattern * 13 + x * y * 7) % 11 < 6;
      maps.patchMap[x * 5 + y] = match ? patchId : other;
    }
    const retained = new Uint16Array(25); expandRows(layout.rows, 5, 5, retained);
    assert(same(maps.patchMap, retained), 'Recorded matrix layout differs from construction');
    for (let y = -1; y < 5; y++) for (let lx = 0; lx <= 5; lx++) for (let rx = 0; rx <= 5; rx++) {
      const query = report.queries[queries++];
      assert(query && query.layout === layouts && query.lx === lx && query.rx === rx && query.y === y && query.patchId === patchId, 'Query domain/order incomplete');
      let flashes = 0; const before = maps.patchMap.slice();
      const value = scanAaronPatchRow({ maps, lx, rx, y, patchId, flashSpot: () => { flashes++; } });
      assert(same(value, xyz(query.point)) && same(maps.patchMap, before) && flashes === (y < 0 ? 0 : 1), `Synthetic scan mismatch ${queries}`);
    }
  }
  assert(layouts === 48 && queries === report.queries.length, 'Missing/extra scan matrix cases');
  return { neighborCasesCompared: index, scanCasesCompared: queries, layoutCasesCompared: layouts,
    returnHistogram: histogram, dimensionCases: dimensions, centerStates, patchIds,
    maskTapeSha256: digest(report.masks), queryTapeSha256: digest(report.queries), restoredBindingsMapsAndCopiedRandomPreview: true };
}
export function compareScanScene(observedRoot, controlRoot, boundaryRoot, sceneIndex) {
  const mode = ['writer-stream-seed-1234', 'writer-full-seed-5678'][sceneIndex];
  const observed = loadRun(observedRoot, mode, 'aaron-scan-row.txt'), control = loadRun(controlRoot, mode, null);
  const boundary = loadRun(boundaryRoot, mode, 'aaron-subform-boundary.txt');
  assert(observed.aa0.equals(control.aa0) && observed.scene.equals(control.scene)
    && boundary.aa0.equals(control.aa0) && boundary.scene.equals(control.scene), 'Observed/previous seam output differs from fresh control');
  for (const key of ['smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(observed.summary[key] === control.summary[key]
      && (key === 'smallImage' || boundary.summary[key] === control.summary[key]), `Control setup differs: ${key}`);
  }
  assert(observed.summary.preSceneProbeSha256 === sha256(read('research/introspection/scan-row-capture.cl'))
    && boundary.summary.preSceneProbeSha256 === sha256(read('research/introspection/subform-boundary-capture.cl')), 'Current probe differs from measured source');
  const raw = read(`${observedRoot}/capture/aaron-scan-row.txt`), report = parseScanRowReport(raw.toString('utf8'));
  assert(same(report.directions, { x: [1, 1, 0, -1, -1, -1, 0, 1], y: [0, 1, 1, 1, 0, -1, -1, -1] }), 'Natural directions differ');
  const coverage = { scansCompared: 0, neighborsCompared: 0, nonNilScans: 0, nilScans: 0, negativeYScans: 0, emptyOrInvertedScans: 0,
    flashCalls: 0, completeMapEqualityChecks: 0, completeMapElementsChecked: 0, rowCellsCaptured: 0, neighborReturns: {}, pointTypes: {},
    scanToPatchIdentities: 0, originalCountMaximumMatches: 0, composedFillsCompared: 0, composedOutputMapCellsCompared: 0, boundaryRowCellsLinked: 0 };
  const maps = createAaronMaps(320, 480), positiveScans = [];
  for (const scan of report.scans) {
    assert(scan.width === maps.width && scan.height === maps.height, 'Natural dimensions differ');
    expandRows(scan.rows, maps.width, maps.height, maps.patchMap); coverage.rowCellsCaptured += scan.rows.length * maps.width;
    let flashCalls = 0; const result = scanAaronPatchRow({ maps, lx: scan.lx, rx: scan.rx, y: scan.y, patchId: scan.patchId, flashSpot: () => { flashCalls++; } });
    assert(same(result, xyz(scan.point)) && scan.flash.length === flashCalls, `Natural scan mismatch ${scan.id}`);
    const expectedNeighbors = [];
    if (scan.y >= 0) for (let x = scan.lx; x < scan.rx; x++) {
      if (maps.patchMap[x * maps.height + scan.y] !== scan.patchId) continue;
      const value = countAaronPatchNeighbors({ maps, x, y: scan.y, patchId: scan.patchId });
      expectedNeighbors.push([x, scan.y, scan.patchId, value]); if (value > 2) break;
    }
    assert(same(scan.neighbors, expectedNeighbors), `Natural neighbor calls/results mismatch ${scan.id}`);
    for (const n of scan.neighbors) add(coverage.neighborReturns, n[3]);
    coverage.scansCompared++; coverage.neighborsCompared += scan.neighbors.length; coverage.flashCalls += flashCalls;
    coverage.completeMapEqualityChecks += 2; coverage.completeMapElementsChecked += maps.width * maps.height * 2;
    if (scan.y < 0) coverage.negativeYScans++;
    if (scan.lx >= scan.rx) coverage.emptyOrInvertedScans++;
    if (scan.point) { coverage.nonNilScans++; add(coverage.pointTypes, scan.point.type); positiveScans.push({ id: scan.id, parent: scan.parent, args: [scan.lx, scan.rx, scan.y, scan.patchId], point: scan.point, neighborCalls: scan.neighbors.length }); }
    else coverage.nilScans++;
  }
  const boundaryRaw = read(`${boundaryRoot}/capture/aaron-subform-boundary.txt`), old = parseSubformBoundaryReport(boundaryRaw.toString('utf8'));
  const oldChains = old.parents.flatMap(parent => {
    assert(parent.calls.length % 3 === 0 && same(report.parents[parent.id - 1].args, [parent.cdex, parent.sdex]), 'Parent inputs/chain length differ');
    const chains = []; for (let i = 0; i < parent.calls.length; i += 3) {
      const [patch, frame, fill] = parent.calls.slice(i, i + 3).map(id => old.calls[id - 1]);
      assert(patch.name === 'PATCH-EDGE' && frame.name === 'LIST-FRAME' && fill.name === 'MY-FILL', 'Original boundary chain differs');
      chains.push({ parent: parent.id, patch, fill });
    } return chains;
  });
  assert(report.patches.length === oldChains.length && report.parents.length === old.parents.length, 'Boundary alignment differs');
  const linkedPatches = [];
  for (let index = 0; index < report.patches.length; index++) {
    const link = report.patches[index], scan = report.scans[link.scanId - 1], chain = oldChains[index], input = chain.patch.before, output = chain.fill.after;
    assert(link.parent === chain.parent && same(xyz(link.start), xyz(scan.point)) && same(xyz(link.start), xyz(input.start))
      && link.maximum === input.max && link.patchId === input.pdex, 'Observed scan/boundary inputs differ');
    const full = createAaronMaps(input.maps.patch.width, input.maps.patch.height);
    expandRows(input.maps.patch.rows, full.width, full.height, full.patchMap); expandRows(input.maps.fill.rows, full.width, full.height, full.fillMap);
    for (const row of scan.rows) {
      let x = 0; for (const [value, count] of row.runs) for (let n = 0; n < count; n++) { assert(full.patchMap[x++ * full.height + row.y] === value, 'Scan rows differ at prior boundary entry'); coverage.boundaryRowCellsLinked++; }
    }
    const cformCounts = output.readers.filter(r => r.name === 'CFORM-COUNT');
    assert(cformCounts.length === 1, 'Missing natural composed count');
    const result = fillAaronSubformFromRow({ maps: full, lx: scan.lx, rx: scan.rx, y: scan.y, patchId: scan.patchId,
      maximum: link.maximum, flagBit: chain.fill.before.flagBit, cformCount: cformCounts[0].value });
    assert(result && same(result.seedStart, xyz(input.start)) && same(result.outline, output.outline.map(xyz))
      && same(result.frame, Object.fromEntries(['lx', 'rx', 'ly', 'ty'].map(k => [k, output.frame[k]])))
      && result.subpartCount === output.subpCount && same([result.cformCount], output.values), 'Composed scan/fill scalar mismatch');
    for (const [captured, actual] of [[output.maps.fill, full.fillMap], [output.maps.patch, full.patchMap]]) {
      for (const row of captured.rows) { let x = 0; for (const [value, count] of row.runs) for (let n = 0; n < count; n++) {
        assert(actual[x++ * full.height + row.y] === value, 'Composed final map mismatch'); coverage.composedOutputMapCellsCompared++;
      } }
    }
    coverage.scanToPatchIdentities++; coverage.composedFillsCompared++;
    if (link.maximum === link.naturalCount) coverage.originalCountMaximumMatches++;
    linkedPatches.push(link);
  }
  return { seed: sceneIndex ? 5678 : 1234, run: { ...observed.summary, summarySha256: observed.summarySha256, rawReportSha256: sha256(raw) },
    control: { ...control.summary, summarySha256: control.summarySha256 }, previousBoundaryRun: { ...boundary.summary, summarySha256: boundary.summarySha256, rawReportSha256: sha256(boundaryRaw) },
    aa0ByteIdentical: true, sceneReportByteIdentical: true,
    previousBoundarySmallImageRequest: boundary.summary.smallImage, scannerSmallImageRequest: observed.summary.smallImage,
    coverage, matrix: matrix(report), positiveScans, linkedPatches,
    naturalScanTapeSha256: digest(report.scans), parents: report.parents.map(p => ({ id: p.id, args: p.args, scans: p.scanIds.length, patches: p.patchIds.length })) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [a, ca, ba, b, cb, bb, nativeRoot, rejectedRoot, output] = process.argv.slice(2);
  assert([a, ca, ba, b, cb, bb, nativeRoot, rejectedRoot, output].every(Boolean), 'Usage: derive-scan-row-evidence.mjs <observed1234> <control1234> <boundary1234> <observed5678> <control5678> <boundary5678> <nativeRoot> <excluded-v1> <fresh output>');
  const scenes = [compareScanScene(a, ca, ba, 0), compareScanScene(b, cb, bb, 1)];
  const native = validateAaronNativeEvidence(nativeRoot, { names: ['SCAN-ROW', 'NEIGHBORS'], metadataName: 'aaron-scan-row-native-links.txt', marker: 'scan-row-native-links', probePath: 'research/introspection/scan-row-native-links.cl' });
  const nativeRun = loadRun(nativeRoot, 'writer-stream-seed-1234', 'aaron-scan-row-native-links.txt'), control = loadRun(ca, 'writer-stream-seed-1234', null);
  assert(nativeRun.aa0.equals(control.aa0) && nativeRun.scene.equals(control.scene), 'Native capture changed original output');
  const rejected = loadRun(rejectedRoot, 'writer-stream-seed-1234', 'aaron-scan-row.txt');
  const rejectedRaw = read(`${rejectedRoot}/capture/aaron-scan-row.txt`), rejectedSource = read(`${rejectedRoot}/capture/aaron-pre-scene-probe.cl`);
  const rejectedRequest = json(`${rejectedRoot}/pre-scene-probe-request.json`), rejectedText = rejectedRaw.toString('utf8');
  const rejectedCompleteLines = rejectedText.split(/\r?\n/).filter(l => l.startsWith('COMPLETE '));
  assert(rejectedText.startsWith('BEGIN scan-row v1') && rejectedText.trimEnd().endsWith('END scan-row v1') && rejectedCompleteLines.length === 1
    && rejectedRequest.runId === rejected.summary.runId && rejectedRequest.probeSha256 === rejected.summary.preSceneProbeSha256
    && sha256(rejectedSource) === 'ed75e4257fd73e19867dcb16b33d711b96a932f4671786a2b1f83a01b5333db5'
    && !rejected.aa0.equals(control.aa0) && !rejected.scene.equals(control.scene), 'Excluded diagnostic binding differs');
  const rejectedComplete = parseLispRecord(rejectedCompleteLines[0], 'COMPLETE');
  assert(rejectedComplete.errors.value === 0 && rejectedComplete.patches.value === 0 && rejectedComplete.scans.value === 3317, 'Excluded diagnostic counters differ');
  const sources = ['engine/src/aaron-scan-row.js', 'engine/src/aaron-subform-boundary.js', 'engine/src/aaron-fill-preparation.js', 'engine/src/aaron-post-fill.js',
    'engine/src/aaron-maps.js', 'research/introspection/scan-row-capture.cl', 'research/introspection/scan-row-native-links.cl',
    'research/tools/parse-scan-row-report.mjs', 'research/tools/derive-scan-row-evidence.mjs', 'research/tools/validate-aaron-native-evidence.mjs'];
  const result = { schemaVersion: 1, kind: 'Original SCAN-ROW / NEIGHBORS and scan-derived SUBFORM comparison',
    sources: sources.map(path => ({ path, sha256: sha256(read(path)) })), native, nativeRun: { ...nativeRun.summary, summarySha256: nativeRun.summarySha256, aa0ByteIdentical: true, sceneReportByteIdentical: true }, scenes,
    excludedDiagnostic: { run: { ...rejected.summary, summarySha256: rejected.summarySha256 }, sourceSha256: sha256(rejectedSource), rawReportSha256: sha256(rejectedRaw),
      completeCounters: rejectedComplete, aa0ByteIdentical: false, sceneReportByteIdentical: false,
      reason: 'Owning investigation source review found the flush WHEN after UNWIND-PROTECT replaced original SCAN-ROW multiple values with NIL; v2 moves the flush into MULTIPLE-VALUE-PROG1. The mismatch/counters are observed; the cause is source review, not inferred solely from a changed hash.' },
    limitations: ['Integer in-picture neighbor centers only; arbitrary non-number, fractional or out-of-picture NEIGHBORS inputs and original errors are not characterized.',
      'SCAN-ROW Y=-1 and the exclusive endpoint are measured. More-negative Y follows native sign-guard interpretation; upper Y and invalid X are adapter restrictions rather than original error parity.',
      'FLASH-SPOT is naturally observed once per nonnegative-Y scan with one NIL return. Full maps and copied random previews are preserved; other graphics effects are not reconstructed.',
      'Matrix uses isolated typed synthetic maps with original bindings, full original maps and copied random preview restored; natural data retain complete three-row inputs and both complete map equality checks.',
      'The composed scan-to-fill comparison links two independent captures with identical full drawing/control outputs and measured point identities; it is not one integrated BRUSH-FILL invocation or a direct native caller proof.',
      'Prior boundary captures requested SmallImage; scanner/control captures did not. Both have the same measured 320x480 maps and identical drawing/scene bytes. The cross-capture composition is limited to these observed inputs and outputs, not general equivalence of that environment setting.',
      'Earlier patch-map history, caller row bounds, patch selection and natural form counts remain original inputs.'] };
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(scenes.map(s => ({ seed: s.seed, coverage: s.coverage, matrix: s.matrix })), null, 2));
}
