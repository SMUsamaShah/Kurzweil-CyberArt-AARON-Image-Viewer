# SCREEN-AND-STORE indirect call and return

## Accepted observation, 2026-10-27

The source-bound triplet `sstore27f-20261027-093231-4740a8ed` completed fresh
before, observer, and after runs in `screen-unit-seed-1234` mode. The verifier
passed the scene, drawing, planning, and staged-source comparisons. The
portable [evidence record](evidence/screen-and-store-call-return-sstore27f-20261027.json)
binds the original triplet summary, native report, runtime files, capture
sources, and all three control runs by SHA-256.

The observer's completed metadata identifies
`COMMON-GRAPHICS-USER::SCREEN-AND-STORE` as a `COMPILED-FUNCTION`. Its live
1,224-byte payload at `0x1fe24a6c` matched the mapped payload and the original
`AARON.pll`. At payload offset `+0x2a6`, live code executed `CALL EDI`
(`FF D7`). The same-thread source event recorded raw `EDI = 0x20000985`; a
second event reached that target with the pushed continuation
`0x1fe24d14` at `[ESP]`. The target returned to `0x1fe24d14` with raw
`EAX = 0x0000008c`, `ESP` equal to its pre-call value, and the observed `EBP`
unchanged.

The return breakpoint stopped before the continuation bytes `89 45 BC`
(`MOV [EBP-0x44],EAX`) executed. The capture therefore observes the raw word
at the return boundary; it does not claim that the local store occurred or
assign a Lisp result type to `0x0000008c`.

The runtime reported the image through `C:\AaronOracleRuns` while the runner
supplied the equivalent D: junction path. The path strings differed, but the
volume/file identities matched at both checks and remained stable. Breakpoints
were armed before release, original debug registers were restored, detach
succeeded, and cleanup errors were empty.

## Interpretation and limits

This resolves the runtime destination of one occurrence of the static
`CALL EDI` site. The dynamic destination remains an unnamed raw address: the
capture does not establish a Lisp name, source body, ABI, or semantic type for
`0x20000985`. It does not identify a direct Lisp caller of `SCREEN-AND-STORE`
or `SELECT-BRUSH`, and it adds no JavaScript behavior contract or painting
parity result. The `CALL [EDI-0x71]` at `+0x2b9` was not reached in the later
branch capture.

## Accepted branch-successor follow-up, 2026-10-27

A second fresh source-bound triplet,
`sstorebranch-v1-20261027-100218-35655b8e`, extended the capture through the
conditional branch at payload offset `+0x2b7`. The portable
[branch evidence](evidence/screen-and-store-branch-successor-sstorebranch-v1-20261027.json)
binds the completed triplet, current runtime and PLL, mapped payload,
debugger sources, observer report, and matched before/after controls.

In this separate invocation, the `JNZ rel8 +3` at `+0x2b7` had ZF clear
(`EFLAGS=0x282`). A same-thread hardware execute breakpoint then observed its
taken successor at `+0x2bc` before `MOV EBX,EAX` executed. The observer
rechecked the complete 1,224-byte mapped payload at all six capture phases;
all hashes matched. The triplet verifier accepted the fresh before, observer,
and after controls, including the compared drawing, scene, planning, writer,
screen-unit, screen-color, and staged-source outputs. The earlier
`sstore27f` call/return capture and this branch follow-up are separate
accepted triplets; their events are not presented as one continuous run.

The saved registers at `+0x2bc` were `EAX=0x8c` and `EDX=0xfffffffc`. REA
6.8's static listing predicts the later `JNZ` at `+0x2c3` falls through, the
`JZ` at `+0x2c7` falls through, and the `JMP` at `+0x2cd` reaches `+0x331`,
which contains another `CALL EDI` at `+0x34a`. Those outcomes are predictions
from this captured register snapshot and the analyst-generated static PE;
none of those later edges or the second call was observed. REA reports that
call as unresolved and identifies one static incoming reference to `+0x331`.
The follow-up therefore establishes only the single `+0x2b7` to `+0x2bc`
edge for this invocation. It adds no function or JavaScript behavior
contract, no direct Lisp caller, and no painting-parity result.

## Rejected run and debugger fix

The first fresh attempt, `sstore27e-20261027-092828-62b4014c`, reached the
same source and target events, then failed closed when Windows delivered the
target-entry single-step exception a second time. The helper had validated
and disarmed its target-entry breakpoint but left the event's continuation
status as `DBG_EXCEPTION_NOT_HANDLED`. The helper now marks that validated
event `DBG_CONTINUE` only after the disarm succeeds. A separate
6.1 Sol High review and the accepted `sstore27f` triplet checked this fix.
The rejected run remains diagnostic-only and is not part of the accepted
observation.

See the [tooling workaround](tooling-workarounds.md#screen-and-store-breakpoint-event-must-be-handled),
the [REA 6.8 static analysis](rea-payload-analysis.md#screen-and-store-return-use-rerun-2026-10-27),
and the [active execution plan](execution-plan.md).
