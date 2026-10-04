#!/usr/bin/env node

// Keep an observed generic dispatcher distinct from ordinary PLL functions.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { mapCapturedFunctions } from './map-native-code-to-pll.mjs';
import { sha256 } from './index-allegro-image.mjs';

const [manifestArg, pllArg, outputArg, ...extra] = process.argv.slice(2);
if (!manifestArg || !pllArg || !outputArg || extra.length) {
  throw new Error('Usage: node map-brush-fill-native-code.mjs <capture-manifest.json> <AARON.pll> <fresh-output-directory>');
}
const manifestPath = resolve(manifestArg);
const captureRoot = dirname(manifestPath);
const output = resolve(outputArg);
if (existsSync(output)) throw new Error('Output directory must be fresh');
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
const metadata = readFileSync(resolve(captureRoot, 'function-object-metadata.txt'));
if (sha256(metadata) !== manifest.metadataSha256
    || !metadata.toString('utf8').includes('FUNCTION name="MY-FILL" type=STANDARD-GENERIC-FUNCTION')) {
  throw new Error('Missing bound observation of the MY-FILL generic dispatcher');
}
const expected = ['BRUSH-FILL', 'SCAN-ROW', 'MY-FILL', 'LIST-FRAME',
  'FILL-IRIS', 'BRUSH-FILL-SUBPART', 'SELECT-BRUSH'];
if (manifest.functions?.length !== expected.length
    || expected.some((name) => manifest.functions.filter((fn) => fn.name === name).length !== 1)) {
  throw new Error('Unexpected captured function set');
}
const pll = readFileSync(resolve(pllArg));
const readWindow = (file) => {
  if (basename(file) !== file || !/^[a-z0-9-]+\.native-window\.bin$/.test(file)) {
    throw new Error('Invalid capture filename');
  }
  return readFileSync(resolve(captureRoot, file));
};
const dispatcher = manifest.functions.find((fn) => fn.name === 'MY-FILL');
let dispatcherFailure;
try {
  mapCapturedFunctions({ ...manifest, functions: [dispatcher] }, readWindow, pll);
} catch (error) {
  if (error.message !== 'Expected one complete PLL byte match for MY-FILL; found 0') throw error;
  dispatcherFailure = error.message;
}
if (!dispatcherFailure) throw new Error('MY-FILL unexpectedly matched a PLL object; review its classification');
const result = mapCapturedFunctions({ ...manifest,
  functions: manifest.functions.filter((fn) => fn.name !== 'MY-FILL') }, readWindow, pll);
result.report.captureManifestSha256 = sha256(manifestBytes);
result.report.metadataSha256 = sha256(metadata);
result.report.unmappedDispatchers = [{ name: 'MY-FILL', observedType: 'STANDARD-GENERIC-FUNCTION',
  entryCandidate: dispatcher.entryCandidate, windowSha256: dispatcher.sha256,
  exactPllMatches: 0, mappingFailure: dispatcherFailure,
  limitation: 'This live generic dispatcher is not a recovered method body. Observe methods separately.' }];
mkdirSync(output);
for (const fn of result.report.functions) {
  writeFileSync(resolve(output, fn.payloadFile), result.payloads.get(fn.name), { flag: 'wx' });
}
const reportPath = resolve(output, 'native-code-map.json');
writeFileSync(reportPath, `${JSON.stringify(result.report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output: reportPath, sha256: sha256(readFileSync(reportPath)),
  matched: result.report.functions.map(({ name, payloadBytes, pll }) => ({ name, payloadBytes, pll })),
  unmappedDispatchers: result.report.unmappedDispatchers }, null, 2));
