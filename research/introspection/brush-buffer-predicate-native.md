# Native predicate candidates: FOOB and ZERO-EDGE

The later [FOOB behavior capture](foob.md) measures its bounds predicate
separately. The evidence below records the earlier native mapping; ZERO-EDGE
behavior remains unresolved.

## Capture and verified scope

The metadata probe enumerated two compiled functions while AARON was paused:
`FOOB` and `ZERO-EDGE`. It read argument lists, compiled-function headers and
bounded constant records. It did not wrap, replace or call either target, so
this capture establishes their presence and static inputs, not that either ran
during the painting.

The instrumented run was
`brush-buffer-predicate-native-seed1234-20261006-a`; its fresh, uninstrumented
control was `brush-buffer-predicate-native-control-seed1234-20261006-b`. Both
used full-size `writer-stream-seed-1234` settings and identical installer,
registry and license hashes. The actual AA0 drawing bytes and full scene report
bytes match between the two runs. Their common SHA-256 values are
`0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1` and
`a2f17602ba33d0ac1b80544c1a70c0ae657c60dad9110c075f9ce43b21e8b415`.

The metadata report has two targets, two function headers and 14 constants,
with zero errors and zero truncations. The probe source is frozen at SHA-256
`2818c50d2028dbea16d5d8100c9c45c4707662124a084ec668b28653bf4d6ae6`.

## Exact code-object mapping and analysis

Each captured memory window maps to one unique, complete compiled object in the
same run's `AARON.pll`. The mapper-derived payload was imported as raw x86 into
Ghidra 12.1.4 using `x86:LE:32:default` and the Windows compiler specification.
Every reported instruction byte was checked against the mapped payload.

| Function | Arguments | Metadata constants | PLL payload / complete object | Reachable instruction bytes checked |
|---|---|---|---:|---:|
| `FOOB` | `X`, `Y` | `*PIC-WIDE*`, `*PIC-HIGH*` | 298 / 302 bytes | 110 instructions / 289 bytes |
| `ZERO-EDGE` | `START`, `PERIM` | `START`, `X`, `Y`, `Z`, `XINCS`, `NTHCDR`, `YINCS`, `FOOB`, `FILL-MAP`, `AREF`, `MAKE-TRIPT`, `MOD` | 982 / 986 bytes | 338 instructions / 973 bytes |

The remaining nine payload bytes per function were not reached by Ghidra's
disassembly and are left unclassified. They are not described as code or data.

The captured 64-byte `SYSTEM::MEMREF` header is live function metadata. It is
kept separate from the serialized PLL object header. The byte comparison uses
the measured `entry - windowBase - 4` position in each captured window and
compares the full object slice; that offset is 60 bytes for both functions in
this run. The offset is a measurement for these windows, not a fixed address or
general format rule.

REA 3.2.1 imported and exported one canonical Evidence record per function;
both imports report `imported: 1`, `unknowns_added: 0`, `total: 1`. Each record
identifies provider `ghidra-standalone`, operation
`standalone_ghidra_function_analysis`, and
`rea_native_provider_session: false`. This is external Ghidra evidence, not a
REA native-provider session. The evidence IDs are `ev_1869915c87e200fc2d5db6ebae37e2d0c18fef7d6ed9205103889c4fb38eea75`
for `FOOB` and `ev_8475abdb163f8601a2e4b24583fa86a9eb02d0e8b3dabb715364e7131cba0b43`
for `ZERO-EDGE`. Because REA 3.2.1 has no `raw` subject-format enum, the
records preserve `raw` as the reported source format and use `unknown` for the
REA subject format.

## Static candidates and limits

The metadata records give `FOOB` the two arguments `X`, `Y` and the two named
constants `*PIC-WIDE*`, `*PIC-HIGH*`. Its reachable machine code includes
tagged-value checks and signed comparisons around those constant slots. That
pattern is consistent with a picture-bounds predicate candidate. Static output
does not establish return polarity, edge inclusivity, behavior for other
numeric types, or the source-level comparison operators.

`ZERO-EDGE` has arguments `START`, `PERIM` and literal names for coordinate,
increment, list, predicate, map and point-construction helpers. Its disassembly
contains counter-like values, tagged arithmetic paths and indirect calls.
Those are dependency and traversal candidates only: the report does not
resolve every indirect call to a Lisp function, establish a source-level loop,
or show that `ZERO-EDGE` was called in either captured painting.

The Ghidra compiler model does not describe Allegro Lisp's calling convention
or tagged values. Ghidra decompiler arguments, types and C-like expressions are
analysis aids, not recovered Lisp source. These files do not establish natural
behavioral semantics and do not add JavaScript behavior for either function.

## Evidence and reproduction

The ignored, source-bound derived artifact is
[`predicate-native-evidence.json`](../extracted/local-oracle/brush-buffer-predicate-native-seed1234-20261006-a/native-code/mapped/predicate-native-evidence.json)
(SHA-256 `d6ffe3fa63958b79ea14199c098f121f3d4d3ce94d68cc3aa010ac750f28f0f4`).
It binds 56 sources and artifacts, including the probe/request, raw metadata,
manifest, code windows, map, Ghidra reports/logs, REA records, runtime files,
toolchain configuration and the selected Ghidra/JDK launcher files. A portable
copy is published at
[`evidence/brush-buffer-predicate-native-20261006.json`](evidence/brush-buffer-predicate-native-20261006.json).

The completed evidence uses these exact roots and a 90-second positive pause.
For a new capture, select fresh ignored roots and run only one original process
at a time. Start Terminal A first:

```powershell
.\research\oracle\run-local-scene-state.ps1 `
  -ExtractedRoot research\extracted\aaron `
  -OutputRoot research\extracted\local-oracle\brush-buffer-predicate-native-new `
  -RunId brush-buffer-predicate-native-new -Mode writer-stream-seed-1234 `
  -RunSeconds 150 `
  -PreSceneProbePath research\introspection\brush-buffer-predicate-native-links.cl `
  -PreSceneProbePauseSeconds 90 `
  -ProbeOutputNames aaron-brush-buffer-predicate-native-links.txt
```

As soon as this process is paused, use Terminal B to capture only the two
declared targets. Pass the metadata path, end marker and expected count because
the helper's defaults select the five selector functions. The helper releases
the paused process when capture completes:

```powershell
.\research\tools\capture-aaron-native-code.ps1 `
  -OracleOutputRoot research\extracted\local-oracle\brush-buffer-predicate-native-new `
  -MetadataPath C:\temp\aaron-brush-buffer-predicate-native-links.txt `
  -MetadataEndMarker 'END brush-buffer-predicate-native-links' `
  -ExpectedFunctionCount 2
```

Wait for the instrumented run to finish before starting a fresh uninstrumented
control in the same mode:

```powershell
.\research\oracle\run-local-scene-state.ps1 `
  -ExtractedRoot research\extracted\aaron `
  -OutputRoot research\extracted\local-oracle\brush-buffer-predicate-native-control-new `
  -RunId brush-buffer-predicate-native-control-new -Mode writer-stream-seed-1234 `
  -RunSeconds 150
```

After both runs complete, map the captured functions:

```powershell
node research\tools\map-native-code-to-pll.mjs `
  research\extracted\local-oracle\brush-buffer-predicate-native-new\native-code\manifest.json `
  research\extracted\local-oracle\brush-buffer-predicate-native-new\runtime\AARON.pll `
  research\extracted\local-oracle\brush-buffer-predicate-native-new\native-code\mapped
```

Run `run-aaron-ghidra.ps1` on the complete map with the pinned paths from
`research\artifacts\rea-tools\toolchain.json`. Create and import/export one
REA bundle each for `foob.ghidra.json` and `zero-edge.ghidra.json`.

The frozen deriver is pinned to the completed `-20261006-a` instrumented root
and `-20261006-b` control. Re-run it against those roots with a fresh output
name, for example:

```powershell
node research\tools\derive-brush-buffer-predicate-native-evidence.mjs `
  --output research\extracted\local-oracle\brush-buffer-predicate-native-seed1234-20261006-a\native-code\mapped\predicate-native-evidence-new-c.json
```

It checks the actual AA0 and scene bytes, rederives unique complete PLL object
matches, and validates every instruction byte and canonical REA round-trip
before writing. A new capture identity requires a separately updated and
reviewed derivation specification; this frozen helper will reject new roots.
The native workflow and its provider limitations are documented in
[native-analysis-workflow.md](../native-analysis-workflow.md).
