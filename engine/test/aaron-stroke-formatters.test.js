import assert from 'node:assert/strict';
import test from 'node:test';
import { AaronStrokeWriter } from '../src/aaron-stroke-writer.js';

// These strings are recovered from STORE-IN-FILE's retained formatter
// constants in generic-methods-34016410110.txt. They are formatter evidence,
// independent of the unmeasured VECTOR/FILL dispatch branches.
test('emits recovered dimensions, brush, colour, mode, and end records', () => {
  const writer = new AaronStrokeWriter();
  writer.dimensions(640, 480).brush(3).color(12).colorMode().end(640, 480);
  assert.equal(writer.output, 'dims 640 480\nnb 1\nnb 3\nnc 12\ncolor\nam 640 480\nend\n');
});

test('rejects invalid recovered stream formatter arguments', () => {
  const writer = new AaronStrokeWriter();
  assert.throws(() => writer.dimensions(640.5, 480), TypeError);
  assert.throws(() => writer.brush(0), RangeError);
  assert.throws(() => writer.color(-1), RangeError);
  assert.throws(() => writer.end(640, 480.5), TypeError);
});
