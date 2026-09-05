# AARON AA interchange format

Status: working specification based on the repository's `aa0`, `aa7`, and a
16-file patched-oracle corpus. Fields and commands below are observed unless
explicitly marked as inferred.

## Document structure

```text
<width> <height> <palette-count>
<red-0> <green-0> <blue-0>
...
<red-N> <green-N> <blue-N>
<outline operations>
color
<paint operations>
end
```

- Dimensions and palette count are positive decimal integers.
- Palette channels are decimal values in the inclusive range 0–1.
- Coordinates use an origin at the bottom-left.
- `color` is a phase separator, despite looking like an operation name.
- Most outline paths use `am` and `ad`; two corpus files also use `zm` and
  `zd` for absolute outline paths.
- The paint phase uses `nb`, `nc`, `am`, `ad`, and the eight chain-code letters
  in the observed corpus.

## Commands

| Command | Arguments | Meaning |
|---|---:|---|
| `am` | x y | Move to an absolute point without drawing. |
| `ad` | x y | Draw from the current point to an absolute point. |
| `zm` | x y | Move to an absolute point for a z-path (observed in outline phase; inferred same move semantics as `am`). |
| `zd` | x y | Draw to an absolute point for a z-path (observed in outline phase; inferred same draw semantics as `ad`). |
| `nb` | width | Select a brush width. Known widths are odd integers from 1–19. |
| `nc` | index | Select a zero-based palette entry. |
| `e` | — | Draw one unit right. |
| `f` | — | Draw one unit right and up. |
| `g` | — | Draw one unit up. |
| `h` | — | Draw one unit left and up. |
| `i` | — | Draw one unit left. |
| `j` | — | Draw one unit left and down. |
| `k` | — | Draw one unit down. |
| `l` | — | Draw one unit right and down. |

The one-letter commands form an eight-connected chain-code walk. They encode
dense brush movement compactly while `am`/`ad` and the observed `zm`/`zd`
retain arbitrary-precision geometry for structural paths and jumps.

## Rendering order

The historical viewer performs three passes:

1. Draw the outline phase in black at width 1.
2. Draw the paint phase using its `nb` and `nc` state changes.
3. Replay the outline phase in black at width 0.5.

The first outline pass can influence antialiased edge pixels beneath paint; the
last pass restores crisp structural contours above paint. A compatible renderer
should preserve this order.

## Known sample measurements

| File | Canvas | Palette | Outline operations | Paint operations |
|---|---:|---:|---:|---:|
| `aa0` | 1920×1080 | 148 | 3,547 | 246,159 |
| `aa7` | 1920×1080 | 184 | 6,220 | 260,178 |

The first patched-oracle corpus used the 1024×768 screen setting. Fourteen
files used the 148-entry palette and two used 184 entries; `zm`/`zd` appeared
only in the outline phases of two files (20/2,237 and 24/193 respectively).

A separate patched run with the verified environment mode
`KCAT_AARON_SMALL_IMAGE=1` emitted a 640×480 file with 184 palette entries,
2,355 outline operations, and 62,906 paint operations. The switch changes the
generator's output profile as well as its canvas size.

## Unknowns requiring more output

- Whether other builds emit commands beyond `zm`/`zd` and the known chain code.
- Whether palette channels may exceed two decimal places or the 0–1 range.
- Whether brush widths can be even, fractional, zero, or greater than 19.
- Whether outline phases ever contain state-changing or chain-code commands
  beyond the observed `zm`/`zd` branch.
- Whether the background colour is implicit or stored elsewhere.
- Whether identical random state and environment produce byte-identical files.
