# Dynamic-analysis tool survey for AARON (2026-10-14)

## Why look beyond REA

REA remains the primary static-analysis path: it maps archived payload bytes,
disassembles/decompiles them, and produces evidence-backed queries. Its current
Windows Ghidra support is marked experimental, and its documented process
capture workflow is for Linux/macOS with a native PTY. The project already has
working REA/Ghidra dossiers for the anonymous AARON payloads. The gap is live
execution of those payloads and their computed calls.

The user's idea of tracing “all system calls” addresses a different layer.
Windows system-call or API tracing can show file, registry, graphics, and
other OS-boundary behavior. It does not enumerate calls between AARON's Lisp
functions. We need user-mode instruction/call tracing for the latter.

## Candidates

### 1. Frida Stalker — first smoke-test candidate

Official Frida documentation lists IA-32 support for Stalker, while its
JavaScript API exposes Windows and `ia32` as supported process platform and
architecture values. Stalker can follow one thread and emit ordered `call`,
`ret`, basic-block, or instruction events. Its block-at-a-time translation
should observe anonymous code reached by that thread; this JIT/code-region fit
is an inference from its mechanism, not an explicit guarantee for AARON.
Self-modifying blocks can be rechecked with `trustThreshold: -1`, at additional
cost. Keep the capture to one thread and a short window.

Use a small project-owned Frida script before adopting a third-party Frida MCP
wrapper. MCP wrappers can reduce interaction overhead, but add a separate
compatibility and event-collection layer; a few Windows-oriented repositories
also label API-hooking as “strace,” which is not kernel syscall tracing.

Sources: [Stalker guide](https://frida.re/docs/stalker/),
[JavaScript API](https://frida.re/docs/javascript-api/), and the closed
[historical Windows IA-32 event-drain issue](https://github.com/frida/frida/issues/857).
The old issue is a reason to verify repeated event batches in a fixture, not
evidence that current Frida remains broken.

### 2. x64dbg MCP — direct debugger-control fallback

The [bromoket x64dbg MCP](https://github.com/bromoket/x64dbg_mcp) has a current
v2.3.0 release with prebuilt `.dp32` and `.dp64` plugins. Its README describes
live registers, memory, disassembly, breakpoints, trace logs, and tracing into
VM-dispatched code. This is the most direct agent-facing debugger option found.
It still requires x64dbg, its plugin, and an MCP client registration; it does
not itself provide a lower-overhead DBI trace or establish AARON behavior.
Treat its trace as a candidate capture and retain the project's existing
source-bound and fresh-control gates.

Sources: [repository and tool surface](https://github.com/bromoket/x64dbg_mcp)
and [v2.3.0 release](https://github.com/bromoket/x64dbg_mcp/releases).

### 3. DynamoRIO `instrcalls` — stronger custom tracer, more setup

DynamoRIO's official sample instruments direct calls, indirect calls, and
returns, logging each dynamic target. Its Windows deployment has `bin32` tools
and can launch 32-bit programs. It is a good fallback if Frida cannot reliably
follow AARON's dynamic code. The stock `drstrace` is for Windows system calls;
it is not the internal Lisp call trace. Start by running the official sample,
then write a filtered client only if the sample works with the relevant
process. Avoid system-wide injection; use per-process launch options.

Sources: [sample and `instrcalls` details](https://dynamorio.org/API_samples.html),
[Windows 32-bit build guidance](https://dynamorio.org/page_building.html),
[32-bit deployment and child-process behavior](https://dynamorio.org/page_deploy.html),
and [tool catalog](https://dynamorio.org/page_tool.html).

### 4. WinDbg Time Travel Debugging — replay-oriented fallback

TTD records user-mode process execution and replays it in WinDbg, which could
help examine a measured anonymous call site after the run. Microsoft documents
x86 recording binaries. Recording is invasive and commonly slows the target
5–20x or more; traces can grow rapidly and contain process memory. It is
therefore a bounded follow-up option, not the first tool to install.

Sources: [TTD command-line guide](https://learn.microsoft.com/en-gb/windows-hardware/drivers/debuggercmds/time-travel-debugging-ttd-exe-command-line-util)
and [TTD overview and limitations](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/time-travel-debugging-overview).

### 5. Ghidra MCP bridges — low added value here

Projects such as [13bm/GhidraMCP](https://github.com/13bm/GhidraMCP) expose
function, xref, disassembly, and decompiler queries to agents. These overlap
with the REA/Ghidra workflow already in use and do not supply live tracing of
the dynamic Lisp code. Revisit only if a concrete Ghidra UI workflow is slowing
static queries.

## Trial status, 2026-10-15

1. **Process architecture confirmed:** AARON.exe is a 32-bit process on this
   x64 Windows host; the existing helper checks it with `IsWow64Process` and
   uses WOW64 register contexts. Do not assume Java is the live trace target.
2. **Frida fixture passed:** the project-owned x86 generated-code fixture
   captured 10,000 ordered internal call/return pairs across 31 batches, with
   matching `RESULT=42` and clean exits under instrumented and uninstrumented
   runs. Full details and portable hashes are in the
   [fixture report](frida-stalker-x86-smoke-20261015.md) and
   [evidence](evidence/frida-stalker-x86-smoke-20261015.json).
3. **AARON attachment is not yet validated:** the fixture proves that this
   Frida build can follow x86 generated code here. It does not prove complete
   collection, acceptable slowdown, or harmless interaction with AARON's
   source-bound observer. The next tool trial must use a separate, bounded
   AARON observer run and fresh no-probe controls. It must not attach Frida and
   the existing Windows debugger helper to the same process at once.
4. If the AARON Frida trial loses events or disturbs controls, retain REA for
   static targeting and use the current no-TF hardware-breakpoint helper for
   narrowly scoped live reads; then consider DynamoRIO `instrcalls` or the
   x64dbg MCP. Use TTD only if reverse replay is specifically needed.

Frida 17.23.3 and `frida-tools` 14.11.0 are installed only in the ignored
project-local fixture environment. The completed fixture is not an AARON
oracle run and adds no AARON behavior claim or completion count.
