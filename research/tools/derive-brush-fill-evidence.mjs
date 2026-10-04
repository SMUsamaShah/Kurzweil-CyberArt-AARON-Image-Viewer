#!/usr/bin/env node

// Derive a compact behavior record from complete, controlled original runs.
// The bounded geometry summaries cannot reconstruct a fill map or its count.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseBrushFillReport } from './parse-brush-fill-report.mjs';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { mapCapturedFunctions } from './map-native-code-to-pll.mjs';
import { sha256 } from './index-allegro-image.mjs';
import { selectAaronBrushProfile } from '../../engine/src/aaron-brushes.js';

const [pllArg, nativeArg, observed1234, control1234, observed5678, control5678,
  outputArg, methodsArg, ...extra] = process.argv.slice(2);
if (!outputArg || extra.length) {
  throw new Error('Usage: node derive-brush-fill-evidence.mjs <AARON.pll> <native-run> <observed-1234> <control-1234> <observed-5678> <control-5678> <fresh-evidence.json> [methods-run]');
}
const output = resolve(outputArg);
if (existsSync(output)) throw new Error('Evidence output must be fresh');
const read = (path) => readFileSync(path);
const json = (path) => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/, ''));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const readWindow = (root, file) => {
  assert(basename(file) === file && /^[a-z0-9-]+\.native-window\.bin$/.test(file), 'Invalid native window filename');
  return read(resolve(root, file));
};
const binding = (state, name) => state.bindings[name];
const count = (state) => {
  const b = binding(state, 'SUBP-COUNT');
  return b.status === 'BOUND' ? b.value : { kind: b.status.toLowerCase() };
};
function integer(datum, label) {
  assert(datum?.kind === 'number' && ['FIXNUM', 'BIGNUM'].includes(datum.type)
    && /^\+?\d+$/.test(datum.raw) && Number.isSafeInteger(datum.value)
    && datum.value >= 0, `Expected a measured nonnegative integer: ${label}`);
  return datum.value;
}
const mode = (call) => call.args[0]?.kind === 'symbol'
  && call.args[0].package === 'COMMON-GRAPHICS-USER' ? call.args[0].name : null;

function run(rootArg, expectedMode, probeName) {
  const root = resolve(rootArg), summaryFile = resolve(root, 'summary.json');
  const summary = json(summaryFile), aa0 = read(resolve(root, 'capture/aa0'));
  const scene = read(resolve(root, 'capture/aaron-scene-state-snapshot.txt'));
  assert(summary.complete && summary.mode === expectedMode
    && sha256(aa0) === summary.aa0Sha256 && sha256(scene) === summary.sceneReportSha256,
  'Run completion, mode or captured-file hash mismatch');
  if (probeName) {
    assert(summary.probeOutputNames.includes(probeName)
      && sha256(read(resolve(root, 'capture/aaron-pre-scene-probe.cl'))) === summary.preSceneProbeSha256,
    'Staged observer hash or declared output mismatch');
  } else assert(summary.preSceneProbeSha256 === null && summary.probeOutputNames.length === 0,
    'Expected an uninstrumented control');
  return { root, aa0, scene, record: { ...summary, summarySha256: sha256(read(summaryFile)) } };
}
function parity(observed, control) {
  assert(observed.aa0.equals(control.aa0) && observed.scene.equals(control.scene),
    'Observed painting or scene report differs from its fresh control');
  for (const key of ['mode', 'smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(observed.record[key] === control.record[key], `Controlled setup mismatch: ${key}`);
  }
  return { observedRun: observed.record.runId, controlRun: control.record.runId,
    aa0ByteIdentical: true, sceneReportByteIdentical: true };
}

function analyze(observed, control, seed) {
  const raw = read(resolve(observed.root, 'capture/aaron-brush-fill-natural.txt'));
  const report = parseBrushFillReport(raw.toString('utf8'));
  assert(report.protocolVersion === 2, 'Retained evidence requires final protocol v2');
  assert(report.installed['MY-FILL'] === 'STANDARD-GENERIC-FUNCTION', 'Unexpected MY-FILL type');
  const byName = (name) => report.calls.filter((c) => c.name === name);
  const byId = new Map(report.calls.map((c) => [c.id, c]));
  const events = report.calls.flatMap((c) => [
    { event: c.entryEvent, call: c, phase: 'entry', state: c.before },
    { event: c.returnEvent, call: c, phase: 'return', state: c.after },
  ]).sort((a, b) => a.event - b.event);
  const subforms = byName('MY-FILL').filter((c) => mode(c) === 'SUBFORM');
  const cforms = byName('MY-FILL').filter((c) => mode(c) === 'CFORM');
  assert(subforms.length + cforms.length === report.totals['MY-FILL'], 'Unexpected fill dispatch argument');
  assert([...subforms, ...cforms].every((c) => c.args.length === 3
    && c.values.length === 1 && c.values[0]?.kind === 'number'), 'Unexpected MY-FILL arguments or return values');
  const selectors = byName('SELECT-BRUSH'), subparts = byName('BRUSH-FILL-SUBPART');
  const records = byName('RECORD-BRUSH'), irises = byName('FILL-IRIS');
  const selectorRows = selectors.map((c) => {
    assert(c.parent === c.fill && byId.get(c.fill)?.name === 'BRUSH-FILL'
      && c.args.length === 1 && c.values.length === 1, 'Unexpected selector boundary');
    const input = integer(c.args[0], `SELECT-BRUSH call ${c.id}`);
    assert(input <= 200000 && same(c.args[0], count(c.before)), 'Selector input differs from the observed count');
    const producer = subforms.filter((p) => p.fill === c.fill && p.returnEvent < c.entryEvent)
      .sort((a, b) => b.returnEvent - a.returnEvent)[0];
    assert(producer && same(count(producer.after), c.args[0]), 'Selector input lacks a matching completed SUBFORM fill');
    const selected = c.values[0], profile = selectAaronBrushProfile(input);
    assert(selected === null ? profile === undefined
      : selected.kind === 'brush' && selected.index === selected.id && selected.id === profile?.id,
    'Observed selector differs from the existing measured JavaScript rule');
    assert(same(binding(c.before, 'BRUSH'), binding(c.after, 'BRUSH')), 'Selector itself changed BRUSH');
    assert(c.after.selectionKnown, 'Selector association was not recorded');
    const assignment = events.find((e) => e.event > c.returnEvent && e.call.fill === c.fill);
    const assignedBrush = assignment && binding(assignment.state, 'BRUSH');
    assert(assignment?.state.selectionKnown && assignment.state.brushEqSelected
      && assignedBrush.status === 'BOUND' && same(assignedBrush.value, selected),
    'Next observed brush assignment differs from the selector result');
    return { call: c.id, fill: c.fill, producer: producer.id, input,
      brushId: selected?.id ?? null, brushIndex: selected?.index ?? null,
      assignmentObservation: { call: assignment.call.id, name: assignment.call.name,
        event: assignment.event, phase: assignment.phase, exactSelectedValue: true } };
  });
  const selectionByFill = (call) => selectors.filter((s) => s.fill === call.fill && s.returnEvent < call.entryEvent)
    .sort((a, b) => b.returnEvent - a.returnEvent)[0];
  function brushEntry(c) {
    const selected = selectionByFill(c), brush = binding(c.before, 'BRUSH');
    assert(selected?.values[0]?.kind === 'brush' && c.before.selectionKnown && c.before.brushEqSelected
      && brush.status === 'BOUND' && same(brush.value, selected.values[0]),
    `Brush entry does not use the selected object: ${c.name} ${c.id}`);
    return { call: c.id, fill: c.fill, selection: selected.id, brushId: brush.value.id,
      brushIndex: brush.value.index, exactSelectedObject: true,
      exitBrush: binding(c.after, 'BRUSH'), exitEqSelected: c.after.brushEqSelected };
  }
  const subpartRows = subparts.map((c) => {
    assert(c.parent === c.fill, 'Unexpected subpart parent');
    return brushEntry(c);
  });
  const recordRows = records.map((c) => {
    assert(byId.get(c.parent)?.name === 'BRUSH-FILL-SUBPART', 'Unexpected brush-record parent');
    return brushEntry(c);
  });
  assert(recordRows.every((r) => r.exitEqSelected)
    && subpartRows.filter((r) => !r.exitEqSelected).every((r) => r.exitBrush.status === 'BOUND'
      && r.exitBrush.value?.kind === 'brush' && r.exitBrush.value.id === 1 && r.exitBrush.value.index === 1),
  'Record or subpart exit brush pattern differs');
  const withSubpart = new Set(subpartRows.map((r) => r.selection));
  assert(selectorRows.every((s) => withSubpart.has(s.call) === (s.brushId !== null))
    && withSubpart.size === subpartRows.length && recordRows.length === subpartRows.length
    && new Set(records.map((c) => c.parent)).size === subparts.length
    && subparts.every((c) => records.some((r) => r.parent === c.id)),
  'Observed NIL/non-NIL subpart branch differs from the proposed boundary');
  const changes = (calls) => calls.filter((c) => !same(count(c.before), count(c.after)));
  const irisRows = irises.map((c) => {
    const producer = subforms.filter((p) => p.fill === c.fill && p.returnEvent < c.entryEvent)
      .sort((a, b) => b.returnEvent - a.returnEvent)[0];
    assert(producer, 'Iris lacks a completed SUBFORM fill');
    return { call: c.id, fill: c.fill, producer: producer.id, args: c.args,
      countBefore: count(c.before), countAfter: count(c.after) };
  });
  const consumedProducers = new Set([...selectorRows, ...irisRows].map((r) => r.producer));
  assert(consumedProducers.size === subforms.length
    && subforms.every((c) => consumedProducers.has(c.id)), 'Unaccounted SUBFORM count boundary');
  const ids = {};
  for (const r of selectorRows) ids[r.brushId ?? 'NIL'] = (ids[r.brushId ?? 'NIL'] ?? 0) + 1;
  const subformRows = subforms.map((c) => ({ call: c.id, fill: c.fill, args: c.args,
    before: count(c.before), after: count(c.after), returnValues: c.values }));
  return {
    seed, observedRun: observed.record, controlRun: control.record, comparison: parity(observed, control),
    reportSha256: sha256(raw), parserSha256: sha256(read(resolve('research/tools/parse-brush-fill-report.mjs'))),
    reportDigestOrigin: 'Computed during offline derivation; the oracle summary does not independently hash this optional observation report',
    lispRecordParserSha256: sha256(read(resolve('research/tools/parse-natural-free-path-report.mjs'))),
    observationScope: report.observationScope, totals: report.totals,
    myFill: { cformCalls: cforms.length, cformCountChanges: changes(cforms).length,
      subformCalls: subforms.length, subformCountChanges: changes(subforms).length,
      cformReturnRange: [Math.min(...cforms.map((c) => c.values[0].value)), Math.max(...cforms.map((c) => c.values[0].value))],
      subformReturnRange: [Math.min(...subforms.map((c) => c.values[0].value)), Math.max(...subforms.map((c) => c.values[0].value))],
      countAfterMinimum: Math.min(...subforms.map((c) => integer(count(c.after), 'SUBFORM count'))),
      countAfterMaximum: Math.max(...subforms.map((c) => integer(count(c.after), 'SUBFORM count'))),
      returnEqualsCountAfter: subforms.filter((c) => same(c.values[0], count(c.after))).length,
      boundedExamples: subformRows.slice(0, 5) },
    scanRow: { calls: report.totals['SCAN-ROW'], observedEntryExitCountChanges: changes(byName('SCAN-ROW')).length },
    selectors: { calls: selectors.length, integerDomainMatches: selectors.length, resultCounts: ids,
      countFromLatestCompletedSubformMatches: selectors.length,
      nextObservedAssignmentMatches: selectors.length, rows: selectorRows },
    brushSubparts: { calls: subparts.length, selectedObjectEntryMatches: subparts.length,
      exitEqSelected: subpartRows.filter((r) => r.exitEqSelected).length,
      boundedExamples: subpartRows.slice(0, 3) },
    brushRecords: { calls: records.length, selectedObjectEntryMatches: records.length,
      exitEqSelected: recordRows.filter((r) => r.exitEqSelected).length },
    irises: irisRows,
    cformCountScalarBindingStatuses: [...new Set(report.calls.flatMap((c) =>
      [binding(c.before, 'CFORM-COUNT').status, binding(c.after, 'CFORM-COUNT').status]))],
  };
}

const controls = [run(control1234, 'writer-stream-seed-1234'), run(control5678, 'writer-full-seed-5678')];
const observed = [run(observed1234, 'writer-stream-seed-1234', 'aaron-brush-fill-natural.txt'),
  run(observed5678, 'writer-full-seed-5678', 'aaron-brush-fill-natural.txt')];
assert(observed[0].record.preSceneProbeSha256 === observed[1].record.preSceneProbeSha256
  && observed[0].record.preSceneProbeSha256 === sha256(read(resolve('research/introspection/brush-fill-natural-capture.cl'))),
'Retained runs must use the same current observer source');
const native = run(nativeArg, 'writer-stream-seed-1234', 'aaron-brush-fill-native-links.txt');
const mapFile = resolve(native.root, 'native-code/mapped/native-code-map.json'), map = json(mapFile);
const manifestFile = resolve(native.root, 'native-code/manifest.json'), manifest = json(manifestFile);
const metadata = read(resolve(native.root, 'native-code/function-object-metadata.txt'));
assert(sha256(metadata) === manifest.metadataSha256 && map.captureManifestSha256 === sha256(read(manifestFile))
  && map.metadataSha256 === sha256(metadata), 'Native map/capture/metadata binding mismatch');
const pll = read(resolve(pllArg));
const recomputed = mapCapturedFunctions({ ...manifest, functions: manifest.functions.filter((f) => f.name !== 'MY-FILL') },
  (file) => readWindow(dirname(manifestFile), file), pll).report;
assert(same(map.functions, recomputed.functions) && same(map.pll, recomputed.pll), 'Exact native object match differs');
assert(map.unmappedDispatchers?.length === 1 && map.unmappedDispatchers[0].exactPllMatches === 0
  && metadata.toString('utf8').includes('FUNCTION name="MY-FILL" type=STANDARD-GENERIC-FUNCTION'),
'Generic dispatcher must remain distinct from method bodies');
let dispatcherFailure;
try {
  mapCapturedFunctions({ ...manifest, functions: manifest.functions.filter((f) => f.name === 'MY-FILL') },
    (file) => readWindow(dirname(manifestFile), file), pll);
} catch (error) { dispatcherFailure = error.message; }
assert(dispatcherFailure === 'Expected one complete PLL byte match for MY-FILL; found 0',
  'Expected the independently checked zero-match generic dispatcher');
function decodedFunctions(codeMap, codeMapFile) {
  return codeMap.functions.map((f) => {
  const ghidraFile = resolve(dirname(codeMapFile), 'ghidra', `${f.name.toLowerCase()}.ghidra.json`);
  const report = json(ghidraFile), payload = read(resolve(dirname(codeMapFile), f.payloadFile));
  assert(sha256(payload) === f.payloadSha256 && report.subject.sha256 === f.payloadSha256
    && report.subject.bytes === payload.length && report.subject.format === 'raw' && report.subject.architecture === 'x86'
    && report.functionName === f.name && report.memoryBase === f.runtime.entry && report.entry === f.runtime.entry
    && report.languageId === 'x86:LE:32:default' && report.compilerSpecId === 'windows'
    && report.assembly.length === report.disassembledInstructions && report.disassembledInstructions > 0
    && report.decompilation.completed && report.decompilation.error === '',
  'Ghidra report subject or instruction count differs');
  for (const ins of report.assembly) {
    assert(Number.isSafeInteger(ins.offset) && ins.offset >= 0 && /^(?:[0-9a-f]{2})+$/.test(ins.bytes)
      && Number.parseInt(ins.address, 16) === Number.parseInt(f.runtime.entry, 16) + ins.offset
      && payload.subarray(ins.offset, ins.offset + ins.bytes.length / 2).toString('hex') === ins.bytes,
      'Ghidra instruction differs from the matched payload');
  }
  return { name: f.name, runtime: f.runtime, pll: f.pll, objectBytes: f.objectBytes,
    objectSha256: f.objectSha256, payloadBytes: f.payloadBytes, payloadSha256: f.payloadSha256,
    uniqueCompleteObjectByteMatch: true, ghidraReportSha256: sha256(read(ghidraFile)),
    disassembledInstructions: report.disassembledInstructions };
  });
}
const namedFunctions = decodedFunctions(map, mapFile);
function methodsEvidence(rootArg) {
  const captured = run(rootArg, 'writer-stream-seed-1234', 'aaron-brush-fill-methods.txt');
  assert(captured.record.preSceneProbeSha256 === sha256(read(resolve('research/introspection/brush-fill-methods.cl'))),
    'Retained methods run must use the current inspected probe');
  const methodBytes = read(resolve(captured.root, 'capture/aaron-brush-fill-methods.txt'));
  const text = methodBytes.toString('utf8'), lines = text.trim().split(/\r?\n/);
  assert(lines[0] === 'BEGIN brush-fill-methods' && lines.at(-1) === 'END brush-fill-methods'
    && lines.includes('METHOD-COUNT total=2 emitted=2 limit=64 status=:COMPLETE truncated=NIL')
    && lines.includes('ERROR-COUNT 0') && lines.includes('TRUNCATION-COUNT 0')
    && !lines.some((l) => /^(ERROR |TRUNCATION |FUNCTION-BODY-STATUS )/.test(l)),
  'Incomplete or diagnostic-only method report');
  const methodMapFile = resolve(captured.root, 'native-code/mapped/native-code-map.json');
  const methodMap = json(methodMapFile), methodManifestFile = resolve(captured.root, 'native-code/manifest.json');
  const methodManifest = json(methodManifestFile);
  assert(methodMap.captureManifestSha256 === sha256(read(methodManifestFile))
    && methodManifest.metadataSha256 === sha256(methodBytes), 'Method native capture binding differs');
  const remapped = mapCapturedFunctions(methodManifest,
    (file) => readWindow(dirname(methodManifestFile), file), pll).report;
  assert(same(remapped.functions, methodMap.functions) && same(remapped.pll, methodMap.pll),
    'Method complete-object PLL match differs');
  const methodDescriptions = [0, 1].map((index) => {
    assert(lines.includes(`METHOD index=${index} type=STANDARD-METHOD`)
      && lines.includes(`QUALIFIERS index=${index} values=NIL`)
      && lines.includes(`METHOD-FUNCTION name="MY-FILL-METHOD-${index}" type=COMPILED-FUNCTION`)
      && lines.includes(`ARGLIST name="MY-FILL-METHOD-${index}" values=(COMMON-GRAPHICS-USER::WOT COMMON-GRAPHICS-USER::CDEX COMMON-GRAPHICS-USER::SDEX)`),
    'Unexpected method type or qualifiers');
    const record = parseLispRecord(lines.find((l) => l.startsWith(`SPECIALIZERS index=${index} `)), 'SPECIALIZERS');
    const specs = record.values;
    assert(specs.length === 3 && specs[0][0]?.name === 'EQL'
      && specs[0][1][0]?.name === 'SYMBOL' && specs[0][1][1]?.value === 'COMMON-GRAPHICS-USER'
      && ['SUBFORM', 'CFORM'].includes(specs[0][1][2]?.value)
      && specs.slice(1).every((s) => s[0]?.name === 'CLASS' && s[1][0]?.name === 'SYMBOL'
        && s[1][1]?.value === 'COMMON-LISP' && s[1][2]?.value === 'T'),
    'Unexpected MY-FILL specializers');
    const symbolConstants = lines.filter((l) => l.startsWith(`CONSTANT name="MY-FILL-METHOD-${index}" `)
      && l.includes(' value=(:SYMBOL ')).map((l) => {
      const r = parseLispRecord(l, 'CONSTANT');
      return { index: r.index.value, package: r.value[1]?.value ?? null, name: r.value[2].value };
    });
    return { index, function: `MY-FILL-METHOD-${index}`, qualifiers: [], arglist: ['WOT', 'CDEX', 'SDEX'],
      symbolConstants,
      specializers: [{ eql: { package: 'COMMON-GRAPHICS-USER', name: specs[0][1][2].value } },
        { class: 'COMMON-LISP:T' }, { class: 'COMMON-LISP:T' }] };
  });
  assert(new Set(methodDescriptions.map((m) => m.specializers[0].eql.name)).size === 2,
    'Expected two distinct MY-FILL EQL methods');
  const callCandidates = [
    { method: 'MY-FILL-METHOD-0', callee: 'FILL-STRATEGY', constantIndex: 5, loadOffset: 77, callOffset: 82, cl: 0 },
    { method: 'MY-FILL-METHOD-0', callee: 'POST-FILL', constantIndex: 7, loadOffset: 122, callOffset: 127, cl: 3 },
    { method: 'MY-FILL-METHOD-1', callee: 'FILL-STRATEGY', constantIndex: 12, loadOffset: 310, callOffset: 315, cl: 0 },
    { method: 'MY-FILL-METHOD-1', callee: 'POST-FILL', constantIndex: 14, loadOffset: 348, callOffset: 353, cl: 3 },
  ].map((site) => {
    const description = methodDescriptions.find((m) => m.function === site.method);
    assert(description.symbolConstants.some((c) => c.index === site.constantIndex
      && c.package === 'COMMON-GRAPHICS-USER' && c.name === site.callee), 'Method constant-slot candidate differs');
    const report = json(resolve(dirname(methodMapFile), 'ghidra', `${site.method.toLowerCase()}.ghidra.json`));
    const instructions = report.assembly.filter((i) => i.offset >= site.loadOffset && i.offset <= site.callOffset);
    const slotDisplacement = (0x32 + site.constantIndex * 4).toString(16);
    assert(instructions.length === 3 && instructions[0].offset === site.loadOffset
      && instructions[0].text === `MOV EBX,dword ptr [ESI + 0x${slotDisplacement}]`
      && instructions[1].bytes === `b1${site.cl.toString(16).padStart(2, '0')}`
      && instructions[2].offset === site.callOffset && instructions[2].bytes === 'ffd7',
    'Bounded native method call candidate differs');
    return { ...site, interpretation: 'Static candidate from a measured symbol constant and computed call; no named native entry hit',
      instructions: instructions.map(({ offset, bytes, text }) => ({ offset, bytes, text })) };
  });
  return { run: captured.record, comparison: parity(captured, controls[0]),
    metadataSha256: sha256(methodBytes), mapSha256: sha256(read(methodMapFile)),
    methodCount: 2, errors: 0, truncations: 0, methodDescriptions,
    namedFunctions: decodedFunctions(methodMap, methodMapFile), callCandidates,
    scope: 'Read-only method enumeration and exact compiled-object mapping; method bodies were not invoked by the metadata probe' };
}
const evidence = {
  schemaVersion: 1, status: 'measured',
  derivationSha256: sha256(read(resolve('research/tools/derive-brush-fill-evidence.mjs'))),
  selectorImplementationSha256: sha256(read(resolve('engine/src/aaron-brushes.js'))),
  scope: 'Count and brush-object boundaries across complete scenes for controlled seeds 1234 and 5678; argument geometry is summarized',
  native: { run: native.record, comparison: parity(native, controls[0]),
    mapSha256: sha256(read(mapFile)), metadataSha256: sha256(metadata), pll: map.pll,
    namedFunctions, unmappedDispatchers: map.unmappedDispatchers },
  scenes: observed.map((r, i) => analyze(r, controls[i], i === 0 ? 1234 : 5678)),
  methods: methodsArg ? methodsEvidence(methodsArg) : null,
  limitations: [
    'The observer records function-cell calls, not native entry hits. The previous separate breakpoint evidence establishes the first native SELECT-BRUSH caller.',
    'MY-FILL entry/exit delimits count changes but does not establish which internal instruction writes them.',
    'Unchanged SCAN-ROW entry/exit values do not rule out transient changes or unobserved indirect effects.',
    'Only these two seeded scenes and their observed branches are characterized; the full count-generation algorithm and JavaScript caller remain unrecovered.',
    'Bounded lists and opaque object summaries cannot reconstruct input geometry or fill-map contents.',
    'CFORM-COUNT being unbound as a scalar does not imply its callable accessor or per-form slots are absent.',
    'Ghidra inferred C does not model the Allegro Lisp ABI; complete native reports and original files remain ignored.',
  ],
};
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output, sha256: sha256(read(output)), scenes: evidence.scenes.map((s) =>
  ({ seed: s.seed, totals: s.totals, results: s.selectors.resultCounts, comparison: s.comparison })) }, null, 2));
