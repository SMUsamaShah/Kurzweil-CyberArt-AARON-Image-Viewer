# SELECT-SUBJECT method identity and PICK-entry continuation association, 2026-10-14

## Finding

A read-only runtime census found that `COMMON-GRAPHICS-USER::SELECT-SUBJECT`
is a `STANDARD-GENERIC-FUNCTION` with one argument, `STATUS`, and two methods.
Method 0 has an EQL specializer for `FREE`; method 1 has an EQL specializer
for `PREMIUM`. Both method functions are compiled functions.

The complete native window for method 1 maps to a 362-byte compiled-function
payload inside a 366-byte object in `AARON.pll`. Its payload SHA-256 is
`80c35cab667f0b8ad615ca03339ad9ada8747a45d4ceb98ce70fa4581a6636ae`, and its
object SHA-256 is
`f161785f4fdf272a7a5c02b35df99b2741b138c64df79fd1e2329fe1ea751034`. Both
hashes equal the anonymous object from the earlier live PICK-entry capture.
The saved stack value `0x1fe4c07f` at PICK entry is method 1's payload offset
203; the preceding callsite is at offset 200 (`0x1fe4c07c`). The live bytes
`FF 57 27` at that site match both the mapped payload and the
address-translated PLL. This associates the saved PICK-entry value with
`SELECT-SUBJECT`'s `PREMIUM`-specialized method continuation site. It does
not prove that the CALL's CPU destination was PICK.

REA 6.4.0 / Ghidra 12.1.4 confirms the instruction is
`CALL dword ptr [EDI + 0x27]`, followed by `MOV EDX, EAX`. Its targeted query
still reports a computed call with no resolved target. The method containing
the matched continuation is identified; the CPU destination of the indirect
call is not.

The method census used a complete source-bound 320×480
`writer-stream-seed-1234` before/observer/after triplet. The six compared
drawing and scene outputs and six staged scene sources match byte-for-byte.
The earlier PICK-entry return-site capture used a separate source-bound 768×1080
triplet. The cross-run link is the exact full object and payload match at the
same runtime entry and call-site offsets; it is not a same-process stack
snapshot.

## Scope and limits

The probe enumerates CLOS metadata and captures bounded native memory windows;
it does not invoke `SELECT-SUBJECT` or its methods. The result identifies the
method containing the continuation matching the saved stack value at one PICK
entry. It does not establish a direct CPU edge, that the method is the only
caller, explain its subject-selection rules, resolve the `[EDI + 0x27]`
target, recover the Lisp ABI, or add a JavaScript behavior contract.
Whole-painting parity remains unmeasured.

The result corrects an earlier dimensional label: the prior PICK-entry saved-stack-value
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
node research\tools\derive-select-subject-method-identity-evidence.mjs --overwrite
```

The checked-in evidence is
[`select-subject-method-identity-20261014-v2.json`](evidence/select-subject-method-identity-20261014-v2.json).
The derivation validates the source-bound controls, CLOS metadata, live native
window hashes, exact complete PLL objects, prior PICK-entry saved-stack-value
and return-site record,
REA subject hashes, decoded instruction boundary, and unresolved call query.

## REA call-target census, 2026-10-14

REA 6.4.0 / Ghidra 12.1.4 was then queried at every CALL instruction in both
method dossiers: 17 sites in the FREE-specialized 312-byte payload and 19 in
the PREMIUM-specialized 362-byte payload. The 36 query reports are bound to
the exact method-specific synthetic PE and seed, and each report's raw and
normalized results agree. Every query reports `status=unresolved`,
`mechanism=computed`, and an empty target list. The generated PEs were used for
static analysis only and were never executed.

This means the static provider did not recover the dynamic dispatch targets;
it does not mean the calls have no target at runtime. Nor does the census
identify the Lisp functions or calling convention behind those indirect calls.
The PREMIUM method callsite whose continuation matches PICK's saved entry
stack value is one bounded runtime association; it does not prove the CALL
target or a direct CPU edge and is not a general caller graph.

REA's PREMIUM payload listing shows this local setup around the measured
callsite (payload offsets are decimal):

```text
191  MOV EAX, [ESI + 0x62]
194  MOV EDX, [ESI + 0x66]
197  MOV EBX, [ESI + 0x6a]
200  CALL dword ptr [EDI + 0x27]
203  MOV EDX, EAX
```

An earlier computed call at offset 185 is followed by a store to `[EBP-0x24]`.
After the measured call, the code loads `[ESI+0x6e]`, sets `ECX=2`, then calls
`[EDI+0x2f]`. This is instruction-level register/data flow only: it does not
name the slots or object behind ESI/EDI, establish an ABI or argument list, or
resolve either computed callee. For the next live capture, record ESI, EDI,
EAX, EDX, EBX, and ECX before the call, plus the call's actual slot dword.

Rebuild and validate the complete census with:

```powershell
node research\tools\derive-select-subject-call-census-evidence.mjs
```

The portable record is
[`select-subject-call-census-20261014-v1.json`](evidence/select-subject-call-census-20261014-v1.json).
Its derivation checks both method identities, unique full PLL objects, all
36 instruction addresses, every query/invocation/report hash, method PE and
seed bindings, and static-only/non-execution metadata.

## PREMIUM dispatch-slot observation at PICK entry, 2026-10-14

A separate fresh source-bound `writer-stream-seed-1234` triplet at 768×1080
captured a `PICK` entry before its prologue. All three runs completed; five
drawing/scene artifacts, six staged Lisp sources, and the before/after
planning traces matched. The observer reached `READY`, captured the requested
native report, and wrote its required terminal `END` marker.

At the captured `PICK` entry `0x1fe00e8c`, the stack return address is
`0x1fe4c07f`. The live bytes at the preceding address `0x1fe4c07c` are
`FF 57 27`, matching the mapped PREMIUM `SELECT-SUBJECT` method payload and
the instruction `CALL dword ptr [EDI+0x27]`. At this entry, `EDI` is
`0x20000985`; the four bytes at `EDI+0x27` (`0x200009ac`) are `83 09 00 20`,
which encode the raw dword `0x20000983`. That differs from the named `PICK`
entry `0x1fe00e8c`.

The stack return address and validated instruction bytes tie this `PICK` hit
to the PREMIUM method call site. The dword read, however, was taken after
control reached `PICK`, not immediately before the caller's CALL. It therefore
does not establish the value that CALL read; `EDI` may have changed before
entry. The read value remains unidentified: it is not mapped to a PLL function,
and its memory type, code bytes, control-flow role, ABI, and Lisp identity are
unknown. REA's 36 static call queries remain unresolved. No JavaScript
contract or caller-generalization follows from this sample.

The portable evidence is
[`pick-dispatch-slot-20261014-v1.json`](evidence/pick-dispatch-slot-20261014-v1.json),
rebuilt with
[`derive-pick-dispatch-slot-evidence.mjs`](../tools/derive-pick-dispatch-slot-evidence.mjs).
It validates the complete triplet, source hashes, all controls and markers,
the hit's return address, exact return-callsite bytes, and raw EDI+0x27 dword
read at PICK entry. It explicitly does not treat the latter as the caller's
pre-CALL operand. The archived runs and observer report are under the ignored
`research/extracted/local-oracle/` tree.

## PREMIUM call destination captured with a separate DR0 breakpoint, 2026-10-14

A second fresh source-bound 768×1080 triplet independently stopped at the
PREMIUM method's `CALL [EDI+0x27]`, read the slot before the instruction, and
armed a DR0 execute breakpoint at that value. The first-chance DR0 event was
on the same thread at EIP `0x20000983`, before its first instruction. The
pre-call slot contained bytes `83 09 00 20`, encoding the same value. ESP
decreased by four and `[ESP]` was `0x1fe4c07f`, the callsite plus three. The
helper restored the original debug-register state, detached, released the
READY pause, and reported no cleanup errors. This is a direct runtime
destination capture; it does not rely on or weaken the original DR6.BS
single-step gate.

The target is not the independently mapped `PICK` entry (`0x1fe00e8c`), so
this is not a direct CPU edge to PICK. Its 32-byte memory window is
`MEM_MAPPED`/`PAGE_READWRITE` and has no exact 32-byte match in the captured
`AARON.pll`. REA/Ghidra statically decoded eight queried instruction starts
covering 22 bytes of that exact window; it created no functions. One
conditional branch remains within the window and an unconditional branch
points outside it, but neither branch's execution was observed. The target's
Lisp name and function boundary remain unresolved.

The before/observer/after runs all completed at 768×1080. Their five
drawing/scene artifacts, six staged sources, and planning traces match. The
portable record is
[`premium-callsite-destination-breakpoint-20261014-v1.json`](evidence/premium-callsite-destination-breakpoint-20261014-v1.json),
derived by
[`derive-premium-callsite-destination-breakpoint-evidence.mjs`](../tools/derive-premium-callsite-destination-breakpoint-evidence.mjs).
Its 32-byte hash matches the earlier bounded static REA record. The follow-up
same-thread PICK-entry correlation is documented below; it adds no behavior
contract or painting-parity result.

## PREMIUM call destination and PICK-entry correlation, 2026-10-14

A follow-up complete source-bound 768×1080 triplet armed DR0 at the current
PICK entry and DR1 at the measured call's `callSite+3` continuation after the
pre-CALL slot and destination had been captured. The first endpoint was PICK:
the same thread hit `0x1fe00e8c` before its first instruction, with DR6.B0 set.
Its ESP matched the destination hit, its EBP comparison matched the original
frame, and `[ESP]` remained `0x1fe4c07f`. The PICK bytes at the hit matched the
unique current 114-byte PICK payload mapping. The continuation breakpoint had
been armed but did not fire before PICK. The helper restored debug registers,
detached, released READY, and reported no cleanup errors. The five
drawing/scene artifacts, six staged sources, and planning traces matched in
the before/observer/after controls.

This shows that the observed path reached the current PICK entry on the same
thread with matching stack/frame markers before the original continuation
guard. It does not capture the intervening instructions or prove a direct
edge from the anonymous CALL destination `0x20000983` to PICK. The retained
markers reduce but do not eliminate stack-reuse ambiguity. The anonymous
destination still has no recovered Lisp function identity or native boundary;
the bounded REA analysis created no functions. No ABI, JavaScript behavior
contract, or drawing parity follows. See the [portable correlation record](evidence/premium-callsite-pick-correlation-20261014-v1.json) and its
[offline deriver](../tools/derive-premium-callsite-pick-correlation-evidence.mjs).

The accepted follow-up triplet is
`premium-pick-v3-20261014-125028-65b3a9cc`. Its comparison was rebuilt from
the three completed roots after the PowerShell coordinator's post-capture JSON
serialization exhausted memory; the observer and controls did not need to be
rerun. The coordinator fix and recovery recipe are in
[tooling quick fixes](../tooling-workarounds.md#premium-triplet-comparison-exhausted-memory-after-all-runs-2026-10-14).

REA follow-up queries tested every byte start at offsets +18 through +24 in
the same 32-byte window and queried xrefs for offset +25. None of the seven
alternate decodes reports a CALL, and the xref source is the earlier branch
at +14. These results are alternate byte alignments, not established
instructions or proof of a reachable path; the out-of-window jump target
still has no captured bytes. See the
[portable REA follow-up](evidence/premium-callsite-destination-window-rea-20261014-v2.json).

The next native-analysis target is a wider source-bound live read around the
dynamically rediscovered destination, followed by REA on those exact bytes.
If static analysis still leaves the route unresolved, record a bounded
same-thread EIP trace until PICK or the original continuation. Revalidate
addresses against the current mapping before any debugger attach.
