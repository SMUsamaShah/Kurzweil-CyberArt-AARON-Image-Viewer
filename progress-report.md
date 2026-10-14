# AARON reverse-engineering progress

Updated 2026-10-14. This is the compact project snapshot; technical evidence
and the running investigation history are linked below.

| Measure | Current status | What it means |
|---|---:|---|
| Distinct Lisp function binding names inventoried | 1,347 | Includes accessors and UI/host routines; it is not a count of recovered algorithms. |
| Routines with bounded JS/original comparisons | 31 names / 32 contracts | These are limited, measured behavior slices, not 31 complete function reconstructions. |
| FREE-PATH matrix rows compared to JS | 26/30 directly comparable match; 4 mismatch; 10 unclassified | 40 captured cases total; eight use index settings the API cannot express, and two source `-0.0d0` values were captured as `+0.0`. |
| Execution-plan milestones fully achieved | 1/5 (20% by milestone count) | Four are not yet fully achieved. Milestones are unequal in size, so this is not a project or time estimate. |
| Whole-painting parity | 0 complete results | No full painting has passed an original-versus-JS equivalence check. |
| Natural screen-unit context samples | 6 units across seeds 1234 and 5678 | Their selected paths replay 837 writer bytes. Units 2, 3, 5, and 6 provide 12 natural `PICK`/`PREVDEX` observations from one seed-1234 painting. |
| Controlled PICK comparison | 16/16 three-integer cases match the JS adapter | Across 16 seeds, each return and next random value match selection by one `RAN(0,2)` draw. Other arities, types, and argument values remain uncharacterized. |

**There is no defensible overall completion percentage yet.** Function names
are not an implementation denominator, and the project has no weighted
function-by-function coverage or whole-scene scoring system. The measured
20% applies only to milestone count. The 26/30 FREE-PATH match rate applies
only to that finite canonical test subset.

The JavaScript engine is a useful partial implementation and research harness,
but it is not yet a general reproduction of AARON. The main remaining work is
to recover upstream random and drawing decisions, finish and connect the
freehand/brush/fill/colour/clipping/output path, recover composition and object
generation, and verify complete paintings against fresh original runs.

## Current focus

The latest screen-boundary work captured six complete source-bound natural
`SCREEN-AND-STORE` units at 320×480. Their selected paths and color events
reproduce 837 original writer bytes, but the JS routine still receives those
events as inputs. A controlled probe tested `PICK(27,28,29)` across 16 seeds:
all returns equal the argument at one `RAN(0,2)` index and the next random
value matches the one-draw control; the JS adapter matches all 16 rows.
Separately, 12 natural calls across units 2, 3, 5, and 6 fit one
`PICK-return-differs-from-PREVDEX` candidate: eight differing returns are
followed by matching HDEX writes and four equal returns have no following
write. Those units are from the same seed-1234 painting. Two fresh 768×1080
interventions then changed the first and second selected unit-2 PICK results
to equal `PREVDEX`, leaving each natural random draw intact. Neither was
followed by an HDEX write, as the candidate predicts. The source-bound
before/observer/after triplets have matching controls and ten matching
ordinary staged sources; their AA0 and preview image intentionally differ.
The writer tape is a 50,000-call prefix
of 100,029 total calls, but it covers the selected 12-call unit slice. These
are two equality-side tests in one seed and regime, not a general color rule,
independent-seed holdout, direct caller proof, or JS contract. See the
[screen-unit findings](research/introspection/screen-unit-context.md) and
[portable evidence for seed 1234 unit 1](research/introspection/evidence/screen-unit-context-seed1234-20261014.json),
[seed 5678 unit 1](research/introspection/evidence/screen-unit-context-seed5678-20261014.json),
[seed 1234 unit 2](research/introspection/evidence/screen-unit-context-seed1234-unit2-20261014.json), and
[seed 1234 unit 3](research/introspection/evidence/pick-prevdex-seed1234-unit3-20261014.json),
[seed 1234 unit 5](research/introspection/evidence/screen-unit-context-seed1234-unit5-20261014.json),
[seed 1234 unit 6](research/introspection/evidence/screen-unit-context-seed1234-unit6-20261014.json), and
[12-case natural candidate](research/introspection/evidence/pick-prevdex-natural-candidate-units2-3-5-6-20261014-v2.json),
[controlled PICK evidence](research/introspection/evidence/pick-contract-three-args-seed1234-20261014.json),
[first return intervention](research/introspection/evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v11-20261014.json), and
[second return intervention](research/introspection/evidence/pick-prevdex-return-intervention-seed1234-unit2-768x1080-v12-20261014.json).

The v4 probe's third unit at 768×1080 had no `PREP-LINE` or writer calls and
correctly failed the observer's nonempty completion gate. The separate 320×480
v5 inventory shows ordinal 3 populated, and a separate v10 triplet now captures
that unit with matching fresh controls, so the v4 result is run- and
resolution-specific diagnostic evidence, not an ordinal rule. The v5 observer
was configured for unit 5 and matched fresh controls. Unit 6 is also accepted
with a complete typed observer and fresh controls; its extra `PICK` return
target adds exactly one validated `FIRST-PICK-RETURN` snapshot to the observer
scene report. Counts are now 31 routine names / 32 bounded contracts, 1/5
milestones (20% by count), and zero whole-painting parity. There is still no
defensible overall percentage. The next target is the terminal third `PICK`
in the 320×480 seed-1234 unit-6 evidence: natural return 28 equals
`PREVDEX=28`. Preserve its nested random draw, substitute caller-visible 27,
and check for `HDEX=27` before unit end. This is an opposite-side causal test
for the candidate, not an independent-seed holdout; follow it with an
independent seed and fresh controls.

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
