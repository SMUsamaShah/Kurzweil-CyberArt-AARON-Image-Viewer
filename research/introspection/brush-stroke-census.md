# Natural BRUSH-STROKE census

## Measured complete runs

The natural census records each completed `BRUSH-STROKE` call during a full
scene run. Both instrumented runs completed with zero observation errors,
aborts, overflow, or active calls. Each was paired with a fresh uninstrumented
run using the same seed and mode; the actual AA0 files and actual scene-report
files were compared byte for byte.

| Seed / mode | Strokes | `VALUE=0` | `VALUE=3` | Clears | Screen calls | Empty / singleton / multi path |
|---|---:|---:|---:|---:|---:|---:|
| 1234 / `writer-stream-seed-1234` | 1,426 | 1,403 | 23 | 23 | 1,403 | 629 / 2 / 795 |
| 5678 / `writer-full-seed-5678` | 2,455 | 2,408 | 47 | 47 | 2,408 | 1,420 / 2 / 1,033 |

The path column classifies the observed list length only. In both runs, every
`VALUE=0` call had one counted `SCREEN-AND-STORE` call, while every `VALUE=3`
call had none. These are per-call counts; the census does not preserve
SCREEN-AND-STORE order relative to other work.

Each stroke returned one value. For seed 1234 the return descriptors were 629
`NIL` and 797 objects of type `CONS`; for seed 5678 they were 1,420 `NIL` and
1,035 `CONS`. In both captures, empty paths returned `NIL`, while the observed
singleton and multi-point paths returned `CONS`. These are observations in
these two scenes, not general rules about empty or nonempty paths. In
particular, the natural `VALUE=0` empty/singleton observations differ from the
older dependency-isolated adapter cases. This census does not capture the map,
so it cannot resolve the corresponding write behavior.

### Path and return observations by value

| Seed | Value | Calls | Empty | Singleton | Multi | Return descriptors | Screens per call |
|---|---:|---:|---:|---:|---:|---|---|
| 1234 | 0 | 1,403 | 629 | 2 | 772 | 629 `NIL`, 774 `CONS` | one each |
| 1234 | 3 | 23 | 0 | 0 | 23 | 23 `CONS` | none |
| 5678 | 0 | 2,408 | 1,420 | 2 | 986 | 1,420 `NIL`, 988 `CONS` | one each |
| 5678 | 3 | 47 | 0 | 0 | 47 | 47 `CONS` | none |

The return parser retains only `NIL`, integer values, or object type names.
It does not retain returned-object identity or contents.

### Brush-list positions and predicate counts

`BRUSH` records join to the position returned by `POSITION` in
`ALL-BRUSHES`; these indices are not asserted to be the `PAINT-BRUSH` `ID`
slot. The capture stores the complete ordered integer-pair `CORE` list the
first time each brush object is seen. These are first-seen snapshots, not
proof that a brush kept the same mask throughout the run.

| Seed | `ALL-BRUSHES` index | Calls (`VALUE=0` / `VALUE=3`) | First-seen `CORE` pairs |
|---|---:|---:|---:|
| 1234 | 1 | 960 (943 / 17) | 9 |
| 1234 | 2 | 168 (165 / 3) | 21 |
| 1234 | 3 | 76 (75 / 1) | 61 |
| 1234 | 4 | 54 (53 / 1) | 97 |
| 1234 | 5 | 168 (167 / 1) | 182 |
| 5678 | 1 | 2,140 (2,097 / 43) | 9 |
| 5678 | 2 | 125 (123 / 2) | 21 |
| 5678 | 4 | 190 (188 / 2) | 97 |

Only indices shown occurred in that run. The census does not report `PERIM`
coordinates, ordered path coordinates, or candidate-cell coordinates, so
predicate totals or ratios cannot establish `PERIM` use or per-offset
coverage.

| Seed | Natural predicate calls, global | Calls during strokes | Accepted / rejected results during strokes | Calls outside active stroke wrappers |
|---|---:|---:|---:|---:|
| 1234 | 1,694,383 | 1,620,491 | 1,599,080 / 21,411 | 73,892 |
| 5678 | 791,037 | 783,819 | 775,338 / 8,481 | 7,218 |

These are natural `IN-SUB-FRAME` call and return counts. “Accepted” and
“rejected” describe its first returned value, not unique cells or verified
array writes. Global counters include calls made outside an active
`BRUSH-STROKE` wrapper; they are therefore larger than the within-stroke
totals. The observed `CLEAR-FILL-MAP` totals are not joined to particular
stroke coordinates.

## Capture acceptance and provenance

The frozen source is
[`brush-stroke-census-capture.cl`](brush-stroke-census-capture.cl), SHA-256
`6f487f3dbbf0b6e81043f80926cd2c159d9721455cc5cc94763723bb73ca6aa5`. The
derivation checks that both staged copies are byte-identical to this source,
that the request and run summary carry this same hash, and that each request
names its own run ID and runtime under that run's `runtime` directory. Both
requests use a zero-second pause and request only
`aaron-brush-stroke-census.txt`. The controls contain no pre-scene probe
request, staged probe, or census tape.

| Seed | Observed / control roots | Observed census SHA-256 | AA0 SHA-256 (both runs) | Scene-report SHA-256 (both runs) | AA0 / scene bytes |
|---|---|---|---|---|---:|
| 1234 | `brush-stroke-census-seed1234-20261005-a` / `brush-stroke-census-control-seed1234-20261005-b` | `8c5ffe5fc969df12fadfbb4e79c6710d386ff3e3a1404be7e9e4f06042a57015` | `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1` | `a2f17602ba33d0ac1b80544c1a70c0ae657c60dad9110c075f9ce43b21e8b415` | 126,956 / 25,951 |
| 5678 | `brush-stroke-census-seed5678-20261005-c` / `brush-stroke-census-control-seed5678-20261005-d` | `cf183ccd981267157a1a4b49665b7415dd399609408c215324398949046ddced` | `0ab08c23b241edd0f877c836e4f42fb0497108b8def8c32541ce165157563086` | `e3cc50bef1636328f94e6b002271a663668740f16f3c5b2677a7aa5813008053` | 158,833 / 25,472 |

The derivation verified those hashes against the actual captured AA0 and
scene-report bytes before comparing each pair. Both pairs match byte for byte.
The observed requests name the fixed release file
`C:\temp\aaron-native-code-release.txt`. The 1234 run used
`writer-stream-seed-1234`; the 5678 run used
`writer-full-seed-5678`. All four runs have `smallImage=false` and matching
installer, registry-patch, and license-patch hashes as recorded in their run
summaries.

The [portable JSON derivation](evidence/brush-stroke-census-20261005.json)
binds each raw census, request and summary hash,
the accepted output hashes, and the complete parsed call array through its
count, canonical JSON UTF-8 byte length, and SHA-256. It retains all group
aggregates and counters, plus one explicitly labeled first-call sample for
each observed `VALUE` and path-kind pair; the samples are not the complete call
list. The full call rows can be reconstructed by parsing the source-bound raw
tape. The derivation's source closure includes the frozen capture probe, this
parser, the derivation script, and the shared image-hash and finite-Lisp-record
parser helpers. Full runtime files and raw reports remain in ignored
local-oracle run roots.

Reproduce the derivation with a fresh output path:

```text
node research/tools/derive-brush-stroke-census-evidence.mjs \
  research/extracted/local-oracle/brush-stroke-census-seed1234-20261005-a \
  research/extracted/local-oracle/brush-stroke-census-control-seed1234-20261005-b \
  research/extracted/local-oracle/brush-stroke-census-seed5678-20261005-c \
  research/extracted/local-oracle/brush-stroke-census-control-seed5678-20261005-d \
  <fresh-output.json>
```

The strict parser requires complete framing, the declared caps and install
order, all calls paired in sequence, complete brush CORE pairs, and normal
completion with zero errors, aborts, overflow, or active work. The
`checks` count compares copied random-state previews around the observer's
pre-call reads; it is not evidence that original drawing functions consume no
randomness.

## Scope

This census does not capture `FILL-MAP` contents or write history, caller
stacks, per-event ordering, screen-call ordering, or returned object identity.
It cannot prove that a predicate acceptance became an array write, link a
particular value-3 cell to a later clear, or prove a direct caller. Those
require separate natural map and call-boundary evidence.
