#!/usr/bin/env node

// Match bounded live memory captures to the preserved PLL's indexed objects.
// Does not execute or modify either image; writes derived payloads locally.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_PLL_LAYOUT, parseIndexTable, parseCompiledObjectTable, sha256,
} from './index-allegro-image.mjs';

function address(value, label) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{1,8}$/i.test(value)) {
    throw new Error(`${label} must be a 32-bit hexadecimal address`);
  }
  return Number.parseInt(value.slice(2), 16);
}

function hex(value) { return `0x${value.toString(16)}`; }

export function mapCapturedFunctions(manifest, readWindow, pll) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.functions)) {
    throw new Error('Unsupported capture manifest');
  }
  const layout = DEFAULT_PLL_LAYOUT;
  const table = parseIndexTable(pll, layout.firstTableOffset, {
    expectedCount: layout.firstTableCount,
  });
  const index = parseCompiledObjectTable(pll, table, {
    finalBoundary: layout.stringTableOffset,
  });
  for (const flag of ['objectOffsetsDistinct', 'allExpectedTag',
    'allLengthFieldsMatchSecondWord', 'boundaryAgreement',
    'finalBoundaryMatchesExpected']) {
    if (!index[flag]) throw new Error(`PLL compiled-object validation failed: ${flag}`);
  }

  const payloads = new Map();
  const functions = manifest.functions.map((fn) => {
    if (!/^[A-Z][A-Z0-9-]*$/.test(fn.name) || payloads.has(fn.name)) {
      throw new Error(`Invalid or duplicate function name: ${fn.name}`);
    }
    const window = readWindow(fn.file);
    if (window.length !== fn.bytes || sha256(window) !== fn.sha256) {
      throw new Error(`Capture length/hash mismatch: ${fn.name}`);
    }
    const windowBase = address(fn.windowBase, 'windowBase');
    const entry = address(fn.entryCandidate, 'entryCandidate');
    const headerOffset = entry - windowBase - 4;
    if (headerOffset < 0 || headerOffset + 4 > window.length) {
      throw new Error(`Entry-minus-four is outside the capture: ${fn.name}`);
    }
    const header = window.readUInt32LE(headerOffset);
    if ((header & 0xff) !== 0x6c) {
      throw new Error(`Entry-minus-four has no PLL compiled-object tag: ${fn.name}`);
    }
    const encodedWords = header >>> 8;
    const objectBytes = 4 + encodedWords * 2;
    if (headerOffset + objectBytes > window.length) {
      throw new Error(`Compiled-object candidate exceeds the capture: ${fn.name}`);
    }
    const object = window.subarray(headerOffset, headerOffset + objectBytes);
    const matches = index.objects.filter((candidate) => (
      candidate.rawEnd - candidate.objectOffset === objectBytes
      && pll.subarray(candidate.objectOffset, candidate.rawEnd).equals(object)
    ));
    if (matches.length !== 1) {
      throw new Error(`Expected one complete PLL byte match for ${fn.name}; found ${matches.length}`);
    }
    const match = matches[0];
    const payload = object.subarray(4);
    payloads.set(fn.name, payload);
    return {
      name: fn.name,
      capture: {
        file: fn.file, sha256: fn.sha256, bytes: fn.bytes,
        windowBase: fn.windowBase, functionObjectHeaderHex: fn.functionObjectHeaderHex,
      },
      runtime: { entry: hex(entry), objectBase: hex(entry - 4), headerOffsetInWindow: headerOffset },
      pll: {
        recordOffset: match.recordOffset, objectOffset: match.objectOffset,
        payloadOffset: match.objectOffset + 4, rawEnd: match.rawEnd,
        nextBoundary: match.nextBoundary, tableSecondWord: match.second,
      },
      header: hex(header), encodedWords, objectBytes,
      objectSha256: sha256(object), payloadBytes: payload.length,
      payloadSha256: sha256(payload), payloadFile: `${fn.name.toLowerCase()}.native-payload.bin`,
      uniqueCompleteObjectByteMatch: true,
      prefixHex: payload.subarray(0, 16).toString('hex'),
    };
  });
  return {
    report: {
      schemaVersion: 1,
      method: 'Function metadata entry candidate minus four, validated by one exact complete object match in the indexed PLL',
      pll: { bytes: pll.length, sha256: sha256(pll), indexedObjects: index.objectCount },
      functions,
      limitations: [
        'The object length includes the entire encoded payload; instruction reachability is established separately by disassembly.',
        'Memory was read before the seeded scene; this mapping alone does not establish executed calls or the Lisp ABI.',
      ],
    },
    payloads,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [manifestArg, pllArg, outputArg, ...extra] = process.argv.slice(2);
  if (!manifestArg || !pllArg || !outputArg || extra.length) {
    throw new Error('Usage: node map-native-code-to-pll.mjs <capture-manifest.json> <AARON.pll> <fresh-output-directory>');
  }
  const manifestPath = resolve(manifestArg);
  const output = resolve(outputArg);
  if (existsSync(output)) throw new Error('Output directory must be fresh');
  const manifestBytes = readFileSync(manifestPath);
  const result = mapCapturedFunctions(JSON.parse(manifestBytes), (file) => {
    if (basename(file) !== file || !/^[a-z0-9-]+\.native-window\.bin$/.test(file)) {
      throw new Error(`Invalid capture filename: ${file}`);
    }
    return readFileSync(resolve(dirname(manifestPath), file));
  }, readFileSync(resolve(pllArg)));
  result.report.captureManifestSha256 = sha256(manifestBytes);
  mkdirSync(output);
  for (const fn of result.report.functions) {
    writeFileSync(resolve(output, fn.payloadFile), result.payloads.get(fn.name));
  }
  writeFileSync(resolve(output, 'native-code-map.json'), `${JSON.stringify(result.report, null, 2)}\n`);
  console.log(JSON.stringify(result.report, null, 2));
}
