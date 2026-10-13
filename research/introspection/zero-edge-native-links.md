# ZERO-EDGE compiled-constant reference census, 2026-10-13

## Question and scope

The earlier native dossier listed ZERO-EDGE's constants but did not search
other compiled Lisp functions for references to it. This read-only pre-scene
scan asked which `COMMON-GRAPHICS-USER` compiled-function constant tables
contain the ZERO-EDGE symbol or compiled function object.

The scan enumerates every own-package fbound symbol, then recursively visits
compiled functions found in their constant tables. It is bounded to depth 8,
4096 constants per compiled function and 10,000 unique compiled objects. The
accepted report has complete BEGIN/END records, zero scan errors and zero
truncations. A constant reference is only a static candidate: it does not
prove a call, execution, direct caller, ordering or function behavior.

## Measured result

The scan found 1,347 fbound bindings and inspected 1,380 unique compiled
functions. It recorded one ZERO-EDGE reference:

| Root | Nested-constant path | Constant index | Kind | Interpretation |
|---|---|---:|---|---|
| `BUFFER-HOLE` | none (`NIL`) | 1 | symbol | Candidate reference to the ZERO-EDGE symbol; not a verified call |

ZERO-EDGE itself was present as a compiled function with 12 constants. The
single discovered reference is a symbol constant, not a compiled-function
constant. The result narrows a future caller investigation to `BUFFER-HOLE`,
but does not establish that `BUFFER-HOLE` calls ZERO-EDGE or is used by a
painting.

## Capture and controls

The observer used the source-hashed
`run-local-scene-state-required-probe.ps1` runner in
`writer-stream-seed-1234` mode, with a required terminal report marker. Fresh
no-probe controls bracketed the observer. All runs completed, used the same
verified runtime executable, PLL, installer and patched DLL hashes, and had
matching hashes for six drawing/scene outputs and six staged scene sources.

The actual AA0 header in all three runs was `320 480 148`, despite
`smallImage=false`. Record the dimensions from the AA0 header; the flag alone
does not identify the canvas. These controls are the 320x480 regime and must
remain separate from earlier 768x1080 captures.

The exact observer report has one `REFERENCE` row, `SUMMARY
bindings=1347 compiled-scanned=1380 references=1 errors=0 truncated=0`, and
its own END marker. The portable evidence binds the report, original and
staged probe, runner request, current runner source, runtime manifest and
fresh-control artifacts.

## Evidence and remaining work

The portable report is
[`zero-edge-native-links-20261013.json`](evidence/zero-edge-native-links-20261013.json),
20,581 bytes, SHA-256
`4ccc16f24a05ae263a9081706196746e47574c4d8de7f9b5ba080d1186538652`.
Two independent offline derivations produced identical bytes. The frozen
probe is [`zero-edge-native-links.cl`](zero-edge-native-links.cl); its SHA-256
is `febc636051f44aa3fc2da2edc38cc65b3536ed183c6621d7f9cc2a768fc219e3`.

The next investigation is a natural ZERO-EDGE entry/caller capture. Treat
`BUFFER-HOLE` as a candidate to investigate, not a recovered caller. Rediscover
and validate live addresses before attaching a debugger. This static census
adds no ZERO-EDGE JavaScript contract and does not change the function-coverage
counts in the [progress report](../progress-report.md).
