# POST-FILL count writer

## Measured helper boundary, 2026-10-05

The count writer is now located inside the SUBFORM method of `POST-FILL`.
The thirteen-boundary observer captured two complete controlled paintings:

| Observation | Seed 1234 | Seed 5678 |
|---|---:|---:|
| MY-FILL / POST-FILL pairs | 162 | 265 |
| SUBFORM pairs | 95 | 183 |
| CFORM pairs | 67 | 82 |
| SUBP-COUNT entry/exit changes in SUBFORM | 57 | 124 |
| SELECT-BRUSH calls using the completed POST-FILL count | 93 | 181 |
| FLASH-SPOT calls observed | 13,526 | 14,524 |

Every MY-FILL call has one POST-FILL child with the same arguments, return
values, and before/after SUBP-COUNT and scalar CFORM-COUNT bindings. Every
SUBFORM call is within BRUSH-FILL. CFORM calls are outside those brush fills,
with both scalar count bindings unbound. CFORM-COUNT is also a function used
by POST-FILL; an unbound scalar does not imply an absent object count.

`SET-MEDIANS`, `GOOD-START`, `FILL-STRATEGY`, and `FLASH-SPOT` show no entry/exit
count changes. This does not exclude temporary changes inside them. The
parent relationships are measured wrapper nesting; they are not a new native
breakpoint experiment.

Both observed AA0 files and scene reports match their fresh same-mode controls
byte for byte. The helper tapes have no observation errors, aborts, overflow,
missing returns, or leftover stack frames. Argument geometry remains bounded:
37/31 truncated lists and 7,495/10,349 opaque objects in the respective tapes.

## Exact compiled methods

Read-only enumeration finds two unqualified POST-FILL methods: EQL SUBFORM
and EQL CFORM, followed by two COMMON-LISP:T specializers. Their argument
lists are WOT, CDEX, SDEX. Both method bodies are ordinary COMPILED-FUNCTION
objects. The generated generic dispatcher is excluded from this capture.

| Object | PLL payload offset | Payload bytes | Reachable instructions |
|---|---:|---:|---:|
| POST-FILL SUBFORM method | 2,352,068 | 1,240 | 431 |
| POST-FILL CFORM method | 2,353,316 | 954 | 339 |
| FILL-STRATEGY | 2,622,588 | 1,208 | 444 |
| SET-MEDIANS | 2,548,044 | 164 | 64 |
| GOOD-START | 2,642,292 | 798 | 266 |
| FLASH-SPOT | 2,252,796 | 42 | 15 |

All six have unique complete live-object byte matches in the structurally
indexed PLL. Ghidra decoded the exact payloads as x86 Windows code and
completed all six decompilations. Inferred C types and expressions do not
recover the Allegro calling convention or Lisp source.

The SUBFORM method's measured constant slot 1 is SUBP-COUNT. At offsets
+42/+45/+47, the native code loads that symbol, zeros a register and stores
zero into its value slot. On the accepted-cell branch, +1123 adds tagged unit
4, then +1127/+1130/+1132 supplies the same symbol and result to a runtime
store helper. This static evidence, combined with the complete natural count
transitions, locates the writer within the method rather than just its outer
generic invocation.

Measured constant slot 18 is PATCHDEX. The computed reader call at +707 is
followed by a comparison with the current patch cell at +723 and a branch for
unequal values at +726. The method also references SUB-FRAME, LX/RX/LY/TY,
FILL-MAP, PATCH-MAP, FLAG-BIT and the CFORM-COUNT reader/setter.

REA 3.2.1 imported and exported one canonical external evidence record for
the SUBFORM Ghidra report. Its provider is `ghidra-standalone`, and
`rea_native_provider_session` is false. This validates record identity and
format; it does not authenticate the standalone analysis.

## Count and map rule reproduced in JavaScript

The independent [SUBFORM helper](../../engine/src/aaron-post-fill.js) now
matches every captured SUBFORM call in both paintings. Each comparison starts
from the original map region, integer frame, FLAG-BIT and naturally read
PATCHDEX/CFORM-COUNT values. JavaScript computes its own count and map changes.

| Comparison | Seed 1234 | Seed 5678 |
|---|---:|---:|
| SUBFORM calls | 95 | 183 |
| Map cells compared, both maps | 614,248 | 516,566 |
| Accepted cells counted | 137,412 | 97,937 |
| Positive cells rejected/cleared | 2,517 | 445 |
| No positive scan cells / no PATCHDEX call | 46 | 67 |
| Count range | 0–75,702 | 0–28,425 |
| Return range | −5,675–3,004 | −34–29,171 |

All 278 counts and returns agree. Every one of the 1,130,814 captured output
map cells agrees. Frame/map object identities are preserved. Both map tapes
complete with zero errors, aborts, overflow or unmatched calls; their complete
AA0 files and scene reports equal the same-mode controls byte for byte.

The observed rule resets the count, scans Y from LY through TY and X from LX
through RX inclusively, and ignores zero fill cells. A positive fill cell
with a different patch ID is cleared. A matching cell is counted and its
patch value becomes `patchId + flagBit`. The returned remaining-count result
is the natural CFORM-COUNT reader value minus the new count. The JavaScript
helper mutates the two maps and returns both numbers; it does not resolve or
update an original form object.

Both scenes exercise only fill values 0 and 1, FLAG-BIT 32,768, and nonempty
integer frames in 320×480 maps. The native value-2-to-1 conversion is implemented
but remains inferred until a separate original holdout exercises it. Other
fill values, flags, frame kinds and adapter validation errors are unmeasured.
The probe includes one extra right-hand X column where it fits. Map cells
outside the declared rectangles are not captured or claimed as compared.

Scene planning, frame construction, pre-fill map contents and form identifiers
remain original inputs. CFORM POST-FILL, iris branching, subpart brush changes
and the integrated BRUSH-FILL caller remain separate work. Next, characterize
FILL-STRATEGY's map production so fewer inputs come from the original runtime.

### Rejected first map attempt

Run `post-fill-maps-20261005-f` has one FILE-ERROR followed by 379
UNBOUND-VARIABLE observation conditions, no serialized map runs and a changed
AA0. Its runner summary says complete, but the probe says incomplete; it is
excluded from the comparison. The missing LOOP/autoload hypothesis is
consistent with earlier runtime logs. Replacing the two LOOP forms with
DOTIMES removed the errors and restored control equality. The condition types
alone do not identify the exact missing file. A later reporting correction
also keeps a per-call reader overflow marked as an error.

## Reproduction and provenance

See [the oracle staging rules](../oracle.md#ctemp-staging-and-permissions) and
[the native workflow](../native-analysis-workflow.md). Use fresh output roots,
one original oracle at a time, and leave the system clock unchanged.

The helper observer is [brush-fill-helper-capture.cl](brush-fill-helper-capture.cl).
Declare output `aaron-brush-fill-helpers.txt` with no pause. Controls omit the
observer. Both observed seeds use source SHA-256
`e585551d2ffe738c466c05dc8115075bed3d01e95d3dc06f4ef873fe2060fbf7`.

The metadata probe is [brush-fill-helper-links.cl](brush-fill-helper-links.cl).
Declare `aaron-brush-fill-helper-links.txt` with a positive owned pause. Require
five targets, two methods, six code headers, zero errors and zero truncations.
The capture helper uses `-ExpectedFunctionCount 6` and
`-MetadataEndMarker 'END brush-fill-helper-links'`. Its source SHA-256 is
`e1cd9e3b6650f51bb1910ebaa2c746427781ed8975477ed381a103978362ef1c`.

Retained local runs are `brush-fill-helpers-20261005-a` and
`brush-fill-helpers-20261005-d`; fresh controls are
`brush-fill-helpers-control-20261005-b` and
`brush-fill-helpers-control-20261005-e`. The native run is
`brush-fill-helper-native-20261005-c`, which also matches the seed-1234 control.

The portable derivation rechecks actual AA0/scene control bytes, staged source
hashes, every complete PLL match, every decoded instruction's bytes and
address, helper pairing, count transitions, selector inputs and REA identity.
Optional tape hashes are offline derivation digests; the runner summary does
not independently hash those optional reports. Raw reports, code windows,
payloads, decompiler text and REA bundles remain ignored.

The retained [helper evidence](evidence/post-fill-helper-boundaries-20261005.json)
has SHA-256 `e6971b8f2bf47ed064d600ece10cb007aa4cb4fb532c61e239031507101e9ad5`.

```text
node research/tools/derive-brush-fill-helper-evidence.mjs <AARON.pll> <helper-native-run> <observed-1234> <control-1234> <observed-5678> <control-5678> <fresh-evidence.json>
```

The exact map observer is [post-fill-map-capture.cl](post-fill-map-capture.cl),
source SHA-256 `46057db3ea8c25e0f68bcb038314708ead6125b3491137c34037f2bb81bcde13`.
Declare `aaron-post-fill-maps.txt`, use no pause, and allow 300 seconds. It
wraps natural POST-FILL/PATCHDEX/CFORM-COUNT calls, preserves multiple values,
and takes complete bounded RLE snapshots. It makes no extra PATCHDEX or
CFORM-COUNT calls. Final runs are `post-fill-maps-20261005-i` and
`post-fill-maps-20261005-j`, compared with controls b/e above. Earlier g/h
captures also match, before the overflow-reporting correction.

The retained [map evidence](evidence/post-fill-map-parity-20261005.json) has
SHA-256 `70e74d2c95708951b457b99088a5d0566e73bcaf7ee581cf7d8df577f82ec1d2`.

```text
node research/tools/parse-post-fill-map-report.mjs <aaron-post-fill-maps.txt> <fresh-normalized.json>
node research/tools/derive-post-fill-map-evidence.mjs <map-observed-1234> <control-1234> <map-observed-5678> <control-5678> <helper-evidence.json> <fresh-map-evidence.json>
```
