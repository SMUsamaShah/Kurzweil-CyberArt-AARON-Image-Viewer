#!/usr/bin/env node
// Offline validation only: never launches REA, Ghidra, AARON or a generated PE.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual as same } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = 'research/artifacts/rea-tools/deeper-rea-20261012';
const PKG = 'research/artifacts/rea-tools/rea-6.4.0/node_modules/rea-agents';
const HASHES = Object.freeze({
  pll: '7ffc7dc9e3e62b1c5ba3612630b8747778324fa674dac42916be3e90bb96504c',
  bindings: '4c2655a53cb0b2094d0e8d9f518e2491a98ccaaab0f41b664f31d4cd11e644f5',
  addon: 'c4fd9f377e567bcf15ba3fec3e0b0ed965d82b765a2adcdac49e46f14524b6d5',
});
const CASES = Object.freeze([
  { name: 'ZERO-EDGE', run: 'brush-buffer-predicate-native-seed1234-20261006-a', entry: '0x1fe03934', payload: 982,
    hash: 'c08d6adc6b28253ef1ecce89233e69ca23c58f639015f6c95051970c5fbec736', evidence: '7ec05f9f2892f120c674ee1f4c0b0be2398a20792e6f379ac6a2d8c08644829f', instructions: 338, body: 973, blocks: 79, conditional: 45, calls: 41, pcode: 387, defuse: 379, refs: 146 },
  { name: 'BRUSH-FILL', run: 'brush-fill-native-code-seed1234-20261004-a', entry: '0x1fe1924c', payload: 1986,
    hash: '016b613a592e6f5cc18a7b6fc0d04264a9038c485fdb05b91c458464a59f0957', evidence: '105e722aa165d546003b474da42d4efdef8712a5f1335914cba5690e9d2676aa', instructions: 651, body: 1978, blocks: 121, conditional: 63, calls: 137, pcode: 952, defuse: 885, refs: 201 },
  { name: 'FILL-IRIS', run: 'brush-fill-native-code-seed1234-20261004-a', entry: '0x1fe23b9c', payload: 1384,
    hash: '405dcbec1b81b7ba2d1f44c7da4a89961eed17634ecd5b441071249743bcf00e', evidence: '1a73a233019d60b9e7b5624812a00d7d18f6b6aa86db1a656bc6944905cdbd83', instructions: 459, body: 1375, blocks: 92, conditional: 54, calls: 61, pcode: 671, defuse: 744, refs: 188 },
]);
const assert = (ok, message) => { if (!ok) throw Error(message); };
const sha = b => createHash('sha256').update(b).digest('hex');
const portable = p => p.replaceAll('\\', '/');
const inside = (base, path) => { const r = relative(base, path); return r !== '' && r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r); };
const commaNormalize = s => s.replace(/,\s*/gu, ', ');
const sources = new Map();
function read(path, expected, externalLabel) {
  const absolute = resolve(ROOT, path);
  assert(inside(ROOT, absolute) || externalLabel, `Source escapes repository: ${path}`);
  const b = readFileSync(absolute), label = externalLabel ?? portable(relative(ROOT, absolute));
  assert(!expected || sha(b) === expected, `Source hash differs: ${label}`);
  const row = { path: label, sha256: sha(b), bytes: b.length };
  const previous = sources.get(label);
  assert(!previous || same(previous.row, row), `Source changed: ${label}`);
  sources.set(label, { absolute, row }); return b;
}
function json(path, expected) { return JSON.parse(read(path, expected).toString('utf8').replace(/^\uFEFF/u, '')); }
function projection(value) { const b = Buffer.from(JSON.stringify(value)); return { sha256: sha(b), bytes: b.length }; }
function command(stem, operation, address, target, cfg) {
  const r = json(`${LOCAL}/${stem}.query-result.json`);
  assert(r.status === 0 && !r.error && !r.signal, `${stem} CLI did not complete successfully`);
  assert(same(r.args, [cfg.reaCli, operation, target, address, '--provider', 'ghidra', '--format', 'json']), `${stem} CLI arguments differ`);
  assert(read(`${LOCAL}/${stem}.${operation === 'function' ? 'function.' : ''}stderr.txt`).length === 0, `${stem} CLI stderr is nonempty`);
}
function validatePe(pe, payload, binding, pin) {
  assert(pe.length >= 512 && pe.toString('ascii', 0, 2) === 'MZ' && pe.readUInt32LE(60) === 128 && pe.toString('ascii', 128, 132) === 'PE\0\0', `${pin.name} generated PE signature differs`);
  const c = 132, o = 152, s = 376, entry = Number(pin.entry), base = Math.floor(entry / 65536) * 65536;
  const rva = Math.floor((entry - base) / 4096) * 4096, prefix = entry - base - rva;
  const size = prefix + payload.length, rawSize = Math.ceil(size / 512) * 512;
  assert(pe.readUInt16LE(c) === 0x14c && pe.readUInt16LE(c + 2) === 1 && pe.readUInt16LE(c + 16) === 224 && pe.readUInt16LE(c + 18) === 0x102, `${pin.name} generated COFF header differs`);
  assert(pe.readUInt16LE(o) === 0x10b && pe.readUInt32LE(o + 4) === rawSize && pe.readUInt32LE(o + 16) === entry - base
    && pe.readUInt32LE(o + 20) === rva && pe.readUInt32LE(o + 28) === base && pe.readUInt32LE(o + 32) === 4096
    && pe.readUInt32LE(o + 36) === 512 && pe.readUInt32LE(o + 56) === Math.ceil((rva + size) / 4096) * 4096
    && pe.readUInt32LE(o + 60) === 512 && pe.readUInt16LE(o + 68) === 3 && pe.readUInt32LE(o + 92) === 16,
  `${pin.name} generated optional header differs`);
  assert(pe.subarray(o + 96, o + 224).every(x => x === 0), `${pin.name} synthetic data directories are not empty`);
  assert(pe.toString('ascii', s, s + 8).replace(/\0/gu, '') === '.text' && pe.readUInt32LE(s + 8) === size
    && pe.readUInt32LE(s + 12) === rva && pe.readUInt32LE(s + 16) === rawSize && pe.readUInt32LE(s + 20) === 512
    && pe.readUInt32LE(s + 36) === 0x60000020 && pe.length === 512 + rawSize, `${pin.name} generated section layout differs`);
  assert(binding.assertedImageBase === base && binding.assertedSectionRva === rva && binding.syntheticPayloadOffset === 512 + prefix
    && binding.assertedEntry === pin.entry && payload.equals(pe.subarray(512 + prefix, 512 + prefix + payload.length)), `${pin.name} exact copied PE payload differs`);
  assert(pe.subarray(512, 512 + prefix).every(x => x === 0) && pe.subarray(512 + prefix + payload.length).every(x => x === 0), `${pin.name} generated padding differs`);
  return { headerAuthority: 'analyst-assertion', imageBase: `0x${base.toString(16)}`, sectionRva: rva,
    entry: pin.entry, copiedPayloadFileOffset: 512 + prefix, copiedPayloadBytes: payload.length, generatedPrefixBytes: prefix,
    generatedSuffixBytes: rawSize - size, executableWasNotRun: true };
}
function validateBody(v, old, payload, pin) {
  const entry = Number(pin.entry), body = v.procedure.body;
  assert(v.procedure.address === pin.entry && v.procedure.name === pin.name.replaceAll('-', '_')
    && v.procedure.classification.external === false && v.procedure.classification.thunk === false, `${pin.name} seeded procedure identity differs`);
  assert(body.available && body.contains_entry && !body.non_contiguous && body.total_bytes === pin.body && body.span_bytes === pin.body
    && same(body.ranges, [{ start: pin.entry, end: `0x${(entry + pin.body - 1).toString(16)}` }]), `${pin.name} body extent differs`);
  assert(old.assembly.length === pin.instructions && v.assembly.length === pin.instructions
    && same(old.assembly.map(i => commaNormalize(`${i.address}: ${i.text}`)), v.assembly.map(commaNormalize)), `${pin.name} assembly parity differs`);
  const addresses = new Set(); let last = -1;
  for (const i of old.assembly) {
    assert(/^0x[0-9a-f]+$/u.test(i.address) && Number(i.address) - entry === i.offset && i.offset > last && /^[0-9a-f]+$/iu.test(i.bytes) && i.bytes.length % 2 === 0,
      `${pin.name} original instruction structure differs`);
    const b = Buffer.from(i.bytes, 'hex');
    assert(b.length > 0 && b.length <= 15 && i.offset + b.length <= payload.length && b.equals(payload.subarray(i.offset, i.offset + b.length)), `${pin.name} original instruction bytes differ`);
    last = i.offset; addresses.add(i.address);
  }
  assert(v.basic_blocks.length === pin.blocks && new Set(v.basic_blocks.map(b => b.start)).size === pin.blocks, `${pin.name} CFG count differs`);
  for (const b of v.basic_blocks) {
    assert(addresses.has(b.start) && Number(b.end) > Number(b.start) && Number(b.end) <= entry + pin.body
      && b.successors.every(a => v.basic_blocks.some(target => target.start === a)), `${pin.name} CFG extent or successor differs`);
  }
  assert(v.outgoing_references.length === pin.refs && v.outgoing_references.filter(r => r.kind.conditional && r.kind.jump).length === pin.conditional,
    `${pin.name} reference counts differ`);
  assert(v.callers.length === 0 && v.callees.length === 0, `${pin.name} resolved caller/callee inventory differs`);
  for (const r of v.outgoing_references) assert(addresses.has(r.source_address), `${pin.name} reference source outside original instructions`);
  const flow = v.native_value_flow;
  assert(flow.available && flow.operations.length === pin.pcode && flow.def_use.length === pin.defuse && flow.truncated === false
    && flow.omitted_operations_lower_bound === 0 && flow.known_omitted_inputs === 0 && flow.known_omitted_edges === 0, `${pin.name} p-code completeness differs`);
  const operations = new Map(flow.operations.map(o => [o.id, o]));
  assert(operations.size === pin.pcode, `${pin.name} duplicated p-code operation IDs`);
  for (const o of flow.operations) assert(addresses.has(o.address) && o.id === `${o.address}#${o.sequence}`
    && Number.isInteger(o.sequence) && o.inputs.length <= 64, `${pin.name} p-code operation structure differs`);
  for (const edge of flow.def_use) assert(operations.has(edge.definition) && operations.has(edge.use)
    && Number.isInteger(edge.input_index) && edge.input_index >= 0 && edge.input_index < operations.get(edge.use).inputs.length,
  `${pin.name} def-use edge is not readable in retained operations`);
  for (const effect of flow.effects) assert(operations.has(effect.operation), `${pin.name} effect references missing retained operation`);
  const calls = v.assembly.filter(i => /: CALL /u.test(i)); assert(calls.length === pin.calls, `${pin.name} CALL count differs`);
  return { body: { ranges: body.ranges, bytes: body.total_bytes, copiedPayloadBytes: payload.length, excludedPayloadBytes: payload.length - body.total_bytes },
    instructions: pin.instructions, originalInstructionBytesVerified: true, commaWhitespaceOnlyAssemblyParity: true,
    cfg: { basicBlocks: pin.blocks, conditionalJumpReferences: pin.conditional, projection: projection(v.basic_blocks) },
    references: { outgoing: pin.refs, incoming: v.incoming_references.length, resolvedCallers: 0, resolvedCallees: 0, projection: projection(v.outgoing_references) },
    calls: { instructions: pin.calls, instructionProjection: projection(calls) },
    pcode: { operations: pin.pcode, defUseEdges: pin.defuse, effects: flow.effects.length, truncated: false,
      omittedOperationsLowerBound: 0, knownOmittedInputs: 0, knownOmittedEdges: 0, projection: projection(flow) },
    pseudocode: { ...projection(v.pseudocode), originalSource: false, nativeLispAbiEstablished: false } };
}
export async function deriveReaPayloadAnalysisEvidence() {
  sources.clear();
  read(fileURLToPath(import.meta.url));
  read('research/introspection/rea-payload-analysis.md');
  read('research/tools/prepare-rea-payload-pe.mjs');
  const cfg = json('research/artifacts/rea-tools/toolchain-current.json');
  assert(cfg.reaVersion === '6.4.0' && cfg.reaCli === resolve(ROOT, PKG, 'scripts/rea.mjs')
    && cfg.ghidra === resolve(ROOT, 'research/artifacts/rea-tools/ghidra_12.1.4_PUBLIC')
    && cfg.javaHome === resolve(ROOT, 'research/artifacts/rea-tools/jdk-21.0.12.1+1'), 'Current toolchain paths differ');
  const pkg = json(`${PKG}/package.json`), manifest = json(`${PKG}/native/windows/build/manifest.json`);
  assert(pkg.name === 'rea-agents' && pkg.version === '6.4.0' && manifest.packageVersion === '6.4.0'
    && manifest.platform === 'win32' && manifest.architecture === 'x64' && manifest.artifactSha256 === HASHES.addon, 'REA package/native manifest differs');
  read(`${PKG}/native/windows/build/${manifest.artifact}`, HASHES.addon);
  const lock = json('research/artifacts/rea-tools/rea-6.4.0/package-lock.json');
  assert(lock.packages['node_modules/rea-agents'].version === '6.4.0'
    && lock.packages['node_modules/rea-agents'].integrity === cfg.npmIntegrity, 'REA installed lockfile integrity differs');
  for (const p of ['scripts/rea.mjs', 'dist/cli.js', 'dist/cli/coreBinaryCommands.js', 'dist/cli/coreNativeCommands.js',
    'dist/domain/evidence.js', 'dist/domain/analysisProfile.js', 'dist/domain/canonicalDigest.js', 'dist/domain/canonicalJsonDigestSteps.js',
    'dist/ghidra/GhidraClientStartup.js', 'dist/ghidra/GhidraProviderClient.js', 'bridge/ghidra/ReaGhidraBridge.java', 'bridge/ghidra/ReaGhidraApplySeeds.java']) read(`${PKG}/${p}`);
  const { parseEvidence } = await import(pathToFileURL(resolve(ROOT, PKG, 'dist/domain/evidence.js')).href);
  const ghidraProperties = read(relative(ROOT, resolve(cfg.ghidra, 'Ghidra/application.properties'))).toString();
  assert(/^application.version=12\.1\.4\r?$/mu.test(ghidraProperties), 'Ghidra version differs');
  read(relative(ROOT, resolve(cfg.ghidra, 'support/analyzeHeadless.bat')));
  const javaRelease = read(relative(ROOT, resolve(cfg.javaHome, 'release'))).toString();
  assert(javaRelease.includes('JAVA_RUNTIME_VERSION="21.0.12.1+1-LTS"') && javaRelease.includes('OS_ARCH="x86_64"'), 'Java identity differs');
  read(relative(ROOT, resolve(cfg.javaHome, 'bin/java.exe'))); read(cfg.node, null, 'local-node-runtime/node.exe');
  read(`${LOCAL}/build-and-query.mjs`); read(`${LOCAL}/summarize-and-followup.mjs`);
  const bindings = json(`${LOCAL}/synthetic-bindings.json`, HASHES.bindings);
  assert(bindings.length === CASES.length, 'Synthetic binding count differs');
  const pll = read('research/extracted/aaron/application/AARON.pll', HASHES.pll);
  const reports = [];
  function evidence(path, binding, operation, parameters, expectedHash) {
    const e = parseEvidence(json(path, expectedHash));
    assert(e.subject.format === 'pe' && e.subject.architecture === 'x86' && e.subject.digest.sha256 === binding.syntheticPeSha256
      && e.subject.local_path === binding.syntheticPePath && e.subject.name === binding.syntheticPePath, `${operation} subject differs`);
    assert(same(e.provider, { id: 'ghidra', name: 'Ghidra', version: '12.1.4' }) && e.operation === operation
      && same(e.parameters, parameters) && e.authority === 'shipped-artifact' && e.confidence === 'observed', `${operation} provider/operation differs`);
    const p = e.analysis_profile.parameters, seedPath = resolve(ROOT, LOCAL, binding.name.toLowerCase() + '.seeds.tsv');
    assert(p.architecture === 'x86' && p.target_format === 'pe' && p.import_mode === 'ephemeral-source-immutable'
      && p.language_id === 'x86:LE:32:default' && p.compiler_spec_id === 'windows' && p.language_selection === 'configured-v1'
      && p.no_return_repair === 'disabled-windows-p0' && p.analysis_seeds.path === seedPath
      && p.analysis_seeds.configured_path === seedPath && p.analysis_seeds.sha256 === sha(read(seedPath))
      && same(p.analysis_seeds.entries, { function: 1, code: 0, label: 0 }), `${operation} configured analysis profile differs`);
    return e;
  }
  for (const [index, pin] of CASES.entries()) {
    const b = bindings[index], stem = pin.name.toLowerCase(), mapPath = `research/extracted/local-oracle/${pin.run}/native-code/mapped/native-code-map.json`;
    assert(b.name === pin.name && b.mapPath === resolve(ROOT, mapPath) && b.assertedEntry === pin.entry, `${pin.name} archived binding identity differs`);
    const map = json(mapPath, b.mapSha256), f = map.functions.find(f => f.name === pin.name);
    assert(map.pll.sha256 === HASHES.pll && map.pll.bytes === pll.length && f.uniqueCompleteObjectByteMatch === true
      && f.runtime.entry === pin.entry && f.payloadBytes === pin.payload && f.payloadSha256 === pin.hash, `${pin.name} archived native map differs`);
    const payloadPath = resolve(ROOT, dirname(mapPath), f.payloadFile), payload = read(payloadPath, pin.hash);
    assert(b.originalPayload === payloadPath && b.originalPayloadSha256 === pin.hash && b.originalPayloadBytes === pin.payload
      && b.originalPllSha256 === HASHES.pll && b.pllPayloadOffset === f.pll.payloadOffset && b.pllRawEnd === f.pll.rawEnd
      && payload.length === pin.payload && payload.equals(pll.subarray(f.pll.payloadOffset, f.pll.rawEnd)), `${pin.name} exact PLL payload slice differs`);
    assert(f.pll.payloadOffset === f.pll.objectOffset + 4 && f.objectBytes === pin.payload + 4
      && sha(pll.subarray(f.pll.objectOffset, f.pll.rawEnd)) === f.objectSha256, `${pin.name} complete PLL object hash differs`);
    assert(b.syntheticPePath === resolve(ROOT, LOCAL, stem + '.synthetic.exe'), `${pin.name} generated target path differs`);
    const pe = read(b.syntheticPePath, b.syntheticPeSha256), wrapper = validatePe(pe, payload, b, pin);
    const seed = read(`${LOCAL}/${stem}.seeds.tsv`).toString();
    assert(seed === `${pin.entry}\tfunction\t${pin.name.replaceAll('-', '_')}\n`, `${pin.name} seed differs`);
    const preparedRoot = `${LOCAL}/prepared-${stem}-a`, prepared = json(`${preparedRoot}/${stem}.binding.json`);
    assert(prepared.schemaVersion === 1 && prepared.functionName === pin.name && prepared.sourceMap.sha256 === b.mapSha256
      && prepared.sourceMap.path === mapPath && prepared.originalPll.sha256 === HASHES.pll && prepared.originalPll.bytes === pll.length
      && prepared.originalPayload.sha256 === pin.hash && prepared.originalPayload.bytes === pin.payload
      && prepared.originalPayload.pllPayloadOffset === f.pll.payloadOffset && prepared.originalPayload.pllEndExclusive === f.pll.rawEnd
      && prepared.originalPayload.objectSha256 === f.objectSha256 && prepared.originalPayload.uniqueCompleteObjectMatch === true
      && prepared.generatedPe.sha256 === b.syntheticPeSha256 && prepared.generatedPe.entry === pin.entry
      && prepared.assertions.generatedExecutableRun === false, `${pin.name} reusable builder metadata differs`);
    assert(read(`${preparedRoot}/${stem}.synthetic.exe`).equals(pe)
      && read(`${preparedRoot}/${stem}.seeds.tsv`).toString() === seed, `${pin.name} reusable builder byte reproduction differs`);
    // Function query filenames use a historical shorter result stem.
    command(stem, 'function', pin.entry, b.syntheticPePath, cfg);
    const e = evidence(`${LOCAL}/${stem}.function.stdout.json`, b, 'analyze_function', { procedure: pin.entry }, pin.evidence);
    assert(same(e.raw_result.value, e.normalized_result), `${pin.name} normalized dossier differs`);
    const old = json(resolve(ROOT, dirname(mapPath), 'ghidra', stem + '.ghidra.json'));
    assert(old.subject.sha256 === pin.hash && old.subject.bytes === pin.payload && old.subject.format === 'raw'
      && old.entry === pin.entry && old.memoryBase === pin.entry && old.functionName === pin.name
      && old.languageId === 'x86:LE:32:default' && old.compilerSpecId === 'windows', `${pin.name} archived Ghidra identity differs`);
    const analysis = validateBody(e.raw_result.value, old, payload, pin);
    assert(read(`${LOCAL}/${stem}.pseudocode.c`).toString() === e.raw_result.value.pseudocode, `${pin.name} extracted pseudocode differs`);
    reports.push({ name: pin.name, capturedEntryContext: 'archived measured address reused solely for static analysis; not a current live address',
      entry: pin.entry, originalPayload: { path: portable(relative(ROOT, payloadPath)), sha256: pin.hash, bytes: pin.payload,
        pllOffset: f.pll.payloadOffset, pllEndExclusive: f.pll.rawEnd }, wrapper,
      reusableBuilder: { independentStaticContainerReproduced: true, exactPeBytesAndSeedMatchRetainedAnalysisInput: true,
        bindingPath: `${preparedRoot}/${stem}.binding.json` },
      rea: { evidenceId: e.evidence_id, evidenceFileSha256: pin.evidence, profileDigest: e.analysis_profile.digest,
        nativeProviderSessionCompleted: true, rawAuthority: e.authority, qualifiedAuthority: 'exact original payload bytes inside analyst-generated PE layout' }, analysis });
  }
  const b = bindings[0], xStem = 'zero-edge.branch-xrefs', cStem = 'zero-edge.first-call-targets';
  command(xStem, 'xrefs', '0x1fe03949', b.syntheticPePath, cfg);
  const x = evidence(`${LOCAL}/${xStem}.stdout.json`, b, 'xrefs', { address: '0x1fe03949' });
  assert(same(x.raw_result, ['0x1fe03944']) && same(x.normalized_result, x.raw_result), 'Actual ZERO-EDGE branch xrefs differ');
  command(cStem, 'resolve-native-call-targets', '0x1fe03946', b.syntheticPePath, cfg);
  const c = evidence(`${LOCAL}/${cStem}.stdout.json`, b, 'resolve_native_call_targets', { address: '0x1fe03946' });
  assert(c.raw_result.call_site === '0x1fe03946' && c.raw_result.procedure === CASES[0].entry && c.raw_result.status === 'unresolved'
    && c.raw_result.mechanism === 'computed' && same(c.raw_result.targets, []) && same(c.raw_result, c.normalized_result), 'Actual indirect call boundary differs');
  // Re-read every source before returning portable metadata. No buffers are retained.
  const sourceHashes = [...sources.values()].sort((a, b) => a.row.path.localeCompare(b.row.path)).map(({ absolute, row }) => {
    const b = readFileSync(absolute); assert(b.length === row.bytes && sha(b) === row.sha256, `Source changed during derivation: ${row.path}`); return row;
  });
  return { schemaVersion: 1, investigation: 'rea-6.4-exact-pll-payload-static-analysis-20261012',
    scope: { functions: 3, oracleRun: false, debuggerAttached: false, generatedExecutableRun: false, runtimeBehaviorEstablished: false,
      originalLispSourceRecovered: false, nativeLispAbiEstablished: false, liveAddressesEstablished: false, crossObjectCallerGraphRecovered: false },
    toolchain: { rea: '6.4.0', ghidra: '12.1.4', java: 'Temurin 21.0.12.1+1-LTS', nodeBinaryIdentityBound: true,
      nativeAddonSha256: HASHES.addon, packageIntegrity: cfg.npmIntegrity, language: 'x86:LE:32:default', compilerSpec: 'windows' },
    functions: reports,
    queries: { branchXrefs: { evidenceId: x.evidence_id, address: '0x1fe03949', sources: ['0x1fe03944'] },
      indirectCall: { evidenceId: c.evidence_id, callSite: c.raw_result.call_site, status: 'unresolved', mechanism: 'computed', targets: [] } },
    limitations: ['PE headers, layout and seeded names are analyst assertions, not discovered original executable metadata.',
      'REA raw shipped-artifact authority is qualified: the actual analysis subjects are generated static PE wrappers containing verified original payloads.',
      'Ghidra function bodies exclude trailing payload bytes; counts and CFG describe inferred bodies only.',
      'P-code and types are decompiler observations, not original Lisp or a verified Lisp ABI.',
      'Isolated containers omit the runtime object graph; unresolved indirect calls and zero callers do not establish absence of application calls.',
      'Retained CLI evidence is authenticated by REA canonical digests and exact file hashes; this offline derivation does not rerun native sessions.'],
    sourceHashes };
}
async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 2 && args[0] === '--output' && args[1], 'Usage: node research/tools/derive-rea-payload-analysis-evidence.mjs --output <fresh-ignored-json-under-deeper-rea-root>');
  const output = resolve(ROOT, args[1]); assert(inside(resolve(ROOT, LOCAL), output) && !existsSync(output), 'Output must be fresh inside the ignored deeper REA root');
  const ignored = spawnSync('git', ['check-ignore', '--quiet', '--', portable(relative(ROOT, output))], { cwd: ROOT, encoding: 'utf8' });
  assert(!ignored.error && ignored.status === 0, `Output ignore check failed: ${ignored.error?.message ?? ignored.stderr}`);
  const evidence = await deriveReaPayloadAnalysisEvidence();
  const bytes = Buffer.from(JSON.stringify(evidence, null, 2) + '\n'); writeFileSync(output, bytes, { flag: 'wx' });
  process.stdout.write(JSON.stringify({ output: portable(relative(ROOT, output)), sha256: sha(bytes), bytes: bytes.length, sourceCount: evidence.sourceHashes.length, functions: 3 }, null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { process.stderr.write(`${e.stack}\n`); process.exitCode = 1; });
