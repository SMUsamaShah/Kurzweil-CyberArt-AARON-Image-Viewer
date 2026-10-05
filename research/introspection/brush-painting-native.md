# Native painting and buffer dependencies

## Verified mapping, 2026-10-06

Six original compiled functions have unique complete-object matches in the
archived PLL and byte-checked standalone Ghidra reports. This extends the
[boundary investigation](brush-stroke-boundary.md) toward the work between
boundary marking and clearing. It identifies native objects and candidate
dependencies; it does not recover the complete painter.

| Function | Payload bytes | Instruction rows checked | Instruction bytes checked |
|---|---:|---:|---:|
| SCREEN-AND-STORE | 1,224 | 424 | 1,216 |
| BRUSH-FILL-SUBPART | 842 | 293 | 834 |
| BUFFER-HEAD | 146 | 55 | 138 |
| BUFFER-ANYTHING | 750 | 258 | 741 |
| BUFFER-FEATURE | 444 | 164 | 435 |
| BUFFER-HOLE | 474 | 170 | 465 |
| Total | 3,880 | 1,364 | 3,829 |

Every exported instruction row agrees with the corresponding original bytes.
The table distinguishes the full payload from the bytes covered by reachable
instruction rows; uncovered ranges are retained in the evidence. The memory
window contains the complete matched code object. The 64-byte MEMREF metadata
report is bound separately and is not substituted for the PLL object header.
Measured window offsets are used, including a window clamped at its region
boundary.

## Dependencies to investigate

BUFFER-FEATURE and BUFFER-HOLE both reference the array setter `.INV-S-AREF`.
The former's native loop references EDGE, CORE, coordinate ROUND and
IN-SUB-FRAME. The latter references ZERO-EDGE and FOOB. These are concrete
candidate write paths for the additional clear-entry value-3 positions.
Natural complete input/output captures are needed to establish their executed
behavior and attribute those cells.

BUFFER-HEAD references BUFFER-FEATURE and an ordered feature-symbol list.
Its bounded constant summary exposes four list entries followed by a CONS
type summary; that is not a complete four-entry list. BUFFER-ANYTHING
references BUFFER-HOLE. Neither constant references nor wrapper nesting
alone establish an immediate native caller.

SCREEN-AND-STORE's captured constants do not contain a direct FILL-MAP setter.
That absence does not prove that its called helpers cannot modify a map.
BRUSH-FILL-SUBPART supplies further painting/buffering/clearing dependencies;
its complete behavior remains unresolved.

## Evidence and reproduction

The portable [native evidence](evidence/brush-buffer-native-20261006.json)
binds 91 source/artifact records, six complete code objects, instruction ranges,
metadata, Ghidra reports and canonical REA records. Original images, windows,
payloads and decompiler reports remain ignored.

The original runs are `brush-painting-native-seed1234-20261005-a` and
`brush-buffer-native-seed1234-20261005-c`. Both complete AA0 files and complete
scene reports equal the fresh uninstrumented
`brush-painting-native-control-seed1234-20261005-b` bytes. These are controlled
seed-1234 observations, not general generator parity.

The two probes are [painting metadata](brush-painting-native-links.cl) and
[buffer metadata](brush-buffer-native-links.cl). Follow
[the native workflow](../native-analysis-workflow.md) to recapture live bytes,
map unique objects and decode them. Then run:

```powershell
node research/tools/derive-brush-buffer-native-evidence.mjs `
  --output research/extracted/local-oracle/brush-buffer-native-seed1234-20261005-c/native-code/mapped/fresh-evidence.json
```

The deriver uses the recorded run roots and requires a fresh ignored output.
On this workspace, its child-process ignore check may need scoped permission;
keep that guard intact. REA 3.2.1 import/export validates external standalone
Ghidra evidence. `nativeProviderSession` is false for all six objects; no stock
REA Windows x86 native-provider session or debugger caller capture is claimed.

## Natural follow-up and next work

The subsequent [complete feature-buffer capture](brush-feature-buffer.md)
validates all 24 natural BUFFER-FEATURE calls and attributes the 6,965 extra
endpoint positions to captured feature net changes. The three BUFFER-HEAD
outputs compose from those measured child maps. BUFFER-HOLE/BUFFER-ANYTHING
are not naturally called in these paintings.

The static reports do not establish the natural return values, full map
changes, feature traversal, FOOB semantics or ZERO-EDGE construction. The
first buffer observer is excluded: it lacks MAIN/READY and a completion
footer despite a complete matching drawing. Continue with FOOB and ZERO-EDGE,
then the complete row/iris schedule and value-0 painter.
