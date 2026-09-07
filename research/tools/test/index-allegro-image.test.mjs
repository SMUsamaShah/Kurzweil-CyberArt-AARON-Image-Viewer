import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parseIndexTable,
  parsePll,
  readTaggedString,
  resolveIndexedStrings,
} from '../index-allegro-image.mjs';

function syntheticPll() {
  const image = Buffer.alloc(0x100, 0);
  image.writeUInt32LE(0x1234, 0x10);
  image.writeUInt32LE(1, 0x14);
  image.writeUInt32LE(0, 0x18);
  image.writeUInt32LE(0, 0x1c);

  image.writeUInt32LE(0x40, 0x40);
  image.writeUInt32LE(1, 0x44);
  image.writeUInt32LE(0x48, 0x48);
  image.writeUInt32LE(2, 0x4c);
  image.writeUInt32LE(0, 0x50);
  image.writeUInt32LE(0, 0x54);

  image.writeUInt32LE((3 << 8) | 0x65, 0x80);
  image.write('ONE', 0x84, 'ascii');
  image[0x87] = 0;
  image.writeUInt32LE((3 << 8) | 0x65, 0x88);
  image.write('TWO', 0x8c, 'ascii');
  image[0x8f] = 0;
  return image;
}

test('parses terminated two-word tables and resolves tagged strings', () => {
  const image = syntheticPll();
  const table = parseIndexTable(image, 0x40, {
    expectedCount: 2,
    label: 'synthetic string table',
  });
  assert.equal(table.terminatorOffset, 0x50);
  assert.equal(table.secondWordNondecreasing, true);
  assert.deepEqual(resolveIndexedStrings(image, table, 0x40).map(({ text, key }) => ({ text, key })), [
    { text: 'ONE', key: 1 },
    { text: 'TWO', key: 2 },
  ]);
});

test('accepts the complete retained PLL layout and cross-reference counts', () => {
  const path = new URL('../../introspection/static-image-index.json', import.meta.url);
  const index = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(index.artifacts.pll.size, 4573464);
  assert.equal(index.pll.firstTable.recordCount, 7723);
  assert.equal(index.pll.stringTable.recordCount, 53039);
  assert.equal(index.pll.stringTable.allStringObjects, true);
  assert.equal(index.pll.stringTable.allNulTerminated, true);
  assert.equal(index.pll.indexedCoreFaslModuleCount, 50);
  assert.equal(index.crossReference.allKnownFunctionsIndexed, true);
  assert.equal(index.crossReference.pllCoreFaslModulesAlsoInDxl, true);
  const brush = index.pll.selectedSymbols.find(({ name }) => name === 'BRUSH-STROKE');
  assert.deepEqual(
    { recordOffset: brush.recordOffset, objectOffset: brush.objectOffset, key: brush.key },
    { recordOffset: 0x2d3988, objectOffset: 0x37e9d0, key: 21271 },
  );
});

test('rejects wrong tags, missing terminators, and wrong table counts', () => {
  const image = syntheticPll();
  assert.throws(() => readTaggedString(image, 0x80, 0x66), /tag/);
  assert.throws(() => parseIndexTable(image, 0x40, { expectedCount: 3 }), /does not match/);
  image.writeUInt32LE(1, 0x50);
  assert.throws(() => parseIndexTable(image, 0x40, { expectedCount: 2 }), /does not match/);
});
