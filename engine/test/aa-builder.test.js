import assert from 'node:assert/strict';
import test from 'node:test';

import { createAaBuilder } from '../src/aa-builder.js';
import { parseAaFile } from '../src/aa-format.js';

test('emits a two-phase AA document and round-trips it', () => {
  const builder = createAaBuilder({
    width: 20,
    height: 10,
    palette: [[0, 0, 0], [1, 0.5, 0]],
  });
  builder
    .move(1, 1)
    .draw(4.5, 2.25)
    .usePaint()
    .color(1)
    .brush(3)
    .move(2, 2)
    .chainTo(5, 4);

  const text = builder.text();
  const document = parseAaFile(text);
  assert.deepEqual(document.outline, [
    { command: 'am', x: 1, y: 1, lineNumber: 4 },
    { command: 'ad', x: 4.5, y: 2.25, lineNumber: 5 },
  ]);
  assert.deepEqual(document.paint.slice(0, 3), [
    { command: 'nc', index: 1, lineNumber: 7 },
    { command: 'nb', width: 3, lineNumber: 8 },
    { command: 'am', x: 2, y: 2, lineNumber: 9 },
  ]);
  assert.equal(document.paint.at(-1).command, 'e');
  assert.equal(document.paint.length, 6);
});

test('supports absolute z-paths in generated outlines', () => {
  const builder = createAaBuilder({
    width: 8,
    height: 8,
    palette: [[0, 0, 0]],
  });
  builder.move(0, 0, { z: true }).draw(7, 7, { z: true });
  const document = parseAaFile(builder.text());
  assert.deepEqual(document.outline.map(({ command }) => command), ['zm', 'zd']);
});
