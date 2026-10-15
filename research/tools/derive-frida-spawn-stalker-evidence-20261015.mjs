#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..', '..');
const runRelative = path.join(
  'research', 'artifacts', 'frida-stalker-trial', 'spawn-runs',
  '20261015-002344-bf0dc937',
);
const rawRelative = path.join(runRelative, 'spawn-stalker-result.json');
const fixtureRelative = path.join(runRelative, 'frida-stalker-spawn-x86.exe');
const sourceRelative = path.join('research', 'tools', 'fixtures', 'frida-stalker-spawn-x86.cs');
const observerRelative = path.join('research', 'tools', 'frida-spawn-stalker-fixture.py');
const runnerRelative = path.join('research', 'tools', 'run-frida-spawn-stalker-fixture.ps1');
const evidenceRelative = path.join('research', 'tooling', 'evidence', 'frida-stalker-spawn-x86-smoke-20261015.json');

function fail(message) {
  throw new Error(message);
}

function insist(condition, message) {
  if (!condition) fail(message);
}

function same(actual, expected, label) {
  insist(actual === expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function integer(value, label, { min = 0 } = {}) {
  insist(Number.isSafeInteger(value) && value >= min, `${label}: expected integer >= ${min}, got ${JSON.stringify(value)}`);
  return value;
}

function absolute(relativePath) {
  return path.join(repoRoot, relativePath);
}

function portable(relativePath) {
  return relativePath.split(path.sep).join('/');
}

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

function peMachine(bytes, label) {
  insist(bytes.length >= 0x40, `${label}: file is too short to contain a DOS header`);
  same(bytes.toString('ascii', 0, 2), 'MZ', `${label} DOS signature`);
  const peOffset = bytes.readUInt32LE(0x3c);
  insist(peOffset + 6 <= bytes.length, `${label}: PE header is outside the file`);
  same(bytes.toString('ascii', peOffset, peOffset + 4), 'PE\0\0', `${label} PE signature`);
  return bytes.readUInt16LE(peOffset + 4);
}

function fieldsFromReady(ready, label) {
  insist(typeof ready === 'string' && ready.startsWith('READY '), `${label}: missing READY record`);
  const fields = Object.fromEntries([...ready.matchAll(/(\w+)=([^ ]+)/g)].map((match) => [match[1], match[2]]));
  for (const key of ['pid', 'tid', 'code', 'size', 'iterations', 'repetitions']) {
    insist(fields[key] !== undefined, `${label}: READY record is missing ${key}`);
  }
  return fields;
}

function eventMatches(event, { type, source, destination }) {
  return event?.type === type
    && Number.parseInt(event.source, 16) === source
    && Number.parseInt(event.destination, 16) === destination;
}

async function main() {
  const windir = process.env.WINDIR || process.env.SystemRoot;
  insist(typeof windir === 'string' && windir.length > 0, 'WINDIR/SystemRoot is not set; cannot identify the recorded compiler');
  const compilerRelativeDescription = '%WINDIR%/Microsoft.NET/Framework/v4.0.30319/csc.exe';
  const compilerPath = path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe');
  const inputPaths = {
    raw: absolute(rawRelative),
    fixture: absolute(fixtureRelative),
    fixtureSource: absolute(sourceRelative),
    observerPython: absolute(observerRelative),
    runnerPowerShell: absolute(runnerRelative),
    compiler: compilerPath,
  };

  const rawText = await readFile(inputPaths.raw, 'utf8');
  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch (error) {
    fail(`Raw result is not valid JSON: ${error.message}`);
  }

  same(raw.schemaVersion, 1, 'raw schemaVersion');
  same(raw.status, 'pass', 'raw status');
  same(raw.fixtureMachine, 'IMAGE_FILE_MACHINE_I386', 'raw fixtureMachine');

  const hashes = {
    fixtureSha256: await sha256(inputPaths.fixture),
    fixtureSourceSha256: await sha256(inputPaths.fixtureSource),
    observerSha256: await sha256(inputPaths.observerPython),
    runnerSha256: await sha256(inputPaths.runnerPowerShell),
    compilerSha256: await sha256(inputPaths.compiler),
  };
  for (const [field, digest] of Object.entries(hashes)) {
    same(raw[field], digest, `raw ${field}`);
  }

  const fixtureBytes = await readFile(inputPaths.fixture);
  same(peMachine(fixtureBytes, 'compiled fixture'), 0x014c, 'compiled fixture PE machine');

  const expectedAssertionNames = [
    'spawnedProcessWasIa32',
    'sameFixtureResultAndEnd',
    'spawnedFixtureExitedZero',
    'multipleOrderedStalkerBatches',
    'generatedCallReturnPairsComplete',
    'generatedCallReturnSequenceHasNoErrors',
  ];
  insist(raw.assertions && typeof raw.assertions === 'object' && !Array.isArray(raw.assertions), 'raw assertions object is missing');
  same(
    Object.keys(raw.assertions).sort().join(','),
    [...expectedAssertionNames].sort().join(','),
    'raw assertion set',
  );
  for (const name of expectedAssertionNames) same(raw.assertions[name], true, `raw assertion ${name}`);

  const expectedLifecycle = [
    'output-handler-registered',
    'spawn-returned-suspended-pid',
    'session-attached',
    'agent-loaded-before-resume',
    'process-resumed',
    'fixture-ready-output-received',
    'stalker-armed-before-fixture-input',
    'instrumented-fixture-result-received',
    'traced-worker-exit-confirmed-by-join',
    'stalker-flushed-and-unfollowed',
    'stopped-event-queue-settled',
    'fixture-end-output-received',
    'process-exited-and-exit-code-read',
  ];
  const plain = raw.plain;
  const spawned = raw.spawned;
  insist(plain && typeof plain === 'object', 'plain control record is missing');
  insist(spawned && typeof spawned === 'object', 'spawned run record is missing');
  const plainReady = fieldsFromReady(plain.ready, 'plain control');
  const spawnedReady = fieldsFromReady(spawned.ready, 'spawned run');
  same(Number(plainReady.size), 20, 'plain fixture code size');
  same(Number(plainReady.iterations), 2000, 'plain fixture iterations');
  same(Number(plainReady.repetitions), 5, 'plain fixture repetitions');

  same(spawned.arch, 'ia32', 'spawned process architecture');
  same(Number(spawnedReady.pid), integer(spawned.pid, 'spawned pid', { min: 1 }), 'READY PID matches spawned PID');
  same(Number(spawnedReady.tid), integer(spawned.threadId, 'spawned thread id', { min: 1 }), 'READY thread id matches traced thread');
  same(Number.parseInt(spawnedReady.code, 16), Number.parseInt(spawned.codeBase, 16), 'READY code base matches traced code base');
  same(Number(spawnedReady.size), integer(spawned.codeSize, 'spawned code size', { min: 1 }), 'READY code size matches reported code size');
  same(Number(spawnedReady.iterations), integer(spawned.iterations, 'spawned iterations', { min: 1 }), 'READY iteration count matches report');
  same(Number(spawnedReady.repetitions), integer(spawned.repetitions, 'spawned repetitions', { min: 1 }), 'READY repetition count matches report');
  same(spawned.codeSize, 20, 'spawned generated code size');
  same(spawned.iterations, 2000, 'spawned iterations');
  same(spawned.repetitions, 5, 'spawned repetitions');
  same(JSON.stringify(spawned.lifecycle), JSON.stringify(expectedLifecycle), 'spawn lifecycle ordering');

  for (const [label, record] of [['plain', plain], ['spawned', spawned]]) {
    same(record.result, 'RESULT=42', `${label} fixture result`);
    same(record.workerExited, 'WORKER-EXITED', `${label} worker-join marker`);
    same(record.end, 'END', `${label} completion marker`);
    same(record.exitCode, 0, `${label} exit code`);
  }
  same(spawned.stderr, '', 'spawned fixture stderr');

  const expectedPairs = spawned.iterations * spawned.repetitions;
  const expectedTargetEventsPerDirection = (spawned.iterations + 1) * spawned.repetitions;
  same(expectedPairs, 10000, 'expected generated call/return pairs');
  same(spawned.internalCallEvents, expectedPairs, 'generated internal call count');
  same(spawned.internalReturnEvents, expectedPairs, 'generated internal return count');
  same(spawned.orderedInternalCallReturnPairs, expectedPairs, 'ordered generated call/return pair count');
  same(spawned.internalSequenceErrors, 0, 'generated call/return sequence errors');
  same(spawned.targetCalls, expectedTargetEventsPerDirection, 'trace target call count');
  same(spawned.targetReturns, expectedTargetEventsPerDirection, 'trace target return count');

  const summaries = spawned.batchSummaries;
  insist(Array.isArray(summaries), 'batchSummaries array is missing');
  same(spawned.batchCount, summaries.length, 'batch count matches summaries');
  insist(summaries.length >= 2, 'Stalker did not produce multiple batches');
  let parsedEventTotal = 0;
  let summarizedCalls = 0;
  let summarizedReturns = 0;
  summaries.forEach((batch, index) => {
    same(batch.index, index + 1, `batch ${index + 1} sequence index`);
    const parsedCount = integer(batch.parsedEventCount, `batch ${index + 1} parsed event count`, { min: 1 });
    const rawByteLength = integer(batch.rawByteLength, `batch ${index + 1} raw byte length`, { min: 1 });
    same(rawByteLength, parsedCount * 16, `batch ${index + 1} raw event byte accounting`);
    parsedEventTotal += parsedCount;
    summarizedCalls += integer(batch.targetCalls, `batch ${index + 1} target calls`);
    summarizedReturns += integer(batch.targetReturns, `batch ${index + 1} target returns`);
  });
  same(spawned.parsedEventTotal, parsedEventTotal, 'parsed event total matches batches');
  same(summarizedCalls, spawned.targetCalls, 'summarized target calls');
  same(summarizedReturns, spawned.targetReturns, 'summarized target returns');
  insist(parsedEventTotal <= 60000, `parsed event total exceeded agent cap: ${parsedEventTotal}`);
  insist(summaries.length <= 256, `batch count exceeded agent cap: ${summaries.length}`);

  const stopped = spawned.stoppedPayload;
  insist(stopped && typeof stopped === 'object', 'Stalker stopped payload is missing');
  same(stopped.kind, 'stopped', 'Stalker stopped payload kind');
  same(stopped.batchCount, summaries.length, 'stopped payload batch count');
  same(stopped.totalEvents, parsedEventTotal, 'stopped payload event total');
  insist(integer(stopped.quietPolls, 'stopped quiet polls') >= 20, 'Stalker stream did not satisfy its quiet-poll settle window');
  const settleMs = integer(stopped.elapsedMs, 'Stalker settle elapsed milliseconds');
  insist(settleMs >= 2000 && settleMs <= 15000, `Stalker settle elapsed time outside 2000..15000 ms: ${settleMs}`);

  const codeBase = Number.parseInt(spawned.codeBase, 16);
  insist(Number.isSafeInteger(codeBase), `invalid generated code base: ${spawned.codeBase}`);
  const expectedCall = { type: 'call', source: codeBase + 5, destination: codeBase + 19 };
  const expectedReturn = { type: 'ret', source: codeBase + 19, destination: codeBase + 10 };
  const firstEvents = spawned.firstEvents;
  const lastEvents = spawned.lastEvents;
  insist(Array.isArray(firstEvents) && Array.isArray(lastEvents), 'event samples are missing');
  const firstCallIndex = firstEvents.findIndex((event) => eventMatches(event, expectedCall));
  const firstReturnIndex = firstEvents.findIndex((event, index) => index > firstCallIndex && eventMatches(event, expectedReturn));
  insist(firstCallIndex >= 0 && firstReturnIndex > firstCallIndex, 'initial event sample lacks an ordered generated call/return pair');
  insist(lastEvents.some((event) => eventMatches(event, expectedCall)), 'final event sample lacks a generated call');
  insist(lastEvents.some((event) => eventMatches(event, expectedReturn)), 'final event sample lacks a generated return');

  const toolchain = {
    frida: raw.fridaVersion,
    fridaTools: raw.fridaToolsVersion,
    python: String(raw.python).split(' ')[0],
    fixtureSha256: hashes.fixtureSha256,
    fixtureSourceSha256: hashes.fixtureSourceSha256,
    observerPythonSha256: hashes.observerSha256,
    runnerPowerShellSha256: hashes.runnerSha256,
    compilerSha256: hashes.compilerSha256,
    compilerIdentity: compilerRelativeDescription,
  };
  insist(typeof toolchain.frida === 'string' && toolchain.frida.length > 0, 'Frida version is missing');
  insist(typeof toolchain.fridaTools === 'string' && toolchain.fridaTools.length > 0, 'frida-tools version is missing');

  const evidence = {
    schemaVersion: 1,
    status: 'passed-fixture-only',
    capturedAtUtc: raw.capturedAtUtc,
    scope: {
      processArchitecture: raw.fixtureMachine,
      spawnedProcessArchitecture: spawned.arch,
      generatedCodeSizeBytes: spawned.codeSize,
      iterationsPerInvocation: spawned.iterations,
      invocations: spawned.repetitions,
      expectedInternalCallReturnPairs: expectedPairs,
      notAnAaronOracleRun: true,
    },
    toolchain,
    result: {
      plainControlResult: plain.result,
      plainControlExitCode: plain.exitCode,
      spawnedResult: spawned.result,
      spawnedExitCode: spawned.exitCode,
      workerExitConfirmed: spawned.workerExited,
      endMarker: spawned.end,
      lifecycle: spawned.lifecycle,
      batchCount: summaries.length,
      parsedEventTotal,
      targetCalls: spawned.targetCalls,
      targetReturns: spawned.targetReturns,
      internalCallEvents: spawned.internalCallEvents,
      internalReturnEvents: spawned.internalReturnEvents,
      orderedInternalCallReturnPairs: spawned.orderedInternalCallReturnPairs,
      internalSequenceErrors: spawned.internalSequenceErrors,
      stoppedQuietPolls: stopped.quietPolls,
      stoppedElapsedMs: stopped.elapsedMs,
      allAssertionsPassed: true,
    },
    assertions: raw.assertions,
    rawRunRecord: portable(rawRelative),
  };

  const evidencePath = absolute(evidenceRelative);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    status: 'passed',
    evidence: portable(evidenceRelative),
    rawRunRecord: portable(rawRelative),
    hashes,
    fixtureMachine: raw.fixtureMachine,
    spawnedArch: spawned.arch,
    batchCount: summaries.length,
    parsedEventTotal,
    targetCalls: spawned.targetCalls,
    targetReturns: spawned.targetReturns,
    internalCallReturnPairs: spawned.orderedInternalCallReturnPairs,
    internalSequenceErrors: spawned.internalSequenceErrors,
    lifecycleStages: spawned.lifecycle.length,
    allAssertionsPassed: true,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`FAIL: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
