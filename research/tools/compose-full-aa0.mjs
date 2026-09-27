import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

import {parseAaFile, serializeAaFile} from '../../engine/src/aa-format.js';
import {parseWriterFullReport, replayFullWriter} from './replay-full-writer.mjs';

function byteDescription(bytes, index) {
  if (index >= bytes.length) return 'EOF';
  return `0x${bytes[index].toString(16).padStart(2, '0')}`;
}

function firstDifference(expected, actual) {
  const common = Math.min(expected.length, actual.length);
  for (let index = 0; index < common; index++) {
    if (expected[index] !== actual[index]) return index;
  }
  return expected.length === actual.length ? -1 : common;
}

/** Build an AA0 from its semantic prelude and JS-generated writer commands. */
export function composeFullAa0(originalAa0Bytes, commandBytes) {
  if (!Buffer.isBuffer(originalAa0Bytes) || !Buffer.isBuffer(commandBytes)) {
    throw new TypeError('composeFullAa0 requires original AA0 and generated command Buffers');
  }

  const originalDocument = parseAaFile(originalAa0Bytes.toString('utf8'));
  const emptyDocument = {
    width: originalDocument.width,
    height: originalDocument.height,
    palette: originalDocument.palette,
    outline: [],
    paint: [],
  };
  const serializedTemplate = serializeAaFile(emptyDocument, {originalPrelude: true});
  const generatedCommands = 'color\nend\n';
  if (!serializedTemplate.endsWith(generatedCommands)) {
    throw new Error('AA serializer did not produce its expected empty command trailer');
  }
  const preludeText = serializedTemplate.slice(0, -generatedCommands.length);
  const preludeBytes = Buffer.from(preludeText, 'ascii');
  const composedAa0 = Buffer.concat([preludeBytes, commandBytes]);
  const difference = firstDifference(originalAa0Bytes, composedAa0);
  if (difference !== -1) {
    const section = difference < preludeBytes.length ? 'serialized header/palette prelude' : 'generated command stream';
    throw new Error(
      `Composed AA0 differs from original at byte ${difference} in ${section}: `
      + `expected ${byteDescription(originalAa0Bytes, difference)}, `
      + `actual ${byteDescription(composedAa0, difference)}; `
      + `dimensions=${originalDocument.width}x${originalDocument.height}, `
      + `palette=${originalDocument.palette.length}, `
      + `composedLength=${composedAa0.length}, originalLength=${originalAa0Bytes.length}`,
    );
  }

  return {
    bytes: composedAa0,
    width: originalDocument.width,
    height: originalDocument.height,
    paletteEntries: originalDocument.palette.length,
    preludeBytes: preludeBytes.length,
    commandBytes: commandBytes.length,
    aa0Bytes: composedAa0.length,
    aa0Sha256: createHash('sha256').update(composedAa0).digest('hex'),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [reportPath, imagePath, aa0Path, outputPath, ...extra] = process.argv.slice(2);
    if (!reportPath || !imagePath || !aa0Path || extra.length) {
      throw new Error('Usage: node research/tools/compose-full-aa0.mjs WRITER_FULL_REPORT IMAGE AA0 [OUTPUT_AA0]');
    }
    const tape = parseWriterFullReport(readFileSync(reportPath, 'utf8'));
    const imageBytes = readFileSync(imagePath);
    const aa0Bytes = readFileSync(aa0Path);
    const replay = replayFullWriter(tape, imageBytes, aa0Bytes);
    const composition = composeFullAa0(aa0Bytes, replay.commandBytes);
    if (outputPath) writeFileSync(outputPath, composition.bytes, {flag: 'wx'});
    const {bytes, ...compositionSummary} = composition;
    process.stdout.write(`${JSON.stringify({
      status: 'matched',
      writerCalls: replay.writerCalls,
      mode: replay.mode,
      ...(outputPath ? {outputPath} : {}),
      ...compositionSummary,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
