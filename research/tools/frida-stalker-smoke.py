#!/usr/bin/env python3
"""Validate Frida Stalker on a benign 32-bit fixture with runtime-generated code."""

from __future__ import annotations

import argparse
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


AGENT_TEMPLATE = r"""
const targetThreadId = __THREAD_ID__;
const codeBase = ptr('__CODE_BASE__');
let batchCount = 0;
const codeSize = __CODE_SIZE__;
const codeBytes = Array.from(new Uint8Array(codeBase.readByteArray(codeSize)))
  .map(value => value.toString(16).padStart(2, '0')).join('');

send({ kind: 'armed', threadId: targetThreadId, codeBase: codeBase.toString(), codeBytes: codeBytes });
Stalker.queueCapacity = 16384;
Stalker.queueDrainInterval = 1;
Stalker.follow(targetThreadId, {
  events: { call: true, ret: true, exec: false, block: false, compile: false },
  onReceive(events) {
    const parsed = Stalker.parse(events, { annotate: true, stringify: true });
    batchCount += 1;
    send({ kind: 'batch', index: batchCount, events: parsed });
  }
});

recv('stop', function () {
  Stalker.flush();
  Stalker.unfollow(targetThreadId);
  Stalker.garbageCollect();
  send({ kind: 'stopped', batches: batchCount });
});
"""


class FixtureProcess:
    def __init__(self, process: subprocess.Popen[str]):
        self.process = process
        self.lines: queue.Queue[str | None] = queue.Queue()
        self.stdout_lines: list[str] = []
        self.reader = threading.Thread(target=self._read_stdout, daemon=True)
        self.reader.start()

    def _read_stdout(self) -> None:
        assert self.process.stdout is not None
        for line in self.process.stdout:
            value = line.rstrip("\r\n")
            self.stdout_lines.append(value)
            self.lines.put(value)
        self.lines.put(None)

    def read_line(self, timeout: float, prefix: str | None = None) -> str:
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"Timed out waiting for fixture output {prefix!r}")
            try:
                line = self.lines.get(timeout=remaining)
            except queue.Empty as exc:
                raise TimeoutError(f"Timed out waiting for fixture output {prefix!r}") from exc
            if line is None:
                raise RuntimeError(f"Fixture exited before output {prefix!r}; lines={self.stdout_lines!r}")
            if prefix is None or line.startswith(prefix):
                return line

    def send_line(self) -> None:
        assert self.process.stdin is not None
        self.process.stdin.write("\n")
        self.process.stdin.flush()

    def finish(self, timeout: float = 10.0) -> int:
        try:
            code = self.process.wait(timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            self.process.kill()
            self.process.wait(timeout=5)
            raise TimeoutError("Fixture did not exit after release") from exc
        self.reader.join(timeout=1)
        return code


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


def start_fixture(exe: Path) -> FixtureProcess:
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
    return FixtureProcess(process)


def run_plain(exe: Path) -> dict[str, object]:
    fixture = start_fixture(exe)
    ready = fixture.read_line(15, "READY ")
    fixture.send_line()
    result = fixture.read_line(30, "RESULT=")
    fixture.send_line()
    end = fixture.read_line(15, "END")
    return_code = fixture.finish()
    if return_code != 0:
        raise RuntimeError(f"Uninstrumented fixture exit={return_code}")
    return {"ready": ready, "result": result, "end": end, "exitCode": return_code}


def message_addresses(event: object) -> list[int]:
    if isinstance(event, dict):
        values = event.values()
    elif isinstance(event, (list, tuple)):
        values = event
    else:
        values = (event,)
    addresses: list[int] = []
    for value in values:
        if isinstance(value, (dict, list, tuple)):
            addresses.extend(message_addresses(value))
        elif isinstance(value, str):
            for match in re.findall(r"0x[0-9a-fA-F]+", value):
                addresses.append(int(match, 16))
    return addresses


def event_kind(event: object) -> str | None:
    if isinstance(event, dict):
        candidate = event.get("type") or event.get("event")
        return candidate.lower() if isinstance(candidate, str) else None
    if isinstance(event, (list, tuple)) and event:
        candidate = event[0]
        if isinstance(candidate, str):
            return candidate.lower()
    return None


def event_fields(event: object) -> tuple[str | None, int | None, int | None]:
    if not isinstance(event, (list, tuple)) or len(event) < 3:
        return event_kind(event), None, None
    values: list[int | None] = []
    for value in event[1:3]:
        if isinstance(value, str) and re.fullmatch(r"0x[0-9a-fA-F]+", value):
            values.append(int(value, 16))
        else:
            values.append(None)
    return event_kind(event), values[0], values[1]


def run_stalked(exe: Path) -> dict[str, object]:
    fixture = start_fixture(exe)
    ready = fixture.read_line(15, "READY ")
    values = dict(re.findall(r"(\w+)=([^ ]+)", ready))
    pid = int(values["pid"])
    thread_id = int(values["tid"])
    code_base = int(values["code"], 16)
    code_size = int(values["size"])
    iterations = int(values["iterations"])
    repetitions = int(values["repetitions"])
    expected_internal_iterations = iterations * repetitions
    code_end = code_base + code_size

    state: dict[str, object] = {
        "armed": threading.Event(),
        "stopped": threading.Event(),
        "batches": [],
        "errors": [],
        "codeBytesHex": None,
    }
    agent_source = AGENT_TEMPLATE.replace("__THREAD_ID__", str(thread_id)).replace(
        "__CODE_BASE__", f"0x{code_base:08x}"
    ).replace("__CODE_SIZE__", str(code_size))
    session = None
    script = None

    def on_message(message: dict[str, object], _data: bytes | None) -> None:
        if message.get("type") == "error":
            state["errors"].append(message)
            state["armed"].set()
            state["stopped"].set()
            return
        payload = message.get("payload")
        if not isinstance(payload, dict):
            return
        if payload.get("kind") == "armed":
            state["codeBytesHex"] = payload.get("codeBytes")
            state["armed"].set()
        elif payload.get("kind") == "batch":
            state["batches"].append(payload)
        elif payload.get("kind") == "stopped":
            state["stoppedBatches"] = payload.get("batches")
            state["stopped"].set()

    try:
        session = frida.attach(pid)
        script = session.create_script(agent_source)
        script.on("message", on_message)
        script.load()
        if not state["armed"].wait(15):
            raise TimeoutError("Frida agent did not arm the target thread")
        if state["errors"]:
            raise RuntimeError(f"Frida agent error: {state['errors']!r}")
        fixture.send_line()
        result = fixture.read_line(180, "RESULT=")
        script.post({"type": "stop"})
        if not state["stopped"].wait(30):
            raise TimeoutError("Frida agent did not stop and flush Stalker")
        if state["errors"]:
            raise RuntimeError(f"Frida agent error: {state['errors']!r}")
        fixture.send_line()
        end = fixture.read_line(15, "END")
        return_code = fixture.finish()
        if return_code != 0:
            raise RuntimeError(f"Instrumented fixture exit={return_code}")
    finally:
        if script is not None:
            try:
                script.unload()
            except frida.InvalidOperationError:
                # A failed injection can destroy the script before cleanup.
                pass
        if session is not None:
            try:
                session.detach()
            except frida.InvalidOperationError:
                pass
        if fixture.process.poll() is None:
            fixture.process.kill()
            fixture.finish(timeout=5)

    batches = state["batches"]
    batch_summaries: list[dict[str, object]] = []
    target_calls = 0
    target_returns = 0
    internal_calls = 0
    internal_returns = 0
    ordered_pairs = 0
    sequence_errors = 0
    awaiting_internal_return = False
    target_sequence_first: list[dict[str, object]] = []
    target_sequence_last: list[dict[str, object]] = []
    for batch in batches:
        events = batch.get("events", [])
        if not isinstance(events, list):
            continue
        calls = 0
        returns = 0
        samples: list[object] = []
        for event in events:
            kind = event_kind(event)
            addresses = message_addresses(event)
            if not any(code_base <= address < code_end for address in addresses):
                continue
            event_type, source, destination = event_fields(event)
            if source is not None and destination is not None:
                if event_type == "call" and source == code_base + 5 and destination == code_base + 19:
                    if awaiting_internal_return:
                        sequence_errors += 1
                    internal_calls += 1
                    awaiting_internal_return = True
                elif event_type in ("ret", "return") and source == code_base + 19 and destination == code_base + 10:
                    if not awaiting_internal_return:
                        sequence_errors += 1
                    internal_returns += 1
                    if awaiting_internal_return:
                        ordered_pairs += 1
                    awaiting_internal_return = False
                if event_type in ("call", "ret", "return"):
                    item = {
                        "type": event_type,
                        "source": f"0x{source:08x}",
                        "destination": f"0x{destination:08x}",
                    }
                    if len(target_sequence_first) < 12:
                        target_sequence_first.append(item)
                    target_sequence_last.append(item)
                    if len(target_sequence_last) > 12:
                        target_sequence_last.pop(0)
            if kind == "call":
                calls += 1
            elif kind in ("ret", "return"):
                returns += 1
            if len(samples) < 3:
                samples.append(event)
        target_calls += calls
        target_returns += returns
        batch_summaries.append(
            {
                "index": batch.get("index"),
                "eventCount": len(events),
                "targetCalls": calls,
                "targetReturns": returns,
                "targetSamples": samples,
            }
        )

    if result != "RESULT=42" or end != "END":
        raise RuntimeError(f"Unexpected fixture output: {result!r}, {end!r}")
    if awaiting_internal_return:
        sequence_errors += 1
    return {
        "ready": ready,
        "result": result,
        "end": end,
        "exitCode": return_code,
        "threadId": thread_id,
        "codeBase": f"0x{code_base:08x}",
        "codeSize": code_size,
        "iterations": iterations,
        "repetitions": repetitions,
        "expectedInternalIterations": expected_internal_iterations,
        "batchCount": len(batch_summaries),
        "targetCalls": target_calls,
        "targetReturns": target_returns,
        "internalCallEvents": internal_calls,
        "internalReturnEvents": internal_returns,
        "orderedInternalCallReturnPairs": ordered_pairs,
        "internalSequenceErrors": sequence_errors,
        "targetSequenceFirst": target_sequence_first,
        "targetSequenceLast": target_sequence_last,
        "codeBytesHex": state["codeBytesHex"],
        "batches": batch_summaries,
    }


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
    output = args.output.resolve()
    if pe_machine(fixture) != 0x014C:
        raise SystemExit("Fixture must be a 32-bit x86 PE (IMAGE_FILE_MACHINE_I386)")

    plain: dict[str, object] | None = None
    stalked: dict[str, object] | None = None
    try:
        plain = run_plain(fixture)
        stalked = run_stalked(fixture)
        if plain["result"] != stalked["result"] or plain["end"] != stalked["end"]:
            raise RuntimeError("Instrumented and uninstrumented fixture outputs differ")
        if stalked["batchCount"] < 2:
            raise RuntimeError(f"Expected multiple Stalker receive batches, got {stalked['batchCount']}")
        expected_internal_iterations = stalked["expectedInternalIterations"]
        if stalked["targetCalls"] < expected_internal_iterations or stalked["targetReturns"] < expected_internal_iterations:
            raise RuntimeError(
                f"Incomplete dynamic-code trace: calls={stalked['targetCalls']}, "
                f"returns={stalked['targetReturns']}, expected at least {expected_internal_iterations} of each"
            )
        if (stalked["internalCallEvents"] != expected_internal_iterations or
                stalked["internalReturnEvents"] != expected_internal_iterations or
                stalked["orderedInternalCallReturnPairs"] != expected_internal_iterations or
                stalked["internalSequenceErrors"] != 0):
            raise RuntimeError("Stalker did not capture every generated call/return pair in order")
        expected_code = (
            "b9" + int(stalked["iterations"]).to_bytes(4, "little").hex() +
            "e8090000004975f8b82a000000c3c3"
        )
        if stalked["codeBytesHex"] != expected_code:
            raise RuntimeError(f"Unexpected generated code bytes: {stalked['codeBytesHex']!r}")
    except Exception as error:
        output.parent.mkdir(parents=True, exist_ok=True)
        failure = {
            "schemaVersion": 1,
            "status": "failed",
            "capturedAtUtc": datetime.now(timezone.utc).isoformat(),
            "fixtureSha256": sha256(fixture),
            "fixtureSourceSha256": sha256(fixture_source),
            "smokeScriptSha256": sha256(Path(__file__).resolve()),
            "runnerScriptSha256": sha256(runner_script),
            "compilerSha256": sha256(compiler),
            "fixtureMachine": "IMAGE_FILE_MACHINE_I386",
            "fridaVersion": frida.__version__,
            "fridaToolsVersion": importlib.metadata.version("frida-tools"),
            "uninstrumented": plain,
            "instrumented": stalked,
            "errorType": type(error).__name__,
            "error": str(error),
        }
        output.write_text(json.dumps(failure, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(failure, indent=2))
        return 1

    result = {
        "schemaVersion": 1,
        "status": "pass",
        "capturedAtUtc": datetime.now(timezone.utc).isoformat(),
        "fixtureSha256": sha256(fixture),
        "fixtureSourceSha256": sha256(fixture_source),
        "smokeScriptSha256": sha256(Path(__file__).resolve()),
        "runnerScriptSha256": sha256(runner_script),
        "compilerSha256": sha256(compiler),
        "fixtureMachine": "IMAGE_FILE_MACHINE_I386",
        "python": os.sys.version,
        "fridaVersion": frida.__version__,
        "fridaToolsVersion": importlib.metadata.version("frida-tools"),
        "uninstrumented": plain,
        "instrumented": stalked,
        "assertions": {
            "sameFixtureResultAndExit": True,
            "multipleOrderedReceiveBatches": stalked["batchCount"] >= 2,
            "dynamicCallEventsAtLeastIterations": stalked["targetCalls"] >= stalked["expectedInternalIterations"],
            "dynamicReturnEventsAtLeastIterations": stalked["targetReturns"] >= stalked["expectedInternalIterations"],
            "internalCallsAndReturnsCompleteAndOrdered": stalked["orderedInternalCallReturnPairs"] == stalked["expectedInternalIterations"],
            "generatedCodeBytesMatchFixture": stalked["codeBytesHex"] == expected_code,
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": result["status"],
        "fridaVersion": result["fridaVersion"],
        "fixtureSha256": result["fixtureSha256"],
        "fixtureSourceSha256": result["fixtureSourceSha256"],
        "batchCount": stalked["batchCount"],
        "targetCalls": stalked["targetCalls"],
        "targetReturns": stalked["targetReturns"],
        "output": str(output),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
