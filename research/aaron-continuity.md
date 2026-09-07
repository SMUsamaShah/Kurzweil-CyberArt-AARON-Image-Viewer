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

As of 2026-09-07, the recovered checkout is clean at local commit `ccb99fb`
(`Implement measured RAN-HAND helper`). The preceding connected GitHub branch
tip was `0782c0dd9e819e6c9694809de05e1829c5997326`; this handoff is now
published there as remote commit
`2a22bdf4168904bed27332284cabe657875d39d9` and exists locally as
`fce7c5a`. The connector-created commits have different ancestry/SHA values,
so compare the tree and files rather than assuming local and remote commit IDs
are identical.

The latest published change adds:

- `engine/src/aaron-hand.js`, implementing the measured zero-argument
  `RAN-HAND` helper;
- `engine/test/fixtures/ran-hand-post-init.json` and
  `engine/test/aaron-hand.test.js`;
- normalized original-engine evidence at
  `research/introspection/evidence/ran-hand-post-init-34120567298.txt`;
- updates to the plan, oracle notes, and freehand-line notes.

Local verification:

- `cd engine && npm test` → 58 passing tests.
- Research-tool tests are run directly with
  `node --test research/tools/test/*.test.mjs` from the repository root; the
  `research/tools` directory has no separate `package.json`.

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
| Brush profiles, maps, isolated `BRUSH-STROKE` subset | Early measured subset; selection, clipping, fill, colour, and state remain open |
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

The current research roadmap's next oracle frontier is the controlled
`BRUSH-STROKE`/`SCREEN-AND-STORE` path: larger brush IDs and boundary cases,
then the real scene context and downstream writer. Existing high-fanout
wrappers should be removed only deliberately so later brush, fill, and message
loop calls become visible without changing the original call graph.

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
