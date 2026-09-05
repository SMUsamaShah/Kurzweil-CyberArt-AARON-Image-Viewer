import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Parse our checkpointed report, never arbitrary Lisp expressions. */
export function parseRuntimeCensus(text) {
  let phase = 'outside';
  let current;
  const invocations = [];
  const transitions = {
    'BEGIN runtime-census': ['outside', 'metadata'],
    'BEGIN application-functions': ['metadata', 'functions'],
    'END application-functions': ['functions', 'after-functions'],
    'BEGIN signatures': ['after-functions', 'signatures'],
    'END runtime-census': ['signatures', 'outside'],
  };
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const fail = (reason) => { throw new Error(`Line ${index + 1}: ${reason}`); };
    if (transitions[line]) {
      const [before, after] = transitions[line];
      if (phase !== before) fail(`unexpected checkpoint ${line}`);
      if (line === 'BEGIN runtime-census') current = new Set();
      if (line === 'END runtime-census') {
        if (!current.size) fail('empty function census');
        invocations.push([...current].sort());
      }
      phase = after;
      continue;
    }
    if (phase === 'outside') fail('content outside completed invocation');
    if (/^(ERROR|UNAVAILABLE|BEGIN|END)\b/.test(line)) fail(`incomplete evidence: ${line}`);
    if (phase === 'functions') {
      // The probe prints symbol names, not symbol reader syntax. Reject
      // unsupported escapes instead of silently interpreting them as JSON.
      const match = /^FUNCTION "([^"\\]+)"$/.exec(line);
      if (!match) fail('malformed function record');
      if (current.has(match[1])) fail(`duplicate function ${match[1]}`);
      current.add(match[1]);
    } else if (line.startsWith('FUNCTION ')) {
      fail('function outside enumeration');
    }
  }
  if (phase !== 'outside') throw new Error('Truncated runtime census: missing end checkpoint');
  if (!invocations.length) throw new Error('No completed runtime census');
  const functions = invocations[0];
  if (invocations.some((names) => JSON.stringify(names) !== JSON.stringify(functions))) {
    throw new Error('Function inventory changed between invocations; inspect separately');
  }
  return {
    completedInvocations: invocations.length,
    functionRecordCount: functions.length * invocations.length,
    uniqueFunctionCount: functions.length,
    functions,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [path, runUrl, ...extra] = process.argv.slice(2);
    if (!path || !runUrl || extra.length
      || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(runUrl)) {
      throw new Error('Usage: node summarize-runtime-census.mjs REPORT GITHUB_RUN_URL');
    }
    const bytes = readFileSync(path);
    const census = parseRuntimeCensus(bytes.toString('utf8'));
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      source: { runUrl, sha256: createHash('sha256').update(bytes).digest('hex') },
      package: 'COMMON-GRAPHICS-USER',
      scope: 'Own symbols with FBOUNDP true; not a count of recovered implementations',
      ...census,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
