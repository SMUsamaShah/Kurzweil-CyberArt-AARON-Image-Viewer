#!/usr/bin/env node

/**
 * Read-only structural index for the preserved Allegro Common Lisp images.
 *
 * This parser does not load, evaluate, relocate, or disassemble a DXL/PLL.
 * It validates the indexed string table present in the complete AARON.pll,
 * records exact offsets/keys for selected names and source markers, and keeps
 * DXL header values opaque.  It is therefore suitable for local archaeology
 * without executing the archived Windows runtime.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_PLL_LAYOUT = Object.freeze({
  firstTableOffset: 0x40,
  firstTableCount: 7723,
  stringTableOffset: 0x2b4b90,
  stringTableCount: 53039,
  stringObjectTag: 0x65,
});

const PRINTABLE_MIN = 4;
const PRINTABLE_MAX = 126;
const SOURCE_SUFFIX = /\.(?:fasl|lisp|cl)$/i;
const SYMBOL_PATTERN = /^[A-Z0-9*+\-/<=>!?_.$%&@^~:#]+$/;
const APPLICATION_NAME_PATTERN = /(?:AARON|KCAT|PLAN|MPLAN|COMPOSE|FIGURE|BODY|POSE|ARM|HAND|HEAD|HAIR|TORSO|LEG|PLANT|TREE|POT|BLOX|PLINTH|BRUSH|PAINT|FILL|HUE|COLOR|COLOUR|CFORM|MAP|EDGE|PATH|LINE|RAN|RANDOM|RSEED|SCREEN|CANVAS|PREMIUM)/;
const CONTEXT_TARGET_NAMES = Object.freeze([
  'MPLAN', 'PLAN', 'SCRIPT', 'PREFS', 'SDEX', 'FIGDEX', 'CFLIST', 'IDLIST',
  'CFRAME', 'BRUSH', 'PAINT-BRUSH', 'ALL-BRUSHES', 'FILL-MAP', 'RPLANE',
  'RGB-MAP', 'COLORDEX',
]);

function assertBuffer(buffer, label) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError(`${label} must be a Buffer`);
}

function u32(buffer, offset, label) {
  if (!Number.isInteger(offset) || offset < 0 || offset + 4 > buffer.length) {
    throw new RangeError(`${label} word is outside the image at 0x${offset.toString(16)}`);
  }
  return buffer.readUInt32LE(offset);
}

export function sha256(buffer) {
  assertBuffer(buffer, 'image');
  return createHash('sha256').update(buffer).digest('hex');
}

export function extractAsciiRuns(buffer, minimumLength = PRINTABLE_MIN) {
  assertBuffer(buffer, 'image');
  if (!Number.isInteger(minimumLength) || minimumLength < 1) {
    throw new RangeError('minimumLength must be a positive integer');
  }
  const runs = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer[offset] >= 0x20 && buffer[offset] <= PRINTABLE_MAX) {
      const start = offset;
      while (offset < buffer.length
        && buffer[offset] >= 0x20 && buffer[offset] <= PRINTABLE_MAX) offset += 1;
      if (offset - start >= minimumLength) {
        runs.push({ offset: start, text: buffer.subarray(start, offset).toString('ascii') });
      }
    } else {
      offset += 1;
    }
  }
  return runs;
}

export function parseIndexTable(buffer, offset, {
  expectedCount = null,
  label = 'index table',
  maxRecords = 1_000_000,
} = {}) {
  assertBuffer(buffer, 'image');
  if (!Number.isInteger(offset) || offset < 0 || offset % 4 !== 0) {
    throw new RangeError(`${label} offset must be a non-negative word boundary`);
  }
  const records = [];
  let cursor = offset;
  let previousSecond = null;
  while (records.length < maxRecords) {
    const first = u32(buffer, cursor, label);
    const second = u32(buffer, cursor + 4, label);
    if (first === 0 && second === 0) {
      if (expectedCount !== null && records.length !== expectedCount) {
        throw new Error(`${label} count ${records.length} does not match expected ${expectedCount}`);
      }
      return {
        offset,
        recordCount: records.length,
        terminatorOffset: cursor,
        records,
        secondWordNondecreasing: records.every((record) => (
          record.second >= (record.previousSecond ?? record.second)
        )),
      };
    }
    records.push({
      offset: cursor,
      first,
      second,
      previousSecond,
    });
    previousSecond = second;
    cursor += 8;
  }
  throw new Error(`${label} exceeded maxRecords without a zero terminator`);
}

export function readTaggedString(buffer, offset, tag = 0x65) {
  const header = u32(buffer, offset, 'string object');
  const length = header >>> 8;
  if ((header & 0xff) !== tag) {
    throw new Error(`string object at 0x${offset.toString(16)} has tag 0x${(header & 0xff).toString(16)}`);
  }
  const start = offset + 4;
  const end = start + length;
  if (end >= buffer.length) throw new RangeError(`string object at 0x${offset.toString(16)} exceeds image`);
  if (buffer[end] !== 0) throw new Error(`string object at 0x${offset.toString(16)} is not NUL terminated`);
  return {
    offset,
    header,
    tag,
    length,
    text: buffer.subarray(start, end).toString('ascii'),
    nulOffset: end,
  };
}

export function resolveIndexedStrings(buffer, table, objectBase, tag = 0x65) {
  assertBuffer(buffer, 'image');
  if (!table || !Array.isArray(table.records)) throw new TypeError('table must contain records');
  const resolved = [];
  for (const record of table.records) {
    const objectOffset = objectBase + record.first;
    const string = readTaggedString(buffer, objectOffset, tag);
    resolved.push({
      recordOffset: record.offset,
      objectOffset,
      key: record.second,
      ...string,
    });
  }
  return resolved;
}

function alignUp(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function prefixHex(buffer, offset, length = 4) {
  return buffer.subarray(offset, offset + length).toString('hex');
}

/**
 * Validate the object spans addressed by the PLL's first table.
 *
 * The first table is not treated as a function-name map here.  It is only
 * checked as a table of tagged code-like objects: each record's second word
 * predicts the encoded object length, and sorted object offsets must tile the
 * image up to the string table.  This deliberately stops short of assigning
 * entry points or symbol names.
 */
export function parseCompiledObjectTable(buffer, table, {
  objectBase = table?.offset,
  expectedTag = 0x6c,
  finalBoundary = null,
} = {}) {
  assertBuffer(buffer, 'image');
  if (!table || !Array.isArray(table.records)) {
    throw new TypeError('table must contain records');
  }
  if (!Number.isInteger(objectBase) || objectBase < 0) {
    throw new RangeError('objectBase must be a non-negative integer');
  }

  const objects = table.records.map((record) => {
    const objectOffset = objectBase + record.first;
    if (objectOffset % 8 !== 0) {
      throw new Error(`compiled object at 0x${objectOffset.toString(16)} is not eight-byte aligned`);
    }
    const header = u32(buffer, objectOffset, 'compiled object');
    const tag = header & 0xff;
    const encodedWords = header >>> 8;
    const rawEnd = objectOffset + 4 + encodedWords * 2;
    const nextBoundary = alignUp(rawEnd, 8);
    if (nextBoundary > buffer.length) {
      throw new RangeError(`compiled object at 0x${objectOffset.toString(16)} exceeds image`);
    }
    const padding = buffer.subarray(rawEnd, nextBoundary);
    return {
      recordOffset: record.offset,
      objectOffset,
      first: record.first,
      second: record.second,
      header,
      tag,
      encodedWords,
      expectedEncodedWords: record.second + 4,
      rawEnd,
      nextBoundary,
      paddingLength: padding.length,
      paddingZero: [...padding].every((value) => value === 0),
      prefix: prefixHex(buffer, objectOffset + 4),
    };
  });

  const sorted = [...objects].sort((a, b) => a.objectOffset - b.objectOffset);
  const objectOffsets = new Set(sorted.map(({ objectOffset }) => objectOffset));
  const boundaryAgreement = sorted.every((object, index) => (
    object.nextBoundary === (sorted[index + 1]?.objectOffset ?? finalBoundary)
  ));
  const tagCounts = new Map();
  const prefixCounts = new Map();
  const paddingLengthCounts = new Map();
  for (const object of sorted) {
    tagCounts.set(object.tag, (tagCounts.get(object.tag) ?? 0) + 1);
    prefixCounts.set(object.prefix, (prefixCounts.get(object.prefix) ?? 0) + 1);
    paddingLengthCounts.set(
      object.paddingLength,
      (paddingLengthCounts.get(object.paddingLength) ?? 0) + 1,
    );
  }
  const summarizeCounts = (counts) => Object.fromEntries(
    [...counts.entries()].sort(([a], [b]) => Number(a) - Number(b)),
  );
  const commonPrefixes = [...prefixCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([prefix, count]) => ({ prefix, count }));

  return {
    objectBase,
    objectCount: objects.length,
    objectOffsetsDistinct: objectOffsets.size === objects.length,
    objectOffsetsAligned: sorted.every(({ objectOffset }) => objectOffset % 8 === 0),
    expectedTag,
    allExpectedTag: sorted.every(({ tag }) => tag === expectedTag),
    allLengthFieldsMatchSecondWord: sorted.every((object) => (
      object.encodedWords === object.expectedEncodedWords
    )),
    boundaryAgreement,
    finalBoundary: sorted.at(-1)?.nextBoundary ?? null,
    finalBoundaryExpected: finalBoundary,
    finalBoundaryMatchesExpected: finalBoundary === null
      ? null
      : (sorted.at(-1)?.nextBoundary ?? null) === finalBoundary,
    allPaddingZero: sorted.every(({ paddingZero }) => paddingZero),
    tagCounts: summarizeCounts(tagCounts),
    paddingLengthCounts: summarizeCounts(paddingLengthCounts),
    commonPrefixes,
    firstObject: sorted[0] ?? null,
    lastObject: sorted.at(-1) ?? null,
    objects,
  };
}

function compiledObjectSummary(result) {
  const {
    objects,
    ...summary
  } = result;
  return summary;
}

function normalizePath(text) {
  return text.replaceAll('\\', '/');
}

function sourceInfo(text) {
  const normalized = normalizePath(text);
  if (!SOURCE_SUFFIX.test(normalized)) return null;
  const name = basename(normalized);
  return {
    text,
    normalized,
    basename: name,
    module: name.replace(SOURCE_SUFFIX, '').toLowerCase(),
    coreHarold3: /\/core\/harold3\//i.test(normalized),
  };
}

function artifactMetadata(path, buffer, extra = {}) {
  return {
    name: basename(path),
    size: buffer.length,
    sha256: sha256(buffer),
    ...extra,
  };
}

function selectedSymbols(strings, functionInventory) {
  const dynamicNames = new Set((functionInventory?.functions ?? [])
    .map((name) => name.toUpperCase()));
  const textSet = new Set(strings.map(({ text }) => text));
  const firstByText = new Map();
  for (const entry of strings) {
    if (!firstByText.has(entry.text)) firstByText.set(entry.text, entry);
  }
  return [...firstByText.values()]
    .filter(({ text }) => (
      SYMBOL_PATTERN.test(text)
      && text === text.toUpperCase()
      && textSet.has(text.toLowerCase())
      && APPLICATION_NAME_PATTERN.test(text)
    ))
    .map(({ text, recordOffset, objectOffset, key }) => ({
      name: text,
      recordOffset,
      objectOffset,
      key,
      dynamicFunction: dynamicNames.has(text.toUpperCase()),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function indexedTargetSymbols(strings) {
  const firstByText = new Map();
  for (const entry of strings) {
    if (!firstByText.has(entry.text)) firstByText.set(entry.text, entry);
  }
  return CONTEXT_TARGET_NAMES.map((name) => {
    const entry = firstByText.get(name);
    return entry ? {
      name,
      found: true,
      recordOffset: entry.recordOffset,
      objectOffset: entry.objectOffset,
      key: entry.key,
    } : { name, found: false };
  });
}

export function parsePll(buffer, layout = DEFAULT_PLL_LAYOUT) {
  assertBuffer(buffer, 'PLL image');
  const firstTable = parseIndexTable(buffer, layout.firstTableOffset, {
    expectedCount: layout.firstTableCount,
    label: 'PLL first table',
  });
  const stringTable = parseIndexTable(buffer, layout.stringTableOffset, {
    expectedCount: layout.stringTableCount,
    label: 'PLL string table',
  });
  const strings = resolveIndexedStrings(
    buffer,
    stringTable,
    layout.stringTableOffset,
    layout.stringObjectTag,
  );
  const compiledObjects = parseCompiledObjectTable(buffer, firstTable, {
    objectBase: firstTable.offset,
    expectedTag: 0x6c,
    finalBoundary: layout.stringTableOffset,
  });
  return {
    layout,
    firstTable: {
      offset: firstTable.offset,
      recordCount: firstTable.recordCount,
      terminatorOffset: firstTable.terminatorOffset,
      secondWordNondecreasing: firstTable.secondWordNondecreasing,
      firstRecord: firstTable.records[0],
      lastRecord: firstTable.records.at(-1),
      compiledObjects: compiledObjectSummary(compiledObjects),
    },
    stringTable: {
      offset: stringTable.offset,
      recordCount: stringTable.recordCount,
      terminatorOffset: stringTable.terminatorOffset,
      secondWordNondecreasing: stringTable.secondWordNondecreasing,
      allStringObjects: true,
      allNulTerminated: true,
      uniqueStringCount: new Set(strings.map(({ text }) => text)).size,
      firstString: strings[0],
      lastString: strings.at(-1),
    },
    strings,
  };
}

function dxlHeader(buffer) {
  if (buffer.length < 0x98) throw new RangeError('DXL image is too short for its header');
  const descriptorCount = u32(buffer, 0x60, 'DXL descriptor count');
  const descriptors = [];
  for (let index = 0; index < descriptorCount; index += 1) {
    const offset = 0x64 + index * 12;
    descriptors.push({
      offset,
      word1: u32(buffer, offset, 'DXL descriptor'),
      word2: u32(buffer, offset + 4, 'DXL descriptor'),
      word3: u32(buffer, offset + 8, 'DXL descriptor'),
    });
  }
  return { descriptorCount, descriptors };
}

/**
 * Derive only arithmetic relationships from the DXL header descriptors.
 *
 * The descriptor fields are intentionally kept opaque.  The first field
 * forms contiguous ranges in the image and the second field forms separated
 * candidate address ranges, but this report does not claim that either field
 * is a loader offset, virtual address, relocation, or protection boundary.
 */
export function parseDxlDescriptorLayout(buffer, header = dxlHeader(buffer)) {
  assertBuffer(buffer, 'DXL image');
  if (!header || !Array.isArray(header.descriptors)) {
    throw new TypeError('header must contain descriptors');
  }
  const descriptors = header.descriptors.map((descriptor, index) => {
    const word1SpanStart = descriptor.word1;
    const word1SpanEnd = word1SpanStart + descriptor.word3;
    const word2RangeStart = descriptor.word2;
    const word2RangeEnd = word2RangeStart + descriptor.word3;
    const next = header.descriptors[index + 1] ?? null;
    return {
      index,
      offset: descriptor.offset,
      word1: descriptor.word1,
      word2: descriptor.word2,
      word3: descriptor.word3,
      word1SpanStart,
      word1SpanEnd,
      word2RangeStart,
      word2RangeEnd,
      nextWord1SpanStart: next?.word1 ?? null,
      word1SpanContiguousToNext: next ? next.word1 === word1SpanEnd : null,
      allFields64KAligned: [descriptor.word1, descriptor.word2, descriptor.word3]
        .every((value) => value % 0x10000 === 0),
    };
  });
  const first = descriptors[0] ?? null;
  const last = descriptors.at(-1) ?? null;
  const headerWordAt18 = u32(buffer, 0x18, 'DXL header');
  const headerWordAt1c = u32(buffer, 0x1c, 'DXL header');
  const headerWordAt54 = u32(buffer, 0x54, 'DXL header');
  const candidateGaps = descriptors.slice(1).map((descriptor, index) => ({
    afterIndex: index,
    start: descriptors[index].word2RangeEnd,
    end: descriptor.word2RangeStart,
    bytes: descriptor.word2RangeStart - descriptors[index].word2RangeEnd,
  }));
  return {
    descriptorCount: descriptors.length,
    descriptors,
    allFields64KAligned: descriptors.every(({ allFields64KAligned }) => allFields64KAligned),
    word1SpansWithinImage: descriptors.every(({ word1SpanStart, word1SpanEnd }) => (
      word1SpanStart >= 0 && word1SpanEnd <= buffer.length
    )),
    word1SpansContiguous: descriptors.slice(1).every((descriptor, index) => (
      descriptor.word1 === descriptors[index].word1SpanEnd
    )),
    word1SpanStart: first?.word1SpanStart ?? null,
    word1SpanEnd: last?.word1SpanEnd ?? null,
    filePrefixBytes: first?.word1SpanStart ?? null,
    fileSuffixBytes: last ? buffer.length - last.word1SpanEnd : null,
    candidateAddressStart: first?.word2RangeStart ?? null,
    candidateAddressEnd: last?.word2RangeEnd ?? null,
    candidateAddressGaps: candidateGaps,
    headerComparisons: {
      wordAt18: headerWordAt18,
      wordAt1c: headerWordAt1c,
      wordAt54: headerWordAt54,
      firstWord2MatchesWordAt18: (first?.word2RangeStart ?? null) === headerWordAt18,
      lastWord2EndMatchesWordAt1c: (last?.word2RangeEnd ?? null) === headerWordAt1c,
      lastWord1EndMatchesWordAt54: (last?.word1SpanEnd ?? null) === headerWordAt54,
    },
  };
}

function dxlSourceMarkers(buffer) {
  return extractAsciiRuns(buffer)
    .filter(({ text }) => SOURCE_SUFFIX.test(text) && /(?:\\|\/)(?:core|interface)(?:\\|\/)/i.test(text))
    .map(({ offset, text }) => ({ offset, raw: text, normalized: normalizePath(text) }));
}

/**
 * Validate the contiguous tagged-string chain surrounding the DXL source
 * markers.  It includes two basename-only auxiliary strings interspersed
 * among the 50 core module paths; those are retained as data, not treated as
 * module dependencies or execution order.
 */
export function parseDxlSourceObjectChain(buffer) {
  assertBuffer(buffer, 'DXL image');
  const markers = dxlSourceMarkers(buffer);
  if (markers.length === 0) {
    return {
      found: false,
      objectCount: 0,
      objects: [],
    };
  }
  const firstObjectOffset = Math.min(...markers.map(({ offset }) => offset - 4));
  const lastMarker = markers.at(-1);
  const lastObjectOffset = lastMarker.offset - 4;
  const lastRawEnd = lastObjectOffset + 4 + lastMarker.raw.length + 1;
  const regionStart = firstObjectOffset;
  const regionEnd = alignUp(lastRawEnd, 8);
  const objects = [];
  let cursor = regionStart;
  while (cursor < regionEnd) {
    const object = readTaggedString(buffer, cursor, 0x65);
    const rawEnd = object.nulOffset + 1;
    const nextBoundary = alignUp(rawEnd, 8);
    if (nextBoundary > regionEnd) {
      throw new Error(`DXL source object at 0x${cursor.toString(16)} exceeds source region`);
    }
    const padding = buffer.subarray(rawEnd, nextBoundary);
    const normalized = normalizePath(object.text);
    const isCoreHarold3 = /\/core\/harold3\//i.test(normalized);
    const isInterface = /\/interface\//i.test(normalized);
    objects.push({
      objectOffset: cursor,
      textOffset: cursor + 4,
      header: object.header,
      tag: object.tag,
      length: object.length,
      raw: object.text,
      normalized,
      kind: isCoreHarold3 ? 'core-harold3'
        : (isInterface ? 'interface' : 'auxiliary-basename'),
      nulOffset: object.nulOffset,
      nextBoundary,
      paddingLength: padding.length,
      paddingZero: [...padding].every((value) => value === 0),
    });
    cursor = nextBoundary;
  }
  if (cursor !== regionEnd) {
    throw new Error(`DXL source object chain ended at 0x${cursor.toString(16)}, expected 0x${regionEnd.toString(16)}`);
  }
  const paddingLengthCounts = new Map();
  let paddingByteCount = 0;
  let paddingNonzeroByteCount = 0;
  for (const object of objects) {
    paddingLengthCounts.set(
      object.paddingLength,
      (paddingLengthCounts.get(object.paddingLength) ?? 0) + 1,
    );
    paddingByteCount += object.paddingLength;
    paddingNonzeroByteCount += object.paddingZero
      ? 0
      : [...buffer.subarray(object.nulOffset + 1, object.nextBoundary)]
        .filter((value) => value !== 0).length;
  }
  return {
    found: true,
    regionStart,
    regionEnd,
    regionLength: regionEnd - regionStart,
    objectCount: objects.length,
    allObjectsEightByteAligned: objects.every(({ objectOffset }) => objectOffset % 8 === 0),
    allExpectedTag: objects.every(({ tag }) => tag === 0x65),
    allNulTerminated: objects.every(({ nulOffset }) => buffer[nulOffset] === 0),
    chainTilesRegion: objects.at(-1)?.nextBoundary === regionEnd,
    coreHarold3Count: objects.filter(({ kind }) => kind === 'core-harold3').length,
    interfaceCount: objects.filter(({ kind }) => kind === 'interface').length,
    auxiliaryBasenames: objects
      .filter(({ kind }) => kind === 'auxiliary-basename')
      .map(({ raw }) => raw),
    paddingByteCount,
    paddingNonzeroByteCount,
    paddingZeroByteCount: paddingByteCount - paddingNonzeroByteCount,
    paddingLengthCounts: Object.fromEntries(
      [...paddingLengthCounts.entries()].sort(([a], [b]) => Number(a) - Number(b)),
    ),
    objects,
  };
}

export function buildImageIndex({ dxlPath, pllPath, truncatedPllPath = null, functionInventory = null }) {
  const dxl = readFileSync(dxlPath);
  const pll = readFileSync(pllPath);
  const parsed = parsePll(pll);
  const dxlHeaderInfo = dxlHeader(dxl);
  const dxlDescriptorLayout = parseDxlDescriptorLayout(dxl, dxlHeaderInfo);
  const dxlSourceObjectChain = parseDxlSourceObjectChain(dxl);
  const sourceReferences = parsed.strings
    .map(({ text, recordOffset, objectOffset, key }) => {
      const info = sourceInfo(text);
      return info ? { recordOffset, objectOffset, key, ...info } : null;
    })
    .filter(Boolean);
  const coreFasl = [...new Set(sourceReferences
    .filter(({ coreHarold3, normalized }) => coreHarold3 && normalized.toLowerCase().endsWith('.fasl'))
    .map(({ module }) => module))].sort();
  const dxlCoreLisp = [...new Set(dxlSourceMarkers(dxl)
    .filter(({ normalized }) => /\/core\/harold3\//i.test(normalized))
    .map(({ normalized }) => basename(normalized).replace(/\.lisp$/i, '').toLowerCase()))].sort();
  const truncated = truncatedPllPath ? readFileSync(truncatedPllPath) : null;
  const prefixMatch = truncated
    ? truncated.length <= pll.length && pll.subarray(0, truncated.length).equals(truncated)
    : null;
  return {
    schemaVersion: 1,
    scope: 'Read-only structural metadata; no DXL/PLL evaluation or source reconstruction',
    artifacts: {
      dxl: artifactMetadata(dxlPath, dxl, {
        header: dxlHeaderInfo,
        descriptorLayout: dxlDescriptorLayout,
      }),
      pll: artifactMetadata(pllPath, pll),
      truncatedPll: truncatedPllPath && truncated
        ? artifactMetadata(truncatedPllPath, truncated, {
          exactPrefixOfCompletePll: prefixMatch,
        })
        : null,
    },
    pll: {
      firstTable: parsed.firstTable,
      stringTable: parsed.stringTable,
      indexedSourceReferenceCount: sourceReferences.length,
      indexedCoreFaslModuleCount: coreFasl.length,
      indexedCoreFaslModules: coreFasl,
      sourceReferences,
      selectedSymbols: selectedSymbols(parsed.strings, functionInventory),
      knownFunctionReferences: (functionInventory?.functions ?? []).map((name) => {
        const found = parsed.strings.find(({ text }) => text === name);
        return {
          name,
          found: Boolean(found),
          recordOffset: found?.recordOffset ?? null,
          objectOffset: found?.objectOffset ?? null,
          key: found?.key ?? null,
        };
      }),
      indexedTargetSymbols: indexedTargetSymbols(parsed.strings),
    },
    dxl: {
      coreLispModuleCount: dxlCoreLisp.length,
      coreLispModules: dxlCoreLisp,
      sourceMarkers: dxlSourceMarkers(dxl),
      sourceObjectChain: dxlSourceObjectChain,
    },
    crossReference: {
      allKnownFunctionsIndexed: (functionInventory?.functions ?? [])
        .every((name) => parsed.strings.some(({ text }) => text === name)),
      pllCoreFaslModulesAlsoInDxl: coreFasl.every((module) => dxlCoreLisp.includes(module)),
      dxlModulesWithoutIndexedPllFaslMarker: dxlCoreLisp.filter((module) => !coreFasl.includes(module)),
    },
  };
}

function main(argv) {
  const [pllPath, dxlPath, inventoryPath, truncatedPllPath] = argv;
  if (!pllPath || !dxlPath || !inventoryPath) {
    throw new Error('Usage: node index-allegro-image.mjs COMPLETE_AARON.pll AARON.dxl function-inventory.json [TRUNCATED_AARON.pll]');
  }
  const functionInventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(buildImageIndex({
    pllPath,
    dxlPath,
    functionInventory,
    truncatedPllPath,
  }), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
