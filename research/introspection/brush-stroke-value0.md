# Natural BRUSH-STROKE VALUE=0 map capture

## Captured behavior

The frozen v4 observer recorded the first natural MULTI, EMPTY, and SINGLETON
`VALUE=0` strokes in one complete seed-1234 writer-stream run. Its hash is
`012b3dc8fa3bad02b82fa4dd4dc9614845a587e05924cc5dd5bc135d47e95865`. The
source-bound report is
[`brush-stroke-value0-20261012-v4.json`](evidence/brush-stroke-value0-20261012-v4.json),
derived by
[`derive-brush-stroke-value0-evidence.mjs`](../tools/derive-brush-stroke-value0-evidence.mjs).
Observer drafts v1-v3 are retained; only v4 is bound to this accepted run.
The observer's `READY`, accepted `COMPLETE`, and `END` records all appear in the
tape. It reports zero errors or aborts, restores `BRUSH-STROKE` and
`IN-SUB-FRAME`, and preserves the exact outer `MAIN` and `SCREEN-AND-STORE`
wrappers.

The capture run is `brush-stroke-value0-capture-20261012-b`. It contains 2,096
natural strokes and selected three samples, each with one `SCREEN-AND-STORE`
call and four full 768x1080 unsigned-byte-4 map snapshots. All three have
boundary value 3, brush index 1, width 3, and a nine-offset CORE mask.

| Selected sample | Stroke | Path | Predicate results | `BRUSH-STROKE` return |
|---|---:|---|---:|---|
| MULTI | 2 | (100,306) through (100,314), vertical | 81 true | Original path by EQ |
| EMPTY | 4 | NIL | 0 calls | NIL |
| SINGLETON | 836 | (518,1023) | 9 true | Original path by EQ |

The screen call precedes every selected `IN-SUB-FRAME` call. In the multi
sample, the screen entry and return maps are identical; the 81 true predicate
calls follow the screen return. The singleton likewise has nine true
predicates after its screen return. The empty path still calls
`SCREEN-AND-STORE`, but has no predicate records. All three screen calls return
NIL.

For the multi path, 33 cells change between screen return and stroke return:
20 change from 1 to 0 and 13 from 3 to 0, within x=99..101 and y=305..315.
The earlier stroke-entry/screen-entry and screen-entry/screen-return snapshots
are byte-identical. The empty and singleton snapshots have no net map changes.

The deriver also applies a bounded map-state candidate: set each true
`IN-SUB-FRAME` argument coordinate to the captured stroke value. This reproduces
the complete stroke-return map for all three samples. The multi sample has 81
accepted predicate calls over 33 distinct coordinates; those coordinates begin
with 48 zero, 20 one, and 13 three-valued cells. The singleton's nine
coordinates are already zero, so its unchanged snapshots cannot distinguish
zero writes from no writes. This candidate is a state-transition match for
these observations; the observer did not trace individual array stores.

## JavaScript status

The older
[`applyMeasuredBrushStroke`](../../engine/src/aaron-brush-stroke.js) adapter
performs CORE writes before its screen callback and returns early for empty
and singleton paths. It therefore does not represent the call order or
screen-call behavior measured in this natural capture. It remains the separate
dependency-isolated adapter.

[`applyObservedNaturalBrushStrokeValue0`](../../engine/src/aaron-brush-stroke.js)
is a separate, explicitly bounded candidate. It calls the supplied screen
callback first, applies zero at accepted CORE coordinates, and returns the
original JS path object. The portable deriver confirms that its underlying
predicate-coordinate state-transition rule matches the three captured final
maps. The new JS function itself has only been syntax-checked; it has not been
run against the raw maps or a scene. No general `BRUSH-STROKE` parity is
claimed.

## Controls, provenance, and limits

Fresh uninstrumented controls bracket the capture:

- `brush-stroke-value0-control-before-20261012-a`
- `brush-stroke-value0-control-before-20261012-b`
- `brush-stroke-value0-control-after-20261012-a`

All four runs have the same AA0 hash
`405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a` and scene
report hash
`153374c2b52a86ca31e33c7102385d2a7c5c88267b50bcfa4947a608eb984ed3`. The
portable report also binds the observer request, staged source, runtime files,
raw tape, and before/capture/after timestamps. The raw report SHA-256 is
`13fb031310849d6a4ee2a8fab5678b67c9001362259b2a69b425cfdf63a9a906`.

The report contains 12 complete map snapshots: 12,960 rows, 9,953,280 cells,
and 17,340 maximal RLE runs. A separate read-only decoder independently
verified every row and all reported map deltas. The portable derivation was
also run twice and produced byte-identical JSON; its SHA-256 is
`fddac6a59b7f5d3416580391cf81d5463c2ada7c8d921cd32e76632869e35ead`.

This is one scene, one seed, and three selected natural samples, all using the
same brush index and VALUE=0. It does not establish behavior for other brushes,
path lengths or shapes, frame edges, boundary values, or map states. The
screen function's rendering effects are not reimplemented here. The 2,066
copied three-draw RNG previews were unchanged; they do not establish complete
RNG-state preservation. No direct caller or native-register meaning is
recovered. Matching AA0 and scene bytes establishes control stability, not
complete internal-state parity.

Re-derive the evidence from the four retained roots with:

```powershell
node research/tools/derive-brush-stroke-value0-evidence.mjs `
  research/extracted/local-oracle/brush-stroke-value0-capture-20261012-b `
  research/extracted/local-oracle/brush-stroke-value0-control-before-20261012-a `
  research/extracted/local-oracle/brush-stroke-value0-control-before-20261012-b `
  research/extracted/local-oracle/brush-stroke-value0-control-after-20261012-a `
  research/introspection/evidence/brush-stroke-value0-20261012-v4.json
```

The two nearby REA xref queries are documented in the
[payload analysis](rea-payload-analysis.md). They provide static branch
destinations only and do not resolve the natural caller or these observed
effects.
