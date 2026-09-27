const INTEGER = /^[+-]?\d+$/;
const FLOAT = /^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eEsSfFdDlL][+-]?\d+)?$/;

function typedScalar(type, raw) {
  if (!['FIXNUM', 'SINGLE-FLOAT', 'DOUBLE-FLOAT'].includes(type)) throw new Error(`Unsupported RAN scalar type: ${type}`);
  if (!INTEGER.test(raw) && !FLOAT.test(raw)) throw new Error(`Unsupported RAN scalar value: ${raw}`);
  if (type === 'FIXNUM' && !INTEGER.test(raw)) throw new Error(`FIXNUM RAN value is not an integer: ${raw}`);
  const number = Number(raw.replace(/[sSfFdDlL]/, 'e'));
  if (!Number.isFinite(number)) throw new Error(`Non-finite RAN scalar: ${raw}`);
  return { type, raw, value: type === 'SINGLE-FLOAT' ? Math.fround(number) : number };
}

function typedForms(text, count, label) {
  const regex = /\(:TYPE (FIXNUM|SINGLE-FLOAT|DOUBLE-FLOAT) :VALUE ([^\s)]+)\)/g;
  const matches = [...text.matchAll(regex)];
  const residue = text.replace(regex, '').replace(/[()\s]/g, '');
  if (matches.length !== count || residue !== '') throw new Error(`${label} must contain exactly ${count} typed scalars`);
  return matches.map((match, index) => typedScalar(match[1], match[2]));
}

function randomPreview(text, label) {
  const match = /^\((\d+) (\d+) (\d+)\)$/.exec(text);
  if (!match) throw new Error(`${label} must be a three-integer preview`);
  return match.slice(1).map(Number);
}

export function parseNaturalFreePathRanReport(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.shift() !== 'BEGIN natural-free-path-ran v1') throw new Error('Missing natural FREE-PATH RAN report header');
  const capsMatch = /^CAPS free-path-calls=(\d+) ran-calls=(\d+)$/.exec(lines.shift() ?? '');
  if (!capsMatch) throw new Error('Missing or malformed nested RAN caps');
  const ready = lines.shift();
  if (ready !== 'READY free-path=COMMON-GRAPHICS-USER::FREE-PATH ran=COMMON-GRAPHICS-USER::RAN') {
    throw new Error('Missing or malformed nested RAN targets');
  }
  const report = {
    schema: 'aaron-natural-free-path-ran-evidence-v1',
    caps: { freePathCalls: Number(capsMatch[1]), ranCalls: Number(capsMatch[2]) },
    calls: [],
  };
  let pending = null;
  let lastOrdinal = 0;
  let totalRan = 0;
  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    let match = /^CALL id=(\d+) arg-count=(\d+) rng-before=(\(.+\))$/.exec(line);
    if (match) {
      if (pending) throw new Error(`CALL ${match[1]} began before CALL ${pending.id} returned`);
      pending = { id: Number(match[1]), argCount: Number(match[2]), rngBefore: randomPreview(match[3], 'CALL rng-before'), ran: [] };
      report.calls.push(pending);
      if (report.calls.length > report.caps.freePathCalls) throw new Error('FREE-PATH call cap exceeded without an overflow record');
      continue;
    }
    match = /^RAN free-path-id=(\d+) ordinal=(\d+) args=(\(.*\)) values=(\(.*\))$/.exec(line);
    if (match) {
      if (!pending || Number(match[1]) !== pending.id) throw new Error(`RAN without matching pending FREE-PATH call at line ${index + 4}`);
      const ordinal = Number(match[2]);
      if (!Number.isInteger(ordinal) || ordinal <= lastOrdinal) throw new Error('RAN ordinals must increase strictly');
      lastOrdinal = ordinal;
      pending.ran.push({
        ordinal,
        args: typedForms(match[3], 2, `RAN ${ordinal} args`),
        values: typedForms(match[4], 1, `RAN ${ordinal} values`),
      });
      totalRan += 1;
      if (totalRan > report.caps.ranCalls) throw new Error('Nested RAN cap exceeded without an overflow record');
      continue;
    }
    match = /^RETURN id=(\d+) value-count=(\d+) ran-count=(\d+) rng-after=(\(.+\))$/.exec(line);
    if (match) {
      if (!pending || Number(match[1]) !== pending.id) throw new Error(`RETURN without matching pending CALL at line ${index + 4}`);
      pending.valueCount = Number(match[2]);
      pending.ranCount = Number(match[3]);
      pending.rngAfter = randomPreview(match[4], 'RETURN rng-after');
      if (pending.ranCount !== pending.ran.length) throw new Error(`CALL ${pending.id} RAN count mismatch`);
      pending.status = 'returned';
      pending = null;
      continue;
    }
    throw new Error(`Unsupported nested RAN report record at line ${index + 4}: ${line.slice(0, 80)}`);
  }
  if (pending) throw new Error(`Unfinished nested RAN call ${pending.id}`);
  report.completed = report.calls.length > 0 && report.calls.every(call => call.status === 'returned');
  return report;
}

export function summarizeNaturalFreePathRanCall(call) {
  if (!call || call.status !== 'returned') throw new Error('RAN summary requires a returned call');
  const countChoice = call.ran[0];
  if (!countChoice || countChoice.args[0].type !== 'FIXNUM' || countChoice.args[1].type !== 'FIXNUM') {
    throw new Error(`CALL ${call.id} has no leading integer step-count RAN`);
  }
  const selectedSteps = countChoice.values[0].value;
  const groups = [];
  for (let index = 1; index < call.ran.length; index += 3) {
    const scale = call.ran[index];
    const wiggle = call.ran[index + 1];
    const angle = call.ran[index + 2];
    if (!scale || !wiggle || !angle) throw new Error(`CALL ${call.id} has a partial scale/wiggle/angle group`);
    groups.push({ scale, wiggle, angle });
  }
  let cumulativeScale = 0;
  let crossingIteration = null;
  for (const [index, group] of groups.entries()) {
    cumulativeScale = Math.fround(cumulativeScale + group.scale.values[0].value);
    if (crossingIteration === null && cumulativeScale >= selectedSteps) crossingIteration = index + 1;
  }
  return {
    callId: call.id,
    stepCountCall: {
      ordinal: countChoice.ordinal,
      bounds: countChoice.args.map(value => [value.type, value.raw]),
      result: [countChoice.values[0].type, countChoice.values[0].raw],
      selectedSteps,
    },
    ranCount: call.ranCount,
    iterationCount: groups.length,
    scaleValues: groups.map(({ scale }) => [scale.values[0].type, scale.values[0].raw]),
    scaleSumSingle: cumulativeScale,
    firstCumulativeCrossingAtOrAboveSelectedSteps: crossingIteration,
    rngBefore: call.rngBefore,
    rngAfter: call.rngAfter,
    drawsPerFullIteration: 3,
  };
}
