#!/usr/bin/env python3
"""Attach-only observer for PICK entries in the source-bound PREMIUM call frame.

Request contract (JSON, schema ``aaron-premium-callsite-pick-observer-request-v1``):

    {
      "schema": "aaron-premium-callsite-pick-observer-request-v1",
      "runId": "unique-run-token",
      "readyPid": 1234,
      "runtimePath": "C:\\temp\\run\\runtime\\AARON.exe",
      "premiumCallsite": "0x1fe4c07c",
      "premiumReturnContinuation": "0x1fe4c07f",
      "pickEntry": "0x1fe00e8c",
      "scenePath": "C:\\temp\\aaron-scene-state-snapshot.txt",
      "aa0Path": "C:\\temp\\aa0",
      "sceneEndMarker": "END scene-state-snapshot",
      "outputRoot": "C:\\temp\\run\\frida-observer",
      "outputPath": "C:\\temp\\run\\frida-observer\\observer.txt",
      "controllerReadyPath": "C:\\temp\\run\\frida-observer\\controller-ready.json",
      "statusPath": "C:\\temp\\run\\frida-observer\\status.json",
      "stopPath": "C:\\temp\\run\\frida-observer\\stop.request",
      "endMarker": "END frida-observer unique-run-token",
      "sourceBinding": {
        "readyPid": 1234,
        "readyRecordPath": "C:\\temp\\run\\capture\\ready.txt",
        "readyRecordSha256": "<64 lowercase hex>",
        "sourceEvidencePath": "C:\\temp\\run\\source-evidence.json",
        "sourceEvidenceSha256": "<64 lowercase hex>",
        "runtimeSha256": "<64 lowercase hex>",
        "premiumPayloadSha256": "<64 lowercase hex>",
        "pickPayloadSha256": "<64 lowercase hex>",
        "controllerPath": "D:\\...\\coordinator.ps1",
        "controllerSha256": "<64 lowercase hex>"
      },
      "timeoutSeconds": 600,
      "maxRecords": 64,
      "pollIntervalMs": 250
    }

The source-evidence file is JSON with schema
``aaron-premium-callsite-pick-observer-source-v1`` and the same runId, READY
PID, runtime path/hash, PREMIUM callsite/continuation, PICK entry, payload
hashes, and exact scene/AA0 staging paths and basenames. The host verifies its
exact hash and fields before attaching. During the runner's live capture,
scenePath and aa0Path are runner-owned read-only staging files at
``C:\\temp\\aaron-scene-state-snapshot.txt`` and ``C:\\temp\\aa0``.

All observer-owned paths are fresh and under the unique, initially absent
outputRoot, which must be under the lexical Windows path C:\\temp. Keep the
request and source-evidence files in a fresh parent/input directory and set
outputRoot to a distinct, initially absent child such as ``observer-output``;
the driver creates only that child after validating its inputs. Scene and AA0
are staging inputs and need not be under outputRoot. The example addresses
above are from one accepted observer run; the coordinator re-derives all three
addresses from current mappings and validates them before each request. The
hook filters PICK entries by the outer PREMIUM call's saved return
continuation. The observed transfer to PICK is a tail jump, not a direct CALL
instruction from the PREMIUM method to PICK. The host never spawns, resumes,
releases, or terminates AARON. It writes controller-ready only after
the in-agent PID, IA-32, main-module identity checks, and hook install. The
agent attaches at the mapped PICK entry and accepts only calls whose
returnAddress is exactly PREMIUM callsite + 3. Final END is written only
after the interceptor, script, and session have detached; counters are
drained with zero dropped matched records or overflow; AA0 ends with ``end``;
and the scene report ends with the exact ``END scene-state-snapshot`` marker
and contains no MAIN-ERROR. The hook stays armed through stable scene+AA0
completion even after a hit, so both hit and no-hit counts cover that full
scene scope. An early stop request or timeout leaves diagnostics but no
observer END. On such a failure, the coordinator must use its bounded
process/runner watchdog because the READY runner may continue waiting for
observer END. The coordinator validates the fresh after-control after this
END lets the READY runner exit.

The exact ``sourceBinding`` keys are listed in SOURCE_BINDING_FIELDS below.
Its digest is SHA-256 over UTF-8 bytes of JSON serialized with sorted object
keys, separators ``(',', ':')``, ``ensure_ascii=False``, and no trailing
newline. Windows paths are normalized with ``ntpath.normpath`` before this
digest is computed. The source-evidence JSON has the fields compared in
``validate_source_manifest``. Successful report text is framed as
``BEGIN <report-schema> <runId>``, one ``REPORT <compact-json>`` line, zero or
more ``MATCH <compact-json>`` lines, and exactly one terminal
``END frida-observer-<runId>`` line.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import ntpath
import os
import re
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REQUEST_SCHEMA = "aaron-premium-callsite-pick-observer-request-v1"
SOURCE_SCHEMA = "aaron-premium-callsite-pick-observer-source-v1"
REPORT_SCHEMA = "aaron-premium-callsite-pick-observer-report-v1"
TEMP_ROOT = r"C:\temp"
MAX_REQUEST_BYTES = 4 * 1024 * 1024
MAX_SOURCE_BYTES = 4 * 1024 * 1024
MAX_CAPTURE_BYTES = 256 * 1024 * 1024
MAX_RUNTIME_BYTES = 512 * 1024 * 1024
MAX_REPORT_BYTES = 4 * 1024 * 1024
MAX_MESSAGE_CHARS = 2048
MAX_COUNTER = 2_147_483_647
MAX_RECORDS = 512
MAX_TIMEOUT_SECONDS = 3600
MAX_POLL_INTERVAL_MS = 5000
SCENE_STABLE_SECONDS = 0.75
AGENT_STOP_TIMEOUT_SECONDS = 10.0


AGENT_TEMPLATE = r"""
const cfg = __CONFIG_JSON__;
const MAX_COUNT = 2147483647;
const counters = {
  totalEntries: 0,
  matchedEntries: 0,
  unmatchedEntries: 0,
  matchedReturns: 0,
  completedPairs: 0,
  droppedMatchedRecords: 0,
  inFlightMatched: 0,
  counterOverflow: false
};
const records = [];
let listener = null;
let firstMatchMessageSent = false;
let agentErrorCount = 0;
let agentErrorMessageSent = false;

function increment(name) {
  if (counters[name] < MAX_COUNT) counters[name] += 1;
  else counters.counterOverflow = true;
}

function pointerHex32(value, label) {
  const text = value.toString();
  if (!/^0x[0-9a-f]+$/i.test(text)) throw new Error(label + " is not a native pointer");
  const number = parseInt(text.substring(2), 16);
  if (!Number.isSafeInteger(number) || number < 0 || number > 0xffffffff)
    throw new Error(label + " is outside the IA-32 address space");
  return "0x" + number.toString(16).padStart(8, "0");
}

function normalizeWindowsPath(value) {
  return value.replace(/\//g, "\\").replace(/\\+/g, "\\").toLowerCase();
}

function verifyMappedCodeRange(address, label) {
  const range = Process.findRangeByAddress(address);
  if (range === null) throw new Error(label + " has no mapped memory range");
  const protection = String(range.protection);
  // The current source-bound native capture reports PICK in PAGE_READONLY.
  // Host validation binds this address to a unique PLL payload; retain Frida's
  // actual flags and let Interceptor establish whether it can install the hook.
  if (protection.charAt(0) !== "r")
    throw new Error(label + " range is not readable (protection=" + protection + ")");
  const base = pointerHex32(range.base, label + " range base");
  const baseNumber = parseInt(base.substring(2), 16);
  const size = range.size;
  const end = baseNumber + size;
  const addressNumber = parseInt(pointerHex32(address, label).substring(2), 16);
  if (!Number.isSafeInteger(size) || size <= 0 || end > 0x100000000 ||
      addressNumber < baseNumber || addressNumber >= end)
    throw new Error(label + " range is invalid for IA-32");
  return { base: base, size: size, protection: protection };
}

function boundedError(error) {
  return String(error).slice(0, 1024);
}

function sendAgentError(error) {
  if (agentErrorMessageSent) return;
  agentErrorMessageSent = true;
  agentErrorCount = 1;
  send({ kind: "agent-error", error: boundedError(error) });
}

try {
  if (Process.id !== cfg.readyPid) throw new Error("attached PID differs from READY PID");
  if (Process.platform !== "windows") throw new Error("target platform is not Windows");
  if (Process.arch !== "ia32" || Process.pointerSize !== 4)
    throw new Error("target is not an IA-32 process with 4-byte pointers");

  const mainModule = Process.mainModule;
  if (mainModule === null) throw new Error("Frida did not identify the main module");
  const mainModulePath = mainModule.path;
  if (normalizeWindowsPath(mainModulePath) !== normalizeWindowsPath(cfg.runtimePath))
    throw new Error("main-module path differs from the source-bound runtime path");

  const pickEntry = ptr(cfg.pickEntry);
  const expectedReturn = ptr(cfg.premiumReturnContinuation);
  const pickEntryHex = pointerHex32(pickEntry, "PICK entry");
  const expectedReturnHex = pointerHex32(expectedReturn, "PREMIUM return continuation");
  const pickRange = verifyMappedCodeRange(pickEntry, "mapped PICK entry");
  const continuationRange = verifyMappedCodeRange(expectedReturn, "PREMIUM return continuation");

  try {
    listener = Interceptor.attach(pickEntry, {
    onEnter(args) {
      increment("totalEntries");
      this._aaronPickMatchedRecord = null;
      const returnAddress = this.returnAddress;
      if (!returnAddress.equals(expectedReturn)) {
        increment("unmatchedEntries");
        return;
      }

      increment("matchedEntries");
      if (counters.inFlightMatched < MAX_COUNT) counters.inFlightMatched += 1;
      else counters.counterOverflow = true;
      const record = {
        sequence: counters.matchedEntries,
        threadId: Process.getCurrentThreadId(),
        entryAddress: pointerHex32(pickEntry, "PICK entry"),
        returnAddress: pointerHex32(returnAddress, "returnAddress"),
        enteredAtUnixMs: Date.now(),
        returned: false,
        returnValue: null
      };
      if (records.length < cfg.maxRecords) records.push(record);
      else increment("droppedMatchedRecords");
      this._aaronPickMatchedRecord = record;
    },

    onLeave(retval) {
      const record = this._aaronPickMatchedRecord;
      if (record === null || record === undefined) return;
      increment("matchedReturns");
      increment("completedPairs");
      if (counters.inFlightMatched > 0) counters.inFlightMatched -= 1;
      try {
        record.returned = true;
        record.returnValue = pointerHex32(retval, "PICK return value");
      } catch (error) {
        sendAgentError(error);
      }
      if (!firstMatchMessageSent) {
        firstMatchMessageSent = true;
        send({
          kind: "match",
          sequence: record.sequence,
          threadId: record.threadId,
          returnAddress: record.returnAddress
        });
      }
      this._aaronPickMatchedRecord = null;
    }
    });
  } catch (error) {
    throw new Error("Interceptor.attach failed at mapped PICK entry " + pickEntryHex +
      " with range protection=" + pickRange.protection + ": " + error);
  }

  send({
    kind: "armed",
    pid: Process.id,
    arch: Process.arch,
    pointerSize: Process.pointerSize,
    mainModulePath: mainModulePath,
    pickEntry: pickEntryHex,
    expectedReturn: expectedReturnHex,
    mappedCodeRanges: {
      pickEntry: pickRange,
      premiumReturnContinuation: continuationRange
    }
  });
} catch (error) {
  try { if (listener !== null) listener.detach(); } catch (_) {}
  sendAgentError(error);
}

recv("stop", function (_message) {
  try {
    if (listener === null) throw new Error("observer listener was not installed");
    listener.detach();
    listener = null;
    send({
      kind: "snapshot",
      listenerDetached: true,
      agentErrorCount: agentErrorCount,
      counters: counters,
      records: records
    });
  } catch (error) {
    sendAgentError(error);
  }
});
"""


REQUEST_FIELDS = {
    "schema",
    "runId",
    "readyPid",
    "runtimePath",
    "premiumCallsite",
    "premiumReturnContinuation",
    "pickEntry",
    "scenePath",
    "aa0Path",
    "sceneEndMarker",
    "outputRoot",
    "outputPath",
    "controllerReadyPath",
    "statusPath",
    "stopPath",
    "endMarker",
    "sourceBinding",
    "timeoutSeconds",
    "maxRecords",
    "pollIntervalMs",
}
SOURCE_BINDING_FIELDS = {
    "readyPid",
    "readyRecordPath",
    "readyRecordSha256",
    "sourceEvidencePath",
    "sourceEvidenceSha256",
    "runtimeSha256",
    "premiumPayloadSha256",
    "pickPayloadSha256",
    "controllerPath",
    "controllerSha256",
}
ADDRESS_RE = re.compile(r"^(?:0x)?[0-9a-fA-F]{1,8}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
RUN_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,44}$")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path, max_bytes: int | None = None) -> str:
    digest = hashlib.sha256()
    total = 0
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if max_bytes is not None and total > max_bytes:
                raise ValueError(f"File exceeds the bounded read limit: {path}")
            digest.update(chunk)
    return digest.hexdigest()


def json_no_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json_file(path: Path, max_bytes: int) -> tuple[dict[str, Any], bytes]:
    with path.open("rb") as stream:
        raw = stream.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise ValueError(f"JSON input exceeds {max_bytes} bytes: {path}")
    value = json.loads(raw.decode("utf-8-sig"), object_pairs_hook=json_no_duplicate_keys)
    if not isinstance(value, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return value, raw


def canonical_json_sha256(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return sha256_bytes(encoded)


def validate_matched_records(
    records: Any, expected_entry: Any, expected_return: Any, label: str
) -> list[dict[str, Any]]:
    entry, entry_hex = parse_x86_address(expected_entry, f"{label} expected entry")
    continuation, continuation_hex = parse_x86_address(expected_return, f"{label} expected return")
    del entry, continuation
    if not isinstance(records, list) or len(records) > MAX_RECORDS:
        raise ValueError(f"{label} matched records are malformed or exceed the cap")
    for index, record in enumerate(records, 1):
        if not isinstance(record, dict) or record.get("returned") is not True:
            raise ValueError(f"{label} contains a PICK record without a paired return")
        sequence = record.get("sequence")
        thread_id = record.get("threadId")
        if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence != index:
            raise ValueError(f"{label} record sequence is not contiguous and one-based")
        if isinstance(thread_id, bool) or not isinstance(thread_id, int) or not (1 <= thread_id <= 0xFFFFFFFF):
            raise ValueError(f"{label} record threadId must be a positive IA-32 thread ID")
        if record.get("entryAddress") != entry_hex or record.get("returnAddress") != continuation_hex:
            raise ValueError(f"{label} record entry/return address differs from the request")
        for field in ("entryAddress", "returnAddress", "returnValue"):
            if not isinstance(record.get(field), str) or not re.fullmatch(r"0x[0-9a-f]{8}", record[field]):
                raise ValueError(f"{label} record {field} is not an IA-32 pointer")
    return records


def windows_absolute_path(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or "\x00" in value or len(value) > 32767:
        raise ValueError(f"{label} must be a bounded nonempty Windows path")
    normalized = ntpath.normpath(value)
    if not ntpath.isabs(normalized) or not ntpath.splitdrive(normalized)[0]:
        raise ValueError(f"{label} must be an absolute drive-qualified Windows path")
    return normalized


def win_is_under(path: str, root: str) -> bool:
    try:
        return ntpath.normcase(ntpath.commonpath([path, root])) == ntpath.normcase(root)
    except ValueError:
        return False


def require_under_temp(path: str, label: str) -> None:
    if not win_is_under(path, TEMP_ROOT):
        raise ValueError(f"{label} must be under {TEMP_ROOT}")


def require_sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        raise ValueError(f"{label} must be a lowercase SHA-256 hex string")
    return value


def parse_x86_address(value: Any, label: str) -> tuple[int, str]:
    if not isinstance(value, str) or not ADDRESS_RE.fullmatch(value):
        raise ValueError(f"{label} must be a 32-bit hexadecimal address")
    number = int(value[2:] if value.lower().startswith("0x") else value, 16)
    if number <= 0 or number > 0xFFFFFFFF:
        raise ValueError(f"{label} must be a nonzero IA-32 address")
    return number, f"0x{number:08x}"


def require_marker(value: Any, label: str, run_id: str | None = None) -> str:
    if not isinstance(value, str) or "\r" in value or "\n" in value or len(value) > 256:
        raise ValueError(f"{label} must be one bounded line")
    if not value.startswith("END ") or value.strip() != value:
        raise ValueError(f"{label} must start with 'END ' and contain no outer whitespace")
    if run_id is not None and run_id not in value:
        raise ValueError(f"{label} must contain the unique runId")
    return value


def reject_abort_request(stop_requested: bool) -> None:
    if stop_requested:
        raise RuntimeError("Controller stop requested before scene completion; refusing partial report")


def validate_request(request: dict[str, Any]) -> dict[str, Any]:
    if set(request) != REQUEST_FIELDS:
        missing = sorted(REQUEST_FIELDS - set(request))
        extra = sorted(set(request) - REQUEST_FIELDS)
        raise ValueError(f"Request fields differ from schema; missing={missing}, extra={extra}")
    if request["schema"] != REQUEST_SCHEMA:
        raise ValueError("Unsupported request schema")
    run_id = request["runId"]
    if not isinstance(run_id, str) or not RUN_ID_RE.fullmatch(run_id):
        raise ValueError("runId must be a unique alphanumeric token")
    ready_pid = request["readyPid"]
    if isinstance(ready_pid, bool) or not isinstance(ready_pid, int) or not (1 <= ready_pid <= 0xFFFFFFFF):
        raise ValueError("readyPid must be a positive IA-32 process ID")

    runtime_path = windows_absolute_path(request["runtimePath"], "runtimePath")
    scene_path = windows_absolute_path(request["scenePath"], "scenePath")
    aa0_path = windows_absolute_path(request["aa0Path"], "aa0Path")
    output_root = windows_absolute_path(request["outputRoot"], "outputRoot")
    require_under_temp(output_root, "outputRoot")
    require_under_temp(scene_path, "scenePath")
    require_under_temp(aa0_path, "aa0Path")
    if ntpath.normcase(scene_path) != ntpath.normcase(ntpath.join(TEMP_ROOT, "aaron-scene-state-snapshot.txt")):
        raise ValueError("scenePath must be the runner staging path C:\\temp\\aaron-scene-state-snapshot.txt")
    if ntpath.normcase(aa0_path) != ntpath.normcase(ntpath.join(TEMP_ROOT, "aa0")):
        raise ValueError("aa0Path must be the runner staging path C:\\temp\\aa0")
    if ntpath.normcase(scene_path) == ntpath.normcase(aa0_path):
        raise ValueError("scenePath and aa0Path must identify different files")

    output_paths: dict[str, str] = {}
    for field in (
        "outputPath",
        "controllerReadyPath",
        "statusPath",
        "stopPath",
    ):
        path = windows_absolute_path(request[field], field)
        require_under_temp(path, field)
        if not win_is_under(path, output_root) or ntpath.normcase(path) == ntpath.normcase(output_root):
            raise ValueError(f"{field} must be inside outputRoot")
        output_paths[field] = path
    diagnostic_path = ntpath.join(output_root, "observer-diagnostics.json")
    all_output_paths = [*output_paths.values(), diagnostic_path]
    if len({ntpath.normcase(path) for path in all_output_paths}) != len(all_output_paths):
        raise ValueError("Observer-owned output paths must be unique")
    if ntpath.normcase(request["scenePath"]) in {ntpath.normcase(p) for p in output_paths.values()} or ntpath.normcase(
        request["aa0Path"]
    ) in {ntpath.normcase(p) for p in output_paths.values()}:
        raise ValueError("Observer-owned files cannot overwrite scene or AA0 artifacts")

    callsite, callsite_hex = parse_x86_address(request["premiumCallsite"], "premiumCallsite")
    continuation, continuation_hex = parse_x86_address(
        request["premiumReturnContinuation"], "premiumReturnContinuation"
    )
    pick_entry, pick_entry_hex = parse_x86_address(request["pickEntry"], "pickEntry")
    if callsite > 0xFFFFFFFC or continuation != callsite + 3:
        raise ValueError("premiumReturnContinuation must equal the FF 57 27 callsite + 3")

    scene_end = require_marker(request["sceneEndMarker"], "sceneEndMarker")
    if scene_end != "END scene-state-snapshot":
        raise ValueError("sceneEndMarker must equal END scene-state-snapshot")
    end_marker = require_marker(request["endMarker"], "endMarker", run_id)
    expected_end = f"END frida-observer-{run_id}"
    if end_marker != expected_end or len(end_marker) > 64:
        raise ValueError("endMarker must be the runner-compatible END frida-observer-<runId> slug")
    if scene_end == end_marker:
        raise ValueError("Scene and observer END markers must be distinct")

    binding = request["sourceBinding"]
    if not isinstance(binding, dict) or set(binding) != SOURCE_BINDING_FIELDS:
        raise ValueError("sourceBinding fields differ from the documented schema")
    if binding["readyPid"] != ready_pid or isinstance(binding["readyPid"], bool):
        raise ValueError("sourceBinding.readyPid must equal readyPid")
    binding_paths: dict[str, str] = {}
    for field in ("readyRecordPath", "sourceEvidencePath", "controllerPath"):
        binding_paths[field] = windows_absolute_path(binding[field], f"sourceBinding.{field}")
    binding_hashes = {
        "readyRecordSha256": require_sha256(binding["readyRecordSha256"], "sourceBinding.readyRecordSha256"),
        "sourceEvidenceSha256": require_sha256(binding["sourceEvidenceSha256"], "sourceBinding.sourceEvidenceSha256"),
        "runtimeSha256": require_sha256(binding["runtimeSha256"], "sourceBinding.runtimeSha256"),
        "premiumPayloadSha256": require_sha256(
            binding["premiumPayloadSha256"], "sourceBinding.premiumPayloadSha256"
        ),
        "pickPayloadSha256": require_sha256(binding["pickPayloadSha256"], "sourceBinding.pickPayloadSha256"),
        "controllerSha256": require_sha256(binding["controllerSha256"], "sourceBinding.controllerSha256"),
    }

    timeout_seconds = request["timeoutSeconds"]
    max_records = request["maxRecords"]
    poll_ms = request["pollIntervalMs"]
    if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, int) or not (1 <= timeout_seconds <= MAX_TIMEOUT_SECONDS):
        raise ValueError(f"timeoutSeconds must be between 1 and {MAX_TIMEOUT_SECONDS}")
    if isinstance(max_records, bool) or not isinstance(max_records, int) or not (1 <= max_records <= MAX_RECORDS):
        raise ValueError(f"maxRecords must be between 1 and {MAX_RECORDS}")
    if isinstance(poll_ms, bool) or not isinstance(poll_ms, int) or not (50 <= poll_ms <= MAX_POLL_INTERVAL_MS):
        raise ValueError(f"pollIntervalMs must be between 50 and {MAX_POLL_INTERVAL_MS}")

    return {
        **request,
        "runId": run_id,
        "readyPid": ready_pid,
        "runtimePath": runtime_path,
        "scenePath": scene_path,
        "aa0Path": aa0_path,
        "outputRoot": output_root,
        **output_paths,
        "premiumCallsite": callsite_hex,
        "premiumReturnContinuation": continuation_hex,
        "pickEntry": pick_entry_hex,
        "sourceBinding": {**binding, **binding_paths, **binding_hashes},
    }


def build_agent_source(request: dict[str, Any]) -> str:
    config = {
        "readyPid": request["readyPid"],
        "runtimePath": request["runtimePath"],
        "premiumReturnContinuation": request["premiumReturnContinuation"],
        "pickEntry": request["pickEntry"],
        "maxRecords": request["maxRecords"],
    }
    return AGENT_TEMPLATE.replace("__CONFIG_JSON__", json.dumps(config, separators=(",", ":")))


def validate_source_manifest(request: dict[str, Any]) -> dict[str, Any]:
    binding = request["sourceBinding"]
    source_path = Path(binding["sourceEvidencePath"])
    if not source_path.is_file():
        raise FileNotFoundError(f"Source-evidence file is missing: {source_path}")
    if sha256_file(source_path, MAX_SOURCE_BYTES) != binding["sourceEvidenceSha256"]:
        raise ValueError("Source-evidence file hash differs from sourceBinding")
    source, _ = load_json_file(source_path, MAX_SOURCE_BYTES)
    expected = {
        "schema": SOURCE_SCHEMA,
        "runId": request["runId"],
        "readyPid": request["readyPid"],
        "runtimePath": request["runtimePath"],
        "runtimeSha256": binding["runtimeSha256"],
        "premiumCallsite": request["premiumCallsite"],
        "premiumReturnContinuation": request["premiumReturnContinuation"],
        "pickEntry": request["pickEntry"],
        "premiumPayloadSha256": binding["premiumPayloadSha256"],
        "pickPayloadSha256": binding["pickPayloadSha256"],
        "scenePath": request["scenePath"],
        "sceneName": ntpath.basename(request["scenePath"]),
        "aa0Path": request["aa0Path"],
        "aa0Name": ntpath.basename(request["aa0Path"]),
    }
    for key, value in expected.items():
        actual = source.get(key)
        if key.endswith("Path"):
            try:
                actual = windows_absolute_path(actual, f"sourceEvidence.{key}")
            except ValueError:
                pass
            else:
                value = windows_absolute_path(value, key)
                if ntpath.normcase(actual) == ntpath.normcase(value):
                    continue
        if actual != value:
            raise ValueError(f"Source-evidence field {key} differs from the request")
    return source


def verify_source_files(request: dict[str, Any]) -> dict[str, str]:
    binding = request["sourceBinding"]
    files = {
        "readyRecord": (Path(binding["readyRecordPath"]), binding["readyRecordSha256"]),
        "sourceEvidence": (Path(binding["sourceEvidencePath"]), binding["sourceEvidenceSha256"]),
        "runtime": (Path(request["runtimePath"]), binding["runtimeSha256"]),
        "controller": (Path(binding["controllerPath"]), binding["controllerSha256"]),
    }
    actual: dict[str, str] = {}
    for name, (path, expected_hash) in files.items():
        if not path.is_file():
            raise FileNotFoundError(f"Source-bound {name} file is missing: {path}")
        actual_hash = sha256_file(path, MAX_RUNTIME_BYTES if name == "runtime" else MAX_SOURCE_BYTES)
        if actual_hash != expected_hash:
            raise ValueError(f"Source-bound {name} hash differs from request")
        actual[name] = actual_hash
    return actual


def assert_fresh_output_paths(request: dict[str, Any]) -> None:
    root = Path(request["outputRoot"])
    if root.exists():
        raise FileExistsError(f"outputRoot must be a fresh, initially absent directory: {root}")
    targets = [
        request["outputPath"],
        request["controllerReadyPath"],
        request["statusPath"],
        request["stopPath"],
        ntpath.join(request["outputRoot"], "observer-diagnostics.json"),
    ]
    for target in targets:
        if Path(target).exists():
            raise FileExistsError(f"Output target must be fresh: {target}")


def atomic_write_text(path: Path, text: str, *, exclusive: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + f".tmp-{os.getpid()}-{threading.get_ident()}")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    fd = os.open(str(temp), flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        if exclusive:
            # A hard-link publication is atomic and fails if another writer
            # created the ready/report path after the fresh-path check.
            os.link(temp, path)
            temp.unlink()
        else:
            os.replace(temp, path)
    finally:
        try:
            temp.unlink()
        except FileNotFoundError:
            pass


def atomic_write_json(path: Path, value: dict[str, Any], *, exclusive: bool = False) -> None:
    atomic_write_text(path, json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n", exclusive=exclusive)


def status_update(request: dict[str, Any], phase: str, **fields: Any) -> None:
    status = {
        "schema": "aaron-premium-callsite-pick-observer-status-v1",
        "runId": request["runId"],
        "updatedAtUtc": utc_now(),
        "phase": phase,
        **fields,
    }
    atomic_write_json(Path(request["statusPath"]), status)


def read_terminal_file(path: Path, expected_line: str, *, aa0: bool = False) -> tuple[bool, str | None, dict[str, Any] | None]:
    """Check a bounded tail and return a cheap size/mtime stability signature."""
    if not path.is_file():
        return False, None, None
    stat = path.stat()
    size = stat.st_size
    if size <= 0 or size > MAX_CAPTURE_BYTES:
        return False, None, {"error": "file size outside accepted bounds", "size": size}
    with path.open("rb") as stream:
        stream.seek(max(0, size - 4096))
        terminal = stream.read(4096)
    decoded_tail = terminal.decode("utf-8", errors="replace")
    lines = decoded_tail.replace("\r\n", "\n").split("\n")
    nonempty = [line for line in lines if line != ""]
    if not nonempty or nonempty[-1] != expected_line:
        return False, None, {"error": "expected terminal line is absent", "lastLine": nonempty[-1] if nonempty else None}
    signature = f"{size}:{stat.st_mtime_ns}"
    return True, signature, {"size": size, "mtimeNs": stat.st_mtime_ns, "terminalLine": expected_line, "kind": "aa0" if aa0 else "scene"}


def scene_state(request: dict[str, Any]) -> tuple[bool, dict[str, Any] | None, str | None]:
    aa0_ok, aa0_signature, aa0_detail = read_terminal_file(Path(request["aa0Path"]), "end", aa0=True)
    scene_ok, scene_signature, scene_detail = read_terminal_file(
        Path(request["scenePath"]), request["sceneEndMarker"]
    )
    if aa0_detail and aa0_detail.get("error") == "scene report contains MAIN-ERROR":
        return False, None, "scene report contains MAIN-ERROR"
    if aa0_ok and scene_ok:
        return True, {
            "aa0": aa0_detail,
            "scene": scene_detail,
            "signature": f"{aa0_signature}|{scene_signature}",
        }, None
    return False, {"aa0": aa0_detail, "scene": scene_detail}, None


def finalize_scene_artifacts(request: dict[str, Any], observed: dict[str, Any]) -> dict[str, Any]:
    """Hash stable staging outputs once, then reject a scene error or changed file."""
    scene_path = Path(request["scenePath"])
    aa0_path = Path(request["aa0Path"])
    scene = observed["scene"]
    aa0 = observed["aa0"]
    scene_again_ok, scene_signature, scene_again = read_terminal_file(scene_path, request["sceneEndMarker"])
    aa0_again_ok, aa0_signature, aa0_again = read_terminal_file(aa0_path, "end", aa0=True)
    if not scene_again_ok or not aa0_again_ok:
        raise RuntimeError("Scene/AA0 staging output changed or lost its terminal marker")
    if scene_signature != observed["signature"].split("|")[1] or aa0_signature != observed["signature"].split("|")[0]:
        raise RuntimeError("Scene/AA0 staging output changed after the stable completion observation")
    if scene_path.stat().st_size > MAX_CAPTURE_BYTES or aa0_path.stat().st_size > MAX_CAPTURE_BYTES:
        raise ValueError("Scene/AA0 staging output exceeds the bounded capture size")
    marker = b"MAIN-ERROR"
    overlap = len(marker) - 1
    carry = b""
    total = 0
    with scene_path.open("rb") as stream:
        while True:
            chunk = stream.read(64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_CAPTURE_BYTES:
                raise ValueError("Scene report exceeds the bounded scan size")
            combined = carry + chunk
            if marker in combined:
                raise RuntimeError("Scene report contains MAIN-ERROR")
            carry = combined[-overlap:]
    scene_stat = scene_path.stat()
    aa0_stat = aa0_path.stat()
    if (
        scene_stat.st_size != scene["size"]
        or aa0_stat.st_size != aa0["size"]
        or scene_stat.st_mtime_ns != scene["mtimeNs"]
        or aa0_stat.st_mtime_ns != aa0["mtimeNs"]
    ):
        raise RuntimeError("Scene/AA0 staging output changed while final hashes were being computed")
    scene_hash = sha256_file(scene_path, MAX_CAPTURE_BYTES)
    aa0_hash = sha256_file(aa0_path, MAX_CAPTURE_BYTES)
    scene_after_hash = scene_path.stat()
    aa0_after_hash = aa0_path.stat()
    if (
        scene_after_hash.st_size != scene_stat.st_size
        or scene_after_hash.st_mtime_ns != scene_stat.st_mtime_ns
        or aa0_after_hash.st_size != aa0_stat.st_size
        or aa0_after_hash.st_mtime_ns != aa0_stat.st_mtime_ns
    ):
        raise RuntimeError("Scene/AA0 staging output changed during or after final hashing")
    return {
        "scene": {**scene_again, "sha256": scene_hash, "path": str(scene_path)},
        "aa0": {**aa0_again, "sha256": aa0_hash, "path": str(aa0_path)},
        "signature": observed["signature"],
    }


def render_report(report: dict[str, Any], end_marker: str) -> str:
    lines = [
        f"BEGIN {REPORT_SCHEMA} {report['runId']}",
        "REPORT " + json.dumps(report, sort_keys=True, separators=(",", ":"), ensure_ascii=False),
    ]
    for record in report["matchedRecords"]:
        lines.append("MATCH " + json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
    lines.append(end_marker)
    text = "\n".join(lines) + "\n"
    if len(text.encode("utf-8")) > MAX_REPORT_BYTES:
        raise ValueError("Observer report exceeds bounded output size")
    return text


def validate_report_text(text: str, end_marker: str, run_id: str) -> dict[str, Any]:
    expected_end_marker = f"END frida-observer-{run_id}"
    if end_marker != expected_end_marker:
        raise ValueError("Report END marker does not match runId")
    if "\r" in text:
        raise ValueError("Observer report must use LF line endings")
    lines = text.splitlines()
    if len(lines) < 3 or lines[0] != f"BEGIN {REPORT_SCHEMA} {run_id}" or lines[-1] != end_marker:
        raise ValueError("Observer report is missing its exact envelope")
    if sum(1 for line in lines if line == end_marker) != 1:
        raise ValueError("Observer report must contain exactly one terminal END marker")
    if not lines[1].startswith("REPORT "):
        raise ValueError("Observer report summary line is missing")
    report = json.loads(lines[1][len("REPORT ") :], object_pairs_hook=json_no_duplicate_keys)
    if not isinstance(report, dict) or report.get("schema") != REPORT_SCHEMA or report.get("runId") != run_id:
        raise ValueError("Observer report summary has the wrong schema or runId")
    if report.get("status") not in ("complete", "no-hit"):
        raise ValueError("Observer report status must be complete or no-hit")
    if report.get("stopReason") != "scene-and-aa0-complete" or report.get("captureScope") != "stable-scene-and-aa0-complete":
        raise ValueError("Observer report must cover the stable complete scene and AA0")
    lifecycle = report.get("lifecycle")
    required_true = (
        "requestValidated",
        "sourceBindingVerified",
        "sourceFilesVerified",
        "attached",
        "agentIdentityVerified",
        "scriptLoaded",
        "agentArmed",
        "hookInstalled",
        "controllerReadyWritten",
        "stopRequested",
        "snapshotReceived",
        "interceptorDetached",
        "scriptUnloaded",
        "sessionDetached",
        "sceneComplete",
        "aa0Complete",
        "callbacksDrained",
        "endWritten",
    )
    if not isinstance(lifecycle, dict) or any(lifecycle.get(key) is not True for key in required_true):
        raise ValueError("Observer report lacks required successful lifecycle flags")
    counts = report.get("counts")
    if not isinstance(counts, dict):
        raise ValueError("Observer report is missing counters")
    counter_names = (
        "totalEntries",
        "matchedEntries",
        "unmatchedEntries",
        "matchedReturns",
        "completedPairs",
        "droppedMatchedRecords",
        "inFlightMatched",
    )
    for name in counter_names:
        value = counts.get(name)
        if isinstance(value, bool) or not isinstance(value, int) or not (0 <= value <= MAX_COUNTER):
            raise ValueError(f"Observer report counter {name} is invalid")
    if (
        counts.get("totalEntries") != counts.get("matchedEntries") + counts.get("unmatchedEntries")
        or counts.get("inFlightMatched") != 0
        or counts.get("droppedMatchedRecords") != 0
        or counts.get("counterOverflow") is not False
        or counts.get("matchedEntries") != counts.get("matchedReturns")
        or counts.get("matchedEntries") != counts.get("completedPairs")
    ):
        raise ValueError("Observer report counters are incomplete or lossy")
    expected_status = "complete" if counts.get("matchedEntries", 0) > 0 else "no-hit"
    if report.get("status") != expected_status:
        raise ValueError("Observer report status does not agree with matched entry count")
    if report.get("agentErrorCount") != 0:
        raise ValueError("Observer report contains agent errors")
    records = report.get("matchedRecords")
    if not isinstance(records, list) or len(records) != counts["matchedEntries"]:
        raise ValueError("Observer report matched records do not agree with its counters")
    if report.get("matchedRecordCount") != len(records):
        raise ValueError("Observer report matchedRecordCount differs from its records")
    addresses = report.get("addresses")
    if not isinstance(addresses, dict):
        raise ValueError("Observer report is missing the expected callsite addresses")
    callsite, _ = parse_x86_address(addresses.get("premiumCallsite"), "report premiumCallsite")
    continuation, continuation_hex = parse_x86_address(
        addresses.get("premiumReturnContinuation"), "report premiumReturnContinuation"
    )
    if continuation != callsite + 3:
        raise ValueError("Observer report continuation differs from PREMIUM callsite + 3")
    validate_matched_records(
        records, addresses.get("pickEntry"), continuation_hex, "Observer report"
    )
    match_lines: list[dict[str, Any]] = []
    for line in lines[2:-1]:
        if not line.startswith("MATCH "):
            raise ValueError("Observer report contains an unexpected line")
        record = json.loads(line[len("MATCH ") :], object_pairs_hook=json_no_duplicate_keys)
        if not isinstance(record, dict):
            raise ValueError("Observer MATCH line must contain an object")
        match_lines.append(record)
    if match_lines != records:
        raise ValueError("Observer MATCH lines differ from summary records")
    binding = report.get("sourceBinding")
    if (
        not isinstance(binding, dict)
        or set(binding) != SOURCE_BINDING_FIELDS
        or report.get("sourceBindingSha256") != canonical_json_sha256(binding)
        or binding.get("readyPid") != report.get("pid")
    ):
        raise ValueError("Observer report sourceBinding hash does not match its content")
    hashes = report.get("hashes")
    required_hashes = (
        "requestSha256",
        "driverSha256",
        "agentSourceSha256",
        "readyRecordSha256",
        "sourceEvidenceSha256",
        "runtimeSha256",
        "premiumPayloadSha256",
        "pickPayloadSha256",
        "controllerSha256",
        "sceneSha256",
        "aa0Sha256",
    )
    if not isinstance(hashes, dict) or any(
        not isinstance(hashes.get(key), str) or not SHA256_RE.fullmatch(hashes[key]) for key in required_hashes
    ):
        raise ValueError("Observer report is missing a source or lifecycle hash")
    return report


def self_test_request() -> dict[str, Any]:
    run_id = "self-test-20261015-a1b2c3d4"
    root = rf"C:\temp\{run_id}"
    return {
        "schema": REQUEST_SCHEMA,
        "runId": run_id,
        "readyPid": 1234,
        "runtimePath": root + r"\runtime\AARON.exe",
        "premiumCallsite": "0x20000980",
        "premiumReturnContinuation": "0x20000983",
        "pickEntry": "0x30001234",
        "scenePath": r"C:\temp\aaron-scene-state-snapshot.txt",
        "aa0Path": r"C:\temp\aa0",
        "sceneEndMarker": "END scene-state-snapshot",
        "outputRoot": root + r"\observer",
        "outputPath": root + r"\observer\observer.txt",
        "controllerReadyPath": root + r"\observer\controller-ready.json",
        "statusPath": root + r"\observer\status.json",
        "stopPath": root + r"\observer\stop.request",
        "endMarker": f"END frida-observer-{run_id}",
        "sourceBinding": {
            "readyPid": 1234,
            "readyRecordPath": root + r"\capture\ready.txt",
            "readyRecordSha256": "a" * 64,
            "sourceEvidencePath": root + r"\source-evidence.json",
            "sourceEvidenceSha256": "b" * 64,
            "runtimeSha256": "c" * 64,
            "premiumPayloadSha256": "d" * 64,
            "pickPayloadSha256": "e" * 64,
            "controllerPath": root + r"\capture\coordinator.ps1",
            "controllerSha256": "f" * 64,
        },
        "timeoutSeconds": 600,
        "maxRecords": 64,
        "pollIntervalMs": 250,
    }


def run_self_test() -> int:
    request = validate_request(self_test_request())
    if request["premiumReturnContinuation"] != "0x20000983":
        raise AssertionError("x86 continuation normalization failed")
    if not win_is_under(request["outputPath"], request["outputRoot"]):
        raise AssertionError("observer output path escaped outputRoot")
    agent = build_agent_source(request)
    for required_fragment in (
        'Process.arch !== "ia32"',
        'Process.pointerSize !== 4',
        "mainModulePath",
        "Process.findRangeByAddress(address)",
        'protection.charAt(0) !== "r"',
        "Interceptor.attach(pickEntry",
        "this.returnAddress",
        "returnAddress.equals(expectedReturn)",
    ):
        if required_fragment not in agent:
            raise AssertionError(f"Frida agent is missing required guard: {required_fragment}")
    checked_identity = check_armed_identity(request, {
        "pid": request["readyPid"],
        "arch": "ia32",
        "pointerSize": 4,
        "mainModulePath": request["runtimePath"],
        "pickEntry": request["pickEntry"],
        "expectedReturn": request["premiumReturnContinuation"],
        "mappedCodeRanges": {
            "pickEntry": {"base": "0x30001000", "size": 0x1000, "protection": "r--"},
            "premiumReturnContinuation": {"base": "0x20000000", "size": 0x10000, "protection": "r--"},
        },
    })
    if checked_identity["mappedCodeRanges"]["pickEntry"]["base"] != "0x30001000" or \
        checked_identity["mappedCodeRanges"]["pickEntry"]["protection"] != "r--":
        raise AssertionError("read-only dynamic PICK code range validation failed")
    bad_identity = self_test_request()
    bad_identity["runtimePath"] = request["runtimePath"]
    bad_identity["readyPid"] = request["readyPid"]
    bad_armed = {
        "pid": request["readyPid"], "arch": "ia32", "pointerSize": 4,
        "mainModulePath": request["runtimePath"], "pickEntry": request["pickEntry"],
        "expectedReturn": request["premiumReturnContinuation"],
        "mappedCodeRanges": {
            "pickEntry": {"base": "0x30001000", "size": 0x1000, "protection": "---"},
            "premiumReturnContinuation": {"base": "0x20000000", "size": 0x10000, "protection": "r--"},
        },
    }
    try:
        check_armed_identity(bad_identity, bad_armed)
    except RuntimeError:
        pass
    else:
        raise AssertionError("unreadable mapped code range was accepted")
    bad = self_test_request()
    bad["premiumReturnContinuation"] = "0x20000984"
    try:
        validate_request(bad)
    except ValueError:
        pass
    else:
        raise AssertionError("invalid callsite continuation was accepted")
    bad = self_test_request()
    bad["sceneEndMarker"] = "END scene-state-snapshot-extra"
    try:
        validate_request(bad)
    except ValueError:
        pass
    else:
        raise AssertionError("noncanonical scene terminal marker was accepted")
    bad = self_test_request()
    bad["statusPath"] = bad["outputRoot"] + r"\observer-diagnostics.json"
    try:
        validate_request(bad)
    except ValueError:
        pass
    else:
        raise AssertionError("colliding observer output paths were accepted")
    try:
        reject_abort_request(True)
    except RuntimeError:
        pass
    else:
        raise AssertionError("coordinator abort request was accepted as successful capture")

    report = {
        "schema": REPORT_SCHEMA,
        "runId": request["runId"],
        "status": "no-hit",
        "stopReason": "scene-and-aa0-complete",
        "captureScope": "stable-scene-and-aa0-complete",
        "pid": request["readyPid"],
        "addresses": {
            "premiumCallsite": request["premiumCallsite"],
            "premiumReturnContinuation": request["premiumReturnContinuation"],
            "pickEntry": request["pickEntry"],
        },
        "agentErrorCount": 0,
        "matchedRecordCount": 0,
        "counts": {
            "totalEntries": 2,
            "matchedEntries": 0,
            "unmatchedEntries": 2,
            "matchedReturns": 0,
            "completedPairs": 0,
            "droppedMatchedRecords": 0,
            "inFlightMatched": 0,
            "counterOverflow": False,
        },
        "matchedRecords": [],
        "lifecycle": {
            "requestValidated": True,
            "sourceBindingVerified": True,
            "sourceFilesVerified": True,
            "attached": True,
            "agentIdentityVerified": True,
            "scriptLoaded": True,
            "agentArmed": True,
            "hookInstalled": True,
            "controllerReadyWritten": True,
            "stopRequested": True,
            "snapshotReceived": True,
            "interceptorDetached": True,
            "scriptUnloaded": True,
            "sessionDetached": True,
            "sceneComplete": True,
            "aa0Complete": True,
            "callbacksDrained": True,
            "endWritten": True,
        },
        "sourceBinding": request["sourceBinding"],
        "sourceBindingSha256": canonical_json_sha256(request["sourceBinding"]),
        "hashes": {key: "0" * 64 for key in (
            "requestSha256",
            "driverSha256",
            "agentSourceSha256",
            "readyRecordSha256",
            "sourceEvidenceSha256",
            "runtimeSha256",
            "premiumPayloadSha256",
            "pickPayloadSha256",
            "controllerSha256",
            "sceneSha256",
            "aa0Sha256",
        )},
    }
    output = render_report(report, request["endMarker"])
    parsed = validate_report_text(output, request["endMarker"], request["runId"])
    if parsed["status"] != "no-hit" or not output.endswith(request["endMarker"] + "\n"):
        raise AssertionError("complete no-hit report validation failed")
    try:
        validate_report_text(output.replace(request["endMarker"] + "\n", ""), request["endMarker"], request["runId"])
    except ValueError:
        pass
    else:
        raise AssertionError("report without END was accepted")

    hit_report = json.loads(json.dumps(report))
    hit_report["status"] = "complete"
    hit_report["matchedRecordCount"] = 1
    hit_report["counts"] = {
        "totalEntries": 1,
        "matchedEntries": 1,
        "unmatchedEntries": 0,
        "matchedReturns": 1,
        "completedPairs": 1,
        "droppedMatchedRecords": 0,
        "inFlightMatched": 0,
        "counterOverflow": False,
    }
    hit_report["matchedRecords"] = [{
        "sequence": 1,
        "threadId": 7,
        "entryAddress": "0x30001234",
        "returnAddress": "0x20000983",
        "enteredAtUnixMs": 1,
        "returned": True,
        "returnValue": "0x00000001",
    }]
    hit_output = render_report(hit_report, request["endMarker"])
    if validate_report_text(hit_output, request["endMarker"], request["runId"])["status"] != "complete":
        raise AssertionError("complete matched report validation failed")

    for field, bad_value in (
        ("sequence", 2),
        ("threadId", 0),
        ("entryAddress", "0x20001234"),
        ("returnAddress", "0x20000984"),
    ):
        bad_record_report = json.loads(json.dumps(hit_report))
        bad_record_report["matchedRecords"][0][field] = bad_value
        try:
            validate_report_text(
                render_report(bad_record_report, request["endMarker"]),
                request["endMarker"],
                request["runId"],
            )
        except ValueError:
            pass
        else:
            raise AssertionError(f"report with invalid matched-record {field} was accepted")

    bad_lifecycle = dict(report)
    bad_lifecycle["lifecycle"] = dict(report["lifecycle"], sessionDetached=False)
    try:
        validate_report_text(render_report(bad_lifecycle, request["endMarker"]), request["endMarker"], request["runId"])
    except ValueError:
        pass
    else:
        raise AssertionError("report with failed detach was accepted")

    for candidate in (report, hit_report):
        incomplete = json.loads(json.dumps(candidate))
        incomplete["lifecycle"]["sceneComplete"] = False
        try:
            validate_report_text(
                render_report(incomplete, request["endMarker"]),
                request["endMarker"],
                request["runId"],
            )
        except ValueError:
            pass
        else:
            raise AssertionError(f"{candidate['status']} report without scene completion was accepted")
    print("self-test: request schema, IA-32 identity, readable mapped-code ranges, matched-record pairing, full-scene hit/no-hit gates, report envelopes, and detach gate passed; no process attached")
    return 0


class ObserverMessageState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.armed_event = threading.Event()
        self.match_event = threading.Event()
        self.snapshot_event = threading.Event()
        self.error_event = threading.Event()
        self.armed: dict[str, Any] | None = None
        self.match: dict[str, Any] | None = None
        self.snapshot: dict[str, Any] | None = None
        self.errors: list[dict[str, str]] = []
        self.messageCount = 0

    def on_message(self, message: dict[str, Any], _data: bytes | None) -> None:
        with self.lock:
            if self.messageCount < 32:
                self.messageCount += 1
            kind = None
            payload = message.get("payload")
            if message.get("type") == "error":
                self.errors.append(
                    {
                        "type": "frida-script-error",
                        "message": str(message.get("description", "unknown Frida error"))[:MAX_MESSAGE_CHARS],
                        "stack": str(message.get("stack", ""))[:MAX_MESSAGE_CHARS],
                    }
                )
                self.error_event.set()
                return
            if isinstance(payload, dict):
                kind = payload.get("kind")
            if kind == "armed":
                self.armed = payload
                self.armed_event.set()
            elif kind == "match":
                self.match = payload
                self.match_event.set()
            elif kind == "snapshot":
                self.snapshot = payload
                self.snapshot_event.set()
            elif kind == "agent-error":
                self.errors.append({"type": "agent-error", "message": str(payload.get("error", "unknown agent error"))[:MAX_MESSAGE_CHARS]})
                self.error_event.set()


def check_armed_identity(request: dict[str, Any], armed: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(armed, dict):
        raise RuntimeError("Frida agent did not report a valid armed identity")
    expected = {
        "pid": request["readyPid"],
        "arch": "ia32",
        "pointerSize": 4,
        "pickEntry": request["pickEntry"],
        "expectedReturn": request["premiumReturnContinuation"],
    }
    for key, value in expected.items():
        if armed.get(key) != value:
            raise RuntimeError(f"Frida armed identity field {key} differs from request")
    main_path = windows_absolute_path(armed.get("mainModulePath"), "agent mainModulePath")
    if ntpath.normcase(main_path) != ntpath.normcase(request["runtimePath"]):
        raise RuntimeError("Frida main-module path differs from runtimePath")
    ranges = armed.get("mappedCodeRanges")
    if not isinstance(ranges, dict) or set(ranges) != {"pickEntry", "premiumReturnContinuation"}:
        raise RuntimeError("Frida agent did not report both mapped code ranges")
    expected_ranges = {
        "pickEntry": request["pickEntry"],
        "premiumReturnContinuation": request["premiumReturnContinuation"],
    }
    checked_ranges: dict[str, dict[str, Any]] = {}
    for name, expected_address in expected_ranges.items():
        detail = ranges.get(name)
        if not isinstance(detail, dict) or set(detail) != {"base", "size", "protection"}:
            raise RuntimeError(f"Frida {name} mapped code range is malformed")
        base, base_hex = parse_x86_address(detail.get("base"), f"agent {name} range base")
        size = detail.get("size")
        protection = detail.get("protection")
        if isinstance(size, bool) or not isinstance(size, int) or size <= 0:
            raise RuntimeError(f"Frida {name} range size is invalid")
        end = base + size
        address, _ = parse_x86_address(expected_address, f"request {name}")
        if end > 0x100000000 or not (base <= address < end):
            raise RuntimeError(f"Frida {name} is outside its reported IA-32 range")
        if not isinstance(protection, str) or not re.fullmatch(r"r[w-][x-]", protection):
            raise RuntimeError(f"Frida {name} mapped code range is not readable")
        checked_ranges[name] = {"base": base_hex, "size": size, "protection": protection}
    return {**armed, "mainModulePath": main_path, "mappedCodeRanges": checked_ranges}


def validate_snapshot(
    snapshot: dict[str, Any] | None,
    max_records: int,
    expected_entry: str,
    expected_return: str,
) -> dict[str, Any]:
    if not isinstance(snapshot, dict) or snapshot.get("kind") != "snapshot" or snapshot.get("listenerDetached") is not True:
        raise RuntimeError("Frida agent did not confirm interceptor detach")
    if snapshot.get("agentErrorCount") != 0:
        raise RuntimeError("Frida agent reported callback or detach errors")
    counters = snapshot.get("counters")
    records = snapshot.get("records")
    if not isinstance(counters, dict) or not isinstance(records, list) or len(records) > max_records:
        raise RuntimeError("Frida snapshot is malformed or exceeds its record cap")
    required_counts = (
        "totalEntries",
        "matchedEntries",
        "unmatchedEntries",
        "matchedReturns",
        "completedPairs",
        "droppedMatchedRecords",
        "inFlightMatched",
    )
    for name in required_counts:
        value = counters.get(name)
        if isinstance(value, bool) or not isinstance(value, int) or not (0 <= value <= MAX_COUNTER):
            raise RuntimeError(f"Frida counter {name} is invalid")
    if counters["totalEntries"] != min(MAX_COUNTER, counters["matchedEntries"] + counters["unmatchedEntries"]):
        if not counters.get("counterOverflow"):
            raise RuntimeError("Frida entry counters do not balance")
    if counters["matchedEntries"] != counters["matchedReturns"] or counters["matchedReturns"] != counters["completedPairs"]:
        raise RuntimeError("Frida matched PICK entries and returns are not paired")
    if counters["inFlightMatched"] != 0:
        raise RuntimeError("Frida snapshot has a matched PICK invocation still in flight")
    if counters["droppedMatchedRecords"] != 0 or counters.get("counterOverflow") is not False:
        raise RuntimeError("Frida counters report dropped records or counter overflow")
    if counters["matchedEntries"] != len(records):
        raise RuntimeError("Frida snapshot did not retain every matched call")
    if counters["unmatchedEntries"] + counters["matchedEntries"] != counters["totalEntries"]:
        raise RuntimeError("Frida total and matched/unmatched counters do not balance")
    try:
        validate_matched_records(records, expected_entry, expected_return, "Frida snapshot")
    except ValueError as error:
        raise RuntimeError(str(error)) from error
    if counters["matchedEntries"] < len(records) + counters["droppedMatchedRecords"]:
        raise RuntimeError("Frida matched record totals are inconsistent")
    return {"counters": counters, "records": records}


def build_final_report(
    request: dict[str, Any],
    request_sha256: str,
    driver_sha256: str,
    agent_sha256: str,
    source_hashes: dict[str, str],
    agent_identity: dict[str, Any],
    snapshot: dict[str, Any],
    scene_details: dict[str, Any],
    frida_version: str,
    stop_reason: str,
    lifecycle: dict[str, bool],
) -> dict[str, Any]:
    counters = snapshot["counters"]
    records = snapshot["records"]
    status = "complete" if counters["matchedEntries"] > 0 else "no-hit"
    binding = request["sourceBinding"]
    return {
        "schema": REPORT_SCHEMA,
        "runId": request["runId"],
        "status": status,
        "stopReason": stop_reason,
        "captureScope": "stable-scene-and-aa0-complete",
        "capturedAtUtc": utc_now(),
        "pid": request["readyPid"],
        "identity": agent_identity,
        "addresses": {
            "premiumCallsite": request["premiumCallsite"],
            "premiumReturnContinuation": request["premiumReturnContinuation"],
            "pickEntry": request["pickEntry"],
        },
        "counts": counters,
        "agentErrorCount": 0,
        "matchedRecordCount": len(records),
        "matchedRecords": records,
        "scene": scene_details,
        "sourceBinding": binding,
        "sourceBindingSha256": canonical_json_sha256(binding),
        "hashes": {
            "requestSha256": request_sha256,
            "driverSha256": driver_sha256,
            "agentSourceSha256": agent_sha256,
            "readyRecordSha256": source_hashes["readyRecord"],
            "sourceEvidenceSha256": source_hashes["sourceEvidence"],
            "runtimeSha256": source_hashes["runtime"],
            "premiumPayloadSha256": binding["premiumPayloadSha256"],
            "pickPayloadSha256": binding["pickPayloadSha256"],
            "controllerSha256": source_hashes["controller"],
            "sceneSha256": scene_details["scene"]["sha256"],
            "aa0Sha256": scene_details["aa0"]["sha256"],
        },
        "fridaVersion": frida_version,
        "limits": {
            "maxRecords": request["maxRecords"],
            "maxMessageChars": MAX_MESSAGE_CHARS,
            "agentMessagesSeen": None,
            "counterOverflow": bool(counters.get("counterOverflow")),
        },
        "lifecycle": lifecycle,
    }


def write_failure_diagnostics(
    request: dict[str, Any] | None, details: dict[str, Any], *, output_root_created: bool
) -> None:
    if request is None or not output_root_created:
        return
    try:
        root = Path(request["outputRoot"])
        root.mkdir(parents=True, exist_ok=True)
        diagnostic_path = root / "observer-diagnostics.json"
        if not diagnostic_path.exists():
            atomic_write_json(diagnostic_path, details, exclusive=True)
        status_path = Path(request["statusPath"])
        if not status_path.exists():
            atomic_write_json(status_path, {
                "schema": "aaron-premium-callsite-pick-observer-status-v1",
                "runId": request["runId"],
                "updatedAtUtc": utc_now(),
                "phase": "failed",
                "failure": details,
            }, exclusive=True)
        else:
            status_update(request, "failed", failure=details)
    except Exception as diagnostic_error:
        print(f"could not persist diagnostics: {type(diagnostic_error).__name__}: {diagnostic_error}", file=sys.stderr)


def run_observer(request_path: Path) -> int:
    request: dict[str, Any] | None = None
    session = None
    script = None
    lifecycle: dict[str, bool] = {
        "attached": False,
        "requestValidated": False,
        "sourceBindingVerified": False,
        "sourceFilesVerified": False,
        "agentIdentityVerified": False,
        "scriptLoaded": False,
        "agentArmed": False,
        "hookInstalled": False,
        "controllerReadyWritten": False,
        "stopRequested": False,
        "snapshotReceived": False,
        "interceptorDetached": False,
        "scriptUnloaded": False,
        "sessionDetached": False,
        "sceneComplete": False,
        "aa0Complete": False,
        "callbacksDrained": False,
        "endWritten": False,
    }
    state = ObserverMessageState()
    report_written = False
    request_sha256 = ""
    agent_source = ""
    agent_sha256 = ""
    driver_sha256 = ""
    stop_reason = ""
    snapshot: dict[str, Any] | None = None
    agent_identity: dict[str, Any] | None = None
    source_hashes: dict[str, str] = {}
    scene_details: dict[str, Any] | None = None
    frida_version = "unknown"
    request_for_diagnostics: dict[str, Any] | None = None
    deadline: float | None = None
    output_root_created = False

    try:
        with request_path.open("rb") as stream:
            raw_request = stream.read(MAX_REQUEST_BYTES + 1)
        if len(raw_request) > MAX_REQUEST_BYTES:
            raise ValueError("Request exceeds bounded size")
        request_sha256 = sha256_bytes(raw_request)
        raw_object = json.loads(raw_request.decode("utf-8-sig"), object_pairs_hook=json_no_duplicate_keys)
        if not isinstance(raw_object, dict):
            raise ValueError("Request JSON root must be an object")
        request = validate_request(raw_object)
        request_for_diagnostics = request
        lifecycle["requestValidated"] = True
        assert_fresh_output_paths(request)
        Path(request["outputRoot"]).mkdir(parents=True, exist_ok=False)
        output_root_created = True
        status_update(request, "validating-source", requestSha256=request_sha256)
        validate_source_manifest(request)
        lifecycle["sourceBindingVerified"] = True
        source_hashes = verify_source_files(request)
        lifecycle["sourceFilesVerified"] = True
        agent_source = build_agent_source(request)
        agent_sha256 = sha256_bytes(agent_source.encode("utf-8"))
        driver_sha256 = sha256_file(Path(__file__).resolve())

        try:
            import frida  # type: ignore[import-not-found]
        except Exception as import_error:
            raise RuntimeError(f"Frida Python package is unavailable: {import_error}") from import_error
        frida_version = str(getattr(frida, "__version__", "unknown"))[:128]

        deadline = time.monotonic() + request["timeoutSeconds"]
        status_update(request, "attaching", readyPid=request["readyPid"])
        session = frida.attach(request["readyPid"])
        lifecycle["attached"] = True
        script = session.create_script(agent_source)
        script.on("message", state.on_message)
        script.load()
        lifecycle["scriptLoaded"] = True

        while time.monotonic() < deadline and not state.armed_event.is_set():
            if state.error_event.is_set():
                raise RuntimeError(f"Frida agent failed before arm: {state.errors[:4]}")
            state.armed_event.wait(min(0.1, max(0.01, deadline - time.monotonic())))
        if not state.armed_event.is_set():
            raise TimeoutError("Frida agent did not arm before the request deadline")
        if state.error_event.is_set():
            raise RuntimeError(f"Frida agent failed while arming: {state.errors[:4]}")
        agent_identity = check_armed_identity(request, state.armed)
        lifecycle["agentIdentityVerified"] = True
        lifecycle["agentArmed"] = True
        lifecycle["hookInstalled"] = True
        ready_document = {
            "schema": "aaron-premium-callsite-pick-observer-controller-ready-v1",
            "runId": request["runId"],
            "ready": True,
            "readyAtUtc": utc_now(),
            "pid": request["readyPid"],
            "identity": agent_identity,
            "addresses": {
                "premiumCallsite": request["premiumCallsite"],
                "premiumReturnContinuation": request["premiumReturnContinuation"],
                "pickEntry": request["pickEntry"],
            },
            "requestSha256": request_sha256,
            "sourceBindingSha256": canonical_json_sha256(request["sourceBinding"]),
            "agentSourceSha256": agent_sha256,
            "hostWillNotReleaseAARON": True,
        }
        atomic_write_json(Path(request["controllerReadyPath"]), ready_document, exclusive=True)
        lifecycle["controllerReadyWritten"] = True
        status_update(request, "armed", controllerReadyPath=request["controllerReadyPath"], identity=agent_identity)

        poll_seconds = request["pollIntervalMs"] / 1000.0
        stable_signature: str | None = None
        stable_since: float | None = None
        stable_scene_complete = False
        scene_probe: dict[str, Any] | None = None
        while time.monotonic() < deadline:
            if state.error_event.is_set():
                raise RuntimeError(f"Frida agent reported an error: {state.errors[:4]}")
            scene_complete, scene_probe, scene_error = scene_state(request)
            if scene_error:
                raise RuntimeError(scene_error)
            signature = scene_probe.get("signature") if scene_complete and scene_probe else None
            stable_scene_complete = False
            if signature is not None and signature == stable_signature:
                stable_scene_complete = stable_since is not None and time.monotonic() - stable_since >= SCENE_STABLE_SECONDS
            else:
                stable_signature = signature
                stable_since = time.monotonic() if signature is not None else None
            reject_abort_request(Path(request["stopPath"]).is_file())
            if stable_scene_complete:
                stop_reason = "scene-and-aa0-complete"
                break
            status_update(
                request,
                "observing",
                matchSeen=state.match_event.is_set(),
                sceneComplete=stable_scene_complete,
            )
            time.sleep(min(poll_seconds, max(0.01, deadline - time.monotonic())))
        if not stop_reason:
            raise TimeoutError("Timed out waiting for stable complete scene and AA0 artifacts")

        lifecycle["stopRequested"] = True
        status_update(request, "stopping", stopReason=stop_reason)
        script.post({"type": "stop"})
        if not state.snapshot_event.wait(AGENT_STOP_TIMEOUT_SECONDS):
            if state.error_event.is_set():
                raise RuntimeError(f"Frida agent failed to detach interceptor: {state.errors[:4]}")
            raise TimeoutError("Frida agent did not confirm interceptor detach")
        if state.error_event.is_set():
            raise RuntimeError(f"Frida agent failed during stop: {state.errors[:4]}")
        snapshot = validate_snapshot(
            state.snapshot,
            request["maxRecords"],
            request["pickEntry"],
            request["premiumReturnContinuation"],
        )
        lifecycle["snapshotReceived"] = True
        lifecycle["interceptorDetached"] = True
        lifecycle["callbacksDrained"] = True

        # Detach the Frida script and session before accepting a terminal report.
        script.unload()
        script = None
        lifecycle["scriptUnloaded"] = True
        session.detach()
        session = None
        lifecycle["sessionDetached"] = True

        if not scene_probe or not stable_scene_complete or stop_reason != "scene-and-aa0-complete":
            raise RuntimeError("Refusing to report without a stable complete scene and AA0")
        scene_details = finalize_scene_artifacts(request, scene_probe)
        lifecycle["sceneComplete"] = True
        lifecycle["aa0Complete"] = True
        report = build_final_report(
            request=request,
            request_sha256=request_sha256,
            driver_sha256=driver_sha256,
            agent_sha256=agent_sha256,
            source_hashes=source_hashes,
            agent_identity=agent_identity,
            snapshot=snapshot,
            scene_details=scene_details,
            frida_version=frida_version,
            stop_reason=stop_reason,
            lifecycle={**lifecycle, "endWritten": True},
        )
        report["limits"]["agentMessagesSeen"] = state.messageCount
        text = render_report(report, request["endMarker"])
        validate_report_text(text, request["endMarker"], request["runId"])
        atomic_write_text(Path(request["outputPath"]), text, exclusive=True)
        report_written = True
        lifecycle["endWritten"] = True
        status_update(
            request,
            "complete",
            status=report["status"],
            outputPath=request["outputPath"],
            requestSha256=request_sha256,
            observerEndWritten=True,
            counts=snapshot["counters"],
        )
        print(json.dumps({"status": report["status"], "runId": request["runId"], "outputPath": request["outputPath"]}, sort_keys=True))
        return 0
    except Exception as error:
        diagnostics = {
            "schema": "aaron-premium-callsite-pick-observer-diagnostics-v1",
            "runId": request["runId"] if request else None,
            "capturedAtUtc": utc_now(),
            "errorType": type(error).__name__,
            "error": str(error)[:MAX_MESSAGE_CHARS],
            "lifecycle": lifecycle,
            "messageCount": state.messageCount,
            "agentMessages": {
                "armed": state.armed,
                "match": state.match,
                "snapshot": state.snapshot,
                "errors": state.errors[:4],
            },
            "requestSha256": request_sha256 or None,
            "reportWritten": report_written,
            "endWritten": lifecycle["endWritten"],
        }
        write_failure_diagnostics(request_for_diagnostics, diagnostics, output_root_created=output_root_created)
        print(json.dumps(diagnostics, sort_keys=True), file=sys.stderr)
        return 1
    finally:
        detach_errors: list[str] = []
        if script is not None:
            try:
                script.unload()
                lifecycle["scriptUnloaded"] = True
            except Exception as detach_error:
                detach_errors.append(f"script unload: {type(detach_error).__name__}: {detach_error}")
        if session is not None:
            try:
                session.detach()
                lifecycle["sessionDetached"] = True
            except Exception as detach_error:
                detach_errors.append(f"session detach: {type(detach_error).__name__}: {detach_error}")
        if detach_errors:
            cleanup = {
                "schema": "aaron-premium-callsite-pick-observer-cleanup-diagnostics-v1",
                "runId": request["runId"] if request else None,
                "capturedAtUtc": utc_now(),
                "detachErrors": detach_errors[:4],
                "lifecycle": lifecycle,
                "endWritten": lifecycle["endWritten"],
            }
            if report_written or lifecycle["endWritten"]:
                # A terminal report may only follow successful explicit detach.
                # Reaching this branch is an invariant failure; record it loudly.
                print("invariant violation: detach failed after report END", file=sys.stderr)
            write_failure_diagnostics(request_for_diagnostics, cleanup, output_root_created=output_root_created)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--request", type=Path, help="source-bound observer request JSON")
    mode.add_argument("--self-test", action="store_true", help="validate request/report gates without attaching")
    parser.add_argument(
        "--allow-aaron-injection-after-crash",
        action="store_true",
        help="required to attach after the recorded Frida 17.23.3 AARON crash; use only after materially changing and validating conditions",
    )
    args = parser.parse_args(argv)
    if args.self_test:
        try:
            return run_self_test()
        except Exception as error:
            print(f"self-test failed: {type(error).__name__}: {error}", file=sys.stderr)
            return 1
    if not args.allow_aaron_injection_after_crash:
        print(
            "AARON injection is disabled after two source-bound crashes in frida-agent.dll before script load; use the REA/no-TF route or materially change and validate the agent/runtime before passing --allow-aaron-injection-after-crash",
            file=sys.stderr,
        )
        return 2
    return run_observer(args.request)


if __name__ == "__main__":
    raise SystemExit(main())
