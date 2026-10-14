[CmdletBinding()]
param(
    [ValidateSet('1234', '5678')]
    [string]$Seed = '1234',

    [ValidateSet('v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16')]
    [string]$ProbeVersion = 'v1',

    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,24}$')]
    [string]$RunPrefix,

    [string]$ExistingBeforeRoot,

    [ValidateRange(30, 600)]
    [int]$RunSeconds = 180
)

# Run fresh uninstrumented / observer / uninstrumented screen-unit captures.
# This driver serializes AARON runs, never edits or removes existing staging
# files, and retains every output root if a leg or verification fails.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $PSBoundParameters.ContainsKey('RunPrefix')) {
    $RunPrefix = "screen-context-$ProbeVersion"
}
if ($ProbeVersion -in @('v13', 'v14') -and $Seed -ne '1234') {
    throw "Probe $ProbeVersion is restricted to its seed-1234 PICK intervention evidence."
}
if ($ProbeVersion -in @('v15', 'v16') -and $Seed -ne '5678') {
    throw "Probe $ProbeVersion is restricted to its seed-5678 PICK intervention evidence."
}
if ($RunPrefix -notmatch '^[a-z0-9][a-z0-9-]{0,24}$') {
    throw 'RunPrefix must contain 1 to 25 lowercase letters, digits, or hyphens.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$prepareScript = Join-Path $repoRoot 'research\tools\prepare-local-aaron-oracle-run.ps1'
$runnerScript = Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1'
$probeTag = "screen-unit-context-$ProbeVersion"
$probePath = Join-Path $repoRoot "research\introspection\$probeTag.cl"
$mode = "screen-unit-seed-$Seed"
$probeOutput = "aaron-$probeTag.txt"
$probeEnd = "END $probeTag"
$externalRoot = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'

if ($ExistingBeforeRoot) {
    if ($ProbeVersion -ne 'v13' -or $Seed -ne '1234') {
        throw 'ExistingBeforeRoot is restricted to the v13 seed-1234 PICK intervention; v15 and v16 require three fresh roots.'
    }
    $allowedBeforeParent = [IO.Path]::GetFullPath($externalRoot).TrimEnd('\') + '\'
    $resolvedBeforeRoot = [IO.Path]::GetFullPath($ExistingBeforeRoot)
    if (-not $resolvedBeforeRoot.StartsWith($allowedBeforeParent, [StringComparison]::OrdinalIgnoreCase)) {
        throw "ExistingBeforeRoot must be an archived run under $externalRoot; it was not modified."
    }
    if (-not (Test-Path -LiteralPath $resolvedBeforeRoot -PathType Container)) {
        throw "ExistingBeforeRoot does not exist: $resolvedBeforeRoot"
    }
    $existingSummaryPath = Join-Path $resolvedBeforeRoot 'summary.json'
    $existingAa0Path = Join-Path $resolvedBeforeRoot 'capture\aa0'
    foreach ($requiredFile in @($existingSummaryPath, $existingAa0Path)) {
        if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
            throw "ExistingBeforeRoot is incomplete; missing $requiredFile"
        }
    }
    $existingSummary = Get-Content -LiteralPath $existingSummaryPath -Raw | ConvertFrom-Json
    $existingHeader = (Get-Content -LiteralPath $existingAa0Path -TotalCount 1).Trim()
    $existingAa0Hash = (Get-FileHash -LiteralPath $existingAa0Path -Algorithm SHA256).Hash.ToLowerInvariant()
    $existingFinishedAt = [DateTimeOffset]::Parse([string]$existingSummary.finishedAt)
    $existingAge = [DateTimeOffset]::UtcNow - $existingFinishedAt
    if (-not $existingSummary.complete -or
        $existingSummary.mode -ne 'screen-unit-seed-1234' -or
        $existingSummary.preSceneProbeSha256 -or
        @($existingSummary.probeOutputNames).Count -ne 0 -or
        $existingSummary.requiredProbeOutputName -or
        -not $existingSummary.probeCompletionSatisfied -or
        $existingAge.TotalMinutes -lt 0 -or $existingAge.TotalMinutes -gt 30 -or
        $existingHeader -notmatch '^768\s+1080(?:\s|$)' -or
        $existingAa0Hash -ne '405745c3bb2f31ec5423a1e42f23fa569c0e691418fcb9864869fb564364267a' -or
        $existingSummary.aa0Sha256.ToLowerInvariant() -ne $existingAa0Hash) {
        throw 'ExistingBeforeRoot failed the v13 fresh uninstrumented 768x1080 control gate; it was not modified.'
    }
    $ExistingBeforeRoot = $resolvedBeforeRoot
}

foreach ($path in @($prepareScript, $runnerScript, $probePath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required screen-unit triplet input is missing: $path"
    }
}

if (-not (Test-Path -LiteralPath 'C:\temp' -PathType Container)) {
    throw 'AARON requires C:\temp; inspect its documented symlink target and permissions.'
}
$tempItem = Get-Item -LiteralPath 'C:\temp' -Force
$stagingPath = 'C:\temp'
if ($tempItem.LinkType -in @('SymbolicLink', 'Junction')) {
    $target = [string]@($tempItem.Target)[0]
    $stagingPath = if ([IO.Path]::IsPathRooted($target)) {
        [IO.Path]::GetFullPath($target)
    } else {
        [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $tempItem.FullName) $target))
    }
}

function Resolve-DirectoryTarget([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    for ($depth = 0; $depth -lt 8; $depth++) {
        $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
        if ($item.LinkType -notin @('SymbolicLink', 'Junction') -or -not $item.Target) {
            return $current
        }
        $linkTarget = [string]@($item.Target)[0]
        $current = if ([IO.Path]::IsPathRooted($linkTarget)) {
            [IO.Path]::GetFullPath($linkTarget)
        } else {
            [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $current) $linkTarget))
        }
    }
    throw "Too many nested directory links while resolving $Path"
}

$configuredBaseRoot = 'C:\AaronOracleRuns'
$resolvedExternalRoot = if (Test-Path -LiteralPath $externalRoot -PathType Container) {
    Resolve-DirectoryTarget $externalRoot
} else {
    # The prepare helper creates external-runs on first use and backs it with
    # this configured default. Check the eventual output volume before that.
    [IO.Path]::GetFullPath($configuredBaseRoot)
}
$stagingDriveName = [IO.Path]::GetPathRoot($stagingPath).TrimEnd('\').TrimEnd(':')
$outputDriveName = [IO.Path]::GetPathRoot($resolvedExternalRoot).TrimEnd('\').TrimEnd(':')
$stagingDrive = Get-PSDrive -Name $stagingDriveName -PSProvider FileSystem
$outputDrive = Get-PSDrive -Name $outputDriveName -PSProvider FileSystem
$stagingMinimum = 128MB + (2 * 5MB)
$perRunOutputMinimum = if ($stagingDriveName -eq $outputDriveName) { 192MB } else { 128MB }
$outputMinimum = 3 * $perRunOutputMinimum
if ($stagingDrive.Free -lt $stagingMinimum) {
    throw ("Triplet stopped before its first run: C:\temp resolves to {0} on {1}: with {2:N1} MiB free; " -f `
        $stagingPath, $stagingDriveName, ($stagingDrive.Free / 1MB)) +
        ("the 3-run reserve requires {0:N1} MiB for staging. No AARON process was launched." -f `
            ($stagingMinimum / 1MB))
}
if ($outputDrive.Free -lt $outputMinimum) {
    throw ("Triplet stopped before its first run: output resolves to {0} on {1}: with {2:N1} MiB free; " -f `
        $resolvedExternalRoot, $outputDriveName, ($outputDrive.Free / 1MB)) +
        ("the 3-run reserve requires {0:N1} MiB. No AARON process was launched." -f `
            ($outputMinimum / 1MB))
}

$reservedNames = @(
    'image', 'image-id', 'rseed', 'aaron-scene-state-snapshot.txt',
    'aaron-planning-call-trace.txt', 'aaron-writer-full.txt',
    'aaron-screen-units.txt', 'aaron-screen-color-data.txt',
    $probeOutput, 'aaron-pre-scene-probe.cl', 'aaron-probe-loader.cl'
)
$collisions = @($reservedNames | Where-Object {
    Test-Path -LiteralPath (Join-Path 'C:\temp' $_)
})
if ($collisions.Count -gt 0) {
    throw ('C:\temp contains reserved AARON staging files; they were preserved: ' +
        ($collisions -join ', '))
}

$writeProbe = Join-Path 'C:\temp' ('.screen-context-triplet-' + [Guid]::NewGuid().ToString('N') + '.tmp')
try {
    [IO.File]::WriteAllText($writeProbe, 'AARON screen-unit triplet preflight')
} catch {
    throw ('C:\temp is not writable in this command context. Use the documented scoped-elevation ' +
        'path for this exact runner; do not retarget the link or change ACLs. ' + $_.Exception.Message)
} finally {
    if (Test-Path -LiteralPath $writeProbe -PathType Leaf) {
        Remove-Item -LiteralPath $writeProbe -Force
    }
}

function Assert-NoAaronProcess {
    $active = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
    if ($active.Count -gt 0) {
        throw ('An AARON process is already active (PID ' +
            (($active | ForEach-Object Id) -join ', ') + '); refusing to overlap oracle runs.')
    }
}

$stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$nonce = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$tripletId = "$RunPrefix-$stamp-$nonce"
$runRoots = @{}

function Invoke-TripletLeg {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('before', 'observer', 'after')]
        [string]$Role
    )

    Assert-NoAaronProcess
    $runId = "$tripletId-$Role"
    $root = (& $prepareScript -RunId $runId -Mode $mode | Select-Object -Last 1).ToString()
    if (-not $root -or (Test-Path -LiteralPath $root)) {
        throw "The prepared $Role output root is not fresh: $root"
    }
    $runRoots[$Role] = $root
    $arguments = @{
        ExtractedRoot = 'research\extracted\aaron'
        OutputRoot = $root
        RunId = $runId
        Mode = $mode
        RunSeconds = $RunSeconds
    }
    if ($Role -eq 'observer') {
        $arguments.PreSceneProbePath = $probePath
        $arguments.ProbeOutputNames = @($probeOutput)
        $arguments.RequiredProbeOutputName = $probeOutput
        $arguments.RequiredProbeEndMarker = $probeEnd
        $arguments.PreSceneProbePauseSeconds = 0
    }
    Assert-NoAaronProcess
    & $runnerScript @arguments | Out-Null
    Assert-NoAaronProcess
    $summaryPath = Join-Path $root 'summary.json'
    if (-not (Test-Path -LiteralPath $summaryPath -PathType Leaf)) {
        throw "$Role run has no retained summary: $root"
    }
    $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
    if (-not $summary.complete) { throw "$Role run is incomplete: $root" }
    Write-Output "$Role $root AA0=$($summary.aa0Sha256)"
}

Assert-NoAaronProcess
if ($ExistingBeforeRoot) {
    $runRoots.before = $ExistingBeforeRoot
    $existingAa0Hash = (Get-Content -LiteralPath (Join-Path $ExistingBeforeRoot 'summary.json') -Raw | ConvertFrom-Json).aa0Sha256
    Write-Output "before $ExistingBeforeRoot AA0=$existingAa0Hash (reused verified fresh uninstrumented control)"
} else {
    Invoke-TripletLeg -Role before
}
if ($ProbeVersion -eq 'v13') {
    # This treatment is only interpretable against the measured
    # seed-1234 unit-2 768x1080 case. Use the actual AA0 header and stop after
    # the first control if the live runtime chooses another canvas; never set
    # display preferences to force a match.
    $beforeAa0Path = Join-Path $runRoots.before 'capture\aa0'
    $beforeHeader = (Get-Content -LiteralPath $beforeAa0Path -TotalCount 1).Trim()
    if ($beforeHeader -notmatch '^768\s+1080(?:\s|$)') {
        throw "Probe v13 requires a fresh 768x1080 control; measured '$beforeHeader'. The before root was retained and no observer was launched."
    }
} elseif ($ProbeVersion -eq 'v14') {
    # This treatment targets the terminal third PICK in the measured
    # seed-1234 unit-6 320x480 case. Never change the live display mode.
    $beforeAa0Path = Join-Path $runRoots.before 'capture\aa0'
    $beforeHeader = (Get-Content -LiteralPath $beforeAa0Path -TotalCount 1).Trim()
    if ($beforeHeader -notmatch '^320\s+480(?:\s|$)') {
        throw "Probe v14 requires a fresh 320x480 control; measured '$beforeHeader'. The before root was retained and no observer was launched."
    }
} elseif ($ProbeVersion -in @('v15', 'v16')) {
    # These treatments target unit 6 in the measured seed-5678 768x1080 case.
    # Keep all three roots fresh; never force display mode.
    $beforeAa0Path = Join-Path $runRoots.before 'capture\aa0'
    $beforeHeader = (Get-Content -LiteralPath $beforeAa0Path -TotalCount 1).Trim()
    if ($beforeHeader -notmatch '^768\s+1080(?:\s|$)') {
        throw "Probe $ProbeVersion requires a fresh 768x1080 control; measured '$beforeHeader'. The before root was retained and no observer was launched."
    }
}
Invoke-TripletLeg -Role observer
Invoke-TripletLeg -Role after

$observerReportPath = Join-Path $runRoots.observer "capture\$probeOutput"
$observerReport = (Get-Content -LiteralPath $observerReportPath -Raw).
    Replace("`r`n", "`n").Replace("`r", "`n")
$terminalLine = (Get-Content -LiteralPath $observerReportPath -Tail 1)
$pickReturnVersions = @('v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16')
if ($ProbeVersion -in $pickReturnVersions -and
    $observerReport -notmatch '(?m)^TARGET-INSTALLED name=PICK$') {
    $tracePath = Join-Path $runRoots.observer 'capture\aaron-planning-call-trace.txt'
    $targetStatus = @()
    if (Test-Path -LiteralPath $tracePath -PathType Leaf) {
        $targetStatus = @(Select-String -LiteralPath $tracePath -Pattern '^TARGET PICK (.*)$' |
            ForEach-Object { $_.Matches[0].Groups[1].Value })
    }
    $detail = if ($targetStatus.Count -gt 0) {
        'planning-call-trace reports: ' + ($targetStatus -join '; ')
    } else {
        'planning-call-trace has no PICK installation result; inspect its staged target list and loader order'
    }
    throw "Observer lacks TARGET-INSTALLED name=PICK; no PICK-call conclusion is supported. $detail. All roots were retained."
}
$requiredMarkers = @(
    "^BEGIN $probeTag$",
    '^INSTALL extra-targets=.* quiet-targets=.* ran=T hook=post-event$',
    "^READY $probeTag targets=.* ran=T(?: return-targets=.*)?$",
    '^UNIT-SELECT ordinal=\d+ call-id=\d+ parent-id=',
    '^UNIT-ENTER ordinal=\d+ id=\d+ parent-id=',
    '^UNIT-EXIT id=\d+ status=SUCCESS ',
    '^COMPLETE unit-id=\d+ prep-count=\d+ store-count=\d+ writer-first=\d+ writer-last=\d+ ran-count=\d+$'
)
if ($ProbeVersion -in @('v11', 'v12', 'v13', 'v14', 'v15', 'v16')) {
    $interventionOrdinal = @{ v11 = 1; v12 = 2; v13 = 1; v14 = 3; v15 = 2; v16 = 3 }[$ProbeVersion]
    $requiredMarkers += '^PICK-INTERVENTION-COMPLETE target-ordinal=' + $interventionOrdinal +
        ' selected-pick-count=\d+ substitution-count=1 target-call-id=\d+ native=-?\d+ caller=-?\d+ prevdex=-?\d+$'
}
foreach ($marker in $requiredMarkers) {
    if ($observerReport -notmatch "(?m)$marker") {
        throw "Observer report lacks required completion evidence ($marker); all roots were retained."
    }
}
if ($terminalLine -cne $probeEnd) {
    throw "Observer report has no terminal END marker; all roots were retained."
}
if ($observerReport -match '(?m)^(INCOMPLETE|OVERFLOW|OBSERVER-ERROR)\b') {
    throw 'Observer report contains an incomplete, overflow, or error record; all roots were retained.'
}

$node = (Get-Command node -ErrorAction Stop).Source
$observerOnlyOutputs = @('aaron-planning-call-trace.txt')
if ($ProbeVersion -in $pickReturnVersions) {
    # PICK's requested return target causes the scene observer to append its
    # bounded first-PICK snapshot; it is not the selected unit's PICK ordinal.
    $observerOnlyOutputs += 'aaron-scene-state-snapshot.txt'
}
$verifyArguments = @($runRoots.before, $runRoots.observer, $runRoots.after)
if ($ProbeVersion -in @('v11', 'v12', 'v13', 'v14', 'v15', 'v16')) {
    # The intervention is allowed to change the generated AA0 and rendered
    # preview outputs; the controls and source-bound records remain strict.
    $verifyArguments += @('--allow-observer-difference=aa0',
                          '--allow-observer-difference=image',
                          '--allow-observer-difference=image-id')
}
$verifyArguments += $observerOnlyOutputs
& $node (Join-Path $repoRoot 'research\tools\verify-local-aaron-triplet.mjs') @verifyArguments
if ($LASTEXITCODE -ne 0) {
    throw 'Source-bound triplet verification failed; all three roots were retained for inspection.'
}

Write-Output "TRIPLET $tripletId complete"
Write-Output "BEFORE $($runRoots.before)"
Write-Output "OBSERVER $($runRoots.observer)"
Write-Output "AFTER $($runRoots.after)"
