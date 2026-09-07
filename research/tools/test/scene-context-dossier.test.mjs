import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildSceneContextDossier } from '../build-scene-context-dossier.mjs';

const root = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, root), 'utf8');

const dossier = buildSceneContextDossier({
  index: JSON.parse(read('introspection/static-image-index.json')),
  functionConstants: {
    text: read('introspection/evidence/function-constants-33986804721.txt'),
    sha256: 'fixture',
  },
  genericMethods: {
    text: read('introspection/evidence/generic-methods-34016410110.txt'),
    sha256: 'fixture',
  },
  evidenceSources: {
    functionConstants: 'introspection/evidence/function-constants-33986804721.txt',
    genericMethods: 'introspection/evidence/generic-methods-34016410110.txt',
  },
});

test('builds a package-qualified scene target dossier from existing reports', () => {
  assert.equal(dossier.schemaVersion, 1);
  assert.equal(dossier.candidates.length, 16);
  assert.equal(new Set(dossier.candidates.map(({ identity }) => identity)).size, 16);
  assert.equal(dossier.candidates.every(({ staticIndex }) => staticIndex.indexed), true);
  assert.equal(dossier.checkpoints.length, 4);
});

test('keeps package identity and measured state checkpoints separate', () => {
  const mplan = dossier.candidates.find(({ name }) => name === 'MPLAN');
  assert.equal(mplan.staticIndex.recordOffset, 0x3092a8);
  assert.equal(mplan.checkpointObservations.find(({ id }) => id === 'rparse-enter')
    .observations.MPLAN, 'bound');
  assert.equal(mplan.constantReferences.some(({ function: name, package: pkg }) => (
    name === 'SCREEN-AND-STORE' && pkg === 'COMMON-GRAPHICS-USER'
  )), true);

  const rgb = dossier.candidates.find(({ name }) => name === 'RGB-MAP');
  assert.equal(rgb.checkpointObservations.find(({ id }) => id === 'store-in-file-first')
    .observations['RGB-MAP'], 'NIL');

  const limits = dossier.limits.join('\n');
  assert.match(limits, /constant reference does not prove a call/);
  assert.match(limits, /does not establish package ownership/);
});
