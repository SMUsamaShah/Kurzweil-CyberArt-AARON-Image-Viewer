# AARON reverse-engineering progress

Updated 2026-10-13. This is the short, count-based status page for readers who
aren't following every probe. It reports measured scope and keeps function-name
counts separate from recovered behavior.

## Where we are

| Measure | Current result | How to read it |
|---|---:|---|
| AARON Lisp function bindings inventoried | 1,347 unique names | Two completed snapshots contain 2,694 records with `FBOUNDP` true in `COMMON-GRAPHICS-USER`, including accessors and UI/host routines. This is not 1,347 recovered algorithms. |
| Routines with documented, bounded JS/original comparisons | 30 routine names; 31 contract units | Includes the separately counted CFORM and SUBFORM methods of `POST-FILL`, plus the bounded integer `IN-SUB-FRAME` predicate measured through natural caller adapters. These are limited contracts, not 30 general-purpose source reconstructions. |
| Additional original-only bounded observations | `IN-SUB-FRAME`: 2,813 accepted calls in one VALUE=0 stroke; 224 NIL results in a separate 1,400-call scene window | The extra scene window retains 128 false rows but has no per-call frame identity; it applies only to the matched 768×1080 composite-loader setup. |
| Engine JavaScript surface (`engine/src`) | 32 modules, 70 exported functions, 9 classes, 10 constants | Source/API counts only; they do not measure parity. |
| REA 6.4 static native payload dossiers | 5 named payloads | Structured native-code analysis; not five recovered Lisp functions, verified ABIs, or application-wide call graphs. |
| Execution-plan milestones fully achieved | 1 of 5 (**20% by milestone count**) | Four milestones remain incomplete or not yet achieved. Milestones differ greatly in size, so 20% is not a time estimate or behavior-coverage score. |
| Roadmap phases | 1 complete, 1 mostly complete, 7 in progress, 1 later | Ten phases total; phases are not equal-sized. |
| Whole-painting generator parity | 0 complete results | The generator runs deterministically, but no full painting has passed an original-versus-JS equivalence check. |
| Additional screen-context observations | SET-UP-SCREEN-SIZE and SELECT-CANVAS observed in source-bound 320×480 and 768×1080 regimes | Two bounded original-only observations; the difference is unexplained and adds no JS contract. |

The 30 compared routine names are `RANDOM`, `RAN`, `ANGLE-RANGE`, `NORM-A`,
`ANGLE-DIF`, `XYDIST`, `LOCK-WIGGLE`, `RAN-HAND`, `HOP-OR-DRAW`, `MOVE-TO`,
`DRAW-TO`, `VECTOR`, `FILL`, `FREE-PATH`, `INIT-MAPS`, `BRUSH-STROKE`,
`SELECT-BRUSH`, `SET-MEDIANS`, `GOOD-START`, `FILL-STRATEGY`,
`WRITE-LIST-TO-FILL-MAP`, `CLEAR-FILL-MAP`, `PATCH-EDGE`, `LIST-FRAME`,
`SCAN-ROW`, `NEIGHBORS`, `POST-FILL`, `FOOB`, `BUFFER-FEATURE`, and
`IN-SUB-FRAME`. Some records cover only selected inputs, a partial adapter, or
a helper that consumes captured upstream data. A routine's appearance here
does not imply complete behavior for all inputs or integration into the
generator.

There is **no defensible single percentage for overall behavior coverage** yet:
the symbol inventory is not an implementation denominator, and the project
does not have a weighted function-by-function ledger or end-to-end scoring
scheme. The useful exact percentage today is **20% of the five execution-plan
milestones fully achieved by count**. Milestone 1 replays the complete writer
stream from original-supplied decisions; it does not generate those decisions.
Four milestones remain incomplete or not yet achieved. This does not mean 80%
of the work or elapsed time remains.

## Latest function investigation

The bounded integer `IN-SUB-FRAME` predicate now has JS/original comparisons
through two natural call families: 296,912 ordered checks in 70 value-3 brush
strokes and 81,110 checks in 24 feature-buffer calls, including accepted
equality edges. The explicit-frame JS helper matches their captured predicate
results; non-integer/error behavior remain open. A separate native caller trace
proves that the first natural predicate call in one controlled 768×1080
writer-stream run returns to `BRUSH-STROKE+0x1cf`; it does not identify later
calls or the 1,400-call census rows.
A separate 1,400-call scene census records 1,176 truthy and 224 NIL results,
retaining 128 false rows. Its source/runtime-bound report has fresh no-wrapper
controls before and after; AA0, image, image ID, scene snapshot, planning trace,
and loaded-seed record match at 768×1080. The census has no per-call frame
identity, so its cross-run frame comparisons remain hypotheses. See the
[IN-SUB-FRAME findings](introspection/in-sub-frame.md),
[boundary predicate evidence](introspection/evidence/brush-stroke-boundary-parity-20261005.json),
[feature-buffer predicate evidence](introspection/evidence/brush-feature-buffer-parity-20261006.json), and
[portable call-window evidence](introspection/evidence/in-sub-frame-initial-window-v2-20261013.json).
The separate [first-caller evidence](introspection/evidence/in-sub-frame-native-caller-20261013.json)
records only the first native entry in its own controlled run.

A source-bound pre-scene census of ZERO-EDGE's compiled constant references
scanned 1,347 package bindings and 1,380 unique compiled objects. It found one
static symbol reference in `BUFFER-HOLE` at constant index 1, with zero scan
errors or truncations. The observer was bracketed by fresh no-probe controls;
six output artifacts and six staged scene sources match. This is a candidate
relationship, not proof of a direct caller or natural call. These 320x480
captures are separate from the earlier 768x1080 caller trace. The census adds
no JavaScript behavior contract, so the documented count remains 30 routine
names / 31 bounded contract units, milestone progress remains 1 of 5 (20%),
and whole-painting parity remains 0. See the [ZERO-EDGE census findings](introspection/zero-edge-native-links.md)
and [portable evidence](introspection/evidence/zero-edge-native-links-20261013.json).

A follow-up source-bound caller attempt read the fresh `BUFFER-HOLE` and
`ZERO-EDGE` headers and matched both complete live payloads to the PLL. It saw
no ZERO-EDGE entry before the process ended; the runner session lasted 32.837
seconds, below the helper's configured 150-second maximum. The six
drawing/scene outputs and six scene sources match across fresh
before/observer/after runs. This is a bounded no-hit, not proof that the
function is never called; `BUFFER-HOLE` remains an unconfirmed static
candidate. It adds no JavaScript behavior contract, so the 30/31, 1-of-5
(20%), and 0 whole-painting-parity counts are unchanged. See the
[caller findings](introspection/zero-edge-native-caller.md) and
[portable evidence](introspection/evidence/zero-edge-native-caller-20261013.json).

REA 6.4.0 now has a static `BUFFER-HOLE` dossier: 170 instructions in a
465-byte inferred body, 39 blocks, and 246 high-p-code operations. Its
representative computed call at `0x1fe12d17` remains unresolved. A separate
live execute-breakpoint check at the `BUFFER-HOLE` entry saw no entry during
one 320×480 writer-stream scene. Both live function payloads matched the PLL;
fresh before/after controls matched all six outputs and six scene sources.
The report binds 75 sources and derives byte-identically twice. This adds no
JavaScript contract: the behavior count remains 30 routine names / 31 bounded
contracts, milestone progress remains 1 of 5 (20%), and whole-painting parity
remains 0. See the [REA notes](introspection/rea-payload-analysis.md),
[caller findings](introspection/zero-edge-native-caller.md), and
[combined evidence](introspection/evidence/buffer-hole-native-investigation-20261013.json).

The latest canvas-size investigation compared two source-bound screen contexts
with fresh uninstrumented controls. In both, SET-UP-SCREEN-SIZE enters with
640×480 screen globals; its exit differs, and SELECT-CANVAS later returns
320×480 or 768×1080 for the same observed selector. The cause remains unknown.
The exact native objects map to 1,140-byte and 462-byte PLL payloads. REA 6.4
decodes both bodies but leaves their runtime dispatch calls unresolved. This
does not change the 30 routine names / 31 JS contract units or 1-of-5
execution milestones. See the
[canvas-size findings](introspection/canvas-dimensions.md) and
[portable evidence](introspection/evidence/canvas-size-native-links-20261013.json).

## What remains before a general AARON-equivalent generator

The generative core and its integration remain the main work: recover normal
startup random-state and draw-order behavior; complete the freehand, brush,
fill, colour, clipping, and screen/file-output pipeline; recover composition
and object placement, figures and poses, plants, garments, depth, and
occlusion; then generate complete paintings from declared inputs. The result
must pass fresh uninstrumented controls and independent original-runtime
holdouts. Existing isolated helpers, captured decisions, and deterministic
output do not meet that end-to-end bar.

The current generator is therefore a useful partial implementation and
research harness, **not yet ready as a general reproduction of AARON**. A
completion percentage will become meaningful after each function has a
consistent status (unmeasured, bounded, partial, or complete) and whole-scene
criteria are weighted. Until then, this page will report counts and concrete
exit conditions rather than imply precision we do not have.

## Links

- [Current continuity handoff](aaron-continuity.md)
- [Active execution plan](execution-plan.md)
- [Ten-phase research roadmap](reverse-engineering-plan.md#phase-status)
- [Local tooling quick fixes](tooling-workarounds.md)
