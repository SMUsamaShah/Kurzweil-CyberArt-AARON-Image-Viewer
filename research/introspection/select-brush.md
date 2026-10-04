# `SELECT-BRUSH`

## What is known

`SELECT-BRUSH` is an internal compiled function in the `COMMON-GRAPHICS-USER`
package. Its recorded argument list is `(COUNT)`. It returns either `NIL` or
one of the `PAINT-BRUSH` objects held in `ALL-BRUSHES`.

For every integer `COUNT` from 0 through 200,000, inclusive, the original
function produced these results:

| `COUNT` | Result |
|---:|---|
| 0–100 | `NIL` |
| 101–3,000 | brush ID 1 |
| 3,001–8,000 | brush ID 2 |
| 8,001–16,000 | brush ID 3 |
| 16,001–60,000 | brush ID 4 |
| 60,001–120,000 | brush ID 5 |
| 120,001–200,000 | brush ID 6 |

The startup profile with ID 0 exists, but `SELECT-BRUSH` returns `NIL` for
0–100 in the tested domain. The JavaScript implementation of the measured
integer behavior is in `engine/src/aaron-brushes.js`.

## How it was measured

The local Windows oracle saved the original compiled function before installing
the tracing wrapper. Once the normal seed-1234 run reached its first
`STORE-IN-FILE` call, the probe invoked that saved function directly for every
integer from 0 through 200,000. The run completed with the same AA0 output hash
as the baseline: `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1`.

The probe recorded one return value per call. It found no unknown return
objects, errors, or conditions. Random state, the global `BRUSH` binding, and
the startup brush profiles remained unchanged over the sweep. Fifty-two extra
integer samples checked boundary interiors and nearby negative and above-range
inputs; those samples also returned one value each without changing random
state or `BRUSH`. They do not characterize the entire out-of-range domain.

The compact result is stored in
[`select-brush-domain-seed1234-20260927.json`](evidence/select-brush-domain-seed1234-20260927.json).
The probe and fixture parser are
[`scene-state-snapshot-select-brush-matrix-seeded-1234.cl`](scene-state-snapshot-select-brush-matrix-seeded-1234.cl)
and [`derive-select-brush-domain.mjs`](../tools/derive-select-brush-domain.mjs).
The JavaScript test checks all 200,001 captured inputs against the result bands.

## Scope and next link in the call path

The integer-domain result is an observed input/output specification.
Fractional and non-number inputs were not tested. The nearby negative
and above-range samples returned brush 6, but the JavaScript tail behavior
outside those samples remains an inference.

In the natural scene trace, `SELECT-BRUSH(7131)` returned brush ID 2, and a
later `RECORD-BRUSH` snapshot showed ID 2 bound to `BRUSH`. The trace places
`ASSIGN-COLORS` before `SELECT-BRUSH`, but `ASSIGN-COLORS` has already exited
when `SELECT-BRUSH` enters; it therefore does not establish `ASSIGN-COLORS` as
the direct caller. The function-constant report lists references to
`ALL-BRUSHES`, `ENVIR`, and `COMMON-GRAPHICS:ID`, but does not identify called
functions.

A follow-up attempted Allegro's `TRACE :show-stack` option. The oracle runtime
could not load `trace.fasl` (`"trace.fasl" does not exist, cannot load`), and
the `:autozoom` module was also unavailable. The remaining wrapper trace shows
`SELECT-BRUSH` inside `DISPLAY-COLOR-PATCHES`, then `MAIN`, `DOIT`, and
`RUN-AARON`; it does not prove which function directly calls the selector.
Allegro documents the stack-printing option in its
[debugging reference](https://franz.com/support/documentation/debugging.html),
but the archived runtime lacks the module needed to use it here. The direct
caller remained unknown at that checkpoint.

The caller-instrumented run produced AA0 hash
`042d0d37489a6d14434c788ff482c3230da3b728887a102ca1747f2d521a50e3`, which
differs from the controlled seed-1234 hash. A fresh transition control using
the same `C:\temp` symlink produced the established hash
`0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1`. Treat
that earlier caller-probe output as diagnostic only, not parity evidence.

### Native caller confirmation, 2026-10-04

Two fresh runtime hardware-breakpoint captures now establish
`DISPLAY-COLOR-PATCHES → BRUSH-FILL → SELECT-BRUSH` for the first selector
entry in the seed-1234 scene. All five selected named native objects matched
the complete PLL byte for byte. The selector's immediate return address was
`BRUSH-FILL +0x68c`, after the decoded indirect call at `+0x68a`; the caller's
frame returned to `DISPLAY-COLOR-PATCHES +0x35a`.

Both new caller runs matched a fresh control's AA0 and scene-state report
byte for byte. This resolves the measured direct caller while leaving other
branches and the full brush-filling policy open. The detailed evidence and
limits are in [select-brush-caller.md](select-brush-caller.md), with reproducible
commands in [native-analysis-workflow.md](../native-analysis-workflow.md).

See [`scene-context-findings.md`](../scene-context-findings.md) for the natural
scene observations and [`stroke-findings.md`](../stroke-findings.md) for the
related brush pipeline work.
