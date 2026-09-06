# Point geometry and LOCK-WIGGLE

[`aaron-point-geometry.js`](../engine/src/aaron-point-geometry.js) models
XYDIST and LOCK-WIGGLE. Tests match **320 complete paths, 80 distance
observations, and 80 subsequent random-state observations** from
[run 34015358031](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34015358031).
These are twenty endpoint pairs across four seeds, with four successive paths
per pair. Endpoints cover all quadrants, coincidence, translation, small
distances, and single versus double precision. The first twelve pairs guided
the initial model; eight new holdout pairs then exposed distance and double
trigonometric rounding gaps. Both measured gaps are now resolved. The report
contains repeated initial cases, so tests use the latest report alone.

## Recovered behavior

- MAKE-TWOPT takes X and Y and preserves double coordinate values.
- XYDIST returns a single-float distance, including for double coordinates.
  Its squared differences and their sum retain more precision than single;
  rounding each to binary32 fails the held-out distance case.
- LOCK-WIGGLE draws an integer step count with `RAN(2, 4)`.
- Each step uses the original endpoint heading plus a new single-float
  `RAN(-0.05, 0.05)` offset. The base heading stays fixed; steps accumulate
  from the previous generated point.
- The measured step length matches `distance / (count + 1) * 0.8f0 * 1.2f0`,
  rounding each operation to single precision. Algebraically collapsing those
  factors is not justified for exact floating arithmetic.
- The result is the generated points followed by the starting point, in
  reverse traversal order. The destination is not appended. Coincident
  endpoints still consume the same random draws and return repeated points.
- Single coordinates use single arithmetic for angle, trigonometric result,
  product, and addition. Double coordinates retain a double heading and use
  double arithmetic, with the single step length promoted for multiplication.

The model takes an explicit `precision` option because JavaScript does not
retain Lisp numeric types. The supported modes describe uniformly single
(also tested with integer endpoints) or uniformly double coordinates; mixed
coordinate types and extreme numeric ranges remain uncharacterized.

## Tracing controls

[Run 34002445487](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34002445487)
temporarily wrapped RAN and POL-PT, recording their arguments and outputs.
All twelve wrapped results and following RANDOM values equal the corresponding
unwrapped baselines. Original function bindings are restored with
UNWIND-PROTECT. The leading `RAN(3, 5)` in each trace is an explicit **probe
warmup**, not a call made by LOCK-WIGGLE. The actual routine then calls
`RAN(2, 4)` followed by one angular RAN per step.

The expanded trace in
[run 34015537884](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/34015537884)
also records trigonometric results and products. All 24 wrapped/baseline
comparisons match. V8's built-in double SIN/COS differ from the original in
seven of the 60 traced pairs. A bounded Taylor calculation using 192 fractional
bits and one final binary64 conversion matches all 40 double pairs exactly.
The single path keeps its existing binary32 arithmetic. Combined with the
distance correction, all 320 captured paths now match without tolerances.

The double trig calculation is limited to headings in `[-3.25, 3.25]`, which
covers this helper's ATAN2 heading plus its perturbation. It does not reconstruct
Allegro's general trigonometric implementation. High-precision arithmetic is
used to reproduce the observed values, not inferred to be the original code.

The first point probe incorrectly expected one point and failed during output
extraction. The return-shape diagnostic showed successful application returns
containing lists of TWOPT objects. Those failed reports are preserved but are
not used as successful geometry vectors. Numeric captures warm first-use
dispatch before installing measured random states; they do not establish
startup draw order.

## Limits

LOCK-WIGGLE is a recovered path helper, not the complete freehand line
algorithm. Its use in the larger drawing pipeline, final endpoint handling,
brush emission, and relation to Paul Cohen's historical FLA still need to be
traced. Mixed coordinate types, extreme/subnormal inputs, untested rounding
boundaries, and other JavaScript implementations of ATAN2 remain outside the
equivalence claim. The provisional scene generator does not substitute this helper for
its existing curve sampler. Passing these tests establishes parity for the
recorded cases, not whole-painting equivalence or all JavaScript math engines.
