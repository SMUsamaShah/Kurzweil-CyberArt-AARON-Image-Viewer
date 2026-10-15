# Source-bound no-TF hardware execute-breakpoint triplet for two REA-identified
# transfers inside the anonymous PREMIUM destination. Site hits establish only
# the measured source/destination edges; they do not prove continuous execution
# or identify a direct Lisp caller.
[CmdletBinding()]
param(
    [string]$ExtractedRoot = 'research\extracted\aaron',
    [string]$BaseRoot = 'C:\AaronOracleRuns',
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,24}$')]
    [string]$RunPrefix = 'prem-internal-transfer-v4',
    [ValidateSet('writer-stream-seed-1234', 'writer-full-seed-5678', 'writer-full-seed-456069')]
    [string]$Mode = 'writer-full-seed-456069',
    [ValidateRange(120, 600)] [int]$RunSeconds = 360,
    [ValidateRange(45, 300)] [int]$PauseSeconds = 150,
    [ValidateRange(10, 180)] [int]$CaptureSeconds = 180,
    [ValidateRange(10, 120)] [int]$ReadyTimeoutSeconds = 60,
    [ValidateRange(10, 180)] [int]$EndTimeoutSeconds = 90,
    [switch]$PreflightOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PauseSeconds -ge $RunSeconds) { throw 'PauseSeconds must be shorter than RunSeconds' }

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$prepareScript = Join-Path $repoRoot 'research\tools\prepare-local-aaron-oracle-run.ps1'
$runnerScript = Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1'
$probePath = Join-Path $repoRoot 'research\introspection\premium-callsite-metadata-v1.cl'
$debuggerPath = Join-Path $repoRoot 'research\oracle\AaronPremiumInternalTransferBreakpointV3.cs'
$mapperPath = Join-Path $repoRoot 'research\tools\map-native-code-to-pll.mjs'
$reaCensusPath = Join-Path $repoRoot 'research\introspection\evidence\select-subject-call-census-20261014-v1.json'
$reaWideWindowPath = Join-Path $repoRoot 'research\introspection\evidence\premium-callsite-wide-window-20261014-v3.json'
$reaWideWindowAnalysisPath = Join-Path $repoRoot 'research\introspection\evidence\premium-callsite-wide-window-rea-20261014-v3.json'
$branchSnapshotPath = Join-Path $repoRoot 'research\introspection\evidence\premium-callsite-branch-snapshot-20261015.json'
$expectedTargetWindowStart = [uint32]0x20000903
$referenceWindowSha256 = '39463cf987721fcc34745e23dbc3e9baab215baf05f9971ee94537446bff8abd'
$expectedWideWindowEvidenceSha256 = 'ea98b1f39094a11bd45313e930dc1341cfee7e22872185754678fa2e5b03104c'
$expectedWideWindowAnalysisSha256 = '9734162bbdfc42ead70331e110ef17322506dc3f1a5355f6de9c26a8e36047d2'
$expectedBranchSnapshotSha256 = '3e8380dbffdc89e3b34f4e9ad863b3c887a0f47b3446c9f4151f2a78ccdd3037'
$expectedInstructionProfileSha256 = '25daebb65b53736fb37a208f44cc9a86162ec398f64703aa6bb86b351310fabe'
$extractedPath = if ([IO.Path]::IsPathRooted($ExtractedRoot)) {
    (Resolve-Path -LiteralPath $ExtractedRoot).Path
} else { (Resolve-Path -LiteralPath (Join-Path $repoRoot $ExtractedRoot)).Path }
$manifestPath = Join-Path $extractedPath 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$runtimeManifest = @{}
foreach ($name in @('AARON.exe', 'AARON.pll')) {
    $matches = @($manifest.files | Where-Object { $_.installedName -ceq $name })
    if ($matches.Count -ne 1) { throw "Extracted manifest must identify exactly one $name" }
    $runtimeManifest[$name] = $matches[0]
    $source = Join-Path (Join-Path $extractedPath 'application') $name
    if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or
        (Get-Item -LiteralPath $source).Length -ne $matches[0].bytes -or
        (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $matches[0].sha256) {
        throw "Extracted runtime differs from its manifest: $source"
    }
}
foreach ($path in @($prepareScript, $runnerScript, $probePath, $debuggerPath, $mapperPath, $reaCensusPath,
    $reaWideWindowPath, $reaWideWindowAnalysisPath, $branchSnapshotPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required input is missing: $path" }
}
if ([IntPtr]::Size -ne 8) { throw 'Run this coordinator in 64-bit PowerShell for WOW64 debugging' }
if (Get-Process -Name AARON -ErrorAction SilentlyContinue) {
    throw 'An AARON process is active; refusing to overlap original-runtime runs'
}

$captureSchema = 'aaron-premium-internal-transfer-breakpoint-v3'
$capturePrefix = 'premium-internal-transfer-breakpoint-v3'
$captureBeginMarker = "BEGIN $capturePrefix"
$probeName = 'aaron-premium-callsite-metadata-v1.txt'
$captureOutputName = 'aaron-premium-internal-transfer-breakpoint-v3.txt'
$probeOutputNamesJson = ConvertTo-Json -InputObject @($probeName, $captureOutputName) -Compress
$requiredEndMarker = "END $capturePrefix"
$readyMarker = 'READY premium-callsite-metadata-v1'
$metadataEndMarker = 'END premium-callsite-metadata-v1'
$releasePath = 'C:\temp\aaron-native-code-release.txt'
$metadataPath = Join-Path 'C:\temp' $probeName
$captureOutputPath = Join-Path 'C:\temp' $captureOutputName
if (-not (Test-Path -LiteralPath 'C:\temp' -PathType Container)) {
    throw 'C:\temp is missing; inspect the documented target and permissions'
}
foreach ($path in @($metadataPath, $captureOutputPath, $releasePath)) {
    if (Test-Path -LiteralPath $path) { throw "Reserved staging path already exists; preserve it: $path" }
}
if ($PauseSeconds -lt 90) {
    throw 'The live metadata mapping plus debug setup needs the documented bounded pause of at least 90 seconds'
}

$baseFullPath = [IO.Path]::GetFullPath($BaseRoot)
$mode = $Mode
$runnerSha256 = (Get-FileHash -LiteralPath $runnerScript -Algorithm SHA256).Hash.ToLowerInvariant()
$coordinatorSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$probeSha256 = (Get-FileHash -LiteralPath $probePath -Algorithm SHA256).Hash.ToLowerInvariant()
$debuggerSha256 = (Get-FileHash -LiteralPath $debuggerPath -Algorithm SHA256).Hash.ToLowerInvariant()
$mapperSha256 = (Get-FileHash -LiteralPath $mapperPath -Algorithm SHA256).Hash.ToLowerInvariant()
$reaCensusSha256 = (Get-FileHash -LiteralPath $reaCensusPath -Algorithm SHA256).Hash.ToLowerInvariant()
$reaWideWindowSha256 = (Get-FileHash -LiteralPath $reaWideWindowPath -Algorithm SHA256).Hash.ToLowerInvariant()
$reaWideWindowAnalysisSha256 = (Get-FileHash -LiteralPath $reaWideWindowAnalysisPath -Algorithm SHA256).Hash.ToLowerInvariant()
$manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$logStamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$nonce = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$tripletId = "$RunPrefix-$logStamp-$nonce"
$logRoot = Join-Path $repoRoot "research\extracted\local-oracle\premium-internal-transfer-triplet-v4-logs\$tripletId"
$externalRuns = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'
$powerShellExe = if ([IntPtr]::Size -eq 4 -and [Environment]::Is64BitOperatingSystem) {
    Join-Path $env:SystemRoot 'Sysnative\WindowsPowerShell\v1.0\powershell.exe'
} else { Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' }
if (-not (Test-Path -LiteralPath $powerShellExe -PathType Leaf)) {
    throw '64-bit Windows PowerShell 5.1 is unavailable for the source-bound runner'
}

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
    if ($active.Count -gt 0) { throw "An AARON process is active (PID $(($active.Id) -join ', '))" }
}

function Get-PathAliases([string]$RuntimePath) {
    $aliases = [Collections.Generic.List[string]]::new()
    $full = [IO.Path]::GetFullPath($RuntimePath)
    $aliases.Add($full)
    if (Test-Path -LiteralPath $externalRuns) {
        $link = Get-Item -LiteralPath $externalRuns -Force
        if ($link.LinkType -in @('Junction', 'SymbolicLink') -and $link.Target) {
            $prefix = [IO.Path]::GetFullPath($externalRuns).TrimEnd('\') + '\'
            if ($full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                $relative = $full.Substring($prefix.Length)
                foreach ($targetValue in @($link.Target)) {
                    $target = [string]$targetValue
                    if (-not [IO.Path]::IsPathRooted($target)) {
                        $target = Join-Path (Split-Path -Parent $externalRuns) $target
                    }
                    $aliases.Add([IO.Path]::GetFullPath((Join-Path $target $relative)))
                }
            }
        }
    }
    return @($aliases | Select-Object -Unique)
}

function Test-PathsOverlap([string]$Left, [string]$Right) {
    $leftFull = [IO.Path]::GetFullPath($Left)
    $rightFull = [IO.Path]::GetFullPath($Right)
    $leftRoot = [IO.Path]::GetPathRoot($leftFull)
    $rightRoot = [IO.Path]::GetPathRoot($rightFull)
    if (-not [string]::Equals($leftFull, $leftRoot, [StringComparison]::OrdinalIgnoreCase)) { $leftFull = $leftFull.TrimEnd('\') }
    if (-not [string]::Equals($rightFull, $rightRoot, [StringComparison]::OrdinalIgnoreCase)) { $rightFull = $rightFull.TrimEnd('\') }
    $rightPrefix = if ($rightFull.EndsWith('\')) { $rightFull } else { $rightFull + '\' }
    $leftPrefix = if ($leftFull.EndsWith('\')) { $leftFull } else { $leftFull + '\' }
    return [string]::Equals($leftFull, $rightFull, [StringComparison]::OrdinalIgnoreCase) -or
        $leftFull.StartsWith($rightPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        $rightFull.StartsWith($leftPrefix, [StringComparison]::OrdinalIgnoreCase)
}

function Resolve-DirectoryTarget([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.LinkType -in @('Junction', 'SymbolicLink') -and $item.Target) {
        $target = [string]@($item.Target)[0]
        if (-not [IO.Path]::IsPathRooted($target)) {
            $target = Join-Path (Split-Path -Parent $item.FullName) $target
        }
        return [IO.Path]::GetFullPath($target)
    }
    return [IO.Path]::GetFullPath($item.FullName)
}

function New-RunRoot([string]$RunId) {
    Assert-NoAaronProcess
    $prepareArgs = @{ RunId = $RunId; Mode = $mode; BaseRoot = $baseFullPath }
    $made = @(& $prepareScript @prepareArgs)
    if ($made.Count -ne 1) { throw "Run-root preparation did not return one fresh path for $RunId" }
    $output = [IO.Path]::GetFullPath(([string]$made[0]).Trim())
    if (Test-Path -LiteralPath $output) { throw "Prepared output root already exists: $output" }
    return $output
}

function Start-Runner([string]$Role, [string]$RunId, [string]$OutputRoot, [bool]$Observer) {
    $values = [Collections.Generic.List[string]]::new()
    foreach ($value in @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $runnerScript, '-ExtractedRoot', $extractedPath, '-OutputRoot', $OutputRoot,
        '-RunId', $RunId, '-Mode', $mode, '-RunSeconds', [string]$RunSeconds)) {
        $values.Add([string]$value)
    }
    if ($Observer) {
        foreach ($value in @('-PreSceneProbePath', $probePath,
            '-PreSceneProbePauseSeconds', [string]$PauseSeconds,
            '-ProbeOutputNamesJson', [string]$probeOutputNamesJson,
            '-RequiredProbeOutputName', $captureOutputName,
            '-RequiredProbeEndMarker', $requiredEndMarker)) { $values.Add([string]$value) }
    }
    $line = ($values | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
    $stdout = Join-Path $logRoot "$Role.runner.stdout.txt"
    $stderr = Join-Path $logRoot "$Role.runner.stderr.txt"
    $process = Start-Process -FilePath $powerShellExe -ArgumentList $line -WorkingDirectory $repoRoot `
        -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $process.Handle
    return [pscustomobject]@{ Process = $process; Stdout = $stdout; Stderr = $stderr }
}

function Wait-Runner($Runner, [string]$Role) {
    if (-not $Runner.Process.WaitForExit(($RunSeconds + 900) * 1000)) {
        throw "$Role runner exceeded its bounded wait; preserve its output root"
    }
    $Runner.Process.Refresh()
    $code = $Runner.Process.ExitCode
    if ($null -eq $code) { throw "$Role runner exit code is unavailable; inspect $($Runner.Stderr)" }
    if ($code -ne 0) { throw "$Role runner exited $code; inspect $($Runner.Stderr)" }
    Assert-NoAaronProcess
}

function Wait-Ready([string]$OutputRoot, [string]$RunId, $Runner) {
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    $deadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Runner.Process.Refresh()
        if ($Runner.Process.HasExited) { throw "Observer runner exited before READY; inspect $($Runner.Stderr)" }
        if ((Test-Path -LiteralPath $requestPath -PathType Leaf) -and
            (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
            try {
                $requestBytes = [IO.File]::ReadAllBytes($requestPath)
                $request = ([Text.UTF8Encoding]::new($false, $true).GetString($requestBytes)) | ConvertFrom-Json
                $requestSha256 = Get-Sha256Bytes $requestBytes
            }
            catch { Start-Sleep -Milliseconds 100; continue }
            if ($request.schemaVersion -ne 1 -or $request.runId -cne $RunId -or
                $request.runnerSha256 -cne $runnerSha256 -or $request.probeSha256 -cne $probeSha256 -or
                $request.releaseFile -cne $releasePath -or $request.pauseSeconds -ne $PauseSeconds -or
                $request.requiredProbeOutputName -cne $captureOutputName -or
                $request.requiredProbeEndMarker -cne $requiredEndMarker -or
                @($request.probeOutputNames).Count -ne 2 -or
                $request.probeOutputNames[0] -cne $probeName -or
                $request.probeOutputNames[1] -cne $captureOutputName -or
                $request.runtimeExecutable -cne (Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe')) {
                throw 'Observer request does not bind this exact metadata probe, required capture, runtime, runner, and pause'
            }
            if (Select-String -LiteralPath $metadataPath -SimpleMatch $readyMarker -Quiet -ErrorAction SilentlyContinue) {
                $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
                $runtimeAliases = Get-PathAliases $request.runtimeExecutable
                $owned = @($all | Where-Object { $_.Path -in $runtimeAliases })
                if ($all.Count -ne 1 -or $owned.Count -ne 1) {
                    throw 'READY does not belong to the sole AARON process in this fresh output root'
                }
                return [pscustomobject]@{
                    request = $request; process = $owned[0]; requestPath = $requestPath
                    requestSha256 = $requestSha256
                }
            }
        }
        Start-Sleep -Milliseconds 200
    }
    throw "Observer did not reach READY within $ReadyTimeoutSeconds seconds"
}

function Assert-ReadyRequest($Ready, [string]$OutputRoot, [string]$RunId) {
    $expectedRequestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    $expectedRuntime = Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe'
    if ([string]$Ready.requestPath -cne $expectedRequestPath -or
        -not (Test-Path -LiteralPath $expectedRequestPath -PathType Leaf)) {
        throw 'READY request path is not the exact request file under this owned run root'
    }
    $requestBytes = [IO.File]::ReadAllBytes($expectedRequestPath)
    $requestHash = Get-Sha256Bytes $requestBytes
    $request = ([Text.UTF8Encoding]::new($false, $true).GetString($requestBytes)) | ConvertFrom-Json
    if ($requestHash -cne [string]$Ready.requestSha256 -or
        $request.schemaVersion -ne 1 -or $request.runId -cne $RunId -or
        $request.runtimeExecutable -cne $expectedRuntime -or
        $request.probeSha256 -cne $probeSha256 -or $request.runnerSha256 -cne $runnerSha256 -or
        $request.releaseFile -cne $releasePath -or $request.pauseSeconds -ne $PauseSeconds -or
        $request.requiredProbeOutputName -cne $captureOutputName -or
        $request.requiredProbeEndMarker -cne $requiredEndMarker -or
        @($request.probeOutputNames).Count -ne 2 -or
        $request.probeOutputNames[0] -cne $probeName -or $request.probeOutputNames[1] -cne $captureOutputName) {
        throw 'READY request ownership, run ID, SHA-256, or exact probe contract changed before capture'
    }
    $Ready.process.Refresh()
    if ($Ready.process.HasExited) { throw 'Owned AARON process exited before helper setup' }
    $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
    $aliases = Get-PathAliases $expectedRuntime
    $owned = @($all | Where-Object { $_.Path -in $aliases })
    if ($all.Count -ne 1 -or $owned.Count -ne 1 -or $owned[0].Id -ne $Ready.process.Id) {
        throw 'Current AARON process no longer uniquely matches the owned READY runtime'
    }
    return $requestHash
}

function Get-Sha256Bytes([byte[]]$Bytes) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

function Convert-Hex32([string]$Value, [string]$Label) {
    if ($Value -cnotmatch '^0x[0-9a-fA-F]{1,8}$') { throw "$Label is not a bounded 32-bit address" }
    return [uint64][Convert]::ToUInt32($Value.Substring(2), 16)
}

function Convert-Hex64([string]$Value, [string]$Label) {
    if ($Value -cnotmatch '^0x[0-9a-fA-F]{1,16}$') { throw "$Label is not a bounded 64-bit address" }
    return [uint64][Convert]::ToUInt64($Value.Substring(2), 16)
}

function Convert-HexBytes([string]$Value, [string]$Label) {
    if ($Value -cnotmatch '^(?:[0-9a-fA-F]{2})+$') { throw "$Label is not an even-length hexadecimal byte string" }
    $bytes = New-Object byte[] ($Value.Length / 2)
    for ($index = 0; $index -lt $bytes.Length; $index++) {
        $bytes[$index] = [Convert]::ToByte($Value.Substring($index * 2, 2), 16)
    }
    return ,$bytes
}

function Get-BoundTargetWindowEvidence {
    $sourceBytes = [IO.File]::ReadAllBytes($reaWideWindowPath)
    $sourceFileHash = Get-Sha256Bytes $sourceBytes
    if ($sourceFileHash -cne $expectedWideWindowEvidenceSha256 -or
        (Get-FileHash -LiteralPath $reaWideWindowPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sourceFileHash) {
        throw 'Accepted source-window evidence hash changed from its pinned binding'
    }
    $source = ([Text.UTF8Encoding]::new($false, $true).GetString($sourceBytes)) | ConvertFrom-Json
    $triplet = $source.triplet
    $window = $source.destinationWindow
    if ([string]$source.status -cne 'source-bound-wide-destination-captured' -or
        $triplet.controlsMatch -ne $true -or $triplet.beforeAfterPlanningTraceMatch -ne $true -or
        [string]$triplet.canvas -cne '768 1080 148' -or @($triplet.roles).Count -ne 3 -or
        @($triplet.roles | Where-Object { $_.complete -ne $true }).Count -ne 0 -or
        [string]$window.address -cne '0x20000983' -or
        [string]$window.windowStartAddress -cne '0x0000000020000903' -or
        [string]$window.windowEndExclusive -cne '0x0000000020000a03' -or
        $window.eipOffset -ne 128 -or $window.requestedBytes -ne 256 -or $window.bytesRead -ne 256 -or
        [string]$window.bytesHex -notmatch '^[0-9a-fA-F]{512}$' -or
        [string]$window.bytesSha256 -cne $referenceWindowSha256 -or
        $source.call.stoppedBeforeDestinationInstruction -ne $true -or
        $source.call.directDestinationEqualsCurrentPickEntry -ne $false) {
        throw 'Accepted capture is incomplete or does not identify the bounded destination window and fresh controls'
    }
    $referenceBytes = Convert-HexBytes ([string]$window.bytesHex) 'Accepted REA reference-window bytes'
    if ($referenceBytes.Length -ne 256 -or (Get-Sha256Bytes $referenceBytes) -cne $referenceWindowSha256) {
        throw 'Recomputed accepted 256-byte reference window does not match its stored hash'
    }
    $referenceRegion = $window.region
    if ([string]$referenceRegion.state -cne '0x00001000' -or
        [string]$referenceRegion.protection -cne '0x00000004' -or
        [string]$referenceRegion.type -cne '0x00040000') {
        throw 'Accepted source window is not the recorded committed MEM_MAPPED/PAGE_READWRITE region'
    }

    $analysisBytes = [IO.File]::ReadAllBytes($reaWideWindowAnalysisPath)
    $analysisFileHash = Get-Sha256Bytes $analysisBytes
    if ($analysisFileHash -cne $expectedWideWindowAnalysisSha256 -or
        (Get-FileHash -LiteralPath $reaWideWindowAnalysisPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $analysisFileHash) {
        throw 'REA evidence hash changed from its pinned static-only source binding'
    }
    $analysis = ([Text.UTF8Encoding]::new($false, $true).GetString($analysisBytes)) | ConvertFrom-Json
    if ([string]$analysis.status -cne 'captured-byte-static-checks-complete; computed transfers unresolved' -or
        $analysis.originalRuntime.controlsMatch -ne $true -or
        $analysis.originalRuntime.branchExecutionObserved -ne $false -or
        $analysis.originalRuntime.directCpuEdgeToPick -ne $false -or
        $analysis.analysisInput.syntheticPe.executed -ne $false -or
        [string]$analysis.sourceCapture.evidence.path -cne 'research/introspection/evidence/premium-callsite-wide-window-20261014-v3.json' -or
        [string]$analysis.sourceCapture.evidence.sha256 -cne $sourceFileHash -or
        [string]$analysis.sourceCapture.tripletId -cne [string]$triplet.id -or
        [string]$analysis.sourceCapture.windowStart -cne [string]$window.windowStartAddress -or
        [string]$analysis.sourceCapture.bytesSha256 -cne $referenceWindowSha256) {
        throw 'REA evidence is not static-only and bound to the accepted source-window triplet'
    }

    $branchBytes = [IO.File]::ReadAllBytes($branchSnapshotPath)
    $branchFileHash = Get-Sha256Bytes $branchBytes
    if ($branchFileHash -cne $expectedBranchSnapshotSha256 -or
        (Get-FileHash -LiteralPath $branchSnapshotPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $branchFileHash) {
        throw 'Branch-snapshot/profile evidence hash changed from its pinned source binding'
    }
    $branch = ([Text.UTF8Encoding]::new($false, $true).GetString($branchBytes)) | ConvertFrom-Json
    if ([string]$branch.sourceCapture.evidenceSha256 -cne $sourceFileHash -or
        [string]$branch.sourceCapture.tripletId -cne [string]$triplet.id -or
        $branch.staticAnalysis.staticOnly -ne $true -or
        $branch.staticAnalysis.syntheticPeExecuted -ne $false -or
        [string]$branch.instructionProfile.id -cne 'premium-callsite-instruction-profile-v1' -or
        [string]$branch.instructionProfile.referenceWindowSha256 -cne $referenceWindowSha256 -or
        [string]$branch.instructionProfile.reaEvidenceSha256 -cne $analysisFileHash -or
        [string]$branch.instructionProfile.sha256 -cne $expectedInstructionProfileSha256) {
        throw 'Static instruction profile is not bound to the accepted runtime capture and REA dossier'
    }

    $expectedSignatures = @(
        [pscustomobject]@{ offset = 0x17; bytes = 'ff975f030000' },
        [pscustomobject]@{ offset = 0x80; bytes = 'b102' },
        [pscustomobject]@{ offset = 0x82; bytes = '83e17f' },
        [pscustomobject]@{ offset = 0x85; bytes = '8b7315' },
        [pscustomobject]@{ offset = 0x88; bytes = '894df0' },
        [pscustomobject]@{ offset = 0x8b; bytes = '39679b' },
        [pscustomobject]@{ offset = 0x8e; bytes = '7209' },
        [pscustomobject]@{ offset = 0x90; bytes = 'eb85' },
        [pscustomobject]@{ offset = 0x99; bytes = '89442404' },
        [pscustomobject]@{ offset = 0x9d; bytes = '89542408' },
        [pscustomobject]@{ offset = 0xa1; bytes = 'ff6612' }
    )
    $profileRecords = @($branch.staticAnalysis.instructions)
    $portableProfile = @($branch.instructionProfile.offsetsAndBytes)
    if ($profileRecords.Count -ne $expectedSignatures.Count -or
        $portableProfile.Count -ne $expectedSignatures.Count) {
        throw 'The REA-bound instruction profile does not contain exactly eleven spans'
    }
    $canonicalLines = New-Object 'System.Collections.Generic.List[string]'
    [void]$canonicalLines.Add('profile=premium-callsite-instruction-profile-v1')
    [void]$canonicalLines.Add('windowStart=0x20000903')
    [void]$canonicalLines.Add("referenceWindowSha256=$referenceWindowSha256")
    [void]$canonicalLines.Add("reaEvidenceSha256=$analysisFileHash")
    foreach ($signature in $expectedSignatures) {
        $actualProfile = @($profileRecords | Where-Object {
            ((Convert-Hex64 ([string]$_.runtimeAddress) 'REA instruction runtime address') - [uint64]$expectedTargetWindowStart) -eq [uint64]$signature.offset
        })
        $portable = @($portableProfile | Where-Object { [string]$_.offset -ceq ('0x{0:x}' -f [int]$signature.offset) })
        if ($actualProfile.Count -ne 1 -or $portable.Count -ne 1 -or
            [string]$actualProfile[0].bytes -cne $signature.bytes -or
            [string]$portable[0].bytes -cne $signature.bytes) {
            throw ('REA instruction profile has a missing, duplicate, or mismatched span at +0x{0:x}' -f [int]$signature.offset)
        }
        $actualOffset = [uint64]$signature.offset
        $actualBytes = ([string]$window.bytesHex).Substring([int]($actualOffset * 2), $signature.bytes.Length)
        if ($actualBytes.ToLowerInvariant() -cne $signature.bytes) {
            throw ('Static instruction bytes differ from the source-bound reference window at +0x{0:x}' -f [int]$signature.offset)
        }
        [void]$canonicalLines.Add(('{0:x2}:{1}' -f [int]$signature.offset, $signature.bytes))
    }
    $canonicalProfile = [string]::Join("`n", $canonicalLines)
    $canonicalProfileSha256 = Get-Sha256Bytes ([Text.UTF8Encoding]::new($false).GetBytes($canonicalProfile))
    if ($canonicalProfileSha256 -cne $expectedInstructionProfileSha256) {
        throw 'Recomputed ordered instruction-profile digest does not match the pinned identity'
    }
    return [pscustomobject]@{
        start = [uint32]$expectedTargetWindowStart
        sha256 = $referenceWindowSha256
        sourceFileSha256 = $sourceFileHash
        analysisFileSha256 = $analysisFileHash
        branchSnapshotSha256 = $branchFileHash
        profileSha256 = $canonicalProfileSha256
        profiles = $expectedSignatures
    }
}

function Assert-ReadablePage($Page, [string]$Label) {
    if (-not $Page -or [string]$Page.address -notmatch '^0x[0-9a-fA-F]{1,8}$' -or
        [string]$Page.bytesHex -notmatch '^(?:[0-9a-fA-F]{2})+$' -or
        $Page.bytesRead -lt 1 -or $Page.bytesRead -gt 16 -or
        $Page.bytesHex.Length -ne ($Page.bytesRead * 2) -or -not $Page.region -or
        [string]$Page.region.state -notmatch '^0x[0-9a-fA-F]{1,8}$' -or
        [string]$Page.region.protection -notmatch '^0x[0-9a-fA-F]{1,8}$') {
        throw "$Label has no bounded readable page preview"
    }
    $state = [uint32](Convert-Hex32 ([string]$Page.region.state) "$Label page state")
    $protection = [uint32](Convert-Hex32 ([string]$Page.region.protection) "$Label page protection")
    if ($state -ne 0x1000 -or ($protection -band 0x100) -ne 0 -or
        ($protection -band 0xff) -eq 1) {
        throw "$Label does not identify a readable committed page"
    }
}

function Assert-DwordEvidence($Record, [string]$Label, [uint32]$ExpectedAddress) {
    if (-not $Record -or $Record.readError -ne $null -or
        [string]$Record.bytesHex -cnotmatch '^[0-9a-fA-F]{8}$') {
        throw "$Label is missing an exact four-byte read"
    }
    $address = Convert-Hex32 ([string]$Record.address) "$Label address"
    if ($address -ne $ExpectedAddress) { throw "$Label was read from a different address" }
    $bytes = Convert-HexBytes ([string]$Record.bytesHex) "$Label bytes"
    if ($bytes.Length -ne 4) { throw "$Label is not exactly four bytes" }
    $decoded = [uint32][BitConverter]::ToUInt32($bytes, 0)
    $reported = [uint32](Convert-Hex32 ([string]$Record.value) "$Label decoded value")
    if ($decoded -ne $reported) { throw "$Label byte encoding does not match its decoded value" }
    return $decoded
}

function Assert-InternalTransferCapture($Capture, [uint32]$ExpectedCallAddress,
    [uint32]$ExpectedPickAddress, [uint32]$ExpectedWindowStart,
    [string]$ExpectedReferenceWindowSha256, [string]$ExpectedProfileSha256,
    [string]$ExpectedRunId, [string]$ExpectedRequestSha256, [string]$ExpectedRuntimePath) {
    if ($Capture.schema -cne $captureSchema -or $Capture.captureError -ne $null -or
        $Capture.acceptanceContract -cne 'jc-condition-and-candidate-call-slot-before-instruction' -or
        $Capture.captureCompleted -ne $true -or $Capture.terminalReason -cne 'jc-pre-branch-condition-and-slot-before-instruction' -or
        $Capture.attached -ne $true -or $Capture.attachSucceeded -ne $true -or $Capture.detached -ne $true -or
        $Capture.readyPauseReleased -ne $true -or $Capture.debugRegistersRestored -ne $true -or
        $Capture.trapFlagUntouched -ne $true -or @($Capture.cleanupErrors).Count -ne 0 -or
        [string]$Capture.ownedRunId -cne $ExpectedRunId -or
        [string]$Capture.ownedRequestSha256 -cne $ExpectedRequestSha256 -or
        [string]$Capture.ownedRuntimePath -cne $ExpectedRuntimePath -or
        [string]$Capture.referenceWindowStart -ine ('0x{0:x16}' -f $ExpectedWindowStart) -or
        [string]$Capture.referenceWindowSha256 -cne $ExpectedReferenceWindowSha256 -or
        [string]$Capture.instructionProfileSha256 -cne $ExpectedProfileSha256) {
        throw 'No-TF capture did not complete with READY release, exact debug-state restoration, detach, and clean cleanup'
    }
    $callAddress = Convert-Hex32 ([string]$Capture.callSiteAddress) 'Captured PREMIUM CALL site'
    $pickAddress = Convert-Hex32 ([string]$Capture.currentPickEntry) 'Captured current PICK entry'
    if ($callAddress -ne $ExpectedCallAddress -or $pickAddress -ne $ExpectedPickAddress -or $Capture.call.hit -ne $true -or
        [string]$Capture.call.status -cne 'outer-call-execute-breakpoint-hit') {
        throw 'Captured outer call does not match the current source-bound PREMIUM call site'
    }
    $owner = [string]$Capture.selectedThreadId
    if (-not $owner -or [string]$Capture.call.threadId -cne $owner) {
        throw 'Outer call has no unique selected owner thread'
    }
    $callRegisters = $Capture.call.preCallRegisters
    $callSlot = $Capture.call.preCallDispatchSlot
    if (-not $callRegisters -or [string]$callRegisters.threadId -cne $owner -or
        [string]$callRegisters.eip -ine ('0x{0:x8}' -f $callAddress) -or
        [string]$Capture.callSiteAddress -ine ('0x{0:x8}' -f $callAddress) -or
        [string]$Capture.call.preCallDispatchSlot.baseRegister -cne 'EDI' -or
        [string]$callSlot.offset -cne '0x00000027' -or
        $callSlot.readError -ne $null -or [string]$callSlot.bytesHex -notmatch '^[0-9a-fA-F]{8}$') {
        throw 'Outer CALL register, EDI slot, or live operand evidence is incomplete'
    }
    $edi = Convert-Hex32 ([string]$callRegisters.edi) 'Outer CALL EDI'
    $slotAddress = Convert-Hex32 ([string]$callSlot.address) 'Outer CALL slot address'
    $outerTarget = Assert-DwordEvidence $callSlot 'Outer CALL EDI dispatch slot' ([uint32]$slotAddress)
    if ([uint64]$slotAddress -ne ([uint64]$edi + 0x27) -or $outerTarget -eq 0 -or
        [string]$callSlot.baseValue -ine [string]$callRegisters.edi) {
        throw 'Outer CALL operand does not resolve from the EDI+0x27 value at this hit'
    }
    $outer = $Capture.outerDestination
    if ($outer.hit -ne $true -or $outer.status -cne 'outer-destination-hit-before-instruction' -or
        [string]$outer.targetEip -ine ('0x{0:x8}' -f $outerTarget) -or
        [string]$outer.targetRegisters.threadId -cne $owner -or
        [string]$outer.targetRegisters.eip -ine [string]$outer.targetEip -or
        $null -eq $outer.returnAddressAtEsp) {
        throw 'Outer dynamic destination did not validate same-thread EIP and CALL stack semantics'
    }
    $outerDestinationEsp = [uint32](Convert-Hex32 ([string]$outer.targetRegisters.esp) 'Outer destination ESP')
    $outerContinuation = [uint32]($callAddress + 3)
    $outerReturn = Assert-DwordEvidence $outer.returnAddressAtEsp 'Outer CALL destination return address' $outerDestinationEsp
    if ($outerReturn -ne $outerContinuation) { throw 'Outer CALL destination stack return is not callSite+3' }
    $callEsp = Convert-Hex32 ([string]$callRegisters.esp) 'Outer CALL pre-call ESP'
    $outerEsp = $outerDestinationEsp
    if ($callEsp -lt 4 -or $outerEsp -ne ($callEsp - 4)) {
        throw 'Outer CALL destination ESP did not decrease by four'
    }
    Assert-ReadablePage $outer.targetPage 'Outer destination'

    $window = $Capture.targetWindow
    if (-not $window -or $window.requestedBytes -ne 256 -or $window.bytesRead -ne 256 -or
        [string]$window.bytesHex -cnotmatch '^[0-9a-fA-F]{512}$' -or
        [string]$window.bytesSha256 -cnotmatch '^[0-9a-f]{64}$' -or
        [string]$window.instructionProfileSha256 -cne $ExpectedProfileSha256 -or
        [string]$window.expectedInstructionProfileSha256 -cne $ExpectedProfileSha256 -or
        [string]$window.referenceWindowStart -ine ('0x{0:x16}' -f $ExpectedWindowStart) -or
        [string]$window.referenceWindowSha256 -cne $ExpectedReferenceWindowSha256) {
        throw 'Live destination window is not bound to the complete per-run 256-byte and exact instruction-profile contract'
    }
    $windowEip = [uint64](Convert-Hex32 ([string]$window.eip) 'Target-window EIP')
    $windowStart = Convert-Hex64 ([string]$window.windowStartAddress) 'Target-window start'
    $windowEnd = Convert-Hex64 ([string]$window.windowEndExclusive) 'Target-window end'
    $liveWindowBytes = Convert-HexBytes ([string]$window.bytesHex) 'Live target-window bytes'
    $liveWindowHash = Get-Sha256Bytes $liveWindowBytes
    if ($windowStart -ne [uint64]$ExpectedWindowStart -or
        $windowEnd -ne ($windowStart + 256) -or $windowEip -ne [uint64]$outerTarget -or
        $windowEip -ne ($windowStart + 128) -or [int]$window.eipOffset -ne 128 -or
        $window.eipOffsetMatches -ne $true -or $liveWindowBytes.Length -ne 256 -or
        $liveWindowHash -cne [string]$window.bytesSha256 -or
        $window.validationPassed -ne $true -or $window.instructionProfileMatches -ne $true) {
        throw 'Live target window failed full-byte integrity, geometry, or instruction-profile checks'
    }
    $region = $window.region
    $regionBase = Convert-Hex64 ([string]$region.baseAddress) 'Target-window region base'
    $regionSize = Convert-Hex64 ([string]$region.regionSize) 'Target-window region size'
    $regionEnd = $regionBase + $regionSize
    $regionState = [uint32](Convert-Hex32 ([string]$region.state) 'Target-window region state')
    $regionProtect = [uint32](Convert-Hex32 ([string]$region.protection) 'Target-window region protection')
    $regionType = [uint32](Convert-Hex32 ([string]$region.type) 'Target-window region type')
    $baseProtection = $regionProtect -band 0xff
    $readableProtect = $baseProtection -in @(0x02, 0x04, 0x08, 0x20, 0x40, 0x80)
    $regionContainsWindow = $windowStart -ge $regionBase -and $windowEnd -le $regionEnd
    if ($regionState -ne 0x1000 -or -not $readableProtect -or ($regionProtect -band 0x100) -ne 0 -or
        $regionType -ne 0x40000 -or -not $regionContainsWindow -or
        $window.regionContainsWindow -ne $true -or $window.regionTypeMatchesReference -ne $true) {
        throw 'Live target window does not lie in the expected readable committed MEM_MAPPED region'
    }
    $historicalHashMatches = $liveWindowHash -ceq $ExpectedReferenceWindowSha256
    if ([bool]$window.historicalReferenceWindowBytesMatch -ne $historicalHashMatches) {
        throw 'Historical reference-byte equality flag does not match the independently recomputed live hash'
    }
    $profileRecords = @($window.profileRecords)
    if ($profileRecords.Count -ne $boundTargetWindow.profiles.Count) {
        throw 'Live run did not report exactly eleven instruction profile spans'
    }
    foreach ($signature in $boundTargetWindow.profiles) {
        $matches = @($profileRecords | Where-Object { [int]$_.offset -eq [int]$signature.offset })
        if ($matches.Count -ne 1) { throw ('Live profile has a missing or duplicate offset +0x{0:x}' -f [int]$signature.offset) }
        $record = $matches[0]
        $actualBytes = ([string]$window.bytesHex).Substring(([int]$signature.offset) * 2, ([string]$signature.bytes).Length)
        $expectedAddress = [uint64]$windowStart + [uint64]$signature.offset
        if ([int]$record.length -ne ([string]$signature.bytes).Length / 2 -or
            [string]$record.expectedBytesHex -cne [string]$signature.bytes -or
            [string]$record.bytesHex -cne $actualBytes.ToLowerInvariant() -or
            [string]$record.address -ine ('0x{0:x8}' -f $expectedAddress) -or
            $record.matched -ne $true -or $actualBytes.ToLowerInvariant() -cne [string]$signature.bytes) {
            throw ('Live instruction span does not match the REA-bound profile at +0x{0:x}' -f [int]$signature.offset)
        }
    }
    $callSite = [uint32]($windowStart + 0x17)
    $jumpSite = [uint32]($windowStart + 0xa1)
    if ((Convert-Hex32 ([string]$window.callSite.address) 'Internal CALL address') -ne $callSite -or
        [string]$window.callSite.bytesHex -cne 'ff975f030000' -or $window.callSite.matched -ne $true -or
        (Convert-Hex32 ([string]$window.jumpSite.address) 'Internal JMP address') -ne $jumpSite -or
        [string]$window.jumpSite.bytesHex -cne 'ff6612' -or $window.jumpSite.matched -ne $true) {
        throw 'Derived source sites do not match their validated runtime profile offsets'
    }

    $events = @($Capture.events)
    if ($events.Count -lt 3 -or $events.Count -gt 128 -or $Capture.eventCount -ne $events.Count) {
        throw 'No-TF event count is incomplete or exceeds the bounded hardware-event cap'
    }
    $eventMap = @{}
    for ($i = 0; $i -lt $events.Count; $i++) {
        $event = $events[$i]
        $order = [int]$event.eventOrder
        if ($order -ne ($i + 1) -or $event.firstChance -ne $true -or
            [string]$event.threadId -cne $owner -or -not $event.registers -or
            [string]$event.registers.threadId -cne $owner -or
            [string]$event.registers.eip -ine [string]$event.eip -or
            [string]$event.liveBytesHex -notmatch '^(?:[0-9a-fA-F]{2})+$' -or
            [string]$event.exceptionEvent.firstChance -cne '1') {
            throw "Candidate event $($i + 1) lacks ordered same-thread first-chance EIP/register/live-byte evidence"
        }
        $validSiteKindPair =
            ($event.kind -ceq 'source-hit' -and $event.site -cin @('PREMIUM-CALL-EDI+27', 'CALL-EDI+35F', 'JMP-ESI+12')) -or
            ($event.kind -ceq 'destination-hit' -and $event.site -cin @('PREMIUM-outer-destination', 'CALL-EDI+35F', 'JMP-ESI+12')) -or
            ($event.kind -ceq 'branch-hit' -and $event.site -ceq 'JC+8E')
        if (-not $validSiteKindPair) {
            throw "Candidate event $($i + 1) has an unrecognized site or event kind"
        }
        $slot = [int]$event.slot
        if (($order -eq 1 -and ($event.site -cne 'PREMIUM-CALL-EDI+27' -or $event.kind -cne 'source-hit' -or $slot -ne 0)) -or
            ($order -eq 2 -and ($event.site -cne 'PREMIUM-outer-destination' -or $event.kind -cne 'destination-hit' -or $slot -ne 0)) -or
            ($order -eq 3 -and ($event.site -cne 'JC+8E' -or $event.kind -cne 'branch-hit' -or $slot -ne 3)) -or
            ($order -gt 3 -and $event.site -ceq 'JC+8E') -or
            ($order -gt 2 -and $event.site -cin @('PREMIUM-CALL-EDI+27', 'PREMIUM-outer-destination'))) {
            throw "Candidate event $($i + 1) violates the outer-call and internal-edge event chronology"
        }
        $exceptionCode = [string]$event.exceptionEvent.code
        if ($exceptionCode -notin @('0x80000004', '0x4000001e')) {
            throw "Candidate event $($i + 1) was not a hardware single-step/debug-register event"
        }
        if (($event.kind -ceq 'branch-hit' -and $slot -ne 3) -or
            ($event.kind -cne 'branch-hit' -and ($slot -lt 0 -or $slot -gt 1))) {
            throw "Candidate event $($i + 1) used an unexpected debug-register slot"
        }
        $dr6 = [uint32](Convert-Hex32 ([string]$event.registers.dr6) 'Event DR6')
        $dr7 = [uint32](Convert-Hex32 ([string]$event.registers.dr7) 'Event DR7')
        $eflags = [uint32](Convert-Hex32 ([string]$event.registers.eflags) 'Event EFLAGS')
        if (($dr6 -band 0xf) -ne (1 -shl $slot) -or ($dr6 -band 0x4000) -ne 0 -or
            ($eflags -band 0x100) -ne 0 -or ($dr7 -band (1 -shl ($slot * 2))) -eq 0 -or
            ($dr7 -band (0xf -shl (16 + $slot * 4))) -ne 0) {
            throw "Candidate event $($i + 1) does not prove a no-TF hardware execute-breakpoint cause"
        }
        if ($order -gt 2) {
            $dr2 = Convert-Hex32 ([string]$event.registers.dr2) 'Continuation-guard DR2'
            if ($dr2 -ne $outerContinuation -or ($dr7 -band 0x30) -ne 0x10 -or
                ($dr7 -band (0xf -shl 24)) -ne 0) {
                throw "Internal event $($i + 1) does not retain the armed execute-only DR2 continuation guard"
            }
        }
        if ($event.kind -ceq 'branch-hit' -and
            (($dr7 -band 0xc0) -ne 0x40 -or ($dr7 -band (0xf -shl 28)) -ne 0)) {
            throw 'JC event did not use an active execute-only DR3 breakpoint'
        }
        if ($order -gt 3 -and ($dr7 -band 0xc0) -ne 0) {
            throw 'One-shot JC breakpoint remained enabled after the captured branch event'
        }
        $eventMap[$order] = $event
    }
    $jcAddress = [uint32]($windowStart + 0x8e)
    $branch = $Capture.branchObservation
    $branchEvents = @($events | Where-Object { $_.kind -ceq 'branch-hit' -and $_.site -ceq 'JC+8E' })
    if (-not $branch -or $branch.armed -ne $true -or $branch.hit -ne $true -or
        $branch.status -cne 'pre-JC-CF-and-candidate-slot-captured' -or
        $branchEvents.Count -ne 1 -or [int]$branchEvents[0].eventOrder -ne 3 -or
        (Convert-Hex32 ([string]$branch.address) 'JC address') -ne $jcAddress -or
        [string]$branchEvents[0].eip -ine ('0x{0:x8}' -f $jcAddress) -or
        [string]$branchEvents[0].liveBytesHex -cne '7209' -or
        $branch.branchOutcomeObserved -ne $false -or
        $branch.oneShotBreakpointDisabled -ne $true) {
        throw 'Required source-bound pre-JC hardware event is missing or does not match the exact branch site'
    }
    $branchEvent = $branchEvents[0]
    $branchEflags = [uint32](Convert-Hex32 ([string]$branchEvent.registers.eflags) 'JC event EFLAGS')
    $branchCarry = [int]$branch.carryFlag
    $eventCarry = if (($branchEflags -band 1) -ne 0) { 1 } else { 0 }
    $ediAtBranch = Convert-Hex32 ([string]$branchEvent.registers.edi) 'JC event EDI'
    $espAtBranch = Convert-Hex32 ([string]$branchEvent.registers.esp) 'JC event ESP'
    if ($ediAtBranch -lt 0x65) { throw 'JC event EDI underflows the CMP operand calculation' }
    if ($branchCarry -notin @(0, 1) -or $eventCarry -ne $branchCarry -or
        [int]$branchEvent.carryFlag -ne $branchCarry -or
        [string]$branchEvent.condition -cne [string]$branch.condition -or
        [string]$branch.condition -cne $(if ($branchCarry -eq 1) { 'JC-taken' } else { 'JC-not-taken' }) -or
        [string]$branchEvent.branchOutcomeObserved -cne 'False' -or
        [string]$branchEvent.registers.dr3 -ine ('0x{0:x8}' -f $jcAddress)) {
        throw 'Pre-JC CF, condition, or DR3 event context differs from the branch record'
    }
    $compareOperand = $branch.compareOperand
    $compareAddress = [uint32]($ediAtBranch - 0x65)
    $compareValue = Assert-DwordEvidence $compareOperand 'JC preceding CMP operand' $compareAddress
    if ($ediAtBranch -lt 0x65 -or
        $compareOperand.instruction -cne 'CMP [EDI-0x65],ESP' -or
        $compareOperand.baseRegister -cne 'EDI' -or
        [string]$compareOperand.baseValue -ine ('0x{0:x8}' -f $ediAtBranch) -or
        [string]$compareOperand.offset -cne '-0x00000065' -or
        [string]$compareOperand.esp -ine ('0x{0:x8}' -f $espAtBranch) -or
        [string]$compareOperand.instructionBytesHex -cne '39679b' -or
        $compareOperand.unsignedLessThan -ne ($compareValue -lt $espAtBranch) -or
        $compareOperand.carryMatchesUnsignedComparison -ne $true -or
        (($compareValue -lt $espAtBranch) -and $branchCarry -ne 1) -or
        (-not ($compareValue -lt $espAtBranch) -and $branchCarry -ne 0)) {
        throw 'JC event does not bind CF to the exact immediately preceding unsigned CMP operands'
    }
    $candidateOperand = $branch.candidateCallOperand
    if ([uint64]$ediAtBranch + 0x35f -gt [uint32]::MaxValue) {
        throw 'JC event EDI overflows the candidate CALL slot address'
    }
    $candidateAddress = [uint32]($ediAtBranch + 0x35f)
    $candidateTarget = Assert-DwordEvidence $candidateOperand 'JC candidate CALL slot' $candidateAddress
    if ($candidateOperand.baseRegister -cne 'EDI' -or
        [string]$candidateOperand.baseValue -ine ('0x{0:x8}' -f $ediAtBranch) -or
        [string]$candidateOperand.offset -ine '0x0000035f' -or
        (Convert-Hex32 ([string]$branch.candidateCallTarget) 'JC candidate CALL target') -ne $candidateTarget -or
        [string]$branchEvent.candidateCallOperand.address -ine [string]$candidateOperand.address -or
        [string]$branchEvent.candidateCallOperand.bytesHex -cne [string]$candidateOperand.bytesHex -or
        [string]$branchEvent.candidateCallTarget -ine [string]$branch.candidateCallTarget) {
        throw 'JC candidate [EDI+0x35f] slot was not captured and repeated consistently'
    }
    $expectedSuccessorOffset = if ($branchCarry -eq 1) { 0x99 } else { 0x90 }
    $expectedSuccessor = [uint32]($windowStart + $expectedSuccessorOffset)
    if ((Convert-Hex32 ([string]$branch.predictedSuccessorAddress) 'JC predicted successor') -ne $expectedSuccessor) {
        throw 'JC predicted successor does not follow the captured CF and exact branch bytes'
    }
    $branchArm = $branch.armReadback
    $branchArmDr7 = [uint32](Convert-Hex32 ([string]$branchArm.dr7) 'JC arm DR7')
    $branchDisable = $branch.disableReadback
    $branchDisableDr7 = [uint32](Convert-Hex32 ([string]$branchDisable.dr7) 'JC one-shot disable DR7')
    if ([string]$branchArm.threadId -cne $owner -or
        [string]$branchArm.dr3 -ine ('0x{0:x8}' -f $jcAddress) -or
        ($branchArmDr7 -band 0xff) -ne 0x55 -or
        ($branchArmDr7 -band (0xf -shl 28)) -ne 0 -or
        [string]$branchDisable.threadId -cne $owner -or
        [string]$branchDisable.dr3 -ine ('0x{0:x8}' -f $jcAddress) -or
        ($branchDisableDr7 -band 0xff) -ne 0x15 -or
        ($branchDisableDr7 -band (0xf -shl 28)) -ne 0 -or
        (([uint32](Convert-Hex32 ([string]$branchDisable.eflags) 'JC disable EFLAGS') -band 0x100) -ne 0) -or
        (([uint32](Convert-Hex32 ([string]$branchDisable.dr6) 'JC disable DR6') -band 0xf) -ne 0)) {
        throw 'JC breakpoint was not armed in DR3 and disabled one-shot with the other source/guard slots preserved'
    }
    $outerCallEvents = @($events | Where-Object { $_.site -ceq 'PREMIUM-CALL-EDI+27' -and $_.kind -ceq 'source-hit' })
    $outerDestinationEvents = @($events | Where-Object { $_.site -ceq 'PREMIUM-outer-destination' -and $_.kind -ceq 'destination-hit' })
    if ($outerCallEvents.Count -ne 1 -or $outerDestinationEvents.Count -ne 1 -or
        [int]$outerCallEvents[0].eventOrder -ne 1 -or [int]$outerDestinationEvents[0].eventOrder -ne 2 -or
        $outerCallEvents[0].liveBytesHex -cne 'ff5727' -or
        [string]$outerCallEvents[0].threadId -cne $owner -or
        [string]$outerCallEvents[0].registers.eip -ine ('0x{0:x8}' -f $callAddress) -or
        [string]$outerDestinationEvents[0].eip -ine [string]$outer.targetEip -or
        [string]$outerDestinationEvents[0].threadId -cne $owner -or
        [string]$outerDestinationEvents[0].registers.esp -ine ('0x{0:x8}' -f $outerDestinationEsp) -or
        [string]$outerCallEvents[0].operand.address -ine [string]$callSlot.address -or
        [string]$outerCallEvents[0].operand.bytesHex -cne [string]$callSlot.bytesHex -or
        [string]$outerCallEvents[0].operand.value -cne [string]$callSlot.value) {
        throw 'Outer CALL source and destination event records do not match the live source-bound addresses'
    }
    Assert-ReadablePage $outerDestinationEvents[0].targetPage 'Outer destination event'
    $eventOuterReturn = Assert-DwordEvidence $outerDestinationEvents[0].returnAddressAtEsp 'Outer destination event [ESP]' $outerDestinationEsp
    if ($eventOuterReturn -ne $outerReturn -or
        [string]$outerDestinationEvents[0].liveBytesHex -cne [string]$outerDestinationEvents[0].targetPage.bytesHex) {
        throw 'Outer destination event page or return-stack evidence differs from the validated destination record'
    }
    $outerArmDr7 = [uint32](Convert-Hex32 ([string]$Capture.call.armedContextReadback.dr7) 'Outer arm DR7')
    if ([string]$Capture.call.armedContextReadback.threadId -cne $owner -or
        [string]$Capture.call.armedContextReadback.dr0 -ine ('0x{0:x8}' -f $callAddress) -or
        (($outerArmDr7 -band 0xff) -ne 0x1) -or (($outerArmDr7 -band 0xf0000) -ne 0) -or
        (([uint32](Convert-Hex32 ([string]$Capture.call.armedContextReadback.eflags) 'Outer arm EFLAGS') -band 0x100) -ne 0)) {
        throw 'Outer call-site breakpoint arm readback is incomplete or has TF set'
    }

    $guard = $Capture.outerReturnGuard
    $guardAddress = Convert-Hex32 ([string]$guard.address) 'Outer-return continuation guard address'
    $guardDr7 = [uint32](Convert-Hex32 ([string]$guard.armReadback.dr7) 'Return-guard arm DR7')
    if ($guard.armed -ne $true -or $guard.hit -ne $false -or
        $guard.status -cne 'armed-not-observed-before-JC-capture' -or $guardAddress -ne $outerContinuation -or
        [string]$guard.armReadback.threadId -cne $owner -or
        [string]$guard.armReadback.dr0 -ine ('0x{0:x8}' -f $callSite) -or
        [string]$guard.armReadback.dr1 -ine ('0x{0:x8}' -f $jumpSite) -or
        [string]$guard.armReadback.dr2 -ine ('0x{0:x8}' -f $outerContinuation) -or
        (([uint32](Convert-Hex32 ([string]$guard.armReadback.eflags) 'Return-guard EFLAGS') -band 0x100) -ne 0) -or
        ($guardDr7 -band 0x30) -ne 0x10 -or ($guardDr7 -band (0xf -shl 24)) -ne 0) {
        throw 'Outer continuation guard was not armed and read back in DR2 before the JC capture'
    }
    $siteNames = @('CALL-EDI+35F', 'JMP-ESI+12')
    $sites = @($Capture.sites)
    $edges = @($Capture.edges)
    if ($sites.Count -ne 2 -or $edges.Count -ne 0) {
        throw 'JC-only no-TF capture unexpectedly contains internal transfer edges'
    }
    $edgeSourceOrders = @{}
    $edgeDestinationOrders = @{}
    foreach ($siteName in $siteNames) {
        $siteRecords = @($sites | Where-Object { $_.name -ceq $siteName })
        if ($siteRecords.Count -ne 1) { throw "No unique site record for $siteName" }
        $site = $siteRecords[0]
        $expectedOffset = if ($siteName -ceq 'CALL-EDI+35F') { 0x17 } else { 0xa1 }
        $expectedAddress = if ($siteName -ceq 'CALL-EDI+35F') { $callSite } else { $jumpSite }
        $expectedBytes = if ($siteName -ceq 'CALL-EDI+35F') { 'ff975f030000' } else { 'ff6612' }
        $sourceEvents = @($events | Where-Object { $_.kind -ceq 'source-hit' -and $_.site -ceq $siteName })
        $siteEdges = @($edges | Where-Object { $_.site -ceq $siteName })
        $requiredSite = $false
        $siteHasHits = $sourceEvents.Count -gt 0
        if ($site.offset -ne $expectedOffset -or
            (Convert-Hex32 ([string]$site.address) "$siteName address") -ne $expectedAddress -or
            $site.expectedBytesHex -cne $expectedBytes -or
            ($siteHasHits -and $site.status -cne 'hit') -or
            (-not $siteHasHits -and $site.status -cne 'armed') -or
            $site.hitCount -ne $sourceEvents.Count -or $site.destinationHitCount -ne $siteEdges.Count -or
            ($requiredSite -and $sourceEvents.Count -lt 1) -or
            $sourceEvents.Count -gt 32 -or $siteEdges.Count -ne $sourceEvents.Count) {
            throw "$siteName source hit count, destination count, offset, or signature is invalid"
        }
        foreach ($source in $sourceEvents) {
            if ([string]$source.eip -ine ('0x{0:x8}' -f $expectedAddress) -or
                $source.liveBytesHex -cne $expectedBytes -or
                [string]$source.eipOffsetFromWindow -cne [string]$expectedOffset -or
                $source.hitCount -lt 1 -or $source.hitCount -gt 32 -or
                $source.operand.readError -ne $null) {
                throw "$siteName source hit lacks exact live instruction, offset, hit count, or operand read"
            }
            $registerName = if ($siteName -ceq 'CALL-EDI+35F') { 'EDI' } else { 'ESI' }
            $operandOffset = if ($siteName -ceq 'CALL-EDI+35F') { 0x35f } else { 0x12 }
            $baseRegister = if ($registerName -ceq 'EDI') { $source.registers.edi } else { $source.registers.esi }
            $baseValue = Convert-Hex32 ([string]$source.operand.baseValue) "$siteName operand base"
            $operandAddress = Convert-Hex32 ([string]$source.operand.address) "$siteName operand address"
            $target = Assert-DwordEvidence $source.operand "$siteName computed operand" ([uint32]$operandAddress)
            if ($source.operand.baseRegister -cne $registerName -or
                [string]$source.operand.offset -ine ('0x{0:x8}' -f $operandOffset) -or
                [string]$baseRegister -ine [string]$source.operand.baseValue -or
                [uint64]$operandAddress -ne ([uint64]$baseValue + [uint64]$operandOffset) -or
                $target -eq 0 -or [string]$source.resolvedTarget -ine ('0x{0:x8}' -f $target)) {
                throw "$siteName dynamic operand was not derived from the correct live register and displacement"
            }
            Assert-ReadablePage $source.targetPage "$siteName destination"
            if ([string]$source.targetPage.address -ine [string]$source.resolvedTarget) {
                throw "$siteName resolved target page preview does not match the operand"
            }
            if ([string]$source.registers.eip -ine [string]$source.eip -or
                [string]$source.threadId -cne $owner) {
                throw "$siteName source event register context differs from its captured EIP or owner thread"
            }
            $armReadback = $source.destinationArmReadback
            $armDr7 = [uint32](Convert-Hex32 ([string]$armReadback.dr7) "$siteName destination-arm DR7")
            $armSlot = if ($siteName -ceq 'CALL-EDI+35F') { 0 } else { 1 }
            $armSlotName = "dr$armSlot"
            if ([string]$armReadback.threadId -cne $owner -or
                [string]$armReadback.$armSlotName -ine [string]$source.resolvedTarget -or
                (Convert-Hex32 ([string]$armReadback.dr2) "$siteName retained guard DR2") -ne $outerContinuation -or
                ($armDr7 -band (3 -shl 4)) -ne 0x10 -or ($armDr7 -band (0xf -shl 24)) -ne 0 -or
                (([uint32](Convert-Hex32 ([string]$armReadback.eflags) "$siteName arm EFLAGS") -band 0x100) -ne 0)) {
                throw "$siteName destination-arm readback did not preserve the exact DR2 continuation guard"
            }
        }
        foreach ($edge in $siteEdges) {
            $sourceOrder = [int]$edge.sourceEventOrder
            $destinationOrder = [int]$edge.destinationEventOrder
            if ($edgeSourceOrders.ContainsKey($sourceOrder) -or $edgeDestinationOrders.ContainsKey($destinationOrder)) {
                throw 'No-TF edge records reuse a source or destination event'
            }
            $edgeSourceOrders[$sourceOrder] = $true
            $edgeDestinationOrders[$destinationOrder] = $true
            if (-not $eventMap.ContainsKey($sourceOrder) -or -not $eventMap.ContainsKey($destinationOrder) -or
                $destinationOrder -ne ($sourceOrder + 1) -or $edge.sameThread -ne $true -or
                $edge.firstChance -ne $true -or $edge.dr6BsSet -ne $false -or
                [string]$edge.threadId -cne $owner -or
                [string]$edge.sourceAddress -ine ('0x{0:x8}' -f $expectedAddress)) {
                throw "$siteName source/destination event ordering or same-thread evidence is invalid"
            }
            $source = $eventMap[$sourceOrder]
            $destination = $eventMap[$destinationOrder]
            if ($source.kind -cne 'source-hit' -or $source.site -cne $siteName -or
                $destination.kind -cne 'destination-hit' -or $destination.site -cne $siteName -or
                [string]$source.resolvedTarget -ine [string]$edge.targetAddress -or
                [string]$destination.eip -ine [string]$edge.targetAddress -or
                [string]$destination.threadId -cne [string]$source.threadId -or
                [int]$destination.slot -ne [int]$source.slot -or
                [string]$source.registers.eip -ine ('0x{0:x8}' -f $expectedAddress) -or
                [string]$destination.registers.eip -ine [string]$destination.eip) {
                throw "$siteName destination event does not validate the resolved dynamic target"
            }
            Assert-ReadablePage $edge.targetPage "$siteName destination edge"
            Assert-ReadablePage $destination.targetPage "$siteName destination event"
            if ([string]$edge.targetPage.address -ine [string]$edge.targetAddress -or
                [string]$destination.targetPage.address -ine [string]$edge.targetAddress -or
                [string]$destination.liveBytesHex -cne [string]$destination.targetPage.bytesHex -or
                [string]$edge.targetPage.bytesHex -cne [string]$destination.targetPage.bytesHex) {
                throw "$siteName destination page evidence does not match the live destination event"
            }
            $sourceEsp = [uint32](Convert-Hex32 ([string]$source.registers.esp) "$siteName source event ESP")
            $destinationEsp = [uint32](Convert-Hex32 ([string]$destination.registers.esp) "$siteName destination event ESP")
            $edgeSourceEsp = [uint32](Convert-Hex32 ([string]$edge.sourceEsp) "$siteName edge source ESP")
            $edgeDestinationEsp = [uint32](Convert-Hex32 ([string]$edge.targetEsp) "$siteName edge destination ESP")
            if ($sourceEsp -ne $edgeSourceEsp -or $destinationEsp -ne $edgeDestinationEsp) {
                throw "$siteName edge ESP summary differs from the actual source/destination register contexts"
            }
            if ($siteName -ceq 'CALL-EDI+35F') {
                $siteAddress = Convert-Hex32 ([string]$edge.sourceAddress) "$siteName source address"
                if ($edge.hardwareBreakpointSlot -ne 0 -or $sourceEsp -lt 4 -or
                    $destinationEsp -ne ($sourceEsp - 4) -or $edge.espDecrementedByFour -ne $true -or
                    $edge.returnAddressMatchesSitePlusSix -ne $true) {
                    throw 'Inner CALL destination did not validate ESP-4 and [ESP]=site+6'
                }
                $callReturn = Assert-DwordEvidence $edge.returnAddressAtEsp "$siteName callee return" ([uint32]$destinationEsp)
                if ($callReturn -ne [uint32]($siteAddress + 6)) { throw 'Inner CALL destination stack value does not equal site+6' }
            } else {
                if ($edge.hardwareBreakpointSlot -ne 1 -or $edge.espUnchanged -ne $true -or
                    $sourceEsp -ne $destinationEsp -or $sourceEsp -ne $outerDestinationEsp) {
                    throw 'Inner JMP source/destination event did not preserve the original outer destination ESP'
                }
                $siteAddress = Convert-Hex32 ([string]$edge.sourceAddress) "$siteName source address"
                $sourceStack = Assert-DwordEvidence $source.stackAtEsp "$siteName source [ESP]" $sourceEsp
                $destinationStack = Assert-DwordEvidence $destination.stackAtEsp "$siteName destination [ESP]" $destinationEsp
                $edgeSourceStack = Assert-DwordEvidence $edge.sourceStackAtEsp "$siteName edge source [ESP]" $sourceEsp
                $edgeDestinationStack = Assert-DwordEvidence $edge.targetStackAtEsp "$siteName edge destination [ESP]" $destinationEsp
                foreach ($stackValue in @($sourceStack, $destinationStack, $edgeSourceStack, $edgeDestinationStack)) {
                    if ($stackValue -ne $outerReturn) { throw 'Tail-JMP stack dword differs from the original outer CALL continuation' }
                }
                if ([string]$edge.sourceStackAtEsp.bytesHex -cne [string]$source.stackAtEsp.bytesHex -or
                    [string]$edge.targetStackAtEsp.bytesHex -cne [string]$destination.stackAtEsp.bytesHex) {
                    throw 'Tail-JMP edge stack bytes differ from the source and destination event reads'
                }
            }
        }
    }
    $tailEdges = @($edges | Where-Object { $_.site -ceq 'JMP-ESI+12' })
    if ($tailEdges.Count -ne 0 -or $events.Count -ne 3 -or
        $events[2].kind -cne 'branch-hit' -or $events[2].site -cne 'JC+8E') {
        throw 'The accepted JC capture must terminate after its single pre-branch event and before inner transfer execution'
    }
    if (@($edges | Where-Object { $_.site -cnotin $siteNames }).Count -ne 0 -or
        @($events | Where-Object { $_.kind -ceq 'source-hit' -and $_.site -in $siteNames }).Count -ne $edges.Count -or
        @($events | Where-Object { $_.kind -ceq 'destination-hit' -and $_.site -in $siteNames }).Count -ne $edges.Count) {
        throw 'No-TF internal source, destination, and edge records are not one-to-one'
    }
    if (@($Capture.debugStateRestorations).Count -lt 1) {
        throw 'No exact saved debug-register restoration record was emitted'
    }
    foreach ($restoration in @($Capture.debugStateRestorations)) {
        if ($restoration.exactMatch -ne $true -or
            [string]$restoration.saved.threadId -cne [string]$restoration.restored.threadId -or
            @('dr0','dr1','dr2','dr3','dr6','dr7' | Where-Object {
                [string]$restoration.saved.$_ -cne [string]$restoration.restored.$_
            }).Count -ne 0) {
            throw 'A thread debug-register save/restore record is missing or differs from the exact saved DR state'
        }
    }
    return $true
}

function Read-FunctionWindows([uint32]$ProcessId, [string]$MetadataText, [string]$OutputRoot, [object]$MethodIndices) {
    if (-not ('AaronPremiumMetadataReaderV2' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class AaronPremiumMetadataReaderV2 {
    [StructLayout(LayoutKind.Sequential)] public struct Region {
        public IntPtr BaseAddress, AllocationBase;
        public uint AllocationProtect;
        public UIntPtr RegionSize;
        public uint State, Protect, Type;
    }
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool ReadProcessMemory(IntPtr process, IntPtr address, [Out] byte[] bytes, UIntPtr size, out UIntPtr read);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, out Region region, UIntPtr size);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    public static Region Query(uint pid, ulong address) {
        IntPtr process = OpenProcess(0x410, false, pid);
        if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
            Region region;
            if (VirtualQueryEx(process, new IntPtr((long)address), out region,
                (UIntPtr)Marshal.SizeOf(typeof(Region))).ToUInt64() == 0)
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return region;
        } finally { CloseHandle(process); }
    }
    public static byte[] Read(uint pid, ulong address, int count) {
        Region region = Query(pid, address);
        ulong start = unchecked((ulong)region.BaseAddress.ToInt64());
        ulong end = start + region.RegionSize.ToUInt64();
        if (region.State != 0x1000 || (region.Protect & 0x101) != 0 ||
            count <= 0 || address + (ulong)count > end)
            throw new InvalidOperationException("Requested bytes are outside one readable committed memory region");
        IntPtr process = OpenProcess(0x410, false, pid);
        if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
            byte[] bytes = new byte[count]; UIntPtr read;
            if (!ReadProcessMemory(process, new IntPtr((long)address), bytes,
                (UIntPtr)count, out read) || read.ToUInt64() != (ulong)count)
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return bytes;
        } finally { CloseHandle(process); }
    }
}
'@
    }
    $headers = @{}
    foreach ($match in [regex]::Matches($MetadataText,
        '(?m)^HEADER name="(SELECT-SUBJECT-METHOD-[0-9]+|PICK)" bytes=([0-9a-fA-F]{128})\r?$')) {
        $name = $match.Groups[1].Value
        if ($headers.ContainsKey($name)) { throw "Duplicate current function header: $name" }
        $headers[$name] = $match.Groups[2].Value.ToLowerInvariant()
    }
    if ($headers.Count -ne 3 -or -not $headers.ContainsKey('PICK')) {
        throw 'Current CLOS metadata must supply exactly two method headers plus PICK'
    }
    $nativeRoot = Join-Path $OutputRoot 'native-code'
    if (Test-Path -LiteralPath $nativeRoot) { throw 'Observer native-code output already exists; preserve it' }
    [IO.Directory]::CreateDirectory($nativeRoot) | Out-Null
    [IO.File]::WriteAllBytes((Join-Path $nativeRoot 'ready-metadata.bin'),
        [Text.UTF8Encoding]::new($false).GetBytes($MetadataText))
    $records = @()
    $currentNames = @("SELECT-SUBJECT-METHOD-$($MethodIndices.freeIndex)",
        "SELECT-SUBJECT-METHOD-$($MethodIndices.premiumIndex)", 'PICK')
    foreach ($name in $currentNames) {
        if (-not $headers.ContainsKey($name)) { throw "Current metadata lacks $name" }
        $hex = $headers[$name]
        $header = [byte[]]@(0..63 | ForEach-Object { [Convert]::ToByte($hex.Substring($_ * 2, 2), 16) })
        $entry = [uint64][BitConverter]::ToUInt32($header, 18)
        $taggedVector = [uint64][BitConverter]::ToUInt32($header, 30)
        if ($entry -lt 64 -or ($taggedVector -band 7) -ne 2) {
            throw "Current $name function header has an invalid entry/vector candidate"
        }
        $vectorBase = $taggedVector - 2
        $vectorFirstWord = [AaronPremiumMetadataReaderV2]::Read($ProcessId, $vectorBase, 4)
        $region = [AaronPremiumMetadataReaderV2]::Query($ProcessId, $entry)
        $regionBase = [uint64]$region.BaseAddress.ToInt64()
        $regionEnd = $regionBase + $region.RegionSize.ToUInt64()
        $windowBase = [Math]::Max($regionBase, $entry - 64)
        $span = [int][Math]::Min(16384, $regionEnd - $windowBase)
        $bytes = [AaronPremiumMetadataReaderV2]::Read($ProcessId, $windowBase, $span)
        $file = $name.ToLowerInvariant() + '.native-window.bin'
        $filePath = Join-Path $nativeRoot $file
        [IO.File]::WriteAllBytes($filePath, $bytes)
        $records += [ordered]@{
            name = $name; functionObjectHeaderHex = $hex
            entryCandidate = ('0x{0:x}' -f $entry)
            taggedVectorCandidate = ('0x{0:x}' -f $taggedVector)
            vectorBaseCandidate = ('0x{0:x}' -f $vectorBase)
            vectorCandidateFirstWord = ('0x{0:x}' -f [BitConverter]::ToUInt32($vectorFirstWord, 0))
            windowBase = ('0x{0:x}' -f $windowBase)
            bytes = $bytes.Length; regionBase = ('0x{0:x}' -f $regionBase)
            regionSize = $region.RegionSize.ToUInt64(); regionProtect = ('0x{0:x}' -f $region.Protect)
            file = $file; sha256 = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
    $manifestPathCurrent = Join-Path $nativeRoot 'capture-manifest.json'
    $manifestValue = [ordered]@{
        schemaVersion = 1
        method = 'Live function headers read from the runner-owned READY report; bounded ReadProcessMemory snapshots, no memory writes'
        runtimeExecutable = (Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe')
        processId = $ProcessId
        metadataSha256 = (Get-FileHash -LiteralPath (Join-Path $nativeRoot 'ready-metadata.bin') -Algorithm SHA256).Hash.ToLowerInvariant()
        functions = $records
    }
    [IO.File]::WriteAllText($manifestPathCurrent, ($manifestValue | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{ root = $nativeRoot; manifest = $manifestPathCurrent; functions = $records }
}

function Assert-MetadataReady([string]$MetadataText) {
    $normalized = $MetadataText.Replace("`r`n", "`n")
    if ($normalized.Contains("`r") -or -not $normalized.EndsWith("`n") -or
        -not $normalized.StartsWith("BEGIN premium-callsite-metadata-v1`n") -or
        -not $normalized.Contains("INSTALL target=SELECT-SUBJECT+PICK mode=READ-ONLY-METADATA`n") -or
        -not $normalized.Contains("METHOD-COUNT total=2 emitted=2 limit=64 status=:COMPLETE truncated=NIL`n") -or
        -not $normalized.Contains("ENUMERATION-STATUS :COMPLETE`n") -or
        -not $normalized.Contains("ERROR-COUNT 0`n") -or
        -not $normalized.Contains("TRUNCATION-COUNT 0`n") -or
        -not $normalized.Contains("READY premium-callsite-metadata-v1`n")) {
        throw 'READY metadata does not contain a complete two-method CLOS census with zero errors/truncation'
    }
    $premium = @([regex]::Matches($normalized,
        '(?m)^SPECIALIZERS index=([0-9]+) values=\(\(:EQL \(:SYMBOL "COMMON-GRAPHICS-USER" "PREMIUM"\)\)\)$'))
    $free = @([regex]::Matches($normalized,
        '(?m)^SPECIALIZERS index=([0-9]+) values=\(\(:EQL \(:SYMBOL "COMMON-GRAPHICS-USER" "FREE"\)\)\)$'))
    if ($premium.Count -ne 1 -or $free.Count -ne 1 -or $premium[0].Groups[1].Value -eq $free[0].Groups[1].Value) {
        throw 'Live CLOS census does not uniquely identify the FREE and PREMIUM method indices'
    }
    foreach ($index in @($premium[0].Groups[1].Value, $free[0].Groups[1].Value)) {
        $name = "SELECT-SUBJECT-METHOD-$index"
        if (-not $normalized.Contains("METHOD index=$index type=STANDARD-METHOD`n") -or
            -not $normalized.Contains("FUNCTION name=`"$name`" type=COMPILED-FUNCTION`n") -or
            @([regex]::Matches($normalized, "(?m)^HEADER name=`"$name`" bytes=[0-9a-f]{128}$")).Count -ne 1) {
            throw "Live CLOS method $index has no unique STANDARD-METHOD compiled-function header"
        }
    }
    if (@([regex]::Matches($normalized, '(?m)^HEADER name="(SELECT-SUBJECT-METHOD-[0-9]+|PICK)" bytes=[0-9a-f]{128}$')).Count -ne 3 -or
        -not $normalized.Contains(('FUNCTION name="PICK" type=COMPILED-FUNCTION' + "`n"))) {
        throw 'READY metadata does not contain exactly two method payload headers and one PICK header'
    }
    return [pscustomobject]@{ premiumIndex = [int]$premium[0].Groups[1].Value; freeIndex = [int]$free[0].Groups[1].Value }
}

function Invoke-PremiumCapture([string]$OutputRoot, [string]$RunId, $Ready, [string]$MetadataText, [byte[]]$MetadataBytes) {
    $methodIndices = Assert-MetadataReady $MetadataText
    $requestSha256 = Assert-ReadyRequest $Ready $OutputRoot $RunId
    if ((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $coordinatorSha256 -or
        (Get-FileHash -LiteralPath $debuggerPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $debuggerSha256 -or
        (Get-FileHash -LiteralPath $mapperPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $mapperSha256 -or
        (Get-FileHash -LiteralPath $reaCensusPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $reaCensusSha256 -or
        (Get-FileHash -LiteralPath $reaWideWindowPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $reaWideWindowSha256 -or
        (Get-FileHash -LiteralPath $reaWideWindowAnalysisPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $reaWideWindowAnalysisSha256 -or
        (Get-FileHash -LiteralPath $branchSnapshotPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $boundTargetWindow.branchSnapshotSha256) {
        throw 'A source-bound debugger, REA census/window evidence, or mapper input changed during this run'
    }
    $currentBoundWindow = Get-BoundTargetWindowEvidence
    if ($currentBoundWindow.start -ne $boundTargetWindow.start -or
        $currentBoundWindow.sha256 -cne $boundTargetWindow.sha256) {
        throw 'The recomputed REA-bound source window changed after no-launch preflight'
    }
    $runtimePll = Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.pll'
    if ((Get-FileHash -LiteralPath $runtimePll -Algorithm SHA256).Hash.ToLowerInvariant() -cne $runtimeManifest['AARON.pll'].sha256) {
        throw 'Observer runtime AARON.pll differs from its extracted manifest'
    }
    $live = Read-FunctionWindows ([uint32]$Ready.process.Id) $MetadataText $OutputRoot $methodIndices
    $mappedRoot = Join-Path $live.root 'mapped'
    $mapStdout = Join-Path $logRoot 'observer.map.stdout.txt'
    $mapStderr = Join-Path $logRoot 'observer.map.stderr.txt'
    & node $mapperPath $live.manifest $runtimePll $mappedRoot 1> $mapStdout 2> $mapStderr
    $mapExit = $LASTEXITCODE
    if ($mapExit -ne 0) { throw "Live payload-to-PLL mapping failed (exit $mapExit); inspect $mapStderr" }
    $mapPath = Join-Path $mappedRoot 'native-code-map.json'
    $map = Get-Content -LiteralPath $mapPath -Raw | ConvertFrom-Json
    if ($map.schemaVersion -ne 1 -or $map.pll.sha256 -cne $runtimeManifest['AARON.pll'].sha256 -or
        @($map.functions).Count -ne 3) { throw 'Current native payload map is not bound to this run PLL and three live functions' }
    $premiumName = "SELECT-SUBJECT-METHOD-$($methodIndices.premiumIndex)"
    $premium = @($map.functions | Where-Object { $_.name -ceq $premiumName })
    $pick = @($map.functions | Where-Object { $_.name -ceq 'PICK' })
    if ($premium.Count -ne 1 -or $pick.Count -ne 1) { throw 'Live map lacks unique PREMIUM or PICK function payloads' }
    if ($premium[0].payloadBytes -ne 362 -or $premium[0].objectBytes -ne 366 -or
        -not $premium[0].uniqueCompleteObjectByteMatch) {
        throw 'Current PREMIUM method is not the unique complete 362-byte payload / 366-byte PLL object'
    }
    if (-not $pick[0].uniqueCompleteObjectByteMatch -or $pick[0].payloadBytes -lt 1) {
        throw 'Current PICK function does not have one unique complete PLL object match'
    }
    $premiumPayloadPath = Join-Path $mappedRoot $premium[0].payloadFile
    $pickPayloadPath = Join-Path $mappedRoot $pick[0].payloadFile
    $premiumPayload = [IO.File]::ReadAllBytes($premiumPayloadPath)
    $pickPayload = [IO.File]::ReadAllBytes($pickPayloadPath)
    if ($premiumPayload.Length -ne 362 -or
        (Get-Sha256Bytes $premiumPayload) -cne $premium[0].payloadSha256 -or
        (Get-Sha256Bytes $pickPayload) -cne $pick[0].payloadSha256) {
        throw 'Mapped PREMIUM or PICK payload file does not match its derived report hash'
    }
    # The REA/Ghidra static census binds this instruction boundary to the
    # exact PREMIUM payload hash. Current live bytes must then match that full
    # payload and the exact CALL encoding before computing a runtime address.
    $reaCensus = Get-Content -LiteralPath $reaCensusPath -Raw | ConvertFrom-Json
    if ($reaCensus.schemaVersion -ne 1 -or $reaCensus.status -cne 'validated-static-callsite-census-targets-unresolved' -or
        -not $reaCensus.summary.allInputsStaticOnlyAndNotExecuted) {
        throw 'REA static callsite census is missing or not explicitly static-only'
    }
    $reaMethods = @($reaCensus.methods | Where-Object {
        $_.method -ceq 'SELECT-SUBJECT-METHOD-1' -and $_.specializer.symbol -ceq 'PREMIUM'
    })
    if ($reaMethods.Count -ne 1 -or
        $reaMethods[0].sourceBinding.originalPll.sha256 -cne $runtimeManifest['AARON.pll'].sha256 -or
        $reaMethods[0].sourceBinding.originalPayload.bytes -ne 362 -or
        $reaMethods[0].sourceBinding.originalPayload.sha256 -cne $premium[0].payloadSha256) {
        throw 'REA method binding does not match this live PREMIUM payload and run PLL'
    }
    $reaCallsites = @($reaMethods[0].calls | Where-Object {
        $_.instruction -match ': CALL dword ptr \[EDI \+ 0x27\]$'
    })
    if ($reaCallsites.Count -ne 1 -or $reaCallsites[0].mechanism -cne 'computed' -or
        $reaCallsites[0].status -cne 'unresolved' -or @($reaCallsites[0].targets).Count -ne 0) {
        throw 'REA census does not identify one exact computed CALL [EDI+0x27] site in the PREMIUM payload'
    }
    $reaMethodEntry = Convert-Hex32 ([string]$reaMethods[0].entry) 'REA PREMIUM payload entry'
    $reaCallAddress = Convert-Hex32 ([string]$reaCallsites[0].address) 'REA PREMIUM callsite'
    if ($reaCallAddress -le $reaMethodEntry) { throw 'REA callsite precedes its method entry' }
    $callOffset = [int]($reaCallAddress - $reaMethodEntry)
    if ($callOffset -ne 200 -or $callOffset + 3 -gt $premiumPayload.Length -or
        ([BitConverter]::ToString($premiumPayload, $callOffset, 3)).Replace('-', '').ToLowerInvariant() -cne 'ff5727') {
        throw 'Current complete PREMIUM payload bytes at the REA instruction boundary do not equal FF 57 27'
    }
    $premiumEntry = Convert-Hex32 ([string]$premium[0].runtime.entry) 'Current PREMIUM entry'
    $pickEntry = Convert-Hex32 ([string]$pick[0].runtime.entry) 'Current PICK entry'
    $callAddress64 = $premiumEntry + [uint64]$callOffset
    if ($callAddress64 -gt [uint32]::MaxValue -or $callAddress64 + 3 -gt $premiumEntry + $premiumPayload.Length) {
        throw 'Derived current call site exceeds its complete PREMIUM payload or 32-bit address space'
    }
    $callAddress = [uint32]$callAddress64
    $requestSha256 = Assert-ReadyRequest $Ready $OutputRoot $RunId
    $debuggerTypeName = 'AaronPremiumInternalTransferBreakpointV3'
    if ($debuggerTypeName -as [type]) {
        throw 'No-TF helper type was already loaded in PowerShell; refusing to use an assembly not proven from this source hash'
    }
    if ((Get-FileHash -LiteralPath $debuggerPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $debuggerSha256) {
        throw 'No-TF helper source hash changed immediately before Add-Type'
    }
    Add-Type -Path $debuggerPath -ErrorAction Stop
    $loadedHelperType = $debuggerTypeName -as [type]
    if ($null -eq $loadedHelperType -or
        (Get-FileHash -LiteralPath $debuggerPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $debuggerSha256) {
        throw 'Loaded no-TF helper is absent or its source file changed during Add-Type'
    }
    $loadedHelperAssemblyIdentity = $loadedHelperType.Assembly.FullName
    try {
        $captureResult = [AaronPremiumInternalTransferBreakpointV3]::Capture(
            [uint32]$Ready.process.Id, $callAddress, [uint32]$pickEntry, $releasePath,
            [string]$Ready.requestPath, [string]$requestSha256, [string]$RunId,
            [string]$Ready.request.runtimeExecutable, [uint32]$currentBoundWindow.start,
            [string]$currentBoundWindow.sha256, [string]$currentBoundWindow.profileSha256, $CaptureSeconds)
    } catch {
        $exceptionPath = Join-Path $live.root 'debugger-capture-exception.txt'
        [IO.File]::WriteAllText($exceptionPath, $_.Exception.ToString(), [Text.UTF8Encoding]::new($false))
        throw "No-TF debugger helper threw before returning a capture result; inspect $exceptionPath"
    }
    try {
        $null = Assert-InternalTransferCapture $captureResult $callAddress ([uint32]$pickEntry) `
            ([uint32]$currentBoundWindow.start) ([string]$currentBoundWindow.sha256) `
            ([string]$currentBoundWindow.profileSha256) $RunId $requestSha256 ([string]$Ready.request.runtimeExecutable)
    } catch {
        $diagnosticPath = Join-Path $live.root 'debugger-capture-diagnostic.json'
        $diagnostic = [ordered]@{
            schemaVersion = 1
            tripletId = $tripletId
            runId = $RunId
            processId = $Ready.process.Id
            runtimeExecutable = $Ready.request.runtimeExecutable
            callSiteAddress = ('0x{0:x8}' -f $callAddress)
            currentPickEntry = ('0x{0:x8}' -f $pickEntry)
            debuggerHelperSha256 = $debuggerSha256
            acceptanceFailure = $_.Exception.Message
            rawDebuggerResult = $captureResult
        }
        [IO.File]::WriteAllText($diagnosticPath,
            ($diagnostic | ConvertTo-Json -Depth 28), [Text.UTF8Encoding]::new($false))
        throw "No-TF debugger output failed a required site, event-order, stack, or cleanup gate; inspect $diagnosticPath"
    }

    $currentHelperType = $debuggerTypeName -as [type]
    if ($null -eq $currentHelperType -or
        $currentHelperType.Assembly.FullName -cne $loadedHelperAssemblyIdentity -or
        (Get-FileHash -LiteralPath $debuggerPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $debuggerSha256 -or
        (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $coordinatorSha256) {
        throw 'Loaded helper identity or source hashes changed before evidence stamping'
    }

    # Report the observed outer CALL and the pre-JC condition/slot sample.
    # Internal CALL/JMP edges are deliberately outside this stop boundary; the
    # capture does not establish a continuous instruction path or direct caller.
    $resultDocument = [ordered]@{
        schemaVersion = 2
        tripletId = $tripletId
        runId = $RunId
        oracleRunId = $RunId
        processId = $Ready.process.Id
        mode = $mode
        runtimeExecutable = $Ready.request.runtimeExecutable
        currentPllSha256 = $runtimeManifest['AARON.pll'].sha256
        metadata = [ordered]@{
            sourcePath = 'research/introspection/premium-callsite-metadata-v1.cl'
            sourceSha256 = $probeSha256
            readyReportSha256 = (Get-Sha256Bytes $MetadataBytes)
            premiumSpecializer = 'COMMON-GRAPHICS-USER::PREMIUM'
            premiumMethodIndex = $methodIndices.premiumIndex
            currentPickFunction = 'COMMON-GRAPHICS-USER::PICK'
        }
        mapping = [ordered]@{
            nativeCaptureManifest = 'native-code/capture-manifest.json'
            nativeCaptureManifestSha256 = (Get-FileHash -LiteralPath $live.manifest -Algorithm SHA256).Hash.ToLowerInvariant()
            nativeMap = 'native-code/mapped/native-code-map.json'
            nativeMapSha256 = (Get-FileHash -LiteralPath $mapPath -Algorithm SHA256).Hash.ToLowerInvariant()
            liveWindows = @($live.functions | ForEach-Object {
                [ordered]@{ name = $_.name; file = $_.file; bytes = $_.bytes; sha256 = $_.sha256; entryCandidate = $_.entryCandidate }
            })
            mapperSha256 = $mapperSha256
            reaStaticCensusPath = 'research/introspection/evidence/select-subject-call-census-20261014-v1.json'
            reaStaticCensusSha256 = $reaCensusSha256
            reaWideWindowEvidencePath = 'research/introspection/evidence/premium-callsite-wide-window-20261014-v3.json'
            reaWideWindowEvidenceSha256 = $currentBoundWindow.sourceFileSha256
            reaWideWindowAnalysisPath = 'research/introspection/evidence/premium-callsite-wide-window-rea-20261014-v3.json'
            reaWideWindowAnalysisSha256 = $currentBoundWindow.analysisFileSha256
            branchSnapshotPath = 'research/introspection/evidence/premium-callsite-branch-snapshot-20261015.json'
            branchSnapshotSha256 = $currentBoundWindow.branchSnapshotSha256
            referenceWindowStart = ('0x{0:x8}' -f $currentBoundWindow.start)
            referenceWindowSha256 = $currentBoundWindow.sha256
            instructionProfileSha256 = $currentBoundWindow.profileSha256
            reaPayloadEntry = $reaMethods[0].entry
            reaCallAddress = $reaCallsites[0].address
            reaCallPayloadOffset = $callOffset
            premiumEntry = $premium[0].runtime.entry
            premiumPayloadBytes = $premium[0].payloadBytes
            premiumPayloadSha256 = $premium[0].payloadSha256
            premiumObjectBytes = $premium[0].objectBytes
            premiumObjectSha256 = $premium[0].objectSha256
            premiumUniqueCompletePllMatch = $premium[0].uniqueCompleteObjectByteMatch
            currentPickEntry = $pick[0].runtime.entry
            pickPayloadBytes = $pick[0].payloadBytes
            pickPayloadSha256 = $pick[0].payloadSha256
            pickObjectBytes = $pick[0].objectBytes
            pickObjectSha256 = $pick[0].objectSha256
            pickUniqueCompletePllMatch = $pick[0].uniqueCompleteObjectByteMatch
            callPayloadOffset = $callOffset
            callSiteAddress = ('0x{0:x8}' -f $callAddress)
            callSiteBytesHex = 'ff5727'
            measuredOuterDestination = $captureResult.outerDestination.targetEip
            targetWindowStart = $captureResult.targetWindow.windowStartAddress
            targetWindowEip = $captureResult.targetWindow.eip
            targetWindowBytes = $captureResult.targetWindow.bytesRead
            capturedWindowSha256 = $captureResult.targetWindow.bytesSha256
            historicalReferenceWindowBytesMatch = $captureResult.targetWindow.historicalReferenceWindowBytesMatch
            instructionProfileMatches = $captureResult.targetWindow.instructionProfileMatches
            instructionProfileRecords = $captureResult.targetWindow.profileRecords
            branchObservation = $captureResult.branchObservation
            outerReturnGuard = $captureResult.outerReturnGuard
            tailJumpDestinationAddress = $null
            tailJumpDestinationEqualsCurrentPick = $false
            internalSites = @($captureResult.sites | ForEach-Object {
                [ordered]@{ name = $_.name; offset = $_.offset; address = $_.address; expectedBytesHex = $_.expectedBytesHex; hitCount = $_.hitCount; destinationHitCount = $_.destinationHitCount }
            })
        }
        coordinatorScriptPath = 'research/tools/capture-premium-internal-transfer-triplet-v4.ps1'
        coordinatorScriptSha256 = $coordinatorSha256
        helperAssemblyIdentity = $loadedHelperAssemblyIdentity
        helperSourceSha256AtLoad = $debuggerSha256
        debuggerHelperPath = 'research/oracle/AaronPremiumInternalTransferBreakpointV3.cs'
        debuggerHelperSha256 = $debuggerSha256
        claims = [ordered]@{
            observedOuterCall = $true
            observedInnerCallDestinationEdge = $false
            observedInnerJumpDestinationEdge = $false
            jcConditionObservedBeforeInstruction = $true
            jcSuccessorObserved = $false
            candidateInnerCallSlotCaptured = $true
            tailJumpEdgeBeforeOuterContinuation = $false
            originalOuterInvocationEdgeSupported = $true
            continuousInstructionPathProven = $false
            directLispCallerProven = $false
            interpretation = 'At the first captured JC instruction, the selected thread EFLAGS.CF, immediately preceding CMP operands, and raw [EDI+0x35f] dword were recorded. The JC condition predicts a successor from CF, but the successor was not observed. The raw slot is only a candidate target; no call edge or target identity is inferred. This does not prove a continuous instruction path or identify a direct Lisp caller.'
        }
        debugger = $captureResult
    }
    $json = $resultDocument | ConvertTo-Json -Depth 24
    $wrapped = "$captureBeginMarker`n$json`n$requiredEndMarker`n"
    [IO.File]::WriteAllText($captureOutputPath, $wrapped, [Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{
        result = $resultDocument
        reportPath = $captureOutputPath
        reportSha256 = (Get-FileHash -LiteralPath $captureOutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
        nativeRoot = $live.root
        mapPath = $mapPath
    }
}

function Get-Record([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required capture is missing: $Path" }
    $item = Get-Item -LiteralPath $Path
    return [ordered]@{ path = $Path; bytes = $item.Length; sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
}

function Assert-ArchivedObserverBinding($CaptureDocument, [string]$OutputRoot, [string]$RunId,
    [string]$MetadataText, [byte[]]$MetadataBytes, $Runtime) {
    $expectedRuntime = [IO.Path]::GetFullPath((Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe'))
    $expectedPll = [IO.Path]::GetFullPath((Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.pll'))
    $metadataNormalized = $MetadataText.Replace("`r`n", "`n")
    if ($metadataNormalized.Contains("`r") -or -not $metadataNormalized.EndsWith("`n")) {
        throw 'Archived metadata observer is not normalized UTF-8 line text'
    }
    $captureRoot = Join-Path $OutputRoot 'capture'
    $nativeRoot = Join-Path $OutputRoot 'native-code'
    $readyMetadataPath = Join-Path $nativeRoot 'ready-metadata.bin'
    $readyMetadataRecord = Get-Record $readyMetadataPath
    $readyPrefixBytes = [IO.File]::ReadAllBytes($readyMetadataPath)
    if ($readyPrefixBytes.Length -gt $MetadataBytes.Length -or $readyPrefixBytes.Length -eq 0) {
        throw 'Archived READY metadata prefix is empty or longer than the completed metadata report'
    }
    $metadataPrefixBytes = New-Object byte[] $readyPrefixBytes.Length
    [Buffer]::BlockCopy($MetadataBytes, 0, $metadataPrefixBytes, 0, $metadataPrefixBytes.Length)
    if ([Convert]::ToBase64String($metadataPrefixBytes) -cne [Convert]::ToBase64String($readyPrefixBytes)) {
        throw 'Archived READY metadata bytes are not the exact prefix of the completed observer report'
    }
    $readyPrefixRawText = [Text.UTF8Encoding]::new($false, $true).GetString($readyPrefixBytes)
    $readyPrefixText = $readyPrefixRawText.Replace("`r`n", "`n")
    if ($readyPrefixText.Contains("`r") -or -not $readyPrefixText.EndsWith("`n")) {
        throw 'Archived READY metadata prefix is not normalized UTF-8 line text'
    }
    $readyPrefixSha256 = Get-Sha256Bytes $readyPrefixBytes
    $methodIndices = Assert-MetadataReady $readyPrefixRawText

    if ($CaptureDocument.schemaVersion -ne 2 -or $CaptureDocument.tripletId -cne $tripletId -or
        $CaptureDocument.runId -cne $RunId -or $CaptureDocument.oracleRunId -cne $RunId -or
        $CaptureDocument.mode -cne $mode -or $CaptureDocument.processId -le 0 -or
        [IO.Path]::GetFullPath([string]$CaptureDocument.runtimeExecutable) -cne $expectedRuntime -or
        [string]$CaptureDocument.currentPllSha256 -cne [string]$Runtime['AARON.pll'].sha256 -or
        $CaptureDocument.metadata.sourcePath -cne 'research/introspection/premium-callsite-metadata-v1.cl' -or
        [string]$CaptureDocument.metadata.sourceSha256 -cne $probeSha256 -or
        [string]$CaptureDocument.metadata.readyReportSha256 -cne $readyPrefixSha256 -or
        $CaptureDocument.metadata.premiumSpecializer -cne 'COMMON-GRAPHICS-USER::PREMIUM' -or
        [int]$CaptureDocument.metadata.premiumMethodIndex -ne $methodIndices.premiumIndex -or
        $CaptureDocument.metadata.currentPickFunction -cne 'COMMON-GRAPHICS-USER::PICK' -or
        $CaptureDocument.coordinatorScriptPath -cne 'research/tools/capture-premium-internal-transfer-triplet-v4.ps1' -or
        [string]$CaptureDocument.coordinatorScriptSha256 -cne $coordinatorSha256 -or
        [string]$CaptureDocument.helperSourceSha256AtLoad -cne $debuggerSha256 -or
        [string]$CaptureDocument.debuggerHelperSha256 -cne $debuggerSha256 -or
        $CaptureDocument.debuggerHelperPath -cne 'research/oracle/AaronPremiumInternalTransferBreakpointV3.cs' -or
        [string]$CaptureDocument.mapping.nativeCaptureManifest -cne 'native-code/capture-manifest.json' -or
        [string]$CaptureDocument.mapping.nativeMap -cne 'native-code/mapped/native-code-map.json' -or
        [string]$CaptureDocument.mapping.mapperSha256 -cne $mapperSha256 -or
        [string]$CaptureDocument.mapping.reaStaticCensusPath -cne 'research/introspection/evidence/select-subject-call-census-20261014-v1.json' -or
        [string]$CaptureDocument.mapping.reaStaticCensusSha256 -cne $reaCensusSha256 -or
        [string]$CaptureDocument.mapping.reaWideWindowEvidencePath -cne 'research/introspection/evidence/premium-callsite-wide-window-20261014-v3.json' -or
        [string]$CaptureDocument.mapping.reaWideWindowEvidenceSha256 -cne $boundTargetWindow.sourceFileSha256 -or
        [string]$CaptureDocument.mapping.reaWideWindowAnalysisPath -cne 'research/introspection/evidence/premium-callsite-wide-window-rea-20261014-v3.json' -or
        [string]$CaptureDocument.mapping.reaWideWindowAnalysisSha256 -cne $boundTargetWindow.analysisFileSha256 -or
        [string]$CaptureDocument.mapping.branchSnapshotPath -cne 'research/introspection/evidence/premium-callsite-branch-snapshot-20261015.json' -or
        [string]$CaptureDocument.mapping.branchSnapshotSha256 -cne $boundTargetWindow.branchSnapshotSha256 -or
        [string]$CaptureDocument.mapping.referenceWindowSha256 -cne $boundTargetWindow.sha256 -or
        [string]$CaptureDocument.mapping.instructionProfileSha256 -cne $boundTargetWindow.profileSha256) {
        throw 'Archived observer report metadata, source hashes, runtime identity, or versioned inputs do not match this run'
    }
    if ([string]::IsNullOrWhiteSpace([string]$CaptureDocument.helperAssemblyIdentity) -or
        [string]$CaptureDocument.mapping.referenceWindowStart -cne ('0x{0:x8}' -f $boundTargetWindow.start)) {
        throw 'Archived helper assembly or REA reference-window identity is invalid'
    }

    $stagedProbePath = Join-Path $captureRoot 'aaron-pre-scene-probe.cl'
    if ((Get-FileHash -LiteralPath $stagedProbePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $probeSha256) {
        throw 'Archived staged metadata probe differs from its pinned source'
    }
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    $requestRecord = Get-Record $requestPath
    $requestBytes = [IO.File]::ReadAllBytes($requestPath)
    $request = ([Text.UTF8Encoding]::new($false, $true).GetString($requestBytes)) | ConvertFrom-Json
    if ($request.schemaVersion -ne 1 -or $request.runId -cne $RunId -or
        [IO.Path]::GetFullPath([string]$request.runtimeExecutable) -cne $expectedRuntime -or
        [string]$request.probeSha256 -cne $probeSha256 -or [string]$request.runnerSha256 -cne $runnerSha256 -or
        $request.pauseSeconds -ne $PauseSeconds -or $request.releaseFile -cne $releasePath -or
        $request.requiredProbeOutputName -cne $captureOutputName -or
        $request.requiredProbeEndMarker -cne $requiredEndMarker -or @($request.probeOutputNames).Count -ne 2 -or
        $request.probeOutputNames[0] -cne $probeName -or $request.probeOutputNames[1] -cne $captureOutputName -or
        [string]$CaptureDocument.debugger.ownedRunId -cne $RunId -or
        [string]$CaptureDocument.debugger.ownedRequestSha256 -cne $requestRecord.sha256 -or
        [string]$CaptureDocument.debugger.ownedRuntimePath -cne $expectedRuntime) {
        throw 'Archived runner request is not bound to the report run ID, request hash, probe, and runtime executable'
    }

    $nativeManifestPath = Join-Path $nativeRoot 'capture-manifest.json'
    $nativeManifestRecord = Get-Record $nativeManifestPath
    if ([string]$CaptureDocument.mapping.nativeCaptureManifestSha256 -cne $nativeManifestRecord.sha256) {
        throw 'Archived native capture manifest hash differs from the observer report'
    }
    $nativeManifest = Get-Content -LiteralPath $nativeManifestPath -Raw | ConvertFrom-Json
    if ($nativeManifest.schemaVersion -ne 1 -or
        [IO.Path]::GetFullPath([string]$nativeManifest.runtimeExecutable) -cne $expectedRuntime -or
        [int]$nativeManifest.processId -ne [int]$CaptureDocument.processId -or
        [string]$nativeManifest.metadataSha256 -cne $readyPrefixSha256 -or
        [string]$readyMetadataRecord.sha256 -cne $readyPrefixSha256 -or
        [Convert]::ToBase64String([IO.File]::ReadAllBytes($readyMetadataPath)) -cne [Convert]::ToBase64String($readyPrefixBytes)) {
        throw 'Archived native manifest and READY metadata bytes do not match the exact READY prefix and process'
    }

    $mapPath = Join-Path $nativeRoot 'mapped\native-code-map.json'
    $mapRecord = Get-Record $mapPath
    if ([string]$CaptureDocument.mapping.nativeMapSha256 -cne $mapRecord.sha256) {
        throw 'Archived native map hash differs from the observer report'
    }
    $runtimePllRecord = $Runtime['AARON.pll']
    if ((Get-FileHash -LiteralPath $expectedPll -Algorithm SHA256).Hash.ToLowerInvariant() -cne $runtimePllRecord.sha256) {
        throw 'Archived runtime AARON.pll changed after the triplet run'
    }
    $revalidationRoot = Join-Path $nativeRoot 'archived-map-revalidation'
    if (Test-Path -LiteralPath $revalidationRoot) { throw 'Archived-map revalidation output already exists; preserve it' }
    $revalidationStdout = Join-Path $OutputRoot 'archived-map-revalidation.stdout.txt'
    $revalidationStderr = Join-Path $OutputRoot 'archived-map-revalidation.stderr.txt'
    if ((Get-FileHash -LiteralPath $mapperPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $mapperSha256) {
        throw 'Native-map validator source changed before archived-byte revalidation'
    }
    & node $mapperPath $nativeManifestPath $expectedPll $revalidationRoot 1> $revalidationStdout 2> $revalidationStderr
    if ($LASTEXITCODE -ne 0) {
        throw "Offline native-map revalidation failed with exit $LASTEXITCODE; inspect $revalidationStderr"
    }
    $revalidatedMapPath = Join-Path $revalidationRoot 'native-code-map.json'
    $revalidatedMapRecord = Get-Record $revalidatedMapPath
    if ($revalidatedMapRecord.sha256 -cne $mapRecord.sha256) {
        throw 'Recomputed archived map differs byte-for-byte from the map produced at the READY pause'
    }
    $map = Get-Content -LiteralPath $revalidatedMapPath -Raw | ConvertFrom-Json
    if ($map.schemaVersion -ne 1 -or [string]$map.pll.sha256 -cne $runtimePllRecord.sha256 -or
        [string]$map.captureManifestSha256 -cne $nativeManifestRecord.sha256 -or
        @($map.functions).Count -ne 3 -or @($nativeManifest.functions).Count -ne 3) {
        throw 'Revalidated native map does not identify three functions from the archived manifest and run PLL'
    }

    $premiumName = "SELECT-SUBJECT-METHOD-$($methodIndices.premiumIndex)"
    $freeName = "SELECT-SUBJECT-METHOD-$($methodIndices.freeIndex)"
    $expectedFunctionNames = @($freeName, $premiumName, 'PICK')
    $manifestRows = @($nativeManifest.functions)
    $mapRows = @($map.functions)
    $liveWindowRows = @($CaptureDocument.mapping.liveWindows)
    if (@($manifestRows | Where-Object { $_.name -cnotin $expectedFunctionNames }).Count -ne 0 -or
        @($mapRows | Where-Object { $_.name -cnotin $expectedFunctionNames }).Count -ne 0 -or
        @($liveWindowRows | Where-Object { $_.name -cnotin $expectedFunctionNames }).Count -ne 0) {
        throw 'Archived native map contains unexpected or stale function names'
    }
    foreach ($name in $expectedFunctionNames) {
        $manifestMatches = @($manifestRows | Where-Object { $_.name -ceq $name })
        $mapMatches = @($mapRows | Where-Object { $_.name -ceq $name })
        $reportMatches = @($liveWindowRows | Where-Object { $_.name -ceq $name })
        $headerMatches = @([regex]::Matches($readyPrefixText,
            '(?m)^HEADER name="' + [regex]::Escape($name) + '" bytes=([0-9a-fA-F]{128})$'))
        if ($manifestMatches.Count -ne 1 -or $mapMatches.Count -ne 1 -or
            $reportMatches.Count -ne 1 -or $headerMatches.Count -ne 1) {
            throw "Archived manifest, map, or metadata does not uniquely contain $name"
        }
        $manifestRow = $manifestMatches[0]
        $mapRow = $mapMatches[0]
        $reportRow = $reportMatches[0]
        if ([string]$manifestRow.functionObjectHeaderHex -ine $headerMatches[0].Groups[1].Value -or
            [string]$manifestRow.file -cnotmatch '^[a-z0-9-]+\.native-window\.bin$' -or
            [string]$mapRow.capture.file -cne [string]$manifestRow.file -or
            [int]$mapRow.capture.bytes -ne [int]$manifestRow.bytes -or
            [string]$mapRow.capture.sha256 -cne [string]$manifestRow.sha256 -or
            [string]$reportRow.file -cne [string]$manifestRow.file -or
            [int]$reportRow.bytes -ne [int]$manifestRow.bytes -or
            [string]$reportRow.sha256 -cne [string]$manifestRow.sha256 -or
            [string]$reportRow.entryCandidate -cne [string]$manifestRow.entryCandidate) {
            throw "Archived $name entry header, capture, map, and stamped live-window record disagree"
        }
        $windowRecord = Get-Record (Join-Path $nativeRoot $manifestRow.file)
        if ($windowRecord.bytes -ne [int]$manifestRow.bytes -or $windowRecord.sha256 -cne [string]$manifestRow.sha256) {
            throw "Archived native memory window failed its byte count/hash check: $name"
        }
        if ((Convert-Hex32 ([string]$mapRow.runtime.entry) "$name mapped entry") -ne
            (Convert-Hex32 ([string]$manifestRow.entryCandidate) "$name captured entry")) {
            throw "Archived $name map entry does not match its captured metadata entry"
        }
        if (-not $mapRow.uniqueCompleteObjectByteMatch -or
            [string]$mapRow.payloadFile -cnotmatch '^[a-z0-9-]+\.native-payload\.bin$') {
            throw "Archived $name does not have one uniquely mapped complete PLL object"
        }
        $mappedPayload = Get-Record (Join-Path (Split-Path -Parent $mapPath) $mapRow.payloadFile)
        $verifiedPayload = Get-Record (Join-Path $revalidationRoot $mapRow.payloadFile)
        if ($mappedPayload.bytes -ne [int]$mapRow.payloadBytes -or
            $mappedPayload.sha256 -cne [string]$mapRow.payloadSha256 -or
            $verifiedPayload.bytes -ne $mappedPayload.bytes -or $verifiedPayload.sha256 -cne $mappedPayload.sha256) {
            throw "Archived $name mapped payload bytes/hash do not match the recomputed complete PLL object"
        }
    }

    $premium = @($mapRows | Where-Object { $_.name -ceq $premiumName })
    $pick = @($mapRows | Where-Object { $_.name -ceq 'PICK' })
    $census = Get-Content -LiteralPath $reaCensusPath -Raw | ConvertFrom-Json
    if ($premium.Count -ne 1 -or $pick.Count -ne 1 -or
        $premium[0].payloadBytes -ne 362 -or $premium[0].objectBytes -ne 366 -or
        -not $premium[0].uniqueCompleteObjectByteMatch -or
        -not $pick[0].uniqueCompleteObjectByteMatch -or
        $census.schemaVersion -ne 1 -or $census.status -cne 'validated-static-callsite-census-targets-unresolved' -or
        -not $census.summary.allInputsStaticOnlyAndNotExecuted) {
        throw 'Archived PREMIUM/PICK map or pinned REA callsite census failed its bounded source checks'
    }
    $reaMethods = @($census.methods | Where-Object {
        $_.method -ceq 'SELECT-SUBJECT-METHOD-1' -and $_.specializer.symbol -ceq 'PREMIUM'
    })
    $reaCallsites = @()
    if ($reaMethods.Count -eq 1) {
        $reaCallsites = @($reaMethods[0].calls | Where-Object { $_.instruction -match ': CALL dword ptr \[EDI \+ 0x27\]$' })
    }
    if ($reaMethods.Count -ne 1 -or $reaCallsites.Count -ne 1 -or
        $reaMethods[0].sourceBinding.originalPll.sha256 -cne $runtimePllRecord.sha256 -or
        $reaMethods[0].sourceBinding.originalPayload.bytes -ne $premium[0].payloadBytes -or
        $reaMethods[0].sourceBinding.originalPayload.sha256 -cne $premium[0].payloadSha256 -or
        $reaCallsites[0].mechanism -cne 'computed' -or $reaCallsites[0].status -cne 'unresolved' -or
        @($reaCallsites[0].targets).Count -ne 0) {
        throw 'Archived PREMIUM payload does not match the REA-bound static computed CALL record'
    }
    $reaPayloadEntry = Convert-Hex32 ([string]$reaMethods[0].entry) 'Archived REA PREMIUM payload entry'
    $reaCallAddress = Convert-Hex32 ([string]$reaCallsites[0].address) 'Archived REA PREMIUM callsite'
    if ($reaCallAddress -le $reaPayloadEntry) { throw 'Archived REA callsite precedes its PREMIUM payload entry' }
    $callOffset = [int]($reaCallAddress - $reaPayloadEntry)
    $premiumPayloadPath = Join-Path $revalidationRoot $premium[0].payloadFile
    $premiumPayloadBytes = [IO.File]::ReadAllBytes($premiumPayloadPath)
    if ($callOffset -ne 200 -or $callOffset + 3 -gt $premiumPayloadBytes.Length -or
        ([BitConverter]::ToString($premiumPayloadBytes, $callOffset, 3)).Replace('-', '').ToLowerInvariant() -cne 'ff5727') {
        throw 'Recomputed archived PREMIUM payload does not contain the REA-bound FF5727 instruction at offset 200'
    }
    $premiumEntry = Convert-Hex32 ([string]$premium[0].runtime.entry) 'Archived PREMIUM runtime entry'
    $pickEntry = Convert-Hex32 ([string]$pick[0].runtime.entry) 'Archived current PICK runtime entry'
    $callAddress64 = $premiumEntry + [uint64]$callOffset
    if ($callAddress64 -gt [uint32]::MaxValue -or
        $callAddress64 + 3 -gt $premiumEntry + [uint64]$premiumPayloadBytes.Length) {
        throw 'Recomputed archived PREMIUM callsite exceeds the current mapped payload or 32-bit address space'
    }
    $callAddress = [uint32]$callAddress64
    $mapping = $CaptureDocument.mapping
    if ($mapping.premiumPayloadBytes -ne $premium[0].payloadBytes -or
        $mapping.premiumPayloadSha256 -cne $premium[0].payloadSha256 -or
        $mapping.premiumObjectBytes -ne $premium[0].objectBytes -or
        $mapping.premiumObjectSha256 -cne $premium[0].objectSha256 -or
        $mapping.premiumUniqueCompletePllMatch -ne $true -or
        [string]$mapping.premiumEntry -ine [string]$premium[0].runtime.entry -or
        $mapping.pickPayloadBytes -ne $pick[0].payloadBytes -or
        $mapping.pickPayloadSha256 -cne $pick[0].payloadSha256 -or
        $mapping.pickObjectBytes -ne $pick[0].objectBytes -or
        $mapping.pickObjectSha256 -cne $pick[0].objectSha256 -or
        $mapping.pickUniqueCompletePllMatch -ne $true -or
        [string]$mapping.currentPickEntry -ine [string]$pick[0].runtime.entry -or
        $mapping.callPayloadOffset -ne $callOffset -or $mapping.reaCallPayloadOffset -ne $callOffset -or
        [string]$mapping.reaPayloadEntry -ine [string]$reaMethods[0].entry -or
        [string]$mapping.reaCallAddress -ine [string]$reaCallsites[0].address -or
        [string]$mapping.callSiteAddress -ine ('0x{0:x8}' -f $callAddress) -or
        [string]$mapping.callSiteBytesHex -cne 'ff5727') {
        throw 'Archived report callsite or PREMIUM/PICK identity fields differ from independently recomputed map and REA evidence'
    }
    $tailEdges = @($CaptureDocument.debugger.edges | Where-Object { $_.site -ceq 'JMP-ESI+12' })
    $reportedProfiles = @($mapping.instructionProfileRecords)
    $debuggerProfiles = @($CaptureDocument.debugger.targetWindow.profileRecords)
    $reportedGuard = $mapping.outerReturnGuard
    $debuggerGuard = $CaptureDocument.debugger.outerReturnGuard
    $reportedBranch = $mapping.branchObservation
    $debuggerBranch = $CaptureDocument.debugger.branchObservation
    if ($reportedProfiles.Count -ne 11 -or $debuggerProfiles.Count -ne 11 -or
        $reportedGuard.armed -ne $debuggerGuard.armed -or $reportedGuard.hit -ne $debuggerGuard.hit -or
        [string]$reportedGuard.address -ine [string]$debuggerGuard.address -or
        [string]$reportedGuard.status -cne [string]$debuggerGuard.status -or
        $reportedBranch.armed -ne $debuggerBranch.armed -or $reportedBranch.hit -ne $debuggerBranch.hit -or
        [string]$reportedBranch.address -ine [string]$debuggerBranch.address -or
        [int]$reportedBranch.carryFlag -ne [int]$debuggerBranch.carryFlag -or
        [string]$reportedBranch.candidateCallTarget -ine [string]$debuggerBranch.candidateCallTarget) {
        throw 'Archived summary profile, continuation-guard, or JC fields do not match the debugger payload'
    }
    foreach ($debugProfile in $debuggerProfiles) {
        $reportedMatches = @($reportedProfiles | Where-Object { [int]$_.offset -eq [int]$debugProfile.offset })
        if ($reportedMatches.Count -ne 1 -or
            [string]$reportedMatches[0].bytesHex -cne [string]$debugProfile.bytesHex -or
            [string]$reportedMatches[0].expectedBytesHex -cne [string]$debugProfile.expectedBytesHex -or
            [string]$reportedMatches[0].address -ine [string]$debugProfile.address -or
            [int]$reportedMatches[0].length -ne [int]$debugProfile.length -or
            $reportedMatches[0].matched -ne $debugProfile.matched) {
            throw 'Archived summary instruction profile differs from the debugger capture at a reported offset'
        }
    }
    if ($tailEdges.Count -ne 0 -or $mapping.tailJumpDestinationAddress -ne $null -or
        $mapping.tailJumpDestinationEqualsCurrentPick -ne $false -or
        [string]$mapping.measuredOuterDestination -ine [string]$CaptureDocument.debugger.outerDestination.targetEip -or
        [string]$mapping.capturedWindowSha256 -ine [string]$CaptureDocument.debugger.targetWindow.bytesSha256 -or
        [string]$mapping.targetWindowStart -ine [string]$CaptureDocument.debugger.targetWindow.windowStartAddress -or
        [string]$mapping.targetWindowEip -ine [string]$CaptureDocument.debugger.targetWindow.eip -or
        $mapping.targetWindowBytes -ne 256 -or
        $mapping.historicalReferenceWindowBytesMatch -ne $CaptureDocument.debugger.targetWindow.historicalReferenceWindowBytesMatch -or
        $mapping.instructionProfileMatches -ne $true -or
        [string]$reportedBranch.address -ine [string]$debuggerBranch.address -or
        [int]$reportedBranch.carryFlag -ne [int]$debuggerBranch.carryFlag -or
        [string]$reportedBranch.predictedSuccessorAddress -ine [string]$debuggerBranch.predictedSuccessorAddress) {
        throw 'Archived report window, measured destination, or pre-JC branch fields do not match the accepted debugger evidence'
    }
    if ($CaptureDocument.claims.observedOuterCall -ne $true -or
        $CaptureDocument.claims.jcConditionObservedBeforeInstruction -ne $true -or
        $CaptureDocument.claims.jcSuccessorObserved -ne $false -or
        $CaptureDocument.claims.candidateInnerCallSlotCaptured -ne $true -or
        $CaptureDocument.claims.observedInnerJumpDestinationEdge -ne $false -or
        $CaptureDocument.claims.observedInnerCallDestinationEdge -ne $false -or
        $CaptureDocument.claims.tailJumpEdgeBeforeOuterContinuation -ne $false -or
        $CaptureDocument.claims.continuousInstructionPathProven -ne $false -or
        $CaptureDocument.claims.directLispCallerProven -ne $false) {
        throw 'Archived result claims do not match the bounded pre-JC capture and documented scope'
    }
    $null = Assert-InternalTransferCapture $CaptureDocument.debugger $callAddress ([uint32]$pickEntry) `
        ([uint32]$boundTargetWindow.start) ([string]$boundTargetWindow.sha256) `
        ([string]$boundTargetWindow.profileSha256) $RunId ([string]$requestRecord.sha256) $expectedRuntime

    return [pscustomobject]@{
        status = 'source-bound-archive-revalidated'
        readyPrefixSha256 = $readyPrefixSha256
        requestSha256 = $requestRecord.sha256
        nativeCaptureManifestSha256 = $nativeManifestRecord.sha256
        nativeMapSha256 = $mapRecord.sha256
        recomputedNativeMapSha256 = $revalidatedMapRecord.sha256
        recomputedNativeMapRoot = 'native-code/archived-map-revalidation'
        premiumPayloadSha256 = $premium[0].payloadSha256
        currentPickEntry = ('0x{0:x8}' -f $pickEntry)
        recomputedCallSiteAddress = ('0x{0:x8}' -f $callAddress)
        tailJumpDestinationAddress = $null
        tailJumpDestinationEqualsCurrentPick = $false
        branchObservation = $debuggerBranch
    }
}

function Read-Run([string]$Role, [string]$RunId, [string]$OutputRoot, [bool]$Observer) {
    $summaryPath = Join-Path $OutputRoot 'summary.json'
    $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
    if ($summary.runId -cne $RunId -or $summary.complete -ne $true -or $summary.mode -cne $mode -or
        $summary.smallImage -ne $false -or $summary.runnerSha256 -cne $runnerSha256 -or
        $summary.installerSha256 -cne $manifest.source.sha256 -or
        -not $summary.probeCompletionSatisfied) {
        throw "$Role summary is incomplete or differs from the source-bound run"
    }
    if ($Observer) {
        if ($summary.preSceneProbeSha256 -cne $probeSha256 -or
            $summary.preSceneProbePauseSeconds -ne $PauseSeconds -or
            $summary.requiredProbeOutputName -cne $captureOutputName -or
            $summary.requiredProbeEndMarker -cne $requiredEndMarker -or
            $summary.requiredProbeOutputSha256 -notmatch '^[0-9a-f]{64}$' -or
            @($summary.probeOutputNames).Count -ne 2 -or
            $summary.probeOutputNames[0] -cne $probeName -or
            $summary.probeOutputNames[1] -cne $captureOutputName) {
            throw 'Observer summary does not bind the metadata probe and debugger result output'
        }
        $stagedProbe = Join-Path (Join-Path $OutputRoot 'capture') 'aaron-pre-scene-probe.cl'
        if ((Get-FileHash -LiteralPath $stagedProbe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $probeSha256) {
            throw 'Archived staged probe differs from the source probe'
        }
    } elseif ($summary.preSceneProbeSha256 -or @($summary.probeOutputNames).Count -ne 0 -or
        $summary.preSceneProbePauseSeconds -ne 0 -or $summary.requiredProbeOutputName -or
        $summary.requiredProbeOutputSha256 -or $summary.requiredProbeEndMarker) {
        throw "$Role is not a fresh uninstrumented control"
    }
    $runtime = [ordered]@{}
    foreach ($name in @('AARON.exe', 'AARON.pll')) {
        $record = Get-Record (Join-Path (Join-Path $OutputRoot 'runtime') $name)
        if ($record.bytes -ne $runtimeManifest[$name].bytes -or $record.sha256 -cne $runtimeManifest[$name].sha256) {
            throw "$Role runtime $name differs from its extracted manifest"
        }
        $runtime[$name] = $record
    }
    $capture = Join-Path $OutputRoot 'capture'
    $artifacts = [ordered]@{}
    foreach ($name in @('aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt')) {
        $artifacts[$name] = Get-Record (Join-Path $capture $name)
    }
    if ($mode -in @('writer-full-seed-5678', 'writer-full-seed-456069')) {
        $fullTapePath = Join-Path $capture 'aaron-writer-full.txt'
        $fullTape = Get-Record $fullTapePath
        if ((Get-Content -LiteralPath $fullTapePath -Tail 1) -cne 'END writer-full') {
            throw "$Role full writer tape is incomplete"
        }
        $artifacts['aaron-writer-full.txt'] = $fullTape
    }
    if ($summary.aa0Sha256 -cne $artifacts.aa0.sha256 -or
        $summary.sceneReportSha256 -cne $artifacts['aaron-scene-state-snapshot.txt'].sha256 -or
        (Get-Content -LiteralPath (Join-Path $capture 'aa0') -Tail 1) -cne 'end' -or
        -not (Select-String -LiteralPath (Join-Path $capture 'aaron-scene-state-snapshot.txt') -SimpleMatch 'END scene-state-snapshot' -Quiet)) {
        throw "$Role drawing or scene capture is incomplete or not summary-bound"
    }
    $sourceMap = [ordered]@{
        'planning-call-trace.cl' = Join-Path $repoRoot 'research\introspection\planning-call-trace.cl'
        'planning-random-seed-common.cl' = Join-Path $repoRoot 'research\oracle\planning-random-seed-common.cl'
        'scene-state-snapshot-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-seeded-1234.cl'
        'scene-state-snapshot.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot.cl'
    }
    if ($mode -eq 'writer-stream-seed-1234') {
        $sourceMap['scene-state-snapshot-writer-seeded-1234.cl'] = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-seeded-1234.cl'
        $sourceMap['scene-state-snapshot-writer-stream-seeded-1234.cl'] = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-stream-seeded-1234.cl'
    } elseif ($mode -eq 'writer-full-seed-5678') {
        $sourceMap['scene-state-snapshot-writer-full-seeded-5678.cl'] = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-full-seeded-5678.cl'
    } elseif ($mode -eq 'writer-full-seed-456069') {
        $sourceMap['scene-state-snapshot-writer-full-seeded-456069.cl'] = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-full-seeded-456069.cl'
    }
    $sources = [ordered]@{}
    foreach ($name in $sourceMap.Keys) {
        $record = Get-Record (Join-Path $capture $name)
        if ($record.sha256 -cne (Get-FileHash -LiteralPath $sourceMap[$name] -Algorithm SHA256).Hash.ToLowerInvariant()) {
            throw "$Role staged source differs from current file: $name"
        }
        $sources[$name] = $record
    }
    $trace = Get-Record (Join-Path $capture 'aaron-planning-call-trace.txt')
    $probeRecord = $null
    $captureRecord = $null
    $observerBinding = $null
    if ($Observer) {
        $metadataArchived = Join-Path $capture $probeName
        $captureArchived = Join-Path $capture $captureOutputName
        $probeRecord = Get-Record $metadataArchived
        $captureRecord = Get-Record $captureArchived
        if ($summary.requiredProbeOutputSha256 -cne $captureRecord.sha256 -or
            (Get-Content -LiteralPath $captureArchived -Tail 1) -cne $requiredEndMarker) {
            throw 'Archived required debugger output differs from runner summary or lacks terminal END'
        }
        $captureText = [Text.UTF8Encoding]::new($false, $true).GetString([IO.File]::ReadAllBytes($captureArchived))
        $captureNormalized = $captureText.Replace("`r`n", "`n")
        $captureLines = @($captureNormalized.TrimEnd([char]10).Split([char]10))
        if ($captureNormalized.Contains("`r") -or $captureLines.Count -lt 4 -or
            $captureLines[0] -cne $captureBeginMarker -or
            $captureLines[-1] -cne $requiredEndMarker -or
            @($captureLines | Where-Object { $_ -ceq $requiredEndMarker }).Count -ne 1) {
            throw 'Archived debugger result does not have one complete BEGIN/END envelope'
        }
        $captureDocument = ($captureLines[1..($captureLines.Count - 2)] -join "`n") | ConvertFrom-Json
        $metadataBytesArchived = [IO.File]::ReadAllBytes($metadataArchived)
        $metadataText = [Text.UTF8Encoding]::new($false, $true).GetString($metadataBytesArchived)
        $metadataNorm = $metadataText.Replace("`r`n", "`n")
        $metadataLines = @($metadataNorm.TrimEnd([char]10).Split([char]10))
        $completeLines = @($metadataLines | Where-Object { $_ -ceq 'COMPLETE execution=finished' })
        $readyLines = @($metadataLines | Where-Object { $_ -ceq 'READY premium-callsite-metadata-v1' })
        $releaseLines = @($metadataLines | Where-Object { $_ -ceq 'CAPTURE-WAIT released=T' })
        $endMarkers = @($metadataLines | Where-Object { $_ -ceq 'END premium-callsite-metadata-v1' })
        $readyLine = [Array]::IndexOf($metadataLines, 'READY premium-callsite-metadata-v1')
        $releaseLine = [Array]::IndexOf($metadataLines, 'CAPTURE-WAIT released=T')
        $completeLine = [Array]::IndexOf($metadataLines, 'COMPLETE execution=finished')
        $endLine = [Array]::IndexOf($metadataLines, 'END premium-callsite-metadata-v1')
        if ($metadataNorm.Contains("`r") -or -not $metadataNorm.EndsWith("END premium-callsite-metadata-v1`n") -or
            $readyLines.Count -ne 1 -or $releaseLines.Count -ne 1 -or $endMarkers.Count -ne 1 -or
            $completeLines.Count -ne 1 -or $readyLine -lt 0 -or $releaseLine -le $readyLine -or
            $completeLine -le $releaseLine -or $endLine -le $completeLine -or
            $endLine -ne ($metadataLines.Count - 1)) {
            throw 'Archived metadata observer did not finish the READY/release/COMPLETE/END handshake'
        }
        $observerBinding = Assert-ArchivedObserverBinding $captureDocument $OutputRoot $RunId `
            $metadataText $metadataBytesArchived $runtime
    }
    return [pscustomobject]@{
        role = $Role; runId = $RunId; root = $OutputRoot; summary = $summary; runtime = $runtime
        # Get-Content strings carry PSPath/PSDrive/PSProvider note properties.
        # Convert to a plain string before this value enters comparison JSON;
        # ConvertTo-Json otherwise recursively serializes provider metadata.
        aa0Header = (Get-Content -LiteralPath (Join-Path $capture 'aa0') -TotalCount 1).ToString()
        artifacts = $artifacts; sources = $sources; planningTrace = $trace
        probe = $probeRecord; debuggerResult = $captureRecord; observerBinding = $observerBinding
    }
}

function Release-OwnedObserver([string]$OutputRoot) {
    if (Test-Path -LiteralPath $releasePath) { return }
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    if (-not (Test-Path -LiteralPath $requestPath -PathType Leaf)) { return }
    try {
        $requestBytes = [IO.File]::ReadAllBytes($requestPath)
        $requestHash = Get-Sha256Bytes $requestBytes
        $request = ([Text.UTF8Encoding]::new($false, $true).GetString($requestBytes)) | ConvertFrom-Json
        $expected = [IO.Path]::GetFullPath((Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe'))
        $expectedRunId = Split-Path -Leaf $OutputRoot
        $aliases = Get-PathAliases $expected
        $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
        $owned = @($all | Where-Object { $_.Path -in $aliases })
        $requestValid = $request.schemaVersion -eq 1 -and $request.runId -ceq $expectedRunId -and
            $request.runtimeExecutable -ceq $expected -and $request.probeSha256 -ceq $probeSha256 -and
            $request.runnerSha256 -ceq $runnerSha256 -and $request.pauseSeconds -eq $PauseSeconds -and
            $request.releaseFile -ceq $releasePath -and
            $request.requiredProbeOutputName -ceq $captureOutputName -and
            $request.requiredProbeEndMarker -ceq $requiredEndMarker -and
            @($request.probeOutputNames).Count -eq 2 -and
            $request.probeOutputNames[0] -ceq $probeName -and
            $request.probeOutputNames[1] -ceq $captureOutputName
        if (-not $requestValid -or $all.Count -ne 1 -or $owned.Count -ne 1) { return }
        $owned[0].Refresh()
        if ($owned[0].HasExited -or $owned[0].WaitForExit(0)) { return }
        $confirmBytes = [IO.File]::ReadAllBytes($requestPath)
        if ((Get-Sha256Bytes $confirmBytes) -cne $requestHash) { return }
        $owned[0].Refresh()
        if ($owned[0].HasExited -or $owned[0].WaitForExit(0) -or
            (Test-Path -LiteralPath $releasePath)) { return }
        $markerBytes = [Text.UTF8Encoding]::new($false).GetBytes('Owned observer coordinator cleanup release' + [Environment]::NewLine)
        $stream = [IO.File]::Open($releasePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
        try { $stream.Write($markerBytes, 0, $markerBytes.Length); $stream.Flush($true) }
        finally { $stream.Dispose() }
    } catch { Write-Warning "Could not release only the runner-owned observer pause: $($_.Exception.Message)" }
}

function Stop-OwnedObserverAfterDetachFailure([string]$OutputRoot, [string]$RunId) {
    # A rejected debugger result can leave the child runner waiting for a
    # report that the coordinator correctly refused to write. Stop only the
    # exact disposable AARON process after binding its path/PID to the request
    # and the persisted detach-failure diagnostic; the runner's finally block
    # then copies staging files and restores the registry snapshot.
    $diagnosticPath = Join-Path (Join-Path $OutputRoot 'native-code') 'debugger-capture-diagnostic.json'
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    if (-not (Test-Path -LiteralPath $diagnosticPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $requestPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $releasePath -PathType Leaf)) { return }
    try {
        $diagnosticBytes = [IO.File]::ReadAllBytes($diagnosticPath)
        $diagnosticHash = Get-Sha256Bytes $diagnosticBytes
        $diagnostic = ([Text.UTF8Encoding]::new($false, $true).GetString($diagnosticBytes)) | ConvertFrom-Json
        $raw = $diagnostic.rawDebuggerResult
        $requestBytes = [IO.File]::ReadAllBytes($requestPath)
        $requestHash = Get-Sha256Bytes $requestBytes
        $request = ([Text.UTF8Encoding]::new($false, $true).GetString($requestBytes)) | ConvertFrom-Json
        $expected = [IO.Path]::GetFullPath((Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe'))
        $aliases = Get-PathAliases $expected
        $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
        $owned = @($all | Where-Object { $_.Path -in $aliases })
        $detachError = @($raw.cleanupErrors | Where-Object { $_ -ceq 'DebugActiveProcessStop failed: 5' })
        $valid = $diagnostic.schemaVersion -eq 1 -and $diagnostic.tripletId -ceq $tripletId -and
            $diagnostic.runId -ceq $RunId -and
            $diagnostic.runtimeExecutable -ceq $expected -and
            $diagnostic.acceptanceFailure -ceq 'No-TF capture did not complete with READY release, exact debug-state restoration, detach, and clean cleanup' -and
            $raw.ownedRunId -ceq $RunId -and $raw.ownedRuntimePath -ceq $expected -and
            $raw.attached -eq $true -and $raw.detached -eq $false -and
            $raw.captureCompleted -eq $true -and $detachError.Count -eq 1 -and
            $request.schemaVersion -eq 1 -and $request.runId -ceq $RunId -and
            $request.runtimeExecutable -ceq $expected -and $request.probeSha256 -ceq $probeSha256 -and
            $request.runnerSha256 -ceq $runnerSha256 -and $request.releaseFile -ceq $releasePath
        if (-not $valid -or $all.Count -ne 1 -or $owned.Count -ne 1 -or
            $owned[0].Id -ne $diagnostic.processId) { return }
        if ((Get-Sha256Bytes ([IO.File]::ReadAllBytes($requestPath))) -cne $requestHash -or
            (Get-Sha256Bytes ([IO.File]::ReadAllBytes($diagnosticPath))) -cne $diagnosticHash) { return }
        $owned[0].Refresh()
        if ($owned[0].HasExited -or $owned[0].WaitForExit(0)) { return }
        Stop-Process -Id $owned[0].Id -Force -ErrorAction Stop
        $null = $owned[0].WaitForExit(10000)
        Write-Warning "Stopped only the rejected observer's source-bound AARON PID $($diagnostic.processId); waiting for runner cleanup. This capture remains rejected."
    } catch {
        Write-Warning "Could not stop only the source-bound observer after detach failure: $($_.Exception.Message)"
    }
}

$boundTargetWindow = Get-BoundTargetWindowEvidence
Assert-NoAaronProcess
if (-not (Test-Path -LiteralPath 'C:\temp' -PathType Container)) {
    throw 'C:\temp is missing; inspect the documented target and permissions'
}
foreach ($reservedPath in @($metadataPath, $captureOutputPath, $releasePath)) {
    if (Test-Path -LiteralPath $reservedPath) {
        throw "Reserved C:\temp staging path already exists; preserve it: $reservedPath"
    }
}
if (Test-Path -LiteralPath $logRoot) { throw "Fresh triplet diagnostics root already exists: $logRoot" }
$stagingResolvedPath = Resolve-DirectoryTarget 'C:\temp'
if ((Test-PathsOverlap $stagingResolvedPath $baseFullPath) -or
    (Test-PathsOverlap $stagingResolvedPath $logRoot)) {
    throw 'Resolved C:\temp storage overlaps the triplet output or repository diagnostics root'
}
$tripletRunIds = @("$tripletId-before", "$tripletId-observer", "$tripletId-after")
$prospectiveRoots = @()
foreach ($candidateRunId in $tripletRunIds) {
    $candidateRoot = [IO.Path]::GetFullPath((Join-Path $baseFullPath $candidateRunId))
    if ((Test-Path -LiteralPath $candidateRoot) -or
        (Test-Path -LiteralPath (Join-Path $externalRuns $candidateRunId))) {
        throw "Fresh triplet run root already exists; preserve it: $candidateRoot"
    }
    if (Test-PathsOverlap $stagingResolvedPath $candidateRoot) {
        throw "Resolved C:\temp overlaps prospective run root: $candidateRoot"
    }
    $prospectiveRoots += $candidateRoot
}
$stagingDrive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($stagingResolvedPath))
$outputDrive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($baseFullPath))
$minimumStagingBytes = 32MB
$minimumOutputBytes = if ($stagingDrive.Name -ieq $outputDrive.Name) { 192MB } else { 128MB }
if ($stagingDrive.AvailableFreeSpace -lt $minimumStagingBytes) {
    throw "Resolved C:\temp target has less than the required 32 MiB free"
}
if ($outputDrive.AvailableFreeSpace -lt $minimumOutputBytes) {
    throw "Triplet output drive has less than the required $([int]($minimumOutputBytes / 1MB)) MiB free"
}

# Verify the exact staging target is writable with a create/read/delete probe.
# This creates no AARON run root and never touches a pre-existing reserved path.
$writeProbePath = Join-Path 'C:\temp' ("aaron-no-tf-preflight-{0}.tmp" -f $nonce)
if (Test-Path -LiteralPath $writeProbePath) { throw "Unique staging write-probe path already exists: $writeProbePath" }
try {
    $probeBytes = [Text.Encoding]::ASCII.GetBytes('Aaron no-launch staging preflight')
    $stream = [IO.FileStream]::new($writeProbePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $stream.Write($probeBytes, 0, $probeBytes.Length)
        $stream.Flush($true)
        $stream.Position = 0
        $readBytes = New-Object byte[] $probeBytes.Length
        $readCount = $stream.Read($readBytes, 0, $readBytes.Length)
        if ($readCount -ne $probeBytes.Length -or
            [Convert]::ToBase64String($readBytes) -cne [Convert]::ToBase64String($probeBytes)) {
            throw 'C:\temp write/read probe did not round-trip exact bytes'
        }
    } finally { $stream.Dispose() }
} finally {
    if (Test-Path -LiteralPath $writeProbePath) { Remove-Item -LiteralPath $writeProbePath -Force }
}
if (Test-Path -LiteralPath $writeProbePath) { throw 'C:\temp write-probe cleanup failed' }
Assert-NoAaronProcess

$preflightId = "$tripletId-preflight"
$preflightOutput = Join-Path $baseFullPath "$preflightId-uncreated"
if (Test-Path -LiteralPath $preflightOutput) { throw "No-launch preflight placeholder already exists: $preflightOutput" }
$probeOutputNamesJson = ConvertTo-Json -InputObject @($probeName, $captureOutputName) -Compress
$preflightArgumentValues = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $runnerScript, '-ExtractedRoot', $extractedPath, '-OutputRoot', $preflightOutput,
    '-RunId', $preflightId, '-ProbeOutputNamesJson', $probeOutputNamesJson, '-PowerShellPreflightOnly')
$preflightArgumentLine = ($preflightArgumentValues | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
$preflightStartInfo = [Diagnostics.ProcessStartInfo]::new()
$preflightStartInfo.FileName = $powerShellExe
$preflightStartInfo.Arguments = $preflightArgumentLine
$preflightStartInfo.WorkingDirectory = $repoRoot
$preflightStartInfo.UseShellExecute = $false
$preflightStartInfo.CreateNoWindow = $true
$preflightStartInfo.RedirectStandardOutput = $true
$preflightStartInfo.RedirectStandardError = $true
$preflightProcess = [Diagnostics.Process]::new()
$preflightProcess.StartInfo = $preflightStartInfo
$null = $preflightProcess.Start()
$preflightStdoutTask = $preflightProcess.StandardOutput.ReadToEndAsync()
$preflightStderrTask = $preflightProcess.StandardError.ReadToEndAsync()
$preflightProcess.WaitForExit()
$preflightText = $preflightStdoutTask.Result
$preflightErrorText = $preflightStderrTask.Result
$preflightExit = $preflightProcess.ExitCode
$preflightProcess.Dispose()
if ($preflightExit -ne 0) {
    throw "Windows PowerShell no-launch child preflight failed (exit $preflightExit): $preflightErrorText $preflightText"
}
$preflight = $preflightText | ConvertFrom-Json
if ($preflight.status -cne 'ok' -or $preflight.preflightOnly -ne $true -or
    $preflight.runId -cne $preflightId -or $preflight.runnerSha256 -cne $runnerSha256 -or
    $preflight.powershellVersion -notmatch '^5\.' -or $preflight.is64BitProcess -ne $true -or
    $preflight.getFileHashCommand -cne 'Get-FileHash' -or
    @($preflight.probeOutputNames).Count -ne 2 -or
    $preflight.probeOutputNames[0] -cne $probeName -or
    $preflight.probeOutputNames[1] -cne $captureOutputName) {
    throw 'Windows PowerShell no-launch preflight did not validate the exact runner, 64-bit host, and probe filenames'
}
Assert-NoAaronProcess
if ($PreflightOnly) {
    [ordered]@{
        status = 'ok'
        preflightOnly = $true
        noAARONLaunch = $true
        debuggerAttached = $false
        helperCompiled = $false
        freshTripletRootsAbsent = $true
        tripletId = $tripletId
        prospectiveRunRoots = $prospectiveRoots
        resolvedTempTarget = $stagingResolvedPath
        tempWriteReadDeleteProbe = 'passed'
        runnerPowerShellVersion = $preflight.powershellVersion
        runnerPreflightOnly = $preflight.preflightOnly
        currentAARONProcesses = 0
    } | ConvertTo-Json -Compress
    return
}
New-Item -ItemType Directory -Path $logRoot | Out-Null
$runs = [Collections.Generic.List[object]]::new()
$runner = $null
$observerRoot = $null
$captureSummary = $null
try {
    foreach ($role in @('before', 'observer', 'after')) {
        Assert-NoAaronProcess
        $runId = "$tripletId-$role"
        $outputRoot = New-RunRoot $runId
        if ($role -eq 'observer') { $observerRoot = $outputRoot }
        Write-Host "LEG=$role RUN_ID=$runId ROOT=$outputRoot"
        $runner = Start-Runner $role $runId $outputRoot ($role -eq 'observer')
        try {
            if ($role -eq 'observer') {
                $ready = Wait-Ready $outputRoot $runId $runner
                $metadataBytes = [IO.File]::ReadAllBytes($metadataPath)
                $metadataText = [Text.UTF8Encoding]::new($false, $true).GetString($metadataBytes)
                $metadataShaAtReady = Get-Sha256Bytes $metadataBytes
                $captureSummary = Invoke-PremiumCapture $outputRoot $runId $ready $metadataText $metadataBytes
                $metadataDeadline = [DateTime]::UtcNow.AddSeconds($EndTimeoutSeconds)
                while ([DateTime]::UtcNow -lt $metadataDeadline) {
                    if (Test-Path -LiteralPath $metadataPath -PathType Leaf) {
                        $last = Get-Content -LiteralPath $metadataPath -Tail 1 -ErrorAction SilentlyContinue
                        if ($last -ceq $metadataEndMarker) { break }
                    }
                    $runner.Process.Refresh()
                    if ($runner.Process.HasExited) { break }
                    Start-Sleep -Milliseconds 150
                }
                if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf) -or
                    (Get-Content -LiteralPath $metadataPath -Tail 1 -ErrorAction SilentlyContinue) -cne $metadataEndMarker) {
                    throw 'Metadata probe did not write its released terminal END marker'
                }
                $captureSummary | Add-Member -NotePropertyName readyMetadataSha256 -NotePropertyValue $metadataShaAtReady
            }
            Wait-Runner $runner $role
        } catch {
            if ($role -eq 'observer') {
                Release-OwnedObserver $outputRoot
                Stop-OwnedObserverAfterDetachFailure $outputRoot $runId
            }
            try { Wait-Runner $runner "$role cleanup" } catch { Write-Warning "Runner logs preserved: $($_.Exception.Message)" }
            throw
        }
        $runs.Add((Read-Run $role $runId $outputRoot ($role -eq 'observer')))
        $runner = $null
        Assert-NoAaronProcess
    }

    $before = $runs[0]; $observer = $runs[1]; $after = $runs[2]
    foreach ($name in $before.artifacts.Keys) {
        foreach ($other in @($observer, $after)) {
            if ($before.artifacts[$name].sha256 -cne $other.artifacts[$name].sha256 -or
                $before.artifacts[$name].bytes -ne $other.artifacts[$name].bytes) {
                throw "Fresh drawing/scene control mismatch: $name"
            }
        }
    }
    if ($before.aa0Header -cne $observer.aa0Header -or $before.aa0Header -cne $after.aa0Header) {
        throw 'Fresh AA0 headers differ across the source-bound triplet'
    }
    foreach ($name in $before.sources.Keys) {
        foreach ($other in @($observer, $after)) {
            if ($before.sources[$name].sha256 -cne $other.sources[$name].sha256) {
                throw "Staged scene source differs across triplet: $name"
            }
        }
    }
    if ($before.planningTrace.sha256 -cne $after.planningTrace.sha256 -or
        $before.planningTrace.bytes -ne $after.planningTrace.bytes) {
        throw 'Fresh uninstrumented before/after planning traces differ'
    }
    foreach ($other in @($observer, $after)) {
        if ($other.summary.registryPatchSha256 -cne $before.summary.registryPatchSha256 -or
            $other.summary.licensePatchSha256 -cne $before.summary.licensePatchSha256 -or
            $other.summary.installerSha256 -cne $before.summary.installerSha256 -or
            $other.summary.runnerSha256 -cne $before.summary.runnerSha256) {
            throw 'Runner, installer, or runtime patch identity differs across the triplet'
        }
    }
    $relative = { param([string]$path)
        $full = [IO.Path]::GetFullPath($path)
        $prefix = [IO.Path]::GetFullPath($repoRoot).TrimEnd('\') + '\'
        if ($full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $full.Substring($prefix.Length).Replace('\', '/') }
        return $full
    }
    $comparison = [ordered]@{
        schemaVersion = 2; tripletId = $tripletId; mode = $mode; aa0Header = $before.aa0Header
        observerMethod = 'Current PREMIUM/PICK function addresses were rediscovered at the observer READY pause and their complete compiled objects matched this run PLL. A no-TF hardware breakpoint captured EFLAGS.CF immediately before the REA-identified JC, the preceding CMP operand, and the raw [EDI+0x35f] slot on the selected thread. The helper then restored the saved debug registers and detached before the JC executed. The branch successor and inner CALL are not claimed as observed.'
        sources = [ordered]@{
            coordinator = [ordered]@{ path = 'research/tools/capture-premium-internal-transfer-triplet-v4.ps1'; sha256 = $coordinatorSha256 }
            probe = [ordered]@{ path = 'research/introspection/premium-callsite-metadata-v1.cl'; sha256 = $probeSha256 }
            runner = [ordered]@{ path = 'research/oracle/run-local-scene-state-required-probe.ps1'; sha256 = $runnerSha256 }
            debuggerHelper = [ordered]@{ path = (& $relative $debuggerPath); sha256 = $debuggerSha256 }
            mapper = [ordered]@{ path = 'research/tools/map-native-code-to-pll.mjs'; sha256 = $mapperSha256 }
            reaStaticCensus = [ordered]@{ path = 'research/introspection/evidence/select-subject-call-census-20261014-v1.json'; sha256 = $reaCensusSha256 }
            extractedManifest = [ordered]@{ path = 'research/extracted/aaron/manifest.json'; sha256 = $manifestSha256 }
        }
        controlsMatch = $true
        beforeAfterPlanningTraceMatch = $true
        debuggerResult = [ordered]@{
            path = & $relative (Join-Path (Join-Path $observer.root 'capture') $captureOutputName)
            sha256 = $captureSummary.reportSha256
            readyMetadataSha256 = $captureSummary.readyMetadataSha256
            observedOuterCall = $captureSummary.result.claims.observedOuterCall
            observedInnerCallDestinationEdge = $captureSummary.result.claims.observedInnerCallDestinationEdge
            observedInnerJumpDestinationEdge = $captureSummary.result.claims.observedInnerJumpDestinationEdge
            continuousInstructionPathProven = $captureSummary.result.claims.continuousInstructionPathProven
            directLispCallerProven = $captureSummary.result.claims.directLispCallerProven
            callSiteAddress = $captureSummary.result.mapping.callSiteAddress
            measuredOuterDestination = $captureSummary.result.mapping.measuredOuterDestination
            targetWindowSha256 = $captureSummary.result.mapping.capturedWindowSha256
            referenceWindowSha256 = $captureSummary.result.mapping.referenceWindowSha256
            instructionProfileSha256 = $captureSummary.result.mapping.instructionProfileSha256
            tailJumpDestinationAddress = $captureSummary.result.mapping.tailJumpDestinationAddress
            tailJumpDestinationEqualsCurrentPick = $captureSummary.result.mapping.tailJumpDestinationEqualsCurrentPick
            branchObservation = $captureSummary.result.mapping.branchObservation
            jcConditionObservedBeforeInstruction = $captureSummary.result.claims.jcConditionObservedBeforeInstruction
            jcSuccessorObserved = $captureSummary.result.claims.jcSuccessorObserved
            candidateInnerCallSlotCaptured = $captureSummary.result.claims.candidateInnerCallSlotCaptured
            observerBinding = $observer.observerBinding
            internalSites = $captureSummary.result.mapping.internalSites
            nativeMap = & $relative $captureSummary.mapPath
        }
        runs = @($runs | ForEach-Object {
            [ordered]@{
                role = $_.role; runId = $_.runId; root = & $relative $_.root
                complete = $_.summary.complete; mode = $_.summary.mode; smallImage = $_.summary.smallImage
                runnerSha256 = $_.summary.runnerSha256; installerSha256 = $_.summary.installerSha256
                summarySha256 = (Get-FileHash -LiteralPath (Join-Path $_.root 'summary.json') -Algorithm SHA256).Hash.ToLowerInvariant()
                runtime = $_.runtime; aa0Header = $_.aa0Header; artifacts = $_.artifacts; sources = $_.sources
                planningTrace = $_.planningTrace; metadata = $_.probe; debuggerResult = $_.debuggerResult
                observerBinding = $_.observerBinding
            }
        })
        diagnostics = & $relative $logRoot
    }
    $comparisonPath = Join-Path $logRoot 'triplet-comparison.json'
    [IO.File]::WriteAllText($comparisonPath, ($comparison | ConvertTo-Json -Depth 18), [Text.UTF8Encoding]::new($false))
    Write-Output $comparisonPath
} finally {
    if ($null -ne $runner) {
        if ($null -ne $observerRoot) { Release-OwnedObserver $observerRoot }
        try { Wait-Runner $runner 'final cleanup' } catch { Write-Warning "Runner/output preserved: $($_.Exception.Message)" }
    }
}
