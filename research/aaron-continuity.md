# AARON project continuity handoff

For a short count-based status snapshot, see the repository's
[AARON progress report](../progress-report.md). The
[detailed progress log](progress-report.md) distinguishes the 1,347-name symbol
inventory from the smaller set of measured function contracts.

This file is the short resumption record for future Aaron conversations and
agents. The full technical roadmap remains in
[`reverse-engineering-plan.md`](reverse-engineering-plan.md); this file keeps
the current state, constraints, and next move easy to find after a
conversation boundary.

## Latest checkpoint: 2026-10-14

The first natural FREE-PATH caller is captured in a complete source-bound
320×480 triplet: it returns to `DRAW-CFORM+0x167`, immediately after computed
`CALL EDI` at `+0x165`. The dynamic target and broader call graph remain
unresolved. Controlled v8 and v9 triplets then measured the same vertical
0.2 single-float edge at seeds 150415 and 46380. Both original runs selected
14 steps and consumed 12; JS consumed 13 in each. The local step-sum candidate
predicts 13/13, source-to-emitted predicts 13/12, and step-times-wiggle
predicts 12/12. Only the last matches both observed counts, but these are
finite local replays, not a recovered general rule. The captures used 320×480
and 768×1080 scenes respectively. Across nine isolated one-edge cases, JS
matches four and differs by one step in five. The canonical matrix remains
26/30 matches, 4 mismatches, 10 unclassified. Counts are now 31 routine names /
32 bounded contracts, 1/5 milestones (20% by count), and zero whole-painting
parity. See [v8 evidence](introspection/evidence/free-path-stop-boundary-20261014-v8.json),
[v9 evidence](introspection/evidence/free-path-stop-boundary-20261014-v9.json),
[FREE-PATH findings](introspection/free-path-native.md), and the active
[execution plan](execution-plan.md).

Seven complete source-bound screen-unit context triplets now cover seed-1234
units 1, 2, 3, 5, and 6 plus seed-5678 units 1 and 6. The first six are
320×480; seed-5678 unit 6 is 768×1080. Their selected paths and color events
replay 1,121 original writer bytes. Units 2, 3, 5, and 6 for seed 1234 contain
12 natural `PICK(27,28,29)` calls; the offline candidate fits all 12, but all
four units are from the same painting. The separate seed-5678 unit-6 sample
uses `(33,34,35)` and follows the same three-call relationship with
`PREVDEX`/HDEX. Because the existing analyzer is restricted to `(27,28,29)`,
this is evidence for a shifted-triple extension, not an independent-seed
holdout of the existing candidate. Neither set establishes a direct source
call, exact native state slot, general color rule, or JS contract. A separate
controlled triplet tested `PICK(27,28,29)` at 16 seeds; all three positions
occur, each return matches one `RAN(0,2)` draw, the next random value matches
one-draw state, and the JS adapter matches 16/16. This does not explain the
screen color decision. Counts remain 31 routine names / 32 bounded contracts;
milestone progress and whole-painting parity remain unchanged. See the
[screen-unit findings](introspection/screen-unit-context.md),
[seed-5678 unit-6 evidence](introspection/evidence/screen-unit-context-seed5678-unit6-20261014-v2.json),
[12-case candidate report](introspection/evidence/pick-prevdex-natural-candidate-units2-3-5-6-20261014-v2.json), and
[controlled PICK evidence](introspection/evidence/pick-contract-three-args-seed1234-20261014.json).

Two source-bound seed-1234 unit-2 interventions at measured 768×1080 changed
the first and second selected PICK results to `PREVDEX`, preserving each
nested `RAN(0,2)` draw. Neither was followed by an HDEX write. A third
intervention changed the first natural return 34 to caller-visible 33 while
`PREVDEX=35`; the random index 1 was preserved and `HDEX=33` followed before
the next PICK. These bounded cases still do not establish a general rule.

The v14 seed-1234 unit-6 intervention was stopped at its required canvas gate:
the fresh control measured 768×1080 rather than 320×480. No observer ran and
no display setting changed. The fixed seed-5678 writer overlay now preserves
allowlisted focused targets; the capture helper distinguishes a missing PICK
installation record from a runtime unbound-function result. The corrected v6
triplet completed with six matching outputs and seven ordinary Lisp sources.
See [tooling workarounds](tooling-workarounds.md).

The v15/v16 source-bound treatments tested both sides of the shifted triple in
seed-5678 unit 6 at 768×1080. V15 targeted the second natural
`PICK(33,34,35)`, returned 34 with `PREVDEX=34`, and nested `RAN(0,2)=1`;
substituting caller-visible 35 produced one `HDEX=35` before the next PICK.
V16 targeted the terminal third PICK, returned 33 with `PREVDEX=34`, and
nested `RAN(0,2)=0`; substituting caller-visible 34 produced no HDEX write
through unit end. Both fresh controls match all six compared outputs, and
seven ordinary Lisp sources match. The selected intervals cover 90/88 writer
calls and 291/277 bytes; each is within its observer's 50,000-call tape
prefix (100,821/100,819 calls total). Together with v11/v13, the candidate
matches four controlled return interventions across two seeds. This remains
bounded evidence: no direct caller, general color rule, JS behavior contract,
or parity claim. See the [v15 evidence](introspection/evidence/pick-prevdex-return-intervention-seed5678-unit6-768x1080-v15-20261014.json),
[v16 evidence](introspection/evidence/pick-prevdex-return-intervention-seed5678-unit6-768x1080-v16-20261014.json),
[screen-unit findings](introspection/screen-unit-context.md), and
[tooling workarounds](tooling-workarounds.md).

The first natural `PICK` return came from the source-bound 768×1080
seed-1234 triplet. Its return address `0x1fe4c07f` and live call bytes
`FF 57 27` mapped to offset 203 in a 362-byte compiled object. A later
read-only CLOS census in a separate source-bound 320×480 triplet captured
both `SELECT-SUBJECT` methods and matched their complete live windows to
unique PLL objects. The `(EQL PREMIUM)` method's full payload and object
hashes match the earlier object, resolving the direct caller for that
captured `PICK` entry. REA confirms `CALL [EDI+0x27]`, followed by
`MOV EDX,EAX`, but leaves the computed target unresolved. The census did not
invoke either method or measure its result and side effects. See the
[caller findings](introspection/pick-native-caller.md),
[method identity](introspection/select-subject-methods.md), and
[portable evidence](introspection/evidence/select-subject-method-identity-20261014-v2.json).

Next, inspect the captured native bodies for both methods and design a
bounded read-only probe of their outputs and observable state effects. Keep
the FREE and PREMIUM cases separate, retain fresh same-runner controls, and
do not turn one captured caller into a general call graph or behavior rule.

This adds no JS behavior contract: coverage remains 31 routine names / 32
bounded contracts, 1/5 milestones (20% by count), and zero whole-painting
parity. No overall completion percentage is justified.

For local REA/Java, oracle, and Git permission recovery, start with the
[tooling quick fixes](tooling-workarounds.md). Use the saved REA launcher and
scoped elevation recipes there; do not rediscover these setup issues each
session.

REA main has been fetched and the published 6.4.0 release installed beside
3.2.1. The Ghidra doctor and real x86 launcher inspection pass. Headerless raw
inputs remain unsupported, but exact ZERO-EDGE, BRUSH-FILL, FILL-IRIS,
BRUSH-STROKE and BUFFER-HOLE PLL payloads now have successful REA dossiers
through generated static x86 PE containers. See [the payload guide](introspection/rea-payload-analysis.md) and
[the update record](rea-update-20261011.md).
Use ignored `toolchain-current.json` for new REA work and retain the frozen
historical `toolchain.json` for existing evidence. The hourly automation is
confirmed absent; continuation is manual.

Latest ZERO-EDGE step: the source-bound constant census found one static
symbol reference in `BUFFER-HOLE` (constant 1). A follow-up hardware
breakpoint attempt validated both live payloads against the PLL but saw no
ZERO-EDGE entry before the process ended in the measured 320x480 writer-stream
scene. The runner session lasted 32.837 seconds; 150 seconds was the helper's
maximum, not the observed wait. Fresh uninstrumented controls match six outputs
and six scene sources.
The candidate caller remains unconfirmed; the no-hit does not generalize to
other canvases. See the [census dossier](introspection/zero-edge-native-links.md),
[caller findings](introspection/zero-edge-native-caller.md), and
[portable evidence](introspection/evidence/zero-edge-native-caller-20261013.json).
No JS contract count changed: 30 routine names / 31 bounded contract units,
1 of 5 milestones (20%), and 0 whole-painting parity results.

REA's BUFFER-HOLE dossier records a 465-byte inferred body, 170 instructions,
39 blocks, and an unresolved computed call at `0x1fe12d17`. A follow-up live
entry breakpoint for BUFFER-HOLE also saw no entry in the current 320x480
writer-stream process; both live payloads were revalidated against the PLL.
Fresh before/after controls match all six outputs and six scene sources. The
combined static/runtime evidence is byte-identical across two derivations.
The older 768x1080 scene remains unexplained despite matching mode and runner
hashes. See [BUFFER-HOLE findings](introspection/zero-edge-native-caller.md)
and [combined evidence](introspection/evidence/buffer-hole-native-investigation-20261013.json).

Canvas-size continuation: a complete current 768x1080 observer is bracketed
by fresh same-mode controls; six drawing/scene outputs and six staged scene
sources match across all three. The earlier complete 320x480 triplet has been
revalidated against its 75-source closure. Both regimes enter
SET-UP-SCREEN-SIZE with 640x480 globals; the first wrapped boundary difference
appears at its exit, and SELECT-CANVAS receives ACLWIN::SQUARE in both. The
reason is still unknown. Current REA 6.4 results decode the exact 1,140-byte
and 462-byte bodies but leave indirect dispatch targets unresolved. No JS
contract count changed. See [canvas findings](introspection/canvas-dimensions.md)
and [portable evidence](introspection/evidence/canvas-size-native-links-20261013.json).

A fresh uninstrumented recheck for the planned 768x1080 ZERO-EDGE caller
capture completed at 320x480 and matched the prior 320 control across all six
outputs and six staged sources. The 768-specific breakpoint was not armed.
The run ID contains `768` but is not a dimension measurement; see the current
recheck details in the canvas findings. The larger regime remains a valid
separate observation but was not reproducible in that run. At that historical
checkpoint, the next probe was the FREE-PATH boundary question in the repeatable
320x480 context. The later 768x1080 captures below supersede that next-step
note. Retry the ZERO-EDGE caller only after a fresh control measures 768x1080.

Later that day, the complete FREE-PATH boundary triplet again measured
768x1080. Its source-bound post-MAIN matrix contains 40 direct cases over
seeds 1 and 1234; the uninstrumented controls match all six drawing/scene
outputs and six ordinary Lisp sources. This supersedes the prior statement
that 320x480 is the latest observed regime, but does not invalidate that
separate 320 capture. The current dimensions must be read from each AA0 header.
The offline comparison validates the exact source-bound 40-case report and
compares the 30 canonical, sign-preserving inputs supported by the current JS
API. Twenty-six rows match across the full RAN trace, returned points, next
random checkpoint, and input immutability; four seed-1234 polygon rows differ.
Eight noncanonical index cases and two cases with a lost negative-zero sign
remain unclassified. This adds no general function contract: the 30 routine
names / 31 bounded contracts, 1-of-5 milestone count, and zero whole-painting
parity are unchanged. See [FREE-PATH boundary findings](introspection/free-path-boundaries.md),
[portable comparison](introspection/evidence/free-path-boundary-js-comparison-20261013.json), and
[portable source evidence](introspection/evidence/free-path-boundaries-20261013.json).

A newer source-bound post-MAIN triplet isolated three length-10 forward edges
at 768x1080. Fresh controls match all six drawing/scene outputs and six staged
sources. JavaScript matches seed 256819 exactly, but stops one iteration early
for seed 522862 and one iteration late for seed 348048. The step-sum and
emitted-point-distance candidates match different cases; neither gives a
general stop rule, and the function's internal progress variable was not
observed. This does not add a new JS contract unit: totals remain 30 routine
names / 31 bounded contract units, 1 of 5 milestones (20%), and 0
whole-painting parity results. See the [updated findings](introspection/free-path-boundaries.md),
[portable v2 evidence](introspection/evidence/free-path-stop-boundary-20261013-v2.json),
and the [reusable Lisp scope check](tools/check-lisp-probe-scope.mjs).

The v4 seed-521814 discriminator now completes in a source-bound 320x480
before/observer/after triplet. The first successful traced STORE-IN-FILE exit
at depth 7 triggers one controlled edge case: original consumes 12 of 14
selected steps; JS consumes 13, so JS remains mismatched. The bare-wiggle
candidate predicts 12 here; step-sum and source-to-emitted-point predict 13.
This does not establish a general stop rule or natural caller. The five
drawing/scene outputs and six ordinary staged Lisp sources match controls; the
observer's planning trace differs because its extra targets are diagnostic.
Read [v4 evidence](introspection/evidence/free-path-stop-boundary-20261013-v4.json),
[findings](introspection/free-path-native.md), and the serial
[capture helper](tools/capture-free-path-stop-boundary-v4.ps1). Counts remain 30 routine
names / 31 bounded contracts, 1 of 5 milestones (20%), and 0 full-painting
parity results.

The v6 seed-79481 length-2 triplet is complete and byte-checked against fresh
controls. Original and JS both consume 11 of 13 selected steps, return 14
points, and leave next RNG value 53424; all 34 random calls and returned points
match. Step-sum, bare-wiggle, and step-times-wiggle predict 11, while
source-to-emitted-point predicts 12. This rejects one candidate for this input
only and leaves the general stop rule unresolved. Before v7, across six
isolated one-edge cases JS matched three and differed by one step in three.
The reproducible candidate scan over 200,000 seeds at lengths 2, 5, 10, 20,
and 40 found no case with four distinct uncapped predictions. See [v6
evidence](introspection/evidence/free-path-stop-boundary-20261013-v6.json),
[findings](introspection/free-path-native.md), [seed finder](tools/find-free-path-stop-model-seeds.mjs),
and the serial [capture helper](tools/capture-free-path-stop-boundary-v6.ps1).

The v7 seed-388 length-0.2 single-float triplet completes in 768×1080 and
matches single-precision JS exactly: 8 of 9 selected steps, 11 returned
points, 25 random calls, and next RNG value 15573. Step-sum,
source-to-emitted-point, and step-times-wiggle predict 8; bare-wiggle predicts
7. This rejects bare-wiggle for this input only and leaves three candidates
tied. Seven isolated one-edge cases now contain four JS matches and three
one-step mismatches. See [v7 evidence](introspection/evidence/free-path-stop-boundary-20261013-v7.json)
and [findings](introspection/free-path-native.md). Counts remain 30 routine
names / 31 bounded contracts, 1 of 5 milestones (20%), and 0 whole-painting
parity.

The exact `FREE-PATH` and `DRAW-CFORM` payloads are now mapped for a natural
caller capture. The first 2026-10-13 before/observer/after attempt completed
only its uninstrumented 320×480 before control; the observer never started
because the D: staging reserve had fallen to 25.2 MiB. No call stack or caller
was captured, and there is no after control. The driver now reserves space for
the complete three-run bracket before launch and checks each remaining leg.
Retry it only when the documented 35.7 MiB starting reserve for this exact
26 MiB writer-stream mode is available. Keep the observed stop-rule mismatches
unresolved until a new source-bound discriminator distinguishes the remaining
behavior; do not infer callers from adjacent trace events.

FOOB now matches every result in two complete captures: each repeats 188,081
integer pairs and 324 single/double-float pairs, plus 166,072 natural calls in
total. T means outside `0 <= X <= *PIC-WIDE*-1` and
`0 <= Y <= *PIC-HIGH*-1`; fractional coordinates beyond the last integer
pixel are outside. The measured dimensions are 320x480. Read
[the FOOB findings](introspection/foob.md) and
[portable evidence](introspection/evidence/foob-parity-20261006.json).
Both drawings/scenes equal fresh controls. Full matrix map copies, map and
BRUSH/SUB-FRAME identities and three-value copied RNG previews are unchanged;
this is not a full RNG-state proof or a direct-caller capture.
Frozen roots are foob-capture-seed1234-20261006-a / seed5678-20261006-c,
with controls foob-capture-control-seed1234-20261006-b / seed5678-20261006-d.
At that earlier checkpoint the next item was an explicit ZERO-EDGE capture.
The canvas difference is now bounded at the SET-UP-SCREEN-SIZE and
SELECT-CANVAS boundaries but remains unexplained. A fresh control at that
checkpoint reproduced 320x480; the later 768x1080 FREE-PATH triplet is recorded
above. Retry the ZERO-EDGE caller only after a fresh control for that caller
measures 768x1080. Full scene generation and general VALUE=0 painter behavior
remain open.

### ZERO-EDGE holdout and JavaScript model, 2026-10-12

The 39-case follow-up completes in base t/ring u with fresh controls s/v.
All four drawing/scene output files and all 12 runtime files match among
the four runs. Original map/binding checks pass and copied previews remain
(59,29,74). The strict portable evidence derives byte-identically in two
independent executions with all 403 sources and the prior 285/native56
closures revalidated. Read [the holdout findings](introspection/zero-edge-holdout.md)
and [portable evidence](introspection/evidence/zero-edge-holdout-20261012.json).

The holdout measures six map dimensions, relocated starts, a first-neighbor
value change, and PERIM 18/19/20 on a 9x11 zero rectangle ring. At direction
0, PERIM 18 returns NIL and 19/20 return proper 21-point lists; START.Z
becomes 4 in all three. Direction 2 returns NIL and changes START.Z to 0
at all three budgets. These are recorded outcomes, not intermediate traces.
No scratch cell changes in the 39 cases.

`engine/src/aaron-zero-edge.js` now computes the observed outputs from the
supplied map, START and PERIM. All 199 matrix/holdout cases match in JS:
511 returned points, 95 lists, 104 NILs and 61 START mutations. Successful
JS Arrays retain the supplied START object at their tail; new points have
distinct identities. The map remains unchanged. Use
`research/tools/compare-zero-edge-evidence.mjs` on the two portable files
for a direct repeat. Guard bounds are adapter policy; wider maps/budgets,
natural caller context, native cons representation and complete RNG purity
remain open. The generator does not yet invoke this helper.

The deeper REA pass completes: all three instruction sequences match the
older raw Ghidra reports. The dossiers add 79/121/92 CFG blocks and
387/952/671 untruncated p-code operations for ZERO-EDGE/BRUSH-FILL/FILL-IRIS.
An actual ZERO-EDGE branch query resolves its local jump; the adjacent Lisp
dispatch query remains unresolved. Independent portable derivations match
across 70 source bindings. Generated headers, seeds and layout are analyst
assertions; these inputs were never executed. No original-source, Lisp ABI
or cross-object caller recovery is claimed.

### Natural BRUSH-FILL row/iris capture, 2026-10-12

The new frozen observer captures two current 768x1080 modes with complete
same-mode controls: seed1234 writer-stream d with controls a/e, and seed5678
natural-free-path f with controls c/g. Across 137 BRUSH-FILL calls it records
63,592 paired calls/returns with no errors, aborts, overflows, depth failures
or busy failures. The four drawing/scene outputs and all 12 runtime files
match both controls per mode. Read
[the findings](introspection/brush-fill-row-iris.md) and
[portable evidence](introspection/evidence/brush-fill-row-iris-20261012.json).

Five non-unit scan jumps land at current-frame LY-2 while the wrapped CFRAME
identity changes. Of 446 positive scans, 440 have one later same-fill
PATCH-EDGE start with matching EQ identity; six have no same-fill start. Five
FILL-IRIS calls return NIL, with unchanged captured globals and map
identities/dimensions. Two fresh executions of the deterministic deriver are
byte-identical across 196 source bindings. A separate read-only audit of both
raw tapes rechecked the scan links and controls without finding discrepancies.
Row and iris conditions, map-cell effects, and unwrapped direct callers remain
open.

### Natural BRUSH-STROKE VALUE=0 capture, 2026-10-12

The first bounded natural map capture completes in
`brush-stroke-value0-capture-20261012-b`, with fresh same-mode controls before
and after it. It records the first MULTI, EMPTY and SINGLETON VALUE=0 strokes,
90 predicate returns, and 12 complete 768x1080 map snapshots. Drawing and
scene-report bytes match all three controls. Read the
[findings](introspection/brush-stroke-value0.md) and
[portable evidence](introspection/evidence/brush-stroke-value0-20261012-v4.json).

The nine-point multi path has 81 true predicate returns and 33 changed map
cells (20 1-to-0, 13 3-to-0). The empty path still calls SCREEN-AND-STORE and
has no predicates; the singleton makes that screen call and nine true
predicates, with no net map change. A predicate-coordinate zeroing candidate
reproduces all three final maps, but no individual array stores were traced.
The separate `applyObservedNaturalBrushStrokeValue0` candidate has now been
run on those three raw maps in a second source-bound capture. The v5 run
selects its first natural MULTI VALUE=0 sample at `ALL-BRUSHES` index 5,
`WIDTH=17`: stroke 1336, 83 path points, 4,648 true predicates, and 1,575
changed cells (857 1-to-0, 718 3-to-0). Its 182-offset CORE exactly matches
the JS profile, and the candidate reproduces all three final maps and returns
the same JS path object. The test injects the captured SCREEN-RETURN fill map
into the callback, so it does not implement the screen routine or establish
scene-level parity. Read the updated [findings](introspection/brush-stroke-value0.md)
and [v5 evidence](introspection/evidence/brush-stroke-value0-20261012-index5-v5.json).

The portable v5 report binds eight code/configuration inputs, including the
map writer and engine module metadata. Independent derivations are byte-
identical at 2,567,587 bytes. The report SHA-256 is
`5dac2e2213be2178849c8fda7c845699cc13654287a0b9bec196983fae89c95d`. The
v5 observer SHA-256 is
`0253d6f67f8b0c472f5e390975025b46e54162c6b03f1f031a6c6c0f090e1771`; its
raw tape SHA-256 is
`ffb7574d216cdb1735391660246627b1581e55d85f550e70d28b617c30a31fec`.
Fresh uninstrumented controls bracket the run; all four AA0 and scene-report
files match their existing hashes. The older isolated adapter retains its
separate contract. General value-0 behavior remains open.

The v6 capture broadens the natural MULTI sample to `ALL-BRUSHES` index 4,
width 13, CORE length 97. It dynamically selected stroke 47 (29 path points)
with 2,813 true predicates and one SCREEN-AND-STORE call. The screen entry
retains the same path identity; SCREEN-AND-STORE returns NIL, while
BRUSH-STROKE returns the original path by EQ. The map stays unchanged during
the screen call and then changes 38 cells from 1 to 0 (x=587..597,
y=176..187). The JS candidate reproduces the selected stroke-return map while
using the captured predicate decisions and captured SCREEN-RETURN map; this
does not validate screen rendering or scene parity. Read the updated
[findings](introspection/brush-stroke-value0.md) and
[v6 evidence](introspection/evidence/brush-stroke-value0-20261012-index4-v6.json).

The v6 observer SHA-256 is
`4e3818e78627048e5126b107a26c66949406918c41207014382fb9dcb2c996d6`; its raw
tape SHA-256 is
`64df9e9bdff47c06fe12eb0d5e3562ed5bb5d9e0e0157f965139c37c88100821`. Three
fresh uninstrumented controls bracket the complete capture and share the
existing AA0 and scene-report hashes. Two independent portable derivations
match byte-for-byte: 1,098,095 bytes, SHA-256
`ac37cc749eea4afaacbfb2b9984168a0b0c50ecceaf4b94b8efc672e74f92580`.

### BRUSH-STROKE REA branch and call queries, 2026-10-12

REA 6.4.0 adds branch-target xrefs at archived static addresses `0x1fe436e5`
and `0x1fe436d3`, then three call-target queries at `0x1fe436de`, `0x1fe436f0`
and `0x1fe436f8`. All three are unresolved computed calls with empty target
lists. The source-bound evidence derives byte-identically twice across 49
sources, and an independent read-only audit confirmed the requests, listing,
report hashes and empty stderr files. These are static observations on the
analyst-generated PE; they establish no runtime branch or call target. Read
the [REA notes](introspection/rea-payload-analysis.md) and
[v4 evidence](introspection/evidence/rea-brush-stroke-control-flow-20261012-v4.json).

### IN-SUB-FRAME bounded predicate comparison and false-result census, 2026-10-13

REA 6.4.0 with Ghidra 12.1.4 now has a source-bound static dossier for the exact
278-byte mapped `IN-SUB-FRAME` payload: 270-byte body, 24 CFG blocks/38 edges,
93 instructions, 109 p-code operations/95 def-use edges, and 11 unresolved
indirect calls. It resolves no callers or callees. The machine code is
consistent with a two-coordinate rectangle gate. Existing natural parent
captures now compare the JS helper against 296,912 value-3 BRUSH-STROKE
predicate calls and 81,110 BUFFER-FEATURE calls, including accepted equality
edges. The measured integer behavior is an inclusive frame rectangle; direct
caller, other numeric domains, errors and Lisp ABI remain unresolved. The
report's portable derivation checks every ordered v6 predicate row and all 20
unique source bindings; independent outputs match byte-for-byte. See the
[IN-SUB-FRAME findings](introspection/in-sub-frame.md) and
[portable evidence](introspection/evidence/rea-in-sub-frame-20261012.json).

The v6 natural VALUE=0 sample has 2,813 accepted predicate calls and no
rejections. A separate v2 seed-1234 scene capture records 1,400 completed
calls: 1,176 truthy and 224 NIL; 128 false-call rows are retained, while 96
are omitted by the declared cap. Its source/runtime-bound report is validated
against fresh no-wrapper composite-loader controls before and after; AA0,
image, image ID, final scene snapshot, planning trace, and loaded-seed record
match at 768×1080. Direct-mode controls match separately at 320×480, so keep
the regimes distinct. See the [updated findings](introspection/in-sub-frame.md)
and [call-window evidence](introspection/evidence/in-sub-frame-initial-window-v2-20261013.json).

The separate false-row census has no per-call frame identity. Cross-run joins
to different captured frames remain hypotheses and do not extend the contract.
The first natural native entry has now been traced in a separate 768×1080
writer-stream run: its return address is inside the exact live-matched
`BRUSH-STROKE` payload at offset `0x1cf`. Six saved output artifacts match
fresh source-hashed no-probe controls before and after. This does not label
subsequent calls or bind any row of the 768×1080 false-result census. See the
[caller findings](introspection/in-sub-frame.md) and
[portable evidence](introspection/evidence/in-sub-frame-native-caller-20261013.json).
Natural ZERO-EDGE context, per-call frames for census rows, intermediate
helper traces, and scene-level JS parity remain open.

### ZERO-EDGE 160-input matrix, 2026-10-12

The expanded matrix now completes all 160 explicit post-MAIN target calls:
40 center direction/budget inputs, 64 boundary inputs and 56 shape/value
inputs. There are 68 proper-list returns and 92 NIL returns. Every scratch
map retains all 49 input cells; original bindings and both full original
maps pass all boundary checks. Copied previews stay at (59,29,74). Fresh
uninstrumented controls p/r bracket q and all four drawing/scene output
files are byte-identical. Read [the matrix findings](introspection/zero-edge-input-matrix.md).

The first candidate agrees with return paths/identities/maps but has 40
incorrect final START directions in boundary NIL cases. Ordinal 42 returns
NIL with START (0,0,1) changed to (0,0,5), versus the candidate's (0,0,6).
The revised hypothesis returns NIL immediately on an out-of-bounds
candidate, consistent with the frozen native branch. It now matches all
160 recorded return/START/map/path/identity results in independent root and
reviewer comparisons; the reviewer also compared six earlier samples.
The intermediate steps remain inferred. The subsequent holdout above
completes other dimensions, positions and longer path budgets.

The strict portable evidence derives identically in two independent runs,
with all 285 sources and the native 56-source closure revalidated. Read
[the portable matrix](introspection/evidence/zero-edge-input-matrix-20261012.json).
The artifact is 2,936,099 bytes, SHA-256
`1aaf0cf554a6d4e83bdbb21375eed66b88a0ff0499f6e13b43850598b7b903b8`.
It contains observed cases and artifact hashes/lengths, with no raw binaries.

The separate required-END runner binds its hash and terminal marker and
waits for the observer's own END as well as drawing/scene completion.
Matrix v1 was never run because its acceptance lacked baseline-stable RNG
gates; captured v2 fixes them. Retain both sources and the historical runner.
The earlier proposed 136 inputs were expanded before execution.

### ZERO-EDGE direction and one-cell inputs, 2026-10-12

Two separate PERIM 3 calls now measure a second START direction and one
changed scratch cell. START (3,3,1) on the zero 7x7 UBYTE4 map returns a
proper five-point list: (3,3,3), (4,2,5), (5,3,7), (4,4,1), (3,3,1),
with the final point EQ START and its final slots unchanged. START (3,3,0)
with only array[3,2]=1 instead returns NIL and leaves START.Z=1. All 49
scratch cells retain input values in both cases. Full original map/binding
checks and current before/after drawing/scene controls k/o pass. Read
[the input findings](introspection/zero-edge-inputs.md).

A reusable bounded validator consumes a source-bound immutable JSON spec;
both independent derived outputs match, with all 199 sources and the native
56-source baseline revalidated. See
[portable evidence](introspection/evidence/zero-edge-inputs-20261012.json).
These observations fit a provisional direction/map/budget model but do not
recover its intermediates or general behavior. The subsequent 160-case
matrix above completes the direction/budget/boundary/shape follow-up and
exposes and resolves a final supplied-point mutation difference in the first
candidate for these observed inputs.
All earlier published source closures remain unchanged.

### ZERO-EDGE positive PERIM samples, 2026-10-11

Three separate calls at START (3,3,0), on the same zero 7x7 UBYTE4 scratch
map, now complete for PERIM 1/2/3. PERIM 1 and 2 return one NIL and leave
START.Z at 4 and 2 respectively. PERIM 3 returns a proper five-TRIPT list in
order (3,3,2), (3,2,4), (4,2,6), (4,3,0), (3,3,0); the last point is EQ
the supplied START, whose final slots are unchanged. All scratch cells stay
zero. Full original maps/bindings, copied previews and both fresh g/i drawing
and scene controls pass. Read [the positive samples](introspection/zero-edge-positive.md).

The shared immutable-specification deriver produces byte-identical independent
agent/root outputs and revalidates all 230 source bindings, including the
frozen native 56-source closure. See
[portable evidence](introspection/evidence/zero-edge-positive-20261011.json).
This is a three-input observation, not general traversal or a recovered PERIM
meaning. The two-input milestone above completes its next direction/cell
samples. The target's intermediate reads and general map rule remain open.

### ZERO-EDGE first explicit call, 2026-10-11

Frozen single-call v3 completes one post-MAIN `ZERO-EDGE` call with
`MAKE-TRIPT(3,3,0)`, PERIM 0 and a zero 7x7 UBYTE4 scratch map. It returns one
NIL and changes the supplied point's Z from 0 to 6; all 49 scratch cells stay
zero. Copied three-draw previews stay (59,29,74). All seven observed original
bindings and both original maps' identity/metadata/full 829,440 cells match
after PROGV, and drawing/image/image-id/raw scene bytes match both fresh
uninstrumented controls b/c. This is one input observation, not a traversal
algorithm, PERIM interpretation, caller capture or complete-state proof. Read
[the isolated-call findings](introspection/zero-edge-traversal-single.md).

Today's natural maps are 768x1080; the earlier 320x480 corpus remains a
separate captured configuration. The change's cause is uninvestigated. V1/a
and v2/d single-call tapes are diagnostic: malformed post-MAIN IF, zero target
calls, incomplete case, one observer error despite matching drawing bytes.
V3 fixes the IF and avoids printer sharing labels in bounded report summaries.
Portable publication now passes two byte-identical independent derivations
and all 166 source bindings, including the frozen native 56-source baseline.
See [the portable capture](introspection/evidence/zero-edge-traversal-single-20261011.json).
Next: positive PERIM/direction samples with one changed input and fresh
complete controls before broader claims.

### ZERO-EDGE construction contract

Frozen v4 now has a complete zero-error capture in
`zero-edge-contract-seed1234-20261006-g`, with fresh uninstrumented control
`zero-edge-contract-control-seed1234-20261006-h`. Their AA0, raw scene, image
and image-id bytes match. MAKE-TRIPT has fixed positional X/Y/Z arguments;
one sample (17,23,6) returns a TRIPT whose six direct slot reads and three
getters agree. START stays unbound, and XINCS/YINCS retain identity and complete
eight-integer summaries. Eleven copied three-draw previews stay (13,91,81);
this is not complete RNG-state or arbitrary-object preservation. Read
[the contract findings](introspection/zero-edge-contract.md) and
[portable evidence](introspection/evidence/zero-edge-contract-20261006.json).
Its portable derivation now completes with 140 revalidated source bindings;
two independent outputs are byte-identical, SHA-256
`ae70bc92ee90788cda8370974f174de431e3d1ea8ddfcea273ff097eb9970267`.
V4 SHA-256 is
`400cf8a4a5bf1fecfa9fd5e302f1d6226827f34eb84e2382114912044bb2bca2`.
This constructor probe did not invoke or replace ZERO-EDGE. The separate
single-call observation above supersedes that earlier queue. PERIM's domain,
traversal, natural calls and direct caller remain unresolved; expand cases
only after complete returned captures and current controls pass.

Earlier contract attempts remain diagnostic:

FOOB is pushed as `59b97564efea279549361f0bf762974b61891af6`.
The contract run `zero-edge-contract-seed1234-20261006-a` is diagnostic:
two UNDEFINED-FUNCTION serialization errors, constructor skipped; its control
`zero-edge-contract-control-seed1234-20261006-b` has equal drawing/scene bytes.
Frozen v1 has misplaced nested COND/LABELS scope.

Frozen v2 (`zero-edge-contract-v2.cl`, SHA-256
`c79741fed7fb6fbaa530c80c40e54ed185282d58bd749aa440eff531e14ee3bd`)
completes in run `zero-edge-contract-seed1234-20261006-c`: fixed positional
MAKE-TRIPT X/Y/Z, eight integer direction entries, and one TRIPT sample
(17,23,6), with zero errors. Its AA0/image/scene differ from the fresh control
`zero-edge-contract-control-seed1234-20261006-d`; keep it diagnostic. Copied
three-draw previews do not establish startup or complete-state preservation.
The cause of the trajectory change is unresolved.
`zero-edge-contract-v3.cl`, placing the sample after original MAIN and checking
START/seeded-preview effects, is also diagnostic. Run e stops at MAIN-GATE
with no INSTALL/READY/completion footer; its drawing, image and scene equal
fresh control f. Its frozen source SHA-256 is
`141f570aa58a1c37f69de259d81cb338a3068f7f7ac21354bfb196a315271623`.
The MAIN installer has an odd SETF argument count and no actual HANDLER-CASE
clauses despite balanced delimiters. V4 corrects those scopes. The source
establishes the v3 defect, but the runtime exception was not captured.
Do not use any of these rejected attempts as parity evidence.

### Feature buffer checkpoint

The feature buffer now matches all 24 natural BUFFER-FEATURE calls, 81,110
ordered candidate/predicate checks and 3,686,400 complete feature output cells.
Their maps compose to all three BUFFER-HEAD outputs (another 460,800 cells).
Every one of the previous 6,965 extra clear-entry 3 positions changes to 3
within a captured feature boundary. This is net boundary attribution, not an
individual store trace or continuous ownership claim. Read
[the feature findings](introspection/brush-feature-buffer.md) and
[portable evidence](introspection/evidence/brush-feature-buffer-parity-20261006.json).
Both complete tapes match fresh drawing/scene controls. Frozen v2 roots are
brush-buffer-capture-seed1234-20261006-a / seed5678-20261006-c; controls
brush-buffer-capture-control-seed1234-20261006-b / seed5678-20261006-d.

DOUBLE-FLOAT and integer coordinates, CORE widths 17/3 and boundary value 3
are observed. EDGE creation, masks, frames, map history and head feature
selection remain inputs. BUFFER-ANYTHING/BUFFER-HOLE have no natural calls
here. Next: map/characterize FOOB and ZERO-EDGE using the frozen new metadata
probe, then the complete BRUSH-FILL row/iris schedule and value-0 painter.
The FOOB follow-up above supersedes that earlier queue; ZERO-EDGE is next.

### Native mapping checkpoint

FOOB and ZERO-EDGE now have separate unique complete PLL matches, 448
byte-checked instruction rows covering 1,262 of 1,280 payload bytes, canonical
external REA records and a fresh byte-identical drawing/scene control. Read
[the predicate native findings](introspection/brush-buffer-predicate-native.md)
and [portable evidence](introspection/evidence/brush-buffer-predicate-native-20261006.json).
The capture is metadata only: neither natural calls nor Lisp behavior follow
from it. The separate FOOB behavior capture above now measures its complete
integer grid, mixed single/double fractional bounds and natural results.

Six painting/buffer functions now have unique complete PLL matches and 1,364
byte-checked Ghidra instruction rows covering 3,829 payload bytes. Both native
runs equal a fresh uninstrumented drawing/scene control. Read
[the native findings](introspection/brush-painting-native.md) and
[portable evidence](introspection/evidence/brush-buffer-native-20261006.json).
BUFFER-FEATURE and BUFFER-HOLE expose candidate native setter sites. The
bounded BUFFER-HEAD constant list is a prefix; natural traversal remains open.
This is external Ghidra/REA evidence, not a Windows native-provider session.

The first buffer tape
`brush-buffer-capture-seed1234-20261005-d` is diagnostic only: it lacks
MAIN/READY and COMPLETE/END despite the matching drawing. Frozen v2 removes
the primitive setter hook and adds full per-child maps. Require its own
complete footer and fresh controls before promoting behavior.

### Previous natural boundary checkpoint

Natural BRUSH-STROKE's long value-3 boundary branch now matches all 70 markers,
296,912 ordered candidate/predicate results and 10,752,000 complete output
cells. It chooses PERIM for length > 3×WIDTH, clips inclusively to SUB-FRAME,
writes 3, skips the screen and returns the original path by EQ. The short
CORE branch has native support but is not naturally exercised here. All
3,881 stroke return identities are observed; general value-0 behavior remains
open beyond the bounded map captures above.
All 70 clears use their naturally returned CFRAME and match another 10,752,000
full output cells. Both drawings/scenes equal fresh controls. Read
[the boundary findings](introspection/brush-stroke-boundary.md) and
[portable evidence](introspection/evidence/brush-stroke-boundary-parity-20261005.json).
The accepted-coordinate touch set is not an individual native store trace.
There are 6,965 additional clear-entry value-3 positions outside the linked
marker's accepted set; every one was 0/1 at marker exit, so its net addition
occurs during intervening work. The feature follow-up above now accounts for
all of them at complete function boundaries; individual stores and continuous
ownership remain open. The native mapping and feature attribution supersede
the caller investigation that was queued at this checkpoint.
Frozen boundary roots: brush-stroke-boundary-seed1234-20261005-f and
brush-stroke-boundary-seed5678-20261005-h; fresh controls -g/-i; native -e.

### Previous natural census checkpoint

The complete natural BRUSH-STROKE census now covers 3,881 calls in the two
controlled paintings: 3,811 value-0 strokes, 70 value-3 strokes, 3,811 screen
calls and 70 clears. All calls are paired, with zero observation errors,
aborts or overflow; both complete drawings and scene reports equal fresh
uninstrumented controls. Empty and singleton natural value-0 paths differ
from the older isolated adapter cases. Read
[the census findings](introspection/brush-stroke-census.md) and
[portable evidence](introspection/evidence/brush-stroke-census-20261005.json).
The census retains counts and first-seen CORE geometry, not map writes,
returned-object identity or caller stacks. Continue with complete value-3
path/mask/predicate/map boundaries and natural CFRAME reads during clears,
then the complete BRUSH-FILL schedule and subpart painting.
Frozen census roots: brush-stroke-census-seed1234-20261005-a and
brush-stroke-census-seed5678-20261005-c; fresh controls -b and -d.

### Previous CFORM POST-FILL checkpoint

CFORM POST-FILL matches all 149 natural calls and 45,772,800 complete output
map cells. It clears positive fill cells in [LX,RX)×[LY,TY), assigns the form
patch where PATCH-MAP equals BACKGND, and returns the accepted count.
Target fill0/1/2 and BACKGND0 are measured; excluded RX/TY positives and all
outside cells are preserved. The outline/list/median/start/strategy/post
composition matches 35,905 outline positions, 22,886,400 full entry fill cells
and every output cell. Read [the CFORM findings](introspection/cform-post-fill.md)
and [portable evidence](introspection/evidence/cform-post-fill-parity-20261005.json).
Some zero-count calls have no PATCHDEX read; do not invent their original label.
Frozen v2 roots: cform-post-fill-seed1234-20261005-c / seed5678-20261005-e;
fresh controls -d / -f. V1 preserved output but lacked shared GETF cache fields,
giving 67 AFTER errors and zero map cells; it is excluded. Exact earlier native
method bytes and the new canonical external REA record are revalidated.
Continue with natural BRUSH-STROKE value-3 provenance, then the complete
BRUSH-FILL schedule/iris branch and subpart painting. Existing outlines/maps,
frames and plan construction remain original inputs.

### Previous BRUSH-FILL preparation checkpoint

BRUSH-FILL preparation now selects SCRIPT(MPLAN)[SDEX].CFLIST[CDEX], uses its
naturally returned CFRAME/PATCHDEX, starts the first scan at TY and derives
MAX = 5*((RX-LX)+(TY-LY)). All 134 initial rows, 138 form selections, 5,805
scan bounds/patch inputs and 278 walk budgets agree in both paintings. The
aligned complete SUBFORM composition again matches 85,401,600 output cells;
fresh controls match whole drawing/scene bytes. Read
[the preparation findings](introspection/brush-fill-preparation.md) and
[portable evidence](introspection/evidence/brush-fill-preparation-parity-20261005.json).
Four later row jumps reach LY-2 after a second CFRAME read; that branch is not
implemented by the initial-row adapter. Continue with CFORM POST-FILL, then
natural BRUSH-STROKE value-3 provenance and the complete BRUSH-FILL schedule.
Plan construction, earlier maps, form counts and painting decisions remain
original dependencies. Successful preparation roots are -seed1234-...-b and
-seed5678-...-d, with fresh controls -c and -e; frozen v2 source has SHA-256
6717298a2b31e12626ae5ca2bc8fbe21075ad7426bc914dff27d18783e957d6e.

### Previous scanner checkpoint

SCAN-ROW and NEIGHBORS are now recovered for the measured integer domain.
All 5,805 natural scans and 6,984 nested neighbor calls match independent JS.
NEIGHBORS returns min(3, matching in-picture neighbors); SCAN-ROW searches
[LX,RX), rejects Y=-1 before FLASH-SPOT and returns the first qualifying
TRIPT with Z=4. Each painting repeats 44,544 neighbor masks and 10,368 scan
queries over 48 layouts. Both drawings and scene reports equal fresh controls.
Scan-time complete map equality checks cover 1,783,296,000 elements. Row seeds
compose all 278 SUBFORM fills and 85,401,600 final map cells; start object
identity links are measured. Read [the scanner findings](introspection/scan-row.md)
and [portable evidence](introspection/evidence/scan-row-parity-20261005.json).

Frozen v2 observer preserves multiple values with MULTIPLE-VALUE-PROG1 across
the later logging flush. V1 finished without observation errors but replaced
SCAN returns with NIL; its changed drawing and zero PATCH calls are excluded.
Successful observer roots are scan-row-seed1234-20261005-c and
scan-row-seed5678-20261005-e, with fresh controls -d and -f. Earlier boundary
roots requested SmallImage and these runs did not; their measured dimensions
and full outputs match, and that cross-capture scope is explicit.

The user requested autonomous continuation across targets. An active hourly
same-thread heartbeat named "Continue AARON reverse engineering" was created
with id continue-aaron-reverse-engineering. Continue from this record without
waiting for another continue message; read-only investigation can progress
while oracle work remains serialized. Do not create duplicate automations.

At that checkpoint, BRUSH-FILL input preparation was next. It is now measured
above; the complete row schedule, CFORM POST-FILL, map history and subpart
painting/clearing still follow. FLASH-SPOT graphics effects remain a boundary.

### Previous SUBFORM construction checkpoint

SUBFORM boundary construction and a composed fill now match all 278 natural
cases in the two controlled paintings. PATCH-EDGE derives the complete
outline and updates the original start point's direction; LIST-FRAME derives
its inclusive bounds. Independent JS computes those inputs, medians and start
rotation and applies strategy/POST-FILL. All 27,509 outline positions,
frames/counts/returns and 85,401,600 complete output-map cell comparisons
agree. Both AA0 and scene reports equal fresh controls byte for byte.

Read [the SUBFORM boundary findings](introspection/subform-boundary.md) and
[portable evidence](introspection/evidence/subform-boundary-parity-20261005.json).
The module is `engine/src/aaron-subform-boundary.js`. Both maps retain their
object identity and complete contents from PATCH-EDGE entry to MY-FILL entry:
1,112 whole-map equality checks cover 170,803,200 elements. The existing map
state is carried into filling; its earlier scene history remains an input.
All outlines close, all points are integer TRIPT, and all frames are MAPFRAME.
All eight directions occur, with 241 observed start-Z changes. Stranded/MAX
termination, fractional/empty frame inputs and POST-FILL's value-2 conversion
remain native interpretation. The native start-tail object identity is not
separately measured; output values and caller-argument mutation are.

PATCH-EDGE, LIST-FRAME and NEIGHBORS have fresh exact complete PLL matches,
instruction-byte-validated standalone Ghidra reports and canonical REA
external import/export. NEIGHBORS is mapped but not ported. Natural returned
outline/frame identities match LIST-FRAME/MY-FILL inputs; this establishes
boundaries, not direct native callers. Keep the source of START/MAX/patch ID
and natural CFORM-COUNT explicit. Some zero-count fills have no PATCHDEX read;
the evidence retains each chain's reader count.

The first observer required SUBP-COUNT before its initial binding and was
stopped/excluded. The next repeated full maps but timed out at 280 seconds.
Frozen v3 saves typed vectors using COPY-SEQ of displaced views, checks EQ and
EQUALP at intermediate boundaries and captures complete maps at entry/exit.
All 1,668 snapshot preview checks pass; a 600-second limit completed the larger
seed-5678 painting in about 585 seconds. Partial failed runs may lack
summary.json and are not successful evidence. Both failures, staging hashes
and the new workflow lessons are retained. C:\temp is empty and no oracle
remains after this checkpoint.

Next, recover SCAN-ROW/NEIGHBORS to derive the start/MAX/patch inputs from a
row and patch map. CFORM POST-FILL, the source of value-3 cells, subpart brush
painting/clearing and an integrated BRUSH-FILL caller remain open. Earlier
map history and scene construction are still original dependencies.

### Previous boundary-map checkpoint

Two boundary-map helpers now match all complete captured outputs:
WRITE-LIST-TO-FILL-MAP assigns value 2 at the ordered list's in-picture
coordinates; CLEAR-FILL-MAP zeros the selected inclusive frame rectangle.
Across two paintings, all 149 writers, 70 clears, 35,905 list positions and
33,638,400 full-map output cell comparisons agree. Both drawings and scene
reports equal fresh controls byte for byte. Nonzero far-edge cells are cleared,
and nonzero cells outside the frame are preserved. Clear entry includes values
0/1/2/3, with 64,259 observed value-3-to-zero transitions.

Read [the boundary-map findings](introspection/boundary-map.md) and
[portable evidence](introspection/evidence/boundary-map-parity-20261005.json).
The independent module is `engine/src/aaron-boundary-map.js`. All 149 CFORM
cases also match the composed writer → medians → start → strategy sequence
and 1,295,917 strategy-region output cells, aligned to the retained separate
preparation captures. Original point lists, writer entry maps and selected
frame inputs remain required. No out-of-picture writer point or VAL other
than 2 occurs; those guards remain static interpretation.

Both helpers have unique complete PLL matches, instruction-byte-validated
standalone Ghidra reports and canonical REA external evidence import/export.
The first full observer missed frame bounds despite matching control bytes:
compiled accesses bypassed LX/RX/LY/TY function wrappers. Final capture reads
the slots directly from the naturally returned CFRAME object, adding no
application frame accessor calls. All 438 map-preview and 140 slot-preview
checks pass. Keep the missing-input and earlier extra-RX lessons. A Ghidra
settings-file permission failure and its scoped retry are documented in
[the native workflow](native-analysis-workflow.md).

Next, recover SUBFORM's initial boundary maps before MY-FILL, then compose
their production with the measured strategy and SUBFORM POST-FILL rule.
CFORM POST-FILL and the source of value-3 cells are useful next boundaries.
Integrated MY-FILL/BRUSH-FILL, frame/outline construction, iris branching and
subpart brush changes remain open. Do not infer direct native callers from
the observed MY-FILL/BRUSH-FILL-SUBPART wrapper enclosures.

### Previous fill-preparation checkpoint

Three fill-preparation functions now match their complete captured outputs:
SET-MEDIANS, GOOD-START and FILL-STRATEGY, with 427 calls each in the two
controlled paintings. JavaScript rounds median rows to the nearest integer
with ties to even, rotates the complete outline at the first three distinct X
values with equal successive differences, and toggles scan columns while
preserving fill value 2. All 63,414 outline point positions
and 1,883,204 output cell comparisons summed over per-call captured regions
agree. Both drawings and scene reports equal fresh controls byte for byte.

Read [the fill-preparation findings](introspection/fill-preparation.md) and
[portable evidence](introspection/evidence/fill-preparation-parity-20261005.json).
The independent module is `engine/src/aaron-fill-preparation.js`. Original
LY/TY inputs, outlines and initial boundary maps remain inputs; the comparison
computes its own intermediate medians and rotated outlines. Captured frames
are MAPFRAME, point objects are VISPT/TRIPT and map values are 0/1/2. Other
domains and cells outside the padded capture rectangles remain unmeasured.

The initial observer had zero errors but changed AA0. A copied-state diagnostic
localized one random-state advance to its first extra RX read. The final probe
reads only the needed LY/TY and passes all 2,562 snapshot preview checks plus
whole-output control equality. Do not assume additional accessor calls are
passive; preserve this observer lesson alongside the C:\temp and LOOP rules.
The internal RX mechanism is unresolved. No clock changes or debugger attach
were needed for this milestone.

At that checkpoint, initial boundary-map production around WRITE-LIST-TO-FILL-MAP
was next, followed by connecting these helpers to SUBFORM POST-FILL. CFORM
POST-FILL, iris branching, subpart brush changes and the integrated JS caller
remain open. POST-FILL's separate value-2-to-1 branch is still unobserved.

### Previous POST-FILL checkpoint

The SUBP-COUNT writer is located inside POST-FILL's SUBFORM method. Across two
complete paintings, all 427 MY-FILL calls have one matching POST-FILL child:
arguments, return values and count boundaries agree. All 181 observed count
changes occur inside the 278 SUBFORM POST-FILL calls. The other four observed
helpers have no entry/exit count change. Both paintings and scene reports
match fresh controls byte for byte.

Both actual POST-FILL methods and four ordinary helpers have unique complete
PLL matches and Ghidra reports. The SUBFORM method contains the SUBP-COUNT
reset and accepted-cell increment. REA imported/exported its standalone
Ghidra record with external-provider provenance.

Read [the POST-FILL findings](introspection/post-fill-count.md) and
[portable helper evidence](introspection/evidence/post-fill-helper-boundaries-20261005.json).
The independent SUBFORM helper now matches all 278 counts and returns and
1,130,814 captured output map cells, using complete original frame/map inputs
and natural PATCHDEX/CFORM-COUNT reader values. See
[the map evidence](introspection/evidence/post-fill-map-parity-20261005.json).
Both paintings remain byte-identical to controls. Only fill values 0/1 and
FLAG-BIT 32768 occur; the native 2-to-1 branch remains inferred. Cells outside
the captured rectangles are unobserved. CFORM-COUNT's scalar binding is
unbound in older tapes; the method uses its function to read a form's count.

FILL-STRATEGY's frame/map inputs and changes were the next boundary at this
checkpoint; the new comparison above now covers that step.
CFORM POST-FILL, iris branching and subpart brush changes remain open. Use
DOTIMES/DOLIST in probes: the rejected first map attempt hit a FILE-ERROR and
379 UNBOUND-VARIABLE conditions with LOOP, despite writable staging. Replacing
LOOP restored complete map capture and control-byte equality.

### Previous count and assignment checkpoint

Two complete paintings now measure the brush fill's count/assignment boundary.
All 274 natural selectors consume the count left by the preceding
`MY-FILL(SUBFORM, ...)` and match the existing JS selector. At the next
observed boundary, `BRUSH` equals the selected object or NIL. All 70 subpart
entries use that exact object; ten subparts change it to brush 1 by exit.
Both paintings and scene reports match fresh controls byte for byte.

Read [the count and assignment findings](introspection/brush-fill-count.md)
and [portable evidence](introspection/evidence/brush-fill-count-and-assignment-20261004.json).
Six ordinary functions and both actual MY-FILL methods have exact complete
PLL matches and standalone Ghidra reports. MY-FILL's generated generic
dispatcher has no PLL match and must remain distinct from its method bodies.
The methods specialize on EQL SUBFORM and EQL CFORM. Their computed calls
associated with `FILL-STRATEGY` and `POST-FILL` are static candidates.

Next, inspect/trace those helper boundaries, especially the computed call
associated with `POST-FILL` inside MY-FILL's SUBFORM method, to locate the
count writer. Helper arguments and types remain to be measured. The capture locates changes
inside MY-FILL but does not identify its internal writer. All 5,805 SCAN-ROW
entry/exit counts are unchanged. Argument geometry is bounded and partial;
capture full relevant frame/map inputs before porting the count algorithm.
No new engine implementation or unit tests belong to this milestone.

### Previous caller checkpoint

The first seed-1234 selector call now has a measured native caller path:
`DISPLAY-COLOR-PATCHES → BRUSH-FILL → SELECT-BRUSH`. Five named compiled
functions were linked to unique complete PLL objects by exact live-byte
matches. Standalone Ghidra decoded their payloads; two separate WOW64
hardware-breakpoint runs confirmed the return PCs. Both AA0 and scene reports
matched a fresh control byte for byte. The selector's existing exhaustive
integer behavior and JS implementation are unchanged.

Read [the caller evidence](introspection/select-brush-caller.md) and
[the native workflow](native-analysis-workflow.md) before another attempt at
Lisp disassembly or a provider setup. REA 3.2.1 was installed and used for
diagnostics and canonical external evidence import/export; its stock Windows
native provider rejected this host. Standalone Ghidra and the targeted WOW64
helper supplied the native evidence.

`C:\temp` still resolves to `research/artifacts/temp` on D:. Its documented
preflight, collisions, registry permissions and fresh-output rules are in
[oracle.md](oracle.md#ctemp-staging-and-permissions). The new optional pre-scene
probe/pause workflow records the staged probe hash and an owned pause request;
capture helpers release that pause on completion or setup failure. Run only
one oracle at a time and do not change the system clock.

The count/assignment investigation above follows that caller checkpoint.
SUBFORM post-fill has a measured JS comparison for the captured inputs;
the integrated JS caller and creation of those inputs remain unrecovered.
The notes below retain older checkpoints;
their earlier unresolved name-to-code and selector-caller limits are superseded
only for the exact matched objects and observed contexts documented above.

## Project identity

- Repository: `SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer`
- Working branch: `reverse-engineer-aaron-js`
- Goal: clean-room JavaScript reimplementation of the 2001 Kurzweil CyberArt
  AARON generator, while preserving the historical AA viewer.
- Source policy: do not publish reconstructed proprietary Lisp or redistribute
  the archived installer/extracted binaries. Keep normalized reports, hashes,
  probe scripts, and independently written implementations.
- Exactness policy: label results **Measured**, **Inferred**, or **Provisional**;
  passing a JS self-test is not evidence of original-engine parity.

## Current verified state (2026-09-26)

The `reverse-engineer-aaron-js` branch was checked out on the user's Windows
10 Pro 22H2 machine at `D:\ReverseEngineerAaron`, HEAD `4883d54` before this
local work. The verified archived installer was extracted under ignored
`research/extracted/` without running it. The local scene oracle
[`oracle/run-local-scene-state.ps1`](oracle/run-local-scene-state.ps1) patches
only disposable runtime DLL copies, uses the existing ordinary `C:\temp`
directory, and restores its temporary files and per-user registry values.
It runs without changing the Windows system clock. Exact steps and patch
scope are in [`oracle.md`](oracle.md).

One corrected baseline and two fresh post-`INIT-RANDOM` seed-1234 scene probes
completed. The two seeded scene reports are byte-identical (SHA-256
`ca0d9ecf0ca238e8c243676ceff4e42f028f533f11df36663bc83368a4549b5b`),
as are their complete AA0 files (SHA-256
`0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1`).
The first `DRAW-CFORM` entry occurs before the outermost `RPARSE` return.
At the first `SCREEN-AND-STORE`, `MPLAN` is a `PLAN`, `BRUSH` is a
`PAINT-BRUSH`, `RPLANE` is a fixnum, and `RGB-MAP` has become a nonempty
list of `AARGB` objects. This is bounded state evidence, not a recovered
composition rule. The reports and detailed values are in
[`scene-context-findings.md`](scene-context-findings.md).

Two further local seeded runs with transparent `PREP-LINE` and `STORE-IN-FILE`
wrappers yielded identical seven-snapshot reports and the same complete AA0
bytes as the simpler seed control. The first `STORE-IN-FILE` entry occurs
before outermost `RPARSE` returns, with `RGB-MAP` still `NIL` and `BRUSH`
unbound. The first `PREP-LINE` entry occurs later with arguments `NIL` and 5,
`RGB-MAP` populated, `BRUSH` a `PAINT-BRUSH`, and `RPLANE` 79. Entry/exit
summaries of the 15 tracked bindings agree for each first call; untracked
state and stream effects remain open. The retained writer report hash is
`3c142146407a3d7bcb82f58147a832f71bb0a00324dcf246da9b12655c63ce1f`.

The newer windowed writer capture records 299 natural calls from a complete
seed-1234 painting, covering all nine selectors it uses. The original
`PREV-STORED-PT` is observed before and after every sampled call, starting at
`(0,0)`. The JS writer matches all 299 output byte slices and previous-point
transitions in `small` hop mode. Two local runs have identical reports and AA0
hashes. The retained fixture, method counts, and scope are documented in
[`stroke-findings.md`](stroke-findings.md). This is bounded file-writer parity;
the composition and screen paths still need reconstruction.

This checkpoint is superseded by the 2026-10-14 entries at the top of this
handoff. The natural FREE-PATH caller bracket is complete. The progress report
records 30 routine names, 31 bounded contract units, 1-of-5 fully achieved
milestones (20% by milestone count), and zero whole-painting parity results.
Do not restart the completed writer-replay milestone. The FREE-PATH stop rule
remains unresolved; continue from the discriminating case named in the active
execution plan.

## Earlier 2026-09-08 checkpoint

As of 2026-09-08, the recovered checkout is clean at local commit
`311792d321b52e0980faf8f6a49e46f69598a4a0` (`Add independent DXL
control-flow profile`), and the connected branch is published at
`decd0f150202039b915ed1815533c3527335d128` with the same changed-file tree.
The current direct matrix source remains in the earlier edge checkpoint. Its
pre-index content ended at
`1c78085fbc3e5430db84002ecd05105c2cf9d86f` after the edge evidence
publication; the static-index publication was verified at
`b33a90bb7462a0e853678a216eb80ce93948068b`.
The connected branch has different ancestry/SHA values from the local
checkout, so compare the tree and files rather than assuming commit IDs are
identical.

The current local static-code checkpoint adds an anonymous bounded x86-like
control-flow profile at
[`introspection/static-code-profile.json`](introspection/static-code-profile.json),
generated by [`tools/profile-x86-candidates.mjs`](tools/profile-x86-candidates.mjs)
from the preserved DXL and complete extracted PLL. It profiles all 190 aligned
`55 8b ec 56` candidates and records 28,594 linear instruction rows, 80,196
decoded bytes out of 80,524 payload bytes, 200 invalid/byte-fallback rows,
4,271 direct relative transfers, 2,986 indirect calls, 33 targets landing
inside another linear instruction, and 5,638 conservatively recursive rows.
The separate assumed-indirect-call-return view reaches 22,694 rows and 64,470
bytes after continuing through 2,555 indirect call sites, while indirect jumps
remain unresolved. It also retains 28 shifted-start controls, three exact
66-byte PLL/DXL anchor profiles with matching normalized transfer structure,
and 24 bounded PLL decoder-reference windows. A fresh independent worklist at
each branch target reaches 5,670 conservative instructions / 15,278 bytes and
22,795 assumed-return instructions / 64,808 bytes, with no target/interior
boundary conflicts in this image; it continues through 2,561 indirect calls
and leaves indirect jumps unresolved. The report is 873,511 bytes;
per-candidate scalar summaries and detailed control-window transfer lists are
both retained, while redundant per-candidate transfer arrays are omitted. This
is anonymous
byte-interpretation evidence; it does not assign names, entry points,
relocations, calling conventions, source modules, or Lisp semantics. The new
parser and fixture are covered by the research suite.

This checkpoint required no Windows execution. The bundled local Wine files
are present, but the host cannot launch the 32-bit loader and the 64-bit
launcher is blocked by the local `wineserver` socket policy; the known-good
Windows Server 2022 GitHub runner remains the oracle for original-engine
measurements. Local verification is 76 engine tests plus 39 research-tool
tests. An earlier informal checkpoint used an approximately 35–40% project
estimate; it had no weighting method and should not be treated as a current
completion metric. See the [count-based progress report](progress-report.md)
for the current milestone count and its limits. Composition, pose/anatomy,
occlusion, colour, integrated brush/fill/emission, and normal startup-seed
semantics remain open.

The latest published change adds:

- `engine/src/aaron-hand.js`, implementing the measured zero-argument
  `RAN-HAND` helper;
- `engine/test/fixtures/ran-hand-post-init.json` and
  `engine/test/aaron-hand.test.js`;
- normalized original-engine evidence at
  `research/introspection/evidence/ran-hand-post-init-34120567298.txt`;
- updates to the plan, oracle notes, and freehand-line notes.

The newest local-first checkpoint also adds accepted planner-frame metadata,
an opt-in measured `FREE-PATH` outline adapter with a separate RNG stream,
fixture-backed integration tests, and the 900-case invariant sweep documented
in `research/clean-room-integration.md`. No Windows run was needed for that
checkpoint.

The current brush checkpoint also adds a strict Stage 23 report parser and
the retained original-engine captures at
`research/introspection/evidence/brush-stroke-isolated-34145100465.txt` and
`research/introspection/evidence/brush-stroke-isolated-34145707021.txt`.
The corrected four-case capture reproduces the 12-, 26-, 70-, and 108-cell
adjacent horizontal footprints for brush IDs 1–4, with one screen-forwarding
call and clean return per case. The overlap capture adds the repeated
`(7,7)→(8,7)→(7,7)` path: the same 12 unique cells, one screen call with all
three points, and 27 predicate calls. The edge capture adds
`(0,0)→(1,0)`: one screen call, one partial fill cell, then `SIMPLE-ERROR`
under the forced predicate. The earlier run `34144809281` is deliberately
non-evidence: a stray probe marker stopped it after b2. The probe must remain
in direct top-level form for now; compiled helper variants failed before their
first resolution marker in the Allegro init-file harness. The next frontier
is real scene context and downstream emission.

The first local static-image index is now also retained at
`research/introspection/static-image-index.json`, generated by
`research/tools/index-allegro-image.mjs` from the complete extracted PLL and
the preserved DXL. It validates the PLL's 7,723-record first table and
53,039-record tagged string table, resolves every indexed object and NUL
terminator, matches all 1,347 dynamic function names, and cross-references all
50 `harold3` `.fasl` markers with the 50 DXL `.lisp` module names. The runtime
PLL copy is only a 3,740,160-byte prefix of the 4,573,464-byte library; use the
complete extracted file for static work. Exact references for `BRUSH-STROKE`,
`FILL-MAP`, `PAINT-BRUSH`, `RAN-HAND`, and `MPLAN` are recorded in
`research/static-image-findings.md`. These are offsets and name/binding
cross-references, not recovered Lisp source or object semantics.

The static parser now additionally validates all 7,723 first-table object
spans: every object is tagged `0x6c`, every header length agrees with the
record, sorted spans tile exactly to `0x2b4b90`, and all alignment padding is
zero. This proves structural code-like object boundaries only; it does not
map `MPLAN`, `BRUSH-STROKE`, or other names to objects. The package-qualified
scene target checklist is retained at
`research/introspection/scene-context-dossier.json`, with its interpretation
in `research/scene-context-findings.md`.

This continuation also added the reproducible scene-context dossier and its
builder, joining 16 package-qualified targets to the static index, retained
constant references, and four state checkpoints from run `34099250163`.
It deliberately stops at target selection: no opaque heap pointer or named
function boundary has been inferred. The local and connected trees were
checked byte-for-byte for all changed paths after publication.

The latest local-only static pass extends the image index without executing
the archived runtime. It records the arithmetic layout of all four DXL header
descriptors: their first-word ranges tile `0x010000–0x500000`, header words
`0x18`, `0x1C`, and `0x54` agree with the corresponding endpoints, and the
unassigned image prefix/suffix are `0x10000`/`0x20000` bytes. It also validates
the 53-object tagged-string chain at `0x1B65E8–0x1B6FA8`, containing 50
`harold3` paths, one interface path, and the auxiliary basenames
`review-s.lisp` and `local-f.lisp`; 101 of its 172 alignment bytes are
nonzero. These are structural facts only, not loader or relocation semantics.

An independent bounded cross-image search also rejected a tempting
name-to-object arithmetic match under shifted-offset controls. No defensible
function-name map, source dependency order, or relocation decoder has been
promoted. The exact normalized report and parser/test coverage are the source
of truth for this pass. A follow-up comparison also confirms that the DXL and
PLL retain the same 50 core module names in different orders (zero-item common
prefix), so neither string order is being treated as execution order.

The current local implementation checkpoint adds two explicitly provisional,
measured-input integrations. `planFigureFrames` now turns accepted planner
placements into rectangular frame contracts, and the generator fits each
figure into its accepted frame while retaining placement metadata. An
independent 900-case local sweep found 881 accepted placements with zero
containment, overlap, exception, or count-mismatch failures. The opt-in
`free-path-subset` outline mode connects the measured `FREE-PATH` primitive to
closed figure outlines using a separate seeded RNG stream, so it does not
change scene random consumption. Its local fixture records 3,026 and 2,909
outline operations for the two seed cases. These are clean-room integration
scaffolds, not claims about the archived caller policy; the exact boundaries
and sweep are documented in
[`clean-room-integration.md`](clean-room-integration.md).

The newest local-only checkpoint adds two further boundaries without executing
Windows. The static image index now compares every validated PLL compiled
payload against the DXL and records three exact anonymous 66-byte anchors.
All 7,723 PLL payload hashes are distinct; each anchor has the same `0x216c`
header and an aligned candidate object start, while no padded object span is
identical. These are structural cross-image anchors only—no function name,
entry point, relocation, or module is assigned. The implementation and exact
hashes are documented in [`static-image-findings.md`](static-image-findings.md).

The scene manifest was also hardened into a verified attribution boundary. It
now binds finalized captures to dimensions and palette, stores per-shape stage
hashes, rejects duplicate IDs/repeated stage assignments and gaps/overlaps,
and deep-copies replay slices so replay cannot freeze or alias the source
document. The three-case local fixture now retains full serialized-AA hashes
as well as stage hashes. This remains provisional clean-room instrumentation,
not recovered AARON scene semantics.

The same static pass now inventories a distinct DXL candidate set without
executing Windows: 6,671 byte-offset `0x6c` headers reduce to 1,511 bounded
headers and 190 eight-byte-aligned objects with the common `55 8b ec 56`
prologue. The prologue appears at none of the other seven alignment residues.
The offsets and length/padding metadata are retained under
`dxl.compiledObjectCandidates` in the static index. This strengthens the
structural report but still provides no defensible symbol-to-code mapping.
The index also retains a tagged-pointer control: the proposed
`0x20000000 + string-object-offset + 1` encoding matches 42,798 nonempty PLL
records, while nearby shifts match 42,781–42,809, so the apparent coverage is
not promoted to a reference decoder.

Finally, the measured dependency-isolated brush boundary is now represented by
`applyMeasuredBrushStroke`: an explicit `IN-SUB-FRAME` predicate gates the
measured core-mask writes, while a nontrivial path is forwarded once to an
explicit `SCREEN-AND-STORE` callback with CDEX/SDEX. Tests preserve the 27-call
repeated-path and 18-call adjacent-path predicate counts, direct values, and
single screen-forwarding call. The generator still does not use this adapter;
its downstream screen/file, colour, clipping, and brush-state behavior remain
open.

Local verification:

- `cd engine && npm test` → 76 passing tests.
- The brush report parser and its real original-engine captures are covered by
  the research-tool suite.
- Research-tool tests are run directly with
   `node --test research/tools/test/*.test.mjs` from the repository root; the
   `research/tools` directory has no separate `package.json`; the suite now has
   39 passing tests, including module adjacency, compiled-payload identity, DXL
   candidate-residue validation, tagged-pointer controls, and the anonymous
   control-flow profile.

## Scene-context probe boundary

`research/introspection/scene-state-snapshot.cl` loads the validated call
trace and adds observation wrappers around `RPARSE`, `DRAW-CFORM`,
`SCREEN-AND-STORE`, and `MAIN`. It records only bounded scalar/type/list/array
shape summaries for 15 package-qualified bindings. It does not print live
objects, manufacture a `PLAN`, or call unverified readers. The parser checks
target installation, unique binding rows, marker completeness, and explicit
non-observations. The companion uses `UNWIND-PROTECT` to maintain depth and
finalization state while preserving original conditions and nonlocal exits.
The local Windows baseline and two seeded repeat controls have all passed
those checks; their report details are linked in the current state above.

## Earlier heuristic estimate (superseded)

An earlier checkpoint used **35–40%** as an informal project estimate. It had
no weights or consistent function-status denominator, so it is retained only
as historical context and is not a defensible current completion percentage.
The [count-based progress report](progress-report.md) now reports 1 of 5
execution-plan milestones fully achieved (20% by milestone count), while
explicitly noting that milestone sizes differ and no overall behavior-coverage
percentage is available. The archaeology, AA protocol, fixtures, static
analysis tools, numeric primitives, and several isolated stroke/map/writer
boundaries are strong; the high-level artistic decision system remains mostly
unresolved, so the generator is not parity-equivalent.

| Area | Current state |
|---|---|
| Installer/runtime preservation and isolated oracle | Complete and documented |
| AA parser, renderer, serializer, corpus tools | Mostly complete for observed records |
| Allegro random source and numeric boundaries | Strongly measured; normal startup seed remains unresolved |
| Angles, distance, `LOCK-WIGGLE`, measured `FREE-PATH` subset | Measured fixtures and implementations |
| Stream/writer selectors | Isolated behavior measured; 64 consecutive natural VECTOR calls now have exact VISPT points and stream slices through byte 1224 of the AA0 command suffix, all matched by JS. Remaining integrated calls and screen state remain open |
| Brush profiles, maps, isolated `BRUSH-STROKE` subset | `SELECT-BRUSH` is now measured for every integer from 0 through 200,000 and matches in JS; 52 diagnostic integers also sample nearby out-of-range behavior. Brush-stroke footprints and an edge error boundary are measured. Integrated brush assignment, clipping, fill, and colour remain open |
| `RAN-HAND` | Four repeated post-`INIT-RANDOM` calls measured and implemented |
| Local composition frame integration | Accepted planner frames now control provisional figure count and geometry; 900-case sweep has zero invariant violations |
| Local `FREE-PATH` outline integration | Opt-in clean-room mode is deterministic and fixture-tested; caller policy and clipping remain unresolved |
| Static module/payload cross-image analysis | 50-module adjacency negative control, three exact anonymous payload anchors, 190 DXL prologue candidates with residue controls, and tagged-pointer shift controls; no names or execution semantics assigned |
| Scene geometry/emission attribution | Frozen, document-bound manifest with per-shape ranges/hashes and isolated replay slices; semantics remain provisional |
| Composition, figures, poses, plants, garments, occlusion | Mostly provisional/unresolved |
| Integrated JS generator | Runnable and deterministic, but not original-equivalent |

Important measured evidence already preserved in the repository includes 6,140
integer/random validation values, 512 floating `RAN` values plus 64 state
checks, 320 `LOCK-WIGGLE` paths, 16 controlled `FREE-PATH` cases, 240
isolated writer cases, brush/map matrices, and bounded integrated traces into
planning, figure generation, fills, brush work, and painting output.

## What is still open

1. Complete the freehand line algorithm and connect it to `DRAW-CFORM` and
   brush output.
2. Recover brush selection, clipping/overlap, fill maps, colour transitions,
   and real screen/file emission.
3. Recover normal startup random-state installation and generator draw order;
   use the controlled post-`INIT-RANDOM` reseed only as a calibration seam.
4. Replace the provisional planner with measured composition, placement,
   pose/anatomy, plants, pots, garments, depth, and occlusion rules.
5. Build integrated seeded holdouts and compare structural traces, state
   consumption, and AA output against the original.
6. Productize the recovered engine without presenting provisional behavior as
   exact parity.

The new frame and outline integrations make the local engine more measurable,
but they do not reduce the main historical uncertainty: AARON's own scene
planner, figure rules, clipping/brush policy, and downstream emission. They
should therefore remain opt-in or clearly labelled provisional until an
original-engine trace supports their caller semantics.

## Earlier investigation frontier (superseded)

The following records the prior frontier. The active order is now
[execution-plan.md](execution-plan.md), linked at the top of this handoff.

Use the local-first workflow:

1. Continue with local implementation and fixture inspection first. The
   static image index now includes the validated DXL descriptor/source chains,
   and the negative reference scan shows that raw heap arithmetic cannot safely
   replace runtime context. Use the object-span report and scene-context
   dossier to choose conservative read-only runtime targets, then inspect the
   existing brush-stroke, map, integrated-trace, and new clean-room integration
   fixtures locally.
2. Extend behavior already supported by evidence in the JS model and tests.
   Use the measured `SELECT-BRUSH` rule, and continue investigating integrated
   brush assignment, clipping, and scene semantics from original-engine traces.
3. When a new original-engine observation is required, use the local Windows
   10 oracle with a narrowly scoped probe, preserving a baseline and restoring
   wrappers/bindings with `UNWIND-PROTECT`. Use the Windows Server 2022 GitHub
   Actions workflow for cross-host checks or if local execution fails.
4. Record normalized evidence and update the roadmap before promoting a rule
   from provisional or inferred to measured.

The local transition probe now brackets `RPLANE`, `RGB-MAP`, and `BRUSH`
changes between selected natural calls, and a naturally invoked `SCRIPT(PLAN)`
returns `NIL` then a one-element `BLOX` list. The next oracle frontier is the
actual state mutator/caller sequence, the content and use of the returned
`BLOX`, or other integrated writer selectors and screen effects. A 64-call
natural VECTOR sequence exposed and corrected the JS formatter's non-tie
rounding, then validated later line continuations and breaks. These
observations do not yet justify an exact JS scene rule.
Existing high-fanout wrappers should be removed only deliberately so later
brush, fill, and message-loop calls become visible without changing the
original call graph.

## Execution split and model handoff

- Local Windows work: JavaScript implementation, parsers, fixture generation,
  report normalization, static analysis, tests, documentation, and bounded
  original-engine execution from disposable runtime copies.
- Windows Server 2022 Actions remains an independent oracle environment for
  cross-host checks.
- Use GPT-6 Luna at Max effort in successive batches for bounded investigations,
  candidate algorithms, capture tooling, implementations, and independent
  validation. The primary agent reviews probe design, ambiguous semantics,
  integration, and exactness claims. See the active plan for initial packets
  and file ownership; keep shared local oracle runs under one owner.

## Resume checklist

1. Read this file, `research/execution-plan.md`, then relevant roadmap evidence.
2. Check the branch and worktree; preserve any unrelated user changes.
3. Use focused checks required by the active task. Do not run the full test
   suites unless the user asks for test coverage or the investigation requires
   them; this project has previously encountered sandbox limits with the
   default parallel test-worker launch.
4. Inspect the newest evidence under `research/introspection/evidence/` and
   the referenced probe before making a claim.
5. Report progress, remaining work, next action, and blockers in the next
   user-facing continuation update without waiting to be asked.
