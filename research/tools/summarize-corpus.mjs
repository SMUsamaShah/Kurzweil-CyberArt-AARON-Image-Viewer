#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseAaFile } from '../../engine/src/aa-format.js';
import { analyzeAaDocument } from '../../engine/src/aa-analysis.js';

const root = resolve(process.argv[2] ?? '.');
const entries = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /^aa(?:[0-9]|1[0-5])$/i.test(entry.name))
  .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

if (entries.length === 0) {
  throw new Error(`No AA0-AA15 files found in ${root}`);
}

const records = [];
for (const entry of entries) {
  const path = join(root, entry.name);
  const text = await readFile(path, 'utf8');
  const document = parseAaFile(text);
  const analysis = analyzeAaDocument(document);
  records.push({
    file: basename(path),
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
    analysis,
  });
}

function values(selector) {
  return records.map(selector).filter((value) => Number.isFinite(value));
}

function range(list) {
  return list.length === 0 ? null : {
    min: Math.min(...list),
    max: Math.max(...list),
    mean: list.reduce((sum, value) => sum + value, 0) / list.length,
  };
}

function mergeCommandCounts(channel) {
  const counts = {};
  for (const record of records) {
    for (const [command, count] of Object.entries(record.analysis[channel].commands)) {
      counts[command] = (counts[command] ?? 0) + count;
    }
  }
  return counts;
}

const canvasKeys = new Set(records.map(({ analysis }) =>
  `${analysis.canvas.width}x${analysis.canvas.height}`));
const paletteSizes = values(({ analysis }) => analysis.palette.entries);
const outlineOperations = values(({ analysis }) => analysis.outline.operations);
const paintOperations = values(({ analysis }) => analysis.paint.operations);
const outlineSegments = values(({ analysis }) => analysis.outline.segments);
const paintSegments = values(({ analysis }) => analysis.paint.segments);
const paintChainSegments = values(({ analysis }) => analysis.paint.chainSegments);

console.log(JSON.stringify({
  root,
  files: records.length,
  canvasSizes: [...canvasKeys].sort(),
  paletteEntries: range(paletteSizes),
  outlineOperations: range(outlineOperations),
  paintOperations: range(paintOperations),
  outlineSegments: range(outlineSegments),
  paintSegments: range(paintSegments),
  paintChainSegments: range(paintChainSegments),
  commandTotals: {
    outline: mergeCommandCounts('outline'),
    paint: mergeCommandCounts('paint'),
  },
  records,
}, null, 2));
