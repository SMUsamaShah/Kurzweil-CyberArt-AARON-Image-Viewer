# FOOB picture bounds

## Measured rule

For the captured `W=320`, `H=480` picture, `FOOB(x, y)` returned `T` exactly when
`x < 0 || x > W - 1 || y < 0 || y > H - 1`; it returned `NIL` inside the inclusive bounds `x=0..319`, `y=0..479`.

The comparator checked every point in each integer grid (`x=-20..340`, `y=-20..500`), all four typed float pairs with 81 points per pair, and every recorded natural call. For each float type pair, the nine x samples were `-1, -0.5, 0, 0.5, 318.5, 319, 319.5, 320, 320.5`; the nine y samples were `-1, -0.5, 0, 0.5, 478.5, 479, 479.5, 480, 480.5`. Both complete tapes matched the rule with zero mismatches:

| Capture | Integer `T/NIL` | Typed floats `T/NIL` | Natural FOOB calls `T/NIL` | Natural argument types |
| --- | ---: | ---: | ---: | --- |
| Seed 1234, run `a` | 34,481 / 153,600 (188,081 checked) | 260 / 64 (324 checked) | 151 / 63,643 (63,794 checked) | `INTEGER/INTEGER` |
| Seed 5678, run `c` | 34,481 / 153,600 (188,081 checked) | 260 / 64 (324 checked) | 8 / 102,270 (102,278 checked) | `INTEGER/INTEGER` |

The float pairs were `SINGLE-FLOAT/SINGLE-FLOAT`, `SINGLE-FLOAT/DOUBLE-FLOAT`, `DOUBLE-FLOAT/SINGLE-FLOAT`, and `DOUBLE-FLOAT/DOUBLE-FLOAT`, 81 samples each. The two natural traces contain 166,072 calls total; all recorded natural arguments were integer descriptors. Across both captures, 542,882 comparisons passed. This total includes the repeated integer grids and float matrices, rather than that many unique inputs.

Only this picture size and these listed float coordinates were measured; other dimensions and unlisted fractions remain uncharacterized.

## Captures and controls

The frozen producer is [`foob-capture.cl`](foob-capture.cl), SHA-256 `98ee018bae7791bdccf6a4cb675ea81e59710ec81053242d5d203337acf47801`. Each instrumented run summary reports `complete: true`. Each had a fresh, uninstrumented control in the same mode; the raw `capture/aa0` drawing and `capture/aaron-scene-state-snapshot.txt` report matched byte-for-byte within each pair:

| Instrumented run / control | Mode | `aa0` SHA-256 | Scene report SHA-256 |
| --- | --- | --- | --- |
| `foob-capture-seed1234-20261006-a` / `foob-capture-control-seed1234-20261006-b` | `writer-stream-seed-1234` | `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1` | `a2f17602ba33d0ac1b80544c1a70c0ae657c60dad9110c075f9ce43b21e8b415` |
| `foob-capture-seed5678-20261006-c` / `foob-capture-control-seed5678-20261006-d` | `writer-full-seed-5678` | `0ab08c23b241edd0f877c836e4f42fb0497108b8def8c32541ce165157563086` | `e3cc50bef1636328f94e6b002271a663668740f16f3c5b2677a7aa5813008053` |

All four roots are under `research/extracted/local-oracle/`; each run ID in the table is the exact child directory name. The matrix checks reported `EQ` and `EQUALP` true for both `FILL-MAP` and `PATCH-MAP`, including map metadata. Each map has 153,600 elements: 307,200 copied map cells per matrix capture, 614,400 across both captures. `BRUSH` and `SUB-FRAME` binding identities, picture dimensions, and the three-value RNG preview were unchanged by each matrix. Only preview values were recorded: seed 1234 `(28, 58, 78)` and seed 5678 `(72, 53, 16)`; the full RNG state was not captured.

The report parser requires FOOB and MAIN installations, `READY`, complete matrix footers, paired natural `CALL-BEGIN`/`CALL-RETURN` records, zero-error `COMPLETE` counters, and exact `BEGIN`/`END` framing. It does not rely on the run summary's `complete` flag in place of validating the tape. The parser handles only the exact captured ARGLIST line `ARGLIST values=((COMMON-GRAPHICS-USER::X COMMON-GRAPHICS-USER::Y) T)`: it asserts that line, substitutes two local placeholder symbols for the shared Lisp reader, and maps those placeholders back to the exact package-qualified names. This is not a general package-qualified-symbol reader.

## Reproduction and evidence

Run the comparator over either preserved complete tape:

```powershell
node research/tools/compare-foob-capture.mjs research/extracted/local-oracle/foob-capture-seed1234-20261006-a/capture/aaron-foob.txt
node research/tools/compare-foob-capture.mjs research/extracted/local-oracle/foob-capture-seed5678-20261006-c/capture/aaron-foob.txt
```

The source-bound comparison records are in [`evidence/foob-parity-20261006.json`](evidence/foob-parity-20261006.json). The seed 1234 and 5678 report SHA-256 values are `d98f9456e11335c159b5e905861722ca476d11f3c6c505f725ece9cbaccd87b1` and `bcea4ad138f0e6d358f39161581669b84b6f722efeba39dfabc027efe73abd05`.

The retained JSON binds 199 source/artifact files, revalidates the earlier
56-file native record, and compares actual control bytes. Its SHA-256 is
`f49ed710ace8e647e10aeaa28372637e67ba2a712bf59f8b47aa9e2a8e0a9b48`.
Two independent derivations produced byte-identical JSON. Reproduce it into a
fresh ignored path beneath the owned seed-1234 capture:

```powershell
node research/tools/derive-foob-evidence.mjs --output research/extracted/local-oracle/foob-capture-seed1234-20261006-a/foob-derived-new.json
```

Frozen implementation hashes:

- `engine/src/aaron-picture-bounds.js`: `bd021b6304d3f96a6a3004a5d4d87dd044082034438ac6bce954ca1f95aa9762`
- `research/tools/compare-foob-capture.mjs`: `f0033ff2bb4b173ba55059fd8502af314397c3f5dd3619d5efc80a61f029dc38`
- `research/tools/parse-foob-report.mjs`: `d38f135008302aa40a0e824183e79a843ec4a37c9ef03c9fd84daa0ca27ac6a9`

## Scope and limits

Natural FOOB results were captured during each `MAIN` run. These observations do not establish a direct caller. The integer grids, sampled single/double floats, and captured integer/integer natural arguments support the rule above; they do not establish rational, bignum, nonfinite, error, or mixed integer/float parity. The helper's finite-number and positive safe-integer dimension guards are JavaScript adapter policy, not recovered FOOB error behavior. `ZERO-EDGE` remains metadata-only and unresolved; see [the native predicate notes](brush-buffer-predicate-native.md).
