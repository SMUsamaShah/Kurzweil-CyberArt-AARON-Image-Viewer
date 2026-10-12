# ZERO-EDGE explicit holdouts (2026-10-12)

## Scope and result

Two post-`MAIN` batches directly called the compiled `ZERO-EDGE` on 39 bounded
scratch-map inputs. The call target was not wrapped. Each call received a fresh
`START` and scratch map; original RNG and application state were not reset. The
frozen input spec records no expected outcomes, so these are observations for
the listed inputs, not completion gates for generated pictures or a general
`ZERO-EDGE` contract.

| Batch | Ordinals | Observed results | `START.Z` changed |
| --- | ---: | --- | ---: |
| `base-v1` | 1–33 | 25 proper `CONS` paths (five points each), 8 `NIL` | 3 |
| `ring-v1` | 34–39 | 2 proper `CONS` paths (21 points each), 4 `NIL` | 6 |

The base set includes zero maps at 1×1 and 2×3; centered cardinal starts on
5×7 and 7×5 maps; relocated directions on 9×11 maps; and mirrored 7×7 starts.
The last three 7×7 cases set the first neighbor `(4,3)` to 0, 1, and 15.
Their complete input records are in the frozen
[`zero-edge-holdout-cases-20261012.json`](zero-edge-holdout-cases-20261012.json).

The six ring cases use a 9×11 UBYTE4 scratch map with `START=(2,2,z)`. Cells at
`x=2` or `x=6`, `y=2..8`, and `y=2` or `y=8`, `x=2..6`, are zero; every other
cell is one. For direction 0, `PERIM=18` returns `NIL`, while `PERIM=19` and
`20` each return a proper 21-point path; all three finish with `START.Z=4`.
For direction 2, all three perimeters return `NIL` and finish with `START.Z=0`.

All 39 cases reached their own `CASE-END`; both batches recorded `INSTALL`,
`READY`, `COMPLETE`, and `END`, with no observer errors or target conditions
and no overflow. The original fill and patch maps retained their identities and
all 829,440 cells each matched the immutable pre-call snapshots. All seven
monitored bindings (`START`, `XINCS`, `YINCS`, `FILL-MAP`, `PATCH-MAP`,
`*PIC-WIDE*`, and `*PIC-HIGH*`) matched the after-`MAIN` baseline at each
boundary. Copied three-draw RNG previews stayed `(59, 29, 74)` before and after
calls; this is not a full RNG-state proof.

## Runs and source hashes

Timestamps below are copied from each archived `summary.json` and use the
recorded `+01:00` offset.

| Run | Started → finished | Probe and archived report |
| --- | --- | --- |
| `zero-edge-holdout-control-seed1234-20261012-s` | `06:36:01.1334209` → `06:36:42.223611` | Fresh uninstrumented before-control; no probe report |
| `zero-edge-holdout-base-seed1234-20261012-t` | `06:55:16.9063548` → `06:56:01.8609951` | [`base report`](../extracted/local-oracle/zero-edge-holdout-base-seed1234-20261012-t/capture/aaron-zero-edge-holdout-base-v1.txt): 618,609 bytes, 2,643 lines, SHA-256 `970792f97a7525239870fce1cea12f135872b54ace619b330c92eb912466b426` |
| `zero-edge-holdout-ring-seed1234-20261012-u` | `06:59:01.8917458` → `06:59:36.6555829` | [`ring report`](../extracted/local-oracle/zero-edge-holdout-ring-seed1234-20261012-u/capture/aaron-zero-edge-holdout-ring-v1.txt): 147,467 bytes, 537 lines, SHA-256 `c188a9710bd573c905c5797014a9a47603a95dc501eb5cbdddfe8d2c925532b7` |
| `zero-edge-holdout-control-after-seed1234-20261012-v` | `07:03:26.6048819` → `07:04:01.3686982` | Fresh uninstrumented after-control; no probe report |

The frozen input spec is 49,758 bytes, SHA-256
`25d70f8ea33dd87ba9e92e14120114c40f542bcaba8225452424a0f6a1b95c72`. It binds
the runner `research/oracle/run-local-scene-state-required-probe.ps1` at 27,295
bytes, SHA-256
`1fe4546ea847bd31b28b2bcbab6228356b7f44ea8d61bde006ccbad58c788ec9`. Source
probes are:

| Probe | Bytes | SHA-256 |
| --- | ---: | --- |
| [`zero-edge-holdout-base-v1.cl`](zero-edge-holdout-base-v1.cl) | 87,918 | `32418d4629c678a0248efb4168838175f4049890c7e46ce033396544db61ea8b` |
| [`zero-edge-holdout-ring-v1.cl`](zero-edge-holdout-ring-v1.cl) | 86,547 | `070d7881ba88657ee70db5ea77e11e72eed003f1610f4be3610fc8e687bdf577` |

These four captured output files are byte-identical across the before control,
both holdout runs, and the after control:

| Capture | Bytes | SHA-256 |
| --- | ---: | --- |
| `aa0` | 426,587 | `405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a` |
| `image` | 424,205 | `457793c43166f822d8ded53b1570c8cdc1b7db9da794425344b8669b0d8b5e8e` |
| `image-id` | 3 | `13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354` |
| `aaron-scene-state-snapshot.txt` | 25,959 | `153374c2b52a86ca31e33c7102385d2a7c5c88267b50bcfa4947a608eb984ed3` |

## Frozen evidence and JavaScript comparison

The strict source-bound derivation is
[`../tools/derive-zero-edge-holdout-evidence.mjs`](../tools/derive-zero-edge-holdout-evidence.mjs),
126,698 bytes, SHA-256
`cd6139513bad204aba646c7302c103697c3146f057bb9171e41feead25b4d508`. Its
published portable output is
[`evidence/zero-edge-holdout-20261012.json`](evidence/zero-edge-holdout-20261012.json),
923,843 bytes, SHA-256
`666ac6bee2b88b72b3db2a85eb89a5b360c2d8fc2eb78be4858f15bbddb701ce`. The
source manifest contains 403 source-hash entries. The derivation revalidated
the prior 285-source matrix closure and 56-source native baseline closure.
Independent root and agent derivations produced byte-identical JSON.

The derivation also confirms that the four drawing/scene captures, `AARON.exe`,
`AARON.pll`, and all 12 runtime application files are byte-identical across
before-control `s`, base `t`, ring `u`, and after-control `v`.

[`engine/src/aaron-zero-edge.js`](../../engine/src/aaron-zero-edge.js) is a
bounded model validated against these captured inputs and outputs. The module
is 6,271 bytes, SHA-256
`2c22491a57cdb5e2ba6f3f397ce400cfe7782550f7e9baecbd1d6d04ad51bf55`; the
portable-evidence comparator is 8,535 bytes, SHA-256
`663c8b65266201c68b04ee2364ee749675bbbecb4af5141f93bb236c5f35bc90`.

| Evidence compared | Cases | JS arrays | `null` | Returned points | `START.Z` mutations | Map changes | Mismatches |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Prior q-matrix plus holdouts | 199 | 95 | 104 | 511 | 61 | 0 | 0 |
| Holdouts only | 39 | 27 | 12 | 167 | 9 | 0 | 0 |

For the holdouts, all 39 recorded scratch maps remain unchanged. Non-`NIL`
returns are represented as JavaScript arrays whose tail is the exact supplied
`START` object. This validates the bounded model for the listed captures; it
does not recover native cons-cell representation, intermediate helper call
order, natural callers, full RNG purity, wider inputs, or general traversal or
generator parity. The comparator consumes portable evidence and checks the
model against its recorded cases; it does not independently rederive the raw
source closure.

## Reproduce derivation and comparison

[Source-bound JS comparison evidence](evidence/zero-edge-js-comparison-20261012.json)
is 101,076 bytes, SHA-256
`4e93422174d4c92e27c9316ac12fb9dc585b3a300f5ba586d933f6d6530c6b28`.
It binds the module, comparator, generation/derivation helpers and both
portable inputs, revalidates the 403-source closure, and reruns both
comparisons after reproducing both published input JSON files byte-for-byte.
Independent generated outputs are byte-identical. Its
[generator](../tools/derive-zero-edge-js-evidence.mjs) is 10,177 bytes,
SHA-256 `a18e2350c23ac97ea39d87d32c2fc6905e614ec776c1b87720459c36a8fa79f8`.

```powershell
node research/tools/derive-zero-edge-js-evidence.mjs `
  --output research/extracted/local-oracle/zero-edge-holdout-ring-seed1234-20261012-u/zero-edge-js-proof-new.json
```

Use a fresh ignored output filename; the generator refuses an overwrite.

From the repository root in PowerShell, these commands create unique outputs
under the ignored ring-run directory. The derivation helper refuses an output
outside that run, a path that is not ignored, or an existing file. It reads the
archived evidence and does not run the oracle.

```powershell
$runRoot = 'research/extracted/local-oracle/zero-edge-holdout-ring-seed1234-20261012-u'
$tag = [guid]::NewGuid().ToString('N')
$derived = Join-Path $runRoot "zero-edge-holdout-derived-$tag.json"
$comparison = Join-Path $runRoot "zero-edge-holdout-comparison-$tag.json"

node research/tools/derive-zero-edge-holdout-evidence.mjs --output $derived
if ($LASTEXITCODE -ne 0) { throw 'Strict holdout evidence derivation failed' }
$derivedFile = Get-Item -LiteralPath $derived
$derivedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $derived).Hash.ToLower()
if ($derivedFile.Length -ne 923843 -or $derivedHash -ne '666ac6bee2b88b72b3db2a85eb89a5b360c2d8fc2eb78be4858f15bbddb701ce') {
  throw 'Derived evidence differs from the frozen portable output'
}
if (Test-Path -LiteralPath $comparison) { throw "Refusing to overwrite $comparison" }

$report = & node research/tools/compare-zero-edge-evidence.mjs `
  research/introspection/evidence/zero-edge-input-matrix-20261012.json `
  $derived
if ($LASTEXITCODE -ne 0) { throw 'ZERO-EDGE evidence comparison failed' }
$report | Set-Content -LiteralPath $comparison -Encoding utf8
Get-Content -LiteralPath $comparison
```

The comparison command checks the prior 160-case matrix and freshly derived
39-case holdouts together (199 cases total). The published holdout evidence
hash above pins the independently reproduced portable JSON.
