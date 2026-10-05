#!/usr/bin/env node
// Compare the independently written map rule with complete original regions.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePostFillMapReport } from './parse-post-fill-map-report.mjs';
import { createAaronMaps, aaronMapIndex } from '../../engine/src/aaron-maps.js';
import { postFillAaronSubform } from '../../engine/src/aaron-post-fill.js';
import { sha256 } from './index-allegro-image.mjs';

const [observed1234, control1234, observed5678, control5678, helperArg, outputArg, ...extra] = process.argv.slice(2);
if (!outputArg || extra.length) throw new Error('Usage: node derive-post-fill-map-evidence.mjs <map-observed-1234> <control-1234> <map-observed-5678> <control-5678> <helper-evidence.json> <fresh-evidence.json>');
const output = resolve(outputArg);
if (existsSync(output)) throw new Error('Evidence output must be fresh');
const read = (path) => readFileSync(path);
const json = (path) => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/, ''));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function run(rootArg, mode, observed) {
  const root = resolve(rootArg), summaryFile = resolve(root, 'summary.json'), summary = json(summaryFile);
  const aa0 = read(resolve(root, 'capture/aa0')), scene = read(resolve(root, 'capture/aaron-scene-state-snapshot.txt'));
  assert(summary.complete && summary.mode === mode && sha256(aa0) === summary.aa0Sha256
    && sha256(scene) === summary.sceneReportSha256, 'Run completion/mode or output binding differs');
  if (observed) assert(summary.probeOutputNames.includes('aaron-post-fill-maps.txt')
    && sha256(read(resolve(root, 'capture/aaron-pre-scene-probe.cl'))) === summary.preSceneProbeSha256,
  'Staged map source or output declaration differs');
  else assert(summary.preSceneProbeSha256 === null && summary.probeOutputNames.length === 0, 'Expected an uninstrumented control');
  return { root, aa0, scene, record: { ...summary, summarySha256: sha256(read(summaryFile)) } };
}
function parity(observed, control) {
  assert(observed.aa0.equals(control.aa0) && observed.scene.equals(control.scene), 'Map observer differs from fresh control bytes');
  for (const k of ['mode', 'smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(observed.record[k] === control.record[k], `Control setup differs: ${k}`);
  }
  return { aa0ByteIdentical: true, sceneReportByteIdentical: true,
    observedRun: observed.record.runId, controlRun: control.record.runId };
}
function expand(map, destination) {
  const { x0 } = map.region;
  for (const row of map.rows) {
    let x = x0;
    for (const [value, count] of row.runs) {
      for (let n = 0; n < count; n += 1) destination[aaronMapIndex(map.width, map.height, x++, row.y)] = value;
    }
  }
}
function regionBytes(map, data) {
  const bytes = Buffer.alloc(map.cells * (map.bits / 8 === 2 ? 2 : 1));
  let cursor = 0;
  for (let y = map.region.y0; y <= map.region.y1; y += 1) {
    for (let x = map.region.x0; x <= map.region.x1; x += 1) {
      const value = data[aaronMapIndex(map.width, map.height, x, y)];
      if (map.bits === 16) { bytes.writeUInt16LE(value, cursor); cursor += 2; }
      else bytes[cursor++] = value;
    }
  }
  return bytes;
}
function compare(map, predicted, label) {
  const expected = new (map.bits === 16 ? Uint16Array : Uint8Array)(map.width * map.height);
  expand(map, expected);
  const wanted = regionBytes(map, expected), actual = regionBytes(map, predicted);
  assert(wanted.equals(actual), `Predicted ${label} region differs from the original`);
  return sha256(wanted);
}
const helper = json(resolve(helperArg));
assert(helper.status === 'measured' && helper.scenes.length === 2 && helper.native.methodCount === 2, 'Expected the retained helper/method evidence');
const modes = ['writer-stream-seed-1234', 'writer-full-seed-5678'];
const observed = [run(observed1234, modes[0], true), run(observed5678, modes[1], true)];
const controls = [run(control1234, modes[0], false), run(control5678, modes[1], false)];
assert(observed[0].record.preSceneProbeSha256 === observed[1].record.preSceneProbeSha256
  && observed[0].record.preSceneProbeSha256 === sha256(read(resolve('research/introspection/post-fill-map-capture.cl'))),
'Both map runs must use the current inspected source');
const scenes = observed.map((captured, sceneIndex) => {
  const raw = read(resolve(captured.root, 'capture/aaron-post-fill-maps.txt'));
  const report = parsePostFillMapReport(raw.toString('utf8'));
  const previous = helper.scenes[sceneIndex], seed = sceneIndex === 0 ? 1234 : 5678;
  const previousRows = previous.rows.filter((r) => r.mode === 'SUBFORM');
  assert(previous.seed === seed && report.calls.length === previousRows.length
    && report.totals.cform === previous.cforms.calls, 'Map/helper scene coverage differs');
  const fillValues = new Set(), patchIds = new Set(), flags = new Set();
  let cellsCompared = 0, acceptedCells = 0, rejectedCells = 0, convertedCells = 0, absentPatchReaders = 0;
  const rows = report.calls.map((c, i) => {
    const p = previousRows[i], before = c.before, after = c.after;
    assert(c.cdex === p.cdex && c.sdex === p.sdex && c.returnValue === p.returnValue
      && before.subpartCount.bound === (p.before.status === 'BOUND')
      && (!before.subpartCount.bound || before.subpartCount.value === p.before.value.value)
      && after.subpartCount.bound && after.subpartCount.value === p.after.value.value,
    'Map capture differs from the prior complete helper sequence');
    const maps = createAaronMaps(before.fillMap.width, before.fillMap.height);
    expand(before.fillMap, maps.fillMap); expand(before.patchMap, maps.patchMap);
    const inputHashes = { fill: sha256(regionBytes(before.fillMap, maps.fillMap)), patch: sha256(regionBytes(before.patchMap, maps.patchMap)) };
    const r = after.readers, patchId = r.patchId ?? 0;
    if (r.patchId !== null) patchIds.add(r.patchId); else absentPatchReaders += 1;
    assert(before.flagBit.bound, 'Expected a measured FLAG-BIT');
    const flagBit = before.flagBit.value; flags.add(flagBit);
    let accepted = 0, rejected = 0, converted = 0, positive = 0;
    for (let y = before.frame.ly; y <= before.frame.ty; y += 1) {
      for (let x = before.frame.lx; x <= before.frame.rx; x += 1) {
        const index = aaronMapIndex(maps.width, maps.height, x, y), value = maps.fillMap[index];
        fillValues.add(value);
        if (value > 0) {
          positive += 1;
          if (maps.patchMap[index] === patchId) { accepted += 1; if (value === 2) converted += 1; }
          else rejected += 1;
        }
      }
    }
    assert(r.patchId !== null || positive === 0, 'Positive scan cells lack a naturally read target patch ID');
    const result = postFillAaronSubform({ maps, frame: before.frame, patchId, flagBit, cformCount: r.cformCountBefore });
    assert(result.subpartCount === after.subpartCount.value && result.subpartCount === accepted
      && result.cformCount === c.returnValue, 'Predicted count or remaining form count differs');
    const afterHashes = { fill: compare(after.fillMap, maps.fillMap, 'fill'), patch: compare(after.patchMap, maps.patchMap, 'patch') };
    cellsCompared += after.fillMap.cells + after.patchMap.cells;
    acceptedCells += accepted; rejectedCells += rejected; convertedCells += converted;
    return { ordinal: i + 1, call: c.id, cdex: c.cdex, sdex: c.sdex,
      dimensions: [maps.width, maps.height], frame: before.frame,
      observedRegion: before.fillMap.region, cellsCompared: after.fillMap.cells + after.patchMap.cells,
      patchId: r.patchId, patchIdUnused: r.patchId === null, flagBit,
      cformCountBefore: r.cformCountBefore, subpartCount: result.subpartCount,
      cformCountAfter: result.cformCount, positiveCells: positive, rejectedCells: rejected,
      convertedFillCells: converted, inputRegionSha256: inputHashes, afterRegionSha256: afterHashes,
      exactMapRegions: true, exactCountAndReturn: true, identityPreserved: after.identityPreserved,
      naturalReaderCalls: r.calls };
  });
  return { seed, observedRun: captured.record, controlRun: controls[sceneIndex].record,
    comparison: parity(captured, controls[sceneIndex]), reportSha256: sha256(raw), totals: report.totals,
    callsCompared: rows.length, mapCellsCompared: cellsCompared, acceptedCells, rejectedCells, convertedCells,
    absentPatchReaders, observedFillValues: [...fillValues].sort((a, b) => a - b),
    observedPatchIds: [...patchIds].sort((a, b) => a - b), flagBits: [...flags].sort((a, b) => a - b), rows };
});
const evidence = { schemaVersion: 1, status: 'measured',
  scope: 'SUBFORM POST-FILL count, return value and exact map cells inside complete captured rectangles in two controlled paintings',
  helperEvidenceSha256: sha256(read(resolve(helperArg))),
  derivationSha256: sha256(read(resolve('research/tools/derive-post-fill-map-evidence.mjs'))),
  parserSha256: sha256(read(resolve('research/tools/parse-post-fill-map-report.mjs'))),
  implementationSha256: sha256(read(resolve('engine/src/aaron-post-fill.js'))), scenes,
  limitations: ['Original scene planning, frame construction, pre-fill map contents and form identifiers remain inputs supplied by the oracle.',
    'Map cells outside the declared rectangles are not captured or claimed as compared.',
    'Only observed fill values, integer frames, IDs and flag values have direct original comparisons; other states require more probes.',
    'The value-2-to-1 conversion is a native instruction inference; neither captured scene contains fill value 2.',
    'cformCountAfter records the matching method return, not a separate post-call form-object reader result.',
    'CFORM POST-FILL, iris branching, subpart brush changes and the integrated JavaScript BRUSH-FILL caller are separate unrecovered behaviors.',
    'Optional map-report hashes are offline derivation digests; runner summaries do not independently bind these optional report bytes.'] };
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output, sha256: sha256(read(output)), scenes: scenes.map(({ seed, callsCompared, mapCellsCompared,
  acceptedCells, rejectedCells, convertedCells, observedFillValues, flagBits }) => ({ seed, callsCompared, mapCellsCompared,
  acceptedCells, rejectedCells, convertedCells, observedFillValues, flagBits })) }, null, 2));
