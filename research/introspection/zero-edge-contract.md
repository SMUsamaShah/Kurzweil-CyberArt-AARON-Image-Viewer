# ZERO-EDGE metadata and constructor sample

## Scope

The accepted v4 probe checked compiled-function metadata for `ZERO-EDGE`,
`MAKE-TRIPT`, and `X`, `Y`, and `Z`. It called `MAKE-TRIPT` once, with the
fixed sample `(17, 23, 6)`, after the saved `MAIN` returned normally. It never
called or wrapped `ZERO-EDGE`.

The frozen probe source is
[zero-edge-contract-v4.cl](zero-edge-contract-v4.cl), SHA-256
`400cf8a4a5bf1fecfa9fd5e302f1d6226827f34eb84e2382114912044bb2bca2`. The
staged source hash matches. Run g's 61-line observer report has SHA-256
`1f28f7df8ca0d28b72169d91e4474a5cbf3b8e3f8736128a5d2e345801d2a46f` and its
own `COMPLETE` and `END` footer. The tape records a normal `MAIN` return,
successful installation, one attempted/returned/completed sample, zero
observer errors, and zero `ZERO-EDGE` calls or wrappers. See the
[portable evidence](evidence/zero-edge-contract-20261006.json),
[run g report](../extracted/local-oracle/zero-edge-contract-seed1234-20261006-g/capture/aaron-zero-edge-contract-v4.txt),
[run g summary](../extracted/local-oracle/zero-edge-contract-seed1234-20261006-g/summary.json),
[control h summary](../extracted/local-oracle/zero-edge-contract-control-seed1234-20261006-h/summary.json), and
[native predicate analysis](brush-buffer-predicate-native.md).

The portable record was completed on 2026-10-11 from the frozen 2026-10-06
captures. It is 63,614 bytes, SHA-256
`ae70bc92ee90788cda8370974f174de431e3d1ea8ddfcea273ff097eb9970267`, with
140 source bindings. Independent derivations produced identical bytes, and
all bindings were rechecked. It also revalidates the native baseline's 56
sources. The repaired helper keeps raw capture bytes for exact comparisons
and publishes only their lengths/hashes.

From the checkout root, derive to a fresh ignored path under run g:

```powershell
node research/tools/derive-zero-edge-contract-evidence.mjs --output research/extracted/local-oracle/zero-edge-contract-seed1234-20261006-g/zero-edge-contract-new-derivation.json
```

## Measured sample

| Observation | Run g result |
|---|---|
| `MAKE-TRIPT` metadata | Compiled function; `ARGLIST` names positional `X`, `Y`, `Z` |
| Sample return | One value, printed type `TRIPT`; slots and getters returned FIXNUM values `17`, `23`, `6` |
| Getter reads | One value each from `X`, `Y`, `Z`; each matched its slot and sample input |
| Direct slot reads | Six total: `X`, `Y`, `Z` before and after the three getters; values were unchanged |
| `START` | Present but unbound before and after the sample, including the post-`MAIN` pre-sample read |
| `XINCS` | Proper eight-element FIXNUM list `(1 1 0 -1 -1 -1 0 1)`; binding value was EQ-identical and its bounded cached summary was EQUALP |
| `YINCS` | Proper eight-element FIXNUM list `(0 1 1 1 0 -1 -1 -1)`; binding value was EQ-identical and its bounded cached summary was EQUALP |
| Random preview checks | 11 valid, stable comparisons of a three-draw preview; each read used the copied-state helper |

The 11 preview comparisons were around the constructor, six slot reads, three
getter reads, and the final post-sample check.

The tape prints the fbound preview helper as an interpreted-function object,
not Boolean `T`; its preview records report `valid=T` and `stable=T`. These
three-draw checks do not prove full random-state equality. For generic
objects, the bounded value summary records only type, so it does not establish
deep state for object-valued globals. The accessor `ARGLIST` parameter names `TWOPT`,
`TWOPT`, and `TRIPT` are metadata names, not type constraints. This one sample
does not establish generally accepted inputs, return/error behavior for other
values, or object-wide effects.

The native metadata reports `ZERO-EDGE` with `START` and `PERIM` parameters.
That report does not establish what `PERIM` means or how the function behaves.
The observer's zero-call count covers this probe only; it is not a natural-call
census and does not establish whether the original drawing path calls
`ZERO-EDGE`.

## Output controls

Run g and fresh control h used the writer-stream seed-1234 mode. Their captured
AA0, `image`, `image-id`, and raw `aaron-scene-state-snapshot.txt` files are
byte-identical. The staged `AARON.exe` and `AARON.pll` are also byte-identical.

| Captured output | Bytes | SHA-256 shared by g and h |
|---|---:|---|
| AA0 | 126,956 | `0f1b148f9b39c1dc5981e10742252b89119dc022aa7ebec5f9e275d659b79dc1` |
| `image` | 124,575 | `42189c06d4383884268ab1b4935a015b4fc70300869a195a7511044f18897881` |
| `image-id` | 3 | `13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354` |
| Raw scene snapshot | 25,951 | `a2f17602ba33d0ac1b80544c1a70c0ae657c60dad9110c075f9ce43b21e8b415` |

These controls support byte parity for these outputs in this seeded mode. They
do not establish that all internal state is unchanged.

## Rejected attempts

- **Run a, v1:** the observer report had two `UNDEFINED-FUNCTION` errors while
  serializing `XINCS` and `YINCS`; it skipped the constructor sample. This tape
  is not used as contract evidence.
- **Runs c/d, v2 and control:** both runs completed, but the candidate's AA0
  and raw scene snapshot differed from control. The cause of the trajectory
  difference is unknown, so these runs do not support parity.
- **Runs e/f, v3 and control:** the runner completed, but the observer tape
  stopped at `MAIN-GATE` without `INSTALL`, `READY`, `COMPLETE`, or `END`. The
  source had an odd-arity `SETF` and placed its intended condition handler
  inside the protected `PROGN`; the actual runtime condition was not recorded.
  This tape is rejected.

The accepted result is a metadata and single-constructor dependency contract,
not recovered `ZERO-EDGE` behavior. The next step is a separately controlled
single-call investigation after its inputs are established.
