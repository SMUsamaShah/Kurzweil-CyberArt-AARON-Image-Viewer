# SUBFORM outline, frame and composed fill

## Scope

This milestone moves upstream from the retained fill-preparation and SUBFORM
POST-FILL observations. It characterizes natural `PATCH-EDGE` and `LIST-FRAME`
outputs and independently composes them with those measured helpers. Original
complete entry maps, the scan-row start point, MAX, patch ID, FLAG-BIT and the
natural form count remain inputs. The surrounding BRUSH-FILL scan, iris,
painting and brush decisions are still unrecovered.

Portable evidence: [subform-boundary-parity-20261005.json](evidence/subform-boundary-parity-20261005.json).
Implementation: [aaron-subform-boundary.js](../../engine/src/aaron-subform-boundary.js).

## Measured results

| Quantity | Seed 1234 | Seed 5678 | Total |
| --- | ---: | ---: | ---: |
| PATCH-EDGE / LIST-FRAME / SUBFORM fill chains | 95 | 183 | 278 |
| Outline positions compared | 12813 | 14696 | 27509 |
| Frames, counts and returns, each | 95 | 183 | 278 |
| Complete output-map cell comparisons, both maps | 29184000 | 56217600 | 85401600 |
| Cells outside the computed frame compared/preserved, both maps | 28577314 | 55710492 | 84287806 |
| Whole-input map equality checks | 380 | 732 | 1112 |
| Elements covered by those equality checks | 58368000 | 112435200 | 170803200 |
| Start points whose Z changes | 86 | 155 | 241 |
| Fills without a natural PATCHDEX read | 46 | 67 | 113 |
| Zero-count fills | 56 | 93 | 149 |
| Copied-state snapshot preview checks | 570 | 1098 | 1668 |

Every constructor output and composed fill comparison agrees. All outlines
close, have 4..1498 points and use integer TRIPT coordinates; all returned
frames are MAPFRAME. All eight directions occur. MAX ranges from 65 to 3525;
target patch IDs range from 1 to 82. All maps are 320×480. Full map inputs and
outputs contain fill values 0/1/2; value 2 is preserved, with no value-2
transition. POST-FILL's separate 2-to-1 branch remains native inference.

There are 235349 observed patch-label changes to the target ID plus FLAG-BIT
32768 and 558 fill-value-1-to-zero changes. Cells outside the computed frame
are unchanged in both maps. All 113 no-PATCHDEX-reader calls have observed
zero counts; ten other zero-count calls in seed 1234 and 26 in seed 5678 do
invoke PATCHDEX. Each chain retains its reader counts in the evidence.

Both complete AA0 and scene reports equal their fresh controls byte for byte:

| Seed | AA0 SHA-256 | Scene report SHA-256 |
| --- | --- | --- |
| 1234 | `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1` | `a2f17602ba33d0ac1b80544c1a70c0ae657c60dad9110c075f9ce43b21e8b415` |
| 5678 | `0ab08c23b241edd0f877c836e4f42fb0497108b8def8c32541ce165157563086` | `e3cc50bef1636328f94e6b002271a663668740f16f3c5b2677a7aa5813008053` |

## Boundary observations

BRUSH-FILL's exact mapped code has a candidate computed call associated with
PATCH-EDGE, followed by OUT-LIST handling, LIST-FRAME, SUB-FRAME handling and
MY-FILL(SUBFORM). The new natural capture records the returned outline object
as the actual LIST-FRAME argument and the OUT-LIST object at MY-FILL entry.
Likewise, the returned LIST-FRAME object is SUB-FRAME at MY-FILL entry. Complete
point values and frame bounds agree across these boundaries.

The capture establishes this return/input identity chain. It does not supply
native return PCs or prove direct native callers for the computed calls.

Both complete maps preserve their object identity and contents at PATCH-EDGE
exit and at SUBFORM MY-FILL entry. Thus the observed construction uses the
existing fill map: it performs no reset or list-to-map write in that interval.
Its earlier scene history remains required input, rather than a newly
recovered initial-map generator.

## Independent behavior

### PATCH-EDGE

The input point has integer X, Y and Z. Z indexes these observed directions:

| Z | X increment | Y increment |
| --- | ---: | ---: |
| 0 | 1 | 0 |
| 1 | 1 | 1 |
| 2 | 0 | 1 |
| 3 | -1 | 1 |
| 4 | -1 | 0 |
| 5 | -1 | -1 |
| 6 | 0 | -1 |
| 7 | 1 | -1 |

At each step, search those eight neighbors starting at the current start.Z,
wrapping modulo eight. Accept the first in-picture neighbor whose PATCH-MAP
value equals the target patch ID. Construct a point with that neighbor's
coordinates and accepted direction, then set the original start point's Z to
`(acceptedDirection - 2) mod 8`. X and Y of the start point stay unchanged.

New points are prepended, so the resulting outline reverses visitation order.
The closing point is at the head; the original start's final values are at the
tail. The implementation retains that start object at the tail, consistent
with the native cons interpretation. Capture measures its values and mutation,
but does not separately record that tail-point object identity.

Stop when the current position returns to the origin after more than two
accepted steps. The native counter also permits steps through MAX inclusively,
and a stranded eight-neighbor search returns NIL. Neither latter termination
branch occurs in the measured natural outputs; they remain native
interpretation pending original-runtime holdouts. Both maps are read only.

### LIST-FRAME

Build a new frame containing the outline's minimum X/Y and maximum X/Y. Native
instructions initialize lower bounds to 100000 and upper bounds to -100000,
floor lower updates and ceiling upper updates. All observed coordinates are
integers, so the measured result is the exact integer bounding rectangle.
Fractional inputs, empty lists and sentinel-extreme coordinates remain
uncharacterized. All returned frames are MAPFRAME.

### Composition

`fillAaronSubformFromBoundary` computes its own outline and frame, median rows
and rotated start list, runs FILL-STRATEGY on the existing maps, then applies
the SUBFORM POST-FILL rule. Original intermediate outlines, frames or output
maps are used for comparison, not fed into those computation stages.

POST-FILL's naturally invoked PATCHDEX reads are recorded repeatedly, with all
observed values agreeing with the PATCH-EDGE target. CFORM-COUNT is read once
at the end. Some zero-count cases have no PATCHDEX call; the comparison records
this absence and uses the upstream target input. The final maps, SUBP-COUNT and
MY-FILL's returned remaining form count must all agree.

## Capture and provenance

The frozen v3 observer is [subform-boundary-capture.cl](subform-boundary-capture.cl).
It adds no application point/frame/count getter calls. Point and frame values
use SLOT-VALUE; count values come only from naturally invoked functions.

To avoid repeated slow RLE traversal, capture full FILL-MAP and PATCH-MAP at
PATCH-EDGE entry and at MY-FILL exit. At entry, COPY-SEQ of a displaced rank-one
view saves independent typed input vectors. At PATCH exit and MY-FILL entry,
EQUALP compares every element against fresh displaced views, while EQ checks
the original map objects. These equality checks and direct slot reads are
inside copied random-state preview comparisons. A false equality flag is
retained in the raw report and rejected by the parser; investigate it with a
new full intermediate capture before extending this scope.

The strict [parser](../tools/parse-subform-boundary-report.mjs) requires full
row/run coverage, matching quotas and completion totals, original map
identities, complete parent nesting, one observed method per SUBFORM fill, and
no errors, aborts or overflow. It preserves an explicitly unbound entry count
separately from an integer count. The [derivation](../tools/derive-subform-boundary-evidence.mjs)
recomputes both constructors and the composed fill and compares every final
map cell, including cells outside the computed frame.

The first v1 capture was stopped and excluded after it required SUBP-COUNT on
the first SUBFORM entry, before that binding exists. Retained earlier traces
also show its initial unbound state. The v2 capture recorded this correctly
but repeated full intermediate map snapshots exceeded its 280-second limit;
its incomplete tape is excluded. The final v3 observer uses the vector
equality checks above and a 600-second limit. Neither diagnostic contributes
to parity counts. Their exact staged sources and partial reports remain in
ignored oracle roots and are hash-bound in the portable evidence.

No system clock change, debugger attachment or unit-test suite was used.

Frozen observer SHA-256:
`ba68190f26636b71b040832facd599cbc12d0925cb270f6854984f6c1fa60b18`.
Portable evidence SHA-256:
`f722857469f72da9f840a9800a5e76414d17603872ada48f16761bea6b73f59a`.

## Exact native mapping

The fresh metadata probe identifies ordinary compiled PATCH-EDGE
`(START MAX PDEX)`, LIST-FRAME `(LIST)` and NEIGHBORS `(X Y P)` functions.
Their complete captured object bytes each have one match among 7723 indexed
objects in AARON.pll, whose SHA-256 is
`7ffc7dc9e3e62b1c5ba3612630b8747778324fa674dac42916be3e90bb96504c`.

| Function | PLL payload offset | Payload bytes | Decoded instructions | Instruction bytes compared |
| --- | ---: | ---: | ---: | ---: |
| PATCH-EDGE | 2635276 | 1328 | 447 | 1320 |
| LIST-FRAME | 2680876 | 632 | 207 | 624 |
| NEIGHBORS | 2629668 | 4788 | 1438 | 4779 |

PATCH-EDGE constants name PATCH-MAP/AREF, X/Y/Z, XINCS/YINCS, MOD/NTHCDR and
MAKE-TRIPT; they name no FILL-MAP or OUT-LIST. Native PATCH-EDGE instructions
compare a zero-based counter with MAX at +146..177, construct accepted points
at +1096..1115, update the output accumulator at +1117..1123, and pass START,
Z and a modulo-eight direction update through a helper at +1126..1198.
The natural outputs resolve the resulting point order and Z mutation for
these paths. LIST-FRAME has the extrema and rounding constant loads.

The [native validator](../tools/validate-aaron-native-evidence.mjs) rederives
the live-window/PLL matches, compares every decoded instruction's bytes and
address against the exact payload, and checks canonical REA record equality
through import/export. REA 3.2.1 records the standalone Ghidra provider with
`nativeProviderSession: false`. This is external evidence handling, not a
successful native REA provider session. Ghidra's generic x86 Windows compiler
model does not recover Allegro Lisp's ABI or source. NEIGHBORS is mapped for
follow-up but has not been dynamically characterized or ported.

## Reproduce and resume

Use [oracle.md](../oracle.md) and [native-analysis-workflow.md](../native-analysis-workflow.md)
first. Audit the saved Lisp structure before launch. Use a fresh output root,
SmallImage, the respective writer-stream-seed-1234/writer-full-seed-5678 modes,
`-RunSeconds 600`, the frozen observer as `-PreSceneProbePath`, and declared
`-ProbeOutputNames aaron-subform-boundary.txt`. Run one original process at a
time and a fresh uninstrumented control for each seed.

Ignored run roots under `research/extracted/local-oracle/`:

- Native identity: `subform-boundary-native-seed1234-20261005-a`.
- Seed 1234: `subform-boundary-seed1234-20261005-d`.
- Control 1234: `subform-boundary-control-seed1234-20261005-e`.
- Seed 5678: `subform-boundary-seed5678-20261005-f`.
- Control 5678: `subform-boundary-control-seed5678-20261005-g`.
- Rejected unbound-count observer: `subform-boundary-seed1234-20261005-b`.
- Rejected repeated-map timeout: `subform-boundary-seed1234-20261005-c`.

The derivation takes those roots in this order: observed/control 1234,
observed/control 5678, native root, rejected unbound root, rejected timeout
root, then a fresh output JSON. It binds current source files, both measured
dependency milestones, all original outputs and native reports. Full maps,
native payloads and REA/Ghidra reports stay ignored. New parsers, evidence,
observer sources and the independent implementation are retained in Git.

## Limits and next boundary

The recovered seam starts with complete original maps and SCAN-ROW's point,
MAX and patch ID. Recover SCAN-ROW/NEIGHBORS next to derive those inputs from a
row and patch map. CFORM POST-FILL, the source of value-3 cells and the
subpart painting/clearing decisions are also open. Neither this module nor
the earlier helper modules constitute an integrated scene generator.
