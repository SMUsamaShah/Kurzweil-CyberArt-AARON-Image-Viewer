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

function validateScanOption(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer`);
  }
  return value;
}

/**
 * Inventory only the DXL byte patterns that look like aligned compiled
 * objects under the validated PLL object convention.
 *
 * This is intentionally a candidate scan, not a DXL object parser. DXL
 * object boundaries, entry points, and symbol/function-cell relationships
 * are not established by a matching tag and x86 prologue. The residue counts
 * are retained as a false-positive control: on the preserved image the
 * selected prologue occurs only at eight-byte-aligned offsets.
 */
export function scanDxlCompiledObjectCandidates(buffer, {
  alignment = 8,
  expectedTag = 0x6c,
  prologue = Buffer.from('558bec56', 'hex'),
} = {}) {
  assertBuffer(buffer, 'DXL image');
  validateScanOption(alignment, 'alignment');
  if (!Number.isInteger(expectedTag) || expectedTag < 0 || expectedTag > 0xff) {
    throw new RangeError('expectedTag must be an unsigned byte');
  }
  assertBuffer(prologue, 'prologue');
  if (prologue.length === 0) throw new RangeError('prologue must not be empty');

  const residues = Array.from({ length: alignment }, () => ({
    tagCount: 0,
    boundedTagCount: 0,
    prologueCount: 0,
  }));
  const candidates = [];
  let tagCount = 0;
  let boundedTagCount = 0;
  let prologueCount = 0;
  for (let offset = 0; offset + 4 <= buffer.length; offset += 1) {
    const header = u32(buffer, offset, 'DXL candidate compiled object');
    if ((header & 0xff) !== expectedTag) continue;
    tagCount += 1;
    const residue = residues[offset % alignment];
    residue.tagCount += 1;
    const encodedWords = header >>> 8;
    const rawEnd = offset + 4 + encodedWords * 2;
    if (rawEnd > buffer.length) continue;
    boundedTagCount += 1;
    residue.boundedTagCount += 1;
    if (!buffer.subarray(offset + 4, offset + 4 + prologue.length).equals(prologue)) {
      continue;
    }
    prologueCount += 1;
    residue.prologueCount += 1;
    if (offset % alignment !== 0) continue;
    const nextBoundary = alignUp(rawEnd, alignment);
    if (nextBoundary > buffer.length) continue;
    const padding = buffer.subarray(rawEnd, nextBoundary);
    candidates.push({
      offset,
      header,
      tag: expectedTag,
      encodedWords,
      payloadLength: encodedWords * 2,
      rawEnd,
      nextBoundary,
      paddingLength: padding.length,
      paddingZero: [...padding].every((value) => value === 0),
      prologue: prologue.toString('hex'),
    });
  }

  return {
    scope: 'Structural DXL compiled-object candidates only; no object boundary, entry point, relocation, or symbol mapping is assigned',
    alignment,
    expectedTag,
    prologue: prologue.toString('hex'),
    byteScan: { tagCount, boundedTagCount, prologueCount },
    residueCounts: residues.map((counts, residue) => ({ residue, ...counts })),
    alignedTagCount: residues[0]?.tagCount ?? 0,
    alignedBoundedTagCount: residues[0]?.boundedTagCount ?? 0,
    alignedPrologueCount: residues[0]?.prologueCount ?? 0,
    candidateCount: candidates.length,
    candidates,
  };
}

function validateUint32(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
  return value;
}

/**
 * Test a proposed tagged pointer encoding against all four-byte values in the
 * DXL, with nearby-shift controls. A hit counts a nonempty PLL string-table
 * record whose encoded value occurs at any DXL byte offset; duplicate records
 * and duplicate text values are reported separately. This is a negative
 * control for name/reference hypotheses, not a pointer decoder.
 */
export function scanEncodedStringPointerControls(pllStrings, dxlBuffer, {
  base = 0x20000000,
  tag = 1,
  shifts = Array.from({ length: 33 }, (_, index) => index * 8),
  dynamicFunctionNames = [],
} = {}) {
  if (!Array.isArray(pllStrings)) throw new TypeError('PLL strings must be an array');
  assertBuffer(dxlBuffer, 'DXL image');
  validateUint32(base, 'base');
  validateUint32(tag, 'tag');
  if (!Array.isArray(shifts) || shifts.length === 0) {
    throw new TypeError('shifts must be a non-empty array');
  }
  for (const shift of shifts) validateUint32(shift, 'shift');
  if (!Array.isArray(dynamicFunctionNames)) {
    throw new TypeError('dynamicFunctionNames must be an array');
  }
  const dynamicNames = new Set(dynamicFunctionNames);
  const values = new Set();
  for (let offset = 0; offset + 4 <= dxlBuffer.length; offset += 1) {
    values.add(dxlBuffer.readUInt32LE(offset));
  }
  const records = pllStrings.filter((entry) => {
    if (!entry || !Number.isInteger(entry.objectOffset) || typeof entry.text !== 'string') {
      throw new TypeError('PLL string entries must contain objectOffset and text');
    }
    return entry.text.length > 0;
  });
  const measurements = shifts.map((shift) => {
    const matchedTexts = new Set();
    const matchedDynamicNames = new Set();
    let matchedRecordCount = 0;
    for (const entry of records) {
      const encoded = (base + entry.objectOffset + tag + shift) >>> 0;
      if (!values.has(encoded)) continue;
      matchedRecordCount += 1;
      matchedTexts.add(entry.text);
      if (dynamicNames.has(entry.text)) matchedDynamicNames.add(entry.text);
    }
    return {
      shift,
      matchedRecordCount,
      matchedUniqueTextCount: matchedTexts.size,
      matchedDynamicFunctionNameCount: matchedDynamicNames.size,
    };
  });
  const controls = measurements.slice(1);
  const range = (field) => ({
    min: Math.min(...controls.map((measurement) => measurement[field])),
    max: Math.max(...controls.map((measurement) => measurement[field])),
  });
  return {
    scope: 'Negative tagged-pointer encoding control; occurrence at a DXL byte offset is not treated as a reference',
    encoding: { base, tag, expression: 'base + PLL string-object offset + tag + shift' },
    dxlByteLength: dxlBuffer.length,
    uniqueDxlUint32Count: values.size,
    nonemptyPllRecordCount: records.length,
    measurements,
    baseline: measurements[0],
    controlRanges: {
      matchedRecordCount: range('matchedRecordCount'),
      matchedUniqueTextCount: range('matchedUniqueTextCount'),
      matchedDynamicFunctionNameCount: range('matchedDynamicFunctionNameCount'),
    },
  };
}

function compiledPayload(buffer, object) {
  if (!object || !Number.isInteger(object.objectOffset)
      || !Number.isInteger(object.rawEnd)
      || object.objectOffset < 0
      || object.rawEnd < object.objectOffset + 4
      || object.rawEnd > buffer.length) {
    throw new RangeError('compiled object payload is outside the image');
  }
  const payload = buffer.subarray(object.objectOffset + 4, object.rawEnd);
  if (payload.length === 0) throw new Error('compiled object payload must not be empty');
  return payload;
}

function exactOccurrences(buffer, needle) {
  const offsets = [];
  let offset = buffer.indexOf(needle);
  while (offset >= 0) {
    offsets.push(offset);
    offset = buffer.indexOf(needle, offset + 1);
  }
  return offsets;
}

/**
 * Compare validated PLL compiled-object payloads against a DXL byte image.
 *
 * This is an anonymous structural anchor search. It retains exact payload
 * occurrences and reports whether the bytes immediately before an occurrence
 * form the same tagged compiled-object header at an aligned candidate start.
 * It does not assign a name, entry point, relocation, or runtime meaning to a
 * match, and it never stores executable payload bytes in the report.
 */
export function compareCompiledPayloads(pllBuffer, compiledObjects, dxlBuffer) {
  assertBuffer(pllBuffer, 'PLL image');
  assertBuffer(dxlBuffer, 'DXL image');
  if (!Array.isArray(compiledObjects)) {
    throw new TypeError('compiledObjects must be an array');
  }

  const payloadHashes = new Map();
  const matches = [];
  for (const object of compiledObjects) {
    const payload = compiledPayload(pllBuffer, object);
    const payloadSha256 = sha256(payload);
    payloadHashes.set(payloadSha256, (payloadHashes.get(payloadSha256) ?? 0) + 1);
    const pllSpan = pllBuffer.subarray(object.objectOffset, object.nextBoundary);
    for (const dxlPayloadOffset of exactOccurrences(dxlBuffer, payload)) {
      const candidateObjectOffset = dxlPayloadOffset - 4;
      const candidateAligned = candidateObjectOffset >= 0 && candidateObjectOffset % 8 === 0;
      const candidateHeader = candidateObjectOffset >= 0 && candidateObjectOffset + 4 <= dxlBuffer.length
        ? u32(dxlBuffer, candidateObjectOffset, 'DXL candidate compiled object')
        : null;
      const headerMatches = candidateHeader === object.header;
      const candidateRawEnd = headerMatches
        ? candidateObjectOffset + 4 + (candidateHeader >>> 8) * 2
        : null;
      const candidateNextBoundary = candidateRawEnd === null
        ? null
        : alignUp(candidateRawEnd, 8);
      const candidateSpanWithinImage = candidateNextBoundary !== null
        && candidateNextBoundary <= dxlBuffer.length;
      const dxlSpan = candidateSpanWithinImage
        ? dxlBuffer.subarray(candidateObjectOffset, candidateNextBoundary)
        : null;
      matches.push({
        pllRecordOffset: object.recordOffset,
        pllObjectOffset: object.objectOffset,
        pllHeader: object.header,
        payloadLength: payload.length,
        payloadSha256,
        dxlPayloadOffset,
        dxlCandidateObjectOffset: candidateObjectOffset >= 0 ? candidateObjectOffset : null,
        dxlCandidateAligned: candidateAligned,
        dxlPrecedingHeader: candidateHeader,
        precedingHeaderMatches: headerMatches,
        candidateSpanWithinImage,
        pllSpanSha256: sha256(pllSpan),
        dxlSpanSha256: dxlSpan ? sha256(dxlSpan) : null,
        paddedSpanMatches: Boolean(dxlSpan && dxlSpan.equals(pllSpan)),
      });
    }
  }

  const matchesWithHeader = matches.filter(({ precedingHeaderMatches }) => precedingHeaderMatches);
  const matchesWithAlignedHeader = matchesWithHeader.filter(({ dxlCandidateAligned }) => dxlCandidateAligned);
  return {
    pllObjectCount: compiledObjects.length,
    uniquePayloadHashCount: payloadHashes.size,
    allPayloadHashesDistinct: payloadHashes.size === compiledObjects.length,
    dxlExactPayloadOccurrenceCount: matches.length,
    pllObjectsWithDxlPayloadMatches: new Set(matches.map(({ pllObjectOffset }) => pllObjectOffset)).size,
    headerAndPayloadMatchCount: matchesWithHeader.length,
    alignedHeaderAndPayloadMatchCount: matchesWithAlignedHeader.length,
    paddedSpanMatchCount: matches.filter(({ paddedSpanMatches }) => paddedSpanMatches).length,
    matches,
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

function normalizeModuleEntries(entries, label) {
  if (!Array.isArray(entries)) throw new TypeError(`${label} must be an array`);
  return entries.map((entry, position) => {
    const normalized = typeof entry === 'string' ? { module: entry } : entry;
    if (!normalized || typeof normalized.module !== 'string' || !normalized.module) {
      throw new TypeError(`${label} entries must contain a module name`);
    }
    return { ...normalized, position };
  });
}

function duplicateModuleSummary(entries) {
  const positions = new Map();
  for (const entry of entries) {
    const values = positions.get(entry.module) ?? [];
    values.push(entry.position);
    positions.set(entry.module, values);
  }
  return [...positions.entries()]
    .filter(([, values]) => values.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([module, values]) => ({ module, count: values.length, positions: values }));
}

function directedPairKey(left, right) {
  return `${left}\u0000${right}`;
}

function adjacentModulePairs(entries) {
  return entries.slice(0, -1).map((left, index) => {
    const right = entries[index + 1];
    return {
      index,
      key: directedPairKey(left.module, right.module),
      undirectedKey: [left.module, right.module].sort().join('\u0000'),
      left,
      right,
    };
  });
}

function intersectPairSets(leftPairs, rightPairs, leftKey, rightKey = leftKey) {
  const rightByKey = new Map();
  for (const pair of rightPairs) {
    const key = rightKey(pair);
    const values = rightByKey.get(key) ?? [];
    values.push(pair);
    rightByKey.set(key, values);
  }
  const matches = [];
  for (const left of leftPairs) {
    for (const right of rightByKey.get(leftKey(left)) ?? []) {
      matches.push({ left, right });
    }
  }
  return matches;
}

/**
 * Compare two retained module-name orders without assigning dependency or
 * execution semantics. Entries may be bare module strings or objects with a
 * `module` field and arbitrary provenance fields. The adjacent-pair report
 * deliberately preserves that provenance so a future interpretation can be
 * checked against the exact source/table records.
 */
export function compareModuleOrders(leftEntries, rightEntries) {
  const left = normalizeModuleEntries(leftEntries, 'left module order');
  const right = normalizeModuleEntries(rightEntries, 'right module order');
  const leftPairs = adjacentModulePairs(left);
  const rightPairs = adjacentModulePairs(right);
  const leftModules = new Set(left.map(({ module }) => module));
  const rightModules = new Set(right.map(({ module }) => module));
  const sameModuleSet = left.length === right.length
    && leftModules.size === rightModules.size
    && [...leftModules].every((module) => rightModules.has(module));
  const sameOrder = left.length === right.length
    && left.every(({ module }, index) => module === right[index]?.module);
  let commonOrderPrefixLength = 0;
  while (
    commonOrderPrefixLength < Math.min(left.length, right.length)
    && left[commonOrderPrefixLength].module === right[commonOrderPrefixLength].module
  ) commonOrderPrefixLength += 1;

  return {
    sameModuleSet,
    sameOrder,
    commonOrderPrefixLength,
    left: {
      moduleCount: left.length,
      uniqueModuleCount: leftModules.size,
      duplicateModules: duplicateModuleSummary(left),
      adjacentPairCount: leftPairs.length,
      adjacentPairs: leftPairs,
    },
    right: {
      moduleCount: right.length,
      uniqueModuleCount: rightModules.size,
      duplicateModules: duplicateModuleSummary(right),
      adjacentPairCount: rightPairs.length,
      adjacentPairs: rightPairs,
    },
    sharedAdjacentPairs: {
      sameDirection: intersectPairSets(leftPairs, rightPairs, (pair) => pair.key),
      reversedDirection: intersectPairSets(
        leftPairs,
        rightPairs,
        (pair) => pair.key,
        (pair) => directedPairKey(pair.right.module, pair.left.module),
      ),
      undirected: intersectPairSets(
        leftPairs,
        rightPairs,
        (pair) => pair.undirectedKey,
        (pair) => pair.undirectedKey,
      ),
    },
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
  // `parsePll` keeps the public report compact by omitting the 7,723 object
  // entries. Reuse the same validated layout here for the anonymous
  // cross-image payload search; only hashes and offsets enter the JSON report.
  const pllFirstTable = parseIndexTable(pll, DEFAULT_PLL_LAYOUT.firstTableOffset, {
    expectedCount: DEFAULT_PLL_LAYOUT.firstTableCount,
    label: 'PLL first table for payload comparison',
  });
  const pllCompiledObjects = parseCompiledObjectTable(pll, pllFirstTable, {
    objectBase: pllFirstTable.offset,
    expectedTag: 0x6c,
    finalBoundary: DEFAULT_PLL_LAYOUT.stringTableOffset,
  });
  const compiledPayloadIdentity = compareCompiledPayloads(
    pll,
    pllCompiledObjects.objects,
    dxl,
  );
  const dxlHeaderInfo = dxlHeader(dxl);
  const dxlDescriptorLayout = parseDxlDescriptorLayout(dxl, dxlHeaderInfo);
  const dxlSourceObjectChain = parseDxlSourceObjectChain(dxl);
  const dxlCompiledObjectCandidates = scanDxlCompiledObjectCandidates(dxl);
  const encodedStringPointerControls = scanEncodedStringPointerControls(
    parsed.strings,
    dxl,
    { dynamicFunctionNames: functionInventory?.functions ?? [] },
  );
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
  const dxlCoreLispEntries = dxlSourceObjectChain.objects
    .filter(({ kind }) => kind === 'core-harold3')
    .map(({ raw, normalized, objectOffset, textOffset, nextBoundary }) => ({
      module: basename(normalizePath(raw)).replace(/\.lisp$/i, '').toLowerCase(),
      raw,
      normalized,
      objectOffset,
      textOffset,
      nextBoundary,
    }));
  const pllCoreFaslEntries = sourceReferences
    .filter(({ coreHarold3, normalized }) => coreHarold3 && normalized.toLowerCase().endsWith('.fasl'))
    .map(({ module, text, normalized, recordOffset, objectOffset, key }) => ({
      module,
      text,
      normalized,
      recordOffset,
      objectOffset,
      key,
    }));
  const dxlCoreLispOrder = dxlCoreLispEntries.map(({ module }) => module);
  const pllCoreFaslOrder = pllCoreFaslEntries.map(({ module }) => module);
  const moduleOrderComparison = compareModuleOrders(dxlCoreLispEntries, pllCoreFaslEntries);
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
      compiledObjectCandidates: dxlCompiledObjectCandidates,
    },
    crossReference: {
      allKnownFunctionsIndexed: (functionInventory?.functions ?? [])
        .every((name) => parsed.strings.some(({ text }) => text === name)),
      pllCoreFaslModulesAlsoInDxl: coreFasl.every((module) => dxlCoreLisp.includes(module)),
      dxlModulesWithoutIndexedPllFaslMarker: dxlCoreLisp.filter((module) => !coreFasl.includes(module)),
      coreModuleOrderComparison: {
        dxlCoreLispOrder,
        pllCoreFaslOrder,
        sameModuleSet: moduleOrderComparison.sameModuleSet,
        sameOrder: moduleOrderComparison.sameOrder,
        commonModuleOrderPrefixLength: moduleOrderComparison.commonOrderPrefixLength,
        adjacencyAudit: moduleOrderComparison,
      },
      compiledPayloadIdentity,
      encodedStringPointerControls,
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
