[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$OutputRoot,
    [string]$ArchiveBase = 'C:\AaronOracleRuns'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$oracleRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'research\extracted\local-oracle'))
$run = [IO.Path]::GetFullPath($OutputRoot)
$prefix = $oracleRoot.TrimEnd('\') + '\'
if (-not $run.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputRoot must be a run directory directly beneath research\extracted\local-oracle'
}
if (Get-Process AARON -ErrorAction SilentlyContinue) {
    throw 'An AARON process is active; preserve C:\temp and wait for the owned run to stop'
}
$runInfo = Get-Item -LiteralPath $run -Force
$runId = $runInfo.Name
$requestPath = Join-Path $run 'pre-scene-probe-request.json'
$probeNames = @()
if (Test-Path -LiteralPath $requestPath -PathType Leaf) {
    $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
    if ($request.runId -ne $runId) { throw 'Probe request runId does not match OutputRoot' }
    $probeNames = @($request.probeOutputNames)
}
$knownNames = @(
    'image', 'image-id', 'rseed', 'aaron-scene-state-snapshot.txt',
    'aaron-planning-call-trace.txt', 'aaron-writer-full.txt',
    'aaron-select-brush-matrix.txt', 'aaron-free-path-natural.txt',
    'aaron-free-path-ran.txt', 'aaron-screen-units.txt',
    'aaron-random-samples.txt', 'aaron-random-seed-loaded.txt',
    'aaron-pre-scene-probe.cl', 'aaron-probe-loader.cl',
    'aaron-native-code-release.txt', 'planning-call-trace.cl',
    'planning-random-seed-common.cl', 'scene-state-snapshot.cl',
    'scene-state-snapshot-seeded-1234.cl',
    'scene-state-snapshot-writer-seeded-1234.cl',
    'scene-state-snapshot-writer-stream-seeded-1234.cl',
    'scene-state-snapshot-writer-sequence-seeded-1234.cl',
    'scene-state-snapshot-writer-windows-seeded-1234.cl',
    'scene-state-snapshot-writer-full-seeded-1234.cl',
    'scene-state-snapshot-writer-full-seeded-5678.cl',
    'scene-state-snapshot-select-brush-matrix-seeded-1234.cl',
    'scene-state-snapshot-natural-free-path-seeded-1234.cl',
    'scene-state-snapshot-natural-free-path-seeded-5678.cl',
    'aaron-natural-free-path-capture.cl',
    'scene-state-snapshot-natural-free-path-ran-seeded-1234.cl',
    'aaron-natural-free-path-ran-capture.cl',
    'scene-state-snapshot-screen-unit-seeded-1234.cl',
    'scene-state-snapshot-screen-unit-seeded-5678.cl',
    'aaron-natural-screen-unit-capture.cl', 'aaron-natural-screen-color-capture.cl',
    'aaron-screen-color-data.txt', 'scene-state-snapshot-transition-seeded-1234.cl',
    'scene-state-snapshot-plan-seeded-1234.cl'
) + @(0..15 | ForEach-Object { "aa$_" }) + $probeNames
$start = $runInfo.CreationTime.AddSeconds(-2)
$sources = @()
foreach ($name in ($knownNames | Select-Object -Unique)) {
    $path = Join-Path 'C:\temp' $name
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $item = Get-Item -LiteralPath $path -Force
        if ($item.CreationTime -ge $start) { $sources += $item }
    }
}
if ($sources.Count -eq 0) { throw 'No run-owned staging files were found; nothing was changed' }

$archiveBaseFull = [IO.Path]::GetFullPath($ArchiveBase)
if ([IO.Path]::GetPathRoot($archiveBaseFull) -ne 'C:\') {
    throw 'ArchiveBase must be on C: so recovery does not consume more space on the staging volume'
}
$archive = Join-Path $archiveBaseFull "recovery-$runId"
if (Test-Path -LiteralPath $archive) { throw "Recovery archive already exists: $archive" }
if (-not (Test-Path -LiteralPath $archiveBaseFull -PathType Container)) {
    New-Item -ItemType Directory -Path $archiveBaseFull | Out-Null
}
New-Item -ItemType Directory -Path $archive | Out-Null
$records = @()
foreach ($source in $sources) {
    $destination = Join-Path $archive $source.Name
    Copy-Item -LiteralPath $source.FullName -Destination $destination
    $sourceHash = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $destinationHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sourceHash -ne $destinationHash -or $source.Length -ne (Get-Item -LiteralPath $destination).Length) {
        throw "Recovery copy did not verify; source was preserved: $($source.Name)"
    }
    $records += [ordered]@{
        name = $source.Name; bytes = $source.Length; sha256 = $sourceHash
        created = $source.CreationTime.ToUniversalTime().ToString('o')
    }
}
$manifest = [ordered]@{
    schemaVersion = 1; runId = $runId; outputRoot = $run
    sourceDirectory = 'C:\temp'; archivedAt = [DateTime]::UtcNow.ToString('o')
    files = $records
}
$manifestPath = Join-Path $archive 'archive-manifest.json'
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5) + "`n",
    [Text.UTF8Encoding]::new($false))
foreach ($source in $sources) {
    Remove-Item -LiteralPath $source.FullName -Force
}
Write-Output $archive
