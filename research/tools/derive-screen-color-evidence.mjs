import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { parseAaFile } from '../../engine/src/aa-format.js';
import { deriveScreenUnitEvidence } from './derive-screen-unit-evidence.mjs';

const COLOR_LIMIT = 64;
const UNIT_LIMIT = 8;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseColorReport(bytes) {
  const lines = bytes.toString('utf8').trimEnd().split(/\r?\n/);
  assert.equal(lines[0], 'BEGIN natural-screen-color-data v1');
  assert.equal(lines[1], 'CAPS calls=8 points-per-path=128 colors=64 fields-per-color=3');
  assert.equal(lines[2], 'READY target=SCREEN-AND-STORE');
  assert.equal(lines.at(-1), 'END natural-screen-color-data');

  let colorHeader = null;
  let colorEnd = null;
  const colors = [];
  const calls = [];
  const mapRows = [];
  const returns = [];
  for (const line of lines.slice(3, -1)) {
    let match;
    if ((match = /^COLORS-BEGIN count-at-least=(\d+)$/.exec(line))) {
      if (colorHeader) throw new Error('Repeated color-list header');
      colorHeader = Number(match[1]);
    } else if ((match = /^COLOR index=(\d+) type=AARGB .*?\(R \(:NUMBER SINGLE-FLOAT ([^\s)]+)\).*?\(G \(:NUMBER SINGLE-FLOAT ([^\s)]+)\).*?\(B \(:NUMBER SINGLE-FLOAT ([^\s)]+)\)/.exec(line))) {
      const index = Number(match[1]);
      if (index !== colors.length || index >= COLOR_LIMIT) {
        throw new Error('Color entries are unordered, duplicated, or exceed the capture cap');
      }
      const rgb = match.slice(2).map(Number);
      if (!rgb.every(Number.isFinite)) throw new Error(`Invalid AARGB channels at ${index}`);
      colors.push({ index, rgb });
    } else if ((match = /^COLORS-END shown=(\d+) tail=(\w+)$/.exec(line))) {
      if (colorEnd) throw new Error('Repeated color-list end');
      colorEnd = { shown: Number(match[1]), tail: match[2] };
    } else if ((match = /^CALL id=(\d+) point-count-at-most=(\d+) rplane=\(:NUMBER FIXNUM (-?\d+)\) sdex=\(:NUMBER FIXNUM (-?\d+)\) cdex=(\S+)$/.exec(line))) {
      const call = {
        id: Number(match[1]),
        pointCountAtMost: Number(match[2]),
        rplane: Number(match[3]),
        sdex: Number(match[4]),
        cdex: match[5],
      };
      if (call.id !== calls.length + 1) throw new Error('Screen call IDs are not sequential');
      calls.push(call);
    } else if ((match = /^MAPPOINT phase=(before|after) call=(\d+) point=(\d+) xy=\((-?\d+) (-?\d+)\) rplane=\(:NUMBER FIXNUM (-?\d+)\) xy-value=\(:NUMBER FIXNUM (-?\d+)\) yx-value=\(:NUMBER FIXNUM (-?\d+)\)$/.exec(line))) {
      mapRows.push({
        phase: match[1], call: Number(match[2]), point: Number(match[3]),
        x: Number(match[4]), y: Number(match[5]), rplane: Number(match[6]),
        xyValue: Number(match[7]), yxValue: Number(match[8]),
      });
    } else if ((match = /^RETURN id=(\d+) values=/.exec(line))) {
      returns.push(Number(match[1]));
    } else if (line === 'OVERFLOW first-omitted-call=9') {
      // The probe is intentionally capped after eight natural units.
    } else if (line.trim()) {
      throw new Error(`Unexpected screen-color report row: ${line.slice(0, 100)}`);
    }
  }

  assert.equal(colorHeader, COLOR_LIMIT + 1, 'palette capture must prove at least 65 entries');
  assert.deepEqual(colorEnd, { shown: COLOR_LIMIT, tail: 'CONS' });
  assert.equal(colors.length, COLOR_LIMIT);
  assert.equal(calls.length, UNIT_LIMIT);
  assert.deepEqual(returns, Array.from({ length: UNIT_LIMIT }, (_, index) => index + 1));
  return { colors, calls, mapRows };
}

export function deriveScreenColorEvidence({
  colorReportBytes,
  screenReportBytes,
  writerTapeBytes,
  imageBytes,
  aa0Bytes,
  summary,
}) {
  const screen = deriveScreenUnitEvidence(
    screenReportBytes, writerTapeBytes, imageBytes, summary,
  );
  const captured = parseColorReport(colorReportBytes);
  const aa0 = parseAaFile(aa0Bytes.toString('utf8'));

  const palette = captured.colors.map(({ index, rgb }) => {
    const headerRgb = aa0.palette[index];
    if (!headerRgb || rgb.some((value, channel) =>
      Number(value.toFixed(2)) !== headerRgb[channel])) {
      throw new Error(`AARGB ${index} does not match its AA0 header palette entry`);
    }
    return { index, rgb, aa0HeaderRgb: headerRgb };
  });

  const units = screen.units.map((unit, unitIndex) => {
    const call = captured.calls[unitIndex];
    if (call.id !== unit.id || call.pointCountAtMost !== unit.points.length) {
      throw new Error(`Color capture does not match screen unit ${unit.id}`);
    }
    const rows = captured.mapRows.filter(row => row.call === unit.id);
    const pointCount = unit.points.length;
    const before = rows.filter(row => row.phase === 'before');
    const after = rows.filter(row => row.phase === 'after');
    if (before.length !== pointCount || after.length !== pointCount) {
      throw new Error(`Incomplete fill-map samples for screen unit ${unit.id}`);
    }
    for (let point = 0; point < pointCount; point += 1) {
      const pointRecord = unit.points[point];
      for (const [phaseRows, phase] of [[before, 'before'], [after, 'after']]) {
        const row = phaseRows[point];
        if (row.point !== point || row.x !== pointRecord.x || row.y !== pointRecord.y
          || row.rplane !== call.rplane) {
          throw new Error(`Fill-map sample mismatch in unit ${unit.id}, ${phase} point ${point}`);
        }
      }
      if (before[point].xyValue !== after[point].xyValue
        || before[point].yxValue !== after[point].yxValue) {
        throw new Error(`SCREEN-AND-STORE changed sampled fill-map cell in unit ${unit.id}`);
      }
    }
    const colorEvents = unit.colorEvents.map(event => {
      const rgb = palette[event.index];
      if (!rgb) throw new Error(`Color index ${event.index} exceeds the captured palette prefix`);
      return { ...event, rgb: rgb.rgb, aa0HeaderRgb: rgb.aa0HeaderRgb };
    });
    return {
      id: unit.id,
      rplane: call.rplane,
      sdex: call.sdex,
      cdex: call.cdex,
      points: unit.points.length,
      fillMapAtXY: before.map(row => row.xyValue),
      fillMapAtYX: before.map(row => row.yxValue),
      fillMapUnchangedByScreen: true,
      colorEvents,
      writerCallCount: unit.writerCallCount,
      byteLength: unit.byteLength,
      byteSha256: unit.byteSha256,
    };
  });

  return {
    schemaVersion: 1,
    source: {
      runId: summary.runId,
      mode: summary.mode,
      smallImage: Boolean(summary.smallImage),
      aa0Sha256: summary.aa0Sha256,
      colorReportSha256: sha256(colorReportBytes),
      screenReportSha256: screen.source.reportSha256,
      writerTapeSha256: screen.source.writerTapeSha256,
      imageSha256: screen.source.imageSha256,
      aa0PaletteEntries: aa0.palette.length,
      paletteCaptureCount: palette.length,
      paletteMatchesHeaderRoundedToTwoDecimals: palette.length,
      scope: 'first eight seed-1234 natural SCREEN-AND-STORE calls on the compact canvas',
    },
    palettePrefix: palette,
    units,
    limits: [
      'The captured palette prefix and fill-map samples are original-engine inputs.',
      'Color-event selection and the routine producing RGB-MAP remain unresolved.',
      'Only the first eight screen paths and first 64 palette entries are retained.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [colorPath, screenPath, tapePath, imagePath, aa0Path, summaryPath, outputPath]
    = process.argv.slice(2);
  if (![colorPath, screenPath, tapePath, imagePath, aa0Path, summaryPath, outputPath]
    .every(Boolean)) {
    throw new Error('Usage: node derive-screen-color-evidence.mjs COLOR_REPORT SCREEN_REPORT TAPE IMAGE AA0 SUMMARY OUTPUT');
  }
  const evidence = deriveScreenColorEvidence({
    colorReportBytes: readFileSync(colorPath),
    screenReportBytes: readFileSync(screenPath),
    writerTapeBytes: readFileSync(tapePath),
    imageBytes: readFileSync(imagePath),
    aa0Bytes: readFileSync(aa0Path),
    summary: JSON.parse(readFileSync(summaryPath, 'utf8').replace(/^\uFEFF/, '')),
  });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    outputPath,
    aa0Sha256: evidence.source.aa0Sha256,
    paletteEntriesCompared: evidence.palettePrefix.length,
    units: evidence.units.map(unit => ({
      id: unit.id,
      points: unit.points,
      colorEvents: unit.colorEvents.map(({ beforePoint, index }) => ({ beforePoint, index })),
      uniqueFillAtXY: [...new Set(unit.fillMapAtXY)],
      uniqueFillAtYX: [...new Set(unit.fillMapAtYX)],
    })),
  }, null, 2)}\n`);
}
