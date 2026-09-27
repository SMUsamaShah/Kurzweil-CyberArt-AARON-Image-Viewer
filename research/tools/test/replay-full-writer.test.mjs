import assert from 'node:assert/strict';
import test from 'node:test';

import {parseWriterFullReport, replayFullWriter} from '../replay-full-writer.mjs';
import {composeFullAa0} from '../compose-full-aa0.mjs';

const unavailablePoint = {x: 'UNAVAILABLE', y: 'UNAVAILABLE', vis: 'UNAVAILABLE'};
const small = 'SYMBOL:COMMON-GRAPHICS-USER::SMALL';
const intPoint = (x, y) => ({x: `INT:${x}`, y: `INT:${y}`, vis: 'UNAVAILABLE'});
const floatPoint = (x, y) => ({
  x: `FLOAT:COMMON-LISP::DOUBLE-FLOAT:${x}`,
  y: `FLOAT:COMMON-LISP::DOUBLE-FLOAT:${y}`,
  vis: 'INT:1',
});

function syntheticCapture() {
  const calls = [
    {
      selector: 'COLOR', scalar: 'SYMBOL:COMMON-GRAPHICS::COLOR', redraw: 'NIL',
      output: 'color\r\n', after: ['INT:0', 'INT:0'],
    },
    {
      selector: 'BRUSH', scalar: 'INT:2', redraw: 'NIL',
      output: 'nb 2\r\n', after: ['INT:0', 'INT:0'],
    },
    {
      selector: 'AARGB', scalar: 'INT:3', redraw: 'NIL',
      output: 'nc 3\r\n', after: ['INT:0', 'INT:0'],
    },
    {
      selector: 'VECTOR', scalar: 'UNAVAILABLE', redraw: 'T',
      pta: floatPoint('0.', '0.'), ptb: floatPoint('1.125', '2.5'),
      output: 'ad 1.12 2.50\r\n', after: ['FLOAT:COMMON-LISP::DOUBLE-FLOAT:1.125', 'FLOAT:COMMON-LISP::DOUBLE-FLOAT:2.5'], afterVis: 'INT:1',
    },
    {
      selector: 'FILL', scalar: 'UNAVAILABLE', redraw: 'NIL',
      pta: intPoint(2, 3), ptb: intPoint(4, 5),
      output: 'am 2.00 3.00\r\nad 4.00 5.00\r\n',
      after: ['FLOAT:COMMON-LISP::DOUBLE-FLOAT:1.125', 'FLOAT:COMMON-LISP::DOUBLE-FLOAT:2.5'], afterVis: 'INT:1',
    },
    {
      selector: 'MOVE-TO', scalar: 'UNAVAILABLE', redraw: 'NIL', pta: intPoint(3, 4),
      output: 'zm 3 4\r\n', after: ['INT:3', 'INT:4'],
    },
    {
      selector: 'DRAW-TO', scalar: 'UNAVAILABLE', redraw: 'T', ptb: intPoint(3, 5),
      output: 'g\r\n', after: ['INT:3', 'INT:5'],
    },
    {
      selector: 'END', scalar: 'UNAVAILABLE', redraw: 'NIL',
      output: 'am 320 480\r\nend\r\n', after: ['INT:3', 'INT:5'],
    },
  ];
  let position = 0;
  let previous = {x: 'FLOAT:COMMON-LISP::SINGLE-FLOAT:0.', y: 'FLOAT:COMMON-LISP::SINGLE-FLOAT:0.', vis: 'UNAVAILABLE'};
  const lines = ['BEGIN writer-full'];
  const chunks = [];

  for (const [ordinal, call] of calls.entries()) {
    const pta = call.pta ?? unavailablePoint;
    const ptb = call.ptb ?? unavailablePoint;
    const enter = position;
    const bytes = Buffer.from(call.output, 'ascii');
    position += bytes.length;
    const after = {x: call.after[0], y: call.after[1], vis: call.afterVis ?? 'UNAVAILABLE'};
    lines.push(
      `WRITER-FULL-ENTER ordinal=${ordinal} depth=4 selector=${call.selector} redraw=${call.redraw}`
      + ` pta-x=${pta.x} pta-y=${pta.y} pta-vis=${pta.vis}`
      + ` ptb-x=${ptb.x} ptb-y=${ptb.y} ptb-vis=${ptb.vis}`
      + ` scalar=${call.scalar}`
      + ` previous-x=${previous.x} previous-y=${previous.y} previous-vis=${previous.vis}`
      + ` file-size=${small} pic-wide=INT:320 pic-high=INT:480 position=INT:${enter}`,
    );
    lines.push(
      `WRITER-FULL-EXIT ordinal=${ordinal} depth=4 status=SUCCESS`
      + ` previous-x=${after.x} previous-y=${after.y} previous-vis=${after.vis}`
      + ` position=${call.selector === 'END' ? 'ERROR' : `INT:${position}`}`,
    );
    chunks.push(bytes);
    previous = after;
  }
  lines.push(`WRITER-FULL-SUMMARY total=${calls.length} recorded=${calls.length} limit=8 overflow=NIL`);
  lines.push('END writer-full');
  const image = Buffer.concat(chunks);
  const prefix = Buffer.from(
    '320 480 4\r\n'
    + '0.00 0.00 0.00\r\n'
    + '0.25 0.25 0.25\r\n'
    + '0.50 0.50 0.50\r\n'
    + '1.00 1.00 1.00\r\n',
    'ascii',
  );
  return {report: lines.join('\r\n'), image, aa0: Buffer.concat([prefix, image]), prefixLength: prefix.length};
}

test('replays every writer selector, tracks previous state, and checks final END and AA0 suffix', () => {
  const capture = syntheticCapture();
  const tape = parseWriterFullReport(capture.report);
  assert.equal(tape.calls.length, 8);
  assert.deepEqual(tape.calls.map(({selector}) => selector), [
    'COLOR', 'BRUSH', 'AARGB', 'VECTOR', 'FILL', 'MOVE-TO', 'DRAW-TO', 'END',
  ]);
  const result = replayFullWriter(tape, capture.image, capture.aa0);
  assert.equal(result.status, 'matched');
  assert.equal(result.writerCalls, 8);
  assert.equal(result.mode, 'small');
  assert.equal(result.aa0CommandOffset, capture.prefixLength);
  assert.deepEqual(result.finalPrevious, [3, 5]);
  assert.equal(result.commandBytes.length, capture.image.length);
  assert.deepEqual(result.commandBytes, capture.image);
  const composition = composeFullAa0(capture.aa0, result.commandBytes);
  assert.deepEqual(composition.bytes, capture.aa0);
  assert.equal(composition.preludeBytes, capture.prefixLength);
  assert.equal(composition.commandBytes, capture.image.length);
});

test('rejects overflow, malformed calls, and previous-visibility drift', () => {
  const capture = syntheticCapture();
  assert.throws(
    () => parseWriterFullReport(capture.report.replace('overflow=NIL', 'overflow=T')),
    /truncated \(overflow=T\)/,
  );
  assert.throws(
    () => parseWriterFullReport(capture.report.replace('ordinal=0 depth=4 selector=COLOR', 'ordinal=1 depth=4 selector=COLOR')),
    /ordinals must be sequential/,
  );
  assert.throws(
    () => parseWriterFullReport(capture.report.replace('WRITER-FULL-EXIT ordinal=0', 'WRITER-FULL-EXIT ordinal=1')),
    /does not match open ordinal/,
  );
  const wrongVisibility = parseWriterFullReport(capture.report);
  wrongVisibility.calls[3].previousAfter.vis = 'UNAVAILABLE';
  assert.throws(
    () => replayFullWriter(wrongVisibility, capture.image, capture.aa0),
    /previous-after visibility state differs/,
  );
});
