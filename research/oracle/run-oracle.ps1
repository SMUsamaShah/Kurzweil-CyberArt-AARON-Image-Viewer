[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ExtractedRoot,

    [Parameter(Mandatory = $true)]
    [string]$OutputRoot,

    [ValidateSet('application', 'screensaver', 'direct-screensaver')]
    [string]$Mode = 'direct-screensaver',

    [ValidateRange(10, 3600)]
    [int]$RunSeconds = 360,

    [ValidateRange(1, 16)]
    [int]$TargetPaintings = 1,

    [switch]$KcatDebug,
    [switch]$AclStartupDebug,
    [switch]$NativeTrace,
    [switch]$DisableAaronDep,
    [switch]$PatchRegistryRunning,
    [string]$CompatibilityLayer = '',
    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExtractedRoot = (Resolve-Path $ExtractedRoot).Path
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$ApplicationRoot = Join-Path $ExtractedRoot 'application'
$InstallerPath = Join-Path $ExtractedRoot 'installer\AARON.msi'
$ManifestPath = Join-Path $ExtractedRoot 'manifest.json'
$LogRoot = Join-Path $OutputRoot 'logs'
$CaptureRoot = Join-Path $OutputRoot 'paintings'

New-Item -ItemType Directory -Force -Path $OutputRoot, $LogRoot, $CaptureRoot | Out-Null
$TranscriptPath = Join-Path $LogRoot 'transcript.txt'
$TranscriptStarted = $false
$FirewallRules = [Collections.Generic.List[string]]::new()
$OriginalEnvironment = @{}
$DepOverrideApplied = $false
$RegistryPatchResult = $null

function Write-RegistrySnapshot {
    param([string]$Destination)

    $keys = @(
        'HKCU\Software\Kurzweil CyberArt Technologies\AARON',
        'HKLM\Software\Kurzweil CyberArt Technologies\AARON',
        'HKLM\Software\WOW6432Node\Kurzweil CyberArt Technologies\AARON'
    )
    $lines = foreach ($key in $keys) {
        "### $key"
        $query = & reg.exe query $key /s 2>&1
        if ($LASTEXITCODE -eq 0) { $query } else { '(not present)' }
        ''
    }
    $lines | Set-Content -Encoding UTF8 -Path $Destination
}

function Get-AaFiles {
    param([string[]]$Directories)

    foreach ($directory in ($Directories | Select-Object -Unique)) {
        if (-not (Test-Path $directory -PathType Container)) { continue }
        Get-ChildItem -LiteralPath $directory -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^AA(?:[0-9]|1[0-5])$' }
    }
}

function Test-AaComplete {
    param([string]$Path)

    try {
        $lastLine = Get-Content -LiteralPath $Path -Tail 20 -ErrorAction Stop |
            Where-Object { $_.Trim().Length -gt 0 } |
            Select-Object -Last 1
        return $null -ne $lastLine -and $lastLine.Trim() -eq 'end'
    } catch {
        return $false
    }
}

function Get-InstalledAaronExecutable {
    param([string]$ExpectedSha256)

    $installedPath = 'C:\Program Files (x86)\Kurzweil CyberArt\AARON\AARON.exe'
    if ((Test-Path $installedPath) -and
        (Get-FileHash $installedPath -Algorithm SHA256).Hash -eq $ExpectedSha256) {
        return $installedPath
    }

    $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) |
        Where-Object { $_ -and (Test-Path $_) } |
        Select-Object -Unique
    foreach ($root in $roots) {
        $candidates = Get-ChildItem -LiteralPath $root -Filter 'AARON.exe' -File -Recurse `
            -ErrorAction SilentlyContinue
        foreach ($candidate in $candidates) {
            if ((Get-FileHash -LiteralPath $candidate.FullName -Algorithm SHA256).Hash -eq $ExpectedSha256) {
                return $candidate.FullName
            }
        }
    }
    return $null
}

function Add-NetworkBlock {
    param([string]$Program)

    if (-not (Test-Path $Program -PathType Leaf)) { return }
    $ruleName = "AARON oracle $PID $([IO.Path]::GetFileName($Program)) $($FirewallRules.Count)"
    New-NetFirewallRule -DisplayName $ruleName -Direction Outbound -Action Block `
        -Program $Program -Profile Any | Out-Null
    $FirewallRules.Add($ruleName)
}

function Write-ProcessSnapshot {
    param([string]$Destination)

    Get-CimInstance Win32_Process |
        Where-Object { $_.Name -match '^AARON(?:_ScreenSaver)?\.(?:exe|scr)$' } |
        Select-Object Name, ProcessId, ParentProcessId, ExecutablePath, CommandLine |
        ConvertTo-Json -Depth 3 |
        Set-Content -Encoding UTF8 -Path $Destination
}

try {
    Start-Transcript -Path $TranscriptPath -Force | Out-Null
    $TranscriptStarted = $true

    $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    foreach ($entry in $manifest.files) {
        $path = Join-Path $ApplicationRoot $entry.installedName
        $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $entry.sha256) {
            throw "Hash mismatch for $($entry.installedName): $actualHash"
        }
    }

    Write-RegistrySnapshot (Join-Path $LogRoot 'registry-before.txt')

    $installExitCode = $null
    if (-not $SkipInstall) {
        $msiLog = Join-Path $LogRoot 'msi-install.log'
        $arguments = @('/i', "`"$InstallerPath`"", '/qn', '/norestart', '/l*v', "`"$msiLog`"")
        $installer = Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments `
            -Wait -PassThru
        $installExitCode = $installer.ExitCode
    }

    $expectedExeHash = ($manifest.files |
        Where-Object { $_.installedName -eq 'AARON.exe' }).sha256.ToUpperInvariant()
    $portableExe = Join-Path $ApplicationRoot 'AARON.exe'
    $portableScreenSaver = Join-Path $ApplicationRoot 'AARON_ScreenSaver.scr'
    $installedExe = Get-InstalledAaronExecutable $expectedExeHash
    $aaronExe = if ($installedExe) { $installedExe } else { $portableExe }
    $workingDirectory = Split-Path -Parent $aaronExe
    $installedScreenSaver = Join-Path $workingDirectory 'AARON_ScreenSaver.scr'
    $screenSaver = if (Test-Path $installedScreenSaver) {
        $installedScreenSaver
    } else {
        $portableScreenSaver
    }

    if ($PatchRegistryRunning) {
        $registryPath = Join-Path $workingDirectory 'registry.dll'
        $registryEntry = $manifest.files |
            Where-Object { $_.installedName -eq 'registry.dll' } |
            Select-Object -First 1
        if ($null -eq $registryEntry) {
            throw 'The extraction manifest has no registry.dll hash'
        }
        $patchScript = Join-Path $PSScriptRoot '..\tools\patch-registry-running.ps1'
        $patchJson = & $patchScript -Path $registryPath -ExpectedSha256 $registryEntry.sha256 `
            -Exports @('KCATisRunning', 'KCATgetDaysSinceInstalled')
        $RegistryPatchResult = $patchJson | ConvertFrom-Json
        $RegistryPatchResult |
            ConvertTo-Json -Depth 8 |
            Set-Content -Encoding UTF8 -Path (Join-Path $LogRoot 'registry-patch.json')
    }

    $credentialVariables = @(
        'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
        'ACTIONS_RUNTIME_TOKEN',
        'ACTIONS_CACHE_URL',
        'ACTIONS_RESULTS_URL',
        'ACTIONS_RUNTIME_URL',
        'GITHUB_TOKEN'
    )
    foreach ($name in $credentialVariables) {
        $OriginalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }

    foreach ($name in @('KCAT_AARON_DEBUG', 'ACL_STARTUP_DEBUG', '__COMPAT_LAYER')) {
        $OriginalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    if ($KcatDebug) { $env:KCAT_AARON_DEBUG = '1' }
    if ($AclStartupDebug) { $env:ACL_STARTUP_DEBUG = '1' }
    if ($CompatibilityLayer) { $env:__COMPAT_LAYER = $CompatibilityLayer }

    @($aaronExe, $screenSaver, $portableExe, $portableScreenSaver) |
        Select-Object -Unique |
        ForEach-Object { Add-NetworkBlock $_ }

    $screen = $null
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $bounds = [Windows.Forms.Screen]::PrimaryScreen.Bounds
        $screen = [ordered]@{ width = $bounds.Width; height = $bounds.Height }
    } catch {
        $screen = [ordered]@{ error = $_.Exception.Message }
    }

    $standardOutput = Join-Path $LogRoot 'process-stdout.txt'
    New-Item -ItemType Directory -Force -Path 'C:\temp' | Out-Null
    if ($DisableAaronDep) {
        Set-ProcessMitigation -Name $aaronExe -Disable DEP
        $DepOverrideApplied = $true
        Get-ProcessMitigation -Name $aaronExe | Out-String |
            Set-Content -Encoding UTF8 (Join-Path $LogRoot 'mitigations.txt')
    }
    if ($NativeTrace) {
        Add-Type -Path (Join-Path $PSScriptRoot 'NativeTrace.cs')
        [AaronNativeTrace]::Run($aaronExe, '-- screen-saver', $workingDirectory,
            (Join-Path $LogRoot 'native-trace.txt'), 30)
        Write-RegistrySnapshot (Join-Path $LogRoot 'registry-after.txt')
        return
    }
    $standardError = Join-Path $LogRoot 'process-stderr.txt'
    $startArguments = @{
        WorkingDirectory = $workingDirectory
        PassThru = $true
        RedirectStandardOutput = $standardOutput
        RedirectStandardError = $standardError
    }
    switch ($Mode) {
        'application' {
            $process = Start-Process -FilePath $aaronExe @startArguments
        }
        'screensaver' {
            $process = Start-Process -FilePath $screenSaver -ArgumentList '/s' @startArguments
        }
        'direct-screensaver' {
            $process = Start-Process -FilePath $aaronExe -ArgumentList @('--', 'screen-saver') @startArguments
        }
    }

    $startedAt = [DateTimeOffset]::UtcNow
    $deadline = [DateTime]::UtcNow.AddSeconds($RunSeconds)
    $searchDirectories = @('C:\temp', $workingDirectory, $ApplicationRoot)
    $completeFiles = @()

    while ([DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Seconds 2
        $completeFiles = @(Get-AaFiles $searchDirectories |
            Where-Object { Test-AaComplete $_.FullName })
        if ($completeFiles.Count -ge $TargetPaintings) { break }

        if ($process.HasExited) {
            Start-Sleep -Seconds 2
            $completeFiles = @(Get-AaFiles $searchDirectories |
                Where-Object { Test-AaComplete $_.FullName })
            break
        }
    }

    Write-ProcessSnapshot (Join-Path $LogRoot 'processes-before-stop.json')
    Get-Process -Name 'AARON', 'AARON_ScreenSaver' -ErrorAction SilentlyContinue |
        Select-Object Id, MainWindowTitle, Responding, CPU |
        ConvertTo-Json | Set-Content (Join-Path $LogRoot 'windows.json')
    try {
        Add-Type -AssemblyName System.Drawing
        $bounds = [Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = [Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size)
            $bitmap.Save((Join-Path $LogRoot 'desktop.png'), [Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    } catch { Write-Warning "Desktop capture failed: $_" }
    Get-WinEvent -FilterHashtable @{
        LogName = 'Application'
        StartTime = $startedAt.UtcDateTime.AddSeconds(-5)
    } -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProviderName -match 'Application Error|Windows Error Reporting' -and
            $_.Message -match 'AARON'
        } |
        Select-Object TimeCreated, ProviderName, Id, LevelDisplayName, Message |
        ConvertTo-Json -Depth 4 |
        Set-Content -Encoding UTF8 -Path (Join-Path $LogRoot 'windows-errors.json')
    Get-Process -Name 'AARON', 'AARON_ScreenSaver' -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2

    $captured = @()
    foreach ($file in @(Get-AaFiles $searchDirectories)) {
        $destination = Join-Path $CaptureRoot $file.Name.ToLowerInvariant()
        if (Test-Path $destination) {
            $destination = Join-Path $CaptureRoot "$($file.Directory.Name)-$($file.Name.ToLowerInvariant())"
        }
        Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
        $captured += [ordered]@{
            name = [IO.Path]::GetFileName($destination)
            source = $file.FullName
            bytes = (Get-Item $destination).Length
            sha256 = (Get-FileHash $destination -Algorithm SHA256).Hash.ToLowerInvariant()
            complete = Test-AaComplete $destination
        }
    }

    Write-RegistrySnapshot (Join-Path $LogRoot 'registry-after.txt')
    $finishedAt = [DateTimeOffset]::UtcNow
    $exitCode = if ($process.HasExited) { $process.ExitCode } else { $null }
    $exitCodeHex = if ($null -ne $exitCode) {
        $unsignedExitCode = [BitConverter]::ToUInt32([BitConverter]::GetBytes([int]$exitCode), 0)
        '0x{0:X8}' -f $unsignedExitCode
    } else {
        $null
    }
    $summary = [ordered]@{
        mode = $Mode
        kcatDebug = [bool]$KcatDebug
        aclStartupDebug = [bool]$AclStartupDebug
        compatibilityLayer = $CompatibilityLayer
        depException = [bool]$DisableAaronDep
        patchRegistryRunning = [bool]$PatchRegistryRunning
        registryPatch = $RegistryPatchResult
        requestedRunSeconds = $RunSeconds
        targetPaintings = $TargetPaintings
        startedAt = $startedAt.ToString('o')
        finishedAt = $finishedAt.ToString('o')
        elapsedSeconds = [Math]::Round(($finishedAt - $startedAt).TotalSeconds, 3)
        screen = $screen
        msiInstallExitCode = $installExitCode
        process = [ordered]@{
            id = $process.Id
            exitCode = $exitCode
            exitCodeHex = $exitCodeHex
            executable = if ($Mode -eq 'screensaver') { $screenSaver } else { $aaronExe }
            workingDirectory = $workingDirectory
        }
        captured = $captured
    }
    $summary | ConvertTo-Json -Depth 8 |
        Set-Content -Encoding UTF8 -Path (Join-Path $OutputRoot 'summary.json')

    if (@($captured | Where-Object { $_.complete }).Count -eq 0) {
        throw 'The original engine did not produce a complete AA painting during the probe.'
    }
} catch {
    $_ | Out-String | Set-Content -Encoding UTF8 -Path (Join-Path $LogRoot 'error.txt')
    throw
} finally {
    Get-Process -Name 'AARON', 'AARON_ScreenSaver' -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue

    foreach ($ruleName in $FirewallRules) {
        Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    }
    if ($DepOverrideApplied) {
        Set-ProcessMitigation -Name $aaronExe -Remove -Disable DEP
    }
    foreach ($name in $OriginalEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $OriginalEnvironment[$name], 'Process')
    }
    if ($TranscriptStarted) { Stop-Transcript | Out-Null }
}
