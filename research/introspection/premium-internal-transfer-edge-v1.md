# PREMIUM internal transfer reaches the current PICK entry

**Status:** one accepted, complete source-bound 768×1080 seed-1234 triplet.
This records a native CPU edge; it does not add a JavaScript behavior contract.

## Measurement

Triplet `prem-it-v3-crlf-20261015-062149-42409a0d` completed its before,
observer, and after runs. The five drawing/scene artifacts, six staged Lisp
sources, and before/after planning traces match across the controls. Each AA0
has the same SHA-256, `405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a`.

The observer freshly mapped the 362-byte PREMIUM method payload to its unique
366-byte object in that run's PLL. At payload offset 200 (`0xc8`), live bytes
`FF 57 27` encode `CALL [EDI+0x27]` at `0x1fe4c07c`; the captured destination
was anonymous code at `0x20000983`. At that destination, the observer armed
execute breakpoints using the REA window. Event order 3 recorded
`JMP [ESI+0x12]` at `0x200009a4`; event order 4 recorded its destination at
`0x1fe00e8c`, equal to the current PICK entry freshly mapped from the same
observer PLL. The complete PICK object also matched uniquely in that PLL.

Both tail-jump events belong to thread 21944. ESP remained `0x06a49354`, and
`[ESP]` was `0x1fe4c07f` at both points, the return continuation of the outer
PREMIUM CALL. A hardware execute guard was armed at that continuation and had
not fired before the tail-jump destination event. The probe left the trap flag
untouched, restored the debug registers, detached cleanly, and recorded no
cleanup errors.

The captured 256-byte window at `0x20000903` hashes to
`e19ab00ae3ed25cb5ff9eb1502b18a4c1e50d3c6dac2613a1f4a8eb936e552aa`, which
differs from the historical reference hash
`39463cf987721fcc34745e23dbc3e9baab215baf05f9971ee94537446bff8abd`. All 11
pinned instruction spans match, including the outer CALL site and tail JMP
site. Treat other bytes and alternate instruction alignments as unverified.
The separate `CALL [EDI+0x35f]` did not execute in this capture.

## Correcting the archived report sentence

The accepted capture's summary sentence ends by saying the edge was not “a
PICK target.” Its own measurement fields say
`tailJumpDestinationAddress=0x1fe00e8c`,
`currentPickEntry=0x1fe00e8c`, and
`tailJumpDestinationEqualsCurrentPick=true`. The stored sentence is therefore
stale and contradicts the raw event and mapping records. The raw capture is
preserved unchanged; the portable evidence deriver validates the equality and
emits this corrected interpretation in
[premium-internal-transfer-triplet-v3-20261015.json](evidence/premium-internal-transfer-triplet-v3-20261015.json).

The archived capture and comparison record the coordinator hash used at run
time, but the exact historical coordinator file was not retained. Its old hash
could not be independently reconstructed from the edited working copy. The
derivation records this source-history limitation instead of claiming a
current-source hash match.

A fresh corrected-source rerun,
`prem-it-v3-final-20261015-062543-6f3ff028`, reached the same tail edge but
failed the clean-detach gate: `DebugActiveProcessStop` returned error 5. Its
diagnostic has `detached=false`; no accepted after-control or triplet
comparison was produced. Do not count it as a replication. The coordinator now
stops only the exact source-bound AARON process after this specific rejection,
allowing the runner to collect staging files and restore its registry snapshot
without waiting the full run limit. See [tooling quick fixes](../tooling-workarounds.md#debugger-detach-failed-after-premium-edge-capture-2026-10-15).
The cleanup change passed the no-launch preflight but has not yet been exercised
by another original-runtime run.

## Limits and next step

This capture establishes one direct CPU tail-jump edge to the current PICK
entry within one outer-call frame. It does not identify a direct Lisp caller,
recover the anonymous block's function boundary, or trace every instruction
between `0x20000983` and `0x200009a4`. It does not generalize to other seeds or
canvas sizes and does not establish Lisp arguments, function behavior, a JS
contract, or painting parity. The project counts remain 1,347 inventoried
binding names, 31 routine names / 32 bounded JS contracts, 1/5 milestones by
count, and zero complete whole-painting parity results.

Next, keep REA as the static targeting tool and continue the separate Frida
Stalker route on a fresh disposable AARON process. Filter the bounded live trace
to the exact mapped PREMIUM and PICK regions and the REA-selected transfer
sites, and retain complete before/observer/after controls. Do not attach Frida
to a process controlled by the Windows debugger.
