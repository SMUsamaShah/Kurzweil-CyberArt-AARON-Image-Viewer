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

The mathematical rules are identified but a bit-exact port is still pending.
JavaScript `%` and a division/fraction implementation differ from original
results by a few double ULPs in some cases. The next probe records Common Lisp
MOD directly to distinguish remainder arithmetic from normalization order.
No tolerance test is presented as byte-exact equivalence.

## DIRECTION and generic methods

DIRECTION is an EXCL closure at the tested startup checkpoint and returned NIL
for all nine initial calls. Its name does not establish an angle-returning
helper. It has not been ported.

The first generic-method probe completed its report, but every candidate
reported an error; it recovered no method bodies or specializers. The initial
error was FILE-ERROR followed by UNBOUND-VARIABLE and PROGRAM-ERROR cases.
The follow-up records the condition messages to locate the missing facility.
The workflow succeeding only establishes that the report completed.
