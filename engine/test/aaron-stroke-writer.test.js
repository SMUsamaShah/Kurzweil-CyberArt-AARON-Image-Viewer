import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AaronStrokeWriter } from '../src/aaron-stroke-writer.js';
import { parseStoreReport } from '../../research/tools/parse-store-report.mjs';
import { parseStoreIsolatedReport } from '../../research/tools/parse-store-isolated-report.mjs';
import { parseSceneStateReport } from '../../research/tools/parse-scene-state-report.mjs';

test('move/draw emission matches 96 original byte strings and previous-point states', () => {
  const rows = parseStoreReport(readFileSync(new URL(
    '../../research/introspection/evidence/store-behavior-34016651940.txt', import.meta.url,
  ), 'utf8')).cases;
  assert.equal(rows.length, 192);
  let count = 0;
  for (const row of rows) {
    if (row.method !== 'MOVE-TO' && row.method !== 'DRAW-TO') continue;
    assert.equal(row.error, undefined);
    const writer = new AaronStrokeWriter({ mode: row.mode.toLowerCase(), previous: row.previousBefore });
    if (row.method === 'MOVE-TO') writer.moveTo(row.args[0], { redraw: row.redraw });
    else writer.drawTo(row.args[1], { redraw: row.redraw });
    assert.equal(writer.output, row.output, JSON.stringify(row));
    assert.deepEqual(writer.previous, row.previousAfter, JSON.stringify(row));
    count++;
  }
  assert.equal(count, 96);
});

test('vector and fill formatting matches all isolated selector holdouts', () => {
  const rows = parseStoreIsolatedReport(readFileSync(new URL(
    '../../research/introspection/evidence/store-isolated-34031149136.txt', import.meta.url,
  ), 'utf8')).cases;
  assert.equal(rows.length, 240);

  for (const row of rows) {
    const writer = new AaronStrokeWriter({ mode: row.mode, previous: row.previousBefore });
    let thrown = false;
    try {
      if (row.method === 'VECTOR') writer.vector(row.args[0], row.args[1], { redraw: row.redraw });
      else writer.fill(row.args[0], row.args[1]);
    } catch (error) {
      thrown = true;
      assert.equal(row.error, 'PROGRAM-ERROR', JSON.stringify(row));
      assert.match(error.message, /previous point/);
    }

    assert.equal(thrown, row.error !== undefined, JSON.stringify(row));
    assert.equal(writer.output, row.output, JSON.stringify(row));
    assert.deepEqual(writer.previous, row.previousAfter, JSON.stringify(row));
  }
});

test('first natural integrated vector matches the retained 36-byte command slice', () => {
  const path = new URL('../../research/introspection/evidence/scene-state-local-windows10-writer-stream-seed1234-20260926.txt', import.meta.url);
  const report = parseSceneStateReport(readFileSync(path, 'utf8'));
  const entry = report.snapshots.find(({label}) => label === 'FIRST-STORE-IN-FILE-ENTER');
  const coordinate = (token) => Number(token.slice(token.lastIndexOf(':') + 1));
  const point = (argument) => [coordinate(argument.vispt.x), coordinate(argument.vispt.y)];
  // The original previous point was not captured. A distinct previous point
  // exercises the measured move-then-draw branch for this natural VECTOR call.
  const writer = new AaronStrokeWriter({mode: 'small', previous: [0, 0]});
  writer.vector(point(entry.arguments[2]), point(entry.arguments[4]), {redraw: true});
  assert.equal(writer.output, 'am 106.92 384.16\nad 109.11 385.81\n');
  assert.equal(Buffer.byteLength(writer.output.replaceAll('\n', '\r\n')), 36);
});

test('64 consecutive natural VECTOR calls match exact original stream slices', () => {
  const path = new URL('../../research/introspection/evidence/writer-sequence-local-windows10-seed1234-20260926.json', import.meta.url);
  const fixture = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(fixture.recordedWriterCalls, 64);
  assert.equal(fixture.contiguous, true);
  const coordinate = (token) => Number(token.slice(token.lastIndexOf(':') + 1));
  const point = (value) => [coordinate(value.x), coordinate(value.y)];
  // The original first previous point was not read. A distinct sentinel
  // reproduces its observed move branch; subsequent previous points are
  // determined by the consecutive natural VECTOR calls.
  const writer = new AaronStrokeWriter({mode: 'small', previous: [0, 0]});
  for (const row of fixture.cases) {
    assert.equal(row.selector, 'VECTOR');
    assert.equal(row.redraw, 'T');
    const before = writer.output.length;
    writer.vector(point(row.pta), point(row.ptb), {redraw: true});
    const fragment = writer.output.slice(before).replaceAll('\n', '\r\n');
    assert.equal(fragment, row.output, `writer call ${row.index}`);
    assert.equal(Buffer.byteLength(fragment), row.exit - row.enter, `writer call ${row.index}`);
  }
  assert.equal(fixture.cases.filter((row) => row.output.startsWith('am ')).length, 4);
  assert.equal(fixture.lastExit, 1224);
});

test('299 sampled natural calls match output bytes and previous-point state across every writer selector', () => {
  const path = new URL('../../research/introspection/evidence/writer-windows-local-windows10-seed1234-20260926.json', import.meta.url);
  const fixture = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(fixture.totalWriterCalls, 28075);
  assert.equal(fixture.recordedWriterCalls, 299);
  assert.equal(fixture.cases.length, 299);
  assert.equal(fixture.aa0Sha256, '0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1');
  assert.deepEqual(fixture.selectorSummary.map(({selector}) => selector), [
    'VECTOR', 'COLOR', 'BRUSH', 'AARGB', 'MOVE-TO', 'DRAW-TO', 'HUE', 'FILL', 'END',
  ]);
  assert.equal(fixture.selectorSummary.reduce((sum, row) => sum + row.count, 0), 28075);

  const number = (token) => Number(token.slice(token.lastIndexOf(':') + 1));
  const point = (value) => [number(value.x), number(value.y)];
  const integerArgument = (row) => {
    const token = row.arguments?.[2]?.summary;
    assert.match(token, /^INT:\d+$/);
    return Number(token.slice(4));
  };

  for (const row of fixture.cases) {
    // PREV-STORED-PT was observed at each natural call boundary. This lets
    // sparse windows be checked independently without inventing gap state.
    assert.equal(row.fileSize, 'SYMBOL:COMMON-GRAPHICS-USER::SMALL');
    const writer = new AaronStrokeWriter({mode: 'small', previous: point(row.previousBefore)});
    const redraw = row.redraw === 'T';
    switch (row.selector) {
      case 'VECTOR': writer.vector(point(row.pta), point(row.ptb), {redraw}); break;
      case 'MOVE-TO': writer.moveTo(point(row.pta), {redraw}); break;
      case 'DRAW-TO': writer.drawTo(point(row.ptb), {redraw}); break;
      case 'FILL': writer.fill(point(row.pta), point(row.ptb)); break;
      case 'AARGB':
      case 'HUE': writer.color(integerArgument(row)); break;
      case 'BRUSH': writer.brush(integerArgument(row)); break;
      case 'COLOR': writer.colorMode(); break;
      case 'END': writer.end(320, 480); break;
      default: assert.fail(`unhandled natural selector ${row.selector}`);
    }
    const windowsBytes = writer.output.replaceAll('\n', '\r\n');
    assert.equal(windowsBytes, row.output, `writer call ${row.ordinal} (${row.selector})`);
    assert.equal(Buffer.byteLength(windowsBytes), row.exit - row.enter, `writer call ${row.ordinal} byte count`);
    assert.deepEqual(writer.previous, point(row.previousAfter), `writer call ${row.ordinal} previous point`);
  }
  assert.equal(fixture.cases.at(-1).exitPositionSource, 'closed-stream-image-length');
  assert.equal(fixture.lastExit, 124575);
});
