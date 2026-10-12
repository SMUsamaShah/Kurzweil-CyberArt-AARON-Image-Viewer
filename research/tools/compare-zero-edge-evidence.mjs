#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { traceAaronZeroEdge } from '../../engine/src/aaron-zero-edge.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const modulePath = fileURLToPath(new URL('../../engine/src/aaron-zero-edge.js', import.meta.url));
const integer = value => Number.isSafeInteger(value);

function cellVector(cells, width, height, label) {
  assert(Array.isArray(cells) && cells.length === width * height, `${label}: incomplete cell coverage`);
  return cells.map((cell, index) => {
    assert(Array.isArray(cell) && cell.length === 3, `${label}: malformed cell ${index}`);
    assert.equal(cell[0], Math.floor(index / height), `${label}: x order ${index}`);
    assert.equal(cell[1], index % height, `${label}: y order ${index}`);
    assert(integer(cell[2]) && cell[2] >= 0 && cell[2] <= 15, `${label}: value ${index}`);
    return cell[2];
  });
}

/** Compare observed inputs/results; this does not rederive their raw-source closure. */
export function compareZeroEdgeEvidence(evidence) {
  assert.equal(evidence.schemaVersion, 1, 'Evidence schema version');
  const matrix = evidence.kind === 'zero-edge-bounded-input-matrix-evidence';
  const holdout = evidence.kind === 'zero-edge-variable-dimension-holdout-evidence';
  assert(matrix || holdout, 'Unsupported ZERO-EDGE evidence kind');
  const entries = matrix ? [['matrix', evidence.runs?.matrix]]
    : [['base', evidence.runs?.base], ['ring', evidence.runs?.ring]];
  let comparedCases = 0, returnedPoints = 0, nilReturns = 0, listReturns = 0, mutatedStarts = 0;
  const dimensions = new Set();
  const ordinals = new Set();
  for (const [name, run] of entries) {
    const report = run?.report;
    assert(report && Array.isArray(report.cases) && report.cases.length > 0, `${name}: missing cases`);
    assert.equal(report.completion?.complete, true, `${name}: incomplete report`);
    assert.equal(report.completion.errors, 0, `${name}: observer errors`);
    assert.equal(report.completion.calls, report.cases.length, `${name}: call count`);
    for (const [caseIndex, row] of report.cases.entries()) {
      const label = `${name} ordinal ${row.ordinal}`;
      assert(integer(row.ordinal) && !ordinals.has(row.ordinal), `${label}: invalid or repeated ordinal`);
      ordinals.add(row.ordinal);
      if (holdout) assert.equal(row.localCall, caseIndex + 1, `${label}: local call order`);
      const width = matrix ? 7 : row.width, height = matrix ? 7 : row.height;
      assert(integer(width) && width > 0 && integer(height) && height > 0
        && width * height <= 128, `${label}: invalid dimensions`);
      dimensions.add(`${width}x${height}`);
      const target = row.target;
      assert(target && Array.isArray(target.startBefore) && target.startBefore.length === 3
        && target.startBefore.every(integer), `${label}: incomplete START input`);
      assert.deepEqual(row.start, target.startBefore, `${label}: case/target START disagreement`);
      const input = cellVector(target.scratchBefore, width, height, `${label} input`);
      const observedAfter = cellVector(target.scratchAfter, width, height, `${label} output`);
      const maps = { width, height, fillMap: Uint8Array.from(input) };
      const start = { x: target.startBefore[0], y: target.startBefore[1], z: target.startBefore[2] };
      const result = traceAaronZeroEdge({ maps, start, perim: row.perim });
      assert.equal(target.return.arity, 1, `${label}: primary-value contract`);
      assert.equal(target.return.values.length, 1, `${label}: typed-value count`);
      assert.deepEqual([start.x, start.y, start.z], target.startAfter, `${label}: START mutation`);
      assert.deepEqual(Array.from(maps.fillMap), observedAfter, `${label}: map output`);
      assert.deepEqual(Array.from(maps.fillMap), input, `${label}: map preservation`);
      assert.equal(target.startUnchanged, target.startBefore.every((value, index) => value === target.startAfter[index]),
        `${label}: START unchanged flag`);
      if (!target.startUnchanged) mutatedStarts++;
      const path = target.return.path;
      assert.equal(path.present, true, `${label}: primary path observation`);
      assert.equal(path.proper, true, `${label}: proper path`);
      assert.equal(path.circular, false, `${label}: circular path`);
      assert.equal(path.improper, false, `${label}: improper path`);
      assert.equal(path.truncated, false, `${label}: truncated path`);
      assert.equal(path.resultEqStart, false, `${label}: list/point identity`);
      assert.equal(path.tailEqStart, false, `${label}: tail/point identity`);
      assert.deepEqual(path.tail, { marker: 'NONE' }, `${label}: tail`);
      if (result === null) {
        assert.equal(target.return.values[0].type, 'NULL', `${label}: NIL type`);
        assert.equal(target.return.values[0].summary, null, `${label}: typed NIL summary`);
        assert.equal(path.count, 0, `${label}: NIL path count`);
        assert.deepEqual(path.items, [], `${label}: NIL path items`);
        nilReturns++;
      } else {
        assert(Array.isArray(result) && result.length > 0, `${label}: JS list representation`);
        assert.equal(target.return.values[0].type, 'CONS', `${label}: list type`);
        const typed = target.return.values[0].summary;
        assert.equal(typed.count, result.length, `${label}: typed list count`);
        assert.equal(typed.proper, true, `${label}: typed proper list`);
        assert.equal(typed.truncated, false, `${label}: typed list truncation`);
        assert.deepEqual(typed.tail, { marker: 'NONE' }, `${label}: typed list tail`);
        assert.deepEqual(typed.list, result.map(() => ({ objectType: 'TRIPT' })), `${label}: typed point coverage`);
        assert.equal(path.count, result.length, `${label}: point count`);
        assert.equal(path.items.length, result.length, `${label}: observed point coverage`);
        assert.equal(result.at(-1), start, `${label}: supplied START tail identity`);
        for (const [index, point] of result.entries()) {
          const observed = path.items[index];
          assert.equal(observed.index, index, `${label}: point index ${index}`);
          assert.equal(observed.pointIsTript, true, `${label}: captured TRIPT ${index}`);
          assert.equal(observed.pointType, 'TRIPT', `${label}: captured point type ${index}`);
          assert.deepEqual([point.x, point.y, point.z], observed.xyz, `${label}: point XYZ ${index}`);
          assert.equal(point === start, observed.pointEqStart, `${label}: START identity ${index}`);
          assert.equal(result.findIndex(other => other === point), observed.pointFirstEqIndex,
            `${label}: first point identity ${index}`);
        }
        listReturns++; returnedPoints += result.length;
      }
      comparedCases++;
    }
  }
  assert.equal(comparedCases, matrix ? 160 : 39, 'Complete evidence case count');
  for (let ordinal = 1; ordinal <= comparedCases; ordinal++) assert(ordinals.has(ordinal), `Missing ordinal ${ordinal}`);
  return { comparedCases, returnedPoints, nilReturns, listReturns, mutatedStarts,
    dimensions: [...dimensions].sort(), mismatches: 0,
    representation: 'NIL maps to null; observed point lists are represented by JS Arrays retaining the supplied START object at the tail',
    limits: 'Only captured inputs/results are compared. Native cons-cell representation, intermediate helper order, RNG purity and wider inputs remain outside this comparison.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assert(process.argv.length >= 3, 'Usage: node research/tools/compare-zero-edge-evidence.mjs <portable-evidence.json> [...]');
    const comparisons = process.argv.slice(2).map(path => {
      const bytes = readFileSync(resolve(path));
      const decoded = bytes.toString('utf8');
      assert(Buffer.from(decoded, 'utf8').equals(bytes), `${path}: UTF-8 round trip`);
      return { evidencePath: path, evidenceSha256: hash(bytes), evidenceBytes: bytes.length,
        ...compareZeroEdgeEvidence(JSON.parse(decoded)) };
    });
    process.stdout.write(JSON.stringify({ engineSourceSha256: hash(readFileSync(modulePath)), comparisons }, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1;
  }
}
