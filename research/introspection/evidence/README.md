# Original-engine report excerpts

These reports are extracted from GitHub job logs for run
[33986804721](https://github.com/SMUsamaShah/Kurzweil-CyberArt-AARON-Image-Viewer/actions/runs/33986804721),
commit `4046acfe27080d30b4a2d1caa7c2374151bfc508`.

| Report | Job ID | Artifact ID |
|---|---:|---:|
| `line-behavior-33986804721.txt` | 101361790985 | 9975418644 |
| `function-constants-33986804721.txt` | 101361790910 | 9975414360 |
| `object-probe-33986804721.txt` | 101361790871 | See run artifacts |

Each file preserves the text between its BEGIN/END checkpoints after removing
GitHub timestamp prefixes and normalizing line endings to LF. These are not
byte-identical copies of the Windows files; any hashes computed here identify
the normalized excerpts. No source reconstruction or executable bytes are
included beyond the bounded object headers previously collected by the probe.

The constant probe completed all 37 candidates with 436 summaries. Its CI job
failed in the subsequent JavaScript parser because array type descriptors were
not supported. The raw evidence was uploaded successfully. The parser now
accepts the observed array descriptors, and a regression test parses this
complete report. Constants of generic functions describe dispatch machinery;
they do not reveal the bodies of the methods. The next probe inspects methods.

The line probe has 30 completed calls, including the intentional reversed-RAN
error case. RAN was not seeded in that probe; its numeric outputs are not
deterministic reference vectors. DIRECTION returned NIL for all nine calls.
ANGLE-DIF and ANGLE-RANGE produced numeric results, but the independent boundary
validation must complete before claiming their reconstruction.
