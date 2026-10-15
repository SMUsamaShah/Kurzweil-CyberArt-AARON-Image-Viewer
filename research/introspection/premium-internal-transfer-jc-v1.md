# PREMIUM internal transfer pre-JC state

**Historical checkpoint:** this note records the earlier stop before `JC`.
The first post-JC successor was captured later; see the
[successor finding](premium-internal-transfer-jc-successor-v1.md).

**Status:** one complete, source-bound 1920×1080 triplet captures the
anonymous PREMIUM destination immediately before a short conditional branch.
The event records CF=1 and the predicted taken target, but the branch's first
successor instruction was not observed. This is a bounded native observation,
not recovered Lisp or JavaScript behavior.

## Accepted triplet

Triplet `prem-jc-456069-r3-20261015-112943-78e0d290` used
`writer-full-seed-456069`; the AA0 header was `1920 1080 184`. Before,
observer, and after runs completed. The five staged Lisp sources, six drawing
and scene artifacts, full 25,840,962-byte writer tape, and before/after
planning traces match across all three legs. The portable derivation verifies
the source hashes, complete capture envelope, exact cleanup, fresh controls,
and this triplet's comparison. See
[`premium-internal-transfer-jc-seed456069-20261015.json`](evidence/premium-internal-transfer-jc-seed456069-20261015.json)
and the retained ignored comparison referenced there.

The observer recorded three ordered same-thread events: the outer
`CALL [EDI+0x27]` at `0x1fe4c07c`, entry at the anonymous destination
`0x20000983`, then a pre-instruction breakpoint at `0x20000991`. At that
address the live bytes were `72 09`, a short `JC` with relative displacement
`+0x09`. The captured EFLAGS had CF=1. The preceding `CMP [EDI-0x65],ESP`
compares `0x0619af40` with `0x06999354`; the unsigned less-than result agrees
with CF=1. If the conditional branch executes from this state, its predicted
target is window offset `+0x99`, address `0x2000099c`.

REA 6.4/Ghidra 12.1.4 decoded the same `72 09` bytes from a hash-bound
synthetic PE and reported its static direct target as synthetic address
`0x10001099`. The PE was not executed. This corroborates the instruction
encoding and static target calculation only; the live successor remains
unobserved.

At the branch event, EDI was `0x20000985`. The raw dword at `[EDI+0x35f]`,
address `0x20000ce4`, was `0x6388bb08`. Its identity is unknown. The
`CALL [EDI+0x35f]` at `0x2000091a` and `JMP [ESI+0x12]` at `0x200009a4`
were still armed with zero hits when the capture stopped before executing
the `JC`; these are not scene-level no-hit results.

The live 256-byte window SHA-256 was
`3f2dd8cff1caae29efde6e4d1660a787bfc26418715e3d5643d77b70149ac5c8`,
different from the historical reference hash
`39463cf987721fcc34745e23dbc3e9baab215baf05f9971ee94537446bff8abd`.
All 11 pinned instruction spans matched. The helper detached cleanly, restored
all thread debug-register state exactly, and reported no cleanup errors.

## Limits of this earlier capture

This capture confirms CF=1 immediately before `JC` for one full-writer scene;
it does not show that the instruction executed or establish its successor. It
does not prove a continuous path, name the anonymous destination, identify a
direct Lisp caller, resolve the candidate pointer, or add a JS contract or
painting parity. Earlier captures of other seed/canvas regimes predicted the
same branch condition from an earlier outer-destination snapshot; they remain
predictions based on state that was not sampled at the branch.

This earlier triplet stopped before `JC` executed. The later successor capture
observed one first-chance taken successor and is documented separately. The
next investigation is the unresolved PICK/PREVDEX/HDEX decision path; use REA
on the exact mapped payloads to choose the next bounded source-bound probe.
