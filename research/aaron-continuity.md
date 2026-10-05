# AARON project continuity handoff

This file is the short resumption record for future Aaron conversations and
agents. The full technical roadmap remains in
[`reverse-engineering-plan.md`](reverse-engineering-plan.md); this file keeps
the current state, constraints, and next move easy to find after a
conversation boundary.

## Latest checkpoint: 2026-10-05

Natural BRUSH-STROKE's long value-3 boundary branch now matches all 70 markers,
296,912 ordered candidate/predicate results and 10,752,000 complete output
cells. It chooses PERIM for length > 3×WIDTH, clips inclusively to SUB-FRAME,
writes 3, skips the screen and returns the original path by EQ. The short
CORE branch has native support but is not naturally exercised here. All
3,881 stroke return identities are observed; value-0 painting remains open.
All 70 clears use their naturally returned CFRAME and match another 10,752,000
full output cells. Both drawings/scenes equal fresh controls. Read
[the boundary findings](introspection/brush-stroke-boundary.md) and
[portable evidence](introspection/evidence/brush-stroke-boundary-parity-20261005.json).
The accepted-coordinate touch set is not an individual native store trace.
There are 6,965 additional clear-entry value-3 positions outside the linked
marker's accepted set; every one was 0/1 at marker exit, so its net addition
occurs during intervening work. Their writer and intermediate ownership remain
open. Next: fresh SCREEN-AND-STORE / BRUSH-FILL-SUBPART mapping and natural
writer attribution, followed by the complete BRUSH-FILL row/iris schedule.
Frozen boundary roots: brush-stroke-boundary-seed1234-20261005-f and
brush-stroke-boundary-seed5678-20261005-h; fresh controls -g/-i; native -e.

### Previous natural census checkpoint

The complete natural BRUSH-STROKE census now covers 3,881 calls in the two
controlled paintings: 3,811 value-0 strokes, 70 value-3 strokes, 3,811 screen
calls and 70 clears. All calls are paired, with zero observation errors,
aborts or overflow; both complete drawings and scene reports equal fresh
uninstrumented controls. Empty and singleton natural value-0 paths differ
from the older isolated adapter cases. Read
[the census findings](introspection/brush-stroke-census.md) and
[portable evidence](introspection/evidence/brush-stroke-census-20261005.json).
The census retains counts and first-seen CORE geometry, not map writes,
returned-object identity or caller stacks. Continue with complete value-3
path/mask/predicate/map boundaries and natural CFRAME reads during clears,
then the complete BRUSH-FILL schedule and subpart painting.
Frozen census roots: brush-stroke-census-seed1234-20261005-a and
brush-stroke-census-seed5678-20261005-c; fresh controls -b and -d.

### Previous CFORM POST-FILL checkpoint

CFORM POST-FILL matches all 149 natural calls and 45,772,800 complete output
map cells. It clears positive fill cells in [LX,RX)×[LY,TY), assigns the form
patch where PATCH-MAP equals BACKGND, and returns the accepted count.
Target fill0/1/2 and BACKGND0 are measured; excluded RX/TY positives and all
outside cells are preserved. The outline/list/median/start/strategy/post
composition matches 35,905 outline positions, 22,886,400 full entry fill cells
and every output cell. Read [the CFORM findings](introspection/cform-post-fill.md)
and [portable evidence](introspection/evidence/cform-post-fill-parity-20261005.json).
Some zero-count calls have no PATCHDEX read; do not invent their original label.
Frozen v2 roots: cform-post-fill-seed1234-20261005-c / seed5678-20261005-e;
fresh controls -d / -f. V1 preserved output but lacked shared GETF cache fields,
giving 67 AFTER errors and zero map cells; it is excluded. Exact earlier native
method bytes and the new canonical external REA record are revalidated.
Continue with natural BRUSH-STROKE value-3 provenance, then the complete
BRUSH-FILL schedule/iris branch and subpart painting. Existing outlines/maps,
frames and plan construction remain original inputs.

### Previous BRUSH-FILL preparation checkpoint

BRUSH-FILL preparation now selects SCRIPT(MPLAN)[SDEX].CFLIST[CDEX], uses its
naturally returned CFRAME/PATCHDEX, starts the first scan at TY and derives
MAX = 5*((RX-LX)+(TY-LY)). All 134 initial rows, 138 form selections, 5,805
scan bounds/patch inputs and 278 walk budgets agree in both paintings. The
aligned complete SUBFORM composition again matches 85,401,600 output cells;
fresh controls match whole drawing/scene bytes. Read
[the preparation findings](introspection/brush-fill-preparation.md) and
[portable evidence](introspection/evidence/brush-fill-preparation-parity-20261005.json).
Four later row jumps reach LY-2 after a second CFRAME read; that branch is not
implemented by the initial-row adapter. Continue with CFORM POST-FILL, then
natural BRUSH-STROKE value-3 provenance and the complete BRUSH-FILL schedule.
Plan construction, earlier maps, form counts and painting decisions remain
original dependencies. Successful preparation roots are -seed1234-...-b and
-seed5678-...-d, with fresh controls -c and -e; frozen v2 source has SHA-256
6717298a2b31e12626ae5ca2bc8fbe21075ad7426bc914dff27d18783e957d6e.

### Previous scanner checkpoint

SCAN-ROW and NEIGHBORS are now recovered for the measured integer domain.
All 5,805 natural scans and 6,984 nested neighbor calls match independent JS.
NEIGHBORS returns min(3, matching in-picture neighbors); SCAN-ROW searches
[LX,RX), rejects Y=-1 before FLASH-SPOT and returns the first qualifying
TRIPT with Z=4. Each painting repeats 44,544 neighbor masks and 10,368 scan
queries over 48 layouts. Both drawings and scene reports equal fresh controls.
Scan-time complete map equality checks cover 1,783,296,000 elements. Row seeds
compose all 278 SUBFORM fills and 85,401,600 final map cells; start object
identity links are measured. Read [the scanner findings](introspection/scan-row.md)
and [portable evidence](introspection/evidence/scan-row-parity-20261005.json).

Frozen v2 observer preserves multiple values with MULTIPLE-VALUE-PROG1 across
the later logging flush. V1 finished without observation errors but replaced
SCAN returns with NIL; its changed drawing and zero PATCH calls are excluded.
Successful observer roots are scan-row-seed1234-20261005-c and
scan-row-seed5678-20261005-e, with fresh controls -d and -f. Earlier boundary
roots requested SmallImage and these runs did not; their measured dimensions
and full outputs match, and that cross-capture scope is explicit.

The user requested autonomous continuation across targets. An active hourly
same-thread heartbeat named "Continue AARON reverse engineering" was created
with id continue-aaron-reverse-engineering. Continue from this record without
waiting for another continue message; read-only investigation can progress
while oracle work remains serialized. Do not create duplicate automations.

At that checkpoint, BRUSH-FILL input preparation was next. It is now measured
above; the complete row schedule, CFORM POST-FILL, map history and subpart
painting/clearing still follow. FLASH-SPOT graphics effects remain a boundary.

### Previous SUBFORM construction checkpoint

SUBFORM boundary construction and a composed fill now match all 278 natural
cases in the two controlled paintings. PATCH-EDGE derives the complete
outline and updates the original start point's direction; LIST-FRAME derives
its inclusive bounds. Independent JS computes those inputs, medians and start
rotation and applies strategy/POST-FILL. All 27,509 outline positions,
frames/counts/returns and 85,401,600 complete output-map cell comparisons
agree. Both AA0 and scene reports equal fresh controls byte for byte.

Read [the SUBFORM boundary findings](introspection/subform-boundary.md) and
[portable evidence](introspection/evidence/subform-boundary-parity-20261005.json).
The module is `engine/src/aaron-subform-boundary.js`. Both maps retain their
object identity and complete contents from PATCH-EDGE entry to MY-FILL entry:
1,112 whole-map equality checks cover 170,803,200 elements. The existing map
state is carried into filling; its earlier scene history remains an input.
All outlines close, all points are integer TRIPT, and all frames are MAPFRAME.
All eight directions occur, with 241 observed start-Z changes. Stranded/MAX
termination, fractional/empty frame inputs and POST-FILL's value-2 conversion
remain native interpretation. The native start-tail object identity is not
separately measured; output values and caller-argument mutation are.

PATCH-EDGE, LIST-FRAME and NEIGHBORS have fresh exact complete PLL matches,
instruction-byte-validated standalone Ghidra reports and canonical REA
external import/export. NEIGHBORS is mapped but not ported. Natural returned
outline/frame identities match LIST-FRAME/MY-FILL inputs; this establishes
boundaries, not direct native callers. Keep the source of START/MAX/patch ID
and natural CFORM-COUNT explicit. Some zero-count fills have no PATCHDEX read;
the evidence retains each chain's reader count.

The first observer required SUBP-COUNT before its initial binding and was
stopped/excluded. The next repeated full maps but timed out at 280 seconds.
Frozen v3 saves typed vectors using COPY-SEQ of displaced views, checks EQ and
EQUALP at intermediate boundaries and captures complete maps at entry/exit.
All 1,668 snapshot preview checks pass; a 600-second limit completed the larger
seed-5678 painting in about 585 seconds. Partial failed runs may lack
summary.json and are not successful evidence. Both failures, staging hashes
and the new workflow lessons are retained. C:\temp is empty and no oracle
remains after this checkpoint.

Next, recover SCAN-ROW/NEIGHBORS to derive the start/MAX/patch inputs from a
row and patch map. CFORM POST-FILL, the source of value-3 cells, subpart brush
painting/clearing and an integrated BRUSH-FILL caller remain open. Earlier
map history and scene construction are still original dependencies.

### Previous boundary-map checkpoint

Two boundary-map helpers now match all complete captured outputs:
WRITE-LIST-TO-FILL-MAP assigns value 2 at the ordered list's in-picture
coordinates; CLEAR-FILL-MAP zeros the selected inclusive frame rectangle.
Across two paintings, all 149 writers, 70 clears, 35,905 list positions and
33,638,400 full-map output cell comparisons agree. Both drawings and scene
reports equal fresh controls byte for byte. Nonzero far-edge cells are cleared,
and nonzero cells outside the frame are preserved. Clear entry includes values
0/1/2/3, with 64,259 observed value-3-to-zero transitions.

Read [the boundary-map findings](introspection/boundary-map.md) and
[portable evidence](introspection/evidence/boundary-map-parity-20261005.json).
The independent module is `engine/src/aaron-boundary-map.js`. All 149 CFORM
cases also match the composed writer → medians → start → strategy sequence
and 1,295,917 strategy-region output cells, aligned to the retained separate
preparation captures. Original point lists, writer entry maps and selected
frame inputs remain required. No out-of-picture writer point or VAL other
than 2 occurs; those guards remain static interpretation.

Both helpers have unique complete PLL matches, instruction-byte-validated
standalone Ghidra reports and canonical REA external evidence import/export.
The first full observer missed frame bounds despite matching control bytes:
compiled accesses bypassed LX/RX/LY/TY function wrappers. Final capture reads
the slots directly from the naturally returned CFRAME object, adding no
application frame accessor calls. All 438 map-preview and 140 slot-preview
checks pass. Keep the missing-input and earlier extra-RX lessons. A Ghidra
settings-file permission failure and its scoped retry are documented in
[the native workflow](native-analysis-workflow.md).

Next, recover SUBFORM's initial boundary maps before MY-FILL, then compose
their production with the measured strategy and SUBFORM POST-FILL rule.
CFORM POST-FILL and the source of value-3 cells are useful next boundaries.
Integrated MY-FILL/BRUSH-FILL, frame/outline construction, iris branching and
subpart brush changes remain open. Do not infer direct native callers from
the observed MY-FILL/BRUSH-FILL-SUBPART wrapper enclosures.

### Previous fill-preparation checkpoint

Three fill-preparation functions now match their complete captured outputs:
SET-MEDIANS, GOOD-START and FILL-STRATEGY, with 427 calls each in the two
controlled paintings. JavaScript rounds median rows to the nearest integer
with ties to even, rotates the complete outline at the first three distinct X
values with equal successive differences, and toggles scan columns while
preserving fill value 2. All 63,414 outline point positions
and 1,883,204 output cell comparisons summed over per-call captured regions
agree. Both drawings and scene reports equal fresh controls byte for byte.

Read [the fill-preparation findings](introspection/fill-preparation.md) and
[portable evidence](introspection/evidence/fill-preparation-parity-20261005.json).
The independent module is `engine/src/aaron-fill-preparation.js`. Original
LY/TY inputs, outlines and initial boundary maps remain inputs; the comparison
computes its own intermediate medians and rotated outlines. Captured frames
are MAPFRAME, point objects are VISPT/TRIPT and map values are 0/1/2. Other
domains and cells outside the padded capture rectangles remain unmeasured.

The initial observer had zero errors but changed AA0. A copied-state diagnostic
localized one random-state advance to its first extra RX read. The final probe
reads only the needed LY/TY and passes all 2,562 snapshot preview checks plus
whole-output control equality. Do not assume additional accessor calls are
passive; preserve this observer lesson alongside the C:\temp and LOOP rules.
The internal RX mechanism is unresolved. No clock changes or debugger attach
were needed for this milestone.

At that checkpoint, initial boundary-map production around WRITE-LIST-TO-FILL-MAP
was next, followed by connecting these helpers to SUBFORM POST-FILL. CFORM
POST-FILL, iris branching, subpart brush changes and the integrated JS caller
remain open. POST-FILL's separate value-2-to-1 branch is still unobserved.

### Previous POST-FILL checkpoint

The SUBP-COUNT writer is located inside POST-FILL's SUBFORM method. Across two
complete paintings, all 427 MY-FILL calls have one matching POST-FILL child:
arguments, return values and count boundaries agree. All 181 observed count
changes occur inside the 278 SUBFORM POST-FILL calls. The other four observed
helpers have no entry/exit count change. Both paintings and scene reports
match fresh controls byte for byte.

Both actual POST-FILL methods and four ordinary helpers have unique complete
PLL matches and Ghidra reports. The SUBFORM method contains the SUBP-COUNT
reset and accepted-cell increment. REA imported/exported its standalone
Ghidra record with external-provider provenance.

Read [the POST-FILL findings](introspection/post-fill-count.md) and
[portable helper evidence](introspection/evidence/post-fill-helper-boundaries-20261005.json).
The independent SUBFORM helper now matches all 278 counts and returns and
1,130,814 captured output map cells, using complete original frame/map inputs
and natural PATCHDEX/CFORM-COUNT reader values. See
[the map evidence](introspection/evidence/post-fill-map-parity-20261005.json).
Both paintings remain byte-identical to controls. Only fill values 0/1 and
FLAG-BIT 32768 occur; the native 2-to-1 branch remains inferred. Cells outside
the captured rectangles are unobserved. CFORM-COUNT's scalar binding is
unbound in older tapes; the method uses its function to read a form's count.

FILL-STRATEGY's frame/map inputs and changes were the next boundary at this
checkpoint; the new comparison above now covers that step.
CFORM POST-FILL, iris branching and subpart brush changes remain open. Use
DOTIMES/DOLIST in probes: the rejected first map attempt hit a FILE-ERROR and
379 UNBOUND-VARIABLE conditions with LOOP, despite writable staging. Replacing
LOOP restored complete map capture and control-byte equality.

### Previous count and assignment checkpoint

Two complete paintings now measure the brush fill's count/assignment boundary.
All 274 natural selectors consume the count left by the preceding
`MY-FILL(SUBFORM, ...)` and match the existing JS selector. At the next
observed boundary, `BRUSH` equals the selected object or NIL. All 70 subpart
entries use that exact object; ten subparts change it to brush 1 by exit.
Both paintings and scene reports match fresh controls byte for byte.

Read [the count and assignment findings](introspection/brush-fill-count.md)
and [portable evidence](introspection/evidence/brush-fill-count-and-assignment-20261004.json).
Six ordinary functions and both actual MY-FILL methods have exact complete
PLL matches and standalone Ghidra reports. MY-FILL's generated generic
dispatcher has no PLL match and must remain distinct from its method bodies.
The methods specialize on EQL SUBFORM and EQL CFORM. Their computed calls
associated with `FILL-STRATEGY` and `POST-FILL` are static candidates.

Next, inspect/trace those helper boundaries, especially the computed call
associated with `POST-FILL` inside MY-FILL's SUBFORM method, to locate the
count writer. Helper arguments and types remain to be measured. The capture locates changes
inside MY-FILL but does not identify its internal writer. All 5,805 SCAN-ROW
entry/exit counts are unchanged. Argument geometry is bounded and partial;
capture full relevant frame/map inputs before porting the count algorithm.
No new engine implementation or unit tests belong to this milestone.

### Previous caller checkpoint

The first seed-1234 selector call now has a measured native caller path:
`DISPLAY-COLOR-PATCHES → BRUSH-FILL → SELECT-BRUSH`. Five named compiled
functions were linked to unique complete PLL objects by exact live-byte
matches. Standalone Ghidra decoded their payloads; two separate WOW64
hardware-breakpoint runs confirmed the return PCs. Both AA0 and scene reports
matched a fresh control byte for byte. The selector's existing exhaustive
integer behavior and JS implementation are unchanged.

Read [the caller evidence](introspection/select-brush-caller.md) and
[the native workflow](native-analysis-workflow.md) before another attempt at
Lisp disassembly or a provider setup. REA 3.2.1 was installed and used for
diagnostics and canonical external evidence import/export; its stock Windows
native provider rejected this host. Standalone Ghidra and the targeted WOW64
helper supplied the native evidence.

`C:\temp` still resolves to `research/artifacts/temp` on D:. Its documented
preflight, collisions, registry permissions and fresh-output rules are in
[oracle.md](oracle.md#ctemp-staging-and-permissions). The new optional pre-scene
probe/pause workflow records the staged probe hash and an owned pause request;
capture helpers release that pause on completion or setup failure. Run only
one oracle at a time and do not change the system clock.

The count/assignment investigation above follows that caller checkpoint.
SUBFORM post-fill has a measured JS comparison for the captured inputs;
the integrated JS caller and creation of those inputs remain unrecovered.
The notes below retain older checkpoints;
their earlier unresolved name-to-code and selector-caller limits are superseded
only for the exact matched objects and observed contexts documented above.

## Project identity

- Repository: `SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer`
- Working branch: `reverse-engineer-aaron-js`
- Goal: clean-room JavaScript reimplementation of the 2001 Kurzweil CyberArt
  AARON generator, while preserving the historical AA viewer.
- Source policy: do not publish reconstructed proprietary Lisp or redistribute
  the archived installer/extracted binaries. Keep normalized reports, hashes,
  probe scripts, and independently written implementations.
- Exactness policy: label results **Measured**, **Inferred**, or **Provisional**;
  passing a JS self-test is not evidence of original-engine parity.

## Current verified state (2026-09-26)

The `reverse-engineer-aaron-js` branch was checked out on the user's Windows
10 Pro 22H2 machine at `D:\ReverseEngineerAaron`, HEAD `4883d54` before this
local work. The verified archived installer was extracted under ignored
`research/extracted/` without running it. The local scene oracle
[`oracle/run-local-scene-state.ps1`](oracle/run-local-scene-state.ps1) patches
only disposable runtime DLL copies, uses the existing ordinary `C:\temp`
directory, and restores its temporary files and per-user registry values.
It runs without changing the Windows system clock. Exact steps and patch
scope are in [`oracle.md`](oracle.md).

One corrected baseline and two fresh post-`INIT-RANDOM` seed-1234 scene probes
completed. The two seeded scene reports are byte-identical (SHA-256
`ca0d9ecf0ca238e8c243676ceff4e42f028f533f11df36663bc83368a4549b5b`),
as are their complete AA0 files (SHA-256
`0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1`).
The first `DRAW-CFORM` entry occurs before the outermost `RPARSE` return.
At the first `SCREEN-AND-STORE`, `MPLAN` is a `PLAN`, `BRUSH` is a
`PAINT-BRUSH`, `RPLANE` is a fixnum, and `RGB-MAP` has become a nonempty
list of `AARGB` objects. This is bounded state evidence, not a recovered
composition rule. The reports and detailed values are in
[`scene-context-findings.md`](scene-context-findings.md).

Two further local seeded runs with transparent `PREP-LINE` and `STORE-IN-FILE`
wrappers yielded identical seven-snapshot reports and the same complete AA0
bytes as the simpler seed control. The first `STORE-IN-FILE` entry occurs
before outermost `RPARSE` returns, with `RGB-MAP` still `NIL` and `BRUSH`
unbound. The first `PREP-LINE` entry occurs later with arguments `NIL` and 5,
`RGB-MAP` populated, `BRUSH` a `PAINT-BRUSH`, and `RPLANE` 79. Entry/exit
summaries of the 15 tracked bindings agree for each first call; untracked
state and stream effects remain open. The retained writer report hash is
`3c142146407a3d7bcb82f58147a832f71bb0a00324dcf246da9b12655c63ce1f`.

The newer windowed writer capture records 299 natural calls from a complete
seed-1234 painting, covering all nine selectors it uses. The original
`PREV-STORED-PT` is observed before and after every sampled call, starting at
`(0,0)`. The JS writer matches all 299 output byte slices and previous-point
transitions in `small` hop mode. Two local runs have identical reports and AA0
hashes. The retained fixture, method counts, and scope are documented in
[`stroke-findings.md`](stroke-findings.md). This is bounded file-writer parity;
the composition and screen paths still need reconstruction.

The active next steps are in [execution-plan.md](execution-plan.md): complete
continuous writer replay, with brush-selection and natural FREE-PATH work in
parallel, then move to a complete drawing unit with higher-level inputs. PLAN
metadata should be targeted when a selected caller needs it. The JS
planner, colour pipeline, figures, and whole-painting generation
remain far from exact parity. The local code changes and evidence have not
been published by this checkpoint; inspect `git status` before continuing.

## Earlier 2026-09-08 checkpoint

As of 2026-09-08, the recovered checkout is clean at local commit
`311792d321b52e0980faf8f6a49e46f69598a4a0` (`Add independent DXL
control-flow profile`), and the connected branch is published at
`decd0f150202039b915ed1815533c3527335d128` with the same changed-file tree.
The current direct matrix source remains in the earlier edge checkpoint. Its
pre-index content ended at
`1c78085fbc3e5430db84002ecd05105c2cf9d86f` after the edge evidence
publication; the static-index publication was verified at
`b33a90bb7462a0e853678a216eb80ce93948068b`.
The connected branch has different ancestry/SHA values from the local
checkout, so compare the tree and files rather than assuming commit IDs are
identical.

The current local static-code checkpoint adds an anonymous bounded x86-like
control-flow profile at
[`introspection/static-code-profile.json`](introspection/static-code-profile.json),
generated by [`tools/profile-x86-candidates.mjs`](tools/profile-x86-candidates.mjs)
from the preserved DXL and complete extracted PLL. It profiles all 190 aligned
`55 8b ec 56` candidates and records 28,594 linear instruction rows, 80,196
decoded bytes out of 80,524 payload bytes, 200 invalid/byte-fallback rows,
4,271 direct relative transfers, 2,986 indirect calls, 33 targets landing
inside another linear instruction, and 5,638 conservatively recursive rows.
The separate assumed-indirect-call-return view reaches 22,694 rows and 64,470
bytes after continuing through 2,555 indirect call sites, while indirect jumps
remain unresolved. It also retains 28 shifted-start controls, three exact
66-byte PLL/DXL anchor profiles with matching normalized transfer structure,
and 24 bounded PLL decoder-reference windows. A fresh independent worklist at
each branch target reaches 5,670 conservative instructions / 15,278 bytes and
22,795 assumed-return instructions / 64,808 bytes, with no target/interior
boundary conflicts in this image; it continues through 2,561 indirect calls
and leaves indirect jumps unresolved. The report is 873,511 bytes;
per-candidate scalar summaries and detailed control-window transfer lists are
both retained, while redundant per-candidate transfer arrays are omitted. This
is anonymous
byte-interpretation evidence; it does not assign names, entry points,
relocations, calling conventions, source modules, or Lisp semantics. The new
parser and fixture are covered by the research suite.

This checkpoint required no Windows execution. The bundled local Wine files
are present, but the host cannot launch the 32-bit loader and the 64-bit
launcher is blocked by the local `wineserver` socket policy; the known-good
Windows Server 2022 GitHub runner remains the oracle for original-engine
measurements. Local verification is 76 engine tests plus 39 research-tool
tests. Overall completion remains approximately 35–40%: structural recovery
has advanced, while composition, pose/anatomy, occlusion, colour, integrated
brush/fill/emission, and normal startup-seed semantics remain open.

The latest published change adds:

- `engine/src/aaron-hand.js`, implementing the measured zero-argument
  `RAN-HAND` helper;
- `engine/test/fixtures/ran-hand-post-init.json` and
  `engine/test/aaron-hand.test.js`;
- normalized original-engine evidence at
  `research/introspection/evidence/ran-hand-post-init-34120567298.txt`;
- updates to the plan, oracle notes, and freehand-line notes.

The newest local-first checkpoint also adds accepted planner-frame metadata,
an opt-in measured `FREE-PATH` outline adapter with a separate RNG stream,
fixture-backed integration tests, and the 900-case invariant sweep documented
in `research/clean-room-integration.md`. No Windows run was needed for that
checkpoint.

The current brush checkpoint also adds a strict Stage 23 report parser and
the retained original-engine captures at
`research/introspection/evidence/brush-stroke-isolated-34145100465.txt` and
`research/introspection/evidence/brush-stroke-isolated-34145707021.txt`.
The corrected four-case capture reproduces the 12-, 26-, 70-, and 108-cell
adjacent horizontal footprints for brush IDs 1–4, with one screen-forwarding
call and clean return per case. The overlap capture adds the repeated
`(7,7)→(8,7)→(7,7)` path: the same 12 unique cells, one screen call with all
three points, and 27 predicate calls. The edge capture adds
`(0,0)→(1,0)`: one screen call, one partial fill cell, then `SIMPLE-ERROR`
under the forced predicate. The earlier run `34144809281` is deliberately
non-evidence: a stray probe marker stopped it after b2. The probe must remain
in direct top-level form for now; compiled helper variants failed before their
first resolution marker in the Allegro init-file harness. The next frontier
is real scene context and downstream emission.

The first local static-image index is now also retained at
`research/introspection/static-image-index.json`, generated by
`research/tools/index-allegro-image.mjs` from the complete extracted PLL and
the preserved DXL. It validates the PLL's 7,723-record first table and
53,039-record tagged string table, resolves every indexed object and NUL
terminator, matches all 1,347 dynamic function names, and cross-references all
50 `harold3` `.fasl` markers with the 50 DXL `.lisp` module names. The runtime
PLL copy is only a 3,740,160-byte prefix of the 4,573,464-byte library; use the
complete extracted file for static work. Exact references for `BRUSH-STROKE`,
`FILL-MAP`, `PAINT-BRUSH`, `RAN-HAND`, and `MPLAN` are recorded in
`research/static-image-findings.md`. These are offsets and name/binding
cross-references, not recovered Lisp source or object semantics.

The static parser now additionally validates all 7,723 first-table object
spans: every object is tagged `0x6c`, every header length agrees with the
record, sorted spans tile exactly to `0x2b4b90`, and all alignment padding is
zero. This proves structural code-like object boundaries only; it does not
map `MPLAN`, `BRUSH-STROKE`, or other names to objects. The package-qualified
scene target checklist is retained at
`research/introspection/scene-context-dossier.json`, with its interpretation
in `research/scene-context-findings.md`.

This continuation also added the reproducible scene-context dossier and its
builder, joining 16 package-qualified targets to the static index, retained
constant references, and four state checkpoints from run `34099250163`.
It deliberately stops at target selection: no opaque heap pointer or named
function boundary has been inferred. The local and connected trees were
checked byte-for-byte for all changed paths after publication.

The latest local-only static pass extends the image index without executing
the archived runtime. It records the arithmetic layout of all four DXL header
descriptors: their first-word ranges tile `0x010000–0x500000`, header words
`0x18`, `0x1C`, and `0x54` agree with the corresponding endpoints, and the
unassigned image prefix/suffix are `0x10000`/`0x20000` bytes. It also validates
the 53-object tagged-string chain at `0x1B65E8–0x1B6FA8`, containing 50
`harold3` paths, one interface path, and the auxiliary basenames
`review-s.lisp` and `local-f.lisp`; 101 of its 172 alignment bytes are
nonzero. These are structural facts only, not loader or relocation semantics.

An independent bounded cross-image search also rejected a tempting
name-to-object arithmetic match under shifted-offset controls. No defensible
function-name map, source dependency order, or relocation decoder has been
promoted. The exact normalized report and parser/test coverage are the source
of truth for this pass. A follow-up comparison also confirms that the DXL and
PLL retain the same 50 core module names in different orders (zero-item common
prefix), so neither string order is being treated as execution order.

The current local implementation checkpoint adds two explicitly provisional,
measured-input integrations. `planFigureFrames` now turns accepted planner
placements into rectangular frame contracts, and the generator fits each
figure into its accepted frame while retaining placement metadata. An
independent 900-case local sweep found 881 accepted placements with zero
containment, overlap, exception, or count-mismatch failures. The opt-in
`free-path-subset` outline mode connects the measured `FREE-PATH` primitive to
closed figure outlines using a separate seeded RNG stream, so it does not
change scene random consumption. Its local fixture records 3,026 and 2,909
outline operations for the two seed cases. These are clean-room integration
scaffolds, not claims about the archived caller policy; the exact boundaries
and sweep are documented in
[`clean-room-integration.md`](clean-room-integration.md).

The newest local-only checkpoint adds two further boundaries without executing
Windows. The static image index now compares every validated PLL compiled
payload against the DXL and records three exact anonymous 66-byte anchors.
All 7,723 PLL payload hashes are distinct; each anchor has the same `0x216c`
header and an aligned candidate object start, while no padded object span is
identical. These are structural cross-image anchors only—no function name,
entry point, relocation, or module is assigned. The implementation and exact
hashes are documented in [`static-image-findings.md`](static-image-findings.md).

The scene manifest was also hardened into a verified attribution boundary. It
now binds finalized captures to dimensions and palette, stores per-shape stage
hashes, rejects duplicate IDs/repeated stage assignments and gaps/overlaps,
and deep-copies replay slices so replay cannot freeze or alias the source
document. The three-case local fixture now retains full serialized-AA hashes
as well as stage hashes. This remains provisional clean-room instrumentation,
not recovered AARON scene semantics.

The same static pass now inventories a distinct DXL candidate set without
executing Windows: 6,671 byte-offset `0x6c` headers reduce to 1,511 bounded
headers and 190 eight-byte-aligned objects with the common `55 8b ec 56`
prologue. The prologue appears at none of the other seven alignment residues.
The offsets and length/padding metadata are retained under
`dxl.compiledObjectCandidates` in the static index. This strengthens the
structural report but still provides no defensible symbol-to-code mapping.
The index also retains a tagged-pointer control: the proposed
`0x20000000 + string-object-offset + 1` encoding matches 42,798 nonempty PLL
records, while nearby shifts match 42,781–42,809, so the apparent coverage is
not promoted to a reference decoder.

Finally, the measured dependency-isolated brush boundary is now represented by
`applyMeasuredBrushStroke`: an explicit `IN-SUB-FRAME` predicate gates the
measured core-mask writes, while a nontrivial path is forwarded once to an
explicit `SCREEN-AND-STORE` callback with CDEX/SDEX. Tests preserve the 27-call
repeated-path and 18-call adjacent-path predicate counts, direct values, and
single screen-forwarding call. The generator still does not use this adapter;
its downstream screen/file, colour, clipping, and brush-state behavior remain
open.

Local verification:

- `cd engine && npm test` → 76 passing tests.
- The brush report parser and its real original-engine captures are covered by
  the research-tool suite.
- Research-tool tests are run directly with
   `node --test research/tools/test/*.test.mjs` from the repository root; the
   `research/tools` directory has no separate `package.json`; the suite now has
   39 passing tests, including module adjacency, compiled-payload identity, DXL
   candidate-residue validation, tagged-pointer controls, and the anonymous
   control-flow profile.

## Scene-context probe boundary

`research/introspection/scene-state-snapshot.cl` loads the validated call
trace and adds observation wrappers around `RPARSE`, `DRAW-CFORM`,
`SCREEN-AND-STORE`, and `MAIN`. It records only bounded scalar/type/list/array
shape summaries for 15 package-qualified bindings. It does not print live
objects, manufacture a `PLAN`, or call unverified readers. The parser checks
target installation, unique binding rows, marker completeness, and explicit
non-observations. The companion uses `UNWIND-PROTECT` to maintain depth and
finalization state while preserving original conditions and nonlocal exits.
The local Windows baseline and two seeded repeat controls have all passed
those checks; their report details are linked in the current state above.

## Honest progress estimate

Overall completion is approximately **35–40%**. The archaeology, AA protocol,
fixtures, static-analysis tools, numeric primitives, several isolated
stroke/map/writer boundaries, and the local composition/outline attribution
seams are now strong. The high-level artistic decision system is still mostly
unresolved, so this is not yet a parity-equivalent generator. The increase is
measurable infrastructure and structural evidence, not a claim that half of
the historical scene rules have been recovered.

| Area | Current state |
|---|---|
| Installer/runtime preservation and isolated oracle | Complete and documented |
| AA parser, renderer, serializer, corpus tools | Mostly complete for observed records |
| Allegro random source and numeric boundaries | Strongly measured; normal startup seed remains unresolved |
| Angles, distance, `LOCK-WIGGLE`, measured `FREE-PATH` subset | Measured fixtures and implementations |
| Stream/writer selectors | Isolated behavior measured; 64 consecutive natural VECTOR calls now have exact VISPT points and stream slices through byte 1224 of the AA0 command suffix, all matched by JS. Remaining integrated calls and screen state remain open |
| Brush profiles, maps, isolated `BRUSH-STROKE` subset | `SELECT-BRUSH` is now measured for every integer from 0 through 200,000 and matches in JS; 52 diagnostic integers also sample nearby out-of-range behavior. Brush-stroke footprints and an edge error boundary are measured. Integrated brush assignment, clipping, fill, and colour remain open |
| `RAN-HAND` | Four repeated post-`INIT-RANDOM` calls measured and implemented |
| Local composition frame integration | Accepted planner frames now control provisional figure count and geometry; 900-case sweep has zero invariant violations |
| Local `FREE-PATH` outline integration | Opt-in clean-room mode is deterministic and fixture-tested; caller policy and clipping remain unresolved |
| Static module/payload cross-image analysis | 50-module adjacency negative control, three exact anonymous payload anchors, 190 DXL prologue candidates with residue controls, and tagged-pointer shift controls; no names or execution semantics assigned |
| Scene geometry/emission attribution | Frozen, document-bound manifest with per-shape ranges/hashes and isolated replay slices; semantics remain provisional |
| Composition, figures, poses, plants, garments, occlusion | Mostly provisional/unresolved |
| Integrated JS generator | Runnable and deterministic, but not original-equivalent |

Important measured evidence already preserved in the repository includes 6,140
integer/random validation values, 512 floating `RAN` values plus 64 state
checks, 320 `LOCK-WIGGLE` paths, 16 controlled `FREE-PATH` cases, 240
isolated writer cases, brush/map matrices, and bounded integrated traces into
planning, figure generation, fills, brush work, and painting output.

## What is still open

1. Complete the freehand line algorithm and connect it to `DRAW-CFORM` and
   brush output.
2. Recover brush selection, clipping/overlap, fill maps, colour transitions,
   and real screen/file emission.
3. Recover normal startup random-state installation and generator draw order;
   use the controlled post-`INIT-RANDOM` reseed only as a calibration seam.
4. Replace the provisional planner with measured composition, placement,
   pose/anatomy, plants, pots, garments, depth, and occlusion rules.
5. Build integrated seeded holdouts and compare structural traces, state
   consumption, and AA output against the original.
6. Productize the recovered engine without presenting provisional behavior as
   exact parity.

The new frame and outline integrations make the local engine more measurable,
but they do not reduce the main historical uncertainty: AARON's own scene
planner, figure rules, clipping/brush policy, and downstream emission. They
should therefore remain opt-in or clearly labelled provisional until an
original-engine trace supports their caller semantics.

## Earlier investigation frontier (superseded)

The following records the prior frontier. The active order is now
[execution-plan.md](execution-plan.md), linked at the top of this handoff.

Use the local-first workflow:

1. Continue with local implementation and fixture inspection first. The
   static image index now includes the validated DXL descriptor/source chains,
   and the negative reference scan shows that raw heap arithmetic cannot safely
   replace runtime context. Use the object-span report and scene-context
   dossier to choose conservative read-only runtime targets, then inspect the
   existing brush-stroke, map, integrated-trace, and new clean-room integration
   fixtures locally.
2. Extend behavior already supported by evidence in the JS model and tests.
   Use the measured `SELECT-BRUSH` rule, and continue investigating integrated
   brush assignment, clipping, and scene semantics from original-engine traces.
3. When a new original-engine observation is required, use the local Windows
   10 oracle with a narrowly scoped probe, preserving a baseline and restoring
   wrappers/bindings with `UNWIND-PROTECT`. Use the Windows Server 2022 GitHub
   Actions workflow for cross-host checks or if local execution fails.
4. Record normalized evidence and update the roadmap before promoting a rule
   from provisional or inferred to measured.

The local transition probe now brackets `RPLANE`, `RGB-MAP`, and `BRUSH`
changes between selected natural calls, and a naturally invoked `SCRIPT(PLAN)`
returns `NIL` then a one-element `BLOX` list. The next oracle frontier is the
actual state mutator/caller sequence, the content and use of the returned
`BLOX`, or other integrated writer selectors and screen effects. A 64-call
natural VECTOR sequence exposed and corrected the JS formatter's non-tie
rounding, then validated later line continuations and breaks. These
observations do not yet justify an exact JS scene rule.
Existing high-fanout wrappers should be removed only deliberately so later
brush, fill, and message-loop calls become visible without changing the
original call graph.

## Execution split and model handoff

- Local Windows work: JavaScript implementation, parsers, fixture generation,
  report normalization, static analysis, tests, documentation, and bounded
  original-engine execution from disposable runtime copies.
- Windows Server 2022 Actions remains an independent oracle environment for
  cross-host checks.
- Use GPT-6 Luna at Max effort in successive batches for bounded investigations,
  candidate algorithms, capture tooling, implementations, and independent
  validation. The primary agent reviews probe design, ambiguous semantics,
  integration, and exactness claims. See the active plan for initial packets
  and file ownership; keep shared local oracle runs under one owner.

## Resume checklist

1. Read this file, `research/execution-plan.md`, then relevant roadmap evidence.
2. Check the branch and worktree; preserve any unrelated user changes.
3. Run `node --test --test-isolation=none` in `engine/` and
   `node --test --test-isolation=none research/tools/test/*.test.mjs` from the
   repository root on this machine. The default parallel test-worker launch
   is blocked by the current sandbox.
4. Inspect the newest evidence under `research/introspection/evidence/` and
   the referenced probe before making a claim.
5. Report progress, remaining work, next action, and blockers in the next
   user-facing continuation update without waiting to be asked.
