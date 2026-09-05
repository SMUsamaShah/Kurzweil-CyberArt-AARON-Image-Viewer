#!/usr/bin/env node

/**
 * Turn the retained COMMON-GRAPHICS-USER function-name inventory into a
 * deterministic candidate map for the next clean-room probe.
 *
 * This is deliberately a name-based index.  A symbol name is not evidence
 * that a function was called, nor that it has the interpretation suggested by
 * its name.  The output is therefore a probe-planning aid, not an algorithm
 * reconstruction.
 */

import fs from 'node:fs';

export const CANDIDATE_GROUPS = Object.freeze([
  {
    id: 'line-hand',
    title: 'Line / hand candidates',
    exact: [
      'FOLLOW', 'WIGGLE', 'LOCK-WIGGLE', 'PREP-LINE', 'HOP-OR-DRAW',
      'PARSE-HOP', 'PARSE-P-HOP', 'DIRECTION', 'ANGLE-DIF', 'ANGLE-RANGE',
      'RESET-RANGE', 'FROM-ANGLE', 'TO-ANGLE', 'RAN', 'RAN-HAND',
      'BRUSH-STROKE', 'SELECT-BRUSH', 'RECORD-BRUSH', 'MAPLINE',
      'LINE-MAPPING', 'DRAW-CFORM', 'BRUSH-FILL', 'BRUSH-FILL-SUBPART',
    ],
  },
  {
    id: 'planning',
    title: 'Planning / composition candidates',
    patterns: [/PLAN/, /COMPOSE/, /^SCRIPT$/, /PICTURE-PLANE/, /PLACE/],
  },
  {
    id: 'figure-pose',
    title: 'Figure / body / pose candidates',
    patterns: [
      /FIGURE/, /BODY/, /POSE/, /ARM/, /HAND/, /HEAD/, /HAIR/, /TORSO/,
      /LEG/, /ANKLE/, /NECK/, /FACE/, /CRANIUM/, /SKELETON/,
    ],
  },
  {
    id: 'objects',
    title: 'Plant / prop / object candidates',
    patterns: [/PLANT/, /TREE/, /POT/, /PROP/, /THING/, /GARB/, /BRANCH/],
  },
  {
    id: 'mapping-geometry',
    title: 'Mapping / geometry candidates',
    patterns: [/MAP/, /EDGE/, /CORNER/, /ANGLE/, /DIRECTION/, /POINT/, /AREA/],
  },
  {
    id: 'brush-paint-colour',
    title: 'Brush / paint / colour candidates',
    patterns: [/BRUSH/, /PAINT/, /COLOR/, /COLOUR/, /HUE/, /FILL/],
  },
]);

function assertInventory(inventory) {
  if (!inventory || !Array.isArray(inventory.functions)) {
    throw new TypeError('inventory must contain a functions array');
  }
  if (inventory.functions.some((name) => typeof name !== 'string')) {
    throw new TypeError('inventory function names must be strings');
  }
}

export function summarizeFunctionInventory(inventory) {
  assertInventory(inventory);
  const names = [...new Set(inventory.functions)].sort();
  return {
    schemaVersion: inventory.schemaVersion ?? null,
    source: inventory.source ?? null,
    package: inventory.package ?? null,
    uniqueFunctionCount: inventory.uniqueFunctionCount ?? names.length,
    groups: CANDIDATE_GROUPS.map((group) => {
      const members = names.filter((name) => (
        group.exact?.includes(name)
        || group.patterns?.some((pattern) => pattern.test(name))
      ));
      return {
        id: group.id,
        title: group.title,
        count: members.length,
        names: members,
      };
    }),
  };
}

export function renderFunctionInventoryMarkdown(summary) {
  const lines = [
    '# Function inventory candidate map',
    '',
    'This report is generated from retained function names. It is a probe-planning index, not evidence',
    'that a routine ran or that its name describes',
    'its implementation. Argument lists and call behavior must still be measured',
    'against the original build.',
    '',
    `- Package: \`${summary.package ?? 'unknown'}\``,
    `- Unique function names: ${summary.uniqueFunctionCount}`,
  ];
  if (summary.source?.runUrl) lines.push(`- Census: ${summary.source.runUrl}`);
  if (summary.source?.sha256) lines.push(`- Inventory SHA-256: \`${summary.source.sha256}\``);
  lines.push('', '| Candidate group | Count | Names |', '|---|---:|---|');
  for (const group of summary.groups) {
    lines.push(`| ${group.title} | ${group.count} | ${group.names.map((name) => `\`${name}\``).join(', ')} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const [inputPath] = argv;
  if (!inputPath) {
    throw new Error('usage: summarize-function-inventory.mjs INVENTORY.json');
  }
  const inventory = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  process.stdout.write(renderFunctionInventoryMarkdown(summarizeFunctionInventory(inventory)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
