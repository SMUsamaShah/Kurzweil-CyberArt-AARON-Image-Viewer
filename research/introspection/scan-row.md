# SCAN-ROW and NEIGHBORS

## Measured result, 2026-10-05

Independent JavaScript now reproduces every natural row scan and nested
neighbor call in both controlled paintings. The recovered row point also
feeds the existing boundary/frame/preparation/POST-FILL composition with
matching complete outputs for all 278 linked SUBFORM cases.

| Observation | Seed 1234 | Seed 5678 | Total |
|---|---:|---:|---:|
| Natural SCAN-ROW calls compared | 2,748 | 3,057 | 5,805 |
| Natural NEIGHBORS calls compared | 2,993 | 3,991 | 6,984 |
| Non-NIL TRIPT returns | 97 | 196 | 293 |
| NIL returns | 2,651 | 2,861 | 5,512 |
| Negative-Y scans | 4 | 1 | 5 |
| Natural FLASH-SPOT calls within scans | 2,744 | 3,056 | 5,800 |
| Complete map-content equality checks | 5,496 | 6,114 | 11,610 |
| Elements covered by those checks | 844,185,600 | 939,110,400 | 1,783,296,000 |
| Captured patch-row cells | 2,630,080 | 2,930,560 | 5,560,640 |
| SCAN return object links to PATCH-EDGE | 95 | 183 | 278 |
| Composed fills compared | 95 | 183 | 278 |
| Complete final map cells compared | 29,184,000 | 56,217,600 | 85,401,600 |

Counts include repeated positions across calls; they are not counts of unique
picture cells. Fifteen non-NIL scans do not enter the captured PATCH-EDGE
boundary. The retained evidence does not assign their caller branch from this
observer alone.

Both instrumented AA0 files and complete scene reports equal fresh
uninstrumented controls byte for byte. Each run also executes the same isolated
matrix after its natural painting: 44,544 NEIGHBORS calls and 10,368 SCAN-ROW
queries over 48 explicitly captured layouts. Both matrix tapes agree.

## NEIGHBORS(X, Y, P)

For an integer point inside the picture:

1. Consider the eight surrounding cells, excluding the center.
2. Ignore cells outside the picture; do not count a synthetic border label.
3. Count cells whose unsigned 16-bit PATCH-MAP value equals P exactly.
4. Return `min(3, count)`. This is a saturating threshold count, not a full
   neighbor total.

The scratch domain covers `(1,1)`, `(1,3)`, `(3,1)`, `(2,2)`, `(3,3)` dimensions
at every valid point, and nine corner/edge/center positions in `(5,5)`. At each
of 29 positions it enumerates all 256 eight-direction masks for P=0, 7, and
65,535, with the center both matching and different. Different cells contain
9 when P=0 and 0 otherwise. Out-of-picture mask bits cannot write scratch cells,
so some mask cases repeat the same in-picture arrangement.

Matrix returns per painting are 8,076 zeros, 13,536 ones, 11,856 twos and
11,076 threes. Natural returns cover all four values:

| Return | Seed 1234 | Seed 5678 |
|---|---:|---:|
| 0 | 193 | 195 |
| 1 | 208 | 502 |
| 2 | 2,495 | 3,098 |
| 3 | 97 | 196 |

The native report suggests the read order `(x,y-1)`, `(x-1,y-1)`, `(x+1,y-1)`,
`(x+1,y)`, `(x-1,y)`, `(x+1,y+1)`, `(x-1,y+1)`, `(x,y+1)`. Numeric
results and the cap are measured; individual AREF read ordering is not traced.
Arbitrary fractional/non-number inputs and centers outside the picture remain
uncharacterized. JavaScript validation is adapter policy.

## SCAN-ROW(LX, RX, Y, PDEX)

- Y=-1 returns NIL before FLASH-SPOT. Other negative Y values follow the
  native sign-check interpretation and remain uncharacterized at runtime.
- Otherwise call zero-argument FLASH-SPOT once, including for an empty or
  inverted range.
- Scan increasing X over **`[LX, RX)`**. RX is excluded.
- For each cell equal to PDEX, invoke NEIGHBORS with that X/Y/PDEX.
- Return the first point with a neighbor result greater than 2 as a
  TRIPT with X, Y, and Z=4. If none qualifies, return NIL.

The scanner changes neither map's identity nor any complete map contents.
Copied random-state previews also agree at entry/exit and around every snapshot.
Natural FLASH-SPOT calls have no arguments and one NIL return. Their effects
on graphics or other unobserved state are not reconstructed. The JS adapter
offers a `flashSpot` callback for that boundary and otherwise supplies numeric
scan behavior.

The 48 scratch layouts include empty/full patches, vertical/horizontal thin
lines, an isolated point, an outer ring, a checkerboard, and nine fixed mixed
patterns. Every layout uses all 36 LX/RX pairs in 0..5 and all Y=-1..4. Thus
empty/inverted ranges, the excluded right endpoint and negative Y are exercised
even though the natural calls have no empty/inverted ranges. Scratch SCAN-ROW
also preserves its patch map. The matrix restores original map/dimension
bindings, both complete original maps and the copied random preview.

Native SCAN-ROW has no visible upper-Y or X clipping guard; callers must supply
valid array coordinates for a nonempty scan. Original error behavior for invalid
coordinates is not recovered. JS rejects unsupported coordinates.

## Composed row-to-SUBFORM seam

`engine/src/aaron-scan-row.js` exports `countAaronPatchNeighbors`,
`scanAaronPatchRow`, and `fillAaronSubformFromRow`. The last derives its own row
seed before calling the existing PATCH-EDGE/LIST-FRAME/preparation/POST-FILL
composition. All final outlines, frames, counts, returns and both complete maps
match the earlier boundary captures for the 278 object-linked cases.

The observer measures that PATCH-EDGE's start object is the latest natural
SCAN-ROW return. The comparison binds parent arguments, point slots, patch ID
and MAX to the earlier capture, and also checks 265,600 linked patch-row cells
against its complete boundary-entry map. It does not prove a direct native call
edge or run BRUSH-FILL entirely in JavaScript.

The earlier boundary runs requested SmallImage; the current scanner/control
runs did not. Both have measured 320×480 maps and identical AA0/scene bytes.
This cross-capture composition is limited to those observed inputs and outputs;
it does not establish general equivalence of that environment setting.

Original maps, caller row bounds/patch ID, MAX, FLAG-BIT and natural form counts
remain inputs. No observed MAX equals the latest natural CFORM-COUNT value;
copying that getter result would not recover the walk limit. The source of MAX
and the scan schedule is the next BRUSH-FILL preparation investigation.

## Native and provenance checks

Fresh metadata captures the original compiled `(LX RX Y PDEX)` and `(X Y P)`
functions without installing their natural wrappers. Each measured memory
window has a unique complete PLL object match. All decoded instruction bytes
are checked against those payloads; canonical standalone Ghidra evidence passes
REA 3.2.1 external import/export. This is not a REA native provider session.

| Function | PLL payload offset | Payload bytes | Reachable instructions | Instruction bytes checked |
|---|---:|---:|---:|---:|
| SCAN-ROW | 2,625,748 | 354 | 137 | 346 |
| NEIGHBORS | 2,629,668 | 4,788 | 1,438 | 4,779 |

SCAN-ROW's strict X comparison, raw tagged threshold 8 and constructor Z value
16 correspond to the measured exclusive endpoint, >2 threshold and Z=4.
Ghidra's Windows x86 inferred C types do not recover Allegro Lisp's ABI/source.

Portable evidence is [scan-row-parity-20261005.json](evidence/scan-row-parity-20261005.json).
It binds ten source/dependency hashes, fresh controls, native reports, positive
scan records, every patch link, matrix tape digests and the excluded first run.
Original binaries, full native reports and raw tapes remain ignored.

### Excluded observer v1

The first capture had zero observer errors and completed its matrix, but its
AA0 and scene bytes differed and it recorded zero PATCH-EDGE calls. Source
review found a trailing flush `WHEN` after the wrapper's `UNWIND-PROTECT`: it
replaced the original SCAN-ROW return with NIL. V2 encloses the original result
and later flush in `MULTIPLE-VALUE-PROG1`. Both v2 controls pass. The failed v1
source hash, raw report and counters remain bound as diagnostics and never
enter successful parity. Error-free logging is not a control comparison.

## Reproduction roots

Read [oracle.md](../oracle.md) and [native-analysis-workflow.md](../native-analysis-workflow.md)
before running. Use fresh output roots and one original runtime at a time.

Under ignored `research/extracted/local-oracle/`:

| Root | Role |
|---|---|
| `scan-row-native-seed1234-20261005-a` | Paused read-only code capture; standalone Ghidra/REA |
| `scan-row-seed1234-20261005-b` | Excluded v1 return-value bug |
| `scan-row-seed1234-20261005-c` | Frozen v2 natural rows and isolated matrix |
| `scan-row-control-seed1234-20261005-d` | Fresh uninstrumented control |
| `scan-row-seed5678-20261005-e` | Same frozen v2 on independent painting |
| `scan-row-control-seed5678-20261005-f` | Fresh uninstrumented control |

The successful natural observer uses `-PreSceneProbePath
research/introspection/scan-row-capture.cl`, output `aaron-scan-row.txt`, and
RunSeconds=600. It completed in about 101 and 141 seconds, respectively. No
system clock changes were made. `parse-scan-row-report.mjs` writes a small
normalized summary; `derive-scan-row-evidence.mjs` requires the two observed/
control pairs, the earlier SUBFORM roots, the native root, excluded v1 root
and a fresh output filename. It rechecks all comparisons before retaining
portable evidence. Syntax and Lisp form structure were checked; no unit suite
was added or run for this investigation.
