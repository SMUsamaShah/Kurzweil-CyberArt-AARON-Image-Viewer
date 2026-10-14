# Bounded live capture at the three REA-mapped FREE-PATH call sites.
# Invoke only while the matching required-probe runner owns its positive
# pre-scene READY pause. All process-memory operations are reads; the C# helper
# changes/restores debugger thread contexts only.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$OracleOutputRoot,
    [Parameter(Mandatory = $true)] [string]$MapPath,
    [ValidateRange(10, 180)] [int]$Seconds = 90,
    [string]$MetadataPath = 'C:\temp\aaron-free-path-caller-native-links.txt'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$utilityModuleManifest = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
try {
    Import-Module -Name $utilityModuleManifest -Force -ErrorAction Stop -WarningAction SilentlyContinue
    $null = Get-Command -Name Get-FileHash -ErrorAction Stop
}
catch {
    throw "Unable to load the PowerShell utility module required for source hashing: $($_.Exception.Message)"
}

$output = (Resolve-Path -LiteralPath $OracleOutputRoot).Path
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$expectedRuntime = [IO.Path]::GetFullPath((Join-Path $output 'runtime\AARON.exe'))
$runnerPath = (Resolve-Path -LiteralPath (Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1')).Path
$probePath = Join-Path $repoRoot 'research\introspection\free-path-caller-native-links.cl'
$debuggerPath = Join-Path $repoRoot 'research\oracle\AaronFreePathCallsitesV1.cs'
$release = 'C:\temp\aaron-native-code-release.txt'
$readyMarker = 'READY free-path-caller-native-links'
$endMarker = 'END free-path-caller-native-links'
$reportPath = Join-Path $output 'free-path-callsite-v1.json'
$ownedPauseRelease = $false
$aaronProcessId = $null
$nativeResult = $null
$report = [ordered]@{
    schemaVersion = 1
    targetFunction = 'FREE-PATH'
    outcome = 'validation-failed'
    oracleRunId = Split-Path -Leaf $output
    runtimeExecutable = $expectedRuntime
    sourceProbeSha256 = $null
    stagedProbeSha256 = $null
    runnerSha256 = $null
    requestSha256 = $null
    metadataSha256 = $null
    readyPrefixSha256 = $null
    sourceMapSha256 = $null
    mapCaptureManifestSha256 = $null
    debuggerHelperSha256 = $null
    captureHelperSha256 = $null
    runtimeExecutableSha256 = $null
    runtimePllSha256 = $null
    extractedExeSha256 = $null
    extractedPllSha256 = $null
    processId = $null
    mappedFunction = $null
    liveFunction = $null
    instructionSites = @()
    capture = $null
    failure = $null
    limitations = @(
        'The first hit at each of three native offsets is captured; each breakpoint is one-shot and is never re-armed.',
        'After the first hit, only that thread contributes observations; other thread contexts are restored.',
        'The captured EFLAGS are sampled at +0x3ac. The later +0x3e4 hit is reported independently; no single-step or causal path claim is made.',
        'The [EDI+0x27] word is read only at +0x39a and +0x3e4. It is raw memory, not a resolved Lisp function or ABI.',
        'A partial/no-hit capture is bounded observation only and does not establish general FREE-PATH behavior or whole-painting parity.'
    )
}

function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-BytesSha256([byte[]]$Bytes) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

function Convert-HexAddress([string]$Value, [string]$Label) {
    if ($Value -cnotmatch '^0x[0-9a-fA-F]{1,8}$') { throw "$Label is not a bounded 32-bit address" }
    return [uint64][Convert]::ToUInt32($Value.Substring(2), 16)
}

function Get-FunctionHeaderEntry([string]$HeaderHex, [string]$Label) {
    if ($HeaderHex -cnotmatch '^[0-9a-fA-F]{128}$') { throw "$Label is not an exact 64-byte header" }
    $bytes = [byte[]]@(0..63 | ForEach-Object { [Convert]::ToByte($HeaderHex.Substring($_ * 2, 2), 16) })
    return [uint64][BitConverter]::ToUInt32($bytes, 18)
}

function Get-PathAliases([string]$RuntimePath) {
    $aliases = [Collections.Generic.List[string]]::new()
    $full = [IO.Path]::GetFullPath($RuntimePath)
    $aliases.Add($full)
    $linkPath = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'
    if (Test-Path -LiteralPath $linkPath) {
        $link = Get-Item -LiteralPath $linkPath -Force
        if ($link.LinkType -in @('Junction', 'SymbolicLink') -and $link.Target) {
            $prefix = [IO.Path]::GetFullPath($linkPath).TrimEnd('\') + '\'
            if ($full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                $relative = $full.Substring($prefix.Length)
                foreach ($target in @($link.Target)) {
                    $targetPath = [string]$target
                    if (-not [IO.Path]::IsPathRooted($targetPath)) {
                        $targetPath = Join-Path (Split-Path -Parent $linkPath) $targetPath
                    }
                    $aliases.Add([IO.Path]::GetFullPath((Join-Path $targetPath $relative)))
                }
            }
        }
    }
    return @($aliases | Select-Object -Unique)
}

function Assert-ReadyMetadata([string]$Text) {
    $normalized = $Text.Replace("`r`n", "`n")
    if ($normalized.Contains("`r") -or -not $normalized.EndsWith("`n", [StringComparison]::Ordinal)) {
        throw 'Current READY metadata has mixed line endings or an incomplete final record'
    }
    $lines = @($normalized.Substring(0, $normalized.Length - 1).Split([char]10))
    if ($lines.Count -ne 10 -or
        $lines[0] -cne 'BEGIN free-path-caller-native-links' -or
        $lines[1] -cne 'INSTALL targets=2 mode=READ-ONLY-METADATA' -or
        $lines[2] -cne 'FUNCTION name="FREE-PATH" type=COMPILED-FUNCTION' -or
        $lines[4] -cne 'FUNCTION name="DRAW-CFORM" type=COMPILED-FUNCTION' -or
        $lines[6] -cne 'TOTALS targets=2 functions=2 headers=2 errors=0 truncations=0' -or
        $lines[7] -cne 'ERROR-COUNT 0' -or $lines[8] -cne 'TRUNCATION-COUNT 0' -or
        $lines[9] -cne $readyMarker) {
        throw 'Current READY metadata is not the complete error-free FREE-PATH/DRAW-CFORM header report'
    }
    $headers = @{}
    foreach ($index in @(3, 5)) {
        $match = [regex]::Match($lines[$index], '^HEADER name="(FREE-PATH|DRAW-CFORM)" bytes=([0-9A-Fa-f]{128})$')
        if (-not $match.Success -or $headers.ContainsKey($match.Groups[1].Value)) {
            throw 'Current READY metadata contains a malformed or duplicate header'
        }
        $name = $match.Groups[1].Value
        $hex = $match.Groups[2].Value
        $bytes = [byte[]]@(0..63 | ForEach-Object { [Convert]::ToByte($hex.Substring($_ * 2, 2), 16) })
        $headers[$name] = [ordered]@{
            headerHex = $hex.ToLowerInvariant()
            entry = [BitConverter]::ToUInt32($bytes, 18)
        }
    }
    if ($headers.Count -ne 2) { throw 'Current READY metadata does not contain exactly two function headers' }
    return [pscustomobject]@{ Text = $normalized; Lines = $lines; Headers = $headers }
}

try {
    $report.captureHelperSha256 = Get-Sha256 $PSCommandPath
    # Hash and compile the same captured source bytes so a concurrent source
    # edit cannot make the report identify code different from what ran.
    $debuggerBytes = [IO.File]::ReadAllBytes($debuggerPath)
    $report.debuggerHelperSha256 = Get-BytesSha256 $debuggerBytes
    $probeHash = Get-Sha256 $probePath
    $report.sourceProbeSha256 = $probeHash
    $stagedProbePath = 'C:\temp\aaron-pre-scene-probe.cl'
    $report.stagedProbeSha256 = if (Test-Path -LiteralPath $stagedProbePath -PathType Leaf) { Get-Sha256 $stagedProbePath } else { '' }
    $report.runnerSha256 = Get-Sha256 $runnerPath

    $requestPath = Join-Path $output 'pre-scene-probe-request.json'
    $requestBytes = [IO.File]::ReadAllBytes($requestPath)
    $request = [Text.Encoding]::UTF8.GetString($requestBytes) | ConvertFrom-Json
    $report.requestSha256 = Get-BytesSha256 $requestBytes
    $expectedMetadataPath = [IO.Path]::GetFullPath((Join-Path 'C:\temp' ([IO.Path]::GetFileName($MetadataPath))))
    if ($request.schemaVersion -ne 1 -or $request.runId -cne (Split-Path -Leaf $output) -or
        $request.runtimeExecutable -cne $expectedRuntime -or $request.probeSha256 -cne $probeHash -or
        $report.stagedProbeSha256 -cne $probeHash -or $request.runnerSha256 -cne $report.runnerSha256 -or
        $request.pauseSeconds -lt 1 -or $request.pauseSeconds -gt 300 -or
        $request.releaseFile -cne $release -or
        $request.requiredProbeOutputName -cne [IO.Path]::GetFileName($MetadataPath) -or
        $request.requiredProbeEndMarker -cne $endMarker -or
        [IO.Path]::GetFullPath($MetadataPath) -cne $expectedMetadataPath -or
        @($request.probeOutputNames).Count -ne 1 -or
        $request.probeOutputNames[0] -cne [IO.Path]::GetFileName($MetadataPath)) {
        throw 'Capture is not bound to the matching runner-owned FREE-PATH READY pause'
    }
    if (Test-Path -LiteralPath $release) { throw 'The reserved native release marker already exists; leaving it untouched' }
    if (Test-Path -LiteralPath $reportPath) { throw 'The versioned helper report must be fresh' }

    $metadataDeadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $metadataDeadline -and
        (-not (Test-Path -LiteralPath $MetadataPath -PathType Leaf) -or
         -not (Select-String -LiteralPath $MetadataPath -SimpleMatch $readyMarker -Quiet -ErrorAction SilentlyContinue))) {
        Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path -LiteralPath $MetadataPath -PathType Leaf)) { throw 'READY metadata was not created' }
    $metadataBytes = [IO.File]::ReadAllBytes($MetadataPath)
    $metadataText = [Text.UTF8Encoding]::new($false, $true).GetString($metadataBytes)
    $ready = Assert-ReadyMetadata $metadataText
    $report.metadataSha256 = Get-BytesSha256 $metadataBytes
    $report.readyPrefixSha256 = $report.metadataSha256

    $allAaron = @(Get-Process AARON -ErrorAction SilentlyContinue)
    $aliases = Get-PathAliases $expectedRuntime
    $owned = @($allAaron | Where-Object { $_.Path -in $aliases })
    if ($allAaron.Count -ne 1 -or $owned.Count -ne 1) {
        throw 'Expected exactly one AARON process owned by this fresh oracle root'
    }
    $aaronProcessId = [uint32]$owned[0].Id
    $report.processId = $aaronProcessId
    $ownedPauseRelease = $true

    $extractedManifest = Get-Content -LiteralPath (Join-Path $repoRoot 'research\extracted\aaron\manifest.json') -Raw | ConvertFrom-Json
    $manifestExe = @($extractedManifest.files | Where-Object installedName -ceq 'AARON.exe')
    $manifestPll = @($extractedManifest.files | Where-Object installedName -ceq 'AARON.pll')
    if ($manifestExe.Count -ne 1 -or $manifestPll.Count -ne 1) { throw 'Extracted manifest lacks unique AARON.exe/AARON.pll entries' }
    $runtimePll = Join-Path $output 'runtime\AARON.pll'
    $report.runtimeExecutableSha256 = Get-Sha256 $expectedRuntime
    $report.runtimePllSha256 = Get-Sha256 $runtimePll
    $report.extractedExeSha256 = [string]$manifestExe[0].sha256
    $report.extractedPllSha256 = [string]$manifestPll[0].sha256
    if ($report.runtimeExecutableSha256 -cne $manifestExe[0].sha256 -or
        (Get-Item -LiteralPath $expectedRuntime).Length -ne $manifestExe[0].bytes -or
        $report.runtimePllSha256 -cne $manifestPll[0].sha256 -or
        (Get-Item -LiteralPath $runtimePll).Length -ne $manifestPll[0].bytes) {
        throw 'Current oracle runtime bytes do not match the extracted source manifest'
    }

    $mapFile = (Resolve-Path -LiteralPath $MapPath).Path
    if ((Split-Path -Leaf $mapFile) -cne 'native-code-map.json' -or
        (Split-Path -Leaf (Split-Path -Parent $mapFile)) -cne 'mapped') {
        throw 'MapPath must identify a mapped/native-code-map.json artifact'
    }
    $mapBytes = [IO.File]::ReadAllBytes($mapFile)
    $map = [Text.Encoding]::UTF8.GetString($mapBytes) | ConvertFrom-Json
    $report.sourceMapSha256 = Get-BytesSha256 $mapBytes
    $report.sourceMapPath = $mapFile
    if ($map.schemaVersion -ne 1 -or $map.pll.bytes -ne $manifestPll[0].bytes -or
        $map.pll.sha256 -cne $manifestPll[0].sha256 -or @($map.functions).Count -ne 2) {
        throw 'Native map is not bound to the extracted AARON.pll or required function set'
    }
    $mapDirectory = Split-Path -Parent $mapFile
    $nativeRoot = Split-Path -Parent $mapDirectory
    $captureManifestPath = Join-Path $nativeRoot 'manifest.json'
    $captureMetadataPath = Join-Path $nativeRoot 'function-object-metadata.txt'
    $captureManifestBytes = [IO.File]::ReadAllBytes($captureManifestPath)
    $report.mapCaptureManifestSha256 = Get-BytesSha256 $captureManifestBytes
    if ($map.captureManifestSha256 -cne $report.mapCaptureManifestSha256) { throw 'Native map capture manifest hash mismatch' }
    $captureManifest = [Text.Encoding]::UTF8.GetString($captureManifestBytes) | ConvertFrom-Json
    if ($captureManifest.schemaVersion -ne 1 -or @($captureManifest.functions).Count -ne 2 -or
        (Get-Sha256 $captureMetadataPath) -cne $captureManifest.metadataSha256) {
        throw 'Native capture manifest or metadata is incomplete'
    }
    $captureOutputRoot = Split-Path -Parent $nativeRoot
    $captureRuntimePath = Join-Path $captureOutputRoot 'runtime\AARON.exe'
    $captureRuntimeAliases = Get-PathAliases $captureRuntimePath
    if ($captureManifest.processId -le 0 -or
        $captureManifest.runtimeExecutable -notin $captureRuntimeAliases -or
        -not (Test-Path -LiteralPath $captureRuntimePath -PathType Leaf) -or
        (Get-Sha256 $captureRuntimePath) -cne $manifestExe[0].sha256) {
        throw 'Native map capture manifest is not bound to the extracted AARON executable'
    }
    $captureFunctions = @($captureManifest.functions)
    $requiredNames = @('DRAW-CFORM', 'FREE-PATH')
    if ((@($map.functions | ForEach-Object name | Sort-Object) -join ',') -cne ($requiredNames -join ',') -or
        (@($captureFunctions | ForEach-Object name | Sort-Object) -join ',') -cne ($requiredNames -join ',')) {
        throw 'Native map and source capture must contain exactly DRAW-CFORM and FREE-PATH'
    }

    $pllPath = Join-Path $repoRoot 'research\extracted\aaron\application\AARON.pll'
    if ((Get-Sha256 $pllPath) -cne $manifestPll[0].sha256) { throw 'Archived PLL differs from its extracted manifest' }
    $pll = [IO.File]::ReadAllBytes($pllPath)
    $mapped = @($map.functions | Where-Object name -ceq 'FREE-PATH')
    $captured = @($captureFunctions | Where-Object name -ceq 'FREE-PATH')
    if ($mapped.Count -ne 1 -or $captured.Count -ne 1) { throw 'FREE-PATH mapping is missing or duplicated' }
    $mapping = $mapped[0]
    $capture = $captured[0]
    if (-not $mapping.uniqueCompleteObjectByteMatch -or
        $mapping.payloadBytes -ne 1330 -or
        $mapping.payloadSha256 -cne '93b018cb03d3d8cec18eaaa4cd813d7c4cdfa32bb02b5f3a5b11a4b51feea787' -or
        $mapping.capture.file -cne $capture.file -or $mapping.capture.sha256 -cne $capture.sha256 -or
        $mapping.capture.bytes -ne $capture.bytes -or
        $mapping.capture.windowBase -cne $capture.windowBase -or
        $mapping.capture.functionObjectHeaderHex -cne $capture.functionObjectHeaderHex) {
        throw 'Mapped FREE-PATH identity does not match the pinned exact payload and source capture'
    }
    if ((Get-Sha256 $captureMetadataPath) -cne $captureManifest.metadataSha256) { throw 'Mapped source metadata hash mismatch' }
    $windowPath = Join-Path $nativeRoot $capture.file
    if ((Get-Sha256 $windowPath) -cne $capture.sha256 -or
        (Get-Item -LiteralPath $windowPath).Length -ne $capture.bytes) { throw 'Captured native window hash/size mismatch' }
    $objectOffset = [int]$mapping.pll.objectOffset
    $payloadOffset = [int]$mapping.pll.payloadOffset
    $payloadBytes = [int]$mapping.payloadBytes
    $objectBytes = [int]$mapping.objectBytes
    if ($objectOffset -lt 0 -or $payloadOffset -ne ($objectOffset + 4) -or
        $payloadBytes -ne 1330 -or $objectBytes -ne ($payloadBytes + 4) -or
        ($objectOffset + $objectBytes) -gt $pll.Length) { throw 'Mapped FREE-PATH PLL object extent is invalid' }
    $mappedPayloadPath = Join-Path $mapDirectory $mapping.payloadFile
    $mappedPayload = [IO.File]::ReadAllBytes($mappedPayloadPath)
    $pllPayload = [byte[]]::new($payloadBytes)
    [Array]::Copy($pll, $payloadOffset, $pllPayload, 0, $payloadBytes)
    $object = [byte[]]::new($objectBytes)
    [Array]::Copy($pll, $objectOffset, $object, 0, $objectBytes)
    $window = [IO.File]::ReadAllBytes($windowPath)
    $windowBase = Convert-HexAddress ([string]$capture.windowBase) 'Mapped FREE-PATH window base'
    $mappedEntry = Convert-HexAddress ([string]$mapping.runtime.entry) 'Mapped FREE-PATH entry'
    $captureEntry = Convert-HexAddress ([string]$capture.entryCandidate) 'Captured FREE-PATH entry'
    $headerOffset = [int]$mapping.runtime.headerOffsetInWindow
    if ($mappedEntry -ne $captureEntry -or $mappedEntry -lt ($windowBase + 4) -or
        $headerOffset -ne ($mappedEntry - $windowBase - 4) -or
        $headerOffset -lt 0 -or ($headerOffset + $objectBytes) -gt $window.Length -or
        [BitConverter]::ToUInt32($window, $headerOffset) -ne (Convert-HexAddress ([string]$mapping.header) 'Mapped FREE-PATH object header')) {
        throw 'Mapped FREE-PATH capture window does not contain the expected complete function object'
    }
    $windowObject = [byte[]]::new($objectBytes)
    [Array]::Copy($window, $headerOffset, $windowObject, 0, $objectBytes)
    if ((Get-BytesSha256 $pllPayload) -cne $mapping.payloadSha256 -or
        (Get-BytesSha256 $object) -cne $mapping.objectSha256 -or
        [Convert]::ToBase64String($windowObject) -cne [Convert]::ToBase64String($object) -or
        [Convert]::ToBase64String($mappedPayload) -cne [Convert]::ToBase64String($pllPayload)) {
        throw 'Mapped FREE-PATH payload differs from the exact archived PLL payload'
    }

    $entryCandidate = [uint64]$ready.Headers['FREE-PATH'].entry
    $mappedHeaderHex = [string]$mapping.capture.functionObjectHeaderHex
    if ((Get-FunctionHeaderEntry $ready.Headers['FREE-PATH'].headerHex 'Current READY FREE-PATH header') -ne $entryCandidate -or
        (Get-FunctionHeaderEntry $mappedHeaderHex 'Mapped FREE-PATH header') -ne $mappedEntry) {
        throw 'Current and mapped FREE-PATH headers do not each contain their source-bound entry pointer at offset 18'
    }
    if ($entryCandidate -eq 0 -or ($entryCandidate + $payloadBytes) -gt 0x100000000) { throw 'Current FREE-PATH live payload range overflows' }
    if ('AaronFreePathCallsitesV1' -as [type]) { throw 'Versioned debugger type already exists in this helper process' }
    $debuggerSourceOffset = if ($debuggerBytes.Length -ge 3 -and $debuggerBytes[0] -eq 0xef -and
        $debuggerBytes[1] -eq 0xbb -and $debuggerBytes[2] -eq 0xbf) { 3 } else { 0 }
    $debuggerSource = [Text.UTF8Encoding]::new($false, $true).GetString($debuggerBytes, $debuggerSourceOffset, $debuggerBytes.Length - $debuggerSourceOffset)
    Add-Type -TypeDefinition $debuggerSource -Language CSharp
    if (-not ('AaronFreePathCallsitesV1' -as [type])) { throw 'Versioned debugger helper failed to load from its hashed source' }
    $live = [AaronFreePathCallsitesV1]::Read($aaronProcessId, [uint32]$entryCandidate, $payloadBytes)
    if ([Convert]::ToBase64String($live) -cne [Convert]::ToBase64String($pllPayload)) {
        throw 'Current live FREE-PATH bytes differ from the exact mapped PLL payload'
    }
    # Only after the candidate entry yields the exact complete mapped payload
    # do we treat it as the live code entry and derive breakpoint addresses.
    $entry = $entryCandidate

    $siteSpecs = @(
        [pscustomobject]@{ name = 'call-before-branch'; offset = 0x39a; bytes = 'ff5727'; semantics = 'CALL dword ptr [EDI+0x27]' },
        [pscustomobject]@{ name = 'conditional-branch'; offset = 0x3ac; bytes = '7f52'; semantics = 'JG +0x400' },
        [pscustomobject]@{ name = 'call-after-branch'; offset = 0x3e4; bytes = 'ff5727'; semantics = 'CALL dword ptr [EDI+0x27]' }
    )
    $instructionSites = @()
    $addresses = [uint32[]]::new(3)
    for ($i = 0; $i -lt $siteSpecs.Count; $i++) {
        $site = $siteSpecs[$i]
        $offset = [int]$site.offset
        if ($offset -lt 0 -or ($offset + ($site.bytes.Length / 2)) -gt $payloadBytes) { throw 'Call-site offset exceeds mapped payload' }
        $actual = [BitConverter]::ToString($pllPayload, $offset, $site.bytes.Length / 2).Replace('-', '').ToLowerInvariant()
        if ($actual -cne $site.bytes) { throw "Mapped instruction bytes differ at FREE-PATH+$('{0:x}' -f $offset)" }
        $addresses[$i] = [uint32]($entry + [uint64]$offset)
        $instructionSites += [ordered]@{
            name = $site.name
            offset = ('0x{0:x}' -f $offset)
            address = ('0x{0:x8}' -f $addresses[$i])
            bytes = $actual
            decodedInstruction = $site.semantics
            bytesMatchMappedPllPayload = $true
            bytesMatchCurrentLivePayload = $true
        }
    }

    $report.mappedFunction = [ordered]@{
        name = 'FREE-PATH'
        liveEntry = ('0x{0:x8}' -f [uint32]$entry)
        mappedCaptureEntry = ('0x{0:x8}' -f [uint32]$mappedEntry)
        payloadBytes = $payloadBytes
        payloadSha256 = $mapping.payloadSha256
        pllObjectOffset = $objectOffset
        pllPayloadOffset = $payloadOffset
        exactPllPayloadMatch = $true
        uniqueCompleteObjectByteMatch = [bool]$mapping.uniqueCompleteObjectByteMatch
    }
    $report.liveFunction = [ordered]@{
        readyHeaderHex = $ready.Headers['FREE-PATH'].headerHex
        mappedHeaderHex = $mappedHeaderHex.ToLowerInvariant()
        entryPointerFieldOffset = 18
        entryPointer = ('0x{0:x8}' -f [uint32]$entry)
        currentLivePayloadSha256 = Get-BytesSha256 $live
        exactCurrentLivePayloadMatch = $true
    }
    $report.instructionSites = @($instructionSites)
    $report.outcome = 'capture-started'
    $nativeResult = [AaronFreePathCallsitesV1]::Capture($aaronProcessId, $addresses, $release, $Seconds)
    $report.capture = $nativeResult
    if (-not $nativeResult.attached -or -not $nativeResult.breakpointsArmed -or -not $nativeResult.captureReleased -or
        -not $nativeResult.debugRegistersRestored -or
        (-not $nativeResult.detached -and -not $nativeResult.debugSessionEndedByTargetExit)) {
        throw 'Native capture did not prove attach, breakpoint arming, READY release, register restoration, and detach/target exit'
    }
    $hitCount = @($nativeResult.chronology).Count
    if ($hitCount -lt 0 -or $hitCount -gt 3 -or
        $nativeResult.targetExitEventObserved -isnot [bool] -or
        $nativeResult.captureWindowExpired -isnot [bool] -or
        ($nativeResult.targetExitEventObserved -and $nativeResult.captureWindowExpired) -or
        ($nativeResult.allThreeSitesHit -ne ($hitCount -eq 3))) {
        throw 'Native capture has inconsistent hit count or loop stop-reason flags'
    }
    if ($hitCount -eq 3) {
        if ($null -ne $nativeResult.captureError) { throw 'All-hit capture must have a null captureError' }
        $report.outcome = 'three-call-sites-hit'
    } else {
        if ($nativeResult.targetExitEventObserved) {
            if (-not $nativeResult.debugSessionEndedByTargetExit) { throw 'Target-exit stop reason lacks an ended debug session' }
            $expectedCaptureError = if ($hitCount -eq 0) {
                'Target exited before a selected FREE-PATH call-site breakpoint was observed'
            } else { 'Target exited before every selected FREE-PATH call-site was observed' }
        } elseif ($nativeResult.captureWindowExpired) {
            $expectedCaptureError = if ($hitCount -eq 0) {
                'No selected FREE-PATH call-site breakpoint observed within the deadline'
            } else { 'Capture window ended before every selected call-site was observed' }
        } else {
            throw 'No-hit/partial capture lacks a bounded loop deadline or target-exit stop reason'
        }
        if ($nativeResult.captureError -isnot [string] -or $nativeResult.captureError -cne $expectedCaptureError) {
            throw 'No-hit/partial captureError is outside the exact bounded outcome whitelist'
        }
        if ($hitCount -gt 0) { $report.outcome = 'partial-call-site-hits' }
        else { $report.outcome = 'no-call-site-hit' }
    }
    if ($null -ne $nativeResult.captureError) { $report.captureError = $nativeResult.captureError }
    [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 16), [Text.UTF8Encoding]::new($false))
    $report | ConvertTo-Json -Depth 16
} catch {
    $report.failure = $_.Exception.Message
    if ($null -ne $nativeResult) { $report.capture = $nativeResult }
    if ($report.outcome -eq 'validation-failed') { $report.outcome = 'rejected' }
    if (-not (Test-Path -LiteralPath $reportPath)) {
        try { [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 16), [Text.UTF8Encoding]::new($false)) }
        catch { Write-Warning "Could not preserve the partial call-site report: $($_.Exception.Message)" }
    }
    throw
} finally {
    $stillOwned = if ($null -ne $aaronProcessId) {
        Get-Process -Id $aaronProcessId -ErrorAction SilentlyContinue | Where-Object { $_.Path -in (Get-PathAliases $expectedRuntime) }
    } else { @() }
    if ($ownedPauseRelease -and $stillOwned -and -not (Test-Path -LiteralPath $release)) {
        [IO.File]::WriteAllText($release, 'FREE-PATH call-site helper finished or failed')
    }
}
