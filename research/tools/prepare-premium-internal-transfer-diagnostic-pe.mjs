#!/usr/bin/env node
// Prepare an explicitly diagnostic-only static REA input from one rejected
// PREMIUM internal-transfer capture. The synthetic PE is never executed.
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLCHAIN_ROOT = resolve(ROOT, 'research/artifacts/rea-tools');
const LOCAL_ORACLE_ROOT = resolve(ROOT, 'research/extracted/local-oracle');
const IMAGE_BASE = 0x10000000;
const SECTION_RVA = 0x1000;
const RAW_SECTION_OFFSET = 512;
const FILE_ALIGNMENT = 512;
const SECTION_ALIGNMENT = 4096;
const WINDOW_LENGTH = 256;
const EIP_OFFSET = 128;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = path => path.replaceAll('\\', '/');
const inside = (base, path) => {
  const rel = relative(base, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const repoRelative = path => portable(relative(ROOT, path));
const alignUp = (value, alignment) => Math.ceil(value / alignment) * alignment;
const hex32 = value => `0x${Number(value).toString(16).padStart(8, '0')}`;
const hex64 = value => `0x${BigInt(value).toString(16).padStart(16, '0')}`;

const usage = [
  'Usage: node research/tools/prepare-premium-internal-transfer-diagnostic-pe.mjs',
  '  --diagnostic <debugger-capture-diagnostic.json under research/extracted/local-oracle>',
  '  --output-dir <fresh directory under research/artifacts/rea-tools>',
].join('\n');

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return null;
  assert(args.length === 4, usage);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    assert(['--diagnostic', '--output-dir'].includes(key) && value
      && !value.startsWith('--') && !Object.hasOwn(options, key), usage);
    options[key] = value;
  }
  assert(Object.keys(options).length === 2, usage);
  return options;
}

function makePe(windowBytes) {
  const rawSize = alignUp(windowBytes.length, FILE_ALIGNMENT);
  const pe = Buffer.alloc(RAW_SECTION_OFFSET + rawSize);
  pe.write('MZ', 0, 'ascii');
  pe.writeUInt32LE(0x80, 60);
  pe.write('PE\0\0', 0x80, 'binary');
  const coff = 0x84;
  const optional = 0x98;
  const section = 0x178;
  pe.writeUInt16LE(0x014c, coff); // IMAGE_FILE_MACHINE_I386
  pe.writeUInt16LE(1, coff + 2);
  pe.writeUInt16LE(224, coff + 16);
  pe.writeUInt16LE(0x0102, coff + 18);
  pe.writeUInt16LE(0x010b, optional); // PE32
  pe.writeUInt32LE(rawSize, optional + 4);
  pe.writeUInt32LE(SECTION_RVA + EIP_OFFSET, optional + 16);
  pe.writeUInt32LE(SECTION_RVA, optional + 20);
  pe.writeUInt32LE(IMAGE_BASE, optional + 28);
  pe.writeUInt32LE(SECTION_ALIGNMENT, optional + 32);
  pe.writeUInt32LE(FILE_ALIGNMENT, optional + 36);
  pe.writeUInt16LE(4, optional + 40);
  pe.writeUInt16LE(4, optional + 48);
  pe.writeUInt32LE(alignUp(SECTION_RVA + windowBytes.length, SECTION_ALIGNMENT), optional + 56);
  pe.writeUInt32LE(RAW_SECTION_OFFSET, optional + 60);
  pe.writeUInt16LE(3, optional + 68);
  pe.writeUInt32LE(0x100000, optional + 72);
  pe.writeUInt32LE(SECTION_ALIGNMENT, optional + 76);
  pe.writeUInt32LE(0x100000, optional + 80);
  pe.writeUInt32LE(SECTION_ALIGNMENT, optional + 84);
  pe.writeUInt32LE(16, optional + 92);
  pe.write('.text', section, 'ascii');
  pe.writeUInt32LE(windowBytes.length, section + 8); // exact captured VirtualSize
  pe.writeUInt32LE(SECTION_RVA, section + 12);
  pe.writeUInt32LE(rawSize, section + 16);
  pe.writeUInt32LE(RAW_SECTION_OFFSET, section + 20);
  pe.writeUInt32LE(0x60000020, section + 36);
  windowBytes.copy(pe, RAW_SECTION_OFFSET);
  return pe;
}

export function prepareDiagnosticWindow({ diagnosticPath, outputDirectory }) {
  const diagnosticFile = resolve(ROOT, diagnosticPath);
  const output = resolve(ROOT, outputDirectory);
  const realLocalOracleRoot = realpathSync(LOCAL_ORACLE_ROOT);
  const localOracleRuns = resolve(LOCAL_ORACLE_ROOT, 'external-runs');
  const realOracleRuns = realpathSync(localOracleRuns);
  const expectedOracleRuns = resolve('C:\\AaronOracleRuns');
  const realToolchainRoot = realpathSync(TOOLCHAIN_ROOT);
  assert(inside(LOCAL_ORACLE_ROOT, diagnosticFile)
    && diagnosticFile.toLowerCase().endsWith(`${sep}debugger-capture-diagnostic.json`),
  'Diagnostic must be a debugger-capture-diagnostic.json under research/extracted/local-oracle');
  assert(statSync(diagnosticFile, { throwIfNoEntry: false })?.isFile(),
    'Diagnostic must be a regular file');
  const realDiagnostic = realpathSync(diagnosticFile);
  const diagnosticInLocalTree = inside(realLocalOracleRoot, realDiagnostic);
  const diagnosticInExternalRuns = inside(localOracleRuns, diagnosticFile)
    && inside(realOracleRuns, realDiagnostic);
  assert(realOracleRuns.toLowerCase() === expectedOracleRuns.toLowerCase(),
    'The documented external-runs junction must resolve to C:\\AaronOracleRuns');
  assert(diagnosticInLocalTree || diagnosticInExternalRuns,
    'Diagnostic must resolve beneath the local-oracle tree or its verified external-runs junction');
  assert(inside(TOOLCHAIN_ROOT, output) && !existsSync(output),
    'Output directory must be fresh and beneath research/artifacts/rea-tools');
  const outputParent = realpathSync(dirname(output));
  assert(outputParent.toLowerCase() === realToolchainRoot.toLowerCase()
    || inside(realToolchainRoot, outputParent),
  'Output parent must resolve beneath research/artifacts/rea-tools');

  const diagnosticBytes = readFileSync(diagnosticFile);
  const diagnosticHash = sha256(diagnosticBytes);
  const diagnostic = JSON.parse(diagnosticBytes.toString('utf8'));
  const raw = diagnostic.rawDebuggerResult;
  const window = raw?.targetWindow;
  assert(diagnostic.schemaVersion === 1
    && raw?.schema === 'aaron-premium-internal-transfer-breakpoint-v1'
    && raw.captureCompleted === false && raw.captureError,
  'Input must be an incomplete PREMIUM internal-transfer debugger diagnostic');
  assert(raw.call?.hit === true && raw.outerDestination?.hit === false,
    'Input must preserve the outer call hit and the rejected/unobserved destination');
  assert(window && window.requestedBytes === WINDOW_LENGTH
    && window.bytesRead === WINDOW_LENGTH && window.eipOffset === EIP_OFFSET
    && window.sourceWindowMatches === false && window.validationPassed === false
    && typeof window.bytesHex === 'string' && /^[0-9a-f]{512}$/iu.test(window.bytesHex),
  'Input must contain a complete exact 256-byte window that failed its source-window gate');

  const start = BigInt(window.windowStartAddress);
  const eip = BigInt(window.eip);
  assert(start + BigInt(EIP_OFFSET) === eip
    && BigInt(window.windowEndExclusive) === start + BigInt(WINDOW_LENGTH),
  'Window bounds and EIP offset are inconsistent');
  const windowBytes = Buffer.from(window.bytesHex, 'hex');
  const windowHash = sha256(windowBytes);
  assert(windowBytes.length === WINDOW_LENGTH && windowHash === window.bytesSha256,
    'Exact window bytes do not match their recorded hash');

  const peBytes = makePe(windowBytes);
  const syntheticEip = IMAGE_BASE + SECTION_RVA + EIP_OFFSET;
  const peName = 'premium-internal-transfer-window.synthetic.exe';
  const seedName = 'premium-internal-transfer-window-eip.seeds.tsv';
  const bindingName = 'premium-internal-transfer-window.binding.json';
  const seedBytes = Buffer.from(`${hex32(syntheticEip)}\tcode\n`, 'utf8');
  const metadata = {
    schemaVersion: 1,
    purpose: 'static REA/Ghidra inspection of the exact window from one rejected live debugger diagnostic',
    sourceDiagnostic: {
      path: repoRelative(diagnosticFile),
      sha256: diagnosticHash,
      bytes: diagnosticBytes.length,
      tripletId: diagnostic.tripletId,
      runId: diagnostic.runId,
      processId: diagnostic.processId,
      runtimeExecutable: diagnostic.runtimeExecutable,
      callSiteAddress: diagnostic.callSiteAddress,
      diagnosticStatus: 'incomplete-window-rejected',
      acceptedTriplet: false,
    },
    runtimeWindow: {
      start: hex64(start),
      endExclusive: hex64(start + BigInt(WINDOW_LENGTH)),
      eip: hex32(eip),
      eipOffset: EIP_OFFSET,
      length: windowBytes.length,
      bytesHex: windowBytes.toString('hex'),
      sha256: windowHash,
      region: window.region,
      sourceWindowMatches: false,
      validationPassed: false,
    },
    generatedPe: {
      file: peName,
      sha256: sha256(peBytes),
      bytes: peBytes.length,
      imageBase: hex32(IMAGE_BASE),
      sectionRva: hex32(SECTION_RVA),
      sectionVirtualSize: windowBytes.length,
      copiedFileOffset: RAW_SECTION_OFFSET,
      copiedBytes: windowBytes.length,
      syntheticEip: hex32(syntheticEip),
      generatedExecutableRun: false,
    },
    generatedSeed: {
      file: seedName,
      sha256: sha256(seedBytes),
      bytes: seedBytes.length,
      exactLine: `${hex32(syntheticEip)}\tcode`,
      address: hex32(syntheticEip),
      kind: 'code',
    },
    limitations: [
      'This input comes from a rejected incomplete runtime capture, not a complete source-bound before/observer/after triplet.',
      'The synthetic PE contains the exact captured bytes plus analyst-generated headers and alignment padding; it is never executed.',
      'Static REA results describe only these bytes in the analyst-generated container and do not validate the rejected capture.',
      'No direct caller, function boundary, ABI, executed internal transfer, or AARON behavior is established by this analysis.',
    ],
  };
  assert(sha256(readFileSync(diagnosticFile)) === diagnosticHash,
    'Diagnostic changed during preparation');
  mkdirSync(output, { recursive: false });
  writeFileSync(resolve(output, peName), peBytes, { flag: 'wx' });
  writeFileSync(resolve(output, seedName), seedBytes, { flag: 'wx' });
  writeFileSync(resolve(output, bindingName), `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
  return metadata;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options === null) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const metadata = prepareDiagnosticWindow({
    diagnosticPath: options['--diagnostic'],
    outputDirectory: options['--output-dir'],
  });
  process.stdout.write(`${JSON.stringify({
    outputDirectory: repoRelative(resolve(ROOT, options['--output-dir'])),
    generatedPe: metadata.generatedPe,
    generatedSeed: metadata.generatedSeed,
    inputDiagnosticSha256: metadata.sourceDiagnostic.sha256,
    acceptedTriplet: false,
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  }
}
