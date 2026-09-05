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

test('premium mode selects the measured compact palette family', () => {
  const result = generateAaron({ seed: 99, premium: true, figureCount: 1 });
  const analysis = analyzeAaDocument(result.document);
  assert.deepEqual(analysis.canvas, { width: 640, height: 480 });
  assert.equal(analysis.palette.entries, 148);
  assert.equal(result.scene.premium, true);
});

test('supports the measured normal-mode canvas profiles', () => {
  assert.equal(generateAaron({ seed: 1, profile: 'portrait' }).document.width, 487);
  assert.equal(generateAaron({ seed: 1, profile: 'tall' }).document.width, 650);
  assert.equal(generateAaron({ seed: 1, profile: 'square' }).document.width, 768);
  assert.equal(generateAaron({ seed: 1, profile: 'wide' }).document.width, 1024);
});

test('supports both measured small-image aspect profiles', () => {
  assert.equal(generateAaron({ seed: 1, smallImage: true, profile: 'portrait' }).document.width, 320);
  assert.equal(generateAaron({ seed: 1, smallImage: true, profile: 'wide' }).document.width, 640);
});

test('mirrors the retained compact screen-size variables', () => {
  const result = generateAaron({
    seed: 7,
    smallImage: true,
    paletteSize: 148,
    smallImageScreenWidth: 3840,
    smallImageScreenHeight: 1080,
    figureCount: 1,
  });
  const analysis = analyzeAaDocument(result.document);
  assert.deepEqual(analysis.canvas, { width: 1920, height: 1080 });
  assert.deepEqual(result.scene.requestedScreenWidth, 3840);
  assert.deepEqual(result.scene.requestedScreenHeight, 1080);
  assert.match(serializeAaFile(result.document), /^1920 1080 148\n/);
});
