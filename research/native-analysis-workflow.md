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

## OS-level tracing is a separate evidence layer

For the installed REA 6.4.0 workflow, Windows Ghidra analysis is static.
`trace-native-values` follows decompiler-derived values across statically
resolved calls; unresolved computed calls stay unknown. REA's native call
observer is an LLDB facility for launching Mach-O targets, and its process
capture workflow is not available for native Windows processes. Neither
feature provides an all-calls trace for this 32-bit AARON build. See REA's
[native investigation guide](https://github.com/morluto/rea/blob/main/docs/native-investigation.md)
and [process capture guide](https://github.com/morluto/rea/blob/main/docs/process-capture.md).

Windows [Process Monitor](https://learn.microsoft.com/sysinternals/downloads/procmon)
can show file-system, registry, and process/thread activity with stacks for
those events. [ETW](https://learn.microsoft.com/en-us/windows/win32/etw/about-event-tracing)
can collect kernel or application-defined events from enabled providers; its
coverage depends on the chosen providers and can have gaps. These traces help
answer questions about AARON's operating-system interactions, but do not show
every AARON-internal Lisp call or return value.

Microsoft also documents a Windows DTrace `syscall` provider with entry and
return probes for NT system calls, plus a `pid` provider for user-mode process
functions and offsets. That can answer selected OS-boundary questions and, on
supported systems, instrument chosen user-mode addresses. It still does not
automatically recover AARON's Lisp call graph or names for dynamically compiled
functions. The current host reported Windows `10.0.19045.6466`; `dtrace.exe`
is not installed.

WPR is available. A read-only `wpr -profiledetails GPU` query resolves to
`GPU.Verbose.Memory`, enables the kernel `SystemCall` keyword, and includes
DxgKrnl, DXGI, Direct3D 11, and D3D10Level9 providers. Its listed system stack
events are context switches, hard page faults, and sampled profiles; it does
not list syscall entry/exit stackwalks. The profile can characterize selected
kernel/GPU activity but does not expose the PREMIUM `[EDI+0x27]` Lisp dispatch
slot or its in-process caller. No WPR trace session was started and no tool was
installed. See Microsoft's [DTrace provider documentation](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/dtrace)
and [WPR kernel event list](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/event).

## Alternative instruction-tracing methods checked, 2026-10-14

The current host has no `windbg`, `windbgx`, `cdb`, `ttd`, `TTDReplay`,
`pin`, `pin32`, `drrun`, or `frida` command, and no matching debugger directory
or portable kit was found in the repository. The Windows 10 x64 shell is not
elevated. WinDbg Time Travel Debugging (TTD) is a distinct future option: it
records user-mode execution for forward/reverse replay, which could inspect the
PREMIUM indirect call and its registers after the recording. It would still
need the live address-to-bytes mapping for AARON's anonymous Lisp code, and the
trace would need a bounded, dedicated output location. Microsoft documents
[recording a TTD trace](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/time-travel-debugging-record)
and [replaying one](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/time-travel-debugging-overview).
No debugger was installed and no trace was recorded.

Intel Pin is another separate option: its current Windows kits support IA-32
and can instrument executed branches to record source and destination
addresses. A narrowly filtered Pin tool could capture more of the transfer
chain than the selected hardware breakpoints, but Pin is not installed and
code-cache translation may alter timing. Compatibility with AARON's
`MEM_MAPPED`/`PAGE_READWRITE` code region is unverified. If considered later,
first run a known indirect-call 32-bit fixture, then compare fresh original
controls before using it on AARON. See Intel's [Pin kit and platform list](https://www.intel.com/content/www/us/en/developer/articles/tool/pin-a-binary-instrumentation-tool-downloads.html)
and [Pin 4.2 guide](https://software.intel.com/sites/landingpage/pintool/docs/99776/Pin/doc/html/index.html).

Windows DTrace can trace selected NT syscalls and user-mode PID-provider
functions or offsets, but `dtrace.exe` is absent here. Microsoft's current
Windows instructions require enabling DTrace with `bcdedit` and rebooting; do
not change boot configuration as part of an ordinary AARON probe. Intel PT is
not exposed by this virtualized host: CPUID reports the hypervisor bit and
clears the Intel PT capability bit. The physical host CPU may differ. The
available WPR CPU profile is sampled rather than instruction-complete, while
the GPU profile's syscall events have no listed syscall stackwalk. These
methods therefore remain options for later, scoped tests; REA's exact-payload
analysis plus the bounded no-TF hardware-breakpoint capture is the usable
route on this host. See Microsoft's [DTrace enablement requirements](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/dtrace)
and [Intel PT description](https://www.intel.com/content/www/us/en/support/articles/000059254/processors/intel-xeon-processors.html).

For internal AARON flow, first use REA on the exact PLL-mapped payload to find
candidate instructions and value dependencies. Then rediscover the live code
address and validate its bytes before using a bounded breakpoint capture. Add
Process Monitor or ETW only when the investigation also needs file, registry,
process, or other provider-reported OS activity; treat that as
complementary evidence, not a substitute for function-level observation.

## Frida Stalker x86 fixture validation, 2026-10-15

Frida 17.23.3 Stalker passes a project-owned 32-bit generated-code fixture on
this Windows host: 10,000 ordered internal call/return pairs were captured
across 31 batches, and instrumented and uninstrumented runs returned the same
value. The [trial report](tooling/frida-stalker-x86-smoke-20261015.md) records
the exact scope, hashes, queue-overflow lesson, and permissions behavior; the
[portable evidence](tooling/evidence/frida-stalker-x86-smoke-20261015.json)
binds the tested sources and executable.

This confirms the tracer can attach to an x86 fixture and follow runtime
generated code here. Two later source-bound Frida 17.23.3 attach attempts on
separate disposable AARON runs crashed in the same x86 `frida-agent.dll`
(SHA-256 `5f27af64a26d0d65b5c1477584ffe44b6a4f421b49781fa7e8816ae2639cc741`)
with exception `0xc0000409` at offset `0x00c0df07`. Windows Error Reporting
confirms the faulting module; neither observer script loaded nor armed. This
is not a no-hit or behavior result. Keep the
[portable crash record](introspection/evidence/frida-aaron-injection-crash-20261015.json)
and do not retry this agent/runtime combination without a material change.

For native mapping, continue to use REA on the exact PLL payload. The current
AARON live route uses the source-bound no-TF hardware-breakpoint helper; do not
attach Frida to a process controlled by the Windows debugger. The next target
is the REA-identified `CALL [EDI+0x35f]` in the anonymous PREMIUM destination,
which did not execute in three accepted 768×1080 captures: two seed-1234
writer-stream scenes and one seed-5678 full-writer scene. All three captured
the anonymous destination's same-thread tail jump to the freshly mapped PICK
entry. The full-writer control includes a 25,296,613-byte tape. See the
[seed-1234 repeat evidence](introspection/evidence/premium-internal-transfer-repeat-20261015.json)
and [seed-5678 evidence](introspection/evidence/premium-internal-transfer-seed5678-20261015.json).
Do not repeat those conditions. First use REA's branch/data-flow view to
identify a different existing source-bound scene likely to exercise the loop
backedge, then use fresh uninstrumented controls and rediscover the live code
bytes.

REA's exact-window xrefs query now returns runtime-window offset `+0x90` as a
static source for `+0x17`. The three accepted outer-destination snapshots
predict the `JC +0x99` branch taken, consistent with the bounded zero-hit at
`+0x17`, but no runtime branch event was captured. Preserve this as a
prediction only; see the [note](introspection/premium-loop-backedge-prediction-20261015.md)
and [portable evidence](introspection/evidence/premium-loop-backedge-prediction-20261015.json).
The next capture should use another source-bound scene, break at the JC, and
read the potential `[EDI+0x35f]` target slot at that event.

The first no-TF attempt at the PREMIUM internal transfers reached the expected
outer callsite but rejected the live 256-byte window hash before arming internal
breakpoints; no after control followed. Its exact-window static REA decode is
documented in the [variant finding](introspection/premium-internal-transfer-window-variant-20261015.md).
The installed Frida Python API exposes `Device.spawn`, `attach`, and `resume`,
including `cwd`/environment options, while the current local oracle runner
launches with PowerShell `Start-Process`. The fixture validated the lifecycle,
but the two AARON attaches crashed before script load; no AARON trace was
produced. Keep the current live route on REA plus the non-injecting no-TF
breakpoint helper. Reconsider Frida only after a materially changed agent or
runtime passes a fixture and its own source-bound AARON preflight.

## FREE-PATH indirect call-site capture, 2026-10-14

Use REA first to inspect the exact mapped `FREE-PATH` payload, identify the
computed calls and nearby data flow, and save the native-map identity. Here the
static targets at `+0x39a` and `+0x3e4` remained unresolved, so the bounded live
helper captured their first execution without patching AARON code. Before a
new original-runtime run, read [the oracle protocol](oracle.md), use a fresh
output root, and make sure no other AARON oracle is active.

The successful serial triplet used the paired
[`FREE-PATH` / `DRAW-CFORM` map](extracted/local-oracle/external-runs/freepath-caller-map-20261013-f/native-code/mapped/native-code-map.json)
and these helpers:

- [`capture-free-path-callsite-triplet-v1.ps1`](tools/capture-free-path-callsite-triplet-v1.ps1)
- [`capture-free-path-callsite-v1.ps1`](tools/capture-free-path-callsite-v1.ps1)
- [`AaronFreePathCallsitesV1.cs`](oracle/AaronFreePathCallsitesV1.cs)
- [`free-path-caller-native-links.cl`](introspection/free-path-caller-native-links.cl)

The original run used a 768×1080 before/observer/after triplet in
`writer-stream-seed-1234`. All five drawing/scene artifacts and six staged
sources match across runs. The observer hit `+0x3e4` and `+0x39a`; it exited
before `+0x3ac`. It captured the same raw slot value at both calls but did not
name it as a Lisp function or infer a call ABI. Keep the finding scoped to
these first hits; do not infer they belong to one invocation or establish the
branch condition. See the [FREE-PATH findings](introspection/free-path-native.md#bounded-live-reads-of-indirect-call-sites-2026-10-14)
and [portable evidence](introspection/evidence/free-path-callsite-v1-20261014-084337-07112bc0-v2.json).

## PREMIUM `[EDI+0x27]` dispatch slot at PICK entry, 2026-10-14

REA/Ghidra queried every CALL in both `SELECT-SUBJECT` methods; all 36
computed sites remain unresolved statically. For the PREMIUM method's known
`[EDI+0x27]` site, a complete 768×1080 source-bound triplet captured a
`PICK` entry with return address `0x1fe4c07f`. The live call bytes at
`0x1fe4c07c` are `FF 57 27` and match the exact mapped PLL payload. At this
pre-prologue PICK entry, EDI+0x27 held raw bytes `83 09 00 20`, or dword
`0x20000983`; the mapped PICK entry is `0x1fe00e8c`. This slot read occurred
after the CALL, so it does not prove the caller's operand; EDI may change
before PICK entry.

The triplet's five drawing/scene artifacts, six staged Lisp sources, and
before/after planning traces match. The portable record
[`pick-dispatch-slot-20261014-v1.json`](introspection/evidence/pick-dispatch-slot-20261014-v1.json)
binds the observation to the complete controls, probe, map and source hashes.
The caller's dynamic slot operand remains unknown. For the next pass, use
REA's exact static callsite to guide a fresh live capture, rediscover and
validate the current instruction bytes, stop immediately before the call,
read its slot, then single-step that instruction and record the resulting EIP.
Only then inspect a small bounded byte window at the destination and analyze
those exact bytes with REA if they are executable. Do not infer a Lisp name,
ABI, or JavaScript contract before that mapping succeeds.

## Bounded destination-window analysis with REA 6.4

When a `debugger-capture-diagnostic.json` contains a complete 32-byte
`rawDebuggerResult.singleStep.destinationWindow`, the offline builder
[`prepare-debugger-window-pe.mjs`](tools/prepare-debugger-window-pe.mjs) can
place those exact bytes at the analyst address `0x10001000` in a minimal
synthetic PE. Stage an unchanged copy of the diagnostic under the ignored
`research/artifacts/rea-tools/` root first; the builder restricts its input and
fresh output directory to that root, rejects partial or failed memory reads,
and binds the diagnostic, copied bytes, generated PE, and seed with SHA-256
hashes. It does not launch the PE or REA.

The generated seed is exactly one `address<TAB>code` record at
`0x10001000`; it supplies no function name. The safe wrapper
[`invoke-rea-ghidra-query.ps1`](tools/invoke-rea-ghidra-query.ps1) accepts
`inspect-native-instruction` only with that single code-only seed at the
requested address. Run the query into a separate fresh directory beneath
`research/artifacts/rea-tools/` if this analysis is needed.

The code window is exactly 32 captured bytes. Any instruction that begins in
the final bytes and extends past that boundary is excluded from captured-byte
analysis; synthetic PE padding is not source evidence. The address and any
relative branch or call destinations in this image are synthetic. A dynamic
window disassembly cannot recover a Lisp function name, Lisp ABI, or original
function boundary. Any Ghidra-inferred procedure boundary belongs only to the
synthetic image and must not be attributed to AARON's original runtime.

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

## PICK-entry return-site association, 2026-10-14

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

The completed matched-runner triplet stopped at the first natural PICK entry
and captured saved stack value `0x1fe4c07f`. Its preceding bytes at
`0x1fe4c07c` are `FF 57 27`; entry-seeded REA/Ghidra disassembly confirms
`CALL [EDI+0x27]`. A separate CLOS census and complete live-to-PLL method map
match that saved value to offset 203 of the PREMIUM `SELECT-SUBJECT` method's
362-byte payload inside a 366-byte object. This is a return-site association,
not proof that the CPU destination of the CALL was PICK. The computed target
remains unresolved until a source-bound pre-CALL single-step capture records
the instruction's actual post-step EIP. See the [PICK findings](introspection/pick-native-caller.md),
[portable evidence](introspection/evidence/pick-native-caller-live-site-20261014-v4.json),
and [method identity evidence](introspection/evidence/select-subject-method-identity-20261014-v2.json).

The successful matched-runner roots are
`pick-caller-20261014-control-before-live-site-v2`,
`pick-caller-20261014-observer-live-site-v2`, and
`pick-caller-20261014-control-after-live-site-v2`, beneath
`research/extracted/local-oracle/external-runs/`. The corresponding offline
deriver verifies those three summaries, the six matching outputs and sources,
the observer handshake, the live call-site read, the exact PLL object, and the
REA instruction boundary and unresolved-call query:

```powershell
node research\tools\derive-pick-native-caller-live-site-evidence.mjs --overwrite
```

For another capture, use fresh run IDs and a fresh evidence output path; do
not reuse those retained roots or overwrite their evidence.

## PREMIUM CALL destination and same-thread follow-up

The PREMIUM method's current native instruction remains the validated
`CALL [EDI+0x27]` at payload offset 200. The original helper
[`AaronPremiumCallsiteStepV1.cs`](oracle/AaronPremiumCallsiteStepV1.cs) keeps
its strict TF/DR6.BS acceptance gate unchanged. If that gate rejects a capture,
do not relax it. The separate
[`AaronPremiumCallsiteDestinationBreakpointV1.cs`](oracle/AaronPremiumCallsiteDestinationBreakpointV1.cs)
uses a fresh first-chance DR0 execute breakpoint: it stops at the current
callsite, validates `FF 57 27`, reads the actual `[EDI+0x27]` dword, restores
the callsite breakpoints, and arms DR0 at that value on the same thread. The
capture is accepted only when the same thread hits B0 at the measured EIP,
ESP decreases by four, `[ESP]` equals callsite+3, 32 destination bytes are
read, and debug state is restored cleanly.

Run the existing source-bound coordinator with `-UseDestinationBreakpoint`
and a fresh run prefix. It rediscovers the PREMIUM and PICK entries from the
READY metadata pause, verifies both complete live payloads against the current
PLL, then runs fresh uninstrumented controls before and after the observer.
The coordinator checks the five drawing/scene artifacts, six staged sources,
planning trace, runtime identity, exact observer envelope, and cleanup fields.
It keeps the v1 step gate separate. The accepted run is recorded in
[`premium-callsite-destination-breakpoint-20261014-v1.json`](introspection/evidence/premium-callsite-destination-breakpoint-20261014-v1.json).

That run's direct CPU destination was `0x20000983`, not current PICK entry
`0x1fe00e8c`. The target region was committed `MEM_MAPPED`/`PAGE_READWRITE`;
the 32-byte window had no exact match in the captured PLL. REA statically
decoded eight starts covering 22 bytes but created zero functions. Its
conditional branch and out-of-window jump are static candidates only. A
follow-up complete source-bound triplet did arm a one-shot DR0 breakpoint at
PICK and DR1 at the original `callSite+3` continuation. PICK fired first on
the same thread with matching ESP, EBP marker, and saved continuation. The
intervening native instructions remain unobserved, so this does not prove a
direct edge or identify an ABI/function. Its portable record is
[`premium-callsite-pick-correlation-20261014-v1.json`](introspection/evidence/premium-callsite-pick-correlation-20261014-v1.json).

The follow-up REA query set examined every byte start at offsets +18 through
+24 in the same captured window. These seven alternate code seeds all decode
within the 32 captured bytes, but none reports a CALL; they do not establish
instruction boundaries in the skipped bytes. An `xrefs` query for offset +25
reports the static source at +14, matching the earlier conditional branch.
The complete hashes and scope limits are in the
[`REA follow-up evidence`](introspection/evidence/premium-callsite-destination-window-rea-20261014-v2.json).

The original 32-byte capture still does not contain the out-of-window jump
target. A wider capture is now complete: triplet
`premium-v2-20261014e-20261014-170512-b228b66c` rediscovered the destination
and saved a 256-byte window at `0x20000903–0x20000a02`, with matching fresh
controls. REA 6.4/Ghidra 12.1.4 decoded `CALL [EDI+0x35f]` at `0x2000091a` and
`JMP [ESI+0x12]` at `0x200009a4`. At `0x20000993`, bytes `EB 85` encode a
relative jump back to the callsite even though provider flow metadata labels
the row as a call terminator/unconditional call. Preserve that discrepancy;
neither candidate has been shown to execute. The independent constant-slot
scan found a `PICK` symbol reference but no function-valued constant, so it
does not add a call edge. See the [window evidence](introspection/evidence/premium-callsite-wide-window-20261014-v3.json),
[REA report](introspection/evidence/premium-callsite-wide-window-rea-20261014-v3.json),
and [constant-slot evidence](introspection/evidence/premium-pick-constant-graph-20261014-v1.json).

The next internal-flow experiment is a no-TF hardware execute-breakpoint
capture. Rediscover the target in each fresh observer, validate the complete
256-byte window and instruction signatures before deriving site addresses,
then capture the first-chance same-thread hardware event and its live operand.
Temporarily trap the measured destination and enforce the CALL/JMP stack
checks; restore all original debug state. Reject nonhits, changed bytes,
ambiguous events, cleanup errors, or a triplet without fresh matching
uninstrumented controls. Do not repeat the TF route after its strict
`DR6.BS` gate rejected prior events. Preserve the anonymous target's status;
do not infer a Lisp name, ABI, or direct PICK edge.

The earlier accepted follow-up run is
`premium-pick-v3-20261014-125028-65b3a9cc`. Its three original runs completed;
the comparison was rebuilt offline after the PowerShell 5.1 coordinator hit a
post-capture serializer memory blowup. The exact source snapshot and recovery
steps are recorded in the [tooling quick fixes](tooling-workarounds.md#premium-triplet-comparison-exhausted-memory-after-all-runs-2026-10-14).

## PREMIUM JC successor capture

Triplet `prem-jc-456069-r3-20261015-112943-78e0d290` extended the
non-injecting route to a pre-instruction breakpoint at `JC rel8 +0x09` in a
1920×1080 full-writer seed-456069 scene. The actual observer recorded CF=1 at
`0x20000991` and `[EDI+0x35f]=0x6388bb08`; it stopped before JC execution.
This validates the branch condition for that scene, not the successor or an
executed indirect CALL. The later internal sites had no hits only because the
capture boundary preceded them.

REA 6.4/Ghidra 12.1.4 decoded `72 09` from a hash-pinned synthetic PE and
reported the static target. The synthetic input was never executed; keep REA
in the role of static navigation. The runtime window had a different full
hash from the historical reference while all 11 instruction spans matched.
See the [JC finding](introspection/premium-internal-transfer-jc-v1.md),
[portable evidence](introspection/evidence/premium-internal-transfer-jc-seed456069-20261015.json),
and [retained REA inputs](introspection/evidence/rea-inputs/premium-jc-20261015/).

The next observer must capture the first post-JC EIP without single-stepping
through the block. Rediscover and validate the code window in the new observer.
At the JC event, reuse DR0 for the fallthrough instruction at window offset
`+0x90` and DR3 for the taken target at `+0x99`; retain DR1 on the tail JMP and
DR2 on the outer-return guard. Check register readback before resuming JC, then
require one successor event with matching EIP, sole DR6 cause, execute-only
DR7 settings, clear TF/DR6.BS, and matching live bytes. DR0 no longer watches
the candidate CALL after the branch; do not claim a later CALL result. Restore
all original debug-register state exactly before continuing the successor
event. If the helper cannot do this fail-closed, split the work into a helper
change and no-launch preflight before a fresh controlled triplet. Never infer
the successor solely from CF or REA.
