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
| 2. Numeric foundation | Measured for recovered primitives; startup state partially measured | Allegro RNG matches 6,140 validation values; floating `RAN` matches 512 values plus 64 state checks; angle helpers match 218 double observations and 20 range calls. The corrected seed constructor installs `CL:*RANDOM-STATE*`; the visible `rseed` serializer is a fixed 3,030-byte truncated dump that `GET-RANDOM` cannot read; a controlled post-`INIT-RANDOM` reinstall makes seed-1234 output byte-stable across fresh processes and matches 512 normalized engine-local `RAN` calls. A contextual bridge now partitions those calls across `DEVELOP-PLAN`, `RPARSE`, `GENERATE-PERSON`, and `BUILD-FIGURE`; larger integer limits and the no-consumption equal-endpoint boundary are measured. | The normal startup state transition and generator random draw order are recovered, or the controlled calibration seam is explicitly adopted for all remaining measurements. |
| 3. Geometry and hand helpers | Partially measured | `XYDIST` and `LOCK-WIGGLE` match 320 paths, 80 distances, and 80 subsequent random states. A controlled post-`INIT-RANDOM` trace also establishes `RAN-HAND` as a 20-joint, 20-sample single-float perturbation helper across four repeated calls; its caller and role in the complete FLA are unresolved. | The complete line path and its caller chain match original point sequences. |
| 4. Stream emission | Isolated writer selectors measured | `MOVE-TO`/`DRAW-TO` match 96 byte/state captures. `VECTOR`/`FILL` match all 240 isolated cases (216 successful outputs and 24 expected NIL-previous errors), including two-decimal truncation and signed `-0.00`; the screen PLOT function is replaced. Basic formatter constants are inferred. | Real screen/file emission, stream ownership, and unmodified GUI/file integration remain to be measured; isolated evidence stays separate from those paths. |
| 5. Freehand line algorithm | Partially measured | `FREE-PATH(EDGE)` now matches 16 traced-versus-unwrapped sequences and following random states, including visibility gating, closed-edge traversal, 8–14 step counts, and single/double arithmetic. The integrated startup trace reaches `FREE-PATH` from `DRAW-CFORM` with a real four-point `VISPT` edge, but its complete role remains unresolved. | Recover all edge-list branches and connect this subset to DRAW-CFORM/brush output; validate integrated caller state and termination beyond the tested shapes. |
| 6. Brush and colour pipeline | Early research, first fill writes measured | Seven startup brush profiles and complete ordered perimeter/core masks are captured; `INIT-MAPS` matches private map dimensions, element widths, zero initialization, return value, replacement behavior, and binding restoration. Isolated `BRUSH-STROKE` probes now measure empty/singleton boundaries, direct value propagation, brush-1/2/3/4 two-point footprints, a non-interpolated gapped brush-1 path, first-coordinate-major map indexing, aligned CDEX/SDEX holdouts with unchanged isolated map effects, repeated-vertex idempotency, one exact screen-forwarding call under a rejecting predicate, and aligned CDEX/SDEX forwarding to that dependency. The integrated startup trace reaches `BRUSH-STROKE` with an eight-`TRIPT` path and shows `BRUSH`, `RPLANE`, `RGB-MAP`, and the private fill map initialized before `SCREEN-AND-STORE`; it also reaches `WATCH-FOR-MESSAGES` and `PREP-LINE`. Selection boundaries, overlaps, clipping, real screen/file emission, colour transitions, and brush state remain open. | Brush selection, colour transitions, fill paths, scene context, and brush state match captured original calls. |
| 7. Composition and figures | Runtime frontier measured; semantics provisional | The original startup trace now reaches three `GENERATE-PERSON`/`BUILD-FIGURE`/`DRAW-FIGURE-CFORMS` passes, 118 `DRAW-CFORM` calls, and 55 `PAINT-FILL` calls in bounded holdouts. Numeric traces measure the default compact transition (`640x480` engine state to `320x480` picture canvas) and two controlled high-resolution holdouts: requested 1024x768 selects 512x768, while 1920x1080 selects 960x1080. The JS planner has occupancy checks and measured canvas/palette profiles, but scene rules, poses, body parts, plants, pots, garments, and occlusion are not byte-equivalent. | Seeded scenes reproduce object ordering, placements, geometry, and branch decisions across holdouts. |
| 8. Integrated generator | Control flow measured; parity not started | A complete bounded trace reaches `MAIN` return, `DISPLAY-COLOR-PATCHES`, 43 fill calls, and one `WRITE-PAINTING-RECORD` for image 0. The oracle emits complete compact and high-resolution `aa0` records, including 512x768 and 960x1080 controlled holdouts, but no whole-painting equivalence test has passed. | Same controlled startup/input produces matching structural statistics, command/state traces, and—where deterministic—matching AA output. |
| 9. Productization | Later | Keep the viewer, engine API, browser demo, corpus analyzer, and contributor documentation coherent. | Users can load, generate, inspect, and save AA files without research-only tooling. |

The honest overall status is: the file format and several low-level primitives
are strong; the generative core is still early. The project is not close to a
complete equivalent port until phases 5–8 are recovered.

## Immediate work queue

0. Keep the local static image index as the first step before another Windows
   run. The complete PLL's two indexed tables resolve 53,039 tagged string
   objects, include all 1,347 retained function names, and cross-reference all
   50 DXL `harold3` source markers with 50 PLL `.fasl` markers. Use the exact
   record/object offsets to select read-only targets such as `FILL-MAP`,
   `PAINT-BRUSH`, and `MPLAN`; do not infer their values, package ownership,
   or code boundaries from names alone. The runtime PLL copy is truncated, so
   static work must use the complete extracted PLL outside the repository.

1. Keep the completed read-only brush-state census as the boundary for fill
   work. The direct checkpoint records seven `PAINT-BRUSH` objects,
   `BOUNDARY-VALUE=3`, unbound `BRUSH`/`FILL-MAP`, complete masks for brushes
   0–6, and metadata-only signatures/constants for the map and fill routines.
   The measured profiles are implemented in `engine/src/aaron-brushes.js` and
   tested against the normalized report. Do not mutate the startup map or
   assume a constructor.
2. Continue isolating `BRUSH-STROKE(PATH VALUE CDEX SDEX)` with the proven
   `SCREEN-AND-STORE`/`IN-SUB-FRAME` stubs and private map shape. The current
   evidence covers NIL, singleton, horizontal and vertical two-point paths,
   values 1 and 3, brush IDs 1–4, one non-interpolated brush-1 gap, repeated
   vertices, aligned `CDEX`/`SDEX`, and a corrected direct top-level Stage 23
   matrix that reproduces the 12-, 26-, 70-, and 108-cell adjacent footprints
   for brush IDs 1–4. The repeated interior brush-1 path also preserves the
   same unique map cells and forwards all three points, including the repeated
   endpoint. The `(0,0)→(1,0)` edge diagnostic now records a one-cell partial
   write followed by `SIMPLE-ERROR` under the forced predicate; keep that as a
   boundary diagnostic, not a clipping rule. Next capture the downstream
   screen/writer context with a real scene setup; restore every function and
   binding with `UNWIND-PROTECT`. Treat this as dependency-isolated
   branch/map behavior, not full pipeline parity.
4. Establish the scene context required by the original `SCREEN-AND-STORE`.
   The direct call now has a reliable condition boundary: it invokes
   `WATCH-FOR-MESSAGES` once and stops at unbound `MPLAN`, with all probe
   overrides restored. The read-only constructor probe records
   `MASTER-PLAN(NIL T)` and `MAKE-PLAN((COMMON-GRAPHICS:ID SCRIPT) T)` as
   distinct CLOS constructors; neither is invoked yet. The append-safe startup
   trace now confirms that the normal path calls `MASTER-PLAN`,
   `DEVELOP-PLAN`, `SELECT-CANVAS`, `INIT-MAPS`, `PROTOCOL`, and `RPARSE`.
   The focused follow-up shows `MPLAN` is a `PLAN` by `RPARSE`, and the
   initialized path reaches `DRAW-CFORM`, `SCREEN-AND-STORE`, `PREP-LINE`,
   and `STORE-IN-FILE`; `BRUSH` and `RPLANE` are bound before `PREP-LINE`.
   The next trace leaves `STORE-IN-FILE` unwrapped and confirms its first
   figure dispatch is `LINE-MAPPING -> MAPLINE -> PLOT`; those three edges
   consume the bounded report before screen/brush calls appear. Omit these
   high-fanout mapping/plot wrappers in the following pass to reach later
   `SCREEN-AND-STORE`, brush, and message-loop edges. The resulting trace
   reaches `FREE-PATH`, `BRUSH-STROKE`, `SCREEN-AND-STORE`,
   `WATCH-FOR-MESSAGES`, and `PREP-LINE`; `HOP-OR-DRAW` then consumes the
   bound. Removing `HOP-OR-DRAW` yields 40 integrated screen calls; omit only
   the message-loop and preparation wrappers next to expose later generator
   continuation while retaining the screen/brush boundaries. The first pass
   removed `WATCH-FOR-MESSAGES` but retained `PREP-LINE`, yielding 73 repeated
   screen/brush/preparation calls before the bound. Remove `PREP-LINE` explicitly
   next, then rerun the
   private `SCREEN-AND-STORE` path without inventing a plan object. Treat any
   new PLOT or writer observations as downstream only after the context is
   measured. The generator trace now reaches `MAKE-ARTWORK`,
   `MAKE-PAINTING-COLORS`, 18 `FREE-PATH` calls, and repeated
   `NEW-START`/`END-START` before the bound; omitting them yields 200 integrated
   brush calls before the bound. Omit `BRUSH-STROKE` and `SCREEN-AND-STORE`
   next to sample post-stroke/finalization edges while retaining their
   captured integrated evidence. That pass reaches three person/figure passes
   and 55 `PAINT-FILL` calls before `GOOD-START` consumes the bound; omit
   `GOOD-START` next.
5. Continue controlled `FREE-PATH(EDGE)` probes. DRAW-CFORM references it next
   to FREEHAND-FLAG; its constants include distance, heading, RAN and POL-VPT.
   Preserve construction, return/mutation, global-state and dependency-call
   checkpoints. Exclude first-call dispatch warmup from random-state claims.
6. Establish the complete path formula and termination, then compare bounded
   dependency wrappers against unwrapped baselines before porting the result.
   Use LOCK-WIGGLE as a measured helper, not proof of the whole FLA.
7. The isolated VECTOR/FILL matrix is complete: the writer matches all 240
   captured cases, including endpoint continuity, redraw families, float
   truncation, signed zero, and the NIL-previous error boundary. Keep this
   fixture as a regression boundary while measuring the real PLOT/screen/file
   path; do not promote the stubbed selector result to integrated parity.
8. Directly measure remaining writer selectors and stream ownership. The
   controls-visible matrix is complete; its failures are not parity data.
9. Recover brush/fill/colour state and then connect those methods to the AA
   writer.
10. Recover startup seed installation and random draw order before calibrating
    composition. The corrected state-only holdouts prove dynamic seeded state
    construction and pre-`INIT-RANDOM` seed sensitivity, but repeated seed
    1234 runs diverge after `INIT-RANDOM`. The `?RSEED?` path/file boundary is
    measured: AARON writes a fixed 3,030-byte dump with `...`, and its
    `GET-RANDOM` reader rejects that dump. A controlled reinstallation of the
    seeded state immediately after `INIT-RANDOM` makes two seed-1234 paintings
    byte-identical. Use that seam for draw-order calibration while separately
    probing the normal process-varying transition; do not substitute it for
    the archived default behavior.
11. Compare the complete oracle `aa0` record and its random-state checkpoints
    against the JS engine; first recover selector-level writer output and the
    generator's seed/draw order, then replace provisional composition rules.
    The canvas-state trace confirms `INIT-RANDOM` in normal startup but no
    `SET-RANDOM` or `GET-RANDOM` entries in that traced call set. The seeded
    holdout sees `?RSEED?` as `C:\\temp\\rseed`; the serializer follow-up
    confirms that file is truncated and unreadable. The post-init reseed
    holdout is the reproducible calibration boundary, not evidence that the
    normal startup transition uses the requested seed.
12. Add integrated holdout fixtures and a final parity report that separates
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
