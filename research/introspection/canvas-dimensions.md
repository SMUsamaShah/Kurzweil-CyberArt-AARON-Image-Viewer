# AARON canvas-size context

Updated 2026-10-13. This records two source-bound outcomes from the same
controlled **writer-stream-seed-1234** mode. It keeps the 320x480 and 768x1080
runtime contexts separate because the cause of their difference is still
unknown.

The [portable evidence](evidence/canvas-size-native-links-20261013.json)
revalidates the earlier 320x480 capture's 75-source closure and binds the
current 768x1080 observer to fresh uninstrumented controls before and after.
The deterministic derivation is
[derive-canvas-size-evidence.mjs](../tools/derive-canvas-size-evidence.mjs).

## Observed boundary values

In both regimes, SET-UP-SCREEN-SIZE enters with
*SCREEN-WIDTH*=640, *SCREEN-HEIGHT*=480,
SMALL-IMAGE-SCREEN-WIDTH=640, and
SMALL-IMAGE-SCREEN-HEIGHT=480. *PIC-WIDE*, *PIC-HIGH*, and A-WIDTH
through E-WIDTH are unbound at that boundary.

After SET-UP-SCREEN-SIZE, the captured states differ:

| State after SET-UP-SCREEN-SIZE | 320x480 regime | 768x1080 regime |
|---|---:|---:|
| *SCREEN-WIDTH* | 640 | 1920 |
| *SCREEN-HEIGHT* | 480 | 1080 |
| SMALL-IMAGE-SCREEN-WIDTH / -HEIGHT | 640 / 480 | 640 / 480 |
| *PIC-WIDE* | unbound | unbound |
| *PIC-HIGH* | 1080 | 1080 |
| A-WIDTH, B-WIDTH, C-WIDTH, D-WIDTH, E-WIDTH | 320, 320, 320, 320, 320 | 487, 650, 768, 866, 900 |

SELECT-CANVAS receives the same observed ACLWIN::SQUARE argument. Its
captured result is 320x480 in the first regime and 768x1080 in the second.
Both runs report smallImage=false. The first observed state difference is
therefore at the exit boundary of SET-UP-SCREEN-SIZE; this probe does not
show which instruction or external call inside that function caused it.

The current Windows display query reported DISPLAY1 at 1920x1080 and the
fresh current runs produced 768x1080. An earlier 320x480 source-bound run was
also recorded with a 1920x1080 desktop. That makes desktop dimensions alone an
insufficient explanation. No display setting was changed for these captures.

## Capture controls

The new 768x1080 set is:

- Before control: canvas-dimensions-control-20261013-a
- Observer: canvas-dimensions-observer-20261013-b
- After control: canvas-dimensions-control-20261013-c

Each runner summary is complete. The observer's exact final line is
END canvas-size-native-links; it also reports READY, a released native
capture handshake, two selected functions, zero errors, and zero truncations.
The AA0, image, image ID, scene snapshot, planning trace, loaded-seed record,
and six staged scene source files match across all three runs. The observer
uses a probe loader in its runtime copy; the evidence checker verifies that
this is the only intentional runtime-copy difference and that all other
runtime files match.

The 320x480 comparison is the completed
[BUFFER-HOLE native investigation](evidence/buffer-hole-native-investigation-20261013.json).
Its fresh before/observer/after controls also match those six outputs and
six staged scene sources. The old 320x480 and current 768x1080 traces have the
same runner, installer, registry patch, and license patch hashes. They remain
separate runtime contexts, not one universal default.

The first native-code capture's scene run had an invalid terminal marker and
is excluded from scene/control claims. Its static reports are reused only
because the complete current capture revalidated both exact payload hashes.

## REA and native mapping

The current observer read the live compiled-function headers and bounded
native windows for both routines, without writing to the original process.
The exact live objects each match one complete object in the preserved PLL:

| Routine | Live entry | Payload bytes | Payload SHA-256 | REA 6.4 instructions / blocks |
|---|---:|---:|---|---:|
| SET-UP-SCREEN-SIZE | 0x1fdc0df4 | 1,140 | 0dfceed21e987c82f2030af66bc2e0879493f9bc28ab7af01d466b5a449768ea | 366 / 121 |
| SELECT-CANVAS | 0x1fdfba04 | 462 | 2b2bd8b47cfeabbb3594770dc66c862a71eb7c904057a1cba073c8a0f475c0a4 | 155 / 48 |

The exact instruction counts also match the Ghidra 12.1.4 reports. The REA
function dossiers expose many indirect dispatch instructions such as
CALL dword ptr [EDI + offset] and CALL EDI. Their targets remain
unresolved, so REA does not identify a Win32 display API or the original Lisp
caller here. The synthetic PE inputs were used only for static REA queries;
the evidence records that they were never executed. Ghidra's inferred
signature and the generated PE layout do not establish the Lisp ABI or source.

This adds two original-only bounded function observations, not JavaScript
contracts. It does not change the 30 routine names / 31 contract units,
the 1-of-5 execution-plan milestone count, or the zero whole-painting parity
results in the [progress report](../progress-report.md).

## Current-regime recheck, 2026-10-13

A fresh uninstrumented `writer-stream-seed-1234` run completed under the
retained run ID `zeroedge768-before-20261013-a`. The ID was chosen for a
planned 768x1080 caller attempt; the actual AA0 header measured `320 480 148`
with `smallImage=false`. Its AA0 hash is
`0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1`, and its
scene-report hash is
`a2f17602ba33d0ac1b80544c1a70c0ae657c60dad9110c075f9ce43b21e8b415`.
The runner, installer, registry patch, and license patch hashes match the
earlier 320x480 capture. All six drawing/scene outputs and all six staged
scene sources are byte-identical to the source-bound
`buffer-hole-canvas-control-20261013` run. The complete local capture is under
`research/extracted/local-oracle/external-runs/zeroedge768-before-20261013-a/`.

Because this fresh no-probe control returned 320x480, the 768-only
ZERO-EDGE breakpoint was not armed. The earlier 768x1080 observer triplet
remains valid, but it was not reproduced in this run and its cause remains
unknown. Do not use the run ID or `smallImage` flag as a substitute for the
AA0 dimensions.

Resume the larger-canvas caller attempt only after a fresh no-probe control
actually measures 768x1080. Until then, continue with runtime questions that
are measurable in the repeatable 320x480 context. The 320x480 ZERO-EDGE
attempt remains a bounded no-hit, not evidence of a general absence of calls.

### Later regime recheck, 2026-10-13 02:51 UTC

The subsequent `writer-stream-seed-1234` FREE-PATH triplet measured
768×1080 in all three AA0 files (`smallImage=false`). The uninstrumented
controls and post-MAIN observer match across six drawing/scene outputs and six
ordinary staged Lisp sources. The earlier 320×480 captures remain separate;
the display regime can change between runs, so read each AA0 header before
arming a dimension-specific native breakpoint. The portable comparison and
capture details are in
[`free-path-boundaries.md`](free-path-boundaries.md) and its
[evidence](evidence/free-path-boundaries-20261013.json).
