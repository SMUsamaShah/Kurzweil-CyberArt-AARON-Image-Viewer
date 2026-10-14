[CmdletBinding()]
param(
    [ValidateSet('1234', '5678')]
    [string]$Seed = '1234',

    [ValidateSet('v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12')]
    [string]$ProbeVersion = 'v1',

    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,24}$')]
    [string]$RunPrefix,

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
Invoke-TripletLeg -Role before
Invoke-TripletLeg -Role observer
Invoke-TripletLeg -Role after

$node = (Get-Command node -ErrorAction Stop).Source
$observerOnlyOutputs = @('aaron-planning-call-trace.txt')
if ($ProbeVersion -in @('v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12')) {
    # PICK's requested return target causes the scene observer to append its
    # bounded PICK-return snapshot. The verifier compares the controls and
    # requires that exact snapshot to be the only observer scene-report delta.
    $observerOnlyOutputs += 'aaron-scene-state-snapshot.txt'
}
$verifyArguments = @($runRoots.before, $runRoots.observer, $runRoots.after)
if ($ProbeVersion -in @('v11', 'v12')) {
    # The intervention is allowed to change the generated AA0 and rendered
    # preview outputs. The
    # verifier still requires byte-identical uninstrumented controls and
    # source-bound observer records; it does not call the treatment parity.
    $verifyArguments += @('--allow-observer-difference=aa0',
                          '--allow-observer-difference=image',
                          '--allow-observer-difference=image-id')
}
$verifyArguments += $observerOnlyOutputs
& $node (Join-Path $repoRoot 'research\tools\verify-local-aaron-triplet.mjs') @verifyArguments
if ($LASTEXITCODE -ne 0) {
    throw 'Source-bound triplet verification failed; all three roots were retained for inspection.'
}

$observerReportPath = Join-Path $runRoots.observer "capture\$probeOutput"
$observerReport = (Get-Content -LiteralPath $observerReportPath -Raw).
    Replace("`r`n", "`n").Replace("`r", "`n")
$terminalLine = (Get-Content -LiteralPath $observerReportPath -Tail 1)
$requiredMarkers = @(
    "^BEGIN $probeTag$",
    '^INSTALL extra-targets=.* quiet-targets=.* ran=T hook=post-event$',
    "^READY $probeTag targets=.* ran=T(?: return-targets=.*)?$",
    '^UNIT-SELECT ordinal=\d+ call-id=\d+ parent-id=',
    '^UNIT-ENTER ordinal=\d+ id=\d+ parent-id=',
    '^UNIT-EXIT id=\d+ status=SUCCESS ',
    '^COMPLETE unit-id=\d+ prep-count=\d+ store-count=\d+ writer-first=\d+ writer-last=\d+ ran-count=\d+$'
)
if ($ProbeVersion -in @('v11', 'v12')) {
    $interventionOrdinal = if ($ProbeVersion -eq 'v11') { 1 } else { 2 }
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

Write-Output "TRIPLET $tripletId complete"
Write-Output "BEFORE $($runRoots.before)"
Write-Output "OBSERVER $($runRoots.observer)"
Write-Output "AFTER $($runRoots.after)"
