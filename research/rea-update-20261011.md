# REA update, 2026-10-11

## Installed and checked

The latest fetched REA main is commit
`b777e5d4d8a7b60edad7d5c0eaa56408a4b3f610`, under ignored
`research/artifacts/rea-tools/rea-source-20261011/`. The published npm release
`rea-agents@6.4.0` is installed separately under `rea-6.4.0/`, with lifecycle
scripts disabled. Its registry and lockfile integrity is:

```text
sha512-Vj1zWfSlna5bphGoaoI/TcVBuYvze9u+OyPC3Shz8YkBqaCTqB4COnnRoX7XDwMpwI24ZlFEel2yEj0k8LTWEQ==
```

The bundled Windows x64 native module has SHA-256
`c4fd9f377e567bcf15ba3fec3e0b0ed965d82b765a2adcdac49e46f14524b6d5`,
matching its package manifest. Node 24.19.0, Ghidra 12.1.4 and the existing
full Temurin JDK 21.0.12.1+1 were used.

`toolchain-current.json` records the new local paths. The historical
`toolchain.json` and REA 3.2.1 remain intact: existing canonical evidence and
derivation helpers bind those exact files. Both records are ignored local
tooling, so inspect them when resuming on this machine.

## Actual checks on this host

The logs are under ignored
`research/artifacts/rea-tools/verification-6.4.0-20261011-a/`.

| Check | Observed result |
|---|---|
| `rea --version` | `6.4.0` |
| `rea doctor --provider ghidra --json` | Exit 0; healthy; all ten required checks pass, including Windows native authority |
| `rea inspect AARON.exe --provider ghidra --format json` | Exit 0; native x86 PE; 226 procedures, 209 strings, six segments |
| Source EXE before/after | Unchanged SHA-256 `348e88f145f47adfa12a83cded6cff56b57d88e9f11d1d3a94fa48f52a19305d` |
| `rea inspect zero-edge.native-payload.bin --provider ghidra --format json` | Exit 1; `target_unavailable`, reason `unsupported binary format` |

These were static analysis commands. They did not run AARON or recover its
Lisp source. The launcher inventory is a provider check, not an inventory of
the named drawing functions stored in AARON's PLL/DXL images.

The first default-sandbox doctor reported Java unavailable. The same paths
passed with scoped execution permission; no Java reinstall or global
configuration change was needed. Read individual provider checks instead of
interpreting a broad doctor result's missing optional integrations as a
Ghidra failure.

## Useful changes and remaining boundary

Published 6.4.0 supports native x86 PE applications and DLLs on Windows,
removing the old x86-64-only admission restriction. It also includes Ghidra
language/compiler selection and analysis seeds:

```powershell
$env:REA_GHIDRA_LANGUAGE_ID = 'x86:LE:32:default'
$env:REA_GHIDRA_COMPILER_SPEC_ID = 'windows'
$env:REA_GHIDRA_SEED_FILE = 'D:\absolute\path\to\seeds.tsv'
```

A seed line is `address<TAB>kind[<TAB>name]`, with kind `function`, `code`,
or `label`. Seeds are caller assertions applied before auto-analysis; they
are not discovered function identities. We have not applied these overrides
or seeds in the launcher check above.

Published 6.4.0's Windows Ghidra provider still admits PE only. Its CLI does
not expose main's later `raw-binary` interpretation. Fetched main also keeps
Windows Ghidra raw imports unsupported. The source and published package both
say 6.4.0, but the fetched commit is later than the published release; do not
infer package capability from main's version string or README alone.

Continue decoding exact named PLL payloads through the established
[standalone Ghidra workflow](native-analysis-workflow.md#2-decode-the-matched-payloads).
That route preserves the measured runtime entry and uses the `windows`
compiler specification. No provider guard was removed.

## Reuse

```powershell
$reaTools = Get-Content research\artifacts\rea-tools\toolchain-current.json | ConvertFrom-Json
$env:GHIDRA_INSTALL_DIR = $reaTools.ghidra
$env:JAVA_HOME = $reaTools.javaHome
$env:REA_ANALYSIS_PROVIDER = 'ghidra'
$env:GHIDRA_HEADLESS_MAXMEM = '512M'
& $reaTools.node $reaTools.reaCli doctor --provider ghidra --json
& $reaTools.node $reaTools.reaCli inspect research\extracted\aaron\application\AARON.exe --provider ghidra --format json
```

Upstream references: [6.4.0 changelog](https://github.com/morluto/rea/blob/main/CHANGELOG.md),
[Windows Ghidra boundary](https://github.com/morluto/rea/blob/main/docs/windows-ghidra-p0.md),
[release versus main](https://github.com/morluto/rea/blob/main/docs/installation.md#released-package-and-main).

The former hourly automation `continue-aaron-reverse-engineering` is absent;
the app confirmed `not_found` when fulfilling the earlier stop request. This
manual continuation did not restart it.
