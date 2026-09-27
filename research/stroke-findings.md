# Stroke pipeline findings

The constant-reference scan in run
[34016252902](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34016252902)
examined 2,098 function/method/nested-function objects and reported 28 matches
without inspection errors. Constant references are leads, not proven call edges.
Its final `names=602` is a reporting bug: SORT destructively rearranged the
list while the old head was used to calculate length. Do not use that field
as an inventory count; the scan traversed the sorted result. The probe now
stores the returned head before counting.

## Recovered point helper's role

RASTRA-LOCKS is the only other scanned function whose constants reference
LOCK-WIGGLE. Its other references include PLMID, PRMID, CHIN, BRIDGE, and BSTERN.
This suggests a specialised anatomical detail, possibly hair locks. It does
not support identifying LOCK-WIGGLE as the main FLA. Unknown dynamic calls,
closures, or deeper nested constants are outside this bounded scan.

## Separate outline and fill routes

The retained constants do not establish a direct `FREE-PATH` to
`BRUSH-STROKE` call edge. `DRAW-CFORM` references `FREE-PATH`, clipping,
`LINE-MAPPING`, `OCCL-PLOT`, and `MY-FILL`. Separately,
`BRUSH-FILL-SUBPART` references `EDGE-PATH`, `PAINT-FILL`, and
`BRUSH-STROKE`; `BRUSH-STROKE` references `SCREEN-AND-STORE` and brush/fill
state. These are evidence-backed dependency leads, not proof that one route
feeds the other in every painting.

The full read-only census is now preserved in
`research/introspection/evidence/brush-census-34068649921.txt`. The direct
startup checkpoint contains seven `PAINT-BRUSH` instances. Brush 0 is a
sentinel: ID, width, radius, and cells are all 0; its environment is `(0 100)`
and both perimeter/core readers return NIL. Brushes 1–6 have measured
profiles `(3,1,5)`, `(5,2,12)`, `(7,3,49)`, `(13,6,121)`, `(17,8,239)`, and
`(19,9,329)` for `(width,radius,cells)`, with environment bands `100–3000`,
`3000–8000`, `8000–16000`, `16000–60000`, `60000–120000`, and `120000–200000`.
The complete ordered perimeter/core lists are retained verbatim. Their point
counts do not equal the reported `CELLS` scalar (for example brush 1 has nine
core points but `CELLS=5`), so the two observations remain separate in the JS
model. Brush 5 and brush 6 also contain repeated or missing-looking points;
they are preserved rather than replaced by idealized disks.

The same run's metadata-only report identifies the callable surface without
invoking it: `INIT-MAPS`, `CLEAR-FILL-MAP`, and `WRITE-LIST-TO-FILL-MAP` are
internal compiled functions; `BRUSH-STROKE` takes PATH, VALUE, CDEX, and SDEX;
`SELECT-BRUSH` takes COUNT. The focused constants excerpt shows that
`INIT-MAPS` creates `PATCH-MAP` and `FILL-MAP` with `MAKE-ARRAY` and cons
element/initial values, while `BRUSH-STROKE` reads `BOUNDARY-VALUE`, brush
`WIDTH`, `PERIM`, `CORE`, coordinates, `IN-SUB-FRAME`, and `FILL-MAP` before
delegating to `SCREEN-AND-STORE`. These are dependency facts, not fill-output
parity.

The isolated `INIT-MAPS` behavior is now measured in
`research/introspection/evidence/init-maps-34069679558.txt`. With private
bindings, dimensions `(3 5)`, `(5 3)`, and `(1 1)` all allocate rank-2 arrays
whose dimensions preserve the supplied `(width height)` order. `PATCH-MAP` is
a fresh zero-filled `(UNSIGNED-BYTE 16)` array; `FILL-MAP` is a separate fresh
zero-filled `(UNSIGNED-BYTE 4)` array, and the primary return value is the
fill map. A second call replaces both arrays rather than reusing them. The
outer bindings remain unbound after every case. This is map-allocation parity,
not yet coordinate-index or fill-write parity.

`BRUSH` and `FILL-MAP` remain unbound in the direct checkpoint; no brush is
selected and no shared map has been written. The next safe step is to isolate
`BRUSH-STROKE(PATH VALUE CDEX SDEX)` with `SCREEN-AND-STORE` replaced.

The staged brush probe has now crossed that setup boundary without invoking
the routine. In run
[34071470348](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34071470348),
the original function cells were restored after the direct stub checks, and a
private `PROGV` environment accepted 16×16 typed maps, brush 1, boundary 3,
and zero `CDEX`/`SDEX`; all bindings were restored on exit. The next probe is
one `BRUSH-STROKE` call under that environment with both downstream
dependencies stubbed. Its result will be treated as dependency-isolated
branch/map evidence, not integrated painting parity.

That first call is now measured in
`introspection/evidence/brush-stroke-isolated-34071673602.txt`: the
`PATH=NIL`, value-1 case reaches the post-call checkpoint and leaves both
private maps zero-filled, with function cells and dynamic bindings restored.
This establishes only the empty-path branch. The next holdout changes only
the path to one point made by the measured `MAKE-TWOPT` constructor; no
return-shape or brush-state traversal is added yet.

The singleton holdout completed in run
[34071834659](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34071834659)
with the same zero-map result and restoration markers. That rules out a
startup or constructor failure for a non-NIL path, but it still does not reach
a segment between distinct points. The next isolated case uses exactly two
horizontal points and otherwise keeps the environment unchanged.

The in-frame variation in run
[34072198444](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34072198444)
changed only the predicate stub to `T`. It wrote 12 nonzero cells to
`FILL-MAP` and none to `PATCH-MAP`, then restored both function cells and all
dynamic bindings. This is the first measured brush-map effect. The next
increment records the 12 row-major index/value pairs; it deliberately avoids
assigning X/Y meanings until the map dimensions or an asymmetric case provide
that evidence.

The row-major capture in run
[34072445077](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34072445077)
is `102–104`, `118–120`, `134–136`, and `150–152`, each with value `1`, on
the 16×16 `FILL-MAP`; `PATCH-MAP` remains zero. This is a measured 12-cell
brush-1 footprint for the tested two-point input and predicate gate. It is
not yet generalized to other brushes, values, paths, map sizes, or axis
orientation.

The next holdout preserves this geometry and changes only `VALUE` from `1` to
the measured `BOUNDARY-VALUE` of `3`, testing whether the map stores the input
value directly or applies boundary-specific logic.

Run [34072609079](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34072609079)
shows the same 12 row-major cells with value `3` and no patch cells. For this
case, `VALUE` is written directly into `FILL-MAP`; no boundary remapping is
observed. This remains limited to brush 1, the tested two-point path, and the
in-frame predicate stub.

The next probe changes only the second point to `(7,8)`, creating a vertical
segment while keeping brush 1, value 1, the 16×16 maps, and the `T` predicate.
Its footprint will test orientation without changing any dependency wrapper.

Run [34072790047](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34072790047)
returns indices `102–105`, `118–121`, and `134–137`, all value `1`. The
horizontal and vertical holdouts therefore support the map-write index rule
`first-coordinate * height + second-coordinate` for this 16×16 case. The JS
map layer can expose that convention while keeping broader coordinate claims
scoped to the measured brush path.

The next isolated case keeps the horizontal two-point path and value 1 but
selects startup brush 2, testing the next measured core mask with the same
predicate and private map environment.

Run [34073138334](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34073138334)
returns 26 value-1 cells for brush 2, with no patch writes. The captured
indices equal the union of the two translated measured brush-2 `CORE` masks,
so the JS helper now has a second brush-backed footprint fixture rather than
only the brush-1 case.

The next case selects brush 3 without changing the path or dependency stubs,
continuing the measured profile ladder before any color or selection logic is
introduced.

Run [34073376591](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34073376591)
returns 70 value-1 cells for brush 3, again with no patch writes. The index
set equals the union of the two translated brush-3 `CORE` masks, extending
the measured helper parity across three startup profiles.

The next case returns to brush 1 and uses `(7,7)→(11,7)` with the same
predicate and private maps, separating vertex stamping from interpolation
across a non-adjacent path.

Run [34073609021](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34073609021)
returns 18 value-1 cells and no patch writes: two disjoint 3×3 brush-1
core footprints at the supplied vertices, with no fill cells between them.
The clean-room helper and regression fixture now preserve this measured
non-interpolation result for this case. This does not establish behavior for
arbitrary gaps, overlaps, clipping, or the `CDEX`/`SDEX` arguments.

The next probe should select a larger startup brush while retaining the
adjacent horizontal path, extending the core-mask comparison without mixing
in a new path topology.

Run [34073990973](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34073990973)
selects startup brush 4 on the adjacent `(7,7)→(8,7)` path. It writes 108
value-1 cells and no patch cells. The exact index set equals the union of the
two translated brush-4 `CORE` masks, and the JS helper now has a fourth
profile-backed footprint fixture. This remains dependency-isolated evidence;
brush selection boundaries, clipping, overlaps, colour transitions, and
`CDEX`/`SDEX` behavior are still not recovered.

The next probe should exercise a repeated or overlapping vertex with an
already measured profile, separating duplicate-path semantics from the
profile ladder.

The edge experiment in run
[34074489559](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34074489559)
kept brush 1 and the `T` predicate but moved the path to `(0,0)→(1,0)` on
the private 16×16 maps. It raised `SIMPLE-ERROR` before `AFTER-STROKE`, after
one partial fill write at row-major index `0`; `PATCH-MAP` stayed zero and all
function/dynamic bindings restored. This is an unchecked boundary-write
experiment under the forced predicate, not proof that every integrated path
fails to clip. The JS helper therefore keeps its explicit provisional
out-of-map skip policy until the original in-frame/array-write contract is
measured more broadly.

The next probe should use a repeated or overlapping interior vertex, where no
boundary error can obscure duplicate-path semantics.

Before changing path topology, run [34074832466](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34074832466)
changed only the CDEX index from the zero baseline: positional CDEX and the
dynamic CDEX binding were both `1`, while SDEX stayed `0`. The adjacent
brush-1 path still returned successfully with the exact 12 baseline cells,
all value `1`, no patch writes, and complete function/binding restoration.
This establishes no changed isolated map effect for the aligned CDEX holdout;
it does not prove that CDEX is unused by downstream screen/file emission.

The next holdout changes only the aligned SDEX index to `1` with the same path,
brush, value, and private-map setup.

Run [34075045090](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34075045090)
changes only aligned SDEX to `1` (positional and dynamic), with CDEX back at
`0`. The routine again returns normally and writes the exact 12 baseline
value-1 cells, with zero patch cells and complete restoration. Together, the
aligned CDEX/SDEX holdouts show no isolated fill-map effect for these index
changes; they do not make a claim about the stubbed screen/file consumers or
about mismatched positional/dynamic bindings.

The next probe should use a repeated interior vertex to test whether path
iteration is idempotent before moving into screen/file argument capture.

Run [34075328544](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34075328544)
uses the path `(7,7)→(8,7)→(7,7)` with the baseline brush, value, indices,
predicate, and private maps. It returns normally and writes the exact same 12
value-1 cells as the two-point baseline, with no patch writes and complete
restoration. The measured isolated map effect is therefore idempotent for this
repeated interior vertex; this still does not expose whether an integrated
screen/file call would be repeated.

The next probe should capture the stubbed `SCREEN-AND-STORE` arguments for an
interior path while keeping map behavior controlled.

Run [34075683103](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34075683103)
forces `IN-SUB-FRAME=NIL` and records the screen dependency for the repeated
path `(7,7)→(8,7)→(7,7)`. `BRUSH-STROKE` calls `SCREEN-AND-STORE` exactly
once, forwarding CDEX/SDEX `0,0` and all three path points in order, including
the repeated final vertex. The private fill and patch maps remain zero, the
predicate is called 27 times, and the stroke returns with all bindings and
function cells restored. This measures forwarding under the stub; it does not
yet recover screen/file emission or explain the predicate-call count.

The next probe should vary the forwarded indices under `IN-SUB-FRAME=NIL` to
compare CDEX/SDEX forwarding independently of map writes.

Run [34075893528](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34075893528)
changes aligned CDEX to `1` while SDEX remains `0` under the same rejecting
predicate. The recorder sees exactly `SCREEN-ARGS 1 0`, one call, and the same
three forwarded points; both maps remain zero and the 27 predicate calls,
return, and restoration markers match the baseline. This confirms positional
and dynamic CDEX reach `SCREEN-AND-STORE` in the isolated call, without
claiming what the real screen/file consumer does with the index.

The next holdout changes only aligned SDEX to `1`.

Run [34076151916](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34076151916)
changes aligned SDEX to `1` while CDEX remains `0` under the same rejecting
predicate. The recorder sees exactly `SCREEN-ARGS 0 1`, one call, and the same
three forwarded points; both maps remain zero and the 27 predicate calls,
return, and restoration markers match the baseline. The isolated forwarding
matrix now covers baseline `0,0`, CDEX `1,0`, and SDEX `0,1`; real screen/file
consumers remain the next boundary.

The first bounded Stage 23 matrix control is preserved in
`introspection/evidence/brush-stroke-isolated-34126488826.txt`. A direct
top-level `BRUSH-STROKE` call using the validated 16×16 maps, brush 1,
`VALUE=1`, `(7,7)→(8,7)`, and an in-frame predicate writes the same twelve
row-major cells (`102–104`, `118–120`, `134–136`, `150–152`), forwards one
screen call with the two points, and returns cleanly. A preceding 64×64 case
with the rejecting predicate forwarded the path but wrote no fill cells; that
is a predicate-gated control, not evidence that the larger map has no brush
effect. The case label in that first artifact still says `INSIDE NIL` because
it was emitted before the final predicate-label correction; the actual direct
form used the in-frame `T` stub, as shown by the successful fill writes.

The corrected two-case rerun in
`introspection/evidence/brush-stroke-isolated-34127856773.txt` keeps the same
direct top-level setup and adds brush 2. It reproduces the 12 brush-1 cells
and records 26 brush-2 cells at
`86–88`, `101–105`, `117–121`, `133–137`, `149–153`, and `166–168`, with one
screen call and clean return for each case. The brush-2 set is the union of
the two translated measured `CORE` masks, extending the clean-room fixture
without claiming brush-selection, clipping, colour, or integrated-emission
parity. Compiled helper variants failed before their first resolution
checkpoint in this Allegro init-file harness, so the matrix remains direct
top-level forms.

The four-case direct matrix rerun in
`introspection/evidence/brush-stroke-isolated-34145100465.txt` removes a
probe-only form-boundary error and measures brushes 1–4 in one clean report.
Brush 3 writes 70 value-1 cells and brush 4 writes 108; both sets match the
union of the corresponding translated measured `CORE` masks. All four cases
return normally, write no `PATCH-MAP` cells, and make exactly one
`SCREEN-AND-STORE` forwarding call. The b3 and b4 predicate-call counts are
122 and 194 respectively. This completes the adjacent horizontal footprint
ladder for profiles 1–4 under the tested 16×16, `VALUE=1`, `CDEX=0`,
`SDEX=0`, in-frame stub; it does not recover brush selection, clipping,
overlap semantics, colour, or integrated emission.

The repeated-vertex direct matrix case in
`introspection/evidence/brush-stroke-isolated-34145707021.txt` uses
`(7,7)→(8,7)→(7,7)` with brush 1 and the same private 16×16 environment. It
writes the same 12 unique fill cells as the two-point baseline, makes one
screen-forwarding call, and forwards all three points in order, including the
repeated endpoint. The predicate count rises from 18 to 27, while
`PATCH-MAP` remains zero and all bindings restore. This establishes idempotent
map stamping for the tested repeated interior vertex while preserving the
full path for the downstream consumer; it does not generalize to arbitrary
overlaps or clipping.

The bounded edge diagnostic in
`introspection/evidence/brush-stroke-isolated-34146017804.txt` uses brush 1
with `(0,0)→(1,0)` under the same forced in-frame predicate. It forwards the
two points once, writes only row-major cell `0`, then raises `SIMPLE-ERROR`;
there are no patch writes and only two predicate calls. This repeats the
earlier edge result and confirms a partial-write/error boundary in this
dependency-isolated setup. It is not evidence that the integrated engine
clips all edge strokes this way, because the real frame predicate and screen
context are still replaced.

The next probe should restore a real scene context while recording downstream
`PREP-LINE`/writer dependencies, without changing the private map setup.

## Emission leads

- BRUSH-STROKE references SCREEN-AND-STORE.
- SCREEN-AND-STORE references PREP-LINE, STORE-IN-FILE, MOVE-TO, and DRAW-TO.
- STORE-IN-FILE has ten methods. Point-bearing methods reference the `am`,
  `ad`, `zm`, and `zd` output forms and PREV-STORED-PT.
- A STORE-IN-FILE method references HOP-OR-DRAW before its explicit draw forms.
- OCCL-PLOT also references STORE-IN-FILE, linking the visibility and output
  paths at the level of retained constants.

The method selectors are now confirmed: DIMS, BRUSH, AARGB, HUE, COLOR, END,
MOVE-TO, DRAW-TO, VECTOR, and FILL. The output stream is `*TEMP*`.
Controlled stream-writing behavior is the next measurement needed before
implementing the emitter decisions.

## Initial HOP-OR-DRAW calls

All 36 calls completed. LARGE mode returned NIL for all tested endpoints.
SMALL mode returned the expected `e`, `f`, `g`, `h`, `i`, `k`, and `l` strings
for seven unit directions, but the `(-1,-1)` offset returned NIL. The literal
`j` exists in the function's constants. This discrepancy needs independent
origin/offset validation; the viewer's direction table must not be changed
based on a generator encoding decision. Run 34016410110 then confirmed the
same behavior for a 5-by-5 offset grid at three independent origins in both
modes. JavaScript's `aaronHopOrDraw` now matches all 186 calls. Its tested
small-mode decision returns seven unit-direction strings and otherwise NIL,
including the down-left step. Unmeasured floating-point edge cases remain
outside this claim.

NIL means that this helper declined a compact command. The subsequent stream
probe confirms that DRAW-TO falls back to an explicit draw, preserving the
segment even when its direction is not compacted.

## Measured point emission

Run 34016651940 measures private string-stream output and previous-point state
for 192 calls. All 96 MOVE-TO/DRAW-TO calls succeed. The other 96 VECTOR/FILL
calls report UNBOUND-VARIABLE and are preserved as failures, not parity data.
Run 34016834286 identifies the missing cell as
`COMMON-GRAPHICS-USER::CONTROLS-VISIBLE`. Run 34030806392 binds that Boolean
and records both values in 384 cases. MOVE-TO/DRAW-TO succeed in all 192 calls;
VECTOR/FILL still fail before output: controls NIL gives PROGRAM-ERROR and
controls T gives UNBOUND-VARIABLE WOFFSET. The parser preserves an
absent controls field in the historical report and an explicit `NIL` value.

`AaronStrokeWriter` models the successful integer-coordinate cases:

- MOVE-TO writes PTA as `am` when REDRAW is true, otherwise `zm`, then updates
  PREV-STORED-PT to PTA.
- DRAW-TO uses PTB and the previous stored point, not the supplied PTA, to
  select a hop. When no hop is available it emits `ad` with REDRAW true,
  otherwise `zd`. It always updates the previous point to PTB.
- File size controls hop eligibility. REDRAW selects the explicit command
  family; it does not prevent a compact command when one is available.
- The probed PLOT Boolean does not affect these two methods.

At this stage the writer produced stream fragments with integer coordinates.
The later natural writer probes below added float formatting, colour/brush
records, end-of-stream behavior, and complete document replay. The existing
AaBuilder remains a general format builder and is not relabelled as an exact
implementation of the original writer decisions.

The successful STORE-IN-FILE method constants also retain formatter trees for
the basic records. `AaronStrokeWriter` now emits the inferred strings
`dims X Y` followed by `nb 1`, `nb WIDTH`, `nc INDEX`, `color`, and `am WIDTH
HEIGHT` followed by `end`. These formatter strings come from the completed
generic-method report; direct runtime calls for the formatter selectors remain
useful for checking argument coercion and stream ownership.

## VECTOR/FILL with screen drawing isolated

Run 34031017111 confirms `PLOT(PTA PTB)` is an ordinary compiled function
referencing controls, event processing, graphics stream F2, WOFFSET, picture
height, coordinate rounding and GUI MOVE-TO/DRAW-TO. Binding the variable
named PLOT does not intercept this function in Common Lisp.

Run 34031149136 temporarily replaces PLOT with a recording stub and restores
it with UNWIND-PROTECT (`RESTORED T`). These are dependency-isolated emitter
measurements, not proof of unmodified GUI or full method equivalence.
All 240 calls invoke PLOT once with PTA/PTB. Its NIL versus T return value
does not change the tested emission/state behavior. Of these calls, 216
succeed and 24 VECTOR calls with a NIL previous point raise PROGRAM-ERROR
after PLOT, before emitting anything.

- VECTOR compares both start coordinates with the previous point. If either
  differs it emits a move, then always emits a draw to PTB. REDRAW selects
  the `a` or `z` family. It updates the previous point to PTB.
- FILL always emits `am PTA` then `ad PTB`, ignoring REDRAW, and preserves the
  previous point, including NIL.
- Both use two-decimal output and ignore SMALL/LARGE in this matrix; VECTOR
  does not substitute a compact hop for the tested unit step.

The JS `vector()` and `fill()` methods match all 240 isolated selector cases,
including the 216 successful captures and 24 VECTOR/NIL errors. Doubles such
as 11.125d0 print `11.12`, -20.375d0 prints `-20.37`, and -0.004d0 prints
`-0.00`. JavaScript `toFixed(2)` does not reproduce every observed tie.

A subsequent unmodified seeded scene captured the first natural
`STORE-IN-FILE(VECTOR)` call with VISPT coordinates and `*TEMP*` output
positions 0→36. Its two emitted commands are
`am 106.92 384.16\r\nad 109.11 385.81\r\n`, and the complete temporary
`image` stream equals the AA0 command suffix at byte 2381. This natural input
revealed that the previous JS formatter's general truncation was too broad:
106.918... rounds to 106.92. The corrected formatter rounds to the nearest
cent with measured exact half-cent ties toward zero. The integrated first
vector and all 240 isolated cases pass. See
[`scene-context-findings.md`](scene-context-findings.md) and the retained
[`writer-stream report`](introspection/evidence/scene-state-local-windows10-writer-stream-seed1234-20260926.txt).

The next local probe retained 64 consecutive natural `STORE-IN-FILE(VECTOR)`
calls with their exact `image` stream slices. They cover four move-and-draw
branches and 60 draw-only branches, including two inputs whose starting VISPT
has visibility 0. Stream intervals are contiguous through byte 1224. The
current JS writer reproduces all 64 slices after CRLF normalization, carrying
its previous point forward from each captured call. The first previous point
was not observed, so its move branch is tested using a distinct sentinel;
this fixture does not establish the original initial previous-point value.
The complete output hash remains unchanged. The retained
[`sequence fixture`](introspection/evidence/writer-sequence-local-windows10-seed1234-20260926.json)
and [`call report`](introspection/evidence/scene-state-local-windows10-writer-sequence-seed1234-20260926.txt)
are repeat-verified.

A later windowed trace counted all 28,075 natural writer calls and sampled 299
of them, including the first call of every selector used in this painting.
The nine selector totals are `VECTOR` 656, `COLOR` 1, `BRUSH` 25, `AARGB`
1454, `MOVE-TO` 772, `DRAW-TO` 24903, `HUE` 2, `FILL` 261, and `END` 1.
The observer recorded each sampled call's real arguments, output-stream byte
interval, and `PREV-STORED-PT` coordinates before and after. The first natural
previous point is `(0,0)`, resolving the older fixture's initial-state gap.
The JS writer in `small` hop mode reproduces all 299 command slices and all
299 previous-point transitions exactly after translating its line endings to
the original Windows CRLF stream. The original `?FILE-SIZE?` binding is
`SMALL` at every sampled call, so the hop mode is observed directly. This
includes compact hops, colour and brush
commands, fixed-two-decimal fill, and `END`'s `am 320 480` / `end` tail. `END`
closes the stream, so its exit position comes from the verified archived image
length rather than a post-close `FILE-POSITION` query. Two runs produced the
same report and complete AA0 hashes. See the
[`windowed fixture`](introspection/evidence/writer-windows-local-windows10-seed1234-20260926.json)
and [`natural-call report`](introspection/evidence/scene-state-local-windows10-writer-windows-seed1234-20260926.txt).
This established parity for sampled calls in one controlled painting. The
complete capture below checks the previously unsampled calls.

## Complete continuous writer and AA0 replay

The `writer-full-seed-1234` local mode captured every natural `STORE-IN-FILE`
entry and exit in the controlled post-`INIT-RANDOM` seed-1234 painting. A
single buffered tape contains 28,075 sequential, paired calls with typed
arguments, picture dimensions, file-size mode, output positions, and previous
point state. It did not overflow its 50,000-call cap. Every entry position
follows the previous exit. The run preserved the earlier AA0 SHA-256
`0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1`.

[`replay-full-writer.mjs`](tools/replay-full-writer.mjs) initializes one
`AaronStrokeWriter` from the first observed state and carries it through all
28,075 calls. The original previous point is checked at each boundary, never
injected into the JS writer after initialization. A separate modeled visibility
transition also agrees at every call. Every generated command slice matches
the original `image` bytes, including CRLF, and the whole 124,575-byte image
matches SHA-256 `42189c06d4383884268ab1b4935a015b4fc70300869a195a7511044f18897881`.
The final writer state is `(269,96)`. The original painting has no natural
`DIMS` selector call; its dimensions occur in the separate AA0 prelude.

The prelude is a 13-byte `320 480 148` CRLF header followed by 148 palette
records, each 16 bytes with three fixed two-decimal channels and CRLF.
`serializeAaFile(..., {originalPrelude: true})` regenerates its 2,381 bytes
from the palette values parsed from the original AA0. Then
[`compose-full-aa0.mjs`](tools/compose-full-aa0.mjs) appends the JS-generated
writer commands and checks every byte of the resulting 126,956-byte AA0
against the original. This is exact reconstruction **from captured writer
decisions and original palette values**. The upstream path, colour, brush,
palette-generation, and scene-generation rules are still required to create a
painting from a seed alone. See the compact
[`full-writer evidence`](introspection/evidence/writer-full-local-windows10-seed1234-20260927.json);
raw captures remain in the ignored local `research/extracted/` directory.

The independent seed-5678 holdout also passed the unchanged replay and
composition tools. It has 33,198 paired writer calls and a different selector
mix: 2,212 `VECTOR`, 49 `BRUSH`, 1,822 `AARGB`, 986 `MOVE-TO`, 28,115
`DRAW-TO`, 10 `FILL`, plus `COLOR` 1, `HUE` 2, and `END` 1. All 156,452
generated command bytes and all 158,833 composed AA0 bytes match the original;
the AA0 SHA-256 is
`0ab08c23b241edd0f877c836e4f42fb0497108b8def8c32541ce165157563086`.
This matches the earlier seed-5678 reference painting and confirms the same
writer implementation across two distinct controlled paintings. See the
[`seed-5678 full-writer evidence`](introspection/evidence/writer-full-local-windows10-seed5678-20260927.json).

## Direct SCREEN-AND-STORE frontier

The corrected direct-screen capture in run
[34093884222](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34093884222)
calls the original `SCREEN-AND-STORE` with a private path while recording its
downstream dependencies. It invokes `WATCH-FOR-MESSAGES` once, then signals
`UNBOUND-VARIABLE` for `COMMON-GRAPHICS-USER::MPLAN`; `PREP-LINE`, `PLOT`, and
`STORE-IN-FILE` are not reached. The report also proves that the condition can
be captured before unwind and that all temporary function cells and dynamic
bindings restore. `MPLAN` is therefore the first missing scene-context
dependency, not a brush-map or writer failure. The next probe must trace how
the original startup path binds that plan and its colour/scene companions
before making downstream emission claims.

## Measured dependency-isolated stroke adapter

The retained brush matrix provides one safe local boundary beyond raw map
stamping. For a nonempty path, the original `BRUSH-STROKE` forwards the full
path to `SCREEN-AND-STORE` once with the supplied CDEX/SDEX. The
`IN-SUB-FRAME` predicate is consulted once per translated core-mask point: the
repeated brush-1 path makes 27 predicate calls, and returning NIL leaves the
fill map empty while the single screen call still occurs. Returning T for the
adjacent two-point brush-1 case makes 18 predicate calls and writes the
measured 12-cell core union with the input value unchanged. Empty and singleton
paths produce no screen call or map writes in the retained cases.

`engine/src/aaron-brush-stroke.js` now exposes
`applyMeasuredBrushStroke` for this boundary. It is a dependency-isolated
clean-room adapter: it accepts an explicit predicate and screen callback,
preserves the full forwarded path, and leaves the unresolved screen/file,
colour, clipping, and brush-state logic outside its scope. The generator does
not use this adapter yet.

## Measured SELECT-BRUSH boundary

A direct call through the saved original compiled function now covers every
integer input from `0` through `200000` inclusive (200,001 calls). It returns
NIL for `0..100`, then brush IDs 1 through 6 for `101..3000`, `3001..8000`,
`8001..16000`, `16001..60000`, `60001..120000`, and `120001..200000`.
Every non-NIL result is the matching object in `ALL-BRUSHES`. The sweep reports
one return value for every input and unchanged random state, `BRUSH` binding,
and startup profiles. The 52 diagnostic calls also report one value each and
unchanged random state and `BRUSH`; the full profile list is unchanged across
the probe. The natural `7131` call also returns brush 2.

The original-function sweep is archived in
[the complete-domain evidence](introspection/evidence/select-brush-domain-seed1234-20260927.json);
the earlier 25-case boundary matrix remains available as
[the compact boundary evidence](introspection/evidence/select-brush-matrix-seed1234-20260927.json).
JavaScript now matches all 200,001 recorded results. The 52 additional inputs
include nearby negative and above-range integers, but do not establish the
entire out-of-range tails. Fractional and non-number inputs remain untested.
Integrated brush assignment, clipping, and output drawing are separate
downstream work. See the [focused `SELECT-BRUSH` record](introspection/select-brush.md)
for the probe method, side-effect checks, and limits of the current call trace.

## Natural SCREEN-AND-STORE point emission

The controlled seed-1234 screen-unit capture brackets the first eight natural
`SCREEN-AND-STORE` calls with the full writer tape. Its AA0 and writer-tape
hashes equal the prior controlled run. All eight input paths are complete,
unmodified, and consist of 298 ordered integer points across `TRIPT` and
`TWOPT` objects. Each input point maps in order to exactly one writer call:
the first becomes `MOVE-TO`, and every later point becomes `DRAW-TO` with
`REDRAW=T`. The eight units contain 13 additional `AARGB` calls placed
between points. Their byte ranges total 1,081 bytes.

The [compact screen-unit evidence](introspection/evidence/screen-units-seed-1234-b.json)
retains input paths, colour-event positions and indices, writer ordinals,
byte-range hashes, and copied-state RNG previews. The derivation checks each
writer call and contiguous file position against the original path, then
replays the path in JavaScript through
[`emitAaronScreenPath`](../engine/src/aaron-screen-path.js). All eight generated
byte ranges match the original exactly. Colour-event placement and index are
still supplied from the original tape; the routine also does not model the
RNG consumed elsewhere inside `SCREEN-AND-STORE`. Those are the first
remaining decisions at this drawing boundary.

The independent [seed-5678 holdout](introspection/evidence/screen-units-seed-5678-a.json)
confirms the same one-to-one point rule for its first eight natural calls:
253 input points, 15 supplied colour events, and 933 exact original bytes.
Across both paintings, the rule covers 16 units, 551 points, and 2,014 bytes.
