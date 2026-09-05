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
The demo could not be retrieved during this investigation. Its five parameters,
full equations, and Python implementation have therefore **not** been verified.
Do not invent these details from the illustration. The article itself remains
the saved reference; no article text or notebook image is copied here.

## Leads confirmed in the Windows image

The completed runtime census found function bindings for the following names
in `COMMON-GRAPHICS-USER`. The proposed roles are hypotheses based on names,
not recovered call relationships:

| Retained function names | Question to resolve |
|---|---|
| `FOLLOW`, `WIGGLE`, `LOCK-WIGGLE` | Do these implement target feedback, or a different operation such as hair construction? |
| `PREP-LINE`, `HOP-OR-DRAW`, `PARSE-HOP`, `PARSE-P-HOP` | How are paths initialized, traversed, and emitted? |
| `DIRECTION`, `ANGLE-DIF`, `ANGLE-RANGE`, `RESET-RANGE` | What are angle units, wrapping rules, and feedback limits? |
| `RAN`, `RAN-HAND` | What random draws occur, and is HAND a drawing mechanism or an anatomical object? |
| `BRUSH-STROKE`, `SELECT-BRUSH`, `RECORD-BRUSH` | Where does a geometric path become brush/file operations? |
| `MAPLINE`, `LINE-MAPPING` | Does occupancy mapping rasterize the same path as the visible stroke? |

Evidence and reproducible inventory: [runtime-introspection.md](runtime-introspection.md).
`RAN (A B)`, `SELECT-BRUSH (COUNT)`, and `BRUSH-STROKE (PATH VALUE CDEX SDEX)`
have confirmed retained argument lists. Argument lists for the other names
above still need to be obtained. A function binding alone does not prove that
invocation will succeed: `DISASSEMBLE` is bound but attempts to load a missing
module in this distribution.

## Next executable experiment

`introspection/line-metadata.cl` records argument lists for these candidates
without calling the application routines or changing their globals. This
avoids guessing argument types from the names. The probe is prepared locally;
there are no results from it yet.

After signatures and object layouts are known, call the smallest isolated
geometric helper with a controlled random state. Record input points, parameter
values, output points, numeric types, and random-state changes. Useful cases
include coincident endpoints, horizontal/vertical lines, all quadrants, short
distances, and direction changes near angle wrap boundaries. Only then port
the measured rule and compare the full point sequence in JavaScript.

`engine/src/geometry.js` currently samples mathematical curves, and
`AaBuilder.chainTo` emits a diagonal-then-axis unit path. Neither is a recovered
implementation of Cohen's FLA. The planner and figure generator also remain
provisional. Adding a visually plausible random wobble would not establish
the original algorithm or advance the exactness claim.
