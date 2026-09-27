#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [reportPath, summaryPath, outputPath] = process.argv.slice(2);
if (!reportPath || !summaryPath || !outputPath) {
  throw new Error('Usage: derive-select-brush-domain.mjs <matrix-report> <run-summary> <output-json>');
}

const reportBytes = readFileSync(reportPath);
const report = reportBytes.toString('utf8').replace(/^\uFEFF/, '');
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const lines = report.trim().split(/\r?\n/);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const one = (pattern, description) => {
  const matches = lines.map((line) => pattern.exec(line)).filter(Boolean);
  assert.equal(matches.length, 1, `expected one ${description}`);
  return matches[0];
};

assert.equal(lines[0], 'BEGIN select-brush-boundary-matrix');
assert.equal(lines.at(-1), 'END select-brush-boundary-matrix');
assert.equal(summary.complete, true);
assert.equal(summary.mode, 'select-brush-matrix-seed-1234');
assert.equal(summary.smallImage, false);

const expectedCases = Number(one(/^EXPECTED-CASES (\d+)$/, 'case count')[1]);
const triggerMatch = one(
  /^TRIGGER source=FIRST-STORE-IN-FILE arg-count=(\d+) result-count=(\d+)$/,
  'trigger record',
);
const profiles = lines.flatMap((line) => {
  const match = /^PROFILE-PRE index=(\d+) type=([^ ]+) id=INT:(\d+) envir=(-?\d+),(-?\d+)$/.exec(line);
  return match ? [{
    index: Number(match[1]),
    type: match[2],
    id: Number(match[3]),
    envir: [Number(match[4]), Number(match[5])],
  }] : [];
});
const postProfiles = lines.flatMap((line) => {
  const match = /^PROFILE-POST index=(\d+) type=([^ ]+) id=INT:(\d+) envir=(-?\d+),(-?\d+)$/.exec(line);
  return match ? [{
    index: Number(match[1]),
    type: match[2],
    id: Number(match[3]),
    envir: [Number(match[4]), Number(match[5])],
  }] : [];
});
assert.equal(profiles.length, 7);
assert.deepEqual(postProfiles, profiles);
assert.match(lines.join('\n'), /PROFILE-PRE count=7 status=COMPLETE/);
assert.match(lines.join('\n'), /PROFILE-POST count=7 status=COMPLETE/);

const brushBefore = new Map();
const brushAfter = new Map();
const rngCases = new Map();
for (const line of lines) {
  let match = /^BRUSH-BEFORE index=(\d+) (.*)$/.exec(line);
  if (match) brushBefore.set(Number(match[1]), match[2]);
  match = /^BRUSH-AFTER index=(\d+) (.*)$/.exec(line);
  if (match) brushAfter.set(Number(match[1]), match[2]);
  match = /^RNG-CASE index=(\d+) before=([^ ]+) after=([^ ]+) unchanged=(T|NIL)$/.exec(line);
  if (match) rngCases.set(Number(match[1]), {
    before: match[2], after: match[3], unchanged: match[4] === 'T',
  });
}

const cases = lines.flatMap((line) => {
  const match = /^CASE index=(\d+) input=(-?\d+) status=(VALUE|NIL) value-count=(\d+) type=([^ ]+) id=([^ ]+) eq-indices=([^ ]+) condition=([^ ]+)$/.exec(line);
  if (!match) return [];
  const index = Number(match[1]);
  const resultId = match[6] === 'NIL' ? null : Number(match[6].replace(/^INT:/, ''));
  const allBrushesIndex = match[7] === 'NONE' ? null : Number(match[7]);
  return [{
    index,
    input: Number(match[2]),
    status: match[3],
    valueCount: Number(match[4]),
    type: match[5],
    resultId,
    allBrushesIndex,
    condition: match[8],
    brushBefore: brushBefore.get(index),
    brushAfter: brushAfter.get(index),
    rng: rngCases.get(index),
  }];
});
assert.equal(cases.length, expectedCases);
assert.equal(new Set(cases.map(({ input }) => input)).size, cases.length);
for (const item of cases) {
  assert.equal(item.valueCount, 1, `value count at ${item.input}`);
  assert.equal(item.condition, 'NONE', `condition at ${item.input}`);
  assert.notEqual(item.brushBefore, undefined, `missing brush-before at ${item.input}`);
  assert.equal(item.brushAfter, item.brushBefore, `BRUSH changed at ${item.input}`);
  assert.equal(item.rng?.unchanged, true, `random state changed at ${item.input}`);
  if (item.status === 'NIL') {
    assert.equal(item.resultId, null);
    assert.equal(item.allBrushesIndex, null);
  } else {
    assert.equal(item.type, 'COMMON-GRAPHICS-USER::PAINT-BRUSH');
    assert.equal(item.resultId, item.allBrushesIndex);
  }
}

const ranges = lines.flatMap((line) => {
  const match = /^SWEEP-RANGE from=(\d+) through=(\d+) result=(NIL|ID:(\d+))$/.exec(line);
  if (!match) return [];
  return [{
    from: Number(match[1]),
    through: Number(match[2]),
    resultId: match[3] === 'NIL' ? null : Number(match[4]),
  }];
});
const domainStatus = one(
  /^SWEEP-STATUS status=(COMPLETE|FAILED) inputs=(\d+) lower=(\d+) upper-inclusive=(\d+)$/,
  'domain status',
);
const stateMatch = one(
  /^SWEEP-STATE inputs=(\d+) nil=(\d+) id0=(\d+) id1=(\d+) id2=(\d+) id3=(\d+) id4=(\d+) id5=(\d+) id6=(\d+) unknown=(\d+) other=(\d+) rng-unchanged=(T|NIL) brush-unchanged=(T|NIL) profiles-unchanged=(T|NIL)$/,
  'domain state summary',
);
const ambient = one(
  /^RNG-AMBIENT before=([^ ]+) after=([^ ]+) unchanged=(T|NIL)$/,
  'ambient random-state check',
);
const sweep = {
  domain: { type: 'integer', lower: Number(domainStatus[3]), upperInclusive: Number(domainStatus[4]) },
  inputs: Number(domainStatus[2]),
  ranges,
  counts: {
    nil: Number(stateMatch[2]),
    ...Object.fromEntries(Array.from({ length: 7 }, (_, id) => [`id${id}`, Number(stateMatch[3 + id])])),
    unknown: Number(stateMatch[10]),
    other: Number(stateMatch[11]),
  },
  stateChecks: {
    randomStateUnchanged: stateMatch[12] === 'T',
    brushBindingUnchanged: stateMatch[13] === 'T',
    brushProfilesUnchanged: stateMatch[14] === 'T',
    ambientRandomStateUnchanged: ambient[3] === 'T' && ambient[1] === ambient[2],
  },
};
assert.equal(domainStatus[1], 'COMPLETE');
assert.equal(sweep.domain.lower, 0);
assert.equal(sweep.domain.upperInclusive, 200000);
assert.equal(sweep.inputs, sweep.domain.upperInclusive - sweep.domain.lower + 1);
let nextInput = sweep.domain.lower;
for (const range of ranges) {
  assert.equal(range.from, nextInput, 'sweep ranges must be contiguous');
  assert.ok(range.through >= range.from, 'sweep range must be nonempty');
  nextInput = range.through + 1;
}
assert.equal(nextInput, sweep.domain.upperInclusive + 1);
assert.equal(Object.values(sweep.counts).reduce((sum, count) => sum + count, 0), sweep.inputs);
assert.equal(sweep.counts.unknown, 0);
assert.equal(sweep.counts.other, 0);
assert.ok(Object.values(sweep.stateChecks).every(Boolean));

const evidence = {
  schemaVersion: 1,
  source: {
    runId: summary.runId,
    mode: summary.mode,
    smallImage: summary.smallImage,
    matrixReportSha256: sha256(reportBytes),
    aa0Sha256: summary.aa0Sha256,
    sceneReportSha256: summary.sceneReportSha256,
  },
  trigger: {
    source: 'FIRST-STORE-IN-FILE',
    argumentCount: Number(triggerMatch[1]),
    resultCount: Number(triggerMatch[2]),
  },
  profiles: profiles.map(({ index, id, envir }) => ({ index, id, envir })),
  edgeCases: cases.map(({ index, input, status, resultId, allBrushesIndex, condition, rng }) => ({
    index, input, status, resultId, allBrushesIndex, condition,
    randomStateUnchanged: rng.unchanged,
  })),
  sweep,
  interpretation: {
    integerDomainComplete: true,
    edgeSamplesAreNotAnExhaustiveSpecificationOutsideDomain: true,
    unprobedInputKinds: ['fractional numbers', 'non-numbers'],
  },
};

writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  outputPath,
  cases: cases.length,
  integerInputs: sweep.inputs,
  ranges: sweep.ranges,
  stateChecks: sweep.stateChecks,
}, null, 2)}\n`);
