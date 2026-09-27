import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { AaronStrokeWriter } from '../src/aaron-stroke-writer.js';
import { emitAaronScreenPath } from '../src/aaron-screen-path.js';

for (const [seed, filename, aa0Sha256] of [
  [1234, 'screen-units-seed-1234-b.json',
    '0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1'],
  [5678, 'screen-units-seed-5678-a.json',
    '0ab08c23b241edd0f877c836e4f42fb0497108b8def8c32541ce165157563086'],
]) {
  test(`eight natural seed-${seed} screen paths reproduce original writer byte ranges`, () => {
    const evidence = JSON.parse(readFileSync(new URL(
      `../../research/introspection/evidence/${filename}`, import.meta.url,
    ), 'utf8'));
    assert.equal(evidence.units.length, 8);
    assert.equal(evidence.source.aa0Sha256, aa0Sha256);
    for (const unit of evidence.units) {
      const writer = new AaronStrokeWriter({ mode: 'small' });
      emitAaronScreenPath(writer, unit.points.map(point => [point.x, point.y]), {
        redraw: true,
        colorEvents: unit.colorEvents,
      });
      const bytes = Buffer.from(writer.output.replace(/\n/g, '\r\n'), 'latin1');
      assert.equal(bytes.length, unit.byteLength, `unit ${unit.id} byte length`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), unit.byteSha256,
        `unit ${unit.id} original byte slice`);
      assert.equal(unit.writerCallCount, unit.points.length + unit.colorEvents.length);
    }
  });
}

test('screen path validates point and colour-event contracts', () => {
  const writer = new AaronStrokeWriter();
  assert.throws(() => emitAaronScreenPath(writer, []), /nonempty integer/);
  assert.throws(() => emitAaronScreenPath(writer, [[0.5, 1]]), /nonempty integer/);
  assert.throws(() => emitAaronScreenPath(writer, [[1, 2]], {
    colorEvents: [{ beforePoint: 2, index: 1 }],
  }), /colorEvents/);
  assert.throws(() => emitAaronScreenPath(writer, [[1, 2]], {
    colorEvents: [{ beforePoint: 1, index: 1 }, { beforePoint: 0, index: 2 }],
  }), /ordered/);
});
