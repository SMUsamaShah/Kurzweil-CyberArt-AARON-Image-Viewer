# AARON JavaScript engine

This directory contains work toward a JavaScript reimplementation of the
2001 Kurzweil CyberArt AARON engine. **It is not a complete or equivalent port.**
The current scene generator is provisional; passing its tests does not prove
equivalence to the Windows engine.

See the [reverse-engineering plan](../research/reverse-engineering-plan.md) for
phase status, exactness criteria, and Astra/Luna handoff guidance.

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

The planner's current provisional composition contract is now operational:
accepted rectangular figure frames control which requested figures are
generated, and each accepted figure is uniformly fitted inside its frame.
Rejected indices and final bounds are exposed in `scene.composition` and
`scene.figurePlacements`. This fixes the earlier integration gap where the
planner could reject a candidate but the generator still drew the requested
figure count. The frame geometry and rejection policy remain provisional until
the original PLAN/MAPPING placement rules are measured.

The freehand line algorithm is not complete, but a measured `FREE-PATH` subset
is now available. `aaronFreePath` reproduces 16 traced-versus-unwrapped
original sequences, including visibility gating, closed-edge traversal,
single/double arithmetic, and subsequent random-state observations. It is not
yet connected to DRAW-CFORM or the brush pipeline. [Paul Cohen's article and
the recovery plan](../research/freehand-line.md) are saved in the research
folder.

An explicitly experimental `outlineMode: 'free-path-subset'` can now connect
that measured primitive to generated polygon outlines without changing the
scene random stream or paint phase. It requires an explicit `outlineSeed` and
uses the recovered Allegro numeric source in a separate stream:

```sh
cd engine
npm run generate -- --seed 1234 --figures 2 --allegro-rng \
  --free-path-subset --outline-seed 1234 --out /tmp/aaron-free-path-aa0
```

The mode is a clean-room integration fixture, not a claim that every original
AARON polygon used this caller setup. The default polygon outline mode remains
unchanged, and local integration hashes are kept separately in
`test/fixtures/free-path-outline-integration.json`.

Every generated scene also contains a frozen `scene.manifest` with stable
object/shape IDs, actual geometry bounds, placement status, and half-open
outline/paint operation ranges. Finalization records document dimensions,
palette and per-shape stage hashes, while `replaySceneManifest` verifies those
bindings and returns copied exact slices without consuming random state. It is
an attribution/replay index, not a second historical generator. Its local
fixture is `test/fixtures/scene-stage-integration.json`.
`aaron-angles.js` implements ANGLE-RANGE, NORM-A, ANGLE-DIF, and the measured
double MOD arithmetic. Tests match 20 ANGLE-RANGE calls and 218 double
observations, including 96 fresh holdouts. These are primitives toward the line
system, not the complete FLA. Details are in
[`angle-findings.md`](../research/angle-findings.md).
`aaron-point-geometry.js` adds the measured XYDIST and LOCK-WIGGLE helpers;
320 original point lists and their subsequent random states match exactly.
It also contains the measured `FREE-PATH` subset and its parity fixtures. The
helpers' use in the complete drawing pipeline remains unresolved. See
[`point-findings.md`](../research/point-findings.md).
`aaron-hand.js` implements the measured zero-argument `RAN-HAND` helper: four
post-`INIT-RANDOM` calls match its 20-joint order, single-float perturbations,
and returned final delta. Its caller and role in the complete hand model are
still unresolved.
`aaron-stroke-writer.js` also emits the recovered basic stream formatter
records (`dims`, `nb`, `nc`, `color`, and `end`). Its VECTOR/FILL selectors now
match all 240 isolated PLOT-stub holdouts, including the original two-decimal
truncation and signed `-0.00` behavior; the real screen/file consumer and
complete brush semantics remain under investigation.
`aaron-brushes.js` now contains the seven startup `PAINT-BRUSH` profiles
measured from the original build, including ordered perimeter/core masks and
the separate `CELLS` scalars. Its integer `SELECT-BRUSH` lookup matches every
original result from 0 through 200,000. Fractional inputs and most out-of-range
values remain uncharacterized. `selectAaronBrushProfile(value)` returns no
profile outside the measured range by
default; `{outOfRange: 'clamp'}` is available only as a local caller policy.
`aaron-maps.js` models the measured `INIT-MAPS` allocation: fresh zeroed
`Uint16Array` patch storage and `Uint8Array` fill storage for the requested
width-by-height dimensions. Its first-coordinate-major index and checked
fill-cell writer are measured from the horizontal/vertical brush probes.
`aaron-brush-stroke.js` adds a deliberately scoped clean-room helper that
applies the measured brush-core union for nonempty vertices; it matches the
brush-1 through brush-4 two-point fixtures and the measured brush-1 gapped
path without interpolating across the gap. It is not yet the complete
`BRUSH-STROKE` routine.

`aaron-post-fill.js` supplies the independent SUBFORM count/map rule. It
matches all 278 captured original calls and 1,130,814 output map cells in two
controlled paintings, given their complete frame/map regions and naturally
read target ID/count. Only fill values 0/1 and FLAG-BIT 32768 are directly
compared; its native value-2 conversion remains inferred. The helper returns
the new count and remaining-count result. The SUBFORM composition below now
builds its outline/frame; earlier map history, scene planning and the integrated
BRUSH-FILL caller remain upstream work. See
[`../research/introspection/post-fill-count.md`](../research/introspection/post-fill-count.md).

`aaron-fill-preparation.js` supplies three independent helpers: median rounding
to the nearest integer with ties to even, complete outline rotation at a
qualifying X sequence, and the cyclic fill-map column scan. All 427 original
calls per helper and 1,883,204
output cell comparisons summed over per-call captured regions match across
two controlled paintings. The scan toggles bit 0 and preserves value 2.
Original integer frames and ordered VISPT/TRIPT coordinates remain inputs.
The CFORM writer and SUBFORM boundary builders are now composed with these
helpers below; earlier map state, scene construction and
the integrated MY-FILL/BRUSH-FILL caller remain open. See
[`../research/introspection/fill-preparation.md`](../research/introspection/fill-preparation.md).

`aaron-boundary-map.js` supplies `writeAaronListToFillMap({maps, points, value})`
and `clearAaronFillMap({maps, frame})`. The writer assigns the supplied value
at in-picture integer coordinates; the clear zeros the inclusive LX/RX/LY/TY
rectangle. Both mutate the fill map in place and return NIL (`null`). All 149
natural value-2 writes and 70 clears match 33,638,400 full-map output cell
comparisons, including clear-entry values 0/1/2/3 and unchanged cells outside
the target. The two controlled paintings contain no out-of-picture writer
point; that skip branch is native interpretation.

Composing the writer with medians, start selection and strategy matches all
149 CFORM cases and 1,295,917 strategy-region cells in the retained separate
observations. The original writer entry map, ordered points and frame inputs
are still supplied; CFORM input construction, earlier map history, CFORM POST-FILL
and the integrated caller remain open. See
[`../research/introspection/boundary-map.md`](../research/introspection/boundary-map.md).

`aaron-subform-boundary.js` supplies `traceAaronPatchEdge`,
`makeAaronListFrame` and `fillAaronSubformFromBoundary`. Given complete maps,
the natural start/MAX/patch inputs, FLAG-BIT and form count, it derives the
outline, frame, medians and start rotation and composes strategy/POST-FILL.
All 278 natural cases match 27,509 outline positions, all frames/counts/returns
and 85,401,600 complete output-map cell comparisons in two paintings.
Outline/frame construction preserves both existing maps; PATCH-EDGE changes the start's
direction. All observed outlines close and contain integer TRIPT points.
Stranded/MAX termination, fractional/empty frame inputs and POST-FILL's value-2
conversion remain native interpretation. Caller row bounds/MAX/patch selection
and earlier map history remain upstream dependencies; this is not an integrated BRUSH-FILL or
scene generator. See
[`../research/introspection/subform-boundary.md`](../research/introspection/subform-boundary.md).

`aaron-scan-row.js` supplies `countAaronPatchNeighbors`, `scanAaronPatchRow`
and `fillAaronSubformFromRow`. NEIGHBORS counts matching in-picture neighbors
up to three; SCAN-ROW searches `[lx, rx)` for the first matching cell with three
neighbors and returns Z=4. Y=-1 returns NIL; more-negative Y is native
interpretation. An optional `flashSpot`
callback preserves the separate zero-argument graphics boundary. All 5,805
natural scans and 6,984 nested calls match; each painting also repeats 44,544
neighbor masks and 10,368 synthetic scans. Composed row seeds match all 278
SUBFORM final maps. Full map identity/content and copied random previews are
preserved while scanning. Original map history, scan schedule, MAX and form
counts remain inputs. See
[`../research/introspection/scan-row.md`](../research/introspection/scan-row.md).

`aaron-brush-fill-preparation.js` supplies `selectAaronBrushFillForm` and
`prepareAaronBrushFillScan`. They project the original SCRIPT/CFLIST lists,
preserve selected form identity and derive initial Y=TY, LX/RX/patch inputs
and MAX=5*((RX-LX)+(TY-LY)). All 134 initial rows, 138 selections, 5,805 row
inputs and 278 budgets match both controlled paintings. The aligned complete
SUBFORM comparison passes again. Plan/frame construction, the complete row
schedule and earlier map history remain inputs. See
[`../research/introspection/brush-fill-preparation.md`](../research/introspection/brush-fill-preparation.md).

`engine/src/allegro-random.js` contains the recovered Allegro 5.0.1 numeric
source, including all four floating RAN signatures. The latter match 512
original values and 64 subsequent random-state checks. Its vectors and limitations are documented in
[`../research/random-findings.md`](../research/random-findings.md). The scene
generator does not select it by default yet because AARON's startup seed and
draw order remain unknown.
