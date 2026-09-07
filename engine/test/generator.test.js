import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { generateAaron } from '../src/generator.js';
import { analyzeAaDocument } from '../src/aa-analysis.js';
import { parseAaFile, serializeAaFile } from '../src/aa-format.js';

const freePathIntegration = JSON.parse(readFileSync(
  new URL('./fixtures/free-path-outline-integration.json', import.meta.url),
));

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

test('accepted planner frames now control generated figure count and bounds', () => {
  const result = generateAaron({ seed: 7, width: 320, height: 240, figureCount: 10 });
  assert.equal(result.scene.composition.status, 'provisional-planned');
  assert.equal(result.scene.composition.requestedFigures, 10);
  assert.equal(result.scene.composition.acceptedFigures, 3);
  assert.deepEqual(result.scene.composition.rejectedFigureIndices, [3, 4, 5, 6, 7, 8, 9]);
  assert.equal(result.scene.figures, 3);
  for (const placement of result.scene.figurePlacements) {
    assert(placement.bounds.minX >= placement.frame.x);
    assert(placement.bounds.minY >= placement.frame.y);
    assert(placement.bounds.maxX <= placement.frame.x + placement.frame.width);
    assert(placement.bounds.maxY <= placement.frame.y + placement.frame.height);
  }
});

test('measured FREE-PATH subset can generate outlines without changing scene paint', () => {
  const polygon = generateAaron({ seed: 1234, figureCount: 2 });
  const freePath = generateAaron({
    seed: 1234,
    figureCount: 2,
    outlineMode: 'free-path-subset',
    outlineSeed: 1234,
  });
  const repeat = generateAaron({
    seed: 1234,
    figureCount: 2,
    outlineMode: 'free-path-subset',
    outlineSeed: 1234,
  });
  assert.equal(freePath.scene.outlineMode, 'free-path-subset');
  const expected = freePathIntegration.cases[0];
  const serialized = serializeAaFile(freePath.document);
  assert.equal(freePath.scene.outlineSampling.inputEdges, expected.inputEdges);
  assert.equal(freePath.scene.outlineSampling.emittedPoints, expected.emittedPoints);
  assert(freePath.scene.outlineSampling.emittedPoints > polygon.scene.outlineSampling.emittedPoints);
  assert.deepEqual(freePath.document.paint, polygon.document.paint);
  assert.deepEqual(freePath.document.palette, polygon.document.palette);
  assert.deepEqual(serialized, serializeAaFile(repeat.document));
  assert.equal(freePath.document.paint.length, expected.paintOperations);
  assert.equal(Buffer.byteLength(serialized), expected.serializedBytes);
  assert.equal(createHash('sha256').update(serialized).digest('hex'), expected.sha256);
});

test('second local FREE-PATH integration case remains deterministic', () => {
  const expected = freePathIntegration.cases[1];
  const result = generateAaron({
    seed: expected.sceneSeed,
    figureCount: expected.figureCount,
    outlineMode: freePathIntegration.outlineMode,
    outlineSeed: expected.outlineSeed,
  });
  const serialized = serializeAaFile(result.document);
  assert.equal(result.scene.outlineSampling.inputEdges, expected.inputEdges);
  assert.equal(result.scene.outlineSampling.emittedPoints, expected.emittedPoints);
  assert.equal(result.document.paint.length, expected.paintOperations);
  assert.equal(Buffer.byteLength(serialized), expected.serializedBytes);
  assert.equal(createHash('sha256').update(serialized).digest('hex'), expected.sha256);
});

test('free-path subset requires an explicit outline seed', () => {
  assert.throws(
    () => generateAaron({ seed: 1, outlineMode: 'free-path-subset' }),
    /outlineSeed/,
  );
});
