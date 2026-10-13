# IN-SUB-FRAME: static dossier and natural capture anchor

Updated 2026-10-13. This note combines the REA/Ghidra static dossier for the
mapped `IN-SUB-FRAME` payload, a natural VALUE=0 anchor, and a bounded
seed-1234 false-result census. Static and dynamic evidence are linked in the
[REA/VALUE=0 evidence](evidence/rea-in-sub-frame-20261012.json) and the
[call-window evidence](evidence/in-sub-frame-initial-window-v2-20261013.json).

## Static result

REA 6.4.0 with Ghidra 12.1.4 analyzed a synthetic x86 Windows PE that contains
the exact 278-byte payload uniquely mapped from the archived AARON PLL. Its
seeded entry is `0x1fe0ea2c`; the inferred function body is 270 bytes. The
synthetic PE is an analyst-built static container and was not executed.

| REA observation | Result |
|---|---:|
| Basic blocks / successor edges | 24 / 38 |
| Instructions | 93 |
| P-code operations / def-use edges | 109 / 95 |
| Indirect memory-call sites | 11 |
| Resolved callers / callees | 0 / 0 |

Several paths use signed comparisons against two values obtained through
unresolved indirect calls. This is consistent with an inclusive two-coordinate
rectangle gate. The native dossier does not establish the arguments' meanings
or order, the bound getters' identities, the result convention, a Lisp caller,
or the native Lisp ABI. Ghidra's inferred signature is not a recovered
interface.

## Natural VALUE=0 anchor

The source-bound v6 capture records stroke 47: VALUE=0, `ALL-BRUSHES` index 4,
width 13, and a 29-point path. All 2,813 recorded `IN-SUB-FRAME` calls return
true. The capture also records 38 map cells changing from 1 to 0 after the
screen call. Because this sample has no rejected predicate calls, it does not
measure the rejection boundary or prove that `IN-SUB-FRAME` distinguishes a
zero-valued stroke.

The portable report binds the exact PLL mapping, synthetic PE, REA report,
v6 observer, tape and every transitive source in the v6 manifest. Its deriver
compares each ordered tape row's event ID, stroke/sample identity, integer
arguments, and `T`/`NIL` result against the structured v6 record. Two fresh
derivations matched byte-for-byte: 11,929 bytes, SHA-256
`97e9459fe3f1cdaef648d5d77ef818b027b08bfb9c12d9884a7f10e9b43e0abf`, with 20
unique source rows.

## Seeded natural false-result census

The v2 observer completed its first 1,400 `IN-SUB-FRAME` calls in one
seed-1234 scene: **1,176 truthy and 224 NIL**, with 128 false-call rows
retained and the remaining 96 omitted by the declared sample cap. It reported
zero errors or aborts and restored both function bindings. The complete raw
report is preserved in
[`in-sub-frame-initial-window-v2-20261013.txt`](evidence/in-sub-frame-initial-window-v2-20261013.txt).
The offline derivation validates the report, source/runtime hashes, and five
saved runner summaries, then compares the observer against no-wrapper
composite-loader controls before and after it.

All three composite-loader runs have identical hashes for AA0, the image,
image ID, final scene snapshot, planning-call trace, and loaded-seed record.
Their AA0 header is 768×1080. Fresh direct-mode controls before and after
match each other at 320×480, so the optional pre-scene loader path changes the
observed setup. Keep the two regimes separate; the census applies only to the
matched 768×1080 composite-loader regime.

The observer does synchronous reporting during the call window. Matching
scene/drawing artifacts support this capture's bounded result, but do not
prove general observer transparency or complete RNG purity. Auxiliary random
logs contain `CURRENT-DAY-TIME` strings and are not treated as deterministic
parity evidence. This census does not implement the JavaScript predicate,
identify the direct caller, establish the rectangle bounds, or recover general
behavior. The REA payload still has 11 unresolved indirect calls and no
resolved caller/callee references.

## Next measurement

Use the retained false rows to compare the observed integer argument pairs
with contemporaneous frame bounds, while keeping only hypotheses labeled as
such. Then use the native-analysis workflow to capture a stack-aware natural
caller trace if the argument meaning or call path remains unresolved. A
JavaScript implementation needs a bounded contract comparison and fresh
controls; the current observation alone is not parity.
