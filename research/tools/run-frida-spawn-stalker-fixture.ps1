[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$toolRoot = Join-Path $repoRoot 'research\artifacts\frida-stalker-trial'
$venvPython = Join-Path $toolRoot 'venv\Scripts\python.exe'
$fixtureSource = Join-Path $PSScriptRoot 'fixtures\frida-stalker-spawn-x86.cs'
$observerScript = Join-Path $PSScriptRoot 'frida-spawn-stalker-fixture.py'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
$runId = '{0}-{1}' -f [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss'), [Guid]::NewGuid().ToString('N').Substring(0, 8)
$runRoot = Join-Path (Join-Path $toolRoot 'spawn-runs') $runId
$fixture = Join-Path $runRoot 'frida-stalker-spawn-x86.exe'
$output = Join-Path $runRoot 'spawn-stalker-result.json'

foreach ($path in @($venvPython, $fixtureSource, $observerScript, $compiler)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required Frida fixture input is missing: $path"
    }
}
if (Test-Path -LiteralPath $runRoot) {
    throw "Refusing to reuse a Frida fixture output root: $runRoot"
}
New-Item -ItemType Directory -Path $runRoot -ErrorAction Stop | Out-Null

& $compiler '/nologo' '/platform:x86' '/optimize+' "/out:$fixture" $fixtureSource
if ($LASTEXITCODE -ne 0) {
    throw "The 32-bit fixture compiler failed with exit code $LASTEXITCODE"
}

& $venvPython $observerScript '--fixture' $fixture '--fixture-source' $fixtureSource '--compiler' $compiler '--runner-script' $PSCommandPath '--output' $output
if ($LASTEXITCODE -ne 0) {
    throw "The Frida spawn/Stalker fixture failed with exit code $LASTEXITCODE; preserve $runRoot"
}
Write-Host "FRIDA_SPAWN_FIXTURE_RUN_ID=$runId"
Write-Host "FRIDA_SPAWN_FIXTURE_OUTPUT=$output"
