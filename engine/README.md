# AARON JavaScript engine

This directory contains work toward a JavaScript reimplementation of the
2001 Kurzweil CyberArt AARON engine. **It is not a complete or equivalent port.**
The current scene generator is provisional; passing its tests does not prove
equivalence to the Windows engine.

The implementation is being built in independently testable layers:

1. Parse and render AARON's `AA0`–`AA15` interchange files.
2. Reconstruct drawing primitives and the freehand line system.
3. Reconstruct the observed MT19937 random source and calibrate seed/state
   semantics against the original oracle. The Allegro 5.0.1 numeric path is
   now available as an explicit `Allegro501Random` source; AARON's startup seed
   and draw order are still unresolved.
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

For experiments using the recovered Allegro numeric source (not an exact scene
reproduction), add `--allegro-rng`:

```sh
npm run generate -- --seed 1234 --allegro-rng --small --out /tmp/aaron-aa0-allegro
```

Normal-mode profile names `portrait`, `tall`, `square`, and `wide` expose the
487×768, 650×768, 768×768, and 1024×768 canvas families observed in the first
oracle corpus. With `--small`, `portrait` and `wide` expose the measured
320×480 and 640×480 small-image families.

The provisional compact size controls are available as
`--screen-width <value> --screen-height <value>`. The JS implementation stores
half the requested width and the requested height. Three original-engine
samples had that relationship, but other observed compact canvases have full
width: the original selection rule has not yet been recovered. For example:

```sh
cd engine
npm run generate -- --small --screen-width 3840 --screen-height 1080 \
  --out /tmp/aaron-1920x1080-aa0
```

which emits a 1920×1080 document. This reproduces the dimensions of one
original-engine experiment, not the original composition or a proven universal
dimension rule.

`--premium` selects a provisional compact preset (640×480 with the 148-entry
palette). It does not implement recovered Premium content rules. Original
licensed samples also include 320×480 canvases and 184-entry palettes.

The generator currently reproduces the recovered file protocol, stroke
encoding, palette shape, and 640×480 small-image profile. Its scene planner is
explicitly an oracle-calibratable first layer; the historical pose, planning,
and palette tables are still being recovered rather than silently presented as
byte-identical. The planner now reserves candidate figure footprints on a
coarse occupancy grid, including the no-corner-only diagonal rule described in
Cohen's matrix notes.

The freehand line algorithm is still missing. [Paul Cohen's article and the
recovery plan](../research/freehand-line.md) are saved in the research folder.
`aaron-angles.js` implements ANGLE-RANGE, NORM-A, ANGLE-DIF, and the measured
double MOD arithmetic. Tests match 20 ANGLE-RANGE calls and 218 double
observations, including 96 fresh holdouts. These are primitives toward the line
system, not the complete FLA. Details are in
[`angle-findings.md`](../research/angle-findings.md).
`engine/src/allegro-random.js` contains the recovered Allegro 5.0.1 numeric
source, including all four floating RAN signatures. The latter match 512
original values and 64 subsequent random-state checks. Its vectors and limitations are documented in
[`../research/random-findings.md`](../research/random-findings.md). The scene
generator does not select it by default yet because AARON's startup seed and
draw order remain unknown.
