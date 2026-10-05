# BRUSH-FILL input preparation

## Result, 2026-10-05

Two complete controlled paintings establish the natural plan/list/form route,
initial row and PATCH-EDGE walk budget. The independent adapter in
[`aaron-brush-fill-preparation.js`](../../engine/src/aaron-brush-fill-preparation.js)
matches every measured selection and row/budget input:

```text
form = SCRIPT(MPLAN)[SDEX].CFLIST[CDEX]
frame = naturally returned CFRAME(form)
initial SCAN-ROW = (frame.LX, frame.RX, frame.TY, PATCHDEX(form))
PATCH-EDGE MAX = 5 * ((frame.RX - frame.LX) + (frame.TY - frame.LY))
```

The differences have no inclusive-cell `+1`. MAX is not the latest natural
CFORM-COUNT: none of the 278 observed budgets equals that count. Original
SCRIPT/CFLIST lists, frame construction and patch labels remain inputs; this
does not recover plan creation or every BRUSH-FILL branch.

| Comparison | Seed 1234 | Seed 5678 | Total |
|---|---:|---:|---:|
| BRUSH-FILL parents / initial rows | 60 | 74 | 134 |
| SCRIPT argument EQ MPLAN | 8,545 | 9,725 | 18,270 |
| CFLIST argument selects SCRIPT[SDEX] | 8,545 | 9,725 | 18,270 |
| CFRAME argument selects CFLIST[CDEX] | 62 | 76 | 138 |
| Scan bounds / patch argument and value | 2,748 | 3,057 | 5,805 |
| PATCH-EDGE start EQ latest scan result | 95 | 183 | 278 |
| Frame-derived MAX | 95 | 183 | 278 |
| Ordinary subsequent row steps, Y−1 | 2,686 | 2,981 | 5,667 |
| Larger subsequent row steps | 2 | 2 | 4 |
| Observation preview checks | 42,833 | 48,772 | 91,605 |

All 42,761 recorded calls complete with zero observer errors/aborts and no
cap overflow. Complete AA0 and scene bytes equal fresh uninstrumented controls
in each mode. Preview checks prove observation extraction does not advance
the copied RNG preview; they do not assert that the original functions consume
no randomness.

## Later scan rows remain a separate target

Every parent's first row is TY. Most subsequent scans decrement Y by one.
Four measured exceptions follow positive scan results:

| Seed | Parent | Previous Y | Next Y | Frame LY | Difference |
|---|---:|---:|---:|---:|---:|
| 1234 | 40 | 402 | 386 | 388 | −16 |
| 1234 | 41 | 448 | 433 | 435 | −15 |
| 5678 | 43 | 448 | 443 | 445 | −5 |
| 5678 | 44 | 451 | 446 | 448 | −5 |

Each next row is LY−2 and follows a second natural CFRAME read. The observer
does not wrap FILL-IRIS, so these facts alone do not prove an iris enclosure
or establish the complete branch schedule. The JS adapter derives the initial
row only. The 15 positive scans that do not enter PATCH-EDGE remain explicit
in the separate scanner evidence.

## Observation and composition

Frozen v2 wraps only naturally invoked SCRIPT, CFLIST, CFRAME, SCAN-ROW and
PATCH-EDGE while BRUSH-FILL is active. Nested MY-FILL / BRUSH-FILL-SUBPART
getter events are excluded. Natural PATCHDEX returns retain their argument EQ
identity and integer label, without adding a reader call. Direct SLOT-VALUE
reads capture existing frame/point coordinates. EQ object IDs and complete
proper SCRIPT/CFLIST member lists establish selection; the parser retains
entry/return chronology. Wrappers preserve the original multiple values and
errors through cleanup.

The independently selected JS form preserves its projected object identity.
Derived row bounds and patch labels agree with all 5,805 earlier scanner
inputs and point returns. Derived budgets and scan starts agree with all 278
earlier PATCH-EDGE boundaries. The derivation reruns the aligned scanner →
PATCH-EDGE → LIST-FRAME → fill comparison, matching all 85,401,600 complete
output-map cell comparisons. Those comparisons link separate captures of the
same paintings; they are not one integrated BRUSH-FILL execution.

Earlier SUBFORM boundary roots requested SmallImage; preparation, scanner and
fresh controls did not. Both measured maps are 320×480 and full drawings/scenes
are identical. That cross-capture comparison does not establish general
equivalence of the setting. Original map history and natural form counts are
still required, as are FLASH-SPOT effects and subpart painting/clearing.

## Native support

The derivation revalidates the existing 2026-10-04 BRUSH-FILL live-window/PLL
match: payload offset 2,593,356, 1,986 bytes, SHA-256
`016b613a592e6f5cc18a7b6fc0d04264a9038c485fdb05b91c458464a59f0957`.
All 651 decoded instructions cover 1,978 matching payload bytes. Its constants
identify MPLAN/SCRIPT/NTHCDR/CFLIST/CFRAME and RX/LX/TY/LY/PATCHDEX.

The instruction interpretation places RX−LX and TY−LY in the budget sum,
multiplies by tagged `0x14` (fixnum 5), and supplies the result at PATCH-EDGE
call offset +0x422. SCAN-ROW call sites are +0x1c8 and +0x62e. This static
interpretation is corroborated by the complete natural input comparison.
This reuses an exact earlier standalone Ghidra report; it is not a new live
capture or a native REA provider session. The earlier scanner evidence retains
its separately verified canonical REA external records.

## Provenance and reproduction

Ignored local roots under `research/extracted/local-oracle/`:

- `brush-fill-preparation-seed1234-20261005-b` and fresh control
  `brush-fill-preparation-control-seed1234-20261005-c`.
- `brush-fill-preparation-seed5678-20261005-d` and fresh control
  `brush-fill-preparation-control-seed5678-20261005-e`.
- Existing `scan-row-seed1234-20261005-c`, `scan-row-seed5678-20261005-e`,
  `subform-boundary-seed1234-20261005-d`,
  `subform-boundary-seed5678-20261005-f`, and
  `brush-fill-native-code-seed1234-20261004-a`.

Observer SHA-256:
`6717298a2b31e12626ae5ca2bc8fbe21075ad7426bc914dff27d18783e957d6e`.
The complete raw preparation reports have SHA-256:

- 1234: `f7c559dfdc5e85aae7a3bb627ee6c1a0aec2ee4ab86aa0e6d16437e41f84a3dc`.
- 5678: `40863ce68bfa41aee60f016b8bc9ce6f296f7c0685a0b282d8f09e8b0da3abd6`.

An initial v1 seed-1234 run (`...-a`) also completed with unchanged drawing and
scene bytes. Its 19,995 calls nearly reached the 20,000 cap, so v2 raised that
cap to 60,000 and repeated both paintings with one frozen source. V1 is a
successful preliminary capture, not a rejected output mismatch.

Use the oracle staging/preflight rules in [oracle.md](../oracle.md). Run v2
with `-PreSceneProbePath research\introspection\brush-fill-preparation-capture.cl`
and `-ProbeOutputNames aaron-brush-fill-preparation.txt`; use fresh directories
and only one original oracle. Then run
`research/tools/derive-brush-fill-preparation-evidence.mjs` with the two
observed/control/scanner/boundary roots, native root and a fresh output path.

The [portable evidence](evidence/brush-fill-preparation-parity-20261005.json)
binds sources, staged requests, summaries, raw tapes, controls, complete native
mapping/instruction bytes and all cross-capture comparisons. Full original
maps/reports/runtime files remain ignored. Adapter input checks are JS policy,
not historical error parity: safe integer coordinates/indices and a safe
nonnegative computed budget are required; axis inversion is not independently
validated. Other indices, malformed lists, arbitrary frames and other paintings
remain uncharacterized.
