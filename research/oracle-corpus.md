# Oracle corpus and licensing experiments

These measurements come from disposable Windows Server 2022 runners. The
original installer and extracted binaries are not committed. Each run disables
DEP only for the process, patches the legacy registry compatibility exports on
the installed copy, and records the output hashes.

## Why collect more than one file?

One file is enough to validate the parser and renderer. A small corpus is
needed to distinguish a stable rule from an accident of one random scene:
canvas aspect selection, palette-family selection, z-path use, brush widths,
and the relative amount of outline versus paint. Sixteen is especially useful
because the product's Premium description says that it can save and review up
to sixteen paintings; the normal oracle run therefore exercises the same
sequence the UI was designed to retain.

Hundreds of files are not a prerequisite for the JavaScript engine. They would
only improve distribution estimates and expose rare planner branches after the
first implementation is working. The current sixteen-file controls already
separate the large trial, small-image, and licensed output regimes.

## Measured regimes

| Regime | Route and switch | Files | Canvas sizes | Palette sizes | Mean outline ops | Mean paint ops | Mean chain segments |
|---|---|---:|---|---|---:|---:|---:|
| Trial, normal | direct engine; registry/DEP compatibility only | 16 | 487×768 (2), 650×768 (3), 768×768 (4), 1024×768 (7) | 148 (14), 184 (2) | 4,417.56 | 98,659.31 | 89,350.44 |
| Trial, small-image | `KCAT_AARON_SMALL_IMAGE=1` | 16 | 320×480 (11), 640×480 (5) | 148 (15), 184 (1) | 3,691.25 | 43,366.81 | 38,084.06 |
| Licensed branch | `license.dll!KCATversion` patched to return 1 | 16 | 320×480 (13), 640×480 (3) | 148 (14), 184 (2) | 2,282.44 | 37,393.94 | 32,900.94 |
| Runtime build flag only | license return 1 plus `.clinit.cl` setting `*BUILD-PREMIUM*` | 16 | 320×480 (14), 640×480 (2) | 148 (16) | 2,922.75 | 34,221.25 | 30,007.25 |

The retained image-size variables provide a more useful workaround than the
ordinary small-image switch. A source-free `.clinit.cl` probe can set
`SMALL-IMAGE-SCREEN-WIDTH` and `SMALL-IMAGE-SCREEN-HEIGHT` before composition.
The three single-painting probes below stored half the requested width and
the requested height. This does not yet establish a universal rule: compact
corpora also contain full-width canvases.

| Probe | AA header | Outline ops | Paint ops |
|---|---:|---:|---:|
| width 1024, height 768 | 512×768 | 1,123 | 47,513 |
| width 1920, height 1080 | 960×1080 | 2,699 | 101,522 |
| width 3840, height 1080 | **1920×1080** | 3,530 | 170,665 |

The 3840×1080 probe completed in 10.9 seconds and wrote a valid 708,794-byte
`AA0` with the normal 148-entry palette. This is the first direct evidence of
a practical full-HD output path hidden behind the retained size variables. It
is still an oracle workaround rather than a historical UI option: the
shareware window remains clipped to the 1024×768 runner desktop and keeps its
trial title, while the saved AA canvas is 1920×1080. The captured file's
SHA-256 is `10c1f0e511efcae4d118b00c9bf607f5bc342f10ef72764dc05d6dceb71d34d3`.

The licensed branch is not merely a title change. It switches to the compact
320/640×480 family, changes command distributions, and uses `zm`/`zd` outline
paths (47/2,774 in the sixteen files). The clean trial large corpus used
`zm`/`zd` only 44/2,430 times, while the explicit small-image trial used
25/963. The screenshot title for direct licensed runs no longer contains the
“Free Trial Copy” suffix.

The `*BUILD-PREMIUM*` hook loaded in `COMMON-GRAPHICS-USER`, and its sampled
corpus had no z-path commands and all sixteen palettes had 148 entries. That
does not establish a timing or caching mechanism. The runtime census later
found that the original value is integer `0`, while the old hook assigns `T`.
Its type and callers must be recovered before interpreting the experiment.
Uncontrolled random-scene differences alone also cannot prove distinct rules.

Application mode is a separate UI path. `Ctrl+O` (`Paint One`) produced a
complete 320×480/148-color file in both the clean-trial and return-1 runs, but
the application window title retained the trial suffix in both. The two files
are independent random scenes, so their different operation counts do not by
themselves prove a content branch. Direct screensaver mode is the reliable
route for testing the licensed composition branch.

## Reproducible workaround

`research/oracle/run-oracle.ps1` now composes the following disposable probes:

1. Disable DEP for the installed `AARON.exe` only. The original fault is an
   execution-protection violation in `AARON.dxl`.
2. Hash-check and patch only `registry.dll!KCATisRunning` and
   `KCATgetDaysSinceInstalled` to return zero, bypassing the obsolete OS-version
   and trial-age checks while leaving directory/version/delay calls intact.
3. Optionally hash-check and patch only `license.dll!KCATversion` to return 1.
   This reaches the compact licensed composition through the direct engine
   route; it never changes the extracted source artifact.
4. Optionally copy a source-free `.clinit.cl` probe into the installed working
   directory. This is useful for symbol experiments, but changing
   `*BUILD-PREMIUM*` has not established a content change.
   The same hook can set the retained `SMALL-IMAGE-SCREEN-WIDTH` and
   `SMALL-IMAGE-SCREEN-HEIGHT` variables. Three samples had half-width
   saved canvases, including the 1920×1080 result above, without modifying
   AARON's image or executable. The canvas selection rule is still unresolved.

The patch scripts refuse unknown hashes and report every RVA, file offset,
original prologue, and resulting hash. They are research harnesses, not part of
the clean-room JavaScript runtime.

## Current implication for the JS port

The engine now exposes the observed large and small canvas families, two-phase
AA emission, outline z-paths, palette and brush state, a seeded MT19937 source,
and the Cohen-inspired planner/matrix boundary. The licensed corpus gives us a
separate oracle target for the next composition layer. It should be modelled
as an explicit `premium`/compact profile only after the planner and content
rules are calibrated; selecting a smaller canvas alone is not an exact port.
