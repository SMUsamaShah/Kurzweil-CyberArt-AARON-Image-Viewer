[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$toolRoot = Join-Path (Join-Path $repoRoot 'research\artifacts') 'frida-stalker-trial'
$venvPython = Join-Path $toolRoot 'venv\Scripts\python.exe'
$fixtureSource = Join-Path $PSScriptRoot 'fixtures\frida-stalker-x86.cs'
$smokeScript = Join-Path $PSScriptRoot 'frida-stalker-smoke.py'
$runId = '{0}-{1}' -f [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss'), [Guid]::NewGuid().ToString('N').Substring(0, 8)
$runsRoot = Join-Path $toolRoot 'runs'
$runRoot = Join-Path $runsRoot $runId
$fixture = Join-Path $runRoot 'frida-stalker-x86.exe'
$output = Join-Path $runRoot 'smoke-result.json'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'

foreach ($path in @($venvPython, $fixtureSource, $smokeScript, $compiler)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required Frida fixture input is missing: $path"
    }
}

New-Item -ItemType Directory -Path $runsRoot -Force | Out-Null
New-Item -ItemType Directory -Path $runRoot -ErrorAction Stop | Out-Null
& $compiler '/nologo' '/platform:x86' '/optimize+' "/out:$fixture" $fixtureSource
if ($LASTEXITCODE -ne 0) { throw "The 32-bit fixture compiler failed with exit code $LASTEXITCODE" }

& $venvPython $smokeScript '--fixture' $fixture '--fixture-source' $fixtureSource `
    '--compiler' $compiler '--runner-script' $PSCommandPath '--output' $output
if ($LASTEXITCODE -ne 0) { throw "The Frida Stalker smoke test failed with exit code $LASTEXITCODE" }
Write-Host "FRIDA_SMOKE_RUN_ID=$runId"
