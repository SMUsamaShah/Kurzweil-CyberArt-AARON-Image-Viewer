import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderFunctionInventoryMarkdown,
  summarizeFunctionInventory,
} from '../summarize-function-inventory.mjs';

test('groups retained names as probe candidates without losing duplicates', () => {
  const summary = summarizeFunctionInventory({
    schemaVersion: 1,
    package: 'COMMON-GRAPHICS-USER',
    uniqueFunctionCount: 5,
    functions: [
      'WIGGLE', 'BUILD-FIGURE', 'WIGGLE', 'MAKE-PLAN', 'MAKE-COLORSPEC',
    ],
  });

  const groups = new Map(summary.groups.map((group) => [group.id, group]));
  assert.deepEqual(groups.get('line-hand').names, ['WIGGLE']);
  assert.deepEqual(groups.get('planning').names, ['MAKE-PLAN']);
  assert.deepEqual(groups.get('figure-pose').names, ['BUILD-FIGURE']);
  assert.deepEqual(groups.get('brush-paint-colour').names, ['MAKE-COLORSPEC']);
});

test('renders provenance and an explicit caveat', () => {
  const markdown = renderFunctionInventoryMarkdown({
    package: 'COMMON-GRAPHICS-USER',
    uniqueFunctionCount: 1,
    source: { runUrl: 'https://example.test/run', sha256: 'abc123' },
    groups: [{ id: 'line-hand', title: 'Line / hand candidates', count: 1, names: ['WIGGLE'] }],
  });

  assert.match(markdown, /probe-planning index, not evidence/);
  assert.match(markdown, /https:\/\/example\.test\/run/);
  assert.match(markdown, /`WIGGLE`/);
});
