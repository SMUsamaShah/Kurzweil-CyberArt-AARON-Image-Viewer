# Freehand line algorithm: source and recovery plan

## Saved primary source

Paul Cohen, **The Hand of AARON | Harold Cohen's Freehand Line Algorithm**, Right
Click Save, March 30, 2026. Supplied by Usama; consulted September 5, 2026.

https://www.rightclicksave.com/article/the-hand-of-aaron-harold-cohens-freehand-line-algorithm-aaron-digital-art-human-randomness-feedback

Paul, Harold Cohen's son, describes reconstructing a 139-line BASIC program
in Python. The algorithm advances in short segments with randomized headings,
using distance and directional error to adjust its course toward a target.
Correction becomes more frequent near the destination. He reports that AARON
used the FLA until 2012. This makes it a strong historical lead for the 2001
build, but does not establish identical parameters or implementation.

The article links to [Paul's interactive demonstration](https://fla-demo-production.up.railway.app).
The live demo is reachable and exposes the five parameter names and its current
default values: radius `3.5`, max heading change `1.5`, scallop minimum
`f_min=6`, scallop range `f_range=8`, and line width `4`. The rendered page still
does not expose the reconstruction equations or Python implementation, so these
values are historical/demo evidence rather than proof of the 2001 Windows
parameters. Do not infer the missing equations from the illustration. The
article itself remains the saved reference; no article text or notebook image is
copied here.

## Leads confirmed in the Windows image

The completed runtime census found function bindings for the following names
in `COMMON-GRAPHICS-USER`. The proposed roles are hypotheses based on names,
not recovered call relationships:

| Function | Retained argument list | Question to resolve |
|---|---|---|
| `FOLLOW` | `(START DIR)` | Target following, or another traversal? |
| `WIGGLE` | `(XTPLAN)` | Is this the feedback perturbation described by the FLA? |
| `LOCK-WIGGLE` | `(PTA PTB)` | Does it constrain a segment's heading? |
| `PREP-LINE` | `(RGB WIDTH)` | Does this initialize a brush path? |
| `HOP-OR-DRAW` | `(PTA PTB)` | When does a path jump versus draw? |
| `PARSE-HOP`, `PARSE-P-HOP` | `(CMD)` | How are stored path commands interpreted? |
| `DIRECTION` | `(XA YA XB YB)` | Which angle convention is used? |
| `ANGLE-DIF` | `(A B)` | How are headings wrapped? |
| `ANGLE-RANGE` | `(Z LX RX)` | What does the range represent? |
| `RESET-RANGE` | `(SDEX Z)` | How does state reset affect heading limits? |
| `FROM-ANGLE` | `(MAINA FROM ATO ID)` | How do angle modes map to path IDs? |
| `TO-ANGLE` | `(MAINA TO ID)` | How do angle modes map to path IDs? |
| `RAN`, `RAN-HAND` | `(A B)`, `()` | Which random draws drive the hand model? |
| `BRUSH-STROKE` | `(PATH VALUE CDEX SDEX)` | Where does a geometric path become brush/file operations? |
| `SELECT-BRUSH` | `(COUNT)` | How does brush count select a brush? |
| `RECORD-BRUSH` | `(CDEX SDEX)` | What brush state is retained? |
| `MAPLINE` | `(SKMODE DMODE PTA PTB)` | Does mapping use a separate occupancy mode? |
| `LINE-MAPPING` | `(MODE PTA PTB)` | Does occupancy rasterize the visible segment? |
| `DRAW-CFORM` | `(CDEX SDEX)` | How are color forms emitted? |
| `BRUSH-FILL`, `BRUSH-FILL-SUBPART` | `(CDEX SDEX)` | Which fill rules create paint strokes? |

Evidence and reproducible inventory: [runtime-introspection.md](runtime-introspection.md).
The metadata probe confirmed retained argument lists for all 23 candidates.
Examples include `FOLLOW(START, DIR)`, `LOCK-WIGGLE(PTA, PTB)`,
`DIRECTION(XA, YA, XB, YB)`, `ANGLE-RANGE(Z, LX, RX)`,
`MAPLINE(SKMODE, DMODE, PTA, PTB)`, and
`BRUSH-STROKE(PATH, VALUE, CDEX, SDEX)`. These names and signatures narrow
the next experiment, but they do not establish call order or implementation.
A function binding alone does not prove invocation will succeed:
`DISASSEMBLE` is bound but attempts to load a missing module in this distribution.

## Next executable experiment

`introspection/line-metadata.cl` records argument lists for these candidates
without calling the application routines or changing their globals. It
completed successfully in workflow run `33970753206`; the result is metadata,
not a recovered FLA implementation.

After signatures and object layouts are known, call the smallest isolated
geometric helper with a controlled random state. Record input points, parameter
values, output points, numeric types, and random-state changes. Useful cases
include coincident endpoints, horizontal/vertical lines, all quadrants, short
distances, and direction changes near angle wrap boundaries. Only then port
the measured rule and compare the full point sequence in JavaScript.

The completed `function-constants` probes recovered 439 summaries across 38
candidates, including references to MOD, NORM-A, TWO-PI and ATAN. Independent
numeric probes now support a JavaScript implementation of ANGLE-RANGE with 20
matching cases. See [angle-findings.md](angle-findings.md). The complete
freehand point sequence remains unresolved.

`engine/src/geometry.js` currently samples mathematical curves, and
`AaBuilder.chainTo` emits a diagonal-then-axis unit path. Neither is a recovered
implementation of Cohen's FLA. The planner and figure generator also remain
provisional. Adding a visually plausible random wobble would not establish
the original algorithm or advance the exactness claim.
