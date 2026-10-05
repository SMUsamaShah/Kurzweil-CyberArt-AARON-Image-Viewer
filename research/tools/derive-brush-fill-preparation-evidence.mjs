#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { parseBrushFillPreparation } from './parse-brush-fill-preparation.mjs';
import { parseScanRowReport } from './parse-scan-row-report.mjs';
import { compareScanScene } from './derive-scan-row-evidence.mjs';
import { mapCapturedFunctions } from './map-native-code-to-pll.mjs';
import { selectAaronBrushFillForm, prepareAaronBrushFillScan } from '../../engine/src/aaron-brush-fill-preparation.js';
import { sha256 } from './index-allegro-image.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const read = p => readFileSync(resolve(p));
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const digest = v => sha256(Buffer.from(JSON.stringify(v)));
const add = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const xyz = p => p === null ? null : ({ x: p.x, y: p.y, z: p.z });
function run(root, mode, probe = null) {
  const summary = json(`${root}/summary.json`), aa0 = read(`${root}/capture/aa0`), scene = read(`${root}/capture/aaron-scene-state-snapshot.txt`);
  assert(summary.complete === true && summary.mode === mode && sha256(aa0) === summary.aa0Sha256
    && sha256(scene) === summary.sceneReportSha256, 'Run completion/output binding differs');
  if (probe) {
    const request = json(`${root}/pre-scene-probe-request.json`), source = read(`${root}/capture/aaron-pre-scene-probe.cl`);
    assert(summary.probeOutputNames.includes(probe) && summary.preSceneProbeSha256 === sha256(source)
      && request.runId === summary.runId && request.probeSha256 === sha256(source)
      && same(request.probeOutputNames, summary.probeOutputNames) && request.pauseSeconds === summary.preSceneProbePauseSeconds, 'Observer request/source binding differs');
  } else assert(summary.preSceneProbeSha256 === null && summary.probeOutputNames.length === 0, 'Expected uninstrumented control');
  return { summary, aa0, scene, summarySha256: sha256(read(`${root}/summary.json`)) };
}
function parity(a, b, mode = true) {
  assert(a.aa0.equals(b.aa0) && a.scene.equals(b.scene), 'Drawing/scene bytes differ');
  for (const key of ['smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256', ...(mode ? ['mode'] : [])])
    assert(a.summary[key] === b.summary[key], `Setup differs: ${key}`);
}
function nativeBrushFill(root, control) {
  const current = run(root, 'writer-stream-seed-1234', 'aaron-brush-fill-native-links.txt'); parity(current, control);
  const manifest = json(`${root}/native-code/manifest.json`), mapped = json(`${root}/native-code/mapped/native-code-map.json`);
  const metadata = read(`${root}/capture/aaron-brush-fill-native-links.txt`);
  assert(manifest.metadataSha256 === sha256(metadata) && mapped.metadataSha256 === sha256(metadata)
    && mapped.captureManifestSha256 === sha256(read(`${root}/native-code/manifest.json`))
    && current.summary.preSceneProbeSha256 === sha256(read('research/introspection/brush-fill-native-links.cl')), 'Native metadata/probe binding differs');
  const subset = manifest.functions.filter(f => f.name === 'BRUSH-FILL'); assert(subset.length === 1, 'Native target missing');
  const rederived = mapCapturedFunctions({ ...manifest, functions: subset }, file => {
    assert(basename(file) === file && /^[a-z0-9-]+\.native-window\.bin$/.test(file), 'Invalid window filename');
    return read(`${root}/native-code/${file}`);
  }, read(`${root}/runtime/AARON.pll`));
  const fn = mapped.functions.find(f => f.name === 'BRUSH-FILL'), payload = read(`${root}/native-code/mapped/${fn.payloadFile}`);
  const report = json(`${root}/native-code/mapped/ghidra/brush-fill.ghidra.json`);
  assert(same(fn, rederived.report.functions[0]) && same(mapped.pll, rederived.report.pll)
    && payload.equals(rederived.payloads.get('BRUSH-FILL')) && report.subject.sha256 === sha256(payload)
    && report.subject.bytes === payload.length && report.entry === fn.runtime.entry && report.memoryBase === fn.runtime.entry
    && report.languageId === 'x86:LE:32:default' && report.compilerSpecId === 'windows'
    && report.decompilation.completed === true && report.disassembledInstructions === report.assembly.length, 'Native object/report binding differs');
  const covered = new Set();
  for (const ins of report.assembly) {
    assert(Number.isSafeInteger(ins.offset) && ins.offset >= 0 && /^[0-9a-f]{2,30}$/i.test(ins.bytes)
      && ins.bytes.length % 2 === 0 && Number.parseInt(ins.address, 16) === Number.parseInt(fn.runtime.entry, 16) + ins.offset, 'Invalid instruction');
    const bytes = Buffer.from(ins.bytes, 'hex'); assert(ins.offset + bytes.length <= payload.length && payload.subarray(ins.offset, ins.offset + bytes.length).equals(bytes), 'Instruction bytes differ');
    for (let i = ins.offset; i < ins.offset + bytes.length; i++) { assert(!covered.has(i), 'Instruction overlap'); covered.add(i); }
  }
  return { run: { ...current.summary, summarySha256: current.summarySha256 }, ...fn,
    reportSha256: sha256(read(`${root}/native-code/mapped/ghidra/brush-fill.ghidra.json`)), instructionCount: report.assembly.length,
    instructionBytesCompared: covered.size, liveWindowPllMatchRederived: true,
    scope: 'Revalidated 2026-10-04 complete BRUSH-FILL object and standalone Ghidra bytes; not a new live capture or a native REA provider session.' };
}
export function compareBrushFillPreparation(root, controlRoot, scannerRoot, boundaryRoot, sceneIndex) {
  const mode = sceneIndex ? 'writer-full-seed-5678' : 'writer-stream-seed-1234';
  const observed = run(root, mode, 'aaron-brush-fill-preparation.txt'), control = run(controlRoot, mode), scannerRun = run(scannerRoot, mode, 'aaron-scan-row.txt');
  parity(observed, control); parity(observed, scannerRun);
  assert(observed.summary.preSceneProbeSha256 === sha256(read('research/introspection/brush-fill-preparation-capture.cl')), 'Frozen preparation source differs');
  const raw = read(`${root}/capture/aaron-brush-fill-preparation.txt`), report = parseBrushFillPreparation(raw.toString('utf8'));
  const scannerRaw = read(`${scannerRoot}/capture/aaron-scan-row.txt`), scanner = parseScanRowReport(scannerRaw.toString('utf8'));
  assert(report.parents.length === scanner.parents.length && report.parents.every((p, i) => same(p.args, scanner.parents[i].args)), 'Scanner parent inputs differ');
  const coverage = { parents: report.parents.length, calls: report.calls.length, objects: report.objects.length, snapshotPreviewChecks: report.complete.checks,
    outsideBusyPatchReaderChecks: report.complete.checks - 2 * report.calls.length, scriptMplanIdentities: 0, scriptSelections: 0, formSelections: 0,
    initialRowsDerived: 0, scansCompared: 0, scanFrameBoundsMatches: 0, scanPatchObjectIdentities: 0, scanPatchValueMatches: 0,
    scanResultValuesCompared: 0, patchStartIdentities: 0, maximumsDerived: 0, ordinaryRowSteps: 0, exceptionalRowSteps: 0, callsByName: {} };
  const frames = [], patches = [], parents = [], rowJumps = [];
  let scanIndex = 0, patchIndex = 0;
  for (const parent of report.parents) {
    let script = null, cfList = null, latestFrame = null, latestScan = null, firstScan = true, previousScan = null;
    const projection = new Map(), parentCalls = parent.callIds.map(id => report.calls[id - 1]);
    const events = parentCalls.flatMap(c => [{ order: c.entryEvent, phase: 'entry', c }, { order: c.returnEvent, phase: 'return', c }]).sort((a,b) => a.order - b.order);
    for (const { phase, c } of events) {
      if (phase === 'return') {
        if (c.name === 'SCRIPT') script = c.after;
        if (c.name === 'CFLIST') { cfList = c.after; projection.set(c.before.object, c.after); }
        if (c.name === 'CFRAME') {
          assert(c.before.object === c.after.form, 'Frame reader argument changed'); latestFrame = c.after;
          frames.push({ call: c.id, parent: parent.id, cdex: parent.args[0], sdex: parent.args[1], mplan: parent.mplan,
            scriptObject: script.object, scriptMembers: script.members, cfListObject: cfList.object, cfListMembers: cfList.members, ...c.after });
        }
        if (c.name === 'SCAN-ROW') latestScan = c.after.point;
        continue;
      }
      add(coverage.callsByName, c.name);
      if (c.name === 'SCRIPT') { assert(c.before.mplanEqualsArgument && c.before.object === parent.mplan, 'SCRIPT argument is not MPLAN'); coverage.scriptMplanIdentities++; }
      else if (c.name === 'CFLIST') {
        assert(script && c.before.object === script.members[parent.args[1]], 'CFLIST did not select SCRIPT[SDEX]'); coverage.scriptSelections++;
      } else if (c.name === 'CFRAME') {
        assert(script && cfList && c.before.object === cfList.members[parent.args[0]], 'CFRAME did not select CFLIST[CDEX]');
        const objects = new Map(report.objects.map(o => [o.id, o]));
        const array = script.members.map(id => ({ cfList: (projection.get(id)?.members ?? []).map(id => objects.get(id)) }));
        assert(selectAaronBrushFillForm(array, ...parent.args) === objects.get(c.before.object), 'Independent form projection differs'); coverage.formSelections++;
      } else if (c.name === 'SCAN-ROW') {
        const b = c.before, original = scanner.scans[scanIndex++];
        assert(latestFrame && latestFrame.form === b.form && same(latestFrame.frame, b.frame), 'Scan frame differs from naturally returned CFRAME');
        const prepared = prepareAaronBrushFillScan(b.frame, b.patchRead.value);
        assert(same([prepared.lx, prepared.rx], b.args.slice(0, 2)), 'Derived row bounds differ'); coverage.scanFrameBoundsMatches++;
        assert(b.patchRead.object === b.form && b.args[3] === prepared.patchId, 'Natural PATCHDEX argument/value differs'); coverage.scanPatchObjectIdentities++; coverage.scanPatchValueMatches++;
        if (firstScan) { assert(b.args[2] === prepared.y, 'Initial row is not frame TY'); coverage.initialRowsDerived++; firstScan = false; }
        else { const dy = b.args[2] - previousScan.before.args[2]; if (dy === -1) coverage.ordinaryRowSteps++;
          else { coverage.exceptionalRowSteps++; rowJumps.push({ parent: parent.id, previousCall: previousScan.id, call: c.id, fromY: previousScan.before.args[2], toY: b.args[2], dy, previousPoint: previousScan.after.point, frame: b.frame }); } }
        assert(original && original.parent === parent.id && same(b.args, [original.lx, original.rx, original.y, original.patchId])
          && same(xyz(c.after.point), xyz(original.point)), 'Independent scanner capture differs');
        coverage.scansCompared++; coverage.scanResultValuesCompared++; previousScan = c;
      } else {
        const b = c.before, original = scanner.patches[patchIndex++], prepared = prepareAaronBrushFillScan(b.frame, b.patchId);
        assert(latestScan && b.scanResultIdentity && b.start.id === latestScan.id && same(xyz(b.start), xyz(latestScan)), 'PATCH-EDGE start is not the latest original scan result'); coverage.patchStartIdentities++;
        assert(b.maximum === prepared.maximum && latestFrame.form === b.form && same(latestFrame.frame, b.frame), 'Derived MAX or frame differs'); coverage.maximumsDerived++;
        assert(original && original.parent === parent.id && b.maximum === original.maximum && b.patchId === original.patchId && same(xyz(b.start), xyz(original.start)), 'Independent PATCH boundary differs');
        patches.push({ call: c.id, parent: parent.id, form: b.form, frame: b.frame, start: b.start, maximum: b.maximum, patchId: b.patchId, originalScannerPatchId: original.id, scanResultIdentity: true });
      }
    }
    assert(!firstScan, 'Parent has no initial scan'); parents.push({ id: parent.id, args: parent.args, mplan: parent.mplan, calls: parent.callIds.length,
      scans: parentCalls.filter(c => c.name === 'SCAN-ROW').length, patches: parentCalls.filter(c => c.name === 'PATCH-EDGE').length });
  }
  assert(scanIndex === scanner.scans.length && patchIndex === scanner.patches.length, 'Scanner alignment incomplete');
  // Rerun the complete earlier composition. Every row/MAX/patch input it uses
  // has independently equalled the derived preparation values above.
  const composition = compareScanScene(scannerRoot, controlRoot, boundaryRoot, sceneIndex);
  assert(composition.coverage.composedFillsCompared === coverage.maximumsDerived, 'Composition alignment incomplete');
  return { seed: sceneIndex ? 5678 : 1234, observed: { ...observed.summary, summarySha256: observed.summarySha256, rawReportSha256: sha256(raw) },
    control: { ...control.summary, summarySha256: control.summarySha256 }, aa0ByteIdentical: true, sceneReportByteIdentical: true, coverage,
    objects: report.objects, parents, frames, patches, rowJumps, naturalTapeSha256: digest(report.calls),
    alignedScanner: { ...scannerRun.summary, summarySha256: scannerRun.summarySha256, rawReportSha256: sha256(scannerRaw) },
    composition: { coverage: composition.coverage, previousBoundaryRun: composition.previousBoundaryRun, scannerSmallImageRequest: composition.scannerSmallImageRequest,
      previousBoundarySmallImageRequest: composition.previousBoundarySmallImageRequest, allPreparationInputsIndependentlyDerived: true } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [a, ca, sa, ba, b, cb, sb, bb, nativeRoot, output, ...extra] = process.argv.slice(2);
  assert([a,ca,sa,ba,b,cb,sb,bb,nativeRoot,output].every(Boolean) && !extra.length, 'Usage: derive-brush-fill-preparation-evidence.mjs <observed1234> <control1234> <scanner1234> <boundary1234> <observed5678> <control5678> <scanner5678> <boundary5678> <nativeRoot> <fresh output>');
  const scenes = [compareBrushFillPreparation(a,ca,sa,ba,0), compareBrushFillPreparation(b,cb,sb,bb,1)];
  const sources = ['engine/src/aaron-brush-fill-preparation.js', 'engine/src/aaron-scan-row.js', 'engine/src/aaron-subform-boundary.js',
    'engine/src/aaron-fill-preparation.js', 'engine/src/aaron-post-fill.js', 'engine/src/aaron-maps.js',
    'research/introspection/brush-fill-preparation-capture.cl', 'research/introspection/brush-fill-native-links.cl',
    'research/introspection/scan-row-capture.cl', 'research/introspection/subform-boundary-capture.cl',
    'research/tools/parse-brush-fill-preparation.mjs', 'research/tools/derive-brush-fill-preparation-evidence.mjs',
    'research/tools/derive-scan-row-evidence.mjs', 'research/tools/parse-scan-row-report.mjs', 'research/tools/parse-subform-boundary-report.mjs',
    'research/tools/parse-natural-free-path-report.mjs', 'research/tools/index-allegro-image.mjs',
    'research/tools/validate-aaron-native-evidence.mjs', 'research/tools/map-native-code-to-pll.mjs'];
  const evidence = { schemaVersion: 1, kind: 'Natural BRUSH-FILL plan/list/form/frame selection and row/MAX input preparation',
    sources: sources.map(path => ({ path, sha256: sha256(read(path)) })), native: nativeBrushFill(nativeRoot, run(ca, 'writer-stream-seed-1234')), scenes,
    limitations: ['This projection uses original SCRIPT/CFLIST returned lists and selected form frames/patch labels. It does not reconstruct plan creation or getter effects.',
      'Initial Y=TY is measured for all parents; four later row jumps and other painting branches are retained but are not implemented by this preparation adapter.',
      'All 278 MAX values match five times the sum of frame differences, not an inclusive-cell perimeter or CFORM-COUNT. Original invalid-index/frame errors remain uncharacterized.',
      'Composed full-map parity links separate controlled captures with byte-identical final drawings and scenes. It is not one integrated BRUSH-FILL invocation.',
      'Earlier boundary roots requested SmallImage while current captures did not; measured dimensions/output equality and the limited cross-capture comparison are retained.',
      'Earlier map history, natural form counts, FLASH-SPOT effects, subpart painting/clearing, CFORM POST-FILL and the integrated row schedule remain dependencies.'] };
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(scenes.map(s => ({ seed: s.seed, coverage: s.coverage, composition: s.composition.coverage })), null, 2));
}
