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

`point-shape-34002204114.txt` is from commit
`d73eb8de3e9748cdb69986a587655e4e27bbed1b`, run
[34002204114](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34002204114),
job 101402958139, artifact 9979817113, with the same excerpt normalization.
All three LOCK-WIGGLE calls return successfully. The result is a list of TWOPT
objects, not a single point. This localizes the previous error to our output
extraction. The corrected numeric probe maps coordinates over the returned
list and performs an unmeasured warmup before installing each measured seed.
POL-PT has retained arguments `(PT A D)`.

`point-behavior-34002307774.txt` is the corrected numeric capture, from commit
`3ca84911acc157516cc876ec7a9b15afc9c9d3a6`, run
[34002307774](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34002307774),
job 101403236262, artifact 9979846593. All calls succeed: 48 XYDIST results,
192 LOCK-WIGGLE paths, and 48 subsequent random-state observations. The path
is returned in reverse traversal order and includes the starting point. This
is the first complete point-list capture; formula and bit parity remain to
be established. `point-trace.cl` measures internal RAN/POL-PT arguments with
temporary wrappers and compares outputs/state against an unwrapped baseline.

`point-trace-34002445487.txt` is from commit
`ef3f70f7dbda1324f9ecad9e6a152fa940f67246`, run
[34002445487](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34002445487),
job 101403609503, artifact 9979887826, with the same excerpt normalization.
All 12 wrapped versus baseline comparisons report MATCH T, including returned
coordinates and subsequent RANDOM values. The first RAN(3,5) per group is the
probe's warmup, not an application call. See [`point-findings.md`](../../point-findings.md).

`point-behavior-34015358031.txt` is from commit
`50c27569cf2ffd19c8d581963a76b54fdb0d0e51`, run
[34015358031](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34015358031),
job 101438054549, artifact 9983721472. It adds eight endpoint pairs, giving
320 successful paths and 80 distance/state observations. The initial JS model
failed four repeated distance observations and 22 paths. These holdouts expose
real arithmetic gaps; they are not accepted as approximate passes. The next
trace records trigonometric results and products to localize the differences.

`point-trace-34015537884.txt` is from commit
`fe6ed1e79f88ae4632945ffd3191a18d9775e368`, run
[34015537884](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34015537884),
job 101438520127, artifact 9983769996, with the same excerpt normalization.
All 24 baseline comparisons match. It records 60 trigonometric pairs, including
40 doubles. Seven pairs expose differences in V8's built-in double trig.
The bounded high-precision helper matches all 40 double pairs. After the
distance and trig corrections, tests match all 320 paths and all 80 distance
and subsequent-state observations in the expanded numeric report exactly.

## Stroke references and compact command selection

The `*-34016252902.txt` excerpts come from commit
`22f37285f8509be172e7dcf625cf708363a9d035`, run
[34016252902](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34016252902),
using the same timestamp-removal and LF normalization:

| Report | Job | Artifact |
|---|---:|---:|
| stroke-links | 101440427759 | 9983982197 |
| hop-behavior | 101440427694 | 9983982317 |

The reference scan completes 2,098 object inspections with 28 matches and no
errors; its final names count is invalid because of the SORT/list-head bug
documented in [`stroke-findings.md`](../../stroke-findings.md). All 36 direct
hop calls succeed. SMALL mode declines the tested down-left unit step;
independent validation is pending. LOCK-WIGGLE's detected caller points toward
specialised figure detail rather than proving a general FLA role.

The `*-34016410110.txt` excerpts come from commit
`9b322098d58550ee2fa5dda2b5409c87d81f75f3`, run
[34016410110](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34016410110),
with the same normalization:

| Report | Job | Artifact |
|---|---:|---:|
| hop-validation | 101440841610 | 9984031801 |
| generic-methods | 101440841797 | 9984032480 |

All 150 grid calls succeed, confirming the seven compact direction choices
and the declined down-left unit step at all three new origins. The method
probe resolves all ten STORE-IN-FILE selectors and two SCORE-MAP methods.

`store-behavior-34016651940.txt` is from commit
`9a9efc6f1cdb91d773a768679f89fe2456d5fffd`, run
[34016651940](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34016651940),
job 101441473260, artifact 9984104109. The same normalization is used for
the report. Emitted string-stream characters are captured as numeric codes,
so their LF bytes remain distinguishable from report formatting. All 96
MOVE-TO/DRAW-TO calls succeed and match the JS output/state model; all 96
VECTOR/FILL calls fail with UNBOUND-VARIABLE before output is written.
`store-behavior-34016834286.txt` is from commit
`a1cbfdf6106718daaee3e5e07ccea2187fc7691c`, run
[34016834286](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34016834286),
job 101441969020, artifact 9984157663. This follow-up preserves the same
192 cases and identifies the missing runtime cell for VECTOR/FILL as
`COMMON-GRAPHICS-USER::CONTROLS-VISIBLE`. The next probe binds that Boolean
explicitly while retaining all other controls.

The updated probe records `controls=NIL|T` in each input record, doubling the
matrix to 384 cases. `parse-store-report.mjs` accepts both the older 192-case
capture and this expanded form without treating an omitted controls field as
an observed `NIL` value; `summarize-store-report.mjs` reports the distinction.

`store-behavior-34030806392.txt` is from commit
`927313f6768debdbbf76ffd2988fb07b5def651a`, run
[34030806392](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34030806392),
job 101479826002, artifact 9988530699, with the same normalization.
All 192 MOVE-TO/DRAW-TO calls succeed. All 192 VECTOR/FILL calls fail:
96 PROGRAM-ERROR cases with controls NIL and 96 UNBOUND-VARIABLE cases
with controls T, identifying `COMMON-GRAPHICS-USER::WOFFSET`. Neither
binding of the PLOT variable changes this result. These failures are not
emission parity data. The next metadata probe inspects the PLOT function
and FREE-PATH, which DRAW-CFORM references beside FREEHAND-FLAG.

## Screen isolation and FREE-PATH entry point

These runs use the same timestamp removal and LF normalization:

| Run | Commit | Report | Job | Artifact |
|---|---|---|---:|---:|
| [34031017111](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34031017111) | eb4a9082bec96a56d91e7a9400bd16e7c710daa7 | generic-methods | 101480399684 | 9988601624 |
| [34031149136](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34031149136) | b850b741263d69f28db48dd7af7febb820965f78 | generic-methods | 101480763787 | 9988643132 |
| 34031149136 | b850b741263d69f28db48dd7af7febb820965f78 | store-isolated | 101480764014 | 9988642045 |
| [34031301596](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34031301596) | e9cbcf8eff0d2c641777cb26e6ca7b59b708e0e6 | free-path-behavior | 101481185813 | 9988693186 |
| [34031454178](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34031454178) | 26675089a7f930621925f021583a2c63ab78920f | free-path-behavior | 101481607551 | 9988745693 |

Metadata resolves FREE-PATH(EDGE), PLOT(PTA PTB), POL-VPT(PT A D V) and
MAKE-VISPT(X Y VIS). Attempts to inspect ordinary functions as generics and
globals as functions are recorded failures, not successful method recovery.

The isolated writer report has 240 cases, with one recorded PLOT call each,
216 successful outputs, and 24 VECTOR/NIL-previous PROGRAM-ERROR cases.
The PLOT function is replaced, not forwarded, and `RESTORED T` is required.
The clean-room writer now matches those output bytes and previous-point states,
including the observed two-decimal truncation (`1.125` -> `1.12`,
`-20.375` -> `-20.37`) and signed `-0.00`. See
[stroke-findings.md](../../stroke-findings.md) for the scoped parity claim.

The first two FREE-PATH reports each contain 12 failures before any RAN or
POL-VPT call. The second localizes TYPE-ERROR to the Boolean VIS field:
the datum is NIL or T and the expected type is NUMBER. Both restore the
temporary dependency wrappers. No freehand path was captured in those runs.

`free-path-validation-34031848492.txt` is from commit
`7e591a98327b8529e9ff613ac7388266276d2569`, run
[34031848492](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34031848492),
job 101482699457, artifact 9988778393. It warms dispatch, compares a traced
call with an unwrapped baseline, and restores RAN/POL-VPT/XYDIST. All 16
comparisons report `MATCH T`. Inputs cover horizontal, vertical, diagonal,
double-coordinate, three-point, and VIS values -1, 0, 1, and 2. This validates
the captured point sequences and random state for those inputs, but does not
yet prove every branch of FREE-PATH or the caller's edge-list setup.

## Brush-state census and reader boundary

`brush-metadata-34065878090.txt` is the normalized excerpt from run
[34065878090](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34065878090),
commit `07a25ec5414c61b99b687502a5923005922772f6`, job 101574411630,
artifact 9998916677. It is read-only: the direct startup checkpoint leaves
`BRUSH`, `FILL-MAP`, and the other working cells unbound, while `ALL-BRUSHES`
is a six-element list of `PAINT-BRUSH` objects, `BOUNDARY-VALUE` is 3, and
`PREVDEX` is -1. The shape report intentionally does not expose slot values.

`brush-accessors-34066498538.txt` is the normalized class census from run
[34066498538](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34066498538),
commit `affe001f41bf123c28ce64a1fca5e05713e7dfe3`, job 101576064382,
artifact 9999101114. The first object is a `STANDARD-CLASS` instance of
`COMMON-GRAPHICS-USER::PAINT-BRUSH` with seven slots: `ID`, `ENVIR`, `PERIM`,
`CORE`, `WIDTH`, `RAD`, and `CELLS`. This is a layout finding, not a claim
about initialization or slot semantics.

The later tiny reader probe is preserved in the workflow log for run
[34066996343](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34066996343),
commit `b6f20a352260a4362090ef5f9b07eae60dd38027`, job 101577399905. It
successfully reaches separate top-level checkpoints, calls the existing
`COMMON-GRAPHICS::WIDTH` reader on the first `ALL-BRUSHES` object, and returns
the integer 0. The call used no `SLOT-VALUE`, MOP mutation, brush selection, or
fill routine. Because this is one startup brush in a direct checkpoint, the
zero is not generalized to all brushes or treated as the runtime brush width.

`brush-readers-34067627399.txt` is the normalized follow-up from run
[34067627399](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34067627399),
commit `9c02d9f11bff45e7597d14caee861fbb57b87a67`, job 101579084711,
artifact 9999448702. It repeats the width boundary and adds one direct
existing reader: `COMMON-GRAPHICS::ID` returns a `FIXNUM` value of 0 for the
first startup brush. The remaining readers are intentionally separate probes;
this report still contains no brush selection, slot writes, or fill-map use.

`brush-readers-34067726198.txt` is the next normalized reader capture from run
[34067726198](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34067726198),
commit `bef7b071cec55cea4b05142978239501e8e7beb0`, job 101579348428,
artifact 9999478570. It repeats the width and ID measurements and shows the existing
`COMMON-GRAPHICS-USER::ENVIR` reader returns a `CONS` for the first startup
brush. The value itself is not printed, so no environment structure is
inferred from this type-only boundary.

`brush-readers-34067834162.txt` extends the same isolated sequence in run
[34067834162](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34067834162),
commit `5d4518a93b5df7a878f561ebf09ee1527826eab5`, job 101579629325,
artifact 9999511639. The existing `RAD` reader completes and returns a
`FIXNUM` value of 0 for the first startup brush. `ENVIR` remains type-only;
the probe still performs no writes or fill-map initialization.

`brush-readers-34067944755.txt` continues the sequence in run
[34067944755](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34067944755),
commit `16047cdf3a041be9a6cc0ab25663a60f0b279de4`, job 101579925193,
artifact 9999543004. The existing `PERIM` reader completes and returns
`NULL` for the first startup brush. This is a type boundary only; no perimeter
contents or geometry are inferred.

`brush-readers-34068037439.txt` adds the existing `CORE` reader in run
[34068037439](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34068037439),
commit `368a1c45e0be7fe2e20c8f8705a45daf9449685e`, job 101580174673,
artifact 9999570347. `CORE` completes and returns `NULL` for the first startup
brush. The only remaining generated reader in the seven-slot census is
`CELLS`; it will be measured separately before any fill routine is considered.

`brush-readers-34068150338.txt` completes the first-object reader boundary in
run [34068150338](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34068150338),
commit `126e94183879439e7ac2adefd2f3638ca3c9b567`, job 101580477198,
artifact 9999605921. `CELLS`
returns a `FIXNUM`, not an array, in this startup object; its scalar value was
not printed in that run. The next census reads all six brushes and prints only
bounded scalar/list summaries.

`brush-census-34068394324.txt` is the normalized all-object census from run
[34068394324](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34068394324),
commit `2d0e1f069b9663d2cadbc739844a002d56a2626c`, job 101581131660,
artifact 9999680699. The list actually contains seven `PAINT-BRUSH` objects.
Brush 0 is a sentinel with ID/width/radius/cells all zero, environment `(0
100)`, and NIL perimeter/core. Brushes 1–5 have measured profiles:

| ID | Width | Radius | Cells | Environment band |
|---:|---:|---:|---:|---|
| 1 | 3 | 1 | 5 | 100–3000 |
| 2 | 5 | 2 | 12 | 3000–8000 |
| 3 | 7 | 3 | 49 | 8000–16000 |
| 4 | 13 | 6 | 121 | 16000–60000 |
| 5 | 17 | 8 | 239 | 60000–120000 |

The report prints only the first four list elements for `PERIM` and `CORE` and
was intentionally bounded to indices 0–5. It establishes that brush 0 is not a
meaningful behavioral target; the complete masks and seventh profile are
preserved by the later 34068649921 capture below.

## Complete brush masks and fill metadata

`brush-census-34068649921.txt` is the completed read-only census from run
[34068649921](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34068649921),
commit `89f5718de345ed2c21dfcbc44a4e9248b0bdbb00`, job 101581829016, artifact
9999752272. It raises the print bound, reads all seven `ALL-BRUSHES` entries,
and preserves every ordered `PERIM` and `CORE` point list. The profiles are
IDs 0–6; brush 0 is a sentinel and brush 6 is `(width=19 radius=9 cells=329)`
with ENVIR `(120000 200000)`. The earlier `34068394324` report is intentionally
kept as a bounded predecessor; it omitted index 6 and truncated list values.

`fill-metadata-34068649921.txt` is the matching read-only routine census from
the same run, job 101581829103, artifact 9999751657. It records successful
`ARGLIST`/type discovery for `INIT-MAPS`, `CLEAR-FILL-MAP`,
`WRITE-LIST-TO-FILL-MAP`, `SELECT-BRUSH`, `BRUSH-STROKE`, `SCREEN-AND-STORE`,
`PAINT-FILL`, `BRUSH-FILL`, `BRUSH-FILL-SUBPART`, and `RECORD-BRUSH`; `EDGE-PATH`
has no function binding. No candidate is invoked.

`fill-function-constants-34068649921.txt` is a focused excerpt from the
complete constants report (job 101581829081, artifact 9999751800). It records
the retained symbols for brush selection, map creation/clearing, list writes,
stroke emission, and the scan/fill helper chain. `INIT-MAPS` references
`*PIC-WIDE*`, `*PIC-HIGH*`, `MAKE-ARRAY`, `PATCH-MAP`, and `FILL-MAP`; the
constants establish the dependency surface but do not establish runtime map
dimensions or boundary comparison semantics.

`init-maps-34069679558.txt` is the isolated behavioral report from run
[34069679558](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34069679558),
commit `722ec4375618a8b612e193e2d52572460aced20e`, job 101584584107, artifact
10000042831. It binds `*PIC-WIDE*`, `*PIC-HIGH*`, `PATCH-MAP`, and `FILL-MAP`
only through `PROGV`, then invokes `INIT-MAPS` for `(3 5)`, `(5 3)`, and `(1 1)`.
The measured result is a fresh zeroed rank-2 `PATCH-MAP` with
`(UNSIGNED-BYTE 16)` elements and an independent fresh zeroed `FILL-MAP` with
`(UNSIGNED-BYTE 4)` elements. The primary return is the fill map; a repeated
call replaces both arrays. Every case reports `RESTORED T` and
`BINDINGS-RESTORED T`. The report does not claim coordinate indexing or fill
write semantics.

`brush-stroke-isolated-34071136475.txt` is the successful load and symbol
resolution checkpoint from run
[34071136475](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34071136475),
commit `72ab3a8b36c6edddc73f21a0e3698fb8db660d16`. Static-marker output
confirms that `BRUSH-STROKE`, `SCREEN-AND-STORE`, `IN-SUB-FRAME`,
`MAKE-TWOPT`, and the `ID` reader are present and callable in the direct
startup image. The follow-up replacement checks install a temporary
`SCREEN-AND-STORE` stub and a temporary `IN-SUB-FRAME` stub, call each stub
directly, and restore both original function cells
(`STAGE-2-SCREEN-RESTORED` and `STAGE-3-INSIDE-RESTORED`). This is a
hook-safety result only; it does not yet invoke `BRUSH-STROKE` or establish
map writes, brush selection, or output parity. The earlier failed
formatted-output checkpoint is retained in
`brush-stroke-isolated-34070909268.txt` as a probe-debugging record.

`brush-stroke-isolated-34071470348.txt` extends that probe through private
environment setup in run
[34071470348](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34071470348),
commit `93601fd1f4367a37b59c283dafd2fa974d431ac4`. A `PROGV` environment with
16×16 typed maps, startup brush 1, boundary value 3, and zero `CDEX`/`SDEX`
enters successfully; the bindings, map dimensions, brush ID, and post-exit
binding restoration all pass. `BRUSH-STROKE` is still not called in this
checkpoint.

`brush-stroke-isolated-34071673602.txt` is the first successful single-call
`BRUSH-STROKE` checkpoint from run
[34071673602](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34071673602),
commit `7e3d6796bf45168ef1fffc6cd926f3cf1c657727`. With a private 16×16
environment, startup brush 1, value 1, zero `CDEX`/`SDEX`, and `PATH=NIL`,
the call reaches `AFTER-STROKE`; both private maps remain all-zero, and the
function cells and dynamic bindings restore. This is a no-path branch result,
not evidence that a nonempty path stamps no cells.

`brush-stroke-isolated-34071834659.txt` repeats the same isolated environment
with a one-point path created by `MAKE-TWOPT(7,7)` in run
[34071834659](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34071834659),
commit `949eb7d5add40ea12420d73086e27fbf1c4349c5`. The singleton path also
reaches `AFTER-STROKE` and leaves both maps zero-filled, with cleanup intact.
The next probe adds one horizontal segment; it is the first case expected to
exercise path iteration rather than an empty/singleton path boundary.

`brush-stroke-isolated-34072022757.txt` records that two-point case in run
[34072022757](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34072022757),
commit `4288cade31db7517a621086bc21aedd0dbc3e3f3`. It reaches the post-call
checkpoint and remains zero-filled while the isolated `IN-SUB-FRAME` stub
returns `NIL`. That dependency gate is intentionally kept separate from the
next run, which uses the same two points with the predicate stub returning `T`.

`brush-stroke-isolated-34072198444.txt` is the first in-frame write result,
from run
[34072198444](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34072198444),
commit `a9acaf2f6e36d61d863011a06551a9f38f39dc3e`. With the same two points
and `IN-SUB-FRAME` forced to `T`, the routine writes 12 nonzero cells to the
private `FILL-MAP` and zero cells to `PATCH-MAP`; both function cells and all
dynamic bindings restore. The current report records the counts only; a
follow-up will capture the exact row-major indices and values.

`brush-stroke-isolated-34072445077.txt` captures those exact cells in run
[34072445077](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34072445077),
commit `59833eeda631bbfe15756faac29a49e1f1c45773`. The 12 values are all
`1`, at row-major indices `102–104`, `118–120`, `134–136`, and `150–152` on
the known 16×16 map; `PATCH-MAP` remains zero. The report intentionally keeps
these as row-major indices, not X/Y coordinates, until an asymmetric map or
origin/axis holdout distinguishes the two dimensions.

The boundary-value holdout kept that exact geometry and changed only `VALUE`
from `1` to the measured `BOUNDARY-VALUE` of `3`; it tests whether the map
stores the supplied value directly or applies boundary-specific logic.

`brush-stroke-isolated-34072609079.txt` confirms direct propagation in run
[34072609079](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34072609079),
commit `1cb415c9a0fd72f567e99e174d55175e7f737da1`: the same 12 row-major
indices now contain value `3` instead of `1`, with zero `PATCH-MAP` cells and
the same restoration markers. The value argument is therefore not merely a
Boolean gate in this case.

The next holdout changes only the second point to create a vertical segment;
its transposed footprint will test the map's axis/origin interpretation while
the report continues to use row-major indices rather than prematurely naming
them X/Y.

`brush-stroke-isolated-34072790047.txt` is the vertical holdout from run
[34072790047](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34072790047),
commit `f723c4bc7b58370c5f03e17e619284932844a7e6`. The cells are
`102–105`, `118–121`, and `134–137`, all value `1`. Compared with the
horizontal result, this transposes the 4×3 footprint to 3×4. On the known
`(16 16)` maps, the clean-room model now treats the first coordinate as the
outer row-major dimension (`index = first * height + second`) for these brush
writes; this is still a measured map-write convention, not a claim about every
other routine's coordinate handling.

The next holdout keeps the horizontal path and value 1 but selects startup
brush 2, extending the map-write measurement to the next measured core mask.

`brush-stroke-isolated-34073138334.txt` is that brush-2 capture from run
[34073138334](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34073138334),
commit `605d135fe2612328e68fa1ceb30e760c61e4ceb5`. It writes 26 value-1
cells and no patch cells. The exact index set matches the union of the two
translated brush-2 `CORE` masks in the new JS fixture.

The next holdout keeps the same path and value but selects startup brush 3,
extending this core-mask comparison one profile at a time.

`brush-stroke-isolated-34073376591.txt` is the brush-3 capture from run
[34073376591](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34073376591),
commit `eda581602e5ca740ffc9d65e2f65a85d7ed68aeb`. It writes 70 value-1
cells and no patch cells; the exact index set matches the union of the two
translated brush-3 `CORE` masks, and the JS fixture now covers three profiles.

The next probe returns to brush 1 and changes only the second point to `11,7`,
testing whether a gapped path stamps the supplied vertices or interpolates
between them.

`brush-stroke-isolated-34073609021.txt` is the gapped brush-1 capture from run
[34073609021](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34073609021).
With points `(7,7)` and `(11,7)`, it writes exactly 18 value-1 cells:
`102–104`, `118–120`, `134–136`, `166–168`, `182–184`, and `198–200`.
These are two disjoint translated brush-1 `CORE` footprints; there are no
intermediate cells in the gap and `PATCH-MAP` remains zero. The JS helper and
fixture now cover this measured non-interpolation case. The result is scoped
to this path and dependency setup; arbitrary gaps, overlaps, clipping, and
`CDEX`/`SDEX` behavior remain open.

The next probe selects a larger startup brush with the adjacent horizontal
path, keeping path topology fixed while extending the measured core-mask
comparison.

`brush-stroke-isolated-34073990973.txt` is the brush-4 capture from run
[34073990973](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34073990973),
commit `b2917007340ace2cb848c8751a0e100ba0244543`. With the same adjacent
points `(7,7)` and `(8,7)`, it writes exactly 108 value-1 cells and no patch
cells. The row-major index set matches the union of the two translated
brush-4 `CORE` masks; the JS helper and regression fixture now cover the
fourth measured profile.

The combined direct Stage 23 matrix in
`brush-stroke-isolated-34145100465.txt` ([run
34145100465](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34145100465))
repeats brushes 1–4 in one corrected report. It records 12, 26, 70, and 108
value-1 fill cells respectively, one screen-forwarding call per case, no
patch writes, and clean return for every case. This is the retained four-
profile fixture; the earlier single-profile artifacts remain useful for
history and cross-checking.

The follow-up matrix in `brush-stroke-isolated-34145707021.txt` ([run
34145707021](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34145707021))
adds the repeated interior path `(7,7)→(8,7)→(7,7)`. Brush 1 still writes
the same 12 unique cells, forwards one screen call containing all three points
including the repeated endpoint, and restores cleanly; the predicate count is
27 rather than the two-point baseline's 18.

The next probe should use a carefully bounded edge/clip control, then expose
the downstream screen/writer context without changing the private map setup.

`brush-stroke-isolated-34074489559.txt` is the edge diagnostic from run
[34074489559](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34074489559),
commit `2e91711e2b5d9260ca9580517447be0177a9756b`. With brush 1 and points
`(0,0)` and `(1,0)`, the forced `IN-SUB-FRAME=T` call raises `SIMPLE-ERROR`
before `AFTER-STROKE`; one partial fill write survives at row-major index `0`,
`PATCH-MAP` stays zero, and the function/dynamic bindings restore. This is an
unchecked boundary-write result under the dependency stub, not a general
clipping rule. The JS helper therefore retains its explicit provisional
out-of-map skip policy pending broader in-frame and array-write probes.

The next probe should use a repeated or overlapping interior vertex, where no
boundary error can obscure duplicate-path semantics.

`brush-stroke-isolated-34074832466.txt` is the aligned CDEX holdout from run
[34074832466](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34074832466),
commit `55053468d397b075cfca4690612bc6c02cfbaf05`. It changes positional and
dynamic CDEX from `0` to `1` while SDEX remains `0`; the adjacent brush-1 path
still writes exactly the baseline 12 value-1 cells and no patch cells. The
routine returns normally and restores both function cells and dynamic
bindings. The capture only constrains isolated map effects; the screen/file
consumers were stubbed.

The next holdout changes only the aligned SDEX index to `1`.

`brush-stroke-isolated-34075045090.txt` is the aligned SDEX holdout from run
[34075045090](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34075045090),
commit `c94b9c881059dc0a474c19cfb7d4d96cc8e39e85`. It changes positional and
dynamic SDEX from `0` to `1` while CDEX remains `0`; the adjacent brush-1 path
again writes exactly the baseline 12 value-1 cells and no patch cells. The
routine returns normally and restores both function cells and dynamic
bindings. As with the CDEX capture, this constrains only isolated map effects
because screen/file consumers were stubbed.

The next probe should use a repeated interior vertex to test path idempotency.

`brush-stroke-isolated-34075328544.txt` is the repeated-vertex capture from
run [34075328544](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34075328544),
commit `18aca3d0cea395e05d61cc72af13c643fc39630b`. The path
`(7,7)→(8,7)→(7,7)` writes exactly the same 12 value-1 cells as the adjacent
two-point baseline, with no patch writes; all functions and bindings restore.
The JS helper now has a matching idempotency regression. The capture only
constrains the private map effect because screen/file output remains stubbed.

The next probe should capture stubbed `SCREEN-AND-STORE` arguments for an
interior path while retaining the controlled map setup.

`brush-stroke-isolated-34075683103.txt` is the forwarding capture from run
[34075683103](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34075683103),
commit `0a4fc7ddf24fb71f91f3db1eba9b53ca2a99864e`. With
`IN-SUB-FRAME=NIL`, the stub sees one call, forwarded indices `0,0`, and the
three numeric points `(7,7)`, `(8,7)`, `(7,7)` in order. Both private maps
remain zero; `IN-SUB-FRAME` is called 27 times; the stroke returns and restores
all function/dynamic bindings. The report deliberately stops at forwarding:
the stub does not stand in for GUI/file output.

The next probe should vary forwarded indices under `IN-SUB-FRAME=NIL`.

`brush-stroke-isolated-34075893528.txt` is the forwarded-CDEX capture from run
[34075893528](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34075893528),
commit `bdec9e4c0380c9564a0b08eb8391dec149bc1e91`. With aligned CDEX=`1` and
SDEX=`0`, the recorder sees `SCREEN-ARGS 1 0`, one call, and all three path
points in order. Both maps remain zero; the predicate count is 27; return and
restoration markers match the baseline. This is forwarding evidence only—the
real screen/file consumer remains replaced.

The next holdout changes only aligned SDEX to `1`.

`brush-stroke-isolated-34076151916.txt` is the forwarded-SDEX capture from run
[34076151916](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34076151916),
commit `aebdbcc9331f6d2c60f82aa0dac6180d4383b0e7`. With aligned CDEX=`0` and
SDEX=`1`, the recorder sees `SCREEN-ARGS 0 1`, one call, and all three points
in order. Both maps remain zero; the predicate count is 27; return and
restoration markers match the baseline. Alongside the baseline and forwarded
CDEX captures, this completes the isolated forwarding matrix while leaving the
real screen/file consumer replaced.

The next probe should instrument that consumer boundary rather than add more
map-only cases.

The measured profile module is
[`engine/src/aaron-brushes.js`](../../../engine/src/aaron-brushes.js). Its unit
test parses the normalized census and compares every scalar, mask, point order,
duplicate, and gap, so the clean-room data cannot silently drift from the
captured report.

## Direct SCREEN-AND-STORE frontier

`screen-entry-frontier-34093884222.txt` is the corrected direct-call capture
from run [34093884222](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34093884222),
commit `557e9776f879e2dbfd1203bc8eb9eb5b3f62dc8f`, job `101653042992`,
artifact `10007843734`. The probe calls the original `SCREEN-AND-STORE` once
with a private three-point path and bounded WATCH/PREP/PLOT/STORE recorders;
the report is a normalized copy of the artifact's `screen-entry-frontier.txt`.

The call reaches `WATCH-FOR-MESSAGES` exactly once, then signals
`UNBOUND-VARIABLE` for `COMMON-GRAPHICS-USER::MPLAN`. No PREP-LINE, PLOT, or
STORE-IN-FILE call occurs. The `HANDLER-BIND`/`CATCH` boundary now records the
condition before unwind and the probe restores all replaced function cells and
dynamic bindings. This is a dependency frontier, not evidence that an
uninitialized screen call can emit a file. The next screen probe must establish
the original scene/colour context that binds `MPLAN` (and then record the next
frontier) rather than guessing a substitute plan object.

`planning-metadata-34094924609.txt` is the read-only constructor-linkage
follow-up from the same matrix, run
[34094924609](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34094924609),
commit `b0f6364ffca721fb2c4f3dfc5c295a68cf02d200`, job `101656287967`,
artifact `10008213232`. `MASTER-PLAN`
has arglist `(NIL T)`; `MAKE-PLAN` has
`((COMMON-GRAPHICS:ID COMMON-GRAPHICS-USER::SCRIPT) T)`. Both retain CLOS
constructor constants, but the `MAKE-PLAN` constructor is not `MASTER-PLAN`
constant 1 or 5 by `EQ`. `MPLAN`, `PREFS`, `SDEX`, and `FIGDEX` remain
 unbound. This is linkage evidence only; neither constructor was invoked.

`planning-call-trace-34098634519.txt` is the first append-safe runtime call
trace, from run
[34098634519](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34098634519),
commit `7b884656600fba7f27e58ee292542145e8041d17`, job `101667768442`, and
artifact `10009593887`. The original probe installed wrappers around the
ordinary compiled and generic entry cells, then the normal screensaver startup
called them: `SET-UP-SCREEN-SIZE`, `RUN-AARON`, `DOIT`, `INIT-RANDOM`, `MAIN`,
`MASTER-PLAN`, `DEVELOP-PLAN`, `SELECT-CANVAS`, `INIT-MAPS`, `PROTOCOL`, and
`RPARSE` all appear, followed by repeated `SCRIPT` calls. The report has 259
entries, 253 exits, no trace errors, and reaches the 512-event bound during
`SCRIPT`. This also resolves the previous empty-trace ambiguity: the wrapper
logger had captured a closed `WITH-OPEN-FILE` stream and swallowed its write
errors; reopening the report for runtime appends makes the calls visible.
The compact normalized evidence is in the linked file; the complete report
remains in the GitHub artifact.

`planning-call-trace-focused-34099250163.txt` is the follow-up trace from run
[34099250163](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34099250163),
commit `351cad8ab4d86fa54850410271973486bd3d617a`, and artifact
`10009828004`. It omits the high-fanout `SCRIPT` wrapper and raises the event
bound to 1,024. The normal path reaches `DRAW-CFORM`,
`INITIALISE-PICTURE-PLANE`, `SCREEN-AND-STORE`, `PREP-LINE`, and
`STORE-IN-FILE`; it records 515 entries, 509 exits, and no trace errors before
the bound. `MPLAN` is a `PLAN` by the first `RPARSE` call, while `BRUSH` and
`RPLANE` are bound before `PREP-LINE`; the private `FILL-MAP` is a
`(320 480)` unsigned-byte-4 array. `STORE-IN-FILE` accounts for 445 entries,
so the next pass will leave that writer unwrapped to expose its downstream
line/brush/plot calls.

`planning-call-trace-downstream-34099782995.txt` is the next bounded pass from
run
[34099782995](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34099782995),
commit `fb51505d2d4e0c2e586b24d88e94f5da56994ded`, job `101671310643`, and
artifact `10010008363`. It leaves `STORE-IN-FILE` unwrapped and instruments
its downstream names. The first `DRAW-CFORM` repeatedly enters
`LINE-MAPPING → MAPLINE → PLOT` (196, 196, and 102 entries respectively)
before the 1,024-event bound; there are 516 entries, 508 exits, and no trace
errors. No screen/brush edge appears before this sampling limit, so that
absence is not a negative call-graph result. The next pass omits these three
high-fanout mapping/plot wrappers to reach later startup stages.

`planning-call-trace-screen-34100143844.txt` is the screen/brush follow-up
from run
[34100143844](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34100143844),
commit `5ccd36e1691ddab187f778317242fb6c275ce3b7`, job `101672469636`, and
artifact `10010148779`. It omits the mapping/plot wrappers and reaches
`GENERATE-PERSON`, `BUILD-FIGURE`, `DRAW-FIGURE-CFORMS`, `FREE-PATH`,
`BRUSH-STROKE`, `SCREEN-AND-STORE`, `WATCH-FOR-MESSAGES`, and `PREP-LINE`.
The first integrated brush call receives an eight-`TRIPT` path, value `3`,
`CDEX=1`, `SDEX=0`, with `BRUSH` typed `PAINT-BRUSH`, `RPLANE` typed `FIXNUM`,
`RGB-MAP` a `CONS`, and the private fill map a `(320 480)` unsigned-byte-4
array. The report has 516 entries, 508 exits, and no trace errors; 254
`HOP-OR-DRAW` entries consume the 1,024-event bound. The compact evidence
preserves the distinction between observed integration and still-unseen later
calls.

`planning-call-trace-continuation-34100708130.txt` is the bounded continuation
from run
[34100708130](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34100708130),
commit `6a0a2ab37a3a551e6a26b62d7a78c1121a2c34ac`, job `101674263968`, and
artifact `10010369502`. It leaves `HOP-OR-DRAW` unwrapped and records 41
`BRUSH-STROKE`, 40 `SCREEN-AND-STORE`, 40 `WATCH-FOR-MESSAGES`, and 76
`PREP-LINE` entries, with 516 entries, 508 exits, and no trace errors. The
1,024-event bound occurs inside the fortieth screen call; this is sampling
evidence, not a termination claim. The next pass omits only the message-loop
and preparation wrappers to expose later generator continuation.

`planning-call-trace-late-34101175339.txt` is the follow-up from run
[34101175339](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34101175339),
commit `59c7bd653864efd7a8d540fe20f8fd7dee5157fa`, job `101675739785`, and
artifact `10010542952`. It omits `WATCH-FOR-MESSAGES` but retains
`PREP-LINE`, producing 76 `BRUSH-STROKE`, 73 `SCREEN-AND-STORE`, and 73
`PREP-LINE` entries (plus 70 `DRAW-CFORM`) before the 1,024-event bound. There
are 515 entries, 509 exits, and no trace errors. The source still contained
`PREP-LINE` in this pass; the next probe removes it explicitly so later
figure-finalization calls can be sampled.

`planning-call-trace-generator-34101507272.txt` is the generator-continuation
trace from run
[34101507272](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34101507272),
commit `80a328daecdc3b6f3c12b64f42a5a00a1f9452c0`, job `101676776120`, and
artifact `10010667597`. With message, preparation, hop, and mapping wrappers
omitted, the run reaches `MAKE-ARTWORK`, `MAKE-PAINTING-COLORS`, and 18
`FREE-PATH` calls before repeated `NEW-START`/`END-START` → `BRUSH-STROKE` →
`SCREEN-AND-STORE` sequences. It records 515 entries, 509 exits, and no trace
errors; 100 `NEW-START` and 97 `END-START` entries consume the 1,024-event
bound. The next pass omits those two helpers to sample later continuation.

`planning-call-trace-after-start-34101957681.txt` is the follow-up from run
[34101957681](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34101957681),
commit `ad43b071c0ca39dfb883d7052ebf5f7fb10dabc4`, job `101678193826`, and
artifact `10010841138`. With the start helpers omitted, it records 200
`BRUSH-STROKE` and 196 `SCREEN-AND-STORE` entries, plus 44 `DRAW-CFORM`, two
`FREE-PATH`, and three `PAINT-FILL` entries. There are 515 entries, 509 exits,
and no trace errors; the 1,024-event bound lands in the two-hundredth brush
call. The next pass leaves those two high-fanout boundaries unwrapped to
sample post-stroke/finalization edges.

`planning-call-trace-finalization-34102306571.txt` is the post-stroke trace
from run
[34102306571](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34102306571),
commit `50f031dd0ba73e6962f516ebf32d4692ad52ca77`, job `101679281325`, and
artifact `10010974915`. It omits the brush/screen wrappers and reaches three
`GENERATE-PERSON` → `BUILD-FIGURE` → `DRAW-FIGURE-CFORMS` passes, 118
`DRAW-CFORM`, and 55 `PAINT-FILL` entries. There are 514 entries, 510 exits,
and no trace errors; 316 `GOOD-START` entries consume the 1,024-event bound.
The next pass omits `GOOD-START` to expose later composition/finalization.

`planning-call-trace-after-good-34102771315.txt` is the completed control-flow
trace from run
[34102771315](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34102771315),
commit `ffbaf4348b735930c058aa317d3ce4a40a35ae28`, job `101680773883`, and
artifact `10011150077`. With `GOOD-START` and all high-fanout stroke/screen
helpers omitted, it finishes without the 1,024-event bound: 107 entries, 105
exits, and no trace errors. `MAIN` returns after `DISPLAY-COLOR-PATCHES`, 43
`PAINT-FILL` calls, and `PROTOCOL`; `DOIT` calls `WRITE-PAINTING-RECORD` once
for image `0`. At that point `MPLAN` is `PLAN`, `BRUSH` is `NULL`, `RPLANE`
is `FIXNUM`, `FILL-MAP` is `(ARRAY (UNSIGNED-BYTE 4) (320 480))`, and
`RGB-MAP` is a `CONS`. The same artifact contains one complete 142,806-byte
`aa0` painting. This closes the broad startup call-graph phase; parity work
now targets exact output records and random-state consumption.

`planning-call-trace-canvas-values-34104396531.txt` is the numeric canvas-state
follow-up from run
[34104396531](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34104396531),
commit `4a7e002e8dc3063915e82f419ad00b2389bcd14b`, job `101685960516`, and
artifact `10011780947`. It records 92 entries, 90 exits, and no trace errors.
For the default premium compact branch, `SET-UP-SCREEN-SIZE(NIL)` leaves the
engine at `*SCREEN-WIDTH*=640`, `*SCREEN-HEIGHT*=480`, `*PIC-HIGH*=768`, and
five 320-pixel width cells while `*PIC-WIDE*`, `RIGHTMAX`, and `TOPMAX` remain
unbound. `SELECT-CANVAS(NARROW)` then sets `*PIC-WIDE*=320`, `*PIC-HIGH*=480`,
`RIGHTMAX=319`, and `TOPMAX=479`; the private fill map is
`(ARRAY (UNSIGNED-BYTE 4) (320 480))`. The harness metadata reports a separate
1024x768 host screen. This is a measured default-branch transition, not a
universal display-size rule. The same run captured a complete 141,792-byte
`aa0` painting with SHA-256
`bf957ce28279e9bfb40954bf495bf5d714f5311554a73c493bb381ee8c50cdd0`.

`planning-canvas-size-holdouts-34105595078.txt` records two fresh-process size
holdouts from run
[34105595078](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34105595078),
commit `f1ab8055e154d2b10b66acfc3dd44723be42ddbd`. The 1024x768 job (job
`101689749454`, artifact `10012226732`) selects a 512x768 canvas and writes a
complete 207,144-byte, 148-colour `aa0`; the 1920x1080 job (job `101689749722`,
artifact `10012239878`) selects 960x1080 and writes a complete 466,378-byte,
148-colour `aa0`. Both traces show `RIGHTMAX`/`TOPMAX` as the selected width
and height minus one. These are controlled size interventions, not seeded
random comparisons; they confirm a reachable high-resolution path while the
universal dimension rule remains open.

`planning-random-seed-holdouts-34109307251.txt` is the first completed seeded
planning holdout from run
[34109307251](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34109307251),
commit `54349ea7f8ada10a8e94df2ae53a6472e2b15e97`, with artifacts
`10013714162`, `10013686963`, and `10013684730`.  The dynamically resolved
`EXCL:MAKE-RANDOM-STATE-FROM-SEED` path successfully constructs and installs a
`COMMON-LISP:*RANDOM-STATE*` object for seeds 1234 and 5678.  A copied-state
preview is repeatable before startup (`1234` gives `13,13,41` in both fresh
processes), but `INIT-RANDOM` leaves different post-call previews, first `RAN`
values, canvas branches, and AA hashes for the two 1234 processes.  At the
`INIT-RANDOM` boundary `COMMON-GRAPHICS-USER:?RSEED?` is a 13-character string
containing `C:\\temp\\rseed`; no such file remained in any artifact.  The
holdout therefore proves state installation and seed sensitivity, but not
startup reproducibility or whole-painting parity.  The normalized measurements
and hashes are in the linked evidence file; no random values are drawn merely
for the preview.

`rseed-serializer-34111222810.txt` records the follow-up serializer holdout
from run
[34111222810](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34111222810),
commit `5306141beb592074db93c1c0f38969af8bdafeaa`, artifact `10014427965`.
The original runtime writes a 3,030-byte `C:\\temp\\rseed` containing 201
numbers and `...`, regardless of the caller's `*PRINT-LENGTH*`; `GET-RANDOM`
raises `READER-ERROR` on the result. This is measured evidence that the visible
file is not a complete replay state, not a whole-generator parity result.

`planning-post-init-reseed-holdouts-34111960227.txt` records three fresh
post-`INIT-RANDOM` reseed holdouts from run
[34111960227](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34111960227),
head `093a70075bde1c6c4b1e85c6374c6f78f39b8228`. Reinstalling the dynamic
seeded `COMMON-LISP:*RANDOM-STATE*` after the original init makes the two
seed-1234 jobs match all 32 logged `RAN` calls and the complete AA0 SHA-256;
seed 5678 is distinct. This is a controlled calibration boundary, not default
startup parity.

`random-init-constructor-probe-34111962460.txt` records the companion
constructor-advice attempt from run
[34111962460](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34111962460).
Both protected function-cell writes were rejected with `PACKAGE-LOCKED-ERROR`,
so the run supplies no constructor call arguments and is retained only as a
negative instrumentation result.

`post-init-ran-trace-34112709506.txt` records the two-job extension of that
calibration seam to 512 engine-local `RAN` calls. The normalized call lines
match exactly across fresh seed-1234 jobs, along with their AA0 SHA-256; this
is a draw-order fixture, not default-startup parity.

`post-init-ran-context-34113996954.txt` adds the matching 512 active-target
stacks. The repeated seed-1234 jobs are identical and partition the stream
into `MAIN`, `DEVELOP-PLAN`, `RPARSE`, `GENERATE-PERSON`, `BUILD-FIGURE`, and
`RPARSE` phases. This makes the long stream actionable for scene probes. It
does not imply that every integer bound has already been reproduced by the JS
RNG; the current short-limit numeric fixture remains a separate boundary.

The integer-boundary run
[`34115285855`](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34115285855)
measures the larger integer limits used by the planner. Its non-equal
`RANDOM`/integer-`RAN` calls advance one raw word and match the JS model;
equal integer `RAN` endpoints return without consuming state. The normalized
report is retained as [`random-integer-boundaries-34115285855.txt`](random-integer-boundaries-34115285855.txt),
with parsed values asserted by the engine fixture
[`random-integer-boundaries.json`](../../../engine/test/fixtures/random-integer-boundaries.json).

## RAN-HAND helper trace

`ran-hand-post-init-34120567298.txt` records the normalized output from run
[34120567298](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34120567298),
commit `ccf607317ea486575afab15febaa4185d4ac7a9b`. The two fresh seed-1234
jobs both complete successfully, and their 50,297-byte `RAN-HAND` reports
have the same SHA-256. The target is a compiled zero-argument helper. Four
captured calls each consume 20 single-float `RAN(-0.1, 0.1)` samples, mutate
the same 20 named joint bindings in order, and return the final delta. The
raw report and the surrounding planning trace remain in the expiring workflow
artifacts; only this normalized evidence and the clean-room fixture are kept
in the repository.
