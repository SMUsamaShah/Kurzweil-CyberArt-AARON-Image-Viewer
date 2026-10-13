# ZERO-EDGE natural caller check, 2026-10-13

## Question

The constant census found a ZERO-EDGE symbol in `BUFFER-HOLE` at constant
index 1. This follow-up asked whether a natural ZERO-EDGE entry in one
controlled painting returns directly into that candidate.

## Method and result

The pre-scene probe read only the current compiled headers for `BUFFER-HOLE`
and `ZERO-EDGE`; it did not call either function. The source-hashed runner
reported both headers with zero errors and truncations. Before arming the
breakpoint, the helper matched each full live payload to its unique PLL payload:

| Function | Live entry | Payload bytes | Payload SHA-256 | Exact PLL/live match |
|---|---:|---:|---|---|
| `BUFFER-HOLE` | `0x1fe12c3c` | 474 | `bdc811f0e8914d4cf6e0678e381e477070d28864c6b011e0aae94a42ff62cc98` | yes |
| `ZERO-EDGE` | `0x1fe03934` | 982 | `c08d6adc6b28253ef1ecce89233e69ca23c58f639015f6c95051970c5fbec736` | yes |

One hardware execute breakpoint at the fresh ZERO-EDGE entry observed no
entry before the AARON process ended; there is no return address or immediate
caller. The helper was configured with a 150-second maximum, but it did not
wait that long: the complete runner session lasted 32.837 seconds from its
recorded start to finish. Its `no-entry-within-deadline` label is bounded by
process exit or timeout, whichever comes first. This is a no-hit in the
selected scene, not proof that ZERO-EDGE is never called or that BUFFER-HOLE
is not a caller in another scene.

## Scope and controls

The selected run was `writer-stream-seed-1234`, `smallImage=false`, but the
AA0 header measured `320 480 148`. Fresh uninstrumented controls before and
after matched the observer across all six drawing/scene outputs and all six
staged scene sources. Keep this result separate from the earlier 768x1080
`IN-SUB-FRAME` caller run.

The static `BUFFER-HOLE` symbol reference remains a candidate relationship.
This capture did not add a JavaScript behavior contract or change the
progress-report counts. It does not characterize ZERO-EDGE arguments,
traversal, later entries, other canvases, or scene-level parity.

## Evidence

The portable source-bound report is
[`zero-edge-native-caller-20261013.json`](evidence/zero-edge-native-caller-20261013.json),
SHA-256 `a24bf6c48a59d4a95d82f8c3088064e7f33e4b32e28ae7cc6b4dacbaebaffd90`.
Two independent offline derivations were byte-identical. The successful
observer and its controls are under the ignored
`research/extracted/local-oracle/external-runs/` junction; the run files are
stored at `C:\AaronOracleRuns` to avoid duplicating the 21 MB planning trace
on D:.

## BUFFER-HOLE entry follow-up, 2026-10-13

REA 6.4.0's exact `BUFFER-HOLE` dossier has 170 instructions, a 465-byte
inferred body, 39 blocks, 32 calls, and 246 high-p-code operations. A targeted
query for `CALL dword ptr [EDI + 0x27]` at `0x1fe12d17` remains an unresolved
computed call with no targets. This static result does not connect the
constant-index-1 symbol reference to that call.

A separate live execute breakpoint targeted the freshly validated
`BUFFER-HOLE` entry `0x1fe12c3c`. The probe read both `BUFFER-HOLE` and
`ZERO-EDGE` headers with zero errors/truncations, and both complete live
payloads matched their unique PLL payloads. No `BUFFER-HOLE` entry occurred
before the process ended. The configured maximum was 90 seconds; the complete
runner session lasted 40.8 seconds. This establishes no entry in this process,
not a general absence of calls or a ZERO-EDGE caller. The source-bound
[capture helper](../tools/capture-buffer-hole-caller.ps1) and
[offline deriver](../tools/derive-buffer-hole-native-caller-evidence.mjs)
retain the validation steps.

The before control (`buffer-hole-canvas-control-20261013`), observer
(`buffer-hole-native-caller-observer-20261013`), and after control
(`buffer-hole-native-caller-control-after-20261013`) all measured
`320 480 148`. All six drawing/scene outputs and all six staged scene sources
match across the three runs. The source-bound combined [evidence](evidence/buffer-hole-native-investigation-20261013.json)
binds the REA and live results to 75 sources; two independent derivations are
byte-identical. Its SHA-256 is
`e44761e8508c63ece41978d3741bb6b3702b70be3aa6890e6a601971aad59178`.

## Next step

Before another 768x1080 caller attempt, run a fresh uninstrumented control and
read its AA0 header. The 2026-10-13 recheck completed with `smallImage=false`
but returned `320 480 148`; all six outputs and six staged sources exactly
match the prior source-bound 320x480 control. The run ID
`zeroedge768-before-20261013-a` is only a label and does not establish the
canvas size. Its complete output is retained under the ignored
`research/extracted/local-oracle/external-runs/` junction.

Do not arm the 768-only breakpoint unless that fresh control actually measures
768x1080. The earlier 768 triplet remains valid, and the reason it differs
from the current 320 regime is still unknown. A direct caller claim still
requires a fresh live entry hit and a return address inside an exact
live-validated payload.
