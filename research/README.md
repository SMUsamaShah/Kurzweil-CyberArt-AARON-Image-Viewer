# Reverse-engineering AARON 2001

This directory records reproducible research toward a clean-room JavaScript
reimplementation of Kurzweil CyberArt AARON.

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

Treat original AARON as an oracle. Infer invariants and distributions from a
large output corpus, then encode those independently in JavaScript. Golden
tests should compare structural decisions and command streams, not merely
screenshots.

## Current documents

- [`component-inventory.md`](component-inventory.md) — verified contents of
  the archived installer.
- [`aa-format.md`](aa-format.md) — current specification of the interchange
  format.
- [`host-protocol.md`](host-protocol.md) — screensaver launch behavior and
  exact scope of the two discovered diagnostic environment variables.
- [`oracle.md`](oracle.md) — dynamic-analysis and corpus protocol.
- [`startup-findings.md`](startup-findings.md) — verified DEP fault and seed-related leads.

## Tools

`tools/extract-installer.mjs` safely extracts and verifies the archived
installer. It never executes the Windows binaries.

`tools/patch-registry-running.ps1` is a disposable-oracle diagnostic. It
requires the exact extracted `registry.dll` hash before applying temporary
entry-point patches to the legacy process/version and trial-age checks; it is
not part of the clean-room JavaScript engine.

`tools/summarize-corpus.mjs` consumes a temporary AA0-AA15 directory and emits
stable structural statistics plus file hashes. It keeps corpus inference
reproducible without storing bulk generated output in the repository.

`aaron-architecture.md` records the clean-room mapping from Cohen's published
planner/matrix description and the recovered DXL module names to the JavaScript
planner, occupancy grid, geometry, and emitter layers.
