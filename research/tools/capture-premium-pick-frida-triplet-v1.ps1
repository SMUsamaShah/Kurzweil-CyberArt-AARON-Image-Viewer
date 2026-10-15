# Serial, source-bound uninstrumented / Frida observer / uninstrumented triplet.
# The nested observer owns its single AARON run; this wrapper never overlaps
# oracle processes and preserves every failed run for diagnosis.
[CmdletBinding()]
param(
    [string]$ExtractedRoot = 'research\extracted\aaron',
    [string]$BaseRoot = 'C:\AaronOracleRuns',
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,9}$')]
    [string]$RunPrefix = 'frida-pick',
    [ValidateRange(120, 600)] [int]$RunSeconds = 360,
    [ValidateRange(90, 300)] [int]$PauseSeconds = 150,
    [ValidateRange(30, 600)] [int]$ObserverTimeoutSeconds = 300,
    [switch]$AllowAARONInjectionAfterCrash,
    [switch]$PreflightOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PauseSeconds -ge $RunSeconds) { throw 'PauseSeconds must be shorter than RunSeconds' }
if ($ObserverTimeoutSeconds -ge $RunSeconds) {
    throw 'ObserverTimeoutSeconds must be shorter than RunSeconds'
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$extractedPath = if ([IO.Path]::IsPathRooted($ExtractedRoot)) {
    (Resolve-Path -LiteralPath $ExtractedRoot).Path
} else {
    (Resolve-Path -LiteralPath (Join-Path $repoRoot $ExtractedRoot)).Path
}
$baseFullPath = [IO.Path]::GetFullPath($BaseRoot)
$externalRuns = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'
$prepareScript = Join-Path $repoRoot 'research\tools\prepare-local-aaron-oracle-run.ps1'
$runnerScript = Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1'
$observerScript = Join-Path $repoRoot 'research\tools\capture-premium-pick-frida-observer-v1.ps1'
$genericVerifier = Join-Path $repoRoot 'research\tools\verify-local-aaron-triplet.mjs'
$fridaVerifier = Join-Path $repoRoot 'research\tools\validate-premium-pick-frida-triplet-v1.mjs'
$node = Get-Command -Name node.exe -ErrorAction SilentlyContinue
$powerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$mode = 'writer-stream-seed-1234'
$probePath = Join-Path $repoRoot 'research\introspection\premium-callsite-metadata-v1.cl'
$probeName = 'aaron-premium-callsite-metadata-v1.txt'
$fridaReportName = 'aaron-premium-pick-frida-observer-v1.txt'
$releasePath = 'C:\temp\aaron-native-code-release.txt'
$metadataPath = Join-Path 'C:\temp' $probeName
$fridaReportPath = Join-Path 'C:\temp' $fridaReportName

foreach ($path in @($prepareScript, $runnerScript, $observerScript, $genericVerifier,
    $fridaVerifier, $probePath, $powerShellExe)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required input is missing: $path" }
}
if ($null -eq $node) { throw 'node.exe is required for triplet verification' }
if ([IntPtr]::Size -ne 8) { throw 'Run this coordinator in 64-bit PowerShell' }
if (-not (Test-Path -LiteralPath 'C:\temp' -PathType Container)) { throw 'C:\temp is missing' }

function Assert-NoAaronProcess {
    $active = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
    if ($active.Count -ne 0) {
        throw "An AARON process is active (PID $(($active.Id) -join ', ')); refusing to overlap oracle runs"
    }
}

function ConvertTo-NativeArgument([string]$Value) {
    $builder = [Text.StringBuilder]::new()
    $slashes = 0
    [void]$builder.Append('"')
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') { $slashes++; continue }
        if ($character -eq '"') {
            if ($slashes -gt 0) { [void]$builder.Append(('\' * (2 * $slashes))) }
            [void]$builder.Append('\"'); $slashes = 0; continue
        }
        if ($slashes -gt 0) { [void]$builder.Append(('\' * $slashes)); $slashes = 0 }
        [void]$builder.Append($character)
    }
    if ($slashes -gt 0) { [void]$builder.Append(('\' * (2 * $slashes))) }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Get-StagingAndOutputFreeSpace {
    $tempItem = Get-Item -LiteralPath 'C:\temp' -Force
    if ($tempItem.LinkType -notin @('SymbolicLink', 'Junction') -or -not $tempItem.Target) {
        throw 'C:\temp must remain the documented repository-backed symlink or junction'
    }
    $target = [string]@($tempItem.Target)[0]
    $stagingPath = if ([IO.Path]::IsPathRooted($target)) {
        [IO.Path]::GetFullPath($target)
    } else {
        [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $tempItem.FullName) $target))
    }
    if (-not (Test-Path -LiteralPath $stagingPath -PathType Container)) {
        throw "C:\temp target is unavailable: $stagingPath"
    }
    $stagingDrive = [IO.Path]::GetPathRoot($stagingPath)
    $outputDrive = [IO.Path]::GetPathRoot($baseFullPath)
    $stagingFree = [IO.DriveInfo]::new($stagingDrive).AvailableFreeSpace
    $outputFree = [IO.DriveInfo]::new($outputDrive).AvailableFreeSpace
    $minOutput = if ($stagingDrive -ieq $outputDrive) { 192MB } else { 128MB }
    if ($stagingFree -lt 32MB) { throw "C:\temp target has less than 32 MiB free: $stagingPath" }
    if ($outputFree -lt $minOutput) {
        throw "Oracle output drive has less than $([int]($minOutput / 1MB)) MiB free: $outputDrive"
    }
    return [pscustomobject]@{
        stagingPath = $stagingPath
        stagingFreeBytes = $stagingFree
        outputDrive = $outputDrive
        outputFreeBytes = $outputFree
        minimumOutputBytes = $minOutput
    }
}

function Invoke-NoLaunchChild([string]$Executable, [string[]]$Arguments, [string]$Label) {
    $argumentLine = ($Arguments | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Executable
    $startInfo.Arguments = $argumentLine
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $null = $process.Start()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(120000)) {
        throw "$Label no-launch preflight exceeded two minutes"
    }
    $stdout = $stdoutTask.Result
    $stderr = $stderrTask.Result
    $exitCode = $process.ExitCode
    $process.Dispose()
    if ($exitCode -ne 0) { throw "$Label no-launch preflight failed (exit $exitCode): $stderr $stdout" }
    return [pscustomobject]@{ stdout = $stdout; stderr = $stderr }
}

$stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$nonce = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$tripletId = "$RunPrefix-$stamp-$nonce"
$beforeId = "$tripletId-before"
$afterId = "$tripletId-after"
$logRoot = Join-Path $repoRoot "research\extracted\local-oracle\premium-pick-frida-triplet-v1-logs\$tripletId"
$prospectiveRoots = @(
    (Join-Path $baseFullPath $beforeId),
    (Join-Path $baseFullPath $afterId),
    (Join-Path $baseFullPath "$tripletId-observer")
)
$prospectiveExternalRoots = @(
    (Join-Path $externalRuns $beforeId),
    (Join-Path $externalRuns $afterId)
)

Assert-NoAaronProcess
$space = Get-StagingAndOutputFreeSpace
foreach ($path in @($logRoot) + $prospectiveRoots + $prospectiveExternalRoots) {
    if (Test-Path -LiteralPath $path) { throw "Prospective triplet path already exists; preserve it: $path" }
}
foreach ($path in @($metadataPath, $releasePath, $fridaReportPath)) {
    if (Test-Path -LiteralPath $path) { throw "Reserved C:\temp staging path already exists; preserve it: $path" }
}

$observerPreflightArgs = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $observerScript, '-ExtractedRoot', $extractedPath, '-BaseRoot', $baseFullPath,
    '-RunPrefix', $RunPrefix, '-RunSeconds', [string]$RunSeconds,
    '-PauseSeconds', [string]$PauseSeconds, '-ObserverTimeoutSeconds', [string]$ObserverTimeoutSeconds,
    '-PreflightOnly')
$observerPreflight = Invoke-NoLaunchChild $powerShellExe $observerPreflightArgs 'Frida observer'
$observerPreflightRecord = $observerPreflight.stdout | ConvertFrom-Json
if ($observerPreflightRecord.status -cne 'preflight-ok' -or
    $observerPreflightRecord.oracleLaunched -ne $false -or
    $observerPreflightRecord.fridaObserverSelfTest -cne 'passed' -or
    $observerPreflightRecord.cTempWriteProbe -cne 'created-verified-deleted') {
    throw 'Frida observer preflight did not confirm its exact no-launch contract'
}

$controlPreflightId = "$tripletId-preflight"
$controlPlaceholder = Join-Path $baseFullPath "$controlPreflightId-uncreated"
$controlPreflightArgs = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $runnerScript, '-ExtractedRoot', $extractedPath, '-OutputRoot', $controlPlaceholder,
    '-RunId', $controlPreflightId, '-Mode', $mode, '-RunSeconds', [string]$RunSeconds,
    '-PowerShellPreflightOnly')
$controlPreflight = Invoke-NoLaunchChild $powerShellExe $controlPreflightArgs 'Control runner'
if (Test-Path -LiteralPath $controlPlaceholder) { throw 'Control no-launch preflight unexpectedly created its output root' }
Assert-NoAaronProcess

if ($PreflightOnly) {
    [ordered]@{
        status = 'preflight-ok'
        preflightOnly = $true
        oracleLaunched = $false
        tripletId = $tripletId
        mode = $mode
        runSeconds = $RunSeconds
        pauseSeconds = $PauseSeconds
        prospectiveControlRoots = @($prospectiveExternalRoots)
        stagingTarget = $space.stagingPath
        stagingFreeBytes = $space.stagingFreeBytes
        outputDrive = $space.outputDrive
        outputFreeBytes = $space.outputFreeBytes
        fridaVersion = $observerPreflightRecord.fridaVersion
        observerSelfTest = $observerPreflightRecord.fridaObserverSelfTest
        sourceBoundCallsiteOffset = $observerPreflightRecord.expectedCallsiteOffset
        sourceBoundCallsiteBytes = $observerPreflightRecord.expectedCallsiteBytes
        runnerPreflight = 'passed'
        currentAARONProcesses = 0
    } | ConvertTo-Json -Compress -Depth 6
    return
}

if (-not $AllowAARONInjectionAfterCrash) {
    throw 'Frida 17.23.3 crashed two source-bound AARON runs in frida-agent.dll before script load. Use the REA/no-TF native route. Only pass -AllowAARONInjectionAfterCrash after materially changing and separately validating the agent/runtime conditions.'
}

if (Test-Path -LiteralPath $logRoot) { throw "Triplet log root already exists: $logRoot" }
New-Item -ItemType Directory -Path $logRoot -ErrorAction Stop | Out-Null
$runnerSha256 = (Get-FileHash -LiteralPath $runnerScript -Algorithm SHA256).Hash.ToLowerInvariant()
$runs = [ordered]@{}

function New-RunRoot([string]$RunId) {
    Assert-NoAaronProcess
    $prepared = @(& $prepareScript -RunId $RunId -Mode $mode -BaseRoot $baseFullPath)
    if ($prepared.Count -ne 1) {
        throw "Fresh output-root preparation failed for $RunId"
    }
    $root = [IO.Path]::GetFullPath(([string]$prepared[0]).Trim())
    if (Test-Path -LiteralPath $root) { throw "Prepared output root already exists: $root" }
    return $root
}

function Invoke-Control([string]$Role, [string]$RunId) {
    Assert-NoAaronProcess
    $root = New-RunRoot $RunId
    $stdout = Join-Path $logRoot "$Role.runner.stdout.txt"
    $stderr = Join-Path $logRoot "$Role.runner.stderr.txt"
    $runnerArgs = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $runnerScript, '-ExtractedRoot', $extractedPath, '-OutputRoot', $root,
        '-RunId', $RunId, '-Mode', $mode, '-RunSeconds', [string]$RunSeconds)
    & $powerShellExe @runnerArgs 1> $stdout 2> $stderr
    $runnerExitCode = $LASTEXITCODE
    if ($runnerExitCode -ne 0) { throw "$Role oracle runner exited $runnerExitCode; inspect $stderr and preserve $root" }
    Assert-NoAaronProcess
    $summaryPath = Join-Path $root 'summary.json'
    if (-not (Test-Path -LiteralPath $summaryPath -PathType Leaf)) { throw "$Role summary is missing: $summaryPath" }
    $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
    if ($summary.runId -cne $RunId -or $summary.complete -ne $true -or
        $summary.probeCompletionSatisfied -ne $true -or $summary.mode -cne $mode -or
        $summary.smallImage -ne $false -or $summary.preSceneProbeSha256 -ne $null -or
        $summary.runnerSha256 -cne $runnerSha256) {
        throw "$Role runner summary is incomplete or not an uninstrumented full-resolution control"
    }
    $runs[$Role] = $root
    return $root
}

try {
    $beforeRoot = Invoke-Control 'before' $beforeId
    Assert-NoAaronProcess

    $observerStdout = Join-Path $logRoot 'observer-coordinator.stdout.txt'
    $observerStderr = Join-Path $logRoot 'observer-coordinator.stderr.txt'
    $observerArgs = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $observerScript, '-ExtractedRoot', $extractedPath, '-BaseRoot', $baseFullPath,
        '-RunPrefix', $RunPrefix, '-RunSeconds', [string]$RunSeconds,
        '-PauseSeconds', [string]$PauseSeconds, '-ObserverTimeoutSeconds', [string]$ObserverTimeoutSeconds)
    $observerArgs += '-AllowAARONInjectionAfterCrash'
    & $powerShellExe @observerArgs 1> $observerStdout 2> $observerStderr
    $observerExitCode = $LASTEXITCODE
    if ($observerExitCode -ne 0) { throw "Frida observer coordinator exited $observerExitCode; inspect $observerStderr" }
    Assert-NoAaronProcess
    $observerLines = @(Get-Content -LiteralPath $observerStdout)
    $observerRootLine = @($observerLines | Where-Object { $_ -cmatch '^OBSERVER_ROOT=' })
    $contextLine = @($observerLines | Where-Object { $_ -cmatch '^CAPTURE_CONTEXT=' })
    if ($observerRootLine.Count -ne 1 -or $contextLine.Count -ne 1) {
        throw "Frida observer coordinator did not publish one observer root and capture context; inspect $observerStdout"
    }
    $observerRoot = [IO.Path]::GetFullPath($observerRootLine[0].Substring('OBSERVER_ROOT='.Length))
    $contextPath = [IO.Path]::GetFullPath($contextLine[0].Substring('CAPTURE_CONTEXT='.Length))
    $runs['observer'] = $observerRoot

    $afterRoot = Invoke-Control 'after' $afterId
    Assert-NoAaronProcess

    $genericStdout = Join-Path $logRoot 'triplet-verifier.stdout.txt'
    $genericStderr = Join-Path $logRoot 'triplet-verifier.stderr.txt'
    $genericArgs = @($genericVerifier, $beforeRoot, $observerRoot, $afterRoot)
    & $node.Source @genericArgs 1> $genericStdout 2> $genericStderr
    $genericExitCode = $LASTEXITCODE
    if ($genericExitCode -ne 0) { throw "Fresh uninstrumented triplet comparison failed ($genericExitCode); inspect $genericStderr" }

    $fridaStdout = Join-Path $logRoot 'frida-validator.stdout.txt'
    $fridaStderr = Join-Path $logRoot 'frida-validator.stderr.txt'
    $fridaArgs = @($fridaVerifier, $beforeRoot, $observerRoot, $afterRoot, $contextPath)
    & $node.Source @fridaArgs 1> $fridaStdout 2> $fridaStderr
    $fridaExitCode = $LASTEXITCODE
    if ($fridaExitCode -ne 0) { throw "Source-bound Frida triplet validation failed ($fridaExitCode); inspect $fridaStderr" }

    $resultPath = Join-Path $logRoot 'triplet-result.json'
    $result = [ordered]@{
        schema = 'aaron-premium-pick-frida-triplet-run-v1'
        status = 'validated'
        tripletId = $tripletId
        mode = $mode
        validatedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
        beforeRoot = $beforeRoot
        observerRoot = $observerRoot
        afterRoot = $afterRoot
        captureContext = $contextPath
        genericVerifierOutputSha256 = (Get-FileHash -LiteralPath $genericStdout -Algorithm SHA256).Hash.ToLowerInvariant()
        fridaVerifierOutputSha256 = (Get-FileHash -LiteralPath $fridaStdout -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $resultStream = [IO.File]::Open($resultPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $resultBytes = [Text.UTF8Encoding]::new($false, $true).GetBytes((ConvertTo-Json -InputObject $result -Depth 8))
        $resultStream.Write($resultBytes, 0, $resultBytes.Length); $resultStream.Flush($true)
    } finally { $resultStream.Dispose() }
    Write-Output "TRIPLET_ID=$tripletId"
    Write-Output "BEFORE_ROOT=$beforeRoot"
    Write-Output "OBSERVER_ROOT=$observerRoot"
    Write-Output "AFTER_ROOT=$afterRoot"
    Write-Output "CAPTURE_CONTEXT=$contextPath"
    Write-Output "RESULT=$resultPath"
    Get-Content -LiteralPath $fridaStdout
} catch {
    if (Test-Path -LiteralPath $logRoot -PathType Container) {
        $failurePath = Join-Path $logRoot 'triplet-failure.json'
        if (-not (Test-Path -LiteralPath $failurePath)) {
            [ordered]@{
                schema = 'aaron-premium-pick-frida-triplet-run-v1'
                status = 'failed-or-incomplete'
                tripletId = $tripletId
                mode = $mode
                failedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
                runs = $runs
                error = $_.Exception.Message
            } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $failurePath -Encoding UTF8
        }
    }
    throw
}
