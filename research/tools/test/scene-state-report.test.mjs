import assert from 'node:assert/strict';
import test from 'node:test';

import {parseSceneStateReport} from '../parse-scene-state-report.mjs';

const names = [
  'MPLAN', 'SCRIPT', 'SDEX', 'FIGDEX', 'CFLIST', 'IDLIST', 'CFRAME',
  'COMPLAN', 'RPLANE', 'PLACES', 'BRUSH', 'FILL-MAP', 'RGB-MAP',
  'COLORDEX', 'PREFS',
];

function snapshot(label) {
  return [
    `BOUNDARY label=${label}`,
    `SNAPSHOT-BEGIN label=${label}`,
    ...names.map((name, index) => (
      `BINDING name=${name} requested-package=COMMON-GRAPHICS-USER package-status=FOUND symbol-status=INTERNAL actual-package=COMMON-GRAPHICS-USER actual-name=${name} bound=${index % 2 ? 'NIL' : 'T'} type=${index % 2 ? 'UNBOUND' : 'FIXNUM'} summary=${index % 2 ? 'UNBOUND' : `INT:${index}`}`
    )),
    'PLAN-ACCESSORS-SKIPPED reason=NO-VERIFIED-READERS',
    `SNAPSHOT-END label=${label} rows=15`,
  ];
}

const sample = [
  'BEGIN scene-state-snapshot',
  'SOURCE-ENTERED',
  'TRACE-LOADED',
  'TARGET-INSTALLED name=RPARSE actual-package=COMMON-GRAPHICS-USER actual-name=RPARSE kind=RPARSE',
  'TARGET-INSTALLED name=DRAW-CFORM actual-package=COMMON-GRAPHICS-USER actual-name=DRAW-CFORM kind=DRAW-CFORM',
  'TARGET-INSTALLED name=SCREEN-AND-STORE actual-package=COMMON-GRAPHICS-USER actual-name=SCREEN-AND-STORE kind=SCREEN-AND-STORE',
  'TARGET-INSTALLED name=MAIN actual-package=COMMON-GRAPHICS-USER actual-name=MAIN kind=MAIN',
  'READY required-targets=3 installed-targets=4',
  'PROBE-READY',
  ...snapshot('AFTER-RPARSE'),
  ...snapshot('FIRST-DRAW-CFORM'),
  ...snapshot('FIRST-SCREEN-AND-STORE'),
  'END scene-state-snapshot',
].join('\n');

test('parses complete three-boundary scene state and preserves sanitized rows', () => {
  const report = parseSceneStateReport(sample);
  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.boundaries, [
    'AFTER-RPARSE', 'FIRST-DRAW-CFORM', 'FIRST-SCREEN-AND-STORE',
  ]);
  assert.equal(report.targets.length, 4);
  assert.equal(report.snapshots.length, 3);
  assert.equal(report.snapshots[0].rows.length, 15);
  assert.deepEqual(report.snapshots[0].rows[0], {
    name: 'MPLAN', requestedPackage: 'COMMON-GRAPHICS-USER', packageStatus: 'FOUND',
    symbolStatus: 'INTERNAL', actualPackage: 'COMMON-GRAPHICS-USER', actualName: 'MPLAN',
    bound: true, type: 'FIXNUM', summary: 'INT:0',
  });
  assert.equal(report.snapshots[0].planAccessors.reason, 'NO-VERIFIED-READERS');
});

test('accepts explicit non-observations for boundaries that were not reached', () => {
  const partial = sample
    .replace(`${snapshot('FIRST-DRAW-CFORM').join('\n')}\n`, '')
    .replace(`${snapshot('FIRST-SCREEN-AND-STORE').join('\n')}\n`, '')
    .replace('END scene-state-snapshot', [
      'BOUNDARY-NOT-OBSERVED label=FIRST-DRAW-CFORM reason=MAIN-RETURNED',
      'BOUNDARY-NOT-OBSERVED label=FIRST-SCREEN-AND-STORE reason=MAIN-RETURNED',
      'END scene-state-snapshot',
    ].join('\n'));
  const report = parseSceneStateReport(partial);
  assert.equal(report.snapshots.length, 1);
  assert.deepEqual(report.nonObservations, [
    {label: 'FIRST-DRAW-CFORM', reason: 'MAIN-RETURNED'},
    {label: 'FIRST-SCREEN-AND-STORE', reason: 'MAIN-RETURNED'},
  ]);
});

test('rejects a snapshot with the wrong binding count', () => {
  assert.throws(
    () => parseSceneStateReport(sample.replace('SNAPSHOT-END label=AFTER-RPARSE rows=15', 'SNAPSHOT-END label=AFTER-RPARSE rows=14')),
    /snapshot row count is 15, expected 14/,
  );
});

test('rejects an incomplete report', () => {
  assert.throws(() => parseSceneStateReport(sample.replace(/\nEND scene-state-snapshot$/, '')), /Truncated/);
});
