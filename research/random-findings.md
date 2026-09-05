# Allegro CL 5.0.1 random source

The original runtime now has a clean-room JavaScript numeric model in
[`engine/src/allegro-random.js`](../engine/src/allegro-random.js). It is based
on reference vectors collected from the shipped image, not on a guessed modern
MT implementation.

## Evidence

Franz's Allegro CL documentation independently identifies `cl:random` as a
Mersenne-Twister implementation: [Allegro CL implementation notes](https://franz.com/support/documentation/implementation.html).
That historical documentation supports the generator family; the recurrence,
twist edge case, and numeric conversions below are still specific observations
from the shipped AARON image.

The targeted workflow run [33970753206](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33970753206)
completed the `random-reference` job successfully. It collected 48 short
vectors for seeds 1, 1234, 5678, and 5489. The follow-up run
[33971190965](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33971190965)
completed the validation job successfully and collected 73 vectors, including
1,300 calls per seed/type. The JavaScript tests compare all 6,140 validation
values plus the short vectors.

The checked-in fixtures preserve the exact report-derived numbers:

- [`random-reference.json`](../engine/test/fixtures/random-reference.json)
- [`random-validation.json`](../engine/test/fixtures/random-validation.json)

They are source-independent numeric observations. They do not contain the
original binary or Lisp source.

## Recovered rules

The observed generator is MT19937-32 with the older initialization recurrence

```text
state[0] = seed (as an unsigned 32-bit word)
state[i] = 69069 * state[i - 1] mod 2^32
```

The twist is the standard 624-word recurrence except for the final element:
the shipped runtime uses the current final word as the source for `i = 623`,
not `state[396]`. The distinction only appears after crossing a twist boundary;
the 1,300-value validation vectors exposed it.

The numeric conversion behavior observed through `COMMON-LISP:RANDOM` is:

| Argument | Observed conversion |
|---|---|
| Positive fixnum limit through `2^29 - 1` | `(next-word >>> 1) mod limit` |
| Positive bignum limit below `2^32` | Take a 32-bit word as two 16-bit limbs; cap the high limb at `floor(limit / 65536) - 1`; retain the low limb |
| Limit exactly `2^32` | Return one raw 32-bit word and consume an additional word |
| Positive single-float | Use `((word >>> 1) & 0xffffff) / 2^24`, then single-float multiply |
| Positive double-float | Combine 27 bits from the first and 26 bits from the second `(word >>> 1)` value into a 53-bit fraction, then divide by `2^53` |
| `RAN(A B)` with integer endpoints | Inclusive `B`, equivalent to `A + RANDOM(B-A+1)` for valid bounds |

The bignum path is intentionally described as observed behavior, including
its apparent high-limb cap. It is not a recommendation for an unbiased random
distribution. This matters for reproducing historical output.

## What this does not recover

The probes do not identify the time-based startup seed used by AARON, the
sequence of random calls made by `SCRIPT`, or the mapping from those calls to
planning, figures, colours, and brush strokes. The exact scene generator is
therefore still unfinished. The standard `Mt19937` class remains available for
existing clean-room tests; callers that need the recovered Allegro numeric
behavior can use `Allegro501Random` explicitly.

The reversed `RAN(10, 0)` cases produced the original runtime's invalid-random
argument error. The JS class rejects reversed bounds before consuming state,
which preserves the important state invariant but does not claim identical
condition text.
