# CFORM POST-FILL maps and composed fill

## Measured result, 2026-10-05

The `(EQL CFORM, T, T)` POST-FILL method matches all 149 natural calls in two
complete paintings. Independent JavaScript reproduces its return and every
cell of both output maps: 45,772,800 comparisons. AA0 and scene bytes equal
fresh uninstrumented controls.

Within the natural CFRAME rectangle `[LX,RX) × [LY,TY)`:

1. Skip a zero FILL-MAP cell.
2. For a positive fill cell whose PATCH-MAP equals BACKGND, assign the selected
   form's naturally returned PATCHDEX and increment the local count.
3. Clear the positive FILL-MAP cell, including rejected patch cells.
4. Return the accepted-cell count. Preserve both maps outside the rectangle.

RX and TY are excluded; positive cells on those edges remain unchanged.
Target fill values 0/1/2, BACKGND 0 and integer MAPFRAME bounds are measured.
Other values/backgrounds and original invalid-input errors remain uncharacterized.
Keep frame bounds specific to each function; this is the CFORM method.

| Comparison | Seed 1234 | Seed 5678 | Total |
|---|---:|---:|---:|
| Complete calls / natural CFRAME reads | 67 | 82 | 149 |
| Full output-map cells | 20,582,400 | 25,190,400 | 45,772,800 |
| Accepted cells / PATCHDEX calls | 143,475 | 105,073 | 248,548 |
| Rejected positive fill cells cleared | 427,544 | 162,922 | 590,466 |
| Target value-1 cells cleared | 551,615 | 254,048 | 805,663 |
| Target value-2 cells cleared | 19,404 | 13,947 | 33,351 |
| Calls without PATCHDEX | 41 | 8 | 49 |
| Outside nonzero fill preserved | 23,599 | 8,064 | 31,663 |
| Positive excluded RX edge preserved | 233 | 0 | 233 |
| Positive excluded TY edge preserved | 1,447 | 436 | 1,883 |
| Positive excluded RX/TY corners preserved | 10 | 6 | 16 |
| Observation preview checks | 201 | 246 | 447 |

Counts sum across calls and overlapping frames, not unique painting positions.
Returns range 0–70,027 and 0–29,185. Every natural PATCHDEX argument is EQ to
the single CFRAME argument and its result is consistent throughout the call.
Both maps preserve EQ identity. In the 49 zero-count calls without PATCHDEX,
the target label is unobserved. The comparison uses an arbitrary unused label
only after verifying no accepted cell exists; it never presents it as a read.

## Composition

[`aaron-cform-post-fill.js`](../../engine/src/aaron-cform-post-fill.js) provides
`postFillAaronCform` and `fillAaronCformFromOutline`. The latter composes the
recovered list writer, SET-MEDIANS, GOOD-START, FILL-STRATEGY and POST-FILL.
Earlier complete boundary/preparation captures align by CDEX/SDEX, ordered
outline identities/coordinates and LY/TY. Starting with original writer-entry
FILL maps, JS constructs the boundary and strategy output. All 22,886,400
complete POST-FILL-entry fill cells match, including cells outside the earlier
bounded strategy reports. All 35,905 outline positions, medians, rotations,
strategy results, counts and 45,772,800 composed output-map cells agree.

This links separate captures of paintings with identical complete outputs;
it is not one integrated original MY-FILL invocation or direct native caller
proof. Original point lists, frame construction, writer-entry fill maps and
POST-FILL-entry patch maps remain inputs. Every capture used here requests
SmallImage=false and measures 320×480 maps.

## Native support and REA

The existing exact helper capture maps POST-FILL-METHOD-1 to a unique complete
PLL object: payload offset 2,353,316, 954 bytes, SHA-256
`171859c1dfd1feea45e03c7d4d463b182bfbd65c40eafb3a059e8839b568ae6a`.
The derivation redoes the live-window/PLL match and validates all 339 decoded
instructions against 946 payload bytes. Metadata identifies EQL CFORM.
LY/TY and LX/RX constants, comparisons at +183/+487, JL branches and tagged
unit increments support the exclusive bounds. The positive guard, background
comparison, PATCHDEX/store, count increment and fill-zero store occupy
+552 through +918. Complete natural maps and returns corroborate that
interpretation; Ghidra C types/helper ABI are not recovered Lisp source.

The standalone report now has REA 3.2.1 canonical external import/export.
Record identity, payload and source-report digests agree. Its
`rea_native_provider_session` is false. This revalidates the earlier capture
and adds external evidence, not a new live/debugger or stock REA provider run.

## Capture and excluded diagnostic

Frozen v2 copies complete entry maps using typed displaced vectors, observes
only natural CFRAME/PATCHDEX calls and direct frame slots, and serializes full
input/output maps once after return. Wrappers preserve original arguments,
multiple values and errors. All calls have measured arity 3. The strict parser
requires complete maximal RLE, all sequence/count/cap invariants, EQ map
identity, reader consistency and zero errors/aborts. Copied RNG previews guard
map/frame extraction; PATCHDEX metadata uses only natural result and argument
EQ. Original function RNG consumption and other side effects are not recovered.

V1 preserved AA0/scene but recorded 67 AFTER TYPE-ERRORs and zero map cells.
Source review found that SETF GETF of missing cache keys prepended fields only
to the helper's local context binding; outer AFTER still lacked the maps.
V2 initializes all cache keys in the shared context. V1 is an excluded
incomplete diagnostic; unchanged output bytes do not validate its map tape.

Ignored local roots under `research/extracted/local-oracle/`:

- `cform-post-fill-seed1234-20261005-c`, fresh control `cform-post-fill-control-seed1234-20261005-d`.
- `cform-post-fill-seed5678-20261005-e`, fresh control `cform-post-fill-control-seed5678-20261005-f`.
- Diagnostic `cform-post-fill-seed1234-20261005-a` and its first control `...-b`.
- Boundary `boundary-map-seed1234-20261005-g` / `boundary-map-seed5678-20261005-h`.
- Preparation `fill-preparation-seed1234-20261005-f` / `fill-preparation-seed5678-20261005-g`.
- Native `brush-fill-helper-native-seed1234-20261005-c`.

Frozen observer SHA-256:
`bdc7a4609090c14197ef045e53c1cd222eb9071dba099368d735a872add4e9f8`.
Successful raw report hashes:

- 1234: `122690a9906da6ea5e1343b44d16e86d6a7140cde6df9e6f1c2cdba10aaa12b0`.
- 5678: `2c9d661a900d38d290d2e8e29c63e798addb5c47e977c2a115b0c5680c730f33`.

Follow [oracle.md](../oracle.md), fresh roots, one original process and the
600-second limit. Supply `-PreSceneProbePath research\introspection\cform-post-fill-capture.cl`
and `-ProbeOutputNames aaron-cform-post-fill.txt`. Successful captures took
about 214/268 seconds. `derive-cform-post-fill-evidence.mjs` takes both
observed/control/boundary/preparation roots, native root, excluded v1 and a
fresh output path. [Portable evidence](evidence/cform-post-fill-parity-20261005.json)
binds dependency sources, prior evidence, tapes, summaries, requests, complete
native mapping/instructions and canonical REA records. Full maps/runtime
artifacts stay ignored. No value-3 target cell occurs here; natural
BRUSH-STROKE provenance and remaining BRUSH-FILL branches follow.
