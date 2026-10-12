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
original JS path object. The v4 portable deriver confirms that its underlying
predicate-coordinate state-transition rule matches the three captured final
maps. The separate v5 follow-up below now runs the actual JavaScript function
against three new captured maps, including a wide-brush multi path. That check
injects the observed screen output into the callback; it does not implement
the screen routine or establish scene-level parity. No general
`BRUSH-STROKE` parity is claimed.

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

## Index-5, width-17 follow-up, 2026-10-12

The v5 observer preserves the first natural VALUE=0 EMPTY and SINGLETON
samples, then selects the first MULTI sample whose current brush is at
zero-based `ALL-BRUSHES` index 5 and has brush `WIDTH=17`. Its source hash is
`0253d6f67f8b0c472f5e390975025b46e54162c6b03f1f031a6c6c0f090e1771`. The
capture root is `brush-stroke-value0-index5-capture-20261012-a`; it contains
2,096 natural strokes and accepted `READY`, version-5 `COMPLETE`, and `END`
records, with zero observer errors or aborts. It records 12 complete 768x1080
UBYTE4 maps, 12,960 rows, 9,953,280 cells and 24,910 maximal RLE runs. See the
canonical [v5 portable evidence](evidence/brush-stroke-value0-20261012-index5-v5.json)
and its [independent deriver](../tools/derive-brush-stroke-value0-index5-evidence.mjs).

| Selected sample | Stroke | Brush index / width | Path points | True predicates | Screen calls |
|---|---:|---:|---:|---:|---:|
| EMPTY | 4 | 1 / 3 | 0 | 0 | 1 |
| SINGLETON | 836 | 1 / 3 | 1 | 9 | 1 |
| MULTI | 1336 | 5 / 17 | 83 | 4,648 | 1 |

For the 83-point MULTI path, the complete fill map changes in 1,575 cells
between screen return and stroke return: 857 cells change 1 to 0, and 718
change 3 to 0, within x=302..398 and y=299..360. The map is unchanged during
the screen call. The nine singleton predicates all return true but leave the
map unchanged; the empty path makes no predicate calls. The observer captures
predicate results and map states, not individual store instructions.

The v5 deriver imports and executes
`applyObservedNaturalBrushStrokeValue0` for each selected sample. Its profile
CORE matches the captured ordered CORE list; it calls the screen callback
once, returns the same JS path object, and reproduces each captured stroke
return map. For this comparison, the callback is supplied the already captured
SCREEN-RETURN fill map. This isolates the adapter's path/map transition and
does not validate SCREEN-AND-STORE's implementation or any drawing output.

Fresh uninstrumented controls `brush-stroke-value0-index5-control-before-20261012-a`,
`...-before-20261012-b`, and `...-control-after-20261012-a` bracket the
capture. All four runs have AA0 SHA-256
`405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a` and
scene-report SHA-256
`153374c2b52a86ca31e33c7102385d2a7c5c88267b50bcfa4947a608eb984ed3`. The
raw observer tape SHA-256 is
`ffb7574d216cdb1735391660246627b1581e55d85f550e70d28b617c30a31fec`.
A read-only audit independently decoded all 12 maps and verified complete row
coverage, RLE run counts, cell histograms, map hashes, selected brush profile,
and the candidate's bounded map result.
The portable report binds eight code/configuration inputs, including the map
writer and engine module metadata. Two independent derivations are
byte-identical; the JSON is 2,567,587 bytes with SHA-256
`5dac2e2213be2178849c8fda7c845699cc13654287a0b9bec196983fae89c95d`.
To derive another copy, use a fresh JSON output path because the helper refuses
to overwrite:

```powershell
node research/tools/derive-brush-stroke-value0-index5-evidence.mjs `
  research/extracted/local-oracle/brush-stroke-value0-index5-capture-20261012-a `
  research/extracted/local-oracle/brush-stroke-value0-index5-control-before-20261012-a `
  research/extracted/local-oracle/brush-stroke-value0-index5-control-before-20261012-b `
  research/extracted/local-oracle/brush-stroke-value0-index5-control-after-20261012-a `
  research/artifacts/temp/brush-stroke-value0-index5-repeat.json
```

This remains one seed and one scene. The two retained natural censuses contain
no rejected `IN-SUB-FRAME` predicates for VALUE=0, so an existing natural
rejection case is not available. The next useful sample is a dynamically
selected MULTI path with `ALL-BRUSHES` index 4, width 13, and the distinct
97-offset CORE. That broadens profile coverage but does not establish edge or
rejection behavior. The direct caller and separate 320x480 captures remain
out of scope.

## Index-4, width-13 follow-up, 2026-10-12

The v6 observer dynamically selects the first natural VALUE=0 MULTI path with
zero-based `ALL-BRUSHES` index 4, brush width 13, and path length 2 through 39.
Its source SHA-256 is
`4e3818e78627048e5126b107a26c66949406918c41207014382fb9dcb2c996d6`. The
complete capture selected stroke 47 with 29 path points, a 97-offset CORE,
2,813 predicate calls, one SCREEN-AND-STORE call, and no errors, aborts, or
rejected predicates. `SCREEN-BEGIN` received the same path object; its
SCREEN-RETURN values are NIL, while BRUSH-STROKE returns the original path by
EQ. Four complete 768x1080 UBYTE4 maps cover 4,320 rows, 3,317,760 cells, and
9,232 maximal RLE runs.

The fill map is unchanged from stroke entry through screen return. It then
changes 38 cells from 1 to 0, within x=587..597 and y=176..187. The captured
CORE exactly matches the JavaScript profile at width 13. The candidate matches
the stroke-return map with the captured predicate decisions and SCREEN-RETURN
map supplied to its callbacks. The screen routine is not implemented or
validated by this comparison, and matching output files across the controls
does not establish scene-level parity.

Fresh uninstrumented controls `brush-stroke-value0-index4-control-before-20261012-a`,
`...-before-20261012-b`, and `...-control-after-20261012-a` bracket the run.
All four runs share AA0 SHA-256
`405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a` and
scene-report SHA-256
`153374c2b52a86ca31e33c7102385d2a7c5c88267b50bcfa4947a608eb984ed3`. The raw
tape SHA-256 is
`64df9e9bdff47c06fe12eb0d5e3562ed5bb5d9e0e0157f965139c37c88100821`. The
portable report binds nine source files and independent derivations match at
1,098,095 bytes, SHA-256
`ac37cc749eea4afaacbfb2b9984168a0b0c50ecceaf4b94b8efc672e74f92580`. Read
the [v6 portable evidence](evidence/brush-stroke-value0-20261012-index4-v6.json)
and [deriver](../tools/derive-brush-stroke-value0-index4-evidence.mjs).

This remains one seed, one scene, and one natural path. It adds a distinct
CORE profile but does not characterize edge clipping or rejected predicates;
the direct caller and whole-scene JavaScript parity remain open.
