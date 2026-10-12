# ZERO-EDGE: 160 bounded inputs, 2026-10-12

## Investigation

Measure the original compiled ZERO-EDGE after normal MAIN with a fresh
MAKE-TRIPT instance and a fresh 7x7 UBYTE4 scratch FILL-MAP for every call.
The target remains unwrapped. Each case supplies START and numeric PERIM
directly; this is an explicit-call experiment, not a natural caller trace.

The originally proposed 136 cases were expanded to 160 before execution by
adding nonzero cell values 2, 3 and 15. The complete input order is:

| Group | Ordinals | Inputs |
|---|---|---|
| A | 1–40 | START (3,3), directions 0–7, PERIM 0–4, all cells zero; direction outer, PERIM inner |
| B | 41–104 | START at (0,0), (0,3), (0,6), (3,0), (3,6), (6,0), (6,3), (6,6), directions 0–7, PERIM 4, all cells zero; position outer, direction inner |
| C | 105–160 | START (3,3), directions 0–7, PERIM 4, seven map shapes; shape outer, direction inner |

Group C's shape order is all ones; only (3,3) zero with the rest ones;
only array[3,2]=1 with the rest zero; the inclusive 2–4 by 2–4 square zero
with the rest ones; and only array[3,2]=2, 3, or 15 with the rest zero.
The cell order is x outer/y inner, using `(aref map x y)`.

## Complete capture

The [accepted v2 probe](zero-edge-input-matrix-v2.cl) is 81,556 bytes,
SHA-256 `70ece663045eb5d852aef397d348f63ede577f95ba0d9d7f2d0ade0520772612`.
The ignored raw capture is under
`research/extracted/local-oracle/zero-edge-matrix-seed1234-20261012-q/capture/aaron-zero-edge-input-matrix-v2.txt`:
2,831,887 bytes, 12,389 lines, SHA-256
`4e06a2f1c030efeb5cbd0001a60467c22a43cc44ad44c5736e8f1dfca7b8bbba`.

The run starts at `2026-10-12T05:06:48.7824468+00:00` and finishes at
`2026-10-12T05:07:57.8038910+00:00`. Its own INSTALL/READY, 160 ordered
CASE/CASE-RETURN/CASE-END groups, MATRIX-ACCOUNTING, COMPLETE and terminal
END are present. All 160 target calls return normally with one value;
target conditions, observer errors, abort and overflow are absent.

| Group | Proper list returns | NIL returns |
|---|---:|---:|
| A: center / direction / budget | 16 | 24 |
| B: picture boundary | 16 | 48 |
| C: nonzero map shapes | 36 | 20 |
| Total | 68 | 92 |

Group A returns NIL for each direction at PERIM 0, 1 and 2, and a list at
PERIM 3 and 4. Group C's all-ones and isolated-zero-center maps return NIL
for all eight directions. Its 3x3 zero square returns four lists and four
NILs. Each single-cell shape returns a list for all eight directions at
PERIM 4, including nonzero values 1, 2, 3 and 15. These are observations
for the listed inputs, not a proof for every four-bit value or map.

The capture retains complete return coordinates and point/cons identities,
START slots before and after, and all 49 scratch cells before and after
each call. All scratch maps retain their exact input values. A NIL return
does not imply that the supplied START is unchanged.
The returned path counts are 92 empty summaries, 64 five-point lists and
four six-point lists. START changes in 52 cases: A24, B16 and C12.

## Preservation and controls

One immutable full copy of each original FILL-MAP and PATCH-MAP is made
after MAIN. Their identities, metadata and every one of their 829,440 cells
are compared before each constructor, after each constructor, after each
target outside PROGV, and at the final boundary. All checks pass. Seven
observed original bindings restore; XINCS/YINCS retain their identities and
complete eight-element contents, and global START remains unbound.

Copied three-draw RNG previews are valid and equal the post-MAIN baseline
(59,29,74) at every accepted boundary, around every constructor and around
every target. The probe does not reseed or reset state. Those previews are
a limited observation, not a complete RNG-state or all-global-state proof.
Private START mutation is part of each measured result.

Fresh uninstrumented controls bracket q using the same required-END runner:

| Control | Run basename | Raw UTC interval |
|---|---|---|
| Before | `zero-edge-matrix-control-seed1234-20261012-p` | `04:53:27.4683957`–`04:54:00.2676740` |
| After | `zero-edge-matrix-control-after-seed1234-20261012-r` | `05:12:35.2842517`–`05:13:18.3388395` |

Both intervals are on 2026-10-12 UTC. Neither control loads an optional
probe. The actual bytes of all four outputs match among p, q and r:

| File | Bytes | SHA-256 |
|---|---:|---|
| AA0 | 426,587 | `405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a` |
| image | 424,205 | `457793c43166f822d8ded53b1570c8cdc1b7db9da794425344b8669b0d8b5e8e` |
| image-id | 3 | `13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354` |
| aaron-scene-state-snapshot.txt | 25,959 | `153374c2b52a86ca31e33c7102385d2a7c5c88267b50bcfa4947a608eb984ed3` |

These current controls have 768x1080 natural maps. The earlier 320x480
configuration remains separate; its change is still unexplained.

## Runner and source versions

The separate [required-END runner](../oracle/run-local-scene-state-required-probe.ps1)
is 27,295 bytes, SHA-256
`1fe4546ea847bd31b28b2bcbab6228356b7f44ea8d61bde006ccbad58c788ec9`.
It requires the exact, case-sensitive terminal probe END before stopping
and rechecks the archived terminal line. The report's own complete counters
and preservation gates still require offline validation. Requests and
summaries bind the runner and required marker. The historical runner remains
unchanged for existing published evidence.

[Matrix v1](zero-edge-input-matrix-v1.cl), 79,902 bytes, SHA-256
`217295495899915ccb9584f3b321102e80a1794acc618c516a580eeb27528150`,
was never executed. Static review found that its acceptance gate checked
preview validity without requiring equality to the initial RNG preview.
V2 adds fail-stop stable/baseline-stable checks without changing the 160
input constructors or shape definitions. Both sources are preserved.

## First model divergence

The initial hypothesis model matches the captured return type, paths,
point/cons identities, START input and scratch outputs in all 160 cases.
It differs in the final START direction in 40 of the boundary NIL cases.
The first difference is ordinal 42: zero map, START (0,0,1), PERIM 4.
The target returns NIL and changes START to (0,0,5); the candidate instead
predicts (0,0,6). The initial model is preserved as a rejected hypothesis
for that field. No target instruction or dependency call is traced by this
capture, so mutation timing and the general traversal remain investigations.

A separately preserved revised hypothesis changes an out-of-bounds
candidate from retry to immediate NIL. The frozen native disassembly's
FOOB-result branch supports that early exit before the later budget/map
path. The revised model matches all 160 captured return types, START slots,
scratch cells, path coordinates and observed point/cons identities in both
reviewer and root comparisons; the reviewer also compared the six earlier
explicit captures. Ordinal 42's proposed intermediate steps remain inferred.
This is a finite match, not recovered general source behavior. The next
holdout varies dimensions, positions and longer path budgets.

## Portable evidence and reproduction

[Portable evidence](evidence/zero-edge-input-matrix-20261012.json) is
2,936,099 bytes, SHA-256
`1aaf0cf554a6d4e83bdbb21375eed66b88a0ff0499f6e13b43850598b7b903b8`.
The [strict validator](../tools/derive-zero-edge-input-matrix-evidence.mjs)
is 107,242 bytes, SHA-256
`1a54ef8397cf4847de2c969f088a76b543ce281d2c2c57f9431d0401d57b913f`.
Independent agent/root derivations are byte-identical. All 285 source
bindings revalidate, including the preceding 199-source input evidence and
the frozen native 56-source closure.

The validator independently enumerates the expected 160 input specs,
checks every full scratch input/output, and requires sequential complete
records, readable direct point slots, typed-return/path consistency,
observed identities, original-state checks and stable previews. It binds
setup, all 12 runtime files, six current/staged Lisp sources, probe/loader
routing, requests, summaries, required runner and raw report. Control
timestamps bracket the target run. Actual drawing/scene and all runtime
bytes are compared in memory; portable JSON retains artifact hashes and
lengths, with complete measured case observations and no raw binary bytes.

```powershell
node research/tools/derive-zero-edge-input-matrix-evidence.mjs `
  --output research/extracted/local-oracle/zero-edge-matrix-seed1234-20261012-q/zero-edge-matrix-evidence-new.json
```

Use a fresh ignored output filename. This validator is frozen to q/p/r;
future captures need a separate validator or reviewed specification.

## Limits

These are 160 exact integer START/PERIM/map observations in a 7x7 scratch
configuration. They do not establish arbitrary budgets, fractional inputs,
other dimensions, natural calls, a direct caller, intermediate map reads,
or complete generator parity. Full original-map equality is checked live;
the report binds copy stages and equality results rather than serializing
all 829,440 original values at every boundary. Untested globals remain
outside the preservation scope.
