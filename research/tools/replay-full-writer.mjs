import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

import {AaronStrokeWriter} from '../../engine/src/aaron-stroke-writer.js';

const ENTER_FIELDS = [
  'ordinal', 'depth', 'selector', 'redraw',
  'pta-x', 'pta-y', 'pta-vis', 'ptb-x', 'ptb-y', 'ptb-vis',
  'scalar', 'previous-x', 'previous-y', 'previous-vis',
  'file-size', 'pic-wide', 'pic-high', 'position',
];
const EXIT_FIELDS = [
  'ordinal', 'depth', 'status', 'previous-x', 'previous-y', 'previous-vis', 'position',
];
const SUMMARY_FIELDS = ['total', 'recorded', 'limit', 'overflow'];
const SELECTORS = new Set([
  'VECTOR', 'MOVE-TO', 'DRAW-TO', 'FILL', 'AARGB', 'HUE', 'BRUSH', 'COLOR', 'END',
]);

function failLine(lineNumber, message) {
  throw new Error(`Line ${lineNumber}: ${message}`);
}

function fieldsFromLine(line, prefix, expectedNames, lineNumber) {
  if (!line.startsWith(prefix)) failLine(lineNumber, `expected ${prefix.trim()} record`);
  const fields = {};
  for (const token of line.slice(prefix.length).trim().split(/\s+/)) {
    if (!token) continue;
    const match = /^([a-z][a-z0-9-]*)=(\S+)$/.exec(token);
    if (!match) failLine(lineNumber, `malformed field ${token}`);
    if (Object.hasOwn(fields, match[1])) failLine(lineNumber, `duplicate field ${match[1]}`);
    fields[match[1]] = match[2];
  }
  const expected = new Set(expectedNames);
  for (const name of expectedNames) {
    if (!Object.hasOwn(fields, name)) failLine(lineNumber, `missing field ${name}`);
  }
  for (const name of Object.keys(fields)) {
    if (!expected.has(name)) failLine(lineNumber, `unexpected field ${name}`);
  }
  return fields;
}

function unsignedInteger(value, label, lineNumber) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) failLine(lineNumber, `invalid ${label}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) failLine(lineNumber, `unsafe ${label}`);
  return parsed;
}

function reportPosition(value, label, lineNumber, {allowClosed = false} = {}) {
  if (allowClosed && value === 'ERROR') return null;
  const match = /^INT:(0|[1-9][0-9]*)$/.exec(value);
  if (!match) failLine(lineNumber, `invalid ${label}`);
  const parsed = Number(match[1]);
  if (!Number.isSafeInteger(parsed)) failLine(lineNumber, `unsafe ${label}`);
  return parsed;
}

/** Parse the complete, bounded WRITER-FULL block from an oracle transcript. */
export function parseWriterFullReport(text) {
  if (typeof text !== 'string') throw new TypeError('writer-full report must be text');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const begin = lines.flatMap((line, index) => line === 'BEGIN writer-full' ? [index] : []);
  if (begin.length !== 1) throw new Error(`expected one BEGIN writer-full marker, found ${begin.length}`);

  const calls = [];
  let current = null;
  let summary = null;
  let endLine = -1;
  let ended = false;

  for (let index = begin[0] + 1; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lines[index];
    if (!line) continue;
    if (line === 'END writer-full') {
      if (current) failLine(lineNumber, `ordinal ${current.ordinal} has no exit`);
      if (!summary) failLine(lineNumber, 'missing writer-full summary');
      ended = true;
      endLine = index;
      break;
    }

    if (line.startsWith('WRITER-FULL-ENTER ')) {
      if (ended || summary) failLine(lineNumber, 'writer entry after summary');
      if (current) failLine(lineNumber, `ordinal ${current.ordinal} has no paired exit`);
      const fields = fieldsFromLine(line, 'WRITER-FULL-ENTER ', ENTER_FIELDS, lineNumber);
      const ordinal = unsignedInteger(fields.ordinal, 'writer ordinal', lineNumber);
      const depth = unsignedInteger(fields.depth, 'writer depth', lineNumber);
      if (ordinal !== calls.length) failLine(lineNumber, `writer ordinals must be sequential from zero (got ${ordinal})`);
      if (!SELECTORS.has(fields.selector)) failLine(lineNumber, `unknown selector ${fields.selector}`);
      if (fields.redraw !== 'T' && fields.redraw !== 'NIL') failLine(lineNumber, `invalid redraw state ${fields.redraw}`);
      current = {
        ordinal,
        depth,
        selector: fields.selector,
        redraw: fields.redraw === 'T',
        pta: {x: fields['pta-x'], y: fields['pta-y'], vis: fields['pta-vis']},
        ptb: {x: fields['ptb-x'], y: fields['ptb-y'], vis: fields['ptb-vis']},
        scalar: fields.scalar,
        previousBefore: {
          x: fields['previous-x'], y: fields['previous-y'], vis: fields['previous-vis'],
        },
        fileSize: fields['file-size'],
        picWide: fields['pic-wide'],
        picHigh: fields['pic-high'],
        enter: reportPosition(fields.position, 'writer entry position', lineNumber),
        enterLine: lineNumber,
      };
      continue;
    }

    if (line.startsWith('WRITER-FULL-EXIT ')) {
      if (!current) failLine(lineNumber, 'writer exit has no open entry');
      const fields = fieldsFromLine(line, 'WRITER-FULL-EXIT ', EXIT_FIELDS, lineNumber);
      const ordinal = unsignedInteger(fields.ordinal, 'writer exit ordinal', lineNumber);
      const depth = unsignedInteger(fields.depth, 'writer exit depth', lineNumber);
      if (ordinal !== current.ordinal || depth !== current.depth) {
        failLine(lineNumber, `writer exit does not match open ordinal ${current.ordinal} at depth ${current.depth}`);
      }
      if (fields.status !== 'SUCCESS') failLine(lineNumber, `writer ordinal ${ordinal} exited with ${fields.status}`);
      calls.push({
        ...current,
        status: fields.status,
        previousAfter: {
          x: fields['previous-x'], y: fields['previous-y'], vis: fields['previous-vis'],
        },
        exitPosition: reportPosition(fields.position, 'writer exit position', lineNumber, {allowClosed: true}),
        exitPositionToken: fields.position,
        exitLine: lineNumber,
      });
      current = null;
      continue;
    }

    if (line.startsWith('WRITER-FULL-SUMMARY ')) {
      if (current) failLine(lineNumber, `ordinal ${current.ordinal} has no exit before summary`);
      if (summary) failLine(lineNumber, 'duplicate writer-full summary');
      const fields = fieldsFromLine(line, 'WRITER-FULL-SUMMARY ', SUMMARY_FIELDS, lineNumber);
      if (fields.overflow !== 'T' && fields.overflow !== 'NIL') failLine(lineNumber, `invalid overflow flag ${fields.overflow}`);
      summary = {
        total: unsignedInteger(fields.total, 'writer total', lineNumber),
        recorded: unsignedInteger(fields.recorded, 'writer recorded count', lineNumber),
        limit: unsignedInteger(fields.limit, 'writer limit', lineNumber),
        overflow: fields.overflow === 'T',
        lineNumber,
      };
      continue;
    }

    failLine(lineNumber, `unexpected record inside writer-full block: ${line}`);
  }

  if (!ended) throw new Error('missing END writer-full marker');
  if (lines.slice(endLine + 1).some((line) => line === 'BEGIN writer-full' || line.startsWith('WRITER-FULL-'))) {
    throw new Error('writer-full records continue after END writer-full');
  }
  if (!summary) throw new Error('missing writer-full summary');
  if (summary.overflow) throw new Error('writer-full tape is truncated (overflow=T)');
  if (summary.total !== summary.recorded || summary.recorded !== calls.length) {
    throw new Error(`writer-full tape is incomplete (total=${summary.total}, recorded=${summary.recorded}, parsed=${calls.length})`);
  }
  if (summary.total > summary.limit) throw new Error('writer-full total exceeds its recording limit');
  if (calls.length === 0) throw new Error('writer-full tape contains no calls');
  if (calls.at(-1).selector !== 'END') throw new Error('writer-full tape does not end with END');
  if (calls.slice(0, -1).some(({selector}) => selector === 'END')) throw new Error('END must be the final writer call');
  if (calls.at(-1).exitPositionToken !== 'ERROR') throw new Error('final END exit must report position=ERROR after stream close');
  if (calls.slice(0, -1).some(({exitPositionToken}) => exitPositionToken === 'ERROR')) {
    throw new Error('only the final END call may have position=ERROR');
  }
  return {calls, summary};
}

function numericToken(token, label, call) {
  const integer = /^INT:(-?(?:0|[1-9][0-9]*))$/.exec(token);
  if (integer) {
    const value = Number(integer[1]);
    if (!Number.isSafeInteger(value)) callFailure(call, `unsafe ${label}`, token, 'safe integer');
    return value;
  }
  const floating = /^FLOAT:COMMON-LISP::(?:DOUBLE|SINGLE)-FLOAT:([+-]?(?:(?:[0-9]+(?:\.[0-9]*)?)|(?:\.[0-9]+))(?:[EeDd][+-]?[0-9]+)?)$/.exec(token);
  if (floating) {
    const value = Number(floating[1].replace(/[dD]/, 'e'));
    if (Number.isFinite(value)) return value;
  }
  callFailure(call, `invalid ${label}`, token, 'finite INT or COMMON-LISP float token');
}

function pointTokens(x, y, label, call, {allowUnavailable = false} = {}) {
  if (allowUnavailable && x === 'UNAVAILABLE' && y === 'UNAVAILABLE') return null;
  if (x === 'UNAVAILABLE' || y === 'UNAVAILABLE') {
    callFailure(call, `incomplete ${label}`, `${x},${y}`, 'two coordinates or two UNAVAILABLE tokens');
  }
  return [numericToken(x, `${label} x`, call), numericToken(y, `${label} y`, call)];
}

function samePoint(actual, expected) {
  if (actual === null || expected === null) return actual === expected;
  return Object.is(actual[0], expected[0]) && Object.is(actual[1], expected[1]);
}

function pointLabel(point) {
  return point === null ? 'null' : JSON.stringify(point);
}

function callFailure(call, reason, expected, actual, bytePosition = call.enter, state = {}) {
  const details = {
    previousBefore: call.previousBefore,
    previousAfter: call.previousAfter ?? null,
    ...state,
  };
  throw new Error(
    `Writer replay mismatch at ordinal ${call.ordinal} (${call.selector}), byte ${bytePosition}: `
    + `${reason}; expected ${String(expected)}, actual ${String(actual)}; state=${JSON.stringify(details)}`,
  );
}

function modeFromToken(token, call) {
  const match = /^SYMBOL:COMMON-GRAPHICS-USER::(SMALL|LARGE)$/.exec(token);
  if (!match) callFailure(call, 'invalid file-size mode', 'SMALL or LARGE symbol', token);
  return match[1].toLowerCase();
}

function integerField(token, label, call) {
  if (!/^INT:-?(?:0|[1-9][0-9]*)$/.test(token)) {
    callFailure(call, `invalid ${label}`, 'INT token', token);
  }
  const value = Number(token.slice(4));
  if (!Number.isSafeInteger(value)) callFailure(call, `unsafe ${label}`, 'safe integer', token);
  return value;
}

function requiredPoint(point, label, call, integerOnly = false) {
  const result = pointTokens(point.x, point.y, label, call);
  if (integerOnly && ![point.x, point.y].every((token) => /^INT:-?(?:0|[1-9][0-9]*)$/.test(token))) {
    callFailure(call, `${label} must use integer coordinates`, 'INT x and y', `${point.x},${point.y}`);
  }
  return result;
}

function dispatch(writer, call) {
  switch (call.selector) {
    case 'VECTOR':
      writer.vector(
        requiredPoint(call.pta, 'pta', call),
        requiredPoint(call.ptb, 'ptb', call),
        {redraw: call.redraw},
      );
      return;
    case 'MOVE-TO':
      writer.moveTo(requiredPoint(call.pta, 'pta', call, true), {redraw: call.redraw});
      return;
    case 'DRAW-TO':
      writer.drawTo(requiredPoint(call.ptb, 'ptb', call, true), {redraw: call.redraw});
      return;
    case 'FILL':
      writer.fill(requiredPoint(call.pta, 'pta', call), requiredPoint(call.ptb, 'ptb', call));
      return;
    case 'AARGB':
    case 'HUE':
      writer.color(integerField(call.scalar, 'colour index', call));
      return;
    case 'BRUSH':
      writer.brush(integerField(call.scalar, 'brush width', call));
      return;
    case 'COLOR':
      writer.colorMode();
      return;
    case 'END':
      writer.end(integerField(call.picWide, 'picture width', call), integerField(call.picHigh, 'picture height', call));
      return;
    default:
      callFailure(call, 'unsupported selector', 'known writer selector', call.selector);
  }
}

function asciiBytes(text, call) {
  if (/[^\x00-\x7f]/.test(text)) callFailure(call, 'writer emitted non-ASCII output', 'ASCII command bytes', text);
  return Buffer.from(text.replaceAll('\n', '\r\n'), 'ascii');
}

function byteDescription(buffer, index) {
  if (index >= buffer.length) return 'EOF';
  const value = buffer[index];
  const printable = value >= 32 && value <= 126 ? ` ${JSON.stringify(String.fromCharCode(value))}` : '';
  return `0x${value.toString(16).padStart(2, '0')}${printable}`;
}

function firstByteDifference(expected, actual) {
  const common = Math.min(expected.length, actual.length);
  for (let index = 0; index < common; index++) {
    if (expected[index] !== actual[index]) return index;
  }
  return expected.length === actual.length ? -1 : common;
}

function checkPrevious(call, writer, observed, label, bytePosition) {
  const expected = pointTokens(observed.x, observed.y, label, call, {allowUnavailable: true});
  if (!samePoint(writer.previous, expected)) {
    callFailure(
      call,
      `${label} state differs`,
      pointLabel(expected),
      pointLabel(writer.previous),
      bytePosition,
      {actualPrevious: writer.previous, observedPrevious: observed},
    );
  }
  return expected;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Replay a parsed complete tape and require exact image and AA0-suffix matches. */
export function replayFullWriter(tape, imageBytes, aa0Bytes) {
  if (!tape || !Array.isArray(tape.calls) || !Buffer.isBuffer(imageBytes) || !Buffer.isBuffer(aa0Bytes)) {
    throw new TypeError('replayFullWriter requires a parsed tape, image Buffer, and AA0 Buffer');
  }
  const first = tape.calls[0];
  const mode = modeFromToken(first.fileSize, first);
  const initialPrevious = pointTokens(
    first.previousBefore.x, first.previousBefore.y, 'initial previous point', first,
    {allowUnavailable: true},
  );
  const writer = new AaronStrokeWriter({mode, previous: initialPrevious});
  let previousVis = first.previousBefore.vis;
  let cursor = 0;
  const generatedChunks = [];

  for (const call of tape.calls) {
    const callMode = modeFromToken(call.fileSize, call);
    if (callMode !== mode) callFailure(call, 'file-size mode changed during tape', mode, callMode, cursor);
    const expectedBefore = checkPrevious(call, writer, call.previousBefore, 'previous-before', cursor);
    if (call.previousBefore.vis !== previousVis) {
      callFailure(call, 'previous-before visibility state differs', previousVis, call.previousBefore.vis, cursor, {
        actualPrevious: writer.previous,
        expectedPreviousVis: previousVis,
      });
    }
    if (call.enter !== cursor) {
      callFailure(call, 'non-contiguous writer entry position', String(cursor), String(call.enter), call.enter, {
        expectedPreviousBefore: expectedBefore,
        actualPrevious: writer.previous,
      });
    }

    const outputStart = writer.output.length;
    try {
      dispatch(writer, call);
    } catch (error) {
      if (error.message.startsWith(`Writer replay mismatch at ordinal ${call.ordinal} `)) throw error;
      callFailure(call, 'writer method rejected captured arguments', 'successful method call', error.message, cursor, {
        actualPrevious: writer.previous,
      });
    }

    const actualPrevious = writer.previous === null ? null : [...writer.previous];
    const expectedAfter = pointTokens(call.previousAfter.x, call.previousAfter.y, 'previous-after', call, {allowUnavailable: true});
    if (!samePoint(actualPrevious, expectedAfter)) {
      callFailure(
        call,
        'previous-after state differs',
        pointLabel(expectedAfter),
        pointLabel(actualPrevious),
        cursor,
        {actualPrevious, expectedPreviousAfter: expectedAfter},
      );
    }
    let expectedVisAfter = previousVis;
    if (call.selector === 'VECTOR' || call.selector === 'DRAW-TO') expectedVisAfter = call.ptb.vis;
    else if (call.selector === 'MOVE-TO') expectedVisAfter = call.pta.vis;
    if (call.previousAfter.vis !== expectedVisAfter) {
      callFailure(call, 'previous-after visibility state differs', expectedVisAfter, call.previousAfter.vis, cursor, {
        actualPrevious,
        expectedPreviousVis: expectedVisAfter,
      });
    }
    previousVis = expectedVisAfter;

    const generated = asciiBytes(writer.output.slice(outputStart), call);
    generatedChunks.push(generated);
    let end = call.exitPosition;
    if (call.selector === 'END') {
      if (call.exitPositionToken !== 'ERROR') callFailure(call, 'END exit did not close the stream', 'ERROR', call.exitPositionToken, cursor);
      end = imageBytes.length;
    } else if (end === null) {
      callFailure(call, 'closed stream before final END', 'numeric exit position', 'ERROR', cursor);
    }
    if (end < call.enter || end > imageBytes.length) {
      callFailure(call, 'invalid writer byte interval', `position within 0..${imageBytes.length}`, `${call.enter}..${end}`, cursor);
    }
    const expected = imageBytes.subarray(call.enter, end);
    const difference = firstByteDifference(expected, generated);
    if (difference !== -1) {
      const bytePosition = call.enter + difference;
      callFailure(
        call,
        'command bytes differ',
        byteDescription(expected, difference),
        byteDescription(generated, difference),
        bytePosition,
        {
          interval: {enter: call.enter, exit: end},
          generatedLength: generated.length,
          capturedLength: expected.length,
          actualPrevious,
        },
      );
    }
    if (generated.length !== end - call.enter) {
      callFailure(call, 'command byte count differs from recorded positions', String(end - call.enter), String(generated.length), call.enter, {
        interval: {enter: call.enter, exit: end}, actualPrevious,
      });
    }
    cursor = end;
  }

  if (cursor !== imageBytes.length) {
    const last = tape.calls.at(-1);
    callFailure(last, 'image has unaccounted trailing bytes', String(cursor), String(imageBytes.length), cursor, {
      imageBytes: imageBytes.length,
      actualPrevious: writer.previous,
    });
  }

  const aa0CommandOffset = aa0Bytes.length - imageBytes.length;
  if (aa0CommandOffset < 0) {
    const last = tape.calls.at(-1);
    callFailure(last, 'image is longer than AA0', `AA0 length >= ${imageBytes.length}`, String(aa0Bytes.length), aa0Bytes.length, {
      imageBytes: imageBytes.length,
      aa0Bytes: aa0Bytes.length,
      actualPrevious: writer.previous,
    });
  }
  const aa0Suffix = aa0Bytes.subarray(aa0CommandOffset);
  const suffixDifference = firstByteDifference(imageBytes, aa0Suffix);
  if (suffixDifference !== -1) {
    const last = tape.calls.at(-1);
    callFailure(last, 'image does not match AA0 suffix', byteDescription(imageBytes, suffixDifference), byteDescription(aa0Suffix, suffixDifference), aa0CommandOffset + suffixDifference, {
      aa0CommandOffset,
      actualPrevious: writer.previous,
    });
  }

  return {
    status: 'matched',
    writerCalls: tape.calls.length,
    mode,
    imageBytes: imageBytes.length,
    aa0Bytes: aa0Bytes.length,
    aa0CommandOffset,
    imageSha256: sha256(imageBytes),
    aa0Sha256: sha256(aa0Bytes),
    finalPrevious: writer.previous === null ? null : [...writer.previous],
    finalPreviousVis: previousVis,
    commandBytes: Buffer.concat(generatedChunks),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [reportPath, imagePath, aa0Path, ...extra] = process.argv.slice(2);
    if (!reportPath || !imagePath || !aa0Path || extra.length) {
      throw new Error('Usage: node research/tools/replay-full-writer.mjs WRITER_FULL_REPORT IMAGE AA0');
    }
    const tape = parseWriterFullReport(readFileSync(reportPath, 'utf8'));
    const result = replayFullWriter(tape, readFileSync(imagePath), readFileSync(aa0Path));
    const {commandBytes, ...summary} = result;
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
