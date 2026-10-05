# `BRUSH-FILL` count and brush assignment

## Measured result, 2026-10-04

Follow-up: [POST-FILL count and map findings](post-fill-count.md) now locate
the internal writer and compare its independent SUBFORM helper against all
278 captured calls. The observations below remain the earlier boundary evidence.

Two complete controlled paintings establish the observed count-to-brush
boundary after the [native caller investigation](select-brush-caller.md).
Each of their 274 `SELECT-BRUSH` calls receives the `SUBP-COUNT` left by the
latest completed `MY-FILL(SUBFORM, CDEX, SDEX)` in the same `BRUSH-FILL`.
Every result matches the existing JavaScript integer selector.

At the next observed boundary in that fill, `BRUSH` is the exact selected
object, including NIL for a NIL result. Each non-NIL selection is followed
by one `BRUSH-FILL-SUBPART` and one nested `RECORD-BRUSH`. All 70 subpart and
record entries use the selected object; the observation uses original `EQ`
identity and also retains startup-list index and brush ID.

These are function-cell observations in these paintings. The earlier native
breakpoint evidence separately establishes the first selector's direct
caller. This capture does not measure every native transfer or characterize
other scenes.

| Observed boundary | Seed 1234 | Seed 5678 |
|---|---:|---:|
| `BRUSH-FILL` | 60 | 74 |
| `SCAN-ROW` | 2,748 | 3,057 |
| `LIST-FRAME` | 95 | 183 |
| `MY-FILL(CFORM, …)` | 67 | 82 |
| `MY-FILL(SUBFORM, …)` | 95 | 183 |
| `SELECT-BRUSH` | 93 | 181 |
| NIL selections | 70 | 134 |
| Non-NIL selections / subparts / records | 23 | 47 |
| `FILL-IRIS` | 2 | 2 |

The 95 and 183 subform calls are accounted for by 93 and 181 selector paths
plus two iris paths per scene. The iris paths have no subsequent selector in
their containing fill. The conditions choosing an iris path remain open.

## Count observations

`SUBP-COUNT` changes between entry and exit of 57/95 subform calls in seed
1234 and 124/183 in seed 5678. Their count ranges are 0–75,702 and 0–28,425.
Every subform returns one number, but that return is never its count after
the call. The selector consumes the binding, not the method's return value.
Subform returns can also be negative: the observed ranges are −5,675–3,004
and −34–29,171, unlike the nonnegative count binding.

The first seed-1234 subform has arguments `(SUBFORM 1 1)`, changes the count
from unbound to 7,131 and returns 302. Its selector returns brush 2. The next
subform changes 7,131 to 37 and returns 265; selection at 37 returns NIL.
The first seed-5678 subform `(SUBFORM 1 0)` leaves count 1,359 but returns
2,668; selection returns brush 1.

All 5,805 observed `SCAN-ROW` calls leave the count unchanged between entry
and exit. This does not rule out transient writes or indirect effects inside
the calls. Likewise, locating a change within `MY-FILL` does not locate the
specific instruction or callee that writes it.

All CFORM calls precede the containing brush fills (`fill=0`); the count
bindings remain unbound there. `CFORM-COUNT` is unbound as a scalar throughout
these captures. That says nothing about a callable accessor or per-form slot
with that name.

## Brush state

The selector itself leaves `BRUSH` unchanged. After its return, the next
observed boundary shows the selected value assigned in all 274 cases.
This includes all 204 NIL results, after which `BRUSH` is bound to NIL and
no corresponding subpart is observed.

The selected object remains identical throughout each `RECORD-BRUSH` entry
and exit. At subpart exit, identity is preserved in 17/23 and 43/47 cases.
For the other six and four cases, the selected brush was 2–5 and `BRUSH`
is brush 1 at exit. Thus the entry selection cannot be treated as a constant
binding throughout or after subpart painting. Subpart and record entry/exit
counts are unchanged in these scenes.

## Actual generic methods and native mapping

`MY-FILL` is a `STANDARD-GENERIC-FUNCTION`. Its live generated dispatcher
has zero complete matches in the archived PLL; it is not a recovered method
body. The dedicated adapter explicitly retains that failed match and maps
the six ordinary functions without relaxing the exact matcher.

Read-only CLOS enumeration finds exactly two `STANDARD-METHOD` objects, no
qualifiers, and these specializers:

| Capture name | Specializers | Arguments |
|---|---|---|
| `MY-FILL-METHOD-0` | `(EQL SUBFORM), T, T` | `WOT CDEX SDEX` |
| `MY-FILL-METHOD-1` | `(EQL CFORM), T, T` | `WOT CDEX SDEX` |

Each method function is an ordinary `COMPILED-FUNCTION`. Complete live object
bytes match one PLL object, including header and payload. Standalone Ghidra
12.1.4 decodes these and the six ordinary functions as Windows 32-bit x86:

| Function | PLL payload offset | Payload bytes | Reachable instructions |
|---|---:|---:|---:|
| `BRUSH-FILL` | 2,593,356 | 1,986 | 651 |
| `SCAN-ROW` | 2,625,748 | 354 | 137 |
| `LIST-FRAME` | 2,680,876 | 632 | 207 |
| `FILL-IRIS` | 2,636,700 | 1,384 | 459 |
| `BRUSH-FILL-SUBPART` | 2,569,156 | 842 | 293 |
| `SELECT-BRUSH` | 2,640,156 | 328 | 115 |
| `MY-FILL-METHOD-0` | 2,354,276 | 154 | 60 |
| `MY-FILL-METHOD-1` | 2,354,436 | 392 | 146 |

Neither method's constants contain `SUBP-COUNT`; no direct named count store
was identified in these bodies. The SUBFORM method's slot 5 is
`FILL-STRATEGY`, loaded at +77 before a computed call at +82. Slot 7 is
`POST-FILL`, loaded at +122 before the computed call at +127. The CFORM
method has corresponding slots 12 and 14 with calls at +315 and +353.

Those sites are **static candidates**, derived from measured constants and
exact instructions. They do not establish named native callee entries. The
Ghidra compiler specification does not model Allegro's tagged values or
register calling convention. Full decompiler output remains ignored.

## Capture, controls and provenance

Retained observed runs are `brush-fill-natural-20261004-f` (seed 1234,
`writer-stream-seed-1234`) and `brush-fill-natural-20261004-d` (seed 5678,
`writer-full-seed-5678`). Both use the same final v2 observer, SHA-256
`76f375e5027da098b484e2eccdd1b31385a849c13610b6ad0f843aaccf95d6bd`.
Fresh controls are `brush-fill-control-20261004-g` and
`brush-fill-control-20261004-e`, respectively.

Both complete AA0 files and scene reports match their corresponding controls
**byte for byte**:

| Seed | AA0 SHA-256 | Scene report SHA-256 |
|---|---|---|
| 1234 | `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1` | `a2f17602ba33d0ac1b80544c1a70c0ae657c60dad9110c075f9ce43b21e8b415` |
| 5678 | `0ab08c23b241edd0f877c836e4f42fb0497108b8def8c32541ce165157563086` | `e3cc50bef1636328f94e6b002271a663668740f16f3c5b2677a7aa5813008053` |

The native six-function run `brush-fill-native-code-20261004-a` and final
method run `brush-fill-methods-20261004-k` also match the seed-1234 control.
The method report finishes with two methods, zero errors and zero
truncations. Earlier method reports h/i/j contained reporting errors; their
END markers alone are not accepted as successful method evidence. They were
released and retained only as ignored diagnostics. The earliest natural
prototype a failed to load because of a delimiter error; it is also excluded.

The observer preserves original arguments, multiple return values, and
non-local exits. It buffers a bounded tape and only accepts normal MAIN
completion with all calls paired, zero observation errors/aborts, no overflow
and an empty stack. CAPS declarations, integer token syntax, record phases
and typed data shapes are checked by the offline non-evaluating parser.

Event, count and brush observations are complete **within the eight wrapped
boundaries**. Geometry is deliberately partial: list prefixes stop at 128
items, nesting at three levels, and opaque objects expose their type only.
The two reports contain 37/31 truncated argument lists and 7,333/10,084
opaque object summaries. These cannot reconstruct a fill map or region.

The portable record is
[`brush-fill-count-and-assignment-20261004.json`](evidence/brush-fill-count-and-assignment-20261004.json).
Its derivation binds captured AA0/scene hashes to complete run summaries,
compares actual control bytes, redoes full PLL matches and checks Ghidra
subject hashes, addresses and instruction bytes. It retains every selector's
count, producer and assignment observation. Optional natural-report digests
are computed during offline derivation; the original runner summary did not
independently hash those optional report bytes. This is recorded explicitly.

No engine implementation or unit tests were changed or run for this milestone.
The original observations, offline comparisons and syntax checks supplied
the evidence. The system clock was unchanged.

## Reproduction and next step

See [the native workflow](../native-analysis-workflow.md) and
[oracle staging rules](../oracle.md#ctemp-staging-and-permissions).
Run only one original oracle at a time with fresh output directories.
For a natural observation use `-PreSceneProbePath
research\introspection\brush-fill-natural-capture.cl` and declare
`-ProbeOutputNames aaron-brush-fill-natural.txt`; no pause is needed.
Use the same scene mode for its fresh control, omitting these two parameters.

Parse a saved report into a fresh ignored file with
`node research/tools/parse-brush-fill-report.mjs <report.txt> <fresh.json>`.
The portable derivation command is:

```text
node research/tools/derive-brush-fill-evidence.mjs <AARON.pll> <native-run> <observed-1234> <control-1234> <observed-5678> <control-5678> <fresh-evidence.json> <methods-run>
```

The next count-producing candidate is the call associated with `POST-FILL`
inside MY-FILL's SUBFORM method, alongside `FILL-STRATEGY` and its other
callees. Determine the helper arguments and types,
inspect any generic methods and trace count changes across
those boundaries; do not attribute
the writer solely from ordering or constants. Capture the complete relevant
frame/map inputs before deriving a count algorithm. The full count policy,
iris condition, subpart brush changes and integrated JavaScript caller
remain unrecovered.
