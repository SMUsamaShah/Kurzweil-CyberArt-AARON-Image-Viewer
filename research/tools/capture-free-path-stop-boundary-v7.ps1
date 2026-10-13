[CmdletBinding()]
param(
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,39}$')]
    [string]$RunPrefix = 'freepath-v7',

    [ValidateRange(10, 600)]
    [int]$RunSeconds = 150,

    [string]$ExtractedRoot = 'research\extracted\aaron',

    [string]$BaseRoot = 'C:\AaronOracleRuns',

    [switch]$AllowMeasuredWriterStreamAt30MiB,

    [switch]$AllowMeasuredWriterStreamAt26MiB
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($AllowMeasuredWriterStreamAt30MiB -and $AllowMeasuredWriterStreamAt26MiB) {
    throw 'Choose only one measured staging allowance'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$extractedPath = if ([IO.Path]::IsPathRooted($ExtractedRoot)) {
    $ExtractedRoot
} else {
    Join-Path $repoRoot $ExtractedRoot
}
$extracted = (Resolve-Path -LiteralPath $extractedPath).Path
$probe = Join-Path $repoRoot 'research\introspection\free-path-stop-boundary-v7.cl'
$prepare = Join-Path $repoRoot 'research\tools\prepare-local-aaron-oracle-run.ps1'
$runner = Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1'
foreach ($path in @($probe, $prepare, $runner)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required capture input is missing: $path"
    }
}

$requiredName = 'aaron-free-path-stop-boundary-v7.txt'
$requiredEnd = 'END free-path-stop-boundary-v7'
$captures = [System.Collections.Generic.List[object]]::new()

foreach ($role in @('before', 'observer', 'after')) {
    if (Get-Process AARON -ErrorAction SilentlyContinue) {
        throw 'An AARON process is active; wait for it to exit before starting the next original run'
    }
    $suffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $runId = "$RunPrefix-$role-$suffix"
    Write-Host "Preparing $role control run $runId"
    $prepareArguments = @{
        RunId = $runId
        Mode = 'writer-stream-seed-1234'
        BaseRoot = $BaseRoot
    }
    if ($AllowMeasuredWriterStreamAt30MiB) {
        $prepareArguments.AllowMeasuredWriterStreamAt30MiB = $true
    }
    if ($AllowMeasuredWriterStreamAt26MiB) {
        $prepareArguments.AllowMeasuredWriterStreamAt26MiB = $true
    }
    $outputRoot = & $prepare @prepareArguments
    if (-not $outputRoot) { throw "Output-root preparation returned no path for $runId" }
    Write-Host "Running $role capture at $outputRoot"

    $runnerArguments = @{
        ExtractedRoot = $extracted
        OutputRoot = [string]$outputRoot
        RunId = $runId
        Mode = 'writer-stream-seed-1234'
        RunSeconds = $RunSeconds
    }
    if ($role -eq 'observer') {
        $runnerArguments.PreSceneProbePath = $probe
        $runnerArguments.ProbeOutputNames = @($requiredName)
        $runnerArguments.RequiredProbeOutputName = $requiredName
        $runnerArguments.RequiredProbeEndMarker = $requiredEnd
    }

    & $runner @runnerArguments | Out-Null
    Write-Host "Completed $role capture $runId"
    $captures.Add([pscustomobject]@{
        role = $role
        runId = $runId
        outputRoot = [string]$outputRoot
    })
}

[pscustomobject]@{
    mode = 'writer-stream-seed-1234'
    requiredProbeOutputName = $requiredName
    requiredProbeEndMarker = $requiredEnd
    captures = @($captures)
}
