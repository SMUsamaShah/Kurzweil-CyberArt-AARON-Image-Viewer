# Original-engine report excerpts

These reports are extracted from GitHub job logs for run
[33986804721](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33986804721),
commit `4046acfe27080d30b4a2d1caa7c2374151bfc508`.

| Report | Job ID | Artifact ID |
|---|---:|---:|
| `line-behavior-33986804721.txt` | 101361790985 | 9975418644 |
| `function-constants-33986804721.txt` | 101361790910 | 9975414360 |
| `object-probe-33986804721.txt` | 101361790871 | See run artifacts |

Each file preserves the text between its BEGIN/END checkpoints after removing
GitHub timestamp prefixes and normalizing line endings to LF. These are not
byte-identical copies of the Windows files; any hashes computed here identify
the normalized excerpts. No source reconstruction or executable bytes are
included beyond the bounded object headers previously collected by the probe.

The constant probe completed all 37 candidates with 436 summaries. Its CI job
failed in the subsequent JavaScript parser because array type descriptors were
not supported. The raw evidence was uploaded successfully. The parser now
accepts the observed array descriptors, and a regression test parses this
complete report. Constants of generic functions describe dispatch machinery;
they do not reveal the bodies of the methods. The next probe inspects methods.

The line probe has 30 completed calls, including the intentional reversed-RAN
error case. RAN was not seeded in that probe; its numeric outputs are not
deterministic reference vectors. DIRECTION returned NIL for all nine calls.
ANGLE-DIF and ANGLE-RANGE produced numeric results, but the independent boundary
validation must complete before claiming their reconstruction.

## Independent validation run

The `*-33987111580.txt` excerpts use the same timestamp-removal and LF
normalization for run
[33987111580](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33987111580),
commit `c60f3db9661c9a8f43a7cb40e057eb5e1f1eb7db`:

- `line-validation`: job 101362631581, 108 completed numeric calls.
- `function-constants`: job 101362631648, 38 candidates and 439 summaries.
- `generic-methods`: job 101362631452, errors for all nine candidates.

All jobs completed; the method job's completion does not establish successful
method inspection. The constant parser now succeeds in Windows as well as
locally. ANGLE-RANGE is implemented and matches both saved line reports; see
[`angle-findings.md`](../../angle-findings.md).

`line-validation-33987402462.txt` comes from job 101363409339 in run
[33987402462](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33987402462),
commit `69a8c986f0f357da76a3abee2702c77fadbcdd49`. It adds 19 direct MOD calls
to the previous validation cases and uses the same excerpt normalization.
The generic-method job in that run failed to complete; its log exposed an
attempt to autoload the missing `loop.fasl` from the probe's LOOP macro.

## Holdout and successful method inspection

The `*-34001269267.txt` excerpts are from commit
`ae4df59c427c266f271efc54183a86e7c1b1e152`, run
[34001269267](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34001269267).
They use the same log-excerpt normalization:

| Report | Job ID | Artifact ID |
|---|---:|---:|
| line-validation | 101400449701 | 9979555086 |
| generic-methods | 101400449796 | 9979554973 |

All 96 fresh arithmetic holdout calls match the existing JS implementation
exactly. Method inspection succeeds for eight candidates after replacing the
unavailable LOOP macro. SELECT-BRUSH remains a reported PROGRAM-ERROR. No
drawing method is invoked by that probe.

## Seeded floating RAN

`ran-float-34001498369.txt` is from commit
`404f91d6da89af72d5ca3d95909a3c040a62d280`, run
[34001498369](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34001498369),
job 101401061007, artifact 9979617529. It uses the same timestamp-removal and
LF normalization. The probe completed without errors: 64 groups each contain
eight RAN values and one following RANDOM value. The JS regression test matches
all 512 RAN values and all 64 subsequent state observations exactly, including
equal and reversed bounds. See [`random-findings.md`](../../random-findings.md).

## Exact method selectors

`generic-methods-34001927057.txt` is from commit
`752f7bff3ad26040fdeffaa0dd59550bac4df7e9`, run
[34001927057](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34001927057),
job 101402207455, artifact 9979738365, with the same excerpt normalization.
All eight generic candidates and three direct candidates complete without
errors. The report resolves the EQL selectors:

| Function | Selectors |
|---|---|
| PREP-LINE | NIL, plus the AARGB and INTEGER class specializations |
| MAPLINE | YPRIME, XPRIME, DIAG, HOZ, VERT |
| LINE-MAPPING | COMMON-GRAPHICS:DRAW, COMMON-GRAPHICS-USER::SKETCH |
| BUILD-FIGURE | SIT-POSE, TL-POSE |
| GENERATE-PERSON | DIETLIND, JOHNDOE, JANEDOE |

SELECT-BRUSH is an ordinary compiled function with ALL-BRUSHES, ENVIR, and ID
constants; its earlier generic-method inspection error was a probe mismatch.
MAKE-TWOPT takes X and Y. SCORE-MAP is generic, so its direct constant report
again describes dispatch machinery. These are callable-interface findings,
not recovered figure or rasterization algorithms, and do not prove a hidden
gallery mode.

## Initial point calls

`point-behavior-34002072931.txt` is from commit
`8a8b3b46b7b3d7646aa3eec84f36bf8db5a0db37`, run
[34002072931](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34002072931),
job 101402605665, artifact 9979780554, with the same excerpt normalization.
XYDIST completes all 48 calls (12 input pairs repeated across four seeds).
All 48 LOCK-WIGGLE groups report PROGRAM-ERROR. The handler covers both the
call and coordinate extraction, so this result does not yet localize the
failure. Random state advances before the error. Do not treat these as
successful point-sequence measurements. `point-shape.cl` separates the return
checkpoint from bounded shape inspection to resolve that ambiguity.
