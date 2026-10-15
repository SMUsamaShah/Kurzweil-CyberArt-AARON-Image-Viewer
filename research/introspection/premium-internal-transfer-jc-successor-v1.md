# PREMIUM JC first-successor native observation

**Status:** one accepted, source-bound native triplet observed the actual first
instruction address after `JC` in a 1920×1080 seed-456069 full-writer scene.
The successor breakpoint stopped before that instruction executed. This adds
no JavaScript behavior contract or painting parity.

## Accepted triplet and controls

Triplet `premjcsucc3-20261015-121544-fd725a19` used
`writer-full-seed-456069` with AA0 header `1920 1080 184`. Before, observer,
and after runs completed. The six standard drawing/scene artifacts, five
staged Lisp sources, 25,840,962-byte writer tape, and 21,296,429-byte
before/after planning traces match across the three legs. The comparison binds
seven source paths and hashes, including the V5 coordinator and V4 debugger
helper. The READY metadata contains the ordered `BEGIN`, `INSTALL`, `READY`,
`CAPTURE-WAIT released=T`, `COMPLETE`, and `END` records.

Portable evidence was derived twice byte-identically:

- [`premium-internal-transfer-jc-successor-premjcsucc3-20261015-121544-fd725a19.json`](evidence/premium-internal-transfer-jc-successor-premjcsucc3-20261015-121544-fd725a19.json)
- SHA-256: `7489e6dd8b04db7fde873a9918e979ff1a23403dc1c25f7a56eb5650ef0090de`

## Observed event sequence

All four native events came from the same selected thread:

1. The outer `CALL [EDI+0x27]` at `0x1fe4c07c` reached anonymous destination
   `0x20000983`.
2. At `0x20000991`, the live bytes were `72 09` (`JC rel8 +0x09`). CF was 1.
   The captured `CMP [EDI-0x65],ESP` operands were `0x063daf40` and
   `0x06bd9354`; the unsigned comparison agrees with CF=1.
3. The predicted taken successor was window offset `+0x99`, address
   `0x2000099c`. A one-shot DR3 execute breakpoint observed event 4 at that
   address, before execution, with live bytes `89 44 24 04`.

The observer kept DR1 on the candidate tail `JMP [ESI+0x12]` and DR2 on the
outer-call return guard. DR0 was reassigned from `CALL [EDI+0x35f]` to the
fallthrough successor. Readbacks showed the expected local execute-only DR7
masks (`0x55` while both successors were armed, then `0x54` and `0x14` as the
reused slots were disabled). The actual successor agreed with both the CF
prediction and the live bytes.

Before continuing event 4 with `DBG_CONTINUE`, the helper restored the selected
thread's original DR0–DR3, DR6, and DR7 exactly. The continue receipt confirms
that the restoration preceded a successful continue. All tracked thread debug
state was restored, the debugger detached, and the cleanup error list was
empty.

## Static analysis and limits

REA 6.4/Ghidra 12.1.4 decoded the `72 09` branch from a hash-bound synthetic
PE and reported synthetic target `0x10001099`. That PE was not executed. The
full live 256-byte window hash is
`fc671ca09436db97aa33edf495d8b88d60d6afa861f80e8bf322b42f4f69b0cf`; it
differs from the historical reference
`39463cf987721fcc34745e23dbc3e9baab215baf05f9971ee94537446bff8abd`, while
all 11 pinned instruction spans match.

The raw dword at `[EDI+0x35f]` was `0x6388bb08`; its target identity is
unknown. The `CALL [EDI+0x35f]` source site had no recorded hit through the
successor event. DR0 stopped monitoring it after the JC event, so this capture
does not establish whether that CALL later executes. The tail-JMP and
outer-return guard also had no hits before the capture boundary. The anonymous
destination's direct Lisp caller remains unidentified. This is one bounded
scene sample; it does not establish a general branch rule, continuous path,
JavaScript behavior, or painting parity.

The earlier [pre-instruction finding](premium-internal-transfer-jc-v1.md)
records the previous capture where the same branch was predicted but its
successor was not observed.
