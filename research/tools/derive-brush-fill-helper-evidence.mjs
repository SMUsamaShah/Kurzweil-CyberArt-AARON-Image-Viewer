#!/usr/bin/env node

// Validate original helper boundaries against fresh controls and exact PLL objects.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseBrushFillHelperReport } from './parse-brush-fill-report.mjs';
import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { mapCapturedFunctions } from './map-native-code-to-pll.mjs';
import { sha256 } from './index-allegro-image.mjs';
import { selectAaronBrushProfile } from '../../engine/src/aaron-brushes.js';

const [pllArg, nativeArg, observed1234, control1234, observed5678, control5678,
  outputArg, ...extra] = process.argv.slice(2);
if (!outputArg || extra.length) throw new Error('Usage: node derive-brush-fill-helper-evidence.mjs <AARON.pll> <helper-native-run> <observed-1234> <control-1234> <observed-5678> <control-5678> <fresh-evidence.json>');
const output = resolve(outputArg);
if (existsSync(output)) throw new Error('Evidence output must be fresh');
const read = (path) => readFileSync(path);
const json = (path) => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/, ''));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const helperNames = ['SET-MEDIANS', 'GOOD-START', 'FLASH-SPOT', 'FILL-STRATEGY', 'POST-FILL'];
const binding = (state, name) => state.bindings[name];
const dispatch = (call) => call.args[0]?.kind === 'symbol'
  && call.args[0].package === 'COMMON-GRAPHICS-USER' ? call.args[0].name : null;
const number = (datum) => {
  assert(datum?.kind === 'number' && ['FIXNUM', 'BIGNUM'].includes(datum.type)
    && /^[+-]?\d+$/.test(datum.raw) && Number.isSafeInteger(datum.value), 'Expected an observed safe integer');
  return datum.value;
};
function run(rootArg, expectedMode, probeName) {
  const root = resolve(rootArg), summaryFile = resolve(root, 'summary.json');
  const summary = json(summaryFile), aa0 = read(resolve(root, 'capture/aa0'));
  const scene = read(resolve(root, 'capture/aaron-scene-state-snapshot.txt'));
  assert(summary.complete && summary.mode === expectedMode
    && sha256(aa0) === summary.aa0Sha256 && sha256(scene) === summary.sceneReportSha256,
  'Run completion, mode or captured-file hash mismatch');
  if (probeName) assert(summary.probeOutputNames.includes(probeName)
    && sha256(read(resolve(root, 'capture/aaron-pre-scene-probe.cl'))) === summary.preSceneProbeSha256,
  'Staged probe hash or output declaration mismatch');
  else assert(summary.preSceneProbeSha256 === null && summary.probeOutputNames.length === 0,
    'Expected an uninstrumented control');
  return { root, aa0, scene, record: { ...summary, summarySha256: sha256(read(summaryFile)) } };
}
function parity(observed, control) {
  assert(observed.aa0.equals(control.aa0) && observed.scene.equals(control.scene),
    'Observed AA0 or scene report differs from its fresh control');
  for (const key of ['mode', 'smallImage', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    assert(observed.record[key] === control.record[key], `Controlled setup mismatch: ${key}`);
  }
  return { observedRun: observed.record.runId, controlRun: control.record.runId,
    aa0ByteIdentical: true, sceneReportByteIdentical: true };
}
function analyze(observed, control, seed) {
  const raw = read(resolve(observed.root, 'capture/aaron-brush-fill-helpers.txt'));
  const report = parseBrushFillHelperReport(raw.toString('utf8'));
  const byName = (name) => report.calls.filter((c) => c.name === name);
  const byId = new Map(report.calls.map((c) => [c.id, c]));
  const children = new Map();
  for (const c of report.calls) {
    if (!children.has(c.parent)) children.set(c.parent, []);
    children.get(c.parent).push(c);
  }
  assert(report.installed['MY-FILL'] === 'STANDARD-GENERIC-FUNCTION'
    && report.installed['POST-FILL'] === 'STANDARD-GENERIC-FUNCTION'
    && helperNames.filter((n) => n !== 'POST-FILL').every((n) => report.installed[n] === 'COMPILED-FUNCTION'),
  'Unexpected observed helper types');
  const rows = byName('MY-FILL').map((m) => {
    const candidates = (children.get(m.id) ?? []).filter((c) => c.name === 'POST-FILL');
    assert(candidates.length === 1, 'MY-FILL must have one observed POST-FILL child');
    const p = candidates[0], mode = dispatch(m);
    assert(['SUBFORM', 'CFORM'].includes(mode) && m.args.length === 3
      && m.values.length === 1 && same(m.args, p.args) && same(m.values, p.values)
      && p.fill === m.fill && ['SUBP-COUNT', 'CFORM-COUNT'].every((n) =>
        same(binding(m.before, n), binding(p.before, n)) && same(binding(m.after, n), binding(p.after, n))),
    'MY-FILL/POST-FILL arguments, return values or count boundaries differ');
    const cdex = number(m.args[1]), sdex = number(m.args[2]);
    assert(cdex >= 0 && sdex >= 0 && number(m.values[0]) === number(p.values[0]), 'Unexpected fill argument or return');
    const peers = children.get(m.id) ?? [];
    for (const name of ['SET-MEDIANS', 'GOOD-START', 'FILL-STRATEGY']) {
      assert(peers.filter((c) => c.name === name).length === 1, 'Unexpected helper fanout');
    }
    assert(peers.filter((c) => c.name === 'FLASH-SPOT').length === (mode === 'SUBFORM' ? 2 : 0),
      'Unexpected MY-FILL FLASH-SPOT fanout');
    const before = binding(p.before, 'SUBP-COUNT'), after = binding(p.after, 'SUBP-COUNT');
    if (mode === 'SUBFORM') assert(m.fill > 0 && byId.get(m.fill)?.name === 'BRUSH-FILL'
      && after.status === 'BOUND' && number(after.value) >= 0, 'Unexpected SUBFORM count boundary');
    else assert(m.fill === 0 && before.status === 'UNBOUND' && after.status === 'UNBOUND',
      'Unexpected CFORM scalar count binding');
    return { myFill: m.id, postFill: p.id, fill: m.fill, mode, cdex, sdex,
      before, after, returnValue: number(p.values[0]), countChanged: !same(before, after) };
  });
  assert(rows.length === byName('POST-FILL').length, 'Unpaired POST-FILL calls');
  const helpers = helperNames.map((name) => {
    const calls = byName(name);
    const subpChanges = calls.filter((c) => !same(binding(c.before, 'SUBP-COUNT'), binding(c.after, 'SUBP-COUNT')));
    const cformChanges = calls.filter((c) => !same(binding(c.before, 'CFORM-COUNT'), binding(c.after, 'CFORM-COUNT')));
    assert(cformChanges.length === 0 && (name === 'POST-FILL' || subpChanges.length === 0),
      'Unexpected count change in another helper');
    if (name !== 'POST-FILL' && name !== 'FLASH-SPOT') assert(calls.every((c) =>
      byId.get(c.parent)?.name === 'MY-FILL'), 'Unexpected helper parent');
    return { name, originalType: report.installed[name], calls: calls.length,
      observedSubpCountChanges: subpChanges.length, observedCformCountChanges: cformChanges.length,
      observedParentNames: [...new Set(calls.map((c) => byId.get(c.parent)?.name ?? null))] };
  });
  const selectors = byName('SELECT-BRUSH').map((s) => {
    const producer = rows.filter((r) => r.mode === 'SUBFORM' && r.fill === s.fill
      && byId.get(r.myFill).returnEvent < s.entryEvent)
      .sort((a, b) => byId.get(b.myFill).returnEvent - byId.get(a.myFill).returnEvent)[0];
    assert(producer && s.parent === s.fill && s.args.length === 1 && s.values.length === 1,
      'Selector lacks its completed count producer');
    const input = number(s.args[0]), result = s.values[0], expected = selectAaronBrushProfile(input);
    assert(input >= 0 && input <= 200000 && same(s.args[0], producer.after.value)
      && same(s.args[0], binding(s.before, 'SUBP-COUNT').value)
      && (result === null ? expected === undefined : result.kind === 'brush'
        && result.index === result.id && result.id === expected?.id), 'Selector count or measured JS result differs');
    return { call: s.id, fill: s.fill, myFill: producer.myFill, postFill: producer.postFill,
      input, brushId: result?.id ?? null };
  });
  const subforms = rows.filter((r) => r.mode === 'SUBFORM'), cforms = rows.filter((r) => r.mode === 'CFORM');
  return { seed, observedRun: observed.record, controlRun: control.record, comparison: parity(observed, control),
    reportSha256: sha256(raw), calls: report.calls.length, installed: report.installed, totals: report.totals,
    observationScope: report.observationScope, helpers, pairedMyAndPostFills: rows.length,
    subforms: { calls: subforms.length, countChanges: subforms.filter((r) => r.countChanged).length,
      countRange: [Math.min(...subforms.map((r) => number(r.after.value))), Math.max(...subforms.map((r) => number(r.after.value)))] },
    cforms: { calls: cforms.length, scalarCountsUnbound: true }, rows, selectors };
}

const controls = [run(control1234, 'writer-stream-seed-1234'), run(control5678, 'writer-full-seed-5678')];
const observed = [run(observed1234, 'writer-stream-seed-1234', 'aaron-brush-fill-helpers.txt'),
  run(observed5678, 'writer-full-seed-5678', 'aaron-brush-fill-helpers.txt')];
assert(observed[0].record.preSceneProbeSha256 === observed[1].record.preSceneProbeSha256
  && observed[0].record.preSceneProbeSha256 === sha256(read(resolve('research/introspection/brush-fill-helper-capture.cl'))),
'Observed runs must use the same current helper observer');
const native = run(nativeArg, 'writer-stream-seed-1234', 'aaron-brush-fill-helper-links.txt');
assert(native.record.preSceneProbeSha256 === sha256(read(resolve('research/introspection/brush-fill-helper-links.cl'))),
  'Native run must use the current inspected metadata source');
const metadata = read(resolve(native.root, 'capture/aaron-brush-fill-helper-links.txt'));
const lines = metadata.toString('utf8').trim().split(/\r?\n/);
assert(lines[0] === 'BEGIN brush-fill-helper-links' && lines.at(-1) === 'END brush-fill-helper-links'
  && lines.includes('ERROR-COUNT 0') && lines.includes('TRUNCATION-COUNT 0')
  && !lines.some((l) => /^(ERROR |TRUNCATION |TARGET-BODY-STATUS |METHOD-BODY-STATUS )/.test(l)),
'Incomplete or diagnostic-only helper metadata');
const totals = parseLispRecord(lines.find((l) => l.startsWith('TOTALS ')), 'TOTALS');
assert(totals.targets.value === 5 && totals.errors.value === 0 && totals.truncations.value === 0
  && totals['code-headers'].value >= 1 && totals['code-headers'].value <= 64
  && totals['header-attempts'].value === totals['code-headers'].value, 'Helper metadata totals differ');
const enumerations = lines.filter((l) => l.startsWith('METHOD-ENUMERATION ')).map((l) => parseLispRecord(l, 'METHOD-ENUMERATION'));
assert(enumerations.length === 1 && enumerations[0].name.value === 'POST-FILL'
  && enumerations[0].status?.name === 'COMPLETE' && enumerations[0].emitted.value === totals.methods.value,
'Incomplete POST-FILL method enumeration');
const mapFile = resolve(native.root, 'native-code/mapped/native-code-map.json'), map = json(mapFile);
const manifestFile = resolve(native.root, 'native-code/manifest.json'), manifest = json(manifestFile);
assert(manifest.metadataSha256 === sha256(metadata) && map.captureManifestSha256 === sha256(read(manifestFile))
  && read(resolve(native.root, 'native-code/function-object-metadata.txt')).equals(metadata)
  && manifest.functions.length === totals['code-headers'].value, 'Native metadata/manifest binding differs');
const remapped = mapCapturedFunctions(manifest, (file) => {
  assert(basename(file) === file && /^[a-z0-9-]+\.native-window\.bin$/.test(file), 'Invalid window filename');
  return read(resolve(dirname(manifestFile), file));
}, read(resolve(pllArg))).report;
assert(same(map.functions, remapped.functions) && same(map.pll, remapped.pll), 'Exact native mapping differs');
const functions = map.functions.map((f) => {
  const ghidraFile = resolve(dirname(mapFile), 'ghidra', `${f.name.toLowerCase()}.ghidra.json`);
  const report = json(ghidraFile), payload = read(resolve(dirname(mapFile), f.payloadFile));
  assert(sha256(payload) === f.payloadSha256 && report.subject.sha256 === f.payloadSha256
    && report.subject.bytes === payload.length && report.subject.format === 'raw' && report.subject.architecture === 'x86'
    && report.functionName === f.name && report.memoryBase === f.runtime.entry && report.entry === f.runtime.entry
    && report.languageId === 'x86:LE:32:default' && report.compilerSpecId === 'windows'
    && report.assembly.length === report.disassembledInstructions && report.disassembledInstructions > 0
    && report.decompilation.completed && report.decompilation.error === '', 'Ghidra report binding differs');
  for (const i of report.assembly) assert(Number.isSafeInteger(i.offset) && i.offset >= 0
    && /^(?:[0-9a-f]{2})+$/.test(i.bytes)
    && Number.parseInt(i.address, 16) === Number.parseInt(f.runtime.entry, 16) + i.offset
    && payload.subarray(i.offset, i.offset + i.bytes.length / 2).toString('hex') === i.bytes,
  'Decoded instruction differs from the matched payload');
  const symbolConstants = lines.filter((l) => l.startsWith(`CONSTANT name="${f.name}" `)
    && l.includes(' value=(:SYMBOL ')).map((l) => {
    const r = parseLispRecord(l, 'CONSTANT');
    return { index: r.index.value, package: r.value[1]?.value ?? null, name: r.value[2].value };
  });
  return { name: f.name, runtime: f.runtime, pll: f.pll, objectBytes: f.objectBytes,
    objectSha256: f.objectSha256, payloadBytes: f.payloadBytes, payloadSha256: f.payloadSha256,
    uniqueCompleteObjectByteMatch: true, ghidraReportSha256: sha256(read(ghidraFile)),
    disassembledInstructions: report.disassembledInstructions, symbolConstants };
});
const methods = lines.filter((l) => l.startsWith('SPECIALIZERS ')).map((l) => {
  const r = parseLispRecord(l, 'SPECIALIZERS');
  assert(functions.some((f) => f.name === r.name.value), 'Method description lacks an exact code match');
  return { function: r.name.value, specializers: r.values,
    qualifiers: parseLispRecord(lines.find((line) => line.startsWith(`QUALIFIERS name="${r.name.value}" `)), 'QUALIFIERS').values };
});
assert(methods.length === totals.methods.value && !functions.some((f) => f.name === 'POST-FILL'),
  'Methods must remain distinct from the generated generic dispatcher');
const subformMethod = methods.find((m) => m.specializers[0]?.[0]?.name === 'EQL'
  && m.specializers[0]?.[1]?.[2]?.value === 'SUBFORM');
assert(subformMethod?.function === 'POST-FILL-METHOD-0', 'Unexpected SUBFORM method identity');
const subformReport = json(resolve(dirname(mapFile), 'ghidra/post-fill-method-0.ghidra.json'));
const subformFunction = functions.find((f) => f.name === subformMethod.function);
const slots = [{ index: 1, name: 'SUBP-COUNT' }, { index: 18, name: 'PATCHDEX' }];
assert(slots.every((slot) => subformFunction.symbolConstants.some((c) => c.index === slot.index
  && c.package === 'COMMON-GRAPHICS-USER' && c.name === slot.name)), 'Count-writer symbol slots differ');
const nativeSites = [
  { interpretation: 'Store zero to the SUBP-COUNT symbol value slot',
    instructions: [[42, '8b5636'], [45, '33db'], [47, '895a0d']] },
  { interpretation: 'Compare the naturally read target PATCHDEX with the current patch-map value; unequal values branch away from acceptance',
    instructions: [[702, '8b5e7a'], [705, 'b101'], [707, 'ffd7'], [723, '3b45c0'], [726, '0f85eb000000']] },
  { interpretation: 'On the accepted branch, add tagged unit 4 and pass the result with the SUBP-COUNT symbol to the runtime store helper',
    instructions: [[1113, '33d2'], [1115, 'b204'], [1121, '8bd8'], [1123, '03da'], [1127, '8b5636'], [1130, '8bc3'], [1132, 'ff577b']] },
].map((site) => ({ interpretation: site.interpretation, instructions: site.instructions.map(([offset, bytes]) => {
  const instruction = subformReport.assembly.find((i) => i.offset === offset);
  assert(instruction?.bytes === bytes, 'Bounded count-writer instruction differs');
  return { offset, bytes, text: instruction.text };
}) }));
const reaRoot = resolve(dirname(mapFile), 'ghidra');
const bundleFile = resolve(reaRoot, 'post-fill-method-0.rea-bundle.json');
const exportFile = resolve(reaRoot, 'post-fill-method-0.rea-export.json');
const bundle = json(bundleFile), exported = json(exportFile);
const imported = json(resolve(reaRoot, 'post-fill-method-0.rea-import.json'));
assert(bundle.records.length === 1 && exported.records.length === 1 && imported.imported === 1
  && same(bundle.records[0], exported.records[0])
  && bundle.records[0].provider.id === 'ghidra-standalone'
  && bundle.records[0].subject.digest.sha256 === subformFunction.payloadSha256,
'REA import/export identity or subject mismatch');
const evidence = { schemaVersion: 1, status: 'measured',
  scope: 'Complete event and scalar count observations at thirteen function-cell boundaries in two controlled paintings; exact helper/method PLL matches',
  derivationSha256: sha256(read(resolve('research/tools/derive-brush-fill-helper-evidence.mjs'))),
  parserSha256: sha256(read(resolve('research/tools/parse-brush-fill-report.mjs'))),
  selectorImplementationSha256: sha256(read(resolve('engine/src/aaron-brushes.js'))),
  scenes: observed.map((r, i) => analyze(r, controls[i], i === 0 ? 1234 : 5678)),
  native: { run: native.record, comparison: parity(native, controls[0]), metadataSha256: sha256(metadata),
    mapSha256: sha256(read(mapFile)), pll: map.pll, targets: helperNames, methodCount: methods.length,
    errors: 0, truncations: 0, methods, functions, subformCountWriter: { method: subformMethod.function,
      nativeSites, interpretation: 'Exact native instructions plus natural wrapper transitions locate the writer inside the SUBFORM method; the full rule requires complete input/output map captures' } },
  rea: { version: '3.2.1', nativeProviderSession: false, provider: bundle.records[0].provider,
    evidenceId: bundle.records[0].evidence_id, importResult: imported, exportedRecords: exported.records.length,
    bundleSha256: sha256(read(bundleFile)), canonicalExportSha256: sha256(read(exportFile)),
    interpretation: 'Canonical external evidence import/export; it does not authenticate the standalone analysis' },
  limitations: ['Function-cell parent relationships are observed wrapper nesting, not native entry breakpoints.',
    'Entry/exit equality does not exclude temporary changes within a helper.',
    'Argument geometry summaries are bounded and cannot reconstruct full map or frame inputs.',
    'Optional helper-report hashes are offline derivation digests; runner summaries do not independently bind these optional bytes.',
    'Ghidra expressions and inferred types are not recovered Lisp source or proof of the complete count algorithm.',
    'Two seeds do not establish behavior for all scenes or dispatch branches.'] };
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output, sha256: sha256(read(output)), pairedFills: evidence.scenes.map((s) => s.pairedMyAndPostFills),
  subforms: evidence.scenes.map((s) => s.subforms), helpers: functions.map((f) => f.name) }, null, 2));
