# Archived component inventory

## Source artifact

- Internet Archive identifier: `kurzweilcyberart_aaron`
- Original filename: `AARONsetup.exe`
- Size: 9,613,381 bytes
- SHA-256: `8a7717ce66c25540956de5b66a8331b0e904e43bc8bf1b16f8caf87865033a54`
- Installer database subject: `AARON for Windows`
- Installer author: `KCAT Team with Harold Cohen`
- MSI creation/last-save time: 2001-04-20 17:21:39

The self-extracting InstallShield wrapper contains an MSI as a Compound File
Binary stream. The MSI contains `Data.Cab`. Do not carve the visible `MSCF`
signature directly from the setup executable: CAB sectors are stored through
the MSI compound-file allocation table and are not contiguous in wrapper-file
order.

- Embedded MSI offset: 3,201,605 bytes
- Embedded MSI size: 6,411,776 bytes
- Embedded MSI SHA-256: `b6e2e71743dc35eec790c82f3f3171f870af0014e6cdad10dd04096cf60850f5`

## Application payload

| Installed name | MSI member | Bytes | SHA-256 |
|---|---|---:|---|
| `AARON.dxl` | `F5999_AARON.dxl` | 5,373,952 | `4a6ad5379d84e0ea4e475064211cca6fa9d4d44b9e84bba89f102a069206bc74` |
| `AARON.pll` | `F6087_AARON.pll` | 4,573,464 | `7ffc7dc9e3e62b1c5ba3612630b8747778324fa674dac42916be3e90bb96504c` |
| `AARON.exe` | `F6057_AARON.exe` | 36,864 | `348e88f145f47adfa12a83cded6cff56b57d88e9f11d1d3a94fa48f52a19305d` |
| `AARON_ScreenSaver.scr` | `F6180_AARON_ScreenSaver.scr` | 245,760 | `e45a69e038b378213a6db9c252568dfdb816848460d08de279af89c2bae9208c` |
| `acl5016.dll` | `F5315_acl5016.dll` | 344,064 | `904eeef1ff97eaf9ff7b1dbacd2dc730589f0e5de92641f1c4740366abe10292` |
| `ktiCompress.dll` | `F5373_ktiCompress.dll` | 131,072 | `3c8aaf597e2973bcd7d5fc8352be80be79cf50b1b2fe10324bc9cc179e6ff3ce` |
| `license.dll` | `F5431_license.dll` | 196,608 | `5cefbbe4df65e5cf7544aa0a10cec62d2568e40868c6f4e7b8373020ddfcc54d` |
| `mfc42.dll` | `Global_VC_MFC42ANSICore_f0.51D569E2_8A28_11D2_B962_006097C4DE24` | 995,383 | `ec63a85030c60716acdcf060abfaa95a6a3528631622fa60e7d17fbea2f751f9` |
| `msvcirt.dll` | `Global_VC_IRT_f0.3CE1F932_C090_11D2_977B_006097C4DE24` | 77,878 | `647f7534aaaedffa93534e4cb9b24bfcf91524828ff0364d88973be58139e255` |
| `registry.dll` | `F5754_registry.dll` | 290,816 | `6b69d623a3ba2da286d9f92bf90d0deda78593610308c90d4af61367a6169595` |
| `upload.dll` | `F5812_upload.dll` | 405,504 | `0c650eb484a4d2f1ba82669f8122818d9b4a05d76db1727c293b57df6d725a1c` |
| `UserDocumentation.html` | `F6268_UserDocumentation.html` | 17,232 | `819f49d416d33172045c5de23f9d6154c86e02c588100e0420dec03f21812562` |

## Runtime architecture

`AARON.exe` is a small Allegro Common Lisp launcher. `acl5016.dll` supplies the
5.0.1 runtime, `AARON.dxl` supplies the mutable Lisp heap/application state,
and `AARON.pll` supplies purified read-only Lisp data and code.

The DXL retains build paths for the application interface and about fifty core
source files. Observed core basenames are:

```text
globvars bodyvars colobs hues primobs
ut1 ut2 ut3 ut4 ut5 ut6 ut7 ut8 ut9
planobs propobs defbody figobs thingobs brushobs
tellit rorl hair box hand arm torso two-leg defpose window pskel
fill map edges dandf cntrl paint concat subpart deco patch zsense
eg pots place plant tree mplan garb compose
```

The paths identify a `harold3` core tree and a separate `interface/kcat.lisp`.
This is evidence that the KCAT product wraps a substantial AARON core rather
than storing a small set of prerecorded paintings.

## Diagnostic evidence

The screensaver host checks the environment variable `KCAT_AARON_DEBUG` using
the C runtime `getenv` function. The launcher separately checks
`ACL_STARTUP_DEBUG`. Their exact effects still require dynamic confirmation;
neither should yet be described as a hidden-quality switch.
