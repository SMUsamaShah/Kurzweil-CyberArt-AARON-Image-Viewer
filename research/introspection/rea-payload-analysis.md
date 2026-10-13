# REA 6.4 analysis of exact named PLL payloads

On 2026-10-12, published REA 6.4.0 completed native Ghidra function queries for
the archived ZERO-EDGE, BRUSH-FILL and FILL-IRIS payloads. This adds structured
control-flow blocks, reference facts and p-code def-use graphs to the existing
standalone Ghidra decoding. All three instruction sequences agree with those
older reports after normalizing only whitespace after operand commas.

| Function | Copied bytes | Body bytes | Instructions | CFG blocks | Conditional jump refs | CALL instructions | P-code ops | Def-use edges |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ZERO-EDGE | 982 | 973 | 338 | 79 | 45 | 41 | 387 | 379 |
| BRUSH-FILL | 1,986 | 1,978 | 651 | 121 | 63 | 137 | 952 | 885 |
| FILL-IRIS | 1,384 | 1,375 | 459 | 92 | 54 | 61 | 671 | 744 |

All three p-code graphs report no truncation, no omitted operations and no
known omitted inputs or edges. The counts describe Ghidra's inferred function
bodies. Trailing copied payload bytes outside those bodies are not counted
as instructions.

## Supported static input and authority

Published Windows REA 6.4 still rejects headerless raw inputs. This analysis
uses generated x86 PE containers admitted by the unchanged provider. Each
container copies the exact mapped payload, verified against both its archived
payload hash and the complete PLL slice. The generated headers, section layout,
image base and seeded function names are analyst assertions. The archived
measured entry addresses are reproduced as static address context; they do
not identify a currently running process.

REA's raw Evidence says `authority: shipped-artifact` because its subject is
a PE. The portable derivation explicitly qualifies this: original payload
bytes are inside an analyst-generated PE wrapper. The wrapper is not a shipped
AARON executable. It has never been executed. No provider guard was disabled,
and this investigation used no oracle or debugger.

The isolated containers omit external objects and runtime state. Every dossier
has zero resolved callers and zero resolved callees. That inventory cannot
establish an application call graph. Ghidra's inferred fastcall signatures and
C types do not establish the native Lisp ABI or recover original Lisp source.

## Concrete queries

ZERO-EDGE has `CMP ECX,0x2` at archived static address `0x1fe03941`, followed by
`JZ 0x1fe03949` at `0x1fe03944` and `CALL [EDI-0x45]` at `0x1fe03946`.
The actual REA `xrefs` query for `0x1fe03949` returns `0x1fe03944`.
The actual `resolve-native-call-targets` query at `0x1fe03946` returns
`status: unresolved`, `mechanism: computed`, and an empty target list.
This establishes a static branch/reference observation and a precise unresolved
indirect-call boundary. It does not establish the Lisp meaning of ECX or the
callee's runtime identity.

### BRUSH-STROKE targeting, 2026-10-12

REA 6.4.0 also completed a function query for the exact 564-byte mapped
`BRUSH-STROKE` payload at archived static entry `0x1fe435c4`. Its inferred
function body is 555 bytes, with 201 decoded instructions and 47 basic blocks.
All 201 instruction addresses and mnemonics match the earlier raw-payload
Ghidra report after normalizing whitespace after commas; instruction bytes
are checked against the uniquely matched PLL payload. The body has 24
conditional-jump references and 35 `CALL` instructions. Its high-p-code report
contains 272 operations and 248 def-use edges with no reported truncation or
omitted operations, inputs, or edges.

Two targeted REA queries add useful navigation points for the natural VALUE=0
capture:

| Query | Static result |
|---|---|
| `xrefs 0x1fe436bd` | One source, conditional branch at `0x1fe43609` |
| `resolve-native-call-targets 0x1fe4369e` | `CALL dword ptr [EDI + 0x57]`; unresolved computed call, no target references |

These observations identify a branch and an unresolved indirect-call site in
the mapped native body. They do not establish register or Lisp argument
meanings, runtime branch outcomes, the call's runtime callee, a direct Lisp
caller, or any drawing behavior. The generated PE wrapper was not executed;
the entry address is archived static context, not a current live address.
Follow-up intra-function xref queries resolve `0x1fe436c8: JZ 0x1fe43613`,
`0x1fe43611: JZ 0x1fe43639`, and `0x1fe436ce: JMP 0x1fe43639`. The nearby
`MOV EBX,EAX; OR EBX,EDX; TEST BL,0x3; JNZ 0x1fe436bd` sequence takes that
machine branch when `(EAX | EDX) & 3` is nonzero. Register meanings and the
runtime outcomes remain unknown. REA's `xrefs` result gives source addresses;
the function assembly supplies the instruction kind. These additional static
references still do not identify a caller or VALUE=0 behavior. The source-bound
derivation also pins the two raw REA reports and verifies their bytes against
the retained Ghidra listing and exact PLL payload.

Two additional REA 6.4.0 queries resolve the next branch destinations:

| Query | Static result |
|---|---|
| `xrefs 0x1fe436e5` | One source, `0x1fe4367c: JLE 0x1fe436e5` |
| `xrefs 0x1fe436d3` | One source, `0x1fe43675: JNZ 0x1fe436d3` |

These results extend navigation through the same inferred body. They remain
xref evidence only; the conditions do not identify Lisp argument meanings or
runtime outcomes. Raw reports are retained under
`research/artifacts/rea-tools/brush-stroke-value0-xrefs-436e5-436d3-20261012-95c3f4d553/`.

Three more REA 6.4.0 `resolve-native-call-targets` queries cover call sites
in the branch-target area:

| Call site | Instruction from the pinned function listing | REA result |
|---|---|---|
| `0x1fe436de` | `CALL dword ptr [EDI + 0x27]` | unresolved computed call; `targets: []` |
| `0x1fe436f0` | `CALL dword ptr [EDI + -0x71]` | unresolved computed call; `targets: []` |
| `0x1fe436f8` | `CALL EDI` | unresolved computed call; `targets: []` |

All three reports use the same generated PE SHA-256 and analysis-profile
digest as the pinned BRUSH-STROKE function dossier, and have empty stderr.
The offline derivation checks each report against its exact CLI request,
profile, function entry, and instruction in the retained listing. These are
static call-reference results: they do not say which branch ran, whether any
site executes in AARON, or which runtime function a computed call reaches.
Raw reports and request metadata remain under
`research/artifacts/rea-tools/brush-stroke-value0-call-cluster-20261012-ffcf03382e/`.

The first Java-backed REA queries were blocked under the default sandbox:
`spawnSync(java.exe, ...)` returned `EPERM`, which REA surfaced as
`runtime_missing` with no Java version. The configured Java and Ghidra paths
were valid. A later scoped out-of-sandbox run succeeded without reinstalling
or changing the toolchain, confirming this was a child-process permission
boundary rather than a missing Java runtime. Continue to use scoped permission
for Java-backed REA/oracle commands when the sandbox blocks the child process;
do not weaken provider checks.

See the separate [BRUSH-STROKE portable evidence](evidence/rea-brush-stroke-control-flow-20261012-v4.json),
which adds and supersedes the earlier v3 view of this investigation,
and its [offline derivation helper](../tools/derive-rea-brush-stroke-target-evidence.mjs).

To repeat the static queries, keep the generated PE and seed in their existing
ignored folder, then write each CLI result into a new output folder. Do not run
the generated PE:

```powershell
$reaTools = Get-Content research/artifacts/rea-tools/toolchain-current.json | ConvertFrom-Json
$reaRoot = (Resolve-Path research/artifacts/rea-tools/brush-stroke-value0-20261012).Path
$env:GHIDRA_INSTALL_DIR = $reaTools.ghidra
$env:JAVA_HOME = $reaTools.javaHome
$env:REA_ANALYSIS_PROVIDER = 'ghidra'
$env:GHIDRA_HEADLESS_MAXMEM = '512M'
$env:REA_GHIDRA_LANGUAGE_ID = 'x86:LE:32:default'
$env:REA_GHIDRA_COMPILER_SPEC_ID = 'windows'
$env:REA_GHIDRA_SEED_FILE = Join-Path $reaRoot 'brush-stroke.seeds.tsv'
$exe = Join-Path $reaRoot 'brush-stroke.synthetic.exe'
& $reaTools.node $reaTools.reaCli function $exe 0x1fe435c4 --provider ghidra --format json
& $reaTools.node $reaTools.reaCli xrefs $exe 0x1fe436bd --provider ghidra --format json
& $reaTools.node $reaTools.reaCli resolve-native-call-targets $exe 0x1fe4369e --provider ghidra --format json
& $reaTools.node $reaTools.reaCli xrefs $exe 0x1fe436e5 --provider ghidra --format json
& $reaTools.node $reaTools.reaCli xrefs $exe 0x1fe436d3 --provider ghidra --format json
& $reaTools.node $reaTools.reaCli resolve-native-call-targets $exe 0x1fe436de --provider ghidra --format json
& $reaTools.node $reaTools.reaCli resolve-native-call-targets $exe 0x1fe436f0 --provider ghidra --format json
& $reaTools.node $reaTools.reaCli resolve-native-call-targets $exe 0x1fe436f8 --provider ghidra --format json
```

## Retained inputs and reproduction

For current Windows REA queries, prefer the repository wrapper
[`invoke-rea-ghidra-query.ps1`](../tools/invoke-rea-ghidra-query.ps1). It loads
`toolchain-current.json`, configures process-local Java/Ghidra variables,
requires a fresh ignored output folder, and verifies the report's subject hash.
See the [local tooling quick fixes](../tooling-workarounds.md) for the exact
recovery path when the provider or user-profile permissions block a run.

All complete reports, synthetic containers, seeds and command logs are ignored
under `research/artifacts/rea-tools/deeper-rea-20261012/`.
`synthetic-bindings.json` binds maps, PLL offsets, payloads and generated PE
hashes. `build-and-query.mjs` retains the exact generation algorithm and
function commands; `summarize-and-followup.mjs` retains the follow-up commands.
Their `spawnSync` calls invoke Node plus the REA CLI; they never launch a
synthetic executable. The tracked [reusable builder](../tools/prepare-rea-payload-pe.mjs)
accepts an exact archived map/function/PLL and a fresh directory beneath
`research/artifacts/rea-tools`. It validates the complete uniquely matched
object and writes PE, seed and metadata with exclusive creation. It never
launches a process. Its independent constructions for all three functions
reproduce the retained PE and seed bytes exactly.

Create fresh static analysis inputs with the explicit CLI below. The example
output directories must not already exist. The original payloads and PLL remain
read-only. Generated headers, padding and address layout remain analyst
assertions recorded in each `.binding.json`.

```powershell
$reaTools = Get-Content research/artifacts/rea-tools/toolchain-current.json | ConvertFrom-Json
& $reaTools.node research/tools/prepare-rea-payload-pe.mjs --map research/extracted/local-oracle/brush-buffer-predicate-native-seed1234-20261006-a/native-code/mapped/native-code-map.json --function ZERO-EDGE --pll research/extracted/aaron/application/AARON.pll --output-dir research/artifacts/rea-tools/zero-edge-static-new
& $reaTools.node research/tools/prepare-rea-payload-pe.mjs --map research/extracted/local-oracle/brush-fill-native-code-seed1234-20261004-a/native-code/mapped/native-code-map.json --function BRUSH-FILL --pll research/extracted/aaron/application/AARON.pll --output-dir research/artifacts/rea-tools/brush-fill-static-new
& $reaTools.node research/tools/prepare-rea-payload-pe.mjs --map research/extracted/local-oracle/brush-fill-native-code-seed1234-20261004-a/native-code/mapped/native-code-map.json --function FILL-IRIS --pll research/extracted/aaron/application/AARON.pll --output-dir research/artifacts/rea-tools/fill-iris-static-new
```

The original CLI route below can query the retained static inputs again.
Use a fresh ignored output directory for new logs, preserve the old files,
and apply the host's required scoped native-process permission when needed.
Read [the native workflow](../native-analysis-workflow.md) before new mappings;
live debugger work would require rediscovery and live-byte validation.

```powershell
$reaTools = Get-Content research/artifacts/rea-tools/toolchain-current.json | ConvertFrom-Json
$reaPayloadRoot = (Resolve-Path research/artifacts/rea-tools/deeper-rea-20261012).Path
$env:GHIDRA_INSTALL_DIR = $reaTools.ghidra
$env:JAVA_HOME = $reaTools.javaHome
$env:REA_ANALYSIS_PROVIDER = 'ghidra'
$env:GHIDRA_HEADLESS_MAXMEM = '512M'
$env:REA_GHIDRA_LANGUAGE_ID = 'x86:LE:32:default'
$env:REA_GHIDRA_COMPILER_SPEC_ID = 'windows'

$env:REA_GHIDRA_SEED_FILE = Join-Path $reaPayloadRoot 'zero-edge.seeds.tsv'
& $reaTools.node $reaTools.reaCli function (Join-Path $reaPayloadRoot 'zero-edge.synthetic.exe') 0x1fe03934 --provider ghidra --format json
& $reaTools.node $reaTools.reaCli decompile (Join-Path $reaPayloadRoot 'zero-edge.synthetic.exe') 0x1fe03934 --provider ghidra --format json
& $reaTools.node $reaTools.reaCli xrefs (Join-Path $reaPayloadRoot 'zero-edge.synthetic.exe') 0x1fe03949 --provider ghidra --format json
& $reaTools.node $reaTools.reaCli resolve-native-call-targets (Join-Path $reaPayloadRoot 'zero-edge.synthetic.exe') 0x1fe03946 --provider ghidra --format json

$env:REA_GHIDRA_SEED_FILE = Join-Path $reaPayloadRoot 'brush-fill.seeds.tsv'
& $reaTools.node $reaTools.reaCli function (Join-Path $reaPayloadRoot 'brush-fill.synthetic.exe') 0x1fe1924c --provider ghidra --format json
& $reaTools.node $reaTools.reaCli decompile (Join-Path $reaPayloadRoot 'brush-fill.synthetic.exe') 0x1fe1924c --provider ghidra --format json

$env:REA_GHIDRA_SEED_FILE = Join-Path $reaPayloadRoot 'fill-iris.seeds.tsv'
& $reaTools.node $reaTools.reaCli function (Join-Path $reaPayloadRoot 'fill-iris.synthetic.exe') 0x1fe23b9c --provider ghidra --format json
& $reaTools.node $reaTools.reaCli decompile (Join-Path $reaPayloadRoot 'fill-iris.synthetic.exe') 0x1fe23b9c --provider ghidra --format json
```

## Portable evidence derivation

For a newly prepared input, set `REA_GHIDRA_SEED_FILE` to that new directory's
seed and replace the corresponding PE path in the commands. Dossier output
already contains pseudocode; the separate stock `decompile` commands above
show its reusable access route and were not additional retained executions.

The offline [derivation helper](../tools/derive-rea-payload-analysis-evidence.mjs)
authenticates actual REA Evidence IDs and profile digests with installed 6.4
canonical helpers; validates successful CLI arguments and empty stderr;
checks PE headers, exact payload/PLL/object bytes, seeds and archived entries;
and checks function extents, instruction parity, CFG successors, references,
p-code operation/def-use links and untruncated counts. It binds the installed
package, native addon manifest/hash, relevant CLI/bridge sources, Ghidra and
Java identities, local Node binary and command scripts. It also binds the
tracked builder and checks its independently constructed containers/seeds
against the exact retained analysis inputs. It rereads every
source before writing a fresh ignored output. It does not launch REA/Ghidra
or execute a generated PE.

```powershell
& $reaTools.node research/tools/derive-rea-payload-analysis-evidence.mjs --output research/artifacts/rea-tools/deeper-rea-20261012/portable-evidence-new.json
```

The output contains only metadata, observations and source/projection hashes.
Original PLL bytes, machine-code buffers, full pseudocode and full p-code
graphs remain ignored. The historical REA 3.2.1 toolchain and native evidence
were preserved.

## Next BRUSH-FILL and IRIS work

The retained dossiers make branch blocks and intra-function def-use relations
available for targeted review without another runtime capture. Use BRUSH-FILL's
121 blocks and FILL-IRIS's 92 blocks to select exact branch/call sites, then
relate those sites to already captured metadata constants and behavioral
observations. Treat the 137 and 61 CALL instructions as sites for investigation;
their presence does not identify resolved callees. Runtime dispatch identity,
object mutation and painting behavior still require separate evidence through
the established workflow. This result supports that investigation but adds no
new runtime behavioral or original-source claim.

## IN-SUB-FRAME

The separate [IN-SUB-FRAME findings](in-sub-frame.md) document the exact
mapped payload, the REA 6.4.0 dossier, and its relationship to the natural
VALUE=0 capture. Its portable [evidence JSON](evidence/rea-in-sub-frame-20261012.json)
now binds each ordered predicate row and the complete v6 source closure.
