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

The indexed strings establish exact offsets and retained metadata, not source
code. They do not yet establish package ownership, the semantics of the raw
keys, function boundaries in the first table, or references from a function
object to a source module. The next static step is to use these validated
object references to build a conservative symbol/class/global target list for
read-only runtime probes, while keeping all algorithm claims tied to existing
original-engine evidence.
