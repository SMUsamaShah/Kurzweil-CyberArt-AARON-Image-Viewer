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
    [ValidateRange(-1, 255)]
    [int]$LicenseVersion = -1,
    [switch]$PatchPremiumFlag,
    [string]$PremiumFlagSource = 'premium-flag.cl',
    [switch]$CaptureApplicationMenu,
    [switch]$TriggerPaintOne,
    [string]$KcatSmallImage = '',
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
$LicensePatchResult = $null
$PremiumFlagPatchResult = $null
$PremiumFlagMarkerPath = 'C:\temp\aaron-premium-flag-loaded.txt'
$PremiumFlagIntrospectionPath = 'C:\temp\aaron-premium-introspection.txt'

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

    if ($LicenseVersion -ge 0) {
        $licensePath = Join-Path $workingDirectory 'license.dll'
        $licenseEntry = $manifest.files |
            Where-Object { $_.installedName -eq 'license.dll' } |
            Select-Object -First 1
        if ($null -eq $licenseEntry) {
            throw 'The extraction manifest has no license.dll hash'
        }
        $licensePatchScript = Join-Path $PSScriptRoot '..\tools\patch-license-version.ps1'
        $licenseJson = & $licensePatchScript -Path $licensePath -ExpectedSha256 $licenseEntry.sha256 `
            -ReturnValue $LicenseVersion
        $LicensePatchResult = $licenseJson | ConvertFrom-Json
        $LicensePatchResult |
            ConvertTo-Json -Depth 8 |
            Set-Content -Encoding UTF8 -Path (Join-Path $LogRoot 'license-patch.json')
    }

    $PremiumFlagPath = $null
    if ($PatchPremiumFlag) {
        $premiumFlagSource = Join-Path $PSScriptRoot $PremiumFlagSource
        if (-not (Test-Path $premiumFlagSource -PathType Leaf)) {
            throw "Premium probe source not found: $premiumFlagSource"
        }
        $PremiumFlagPath = 'C:\temp\aaron-premium-flag.cl'
        Copy-Item -LiteralPath $premiumFlagSource -Destination $PremiumFlagPath -Force
        Copy-Item -LiteralPath $premiumFlagSource -Destination (Join-Path $workingDirectory '.clinit.cl') -Force
        Copy-Item -LiteralPath $premiumFlagSource -Destination (Join-Path $workingDirectory 'clinit.cl') -Force
        $PremiumFlagPatchResult = [ordered]@{
            source = $premiumFlagSource
            loadedPath = $PremiumFlagPath
            initPaths = @(
                (Join-Path $workingDirectory '.clinit.cl'),
                (Join-Path $workingDirectory 'clinit.cl')
            )
            switch = '-L'
        }
        $PremiumFlagPatchResult |
            ConvertTo-Json -Depth 8 |
            Set-Content -Encoding UTF8 -Path (Join-Path $LogRoot 'premium-flag-patch.json')
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

    foreach ($name in @('KCAT_AARON_DEBUG', 'ACL_STARTUP_DEBUG', 'KCAT_AARON_SMALL_IMAGE', '__COMPAT_LAYER')) {
        $OriginalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    if ($KcatDebug) { $env:KCAT_AARON_DEBUG = '1' }
    if ($AclStartupDebug) { $env:ACL_STARTUP_DEBUG = '1' }
    if ($KcatSmallImage) { $env:KCAT_AARON_SMALL_IMAGE = $KcatSmallImage }
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
            $applicationArguments = if ($PatchPremiumFlag) {
                @('-L', $PremiumFlagPath, '--', 'screen-saver')
            } else {
                @('--', 'screen-saver')
            }
            $process = Start-Process -FilePath $aaronExe -ArgumentList $applicationArguments @startArguments
        }
    }

    if ($CaptureApplicationMenu -and $Mode -eq 'application') {
        Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class AaronMenuProbe {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetSubMenu(IntPtr hMenu, int nPos);
    [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr hMenu);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetMenuString(IntPtr hMenu, uint uIDItem, StringBuilder lpString,
        int nMaxCount, uint uFlag);
    [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr hMenu, int nPos);
}
"@
        Start-Sleep -Seconds 2
        [AaronMenuProbe]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
        $menu = [AaronMenuProbe]::GetMenu($process.MainWindowHandle)
        $menuLines = [Collections.Generic.List[string]]::new()
        $menuLines.Add("window=0x$('{0:X}' -f $process.MainWindowHandle.ToInt64())")
        $topCount = [AaronMenuProbe]::GetMenuItemCount($menu)
        $menuLines.Add("topCount=$topCount")
        for ($topIndex = 0; $topIndex -lt $topCount; $topIndex++) {
            $label = [Text.StringBuilder]::new(512)
            [void][AaronMenuProbe]::GetMenuString($menu, [uint32]$topIndex, $label, 512, 0x400)
            $submenu = [AaronMenuProbe]::GetSubMenu($menu, $topIndex)
            $menuLines.Add("top[$topIndex] label=<$label> submenu=0x$('{0:X}' -f $submenu.ToInt64())")
            if ($submenu -eq [IntPtr]::Zero) { continue }
            $subCount = [AaronMenuProbe]::GetMenuItemCount($submenu)
            for ($subIndex = 0; $subIndex -lt $subCount; $subIndex++) {
                $subLabel = [Text.StringBuilder]::new(512)
                [void][AaronMenuProbe]::GetMenuString($submenu, [uint32]$subIndex, $subLabel, 512, 0x400)
                $commandId = [AaronMenuProbe]::GetMenuItemID($submenu, $subIndex)
                $menuLines.Add("  item[$subIndex] id=$commandId label=<$subLabel>")
            }
        }
        $menuLines | Set-Content -Encoding UTF8 -Path (Join-Path $LogRoot 'application-menu.txt')
        [Windows.Forms.SendKeys]::SendWait('%p')
    }

    if ($TriggerPaintOne -and $Mode -eq 'application') {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AaronWindowProbe {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
        Start-Sleep -Seconds 2
        [AaronWindowProbe]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
        [Windows.Forms.SendKeys]::SendWait('^o')
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

    if ($PatchPremiumFlag -and (Test-Path $PremiumFlagMarkerPath -PathType Leaf)) {
        Copy-Item -LiteralPath $PremiumFlagMarkerPath -Destination (Join-Path $LogRoot 'premium-flag-runtime.txt') -Force
    }
    foreach ($probeMarker in @('C:\temp\aaron-premium-size-loaded.txt',
                               'C:\temp\aaron-size-loaded.txt',
                               'C:\temp\aaron-seed-loaded.txt')) {
        if (Test-Path $probeMarker -PathType Leaf) {
            Copy-Item -LiteralPath $probeMarker -Destination (Join-Path $LogRoot ([IO.Path]::GetFileName($probeMarker))) -Force
        }
    }
    if ($PatchPremiumFlag -and (Test-Path $PremiumFlagIntrospectionPath -PathType Leaf)) {
        Copy-Item -LiteralPath $PremiumFlagIntrospectionPath -Destination (Join-Path $LogRoot 'premium-introspection.txt') -Force
    }

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
        kcatSmallImage = $KcatSmallImage
        compatibilityLayer = $CompatibilityLayer
        depException = [bool]$DisableAaronDep
        patchRegistryRunning = [bool]$PatchRegistryRunning
        registryPatch = $RegistryPatchResult
        licenseVersion = $LicenseVersion
        licensePatch = $LicensePatchResult
        patchPremiumFlag = [bool]$PatchPremiumFlag
        premiumFlagPatch = $PremiumFlagPatchResult
        captureApplicationMenu = [bool]$CaptureApplicationMenu
        triggerPaintOne = [bool]$TriggerPaintOne
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

    # Application startup/menu probes intentionally do not create a painting.
    # Keep the hard failure for generator probes, while allowing UI-only jobs
    # to finish with their diagnostic artifacts.
    $requiresPainting = -not ($Mode -eq 'application' -and -not $TriggerPaintOne)
    if ($requiresPainting -and @($captured | Where-Object { $_.complete }).Count -eq 0) {
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
