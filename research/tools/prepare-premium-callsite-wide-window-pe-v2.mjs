#!/usr/bin/env node
// Prepare static REA/Ghidra input from one exact V2 capture window.
// Input is the serialized output of AaronPremiumCallsitePickCorrelationV2;
// the synthetic PE is an analyst container and is never executed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseV2CaptureEnvelope, validateV2CaptureReport } from './validate-premium-callsite-wide-window-v2.mjs';
import { validateV2TripletComparison } from './derive-premium-callsite-wide-window-evidence-v2.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLCHAIN_ROOT = resolve(ROOT, 'research/artifacts/rea-tools');
const IMAGE_BASE = 0x10000000;
const SECTION_RVA = 0x1000;
const ANALYST_WINDOW_ADDRESS = 0x10001000;
const MAX_WINDOW_BYTES = 256;
const FILE_ALIGNMENT = 512;
const SECTION_ALIGNMENT = 4096;
const RAW_SECTION_OFFSET = 512;
const UINT32_SPACE_END = 0x100000000n;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = path => path.replaceAll('\\', '/');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const isInside = (base, path) => {
  const rel = relative(base, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const repoRelative = path => portable(relative(ROOT, path));
const hexAddress = value => `0x${BigInt(value).toString(16).padStart(8, '0')}`;
const hex64 = value => `0x${BigInt(value).toString(16).padStart(16, '0')}`;
const alignUp = (value, alignment) => Math.ceil(value / alignment) * alignment;

const usage = [
  'Usage: node research/tools/prepare-premium-callsite-wide-window-pe-v2.mjs',
  '  --capture <completed V2 BEGIN/END report under research/extracted/local-oracle>',
  '  --comparison <completed source-bound triplet-comparison.json>',
  '  --output-dir <fresh directory under research/artifacts/rea-tools>',
].join('\n');

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return null;
  const options = {};
  assert(args.length === 6, usage);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    assert(['--capture', '--comparison', '--output-dir'].includes(key) && value && !value.startsWith('--')
      && !Object.hasOwn(options, key), usage);
    options[key] = value;
  }
  assert(Object.keys(options).length === 3, usage);
  return options;
}

function validateCapture(report, comparison) {
  assert(comparison.schemaVersion === 1 && comparison.mode === 'writer-stream-seed-1234'
    && comparison.controlsMatch === true && comparison.beforeAfterPlanningTraceMatch === true
    && Array.isArray(comparison.runs) && comparison.runs.length === 3,
  'Comparison must prove a complete before/observer/after triplet and matching controls');
  assert(comparison.runs.map(row => row.role).join(',') === 'before,observer,after'
    && comparison.runs.every(row => row.complete === true && row.mode === comparison.mode
      && row.aa0Header === '768 1080 148'),
  'Comparison run ordering, completion, mode, or canvas is invalid');
  const observer = comparison.runs[1];
  const validated = validateV2CaptureReport(report, {
    tripletId: comparison.tripletId,
    runId: observer.runId,
    sources: comparison.sources,
  });
  return { ...validated, observer };
}
function makePe(windowBytes, eipOffset) {
  const rawSectionSize = alignUp(windowBytes.length, FILE_ALIGNMENT);
  const pe = Buffer.alloc(RAW_SECTION_OFFSET + rawSectionSize);
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
  pe.writeUInt32LE(rawSectionSize, optional + 4);
  pe.writeUInt32LE(SECTION_RVA + eipOffset, optional + 16); // recorded destination offset
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
  pe.writeUInt32LE(windowBytes.length, section + 8); // virtual size is exact evidence length
  pe.writeUInt32LE(SECTION_RVA, section + 12);
  pe.writeUInt32LE(rawSectionSize, section + 16); // file-alignment padding is outside VirtualSize
  pe.writeUInt32LE(RAW_SECTION_OFFSET, section + 20);
  pe.writeUInt32LE(0x60000020, section + 36); // code, execute, read
  windowBytes.copy(pe, RAW_SECTION_OFFSET, 0, windowBytes.length);
  return { pe, rawSectionSize };
}

export function preparePremiumCallsiteWideWindowPe({ capturePath, comparisonPath, outputDirectory }) {
  const captureFile = resolve(ROOT, capturePath);
  const comparisonFile = resolve(ROOT, comparisonPath);
  const output = resolve(ROOT, outputDirectory);
  const realToolchainRoot = realpathSync(TOOLCHAIN_ROOT);
  const localOracleRoot = realpathSync(resolve(ROOT, 'research/extracted/local-oracle'));
  const localOracleRunsPath = resolve(localOracleRoot, 'external-runs');
  const realOracleRunsRoot = realpathSync(localOracleRunsPath);
  const expectedOracleRunsRoot = resolve('C:\\AaronOracleRuns');
  assert(realOracleRunsRoot.toLowerCase() === expectedOracleRunsRoot.toLowerCase(),
    'The documented external-runs junction must resolve to C:\\AaronOracleRuns');
  assert(captureFile.toLowerCase().endsWith('.txt'),
    'Capture input must be the archived V2 source-bound report');
  assert(statSync(captureFile, { throwIfNoEntry: false })?.isFile(), 'Capture input must be a regular file');
  assert(isInside(localOracleRoot, captureFile),
    'Capture report must be logically located beneath research/extracted/local-oracle');
  const realCaptureFile = realpathSync(captureFile);
  const captureIsInsideLocalRoot = isInside(localOracleRoot, realCaptureFile);
  const captureIsInsideDocumentedJunction = isInside(localOracleRunsPath, captureFile)
    && isInside(realOracleRunsRoot, realCaptureFile);
  assert(captureIsInsideLocalRoot || captureIsInsideDocumentedJunction,
    'Capture report must resolve beneath the local-oracle directory or its verified external-runs junction');
  assert(comparisonFile.toLowerCase().endsWith('.json')
    && statSync(comparisonFile, { throwIfNoEntry: false })?.isFile()
    && isInside(localOracleRoot, realpathSync(comparisonFile)),
  'Triplet comparison must be a JSON file beneath research/extracted/local-oracle');
  assert(isInside(TOOLCHAIN_ROOT, output) && !existsSync(output),
    'Output directory must be a fresh, unused directory beneath research/artifacts/rea-tools');
  const realOutputParent = existsSync(dirname(output)) ? realpathSync(dirname(output)) : null;
  assert(realOutputParent && (realOutputParent.toLowerCase() === realToolchainRoot.toLowerCase()
    || isInside(realToolchainRoot, realOutputParent)),
  'Output parent must already exist at or beneath research/artifacts/rea-tools');

  const captureBytes = readFileSync(captureFile);
  const captureHash = sha256(captureBytes);
  const comparisonBytes = readFileSync(comparisonFile);
  const comparisonHash = sha256(comparisonBytes);
  let comparison;
  try {
    comparison = JSON.parse(comparisonBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Triplet comparison is not valid JSON: ${error.message}`);
  }
  const report = parseV2CaptureEnvelope(captureBytes.toString('utf8'));
  const sourceBoundTriplet = validateV2TripletComparison(ROOT, comparison);
  assert(sourceBoundTriplet.reportFile.path === repoRelative(captureFile)
    && sourceBoundTriplet.reportFile.sha256 === captureHash,
  'Capture is not the exact observer report from the source-bound triplet roots');
  assert(comparison.debuggerResult?.path?.toLowerCase() === repoRelative(captureFile).toLowerCase()
    && comparison.debuggerResult?.sha256 === captureHash,
  'Triplet comparison does not bind the exact archived V2 report bytes and path');
  for (const [name, binding] of Object.entries(comparison.sources ?? {})) {
    assert(binding && typeof binding.path === 'string' && /^[0-9a-f]{64}$/iu.test(binding.sha256 ?? ''),
      `Comparison source binding is malformed: ${name}`);
    const sourcePath = resolve(ROOT, binding.path);
    assert(isInside(ROOT, sourcePath) && existsSync(sourcePath), `Comparison source is missing or outside the repository: ${name}`);
    assert(sha256(readFileSync(sourcePath)) === binding.sha256, `Comparison source changed since triplet validation: ${name}`);
  }
  const validated = validateCapture(report, comparison);
  const { window, region, windowStart, windowEnd, eip, eipOffset, windowBytes } = validated;
  assert(windowBytes.length === window.bytesRead, 'Decoded capture bytes are not exact');

  const { pe: peBytes, rawSectionSize } = makePe(windowBytes, Number(eipOffset));
  const syntheticEip = BigInt(ANALYST_WINDOW_ADDRESS) + eipOffset;
  const peName = 'premium-callsite-wide-window-v2.synthetic.exe';
  const seedName = 'premium-callsite-wide-window-v2.seeds.tsv';
  const bindingName = 'premium-callsite-wide-window-v2.binding.json';
  const seedBytes = Buffer.from(`${hexAddress(syntheticEip)}\tcode\n`, 'utf8');
  const metadata = {
    schemaVersion: 2,
    purpose: 'static REA/Ghidra analysis of one exact bounded runtime byte window in an analyst-generated PE container',
    sourceCapture: {
      path: repoRelative(captureFile),
      sha256: captureHash,
      bytes: captureBytes.length,
      schema: report.debugger.schema,
      tripletId: report.tripletId,
      observerRunId: report.runId,
      processId: report.debugger.processId,
      comparison: { path: repoRelative(comparisonFile), sha256: comparisonHash },
    },
    runtimeWindow: {
      eip: hexAddress(eip),
      windowStartAddress: hex64(windowStart),
      windowEndExclusive: hex64(windowEnd),
      eipOffset: Number(eipOffset),
      requestedBytes: window.requestedBytes,
      bytesRead: window.bytesRead,
      bytesHex: window.bytesHex.toLowerCase(),
      bytesSha256: sha256(windowBytes),
      maximumBytes: window.maximumBytes,
      includesPriorBranchCandidate: validated.includesPriorBranchCandidate,
      bytesAfterEip: validated.bytesAfterEip,
      centeringPolicy: 'nominal half-open interval [EIP-128, EIP+128); clamp each edge to the recorded VirtualQueryEx region and 32-bit address-space end; never cross the queried region',
      region,
    },
    generatedPe: {
      file: peName,
      sha256: sha256(peBytes),
      bytes: peBytes.length,
      imageBase: hexAddress(IMAGE_BASE),
      sectionRva: hexAddress(SECTION_RVA),
      analystWindowAddress: hexAddress(ANALYST_WINDOW_ADDRESS),
      syntheticEip: hexAddress(syntheticEip),
      entryPointRva: hexAddress(SECTION_RVA + Number(eipOffset)),
      copiedBytes: windowBytes.length,
      copiedFileOffset: RAW_SECTION_OFFSET,
      virtualSize: windowBytes.length,
      rawSectionSize,
      fileAlignmentPaddingBytes: rawSectionSize - windowBytes.length,
      sourceWindowStart: hex64(windowStart),
      sourceWindowEndExclusive: hex64(windowEnd),
      generatedHeadersAndPadding: true,
      onlyCapturedBytesMappedAsSectionContent: true,
    },
    generatedSeed: {
      file: seedName,
      sha256: sha256(seedBytes),
      bytes: seedBytes.length,
      exactLine: `${hexAddress(syntheticEip)}\tcode`,
      address: hexAddress(syntheticEip),
      kind: 'code',
      sourceEipOffset: Number(eipOffset),
      functionNameSeed: false,
    },
    intendedQuery: {
      operation: 'inspect-native-instruction',
      address: hexAddress(syntheticEip),
      provider: 'ghidra',
      staticOnly: true,
      generatedExecutableRun: false,
    },
    limitations: [
      'The input is accepted only when the exact archived report hash is bound by a completed source-bound before/observer/after comparison with matching uninstrumented controls.',
      'The synthetic PE maps only the exact captured bytes as section VirtualSize. File-alignment zeros are generated container padding, not captured evidence, and are not part of that virtual section size.',
      'The seed is the synthetic address corresponding exactly to the recorded runtime EIP offset; all synthetic addresses differ from original runtime addresses.',
      'If region clipping excludes the earlier EIP-0x69 candidate, that absent byte address is not reconstructed or supplied to REA.',
      'Instructions that extend beyond either captured boundary are incomplete. Branch or call targets outside the captured interval are not captured by this image.',
      'This byte window cannot identify a Lisp function name, original Lisp ABI, caller relationship, or original function boundary.',
      'Any Ghidra-inferred procedure boundary describes this synthetic image only and must not be attributed to the original program.',
    ],
  };

  assert(sha256(readFileSync(captureFile)) === captureHash, 'Capture changed during PE preparation');
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
  const metadata = preparePremiumCallsiteWideWindowPe({
    capturePath: options['--capture'],
    comparisonPath: options['--comparison'],
    outputDirectory: options['--output-dir'],
  });
  process.stdout.write(`${JSON.stringify({
    outputDirectory: repoRelative(resolve(ROOT, options['--output-dir'])),
    generatedPe: metadata.generatedPe,
    generatedSeed: metadata.generatedSeed,
    inputCaptureSha256: metadata.sourceCapture.sha256,
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
