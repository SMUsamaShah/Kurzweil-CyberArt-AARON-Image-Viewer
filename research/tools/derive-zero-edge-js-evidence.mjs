#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compareZeroEdgeEvidence } from './compare-zero-edge-evidence.mjs';
import { deriveZeroEdgeInputMatrixEvidence } from './derive-zero-edge-input-matrix-evidence.mjs';
import { deriveZeroEdgeHoldoutEvidence } from './derive-zero-edge-holdout-evidence.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..', '..');
const MATRIX_HELPER = 'research/tools/derive-zero-edge-input-matrix-evidence.mjs';
const HOLDOUT_HELPER = 'research/tools/derive-zero-edge-holdout-evidence.mjs';
const COMPARATOR = 'research/tools/compare-zero-edge-evidence.mjs';
const ENGINE_MODULE = 'engine/src/aaron-zero-edge.js';
const MATRIX_EVIDENCE = 'research/introspection/evidence/zero-edge-input-matrix-20261012.json';
const HOLDOUT_EVIDENCE = 'research/introspection/evidence/zero-edge-holdout-20261012.json';
const RING_ROOT = resolve(PROJECT_ROOT,
  'research/extracted/local-oracle/zero-edge-holdout-ring-seed1234-20261012-u');
const DEFAULT_OUTPUT = resolve(RING_ROOT, 'aaron-zero-edge-js-source-comparison-evidence-20261012.json');

const assertCondition = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = path => path.replaceAll('\\', '/');
const within = (parent, candidate) => {
  const rel = relative(parent, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

function projectPath(path, label = path) {
  assertCondition(typeof path === 'string' && path.length > 0 && !isAbsolute(path),
    `${label} must be a nonempty project-relative path`);
  const absolute = resolve(PROJECT_ROOT, path);
  assertCondition(within(PROJECT_ROOT, absolute), `${label} escapes the project`);
  return absolute;
}

function readProjectBytes(path, label = path) {
  const absolute = projectPath(path, label);
  return { absolute, bytes: readFileSync(absolute) };
}

function subject(role, path) {
  const { bytes } = readProjectBytes(path, role);
  return { role, path, sha256: sha256(bytes), bytes: bytes.length };
}

function parseEvidence(bytes, label) {
  const decoded = bytes.toString('utf8');
  assertCondition(Buffer.from(decoded, 'utf8').equals(bytes), `${label} is not round-trip UTF-8`);
  return JSON.parse(decoded);
}

function verifySourceClosure(evidenceRows) {
  const merged = new Map();
  let duplicateDeclarations = 0;
  for (const [source, rows] of evidenceRows) {
    assertCondition(Array.isArray(rows), `${source} has no source-hash array`);
    for (const [index, row] of rows.entries()) {
      assertCondition(row && typeof row.path === 'string' && row.path.length > 0
        && !row.path.includes('\\') && /^[0-9a-f]{64}$/u.test(row.sha256)
        && Number.isSafeInteger(row.bytes) && row.bytes >= 0,
      `${source} source binding ${index} is malformed`);
      const old = merged.get(row.path);
      if (old) {
        duplicateDeclarations += 1;
        assertCondition(old.sha256 === row.sha256 && old.bytes === row.bytes,
          `Conflicting source bindings for ${row.path}`);
      } else merged.set(row.path, { path: row.path, sha256: row.sha256, bytes: row.bytes });
    }
  }

  const sourceHashes = [...merged.values()].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  for (const row of sourceHashes) {
    const bytes = readFileSync(projectPath(row.path, `source binding ${row.path}`));
    assertCondition(bytes.length === row.bytes && sha256(bytes) === row.sha256,
      `Current bytes disagree with source binding ${row.path}`);
  }
  return { sourceHashes, duplicateDeclarations };
}

function assertIgnored(path) {
  const rel = portable(relative(PROJECT_ROOT, path));
  const result = spawnSync('git', ['check-ignore', '--quiet', '--', rel], {
    cwd: PROJECT_ROOT, encoding: 'utf8', windowsHide: true,
  });
  assertCondition(!result.error && result.status === 0,
    'Output path is not covered by workspace ignore rules');
}

function outputPathFromArgs(args) {
  if (args.length === 0) return DEFAULT_OUTPUT;
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) return null;
  let value;
  if (args.length === 2 && args[0] === '--output') value = args[1];
  else if (args.length === 1 && args[0].startsWith('--output=')) value = args[0].slice('--output='.length);
  else throw new Error('Usage: node research/tools/derive-zero-edge-js-evidence.mjs [--output <fresh-ignored-json-under-ring-u>]');
  assertCondition(typeof value === 'string' && value.length > 0, '--output requires a path');
  return resolve(PROJECT_ROOT, value);
}

function summarizeComparison(name, evidenceSubject, result) {
  return {
    name,
    evidence: { path: evidenceSubject.path, sha256: evidenceSubject.sha256, bytes: evidenceSubject.bytes },
    comparedCases: result.comparedCases,
    returnedPoints: result.returnedPoints,
    nilReturns: result.nilReturns,
    listReturns: result.listReturns,
    mutatedStarts: result.mutatedStarts,
    dimensions: result.dimensions,
    mismatches: result.mismatches,
  };
}

function main() {
  assertCondition(resolve('.').toLowerCase() === PROJECT_ROOT.toLowerCase(),
    'Run this helper from the D:\\ReverseEngineerAaron project root');
  const outputPath = outputPathFromArgs(process.argv.slice(2));
  if (outputPath === null) {
    process.stdout.write('Usage: node research/tools/derive-zero-edge-js-evidence.mjs [--output <fresh-ignored-json-under-ring-u>]\n');
    return;
  }
  assertCondition(within(RING_ROOT, outputPath), 'Output must be inside the specified ring-u run root');
  assertCondition(existsSync(dirname(outputPath)), 'Output directory does not exist');
  assertCondition(!existsSync(outputPath), `Refusing to overwrite existing output: ${outputPath}`);
  assertIgnored(outputPath);

  const matrixBytes = readFileSync(projectPath(MATRIX_EVIDENCE));
  const holdoutBytes = readFileSync(projectPath(HOLDOUT_EVIDENCE));
  const matrixSubject = { role: 'published matrix evidence', path: MATRIX_EVIDENCE,
    sha256: sha256(matrixBytes), bytes: matrixBytes.length };
  const holdoutSubject = { role: 'published holdout evidence', path: HOLDOUT_EVIDENCE,
    sha256: sha256(holdoutBytes), bytes: holdoutBytes.length };
  const publishedHoldout = parseEvidence(holdoutBytes, HOLDOUT_EVIDENCE);

  const derivedMatrix = deriveZeroEdgeInputMatrixEvidence();
  const derivedMatrixBytes = Buffer.from(`${JSON.stringify(derivedMatrix, null, 2)}\n`, 'utf8');
  assertCondition(derivedMatrixBytes.equals(matrixBytes),
    'Re-derived matrix evidence does not match the exact published JSON bytes');

  const derivedHoldout = deriveZeroEdgeHoldoutEvidence();
  const derivedHoldoutBytes = Buffer.from(`${JSON.stringify(derivedHoldout, null, 2)}\n`, 'utf8');
  assertCondition(derivedHoldoutBytes.equals(holdoutBytes),
    'Re-derived holdout evidence does not match the exact published JSON bytes');

  const matrixComparison = compareZeroEdgeEvidence(derivedMatrix);
  const holdoutComparison = compareZeroEdgeEvidence(derivedHoldout);
  const { sourceHashes, duplicateDeclarations } = verifySourceClosure([
    ['matrix evidence', derivedMatrix.sourceHashes],
    ['holdout evidence', publishedHoldout.sourceHashes],
  ]);

  const subjects = [
    subject('generator', portable(relative(PROJECT_ROOT, SCRIPT_PATH))),
    subject('engine module', ENGINE_MODULE),
    subject('comparator', COMPARATOR),
    subject('holdout evidence deriver', HOLDOUT_HELPER),
    subject('matrix evidence deriver', MATRIX_HELPER),
    matrixSubject,
    holdoutSubject,
  ];
  const finalSubjects = subjects.map(row => subject(row.role, row.path));
  assertCondition(JSON.stringify(finalSubjects) === JSON.stringify(subjects),
    'A bound subject changed while evidence was being derived');

  const evidence = {
    schemaVersion: 1,
    kind: 'zero-edge-js-source-bound-comparison-evidence',
    subjects,
    sourceClosure: {
      matrixDeclarations: derivedMatrix.sourceHashes.length,
      holdoutDeclarations: publishedHoldout.sourceHashes.length,
      duplicateDeclarations,
      uniqueSources: sourceHashes.length,
      currentBytesRevalidated: true,
      sourceHashes,
    },
    matrixReproduction: {
      deriver: MATRIX_HELPER,
      exactPublishedBytesMatch: true,
      derivedSourceCount: derivedMatrix.sourceHashes.length,
    },
    holdoutReproduction: {
      deriver: HOLDOUT_HELPER,
      exactPublishedBytesMatch: true,
      derivedSourceCount: derivedHoldout.sourceHashes.length,
    },
    comparisons: [
      summarizeComparison('matrix', matrixSubject, matrixComparison),
      summarizeComparison('holdout', holdoutSubject, holdoutComparison),
    ],
    scope: {
      representation: 'Observed NIL maps to null; observed point lists are represented by JS Arrays retaining the supplied START object at the tail.',
      limits: 'Finite captured inputs/results only. Native cons-cell representation, intermediate helper order, RNG purity, natural callers and general traversal behavior are not established.',
    },
  };

  const output = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(outputPath, output, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({
    output: portable(relative(PROJECT_ROOT, outputPath)),
    sha256: sha256(output),
    bytes: output.length,
    sourceCount: sourceHashes.length,
    exactMatrixBytesMatch: true,
    exactHoldoutBytesMatch: true,
    matrixCases: matrixComparison.comparedCases,
    holdoutCases: holdoutComparison.comparedCases,
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
