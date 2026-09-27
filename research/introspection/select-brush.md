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

This is an observed input/output specification, not recovered source code or
assembly. Fractional and non-number inputs were not tested. The nearby negative
and above-range samples returned brush 6, but the JavaScript tail behavior
outside those samples remains an inference.

In the natural scene trace, `SELECT-BRUSH(7131)` returned brush ID 2, and a
later `RECORD-BRUSH` snapshot showed ID 2 bound to `BRUSH`. The trace places
`ASSIGN-COLORS` before `SELECT-BRUSH`, but `ASSIGN-COLORS` has already exited
when `SELECT-BRUSH` enters; it therefore does not establish `ASSIGN-COLORS` as
the direct caller. The function-constant report lists references to
`ALL-BRUSHES`, `ENVIR`, and `COMMON-GRAPHICS:ID`, but does not identify called
functions. A stack-aware trace is needed to establish the caller; helper calls
inside the compiled function also remain unknown.

See [`scene-context-findings.md`](../scene-context-findings.md) for the natural
scene observations and [`stroke-findings.md`](../stroke-findings.md) for the
related brush pipeline work.
