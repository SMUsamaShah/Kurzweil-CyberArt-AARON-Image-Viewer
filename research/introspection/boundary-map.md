# Boundary-map writes and clears

## Measured comparisons, 2026-10-05

`WRITE-LIST-TO-FILL-MAP` and `CLEAR-FILL-MAP` now have independent JavaScript
implementations matching every natural call in two complete controlled
paintings. The final observer captures every FILL-MAP cell before and after
each call, rather than a bounded region.

| Comparison | Seed 1234 | Seed 5678 |
|---|---:|---:|
| WRITE-LIST-TO-FILL-MAP calls | 67 | 82 |
| CLEAR-FILL-MAP calls | 23 | 47 |
| Complete writer list positions | 21,399 | 14,506 |
| Output cell comparisons across all calls | 13,824,000 | 19,814,400 |
| Cells changed across all calls | 55,641 | 43,637 |
| Repeated coordinates in writer lists | 479 | 173 |
| Composed CFORM preparation cases | 67 | 82 |
| Composed strategy-region output cells | 857,347 | 438,570 |
| Map / frame-slot random-preview checks | 180 / 46 | 258 / 94 |

Both observed AA0 files and scene reports equal fresh same-mode controls byte
for byte. Every helper returns one NIL value and preserves the fill-map object
identity. Both reports complete with zero observation errors, aborts,
overflow or unmatched calls. The 33,638,400 output cell comparisons sum full
320×480 maps across 219 calls; these are repeated observations of positions,
not that many unique pixels. All 31,518,988 comparisons outside the selected
frame or list coordinates are unchanged, including 40,052 nonzero cells.

The implementation is [aaron-boundary-map.js](../../engine/src/aaron-boundary-map.js).
[Portable evidence](evidence/boundary-map-parity-20261005.json) retains
per-call arguments, frame slots or point-list digests, map hashes, counts,
control provenance and the composed comparisons.

## 1. WRITE-LIST-TO-FILL-MAP assigns the supplied value

Metadata identifies arguments `(LIST VAL)`. For each point, the native integer
path checks `0 <= X <= *PIC-WIDE* - 1`, then
`0 <= Y <= *PIC-HIGH* - 1`, before assigning VAL at FILL-MAP[X,Y]. The native
code advances the list without an interpolation loop. The JS adapter uses
the established Allegro array offset `x * height + y`.

All 149 natural calls use VAL=2. All 35,905 list positions contain VISPT
objects with integer coordinates inside the 320×480 picture. List lengths
range from 9 to 4,559 in seed 1234 and 5 to 1,089 in seed 5678. Natural X/Y
wrappers observe two calls to each accessor per accepted point: the guard
and the store path. No extra X/Y calls are made by this observer.

There are 652 repeated coordinates, from distinct point objects; no point
object repeats within its list. Their final cell value remains 2. The rule
is assignment, with no additional change to coordinates absent from the
list. Previously set value-2 cells remain 2. The list order and point
identities are retained. Seed 1234 exercises X=0 and X=319, and both scenes
exercise Y=0 and Y=479. The observed footprint includes those picture edges.

Every writer call is enclosed by `MY-FILL(CFORM, CDEX, SDEX)` in the captured
wrapper tree. Each CFORM MY-FILL has exactly one writer call; none of the
278 SUBFORM MY-FILL calls has one. This is a measured enclosure, not proof of
the direct native caller through every unwrapped helper.

The native guards support skipping out-of-picture integer points, and the
adapter implements them. The natural paintings contain no rejected point,
so that branch remains static interpretation. Other VAL inputs, noninteger
coordinates, alternative point types and original error behavior remain
unmeasured. Writer entry maps contain values 0 and 2 in these observations.

## 2. CLEAR-FILL-MAP zeros an inclusive frame rectangle

Metadata identifies `(CDEX SDEX)`. The native constants name MPLAN, SCRIPT,
NTHCDR, CFLIST and CFRAME before the four frame slot symbols and the map
store. The selected MAPFRAME comes from the program's own natural CFRAME
call. Its integer LX/RX/LY/TY slots are observed directly with SLOT-VALUE;
their values on that captured frame remain unchanged at helper exit. The
observer forwards the exact frame object returned by CFRAME.

The matched effect is:

```text
for x from LX through RX, inclusive:
    for y from LY through TY, inclusive:
        FILL-MAP[x,y] = 0
return NIL
```

All 70 calls are enclosed by BRUSH-FILL-SUBPART with the same CDEX/SDEX, one
clear per subpart. All 2,084,159 selected rectangle cells are zero afterward.
Cells outside each rectangle retain their complete original values.
For example, the first seed-1234 clear uses LX=228, RX=319, LY=0 and TY=92.

Nonzero cells on all four sides become zero in the original outputs.
Summed per side, the two paintings include 441 such LX cells, 130 RX cells,
410 LY cells and 464 TY cells; corners can contribute to two side counts.
The far-edge changes distinguish inclusive clearing from an exclusive upper
bound. Before the clears, values 0, 1, 2 and 3 occur. The originals clear
64,259 value-3 cells, 572 value-2 cells and 524 value-1 cells. There is no
value-specific preservation branch in the matched clear rule.

All observed frames are ordered and inside the map. Empty/inverted frames,
out-of-map bounds, other slot types and original errors are unmeasured. The
adapter validates an in-map integer frame; it does not reproduce the
SCRIPT/CFLIST selection that resolves CDEX/SDEX. PATCH-MAP and other helper
side effects were not captured. This milestone does not locate the producer
of the value-3 cells seen at clear entry.

## 3. A composed CFORM preparation sequence now matches

The new complete MY-FILL argument sequence is aligned with the retained
[fill-preparation captures](fill-preparation.md). For all 149 CFORM cases,
the complete writer point sequence, point identities and coordinates equal
the original outline before GOOD-START. The independently produced writer
map equals the original FILL-STRATEGY input throughout its captured region.

The derivation then composes the four JS functions:

`WRITE-LIST-TO-FILL-MAP → SET-MEDIANS → GOOD-START → FILL-STRATEGY`.

It starts from the original writer entry map and point list plus the original
frame LY/TY inputs, computes its own boundary assignments, median rows,
rotated outline and column scans, and matches all 149 original outputs and
1,295,917 strategy-region cell comparisons. The original intermediate map,
medians and rotation are comparison targets, not replacement inputs.

This linkage uses two separate observations of each same controlled painting,
aligned by every MY-FILL argument and complete CFORM point sequence. Its
strategy comparisons cover the previously captured bounded regions;
the new two boundary helpers cover their whole maps. CFORM POST-FILL,
SUBFORM initial map production and the integrated MY-FILL/BRUSH-FILL caller
remain separate work. Creating the frame, point lists and writer entry map
is still required for generation from a seed.

## Exact native objects and REA provenance

Both targets have unique complete live-object matches in the original
AARON.pll. The final derivation recomputes those matches from the preserved
memory windows and the actual PLL, validates every reported instruction's
bytes against its payload, and checks completed standalone Ghidra reports.

| Function | PLL payload offset | Payload bytes | Instruction bytes compared | Reachable instructions |
|---|---:|---:|---:|---:|
| CLEAR-FILL-MAP | 2,504,588 | 420 | 412 | 153 |
| WRITE-LIST-TO-FILL-MAP | 2,613,028 | 432 | 423 | 155 |

Native integer comparisons use tagged fixnums; raw increments of four mean
an integer step of one. The native bounds and assignment paths informed the
candidates. Original before/after maps establish the behavior comparisons
above. Ghidra's guessed C ABI and return types are not recovered Lisp source.
Normal returns are established by the natural captures.

REA 3.2.1 successfully imports and exports both standalone reports with the
`ghidra-standalone` provider and `rea_native_provider_session: false`. The
derivation checks the complete canonical record, subject and report hashes.
This validates external evidence records; it does not authenticate Ghidra's
analysis or mean REA's unsupported Windows native provider ran.
Runtime addresses belong to this capture only. No debugger was attached and
the machine clock was not changed.

## Observer correction and reproduction

The initial whole-map run `boundary-map-20261005-e` preserves AA0/scene bytes
and records every map boundary, but contains no LX/RX/LY/TY getter calls.
Its 23 natural CFRAME calls succeed, while all four bound fields remain NIL.
The strict parser rejects the missing inputs. Function wrappers do not
observe these compiled bound accesses. Native slot symbols and computed
helper calls support a slot-access interpretation; the runtime helper ABI
has not been independently resolved.

The final v2 probe removes the ineffective bound-reader wrappers and uses
SLOT-VALUE on the naturally returned frame. It captures slots at that return
and again at helper exit, checking copied random previews around both reads.
It adds no application X/Y/LX/RX/LY/TY/CFRAME accessor calls. All 438 map
preview checks, 140 frame-slot checks and both whole-output controls agree.
Keep this alongside the earlier extra-RX observer lesson. A preceding census
attempt had an unclosed Lisp form; it was stopped and cleaned up, rejected,
then corrected and structure-audited before the successful census.

Read [oracle staging](../oracle.md#ctemp-staging-and-permissions) and
[the native workflow](../native-analysis-workflow.md) before another run.
Use fresh roots and one original process at a time. The final observer is
[boundary-map-capture.cl](boundary-map-capture.cl), used through
`run-local-scene-state.ps1` with `-PreSceneProbePath`,
`-ProbeOutputNames aaron-boundary-map.txt` and `-RunSeconds 600`. Modes are
`writer-stream-seed-1234` and `writer-full-seed-5678`; controls omit the probe
arguments. The current C:\temp link and scoped registry permission workflow
are unchanged. The native workflow also documents the observed Ghidra
`java_home.save` permissions failure and successful scoped retry.

Final ignored roots under `research/extracted/local-oracle/`:

- `boundary-map-seed1234-20261005-g` / `boundary-map-control-seed1234-20261005-d`.
- `boundary-map-seed5678-20261005-h` / `boundary-map-control-seed5678-20261005-f`.
- Native: `boundary-map-native-seed1234-20261005-a`, reports in `mapped/ghidra-b`.
- Incomplete frame inputs: `boundary-map-seed1234-20261005-e`.
- Successful preliminary census: `boundary-map-trace-seed1234-20261005-c`.
- Prior preparation: `fill-preparation-seed1234-20261005-f` and
  `fill-preparation-seed5678-20261005-g`.

The strict [parser](../tools/parse-boundary-map-report.mjs) checks full map
coverage, proper lists, natural coordinates, frame slots, quotas, identities,
parent nesting and every completion counter. The
[derivation](../tools/derive-boundary-map-evidence.mjs) takes, in order: both
observed/control pairs, the native root, both prior preparation roots, the
incomplete-frame root and a fresh output JSON path. It binds all sources and
raw outputs and recomputes every comparison. Full maps, binary windows,
Ghidra reports, tool installations and REA bundles remain ignored. No unit
tests were added or suites run; syntax/AST checks and original-output
comparisons support this milestone.

Next, recover SUBFORM's initial boundary maps before MY-FILL, then connect
their production to the measured strategy and SUBFORM POST-FILL helper.
CFORM POST-FILL and the source of the observed value-3 cells are also useful
next boundaries.
