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
oracle corpus. With `--small`, `portrait` and `wide` expose the measured
320×480 and 640×480 small-image families.

The recovered compact size controls are available as
`--screen-width <value> --screen-height <value>`. They mirror AARON's retained
`SMALL-IMAGE-SCREEN-WIDTH`/`HEIGHT` variables: the generated header stores half
the requested width and the requested height. For example, the hidden
full-HD-sized path is:

```sh
cd engine
npm run generate -- --small --screen-width 3840 --screen-height 1080 \
  --out /tmp/aaron-1920x1080-aa0
```

which emits a 1920×1080 document. This is a recovered dimension rule, not a
claim that the current clean-room scene rules are byte-identical to the
original composition.

`--premium` selects the measured compact licensed profile (640×480 with the
148-entry palette) while retaining the clean-room planner. It models the
reachable Premium regime without claiming to bypass licensing in the original
binary.

The generator currently reproduces the recovered file protocol, stroke
encoding, palette shape, and 640×480 small-image profile. Its scene planner is
explicitly an oracle-calibratable first layer; the historical pose, planning,
and palette tables are still being recovered rather than silently presented as
byte-identical. The planner now reserves candidate figure footprints on a
coarse occupancy grid, including the no-corner-only diagonal rule described in
Cohen's matrix notes.
