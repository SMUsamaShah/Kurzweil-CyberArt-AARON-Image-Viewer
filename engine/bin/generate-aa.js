#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';

import { Allegro501Random } from '../src/allegro-random.js';
import { generateAaron } from '../src/generator.js';
import { serializeAaFile } from '../src/aa-format.js';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const seed = valueAfter('--seed');
const figures = valueAfter('--figures');
const profile = valueAfter('--profile');
const screenWidth = valueAfter('--screen-width');
const screenHeight = valueAfter('--screen-height');
const output = valueAfter('--out');
const numericRandom = args.includes('--allegro-rng')
  ? new Allegro501Random(seed === undefined ? 5489 : Number(seed))
  : undefined;
const result = generateAaron({
  seed: seed === undefined ? undefined : Number(seed),
  figureCount: figures === undefined ? undefined : Number(figures),
  premium: args.includes('--premium'),
  smallImage: args.includes('--small'),
  profile,
  smallImageScreenWidth: screenWidth === undefined ? undefined : Number(screenWidth),
  smallImageScreenHeight: screenHeight === undefined ? undefined : Number(screenHeight),
  random: numericRandom,
});
const text = serializeAaFile(result.document);

if (output) {
  await writeFile(output, text, 'utf8');
  console.error(JSON.stringify({ output, ...result.scene }, null, 2));
} else {
  process.stdout.write(text);
}
