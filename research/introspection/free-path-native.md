# FREE-PATH native payload and REA findings

Updated 2026-10-13. REA 6.4.0 helped map the compiled `FREE-PATH` body and
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
