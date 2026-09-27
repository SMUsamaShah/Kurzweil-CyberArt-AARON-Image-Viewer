# Original-engine oracle protocol

The archived Windows build is used as an oracle: it supplies observable input
and output behaviour against which the independent JavaScript implementation
can be tested. Generated files are research artifacts, not source code.

## Why a large corpus is needed

The AA syntax can be learned from a handful of files. The generator cannot.
Each painting exposes only one traversal through a large probabilistic rule
system. A corpus is needed to distinguish invariants from coincidences and to
exercise uncommon branches such as different figure counts, poses, garments,
plant structures, occlusion relationships, and palette families.

Hundreds is an initial coverage target, not a magical threshold. Collection
stops when structural coverage and estimated distributions stabilize.

## Controlled dimensions

Vary one factor at a time:

- screen resolution: 1024×768, 1280×1024, 1600×1200, plus fallback behaviour;
- application versus screensaver host;
- clean versus populated registry state;
- clock, locale, and timezone;
- process start versus multiple paintings in one process;
- `KCAT_AARON_DEBUG` and `ACL_STARTUP_DEBUG` presence/value;
- `KCAT_AARON_SMALL_IMAGE` presence/value;
- license result (`license.dll!KCATversion`) with the clean trial path kept as
  the control;
- intercepted random and time APIs, where technically possible.

## Per-run capture

- Original AA files and cryptographic hashes.
- Process command line, executable hashes, and environment overrides.
- Registry snapshots before and after.
- File/process/registry/API trace.
- Start/end timestamps and painting sequence number.
- Rendered PNG for visual triage.
- Parsed command statistics and inferred scene features.

## Questions the corpus answers

1. Which decisions are deterministic functions of a seed?
2. Which rules are hard constraints and which are weighted choices?
3. How are objects placed, scaled, layered, and prevented from colliding?
4. Is painting order derived from geometric depth or object class?
5. Are palettes assembled from fixed families, transformations, or both?
6. How do freehand paths become eight-direction brush walks?
7. Which engine branches are present but rare or inaccessible through the UI?

## Safety and repository policy

For the local machine, run from a verified disposable runtime copy, clear
credential-bearing child-process environment variables, and capture output in
an ignored research directory. A disposable Windows VM/runner provides stronger
isolation for broader experiments. Do not commit the installer, extracted
proprietary runtime, registry license data, or bulk generated corpus. Retain
small golden samples only when their provenance and redistribution status are
clear.

The manual GitHub Actions workflow in `.github/workflows/aaron-oracle.yml`
implements the first reproducible probe. It verifies every extracted runtime
file, silently installs the MSI to initialize legitimate trial state, removes
runner credentials from the child-process environment, blocks the original
executables from outbound network access, captures registry/process evidence,
and uploads only logs plus generated AA files. Probe variants can compare OS
compatibility layers and Allegro startup diagnostics. The screensaver-host
debug switch is tested only when host lifecycle evidence is needed.

## Local-first workflow

All source-level work can run locally. From the repository root, the JavaScript
engine and research parsers need only Node:

```powershell
Push-Location engine
node --test --test-isolation=none
Pop-Location
node --test --test-isolation=none research/tools/test/*.test.mjs
```

The explicit test-isolation flag avoids blocked parallel worker launches in
this Windows workspace. This checkout has Node but no `npm` command.

Static installer analysis and normalization also run locally. Keep the
original installer, extracted runtime, and generated AA files untracked (the
`research/extracted/` path is ignored). On a Windows machine or VM, the older
general oracle harness can be run with PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File research\oracle\run-oracle.ps1 `
  -ExtractedRoot C:\path\to\aaron-extracted `
  -OutputRoot C:\temp\aaron-oracle `
  -Mode direct-screensaver
```

### Local Windows 10 scene oracle (2026-09-26–27)

The current Windows 10 Pro 22H2 machine runs the original `AARON.exe` from a
disposable copy of the extracted files. The local scene-state runner needs an
existing, ordinary `C:\temp` directory; it refuses to overwrite known AARON
files already there. After the verified installer is extracted, run from the
repository root:

```powershell
node research\tools\extract-installer.mjs AARONsetup.exe research\extracted\aaron 7z.exe
.\research\oracle\run-local-scene-state.ps1 `
  -ExtractedRoot research\extracted\aaron `
  -OutputRoot research\extracted\local-oracle\scene-baseline `
  -RunId local-scene-baseline -Mode baseline -SmallImage
```

Use a different output directory and `-Mode seed-1234` for each fresh seeded
repeat. `-Mode writer-seed-1234` adds read-only entry/exit snapshots for the
first real `PREP-LINE` and `STORE-IN-FILE` calls under the same controlled
seed; it leaves the original functions in place. `7z.exe` may be replaced
with the path to a local 7-Zip executable.
`-Mode transition-seed-1234` also captures selected first colour/brush
boundaries and the first natural `SELECT-BRUSH` return.
`-Mode plan-seed-1234` captures the first and first non-`NIL` natural
`SCRIPT(PLAN)` returns without making an extra reader call.
`-Mode writer-stream-seed-1234` captures the first natural writer's verified
`VISPT` coordinates and queries its existing output stream's position at entry
and exit.
`-Mode writer-sequence-seed-1234` extends this to the first 64 naturally
occurring writer calls with paired compact records, leaving the original
stream and function results intact.
`-Mode writer-windows-seed-1234` counts every natural writer selector and
samples 299 calls in short windows around the first colour/brush, hue/fill,
and final close transitions, plus later painting intervals. It observes
bounded argument types, point coordinates, stream positions, and the original
previous point before and after each sampled call, along with `?FILE-SIZE?`.
`-Mode writer-full-seed-1234` records all natural writer calls in one buffered,
50,000-call-capped tape at `capture\aaron-writer-full.txt`. The tape includes
typed arguments, previous-point state, and entry/exit positions. The matching
offline check is:

```powershell
node research\tools\compose-full-aa0.mjs `
  research\extracted\local-oracle\writer-full-seed-1234-a\capture\aaron-writer-full.txt `
  research\extracted\local-oracle\writer-full-seed-1234-a\capture\image `
  research\extracted\local-oracle\writer-full-seed-1234-a\capture\aa0
```

`-Mode writer-full-seed-5678` applies the same observation to the established
second calibration seed. Every run needs its own unused `-OutputRoot`.
`-Mode select-brush-matrix-seed-1234` runs a one-shot, 25-input boundary
matrix after the first natural `SELECT-BRUSH` return, using the already
installed trace wrapper. It records result identity, brush binding, and cloned
random-state previews in `capture\aaron-select-brush-matrix.txt`. The completed
local run preserved the controlled seed-1234 AA0 hash.
`-Mode natural-free-path-seed-1234` wraps `FREE-PATH` after the seeded trace
loads and records its natural edge/result points and RNG previews in
`capture\aaron-free-path-natural.txt`. The completed local run observed three
calls and preserved the same AA0 hash.
`-Mode natural-free-path-ran-seed-1234` adds a bounded RAN trace only inside
those natural calls, recording typed arguments/results without advancing the
live RNG for observation. `-Mode natural-free-path-seed-5678` repeats the point
capture on the independent seed-5678 holdout; its one natural call and AA0
hash match the prior controlled baseline. The strict parser and comparison
tool retain compact evidence for both seeds.
`-Mode screen-unit-seed-1234` records the first eight natural
`SCREEN-AND-STORE` path inputs and output file positions alongside the full
writer tape. `research/tools/derive-screen-unit-evidence.mjs` checks their
point-to-writer calls and byte slices, then writes the compact retained
fixture. `-Mode screen-unit-seed-5678` repeats this capture on an independent
painting. Both completed runs preserved their respective baseline AA0 hashes.
The runner verifies every extracted file against the manifest, patches only
copies in its run directory, starts AARON without the XP compatibility
environment, archives generated AA/report files, validates the scene report,
and cleans the files it staged under `C:\temp`. It saves `summary.json` and
`scene-state.json` alongside the captured outputs. It saves and restores the
per-user AARON registry values that it changes. The installer is not executed.

The two hash-guarded copy patches are research compatibility shims. The
existing [`tools/patch-registry-running.ps1`](tools/patch-registry-running.ps1)
returns zero from `registry.dll!KCATisRunning` and
`KCATgetDaysSinceInstalled`, removing the obsolete host/version check and
trial-age failure. The new
[`tools/patch-license-user-registry.ps1`](tools/patch-license-user-registry.ps1)
changes only the `license.dll` instructions supplying the root argument to
`RegOpenKeyExA` and `RegCreateKeyExA`, sending those calls to
`HKEY_CURRENT_USER` instead of `HKEY_LOCAL_MACHINE`. The local test produced
complete paintings without changing the Windows system clock or modifying the
original extracted DLLs. This establishes an accessible trial-mode oracle;
it does not establish licensed-mode behavior or whole-generator JavaScript
parity. Keep the patched DLLs and generated AA files out of Git.

The fresh post-`INIT-RANDOM` seed-1234 runs produced identical scene reports
and complete AA0 files. Two writer-boundary repeats also produced identical
seven-snapshot reports and the same AA0 bytes. See
[`scene-context-findings.md`](scene-context-findings.md) and the
[`introspection/evidence/README.md`](introspection/evidence/README.md) for
the state observations and hashes. Two transition repeats and two PLAN reader
repeats also have matching reports within each mode and identical seeded AA0
bytes. Two writer-stream repeats additionally locate the first command bytes
in the temporary `image` stream and final AA0 file. The older Windows Server
2022 Actions
workflow remains a separate execution environment, useful for cross-host
checks. Wine and other Windows versions are not assumed equivalent until they
reproduce a controlled output.

## First probe result

Run 1 on Windows Server 2025 established that silent installation and trial
registry initialization work. Both direct-engine variants exited after about
six seconds with `0xC00000FD` (`STATUS_STACK_OVERFLOW`) before producing an AA
file. The identical results with and without `KCAT_AARON_DEBUG` are consistent
with the static finding that the variable is read by the screensaver host, not
the engine. Follow-up probes target Windows Server 2022, the Windows XP
compatibility layer, and `ACL_STARTUP_DEBUG`, and now capture Application event
log records for fault-module evidence.
