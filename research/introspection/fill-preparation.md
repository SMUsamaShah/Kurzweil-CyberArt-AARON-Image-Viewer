# Three fill-preparation functions

## Measured comparisons, 2026-10-05

`SET-MEDIANS`, `GOOD-START` and `FILL-STRATEGY` now have independent JavaScript
implementations that match every captured call in two complete paintings.
The observer records full outlines, point identities, integer coordinates,
median bindings, return values and complete bounded fill-map regions.

| Comparison | Seed 1234 | Seed 5678 |
|---|---:|---:|
| Calls to each function | 162 | 265 |
| Complete outline point positions | 34,212 | 29,202 |
| Outline length range | 4–4,559 | 4–1,089 |
| Rotated / unchanged outlines | 134 / 28 | 214 / 51 |
| Output cell comparisons summed over calls | 1,173,395 | 709,809 |
| Cells changed by FILL-STRATEGY | 691,232 | 352,188 |
| Input value-2 cells preserved, summed over calls | 21,300 | 14,521 |
| Copied random-preview checks around snapshots | 972 | 1,590 |

All 427 median results and bindings agree. All 427 complete outline sequences,
point identities and GOOD-START returns agree. All 1,883,204 captured output
cell comparisons and 427 FILL-STRATEGY NIL returns agree. Cell and point
totals sum the observations for each call; a map position or object can appear
in more than one call. JavaScript computes its own medians and outline rotation,
then uses those results when preparing the map.
The originals' intermediate medians and rotated outlines are comparison
targets, rather than replacement inputs to the JavaScript scan.

Both observed AA0 files and scene reports match fresh same-mode controls
byte for byte. Both tapes complete with zero observation errors, aborts,
overflow, unmatched calls or remaining stack frames. They also match the
previous complete MY-FILL argument/return sequence. Each MY-FILL has one
SET-MEDIANS → GOOD-START → FILL-STRATEGY sequence in these captures.

## 1. SET-MEDIANS rounds to the nearest integer, with ties to even

The observed rule is:

- `LO-MEDIAN = roundNearestIntegerTiesToEven((LY + TY) / 2)`.
- `HI-MEDIAN = LO-MEDIAN + 1`.
- Return `HI-MEDIAN` as the sole value.

The two paintings include 215 integral midpoints and 212 half-integer
midpoints: 103 round down and 109 round up. For example, LY=382 and TY=427
give midpoint 404.5, LO=404 and HI/return=405. LY=388 and TY=403 give 395.5,
LO=396 and HI/return=397. The first example distinguishes rounding ties toward
even from JavaScript's ordinary `Math.round`.

The frame is a MAPFRAME in every captured call. Only its LY/TY values are
needed and observed in the final probe; they remain unchanged across the
call. These are nonnegative integer inputs in the measured paintings.

## 2. GOOD-START rotates the outline

For outlines longer than seven points, inspect candidate indices from 1
through `length - 1`. At each index, compare the preceding, current and next
X coordinates; the next coordinate wraps to the first point at the end.
The first candidate with three pairwise distinct X values and equal
successive X differences is selected.

Rotate the outline so that the selected middle point becomes first. Preserve
every point object and its coordinates. Replace OUT-LIST with the new list
and return that exact list. If the outline has at most seven points or no
candidate qualifies, retain OUT-LIST and return NIL.

The first seed-1234 outline has 179 positions. At index 14, X coordinates
101, 102 and 103 qualify; the output identities are `[15..179, 1..14]`.
This is rotation of the complete list, not selection of a shorter fragment.

Across both scenes, 348 outlines rotate. Of the 79 unchanged outlines, 43
have lengths 4–7 and 36 are longer but have no qualifying candidate. The
second painting includes rotating eight-point outlines. All complete
sequences and the NIL/list returns are compared, including list identity
changes and preservation of point identities.

## 3. FILL-STRATEGY toggles scan columns

Initialize the remembered direction to the sign of the second point's X
minus the first point's X. Walk the complete outline cyclically. An edge
whose next X equals the current X is skipped without changing that remembered
direction. Other edges update it to the sign of the X difference.

When that sign equals the remembered direction before the update, scan a
column at the current point's X:

- If its Y exceeds HI-MEDIAN, visit Y−1 down through HI-MEDIAN, inclusively.
- Otherwise, visit Y+1 up through LO-MEDIAN, inclusively.
- Leave a cell equal to 2 untouched; toggle bit 0 of every other visited cell.

The starting point's own row is excluded. A scan can be empty. Repeated visits
can toggle a cell more than once, so filling a rectangular span with 1 is not
equivalent to this rule. The outline, its point coordinates, median bindings
and fill-map object identity remain unchanged; map contents are mutated.
The function returns NIL.

The paintings exercise both horizontal directions, vertical edges, direction
changes, upward/downward scans, empty scans and repeated cell visits. In the
independent accounting walk, 23,200 visits encounter value 2 and 232,798 are
repeat visits to a cell. These visit counts describe the matched JavaScript
walk; they are not a trace of individual original AREF calls. The original
before/after cell values independently establish map agreement. Observed
map values are 0, 1 and 2, including a seed-5678 net 1-to-0 transition.

## Exact native objects and scope

The candidates were informed by the previously validated live-object/PLL
matches and standalone Ghidra reports:

| Function | PLL payload offset | Bytes | Reachable instructions |
|---|---:|---:|---:|
| SET-MEDIANS | 2,548,044 | 164 | 64 |
| GOOD-START | 2,642,292 | 798 | 266 |
| FILL-STRATEGY | 2,622,588 | 1,208 | 444 |

SET-MEDIANS names TY, LY, ROUND_2OP_1RET and both median symbols. GOOD-START
names OUT-LIST, MOD, NTHCDR, X, `/=` and SUBSEQ. FILL-STRATEGY names OUT-LIST,
X/Y, SIGNUM, both medians, FILL-MAP, AREF and LOGXOR_2OP. Its map guard uses
tagged raw 8 (integer 2), and its XOR uses tagged raw 4 (integer 1).
The exact payload/report digests remain in the portable evidence. No debugger
was attached for this milestone, and the Allegro ABI has not been recovered
as a C ABI or original Lisp source.

The JavaScript adapter consumes original integer frame values, ordered point
objects and an initial fill map. Captured points are VISPT and TRIPT objects,
with integer X/Y coordinates. Creating those outlines and marking their
initial fill-map boundaries remain upstream work. The map captures include
the outline/median bounding rectangle with one-pixel padding, clamped to the
320×480 map; cells outside that region are unobserved. The original may have
other side effects outside the sampled bindings. Other types, coordinates,
dimensions, fill values and original error behavior are unmeasured. Adapter
validation is a local policy. The complete JS MY-FILL/BRUSH-FILL caller is
still open, and POST-FILL's separate value-2 conversion is still unobserved.

## Observer correction: an extra RX read changes the drawing

The first full observer, run `fill-preparation-20261005-a`, completes without
observation errors but produces a different AA0. A fresh uninstrumented
control retains the canonical AA0. A diagnostic retaining the wrappers
without snapshots also matches that control.

Copied random-state previews then locate exactly one advance, in the first
SET-MEDIANS entry snapshot. A reader-level diagnostic,
`fill-preparation-getter-20261005-e`, narrows it to the extra RX call:
the next three `random 100` samples change from `(3,57,98)` to `(57,98,37)`.
There are no other reported snapshot/reader changes. Its AA0 differs while
its scene report agrees. This establishes an observed extra-reader effect;
it does not identify the reader's internal mechanism or prove a cache cause.

The final probe removes LX/RX reads and observes only the needed LY/TY inputs.
Each snapshot compares previews drawn from copied random states; a change or
unavailable preview is an observation error. All 2,562 comparisons pass, and
the complete control drawings agree. Future probes must check whole output
bytes even if their own error counter is zero. Extra accessor reads are
executable calls whose effects require evidence.

## Reproduction and provenance

Read [the oracle staging rules](../oracle.md#ctemp-staging-and-permissions)
before a run. Use one original process at a time, fresh output paths, and the
existing documented registry permission scope; leave the system clock alone.

The final observer is [fill-preparation-capture.cl](fill-preparation-capture.cl).
Run it through `run-local-scene-state.ps1` with `-PreSceneProbePath`,
`-ProbeOutputNames aaron-fill-preparation.txt`, and a sufficient RunSeconds
budget. Modes are `writer-stream-seed-1234` and `writer-full-seed-5678`.
Uninstrumented controls omit both optional probe arguments.

Final local roots under ignored `research/extracted/local-oracle/`:

- `fill-preparation-seed1234-20261005-f` / `fill-preparation-control-seed1234-20261005-b`.
- `fill-preparation-seed5678-20261005-g` / `fill-preparation-control-seed5678-20261005-h`.
- Rejected reader diagnostic: `fill-preparation-getter-seed1234-20261005-e`.

The strict [parser](../tools/parse-fill-preparation-report.mjs) checks framing,
call order, complete lists, RLE coverage, identities, quotas and completion.
The [derivation](../tools/derive-fill-preparation-evidence.mjs) binds staged
source and output hashes, compares both control files byte for byte and
recomputes every supported output. Its arguments are the two observed/control
pairs, the prior helper evidence, the rejected diagnostic root and a fresh
output JSON path, in that order.

[Portable evidence](evidence/fill-preparation-parity-20261005.json) retains
per-call frames, medians, rotation indices, outline/map digests, comparisons,
coverage and control provenance. Full maps, outlines, binaries and native
analysis reports remain ignored. No new unit tests were added or suites run;
syntax/AST checks and the original-runtime comparisons support this milestone.

Next, recover initial boundary-map production around WRITE-LIST-TO-FILL-MAP,
then connect these three helpers to the measured SUBFORM POST-FILL rule.
