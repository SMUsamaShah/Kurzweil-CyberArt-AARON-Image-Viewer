# ZERO-EDGE isolated call, 2026-10-11

## Question and acceptance

Measure one explicit original `ZERO-EDGE` call after normal `MAIN` returns,
using `MAKE-TRIPT(3,3,0)`, numeric `PERIM=0`, and a fresh zero-filled 7x7
UBYTE4 `FILL-MAP`. The meaning of PERIM remains a hypothesis. This is a
controlled input case, not a natural caller capture or a general traversal rule.

The probe temporarily binds `FILL-MAP`, `*PIC-WIDE*` and `*PIC-HIGH*` with
`PROGV`, then checks restoration outside that dynamic extent. It captures
all 49 scratch cells and direct start slots before/after, target multiple
values or its condition, copied three-draw RNG previews, and seven relevant
global bindings. It copies both original maps and checks identity, metadata
and all cells afterward. `PATCH-MAP` stays the original array: a target write
would be detected after the call, not prevented or rolled back.

Acceptance requires the observer's own INSTALL/READY, actual return or target
condition, completed case, COMPLETE/END, zero observer errors, no overflow,
unchanged original map contents/identities and bindings, and byte equality
with both fresh uninstrumented controls. The runner's `summary.complete`
alone does not satisfy these requirements. MAIN's original multiple values
and errors are preserved.

## Current control environment

Fresh writer-stream seed-1234 controls are:

- `zero-edge-single-control-seed1234-20261011-b`
- `zero-edge-single-control-repeat-seed1234-20261011-c`

Their natural map bindings are 768x1080 (829,440 cells), whereas the older
320x480 captures have 153,600 cells. The reason for the configuration change
has not been investigated. Today's captures must be compared to today's
control bytes. The isolated target's map is still the specified 7x7 scratch
map. The probe admits positive FIXNUM dimensions matching both original maps,
with a 1,048,576-cell cap, rather than assuming the earlier dimensions.

Both fresh controls are byte-identical:

| Output | Bytes | SHA-256 |
|---|---:|---|
| AA0 | 426,587 | `405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a` |
| `image` | 424,205 | `457793c43166f822d8ded53b1570c8cdc1b7db9da794425344b8669b0d8b5e8e` |
| `image-id` | 3 | `13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354` |
| Raw scene snapshot | 25,959 | `153374c2b52a86ca31e33c7102385d2a7c5c88267b50bcfa4947a608eb984ed3` |

## Excluded observer attempts

These completed drawings do not establish ZERO-EDGE behavior:

| Run | Frozen source SHA-256 | Report SHA-256 / bytes | Observer outcome |
|---|---|---|---|
| `zero-edge-single-seed1234-20261011-a` | `51403f9539b71e461e9b50be50aafd4c71782e518f8082f2b8ecb8e8244a5fe6` | `da844cde9f176a1d717f3fbdb2979a1cff93f7ed390f96a4ab3c1da8ad9dfdfd` / 5,194 | PROGRAM-ERROR before the snapshots; zero calls, incomplete case, one observer error |
| `zero-edge-single-v2-seed1234-20261011-d` | `516a8e2401501b4128231153c3c7053a888597281434105f3c97d84951ae3c31` | `cb8394a5d97dc58cc358bb52e24c4716428b03daf2f93d9495a63c4f4dffbd9b` / 5,230 | Condition text: `malformed if statement`; zero calls, incomplete case, one observer error |

Both attempts have COMPLETE/END but `case-completed=NIL`; all four output
files match both fresh controls. V2's new snapshot stage records never begin.
Its condition message and independent AST inspection identify the defect:
the post-MAIN IF has four operands because `(setf case-finished t)` is inside
the IF rather than after it. Balanced delimiters and the earlier limited
form audit did not catch IF arity. The static auditor now checks that shape.
The earlier map-size/flattening hypothesis is not established by these tapes.
This was an observer source error, not evidence of a C:\temp permission error.

V3 preserves both excluded sources and moves the IF closure. It also prints
the bounded acyclic summaries with `*print-circle*=NIL`, avoiding sharing
labels such as `#1=` that the strict offline parser intentionally rejects.
Object/list identity remains explicit in scalar report fields. Normal
ARGLIST and RNG-preview field shapes are retained.

## Accepted v3 observation

Run `zero-edge-single-v3-seed1234-20261011-e` completes one explicit call with
zero observer errors and no overflow. Frozen v3 is 76,091 bytes, SHA-256
`0f1fde96c9b76d902e9cd47ceb5f099c2bc5ac935e94b514639c6918ad810802`.
Its complete 113-line report is 20,165 bytes, SHA-256
`f992fd22bb7240b2ef309f8f30467b4143e161bc14978fadf85d9e85e98e323f`.

[Portable evidence](evidence/zero-edge-traversal-single-20261011.json) is
133,797 bytes, SHA-256
`f3f8bd05a54513ffebc3f14b61060e2108e47c25888a08a51eba53d3b3856685`.
The frozen [deriver](../tools/derive-zero-edge-traversal-single-evidence.mjs)
revalidates 166 source bindings, the native baseline's 56-source closure,
current/staged Lisp sources and runtime files, exact routing, observer
records and both controls. Its independent agent/root outputs are
byte-identical. It publishes observations rather than a general JS model.

| Observation | Captured result |
|---|---|
| Constructor | One TRIPT with direct FIXNUM slots `(3,3,0)`; metadata/constructor/call gates pass |
| ZERO-EDGE return | Exactly one value, printed type `NULL`, value `NIL`; no target condition |
| Supplied start object | X/Y remain `3,3`; Z changes from `0` to `6` |
| Scratch map | All 49 cells stay zero; reported changed-cell list is empty |
| RNG previews | Constructor and target checks are valid/stable at `(59,29,74)`; copied-state previews only |
| Global START | Present but unbound before, inside and after the dynamic bindings |
| Direction lists | Original identities and all eight numeric contents match afterward |
| Original maps | FILL UBYTE4 and PATCH UBYTE16 identities/metadata/all 829,440 cells each match |
| Restoration | Seven original bindings unchanged; restoration check outside PROGV passes |
| Outputs | AA0, image, image-id and raw scene bytes match both fresh controls |

The map-stage records also show both array limits as 16,777,216 and complete
flatten/copy operations for both 829,440-cell maps. The earlier size-limit
hypothesis does not explain the two excluded tapes; their IF source defect
was repaired without changing the snapshot method.

`NIL` does not mean the call is a no-op: this supplied point's Z slot changes.
The call count describes the explicit probe call only; ZERO-EDGE is not wrapped
and there is no natural-call census or direct-caller evidence here. The empty
returned-list summary records the NIL result, not an intermediate traversal.
Other globals and full RNG state are outside the observed preservation scope.

## Remaining work

Change one input at a time for small positive PERIM/direction samples.
This single case does not
establish PERIM's meaning, a traversal algorithm, other accepted inputs,
general map behavior, or general termination. Native code and its constant
list remain evidence of dependencies, not recovered Lisp semantics.
