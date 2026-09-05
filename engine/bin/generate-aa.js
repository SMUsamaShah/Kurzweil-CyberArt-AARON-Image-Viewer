#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';

import { generateAaron } from '../src/generator.js';
import { serializeAaFile } from '../src/aa-format.js';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const seed = valueAfter('--seed');
const figures = valueAfter('--figures');
const output = valueAfter('--out');
const result = generateAaron({
  seed: seed === undefined ? undefined : Number(seed),
  figureCount: figures === undefined ? undefined : Number(figures),
  smallImage: args.includes('--small'),
});
const text = serializeAaFile(result.document);

if (output) {
  await writeFile(output, text, 'utf8');
  console.error(JSON.stringify({ output, ...result.scene }, null, 2));
} else {
  process.stdout.write(text);
}
