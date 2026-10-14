# Native analysis of the archived AARON runtime

For Java/Ghidra, C:\temp, and Git permission recovery, start with the
[local tooling quick fixes](tooling-workarounds.md). Retry a denied
read-only analysis with scoped elevation and a fresh output directory;
do not reinstall tools or change global permissions.

## REA update, 2026-10-11

REA 6.4.0 is now installed beside the historical 3.2.1 toolchain. Its Ghidra
doctor passes all ten required checks, and a real read-only inspection of
the original x86 AARON.exe succeeds with unchanged source bytes. The published
Windows provider still rejects the raw ZERO-EDGE payload. Use
`research/artifacts/rea-tools/toolchain-current.json` for new REA PE work;
preserve the historical `toolchain.json` and 3.2.1 installation for the evidence
derivations below. See [the update record](rea-update-20261011.md) for exact
versions, checks, package/main differences and reproduction commands.

## Exact payloads through REA, 2026-10-12

REA 6.4 now also completes native function dossiers for ZERO-EDGE, BRUSH-FILL
and FILL-IRIS through generated x86 PE containers. The stock Windows provider
still rejects headerless raw bytes. This route copies each exact, uniquely
mapped PLL payload into a minimal static container and supplies an explicit
x86 language, Windows compiler specification and function seed. All three
decoded instruction sequences match the earlier standalone Ghidra reports;
REA adds CFG, reference and untruncated p-code def-use data.

Use [the payload guide](introspection/rea-payload-analysis.md) and
`research/tools/prepare-rea-payload-pe.mjs` for new containers. The builder
requires an exact archived map/function/PLL and a fresh ignored directory,
validates all original bytes and writes exclusively. Never execute its PE.
Generated headers, layout, names and static address context are analyst
assertions. They are not original executable metadata or current live
addresses. The isolated containers do not resolve the Lisp dispatch graph,
and inferred C signatures do not establish the Lisp ABI or recover source.

The strict [portable evidence](introspection/evidence/rea-payload-analysis-20261012.json)
binds all three successful dossiers and two actual ZERO-EDGE reference queries
to 70 sources. Independent offline derivations are byte-identical. This static
route does not replace the live rediscovery and byte checks required before
debugger attachment below. Preserve the historical toolchain and raw reports.

## ZERO-EDGE compiled-constant reference census, 2026-10-13

The read-only probe [`zero-edge-native-links.cl`](introspection/zero-edge-native-links.cl)
scans own-package compiled bindings and nested compiled-function constants for
references to ZERO-EDGE. A reference is only a candidate; it is not a call or
dynamic caller. Run it with the required-probe runner between two fresh
no-probe controls in the same mode, then derive the compact portable report:

```powershell
& .\research\oracle\run-local-scene-state-required-probe.ps1 `
  -ExtractedRoot research\extracted\aaron `
  -OutputRoot research\extracted\local-oracle\zero-edge-native-links-new-observer `
  -RunId zero-edge-native-links-new-observer `
  -Mode writer-stream-seed-1234 -RunSeconds 150 `
  -PreSceneProbePath research\introspection\zero-edge-native-links.cl `
  -ProbeOutputNames aaron-zero-edge-native-links.txt `
  -RequiredProbeOutputName aaron-zero-edge-native-links.txt `
  -RequiredProbeEndMarker 'END zero-edge-native-links'

node research\tools\derive-zero-edge-native-links-evidence.mjs `
  research\extracted\local-oracle\zero-edge-native-links-new.json `
  research\extracted\local-oracle\zero-edge-native-links-new-control-before `
  research\extracted\local-oracle\zero-edge-native-links-new-observer `
  research\extracted\local-oracle\zero-edge-native-links-new-control-after
```

The before/after runs use the same runner, mode and fresh roots with no
optional probe arguments. The 2026-10-13 census found one ZERO-EDGE symbol
reference at `BUFFER-HOLE` constant index 1, among 1,380 scanned compiled
objects, with no errors or truncations. This only prioritizes `BUFFER-HOLE`
for the next caller investigation. The complete source-bound record is
[here](introspection/zero-edge-native-links.md). Its controls measured
320x480 even though `smallImage=false`; read dimensions from the AA0 header
and keep this run separate from 768x1080 controls.

## ZERO-EDGE bounded caller attempt, 2026-10-13

The live caller helper reads fresh 64-byte headers for `BUFFER-HOLE` and
`ZERO-EDGE`, checks each entire function body against the mapped PLL payload,
then places one execute breakpoint at the live ZERO-EDGE entry. Use
[`capture-zero-edge-caller.ps1`](tools/capture-zero-edge-caller.ps1) only
during the matching runner-owned pause, with the combined map produced by
[`merge-zero-edge-caller-native-maps.mjs`](tools/merge-zero-edge-caller-native-maps.mjs).
For low D: disk, prepare the run root with
[`prepare-local-aaron-oracle-run.ps1`](tools/prepare-local-aaron-oracle-run.ps1);
the ignored D: path is backed by `C:\AaronOracleRuns`.

The 2026-10-13 source-bound capture saw no entry before its process ended in
the 320x480 writer-stream scene. The runner completed 32.837 seconds after
start; 150 seconds was the helper's maximum, not the observed wait. Both live
payloads matched; fresh before/after controls matched all six outputs and six
scene sources. This is a bounded no-hit, not a negative call-graph proof. The `BUFFER-HOLE` constant reference
remains a static candidate, and the result does not cover the separate
768x1080 regime. See [caller findings](introspection/zero-edge-native-caller.md)
and [portable evidence](introspection/evidence/zero-edge-native-caller-20261013.json).

The first metadata draft failed because `FINISH-REPORT` was nested in
`INSPECT-TARGET`; verify helper definitions are peers in `LABELS`, not merely
that parentheses balance. The helper also normalizes CRLF before checking the
terminal marker. Lisp hex bytes may be lowercase, so evidence parsers must
accept both hex cases.

## Canvas-size function boundaries, 2026-10-13

The read-only observer
[canvas-size-native-links.cl](introspection/canvas-size-native-links.cl)
captured SET-UP-SCREEN-SIZE and SELECT-CANVAS at their Lisp boundaries and
read their live compiled-function windows during the required pre-scene pause.
Its READY marker is for the native capture helper; the final END marker is
written only after the helper releases the probe. The complete 768x1080 run is
bracketed by fresh same-mode, no-probe controls. The six drawing/scene outputs
and six staged sources match. The separate completed
[BUFFER-HOLE investigation](introspection/evidence/buffer-hole-native-investigation-20261013.json)
contains the 320x480 control triplet.

Both regimes enter SET-UP-SCREEN-SIZE with screen globals 640x480. After it,
the 320 regime retains 640x480 screen globals and gives all five width
profiles 320, while the 768 regime has 1920x1080 globals and width profiles
487/650/768/866/900. SELECT-CANVAS receives ACLWIN::SQUARE in both and ends at
320x480 or 768x1080. This is the first wrapped-boundary difference, not an
identified internal call or OS API. The cause remains unknown.

The new live mapping matches both payloads as unique complete PLL objects.
REA 6.4.0 and Ghidra 12.1.4 decode 366 instructions / 121 blocks for
SET-UP-SCREEN-SIZE and 155 / 48 for SELECT-CANVAS. Indirect runtime-dispatch
calls remain unresolved. The dossiers do not establish an original caller,
Win32 display API, Lisp source, or Lisp ABI. The full source closure and
limitations are in the
[canvas findings](introspection/canvas-dimensions.md) and
[portable evidence](introspection/evidence/canvas-size-native-links-20261013.json).

## FREE-PATH stop-boundary mapping, 2026-10-13

The minimal read-only metadata probe
[`free-path-native-links.cl`](introspection/free-path-native-links.cl)
captures only the 64-byte compiled-function header. The successful
source-bound `writer-stream-seed-1234` triplet records its complete report and
fresh uninstrumented controls in the
[native findings](introspection/free-path-native.md). `FREE-PATH` matched one
complete 1,334-byte PLL object; the exact 1,330-byte payload was then analyzed
with REA 6.4.0 / Ghidra 12.1.4. Its decoded body has 456 instructions, 91
blocks and 622 high-p-code operations. REA's targeted call-resolution query at
`0x1fdfda1e` is `unresolved` with no targets. Use the native findings for the
static loop interpretation and bounded seed-521814 follow-up; do not infer a
Lisp helper from a computed call or treat decompiler locals as recovered
source.

One earlier metadata attempt reached BEGIN/INSTALL but did not write READY;
the capture helper timed out, and the exact Lisp operation responsible was
not established. The successful retry used a header-only probe with explicit
flushes and no `ARGLIST` or constant traversal. That is a recovery pattern,
not proof those particular operations caused the first timeout. A separate
REA call initially returned `runtime_missing` even though Java ran in the
interactive shell; the documented scoped-elevation wrapper retry succeeded.
Preserve both failed output roots for diagnosis and require the successful
subject-hash and source-bound checks for usable results.

## FREE-PATH bounded natural caller, 2026-10-14

The serial caller driver completed a fresh before/observer/after
`writer-stream-seed-1234` triplet. The measured AA0 canvas is 320×480 despite
`smallImage=false`; use the AA0 header as the dimension evidence. All three
summaries are complete. AA0, image, image-id, scene-state snapshot and loaded
seed match byte-for-byte, the two uninstrumented planning traces match, and
all six staged scene-source hashes match. Only the observer trace differs; it
explicitly records `FREE-PATH` as unwrapped.

The first `FREE-PATH` entry produced a hardware-breakpoint hit with first-chance
exception `0x4000001e`. The current 1,330-byte FREE-PATH body and 2,958-byte
DRAW-CFORM body each matched their unique complete PLL object and live bytes.
The return address `0x1fe28e4b` falls uniquely inside DRAW-CFORM, at relative
offset `0x167` (359). Ghidra maps the preceding instruction to `CALL EDI`
(`FF D7`) at DRAW-CFORM+`0x165`; it is an indirect/computed call. This proves
DRAW-CFORM is the immediate caller for this first entry in this captured scene,
but does not statically resolve EDI's target or characterize later calls.

Portable record:
[`free-path-native-caller-20261014.json`](introspection/evidence/free-path-native-caller-20261014.json).
Its SHA-256 is
`6cdad66881d1e1dda9c365dffe787ce2b3510b66ec4468a2d95426ac1fc41608`; the
checked-in [offline deriver](tools/derive-free-path-native-caller-evidence.mjs)
rebuilds it from the three archived run roots and map. The deriver also binds
the exact READY-prefix hash
`445dbf362761bc5252f2720f18e7a3cd56c286891830829f6075d0fe0cdfbeaa` to the
capture helper report.
The earlier failed attempts remain diagnostic only: the first helper rejected
lowercase Lisp hex, and the next completed its hit but the parent triplet's
archival checker referenced a helper-local function before an after control
could run. Both defects are fixed in the current scripts; the completed third
triplet is the accepted record.

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
| `brush-buffer-predicate-native-links.cl` | `aaron-brush-buffer-predicate-native-links.txt` | `END brush-buffer-predicate-native-links` | 2 |

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

Check nested helpers too: every intended COND clause must remain inside COND,
and a local helper's invocation must remain inside its LABELS body. The first
ZERO-EDGE contract probe had balanced delimiters and the expected outer helper
count, but closed its nested COND/LABELS too early. It recorded two
UNDEFINED-FUNCTION conditions while summarizing XINCS/YINCS and correctly
skipped the constructor. That capture is diagnostic even though its drawing
and scene bytes equal the fresh control. The saved condition types alone do
not identify the missing callee.

Also validate SETF place/value pairs and the actual HANDLER-CASE clause list.
The third ZERO-EDGE contract probe balanced its delimiters and kept all outer
helpers as peers, but its MAIN installer put three following forms inside
SETF, leaving an odd argument count. Its intended condition clause was inside
the protected PROGN, so HANDLER-CASE had no clauses. The observer stopped at
MAIN-GATE with no INSTALL, READY or completion footer; its painting and scene
still matched the fresh control. Reject that capture. The source establishes
the scope error, but no saved runtime exception identifies the condition.
For an installer, check that the function-binding SETF has exactly one
place/value pair, each intended following form is a PROGN peer, and the
condition handler is an actual HANDLER-CASE clause.

Use DOTIMES/DOLIST for probe iteration. The shipped Lisp image can try to
autoload an unavailable `loop.fasl` when a probe uses LOOP; that failure is
documented in the older [method inspection evidence](introspection/evidence/README.md#holdout-and-successful-method-inspection).
The first POST-FILL map attempt produced one FILE-ERROR and 379 subsequent
UNBOUND-VARIABLE conditions, incomplete maps and a changed AA0. Replacing its
two LOOP forms with DOTIMES eliminated the observation errors and restored
control-byte equality. The saved condition types alone do not prove the exact
autoload path. Reject such a tape even when the scene runner reports completion.

The 64-byte `SYSTEM::MEMREF` report describes the live compiled-function
metadata; it is not the serialized PLL code header. In the six-function buffer
mapping, the complete code-object slice in the captured window matched the
PLL, while the MEMREF report did not equal that slice. Use the measured entry,
window base and decoded object length to choose the comparison range. A window
can be clamped at a memory-region boundary, so its code-header offset is not
always 60. Keep the unique complete-object match; do not substitute a partial
payload or a fixed window offset when reusing this workflow.

The [FOOB/ZERO-EDGE capture](introspection/brush-buffer-predicate-native.md)
uses the two-header probe above and the ordinary mapper/Ghidra runner.
`derive-brush-buffer-predicate-native-evidence.mjs` validates both complete
objects, all reported instruction bytes, the canonical REA round-trips,
current/staged probe bytes and a fresh uninstrumented drawing/scene control.
Use a fresh ignored output beneath that capture's `native-code/mapped/` root.
These metadata targets have no dynamic-caller or behavioral claim.

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

The Windows Ghidra launcher can write
`%APPDATA%\ghidra\ghidra_12.1.4_PUBLIC\java_home.save` even when the configured
JDK and JAVA_HOME are valid. In the boundary-map run on 2026-10-05, the first
launch failed with `FileNotFoundException` and `Access is denied` for that
settings file, followed by misleading missing-JDK and interactive-input
errors. Inspect the first exception before diagnosing a missing installation.
After checking the saved toolchain paths, a scoped permission retry of the
same runner into a fresh `ghidra-b` output directory produced both valid
reports. No reinstall or global configuration edit was needed. A failed
launcher log is not a completed analysis; require the report checks above.

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

For the first natural `IN-SUB-FRAME` call, use
[`capture-in-sub-frame-caller.ps1`](tools/capture-in-sub-frame-caller.ps1)
with the runner-owned pre-scene metadata pause and a fresh native map. It
revalidates the current live `BRUSH-STROKE` and `IN-SUB-FRAME` bytes before
arming a one-shot WOW64 execute breakpoint. The saved return address resolves
to `BRUSH-STROKE+0x1cf` in the first completed seed-1234 writer-stream run.
Run terminal A with a fresh ID and output root:

```powershell
$runId = "in-sub-frame-caller-$([Guid]::NewGuid().ToString('N'))"
& .\research\oracle\run-local-scene-state-required-probe.ps1 `
  -ExtractedRoot research\extracted\aaron `
  -OutputRoot "research\extracted\local-oracle\$runId" `
  -RunId $runId -Mode writer-stream-seed-1234 `
  -PreSceneProbePath research\introspection\brush-stroke-native-links.cl `
  -PreSceneProbePauseSeconds 90 `
  -ProbeOutputNames @("aaron-brush-stroke-native-links.txt") `
  -RequiredProbeOutputName aaron-brush-stroke-native-links.txt `
  -RequiredProbeEndMarker "END brush-stroke-native-links"
```

While that run is paused, use terminal B:

```powershell
$runId = 'paste-the-exact-run-id-printed-by-terminal-A-here'
& .\research\tools\capture-in-sub-frame-caller.ps1 `
  -OracleOutputRoot "research\extracted\local-oracle\$runId" `
  -MapPath research\extracted\local-oracle\brush-stroke-native-seed1234-20261005-e\native-code\mapped\native-code-map.json
```

Run fresh same-mode controls before and after, with no probe parameters, and
wait for each oracle to finish before starting the next. After all three runs
complete, derive evidence with explicit paths so the report records which
bracketed runs were compared:

```powershell
node research\tools\derive-in-sub-frame-caller-evidence.mjs `
  research\introspection\evidence\in-sub-frame-native-caller-new.json `
  research\extracted\local-oracle\caller-control-before `
  "research\extracted\local-oracle\$runId" `
  research\extracted\local-oracle\caller-control-after `
  research\extracted\local-oracle\brush-stroke-native-seed1234-20261005-e\native-code\mapped\native-code-map.json
```

The offline
[`derive-in-sub-frame-caller-evidence.mjs`](tools/derive-in-sub-frame-caller-evidence.mjs)
checks that report against the map, staged source probe, complete runner
summaries and fresh before/after controls. The result applies to the first
entry in that 768×1080 run; it does not identify the caller of every census
row or prove the same call path in other scenes. See the
[portable caller evidence](introspection/evidence/in-sub-frame-native-caller-20261013.json).

Keep original images, memory windows, payloads, complete decompiler reports,
tool installations and REA bundles ignored. Publish probe/helper code,
normalized compact evidence and behavioral conclusions. The historical
selector implementation is unchanged by this investigation.

## PICK immediate-return mapping, 2026-10-14

Use [`pick-native-links.cl`](introspection/pick-native-links.cl) to capture
current metadata and complete native windows during the required-probe
`READY` pause. Build the indexed map before attaching the caller helper; check
the runtime/PLL hash and all eleven named candidates in the exact output.
Then run a fresh `writer-stream-seed-1234` before/observer/after triplet. The
observer is held for 120 seconds and has a required
`aaron-pick-native-links.txt` ending in `END pick-native-links`. The helper
reads the currently staged source from `C:\temp\aaron-pre-scene-probe.cl`
because the runner archives that file only after process exit; see the
[staging recovery note](tooling-workarounds.md#pick-native-caller-helper-and-ready-staging-2026-10-14).

The strict derivation requires the controls and observer to share one
`runnerSha256`. Run all three with
`run-local-scene-state-required-probe.ps1`; omit all probe parameters for each
fresh uninstrumented control. A control made with the older
`run-local-scene-state.ps1` can produce identical scene outputs but will fail
the source-binding check because its summary does not carry the same runner
hash. Re-run the whole triplet instead of loosening this check.

For the observer, use a fresh root and the required `READY` pause. While it is
paused, run the read-only helper against the same map and observer root:

```powershell
.\research\tools\capture-pick-caller.ps1 `
  -OracleOutputRoot research\extracted\local-oracle\external-runs\pick-caller-new-observer `
  -MapPath research\extracted\local-oracle\external-runs\pick-native-links-20261014-v1\native-code\mapped\native-code-map.json
```

The helper reads `returnAddress - 3` while the process is stopped, verifies
those live bytes against the same address-translated PLL, restores thread
debug registers, and lets the disposable oracle finish. Its three-byte read
is specific to this measured call site; require the entry-seeded REA
disassembly before treating those bytes as an instruction boundary. It also
accepts both Junction and SymbolicLink forms of the repository's external-run
link when verifying process ownership, so the READY pause is not stranded by
a canonical target path.

For the completed matched-runner triplet, PICK returned to `0x1fe4c07f`. The
eleven named live-to-PLL candidate matches share base `0x1fba0000`; the full
indexed PLL maps the return to payload offset 203 of the anonymous 362-byte
object at PLL offset `0x2abfb0`. The live bytes at `0x1fe4c07c` are `FF 57 27`
and match the PLL. Entry-seeded REA/Ghidra disassembly of the same complete
payload confirms `CALL [EDI+0x27]` followed by `MOV EDX,EAX` at the return.
The targeted call query remains unresolved with no targets; the Lisp function
name is also unresolved, and the full anonymous payload was not separately
read from live memory. See the [caller findings](introspection/pick-native-caller.md)
and [portable evidence](introspection/evidence/pick-native-caller-live-site-20261014-v3.json).

The successful matched-runner roots are
`pick-caller-20261014-control-before-live-site-v2`,
`pick-caller-20261014-observer-live-site-v2`, and
`pick-caller-20261014-control-after-live-site-v2`, beneath
`research/extracted/local-oracle/external-runs/`. The corresponding offline
deriver verifies those three summaries, the six matching outputs and sources,
the observer handshake, the live call-site read, the exact PLL object, and the
REA instruction boundary and unresolved-call query:

```powershell
node research\tools\derive-pick-native-caller-live-site-evidence.mjs
```

For another capture, use fresh run IDs and a fresh evidence output path; do
not reuse those retained roots or overwrite their evidence.
