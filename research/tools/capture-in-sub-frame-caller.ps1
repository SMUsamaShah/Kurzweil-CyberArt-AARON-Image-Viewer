[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$OracleOutputRoot,
    [Parameter(Mandatory = $true)] [string]$MapPath,
    [ValidateRange(10, 180)] [int]$Seconds = 90,
    [string]$MetadataPath = 'C:\temp\aaron-brush-stroke-native-links.txt',
    [string]$MetadataEndMarker = 'END brush-stroke-native-links'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$output = (Resolve-Path -LiteralPath $OracleOutputRoot).Path
$expectedRuntime = Join-Path $output 'runtime\AARON.exe'
$requestPath = Join-Path $output 'pre-scene-probe-request.json'
$request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
$metadataFullPath = [IO.Path]::GetFullPath($MetadataPath)
$metadataName = [IO.Path]::GetFileName($metadataFullPath)
if ($request.schemaVersion -ne 1 -or $request.runtimeExecutable -ne $expectedRuntime -or
    $request.pauseSeconds -le 0 -or $request.releaseFile -ne 'C:\temp\aaron-native-code-release.txt' -or
    [IO.Path]::GetDirectoryName($metadataFullPath) -ne 'C:\temp' -or
    $metadataName -notin $request.probeOutputNames -or [string]::IsNullOrWhiteSpace($MetadataEndMarker)) {
    throw 'Capture requires this runner-owned paused native metadata probe'
}
$reportPath = Join-Path $output 'in-sub-frame-native-caller.json'
if (Test-Path -LiteralPath $reportPath) { throw 'Caller report must be fresh' }
$processes = @(Get-Process AARON -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq $expectedRuntime
})
if ($processes.Count -ne 1) { throw 'Expected exactly one AARON process in this oracle output directory' }
$aaronProcessId = $processes[0].Id
$release = $request.releaseFile
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ((Test-Path -LiteralPath $MetadataPath) -and
            (Select-String -LiteralPath $MetadataPath -SimpleMatch $MetadataEndMarker -Quiet)) { break }
        Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path -LiteralPath $MetadataPath)) { throw 'Native metadata report was not created' }
    $metadata = [IO.File]::ReadAllText($MetadataPath)
    if (-not $metadata.Contains($MetadataEndMarker)) { throw 'Native metadata capture is incomplete' }
    if (Test-Path -LiteralPath $release) { throw 'The pre-scene pause has already been released' }

$mapFile = (Resolve-Path -LiteralPath $MapPath).Path
    $map = Get-Content -LiteralPath $mapFile -Raw | ConvertFrom-Json
    if ($map.schemaVersion -ne 1) { throw 'Unsupported native code map' }
    Add-Type -Path (Join-Path $PSScriptRoot '..\oracle\AaronCallerBreakpoint.cs')
    $functions = @()
    foreach ($match in [regex]::Matches($metadata, '(?m)^HEADER name="([A-Z][A-Z0-9-]*)" bytes=([0-9a-fA-F]{128})\r?$')) {
        $name = $match.Groups[1].Value
        $hex = $match.Groups[2].Value
        $header = [byte[]]@(0..63 | ForEach-Object { [Convert]::ToByte($hex.Substring($_ * 2, 2), 16) })
        $entry = [BitConverter]::ToUInt32($header, 18)
        $mapped = @($map.functions | Where-Object { $_.name -eq $name })
        if ($mapped.Count -ne 1 -or -not $mapped[0].uniqueCompleteObjectByteMatch -or
            $mapped[0].payloadFile -cnotmatch '^[a-z0-9-]+\.native-payload\.bin$') {
            throw "No unique complete PLL mapping for $name"
        }
        $payloadPath = Join-Path (Split-Path -Parent $mapFile) $mapped[0].payloadFile
        $expectedHash = [string]$mapped[0].payloadSha256
        if ((Get-FileHash -LiteralPath $payloadPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
            throw "Mapped payload hash mismatch: $name"
        }
        $expected = [IO.File]::ReadAllBytes($payloadPath)
        $observed = [AaronCallerBreakpoint]::Read($aaronProcessId, $entry, $expected.Length)
        if ([Convert]::ToBase64String($expected) -ne [Convert]::ToBase64String($observed)) {
            throw "Current live code differs from the exact mapped PLL payload: $name"
        }
        $functions += [ordered]@{
            name = $name; entry = ('0x{0:x8}' -f $entry); payloadBytes = $expected.Length
            payloadSha256 = $expectedHash; pllPayloadOffset = $mapped[0].pll.payloadOffset
            exactLivePayloadMatch = $true
        }
    }
    $requiredNames = @('BRUSH-STROKE', 'IN-SUB-FRAME')
    $actualNames = @($functions.name | Sort-Object -Unique) -join ','
    $expectedNames = @($requiredNames | Sort-Object) -join ','
    if ($functions.Count -ne $requiredNames.Count -or $actualNames -ne $expectedNames) {
        throw 'Expected exactly the BRUSH-STROKE and IN-SUB-FRAME native mappings'
    }
    $target = @($functions | Where-Object { $_.name -eq 'IN-SUB-FRAME' })[0]
    $hit = [AaronCallerBreakpoint]::Capture($aaronProcessId,
        [Convert]::ToUInt32($target.entry.Substring(2), 16), $release, $Seconds)
    function Resolve-ReturnAddress([string]$Address) {
        $pc = [Convert]::ToUInt32($Address.Substring(2), 16)
        foreach ($fn in $functions) {
            $start = [Convert]::ToUInt32($fn.entry.Substring(2), 16)
            if ($pc -ge $start -and [uint64]$pc -lt ([uint64]$start + $fn.payloadBytes)) {
                return [ordered]@{ address = $Address; function = $fn.name; offset = [uint64]$pc - $start }
            }
        }
        return [ordered]@{ address = $Address; function = $null; offset = $null }
    }
    $immediateCaller = Resolve-ReturnAddress $hit['returnAddress']
    $frameReturns = @($hit['framesBeforeEntryPrologue'] | ForEach-Object {
        Resolve-ReturnAddress $_['returnAddress']
    })
    $debuggerHelperPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\oracle\AaronCallerBreakpoint.cs')).Path
    $report = [ordered]@{
        schemaVersion = 1
        method = 'One WOW64 execute hardware breakpoint at the live IN-SUB-FRAME entry, before its prologue'
        capturedAt = [DateTime]::UtcNow.ToString('o')
        runtimeExecutable = $expectedRuntime
        captureHelperSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
        debuggerHelperSha256 = (Get-FileHash -LiteralPath $debuggerHelperPath -Algorithm SHA256).Hash.ToLowerInvariant()
        metadataSha256 = (Get-FileHash -LiteralPath $MetadataPath -Algorithm SHA256).Hash.ToLowerInvariant()
        sourceMapSha256 = (Get-FileHash -LiteralPath $mapFile -Algorithm SHA256).Hash.ToLowerInvariant()
        functions = $functions
        hit = $hit
        immediateReturn = $immediateCaller
        frameReturns = $frameReturns
        immediateCallerMapped = ($null -ne $immediateCaller.function)
        limitations = @(
            'Only the first natural entry is captured; later callers may differ.'
            'The immediate return address is read directly at target entry; outer frame walking is bounded and heuristic.'
            'Only BRUSH-STROKE and IN-SUB-FRAME ranges are symbolized; an unmapped return remains an address, not a function claim.'
            'The debugger temporarily changes thread debug registers, restores them at the hit, then services the remaining debug events without re-arming before the owned oracle exits. It writes no code or process memory.'
            'If the target does not exit within the capture deadline, the helper fails closed and terminates only this disposable oracle.'
        )
    }
    [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
    $report | ConvertTo-Json -Depth 12
} finally {
    $stillOwned = Get-Process -Id $aaronProcessId -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -eq $expectedRuntime
    }
    if ($stillOwned -and -not (Test-Path -LiteralPath $release)) {
        [IO.File]::WriteAllText($release, 'IN-SUB-FRAME caller breakpoint parent finished or failed')
    }
}
