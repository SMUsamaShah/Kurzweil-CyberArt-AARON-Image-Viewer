# Native startup investigation

## Confirmed observations

The baseline Windows Server 2025 and all three Windows Server 2022 probes
(normal, XP compatibility, Allegro startup diagnostics) installed successfully
and exited with `0xC00000FD` before producing a painting.

The native debugger run [33932707677](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33932707677)
captured the earlier fault:

```text
DEP-query=True flags=1 permanent=False
code=0xC0000005 first=1 address=0x20000985 module=...\AARON.dxl
information[0]=0x8
information[1]=0x20000985
```

After the two expected Windows loader breakpoints, execution repeatedly faults
at this address. Microsoft's [EXCEPTION_RECORD documentation](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-exception_record)
identifies access-violation parameter 8 as an attempted execution prevented by
DEP. This establishes a DEP incompatibility in the legacy Lisp image. The
stack-overflow exit is likely secondary to recursive exception handling; a
stack trace would be needed to prove that exact recursion path.

The follow-up changes DEP only for the installed AARON executable on a
disposable runner, keeps the application firewall block, and removes the
override after the probe. No binary bytes are modified.

## Registry compatibility blocker

With DEP disabled, the process no longer faults in `AARON.dxl`, but the first
paint probe remains alive behind an `AARON Registry Error` dialog. Its captured
message is:

```text
KCATisRunning Error

EXCEPTION: OperatingSystem
EXCEPTION: getPlatformId
EXCEPTION: to be NT but MajorVersion=
```

Static inspection of the hash-identified `registry.dll` shows a 15-entry export
table. `KCATisRunning` is export ordinal 10 at RVA `0x86d0`; the DLL imports
`GetVersionExA`. Its entry point starts with the normal x86 C++ prologue and
then enters the legacy OS/process scan. This matches the dialog's failure
location and is independent of the image generator itself.

The oracle now has an opt-in, hash-guarded compatibility probe
(`tools/patch-registry-running.ps1`). On a disposable installed copy only, it
resolves the PE export table, verifies the original `registry.dll` SHA-256 and
the prologues of `KCATisRunning` and `KCATgetDaysSinceInstalled`, and replaces
both entry points with `xor eax,eax; ret` (`31 C0 C3`). The first return value
reports “not already running”; the second reports zero elapsed trial days.
Other registry operations remain intact. The original extracted file is never
changed or committed; the workflow records the patched hash and exact
RVA/offsets in `registry-patch.json`.

This is a diagnostic workaround, not a claim about the historical source. If
the patched probe reaches the generator, subsequent traces can separate the
registry compatibility layer from AARON's composition and file-writing code.

## Leads in the pure Lisp library

These strings were found in the hash-identified `AARON.pll`. Offsets are byte
offsets within that file, not function addresses or proof of reachable code.

| String | File offset | Research question |
|---|---:|---|
| `KCAT_AARON_SMALL_IMAGE` | `0x351244` | Is there an environment-controlled image size? |
| `?RSEED?` | `0x3dca04` | Does this application variable control reproducible composition? |
| `SET-FILE-ADDRESSES` | `0x3291fc` | How is seed state associated with saved outputs? |
| `in set-file-addresses ?rseed? is ~A~%` | `0x31e89c` | Can existing diagnostics expose seed state? |
| `NEW-RANDOM-FLOAT` | `0x33f38c` | Which random path is used by the art engine? |
| `RANDOM-INT` | `0x344c24` | Which integer distribution and range semantics apply? |
| `MAKE-RANDOM-STATE-FROM-SEED` | `0x3d6c84` | Runtime facility or application entry point? |

Library strings include both application and runtime symbols. None of these
leads should be presented as a verified user-facing switch until its callers,
data references, or dynamic behavior are recovered.

## Exactness target

A large sample corpus helps find regressions and rare behaviors, but matching
output statistics cannot prove an exact port. Exactness requires recovering
the decision rules, numeric semantics, random algorithm/state initialization,
and sequence of random draws, then comparing controlled original and JS runs.
Sample-only inferred behavior must remain explicitly marked as approximate.
