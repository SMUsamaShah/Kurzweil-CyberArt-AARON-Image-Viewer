# AARON reverse-engineering progress

Updated 2026-10-13. This is the detailed count-based checkpoint log. The compact
current snapshot is in the [root progress report](../progress-report.md).
It reports measured scope and keeps function-name counts separate from
recovered behavior.

## Where we are

| Measure | Current result | How to read it |
|---|---:|---|
| AARON Lisp function bindings inventoried | 1,347 unique names | Two completed snapshots contain 2,694 records with `FBOUNDP` true in `COMMON-GRAPHICS-USER`, including accessors and UI/host routines. This is not 1,347 recovered algorithms. |
| Routines with documented, bounded JS/original comparisons | 30 routine names; 31 contract units | Includes the separately counted CFORM and SUBFORM methods of `POST-FILL`, plus the bounded integer `IN-SUB-FRAME` predicate measured through natural caller adapters. These are limited contracts, not 30 general-purpose source reconstructions. |
| FREE-PATH boundary-matrix comparison | 26 of 30 directly comparable cases match; 4 mismatch; 10 unclassified | Finite source-bound calls only. Eight noncanonical index cases and two signed-zero cases are unclassified; this is not a project completion percentage. |
| Additional original-only bounded observations | `IN-SUB-FRAME`: 2,813 accepted calls in one VALUE=0 stroke; 224 NIL results in a separate 1,400-call scene window | The extra scene window retains 128 false rows but has no per-call frame identity; it applies only to the matched 768×1080 composite-loader setup. |
| Engine JavaScript surface (`engine/src`) | 32 modules, 70 exported functions, 9 classes, 10 constants | Source/API counts only; they do not measure parity. |
| REA 6.4 static native payload dossiers | 6 named payloads | Structured native-code analysis; not six recovered Lisp functions, verified ABIs, or application-wide call graphs. |
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

A new uninstrumented control for a planned 768×1080 ZERO-EDGE caller run
instead measured 320×480. Its six drawing/scene outputs and six staged Lisp
sources exactly match the prior source-bound 320×480 control. The AA0 header,
not the run ID or `smallImage` flag, determines the regime; the 768-only
breakpoint was not armed. This adds no JS contract, so the 30/31, 1-of-5
(20%), and 0 whole-painting-parity figures remain unchanged.

A later FREE-PATH boundary triplet measured 768×1080. Its post-MAIN observer
records 40 direct calls across 20 shapes and seeds 1 and 1234; all reports are
complete, have zero errors, preserve the input lists, and restore the wrapped
RAN/XYDIST functions. Fresh uninstrumented controls match the observer on all
six drawing/scene outputs and six staged Lisp sources. The result-point counts
range from 13 to 60. These rows have not been compared to JavaScript, so they
do not change the 30 routine names / 31 JS contract units, 1-of-5 milestone
count, or 0 whole-painting parity results. The earlier 320×480 captures remain
a separate valid regime; always read the AA0 header for each run.

A follow-up post-MAIN triplet isolates three one-edge, length-10 FREE-PATH
cases at 768×1080. The current JavaScript matches one case exactly and
mismatches two: seed 522862 consumes 10 original steps vs. 9 in JS; seed
256819 consumes 11 in both; seed 348048 consumes 12 original steps vs. 13 in
JS. The step-sum and source-to-emitted-point models predict 9 vs. 10, 11 vs.
12, and 13 vs. 12 steps for those seeds; the first point-distance prediction
is only the selected-step cap. Neither model explains the results generally.
This adds data to the existing bounded
FREE-PATH contract, not a new recovered routine. The function count remains
30 routine names / 31 bounded contract units; milestone progress stays 1 of 5
(20% by count), and whole-painting parity remains 0. See the
[boundary findings](introspection/free-path-boundaries.md) and
[portable v2 evidence](introspection/evidence/free-path-stop-boundary-20261013-v2.json).

The exact `FREE-PATH` native payload is now also mapped and analyzed with REA
6.4.0 / Ghidra 12.1.4. Its 1,322-byte decoded body has 456 instruction
records, 91 blocks and 622 high-p-code operations. A targeted call-resolution
query leaves the loop's computed dispatch unresolved, so REA does not choose
the stop rule. The local seed-521814 replay predicts 12 steps for a terminal
bare-wiggle candidate and 13 for both the current step-sum and source-to-point
candidates. The one-case capture is now complete; its bounded result is
summarized below. This is the sixth named native payload dossier, but it adds no JavaScript contract: the behavior
count remains 30 routine names / 31 bounded contracts, milestone progress is
still 1 of 5 (20%), and whole-painting parity remains 0. See the
[FREE-PATH native findings](introspection/free-path-native.md) and
[REA payload notes](introspection/rea-payload-analysis.md).

A new source-bound 320×480 triplet ran one controlled FREE-PATH edge at seed
521814 from the first successful traced `STORE-IN-FILE` exit (depth 7). The
original selected 14 steps but consumed 12; JS consumed 13. The original
returned 15 points and next RNG value 82821, while JS returned 16 points and
92793. This sample matches the local terminal-distance-at-most-bare-wiggle
prediction and disagrees with step-sum and source-to-emitted-point predictions.
It does not establish the general stop rule or a natural caller, and JS parity
remains false for the sample. The AA0, image, image ID, scene snapshot, random
seed record, and six ordinary staged Lisp sources match the fresh controls;
the observer's planning trace is retained separately because the two extra
trace targets intentionally change that diagnostic. The counts remain 30
routine names / 31 bounded contracts, 1 of 5 milestones (20% by count), and 0
whole-painting parity. See the [v4 evidence](introspection/evidence/free-path-stop-boundary-20261013-v4.json)
and [FREE-PATH findings](introspection/free-path-native.md).

A v6 controlled length-2 edge completed in a source-bound 320×480 triplet.
For seed 79481, the original selected 13 steps and consumed 11; JavaScript
matches all 34 random calls, all 14 returned points, and next RNG value 53424.
Step-sum, bare-wiggle, and step-times-wiggle each predict 11 steps, while the
source-to-emitted-point candidate predicts 12. The capture therefore rejects
that last local candidate for this input only; the general stop rule remains
unresolved. Fresh controls match five drawing/scene outputs and six ordinary
staged sources, with the observer-only planning trace kept diagnostic.

Before v7, six isolated one-edge cases contained three JavaScript matches and
three one-step mismatches. A reproducible local search across seeds 1–200,000 at
lengths 2, 5, 10, 20, and 40 found no case where all four local predictions
were distinct and uncapped; this search is candidate selection, not original
behavior evidence. The totals remain 30 routine names / 31 bounded contract
units, 1 of 5 milestones (20% by count), and 0 whole-painting parity. See
[v6 evidence](introspection/evidence/free-path-stop-boundary-20261013-v6.json),
[the seed search tool](tools/find-free-path-stop-model-seeds.mjs), and
[FREE-PATH findings](introspection/free-path-native.md). The earlier
[v5 evidence](introspection/evidence/free-path-stop-boundary-20261013-v5.json)
remains documented there.

The v7 FREE-PATH discriminator adds one controlled single-float edge at seed
388, bracketed by fresh uninstrumented 768×1080 controls. Original and
single-precision JS both consume 8 of 9 selected steps, return 11 points, and
leave next RNG value 15573; all 25 random calls match. Three local candidates
predict 8 steps and bare-wiggle predicts 7, so this case rejects bare-wiggle
for this input without establishing the general rule. Counts remain 30
routine names / 31 bounded contracts, 1 of 5 milestones (20% by count), and 0
whole-painting parity. Across seven isolated one-edge cases, JS now matches
four and differs by one step in three. See [v7 evidence](introspection/evidence/free-path-stop-boundary-20261013-v7.json)
and [FREE-PATH findings](introspection/free-path-native.md).

The offline comparison of the earlier 40-case FREE-PATH matrix now matches 26
of 30 rows representable by the current JS API. Four seed-1234 polygon cases
differ in random-call count, returned-point count, and the following random
checkpoint. Eight cases with noncanonical index inputs and two cases whose
captured header lost a negative-zero sign remain unclassified. This adds
bounded comparisons but no general function contract: the totals remain 30
routine names / 31 bounded contracts, 1 of 5 milestones (20% by count), and 0
whole-painting parity. The 26/30 result applies only to this finite subset.
See the [matrix comparison](introspection/evidence/free-path-boundary-js-comparison-20261013.json)
and [findings](introspection/free-path-boundaries.md).

## 2026-10-13 FREE-PATH caller capture attempt

The mapped `FREE-PATH` and `DRAW-CFORM` payloads are ready for a natural
caller capture, but the first before/observer/after bracket did not finish.
Its uninstrumented 320×480 before control completed with AA0 SHA-256
`0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1`.
The triplet began with 26,951,680 bytes free on D:, only 31,888 bytes above
the exact 26,919,792-byte single-run staging floor. After that first run, D:
had about 25.2 MiB free, so the observer was refused before it launched. There
was no breakpoint hit, caller finding, or after control; the
before capture is not a complete bracket. No AARON process remains active.

The three unrelated REA JSON files and pre-existing
`runner-failures-20261013` diagnostics in `C:\temp` were left untouched. The
triplet tool now checks the full remaining staging and retained-output budget
before it creates any run root and rechecks before each launch. At the 26 MiB
single-run setting it requires 35.7 MiB on D: to start all three runs, declining
as the remaining legs complete. These are tooling safeguards only; behavior
counts remain 30 routine names / 31 bounded contracts, 1 of 5 milestones
(20% by count), and 0 whole-painting parity results.

## 2026-10-14 FREE-PATH natural caller captured

A fresh source-bound `writer-stream-seed-1234` before/observer/after triplet
completed at 320×480. The observer unwrapped only `FREE-PATH`; the helper hit
its first native entry after 9.7 seconds. Both live code bodies matched their
complete PLL objects. The return address uniquely landed at `DRAW-CFORM+0x167`,
immediately after an indirect `CALL EDI` at `+0x165`. This establishes
`DRAW-CFORM` as the immediate native caller for this first entry in this one
scene. It does not name the computed target by static analysis or establish a
general caller relationship.

The bracketing uninstrumented controls match the observer on AA0, image,
image-id, scene-state snapshot and loaded-seed artifacts; the before/after
planning traces also match. The observer's trace differs as expected because
it records `FREE-PATH` as unwrapped. All six staged scene-source hashes match.
The strict evidence record binds the READY-prefix hash to the helper report and
records the observed return location. See the
[caller findings](introspection/free-path-native.md),
[portable caller evidence](introspection/evidence/free-path-native-caller-20261014.json),
and [native workflow](native-analysis-workflow.md).

This resolves a bounded native caller question, not a JavaScript behavior
contract. Counts remain 1,347 inventoried binding names, 30 routine names / 31
bounded contracts, 1 of 5 milestones (20% by count), and zero whole-painting
parity results. FREE-PATH's 26/30 canonical matrix match remains finite; four
rows still differ and ten remain unclassified.

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
