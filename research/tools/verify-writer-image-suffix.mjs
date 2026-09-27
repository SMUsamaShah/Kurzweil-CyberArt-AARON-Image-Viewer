import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

import {parseSceneStateReport} from './parse-scene-state-report.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function streamPosition(snapshot, label) {
  if (!snapshot || snapshot.writerStream?.status !== 'STREAM'
      || snapshot.writerStream.output !== 'T') {
    throw new Error(`${label} did not observe an output file stream`);
  }
  const match = /^INT:(\d+)$/.exec(snapshot.writerStream.position);
  if (!match) throw new Error(`${label} has no numeric stream position`);
  const position = Number(match[1]);
  if (!Number.isSafeInteger(position)) throw new Error(`${label} position is unsafe`);
  return position;
}

/** Verify that the natural writer stream is exactly the final AA command suffix. */
export function verifyWriterImageSuffix(reportBytes, imageBytes, aaBytes) {
  const report = parseSceneStateReport(reportBytes.toString('utf8'));
  const byLabel = (label) => report.snapshots.find((snapshot) => snapshot.label === label);
  const firstWriterEnter = streamPosition(byLabel('FIRST-STORE-IN-FILE-ENTER'), 'writer entry');
  const firstWriterExit = streamPosition(byLabel('FIRST-STORE-IN-FILE-EXIT'), 'writer exit');
  if (firstWriterEnter < 0 || firstWriterExit <= firstWriterEnter
      || firstWriterExit > imageBytes.length) {
    throw new Error('first writer positions are outside the image stream');
  }

  const aa0CommandOffset = aaBytes.length - imageBytes.length;
  if (aa0CommandOffset < 0 || !aaBytes.subarray(aa0CommandOffset).equals(imageBytes)) {
    throw new Error('temporary image does not equal the AA0 suffix');
  }

  const firstWriterSlice = imageBytes.subarray(firstWriterEnter, firstWriterExit);
  return {
    schemaVersion: 1,
    sceneReportSha256: hash(reportBytes),
    imageSha256: hash(imageBytes),
    aa0Sha256: hash(aaBytes),
    imageLength: imageBytes.length,
    aa0Length: aaBytes.length,
    aa0CommandOffset,
    firstWriterEnter,
    firstWriterExit,
    firstWriterSliceHex: firstWriterSlice.toString('hex'),
    firstWriterSliceAscii: firstWriterSlice.toString('ascii'),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [reportPath, imagePath, aaPath, ...extra] = process.argv.slice(2);
    if (!reportPath || !imagePath || !aaPath || extra.length) {
      throw new Error('Usage: node verify-writer-image-suffix.mjs SCENE_REPORT IMAGE AA0');
    }
    const result = verifyWriterImageSuffix(
      readFileSync(reportPath), readFileSync(imagePath), readFileSync(aaPath),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
