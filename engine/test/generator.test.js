import assert from 'node:assert/strict';
import test from 'node:test';

import { generateAaron } from '../src/generator.js';
import { analyzeAaDocument } from '../src/aa-analysis.js';
import { parseAaFile, serializeAaFile } from '../src/aa-format.js';

test('generates a deterministic large-mode AA document', () => {
  const left = generateAaron({ seed: 1234, figureCount: 2 });
  const right = generateAaron({ seed: 1234, figureCount: 2 });
  assert.equal(serializeAaFile(left.document), serializeAaFile(right.document));
  assert.deepEqual(left.scene, right.scene);
  const analysis = analyzeAaDocument(left.document);
  assert.deepEqual(analysis.canvas, { width: 1024, height: 768 });
  assert.equal(analysis.palette.entries, 148);
  assert(analysis.outline.commands.zm > 0);
  assert(analysis.paint.chainSegments > 0);
});

test('small-image mode uses the recovered 640x480 profile', () => {
  const result = generateAaron({ seed: 99, smallImage: true, figureCount: 1 });
  const roundTrip = parseAaFile(serializeAaFile(result.document));
  const analysis = analyzeAaDocument(roundTrip);
  assert.deepEqual(analysis.canvas, { width: 640, height: 480 });
  assert.equal(analysis.palette.entries, 184);
  assert.equal(result.scene.smallImage, true);
});
