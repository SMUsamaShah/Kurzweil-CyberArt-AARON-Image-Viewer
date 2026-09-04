# AARON JavaScript engine

This directory contains the clean-room JavaScript reimplementation of the
2001 Kurzweil CyberArt AARON engine.

The implementation is being built in independently testable layers:

1. Parse and render AARON's `AA0`–`AA15` interchange files.
2. Reconstruct drawing primitives and the freehand line system.
3. Reconstruct spatial planning, composition, and occlusion.
4. Reconstruct figures, poses, garments, pots, plants, and trees.
5. Reconstruct palette selection, filling, and brushwork.

The historical viewer in the repository root remains intact while this engine
is developed. Reverse-engineering evidence and methodology live in
[`../research`](../research/README.md).

Run the current tests with:

```sh
cd engine
npm test
```
