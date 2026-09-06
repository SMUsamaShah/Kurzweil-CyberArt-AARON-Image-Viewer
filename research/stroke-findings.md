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
