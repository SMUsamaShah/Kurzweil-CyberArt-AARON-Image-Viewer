# Native analysis of the archived AARON runtime

## Working route, 2026-10-04

The application is a 32-bit Windows program backed by Allegro Lisp DXL/PLL
images. The small EXE is the launcher; named application logic is in the Lisp
images. Inspecting only the launcher's PE functions misses this logic.

The completed [selector caller investigation](introspection/select-brush-caller.md)
uses three tools:

| Tool | Use here | Result |
|---|---|---|
| REA 3.2.1 | Provider diagnostics, investigation workflow and canonical evidence import/export | Stock Windows native provider rejected the host; external Ghidra evidence import/export succeeded |
| Standalone Ghidra 12.1.4 | Raw import of exact named PLL payloads as 32-bit x86 | Five named functions decoded; bounded call sites retained |
| Windows WOW64 debugger helper | One execute hardware breakpoint at the selector entry | Runtime return addresses confirmed `DISPLAY-COLOR-PATCHES → BRUSH-FILL → SELECT-BRUSH` |

The supplied screenshot's standalone Ghidra suggestion was useful. For
interactive debugging, [x64dbg](https://github.com/x64dbg/x64dbg) supplies
`x32/x32dbg.exe` for 32-bit targets. This session used the small purpose-built
WOW64 helper instead of installing a debugger GUI. IDA was not required.

REA's stock Windows provider reports that verified native authority is
unavailable: its required Job Object ownership, private DACL and reparse-safe
path controls are unimplemented. Its Windows P0 target admission also expects
native x86-64 PE, excluding this x86 build. These are REA 3.2.1 limitations;
they do not mean Ghidra cannot decode 32-bit x86. Keep the provider checks
intact. Do not turn a rejected provider session into a claimed success.
See REA's [Windows provider notes](https://github.com/morluto/rea/blob/main/docs/windows-ghidra-p0.md)
and [provider evaluation](https://github.com/morluto/rea/blob/main/docs/provider-evaluation.md).

## Local toolchain

The tools are unpacked beneath ignored `research/artifacts/rea-tools/`.
`toolchain.json` records their actual local paths. No REA MCP registration or
global installation was needed. Check this file and the executables before
reusing the paths; ignored tool installations do not travel with Git.

The successful session used Node 24.19.0 and these pinned packages:

| Package | Source | Integrity |
|---|---|---|
| `rea-agents@3.2.1` | [npm package](https://www.npmjs.com/package/rea-agents/v/3.2.1) | SHA-512 base64: `R+EwNkWiZjJi4cAxnQzwnCC5w+b4GlZoSJ5VNjliyLB4OoDsJyUngJleLuxgtoyyxHF9DFZ5x+JMQags+INPKw==` |
| Ghidra 12.1.4, Windows distribution | [official release](https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.1.4_build) | ZIP SHA-256: `ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db` |
| Temurin JDK 21.0.12.1+1, Windows x64 | [official release](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.12.1%2B1) | ZIP SHA-256: `f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e` |

The ZIP names were `ghidra_12.1.4_PUBLIC_20260921.zip` and
`OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip`. The full JDK was used,
including its compiler. To recreate the local REA installation with available
Node/npm:

```powershell
npm install --prefix research/artifacts/rea-tools/rea-3.2.1 `
  --ignore-scripts --no-audit --no-fund --save-exact rea-agents@3.2.1
```

After unpacking the verified Ghidra/JDK ZIPs, supply their directory paths
to `run-aaron-ghidra.ps1`. The local CLI entry is
`research/artifacts/rea-tools/rea-3.2.1/node_modules/rea-agents/scripts/rea.mjs`.
The broad `rea doctor` result can still be unhealthy when optional Hopper or
agent registrations are absent. Read individual checks: JDK/Ghidra readiness
does not establish provider target support.

## 1. Capture metadata and code

First read the [`C:\temp` staging and permissions instructions](oracle.md#ctemp-staging-and-permissions).
Run only one original oracle at a time. Use fresh output directories and
fresh 64-bit PowerShell processes for the capture helpers. Do not change the
system clock.

In terminal A, from the checkout root:

```powershell
.\research\oracle\run-local-scene-state.ps1 `
  -ExtractedRoot research\extracted\aaron `
  -OutputRoot research\extracted\local-oracle\native-code-new-run `
  -RunId native-code-new-run -Mode writer-stream-seed-1234 -RunSeconds 150 `
  -PreSceneProbePath research\introspection\select-brush-native-links.cl `
  -PreSceneProbePauseSeconds 90 `
  -ProbeOutputNames aaron-select-brush-native-links.txt
```

While it is running, use terminal B to collect its bounded code windows:

```powershell
.\research\tools\capture-aaron-native-code.ps1 `
  -OracleOutputRoot research\extracted\local-oracle\native-code-new-run

node research\tools\map-native-code-to-pll.mjs `
  research\extracted\local-oracle\native-code-new-run\native-code\manifest.json `
  research\extracted\aaron\application\AARON.pll `
  research\extracted\local-oracle\native-code-new-run\native-code\mapped
```

The runner writes `pre-scene-probe-request.json` before launching the program,
including the staged probe hash, exact runtime path, pause duration and output
names. The helper requires that owned request and a positive pause duration.
The probe closes its metadata report before waiting for the reserved release
marker. The helper creates that marker after capture, including setup failure
paths once it has identified the owned process. The wait is bounded; allow
enough `RunSeconds` for the pause and the scene after it.

The capture is read-only process-memory observation. It records pointer
candidates without assigning their meaning. The mapper then requires one
exact complete match in the PLL's structurally validated object table. Only
after that match should those bytes be treated as a named function payload.

### Other bounded metadata probes

The helper's defaults still capture the five selector-caller candidates.
Other probes can specify `-MetadataPath`, `-MetadataEndMarker` and
`-ExpectedFunctionCount`. The metadata path must be directly under `C:\temp`
and its basename must be a declared output in the runner's owned positive
pause request. Function names may include digits, as method capture names do.

The [count/assignment follow-up](introspection/brush-fill-count.md) used:

| Probe | Declared output | END marker | Headers |
|---|---|---|---:|
| `brush-fill-native-links.cl` | `aaron-brush-fill-native-links.txt` | `END brush-fill-native-links` | 7 |
| `brush-fill-methods.cl` | `aaron-brush-fill-methods.txt` | `END brush-fill-methods` | 2 |
| `brush-fill-helper-links.cl` | `aaron-brush-fill-helper-links.txt` | `END brush-fill-helper-links` | 6 |

Use the same terminal-A pattern, substituting its probe/output names and
keeping a positive pause. Before capturing methods, require the final
metadata summary to show complete enumeration, zero errors and zero
truncations. An END marker is diagnostic framing and does not establish
success. For the retained two-method MY-FILL capture, terminal B used:

```powershell
.\research\tools\capture-aaron-native-code.ps1 `
  -OracleOutputRoot research\extracted\local-oracle\methods-new-run `
  -MetadataPath C:\temp\aaron-brush-fill-methods.txt `
  -MetadataEndMarker 'END brush-fill-methods' -ExpectedFunctionCount 2
```

Then use the ordinary exact PLL mapper and Ghidra runner. Method functions
must be distinguished from generic dispatchers: the seven-header brush probe
includes MY-FILL's generated dispatcher, which has zero PLL matches.
`map-brush-fill-native-code.mjs` explicitly verifies that failed match and
maps the other six objects. It does not weaken the ordinary matcher's
unique-complete-object requirement. The dedicated method probe enumerates
the actual EQL SUBFORM and EQL CFORM method bodies; both match.

These custom maps are for decoding their selected objects. The selector
breakpoint helper below still requires its original five-function caller map.

The [POST-FILL follow-up](introspection/post-fill-count.md) captures both
actual POST-FILL methods and four ordinary helpers. Its metadata requires
five targets, two methods, six code headers, zero errors and zero truncations.
It excludes the generated generic dispatcher. All six objects match the PLL
exactly and decode with the same ordinary mapper/Ghidra runner.

Before executing a new Lisp probe, check form structure as well as delimiter
balance: LABELS definitions must be peers; LET binding lists and HANDLER-CASE
protected forms/clauses must have their intended scope. A balanced file can
still place a helper definition inside another helper. Require the complete
successful metadata summary after the runtime run too.

Use DOTIMES/DOLIST for probe iteration. The shipped Lisp image can try to
autoload an unavailable `loop.fasl` when a probe uses LOOP; that failure is
documented in the older [method inspection evidence](introspection/evidence/README.md#holdout-and-successful-method-inspection).
The first POST-FILL map attempt produced one FILE-ERROR and 379 subsequent
UNBOUND-VARIABLE conditions, incomplete maps and a changed AA0. Replacing its
two LOOP forms with DOTIMES eliminated the observation errors and restored
control-byte equality. The saved condition types alone do not prove the exact
autoload path. Reject such a tape even when the scene runner reports completion.

## 2. Decode the matched payloads

```powershell
$tools = Get-Content research\artifacts\rea-tools\toolchain.json | ConvertFrom-Json
.\research\tools\run-aaron-ghidra.ps1 `
  -MapPath research\extracted\local-oracle\native-code-new-run\native-code\mapped\native-code-map.json `
  -OutputRoot research\extracted\local-oracle\native-code-new-run\native-code\mapped\ghidra `
  -GhidraHome $tools.ghidra -JavaHome $tools.javaHome
```

The runner imports each payload with Ghidra's `BinaryLoader`, its measured
runtime entry as the memory base, `x86:LE:32:default`, and `windows` compiler
specification. It runs `AaronNativeReport.java` with normal bulk analysis
disabled. The script verifies the imported bytes, disassembles from the entry
and exports reachable instructions plus decompiler output. Headless projects
are disposable; the reports and logs remain in the fresh output directory.

For raw imports, the program's image-base field can be zero while the imported
memory starts at the requested runtime entry. The report records both. Check
the memory base and actual imported bytes instead of assuming the image-base
field is the raw loader's base address. Ghidra can exit zero after a script
error, so the runner also requires a valid report with the expected subject
hash, function name, language and instruction count.

The Windows compiler specification is a decoding aid. Its inferred C types,
arguments and expressions are not recovered Lisp source. Symbol constants
and computed calls supply candidates; runtime evidence establishes an
executed call.

## 3. Confirm the native caller

Use a **new** terminal-A run with the same metadata probe, pause and
`writer-stream-seed-1234` mode, for example output/run ID `native-caller-new-run`.
While it waits, run in terminal B:

```powershell
.\research\tools\capture-select-brush-caller.ps1 `
  -OracleOutputRoot research\extracted\local-oracle\native-caller-new-run `
  -MapPath research\extracted\local-oracle\native-code-new-run\native-code\mapped\native-code-map.json
```

This helper revalidates all five live payloads and then sets one hardware
execute breakpoint at the newly discovered selector entry. It records entry
registers, the immediate stack return address and a bounded frame chain.
Saved thread debug registers are restored before detach; a restoration failure
aborts the disposable oracle. The helper attaches and handles debug events on
a dedicated thread that always exits, so its last-resort kill-on-exit policy
also takes effect in an interactive PowerShell session. Code and process memory
are not written. Do not attach it to another program or reuse a PC from a
previous process without the live-byte validation.

Use `writer-stream-seed-1234` for this experiment. The transition mode wraps
`SELECT-BRUSH`, which would insert a tracing frame into the native call path.
The writer-stream mode leaves the selector and brush filler unwrapped.

Collect a separate fresh control in the same mode, omitting the probe and
pause parameters. Require both AA0 and the scene-state report to match before
claiming scene parity. A matching hash does not characterize other branches.

## 4. Use REA's external evidence support

```powershell
node research\tools\rea-evidence-bundle.mjs `
  research\extracted\local-oracle\native-code-new-run\native-code\mapped\ghidra\brush-fill.ghidra.json `
  research\extracted\local-oracle\native-code-new-run\native-code\mapped\ghidra\brush-fill.rea-bundle.json

node research\artifacts\rea-tools\rea-3.2.1\node_modules\rea-agents\scripts\rea.mjs `
  evidence-import research\extracted\local-oracle\native-code-new-run\native-code\mapped\ghidra\brush-fill.rea-bundle.json --format json

node research\artifacts\rea-tools\rea-3.2.1\node_modules\rea-agents\scripts\rea.mjs `
  evidence-export research\extracted\local-oracle\native-code-new-run\native-code\mapped\ghidra\brush-fill.rea-bundle.json `
  research\extracted\local-oracle\native-code-new-run\native-code\mapped\ghidra\brush-fill.rea-export.json --format json
```

The adapter uses REA's own canonical Evidence, analysis-profile and ledger
helpers. It verifies the reported subject-file hash and explicitly records
`ghidra-standalone` with `rea_native_provider_session: false`. REA's subject
format is `unknown` because its enum has no `raw` value; the original `raw`
format is preserved in the report and parameters. Import/export validates the
record, not the origin or correctness of the Ghidra analysis.

For this milestone, `derive-native-caller-evidence.mjs` checks the named map,
raw caller/control captures, bounded instruction bytes, metadata constants and
REA record identity to write the portable summary. Running it without
arguments prints its usage; supply a fresh output filename.

Keep original images, memory windows, payloads, complete decompiler reports,
tool installations and REA bundles ignored. Publish probe/helper code,
normalized compact evidence and behavioral conclusions. The historical
selector implementation is unchanged by this investigation.
