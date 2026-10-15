# AARON reverse-engineering progress

Updated 2026-10-15. This is the compact project snapshot; technical evidence
and the running investigation history are linked below.

Latest AARON investigation: one accepted 1920×1080 source-bound triplet
reached the anonymous PREMIUM destination and stopped immediately before its
`JC rel8 +0x09`. The live CF was 1, so the predicted target was window offset
`+0x99` (`0x2000099c`); the successor instruction was not observed. The same
event captured raw `[EDI+0x35f] = 0x6388bb08`, with target identity unknown.
Fresh uninstrumented before/after controls and all artifacts matched. This
confirms the branch condition at entry for one full-writer seed-456069 scene,
but adds no JS contract or painting parity. See the
[JC finding](research/introspection/premium-internal-transfer-jc-v1.md) and
[portable evidence](research/introspection/evidence/premium-internal-transfer-jc-seed456069-20261015.json).

Earlier PREMIUM transfer result: three accepted 768×1080 source-bound no-TF triplets
across seed-1234 writer-stream and seed-5678 full-writer scenes observed the
anonymous PREMIUM destination's `JMP [ESI+0x12]` reaching the freshly mapped
PICK entry. The first capture also records unchanged ESP and the original outer
call continuation at `[ESP]`; its stale report sentence is corrected in the
[portable evidence](research/introspection/evidence/premium-internal-transfer-triplet-v3-20261015.json)
and [finding](research/introspection/premium-internal-transfer-edge-v1.md).
`CALL [EDI+0x35f]` at anonymous-window offset `+0x17` had zero hits in all
three scenes, including the complete 25.3 MB seed-5678 writer tape. This is a
bounded no-hit, not evidence that the site is unreachable. See the [same-scene
repeat](research/introspection/evidence/premium-internal-transfer-repeat-20261015.json)
and [seed-5678 evidence](research/introspection/evidence/premium-internal-transfer-seed5678-20261015.json).

REA's xrefs query now confirms a static reference from the `+0x90` jump back to
the `+0x17` indirect CALL. In all three accepted captures, the recorded value
for `CMP [EDI-0x65],ESP` predicts `JC +0x99` taken, bypassing that backedge if
the state is stable through the compare. The branch was not observed, and the
captures do not prove a continuous path. See the
[prediction note](research/introspection/premium-loop-backedge-prediction-20261015.md)
and [portable evidence](research/introspection/evidence/premium-loop-backedge-prediction-20261015.json).

A fresh corrected-source rerun reached the same edge but failed the clean
debugger-detach gate with `DebugActiveProcessStop` error 5. It has no accepted
after-control or comparison and is excluded as a replication. The three
accepted triplets remain the evidence; the first capture's 256-byte window
hash differs from the historical reference, although all 11 pinned instruction
spans matched.
The coordinator now stops only the exact source-bound AARON process after this
specific rejected detach so the runner can restore staging without waiting its
full run limit; its no-launch preflight passed, while the recovery branch
remains unexercised because both later accepted runs detached normally. See
[tooling quick fixes](research/tooling-workarounds.md#debugger-detach-failed-after-premium-edge-capture-2026-10-15).

Tooling update: REA/Ghidra decoded calls, branches, and an indirect jump from
the exact rejected AARON window in a synthetic PE; this remains static-only
analysis. Frida Stalker passed both an attach fixture and a suspended-spawn
fixture. The latter verified the 32-bit spawn/attach/resume lifecycle and
10,000 ordered internal call/return pairs across 34 batches. Two source-bound
Frida attach attempts against disposable AARON runs then crashed in the same
`frida-agent.dll` at exception `0xc0000409`, before the script loaded or a hook
armed. Those attempts are diagnostic-only, not caller results. Do not repeat
this agent/runtime combination; continue with REA and the existing no-TF native
breakpoint workflow. Behavior counts and whole-painting parity are unchanged.
See the [REA finding](research/introspection/premium-internal-transfer-window-variant-20261015.md),
[Frida fixture findings](research/tooling/frida-stalker-x86-smoke-20261015.md),
and [AARON attach-crash evidence](research/introspection/evidence/frida-aaron-injection-crash-20261015.json).

| Measure | Current status | What it means |
|---|---:|---|
| Distinct Lisp function binding names inventoried | 1,347 | Includes accessors and UI/host routines; it is not a count of recovered algorithms. |
| Routines with bounded JS/original comparisons | 31 names / 32 contracts | These are limited, measured behavior slices, not 31 complete function reconstructions. |
| PREMIUM indirect CALL destination and internal edge | Three complete 768×1080 source-bound triplets across seed-1234 and seed-5678 scenes captured `[EDI+0x27]=0x20000983`; all recorded a same-thread `JMP [ESI+0x12]` edge to the freshly mapped PICK entry | The outer destination remains anonymous and its Lisp caller is unknown; the captures do not prove a continuous instruction path. `CALL [EDI+0x35f]` at `+0x17` was not hit in any run. Adds no behavior contract. |
| PREMIUM loop-backedge branch | One pre-JC breakpoint in a fresh full-writer seed-456069 scene recorded CF=1 at `0x20000991`; predicted target `0x2000099c` | The branch successor was not observed. Earlier three predictions used outer-destination snapshots; the raw candidate slot remains unidentified. No behavior contract. |
| AARON Frida attach attempts | 2 source-bound attempts crashed in the same `frida-agent.dll` before script load | No hook, scene completion, caller result, or after-control; the no-TF native breakpoint route remains usable. |
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
using an independent DR0 breakpoint. A later complete no-TF capture measured
the anonymous destination's `JMP [ESI+0x12]` source and destination on the same
thread; its destination equals the current uniquely mapped PICK entry, with
unchanged ESP and the same outer continuation at `[ESP]`. Thus a direct CPU
tail-jump edge to PICK is observed in this one call frame. The capture does not
identify the direct Lisp caller or establish every instruction between the
outer destination and the jump. REA's static indirect-call census still has no
resolved targets. This adds no JS contract: counts remain
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
all remain unresolved statically. The accepted source-bound triplet now records
the outer `CALL [EDI+0x27]` at `0x1fe4c07c` targeting anonymous code at
`0x20000983`, followed by a direct `JMP [ESI+0x12]` edge from `0x200009a4` to
the observer's mapped PICK entry at `0x1fe00e8c`. Event order, same-thread
register/stack evidence, the armed but unhit continuation guard, complete
controls, and the 11 matching instruction spans are preserved in the
[portable evidence](research/introspection/evidence/premium-internal-transfer-triplet-v3-20261015.json).
The raw 256-byte window hash differs from its historical reference. A later
corrected-source rerun hit the edge but failed `DebugActiveProcessStop` with
error 5, so it is diagnostic-only and did not produce an after-control. The
newly documented cleanup stops only that exact owned process after this
rejection. No direct Lisp caller, continuous instruction path, JS behavior
contract, or painting parity is established. See the [finding](research/introspection/premium-internal-transfer-edge-v1.md)
and [execution plan](research/execution-plan.md) for the next tracing target.

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
