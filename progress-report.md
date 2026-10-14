# AARON reverse-engineering progress

Updated 2026-10-14. This is the compact project snapshot; technical evidence
and the running investigation history are linked below.

| Measure | Current status | What it means |
|---|---:|---|
| Distinct Lisp function binding names inventoried | 1,347 | Includes accessors and UI/host routines; it is not a count of recovered algorithms. |
| Routines with bounded JS/original comparisons | 31 names / 32 contracts | These are limited, measured behavior slices, not 31 complete function reconstructions. |
| Newly resolved direct caller | One captured `PICK` call from `SELECT-SUBJECT` method `(EQL PREMIUM)` | Exact full method payload/object bytes match the earlier live return site; REA still cannot resolve the computed callee. This adds no behavior contract. |
| FREE-PATH matrix rows compared to JS | 26/30 directly comparable match; 4 mismatch; 10 unclassified | 40 captured cases total; eight use index settings the API cannot express, and two source `-0.0d0` values were captured as `+0.0`. |
| Execution-plan milestones fully achieved | 1/5 (20% by milestone count) | Four are not yet fully achieved. Milestones are unequal in size, so this is not a project or time estimate. |
| Whole-painting parity | 0 complete results | No full painting has passed an original-versus-JS equivalence check. |
| Natural screen-unit context samples | 7 units across seeds 1234 and 5678 | Their selected paths replay 1,121 writer bytes. Units 2, 3, 5, and 6 provide 12 same-painting `PICK`/`PREVDEX` observations for `(27,28,29)`; seed-5678 unit 6 adds three observations for `(33,34,35)`. |
| Controlled PICK comparison | 16/16 three-integer cases match the JS adapter | Across 16 seeds, each return and next random value match selection by one `RAN(0,2)` draw. Other arities, types, and argument values remain uncharacterized. |

**There is no defensible overall completion percentage yet.** Function names
are not an implementation denominator, and the project has no weighted
function-by-function coverage or whole-scene scoring system. The measured
20% applies only to milestone count. The 26/30 FREE-PATH match rate applies
only to that finite canonical test subset.

The first natural PICK entry was captured in a matched-runner 768×1080
triplet. Its return maps to an anonymous 362-byte compiled PLL object at
payload offset 203; live bytes `FF 57 27` at the call site match the PLL, and
REA confirms the instruction boundary. A separate 320×480 method census then
matched the complete live payload to
`COMMON-GRAPHICS-USER::SELECT-SUBJECT` method `(EQL PREMIUM)`, resolving the
direct caller for that captured PICK entry. REA still reports the indirect
callee as unresolved. This adds no JS contract: counts remain 31 routine
names / 32 bounded contracts, 1/5 milestones (20% by count), and zero
whole-painting parity. There is no defensible overall completion percentage.
See the [caller findings](research/introspection/pick-native-caller.md),
[method identity](research/introspection/select-subject-methods.md), and
[portable evidence](research/introspection/evidence/select-subject-method-identity-20261014-v2.json).
Next, the native investigation will characterize the captured FREE and PREMIUM
method bodies and design a bounded probe for their results and state effects.

The JavaScript engine is a useful partial implementation and research harness,
but it is not yet a general reproduction of AARON. The main remaining work is
to recover upstream random and drawing decisions, finish and connect the
freehand/brush/fill/colour/clipping/output path, recover composition and object
generation, and verify complete paintings against fresh original runs.

## Current focus

Seven complete source-bound natural `SCREEN-AND-STORE` units now cover seeds
1234 and 5678. The six 320×480 samples and one 768×1080 sample reproduce
1,121 original writer bytes in their selected slices; the JS routine still
receives path and color events as inputs. Seed-5678 unit 6 contributes three
natural `PICK(33,34,35)` calls: returns `34, 34, 33`, nested `RAN(0,2)` indices
`1, 1, 0`, and entry `PREVDEX` values `35, 34, 34`. The first and third
different returns are followed by matching HDEX writes; the equal middle
return has no HDEX write before the next PICK. This is a separate-seed,
different-argument observation of the same candidate shape, but it is not a
holdout for the existing `(27,28,29)` contract: the current 12-case analyzer
is explicitly restricted to that list and seed 1234. This natural shifted
triple remains one unit and is not by itself a holdout or general rule.

The 12-case seed-1234 natural candidate remains bounded evidence. Four
source-bound interventions on `PICK(33,34,35)` now match its two-sided
prediction across seeds 1234 and 5678 at 768×1080: v11/v16 substitute a return
equal to `PREVDEX` and have no following HDEX write; v13/v15 substitute a
different return and observe one matching HDEX write. This supports the
candidate for these four cases, but does not identify the direct Lisp caller,
establish a general color rule, or add a JavaScript contract. See the
[screen-unit findings](research/introspection/screen-unit-context.md),
[seed-5678 unit-6 evidence](research/introspection/evidence/screen-unit-context-seed5678-unit6-20261014-v2.json),
[12-case candidate](research/introspection/evidence/pick-prevdex-natural-candidate-units2-3-5-6-20261014-v2.json),
[controlled PICK evidence](research/introspection/evidence/pick-contract-three-args-seed1234-20261014.json),
and [intervention evidence v11–v16](research/introspection/evidence/README.md).

The v14 seed-1234 unit-6 intervention was correctly stopped after its fresh
control measured 768×1080 rather than the required 320×480; no observer ran,
and no display setting was changed. A seed-5678 v6 retry exposed a separate
loader bug: the writer overlay reset the probe's optional target list, hiding
PICK and BRUSH-STROKE installation. The overlay now preserves only explicit
allowlisted lists, and the capture driver reports a missing PICK installation
without inferring that the function was unbound or unused. The corrected fresh
triplet passes with six matching outputs and seven matching ordinary scene
sources. Tooling details are in the [workarounds](research/tooling-workarounds.md).

There is still no defensible overall completion percentage. In seed-5678
unit 6, v15 changed the second PICK's caller-visible return from 34 to 35
while preserving `RAN(0,2)=1`; one `HDEX=35` followed before the next PICK.
V16 changed the terminal third PICK's return from 33 to 34 while preserving
`RAN(0,2)=0`; no HDEX followed before unit end. Both fresh 768×1080 triplets
match all six control outputs and seven ordinary Lisp sources. These results
do not change the measured 31 routine names / 32 bounded contracts, 1/5
milestones, or zero whole-painting parity. The next target is the unresolved
direct `PICK` caller/control-flow path using the native workflow and REA; do
not infer it from nearest-observed trace labels. See the
[intervention evidence](research/introspection/evidence/README.md),
[screen-unit findings](research/introspection/screen-unit-context.md), and
[native analysis workflow](research/native-analysis-workflow.md).

## Follow the evidence

- [Detailed progress report](research/progress-report.md)
- [Active execution plan](research/execution-plan.md)
- [Continuity handoff](research/aaron-continuity.md)
- [FREE-PATH findings](research/introspection/free-path-boundaries.md)
- [FREE-PATH native analysis](research/introspection/free-path-native.md)
- [FREE-PATH caller evidence](research/introspection/evidence/free-path-native-caller-20261014.json)
- [FREE-PATH v8 stop-boundary evidence](research/introspection/evidence/free-path-stop-boundary-20261014-v8.json)
- [FREE-PATH v9 stop-boundary evidence](research/introspection/evidence/free-path-stop-boundary-20261014-v9.json)
- [FREE-PATH caller triplet tooling](research/tools/capture-free-path-caller-triplet.ps1)
- [40-case JS comparison evidence](research/introspection/evidence/free-path-boundary-js-comparison-20261013.json)
- [Tooling workarounds](research/tooling-workarounds.md)
