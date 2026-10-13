#!/usr/bin/env node

// Assemble two exact PLL payload mappings for one later live caller capture.
// Historical runtime entry addresses are retained as provenance only; the
// caller helper derives fresh entries from the paused process metadata.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST_PATH = resolve(ROOT, 'research/extracted/aaron/manifest.json');
const DEFAULT_ZERO_MAP = 'research/extracted/local-oracle/brush-buffer-predicate-native-seed1234-20261006-a/native-code/mapped/native-code-map.json';
const DEFAULT_HOLE_MAP = 'research/extracted/local-oracle/brush-buffer-native-seed1234-20261005-c/native-code/mapped/native-code-map.json';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFileSync(path);
const json = path => JSON.parse(read(path).toString('utf8').replace(/^\uFEFF/u, ''));
const rel = path => relative(ROOT, path).split(sep).join('/');

function sourceMap(pathArg, wantedName) {
  const mapPath = resolve(ROOT, pathArg);
  const mapBytes = read(mapPath);
  const map = json(mapPath);
  assert(map.schemaVersion === 1 && Array.isArray(map.functions), `${wantedName}: unexpected map schema`);
  const fn = map.functions.find(item => item.name === wantedName);
  assert(fn?.uniqueCompleteObjectByteMatch === true, `${wantedName}: no unique complete PLL object match`);
  assert(typeof fn.payloadFile === 'string' && basename(fn.payloadFile) === fn.payloadFile
    && /^[a-z0-9-]+\.native-payload\.bin$/u.test(fn.payloadFile), `${wantedName}: unsafe payload filename`);
  const payloadPath = resolve(dirname(mapPath), fn.payloadFile);
  const payload = read(payloadPath);
  assert(payload.length === fn.payloadBytes && sha256(payload) === fn.payloadSha256,
    `${wantedName}: source payload hash/size mismatch`);
  return { mapPath, mapBytes, map, fn, payload };
}

function main() {
  const [zeroMapArg, holeMapArg, outputArg, ...extra] = process.argv.slice(2);
  assert(extra.length === 0,
    'Usage: node merge-zero-edge-caller-native-maps.mjs [ZERO-EDGE-map.json] [BUFFER-HOLE-map.json] [fresh-output-directory]');
  const output = resolve(ROOT, outputArg ?? 'research/extracted/local-oracle/zero-edge-native-caller-map-20261013-a');
  const ignoredPath = rel(resolve(output, 'native-code-map.json'));
  assert(ignoredPath.startsWith('research/extracted/local-oracle/'),
    'Merged map must be written under ignored research/extracted/local-oracle');
  const ignoreRules = read(resolve(ROOT, '.gitignore')).toString('utf8').split(/\r?\n/u);
  assert(ignoreRules.includes('/research/extracted/'),
    'The repository no longer ignores the merged map output parent');
  assert(!existsSync(output), `Merged map output must be fresh: ${ignoredPath}`);

  const zero = sourceMap(zeroMapArg ?? DEFAULT_ZERO_MAP, 'ZERO-EDGE');
  const hole = sourceMap(holeMapArg ?? DEFAULT_HOLE_MAP, 'BUFFER-HOLE');
  for (const field of ['bytes', 'sha256', 'indexedObjects']) {
    assert(zero.map.pll[field] === hole.map.pll[field], `Input maps disagree on PLL ${field}`);
  }
  const manifest = json(MANIFEST_PATH);
  const manifestPll = manifest.files.find(item => item.installedName === 'AARON.pll');
  assert(manifestPll && manifestPll.bytes === zero.map.pll.bytes
    && manifestPll.sha256 === zero.map.pll.sha256,
  'Input native maps do not match the current extracted AARON.pll');

  mkdirSync(output);
  const functions = [];
  for (const source of [zero, hole]) {
    const payloadFile = source.fn.payloadFile;
    writeFileSync(resolve(output, payloadFile), source.payload, { flag: 'wx' });
    functions.push({ ...source.fn, payloadFile });
  }
  const merged = {
    schemaVersion: 1,
    method: 'Union of separately captured functions whose complete object bytes uniquely match the same verified AARON.pll',
    addressPolicy: 'Source-map runtime entries are historical provenance only; use fresh paused-process headers and verify exact live payload bytes before a breakpoint.',
    pll: zero.map.pll,
    functions,
    provenance: {
      sources: [zero, hole].map((source, index) => ({
        function: index === 0 ? 'ZERO-EDGE' : 'BUFFER-HOLE',
        mapPath: rel(source.mapPath), mapSha256: sha256(source.mapBytes),
        mappedPayloadSha256: source.fn.payloadSha256,
      })),
      manifest: { path: rel(MANIFEST_PATH), sha256: sha256(read(MANIFEST_PATH)) },
      mergeHelper: { path: rel(fileURLToPath(import.meta.url)), sha256: sha256(read(fileURLToPath(import.meta.url))) },
    },
  };
  const mapPath = resolve(output, 'native-code-map.json');
  writeFileSync(mapPath, `${JSON.stringify(merged, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${rel(mapPath)}\n${sha256(read(mapPath))}\n`);
}

main();
