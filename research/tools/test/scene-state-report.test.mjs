import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

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

test('retained seed-1234 original-engine report preserves the early draw boundary', () => {
  const path = new URL('../../introspection/evidence/scene-state-local-windows10-seed1234-20260926.txt', import.meta.url);
  const report = parseSceneStateReport(readFileSync(path, 'utf8'));
  assert.deepEqual(report.boundaries, [
    'FIRST-DRAW-CFORM', 'AFTER-RPARSE', 'FIRST-SCREEN-AND-STORE',
  ]);
  const binding = (snapshot, name) => snapshot.rows.find((row) => row.name === name);
  assert.equal(binding(report.snapshots[0], 'RGB-MAP').summary, 'NIL');
  assert.equal(binding(report.snapshots[2], 'BRUSH').type, 'COMMON-GRAPHICS-USER::PAINT-BRUSH');
  assert.equal(binding(report.snapshots[2], 'RPLANE').summary, 'INT:79');
  assert.match(binding(report.snapshots[2], 'RGB-MAP').summary, /OBJECT:COMMON-GRAPHICS-USER::AARGB/);
});

test('retained writer report validates original entry/exit order and argument summaries', () => {
  const path = new URL('../../introspection/evidence/scene-state-local-windows10-writer-seed1234-20260926.txt', import.meta.url);
  const report = parseSceneStateReport(readFileSync(path, 'utf8'));
  assert.deepEqual(report.boundaries, [
    'FIRST-DRAW-CFORM', 'FIRST-STORE-IN-FILE-ENTER',
    'FIRST-STORE-IN-FILE-EXIT', 'AFTER-RPARSE',
    'FIRST-PREP-LINE-ENTER', 'FIRST-PREP-LINE-EXIT',
    'FIRST-SCREEN-AND-STORE',
  ]);
  assert.equal(report.targets.some(({name}) => name === 'PREP-LINE'), true);
  assert.equal(report.targets.some(({name}) => name === 'STORE-IN-FILE'), true);
  const byLabel = (label) => report.snapshots.find((snapshot) => snapshot.label === label);
  const binding = (snapshot, name) => snapshot.rows.find((row) => row.name === name);
  const store = byLabel('FIRST-STORE-IN-FILE-ENTER');
  assert.equal(store.arguments[0].summary, 'SYMBOL:COMMON-LISP::VECTOR');
  assert.equal(store.arguments[2].summary, 'OBJECT:COMMON-GRAPHICS-USER::VISPT');
  assert.equal(store.arguments[6].summary, 'SYMBOL:COMMON-LISP::T');
  assert.equal(binding(store, 'RGB-MAP').summary, 'NIL');
  const prep = byLabel('FIRST-PREP-LINE-ENTER');
  assert.deepEqual(prep.arguments.map(({summary}) => summary), ['NIL', 'INT:5']);
  assert.equal(binding(prep, 'BRUSH').type, 'COMMON-GRAPHICS-USER::PAINT-BRUSH');
  assert.match(binding(prep, 'RGB-MAP').summary, /OBJECT:COMMON-GRAPHICS-USER::AARGB/);
});

test('retained transition report captures color, plane, and brush state in call order', () => {
  const path = new URL('../../introspection/evidence/scene-state-local-windows10-transition-seed1234-20260926.txt', import.meta.url);
  const report = parseSceneStateReport(readFileSync(path, 'utf8'));
  const byLabel = (label) => report.snapshots.find((snapshot) => snapshot.label === label);
  const binding = (snapshot, name) => snapshot.rows.find((row) => row.name === name);
  const before = (first, second) => report.boundaries.indexOf(first) < report.boundaries.indexOf(second);

  assert.equal(report.targets.some(({name}) => name === 'SELECT-BRUSH'), true);
  assert.equal(before('FIRST-DISPLAY-PROTOCOL-EXIT', 'FIRST-ASSIGN-COLORS-ENTER'), true);
  assert.equal(before('FIRST-ASSIGN-COLORS-ENTER', 'FIRST-SELECT-BRUSH-RETURN'), true);
  assert.equal(before('FIRST-SELECT-BRUSH-RETURN', 'FIRST-RECORD-BRUSH-ENTER'), true);

  const displayExit = byLabel('FIRST-DISPLAY-PROTOCOL-EXIT');
  assert.equal(binding(displayExit, 'RGB-MAP').summary, 'NIL');
  assert.equal(binding(displayExit, 'RPLANE').summary, 'INT:79');
  const assignEntry = byLabel('FIRST-ASSIGN-COLORS-ENTER');
  assert.match(binding(assignEntry, 'RGB-MAP').summary, /^CONS-STEPS=16-/);

  const selectorReturn = byLabel('FIRST-SELECT-BRUSH-RETURN');
  assert.equal(selectorReturn.arguments[0].type, 'COMMON-GRAPHICS-USER::PAINT-BRUSH');
  assert.equal(selectorReturn.arguments[0].brushId, 'INT:2');
  assert.equal(binding(selectorReturn, 'BRUSH').bound, false);

  const recordEntry = byLabel('FIRST-RECORD-BRUSH-ENTER');
  assert.equal(binding(recordEntry, 'BRUSH').bound, true);
  assert.equal(binding(recordEntry, 'BRUSH').type, 'COMMON-GRAPHICS-USER::PAINT-BRUSH');
  assert.equal(recordEntry.brushId, 'INT:2');
});

test('retained PLAN SCRIPT report shows NIL followed by a one-item BLOX list', () => {
  const path = new URL('../../introspection/evidence/scene-state-local-windows10-plan-seed1234-20260926.txt', import.meta.url);
  const report = parseSceneStateReport(readFileSync(path, 'utf8'));
  const byLabel = (label) => report.snapshots.find((snapshot) => snapshot.label === label);
  const enterIndex = report.boundaries.indexOf('FIRST-SCRIPT-ENTER');
  const nilReturnIndex = report.boundaries.indexOf('FIRST-SCRIPT-RETURN');
  const nonNilReturnIndex = report.boundaries.indexOf('FIRST-SCRIPT-NONNIL-RETURN');

  assert.deepEqual(report.targets.find(({name}) => name === 'SCRIPT'), {
    name: 'SCRIPT', actualPackage: 'COMMON-GRAPHICS-USER',
    actualName: 'SCRIPT', kind: 'SCRIPT',
  });
  assert.ok(enterIndex >= 0 && enterIndex < nilReturnIndex && nilReturnIndex < nonNilReturnIndex);
  assert.equal(byLabel('FIRST-SCRIPT-ENTER').arguments[0].type, 'COMMON-GRAPHICS-USER::PLAN');
  assert.equal(byLabel('FIRST-SCRIPT-RETURN').arguments[0].summary, 'NIL');

  const firstNonNil = byLabel('FIRST-SCRIPT-NONNIL-RETURN').arguments[0];
  assert.equal(firstNonNil.type, 'COMMON-LISP::CONS');
  assert.equal(firstNonNil.summary, 'CONS-STEPS=1-PROPER=T-DOTTED=NIL-CAPPED=NIL-ITEMS=OBJECT:COMMON-GRAPHICS-USER::BLOX');
});

test('retained integrated writer report preserves natural VISPTs and stream positions', () => {
  const path = new URL('../../introspection/evidence/scene-state-local-windows10-writer-stream-seed1234-20260926.txt', import.meta.url);
  const report = parseSceneStateReport(readFileSync(path, 'utf8'));
  const byLabel = (label) => report.snapshots.find((snapshot) => snapshot.label === label);
  const entry = byLabel('FIRST-STORE-IN-FILE-ENTER');
  const exit = byLabel('FIRST-STORE-IN-FILE-EXIT');
  assert.equal(entry.arguments[0].summary, 'SYMBOL:COMMON-LISP::VECTOR');
  assert.equal(entry.arguments[6].summary, 'SYMBOL:COMMON-LISP::T');
  assert.deepEqual(entry.arguments[2].vispt, {
    x: 'FLOAT:COMMON-LISP::DOUBLE-FLOAT:106.91827677510554',
    y: 'FLOAT:COMMON-LISP::DOUBLE-FLOAT:384.1616650397512',
    vis: 'INT:1',
  });
  assert.deepEqual(entry.arguments[4].vispt, {
    x: 'FLOAT:COMMON-LISP::DOUBLE-FLOAT:109.11479859934074',
    y: 'FLOAT:COMMON-LISP::DOUBLE-FLOAT:385.81143739727474',
    vis: 'INT:1',
  });
  assert.deepEqual(entry.writerStream, {
    status: 'STREAM', type: 'EXCL::CHARACTER-OUTPUT-FILE-STREAM',
    output: 'T', position: 'INT:0',
  });
  assert.deepEqual(exit.writerStream, {
    status: 'STREAM', type: 'EXCL::CHARACTER-OUTPUT-FILE-STREAM',
    output: 'T', position: 'INT:36',
  });
});

test('retained writer sequence has 64 paired natural calls and bounded summary', () => {
  const path = new URL('../../introspection/evidence/scene-state-local-windows10-writer-sequence-seed1234-20260926.txt', import.meta.url);
  const report = parseSceneStateReport(readFileSync(path, 'utf8'));
  assert.deepEqual(report.writerSequenceSummary, {total: 28075, recorded: 64, limit: 64});
  assert.equal(report.writerCalls.length, 64);
  assert.equal(report.writerCalls.every(({selector, redraw, status}) => (
    selector === 'VECTOR' && redraw === 'T' && status === 'SUCCESS'
  )), true);
  assert.equal(report.writerCalls[0].enterPosition, 'INT:0');
  assert.equal(report.writerCalls[0].exitPosition, 'INT:36');
  assert.equal(report.writerCalls.at(-1).exitPosition, 'INT:1224');
  assert.equal(report.writerCalls.filter((call) => (
    call.pta.vis === 'INT:0' || call.ptb.vis === 'INT:0'
  )).length, 2);
});

test('retained writer windows cover all natural selector families and state boundaries', () => {
  const path = new URL('../../introspection/evidence/scene-state-local-windows10-writer-windows-seed1234-20260926.txt', import.meta.url);
  const report = parseSceneStateReport(readFileSync(path, 'utf8'));
  assert.deepEqual(report.writerSequenceSummary, {total: 28075, recorded: 299, limit: 299});
  assert.equal(report.writerCalls.length, 299);
  assert.deepEqual(report.writerSelectorSummary.map(({selector, count}) => [selector, count]), [
    ['VECTOR', 656], ['COLOR', 1], ['BRUSH', 25], ['AARGB', 1454],
    ['MOVE-TO', 772], ['DRAW-TO', 24903], ['HUE', 2], ['FILL', 261], ['END', 1],
  ]);
  const byOrdinal = (ordinal) => report.writerCalls.find((call) => call.ordinal === ordinal);
  assert.equal(report.writerCalls.every((call) => (
    call.fileSize === 'SYMBOL:COMMON-GRAPHICS-USER::SMALL'
  )), true);
  assert.deepEqual(byOrdinal(656).previousBefore, byOrdinal(656).previousAfter);
  assert.equal(byOrdinal(657).arguments[2].summary, 'INT:5');
  assert.equal(byOrdinal(658).arguments[2].summary, 'INT:29');
  assert.deepEqual(byOrdinal(659).pta, {x: 'INT:315', y: 'INT:69', vis: 'UNAVAILABLE'});
  assert.deepEqual(byOrdinal(660).previousBefore, byOrdinal(659).previousAfter);
  assert.deepEqual(byOrdinal(3478).pta, {x: 'INT:136', y: 'INT:401', vis: 'UNAVAILABLE'});
  assert.deepEqual(byOrdinal(3478).previousBefore, byOrdinal(3478).previousAfter);
  assert.equal(byOrdinal(28074).selector, 'END');
  assert.equal(byOrdinal(28074).exitPosition, 'ERROR'); // stream closed successfully
  assert.equal(byOrdinal(28074).status, 'SUCCESS');
});
