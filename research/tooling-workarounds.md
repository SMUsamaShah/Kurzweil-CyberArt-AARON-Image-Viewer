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

## Discoverability

This page is linked from the [execution plan](execution-plan.md) and
[continuity handoff](aaron-continuity.md). For detailed oracle staging,
permissions and probe safeguards, use `oracle.md`; for exact native mapping
and live-caller checks, use `native-analysis-workflow.md`.
