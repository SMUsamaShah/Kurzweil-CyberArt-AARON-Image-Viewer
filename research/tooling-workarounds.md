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
.esearch\tools\invoke-rea-ghidra-query.ps1 `
  -Operation function `
  -InputPePath research\artifacts\rea-tools\rea-in-sub-frame-20261012-b\in-sub-frame.synthetic.exe `
  -Address 0x1fe0ea2c `
  -SeedFile research\artifacts\rea-tools\rea-in-sub-frame-20261012-b\in-sub-frame.seeds.tsv `
  -OutputRoot research\artifacts\rea-tools\rea-in-sub-frame-wrapper-check
```

The wrapper reads the current toolchain file, sets the provider, Java, Ghidra,
x86/Windows language, memory limit and optional seed for that child process,
then restores the caller's environment. It accepts only static analysis
operations and synthetic PEs under the ignored REA tool directory. It creates
a fresh output folder, saves the unmodified JSON and stderr, records hashes,
and verifies that the report subject hash equals the input PE. Never execute a
generated PE.

Verified on 2026-10-12: the initial direct query failed because
`GHIDRA_INSTALL_DIR` was absent from the child process, not because the Java
installation was missing. The wrapper then completed the same query at
`0x1fe0ea2c`; its report SHA-256 was
`d3d0872def64b69df2f082fbb4d4fd6625552649cac051e292eb4eb6cd79b36d` for input
SHA-256 `817fb2ae120d2a20e767a1a8ecee34ae576b2ade703b04ea87437ae796888920`.

If the provider reports `not_configured`, keep its diagnostics and use the
wrapper. If Ghidra instead reports `Access is denied` for its user settings
file (for example `%APPDATA%\ghidra\...\java_home.save`), run the same
read-only wrapper call with scoped elevated permission and a fresh output
folder. This is a user-profile write boundary; do not reinstall Java/Ghidra or
change global settings. See the detailed [REA payload guide](introspection/rea-payload-analysis.md).

## Original AARON oracle

Read [`oracle.md`](oracle.md#ctemp-staging-and-permissions) before an oracle
run. `C:\temp` is a symbolic link to the ignored repository target
`research\artifacts\temp`; the runner checks its write access and reserved
filenames. The symlink redirects a path but does not grant ACL access. The
local runner also updates and restores a per-user AARON registry key, so invoke
the exact runner with scoped elevation when the sandbox denies that registry
write. This runtime launches `AARON.exe`; Java is not involved. Use one oracle
at a time, a fresh `-OutputRoot`, and source-bound completion plus fresh
uninstrumented controls. Never change the system clock. Before retrying after
an interruption, inspect the process, staging directory and owned output root.

## Git writes in this workspace

The checkout is writable, but `.git` is read-only in the default sandbox. A
Git mutation can fail at staging with:

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
