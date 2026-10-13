# Capture the direct FREE-PATH caller from a runner-owned pre-scene pause.
# MapPath must be an existing paired FREE-PATH/DRAW-CFORM map; its old live
# addresses are checked for provenance, while the current READY headers supply
# the only addresses used for this run's live-byte validation and breakpoint.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$OracleOutputRoot,
    [Parameter(Mandatory = $true)] [string]$MapPath,
    [ValidateRange(10, 180)] [int]$Seconds = 90,
    [string]$MetadataPath = 'C:\temp\aaron-free-path-caller-native-links.txt'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$output = (Resolve-Path -LiteralPath $OracleOutputRoot).Path
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$expectedRuntime = [IO.Path]::GetFullPath((Join-Path $output 'runtime\AARON.exe'))
$expectedRuntimeAliases = @($expectedRuntime)
$allowedMapRoots = @($repoRoot, $output)
$externalRunTargets = @()
$externalRunLink = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'
if (Test-Path -LiteralPath $externalRunLink) {
    $link = Get-Item -LiteralPath $externalRunLink -Force
    if ($link.LinkType -in @('Junction', 'SymbolicLink') -and $link.Target) {
        $linkPath = [IO.Path]::GetFullPath($externalRunLink).TrimEnd('\') + '\'
        $linkTargets = @()
        foreach ($target in @($link.Target)) {
            $targetText = [string]$target
            $targetPath = if ([IO.Path]::IsPathRooted($targetText)) {
                [IO.Path]::GetFullPath($targetText)
            } else {
                [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $externalRunLink) $targetText))
            }
            $allowedMapRoots += $targetPath
            $externalRunTargets += $targetPath
        }
        if ($expectedRuntime.StartsWith($linkPath, [StringComparison]::OrdinalIgnoreCase)) {
            $relativeRuntime = $expectedRuntime.Substring($linkPath.Length)
            foreach ($targetPath in $externalRunTargets) {
                $expectedRuntimeAliases += [IO.Path]::GetFullPath((Join-Path $targetPath $relativeRuntime))
            }
        }
    }
}

$expectedRunner = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\oracle\run-local-scene-state-required-probe.ps1')).Path
$probeSourcePath = Join-Path $repoRoot 'research\introspection\free-path-caller-native-links.cl'
$stagedProbePath = 'C:\temp\aaron-pre-scene-probe.cl'
$metadataFullPath = [IO.Path]::GetFullPath($MetadataPath)
$metadataName = [IO.Path]::GetFileName($metadataFullPath)
$release = 'C:\temp\aaron-native-code-release.txt'
$readyMarker = 'READY free-path-caller-native-links'
$endMarker = 'END free-path-caller-native-links'
$reportPath = Join-Path $output 'free-path-native-caller.json'
$requestPath = Join-Path $output 'pre-scene-probe-request.json'
$manifestPath = Join-Path $repoRoot 'research\extracted\aaron\manifest.json'
$ownedPauseRelease = $false
$aaronProcessId = $null
$functions = @()
$hit = $null
$hitSummary = $null
$captureError = $null
$report = [ordered]@{
    schemaVersion = 1
    targetFunction = 'FREE-PATH'
    outcome = 'validation-failed'
    capturedAt = [DateTimeOffset]::UtcNow.ToString('o')
    oracleRunId = Split-Path -Leaf $output
    runtimeExecutable = $expectedRuntime
    sourceProbeSha256 = $null
    stagedProbeSha256 = $null
    runnerSha256 = $null
    requestSha256 = $null
    metadataSha256 = $null
    sourceMapSha256 = $null
    mapCaptureManifestSha256 = $null
    captureHelperSha256 = $null
    debuggerHelperSha256 = $null
    runtimeExecutableSha256 = $null
    runtimePllSha256 = $null
    extractedExeSha256 = $null
    extractedPllSha256 = $null
    processId = $null
    mappedFunctions = @()
    liveFunctions = @()
    hit = $null
    immediateReturn = $null
    boundedFrameReturns = @()
    captureError = $null
    failure = $null
    limitations = @(
        'Only the first FREE-PATH entry in this bounded seeded scene is observed.',
        'The immediate caller is named only when exactly one current, live-validated PLL payload interval contains the entry return address.',
        'Unresolved or ambiguous return addresses remain so; bounded EBP frame returns are reported separately and do not identify the direct caller.',
        'A hit does not establish a general caller relationship, Lisp source, Lisp ABI, or whole-painting parity.',
        'The debugger uses one execute hardware breakpoint and restores thread debug registers; it writes no code or process memory.'
    )
}

function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-BytesSha256([byte[]]$Bytes) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $digest = $algorithm.ComputeHash($Bytes)
        return ([BitConverter]::ToString($digest).Replace('-', '')).ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
    }
}

function Convert-HexAddress([string]$Value, [string]$Label) {
    if ($Value -cnotmatch '^0x[0-9a-fA-F]{1,8}$') {
        throw "$Label is not a bounded 32-bit hexadecimal address"
    }
    return [uint64][Convert]::ToUInt32($Value.Substring(2), 16)
}

function Assert-PathInside([string]$Path, [string[]]$Roots, [string]$Label) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    $inside = $false
    foreach ($root in $Roots) {
        $prefix = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
        if ($fullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
            $inside = $true
            break
        }
    }
    if (-not $inside) {
        throw "$Label must remain under the repository"
    }
    return $fullPath
}

function Assert-ExactPairMetadata([string]$Text, [string]$Label) {
    $normalized = $Text.Replace("`r`n", "`n")
    if (-not $normalized.EndsWith("`n", [StringComparison]::Ordinal)) {
        throw "$Label has no complete final line"
    }
    $lines = @($normalized.Substring(0, $normalized.Length - 1).Split([char]10))
    if ($lines.Count -ne 10 -or
        $lines[0] -cne 'BEGIN free-path-caller-native-links' -or
        $lines[1] -cne 'INSTALL targets=2 mode=READ-ONLY-METADATA' -or
        $lines[2] -cne 'FUNCTION name="FREE-PATH" type=COMPILED-FUNCTION' -or
        $lines[4] -cne 'FUNCTION name="DRAW-CFORM" type=COMPILED-FUNCTION' -or
        $lines[6] -cne 'TOTALS targets=2 functions=2 headers=2 errors=0 truncations=0' -or
        $lines[7] -cne 'ERROR-COUNT 0' -or
        $lines[8] -cne 'TRUNCATION-COUNT 0' -or
        $lines[9] -cne $readyMarker) {
        throw "$Label is not the complete, error-free two-function READY report"
    }
    $headerPattern = '^HEADER name="(FREE-PATH|DRAW-CFORM)" bytes=([0-9A-F]{128})$'
    $headers = @{}
    foreach ($lineIndex in @(3, 5)) {
        $match = [regex]::Match($lines[$lineIndex], $headerPattern)
        if (-not $match.Success -or $headers.ContainsKey($match.Groups[1].Value)) {
            throw "$Label has a malformed or duplicate function header"
        }
        $name = $match.Groups[1].Value
        $hex = $match.Groups[2].Value
        $bytes = [byte[]]@(0..63 | ForEach-Object {
            [Convert]::ToByte($hex.Substring($_ * 2, 2), 16)
        })
        $headers[$name] = [ordered]@{
            name = $name
            headerHex = $hex.ToLowerInvariant()
            entry = [BitConverter]::ToUInt32($bytes, 18)
            headerBytes = $bytes
        }
    }
    if ($headers.Count -ne 2 -or -not $headers.ContainsKey('FREE-PATH') -or
        -not $headers.ContainsKey('DRAW-CFORM')) {
        throw "$Label does not contain exactly FREE-PATH and DRAW-CFORM"
    }
    return $headers
}

try {
    $report.captureHelperSha256 = Get-Sha256 $PSCommandPath
    $probeHash = Get-Sha256 $probeSourcePath
    $report.sourceProbeSha256 = $probeHash
    $stagedProbeHash = if (Test-Path -LiteralPath $stagedProbePath -PathType Leaf) {
        Get-Sha256 $stagedProbePath
    } else { '' }
    $report.stagedProbeSha256 = $stagedProbeHash
    $runnerHash = Get-Sha256 $expectedRunner
    $report.runnerSha256 = $runnerHash

    $requestBytes = [IO.File]::ReadAllBytes($requestPath)
    $requestText = [Text.Encoding]::UTF8.GetString($requestBytes)
    $request = $requestText | ConvertFrom-Json
    $requestHash = Get-Sha256 $requestPath
    $report.requestSha256 = $requestHash
    $expectedMetadataPath = [IO.Path]::GetFullPath((Join-Path 'C:\temp' $metadataName))
    if ($request.schemaVersion -ne 1 -or
        $request.runId -cne (Split-Path -Leaf $output) -or
        $request.runtimeExecutable -cne $expectedRuntime -or
        $request.probeSha256 -cne $probeHash -or
        $stagedProbeHash -cne $probeHash -or
        $request.runnerSha256 -cne $runnerHash -or
        $request.pauseSeconds -lt 1 -or $request.pauseSeconds -gt 300 -or
        $request.releaseFile -cne $release -or
        $request.requiredProbeOutputName -cne $metadataName -or
        $request.requiredProbeEndMarker -cne $endMarker -or
        $metadataFullPath -cne $expectedMetadataPath -or
        (@($request.probeOutputNames).Count -ne 1) -or
        $request.probeOutputNames[0] -cne $metadataName) {
        throw 'Capture requires the matching runner-owned, source/staged-hashed FREE-PATH caller probe pause'
    }
    if (Test-Path -LiteralPath $release) {
        throw 'The native-code release marker already exists; refusing to take ownership of the pause'
    }
    if (Test-Path -LiteralPath $reportPath) {
        throw 'FREE-PATH caller report must be fresh'
    }

    $metadataDeadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $metadataDeadline) {
        if ((Test-Path -LiteralPath $MetadataPath -PathType Leaf) -and
            (Select-String -LiteralPath $MetadataPath -SimpleMatch $readyMarker -Quiet)) { break }
        Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path -LiteralPath $MetadataPath -PathType Leaf)) {
        throw 'The paused native metadata report was not created'
    }
    $metadataBytes = [IO.File]::ReadAllBytes($MetadataPath)
    $metadata = [Text.Encoding]::UTF8.GetString($metadataBytes)
    $report.metadataSha256 = Get-Sha256 $MetadataPath
    $currentHeaders = Assert-ExactPairMetadata $metadata 'Current paused metadata'
    if (Test-Path -LiteralPath $release) {
        throw 'The pre-scene pause was already released before the caller breakpoint attached'
    }

    $allAaron = @(Get-Process AARON -ErrorAction SilentlyContinue)
    $processes = @($allAaron | Where-Object { $_.Path -in $expectedRuntimeAliases })
    if ($allAaron.Count -ne 1 -or $processes.Count -ne 1) {
        throw 'Expected exactly one AARON process, owned by this oracle output root'
    }
    $aaronProcessId = [uint32]$processes[0].Id
    $report.processId = $aaronProcessId
    $ownedPauseRelease = $true

    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $manifestExe = @($manifest.files | Where-Object { $_.installedName -eq 'AARON.exe' })
    $manifestPll = @($manifest.files | Where-Object { $_.installedName -eq 'AARON.pll' })
    if ($manifestExe.Count -ne 1 -or $manifestPll.Count -ne 1) {
        throw 'The extracted manifest must identify one AARON.exe and one AARON.pll'
    }
    $runtimeHash = Get-Sha256 $expectedRuntime
    $runtimeBytes = (Get-Item -LiteralPath $expectedRuntime).Length
    $runtimePll = Join-Path $output 'runtime\AARON.pll'
    $runtimePllHash = Get-Sha256 $runtimePll
    $runtimePllBytes = (Get-Item -LiteralPath $runtimePll).Length
    $report.runtimeExecutableSha256 = $runtimeHash
    $report.runtimePllSha256 = $runtimePllHash
    $report.extractedExeSha256 = [string]$manifestExe[0].sha256
    $report.extractedPllSha256 = [string]$manifestPll[0].sha256
    if ($runtimeHash -cne $manifestExe[0].sha256 -or
        $runtimeBytes -ne $manifestExe[0].bytes -or
        $runtimePllHash -cne $manifestPll[0].sha256 -or
        $runtimePllBytes -ne $manifestPll[0].bytes) {
        throw 'The current oracle executable or PLL differs from the extracted source manifest'
    }

    $mapFile = Assert-PathInside (Resolve-Path -LiteralPath $MapPath).Path $allowedMapRoots 'Native map'
    $mapDirectory = Split-Path -Parent $mapFile
    if ((Split-Path -Leaf $mapFile) -cne 'native-code-map.json' -or
        (Split-Path -Leaf $mapDirectory) -cne 'mapped') {
        throw 'MapPath must identify a mapped/native-code-map.json artifact'
    }
    $nativeRoot = Split-Path -Parent $mapDirectory
    if ((Split-Path -Leaf $nativeRoot) -cne 'native-code') {
        throw 'The native map must remain beside its source native-code capture manifest'
    }
    $mapBytes = [IO.File]::ReadAllBytes($mapFile)
    $map = [Text.Encoding]::UTF8.GetString($mapBytes) | ConvertFrom-Json
    $report.sourceMapSha256 = Get-Sha256 $mapFile
    if ($map.schemaVersion -ne 1 -or
        $map.pll.bytes -ne $manifestPll[0].bytes -or
        $map.pll.sha256 -cne $manifestPll[0].sha256) {
        throw 'Native map is not bound to the extracted AARON.pll'
    }

    $captureManifestPath = Join-Path $nativeRoot 'manifest.json'
    $captureMetadataPath = Join-Path $nativeRoot 'function-object-metadata.txt'
    $captureManifestBytes = [IO.File]::ReadAllBytes($captureManifestPath)
    $captureManifestHash = Get-BytesSha256 $captureManifestBytes
    $report.mapCaptureManifestSha256 = $captureManifestHash
    if ($map.captureManifestSha256 -cne $captureManifestHash) {
        throw 'Native map capture-manifest hash does not match its source manifest'
    }
    $captureManifest = [Text.Encoding]::UTF8.GetString($captureManifestBytes) | ConvertFrom-Json
    if ($captureManifest.schemaVersion -ne 1 -or
        $captureManifest.processId -le 0 -or
        $captureManifest.functions.Count -ne 2) {
        throw 'Native capture manifest is incomplete or has an unsupported schema'
    }
    $captureOutputRoot = Split-Path -Parent $nativeRoot
    $captureRuntime = [IO.Path]::GetFullPath((Join-Path $captureOutputRoot 'runtime\AARON.exe'))
    $captureRuntimeAliases = @($captureRuntime)
    foreach ($targetPath in $externalRunTargets) {
        $targetPrefix = $targetPath.TrimEnd('\') + '\'
        if ($captureOutputRoot.StartsWith($targetPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            $relativeOutputRoot = $captureOutputRoot.Substring($targetPrefix.Length)
            $linkedOutputRoot = Join-Path $externalRunLink $relativeOutputRoot
            $captureRuntimeAliases += [IO.Path]::GetFullPath((Join-Path $linkedOutputRoot 'runtime\AARON.exe'))
        }
    }
    if ($captureManifest.runtimeExecutable -notin $captureRuntimeAliases -or
        -not (Test-Path -LiteralPath $captureManifest.runtimeExecutable -PathType Leaf) -or
        (Get-Sha256 $captureManifest.runtimeExecutable) -cne $manifestExe[0].sha256) {
        throw 'Native capture manifest runtime is not the extracted AARON.exe'
    }

    $captureRunId = Split-Path -Leaf $captureOutputRoot
    $captureRequestPath = Join-Path $captureOutputRoot 'pre-scene-probe-request.json'
    $captureSummaryPath = Join-Path $captureOutputRoot 'summary.json'
    $captureArchivePath = Join-Path $captureOutputRoot 'capture\aaron-free-path-caller-native-links.txt'
    $captureStagedProbePath = Join-Path $captureOutputRoot 'capture\aaron-pre-scene-probe.cl'
    $captureAa0Path = Join-Path $captureOutputRoot 'capture\aa0'
    $captureScenePath = Join-Path $captureOutputRoot 'capture\aaron-scene-state-snapshot.txt'
    foreach ($path in @($captureRequestPath, $captureSummaryPath, $captureArchivePath,
                         $captureStagedProbePath,
                         $captureAa0Path, $captureScenePath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Mapped source run is incomplete; missing $path"
        }
    }
    $captureRequest = Get-Content -LiteralPath $captureRequestPath -Raw | ConvertFrom-Json
    $captureSummary = Get-Content -LiteralPath $captureSummaryPath -Raw | ConvertFrom-Json
    $captureProbeName = 'aaron-free-path-caller-native-links.txt'
    if ($captureRequest.schemaVersion -ne 1 -or
        $captureRequest.runId -cne $captureRunId -or
        $captureRequest.runtimeExecutable -cne $captureManifest.runtimeExecutable -or
        $captureRequest.probeSha256 -cne $probeHash -or
        $captureRequest.runnerSha256 -cne $runnerHash -or
        $captureRequest.requiredProbeOutputName -cne $captureProbeName -or
        $captureRequest.requiredProbeEndMarker -cne $endMarker -or
        $captureRequest.releaseFile -cne $release -or
        (Get-Sha256 $captureStagedProbePath) -cne $probeHash -or
        @($captureRequest.probeOutputNames).Count -ne 1 -or
        $captureRequest.probeOutputNames[0] -cne $captureProbeName -or
        $captureSummary.runId -cne $captureRunId -or
        $captureSummary.preSceneProbeSha256 -cne $probeHash -or
        $captureSummary.runnerSha256 -cne $runnerHash -or
        $captureSummary.requiredProbeOutputName -cne $captureProbeName -or
        $captureSummary.requiredProbeEndMarker -cne $endMarker -or
        -not $captureSummary.complete -or
        -not $captureSummary.probeCompletionSatisfied -or
        @($captureSummary.probeOutputNames).Count -ne 1 -or
        $captureSummary.probeOutputNames[0] -cne $captureProbeName -or
        (Get-Sha256 $captureAa0Path) -cne $captureSummary.aa0Sha256 -or
        (Get-Sha256 $captureScenePath) -cne $captureSummary.sceneReportSha256 -or
        (Get-Content -LiteralPath $captureAa0Path -Tail 1) -cne 'end' -or
        -not (Select-String -LiteralPath $captureScenePath -SimpleMatch 'END scene-state-snapshot' -Quiet)) {
        throw 'Paired native map is not bound to a complete source-hashed caller metadata run and drawing'
    }
    if ((Get-Sha256 $captureMetadataPath) -cne $captureManifest.metadataSha256) {
        throw 'Native capture metadata does not match its source manifest hash'
    }
    $captureMetadataText = [IO.File]::ReadAllText($captureMetadataPath).Replace("`r`n", "`n")
    $captureHeaders = Assert-ExactPairMetadata $captureMetadataText 'Mapped source metadata'
    $captureArchiveText = [IO.File]::ReadAllText($captureArchivePath).Replace("`r`n", "`n")
    $readyPrefix = $readyMarker + "`n"
    $readyPosition = $captureArchiveText.IndexOf($readyPrefix, [StringComparison]::Ordinal)
    if ($readyPosition -lt 0 -or
        $captureArchiveText.Substring(0, $readyPosition + $readyPrefix.Length) -cne $captureMetadataText -or
        -not $captureArchiveText.EndsWith("COMPLETE free-path-caller-native-links`n$endMarker`n", [StringComparison]::Ordinal)) {
        throw 'Mapped source metadata is not the exact READY prefix of its complete archived observer report'
    }

    $pllPath = Join-Path $repoRoot 'research\extracted\aaron\application\AARON.pll'
    if (-not (Test-Path -LiteralPath $pllPath -PathType Leaf) -or
        (Get-Sha256 $pllPath) -cne $manifestPll[0].sha256) {
        throw 'The extracted AARON.pll bytes differ from research/extracted/aaron/manifest.json'
    }
    $pll = [IO.File]::ReadAllBytes($pllPath)
    $requiredNames = @('DRAW-CFORM', 'FREE-PATH')
    $mapFunctions = @($map.functions)
    if ($mapFunctions.Count -ne 2 -or
        (@($mapFunctions | ForEach-Object name | Sort-Object) -join ',') -cne ($requiredNames -join ',')) {
        throw 'Native map must contain exactly DRAW-CFORM and FREE-PATH'
    }
    $captureFunctions = @($captureManifest.functions)
    if ((@($captureFunctions | ForEach-Object name | Sort-Object) -join ',') -cne ($requiredNames -join ',')) {
        throw 'Native capture manifest must contain exactly DRAW-CFORM and FREE-PATH'
    }

    $debuggerPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\oracle\AaronCallerBreakpoint.cs')).Path
    $debuggerBytes = [IO.File]::ReadAllBytes($debuggerPath)
    $debuggerHash = Get-BytesSha256 $debuggerBytes
    $report.debuggerHelperSha256 = $debuggerHash
    if ('AaronCallerBreakpoint' -as [type]) {
        throw 'AaronCallerBreakpoint is already loaded in this PowerShell session; refusing to reuse a type not compiled from the hashed source bytes'
    }
    $debuggerSourceOffset = 0
    if ($debuggerBytes.Length -ge 3 -and
        $debuggerBytes[0] -eq 0xEF -and
        $debuggerBytes[1] -eq 0xBB -and
        $debuggerBytes[2] -eq 0xBF) {
        $debuggerSourceOffset = 3
    }
    $debuggerSource = [Text.UTF8Encoding]::new($false, $true).GetString(
        $debuggerBytes,
        $debuggerSourceOffset,
        $debuggerBytes.Length - $debuggerSourceOffset
    )
    if ([string]::IsNullOrWhiteSpace($debuggerSource)) {
        throw 'AaronCallerBreakpoint source is empty after UTF-8 decoding'
    }
    Add-Type -TypeDefinition $debuggerSource -Language CSharp
    if (-not ('AaronCallerBreakpoint' -as [type])) {
        throw 'AaronCallerBreakpoint did not load from the hashed source bytes'
    }
    foreach ($name in $requiredNames) {
        $mappedItems = @($mapFunctions | Where-Object { $_.name -ceq $name })
        $captureItems = @($captureFunctions | Where-Object { $_.name -ceq $name })
        if ($mappedItems.Count -ne 1 -or $captureItems.Count -ne 1) {
            throw "Native mapping has a missing or duplicate record for $name"
        }
        $mapped = $mappedItems[0]
        $capture = $captureItems[0]
        if (-not $mapped.uniqueCompleteObjectByteMatch -or
            $mapped.payloadFile -cnotmatch '^[a-z0-9-]+\.native-payload\.bin$' -or
            $capture.file -cnotmatch '^[a-z0-9-]+\.native-window\.bin$' -or
            $mapped.capture.file -cne $capture.file -or
            $mapped.capture.sha256 -cne $capture.sha256 -or
            $mapped.capture.bytes -ne $capture.bytes -or
            $mapped.capture.windowBase -cne $capture.windowBase -or
            $mapped.capture.functionObjectHeaderHex -cne $capture.functionObjectHeaderHex) {
            throw "Mapped capture identity is inconsistent for $name"
        }
        if ([int]$capture.bytes -lt 64 -or [int]$capture.bytes -gt 16384) {
            throw "Native capture window is outside explicit bounds for $name"
        }
        $oldEntry = Convert-HexAddress ([string]$mapped.runtime.entry) "$name mapped entry"
        $captureEntry = Convert-HexAddress ([string]$capture.entryCandidate) "$name captured entry"
        $windowBase = Convert-HexAddress ([string]$capture.windowBase) "$name captured window base"
        if ($oldEntry -ne $captureEntry -or $oldEntry -lt ($windowBase + 4) -or
            $mapped.runtime.headerOffsetInWindow -ne ($oldEntry - $windowBase - 4)) {
            throw "Mapped runtime header location disagrees with the native capture for $name"
        }
        if ($captureHeaders[$name].headerHex -cne $capture.functionObjectHeaderHex.ToLowerInvariant() -or
            [uint64]$captureHeaders[$name].entry -ne $captureEntry) {
            throw "Mapped function header does not match its complete source metadata for $name"
        }
        $windowPath = Join-Path $nativeRoot $capture.file
        if ((Get-Sha256 $windowPath) -cne $capture.sha256 -or
            (Get-Item -LiteralPath $windowPath).Length -ne $capture.bytes) {
            throw "Native capture window hash or extent mismatch for $name"
        }
        $window = [IO.File]::ReadAllBytes($windowPath)
        $windowHeaderOffset = [int]$mapped.runtime.headerOffsetInWindow
        $objectOffset = [uint64]$mapped.pll.objectOffset
        $payloadOffset = [uint64]$mapped.pll.payloadOffset
        $rawEnd = [uint64]$mapped.pll.rawEnd
        $payloadBytes = [int]$mapped.payloadBytes
        $objectBytes = [int]$mapped.objectBytes
        $encodedWords = [int]$mapped.encodedWords
        $nativeHeader = [BitConverter]::ToUInt32($window, $windowHeaderOffset)
        $mappedHeader = Convert-HexAddress ([string]$mapped.header) "$name mapped object header"
        if ($payloadBytes -lt 1 -or $payloadBytes -gt 1048576 -or
            $objectBytes -ne (4 + 2 * $encodedWords) -or
            $objectBytes -ne (4 + $payloadBytes) -or
            ($nativeHeader -band 0xff) -ne 0x6c -or
            [uint64]$nativeHeader -ne $mappedHeader -or
            $encodedWords -ne ($nativeHeader -shr 8) -or
            $payloadOffset -ne ($objectOffset + 4) -or
            $rawEnd -le $payloadOffset -or
            ($rawEnd - $objectOffset) -ne [uint64]$objectBytes -or
            $rawEnd -gt [uint64]$pll.Length) {
            throw "Mapped PLL object has inconsistent bounded extent for $name"
        }
        if ($windowHeaderOffset -lt 0 -or $windowHeaderOffset + $objectBytes -gt $window.Length) {
            throw "Mapped complete object is outside the captured window for $name"
        }
        $payloadFile = Join-Path $mapDirectory $mapped.payloadFile
        $payload = [IO.File]::ReadAllBytes($payloadFile)
        $pllPayload = [byte[]]::new($payloadBytes)
        [Array]::Copy($pll, [int]$payloadOffset, $pllPayload, 0, $payloadBytes)
        $object = [byte[]]::new($objectBytes)
        [Array]::Copy($pll, [int]$objectOffset, $object, 0, $objectBytes)
        $capturedObject = [byte[]]::new($objectBytes)
        [Array]::Copy($window, $windowHeaderOffset, $capturedObject, 0, $objectBytes)
        if ($payload.Length -ne $payloadBytes -or
            (Get-Sha256 $payloadFile) -cne $mapped.payloadSha256 -or
            [Convert]::ToBase64String($payload) -cne [Convert]::ToBase64String($pllPayload) -or
            [Convert]::ToBase64String($object) -cne [Convert]::ToBase64String($capturedObject)) {
            throw "Mapped payload is not the exact complete PLL object captured for $name"
        }

        $entry = [uint64]$currentHeaders[$name].entry
        if ($entry -eq 0 -or ($entry + [uint64]$payloadBytes) -gt 0x100000000) {
            throw "Current metadata entry has an invalid payload range for $name"
        }
        $live = [AaronCallerBreakpoint]::Read($aaronProcessId, [uint32]$entry, $payloadBytes)
        if ([Convert]::ToBase64String($live) -cne [Convert]::ToBase64String($payload)) {
            throw "Current live code differs from the exact mapped PLL payload for $name"
        }
        $functions += [ordered]@{
            name = $name
            entry = ('0x{0:x8}' -f [uint32]$entry)
            payloadBytes = $payloadBytes
            payloadSha256 = $mapped.payloadSha256
            pllObjectOffset = $objectOffset
            pllPayloadOffset = $payloadOffset
            exactPllObjectMatch = $true
            exactCurrentLivePayloadMatch = $true
        }
    }
    if ($functions.Count -ne 2) { throw 'Both mapped functions must pass current live-byte validation' }
    $report.mappedFunctions = @($functions)
    $report.liveFunctions = @($functions)

    $freePath = @($functions | Where-Object { $_.name -ceq 'FREE-PATH' })[0]
    $outcome = 'entry-hit'
    try {
        $hit = [AaronCallerBreakpoint]::Capture(
            $aaronProcessId,
            [Convert]::ToUInt32($freePath.entry.Substring(2), 16),
            $release,
            $Seconds)
    } catch {
        $captureError = $_.Exception.Message
        if ($captureError -like '*No selected entry breakpoint observed within the deadline*') {
            $outcome = 'no-entry-within-deadline'
        } else {
            throw
        }
    }

    $immediateReturn = $null
    $frameReturns = @()
    if ($null -ne $hit) {
        if (-not $hit.ContainsKey('returnAddress')) {
            throw 'Entry hit has no immediate stack return address'
        }
        $addressText = [string]$hit['returnAddress']
        $addressValue = Convert-HexAddress $addressText 'Immediate FREE-PATH return address'
        $matches = @()
        foreach ($fn in $functions) {
            $start = Convert-HexAddress $fn.entry "$($fn.name) live entry"
            $endExclusive = $start + [uint64]$fn.payloadBytes
            if ($addressValue -ge $start -and $addressValue -lt $endExclusive) {
                $matches += [ordered]@{
                    function = $fn.name
                    offset = $addressValue - $start
                    entry = $fn.entry
                    payloadBytes = $fn.payloadBytes
                }
            }
        }
        $resolution = if ($matches.Count -eq 1) {
            [ordered]@{
                status = 'unique-mapped-interval'
                address = $addressText
                function = $matches[0].function
                offset = $matches[0].offset
                matchingIntervals = @($matches)
            }
        } elseif ($matches.Count -gt 1) {
            [ordered]@{
                status = 'ambiguous-overlap'
                address = $addressText
                function = $null
                offset = $null
                matchingIntervals = @($matches)
            }
        } else {
            [ordered]@{
                status = 'unresolved-outside-mapped-intervals'
                address = $addressText
                function = $null
                offset = $null
                matchingIntervals = @()
            }
        }
        $immediateReturn = $resolution
        $frameReturns = @($hit['framesBeforeEntryPrologue'] | ForEach-Object {
            [ordered]@{
                frame = $_['frame']
                savedFrame = $_['savedFrame']
                returnAddress = $_['returnAddress']
            }
        })
        $hitSummary = [ordered]@{}
        foreach ($key in $hit.Keys) {
            if ($key -cne 'framesBeforeEntryPrologue') {
                $hitSummary[$key] = $hit[$key]
            }
        }
    }

    $report.outcome = $outcome
    $report.hit = $hitSummary
    $report.immediateReturn = $immediateReturn
    $report.boundedFrameReturns = @($frameReturns)
    $report.captureError = $captureError
    [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
    $report | ConvertTo-Json -Depth 12
} catch {
    $report.hit = if ($null -ne $hitSummary) { $hitSummary } else { $hit }
    $report.captureError = $captureError
    $report.mappedFunctions = @($functions)
    $report.liveFunctions = @($functions)
    $report.failure = $_.Exception.Message
    if ($report.outcome -eq 'validation-failed') { $report.outcome = 'rejected' }
    if (-not (Test-Path -LiteralPath $reportPath)) {
        try {
            [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
        } catch {
            Write-Warning "Could not write the FREE-PATH caller rejection report: $($_.Exception.Message)"
        }
    }
    throw
} finally {
    if ($ownedPauseRelease -and -not (Test-Path -LiteralPath $release)) {
        [IO.File]::WriteAllText($release, 'FREE-PATH caller capture finished or failed')
    }
}
