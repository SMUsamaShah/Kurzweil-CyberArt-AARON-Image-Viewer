# Natural screen-unit context observations

Three complete source-bound before/observer/after triplets captured natural
post-`RPARSE` `SCREEN-AND-STORE` units at 320×480: the first unit for seeds
1234 and 5678, and the second unit for seed 1234. The observer records the
nearest traced ancestry, `RAN` calls, `PREP-LINE`, `AARGB` writer events, and
entry/exit context. Each selected path and its color events reproduce the
exact original writer byte slice.

| Seed | Unit / triplet | Nearest observed parent | Context | Path / output | Colors | RNG calls |
|---|---|---|---|---:|---|---:|
| 1234 | 1 / `screen-context-v1-20261014-001427-b937318e` | `BRUSH-STROKE` | `RPLANE=79`, `SDEX=1`, `PREVDEX=-1→28` | 74 points, 76 writer calls, 244 bytes | `(before 0, HDEX 29)`, `(before 23, HDEX 28)` | 6 |
| 5678 | 1 / `screen-ctx2-5678-20261014-002603-6d9f5e65` | `PAINT-FILL` | `RPLANE=132`, `SDEX=0`, `PREVDEX=-1→34` | 19 points, 21 writer calls, 80 bytes | `(before 0, HDEX 35)`, `(before 6, HDEX 34)` | 7 |
| 1234 | 2 / `screen-ctx3-unit2-20261014-004007-0ba991eb` | `BRUSH-STROKE` | `RPLANE=79`, `SDEX=1`, `PREVDEX=28→28` | 27 points, 29 writer calls, 103 bytes | `(before 10, HDEX 27)`, `(before 15, HDEX 28)` | 7 |

All contexts report `PAINT-BRUSH`, boundary value 3, and 320×480 fill/patch
maps. The reports capture map dimensions and selected bindings, not complete
map contents or per-event map deltas. `PREP-LINE` occurs twice in each selected
unit, once immediately after each recorded `AARGB`/`HDEX` write.

## Observed event order

The first five `RAN` argument pairs match across the two seeds, but their
returns vary with the seeded stream:

1. `RAN(0.25, 0.4)`
2. `RAN(0, 100)`
3. `RAN(0.55, 0.75)`
4. `RAN(0, 100)`
5. `RAN(0, 2)`

For seed 1234 unit 1, these return `0.30986965`, `71`, `0.5580921`, `95`,
and `2`. They are followed by `AARGB(HDEX=29)`, `PREP-LINE(29)`, then after
23 path points `RAN(0, 2)→1`, `AARGB(HDEX=28)`, and `PREP-LINE(28)`.

For seed 5678 unit 1, the same five calls return `0.33999515`, `13`,
`0.5595023`, `34`, and `2`. They are followed by `AARGB(HDEX=35)` and
`PREP-LINE(35)`. After six path points, `RAN(0, 2)→1` precedes
`AARGB(HDEX=34)` and `PREP-LINE(34)`. A further `RAN(0, 2)→1` occurs later
in that unit without another color event before return.

The seed-1234 unit-2 event snapshots preserve numeric types and selected
package bindings. Its `RAN(0,2)` call 854 returns 0 while `PREVDEX=28`, then
the writer records `HDEX=27` before point 10. Later call 862 returns 1 while
`PREVDEX=27`, then the writer records `HDEX=28` before point 15. At the next
random-call boundary, `PREVDEX` reflects 27; unit exit reports 28. Earlier
call 843 in this same unit also returns 1, but no HDEX writer occurs between
that call and the next random call 854.
The two color-associated calls are consistent with selecting one index below
or above the prior index, respectively, but the unpaired result 1 shows that
`RAN(0,2)` alone does not trigger a color write. `COLORDEX`, `CDEX`, and `HDEX`
are unbound in the inspected package bindings at these boundaries; the chosen
HDEX is visible in the writer arguments. These observations do not identify
the branch condition or establish a general formula.

Thus, in the two first-unit samples, the second color event follows a
`RAN(0, 2)` returning 1 and decrements `HDEX` by one. The unit-2 snapshots add
two color-associated calls: return 0 selects one index below `PREVDEX`, then
return 1 selects one index above the updated `PREVDEX`. An earlier return 1 in
that unit and a later return 1 in the seed-5678 sample have no corresponding
color event. The association depends on more state than the random result
alone, and these samples do not establish the general decision rule.

## Acceptance and limits

- Seed 1234 matched all six drawing/scene outputs and ten ordinary staged
  scene sources between controls and observer. Its exact writer slice has SHA-256
  `9993c4ca1a8883277f149a2ffb44a473ba63e874363e3d1bfd1a4e1d04cec74d`.
- Seed 5678 matched all six drawing/scene outputs and seven ordinary staged
  scene sources. Its exact writer slice has SHA-256
  `f0d0103217f8e869cb931e06306ba8a8320f12656ec0735e30146f066e99ee17`.
- Seed 1234 unit 2 matched all six drawing/scene outputs and ten ordinary
  staged scene sources. Its 27-point writer slice has SHA-256
  `48f9f1b3b2d6fa51907db8395b700408ef77c02c3d6408d259266006a579b0aa`.
- The ancestry reports are limited to installed trace targets. `BRUSH-STROKE`
  was observed for seed 1234; the v2 seed-5678 probe records it as optional and
  did not install it. The observed parent labels do not prove direct Lisp
  callers.
- The v1/v2 reports did not encode each `RAN` argument's Lisp numeric type or
  snapshot context at each event. The v3 seed-1234 unit-2 probe adds typed
  arguments/results and snapshots `COLORDEX`, `PREVDEX`, `HDEX`, `CDEX`,
  `SDEX`, and `RPLANE`; the color-selection rule remains unresolved.
- REA 6.4.0/Ghidra 12.1.4 confirms the static payload's central dispatch at
  `0x1fe24d12` is a computed `CALL EDI` with no resolved targets. This does not
  identify its runtime callee or a Lisp caller; see the
  [REA payload notes](rea-payload-analysis.md#screen-and-store-central-dispatch-call-2026-10-14).
- [`emitAaronScreenPath`](../../engine/src/aaron-screen-path.js) still receives
  the original path points and `colorEvents`. The captures establish no new JS
  behavior contract and do not complete the scene-decision milestone.

See the [seed-1234 unit-1 evidence](evidence/screen-unit-context-seed1234-20261014.json),
[seed-5678 unit-1 evidence](evidence/screen-unit-context-seed5678-20261014.json),
[seed-1234 unit-2 evidence](evidence/screen-unit-context-seed1234-unit2-20261014.json),
[capture observer v1](screen-unit-context-v1.cl),
[capture observer v2](screen-unit-context-v2.cl),
[capture observer v3](screen-unit-context-v3.cl),
[triplet runner](../tools/capture-screen-unit-context-triplet.ps1), and
[portable evidence derivation](../tools/derive-screen-unit-context-evidence.mjs).

## Next experiment

Capture the third post-`RPARSE` seed-1234 screen unit with the v3 event-state
observer. Its unit-2 predecessor in the same run changed `PREVDEX` 28→27→28,
with color-associated random returns 0 then 1. Compare whether the third unit
repeats those transitions or exposes a different return/state combination.
Require complete source-bound observer markers and fresh uninstrumented
controls; do not implement a color formula from the current three samples.
