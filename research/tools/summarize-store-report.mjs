import { readFile } from 'node:fs/promises';

import { parseStoreReport } from './parse-store-report.mjs';

function increment(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function sortedObject(map) {
  return Object.fromEntries(Object.entries(map).sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * Produce a compact, machine-readable summary of a STORE-IN-FILE capture.
 *
 * The summary deliberately keeps failed calls separate from successful output:
 * a runtime error is evidence about the probe environment, not an empty AA
 * command sequence.
 */
export function summarizeStoreReport(report) {
  if (!report || !Array.isArray(report.cases)) throw new TypeError('report must contain cases');

  const methods = {};
  const modes = {};
  const errors = {};
  const errorCells = {};
  const controls = {};
  let successes = 0;

  for (const entry of report.cases) {
    increment(methods, entry.method);
    increment(modes, entry.mode);
    if (Object.hasOwn(entry, 'controls')) increment(controls, String(entry.controls));
    if (entry.error) {
      increment(errors, entry.error);
      if (entry.errorCell) {
        const cell = `${entry.errorCell.package ?? 'NIL'}::${entry.errorCell.name}`;
        increment(errorCells, cell);
      }
    } else {
      successes += 1;
    }
  }

  return {
    caseCount: report.cases.length,
    successCount: successes,
    errorCount: report.cases.length - successes,
    methods: sortedObject(methods),
    modes: sortedObject(modes),
    controls: sortedObject(controls),
    errors: sortedObject(errors),
    errorCells: sortedObject(errorCells),
  };
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const [path] = process.argv.slice(2);
  if (!path) throw new Error('usage: node summarize-store-report.mjs REPORT');
  const report = parseStoreReport(await readFile(path, 'utf8'));
  console.log(JSON.stringify(summarizeStoreReport(report), null, 2));
}
