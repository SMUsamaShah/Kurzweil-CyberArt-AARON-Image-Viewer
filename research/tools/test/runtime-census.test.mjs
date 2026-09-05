import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRuntimeCensus } from '../summarize-runtime-census.mjs';

const report = [
  'BEGIN runtime-census',
  'SYMBOL "RAN" package="COMMON-GRAPHICS-USER" bound=NIL function=T',
  'BEGIN application-functions',
  'FUNCTION "WIGGLE"',
  'FUNCTION "RAN"',
  'END application-functions',
  'BEGIN signatures',
  'END runtime-census',
  '',
].join('\n');

test('counts repeated startup loads without doubling the unique inventory', () => {
  const result = parseRuntimeCensus((report + report).replaceAll('\n', '\r\n'));
  assert.equal(result.completedInvocations, 2);
  assert.equal(result.functionRecordCount, 4);
  assert.equal(result.uniqueFunctionCount, 2);
  assert.deepEqual(result.functions, ['RAN', 'WIGGLE']);
});

test('a completed invocation cannot hide a partial second invocation', () => {
  assert.throws(() => parseRuntimeCensus(report + 'BEGIN runtime-census'), /Truncated/);
  assert.throws(() => parseRuntimeCensus(report.replace('END runtime-census', '')), /Truncated/);
});

test('refuses mismatched inventories, errors, and malformed function records', () => {
  assert.throws(() => parseRuntimeCensus(report + report.replace('WIGGLE', 'FOLLOW')), /changed/);
  assert.throws(() => parseRuntimeCensus(report.replace('BEGIN signatures', 'ERROR reader failure')), /incomplete/);
  assert.throws(() => parseRuntimeCensus(report.replace('"WIGGLE"', '"WIGGLE')), /malformed/);
  assert.throws(() => parseRuntimeCensus(report.replace('"WIGGLE"', '"RAN"')), /duplicate/);
  assert.throws(() => parseRuntimeCensus(''), /No completed/);
});
