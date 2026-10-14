# AARON reverse-engineering progress

Updated 2026-10-14. This is the compact project snapshot; technical evidence
and the running investigation history are linked below.

| Measure | Current status | What it means |
|---|---:|---|
| Distinct Lisp function binding names inventoried | 1,347 | Includes accessors and UI/host routines; it is not a count of recovered algorithms. |
| Routines with bounded JS/original comparisons | 30 names / 31 contracts | These are limited, measured behavior slices, not 30 complete function reconstructions. |
| FREE-PATH matrix rows compared to JS | 26/30 directly comparable match; 4 mismatch; 10 unclassified | 40 captured cases total; eight use index settings the API cannot express, and two source `-0.0d0` values were captured as `+0.0`. |
| Execution-plan milestones fully achieved | 1/5 (20% by milestone count) | Four are not yet fully achieved. Milestones are unequal in size, so this is not a project or time estimate. |
| Whole-painting parity | 0 complete results | No full painting has passed an original-versus-JS equivalence check. |

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

The latest screen-boundary work captured three complete source-bound natural
`SCREEN-AND-STORE` units at 320×480. Their selected paths and color events
reproduce 427 original writer bytes, but the JS routine still receives those
events as inputs. Typed snapshots for seed-1234 unit 2 show `RAN(0,2)→0` with
`PREVDEX=28` before `HDEX=27`, then `RAN(0,2)→1` with `PREVDEX=27` before
`HDEX=28`. An earlier return of 1 in that unit has no HDEX write before the
next random call, so this is a bounded state correlation, not a general rule.
The observed parent labels include `BRUSH-STROKE` and `PAINT-FILL`; they do not
prove direct callers. See the
[screen-unit findings](research/introspection/screen-unit-context.md) and
[portable evidence for seed 1234 unit 1](research/introspection/evidence/screen-unit-context-seed1234-20261014.json),
[seed 5678 unit 1](research/introspection/evidence/screen-unit-context-seed5678-20261014.json),
and [seed 1234 unit 2](research/introspection/evidence/screen-unit-context-seed1234-unit2-20261014.json).

Next, capture the third post-`RPARSE` seed-1234 unit with the existing typed
event-state observer. Metrics remain 30 routine names / 31 bounded contracts,
1/5 milestones (20% by count), and zero whole-painting parity. There is still
no defensible overall percentage.

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
