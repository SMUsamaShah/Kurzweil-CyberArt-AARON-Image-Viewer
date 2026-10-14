[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$OracleOutputRoot,
    [Parameter(Mandatory = $true)] [string]$MapPath,
    [ValidateSet('writer-stream-seed-1234')]
    [string]$ExpectedMode = 'writer-stream-seed-1234',
    [ValidateRange(10, 180)] [int]$Seconds = 90,
    [string]$MetadataPath = 'C:\temp\aaron-pick-native-links.txt'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$output = (Resolve-Path -LiteralPath $OracleOutputRoot).Path
$expectedRuntime = [IO.Path]::GetFullPath((Join-Path $output 'runtime\AARON.exe'))
$expectedRuntimeAliases = @($expectedRuntime)
$externalRunLink = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'
if (Test-Path -LiteralPath $externalRunLink) {
    $link = Get-Item -LiteralPath $externalRunLink -Force
    if ($link.LinkType -eq 'Junction' -and $link.Target) {
        $linkPath = [IO.Path]::GetFullPath($externalRunLink).TrimEnd('\') + '\'
        if ($expectedRuntime.StartsWith($linkPath, [StringComparison]::OrdinalIgnoreCase)) {
            $relativeRuntime = $expectedRuntime.Substring($linkPath.Length)
            $expectedRuntimeAliases += [IO.Path]::GetFullPath((Join-Path ([string]@($link.Target)[0]) $relativeRuntime))
        }
    }
}
$expectedRunner = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\oracle\run-local-scene-state-required-probe.ps1')).Path
$probeSourcePath = Join-Path $repoRoot 'research\introspection\pick-native-links.cl'
$stagedProbePath = 'C:\temp\aaron-pre-scene-probe.cl'
$requestPath = Join-Path $output 'pre-scene-probe-request.json'
$manifestPath = Join-Path $repoRoot 'research\extracted\aaron\manifest.json'
$metadataName = 'aaron-pick-native-links.txt'
$readyMarker = 'READY pick-native-links'
$endMarker = 'END pick-native-links'
$release = 'C:\temp\aaron-native-code-release.txt'
$reportPath = Join-Path $output 'pick-native-caller.json'
$aaronProcessId = $null
$ownsPauseRelease = $false
$mappedFunctions = @()
$hit = $null
$captureError = $null
$outcome = 'validation-failed'

function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-BytesSha256([byte[]]$Bytes) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes)).Replace('-', '')).ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
    }
}

function Convert-HexAddress([string]$Value, [string]$Label) {
    if ($Value -cnotmatch '^0x[0-9a-fA-F]{1,8}$') {
        throw "$Label is not a bounded 32-bit address"
    }
    return [uint64][Convert]::ToUInt32($Value.Substring(2), 16)
}

function Resolve-ReturnAddress([string]$Address, [object[]]$Functions) {
    $pc = Convert-HexAddress $Address 'Breakpoint return address'
    $matches = @()
    foreach ($fn in $Functions) {
        $start = Convert-HexAddress ([string]$fn.entry) "$($fn.name) live entry"
        if ($pc -ge $start -and $pc -lt ($start + [uint64]$fn.payloadBytes)) {
            $matches += [ordered]@{
                name = $fn.name
                entry = $fn.entry
                offset = $pc - $start
                payloadBytes = $fn.payloadBytes
            }
        }
    }
    if ($matches.Count -eq 1) {
        return [ordered]@{ status = 'unique-mapped-interval'; address = $Address; function = $matches[0].name; offset = $matches[0].offset; matchingIntervals = $matches }
    }
    if ($matches.Count -gt 1) {
        return [ordered]@{ status = 'ambiguous-overlap'; address = $Address; function = $null; offset = $null; matchingIntervals = $matches }
    }
    return [ordered]@{ status = 'unresolved-outside-mapped-intervals'; address = $Address; function = $null; offset = $null; matchingIntervals = @() }
}

$report = [ordered]@{
    schemaVersion = 1
    targetFunction = 'PICK'
    method = 'One WOW64 execute hardware breakpoint at the current PICK entry after every candidate payload was matched to the PLL and read back from this live process'
    capturedAt = [DateTimeOffset]::UtcNow.ToString('o')
    outcome = $outcome
    oracleRunId = Split-Path -Leaf $output
    expectedMode = $ExpectedMode
    runtimeExecutable = $expectedRuntime
    sourceProbeSha256 = $null
    stagedProbeSha256 = $null
    runnerSha256 = $null
    requestSha256 = $null
    metadataSha256 = $null
    sourceMapSha256 = $null
    mapCaptureManifestSha256 = $null
    currentPllSha256 = $null
    captureHelperSha256 = $null
    processId = $null
    candidateNames = @()
    liveFunctions = @()
    hit = $null
    immediateReturn = $null
    boundedFrameReturns = @()
    captureError = $null
    failure = $null
    limitations = @(
        'Only the first PICK entry hit in this bounded scene is observed.',
        'A static constant reference is only a candidate; a direct caller is named only when the immediate return address uniquely falls inside a current live-validated candidate interval.',
        'Bounded EBP frame returns are reported separately and do not identify a direct caller.',
        'The breakpoint temporarily changes thread debug registers, writes no code or process memory, and restores the registers before continuing.',
        'The result applies only to this source-bound run and does not establish a general call graph or JavaScript behavior contract.'
    )
}

try {
    if (Test-Path -LiteralPath $reportPath) { throw 'PICK caller report must be fresh' }
    $probeHash = Get-Sha256 $probeSourcePath
    $stagedProbeHash = Get-Sha256 $stagedProbePath
    $runnerHash = Get-Sha256 $expectedRunner
    $report.sourceProbeSha256 = $probeHash
    $report.stagedProbeSha256 = $stagedProbeHash
    $report.runnerSha256 = $runnerHash
    $report.captureHelperSha256 = Get-Sha256 $PSCommandPath
    if ($probeHash -cne $stagedProbeHash) { throw 'Current probe source differs from the runner-staged probe' }

    $requestBytes = [IO.File]::ReadAllBytes($requestPath)
    $request = [Text.Encoding]::UTF8.GetString($requestBytes) | ConvertFrom-Json
    $report.requestSha256 = Get-Sha256 $requestPath
    $metadataFullPath = [IO.Path]::GetFullPath($MetadataPath)
    if ($request.schemaVersion -ne 1 -or
        $request.runId -cne (Split-Path -Leaf $output) -or
        $request.runtimeExecutable -cne $expectedRuntime -or
        $request.probeSha256 -cne $probeHash -or
        $request.runnerSha256 -cne $runnerHash -or
        $request.pauseSeconds -lt 1 -or $request.pauseSeconds -gt 300 -or
        $request.releaseFile -cne $release -or
        $request.requiredProbeOutputName -cne $metadataName -or
        $request.requiredProbeEndMarker -cne $endMarker -or
        $metadataFullPath -cne [IO.Path]::GetFullPath((Join-Path 'C:\temp' $metadataName)) -or
        @($request.probeOutputNames).Count -ne 1 -or
        $request.probeOutputNames[0] -cne $metadataName) {
        throw 'Capture requires the matching runner-owned PICK metadata pause and source hashes'
    }
    if (Test-Path -LiteralPath $release) { throw 'The native-code release marker already exists' }

    $allAaron = @(Get-Process AARON -ErrorAction SilentlyContinue)
    $ownedAaron = @($allAaron | Where-Object { $_.Path -in $expectedRuntimeAliases })
    if ($allAaron.Count -ne 1 -or $ownedAaron.Count -ne 1) {
        throw 'Expected exactly one AARON process owned by this oracle output root'
    }
    $aaronProcessId = [uint32]$ownedAaron[0].Id
    $report.processId = $aaronProcessId
    $ownsPauseRelease = $true

    $metadataDeadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $metadataDeadline) {
        if ((Test-Path -LiteralPath $MetadataPath -PathType Leaf) -and
            (Select-String -LiteralPath $MetadataPath -SimpleMatch $readyMarker -Quiet)) { break }
        Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path -LiteralPath $MetadataPath -PathType Leaf)) { throw 'PICK metadata report was not created' }
    $metadataBytes = [IO.File]::ReadAllBytes($MetadataPath)
    $metadata = [Text.Encoding]::UTF8.GetString($metadataBytes).Replace("`r`n", "`n")
    $report.metadataSha256 = Get-BytesSha256 $metadataBytes
    if (-not $metadata.EndsWith("$readyMarker`n", [StringComparison]::Ordinal) -or
        (Test-Path -LiteralPath $release)) {
        throw 'The report is not at the live READY pause'
    }
    $lines = @($metadata.TrimEnd("`n").Split([char]10))
    if ($lines.Count -lt 5 -or $lines[0] -cne 'BEGIN pick-native-links' -or $lines[-1] -cne $readyMarker) {
        throw 'PICK metadata report has an incomplete READY prefix'
    }
    $referenceLines = @($lines | Where-Object { $_ -match '^REFERENCE root=' })
    $summaryLines = @($lines | Where-Object { $_ -match '^SUMMARY ' })
    if ($summaryLines.Count -ne 1) { throw 'PICK metadata report must contain one summary row before READY' }
    $summaryMatch = [regex]::Match($summaryLines[0], '^SUMMARY bindings=(\d+) compiled-scanned=(\d+) references=(\d+) metadata-functions=(\d+) errors=(\d+) truncated=(\d+)$')
    if (-not $summaryMatch.Success -or
        [int]$summaryMatch.Groups[1].Value -le 0 -or
        [int]$summaryMatch.Groups[2].Value -le 0 -or
        [int]$summaryMatch.Groups[3].Value -ne $referenceLines.Count -or
        [int]$summaryMatch.Groups[5].Value -ne 0 -or
        [int]$summaryMatch.Groups[6].Value -ne 0) {
        throw 'PICK metadata summary is incomplete, truncated, or contains scan errors'
    }
    $headerMatches = [regex]::Matches($metadata, '(?m)^HEADER name="([A-Z][A-Z0-9-]*)" bytes=([0-9a-fA-F]{128})\r?$')
    $currentHeaders = @{}
    foreach ($match in $headerMatches) {
        $name = $match.Groups[1].Value
        if ($currentHeaders.ContainsKey($name)) { throw "Duplicate current header for $name" }
        $hex = $match.Groups[2].Value
        $bytes = [byte[]]@(0..63 | ForEach-Object { [Convert]::ToByte($hex.Substring($_ * 2, 2), 16) })
        $currentHeaders[$name] = [ordered]@{
            name = $name
            headerHex = $hex.ToLowerInvariant()
            entry = [BitConverter]::ToUInt32($bytes, 18)
        }
    }
    if ($headerMatches.Count -ne [int]$summaryMatch.Groups[4].Value -or
        $headerMatches.Count -lt 1 -or $headerMatches.Count -gt 64) {
        throw 'PICK metadata header count disagrees with its summary or safe capture bound'
    }
    foreach ($name in @('PICK', 'SCREEN-AND-STORE', 'BRUSH-STROKE')) {
        if (-not $currentHeaders.ContainsKey($name)) { throw "Required metadata header is missing: $name" }
    }
    $referenceNames = @($referenceLines | ForEach-Object {
        $match = [regex]::Match($_, '^REFERENCE root="([A-Z][A-Z0-9-]*)" path=')
        if (-not $match.Success) { throw "Malformed reference row: $_" }
        $match.Groups[1].Value
    } | Sort-Object -Unique)
    $expectedNames = @(@('PICK', 'SCREEN-AND-STORE', 'BRUSH-STROKE') + $referenceNames | Sort-Object -Unique)
    $currentNames = @($currentHeaders.Keys | Sort-Object)
    if (($expectedNames -join ',') -cne ($currentNames -join ',')) {
        throw 'The current header set does not equal PICK, observation anchors, and all reference candidates'
    }
    $report.candidateNames = @($referenceNames)

    $sourceManifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $manifestExe = @($sourceManifest.files | Where-Object { $_.installedName -eq 'AARON.exe' })
    $manifestPll = @($sourceManifest.files | Where-Object { $_.installedName -eq 'AARON.pll' })
    $runtimePll = Join-Path $output 'runtime\AARON.pll'
    if ($manifestExe.Count -ne 1 -or $manifestPll.Count -ne 1 -or
        (Get-Sha256 $expectedRuntime) -cne $manifestExe[0].sha256 -or
        (Get-Sha256 $runtimePll) -cne $manifestPll[0].sha256) {
        throw 'Current runtime or PLL differs from the extracted source manifest'
    }
    $pllBytes = [IO.File]::ReadAllBytes($runtimePll)
    $report.currentPllSha256 = Get-BytesSha256 $pllBytes

    $mapFile = (Resolve-Path -LiteralPath $MapPath).Path
    $mapDirectory = Split-Path -Parent $mapFile
    if ((Split-Path -Leaf $mapFile) -cne 'native-code-map.json' -or
        (Split-Path -Leaf $mapDirectory) -cne 'mapped') { throw 'MapPath must name mapped/native-code-map.json' }
    $nativeRoot = Split-Path -Parent $mapDirectory
    if ((Split-Path -Leaf $nativeRoot) -cne 'native-code') { throw 'Map must remain beside its native capture manifest' }
    $mapRoot = Split-Path -Parent $nativeRoot
    $sourceSummaryPath = Join-Path $mapRoot 'summary.json'
    $sourceRequestPath = Join-Path $mapRoot 'pre-scene-probe-request.json'
    $sourceReportPath = Join-Path $mapRoot 'capture\aaron-pick-native-links.txt'
    $sourceProbePath = Join-Path $mapRoot 'capture\aaron-pre-scene-probe.cl'
    $captureManifestPath = Join-Path $nativeRoot 'manifest.json'
    $captureMetadataPath = Join-Path $nativeRoot 'function-object-metadata.txt'
    foreach ($path in @($sourceSummaryPath, $sourceRequestPath, $sourceReportPath, $sourceProbePath, $captureManifestPath, $captureMetadataPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Mapped source run is incomplete: $path" }
    }
    $mapBytes = [IO.File]::ReadAllBytes($mapFile)
    $map = [Text.Encoding]::UTF8.GetString($mapBytes) | ConvertFrom-Json
    $report.sourceMapSha256 = Get-BytesSha256 $mapBytes
    $captureManifestBytes = [IO.File]::ReadAllBytes($captureManifestPath)
    $captureManifest = [Text.Encoding]::UTF8.GetString($captureManifestBytes) | ConvertFrom-Json
    $captureManifestHash = Get-BytesSha256 $captureManifestBytes
    $report.mapCaptureManifestSha256 = $captureManifestHash
    $sourceSummary = Get-Content -LiteralPath $sourceSummaryPath -Raw | ConvertFrom-Json
    $sourceRequest = Get-Content -LiteralPath $sourceRequestPath -Raw | ConvertFrom-Json
    $sourceReportHash = Get-Sha256 $sourceReportPath
    $sourceProbeHash = Get-Sha256 $sourceProbePath
    $sourceMetadataHash = Get-Sha256 $captureMetadataPath
    $sourcePllHash = [string]$manifestPll[0].sha256
    if ($map.schemaVersion -ne 1 -or
        $map.pll.bytes -ne $manifestPll[0].bytes -or $map.pll.sha256 -cne $sourcePllHash -or
        $map.captureManifestSha256 -cne $captureManifestHash -or
        $captureManifest.schemaVersion -ne 1 -or $captureManifest.functions.Count -ne $headerMatches.Count -or
        $captureManifest.metadataSha256 -cne $sourceMetadataHash -or
        $captureManifest.runtimeExecutable -cne $sourceRequest.runtimeExecutable -or
        $sourceSummary.complete -ne $true -or $sourceSummary.probeCompletionSatisfied -ne $true -or
        $sourceSummary.mode -cne $ExpectedMode -or
        $sourceSummary.runId -cne (Split-Path -Leaf $mapRoot) -or
        $sourceRequest.runId -cne (Split-Path -Leaf $mapRoot) -or
        $sourceSummary.requiredProbeOutputName -cne $metadataName -or
        $sourceSummary.requiredProbeEndMarker -cne $endMarker -or
        $sourceSummary.requiredProbeOutputSha256 -cne $sourceReportHash -or
        $sourceSummary.preSceneProbeSha256 -cne $sourceProbeHash -or
        $sourceRequest.probeSha256 -cne $sourceProbeHash -or
        $sourceRequest.requiredProbeEndMarker -cne $endMarker -or
        $sourceRequest.requiredProbeOutputName -cne $metadataName) {
        throw 'Mapped native code is not bound to a complete, matching source-run PICK capture'
    }
    $sourceMetadataText = [IO.File]::ReadAllText($captureMetadataPath).Replace("`r`n", "`n")
    $sourceArchiveText = [IO.File]::ReadAllText($sourceReportPath).Replace("`r`n", "`n")
    if (-not $sourceArchiveText.StartsWith($sourceMetadataText, [StringComparison]::Ordinal) -or
        -not $sourceArchiveText.EndsWith("NATIVE-CAPTURE-WAIT released=T`n$endMarker`n", [StringComparison]::Ordinal)) {
        throw 'Mapped source report does not contain the complete READY prefix and capture/release footer'
    }
    if ($map.functions.Count -ne $expectedNames.Count -or $captureManifest.functions.Count -ne $expectedNames.Count) {
        throw 'Mapped function count differs from the source-bound current candidate set'
    }
    $mapNames = @($map.functions | ForEach-Object { [string]$_.name } | Sort-Object)
    $captureNames = @($captureManifest.functions | ForEach-Object { [string]$_.name } | Sort-Object)
    if (($mapNames -join ',') -cne ($expectedNames -join ',') -or
        ($captureNames -join ',') -cne ($expectedNames -join ',')) {
        throw 'Mapped and captured function names differ from the current candidate set'
    }

    if ('AaronCallerBreakpoint' -as [type]) { throw 'AaronCallerBreakpoint is already loaded in this PowerShell session' }
    $debuggerPath = Join-Path $repoRoot 'research\oracle\AaronCallerBreakpoint.cs'
    $debuggerBytes = [IO.File]::ReadAllBytes($debuggerPath)
    $debuggerHash = Get-BytesSha256 $debuggerBytes
    $debuggerOffset = if ($debuggerBytes.Length -ge 3 -and $debuggerBytes[0] -eq 0xEF -and $debuggerBytes[1] -eq 0xBB -and $debuggerBytes[2] -eq 0xBF) { 3 } else { 0 }
    $debuggerSource = [Text.UTF8Encoding]::new($false, $true).GetString($debuggerBytes, $debuggerOffset, $debuggerBytes.Length - $debuggerOffset)
    Add-Type -TypeDefinition $debuggerSource -Language CSharp

    $captureByName = @{}
    foreach ($capture in $captureManifest.functions) { $captureByName[[string]$capture.name] = $capture }
    foreach ($mapped in $map.functions) {
        $name = [string]$mapped.name
        $capture = $captureByName[$name]
        if (-not $mapped.uniqueCompleteObjectByteMatch -or
            $mapped.capture.file -cne $capture.file -or $mapped.capture.sha256 -cne $capture.sha256 -or
            $mapped.capture.bytes -ne $capture.bytes -or $mapped.capture.windowBase -cne $capture.windowBase -or
            $mapped.payloadFile -cnotmatch '^[a-z0-9-]+\.native-payload\.bin$' -or
            $capture.file -cnotmatch '^[a-z0-9-]+\.native-window\.bin$') {
            throw "Map/capture identity or exact PLL match is invalid for $name"
        }
        $payloadPath = Join-Path $mapDirectory $mapped.payloadFile
        $windowPath = Join-Path $nativeRoot $capture.file
        $payload = [IO.File]::ReadAllBytes($payloadPath)
        $window = [IO.File]::ReadAllBytes($windowPath)
        $payloadOffset = [int]$mapped.pll.payloadOffset
        $objectOffset = [int]$mapped.pll.objectOffset
        $rawEnd = [int]$mapped.pll.rawEnd
        $objectLength = [int]$mapped.objectBytes
        $windowOffset = [int]$mapped.runtime.headerOffsetInWindow
        if ($payload.Length -ne $mapped.payloadBytes -or
            (Get-Sha256 $payloadPath) -cne $mapped.payloadSha256 -or
            $payloadOffset -ne ($objectOffset + 4) -or $rawEnd - $payloadOffset -ne $payload.Length -or
            $objectLength -ne (4 + $payload.Length) -or $rawEnd -gt $pllBytes.Length -or
            $windowOffset -lt 0 -or $windowOffset + $objectLength -gt $window.Length) {
            throw "Mapped payload bounds or hash are invalid for $name"
        }
        $pllPayload = [byte[]]::new($payload.Length)
        [Array]::Copy($pllBytes, $payloadOffset, $pllPayload, 0, $payload.Length)
        $pllObject = [byte[]]::new($objectLength)
        [Array]::Copy($pllBytes, $objectOffset, $pllObject, 0, $objectLength)
        $capturedObject = [byte[]]::new($objectLength)
        [Array]::Copy($window, $windowOffset, $capturedObject, 0, $objectLength)
        if ([Convert]::ToBase64String($payload) -cne [Convert]::ToBase64String($pllPayload) -or
            [Convert]::ToBase64String($pllObject) -cne [Convert]::ToBase64String($capturedObject)) {
            throw "Exact complete PLL object/window consistency failed for $name"
        }
        $entry = [uint64]$currentHeaders[$name].entry
        if ($entry -eq 0 -or $entry + [uint64]$payload.Length -gt 0x100000000) { throw "Invalid current entry range for $name" }
        $live = [AaronCallerBreakpoint]::Read($aaronProcessId, [uint32]$entry, $payload.Length)
        if ([Convert]::ToBase64String($live) -cne [Convert]::ToBase64String($payload)) {
            throw "Current live code differs from the exact mapped PLL payload for $name"
        }
        $mappedFunctions += [ordered]@{
            name = $name
            entry = ('0x{0:x8}' -f [uint32]$entry)
            payloadBytes = $payload.Length
            payloadSha256 = $mapped.payloadSha256
            pllObjectOffset = $objectOffset
            pllPayloadOffset = $payloadOffset
            exactPllObjectMatch = $true
            exactCurrentLivePayloadMatch = $true
        }
    }
    if ($mappedFunctions.Count -ne $expectedNames.Count) { throw 'Not every mapped candidate passed live-byte validation' }
    $report.liveFunctions = @($mappedFunctions)
    $report.debuggerHelperSha256 = $debuggerHash

    $target = @($mappedFunctions | Where-Object { $_.name -ceq 'PICK' })
    if ($target.Count -ne 1) { throw 'Mapped live target PICK is missing or duplicated' }
    $outcome = 'entry-hit'
    try {
        $hit = [AaronCallerBreakpoint]::Capture($aaronProcessId,
            [Convert]::ToUInt32($target[0].entry.Substring(2), 16), $release, $Seconds)
    } catch {
        $captureError = $_.Exception.Message
        if ($captureError -like '*No selected entry breakpoint observed within the deadline*') {
            $outcome = 'no-entry-within-deadline'
        } else {
            throw
        }
    }
    $report.hit = if ($null -ne $hit) { $hit } else { $null }
    $report.captureError = $captureError
    $report.outcome = $outcome
    if ($null -ne $hit) {
        if (-not $hit.ContainsKey('returnAddress')) { throw 'PICK breakpoint hit has no immediate return address' }
        $report.immediateReturn = Resolve-ReturnAddress ([string]$hit['returnAddress']) $mappedFunctions
        $report.boundedFrameReturns = @($hit['framesBeforeEntryPrologue'] | ForEach-Object {
            [ordered]@{
                frame = $_['frame']
                savedFrame = $_['savedFrame']
                return = Resolve-ReturnAddress ([string]$_['returnAddress']) $mappedFunctions
            }
        })
    }
    [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 16), [Text.UTF8Encoding]::new($false))
    $report | ConvertTo-Json -Depth 16
} catch {
    $report.outcome = 'capture-error'
    $report.captureError = $captureError
    $report.failure = $_.Exception.Message
    $report.liveFunctions = @($mappedFunctions)
    if (-not (Test-Path -LiteralPath $reportPath)) {
        try { [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 16), [Text.UTF8Encoding]::new($false)) }
        catch { Write-Warning "Could not write PICK caller failure report: $($_.Exception.Message)" }
    }
    throw
} finally {
    if ($ownsPauseRelease -and $null -ne $aaronProcessId) {
        $stillOwned = Get-Process -Id $aaronProcessId -ErrorAction SilentlyContinue | Where-Object { $_.Path -in $expectedRuntimeAliases }
        if ($stillOwned -and -not (Test-Path -LiteralPath $release)) {
            [IO.File]::WriteAllText($release, 'PICK caller capture finished or failed')
        }
    }
}
