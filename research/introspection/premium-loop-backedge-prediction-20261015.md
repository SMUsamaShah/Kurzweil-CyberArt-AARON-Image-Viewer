# PREMIUM loop-backedge condition prediction

**Status:** REA confirms one static xref from the `+0x90` jump to the `+0x17`
call site. Three accepted runtime snapshots predict `JC +0x99` taken, but no
capture observed that branch executing. This is an analysis aid for the next
probe, not recovered control flow.

## REA result

REA 6.4.0 / Ghidra 12.1.4 queried the exact synthetic PE built from the
captured 256-byte window. The `xrefs` query for synthetic address `0x10001017`
returned one source, `0x10001090`. Relative to the window start, those are the
runtime `JMP +0x17` at `+0x90` and the indirect `CALL [EDI+0x35f]` at `+0x17`.
This is a static reference only; it does not show that the jump or call ran.
The query report and source-bound derivation are recorded in the
[portable evidence](evidence/premium-loop-backedge-prediction-20261015.json).

## Predictions from accepted captures

For each accepted outer-destination event, `EDI=0x20000985`, so the operand
read by `CMP [EDI-0x65],ESP` is at `0x20000920`, inside the captured window.
The recorded little-endian dword is less than ESP in each sample:

| Triplet | Mode | `[EDI-0x65]` value | ESP | Predicted CF / `JC` |
|---|---|---:|---:|---|
| `prem-it-v3-crlf-20261015-062149-42409a0d` | seed-1234 writer stream | `0x0624af40` | `0x06a49354` | 1 / taken |
| `prem-internal-next-20261015-102743-42be241d` | seed-1234 writer stream | `0x0619af40` | `0x06999354` | 1 / taken |
| `prem-internal-s5678-20261015-104044-22713a85` | seed-5678 full writer | `0x0725af40` | `0x07a59354` | 1 / taken |

The preceding instructions leave EDI and ESP unchanged. The intervening
`MOV [EBP-0x10],ECX` writes to a different address in all three captured
register states. If those values remain stable until the `CMP`, the predicted
`JC` target is `+0x99`, bypassing the `+0x90` jump back to `+0x17`. That is
consistent with the bounded zero-hit at the call site in these captures.

The stack difference `ESP - [EDI-0x65]` is `0x007fe414` in all three samples.
Its meaning is not identified here; calling it a stack limit or assigning the
slot a runtime role would go beyond the evidence.

## Limits and next probe

The debugger did not stop at the `CMP` or `JC`. The inference assumes the
captured memory value is unchanged between the outer-destination event and the
comparison. The accepted captures observe selected breakpoints, not every
instruction, so they do not prove a continuous path from the outer destination
through the predicted branch to the tail jump. This does not name the anonymous
block, resolve the indirect CALL target, add a JavaScript contract, or establish
painting parity.

Next, use a different source-bound scene and a no-TF breakpoint at the `JC`
site to record CF before execution. At that same event, record `[EDI+0x35f]`
and map the candidate pointer with REA. A taken/not-taken observation will
test the prediction directly; the slot read will identify a possible target
without claiming the CALL executed.
