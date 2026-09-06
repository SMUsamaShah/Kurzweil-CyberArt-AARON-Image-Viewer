# Numeric angle helpers

The first line probe and independent boundary probe ran at commits `4046acf`
and `c60f3db`. Their normalized original-engine reports are preserved under
[`introspection/evidence`](introspection/evidence/README.md).

## ANGLE-RANGE

Measured behavior is a list of two angles: `atan2(lx, z)` and `atan2(rx, z)`.
Integer and single-float inputs produce single-float outputs. The explicit
double-float cases produce double-float outputs. The order is preserved even
when the left angle is greater than the right angle. All-zero inputs yield
zero angles. `z` is a coordinate argument, not an angle being clipped.

`engine/src/aaron-angles.js` implements this primitive. Its tests match all 20
measured calls exactly after reconstructing binary32 values from Allegro's
printed single-float decimals. The seven discovery cases and 13 independent
validation cases cover quadrants, zero coordinates, reversed bounds, integer
and floating inputs, and small angles. Mixed numeric types, huge coordinates,
and cross-engine transcendental rounding are not yet fully characterized.
JavaScript callers choose `precision` explicitly because JS numbers do not
retain Common Lisp numeric types.

## NORM-A and ANGLE-DIF

`TWO-PI` is the double `6.283185307179586`. The measured normalization interval
is `(-pi, pi]`; both positive and negative pi map to positive pi. ANGLE-DIF
returns the magnitude of a wrapped difference. Constant pools refer to MOD,
TWO-PI, NORM-A, and ABS, supporting that interpretation.

Direct MOD measurements in run
[33987402462](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33987402462)
resolve the rounding differences. For positive divisor `d`, the measured path
computes `q = x / d`, then `r = (q - trunc(q)) * d`, and adds `d` only when
`r < 0`. Normalization reduces by TWO-PI and subtracts TWO-PI if the result
exceeds pi. ANGLE-DIF normalizes each argument, subtracts B's positive remainder
minus A's positive remainder, normalizes again, and takes ABS.

`aaron-angles.js` now matches all 19 MOD, 19 NORM-A, and 84 ANGLE-DIF cases
exactly, including tiny differences caused by operand order. Run
[34001269267](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34001269267)
then confirmed 96 fresh holdout calls without changing the implementation.
The test now checks 51 MOD, 51 NORM-A, and 116 ANGLE-DIF observations, excluding
repeated earlier reports. This is a measured
double path, not a general implementation of Lisp's rational or complex
arithmetic. Extremely large quotients and different JS math engines remain
outside the validated range.

## DIRECTION and generic methods

DIRECTION is an EXCL closure at the tested startup checkpoint and returned NIL
for all nine initial calls. Its name does not establish an angle-returning
helper. It has not been ported.

The first generic-method probe completed its report, but every candidate
reported an error; it recovered no method bodies or specializers. The initial
error was FILE-ERROR followed by UNBOUND-VARIABLE and PROGRAM-ERROR cases.
The verbose follow-up identifies `loop.fasl`: the extended LOOP macro in our
probe attempted an unavailable autoload. Replacing LOOP with DO allowed run
34001269267 to obtain method metadata and constants for eight of nine
candidates; SELECT-BRUSH still reports PROGRAM-ERROR. WIGGLE's XTPLAN method
is a closure with OFFSET as its retained argument list, suggesting an accessor
rather than a freehand construction routine. RAN has four float-type
combinations and an INTEGER/INTEGER method. Each float method references
NEW-RANDOM-FLOAT. BUILD-FIGURE exposes two methods referencing standing versus
seated body construction. Constants remain leads until the corresponding
calls or instructions are recovered.
