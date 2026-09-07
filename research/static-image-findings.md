# Static Allegro image findings

Status: **Measured locally from the preserved binary images.** The parser in
[`tools/index-allegro-image.mjs`](tools/index-allegro-image.mjs) reads headers,
two-word index records, and tagged string objects only. It never loads or
evaluates a DXL/PLL image.

## Artifact integrity

The complete extracted library is required for static indexing. The copy in
the preserved runtime directory is a byte-identical prefix, but it ends before
the complete library:

| Artifact | Bytes | SHA-256 | Role |
|---|---:|---|---|
| `AARON.dxl` | 5,373,952 | `4a6ad5379d84e0ea4e475064211cca6fa9d4d44b9e84bba89f102a069206bc74` | mutable Lisp image |
| extracted `AARON.pll` | 4,573,464 | `7ffc7dc9e3e62b1c5ba3612630b8747778324fa674dac42916be3e90bb96504c` | complete purified library |
| runtime `AARON.pll` | 3,740,160 | `0636b6d61b1014edfd8baeff7f72f1a5ed67ba8233f9c91ea446a1679d19eb12` | truncated prefix |

The complete PLL begins with the runtime copy byte-for-byte, but the shorter
copy omits later indexed names including `RAN-HAND` and `MPLAN`. The normalized
report is checked in at
[`introspection/static-image-index.json`](introspection/static-image-index.json);
the original images remain outside the repository.

## Indexed PLL structure

The complete PLL has two terminated tables of eight-byte records:

| Table | Start | Records | Terminator | Validation |
|---|---:|---:|---:|---|
| first table | `0x40` | 7,723 | `0xF198` | second words nondecreasing |
| string table | `0x2B4B90` | 53,039 | `0x31C508` | second words nondecreasing |

For every string-table record, `string-table-start + first-word` resolves to
an object whose low header byte is `0x65`. The remaining header bits give the
byte length (`header >>> 8`), and every one of the 53,039 objects is NUL
terminated. There are 52,978 unique string values. The record's second word
is preserved as a raw key; its meaning is not assigned.

The table contains every one of the 1,347 names in the retained dynamic
`COMMON-GRAPHICS-USER` function inventory. It also indexes all 50 `harold3`
`.fasl` module paths. The DXL independently retains 50 matching `harold3`
`.lisp` module names, so the module sets cross-reference exactly.

### First-table object spans

The first table has a stronger structural interpretation than its raw record
list alone suggests. For each record `(A, B)`, the offset `0x40 + A` points to
an eight-byte-aligned object whose four-byte header satisfies:

```text
header & 0xff = 0x6c
header >>> 8 = B + 4
```

For the complete image, the predicted object span is
`align_up(4 + 2 * (header >>> 8), 8)`. Sorting all 7,723 objects by offset,
every predicted next boundary matches the next object, and the final boundary
is exactly the string table at `0x2b4b90`. All alignment bytes are zero. The
normalized report records this as `pll.firstTable.compiledObjects`:

| Check | Measured result |
|---|---:|
| distinct objects | 7,723 / 7,723 |
| eight-byte aligned | true |
| header tag `0x6c` | 7,723 / 7,723 |
| header length matches record | true |
| predicted boundaries agree | true |
| final boundary | `0x2b4b90` |
| zero alignment padding | true |

The most common four-byte payload prefixes are `55 8b ec 56` (7,373
objects), `83 f9 01 74` (171), and `e3 03 ff 57` (52). These are useful
code-like structural markers, not a disassembly or a function-name mapping.
The exact indexed strings for `BRUSH-STROKE`, `FILL-MAP`, `PAINT-BRUSH`,
`RAN-HAND`, and `MPLAN` remain string objects; no relationship from those
names to a particular `0x6c` object has been established.

The DXL header has a count of four at `0x60`, followed by four opaque
three-word descriptors at `0x64`, `0x70`, `0x7C`, and `0x88`:

```text
0x64: 0x00010000 0x20000000 0x00270000
0x70: 0x00280000 0x202A0000 0x00250000
0x7C: 0x004D0000 0x20570000 0x00020000
0x88: 0x004F0000 0x205E0000 0x00010000
```

These are preserved as raw header metadata. Their segment-mapping semantics
are not yet established.

The local parser now records the arithmetic relationships without assigning
loader semantics. The first words and lengths form contiguous image ranges:

| Descriptor | First-word range | Candidate second-word range |
|---|---:|---:|
| `0x64` | `0x010000–0x280000` | `0x20000000–0x20270000` |
| `0x70` | `0x280000–0x4D0000` | `0x202A0000–0x204F0000` |
| `0x7C` | `0x4D0000–0x4F0000` | `0x20570000–0x20590000` |
| `0x88` | `0x4F0000–0x500000` | `0x205E0000–0x205F0000` |

All three descriptor fields are `0x10000`-aligned. The first-word ranges tile
exactly from `0x010000` through `0x500000`, matching header word `0x54` at
the final boundary. The candidate second-word range begins at header word
`0x18` (`0x20000000`) and ends at header word `0x1C` (`0x205F0000`), with
gaps of `0x30000`, `0x80000`, and `0x50000`. The image still has a `0x10000`
prefix and a `0x20000` suffix outside those first-word ranges. None of these
relationships proves file offsets, virtual addresses, relocation, loading, or
protection behavior; the normalized report labels them as structural only.

### DXL source-object chain

The source-marker region is stronger than a printable-string list. Starting at
object offset `0x1B65E8`, the parser follows 53 consecutive eight-byte-aligned
tagged string objects through exclusive end `0x1B6FA8`:

| Check | Measured result |
|---|---:|
| objects | 53 |
| `0x65` string tags | 53 / 53 |
| NUL terminators | 53 / 53 |
| `core/harold3` paths | 50 |
| `interface` paths | 1 |
| basename-only auxiliaries | `review-s.lisp`, `local-f.lisp` |
| chain tiles region | true |
| alignment bytes | 172 total; 101 nonzero |

The 50 core module basenames still agree exactly with the 50 indexed PLL
`.fasl` markers. The nonzero source-object padding is an important boundary:
the zero-filled alignment rule established for PLL `0x6c` code-like objects
must not be reused for these DXL strings.

### Negative name-to-object search

An independent read-only cross-image scan tested the 16 scene-context names,
all indexed PLL strings, the DXL source markers, and all 7,723 first-table
object starts while excluding the known PLL index tables. It found no
defensible name-to-code or name-to-source mapping. In particular, absolute
string offsets with small tag variants and string-table-relative candidates
gave no scene-target coverage; raw keys and simple `×4`/`×8` encodings were
sparse and inconsistent. A seemingly strong DXL base-adjusted match covered
42,798 strings, but shifted-offset controls from 8 through 256 bytes covered
42,787–42,806 strings as well, including the same 15 scene targets. That
control result rejects the apparent match as numerical overlap rather than a
validated reference encoding.

This negative result is useful: the image structure can guide conservative
probe selection, but it does not justify inventing a function-name map,
relocation decoder, or dependency order from these bytes.

Selected exact references from the complete PLL:

| Name | Record offset | String-object offset | Raw key |
|---|---:|---:|---:|
| `BRUSH-STROKE` | `0x2D3988` | `0x37E9D0` | 21271 |
| `FILL-MAP` | `0x2E0DA8` | `0x3A53D0` | 29427 |
| `PAINT-BRUSH` | `0x2EF248` | `0x3D2D50` | 39306 |
| `RAN-HAND` | `0x3018E0` | `0x40DEC0` | 51793 |
| `MPLAN` | `0x3092A8` | `0x424638` | 55561 |

This gives safer local probe targets than a generic printable-string scan:
`BRUSH-STROKE` and `RAN-HAND` are also dynamic function bindings, while
`FILL-MAP`, `PAINT-BRUSH`, and `MPLAN` are retained names that the function
census does not classify as functions. That distinction is a name/binding
cross-reference, not a recovered value or class layout.

## Limits and next local use

The indexed strings and object spans establish exact offsets and retained
metadata, not source code. They do not yet establish package ownership, the
semantics of the raw keys, entry-point semantics inside a `0x6c` object, or a
reference from a function object to a source module. The package-qualified
scene target checklist is preserved in
[`introspection/scene-context-dossier.json`](introspection/scene-context-dossier.json)
and summarized in [`scene-context-findings.md`](scene-context-findings.md).
Keep all algorithm claims tied to existing original-engine evidence.
