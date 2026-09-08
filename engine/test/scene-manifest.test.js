import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAaBuilder } from '../src/aa-builder.js';
import { serializeAaFile } from '../src/aa-format.js';
import { generateAaron } from '../src/generator.js';
import {
  createSceneManifest,
  finalizeSceneManifest,
  recordSceneStage,
  replaySceneManifest,
} from '../src/scene-manifest.js';

const stageFixture = JSON.parse(readFileSync(
  new URL('./fixtures/scene-stage-integration.json', import.meta.url),
));

function sampleScenes() {
  return [{
    kind: 'figure',
    index: 2,
    placement: {
      frame: { x: 10, y: 20, width: 30, height: 40 },
      sourceBounds: { minX: 0, minY: 0, maxX: 2, maxY: 4 },
      bounds: { minX: 11, minY: 21, maxX: 39, maxY: 59 },
      scale: 7,
      offsetX: 11,
      offsetY: 21,
    },
    shapes: [{
      kind: 'torso',
      polygon: [[11, 21], [39, 21], [30, 59], [20, 59]],
      fill: 3,
      brush: 5,
      outline: true,
      zPath: false,
    }],
  }];
}

test('scene manifest records immutable geometry and complete stage ranges', () => {
  const builder = createAaBuilder({ width: 64, height: 64, palette: [[0, 0, 0], [1, 1, 1]] });
  builder.move(11, 21).draw(39, 21);
  builder.usePaint().brush(5).color(1).move(20, 30).draw(30, 30);
  const manifest = createSceneManifest(sampleScenes());
  recordSceneStage(manifest, 0, 0, 'outline', { start: 0, end: 2 }, { inputEdges: 4 });
  recordSceneStage(manifest, 0, 0, 'paint', { start: 0, end: 4 }, { operations: 4 });
  const document = builder.document();
  const finalized = finalizeSceneManifest(manifest, document);

  assert.equal(finalized.evidence, 'provisional-clean-room');
  assert.equal(finalized.objects[0].id, 'figure:2');
  assert.deepEqual(finalized.objects[0].transform, {
    scale: 7, offsetX: 11, offsetY: 21,
  });
  assert.deepEqual(finalized.objects[0].shapes[0].bounds, {
    minX: 11, minY: 21, maxX: 39, maxY: 59,
  });
  assert.deepEqual(finalized.stages.outline.range, { start: 0, end: 2 });
  assert.deepEqual(finalized.stages.paint.range, { start: 0, end: 4 });
  assert.deepEqual(finalized.document, {
    width: 64,
    height: 64,
    paletteSha256: '78dae23d55f351668373f151bcaedcdfd0bd09d26a50147cd6d76f4a751a88d4',
  });
  assert.match(finalized.objects[0].shapes[0].outlineSha256, /^[0-9a-f]{64}$/);
  assert.match(finalized.objects[0].shapes[0].paintSha256, /^[0-9a-f]{64}$/);
  assert(Object.isFrozen(finalized));
  assert(Object.isFrozen(finalized.objects[0].shapes[0].polygon));
  assert.throws(
    () => { finalized.objects[0].kind = 'changed'; },
    TypeError,
  );
});

test('scene manifest replay index returns exact per-shape operation slices', () => {
  const builder = createAaBuilder({ width: 64, height: 64, palette: [[0, 0, 0]] });
  builder.move(0, 0).draw(1, 0).draw(1, 1);
  builder.usePaint().brush(1).color(0).move(2, 2).draw(3, 2);
  const manifest = createSceneManifest([{
    kind: 'background',
    shapes: [
      { kind: 'a', polygon: [[0, 0], [1, 0]], fill: 0, brush: 1, outline: true },
      { kind: 'b', polygon: [[2, 2], [3, 2]], fill: 0, brush: 1, outline: true },
    ],
  }]);
  recordSceneStage(manifest, 0, 0, 'outline', { start: 0, end: 2 });
  recordSceneStage(manifest, 0, 1, 'outline', { start: 2, end: 3 });
  recordSceneStage(manifest, 0, 0, 'paint', { start: 0, end: 0 });
  recordSceneStage(manifest, 0, 1, 'paint', { start: 0, end: 4 });
  const document = builder.document();
  const finalized = finalizeSceneManifest(manifest, document);
  const replay = replaySceneManifest(document, finalized);
  assert.deepEqual(replay.objects.map(({ shapeId }) => shapeId), [
    'background:0/a:0', 'background:0/b:1',
  ]);
  assert.deepEqual(replay.objects[0].outline.operations, document.outline.slice(0, 2));
  assert.deepEqual(replay.objects[1].outline.operations, document.outline.slice(2, 3));
  assert.deepEqual(replay.objects[0].paint.operations, []);
  assert.deepEqual(replay.objects[1].paint.operations, document.paint);
  assert(Object.isFrozen(replay.objects[1].paint.operations));
  assert.deepEqual(replay.document, finalized.document);
});

test('scene manifest replay validates its capture and isolates operation objects', () => {
  const source = {
    width: 16,
    height: 16,
    palette: [[0, 0, 0]],
    outline: [{ command: 'am', x: 0, y: 0 }],
    paint: [],
  };
  const manifest = createSceneManifest([{
    kind: 'background',
    shapes: [{ kind: 'line', polygon: [[0, 0], [1, 1]], fill: 0, brush: 1, outline: true }],
  }]);
  recordSceneStage(manifest, 0, 0, 'outline', { start: 0, end: 1 });
  const finalized = finalizeSceneManifest(manifest, source);
  const replay = replaySceneManifest(source, finalized);
  assert.notEqual(replay.objects[0].outline.operations[0], source.outline[0]);
  source.outline[0].x = 9;
  assert.equal(replay.objects[0].outline.operations[0].x, 0);

  assert.throws(
    () => replaySceneManifest({ ...source, width: 32 }, finalized),
    /dimensions or palette/,
  );
  assert.throws(
    () => replaySceneManifest({ ...source, palette: [[1, 1, 1]] }, finalized),
    /dimensions or palette/,
  );
  assert.throws(
    () => replaySceneManifest({
      ...source,
      outline: [{ command: 'am', x: 1, y: 0 }],
    }, finalized),
    /scene (shape )?hash|stage does not match/,
  );
});

test('scene manifest rejects duplicate IDs and repeated stage assignments', () => {
  const duplicate = () => createSceneManifest([
    { id: 'same', kind: 'a', shapes: [] },
    { id: 'same', kind: 'b', shapes: [] },
  ]);
  assert.throws(duplicate, /duplicate scene object id/);

  const builder = createAaBuilder({ width: 16, height: 16, palette: [[0, 0, 0]] });
  builder.move(0, 0);
  const manifest = createSceneManifest(sampleScenes());
  recordSceneStage(manifest, 0, 0, 'outline', { start: 0, end: 1 });
  assert.throws(
    () => recordSceneStage(manifest, 0, 0, 'outline', { start: 0, end: 1 }),
    /already recorded/,
  );
});

test('scene manifest rejects stage gaps and overlaps', () => {
  const builder = createAaBuilder({ width: 16, height: 16, palette: [[0, 0, 0]] });
  builder.move(0, 0).draw(1, 0);
  const manifest = createSceneManifest(sampleScenes());
  recordSceneStage(manifest, 0, 0, 'outline', { start: 1, end: 2 });
  assert.throws(
    () => finalizeSceneManifest(manifest, builder.document()),
    /do not partition|do not cover/,
  );
});

test('scene manifest rejects overlapping stage ranges', () => {
  const builder = createAaBuilder({ width: 16, height: 16, palette: [[0, 0, 0]] });
  builder.move(0, 0).draw(1, 0);
  const manifest = createSceneManifest([{
    kind: 'background',
    shapes: [
      { kind: 'a', polygon: [[0, 0], [1, 0]], fill: 0, brush: 1, outline: true },
      { kind: 'b', polygon: [[2, 2], [3, 2]], fill: 0, brush: 1, outline: true },
    ],
  }]);
  recordSceneStage(manifest, 0, 0, 'outline', { start: 0, end: 2 });
  recordSceneStage(manifest, 0, 1, 'outline', { start: 1, end: 2 });
  assert.throws(
    () => finalizeSceneManifest(manifest, builder.document()),
    /do not partition|do not cover/,
  );
});

test('generator exposes traceable objects and exact stage coverage', () => {
  const result = generateAaron({ seed: 1234, figureCount: 2 });
  const manifest = result.scene.manifest;
  const shapes = manifest.objects.flatMap(({ shapes: objectShapes }) => objectShapes);
  assert.equal(manifest.stages.outline.operations, result.document.outline.length);
  assert.equal(manifest.stages.paint.operations, result.document.paint.length);
  assert.equal(new Set(manifest.objects.map(({ id }) => id)).size, manifest.objects.length);
  assert.equal(new Set(shapes.map(({ id }) => id)).size, shapes.length);
  assert.equal(manifest.objects.filter(({ kind }) => kind === 'figure').length, 2);
  assert(manifest.objects.every(({ placementStatus }) => (
    ['accepted', 'unplanned'].includes(placementStatus)
  )));
  const replay = replaySceneManifest(result.document, manifest);
  assert.equal(
    replay.objects.reduce((total, object) => total + (object.outline?.operations.length ?? 0), 0),
    result.document.outline.length,
  );
  assert.equal(
    replay.objects.reduce((total, object) => total + (object.paint?.operations.length ?? 0), 0),
    result.document.paint.length,
  );
});

test('scene-stage fixture covers polygon and measured FREE-PATH modes', () => {
  for (const expected of stageFixture.cases) {
    const result = generateAaron({
      seed: expected.sceneSeed,
      figureCount: expected.figureCount,
      outlineMode: expected.outlineMode,
      outlineSeed: expected.outlineSeed,
    });
    const manifest = result.scene.manifest;
    assert.equal(manifest.objects.length, expected.objects);
    assert.equal(
      manifest.objects.reduce((total, object) => total + object.shapes.length, 0),
      expected.shapes,
    );
    assert.equal(result.scene.composition.acceptedFigures, expected.acceptedFigures);
    assert.equal(manifest.stages.outline.operations, expected.outlineOperations);
    assert.equal(manifest.stages.paint.operations, expected.paintOperations);
    assert.equal(manifest.stages.outline.sha256, expected.outlineSha256);
    assert.equal(manifest.stages.paint.sha256, expected.paintSha256);
    const serialized = serializeAaFile(result.document);
    assert.equal(Buffer.byteLength(serialized), expected.serializedBytes);
    assert.equal(
      createHash('sha256').update(serialized).digest('hex'),
      expected.serializedSha256,
    );
  }
});
