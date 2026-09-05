# AARON architecture reconstruction

This document separates historical design evidence from behavior observed in
the 2001 Windows build. It is the design target for the JavaScript modules;
neither the paper nor the binary strings is being treated as a substitute for
oracle measurements.

## External design evidence

Harold Cohen's *What is an Image?* describes a layered system in which
`PLANNING` and `MAPPING` exchange proposals and reject placements that do not
fit available space. A figure is developed through successive lines and
returns to planning between developments. The paper also describes a coarse
cell matrix for roughness, density, occupancy, and connectivity; mapped lines
use a Bresenham-style rasterization that avoids corner-only adjacency. Its
historical implementation used integer arithmetic and a turtle with discrete
turn rates.

Source: [What is an Image?](https://www.kurzweilcyberart.com/aaron/pdf/whatisanimage.pdf),
especially the sections on PLANNING/MAPPING, LINES AND SECTORS, the turtle
system, and matrix representation.

## Binary evidence

The hash-identified `AARON.dxl` retains source basenames that line up with the
paper's conceptual layers:

| Recovered names | Working interpretation |
|---|---|
| `planobs`, `mplan`, `compose` | planning state, composition, object order |
| `map`, `edges`, `fill`, `paint` | occupancy, boundaries, fills, brush emission |
| `ut1`–`ut9`, `rorl`, `lines`-like helpers | turtle/geometry and line traversal helpers |
| `figobs`, `thingobs`, `propobs`, `primobs` | figure, thing, prop, and primitive records |
| `bodyvars`, `defbody`, `defpose`, `pskel` | body, pose, and skeleton definitions |
| `brushobs`, `hues`, `colobs` | brush state and palette/color families |
| `pots`, `plant`, `tree`, `garb` | object-specific constructors and attributes |

These are module-name leads, not recovered source code. The clean-room engine
keeps the same boundaries so each rule can be compared with original AA output
without copying proprietary implementation details.

## JavaScript mapping

1. `spatial-grid.js` owns roughness, occupancy, density, and four/eight-way
   connectivity.
2. `planner.js` proposes objects and asks the grid whether a placement is
   available; accepted objects reserve cells immediately.
3. `geometry.js` and `aa-builder.js` turn accepted paths into the observed
   absolute (`am`/`ad`, `zm`/`zd`) and chain-code operations.
4. `generator.js` owns composition order and object families while preserving
   the planner/grid boundary.
5. `random.js` isolates the standard reference MT19937 used by existing
   clean-room tests. `allegro-random.js` separately models the numeric source
   recovered from the 2001 image; startup seeding and draw order remain to be
   calibrated.

The current generator has the first three interfaces in place, but its figure
and palette rules are explicitly provisional until controlled oracle runs
identify the corresponding tables and draw sequence.
