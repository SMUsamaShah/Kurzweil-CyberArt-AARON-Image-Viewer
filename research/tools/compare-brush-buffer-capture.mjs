import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import { markAaronFeatureBuffer } from '../../engine/src/aaron-buffer-brush.js';

const assert = (ok, label) => { if (!ok) throw new Error(label); };
const digest = value => createHash('sha256').update(Buffer.from(value)).digest('hex');
const recordHash = value => digest(JSON.stringify(value));
const add = (record, key, n = 1) => { record[key] = (record[key] ?? 0) + n; };
const integer = (value, label) => {
  assert(value?.kind === 'integer' && Number.isSafeInteger(value.value), `${label}: integer descriptor required`);
  return value.value;
};
const nilReturn = (call) => assert(call.returned?.values.length === 1 && call.returned.values[0].kind === 'nil',
  `${call.target} ${call.id}: expected one original NIL return`);
const truth = call => {
  assert(call.returned?.values.length === 1, `${call.target} ${call.id}: predicate return arity differs`);
  return call.returned.values[0].kind !== 'nil';
};
function expand(map) {
  assert(map?.bits === 4 && map.cells === map.width * map.height && map.covered === map.cells, 'Complete UB4 map required');
  const values = new Uint8Array(map.cells);
  for (const { y, runs } of map.rows) {
    let x = 0;
    for (const [value, count] of runs) for (let n = 0; n < count; n++) values[x++ * map.height + y] = value;
    assert(x === map.width, 'Map row coverage differs');
  }
  return values;
}
function equalCells(a, b, label, height) {
  assert(a.length === b.length, `${label}: map lengths differ`);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i])
    throw new Error(`${label}: (${Math.floor(i / height)},${i % height}) has ${a[i]}, expected ${b[i]}`);
}
function identity(a, b, label) {
  assert(a.id === b.id && a.type === b.type && a.width === b.width && a.height === b.height, `${label}: map identity changed`);
}
function shape(a, b, label) {
  assert(a.type === b.type && a.bits === b.bits && a.width === b.width && a.height === b.height,
    `${label}: cross-tape map shape changed`);
}
function point(point) {
  const coordinate = axis => {
    const value = point[axis];
    assert(['integer', 'number'].includes(value?.kind) && Number.isFinite(value.value), 'Numeric point required');
    return { value: value.value, precision: value.kind === 'integer' ? 'integer' : value.type === 'SINGLE-FLOAT' ? 'single' : 'double' };
  };
  const x = coordinate('x'), y = coordinate('y');
  return { x: x.value, y: y.value, xPrecision: x.precision, yPrecision: y.precision };
}
function changes(a, b) {
  const indices = [], transitions = {};
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { indices.push(i); add(transitions, `${a[i]}->${b[i]}`); }
  return { indices, transitions };
}

/** Compare complete function boundaries. This does not trace individual stores. */
export function compareBrushBufferTape(tape, previous) {
  assert(tape.schemaVersion === 2 && tape.complete && previous.complete, 'Complete source-bound tapes are required');
  const calls = tape.calls, byId = new Map(calls.map(call => [call.id, call]));
  const childCalls = calls.filter(call => ['BUFFER-FEATURE', 'BUFFER-HOLE'].includes(call.target));
  const bufferCalls = calls.filter(call => ['BUFFER-HEAD', 'BUFFER-ANYTHING'].includes(call.target));
  const strokes = calls.filter(call => call.target === 'BRUSH-STROKE');
  const clears = calls.filter(call => call.target === 'CLEAR-FILL-MAP');
  const coverage = { naturalParents: tape.complete.parents, naturalBuffers: bufferCalls.length,
    featureCalls: 0, holeCalls: 0, childOutputCellsCompared: 0, bufferOutputCellsCompared: 0,
    predicatesCompared: 0, accepted: 0, rejected: 0, edgePositions: 0, fractionalCoordinates: 0,
    childChangedCells: 0, childTouchedCells: 0, childTransitions: {}, coordinatePrecisions: {},
    brushWidths: {}, maskChoices: {}, matchedStrokeCalls: strokes.length,
    markerOutputCellsAligned: 0, clearInputCellsAligned: 0, markerToClearIntervals: tape.intervals.length,
    additionalValue3Positions: 0, additionalValue3CoveredByChildChanges: 0,
    additionalValue3Already3AtMarkerExit: 0, additionalValue3MarkerExitValues: {} };
  const profiles = {}, children = [], buffers = [], intervals = [], privateChildren = new Map();
  for (const child of childCalls) {
    assert(child.target === 'BUFFER-FEATURE', 'Naturally observed BUFFER-HOLE requires a separate measured kernel');
    nilReturn(child);
    const before = child.detail, after = child.returned.detail, input = expand(before.mapBefore), output = expand(after.mapAfter);
    identity(before.mapBefore, after.mapAfter, `${child.target} ${child.id}`);
    identity(before.mapBefore, before.fillMap, 'Child entry storage'); identity(after.mapAfter, after.fillMap, 'Child exit storage');
    assert(before.brush.id === after.brushId && before.subFrame.id === after.subFrameId
      && same(before.boundaryValue, after.boundaryValue) && integer(before.boundaryValue, 'Boundary value') === 3,
    `Child ${child.id}: dynamic brush/frame/boundary identity changed`);
    assert(child.args.length === 2, `Child ${child.id}: argument arity differs`);
    child.args.forEach(arg => integer(arg, 'Child argument'));
    const helpers = calls.filter(call => call.id !== child.id && call.child === child.id
      && call.event > child.event && call.returned.event < child.returned.event);
    const helperName = 'EDGE';
    const paths = helpers.filter(call => call.target === helperName);
    assert(paths.length === 1, `Child ${child.id}: expected one natural ${helperName}`);
    const helper = paths[0], originalPath = helper.returned.detail.pointList;
    const points = originalPath.points.map(point), profile = { width: integer(before.brush.width, 'Brush width'),
      core: before.brush.core, perim: before.brush.perim };
    const frame = before.subFrame.bounds, predicateName = 'IN-SUB-FRAME';
    const predicates = helpers.filter(call => call.target === predicateName && call.event > helper.returned.event);
    assert(helpers.filter(call => call.target === predicateName).length === predicates.length,
      `Child ${child.id}: predicates unexpectedly nested inside ${helperName}`);
    assert(helpers.every(call => [helperName, predicateName, 'CFRAME'].includes(call.target)),
      `Child ${child.id}: additional wrapped work requires explicit composition`);
    const maps = { width: before.mapBefore.width, height: before.mapBefore.height, fillMap: input.slice() };
    const result = markAaronFeatureBuffer({ maps, profile, edge: points, frame });
    assert(result.returnValue === null && result.predicateCalls === predicates.length, `Child ${child.id}: JS return/predicate coverage differs`);
    result.candidates.forEach((candidate, i) => {
      const predicate = predicates[i];
      assert(predicate.args.length === 2 && integer(predicate.args[0], 'Predicate X') === candidate.x
        && integer(predicate.args[1], 'Predicate Y') === candidate.y, `Child ${child.id}: ordered candidate ${i} differs`);
      assert(candidate.accepted === truth(predicate),
        `Child ${child.id}: accepted predicate ${i} differs`);
    });
    equalCells(maps.fillMap, output, `Child ${child.id} complete JS output`, maps.height);
    const changed = changes(input, output);
    assert(same(changed.indices, result.changed), `Child ${child.id}: changed positions differ`);
    assert(Object.keys(changed.transitions).every(key => key.endsWith('->3')), `Child ${child.id}: changed a cell to a different value`);
    coverage.featureCalls++;
    coverage.childOutputCellsCompared += output.length; coverage.predicatesCompared += result.predicateCalls;
    coverage.accepted += result.accepted; coverage.rejected += result.rejected; coverage.edgePositions += points.length;
    coverage.childChangedCells += changed.indices.length; coverage.childTouchedCells += result.touched.length;
    add(coverage.brushWidths, profile.width); add(coverage.maskChoices, result.maskName);
    for (const [key, value] of Object.entries(changed.transitions)) add(coverage.childTransitions, key, value);
    for (const p of points) for (const axis of ['x', 'y']) {
      add(coverage.coordinatePrecisions, p[`${axis}Precision`]);
      if (!Number.isInteger(p[axis])) coverage.fractionalCoordinates++;
    }
    const profileHash = recordHash(profile); profiles[profileHash] ??= { sha256: profileHash, ...profile };
    const row = { id: child.id, target: child.target, parent: child.subpart, buffer: child.buffer,
      args: child.args.map(arg => arg.value), edgeHelper: helperName, edgeArguments: helper.args,
      inputPointCount: points.length, inputPointsSha256: recordHash(points), brushProfileSha256: profileHash,
      subFrame: frame, predicateCalls: result.predicateCalls, accepted: result.accepted, rejected: result.rejected,
      orderedCandidatesSha256: recordHash(result.candidates), maskName: result.maskName,
      inputMapSha256: digest(input), outputMapSha256: digest(output), outputCells: output.length,
      changedCells: changed.indices.length, changedPositionsSha256: recordHash(changed.indices), transitions: changed.transitions,
      touchedCells: result.touched.length, touchedPositionsSha256: recordHash(result.touched),
      allOutputCellsEqual: true, originalReturn: 'NIL' };
    children.push(row); privateChildren.set(child.id, { child, row, input, output, changed: new Set(changed.indices), touched: new Set(result.touched) });
  }
  for (const buffer of bufferCalls) {
    nilReturn(buffer);
    identity(buffer.detail, buffer.returned.detail, `Buffer ${buffer.id}`);
    const owned = childCalls.filter(child => child.buffer === buffer.id), input = expand(buffer.detail), output = expand(buffer.returned.detail);
    const direct = calls.filter(call => call.buffer === buffer.id && call.id !== buffer.id && call.child === 0);
    assert(direct.every(call => call.target === 'CFRAME'), `Buffer ${buffer.id}: uncomposed work outside children`);
    let cursor = input;
    for (const child of owned) {
      const result = privateChildren.get(child.id);
      equalCells(cursor, result.input, `Buffer ${buffer.id} next child ${child.id} entry`, buffer.detail.height);
      cursor = result.output;
    }
    equalCells(cursor, output, `Buffer ${buffer.id} composed output`, buffer.detail.height);
    coverage.bufferOutputCellsCompared += output.length;
    buffers.push({ id: buffer.id, target: buffer.target, parent: buffer.subpart, args: buffer.args,
      orderedChildren: owned.map(child => ({ id: child.id, target: child.target, args: child.args })),
      inputMapSha256: digest(input), outputMapSha256: digest(output), allOutputCellsEqual: true });
  }
  // The old complete boundary tape supplies independent marker accepted positions.
  // Object IDs are local to each observer; compare semantic order and actual map bytes.
  assert(strokes.length === previous.strokes.length && clears.length === previous.clears.length
    && tape.intervals.length === clears.length, 'Previous complete stroke/clear census differs');
  const previousByNewStroke = new Map();
  strokes.forEach((stroke, i) => {
    const old = previous.strokes[i];
    assert(stroke.args.length === 4 && integer(stroke.args[1], 'Stroke value') === old.value
      && integer(stroke.args[2], 'Stroke CDEX') === old.cdex && integer(stroke.args[3], 'Stroke SDEX') === old.sdex
      && stroke.detail.path.length === old.pathLength && stroke.detail.markerP === old.sampled
      && stroke.returned.detail.returnPathEq === old.returnPathEq, `Stroke ${i}: semantic census alignment differs`);
    if (old.sampled) {
      const actualPoints = stroke.detail.path.points.map(point), priorPoints = old.before.path.points.map(p => ({ x: p.x, y: p.y,
        xPrecision: 'integer', yPrecision: 'integer' }));
      assert(same(actualPoints, priorPoints), `Marker ${i}: path coordinates differ`);
      const current = expand(stroke.returned.detail.mapAfter), prior = expand(old.after.map);
      shape(stroke.returned.detail.mapAfter, old.after.map, `Marker ${i}`);
      equalCells(current, prior, `Marker ${i}: previous complete output`, stroke.returned.detail.mapAfter.height);
      coverage.markerOutputCellsAligned += current.length;
    }
    previousByNewStroke.set(stroke.id, old);
  });
  for (const [i, interval] of tape.intervals.entries()) {
    assert(interval.ended.reason.keyword === 'CLEAR-ENTRY', 'Next-marker intervals require separate lineage analysis');
    const marker = byId.get(interval.marker), clear = byId.get(interval.ended.clear), old = previous.clears[i];
    assert(clear === clears[i] && old.latestValue3 === previousByNewStroke.get(marker.id).id, 'Marker/clear association differs');
    assert(marker.subpart === clear.subpart && same(marker.args.slice(2), clear.args), 'Marker/clear form indices differ');
    const markerMap = expand(marker.returned.detail.mapAfter), clearMap = expand(clear.detail);
    shape(clear.detail, old.beforeMap, `Clear ${i}`);
    equalCells(clearMap, expand(old.beforeMap), `Clear ${i}: previous complete input`, clear.detail.height);
    coverage.clearInputCellsAligned += clearMap.length;
    const priorMarker = previousByNewStroke.get(marker.id), accepted = new Set();
    for (const predicate of priorMarker.predicates) if (predicate.values[0]?.kind !== 'nil') {
      const x = integer(predicate.args[0], 'Prior predicate X'), y = integer(predicate.args[1], 'Prior predicate Y');
      accepted.add(x * clear.detail.height + y);
    }
    const owned = childCalls.filter(child => child.event > interval.event && child.returned.event < interval.ended.event);
    assert(owned.every(child => child.subpart === marker.subpart), 'Child buffer crossed subpart interval');
    const extra = [], covered = [], attribution = {};
    for (let j = 0; j < clearMap.length; j++) if (clearMap[j] === 3 && !accepted.has(j)) {
      extra.push(j); add(coverage.additionalValue3MarkerExitValues, markerMap[j]);
      if (markerMap[j] === 3) coverage.additionalValue3Already3AtMarkerExit++;
      const responsible = owned.filter(child => privateChildren.get(child.id).changed.has(j));
      if (responsible.length) {
        covered.push(j);
        const finalObservedChange = responsible.at(-1);
        add(attribution, `${finalObservedChange.target}:${finalObservedChange.id}`);
      }
    }
    assert(extra.length === covered.length && extra.every(j => markerMap[j] !== 3),
      `Interval ${i}: additional clear-entry 3 lacks a captured child change`);
    coverage.additionalValue3Positions += extra.length; coverage.additionalValue3CoveredByChildChanges += covered.length;
    intervals.push({ markerId: marker.id, clearId: clear.id, parent: marker.subpart, cdex: old.cdex, sdex: old.sdex,
      childIds: owned.map(child => child.id), additionalValue3Positions: extra.length,
      additionalPositionsSha256: recordHash(extra), lastCapturedChildChanges: attribution,
      everyAdditionalPositionChangedTo3WithinChild: true,
      scope: 'Complete child boundaries prove net changes; intermediate stores and continuous ownership are not observed.' });
  }
  assert(coverage.featureCalls + coverage.holeCalls === tape.complete.children && bufferCalls.length === tape.complete.buffers,
    'Natural child/buffer coverage differs');
  return { coverage, profiles: Object.values(profiles), children, buffers, intervals,
    limits: ['EDGE or ZERO-EDGE point lists, existing maps, brush masks and frame construction remain original inputs.',
      'BUFFER-HOLE and BUFFER-ANYTHING are not naturally called in these two scenes and have no measured JS kernel here.',
      'Complete function boundaries and native write sites are measured; individual array stores and continuous cell ownership are not traced.',
      'BUFFER-HEAD feature indices and BUFFER-ANYTHING plan/frame selection are recorded, not independently generated.',
      'No unobserved input domain, malformed input behavior or value-0 painter is claimed.'] };
}
