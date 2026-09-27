# Next AARON execution plan

Prepared and updated 2026-09-27. This is the active work order; the older investigation
queue in [the roadmap](reverse-engineering-plan.md) is historical reference.

**Progress:** Milestone 1's complete writer and AA0 replay is achieved for
controlled seeds 1234 and 5678. JavaScript carries writer state through 28,075
and 33,198 original calls, respectively, and reproduces every command byte.
Given the original files' parsed palette values, it also serializes the AA0
prelude and composes both complete byte-identical paintings. The 25-case
original SELECT-BRUSH matrix now has a matching JavaScript selector. The next
priority is to replace original writer decisions and palette values with
upstream JS rules. All three natural seed-1234 FREE-PATH calls and the one
natural seed-5678 holdout call now reproduce their complete point lists and
following RNG states. A first path-to-writer drawing unit is measured; palette
construction and scene-level decisions remain unresolved.

The target is independent JavaScript generation from an explicit seed and
configuration. The fastest route is to finish one complete output boundary,
then repeatedly move its inputs upstream: writer arguments, paths, forms,
scene geometry, and finally seed-driven planning. Each step should reduce the
information supplied by the original program.

## Starting point

- The local Windows oracle completes controlled seed-1234 paintings in about
  20 seconds. Repeated complete AA0 files have SHA-256
  `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1`.
- The full seed-1234 painting has 28,075 writer calls. Continuous JavaScript
  replay matches every original command slice and previous-point transition.
  The distinct seed-5678 holdout has 33,198 calls and also matches in full.
- The seed-1234 `image` command stream is 124,575 bytes and equals the AA0 suffix
  at offset 2381. An original-style serializer reproduces the 2,381-byte
  header/palette from parsed semantic palette values, then composes the exact
  AA0. Seed 5678 likewise matches with a 156,452-byte command stream.
- RNG, FREE-PATH, brush masks, and several geometry helpers have comparison
  fixtures. The composition, figure, colour, and integrated drawing code is
  still partly or wholly provisional.
- Use the established post-INIT-RANDOM reseed for calibration. Normal startup's
  process-dependent seeding can be recovered after the drawing pipeline works.

Evidence: [stroke findings](stroke-findings.md),
[scene context](scene-context-findings.md), and [random findings](random-findings.md).

Relative effort: brush selection is the smallest semantic task; continuous
writer replay is a contained tooling/integration task; natural FREE-PATH
validation is a moderate extension of an existing port. Complete forms and
scene generation have substantially more unknown dependencies. Finish the
first three while using their results to choose the larger work precisely.

## 1. Reproduce the complete writer stream from recorded decisions — achieved for two seeds

This is the first completion target. Extend the existing writer probe into a
compact complete capture, with an explicit call/byte cap and a failure marker
if it truncates. Record typed arguments, mode changes, call order, entry/exit
state, and output positions. Preserve numeric precision and distinguish a
closed stream from a failed method. Avoid opening a report for every tiny
field if that makes the full capture unnecessarily slow.

Build a JS replay command which initializes the writer once and carries its
state through the complete sequence. Captured previous-point values are
assertions, not replacement state fed into each call. If a binding changes
between writer calls, identify its real owner and record an explicit boundary
event rather than silently resetting the JS state.

The comparison should report the first differing call, input, byte offset,
expected output, actual output, and previous state. Account for every stream
byte and any gaps or writes outside STORE-IN-FILE. After the command stream
matches, serialize the header/palette from captured semantic values and check
the complete AA0 file. A copied prefix must remain an explicit dependency.

**Gate 1A:** all original writer calls replay with continuous JS state,
matching every output slice and observed state boundary, and the complete
command-stream bytes/hash match. Sequential ordinals, successful exits, and
selector totals check capture coverage; they do not replace byte/state checks.
The seed-1234 scene has no DIMS selector call; account for dimensions and
palette/header initialization separately. This gate is an independently useful
completion point and should not wait for header recovery.

**Gate 1B:** reconstruct the file wrapper from semantic values, compare the
entire AA0, and repeat on seed 5678 using the same algorithm and declared
configuration. This can proceed alongside the upstream work. The local runner currently
exposes seed-1234 modes, so reuse the existing 5678 startup probe or add a
validated seed parameter as part of this work. Existing 1234 and 5678
are calibration/validation cases; reserve a further seed for a fresh holdout.

**What this proves:** complete file construction from original decisions. The
original program still supplies those decisions. Reading or copying AA
commands alone does not satisfy this milestone.

The complete capture, replay tool, composed-AA0 comparator, and compact
evidence summaries are now retained. Raw tapes and paintings stay ignored
under `research/extracted/`. Both controlled seeds pass Gate 1A and the
captured-palette scope of Gate 1B. Recovering the seeded palette algorithm
and painting decisions belongs to the upstream milestones below.

Keep complete raw captures and generated pictures under ignored
`research/extracted/`. Retain the probe, replay tool, hashes, compact summaries,
and enough bounded original cases for portable regression tests.

## 2. Recover two useful upstream rules in parallel

### Brush selection — measured matrix implemented

SELECT-BRUSH was the smallest promising decision function. Its 25-case matrix
now includes all selectable band boundaries, low-gap values, two out-of-range
samples, and the natural `7131 -> brush ID 2` call. JavaScript matches every
observed case. The 0–100 samples return NIL, bands are low-exclusive and
high-inclusive, and the two tested tails return brush 6. The original painting
and scene-report hashes remained identical to the controlled baseline.

The matrix used real startup brush objects and recorded result identity,
binding changes, and copied-state random previews. Tail extrapolations and
fractional inputs remain unmeasured. The implementation does not claim
integrated brush assignment.

If the painter needs the BRUSH assignment next, bracket BRUSH-FILL and
BRUSH-FILL-SUBPART around SELECT-BRUSH/RECORD-BRUSH, comparing object identity
as well as ID. Only pursue this mutation detail when it enables integration.

### Natural FREE-PATH calls — first controlled corpus matched

The JS helper passed isolated cases. The controlled seed-1234 scene has three
natural calls, not the historical 18 from a truncated trace. Their typed
input edges, returned points, unchanged inputs, unbound index bindings, and
RNG previews are retained in a strict, non-evaluating parser and compact
evidence file. The three complete paths and following RNG states now match
in JavaScript, with 136, 28, and 37 raw random words consumed. The independent
seed-5678 holdout has one natural call; its 47 points and following state also
match, with 133 raw random words consumed.

The comparison reconstructs each incoming RNG state by scanning the verified
seed stream for the three copied-state previews; each has one match in the
search window. Recorded random returns diagnose the third call's early stop,
but the JS replay computes its own random values. An explicit per-edge type
decision resolves mixed single/double inputs. A new retained regression case
checks all three paths independently of the ignored raw capture.

**Next gate:** check the inferred distance-stop condition near its numeric
boundary and validate other scene configurations. Brush selection and the
natural path calls in both controlled paintings are implemented.

## 3. Produce one complete drawing unit from higher-level inputs — point emission measured

The first eight natural `SCREEN-AND-STORE` inputs for each of two independent
seeds reproduce 2,014 exact original writer bytes in JavaScript from 551
captured path points and 28 captured colour-change events. The point-to-writer
rule is recovered for these 16 units; colour-event selection, RNG consumption,
and map effects are not yet generated. The compact fixtures check each call
against the complete writer tape and the corresponding original byte slice.

The controlled transition report did not observe a call to
`MAKE-PAINTING-COLORS` or `MAKE-COLORSPEC` before the painting completed, so
those are poor immediate palette targets for this scene. The first observed
`ASSIGN-COLORS` entry already has a populated `RGB-MAP`; identify its producer
inside the preceding display/colour phase before attempting palette logic.

Use the full writer comparison to attribute output to its callers. Capture
call IDs/parent IDs around a small number of actual drawing boundaries rather
than tracing every helper indiscriminately.

Use a short natural SCREEN-AND-STORE/PREP-LINE path as the continuing target: it
connects the measured brush-path forwarding to writer decisions. Capture it
inside the existing seeded scene, where the real PLAN, brush, colour, and
plane context already exists. Its earlier isolated failure at an unbound
MPLAN is evidence of missing context, not evidence that the natural path is
unusable.

In parallel, assess the early INITIALISE-PICTURE-PLANE/DRAW-CFORM outline route
for a smaller complete unit. Its early execution and unchanged tracked globals
do not establish a simple body. Switch priority only if a focused observation
shows a closed input/output contract that can be implemented sooner. The early
outline route and later paint route must not be assumed identical.

Capture its geometry/path, brush and colour inputs, visibility/map context,
RNG boundary, dependency calls, and full writer subtrace. Implement enough of
the caller to generate that subtrace in JS. Advance from a path to a complete
form, adding clipping, occlusion, or preparation rules only as the selected
unit requires them. Stubbed dependencies remain explicitly recorded until
their implementations replace them.

**Done when:** a JS routine accepts the original higher-level inputs and
generates the entire unit's command bytes plus relevant state/map changes.
It must compute the downstream writer calls rather than read them from the
fixture. Validate another input/call before widening the target.

## 4. Paint a whole captured scene in JavaScript

Expand the recovered drawing unit across all forms used by the reference
painting. Capture geometry, materials, ordering, and incoming state at the
natural handoff to drawing. RPARSE and drawing interleave, so a single snapshot
at the end of planning may be insufficient; preserve the actual sequence of
form events and shared-state transitions.

Recover missing fill, colour, and visibility rules in the order the first
divergence identifies them. Reuse the writer and natural geometry comparison
tools. Provide a visual comparison alongside byte and state results.

**Done when:** JS produces the complete original AA0 from captured upstream
scene/form data, including palette/header handling, without captured strokes
or writer calls. This establishes a complete painter for that supported scene
family; the original still supplies scene decisions and geometry.

## 5. Replace captured scene decisions with generation

Move upstream through one object/form family and its planner decisions at a
time. Begin with the simplest frequently used object whose inputs and outputs
are readable. Use the existing DEVELOP-PLAN/RPARSE/GENERATE-PERSON/BUILD-FIGURE
random-context evidence to locate the first divergence; avoid rewriting the
whole planner from visual resemblance.

Do focused PLAN/BLOX metadata discovery when a chosen caller needs it. Recover
verified slot/accessor contracts and concrete mutations before implementing
their meanings. Measure palette creation, object order, placement, geometry,
and random consumption with independent holdouts.

**Done when:** the JS generator takes only a declared seed/configuration and
creates a complete matching painting, without original code, captured
geometry, captured random returns, or captured command sequences. Broaden the
claim only after other seeds and supported configurations also match. Recover
the archived normal startup seeding separately from the controlled reseed.

## Agent organization

Use GPT-6 Luna at Max effort for independent investigations, candidate
algorithms, parsers, fixtures, implementations, and validation. The primary
agent chooses the next boundary, reviews uncertain semantics and probe
changes, integrates results, and decides what the evidence proves.

This session has four active agent slots: the primary plus three Luna workers.
Use successive waves as needed. A useful first allocation is:

| Owner | First work packet | Reviewable result |
|---|---|---|
| Primary | Complete-capture schema, probe review, serial oracle runs, integration | Deterministic full capture and decisions about unexplained state/writes |
| Luna A | Continuous writer replay and first-difference tool | Runnable comparison using the agreed schema; original state used only for assertions |
| Luna B | SELECT-BRUSH evidence/matrix design, then measured JS implementation | Boundary cases, candidate rule, original-vs-JS comparison |
| Luna C | Natural FREE-PATH data contract and comparison harness | Corpus parser and point/RNG mismatch report |

Rotate a worker into independent review after its deliverable lands. Later
waves own distinct path, map, colour, or figure routines with explicit file
ownership. Give each worker a bounded question, evidence paths, allowed edit
scope, completion check, and uncertainty list. Workers may propose semantic
hypotheses and tests; an untested hypothesis is not accepted as an exact rule.

Only one oracle process uses the shared `C:\temp` and AARON registry namespace
at a time. Queue those runs centrally while workers analyze captures or code.
Batch related cases into a reviewed probe; verify that observational changes
preserve the controlled original output. Extra workers should address distinct
dependencies or independently check a risky result.

## Keep work focused

- Preserve a local checkpoint of the completed changes before large new edits;
  inspect the current dirty worktree and retain existing work.
- Put the experiment's question and acceptance check before the run. A useful
  batch delivers an exact routine, a completed pipeline boundary, a concrete
  first divergence, or a disproved hypothesis that changes the next step.
- After complete writer replay passes, shift effort upstream. Additional
  writer probes should address a specific observed mismatch or new mode.
- Use static disassembly/ReAgent only for a specific native dependency that
  runtime observation cannot resolve. Broad binary inventories, Windows UI
  emulation, compatibility tuning, and visual embellishment are not the next
  bottleneck. Preserve screen-related calls/state when they affect output.
- Keep the provisional demo usable; add recovered modules without tuning
  guessed composition rules to one reference image.
- Reports should state the input still supplied by the EXE, the largest
  complete output produced by JS, tested seeds/configurations, and the first
  remaining mismatch. Test counts and sampled-call counts are not percentages
  of the generator recovered.

The next working session should begin with milestone 1 and the two independent
milestone-2 packets. Stop expanding the initial capture machinery once it
supports continuous comparison and move to the first upstream unit.
