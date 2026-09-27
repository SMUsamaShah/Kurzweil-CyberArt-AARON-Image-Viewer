[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedSha256,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$source = (Resolve-Path -LiteralPath $Path).Path
$destination = [IO.Path]::GetFullPath($OutputPath)
if ([string]::Equals($source, $destination, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The output must be a separate disposable copy of license.dll'
}

$actual = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $ExpectedSha256.ToLowerInvariant()) {
    throw "Refusing to patch unexpected license.dll hash: $actual"
}

# These two complete instruction spans supply the root argument to the
# RegOpenKeyExA and RegCreateKeyExA imports in the archived 2001 build.
# Redirect only those API calls to HKEY_CURRENT_USER (0x80000001). The
# original source file and AARON's generation code are not changed.
$sites = @(
    [ordered]@{
        api = 'RegOpenKeyExA'
        offset = 0x13e27
        original = [byte[]](0x8b, 0x95, 0x74, 0xf3, 0xff, 0xff, 0x8b, 0x42, 0x04, 0x50)
    },
    [ordered]@{
        api = 'RegCreateKeyExA'
        offset = 0x140e9
        original = [byte[]](0x8b, 0x85, 0x70, 0xf3, 0xff, 0xff, 0x8b, 0x48, 0x04, 0x51)
    }
)
$replacement = [byte[]](0x68, 0x01, 0x00, 0x00, 0x80, 0x90, 0x90, 0x90, 0x90, 0x90)
$bytes = [IO.File]::ReadAllBytes($source)
foreach ($site in $sites) {
    for ($index = 0; $index -lt $site.original.Length; $index++) {
        if ($bytes[$site.offset + $index] -ne $site.original[$index]) {
            throw ('Unexpected {0} instruction bytes at file offset 0x{1:X}' -f
                $site.api, $site.offset)
        }
    }
}

foreach ($site in $sites) {
    [Array]::Copy($replacement, 0, $bytes, $site.offset, $replacement.Length)
}
[IO.File]::WriteAllBytes($destination, $bytes)

[ordered]@{
    path = $destination
    inputSha256 = $actual
    outputSha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    root = 'HKEY_CURRENT_USER'
    patches = @($sites | ForEach-Object {
        [ordered]@{ api = $_.api; fileOffset = ('0x{0:X}' -f $_.offset) }
    })
} | ConvertTo-Json -Depth 5 -Compress
