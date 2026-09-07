#!/usr/bin/env node

/**
 * Build a conservative, package-qualified observation checklist for the
 * integrated scene path.  This joins already-normalized reports only; it
 * does not evaluate Lisp, decode heap pointers, or infer slot semantics.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { parseFunctionConstants } from './parse-function-constants.mjs';

const TARGETS = [
  {
    package: 'COMMON-GRAPHICS-USER', name: 'MPLAN', priority: 1,
    role: 'scene plan binding; RPARSE reports its value as a PLAN',
    question: 'Which plan fields connect the parsed scene to screen, brush, and fill state?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'PLAN', priority: 1,
    role: 'reported class/type of MPLAN',
    question: 'Which read-only accessors or class metadata describe the plan relationship?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'SCRIPT', priority: 1,
    role: 'scene/script context referenced by brush and fill routines',
    question: 'Which script-level list or record supplies CFLIST/IDLIST and brush context?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'PREFS', priority: 2,
    role: 'screen/colour preference binding referenced by SCREEN-AND-STORE',
    question: 'When is PREFS bound in the normal path, and which values affect emission?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'SDEX', priority: 1,
    role: 'scene/subpart index; RPARSE reports a FIXNUM',
    question: 'How does SDEX select the current scene record or subpart?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'FIGDEX', priority: 1,
    role: 'figure index; RPARSE reports a FIXNUM',
    question: 'How does FIGDEX identify the active figure during drawing?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'CFLIST', priority: 1,
    role: 'figure/cform list referenced by scene and brush-fill routines',
    question: 'What list shape does the current plan expose to RECORD-BRUSH and fill traversal?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'IDLIST', priority: 2,
    role: 'identifier list referenced by RECORD-BRUSH and fill traversal',
    question: 'Which identifiers are consumed while recording mapped brush output?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'CFRAME', priority: 2,
    role: 'current frame context referenced by DRAW-CFORM and CLEAR-FILL-MAP',
    question: 'Which frame bounds or status values govern fill-map clearing and drawing?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'BRUSH', priority: 1,
    role: 'selected brush binding; bound at PREP-LINE but NIL at first STORE-IN-FILE',
    question: 'Where is brush selection finalized relative to SCREEN-AND-STORE and PREP-LINE?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'PAINT-BRUSH', priority: 3,
    role: 'measured class of the seven retained brush objects',
    question: 'Which already-measured brush object is selected for a given environment value?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'ALL-BRUSHES', priority: 2,
    role: 'brush collection referenced by SELECT-BRUSH',
    question: 'What collection ordering and selection boundary does SELECT-BRUSH use?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'FILL-MAP', priority: 1,
    role: 'private unsigned-byte-4 fill map, measured as 320 by 480 at RPARSE',
    question: 'Which scene transition clears, reads, or replaces the private fill map?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'RPLANE', priority: 1,
    role: 'render-plane binding; bound at PREP-LINE',
    question: 'What object or dimensions does RPLANE provide to the downstream screen path?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'RGB-MAP', priority: 1,
    role: 'colour map binding; true at RPARSE/PREP-LINE and NIL at first STORE-IN-FILE',
    question: 'Which transition consumes or clears RGB-MAP before the first stored line?',
  },
  {
    package: 'COMMON-GRAPHICS-USER', name: 'COLORDEX', priority: 2,
    role: 'colour index referenced by SCREEN-AND-STORE',
    question: 'Which palette entry and random branch feed a stored brush segment?',
  },
];

const CHECKPOINTS = [
  {
    id: 'master-plan-enter',
    source: 'research/introspection/evidence/planning-call-trace-focused-34099250163.txt',
    run: '34099250163',
    checkpoint: 'MASTER-PLAN entry',
    observations: {
      MPLAN: 'NIL', PREFS: 'NIL', SDEX: 'NIL', FIGDEX: 'NIL',
      'FILL-MAP': 'NIL', 'RGB-MAP': 'T',
    },
  },
  {
    id: 'rparse-enter',
    source: 'research/introspection/evidence/planning-call-trace-focused-34099250163.txt',
    run: '34099250163',
    checkpoint: 'RPARSE entry',
    observations: {
      MPLAN: 'bound', SDEX: 'bound', FIGDEX: 'bound',
      'FILL-MAP': 'bound', 'RGB-MAP': 'bound',
      'MPLAN:type': 'PLAN', SDEX: 'FIXNUM', FIGDEX: 'FIXNUM',
      'FILL-MAP:type': '(ARRAY (UNSIGNED-BYTE 4) (320 480))',
    },
  },
  {
    id: 'prep-line-enter',
    source: 'research/introspection/evidence/planning-call-trace-focused-34099250163.txt',
    run: '34099250163',
    checkpoint: 'PREP-LINE entry',
    observations: {
      MPLAN: 'bound', SDEX: 'bound', FIGDEX: 'bound', BRUSH: 'bound',
      'FILL-MAP': 'bound', RPLANE: 'bound', 'RGB-MAP': 'bound',
    },
  },
  {
    id: 'store-in-file-first',
    source: 'research/introspection/evidence/planning-call-trace-focused-34099250163.txt',
    run: '34099250163',
    checkpoint: 'first STORE-IN-FILE entry',
    observations: {
      MPLAN: 'PLAN', SDEX: 'FIXNUM', FIGDEX: 'FIXNUM',
      'FILL-MAP': '(ARRAY (UNSIGNED-BYTE 4) (320 480))',
      'RGB-MAP': 'NIL', BRUSH: 'NIL',
    },
  },
];

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function readText(path) {
  const text = readFileSync(path, 'utf8');
  return { text, sha256: sha256(text) };
}

function functionSymbolReferences(report, source) {
  const parsed = parseFunctionConstants(report);
  const references = [];
  for (const candidate of parsed.candidates) {
    for (const constant of candidate.constants) {
      if (constant.value.kind !== 'symbol' || !constant.value.package) continue;
      references.push({
        function: candidate.name,
        functionType: candidate.functionType,
        constantIndex: constant.index,
        source,
        package: constant.value.package,
        name: constant.value.name,
      });
    }
  }
  return references;
}

function genericSymbolReferences(report, source) {
  const references = [];
  let owner = null;
  let method = null;
  for (const line of report.split(/\r?\n/)) {
    let match = /^TRY "([^"\\]+)"$/.exec(line);
    if (match) {
      owner = match[1];
      method = null;
      continue;
    }
    match = /^DIRECT "([^"\\]+)"$/.exec(line);
    if (match) {
      owner = match[1];
      method = null;
      continue;
    }
    match = /^METHOD (\d+)$/.exec(line);
    if (match) {
      method = Number(match[1]);
      continue;
    }
    match = /^CONSTANT (\d+) \(:SYMBOL "([^"\\]+)" "([^"\\]+)"\)$/.exec(line);
    if (!match || !owner) continue;
    references.push({
      function: owner,
      method,
      constantIndex: Number(match[1]),
      source,
      package: match[2],
      name: match[3],
    });
  }
  return references;
}

function exactIndexedSymbol(index, target) {
  return index.pll.selectedSymbols.find((entry) => entry.name === target.name)
    ?? index.pll.indexedTargetSymbols?.find((entry) => (
      entry.name === target.name && entry.found
    ))
    ?? null;
}

function exactKnownFunction(index, target) {
  return index.pll.knownFunctionReferences.find((entry) => entry.name === target.name) ?? null;
}

export function buildSceneContextDossier({
  index,
  functionConstants,
  genericMethods,
  evidenceSources = {},
}) {
  const functionRefs = functionSymbolReferences(functionConstants.text, evidenceSources.functionConstants);
  const genericRefs = genericSymbolReferences(genericMethods.text, evidenceSources.genericMethods);
  const rows = TARGETS.map((target) => {
    const identity = `${target.package}::${target.name}`;
    const indexed = exactIndexedSymbol(index, target);
    const knownFunction = exactKnownFunction(index, target);
    const indexedReference = indexed ?? (
      knownFunction?.found
        ? {
          recordOffset: knownFunction.recordOffset,
          objectOffset: knownFunction.objectOffset,
          key: knownFunction.key,
          dynamicFunction: true,
        }
        : null
    );
    const constantReferences = [...functionRefs, ...genericRefs]
      .filter((reference) => (
        reference.package === target.package && reference.name === target.name
      ))
      .sort((a, b) => (
        a.source.localeCompare(b.source)
        || a.function.localeCompare(b.function)
        || a.constantIndex - b.constantIndex
      ));
    const checkpointObservations = CHECKPOINTS
      .filter(({ observations }) => Object.keys(observations).some((key) => (
        key === target.name || key.startsWith(`${target.name}:`)
      )))
      .map(({ id, checkpoint, run, source, observations }) => ({
        id, checkpoint, run, source,
        observations: Object.fromEntries(Object.entries(observations)
          .filter(([key]) => key === target.name || key.startsWith(`${target.name}:`))),
      }));
    return {
      identity,
      package: target.package,
      name: target.name,
      priority: target.priority,
      role: target.role,
      question: target.question,
      staticIndex: indexedReference ? {
        indexed: true,
        recordOffset: indexedReference.recordOffset,
        objectOffset: indexedReference.objectOffset,
        key: indexedReference.key,
        dynamicFunction: indexedReference.dynamicFunction ?? Boolean(knownFunction?.found),
      } : { indexed: false },
      knownFunction: knownFunction ? {
        found: knownFunction.found,
        recordOffset: knownFunction.recordOffset,
        objectOffset: knownFunction.objectOffset,
        key: knownFunction.key,
      } : { found: false, inventoryEntry: false },
      constantReferences,
      checkpointObservations,
      evidenceStrength: checkpointObservations.length || constantReferences.length
        ? 'observed-reference-or-state'
        : 'indexed-name-only',
    };
  });
  return {
    schemaVersion: 1,
    scope: 'Package-qualified target checklist from existing static and oracle reports; no heap evaluation or slot inference',
    evidenceSources: {
      staticIndex: 'research/introspection/static-image-index.json',
      functionConstants: {
        path: evidenceSources.functionConstants,
        sha256: functionConstants.sha256,
      },
      genericMethods: {
        path: evidenceSources.genericMethods,
        sha256: genericMethods.sha256,
      },
      checkpoints: [...new Set(CHECKPOINTS.map(({ source }) => source))],
    },
    limits: [
      'A constant reference does not prove a call, read/write direction, or execution order.',
      'An indexed name does not establish package ownership, class layout, slot layout, or function boundaries.',
      'A missing checkpoint observation is not evidence that a binding is absent outside that checkpoint.',
      'Checkpoint rows are retained from one normalized run and must not be merged with another run without a new boundary.',
      'The dossier selects future metadata-only observations; it does not manufacture a PLAN or substitute live scene state.',
    ],
    checkpoints: CHECKPOINTS,
    candidates: rows.sort((a, b) => a.priority - b.priority || a.identity.localeCompare(b.identity)),
  };
}

function main(argv) {
  const [indexPath, functionConstantsPath, genericMethodsPath, outputPath] = argv;
  if (!indexPath || !functionConstantsPath || !genericMethodsPath || !outputPath) {
    throw new Error('Usage: node build-scene-context-dossier.mjs STATIC_INDEX FUNCTION_CONSTANTS GENERIC_METHODS OUTPUT_JSON');
  }
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  const functionConstants = readText(functionConstantsPath);
  const genericMethods = readText(genericMethodsPath);
  const dossier = buildSceneContextDossier({
    index,
    functionConstants,
    genericMethods,
    evidenceSources: {
      functionConstants: functionConstantsPath,
      genericMethods: genericMethodsPath,
    },
  });
  writeFileSync(outputPath, `${JSON.stringify(dossier, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
