# BRUSH-FILL row and iris observations

## Scope

This milestone captures the natural `BRUSH-FILL` call stream around
`SCAN-ROW`, `PATCH-EDGE`, and `FILL-IRIS`. It targets non-unit scan-row jumps,
positive scan returns without a same-fill `PATCH-EDGE` start, and the observed
call relationship around `FILL-IRIS`. It does not recover a general row
schedule or an `FILL-IRIS` branch condition, and it adds no JavaScript
implementation.

The frozen observer is
[`brush-fill-row-iris-capture-v1.cl`](brush-fill-row-iris-capture-v1.cl),
23,185 bytes, SHA-256
`05f07d8312561ef7dd19641d4b0b3fb11105ac066ade801e15e3ddd2fb5b7bc8`. It wraps
`MAIN`, `BRUSH-FILL`, `FILL-IRIS`, `CFRAME`, `SCAN-ROW`, `PATCH-EDGE`,
`MY-FILL`, `SELECT-BRUSH`, `IDLIST`, and `CFORM-COUNT`. It records call and
return chronology, typed arguments and values, wrapper parents, selected
global bindings, map identities/dimensions, and EQ links from scan points to
patch starts. PATCH-EDGE cons contents and full map cells are omitted.

## Captures and controls

| Mode | Observed run | Bracketing uninstrumented controls | BRUSH-FILL parents | Paired calls / returns | SCAN-ROW | Positive scans | PATCH-EDGE | FILL-IRIS |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `writer-stream-seed-1234` | `brush-fill-row-iris-seed1234-20261012-d` | `brush-fill-row-iris-control-seed1234-20261012-a` / `brush-fill-row-iris-control-after-seed1234-20261012-e` | 60 | 27,146 | 6,894 | 126 | 125 | 2 |
| `natural-free-path-seed-5678` | `brush-fill-row-iris-seed5678-20261012-f` | `brush-fill-row-iris-control-seed5678-20261012-c` / `brush-fill-row-iris-control-after-seed5678-20261012-g` | 77 | 36,446 | 8,909 | 320 | 315 | 3 |

Both modes used the current 768×1080 scene. Each tape has a normal MAIN exit,
matching CALL/RETURN counts, zero observer errors or aborts, zero overflow,
zero depth/busy failures, and the observer's own terminal END. All nine
non-MAIN wrappers were restored. Each observed run is time-bracketed by fresh
same-mode controls. AA0, scene report, original image, image ID, and all 12
runtime files match both controls byte for byte. The evidence also revalidates
the staged source and runtime file hashes.

A separate read-only raw-tape audit found no discrepancies. It rechecked the
five transitions, all 446 positive scans, the 440 later one-to-one
`PATCH-EDGE` links by point and START EQ identity, the six unmatched scans,
the five NIL `FILL-IRIS` returns, and all 16 drawing/scene/runtime artifacts
per seed group.

The seed-5678 observation uses the `natural-free-path-seed-5678` mode because
the separate `writer-full-seed-5678` attempt did not produce a complete AA0
and summary. That incomplete attempt is excluded from this evidence.

## Measured row jumps

Five non-unit transitions occur in these captures. Each changes the wrapped
CFRAME identity, and each destination scan uses `Y = current frame LY - 2`.

| Mode | Previous Y → next Y | Delta | Previous → current CFRAME | Frame LY | Destination Y − LY |
| --- | ---: | ---: | --- | ---: | ---: |
| seed 1234 | 904 → 874 | −30 | 10527 → 10537 | 876 | −2 |
| seed 1234 | 1009 → 978 | −31 | 10541 → 10551 | 980 | −2 |
| seed 5678 | 1013 → 1009 | −4 | 9870 → 9884 | 1011 | −2 |
| seed 5678 | 1008 → 1000 | −8 | 23617 → 23633 | 1002 | −2 |
| seed 5678 | 1017 → 1008 | −9 | 23637 → 23651 | 1010 | −2 |

This is a repeated relation in five observed transitions, not a recovered
branch predicate. The capture does not show why the next CFRAME is selected,
whether other destinations occur in unobserved cases, or whether an unwrapped
helper lies between these wrapped calls.

## Positive SCAN-ROW returns and PATCH-EDGE starts

Across both captures, 440 positive scan returns each have exactly one
same-fill `PATCH-EDGE` start with the same captured EQ identity. Every such
PATCH-EDGE starts after its linked scan returns, and the captured scan-link
lists contain one link apiece. Six positive scan returns have no matching
`PATCH-EDGE` start in their active `BRUSH-FILL` wrapper:

| Mode | BRUSH-FILL ordinal | Scan Y | Current frame LY | Y − LY |
| --- | ---: | ---: | ---: | ---: |
| seed 1234 | 2 | 334 | 262 | 72 |
| seed 5678 | 21 | 1004 | 1002 | 2 |
| seed 5678 | 41 | 801 | 664 | 137 |
| seed 5678 | 52 | 947 | 941 | 6 |
| seed 5678 | 54 | 1049 | 1016 | 33 |
| seed 5678 | 56 | 1024 | 1010 | 14 |

The six samples rule out a universal claim that every positive scan result is
patched inside the same observed fill. Their Y-to-LY offsets range from 2 to
137, so these captures do not support a single cutoff. The trace does not
establish what later uses an unmatched point or whether an unwrapped call
accounts for it.

## FILL-IRIS and call-path limits

There are five captured `FILL-IRIS` calls. Their argument pairs are `(4, 1)`
and `(5, 1)` for seed 1234, and `(7, 0)`, `(4, 1)`, `(5, 1)` for seed 5678.
All return NIL. In each call, the captured global summaries and map
identities/dimensions are unchanged across entry and return; `CFORM-COUNT` is
unbound in every snapshot. For seed 5678, the first call sees a bound
`PAINT-BRUSH` object and the next two see NIL. The observer does not compare
map cell contents, so this is not evidence that the maps were untouched.

Every captured `FILL-IRIS` call has the active `BRUSH-FILL` call ID as its
immediate parent among wrapped functions. Likewise, every wrapped
`BRUSH-FILL` call has `MAIN` as its immediate wrapped parent. These are wrapper
stack relationships; unwrapped Lisp functions may intervene, so they do not
identify direct source callers. Argument meanings and the `FILL-IRIS`
condition remain unresolved.

## Portable evidence and limits

[`evidence/brush-fill-row-iris-20261012.json`](evidence/brush-fill-row-iris-20261012.json)
is 3,165,950 bytes, SHA-256
`18ff6115c16ba93c4b9245c72bf8a196ef29394219a8bdfa2e9622b8455a21f0`. It
binds 196 sources, including the 70-source REA payload analysis closure. Two
fresh executions of the offline derivation produced byte-identical evidence.
The capture tapes themselves remain in the local ignored oracle archive; the
portable record retains their hashes and lengths, not raw tapes or runtime
binaries.

The claims above are limited to these two modes and 768×1080 scenes. The
capture records map identities and dimensions, not complete map cells; it
omits PATCH-EDGE cons contents and does not prove complete RNG-state purity.
The wrapper chronology does not recover direct Lisp callers, general row
rules, `FILL-IRIS` conditions, or the value-0 painter. Older 320×480 captures
remain separate evidence.

The minified portable JSON uses positional arrays for dense timelines to keep
the file small. `scans` store `[id, ordinal, entry, return, Y, CFRAME-id,
form-EQ, frame-EQ, frame, point]`; `positiveScans` store `[scan-id,
matching-patch-ids, later-matching-ids, no-match, nearest-by-target]`. Nearest
targets are ordered `CFRAME`, `FILL-IRIS`, `MY-FILL`, `SELECT-BRUSH`,
`IDLIST`, `CFORM-COUNT`; each entry is `[target, previous, next]`, and nearest
references are `[id, ordinal, entry, return]`. PATCH-EDGE rows store
`[id, ordinal, entry, return, start, scan-links]`; IDLIST rows store
`[id, entry, return, result-count]`; CFORM-COUNT rows store
`[id, entry, return, values]`. The derivation helper keeps the same field order
in source comments.

The next investigation is the value-0 painting path, using the current
row/iris tape as a chronology reference rather than treating its five jumps
or six unmatched scans as general rules.
