# Local tooling quick fixes

Start here when an AARON task stalls on local tooling. The scripts and exact
recovery paths below keep setup failures separate from reverse-engineering
results.

## REA and Ghidra on Windows

The paths in `research/artifacts/rea-tools/toolchain-current.json` do not
automatically configure REA's Windows provider. A direct CLI call without the
process variables `GHIDRA_INSTALL_DIR` and `JAVA_HOME` can fail with
`provider_unavailable` / `not_configured`, even when Java and Ghidra are
installed. Run supported read-only queries through
[`invoke-rea-ghidra-query.ps1`](tools/invoke-rea-ghidra-query.ps1):

```powershell
$payload = 'research/artifacts/rea-tools/rea-in-sub-frame-20261012-b'
$runId = [Guid]::NewGuid().ToString('N')
./research/tools/invoke-rea-ghidra-query.ps1 `
  -Operation function `
  -InputPePath "$payload/in-sub-frame.synthetic.exe" `
  -Address 0x1fe0ea2c `
  -SeedFile "$payload/in-sub-frame.seeds.tsv" `
  -OutputRoot "research/artifacts/rea-tools/rea-in-sub-frame-wrapper-$runId"
```

The wrapper reads the current toolchain file, sets the provider, Java, Ghidra,
x86/Windows language, memory limit and optional seed for that child process,
then restores the caller's environment. It accepts only static analysis
operations and synthetic PEs under the ignored REA tool directory. It creates
a fresh output folder, saves the unmodified JSON and stderr, records hashes,
and verifies that the report subject hash equals the input PE. Never execute a
generated PE.

An earlier direct query failed because `GHIDRA_INSTALL_DIR` was absent from
the child process, not because the Java installation was missing. On
2026-10-13, the wrapper completed the same query at
`0x1fe0ea2c`; its report SHA-256 was
`d3d0872def64b69df2f082fbb4d4fd6625552649cac051e292eb4eb6cd79b36d` for input
SHA-256 `817fb2ae120d2a20e767a1a8ecee34ae576b2ade703b04ea87437ae796888920`.
The run returned empty stderr and confirmed `staticOnly=true` and
`inputWasExecuted=false`. The fresh output root was
`research/artifacts/rea-tools/rea-in-sub-frame-wrapper-compat-20261013-01`.
The wrapper's repository-relative path helper uses string-prefix handling for
Windows PowerShell/.NET versions that do not provide
`[IO.Path]::GetRelativePath`.

If the provider reports `not_configured`, keep its diagnostics and use the
wrapper. If Ghidra instead reports `Access is denied` for its user settings
file (for example `%APPDATA%\ghidra\...\java_home.save`), run the same
read-only wrapper call with scoped elevated permission and a fresh output
folder. This is a user-profile write boundary; do not reinstall Java/Ghidra or
change global settings. See the detailed [REA payload guide](introspection/rea-payload-analysis.md).

The PE payload builder has a safe layout workaround for an entry that lands
in the first 4 KiB page: it moves only the analyst-generated, 64 KiB-aligned
image base down one 64 KiB unit, keeping the selected entry address and exact
payload bytes unchanged. This gives Ghidra a nonzero section RVA. It does not
modify the original PLL, and the generated PE must never be executed. The
builder validates this layout in its binding JSON.

## Original AARON oracle

Read [`oracle.md`](oracle.md#ctemp-staging-and-permissions) before a run.
`C:\temp` is a symbolic link to the ignored repository target
`research\artifacts\temp`; the runner checks reserved filenames and makes a
unique create/delete write preflight before creating the output root.

If the `C:\temp` preflight is denied, rerun the same command through scoped
elevation. Do not retarget the link, change ACLs, or remove unknown staged
files. The runner also saves and restores the per-user AARON registry values;
if that write is denied, retry the same invocation through scoped elevation.
It preserves the prior values and cleans only its named staging files.

The default staging-space gate is 32 MiB. If that gate alone rejects a
`writer-stream-seed-1234` run near the threshold, the opt-in
`-AllowMeasuredWriterStreamAt30MiB` switch is available on
`prepare-local-aaron-oracle-run.ps1`. It is restricted to that exact mode; the
larger-capture threshold remains 128 MiB. The measured 2026-10-13 capture
staged 21,660,528 bytes at peak, leaving more than 9 MiB at the 30 MiB minimum.
For example:

```powershell
$runId = 'my-writer-stream-' + [Guid]::NewGuid().ToString('N')
$outputRoot = & .\research\tools\prepare-local-aaron-oracle-run.ps1 `
  -RunId $runId -Mode writer-stream-seed-1234 `
  -AllowMeasuredWriterStreamAt30MiB
```

Use this only when the caller confirms the exact same scene mode and the
preflight still passes. It changes no files in `C:\temp`, removes no unrelated
data, and does not change permissions.

### Paused native metadata probes

The required-probe runner checks that END is the last line of the archived
probe report. A paused native capture therefore uses a two-step handshake:
the probe writes READY, the capture helper snapshots native code and writes
the release file, and only then does the probe append its final END line.
Use READY for the capture helper's MetadataEndMarker and END for the runner's
RequiredProbeEndMarker. Do not put a pause footer after END; the runner will
reject that capture even when scene output finished successfully.

For the reusable pattern, inspect
[canvas-size-native-links.cl](introspection/canvas-size-native-links.cl),
[capture-aaron-native-code.ps1](tools/capture-aaron-native-code.ps1), and
[the canvas evidence derivation](tools/derive-canvas-size-evidence.mjs).
The observer's staged loader files are expected to differ from no-probe
controls. Compare drawing outputs and scene sources, then compare remaining
runtime files after accounting for that loader change.

### Keep probe cleanup and the terminal marker in lexical scope

The first `free-path-boundaries.cl` attempt wrote all 40 `CASE`/`ENDCASE`
records with no case errors, but never wrote `RESTORED` or its required final
`END`. Source inspection found two excess closing parentheses after the case
loop: they closed the `UNWIND-PROTECT` and outer `LET*` before cleanup and the
restoration check. The final check then referenced saved function bindings
outside their lexical scope. The runner waited through its 150-second limit,
archived partial scene files, and rejected the run. That run is retained only
for diagnosis and is not behavior evidence.

The probe was repaired so its `SETF` restoration remains the
`UNWIND-PROTECT` cleanup, while `RESTORED` and the terminal `END` remain inside
the same lexical scope. For similar probes, check form nesting and lexical
scope in addition to balanced source delimiters; require the exact final
`RESTORED T` and `END` lines, and compare fresh control outputs before using
any captured rows. Always use a new output root after a rejected attempt.

A later near-boundary probe failed for the same general reason in a different
place: its `MAIN` wrapper was accidentally a body form inside the helper
`DEFUN`, so it never installed. The file was delimiter-balanced, but the
required report stopped after `BEGIN` and `DEFERRED`; it had no `INSTALL`, case
rows, or `END`. The runner timed out before the observer completed. This was a
probe-scope error, not a `C:\temp` permission failure; preserve the partial
root as diagnostics and use a fresh root for the repair.

[`check-lisp-probe-scope.mjs`](tools/check-lisp-probe-scope.mjs) now checks
Lisp string/comment-aware delimiter balance and verifies that critical forms
start at an expected lexical nesting depth. For a post-MAIN observer whose
helper and wrapper are both inside one outer `UNLESS`, run it before the oracle
with the required depth `1`:

```powershell
node research\tools\check-lisp-probe-scope.mjs `
  research\introspection\free-path-stop-boundary-v2.cl 1 `
  '\(\s*defun\s+aaron-free-path-run-stop-boundary-v2\b' `
  '\(\s*let\*\s+\(\s*\(\s*owner\s+\(find-package'
```

This check catches the nested-wrapper mistake that a delimiter count misses;
it does not validate Common Lisp argument forms or runtime behavior. Still
require the observer-specific `INSTALL`, complete case records, `RESTORED T`,
and terminal `END` in the offline parser, plus complete runner summaries and
fresh uninstrumented controls. The current reproducible example is
[`free-path-stop-boundary-v2.cl`](introspection/free-path-stop-boundary-v2.cl).

The repaired pre-scene matrix then exposed a separate rule: a complete report
does not prove that an observer left scene generation alone. That observer
changed the first natural `STORE-IN-FILE` point from `(106.91827677510554,
384.1616650397512)` to `(316.4897007193718, 181.03517809711636)`, while its
seed preview still matched the controls. The exact changed runtime state was
not identified, so those rows are retained only as a rejected diagnostic.

For direct calls that might alter live state, preload the normal mode source,
install the probe's `MAIN` wrapper outside the normal scene observer, and defer
the matrix until that wrapped `MAIN` returns. The current pattern is
[`free-path-boundaries.cl`](introspection/free-path-boundaries.cl). It produced
40 complete cases with a 768×1080 AA0; fresh before/after controls matched all
six drawing/scene outputs and six ordinary staged sources. Reuse the read-only
[triplet verifier](tools/verify-local-aaron-triplet.mjs) after each capture:

```powershell
node research\tools\verify-local-aaron-triplet.mjs `
  research\extracted\local-oracle\external-runs\<control-before> `
  research\extracted\local-oracle\external-runs\<observer> `
  research\extracted\local-oracle\external-runs\<control-after>
```

The verifier checks complete runner summaries, the observer source hash and
terminal marker, summary-to-capture AA0/scene hashes, six drawing/scene
outputs, and all ordinary staged `.cl` sources. The companion
[`derive-free-path-boundary-evidence.mjs`](tools/derive-free-path-boundary-evidence.mjs)
also parses each case and emits portable JSON. Dimension-specific probes must
use the AA0 header from that same triplet; do not rely on the run ID or
`smallImage` setting.

### WOW64 caller-breakpoint cleanup

The first caller helper stopped its debug-event pump after the breakpoint and
then attempted to detach immediately. Windows returned
`DebugActiveProcessStop` error 5 in one run; the caller report was not saved.
A 15-second wait retry and a separate 60-second wait retry also produced no
accepted evidence, so those runs remain diagnostics only.

[`AaronCallerBreakpoint.cs`](oracle/AaronCallerBreakpoint.cs) now handles the
one-shot hit while all debuggee threads are stopped: it restores every armed
thread's saved debug registers, closes the helper's thread handles, then keeps
servicing debug events without rearming the breakpoint until the owned,
disposable AARON process exits. This avoids resuming the oracle with the
breakpoint armed and avoids treating a failed immediate detach as a successful
capture. If a later detach still fails, the helper accepts the record only
after a bounded process-exit wait; otherwise it terminates only that owned
disposable oracle and reports failure. The successful run reports
`detached=false` because the debug session ended with target exit; it is not a
claim that a live oracle was left attached. See the
[caller capture helper](tools/capture-in-sub-frame-caller.ps1),
[native workflow](native-analysis-workflow.md), and
[portable capture evidence](introspection/evidence/in-sub-frame-native-caller-20261013.json).

The original-runtime workflow launches `AARON.exe`; Java is not involved.
Use one oracle at a time, a fresh `-OutputRoot`, source-bound completion
records, and fresh uninstrumented controls. Never change the system clock.
Before retrying after an interruption, inspect the process, staging directory
and owned output root.

### Low disk space and interrupted staging

The common `writer-stream-seed-1234` run produces a 21,287,184-byte planning
trace in `C:\temp`. When the output root is also on D:, `Copy-Item` temporarily
needs a second copy before the runner removes the staged file. If free space is
low, the original run can finish painting and then fail while archiving, with
no `summary.json`. For a normal mode, prepare a fresh output path on C: through
the ignored junction and check both drives before launching:

```powershell
$runId = 'my-probe-' + [Guid]::NewGuid().ToString('N')
$outputRoot = & .\research\tools\prepare-local-aaron-oracle-run.ps1 `
  -RunId $runId -Mode writer-stream-seed-1234
& .\research\oracle\run-local-scene-state-required-probe.ps1 `
  -ExtractedRoot research\extracted\aaron `
  -OutputRoot $outputRoot -RunId $runId `
  -Mode writer-stream-seed-1234 -RunSeconds 150
```

The helper keeps the logical run path beneath ignored
`research/extracted/local-oracle/external-runs/`, backed by
`C:\AaronOracleRuns`. It requires at least 32 MiB on the `C:\temp` target
volume and 128 MiB on the output volume (larger modes have higher thresholds).
The runner's own reserved-name and write checks still apply. Do not delete
staging files to satisfy the preflight.

If a run stopped after creating its output root, first confirm the named AARON
process has exited. Then archive only staging files whose creation times match
that run; the helper copies and hash-verifies them on C: before removing those
exact files from `C:\temp`:

```powershell
& .\research\tools\recover-aborted-local-aaron-run.ps1 `
  -OutputRoot research\extracted\local-oracle\my-failed-run
```

The recovery script leaves older files and unrelated REA JSON records alone.
It refuses to act while any AARON process is active. Keep the run root and the
recovery archive for diagnosis; do not treat an archived `END` marker as a
successful probe unless its error/truncation counts and runner summary also
pass.

Windows Allegro's `~%` reports use CRLF. Normalize line endings before an
exact `END` suffix check. Header bytes can be emitted in lowercase hex; parse
both cases. Also check Common Lisp `LABELS` scope: a helper can be accidentally
nested while the file remains delimiter-balanced, preventing any report from
being written.

For a pre-scene probe with multiple `-ProbeOutputNames`, invoke the runner
through `-Command` so PowerShell evaluates the array literal. Passing
`@("final.txt", "stage.txt")` through `powershell -File` can split its values
and bind the second name to the next parameter. Keep `-ExecutionPolicy Bypass`
on the child PowerShell command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command '& {
  $runId = [Guid]::NewGuid().ToString("N")
  & .\research\oracle\run-local-scene-state-required-probe.ps1 `
    -ExtractedRoot research\extracted\aaron `
    -OutputRoot "research\extracted\local-oracle\probe-$runId" `
    -RunId "probe-$runId" -Mode seed-1234 `
    -PreSceneProbePath research\introspection\probe.cl `
    -ProbeOutputNames @("probe.txt", "probe-stage.txt") `
    -RequiredProbeOutputName probe.txt `
    -RequiredProbeEndMarker "END probe"
}'
```

Both declared output names must be unique and unused in `C:\temp`; the runner
checks them before launch and archives only those named files. After an
argument-binding or policy error, confirm the runner did not start AARON or
create its output root before retrying.

### Node writes through the C-backed external-runs junction

The logical path under research/extracted/local-oracle/external-runs is a
junction to C:\AaronOracleRuns. A Node mapper that creates its output under
that junction may fail with EPERM in the default command context even when
the oracle run succeeded. Use the same mapper command again with scoped
elevated permission and a fresh output directory. Do not change ACLs,
retarget the junction, or delete a partial output unless it is the named
output created by that failed attempt. See the linked
[native-analysis workflow](native-analysis-workflow.md).

## Git writes in this workspace

Workspace files can be writable while the current command context rejects Git
metadata writes under `.git`. This is recoverable with scoped elevation.
A Git mutation can fail at staging with:

```text
fatal: Unable to create '.../.git/index.lock': Permission denied
```

This is a recoverable command-context boundary; it does not mean an index lock
was created or that the repository needs ACL changes. Do not delete
`index.lock` or change `.git` permissions. When the current task already
authorizes a commit/push, rerun the exact path-scoped `git add`, `git commit`,
and branch `git push` in one scoped elevated command. Keep the existing branch
and review `git status` before staging; do not stop at the first denied call.
The failed staging attempt in this session created no lock; the verified v6
milestone then pushed successfully as `2233ff3`.

When a Node evidence helper needs to verify an ignored output path, do not
assume it can spawn Git: in this workspace, `spawnSync('git', ...)` returned
`EPERM` even though direct Git commands in PowerShell work. For an output
under the repository's known ignored `research/extracted/` or
`research/artifacts/` roots, read the checked-in `.gitignore` rule in the
helper, then confirm the final repository status. Reserve Git mutations for
the documented scoped-elevation PowerShell path; do not change ACLs to make a
Node child process work.

## Discoverability

This page is linked from the [execution plan](execution-plan.md) and
[continuity handoff](aaron-continuity.md). For detailed oracle staging,
permissions and probe safeguards, use `oracle.md`; for exact native mapping
and live-caller checks, use `native-analysis-workflow.md`.
