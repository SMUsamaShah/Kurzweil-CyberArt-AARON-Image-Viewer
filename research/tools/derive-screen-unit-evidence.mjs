import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { AaronStrokeWriter } from '../../engine/src/aaron-stroke-writer.js';
import { emitAaronScreenPath } from '../../engine/src/aaron-screen-path.js';
import { parseWriterFullReport } from './replay-full-writer.mjs';

const pointRecord = /\(:TYPE (TRIPT|TWOPT) :X \(:TYPE FIXNUM :VALUE (-?\d+)\) :Y \(:TYPE FIXNUM :VALUE (-?\d+)\)\)/g;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function field(line, name) {
  const match = new RegExp(`(?:^| )${name}=(\\d+)(?: |$)`).exec(line);
  if (!match) throw new Error(`Missing integer ${name} in ${line.slice(0, 80)}`);
  return Number(match[1]);
}

function parsePath(line, startToken, endToken) {
  const start = line.indexOf(startToken);
  const end = line.indexOf(endToken, start + startToken.length);
  if (start < 0 || end < 0) throw new Error('Missing bounded path field');
  const fragment = line.slice(start + startToken.length, end);
  const match = /^\(:POINTS \((.*)\) :SHOWN (\d+) :TRUNCATED NIL :PROPER T :TAIL-TYPE NIL\)$/.exec(fragment);
  if (!match) throw new Error('Path list is malformed or truncated');
  const points = [...match[1].matchAll(pointRecord)].map(item => ({
    type: item[1], x: Number(item[2]), y: Number(item[3]),
  }));
  if (match[1].replace(pointRecord, '').trim() !== '' || points.length !== Number(match[2])) {
    throw new Error('Path contains unsupported point records');
  }
  return points;
}

function parseScreenReport(text) {
  const lines = text.trimEnd().split(/\r?\n/);
  assert.deepEqual(lines.slice(0, 3), [
    'BEGIN natural-screen-unit v1',
    'CAPS calls=8 points-per-path=128',
    'READY target=SCREEN-AND-STORE',
  ]);
  const units = [];
  let active = null;
  for (const line of lines.slice(3)) {
    if (line.startsWith('CALL ')) {
      if (active) throw new Error('Nested SCREEN-AND-STORE call in report');
      const id = field(line, 'id');
      const points = parsePath(line, ' path=', ' other-args=');
      const argMatch = / other-args=\(\(:TYPE FIXNUM :VALUE (-?\d+)\) \(:TYPE FIXNUM :VALUE (-?\d+)\)\) /.exec(line);
      const position = / before=\(:POSITION (\d+) /.exec(line);
      const rng = / before=\(:POSITION \d+ :RNG \((\d+) (\d+) (\d+)\)/.exec(line);
      if (!argMatch || !position || !rng) throw new Error(`Incomplete SCREEN-AND-STORE call ${id}`);
      active = {
        id, points, screenArgs: [Number(argMatch[1]), Number(argMatch[2])],
        start: Number(position[1]), rngBefore: rng.slice(1).map(Number),
      };
    } else if (line.startsWith('RETURN ')) {
      if (!active || field(line, 'id') !== active.id) throw new Error('Unpaired SCREEN-AND-STORE return');
      const after = parsePath(line, ' path-after=', ' after=');
      assert.deepEqual(after, active.points, `SCREEN-AND-STORE ${active.id} mutated its path`);
      const position = / after=\(:POSITION (\d+) /.exec(line);
      const rng = / after=\(:POSITION \d+ :RNG \((\d+) (\d+) (\d+)\)/.exec(line);
      if (!position || !rng || !line.includes('values=((:TYPE NULL))')) {
        throw new Error(`Incomplete SCREEN-AND-STORE return ${active.id}`);
      }
      active.end = Number(position[1]);
      active.rngAfter = rng.slice(1).map(Number);
      units.push(active);
      active = null;
    } else if (line === 'OVERFLOW first-omitted-call=9') {
      // The observer intentionally records only the first eight units.
    } else if (line.trim()) {
      throw new Error(`Unexpected screen report row: ${line.slice(0, 80)}`);
    }
  }
  if (active || units.length !== 8 || units.some((unit, index) => unit.id !== index + 1)) {
    throw new Error('Expected eight paired natural SCREEN-AND-STORE units');
  }
  return units;
}

function originalWriterUnit(unit, writerCalls, imageBytes) {
  const calls = writerCalls.filter(call => call.enter >= unit.start
    && call.exitPosition !== null && call.exitPosition <= unit.end);
  if (!calls.length || calls[0].enter !== unit.start || calls.at(-1).exitPosition !== unit.end) {
    throw new Error(`Writer calls do not cover screen unit ${unit.id}`);
  }
  for (let index = 1; index < calls.length; index += 1) {
    if (calls[index].enter !== calls[index - 1].exitPosition) {
      throw new Error(`Writer gap inside screen unit ${unit.id}`);
    }
  }
  const colorEvents = [];
  let pointIndex = 0;
  for (const call of calls) {
    if (call.selector === 'AARGB') {
      const match = /^INT:(\d+)$/.exec(call.scalar);
      if (!match) throw new Error(`Non-integer AARGB in screen unit ${unit.id}`);
      colorEvents.push({ beforePoint: pointIndex, index: Number(match[1]) });
      continue;
    }
    const expectedSelector = pointIndex === 0 ? 'MOVE-TO' : 'DRAW-TO';
    const expectedPoint = unit.points[pointIndex];
    const source = call.selector === 'MOVE-TO' ? call.pta : call.ptb;
    if (!expectedPoint || call.selector !== expectedSelector || call.redraw !== true
      || source.x !== `INT:${expectedPoint.x}` || source.y !== `INT:${expectedPoint.y}`) {
      throw new Error(`Point-to-writer mismatch in unit ${unit.id} at point ${pointIndex}`);
    }
    pointIndex += 1;
  }
  if (pointIndex !== unit.points.length) throw new Error(`Missing writer points in unit ${unit.id}`);
  const writer = new AaronStrokeWriter({ mode: 'small' });
  emitAaronScreenPath(writer, unit.points.map(point => [point.x, point.y]), {
    redraw: true, colorEvents,
  });
  const generated = Buffer.from(writer.output.replace(/\n/g, '\r\n'), 'latin1');
  const expected = imageBytes.subarray(unit.start, unit.end);
  assert.deepEqual(generated, expected, `screen unit ${unit.id} byte slice`);
  return {
    colorEvents,
    writerOrdinals: [calls[0].ordinal, calls.at(-1).ordinal],
    writerCallCount: calls.length,
    byteLength: expected.length,
    byteSha256: sha256(expected),
  };
}

export function deriveScreenUnitEvidence(reportBytes, tapeBytes, imageBytes, summary) {
  if (!summary?.complete || !/^screen-unit-seed-(1234|5678)$/.test(summary.mode)) {
    throw new Error('Expected a completed controlled screen-unit run');
  }
  const units = parseScreenReport(reportBytes.toString('utf8'));
  const tape = parseWriterFullReport(tapeBytes.toString('utf8'));
  return {
    schemaVersion: 1,
    source: {
      runId: summary.runId,
      mode: summary.mode,
      aa0Sha256: summary.aa0Sha256,
      reportSha256: sha256(reportBytes),
      writerTapeSha256: sha256(tapeBytes),
      imageSha256: sha256(imageBytes),
      scope: 'first eight natural SCREEN-AND-STORE calls; AARGB decisions remain captured inputs',
    },
    units: units.map(unit => ({
      ...unit,
      ...originalWriterUnit(unit, tape.calls, imageBytes),
    })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [reportPath, tapePath, imagePath, summaryPath, outputPath] = process.argv.slice(2);
  if (![reportPath, tapePath, imagePath, summaryPath, outputPath].every(Boolean)) {
    throw new Error('Usage: node derive-screen-unit-evidence.mjs REPORT TAPE IMAGE SUMMARY OUTPUT');
  }
  const evidence = deriveScreenUnitEvidence(
    readFileSync(reportPath), readFileSync(tapePath), readFileSync(imagePath),
    JSON.parse(readFileSync(summaryPath, 'utf8').replace(/^\uFEFF/, '')),
  );
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    outputPath,
    units: evidence.units.map(unit => ({
      id: unit.id, points: unit.points.length, colorEvents: unit.colorEvents.length,
      writerCalls: unit.writerCallCount, bytes: unit.byteLength,
    })),
  }, null, 2)}\n`);
}
