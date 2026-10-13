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
disposable copy of the extracted files. The local scene-state runner needs a
resolvable, writable `C:\temp` path; it refuses to overwrite known AARON files
already there. After the verified installer is extracted, run from the
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

#### `C:\temp` staging and permissions

The archived application and its Lisp probes use absolute paths such as
`C:\temp\image` and `C:\temp\scene-state-snapshot.cl`. Changing `%TEMP%` does
not redirect those paths. The runner first checks for reserved filenames,
then creates and removes a uniquely named write-probe file before it creates
`-OutputRoot`. This catches the case where `C:\temp` exists but the current
execution context cannot write there.

On this Codex workspace, the physical `C:\temp` directory was outside the
default writable area and staging failed with `Access Denied`. On 2026-09-27,
`C:\temp` was changed to a symbolic link targeting
`D:\ReverseEngineerAaron\research\artifacts\temp`. `Get-Item C:\temp` confirmed
the target, and a default-sandbox create/delete probe succeeded there. This
works because the target is inside the writable repository. A symlink only
redirects the path; it does not grant NTFS permission. If the target is moved
outside a writable area or its ACL denies access, the runner's preflight will
still fail. Check the link with:

```powershell
Get-Item -LiteralPath C:\temp -Force |
  Format-List FullName,LinkType,Target,Attributes
```

On 2026-10-04, the same link target and a default-sandbox write/read/delete
probe were revalidated. After the final native caller run, `C:\temp` was empty
and no AARON process remained. Recheck the link and write preflight each session.

The `C:\temp` preflight is separate from the registry access the oracle needs.
The runner creates or updates
`HKCU:\Software\Kurzweil CyberArt Technologies\AARON`, saves its previous
values, and restores them in `finally`.
The first restricted command context denied that registry write even after the
symlink made `C:\temp` writable. This is separate from staging: rerun the same
local-oracle invocation through scoped elevation, or use a direct PowerShell
account permitted to update that per-user key. The runner does not change the system clock.

On 2026-10-12, scoped elevated invocation completed three fresh controls and
one v5 observer run at full resolution; all four runs were complete, and the
runner removed its staging files. The permission boundary is the runner's
per-user registry setup, not Java: the local original-runtime workflow
launches `AARON.exe` and does not require a Java process. If the `C:\temp`
preflight passes but the registry write is denied in the current command context, use
scoped elevation for this exact PowerShell runner instead of changing the
symlink target or machine ACLs. The link target and empty staging directory
were rechecked after the sequence.

The runner leaves pre-existing reserved files untouched and stops if one is
present. Inspect and back up a collision before moving it out of the way; do
not delete an unknown `C:\temp` file just to start a run. A failure after
`-OutputRoot` creation can leave a partial folder under ignored
`research/extracted/local-oracle/`; use a fresh unused output path for the next
attempt. The runner stages its own named files and normally copies them into
the capture folder, then removes those staged copies in `finally`.

A cancelled tool call does not establish that the oracle stopped. Before
starting another run, inspect the AARON process, reserved `C:\temp` files and
the owned output root. The first FOOB run finished and archived a complete
tape after its tool call was interrupted. Preserve that root and validate its
summary, observer footer and control bytes; use a new root for any retry.

The required-probe runner also stages a 21,287,184-byte planning trace for the
common `writer-stream-seed-1234` mode. A D:-based output root duplicates that
trace during final archival. If the staging target has little free space, use
[`prepare-local-aaron-oracle-run.ps1`](tools/prepare-local-aaron-oracle-run.ps1)
to create an ignored run path under `research/extracted/local-oracle/` backed
by `C:\AaronOracleRuns`, and confirm its free-space preflight before launching.
For a run that stopped during archival, use
[`recover-aborted-local-aaron-run.ps1`](tools/recover-aborted-local-aaron-run.ps1)
only after AARON exits; it archives and verifies files created by that run and
does not remove older staging files. Details and commands are in
[`tooling-workarounds.md`](tooling-workarounds.md#low-disk-space-and-interrupted-staging).

Optional native probes use `-PreSceneProbePath`, declared
`-ProbeOutputNames`, and a bounded `-PreSceneProbePauseSeconds` shorter than
`RunSeconds`. The runner hashes the staged probe before launch and writes an
owned `pre-scene-probe-request.json`. The release marker
`aaron-native-code-release.txt` is reserved; capture helpers require a positive
pause request for the selected runtime and release it after capture or setup
failure. The marker and declared outputs are archived and cleaned alongside
the runner's other files. The complete native workflow is in
[native-analysis-workflow.md](native-analysis-workflow.md).

One Allegro-specific path detail was also found while loading the call-trace
probe through this symlink. The probe creates its checkpoint file and then
appends the setup report to that same path; reopening it with `:supersede`
stopped after the checkpoint on this setup. The second open now uses
`:append`, and the setup proceeds through `TRACE-READY`.

A Lisp FILE-ERROR does not establish a `C:\temp` permission problem. Probe
macros can attempt to load missing runtime modules: earlier logs identify an
unavailable `loop.fasl`. Use DOTIMES/DOLIST rather than LOOP in new probes.
The 2026-10-05 map attempt failed inside iteration even though staging was
writable; its replacement captured complete maps and restored the control AA0.
Check the probe's own errors/completion and control bytes, as well as the
runner summary. See [the POST-FILL findings](introspection/post-fill-count.md).

An error-free probe can still perturb output. The first 2026-10-05
fill-preparation observer produced a different AA0: copied random-state
previews localized one advance to its first additional RX accessor call.
Removing the unused LX/RX reads restored whole-output equality in both seeds;
the final probe observes only the needed LY/TY frame values and checks copied
previews around every snapshot. The accessor's internal mechanism remains
unresolved. Treat extra readers as executable calls, and compare fresh control
bytes even when the probe's error count is zero. See
[the preparation findings](introspection/fill-preparation.md).

A trailing logging/flush form can also replace an original return value. The
first SCAN-ROW observer finished with zero errors, but a WHEN after its
UNWIND-PROTECT returned NIL to the caller instead of the captured TRIPT. The
drawing changed and PATCH-EDGE was never entered. Preserve original multiple
values with MULTIPLE-VALUE-PROG1 when logging follows the original call, as
well as through cleanup. Review what each complete wrapper returns, not just
what its RETURN record prints. Frozen v2 and both fresh controls pass; v1 is
diagnostic only. See [the scanner findings](introspection/scan-row.md).

Map cache fields in a Lisp property list need careful ownership: SETF GETF of
a new key can prepend it only to a helper's local list binding. The first CFORM
POST-FILL observer preserved AA0 but recorded 67 AFTER errors and zero map
cells because its outer context lacked those fields. Initialize every cache
key before passing the list to helpers, or return and assign the updated list.
Frozen v2 captures complete maps and passes both controls. Reject incomplete
tapes even when output bytes match. See
[the CFORM findings](introspection/cform-post-fill.md).

Large map observers can exceed the run limit without a staging permission
failure. The first SUBFORM observer also required SUBP-COUNT before its first
binding; record the unbound state explicitly rather than treating it as a
missing map. Its next version captured valid boundaries but repeated full RLE
snapshots did not finish within 280 seconds. The final observer saves typed
input vectors using COPY-SEQ of a displaced rank-one view, checks full EQUALP
contents and EQ map identities at intermediate boundaries, and serializes
complete input/output maps once. Use the runner's 600-second limit for this
large capture, require observer END/completion and fresh control bytes, and
reject false equality flags until a full intermediate capture explains them.
An interrupted or timed-out runner may archive partial reports without writing
`summary.json`; those reports are diagnostics, not completed evidence. See
[the SUBFORM boundary findings](introspection/subform-boundary.md).

The runner's `summary.complete` checks the scene report and AA0 terminator;
it does not require completion of an arbitrary `-ProbeOutputNames` report.
Once those scene files finish, it stops the process and archives staged files.
Require the observer's own installation/READY, paired calls, COMPLETE and END
before using its tape. The first buffer observer preserved the drawing but
never logged MAIN installation/READY and ended during the last clear, with no
footer. Its last installation was an experimental `.INV-S-AREF` replacement;
the exact installation error is not captured. That tape is diagnostic only.
The replacement observes complete natural function boundaries without that
primitive hook. An archived partial report is not a staging-permission failure.

For new long post-MAIN captures, use the separate
[`run-local-scene-state-required-probe.ps1`](oracle/run-local-scene-state-required-probe.ps1)
runner. It retains the historical runner's staging, registry/environment
restoration and cleanup. Every optional probe must declare both
`-RequiredProbeOutputName` (also in `-ProbeOutputNames`) and
`-RequiredProbeEndMarker`. It waits for the drawing, scene and case-sensitive
terminal probe END line, then rechecks the archived terminal line. Requests
and summaries bind the runner hash and required marker. Uninstrumented
controls use the same new runner with no optional probe. Use a fresh root and
the supported 600-second watchdog when needed. The END check does not validate
the observer's counters, state, errors or truncation; its strict offline
parser must still reject incomplete cases. Keep the historical runner frozen
for existing published source closures. Before launch, also check Lisp lexical
scope for deferred wrappers: balanced parentheses alone did not catch a
`MAIN` wrapper accidentally nested inside its helper. The reusable
[`check-lisp-probe-scope.mjs`](tools/check-lisp-probe-scope.mjs) checks chosen
forms at their expected depth; the required report must still contain its
observer-specific `INSTALL`, complete case rows, restoration result and
terminal `END`.

### Paused metadata capture uses READY and END separately

When a native-code helper must read the owned process during a pre-scene pause,
the probe report needs two distinct markers. Write READY after the metadata is
complete but before pausing; call capture-aaron-native-code.ps1 with
MetadataEndMarker set to that READY line. The helper reads the selected native
windows and writes the release file. After release, the probe writes its
capture-wait result and then the required terminal END line. The runner's
RequiredProbeEndMarker remains END, and END must be the final report line.
Never append a footer after END. The ready marker proves the helper may start;
only the runner's terminal END check proves the probe finished its handshake.
See the reproducible recipe in tooling-workarounds.md.

Read the first AA0 header to determine the captured canvas; do not infer it
from `summary.smallImage`. On 2026-10-13, three complete
`writer-stream-seed-1234` runs from the required-probe runner reported
`smallImage=false` but each AA0 header was `320 480 148`. Their six output
artifacts matched across the observer and fresh before/after controls. Keep
those 320x480 artifacts separate from the 768x1080 composite-loader/native-
caller captures. The 768x1080 and 320x480 runs used the same mode, runner,
installer, and patched library hashes; their first captured `FILL-MAP` types
match their AA0 headers. The current desktop reports 1920x1080, and a fresh
uninstrumented check again produced 320x480 with the prior 320x480 AA0 and
scene-report hashes. The cause remains unknown; do not infer the canvas from
`smallImage` or force a different display mode to match old evidence. See the
[ZERO-EDGE reference census](introspection/zero-edge-native-links.md).

The later canvas-size follow-up on 2026-10-13 produced a fresh complete
768x1080 writer-stream triplet with matching no-probe controls. This is a
separate regime from the earlier 320x480 triplet above; both report
smallImage=false and use the same runner, mode, installer, and patch hashes.
The new boundary capture finds the first state difference after
SET-UP-SCREEN-SIZE, while its entered screen globals match. It does not
identify the internal query or its cause. Keep both sets separated and see
[canvas-size findings](introspection/canvas-dimensions.md) and
[portable evidence](introspection/evidence/canvas-size-native-links-20261013.json).

The ZERO-EDGE contract investigation has three excluded attempts: v1's
serializer scope errors, v2's changed painting despite zero errors, and v3's
incomplete MAIN installer despite matching painting/scene bytes. Frozen v4
samples only after original MAIN returns, preserves its multiple values and
errors, and records its own COMPLETE/END before closing the observer stream.
Its fresh g/h control passes. Require the observer footer and actual control
bytes, and do not move the sample back into pre-seed startup. See
[the contract findings](introspection/zero-edge-contract.md). This probe does
not call ZERO-EDGE or establish its PERIM argument's meaning.

The 2026-10-11 ZERO-EDGE single-call v1/v2 observers preserve the drawing but
fail before snapshots or a target call. V2's condition text says `malformed if
statement`: its completion SETF is a fourth IF argument. Balanced delimiters
and INSTALL/READY do not establish that every deferred observer body is valid.
Check IF argument count as well as SETF pairs, handler clauses and lexical
scope. Preserve rejected sources, repair in a separate version, and require
the repaired report's own completion. See
[the isolated-call record](introspection/zero-edge-traversal-single.md).

Fresh controls on 2026-10-11 also record 768x1080 natural maps rather than the
earlier 320x480 maps. The configuration change's cause is uninvestigated. Use
current source-bound controls and measured map dimensions; do not promote a
match to an old hash into current parity, or diagnose a vector limit without
the actual failing-stage record and condition.

ZERO-EDGE's positive PERIM 3 sample returns a proper five-point list after
the lower samples return NIL. Capture the complete bounded point coordinates,
types and identities as well as the general typed return summary, and check
their counts/shapes against each other. The last point is EQ the supplied
START in this case. Neither that result nor a pattern among the earlier
mutations establishes a general loop, PERIM meaning or natural caller. Keep
each changed input source-bound and require the same original-state and
fresh-control checks. See [the positive samples](introspection/zero-edge-positive.md).

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
