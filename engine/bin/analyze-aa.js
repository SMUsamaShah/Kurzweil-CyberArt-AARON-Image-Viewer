#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { analyzeAaDocument } from '../src/aa-analysis.js';
import { parseAaFile } from '../src/aa-format.js';

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error('Usage: node bin/analyze-aa.js <AA-file> [...]');
  process.exit(2);
}

const results = [];
for (const input of inputs) {
  const path = resolve(input);
  const document = parseAaFile(await readFile(path, 'utf8'));
  results.push({ file: path, ...analyzeAaDocument(document) });
}

console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));

