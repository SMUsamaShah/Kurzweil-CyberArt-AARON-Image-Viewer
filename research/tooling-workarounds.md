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

### REA provider runtime probe fails only in the restricted process

On 2026-10-14, a bounded `inspect-native-instruction` query through the
wrapper failed in the restricted context with `provider_unavailable`,
`runtime_missing`, and no reported Java version. The configured `java.exe
-version` command itself succeeded and reported OpenJDK 21. The same exact
read-only REA query succeeded when the wrapper was invoked with scoped
elevation and a fresh output directory. This shows that the Java installation
was present and that the failure was specific to the restricted provider
startup path; the underlying Windows denial was not identified.

For that exact symptom, preserve the failed invocation and diagnostics, then
rerun the same wrapper command with scoped elevation at the command-tool
boundary and a new `-OutputRoot`. Do not reinstall Java/REA, edit global
`PATH`/`JAVA_HOME`, or reuse the failed output directory. This is distinct
from the original AARON runner's HKCU registry permission, which has its own
procedure below.

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

### Multiple probe outputs through Windows PowerShell -File

On 2026-10-14, the first PREMIUM pre-CALL triplet completed its uninstrumented
before control, then the observer runner exited before AARON launched or the
probe reached READY. The coordinator passed two filenames as separate values
after the runner's string-array ProbeOutputNames parameter. Windows
PowerShell 5.1 -File binding accepted the first and rejected the second as
an unbound positional argument. The before-control and diagnostics are
preserved under run ID
premium-callsite-triplet-v1-20261014-111112-6da511a7.

For a child -File invocation with multiple names, pass a JSON array in one
argument using ProbeOutputNamesJson, for example
["metadata.txt","capture.txt"]. The required-probe runner parses that
array, checks each filename against its normal lowercase extension rules, and
then records the normalized names in the usual source-bound request and
summary. Passing the JSON through a direct call operator to powershell.exe
stripped the embedded quotation marks on this host and made the child reject
the value. Launch that child with Start-Process and the coordinator's
ConvertTo-NativeArgument helper so the quotes survive Windows command-line
parsing. Existing callers with one output can continue to use
ProbeOutputNames name.txt.
Run the PREMIUM coordinator with PreflightOnly to exercise both 64-bit child
preflights and the exact JSON argument quoting without creating an oracle
output root or launching AARON.

### Windows PowerShell child cannot find `Get-FileHash`

On 2026-10-14, a fresh triplet stopped before AARON launched: its no-profile
Windows PowerShell child reported that `Get-FileHash` was not recognized at the
runner's first source-hash step. A direct Windows PowerShell 5.1 check could
resolve the utility command, so the failed child's module environment was not
captured and the cause is not established. The failed run preserved its log at
`research/extracted/local-oracle/free-path-callsite-v1-triplet-logs/free-path-callsite-v1-20261014-081951-67f537ea`;
it created no oracle output root, did not launch AARON, and left the current
`C:\temp` entries unchanged.

The required-probe runner and its FREE-PATH capture helper now import
`Microsoft.PowerShell.Utility` explicitly from `$PSHOME` before hashing source
files. The call-site triplet first invokes the exact 64-bit Windows PowerShell
5.1 runner with `-NoProfile -NonInteractive -PowerShellPreflightOnly`; it creates
no output root and touches no staging files during this check. A passing
`windows-powershell-preflight.json` is saved in the triplet log and checked by
the evidence deriver. Do not change global `PSModulePath`, ACLs, or `C:\temp`
to address this error.

For a standalone read-only diagnostic, use:

```powershell
$winPwsh = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $winPwsh -NoProfile -NonInteractive -Command 'Import-Module -Name (Join-Path $PSHOME "Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1") -Force -ErrorAction Stop; Get-Command Get-FileHash -ErrorAction Stop'
```

### Windows PowerShell child reports a blank `ExitCode`

On 2026-10-14, the first PICK dispatch-slot triplet's no-probe control
completed successfully: its runner summary says `complete=true`, the six
captured drawing/scene outputs and source hashes were present, and stderr was
empty. The orchestrator nevertheless rejected it because
`Start-Process -PassThru` had not opened the child `Process.Handle`; in this
Windows PowerShell 5.1 case, `WaitForExit()` followed by `Refresh()` left
`Process.ExitCode` as `$null`. Comparing `$null -ne 0` incorrectly treated that
unknown status as a nonzero exit.

Immediately materialize the handle after every `Start-Process -PassThru`
whose exit status will be checked, including helper processes:

```powershell
$child = Start-Process -FilePath $winPwsh -ArgumentList $args -PassThru `
  -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
$null = $child.Handle
if (-not $child.WaitForExit(300000)) { throw 'Child timed out; preserve its outputs' }
$child.Refresh()
$exitCode = $child.ExitCode
if ($null -eq $exitCode) { throw 'Child exit status unavailable; inspect both logs' }
if ($exitCode -ne 0) { throw "Child exited $exitCode; inspect stderr" }
```

The handle step was reproduced with harmless Windows PowerShell children that
returned both 0 and 7; it recovered each actual exit code, while omitting the
step produced `$null` for the zero-exit child. Keep the explicit null guard:
do not cast `$null` to an integer or treat a complete summary as proof of
successful process exit. The PICK and FREE-PATH triplet wrappers, the
FREE-PATH native-map capture, and the REA query wrapper apply this fix to their
redirected child processes. The standard oracle launcher also materializes
the handle for its asynchronous AARON child before polling its exit status.
The preserved first control remains a valid standalone control, but it is not
part of an accepted triplet; use fresh roots for a retry.

The installer launch in `run-oracle.ps1` intentionally retains
`Start-Process -Wait -PassThru`. Harmless Windows PowerShell 5.1 checks showed
that this form returns the correct root exit code and waits for the process
tree; replacing it with asynchronous `WaitForExit()` shortened the wait and
could leave descendants running. Its exit code now has an explicit null
guard. Do not change the installer to a root-only wait.

### Rebuild evidence against the runner and debugger sources that produced it

The accepted October 14 PICK-entry and CLOS-method captures recorded runner
SHA-256
`44b83c0feca717952981844816602dfaf93e5836bdea11857d87ead65fd73076` and
debugger-helper SHA-256
`6daed00b18a2f3a4654d0238b2c181318c8587e914ae3f823d8f3f0c6bdd926b`. The
current required-probe runner and debugger helper have since changed, so using
their current hashes makes a valid old triplet fail source-binding checks.
The exact archived sources are
[`run-local-scene-state-required-probe-20261014.ps1`](oracle/run-local-scene-state-required-probe-20261014.ps1)
and [`AaronCallerBreakpoint-20261014.cs`](oracle/AaronCallerBreakpoint-20261014.cs).
They are evidence snapshots for offline re-derivation only; do not run them to
launch a new oracle. The evidence derivations point to these snapshots. New
captures use the current runner and current helpers with a fresh output root,
and record those current hashes in their run summaries.

### Keep paused probe metadata available through parent validation

The next PICK triplet attempt reached the observer, captured a schema-v3
`PICK` entry and `[EDI+0x27]` slot, and completed that runner, but stopped
before the after-control. The helper's parent then tried to reopen
`C:\temp\aaron-pick-native-links.txt` after releasing AARON. The required-probe
runner had already archived the report under the run's `capture` directory and
removed its staging copy. The result is preserved at
`research/extracted/local-oracle/pick-caller-triplet-v1-logs/pick-dispatch-v2-20261014-102619-1d4c44af`;
because the full triplet did not finish, it is not accepted standalone caller
evidence.

For a paused probe, snapshot the raw metadata bytes while READY is present and
before the debugger helper writes its release marker. Validate the helper's
metadata-prefix hash against that in-memory snapshot; after runner completion,
repeat archival validation from `-OutputRoot/capture/<probe-output-name>`, not
from `C:\temp`. The PICK triplet driver now uses both stable sources. Keep the
runner's required END-marker gate and fresh before/after controls; do not treat
the schema-v3 observer alone as an accepted triplet.

### FREE-PATH triplet archival and JSON evidence

The completed FREE-PATH call-site run exposed three distinct parser/watch
issues after the oracle itself had finished:

- The required-probe runner archives the observer metadata to the run's
  `capture` directory and removes its named `C:\temp` staging file. A footer
  watcher must check both locations, including after process exit; checking
  only the staging path can report a false missing `END`.
- The debugger helper hashes the exact raw metadata bytes through the `READY`
  line, including Windows CRLF. The final archived file later has `WAIT`,
  `COMPLETE`, and `END`; derive the prefix from its raw bytes before normalizing
  line endings. Do not hash normalized LF text.
- Windows PowerShell JSON files may start with UTF-8 BOM bytes. Node evidence
  builders should use one JSON reader that strips a leading U+FEFF. REA trace
  reports also put the analyzed trace in `normalized_result`; `raw_result` can
  be null for that operation.

These fixes are in
[`capture-free-path-callsite-triplet-v1.ps1`](tools/capture-free-path-callsite-triplet-v1.ps1)
and
[`derive-free-path-callsite-v1-evidence.mjs`](tools/derive-free-path-callsite-v1-evidence.mjs).
The triplet helper now records its own source hash for future runs. The
2026-10-14 comparison predates that field, so its portable evidence explicitly
marks the coordinator helper as not bound by that legacy comparison; its
current source hash is recorded at derivation time only. The oracle summaries,
source probe, native helper, mapped PLL payload, required markers, and control
artifacts remain independently checked.

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

When D: is below 30 MiB, the narrower `-AllowMeasuredWriterStreamAt26MiB`
option permits only the same `writer-stream-seed-1234` mode. Its byte-level
gate is the measured 21,660,528-byte peak plus a 16 KiB allowance for a small
pre-scene probe and a 5 MiB safety margin. It does not apply to any
larger-capture mode. Use it only after the normal and 30 MiB gates fail, the
staging directory has been checked for collisions, and the exact mode is
confirmed. The 2026-10-13 FREE-PATH follow-up first used this mode with 28.7 MiB
free; later preflights measured 28.2, 27.7, and 25.8 MiB. The previous rounded
26 MiB gate refused the last value even though the measured peak plus probe
allowance and full 5 MiB margin still fit. The reusable preflight now checks
that exact byte budget. Three unrelated REA JSON files observed in `C:\temp`
were preserved. This was a space threshold, not a permission failure. Do not
delete existing staging data to make the gate pass.

### Serial caller-triplet disk reserve

The FREE-PATH native-caller capture needs three serial writer-stream runs
(before, observer, after). The 26 MiB single-run allowance is not enough to
preflight that whole sequence. The 2026-10-13 attempt started with only 31 KiB
above its exact single-run floor; the 320×480 before control completed, then
the observer was refused after D: fell to 25.2 MiB. No observer or after run
started, so this is not a caller result. The three REA JSON files and the
existing `runner-failures-20261013` folder in `C:\temp` were preserved.

`capture-free-path-caller-triplet.ps1` now checks capacity before creating a
run root, again before each runner launch, and for all three legs before it
starts. It keeps the single-run peak/probe/5 MiB floor, then adds one more
5 MiB reserve for every later leg. With
`-AllowMeasuredWriterStreamAt26MiB`, the required D: free space is 37,405,552
bytes (35.7 MiB) for the first leg, 32,162,672 bytes (30.7 MiB) for the second,
and 26,919,792 bytes (25.7 MiB) for the final leg. The three retained roots
also require 384 MiB on C: at the existing 128 MiB per-run output minimum.
The extra triplet reserve is conservative headroom, not a newly measured
staging peak. If it fails, free space without deleting unrelated files or
wait until the volume has the required headroom; the driver will stop before
launching the next oracle.

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

### FREE-PATH caller metadata with lowercase hex and split helper scope

The 2026-10-14 caller attempt reached `READY` but the helper rejected valid
64-byte Lisp function headers because its hex expression accepted only
uppercase. The original printer emitted lowercase `a`–`f`; accept
`[0-9A-Fa-f]`, then normalize the parsed hex before deriving addresses. The
first attempt therefore has no caller result.

The next attempt captured a valid hit, then the parent triplet failed during
archival because `Assert-ExactPairMetadata` existed only in the separately
launched capture-helper process. PowerShell function definitions do not cross
that process boundary. Keep a parent-owned validator for the completed
observer report: require the exact 10-line `READY` prefix, the three exact
release/completion/footer records, and a hash of the archived prefix equal to
`metadataSha256` in the helper report. A before/observer/after triplet is the
accepted record only after this archival validation and all control checks
pass. Both defects are fixed in
[`capture-free-path-caller.ps1`](tools/capture-free-path-caller.ps1) and
[`capture-free-path-caller-triplet.ps1`](tools/capture-free-path-caller-triplet.ps1).

The completed triplet exposed a third cleanup bug: the caller helper's
`finally` block recreated `aaron-native-code-release.txt` if the runner had
already archived and removed it. On 2026-10-14 the exact 43-byte fallback
marker (`fdb683daadf7c39335caafc7c6762c6eba586882dd0a631b6b0f1e0cb5951ec1`)
was copied and hash-verified at
`research/extracted/local-oracle/caller-triplet-logs/free-path-caller-20261013-231321-ef4d1afe/orphaned-release-marker.txt`,
then removed from `C:\temp` after confirming no AARON process was active. The
caller helper now writes a fallback release only while the original PID still
belongs to that run's AARON executable; the triplet orchestrator handles
failure release, and the runner archives/removes the marker. If preflight
finds this reserved name again, inspect its content and active process before
acting. Preserve unfamiliar markers; do not overwrite them or clear the other
reserved files in `C:\temp`.

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

Two early seed-521814 observers, one waiting for `MAIN` return and one for
`SCREEN-AND-STORE` return, produced no case before the runner limit. Neither
report had a wrapper-entry marker, so these runs do not show whether either
target was entered or returned. Preserve both exact sources:
[`free-path-stop-boundary-v3-main-return-timeout.cl`](introspection/free-path-stop-boundary-v3-main-return-timeout.cl)
and
[`free-path-stop-boundary-v3-screen-return-timeout.cl`](introspection/free-path-stop-boundary-v3-screen-return-timeout.cl).
The successful v4/v5 probes instead register a post-event callback and trigger
once at the first successful traced `STORE-IN-FILE` exit. This is a controlled
case location, not proof of a natural `FREE-PATH` caller. Their serial
triplets, terminal reports, drawing/scene controls and staged-source checks
are required; see the current [v5 capture helper](tools/capture-free-path-stop-boundary-v5.ps1)
and [findings](introspection/free-path-native.md). Do not infer that screen
size caused the earlier no-case results.

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

For the FREE-PATH stop-boundary experiment, use the dedicated serial triplet
wrapper. It prepares three fresh roots and runs the same writer-stream mode in
before-control, observer, after-control order; it starts no second original
process until the prior one exits and removes no unrelated files:

```powershell
.\research\tools\capture-free-path-stop-boundary-v5.ps1 -RunPrefix freepath-v5-seed332156
```

The wrapper requires the probe's terminal END marker for the observer and
preserves every created root if a run fails. It does not force a canvas size;
read the AA0 header from each capture. Use
`-AllowMeasuredWriterStreamAt30MiB` or, only when the 30 MiB preflight fails,
`-AllowMeasuredWriterStreamAt26MiB` for the exact measured writer-stream mode.
Those switches lower the staging reserve; they do not repair permissions or
remove files. The runner still checks reserved names and write access in
`C:\temp`.

Keep its named-parameter hashtable splatting when changing the wrapper. An
array containing the strings `'-RunId', $runId` was bound positionally and
failed the RunId pattern check before the runner started. The v4 evidence
builder allows only the observer's `aaron-planning-call-trace.txt` to differ;
it still compares that trace between the bracketing controls and requires the
other drawing/scene outputs and ordinary sources to match.

For a read-only disk-space check in this shell, use
`Get-PSDrive -Name C,D | Select-Object Name,Free,Used`; the WMI
`Get-CimInstance Win32_LogicalDisk` query may return Access Denied here. The
runner's own staging preflight remains authoritative.

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

### Windows PowerShell 5.1 and Node ESM arguments

PowerShell 5.1 strips quotes from JavaScript passed as inline `node -e` code
through a child PowerShell invocation. Node then reports a syntax error at an
otherwise quoted ESM import. Put the verifier in a `.mjs` file and invoke that
file directly, passing paths and observer-only output names as ordinary
arguments. `capture-screen-unit-context-triplet.ps1` now uses this pattern;
its run prefix also defaults from the selected probe version so a v5 capture
cannot be mislabeled v1.

### Reusing a retained v13 before control

For the seed-1234 v13 PICK intervention only, the triplet runner accepts
`-ExistingBeforeRoot` to reuse a just-captured complete no-probe control and
avoid spending another oracle run on a redundant before leg. The runner
restricts the path to the ignored `external-runs` tree, checks completion,
mode, no observer instrumentation, a maximum age of 30 minutes, the measured
768×1080 AA0 header, and its expected hash. It never edits the retained root.
The usual after leg still runs fresh, and the strict triplet verifier compares
all controls and ordinary staged sources; do not reuse a control if another
oracle has run or its mode/hash gate fails. This does not force the display
mode. Example:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File research\tools\capture-screen-unit-context-triplet.ps1 `
  -Seed 1234 -ProbeVersion v13 -RunPrefix pickunit2diff `
  -ExistingBeforeRoot 'research\extracted\local-oracle\external-runs\<run>-before' `
  -RunSeconds 180
```

### Empty natural screen units and capped writer prefixes

The screen-unit observer can print a proper empty path as
`(:POINTS NIL :SHOWN 0 :TRUNCATED NIL :PROPER T :TAIL-TYPE NIL)`. This is a
valid zero-point unit, not a malformed point list. A color-context sample with
zero `PREP-LINE` and writer calls still remains `INCOMPLETE`; choose a later
populated unit instead of weakening that completion gate. The retained v4
attempt selected ordinal 3, which had zero writers, so it is diagnostic only.

The full writer observer can hit its 50,000-call cap after early screen units.
`derive-screen-unit-evidence.mjs` accepts the explicitly marked paired prefix
only when every target unit ends at or before the final recorded output
position, then still checks each unit's writer ordinals, points, and output
bytes. Other writer consumers remain strict by default. This permits evidence
for covered early units while leaving the later truncated portion unknown.

### Adding a screen-unit trace target

`planning-call-trace.cl` intentionally allowlists exact extra-target and quiet-
target combinations. When a probe adds a function, update both lists in the
trace loader and validate that setup before launching the three-run capture.
Otherwise the loader raises `Unsupported planning trace extra targets` or
`Unsupported planning trace quiet targets` before installing `MAIN` or writing
`TRACE-READY`. The Lisp stdout trace can stop at its `STAGE-1` checkpoint; the
screen observer then has only `BEGIN`/`CAPS`/`INSTALL`, no `READY`, `COMPLETE`,
or `END`, and the run must be rejected. This is a probe-configuration failure,
not a `C:\temp` permission failure.

The first unit-6 `PICK` attempt was preserved at
`research/extracted/local-oracle/external-runs/screen-context-v6-20261014-012254-aad34f18-observer`.
It requested `("PREP-LINE" "STORE-IN-FILE" "BRUSH-STROKE" "PICK")` and
quieted `("BRUSH-STROKE" "PICK")`; both combinations were missing from the
loader allowlist. They are now explicit supported combinations in
`introspection/planning-call-trace.cl`. Keep the failed root for diagnosis,
then use a fresh run prefix after changing the probe or loader.

The next v6b triplet completed and its before/after drawings, scenes, ordinary
Lisp sources, and observer source hash all matched the required controls, but
its observer had only enabled `PICK` entry tracing. The trace loader emits
`CALL-RETURN` only for the separate `aaron-planning-return-targets` list, so
the portable evidence parser correctly rejected that tape instead of
substituting `CALL-END` for a return value. V6 now requests exactly
`("PICK")` in that return-target list, the loader explicitly allowlists it,
and observer `READY` requires and prints the configuration. Keep the v6b
root diagnostic-only and use a fresh triplet to obtain paired PICK entries
and returns.

The first return-enabled v6c capture was otherwise complete and its six image,
AA0, ID, trace, random-seed, and scene artifacts had matching before/after
controls. Its scene observer report correctly added a single
`FIRST-PICK-RETURN` state snapshot, so the old triplet gate rejected the
observer report as if it were drawing output. Keep this report difference
narrow: the v6 helper now treats the planning trace and scene report as
observer-only outputs, still compares both between fresh uninstrumented
controls, checks each run's own summary hashes, and accepts the observer scene
report only when removing exactly the one complete `FIRST-PICK-RETURN` block
restores byte-for-byte equality with the control report. Do not blanket-ignore
scene reports or weaken AA0/image/ID/random/source comparisons. The retained
v6c root can be revalidated offline with this stricter gate; a new original run
is unnecessary if it passes and the typed evidence parser accepts the paired
PICK calls.

PICK-enabled context probes also require the selected unit itself to contain a
PICK call. Two seed-5678 diagnostics targeted units 6 and 1 but observed no
PICK in the selected unit, so the observer could not produce the required
`FIRST-PICK-RETURN` snapshot and the strict triplet gate rejected the result.
Those are valid no-PICK diagnostics, not C:\temp, Java, or registry failures;
preserve their roots and choose a populated unit rather than weakening the
PICK acceptance gate.

When adding a numbered screen-unit probe, update every version registry:
the capture script's `ValidateSet` and observer-only output list, the evidence
deriver's PICK-return set, selected-ordinal map, accepted output-name regexes,
and any focused analyzer's version map. The v10 triplet passed its controls,
but its first offline derivation still matched only v6-v9 output names and
misclassified the observer-only scene report. The regexes were fixed and the
same retained roots then derived successfully; no oracle rerun was needed.
Run syntax checks and derive from the retained triplet before starting another
capture.

## Probe and tooling recovery

### PICK native caller helper and READY staging, 2026-10-14

During a caller capture, the required-probe runner writes the source Lisp file
to `C:\temp\aaron-pre-scene-probe.cl` and leaves it there while AARON is held
at `READY`. It copies the staged source into the run's `capture` folder only
after the runner exits. A helper that reads
`output\capture\aaron-pre-scene-probe.cl` while `READY` is active will fail
even though `C:\temp` is writable. The reusable
[`capture-pick-caller.ps1`](tools/capture-pick-caller.ps1) reads the active
staged source from `C:\temp`, checks the owned runtime and run request, and
releases only that owned process while the expected `READY` marker is present.
The exact helper bytes used in the captured run are preserved as
[`capture-pick-caller-executed-20261014.ps1`](tools/capture-pick-caller-executed-20261014.ps1)
and bound by SHA-256 in the evidence.

Always use a fresh output root for each observer. The helper intentionally
will not overwrite `pick-native-caller.json`; if an attempt wrote a failure
report, preserve it under a distinct failure name before any retry, or start
with a fresh root. Do not delete an unfamiliar report. Keep the before and
after runs uninstrumented and serial, then use
[`derive-pick-native-caller-evidence.mjs`](tools/derive-pick-native-caller-evidence.mjs)
to check all three summaries, six output files, six staged sources, and the
source-bound `READY`/`END` report. A successful helper result must also show
that debugger registers were restored; target exit can end the debugger
session before an explicit detach record is written.

### PICK caller matched-runner controls and live call-site read, 2026-10-14

The first live-site derivation correctly rejected a triplet whose uninstrumented
controls used `run-local-scene-state.ps1` while its observer used
`run-local-scene-state-required-probe.ps1`. The AA0 and scene hashes matched,
but the source-binding gate requires one runner hash across all three runs.
For this workflow, run all three through the required-probe runner: omit probe
parameters for each fresh uninstrumented control, and use the source-bound
probe and READY pause for the observer. Re-run the whole triplet instead of
loosening the provenance check.

The current caller helper recognizes both Junction and SymbolicLink targets
for `research/extracted/local-oracle/external-runs` when verifying the owned
process path. This prevents an otherwise valid READY pause from being left
unreleased when Windows reports the link's canonical target as the executable
path. If ownership still fails, inspect the link target and executable path
before retrying; the helper must never release a different AARON process.

The bounded live-site helper reads three bytes at the measured
`returnAddress - 3` while PICK is stopped and compares them with the same PLL
address. REA's entry-seeded disassembly verifies that this is the instruction
boundary for the captured return. This is specific to this measured call site,
not a general instruction-length detector. Preserve the full anonymous
payload as unresolved unless its complete live bytes are captured separately.

### Seed-5678 screen-unit optional targets reset by the writer overlay

The v6 seed-5678 screen-unit probe configures `BRUSH-STROKE` and `PICK` in
`aaron-planning-extra-targets`. The mode loader then loads
`scene-state-snapshot-writer-full-seeded-5678.cl`; its old unconditional
assignment replaced that list with only `PREP-LINE` and `STORE-IN-FILE`.
The resulting trace therefore had no `TARGET PICK ...` install record. That
absence did not show that `PICK` was unbound or that no PICK calls occurred.

The writer overlay now preserves only the documented allowlisted lists and
falls back to its original two writer targets for ordinary runs. The triplet
driver checks for `TARGET-INSTALLED name=PICK` before its stricter report
completion checks. If it is missing, the diagnostic prints any `TARGET PICK`
trace result, or asks to inspect the staged target list and loader order; it
explicitly draws no PICK-call conclusion. Use a fresh output root after such a
failure. The corrected seed-5678 v6 triplet completed at the measured
768×1080 profile and is recorded in
[`screen-unit-context.md`](introspection/screen-unit-context.md).

The separate v14 seed-1234 intervention correctly stopped when its fresh
control measured 768×1080 instead of the required 320×480. No observer ran and
no display setting was changed. Keep the AA0 header gate; do not alter the
display mode to make an intervention fit.

### Pre-scene Lisp probe package resolution

Some local probes are inserted before scene initialization, when the Lisp
reader may not yet know the `EXCL` package. A reader-time form such as
`EXCL:...` can therefore fail before the probe's `INSTALL` marker appears;
this is a probe-source ordering issue, not a `C:\temp` or Java permission
failure. Avoid package-qualified symbols in code read at that stage. Resolve
the package and symbol dynamically inside the helper, after evaluation has
begun; [`pick-contract-v1.cl`](introspection/pick-contract-v1.cl) uses
`find-package`/`find-symbol` for this pattern.

Treat the capture as valid only when its observer emits `INSTALL`, `READY`,
per-case result rows, `COMPLETE`, and `END`. `READY` alone does not show that a
case ran, and a missing row or terminal marker is an incomplete probe even if
the runner later times out. Preserve each failed output root for diagnosis,
allow the runner's cleanup/watchdog path to finish, inspect for remaining
AARON/oracle processes and staged files, then use a fresh root for the retry.
Never overwrite a failed root or fill missing evidence with inferred results.

### PRE-CALL metadata probe stopped before creating its report, 2026-10-14

The first PREMIUM call-site observer never wrote `BEGIN` or `READY` because
`premium-callsite-metadata-v1.cl` ended with one unclosed list. Common Lisp
reads the complete top-level form before evaluating it, so the reader stopped
at EOF before opening the report. The misplaced close also left the report
stream open across the pause; close the metadata `with-open-file` immediately
after flushing `READY`, before entering the release wait.

Before spending an oracle run on a new or edited Lisp probe, check delimiter
balance with the reusable scanner:

```powershell
node research\tools\check-lisp-paren-balance.mjs `
  research\introspection\premium-callsite-metadata-v1.cl
```

The scanner ignores parentheses inside strings, line/block comments,
escaped symbols, and character literals. A `BALANCED` result only rules out
delimiter imbalance; it does not validate Lisp names, package availability,
function contracts, or runtime behavior. Keep the failed observer root and use
a fresh output root after correcting a probe.

The corrected observer reached `READY`, completed its two-method CLOS census,
and mapped the current PREMIUM and PICK bodies to unique complete PLL objects.
Its first 768×1080 before-control matched the established seed-1234 output,
but the debugger result did not pass the one-step gate, so the triplet stopped
before an after-control and establishes no call destination. The earlier
coordinator discarded that failed raw debugger return before throwing. It now
preserves the full return object and a concise gate summary in
`native-code/debugger-capture-diagnostic.json` on a rejected attempt; inspect
that record before changing the helper or scheduling another fresh triplet.
Do not weaken the instruction, operand, single-step, stack, thread, or cleanup
checks to make a run pass.

### PREMIUM triplet comparison exhausted memory after all runs, 2026-10-14

The `premium-pick-v3-20261014-125028-65b3a9cc` before/observer/after oracle
runs all completed and were archived, but Windows PowerShell 5.1 spent CPU and
grew past 1.3 GB while the coordinator assembled `triplet-comparison.json`.
The captures were safe; only the post-run coordinator was stopped after
confirming no AARON process remained. The cause was the first-line AA0 value:
Windows PowerShell 5.1 decorates `Get-Content` strings with `PSPath`, `PSDrive`,
and `PSProvider` note properties. At JSON depth 1 the decorated line expanded
to hundreds of characters; the coordinator's depth-18 serialization walked
those provider objects once for the comparison and again in each run record.
PowerShell 7 serializes the same value as a plain scalar, which hid the bug in
some local checks.

The coordinator now converts that header to a plain string before storing it:

```powershell
aa0Header = (Get-Content -LiteralPath (Join-Path $capture 'aa0') -TotalCount 1).ToString()
```

Reproducing the issue and checking the fix should use the actual Windows
PowerShell 5.1 executable, not the default PowerShell 7 shell:

```powershell
$winPwsh = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $winPwsh -NoProfile -Command '$p="research/extracted/local-oracle/external-runs/premium-pick-v3-20261014-125028-65b3a9cc-before/capture/aa0"; $row=Get-Content -LiteralPath $p -TotalCount 1; $plain=$row.ToString(); "raw JSON chars=$((ConvertTo-Json -InputObject $row -Depth 1 -Compress).Length); plain=$((ConvertTo-Json -InputObject $plain -Depth 1 -Compress))"'
```

For a fully completed triplet whose coordinator was interrupted after capture,
do not rerun AARON. First confirm the oracle and coordinator processes exited,
preserve the three roots and their source hashes, then rebuild the small
comparison offline with
[`derive-premium-callsite-triplet-comparison.mjs`](tools/derive-premium-callsite-triplet-comparison.mjs).
For the retained v3 roots, the exact invocation is:

```powershell
$id = 'premium-pick-v3-20261014-125028-65b3a9cc'
$runsBefore = "research/extracted/local-oracle/external-runs/$id-before"
$runsObserver = "research/extracted/local-oracle/external-runs/$id-observer"
$runsAfter = "research/extracted/local-oracle/external-runs/$id-after"
$log = "research/extracted/local-oracle/premium-callsite-triplet-v1-logs/$id"
node research\tools\derive-premium-callsite-triplet-comparison.mjs `
  --triplet-id $id `
  --before-root $runsBefore `
  --observer-root $runsObserver `
  --after-root $runsAfter `
  --diagnostics $log `
  --out "$log/triplet-comparison.json" `
  --coordinator-capture-snapshot research/introspection/evidence/source-snapshots/premium-callsite-pick-correlation-20261014-v3-coordinator.ps1
node research\tools\derive-premium-callsite-pick-correlation-evidence.mjs `
  --comparison "$log/triplet-comparison.json" --overwrite
```

The recovery script checks all three complete summaries, exact current runner
and runtime identity, staged scene sources, five drawing/scene artifacts,
before/after planning traces, observer READY/release/END markers, and source
hashes before writing. The capture-source snapshot option is needed when the
coordinator has been fixed since the captured report was produced; it records
the historical coordinator hash separately from the current workspace hash.
The portable evidence deriver validates the same complete report and correlation
gates. Its output was byte-identical on two consecutive derivations. Preserve
partial failed runs for diagnosis; this offline recovery is only for three
complete, source-bound roots.

## Discoverability

This page is linked from the [execution plan](execution-plan.md) and
[continuity handoff](aaron-continuity.md). For detailed oracle staging,
permissions and probe safeguards, use `oracle.md`; for exact native mapping
and live-caller checks, use `native-analysis-workflow.md`.
