[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,63}$')]
    [string]$RunId,

    [string]$ExtractedRoot = 'research\extracted\aaron',
    [string]$BaseRoot = 'C:\AaronOracleRuns',
    [ValidateRange(45, 180)] [int]$PauseSeconds = 75,
    [ValidateRange(90, 600)] [int]$RunSeconds = 180,
    [switch]$AllowMeasuredWriterStreamAt30MiB,
    [switch]$AllowMeasuredWriterStreamAt26MiB
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($AllowMeasuredWriterStreamAt30MiB -and $AllowMeasuredWriterStreamAt26MiB) {
    throw 'Choose only one measured writer-stream staging allowance'
}
if ($PauseSeconds -ge $RunSeconds) { throw 'PauseSeconds must be less than RunSeconds' }
if (Get-Process AARON -ErrorAction SilentlyContinue) {
    throw 'An AARON process is already active; do not overlap original-runtime runs'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$extractedPath = if ([IO.Path]::IsPathRooted($ExtractedRoot)) {
    $ExtractedRoot
} else { Join-Path $repoRoot $ExtractedRoot }
$extracted = (Resolve-Path -LiteralPath $extractedPath).Path
$extractedManifestPath = Join-Path $extracted 'manifest.json'
if (-not (Test-Path -LiteralPath $extractedManifestPath -PathType Leaf)) {
    throw 'The extracted AARON source manifest is missing'
}
$extractedManifest = Get-Content -LiteralPath $extractedManifestPath -Raw | ConvertFrom-Json
$manifestExe = @($extractedManifest.files | Where-Object { $_.installedName -eq 'AARON.exe' })
$manifestPll = @($extractedManifest.files | Where-Object { $_.installedName -eq 'AARON.pll' })
if ($manifestExe.Count -ne 1 -or $manifestPll.Count -ne 1) {
    throw 'The extracted manifest must identify exactly one AARON.exe and AARON.pll'
}
$extractedExePath = Join-Path $extracted 'application\AARON.exe'
$extractedPllPath = Join-Path $extracted 'application\AARON.pll'
foreach ($item in @(
    [pscustomobject]@{ Path = $extractedExePath; Manifest = $manifestExe[0] }
    [pscustomobject]@{ Path = $extractedPllPath; Manifest = $manifestPll[0] }
)) {
    if (-not (Test-Path -LiteralPath $item.Path -PathType Leaf) -or
        (Get-Item -LiteralPath $item.Path).Length -ne $item.Manifest.bytes -or
        (Get-FileHash -LiteralPath $item.Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Manifest.sha256) {
        throw "Extracted source differs from its manifest: $($item.Path)"
    }
}
$probe = Join-Path $repoRoot 'research\introspection\free-path-caller-native-links.cl'
$prepare = Join-Path $repoRoot 'research\tools\prepare-local-aaron-oracle-run.ps1'
$runner = Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1'
$capture = Join-Path $repoRoot 'research\tools\capture-aaron-native-code.ps1'
$mapper = Join-Path $repoRoot 'research\tools\map-native-code-to-pll.mjs'
foreach ($path in @($probe, $prepare, $runner, $capture, $mapper)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required FREE-PATH native-map input is missing: $path"
    }
}

$probeName = 'aaron-free-path-caller-native-links.txt'
$ready = 'READY free-path-caller-native-links'
$end = 'END free-path-caller-native-links'
$metadataPath = Join-Path 'C:\temp' $probeName
$prepareArguments = @{
    RunId = $RunId
    Mode = 'writer-stream-seed-1234'
    BaseRoot = $BaseRoot
}
if ($AllowMeasuredWriterStreamAt30MiB) {
    $prepareArguments.AllowMeasuredWriterStreamAt30MiB = $true
}
if ($AllowMeasuredWriterStreamAt26MiB) {
    $prepareArguments.AllowMeasuredWriterStreamAt26MiB = $true
}
$outputRoot = [string](& $prepare @prepareArguments)
if (-not $outputRoot) { throw 'Fresh oracle output-root preparation returned no path' }
$output = [IO.Path]::GetFullPath($outputRoot)
if (Test-Path -LiteralPath $output) {
    throw "Prepared oracle output root unexpectedly exists already: $output"
}
$expectedRuntime = Join-Path $output 'runtime\AARON.exe'
$runnerProcess = $null
$releasePath = Join-Path 'C:\temp' 'aaron-native-code-release.txt'
$logStem = "aaron-native-map-$RunId-runner"
$runnerStdout = Join-Path 'C:\temp' ($logStem + '.stdout.log')
$runnerStderr = Join-Path 'C:\temp' ($logStem + '.stderr.log')
if ((Test-Path -LiteralPath $runnerStdout) -or (Test-Path -LiteralPath $runnerStderr)) {
    throw 'A unique runner log path unexpectedly exists; preserve it and choose a new RunId'
}
try {
    $runnerArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $runner,
        '-ExtractedRoot', $extracted,
        '-OutputRoot', $output,
        '-RunId', $RunId,
        '-Mode', 'writer-stream-seed-1234',
        '-RunSeconds', [string]$RunSeconds,
        '-PreSceneProbePath', $probe,
        '-PreSceneProbePauseSeconds', [string]$PauseSeconds,
        '-ProbeOutputNames', $probeName,
        '-RequiredProbeOutputName', $probeName,
        '-RequiredProbeEndMarker', $end
    )
    $runnerArgumentLine = ($runnerArgs | ForEach-Object {
        '"' + ([string]$_) + '"'
    }) -join ' '
    $shellExecutable = (Get-Process -Id $PID).Path
    if (-not (Test-Path -LiteralPath $shellExecutable -PathType Leaf)) {
        throw 'Could not resolve the current PowerShell executable for the hidden runner process'
    }
    $runnerProcess = Start-Process -FilePath $shellExecutable `
        -ArgumentList $runnerArgumentLine -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $runnerStdout `
        -RedirectStandardError $runnerStderr
    $null = $runnerProcess.Handle

    $startupDeadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        if ($runnerProcess.HasExited) {
            $runnerProcess.Refresh()
            $startupExitCode = $runnerProcess.ExitCode
            if ($null -eq $startupExitCode) {
                throw 'Oracle runner exited before the native metadata READY marker, but its exit code was unavailable'
            }
            throw "Oracle runner exited before the native metadata READY marker (exit $startupExitCode)"
        }
        if ((Test-Path -LiteralPath $metadataPath -PathType Leaf) -and
            (Select-String -LiteralPath $metadataPath -SimpleMatch $ready -Quiet)) { break }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $startupDeadline)
    if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf) -or
        -not (Select-String -LiteralPath $metadataPath -SimpleMatch $ready -Quiet)) {
        throw 'FREE-PATH native metadata probe did not reach READY within 60 seconds'
    }

    $metadata = [IO.File]::ReadAllText($metadataPath)
    if (-not $metadata.Contains('INSTALL targets=2 mode=READ-ONLY-METADATA') -or
        $metadata -notmatch '(?m)^TOTALS targets=2 functions=2 headers=2 errors=0 truncations=0\r?$' -or
        $metadata -notmatch '(?m)^ERROR-COUNT 0\r?$' -or
        $metadata -notmatch '(?m)^TRUNCATION-COUNT 0\r?$' -or
        @([regex]::Matches($metadata, '(?m)^HEADER name="?(?:FREE-PATH|DRAW-CFORM)"? bytes=[0-9A-Fa-f]{128}\r?$')).Count -ne 2) {
        throw 'FREE-PATH/DRAW-CFORM metadata is incomplete or failed its bounded checks'
    }
    if (Test-Path -LiteralPath $releasePath) {
        throw 'The pre-scene release marker already exists; refusing to reuse it'
    }

    & $capture -OracleOutputRoot $output `
        -ExpectedFunctionCount 2 `
        -MetadataPath $metadataPath `
        -MetadataEndMarker $ready | Out-Null

    $waitDeadline = [DateTime]::UtcNow.AddSeconds($RunSeconds + 30)
    while (-not $runnerProcess.HasExited -and [DateTime]::UtcNow -lt $waitDeadline) {
        Start-Sleep -Milliseconds 250
        $runnerProcess.Refresh()
    }
    if (-not $runnerProcess.HasExited) {
        throw 'The source-bound AARON runner did not exit within its bounded deadline'
    }
    $runnerProcess.Refresh()
    $runnerExitCode = $runnerProcess.ExitCode
    if ($null -eq $runnerExitCode) {
        throw "The source-bound AARON runner exited but its exit code was unavailable; preserve $output for diagnosis"
    }
    if ($runnerExitCode -ne 0) {
        throw "The source-bound AARON runner failed (exit $runnerExitCode); preserve $output for diagnosis"
    }

    $captureDir = Join-Path $output 'capture'
    foreach ($logPath in @($runnerStdout, $runnerStderr)) {
        if (Test-Path -LiteralPath $logPath -PathType Leaf) {
            Move-Item -LiteralPath $logPath -Destination $captureDir
        }
    }
    $archivedMetadata = Join-Path $captureDir $probeName
    $tracePath = Join-Path $captureDir 'aaron-planning-call-trace.txt'
    $aa0 = Join-Path $captureDir 'aa0'
    $scene = Join-Path $captureDir 'aaron-scene-state-snapshot.txt'
    foreach ($path in @($archivedMetadata, $tracePath, $aa0, $scene,
                         (Join-Path $output 'native-code\manifest.json'))) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Completed native-map run is missing a required artifact: $path"
        }
    }
    $archivedProbe = [IO.File]::ReadAllText($archivedMetadata)
    $trace = [IO.File]::ReadAllText($tracePath)
    $summaryPath = Join-Path $output 'summary.json'
    $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
    $probeHash = (Get-FileHash -LiteralPath $probe -Algorithm SHA256).Hash.ToLowerInvariant()
    $runnerHash = (Get-FileHash -LiteralPath $runner -Algorithm SHA256).Hash.ToLowerInvariant()
    $stagedProbePath = Join-Path $captureDir 'aaron-pre-scene-probe.cl'
    $stagedTraceSource = Join-Path $captureDir 'planning-call-trace.cl'
    if ($summary.runId -ne $RunId -or $summary.complete -ne $true -or
        $summary.mode -ne 'writer-stream-seed-1234' -or
        $summary.probeCompletionSatisfied -ne $true -or
        $summary.runnerSha256 -ne $runnerHash -or
        $summary.preSceneProbeSha256 -ne $probeHash -or
        $summary.preSceneProbePauseSeconds -ne $PauseSeconds -or
        @($summary.probeOutputNames).Count -ne 1 -or
        $summary.probeOutputNames[0] -ne $probeName -or
        $summary.requiredProbeOutputName -ne $probeName -or
        $summary.requiredProbeEndMarker -ne $end -or
        (Get-FileHash -LiteralPath $stagedProbePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $probeHash -or
        (Get-FileHash -LiteralPath $stagedTraceSource -Algorithm SHA256).Hash.ToLowerInvariant() -ne
            (Get-FileHash -LiteralPath (Join-Path $repoRoot 'research\introspection\planning-call-trace.cl') -Algorithm SHA256).Hash.ToLowerInvariant()) {
        throw 'Completed native-map run is not bound to the current runner, staged probe, and planning trace'
    }
    if ($summary.aa0Sha256 -ne (Get-FileHash -LiteralPath $aa0 -Algorithm SHA256).Hash.ToLowerInvariant() -or
        $summary.sceneReportSha256 -ne (Get-FileHash -LiteralPath $scene -Algorithm SHA256).Hash.ToLowerInvariant()) {
        throw 'Completed native-map drawing/scene artifacts do not match the runner summary hashes'
    }
    $normalizedProbe = $archivedProbe.Replace("`r`n", "`n")
    if (-not $normalizedProbe.EndsWith($end + "`n") -or
        -not $trace.Contains('UNWRAPPED-TARGETS ("FREE-PATH")') -or
        $trace -match '(?m)^TARGET FREE-PATH INSTALLED') {
        throw 'Native-map run did not finish cleanly with FREE-PATH confirmed unwrapped; preserve the root'
    }
    if ((Get-Content -LiteralPath $aa0 -Tail 1 -ErrorAction Stop) -cne 'end' -or
        -not (Select-String -LiteralPath $scene -SimpleMatch 'END scene-state-snapshot' -Quiet)) {
        throw 'Native-map run did not contain a complete drawing/scene result; preserve the root'
    }

    $pllPath = $extractedPllPath
    $runtimeExe = Join-Path $output 'runtime\AARON.exe'
    $runtimePll = Join-Path $output 'runtime\AARON.pll'
    foreach ($item in @(
        [pscustomobject]@{ Path = $runtimeExe; Manifest = $manifestExe[0] }
        [pscustomobject]@{ Path = $runtimePll; Manifest = $manifestPll[0] }
    )) {
        if (-not (Test-Path -LiteralPath $item.Path -PathType Leaf) -or
            (Get-Item -LiteralPath $item.Path).Length -ne $item.Manifest.bytes -or
            (Get-FileHash -LiteralPath $item.Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Manifest.sha256) {
            throw "Completed native-map runtime differs from its extracted manifest: $($item.Path)"
        }
    }
    $mappedDir = Join-Path $output 'native-code\mapped'
    & node $mapper (Join-Path $output 'native-code\manifest.json') $pllPath $mappedDir | Out-Null
    $mapPath = Join-Path $mappedDir 'native-code-map.json'
    $map = Get-Content -LiteralPath $mapPath -Raw | ConvertFrom-Json
    $names = @($map.functions | ForEach-Object name | Sort-Object)
    if ($map.pll.bytes -ne $manifestPll[0].bytes -or
        $map.pll.sha256 -ne $manifestPll[0].sha256 -or
        ($names -join ',') -ne 'DRAW-CFORM,FREE-PATH' -or
        @($map.functions | Where-Object { -not $_.uniqueCompleteObjectByteMatch }).Count -ne 0) {
        throw 'Mapped native object set is not the exact complete source-bound FREE-PATH/DRAW-CFORM pair'
    }
    [pscustomobject]@{
        runId = $RunId
        outputRoot = $output
        nativeCodeMap = $mapPath
        pllSha256 = $map.pll.sha256
        runnerSha256 = $summary.runnerSha256
        probeSha256 = $summary.preSceneProbeSha256
        summarySha256 = (Get-FileHash -LiteralPath $summaryPath -Algorithm SHA256).Hash.ToLowerInvariant()
        aa0Header = [IO.File]::ReadAllText($aa0).Split("`n")[0].TrimEnd("`r")
        functions = @($map.functions | ForEach-Object {
            [pscustomobject]@{
                name = $_.name
                payloadBytes = $_.payloadBytes
                payloadSha256 = $_.payloadSha256
                pllPayloadOffset = $_.pll.payloadOffset
                uniqueCompleteObjectByteMatch = $_.uniqueCompleteObjectByteMatch
            }
        })
        freePathUnwrapped = $true
        sceneRunComplete = $true
        drawingParityClaimed = $false
    } | ConvertTo-Json -Depth 6
} finally {
    if ($null -ne $runnerProcess) {
        $runnerProcess.Refresh()
        if (-not $runnerProcess.HasExited) {
            $ownedAaron = @(Get-Process AARON -ErrorAction SilentlyContinue | Where-Object {
                $_.Path -eq $expectedRuntime
            })
            if ($ownedAaron.Count -eq 1 -and -not (Test-Path -LiteralPath $releasePath)) {
                [IO.File]::WriteAllText($releasePath,
                    'FREE-PATH native-map parent finished or failed')
            }
            try { $runnerProcess.WaitForExit(30000) | Out-Null } catch { }
            $runnerProcess.Refresh()
            if (-not $runnerProcess.HasExited) {
                Write-Warning "Owned oracle runner is still active; preserve $output and do not start another AARON run."
            }
        }
    }
    if (Test-Path -LiteralPath $output -PathType Container) {
        $diagnostics = Join-Path $output 'diagnostics'
        foreach ($logPath in @($runnerStdout, $runnerStderr)) {
            if ((Test-Path -LiteralPath $logPath -PathType Leaf) -and
                ($null -eq $runnerProcess -or $runnerProcess.HasExited)) {
                if (-not (Test-Path -LiteralPath $diagnostics -PathType Container)) {
                    New-Item -ItemType Directory -Path $diagnostics | Out-Null
                }
                Move-Item -LiteralPath $logPath -Destination $diagnostics
            }
        }
    }
}
