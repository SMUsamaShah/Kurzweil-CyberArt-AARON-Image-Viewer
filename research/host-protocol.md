# Windows host protocol and diagnostic switches

Status: static findings from the hash-identified 2001 binaries. Addresses below
refer to the preferred PE image base and are included so the observations can
be independently checked.

## Screensaver-to-engine launch

`AARON_ScreenSaver.scr` is a 32-bit MFC host. It derives the engine path by
appending `\AARON.exe` to its own directory and builds this exact engine
argument string:

```text
-- screen-saver
```

The argument and executable-path strings are referenced by the process-launch
routine near virtual addresses `0x404bf7` and `0x404b1d`. This makes direct
engine launch a better automation target than simulated menu input, while the
`.scr /s` route remains useful for host-integration comparison.

## `KCAT_AARON_DEBUG`

The screensaver constructor calls C `getenv("KCAT_AARON_DEBUG")` and stores a
boolean flag. The value does not matter: merely defining the variable enables
it.

All observed reads of that flag are in the host helper-window creation path
near `0x402bee` and `0x402c2d`:

| Setting | Position | Size | Window style | Extended style |
|---|---:|---:|---:|---:|
| absent | −100, −100 | 90×90 | `0x90000000` | `0x20` |
| present | 0, 0 | screen width/8 × screen height/8 | `0x90c00000` | `0x8` |

Thus this switch exposes and decorates a normally off-screen helper/diagnostic
window. Static analysis shows no change to the engine argument, random seed,
painting resolution, scene rules, or quality setting. It is useful for tracing
the screensaver lifecycle, but it is not evidence of a gallery-quality unlock.

## `KCAT_AARON_SMALL_IMAGE`

The pure Lisp library contains this environment-variable name, and a dynamic
probe confirms that it reaches the generator. Defining it as `1` produced a
complete 640×480 output with the 184-entry palette and a different, compact
composition. This is a real alternate output mode, but the value semantics and
whether it can be selected through the shipped UI are not yet recovered.

## `ACL_STARTUP_DEBUG`

The small `AARON.exe` launcher calls `getenv("ACL_STARTUP_DEBUG")`, converts
presence to a boolean, and passes that flag into its Allegro Common Lisp 5.0.1
startup path. This is a runtime-startup diagnostic facility, not a KCAT scene
option. Dynamic testing may still make it valuable for recovering errors or an
interactive diagnostic console.

## Licensing versus engine capability

The bundled documentation describes the download as fully functional for 30
days, after which licensing permanently enables continued execution. A stale
rich-text resource inside `license.dll` describes “Premium” benefits as saving
and reviewing up to sixteen paintings, printing, and enhanced artistic content.
The last item explicitly promises more elaborate and detailed paintings.
The earlier statement here that neither source mentioned richer content was
incorrect. The resource is a product claim, not a specification of the compiled
content differences.

This does not prove that every compiled rule is reachable from the public UI.
The DXL contains the substantial `harold3` engine module set, so rare or
unwired branches remain a legitimate research target. The licensing experiments
in [oracle-corpus.md](oracle-corpus.md) provide output measurements, but do not
yet isolate richer content rules or demonstrate a hidden gallery engine.
