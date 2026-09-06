# Reverse-engineering AARON 2001

This directory records reproducible research toward a clean-room JavaScript
reimplementation of Kurzweil CyberArt AARON.

The consolidated roadmap, phase status, immediate queue, and model handoff
policy are in [reverse-engineering-plan.md](reverse-engineering-plan.md).

## Principles

- Preserve the original viewer and its history.
- Do not commit or redistribute the proprietary installer or extracted files.
- Record hashes so independent researchers can verify that they have the same
  archived build.
- Separate facts observed in binaries/output from hypotheses and historical
  interpretation.
- Reimplement behaviour and published artistic methods; do not publish
  reconstructed proprietary Lisp source.
- Keep every engine layer testable against original AARON output.

## Evidence tracks

### Static analysis

Inspect the installer, PE hosts, resources, registry schema, Allegro Common
Lisp heap (`.dxl`), Pure Lisp Library (`.pll`), strings, imports, debug paths,
and file-writing routines without executing untrusted software.

### Dynamic analysis

Run the archived build only in an isolated Windows VM or disposable CI runner.
Trace file, registry, random-number, timing, and process activity. Vary one
input at a time and retain generated AA files as temporary research artifacts.

### Behavioural reconstruction

Treat original AARON as an oracle. Use a small corpus to identify candidate
behaviors, then recover individual decision rules through controlled calls
and binary analysis. Distributions alone cannot establish an exact port.
Comparison tests must use original-engine reference results, not just tests
of our own implementation.

## Current documents

- [`component-inventory.md`](component-inventory.md) — verified contents of
  the archived installer.
- [`aa-format.md`](aa-format.md) — current specification of the interchange
  format.
- [`host-protocol.md`](host-protocol.md) — screensaver launch behavior and
  exact scope of the two discovered diagnostic environment variables.
- [`oracle.md`](oracle.md) — dynamic-analysis and corpus protocol.
- [`oracle-corpus.md`](oracle-corpus.md) — measured trial, small-image, and
  licensed composition regimes, plus the disposable compatibility workaround.
- [`startup-findings.md`](startup-findings.md) — verified DEP fault and seed-related leads.
- [`runtime-introspection.md`](runtime-introspection.md) — live function inventory,
  retained signatures, and corrections to the failed seed experiment.
- [`introspection/function-groups.md`](introspection/function-groups.md) — a
  deterministic name-only grouping of the retained symbols for probe planning.
- [`freehand-line.md`](freehand-line.md) — Paul Cohen's article supplied by Usama,
  its relevance to the 2001 build, and the next line-algorithm probe.
- [`tools/parse-function-constants.mjs`](tools/parse-function-constants.mjs) — strict
  parser for the bounded compiled-function constant reports preserved from
  completed Windows probes.
- [`random-findings.md`](random-findings.md) — Allegro 5.0.1 MT initialization,
  numeric conversions, 6,140 validation values, and floating RAN methods.
- [`angle-findings.md`](angle-findings.md) — ANGLE-RANGE reconstruction,
  NORM-A, ANGLE-DIF, measured double rounding, and independent validation.
- [`point-findings.md`](point-findings.md) — measured XYDIST and LOCK-WIGGLE
  geometry, seeded path comparisons, and dependency-trace controls.

## Tools

`tools/extract-installer.mjs` safely extracts and verifies the archived
installer. It never executes the Windows binaries.

`tools/patch-registry-running.ps1` is a disposable-oracle diagnostic. It
requires the exact extracted `registry.dll` hash before applying temporary
entry-point patches to the legacy process/version and trial-age checks; it is
not part of the clean-room JavaScript engine.

`tools/patch-license-version.ps1` is a separate, hash-guarded diagnostic for
the exported `license.dll!KCATversion` Boolean. It is used only on the
disposable installed copy to test the Premium branch described by the bundled
license resource; it never modifies the extracted original or the repository.

`tools/summarize-corpus.mjs` consumes a temporary AA0-AA15 directory and emits
stable structural statistics plus file hashes. It keeps corpus inference
reproducible without storing bulk generated output in the repository.

`aaron-architecture.md` records the clean-room mapping from Cohen's published
planner/matrix description and the recovered DXL module names to the JavaScript
planner, occupancy grid, geometry, and emitter layers.
