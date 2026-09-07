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

The writer produces stream fragments, not complete painting documents. Its
current API intentionally requires integer coordinates; float formatting,
headers, colour/brush records, and end-of-stream behavior are
separate recovery tasks. The existing AaBuilder remains a general format
builder and is not relabelled as an exact implementation of these decisions.

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

The integer `vector()` and `fill()` JS methods match all 72 successful integer
captures and reject the eight integer VECTOR/NIL cases without changing state.
The remaining 144 successful captures use doubles and are preserved as
evidence, but floating formatting is not implemented. For example 11.125d0
prints `11.12`, -20.375d0 prints `-20.37`, and -0.004d0 prints `-0.00`.
JavaScript `toFixed(2)` does not reproduce all these observations. More format
probes are needed before choosing a general rounding rule.
