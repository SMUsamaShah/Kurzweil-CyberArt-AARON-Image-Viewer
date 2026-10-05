# Natural BRUSH-STROKE boundary marking and clearing

## Measured scope, 2026-10-05

The independent boundary branch in
[`aaron-boundary-brush.js`](../../engine/src/aaron-boundary-brush.js) models
`VALUE=BOUNDARY-VALUE=3` from the original path, brush geometry, SUB-FRAME and
existing FILL-MAP. The two complete controlled paintings contain 70 such
strokes. All use long nonempty paths and select the ordered PERIM mask.

```text
mask = path.length > 3 * BRUSH.WIDTH ? BRUSH.PERIM : BRUSH.CORE
for point in path order:
  for offset in mask order:
    x = point.x + offset.x
    y = point.y + offset.y
    if SUB-FRAME.LX <= x <= SUB-FRAME.RX
       and SUB-FRAME.LY <= y <= SUB-FRAME.TY:
      FILL-MAP[x,y] = 3
return the original PATH object
```

For these natural calls, every candidate coordinate, predicate result and
complete output-map cell agrees with JS. All other map cells are preserved,
including those outside SUB-FRAME. There is no extra picture clipping in the
model: the accepted natural coordinates fit the map. No screen call occurs
in these value-3 strokes.

The threshold and CORE branch have native instruction support. These natural
boundary captures exercise PERIM only; they do not validate short or empty
value-3 paths. Original path creation, brush construction, frame construction
and earlier map history remain inputs.

| Comparison | Seed 1234 | Seed 5678 | Total |
|---|---:|---:|---:|
| All natural stroke entries/returns | 1,426 | 2,455 | 3,881 |
| Full value-3 stroke captures | 23 | 47 | 70 |
| Ordered path positions | 6,562 | 8,863 | 15,425 |
| Ordered candidate/predicate results | 164,696 | 132,216 | 296,912 |
| Accepted / rejected candidates | 143,285 / 21,411 | 123,735 / 8,481 | 267,020 / 29,892 |
| Full marker output-map cells compared | 3,532,800 | 7,219,200 | 10,752,000 |
| Full clear output-map cells compared | 3,532,800 | 7,219,200 | 10,752,000 |
| Natural CFRAME reads during clear | 23 | 47 | 70 |
| Snapshot preview checks | 2,944 | 5,098 | 8,042 |

Repeated candidate visits are retained, so predicate counts are not unique
cell counts. The maps use x-major storage (`x * height + y`) and four-bit
values. Widths observed here are 3, 5, 7, 13 and 17; brush indices identify
positions in ALL-BRUSHES, not the brush's ID slot.

Every one of the 3,881 natural strokes returns its original PATH by EQ,
including NIL paths. The value-0 strokes are retained for chronology and
return identity; their map/screen behavior is not implemented by this branch.
The earlier [complete census](brush-stroke-census.md) establishes the natural
empty/singleton observations that differ from older isolated adapter cases.

## Clear boundaries and limits of provenance

Each clear records its complete input/output maps and the natural CFRAME call
observed during CLEAR-FILL-MAP. Its argument and return identities
are retained. The recovered
[`clearAaronFillMap`](../../engine/src/aaron-boundary-map.js) uses that frame
and zeroes its inclusive rectangle; every complete clear output cell agrees.

All 70 clears link to distinct preceding value-3 strokes with matching CDEX
and SDEX; it does not separately recover numeric-index selection of the
CFORM/MAPFRAME object. The capture records how many other strokes occur between each
marker and clear. The portable rows retain coordinates touched/changed by
the marker as hashes and counts, and how those positions appear at clear
entry. They also retain value-3 cells outside the inclusive clear frame and
inside-frame value-3 cells absent from the linked marker's touched set.
The touched set is the unique accepted-candidate coordinate set, independently
checked against JS diagnostics; individual native array stores are not traced.

| Per-boundary counts summed over calls | Seed 1234 | Seed 5678 | Total |
|---|---:|---:|---:|
| Marker positions changed to 3 | 45,294 | 43,382 | 88,676 |
| Those positions still 3 at clear entry | 28,715 | 28,579 | 57,294 |
| Those positions 0 at clear entry | 16,579 | 14,803 | 31,382 |
| Additional clear-entry 3 positions outside linked marker's accepted set | 6,454 | 511 | 6,965 |
| All inside-frame clear-entry 3 positions | 35,169 | 29,090 | 64,259 |

Every additional position was 0 or 1 at the linked marker's exit, then 3 at
clear entry: 6,829 were 0 and 136 were 1. None was already 3 at marker exit.
These net additions arise during the intervening work; their writer remains
unidentified. All clear-entry value-3 positions lie inside the natural clear
frame and become zero. The clear preserves 10,291 nonzero outside-frame cells
summed over the 70 boundaries; none contains 3. These are per-call totals,
not unique coordinates over the whole paintings.

This establishes the observed changes at the marker boundary and later
coordinate correlations. Intermediate map writers are not fully captured: a
position still containing 3 at clear entry does not prove continuous ownership by the
earlier marker. A full BRUSH-FILL-SUBPART map history remains a separate target.

## Observation and capture acceptance

Frozen v1 wraps naturally invoked BRUSH-STROKE, IN-SUB-FRAME,
SCREEN-AND-STORE, CFRAME and CLEAR-FILL-MAP. It records all stroke boundaries,
full value-3 paths and ordered CORE/PERIM geometry, direct existing SUB-FRAME
bounds and BRUSH WIDTH slots, and copied typed full maps. It adds no AARON
getter calls. Predicate logging records natural calls only and adds no
per-predicate copied RNG preview. Snapshot previews cover boundary extraction,
not all original function RNG consumption or every application side effect.

Every wrapper preserves the original arguments, multiple values and errors.
All context plist fields are initialized before helper mutation. Both tapes
have normal MAIN completion, paired calls, complete maps, zero errors/aborts,
no overflow and no active work. The strict parser validates caps, installs,
objects, typed fields, complete maximal RLE rows, chronology, duplicated frame
records and completion counters. All 3,881 strokes align with the earlier
source-bound census by ordinal, value, CDEX/SDEX, path length and return type.
Global predicate/screen/clear totals also agree.

Both instrumented drawings and scene reports equal fresh uninstrumented
controls byte for byte. All four runs request SmallImage=false and produce
320×480 maps. The derivation checks actual output hashes, matching setup,
owned runtime requests and byte-identical staged/current observer sources.

## Native evidence

A fresh metadata/window capture identifies both ordinary compiled functions
without invoking or replacing them. Complete objects match uniquely in the
original indexed PLL:

| Function | PLL payload offset | Payload bytes | Instructions / instruction bytes checked |
|---|---:|---:|---:|
| BRUSH-STROKE | 2,766,276 | 564 | 201 / 555 |
| IN-SUB-FRAME | 2,550,316 | 278 | 93 / 270 |

BRUSH-STROKE payload SHA-256:
`606194172353e20194922a1f13ed853e48455f523d635cf07a43cd01d1a9bc0e`.
IN-SUB-FRAME payload SHA-256:
`e2eac4f8f846d8d4ef5e46502af4ac8fe7b409a6ef1e80a49d19b135ee372dc4`.

ARGLIST identifies PATH/VALUE/CDEX/SDEX. Constants identify BOUNDARY-VALUE,
SCREEN-AND-STORE, BRUSH, WIDTH, PERIM, CORE, X/Y, IN-SUB-FRAME, FILL-MAP and
.INV-S-AREF. The tagged threshold comparison branches to CORE for length
at most 3×WIDTH; longer paths load PERIM. The ordered natural candidate
comparison corroborates the long-path interpretation. IN-SUB-FRAME's integer
comparison instructions accept all four equality edges and reject coordinates
outside the box. Boxed-numeric helper behavior is uncharacterized.

The derivation rederives the full window/PLL mappings, checks every instruction
address and byte against the exact payload, and verifies canonical REA 3.2.1
external Ghidra import/export records. This is standalone x86 Ghidra evidence
through REA, not a stock REA Windows x86 native-provider session. Runtime
addresses belong to that capture and must be rediscovered before a new attach.

## Provenance and reproduction

Ignored roots under `research/extracted/local-oracle/`:

- `brush-stroke-boundary-seed1234-20261005-f` and fresh control
  `brush-stroke-boundary-control-seed1234-20261005-g`.
- `brush-stroke-boundary-seed5678-20261005-h` and fresh control
  `brush-stroke-boundary-control-seed5678-20261005-i`.
- Native metadata/window run `brush-stroke-native-seed1234-20261005-e`.
- Earlier census roots `brush-stroke-census-seed1234-20261005-a` and
  `brush-stroke-census-seed5678-20261005-c`.

Frozen boundary observer SHA-256:
`c159c702361d96a5b17173e6ad67a0c09d4281aa72dce5ff4969121425f27967`.
The [portable evidence](evidence/brush-stroke-boundary-parity-20261005.json)
retains all 70 marker and clear rows, brush profiles, complete sequence/map
hashes, coverage, source/request/raw-report/control bindings and native/REA
records. Full original maps, paths, predicates, reports and runtime files
remain ignored.

Read [oracle.md](../oracle.md) before a new runtime run. Use a fresh root and
`brush-stroke-boundary-capture.cl` with output
`aaron-brush-stroke-boundary.txt`; the full runs use a 600-second limit. Run
`derive-brush-stroke-boundary-evidence.mjs` with the two observed/control/census
root triples, native root and a fresh output path. Never change the system clock.

JS safe-integer/type checks and malformed-input errors are adapter policy.
Other numeric domains, other seeds, unobserved short boundary paths, original
errors and the complete value-0 painter remain outside this comparison.
