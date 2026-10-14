#!/usr/bin/env node
// Prepares a bounded, static Ghidra/REA input from a captured 32-byte window.
// The generated PE is an analyst container and is never executed here.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLCHAIN_ROOT = resolve(ROOT, 'research/artifacts/rea-tools');
const IMAGE_BASE = 0x10000000;
const SECTION_RVA = 0x1000;
const ANALYST_ENTRY = 0x10001000;
const WINDOW_BYTES = 32;
const RAW_SECTION_OFFSET = 512;
const RAW_SECTION_SIZE = 512;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = path => path.replaceAll('\\', '/');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const isInside = (base, path) => {
  const rel = relative(base, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const repoRelative = path => portable(relative(ROOT, path));
const hexAddress = value => `0x${value.toString(16).padStart(8, '0')}`;

const usage = [
  'Usage: node research/tools/prepare-debugger-window-pe.mjs',
  '  --diagnostic <debugger-capture-diagnostic.json under research/artifacts/rea-tools>',
  '  --output-dir <fresh directory under research/artifacts/rea-tools>',
].join('\n');

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return null;
  const options = {};
  assert(args.length === 4, usage);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    assert(['--diagnostic', '--output-dir'].includes(key) && value && !value.startsWith('--')
      && !Object.hasOwn(options, key), usage);
    options[key] = value;
  }
  assert(Object.keys(options).length === 2, usage);
  return options;
}

function makePe(windowBytes) {
  const pe = Buffer.alloc(RAW_SECTION_OFFSET + RAW_SECTION_SIZE);
  pe.write('MZ', 0, 'ascii');
  pe.writeUInt32LE(0x80, 60);
  pe.write('PE\0\0', 0x80, 'binary');

  const coff = 0x84;
  const optional = 0x98;
  const section = 0x178;
  pe.writeUInt16LE(0x014c, coff); // IMAGE_FILE_MACHINE_I386
  pe.writeUInt16LE(1, coff + 2);
  pe.writeUInt16LE(224, coff + 16);
  pe.writeUInt16LE(0x0102, coff + 18); // executable image, 32-bit machine

  pe.writeUInt16LE(0x010b, optional); // PE32
  pe.writeUInt32LE(RAW_SECTION_SIZE, optional + 4);
  pe.writeUInt32LE(SECTION_RVA, optional + 16);
  pe.writeUInt32LE(SECTION_RVA, optional + 20);
  pe.writeUInt32LE(IMAGE_BASE, optional + 28);
  pe.writeUInt32LE(4096, optional + 32);
  pe.writeUInt32LE(512, optional + 36);
  pe.writeUInt16LE(4, optional + 40);
  pe.writeUInt16LE(4, optional + 48);
  pe.writeUInt32LE(0x2000, optional + 56);
  pe.writeUInt32LE(RAW_SECTION_OFFSET, optional + 60);
  pe.writeUInt16LE(3, optional + 68);
  pe.writeUInt32LE(0x100000, optional + 72);
  pe.writeUInt32LE(4096, optional + 76);
  pe.writeUInt32LE(0x100000, optional + 80);
  pe.writeUInt32LE(4096, optional + 84);
  pe.writeUInt32LE(16, optional + 92);

  pe.write('.text', section, 'ascii');
  pe.writeUInt32LE(WINDOW_BYTES, section + 8);
  pe.writeUInt32LE(SECTION_RVA, section + 12);
  pe.writeUInt32LE(RAW_SECTION_SIZE, section + 16);
  pe.writeUInt32LE(RAW_SECTION_OFFSET, section + 20);
  pe.writeUInt32LE(0x60000020, section + 36); // code, execute, read
  windowBytes.copy(pe, RAW_SECTION_OFFSET);
  return pe;
}

export function prepareDebuggerWindowPe({ diagnosticPath, outputDirectory }) {
  const diagnosticFile = resolve(ROOT, diagnosticPath);
  const output = resolve(ROOT, outputDirectory);
  const realToolchainRoot = realpathSync(TOOLCHAIN_ROOT);
  assert(isInside(TOOLCHAIN_ROOT, diagnosticFile)
    && diagnosticFile.toLowerCase().endsWith(`${sep}debugger-capture-diagnostic.json`),
  'Diagnostic input must be a debugger-capture-diagnostic.json under research/artifacts/rea-tools');
  assert(statSync(diagnosticFile, { throwIfNoEntry: false })?.isFile(), 'Diagnostic input must be a regular file');
  assert(isInside(realToolchainRoot, realpathSync(diagnosticFile)),
    'Diagnostic input must resolve beneath research/artifacts/rea-tools');
  assert(isInside(TOOLCHAIN_ROOT, output) && !existsSync(output),
    'Output directory must be a fresh, unused directory beneath research/artifacts/rea-tools');
  const realOutputParent = existsSync(dirname(output)) ? realpathSync(dirname(output)) : null;
  assert(realOutputParent && (realOutputParent.toLowerCase() === realToolchainRoot.toLowerCase()
    || isInside(realToolchainRoot, realOutputParent)),
  'Output parent must already exist at or beneath research/artifacts/rea-tools');

  const diagnosticBytes = readFileSync(diagnosticFile);
  const diagnosticHash = sha256(diagnosticBytes);
  let diagnostic;
  try {
    diagnostic = JSON.parse(diagnosticBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Diagnostic is not valid JSON: ${error.message}`);
  }
  assert(diagnostic.schemaVersion === 1 && diagnostic.rawDebuggerResult
    && diagnostic.rawDebuggerResult.singleStep,
  'Unsupported debugger diagnostic schema; expected rawDebuggerResult.singleStep');

  const step = diagnostic.rawDebuggerResult.singleStep;
  const window = step.destinationWindow;
  assert(window && typeof window === 'object', 'Diagnostic has no singleStep.destinationWindow');
  assert(window.bytesRead === WINDOW_BYTES && window.requestedBytes === WINDOW_BYTES,
    'Destination window must contain a complete 32-byte read');
  assert(window.queryError === null && window.readError === null,
    'Destination window must have successful memory-region and byte-read status');
  assert(typeof window.bytesHex === 'string' && /^[0-9a-fA-F]{64}$/u.test(window.bytesHex),
    'Destination window bytesHex must encode exactly 32 bytes');
  const originalEip = String(window.eip ?? '');
  const postStepEip = String(step.postStepEip ?? '');
  assert(/^0x[0-9a-fA-F]{1,8}$/u.test(originalEip) && originalEip.toLowerCase() === postStepEip.toLowerCase(),
    'Destination window EIP must match the recorded post-step EIP');

  const windowBytes = Buffer.from(window.bytesHex, 'hex');
  assert(windowBytes.length === WINDOW_BYTES, 'Decoded destination window is not exactly 32 bytes');
  const peBytes = makePe(windowBytes);
  const peName = 'debugger-window.synthetic.exe';
  const seedName = 'debugger-window.seeds.tsv';
  const bindingName = 'debugger-window.binding.json';
  const seedBytes = Buffer.from(`${hexAddress(ANALYST_ENTRY)}\tcode\n`, 'utf8');
  const metadata = {
    schemaVersion: 1,
    purpose: 'static analysis of one bounded runtime code window in an analyst-generated PE container',
    sourceDiagnostic: {
      path: repoRelative(diagnosticFile),
      sha256: diagnosticHash,
      bytes: diagnosticBytes.length,
      schemaVersion: diagnostic.schemaVersion,
      captureRunId: diagnostic.runId ?? null,
      diagnosticTripletId: diagnostic.tripletId ?? null,
    },
    runtimeWindow: {
      originalEip,
      bytesRead: window.bytesRead,
      requestedBytes: window.requestedBytes,
      bytesHex: window.bytesHex.toLowerCase(),
      bytesSha256: sha256(windowBytes),
      region: window.region ?? null,
      readError: window.readError ?? null,
    },
    generatedPe: {
      file: peName,
      sha256: sha256(peBytes),
      bytes: peBytes.length,
      imageBase: hexAddress(IMAGE_BASE),
      sectionRva: hexAddress(SECTION_RVA),
      analystAddress: hexAddress(ANALYST_ENTRY),
      copiedBytes: WINDOW_BYTES,
      copiedFileOffset: RAW_SECTION_OFFSET,
      sourceWindowStart: originalEip,
      sourceWindowEndExclusive: hexAddress((Number.parseInt(originalEip.slice(2), 16) + WINDOW_BYTES) >>> 0),
      generatedHeadersAndPadding: true,
    },
    generatedSeed: {
      file: seedName,
      sha256: sha256(seedBytes),
      bytes: seedBytes.length,
      exactLine: `${hexAddress(ANALYST_ENTRY)}\tcode`,
      address: hexAddress(ANALYST_ENTRY),
      kind: 'code',
      functionNameSeed: false,
    },
    intendedQuery: {
      operation: 'inspect-native-instruction',
      address: hexAddress(ANALYST_ENTRY),
      provider: 'ghidra',
      staticOnly: true,
      generatedExecutableRun: false,
    },
    limitations: [
      'The synthetic PE contains only the exact 32-byte window plus analyst-generated headers and padding; it is never executed.',
      'An instruction beginning in the final bytes but extending past the 32-byte window is excluded from this bounded input.',
      'The analyst address and any relative branch or call destinations are synthetic; they are not original runtime addresses or recovered targets.',
      'Dynamic-window disassembly cannot identify a Lisp function name, original Lisp ABI, or original function boundary.',
      'Any Ghidra-inferred procedure boundary describes this synthetic image only and must not be attributed to the original program.',
      'A debugger-capture diagnostic is diagnostic input; this preparation does not upgrade its capture gate or establish source-level behavior.',
    ],
  };

  assert(sha256(readFileSync(diagnosticFile)) === diagnosticHash, 'Diagnostic changed during PE preparation');
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
  const metadata = prepareDebuggerWindowPe({
    diagnosticPath: options['--diagnostic'],
    outputDirectory: options['--output-dir'],
  });
  process.stdout.write(`${JSON.stringify({
    outputDirectory: repoRelative(resolve(ROOT, options['--output-dir'])),
    generatedPe: metadata.generatedPe,
    generatedSeed: metadata.generatedSeed,
    inputDiagnosticSha256: metadata.sourceDiagnostic.sha256,
    generatedExecutableRun: false,
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  }
}
