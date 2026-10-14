[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('function', 'decompile', 'xrefs', 'resolve-native-call-targets', 'inspect-native-instruction')]
    [string]$Operation,

    [Parameter(Mandatory = $true)]
    [string]$InputPePath,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^0x[0-9a-fA-F]+$')]
    [string]$Address,

    [Parameter(Mandatory = $true)]
    [string]$OutputRoot,

    [ValidatePattern('^[a-z0-9][a-z0-9-]*\.json$')]
    [string]$ReportName = 'rea-result.json',

    [string]$SeedFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$toolchainPath = Join-Path $repoRoot 'research\artifacts\rea-tools\toolchain-current.json'
$toolchainRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'research\artifacts\rea-tools'))
if (-not (Test-Path -LiteralPath $toolchainPath -PathType Leaf)) {
    throw "Current REA toolchain is missing: $toolchainPath"
}
$toolchain = Get-Content -LiteralPath $toolchainPath -Raw | ConvertFrom-Json

function Resolve-RepoPath([string]$Path, [string]$Label) {
    if ([IO.Path]::IsPathRooted($Path)) {
        $resolved = [IO.Path]::GetFullPath($Path)
    }
    else {
        $resolved = [IO.Path]::GetFullPath((Join-Path $repoRoot $Path))
    }
    if (-not $resolved.StartsWith($repoRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label must stay inside the repository"
    }
    return $resolved
}

function Get-RepoRelativePath([string]$Path) {
    # Keep compatibility with Windows PowerShell/.NET Framework, which lacks
    # Path.GetRelativePath. Every call site has already passed Resolve-RepoPath.
    return $Path.Substring($repoRoot.Length + 1).Replace('\', '/')
}

$inputFile = Resolve-RepoPath $InputPePath 'Input PE'
if (-not $inputFile.StartsWith($toolchainRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetExtension($inputFile) -notin @('.exe', '.dll') -or
    -not (Test-Path -LiteralPath $inputFile -PathType Leaf)) {
    throw 'Input must be an existing synthetic PE beneath research/artifacts/rea-tools'
}

$outputDirectory = Resolve-RepoPath $OutputRoot 'Output root'
if (-not $outputDirectory.StartsWith($toolchainRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or
    (Test-Path -LiteralPath $outputDirectory)) {
    throw 'Output root must be a new, unused directory beneath research/artifacts/rea-tools'
}

$node = [IO.Path]::GetFullPath($toolchain.node)
$reaCli = [IO.Path]::GetFullPath($toolchain.reaCli)
$ghidra = [IO.Path]::GetFullPath($toolchain.ghidra)
$javaHome = [IO.Path]::GetFullPath($toolchain.javaHome)
foreach ($required in @(
    @{ Path = $node; Label = 'Node runtime' },
    @{ Path = $reaCli; Label = 'REA CLI' },
    @{ Path = (Join-Path $ghidra 'support\analyzeHeadless.bat'); Label = 'Ghidra headless launcher' },
    @{ Path = (Join-Path $javaHome 'bin\java.exe'); Label = 'Java runtime' }
)) {
    if (-not (Test-Path -LiteralPath $required.Path -PathType Leaf)) {
        throw "$($required.Label) is missing: $($required.Path)"
    }
}

$seed = $null
if ($SeedFile) {
    $seed = Resolve-RepoPath $SeedFile 'Seed file'
    if (-not (Test-Path -LiteralPath $seed -PathType Leaf)) {
        throw "Seed file is missing: $seed"
    }
}

if ($Operation -eq 'inspect-native-instruction') {
    if (-not $seed) {
        throw 'inspect-native-instruction requires the bounded-window code seed; function-name seeds are not accepted'
    }
    if (-not $seed.StartsWith($toolchainRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The bounded-window code seed must stay beneath research/artifacts/rea-tools'
    }
    $seedLines = [IO.File]::ReadAllLines($seed)
    if ($seedLines.Length -ne 1) {
        throw 'The bounded-window seed must contain exactly one address<TAB>code line'
    }
    $seedFields = $seedLines[0].Split([char]9)
    if ($seedFields.Length -ne 2 -or $seedFields[0] -ine $Address -or $seedFields[1] -cne 'code') {
        throw 'The bounded-window seed must be exactly the requested address<TAB>code; function-name seeds are forbidden'
    }
}

[void][IO.Directory]::CreateDirectory($outputDirectory)
$reportPath = Join-Path $outputDirectory $ReportName
$stderrPath = Join-Path $outputDirectory 'rea-stderr.txt'
$metadataPath = Join-Path $outputDirectory 'rea-invocation.json'
$inputHash = (Get-FileHash -LiteralPath $inputFile -Algorithm SHA256).Hash.ToLowerInvariant()
$toolchainHash = (Get-FileHash -LiteralPath $toolchainPath -Algorithm SHA256).Hash.ToLowerInvariant()
$seedHash = if ($seed) { (Get-FileHash -LiteralPath $seed -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }

$environmentNames = @(
    'GHIDRA_INSTALL_DIR', 'JAVA_HOME', 'PATH', 'REA_ANALYSIS_PROVIDER',
    'GHIDRA_HEADLESS_MAXMEM', 'REA_GHIDRA_LANGUAGE_ID',
    'REA_GHIDRA_COMPILER_SPEC_ID', 'REA_GHIDRA_SEED_FILE'
)
$oldEnvironment = @{}
foreach ($name in $environmentNames) { $oldEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

try {
    # toolchain-current.json stores the executable paths, but REA's Windows
    # provider discovers Ghidra and Java from process environment variables.
    $env:GHIDRA_INSTALL_DIR = $ghidra
    $env:JAVA_HOME = $javaHome
    $env:PATH = "$javaHome\bin;$($oldEnvironment['PATH'])"
    $env:REA_ANALYSIS_PROVIDER = 'ghidra'
    $env:GHIDRA_HEADLESS_MAXMEM = '512M'
    $env:REA_GHIDRA_LANGUAGE_ID = 'x86:LE:32:default'
    $env:REA_GHIDRA_COMPILER_SPEC_ID = 'windows'
    if ($seed) { $env:REA_GHIDRA_SEED_FILE = $seed }
    else { Remove-Item Env:REA_GHIDRA_SEED_FILE -ErrorAction SilentlyContinue }

    $arguments = @($reaCli, $Operation, $inputFile, $Address, '--provider', 'ghidra', '--format', 'json')
    $process = Start-Process -FilePath $node -ArgumentList $arguments `
        -WorkingDirectory $repoRoot -PassThru -NoNewWindow `
        -RedirectStandardOutput $reportPath -RedirectStandardError $stderrPath
    $processHandle = $process.Handle
    if ($processHandle -eq [IntPtr]::Zero) {
        throw "Could not acquire a process handle for REA $Operation"
    }
    $waitTimeout = [TimeSpan]::FromMinutes(30)
    if (-not $process.WaitForExit([int]$waitTimeout.TotalMilliseconds)) {
        $cleanupFailure = $null
        try {
            if (-not $process.HasExited) { $process.Kill() }
            $processStopped = $process.WaitForExit(5000)
            if (-not $processStopped) { $cleanupFailure = 'the REA process did not stop within 5 seconds' }
        } catch {
            $cleanupFailure = $_.Exception.Message
        }
        $cleanupDiagnostic = if ($cleanupFailure) { " Cleanup failed: $cleanupFailure." } else { ' The timed-out REA process was stopped.' }
        throw "REA $Operation timed out after $([int]$waitTimeout.TotalMinutes) minutes.$cleanupDiagnostic See $reportPath and $stderrPath"
    }
    $process.Refresh()
    $processExitCode = if ($process.HasExited) { $process.ExitCode } else { $null }
    if ($null -eq $processExitCode) {
        throw "REA $Operation finished without a retrievable process exit code. See $reportPath and $stderrPath"
    }

    $report = $null
    if (Test-Path -LiteralPath $reportPath -PathType Leaf) {
        $reportText = Get-Content -LiteralPath $reportPath -Raw
        if ($reportText.Trim()) {
            try { $report = $reportText | ConvertFrom-Json }
            catch { throw "REA output is not valid JSON; inspect $reportPath and $stderrPath" }
        }
    }
    $reportHasError = $report -and ($report.PSObject.Properties.Name -contains 'error')
    if ($processExitCode -ne 0 -or -not $report -or $reportHasError) {
        $messageProperty = if ($report) { $report.PSObject.Properties['message'] } else { $null }
        $diagnostic = if ($messageProperty) { $messageProperty.Value } else { 'no structured diagnostic' }
        throw "REA $Operation failed with exit code $($processExitCode): $diagnostic. See $reportPath and $stderrPath"
    }
    if ($report.subject.digest.sha256 -ne $inputHash) {
        throw 'REA report subject hash does not match the exact input PE'
    }

    $reportHash = (Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $stderrHash = (Get-FileHash -LiteralPath $stderrPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $metadata = [ordered]@{
        schemaVersion = 1
        operation = $Operation
        address = $Address.ToLowerInvariant()
        provider = 'ghidra'
        reaVersion = $toolchain.reaVersion
        ghidraVersion = '12.1.4'
        toolchain = [ordered]@{ path = 'research/artifacts/rea-tools/toolchain-current.json'; sha256 = $toolchainHash }
        input = [ordered]@{ path = (Get-RepoRelativePath $inputFile); sha256 = $inputHash }
        seed = if ($seed) { [ordered]@{ path = (Get-RepoRelativePath $seed); sha256 = $seedHash } } else { $null }
        report = [ordered]@{ path = $ReportName; sha256 = $reportHash; bytes = (Get-Item -LiteralPath $reportPath).Length }
        stderr = [ordered]@{ path = 'rea-stderr.txt'; sha256 = $stderrHash; bytes = (Get-Item -LiteralPath $stderrPath).Length }
        staticOnly = $true
        inputWasExecuted = $false
    }
    $json = $metadata | ConvertTo-Json -Depth 8
    [IO.File]::WriteAllText($metadataPath, $json + "`n", [Text.UTF8Encoding]::new($false))
    $metadata | ConvertTo-Json -Depth 8
}
finally {
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, $oldEnvironment[$name], 'Process')
    }
}
