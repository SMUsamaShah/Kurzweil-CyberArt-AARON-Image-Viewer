# PICK-entry return-site mapping, 2026-10-14

## Result

A matched-runner `writer-stream-seed-1234` before/observer/after triplet
captured the first natural PICK entry hit in a measured 768×1080 scene. The
observer report contains the full source-bound `BEGIN`, `READY`, native
capture release, and `END` records. All six compared outputs and six ordinary
staged scene sources match across the three complete runs.

The saved stack value was `0x1fe4c07f`. It falls outside all eleven
named-function intervals whose complete payloads were matched to both the
indexed PLL and live process memory. These matches establish one common
runtime-to-PLL base, `0x1fba0000`. The return maps to payload offset 203 inside
exactly one indexed anonymous 362-byte PLL object:

- object offset `0x2abfb0`, payload offset `0x2abfb4`, raw end `0x2ac11e`;
- runtime entry `0x1fe4bfb4`, end `0x1fe4c11e`;
- payload SHA-256 `80c35cab667f0b8ad615ca03339ad9ada8747a45d4ceb98ce70fa4581a6636ae`;
- object SHA-256 `f161785f4fdf272a7a5c02b35df99b2741b138c64df79fd1e2329fe1ea751034`.

While stopped at PICK entry, the helper read three bytes at `returnAddress - 3`
from the live process. They were `ff5727`, exactly matching the current PLL
at the address translated through the eleven live-validated candidates.
Entry-seeded REA 6.4.0 / Ghidra 12.1.4 disassembly of the exact 362-byte
payload confirms the instruction boundary as `CALL dword ptr [EDI + 0x27]`;
the next instruction at the captured return is `MOV EDX, EAX`. The function
body is 354 decoded bytes. REA's targeted call-resolution query still reports
an unresolved computed call with no targets.

The indexed PLL table contains 7,723 compiled objects and passes its tag,
length, unique-offset, boundary, final-boundary, and zero-padding checks. In
this original return-site capture, the Lisp function name was unresolved and
the full anonymous payload was not separately read from live memory. A later
source-bound method census read the complete payload live in a separate run
and matched its full payload/object hashes. The computed call target stored
through `[EDI+0x27]` remained unresolved in this original entry-only capture.
Eight bounded EBP frame returns are recorded separately and do not identify
additional callers.

REA reports seven computed calls in `PICK` without resolved targets. Nine
static symbol-reference candidate bodies were examined; their 1,305 CALL
instructions are indirect and none resolves the caller. Those candidates are
not a call graph. The synthetic PE used for REA was not executed. Full REA
reports, payloads, and tool output remain ignored under
`research/artifacts/rea-tools/`.

At the time of the original PICK-entry capture, the continuation's Lisp function name was
unresolved. The later read-only CLOS census in
[`select-subject-methods.md`](select-subject-methods.md) matched the complete
live method-1 payload and full PLL object hash to this same anonymous object.
It associates the saved stack value with
`COMMON-GRAPHICS-USER::SELECT-SUBJECT`'s method with an EQL `PREMIUM`
specializer. This does not prove that the preceding `CALL [EDI+0x27]` directly
transferred control to PICK. The original entry-only capture did not observe
the instruction's CPU destination.

A later independent source-bound capture did observe that CALL's actual CPU
destination: the pre-call `[EDI+0x27]` value was `0x20000983`, and a separate
DR0 execute breakpoint hit that address on the same thread before its first
instruction. It is not the mapped PICK entry. A follow-up correlation then
observed the same thread hit PICK with matching ESP, EBP marker, and saved
continuation before the `callsite+3` guard. The intermediate native transfer
remains unobserved; this is not a direct CPU edge from the anonymous target
to PICK. See the [correlation findings](select-subject-methods.md#premium-call-destination-and-pick-entry-correlation-2026-10-14)
and [portable evidence](evidence/premium-callsite-pick-correlation-20261014-v1.json).

## Reproduction and limits

The capture helper is
[`capture-pick-caller.ps1`](../tools/capture-pick-caller.ps1). It reads the
active staged probe source from `C:\temp` during `READY`, verifies ownership
of the expected oracle process, and reads `returnAddress - 3` while the
process is stopped. The helper accepts both the configured external-run
Junction and a SymbolicLink target. See the
[tooling recovery note](../tooling-workarounds.md#pick-caller-matched-runner-controls-and-live-call-site-read-2026-10-14).

Use `run-local-scene-state-required-probe.ps1` for all three runs. Controls
omit probe parameters; the observer uses the required 120-second pause and
`aaron-pick-native-links.txt` ending in `END pick-native-links`. Mixed runner
hashes are rejected even if scene outputs happen to match. The offline
derivation helper is
[`derive-pick-native-caller-live-site-evidence.mjs`](../tools/derive-pick-native-caller-live-site-evidence.mjs).
The matched-runner v2 triplet is retained under the ignored
`research/extracted/local-oracle/external-runs/` root. Its compact report is
[`pick-native-caller-live-site-20261014-v4.json`](evidence/pick-native-caller-live-site-20261014-v4.json).

The original PICK-entry hit is from one source-bound 768×1080 seed-1234
scene. Method identity was captured separately in a source-bound 320×480
triplet and linked through the unique complete payload/object match and
identical call-site offsets. This identifies the method containing the
continuation matching the saved stack value at one PICK entry. It does not
establish a direct CPU edge, an application-wide call graph, a JavaScript
behavior contract, or drawing or whole-painting parity.
