[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$OracleOutputRoot,
    [Parameter(Mandatory = $true)] [string]$MapPath,
    [ValidateRange(10, 180)] [int]$Seconds = 90,
    [string]$MetadataPath = 'C:\temp\aaron-select-brush-native-links.txt'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$output = (Resolve-Path -LiteralPath $OracleOutputRoot).Path
$expectedRuntime = Join-Path $output 'runtime\AARON.exe'
$request = Get-Content -LiteralPath (Join-Path $output 'pre-scene-probe-request.json') -Raw | ConvertFrom-Json
if ($request.schemaVersion -ne 1 -or $request.runtimeExecutable -ne $expectedRuntime -or
    $request.pauseSeconds -le 0 -or $request.releaseFile -ne 'C:\temp\aaron-native-code-release.txt' -or
    'aaron-select-brush-native-links.txt' -notin $request.probeOutputNames) {
    throw 'Capture requires this runner-owned paused native metadata probe'
}
$reportPath = Join-Path $output 'select-brush-native-caller.json'
if (Test-Path -LiteralPath $reportPath) { throw 'Caller report must be fresh' }
$processes = @(Get-Process AARON -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq $expectedRuntime
})
if ($processes.Count -ne 1) { throw 'Expected exactly one AARON process in this oracle output directory' }
$aaronProcessId = $processes[0].Id
$release = 'C:\temp\aaron-native-code-release.txt'
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ((Test-Path -LiteralPath $MetadataPath) -and
            (Select-String -LiteralPath $MetadataPath -SimpleMatch 'END select-brush-native-links' -Quiet)) { break }
        Start-Sleep -Milliseconds 100
    }
    $metadata = [IO.File]::ReadAllText($MetadataPath)
    if ($metadata -notmatch 'END select-brush-native-links') { throw 'Native metadata capture is incomplete' }
    if (Test-Path -LiteralPath $release) { throw 'The pre-scene pause has already been released' }
    $mapFile = (Resolve-Path -LiteralPath $MapPath).Path
    $map = Get-Content -LiteralPath $mapFile -Raw | ConvertFrom-Json
    if ($map.schemaVersion -ne 1) { throw 'Unsupported native code map' }
    Add-Type -Path (Join-Path $PSScriptRoot '..\oracle\AaronCallerBreakpoint.cs')
    $functions = @()
    foreach ($match in [regex]::Matches($metadata, '(?m)^HEADER name="([A-Z-]+)" bytes=([0-9a-fA-F]{128})\r?$')) {
        $name = $match.Groups[1].Value
        $hex = $match.Groups[2].Value
        $header = [byte[]]@(0..63 | ForEach-Object { [Convert]::ToByte($hex.Substring($_ * 2, 2), 16) })
        $entry = [BitConverter]::ToUInt32($header, 18)
        $mapped = @($map.functions | Where-Object { $_.name -eq $name })
        if ($mapped.Count -ne 1 -or -not $mapped[0].uniqueCompleteObjectByteMatch -or
            $mapped[0].payloadFile -cnotmatch '^[a-z0-9-]+\.native-payload\.bin$') {
            throw "No validated PLL mapping for $name"
        }
        $payloadPath = Join-Path (Split-Path -Parent $mapFile) $mapped[0].payloadFile
        $expectedHash = $mapped[0].payloadSha256
        if ((Get-FileHash -LiteralPath $payloadPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
            throw "Mapped payload hash mismatch: $name"
        }
        $expected = [IO.File]::ReadAllBytes($payloadPath)
        $observed = [AaronCallerBreakpoint]::Read($aaronProcessId, $entry, $expected.Length)
        if ([Convert]::ToBase64String($expected) -ne [Convert]::ToBase64String($observed)) {
            throw "Current live code differs from the mapped PLL payload: $name"
        }
        $functions += [ordered]@{
            name = $name; entry = ('0x{0:x8}' -f $entry); payloadBytes = $expected.Length
            payloadSha256 = $expectedHash; pllPayloadOffset = $mapped[0].pll.payloadOffset
            exactLivePayloadMatch = $true
        }
    }
    if ($functions.Count -ne 5) { throw 'Expected all five named live functions' }
    $selector = @($functions | Where-Object { $_.name -eq 'SELECT-BRUSH' })[0]
    $hit = [AaronCallerBreakpoint]::Capture($aaronProcessId,
        [Convert]::ToUInt32($selector.entry.Substring(2), 16), $release, $Seconds)
    function Resolve-ReturnAddress([string]$Address) {
        $pc = [Convert]::ToUInt32($Address.Substring(2), 16)
        foreach ($fn in $functions) {
            $start = [Convert]::ToUInt32($fn.entry.Substring(2), 16)
            if ($pc -ge $start -and $pc -lt ($start + $fn.payloadBytes)) {
                return [ordered]@{ address = $Address; function = $fn.name; offset = $pc - $start }
            }
        }
        return [ordered]@{ address = $Address; function = $null; offset = $null }
    }
    $caller = Resolve-ReturnAddress $hit['returnAddress']
    $frames = @($hit['framesBeforeEntryPrologue'] | ForEach-Object {
        Resolve-ReturnAddress $_['returnAddress']
    })
    $report = [ordered]@{
        schemaVersion = 1
        method = 'One WOW64 execute hardware breakpoint at the exact SELECT-BRUSH entry, before its prologue'
        capturedAt = [DateTime]::UtcNow.ToString('o')
        runtimeExecutable = $expectedRuntime
        metadataSha256 = (Get-FileHash -LiteralPath $MetadataPath -Algorithm SHA256).Hash.ToLowerInvariant()
        sourceMapSha256 = (Get-FileHash -LiteralPath $mapFile -Algorithm SHA256).Hash.ToLowerInvariant()
        functions = $functions
        hit = $hit
        immediateReturn = $caller
        frameReturns = $frames
        brushFillCallSiteConfirmed = ($caller.function -eq 'BRUSH-FILL' -and $caller.offset -eq 1676)
        limitations = @(
            'The debugger temporarily changes thread debug registers; it does not write code or process memory.'
            'Only the first entry hit is captured. Scene parity must be checked against a separate uninstrumented caller control.'
            'Frame walking is bounded and heuristic; the immediate stack return address is read directly at the entry.'
            'Named code ranges are revalidated against all five complete PLL-matched payloads before attaching.'
        )
    }
    [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
    $report | ConvertTo-Json -Depth 12
} finally {
    $stillOwned = Get-Process -Id $aaronProcessId -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -eq $expectedRuntime
    }
    if ($stillOwned -and -not (Test-Path -LiteralPath $release)) {
        [IO.File]::WriteAllText($release, 'Caller breakpoint parent finished or failed')
    }
}
