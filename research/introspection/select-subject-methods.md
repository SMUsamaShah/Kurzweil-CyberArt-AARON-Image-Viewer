# SELECT-SUBJECT method identity at the PICK call site, 2026-10-14

## Finding

A read-only runtime census found that `COMMON-GRAPHICS-USER::SELECT-SUBJECT`
is a `STANDARD-GENERIC-FUNCTION` with one argument, `STATUS`, and two methods.
Method 0 has an EQL specializer for `FREE`; method 1 has an EQL specializer
for `PREMIUM`. Both method functions are compiled functions.

The complete native window for method 1 maps to one full 362-byte compiled
object in `AARON.pll`. Its payload SHA-256 is
`80c35cab667f0b8ad615ca03339ad9ada8747a45d4ceb98ce70fa4581a6636ae`, and its
object SHA-256 is
`f161785f4fdf272a7a5c02b35df99b2741b138c64df79fd1e2329fe1ea751034`. Both
hashes equal the anonymous object from the earlier live PICK-entry capture.
The captured return address `0x1fe4c07f` is method 1's payload offset 203;
the call begins at offset 200 (`0x1fe4c07c`). The live bytes `FF 57 27` at that
site match both the mapped payload and the address-translated PLL. This
identifies the direct caller for that captured PICK entry as
`SELECT-SUBJECT`'s `PREMIUM`-specialized method.

REA 6.4.0 / Ghidra 12.1.4 confirms the instruction is
`CALL dword ptr [EDI + 0x27]`, followed by `MOV EDX, EAX`. Its targeted query
still reports a computed call with no resolved target. The caller name is
resolved; that indirect dispatch target is not.

The method census used a complete source-bound 320×480
`writer-stream-seed-1234` before/observer/after triplet. The six compared
drawing and scene outputs and six staged scene sources match byte-for-byte.
The earlier PICK-entry caller capture used a separate source-bound 768×1080
triplet. The cross-run link is the exact full object and payload match at the
same runtime entry and call-site offsets; it is not a same-process stack
snapshot.

## Scope and limits

The probe enumerates CLOS metadata and captures bounded native memory windows;
it does not invoke `SELECT-SUBJECT` or its methods. The identity result names
one direct caller for one captured PICK entry. It does not establish that the
method is the only caller, explain its subject-selection rules, resolve the
`[EDI + 0x27]` target, recover the Lisp ABI, or add a JavaScript behavior
contract. Whole-painting parity remains unmeasured.

The result corrects an earlier dimensional label: the prior PICK caller
triplet's AA0 headers measure 768×1080. The original portable record's run
hashes and bytes were already correct; its `scope` prose said 320×480. The
corrected derivation is
[`pick-native-caller-live-site-20261014-v4.json`](evidence/pick-native-caller-live-site-20261014-v4.json).

## Reproduction

The Lisp probe is
[`select-subject-methods.cl`](select-subject-methods.cl). It only enumerates
the generic's methods and reads each compiled function's 64-byte metadata
header; it never invokes a method. The accepted output requires complete
enumeration, zero errors and truncations, and the `READY`/capture-release/
`COMPLETE`/`END` handshake.

The complete matched-runner triplet is retained beneath the ignored
`research/extracted/local-oracle/external-runs/` root as
`select-subject-methods-20261014-{control-before-v2,observer-v2,control-after-v2}`.
The read-only native helper's manifest and windows are under the observer's
`native-code/` directory. The offline map is
`research/extracted/local-oracle/select-subject-methods-native-map-20261014-v1/`.
The synthetic PE and full REA reports stay under ignored
`research/artifacts/rea-tools/`; the generated PE was analyzed statically and
never executed.

Rebuild the compact record with:

```powershell
node research\tools\derive-select-subject-method-identity-evidence.mjs
```

The checked-in evidence is
[`select-subject-method-identity-20261014-v2.json`](evidence/select-subject-method-identity-20261014-v2.json).
The derivation validates the source-bound controls, CLOS metadata, live native
window hashes, exact complete PLL objects, prior PICK return/call-site record,
REA subject hashes, decoded instruction boundary, and unresolved call query.
