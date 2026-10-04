[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$MapPath,
    [Parameter(Mandatory = $true)] [string]$OutputRoot,
    [Parameter(Mandatory = $true)] [string]$GhidraHome,
    [Parameter(Mandatory = $true)] [string]$JavaHome
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$mapFile = (Resolve-Path -LiteralPath $MapPath).Path
$map = Get-Content -LiteralPath $mapFile -Raw | ConvertFrom-Json
if ($map.schemaVersion -ne 1) { throw 'Unsupported native code map' }
$mappedRoot = Split-Path -Parent $mapFile
$headless = Join-Path (Resolve-Path -LiteralPath $GhidraHome).Path 'support\analyzeHeadless.bat'
$selectedJavaHome = (Resolve-Path -LiteralPath $JavaHome).Path
$reportRoot = [IO.Path]::GetFullPath($OutputRoot)
if (Test-Path -LiteralPath $reportRoot) { throw 'Ghidra report directory must be fresh' }
$projectRoot = Join-Path $reportRoot 'projects'
[IO.Directory]::CreateDirectory($projectRoot) | Out-Null
$scriptRoot = Join-Path $PSScriptRoot 'ghidra'
$previousJavaHome = $env:JAVA_HOME
$previousPath = $env:PATH

try {
    $env:JAVA_HOME = $selectedJavaHome
    $env:PATH = "$selectedJavaHome\bin;$previousPath"
    foreach ($fn in $map.functions) {
        if ($fn.name -cnotmatch '^[A-Z][A-Z0-9-]*$' -or
            $fn.payloadFile -cnotmatch '^[a-z0-9-]+\.native-payload\.bin$' -or
            -not $fn.uniqueCompleteObjectByteMatch) { throw 'Invalid mapped function' }
        $payload = Join-Path $mappedRoot $fn.payloadFile
        $payloadHash = (Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($payloadHash -ne $fn.payloadSha256) { throw "Payload hash mismatch: $($fn.name)" }
        $name = $fn.name.ToLowerInvariant()
        $reportFile = Join-Path $reportRoot "$name.ghidra.json"
        $arguments = @(
            $projectRoot, $name, '-import', $payload,
            '-loader', 'BinaryLoader', '-loader-baseAddr', $fn.runtime.entry,
            '-processor', 'x86:LE:32:default', '-cspec', 'windows', '-noanalysis',
            '-scriptPath', $scriptRoot, '-postScript', 'AaronNativeReport.java',
            $reportFile, $payload, $fn.runtime.entry, $fn.name, '-deleteProject'
        )
        & $headless @arguments *> (Join-Path $reportRoot "$name.headless.log")
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $reportFile)) {
            throw "Ghidra did not produce a report for $($fn.name); inspect its headless log"
        }
        $report = Get-Content -LiteralPath $reportFile -Raw | ConvertFrom-Json
        if ($report.subject.sha256 -ne $payloadHash -or
            $report.functionName -ne $fn.name -or
            $report.languageId -ne 'x86:LE:32:default' -or
            $report.disassembledInstructions -lt 1) {
            throw "Ghidra report identity or instruction validation failed: $($fn.name)"
        }
        [pscustomobject]@{
            function = $fn.name
            instructions = $report.disassembledInstructions
            decompilationCompleted = $report.decompilation.completed
            reportSha256 = (Get-FileHash -LiteralPath $reportFile -Algorithm SHA256).Hash.ToLowerInvariant()
        } | ConvertTo-Json -Compress
    }
} finally {
    $env:JAVA_HOME = $previousJavaHome
    $env:PATH = $previousPath
}
