#!/usr/bin/env node

// Offline, source-bound validator for one uninstrumented / Frida observer /
// uninstrumented AARON triplet. This program only reads archived files.
import { createHash } from 'node:crypto';
import {
  access, readFile, realpath,
} from 'node:fs/promises';
import { readFileSync as readFileSyncCompat } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { verifyLocalAaronTriplet } from './verify-local-aaron-triplet.mjs';
import { mapCapturedFunctions } from './map-native-code-to-pll.mjs';

const CONTEXT_SCHEMA = 'aaron-premium-pick-frida-capture-context-v1';
const REQUEST_SCHEMA = 'aaron-premium-callsite-pick-observer-request-v1';
const SOURCE_SCHEMA = 'aaron-premium-callsite-pick-observer-source-v1';
const REPORT_SCHEMA = 'aaron-premium-callsite-pick-observer-report-v1';
const METADATA_SCHEMA = 'premium-callsite-metadata-v1';
const RUNNER_MODE = 'writer-stream-seed-1234';
const PROBE_OUTPUT = 'aaron-premium-callsite-metadata-v1.txt';
const FRIDA_OUTPUT = 'aaron-premium-pick-frida-observer-v1.txt';
const SCENE_OUTPUT = 'aaron-scene-state-snapshot.txt';
const REQUIRED_LIFECYCLE = [
  'requestValidated', 'sourceBindingVerified', 'sourceFilesVerified',
  'attached', 'agentIdentityVerified', 'scriptLoaded', 'agentArmed',
  'hookInstalled', 'controllerReadyWritten', 'stopRequested',
  'snapshotReceived', 'interceptorDetached', 'scriptUnloaded',
  'sessionDetached', 'sceneComplete', 'aa0Complete', 'callbacksDrained',
  'endWritten',
];
const REQUIRED_HASHES = [
  'requestSha256', 'driverSha256', 'agentSourceSha256', 'readyRecordSha256',
  'sourceEvidenceSha256', 'runtimeSha256', 'premiumPayloadSha256',
  'pickPayloadSha256', 'controllerSha256', 'sceneSha256', 'aa0Sha256',
];
const FILE_RECORDS = [
  'fridaRequest', 'fridaReport', 'readyMetadata', 'sourceEvidence',
  'reaCensus', 'probeSource', 'pythonDriver', 'controller', 'pll',
  'nativeCaptureManifest', 'nativeMapReport', 'runner',
];
const REQUIRED_CONTEXT_KEYS = [
  'schema', 'tripletId', 'observer', 'runner', 'files', 'process', 'mapping',
  'observerResult', 'sourceBindingSha256',
];

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys, label, optional = []) {
  requireValue(isObject(value), `${label} must be an object`);
  const allowed = new Set([...keys, ...optional]);
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  requireValue(missing.length === 0 && extra.length === 0,
    `${label} fields differ from schema; missing=${missing.join(',')} extra=${extra.join(',')}`);
}

function requireSha(value, label) {
  requireValue(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
    `${label} must be lowercase SHA-256 hex`);
  return value;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sortedJson(value) {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (isObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedJson(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(sortedJson(value));
}

function normalizeWinPath(value, label) {
  requireValue(typeof value === 'string' && value.length > 0 && !value.includes('\0'),
    `${label} must be a nonempty Windows path`);
  const normalized = path.win32.normalize(value.replaceAll('/', '\\'));
  requireValue(path.win32.isAbsolute(normalized) && /^[a-z]:\\/i.test(normalized),
    `${label} must be an absolute drive-qualified Windows path`);
  return normalized.toLowerCase();
}

function requireUnderCtemp(value, label) {
  const normalized = normalizeWinPath(value, label);
  requireValue(normalized === 'c:\\temp' || normalized.startsWith('c:\\temp\\'),
    `${label} must be under C:\\temp`);
  return normalized;
}

function parseAddress(value, label) {
  requireValue(typeof value === 'string' && /^0x[0-9a-f]{1,8}$/i.test(value),
    `${label} must be a 32-bit hexadecimal address`);
  const number = Number.parseInt(value.slice(2), 16);
  requireValue(Number.isSafeInteger(number) && number > 0 && number <= 0xffff_ffff,
    `${label} is outside IA-32 address space`);
  return number;
}

function hexAddress(value) {
  return `0x${value.toString(16).padStart(8, '0')}`;
}

async function readBytes(file, label) {
  try {
    await access(file);
    return await readFile(file);
  } catch (error) {
    throw new Error(`${label} is unavailable: ${file} (${error.message})`);
  }
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${error.message}`);
  }
}

function assertNoDuplicateJsonKeys(text, label) {
  let index = 0;
  const whitespace = () => { while (/\s/.test(text[index] ?? '')) index++; };
  const parseString = () => {
    requireValue(text[index] === '"', `${label} has invalid JSON string`);
    const start = index++;
    let escaped = false;
    while (index < text.length) {
      const char = text[index++];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '"') return JSON.parse(text.slice(start, index));
    }
    throw new Error(`${label} has an unterminated JSON string`);
  };
  const parseValue = (depth) => {
    requireValue(depth <= 256, `${label} JSON nesting exceeds the validation limit`);
    whitespace();
    const token = text[index];
    if (token === '"') { parseString(); return; }
    if (token === '{') {
      index++;
      whitespace();
      const keys = new Set();
      if (text[index] === '}') { index++; return; }
      while (index < text.length) {
        whitespace();
        const key = parseString();
        requireValue(!keys.has(key), `${label} contains duplicate JSON key ${JSON.stringify(key)}`);
        keys.add(key);
        whitespace();
        requireValue(text[index++] === ':', `${label} has invalid JSON object syntax`);
        parseValue(depth + 1);
        whitespace();
        const delimiter = text[index++];
        if (delimiter === '}') return;
        requireValue(delimiter === ',', `${label} has invalid JSON object delimiter`);
      }
      throw new Error(`${label} has an unterminated JSON object`);
    }
    if (token === '[') {
      index++;
      whitespace();
      if (text[index] === ']') { index++; return; }
      while (index < text.length) {
        parseValue(depth + 1);
        whitespace();
        const delimiter = text[index++];
        if (delimiter === ']') return;
        requireValue(delimiter === ',', `${label} has invalid JSON array delimiter`);
      }
      throw new Error(`${label} has an unterminated JSON array`);
    }
    const remaining = text.slice(index);
    const literal = /^(?:true|false|null)/.exec(remaining);
    if (literal) { index += literal[0].length; return; }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(remaining);
    requireValue(number, `${label} has invalid JSON value`);
    index += number[0].length;
  };
  parseValue(0);
  whitespace();
  requireValue(index === text.length, `${label} has trailing JSON content`);
}

async function readJson(file, label) {
  const bytes = await readBytes(file, label);
  let value;
  try {
    const text = decodeUtf8(bytes, label).replace(/^\uFEFF/, '');
    assertNoDuplicateJsonKeys(text, label);
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
  requireValue(isObject(value), `${label} root must be an object`);
  return { value, bytes };
}

async function verifyFileRecord(record, label, { allowSizeOmission = false } = {}) {
  requireValue(isObject(record), `${label} must be a file record`);
  requireValue(typeof record.path === 'string' && path.isAbsolute(record.path),
    `${label}.path must be absolute`);
  const expectedSha = requireSha(record.sha256, `${label}.sha256`);
  const bytes = await readBytes(record.path, label);
  requireValue(sha256(bytes) === expectedSha, `${label} bytes differ from its recorded SHA-256`);
  if (record.bytes == null && allowSizeOmission) {
    return { path: path.resolve(record.path), bytes, sha256: expectedSha };
  }
  requireValue(Number.isSafeInteger(record.bytes) && record.bytes >= 0 && record.bytes === bytes.length,
    `${label}.bytes differs from the archived file size`);
  return { path: path.resolve(record.path), bytes, sha256: expectedSha };
}

function requireSamePath(actual, expected, label) {
  requireValue(normalizeWinPath(actual, label) === normalizeWinPath(expected, `${label} expected`),
    `${label} differs from its source-bound path`);
}

function parseJsonLines(text, label) {
  try {
    assertNoDuplicateJsonKeys(text, label);
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} contains invalid JSON: ${error.message}`);
  }
}

function verifyMetadata(metadataBytes, readyBytes, label) {
  requireValue(readyBytes.length > 0 && metadataBytes.length > readyBytes.length,
    `${label} is empty or has no post-READY completion tail`);
  requireValue(metadataBytes.subarray(0, readyBytes.length).equals(readyBytes),
    `${label} does not begin with the immutable READY-prefix bytes`);
  const readyText = decodeUtf8(readyBytes, `${label} READY prefix`);
  const fullTextRaw = decodeUtf8(metadataBytes, label);
  const text = fullTextRaw.replace(/\r\n/g, '\n');
  requireValue(!text.includes('\r'), `${label} contains unsupported carriage returns`);
  requireValue(text.endsWith('\n'), `${label} must end with a line terminator`);
  const lines = text.slice(0, -1).split('\n');
  const markerLines = [
    'READY premium-callsite-metadata-v1',
    'CAPTURE-WAIT released=T',
    'COMPLETE execution=finished',
    'END premium-callsite-metadata-v1',
  ];
  let previous = -1;
  for (const marker of markerLines) {
    const hits = [];
    lines.forEach((line, index) => { if (line === marker) hits.push(index); });
    requireValue(hits.length === 1 && hits[0] > previous,
      `${label} must contain one ordered ${marker} record`);
    previous = hits[0];
  }
  requireValue(previous === lines.length - 1, `${label} END must be the terminal record`);
  requireValue(lines[0] === `BEGIN ${METADATA_SCHEMA}` &&
    lines.includes('INSTALL target=SELECT-SUBJECT+PICK mode=READ-ONLY-METADATA'),
  `${label} has the wrong metadata header or install record`);
  requireValue(lines.includes('METHOD-COUNT total=2 emitted=2 limit=64 status=:COMPLETE truncated=NIL') &&
    lines.includes('ENUMERATION-STATUS :COMPLETE') && lines.includes('ERROR-COUNT 0') &&
    lines.includes('TRUNCATION-COUNT 0'), `${label} does not certify complete zero-error CLOS enumeration`);

  const specializers = lines.flatMap((line) => {
    const match = /^SPECIALIZERS index=(\d+) values=\(\(:EQL \(:SYMBOL "COMMON-GRAPHICS-USER" "(FREE|PREMIUM)"\)\)\)$/.exec(line);
    return match ? [{ index: Number(match[1]), kind: match[2] }] : [];
  });
  const free = specializers.filter((entry) => entry.kind === 'FREE');
  const premium = specializers.filter((entry) => entry.kind === 'PREMIUM');
  requireValue(free.length === 1 && premium.length === 1 && free[0].index !== premium[0].index &&
    free[0].index === 0 && premium[0].index === 1,
  `${label} must identify method 0 as FREE and method 1 as PREMIUM`);

  const headers = new Map();
  for (const line of lines) {
    const match = /^HEADER name="(SELECT-SUBJECT-METHOD-\d+|PICK)" bytes=([0-9a-fA-F]{128})$/.exec(line);
    if (!match) continue;
    requireValue(!headers.has(match[1]), `${label} duplicates header ${match[1]}`);
    headers.set(match[1], match[2].toLowerCase());
  }
  const expectedNames = ['SELECT-SUBJECT-METHOD-0', 'SELECT-SUBJECT-METHOD-1', 'PICK'];
  requireValue(headers.size === expectedNames.length && expectedNames.every((name) => headers.has(name)),
    `${label} must contain exactly the two method headers and one PICK header`);
  for (const index of [0, 1]) {
    requireValue(lines.includes(`METHOD index=${index} type=STANDARD-METHOD`) &&
      lines.includes(`FUNCTION name="SELECT-SUBJECT-METHOD-${index}" type=COMPILED-FUNCTION`),
    `${label} lacks compiled STANDARD-METHOD ${index}`);
  }
  requireValue(lines.includes('FUNCTION name="PICK" type=COMPILED-FUNCTION'),
    `${label} lacks the compiled PICK function`);

  const readyTextNormalized = readyText.replace(/\r\n/g, '\n');
  requireValue(!readyTextNormalized.includes('\r') && readyTextNormalized.endsWith('\n') &&
    readyTextNormalized.endsWith('READY premium-callsite-metadata-v1\n') &&
    !readyTextNormalized.includes('CAPTURE-WAIT released=T') &&
    !readyTextNormalized.includes('COMPLETE execution=finished') &&
    !readyTextNormalized.includes('END premium-callsite-metadata-v1'),
  `${label} READY prefix is not a bounded pre-release snapshot`);
  return { headers, readyText: readyTextNormalized, text, lines, freeIndex: free[0].index, premiumIndex: premium[0].index };
}

function verifyContextShape(context) {
  exactKeys(context, REQUIRED_CONTEXT_KEYS, 'capture context');
  requireValue(context.schema === CONTEXT_SCHEMA, 'unsupported capture-context schema');
  requireValue(typeof context.tripletId === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(context.tripletId),
    'capture context has an invalid tripletId');
  exactKeys(context.observer, ['runId', 'root'], 'context.observer');
  requireValue(typeof context.observer.runId === 'string' && context.observer.runId.endsWith('-observer'),
    'context observer runId is invalid');
  requireValue(context.observer.runId === `${context.tripletId}-observer`,
    'context observer runId does not match tripletId');
  exactKeys(context.runner, [
    'mode', 'smallImage', 'runnerSha256', 'installerSha256', 'registryPatchSha256',
    'licensePatchSha256', 'requiredProbeOutputName', 'requiredProbeEndMarker',
  ], 'context.runner');
  requireValue(context.runner.mode === RUNNER_MODE && context.runner.smallImage === false,
    `observer must use ${RUNNER_MODE} without SmallImage`);
  for (const key of ['runnerSha256', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
    requireSha(context.runner[key], `context.runner.${key}`);
  }
  requireValue(context.runner.requiredProbeOutputName === FRIDA_OUTPUT &&
    context.runner.requiredProbeEndMarker === `END frida-observer-${context.observer.runId}`,
  'context runner does not require the run-specific Frida report END marker');
  exactKeys(context.process, ['pid', 'startTimeUtc', 'executablePath'], 'context.process');
  requireValue(Number.isSafeInteger(context.process.pid) && context.process.pid > 0 &&
    typeof context.process.startTimeUtc === 'string' && Number.isFinite(Date.parse(context.process.startTimeUtc)),
  'context process PID/start time is invalid');
  normalizeWinPath(context.process.executablePath, 'context.process.executablePath');
  exactKeys(context.mapping, [
    'premiumEntry', 'premiumPayloadSha256', 'pickEntry', 'pickPayloadSha256',
    'callsiteOffset', 'callsiteAddress', 'callsiteBytes', 'returnContinuation',
  ], 'context.mapping');
  for (const key of ['premiumPayloadSha256', 'pickPayloadSha256']) requireSha(context.mapping[key], `context.mapping.${key}`);
  requireValue(context.mapping.callsiteOffset === 200 && context.mapping.callsiteBytes === 'ff5727',
    'context mapping must identify the validated PREMIUM FF 57 27 callsite at offset 200');
  parseAddress(context.mapping.premiumEntry, 'context.mapping.premiumEntry');
  parseAddress(context.mapping.pickEntry, 'context.mapping.pickEntry');
  parseAddress(context.mapping.callsiteAddress, 'context.mapping.callsiteAddress');
  parseAddress(context.mapping.returnContinuation, 'context.mapping.returnContinuation');
  exactKeys(context.files, [
    ...FILE_RECORDS, 'runtimeExecutable', 'agentSource',
  ], 'context.files');
  for (const key of FILE_RECORDS) {
    const record = context.files[key];
    exactKeys(record, ['path', 'sha256'], `${key} file record`, ['bytes']);
    requireSha(record.sha256, `context.files.${key}.sha256`);
    requireValue(typeof record.path === 'string' && path.isAbsolute(record.path),
      `context.files.${key}.path must be absolute`);
  }
  for (const key of ['fridaRequest', 'readyMetadata', 'sourceEvidence']) {
    requireUnderCtemp(context.files[key].path, `context.files.${key}.path`);
  }
  exactKeys(context.files.runtimeExecutable, ['path', 'sha256', 'bytes', 'lexicalPath'],
    'context.files.runtimeExecutable');
  requireSha(context.files.runtimeExecutable.sha256, 'context.files.runtimeExecutable.sha256');
  requireValue(Number.isSafeInteger(context.files.runtimeExecutable.bytes) && context.files.runtimeExecutable.bytes > 0,
    'context.files.runtimeExecutable.bytes is invalid');
  normalizeWinPath(context.files.runtimeExecutable.path, 'context.files.runtimeExecutable.path');
  normalizeWinPath(context.files.runtimeExecutable.lexicalPath, 'context.files.runtimeExecutable.lexicalPath');
  exactKeys(context.files.agentSource, ['sha256'], 'context.files.agentSource');
  requireSha(context.files.agentSource.sha256, 'context.files.agentSource.sha256');
  requireValue(context.files.runner.sha256 === context.runner.runnerSha256,
    'context runner file hash differs from its runner configuration hash');
  requireValue(normalizeWinPath(context.files.runtimeExecutable.path, 'context runtime executable path') ===
    normalizeWinPath(context.process.executablePath, 'context process executable path'),
  'context process executable path differs from captured runtime executable');
  requireSha(context.sourceBindingSha256, 'context.sourceBindingSha256');
  exactKeys(context.observerResult, ['status', 'matchedEntries', 'matchedRecords'], 'context.observerResult');
  requireValue(['complete', 'no-hit'].includes(context.observerResult.status) &&
    Number.isSafeInteger(context.observerResult.matchedEntries) &&
    Number.isSafeInteger(context.observerResult.matchedRecords), 'context observerResult is invalid');
}

async function verifyContextFiles(context, observerCapture) {
  const records = {};
  for (const name of FILE_RECORDS) records[name] = await verifyFileRecord(context.files[name], `context.files.${name}`);
  const runtime = await verifyFileRecord(context.files.runtimeExecutable,
    'context.files.runtimeExecutable');
  requireValue(records.pll.sha256 === sha256(await readBytes(context.files.pll.path, 'context PLL')),
    'context PLL hash differs');
  requireValue(runtime.sha256 === context.files.runtimeExecutable.sha256 &&
    runtime.bytes.length === context.files.runtimeExecutable.bytes,
  'context runtime executable record is inconsistent');
  const stagedProbePath = path.join(observerCapture, 'aaron-pre-scene-probe.cl');
  const stagedProbeBytes = await readBytes(stagedProbePath, 'archived staged probe source');
  requireValue(sha256(stagedProbeBytes) === records.probeSource.sha256,
    'archived probe source differs from its source record');
  const stagedMetadataPath = path.join(observerCapture, PROBE_OUTPUT);
  const metadataBytes = await readBytes(stagedMetadataPath, 'archived Lisp metadata');
  requireValue(records.readyMetadata.bytes.length > 0,
    'READY metadata snapshot is unavailable');
  return { records, runtime, stagedProbeBytes, metadataBytes, stagedMetadataPath };
}

async function verifySummaries(beforeRoot, observerRoot, afterRoot, context, observerReportHash) {
  const roots = [beforeRoot, observerRoot, afterRoot];
  const labels = ['before', 'observer', 'after'];
  const runs = [];
  for (let i = 0; i < roots.length; i++) {
    const summaryFile = path.join(roots[i], 'summary.json');
    const { value: summary } = await readJson(summaryFile, `${labels[i]} runner summary`);
    requireValue(summary.complete === true && summary.probeCompletionSatisfied === true,
      `${labels[i]} runner summary is incomplete`);
    requireValue(summary.mode === RUNNER_MODE && summary.smallImage === false,
      `${labels[i]} is not a full-size ${RUNNER_MODE} run`);
    for (const key of ['runnerSha256', 'installerSha256', 'registryPatchSha256', 'licensePatchSha256']) {
      requireValue(summary[key] === context.runner[key], `${labels[i]} ${key} differs from observer source binding`);
    }
    if (i !== 1) {
      requireValue(summary.preSceneProbeSha256 == null &&
        (summary.requiredProbeOutputName == null || summary.requiredProbeOutputName === '') &&
        summary.requiredProbeOutputSha256 == null &&
        (summary.requiredProbeEndMarker == null || summary.requiredProbeEndMarker === '') &&
        Array.isArray(summary.probeOutputNames) && summary.probeOutputNames.length === 0 &&
        summary.preSceneProbePauseSeconds === 0,
      `${labels[i]} control is instrumented or declares probe output`);
    } else {
      requireValue(summary.runId === context.observer.runId, 'observer summary runId differs from capture context');
      requireValue(summary.preSceneProbeSha256 === context.files.probeSource.sha256 &&
        summary.requiredProbeOutputName === context.runner.requiredProbeOutputName &&
        summary.requiredProbeEndMarker === context.runner.requiredProbeEndMarker &&
        summary.requiredProbeOutputSha256 === observerReportHash,
      'observer summary does not bind the exact probe source/report/hash/END marker');
      const expectedNames = [PROBE_OUTPUT, FRIDA_OUTPUT];
      requireValue(Array.isArray(summary.probeOutputNames) && summary.probeOutputNames.length === 2 &&
        expectedNames.every((name) => summary.probeOutputNames.includes(name)) &&
        Number.isSafeInteger(summary.preSceneProbePauseSeconds) &&
        summary.preSceneProbePauseSeconds >= 90 && summary.preSceneProbePauseSeconds <= 300,
      'observer summary output manifest differs from the two required probe reports');
    }
    const timestamps = [Date.parse(summary.startedAt), Date.parse(summary.finishedAt)];
    requireValue(timestamps.every(Number.isFinite) && timestamps[0] <= timestamps[1],
      `${labels[i]} summary timestamps are invalid`);
    for (const name of ['AARON.exe', 'AARON.pll']) {
      const runtimeFile = path.join(roots[i], 'runtime', name);
      const bytes = await readBytes(runtimeFile, `${labels[i]} runtime ${name}`);
      const record = name === 'AARON.exe' ? context.files.runtimeExecutable : context.files.pll;
      requireValue(sha256(bytes) === record.sha256,
        `${labels[i]} runtime ${name} differs from the observer source binding`);
    }
    runs.push({ summary, timestamps, root: roots[i] });
  }
  requireValue(runs[0].summary.runId !== runs[1].summary.runId &&
    runs[1].summary.runId !== runs[2].summary.runId &&
    runs[0].summary.runId !== runs[2].summary.runId,
  'before, observer, and after run IDs must be distinct');
  requireValue(runs[0].timestamps[1] <= runs[1].timestamps[0] &&
    runs[1].timestamps[1] <= runs[2].timestamps[0],
  'before, observer, and after must be serialized in chronological order');
  return runs;
}

function reconstructAgentSourceHash(driverBytes, request) {
  const driverText = decodeUtf8(driverBytes, 'Python observer source').replace(/\r\n/g, '\n');
  const match = /AGENT_TEMPLATE\s*=\s*r"""([\s\S]*?)"""\n\n\nREQUEST_FIELDS/.exec(driverText);
  requireValue(match, 'Python observer source does not expose the expected embedded agent template');
  const cfg = {
    readyPid: request.readyPid,
    runtimePath: request.runtimePath,
    premiumReturnContinuation: request.premiumReturnContinuation,
    pickEntry: request.pickEntry,
    maxRecords: request.maxRecords,
  };
  const values = Object.values(cfg);
  requireValue(values.every((value) => typeof value !== 'string' || /^[\x00-\x7f]*$/.test(value)),
    'embedded agent config contains non-ASCII text that requires Python-specific JSON escaping');
  const compactConfig = JSON.stringify(cfg);
  const count = match[1].split('__CONFIG_JSON__').length - 1;
  requireValue(count === 1, 'embedded agent template must contain exactly one config placeholder');
  const source = match[1].replace('__CONFIG_JSON__', compactConfig);
  return sha256(Buffer.from(source, 'utf8'));
}

async function verifyControllerReady(request, context, fileRecords) {
  const { value: acknowledgement } = await readJson(request.controllerReadyPath, 'Frida controller-ready acknowledgement');
  requireValue(acknowledgement.schema === 'aaron-premium-callsite-pick-observer-controller-ready-v1' &&
    acknowledgement.runId === context.observer.runId && acknowledgement.ready === true &&
    acknowledgement.pid === context.process.pid && acknowledgement.hostWillNotReleaseAARON === true &&
    acknowledgement.requestSha256 === fileRecords.fridaRequest.sha256 &&
    acknowledgement.sourceBindingSha256 === context.sourceBindingSha256,
  'controller-ready acknowledgement does not bind the request, READY process, and source binding');
  requireValue(acknowledgement.agentSourceSha256 === context.files.agentSource.sha256 &&
    acknowledgement.identity?.arch === 'ia32' && acknowledgement.identity?.pointerSize === 4 &&
    acknowledgement.identity?.pid === context.process.pid,
  'controller-ready acknowledgement has the wrong generated agent or process identity');
  requireSamePath(acknowledgement.identity.mainModulePath, context.process.executablePath,
    'controller-ready main-module path');
  verifyRuntimeModuleIdentity(acknowledgement.identity, context, 'controller-ready identity');
  for (const [field, expected] of [
    ['premiumCallsite', context.mapping.callsiteAddress],
    ['premiumReturnContinuation', context.mapping.returnContinuation],
    ['pickEntry', context.mapping.pickEntry],
  ]) requireValue(parseAddress(acknowledgement.addresses?.[field], `controller-ready ${field}`) ===
    parseAddress(expected, `context ${field}`), `controller-ready ${field} differs from source mapping`);
  return acknowledgement.identity;
}

function verifyRuntimeModuleIdentity(identity, context, label) {
  exactKeys(identity, [
    'kind', 'pid', 'arch', 'pointerSize', 'mainModulePath', 'pickEntry',
    'expectedReturn', 'mappedCodeRanges',
  ], `${label} identity`);
  requireValue(identity.kind === 'armed' && identity.pid === context.process.pid &&
    identity.arch === 'ia32' && identity.pointerSize === 4,
  `${label} does not identify the source-bound IA-32 process`);
  requireSamePath(identity.mainModulePath, context.process.executablePath,
    `${label} main-module path`);
  requireValue(parseAddress(identity.pickEntry, `${label}.pickEntry`) ===
    parseAddress(context.mapping.pickEntry, 'context PICK entry') &&
    parseAddress(identity.expectedReturn, `${label}.expectedReturn`) ===
    parseAddress(context.mapping.returnContinuation, 'context return continuation'),
  `${label} dynamic hook targets differ from the source mapping`);

  exactKeys(identity.mappedCodeRanges, ['pickEntry', 'premiumReturnContinuation'],
    `${label}.mappedCodeRanges`);
  for (const [name, expectedValue] of [
    ['pickEntry', context.mapping.pickEntry],
    ['premiumReturnContinuation', context.mapping.returnContinuation],
  ]) {
    const range = identity.mappedCodeRanges[name];
    exactKeys(range, ['base', 'size', 'protection'], `${label}.mappedCodeRanges.${name}`);
    const base = parseAddress(range.base, `${label}.mappedCodeRanges.${name}.base`);
    requireValue(Number.isSafeInteger(range.size) && range.size > 0 &&
      base + range.size <= 0x1_0000_0000 &&
      typeof range.protection === 'string' && /^r[w-][x-]$/.test(range.protection),
    `${label} ${name} range is not a valid readable IA-32 code range`);
    const end = base + range.size;
    const address = parseAddress(expectedValue, `${label} expected ${name}`);
    requireValue(address >= base && address < end,
      `${label} ${name} lies outside its captured mapped range`);
  }
}

function verifyObserverRequest(request, context, fileRecords) {
  const requestKeys = [
    'schema', 'runId', 'readyPid', 'runtimePath', 'premiumCallsite',
    'premiumReturnContinuation', 'pickEntry', 'scenePath', 'aa0Path',
    'sceneEndMarker', 'outputRoot', 'outputPath', 'controllerReadyPath',
    'statusPath', 'stopPath', 'endMarker', 'sourceBinding', 'timeoutSeconds',
    'maxRecords', 'pollIntervalMs',
  ];
  exactKeys(request, requestKeys, 'Frida request');
  requireValue(request.schema === REQUEST_SCHEMA && request.runId === context.observer.runId &&
    request.endMarker === context.runner.requiredProbeEndMarker,
  'Frida request schema/runId/END marker differs from capture context');
  for (const [field, expected] of [
    ['premiumCallsite', context.mapping.callsiteAddress],
    ['premiumReturnContinuation', context.mapping.returnContinuation],
    ['pickEntry', context.mapping.pickEntry],
  ]) requireValue(parseAddress(request[field], `request.${field}`) === parseAddress(expected, `context.${field}`),
    `Frida request ${field} differs from native mapping`);
  requireValue(request.readyPid === context.process.pid, 'Frida request PID differs from READY process');
  requireSamePath(request.runtimePath, context.process.executablePath, 'Frida request runtimePath');
  requireValue(request.sceneEndMarker === 'END scene-state-snapshot', 'Frida request scene marker is unexpected');
  requireSamePath(request.scenePath, 'C:\\temp\\aaron-scene-state-snapshot.txt', 'Frida request scenePath');
  requireSamePath(request.aa0Path, 'C:\\temp\\aa0', 'Frida request aa0Path');
  const outputRoot = requireUnderCtemp(request.outputRoot, 'Frida request outputRoot');
  const expectedOutputBasenames = {
    outputPath: 'observer.txt',
    controllerReadyPath: 'controller-ready.json',
    statusPath: 'status.json',
    stopPath: 'stop.request',
  };
  for (const key of Object.keys(expectedOutputBasenames)) {
    const candidate = requireUnderCtemp(request[key], `Frida request ${key}`);
    requireValue(candidate.startsWith(`${outputRoot}\\`), `Frida request ${key} escapes outputRoot`);
    requireValue(path.win32.basename(candidate) === expectedOutputBasenames[key],
      `Frida request ${key} has an unexpected basename`);
  }
  requireValue(Number.isSafeInteger(request.timeoutSeconds) && request.timeoutSeconds > 0 &&
    Number.isSafeInteger(request.maxRecords) && request.maxRecords > 0 && request.maxRecords <= 512 &&
    Number.isSafeInteger(request.pollIntervalMs) && request.pollIntervalMs > 0,
  'Frida request bounds are invalid');
  const bindingKeys = [
    'readyPid', 'readyRecordPath', 'readyRecordSha256', 'sourceEvidencePath',
    'sourceEvidenceSha256', 'runtimeSha256', 'premiumPayloadSha256',
    'pickPayloadSha256', 'controllerPath', 'controllerSha256',
  ];
  exactKeys(request.sourceBinding, bindingKeys, 'Frida request sourceBinding');
  requireValue(request.sourceBinding.readyPid === context.process.pid, 'sourceBinding READY PID differs');
  requireSamePath(request.sourceBinding.readyRecordPath, context.files.readyMetadata.path, 'sourceBinding READY path');
  requireSamePath(request.sourceBinding.sourceEvidencePath, context.files.sourceEvidence.path, 'sourceBinding evidence path');
  requireSamePath(request.sourceBinding.controllerPath, context.files.controller.path, 'sourceBinding controller path');
  const expectedBinding = {
    readyPid: context.process.pid,
    readyRecordPath: request.sourceBinding.readyRecordPath,
    readyRecordSha256: fileRecords.readyMetadata.sha256,
    sourceEvidencePath: request.sourceBinding.sourceEvidencePath,
    sourceEvidenceSha256: fileRecords.sourceEvidence.sha256,
    runtimeSha256: fileRecords.runtimeExecutableSha256,
    premiumPayloadSha256: context.mapping.premiumPayloadSha256,
    pickPayloadSha256: context.mapping.pickPayloadSha256,
    controllerPath: request.sourceBinding.controllerPath,
    controllerSha256: fileRecords.controller.sha256,
  };
  requireValue(canonicalJson(request.sourceBinding) === canonicalJson(expectedBinding),
    'Frida request sourceBinding differs from verified capture-context sources');
  requireValue(sha256(Buffer.from(canonicalJson(request.sourceBinding), 'utf8')) === context.sourceBindingSha256,
    'Frida request sourceBinding digest differs from capture-context');
  return request;
}

async function verifySourceEvidence(source, context, request, fileRecords) {
  const sourceKeys = [
    'schema', 'runId', 'tripletId', 'readyPid', 'runtimePath', 'runtimeSha256',
    'premiumEntry', 'premiumCallsite', 'premiumReturnContinuation', 'pickEntry',
    'callsiteOffset', 'callsiteBytes',
    'premiumPayloadSha256', 'pickPayloadSha256', 'scenePath', 'sceneName',
    'aa0Path', 'aa0Name', 'runtimeLexicalPath', 'pllSha256', 'pllPath', 'runnerSha256',
    'probeSha256', 'mapperSha256', 'reaCensusSha256', 'manifestSha256',
    'nativeCaptureManifestPath', 'nativeCaptureManifestSha256',
    'nativeMapReportPath', 'nativeMapSha256', 'processStartTimeUtc',
  ];
  exactKeys(source, sourceKeys, 'observer source-evidence');
  requireValue(source.schema === SOURCE_SCHEMA && source.runId === context.observer.runId &&
    source.tripletId === context.tripletId && source.readyPid === context.process.pid,
  'source-evidence identity differs from capture context');
  requireSamePath(source.runtimePath, context.process.executablePath, 'source-evidence runtimePath');
  requireSamePath(source.runtimeLexicalPath, context.files.runtimeExecutable.lexicalPath,
    'source-evidence runtimeLexicalPath');
  requireSamePath(source.pllPath, context.files.pll.path, 'source-evidence pllPath');
  requireSamePath(source.nativeCaptureManifestPath, context.files.nativeCaptureManifest.path,
    'source-evidence nativeCaptureManifestPath');
  requireSamePath(source.nativeMapReportPath, context.files.nativeMapReport.path,
    'source-evidence nativeMapReportPath');
  requireSamePath(source.scenePath, request.scenePath, 'source-evidence scenePath');
  requireSamePath(source.aa0Path, request.aa0Path, 'source-evidence aa0Path');
  requireValue(source.sceneName === 'aaron-scene-state-snapshot.txt' && source.aa0Name === 'aa0' &&
    source.processStartTimeUtc === context.process.startTimeUtc &&
    source.runtimeSha256 === fileRecords.runtimeExecutable.sha256 &&
    source.pllSha256 === fileRecords.pll.sha256 &&
    source.runnerSha256 === context.runner.runnerSha256 &&
    source.probeSha256 === fileRecords.probeSource.sha256 &&
    source.reaCensusSha256 === fileRecords.reaCensus.sha256 &&
    source.nativeCaptureManifestSha256 === fileRecords.nativeCaptureManifest.sha256 &&
    source.nativeMapSha256 === fileRecords.nativeMapReport.sha256,
  'source-evidence content hashes/process metadata differ from archived source records');
  for (const [key, expected] of [
    ['premiumEntry', context.mapping.premiumEntry],
    ['premiumCallsite', context.mapping.callsiteAddress],
    ['premiumReturnContinuation', context.mapping.returnContinuation],
    ['pickEntry', context.mapping.pickEntry],
    ['premiumPayloadSha256', context.mapping.premiumPayloadSha256],
    ['pickPayloadSha256', context.mapping.pickPayloadSha256],
  ]) requireValue(source[key] === expected, `source-evidence ${key} differs from mapping`);
  requireValue(source.callsiteOffset === context.mapping.callsiteOffset &&
    source.callsiteBytes === context.mapping.callsiteBytes,
  'source-evidence PREMIUM callsite displacement/bytes differ from the mapped instruction');
  const repoRoot = path.resolve(path.dirname(context.files.probeSource.path), '..', '..');
  const mapperPath = path.join(repoRoot, 'research', 'tools', 'map-native-code-to-pll.mjs');
  const manifestPath = path.join(repoRoot, 'research', 'extracted', 'aaron', 'manifest.json');
  requireValue(source.mapperSha256 === sha256(await readBytes(mapperPath, 'native mapper source')),
    'source-evidence mapper hash differs from the current mapper source');
  requireValue(source.manifestSha256 === sha256(await readBytes(manifestPath, 'extracted runtime manifest')),
    'source-evidence runtime manifest hash differs from the current extracted manifest');
}

function verifyCensus(census, context, pllSha256) {
  requireValue(census.schemaVersion === 1 &&
    census.status === 'validated-static-callsite-census-targets-unresolved' &&
    census.summary?.allInputsStaticOnlyAndNotExecuted === true,
  'REA census is not the validated static-only callsite census');
  const premium = (census.methods ?? []).filter((method) => method.method === 'SELECT-SUBJECT-METHOD-1' &&
    method.methodIndex === 1 && method.specializer?.kind === 'EQL' && method.specializer?.symbol === 'PREMIUM');
  requireValue(premium.length === 1, 'REA census has no unique PREMIUM method-1 record');
  const method = premium[0];
  requireValue(method.sourceBinding?.originalPll?.sha256 === pllSha256 &&
    method.sourceBinding?.originalPayload?.sha256 === context.mapping.premiumPayloadSha256 &&
    method.sourceBinding.originalPayload.bytes === 362,
  'REA PREMIUM census is not bound to the current PLL/PREMIUM payload');
  const calls = (method.calls ?? []).filter((call) => call.address === '0x1fe4c07c');
  requireValue(calls.length === 1 &&
    calls[0].instruction === '0x1fe4c07c: CALL dword ptr [EDI + 0x27]' &&
    calls[0].mechanism === 'computed' && calls[0].status === 'unresolved' &&
    Array.isArray(calls[0].targets) && calls[0].targets.length === 0,
  'REA census does not identify the exact unresolved PREMIUM indirect-call candidate');
  const staticEntry = parseAddress(method.entry, 'REA PREMIUM static entry');
  const staticCall = parseAddress(calls[0].address, 'REA PREMIUM static callsite');
  requireValue(staticCall - staticEntry === context.mapping.callsiteOffset,
    'REA callsite offset does not agree with the live mapped method entry');
  return { method, call: calls[0], staticEntry, staticCall };
}

async function verifyNativeMapping(context, fileRecords, metadata) {
  const manifestBytes = fileRecords.nativeCaptureManifest.bytes;
  const manifest = parseJsonLines(decodeUtf8(manifestBytes, 'native capture manifest'), 'native capture manifest');
  requireValue(manifest.schemaVersion === 1 && Array.isArray(manifest.functions),
    'native capture manifest schema is invalid');
  requireValue(manifest.processId === context.process.pid &&
    manifest.processStartTimeUtc === context.process.startTimeUtc &&
    manifest.metadataSha256 === fileRecords.readyMetadata.sha256,
  'native capture manifest is not bound to the READY process and prefix');
  requireSamePath(manifest.runtimeExecutable, context.files.runtimeExecutable.lexicalPath,
    'native manifest runtimeExecutable');
  requireSamePath(manifest.runtimeCanonicalPath, context.process.executablePath,
    'native manifest runtimeCanonicalPath');
  requireValue(manifest.functions.length === 3, 'native capture manifest must contain exactly three functions');
  const names = manifest.functions.map((fn) => fn.name).sort();
  requireValue(JSON.stringify(names) === JSON.stringify([
    'PICK', 'SELECT-SUBJECT-METHOD-0', 'SELECT-SUBJECT-METHOD-1',
  ].sort()), 'native capture manifest function names differ from metadata');
  for (const fn of manifest.functions) {
    requireValue(metadata.headers.get(fn.name) === fn.functionObjectHeaderHex.toLowerCase(),
      `native function header differs from READY metadata: ${fn.name}`);
    const header = Buffer.from(fn.functionObjectHeaderHex, 'hex');
    requireValue(header.length === 64 && header.readUInt32LE(18) === parseAddress(fn.entryCandidate,
      `${fn.name} manifest entry`), `native entry candidate differs from header: ${fn.name}`);
  }

  const pll = fileRecords.pll.bytes;
  const mapped = mapCapturedFunctions(manifest, (file) => {
    requireValue(typeof file === 'string' && path.basename(file) === file &&
      /^[a-z0-9-]+\.native-window\.bin$/.test(file), 'native function window filename is unsafe');
    return readFileSyncCompat(path.join(path.dirname(context.files.nativeCaptureManifest.path), file));
  }, pll);
  const computedMap = {
    ...mapped.report,
    captureManifestSha256: sha256(manifestBytes),
  };
  const persistedMapBytes = fileRecords.nativeMapReport.bytes;
  const persistedMap = parseJsonLines(decodeUtf8(persistedMapBytes, 'native map report'), 'native map report');
  requireValue(canonicalJson(persistedMap) === canonicalJson(computedMap),
    'persisted native map does not exactly match a fresh offline complete-object remap');
  for (const fn of mapped.report.functions) {
    const payloadName = fn.payloadFile;
    requireValue(path.basename(payloadName) === payloadName && /^[a-z0-9-]+\.native-payload\.bin$/.test(payloadName),
      'native payload filename is unsafe');
    const payloadBytes = await readBytes(path.join(path.dirname(context.files.nativeMapReport.path), payloadName),
      `${fn.name} mapped payload`);
    requireValue(payloadBytes.equals(mapped.payloads.get(fn.name)),
      `${fn.name} persisted mapped payload differs from recomputation`);
  }
  const premiumFunctions = mapped.report.functions.filter((fn) => fn.name === 'SELECT-SUBJECT-METHOD-1');
  const pickFunctions = mapped.report.functions.filter((fn) => fn.name === 'PICK');
  requireValue(premiumFunctions.length === 1 && pickFunctions.length === 1,
    'offline map does not have unique PREMIUM and PICK function mappings');
  const premium = premiumFunctions[0];
  const pick = pickFunctions[0];
  requireValue(premium.uniqueCompleteObjectByteMatch === true && pick.uniqueCompleteObjectByteMatch === true &&
    premium.payloadBytes === 362 && premium.payloadSha256 === context.mapping.premiumPayloadSha256 &&
    pick.payloadSha256 === context.mapping.pickPayloadSha256,
  'mapped PREMIUM/PICK payload does not match the complete source-bound payloads');
  const premiumEntry = parseAddress(premium.runtime.entry, 'mapped PREMIUM entry');
  const pickEntry = parseAddress(pick.runtime.entry, 'mapped PICK entry');
  requireValue(premiumEntry === parseAddress(context.mapping.premiumEntry, 'context PREMIUM entry') &&
    pickEntry === parseAddress(context.mapping.pickEntry, 'context PICK entry'),
  'context dynamic entries differ from the offline native mapping');
  const payload = mapped.payloads.get('SELECT-SUBJECT-METHOD-1');
  requireValue(payload.subarray(context.mapping.callsiteOffset, context.mapping.callsiteOffset + 3).toString('hex') === 'ff5727',
    'mapped PREMIUM payload bytes at offset 200 differ from FF 57 27');
  const callsite = premiumEntry + context.mapping.callsiteOffset;
  const continuation = callsite + 3;
  requireValue(callsite <= 0xffff_ffff && continuation <= 0xffff_ffff &&
    parseAddress(context.mapping.callsiteAddress, 'context callsite') === callsite &&
    parseAddress(context.mapping.returnContinuation, 'context return continuation') === continuation,
  'dynamic callsite/return continuation do not derive from mapped entry plus instruction length');
  return { manifest, mapped: mapped.report, premium, pick, premiumEntry, pickEntry, callsite, continuation };
}

function verifyObserverReport(text, reportHash, request, context, sourceEvidence, fileRecords, sceneBytes, aa0Bytes) {
  requireValue(!text.includes('\r') && text.endsWith('\n'), 'Frida report must use LF lines and end in one newline');
  const lines = text.slice(0, -1).split('\n');
  requireValue(lines.length >= 3 && lines[0] === `BEGIN ${REPORT_SCHEMA} ${context.observer.runId}` &&
    lines.at(-1) === context.runner.requiredProbeEndMarker,
  'Frida report envelope or terminal END does not match the run');
  requireValue(lines.filter((line) => line === context.runner.requiredProbeEndMarker).length === 1,
    'Frida report must contain exactly one terminal END');
  requireValue(lines[1].startsWith('REPORT '), 'Frida report summary line is missing');
  const report = parseJsonLines(lines[1].slice('REPORT '.length), 'Frida report summary');
  requireValue(report.schema === REPORT_SCHEMA && report.runId === context.observer.runId &&
    ['complete', 'no-hit'].includes(report.status), 'Frida report schema/runId/status is invalid');
  requireValue(report.pid === context.process.pid, 'Frida report PID differs from READY process');
  exactKeys(report.addresses, ['premiumCallsite', 'premiumReturnContinuation', 'pickEntry'], 'Frida report addresses');
  for (const [field, expected] of [
    ['premiumCallsite', context.mapping.callsiteAddress],
    ['premiumReturnContinuation', context.mapping.returnContinuation],
    ['pickEntry', context.mapping.pickEntry],
  ]) requireValue(parseAddress(report.addresses[field], `report.${field}`) === parseAddress(expected, `context.${field}`),
    `Frida report ${field} differs from the mapped target`);
  const identity = report.identity;
  requireValue(isObject(identity) && identity.pid === context.process.pid && identity.arch === 'ia32' &&
    identity.pointerSize === 4, 'Frida report lacks the source-bound IA-32 process identity');
  requireSamePath(identity.mainModulePath, context.process.executablePath, 'Frida report main-module path');
  verifyRuntimeModuleIdentity(identity, context, 'Frida report identity');

  const lifecycle = report.lifecycle;
  requireValue(isObject(lifecycle) && REQUIRED_LIFECYCLE.every((key) => lifecycle[key] === true),
    'Frida report does not prove successful attach, hook, snapshot, detach, drain, and END lifecycle');
  const counts = report.counts;
  requireValue(isObject(counts), 'Frida report counters are missing');
  for (const name of [
    'totalEntries', 'matchedEntries', 'unmatchedEntries', 'matchedReturns',
    'completedPairs', 'droppedMatchedRecords', 'inFlightMatched',
  ]) requireValue(Number.isSafeInteger(counts[name]) && counts[name] >= 0 && counts[name] <= 2_147_483_647,
    `Frida counter ${name} is invalid`);
  requireValue(counts.totalEntries === counts.matchedEntries + counts.unmatchedEntries &&
    counts.matchedEntries === counts.matchedReturns && counts.matchedEntries === counts.completedPairs &&
    counts.inFlightMatched === 0 && counts.droppedMatchedRecords === 0 && counts.counterOverflow === false &&
    report.limits?.counterOverflow === false,
  'Frida counters are incomplete, inconsistent, dropped, or overflowed');
  requireValue(report.agentErrorCount === 0 && Array.isArray(report.matchedRecords) &&
    report.matchedRecordCount === report.matchedRecords.length &&
    report.matchedRecords.length === counts.matchedEntries &&
    report.matchedRecords.length <= request.maxRecords,
  'Frida matched-record array/count/cap is inconsistent');
  requireValue(isObject(report.limits) && report.limits.maxRecords === request.maxRecords &&
    report.limits.maxMessageChars === 2048 && Number.isSafeInteger(report.limits.agentMessagesSeen) &&
    report.limits.agentMessagesSeen >= 0 && report.limits.agentMessagesSeen <= 32,
  'Frida report limits differ from the source-bound request');

  const matchLines = [];
  for (const line of lines.slice(2, -1)) {
    requireValue(line.startsWith('MATCH '), 'Frida report has an unexpected non-MATCH record');
    matchLines.push(parseJsonLines(line.slice('MATCH '.length), 'Frida MATCH record'));
  }
  requireValue(canonicalJson(matchLines) === canonicalJson(report.matchedRecords),
    'Frida MATCH lines differ from the report summary records');
  const pickEntry = parseAddress(context.mapping.pickEntry, 'mapped PICK entry');
  const continuation = parseAddress(context.mapping.returnContinuation, 'PREMIUM return continuation');
  report.matchedRecords.forEach((record, index) => {
    requireValue(isObject(record) && record.returned === true && record.sequence === index + 1 &&
      Number.isSafeInteger(record.threadId) && record.threadId > 0 &&
      Number.isSafeInteger(record.enteredAtUnixMs) && record.enteredAtUnixMs > 0,
    `Frida matched record ${index + 1} lacks a completed ordered pair/thread/time`);
    requireValue(parseAddress(record.entryAddress, `record ${index + 1} entryAddress`) === pickEntry &&
      parseAddress(record.returnAddress, `record ${index + 1} returnAddress`) === continuation,
    `Frida matched record ${index + 1} does not pair mapped PICK with PREMIUM return continuation`);
    requireValue(typeof record.returnValue === 'string' && /^0x[0-9a-f]{8}$/.test(record.returnValue),
      `Frida matched record ${index + 1} returnValue is not an IA-32 pointer`);
  });
  const statusFromCount = counts.matchedEntries > 0 ? 'complete' : 'no-hit';
  requireValue(report.status === statusFromCount, 'Frida report status differs from complete pair count');
  requireValue(report.captureScope === 'stable-scene-and-aa0-complete' &&
    report.stopReason === 'scene-and-aa0-complete' &&
    lifecycle.sceneComplete === true && lifecycle.aa0Complete === true,
  'observer must remain attached through the complete stable scene and AA0 for both hits and no-hits');

  requireValue(isObject(report.scene) && isObject(report.scene.scene) && isObject(report.scene.aa0) &&
    typeof report.scene.signature === 'string' && report.scene.signature.length > 0,
  'Frida report lacks stable scene/AA0 completion evidence');
  const sceneSummary = report.scene.scene;
  const aa0Summary = report.scene.aa0;
  requireSamePath(sceneSummary.path, request.scenePath, 'Frida scene path');
  requireSamePath(aa0Summary.path, request.aa0Path, 'Frida AA0 path');
  requireValue(sceneSummary.sha256 === sha256(sceneBytes) && aa0Summary.sha256 === sha256(aa0Bytes) &&
    report.hashes?.sceneSha256 === sceneSummary.sha256 && report.hashes?.aa0Sha256 === aa0Summary.sha256 &&
    sceneSummary.size === sceneBytes.length && aa0Summary.size === aa0Bytes.length &&
    sceneSummary.kind === 'scene' && sceneSummary.terminalLine === 'END scene-state-snapshot' &&
    aa0Summary.kind === 'aa0' && aa0Summary.terminalLine === 'end',
  'Frida report scene/AA0 hashes or sizes differ from the archived runner outputs');

  requireValue(isObject(report.sourceBinding) && canonicalJson(report.sourceBinding) === canonicalJson(request.sourceBinding) &&
    report.sourceBindingSha256 === sha256(Buffer.from(canonicalJson(request.sourceBinding), 'utf8')),
  'Frida report sourceBinding/hash differs from the exact request');
  const hashes = report.hashes;
  requireValue(isObject(hashes) && REQUIRED_HASHES.every((name) => /^[a-f0-9]{64}$/.test(hashes[name] ?? '')),
    'Frida report lacks required source/report hashes');
  const expectedHashes = {
    requestSha256: fileRecords.fridaRequest.sha256,
    driverSha256: fileRecords.pythonDriver.sha256,
    agentSourceSha256: context.files.agentSource.sha256,
    readyRecordSha256: fileRecords.readyMetadata.sha256,
    sourceEvidenceSha256: fileRecords.sourceEvidence.sha256,
    runtimeSha256: fileRecords.runtimeExecutable.sha256,
    premiumPayloadSha256: context.mapping.premiumPayloadSha256,
    pickPayloadSha256: context.mapping.pickPayloadSha256,
    controllerSha256: fileRecords.controller.sha256,
    sceneSha256: sha256(sceneBytes),
    aa0Sha256: sha256(aa0Bytes),
  };
  for (const key of REQUIRED_HASHES) requireValue(hashes[key] === expectedHashes[key],
    `Frida report ${key} differs from the archived source/output hash`);
  requireValue(reportHash === sha256(fileRecords.fridaReport.bytes),
    'Frida report archive hash differs from the context record');
  return report;
}

async function run(beforeArg, observerArg, afterArg, contextArg) {
  const roots = [beforeArg, observerArg, afterArg].map((value) => path.resolve(value));
  const resolvedRoots = await Promise.all(roots.map((value) => realpath(value)));
  requireValue(new Set(resolvedRoots).size === 3, 'triplet roots must be three distinct physical directories');
  const contextPath = path.resolve(contextArg);
  const expectedContextPath = path.join(roots[1], 'capture', 'capture-context.json');
  requireValue(contextPath === expectedContextPath,
    'capture-context.json must be the archived file at observer/capture/capture-context.json');
  const { value: context } = await readJson(contextPath, 'capture context');
  verifyContextShape(context);
  requireValue(normalizeWinPath(context.observer.root, 'context.observer.root') ===
    normalizeWinPath(roots[1], 'observer root argument'),
    'observer root differs from capture context');
  requireValue(context.observer.runId === path.win32.basename(normalizeWinPath(roots[1], 'observer root argument')),
    'observer runId must equal the source runner directory basename');
  const observerCapture = path.join(roots[1], 'capture');
  const contextFiles = await verifyContextFiles(context, observerCapture);
  requireValue(path.resolve(context.files.fridaReport.path) === path.join(observerCapture, FRIDA_OUTPUT),
    'archived Frida report is not the runner required output');
  requireValue(path.resolve(context.files.probeSource.path) !== path.resolve(context.files.fridaReport.path),
    'probe source and report paths collide');

  const summaries = await verifySummaries(roots[0], roots[1], roots[2], context,
    contextFiles.records.fridaReport.sha256);
  const metadata = verifyMetadata(
    contextFiles.metadataBytes,
    contextFiles.records.readyMetadata.bytes,
    'archived Lisp metadata',
  );
  const sourceEvidence = parseJsonLines(decodeUtf8(contextFiles.records.sourceEvidence.bytes, 'source evidence'),
    'observer source evidence');
  const request = parseJsonLines(decodeUtf8(contextFiles.records.fridaRequest.bytes, 'Frida request'), 'Frida request');
  const requestBinding = verifyObserverRequest(request, context, {
    ...contextFiles.records,
    runtimeExecutableSha256: contextFiles.runtime.sha256,
  });
  await verifySourceEvidence(sourceEvidence, context, requestBinding, {
    ...contextFiles.records,
    runtimeExecutable: contextFiles.runtime,
  });
  requireValue(reconstructAgentSourceHash(contextFiles.records.pythonDriver.bytes, requestBinding) ===
    context.files.agentSource.sha256,
  'generated Frida agent source hash does not reproduce from the archived driver and request');
  const controllerIdentity = await verifyControllerReady(requestBinding, context, contextFiles.records);
  const census = parseJsonLines(decodeUtf8(contextFiles.records.reaCensus.bytes, 'REA census'), 'REA census');
  const censusEvidence = verifyCensus(census, context, contextFiles.records.pll.sha256);
  const native = await verifyNativeMapping(context, contextFiles.records, metadata);
  requireValue(native.premium.runtime.entry === hexAddress(parseAddress(context.mapping.premiumEntry, 'context PREMIUM entry')) &&
    native.pick.runtime.entry === hexAddress(parseAddress(context.mapping.pickEntry, 'context PICK entry')),
  'offline mapping entries are not normalized to the recorded runtime addresses');
  requireValue(censusEvidence.staticCall - censusEvidence.staticEntry === context.mapping.callsiteOffset,
    'static census callsite displacement differs from context mapping');

  const sceneBytes = await readBytes(path.join(observerCapture, SCENE_OUTPUT), 'observer scene report');
  const aa0Bytes = await readBytes(path.join(observerCapture, 'aa0'), 'observer AA0 drawing');
  const sceneText = decodeUtf8(sceneBytes, 'observer scene report');
  const aa0Text = decodeUtf8(aa0Bytes, 'observer AA0 drawing');
  const sceneNormalized = sceneText.replace(/\r\n/g, '\n');
  const aa0Normalized = aa0Text.replace(/\r\n/g, '\n');
  requireValue(sceneNormalized.endsWith('END scene-state-snapshot\n') && !sceneNormalized.includes('\r') &&
    !sceneNormalized.includes('MAIN-ERROR'),
  'observer scene report is incomplete or contains MAIN-ERROR');
  requireValue(aa0Normalized.endsWith('end\n') && !aa0Normalized.includes('\r'),
    'observer AA0 drawing is incomplete');
  const reportText = decodeUtf8(contextFiles.records.fridaReport.bytes, 'Frida observer report');
  const liveObserverReportBytes = await readBytes(requestBinding.outputPath, 'Frida driver report before runner archival');
  requireValue(liveObserverReportBytes.equals(contextFiles.records.fridaReport.bytes),
    'runner-archived Frida report bytes differ from the observer driver report');
  const report = verifyObserverReport(reportText, contextFiles.records.fridaReport.sha256,
    request, context, sourceEvidence, {
      ...contextFiles.records,
      runtimeExecutableSha256: contextFiles.runtime.sha256,
    }, sceneBytes, aa0Bytes);
  requireValue(canonicalJson(controllerIdentity) === canonicalJson(report.identity),
    'controller-ready and terminal report dynamic module identities/ranges differ');
  requireValue(context.sourceBindingSha256 === undefined ||
    context.sourceBindingSha256 === report.sourceBindingSha256,
  'capture-context sourceBindingSha256 differs from the request/report');
  if (context.observerResult) {
    requireValue(context.observerResult.status === report.status &&
      context.observerResult.matchedEntries === report.counts.matchedEntries &&
      context.observerResult.matchedRecords === report.matchedRecordCount,
    'capture-context observerResult differs from the Frida report');
  }

  // This existing verifier enforces the six exact output matches (AA0, image,
  // image-id, scene, planning trace, random seed), source-set equality, and
  // fresh uninstrumented bracketing controls.
  const triplet = await verifyLocalAaronTriplet(roots[0], roots[1], roots[2]);
  requireValue(triplet.probeSourceHash === context.files.probeSource.sha256 &&
    triplet.requiredReport === FRIDA_OUTPUT && triplet.reportHash === contextFiles.records.fridaReport.sha256 &&
    triplet.endMarker === context.runner.requiredProbeEndMarker,
  'generic triplet verifier report/source result differs from capture-context');
  requireValue(Object.keys(triplet.artifactHashes).length === 6,
    'generic triplet verifier did not compare all six required scene outputs');
  for (const runInfo of summaries) {
    const capture = path.join(runInfo.root, 'capture');
    requireValue(runInfo.summary.aa0Sha256 === sha256(await readBytes(path.join(capture, 'aa0'), `${runInfo.summary.runId} AA0`)) &&
      runInfo.summary.sceneReportSha256 === sha256(await readBytes(path.join(capture, SCENE_OUTPUT), `${runInfo.summary.runId} scene report`)),
    `${runInfo.summary.runId} runner output hashes differ from archived artifacts`);
  }

  return {
    tripletId: context.tripletId,
    runIds: summaries.map((entry) => entry.summary.runId),
    callerClassification: report.status === 'complete' ? 'observed-return-address-hit' : 'bounded-no-hit',
    observerStatus: report.status,
    stopReason: report.stopReason,
    matchedEntries: report.counts.matchedEntries,
    totalPickEntries: report.counts.totalEntries,
    mappedPremiumEntry: hexAddress(native.premiumEntry),
    mappedPickEntry: hexAddress(native.pickEntry),
    premiumCallsite: hexAddress(native.callsite),
    premiumReturnContinuation: hexAddress(native.continuation),
    pllPayloadBindings: {
      premiumSha256: native.premium.payloadSha256,
      pickSha256: native.pick.payloadSha256,
    },
    capturedCodeRanges: report.identity.mappedCodeRanges,
    tripletOutputMatches: Object.keys(triplet.artifactHashes).length,
    stagedSourceMatches: Object.keys(triplet.sourceHashes).length,
    observerReportSha256: contextFiles.records.fridaReport.sha256,
    captureContextPath: contextPath,
    counterCoverage: 'Observer remained attached through the complete stable scene and AA0; all hit or zero-hit counters cover this bounded scene run.',
    limitation: report.status === 'no-hit'
      ? 'No matching return address was observed during this one complete bounded scene/AA0 observation; this does not prove a global absence of callers.'
      : 'At least one completed PICK entry returned to the PREMIUM callsite continuation during this bounded run; the count is limited to this scene/run.',
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args.some((value) => !value)) {
    console.error('Usage: node research/tools/validate-premium-pick-frida-triplet-v1.mjs <before-root> <observer-root> <after-root> <observer-root>/capture/capture-context.json');
    process.exitCode = 2;
    return;
  }
  const result = await run(...args);
  console.log('PASS: complete source-bound Frida observer triplet');
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => fail(error.message));
}
