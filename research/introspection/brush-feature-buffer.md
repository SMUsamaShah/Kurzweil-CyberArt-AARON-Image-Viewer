# Natural feature buffering and additional boundary cells

## Measured behavior, 2026-10-06

The feature kernel in [aaron-buffer-brush.js](../../engine/src/aaron-buffer-brush.js)
matches all 24 natural BUFFER-FEATURE calls in the two controlled paintings.
It receives the original EDGE point list, ordered CORE mask, SUB-FRAME and
existing FILL-MAP. It computes its own rounded candidate coordinates,
inclusive clipping decisions and complete output map.

```text
for point in EDGE order:
  for offset in BRUSH.CORE order:
    x = ROUND(point.x + offset.x)
    y = ROUND(point.y + offset.y)
    if SUB-FRAME.LX <= x <= SUB-FRAME.RX
       and SUB-FRAME.LY <= y <= SUB-FRAME.TY:
      FILL-MAP[x,y] = 3
return NIL
```

All ordered candidates and their original IN-SUB-FRAME results agree. Every
output cell agrees, including preserved cells outside the accepted set.
BRUSH, SUB-FRAME, FILL-MAP and BOUNDARY-VALUE identities/bindings agree at
entry and exit. Every natural feature return is one NIL value. The native
BUFFER-FEATURE loop and setter site are bound by
[the six-function native mapping](brush-painting-native.md).

| Comparison | Seed 1234 | Seed 5678 | Total |
|---|---:|---:|---:|
| Complete BUFFER-FEATURE calls | 8 | 16 | 24 |
| BUFFER-HEAD boundaries composed from those calls | 1 | 2 | 3 |
| Original EDGE positions | 406 | 802 | 1,208 |
| Ordered candidate/predicate checks | 73,892 | 7,218 | 81,110 |
| Accepted / rejected candidates | 73,229 / 663 | 7,101 / 117 | 80,330 / 780 |
| Complete feature output cells compared | 1,228,800 | 2,457,600 | 3,686,400 |
| Complete composed buffer output cells compared | 153,600 | 307,200 | 460,800 |
| Per-feature changed positions | 8,147 | 567 | 8,714 |
| Additional clear-entry 3 positions covered | 6,454 | 511 | 6,965 |

The observed brushes have widths 17 and 3. CORE is selected in every feature
call. The 2,416 coordinate descriptors comprise 2,412 DOUBLE-FLOAT values
and four integers; the DOUBLE-FLOAT coordinates are fractional. No exact
half-tie coordinate occurs. The model rounds to the nearest integer, choosing
even at a tie, but this capture does not validate that tie case. SINGLE-FLOAT
and other numeric types are outside this adapter's measured domain.

## Attribution of the additional value-3 positions

The preceding [boundary evidence](brush-stroke-boundary.md) found 6,965
clear-entry 3 positions outside the linked marker's accepted-coordinate set.
All were 0 or 1 at marker exit. The new tape aligns every one of 3,881 stroke
calls, all 70 marker output maps and all 70 clear-entry maps with that earlier
complete capture, including dimensions and cell contents.

Every additional position changes to 3 within a captured BUFFER-FEATURE
boundary. They occur in the three BUFFER-HEAD intervals: 6,454 positions in
seed 1234, and 127 plus 384 in seed 5678. The complete feature maps compose
to each complete BUFFER-HEAD output, with no net unaccounted map difference
between the captured children.

This establishes the net feature-buffer changes that account for all 6,965
extra endpoint positions. It does not trace each primitive array store or
prove continuous ownership between a feature exit and clear entry. Counts
are summed across call/marker intervals, not globally unique coordinates.

## Captures and checks

Frozen [probe v2](brush-buffer-capture.cl) SHA-256:
`961476dc6dc805a2c0fe56c69e92cffa60adf143d6dbd2b08362cf627f24894c`.
Preserve this source byte for byte, including its line endings, when reusing
the captured source bindings.

The complete roots are `brush-buffer-capture-seed1234-20261006-a` and
`brush-buffer-capture-seed5678-20261006-c`. Fresh uninstrumented controls are
`brush-buffer-capture-control-seed1234-20261006-b` and
`brush-buffer-capture-control-seed5678-20261006-d`. Each complete AA0 and
scene report equals its fresh control bytes. Both tapes have MAIN/READY,
paired contiguous events, COMPLETE/END, zero errors, zero aborts and no
overflow. Their 4,797 copied random-state snapshot checks pass.

The first `brush-buffer-capture-seed1234-20261005-d` attempt is diagnostic
only. It has no MAIN/READY or completion footer and ends during the last
clear. Its last installation is an experimental `.INV-S-AREF` replacement;
the actual installation exception was not captured. V2 removes that hook
and captures full child maps. Scene completion alone is insufficient, as
[the oracle protocol](../oracle.md) now explains.

The [portable evidence](evidence/brush-feature-buffer-parity-20261006.json)
binds 165 source/artifact records, both complete tapes and controls, the
previous complete boundary evidence and all six native objects. It retains
per-feature and per-interval hashes, masks, coverage and traversal arguments.
Raw tapes/maps and original runtime files remain ignored. Reproduce with:

```powershell
node research/tools/derive-brush-buffer-evidence.mjs `
  --output research/extracted/local-oracle/brush-buffer-capture-seed1234-20261006-a/fresh-evidence.json
```

The [strict parser](../tools/parse-brush-buffer-report.mjs) requires complete
object/type declarations, map RLE coverage, call nesting, scope contexts and
counter equations. The [comparison](../tools/compare-brush-buffer-capture.mjs)
computes the independent feature maps and checks complete buffer composition.
The deriver checks actual drawing/scene bytes, current/staged/request source
binding and the transitive earlier evidence before writing a fresh output.
Syntax checks pass; no unit-test run is claimed for this milestone.

## Remaining inputs and next work

EDGE construction, brush geometry, SUB-FRAME construction, existing maps,
plan/form lookup and the BUFFER-HEAD feature-index sequence remain original
inputs. The three observed heads each visit eight features. Their indices
vary with the selected subject; this is not a general recovered head-selection
rule or proof of an immediate native caller.

BUFFER-ANYTHING and BUFFER-HOLE have zero natural calls in these paintings,
and no JS behavior is published for them. ZERO-EDGE is likewise uncalled;
the global FOOB census does not retain its arguments/results outside child
scope. Next: map and characterize FOOB and ZERO-EDGE, then continue the
complete BRUSH-FILL row/iris schedule and value-0 painter.
