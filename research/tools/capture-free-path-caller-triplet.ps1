[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MapPath,

    [string]$ExtractedRoot = 'research\extracted\aaron',

    [string]$BaseRoot = 'C:\AaronOracleRuns',

    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,24}$')]
    [string]$RunPrefix = 'free-path-caller',

    [ValidateRange(30, 600)]
    [int]$RunSeconds = 240,

    [ValidateRange(10, 300)]
    [int]$PauseSeconds = 90,

    [ValidateRange(10, 180)]
    [int]$CaptureSeconds = 90,

    [ValidateRange(10, 120)]
    [int]$ReadyTimeoutSeconds = 45,

    [ValidateRange(10, 180)]
    [int]$EndTimeoutSeconds = 60,

    [switch]$AllowMeasuredWriterStreamAt30MiB,

    [switch]$AllowMeasuredWriterStreamAt26MiB
)

# Capture fresh writer-stream-seed-1234 before/observer/after runs. Only the
# observer loads free-path-caller-native-links.cl, which requests the trace's
# documented FREE-PATH unwrapped mode before the seeded trace is loaded.
# This script never changes the machine clock and never runs two AARON
# processes concurrently. It leaves every run root and log in place on error.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$prepareScript = Join-Path $repoRoot 'research\tools\prepare-local-aaron-oracle-run.ps1'
$runnerScript = Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1'
$captureScript = Join-Path $repoRoot 'research\tools\capture-free-path-caller.ps1'
$probePath = Join-Path $repoRoot 'research\introspection\free-path-caller-native-links.cl'
$probeOutputName = 'aaron-free-path-caller-native-links.txt'
$probeReady = 'READY free-path-caller-native-links'
$probeEnd = 'END free-path-caller-native-links'
$mode = 'writer-stream-seed-1234'
$baseFullPath = [IO.Path]::GetFullPath($BaseRoot)
$runnerSha256 = (Get-FileHash -LiteralPath $runnerScript -Algorithm SHA256).Hash.ToLowerInvariant()

function Resolve-InputPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repoRoot $Path }
    return (Resolve-Path -LiteralPath $candidate).Path
}

$mapFullPath = Resolve-InputPath $MapPath
$extractRoot = Resolve-InputPath $ExtractedRoot
$captureHelperSha256 = (Get-FileHash -LiteralPath $captureScript -Algorithm SHA256).Hash.ToLowerInvariant()
$manifestPath = Join-Path $extractRoot 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Extracted runtime manifest is missing: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$manifestRuntimeFiles = @{}
foreach ($name in @('AARON.exe', 'AARON.pll')) {
    $matches = @($manifest.files | Where-Object { $_.installedName -ceq $name })
    if ($matches.Count -ne 1) { throw "Extracted manifest must have exactly one $name entry" }
    $manifestRuntimeFiles[$name] = $matches[0]
}

foreach ($requiredPath in @($prepareScript, $runnerScript, $captureScript, $probePath, $mapFullPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required caller-triplet input is missing: $requiredPath"
    }
}
if ($AllowMeasuredWriterStreamAt30MiB -and $AllowMeasuredWriterStreamAt26MiB) {
    throw 'Choose at most one measured writer-stream staging allowance'
}
if ($PauseSeconds -ge $RunSeconds) {
    throw 'PauseSeconds must be less than RunSeconds'
}
if (-not (Test-Path -LiteralPath 'C:\temp' -PathType Container)) {
    throw 'AARON requires an existing C:\temp path; inspect its documented symlink target and permissions'
}
$writeProbe = Join-Path 'C:\temp' ('.aaron-caller-triplet-write-probe-' + [Guid]::NewGuid().ToString('N') + '.tmp')
if (Test-Path -LiteralPath $writeProbe) { throw 'The unique C:\temp write-probe path unexpectedly exists' }
try {
    [IO.File]::WriteAllText($writeProbe, 'AARON caller triplet staging preflight')
} catch {
    throw ('C:\temp exists but this PowerShell execution context cannot write there. ' +
        'Use the documented scoped-elevation path for the oracle runner; do not change the symlink target or ACL. ' +
        $_.Exception.Message)
} finally {
    if (Test-Path -LiteralPath $writeProbe -PathType Leaf) {
        Remove-Item -LiteralPath $writeProbe -Force
    }
}

$tempItem = Get-Item -LiteralPath 'C:\temp' -Force
$stagingPath = 'C:\temp'
if ($tempItem.LinkType -in @('SymbolicLink', 'Junction')) {
    $target = [string]@($tempItem.Target)[0]
    if ([IO.Path]::IsPathRooted($target)) {
        $stagingPath = [IO.Path]::GetFullPath($target)
    } else {
        $stagingPath = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $tempItem.FullName) $target))
    }
}
$stagingDriveName = [IO.Path]::GetPathRoot($stagingPath).TrimEnd('\').TrimEnd(':')
$outputDriveName = [IO.Path]::GetPathRoot($baseFullPath).TrimEnd('\').TrimEnd(':')
$writerStreamPeakBytes = 21660528
$writerStreamProbeAllowance = 16KB
$writerStreamSafetyMargin = 5MB
$singleRunStagingMinimum = if ($AllowMeasuredWriterStreamAt26MiB) {
    $writerStreamPeakBytes + $writerStreamProbeAllowance + $writerStreamSafetyMargin
} elseif ($AllowMeasuredWriterStreamAt30MiB) {
    30MB
} else {
    32MB
}
$singleRunOutputMinimum = if ($stagingDriveName -eq $outputDriveName) { 192MB } else { 128MB }
$tripletStagingReservePerFutureLeg = 5MB

function Assert-TripletCapacity {
    param(
        [Parameter(Mandatory = $true)][string]$Role,
        [Parameter(Mandatory = $true)][ValidateRange(1, 3)][int]$RemainingLegs
    )

    # The 2026-10-13 attempt began only 31 KiB above the exact single-run
    # floor. After its complete before control, ordinary volume growth left
    # too little for the observer. Preserve the single-run floor and reserve
    # one additional existing 5 MiB safety margin for each later leg.
    $requiredStaging = $singleRunStagingMinimum +
        (($RemainingLegs - 1) * $tripletStagingReservePerFutureLeg)
    $requiredOutput = $RemainingLegs * $singleRunOutputMinimum
    $stagingFree = (Get-PSDrive -Name $stagingDriveName -PSProvider FileSystem).Free
    $outputFree = (Get-PSDrive -Name $outputDriveName -PSProvider FileSystem).Free

    if ($stagingDriveName -eq $outputDriveName) {
        $requiredCombined = $requiredStaging + $requiredOutput
        if ($stagingFree -lt $requiredCombined) {
            throw ("Caller triplet stopped before {0}: C:\temp resolves to {1} on drive {2}: with {3:N1} MiB free; " -f `
                $Role, $stagingPath, $stagingDriveName, ($stagingFree / 1MB)) +
                ("the {0}-leg reserve requires {1:N1} MiB for staging and retained output roots. " -f `
                    $RemainingLegs, ($requiredCombined / 1MB)) +
                'No new oracle was launched. Free space without deleting unrelated files, then rerun the triplet.'
        }
        return
    }

    if ($stagingFree -lt $requiredStaging) {
        throw ("Caller triplet stopped before {0}: C:\temp resolves to {1} on drive {2}: with {3:N1} MiB free; " -f `
            $Role, $stagingPath, $stagingDriveName, ($stagingFree / 1MB)) +
            ("the {0}-leg reserve requires {1:N1} MiB for staging. " -f `
                $RemainingLegs, ($requiredStaging / 1MB)) +
            'No new oracle was launched. Free space without deleting unrelated files, then rerun the triplet.'
    }
    if ($outputFree -lt $requiredOutput) {
        throw ("Caller triplet stopped before {0}: output drive {1}: has {2:N1} MiB free; " -f `
            $Role, $outputDriveName, ($outputFree / 1MB)) +
            ("the {0}-leg reserve requires {1:N1} MiB for retained output roots. " -f `
                $RemainingLegs, ($requiredOutput / 1MB)) +
            'No new oracle was launched. Use an output drive with enough free space; do not delete existing run roots.'
    }
}

# Fail before creating any output root or running the first control if the
# serial triplet cannot retain all three captures and finish its staging steps.
Assert-TripletCapacity -Role 'initial preflight' -RemainingLegs 3

# The child runner must use this same PowerShell executable. Do not route
# through a shell command string; quote each native argument for CreateProcess.
if (-not [Environment]::Is64BitProcess) {
    throw 'The caller capture requires a fresh x64 PowerShell child; start this driver from 64-bit PowerShell'
}
$powerShellExe = (Get-Process -Id $PID).Path
if ([IO.Path]::GetFileName($powerShellExe) -notin @('powershell.exe', 'pwsh.exe')) {
    throw "The current host cannot relaunch a -File script: $powerShellExe"
}

function ConvertTo-NativeArgument {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

    $builder = [Text.StringBuilder]::new()
    [void]$builder.Append('"')
    $slashes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') {
            $slashes++
            continue
        }
        if ($character -eq '"') {
            if ($slashes -gt 0) { [void]$builder.Append(('\' * (2 * $slashes))) }
            [void]$builder.Append('\"')
            $slashes = 0
            continue
        }
        if ($slashes -gt 0) {
            [void]$builder.Append(('\' * $slashes))
            $slashes = 0
        }
        [void]$builder.Append($character)
    }
    if ($slashes -gt 0) { [void]$builder.Append(('\' * (2 * $slashes))) }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Assert-NoAaronProcess {
    $active = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
    if ($active.Count -gt 0) {
        $ids = ($active | ForEach-Object Id) -join ', '
        throw "An AARON process is still active (PID $ids); the next original-runtime run is blocked"
    }
}

function Get-RuntimePathAliases {
    param([Parameter(Mandatory = $true)][string]$RuntimePath)

    $aliases = [Collections.Generic.List[string]]::new()
    $fullRuntime = [IO.Path]::GetFullPath($RuntimePath)
    $aliases.Add($fullRuntime)
    $externalRunLink = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'
    if (Test-Path -LiteralPath $externalRunLink) {
        $link = Get-Item -LiteralPath $externalRunLink -Force
        if ($link.LinkType -in @('Junction', 'SymbolicLink') -and $link.Target) {
            $linkPath = [IO.Path]::GetFullPath($externalRunLink).TrimEnd('\') + '\'
            if ($fullRuntime.StartsWith($linkPath, [StringComparison]::OrdinalIgnoreCase)) {
                $relativeRuntime = $fullRuntime.Substring($linkPath.Length)
                foreach ($target in @($link.Target)) {
                    $targetPath = [string]$target
                    if (-not [IO.Path]::IsPathRooted($targetPath)) {
                        $targetPath = Join-Path (Split-Path -Parent $externalRunLink) $targetPath
                    }
                    $aliases.Add([IO.Path]::GetFullPath((Join-Path $targetPath $relativeRuntime)))
                }
            }
        }
    }
    return @($aliases | Select-Object -Unique)
}

function New-RunRoot {
    param([Parameter(Mandatory = $true)][string]$RunId)

    Assert-NoAaronProcess
    $prepareParameters = @{
        RunId = $RunId
        Mode = $mode
        BaseRoot = $baseFullPath
    }
    if ($AllowMeasuredWriterStreamAt30MiB) {
        $prepareParameters.AllowMeasuredWriterStreamAt30MiB = $true
    }
    if ($AllowMeasuredWriterStreamAt26MiB) {
        $prepareParameters.AllowMeasuredWriterStreamAt26MiB = $true
    }
    $prepared = @(& $prepareScript @prepareParameters)
    if ($prepared.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$prepared[0])) {
        throw "Oracle preparation did not return exactly one fresh output root for $RunId"
    }
    return [IO.Path]::GetFullPath(([string]$prepared[0]).Trim())
}

function New-RunnerArgumentLine {
    param(
        [Parameter(Mandatory = $true)][string]$OutputRoot,
        [Parameter(Mandatory = $true)][string]$RunId,
        [switch]$Observer
    )

    $arguments = [Collections.Generic.List[string]]::new()
    foreach ($value in @(
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $runnerScript,
        '-ExtractedRoot', $extractRoot,
        '-OutputRoot', $OutputRoot,
        '-RunId', $RunId,
        '-Mode', $mode,
        '-RunSeconds', [string]$RunSeconds
    )) { $arguments.Add([string]$value) }

    if ($Observer) {
        foreach ($value in @(
            '-PreSceneProbePath', $probePath,
            '-PreSceneProbePauseSeconds', [string]$PauseSeconds,
            '-ProbeOutputNames', $probeOutputName,
            '-RequiredProbeOutputName', $probeOutputName,
            '-RequiredProbeEndMarker', $probeEnd
        )) { $arguments.Add([string]$value) }
    }
    return (($arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
}

function Start-OracleRunner {
    param(
        [Parameter(Mandatory = $true)][string]$Role,
        [Parameter(Mandatory = $true)][string]$OutputRoot,
        [Parameter(Mandatory = $true)][string]$RunId,
        [Parameter(Mandatory = $true)][string]$LogRoot,
        [switch]$Observer
    )

    $stdout = Join-Path $LogRoot "$Role.stdout.txt"
    $stderr = Join-Path $LogRoot "$Role.stderr.txt"
    $argumentLine = New-RunnerArgumentLine -OutputRoot $OutputRoot -RunId $RunId -Observer:$Observer
    $process = Start-Process -FilePath $powerShellExe -ArgumentList $argumentLine `
        -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    return [pscustomobject]@{ Process = $process; Stdout = $stdout; Stderr = $stderr }
}

function Wait-OracleRunner {
    param(
        [Parameter(Mandatory = $true)]$Runner,
        [Parameter(Mandatory = $true)][string]$Role
    )

    # The local runner has its own RunSeconds watchdog. Allow archival and
    # registry restoration time after it stops the owned AARON process.
    $timeoutSeconds = $RunSeconds + 900
    $waitMilliseconds = [Math]::Min([int]::MaxValue, $timeoutSeconds * 1000)
    if (-not $Runner.Process.WaitForExit($waitMilliseconds)) {
        throw "$Role runner exceeded its bounded wait; it and all evidence were left untouched"
    }
    $Runner.Process.Refresh()
    if ($Runner.Process.ExitCode -ne 0) {
        throw "$Role runner exited with code $($Runner.Process.ExitCode); inspect $($Runner.Stdout) and $($Runner.Stderr)"
    }
    Assert-NoAaronProcess
}

function Wait-ForObserverReady {
    param(
        [Parameter(Mandatory = $true)]$Runner,
        [Parameter(Mandatory = $true)][string]$OutputRoot
    )

    $metadataPath = Join-Path 'C:\temp' $probeOutputName
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    $deadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    $requestBound = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        $Runner.Process.Refresh()
        if ($Runner.Process.HasExited) {
            throw "Observer runner exited before metadata READY; inspect $($Runner.Stdout) and $($Runner.Stderr)"
        }
        if (Test-Path -LiteralPath $requestPath -PathType Leaf) {
            try { $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json }
            catch { Start-Sleep -Milliseconds 100; continue }
            $expectedProbeHash = (Get-FileHash -LiteralPath $probePath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($request.runId -ne (Split-Path -Leaf $OutputRoot) -or
                $request.probeSha256 -ne $expectedProbeHash -or
                $request.requiredProbeOutputName -ne $probeOutputName -or
                $request.requiredProbeEndMarker -ne $probeEnd -or
                $request.pauseSeconds -ne $PauseSeconds) {
                throw 'Observer request does not bind the intended fresh run and FREE-PATH probe'
            }
            $requestBound = $true
        }
        if ((Test-Path -LiteralPath $metadataPath -PathType Leaf) -and
            $requestBound -and
            (Select-String -LiteralPath $metadataPath -SimpleMatch $probeReady -Quiet -ErrorAction SilentlyContinue)) {
            $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
            if ($request.runId -ne (Split-Path -Leaf $OutputRoot)) {
                throw 'FREE-PATH metadata READY is not bound to the active run'
            }
            $aliases = Get-RuntimePathAliases $request.runtimeExecutable
            $allAaron = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
            $owned = @($allAaron | Where-Object { $_.Path -in $aliases })
            if ($allAaron.Count -ne 1 -or $owned.Count -ne 1) {
                throw 'Metadata READY did not belong to the single AARON process for this fresh run'
            }
            return $metadataPath
        }
        Start-Sleep -Milliseconds 200
    }
    throw "Observer metadata did not reach READY within $ReadyTimeoutSeconds seconds; inspect $($Runner.Stdout) and $($Runner.Stderr)"
}

function Wait-ForObserverEnd {
    param(
        [Parameter(Mandatory = $true)]$Runner,
        [Parameter(Mandatory = $true)][string]$OutputRoot
    )

    $stagedReport = Join-Path 'C:\temp' $probeOutputName
    $archivedReport = Join-Path (Join-Path $OutputRoot 'capture') $probeOutputName
    $deadline = [DateTime]::UtcNow.AddSeconds($EndTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        foreach ($reportPath in @($stagedReport, $archivedReport)) {
            if ((Test-Path -LiteralPath $reportPath -PathType Leaf) -and
                (Get-Content -LiteralPath $reportPath -Tail 1 -ErrorAction SilentlyContinue) -ceq $probeEnd) {
                return $reportPath
            }
        }
        $Runner.Process.Refresh()
        if ($Runner.Process.HasExited) {
            throw "Observer runner exited without the terminal $probeEnd marker"
        }
        Start-Sleep -Milliseconds 200
    }
    throw "Observer probe did not reach terminal $probeEnd within $EndTimeoutSeconds seconds"
}

function Release-OwnedObserverIfNeeded {
    param([Parameter(Mandatory = $true)][string]$OutputRoot)

    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    $releasePath = 'C:\temp\aaron-native-code-release.txt'
    if (-not (Test-Path -LiteralPath $requestPath -PathType Leaf) -or
        (Test-Path -LiteralPath $releasePath)) { return }
    try {
        $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
        $runtimeAliases = Get-RuntimePathAliases $request.runtimeExecutable
        $processes = @(Get-Process -Name AARON -ErrorAction SilentlyContinue | Where-Object {
            $_.Path -in $runtimeAliases
        })
        if ($processes.Count -eq 1 -and
            $request.releaseFile -eq 'C:\temp\aaron-native-code-release.txt' -and
            $request.probeSha256 -eq (Get-FileHash -LiteralPath $probePath -Algorithm SHA256).Hash.ToLowerInvariant()) {
            [IO.File]::WriteAllText($releasePath,
                'FREE-PATH caller orchestrator releasing the owned paused observer after capture failure')
        }
    } catch {
        Write-Warning "Could not safely release the owned FREE-PATH observer: $($_.Exception.Message)"
    }
}

function Invoke-CallerCapture {
    param(
        [Parameter(Mandatory = $true)][string]$OutputRoot,
        [Parameter(Mandatory = $true)][string]$LogRoot
    )

    $helperStdout = Join-Path $LogRoot 'observer-caller-helper.stdout.txt'
    $helperStderr = Join-Path $LogRoot 'observer-caller-helper.stderr.txt'
    $helperArguments = @(
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $captureScript,
        '-OracleOutputRoot', $OutputRoot,
        '-MapPath', $mapFullPath,
        '-Seconds', [string]$CaptureSeconds
    )
    $helperArgumentLine = ($helperArguments | ForEach-Object {
        ConvertTo-NativeArgument ([string]$_)
    }) -join ' '
    $helperProcess = Start-Process -FilePath $powerShellExe -ArgumentList $helperArgumentLine `
        -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $helperStdout -RedirectStandardError $helperStderr
    $helperWaitMilliseconds = ($CaptureSeconds + 300) * 1000
    if (-not $helperProcess.WaitForExit($helperWaitMilliseconds)) {
        throw "Fresh x64 caller helper exceeded its bounded wait; logs are retained at $helperStdout and $helperStderr"
    }
    $helperProcess.Refresh()
    $helperDiagnostics = [ordered]@{
        executable = $powerShellExe
        x64 = $true
        processId = $helperProcess.Id
        exitStatus = $helperProcess.ExitCode
        sourcePath = $captureScript
        sourceSha256 = $captureHelperSha256
        stdout = Get-FileRecord $helperStdout
        stderr = Get-FileRecord $helperStderr
    }
    $script:callerHelperDiagnostics = $helperDiagnostics
    if ($helperProcess.ExitCode -ne 0) {
        throw "Fresh x64 caller helper exited with code $($helperProcess.ExitCode); inspect $helperStderr"
    }

    $callerReportPath = Join-Path $OutputRoot 'free-path-native-caller.json'
    if (-not (Test-Path -LiteralPath $callerReportPath -PathType Leaf)) {
        throw 'FREE-PATH caller helper returned without its source-bound report'
    }
    $callerReport = Get-Content -LiteralPath $callerReportPath -Raw | ConvertFrom-Json
    if ($callerReport.oracleRunId -ne (Split-Path -Leaf $OutputRoot) -or
        $callerReport.outcome -notin @('entry-hit', 'no-entry-within-deadline') -or
        $callerReport.captureHelperSha256 -ne $captureHelperSha256 -or
        $callerReport.sourceMapSha256 -ne
            (Get-FileHash -LiteralPath $mapFullPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
        throw 'FREE-PATH helper report is not a supported, source-bound bounded capture result'
    }
    if ($callerReport.outcome -eq 'entry-hit') {
        if (-not $callerReport.hit -or -not $callerReport.immediateReturn.address -or
            $callerReport.immediateReturn.address -cne $callerReport.hit.returnAddress) {
            throw 'FREE-PATH entry hit lacks its direct stack return address'
        }
    } else {
        $noHitReason = [string]$callerReport.captureError
        if ($callerReport.hit -or $callerReport.immediateReturn -or
            [string]::IsNullOrWhiteSpace($noHitReason) -or
            -not $noHitReason.Contains('No selected entry breakpoint observed within the deadline')) {
            throw 'FREE-PATH no-hit result lacks the expected bounded deadline reason'
        }
    }
    $callerReportFile = Get-FileRecord $callerReportPath
    $entryHit = $callerReport.outcome -eq 'entry-hit'
    $uniqueDrawCform = $entryHit -and
        $callerReport.immediateReturn.status -ceq 'unique-mapped-interval' -and
        $callerReport.immediateReturn.function -ceq 'DRAW-CFORM'
    return [pscustomobject]@{
        report = $callerReport
        reportFile = $callerReportFile
        helperProcess = $helperDiagnostics
        entryHit = [bool]$entryHit
        callerIdentified = [bool]$uniqueDrawCform
        immediateReturnUniquelyResolvesToDrawCform = [bool]$uniqueDrawCform
    }
}

function Get-FileRecord {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required completed-run artifact is missing: $Path"
    }
    $item = Get-Item -LiteralPath $Path
    return [pscustomobject]@{
        path = $Path
        bytes = [long]$item.Length
        sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

function Test-FilesByteEqual {
    param(
        [Parameter(Mandatory = $true)][string]$LeftPath,
        [Parameter(Mandatory = $true)][string]$RightPath
    )

    $leftInfo = Get-Item -LiteralPath $LeftPath
    $rightInfo = Get-Item -LiteralPath $RightPath
    if ($leftInfo.Length -ne $rightInfo.Length) { return $false }
    $left = $null
    $right = $null
    try {
        $left = [IO.File]::OpenRead($LeftPath)
        $right = [IO.File]::OpenRead($RightPath)
        $leftBuffer = [byte[]]::new(65536)
        $rightBuffer = [byte[]]::new(65536)
        while ($true) {
            $leftCount = $left.Read($leftBuffer, 0, $leftBuffer.Length)
            $rightCount = $right.Read($rightBuffer, 0, $rightBuffer.Length)
            if ($leftCount -ne $rightCount) { return $false }
            if ($leftCount -eq 0) { return $true }
            for ($index = 0; $index -lt $leftCount; $index++) {
                if ($leftBuffer[$index] -ne $rightBuffer[$index]) { return $false }
            }
        }
    } finally {
        if ($null -ne $left) { $left.Dispose() }
        if ($null -ne $right) { $right.Dispose() }
    }
}

function Get-Aa0Header {
    param([Parameter(Mandatory = $true)][string]$Path)
    $reader = [IO.StreamReader]::new($Path, [Text.Encoding]::ASCII, $false)
    try { $header = $reader.ReadLine() } finally { $reader.Dispose() }
    if ($header -notmatch '^([0-9]+) ([0-9]+) ([0-9]+)$') {
        throw "AA0 header is malformed: $Path"
    }
    return $header
}

function Read-CompletedRun {
    param(
        [Parameter(Mandatory = $true)][string]$Role,
        [Parameter(Mandatory = $true)][string]$RunId,
        [Parameter(Mandatory = $true)][string]$OutputRoot,
        [switch]$Observer
    )

    $summaryPath = Join-Path $OutputRoot 'summary.json'
    if (-not (Test-Path -LiteralPath $summaryPath -PathType Leaf)) {
        throw "$Role has no final runner summary; preserve and inspect $OutputRoot"
    }
    $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
    if ($summary.runId -ne $RunId -or $summary.complete -ne $true -or
        $summary.mode -ne $mode -or $summary.smallImage -ne $false -or
        $summary.probeCompletionSatisfied -ne $true) {
        throw "$Role summary is incomplete or does not match the requested full-resolution $mode run"
    }
    if ($summary.runnerSha256 -ne $runnerSha256) {
        throw "$Role summary runner hash differs from the current required-probe runner source"
    }
    if ($summary.installerSha256 -ne $manifest.source.sha256) {
        throw "$Role summary installer hash differs from the extracted-runtime manifest"
    }
    if ($Observer) {
        if ($summary.preSceneProbeSha256 -ne
            (Get-FileHash -LiteralPath $probePath -Algorithm SHA256).Hash.ToLowerInvariant() -or
            @($summary.probeOutputNames).Count -ne 1 -or
            $summary.probeOutputNames[0] -ne $probeOutputName -or
            $summary.preSceneProbePauseSeconds -ne $PauseSeconds -or
            $summary.requiredProbeOutputName -ne $probeOutputName -or
            $summary.requiredProbeEndMarker -ne $probeEnd) {
            throw 'Observer summary does not bind the expected FREE-PATH probe, pause, and terminal marker'
        }
    } elseif ($summary.preSceneProbeSha256 -or @($summary.probeOutputNames).Count -ne 0 -or
        $summary.preSceneProbePauseSeconds -ne 0 -or
        $summary.requiredProbeOutputName -or $summary.requiredProbeEndMarker) {
        throw "$Role was not an uninstrumented no-probe control"
    }

    $captureRoot = Join-Path $OutputRoot 'capture'
    $runtimeFiles = [ordered]@{}
    foreach ($name in @('AARON.exe', 'AARON.pll')) {
        $runtimeFile = Get-FileRecord (Join-Path (Join-Path $OutputRoot 'runtime') $name)
        $manifestEntry = $manifestRuntimeFiles[$name]
        if ($runtimeFile.bytes -ne [long]$manifestEntry.bytes -or
            $runtimeFile.sha256 -ne $manifestEntry.sha256) {
            throw "$Role output runtime $name differs from the extracted manifest"
        }
        $runtimeFiles[$name] = $runtimeFile
    }
    $artifacts = [ordered]@{}
    foreach ($name in @('aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt',
                        'aaron-random-seed-loaded.txt')) {
        $artifacts[$name] = Get-FileRecord (Join-Path $captureRoot $name)
    }
    if ($summary.aa0Sha256 -ne $artifacts['aa0'].sha256 -or
        $summary.sceneReportSha256 -ne $artifacts['aaron-scene-state-snapshot.txt'].sha256) {
        throw "$Role summary hashes do not match its captured AA0 or scene report"
    }

    $sourceNames = @(
        'planning-call-trace.cl',
        'planning-random-seed-common.cl',
        'scene-state-snapshot-seeded-1234.cl',
        'scene-state-snapshot-writer-seeded-1234.cl',
        'scene-state-snapshot-writer-stream-seeded-1234.cl',
        'scene-state-snapshot.cl'
    )
    $sourcePaths = @{
        'planning-call-trace.cl' = Join-Path $repoRoot 'research\introspection\planning-call-trace.cl'
        'planning-random-seed-common.cl' = Join-Path $repoRoot 'research\oracle\planning-random-seed-common.cl'
        'scene-state-snapshot-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-seeded-1234.cl'
        'scene-state-snapshot-writer-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-seeded-1234.cl'
        'scene-state-snapshot-writer-stream-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-stream-seeded-1234.cl'
        'scene-state-snapshot.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot.cl'
    }
    $sources = [ordered]@{}
    foreach ($name in $sourceNames) {
        $sources[$name] = Get-FileRecord (Join-Path $captureRoot $name)
        $currentHash = (Get-FileHash -LiteralPath $sourcePaths[$name] -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($sources[$name].sha256 -ne $currentHash) {
            throw "$Role staged source differs from the current repository file: $name"
        }
    }

    $tracePath = Join-Path $captureRoot 'aaron-planning-call-trace.txt'
    $traceRecord = Get-FileRecord $tracePath
    $traceText = [IO.File]::ReadAllText($tracePath)
    if ($Observer) {
        if (-not $traceText.Contains('UNWRAPPED-TARGETS ("FREE-PATH")')) {
            throw 'Observer planning trace does not explicitly identify FREE-PATH as unwrapped'
        }
        $metadataPath = Join-Path $captureRoot $probeOutputName
        $metadata = [IO.File]::ReadAllText($metadataPath).Replace("`r`n", "`n")
        $requiredMetadata = @(
            'BEGIN free-path-caller-native-links',
            'INSTALL targets=2 mode=READ-ONLY-METADATA',
            'TOTALS targets=2 functions=2 headers=2 errors=0 truncations=0',
            'ERROR-COUNT 0',
            'TRUNCATION-COUNT 0',
            $probeReady,
            'COMPLETE free-path-caller-native-links',
            $probeEnd
        )
        foreach ($line in $requiredMetadata) {
            if (-not $metadata.Contains($line)) { throw "Observer metadata is incomplete: missing $line" }
        }
        $terminalMetadataLine = $metadata.TrimEnd([char[]]@("`r", "`n")).Split("`n")[-1]
        if ($terminalMetadataLine -cne $probeEnd) {
            throw 'Observer native metadata does not end with its required END record'
        }
        $stagedProbePath = Join-Path $captureRoot 'aaron-pre-scene-probe.cl'
        $stagedProbe = Get-FileRecord $stagedProbePath
        if ($stagedProbe.sha256 -ne $summary.preSceneProbeSha256) {
            throw 'Archived staged observer probe hash differs from the runner summary'
        }
    } elseif ($traceText.Contains('UNWRAPPED-TARGETS')) {
        throw "$Role planning trace unexpectedly records an unwrapped target"
    }

    return [pscustomobject]@{
        role = $Role
        runId = $RunId
        outputRoot = $OutputRoot
        summary = $summary
        runtimeFiles = $runtimeFiles
        artifacts = $artifacts
        sources = $sources
        planningTrace = $traceRecord
        planningTraceText = $traceText
        aa0Header = Get-Aa0Header (Join-Path $captureRoot 'aa0')
    }
}

$stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$nonce = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$tripletId = "$RunPrefix-$stamp-$nonce"
$logRoot = Join-Path $repoRoot "research\extracted\local-oracle\caller-triplet-logs\$tripletId"
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

$runRecords = [Collections.Generic.List[object]]::new()
$roles = @('before', 'observer', 'after')
$callerCapture = $null
$script:callerHelperDiagnostics = $null
try {
    foreach ($role in $roles) {
        $remainingLegs = 3 - $runRecords.Count
        Assert-TripletCapacity -Role $role -RemainingLegs $remainingLegs
        $runId = "$tripletId-$role"
        $outputRoot = New-RunRoot -RunId $runId
        Write-Host ("Starting {0} control: {1}" -f $role, $outputRoot)

        $isObserver = $role -eq 'observer'
        if ($isObserver) {
            foreach ($reserved in @($probeOutputName, 'aaron-native-code-release.txt')) {
                $path = Join-Path 'C:\temp' $reserved
                if (Test-Path -LiteralPath $path) {
                    throw "C:\temp already contains $reserved; it was left untouched. Inspect and back it up before moving it."
                }
            }
        }
        Assert-TripletCapacity -Role "$role launch" -RemainingLegs $remainingLegs
        $runner = Start-OracleRunner -Role $role -OutputRoot $outputRoot `
            -RunId $runId -LogRoot $logRoot -Observer:$isObserver
        try {
            if ($isObserver) {
                [void](Wait-ForObserverReady -Runner $runner -OutputRoot $outputRoot)
                Write-Host 'FREE-PATH metadata READY; attaching the mapped native caller capture.'
                $callerCapture = Invoke-CallerCapture -OutputRoot $outputRoot -LogRoot $logRoot
                [void](Wait-ForObserverEnd -Runner $runner -OutputRoot $outputRoot)
            }
            Wait-OracleRunner -Runner $runner -Role $role
        } catch {
            if ($isObserver) { Release-OwnedObserverIfNeeded -OutputRoot $outputRoot }
            try { Wait-OracleRunner -Runner $runner -Role "$role cleanup" }
            catch { Write-Warning "The $role runner remains for diagnosis: $($_.Exception.Message)" }
            throw
        }

        Assert-NoAaronProcess
        $runRecords.Add((Read-CompletedRun -Role $role -RunId $runId `
            -OutputRoot $outputRoot -Observer:$isObserver))
    }

    $before = $runRecords[0]
    $observer = $runRecords[1]
    $after = $runRecords[2]

    foreach ($name in $before.artifacts.Keys) {
        $pairs = @(
            [pscustomobject]@{ left = $before; right = $observer }
            [pscustomobject]@{ left = $before; right = $after }
        )
        foreach ($pair in $pairs) {
            $left = Join-Path (Join-Path $pair.left.outputRoot 'capture') $name
            $right = Join-Path (Join-Path $pair.right.outputRoot 'capture') $name
            if (-not (Test-FilesByteEqual -LeftPath $left -RightPath $right)) {
                throw "Before/observer/after bytes differ for required artifact $name"
            }
        }
    }
    if ($before.aa0Header -cne $observer.aa0Header -or $before.aa0Header -cne $after.aa0Header) {
        throw 'AA0 header differs among the before/observer/after captures'
    }

    foreach ($name in $before.sources.Keys) {
        $expected = $before.sources[$name].sha256
        if ($observer.sources[$name].sha256 -ne $expected -or $after.sources[$name].sha256 -ne $expected) {
            throw "The six staged Lisp source hashes differ among runs: $name"
        }
    }

    if (-not (Test-FilesByteEqual `
        -LeftPath (Join-Path (Join-Path $before.outputRoot 'capture') 'aaron-planning-call-trace.txt') `
        -RightPath (Join-Path (Join-Path $after.outputRoot 'capture') 'aaron-planning-call-trace.txt'))) {
        throw 'The bracketing uninstrumented planning traces differ'
    }
    if ($observer.planningTrace.sha256 -eq $before.planningTrace.sha256 -or
        $observer.planningTrace.sha256 -eq $after.planningTrace.sha256) {
        throw 'Expected the observer-only unwrapped FREE-PATH planning trace to differ from both controls'
    }

    $aa0HeaderFields = $before.aa0Header -split ' '
    $comparison = [ordered]@{
        schemaVersion = 1
        tripletId = $tripletId
        mode = $mode
        aa0Header = $before.aa0Header
        aa0Dimensions = [ordered]@{
            width = [int]$aa0HeaderFields[0]
            height = [int]$aa0HeaderFields[1]
            thirdHeaderValue = [int]$aa0HeaderFields[2]
        }
        smallImageFlag = [bool]$before.summary.smallImage
        mapPath = $mapFullPath
        mapSha256 = (Get-FileHash -LiteralPath $mapFullPath -Algorithm SHA256).Hash.ToLowerInvariant()
        probePath = $probePath
        probeSha256 = (Get-FileHash -LiteralPath $probePath -Algorithm SHA256).Hash.ToLowerInvariant()
        measuredStagingAllowance = if ($AllowMeasuredWriterStreamAt26MiB) { '26MiB' }
            elseif ($AllowMeasuredWriterStreamAt30MiB) { '30MiB' } else { 'default-32MiB' }
        stagingBudget = [ordered]@{
            singleRunMinimumBytes = $singleRunStagingMinimum
            extraReservePerFutureLegBytes = $tripletStagingReservePerFutureLeg
            initialThreeLegStagingMinimumBytes = $singleRunStagingMinimum +
                (2 * $tripletStagingReservePerFutureLeg)
            outputMinimumBytesPerRoot = $singleRunOutputMinimum
            initialThreeRootOutputMinimumBytes = 3 * $singleRunOutputMinimum
        }
        runs = @($runRecords | ForEach-Object {
            [ordered]@{
                role = $_.role
                runId = $_.runId
                outputRoot = $_.outputRoot
                complete = $_.summary.complete
                aa0Header = $_.aa0Header
                runtimeFiles = $_.runtimeFiles
                artifacts = $_.artifacts
                stagedSourceHashes = $_.sources
                planningTrace = $_.planningTrace
            }
        })
        callerCapture = [ordered]@{
            report = $callerCapture.reportFile
            helperProcess = $callerCapture.helperProcess
            outcome = $callerCapture.report.outcome
            immediateReturn = $callerCapture.report.immediateReturn
            captureError = $callerCapture.report.captureError
            entryHit = $callerCapture.entryHit
            callerIdentified = $callerCapture.callerIdentified
            immediateReturnUniquelyResolvesToDrawCform = $callerCapture.immediateReturnUniquelyResolvesToDrawCform
            identifiedCallerName = if ($callerCapture.callerIdentified) {
                'DRAW-CFORM'
            } else {
                $null
            }
        }
        checks = [ordered]@{
            aa0HeaderAndBytesMatch = $true
            imageBytesMatch = $true
            imageIdBytesMatch = $true
            sceneStateReportBytesMatch = $true
            randomSeedLoadedReportBytesMatch = $true
            sixStagedSourceHashesMatch = $true
            bracketPlanningTracesMatch = $true
            observerPlanningTraceExplicitlyUnwrapsFreePath = $true
            observerOnlyPlanningTraceDifference = $true
            callerEntryHitCaptured = $callerCapture.entryHit
            callerIdentified = $callerCapture.callerIdentified
        }
        diagnosticsPath = $logRoot
    }
    $comparisonPath = Join-Path $logRoot 'triplet-comparison.json'
    [IO.File]::WriteAllText($comparisonPath,
        ($comparison | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
    Write-Host "Completed source-bound FREE-PATH caller triplet: $comparisonPath"
    $comparison | ConvertTo-Json -Depth 12
} catch {
    Write-Error ("FREE-PATH caller triplet failed. All completed roots and diagnostics were retained under {0}. {1}" -f `
        $logRoot, $_.Exception.Message)
    throw
}
