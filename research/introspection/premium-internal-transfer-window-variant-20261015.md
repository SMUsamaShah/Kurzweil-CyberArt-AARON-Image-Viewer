# PREMIUM internal-transfer window variant: 2026-10-15

## Result

Triplet `prem-internal-1015c-20261014-234038-b80a2004` did not produce an
accepted before/observer/after comparison. The before control completed. The
observer reached the expected outer callsite at `0x1fe4c07c`, whose indirect
target was `0x20000983`, but rejected the exact 256-byte source window before
arming any internal candidate breakpoints. The observed hash was
`ec07d684ef3f708b0fe04b48f5eb13052e4bce6ea549ecfb2da00250fba4e281`; the
pinned hash was
`6e153e579fad4244bda19b591788d06a4a94b50b2c1addbbbad6892b9afa5693`.

The observer did release its ready pause, detach, restore debug registers, and
report no cleanup errors. It did not produce a completed AA0 or scene `END`,
and the after control was not started. Consequently, there is no accepted
triplet, internal-transfer hit, or behavior conclusion.

## Byte comparison

The current window differs from the accepted 2026-10-14 sample at six offsets:
`0x0b`, `0x1f`, `0x39`, `0x45`, `0x46`, and `0x4b`. It differs from the prior
rejected sample at eight offsets: `0x00`, `0x0b`, `0x0c`, `0x1f`, `0x20`,
`0x39`, `0x4b`, and `0x4c`. None overlap the three spans selected for static
inspection: the indirect `CALL` at `+0x17`, `MOV CL,0x2` at `+0x80`, or the
indirect tail `JMP` at `+0xa1`. The changed bytes' cause is unresolved; do not
describe them as relocations, mutable data, or harmless variation.

## REA and Frida roles

REA 6.4.0 with Ghidra 12.1.4 analyzed a synthetic PE prepared from this exact
rejected window. At synthetic addresses it decoded `CALL dword ptr [EDI+0x35f]`,
`MOV CL,0x2`, a relative `JMP` to the callsite, and `JMP dword ptr [ESI+0x12]`.
The synthetic PE was not executed. These are static decodes only: they do not
establish that the instructions ran, a direct caller, an original function
boundary, an ABI, or JavaScript behavior. In particular, the observer never
armed the candidate sites because its source-window gate failed.

Frida Stalker passed the generated 32-bit fixture with 10,000 ordered internal
call/return pairs across 31 batches. Frida has not been attached to AARON. REA
is being used for static targeting; Frida remains a potential live-tracing
route after AARON-specific attachment and capture requirements are validated.

## Evidence

- [Portable evidence JSON](evidence/premium-internal-transfer-window-variant-20261015.json)
- [Diagnostic-only synthetic-PE preparer](../tools/prepare-premium-internal-transfer-diagnostic-pe.mjs)
- [Frida fixture result](../tooling/frida-stalker-x86-smoke-20261015.md)

The JSON preserves the runtime file hashes, full captured window bytes, offset
comparisons, REA report hashes, and explicit limits. The REA reports and
synthetic PE are local ignored artifacts; no executable was modified or run.
