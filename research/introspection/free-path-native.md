# FREE-PATH native payload and REA findings

Updated 2026-10-14. REA 6.4.0 helped map the compiled `FREE-PATH` body and
identify its loop and static exit gates. Its computed calls remain unresolved,
so these findings do not recover Lisp source, a Lisp ABI, or the stop rule.

## Source-bound live payload

The read-only probe
[`free-path-native-links.cl`](free-path-native-links.cl) reported the live
compiled-function header during a post-MAIN pause. A matching fresh
`writer-stream-seed-1234` triplet was verified with
[`verify-local-aaron-triplet.mjs`](../tools/verify-local-aaron-triplet.mjs):

| Run | ID | AA0 SHA-256 |
| --- | --- | --- |
| Uninstrumented before | `freepath-rea-native-control-before-20261013-p` | `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1` |
| Observer | `freepath-rea-native-observer-20261013-q` | `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1` |
| Uninstrumented after | `freepath-rea-native-control-after-20261013-r` | `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1` |

The observer source hash is
`1885ec5bd428565e0accba79bf7134714c246b1aff53fd42e6ff8c7ee2fc075f`; its
455-byte report hash is
`a54c5884bc783dd6138388e9670cd7a0e766325d99e189563c753f0d7c94c62d`. The
report had one compiled-function header, zero errors and zero truncations, and
ended with `END free-path-native-links`. All six drawing/scene outputs and all
six ordinary staged Lisp sources match across the triplet. The AA0 header
measured 320×480; this is a separate canvas regime from the 768×1080 boundary
triplet.

The live entry `0x1fdfd684` and its bounded code window matched one complete
object in the 4,573,464-byte `AARON.pll` (SHA-256
`7ffc7dc9e3e62b1c5ba3612630b8747778324fa674dac42916be3e90bb96504c`). The
unique object begins at PLL offset 2,479,744, has 1,334 bytes, and SHA-256
`87c8ad155c6fd6a1452a286b9f62c486f3606fff0627104e90eb0899a5f18d9a`. Its
1,330-byte code payload begins at offset 2,479,748 and ends at 2,481,078
(exclusive); payload SHA-256 is
`93b018cb03d3d8cec18eaaa4cd813d7c4cdfa32bb02b5f3a5b11a4b51feea787`.

## REA static analysis

The exact payload was copied into an analyst-generated x86 PE container and
queried with REA 6.4.0 / Ghidra 12.1.4. The container SHA-256 is
`70f11471b178d1526a74348b158ab68f8a4657ac2a4997bf84eb4dc783f42cf7`; the
`function` report SHA-256 is
`13b674df2b066913d8cb64cbc21c7c27e100aa24db12a5624b8557a842a2dd99`. REA
recorded `staticOnly=true` and `inputWasExecuted=false`. The 1,322-byte
contiguous Ghidra body (`0x1fdfd684–0x1fdfdbad`) contains 456 instruction
records, 91 basic blocks and 622 high-p-code operations. The isolated report
has zero resolved callers and zero resolved callees.

The static loop at `0x1fdfda09` has two tag-aware exit gates. One computed call
at `0x1fdfda1e` feeds a comparison that can exit at `0x1fdfda84`. A second
comparison checks an incrementing tagged counter against a value derived by
subtracting tagged 4; the loop increments the counter and adds an accumulator
before returning to `0x1fdfda09`. This is compatible with accumulated progress
plus a count bound, but local variable names and inferred C expressions do not
identify their Lisp values or units. An explicit REA
`resolve-native-call-targets` query at `0x1fdfda1e` returned
`status=unresolved`, `mechanism=computed`, and no targets; its report SHA-256 is
`4906d47d7e35d8f5fb709286e06b721d96fdffcee54a9a55d8c195c11747a04a`.
No static instruction in this isolated payload names a Lisp helper or
establishes a direct caller.

The input PE wrapper, its headers, static entry address, and seeded function
name are analyst assertions. The generated PE must never be executed. REA's
decompiler output is useful for choosing bounded experiments; it is not
original source or a recovered ABI.

## Completed discriminator (seed 521814)

For the existing three one-edge cases, the selected-step sum and distance from
the source to an emitted point make different predictions, but neither is a
general rule. REA did not resolve the relevant indirect calls. The local seed
replay selected 14 steps for seed 521814 and predicts:

| Candidate | Predicted stop |
| --- | ---: |
| Terminal distance at most the bare wiggle value | 12 |
| Step-sum threshold | 13 |
| Distance from source to emitted point | 13 |
| Terminal distance at most step × wiggle | 14 (selected-step cap) |

These are local arithmetic candidates, not observed behavior. Two earlier
observer attempts produced no case before the 150-second runner limit. The
first installed a MAIN-return wrapper; the second installed a
SCREEN-AND-STORE-return wrapper. Neither report included a wrapper-entry
marker, so neither establishes that its target was entered, returned, or caused
the timeout. Both roots and exact sources remain diagnostic records:
[`free-path-stop-boundary-v3-main-return-timeout.cl`](free-path-stop-boundary-v3-main-return-timeout.cl)
and
[`free-path-stop-boundary-v3-screen-return-timeout.cl`](free-path-stop-boundary-v3-screen-return-timeout.cl).

The current v4 probe installs an optional callback before the writer trace is
loaded and enables the trace's existing `PREP-LINE` / `STORE-IN-FILE` targets.
It invokes the controlled case once at the first successful traced
`STORE-IN-FILE` exit, at whatever depth that event has. This is a controlled
case location, not a natural FREE-PATH caller observation. The callback and
one-shot flag stay installed until the disposable oracle process exits; only
the temporary `RAN` and `XYDIST` wrappers are explicitly restored.

The source-bound v4 probe and evidence builder completed a fresh
before/observer/after triplet:
`freepath-v4-before-9a4bfbae`, `freepath-v4-observer-bf8d4993`, and
`freepath-v4-after-c69cf895`. Each run completed in
`writer-stream-seed-1234`; their AA0 headers all measured 320×480. The AA0,
image, image ID, scene snapshot, random-seed record, and six ordinary staged
Lisp sources match between the observer and both controls. The before/after
planning traces also match. The observer planning trace has a separate hash
because it includes the requested PREP-LINE / STORE-IN-FILE diagnostic
wrappers; the evidence builder records that observer-only diagnostic
explicitly instead of treating it as a drawing mismatch. The source-bound
probe hash is `c4373b4748566cc9e6c3b34b2a5d66e42edd272147122d6b2bf7b3faf48e6a0e`,
and the report hash is
`251b2ccefc335271f76c3d804e09978589b4b3bd63ea80fd4f7ff49b4e397af2`.

The callback fired at the first successful traced `STORE-IN-FILE` exit at
depth 7. In this one-edge case the original selected 14 steps, consumed 12,
returned 15 points, and left the next random value at 82821. JavaScript
consumed 13 steps and returned 16 points; its next random value was 92793.
The local terminal-distance-at-most-bare-wiggle model predicts 12 steps here,
while the step-sum and source-to-emitted-point models predict 13. The original
matches the bare-wiggle prediction for this case only. This is not a general
stop rule or a natural-caller observation, and the JS mismatch remains open.

Portable evidence is
[`free-path-stop-boundary-20261013-v4.json`](evidence/free-path-stop-boundary-20261013-v4.json)
(SHA-256
`e30c152b9f7361ad16a057e2b57f33099a3629a7447f9b7bd32b01a0e1d97422`). The
probe [`free-path-stop-boundary-v4.cl`](free-path-stop-boundary-v4.cl) uses an
optional post-event hook in `planning-call-trace.cl`; the parser rejects a
missing trigger, incomplete case, error status, or nonterminal END marker. The
serial capture helper is
[`capture-free-path-stop-boundary-v4.ps1`](../tools/capture-free-path-stop-boundary-v4.ps1).

## Seed 332156 holdout

The v5 source-bound 320×480 triplet used the same controlled
`STORE-IN-FILE` exit trigger and the one visible edge `((0 0 0) (10 0 1))`.
The observer and both fresh controls match on the five drawing/scene outputs
and six ordinary staged Lisp sources. The observer's planning trace is kept
separate because it includes the additional trace targets; the two bracketing
planning traces match.

For seed 332156, the original selected and consumed all 9 steps, returned 12
points, and left next random value 43251. JavaScript matches all 28 random
calls, returned points, and the next random checkpoint. The local replay
predicts 8 steps for both terminal-distance candidates (bare wiggle and step
× wiggle), while step-sum and source-to-emitted-point reach 9 only at the
selected-step cap. This case is therefore cap-censored for the latter two
models and rejects the two early terminal predictions for this input; it does
not recover the general stop rule.

Across the five isolated one-edge cases, JavaScript matches two and differs
by one iteration in three. The v4 seed 521814 sample favors the bare-wiggle
count locally, but v5 does not repeat that prediction. A scan of two million
seeds at length 10 found no uncapped case where bare-wiggle and step × wiggle
predict different stopping points. Further work should vary the controlled
edge length, then retain a fresh source-bound before/observer/after triplet.

Portable evidence is
[`free-path-stop-boundary-20261013-v5.json`](evidence/free-path-stop-boundary-20261013-v5.json)
(SHA-256
`a44343a418b7825089a07f1588e4a33fcc9b98d7525b3f5beec74e93ec0ce5eb`). The
source is
[`free-path-stop-boundary-v5.cl`](free-path-stop-boundary-v5.cl), and the
serial capture helper is
[`capture-free-path-stop-boundary-v5.ps1`](../tools/capture-free-path-stop-boundary-v5.ps1).

## Seed 79481 length-2 candidate

The v6 source-bound 320×480 triplet used the same first successful traced
`STORE-IN-FILE` exit and a single visible forward edge `((0 0 0) (2 0 1))`.
All five drawing/scene outputs and six ordinary staged Lisp sources match
between the observer and fresh controls. The bracketing planning traces match;
the observer-only trace has a separate diagnostic hash. The required report is
complete, has no errors, records one call at depth 7, and confirms that the
wrapped `RAN` and `XYDIST` functions were restored. The evidence builder
rederived byte-identically; portable JSON SHA-256 is
`2f71e5befcfd3d6de87de8164c048f9e20f71d224845f709e765664eed12e6b1`.

For seed 79481, the original selected 13 steps, consumed 11, returned 14
points, and left next random value 53424. JavaScript matches all 34 random
calls, all returned points, and the next random checkpoint. The local replay
predicts 11 steps for step-sum, bare-wiggle, and step-times-wiggle, and 12 for
source-to-emitted-point distance. This sample agrees with the first three
predictions and rejects the last for this input only; it does not establish a
general stopping rule.

The reusable local candidate search is
[`find-free-path-stop-model-seeds.mjs`](../tools/find-free-path-stop-model-seeds.mjs).
Its default scan covers seeds 1–200,000 at lengths 2, 5, 10, 20, and 40; it
found no case with four distinct uncapped predictions. This is only a bounded
search over local hypotheses. Reproduce it with:

```powershell
node research/tools/find-free-path-stop-model-seeds.mjs `
  --seed-start 1 --seed-end 200000 --lengths 2,5,10,20,40
```

Portable evidence is
[`free-path-stop-boundary-20261013-v6.json`](evidence/free-path-stop-boundary-20261013-v6.json).
The source is
[`free-path-stop-boundary-v6.cl`](free-path-stop-boundary-v6.cl), the serial
capture helper is
[`capture-free-path-stop-boundary-v6.ps1`](../tools/capture-free-path-stop-boundary-v6.ps1),
and the strict derivation tool is
[`derive-free-path-stop-boundary-v6-evidence.mjs`](../tools/derive-free-path-stop-boundary-v6-evidence.mjs).

## Seed 388 single-float length-0.2 candidate

The v7 source-bound triplet used the same first successful traced
`STORE-IN-FILE` exit and a single visible edge `((0 0 0) (0.2f0 0 1))`.
The observer and fresh controls match on all five drawing/scene outputs and
six ordinary staged Lisp sources. The AA0 header measures 768×1080. The
bracketing planning traces match; the observer-only planning trace differs
because its extra trace targets are diagnostic. The required report has a
terminal `END`, zero errors, one case at the traced exit (depth 7), and
confirms that `RAN` and `XYDIST` were restored. The input points have types
`((FIXNUM FIXNUM FIXNUM) (SINGLE-FLOAT FIXNUM FIXNUM))`, and the edge distance
is `SINGLE-FLOAT`. Portable evidence SHA-256 is
`6e24501b60fc0d4014a12bf71c2878c32ce658f6aa9ef07e60bb90edb3d101b1`; the
checked probe SHA-256 is
`1ff3f9f57df69fd1c7a9a7aa505436f3c5a7ec7c71847ca6298b80149e217c4b`.

For seed 388, the original selected 9 steps and consumed 8, returned 11
points, and left next random value 15573. The single-precision JavaScript
replay matches all 25 random calls, every returned point, and that next RNG
checkpoint. Step-sum, source-to-emitted-point, and step-times-wiggle models
predict 8; bare-wiggle predicts 7. This sample rejects bare-wiggle for this
input only and does not choose among the other three models or establish a
general stop rule. It remains a controlled call, not a natural caller
observation.

The portable record is
[`free-path-stop-boundary-20261013-v7.json`](evidence/free-path-stop-boundary-20261013-v7.json).
Its source is [`free-path-stop-boundary-v7.cl`](free-path-stop-boundary-v7.cl),
the serial capture helper is
[`capture-free-path-stop-boundary-v7.ps1`](../tools/capture-free-path-stop-boundary-v7.ps1),
and the strict derivation tool is
[`derive-free-path-stop-boundary-v7-evidence.mjs`](../tools/derive-free-path-stop-boundary-v7-evidence.mjs).

## Bounded natural caller, 2026-10-14

A fresh 320×480 `writer-stream-seed-1234` before/observer/after capture
observed the first `FREE-PATH` native entry. The observer-only trace explicitly
left `FREE-PATH` unwrapped. The caller helper validated fresh live bytes for
both `FREE-PATH` and `DRAW-CFORM` against their unique complete PLL objects;
the two payloads were 1,330 and 2,958 bytes respectively. The hardware
breakpoint fired at the FREE-PATH entry and captured return address
`0x1fe28e4b`, uniquely within DRAW-CFORM at relative offset `0x167` (359).

Ghidra maps the instruction immediately before that return address to
`CALL EDI` (`FF D7`) at DRAW-CFORM+`0x165`. This is a computed call whose runtime
target is not resolved by this static instruction. The stack observation
establishes DRAW-CFORM as the immediate caller for this first FREE-PATH entry
in this scene, while leaving later callers and the general call graph open.
The call report does not recover Lisp source or ABI and says nothing about
whole-painting parity.

The five required output artifacts and six staged scene sources match across
the bracketed runs. Before and after planning traces match; the observer trace
is separate because it records the unwrapped target. See the
[portable evidence](evidence/free-path-native-caller-20261014.json) and
[capture workflow](../native-analysis-workflow.md#free-path-bounded-natural-caller-2026-10-14).
The portable JSON SHA-256 is
`6cdad66881d1e1dda9c365dffe787ce2b3510b66ec4468a2d95426ac1fc41608`; its
reusable [evidence deriver](../tools/derive-free-path-native-caller-evidence.mjs)
has SHA-256
`541721aa08b5f7410ede707d506d5eda45dcda0a298784311e2e8a905d0c5ad1`.
The record binds the exact archived READY-prefix hash
`445dbf362761bc5252f2720f18e7a3cd56c286891830829f6075d0fe0cdfbeaa` to the
capture helper report.

## Current REA/Ghidra call-site map

REA 6.4.0 / Ghidra 12.1.4 was rerun over the exact live-validated FREE-PATH
and DRAW-CFORM payloads. The current FREE-PATH payload hash is
`93b018cb03d3d8cec18eaaa4cd813d7c4cdfa32bb02b5f3a5b11a4b51feea787`; its
456 decoded instruction rows match the mapped bytes. The current DRAW-CFORM
payload hash is
`d8e62d4d54d91ea4cac036e7e3a310815ff3a88f0b3c0d1037778dd21e35e558`; all
963 decoded rows also match. The generated PE containers were used only for
static analysis and were never executed.

The live return address maps to `DRAW-CFORM+0x167`. At `+0x165`, the exact
instruction is `CALL EDI` (`FF D7`) with fall-through at `+0x167`. Its REA
call-target query remains `unresolved`, mechanism `computed`, with no targets;
query JSON SHA-256 is
`9b992108600bad7d08521b32f6414f681497f20f11c3243a411551e2ce1427f4`.
The byte-checked Ghidra report SHA-256 for DRAW-CFORM is
`3a514e7f1e8688553c5d0c56bd8680ad8cdfec7467502b48dab08ea529ae481c`.
This correlates the one observed return with its native dispatch instruction;
it does not identify EDI's Lisp target.

For the unresolved FREE-PATH stop boundary, the current REA report places a
computed call at `FREE-PATH+0x39a` (`CALL dword ptr [EDI + 0x27]`). Its result
flows through a low-tag-bit test and a comparison branch at `+0x3ac`; a second
computed call at `+0x3e4` is followed by the loop back-edge. The return value,
counter and accumulator have no recovered Lisp meanings. Use these offsets to
focus the next controlled observation, not as evidence for a stop formula.
The byte-checked FREE-PATH Ghidra report SHA-256 is
`1a6d055f7a56971852ff5309eac932656d7f0232233e5f5a2c94ed2d1b6b62da`.

## Bounded live reads of indirect call sites, 2026-10-14

REA/Ghidra identified the three instruction addresses to observe in
`FREE-PATH`: computed `CALL [EDI+0x27]` at `+0x39a`, `JG` at `+0x3ac`, and
another computed `CALL [EDI+0x27]` at `+0x3e4`. A fresh 768×1080
`writer-stream-seed-1234` triplet captured the first hit at each selected
address. All three runner summaries and the observer's `INSTALL`, `READY`,
`COMPLETE`, and `END` records validate. Five drawing/scene artifacts and six
staged sources match across the triplet; the before/after planning traces also
match byte-for-byte.

The observer reached `+0x3e4` first, then `+0x39a`; it did not reach
`+0x3ac` before the target exited. At both call sites, EDI was `0x20000985`,
the slot address `[EDI+0x27]` was `0x200009ac`, and the raw four-byte slot
value was `0x20000983`. A read-only 16-byte preview at that value was
`b10283e17f8b7315894df039679b7209` at both sites. The exact preview sequence
does not occur in the archived `AARON.pll`. This does not identify its memory
region, function, or ABI, so the value remains an unresolved runtime target.

REA's complete value trace has 623 nodes and 552 edges. It shows the
`+0x39a` indirect-call result flowing through EAX into the comparison and
branch at `+0x3ac`; the later `+0x3e4` call has no modeled output, and the
computed targets remain unresolved. The live helper captured only the first
hit at each address and did not single-step the branch. The observed
`+0x3e4` then `+0x39a` order does not prove that those events belong to one
FREE-PATH invocation or that either hit was caused by the branch.

The capture is bounded call-site evidence, not a recovered helper name,
general FREE-PATH call graph, stop rule, new JS contract, or painting parity.
The [portable evidence](evidence/free-path-callsite-v1-20261014-084337-07112bc0-v2.json)
has SHA-256
`3d04dcd361fd6473a5fdd9c5722c0faa49dbf702550593a2f958357b1c51faa5`.
Its [capture workflow](../native-analysis-workflow.md#free-path-indirect-call-site-capture-2026-10-14)
and [triplet/parser workarounds](../tooling-workarounds.md#free-path-triplet-archival-and-json-evidence)
preserve the exact setup and current limitations.

## Vertical single-float discriminator, v8

The v8 source-bound `writer-stream-seed-1234` triplet measured 320×480.
Before, observer, and after summaries are complete; their runner, installer,
registry-patch, and license-patch hashes agree. The archived observer source
matches the checked-in probe. Its report has the required ordered `INSTALL`,
`READY`, successful hook, `COMPLETE`, and terminal `END` records. All five
drawing/scene outputs and six ordinary staged Lisp sources match across the
triplet. The observer planning trace is intentionally diagnostic because its
two extra targets differ from the uninstrumented controls.

At the first traced `STORE-IN-FILE` exit (depth 7), the probe invoked one
controlled forward edge `((0 0 0) (0 0.2f0 1))` with seed 150415. The point
types are `((FIXNUM FIXNUM FIXNUM) (FIXNUM SINGLE-FLOAT FIXNUM))`, and the
captured `XYDIST` result is a `SINGLE-FLOAT`. The original selected 14 steps
and consumed 12, returned 15 points, made 37 `RAN` calls, and left next random
value 88798. A local Float32 replay predicts 13 steps for step-sum, 13 for
source-to-emitted-point, and 12 for step-times-wiggle. The original result
agrees with the last candidate and disagrees with the first two on this input
only.

The current single-precision JS implementation consumes 13 steps, returns 16
points, makes 40 `RAN` calls, and leaves next random value 46177. It fails
bounded parity for this sample. The probe confirms only that the input point
values remain equal at single-precision comparison; it does not check Lisp
object identity or list shape. Across eight isolated one-edge cases, JS matches
four and differs by one step in four. These finite results do not recover a
general stop rule or add a new function contract.

Portable evidence is
[`free-path-stop-boundary-20261014-v8.json`](evidence/free-path-stop-boundary-20261014-v8.json),
SHA-256 `abac512f24af2ebfcf1d03f67f1c2fb41566da84b19868115deaa46b49d4e67b`.
The checked-in probe SHA-256 is
`ef6e076cfc0b5a0b6490e61a104fae63c00c804790f4964f120be71f57acbe3f`; the
serial capture helper is
[`capture-free-path-stop-boundary-v8.ps1`](../tools/capture-free-path-stop-boundary-v8.ps1),
and the strict evidence deriver is
[`derive-free-path-stop-boundary-v8-evidence.mjs`](../tools/derive-free-path-stop-boundary-v8-evidence.mjs).

The next seed-46380 case is now measured in v9 below.

## Seed-46380 discriminator, v9

The next fresh `writer-stream-seed-1234` before/observer/after triplet ran at
768×1080. All summaries are complete and serial, with matching runner,
installer, registry-patch, license-patch, and `smallImage=false` settings.
The archived probe matches the checked-in source and has ordered install,
ready, hook, complete, and end records. Five drawing/scene outputs and six
ordinary staged Lisp sources match. As in v8, only the observer planning
trace differs, because it includes diagnostic targets.

At the first traced `STORE-IN-FILE` exit (depth 7), the probe ran one controlled
edge `((0 0 0) (0 0.2f0 1))` at seed 46380 with point types
`((FIXNUM FIXNUM FIXNUM) (FIXNUM SINGLE-FLOAT FIXNUM))` and a `SINGLE-FLOAT`
`XYDIST` result. The original selected 14 steps and consumed 12, returned 15
points, made 37 `RAN` calls, and left next random value 74663. Local Float32
replay predicts 13 for step-sum, 12 for source-to-emitted-point, and 12 for
step-times-wiggle. This case rejects step-sum among those candidates but
cannot distinguish the other two.

JavaScript consumes 13 steps, returns 16 points, makes 40 calls, and leaves
next random value 46118, so bounded parity fails. The probe checks input values
at single-precision comparison only; point identity and list structure remain
unobserved. Paired with v8, the original consumed 12 of 14 selected steps in
both cases. The three local candidate signatures are step-sum 13/13,
source-to-emitted 13/12, and step-times-wiggle 12/12. Thus only the last is
consistent with both observations. These local formulas do not expose the
original internal variables, and the two samples—captured at different scene
sizes—do not establish a general stop rule.

Across nine isolated one-edge cases, JS matches four and differs by one step
in five. The separate 40-case canonical subset remains 26/30 matches, four
mismatches, and ten unclassified. No new behavior contract or milestone is
claimed. Portable evidence SHA-256 is
`41d2906cb7bd955b20a4f40617b5a3a78abf460cff87d1b2c51481c6aa5c7886`.
See [`free-path-stop-boundary-20261014-v9.json`](evidence/free-path-stop-boundary-20261014-v9.json),
the [probe](free-path-stop-boundary-v9.cl), [serial capture helper](../tools/capture-free-path-stop-boundary-v9.ps1),
and [strict evidence deriver](../tools/derive-free-path-stop-boundary-v9-evidence.mjs).

## Seed-456069 discriminator, v11

A fresh source-bound `writer-stream-seed-1234` triplet measured a vertical
0.2 `SINGLE-FLOAT` edge at 320×480. The probe ran at the first successful
`STORE-IN-FILE` exit (depth 7) and recorded selected steps 13, original
consumption 11, 14 returned points, 34 `RAN` calls, and next random value
77059. The checked-in probe and complete observer report hashes match the
triplet. All five drawing/scene outputs and six ordinary staged sources
match across the controls; the observer-only planning trace is diagnostic.

Local single-float replay predicts 12 steps for step-sum, 12 for
source-to-emitted-point, and 11 for step-times-wiggle. The minimum boundary
margin exceeds one million Float32 ULPs. JavaScript makes 37 random calls,
returns 15 points, and leaves next random value 62900, so this case does not
match. The implied 12 JavaScript loop iterations are derived from its random
call count and implementation structure; there is no named JavaScript
consumed-step field in the evidence.

With v8 and v9, step-times-wiggle is the only local replay candidate matching
all three original counts. This supports only a bounded candidate comparison:
the original internal progress variable is unobserved, and these samples do
not establish a general stop rule, native ABI, or painting parity. Across ten
isolated one-edge cases, JS matches four and differs by one step in six. The
separate 40-case canonical matrix remains 26/30 matches, four mismatches,
and ten unclassified. No new routine, contract, or milestone is claimed.
Portable evidence SHA-256 is
`0b9e5f6638881d371341fae7dd6cd451949c9d08f5cf35cb41f2a03baf90e422`.
See the [evidence](evidence/free-path-stop-boundary-20261014-v11-456069.json),
[probe](free-path-stop-boundary-v11.cl), [serial capture helper](../tools/capture-free-path-stop-boundary-v11.ps1),
[strict deriver](../tools/derive-free-path-stop-boundary-v11-evidence.mjs), and
[seed candidate search](../tools/find-free-path-stop-boundary-v11-candidate.mjs).

## Reproduction

Read [`oracle.md`](../oracle.md#ctemp-staging-and-permissions) first. The
successful live capture used the custom one-header metadata probe, a positive
pre-scene pause, and the ordinary exact PLL mapper. The static artifacts and
full REA JSON remain in ignored run/tool directories; this page preserves the
source and content hashes needed to identify them. The retained native map is
`research/extracted/local-oracle/external-runs/freepath-rea-native-observer-20261013-q/native-code/mapped/native-code-map.json`.

Build a new exact-payload container and run a new static query only into fresh
ignored directories:

```powershell
node research/tools/prepare-rea-payload-pe.mjs `
  --map research/extracted/local-oracle/external-runs/freepath-rea-native-observer-20261013-q/native-code/mapped/native-code-map.json `
  --function FREE-PATH `
  --pll research/extracted/aaron/application/AARON.pll `
  --output-dir research/artifacts/rea-tools/free-path-native-new

research/tools/invoke-rea-ghidra-query.ps1 `
  -Operation function `
  -InputPePath research/artifacts/rea-tools/free-path-native-new/free-path.synthetic.exe `
  -Address 0x1fdfd684 `
  -SeedFile research/artifacts/rea-tools/free-path-native-new/free-path.seeds.tsv `
  -OutputRoot research/artifacts/rea-tools/free-path-native-report-new
```

For native mapping, rediscover the live function address and exact code window
in the current process before any debugger attachment. An archived address is
not reusable as a live address.
