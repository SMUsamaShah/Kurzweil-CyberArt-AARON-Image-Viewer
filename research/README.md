# Reverse-engineering AARON 2001

This directory records reproducible research toward a clean-room JavaScript
reimplementation of Kurzweil CyberArt AARON.

The consolidated roadmap, phase status, immediate queue, and model handoff
policy are in [reverse-engineering-plan.md](reverse-engineering-plan.md).
The short cross-conversation resumption record is
[aaron-continuity.md](aaron-continuity.md).

The current [native analysis workflow](native-analysis-workflow.md) combines
exact PLL byte matching, standalone Ghidra and runtime caller capture. Its first
result is the [measured SELECT-BRUSH caller](introspection/select-brush-caller.md).
The follow-up [count and assignment capture](introspection/brush-fill-count.md)
tracks all 274 selectors across two controlled paintings and maps the actual
MY-FILL generic methods. The [POST-FILL comparison](introspection/post-fill-count.md)
reproduces its SUBFORM count rule, and [three fill-preparation functions](introspection/fill-preparation.md)
now match 427 calls each and 1,883,204 output cell comparisons summed over
their captured regions. The [boundary-map helpers](introspection/boundary-map.md)
match all 149 list writes and 70 inclusive frame clears, with 33,638,400
full-map output cell comparisons. All 149 composed CFORM preparation cases
also match. [SUBFORM boundary construction](introspection/subform-boundary.md)
now derives PATCH-EDGE outlines and LIST-FRAME bounds for all 278 natural
cases, and composes them through POST-FILL with 85,401,600 complete output-map
cell comparisons. Both maps equal their input state at PATCH-EDGE exit and
MY-FILL entry, before the composed fill changes them.
The [row scanner and neighbor rule](introspection/scan-row.md) now match all
5,805 natural scans, 6,984 nested neighbor calls, and the 44,544 neighbor /
10,368 scan matrix cases repeated in each painting. Independent row seeds
compose all 278 SUBFORM fills with the same complete-map parity. Caller row
bounds, MAX and patch selection are now derived by
[BRUSH-FILL preparation](introspection/brush-fill-preparation.md): 134 initial
rows, 138 selections, 5,805 row inputs and 278 budgets match the natural
plan/frame inputs. The complete schedule and earlier maps remain dependencies;
[CFORM POST-FILL](introspection/cform-post-fill.md) now matches all 149 calls,
45,772,800 full output cells and the complete outline-to-fill composition.
The [complete natural stroke census](introspection/brush-stroke-census.md)
pairs all 3,881 strokes, including 70 value-3 strokes, and 70 clears with fresh
controls. It measures counts and first-seen CORE geometry; natural brush-stroke
map history and the complete BRUSH-FILL schedule follow.

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

Run the archived build from a disposable, verified runtime copy on Windows.
The local Windows 10 scene oracle and the disposable CI runner are both
documented in [`oracle.md`](oracle.md). Trace file, registry, random-number,
timing, and process activity. Vary one input at a time and retain generated AA
files as temporary research artifacts.

### Behavioural reconstruction

Treat original AARON as an oracle. Use a small corpus to identify candidate
behaviors, then recover individual decision rules through controlled calls
and binary analysis. Distributions alone cannot establish an exact port.
Comparison tests must use original-engine reference results, not just tests
of our own implementation.

## Current documents

- [`component-inventory.md`](component-inventory.md) — verified contents of
  the archived installer.
- [`static-image-findings.md`](static-image-findings.md) — locally validated
  DXL/PLL table structure, first-table object spans, DXL descriptor/source
  chains, exact indexed string references, artifact completeness boundary, and
  the anonymous bounded x86-like candidate profile.
- [`scene-context-findings.md`](scene-context-findings.md) — package-qualified
  scene targets joined from static names and traces, plus controlled local
  snapshots around drawing, file emission, colour/brush selection, and a
  naturally invoked PLAN reader.
- [`clean-room-integration.md`](clean-room-integration.md) — current local
  composition-frame and measured FREE-PATH integration checkpoint, with sweep
  metrics and explicit provisional boundaries.
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

`tools/profile-x86-candidates.mjs` uses a bounded local GNU `objdump` pass to
summarize the anonymous DXL prologue candidates. It records conservative and
assumed-indirect-call-return decoder views, an independently decoded branch
worklist, boundary controls, and uncertainty categories; it does not map
machine code to Lisp symbols or retain executable payload bytes.

`tools/parse-scene-state-report.mjs` validates the sanitized report from the
focused scene-context companion. The local Windows runner
`oracle/run-local-scene-state.ps1` now produces baseline and controlled seeded
reports, plus focused writer, transition, and PLAN-return snapshots, without
changing the system clock; see
[`scene-context-findings.md`](scene-context-findings.md).
`tools/verify-writer-image-suffix.mjs` checks a captured temporary `image`
stream against the final AA0 command suffix and retains only bounded hashes,
offsets, and the first natural writer slice.
`tools/summarize-writer-sequence.mjs` turns a bounded natural writer trace
into a portable per-call input/output fixture after checking every captured
stream slice against the complete AA0 command suffix.
The repeat-verified windowed fixture covers 299 calls across all nine selector
families used by one controlled painting, with exact original previous-point
state. See [`stroke-findings.md`](stroke-findings.md).
The [active execution plan](execution-plan.md) prioritizes continuous whole
writer replay and then moves the JS drawing boundary upstream, with explicit
milestones and Luna-agent work packets.

`tools/patch-registry-running.ps1` is a disposable-oracle diagnostic. It
requires the exact extracted `registry.dll` hash before applying temporary
entry-point patches to the legacy process/version and trial-age checks; it is
not part of the clean-room JavaScript engine.

`tools/patch-license-user-registry.ps1` redirects two `license.dll` registry
API root arguments to the per-user hive in a hash-verified disposable copy.
Together with the registry patch, it enables trial-mode local execution with
no system clock change. Details and scope are in [`oracle.md`](oracle.md).

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
