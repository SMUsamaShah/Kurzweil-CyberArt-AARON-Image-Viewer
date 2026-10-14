# Next AARON execution plan

For current counts, completion scope, and remaining milestones, see the
[progress report](progress-report.md).

Before local REA, oracle, or Git operations, use the central
[tooling quick fixes](tooling-workarounds.md). The reusable REA wrapper sets
the configured Ghidra/Java environment and retains query diagnostics.

Prepared 2026-09-27; updated 2026-10-14. This is the active work order; the older investigation
queue in [the roadmap](reverse-engineering-plan.md) is historical reference.

REA 6.4.0 is installed and verified for x86 PE inspection. Its Windows provider
still rejects raw named PLL payloads; exact mapped bytes can now be analyzed
through explicitly generated static PE containers. All three ZERO-EDGE,
BRUSH-FILL and FILL-IRIS dossiers match prior raw instruction decoding and
add CFG/reference/p-code data. See [the payload guide](introspection/rea-payload-analysis.md).
The old toolchain remains pinned for historical evidence. See
[the update record](rea-update-20261011.md). The ZERO-EDGE constructor helper
now derives identical portable evidence independently, with all 140 source
bindings revalidated. The subsequent explicit-call milestones follow below.

The two-input milestone now completes: PERIM 3 at START (3,3,1) on the
zero 7x7 map returns five points (3,3,3), (4,2,5), (5,3,7), (4,4,1),
(3,3,1), with the last EQ supplied START and its final slots unchanged.
The separate START (3,3,0) sample changes only array[3,2] to 1 and returns
NIL with START.Z=1. Both retain all 49 input cells and pass complete
original-state/controls k/o checks. The immutable-specification portable
evidence rebuilds identically with 199 sources. See
[the input findings](introspection/zero-edge-inputs.md).

The expanded 160-case matrix now completes in q: 40 direction/budget
zero-map cases, 64 picture-edge cases and 56 shape/value cases. Fresh
START/scratch objects, complete returned points/identities, all original
map/binding checks, copied previews and own COMPLETE/END pass. Fresh
controls p/r match all four actual output files. The separate required-END
runner prevents stopping a post-MAIN observer before its terminal marker.
See [the matrix findings](introspection/zero-edge-input-matrix.md).

The 40 final START-direction differences are resolved in a revised
hypothesis: FOOB outside returns NIL immediately. Its frozen native branch
supports that early exit. Independent comparisons now match all 160
captured return/START/map/path/identity results; the intermediate steps
remain inferred. The portable matrix derives byte-identically with 285
source bindings and the native 56-source closure revalidated.

The subsequent 39-case holdout now completes with fresh controls s/v and
independent byte-identical evidence derivations across 403 source bindings.
It measures tiny/rectangular maps, relocated starts, first-neighbor values
and larger PERIM. The 9x11 ring returns 21-point lists at direction0,
PERIM19/20; direction2 returns NIL at all 18/19/20 budgets. The independent
JS model now matches all 199 captured cases, including 511 returned points
and 61 supplied-START mutations. See
[the holdout findings](introspection/zero-edge-holdout.md).

The deeper REA investigation completes with three native dossiers and two
actual ZERO-EDGE reference queries. Independent portable derivations match
across 70 sources, and the reusable builder reproduces all retained PE/seed
bytes. No synthetic input was executed; generated headers/addresses remain
analyst assertions. The isolated dossiers do not resolve Lisp dispatch or
establish original source/ABI.

The complete natural BRUSH-FILL row/iris observer now covers two current
768x1080 modes with fresh same-mode controls. It records 63,592 paired
calls/returns across 137 BRUSH-FILL calls, resolves five observed non-unit
transitions to `current LY - 2`, and links 440 positive scans to later
same-fill PATCH-EDGE starts; six positive scans have no same-fill start. These
measurements do not recover branch conditions or unwrapped callers. Read the
[row/iris findings](introspection/brush-fill-row-iris.md) and
[portable evidence](introspection/evidence/brush-fill-row-iris-20261012.json).

The first bounded natural VALUE=0 map capture now completes in
`brush-stroke-value0-capture-20261012-b`, bracketed by two fresh before
controls and one fresh after control.
It records the first MULTI, EMPTY, and SINGLETON strokes, 90 predicate returns,
and 12 complete 768x1080 map snapshots; every drawing and scene report matches
the three controls. See the [VALUE=0 findings](introspection/brush-stroke-value0.md)
and [portable evidence](introspection/evidence/brush-stroke-value0-20261012-v4.json).
The multi path records 81 true predicates and 33 changed cells (20 1-to-0,
13 3-to-0); the singleton has nine true predicates but no net map change, and
the empty path has none. A predicate-coordinate zeroing candidate reproduces
all three captured final maps, but the observer did not trace individual stores.

The existing isolated `applyMeasuredBrushStroke` adapter remains separate
from natural call order and empty/singleton screen calls. A second, source-bound
VALUE=0 capture now tests `applyObservedNaturalBrushStrokeValue0` on three
selected raw maps, including the first natural MULTI path at `ALL-BRUSHES`
index 5 and `WIDTH=17`: 83 points, 4,648 true predicates, and 1,575 changed
cells. The 182-offset captured CORE matches the JS profile, and the function
reproduces all three captured maps. Its callback receives the captured
SCREEN-RETURN map, so this validates the adapter's map transition and order,
not screen rendering or scene parity. Two independent portable derivations
match; read the [updated findings](introspection/brush-stroke-value0.md) and
[v5 evidence](introspection/evidence/brush-stroke-value0-20261012-index5-v5.json).

REA 6.4.0 still reports all three BRUSH-STROKE computed calls unresolved with
no targets; these are static observations on the analyst-generated PE. See
[REA analysis](introspection/rea-payload-analysis.md) and
[portable evidence](introspection/evidence/rea-brush-stroke-control-flow-20261012-v4.json).
The v6 capture now covers a natural MULTI VALUE=0 sample at `ALL-BRUSHES`
index 4, width 13, and the distinct 97-offset CORE: 29 path points, 2,813 true
predicates, and 38 changed map cells. The JS adapter reproduces the captured
stroke-return map using captured predicate decisions and SCREEN-RETURN map;
SCREEN-AND-STORE returns NIL, and no screen or scene parity is claimed. See
[the findings](introspection/brush-stroke-value0.md) and
[v6 evidence](introspection/evidence/brush-stroke-value0-20261012-index4-v6.json).

The bounded integer predicate is now compared in existing natural parent
captures: 296,912 ordered checks in 70 value-3 brush strokes and 81,110 in 24
feature-buffer calls, with all accepted/rejected results matching the
inclusive JS rectangle helper. The separate v2 seed-1234 scene window records
224 NIL results in its first 1,400 calls under a matched composite-loader
setup, but has no per-call frame identity; its cross-run frame joins remain
hypotheses. See the [IN-SUB-FRAME dossier](introspection/in-sub-frame.md),
[boundary evidence](introspection/evidence/brush-stroke-boundary-parity-20261005.json),
[feature-buffer evidence](introspection/evidence/brush-feature-buffer-parity-20261006.json), and
[call-window evidence](introspection/evidence/in-sub-frame-initial-window-v2-20261013.json).
Non-integer/error behavior remains unresolved. A separate complete 768×1080
writer-stream run now proves that its first natural `IN-SUB-FRAME` return lands
at `BRUSH-STROKE+0x1cf`; both live code ranges match unique PLL payloads, and
fresh source-hashed before/after controls match six saved output artifacts.
This establishes only that first call, not later calls or the 768×1080
false-row census. See the
[caller evidence](introspection/evidence/in-sub-frame-native-caller-20261013.json)
and [updated findings](introspection/in-sub-frame.md). Natural ZERO-EDGE
context, per-call frames for census rows, intermediate helper traces, and
scene-level JS parity remain open. A new source-bound pre-scene scan inspected
1,380 compiled objects and found one ZERO-EDGE symbol reference in
`BUFFER-HOLE` at constant index 1, with no scan errors or truncations. Fresh
controls before and after match all six output artifacts and six staged scene
sources in the measured 320x480 regime. A bounded live entry attempt then
revalidated both full payloads against the PLL but saw no ZERO-EDGE entry
before the process ended. The runner session lasted 32.837 seconds; 150
seconds was the helper's maximum, not the observed wait. This does not confirm
`BUFFER-HOLE` as a caller or generalize to other canvases. REA 6.4's
`BUFFER-HOLE` dossier has now narrowed its native calls to an unresolved
computed-call boundary. A separate hardware breakpoint at the live
`BUFFER-HOLE` entry also saw no entry in one fresh 320x480 scene; six outputs
and six scene sources match fresh controls, and both target payloads match the
PLL. The combined evidence binds 75 sources and derives byte-identically
twice. The completed canvas-size probe now brackets a fresh 768x1080 observer
with no-probe controls; all six drawing/scene outputs and six scene sources
match. The previously measured 320x480 triplet remains separate. Both regimes
enter SET-UP-SCREEN-SIZE with 640x480 globals, but its exit state differs.
The cause remains unknown, and REA 6.4 leaves the relevant native dispatch
calls unresolved. A fresh uninstrumented recheck for the 768x1080 caller
attempt instead returned a complete 320x480 AA0 that matches the earlier
source-bound 320 control across all six outputs and six staged sources. The
768-specific breakpoint was not armed. Retry only after a fresh no-probe run
measures 768x1080. At that checkpoint, the next runtime-measurable question
was the FREE-PATH distance boundary in the repeatable 320x480 regime; the later
768x1080 FREE-PATH captures are recorded below. See the
[canvas findings](introspection/canvas-dimensions.md),
[portable canvas evidence](introspection/evidence/canvas-size-native-links-20261013.json),
[REA analysis](introspection/rea-payload-analysis.md),
[reference findings](introspection/zero-edge-native-links.md),
[caller findings](introspection/zero-edge-native-caller.md),
[ZERO-EDGE evidence](introspection/evidence/zero-edge-native-caller-20261013.json),
and [combined BUFFER-HOLE evidence](introspection/evidence/buffer-hole-native-investigation-20261013.json).

Three positive PERIM samples now complete at START (3,3,0) on a zero 7x7
UBYTE4 map. PERIM 1/2 return NIL and leave START.Z at 4/2. PERIM 3 returns
five points in exact order (3,3,2), (3,2,4), (4,2,6), (4,3,0), (3,3,0),
with the last point EQ original START and its final slots unchanged. All
scratch cells stay zero; original full maps/bindings and both fresh controls
pass. The portable aggregate has independent byte-identical derivations and
230 source bindings. See [the positive samples](introspection/zero-edge-positive.md).
The two-input capture above completes its direction/cell follow-up.
The native map-value branch and that cell selection are hypotheses; these
calls do not recover general traversal or a PERIM interpretation.

The first explicit ZERO-EDGE call now completes in frozen single-call v3:
START (3,3,0), PERIM 0, zero 7x7 UBYTE4 scratch map; one NIL return, supplied
START.Z changes to 6, all 49 scratch cells stay zero. Complete original map
checks and restored bindings pass, and both fresh drawing/scene controls
match. See [the isolated-call findings](introspection/zero-edge-traversal-single.md).
Its portable publication passes independent byte equality and all 166 source
bindings. The positive-PERIM samples above supersede its earlier next step.
General traversal and PERIM meaning remain
unrecovered. Today's natural map dimensions are 768x1080; compare current
captures to current controls, retaining the older 320x480 evidence separately.

The 2026-10-06 native checkpoint maps six painting/buffer objects and validates
1,364 instruction rows against the PLL, with fresh drawing/scene controls.
See [the native findings](introspection/brush-painting-native.md). The current
buffer experiment now matches 24 natural feature calls, 81,110 ordered
predicates and 3,686,400 full output cells. All three head outputs compose
exactly, and all 6,965 extra clear-entry 3 positions have captured feature
changes. See [the feature findings](introspection/brush-feature-buffer.md).
Its first tape is excluded for missing MAIN/READY and COMPLETE/END.
FOOB now matches two complete 188,081-input integer grids, two 324-point
single/double-float matrices and all 166,072 natural calls, with fresh controls.
T means outside the inclusive 0..dimension-1 rectangle; 319.5 is outside a
width-320 picture. See [the FOOB findings](introspection/foob.md).
Its native object and ZERO-EDGE have separate
unique complete PLL matches and 448 byte-checked instruction rows, with
canonical external REA records and a fresh control. See
[the predicate native findings](introspection/brush-buffer-predicate-native.md).
The separate ZERO-EDGE contract capture now measures positional MAKE-TRIPT
X/Y/Z and one (17,23,6) point's direct slots/getters after MAIN, with a complete
zero-error footer and fresh drawing/scene control. Read
[the contract findings](introspection/zero-edge-contract.md). ZERO-EDGE itself
was not invoked by that constructor probe. The separate single-call v3
observation above now measures one input; PERIM's domain and traversal remain
unresolved. Continue with bounded positive-PERIM cases, then the complete BRUSH-FILL row/iris schedule and
value-0 painting. Head feature selection and original geometry remain inputs.

**Progress:** Milestone 1's complete writer and AA0 replay is achieved for
controlled seeds 1234 and 5678. JavaScript carries writer state through 28,075
and 33,198 original calls, respectively, and reproduces every command byte.
Given the original files' parsed palette values, it also serializes the AA0
prelude and composes both complete byte-identical paintings. The 25-case
original SELECT-BRUSH matrix and its exhaustive 0–200,000 integer sweep now
have a matching JavaScript selector. Its first natural direct caller is also
confirmed as `BRUSH-FILL`, beneath `DISPLAY-COLOR-PATCHES`, by exact PLL matches
and native runtime breakpoints. The count boundary is now measured across two
complete scenes: all 274 selectors consume MY-FILL(SUBFORM)'s count, and the
following BRUSH binding equals the returned object or NIL.
The actual generic methods also have exact PLL matches. The count writer is
now located inside POST-FILL's SUBFORM method: 427 MY-FILL/POST-FILL pairs and
181 count changes agree in complete controlled traces. Both POST-FILL methods
and four ordinary helpers match exact PLL objects. The independent SUBFORM
post-fill helper now matches all 278 counts/returns and 1,130,814 captured
output map cells in those scenes. Fill values 0/1 and FLAG-BIT 32768 are the
observed domain; the value-2 conversion remains a native inference. Three
fill-preparation helpers now match 427 calls each and all 1,883,204 output cell
comparisons summed over per-call captured regions: SET-MEDIANS, GOOD-START
and FILL-STRATEGY. The comparison
computes its own medians and complete outline rotation. The boundary-map
helpers now match 149 list writes and 70 inclusive clears, comparing every
cell of every output map: 33,638,400 comparisons across both paintings.
All 149 CFORM writer/median/start/strategy compositions also match their
1,295,917 captured strategy-region cells. Point lists, entry maps and selected
frame construction remain original inputs for those CFORM cases. SUBFORM
boundary construction now derives its outline and frame with PATCH-EDGE and
LIST-FRAME, and the composed fill matches all 278 cases and 85,401,600 complete
output-map cell comparisons. Existing maps are preserved before filling;
The row seed is now derived by recovered SCAN-ROW/NEIGHBORS: all 5,805 natural
scans and 6,984 neighbor calls match, including 278 composed SUBFORM fills.
The 44,544 neighbor and 10,368 scan matrix cases repeat in each painting.
BRUSH-FILL preparation now derives form selection, 134 initial rows, 5,805
row bounds/patch inputs and 278 MAX values from naturally returned plan/frame
data. The aligned complete SUBFORM comparison passes again. The later row
jumps now have a bounded follow-up in the 768x1080 evidence above; their cause,
general schedule, plan creation and earlier map history remain unresolved.
CFORM POST-FILL matches 149 calls and 45,772,800 complete output cells,
including the composed outline pipeline and 22,886,400 full entry fill cells.
Its rectangle excludes RX/TY; target0/1/2 and BACKGND0 are measured.
The complete natural BRUSH-STROKE census now pairs all 3,881 strokes,
including 70 value-3 strokes and 70 clears, with fresh drawing/scene controls.
It measures counts and first-seen CORE geometry. The natural long value-3
branch now matches 70 markers, 296,912 ordered predicates and 10,752,000 full
output cells; all 3,881 stroke returns preserve original path identity. All
70 natural clears match another 10,752,000 full output cells and fresh controls.
Short CORE paths and value-0 painting remain open. There are 6,965 additional
clear-entry value-3 positions that were 0/1 at marker exit. Complete feature
boundaries now account for all of them, with matching JS maps and fresh
controls. The ZERO-EDGE and BRUSH-FILL row/iris milestones above supersede
this earlier queue. Value-0 painting and replacing original writer decisions
and palette values with upstream JS rules remain open. All three natural
seed-1234 FREE-PATH calls and the one natural seed-5678 holdout call now
reproduce their complete point lists and following RNG states. A first
path-to-writer drawing unit is measured; palette construction and scene-level
decisions remain unresolved.

The target is independent JavaScript generation from an explicit seed and
configuration. The fastest route is to finish one complete output boundary,
then repeatedly move its inputs upstream: writer arguments, paths, forms,
scene geometry, and finally seed-driven planning. Each step should reduce the
information supplied by the original program.

## Starting point

- The local Windows oracle completes controlled seed-1234 paintings in about
  20 seconds. Repeated complete AA0 files have SHA-256
  `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1`.
- The full seed-1234 painting has 28,075 writer calls. Continuous JavaScript
  replay matches every original command slice and previous-point transition.
  The distinct seed-5678 holdout has 33,198 calls and also matches in full.
- The seed-1234 `image` command stream is 124,575 bytes and equals the AA0 suffix
  at offset 2381. An original-style serializer reproduces the 2,381-byte
  header/palette from parsed semantic palette values, then composes the exact
  AA0. Seed 5678 likewise matches with a 156,452-byte command stream.
- RNG, FREE-PATH, brush masks, and several geometry helpers have comparison
  fixtures. The composition, figure, colour, and integrated drawing code is
  still partly or wholly provisional.
- Use the established post-INIT-RANDOM reseed for calibration. Normal startup's
  process-dependent seeding can be recovered after the drawing pipeline works.

Evidence: [stroke findings](stroke-findings.md),
[scene context](scene-context-findings.md), and [random findings](random-findings.md).

Relative effort: brush selection is the smallest semantic task; continuous
writer replay is a contained tooling/integration task; natural FREE-PATH
validation is a moderate extension of an existing port. Complete forms and
scene generation have substantially more unknown dependencies. Finish the
first three while using their results to choose the larger work precisely.

## 1. Reproduce the complete writer stream from recorded decisions — achieved for two seeds

This is the first completion target. Extend the existing writer probe into a
compact complete capture, with an explicit call/byte cap and a failure marker
if it truncates. Record typed arguments, mode changes, call order, entry/exit
state, and output positions. Preserve numeric precision and distinguish a
closed stream from a failed method. Avoid opening a report for every tiny
field if that makes the full capture unnecessarily slow.

Build a JS replay command which initializes the writer once and carries its
state through the complete sequence. Captured previous-point values are
assertions, not replacement state fed into each call. If a binding changes
between writer calls, identify its real owner and record an explicit boundary
event rather than silently resetting the JS state.

The comparison should report the first differing call, input, byte offset,
expected output, actual output, and previous state. Account for every stream
byte and any gaps or writes outside STORE-IN-FILE. After the command stream
matches, serialize the header/palette from captured semantic values and check
the complete AA0 file. A copied prefix must remain an explicit dependency.

**Gate 1A:** all original writer calls replay with continuous JS state,
matching every output slice and observed state boundary, and the complete
command-stream bytes/hash match. Sequential ordinals, successful exits, and
selector totals check capture coverage; they do not replace byte/state checks.
The seed-1234 scene has no DIMS selector call; account for dimensions and
palette/header initialization separately. This gate is an independently useful
completion point and should not wait for header recovery.

**Gate 1B:** reconstruct the file wrapper from semantic values, compare the
entire AA0, and repeat on seed 5678 using the same algorithm and declared
configuration. This can proceed alongside the upstream work. The local runner currently
exposes seed-1234 modes, so reuse the existing 5678 startup probe or add a
validated seed parameter as part of this work. Existing 1234 and 5678
are calibration/validation cases; reserve a further seed for a fresh holdout.

**What this proves:** complete file construction from original decisions. The
original program still supplies those decisions. Reading or copying AA
commands alone does not satisfy this milestone.

The complete capture, replay tool, composed-AA0 comparator, and compact
evidence summaries are now retained. Raw tapes and paintings stay ignored
under `research/extracted/`. Both controlled seeds pass Gate 1A and the
captured-palette scope of Gate 1B. Recovering the seeded palette algorithm
and painting decisions belongs to the upstream milestones below.

Keep complete raw captures and generated pictures under ignored
`research/extracted/`. Retain the probe, replay tool, hashes, compact summaries,
and enough bounded original cases for portable regression tests.

## 2. Recover two useful upstream rules in parallel

### Brush selection — integer domain, caller and assignment boundary measured

SELECT-BRUSH was the smallest promising decision function. Its integer sweep
now covers all 200,001 inputs from 0 through 200,000; JavaScript matches every
result. Additional diagnostic integers sample the nearby tails. The natural
`7131 -> brush ID 2` call remains the first observed selector input.
The 0–100 inputs return NIL, bands are low-exclusive and
high-inclusive, and the two tested tails return brush 6. The original painting
and scene-report hashes remained identical to the controlled baseline.

The probes used real startup brush objects and recorded result identity,
binding changes, and copied-state random previews. Tail extrapolations and
fractional inputs remain unmeasured. The implementation does not claim
integrated brush assignment.

The first native caller path is now measured as
`DISPLAY-COLOR-PATCHES → BRUSH-FILL → SELECT-BRUSH`; two breakpoint runs matched
a fresh control's AA0 and scene report. See
[the caller report](introspection/select-brush-caller.md) and
[the native tool workflow](native-analysis-workflow.md).
The follow-up [count/assignment evidence](introspection/brush-fill-count.md)
now accounts for all 274 natural selector calls in seeds 1234 and 5678. All
70 subpart entries use the exact selected object; ten change the brush to 1
by exit. Every observed SCAN-ROW entry/exit count is unchanged. MY-FILL's
EQL SUBFORM and EQL CFORM methods have exact complete PLL matches, while its
generated dispatcher remains explicitly unmapped.

The [POST-FILL investigation](introspection/post-fill-count.md) now locates
the count reset and increment inside its actual SUBFORM method. All 427
MY-FILL/POST-FILL pairs agree at their count boundaries; FILL-STRATEGY and the
other three observed helpers show no entry/exit count changes. Both POST-FILL
methods have exact complete PLL matches. The
[SUBFORM map comparison](introspection/evidence/post-fill-map-parity-20261005.json)
matches every captured cell, count and return in all 278 calls. Complete
original frame/map regions and natural target readers remain inputs. The
[fill-preparation comparison](introspection/fill-preparation.md) now reproduces
SET-MEDIANS, GOOD-START and FILL-STRATEGY for all 427 complete outlines and
1,883,204 output cell comparisons summed over those calls. Fill values 0/1/2
and both VISPT/TRIPT point
types occur; FILL-STRATEGY's value-2 guard is measured, while POST-FILL's
separate value-2 conversion still needs an original holdout. The
[boundary-map comparison](introspection/boundary-map.md) now matches all 149
CFORM list writers and 70 frame clears, and composes the writer with the
preparation helpers. The [SUBFORM boundary comparison](introspection/subform-boundary.md)
now derives outlines and frames for all 278 natural calls and composes the
strategy and POST-FILL with complete maps. Its upstream map equality checks
show existing state is carried into MY-FILL. SCAN-ROW/NEIGHBORS now derive the
row point. [BRUSH-FILL preparation](introspection/brush-fill-preparation.md)
now derives its initial bounds/MAX/patch selection from the natural plan and
frame data. [CFORM POST-FILL](introspection/cform-post-fill.md) now matches
complete maps and the composed outline pipeline. Earlier map history and the complete row schedule
and the integrated callers remain open. The two iris paths per
scene and the subpart brush changes also need characterization before
integrating a caller policy.

The rejected first preparation observer changed the drawing despite zero
reported errors. An extra RX reader call advanced the random-state preview.
Use only required readers and require fresh control-byte equality; the final
observer passes all 2,562 snapshot preview checks and both complete controls.

### Natural FREE-PATH calls — first controlled corpus matched

The JS helper passed isolated cases. The controlled seed-1234 scene has three
natural calls, not the historical 18 from a truncated trace. Their typed
input edges, returned points, unchanged inputs, unbound index bindings, and
RNG previews are retained in a strict, non-evaluating parser and compact
evidence file. The three complete paths and following RNG states now match
in JavaScript, with 136, 28, and 37 raw random words consumed. The independent
seed-5678 holdout has one natural call; its 47 points and following state also
match, with 133 raw random words consumed.

The comparison reconstructs each incoming RNG state by scanning the verified
seed stream for the three copied-state previews; each has one match in the
search window. Recorded random returns diagnose the third call's early stop,
but the JS replay computes its own random values. An explicit per-edge type
decision resolves mixed single/double inputs. A new retained regression case
checks all three paths independently of the ignored raw capture.

**Current gate:** the FREE-PATH distance-stop boundary remains unresolved.
JavaScript matches the three natural seed-1234 calls and one seed-5678 holdout.
Across nine controlled one-edge cases, it matches four and differs by one
iteration in five. The v8/v9 vertical single-float cases selected 14 steps and
consumed 12 in the original versus 13 in JavaScript. Step-sum predicts 13/13,
source-to-emitted predicts 13/12, and step-times-wiggle predicts 12/12. Only
the last matches both observed counts, but this finite local replay does not
establish a general rule. Do not widen the implementation from these samples.

The first boundary matrix now contains 40 complete direct calls over 20 input
shapes at seeds 1 and 1234. Its scene used the measured 768×1080 regime. The
observer runs only after the original MAIN and writer-stream observer return;
the complete triplet matches all six drawing/scene outputs and six staged
sources. This validates the capture placement. The 40-case matrix itself is
compared offline against JavaScript for the 30 canonical closed-list inputs;
26 match exactly across the RAN sequence, returned points, following random
checkpoint, and input immutability. Four seed-1234 polygon rows differ. Eight
noncanonical index rows and two signed-zero rows remain unclassified. This
does not recover a general stop rule. A second triplet isolates three
length-10 forward edges at 768x1080. Original consumption is 10/10, 11/13,
and 12/14 selected iterations for seeds 522862, 256819, and 348048. JavaScript
matches only seed 256819. Seed 522862 falsifies the current early step-sum
break, while the two candidate progress measures agree with different cases;
neither is established as the general original rule. The captured internal
progress variable remains unavailable. The 40-case matrix comparison is
complete; do not repeat it. A source-bound 320×480 caller triplet now captures
the first natural FREE-PATH entry. Its return offset identifies an indirect
`CALL EDI` site in DRAW-CFORM; this does not resolve the dynamic target or
generalize beyond the first call in that scene. The earlier 2026-10-13
low-space attempt and two caller-helper defects are retained as diagnostics;
the completed triplet passed its fresh control and source checks. Next choose
a discriminator for the remaining stop-rule mismatches. See the [matrix findings](introspection/free-path-boundaries.md),
[matrix comparison evidence](introspection/evidence/free-path-boundary-js-comparison-20261013.json),
[isolated edge evidence](introspection/evidence/free-path-stop-boundary-20261013-v2.json),
[seed candidate finder](tools/find-free-path-emitted-point-boundary-seeds.mjs),
[portable evidence](introspection/evidence/free-path-boundaries-20261013.json),
and the reusable [triplet verifier](tools/verify-local-aaron-triplet.mjs).

The v4 source-bound 320×480 triplet fires its controlled case at the first
successful traced `STORE-IN-FILE` exit (depth 7). The original consumes 12 of
14 selected steps, returns 15 points, and leaves next RNG value 82821; JavaScript
consumes 13, returns 16 points, and leaves 92793. Five drawing/scene outputs
and six ordinary staged sources match both fresh controls. The observer's
planning trace differs only as an observer diagnostic because the probe adds
PREP-LINE and STORE-IN-FILE trace targets; the bracketing traces match. This
does not capture a natural FREE-PATH caller or establish the stop condition.
See [v4 evidence](introspection/evidence/free-path-stop-boundary-20261013-v4.json),
[findings](introspection/free-path-native.md), and the serial
[triplet helper](tools/capture-free-path-stop-boundary-v4.ps1).

The v5 source-bound 320×480 triplet uses the same controlled trigger. For seed
332156, the original selected and consumed 9 steps, returned 12 points, and
left next random value 43251. JavaScript matches all 28 random calls, all
returned points, and the following random value. The complete observer and
fresh controls match on five drawing/scene outputs and six ordinary sources;
the observer-only planning trace remains diagnostic. This is a capped sample,
not a stop-rule recovery. The prior length-10 scan and v6 length-2 capture are
documented in the [FREE-PATH findings](introspection/free-path-native.md).
See [v5 evidence](introspection/evidence/free-path-stop-boundary-20261013-v5.json)
and the serial [triplet helper](tools/capture-free-path-stop-boundary-v5.ps1).

The v6 source-bound 320×480 triplet uses the same trigger for the length-2
edge `((0 0 0) (2 0 1))` at seed 79481. The original selected 13 steps and
consumed 11, returned 14 points, and left next RNG value 53424. JavaScript
matches all 34 random calls, returned points, and the next random checkpoint.
Step-sum, bare-wiggle, and step-times-wiggle predict 11; source-to-emitted-
point predicts 12. Five drawing/scene outputs and six ordinary staged sources
match fresh controls. This is one bounded case and does not close the stop-rule
gate. The local seed finder searched 200,000 seeds at lengths 2, 5, 10, 20,
and 40 without finding four distinct, uncapped predictions. See [v6
evidence](introspection/evidence/free-path-stop-boundary-20261013-v6.json),
[findings](introspection/free-path-native.md), [seed finder](tools/find-free-path-stop-model-seeds.mjs),
and the serial [triplet helper](tools/capture-free-path-stop-boundary-v6.ps1).

The v7 source-bound 768×1080 triplet uses seed 388 and the single-float edge
`((0 0 0) (0.2f0 0 1))`. The original selected 9 steps and consumed 8,
returned 11 points, and left next RNG value 15573. Single-precision JavaScript
matches all 25 random calls, returned points, and the next checkpoint. The
input coordinate and `XYDIST` result are confirmed single-float. Step-sum,
source-to-emitted-point, and step-times-wiggle predict 8; bare-wiggle predicts
7. It rejects bare-wiggle only for this sample. Five drawing/scene outputs and
six ordinary sources match fresh controls. The strict evidence derivation is
byte-identical on repeat. See [v7 evidence](introspection/evidence/free-path-stop-boundary-20261013-v7.json),
[findings](introspection/free-path-native.md), and the serial [triplet
helper](tools/capture-free-path-stop-boundary-v7.ps1).

## 3. Produce one complete drawing unit from higher-level inputs — point emission measured

The first eight natural `SCREEN-AND-STORE` inputs for each of two independent
seeds reproduce 2,014 exact original writer bytes in JavaScript from 551
captured path points and 28 captured colour-change events. The point-to-writer
rule is recovered for these 16 units; colour-event selection, RNG consumption,
and map effects are not yet generated. The compact fixtures check each call
against the complete writer tape and the corresponding original byte slice.

The controlled transition report did not observe a call to
`MAKE-PAINTING-COLORS` or `MAKE-COLORSPEC` before the painting completed, so
those are poor immediate palette targets for this scene. The first observed
`ASSIGN-COLORS` entry already has a populated `RGB-MAP`; identify its producer
inside the preceding display/colour phase before attempting palette logic.

Use the full writer comparison to attribute output to its callers. Capture
call IDs/parent IDs around a small number of actual drawing boundaries rather
than tracing every helper indiscriminately.

Use a short natural SCREEN-AND-STORE/PREP-LINE path as the continuing target: it
connects the measured brush-path forwarding to writer decisions. Capture it
inside the existing seeded scene, where the real PLAN, brush, colour, and
plane context already exists. Its earlier isolated failure at an unbound
MPLAN is evidence of missing context, not evidence that the natural path is
unusable.

In parallel, assess the early INITIALISE-PICTURE-PLANE/DRAW-CFORM outline route
for a smaller complete unit. Its early execution and unchanged tracked globals
do not establish a simple body. Switch priority only if a focused observation
shows a closed input/output contract that can be implemented sooner. The early
outline route and later paint route must not be assumed identical.

Capture its geometry/path, brush and colour inputs, visibility/map context,
RNG boundary, dependency calls, and full writer subtrace. Implement enough of
the caller to generate that subtrace in JS. Advance from a path to a complete
form, adding clipping, occlusion, or preparation rules only as the selected
unit requires them. Stubbed dependencies remain explicitly recorded until
their implementations replace them.

**Done when:** a JS routine accepts the original higher-level inputs and
generates the entire unit's command bytes plus relevant state/map changes.
It must compute the downstream writer calls rather than read them from the
fixture. Validate another input/call before widening the target.

## 4. Paint a whole captured scene in JavaScript

Expand the recovered drawing unit across all forms used by the reference
painting. Capture geometry, materials, ordering, and incoming state at the
natural handoff to drawing. RPARSE and drawing interleave, so a single snapshot
at the end of planning may be insufficient; preserve the actual sequence of
form events and shared-state transitions.

Recover missing fill, colour, and visibility rules in the order the first
divergence identifies them. Reuse the writer and natural geometry comparison
tools. Provide a visual comparison alongside byte and state results.

**Done when:** JS produces the complete original AA0 from captured upstream
scene/form data, including palette/header handling, without captured strokes
or writer calls. This establishes a complete painter for that supported scene
family; the original still supplies scene decisions and geometry.

## 5. Replace captured scene decisions with generation

Move upstream through one object/form family and its planner decisions at a
time. Begin with the simplest frequently used object whose inputs and outputs
are readable. Use the existing DEVELOP-PLAN/RPARSE/GENERATE-PERSON/BUILD-FIGURE
random-context evidence to locate the first divergence; avoid rewriting the
whole planner from visual resemblance.

Do focused PLAN/BLOX metadata discovery when a chosen caller needs it. Recover
verified slot/accessor contracts and concrete mutations before implementing
their meanings. Measure palette creation, object order, placement, geometry,
and random consumption with independent holdouts.

**Done when:** the JS generator takes only a declared seed/configuration and
creates a complete matching painting, without original code, captured
geometry, captured random returns, or captured command sequences. Broaden the
claim only after other seeds and supported configurations also match. Recover
the archived normal startup seeding separately from the controlled reseed.

## Agent organization

Use GPT-6 Luna at Max effort for independent investigations, candidate
algorithms, parsers, fixtures, implementations, and validation. The primary
agent chooses the next boundary, reviews uncertain semantics and probe
changes, integrates results, and decides what the evidence proves.

This session has four active agent slots: the primary plus three Luna workers.
Use successive waves as needed. A useful first allocation is:

| Owner | First work packet | Reviewable result |
|---|---|---|
| Primary | Complete-capture schema, probe review, serial oracle runs, integration | Deterministic full capture and decisions about unexplained state/writes |
| Luna A | Continuous writer replay and first-difference tool | Runnable comparison using the agreed schema; original state used only for assertions |
| Luna B | SELECT-BRUSH evidence/matrix design, then measured JS implementation | Boundary cases, candidate rule, original-vs-JS comparison |
| Luna C | Natural FREE-PATH data contract and comparison harness | Corpus parser and point/RNG mismatch report |

Rotate a worker into independent review after its deliverable lands. Later
waves own distinct path, map, colour, or figure routines with explicit file
ownership. Give each worker a bounded question, evidence paths, allowed edit
scope, completion check, and uncertainty list. Workers may propose semantic
hypotheses and tests; an untested hypothesis is not accepted as an exact rule.

Only one oracle process uses the shared `C:\temp` and AARON registry namespace
at a time. Queue those runs centrally while workers analyze captures or code.
Batch related cases into a reviewed probe; verify that observational changes
preserve the controlled original output. Extra workers should address distinct
dependencies or independently check a risky result.

## Keep work focused

- Preserve a local checkpoint of the completed changes before large new edits;
  inspect the current dirty worktree and retain existing work.
- Put the experiment's question and acceptance check before the run. A useful
  batch delivers an exact routine, a completed pipeline boundary, a concrete
  first divergence, or a disproved hypothesis that changes the next step.
- After complete writer replay passes, shift effort upstream. Additional
  writer probes should address a specific observed mismatch or new mode.
- Use static disassembly/ReAgent only for a specific native dependency that
  runtime observation cannot resolve. Broad binary inventories, Windows UI
  emulation, compatibility tuning, and visual embellishment are not the next
  bottleneck. Preserve screen-related calls/state when they affect output.
- Keep the provisional demo usable; add recovered modules without tuning
  guessed composition rules to one reference image.
- Reports should state the input still supplied by the EXE, the largest
  complete output produced by JS, tested seeds/configurations, and the first
  remaining mismatch. Test counts and sampled-call counts are not percentages
  of the generator recovered.

Continue from the completed natural FREE-PATH caller capture in the
[progress report](progress-report.md) and continuity handoff. In one
320×480 `writer-stream-seed-1234` scene, the first FREE-PATH entry returned
into DRAW-CFORM after its indirect `CALL EDI`; the caller bracket and source
checks pass. Keep that relationship scoped to the captured first entry, and
leave the computed call target unresolved. The writer-replay milestone remains
achieved; do not restart it unless a specific new mismatch makes that evidence
relevant.

The v9 seed-46380 FREE-PATH discriminator is complete. Its 768×1080 source-
bound triplet and all controls passed; the original selected 14 steps and
consumed 12, while JS consumed 13. Across v8 and v9, three local candidate
signatures are 13/13 (step-sum), 13/12 (source-to-emitted), and 12/12
(step-times-wiggle), leaving only the last consistent with the two captured
counts. This is not an observed internal variable or general stop rule. Across
nine isolated cases, JS matches four and differs by one step in five. See the
[v9 evidence](introspection/evidence/free-path-stop-boundary-20261014-v9.json)
and [FREE-PATH findings](introspection/free-path-native.md).

Six complete natural screen-unit context triplets now cover seed-1234 units
1, 2, 3, 5, and 6, plus seed-5678 unit 1 at 320×480. Their captured points
and `AARGB` decisions replay 837 original writer bytes. Units 2, 3, 5, and 6
provide 12 natural `PICK(27,28,29)`/`PREVDEX` comparisons that fit the
“write when the return differs from PREVDEX at nested RAN entry” candidate in
12/12 calls. All four units are from the same seed-1234 painting, so this is
not an independent-seed or controlled downstream test. Unwrapped helpers could
intervene; no direct source-level caller, exact native state slot, or JS color
contract is established. A separate source-bound controlled triplet supports
the fixed three-integer `PICK(27,28,29)` contract across 16 seeds: the return
and next random value match one `RAN(0,2)` draw, and the JS adapter matches all
16 rows. Other arities and types remain open. See the [screen-unit findings]
(introspection/screen-unit-context.md), [unit-3 evidence]
(introspection/evidence/pick-prevdex-seed1234-unit3-20261014.json), [12-case
candidate](introspection/evidence/pick-prevdex-natural-candidate-units2-3-5-6-20261014-v2.json),
and [controlled PICK evidence]
(introspection/evidence/pick-contract-three-args-seed1234-20261014.json).
Three return-substitution interventions are now complete at measured
768×1080 in seed-1234 unit 2. V11 and v12 substitute `PREVDEX` for two natural
returns and each is followed by no HDEX write. V13 changes only the first
PICK's caller-visible value from 34 to 33 with `PREVDEX=35`; its preserved
`RAN(0,2)` selects index 1, and the following event is `HDEX=33` at call 965 /
writer ordinal 804 before the next PICK. This matches the candidate on both
observed sides in one seed and regime. The v13 before root was a complete
no-probe control captured shortly before the observer and reused after its
strict summary/hash gate; it and the fresh after control match six outputs.
Ten ordinary staged sources match. AA0 and image are intentional differences;
image ID is unchanged. The tape is a 50,000-call prefix of 100,029 total calls
but covers the selected writer slice. This adds no JS contract and proves no
direct caller or general rule. See the [v11 evidence](introspection/evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v11-20261014.json),
[v12 evidence](introspection/evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v12-20261014.json),
[v13 evidence](introspection/evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v13-20261014.json),
and [screen-unit findings](introspection/screen-unit-context.md).

The previously planned terminal third PICK in the 320×480 seed-1234 unit-6 evidence:
natural return 28 equals `PREVDEX=28`, and no HDEX write follows before unit
end. Preserve its native RAN draw, substitute caller-visible 27, and check
for `HDEX=27` before unit end. Require a fresh no-probe control whose AA0
header measures 320×480; do not force the display mode. This checks a second
regime in the same seed, not an independent-seed holdout. Require a source-
bound triplet, then collect an independent seed before promoting the
candidate; do not alter the function or milestone counts from this evidence.

The v15/v16 source-bound treatments tested both sides of the shifted triple in
seed-5678 unit 6 at 768×1080. V15 targeted the second natural
`PICK(33,34,35)`, returned 34 with `PREVDEX=34`, and nested `RAN(0,2)=1`;
substituting caller-visible 35 yielded one `HDEX=35` before the next PICK.
V16 targeted the terminal third PICK, returned 33 with `PREVDEX=34`, and
nested `RAN(0,2)=0`; substituting caller-visible 34 produced no HDEX write
through unit end. Both fresh controls match all six compared outputs, and
seven ordinary Lisp sources match. The selected intervals cover 90/88 writer
calls and 291/277 bytes; each is within its observer's 50,000-call tape
prefix (100,821/100,819 calls total). Together with v11/v13, the candidate
matches four controlled return interventions across two seeds. This remains
bounded evidence, not a direct caller proof, general rule, JS contract, or
parity. See the [v15 evidence](introspection/evidence/pick-prevdex-return-intervention-seed5678-unit6-768x1080-v15-20261014.json),
[v16 evidence](introspection/evidence/pick-prevdex-return-intervention-seed5678-unit6-768x1080-v16-20261014.json),
and [screen-unit findings](introspection/screen-unit-context.md).

This earlier PICK-caller task is superseded by the
[2026-10-14 native return-object checkpoint](#current-checkpoint-pick-native-return-object-2026-10-14)
below. Keep the next step bounded to name resolution and live call-site
validation; do not infer identity from nearest-observed labels or event order.

The v4 probe's third seed-1234 unit at 768×1080 had no `PREP-LINE` or writer
calls and correctly failed the color observer's nonempty gate. In a separate
320×480 v5 run, ordinal 3 is populated, so the v4 result is diagnostic rather
than an ordinal rule. The v5 observer was configured for unit 5 and matched
fresh controls; the completed v6 triplet now measures unit 6. Keep FREE-PATH
and point-generation inputs explicit until independently established.

## Current checkpoint: SELECT-SUBJECT direct caller, 2026-10-14

The first natural PICK entry was captured in a complete source-bound
768×1080 seed-1234 triplet and returned to `0x1fe4c07f`. Its live call bytes
`FF 57 27` match the indexed PLL at payload offset 200; the return is offset
203. Entry-seeded REA/Ghidra disassembly confirms `CALL [EDI+0x27]`, followed
by `MOV EDX,EAX`. REA still cannot resolve the computed target.

A separate complete source-bound 320×480 triplet enumerated the two
`SELECT-SUBJECT` methods, `(EQL FREE)` and `(EQL PREMIUM)`, captured both live
native windows, and matched each to a unique complete PLL object. The PREMIUM
method is the same 362-byte object as the prior PICK return: both complete
payload and object hashes match, and the measured call/return offsets agree.
This identifies the direct caller for that captured PICK entry. The census
was read-only and did not invoke either method. See [PICK caller findings](introspection/pick-native-caller.md),
[method identity findings](introspection/select-subject-methods.md),
[PICK evidence](introspection/evidence/pick-native-caller-live-site-20261014-v4.json),
and [method identity evidence](introspection/evidence/select-subject-method-identity-20261014-v2.json).

Next inspect the two captured native method bodies, then design a bounded
read-only probe for their outputs and observable state effects. Keep FREE and
PREMIUM cases separate and require fresh same-runner controls. This adds no
JavaScript behavior contract and proves no painting parity. Coverage remains
31 routine names / 32 bounded contracts, 1/5 milestones (20% by count), and
zero whole-painting parity; there is no defensible overall percentage.
