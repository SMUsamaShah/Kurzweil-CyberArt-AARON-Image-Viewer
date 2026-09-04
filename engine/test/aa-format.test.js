import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { AaFormatError, parseAaFile } from '../src/aa-format.js';

async function sample(name) {
  return readFile(new URL(`../../${name}`, import.meta.url), 'utf8');
}

test('parses the AA0 golden sample into outline and paint phases', async () => {
  const document = parseAaFile(await sample('aa0'));
  assert.equal(document.width, 1920);
  assert.equal(document.height, 1080);
  assert.equal(document.palette.length, 148);
  assert.equal(document.outline.length, 3_547);
  assert.equal(document.paint.length, 246_159);
  assert.deepEqual(document.outline[0], {
    command: 'am',
    x: 728,
    y: 419.95,
    lineNumber: 150,
  });
});

test('parses the AA7 golden sample with its independent palette', async () => {
  const document = parseAaFile(await sample('aa7'));
  assert.equal(document.width, 1920);
  assert.equal(document.height, 1080);
  assert.equal(document.palette.length, 184);
  assert.equal(document.outline.length, 6_220);
  assert.equal(document.paint.length, 260_178);
});

test('rejects an invalid colour reference', () => {
  assert.throws(
    () => parseAaFile('10 10 1\n0 0 0\ncolor\nnc 1\nend\n'),
    (error) => error instanceof AaFormatError && /colour index/.test(error.message),
  );
});

test('requires both phase markers', () => {
  assert.throws(
    () => parseAaFile('10 10 1\n0 0 0\nam 0 0\nend\n'),
    /end appears before color/,
  );
});
