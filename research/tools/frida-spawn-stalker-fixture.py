#!/usr/bin/env python3
"""Validate Frida-owned spawn, attach, resume, stdio, and Stalker on an x86 fixture."""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import importlib.metadata
import json
import os
import queue
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import frida


AGENT_SOURCE = r"""
let targetThreadId = null;
let batchCount = 0;
let totalEvents = 0;
let overflowSent = false;
const maxEvents = 60000;
const maxBatches = 256;

send({
  kind: "attached",
  pid: Process.id,
  arch: Process.arch
});

function receiveCommand() {
  recv("command", message => {
    const payload = message.payload || {};
    if (payload.kind === "start") {
      targetThreadId = Number(payload.threadId);
      Stalker.queueCapacity = 16384;
      Stalker.queueDrainInterval = 1;
      Stalker.follow(targetThreadId, {
        events: { call: true, ret: true, exec: false, block: false, compile: false },
        onReceive(events) {
          const parsedEvents = Stalker.parse(events, { annotate: true, stringify: true });
          const parsedEventCount = parsedEvents.length;
          batchCount += 1;
          totalEvents += parsedEventCount;
          if (totalEvents > maxEvents || batchCount > maxBatches) {
            if (!overflowSent) {
              overflowSent = true;
              send({ kind: "overflow", batchCount, totalEvents, maxEvents, maxBatches });
            }
            return;
          }
          send({
            kind: "batch",
            index: batchCount,
            parsedEventCount,
            rawByteLength: events.byteLength,
            events: parsedEvents
          });
        }
      });
      send({ kind: "armed", threadId: targetThreadId });
      receiveCommand();
      return;
    }
    if (payload.kind === "stop") {
      if (targetThreadId !== null) {
        const liveThreadIds = Process.enumerateThreads().map(thread => thread.id);
        if (liveThreadIds.includes(targetThreadId)) {
          send({
            kind: "error",
            message: "Fixture reported worker join before the traced thread disappeared",
            targetThreadId,
            liveThreadIds
          });
          return;
        }
        Stalker.unfollow(targetThreadId);
        // Drain the sink after unfollow so the final buffered events are
        // delivered after the source thread has exited.
        Stalker.flush();
        Stalker.garbageCollect();
      }
      const stopStartedAt = Date.now();
      function sendStoppedAfterQuiet(previousCount, quietPolls) {
        setTimeout(() => {
          // A remote thread may still be finishing its transition back to
          // original code. Repeated flushes plus a longer quiet window make
          // the final count reflect any late sink callbacks.
          Stalker.flush();
          Stalker.garbageCollect();
          if (batchCount === previousCount) {
            quietPolls += 1;
          } else {
            previousCount = batchCount;
            quietPolls = 0;
          }
          if (quietPolls >= 20) {
            send({
              kind: "stopped",
              batchCount,
              totalEvents,
              quietPolls,
              elapsedMs: Date.now() - stopStartedAt
            });
          } else if (Date.now() - stopStartedAt >= 15000) {
            send({
              kind: "error",
              message: "Stalker batch stream did not settle after 15 seconds",
              batchCount,
              totalEvents,
              quietPolls
            });
          } else {
            sendStoppedAfterQuiet(batchCount, quietPolls);
          }
        }, 100);
      }
      sendStoppedAfterQuiet(batchCount, 0);
      return;
    }
    send({ kind: "error", message: "Unknown observer command" });
    receiveCommand();
  });
}

receiveCommand();
"""


class FixtureOutput:
    def __init__(self) -> None:
        self.lines: queue.Queue[tuple[int, str | None]] = queue.Queue()
        self.stdout: list[str] = []
        self.stderr: list[str] = []
        self.pending = {1: "", 2: ""}
        self.output_eof: set[int] = set()
        self.pid: int | None = None
        self.lock = threading.Lock()

    def callback(self, pid: int, fd: int, data: bytes) -> None:
        if self.pid is None or int(pid) != self.pid or fd not in (1, 2):
            return
        raw = bytes(data)
        with self.lock:
            if not raw:
                self.output_eof.add(fd)
                self.lines.put((fd, None))
                return
            text = raw.decode("utf-8", errors="replace")
            target = self.stdout if fd == 1 else self.stderr
            target.append(text)
            self.pending[fd] += text
            while "\n" in self.pending[fd]:
                line, remainder = self.pending[fd].split("\n", 1)
                self.pending[fd] = remainder
                self.lines.put((fd, line.rstrip("\r")))

    def read_line(self, timeout: float, prefix: str, fd: int = 1) -> str:
        deadline = time.monotonic() + timeout
        skipped: list[str] = []
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"Timed out waiting for fixture line {prefix!r}; skipped={skipped!r}")
            try:
                line_fd, line = self.lines.get(timeout=remaining)
            except queue.Empty as exc:
                raise TimeoutError(f"Timed out waiting for fixture line {prefix!r}") from exc
            if line is None:
                if line_fd == fd:
                    raise RuntimeError(f"Fixture output fd {fd} closed before {prefix!r}")
                continue
            if line_fd == fd and line.startswith(prefix):
                return line
            skipped.append(f"fd{line_fd}:{line}")


class ProcessExitWatcher:
    def __init__(self, pid: int) -> None:
        if os.name != "nt":
            raise OSError("This fixture harness is intended for Windows")
        self.kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel32.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
        self.kernel32.OpenProcess.restype = ctypes.c_void_p
        self.kernel32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        self.kernel32.WaitForSingleObject.restype = ctypes.c_uint32
        self.kernel32.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32)]
        self.kernel32.GetExitCodeProcess.restype = ctypes.c_int
        self.kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        self.kernel32.CloseHandle.restype = ctypes.c_int
        self.handle = self.kernel32.OpenProcess(0x00100000 | 0x00001000, 0, pid)
        if not self.handle:
            raise ctypes.WinError(ctypes.get_last_error())

    def wait(self, timeout_ms: int = 15000) -> int:
        wait_result = self.kernel32.WaitForSingleObject(self.handle, timeout_ms)
        if wait_result != 0:
            raise TimeoutError(f"Fixture process did not exit (wait result 0x{wait_result:08x})")
        code = ctypes.c_uint32()
        if not self.kernel32.GetExitCodeProcess(self.handle, ctypes.byref(code)):
            raise ctypes.WinError(ctypes.get_last_error())
        return int(code.value)

    def close(self) -> None:
        if self.handle:
            self.kernel32.CloseHandle(self.handle)
            self.handle = None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pe_machine(path: Path) -> int:
    data = path.read_bytes()
    if data[:2] != b"MZ":
        raise ValueError("Fixture is not a PE image")
    pe_offset = int.from_bytes(data[0x3C:0x40], "little")
    if data[pe_offset : pe_offset + 4] != b"PE\0\0":
        raise ValueError("Fixture has no PE signature")
    return int.from_bytes(data[pe_offset + 4 : pe_offset + 6], "little")


def event_fields(event: object) -> tuple[str | None, int | None, int | None]:
    if not isinstance(event, (list, tuple)) or len(event) < 3:
        return None, None, None
    kind = event[0].lower() if isinstance(event[0], str) else None
    addresses: list[int | None] = []
    for value in event[1:3]:
        if isinstance(value, str) and re.fullmatch(r"0x[0-9a-fA-F]+", value):
            addresses.append(int(value, 16))
        else:
            addresses.append(None)
    return kind, addresses[0], addresses[1]


def wait_state(event: threading.Event, state: dict[str, object], label: str, timeout: float = 15.0) -> None:
    if not event.wait(timeout):
        raise TimeoutError(f"Frida agent did not report {label}")
    errors = state.get("errors")
    if errors:
        raise RuntimeError(f"Frida agent error while waiting for {label}: {errors!r}")


def run_plain(exe: Path) -> dict[str, object]:
    process = subprocess.Popen(
        [str(exe)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    try:
        stdout, stderr = process.communicate(input="\n\n", timeout=60)
        lines = stdout.splitlines()
        if len(lines) != 4:
            raise RuntimeError(f"Plain fixture produced an unexpected line set: {lines!r}; stderr={stderr!r}")
        ready, result, worker_exited, end = lines
        if not ready.startswith("READY "):
            raise RuntimeError(f"Plain fixture did not reach READY: {ready!r}")
        if result != "RESULT=42":
            raise RuntimeError(f"Plain fixture returned unexpected output: {result!r}")
        return_code = process.returncode
        if worker_exited != "WORKER-EXITED" or end != "END" or return_code != 0:
            raise RuntimeError(
                f"Plain fixture completion mismatch: worker={worker_exited!r}, end={end!r}, exit={return_code}"
            )
        return {
            "ready": ready,
            "result": result,
            "workerExited": worker_exited,
            "end": end,
            "exitCode": return_code,
        }
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)


def run_spawned(exe: Path) -> dict[str, object]:
    device = frida.get_local_device()
    output = FixtureOutput()
    lifecycle: list[str] = ["output-handler-registered"]
    state: dict[str, object] = {
        "attached": threading.Event(),
        "armed": threading.Event(),
        "stopped": threading.Event(),
        "batches": [],
        "errors": [],
        "overflow": None,
        "attachedPayload": None,
        "stoppedPayload": None,
    }
    pid: int | None = None
    exit_watcher: ProcessExitWatcher | None = None
    session = None
    script = None

    def on_message(message: dict[str, object], _data: bytes | None) -> None:
        if message.get("type") == "error":
            errors = state["errors"]
            assert isinstance(errors, list)
            errors.append(message)
            state["attached"].set()
            state["armed"].set()
            state["stopped"].set()
            return
        payload = message.get("payload")
        if not isinstance(payload, dict):
            return
        kind = payload.get("kind")
        if kind == "attached":
            state["attachedPayload"] = payload
            state["attached"].set()
        elif kind == "armed":
            state["armedPayload"] = payload
            state["armed"].set()
        elif kind == "batch":
            batches = state["batches"]
            assert isinstance(batches, list)
            batches.append(payload)
        elif kind == "overflow":
            state["overflow"] = payload
            errors = state["errors"]
            assert isinstance(errors, list)
            errors.append({"type": "overflow", "payload": payload})
        elif kind == "stopped":
            state["stoppedPayload"] = payload
            state["stopped"].set()
        elif kind == "error":
            errors = state["errors"]
            assert isinstance(errors, list)
            errors.append(payload)
            state["attached"].set()
            state["armed"].set()
            state["stopped"].set()

    try:
        device.on("output", output.callback)
        pid = device.spawn(
            str(exe),
            argv=[str(exe)],
            cwd=str(exe.parent),
            stdio="pipe",
        )
        output.pid = pid
        lifecycle.append("spawn-returned-suspended-pid")
        exit_watcher = ProcessExitWatcher(pid)
        session = device.attach(pid)
        lifecycle.append("session-attached")
        script = session.create_script(AGENT_SOURCE)
        script.on("message", on_message)
        script.load()
        wait_state(state["attached"], state, "attached identity")
        lifecycle.append("agent-loaded-before-resume")
        attached = state["attachedPayload"]
        if not isinstance(attached, dict) or attached.get("pid") != pid or attached.get("arch") != "ia32":
            raise RuntimeError(f"Unexpected spawned-process identity: {attached!r}")

        device.resume(pid)
        lifecycle.append("process-resumed")
        ready = output.read_line(30, "READY ")
        lifecycle.append("fixture-ready-output-received")
        ready_values = dict(re.findall(r"(\w+)=([^ ]+)", ready))
        if int(ready_values["pid"]) != pid:
            raise RuntimeError(f"READY PID does not match Frida spawn PID: {ready!r}")
        thread_id = int(ready_values["tid"])
        code_base = int(ready_values["code"], 16)
        code_size = int(ready_values["size"])
        iterations = int(ready_values["iterations"])
        repetitions = int(ready_values["repetitions"])
        expected_pairs = iterations * repetitions

        script.post({
            "type": "command",
            "payload": {"kind": "start", "threadId": thread_id},
        })
        wait_state(state["armed"], state, "Stalker arm")
        lifecycle.append("stalker-armed-before-fixture-input")
        armed = state.get("armedPayload")
        if not isinstance(armed, dict) or armed.get("threadId") != thread_id:
            raise RuntimeError(f"Stalker armed a different thread: {armed!r}")

        device.input(pid, b"\n")
        result = output.read_line(180, "RESULT=")
        lifecycle.append("instrumented-fixture-result-received")
        worker_exited = output.read_line(30, "WORKER-EXITED")
        if worker_exited != "WORKER-EXITED":
            raise RuntimeError(f"Fixture did not report the traced worker exit: {worker_exited!r}")
        lifecycle.append("traced-worker-exit-confirmed-by-join")
        script.post({"type": "command", "payload": {"kind": "stop"}})
        wait_state(state["stopped"], state, "Stalker flush and stop", 30.0)
        time.sleep(0.5)
        lifecycle.append("stalker-flushed-and-unfollowed")
        lifecycle.append("stopped-event-queue-settled")
        device.input(pid, b"\n")
        end = output.read_line(30, "END")
        lifecycle.append("fixture-end-output-received")
        return_code = exit_watcher.wait()
        lifecycle.append("process-exited-and-exit-code-read")

        target_calls = 0
        target_returns = 0
        internal_calls = 0
        internal_returns = 0
        ordered_pairs = 0
        sequence_errors = 0
        awaiting_internal_return = False
        first_events: list[dict[str, str]] = []
        last_events: list[dict[str, str]] = []
        batches = state["batches"]
        assert isinstance(batches, list)
        batch_summaries: list[dict[str, int]] = []
        parsed_event_total = 0
        code_end = code_base + code_size
        for batch in batches:
            events = batch.get("events", [])
            if not isinstance(events, list):
                continue
            parsed_count = int(batch.get("parsedEventCount", -1))
            if parsed_count != len(events):
                raise RuntimeError(
                    f"Parsed batch count mismatch at batch {batch.get('index')}: "
                    f"reported={parsed_count}, actual={len(events)}"
                )
            parsed_event_total += parsed_count
            batch_calls = 0
            batch_returns = 0
            for event in events:
                kind, source, destination = event_fields(event)
                if source is None or destination is None:
                    continue
                if not (code_base <= source < code_end or code_base <= destination < code_end):
                    continue
                if kind == "call":
                    target_calls += 1
                    batch_calls += 1
                elif kind in ("ret", "return"):
                    target_returns += 1
                    batch_returns += 1
                if kind == "call" and source == code_base + 5 and destination == code_base + 19:
                    if awaiting_internal_return:
                        sequence_errors += 1
                    internal_calls += 1
                    awaiting_internal_return = True
                elif kind in ("ret", "return") and source == code_base + 19 and destination == code_base + 10:
                    if not awaiting_internal_return:
                        sequence_errors += 1
                    else:
                        ordered_pairs += 1
                    internal_returns += 1
                    awaiting_internal_return = False
                if kind in ("call", "ret", "return"):
                    item = {
                        "type": kind,
                        "source": f"0x{source:08x}",
                        "destination": f"0x{destination:08x}",
                    }
                    if len(first_events) < 12:
                        first_events.append(item)
                    last_events.append(item)
                    if len(last_events) > 12:
                        last_events.pop(0)
            batch_summaries.append({
                "index": int(batch.get("index", 0)),
                "parsedEventCount": parsed_count,
                "rawByteLength": int(batch.get("rawByteLength", 0)),
                "targetCalls": batch_calls,
                "targetReturns": batch_returns,
            })

        stopped = state.get("stoppedPayload")
        if not isinstance(stopped, dict):
            raise RuntimeError("Frida stop report is missing")
        if int(stopped.get("batchCount", -1)) != len(batches):
            raise RuntimeError(
                f"Batch count did not reconcile: stop={stopped.get('batchCount')}, received={len(batches)}, "
                f"indices={[batch.get('index') for batch in batches]!r}"
            )
        if int(stopped.get("totalEvents", -1)) != parsed_event_total:
            raise RuntimeError(
                f"Parsed event total did not reconcile: stop={stopped.get('totalEvents')}, "
                f"received={parsed_event_total}, batchCount={len(batches)}"
            )
        indices = [int(batch.get("index", -1)) for batch in batches]
        if indices != list(range(1, len(batches) + 1)):
            raise RuntimeError(f"Stalker batch sequence is incomplete or reordered: {indices!r}")
        if awaiting_internal_return:
            sequence_errors += 1
        if result != "RESULT=42" or worker_exited != "WORKER-EXITED" or end != "END" or return_code != 0:
            raise RuntimeError(
                "Spawned fixture output/exit mismatch: "
                f"result={result!r}, worker={worker_exited!r}, end={end!r}, exit={return_code}"
            )
        if state["overflow"] is not None:
            raise RuntimeError(f"Frida trace exceeded its explicit cap: {state['overflow']!r}")
        if len(batches) < 2:
            raise RuntimeError(f"Expected multiple Stalker receive batches, got {len(batches)}")
        if target_calls < expected_pairs or target_returns < expected_pairs:
            raise RuntimeError(
                f"Trace target counts too small: calls={target_calls}, returns={target_returns}, "
                f"expected at least {expected_pairs}"
            )
        if (
            internal_calls != expected_pairs
            or internal_returns != expected_pairs
            or ordered_pairs != expected_pairs
            or sequence_errors != 0
        ):
            raise RuntimeError(
                "Generated call/return trace failed completeness/order: "
                f"calls={internal_calls}, returns={internal_returns}, pairs={ordered_pairs}, "
                f"errors={sequence_errors}, expected={expected_pairs}"
            )

        return {
            "pid": pid,
            "arch": attached["arch"],
            "lifecycle": lifecycle,
            "ready": ready,
            "threadId": thread_id,
            "codeBase": f"0x{code_base:08x}",
            "codeSize": code_size,
            "iterations": iterations,
            "repetitions": repetitions,
            "result": result,
            "workerExited": worker_exited,
            "end": end,
            "exitCode": return_code,
            "batchCount": len(batches),
            "parsedEventTotal": parsed_event_total,
            "targetCalls": target_calls,
            "targetReturns": target_returns,
            "internalCallEvents": internal_calls,
            "internalReturnEvents": internal_returns,
            "orderedInternalCallReturnPairs": ordered_pairs,
            "internalSequenceErrors": sequence_errors,
            "stoppedPayload": state["stoppedPayload"],
            "firstEvents": first_events,
            "lastEvents": last_events,
            "batchSummaries": batch_summaries,
            "stderr": "".join(output.stderr),
        }
    finally:
        if script is not None:
            try:
                script.unload()
            except Exception:
                pass
        if session is not None:
            try:
                session.detach()
            except Exception:
                pass
        if pid is not None:
            try:
                still_running = any(process.pid == pid for process in device.enumerate_processes())
            except Exception:
                still_running = True
            if still_running:
                try:
                    device.kill(pid)
                except Exception:
                    pass
        if exit_watcher is not None:
            exit_watcher.close()
        try:
            device.off("output", output.callback)
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True, type=Path)
    parser.add_argument("--fixture-source", required=True, type=Path)
    parser.add_argument("--compiler", required=True, type=Path)
    parser.add_argument("--runner-script", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    fixture = args.fixture.resolve(strict=True)
    fixture_source = args.fixture_source.resolve(strict=True)
    compiler = args.compiler.resolve(strict=True)
    runner_script = args.runner_script.resolve(strict=True)
    output_path = args.output.resolve()
    if pe_machine(fixture) != 0x014C:
        raise SystemExit("Fixture must be a 32-bit x86 PE (IMAGE_FILE_MACHINE_I386)")

    plain: dict[str, object] | None = None
    spawned: dict[str, object] | None = None
    error: Exception | None = None
    try:
        plain = run_plain(fixture)
        spawned = run_spawned(fixture)
        if (
            plain["result"] != spawned["result"]
            or plain["workerExited"] != spawned["workerExited"]
            or plain["end"] != spawned["end"]
        ):
            raise RuntimeError("Instrumented spawn and plain fixture outputs differ")
    except Exception as exc:
        error = exc

    result: dict[str, object] = {
        "schemaVersion": 1,
        "status": "failed" if error else "pass",
        "capturedAtUtc": datetime.now(timezone.utc).isoformat(),
        "fixtureSha256": sha256(fixture),
        "fixtureSourceSha256": sha256(fixture_source),
        "observerSha256": sha256(Path(__file__).resolve()),
        "runnerSha256": sha256(runner_script),
        "compilerSha256": sha256(compiler),
        "fixtureMachine": "IMAGE_FILE_MACHINE_I386",
        "python": os.sys.version,
        "fridaVersion": frida.__version__,
        "fridaToolsVersion": importlib.metadata.version("frida-tools"),
        "plain": plain,
        "spawned": spawned,
        "assertions": {
            "spawnedProcessWasIa32": bool(spawned and spawned.get("arch") == "ia32"),
            "sameFixtureResultAndEnd": bool(
                plain and spawned and plain.get("result") == spawned.get("result")
                and plain.get("workerExited") == spawned.get("workerExited")
                and plain.get("end") == spawned.get("end")
            ),
            "spawnedFixtureExitedZero": bool(spawned and spawned.get("exitCode") == 0),
            "multipleOrderedStalkerBatches": bool(spawned and spawned.get("batchCount", 0) >= 2),
            "generatedCallReturnPairsComplete": bool(
                spawned and spawned.get("orderedInternalCallReturnPairs")
                == spawned.get("iterations", 0) * spawned.get("repetitions", 0)
            ),
            "generatedCallReturnSequenceHasNoErrors": bool(
                spawned and spawned.get("internalSequenceErrors") == 0
            ),
        },
    }
    if error:
        result["errorType"] = type(error).__name__
        result["error"] = str(error)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": result["status"],
        "fridaVersion": result["fridaVersion"],
        "fixtureSha256": result["fixtureSha256"],
        "spawnedArch": spawned.get("arch") if spawned else None,
        "spawnedExitCode": spawned.get("exitCode") if spawned else None,
        "batchCount": spawned.get("batchCount") if spawned else None,
        "orderedInternalCallReturnPairs": (
            spawned.get("orderedInternalCallReturnPairs") if spawned else None
        ),
        "output": str(output_path),
        "error": result.get("error"),
    }, indent=2))
    return 1 if error else 0


if __name__ == "__main__":
    raise SystemExit(main())
