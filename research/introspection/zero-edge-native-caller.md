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

## Next step

Use REA's existing `BUFFER-HOLE` dossier and the earlier 768x1080 evidence to
choose a scene regime that can exercise the static candidate. Read the actual
AA0 header for every run; `smallImage=false` alone does not identify canvas
dimensions. A direct caller claim still requires a fresh live entry hit and a
return address inside an exact live-validated payload.
