import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parseCompiledObjectTable,
  parseDxlDescriptorLayout,
  parseIndexTable,
  parsePll,
  readTaggedString,
  resolveIndexedStrings,
} from '../index-allegro-image.mjs';

function syntheticCompiledObjects() {
  const image = Buffer.alloc(0x80, 0);
  const table = {
    offset: 0x08,
    records: [
      { offset: 0x08, first: 0x40, second: 2 },
      { offset: 0x10, first: 0x50, second: 4 },
    ],
  };
  image.writeUInt32LE((6 << 8) | 0x6c, 0x48);
  image.writeUInt32LE((8 << 8) | 0x6c, 0x58);
  return { image, table };
}

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

test('validates first-table compiled-object spans without assigning names', () => {
  const { image, table } = syntheticCompiledObjects();
  const result = parseCompiledObjectTable(image, table, { finalBoundary: 0x70 });
  assert.equal(result.objectCount, 2);
  assert.equal(result.objectOffsetsDistinct, true);
  assert.equal(result.allExpectedTag, true);
  assert.equal(result.allLengthFieldsMatchSecondWord, true);
  assert.equal(result.boundaryAgreement, true);
  assert.equal(result.finalBoundaryMatchesExpected, true);
  assert.equal(result.allPaddingZero, true);
  assert.deepEqual(result.paddingLengthCounts, { 0: 1, 4: 1 });
  assert.deepEqual(result.objects.map(({ objectOffset, nextBoundary }) => ({
    objectOffset,
    nextBoundary,
  })), [
    { objectOffset: 0x48, nextBoundary: 0x58 },
    { objectOffset: 0x58, nextBoundary: 0x70 },
  ]);
});

test('accepts the complete retained PLL layout and cross-reference counts', () => {
  const path = new URL('../../introspection/static-image-index.json', import.meta.url);
  const index = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(index.artifacts.pll.size, 4573464);
  assert.equal(index.pll.firstTable.recordCount, 7723);
  assert.equal(index.pll.firstTable.compiledObjects.objectCount, 7723);
  assert.equal(index.pll.firstTable.compiledObjects.allExpectedTag, true);
  assert.equal(index.pll.firstTable.compiledObjects.allLengthFieldsMatchSecondWord, true);
  assert.equal(index.pll.firstTable.compiledObjects.boundaryAgreement, true);
  assert.equal(index.pll.firstTable.compiledObjects.finalBoundary, 0x2b4b90);
  assert.equal(index.pll.firstTable.compiledObjects.finalBoundaryMatchesExpected, true);
  assert.equal(index.pll.firstTable.compiledObjects.allPaddingZero, true);
  assert.equal(index.pll.stringTable.recordCount, 53039);
  assert.equal(index.pll.stringTable.allStringObjects, true);
  assert.equal(index.pll.stringTable.allNulTerminated, true);
  assert.equal(index.pll.indexedTargetSymbols.length, 16);
  assert.equal(index.pll.indexedTargetSymbols.every(({ found }) => found), true);
  assert.equal(index.pll.indexedCoreFaslModuleCount, 50);
  assert.equal(index.crossReference.allKnownFunctionsIndexed, true);
  assert.equal(index.crossReference.pllCoreFaslModulesAlsoInDxl, true);
  const brush = index.pll.selectedSymbols.find(({ name }) => name === 'BRUSH-STROKE');
  assert.deepEqual(
    { recordOffset: brush.recordOffset, objectOffset: brush.objectOffset, key: brush.key },
    { recordOffset: 0x2d3988, objectOffset: 0x37e9d0, key: 21271 },
  );
});

test('derives DXL descriptor continuity without assigning loader semantics', () => {
  const image = Buffer.alloc(0x80000, 0);
  image.writeUInt32LE(4, 0x60);
  const descriptors = [
    [0x10000, 0x20000000, 0x20000],
    [0x30000, 0x20030000, 0x10000],
    [0x40000, 0x20050000, 0x20000],
    [0x60000, 0x20080000, 0x10000],
  ];
  descriptors.forEach((descriptor, index) => {
    descriptor.forEach((value, word) => image.writeUInt32LE(value, 0x64 + index * 12 + word * 4));
  });
  image.writeUInt32LE(0x20000000, 0x18);
  image.writeUInt32LE(0x20090000, 0x1c);
  image.writeUInt32LE(0x70000, 0x54);
  const result = parseDxlDescriptorLayout(image);
  assert.equal(result.descriptorCount, 4);
  assert.equal(result.allFields64KAligned, true);
  assert.equal(result.word1SpansWithinImage, true);
  assert.equal(result.word1SpansContiguous, true);
  assert.equal(result.word1SpanEnd, 0x70000);
  assert.equal(result.filePrefixBytes, 0x10000);
  assert.equal(result.fileSuffixBytes, image.length - 0x70000);
  assert.deepEqual(result.candidateAddressGaps.map(({ bytes }) => bytes), [0x10000, 0x10000, 0x10000]);
  assert.deepEqual(result.headerComparisons, {
    wordAt18: 0x20000000,
    wordAt1c: 0x20090000,
    wordAt54: 0x70000,
    firstWord2MatchesWordAt18: true,
    lastWord2EndMatchesWordAt1c: true,
    lastWord1EndMatchesWordAt54: true,
  });
});

test('retains the validated DXL source-object chain and auxiliary basenames', () => {
  const path = new URL('../../introspection/static-image-index.json', import.meta.url);
  const index = JSON.parse(readFileSync(path, 'utf8'));
  const layout = index.artifacts.dxl.descriptorLayout;
  assert.equal(layout.descriptorCount, 4);
  assert.equal(layout.allFields64KAligned, true);
  assert.equal(layout.word1SpansContiguous, true);
  assert.equal(layout.word1SpanStart, 0x10000);
  assert.equal(layout.word1SpanEnd, 0x500000);
  assert.equal(layout.filePrefixBytes, 0x10000);
  assert.equal(layout.fileSuffixBytes, 0x20000);
  assert.deepEqual(layout.headerComparisons, {
    wordAt18: 0x20000000,
    wordAt1c: 0x205f0000,
    wordAt54: 0x500000,
    firstWord2MatchesWordAt18: true,
    lastWord2EndMatchesWordAt1c: true,
    lastWord1EndMatchesWordAt54: true,
  });
  const chain = index.dxl.sourceObjectChain;
  assert.equal(chain.objectCount, 53);
  assert.equal(chain.regionStart, 0x1b65e8);
  assert.equal(chain.regionEnd, 0x1b6fa8);
  assert.equal(chain.allExpectedTag, true);
  assert.equal(chain.allNulTerminated, true);
  assert.equal(chain.chainTilesRegion, true);
  assert.equal(chain.coreHarold3Count, 50);
  assert.equal(chain.interfaceCount, 1);
  assert.deepEqual(chain.auxiliaryBasenames, ['review-s.lisp', 'local-f.lisp']);
  assert.equal(chain.paddingByteCount, 172);
  assert.equal(chain.paddingNonzeroByteCount, 101);
});

test('rejects wrong tags, missing terminators, and wrong table counts', () => {
  const image = syntheticPll();
  assert.throws(() => readTaggedString(image, 0x80, 0x66), /tag/);
  assert.throws(() => parseIndexTable(image, 0x40, { expectedCount: 3 }), /does not match/);
  image.writeUInt32LE(1, 0x50);
  assert.throws(() => parseIndexTable(image, 0x40, { expectedCount: 2 }), /does not match/);
});
