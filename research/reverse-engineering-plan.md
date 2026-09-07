# AARON reverse-engineering plan

This is the project handoff document for the clean-room JavaScript
reimplementation of the 2001 Kurzweil CyberArt AARON engine. The historical
viewer at the repository root remains intact; implementation work belongs in
`engine/`, and runtime evidence belongs in `research/`.

## Goal and evidence rules

The goal is a usable JavaScript engine with the same observable AA file
protocol and, ultimately, the same generator decisions as the archived
Windows build. “Exact” means parity against captured original-engine inputs,
outputs, state changes, and random-state changes. A visually plausible result
is useful for exploration but is not evidence of equivalence.

Every recovered rule must be labelled as one of:

- **Measured** — directly reproduced from an original-engine probe and covered
  by a comparison test.
- **Inferred** — strongly supported by constants, call relationships, or
  multiple observations, but not yet directly exercised.
- **Provisional** — a clean-room implementation used to keep the engine
  runnable while the original rule is still unknown.

Do not silently promote an inferred or provisional rule to exact parity.
Original binaries and installers stay outside the repository; only hashes,
probe scripts, normalized reports, and clean-room implementations are kept.

## Phase status

| Phase | Status | What is true now | Exit condition |
|---|---|---|---|
| 0. Preserve and observe | Complete | Installer provenance, AA samples, safe extraction, isolated Windows oracle, registry/DEP compatibility workarounds, and debug/small-image switches are documented. | Another researcher can reproduce the oracle setup without modifying the source artifact. |
| 1. AA protocol | Mostly complete | Parser, serializer, renderer, corpus analysis, palettes, outline/paint phases, and compact direction commands are implemented for observed records. | Round-trip and corpus checks cover every observed command and edge case. |
| 2. Numeric foundation | Measured for recovered primitives | Allegro RNG matches 6,140 validation values; floating `RAN` matches 512 values plus 64 state checks; angle helpers match 218 double observations and 20 range calls. | Remaining startup seed and generator random draw order are recovered. |
| 3. Geometry and hand helpers | Partially measured | `XYDIST` and `LOCK-WIGGLE` match 320 paths, 80 distances, and 80 subsequent random states. Their role in the complete FLA is unresolved. | The complete line path and its caller chain match original point sequences. |
| 4. Stream emission | Partially measured | `MOVE-TO`/`DRAW-TO` match 96 byte/state captures. Integer `VECTOR`/`FILL` match 72 successful captures with the screen PLOT function replaced; eight NIL-previous error cases are checked. Basic formatter constants are inferred. | Float formatting, all selectors, and stream lifetime are measured; screen-isolated evidence remains distinguished from unmodified calls. |
| 5. Freehand line algorithm | Partially measured | `FREE-PATH(EDGE)` now matches 16 traced-versus-unwrapped sequences and following random states, including visibility gating, closed-edge traversal, 8–14 step counts, and single/double arithmetic. | Recover all edge-list branches and connect this subset to DRAW-CFORM/brush output; validate integrated caller state and termination beyond the tested shapes. |
| 6. Brush and colour pipeline | Early research, maps measured | Seven startup brush profiles and complete ordered perimeter/core masks are captured; `INIT-MAPS` now matches private map dimensions, element widths, zero initialization, return value, replacement behavior, and binding restoration. Read-only signatures/constants for the remaining fill surface are retained; selection boundaries, fill writes, colour transitions, and brush state remain open. | Brush selection, colour transitions, fill paths, and brush state match captured original calls. |
| 7. Composition and figures | Provisional only | The JS planner has occupancy checks and measured canvas/palette profiles, but scene rules, poses, body parts, plants, pots, garments, and occlusion are not byte-equivalent. | Seeded scenes reproduce object ordering, placements, geometry, and branch decisions across holdouts. |
| 8. Integrated generator | Not started | The generator can create valid AA files and useful provisional scenes. No whole-painting equivalence test has passed. | Same controlled startup/input produces matching structural statistics, command/state traces, and—where deterministic—matching AA output. |
| 9. Productization | Later | Keep the viewer, engine API, browser demo, corpus analyzer, and contributor documentation coherent. | Users can load, generate, inspect, and save AA files without research-only tooling. |

The honest overall status is: the file format and several low-level primitives
are strong; the generative core is still early. The project is not close to a
complete equivalent port until phases 5–8 are recovered.

## Immediate work queue

1. Keep the completed read-only brush-state census as the boundary for fill
   work. The direct checkpoint records seven `PAINT-BRUSH` objects,
   `BOUNDARY-VALUE=3`, unbound `BRUSH`/`FILL-MAP`, complete masks for brushes
   0–6, and metadata-only signatures/constants for the map and fill routines.
   The measured profiles are implemented in `engine/src/aaron-brushes.js` and
   tested against the normalized report. Do not mutate the startup map or
   assume a constructor.
2. Isolate `BRUSH-STROKE(PATH VALUE CDEX SDEX)` by replacing only
   `SCREEN-AND-STORE` after the accessor census identifies a safe brush and
   measured private map shape. Test fresh NIL/singleton/two-point/three-point paths and
   both observed boundary values; restore the function with `UNWIND-PROTECT`.
   Treat this as dependency-isolated branch behavior, not full pipeline parity.
4. Continue controlled `FREE-PATH(EDGE)` probes. DRAW-CFORM references it next
   to FREEHAND-FLAG; its constants include distance, heading, RAN and POL-VPT.
   Preserve construction, return/mutation, global-state and dependency-call
   checkpoints. Exclude first-call dispatch warmup from random-state claims.
5. Establish the complete path formula and termination, then compare bounded
   dependency wrappers against unwrapped baselines before porting the result.
   Use LOCK-WIGGLE as a measured helper, not proof of the whole FLA.
6. Extend the screen-isolated VECTOR/FILL measurements with independent
   endpoint/continuity holdouts. Recover float formatting separately: the
   captured half-cent and negative-zero cases do not all match JS toFixed.
7. Directly measure remaining writer selectors and stream ownership. The
   controls-visible matrix is complete; its failures are not parity data.
8. Recover brush/fill/colour state and then connect those methods to the AA
   writer.
9. Recover startup seed installation and random draw order before calibrating
   composition. Then replace provisional planner/figure rules one subsystem at
   a time with oracle-backed implementations.
10. Add integrated holdout fixtures and a final parity report that separates
   exact, inferred, and provisional output.

Publishing through the GitHub connector succeeded again on September 6, 2026.
The earlier publishing blockage is historical, not a current prerequisite.

## Model handoff policy

The project can be split safely between the two models, but the work type—not
the model name—determines the handoff:

### Astra oversight required

- Designing or changing an oracle probe.
- Interpreting compiled-function constants, object layouts, or ambiguous
  runtime failures.
- Recovering FLA, brush/fill, scene planning, figure/pose, colour, or random
  draw-order semantics.
- Deciding whether evidence supports an exact claim.
- Reviewing integration changes before publishing or calling a subsystem
  complete.

### Luna is suitable

- Implementing a rule already marked measured in this document.
- Adding parsers, report summarizers, fixtures, unit tests, validation, and
  documentation.
- Mechanical refactors that preserve public behavior.
- Running the full test suite and checking formatting, hashes, and generated
  reports.

Every handoff should begin by reading this file and the referenced findings
document. A Luna change that touches an ambiguous algorithm should stop at a
testable scaffold and leave the decision for Astra review; it should not guess
at original behavior. Astra should review Luna’s commits in batches rather
than redoing routine test/documentation work.

## Definition of done

The project is complete only when the JavaScript engine can:

1. Parse, render, generate, and save the full observed AA protocol.
2. Match every recovered primitive with original-engine comparison fixtures.
3. Reproduce the FLA, brush/fill, colour, planning, figure, and occlusion
   decisions for controlled oracle cases.
4. Match random-state consumption and startup seed behavior.
5. Pass integrated holdouts without relying on the original binary at runtime.
6. Clearly document any remaining version-specific or unobservable behavior.
