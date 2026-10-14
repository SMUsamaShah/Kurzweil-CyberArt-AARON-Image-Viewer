# Serial, source-bound FREE-PATH call-site capture: fresh no-probe control,
# READY-paused observer, fresh no-probe control. Never runs two AARON instances
# at once, never removes pre-existing C:\temp files, and never changes time.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$MapPath,
    [string]$ExtractedRoot = 'research\extracted\aaron',
    [string]$BaseRoot = 'C:\AaronOracleRuns',
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,24}$')] [string]$RunPrefix = 'free-path-callsite-v1',
    [ValidateRange(30, 600)] [int]$RunSeconds = 240,
    [ValidateRange(10, 300)] [int]$PauseSeconds = 90,
    [ValidateRange(10, 180)] [int]$CaptureSeconds = 90,
    [ValidateRange(10, 120)] [int]$ReadyTimeoutSeconds = 45,
    [ValidateRange(10, 180)] [int]$EndTimeoutSeconds = 60,
    [switch]$AllowMeasuredWriterStreamAt30MiB,
    [switch]$AllowMeasuredWriterStreamAt26MiB
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$prepareScript = Join-Path $repoRoot 'research\tools\prepare-local-aaron-oracle-run.ps1'
$runnerScript = Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1'
$captureScript = Join-Path $repoRoot 'research\tools\capture-free-path-callsite-v1.ps1'
$probePath = Join-Path $repoRoot 'research\introspection\free-path-caller-native-links.cl'
$probeOutputName = 'aaron-free-path-caller-native-links.txt'
$probeReady = 'READY free-path-caller-native-links'
$probeEnd = 'END free-path-caller-native-links'
$releaseName = 'aaron-native-code-release.txt'
$releasePath = Join-Path 'C:\temp' $releaseName
$metadataPath = Join-Path 'C:\temp' $probeOutputName
$mode = 'writer-stream-seed-1234'
$baseFullPath = [IO.Path]::GetFullPath($BaseRoot)
$runnerSha256 = (Get-FileHash -LiteralPath $runnerScript -Algorithm SHA256).Hash.ToLowerInvariant()
$probeSha256 = (Get-FileHash -LiteralPath $probePath -Algorithm SHA256).Hash.ToLowerInvariant()
$captureHelperSha256 = (Get-FileHash -LiteralPath $captureScript -Algorithm SHA256).Hash.ToLowerInvariant()
$tripletHelperSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$mapFullPath = if ([IO.Path]::IsPathRooted($MapPath)) { (Resolve-Path -LiteralPath $MapPath).Path } else { (Resolve-Path -LiteralPath (Join-Path $repoRoot $MapPath)).Path }
$extractRoot = if ([IO.Path]::IsPathRooted($ExtractedRoot)) { (Resolve-Path -LiteralPath $ExtractedRoot).Path } else { (Resolve-Path -LiteralPath (Join-Path $repoRoot $ExtractedRoot)).Path }
$manifestPath = Join-Path $extractRoot 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$runtimeManifest = @{}
foreach ($name in @('AARON.exe', 'AARON.pll')) {
    $rows = @($manifest.files | Where-Object installedName -ceq $name)
    if ($rows.Count -ne 1) { throw "Extracted manifest must contain exactly one $name entry" }
    $runtimeManifest[$name] = $rows[0]
}
foreach ($path in @($prepareScript, $runnerScript, $captureScript, $probePath, $mapFullPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required call-site capture input is missing: $path" }
}
if ($AllowMeasuredWriterStreamAt30MiB -and $AllowMeasuredWriterStreamAt26MiB) { throw 'Select at most one measured staging allowance' }
if ($PauseSeconds -ge $RunSeconds) { throw 'PauseSeconds must be shorter than RunSeconds' }
if (-not (Test-Path -LiteralPath 'C:\temp' -PathType Container)) { throw 'C:\temp is missing; inspect its documented target and permissions' }
foreach ($name in @($probeOutputName, $releaseName)) {
    if (Test-Path -LiteralPath (Join-Path 'C:\temp' $name)) {
        throw "C:\temp already contains $name; it was left untouched. Inspect/back up it before retrying."
    }
}

$tempItem = Get-Item -LiteralPath 'C:\temp' -Force
$stagingPath = 'C:\temp'
if ($tempItem.LinkType -in @('SymbolicLink', 'Junction')) {
    $target = [string]@($tempItem.Target)[0]
    $stagingPath = if ([IO.Path]::IsPathRooted($target)) { [IO.Path]::GetFullPath($target) } else { [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $tempItem.FullName) $target)) }
}
$stagingDriveName = [IO.Path]::GetPathRoot($stagingPath).TrimEnd('\').TrimEnd(':')
$outputDriveName = [IO.Path]::GetPathRoot($baseFullPath).TrimEnd('\').TrimEnd(':')
$stagingMinimum = if ($AllowMeasuredWriterStreamAt26MiB) { 21660528 + 16KB + 5MB } elseif ($AllowMeasuredWriterStreamAt30MiB) { 30MB } else { 32MB }
$outputMinimum = if ($stagingDriveName -eq $outputDriveName) { 192MB } else { 128MB }
$extraPerFutureLeg = 5MB

$externalRuns = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'
$logStamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$nonce = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$tripletId = "$RunPrefix-$logStamp-$nonce"
$logRoot = Join-Path $repoRoot "research\extracted\local-oracle\free-path-callsite-v1-triplet-logs\$tripletId"
$powerShellExe = if ([IntPtr]::Size -eq 4 -and [Environment]::Is64BitOperatingSystem) {
    Join-Path $env:SystemRoot 'Sysnative\WindowsPowerShell\v1.0\powershell.exe'
} else { Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' }
if (-not (Test-Path -LiteralPath $powerShellExe -PathType Leaf)) { throw '64-bit Windows PowerShell is unavailable' }

# Verify the exact no-profile Windows PowerShell child and runner before making
# any run roots or touching C:\temp. The probe exits before staging or AARON.
$preflightRunId = "$tripletId-preflight"
$preflightOutputRoot = Join-Path $baseFullPath "$preflightRunId-uncreated"
$preflightLines = @(& $powerShellExe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass `
    -File $runnerScript -ExtractedRoot $extractRoot -OutputRoot $preflightOutputRoot `
    -RunId $preflightRunId -PowerShellPreflightOnly 2>&1)
$preflightExitCode = $LASTEXITCODE
if ($preflightExitCode -ne 0) {
    $preflightDiagnostic = ($preflightLines | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    throw "Windows PowerShell child preflight failed before creating run roots (exit $preflightExitCode): $preflightDiagnostic"
}
try {
    $powerShellPreflight = ($preflightLines -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop
}
catch {
    throw "Windows PowerShell child preflight returned invalid JSON before creating run roots: $($_.Exception.Message)"
}
if ($powerShellPreflight.schemaVersion -ne 1 -or $powerShellPreflight.status -cne 'ok' -or
    $powerShellPreflight.preflightOnly -ne $true -or $powerShellPreflight.runId -cne $preflightRunId -or
    $powerShellPreflight.runnerSha256 -cne $runnerSha256 -or
    $powerShellPreflight.getFileHashCommand -cne 'Get-FileHash' -or
    $powerShellPreflight.powershellVersion -notmatch '^5\.' -or
    $powerShellPreflight.is64BitProcess -ne $true -or
    $powerShellPreflight.utilityModulePath -cnotmatch 'Microsoft\.PowerShell\.Utility\.psd1$' -or
    $powerShellPreflight.utilityModuleSha256 -cnotmatch '^[0-9a-f]{64}$') {
    throw 'Windows PowerShell child preflight did not verify the expected runner, 64-bit Windows PowerShell, and utility module'
}

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$preflightReportPath = Join-Path $logRoot 'windows-powershell-preflight.json'
[IO.File]::WriteAllText($preflightReportPath, ($powerShellPreflight | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))

function ConvertTo-NativeArgument([string]$Value) {
    $builder = [Text.StringBuilder]::new(); $slashes = 0
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

function Assert-NoAaronProcess {
    $active = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
    if ($active.Count -gt 0) { throw "An AARON process is active (PID $(($active.Id) -join ', ')); refusing another oracle" }
}

function Assert-Capacity([string]$Role, [int]$RemainingLegs) {
    $requiredStage = $stagingMinimum + (($RemainingLegs - 1) * $extraPerFutureLeg)
    $requiredOutput = $RemainingLegs * $outputMinimum
    $stageFree = (Get-PSDrive -Name $stagingDriveName -PSProvider FileSystem).Free
    $outputFree = (Get-PSDrive -Name $outputDriveName -PSProvider FileSystem).Free
    if ($stagingDriveName -eq $outputDriveName) {
        if ($stageFree -lt ($requiredStage + $requiredOutput)) {
            throw "Insufficient staging/output capacity before $Role; no oracle was launched. Preserve unrelated files."
        }
    } elseif ($stageFree -lt $requiredStage -or $outputFree -lt $requiredOutput) {
        throw "Insufficient staging/output capacity before $Role; no oracle was launched. Preserve unrelated files."
    }
}

function Get-PathAliases([string]$RuntimePath) {
    $aliases = [Collections.Generic.List[string]]::new(); $full = [IO.Path]::GetFullPath($RuntimePath); $aliases.Add($full)
    if (Test-Path -LiteralPath $externalRuns) {
        $link = Get-Item -LiteralPath $externalRuns -Force
        if ($link.LinkType -in @('Junction', 'SymbolicLink') -and $link.Target) {
            $prefix = [IO.Path]::GetFullPath($externalRuns).TrimEnd('\') + '\'
            if ($full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                $relative = $full.Substring($prefix.Length)
                foreach ($target in @($link.Target)) {
                    $targetPath = [string]$target
                    if (-not [IO.Path]::IsPathRooted($targetPath)) { $targetPath = Join-Path (Split-Path -Parent $externalRuns) $targetPath }
                    $aliases.Add([IO.Path]::GetFullPath((Join-Path $targetPath $relative)))
                }
            }
        }
    }
    return @($aliases | Select-Object -Unique)
}

function Start-Run([string]$Role, [string]$RunId, [string]$OutputRoot, [bool]$Observer) {
    $argumentValues = [Collections.Generic.List[string]]::new()
    foreach ($value in @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $runnerScript,
        '-ExtractedRoot', $extractRoot, '-OutputRoot', $OutputRoot, '-RunId', $RunId, '-Mode', $mode, '-RunSeconds', [string]$RunSeconds)) { $argumentValues.Add([string]$value) }
    if ($Observer) {
        foreach ($value in @('-PreSceneProbePath', $probePath, '-PreSceneProbePauseSeconds', [string]$PauseSeconds,
            '-ProbeOutputNames', $probeOutputName, '-RequiredProbeOutputName', $probeOutputName, '-RequiredProbeEndMarker', $probeEnd)) { $argumentValues.Add([string]$value) }
    }
    $line = ($argumentValues | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
    $stdout = Join-Path $logRoot "$Role.runner.stdout.txt"; $stderr = Join-Path $logRoot "$Role.runner.stderr.txt"
    $process = Start-Process -FilePath $powerShellExe -ArgumentList $line -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $process.Handle
    return [pscustomobject]@{ Process = $process; Stdout = $stdout; Stderr = $stderr }
}

function Wait-Ready($Runner, [string]$OutputRoot, [string]$RunId) {
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    $deadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Runner.Process.Refresh()
        if ($Runner.Process.HasExited) { throw "Observer runner exited before READY; inspect $($Runner.Stderr)" }
        if ((Test-Path -LiteralPath $requestPath -PathType Leaf) -and (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
            try { $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json } catch { Start-Sleep -Milliseconds 100; continue }
            if ($request.runId -cne $RunId -or $request.probeSha256 -cne $probeSha256 -or
                $request.runnerSha256 -cne $runnerSha256 -or $request.releaseFile -cne $releasePath -or
                $request.requiredProbeOutputName -cne $probeOutputName -or $request.requiredProbeEndMarker -cne $probeEnd -or
                $request.pauseSeconds -ne $PauseSeconds) { throw 'Observer request does not bind this exact probe, runner, and pause' }
            if (Select-String -LiteralPath $metadataPath -SimpleMatch $probeReady -Quiet -ErrorAction SilentlyContinue) {
                $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
                $owned = @($all | Where-Object { $_.Path -in (Get-PathAliases $request.runtimeExecutable) })
                if ($all.Count -ne 1 -or $owned.Count -ne 1) { throw 'READY does not belong to the sole process from this run root' }
                return $request
            }
        }
        Start-Sleep -Milliseconds 200
    }
    throw "Observer did not reach READY within $ReadyTimeoutSeconds seconds"
}

function Wait-Runner($Runner, [string]$Role) {
    if (-not $Runner.Process.WaitForExit(($RunSeconds + 900) * 1000)) { throw "$Role runner exceeded its bounded wait; outputs preserved" }
    $Runner.Process.Refresh()
    $runnerExitCode = $Runner.Process.ExitCode
    if ($null -eq $runnerExitCode) { throw "$Role runner exited but its exit code was unavailable; inspect $($Runner.Stderr)" }
    if ($runnerExitCode -ne 0) { throw "$Role runner exited $runnerExitCode; inspect $($Runner.Stderr)" }
    Assert-NoAaronProcess
}

function Invoke-CallsiteHelper([string]$OutputRoot, [string]$RunId) {
    $stdout = Join-Path $logRoot 'observer.helper.stdout.txt'; $stderr = Join-Path $logRoot 'observer.helper.stderr.txt'
    $argumentValues = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $captureScript,
        '-OracleOutputRoot', $OutputRoot, '-MapPath', $mapFullPath, '-Seconds', [string]$CaptureSeconds)
    $line = ($argumentValues | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
    $helper = Start-Process -FilePath $powerShellExe -ArgumentList $line -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $helper.Handle
    if (-not $helper.WaitForExit(($CaptureSeconds + 300) * 1000)) { throw "Call-site helper timed out; logs: $stdout, $stderr" }
    $helper.Refresh()
    $helperExitCode = $helper.ExitCode
    if ($null -eq $helperExitCode) { throw "Call-site helper exited but its exit code was unavailable; inspect $stderr" }
    if ($helperExitCode -ne 0) { throw "Call-site helper exited $helperExitCode; inspect $stderr" }
    $reportPath = Join-Path $OutputRoot 'free-path-callsite-v1.json'
    $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    if ($report.schemaVersion -ne 1 -or $report.oracleRunId -cne $RunId -or
        $report.captureHelperSha256 -cne $captureHelperSha256 -or
        $report.sourceMapSha256 -cne (Get-FileHash -LiteralPath $mapFullPath -Algorithm SHA256).Hash.ToLowerInvariant() -or
        $report.outcome -notin @('three-call-sites-hit', 'partial-call-site-hits', 'no-call-site-hit') -or
        -not $report.capture.debugRegistersRestored -or
        (-not $report.capture.detached -and -not $report.capture.debugSessionEndedByTargetExit)) {
        throw 'Call-site helper report is incomplete or not bound to the fresh observer inputs'
    }
    return [pscustomobject]@{
        path = $reportPath
        sha256 = (Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant()
        helperProcess = [ordered]@{ executable = $powerShellExe; processId = $helper.Id; exitCode = $helperExitCode; stdout = $stdout; stderr = $stderr }
        report = $report
    }
}

function Release-ObserverIfOwned([string]$OutputRoot) {
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    if (-not (Test-Path -LiteralPath $requestPath) -or (Test-Path -LiteralPath $releasePath)) { return }
    try {
        $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
        $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
        $owned = @($all | Where-Object { $_.Path -in (Get-PathAliases $request.runtimeExecutable) })
        if ($all.Count -eq 1 -and $owned.Count -eq 1 -and $request.runId -eq (Split-Path -Leaf $OutputRoot) -and
            $request.probeSha256 -eq $probeSha256 -and $request.releaseFile -eq $releasePath) {
            [IO.File]::WriteAllText($releasePath, 'Versioned call-site triplet releasing its owned observer after failure')
        }
    } catch { Write-Warning "Could not safely release the owned observer: $($_.Exception.Message)" }
}

function Get-Record([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required output is missing: $Path" }
    $item = Get-Item -LiteralPath $Path
    return [ordered]@{ path = $Path; bytes = [long]$item.Length; sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
}

function Get-Header([string]$Path) {
    $reader = [IO.StreamReader]::new($Path, [Text.Encoding]::ASCII, $false)
    try { $line = $reader.ReadLine() } finally { $reader.Dispose() }
    if ($line -notmatch '^([0-9]+) ([0-9]+) ([0-9]+)$') { throw "Malformed AA0 header in $Path" }
    return $line
}

function Test-ByteEqual([string]$Left, [string]$Right) {
    if ((Get-Item -LiteralPath $Left).Length -ne (Get-Item -LiteralPath $Right).Length) { return $false }
    $a = [IO.File]::OpenRead($Left); $b = [IO.File]::OpenRead($Right)
    try {
        $leftBuffer = [byte[]]::new(65536); $rightBuffer = [byte[]]::new(65536)
        while ($true) {
            $leftCount = $a.Read($leftBuffer, 0, $leftBuffer.Length); $rightCount = $b.Read($rightBuffer, 0, $rightBuffer.Length)
            if ($leftCount -ne $rightCount) { return $false }
            if ($leftCount -eq 0) { return $true }
            for ($i = 0; $i -lt $leftCount; $i++) { if ($leftBuffer[$i] -ne $rightBuffer[$i]) { return $false } }
        }
    } finally { $a.Dispose(); $b.Dispose() }
}

function Read-Run([string]$Role, [string]$RunId, [string]$OutputRoot, [bool]$Observer) {
    $summaryPath = Join-Path $OutputRoot 'summary.json'; $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
    if ($summary.runId -cne $RunId -or -not $summary.complete -or $summary.mode -cne $mode -or
        $summary.smallImage -ne $false -or -not $summary.probeCompletionSatisfied -or
        $summary.runnerSha256 -cne $runnerSha256 -or $summary.installerSha256 -cne $manifest.source.sha256) {
        throw "$Role summary is incomplete or differs from this required-probe run"
    }
    if ($Observer) {
        if ($summary.preSceneProbeSha256 -cne $probeSha256 -or $summary.preSceneProbePauseSeconds -ne $PauseSeconds -or
            $summary.requiredProbeOutputName -cne $probeOutputName -or $summary.requiredProbeEndMarker -cne $probeEnd -or
            @($summary.probeOutputNames).Count -ne 1 -or $summary.probeOutputNames[0] -cne $probeOutputName) { throw 'Observer summary does not bind the expected source probe' }
    } elseif ($summary.preSceneProbeSha256 -or @($summary.probeOutputNames).Count -ne 0 -or
        $summary.preSceneProbePauseSeconds -ne 0 -or $summary.requiredProbeOutputName -or $summary.requiredProbeEndMarker) {
        throw "$Role is not a fresh uninstrumented no-probe control"
    }
    $runtime = [ordered]@{}
    foreach ($name in @('AARON.exe', 'AARON.pll')) {
        $record = Get-Record (Join-Path (Join-Path $OutputRoot 'runtime') $name)
        if ($record.bytes -ne $runtimeManifest[$name].bytes -or $record.sha256 -cne $runtimeManifest[$name].sha256) { throw "$Role runtime $name differs from the extracted manifest" }
        $runtime[$name] = $record
    }
    $capture = Join-Path $OutputRoot 'capture'
    $artifacts = [ordered]@{}
    foreach ($name in @('aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt')) {
        $artifacts[$name] = Get-Record (Join-Path $capture $name)
    }
    if ($summary.aa0Sha256 -cne $artifacts.aa0.sha256 -or $summary.sceneReportSha256 -cne $artifacts['aaron-scene-state-snapshot.txt'].sha256 -or
        (Get-Content -LiteralPath (Join-Path $capture 'aa0') -Tail 1) -cne 'end' -or
        -not (Select-String -LiteralPath (Join-Path $capture 'aaron-scene-state-snapshot.txt') -SimpleMatch 'END scene-state-snapshot' -Quiet)) {
        throw "$Role drawing or scene capture is incomplete or not summary-bound"
    }
    $sourceMap = [ordered]@{
        'planning-call-trace.cl' = Join-Path $repoRoot 'research\introspection\planning-call-trace.cl'
        'planning-random-seed-common.cl' = Join-Path $repoRoot 'research\oracle\planning-random-seed-common.cl'
        'scene-state-snapshot-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-seeded-1234.cl'
        'scene-state-snapshot-writer-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-seeded-1234.cl'
        'scene-state-snapshot-writer-stream-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-stream-seeded-1234.cl'
        'scene-state-snapshot.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot.cl'
    }
    $sources = [ordered]@{}
    foreach ($name in $sourceMap.Keys) {
        $record = Get-Record (Join-Path $capture $name)
        if ($record.sha256 -cne (Get-FileHash -LiteralPath $sourceMap[$name] -Algorithm SHA256).Hash.ToLowerInvariant()) { throw "$Role staged source differs from current file $name" }
        $sources[$name] = $record
    }
    $tracePath = Join-Path $capture 'aaron-planning-call-trace.txt'; $trace = Get-Record $tracePath
    $traceText = [IO.File]::ReadAllText($tracePath)
    if ($Observer -and -not $traceText.Contains('UNWRAPPED-TARGETS ("FREE-PATH")')) { throw 'Observer planning trace does not explicitly keep FREE-PATH unwrapped' }
    if (-not $Observer -and $traceText.Contains('UNWRAPPED-TARGETS')) { throw "$Role control unexpectedly changed its planning trace" }
    $native = $null
    if ($Observer) {
        $metadata = Join-Path $capture $probeOutputName
        $metadataBytes = [IO.File]::ReadAllBytes($metadata)
        $rawText = [Text.UTF8Encoding]::new($false, $true).GetString($metadataBytes)
        $text = $rawText.Replace("`r`n", "`n")
        if ($text.Contains("`r") -or -not $text.EndsWith("`n", [StringComparison]::Ordinal)) { throw 'Archived observer metadata has incomplete or mixed line endings' }
        $lines = @($text.Substring(0, $text.Length - 1).Split([char]10))
        if ($lines.Count -ne 13 -or $lines[9] -cne $probeReady -or $lines[10] -cne 'NATIVE-CAPTURE-WAIT released=T' -or
            $lines[11] -cne 'COMPLETE free-path-caller-native-links' -or $lines[12] -cne $probeEnd) { throw 'Observer report lacks complete ordered READY/wait/COMPLETE/END records' }
        $readyIndex = $rawText.IndexOf($probeReady, [StringComparison]::Ordinal)
        $rawPrefixEnd = if ($readyIndex -ge 0) { $rawText.IndexOf("`n", $readyIndex, [StringComparison]::Ordinal) } else { -1 }
        if ($rawPrefixEnd -lt 0) { throw 'Archived observer metadata has no raw READY-line terminator' }
        $nativePath = Join-Path $OutputRoot 'free-path-callsite-v1.json'
        $nativeRecord = Get-Content -LiteralPath $nativePath -Raw | ConvertFrom-Json
        $prefixBytes = [Text.UTF8Encoding]::new($false).GetBytes($rawText.Substring(0, $rawPrefixEnd + 1))
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $nativePrefixSha = ([BitConverter]::ToString($sha.ComputeHash($prefixBytes))).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose() }
        if ($nativeRecord.outcome -notin @('three-call-sites-hit', 'partial-call-site-hits', 'no-call-site-hit') -or
            $nativeRecord.oracleRunId -cne $RunId -or $nativeRecord.readyPrefixSha256 -cne $nativePrefixSha -or
            $nativeRecord.debuggerHelperSha256 -cne (Get-FileHash -LiteralPath (Join-Path $repoRoot 'research\oracle\AaronFreePathCallsitesV1.cs') -Algorithm SHA256).Hash.ToLowerInvariant() -or
            $nativeRecord.captureHelperSha256 -cne $captureHelperSha256 -or
            -not $nativeRecord.capture.debugRegistersRestored -or
            (-not $nativeRecord.capture.detached -and -not $nativeRecord.capture.debugSessionEndedByTargetExit)) {
            throw 'Observer call-site report is not bound to complete READY metadata or safe native cleanup'
        }
        $native = [ordered]@{ report = Get-Record $nativePath; outcome = $nativeRecord.outcome; captureError = $nativeRecord.capture.captureError; chronology = $nativeRecord.capture.chronology; sites = $nativeRecord.capture.sites }
    }
    return [pscustomobject]@{
        role = $Role; runId = $RunId; root = $OutputRoot; summary = $summary; runtime = $runtime
        aa0Header = Get-Header (Join-Path $capture 'aa0'); artifacts = $artifacts; sources = $sources
        planningTrace = $trace; observerNative = $native
    }
}

function New-RunRoot([string]$RunId) {
    Assert-NoAaronProcess
    $prepareParams = @{ RunId = $RunId; Mode = $mode; BaseRoot = $baseFullPath }
    if ($AllowMeasuredWriterStreamAt30MiB) { $prepareParams.AllowMeasuredWriterStreamAt30MiB = $true }
    if ($AllowMeasuredWriterStreamAt26MiB) { $prepareParams.AllowMeasuredWriterStreamAt26MiB = $true }
    $made = @(& $prepareScript @prepareParams)
    if ($made.Count -ne 1) { throw "Run preparation did not return one fresh root for $RunId" }
    return [IO.Path]::GetFullPath(([string]$made[0]).Trim())
}

$runs = [Collections.Generic.List[object]]::new()
$runner = $null
$observerRoot = $null
$nativeHelper = $null
try {
    $roles = @('before', 'observer', 'after')
    for ($leg = 0; $leg -lt $roles.Count; $leg++) {
        $role = $roles[$leg]
        Assert-Capacity $role (3 - $leg)
        Assert-NoAaronProcess
        if ($role -eq 'observer') {
            foreach ($reserved in @($probeOutputName, $releaseName)) {
                if (Test-Path -LiteralPath (Join-Path 'C:\temp' $reserved)) { throw "C:\temp now contains $reserved; preserving it and refusing the observer" }
            }
        }
        $runId = "$tripletId-$role"
        $outputRoot = New-RunRoot $runId
        if ($role -eq 'observer') { $observerRoot = $outputRoot }
        $runner = Start-Run $role $runId $outputRoot ($role -eq 'observer')
        try {
            if ($role -eq 'observer') {
                [void](Wait-Ready $runner $outputRoot $runId)
                $nativeHelper = Invoke-CallsiteHelper $outputRoot $runId
                $archivedMetadataPath = Join-Path (Join-Path $outputRoot 'capture') $probeOutputName
                $hasProbeEnd = {
                    ((Test-Path -LiteralPath $metadataPath -PathType Leaf) -and
                        (Get-Content -LiteralPath $metadataPath -Tail 1 -ErrorAction SilentlyContinue) -ceq $probeEnd) -or
                    ((Test-Path -LiteralPath $archivedMetadataPath -PathType Leaf) -and
                        (Get-Content -LiteralPath $archivedMetadataPath -Tail 1 -ErrorAction SilentlyContinue) -ceq $probeEnd)
                }
                $endDeadline = [DateTime]::UtcNow.AddSeconds($EndTimeoutSeconds)
                $endSeen = $false
                while ([DateTime]::UtcNow -lt $endDeadline) {
                    $endSeen = [bool](& $hasProbeEnd)
                    if ($endSeen) { break }
                    $runner.Process.Refresh()
                    if ($runner.Process.HasExited) {
                        # Runner cleanup removes the C:\temp staging copy after it
                        # archives the completed report. Check both paths on exit.
                        $flushDeadline = [DateTime]::UtcNow.AddSeconds(2)
                        while ([DateTime]::UtcNow -lt $flushDeadline) {
                            $endSeen = [bool](& $hasProbeEnd)
                            if ($endSeen) { break }
                            Start-Sleep -Milliseconds 100
                        }
                        if ($endSeen) { break }
                        throw 'Observer runner exited before probe END'
                    }
                    Start-Sleep -Milliseconds 200
                }
                if (-not $endSeen) { throw 'Observer probe did not reach its required terminal END in staging or archived output' }
            }
            Wait-Runner $runner $role
        } catch {
            if ($role -eq 'observer') { Release-ObserverIfOwned $outputRoot }
            try { Wait-Runner $runner "$role cleanup" } catch { Write-Warning "Runner/logs preserved: $($_.Exception.Message)" }
            throw
        }
        $runs.Add((Read-Run $role $runId $outputRoot ($role -eq 'observer')))
        $runner = $null
        Assert-NoAaronProcess
    }

    $before = $runs[0]; $observer = $runs[1]; $after = $runs[2]
    foreach ($name in $before.artifacts.Keys) {
        foreach ($other in @($observer, $after)) {
            $left = Join-Path (Join-Path $before.root 'capture') $name
            $right = Join-Path (Join-Path $other.root 'capture') $name
            if (-not (Test-ByteEqual $left $right)) { throw "Fresh control mismatch in drawing/scene artifact $name" }
        }
    }
    if ($before.aa0Header -cne $observer.aa0Header -or $before.aa0Header -cne $after.aa0Header) { throw 'AA0 headers differ across the fresh source-bound triplet' }
    foreach ($name in $before.sources.Keys) {
        if ($observer.sources[$name].sha256 -cne $before.sources[$name].sha256 -or $after.sources[$name].sha256 -cne $before.sources[$name].sha256) { throw "Staged source differs across triplet: $name" }
    }
    foreach ($other in @($observer, $after)) {
        if ($other.summary.registryPatchSha256 -cne $before.summary.registryPatchSha256 -or
            $other.summary.licensePatchSha256 -cne $before.summary.licensePatchSha256 -or
            $other.summary.installerSha256 -cne $before.summary.installerSha256 -or
            $other.summary.runnerSha256 -cne $before.summary.runnerSha256) { throw 'Runner/runtime patch identities differ across triplet' }
    }
    $beforeTracePath = Join-Path (Join-Path $before.root 'capture') 'aaron-planning-call-trace.txt'
    $afterTracePath = Join-Path (Join-Path $after.root 'capture') 'aaron-planning-call-trace.txt'
    if (-not (Test-ByteEqual -Left $beforeTracePath -Right $afterTracePath)) { throw 'Uninstrumented before/after planning traces differ' }
    if ($observer.planningTrace.sha256 -eq $before.planningTrace.sha256 -or $observer.planningTrace.sha256 -eq $after.planningTrace.sha256) { throw 'Expected observer-only FREE-PATH-unwrapped planning trace to differ' }

    $relativeRoot = { param($path)
        $full = [IO.Path]::GetFullPath($path)
        $prefix = [IO.Path]::GetFullPath($repoRoot).TrimEnd('\') + '\'
        if ($full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $full.Substring($prefix.Length).Replace('\', '/') }
        return $full
    }
    $comparison = [ordered]@{
        schemaVersion = 1; tripletId = $tripletId; mode = $mode; aa0Header = $before.aa0Header
        aa0Dimensions = (($before.aa0Header -split ' ') | ForEach-Object { [int]$_ })
        powershellPreflight = [ordered]@{
            reportPath = & $relativeRoot $preflightReportPath
            reportSha256 = (Get-FileHash -LiteralPath $preflightReportPath -Algorithm SHA256).Hash.ToLowerInvariant()
            result = $powerShellPreflight
        }
        mapPath = if ($mapFullPath.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) { & $relativeRoot $mapFullPath } else { $mapFullPath }
        mapSha256 = (Get-FileHash -LiteralPath $mapFullPath -Algorithm SHA256).Hash.ToLowerInvariant()
        probePath = 'research/introspection/free-path-caller-native-links.cl'; probeSha256 = $probeSha256
        runnerSha256 = $runnerSha256; captureHelperSha256 = $captureHelperSha256
        tripletHelperSha256 = $tripletHelperSha256
        debuggerHelperSha256 = (Get-FileHash -LiteralPath (Join-Path $repoRoot 'research\oracle\AaronFreePathCallsitesV1.cs') -Algorithm SHA256).Hash.ToLowerInvariant()
        nativeStatic = [ordered]@{
            syntheticPeSha256 = '70f11471b178d1526a74348b158ab68f8a4657ac2a4997bf84eb4dc783f42cf7'
            payloadSha256 = '93b018cb03d3d8cec18eaaa4cd813d7c4cdfa32bb02b5f3a5b11a4b51feea787'
            sites = @(
                [ordered]@{ offset = '0x39a'; bytes = 'ff5727'; instruction = 'CALL dword ptr [EDI+0x27]'; reaStatus = 'computed-call-target-unresolved' }
                [ordered]@{ offset = '0x3ac'; bytes = '7f52'; instruction = 'JG +0x400'; reaStatus = 'CALLIND-result-flows-through-compare-to-branch' }
                [ordered]@{ offset = '0x3e4'; bytes = 'ff5727'; instruction = 'CALL dword ptr [EDI+0x27]'; reaStatus = 'computed-call-target-unresolved' }
            )
            valueFlow = 'REA trace has 623 nodes, 552 edges, and 81 unknown call targets; +0x39a CALLIND output in EAX reaches the compare and conditional branch at +0x3ac, while +0x3e4 CALLIND has no modeled output.'
            limitation = 'Computed target/caller and Lisp helper remain unresolved; the runtime capture reports separate first hits and does not associate +0x3e4 causally with the +0x3ac branch.'
        }
        runs = @($runs | ForEach-Object {
            [ordered]@{
                role = $_.role; runId = $_.runId; root = & $relativeRoot $_.root
                complete = $_.summary.complete; aa0Header = $_.aa0Header
                summarySha256 = (Get-FileHash -LiteralPath (Join-Path $_.root 'summary.json') -Algorithm SHA256).Hash.ToLowerInvariant()
                summary = $_.summary; runtime = $_.runtime; artifacts = $_.artifacts; sources = $_.sources; planningTrace = $_.planningTrace
                callsiteCapture = $_.observerNative
            }
        })
        diagnosticsPath = & $relativeRoot $logRoot
        checks = [ordered]@{ allRunsComplete = $true; observerReadyEndSourceBound = $true; artifactsMatch = $true; sixStagedSourcesMatch = $true; bracketPlanningTracesMatch = $true; debuggerRegistersRestored = [bool]$observer.observerNative }
    }
    $comparisonPath = Join-Path $logRoot 'triplet-comparison.json'
    [IO.File]::WriteAllText($comparisonPath, ($comparison | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
    Write-Host "Completed FREE-PATH call-site v1 capture triplet: $comparisonPath"
    $comparison | ConvertTo-Json -Depth 20
} catch {
    if ($null -ne $runner -and $null -ne $observerRoot) { Release-ObserverIfOwned $observerRoot }
    $preserved = if (Test-Path -LiteralPath $logRoot -PathType Container) { "All completed roots and logs remain at $logRoot." } else { 'No oracle output or triplet log root was created.' }
    Write-Error ("FREE-PATH call-site triplet stopped. {0} {1}" -f $preserved, $_.Exception.Message)
    throw
}
