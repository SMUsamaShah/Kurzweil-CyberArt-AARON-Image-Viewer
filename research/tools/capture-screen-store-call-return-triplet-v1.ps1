# Fresh uninstrumented / passive-observer / uninstrumented screen-unit triplet.
# The no-TF helper owns the normal READY release. The coordinator writes a
# release marker only on failure, after revalidating the exact live run.
[CmdletBinding()]
param(
    [string]$ExtractedRoot = 'research\extracted\aaron',
    [string]$BaseRoot = 'C:\AaronOracleRuns',
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,24}$')]
    [string]$RunPrefix = 'sstore-v1',
    [ValidateRange(10, 600)] [int]$RunSeconds = 600,
    [ValidateRange(90, 300)] [int]$PauseSeconds = 270,
    [ValidateRange(10, 180)] [int]$CaptureSeconds = 180,
    [ValidateRange(10, 120)] [int]$ReadyTimeoutSeconds = 60,
    [switch]$PreflightOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PauseSeconds -ge $RunSeconds) { throw 'PauseSeconds must be shorter than RunSeconds.' }
if ($PauseSeconds -lt ($CaptureSeconds + 45)) {
    throw 'PauseSeconds must leave at least 45 seconds beyond CaptureSeconds for native capture setup.'
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$mode = 'screen-unit-seed-1234'
$runnerPath = Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1'
$preparePath = Join-Path $repoRoot 'research\tools\prepare-local-aaron-oracle-run.ps1'
$metadataProbePath = Join-Path $repoRoot 'research\introspection\screen-store-call-return-metadata-v1.cl'
$nativeReaderPath = Join-Path $repoRoot 'research\tools\capture-aaron-native-code.ps1'
$noTfLauncherPath = Join-Path $repoRoot 'research\tools\capture-screen-store-call-return-v1.ps1'
$noTfHelperPath = Join-Path $repoRoot 'research\oracle\AaronScreenStoreCallReturnBreakpointV1.cs'
$mapperPath = Join-Path $repoRoot 'research\tools\map-native-code-to-pll.mjs'
$pllIndexPath = Join-Path $repoRoot 'research\tools\index-allegro-image.mjs'
$tripletVerifierPath = Join-Path $repoRoot 'research\tools\verify-local-aaron-triplet.mjs'
$sceneParserPath = Join-Path $repoRoot 'research\tools\parse-scene-state-report.mjs'
$delimiterCheckerPath = Join-Path $repoRoot 'research\tools\check-lisp-delimiters.mjs'
$scopeCheckerPath = Join-Path $repoRoot 'research\tools\check-lisp-probe-scope.mjs'
$registryPatchPath = Join-Path $repoRoot 'research\tools\patch-registry-running.ps1'
$licensePatchPath = Join-Path $repoRoot 'research\tools\patch-license-user-registry.ps1'
$extractedPath = if ([IO.Path]::IsPathRooted($ExtractedRoot)) {
    (Resolve-Path -LiteralPath $ExtractedRoot).Path
} else { (Resolve-Path -LiteralPath (Join-Path $repoRoot $ExtractedRoot)).Path }
$applicationPath = Join-Path $extractedPath 'application'
$manifestPath = Join-Path $extractedPath 'manifest.json'
$metadataName = 'aaron-screen-store-call-return-metadata-v1.txt'
$readyMarker = 'READY screen-store-call-return-metadata-v1'
$endMarker = 'END screen-store-call-return-metadata-v1'
$releasePath = 'C:\temp\aaron-native-code-release.txt'
$metadataPath = Join-Path 'C:\temp' $metadataName
$probeOutputNamesJson = ConvertTo-Json -InputObject @($metadataName) -Compress
$externalRunsPath = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'
$runLogParent = Join-Path $repoRoot 'research\extracted\local-oracle\screen-store-call-return-triplet-v1-logs'
$baseFullPath = [IO.Path]::GetFullPath($BaseRoot)
$logStamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$nonce = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$tripletId = "$RunPrefix-$logStamp-$nonce"
$logRoot = Join-Path $runLogParent $tripletId
$powerShellExe = if ([IntPtr]::Size -eq 4 -and [Environment]::Is64BitOperatingSystem) {
    Join-Path $env:SystemRoot 'Sysnative\WindowsPowerShell\v1.0\powershell.exe'
} else { Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' }

if ([IntPtr]::Size -ne 8) { throw 'Run this coordinator from 64-bit PowerShell.' }
if (-not (Test-Path -LiteralPath $powerShellExe -PathType Leaf)) {
    throw '64-bit Windows PowerShell is unavailable for the runner and capture helpers.'
}

$stagedSourceFiles = [ordered]@{
    'planning-call-trace.cl' = Join-Path $repoRoot 'research\introspection\planning-call-trace.cl'
    'planning-random-seed-common.cl' = Join-Path $repoRoot 'research\oracle\planning-random-seed-common.cl'
    'scene-state-snapshot.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot.cl'
    'scene-state-snapshot-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-seeded-1234.cl'
    'scene-state-snapshot-writer-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-seeded-1234.cl'
    'scene-state-snapshot-writer-stream-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-stream-seeded-1234.cl'
    'scene-state-snapshot-writer-full-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-full-seeded-1234.cl'
    'scene-state-snapshot-screen-unit-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-screen-unit-seeded-1234.cl'
    'aaron-natural-screen-unit-capture.cl' = Join-Path $repoRoot 'research\introspection\natural-screen-unit-capture.cl'
    'aaron-natural-screen-color-capture.cl' = Join-Path $repoRoot 'research\introspection\natural-screen-color-capture.cl'
}
$trackedSources = [ordered]@{
    coordinator = $PSCommandPath
    runner = $runnerPath
    runRootPreparer = $preparePath
    passiveProbe = $metadataProbePath
    nativeCodeReader = $nativeReaderPath
    noTfLauncher = $noTfLauncherPath
    noTfDebuggerHelper = $noTfHelperPath
    pllMapper = $mapperPath
    pllIndexer = $pllIndexPath
    tripletVerifier = $tripletVerifierPath
    sceneParser = $sceneParserPath
    delimiterChecker = $delimiterCheckerPath
    scopeChecker = $scopeCheckerPath
    registryPatch = $registryPatchPath
    licensePatch = $licensePatchPath
    extractedManifest = $manifestPath
    extractedAaronExe = (Join-Path $applicationPath 'AARON.exe')
    extractedAaronPll = (Join-Path $applicationPath 'AARON.pll')
}
foreach ($stagedName in $stagedSourceFiles.Keys) {
    $trackedSources["staged:$stagedName"] = $stagedSourceFiles[$stagedName]
}

function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
}

function Get-RepoRelativePath([string]$Path) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    $prefix = $repoRoot.TrimEnd('\') + '\'
    if (-not $fullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Source path is outside the repository: $fullPath"
    }
    return $fullPath.Substring($prefix.Length).Replace('\', '/')
}

function Get-SourceSnapshot {
    $snapshot = [ordered]@{}
    foreach ($name in $trackedSources.Keys) {
        $path = [string]$trackedSources[$name]
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required source is missing: $path" }
        $snapshot[$name] = [ordered]@{
            path = Get-RepoRelativePath $path
            sha256 = Get-Sha256 $path
        }
    }
    return $snapshot
}

function Assert-SourceSnapshot([object]$Snapshot) {
    foreach ($name in $trackedSources.Keys) {
        $path = [string]$trackedSources[$name]
        $current = Get-Sha256 $path
        if ($current -cne [string]$Snapshot[$name].sha256) {
            throw "Source changed during the triplet: $($Snapshot[$name].path)"
        }
    }
}

function Assert-ExtractedRuntime([object]$Snapshot) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    foreach ($name in @('AARON.exe', 'AARON.pll')) {
        $entry = @($manifest.files | Where-Object { $_.installedName -ceq $name })
        if ($entry.Count -ne 1) { throw "Extracted manifest does not uniquely identify $name." }
        $path = Join-Path $applicationPath $name
        if ((Get-Item -LiteralPath $path).Length -ne [int64]$entry[0].bytes -or
            (Get-Sha256 $path) -cne [string]$entry[0].sha256) {
            throw "Extracted runtime differs from its manifest: $path"
        }
    }
    if ((Get-Sha256 $manifestPath) -cne [string]$Snapshot.extractedManifest.sha256) {
        throw 'Extracted runtime manifest changed during preflight.'
    }
}

function Assert-NoAaronProcess {
    $active = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
    if ($active.Count -gt 0) {
        throw ('An AARON process is already active (PID ' + (($active | ForEach-Object Id) -join ', ') + ').')
    }
}

function Resolve-DirectoryTarget([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    for ($depth = 0; $depth -lt 8; $depth++) {
        $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
        if ($item.LinkType -notin @('SymbolicLink', 'Junction') -or -not $item.Target) {
            if (-not $item.PSIsContainer) { throw "Expected a directory while resolving $Path." }
            return [IO.Path]::GetFullPath($item.FullName)
        }
        $target = [string]@($item.Target)[0]
        $current = if ([IO.Path]::IsPathRooted($target)) {
            [IO.Path]::GetFullPath($target)
        } else { [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $current) $target)) }
    }
    throw "Too many nested directory links while resolving $Path."
}

function Test-PathsOverlap([string]$Left, [string]$Right) {
    $leftFull = [IO.Path]::GetFullPath($Left).TrimEnd('\')
    $rightFull = [IO.Path]::GetFullPath($Right).TrimEnd('\')
    return [string]::Equals($leftFull, $rightFull, [StringComparison]::OrdinalIgnoreCase) -or
        $leftFull.StartsWith($rightFull + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $rightFull.StartsWith($leftFull + '\', [StringComparison]::OrdinalIgnoreCase)
}

function ConvertTo-NativeArgument([string]$Value) {
    $builder = [Text.StringBuilder]::new()
    $slashes = 0
    [void]$builder.Append('"')
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') { $slashes++; continue }
        if ($character -eq '"') {
            if ($slashes -gt 0) { [void]$builder.Append(('\' * (2 * $slashes))) }
            [void]$builder.Append('\"')
            $slashes = 0
            continue
        }
        if ($slashes -gt 0) { [void]$builder.Append(('\' * $slashes)); $slashes = 0 }
        [void]$builder.Append($character)
    }
    if ($slashes -gt 0) { [void]$builder.Append(('\' * (2 * $slashes))) }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Invoke-CapturedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [string]$StdoutPath,
        [string]$StderrPath,
        [Parameter(Mandatory = $true)][string]$Label
    )
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $FilePath
    $info.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' ')
    $info.WorkingDirectory = $WorkingDirectory
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    if (-not $process.Start()) { throw "$Label did not start." }
    $script:ActiveChildProcess = $process
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        throw "$Label exceeded its $TimeoutSeconds-second bound (child PID $($process.Id)); preserve all roots."
    }
    $process.WaitForExit()
    $stdout = $stdoutTask.Result
    $stderr = $stderrTask.Result
    if ($StdoutPath) { [IO.File]::WriteAllText($StdoutPath, $stdout, [Text.UTF8Encoding]::new($false)) }
    if ($StderrPath) { [IO.File]::WriteAllText($StderrPath, $stderr, [Text.UTF8Encoding]::new($false)) }
    $result = [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr; ProcessId = $process.Id }
    $process.Dispose()
    $script:ActiveChildProcess = $null
    return $result
}

function Assert-ChildSuccess($Result, [string]$Label) {
    if ($Result.ExitCode -ne 0) {
        throw "$Label exited $($Result.ExitCode): $($Result.Stderr) $($Result.Stdout)"
    }
}

function Assert-ReservedNamesClear {
    $reserved = @(
        'image', 'image-id', 'rseed', 'aaron-scene-state-snapshot.txt',
        'aaron-planning-call-trace.txt', 'aaron-writer-full.txt',
        'aaron-select-brush-matrix.txt', 'aaron-free-path-natural.txt',
        'aaron-free-path-ran.txt', 'aaron-screen-units.txt',
        'aaron-screen-color-data.txt', 'aaron-random-samples.txt',
        'aaron-random-seed-loaded.txt', 'planning-call-trace.cl',
        'planning-random-seed-common.cl', 'scene-state-snapshot.cl',
        'scene-state-snapshot-seeded-1234.cl',
        'scene-state-snapshot-writer-seeded-1234.cl',
        'scene-state-snapshot-writer-stream-seeded-1234.cl',
        'scene-state-snapshot-writer-sequence-seeded-1234.cl',
        'scene-state-snapshot-writer-windows-seeded-1234.cl',
        'scene-state-snapshot-writer-full-seeded-1234.cl',
        'scene-state-snapshot-writer-full-seeded-5678.cl',
        'scene-state-snapshot-writer-full-seeded-456069.cl',
        'scene-state-snapshot-select-brush-matrix-seeded-1234.cl',
        'scene-state-snapshot-natural-free-path-seeded-1234.cl',
        'scene-state-snapshot-natural-free-path-seeded-5678.cl',
        'aaron-natural-free-path-capture.cl',
        'scene-state-snapshot-natural-free-path-ran-seeded-1234.cl',
        'aaron-natural-free-path-ran-capture.cl',
        'scene-state-snapshot-screen-unit-seeded-1234.cl',
        'scene-state-snapshot-screen-unit-seeded-5678.cl',
        'aaron-natural-screen-unit-capture.cl', 'aaron-natural-screen-color-capture.cl',
        'scene-state-snapshot-transition-seeded-1234.cl',
        'scene-state-snapshot-plan-seeded-1234.cl',
        'aaron-pre-scene-probe.cl', 'aaron-probe-loader.cl',
        $metadataName, 'aaron-native-code-release.txt'
    ) + @(0..15 | ForEach-Object { "aa$_" })
    $collisions = @($reserved | Select-Object -Unique | Where-Object {
        Test-Path -LiteralPath (Join-Path 'C:\temp' $_)
    })
    if ($collisions.Count -gt 0) {
        throw ('Reserved C:\temp names already exist and were preserved: ' + ($collisions -join ', '))
    }
}

function Test-TempWriteReadDelete([string]$NonceValue) {
    $path = Join-Path 'C:\temp' (".screen-store-call-return-preflight-$NonceValue.tmp")
    if (Test-Path -LiteralPath $path) { throw "Unique C:\temp probe path already exists: $path" }
    $expected = [Text.Encoding]::UTF8.GetBytes("screen-store-call-return preflight $NonceValue")
    try {
        $stream = [IO.FileStream]::new($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        try {
            $stream.Write($expected, 0, $expected.Length)
            $stream.Flush($true)
            $stream.Position = 0
            $actual = New-Object byte[] $expected.Length
            $count = $stream.Read($actual, 0, $actual.Length)
            if ($count -ne $expected.Length -or
                [Convert]::ToBase64String($actual) -cne [Convert]::ToBase64String($expected)) {
                throw 'C:\temp unique write/read probe did not round-trip exact bytes.'
            }
        } finally { $stream.Dispose() }
    } finally {
        if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force }
    }
    if (Test-Path -LiteralPath $path) { throw 'C:\temp write-probe cleanup failed.' }
}

function Invoke-RunnerPowerShellPreflight {
    $preflightId = "$tripletId-preflight"
    $placeholder = Join-Path $baseFullPath "$preflightId-uncreated"
    if (Test-Path -LiteralPath $placeholder) { throw "Runner preflight placeholder already exists: $placeholder" }
    $arguments = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $runnerPath, '-ExtractedRoot', $extractedPath, '-OutputRoot', $placeholder,
        '-RunId', $preflightId, '-Mode', $mode, '-ProbeOutputNamesJson', $probeOutputNamesJson,
        '-PowerShellPreflightOnly')
    $result = Invoke-CapturedProcess -FilePath $powerShellExe -Arguments $arguments `
        -WorkingDirectory $repoRoot -TimeoutSeconds 30 -Label 'Runner PowerShell preflight'
    Assert-ChildSuccess $result 'Runner PowerShell preflight'
    if (Test-Path -LiteralPath $placeholder) { throw 'Runner preflight created its output placeholder.' }
    $record = $result.Stdout | ConvertFrom-Json
    if ($record.status -cne 'ok' -or $record.preflightOnly -ne $true -or
        $record.runId -cne $preflightId -or $record.runnerSha256 -cne (Get-Sha256 $runnerPath) -or
        $record.powershellVersion -notmatch '^5\.' -or $record.is64BitProcess -ne $true -or
        $record.getFileHashCommand -cne 'Get-FileHash' -or
        @($record.probeOutputNames).Count -ne 1 -or $record.probeOutputNames[0] -cne $metadataName) {
        throw 'Runner child preflight did not validate the exact 64-bit Windows PowerShell runner and probe output.'
    }
    return $record
}

function Invoke-NativeCodeReaderPowerShellPreflight {
    $arguments = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $nativeReaderPath, '-PowerShellPreflightOnly')
    $result = Invoke-CapturedProcess -FilePath $powerShellExe -Arguments $arguments `
        -WorkingDirectory $repoRoot -TimeoutSeconds 30 -Label 'Native code reader PowerShell preflight'
    Assert-ChildSuccess $result 'Native code reader PowerShell preflight'
    $record = $result.Stdout | ConvertFrom-Json
    $expectedModule = Join-Path (Split-Path -Parent $powerShellExe) 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
    if ($record.status -cne 'ok' -or $record.preflightOnly -ne $true -or
        $record.powershellVersion -notmatch '^5\.' -or $record.is64BitProcess -ne $true -or
        $record.getFileHashCommand -cne 'Get-FileHash' -or
        -not [string]::Equals([IO.Path]::GetFullPath([string]$record.utilityModuleManifest),
            [IO.Path]::GetFullPath($expectedModule), [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Native code reader child preflight did not load the exact 64-bit Windows PowerShell utility module.'
    }
    $record | Add-Member -NotePropertyName scriptSha256 -NotePropertyValue (Get-Sha256 $nativeReaderPath)
    return $record
}

function Invoke-NoTfLauncherPowerShellPreflight {
    $arguments = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $noTfLauncherPath, '-PowerShellPreflightOnly')
    $result = Invoke-CapturedProcess -FilePath $powerShellExe -Arguments $arguments `
        -WorkingDirectory $repoRoot -TimeoutSeconds 45 -Label 'No-TF launcher PowerShell/C# preflight'
    Assert-ChildSuccess $result 'No-TF launcher PowerShell/C# preflight'
    $record = $result.Stdout | ConvertFrom-Json
    $expectedModule = Join-Path (Split-Path -Parent $powerShellExe) 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
    if ($record.status -cne 'ok' -or $record.preflightOnly -ne $true -or
        $record.powershellVersion -notmatch '^5\.' -or $record.is64BitProcess -ne $true -or
        $record.getFileHashCommand -cne 'Get-FileHash' -or $record.helperCompiled -ne $true -or
        [string]$record.helperSha256 -cne [string]$script:SourceSnapshot.noTfDebuggerHelper.sha256 -or
        -not [string]::Equals([IO.Path]::GetFullPath([string]$record.utilityModuleManifest),
            [IO.Path]::GetFullPath($expectedModule), [StringComparison]::OrdinalIgnoreCase)) {
        throw 'No-TF launcher child preflight did not load the exact utility module and compile the current helper source.'
    }
    $record | Add-Member -NotePropertyName scriptSha256 -NotePropertyValue (Get-Sha256 $noTfLauncherPath)
    return $record
}

function Get-PreflightRecord([object]$SourceSnapshot, [object]$RunnerPreflight, [string]$StagingTarget) {
    $stagingDrive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($StagingTarget))
    $outputDrive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($baseFullPath))
    $sameDrive = $stagingDrive.Name -ieq $outputDrive.Name
    $minimumStagingBytes = 128MB + (2 * 5MB)
    $perRunOutputMinimum = if ($sameDrive) { 192MB } else { 128MB }
    $minimumOutputBytes = 3 * $perRunOutputMinimum
    if ($stagingDrive.AvailableFreeSpace -lt $minimumStagingBytes) {
        throw "Resolved C:\temp target has less than the required $([int]($minimumStagingBytes / 1MB)) MiB free."
    }
    if ($outputDrive.AvailableFreeSpace -lt $minimumOutputBytes) {
        throw "Triplet output drive has less than the required $([int]($minimumOutputBytes / 1MB)) MiB free."
    }
    $candidateRoots = @("$tripletId-before", "$tripletId-observer", "$tripletId-after") |
        ForEach-Object { Join-Path $externalRunsPath $_ }
    foreach ($candidate in $candidateRoots) {
        $baseAlias = Join-Path $baseFullPath (Split-Path -Leaf $candidate)
        if ((Test-Path -LiteralPath $candidate) -or (Test-Path -LiteralPath $baseAlias)) {
            throw "Prospective run root already exists and was preserved: $candidate"
        }
        if (Test-PathsOverlap $StagingTarget $candidate) { throw "C:\temp storage overlaps a run root: $candidate" }
    }
    if ((Test-PathsOverlap $StagingTarget $baseFullPath) -or
        (Test-PathsOverlap $StagingTarget $logRoot)) {
        throw 'Resolved C:\temp storage overlaps the triplet output or diagnostics root.'
    }
    if (Test-Path -LiteralPath $logRoot) { throw "Triplet diagnostics root already exists: $logRoot" }
    return [ordered]@{
        mode = $mode
        runSeconds = $RunSeconds
        pauseSeconds = $PauseSeconds
        captureSeconds = $CaptureSeconds
        tripletId = $tripletId
        prospectiveRoots = $candidateRoots
        resolvedTempTarget = $StagingTarget
        stagingFreeBytes = $stagingDrive.AvailableFreeSpace
        requiredStagingBytes = $minimumStagingBytes
        outputRoot = $baseFullPath
        outputFreeBytes = $outputDrive.AvailableFreeSpace
        requiredOutputBytes = $minimumOutputBytes
        runnerPowerShellVersion = $RunnerPreflight.powershellVersion
        runnerPreflightOnly = $RunnerPreflight.preflightOnly
        sourceHashes = $SourceSnapshot
    }
}

function Start-Runner([string]$Role, [string]$RunId, [string]$OutputRoot) {
    $arguments = [Collections.Generic.List[string]]::new()
    foreach ($value in @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $runnerPath, '-ExtractedRoot', $extractedPath, '-OutputRoot', $OutputRoot,
        '-RunId', $RunId, '-Mode', $mode, '-RunSeconds', [string]$RunSeconds)) {
        $arguments.Add([string]$value)
    }
    if ($Role -eq 'observer') {
        foreach ($value in @('-PreSceneProbePath', $metadataProbePath,
            '-PreSceneProbePauseSeconds', [string]$PauseSeconds,
            '-ProbeOutputNamesJson', $probeOutputNamesJson,
            '-RequiredProbeOutputName', $metadataName,
            '-RequiredProbeEndMarker', $endMarker)) { $arguments.Add([string]$value) }
    }
    $line = ($arguments | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
    $stdout = Join-Path $logRoot "$Role.runner.stdout.txt"
    $stderr = Join-Path $logRoot "$Role.runner.stderr.txt"
    $process = Start-Process -FilePath $powerShellExe -ArgumentList $line -WorkingDirectory $repoRoot `
        -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $process.Handle
    return [pscustomobject]@{ Process = $process; Stdout = $stdout; Stderr = $stderr }
}

function Wait-Runner($Runner, [string]$Role) {
    if (-not $Runner.Process.WaitForExit(($RunSeconds + 120) * 1000)) {
        throw "$Role runner exceeded its bounded wait; preserve its output root."
    }
    $Runner.Process.Refresh()
    if ($null -eq $Runner.Process.ExitCode -or $Runner.Process.ExitCode -ne 0) {
        throw "$Role runner failed with exit $($Runner.Process.ExitCode); inspect $($Runner.Stderr)."
    }
    Assert-NoAaronProcess
}

function Assert-RequestFields($Request, [string]$OutputRoot, [string]$RunId) {
    $expectedRuntime = [IO.Path]::GetFullPath((Join-Path $OutputRoot 'runtime\AARON.exe'))
    if ($Request.schemaVersion -ne 1 -or $Request.runId -cne $RunId -or
        [IO.Path]::GetFullPath([string]$Request.runtimeExecutable) -cne $expectedRuntime -or
        $Request.probeSha256 -cne (Get-Sha256 $metadataProbePath) -or
        $Request.runnerSha256 -cne (Get-Sha256 $runnerPath) -or
        $Request.pauseSeconds -ne $PauseSeconds -or $Request.releaseFile -cne $releasePath -or
        $Request.requiredProbeOutputName -cne $metadataName -or
        $Request.requiredProbeEndMarker -cne $endMarker -or
        @($Request.probeOutputNames).Count -ne 1 -or $Request.probeOutputNames[0] -cne $metadataName) {
        throw 'Runner request does not bind this exact triplet run, passive probe, runner, runtime, pause, and output.'
    }
    return $expectedRuntime
}

function Get-ProcessCreationFileTime($Process) {
    return ([UInt64]$Process.StartTime.ToUniversalTime().ToFileTimeUtc()).ToString([Globalization.CultureInfo]::InvariantCulture)
}

function Assert-ReadyIdentity($Ready, [string]$OutputRoot, [string]$RunId) {
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    if (-not (Test-Path -LiteralPath $requestPath -PathType Leaf)) { throw 'Runner request disappeared during the observer pause.' }
    $requestBytes = [IO.File]::ReadAllBytes($requestPath)
    $requestHash = Get-Sha256 $requestPath
    if ($requestHash -cne $Ready.requestSha256) { throw 'Runner request hash changed during native setup.' }
    $request = ([Text.UTF8Encoding]::new($false, $true).GetString($requestBytes)) | ConvertFrom-Json
    $expectedRuntime = Assert-RequestFields $request $OutputRoot $RunId
    $stagedProbePath = Join-Path 'C:\temp' 'aaron-pre-scene-probe.cl'
    if (-not (Test-Path -LiteralPath $stagedProbePath -PathType Leaf) -or
        (Get-Sha256 $stagedProbePath) -cne [string]$Ready.probeSha256) {
        throw 'The runner-staged passive probe no longer matches its source hash.'
    }
    $metadataText = [IO.File]::ReadAllText($metadataPath)
    $nonemptyLines = @($metadataText -split '\r?\n' | Where-Object { $_ -ne '' })
    if (@($nonemptyLines | Where-Object { $_ -ceq $readyMarker }).Count -ne 1 -or
        $nonemptyLines.Count -eq 0 -or $nonemptyLines[$nonemptyLines.Count - 1] -cne $readyMarker) {
        throw 'Observer metadata is no longer at the single requested READY pause.'
    }
    if (Test-Path -LiteralPath $releasePath) { throw 'The runner release marker appeared before native capture completed.' }
    $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
    $process = Get-Process -Id ([int]$Ready.processId) -ErrorAction Stop
    $process.Refresh()
    if ($process.HasExited -or $process.WaitForExit(0) -or $all.Count -ne 1 -or
        $all[0].Id -ne [int]$Ready.processId -or
        -not [string]::Equals([IO.Path]::GetFullPath($process.Path), $expectedRuntime, [StringComparison]::OrdinalIgnoreCase) -or
        (Get-ProcessCreationFileTime $process) -cne [string]$Ready.processCreationFileTimeUtc -or
        (Get-Sha256 $expectedRuntime) -cne [string]$Ready.runtimeSha256) {
        throw 'Live AARON PID, creation time, executable path/hash, or sole-process identity changed.'
    }
    return $request
}

function Wait-Ready([string]$OutputRoot, [string]$RunId, $Runner) {
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    $deadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Runner.Process.Refresh()
        if ($Runner.Process.HasExited) { throw "Observer runner exited before READY; inspect $($Runner.Stderr)." }
        if ((Test-Path -LiteralPath $requestPath -PathType Leaf) -and
            (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
            try {
                $requestBytes = [IO.File]::ReadAllBytes($requestPath)
                $request = ([Text.UTF8Encoding]::new($false, $true).GetString($requestBytes)) | ConvertFrom-Json
            } catch { Start-Sleep -Milliseconds 150; continue }
            $expectedRuntime = Assert-RequestFields $request $OutputRoot $RunId
            $metadataText = [IO.File]::ReadAllText($metadataPath)
            $readyLines = @($metadataText -split '\r?\n' | Where-Object { $_ -ceq $readyMarker })
            if ($readyLines.Count -eq 1 -and $metadataText.TrimEnd([char[]]@(13, 10)).EndsWith($readyMarker, [StringComparison]::Ordinal)) {
                $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
                if ($all.Count -ne 1) { throw 'READY does not belong to the sole AARON process.' }
                $process = $all[0]
                $process.Refresh()
                $creation = Get-ProcessCreationFileTime $process
                $runtimeHash = Get-Sha256 $expectedRuntime
                if ($process.HasExited -or
                    -not [string]::Equals([IO.Path]::GetFullPath($process.Path), $expectedRuntime, [StringComparison]::OrdinalIgnoreCase)) {
                    throw 'READY process path differs from the fresh runner-owned runtime.'
                }
                $ready = [pscustomobject]@{
                    processId = [int]$process.Id
                    processCreationFileTimeUtc = $creation
                    readyObservedAtUtc = [DateTimeOffset]::UtcNow
                    releaseDeadlineUtc = [DateTimeOffset]::UtcNow.AddSeconds($PauseSeconds - 15)
                    runtimePath = $expectedRuntime
                    runtimeSha256 = $runtimeHash
                    probeSha256 = [string]$request.probeSha256
                    requestSha256 = Get-Sha256 $requestPath
                    requestPath = $requestPath
                }
                $null = Assert-ReadyIdentity $ready $OutputRoot $RunId
                return $ready
            }
        }
        Start-Sleep -Milliseconds 200
    }
    throw "Observer did not reach READY within $ReadyTimeoutSeconds seconds."
}

function New-RunRoot([string]$RunId) {
    Assert-NoAaronProcess
    $made = @(& $preparePath -RunId $RunId -Mode $mode -BaseRoot $baseFullPath)
    if ($made.Count -ne 1) { throw "Run-root preparation did not return exactly one path for $RunId." }
    $root = [IO.Path]::GetFullPath(([string]$made[0]).Trim())
    if (Test-Path -LiteralPath $root) { throw "Fresh run root already exists and was preserved: $root" }
    return $root
}

function Invoke-TripletLeg([string]$Role) {
    $runId = "$tripletId-$Role"
    $root = New-RunRoot $runId
    $script:RunRoots[$Role] = $root
    Assert-NoAaronProcess
    $script:OracleLaunchAttempted = $true
    $runner = Start-Runner $Role $runId $root
    $script:ActiveRunner = $runner
    if ($Role -eq 'observer') {
        $script:ActiveObserverRoot = $root
        $ready = Wait-Ready $root $runId $runner
        $script:ObserverReady = $ready
        Invoke-ObserverNativeCapture $root $runId $ready
    }
    Wait-Runner $runner $Role
    $script:ActiveRunner = $null
    $summaryPath = Join-Path $root 'summary.json'
    if (-not (Test-Path -LiteralPath $summaryPath -PathType Leaf)) { throw "$Role root has no retained summary: $root" }
    $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
    if ($summary.complete -ne $true -or $summary.mode -cne $mode -or
        $summary.smallImage -ne $false -or $summary.runnerSha256 -cne (Get-Sha256 $runnerPath)) {
        throw "$Role run summary is incomplete or does not match the shared runner settings: $root"
    }
    if ($Role -eq 'observer') {
        if ($summary.preSceneProbeSha256 -cne (Get-Sha256 $metadataProbePath) -or
            $summary.preSceneProbePauseSeconds -ne $PauseSeconds -or
            $summary.requiredProbeOutputName -cne $metadataName -or
            $summary.requiredProbeEndMarker -cne $endMarker -or
            $summary.probeCompletionSatisfied -ne $true) {
            throw 'Observer run summary does not bind the passive probe READY/END contract.'
        }
    } elseif ($summary.preSceneProbeSha256 -or @($summary.probeOutputNames).Count -ne 0 -or
        $summary.requiredProbeOutputName -or $summary.preSceneProbePauseSeconds -ne 0) {
        throw "$Role control was not uninstrumented."
    }
    $script:RunSummaries[$Role] = $summary
}

function Invoke-ObserverNativeCapture([string]$OutputRoot, [string]$RunId, $Ready) {
    $null = Assert-ReadyIdentity $Ready $OutputRoot $RunId
    $captureArgs = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $nativeReaderPath, '-OracleOutputRoot', $OutputRoot,
        '-MetadataPath', $metadataPath, '-MetadataEndMarker', $readyMarker,
        '-ExpectedFunctionCount', '1', '-DeferRelease')
    $captureChild = Invoke-CapturedProcess -FilePath $powerShellExe -Arguments $captureArgs `
        -WorkingDirectory $repoRoot -TimeoutSeconds 45 `
        -StdoutPath (Join-Path $logRoot 'observer.native-code.stdout.txt') `
        -StderrPath (Join-Path $logRoot 'observer.native-code.stderr.txt') `
        -Label 'Native code capture helper'
    Assert-ChildSuccess $captureChild 'Native code capture helper'
    $null = Assert-ReadyIdentity $Ready $OutputRoot $RunId
    $manifestPathForRun = Join-Path $OutputRoot 'native-code\manifest.json'
    $metadataArchivePath = Join-Path $OutputRoot 'native-code\function-object-metadata.txt'
    if (-not (Test-Path -LiteralPath $manifestPathForRun -PathType Leaf) -or
        -not (Test-Path -LiteralPath $metadataArchivePath -PathType Leaf)) {
        throw 'Native code capture did not create its metadata and manifest.'
    }
    $manifest = Get-Content -LiteralPath $manifestPathForRun -Raw | ConvertFrom-Json
    $function = @($manifest.functions | Where-Object { $_.name -ceq 'SCREEN-AND-STORE' })
    if ($manifest.schemaVersion -ne 1 -or $manifest.processId -ne $Ready.processId -or
        $manifest.runtimeExecutable -cne $Ready.runtimePath -or
        $function.Count -ne 1 -or $manifest.functions.Count -ne 1 -or
        $manifest.metadataSha256 -cne (Get-Sha256 $metadataArchivePath)) {
        throw 'Native manifest does not uniquely bind SCREEN-AND-STORE to this READY process and metadata.'
    }
    $metadataPrefix = [IO.File]::ReadAllText($metadataArchivePath)
    if (-not $metadataPrefix.TrimEnd([char[]]@(13, 10)).EndsWith($readyMarker, [StringComparison]::Ordinal)) {
        throw 'Native capture metadata does not end at the requested READY marker.'
    }
    $mappedDirectory = Join-Path $OutputRoot 'native-code\mapped'
    if (Test-Path -LiteralPath $mappedDirectory) { throw 'Native mapping output directory is not fresh.' }
    $mapArgs = @($mapperPath, $manifestPathForRun, (Join-Path $OutputRoot 'runtime\AARON.pll'), $mappedDirectory)
    $mapChild = Invoke-CapturedProcess -FilePath (Get-Command node -ErrorAction Stop).Source `
        -Arguments $mapArgs -WorkingDirectory $repoRoot -TimeoutSeconds 120 `
        -StdoutPath (Join-Path $logRoot 'observer.mapping.stdout.txt') `
        -StderrPath (Join-Path $logRoot 'observer.mapping.stderr.txt') -Label 'Native code to PLL mapper'
    Assert-ChildSuccess $mapChild 'Native code to PLL mapper'
    $null = Assert-ReadyIdentity $Ready $OutputRoot $RunId
    $mapPath = Join-Path $mappedDirectory 'native-code-map.json'
    if (-not (Test-Path -LiteralPath $mapPath -PathType Leaf)) { throw 'PLL mapper did not create native-code-map.json.' }
    $map = Get-Content -LiteralPath $mapPath -Raw | ConvertFrom-Json
    $mappedFunction = @($map.functions | Where-Object { $_.name -ceq 'SCREEN-AND-STORE' })
    if ($map.schemaVersion -ne 1 -or
        $map.captureManifestSha256 -cne (Get-Sha256 $manifestPathForRun) -or
        $map.pll.sha256 -cne (Get-Sha256 (Join-Path $OutputRoot 'runtime\AARON.pll')) -or
        $mappedFunction.Count -ne 1 -or $map.functions.Count -ne 1 -or
        $mappedFunction[0].uniqueCompleteObjectByteMatch -ne $true -or
        [int]$mappedFunction[0].payloadBytes -ne 1224 -or
        [int]($mappedFunction[0].pll.rawEnd - $mappedFunction[0].pll.payloadOffset) -ne 1224) {
        throw 'PLL map did not produce one source-bound complete SCREEN-AND-STORE payload.'
    }
    $payloadPath = Join-Path $mappedDirectory ([string]$mappedFunction[0].payloadFile)
    if (-not (Test-Path -LiteralPath $payloadPath -PathType Leaf) -or
        (Get-Sha256 $payloadPath) -cne [string]$mappedFunction[0].payloadSha256) {
        throw 'Mapped SCREEN-AND-STORE payload is missing or its hash differs from the map.'
    }
    $captureReportPath = Join-Path $OutputRoot 'capture\screen-store-call-return-no-tf-v1.json'
    $launcherArgs = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $noTfLauncherPath, '-OracleOutputRoot', $OutputRoot,
        '-ProcessId', [string]$Ready.processId, '-ExecutablePath', $Ready.runtimePath,
        '-LiveEntry', [string]$mappedFunction[0].runtime.entry,
        '-PayloadPath', $payloadPath, '-PayloadSha256', [string]$mappedFunction[0].payloadSha256,
        '-MapPath', $mapPath, '-ProbeSourcePath', $metadataProbePath,
        '-ExpectedProcessCreationFileTimeUtc', [string]$Ready.processCreationFileTimeUtc,
        '-ReadyMarker', $readyMarker, '-ReleaseMarkerPath', $releasePath,
        '-CallSiteOffset', '0x2a6', '-CallBytes', 'FF D7',
        '-ContinuationBytes', '89 45 BC', '-OutputPath', $captureReportPath,
        '-Seconds', [string]$CaptureSeconds)
    $launcherChild = Invoke-CapturedProcess -FilePath $powerShellExe -Arguments $launcherArgs `
        -WorkingDirectory $repoRoot -TimeoutSeconds ($CaptureSeconds + 90) `
        -StdoutPath (Join-Path $logRoot 'observer.no-tf.stdout.txt') `
        -StderrPath (Join-Path $logRoot 'observer.no-tf.stderr.txt') -Label 'SCREEN-AND-STORE no-TF launcher'
    Assert-ChildSuccess $launcherChild 'SCREEN-AND-STORE no-TF launcher'
    $script:CaptureReport = Assert-NoTfCaptureAccepted $OutputRoot $Ready $manifestPathForRun $mapPath $payloadPath $captureReportPath
    $script:CaptureReportPath = $captureReportPath
}

function Assert-NoTfCaptureAccepted([string]$OutputRoot, $Ready, [string]$ManifestPathForRun,
    [string]$MapPath, [string]$PayloadPath, [string]$ReportPath) {
    if (-not (Test-Path -LiteralPath $ReportPath -PathType Leaf)) { throw 'No-TF launcher did not save its capture receipt.' }
    $report = Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json
    $debug = $report.debuggerResult
    $expectedRequestHash = [string]$Ready.requestSha256
    $expectedRequestPath = [IO.Path]::GetFullPath((Join-Path $OutputRoot 'pre-scene-probe-request.json'))
    $expectedReleasePath = [IO.Path]::GetFullPath($releasePath)
    if ($report.schemaVersion -ne 1 -or $report.target -cne 'SCREEN-AND-STORE' -or
        $report.accepted -ne $true -or $report.setupError -or
        [int]$report.processId -ne [int]$Ready.processId -or
        [string]$report.inputs.expectedProcessCreationFileTimeUtc -cne [string]$Ready.processCreationFileTimeUtc -or
        [string]$report.inputs.readyMarker -cne $readyMarker -or
        -not [string]::Equals([string]$report.inputs.releaseMarkerPath, $expectedReleasePath, [StringComparison]::OrdinalIgnoreCase) -or
        [string]$report.sources.requiredProbeSource.sha256 -cne [string]$Ready.probeSha256 -or
        [string]$report.sources.launcher.sha256 -cne [string]$script:SourceSnapshot.noTfLauncher.sha256 -or
        [string]$report.sources.helper.sha256 -cne [string]$script:SourceSnapshot.noTfDebuggerHelper.sha256 -or
        [string]$report.sources.request.sha256 -cne $expectedRequestHash -or
        [string]$report.sources.metadata.sha256 -cne (Get-Sha256 (Join-Path $OutputRoot 'native-code\function-object-metadata.txt')) -or
        [string]$report.sources.metadata.stagedSha256 -cne [string]$report.sources.metadata.sha256 -or
        [string]$report.inputs.executablePath -cne [string]$Ready.runtimePath -or
        [string]$report.sources.captureManifest.sha256 -cne (Get-Sha256 $ManifestPathForRun) -or
        [string]$report.sources.nativeMap.sha256 -cne (Get-Sha256 $MapPath) -or
        [string]$report.sources.mappedPayloadSha256 -cne (Get-Sha256 $PayloadPath) -or
        [string]$report.sources.runtimeExecutableSha256 -cne (Get-Sha256 $Ready.runtimePath) -or
        [string]$report.sources.runtimePllSha256 -cne (Get-Sha256 (Join-Path $OutputRoot 'runtime\AARON.pll')) -or
        [string]$report.sources.requiredProbeRunnerSha256 -cne (Get-Sha256 $runnerPath) -or
        [string]$debug.runId -cne (Split-Path -Leaf $OutputRoot) -or
        [string]$debug.requestSha256 -cne $expectedRequestHash -or
        [int]$debug.processId -ne [int]$Ready.processId -or
        -not [string]::Equals([string]$debug.expectedRuntimePath, [string]$Ready.runtimePath, [StringComparison]::OrdinalIgnoreCase) -or
        -not [string]::Equals([string]$debug.processImagePath, [string]$Ready.runtimePath, [StringComparison]::OrdinalIgnoreCase) -or
        $debug.initialFileIdentityMatches -ne $true -or
        $debug.preReleaseFileIdentityMatches -ne $true -or
        $debug.preReleaseSameIdentityAsInitial -ne $true -or
        [string]::IsNullOrWhiteSpace([string]$debug.initialObservedProcessImagePath) -or
        [string]::IsNullOrWhiteSpace([string]$debug.preReleaseObservedProcessImagePath) -or
        [string]::IsNullOrWhiteSpace([string]$debug.initialObservedFileIdentity) -or
        [string]::IsNullOrWhiteSpace([string]$debug.initialSuppliedFileIdentity) -or
        [string]$debug.initialObservedFileIdentity -cne [string]$debug.initialSuppliedFileIdentity -or
        [string]::IsNullOrWhiteSpace([string]$debug.preReleaseObservedFileIdentity) -or
        [string]::IsNullOrWhiteSpace([string]$debug.preReleaseSuppliedFileIdentity) -or
        [string]$debug.preReleaseObservedFileIdentity -cne [string]$debug.preReleaseSuppliedFileIdentity -or
        [string]$debug.preReleaseObservedFileIdentity -cne [string]$debug.initialObservedFileIdentity -or
        [string]$debug.preReleaseSuppliedFileIdentity -cne [string]$debug.initialSuppliedFileIdentity -or
        -not [string]::Equals([string]$debug.requestPath, $expectedRequestPath, [StringComparison]::OrdinalIgnoreCase) -or
        -not [string]::Equals([string]$debug.releaseMarkerPath, $expectedReleasePath, [StringComparison]::OrdinalIgnoreCase) -or
        [string]$debug.expectedProcessCreationFileTimeUtc -cne [string]$Ready.processCreationFileTimeUtc -or
        [string]$debug.observedProcessCreationFileTimeUtc -cne [string]$Ready.processCreationFileTimeUtc -or
        $debug.captureCompleted -ne $true -or $debug.breakpointsArmedBeforeRelease -ne $true -or
        $debug.readyPauseReleased -ne $true -or $debug.debugRegistersRestored -ne $true -or
        $debug.detachSucceeded -ne $true -or @($debug.cleanupErrors).Count -ne 0 -or
        @($debug.events).Count -ne 3 -or
        $debug.events[0].kind -cne 'source-hit' -or
        $debug.events[1].kind -cne 'target-entry' -or
        $debug.events[2].kind -cne 'call-return' -or
        $debug.events[0].order -ne 1 -or $debug.events[1].order -ne 2 -or $debug.events[2].order -ne 3 -or
        $debug.cleanupReceipt.releaseMarkerCreated -ne $true) {
        throw 'No-TF capture receipt failed its source, run, event-order, release, restore, detach, or cleanup gates.'
    }
    $eventThreads = @($debug.events | ForEach-Object { [int]$_.threadId } | Select-Object -Unique)
    $eventProcesses = @($debug.events | ForEach-Object { [int]$_.processId } | Select-Object -Unique)
    if ($eventThreads.Count -ne 1 -or $eventProcesses.Count -ne 1 -or
        $eventThreads[0] -ne [int]$debug.selectedThreadId -or $eventProcesses[0] -ne [int]$Ready.processId) {
        throw 'No-TF event records do not share this process and selected thread.'
    }
    $releaseText = [string]$debug.releaseMarkerText
    if (-not $releaseText.Contains("run $((Split-Path -Leaf $OutputRoot))") -or
        -not $releaseText.Contains("requestSha256 $expectedRequestHash") -or
        -not $releaseText.Contains("processCreationFileTimeUtc $($Ready.processCreationFileTimeUtc)")) {
        throw 'Normal READY release marker is not bound to this exact run, request, and process creation time.'
    }
    return $report
}

function Try-ReleaseOwnedPause([string]$OutputRoot, [string]$RunId, $Ready) {
    if (-not $Ready) { return [ordered]@{ created = $false; reason = 'READY identity was not established' } }
    if ([DateTimeOffset]::UtcNow -ge [DateTimeOffset]$Ready.releaseDeadlineUtc) {
        return [ordered]@{ created = $false; reason = 'READY pause is at or beyond its conservative release deadline' }
    }
    if (Test-Path -LiteralPath $releasePath) { return [ordered]@{ created = $false; reason = 'release marker already exists' } }
    if ($script:ActiveChildProcess) {
        try {
            $script:ActiveChildProcess.Refresh()
            if (-not $script:ActiveChildProcess.HasExited) {
                return [ordered]@{ created = $false; reason = 'capture helper child is still active' }
            }
        } catch { return [ordered]@{ created = $false; reason = 'capture helper child identity is uncertain' } }
    }
    try {
        $null = Assert-ReadyIdentity $Ready $OutputRoot $RunId
        if (Test-Path -LiteralPath $releasePath) { return [ordered]@{ created = $false; reason = 'release marker appeared during guard' } }
        $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
        $requestHashBefore = Get-Sha256 $requestPath
        if ($requestHashBefore -cne [string]$Ready.requestSha256) {
            return [ordered]@{ created = $false; reason = 'runner request hash does not match READY' }
        }
        $process = Get-Process -Id ([int]$Ready.processId) -ErrorAction Stop
        $process.Refresh()
        if ($process.HasExited -or $process.WaitForExit(0) -or
            (Get-ProcessCreationFileTime $process) -cne [string]$Ready.processCreationFileTimeUtc -or
            -not [string]::Equals([IO.Path]::GetFullPath($process.Path), [string]$Ready.runtimePath, [StringComparison]::OrdinalIgnoreCase)) {
            return [ordered]@{ created = $false; reason = 'AARON is dead, reused, or has a different runtime path' }
        }
        $requestHashConfirm = Get-Sha256 $requestPath
        if ($requestHashConfirm -cne $requestHashBefore -or (Test-Path -LiteralPath $releasePath)) {
            return [ordered]@{ created = $false; reason = 'request changed or a release marker appeared before creation' }
        }
        $process.Refresh()
        if ($process.HasExited -or $process.WaitForExit(0) -or
            (Get-ProcessCreationFileTime $process) -cne [string]$Ready.processCreationFileTimeUtc -or
            -not [string]::Equals([IO.Path]::GetFullPath($process.Path), [string]$Ready.runtimePath, [StringComparison]::OrdinalIgnoreCase)) {
            return [ordered]@{ created = $false; reason = 'AARON stopped or changed identity before marker creation' }
        }
        $text = "Failure cleanup release for run $RunId`nrequestSha256 $requestHashBefore`nprobeSha256 $($Ready.probeSha256)`nprocessId $($Ready.processId)`nprocessCreationFileTimeUtc $($Ready.processCreationFileTimeUtc)`nruntimeExecutable $($Ready.runtimePath)`n"
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($text)
        $stream = [IO.File]::Open($releasePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
        try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) }
        finally { $stream.Dispose() }
        return [ordered]@{ created = $true; reason = 'exact live observer request released after failure'; sha256 = Get-Sha256 $releasePath }
    } catch {
        return [ordered]@{ created = $false; reason = $_.Exception.Message }
    }
}

function Assert-ObserverMetadataCompleted([string]$OutputRoot) {
    $reportPath = Join-Path $OutputRoot "capture\$metadataName"
    $capturedMetadataPath = Join-Path $OutputRoot 'native-code\function-object-metadata.txt'
    if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $capturedMetadataPath -PathType Leaf)) {
        throw 'Observer did not preserve both its final metadata report and READY prefix.'
    }
    $text = [IO.File]::ReadAllText($reportPath)
    $lines = @($text -split '\r?\n' | Where-Object { $_ -ne '' })
    $begin = @($lines | Where-Object { $_ -ceq 'BEGIN screen-store-call-return-metadata-v1' })
    $modeLine = @($lines | Where-Object { $_ -ceq 'MODE passive/read-only-metadata' })
    $targetLines = @($lines | Where-Object { $_ -match '^TARGET name=.*SCREEN-AND-STORE' })
    $headerLines = @($lines | Where-Object { $_ -cmatch '^HEADER name="SCREEN-AND-STORE" bytes=[0-9a-fA-F]{128}$' })
    $readyLines = @($lines | Where-Object { $_ -ceq $readyMarker })
    $releaseLines = @($lines | Where-Object { $_ -ceq 'CAPTURE-WAIT released=T' })
    $completeLines = @($lines | Where-Object { $_ -ceq 'COMPLETE execution=finished' })
    $endLines = @($lines | Where-Object { $_ -ceq $endMarker })
    $beginIndex = [Array]::IndexOf($lines, 'BEGIN screen-store-call-return-metadata-v1')
    $readyIndex = [Array]::IndexOf($lines, $readyMarker)
    $releaseIndex = [Array]::IndexOf($lines, 'CAPTURE-WAIT released=T')
    $completeIndex = [Array]::IndexOf($lines, 'COMPLETE execution=finished')
    $endIndex = [Array]::IndexOf($lines, $endMarker)
    $nativePrefix = [IO.File]::ReadAllText($capturedMetadataPath)
    $summary = Get-Content -LiteralPath (Join-Path $OutputRoot 'summary.json') -Raw | ConvertFrom-Json
    if ($begin.Count -ne 1 -or $modeLine.Count -ne 1 -or $targetLines.Count -ne 1 -or
        $headerLines.Count -ne 1 -or $readyLines.Count -ne 1 -or
        $releaseLines.Count -ne 1 -or $completeLines.Count -ne 1 -or $endLines.Count -ne 1 -or
        $endIndex -ne ($lines.Count - 1) -or
        -not ($beginIndex -lt $readyIndex -and $readyIndex -lt $releaseIndex -and
            $releaseIndex -lt $completeIndex -and $completeIndex -lt $endIndex) -or
        $text -match '(?m)^ERROR\b' -or -not $text.StartsWith($nativePrefix, [StringComparison]::Ordinal) -or
        $summary.requiredProbeOutputSha256 -cne (Get-Sha256 $reportPath)) {
        throw 'Observer metadata lacks the complete passive READY/release/END sequence or exact captured READY prefix.'
    }
    return [ordered]@{
        path = $reportPath
        sha256 = Get-Sha256 $reportPath
        readyPrefixSha256 = Get-Sha256 $capturedMetadataPath
        ready = $readyMarker
        end = $endMarker
    }
}

function Assert-ArchivedStagedSources {
    $hashes = [ordered]@{}
    foreach ($stagedName in $stagedSourceFiles.Keys) {
        $expectedHash = [string]$script:SourceSnapshot["staged:$stagedName"].sha256
        $roleHashes = [ordered]@{}
        foreach ($role in @('before', 'observer', 'after')) {
            $path = Join-Path $script:RunRoots[$role] "capture\$stagedName"
            if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Staged source was not archived: $path" }
            $roleHashes[$role] = Get-Sha256 $path
            if ($roleHashes[$role] -cne $expectedHash) {
                throw "Archived staged source differs from its source snapshot: $role/$stagedName"
            }
        }
        if ($roleHashes.before -cne $roleHashes.observer -or $roleHashes.before -cne $roleHashes.after) {
            throw "Staged source control hashes differ for $stagedName."
        }
        $hashes[$stagedName] = $expectedHash
    }
    return $hashes
}

function Compare-ControlFiles {
    $sharedNames = @(
        'capture\aa0',
        'capture\image',
        'capture\image-id',
        'capture\aaron-scene-state-snapshot.txt',
        'capture\aaron-planning-call-trace.txt',
        'capture\aaron-random-seed-loaded.txt',
        'capture\aaron-writer-full.txt',
        'capture\aaron-screen-units.txt',
        'capture\aaron-screen-color-data.txt'
    )
    $hashes = [ordered]@{}
    foreach ($relativeName in $sharedNames) {
        $byRole = [ordered]@{}
        foreach ($role in @('before', 'observer', 'after')) {
            $path = Join-Path $script:RunRoots[$role] $relativeName
            if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
                throw "Required screen-unit control output is missing: $path"
            }
            $byRole[$role] = Get-Sha256 $path
        }
        if ($byRole.before -cne $byRole.observer -or $byRole.before -cne $byRole.after) {
            throw "Control hash mismatch for ${relativeName}: before=$($byRole.before), observer=$($byRole.observer), after=$($byRole.after)."
        }
        $hashes[$relativeName.Replace('\', '/')] = [string]$byRole.before
    }
    return $hashes
}

function Write-FreshJson([string]$Path, [object]$Record) {
    $json = ConvertTo-Json -InputObject $Record -Depth 30
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json + [Environment]::NewLine)
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
}

function Write-FailureReceipt([string]$Message, [string]$Stage, [object]$Release) {
    if (-not (Test-Path -LiteralPath $logRoot -PathType Container)) { return $null }
    $receiptPath = Join-Path $logRoot 'failure-receipt.json'
    if (Test-Path -LiteralPath $receiptPath) { return $receiptPath }
    $sourceSnapshot = $script:SourceSnapshot
    $record = [ordered]@{
        schemaVersion = 1
        status = 'failed'
        accepted = $false
        tripletId = $tripletId
        mode = $mode
        stage = $Stage
        error = $Message
        roots = $script:RunRoots
        observerReady = if ($script:ObserverReady) { $script:ObserverReady } else { $null }
        failureRelease = $Release
        sourceHashes = $sourceSnapshot
        capturedAt = [DateTimeOffset]::UtcNow.ToString('o')
    }
    Write-FreshJson $receiptPath $record
    return $receiptPath
}

$script:RunRoots = [ordered]@{ before = $null; observer = $null; after = $null }
$script:RunSummaries = [ordered]@{}
$script:ActiveRunner = $null
$script:ActiveObserverRoot = $null
$script:ObserverReady = $null
$script:CaptureReport = $null
$script:CaptureReportPath = $null
$script:ActiveChildProcess = $null
$script:SourceSnapshot = $null
$script:OracleLaunchAttempted = $false
$stage = 'preflight'
$failureRelease = $null

try {
    if (-not (Test-Path -LiteralPath 'C:\temp' -PathType Container)) { throw 'C:\temp is missing.' }
    $tempItem = Get-Item -LiteralPath 'C:\temp' -Force
    if ($tempItem.LinkType -notin @('SymbolicLink', 'Junction') -or -not $tempItem.Target) {
        throw 'C:\temp must resolve through the documented symbolic link or junction.'
    }
    $stagingTarget = Resolve-DirectoryTarget 'C:\temp'
    if (-not (Test-Path -LiteralPath $stagingTarget -PathType Container)) { throw 'C:\temp link target is not an existing directory.' }
    $script:SourceSnapshot = Get-SourceSnapshot
    Assert-ExtractedRuntime $script:SourceSnapshot
    $nodeCommand = Get-Command node -ErrorAction Stop
    $null = Get-Command Get-FileHash -ErrorAction Stop
    $null = Get-Command Get-Process -ErrorAction Stop
    $null = Get-Command Start-Process -ErrorAction Stop
    foreach ($path in @($runnerPath, $preparePath, $metadataProbePath, $nativeReaderPath,
        $noTfLauncherPath, $noTfHelperPath, $mapperPath, $pllIndexPath, $tripletVerifierPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required tool/source is missing: $path" }
    }
    Assert-NoAaronProcess
    Assert-ReservedNamesClear
    Test-TempWriteReadDelete $nonce
    $runnerPreflight = Invoke-RunnerPowerShellPreflight
    $nativeReaderPreflight = Invoke-NativeCodeReaderPowerShellPreflight
    $noTfLauncherPreflight = Invoke-NoTfLauncherPowerShellPreflight
    Assert-NoAaronProcess
    $preflight = Get-PreflightRecord $script:SourceSnapshot $runnerPreflight $stagingTarget
    $preflight.nativeCodeReaderPowerShellPreflight = $nativeReaderPreflight
    $preflight.noTfLauncherPowerShellPreflight = $noTfLauncherPreflight
    $preflight.nodePath = $nodeCommand.Source
    $global:LASTEXITCODE = 0
    $nodeVersionOutput = @(& $nodeCommand.Source --version)
    $nodeVersionExitCode = $global:LASTEXITCODE
    $preflight.nodeVersion = $nodeVersionOutput | Select-Object -First 1
    if (-not $preflight.nodeVersion -or $nodeVersionExitCode -ne 0) { throw 'Node.js preflight did not return a version.' }
    if ($PreflightOnly) {
        $preflight.status = 'preflight-ok'
        $preflight.preflightOnly = $true
        $preflight.oracleLaunchAttempted = $false
        $preflight.outputRootsCreated = $false
        $preflight.tempWriteReadDeleteProbe = 'passed-and-removed'
        $preflight.activeAARONProcesses = 0
        $preflight | ConvertTo-Json -Depth 15 -Compress
        return
    }
    New-Item -ItemType Directory -Path $logRoot | Out-Null
    $stage = 'triplet-runs'
    Assert-SourceSnapshot $script:SourceSnapshot
    Invoke-TripletLeg 'before'
    Invoke-TripletLeg 'observer'
    Invoke-TripletLeg 'after'
    $observerMetadata = Assert-ObserverMetadataCompleted $script:RunRoots.observer
    $stagedSourceHashes = Assert-ArchivedStagedSources

    $stage = 'triplet-verification'
    Assert-NoAaronProcess
    $verifyArgs = @($tripletVerifierPath, $script:RunRoots.before,
        $script:RunRoots.observer, $script:RunRoots.after)
    $verifyChild = Invoke-CapturedProcess -FilePath $nodeCommand.Source -Arguments $verifyArgs `
        -WorkingDirectory $repoRoot -TimeoutSeconds 180 `
        -StdoutPath (Join-Path $logRoot 'triplet-verification.stdout.txt') `
        -StderrPath (Join-Path $logRoot 'triplet-verification.stderr.txt') -Label 'Source-bound triplet verifier'
    Assert-ChildSuccess $verifyChild 'Source-bound triplet verifier'
    $extraControlHashes = Compare-ControlFiles
    Assert-SourceSnapshot $script:SourceSnapshot

    $capture = $script:CaptureReport
    if (-not $capture -or $capture.accepted -ne $true) {
        throw 'No accepted SCREEN-AND-STORE capture receipt is available.'
    }
    $captureHash = Get-Sha256 $script:CaptureReportPath
    $verificationText = Get-Content -LiteralPath (Join-Path $logRoot 'triplet-verification.stdout.txt') -Raw
    if ($verificationText -notmatch '(?m)^PASS: three complete screen-unit-seed-1234 runs$' -or
        $verificationText -notmatch '(?m)^PASS: observer source-bound by [a-f0-9]{64}$' -or
        $verificationText -notmatch '(?m)^PASS: [0-9]+ outputs agree across fresh bracketing controls$' -or
        $verificationText -notmatch '(?m)^PASS: [0-9]+ ordinary staged Lisp sources match$') {
        throw 'Triplet verifier output did not confirm complete scene, planning, drawing, and staged-source gates.'
    }
    $summaryPath = Join-Path $logRoot 'source-bound-triplet-summary.json'
    $summary = [ordered]@{
        schemaVersion = 1
        status = 'accepted'
        accepted = $true
        tripletId = $tripletId
        mode = $mode
        settings = [ordered]@{
            runner = 'research/oracle/run-local-scene-state-required-probe.ps1'
            runSeconds = $RunSeconds
            observerPauseSeconds = $PauseSeconds
            nativeCaptureSeconds = $CaptureSeconds
            smallImage = $false
            allRunsFresh = $true
            serialized = $true
        }
        roots = $script:RunRoots
        runSummaries = $script:RunSummaries
        sourceHashes = $script:SourceSnapshot
        controls = [ordered]@{
            verifierStdout = 'triplet-verification.stdout.txt'
            coreSceneDrawingPlanningAndStagedSourceVerifierPassed = $true
            comparedSceneDrawingAndPlanningOutputs = $extraControlHashes
            stagedSourceHashes = $stagedSourceHashes
            screenUnitWriterAndColorHashes = $extraControlHashes
        }
        observerMetadata = $observerMetadata
        observerCapture = [ordered]@{
            reportPath = $script:CaptureReportPath
            reportSha256 = $captureHash
            accepted = $true
            processId = $capture.processId
            liveEntry = $capture.inputs.liveEntry
            payloadSha256 = $capture.inputs.payloadSha256
            mapSha256 = $capture.sources.nativeMap.sha256
            requestSha256 = $capture.sources.request.sha256
            probeSha256 = $capture.sources.requiredProbeSource.sha256
            debuggerGates = [ordered]@{
                events = @($capture.debuggerResult.events | ForEach-Object { $_.kind })
                processImageIdentityMatchesAtInitialCheck = $capture.debuggerResult.initialFileIdentityMatches
                processImageIdentityMatchesBeforeRelease = $capture.debuggerResult.preReleaseFileIdentityMatches
                processImageIdentityStableFromInitial = $capture.debuggerResult.preReleaseSameIdentityAsInitial
                observedProcessImagePath = $capture.debuggerResult.initialObservedProcessImagePath
                breakpointsArmedBeforeRelease = $capture.debuggerResult.breakpointsArmedBeforeRelease
                readyPauseReleased = $capture.debuggerResult.readyPauseReleased
                debugRegistersRestored = $capture.debuggerResult.debugRegistersRestored
                detached = $capture.debuggerResult.detachSucceeded
                cleanupErrors = @($capture.debuggerResult.cleanupErrors)
            }
        }
        capturedAt = [DateTimeOffset]::UtcNow.ToString('o')
        limitations = @(
            'The continuation breakpoint stops before 89 45 BC executes; no local-store effect is claimed.',
            'The EDI value remains a raw CPU target; no Lisp name, ABI, or direct caller is inferred.',
            'Acceptance applies only to this source-bound process and bounded triplet.'
        )
    }
    Write-FreshJson $summaryPath $summary
    $summary | ConvertTo-Json -Depth 30 -Compress
} catch {
    $errorMessage = $_.Exception.Message
    if (-not $PreflightOnly -and $script:ActiveRunner -and $script:ObserverReady -and $script:ActiveObserverRoot) {
        $failureRelease = Try-ReleaseOwnedPause $script:ActiveObserverRoot `
            (Split-Path -Leaf $script:ActiveObserverRoot) $script:ObserverReady
    }
    if (-not $PreflightOnly -and $script:ActiveRunner) {
        try { Wait-Runner $script:ActiveRunner 'active' } catch { $errorMessage += ' | runner wait: ' + $_.Exception.Message }
        $script:ActiveRunner = $null
    }
    $receiptPath = if ($PreflightOnly) { $null } else { Write-FailureReceipt $errorMessage $stage $failureRelease }
    $failureRecord = [ordered]@{
        schemaVersion = 1
        status = 'failed'
        accepted = $false
        tripletId = $tripletId
        stage = $stage
        error = $errorMessage
        receiptPath = $receiptPath
        roots = $script:RunRoots
        failureRelease = $failureRelease
        sourceHashes = $script:SourceSnapshot
        oracleLaunchAttempted = [bool]$script:OracleLaunchAttempted
    }
    $failureRecord | ConvertTo-Json -Depth 20 -Compress | Write-Output
    throw "Screen-store source-bound triplet failed at '$stage'. Failure receipt: $receiptPath. $errorMessage"
}
