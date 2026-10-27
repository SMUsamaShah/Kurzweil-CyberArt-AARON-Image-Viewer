# AARON reverse-engineering progress

Updated 2026-10-27. This is the detailed count-based checkpoint log. The compact
current snapshot is in the [root progress report](../progress-report.md).
It reports measured scope and keeps function-name counts separate from
recovered behavior.

## Where we are

Latest tool-analysis checkpoint: REA 6.8.0 repeated the retained
SCREEN-AND-STORE function and computed-call queries on the same unexecuted
synthetic PE used by REA 6.4.0. The function body remains 1,216 bytes versus
the exact 1,224-byte mapped payload; the report contains 72 unresolved
indirect-call sites and no caller/callee relationships. Both the `CALL EDI` at
`0x1fe24d12` and the later conditional call at `0x1fe24d25` remain unresolved.
This adds no JS contract; the totals remain 31 routine names, 32 bounded
contracts, 1/5 milestones (20% by count), and zero whole-painting parity.
See the [static finding](introspection/rea-payload-analysis.md#screen-and-store-return-use-rerun-2026-10-27)
and [portable evidence](introspection/evidence/screen-and-store-call-return-flow-rea-20261027-v1.json).

Latest native checkpoint: accepted triplet
`sstorebranch-v1-20261027-100218-35655b8e` followed the earlier
`sstore27f` `CALL EDI` return capture and observed the same-thread taken edge
from `SCREEN-AND-STORE+0x2b7` to `+0x2bc`. ZF was clear at the JNZ, and the
successor breakpoint stopped before its first instruction. All three fresh
controls matched, six complete-payload rechecks agreed, and original debug
state was restored before detach. The two observations are separate
invocations; later branches and the +0x34a call remain unobserved. This adds
no JS behavior contract; the existing 31 routine names, 32 bounded
contracts, 1/5 milestones, and zero painting-parity counts remain unchanged.
See the [finding](introspection/screen-and-store-call-return.md) and
[branch evidence](introspection/evidence/screen-and-store-branch-successor-sstorebranch-v1-20261027.json).

Earlier native caller checkpoint: three complete source-bound no-TF triplets
across seed-1234 writer-stream and seed-5678 full-writer scenes observed the
anonymous PREMIUM destination's `JMP [ESI+0x12]` reaching the freshly mapped
PICK entry. `CALL [EDI+0x35f]` at `+0x17` had zero hits in all three runs; this
remains a bounded no-hit. The 25.3 MB seed-5678 writer tape matched across its
before/observer/after controls. See the
[finding](introspection/premium-internal-transfer-edge-v1.md),
[repeat evidence](introspection/evidence/premium-internal-transfer-repeat-20261015.json),
and [seed-5678 evidence](introspection/evidence/premium-internal-transfer-seed5678-20261015.json).

REA's exact-window `xrefs` query returned `+0x90` as a static reference to the
`+0x17` indirect CALL. The three accepted outer-destination snapshots predict
the intervening `JC +0x99` taken, consistent with the call's bounded zero-hit.
The branch was not observed, and selected breakpoint edges do not establish a
continuous path. See the [prediction note](introspection/premium-loop-backedge-prediction-20261015.md)
and [portable evidence](introspection/evidence/premium-loop-backedge-prediction-20261015.json).

| Measure | Current result | How to read it |
|---|---:|---|
| AARON Lisp function bindings inventoried | 1,347 unique names | Two completed snapshots contain 2,694 records with `FBOUNDP` true in `COMMON-GRAPHICS-USER`, including accessors and UI/host routines. This is not 1,347 recovered algorithms. |
| Routines with documented, bounded JS/original comparisons | 31 routine names; 32 contract units | Includes the separately counted CFORM and SUBFORM methods of `POST-FILL`, the bounded integer `IN-SUB-FRAME` predicate measured through natural caller adapters, and the `PICK` contract (three-integer cases plus bounded two-/four-argument extensions). These are limited contracts, not 31 general-purpose source reconstructions. |
| FREE-PATH boundary-matrix comparison | 26 of 30 directly comparable cases match; 4 mismatch; 10 unclassified | Finite source-bound calls only. Eight noncanonical index cases and two signed-zero cases are unclassified; this is not a project completion percentage. |
| FREE-PATH isolated one-edge stop cases | 10 captured cases; JS matches 4 and differs by one step in 6 | Controlled inputs only. In v8/v9/v11, step-times-wiggle is the only local candidate matching all three original counts; this does not establish a general rule. |
| Additional original-only bounded observations | `IN-SUB-FRAME`: 2,813 accepted calls in one VALUE=0 stroke; 224 NIL results in a separate 1,400-call scene window | The extra scene window retains 128 false rows but has no per-call frame identity; it applies only to the matched 768×1080 composite-loader setup. |
| Engine JavaScript surface (`engine/src`) | 32 modules, 70 exported functions, 9 classes, 10 constants | Source/API counts only; they do not measure parity. |
| REA 6.4 static native payload dossiers | 7 distinct payloads | Structured native-code analysis; one payload first seen through a continuation matching the saved stack value at PICK entry is now identified as a SELECT-SUBJECT method. The PICK dossier adds one bounded native branch/data-flow observation. This is not seven recovered behaviors, verified ABIs, or application-wide call graphs. |
| REA 6.8 SCREEN-AND-STORE compatibility rerun | Same payload analyzed by REA 6.4; function and call-target output compared | Static reports match for the analyzed input, while 6.8 exposes its 72 unresolved call sites. This does not add a distinct payload, caller, ABI, or JS behavior contract. |
| SCREEN-AND-STORE live call/return and branch | Two accepted source-bound triplets; five ordered same-thread events in the latest observer | The first capture observed raw target `0x20000985` and return EAX `0x8c`; a separate capture observed the `+0x2b7` JNZ reach `+0x2bc`. Later branches and calls remain unobserved. No target name, direct Lisp caller, ABI, JS contract, or painting parity was added. |
| Execution-plan milestones fully achieved | 1 of 5 (**20% by milestone count**) | Four milestones remain incomplete or not yet achieved. Milestones differ greatly in size, so 20% is not a time estimate or behavior-coverage score. |
| Roadmap phases | 1 complete, 1 mostly complete, 7 in progress, 1 later | Ten phases total; phases are not equal-sized. |
| Whole-painting generator parity | 0 complete results | The generator runs deterministically, but no full painting has passed an original-versus-JS equivalence check. |
| Additional screen-context observations | SET-UP-SCREEN-SIZE and SELECT-CANVAS observed in source-bound 320×480 and 768×1080 regimes | Two bounded original-only observations; the difference is unexplained and adds no JS contract. |
| Natural screen-unit context samples | 7 units across seeds 1234 and 5678 | Their selected paths reproduce 1,121 writer bytes. Units 2, 3, 5, and 6 supply 12 same-painting PICK/PREVDEX observations for `(27,28,29)`; seed-5678 unit 6 adds three calls for `(33,34,35)`. |
| Controlled PICK comparison | 16/16 three-integer and 32/32 two-/four-integer cases match the JS adapter | Across 16 seeds per case set, the original return and next random value match one `RAN(0,n-1)` draw. The added cases use positive distinct fixnums; other arities, types, and values remain uncharacterized. |

The 31 compared routine names are `RANDOM`, `RAN`, `ANGLE-RANGE`, `NORM-A`,
`ANGLE-DIF`, `XYDIST`, `LOCK-WIGGLE`, `RAN-HAND`, `HOP-OR-DRAW`, `MOVE-TO`,
`DRAW-TO`, `VECTOR`, `FILL`, `FREE-PATH`, `INIT-MAPS`, `BRUSH-STROKE`,
`SELECT-BRUSH`, `SET-MEDIANS`, `GOOD-START`, `FILL-STRATEGY`,
`WRITE-LIST-TO-FILL-MAP`, `CLEAR-FILL-MAP`, `PATCH-EDGE`, `LIST-FRAME`,
`SCAN-ROW`, `NEIGHBORS`, `POST-FILL`, `FOOB`, `BUFFER-FEATURE`,
`IN-SUB-FRAME`, and `PICK`. Some records cover only selected inputs, a partial adapter, or
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

## SCREEN-AND-STORE indirect call/return native observation (2026-10-27)

Accepted triplet `sstore27f-20261027-093231-4740a8ed` completed three fresh,
serialized `screen-unit-seed-1234` runs. The observer's compiled-function
metadata, complete 1,224-byte payload map, and original PLL hash bind
`COMMON-GRAPHICS-USER::SCREEN-AND-STORE` at live entry `0x1fe24a6c`. On one
thread, the payload executed `CALL EDI` at `+0x2a6` (`0x1fe24d12`) with raw
`EDI=0x20000985`; the target entry had `[ESP]=0x1fe24d14`, ESP was the
pre-call value minus four, and EBP matched the source frame. The target
returned to `+0x2a8` with raw EAX `0x0000008c`, pre-call ESP restored, and EBP
unchanged. The breakpoint stopped before `89 45 BC` executed.

All scene, drawing, planning, writer, screen-unit, screen-color, staged-source,
and AA0 controls passed. The original thread's debug state was restored,
detach succeeded, and cleanup errors were empty. A preceding attempt exposed a
missing `DBG_CONTINUE` after target-entry validation; the focused fix is
recorded in [tooling notes](tooling-workarounds.md#screen-and-store-breakpoint-event-must-be-handled).
It adds no function/contract count, milestone, or parity result. The raw
callee address, ABI, semantic type of EAX, direct Lisp caller, subsequent
conditional branch, and JavaScript behavior remain unresolved. See the
[finding](introspection/screen-and-store-call-return.md) and
[portable evidence](introspection/evidence/screen-and-store-call-return-sstore27f-20261027.json).

## PREMIUM JC successor native observation (2026-10-15)

Triplet `premjcsucc3-20261015-121544-fd725a19` completed a matched
before/observer/after sequence for the full-writer seed-456069 1920×1080
scene. The observer recorded the same-thread outer CALL, anonymous destination,
JC event, then its actual taken successor at `0x2000099c` before execution.
CF=1 and the operand comparison agree; the live successor bytes are
`89 44 24 04`. Six drawing/scene artifacts, five staged Lisp sources, the
25,840,962-byte writer tape, and the 21,296,429-byte planning trace match
across all three runs. Metadata, seven comparison source bindings, exact
debug-state restoration, and a successful `DBG_CONTINUE` receipt pass the
offline source-bound deriver twice byte-identically. See the
[native finding](introspection/premium-internal-transfer-jc-successor-v1.md)
and [portable evidence](introspection/evidence/premium-internal-transfer-jc-successor-premjcsucc3-20261015-121544-fd725a19.json).

The capture ends before the successor instruction runs. The raw
`[EDI+0x35f]` value remains unidentified, and the direct Lisp caller is
unknown. This records one native branch outcome but does not add a behavior
contract. Counts remain 31 routine names / 32 bounded contracts, one of five
milestones (20% by count), and zero whole-painting parity results.

## IN-SUB-FRAME bounded predicate investigation

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

## 2026-10-14 natural SCREEN-AND-STORE context captured

Two complete before/observer/after triplets captured the first
post-`RPARSE` `SCREEN-AND-STORE` unit at 320×480, under seeds 1234 and 5678.
Each source-bound report completed, and fresh controls matched all six
drawing/scene outputs plus ten and seven ordinary staged sources, respectively.
JavaScript replays each selected path and its `AARGB` changes byte-for-byte:
74 points / 244 bytes for seed 1234 and 19 points / 80 bytes for seed 5678.

The samples share the first five `RAN` argument pairs but return different
seeded values. In both, the second color event follows `RAN(0,2)→1` and lowers
`HDEX` by one. A later identical random return in the seed-5678 unit has no
following color event, so that value alone is not sufficient. The observed
parent label is `BRUSH-STROKE` for seed 1234 and `PAINT-FILL` for seed 5678;
the latter probe did not install the optional `BRUSH-STROKE` trace, so neither
label proves a direct Lisp caller. The current JS still takes color events as
input and has no new contract from this evidence.

See the [screen-unit findings](introspection/screen-unit-context.md),
[seed-1234 evidence](introspection/evidence/screen-unit-context-seed1234-20261014.json),
[seed-5678 evidence](introspection/evidence/screen-unit-context-seed5678-20261014.json),
and [triplet runner](tools/capture-screen-unit-context-triplet.ps1). The next
probe will preserve RAN numeric types and capture `COLORDEX`, `PREVDEX`, and
related state at each random/color event. Counts remain 30 routine names / 31
bounded contracts, 1 of 5 milestones (20% by count), and zero whole-painting
parity.

## 2026-10-14 FREE-PATH stop-boundary discriminator v8

A new source-bound `writer-stream-seed-1234` before/observer/after triplet
measured 320×480. All three summaries are complete and use matching runner,
installer, registry-patch, and license-patch hashes. The observer's checked-in
probe hash matches its archived source; its report has ordered `INSTALL`,
`READY`, successful hook, `COMPLETE`, and terminal `END` records. Five
drawing/scene outputs and six ordinary staged Lisp sources match across the
triplet. The observer-only planning trace differs as expected because the two
extra trace targets are diagnostic.

At the first traced `STORE-IN-FILE` exit (depth 7), the controlled case uses a
single visible vertical edge `((0 0 0) (0 0.2f0 1))`, seed 150415, with a
single-float `XYDIST`. The original selected 14 steps and consumed 12, returned
15 points, made 37 `RAN` calls, and left next random value 88798. The local
single-float candidates predict 13 for step-sum, 13 for source-to-emitted-point,
and 12 for step-times-wiggle. The captured count therefore agrees with the
last candidate and disagrees with the first two for this input only.

Current single-precision JavaScript consumes 13 steps, returns 16 points, makes
40 `RAN` calls, and leaves next random value 46177. Its bounded parity check
fails on this case. Input point values remain equal at single-float comparison
precision; the probe does not claim point-object identity or list-shape
preservation. Across eight isolated one-edge cases, JS matches four and differs
by one iteration in four. This adds no general behavior contract; counts
remain 30 routine names / 31 bounded contracts, milestone progress remains
1/5 (20% by count), and whole-painting parity remains zero. See the
[portable evidence](introspection/evidence/free-path-stop-boundary-20261014-v8.json),
[native findings](introspection/free-path-native.md), the
[capture helper](tools/capture-free-path-stop-boundary-v8.ps1), and the
[evidence deriver](tools/derive-free-path-stop-boundary-v8-evidence.mjs).

## 2026-10-14 FREE-PATH stop-boundary discriminator v9

A second fresh source-bound `writer-stream-seed-1234` triplet captured the
seed-46380 case. All three runs are complete and serial at 768×1080; runner,
installer, registry-patch, license-patch, and `smallImage=false` settings
match. The checked-in observer source hash matches the archived source, its
required report ends with the complete lifecycle markers, and all five
drawing/scene outputs plus six ordinary staged sources match across the
triplet. The planning trace differs only in the observer because its two trace
targets are diagnostic.

Inside the first traced `STORE-IN-FILE` exit at depth 7, the controlled input
was the same vertical single-float edge `((0 0 0) (0 0.2f0 1))`. The original
selected 14 steps, consumed 12, returned 15 points, made 37 `RAN` calls, and
left next random value 74663. Local step-sum/source-to-emitted/step-times-wiggle
predictions were 13/12/12. JavaScript consumed 13, returned 16 points, made 40
calls, and left 46118; bounded parity fails. Input values remain equal at
single precision, but identity and list shape were not observed.

Together with v8, the observed counts are 12 and 12. The three local candidate
signatures are 13/13, 13/12, and 12/12, respectively, so only step-times-wiggle
matches both samples. These are local replays of the captured seeded stream,
not observations of the original internal variables. The two triplets also
used different scene sizes (v8 320×480; v9 768×1080), and two matching samples
do not establish a general stop rule.
At the v9 checkpoint, JavaScript matched four and differed by one step in
five of nine isolated cases. Counts then stood at 30 routine names /
31 bounded contracts, 1/5 milestones (20% by count), and zero whole-painting
parity results; the canonical 40-case matrix remains 26/30 matches, four
mismatches, and ten unclassified. See the [v9 evidence](introspection/evidence/free-path-stop-boundary-20261014-v9.json),
[findings](introspection/free-path-native.md), [capture helper](tools/capture-free-path-stop-boundary-v9.ps1),
and [evidence deriver](tools/derive-free-path-stop-boundary-v9-evidence.mjs).

## 2026-10-14 FREE-PATH stop-boundary holdout v11

The fresh source-bound 320×480 triplet measured one vertical 0.2 single-float
edge at seed 456069, triggered at the first successful STORE-IN-FILE exit
(depth 7). The original selected 13 steps and consumed 11, returned 14 points,
made 34 RAN calls, and left next random value 77059. The three local replay
candidates predicted 12 steps for step-sum, 12 for source-to-emitted-point,
and 11 for step-times-wiggle; their minimum boundary margin exceeded one
million Float32 ULPs. The candidate match is one finite replay, not an
observation of the original's internal progress variable or a general stop
rule.

JavaScript parity fails for this case: it made 37 RAN calls, returned 15
points, and left next random value 62900. The extra iteration is derived from
the call count and implementation structure, not stored as a named evidence
field. Across ten controlled one-edge cases, JS matches four and differs by
one step in six. The separate canonical 40-case matrix remains 26/30 matches,
four mismatches, and ten unclassified. This adds no routine, contract, or
milestone. See the [portable evidence](introspection/evidence/free-path-stop-boundary-20261014-v11-456069.json),
[probe](introspection/free-path-stop-boundary-v11.cl), [serial capture helper](../tools/capture-free-path-stop-boundary-v11.ps1),
[strict evidence deriver](../tools/derive-free-path-stop-boundary-v11-evidence.mjs),
and [candidate search](../tools/find-free-path-stop-boundary-v11-candidate.mjs).

## 2026-10-14 second natural SCREEN-AND-STORE unit

A third complete source-bound before/observer/after triplet selected the second
post-`RPARSE` `SCREEN-AND-STORE` unit in the seed-1234 320×480 scene. All six
drawing/scene outputs and ten ordinary staged Lisp sources match the two fresh
uninstrumented controls. The selected path has 27 points and 29 writer calls;
its 103 bytes match the corresponding original writer slice exactly
(SHA-256 `48f9f1b3b2d6fa51907db8395b700408ef77c02c3d6408d259266006a579b0aa`).

The typed event snapshots show `RAN(0,2)→0` at call 854 with `PREVDEX=28`,
followed by `AARGB(HDEX=27)` before path point 10. Call 862 returns 1 with
`PREVDEX=27`, followed by `AARGB(HDEX=28)` before point 15. An earlier
`RAN(0,2)→1` at call 843 has no HDEX write before the next random call 854.
This supports two color-associated neighboring indices but rules out the
random result alone as a sufficient trigger. `COLORDEX`, `CDEX`, and `HDEX` are unbound in the
inspected package state at the event boundaries; the color index is recorded
as an `AARGB` writer argument. This does not recover the branch condition.

Across the four accepted units (seed 1234 units 1, 2, and 5; seed 5678 unit 1),
the exact path/color slices total 566 bytes. The JS screen adapter still
consumes captured path points and color events, so counts remain 30 routine
names / 31 bounded contracts, 1 of 5 milestones (20% by count), and zero
whole-painting parity. See the [screen-unit findings](introspection/screen-unit-context.md),
[unit-2 evidence](introspection/evidence/screen-unit-context-seed1234-unit2-20261014.json),
[unit-5 evidence](introspection/evidence/screen-unit-context-seed1234-unit5-20261014.json),
and [typed observer](introspection/screen-unit-context-v5.cl).

The v4 probe's third post-`RPARSE` unit at 768×1080 had no `PREP-LINE` or
writer calls, so the observer rejected it. In a separate 320×480 v5 run,
ordinal 3 is populated; do not treat the v4 outcome as an ordinal rule. The v5
observer was configured for unit 5 and reproduced the same local neighbor
transitions as unit 2, but each unit also contains an unpaired random result.
This remains a bounded observation; it does not identify the branch condition.

The unit-6 investigation is now complete in a source-bound triplet. Its 39
points and 41 writer calls reproduce 139 bytes; three `PICK(27,28,29)` calls
return 29, 28, and 28 while their nested observed `RAN(0,2)` calls return 2,
1, and 1. The first two values match the unit's HDEX writes; the third has no
following color write. The scene observer adds one expected
`FIRST-PICK-RETURN` snapshot; the gate checks fresh controls and requires this
to be the only scene-report delta. The JS screen writer still receives the
captured path and color inputs, so this adds no JS contract. See the new
[unit-6 findings](introspection/screen-unit-context.md) and
[portable evidence](introspection/evidence/screen-unit-context-seed1234-unit6-20261014.json).

That controlled `PICK` investigation is now complete for one fixed three-
integer argument list. The next target is the screen color-write decision
that follows the natural screen-unit selection events.

## 2026-10-14 sixth natural SCREEN-AND-STORE unit

The fifth accepted context triplet selected post-`RPARSE` unit 6 in the
seed-1234 320×480 scene. Fresh uninstrumented controls bracket the observer.
All six drawing/scene outputs match across controls; the ten ordinary staged
Lisp sources match; AA0 is `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1`.
The observer source hash is
`e132b660227c2a400db5e4d75e4ed98d80eacf16410cea0dcd8f9d8e494d9f96`. The
PICK return target adds a single complete `FIRST-PICK-RETURN` block to its
scene snapshot; the verifier removes exactly that block and requires the
remaining observer report to equal the control report. The observer-specific
scene and trace hashes remain recorded separately.

The selected path contains 39 points, 41 writer calls, and a 139-byte slice
with SHA-256
`577de280b5e8c94de4d617cc71ede92ab3b9a99ae59f6ff21987c12739336466`.
`PICK(27,28,29)` returns 29, 28, and 28. Each observed `RAN(0,2)` child of
the nearest traced PICK frame returns 2, 1, and 1. The first two PICK returns
match HDEX writes before points 0 and 14; the third is not followed by a
color write. This does not prove a direct source-level call edge through
unwrapped helpers, a general PICK mapping, or a color-selection rule. The
bounded evidence adds no JS contract. See the [findings](introspection/screen-unit-context.md),
[portable evidence](introspection/evidence/screen-unit-context-seed1234-unit6-20261014.json),
and [observer](introspection/screen-unit-context-v6.cl).

## 2026-10-14 bounded three-integer PICK contract

A fresh source-bound before/observer/after triplet tested the fixed input
`PICK(27,28,29)` at 16 isolated seeds. All three possible positions were
selected. For every case, the returned argument matched the index from one
direct `RAN(0,2)` draw, and the following `RAN(0,1000000)` matched the value
after that one draw; the no-draw checkpoint differed in all 16 cases. The
existing `Allegro501Random.pick` adapter plus its next random value matches all
16 original rows. The six drawing/scene outputs and six ordinary staged Lisp
sources match across fresh controls.

This supports only the fixed positional three-integer contract over the
recorded seeds. It does not establish other arities, types, values, hidden
state, a source-level `PICK`-to-`RAN` call edge, or the caller that decides
whether a color write follows. It adds the 31st routine name and 32nd bounded
contract unit; milestone progress stays 1 of 5 (20% by count), and whole-
painting parity remains 0. No overall completion percentage is defensible.
See the [finding](introspection/screen-unit-context.md), [probe]
(introspection/pick-contract-v1.cl), [portable evidence]
(introspection/evidence/pick-contract-three-args-seed1234-20261014.json), and
[evidence derivation helper](tools/derive-pick-contract-evidence.mjs).

At this checkpoint, the next target was to identify the control-flow boundary
for paired `PREVDEX` neighbor writes versus unpaired `PICK`/`RAN` results. The
later unit-3 and 12-case candidate section below supersedes that next step with
a controlled return-substitution experiment.

## 2026-10-14 third natural screen-unit PICK sample

A sixth source-bound before/observer/after triplet captured seed-1234 unit 3
at 320×480. All six drawing/scene outputs and ten ordinary staged Lisp
sources match the fresh controls. Its 34 points and 36 writer calls reproduce
132 bytes (SHA-256
`f46634b0a1f962bf0f8fc27d8fbdd7e97b5d63e93e1870bec7b394b000bfe0ec`). The
observer records three natural `PICK(27,28,29)` returns: 29, 27, and 27. Their
nested `RAN(0,2)` indices are 2, 0, and 0; `PREVDEX` at those entries is 28,
29, and 27. The first two returns are followed by matching HDEX writes before
points 0 and 13; the final return has no following HDEX write.

An offline check across seed-1234 units 2, 3, 5, and 6 fits the candidate
“write after PICK when the return differs from PREVDEX at nested RAN entry” in
12/12 calls: eight differing returns are followed by matching HDEX writes and
four equal returns have no following write. These are four units from one
painting and one fixed argument list. The observation is not an independent
seed, controlled downstream test, direct caller proof, recovered color rule,
or JS contract. At this historical checkpoint, the natural-unit total was six units and 837 writer bytes;
routine/contract counts remain 31/32, milestone progress 1/5 (20% by count),
and whole-painting parity 0.

The planned first/second unit-2 return-substitution interventions are complete
in a separate measured 768×1080 regime; both changed the caller-visible PICK
return to equal PREVDEX and neither was followed by HDEX. See the newer
[intervention findings](introspection/screen-unit-context.md), [v11 evidence](introspection/evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v11-20261014.json),
and [v12 evidence](introspection/evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v12-20261014.json).

## What remains before a general AARON-equivalent generator

The generative core and its integration remain the main work: recover normal
startup random-state and draw-order behavior; complete the freehand, brush,
fill, colour, clipping, and screen/file-output pipeline; recover composition
and object placement, figures and poses, plants, garments, depth, and
occlusion; then generate complete paintings from declared inputs. The result
must pass fresh uninstrumented controls and independent original-runtime
holdouts. Existing isolated helpers, captured decisions, and deterministic
output do not meet that end-to-end bar.

## 2026-10-14 PICK/PREVDEX equality-side return interventions

Two fresh source-bound before/observer/after triplets selected the first and
second `PICK` calls in seed-1234 screen unit 2 at measured 768×1080. V11
preserved the nested `RAN(0,2)` draw, then changed `(33 34 35) → 34` to a
caller-visible 35 while `PREVDEX=35`. V12 targeted the next call and changed
`(33 34 35) → 33` to caller-visible 34 while `PREVDEX=34`. Neither selected
call was followed by an HDEX write, matching the equality-side candidate
prediction in both cases.

The two fresh uninstrumented controls match all six compared outputs, and the
ten ordinary staged Lisp source hashes match. AA0 and preview-image changes
in each observer are intentional and separately hash-bound; the image ID is
unchanged. Each observer contains only a 50,000-call writer-tape prefix of
100,029 total calls, but it covers the selected 12 writer calls. The evidence
therefore supports only these two treatments in this one seed and canvas
regime. It does not test the opposite side, establish a direct Lisp caller,
recover a general color rule, add a JS contract, or count as parity. The
function/contract totals remain 31/32, fully achieved milestones remain 1/5
(20% by count), and whole-painting parity remains zero; no overall completion
percentage is defensible. See [v11 intervention evidence]
(introspection/evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v11-20261014.json),
[v12 intervention evidence]
(introspection/evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v12-20261014.json),
[screen-unit findings](introspection/screen-unit-context.md), and the
[evidence index](introspection/evidence/README.md).

## 2026-10-14 PICK return intervention to a different value

A complete source-bound observer targeted the first PICK in seed-1234 unit 2
at measured 768×1080. It preserved the natural `PICK(33,34,35)` result 34 and
its nested `RAN(0,2)` index 1, then changed only the caller-visible result to
33 while `PREVDEX=35`. Before the next PICK, the captured HDEX event was 33
at call 965 / writer ordinal 804, matching the candidate's opposite-side
prediction. The v11/v12 equality-side cases and this intervention together
support both observed sides for this one seed and canvas; they do not establish
a general rule, direct Lisp caller, independent-seed behavior, or JS contract.

The observer's 50,000-call writer prefix covers the selected unit's 12 writer
calls, although the full tape contains 100,029 calls. A complete no-probe
control from the immediate v13 preflight was reused as the before leg and
cross-checked against a fresh after control: six outputs and ten ordinary
staged sources match. The observer's AA0 and image differ intentionally;
image ID is unchanged. Function/contract totals remain 31/32, milestones
remain 1/5 (20% by count), and whole-painting parity remains zero. See the
[v13 evidence](introspection/evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v13-20261014.json),
[screen-unit findings](introspection/screen-unit-context.md), and
[evidence index](introspection/evidence/README.md).

## 2026-10-14 independent-seed shifted-triple observation

A fresh seed-5678 v6 triplet selected post-`RPARSE` unit 6 at measured
768×1080. It passed with six matching control outputs, seven matching
ordinary staged sources, and complete source-bound `INSTALL`, `READY`,
`COMPLETE`, and `END` evidence. The selected 87-point path replays 284 bytes;
all prior accepted samples plus this one total 1,121 bytes across seven units.

The unit contains three natural `PICK(33,34,35)` calls: returns 34, 34, 33;
nested `RAN(0,2)` indices 1, 1, 0; and `PREVDEX` at those random entries
35, 34, 34. `HDEX=34` follows the first differing result at writer ordinal
3035; the equal second result has no HDEX before the next PICK; `HDEX=33`
follows the third differing result at ordinal 3097. The exact selected writer
interval lies within the observer tape's first 50,000 of 100,820 calls. This
supports the same observational relationship at a different seed and shifted
argument list, but it is not a holdout for the existing analyzer, which is
restricted to `(27,28,29)` and seed 1234. Treat it as an extension hypothesis.
The evidence file is
[`screen-unit-context-seed5678-unit6-20261014-v2.json`](introspection/evidence/screen-unit-context-seed5678-unit6-20261014-v2.json).

The seed-1234 v14 treatment was stopped before the observer because its fresh
control measured 768×1080 instead of the required 320×480. No setting changed.
The v15 seed-5678 unit-6 treatment preserved the natural second-PICK random
draw and substituted caller-visible 35 for 34=`PREVDEX`. Exactly one
`HDEX=35` write followed before the next PICK. V16 targeted the terminal
third PICK: its natural return 33 differed from `PREVDEX=34`; the preserved
random result was 0, and substituting caller-visible 34 was followed by no
HDEX write before unit end. Both complete source-bound fresh triplets measured
768×1080, match all six control outputs, and match seven ordinary staged Lisp
sources. The two interventions complete the equality/difference pair for
seed-5678's shifted triple. Together with v11/v13, the candidate matches four
controlled interventions across two seeds. This remains bounded evidence,
not a general rule, direct-caller proof, JS contract, or parity. See the
[v15 evidence](introspection/evidence/pick-prevdex-return-intervention-seed5678-unit6-768x1080-v15-20261014.json),
[v16 evidence](introspection/evidence/pick-prevdex-return-intervention-seed5678-unit6-768x1080-v16-20261014.json),
and [screen-unit findings](introspection/screen-unit-context.md).

The PICK-entry continuation object was captured in a matched-runner, source-bound
768×1080 triplet. The live process was stopped at PICK entry; the bytes at
`0x1fe4c07c` are `FF 57 27`, match the same PLL offset, and entry-seeded REA
disassembly confirms `CALL [EDI+0x27]` followed by `MOV EDX,EAX` at the
continuation matching the saved stack value. A later 320×480 source-bound method census matched the full
live method payload to that same object and identified it as
`SELECT-SUBJECT` method `(EQL PREMIUM)`. REA's targeted query still reports
the computed callee unresolved. See [PICK caller findings](introspection/pick-native-caller.md),
[method identity](introspection/select-subject-methods.md), and
[portable evidence](introspection/evidence/select-subject-method-identity-20261014-v2.json).

The current generator is therefore a useful partial implementation and
research harness, **not yet ready as a general reproduction of AARON**. A
completion percentage will become meaningful after each function has a
consistent status (unmeasured, bounded, partial, or complete) and whole-scene
criteria are weighted. Until then, this page will report counts and concrete
exit conditions rather than imply precision we do not have.

## 2026-10-14 PICK-entry return-site association

The first natural `PICK` entry in a complete source-bound seed-1234
writer-stream observer had saved stack value `0x1fe4c07f`. Its matched-runner triplet
has complete 768×1080 before/observer/after runs; six compared outputs and six
ordinary staged scene sources match across all three. The observer report has
the required complete probe footer.

The saved stack value lies outside the 11 named function bodies that were matched to
both the indexed PLL and live code. Those matches share runtime/PLL base
`0x1fba0000`. The stack value maps to offset 203 of one anonymous 362-byte
payload inside a 366-byte indexed compiled object at PLL offset `0x2abfb0`.
While the process was
stopped at PICK entry, the helper read `FF 57 27` at `returnAddress - 3` and
confirmed those bytes against the address-translated PLL. Entry-seeded
REA/Ghidra disassembly of the exact payload confirms this boundary as
`CALL [EDI+0x27]`, followed by `MOV EDX,EAX` at the continuation. This
identifies the immediate compiled object and instruction boundary, but does
not establish that the CALL transferred directly to PICK, resolve its Lisp
function name or computed call target, or live-match the full anonymous
payload in that original capture.

REA 6.4.0 / Ghidra 12.1.4 reports seven unresolved computed calls in the PICK
body. The later method census matched the complete 362-byte live payload to
`SELECT-SUBJECT`'s method specialized on `PREMIUM`, associating the saved
PICK-entry stack value with that method's continuation site. In that earlier
PICK-entry-only capture, the CPU destination was not observed; the site remains
an indirect computed call with no statically resolved callee. The later
destination and bounded PICK-entry correlation are documented below. The
detailed findings are in
[the PICK caller report](introspection/pick-native-caller.md),
[the method identity report](introspection/select-subject-methods.md), and
[the portable identity evidence](introspection/evidence/select-subject-method-identity-20261014-v2.json).

## 2026-10-14 SELECT-SUBJECT method identity

A new read-only CLOS census in a complete source-bound 320×480 triplet found
two `SELECT-SUBJECT` methods: `(EQL FREE)` and `(EQL PREMIUM)`. Both compiled
method functions were captured from live memory and matched to unique complete
objects in the indexed PLL. The `PREMIUM` method's payload and object hashes
equal the anonymous object from the separate 768×1080 PICK-entry capture; the
saved stack value/call-site offsets are 203/200 in that method payload. All six
drawing/scene outputs and six ordinary staged sources match across the new
before/observer/after triplet. REA confirms the callsite instruction but
leaves its computed target unresolved. This associates one PICK-entry stack
value with a method continuation site; it proves neither a direct CPU edge nor
a general call graph, behavior contract, or parity result; counts remain
31 routine names / 32 bounded contracts, 1/5 milestones, and zero
whole-painting parity. See
[method findings](introspection/select-subject-methods.md) and
[portable evidence](introspection/evidence/select-subject-method-identity-20261014-v2.json).

The strict evidence check rejected an initial mixed-runner triplet: its
controls used the legacy runner, while the observer used the required-probe
runner. A fresh before/observer/after triplet with one required-probe runner
hash passed and supplies the linked evidence.

No coverage counts change: 31 routine names / 32 bounded contracts, 1/5
milestones (20% by count), and zero whole-painting parity. There is still no
defensible overall completion percentage.

The strict caller evidence check rejected the first mixed-runner triplet: its
no-probe controls used the legacy runner, while the observer used the
required-probe runner. Fresh controls and a second observer were then captured
with the same required-probe runner hash; only that matched triplet is used in
the portable result.

## 2026-10-14 controlled PICK arity extension

A fresh source-bound `PICK` probe exercised explicit two- and four-argument
calls, with 16 seeds per arity (32 rows total). Every argument was a positive,
distinct fixnum. For each row, the original return and following random value
match selection by one `RAN(0,n-1)` draw; the JavaScript adapter matches all
32 original rows. The two-argument set observed both selectable indices, and
the four-argument set observed all four.

The result expands the bounded explicit-call envelope of the existing `PICK`
contract. It does not add a function name or contract unit, establish natural
caller arities, characterize other types or argument ranges, or prove drawing
parity. The matched before/observer/after controls agree on all six compared
drawing/scene outputs; the evidence derivation also checks the staged source
hashes, runner/runtime identity, probe/report hashes, random-state behavior,
and exact JS results. Re-derive with
[`derive-pick-contract-arities-evidence.mjs`](tools/derive-pick-contract-arities-evidence.mjs)
from the three retained run roots recorded in the evidence JSON. See the
[probe](introspection/pick-contract-arities-v1.cl) and
[portable evidence](introspection/evidence/pick-contract-arities-seed1234-20261014.json).

A separate natural `SELECT-SUBJECT` observer in the 320×480 regime recorded
zero calls. Its six drawing/scene outputs and six ordinary staged source files
match the fresh controls. The wrapped planning trace differs in the observer
because wrapping `MAIN` changes its diagnostic type, so that trace is treated
as observer-only. This is a bounded no-hit and does not characterize either
method, identify the direct caller in this regime, or generalize to 768×1080.

## 2026-10-14 REA-guided FREE-PATH indirect-call capture

REA 6.4.0 / Ghidra 12.1.4 identified `FREE-PATH+0x39a` and `+0x3e4` as
computed `CALL dword ptr [EDI+0x27]` sites and `+0x3ac` as the intervening
conditional branch. A fresh source-bound 768×1080 seed-1234 triplet passed its
runner, source, observer-footer, and control checks. The live observer hit
`+0x3e4` first and `+0x39a` second, then the target exited before `+0x3ac`.
At both calls, the raw slot value was `0x20000983`, with the same 16-byte
memory preview. It was not identified as a named function or ABI. The static
value trace shows the `+0x39a` result flowing through EAX to the comparison
and branch; it does not resolve either dynamic target or associate the two
live hits with one invocation.

Five drawing/scene artifacts, six staged Lisp sources, and the uninstrumented
before/after planning traces match. This adds no function or contract: counts
remain 31 names / 32 bounded contracts, 1/5 milestones (20% by count), and
zero whole-painting parity. The [FREE-PATH findings](introspection/free-path-native.md#bounded-live-reads-of-indirect-call-sites-2026-10-14)
and [portable evidence](introspection/evidence/free-path-callsite-v1-20261014-084337-07112bc0-v2.json)
record the bounded result. The original follow-up, an independent single-edge
FREE-PATH holdout, is now complete in [v11](introspection/evidence/free-path-stop-boundary-20261014-v11-456069.json).

## 2026-10-14 complete SELECT-SUBJECT static call-target census

REA 6.4.0 / Ghidra 12.1.4 queried all 36 CALL instructions across the FREE
and PREMIUM `SELECT-SUBJECT` method payloads: 17 and 19 sites respectively.
Every per-site query is bound to the exact method-specific synthetic PE and
seed; raw and normalized results agree. All 36 return
`status=unresolved`, `mechanism=computed`, with no static targets. The PEs were
analyzed statically and never executed. This closes the static query census,
but does not recover runtime targets, Lisp callees, the call ABI, or a general
call graph. The PREMIUM method return site associated with the observed PICK
entry remains a bounded single-entry runtime result, not a proven direct
transfer or general caller map.

The portable evidence is
[`select-subject-call-census-20261014-v1.json`](introspection/evidence/select-subject-call-census-20261014-v1.json),
rebuilt by
[`derive-select-subject-call-census-evidence.mjs`](tools/derive-select-subject-call-census-evidence.mjs).
The next live observation is gated on a fresh before/observer/after triplet,
source binding, exact current bytes, and matching drawing/scene controls.
It adds no routine or behavior-contract count.

## 2026-10-14 PREMIUM callsite and destination breakpoint

The accepted 768×1080 source-bound triplet is
`pick-dispatch-v3-20261014-103044-d699903f`. All three oracle summaries are
complete. The five compared drawing/scene artifacts (AA0, image, image ID,
scene snapshot, and loaded seed), six staged Lisp sources, and uninstrumented
before/after planning traces match. The observer's probe has the required
BEGIN, SUMMARY, READY, release, and END records, and its helper exited zero.

The earlier PICK-entry sample linked saved stack value `0x1fe4c07f` to the
PREMIUM method's return instruction but could not establish the CALL operand.
A separate fresh source-bound triplet has now measured that operand and the
actual CPU destination. At the mapped method's offset 200, the live bytes
were `FF 57 27`; pre-call `[EDI+0x27]` contained `83 09 00 20` (`0x20000983`).
A DR0 execute breakpoint stopped the same thread at EIP `0x20000983` before
the first destination instruction. ESP decreased by four and `[ESP]` was
`0x1fe4c07f` (`callsite+3`). This accepts the destination capture through an
independent B0 breakpoint; it does not weaken or change the rejected v1
DR6.BS single-step gate.

The three 768×1080 runs completed. The five drawing/scene artifacts, six
staged sources, and planning traces match, as do runner/runtime identities.
Debug registers were restored, the helper detached, the READY pause released,
and no cleanup errors were reported. The target differs from the named PICK
entry `0x1fe00e8c`, so this establishes the direct destination of the
indirect CALL but not a direct CPU edge to PICK or the subsequent dispatch
path.

REA/Ghidra inspected the exact 32-byte target window. Eight queried starts
cover 22 bytes; zero functions were created. The region was reported as
`MEM_MAPPED`/`PAGE_READWRITE`, and the bytes did not match the captured PLL
exactly. The conditional branch inside the window and jump outside it remain
static candidates only. The Lisp name, function boundary, ABI, and behavior
remain unknown. See [portable capture evidence](introspection/evidence/premium-callsite-destination-breakpoint-20261014-v1.json),
[REA evidence](introspection/evidence/premium-callsite-destination-window-rea-20261014-v1.json),
and the [method findings](introspection/select-subject-methods.md#premium-call-destination-captured-with-a-separate-dr0-breakpoint-2026-10-14).

## 2026-10-14 PREMIUM destination-to-PICK correlation

A follow-up fresh source-bound 768×1080 triplet armed a DR0 execute breakpoint
at the current PICK entry and a DR1 guard at the measured PREMIUM call's
`callSite+3` continuation. The same thread hit PICK first. At that first
instruction, EIP was `0x1fe00e8c`; ESP, EBP comparison, and `[ESP]` matched the
earlier `0x20000983` destination observation, with `[ESP]=0x1fe4c07f`. The
continuation guard had not fired. All three runs completed; five
drawing/scene artifacts, six staged sources, and the planning traces matched.
Debugger state was restored and the observer detached without cleanup errors.

The correlation does not capture the instructions between `0x20000983` and
PICK or prove a direct edge; the intermediate transfer and anonymous target
identity remain unresolved. Matching frame markers reduce ambiguity but do
not exclude every form of stack reuse or unobserved transfer. REA's previous
bounded static analysis still has no recovered function boundary. This adds
no routine or contract: 31 names / 32 bounded contracts, 1/5 milestones
(20% by count), and zero whole-painting parity. See the [portable evidence](introspection/evidence/premium-callsite-pick-correlation-20261014-v1.json),
[deriver](tools/derive-premium-callsite-pick-correlation-evidence.mjs), and
[method findings](introspection/select-subject-methods.md#premium-call-destination-and-pick-entry-correlation-2026-10-14).

The accepted follow-up is triplet
`premium-pick-v3-20261014-125028-65b3a9cc`. Its three completed source-bound
roots were compared offline after a Windows PowerShell 5.1 serialization issue
stopped only the coordinator. The portable evidence rebuild produced the same
SHA-256 on consecutive runs; no AARON rerun was needed. The plain-string fix
and offline recovery command are documented in
[tooling quick fixes](tooling-workarounds.md#premium-triplet-comparison-exhausted-memory-after-all-runs-2026-10-14).

The wider source-bound live read is complete. Triplet
`premium-v2-20261014e-20261014-170512-b228b66c` rediscovered the destination
and captured 256 bytes at `0x20000903–0x20000a02`, with matching controls.
REA decoded `CALL [EDI+0x35f]` at `0x2000091a` and `JMP [ESI+0x12]` at
`0x200009a4`; the bytes at `0x20000993` are `EB 85`, a relative branch to the
callsite, despite conflicting provider flow metadata. These remain static
candidates, not observed edges. The constant-slot scan found a `PICK` symbol
reference but no function-valued constant.

Two orthogonal methods were assessed. The Lisp PICK-witness v3 observer failed
its completion gates: the before-control passed, but the observer image was
empty, no after-control ran, and its witness had no entry/call/footer rows. The
scene report wrote END and later MAIN-ERROR, but the planning trace cap prevents
pairing those events to one invocation; runtime callback status was not logged.
This establishes neither a PICK hit nor a no-hit. WPR's GPU profile enables
system-call and graphics providers, but its listed stack events omit syscall
entry/exit stackwalks and it cannot show the internal Lisp operand or caller.
No WPR recording was made for this question. The next experiment is therefore
a distinct no-TF hardware execute-breakpoint capture at fresh, byte-validated
REA candidates, with same-thread operand/stack checks and original debug-state
restoration. Keep the 31-name / 32-contract counts, 1/5 milestone count, and
zero full-painting parity unchanged. See the [REA window evidence](introspection/evidence/premium-callsite-wide-window-rea-20261014-v3.json),
[tooling diagnosis](tooling-workarounds.md#premium-pick-witness-v3-had-no-footer-2026-10-14),
and [active execution plan](execution-plan.md).

## 2026-10-15 PREMIUM internal-transfer window rejection

The fresh `prem-internal-1015c-20261014-234038-b80a2004` attempt completed its
before control and reached the expected outer callsite, but its observer
rejected the 256-byte window hash before arming internal breakpoints. No
completed observer AA0/scene `END` or after control exists, so this is not an
accepted triplet. The captured bytes differ from both the accepted sample and
an earlier rejected sample; the changes avoid the three instruction spans
decoded by REA, but their cause is unknown. Do not label them relocations or
benign data. REA/Ghidra decoded the exact rejected bytes in an unexecuted
synthetic PE; this yielded static instruction decodes only. Frida's successful
32-bit fixture is separate; the later source-bound AARON attach attempts failed
as documented below. The 31-name / 32-contract counts, 1/5 milestone count,
and zero whole-painting parity remain unchanged. See the [portable evidence](introspection/evidence/premium-internal-transfer-window-variant-20261015.json),
[finding](introspection/premium-internal-transfer-window-variant-20261015.md),
and [Frida fixture result](tooling/frida-stalker-x86-smoke-20261015.md).

## 2026-10-15 Frida AARON attach crash

Two fresh source-bound observer attempts reached READY and mapped the current
PREMIUM/PICK objects, then crashed `AARON.exe` in the same x86 `frida-agent.dll`
before its script loaded or the hook armed. Windows Application Error records
13978 and 13980 report exception `0xc0000409` at offset `0x00c0df07`; the
agent image hash matches across both runs. Neither attempt completed a scene,
AA0, report END, or after-control. This is a repeatable instrumentation failure,
not caller or behavior evidence. Stop using this Frida agent/runtime
combination and continue through the REA-targeted no-TF native path. The
function/contract counts, 1/5 milestone count, and whole-painting parity remain
unchanged. See the [portable crash evidence](introspection/evidence/frida-aaron-injection-crash-20261015.json),
[tooling workaround](tooling-workarounds.md#frida-agent-crashes-aaron-before-the-script-loads-2026-10-15),
and [active execution plan](execution-plan.md).

## Links

- [Current continuity handoff](aaron-continuity.md)
- [Active execution plan](execution-plan.md)
- [Ten-phase research roadmap](reverse-engineering-plan.md#phase-status)
- [Local tooling quick fixes](tooling-workarounds.md)
