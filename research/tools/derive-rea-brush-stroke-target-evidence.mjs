#!/usr/bin/env node
// Offline evidence validation only. Never starts REA, Ghidra, AARON or a generated PE.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = 'research/artifacts/rea-tools/brush-stroke-value0-20261012';
const XREF_43613 = 'research/artifacts/rea-tools/brush-stroke-value0-xref-43613-20261012-f';
const XREF_43639 = 'research/artifacts/rea-tools/brush-stroke-value0-xref-43639-20261012-e';
const XREF_436E5_D3 = 'research/artifacts/rea-tools/brush-stroke-value0-xrefs-436e5-436d3-20261012-95c3f4d553';
const MAP = 'research/extracted/local-oracle/brush-stroke-native-seed1234-20261005-e/native-code/mapped/native-code-map.json';
const PKG = 'research/artifacts/rea-tools/rea-6.4.0/node_modules/rea-agents';
const PIN = Object.freeze({
  map: '790523f2eea2f2e02afd674a596b7751f3155fc302bc4ac0b236ddd8d53dc786',
  pll: '7ffc7dc9e3e62b1c5ba3612630b8747778324fa674dac42916be3e90bb96504c',
  payload: '606194172353e20194922a1f13ed853e48455f523d635cf07a43cd01d1a9bc0e',
  object: '0a7b4eee047c44db689dcc460789d982c14b85f01348839b4b6e05862fbefcf2',
  pe: '39e28d5b7ce2ad23da01f48077f0640730556c57af4adbd108a39d24a1dae554',
  seed: '0f11c721dd4a82265bb598f9f851b708cb8bfb5c17da5c384e55e5c2039c56d7',
  function: '91ff1611397ad2eec38cba4aab6ed9bfacbe71b76a971f5b3af5e33b5f083160',
  xrefs: 'b394322e825f570d65a2fb2f03f4c198c79f56643513588cb2b9fae0845f57c5',
  call: 'f47154107415875c7fab7553c9513b99d2fe0b4af9234b19e7d48fc07719ad07',
  xrefs43613: '48cbee7cefe85d692e855fe7955572e9fe7ef160a4f9a0275764db9bb3f7a0a8',
  xrefs43639: 'd7fe2389efed704c3fbf169b133a17cf684d4f8515b5d277ab4bc67ad12a2163',
  xrefs436e5: 'a1a9eb07082947418550ec90b46f70c519d11a1888c2d6a05c72efe3ccc62345',
  xrefs436d3: '927f310873497206ef2478ffa28d8123593259a6502195d588a10ae9973bc54c',
  addon: 'c4fd9f377e567bcf15ba3fec3e0b0ed965d82b765a2adcdac49e46f14524b6d5',
});
const sources = new Map();
const assert = (condition, message) => { if (!condition) throw Error(message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = path => path.replaceAll('\\', '/');
const inside = (base, path) => {
  const rel = relative(base, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
function assertSafeOutputParent(output) {
  const root = resolve(ROOT), realRoot = realpathSync(root), parent = dirname(output);
  assert(existsSync(parent), 'Output parent directory must already exist');
  let cursor = resolve(parent);
  while (true) {
    const rel = relative(root, cursor);
    assert(cursor.toLowerCase() === root.toLowerCase()
      || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)),
    `Output parent escapes repository: ${cursor}`);
    assert(!lstatSync(cursor).isSymbolicLink(), `Output parent contains a symlink/junction: ${cursor}`);
    const real = realpathSync(cursor);
    assert(real.toLowerCase() === realRoot.toLowerCase() || inside(realRoot, real),
      `Output parent resolves outside repository: ${cursor}`);
    if (cursor.toLowerCase() === root.toLowerCase()) break;
    const next = dirname(cursor);
    assert(next !== cursor, `Could not validate output ancestry: ${cursor}`);
    cursor = next;
  }
}
const projection = value => {
  const bytes = Buffer.from(JSON.stringify(value));
  return { sha256: sha(bytes), bytes: bytes.length };
};
function read(path, expected, externalLabel) {
  const absolute = resolve(ROOT, path);
  assert(inside(ROOT, absolute) || externalLabel, `Input escapes repository: ${path}`);
  const bytes = readFileSync(absolute), label = externalLabel ?? portable(relative(ROOT, absolute));
  assert(!expected || sha(bytes) === expected, `Source hash differs: ${label}`);
  const row = { path: label, sha256: sha(bytes), bytes: bytes.length };
  const prior = sources.get(label);
  assert(!prior || same(prior.row, row), `Source changed: ${label}`);
  sources.set(label, { absolute, row });
  return bytes;
}
function json(path, expected) {
  return JSON.parse(read(path, expected).toString('utf8').replace(/^\uFEFF/u, ''));
}
function validatePe(pe, payload, binding, entry) {
  assert(pe.length >= 512 && pe.toString('ascii', 0, 2) === 'MZ'
    && pe.readUInt32LE(60) === 128 && pe.toString('ascii', 128, 132) === 'PE\0\0', 'Generated PE signature differs');
  const coff = 132, optional = 152, section = 376, base = Math.floor(Number(entry) / 65536) * 65536;
  const rva = Math.floor((Number(entry) - base) / 4096) * 4096;
  const prefix = Number(entry) - base - rva, size = prefix + payload.length, rawSize = Math.ceil(size / 512) * 512;
  assert(pe.readUInt16LE(coff) === 0x14c && pe.readUInt16LE(coff + 2) === 1
    && pe.readUInt16LE(coff + 16) === 224 && pe.readUInt16LE(coff + 18) === 0x102, 'Generated PE COFF header differs');
  assert(pe.readUInt16LE(optional) === 0x10b && pe.readUInt32LE(optional + 4) === rawSize
    && pe.readUInt32LE(optional + 16) === Number(entry) - base && pe.readUInt32LE(optional + 20) === rva
    && pe.readUInt32LE(optional + 28) === base && pe.readUInt32LE(optional + 32) === 4096
    && pe.readUInt32LE(optional + 36) === 512 && pe.readUInt32LE(optional + 56) === Math.ceil((rva + size) / 4096) * 4096
    && pe.readUInt32LE(optional + 60) === 512 && pe.readUInt16LE(optional + 68) === 3
    && pe.readUInt32LE(optional + 92) === 16, 'Generated PE optional header differs');
  assert(pe.subarray(optional + 96, optional + 224).every(byte => byte === 0), 'Generated PE directories are not empty');
  assert(pe.toString('ascii', section, section + 8).replace(/\0/gu, '') === '.text'
    && pe.readUInt32LE(section + 8) === size && pe.readUInt32LE(section + 12) === rva
    && pe.readUInt32LE(section + 16) === rawSize && pe.readUInt32LE(section + 20) === 512
    && pe.readUInt32LE(section + 36) === 0x60000020 && pe.length === 512 + rawSize, 'Generated PE section differs');
  const payloadOffset = 512 + prefix;
  assert(binding.generatedPe.imageBase === `0x${base.toString(16)}` && binding.generatedPe.sectionRva === rva
    && binding.generatedPe.entry === entry && binding.generatedPe.copiedPayloadFileOffset === payloadOffset
    && payload.equals(pe.subarray(payloadOffset, payloadOffset + payload.length))
    && pe.subarray(512, payloadOffset).every(byte => byte === 0)
    && pe.subarray(payloadOffset + payload.length).every(byte => byte === 0), 'Generated PE payload/layout differs');
  return { headerAndLayout: 'analyst assertions', imageBase: `0x${base.toString(16)}`, sectionRva: rva,
    entry, copiedPayloadFileOffset: payloadOffset, copiedPayloadBytes: payload.length,
    generatedExecutableWasNotRun: true };
}
async function derive() {
  sources.clear();
  read('research/tools/derive-rea-brush-stroke-target-evidence.mjs');
  read('research/tools/prepare-rea-payload-pe.mjs');
  read('research/introspection/rea-payload-analysis.md');
  assert(read('.gitignore').toString('utf8').split(/\r?\n/u).includes('/research/artifacts/'),
    'REA artifact output root is not explicitly ignored');
  const map = json(MAP, PIN.map), binding = json(`${LOCAL}/brush-stroke.binding.json`);
  const pll = read('research/extracted/aaron/application/AARON.pll', PIN.pll);
  const functionRows = map.functions.filter(row => row.name === 'BRUSH-STROKE');
  assert(functionRows.length === 1, 'BRUSH-STROKE map entry is not unique');
  const fn = functionRows[0];
  assert(map.pll.sha256 === PIN.pll && map.pll.bytes === pll.length && fn
    && fn.runtime.entry === '0x1fe435c4' && fn.payloadBytes === 564 && fn.payloadSha256 === PIN.payload
    && fn.uniqueCompleteObjectByteMatch === true && fn.objectSha256 === PIN.object, 'Archived BRUSH-STROKE map differs');
  const payloadPath = `research/extracted/local-oracle/brush-stroke-native-seed1234-20261005-e/native-code/mapped/${fn.payloadFile}`;
  const payload = read(payloadPath, PIN.payload);
  const completeObject = pll.subarray(fn.pll.objectOffset, fn.pll.rawEnd);
  assert(fn.pll.payloadOffset === 2766276 && fn.pll.rawEnd === 2766840
    && fn.pll.payloadOffset === fn.pll.objectOffset + 4 && fn.objectBytes === 568
    && completeObject.length === 568 && sha(completeObject) === PIN.object
    && pll.indexOf(completeObject) === fn.pll.objectOffset && pll.lastIndexOf(completeObject) === fn.pll.objectOffset
    && payload.equals(pll.subarray(fn.pll.payloadOffset, fn.pll.rawEnd)), 'Exact PLL object/payload binding differs');
  assert(binding.schemaVersion === 1 && binding.functionName === 'BRUSH-STROKE'
    && binding.sourceMap.sha256 === PIN.map && binding.originalPll.sha256 === PIN.pll
    && binding.originalPayload.sha256 === PIN.payload && binding.originalPayload.bytes === 564
    && binding.originalPayload.uniqueCompleteObjectMatch === true && binding.generatedPe.sha256 === PIN.pe
    && binding.assertions.generatedExecutableRun === false, 'Builder binding differs');
  const pePath = `${LOCAL}/brush-stroke.synthetic.exe`, pe = read(pePath, PIN.pe);
  assert(binding.generatedPe.file === 'brush-stroke.synthetic.exe' && binding.generatedPe.bytes === pe.length,
    'Generated PE identity differs');
  const wrapper = validatePe(pe, payload, binding, fn.runtime.entry);
  const seedPath = `${LOCAL}/brush-stroke.seeds.tsv`, seed = read(seedPath, PIN.seed).toString('utf8');
  assert(seed === '0x1fe435c4\tfunction\tBRUSH_STROKE\n', 'REA analysis seed differs');

  const cfg = json('research/artifacts/rea-tools/toolchain-current.json');
  assert(cfg.reaVersion === '6.4.0' && cfg.reaCli === resolve(ROOT, PKG, 'scripts/rea.mjs'), 'Current REA path/version differs');
  const pkg = json(`${PKG}/package.json`), lock = json('research/artifacts/rea-tools/rea-6.4.0/package-lock.json');
  assert(pkg.name === 'rea-agents' && pkg.version === '6.4.0'
    && lock.packages['node_modules/rea-agents'].version === '6.4.0'
    && lock.packages['node_modules/rea-agents'].integrity === cfg.npmIntegrity, 'REA package lock differs');
  const manifest = json(`${PKG}/native/windows/build/manifest.json`);
  assert(manifest.artifactSha256 === PIN.addon && manifest.packageVersion === '6.4.0'
    && manifest.platform === 'win32' && manifest.architecture === 'x64', 'REA native manifest differs');
  read(`${PKG}/native/windows/build/${manifest.artifact}`, PIN.addon);
  for (const path of ['scripts/rea.mjs', 'dist/cli.js', 'dist/domain/evidence.js', 'dist/domain/canonicalDigest.js',
    'dist/domain/canonicalJsonDigestSteps.js', 'dist/domain/analysisProfile.js', 'dist/ghidra/GhidraProviderClient.js',
    'bridge/ghidra/ReaGhidraBridge.java']) read(`${PKG}/${path}`);
  const ghidraProperties = read(relative(ROOT, resolve(cfg.ghidra, 'Ghidra/application.properties'))).toString('utf8');
  assert(/^application\.version=12\.1\.4\r?$/mu.test(ghidraProperties), 'Ghidra version differs');
  const javaRelease = read(relative(ROOT, resolve(cfg.javaHome, 'release'))).toString('utf8');
  assert(javaRelease.includes('JAVA_RUNTIME_VERSION="21.0.12.1+1-LTS"')
    && javaRelease.includes('OS_ARCH="x86_64"'), 'Java identity differs');
  read(relative(ROOT, resolve(cfg.javaHome, 'bin/java.exe'))); read(cfg.node, null, 'local-node-runtime/node.exe');
  const { parseEvidence } = await import(pathToFileURL(resolve(ROOT, PKG, 'dist/domain/evidence.js')).href);
  const rawFunction = json(`${LOCAL}/rea-run-a/function.stdout.json`, PIN.function);
  const rawXrefs = json(`${LOCAL}/rea-run-b/xrefs-loop-target.stdout.json`, PIN.xrefs);
  const rawCall = json(`${LOCAL}/rea-run-b/resolve-call-4369e.stdout.json`, PIN.call);
  const rawXrefs43613 = json(`${XREF_43613}/stdout.json`, PIN.xrefs43613);
  const rawXrefs43639 = json(`${XREF_43639}/stdout.json`, PIN.xrefs43639);
  const rawXrefs436e5 = json(`${XREF_436E5_D3}/xrefs-436e5.stdout.json`, PIN.xrefs436e5);
  const rawXrefs436d3 = json(`${XREF_436E5_D3}/xrefs-436d3.stdout.json`, PIN.xrefs436d3);
  for (const stderr of [`${LOCAL}/rea-run-a/function.stderr.txt`, `${LOCAL}/rea-run-b/xrefs-loop-target.stderr.txt`,
    `${LOCAL}/rea-run-b/resolve-call-4369e.stderr.txt`, `${XREF_43613}/stderr.txt`, `${XREF_43639}/stderr.txt`,
    `${XREF_436E5_D3}/xrefs-436e5.stderr.txt`, `${XREF_436E5_D3}/xrefs-436d3.stderr.txt`])
    assert(read(stderr).length === 0, `${stderr} is not empty`);
  const evidence = [rawFunction, rawXrefs, rawCall, rawXrefs43613, rawXrefs43639, rawXrefs436e5, rawXrefs436d3].map(parseEvidence);
  const [f, x, c, x13, x39, xE5, xD3] = evidence;
  for (const e of evidence) assert(e.subject.format === 'pe' && e.subject.architecture === 'x86'
    && e.subject.digest.sha256 === PIN.pe && e.subject.local_path === resolve(ROOT, pePath)
    && e.subject.name === resolve(ROOT, pePath) && e.provider.id === 'ghidra'
    && e.provider.version === '12.1.4' && e.authority === 'shipped-artifact'
    && e.confidence === 'observed', 'REA evidence identity/provider differs');
  assert(evidence.every(e => e.analysis_profile.digest === f.analysis_profile.digest)
    && f.analysis_profile.digest === '964cd59a0448f72d7e815299f2352a149cae07865313cf519d616edd0b822823',
  'REA analysis-profile digest differs across queries');
  const profile = f.analysis_profile.parameters;
  assert(f.operation === 'analyze_function' && same(f.parameters, { procedure: fn.runtime.entry })
    && f.raw_result.value.procedure.address === fn.runtime.entry && f.raw_result.value.procedure.name === 'BRUSH_STROKE'
    && f.raw_result.value.procedure.classification.external === false && f.raw_result.value.procedure.classification.thunk === false,
  'REA function identity differs');
  assert(profile.architecture === 'x86' && profile.target_format === 'pe' && profile.import_mode === 'ephemeral-source-immutable'
    && profile.language_id === 'x86:LE:32:default' && profile.compiler_spec_id === 'windows'
    && profile.analysis_seeds.sha256 === PIN.seed && profile.analysis_seeds.path === resolve(ROOT, seedPath)
    && same(profile.analysis_seeds.entries, { function: 1, code: 0, label: 0 }), 'REA function profile/seed differs');
  assert(same(f.raw_result.value, f.normalized_result), 'Function raw/normalized result differs');
  assert(same(x.raw_result, x.normalized_result) && same(c.raw_result, c.normalized_result),
    'Follow-up raw/normalized result differs');

  const v = f.raw_result.value, body = v.procedure.body;
  assert(body.available && body.contains_entry && !body.non_contiguous && body.total_bytes === 555
    && body.span_bytes === 555 && same(body.ranges, [{ start: '0x1fe435c4', end: '0x1fe437ee' }])
    && v.assembly.length === 201 && v.basic_blocks.length === 47, 'REA function body/CFG differs');
  const oldPath = 'research/extracted/local-oracle/brush-stroke-native-seed1234-20261005-e/native-code/mapped/ghidra/brush-stroke.ghidra.json';
  const old = json(oldPath);
  assert(old.subject.sha256 === PIN.payload && old.subject.bytes === payload.length && old.subject.format === 'raw'
    && old.entry === fn.runtime.entry && old.memoryBase === fn.runtime.entry && old.functionName === 'BRUSH-STROKE'
    && old.languageId === 'x86:LE:32:default' && old.compilerSpecId === 'windows' && old.assembly.length === 201,
  'Prior raw Ghidra report identity differs');
  const commaNormalize = text => text.replace(/,\s*/gu, ', ');
  assert(same(old.assembly.map(i => commaNormalize(`${i.address}: ${i.text}`)), v.assembly.map(commaNormalize)),
    'REA/raw Ghidra instruction parity differs');
  let lastOffset = -1;
  for (const ins of old.assembly) {
    assert(Number(ins.address) - Number(fn.runtime.entry) === ins.offset && ins.offset > lastOffset
      && /^[0-9a-f]+$/iu.test(ins.bytes) && ins.bytes.length % 2 === 0, 'Original instruction offset/bytes malformed');
    const bytes = Buffer.from(ins.bytes, 'hex');
    assert(bytes.length > 0 && bytes.length <= 15 && ins.offset + bytes.length <= payload.length
      && bytes.equals(payload.subarray(ins.offset, ins.offset + bytes.length)), 'Instruction bytes differ from exact PLL payload');
    lastOffset = ins.offset;
  }
  const calls = v.assembly.filter(text => /^0x[0-9a-f]+: CALL /u.test(text));
  assert(calls.length === 35 && calls.includes('0x1fe4369e: CALL dword ptr [EDI + 0x57]')
    && v.outgoing_references.filter(ref => ref.kind.call).length === 0, 'BRUSH-STROKE CALL inventory/site differs');
  const flow = v.native_value_flow;
  assert(flow.available && flow.operations.length === 272 && flow.def_use.length === 248 && flow.truncated === false
    && flow.omitted_operations_lower_bound === 0 && flow.known_omitted_inputs === 0 && flow.known_omitted_edges === 0,
  'REA p-code completeness/counts differ');
  for (const block of v.basic_blocks) assert(Number(block.end) > Number(block.start)
    && block.successors.every(target => v.basic_blocks.some(candidate => candidate.start === target)), 'CFG successor is outside retained blocks');

  assert(x.operation === 'xrefs' && same(x.parameters, { address: '0x1fe436bd' })
    && same(x.raw_result, ['0x1fe43609']), 'REA BRUSH-STROKE branch xrefs differ');
  assert(x13.operation === 'xrefs' && same(x13.parameters, { address: '0x1fe43613' })
    && same(x13.raw_result, ['0x1fe436c8']), 'REA BRUSH-STROKE continuation xrefs differ');
  assert(x39.operation === 'xrefs' && same(x39.parameters, { address: '0x1fe43639' })
    && same(x39.raw_result, ['0x1fe43611', '0x1fe436ce']), 'REA BRUSH-STROKE join xrefs differ');
  assert(xE5.operation === 'xrefs' && same(xE5.parameters, { address: '0x1fe436e5' })
    && same(xE5.raw_result, ['0x1fe4367c']), 'REA BRUSH-STROKE 0x436e5 predecessor xref differs');
  assert(xD3.operation === 'xrefs' && same(xD3.parameters, { address: '0x1fe436d3' })
    && same(xD3.raw_result, ['0x1fe43675']), 'REA BRUSH-STROKE 0x436d3 predecessor xref differs');
  const branch = v.outgoing_references.find(ref => ref.source_address === '0x1fe43609'
    && ref.target_address === '0x1fe436bd' && ref.kind.conditional && ref.kind.jump);
  assert(branch, 'Function dossier lacks the queried conditional branch');
  const instruction = address => v.assembly.find(text => text.startsWith(`${address}:`));
  assert(instruction('0x1fe43602') === '0x1fe43602: MOV EBX, EAX'
    && instruction('0x1fe43604') === '0x1fe43604: OR EBX, EDX'
    && instruction('0x1fe43606') === '0x1fe43606: TEST BL, 0x3'
    && instruction('0x1fe43609') === '0x1fe43609: JNZ 0x1fe436bd'
    && instruction('0x1fe43611') === '0x1fe43611: JZ 0x1fe43639'
    && instruction('0x1fe43675') === '0x1fe43675: JNZ 0x1fe436d3'
    && instruction('0x1fe4367c') === '0x1fe4367c: JLE 0x1fe436e5'
    && instruction('0x1fe436c8') === '0x1fe436c8: JZ 0x1fe43613'
    && instruction('0x1fe436ce') === '0x1fe436ce: JMP 0x1fe43639',
  'BRUSH-STROKE local branch instructions differ');
  assert(c.operation === 'resolve_native_call_targets' && same(c.parameters, { address: '0x1fe4369e' })
    && c.raw_result.call_site === '0x1fe4369e' && c.raw_result.procedure === fn.runtime.entry
    && c.raw_result.status === 'unresolved' && c.raw_result.mechanism === 'computed'
    && same(c.raw_result.targets, []), 'REA BRUSH-STROKE call-target boundary differs');

  const sourceHashes = [...sources.values()].sort((a, b) => a.row.path.localeCompare(b.row.path)).map(({ absolute, row }) => {
    const bytes = readFileSync(absolute);
    assert(bytes.length === row.bytes && sha(bytes) === row.sha256, `Source changed during derivation: ${row.path}`);
    return row;
  });
  return {
    schemaVersion: 3,
    investigation: 'rea-6.4-brush-stroke-static-control-flow-20261012',
    scope: { oracleRun: false, debuggerAttached: false, generatedExecutableRun: false,
      runtimeBehaviorEstablished: false, originalLispSourceRecovered: false, nativeLispAbiEstablished: false,
      directCallerEstablished: false, liveAddressEstablished: false },
    sourceBinding: { functionName: 'BRUSH-STROKE', mapPath: MAP, mapSha256: PIN.map,
      pllSha256: PIN.pll, payloadSha256: PIN.payload, payloadBytes: payload.length,
      pllObjectOffset: fn.pll.objectOffset, pllPayloadOffset: fn.pll.payloadOffset,
      pllEndExclusive: fn.pll.rawEnd, objectSha256: PIN.object, uniqueCompleteObjectMatch: true,
      generatedPeSha256: PIN.pe, generatedPeBytes: pe.length, generatedWrapper: wrapper },
    toolchain: { rea: '6.4.0', ghidra: '12.1.4', java: 'Temurin 21.0.12.1+1-LTS',
      nativeAddonSha256: PIN.addon, packageIntegrity: cfg.npmIntegrity,
      language: 'x86:LE:32:default', compilerSpec: 'windows' },
    function: { evidenceId: f.evidence_id, profileDigest: f.analysis_profile.digest,
      procedure: v.procedure.name, entry: fn.runtime.entry, inferredBody: body.ranges,
      bodyBytes: body.total_bytes, payloadTailExcludedBytes: payload.length - body.total_bytes,
      instructions: v.assembly.length, rawGhidraInstructionParity: true,
      basicBlocks: v.basic_blocks.length, cfgProjection: projection(v.basic_blocks),
      conditionalJumpReferences: v.outgoing_references.filter(ref => ref.kind.conditional && ref.kind.jump).length,
      outgoingReferences: v.outgoing_references.length, outgoingReferenceProjection: projection(v.outgoing_references),
      callInstructions: calls.length, staticallyReferencedCallEdges: v.outgoing_references.filter(ref => ref.kind.call).length,
      pcodeOperations: flow.operations.length, defUseEdges: flow.def_use.length,
      pcodeTruncated: flow.truncated, omittedOperationsLowerBound: flow.omitted_operations_lower_bound,
      knownOmittedInputs: flow.known_omitted_inputs, knownOmittedEdges: flow.known_omitted_edges,
      pcodeProjection: projection(flow) },
    queries: {
      branchXrefs: { evidenceId: x.evidence_id, profileDigest: x.analysis_profile.digest,
        address: '0x1fe436bd', sources: ['0x1fe43609'],
        relation: 'conditional jump reference within the inferred function body' },
      branchNeighbors: [
        { evidenceId: x13.evidence_id, profileDigest: x13.analysis_profile.digest,
          address: '0x1fe43613', sources: ['0x1fe436c8'], instruction: instruction('0x1fe436c8') },
        { evidenceId: x39.evidence_id, profileDigest: x39.analysis_profile.digest,
          address: '0x1fe43639', sources: ['0x1fe43611', '0x1fe436ce'],
          instructions: [instruction('0x1fe43611'), instruction('0x1fe436ce')] },
        { evidenceId: xE5.evidence_id, profileDigest: xE5.analysis_profile.digest,
          address: '0x1fe436e5', sources: ['0x1fe4367c'], instruction: instruction('0x1fe4367c') },
        { evidenceId: xD3.evidence_id, profileDigest: xD3.analysis_profile.digest,
          address: '0x1fe436d3', sources: ['0x1fe43675'], instruction: instruction('0x1fe43675') },
      ],
      lowBitTest: { instructions: [instruction('0x1fe43602'), instruction('0x1fe43604'),
        instruction('0x1fe43606'), instruction('0x1fe43609')],
        machineCondition: 'JNZ when (EAX | EDX) & 3 is nonzero; register meanings are unresolved' },
      indirectCall: { evidenceId: c.evidence_id, profileDigest: c.analysis_profile.digest, callSite: '0x1fe4369e',
        instruction: 'CALL dword ptr [EDI + 0x57]', status: 'unresolved', mechanism: 'computed', targets: [] },
    },
    limitations: [
      'The archived entry address is static context, not a current live address.',
      'The PE headers, layout and seeded function name are analyst assertions; only the copied payload bytes are original.',
      'REA instruction, CFG and p-code outputs are Ghidra static-analysis results, not original Lisp source or a verified Lisp ABI.',
      'The xrefs queries are intra-container reference evidence. They do not identify register meanings, runtime branch outcomes, or a Lisp caller. The unresolved call query does not identify its runtime target.',
      'No runtime branch outcome, drawing behavior, map effect, RNG effect or VALUE=0 behavior is established by this static dossier.',
    ],
    sourceHashes,
  };
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 2 && args[0] === '--output' && args[1],
    'Usage: node research/tools/derive-rea-brush-stroke-target-evidence.mjs --output <fresh-json-path>');
  const output = resolve(ROOT, args[1]), label = portable(relative(ROOT, output));
  const allowed = label.startsWith(`${LOCAL}/`) || label.startsWith('research/introspection/evidence/');
  assert(allowed && inside(ROOT, output) && !existsSync(output), 'Output must be fresh beneath the REA artifact or evidence directory');
  assertSafeOutputParent(output);
  const evidence = await derive();
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  assert(!existsSync(output), 'Output appeared during derivation');
  assertSafeOutputParent(output);
  writeFileSync(output, bytes, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ output: label, sha256: sha(bytes), bytes: bytes.length,
    sources: evidence.sourceHashes.length, procedure: evidence.function.procedure,
    branchSource: evidence.queries.branchXrefs.sources[0],
    branchNeighborSources: evidence.queries.branchNeighbors.map(query => query.sources),
    callStatus: evidence.queries.indirectCall.status }, null, 2)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
}
