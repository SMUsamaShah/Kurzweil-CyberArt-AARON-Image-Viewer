# Frida Stalker x86 smoke test (2026-10-15)

## Result

Frida Stalker is usable for a bounded 32-bit generated-code trace on this
Windows host. The project-owned fixture passed with Frida 17.23.3 and
`frida-tools` 14.11.0, both installed in an ignored repository-local virtual
environment. The runner builds a fresh x86 executable and writes each run to a
unique ignored directory; it does not install tools system-wide or launch
AARON.

The fixture allocates a 20-byte x86 code buffer, executes a direct call to its
one-instruction return routine 2,000 times per invocation, and performs five
invocations with a 100 ms gap between them. The gap lets Stalker drain the
16,384-event queue before the next burst. The agent enables call and return
events and drains every 1 ms. Both runs produced `RESULT=42`, `END`, and exit
code 0. Stalker delivered 31 batches and recorded 10,005 target calls and
10,005 target returns, including one managed-to-fixture entry/exit for each
invocation. Within the generated code it recorded exactly 10,000 calls,
10,000 returns, and 10,000 ordered call/return pairs, with zero sequence
errors. The captured code bytes matched the fixture's expected machine code.

The machine-readable summary binds the fixture, source, smoke script, runner,
and compiler hashes:
[portable evidence](evidence/frida-stalker-x86-smoke-20261015.json). The full
batch record is preserved under the ignored
`research/artifacts/frida-stalker-trial/runs/20261014-232438-c87062eb/`
directory.

## Limits and use in AARON work

This validates Frida's x86 injection and event collection on a controlled
generated-code fixture. It does not validate AARON-specific translation,
call completeness, instrumentation overhead, or output parity. Frida has not
yet attached to an AARON process. REA remains the static-analysis tool used to
identify exact payloads and callsites; the separate AARON live capture still
uses the source-bound no-TF hardware-breakpoint helper. Frida must be trialed
in its own observer process, not concurrently with that debugger helper, and
accepted only with source-bound before/after controls.

The first unprivileged injection attempt failed in Frida's Windows injector
ACL setup. The fixture passed from the authorized elevated shell. This
documents the observed requirement on this host; it does not identify the
underlying Windows ACL call or justify changing system ACLs. If this exact
injection failure recurs, use the same fixture runner from an elevated shell.

The initial 10,000-iteration single burst filled the configured 16,384-event
queue and yielded an incomplete trace. Splitting the same workload into five
2,000-iteration invocations and allowing periodic drains produced a complete
trace. Keep traces bounded, retain completeness checks, and do not treat the
fixture result as AARON evidence.

Frida documents IA-32 support and ordered raw event delivery through Stalker;
the JavaScript API exposes configurable queue capacity/drain interval and
`Stalker.parse`. See the [Stalker guide](https://frida.re/docs/stalker/) and
[JavaScript API](https://frida.re/docs/javascript-api/).
