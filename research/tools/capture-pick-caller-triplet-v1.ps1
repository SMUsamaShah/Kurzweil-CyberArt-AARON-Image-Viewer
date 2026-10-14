# Serial, source-bound PICK dispatch-slot capture: fresh no-probe control,
# READY-paused observer, fresh no-probe control. Never runs two AARON instances
# at once, never removes pre-existing C:\temp files, and never changes time.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$MapPath,
    [string]$ExtractedRoot = 'research\extracted\aaron',
    [string]$BaseRoot = 'C:\AaronOracleRuns',
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,24}$')] [string]$RunPrefix = 'pick-caller-triplet-v1',
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
$captureScript = Join-Path $repoRoot 'research\tools\capture-pick-caller.ps1'
$probePath = Join-Path $repoRoot 'research\introspection\pick-native-links.cl'
$probeOutputName = 'aaron-pick-native-links.txt'
$probeReady = 'READY pick-native-links'
$probeEnd = 'END pick-native-links'
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
$logRoot = Join-Path $repoRoot "research\extracted\local-oracle\pick-caller-triplet-v1-logs\$tripletId"
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
    # Windows PowerShell 5.1 can return a null ExitCode unless the Process
    # handle is materialized before WaitForExit, even after a clean child exit.
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
            if ($request.schemaVersion -ne 1 -or $request.runId -cne $RunId -or
                $request.probeSha256 -cne $probeSha256 -or $request.runnerSha256 -cne $runnerSha256 -or
                $request.releaseFile -cne $releasePath -or $request.requiredProbeOutputName -cne $probeOutputName -or
                $request.requiredProbeEndMarker -cne $probeEnd -or $request.pauseSeconds -ne $PauseSeconds -or
                @($request.probeOutputNames).Count -ne 1 -or $request.probeOutputNames[0] -cne $probeOutputName -or
                $request.runtimeExecutable -cne (Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe')) {
                throw 'Observer request does not bind this exact PICK probe, runner, runtime, and pause'
            }
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
    $exitCode = $Runner.Process.ExitCode
    if ($null -eq $exitCode) { throw "$Role runner exit code unavailable after its bounded wait; inspect $($Runner.Stdout) and $($Runner.Stderr)" }
    if ($exitCode -ne 0) { throw "$Role runner exited $exitCode; inspect $($Runner.Stderr)" }
    Assert-NoAaronProcess
}

function Convert-Hex32([string]$Value, [string]$Label) {
    if ($Value -cnotmatch '^0x[0-9a-fA-F]{1,8}$') { throw "$Label is not a bounded 32-bit address" }
    return [uint64][Convert]::ToUInt32($Value.Substring(2), 16)
}

function Get-BytesSha256([byte[]]$Bytes) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

function Assert-PickDispatchReport([object]$Report, [string]$RunId, [string]$OutputRoot, [byte[]]$MetadataBytes) {
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
    if ($null -eq $MetadataBytes -or $MetadataBytes.Length -eq 0) { throw 'PICK READY metadata snapshot is empty' }
    $metadataRaw = [Text.UTF8Encoding]::new($false, $true).GetString($MetadataBytes)
    $readyStart = $metadataRaw.IndexOf($probeReady, [StringComparison]::Ordinal)
    $readyLineEnd = if ($readyStart -ge 0) { $metadataRaw.IndexOf([char]10, $readyStart) } else { -1 }
    if ($readyLineEnd -lt 0) { throw 'PICK metadata has no complete READY line for report binding' }
    $readyPrefixBytes = [Text.UTF8Encoding]::new($false, $true).GetBytes($metadataRaw.Substring(0, $readyLineEnd + 1))
    $readyPrefixSha256 = Get-BytesSha256 $readyPrefixBytes
    if ($Report.schemaVersion -ne 3 -or $Report.targetFunction -cne 'PICK' -or
        $Report.oracleRunId -cne $RunId -or $Report.expectedMode -cne $mode -or
        $Report.runtimeExecutable -cne (Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe') -or
        $Report.sourceProbeSha256 -cne $probeSha256 -or $Report.stagedProbeSha256 -cne $probeSha256 -or
        $Report.runnerSha256 -cne $runnerSha256 -or
        $Report.requestSha256 -cne (Get-FileHash -LiteralPath $requestPath -Algorithm SHA256).Hash.ToLowerInvariant() -or
        $Report.metadataSha256 -cne $readyPrefixSha256 -or
        $Report.sourceMapSha256 -cne (Get-FileHash -LiteralPath $mapFullPath -Algorithm SHA256).Hash.ToLowerInvariant() -or
        $Report.captureHelperSha256 -cne $captureHelperSha256 -or
        $Report.currentPllSha256 -cne $runtimeManifest['AARON.pll'].sha256 -or
        $Report.outcome -cne 'entry-hit' -or $null -eq $Report.hit -or
        $null -eq $Report.ediRelativeSlotRead -or $null -eq $Report.immediateCallSite -or
        -not $Report.immediateCallSite.matchesCurrentPll -or
        $Report.immediateCallSite.encoding -cne 'x86 indirect near CALL [EDI+0x27]') {
        throw 'PICK dispatch-slot report is not a schemaVersion 3 capture bound to this paused source run'
    }
    $pickFunctions = @($Report.liveFunctions | Where-Object { [string]$_.name -ceq 'PICK' })
    if ($pickFunctions.Count -ne 1) { throw 'PICK dispatch-slot report has no unique live-validated PICK entry' }
    $pickEntry = Convert-Hex32 ([string]$pickFunctions[0].entry) 'PICK live entry'
    $hitEntry = Convert-Hex32 ([string]$Report.hit.entry) 'Breakpoint entry'
    $hitEip = Convert-Hex32 ([string]$Report.hit.eip) 'Stopped instruction pointer'
    $edi = Convert-Hex32 ([string]$Report.hit.edi) 'Stopped EDI'
    $slot = $Report.ediRelativeSlotRead
    $slotAddress = Convert-Hex32 ([string]$slot.address) 'EDI-relative slot address'
    $slotTarget = Convert-Hex32 ([string]$slot.targetValue) 'EDI-relative slot target'
    $targetMatchesPickEntry = ($slotTarget -eq $pickEntry)
    if ($hitEntry -ne $pickEntry -or $hitEip -ne $hitEntry -or
        $slot.baseRegister -cne 'EDI' -or $slot.baseValue -cne $Report.hit.edi -or
        $slot.offset -cne '0x27' -or $slotAddress -ne ($edi + 0x27) -or
        [string]$slot.bytesHex -cnotmatch '^[0-9a-f]{8}$' -or
        [bool]$slot.targetMatchesPickEntry -ne [bool]$targetMatchesPickEntry -or
        -not $slot.capturedAtPickEntryBeforePrologue -or
        $slot.liveCallSite.address -cne $Report.immediateCallSite.address -or
        $slot.liveCallSite.encoding -cne 'x86 indirect near CALL [EDI+0x27]') {
        throw 'PICK ediRelativeSlotRead is inconsistent with the stopped EDI, PICK entry, or live [EDI+0x27] call site'
    }
}

function Invoke-PickCallerHelper([string]$OutputRoot, [string]$RunId, [byte[]]$ReadyMetadataBytes) {
    $stdout = Join-Path $logRoot 'observer.helper.stdout.txt'
    $stderr = Join-Path $logRoot 'observer.helper.stderr.txt'
    $argumentValues = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $captureScript,
        '-OracleOutputRoot', $OutputRoot, '-MapPath', $mapFullPath, '-ExpectedMode', $mode,
        '-Seconds', [string]$CaptureSeconds, '-CaptureDispatchSlot')
    $line = ($argumentValues | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
    $helper = Start-Process -FilePath $powerShellExe -ArgumentList $line -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $helper.Handle
    if (-not $helper.WaitForExit(($CaptureSeconds + 300) * 1000)) { throw "PICK caller helper timed out; logs: $stdout, $stderr" }
    $helper.Refresh()
    $helperExitCode = $helper.ExitCode
    if ($null -eq $helperExitCode) { throw "PICK caller helper exit code unavailable after its bounded wait; inspect $stdout and $stderr" }
    if ($helperExitCode -ne 0) { throw "PICK caller helper exited $helperExitCode; inspect $stderr" }
    $reportPath = Join-Path $OutputRoot 'pick-native-caller.json'
    $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    Assert-PickDispatchReport $report $RunId $OutputRoot $ReadyMetadataBytes
    return [pscustomobject]@{
        path = $reportPath
        sha256 = (Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant()
        helperProcess = [ordered]@{ executable = $powerShellExe; processId = $helper.Id; exitCode = $helperExitCode; stdout = $stdout; stderr = $stderr; captureDispatchSlot = $true }
        report = $report
    }
}
function Release-ObserverIfOwned([string]$OutputRoot) {
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    if (-not (Test-Path -LiteralPath $requestPath) -or (Test-Path -LiteralPath $releasePath)) { return }
    try {
        $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
        $expectedRuntime = [IO.Path]::GetFullPath((Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe'))
        $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
        $owned = @($all | Where-Object { $_.Path -in (Get-PathAliases $request.runtimeExecutable) })
        if ($all.Count -eq 1 -and $owned.Count -eq 1 -and $request.runId -eq (Split-Path -Leaf $OutputRoot) -and
            $request.schemaVersion -eq 1 -and $request.probeSha256 -eq $probeSha256 -and
            $request.runnerSha256 -eq $runnerSha256 -and $request.requiredProbeOutputName -eq $probeOutputName -and
            $request.requiredProbeEndMarker -eq $probeEnd -and $request.releaseFile -eq $releasePath -and
            $request.runtimeExecutable -eq $expectedRuntime) {
            [IO.File]::WriteAllText($releasePath, 'PICK dispatch-slot triplet releasing its owned observer after failure')
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
    $summaryPath = Join-Path $OutputRoot 'summary.json'
    $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
    if ($summary.runId -cne $RunId -or -not $summary.complete -or $summary.mode -cne $mode -or
        $summary.smallImage -ne $false -or -not $summary.probeCompletionSatisfied -or
        $summary.runnerSha256 -cne $runnerSha256 -or $summary.installerSha256 -cne $manifest.source.sha256) {
        throw "$Role summary is incomplete or differs from this required-probe run"
    }
    # Runner completion is summary.complete plus probeCompletionSatisfied; PICK metadata ends with its required END record.
    if ($Observer) {
        if ($summary.preSceneProbeSha256 -cne $probeSha256 -or $summary.preSceneProbePauseSeconds -ne $PauseSeconds -or
            $summary.requiredProbeOutputName -cne $probeOutputName -or $summary.requiredProbeEndMarker -cne $probeEnd -or
            $summary.requiredProbeOutputSha256 -notmatch '^[0-9a-f]{64}$' -or
            @($summary.probeOutputNames).Count -ne 1 -or $summary.probeOutputNames[0] -cne $probeOutputName) {
            throw 'Observer summary does not bind the expected source probe and required terminal output'
        }
    } elseif ($summary.preSceneProbeSha256 -or @($summary.probeOutputNames).Count -ne 0 -or
        $summary.preSceneProbePauseSeconds -ne 0 -or $summary.requiredProbeOutputName -or
        $summary.requiredProbeOutputSha256 -or $summary.requiredProbeEndMarker) {
        throw "$Role is not a fresh uninstrumented no-probe control"
    }
    $runtime = [ordered]@{}
    foreach ($name in @('AARON.exe', 'AARON.pll')) {
        $record = Get-Record (Join-Path (Join-Path $OutputRoot 'runtime') $name)
        if ($record.bytes -ne $runtimeManifest[$name].bytes -or $record.sha256 -cne $runtimeManifest[$name].sha256) {
            throw "$Role runtime $name differs from the extracted manifest"
        }
        $runtime[$name] = $record
    }
    $capture = Join-Path $OutputRoot 'capture'
    $artifacts = [ordered]@{}
    foreach ($name in @('aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt')) {
        $artifacts[$name] = Get-Record (Join-Path $capture $name)
    }
    if ($summary.aa0Sha256 -cne $artifacts.aa0.sha256 -or
        $summary.sceneReportSha256 -cne $artifacts['aaron-scene-state-snapshot.txt'].sha256 -or
        $summary.probeCompletionSatisfied -ne $true -or
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
        if ($record.sha256 -cne (Get-FileHash -LiteralPath $sourceMap[$name] -Algorithm SHA256).Hash.ToLowerInvariant()) {
            throw "$Role staged source differs from current file $name"
        }
        $sources[$name] = $record
    }
    $tracePath = Join-Path $capture 'aaron-planning-call-trace.txt'
    $trace = Get-Record $tracePath
    $native = $null
    $observerProbe = $null
    if ($Observer) {
        $metadataPath = Join-Path $capture $probeOutputName
        $observerProbe = Get-Record $metadataPath
        if ($summary.requiredProbeOutputSha256 -cne $observerProbe.sha256) {
            throw 'Observer summary required-probe hash differs from the archived PICK metadata'
        }
        $rawText = [Text.UTF8Encoding]::new($false, $true).GetString([IO.File]::ReadAllBytes($metadataPath))
        $text = $rawText.Replace(([string][char]13 + [string][char]10), [string][char]10)
        if ($text.Contains([string][char]13) -or -not $text.EndsWith([string][char]10, [StringComparison]::Ordinal)) {
            throw 'Archived PICK metadata has incomplete or mixed line endings'
        }
        $lines = @($text.Substring(0, $text.Length - 1).Split([char]10))
        if ($lines.Count -lt 5 -or $lines[0] -cne 'BEGIN pick-native-links' -or
            $lines[-1] -cne $probeEnd -or $lines[-2] -cne 'NATIVE-CAPTURE-WAIT released=T' -or
            @($lines | Where-Object { $_ -ceq $probeReady }).Count -ne 1 -or
            @($lines | Where-Object { $_ -match '^SUMMARY bindings=' }).Count -ne 1 -or
            @($lines | Where-Object { $_ -ceq $probeEnd }).Count -ne 1) {
            throw 'Observer metadata lacks one READY and SUMMARY plus the released terminal END footer'
        }
        $reportPath = Join-Path $OutputRoot 'pick-native-caller.json'
        $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
        Assert-PickDispatchReport $report $RunId $OutputRoot ([IO.File]::ReadAllBytes($metadataPath))
        $native = [ordered]@{
            report = Get-Record $reportPath
            schemaVersion = $report.schemaVersion
            outcome = $report.outcome
            captureDispatchSlot = $true
            ediRelativeSlotRead = $report.ediRelativeSlotRead
            immediateCallSite = $report.immediateCallSite
        }
    }
    return [pscustomobject]@{
        role = $Role; runId = $RunId; root = $OutputRoot; summary = $summary; runtime = $runtime
        aa0Header = Get-Header (Join-Path $capture 'aa0')
        artifacts = $artifacts; sources = $sources; planningTrace = $trace
        observerProbe = $observerProbe; observerCapture = $native
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
                # Snapshot the exact READY-paused bytes before the helper releases AARON.
                # The runner later archives this file and removes its C:\temp staging copy.
                $readyMetadataBytes = [IO.File]::ReadAllBytes($metadataPath)
                $nativeHelper = Invoke-PickCallerHelper $outputRoot $runId $readyMetadataBytes
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
    if ($before.aa0Header -cne $observer.aa0Header -or $before.aa0Header -cne $after.aa0Header) {
        throw 'AA0 headers differ across the fresh source-bound triplet'
    }
    foreach ($name in $before.sources.Keys) {
        if ($observer.sources[$name].sha256 -cne $before.sources[$name].sha256 -or
            $after.sources[$name].sha256 -cne $before.sources[$name].sha256) {
            throw "Staged source differs across triplet: $name"
        }
    }
    foreach ($other in @($observer, $after)) {
        if ($other.summary.registryPatchSha256 -cne $before.summary.registryPatchSha256 -or
            $other.summary.licensePatchSha256 -cne $before.summary.licensePatchSha256 -or
            $other.summary.installerSha256 -cne $before.summary.installerSha256 -or
            $other.summary.runnerSha256 -cne $before.summary.runnerSha256) {
            throw 'Runner/runtime patch identities differ across triplet'
        }
    }
    $beforeTracePath = Join-Path (Join-Path $before.root 'capture') 'aaron-planning-call-trace.txt'
    $afterTracePath = Join-Path (Join-Path $after.root 'capture') 'aaron-planning-call-trace.txt'
    if (-not (Test-ByteEqual $beforeTracePath $afterTracePath)) {
        throw 'Uninstrumented before/after planning traces differ'
    }
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
        probePath = 'research/introspection/pick-native-links.cl'; probeSha256 = $probeSha256
        runnerSha256 = $runnerSha256; captureHelperSha256 = $captureHelperSha256
        tripletHelperSha256 = $tripletHelperSha256
        observerHelperProcess = $nativeHelper.helperProcess
        debuggerHelperSha256 = (Get-FileHash -LiteralPath (Join-Path $repoRoot 'research\oracle\AaronCallerBreakpoint.cs') -Algorithm SHA256).Hash.ToLowerInvariant()
        runs = @($runs | ForEach-Object {
            [ordered]@{
                role = $_.role; runId = $_.runId; root = & $relativeRoot $_.root
                complete = $_.summary.complete; aa0Header = $_.aa0Header
                summarySha256 = (Get-FileHash -LiteralPath (Join-Path $_.root 'summary.json') -Algorithm SHA256).Hash.ToLowerInvariant()
                summary = $_.summary; runtime = $_.runtime; artifacts = $_.artifacts; sources = $_.sources; planningTrace = $_.planningTrace
                observerProbe = $_.observerProbe; pickDispatchSlotCapture = $_.observerCapture
            }
        })
        diagnosticsPath = & $relativeRoot $logRoot
        checks = [ordered]@{ allRunsComplete = $true; observerReadyCompleteEndSourceBound = $true; artifactsMatch = $true; sixStagedSourcesMatch = $true; uninstrumentedControlTraceMatch = $true; schemaVersion3DispatchSlotCaptured = [bool]$observer.observerCapture; ediRelativeSlotReadValidated = [bool]$observer.observerCapture }
    }
    $comparisonPath = Join-Path $logRoot 'triplet-comparison.json'
    [IO.File]::WriteAllText($comparisonPath, ($comparison | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
    Write-Host "Completed PICK caller dispatch-slot triplet: $comparisonPath"
    $comparison | ConvertTo-Json -Depth 20
} catch {
    if ($null -ne $runner -and $null -ne $observerRoot) { Release-ObserverIfOwned $observerRoot }
    $preserved = if (Test-Path -LiteralPath $logRoot -PathType Container) { "All completed roots and logs remain at $logRoot." } else { 'No oracle output or triplet log root was created.' }
    if (Test-Path -LiteralPath $logRoot -PathType Container) {
        try {
            $failurePath = Join-Path $logRoot 'orchestrator-failure.txt'
            [IO.File]::WriteAllText($failurePath, ($_ | Format-List * -Force | Out-String), [Text.UTF8Encoding]::new($false))
        } catch { Write-Warning "Could not archive the parent failure record: $($_.Exception.Message)" }
    }
    Write-Error ("PICK caller dispatch-slot triplet stopped. {0} {1}" -f $preserved, $_.Exception.Message)
    throw
}
