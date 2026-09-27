# AARON project continuity handoff

This file is the short resumption record for future Aaron conversations and
agents. The full technical roadmap remains in
[`reverse-engineering-plan.md`](reverse-engineering-plan.md); this file keeps
the current state, constraints, and next move easy to find after a
conversation boundary.

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
| Brush profiles, maps, isolated `BRUSH-STROKE` subset | Early measured subset; a direct Stage 23 matrix reproduces adjacent brush-1/2/3/4 footprints, repeated-vertex idempotency, and an edge error boundary. One natural `SELECT-BRUSH(7131)` returns ID 2; thresholds, integrated clipping, fill, colour, and state remain open |
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
2. Extend only behavior already supported by evidence in the JS model and
   tests; do not guess at `SELECT-BRUSH`, clipping, or scene semantics.
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
