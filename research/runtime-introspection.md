# Runtime introspection and exactness status

The exact JavaScript engine is unfinished. We can run the archived program
with the documented compatibility probes, read its AA output, and inspect
retained Lisp metadata. The JavaScript scene rules are provisional, and no
controlled whole-painting equivalence test has passed yet.

## Verified evidence

| Report | Original-engine run | Result |
|---|---|---|
| `runtime-census.txt` | [33966375745](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33966375745), artifact `9969556526` | Two completed startup invocations; 2,694 records, 1,347 unique application function bindings |
| `routine-probe.txt` | [33966545590](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33966545590), artifact `9969605928` | Fifteen argument lists obtained; every disassembly attempt reports missing `disasm.fasl` |
| `aaron-seed-loaded.txt` | [33962045540](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33962045540), seeded-trial-1234 artifact `9968241681` | Only the entry marker exists; the seed-installation experiment did not complete |
| `line-metadata.txt` | [33970753206](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33970753206), artifact `9970845639` | All 23 line/brush candidates completed; retained types and argument lists recorded |
| `random-reference.txt` | [33970753206](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33970753206), artifact `9970846142` | 48 short integer/float/RAN vectors completed |
| `random-validation.txt` | [33971190965](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33971190965), artifact `9970968646` | 73 vectors and 6,140 values, including 1,300-call twist-boundary sequences |
| `object-probe.txt` | [33971190965](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33971190965), artifact `9970968767` | Read-only headers for five compiled functions; no writes or disassembly |

Run [33986804721](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33986804721)
completed the bounded `function-constants` probe: 37 candidates and 436
summaries, with DIRECTION unavailable as a closure. The report parser then
rejected a compound array type descriptor; that parser case is now fixed and
tested against the complete report. The line probe completed 30 calls. See the
saved [report excerpts and provenance](introspection/evidence/README.md).

Report SHA-256 values, respectively:

```text
92fde28d071bb314cbd9ba17369f13482317cbf0b967b7acaefe688bedeef334
1fef4edb7d646f6486ead0f92b01fec7db9cd79ee524e8f60290d1d14ccd4fb2
699c849e5b107df44406e76a43725bb11a4b85a563ceefb6d2478f2f339b4535
```

The artifact reports are temporary. The sorted function names and census
provenance are preserved in [function-inventory.json](introspection/function-inventory.json).
The name-only candidate groups used to prioritize the next probes are preserved
in [function-groups.md](introspection/function-groups.md); they are deliberately
not treated as evidence of call order or implementation.
This inventory counts own symbols in `COMMON-GRAPHICS-USER` with `FBOUNDP`
true. It includes generated accessors and host/UI routines. It is not a count
of recovered algorithms, successfully invoked functions, or ported functions.
The two loads produced identical name sets and must not be counted twice.

## Argument lists retained in this build

| Package | Function | Arguments |
|---|---|---|
| EXCL, internal | `MAKE-RANDOM-STATE-FROM-SEED` | `(SEED)` |
| EXCL, internal | `NEW-RANDOM-FLOAT` | `(STATE)` |
| EXCL, internal | `NEW-RANDOM-FIXNUM` | `(NUMBER STATE)` |
| COMMON-LISP, external | `RANDOM` | `(NUMBER &OPTIONAL STATE)` |
| COMMON-GRAPHICS-USER, internal | `INIT-RANDOM` | `()` |
| COMMON-GRAPHICS-USER, internal | `SET-RANDOM` | `()` |
| COMMON-GRAPHICS-USER, internal | `GET-RANDOM` | `()` |
| COMMON-GRAPHICS-USER, internal | `RAN` | `(A B)` |
| COMMON-GRAPHICS-USER, internal | `KCAT-CURRENT-DAY-TIME` | `()` |
| COMMON-GRAPHICS-USER, internal | `SET-FILE-ADDRESSES` | `()` |
| COMMON-GRAPHICS-USER, internal | `SET-UP-SCREEN-SIZE` | `()` |
| COMMON-GRAPHICS-USER, internal | `SELECT-CANVAS` | `(SIZE)` |
| COMMON-GRAPHICS-USER, internal | `SCRIPT` | `(PLAN)` |
| COMMON-GRAPHICS-USER, internal | `SELECT-BRUSH` | `(COUNT)` |
| COMMON-GRAPHICS-USER, internal | `BRUSH-STROKE` | `(PATH VALUE CDEX SDEX)` |

The table omits package prefixes on parameter symbols for readability.
Names and argument lists establish callable interfaces, not parameter types,
side effects, valid inputs, or behavior. `EXCL::RANDOM-INT` exists as a symbol
but has no function binding in the census.

The line metadata probe adds retained signatures for `FOLLOW`, `WIGGLE`,
`LOCK-WIGGLE`, `PREP-LINE`, `HOP-OR-DRAW`, `PARSE-HOP`, `PARSE-P-HOP`,
`DIRECTION`, `ANGLE-DIF`, `ANGLE-RANGE`, `RESET-RANGE`, `FROM-ANGLE`,
`TO-ANGLE`, `RAN-HAND`, `RECORD-BRUSH`, `MAPLINE`, `LINE-MAPPING`,
`DRAW-CFORM`, `BRUSH-FILL`, and `BRUSH-FILL-SUBPART`. The complete table and
interpretation questions are in [freehand-line.md](freehand-line.md).

## Corrections that affect the next experiment

1. **Seed installation was never demonstrated.** The old `seed-1234.cl`,
   `seed-1234-repeat.cl`, and `seed-5678.cl` use the single-colon spelling
   `excl:make-random-state-from-seed`. The symbol is internal, so the reader
   fails before the surrounding handler can run. An entry marker written by
   an earlier top-level form is insufficient evidence of installation. These
   historical probes are invalid controls and must not be used to infer
   reseeding from different painting hashes. Their jobs have been removed
   from the local workflow; the old scripts remain as records of the failed
   attempt. The replacement is `random-reference.cl`.
2. **The random globals are different types.** At census time,
   `COMMON-LISP:*RANDOM-STATE*` is a RANDOM-STATE object;
   `EXCL::*INTERNAL-RANDOM-STATE*` is a BIGNUM. Never set both to the same
   object. `?RSEED?` is present but unbound at this startup checkpoint.
3. **The build flag is numeric at startup.** `*BUILD-PREMIUM*` is integer `0`.
   The earlier hook's assignment of `T` does not establish its intended
   semantics or prove when licensing decisions occur.
4. **A bound function can still depend on an absent module.** `DISASSEMBLE`
   attempts to autoload `disasm.fasl`, which is absent. Its failure was caught;
   the workflow completing successfully does not mean disassembly succeeded.
5. **The size rule remains unresolved.** Initial compact screen variables
   are 640 and 480. Three modified-size samples used half the requested
   width, but ordinary compact corpora contain both 320 and 640 widths.
   Recover `SELECT-CANVAS` before presenting width halving as universal.

## Follow-up probe results

Publishing resumed successfully at commit `4046acf`, whose repository tree
matches local commit `cca7a5c`. The previously queued changes are on the
`reverse-engineer-aaron-js` branch. Subsequent targeted jobs validate the angle
rules at boundaries and inspect generic-function methods without invoking them.

- `object-probe.cl` obtained safe memory-helper signatures and 64-byte
  read-only headers for `INIT-RANDOM`, `SET-RANDOM`, `GET-RANDOM`,
  `SET-UP-SCREEN-SIZE`, and `SELECT-CANVAS`. The headers are retained evidence,
  not decoded machine code; the missing disassembler still prevents a
  source-level reconstruction.
- `random-reference.cl` and `random-validation.cl` produced the numeric vectors
  documented in [random-findings.md](random-findings.md). The JS parity tests
  compare all 6,140 validation values.
- `line-validation.cl` supports the measured MOD, NORM-A, ANGLE-DIF, and
  ANGLE-RANGE implementations. Tests match 218 double observations and 20
  angle-range calls, including 96 new arithmetic holdouts.
- `generic-methods.cl` recovered metadata for eight candidates after replacing
  the unavailable LOOP macro. WIGGLE and SCRIPT appear to be slot accessors;
  their names alone should no longer make them primary algorithm candidates.
- `ran-float.cl` measured all four floating RAN signatures. JavaScript matches
  512 values and 64 subsequent random-state observations, including the
  no-consumption equal-endpoint case. The implementation is published at
  [17dc646](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/commit/17dc646da7c84111fad03346a256a5ff08865ead).
- `line-metadata.cl` completed all 23 candidates. It deliberately records
  metadata only; no drawing routine was invoked.

No FLA point sequence or whole-painting equivalence has been recovered yet.
Full generator equivalence still requires matching random draw order, planning,
geometry, colour, and emission.

The next report can be converted without evaluating Lisp:

```sh
node research/tools/parse-function-constants.mjs /path/to/function-constants.txt \
  https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/RUN_ID \
  > research/introspection/function-constants.json
node --test research/tools/test/function-constants.test.mjs
```

The parser accepts only the probe's checkpointed summary records, preserves
the original report hash, and rejects truncation or unsupported values.

The broad corpus matrix is manual-only. Routine research changes run targeted
introspection jobs rather than regenerating the large corpus.

## Reproduce the saved inventory

From the repository root, using the downloaded report:

```sh
node research/tools/summarize-runtime-census.mjs /path/to/runtime-census.txt \
  https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33966375745 \
  > research/introspection/function-inventory.json
node --test research/tools/test/runtime-census.test.mjs
```

The parser rejects partial invocations, malformed records, duplicate names
within one enumeration, reported errors, and differing inventories between
loads. It records the original report's hash, including its original line
endings. Its tests validate evidence handling; they do not test the generator.
