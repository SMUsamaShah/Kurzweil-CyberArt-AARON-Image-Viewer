#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
import { parseCformPostFillReport } from './parse-cform-post-fill-report.mjs';
import { parseBoundaryMapReport } from './parse-boundary-map-report.mjs';
import { parseFillPreparationReport } from './parse-fill-preparation-report.mjs';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { mapCapturedFunctions } from './map-native-code-to-pll.mjs';
import { sha256 } from './index-allegro-image.mjs';
import { postFillAaronCform, fillAaronCformFromOutline } from '../../engine/src/aaron-cform-post-fill.js';
import { writeAaronListToFillMap } from '../../engine/src/aaron-boundary-map.js';
import { applyAaronFillStrategy } from '../../engine/src/aaron-fill-preparation.js';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const read = p => readFileSync(resolve(p));
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const add = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
function run(root, mode, probe = null, currentSource = null) {
  const summary = json(`${root}/summary.json`), aa0 = read(`${root}/capture/aa0`), scene = read(`${root}/capture/aaron-scene-state-snapshot.txt`);
  assert(summary.complete === true && summary.mode === mode && summary.aa0Sha256 === sha256(aa0) && summary.sceneReportSha256 === sha256(scene), 'Run completion/output binding differs');
  if (probe) {
    const source = read(`${root}/capture/aaron-pre-scene-probe.cl`), request = json(`${root}/pre-scene-probe-request.json`);
    assert(summary.probeOutputNames.includes(probe) && summary.preSceneProbeSha256 === sha256(source) && request.runId === summary.runId
      && request.probeSha256 === sha256(source) && same(request.probeOutputNames, summary.probeOutputNames), 'Staged observer binding differs');
    if (currentSource) assert(source.equals(read(currentSource)), 'Current observer differs from frozen capture');
  } else assert(summary.preSceneProbeSha256 === null && summary.probeOutputNames.length === 0, 'Expected uninstrumented control');
  return { summary, summarySha256: sha256(read(`${root}/summary.json`)), aa0, scene };
}
function parity(a,b) {
  assert(a.aa0.equals(b.aa0) && a.scene.equals(b.scene), 'Drawing/scene bytes differ');
  for (const key of ['mode','smallImage','installerSha256','registryPatchSha256','licensePatchSha256']) assert(a.summary[key] === b.summary[key], `Setup differs: ${key}`);
}
function expand(m, bits = m.bits ?? 4) {
  const a = bits === 4 ? new Uint8Array(m.width * m.height) : new Uint16Array(m.width * m.height);
  for (const row of m.rows) { let x = 0; for (const [value,count] of row.runs) for (let n = 0; n < count; n++) a[x++ * m.height + row.y] = value;
    assert(x === m.width, 'Map row coverage differs'); } return a;
}
function arraysEqual(a,b, label) { assert(a.length === b.length && a.every((v,i) => v === b[i]), label); }
function nativeMethod(root, control) {
  const captured = run(root, 'writer-stream-seed-1234', 'aaron-brush-fill-helper-links.txt', 'research/introspection/brush-fill-helper-links.cl'); parity(captured, control);
  const metadata = read(`${root}/capture/aaron-brush-fill-helper-links.txt`), lines = metadata.toString('utf8').trim().split(/\r?\n/);
  assert(lines[0] === 'BEGIN brush-fill-helper-links' && lines.at(-1) === 'END brush-fill-helper-links' && lines.includes('ERROR-COUNT 0')
    && lines.includes('TRUNCATION-COUNT 0') && !lines.some(l => /^(ERROR |TRUNCATION )/.test(l)), 'Native metadata incomplete');
  assert(lines.includes('SPECIALIZERS name="POST-FILL-METHOD-1" values=((:EQL (:SYMBOL "COMMON-GRAPHICS-USER" "CFORM")) (:CLASS (:SYMBOL "COMMON-LISP" "T")) (:CLASS (:SYMBOL "COMMON-LISP" "T")))'), 'CFORM method identity differs');
  const manifest = json(`${root}/native-code/manifest.json`), mapped = json(`${root}/native-code/mapped/native-code-map.json`), subset = manifest.functions.filter(f => f.name === 'POST-FILL-METHOD-1');
  assert(subset.length === 1 && manifest.metadataSha256 === sha256(metadata) && mapped.captureManifestSha256 === sha256(read(`${root}/native-code/manifest.json`)), 'Native manifest binding differs');
  const rederived = mapCapturedFunctions({ ...manifest, functions: subset }, file => {
    assert(basename(file) === file && /^[a-z0-9-]+\.native-window\.bin$/.test(file), 'Invalid window filename'); return read(`${root}/native-code/${file}`);
  }, read(`${root}/runtime/AARON.pll`));
  const fn = mapped.functions.find(f => f.name === 'POST-FILL-METHOD-1'), payload = read(`${root}/native-code/mapped/${fn.payloadFile}`);
  const prefix = `${root}/native-code/mapped/ghidra/post-fill-method-1`, report = json(`${prefix}.ghidra.json`);
  assert(same(fn, rederived.report.functions[0]) && same(mapped.pll, rederived.report.pll) && payload.equals(rederived.payloads.get(fn.name))
    && report.subject.sha256 === sha256(payload) && report.subject.bytes === payload.length && report.functionName === fn.name
    && report.entry === fn.runtime.entry && report.memoryBase === fn.runtime.entry && report.languageId === 'x86:LE:32:default'
    && report.compilerSpecId === 'windows' && report.decompilation.completed === true && report.disassembledInstructions === report.assembly.length, 'Native object/report binding differs');
  const covered = new Set();
  for (const ins of report.assembly) {
    assert(Number.isSafeInteger(ins.offset) && ins.offset >= 0 && /^[0-9a-f]{2,30}$/i.test(ins.bytes) && ins.bytes.length % 2 === 0
      && Number.parseInt(ins.address,16) === Number.parseInt(fn.runtime.entry,16) + ins.offset, 'Invalid instruction');
    const bytes = Buffer.from(ins.bytes,'hex'); assert(ins.offset + bytes.length <= payload.length && payload.subarray(ins.offset,ins.offset+bytes.length).equals(bytes), 'Instruction bytes differ');
    for (let i = ins.offset; i < ins.offset + bytes.length; i++) { assert(!covered.has(i), 'Instruction overlap'); covered.add(i); }
  }
  const bundle = json(`${prefix}.rea-bundle.json`), exported = json(`${prefix}.rea-export.json`), imported = json(`${prefix}.rea-import.json`), record = bundle.records?.[0];
  assert(bundle.records?.length === 1 && exported.records?.length === 1 && imported.imported === 1 && imported.unknowns_added === 0
    && same(record,exported.records[0]) && record.provider.id === 'ghidra-standalone' && record.subject.digest.sha256 === sha256(payload)
    && record.parameters.rea_native_provider_session === false && record.normalized_result.provenance.rea_native_provider_session === false
    && record.normalized_result.provenance.source_report_sha256 === sha256(read(`${prefix}.ghidra.json`)) && same(record.raw_result,report), 'REA canonical record binding differs');
  return { run: { ...captured.summary, summarySha256: captured.summarySha256 }, ...fn, reportSha256: sha256(read(`${prefix}.ghidra.json`)),
    instructionCount: report.assembly.length, instructionBytesCompared: covered.size, liveWindowPllMatchRederived: true,
    rea: { version: '3.2.1', provider: record.provider, evidenceId: record.evidence_id, nativeProviderSession: false,
      bundleSha256: sha256(read(`${prefix}.rea-bundle.json`)), canonicalExportSha256: sha256(read(`${prefix}.rea-export.json`)), importResult: imported },
    scope: 'Existing exact method capture/report revalidated; canonical external Ghidra evidence through REA, not a new live capture or native provider session.' };
}
export function compareCformScene(root, controlRoot, boundaryRoot, prepRoot, index) {
  const mode = index ? 'writer-full-seed-5678' : 'writer-stream-seed-1234', observed = run(root,mode,'aaron-cform-post-fill.txt','research/introspection/cform-post-fill-capture.cl'), control = run(controlRoot,mode);
  parity(observed,control);
  const raw = read(`${root}/capture/aaron-cform-post-fill.txt`), report = parseCformPostFillReport(raw.toString('utf8'));
  const boundary = run(boundaryRoot,mode,'aaron-boundary-map.txt','research/introspection/boundary-map-capture.cl'), prepRun = run(prepRoot,mode,'aaron-fill-preparation.txt','research/introspection/fill-preparation-capture.cl');
  parity(observed,boundary); parity(observed,prepRun);
  const boundaryRaw = read(`${boundaryRoot}/capture/aaron-boundary-map.txt`), prepRaw = read(`${prepRoot}/capture/aaron-fill-preparation.txt`);
  const boundaryReport = parseBoundaryMapReport(boundaryRaw.toString('utf8')), prep = parseFillPreparationReport(prepRaw.toString('utf8'));
  const writers = boundaryReport.calls.filter(c => c.name === 'WRITE-LIST-TO-FILL-MAP'), prepCforms = prep.fills.filter(f => f.mode === 'CFORM');
  const oldBoundary = json('research/introspection/evidence/boundary-map-parity-20261005.json'), oldPrep = json('research/introspection/evidence/fill-preparation-parity-20261005.json');
  assert(sha256(boundaryRaw) === oldBoundary.scenes[index].reportSha256 && sha256(prepRaw) === oldPrep.scenes[index].reportSha256
    && boundary.summary.preSceneProbeSha256 === oldBoundary.sourceSha256 && prepRun.summary.preSceneProbeSha256 === oldPrep.sourceSha256
    && report.calls.length === writers.length && writers.length === prepCforms.length, 'Earlier capture bindings/CFORM alignment differ');
  const coverage = { calls: report.calls.length, mapCellsCompared: 0, composedCalls: 0, composedMapCellsCompared: 0, composedInputFillCellsCompared: 0,
    outlinePositions: 0, naturalFrameReads: 0, naturalPatchReads: report.complete.readers, callsWithoutPatchRead: 0, acceptedCells: 0, rejectedPositiveCells: 0,
    targetFillValues: {}, targetFillTransitions: {}, backgroundValues: {}, patchIds: {}, frameTypes: {}, outsideNonzeroFillPreserved: 0,
    excludedEdgePositiveFillPreserved: { rx: 0, ty: 0, corner: 0 }, returnRange: [Infinity,-Infinity], snapshotPreviewChecks: report.complete.checks };
  const rows = [];
  for (let i = 0; i < report.calls.length; i++) {
    const c = report.calls[i], a = c.after, m = a.maps, writer = writers[i], prior = prepCforms[i], parent = boundaryReport.parents[writer.parent-1];
    assert(a.frames.length === 1 && a.background === c.before.background && m.fillIn.width === m.patchIn.width && m.fillIn.height === m.patchIn.height, 'Frame/background/map dimensions differ');
    const {form,frame} = a.frames[0], patchId = a.patchRead.value ?? 0;
    assert(!a.patchRead.calls || a.patchRead.form === form, 'PATCHDEX object differs from CFRAME object');
    const fill = expand(m.fillIn), patch = expand(m.patchIn), fillOut = expand(m.fillOut), patchOut = expand(m.patchOut), maps = { width:m.fillIn.width,height:m.fillIn.height,fillMap:fill.slice(),patchMap:patch.slice() };
    assert([writer.before,writer.after].every(v=>v.width===maps.width&&v.height===maps.height), 'Original writer map dimensions differ');
    const count = postFillAaronCform({maps,frame,patchId,background:c.before.background});
    assert(same(a.values,[count]) && count === a.patchRead.calls, 'CFORM return/reader count differs');
    arraysEqual(maps.fillMap,fillOut,'CFORM full FILL output differs'); arraysEqual(maps.patchMap,patchOut,'CFORM full PATCH output differs'); coverage.mapCellsCompared += fill.length*2;
    coverage.naturalFrameReads++; coverage.acceptedCells += count; if (!a.patchRead.calls) coverage.callsWithoutPatchRead++;
    add(coverage.backgroundValues,c.before.background); if (a.patchRead.calls) add(coverage.patchIds,a.patchRead.value);
    add(coverage.frameTypes,report.objects[frame.id-1].type); coverage.returnRange[0]=Math.min(coverage.returnRange[0],count); coverage.returnRange[1]=Math.max(coverage.returnRange[1],count);
    assert(frame.lx < frame.rx && frame.ly < frame.ty, 'Empty/inverted natural frame: extend scope explicitly');
    for (let x=0;x<maps.width;x++) for (let y=0;y<maps.height;y++) {
      const j=x*maps.height+y, inside=x>=frame.lx&&x<frame.rx&&y>=frame.ly&&y<frame.ty;
      if (inside) { add(coverage.targetFillValues,fill[j]); add(coverage.targetFillTransitions,`${fill[j]}->${fillOut[j]}`); if(fill[j]>0&&patch[j]!==c.before.background)coverage.rejectedPositiveCells++; }
      else { assert(fill[j]===fillOut[j]&&patch[j]===patchOut[j],'Out-of-frame mutation'); if(fill[j]>0)coverage.outsideNonzeroFillPreserved++; }
      if(fill[j]>0&&fill[j]===fillOut[j]) {
        if(x===frame.rx&&y>=frame.ly&&y<frame.ty)coverage.excludedEdgePositiveFillPreserved.rx++;
        if(y===frame.ty&&x>=frame.lx&&x<frame.rx)coverage.excludedEdgePositiveFillPreserved.ty++;
        if(x===frame.rx&&y===frame.ty)coverage.excludedEdgePositiveFillPreserved.corner++;
      }
    }
    assert(parent.name==='MY-FILL'&&parent.args.mode==='CFORM'&&parent.args.cdex===c.cdex&&parent.args.sdex===c.sdex
      && prior.cdex===c.cdex&&prior.sdex===c.sdex, 'Cross-capture CFORM indices differ');
    const byId=new Map(writer.readers.points.map(p=>[p.id,p])), points=writer.args.order.map(id=>byId.get(id)), [median,start,strategy]=prior.calls;
    assert([strategy.before.map,strategy.after.map].every(v=>v.width===maps.width&&v.height===maps.height)
      &&median.before.frame.type===report.objects[frame.id-1].type, 'Preparation map/frame types or dimensions differ');
    assert(points.every(Boolean)&&same(points.map(({id,type,x,y})=>({id,type,x,y})),start.before.outline.points)
      && frame.ly===median.before.frame.ly&&frame.ty===median.before.frame.ty, 'Original outline/frame linkage differs');
    const chain={width:maps.width,height:maps.height,fillMap:expand(writer.before),patchMap:patch.slice()};
    const composed=fillAaronCformFromOutline({maps:chain,frame,points,patchId,background:c.before.background,boundaryValue:writer.args.value});
    assert(composed.count===count&&composed.median.loMedian===median.after.lo.value&&composed.median.hiMedian===median.after.hi.value
      && composed.median.returnValue===median.values[0]&&same(composed.outline.map(({id,type,x,y})=>({id,type,x,y})),start.after.outline.points)
      && composed.strategyReturn===strategy.values[0], 'Composed CFORM scalar/outline differs');
    // Check every POST-FILL input cell, including cells outside the earlier
    // bounded strategy captures, in a second strategy-only composition.
    const inputChain={width:maps.width,height:maps.height,fillMap:expand(writer.before),patchMap:patch.slice()};
    writeAaronListToFillMap({maps:inputChain,points,value:writer.args.value});
    applyAaronFillStrategy({maps:inputChain,outline:composed.outline,loMedian:composed.median.loMedian,hiMedian:composed.median.hiMedian});
    arraysEqual(inputChain.fillMap,fill,'Composed full POST-FILL input differs'); coverage.composedInputFillCellsCompared+=fill.length;
    arraysEqual(chain.fillMap,fillOut,'Composed full FILL output differs'); arraysEqual(chain.patchMap,patchOut,'Composed full PATCH output differs');
    coverage.composedCalls++;coverage.composedMapCellsCompared+=fill.length*2;coverage.outlinePositions+=points.length;
    rows.push({id:c.id,cdex:c.cdex,sdex:c.sdex,form,frame,patchRead:a.patchRead,background:c.before.background,returnValue:count,
      inputFillSha256:sha256(Buffer.from(fill)),inputPatchSha256:sha256(Buffer.from(patch.buffer)),outputFillSha256:sha256(Buffer.from(fillOut)),outputPatchSha256:sha256(Buffer.from(patchOut.buffer)),
      previousWriterCall:writer.id,previousPreparationFill:prior.id,outlinePositions:points.length,rotationIndex:composed.rotationIndex,allOutputCellsEqual:true,composedOutputCellsEqual:true});
  }
  return {seed:index?5678:1234,observed:{...observed.summary,summarySha256:observed.summarySha256,rawReportSha256:sha256(raw)},control:{...control.summary,summarySha256:control.summarySha256},
    aa0ByteIdentical:true,sceneReportByteIdentical:true,complete:report.complete,coverage,rows,
    previousBoundary:{...boundary.summary,summarySha256:boundary.summarySha256,rawReportSha256:sha256(boundaryRaw)},previousPreparation:{...prepRun.summary,summarySha256:prepRun.summarySha256,rawReportSha256:sha256(prepRaw)}};
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [a,ca,ba,pa,b,cb,bb,pb,nativeRoot,rejectedRoot,output,...extra]=process.argv.slice(2);
  assert([a,ca,ba,pa,b,cb,bb,pb,nativeRoot,rejectedRoot,output].every(Boolean)&&!extra.length,'Usage: derive-cform-post-fill-evidence.mjs <observed1234> <control1234> <boundary1234> <preparation1234> <observed5678> <control5678> <boundary5678> <preparation5678> <native> <excluded-v1> <fresh output>');
  const scenes=[compareCformScene(a,ca,ba,pa,0),compareCformScene(b,cb,bb,pb,1)], control=run(ca,'writer-stream-seed-1234');
  const rejected=run(rejectedRoot,'writer-stream-seed-1234','aaron-cform-post-fill.txt');parity(rejected,control);
  const rejectedRaw=read(`${rejectedRoot}/capture/aaron-cform-post-fill.txt`), text=rejectedRaw.toString('utf8'), complete=parseLispRecord(text.split(/\r?\n/).find(l=>l.startsWith('COMPLETE ')),'COMPLETE');
  assert(text.startsWith('BEGIN cform-post-fill v1')&&text.trimEnd().endsWith('END cform-post-fill v1')&&complete.errors.value===67&&complete.cells.value===0
    &&complete.calls.value===67&&complete.aborts.value===0&&rejected.summary.preSceneProbeSha256==='35bdf56db15a2e0495a1e01d0ace06a8de8690e01cf48c64ff36ce457f293046','Excluded diagnostic differs');
  const sources=['engine/src/aaron-cform-post-fill.js','engine/src/aaron-boundary-map.js','engine/src/aaron-fill-preparation.js','engine/src/aaron-maps.js',
    'research/introspection/cform-post-fill-capture.cl','research/introspection/boundary-map-capture.cl','research/introspection/fill-preparation-capture.cl','research/introspection/brush-fill-helper-links.cl',
    'research/tools/parse-cform-post-fill-report.mjs','research/tools/derive-cform-post-fill-evidence.mjs','research/tools/parse-boundary-map-report.mjs',
    'research/tools/parse-fill-preparation-report.mjs','research/tools/parse-natural-free-path-report.mjs','research/tools/map-native-code-to-pll.mjs','research/tools/index-allegro-image.mjs','research/tools/rea-evidence-bundle.mjs',
    'research/introspection/evidence/boundary-map-parity-20261005.json','research/introspection/evidence/fill-preparation-parity-20261005.json'];
  const result={schemaVersion:1,kind:'Complete natural CFORM POST-FILL and composed outline-to-map comparison',sources:sources.map(path=>({path,sha256:sha256(read(path))})),native:nativeMethod(nativeRoot,control),scenes,
    excludedDiagnostic:{run:{...rejected.summary,summarySha256:rejected.summarySha256},rawReportSha256:sha256(rejectedRaw),sourceSha256:sha256(read(`${rejectedRoot}/capture/aaron-pre-scene-probe.cl`)),completeCounters:complete,
      aa0ByteIdentical:true,sceneReportByteIdentical:true,reason:'Source review: helper-local SETF GETF of absent cache keys prepended fields only to its local context binding; outer AFTER saw missing maps. V2 initializes every cache key in the shared context. V1 map records are incomplete despite unchanged drawing/scene bytes.'},
    limitations:['Observed BACKGND and target fill/patch domains are retained; other values, malformed frames, invalid coordinates and original error behavior are not characterized.',
      'Zero PATCHDEX-call cases do not measure the target label. Their accepted-cell count is zero; the comparison uses an arbitrary unused label and never presents it as an original read.',
      'Map identities and complete cell outputs match; copied previews cover observation extraction, not all original function RNG behavior or every possible application side effect.',
      'The composed pipeline links separate complete captures with identical outputs. Original writer-entry fill maps, point lists, frames and POST-FILL-entry patch maps remain inputs; this is not an integrated original MY-FILL caller proof.',
      'Value-3 provenance, brush painting and the remaining BRUSH-FILL row branches remain separate investigations.']};
  writeFileSync(output,`${JSON.stringify(result,null,2)}\n`,{flag:'wx'});console.log(JSON.stringify(scenes.map(s=>({seed:s.seed,coverage:s.coverage})),null,2));
}
