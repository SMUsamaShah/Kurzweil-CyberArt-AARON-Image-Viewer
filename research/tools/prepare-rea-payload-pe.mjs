#!/usr/bin/env node
// Creates a static analysis input only. Never invokes or executes the PE.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha = b => createHash('sha256').update(b).digest('hex');
const assert = (ok, message) => { if (!ok) throw Error(message); };
const portable = p => p.replaceAll('\\', '/');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const inside = (base, path) => { const r = relative(base, path); return r !== '' && r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r); };
const usage = 'Usage: node research/tools/prepare-rea-payload-pe.mjs --map <native-code-map.json> --function <exact-name> --pll <AARON.pll> --output-dir <fresh-directory-under-research/artifacts/rea-tools>';

export function prepareReaPayloadPe({ mapPath, functionName, pllPath, outputDirectory }) {
  const mapFile = resolve(ROOT, mapPath), pllFile = resolve(ROOT, pllPath), output = resolve(ROOT, outputDirectory);
  assert(inside(ROOT, mapFile) && inside(ROOT, pllFile), 'Original inputs must be inside the repository');
  assert(inside(resolve(ROOT, 'research/artifacts/rea-tools'), output) && !existsSync(output), 'Output directory must be fresh beneath research/artifacts/rea-tools');
  assert(/^[A-Z][A-Z0-9-]*$/u.test(functionName), 'Function name must be an exact uppercase archived name');
  const mapBytes = readFileSync(mapFile), map = JSON.parse(mapBytes.toString('utf8'));
  assert(map.schemaVersion === 1 && Array.isArray(map.functions), 'Unsupported native map');
  const matches = map.functions.filter(f => f.name === functionName); assert(matches.length === 1, 'Native map must contain exactly one selected function');
  const f = matches[0], pll = readFileSync(pllFile), payloadFile = resolve(dirname(mapFile), f.payloadFile);
  assert(inside(dirname(mapFile), payloadFile), 'Payload path must stay beneath the map directory');
  const payload = readFileSync(payloadFile), entry = Number(f.runtime.entry);
  assert(map.pll.bytes === pll.length && map.pll.sha256 === sha(pll), 'PLL hash/length differs from archived map');
  assert(f.uniqueCompleteObjectByteMatch === true && f.payloadBytes === payload.length && f.payloadSha256 === sha(payload)
    && /^0x[0-9a-f]+$/u.test(f.runtime.entry) && Number.isInteger(entry) && entry > 65536 && entry <= 0xffffffff,
  'Selected payload hash, length or archived entry differs');
  for (const value of [f.pll.objectOffset, f.pll.payloadOffset, f.pll.rawEnd]) assert(Number.isInteger(value) && value >= 0 && value <= pll.length, 'Invalid PLL offset');
  assert(f.pll.payloadOffset === f.pll.objectOffset + 4 && f.pll.rawEnd - f.pll.payloadOffset === payload.length
    && f.objectBytes === payload.length + 4 && payload.equals(pll.subarray(f.pll.payloadOffset, f.pll.rawEnd)), 'Exact selected PLL payload slice differs');
  const object = pll.subarray(f.pll.objectOffset, f.pll.rawEnd);
  assert(sha(object) === f.objectSha256 && pll.indexOf(object) === f.pll.objectOffset && pll.indexOf(object, f.pll.objectOffset + 1) === -1,
    'Selected complete object is not uniquely byte matched in PLL');
  let imageBase = Math.floor(entry / 65536) * 65536;
  let sectionRva = Math.floor((entry - imageBase) / 4096) * 4096;
  // A valid payload can begin in the first page of a 64 KiB address block.
  // Move only the analyst-generated image base down by one 64 KiB unit so
  // the copied section has a nonzero RVA while the original entry stays exact.
  if (sectionRva === 0) {
    assert(imageBase >= 65536, 'Selected payload has no lower aligned PE image base');
    imageBase -= 65536;
    sectionRva = Math.floor((entry - imageBase) / 4096) * 4096;
  }
  const prefix = entry - imageBase - sectionRva, virtualSize = prefix + payload.length, rawSize = Math.ceil(virtualSize / 512) * 512;
  assert(imageBase % 65536 === 0 && sectionRva >= 4096 && sectionRva % 4096 === 0
    && prefix >= 0 && payload.length > 0 && payload.length <= 16 * 1024 * 1024
    && imageBase + sectionRva + virtualSize <= 0x100000000, 'Selected payload cannot use the bounded PE layout');
  const pe = Buffer.alloc(512 + rawSize); pe.write('MZ'); pe.writeUInt32LE(128, 60); pe.write('PE\0\0', 128);
  const c = 132, o = 152, s = 376;
  pe.writeUInt16LE(0x14c, c); pe.writeUInt16LE(1, c + 2); pe.writeUInt16LE(224, c + 16); pe.writeUInt16LE(0x102, c + 18);
  pe.writeUInt16LE(0x10b, o); pe.writeUInt32LE(rawSize, o + 4); pe.writeUInt32LE(entry - imageBase, o + 16);
  pe.writeUInt32LE(sectionRva, o + 20); pe.writeUInt32LE(imageBase, o + 28); pe.writeUInt32LE(4096, o + 32); pe.writeUInt32LE(512, o + 36);
  pe.writeUInt16LE(4, o + 40); pe.writeUInt16LE(4, o + 48); pe.writeUInt32LE(Math.ceil((sectionRva + virtualSize) / 4096) * 4096, o + 56);
  pe.writeUInt32LE(512, o + 60); pe.writeUInt16LE(3, o + 68); pe.writeUInt32LE(0x100000, o + 72); pe.writeUInt32LE(4096, o + 76);
  pe.writeUInt32LE(0x100000, o + 80); pe.writeUInt32LE(4096, o + 84); pe.writeUInt32LE(16, o + 92);
  pe.write('.text', s); pe.writeUInt32LE(virtualSize, s + 8); pe.writeUInt32LE(sectionRva, s + 12); pe.writeUInt32LE(rawSize, s + 16);
  pe.writeUInt32LE(512, s + 20); pe.writeUInt32LE(0x60000020, s + 36); payload.copy(pe, 512 + prefix);
  const stem = functionName.toLowerCase(), peName = stem + '.synthetic.exe', seedName = stem + '.seeds.tsv';
  const seed = Buffer.from(`${f.runtime.entry}\tfunction\t${functionName.replaceAll('-', '_')}\n`);
  const metadata = { schemaVersion: 1, functionName,
    sourceMap: { path: portable(relative(ROOT, mapFile)), sha256: sha(mapBytes), bytes: mapBytes.length },
    originalPll: { path: portable(relative(ROOT, pllFile)), sha256: sha(pll), bytes: pll.length },
    originalPayload: { path: portable(relative(ROOT, payloadFile)), sha256: sha(payload), bytes: payload.length,
      pllObjectOffset: f.pll.objectOffset, pllPayloadOffset: f.pll.payloadOffset, pllEndExclusive: f.pll.rawEnd, objectSha256: sha(object), uniqueCompleteObjectMatch: true },
    generatedPe: { file: peName, sha256: sha(pe), bytes: pe.length, copiedPayloadFileOffset: 512 + prefix, copiedPayloadBytes: payload.length,
      imageBase: `0x${imageBase.toString(16)}`, sectionRva, entry: f.runtime.entry, generatedPrefixBytes: prefix, generatedSuffixBytes: rawSize - virtualSize },
    generatedSeed: { file: seedName, sha256: sha(seed), bytes: seed.length, functions: 1 },
    assertions: { headersAndLayout: 'analyst-generated static analysis input', seededName: 'analyst assertion from archived unique payload map',
      entryContext: 'archived measured address for static mapping; not a live process address', generatedExecutableRun: false },
    limitations: ['Never execute the generated PE.', 'Exact source payload bytes are preserved; generated headers and padding are not original artifact bytes.',
      'No native Lisp ABI, original-source or cross-object caller recovery is established.'] };
  // Finish all validation before exclusive output creation. Original sources remain read-only.
  for (const [path, hash] of [[mapFile, sha(mapBytes)], [pllFile, sha(pll)], [payloadFile, sha(payload)]]) assert(sha(readFileSync(path)) === hash, 'Original source changed during construction');
  mkdirSync(output, { recursive: false });
  writeFileSync(resolve(output, peName), pe, { flag: 'wx' }); writeFileSync(resolve(output, seedName), seed, { flag: 'wx' });
  writeFileSync(resolve(output, stem + '.binding.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
  return metadata;
}
function main() {
  const args = process.argv.slice(2), options = {};
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { process.stdout.write(usage + '\n'); return; }
  for (let n = 0; n < args.length; n += 2) {
    assert(['--map', '--function', '--pll', '--output-dir'].includes(args[n]) && args[n + 1] && !args[n + 1].startsWith('--') && !Object.hasOwn(options, args[n]), usage);
    options[args[n]] = args[n + 1];
  }
  assert(Object.keys(options).length === 4, usage);
  const result = prepareReaPayloadPe({ mapPath: options['--map'], functionName: options['--function'], pllPath: options['--pll'], outputDirectory: options['--output-dir'] });
  process.stdout.write(JSON.stringify({ outputDirectory: portable(relative(ROOT, resolve(ROOT, options['--output-dir']))), ...result.generatedPe }, null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) { try { main(); } catch (e) { process.stderr.write(`${e.stack}\n`); process.exitCode = 1; } }
