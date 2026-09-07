# Clean-room integration checkpoint

Status: **Measured local integration; provisional historical interpretation.**
This document records where already measured primitives are connected to the
JavaScript generator. It does not claim that these caller policies are the
same as the archived AARON build.

## Composition frame contract

The JavaScript planner now exposes `planFigureFrames`. It reserves rectangular
candidate frames, returns only accepted records, preserves each requested
figure's original index, and returns an explicit rejection when a frame cannot
fit. The generator treats accepted frames as authoritative: it emits only the
accepted figure count and uniformly fits each generated figure's complete body
geometry inside its frame.

The generator exposes the contract in `scene.composition` and
`scene.figurePlacements`:

```json
{
  "status": "provisional-planned",
  "requestedFigures": 10,
  "acceptedFigures": 3,
  "rejectedFigureIndices": [3, 4, 5, 6, 7, 8, 9]
}
```

This fixes an integration defect in which the planner could reject placement
proposals while the generator still drew the requested number of figures. It
does not recover the original PLAN/MAPPING rejection policy, frame dimensions,
or random draw order.

### Local contract sweep

The sweep used 100 seeds for each of the measured canvas profile families,
requested three figures per case, and checked exceptions, accepted/generated
counts, frame containment, and pairwise frame overlap:

| Profile | Cases | Accepted / requested | Exceptions | Containment violations | Frame overlaps | Count mismatches |
|---|---:|---:|---:|---:|---:|---:|
| portrait | 100 | 282 / 300 | 0 | 0 | 0 | 0 |
| square | 100 | 299 / 300 | 0 | 0 | 0 | 0 |
| wide | 100 | 300 / 300 | 0 | 0 | 0 | 0 |
| **total** | **300** | **881 / 900** | **0** | **0** | **0** | **0** |

The acceptance rates are behavior of this provisional scaffold, not estimates
of the historical engine's composition frequencies.

## FREE-PATH outline integration

`outlineMode: 'free-path-subset'` routes generated polygon outlines through the
measured `aaronFreePath` helper. It uses a separate explicit `outlineSeed` and
the recovered `Allegro501Random`, leaving the scene random stream, palette, and
paint phase unchanged. The default `outlineMode: 'polygon'` remains unchanged.

The mode deliberately makes these provisional caller choices:

- every polygon vertex is visible;
- coordinates are converted to single precision;
- the closed polygon is traversed cyclically;
- returned freehand samples are emitted directly as AA outline points;
- no recovered clipping or `DRAW-CFORM` context is assumed.

The local integration fixture is
[`engine/test/fixtures/free-path-outline-integration.json`](../engine/test/fixtures/free-path-outline-integration.json).
Its two deterministic cases produce:

| Scene seed | Outline seed | Input edges | Emitted outline points | Paint operations | Serialized bytes |
|---:|---:|---:|---:|---:|---:|
| 1234 | 1234 | 252 | 3,026 | 68,836 | 230,439 |
| 5678 | 1234 | 242 | 2,909 | 76,550 | 242,740 |

These hashes identify clean-room integration output only. They are not original
painting references. The experimental outlines can overshoot the source
polygon before a future clipping rule is measured; that is intentionally
documented rather than hidden.

## Evidence boundary and next step

Measured facts are the FREE-PATH sequences/random consumption, the existing
occupancy-grid behavior, and the original trace's separate planning and figure
call contexts. Inferred architecture is the proposal → acceptance → geometry
boundary. Provisional behavior is the rectangular frame policy, uniform fit,
all-visible outline caller, independent outline seed, and direct AA emission.

The next high-value task is to recover real scene context around
`SCREEN-AND-STORE`, `MPLAN`, and `RPARSE`, then replace these scaffolds one rule
at a time. No Windows execution was required for this checkpoint.

