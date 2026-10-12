# ZERO-EDGE: direction and one-cell inputs, 2026-10-12

## Question and controlled changes

Starting from the [PERIM 3 zero-map sample](zero-edge-positive.md), measure
two separate input changes in separate original-runtime processes:

1. START `(3,3,1)` instead of `(3,3,0)`, retaining PERIM 3 and all 49 zero
   scratch cells.
2. START `(3,3,0)` and PERIM 3, changing only scratch FILL-MAP array index
   `[3,2]` to 1 and retaining zero in all other 48 cells.

Both calls occur after normal MAIN. The original compiled ZERO-EDGE is
called explicitly once and remains unwrapped. MAKE-TRIPT's direct slots are
gated against the selected input. FILL-MAP and picture dimensions are bound
temporarily to a 7x7 UBYTE4 scratch map; seven original bindings and both
full original maps are checked after leaving PROGV. PATCH-MAP remains the
original array, with writes detected afterward rather than prevented.

The map probe initializes the one cell before its input snapshot. Both of
its former zero-only gates use an exact-pattern predicate: one `[3,2]` entry
with value 1 and zero elsewhere in the complete 49-cell list. The cell
enumerator produces every unique index using x outer/y inner and
`(aref map x y)`. The offline validator must check the full input sequence,
not merely accept the readiness flag. Static source diffs and IF/EMIT shape
checks pass; these do not establish runtime semantics.

## Observed results

| Case | START before | Scratch input | One returned value | START after |
|---|---|---|---|---|
| Previous baseline | `(3,3,0)` | 49 zeros | Proper five-point list | `(3,3,0)` |
| Direction 1 | `(3,3,1)` | 49 zeros | Proper five-point list | `(3,3,1)` |
| One-cell change | `(3,3,0)` | `[3,2]=1`, other 48 zero | NIL | `(3,3,1)` |

The direction-1 result is a proper, noncircular, nontruncated list with these
direct FIXNUM slots in the captured return order:

| Index | X/Y/Z | EQ supplied START | First EQ point index |
|---:|---|---|---:|
| 0 | `(3,3,3)` | NIL | 0 |
| 1 | `(4,2,5)` | NIL | 1 |
| 2 | `(5,3,7)` | NIL | 2 |
| 3 | `(4,4,1)` | NIL | 3 |
| 4 | `(3,3,1)` | T | 4 |

All five points are distinct by the captured EQ comparisons; the last one
is the original START. The list and final cons are not EQ START. Its typed
CONS return summary and separate detailed point-list capture agree.

The one-cell sample returns exactly one NIL value and an empty proper path
summary. Its supplied point's X/Y remain 3/3 while Z changes 0 to 1. This is
a different captured result from the zero-map baseline. It does not identify
the target's intermediate reads or prove a general map-value rule.

Both samples have one actual target return, no target condition, zero
observer errors, no overflow, a completed case and their own COMPLETE/END.
All 49 scratch cells retain their input values, including the map probe's
one nonzero cell. Copied three-draw previews remain valid/stable at
`(59,29,74)` around both constructor and target. The original direction
lists retain their full eight-entry contents and identities; global START
is present but unbound at the observed boundaries. Both original maps retain
identity, metadata and all 829,440 cells, and all seven bindings restore.

## Source-bound captures

Raw reports/runtime files remain ignored under
`research/extracted/local-oracle/`. Run labels use the local date; retain
the raw UTC timestamps rather than inferring them from a basename.

| Case | Run basename | Frozen probe SHA-256 / bytes | Report SHA-256 / bytes |
|---|---|---|---|
| Direction 1 | `zero-edge-direction1-seed1234-20261012-l` | `7fca207e616164e6cc5bdea6041ffd84460cedb252f1195ce50e77d6b36f84d8` / 76,061 | `a1b1c5e758244568bd493c40de82e0c9a381a214c625c00af26b60a307796441` / 21,734 |
| One-cell change | `zero-edge-mapcell1-seed1234-20261012-n` | `c62401a46b2f08fbafe9f66c8f4e66c0bc20f123c9fdd806535032ded3fa01d4` / 76,524 | `d4817358fe742b27c5623e87febc5845b04a0507f20cce0bdcf48f0bbfcfc855` / 20,205 |

Each report has 113 complete lines. Sources are
[direction 1](zero-edge-direction1.cl) and
[one-cell change](zero-edge-mapcell1.cl). Earlier frozen probes are retained.

## Fresh controls

The primary uninstrumented writer-stream seed-1234 controls surround the
two input captures:

- `zero-edge-input-control-seed1234-20261012-k`, before both cases.
- `zero-edge-input-control-after-seed1234-20261012-o`, after both cases.

Both have no optional pre-scene probe and complete drawing/scene records.
Each case's actual four output files are byte-identical to both controls.
The additional complete repeat `zero-edge-input-control-repeat-seed1234-20261012-m`
has the same four output bytes. The captured natural maps measure 768x1080;
the earlier 320x480 configuration remains separate and its change is unexplained.

| Actual control file | Bytes | SHA-256 |
|---|---:|---|
| AA0 | 426,587 | `405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a` |
| image | 424,205 | `457793c43166f822d8ded53b1570c8cdc1b7db9da794425344b8669b0d8b5e8e` |
| image-id | 3 | `13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354` |
| aaron-scene-state-snapshot.txt | 25,959 | `153374c2b52a86ca31e33c7102385d2a7c5c88267b50bcfa4947a608eb984ed3` |

## Portable evidence and reproduction

[Portable evidence](evidence/zero-edge-inputs-20261012.json) is 246,176 bytes,
SHA-256
`bfeeb9c518562621f2d89da7b07fcf4c5552df9201419af85b12b88af083c5dc`.
The [immutable case specification](zero-edge-input-cases-20261012.json) is
9,496 bytes, SHA-256
`a17031aea65d47fba3d847c5049a5b293c842c3ccdc13a2fe880a452cbe9a92f`.
The [reusable validator](../tools/derive-zero-edge-input-evidence.mjs) is
124,487 bytes, SHA-256
`94d08a4774a4ebe5ecfdc76442114d98ef8c348e17e5238057c5e1b27f31ca82`.

The validator source-binds and freezes the JSON specification, then checks
the exact source/report pins, complete expected input cells, constructor and
call coordinates, scopes/readiness fields, typed return/path consistency,
identity flags, ordered 113-record schema, restoration and completion gates.
It validates setup, routing/request/current/staged Lisp and runtime files,
rederives the native 56-source baseline, and compares actual drawing/scene
and all 12 runtime files with the two controls. Their timestamps must bracket
the case series. Independent agent/root outputs are byte-identical; all 199
source bindings revalidate against current bytes.

```powershell
node research/tools/derive-zero-edge-input-evidence.mjs `
  --spec research/introspection/zero-edge-input-cases-20261012.json `
  --output research/extracted/local-oracle/zero-edge-mapcell1-seed1234-20261012-n/zero-edge-input-evidence-new.json
```

Use a fresh ignored output filename. Future separately reviewed cases can
use a new source-bound specification within this validator's bounded schema;
retain this specification and all earlier frozen captures unchanged.

## Limits and next investigation

These are two controlled observations, not a recovered ZERO-EDGE algorithm
or general direction/PERIM/map domain. They do not count natural calls or
identify a direct caller. Before/after equality does not describe every
intermediate state, and copied previews do not prove complete RNG purity.
Other globals remain outside the preservation scope.
The full original-map values are compared live against copied arrays;
portable evidence retains the bound copy stages and equality results rather
than serializing those 829,440 values for each map.

The static counter/direction/map branches suggest a provisional traversal
model, but unresolved indirect calls and tagged arithmetic keep that model
a hypothesis. Next capture a bounded matrix that varies direction, budget,
boundary position and simple map shapes, then compare complete returned
points, identities, supplied-point mutations and scratch contents. Promote
only the measured domain after source/control checks pass.
