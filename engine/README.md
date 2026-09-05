# AARON JavaScript engine

This directory contains the clean-room JavaScript reimplementation of the
2001 Kurzweil CyberArt AARON engine.

The implementation is being built in independently testable layers:

1. Parse and render AARON's `AA0`–`AA15` interchange files.
2. Reconstruct drawing primitives and the freehand line system.
3. Reconstruct the observed MT19937 random source and calibrate seed/state
   semantics against the original oracle.
4. Reconstruct spatial planning, composition, and occlusion.
5. Reconstruct figures, poses, garments, pots, plants, and trees.
6. Reconstruct palette selection, filling, and brushwork.

The historical viewer in the repository root remains intact while this engine
is developed. Reverse-engineering evidence and methodology live in
[`../research`](../research/README.md).

Run the current tests with:

```sh
cd engine
npm test
```

Create machine-readable structural measurements for one or more original
outputs with:

```sh
cd engine
npm run analyze -- ../aa0 ../aa7
```

Generate a deterministic clean-room scene in the same AA format with:

```sh
cd engine
npm run generate -- --seed 1234 --small --out /tmp/aaron-aa0
```

Normal-mode profile names `portrait`, `tall`, `square`, and `wide` expose the
487×768, 650×768, 768×768, and 1024×768 canvas families observed in the first
oracle corpus.

The generator currently reproduces the recovered file protocol, stroke
encoding, palette shape, and 640×480 small-image profile. Its scene planner is
explicitly an oracle-calibratable first layer; the historical pose, planning,
and palette tables are still being recovered rather than silently presented as
byte-identical. The planner now reserves candidate figure footprints on a
coarse occupancy grid, including the no-corner-only diagonal rule described in
Cohen's matrix notes.
