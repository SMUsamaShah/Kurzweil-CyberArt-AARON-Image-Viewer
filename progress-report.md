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

FREE-PATH has a complete source-bound natural-caller triplet at 320×480. The
first observed entry returned into `DRAW-CFORM` after its computed `CALL EDI`
at offset `0x165`; the dynamic target remains unresolved. Two controlled
triplets then measured the same vertical 0.2 single-float edge at seeds 150415
and 46380. Both original runs selected 14 steps and consumed 12; JavaScript
consumed 13 in each. The local step-sum candidate predicts 13 for both cases,
source-to-emitted predicts 13 then 12, and step-times-wiggle predicts 12 for
both. Of these three local candidates, only step-times-wiggle matches both
observed counts; this two-case result does not recover a general stop rule.
The v9 run was 768×1080; v8 was 320×480. Across nine isolated one-edge cases,
JavaScript matches four and differs by one step in five. This adds no behavior
contract: the 40-case matrix remains 26/30 matching, four mismatches and ten
unclassified. See the [v8 evidence](research/introspection/evidence/free-path-stop-boundary-20261014-v8.json),
[v9 evidence](research/introspection/evidence/free-path-stop-boundary-20261014-v9.json),
and [FREE-PATH findings](research/introspection/free-path-native.md). The next
target is one natural `SCREEN-AND-STORE`/`PREP-LINE` drawing unit, including
its caller, color, RNG, map, and writer decisions.

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
