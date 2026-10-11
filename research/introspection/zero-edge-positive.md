# ZERO-EDGE: three positive PERIM samples, 2026-10-11

## Controlled inputs

Three separate original-runtime runs change only PERIM to 1, 2 and 3 from
the accepted [PERIM 0 case](zero-edge-traversal-single.md). Each constructs
`MAKE-TRIPT(3,3,0)` after original MAIN returns and calls the original compiled
`ZERO-EDGE` once, inside temporary bindings for a zero-filled 7x7 UBYTE4
FILL-MAP and picture dimensions 7x7. PERIM's meaning remains unresolved.

Each source has a unique loaded marker and report path. Its other gates,
snapshots, handlers and restoration checks are unchanged from frozen
single-call v3. Static form checks and independent source diffs passed before
the serial runtime runs. The static checks do not establish Lisp semantics.

PATCH-MAP remains the original live array. Both original maps are copied and
checked afterward; a write would be detected rather than prevented or rolled
back. The seven observed original bindings are checked outside PROGV. The
probe preserves original MAIN's multiple values and error propagation.

## Observed results

| PERIM | One returned value | START direct slots before | START direct slots after |
|---:|---|---|---|
| 0, previous separate capture | NIL | `(3,3,0)` | `(3,3,6)` |
| 1 | NIL | `(3,3,0)` | `(3,3,4)` |
| 2 | NIL | `(3,3,0)` | `(3,3,2)` |
| 3 | Proper list of five TRIPTs | `(3,3,0)` | `(3,3,0)` |

PERIM 3's complete returned order is:

| List index | Direct FIXNUM X/Y/Z | EQ supplied START | First EQ point index |
|---:|---|---|---:|
| 0 | `(3,3,2)` | NIL | 0 |
| 1 | `(3,2,4)` | NIL | 1 |
| 2 | `(4,2,6)` | NIL | 2 |
| 3 | `(4,3,0)` | NIL | 3 |
| 4 | `(3,3,0)` | T | 4 |

The five list points are distinct by the captured EQ comparisons. Its last
point is the supplied START object. The list itself and its final cons are
not EQ START. The report captures a proper, noncircular, nontruncated list and
consistent cons-chain flags. The initial coordinate repeated in index 0 is a
different point with Z=2. These are return-order observations, not an
intermediate call/store trace.

All three positive samples record:

- One actual target return, no target condition, zero observer errors, no
  overflow, and their own completed case plus COMPLETE/END.
- All 49 scratch cells still zero, with an empty changed-cell list.
- Valid, stable copied three-draw RNG previews `(59,29,74)` around the
  constructor and target call.
- START globally present but unbound, with the complete eight-entry direction
  lists unchanged in identity and contents.
- Both original maps' identities, metadata and all 829,440 cells unchanged;
  the seven original bindings restored after the dynamic extent.
- Actual AA0, image, image-id and raw scene bytes equal both fresh controls.

## Captures and source identities

All raw captures and runtime files remain ignored under
`research/extracted/local-oracle/`.

| PERIM | Run basename | Frozen source SHA-256 | Report SHA-256 / bytes |
|---:|---|---|---|
| 1 | `zero-edge-perim1-seed1234-20261011-f` | `0c008f8216dfe36cc8ee7ab38b9fed74798ee65baf0f1d508b9b23fadbd2919a` | `d04c661cbe1dc9bf61b8ef10e697322b722df72861dbfac0d9eec4861aac539f` / 20,159 |
| 2 | `zero-edge-perim2-seed1234-20261011-h` | `ac365d63535b3f757a14ffec93a6590a5aa2b99d070d70ffcfbd53f998baabd0` | `50974d8a2a521b96312c7f827887208ab18b4ddb4f6ad1d182b0988c1a63ca31` / 20,159 |
| 3 | `zero-edge-perim3-seed1234-20261011-j` | `ad45e8731d640213356e13eebf1960a35302d59e67a8db1a84c4cd58ce237e1f` | `0fcf75c728b1b343eea7fb54f203009dd8c88edc7670bb511d7044fa0df1009e` / 21,722 |

Each source is 76,073 bytes; each complete observer report has 113 lines.
The sources are [PERIM 1](zero-edge-traversal-perim1.cl),
[PERIM 2](zero-edge-traversal-perim2.cl) and
[PERIM 3](zero-edge-traversal-perim3.cl). Separate source files preserve the
loaded runtime bytes; none of the earlier frozen probes is changed.

The fresh, uninstrumented writer-stream seed-1234 controls are
`zero-edge-positive-control-seed1234-20261011-g` and
`zero-edge-positive-control-repeat-seed1234-20261011-i`. Both have no optional
pre-scene probe and complete drawing/scene records. Their measured natural
maps are 768x1080. The reason this configuration differs from the older
320x480 corpus remains uninvestigated.

| Actual control file | Bytes | SHA-256 |
|---|---:|---|
| AA0 | 426,587 | `405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a` |
| image | 424,205 | `457793c43166f822d8ded53b1570c8cdc1b7db9da794425344b8669b0d8b5e8e` |
| image-id | 3 | `13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354` |
| aaron-scene-state-snapshot.txt | 25,959 | `153374c2b52a86ca31e33c7102385d2a7c5c88267b50bcfa4947a608eb984ed3` |

## Portable evidence and reproduction

[Portable evidence](evidence/zero-edge-positive-20261011.json) is 329,271
bytes, SHA-256
`f31fbaf396970e041356a450fd05b738a7b542f6cccf868f0e7ddbe0e72f6bd3`.
The frozen [deriver](../tools/derive-zero-edge-positive-evidence.mjs) is
120,583 bytes, SHA-256
`938c371b437e18bf24a41c6daeeca30df50bba72d1d1eb72a70f99351ce7fd9a`.

One shared validator uses three immutable capture specifications, rather than
rewriting report text or duplicating the parser. It pins each source/report,
checks typed returns against the separately captured detailed point list,
and requires exact record order/counts, call/completion/error gates, complete
scratch capture, full original-map checks and restoration outside PROGV.
It validates runtime/routing/request/staged-source evidence and actual
output bytes against both controls, and rederives the native 56-source
baseline. Independent agent/root outputs are byte-identical, and all 230
source bindings revalidate against current bytes.

Rebuild from the retained ignored capture roots into a fresh ignored filename:

```powershell
node research/tools/derive-zero-edge-positive-evidence.mjs `
  --output research/extracted/local-oracle/zero-edge-perim3-seed1234-20261011-j/zero-edge-positive-derived-new.json
```

The helper is frozen to these three captures. New inputs need a separately
reviewed capture specification; do not repoint this published closure.

## Limits and next input

These three inputs establish the reported return/mutation differences for
this start and map. They do not establish a formula for arbitrary PERIM,
its accepted domain, all direction values, other map contents, general
termination or a natural caller. A NIL result does not imply no mutation.
The nonempty result does not recover the general ZERO-EDGE algorithm.

Only the listed bindings/maps and copied three-draw previews are checked;
other globals and complete RNG state remain outside the preservation scope.
The probe makes an explicit post-MAIN call and leaves ZERO-EDGE unwrapped,
so it does not count natural calls. Next change only START.Z with PERIM 3
and the same zero map, requiring a complete capture and fresh controls.
