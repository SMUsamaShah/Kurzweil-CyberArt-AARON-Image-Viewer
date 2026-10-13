[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,63}$')]
    [string]$RunId,

    [Parameter(Mandatory = $true)]
    [ValidateSet('baseline', 'seed-1234', 'writer-seed-1234',
                 'writer-stream-seed-1234', 'writer-sequence-seed-1234',
                 'writer-windows-seed-1234', 'writer-full-seed-1234',
                 'writer-full-seed-5678', 'select-brush-matrix-seed-1234',
                 'natural-free-path-seed-1234', 'natural-free-path-seed-5678',
                 'natural-free-path-ran-seed-1234', 'screen-unit-seed-1234',
                 'screen-unit-seed-5678', 'transition-seed-1234', 'plan-seed-1234')]
    [string]$Mode,

    [string]$BaseRoot = 'C:\AaronOracleRuns',

    [switch]$AllowMeasuredWriterStreamAt30MiB
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$localOracleRoot = Join-Path $repoRoot 'research\extracted\local-oracle'
$junctionPath = Join-Path $localOracleRoot 'external-runs'
$base = [IO.Path]::GetFullPath($BaseRoot)
$output = Join-Path $junctionPath $RunId
if (Get-Process AARON -ErrorAction SilentlyContinue) {
    throw 'An AARON process is already active; do not overlap original-runtime runs'
}

$temp = Get-Item -LiteralPath 'C:\temp' -Force
$stagingPath = 'C:\temp'
if ($temp.LinkType -in @('SymbolicLink', 'Junction')) {
    $target = [string]@($temp.Target)[0]
    if ([IO.Path]::IsPathRooted($target)) {
        $stagingPath = [IO.Path]::GetFullPath($target)
    } else {
        $stagingPath = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $temp.FullName) $target))
    }
}
$stagingDriveName = [IO.Path]::GetPathRoot($stagingPath).TrimEnd('\').TrimEnd(':')
$outputDriveName = [IO.Path]::GetPathRoot($base).TrimEnd('\').TrimEnd(':')
$stagingDrive = Get-PSDrive -Name $stagingDriveName -PSProvider FileSystem
$outputDrive = Get-PSDrive -Name $outputDriveName -PSProvider FileSystem
$largeMode = $Mode -in @('writer-sequence-seed-1234', 'writer-windows-seed-1234',
    'writer-full-seed-1234', 'writer-full-seed-5678',
    'screen-unit-seed-1234', 'screen-unit-seed-5678')
if ($AllowMeasuredWriterStreamAt30MiB -and $Mode -ne 'writer-stream-seed-1234') {
    throw 'The 30 MiB staging allowance is only valid for writer-stream-seed-1234'
}
# The exact 2026-10-13 writer-stream capture peaked at 21,660,528 staged bytes.
# The opt-in threshold preserves more than 9 MiB of headroom at the minimum.
$minStaging = if ($largeMode) { 128MB } elseif ($AllowMeasuredWriterStreamAt30MiB) { 30MB } else { 32MB }
$minOutput = if ($stagingDriveName -eq $outputDriveName) { 192MB } else { 128MB }
if ($stagingDrive.Free -lt $minStaging) {
    throw ("C:\temp resolves to {0}: with {1:N1} MiB free; this mode needs at least {2:N0} MiB before launch. " -f `
        $stagingPath, ($stagingDrive.Free / 1MB), ($minStaging / 1MB)) +
        'Archive only the interrupted run''s staging files, then retry this preflight.'
}
if ($outputDrive.Free -lt $minOutput) {
    throw ("Output drive {0}: has {1:N1} MiB free; this mode needs at least {2:N0} MiB. " -f `
        $outputDriveName, ($outputDrive.Free / 1MB), ($minOutput / 1MB)) +
        'Use a dedicated output drive with enough free space.'
}

if (-not (Test-Path -LiteralPath $base -PathType Container)) {
    New-Item -ItemType Directory -Path $base | Out-Null
}
if (Test-Path -LiteralPath $junctionPath) {
    $link = Get-Item -LiteralPath $junctionPath -Force
    $existingTarget = if ($link.Target) { [IO.Path]::GetFullPath([string]@($link.Target)[0]) } else { '' }
    if ($link.LinkType -ne 'Junction' -or
        -not [string]::Equals($existingTarget.TrimEnd('\'), $base.TrimEnd('\'),
            [StringComparison]::OrdinalIgnoreCase)) {
        throw "External run path exists with an unexpected type or target: $junctionPath"
    }
} else {
    New-Item -ItemType Junction -Path $junctionPath -Target $base | Out-Null
}
if (Test-Path -LiteralPath $output) { throw "Oracle output root already exists: $output" }
Write-Output $output
