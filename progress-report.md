# AARON reverse-engineering progress

Updated 2026-10-14. This is the compact project snapshot; technical evidence
and the running investigation history are linked below.

| Measure | Current status | What it means |
|---|---:|---|
| Distinct Lisp function binding names inventoried | 1,347 | Includes accessors and UI/host routines; it is not a count of recovered algorithms. |
| Routines with bounded JS/original comparisons | 31 names / 32 contracts | These are limited, measured behavior slices, not 31 complete function reconstructions. |
| PREMIUM indirect CALL destination | One accepted 768×1080 source-bound triplet captured pre-call `[EDI+0x27]=0x20000983`; same-thread DR0 breakpoint hit before the target instruction, and `[ESP]=callsite+3` | The target is not the named PICK entry; the anonymous target's function boundary and route to PICK remain unresolved. Adds no behavior contract. |
| FREE-PATH indirect call-site sample | 2 of 3 selected sites hit | REA located two computed calls and their nearby branch. The same raw slot value was read at both hits, but remains unnamed and is not counted as a recovered function. |
| FREE-PATH matrix rows compared to JS | 26/30 directly comparable match; 4 mismatch; 10 unclassified | 40 captured cases total; eight use index settings the API cannot express, and two source `-0.0d0` values were captured as `+0.0`. |
| FREE-PATH isolated one-edge stop cases | 10 captured; JS matches 4 and differs by one step in 6 | The v11 seed 456069 sample is a mismatch; step-times-wiggle matches the original counts across v8/v9/v11 only as a local replay hypothesis. |
| SELECT-SUBJECT native call sites inventoried | 36/36 queried; all unresolved computed calls with no static targets | REA lists 17 FREE and 19 PREMIUM callsites. This is a static-analysis limit, not evidence that the calls lack runtime targets. |
| Execution-plan milestones fully achieved | 1/5 (20% by milestone count) | Four are not yet fully achieved. Milestones are unequal in size, so this is not a project or time estimate. |
| Whole-painting parity | 0 complete results | No full painting has passed an original-versus-JS equivalence check. |
| Natural screen-unit context samples | 7 units across seeds 1234 and 5678 | Their selected paths replay 1,121 writer bytes. Units 2, 3, 5, and 6 provide 12 same-painting `PICK`/`PREVDEX` observations for `(27,28,29)`; seed-5678 unit 6 adds three observations for `(33,34,35)`. |
| Controlled PICK comparison | 16/16 three-integer and 32/32 two-/four-integer cases match the JS adapter | Across 16 seeds per case set, each return and next random value match one `RAN(0,n-1)` draw. Inputs are bounded positive distinct fixnums; other arities, types, and values remain uncharacterized. |

**There is no defensible overall completion percentage yet.** Function names
are not an implementation denominator, and the project has no weighted
function-by-function coverage or whole-scene scoring system. The measured
20% applies only to milestone count. The 26/30 FREE-PATH match rate applies
only to that finite canonical test subset.

The first natural PICK entry was captured in a matched-runner 768×1080
triplet. Its saved stack value maps to payload offset 203 in an anonymous
366-byte compiled PLL object containing a 362-byte payload; live bytes
`FF 57 27` at the preceding call site match the PLL, and REA confirms the
instruction boundary. A separate 320×480 method census then matched the
complete live payload to `COMMON-GRAPHICS-USER::SELECT-SUBJECT` method
`(EQL PREMIUM)`. This associates that PICK entry's saved return value with the
method's continuation site. A later source-bound triplet captured the actual
pre-call slot value and confirmed a direct CPU destination at `0x20000983`
using an independent DR0 breakpoint. That target is not the named PICK entry;
the anonymous target-to-PICK path remains open. REA's static indirect-call
census still has no resolved targets. This adds no JS contract: counts remain
31 routine names / 32 bounded contracts, 1/5 milestones (20% by count), and
zero whole-painting parity. There is no defensible overall completion
percentage. See the [destination evidence](research/introspection/evidence/premium-callsite-destination-breakpoint-20261014-v1.json)
and [bounded REA analysis](research/introspection/evidence/premium-callsite-destination-window-rea-20261014-v1.json).
See the [caller findings](research/introspection/pick-native-caller.md),
[method identity](research/introspection/select-subject-methods.md), and
[portable evidence](research/introspection/evidence/select-subject-method-identity-20261014-v2.json).
The captured `SELECT-SUBJECT` FREE/PREMIUM methods have now had a first static
REA review: each dossier is straight-line, but its computed call target is
unresolved. A separate natural observer in a fresh 320×480 regime recorded
zero `SELECT-SUBJECT` calls. That is a bounded no-hit, not evidence about
either method's behavior or other canvas regimes.

A controlled source-bound extension then tested explicit two- and four-argument
`PICK` calls: 16 seeds per arity, 32 total rows. For these positive distinct
fixnums, every return and next random value matches selecting an argument with
one `RAN(0,n-1)` draw, and the JS adapter matches all 32 rows. This broadens
only the measured explicit-call envelope; it does not add a new routine name
or contract unit, identify a natural caller for those arities, or characterize
other types and values. See the [detailed PICK checkpoint](research/progress-report.md#2026-10-14-controlled-pick-arity-extension),
[probe](research/introspection/pick-contract-arities-v1.cl), and
[evidence](research/introspection/evidence/pick-contract-arities-seed1234-20261014.json).
Counts remain 31 routine names / 32 bounded contracts, 1/5 milestones, and
zero whole-painting parity.

The JavaScript engine is a useful partial implementation and research harness,
but it is not yet a general reproduction of AARON. The main remaining work is
to recover upstream random and drawing decisions, finish and connect the
freehand/brush/fill/colour/clipping/output path, recover composition and object
generation, and verify complete paintings against fresh original runs.

REA-guided FREE-PATH call-site capture: in one complete source-bound 768×1080
triplet, the native observer hit `FREE-PATH+0x3e4` and `+0x39a`, then the target
exited before `+0x3ac`. Both calls read `0x20000983` from `[EDI+0x27]`; the
same 16-byte preview was observed, but no function name, ABI, same-invocation
relationship, or branch cause was established. The five drawing/scene
artifacts, six staged sources, and before/after planning traces match their
controls. This adds no function/contract count: 31 names / 32 bounded
contracts, 1/5 milestones (20% by count), and zero whole-painting parity.
See [FREE-PATH findings](research/introspection/free-path-native.md#bounded-live-reads-of-indirect-call-sites-2026-10-14)
and [portable evidence](research/introspection/evidence/free-path-callsite-v1-20261014-084337-07112bc0-v2.json).

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
match all six control outputs and seven ordinary Lisp sources. The new
two-/four-argument explicit-call sample broadens PICK's bounded input envelope
without changing counts: 31 routine names / 32 contracts, 1/5 milestones, and
zero whole-painting parity. The v11 single-edge holdout is complete: seed
456069 selected 13 steps; the original consumed 11, returned 14 points, and
left next random 77059. JS returned 15 points and left 62900, so parity fails.
Across ten isolated one-edge cases, JS matches four and differs by one step
in six. This adds no general stop rule or behavior contract. See the
[v11 evidence](research/introspection/evidence/free-path-stop-boundary-20261014-v11-456069.json),
[findings](research/introspection/free-path-native.md#seed-456069-discriminator-v11),
and [candidate search](research/tools/find-free-path-stop-boundary-v11-candidate.mjs).

REA queried all 36 computed indirect calls in the two SELECT-SUBJECT methods;
all remain unresolved statically. A fresh source-bound 768×1080 destination
triplet has now stopped before the PREMIUM method's `CALL [EDI+0x27]`, captured
the pre-call operand `0x20000983`, and observed the same thread hit a separate
DR0 execute breakpoint at that target before its first instruction. ESP fell
by four and `[ESP]` matched the method continuation `callsite+3`. The five
drawing/scene artifacts, six staged sources, planning traces, and runner/runtime
identities match; debug registers were restored and there were no cleanup
errors. The target is not the mapped PICK entry, and REA's bounded static
review created no function or boundary. Next, arm PICK's current entry on that
same thread after the target hit and determine whether the anonymous target
routes there with the original stack. This adds no JavaScript contract or
painting parity. See [destination evidence](research/introspection/evidence/premium-callsite-destination-breakpoint-20261014-v1.json),
[bounded REA evidence](research/introspection/evidence/premium-callsite-destination-window-rea-20261014-v1.json),
[PICK findings](research/introspection/select-subject-methods.md), and the
[tooling workarounds](research/tooling-workarounds.md).

## Follow the evidence

- [Detailed progress report](research/progress-report.md)
- [Active execution plan](research/execution-plan.md)
- [Continuity handoff](research/aaron-continuity.md)
- [FREE-PATH findings](research/introspection/free-path-boundaries.md)
- [FREE-PATH native analysis](research/introspection/free-path-native.md)
- [FREE-PATH caller evidence](research/introspection/evidence/free-path-native-caller-20261014.json)
- [FREE-PATH v8 stop-boundary evidence](research/introspection/evidence/free-path-stop-boundary-20261014-v8.json)
- [FREE-PATH v9 stop-boundary evidence](research/introspection/evidence/free-path-stop-boundary-20261014-v9.json)
- [FREE-PATH v11 stop-boundary evidence](research/introspection/evidence/free-path-stop-boundary-20261014-v11-456069.json)
- [FREE-PATH caller triplet tooling](research/tools/capture-free-path-caller-triplet.ps1)
- [40-case JS comparison evidence](research/introspection/evidence/free-path-boundary-js-comparison-20261013.json)
- [Tooling workarounds](research/tooling-workarounds.md)
