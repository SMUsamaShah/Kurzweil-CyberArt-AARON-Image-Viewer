# AARON project continuity handoff

This file is the short resumption record for future Aaron conversations and
agents. The full technical roadmap remains in
[`reverse-engineering-plan.md`](reverse-engineering-plan.md); this file keeps
the current state, constraints, and next move easy to find after a
conversation boundary.

## Project identity

- Repository: `SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer`
- Working branch: `reverse-engineer-aaron-js`
- Goal: clean-room JavaScript reimplementation of the 2001 Kurzweil CyberArt
  AARON generator, while preserving the historical AA viewer.
- Source policy: do not publish reconstructed proprietary Lisp or redistribute
  the archived installer/extracted binaries. Keep normalized reports, hashes,
  probe scripts, and independently written implementations.
- Exactness policy: label results **Measured**, **Inferred**, or **Provisional**;
  passing a JS self-test is not evidence of original-engine parity.

## Last verified state

As of 2026-09-07, the recovered checkout is synchronized locally at
`549dc71` (`Record bounded brush edge behavior`), with the current direct
matrix source at `73ba1f6`. The connected branch contains the same tree under
connector-created commits and currently ends at
`1c78085fbc3e5430db84002ecd05105c2cf9d86f` after the edge evidence
publication.
The connected branch has different ancestry/SHA values from the local
checkout, so compare the tree and files rather than assuming commit IDs are
identical.

The latest published change adds:

- `engine/src/aaron-hand.js`, implementing the measured zero-argument
  `RAN-HAND` helper;
- `engine/test/fixtures/ran-hand-post-init.json` and
  `engine/test/aaron-hand.test.js`;
- normalized original-engine evidence at
  `research/introspection/evidence/ran-hand-post-init-34120567298.txt`;
- updates to the plan, oracle notes, and freehand-line notes.

The current brush checkpoint also adds a strict Stage 23 report parser and
the retained original-engine captures at
`research/introspection/evidence/brush-stroke-isolated-34145100465.txt` and
`research/introspection/evidence/brush-stroke-isolated-34145707021.txt`.
The corrected four-case capture reproduces the 12-, 26-, 70-, and 108-cell
adjacent horizontal footprints for brush IDs 1–4, with one screen-forwarding
call and clean return per case. The overlap capture adds the repeated
`(7,7)→(8,7)→(7,7)` path: the same 12 unique cells, one screen call with all
three points, and 27 predicate calls. The edge capture adds
`(0,0)→(1,0)`: one screen call, one partial fill cell, then `SIMPLE-ERROR`
under the forced predicate. The earlier run `34144809281` is deliberately
non-evidence: a stray probe marker stopped it after b2. The probe must remain
in direct top-level form for now; compiled helper variants failed before their
first resolution marker in the Allegro init-file harness. The next frontier
is real scene context and downstream emission.

Local verification:

- `cd engine && npm test` → 58 passing tests.
- The brush report parser and its real original-engine captures are covered by
  the research-tool suite.
- Research-tool tests are run directly with
  `node --test research/tools/test/*.test.mjs` from the repository root; the
  `research/tools` directory has no separate `package.json`; the suite now has
  22 passing tests.

## Honest progress estimate

Overall completion is approximately **25–35%**. The archaeology, AA protocol,
fixtures, static-analysis tools, numeric primitives, and several isolated
stroke/map/writer boundaries are strong. The high-level artistic decision
system is still mostly unresolved, so this is not yet a parity-equivalent
generator.

| Area | Current state |
|---|---|
| Installer/runtime preservation and isolated oracle | Complete and documented |
| AA parser, renderer, serializer, corpus tools | Mostly complete for observed records |
| Allegro random source and numeric boundaries | Strongly measured; normal startup seed remains unresolved |
| Angles, distance, `LOCK-WIGGLE`, measured `FREE-PATH` subset | Measured fixtures and implementations |
| Stream/writer selectors | Isolated behavior measured; integrated screen/file path remains open |
| Brush profiles, maps, isolated `BRUSH-STROKE` subset | Early measured subset; a direct Stage 23 matrix reproduces adjacent brush-1/2/3/4 footprints, repeated-vertex idempotency, and an edge error boundary; selection, integrated clipping, fill, colour, and state remain open |
| `RAN-HAND` | Four repeated post-`INIT-RANDOM` calls measured and implemented |
| Composition, figures, poses, plants, garments, occlusion | Mostly provisional/unresolved |
| Integrated JS generator | Runnable and deterministic, but not original-equivalent |

Important measured evidence already preserved in the repository includes 6,140
integer/random validation values, 512 floating `RAN` values plus 64 state
checks, 320 `LOCK-WIGGLE` paths, 16 controlled `FREE-PATH` cases, 240
isolated writer cases, brush/map matrices, and bounded integrated traces into
planning, figure generation, fills, brush work, and painting output.

## What is still open

1. Complete the freehand line algorithm and connect it to `DRAW-CFORM` and
   brush output.
2. Recover brush selection, clipping/overlap, fill maps, colour transitions,
   and real screen/file emission.
3. Recover normal startup random-state installation and generator draw order;
   use the controlled post-`INIT-RANDOM` reseed only as a calibration seam.
4. Replace the provisional planner with measured composition, placement,
   pose/anatomy, plants, pots, garments, depth, and occlusion rules.
5. Build integrated seeded holdouts and compare structural traces, state
   consumption, and AA output against the original.
6. Productize the recovered engine without presenting provisional behavior as
   exact parity.

## Immediate next move

Use the local-first workflow:

1. Run the direct research-tool tests and inspect the existing brush-stroke,
   map, and integrated-trace fixtures locally.
2. Extend only behavior already supported by evidence in the JS model and
   tests; do not guess at `SELECT-BRUSH`, clipping, or scene semantics.
3. When a new original-engine observation is required, use the Windows Server
   2022 GitHub Actions oracle with a narrowly scoped probe, preserving a
   baseline and restoring wrappers/bindings with `UNWIND-PROTECT`.
4. Record normalized evidence and update the roadmap before promoting a rule
   from provisional or inferred to measured.

The current research roadmap's next oracle frontier is the real scene context
around `SCREEN-AND-STORE`, followed by downstream `PREP-LINE`/writer tracing.
Existing high-fanout wrappers should be removed only deliberately so later
brush, fill, and message-loop calls become visible without changing the
original call graph.

## Execution split and model handoff

- Local Linux work: JavaScript implementation, parsers, fixture generation,
  report normalization, static analysis, tests, and documentation.
- Windows oracle work: execution of the archived AARON binary and new runtime
  measurements. The current Linux workspace has no reliable Wine/QEMU/Docker
  path; Windows Server 2022 Actions is the reproducible environment. A local
  Windows VM could run the same PowerShell harness.
- Use an Astra Low effort agent only when genuinely stuck on a very complex,
  scoped issue (especially oracle-probe design, compiled-runtime/object-layout
  interpretation, FLA/brush/scene semantics, or exactness decisions). Continue
  routine implementation, testing, and documentation directly.

## Resume checklist

1. Read this file, then `research/reverse-engineering-plan.md`.
2. Check the branch and worktree; preserve any unrelated user changes.
3. Run `cd engine && npm test` and
   `node --test research/tools/test/*.test.mjs` from the repository root.
4. Inspect the newest evidence under `research/introspection/evidence/` and
   the referenced probe before making a claim.
5. Report progress, remaining work, next action, and blockers in the next
   user-facing continuation update without waiting to be asked.
