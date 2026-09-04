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

Run the binary only in a disposable Windows VM/runner with no credentials and
no writable checkout token. Do not commit the installer, extracted proprietary
runtime, registry license data, or bulk generated corpus. Retain small golden
samples only when their provenance and redistribution status are clear.

The manual GitHub Actions workflow in `.github/workflows/aaron-oracle.yml`
implements the first reproducible probe. It verifies every extracted runtime
file, silently installs the MSI to initialize legitimate trial state, removes
runner credentials from the child-process environment, blocks the original
executables from outbound network access, captures registry/process evidence,
and uploads only logs plus generated AA files. Probe variants can compare OS
compatibility layers and Allegro startup diagnostics. The screensaver-host
debug switch is tested only when host lifecycle evidence is needed.

## First probe result

Run 1 on Windows Server 2025 established that silent installation and trial
registry initialization work. Both direct-engine variants exited after about
six seconds with `0xC00000FD` (`STATUS_STACK_OVERFLOW`) before producing an AA
file. The identical results with and without `KCAT_AARON_DEBUG` are consistent
with the static finding that the variable is read by the screensaver host, not
the engine. Follow-up probes target Windows Server 2022, the Windows XP
compatibility layer, and `ACL_STARTUP_DEBUG`, and now capture Application event
log records for fault-module evidence.
