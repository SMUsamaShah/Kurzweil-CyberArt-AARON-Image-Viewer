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
| 4. Stream emission | Partially measured | `MOVE-TO`/`DRAW-TO` match 96 byte/state captures; basic `DIMS`, `BRUSH`, `AARGB/HUE`, `COLOR`, and `END` formatter constants are recovered. | `VECTOR` and `FILL` are measured with `CONTROLS-VISIBLE` bound; float formatting, previous-point rules, and all selector branches have parity tests. |
| 5. Freehand line algorithm | Not complete | Paul Cohen’s article is saved as historical guidance; candidate names and numeric helpers are known, but no complete AARON FLA sequence is recovered. | A controlled point-to-point probe reproduces the full sequence, random consumption, correction/wedge behavior, and termination. |
| 6. Brush and colour pipeline | Early research | `BRUSH-STROKE`, `PREP-LINE`, `RECORD-BRUSH`, `BRUSH-FILL`, `DRAW-CFORM`, and related candidates are inventoried; output semantics remain open. | Brush selection, colour transitions, fill paths, and brush state match captured original calls. |
| 7. Composition and figures | Provisional only | The JS planner has occupancy checks and measured canvas/palette profiles, but scene rules, poses, body parts, plants, pots, garments, and occlusion are not byte-equivalent. | Seeded scenes reproduce object ordering, placements, geometry, and branch decisions across holdouts. |
| 8. Integrated generator | Not started | The generator can create valid AA files and useful provisional scenes. No whole-painting equivalence test has passed. | Same controlled startup/input produces matching structural statistics, command/state traces, and—where deterministic—matching AA output. |
| 9. Productization | Later | Keep the viewer, engine API, browser demo, corpus analyzer, and contributor documentation coherent. | Users can load, generate, inspect, and save AA files without research-only tooling. |

The honest overall status is: the file format and several low-level primitives
are strong; the generative core is still early. The project is not close to a
complete equivalent port until phases 5–8 are recovered.

## Immediate work queue

1. Publish the local reverse-engineering commits when the GitHub connector
   permits writes; do not bypass connector restrictions.
2. Run the expanded `store-behavior` probe. It binds
   `CONTROLS-VISIBLE=NIL|T` and records 384 cases. Use
   `tools/summarize-store-report.mjs` before interpreting failures.
3. Implement and test `VECTOR`/`FILL` only from that fresh output. Keep old
   192-case failures as historical evidence, not parity data.
4. Isolate the FLA call chain: start with `PREP-LINE`, `BRUSH-STROKE`,
   `FOLLOW`, `MAPLINE`, and `LINE-MAPPING`; use `LOCK-WIGGLE` as a measured
   helper, not as proof that it is the whole FLA.
5. Recover brush/fill/colour state and then connect those methods to the AA
   writer.
6. Recover startup seed installation and random draw order before calibrating
   composition. Then replace provisional planner/figure rules one subsystem at
   a time with oracle-backed implementations.
7. Add integrated holdout fixtures and a final parity report that separates
   exact, inferred, and provisional output.

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

