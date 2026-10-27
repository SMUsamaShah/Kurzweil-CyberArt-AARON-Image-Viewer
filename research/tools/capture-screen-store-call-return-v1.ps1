[CmdletBinding(DefaultParameterSetName = 'Capture')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [string]$OracleOutputRoot,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [ValidateRange(1, 2147483647)] [uint32]$ProcessId,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [string]$ExecutablePath,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [ValidatePattern('^0x[0-9a-fA-F]{1,8}$')] [string]$LiveEntry,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [string]$PayloadPath,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [ValidatePattern('^[0-9a-fA-F]{64}$')] [string]$PayloadSha256,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [string]$MapPath,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [string]$ProbeSourcePath,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [ValidatePattern('^[0-9]{15,20}$')] [string]$ExpectedProcessCreationFileTimeUtc,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [ValidatePattern('^READY .+$')] [string]$ReadyMarker,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [string]$ReleaseMarkerPath,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [ValidatePattern('^0x[0-9a-fA-F]{1,8}$')] [string]$CallSiteOffset,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [string]$CallBytes,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [string]$ContinuationBytes,
    [Parameter(Mandatory = $true, ParameterSetName = 'Capture')] [string]$OutputPath,
    [Parameter(ParameterSetName = 'Capture')] [ValidateRange(10, 600)] [int]$Seconds = 180,
    [Parameter(Mandatory = $true, ParameterSetName = 'Preflight')] [switch]$PowerShellPreflightOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$utilityModuleManifest = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
try {
    Import-Module -Name $utilityModuleManifest -Force -ErrorAction Stop -WarningAction SilentlyContinue
    $null = Get-Command -Name Get-FileHash -ErrorAction Stop
} catch {
    throw "Unable to load the PowerShell utility module required for source hashing: $($_.Exception.Message)"
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$helperPath = Join-Path $repoRoot 'research\oracle\AaronScreenStoreCallReturnBreakpointV1.cs'
$helperHashBefore = (Get-FileHash -LiteralPath $helperPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($PowerShellPreflightOnly) {
    $typeName = 'AaronScreenStoreCallReturnBreakpointV1'
    if ($typeName -as [type]) { throw 'The helper type is already loaded; preflight requires a fresh child PowerShell process.' }
    Add-Type -Path $helperPath -ErrorAction Stop
    if (-not ($typeName -as [type]) -or
        (Get-FileHash -LiteralPath $helperPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $helperHashBefore) {
        throw 'The helper did not compile with a stable source hash in the no-profile PowerShell child.'
    }
    [pscustomobject]@{
        status = 'ok'
        preflightOnly = $true
        powershellVersion = $PSVersionTable.PSVersion.ToString()
        is64BitProcess = [Environment]::Is64BitProcess
        getFileHashCommand = (Get-Command -Name Get-FileHash -ErrorAction Stop).Name
        helperCompiled = $true
        helperSha256 = $helperHashBefore
        utilityModuleManifest = $utilityModuleManifest
    } | ConvertTo-Json -Compress
    return
}

$runnerPath = Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1'
$root = (Resolve-Path -LiteralPath $OracleOutputRoot).Path
$expectedRuntime = [IO.Path]::GetFullPath((Join-Path $root 'runtime\AARON.exe'))
$requestPath = Join-Path $root 'pre-scene-probe-request.json'
$captureManifestPath = Join-Path $root 'native-code\manifest.json'
$metadataPath = Join-Path $root 'native-code\function-object-metadata.txt'
$expectedMap = [IO.Path]::GetFullPath((Join-Path $root 'native-code\mapped\native-code-map.json'))
$expectedPll = Join-Path $root 'runtime\AARON.pll'
$stagedProbePath = 'C:\temp\aaron-pre-scene-probe.cl'
$releaseFullPath = [IO.Path]::GetFullPath($ReleaseMarkerPath)
$outputFullPath = [IO.Path]::GetFullPath($OutputPath)
$callOffsetValue = [Convert]::ToUInt32($CallSiteOffset.Substring(2), 16)
$liveEntryValue = [Convert]::ToUInt32($LiveEntry.Substring(2), 16)
$payloadHashValue = $PayloadSha256.ToLowerInvariant()
$callBytesValue = ($CallBytes -replace '[\s-]', '').ToLowerInvariant()
$continuationBytesValue = ($ContinuationBytes -replace '[\s-]', '').ToLowerInvariant()
$creationFileTimeValue = [UInt64]::Parse($ExpectedProcessCreationFileTimeUtc, [Globalization.CultureInfo]::InvariantCulture)

if ($callOffsetValue -ne 0x2A6 -or $callBytesValue -cne 'ffd7' -or $continuationBytesValue -cne '8945bc') {
    throw 'This helper is pinned to callSiteOffset=0x2A6, CALL bytes FF D7, and continuation bytes 89 45 BC; its branch target is fixed at +0x2b7.'
}
if ([IntPtr]::Size -ne 8) { throw 'Run this launcher from a fresh 64-bit PowerShell process for WOW64 debugging.' }
if (-not (Test-Path -LiteralPath $expectedRuntime -PathType Leaf) -or
    -not (Test-Path -LiteralPath $expectedPll -PathType Leaf) -or
    -not (Test-Path -LiteralPath $helperPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $runnerPath -PathType Leaf)) {
    throw 'The runner-owned runtime, PLL, runner, or source helper is missing.'
}
if (-not (Test-Path -LiteralPath $requestPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $captureManifestPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $metadataPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $expectedMap -PathType Leaf)) {
    throw 'The runner request, captured metadata, native manifest, or PLL map is missing.'
}
if (-not [string]::Equals([IO.Path]::GetFullPath($MapPath), $expectedMap, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'MapPath must be the native-code mapping under this run root.'
}
if (-not [string]::Equals($releaseFullPath, 'C:\temp\aaron-native-code-release.txt', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'ReleaseMarkerPath must be the runner-reserved C:\temp\aaron-native-code-release.txt.'
}
if (Test-Path -LiteralPath $releaseFullPath) {
    throw 'The READY release marker already exists; it was preserved.'
}
$rootPrefix = $root.TrimEnd('\') + '\'
$outputParent = Split-Path -Parent $outputFullPath
if (-not $outputFullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath $outputParent -PathType Container)) {
    throw 'OutputPath must be a fresh file beneath this run root with an existing parent directory.'
}
if (Test-Path -LiteralPath $outputFullPath) {
    throw "OutputPath already exists; it was preserved: $outputFullPath"
}

$report = [ordered]@{
    schemaVersion = 1
    target = 'SCREEN-AND-STORE'
    accepted = $false
    capturedAt = [DateTimeOffset]::UtcNow.ToString('o')
    runId = Split-Path -Leaf $root
    processId = $ProcessId
    inputs = [ordered]@{
        executablePath = $ExecutablePath
        expectedProcessCreationFileTimeUtc = $creationFileTimeValue.ToString([Globalization.CultureInfo]::InvariantCulture)
        liveEntry = $LiveEntry.ToLowerInvariant()
        payloadPath = $PayloadPath
        payloadSha256 = $payloadHashValue
        payloadBytes = 1224
        callSiteOffset = '0x2a6'
        callBytesHex = 'ffd7'
        continuationOffset = '0x2a8'
        continuationBytesHex = '8945bc'
        branchOffset = '0x2b7'
        branchBytesHex = '7503'
        fallthroughOffset = '0x2b9'
        fallthroughBytesHex = 'ff578f'
        takenOffset = '0x2bc'
        releaseMarkerPath = $releaseFullPath
        readyMarker = $ReadyMarker
        outputPath = $outputFullPath
        seconds = $Seconds
    }
    sources = $null
    preflight = $null
    debuggerResult = $null
    setupError = $null
    limitations = @(
        'The call-return event is before 89 45 BC; capture then resumes through that store to reach the JNZ successor, without reading back or interpreting the store result.',
        'The branch direction is observed only for this captured call; ZF predicts the edge and the same-thread successor hit confirms it.',
        'The fall-through successor is before FF 57 8F executes. Its indirect pointer slot may be sampled, but that alone does not prove the call target or execution.',
        'The EDI value is recorded as a raw CPU target; no Lisp function name, ABI, or direct caller is inferred.',
        'The return ESP is recorded without assuming caller or callee stack cleanup.',
        'The result applies to this process and this bounded capture only.'
    )
}

function Write-FreshJson([string]$Path, [object]$Document) {
    $json = ConvertTo-Json -InputObject $Document -Depth 36
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json + [Environment]::NewLine)
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
}

try {
    if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $PayloadPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $ProbeSourcePath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $stagedProbePath -PathType Leaf)) {
        throw 'The supplied executable, mapped payload, probe source, or runner-staged probe is missing.'
    }
    $executableFullPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ExecutablePath).Path)
    $payloadFullPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $PayloadPath).Path)
    $probeSourceFullPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ProbeSourcePath).Path)
    if (-not [string]::Equals($executableFullPath, $expectedRuntime, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'ExecutablePath must be the exact AARON.exe in this runner-owned output root.'
    }
    $mapFullPath = (Resolve-Path -LiteralPath $expectedMap).Path
    $manifest = Get-Content -LiteralPath $captureManifestPath -Raw | ConvertFrom-Json
    $map = Get-Content -LiteralPath $mapFullPath -Raw | ConvertFrom-Json
    $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
    $requestHash = (Get-FileHash -LiteralPath $requestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifestHash = (Get-FileHash -LiteralPath $captureManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $metadataHash = (Get-FileHash -LiteralPath $metadataPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $mapHash = (Get-FileHash -LiteralPath $mapFullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $pllHash = (Get-FileHash -LiteralPath $expectedPll -Algorithm SHA256).Hash.ToLowerInvariant()
    $runtimeHash = (Get-FileHash -LiteralPath $expectedRuntime -Algorithm SHA256).Hash.ToLowerInvariant()
    $processExecutableHash = (Get-FileHash -LiteralPath $executableFullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $payloadHashObserved = (Get-FileHash -LiteralPath $payloadFullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $payloadBytesObserved = (Get-Item -LiteralPath $payloadFullPath).Length
    $probeSourceHash = (Get-FileHash -LiteralPath $probeSourceFullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $stagedProbeHash = (Get-FileHash -LiteralPath $stagedProbePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $metadataText = [IO.File]::ReadAllText($metadataPath)
    $readyLines = @($metadataText -split '\r?\n' | Where-Object { $_ -ceq $ReadyMarker })
    $headerMatches = [regex]::Matches($metadataText, '(?m)^HEADER name="SCREEN-AND-STORE" bytes=([0-9a-fA-F]{128})\r?$')

    $manifestFunctions = @($manifest.functions | Where-Object { $_.name -ceq 'SCREEN-AND-STORE' })
    $mappedFunctions = @($map.functions | Where-Object { $_.name -ceq 'SCREEN-AND-STORE' })
    if ($manifest.schemaVersion -ne 1 -or $manifest.processId -ne $ProcessId -or
        -not [string]::Equals([IO.Path]::GetFullPath([string]$manifest.runtimeExecutable), $expectedRuntime, [StringComparison]::OrdinalIgnoreCase) -or
        $manifestFunctions.Count -ne 1 -or $mappedFunctions.Count -ne 1) {
        throw 'Capture manifest does not uniquely bind this PID, runtime path, and SCREEN-AND-STORE function.'
    }
    if ($map.schemaVersion -ne 1 -or
        $map.captureManifestSha256 -cne $manifestHash -or
        $map.pll.sha256 -cne $pllHash) {
        throw 'PLL map, captured runtime PLL, or capture-manifest hash binding does not match.'
    }
    $mapped = $mappedFunctions[0]
    $manifestFunction = $manifestFunctions[0]
    if ($mapped.uniqueCompleteObjectByteMatch -ne $true -or
        [int]$mapped.payloadBytes -ne 1224 -or
        [int]($mapped.pll.rawEnd - $mapped.pll.payloadOffset) -ne 1224 -or
        [string]$mapped.payloadSha256 -cne $payloadHashValue -or
        [string]$mapped.capture.file -cne [string]$manifestFunction.file -or
        [string]$mapped.capture.sha256 -cne [string]$manifestFunction.sha256 -or
        [int]$mapped.capture.bytes -ne [int]$manifestFunction.bytes -or
        [string]$manifest.metadataSha256 -cne $metadataHash -or
        $manifestFunction.name -cne 'SCREEN-AND-STORE' -or
        [int]$manifestFunction.bytes -le 0) {
        throw 'SCREEN-AND-STORE is not uniquely mapped as one complete payload in this run PLL.'
    }
    $mappedPayloadPath = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $mapFullPath) ([string]$mapped.payloadFile)))
    if (-not [string]::Equals($payloadFullPath, $mappedPayloadPath, [StringComparison]::OrdinalIgnoreCase) -or
        [string]$manifestFunction.file -notmatch '^[a-z0-9-]+\.native-window\.bin$' -or
        [string]$mapped.payloadFile -cnotmatch '^screen-and-store\.native-payload\.bin$' -or
        $payloadBytesObserved -ne 1224 -or $payloadHashObserved -cne $payloadHashValue -or
        [string]$mapped.runtime.entry -cne ('0x{0:x}' -f $liveEntryValue) -or
        [string]$manifestFunction.entryCandidate -cne ('0x{0:x}' -f $liveEntryValue)) {
        throw 'Payload path/hash/length or current live entry differs from the unique run map.'
    }
    if ($readyLines.Count -ne 1 -or $headerMatches.Count -ne 1) {
        throw 'Captured metadata must contain one SCREEN-AND-STORE header and exactly one requested READY line.'
    }
    $metadataLines = @($metadataText -split '\r?\n' | Where-Object { $_ -ne '' })
    if ($metadataLines.Count -eq 0 -or $metadataLines[$metadataLines.Count - 1] -cne $ReadyMarker -or
        $metadataText -match '(?m)^END [A-Z0-9-]+$') {
        throw 'Metadata is not the exact READY pause prefix or already contains a terminal END marker.'
    }
    $headerBytes = [byte[]]@(0..63 | ForEach-Object {
        [Convert]::ToByte($headerMatches[0].Groups[1].Value.Substring($_ * 2, 2), 16)
    })
    $headerEntry = [BitConverter]::ToUInt32($headerBytes, 18)
    if ($headerEntry -ne $liveEntryValue) {
        throw 'The captured SCREEN-AND-STORE metadata header differs from LiveEntry.'
    }

    $metadataName = [string]$request.requiredProbeOutputName
    $probeNames = @($request.probeOutputNames)
    if ([string]::IsNullOrWhiteSpace($metadataName) -or
        [IO.Path]::GetFileName($metadataName) -cne $metadataName -or
        $metadataName -notin $probeNames) {
        throw 'Runner request does not declare one required metadata output.'
    }
    $stagedMetadataPath = Join-Path 'C:\temp' $metadataName
    if (-not (Test-Path -LiteralPath $stagedMetadataPath -PathType Leaf)) {
        throw 'The runner-staged metadata output is missing.'
    }
    $stagedMetadataHash = (Get-FileHash -LiteralPath $stagedMetadataPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($stagedMetadataHash -cne $metadataHash) {
        throw 'Archived native metadata differs from the exact staged READY pause prefix.'
    }
    $stagedMetadataText = [IO.File]::ReadAllText($stagedMetadataPath)
    $stagedMetadataLines = @($stagedMetadataText -split '\r?\n' | Where-Object { $_ -ne '' })
    if ($stagedMetadataText -match '(?m)^END [A-Z0-9-]+$' -or
        $stagedMetadataLines.Count -eq 0 -or $stagedMetadataLines[$stagedMetadataLines.Count - 1] -cne $ReadyMarker) {
        throw 'Staged metadata is no longer at the requested READY pause or already contains a terminal END marker.'
    }
    if ($request.schemaVersion -ne 1 -or
        [string]$request.runId -cne (Split-Path -Leaf $root) -or
        [int]$request.pauseSeconds -le 0 -or
        -not [string]::Equals([IO.Path]::GetFullPath([string]$request.runtimeExecutable), $expectedRuntime, [StringComparison]::OrdinalIgnoreCase) -or
        -not [string]::Equals([IO.Path]::GetFullPath([string]$request.releaseFile), $releaseFullPath, [StringComparison]::OrdinalIgnoreCase) -or
        [string]$request.probeSha256 -cne $probeSourceHash -or
        $stagedProbeHash -cne $probeSourceHash -or
        [string]$request.runnerSha256 -cne (Get-FileHash -LiteralPath $runnerPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
        throw 'Runner request is not bound to the current probe source, runner, output root, runtime, and release marker.'
    }
    $allAaron = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    $observedCreationFileTime = [UInt64]$process.StartTime.ToUniversalTime().ToFileTimeUtc()
    if ($observedCreationFileTime -ne $creationFileTimeValue -or
        $allAaron.Count -ne 1 -or $allAaron[0].Id -ne $ProcessId -or
        -not [string]::Equals([IO.Path]::GetFullPath($process.Path), $executableFullPath, [StringComparison]::OrdinalIgnoreCase) -or
        $processExecutableHash -cne $runtimeHash) {
        throw 'AARON PID, creation identity, executable path, or executable hash differs from this run.'
    }
    if ($headerEntry -eq 0 -or $liveEntryValue -eq 0) { throw 'Live SCREEN-AND-STORE entry is invalid.' }

    $report.sources = [ordered]@{
        launcher = [ordered]@{ path = 'research/tools/capture-screen-store-call-return-v1.ps1'; sha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() }
        helper = [ordered]@{ path = 'research/oracle/AaronScreenStoreCallReturnBreakpointV1.cs'; sha256 = (Get-FileHash -LiteralPath $helperPath -Algorithm SHA256).Hash.ToLowerInvariant() }
        requiredProbeSource = [ordered]@{ path = $probeSourceFullPath; sha256 = $probeSourceHash }
        request = [ordered]@{ path = 'pre-scene-probe-request.json'; sha256 = $requestHash }
        metadata = [ordered]@{ path = 'native-code/function-object-metadata.txt'; sha256 = $metadataHash; stagedSha256 = $stagedMetadataHash }
        captureManifest = [ordered]@{ path = 'native-code/manifest.json'; sha256 = $manifestHash }
        nativeMap = [ordered]@{ path = 'native-code/mapped/native-code-map.json'; sha256 = $mapHash }
        requiredProbeRunnerSha256 = [string]$request.runnerSha256
        runtimePllSha256 = $pllHash
        runtimeExecutableSha256 = $runtimeHash
        mappedPayloadSha256 = $payloadHashObserved
    }
    $report.preflight = [ordered]@{
        runnerOwnedRequest = $true
        probeAndRunnerHashesMatch = $true
        readyMarkerFoundAsFinalMetadataLine = $true
        terminalEndAbsent = $true
        releaseMarkerAbsent = $true
        samePidCaptureManifest = $true
        processCreationFileTimeMatchesInput = $true
        uniqueCompletePllPayloadMatch = $true
        payloadBytes = $payloadBytesObserved
        liveEntryMatchesMetadataAndMap = $true
        processPathAndHashMatch = $true
    }

    $typeName = 'AaronScreenStoreCallReturnBreakpointV1'
    if ($typeName -as [type]) { throw 'The helper type is already loaded; run from a fresh 64-bit PowerShell process.' }
    $helperHashBefore = (Get-FileHash -LiteralPath $helperPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Add-Type -Path $helperPath -ErrorAction Stop
    $helperType = $typeName -as [type]
    if ($null -eq $helperType -or
        (Get-FileHash -LiteralPath $helperPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $helperHashBefore) {
        throw 'Loaded helper identity or source hash changed during Add-Type.'
    }
    $raw = [AaronScreenStoreCallReturnBreakpointV1]::Capture(
        $ProcessId, $expectedRuntime, $executableFullPath, $requestPath, $requestHash,
        [string]$request.runId, $creationFileTimeValue, $liveEntryValue, $payloadFullPath,
        $payloadHashValue, $callOffsetValue, $callBytesValue, $continuationBytesValue,
        $releaseFullPath, $Seconds
    )
    $report.debuggerResult = $raw
    $helperTypeAfter = $typeName -as [type]
    if ($null -eq $helperTypeAfter -or
        $helperTypeAfter.Assembly.FullName -cne $helperType.Assembly.FullName -or
        (Get-FileHash -LiteralPath $helperPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $helperHashBefore) {
        throw 'Loaded helper assembly or helper source hash changed during capture.'
    }
    $report.accepted = ($raw.accepted -eq $true)
} catch {
    $report.setupError = $_.Exception.ToString()
}

Write-FreshJson -Path $outputFullPath -Document $report
if (-not $report.accepted) {
    throw "SCREEN-AND-STORE no-TF capture was not accepted; diagnostic saved to $outputFullPath"
}
Write-Output $outputFullPath
