# Natural screen-unit context observations

Six complete source-bound before/observer/after triplets captured natural
post-`RPARSE` `SCREEN-AND-STORE` units at 320×480: the first unit for seeds
1234 and 5678, and the second, third, fifth, and sixth units for seed 1234.
The observer records nearest traced ancestry, `RAN` calls, `PREP-LINE`, `AARGB` writer
events, and entry/exit context. Each selected path and its color events
reproduce the exact original writer byte slice, totaling 837 bytes.

| Seed | Unit / triplet | Nearest observed parent | Context | Path / output | Colors | RNG calls |
|---|---|---|---|---:|---|---:|
| 1234 | 1 / `screen-context-v1-20261014-001427-b937318e` | `BRUSH-STROKE` | `RPLANE=79`, `SDEX=1`, `PREVDEX=-1→28` | 74 points, 76 writer calls, 244 bytes | `(before 0, HDEX 29)`, `(before 23, HDEX 28)` | 6 |
| 5678 | 1 / `screen-ctx2-5678-20261014-002603-6d9f5e65` | `PAINT-FILL` | `RPLANE=132`, `SDEX=0`, `PREVDEX=-1→34` | 19 points, 21 writer calls, 80 bytes | `(before 0, HDEX 35)`, `(before 6, HDEX 34)` | 7 |
| 1234 | 2 / `screen-ctx3-unit2-20261014-004007-0ba991eb` | `BRUSH-STROKE` | `RPLANE=79`, `SDEX=1`, `PREVDEX=28→28` | 27 points, 29 writer calls, 103 bytes | `(before 10, HDEX 27)`, `(before 15, HDEX 28)` | 7 |
| 1234 | 3 / `pickprev1234u3-20261014-024804-9dbe464f` | `BRUSH-STROKE` | `RPLANE=79`, `SDEX=1`, `PREVDEX=28→27` | 34 points, 36 writer calls, 132 bytes | `(before 0, HDEX 29)`, `(before 13, HDEX 27)` | 7 |
| 1234 | 5 / `screen-context-v5-20261014-010625-d7df5d93` | `BRUSH-STROKE` | `RPLANE=79`, `SDEX=1`, `PREVDEX=27→27` | 39 points, 41 writer calls, 139 bytes | `(before 0, HDEX 28)`, `(before 15, HDEX 27)` | 7 |
| 1234 | 6 / `screen-context-v6c-20261014-013426-fe0e74a8` | `BRUSH-STROKE` | `RPLANE=79`, `SDEX=1`, `PREVDEX=27→28` | 39 points, 41 writer calls, 139 bytes | `(before 0, HDEX 29)`, `(before 14, HDEX 28)` | 7 |

All contexts report `PAINT-BRUSH`, boundary value 3, and 320×480 fill/patch
maps. The reports capture map dimensions and selected bindings, not complete
map contents or per-event map deltas. `PREP-LINE` occurs twice in each selected
unit, once immediately after each recorded `AARGB`/`HDEX` write.

## Unit-6 `PICK` observations

The typed v6 observer captured three natural calls to `PICK` with arguments
`(27 28 29)`. Their returns were 29, 28, and 28. Each call contains an
observed `RAN(0,2)` call returning 2, 1, and 1; the RAN records' parent IDs
match the corresponding traced `PICK` IDs. These are nearest traced-target
relationships, so unwrapped helpers could still intervene.

The first two returned values match the ensuing color writes: 29 is written
before point 0, then 28 before point 14. The third return is also 28, but no
later `AARGB` HDEX write occurs before this unit returns. This one natural
list and three draws do not establish `PICK`'s general contract or a general
color-selection rule. The complete typed calls, returns, state summaries, and
source/control hashes are retained in the [unit-6 evidence](evidence/screen-unit-context-seed1234-unit6-20261014.json).

## Natural `PICK`/`PREVDEX` candidate observations

The seed-1234 unit-3 observer records three more natural `PICK(27,28,29)`
calls. Returns 29, 27, and 27 have nested `RAN(0,2)` indices 2, 0, and 0.
`PREVDEX` at those RAN entries is 28, 29, and 27. The first two returns are
followed by matching `HDEX` writes before path points 0 and 13; the final
return has no following HDEX write before the next PICK.

Across units 2, 3, 5, and 6, the offline candidate check matches all 12
natural calls: eight returns differ from `PREVDEX` at the nested RAN entry and
are followed by an HDEX write of that return; four equal returns have no
following HDEX write before the next PICK or unit end. All four units come
from the same seed-1234 painting and use the same argument list. This is a
single-painting observational candidate, not an independent-seed or
controlled downstream test. The entry snapshot does not establish the Lisp
caller or exact native state slot. It adds no JS color contract and must not
be implemented as a recovered general rule.

The portable candidate report binds each input evidence hash and verifies
distinct unit ordinals, a shared AA0 hash, six matched control outputs, ten
ordinary staged scene sources, two observer-only report hashes, typed FIXNUM
RAN bounds/results, and a unique typed PREVDEX value. See the [12-case
analysis](evidence/pick-prevdex-natural-candidate-units2-3-5-6-20261014-v2.json),
[unit-3 evidence](evidence/pick-prevdex-seed1234-unit3-20261014.json), and
[offline analyzer](../tools/analyze-pick-prevdex-observations.mjs).

## Controlled three-integer `PICK` contract

The follow-up probe fixed the arguments to `(27 28 29)` and ran 16 isolated
seeds: `1234, 5678, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 77, 2026, 65535`.
All three positions were selected. For all 16 rows, the original return
equals the argument at the index from one direct `RAN(0,2)` draw; the next
`RAN(0,1000000)` equals the value after that same single draw. All 16 no-draw
checkpoints differ. The existing `Allegro501Random.pick` adapter and following
random call match the original row-by-row.

The source-bound before/observer/after triplet passed: all six drawing/scene
output hashes and all six ordinary staged Lisp source hashes match across
fresh uninstrumented controls. The portable checker also validates all 16
case markers, the probe and runner hashes, complete `INSTALL`/`READY`/
`COMPLETE`/`END` records, selected positions, the random checkpoints, and the
JavaScript comparison.

This is a bounded contract for one three-integer argument list and these
seeds. It does not establish other argument counts, numeric types, values,
hidden state, a source-level `PICK`-to-`RAN` call edge, or the downstream
screen color decision. The static REA dossier still reports the dispatch as
computed `CALL EDI` with no resolved targets; this dynamic equivalence does not
resolve that callsite or identify a direct Lisp caller. See the [probe]
(pick-contract-v1.cl), [portable evidence]
(evidence/pick-contract-three-args-seed1234-20261014.json), and [derivation
helper](../tools/derive-pick-contract-evidence.mjs).

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

Seed-1234 unit 5 shows the same paired neighbor changes in the opposite order.
Call 950 returns `RAN(0,2)→1` with `PREVDEX=27`, followed by `HDEX=28` and
`PREP-LINE(28)` before point 0. Call 968 returns 0 with `PREVDEX=28`, followed
by `HDEX=27` and `PREP-LINE(27)` before point 15. Call 982 later returns 0
with `PREVDEX=27` and has no following HDEX writer before unit return.

Across typed seed-1234 units 2 and 5, four paired events associate return 0
with one index below `PREVDEX` and return 1 with one index above it. Unit 2
also has an earlier return 1 with no HDEX write before the next random call;
unit 5 has a final return 0 with no later HDEX write. Thus `RAN(0,2)` alone
does not determine whether a color write occurs. `COLORDEX`, `CDEX`, and
`HDEX` are unbound in the inspected package bindings at these boundaries; the
chosen HDEX is visible in the writer arguments. These observations do not
identify the branch condition or establish a general formula.

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
- Seed 1234 unit 3 matched all six drawing/scene outputs and ten ordinary
  staged scene sources. Its 34-point writer slice has SHA-256
  `f46634b0a1f962bf0f8fc27d8fbdd7e97b5d63e93e1870bec7b394b000bfe0ec`.
- Seed 1234 unit 5 matched all six drawing/scene outputs and ten ordinary
  staged scene sources. Its 39-point writer slice has SHA-256
  `1761eebe7fed3dc082f3e36c395473d2d88eef80c416ecbc2a6bae5c903a7b4f`.
- Seed 1234 unit 6 matched all six outputs across fresh uninstrumented
  controls and ten ordinary staged Lisp sources. The `PICK` return target
  adds one `FIRST-PICK-RETURN` snapshot to the observer's scene report; the
  validator separately hashes it and requires that removing exactly this
  block restores control-report equality. The selected writer slice has SHA-256
  `577de280b5e8c94de4d617cc71ede92ab3b9a99ae59f6ff21987c12739336466`.
- The ancestry reports are limited to installed trace targets. `BRUSH-STROKE`
  was observed for seed 1234; the v2 seed-5678 probe records it as optional and
  did not install it. The observed parent labels do not prove direct Lisp
  callers.
- The v1/v2 reports did not encode each `RAN` argument's Lisp numeric type or
  snapshot context at each event. The v3 seed-1234 unit-2 and v5 unit-5 probes
  add typed arguments/results and snapshots `COLORDEX`, `PREVDEX`, `HDEX`,
  `CDEX`, `SDEX`, and `RPLANE`; v6 additionally captures `PICK` arguments and
  return values. The color-selection rule remains unresolved.
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
[seed-1234 unit-3 evidence](evidence/pick-prevdex-seed1234-unit3-20261014.json),
[seed-1234 unit-5 evidence](evidence/screen-unit-context-seed1234-unit5-20261014.json),
[seed-1234 unit-6 evidence](evidence/screen-unit-context-seed1234-unit6-20261014.json),
[controlled PICK evidence](evidence/pick-contract-three-args-seed1234-20261014.json),
[capture observer v1](screen-unit-context-v1.cl),
[capture observer v2](screen-unit-context-v2.cl),
[capture observer v3](screen-unit-context-v3.cl),
[capture observer v5](screen-unit-context-v5.cl),
[capture observer v6](screen-unit-context-v6.cl),
[triplet runner](../tools/capture-screen-unit-context-triplet.ps1), and
[portable evidence derivation](../tools/derive-screen-unit-context-evidence.mjs).

## Next experiment

The v4 probe's third unit at 768×1080 was a successful but empty screen call.
It had no `PREP-LINE` or writer calls, so the observer correctly emitted
`INCOMPLETE`; keep that attempt as diagnostics only. In a separate 320×480 v5
run, ordinal 3 is populated. This is run- and resolution-specific evidence,
not an ordinal rule. The controlled probe supports the fixed three-integer
`PICK(27,28,29)` contract across 16 seeds and matches the JS adapter 16/16.

The v11 and v12 source-bound interventions targeted the first and second
selected `PICK` calls in seed-1234 unit 2 at 768×1080. Each native return was
different from `PREVDEX`; each intervention preserved its nested `RAN(0,2)`
draw and substituted caller-visible `PREVDEX`. Neither was followed by an
HDEX write, matching the equality-side candidate prediction.

V13 targeted the same unit's first `PICK(33,34,35)`. The natural return was
34 with `PREVDEX=35`; nested `RAN(0,2)` selected index 1. Substituting only
the caller-visible value to 33 was followed by `HDEX=33` at call 965 / writer
ordinal 804, before the next PICK. This matches the candidate's opposite-side
prediction for this case. Its complete observer report is source-hashed. A
complete no-probe control captured just before the observer was reused; that
control and the fresh after run match six outputs, and ten ordinary staged
source hashes match. The observer's AA0 and image differ intentionally and
are hash-bound; image ID is unchanged. Its writer tape is a 50,000-call
prefix of 100,029 calls, but covers the selected unit's 12 writer calls.
Together, v11–v13 are one-seed, one-regime evidence. They do not prove a
direct Lisp caller, establish a general color rule, add a JS contract, or
count as parity. See [v11](evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v11-20261014.json),
[v12](evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v12-20261014.json), and
[v13](evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v13-20261014.json).

Next, use the terminal third `PICK` in the 320×480 seed-1234 unit-6 evidence:
its natural return 28 equals `PREVDEX=28`, and no HDEX write follows before
unit end. Preserve its nested random draw, substitute caller-visible 27, and
check whether `HDEX=27` appears before unit end. Require a fresh uninstrumented
control whose AA0 header measures 320×480; never force the display mode. This
tests a second regime in the same seed, not an independent-seed holdout. Then
capture an independent seed before promoting the candidate.
