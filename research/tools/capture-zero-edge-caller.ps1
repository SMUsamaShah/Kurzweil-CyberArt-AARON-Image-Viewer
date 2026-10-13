[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$OracleOutputRoot,
    [Parameter(Mandatory = $true)] [string]$MapPath,
    [ValidateRange(10, 180)] [int]$Seconds = 90,
    [string]$MetadataPath = 'C:\temp\aaron-zero-edge-native-caller-links.txt'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$output = (Resolve-Path -LiteralPath $OracleOutputRoot).Path
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$expectedRuntime = Join-Path $output 'runtime\AARON.exe'
$expectedRuntimeAliases = @($expectedRuntime)
$externalRunLink = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'
if (Test-Path -LiteralPath $externalRunLink) {
    $link = Get-Item -LiteralPath $externalRunLink -Force
    if ($link.LinkType -eq 'Junction' -and $link.Target) {
        $linkPath = [IO.Path]::GetFullPath($externalRunLink).TrimEnd('\') + '\'
        if ($expectedRuntime.StartsWith($linkPath, [StringComparison]::OrdinalIgnoreCase)) {
            $relativeRuntime = $expectedRuntime.Substring($linkPath.Length)
            $expectedRuntimeAliases += Join-Path ([string]@($link.Target)[0]) $relativeRuntime
        }
    }
}
$expectedRunner = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\oracle\run-local-scene-state-required-probe.ps1')).Path
$metadataFullPath = [IO.Path]::GetFullPath($MetadataPath)
$metadataName = [IO.Path]::GetFileName($metadataFullPath)
$release = 'C:\temp\aaron-native-code-release.txt'
$endMarker = 'END zero-edge-native-caller-links'
$reportPath = Join-Path $output 'zero-edge-native-caller.json'
$processes = @(Get-Process AARON -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -in $expectedRuntimeAliases
})
if ($processes.Count -ne 1) { throw 'Expected exactly one AARON process in this oracle output root' }
$aaronProcessId = $processes[0].Id
$capturedReport = $null
try {
    $probeSourcePath = Join-Path $repoRoot 'research\introspection\zero-edge-native-caller-links.cl'
    $stagedProbePath = 'C:\temp\aaron-pre-scene-probe.cl'
    $probeHash = (Get-FileHash -LiteralPath $probeSourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $stagedProbeHash = if (Test-Path -LiteralPath $stagedProbePath -PathType Leaf) {
        (Get-FileHash -LiteralPath $stagedProbePath -Algorithm SHA256).Hash.ToLowerInvariant()
    } else { '' }
    $requestPath = Join-Path $output 'pre-scene-probe-request.json'
    $requestBytes = [IO.File]::ReadAllBytes($requestPath)
    $request = [Text.Encoding]::UTF8.GetString($requestBytes) | ConvertFrom-Json
    if ($request.schemaVersion -ne 1 -or $request.runId -ne (Split-Path -Leaf $output) -or
        $request.runtimeExecutable -ne $expectedRuntime -or $request.probeSha256 -ne $probeHash -or
        $stagedProbeHash -ne $probeHash -or
        $request.runnerSha256 -ne (Get-FileHash -LiteralPath $expectedRunner -Algorithm SHA256).Hash.ToLowerInvariant() -or
        $request.pauseSeconds -le 0 -or $request.releaseFile -ne $release -or
        $request.requiredProbeOutputName -ne $metadataName -or
        $request.requiredProbeEndMarker -ne $endMarker -or
        $metadataFullPath -ne (Join-Path 'C:\temp' $metadataName) -or
        $metadataName -notin $request.probeOutputNames) {
        throw 'Capture requires this runner-owned source-hashed ZERO-EDGE probe pause'
    }
    if (Test-Path -LiteralPath $reportPath) { throw 'Caller report must be fresh' }
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ((Test-Path -LiteralPath $MetadataPath) -and
            (Select-String -LiteralPath $MetadataPath -SimpleMatch $endMarker -Quiet)) { break }
        Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path -LiteralPath $MetadataPath)) { throw 'Native metadata report was not created' }
    $metadataBytes = [IO.File]::ReadAllBytes($MetadataPath)
    $metadata = [Text.Encoding]::UTF8.GetString($metadataBytes).Replace("`r`n", "`n")
    if (-not $metadata.EndsWith($endMarker + "`n") -or
        $metadata -notmatch '(?m)^TOTALS targets=2 functions=2 headers=2 constants=\d+ errors=0 truncations=0\r?$' -or
        $metadata -notmatch '(?m)^ERROR-COUNT 0\r?$' -or
        $metadata -notmatch '(?m)^TRUNCATION-COUNT 0\r?$') {
        throw 'Native metadata is incomplete, truncated, or has errors'
    }
    if (Test-Path -LiteralPath $release) { throw 'The pre-scene pause was already released' }

    $mapFile = (Resolve-Path -LiteralPath $MapPath).Path
    $mapBytes = [IO.File]::ReadAllBytes($mapFile)
    $map = [Text.Encoding]::UTF8.GetString($mapBytes) | ConvertFrom-Json
    if ($map.schemaVersion -ne 1) { throw 'Unsupported native-code map schema' }
    $pllPath = Join-Path $output 'runtime\AARON.pll'
    $pllHash = (Get-FileHash -LiteralPath $pllPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($map.pll.sha256 -ne $pllHash) { throw 'Native map PLL does not match this disposable runtime' }

    $manifestPath = Join-Path $repoRoot 'research\extracted\aaron\manifest.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $manifestExe = @($manifest.files | Where-Object { $_.installedName -eq 'AARON.exe' })
    if ($manifestExe.Count -ne 1 -or
        (Get-FileHash -LiteralPath $expectedRuntime -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifestExe[0].sha256) {
        throw 'Disposable runtime executable differs from the verified extracted manifest'
    }

    Add-Type -Path (Join-Path $PSScriptRoot '..\oracle\AaronCallerBreakpoint.cs')
    $functions = @()
    foreach ($match in [regex]::Matches($metadata, '(?m)^HEADER name="([A-Z][A-Z0-9-]*)" bytes=([0-9a-fA-F]{128})\r?$')) {
        $name = $match.Groups[1].Value
        if ($name -notin @('BUFFER-HOLE', 'ZERO-EDGE')) { throw "Unexpected function header: $name" }
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
    $requiredNames = @('BUFFER-HOLE', 'ZERO-EDGE')
    if ($functions.Count -ne 2 -or (@($functions.name | Sort-Object) -join ',') -ne (@($requiredNames | Sort-Object) -join ',')) {
        throw 'Expected fresh live ZERO-EDGE and BUFFER-HOLE code matches'
    }
    $target = @($functions | Where-Object { $_.name -eq 'ZERO-EDGE' })[0]
    $outcome = 'entry-hit'
    $hit = $null
    $captureError = $null
    try {
        $hit = [AaronCallerBreakpoint]::Capture($aaronProcessId,
            [Convert]::ToUInt32($target.entry.Substring(2), 16), $release, $Seconds)
    } catch {
        $captureError = $_.Exception.Message
        if ($captureError -like '*No selected entry breakpoint observed within the deadline*') {
            $outcome = 'no-entry-within-deadline'
        } else {
            throw
        }
    }
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
    $immediateReturn = $null
    $frameReturns = @()
    if ($null -ne $hit) {
        $immediateReturn = Resolve-ReturnAddress $hit['returnAddress']
        $frameReturns = @($hit['framesBeforeEntryPrologue'] | ForEach-Object {
            Resolve-ReturnAddress $_['returnAddress']
        })
    }
    $debuggerHelper = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\oracle\AaronCallerBreakpoint.cs')).Path
    $capturedReport = [ordered]@{
        schemaVersion = 1
        outcome = $outcome
        method = 'One WOW64 execute hardware breakpoint at the freshly validated live ZERO-EDGE entry, before its prologue'
        capturedAt = [DateTime]::UtcNow.ToString('o')
        runtimeExecutable = $expectedRuntime
        runtimeExecutableSha256 = (Get-FileHash -LiteralPath $expectedRuntime -Algorithm SHA256).Hash.ToLowerInvariant()
        runtimePllSha256 = $pllHash
        captureHelperSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
        debuggerHelperSha256 = (Get-FileHash -LiteralPath $debuggerHelper -Algorithm SHA256).Hash.ToLowerInvariant()
        probeSha256 = $probeHash
        runnerSha256 = $request.runnerSha256
        requestSha256 = (Get-FileHash -LiteralPath $requestPath -Algorithm SHA256).Hash.ToLowerInvariant()
        metadataSha256 = (Get-FileHash -LiteralPath $MetadataPath -Algorithm SHA256).Hash.ToLowerInvariant()
        sourceMapSha256 = (Get-FileHash -LiteralPath $mapFile -Algorithm SHA256).Hash.ToLowerInvariant()
        functions = $functions
        hit = $hit
        immediateReturn = $immediateReturn
        frameReturns = $frameReturns
        immediateCallerMapped = ($null -ne $immediateReturn -and $null -ne $immediateReturn.function)
        noHitError = $captureError
        limitations = @(
            'Only the first ZERO-EDGE entry in this one writer-stream scene is captured; later callers may differ.'
            'BUFFER-HOLE is only a statically observed symbol-reference candidate until a mapped return address lands inside its live-validated payload.'
            'The immediate return address is read directly at target entry; outer frame walking is bounded and heuristic.'
            'The debugger temporarily changes thread debug registers and restores them at a hit; it writes no code or process memory.'
            'A no-entry outcome is limited to the selected mode and capture deadline, not proof that the function is never called.'
        )
    }
    [IO.File]::WriteAllText($reportPath, ($capturedReport | ConvertTo-Json -Depth 14), [Text.UTF8Encoding]::new($false))
    $capturedReport | ConvertTo-Json -Depth 14
} finally {
    $stillOwned = Get-Process -Id $aaronProcessId -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -eq $expectedRuntime
    }
    if ($stillOwned -and -not (Test-Path -LiteralPath $release)) {
        [IO.File]::WriteAllText($release, 'ZERO-EDGE caller capture finished or failed')
    }
}
