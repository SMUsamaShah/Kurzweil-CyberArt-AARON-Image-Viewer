# Measured `SELECT-BRUSH` caller

## Result, 2026-10-04

In two retained fresh seed-1234 scenes, the original runtime executed this application
call path:

```text
DISPLAY-COLOR-PATCHES → BRUSH-FILL → SELECT-BRUSH
```

`SELECT-BRUSH`'s immediate stack return address was `0x1fe198d8`, which is
`BRUSH-FILL` entry plus `0x68c`. The preceding instruction is the two-byte
indirect call at `BRUSH-FILL +0x68a`. Before the selector's prologue, its
caller's saved frame returned to `DISPLAY-COLOR-PATCHES +0x35a`, immediately
after that function's indirect call to the brush filler.

This establishes the executed caller for the first selector entry in these
two scenes. Other branches, scenes, generic methods and dynamic rebinding
are outside this observation. `ASSIGN-COLORS` was an earlier stage in the
old wrapper trace; ordering alone did not establish a caller.

## Linking names to native bytes

The pre-scene metadata probe ran before scene tracing replaced function cells.
It inspected five ordinary compiled functions, their 64-byte object headers,
and their constants. It also scanned 1,347 own application bindings and 1,380
unique compiled objects, including nested compiled constants. It found one
selector reference: `BRUSH-FILL` constant 26 was the `SELECT-BRUSH` symbol.
The scan finished with zero errors or truncations; it did not comprehensively
scan generic method bodies.

Bounded `ReadProcessMemory` captures exposed the entry pointer in each
function's metadata at byte offset 18. At entry minus four, the live code had
the PLL's `0x6c` object tag and encoded length. Each complete object matched
exactly one of the archived PLL's 7,723 indexed objects, including its header
and full payload. The earlier field-30 pointer did **not** identify the object
header; reading it as a header failed and was discarded.

| Function | PLL object offset | PLL payload offset | Payload bytes | Runtime entry in these runs |
|---|---:|---:|---:|---|
| `SELECT-BRUSH` | 2,640,152 | 2,640,156 | 328 | `0x1fe2491c` |
| `BRUSH-FILL` | 2,593,352 | 2,593,356 | 1,986 | `0x1fe1924c` |
| `DISPLAY-COLOR-PATCHES` | 2,494,520 | 2,494,524 | 1,048 | `0x1fe0103c` |
| `PAINT-FILL` | 2,589,136 | 2,589,140 | 782 | `0x1fe181d4` |
| `RECORD-BRUSH` | 2,496,720 | 2,496,724 | 298 | `0x1fe018d4` |

The PLL SHA-256 is
`7ffc7dc9e3e62b1c5ba3612630b8747778324fa674dac42916be3e90bb96504c`.
Addresses are observations, not constants for future attachments. The capture
helper rediscovers entries and compares all five complete live payloads with
the mapped bytes before attaching.

## Static candidate and runtime confirmation

Standalone Ghidra 12.1.4 decoded the exact payloads as `x86:LE:32:default`
with the Windows compiler specification. Its instruction counts were 115,
651, 376, 279 and 116, respectively, for the table above. Each decompilation
completed, but its C output does not model Allegro Lisp's register ABI or
tagged objects and is retained only in ignored local storage.

In `BRUSH-FILL`, the bounded call site accesses constant slot 25
(`SUBP-COUNT`) and a symbol field, loads slot 26 (`SELECT-BRUSH`), sets
`CL` to one, and performs the indirect call at `+0x68a`. Afterward it accesses
slot 27 (`BRUSH`) through another runtime helper. This supports the count-input
and brush-assignment interpretation; the complete assignment policy is still
unmeasured. Slot addressing follows the observed four-byte stride, with slot
0 accessed at `[ESI+0x32]`.

Those instructions initially supported a static inference: Ghidra reports
the transfer as a computed call and cannot name its destination. A Windows
WOW64 hardware execute breakpoint at the exact selector entry then measured
the immediate return address. It was the predicted `BRUSH-FILL +0x68c`,
establishing the executed edge through Allegro's dispatch machinery. The
caller's frame also matched the predicted `DISPLAY-COLOR-PATCHES +0x35a`.

At entry, `EAX` was `0x6f6c` and `ECX` was 1. The EAX word agrees with the
prior natural `7131 → brush ID 2` observation under a two-bit fixnum shift;
this capture does not establish a general numeric ABI. The previous
[integer-domain specification](select-brush.md) remains the measured JS rule.

The debugger armed four threads, captured one entry hit per process,
restored their saved debug registers and detached. It did not patch code,
inject a function, or write process memory. Unrelated exceptions were passed
to the application. Bounded frame walking beyond the first caller is
heuristic; unknown addresses are not assigned function names.

## Controls and retained evidence

The fresh control used the same `writer-stream-seed-1234` scene mode without
the metadata probe or debugger. Both caller runs matched the control's AA0
and scene-state report **byte for byte**:

| File | SHA-256 |
|---|---|
| AA0 | `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1` |
| Scene-state report | `a2f17602ba33d0ac1b80544c1a70c0ae657c60dad9110c075f9ce43b21e8b415` |

The retained caller runs were `select-brush-native-caller-20261004-j` and
`select-brush-native-caller-20261004-h`; the control was
`select-brush-caller-control-20261004-f`. Both exercised pause ownership and
staged-probe hashing. Run j used the final reviewed helper, including its
dedicated debugger thread for cleanup in interactive PowerShell. The system
clock was unchanged.

The portable record is
[`select-brush-native-caller-seed1234-20261004.json`](evidence/select-brush-native-caller-seed1234-20261004.json).
Its SHA-256 is
`c809e5fa0297001a0cf279bd00d17ded4ecb290907216bc983f573e3e05320a2`.
It retains exact object hashes/offsets, bounded instruction anchors, breakpoint
observations, controls and the REA evidence identity. The derivation checks
the raw captures, metadata constants, live-code identities, instruction bytes
and control equality; it does not reconstruct the complete function source.

REA 3.2.1 accepted one external `ghidra-standalone` record and exported its
canonical bundle. This validates the record and its subject hash; it is not
a REA native provider session or independent authentication of the analysis.
Full native windows, extracted payloads, decompiler output and REA bundles
remain under ignored `research/extracted/`.

## Next function boundary

Characterize how `BRUSH-FILL` obtains and updates `SUBP-COUNT`, including the
`SCAN-ROW` boundary and the `BRUSH-FILL-SUBPART` branch. Record natural caller
arguments, count values, selected brush identity and assignment outcomes
across complete scenes before integrating this policy into JavaScript.
The full filler, palette rules and whole generator are still unrecovered.

See [native-analysis-workflow.md](../native-analysis-workflow.md) for the
reproducible tool and oracle commands.
