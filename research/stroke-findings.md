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

The method selectors and controlled stream-writing behavior are the next
measurements needed before implementing the emitter decisions.

## Initial HOP-OR-DRAW calls

All 36 calls completed. LARGE mode returned NIL for all tested endpoints.
SMALL mode returned the expected `e`, `f`, `g`, `h`, `i`, `k`, and `l` strings
for seven unit directions, but the `(-1,-1)` offset returned NIL. The literal
`j` exists in the function's constants. This discrepancy needs independent
origin/offset validation; the viewer's direction table must not be changed
based on a generator encoding decision.

NIL means that this helper declined a compact command. It does not by itself
establish whether a downstream caller skips, moves, or explicitly draws.
