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
See [stroke-findings.md](../../stroke-findings.md) for the scoped parity claim.

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

The measured profile module is
[`engine/src/aaron-brushes.js`](../../../engine/src/aaron-brushes.js). Its unit
test parses the normalized census and compares every scalar, mask, point order,
duplicate, and gap, so the clean-room data cannot silently drift from the
captured report.
