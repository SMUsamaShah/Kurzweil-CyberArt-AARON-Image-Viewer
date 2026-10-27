# REA 6.8.0 update, 2026-10-27

## Official release check

On 2026-10-27, the official [REA GitHub release page](https://github.com/morluto/rea/releases/tag/rea-agents-6.8.0)
marked `rea-agents` 6.8.0 as the latest release. GitHub dates the release
2026-10-25 and identifies signed tag commit `160d821`. The public
[npm package versions](https://www.npmjs.com/package/rea-agents?activeTab=versions)
also marked 6.8.0 with the `latest` tag at the check. The official release
notes specify Node `^22.23.4 || ^24.22.1 || >=26.12.1`; Node 23 and 25 are
unsupported.

## Side-by-side toolchain

The 6.8.0 CLI was installed in the versioned project directory
`research/artifacts/rea-tools/rea-6.8.0-20261027-a`, alongside the retained
`research/artifacts/rea-tools/rea-6.4.0` installation. The report invocations
use the explicit 6.8.0 CLI path. The pinned toolchain manifest is
[`toolchain-6.8.0-20261027.json`](artifacts/rea-tools/toolchain-6.8.0-20261027.json)
(SHA-256
`3e84aceb7c23ea8b04a83c9ba9d969f1a07fbcecd4ed3c5f338fe0aec28a7490`):

- REA `6.8.0`, release tag `rea-agents-6.8.0`, commit `160d821`.
- Package integrity
  `sha512-9QDeRnGqEDzABZyr04eLnBXBv/c6I9/TWu/6M0MD4pEfkySI/BIgwTODIbAReX3C1x6hjw9+Jlx4A2yUSPZ9ww==`.
- Node `24.22.1`; Ghidra `12.1.4` at
  `research/artifacts/rea-tools/ghidra_12.1.4_PUBLIC`; 64-bit JDK `21.0.12.1`
  at `research/artifacts/rea-tools/jdk-21.0.12.1+1`.
- Harness package manager `pnpm 11.25.0`; package install scripts were
  disabled.
- Native Windows artifact SHA-256
  `6a015bfefee7fafb6cbafab659f040170848a45425bbcef6caf962fd39b6ff7b`; native
  manifest SHA-256
  `ace4e282da571440eebdc194418d754084b51d3ab08e8826e67040b1478b249d`.

The captured [scoped doctor report](artifacts/rea-tools/verification-6.8.0-20261027-a/doctor.stdout.txt)
marks the Node and Ghidra checks healthy, including Ghidra 12.1.4 and JDK
21.0.12.1. It reports `environment_healthy: false` overall because optional
engines and agent registrations/skill were not configured; this is not a
whole-environment readiness claim.

## Compatibility with the retained 6.4.0 result

For the SCREEN-AND-STORE synthetic PE and seed, REA 6.8.0 and 6.4.0 produce
identical pseudocode, assembly, basic blocks, high-p-code operations, def-use
links, and effect records. The 6.4.0 targeted query and the 6.8.0 query at
`0x1fe24d12` both leave that call unresolved with no targets. The 6.8.0 query
at the following conditional call, `0x1fe24d25`, is unresolved as well. The
6.8.0 function report adds an explicit list of 72 unresolved indirect-call
sites. This verifies compatibility of those static observations for this input
only; it does not establish general backward compatibility for other report
schemas or consumers.

This comparison covers static Ghidra output from the unexecuted synthetic PE
only; it establishes no runtime behavior, caller, ABI, or source claim.

REA 6.8.0 changes the MCP `analyze_function` default to a retained summary;
request `detail: "complete"` for the former complete inline dossier. The CLI
continues to default to complete output. The release notes describe this and
the Node requirement on the official
[6.8.0 release page](https://github.com/morluto/rea/releases/tag/rea-agents-6.8.0).

See the dated [SCREEN-AND-STORE static finding](introspection/rea-payload-analysis.md#screen-and-store-return-use-rerun-2026-10-27)
and its [portable evidence JSON](introspection/evidence/screen-and-store-call-return-flow-rea-20261027-v1.json).
