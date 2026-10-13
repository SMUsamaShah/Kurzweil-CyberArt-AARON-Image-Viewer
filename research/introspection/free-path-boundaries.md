# FREE-PATH boundary matrix

Updated 2026-10-13. This is a finite direct-call matrix for the original
compiled Lisp function, collected after the natural scene writer has returned.
It extends the existing natural-call investigation; it does not establish a
complete `FREE-PATH` contract.

## Captured behavior

The matrix has 40 complete cases: 20 input shapes at each seeded state 1 and
1234. Shapes include visible and zero-visibility points, coincident and long
edges, negative and fractional coordinates, single/double-float values,
polygons, and forward/reversed index ranges. Every case records its explicit
`FDEX`, `TDEX`, `FROM`, and `TO`, all `XYDIST` and `RAN` calls, the returned
point list, the input list afterward, and the next random checkpoint.

Across these cases, returned lists contain 13–60 points, `XYDIST` runs 1–5
times, and `RAN` runs 31–170 times. All 40 cases returned without errors, all
private input lists remained unchanged, the `RAN` and `XYDIST` function cells
were restored, and the report ended with `END free-path-boundaries`.

These are measured outcomes for the recorded finite samples. The matrix does
not cover all numeric types or ranges. Its bounded JavaScript comparison and a
separate three-case edge comparison are described below; neither establishes
a complete `FREE-PATH` contract or whole-painting parity.

## Source-bound scene controls

The complete triplet uses `writer-stream-seed-1234`:

| Role | Run ID | AA0 dimensions | AA0 SHA-256 |
| --- | --- | ---: | --- |
| Uninstrumented before | `freepath-after-main-control-before-20261013-h` | 768×1080 | `405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a` |
| Observer | `freepath-after-main-observer-20261013-i` | 768×1080 | `405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a` |
| Uninstrumented after | `freepath-after-main-control-after-20261013-j` | 768×1080 | `405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a` |

All six drawing/scene outputs and all six ordinary staged Lisp sources match
across the three runs. The observer's staged probe hash matches the checked-in
[`free-path-boundaries.cl`](free-path-boundaries.cl) source. Its required
report SHA-256 is
`cc0909bd9d9d71821168d26f806f784cc487f5607d73a31af0274a896112ced5`.
All hashes and the 40 raw case results are retained in the
[portable evidence](evidence/free-path-boundaries-20261013.json).

## Why the probe runs after MAIN

A complete pre-scene version of the matrix still changed the natural scene:
the first captured `STORE-IN-FILE` point differed from both clean controls,
even though the report had no errors, restored the wrapped functions, and
showed the same seeded preview. The exact changed runtime state was not
identified. That pre-scene observer is rejected as scene evidence.

The accepted source loads the normal writer-stream observer first and places
its `MAIN` wrapper outside that observer. It runs the matrix only after the
original `MAIN` and its scene-state wrapper return. The matched triplet checks
that this placement leaves the saved scene outputs and ordinary source files
unchanged. Reuse the
[read-only triplet verifier](../tools/verify-local-aaron-triplet.mjs) and
[evidence builder](../tools/derive-free-path-boundary-evidence.mjs) for future
captures of this mode.

## Isolated stop-boundary comparisons

Updated 2026-10-13. A second source-bound post-MAIN triplet isolated one
visible forward edge per case with `((0 0 0) (10 0 1))`. The zero-visibility
first vertex suppresses the reverse closing edge; the observer records exactly
one `XYDIST` call for each case. All three reports completed, restored `RAN`
and `XYDIST`, and left the input list unchanged.

| Seed | Selected steps | Original steps | Step-sum candidate | Emitted-point-distance candidate | Current JS |
| ---: | ---: | ---: | ---: | ---: |---|
| 522862 | 10 | 10 | 9 | 10 (selected-step cap) | Mismatch: stops after 9 |
| 256819 | 13 | 11 | 11 | 12 | Exact match |
| 348048 | 14 | 12 | 13 | 12 | Mismatch: stops after 13 |

The step-sum and source-to-emitted-point-distance columns are separate
candidate calculations replayed from the local seeded RNG stream. Their
random-call prefix is checked against the original capture; the compiled
function's internal progress value is not visible. Seed 256819 is an exact JS comparison
for this one edge, while seeds 522862 and 348048 remain counterexamples to the
current JS stop condition. Seed 522862 reaches the selected-step cap under the
emitted-point-distance calculation, so it does not distinguish that rule from
other rules that also stop at the cap. The other two seeds favor different
candidate calculations, so neither calculation is established as a general
original stop rule.

Fresh uninstrumented before/after controls and the observer all measured
768×1080 from the AA0 header. Their six drawing/scene outputs and six ordinary
staged Lisp sources match. The checked-in probe hash is
`de78b03758f7a6dd97aeb2caee6b38d0f9bd5c4fbc1672d16a0b5841f9f508a2`; the
required report hash is
`52f61f64807ed7845b3e70b5b970e24761e3f3b3c3a4e93886898f49d5c98bdd`.
The [portable evidence](evidence/free-path-stop-boundary-20261013-v2.json)
records all random calls, returned points, checkpoints, control hashes, and
the bounded JS comparisons. The
[scope validator](../tools/check-lisp-probe-scope.mjs) checks that the deferred
helper and outer MAIN wrapper remain at the expected Lisp nesting depth before
the observer is run.

This adds comparison rows within the existing bounded `FREE-PATH` unit; it
does not add a recovered routine or a project-wide behavior-coverage score.

## Offline comparison of the 40-case matrix

The retained matrix was compared to the current JavaScript helper without
starting AARON. The comparator validates the source-bound report's `MAIN`
return, terminal marker, exact 40 seed/name pairs, absence of unknown records,
and stored report/probe hashes. Each case starts a fresh original and JS random
state from its own seed at offset zero; captured values are never replayed into
JavaScript. Numeric source types come from the checked-in Lisp literals.

Of 40 cases, 30 are directly represented by the closed-list JavaScript API:
`FDEX=0`, `TDEX=point-count-1`, `FROM=0`, and `TO=1`, with source/report input
agreement. **26 of those 30 rows match** the complete recorded `RAN` sequence,
returned points, next-random checkpoint, and input immutability. Four seed-1234
polygon rows differ:

| Case | Original: RAN calls / points / next value | JavaScript: RAN calls / points / next value |
|---|---:|---:|
| `triangle-visible` | 99 / 35 / 1,522 | 102 / 36 / 90,465 |
| `triangle-negative-vis` | 99 / 35 / 1,522 | 102 / 36 / 90,465 |
| `square-visible` | 142 / 50 / 82,528 | 136 / 48 / 26,522 |
| `pentagon-visible` | 170 / 60 / 55,068 | 164 / 58 / 87,688 |

The other 10 rows remain unclassified: eight have noncanonical index settings
the API cannot express, and two `negative-zero` cases have `+0.0d0` in the
captured header even though the source literal is `-0.0d0`. No slice, rotation,
or reversal was inferred for those index cases, and signed-zero behavior is
not claimed.

The portable evidence keeps `RAN` and `XYDIST` records in separate arrays, so
the comparison does not establish their shared event ordering. It also does
not establish a natural caller, general stop rule, scene-generation parity,
or whole-painting parity. The result is 26/30 (86.7%) only for this finite,
directly comparable subset; it is not a project completion percentage. The
overall routine/contract counts and execution-milestone percentage do not
change. See the [portable comparison evidence](evidence/free-path-boundary-js-comparison-20261013.json)
and the [reproducible comparator](../tools/compare-free-path-boundary-matrix.mjs).

The natural caller question was completed in the 2026-10-14
[source-bound triplet](evidence/free-path-native-caller-20261014.json): the
first observed entry returned to DRAW-CFORM after an indirect native call.
That bounded call-path result does not resolve the distance-stop rule. The
remaining FREE-PATH task is to choose a fresh one-edge case that separates the
still-live stop candidates, then compare the complete random-call sequence,
returned points and next-random checkpoint. Do not widen the JS implementation
from these finite polygon cases alone.
