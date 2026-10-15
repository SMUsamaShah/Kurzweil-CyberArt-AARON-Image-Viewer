# Frida Stalker x86 fixture evidence (2026-10-15)

Two fixture-only trials passed on this Windows host: an earlier smoke that
attached to a separately launched fixture, and a later run where Frida spawned
the fixture suspended, attached its observer, then resumed it. Both use a
project-owned 32-bit generated-code fixture with Frida 17.23.3 and
`frida-tools` 14.11.0 from an ignored repository-local virtual environment.
Neither run launches AARON.

## Earlier attach smoke

The fixture allocates a 20-byte x86 code buffer and invokes its one-instruction
return routine 2,000 times per invocation, across five invocations with a
100 ms gap. The gap lets Stalker drain the 16,384-event queue between bursts.
The observer enables call and return events and drains every 1 ms. The plain
control and instrumented run both produced `RESULT=42`, `END`, and exit code 0.
Stalker delivered 31 batches and recorded 10,005 target calls and 10,005
target returns. Within the generated routine it recorded exactly 10,000 calls,
10,000 returns, and 10,000 ordered call/return pairs, with zero sequence
errors. The captured code bytes matched the fixture's expected machine code.

The portable summary binds the fixture, source, attach observer, runner, and
compiler hashes:
[attach-smoke evidence](evidence/frida-stalker-x86-smoke-20261015.json). Its
full batch record is preserved under the ignored
`research/artifacts/frida-stalker-trial/runs/20261014-232438-c87062eb/`
directory.

The first unprivileged injection attempt for this attach smoke failed in
Frida's Windows injector ACL setup. The fixture passed from the authorized
elevated shell. This records what happened in that trial; it does not identify
the underlying Windows ACL call or justify changing system ACLs.

## Frida-owned spawn path

The later run used
`research/tools/run-frida-spawn-stalker-fixture.ps1`. Frida spawned a fresh
x86 fixture suspended, attached and loaded the observer before resuming it,
received the fixture's `READY` line, and armed Stalker before sending fixture
input. After the worker returned `RESULT=42` and the fixture confirmed its
worker had exited, the observer unfollowed and flushed Stalker, waited for the
event queue to settle, then allowed `END` and process exit. The portable
evidence records all 13 lifecycle stages in order.

The plain control and spawned fixture both returned `RESULT=42`, printed
`WORKER-EXITED` and `END`, and exited with code 0. The spawned process was
`ia32`. Stalker delivered 34 sequential batches containing 38,506 parsed
events; the per-batch event and byte counts reconcile. The trace contains
10,005 target calls and returns, including the five managed-to-fixture
invocation entries and exits. The generated routine contributes exactly
10,000 calls, 10,000 returns, and 10,000 ordered pairs, with zero sequence
errors. All six assertions in the raw run record passed.

The deterministic validator checks the raw run's full assertion set, exact
lifecycle order, counters, per-batch reconciliation, stop/settle report, and
the hashes of the compiled fixture, fixture source, observer Python, runner
PowerShell, and compiler. Its portable output is
[spawn-path evidence](evidence/frida-stalker-spawn-x86-smoke-20261015.json).
The raw run remains in the ignored
`research/artifacts/frida-stalker-trial/spawn-runs/20261015-002344-bf0dc937/`
directory. Rebuild the evidence with:

```powershell
node research/tools/derive-frida-spawn-stalker-evidence-20261015.mjs
```

## Limits and use in AARON work

These trials validate Frida x86 injection, Stalker event collection, and the
Frida-owned spawn lifecycle on a controlled generated-code fixture. They do
not validate AARON-specific translation, call completeness, instrumentation
overhead, or output parity. Frida has not attached to or spawned an AARON
process. REA remains the static-analysis tool used to identify exact payloads
and callsites; the separate AARON live capture still uses the source-bound
no-TF hardware-breakpoint helper. Any Frida trial on AARON requires its own
observer process and source-bound before/after controls.

The initial 10,000-iteration single burst in the attach smoke filled the
configured 16,384-event queue and yielded an incomplete trace. Splitting the
same workload into five 2,000-iteration invocations and allowing periodic
drains produced a complete fixture trace. Keep traces bounded, retain
completeness checks, and do not treat either fixture result as AARON evidence.

Frida documents IA-32 support and ordered raw event delivery through Stalker;
the JavaScript API exposes configurable queue capacity/drain interval and
`Stalker.parse`. See the [Stalker guide](https://frida.re/docs/stalker/) and
[JavaScript API](https://frida.re/docs/javascript-api/).
