# AARON reverse-engineering progress

Updated 2026-10-13. This is the short, count-based status page for readers who
aren't following every probe. It reports measured scope and keeps function-name
counts separate from recovered behavior.

## Where we are

| Measure | Current result | How to read it |
|---|---:|---|
| AARON Lisp function bindings inventoried | 1,347 unique names | Two completed snapshots contain 2,694 records with `FBOUNDP` true in `COMMON-GRAPHICS-USER`, including accessors and UI/host routines. This is not 1,347 recovered algorithms. |
| Routines with documented, bounded JS/original comparisons | 29 routine names; 30 contract units | The extra unit is the separately counted CFORM and SUBFORM methods of `POST-FILL`. These are limited measured contracts, not 29 general-purpose source reconstructions. |
| Additional original-only bounded observations | `IN-SUB-FRAME`: 2,813 accepted calls in one VALUE=0 stroke; 224 NIL results in a separate 1,400-call scene window | These are not JS/original comparisons; the window applies only to its matched 768×1080 composite-loader setup. |
| Engine JavaScript surface (`engine/src`) | 32 modules, 70 exported functions, 9 classes, 10 constants | Source/API counts only; they do not measure parity. |
| Execution-plan milestones fully achieved | 1 of 5 (**20% by milestone count**) | Four milestones remain incomplete or not yet achieved. Milestones differ greatly in size, so 20% is not a time estimate or behavior-coverage score. |
| Roadmap phases | 1 complete, 1 mostly complete, 7 in progress, 1 later | Ten phases total; phases are not equal-sized. |
| Whole-painting generator parity | 0 complete results | The generator runs deterministically, but no full painting has passed an original-versus-JS equivalence check. |

The 29 compared routine names are `RANDOM`, `RAN`, `ANGLE-RANGE`, `NORM-A`,
`ANGLE-DIF`, `XYDIST`, `LOCK-WIGGLE`, `RAN-HAND`, `HOP-OR-DRAW`, `MOVE-TO`,
`DRAW-TO`, `VECTOR`, `FILL`, `FREE-PATH`, `INIT-MAPS`, `BRUSH-STROKE`,
`SELECT-BRUSH`, `SET-MEDIANS`, `GOOD-START`, `FILL-STRATEGY`,
`WRITE-LIST-TO-FILL-MAP`, `CLEAR-FILL-MAP`, `PATCH-EDGE`, `LIST-FRAME`,
`SCAN-ROW`, `NEIGHBORS`, `POST-FILL`, `FOOB`, and `BUFFER-FEATURE`. Some
records cover only selected inputs, a partial adapter, or a helper that consumes
captured upstream data. A routine's appearance here does not imply complete
behavior for all inputs or integration into the generator.

There is **no defensible single percentage for overall behavior coverage** yet:
the symbol inventory is not an implementation denominator, and the project
does not have a weighted function-by-function ledger or end-to-end scoring
scheme. The useful exact percentage today is **20% of the five execution-plan
milestones fully achieved by count**. Milestone 1 replays the complete writer
stream from original-supplied decisions; it does not generate those decisions.
Four milestones remain incomplete or not yet achieved. This does not mean 80%
of the work or elapsed time remains.

## Latest function investigation

The current `IN-SUB-FRAME` investigation has REA static analysis and a bounded
natural scene census. In its first 1,400 calls, the observer recorded 1,176
truthy and 224 NIL results, retaining 128 false rows. The report is complete
and bound to its probe, runner, executable, and runtime manifest. Fresh
no-wrapper controls before and after match the observer's AA0, image, image ID,
scene snapshot, planning trace, and loaded-seed record. Those runs used a
768×1080 AA0; direct-mode controls used 320×480, so the measured regime is
specific to the composite-loader path. The census does not identify the direct
caller, recover general predicate bounds, or establish a JS comparison. See
the [IN-SUB-FRAME findings](introspection/in-sub-frame.md) and
[portable call-window evidence](introspection/evidence/in-sub-frame-initial-window-v2-20261013.json).

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
