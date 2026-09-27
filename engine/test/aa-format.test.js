import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { analyzeAaDocument } from '../src/aa-analysis.js';
import { AaFormatError, parseAaFile, serializeAaFile } from '../src/aa-format.js';
import { Mt19937, mt19937Reference } from '../src/random.js';

const captureAa0Url = new URL(
  '../../research/extracted/local-oracle/writer-windows-seed-1234-h/capture/aa0',
  import.meta.url,
);
const captureImageUrl = new URL(
  '../../research/extracted/local-oracle/writer-windows-seed-1234-h/capture/image',
  import.meta.url,
);

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

test('rejects inherited object names as unknown stroke commands', () => {
  for (const command of ['constructor', 'toString', '__proto__']) {
    assert.throws(() => parseAaFile(`10 10 1\n0 0 0\ncolor\n${command}\nend\n`),
      /unknown command/);
  }
});

test('parses absolute z-path outline commands', () => {
  const document = parseAaFile([
    '10 10 1',
    '0 0 0',
    'zm 1 2',
    'zd 3.5 4.5',
    'color',
    'end',
  ].join('\n'));
  assert.deepEqual(document.outline, [
    { command: 'zm', x: 1, y: 2, lineNumber: 3 },
    { command: 'zd', x: 3.5, y: 4.5, lineNumber: 4 },
  ]);
});

test('serializes an original-style header and fixed two-decimal CRLF palette prelude', () => {
  const palette = Array.from({ length: 148 }, () => [0, 0.5, 1]);
  const text = serializeAaFile({
    width: 320,
    height: 480,
    palette,
    outline: [],
    paint: [],
  }, { originalPrelude: true });
  const expectedPrelude = Buffer.from(
    `320 480 148\r\n${'0.00 0.50 1.00\r\n'.repeat(148)}`,
    'ascii',
  );

  assert.deepEqual(Buffer.from(text, 'utf8').subarray(0, expectedPrelude.length), expectedPrelude);
  assert.equal(text.slice(expectedPrelude.length), 'color\nend\n');
});

test('original-style prelude reproduces the ignored captured AA0 prefix when available', {
  skip: !existsSync(captureAa0Url) || !existsSync(captureImageUrl),
}, async () => {
  const aaBytes = await readFile(captureAa0Url);
  const imageBytes = await readFile(captureImageUrl);
  const document = parseAaFile(aaBytes.toString('utf8'));
  const serialized = Buffer.from(serializeAaFile(document, { originalPrelude: true }), 'utf8');
  const prefixLength = aaBytes.length - imageBytes.length;

  assert.equal(prefixLength, 2_381);
  assert.deepEqual(aaBytes.subarray(prefixLength), imageBytes);
  assert.deepEqual(serialized.subarray(0, prefixLength), aaBytes.subarray(0, prefixLength));
});

test('keeps the default serializer output unchanged', () => {
  const text = serializeAaFile({
    width: 320,
    height: 480,
    palette: [[0.5, 0.25, 1]],
    outline: [],
    paint: [],
  });

  assert.equal(text, '320 480 1\n0.5 0.25 1\ncolor\nend\n');
});

test('produces comparable corpus measurements', async () => {
  const analysis = analyzeAaDocument(parseAaFile(await sample('aa0')));
  assert.deepEqual(analysis.canvas, { width: 1920, height: 1080 });
  assert.equal(analysis.outline.commands.am, 280);
  assert.equal(analysis.outline.commands.ad, 3_267);
  assert.equal(analysis.paint.commands.nb, 99);
  assert.equal(analysis.paint.commands.nc, 3_853);
  assert.equal(analysis.paint.chainSegments, 220_793);
  assert.deepEqual(analysis.paint.bounds, {
    minX: 3,
    maxX: 1_920,
    minY: 5,
    maxY: 1_080,
  });
});

test('matches the MT19937 reference sequence', () => {
  const random = new Mt19937(5489);
  assert.deepEqual(
    mt19937Reference.map(() => random.nextUint32()),
    mt19937Reference,
  );
});

test('keeps seeded choices reproducible and bounded', () => {
  const left = new Mt19937(0xaa70);
  const right = new Mt19937(0xaa70);
  const values = Array.from({ length: 128 }, () => left.nextInt(7));
  assert.deepEqual(values, Array.from({ length: 128 }, () => right.nextInt(7)));
  assert(values.every((value) => value >= 0 && value < 7));
});
