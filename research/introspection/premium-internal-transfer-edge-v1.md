# PREMIUM internal transfer reaches the current PICK entry

**Status:** three accepted, complete source-bound 768×1080 triplets across
seed-1234 and seed-5678 scenes. These record native CPU edges; they do not add
a JavaScript behavior contract.

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

## Clean same-scene repeat

Triplet `prem-internal-next-20261015-102743-42be241d` completed fresh
before/observer/after runs with matching five drawing/scene artifacts, six
staged scene sources, and before/after planning traces. The helper detached,
restored debug-register state exactly, and reported no cleanup errors. The
observer again measured the same outer call destination and a same-thread
`JMP [ESI+0x12]` edge to the freshly mapped PICK entry. Its `CALL [EDI+0x35f]`
breakpoint at `0x2000091a` had zero hits; the tail-jump source and destination
each had one hit. See the [repeat evidence](evidence/premium-internal-transfer-repeat-20261015.json),
derived by the [offline validator](../tools/derive-premium-internal-transfer-triplet-evidence-v1.mjs).

This repeat uses the same seed and scene as the first capture. It confirms the
measured edge in a fresh accepted triplet but does not expand scene, seed, or
canvas coverage. The zero-hit CALL remains a bounded no-hit, not an
unreachable-code conclusion. The clean accepted run also shows the normal
detach path; the coordinator's owner-bound recovery branch for the previously
rejected detach error remains unexercised.

## Full-writer seed-5678 scene

Triplet `prem-internal-s5678-20261015-104044-22713a85` used
`writer-full-seed-5678`. Before, observer, and after controls matched for the
five standard drawing/scene artifacts, five staged Lisp sources, and the
complete 25,296,613-byte writer tape (SHA-256
`c4dc5e6e5c4ec9ff11c3a961c03482500322bdf98d1e910878a3ba4b3e8ef99b`). The
observer freshly mapped the same PREMIUM and PICK objects. Its anonymous
destination again reached the current PICK entry through a same-thread
`JMP [ESI+0x12]`; `CALL [EDI+0x35f]` at offset `+0x17` again had zero hits.
All 11 pinned instruction spans matched the REA profile, while the full
256-byte window hash differed from the historical reference. See the
[portable seed-5678 evidence](evidence/premium-internal-transfer-seed5678-20261015.json).

This is one full-writer scene at a second seed, not broad scene coverage. The
zero-hit CALL remains a bounded observation; the run does not establish that
the site is unreachable or identify its target.

A fresh corrected-source rerun,
`prem-it-v3-final-20261015-062543-6f3ff028`, reached the same tail edge but
failed the clean-detach gate: `DebugActiveProcessStop` returned error 5. Its
diagnostic has `detached=false`; no accepted after-control or triplet
comparison was produced. Do not count it as a replication. The coordinator now
stops only the exact source-bound AARON process after this specific rejection,
allowing the runner to collect staging files and restore its registry snapshot
without waiting the full run limit. See [tooling quick fixes](../tooling-workarounds.md#debugger-detach-failed-after-premium-edge-capture-2026-10-15).
The cleanup change passed the no-launch preflight. Accepted subsequent runs
used the normal clean-detach path, so the owner-bound recovery branch for this
specific failure remains unexercised.

## Limits and next step

The three captures establish the same direct CPU tail-jump edge to the current
PICK entry in their observed outer-call frames. They do not identify a direct
Lisp caller, recover the anonymous block's function boundary, or trace every
instruction between `0x20000983` and `0x200009a4`. These captures do not
generalize to other seeds or canvas sizes and do not establish Lisp arguments,
function behavior, a JS contract, or painting parity. The project counts
remain 1,347 inventoried binding names, 31 routine names / 32 bounded JS
contracts, 1/5 milestones by count, and zero complete whole-painting parity
results.

Frida is not a usable live route for this AARON runtime with the tested agent
build. Two source-bound attach attempts crashed in the same `frida-agent.dll`
before script load, with exception `0xc0000409` at offset `0x00c0df07`. See the
[crash evidence](evidence/frida-aaron-injection-crash-20261015.json) and
[tooling note](../tooling-workarounds.md#frida-agent-crashes-aaron-before-the-script-loads-2026-10-15).

Next, keep REA as the static targeting tool and use the existing non-injecting
no-TF hardware-breakpoint route to investigate the separate `CALL [EDI+0x35f]`
at anonymous-window offset `+0x17`. It was not hit in either seed-1234 triplet
or the seed-5678 full-writer triplet, so do not repeat those conditions. Use
REA's branch/data-flow view to identify a scene condition likely to continue
through the loop backedge; then rediscover and verify the live addresses and
bytes and retain fresh uninstrumented controls. Keep all three accepted
triplets immutable; do not infer a function name or ABI from a captured
destination alone.
