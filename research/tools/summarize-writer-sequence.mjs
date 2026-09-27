import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

import {parseSceneStateReport} from './parse-scene-state-report.mjs';
import {verifyWriterImageSuffix} from './verify-writer-image-suffix.mjs';

function position(token, label) {
  const match = /^INT:(\d+)$/.exec(token ?? '');
  if (!match) throw new Error(`${label} is not a numeric stream position`);
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value)) throw new Error(`${label} exceeds the safe integer range`);
  return value;
}

/** Produce a portable, bounded fixture from real calls and their exact bytes. */
export function summarizeWriterSequence(reportBytes, imageBytes, aaBytes) {
  const link = verifyWriterImageSuffix(reportBytes, imageBytes, aaBytes);
  const report = parseSceneStateReport(reportBytes.toString('utf8'));
  const {writerCalls: calls, writerSequenceSummary: summary} = report;
  if (!summary || calls.length !== summary.recorded || !calls.length) {
    throw new Error('missing bounded writer sequence');
  }
  const cases = calls.map((call, index) => {
    if (call.status !== 'SUCCESS') throw new Error(`writer call ${index} did not succeed`);
    const enter = position(call.enterPosition, `writer call ${index} entry`);
    // END closes *TEMP*, so FILE-POSITION is no longer readable on exit. The
    // archived image length gives the final byte boundary in that one case.
    const exitFromClosedStream = call.selector === 'END' && index === calls.length - 1
      && call.exitPosition === 'ERROR';
    const exit = exitFromClosedStream ? imageBytes.length
      : position(call.exitPosition, `writer call ${index} exit`);
    if (exit < enter || exit > imageBytes.length) {
      throw new Error(`writer call ${index} has an invalid stream slice`);
    }
    const outputBytes = imageBytes.subarray(enter, exit);
    if (outputBytes.some((byte) => byte > 127)) {
      throw new Error(`writer call ${index} emitted non-ASCII bytes`);
    }
    return {
      index: call.index,
      ...(call.ordinal === undefined ? {} : {ordinal: call.ordinal}),
      selector: call.selector,
      redraw: call.redraw,
      pta: call.pta,
      ptb: call.ptb,
      ...(call.previousBefore ? {previousBefore: call.previousBefore} : {}),
      ...(call.previousAfter ? {previousAfter: call.previousAfter} : {}),
      ...(call.fileSize ? {fileSize: call.fileSize} : {}),
      ...(call.arguments ? {arguments: call.arguments} : {}),
      enter,
      exit,
      ...(exitFromClosedStream ? {exitPositionSource: 'closed-stream-image-length'} : {}),
      output: outputBytes.toString('ascii'),
    };
  });
  return {
    schemaVersion: 1,
    sceneReportSha256: link.sceneReportSha256,
    imageSha256: link.imageSha256,
    aa0Sha256: link.aa0Sha256,
    aa0CommandOffset: link.aa0CommandOffset,
    totalWriterCalls: summary.total,
    ...(report.writerSelectorSummary ? {selectorSummary: report.writerSelectorSummary} : {}),
    recordedWriterCalls: cases.length,
    limit: summary.limit,
    firstEntry: cases[0].enter,
    lastExit: cases.at(-1).exit,
    contiguous: cases.every((call, index) => index === 0 || call.enter === cases[index - 1].exit),
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [reportPath, imagePath, aaPath, ...extra] = process.argv.slice(2);
    if (!reportPath || !imagePath || !aaPath || extra.length) {
      throw new Error('Usage: node summarize-writer-sequence.mjs SCENE_REPORT IMAGE AA0');
    }
    const result = summarizeWriterSequence(
      readFileSync(reportPath), readFileSync(imagePath), readFileSync(aaPath),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
