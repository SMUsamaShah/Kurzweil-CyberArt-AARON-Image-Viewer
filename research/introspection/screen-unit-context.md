# Natural screen-unit context observations

Two complete source-bound before/observer/after triplets captured the first
post-`RPARSE` `SCREEN-AND-STORE` unit at 320×480. The observer records the
nearest traced ancestry, `RAN` calls, `PREP-LINE`, `AARGB` writer events, and
entry/exit context. The evidence also validates that the selected path and
color events reproduce the exact original writer byte slice.

| Seed | Triplet | Nearest observed parent | Context | Path / output | Colors | RNG calls |
|---|---|---|---|---:|---|---:|
| 1234 | `screen-context-v1-20261014-001427-b937318e` | `BRUSH-STROKE` | `RPLANE=79`, `SDEX=1`, `PREVDEX=-1→28` | 74 points, 76 writer calls, 244 bytes | `(before 0, HDEX 29)`, `(before 23, HDEX 28)` | 6 |
| 5678 | `screen-ctx2-5678-20261014-002603-6d9f5e65` | `PAINT-FILL` | `RPLANE=132`, `SDEX=0`, `PREVDEX=-1→34` | 19 points, 21 writer calls, 80 bytes | `(before 0, HDEX 35)`, `(before 6, HDEX 34)` | 7 |

Both contexts report `PAINT-BRUSH`, boundary value 3, and 320×480 fill/patch
maps. The reports capture map dimensions and bindings, not complete map
contents or per-event map deltas. `PREP-LINE` occurs twice in each selected
unit, once immediately after each recorded `AARGB`/`HDEX` write.

## Observed event order

The first five `RAN` argument pairs match across the two seeds, but their
returns vary with the seeded stream:

1. `RAN(0.25, 0.4)`
2. `RAN(0, 100)`
3. `RAN(0.55, 0.75)`
4. `RAN(0, 100)`
5. `RAN(0, 2)`

For seed 1234, these return `0.30986965`, `71`, `0.5580921`, `95`, and `2`.
They are followed by `AARGB(HDEX=29)`, `PREP-LINE(29)`, then after 23 path
points `RAN(0, 2)→1`, `AARGB(HDEX=28)`, and `PREP-LINE(28)`.

For seed 5678, the same five calls return `0.33999515`, `13`, `0.5595023`,
`34`, and `2`. They are followed by `AARGB(HDEX=35)` and `PREP-LINE(35)`.
After six path points, `RAN(0, 2)→1` precedes `AARGB(HDEX=34)` and
`PREP-LINE(34)`. A further `RAN(0, 2)→1` occurs later in the unit without
another color event before return.

Thus, in these two samples, the second color event follows a `RAN(0, 2)`
returning 1 and decrements `HDEX` by one. The later random return without a
color event shows that this value alone is not sufficient to cause a color
change. Two samples do not establish a general decision rule.

## Acceptance and limits

- Seed 1234 matched all six drawing/scene outputs and ten ordinary staged
  scene sources between controls and observer. Its exact writer slice has SHA-256
  `9993c4ca1a8883277f149a2ffb44a473ba63e874363e3d1bfd1a4e1d04cec74d`.
- Seed 5678 matched all six drawing/scene outputs and seven ordinary staged
  scene sources. Its exact writer slice has SHA-256
  `f0d0103217f8e869cb931e06306ba8a8320f12656ec0735e30146f066e99ee17`.
- The ancestry reports are limited to installed trace targets. `BRUSH-STROKE`
  was observed for seed 1234; the v2 seed-5678 probe records it as optional and
  did not install it. The observed parent labels do not prove direct Lisp
  callers.
- The report's printed `RAN` arguments do not encode each argument's Lisp
  numeric type. The compact JSON normalizes them for comparison. A follow-up
  must preserve argument/result types and capture `COLORDEX`, `PREVDEX`, `HDEX`,
  and related bindings at each random and color event.
- REA 6.4.0/Ghidra 12.1.4 confirms the static payload's central dispatch at
  `0x1fe24d12` is a computed `CALL EDI` with no resolved targets. This does not
  identify its runtime callee or a Lisp caller; see the
  [REA payload notes](rea-payload-analysis.md#screen-and-store-central-dispatch-call-2026-10-14).
- [`emitAaronScreenPath`](../../engine/src/aaron-screen-path.js) still receives
  the original path points and `colorEvents`. The captures establish no new JS
  behavior contract and do not complete the scene-decision milestone.

See the [seed-1234 evidence](evidence/screen-unit-context-seed1234-20261014.json),
[seed-5678 evidence](evidence/screen-unit-context-seed5678-20261014.json),
[capture observer v1](screen-unit-context-v1.cl),
[capture observer v2](screen-unit-context-v2.cl),
[triplet runner](../tools/capture-screen-unit-context-triplet.ps1), and
[portable evidence derivation](../tools/derive-screen-unit-context-evidence.mjs).

## Next experiment

Capture one fresh seed-1234 triplet with a source-bound event snapshot at each
`RAN`, `AARGB(HDEX=...)`, and `PREP-LINE` boundary. Preserve numeric types and
record `COLORDEX`, `PREVDEX`, `HDEX`, `CDEX`, `SDEX`, and `RPLANE`. Require the
existing uninstrumented controls to match every scene output and ordinary
staged source, then compare the ordered event snapshots to the current sample.
The purpose is to find the state that controls color changes; do not implement
a color formula unless those state transitions support it.
