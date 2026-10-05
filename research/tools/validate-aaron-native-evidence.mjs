// Rederive complete object matches and bind instruction bytes and REA records.
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { mapCapturedFunctions } from './map-native-code-to-pll.mjs';
import { sha256 } from './index-allegro-image.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
export function validateAaronNativeEvidence(root, { names, metadataName, marker, probePath, ghidraDirectory = 'ghidra' }) {
  const read = p => readFileSync(resolve(root, p));
  const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
  const summary = json('summary.json'), manifest = json('native-code/manifest.json');
  const mapped = json('native-code/mapped/native-code-map.json');
  const rederived = mapCapturedFunctions(manifest, file => {
    assert(basename(file) === file && /^[a-z0-9-]+\.native-window\.bin$/.test(file), 'Invalid window filename');
    return read(`native-code/${file}`);
  }, read('runtime/AARON.pll'));
  const { captureManifestSha256, ...persistedMap } = mapped;
  assert(isDeepStrictEqual(rederived.report, persistedMap), 'Rederived live-window/PLL map differs');
  const metadata = read(`capture/${metadataName}`), metadataText = metadata.toString('utf8');
  assert(metadataText.startsWith(`BEGIN ${marker}`) && metadataText.trimEnd().endsWith(`END ${marker}`)
    && /ERROR-COUNT 0\b/.test(metadataText) && new RegExp(`TARGET-COUNT ${names.length}\\b`).test(metadataText), 'Incomplete native metadata');
  const probeSha256 = sha256(readFileSync(resolve(probePath)));
  assert(summary.complete === true && summary.probeOutputNames.includes(metadataName)
    && summary.preSceneProbeSha256 === probeSha256 && sha256(read('capture/aaron-pre-scene-probe.cl')) === probeSha256
    && manifest.metadataSha256 === sha256(metadata) && captureManifestSha256 === sha256(read('native-code/manifest.json')),
    'Native probe/metadata/manifest binding differs');
  const functions = mapped.functions.map(f => {
    const reportPath = `native-code/mapped/${ghidraDirectory}/${f.name.toLowerCase()}.ghidra.json`;
    const report = json(reportPath), payload = read(`native-code/mapped/${f.payloadFile}`);
    assert(names.includes(f.name) && f.uniqueCompleteObjectByteMatch === true && payload.equals(rederived.payloads.get(f.name))
      && sha256(payload) === f.payloadSha256 && payload.length === f.payloadBytes
      && report.subject.sha256 === f.payloadSha256 && report.subject.bytes === f.payloadBytes
      && report.functionName === f.name && report.entry === f.runtime.entry && report.memoryBase === f.runtime.entry
      && report.languageId === 'x86:LE:32:default' && report.compilerSpecId === 'windows'
      && report.disassembledInstructions === report.assembly.length && report.decompilation.completed === true, 'Native/report binding differs');
    const covered = new Set();
    for (const instruction of report.assembly) {
      assert(Number.isSafeInteger(instruction.offset) && instruction.offset >= 0 && /^[0-9a-f]+$/i.test(instruction.bytes)
        && instruction.bytes.length % 2 === 0 && instruction.bytes.length >= 2 && instruction.bytes.length <= 30
        && /^0x[0-9a-f]{1,8}$/i.test(instruction.address)
        && Number.parseInt(instruction.address, 16) === Number.parseInt(f.runtime.entry, 16) + instruction.offset, 'Invalid instruction address/bytes');
      const bytes = Buffer.from(instruction.bytes, 'hex');
      assert(instruction.offset + bytes.length <= payload.length
        && payload.subarray(instruction.offset, instruction.offset + bytes.length).equals(bytes), 'Instruction differs from payload');
      for (let offset = instruction.offset; offset < instruction.offset + bytes.length; offset++) {
        assert(!covered.has(offset), 'Overlapping instructions'); covered.add(offset);
      }
    }
    const prefix = `native-code/mapped/${ghidraDirectory}/${f.name.toLowerCase()}`;
    const bundle = json(`${prefix}.rea-bundle.json`), exported = json(`${prefix}.rea-export.json`), imported = json(`${prefix}.rea-import.json`);
    const record = bundle.records?.[0];
    assert(bundle.records?.length === 1 && exported.records?.length === 1 && imported.imported === 1 && imported.unknowns_added === 0
      && isDeepStrictEqual(record, exported.records[0]) && record.provider.id === 'ghidra-standalone'
      && record.subject.digest.sha256 === f.payloadSha256 && record.parameters.rea_native_provider_session === false
      && record.normalized_result.provenance.rea_native_provider_session === false
      && record.normalized_result.provenance.source_report_sha256 === sha256(read(reportPath))
      && isDeepStrictEqual(record.raw_result, report), 'REA canonical evidence binding differs');
    return { name: f.name, runtime: f.runtime, pll: f.pll, payloadBytes: f.payloadBytes, payloadSha256: f.payloadSha256,
      objectSha256: f.objectSha256, uniqueCompleteObjectByteMatch: true, reportSha256: sha256(read(reportPath)),
      instructionCount: report.disassembledInstructions, instructionBytesCompared: covered.size,
      rea: { version: '3.2.1', evidenceId: record.evidence_id, provider: record.provider, nativeProviderSession: false,
        bundleSha256: sha256(read(`${prefix}.rea-bundle.json`)), canonicalExportSha256: sha256(read(`${prefix}.rea-export.json`)), importResult: imported } };
  });
  assert(functions.length === names.length && names.every(name => functions.some(f => f.name === name)), 'Missing native target');
  return { metadataSha256: sha256(metadata), probeSha256, mapSha256: sha256(read('native-code/mapped/native-code-map.json')),
    manifestSha256: sha256(read('native-code/manifest.json')), pll: mapped.pll, functions, liveWindowPllMatchesRederived: true,
    scope: 'Unique complete object bytes and every decoded instruction validated; external Ghidra evidence through REA, not a native REA provider session' };
}
