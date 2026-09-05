import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { parseFunctionConstants } from '../parse-function-constants.mjs';

const report = [
  'BEGIN function-constants',
  'HELPERS count="COMMON-GRAPHICS-USER" constant="COMMON-GRAPHICS-USER"',
  'TRY "FOLLOW"',
  'FUNCTION type=COMPILED-FUNCTION',
  'COUNT 3',
  'CONSTANT 0 (:NUMBER 1.5)',
  'CONSTANT 1 (:SYMBOL "COMMON-LISP" "PI")',
  'CONSTANT 2 (:LIST CONS)',
  'TRY "WIGGLE"',
  'FUNCTION type=COMPILED-FUNCTION',
  'COUNT NIL',
  'TRY "BRUSH-STROKE"',
  'ERROR SIMPLE-ERROR',
  'END function-constants',
  '',
].join('\n');

test('parses bounded summaries without evaluating Lisp', () => {
  const result = parseFunctionConstants(report);
  assert.deepEqual(result.helpers, {
    count: '"COMMON-GRAPHICS-USER"',
    constant: '"COMMON-GRAPHICS-USER"',
  });
  assert.deepEqual(result.candidates[0].constants, [
    { index: 0, value: { kind: 'number', value: 1.5, raw: '(:NUMBER 1.5)' } },
    {
      index: 1,
      value: {
        kind: 'symbol', package: 'COMMON-LISP', name: 'PI', raw: '(:SYMBOL "COMMON-LISP" "PI")',
      },
    },
    { index: 2, value: { kind: 'list', type: 'CONS', raw: '(:LIST CONS)' } },
  ]);
  assert.equal(result.candidates[1].status, 'count-unavailable');
  assert.equal(result.candidates[2].errorType, 'SIMPLE-ERROR');
});

test('preserves an uninterned-symbol package and capped constant counts', () => {
  const uninterned = parseFunctionConstants(report.replace(
    'CONSTANT 2 (:LIST CONS)', 'CONSTANT 2 (:SYMBOL NIL "#:TEMP")',
  ));
  assert.deepEqual(uninterned.candidates[0].constants[2].value, {
    kind: 'symbol', package: null, name: '#:TEMP', raw: '(:SYMBOL NIL "#:TEMP")',
  });
  const capped = report
    .replace('CONSTANT 2 (:LIST CONS)', 'CONSTANT 2 (:SYMBOL NIL "#:TEMP")')
    .replace('COUNT 3', 'COUNT 300');
  // A capped count cannot include constants in the probe; remove its sample
  // constants so the report models the actual bounded behavior.
  const noConstants = capped.replace(/CONSTANT [012].*\n/g, '');
  const result = parseFunctionConstants(noConstants);
  assert.equal(result.candidates[0].status, 'count-only');
  assert.deepEqual(result.candidates[0].constants, []);
  assert.deepEqual(result.candidates[0].count, 300);
});

test('rejects truncation, malformed order, and unsupported summaries', () => {
  assert.throws(() => parseFunctionConstants(report.replace('END function-constants', '')), /Truncated/);
  assert.throws(() => parseFunctionConstants(report.replace('CONSTANT 1', 'CONSTANT 2')), /contiguous/);
  assert.throws(() => parseFunctionConstants(report.replace('(:NUMBER 1.5)', '(:OBJECT FOO)')), /unsupported/);
  assert.throws(() => parseFunctionConstants(report.replace('HELPERS count=', 'HELPERS count=').replace('HELPERS count="COMMON-GRAPHICS-USER" constant="COMMON-GRAPHICS-USER"\n', '')), /Missing HELPERS/);
  assert.throws(() => parseFunctionConstants(report.replace('FUNCTION type=COMPILED-FUNCTION\n', '')), /missing function/);
  assert.throws(() => parseFunctionConstants(report.replace('COUNT 3', 'COUNT -1')), /non-negative/);
});

test('rejects missing constants even when the outer probe completed', () => {
  assert.throws(() => parseFunctionConstants(report.replace('CONSTANT 2 (:LIST CONS)\n', '')), /incomplete constants/);
  assert.throws(() => parseFunctionConstants(report.replace('COUNT NIL', 'COUNT NIL\nCOUNT NIL')), /unexpected COUNT/);
  assert.throws(() => parseFunctionConstants(report.replace('TRY "WIGGLE"', 'TRY "FOLLOW"')), /duplicate candidate/);
});

test('accepts Allegro float exponents while preserving their original spelling', () => {
  const result = parseFunctionConstants(report.replace('(:NUMBER 1.5)', '(:NUMBER 1.5d-4)'));
  assert.deepEqual(result.candidates[0].constants[0].value, {
    kind: 'number', value: 0.00015, raw: '(:NUMBER 1.5d-4)',
  });
});

test('parses all constants from the first completed original-engine report', () => {
  const path = new URL('../../introspection/evidence/function-constants-33986804721.txt', import.meta.url);
  const parsed = parseFunctionConstants(readFileSync(path, 'utf8'));
  assert.equal(parsed.candidates.length, 37);
  assert.equal(parsed.candidates.reduce((sum, entry) => sum + entry.constants.length, 0), 436);
  const wiggle = parsed.candidates.find(entry => entry.name === 'WIGGLE');
  assert.equal(wiggle.functionType, 'STANDARD-GENERIC-FUNCTION');
  assert.equal(wiggle.constants[1].value.type, '(SIMPLE-ARRAY T (7))');
});
