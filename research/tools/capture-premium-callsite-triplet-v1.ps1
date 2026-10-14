# Source-bound before/observer/after capture for SELECT-SUBJECT's PREMIUM
# indirect CALL. This script never changes the system clock and never overlaps
# original AARON processes. It derives current addresses from a live CLOS/PICK
# metadata probe and complete live-object matches against the run's AARON.pll.
[CmdletBinding()]
param(
    [string]$ExtractedRoot = 'research\extracted\aaron',
    [string]$BaseRoot = 'C:\AaronOracleRuns',
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,24}$')]
    [string]$RunPrefix = 'premium-callsite-triplet-v1',
    [ValidateRange(120, 600)] [int]$RunSeconds = 360,
    [ValidateRange(45, 300)] [int]$PauseSeconds = 150,
    [ValidateRange(10, 180)] [int]$CaptureSeconds = 180,
    [ValidateRange(10, 120)] [int]$ReadyTimeoutSeconds = 60,
    [ValidateRange(10, 180)] [int]$EndTimeoutSeconds = 90,
    [switch]$AllowMeasuredWriterStreamAt30MiB,
    [switch]$AllowMeasuredWriterStreamAt26MiB,
    [switch]$UseDestinationBreakpoint,
    [switch]$FollowPickEntryCorrelation,
    [switch]$PreflightOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PauseSeconds -ge $RunSeconds) { throw 'PauseSeconds must be shorter than RunSeconds' }
if ($UseDestinationBreakpoint -and $FollowPickEntryCorrelation) {
    throw 'Select only one destination-breakpoint mode'
}
$UseDr0DestinationBreakpoint = [bool]$UseDestinationBreakpoint -or [bool]$FollowPickEntryCorrelation
if ($AllowMeasuredWriterStreamAt30MiB -and $AllowMeasuredWriterStreamAt26MiB) {
    throw 'Select at most one measured staging allowance'
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$prepareScript = Join-Path $repoRoot 'research\tools\prepare-local-aaron-oracle-run.ps1'
$runnerScript = Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1'
$probePath = Join-Path $repoRoot 'research\introspection\premium-callsite-metadata-v1.cl'
$debuggerPath = if ($FollowPickEntryCorrelation) {
    Join-Path $repoRoot 'research\oracle\AaronPremiumCallsitePickCorrelationV1.cs'
} elseif ($UseDestinationBreakpoint) {
    Join-Path $repoRoot 'research\oracle\AaronPremiumCallsiteDestinationBreakpointV1.cs'
} else { Join-Path $repoRoot 'research\oracle\AaronPremiumCallsiteStepV1.cs' }
$mapperPath = Join-Path $repoRoot 'research\tools\map-native-code-to-pll.mjs'
$reaCensusPath = Join-Path $repoRoot 'research\introspection\evidence\select-subject-call-census-20261014-v1.json'
$extractedPath = if ([IO.Path]::IsPathRooted($ExtractedRoot)) {
    (Resolve-Path -LiteralPath $ExtractedRoot).Path
} else { (Resolve-Path -LiteralPath (Join-Path $repoRoot $ExtractedRoot)).Path }
$manifestPath = Join-Path $extractedPath 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$runtimeManifest = @{}
foreach ($name in @('AARON.exe', 'AARON.pll')) {
    $matches = @($manifest.files | Where-Object { $_.installedName -ceq $name })
    if ($matches.Count -ne 1) { throw "Extracted manifest must identify exactly one $name" }
    $runtimeManifest[$name] = $matches[0]
    $source = Join-Path (Join-Path $extractedPath 'application') $name
    if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or
        (Get-Item -LiteralPath $source).Length -ne $matches[0].bytes -or
        (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $matches[0].sha256) {
        throw "Extracted runtime differs from its manifest: $source"
    }
}
foreach ($path in @($prepareScript, $runnerScript, $probePath, $debuggerPath, $mapperPath, $reaCensusPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required input is missing: $path" }
}
if ([IntPtr]::Size -ne 8) { throw 'Run this coordinator in 64-bit PowerShell for WOW64 debugging' }
if (Get-Process -Name AARON -ErrorAction SilentlyContinue) {
    throw 'An AARON process is active; refusing to overlap original-runtime runs'
}

$captureSchema = if ($FollowPickEntryCorrelation) { 'aaron-premium-callsite-pick-correlation-v1' } elseif ($UseDestinationBreakpoint) { 'aaron-premium-callsite-destination-breakpoint-v1' } else { 'aaron-premium-callsite-step-v1' }
$capturePrefix = if ($FollowPickEntryCorrelation) { 'premium-callsite-pick-correlation-v1' } elseif ($UseDestinationBreakpoint) { 'premium-callsite-destination-breakpoint-v1' } else { 'premium-callsite-step-v1' }
$captureBeginMarker = "BEGIN $capturePrefix"
$probeName = 'aaron-premium-callsite-metadata-v1.txt'
$stepOutputName = if ($FollowPickEntryCorrelation) { 'aaron-premium-callsite-pick-correlation-v1.txt' } elseif ($UseDestinationBreakpoint) { 'aaron-premium-callsite-destination-breakpoint-v1.txt' } else { 'aaron-premium-callsite-step-v1.txt' }
$probeOutputNamesJson = ConvertTo-Json -InputObject @($probeName, $stepOutputName) -Compress
$requiredEndMarker = "END $capturePrefix"
$readyMarker = 'READY premium-callsite-metadata-v1'
$metadataEndMarker = 'END premium-callsite-metadata-v1'
$releasePath = 'C:\temp\aaron-native-code-release.txt'
$metadataPath = Join-Path 'C:\temp' $probeName
$stepOutputPath = Join-Path 'C:\temp' $stepOutputName
if (-not (Test-Path -LiteralPath 'C:\temp' -PathType Container)) {
    throw 'C:\temp is missing; inspect the documented target and permissions'
}
foreach ($path in @($metadataPath, $stepOutputPath, $releasePath)) {
    if (Test-Path -LiteralPath $path) { throw "Reserved staging path already exists; preserve it: $path" }
}
if ($PauseSeconds -lt 90) {
    throw 'The live metadata mapping plus debug setup needs the documented bounded pause of at least 90 seconds'
}

$baseFullPath = [IO.Path]::GetFullPath($BaseRoot)
$mode = 'writer-stream-seed-1234'
$runnerSha256 = (Get-FileHash -LiteralPath $runnerScript -Algorithm SHA256).Hash.ToLowerInvariant()
$coordinatorSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$probeSha256 = (Get-FileHash -LiteralPath $probePath -Algorithm SHA256).Hash.ToLowerInvariant()
$debuggerSha256 = (Get-FileHash -LiteralPath $debuggerPath -Algorithm SHA256).Hash.ToLowerInvariant()
$mapperSha256 = (Get-FileHash -LiteralPath $mapperPath -Algorithm SHA256).Hash.ToLowerInvariant()
$reaCensusSha256 = (Get-FileHash -LiteralPath $reaCensusPath -Algorithm SHA256).Hash.ToLowerInvariant()
$manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$logStamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$nonce = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$tripletId = "$RunPrefix-$logStamp-$nonce"
$logRoot = Join-Path $repoRoot "research\extracted\local-oracle\premium-callsite-triplet-v1-logs\$tripletId"
$externalRuns = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'
$powerShellExe = if ([IntPtr]::Size -eq 4 -and [Environment]::Is64BitOperatingSystem) {
    Join-Path $env:SystemRoot 'Sysnative\WindowsPowerShell\v1.0\powershell.exe'
} else { Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' }
if (-not (Test-Path -LiteralPath $powerShellExe -PathType Leaf)) {
    throw '64-bit Windows PowerShell 5.1 is unavailable for the source-bound runner'
}

function ConvertTo-NativeArgument([string]$Value) {
    $builder = [Text.StringBuilder]::new(); $slashes = 0
    [void]$builder.Append('"')
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') { $slashes++; continue }
        if ($character -eq '"') {
            if ($slashes -gt 0) { [void]$builder.Append(('\' * (2 * $slashes))) }
            [void]$builder.Append('\"'); $slashes = 0; continue
        }
        if ($slashes -gt 0) { [void]$builder.Append(('\' * $slashes)); $slashes = 0 }
        [void]$builder.Append($character)
    }
    if ($slashes -gt 0) { [void]$builder.Append(('\' * (2 * $slashes))) }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Assert-NoAaronProcess {
    $active = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
    if ($active.Count -gt 0) { throw "An AARON process is active (PID $(($active.Id) -join ', '))" }
}

function Get-PathAliases([string]$RuntimePath) {
    $aliases = [Collections.Generic.List[string]]::new()
    $full = [IO.Path]::GetFullPath($RuntimePath)
    $aliases.Add($full)
    if (Test-Path -LiteralPath $externalRuns) {
        $link = Get-Item -LiteralPath $externalRuns -Force
        if ($link.LinkType -in @('Junction', 'SymbolicLink') -and $link.Target) {
            $prefix = [IO.Path]::GetFullPath($externalRuns).TrimEnd('\') + '\'
            if ($full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                $relative = $full.Substring($prefix.Length)
                foreach ($targetValue in @($link.Target)) {
                    $target = [string]$targetValue
                    if (-not [IO.Path]::IsPathRooted($target)) {
                        $target = Join-Path (Split-Path -Parent $externalRuns) $target
                    }
                    $aliases.Add([IO.Path]::GetFullPath((Join-Path $target $relative)))
                }
            }
        }
    }
    return @($aliases | Select-Object -Unique)
}

function New-RunRoot([string]$RunId) {
    Assert-NoAaronProcess
    $prepareArgs = @{ RunId = $RunId; Mode = $mode; BaseRoot = $baseFullPath }
    if ($AllowMeasuredWriterStreamAt30MiB) { $prepareArgs.AllowMeasuredWriterStreamAt30MiB = $true }
    if ($AllowMeasuredWriterStreamAt26MiB) { $prepareArgs.AllowMeasuredWriterStreamAt26MiB = $true }
    $made = @(& $prepareScript @prepareArgs)
    if ($made.Count -ne 1) { throw "Run-root preparation did not return one fresh path for $RunId" }
    $output = [IO.Path]::GetFullPath(([string]$made[0]).Trim())
    if (Test-Path -LiteralPath $output) { throw "Prepared output root already exists: $output" }
    return $output
}

function Start-Runner([string]$Role, [string]$RunId, [string]$OutputRoot, [bool]$Observer) {
    $values = [Collections.Generic.List[string]]::new()
    foreach ($value in @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $runnerScript, '-ExtractedRoot', $extractedPath, '-OutputRoot', $OutputRoot,
        '-RunId', $RunId, '-Mode', $mode, '-RunSeconds', [string]$RunSeconds)) {
        $values.Add([string]$value)
    }
    if ($Observer) {
        foreach ($value in @('-PreSceneProbePath', $probePath,
            '-PreSceneProbePauseSeconds', [string]$PauseSeconds,
            '-ProbeOutputNamesJson', [string]$probeOutputNamesJson,
            '-RequiredProbeOutputName', $stepOutputName,
            '-RequiredProbeEndMarker', $requiredEndMarker)) { $values.Add([string]$value) }
    }
    $line = ($values | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
    $stdout = Join-Path $logRoot "$Role.runner.stdout.txt"
    $stderr = Join-Path $logRoot "$Role.runner.stderr.txt"
    $process = Start-Process -FilePath $powerShellExe -ArgumentList $line -WorkingDirectory $repoRoot `
        -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $process.Handle
    return [pscustomobject]@{ Process = $process; Stdout = $stdout; Stderr = $stderr }
}

function Wait-Runner($Runner, [string]$Role) {
    if (-not $Runner.Process.WaitForExit(($RunSeconds + 900) * 1000)) {
        throw "$Role runner exceeded its bounded wait; preserve its output root"
    }
    $Runner.Process.Refresh()
    $code = $Runner.Process.ExitCode
    if ($null -eq $code) { throw "$Role runner exit code is unavailable; inspect $($Runner.Stderr)" }
    if ($code -ne 0) { throw "$Role runner exited $code; inspect $($Runner.Stderr)" }
    Assert-NoAaronProcess
}

function Wait-Ready([string]$OutputRoot, [string]$RunId, $Runner) {
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    $deadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Runner.Process.Refresh()
        if ($Runner.Process.HasExited) { throw "Observer runner exited before READY; inspect $($Runner.Stderr)" }
        if ((Test-Path -LiteralPath $requestPath -PathType Leaf) -and
            (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
            try { $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json }
            catch { Start-Sleep -Milliseconds 100; continue }
            if ($request.schemaVersion -ne 1 -or $request.runId -cne $RunId -or
                $request.runnerSha256 -cne $runnerSha256 -or $request.probeSha256 -cne $probeSha256 -or
                $request.releaseFile -cne $releasePath -or $request.pauseSeconds -ne $PauseSeconds -or
                $request.requiredProbeOutputName -cne $stepOutputName -or
                $request.requiredProbeEndMarker -cne $requiredEndMarker -or
                @($request.probeOutputNames).Count -ne 2 -or
                $request.probeOutputNames[0] -cne $probeName -or
                $request.probeOutputNames[1] -cne $stepOutputName -or
                $request.runtimeExecutable -cne (Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe')) {
                throw 'Observer request does not bind this exact metadata probe, required capture, runtime, runner, and pause'
            }
            if (Select-String -LiteralPath $metadataPath -SimpleMatch $readyMarker -Quiet -ErrorAction SilentlyContinue) {
                $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
                $runtimeAliases = Get-PathAliases $request.runtimeExecutable
                $owned = @($all | Where-Object { $_.Path -in $runtimeAliases })
                if ($all.Count -ne 1 -or $owned.Count -ne 1) {
                    throw 'READY does not belong to the sole AARON process in this fresh output root'
                }
                return [pscustomobject]@{ request = $request; process = $owned[0] }
            }
        }
        Start-Sleep -Milliseconds 200
    }
    throw "Observer did not reach READY within $ReadyTimeoutSeconds seconds"
}

function Get-Sha256Bytes([byte[]]$Bytes) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

function Convert-Hex32([string]$Value, [string]$Label) {
    if ($Value -cnotmatch '^0x[0-9a-fA-F]{1,8}$') { throw "$Label is not a bounded 32-bit address" }
    return [uint64][Convert]::ToUInt32($Value.Substring(2), 16)
}

function Test-PickCorrelationArmReadback($PickObservation, $Destination, [uint32]$PickEntry, [uint32]$Continuation) {
    $readback = $PickObservation.armedContextReadback
    if (-not $readback -or
        [string]$readback.eip -ine [string]$Destination.targetEip -or
        [string]$readback.esp -ine [string]$Destination.targetEsp -or
        [string]$readback.dr0 -ine ('0x{0:x8}' -f $PickEntry) -or
        [string]$readback.dr1 -ine ('0x{0:x8}' -f $Continuation) -or
        [string]$readback.eflags -notmatch '^0x[0-9a-fA-F]{1,8}$' -or
        [string]$readback.dr6 -notmatch '^0x[0-9a-fA-F]{1,8}$' -or
        [string]$readback.dr7 -notmatch '^0x[0-9a-fA-F]{1,8}$') { return $false }
    try {
        $eflags = [Convert]::ToUInt32(([string]$readback.eflags).Substring(2), 16)
        $dr6 = [Convert]::ToUInt32(([string]$readback.dr6).Substring(2), 16)
        $dr7 = [Convert]::ToUInt32(([string]$readback.dr7).Substring(2), 16)
    } catch { return $false }
    return (($eflags -band 0x00000100) -eq 0 -and $dr6 -eq 0 -and
        ($dr7 -band 0x00ff00ff) -eq 0x00000005)
}

function Read-FunctionWindows([uint32]$ProcessId, [string]$MetadataText, [string]$OutputRoot, [object]$MethodIndices) {
    if (-not ('AaronPremiumMetadataReaderV1' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class AaronPremiumMetadataReaderV1 {
    [StructLayout(LayoutKind.Sequential)] public struct Region {
        public IntPtr BaseAddress, AllocationBase;
        public uint AllocationProtect;
        public UIntPtr RegionSize;
        public uint State, Protect, Type;
    }
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool ReadProcessMemory(IntPtr process, IntPtr address, [Out] byte[] bytes, UIntPtr size, out UIntPtr read);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, out Region region, UIntPtr size);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    public static Region Query(uint pid, ulong address) {
        IntPtr process = OpenProcess(0x410, false, pid);
        if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
            Region region;
            if (VirtualQueryEx(process, new IntPtr((long)address), out region,
                (UIntPtr)Marshal.SizeOf(typeof(Region))).ToUInt64() == 0)
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return region;
        } finally { CloseHandle(process); }
    }
    public static byte[] Read(uint pid, ulong address, int count) {
        Region region = Query(pid, address);
        ulong start = unchecked((ulong)region.BaseAddress.ToInt64());
        ulong end = start + region.RegionSize.ToUInt64();
        if (region.State != 0x1000 || (region.Protect & 0x101) != 0 ||
            count <= 0 || address + (ulong)count > end)
            throw new InvalidOperationException("Requested bytes are outside one readable committed memory region");
        IntPtr process = OpenProcess(0x410, false, pid);
        if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
            byte[] bytes = new byte[count]; UIntPtr read;
            if (!ReadProcessMemory(process, new IntPtr((long)address), bytes,
                (UIntPtr)count, out read) || read.ToUInt64() != (ulong)count)
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return bytes;
        } finally { CloseHandle(process); }
    }
}
'@
    }
    $headers = @{}
    foreach ($match in [regex]::Matches($MetadataText,
        '(?m)^HEADER name="(SELECT-SUBJECT-METHOD-[0-9]+|PICK)" bytes=([0-9a-fA-F]{128})\r?$')) {
        $name = $match.Groups[1].Value
        if ($headers.ContainsKey($name)) { throw "Duplicate current function header: $name" }
        $headers[$name] = $match.Groups[2].Value.ToLowerInvariant()
    }
    if ($headers.Count -ne 3 -or -not $headers.ContainsKey('PICK')) {
        throw 'Current CLOS metadata must supply exactly two method headers plus PICK'
    }
    $nativeRoot = Join-Path $OutputRoot 'native-code'
    if (Test-Path -LiteralPath $nativeRoot) { throw 'Observer native-code output already exists; preserve it' }
    [IO.Directory]::CreateDirectory($nativeRoot) | Out-Null
    [IO.File]::WriteAllBytes((Join-Path $nativeRoot 'ready-metadata.bin'),
        [Text.UTF8Encoding]::new($false).GetBytes($MetadataText))
    $records = @()
    $currentNames = @("SELECT-SUBJECT-METHOD-$($MethodIndices.freeIndex)",
        "SELECT-SUBJECT-METHOD-$($MethodIndices.premiumIndex)", 'PICK')
    foreach ($name in $currentNames) {
        if (-not $headers.ContainsKey($name)) { throw "Current metadata lacks $name" }
        $hex = $headers[$name]
        $header = [byte[]]@(0..63 | ForEach-Object { [Convert]::ToByte($hex.Substring($_ * 2, 2), 16) })
        $entry = [uint64][BitConverter]::ToUInt32($header, 18)
        $taggedVector = [uint64][BitConverter]::ToUInt32($header, 30)
        if ($entry -lt 64 -or ($taggedVector -band 7) -ne 2) {
            throw "Current $name function header has an invalid entry/vector candidate"
        }
        $vectorBase = $taggedVector - 2
        $vectorFirstWord = [AaronPremiumMetadataReaderV1]::Read($ProcessId, $vectorBase, 4)
        $region = [AaronPremiumMetadataReaderV1]::Query($ProcessId, $entry)
        $regionBase = [uint64]$region.BaseAddress.ToInt64()
        $regionEnd = $regionBase + $region.RegionSize.ToUInt64()
        $windowBase = [Math]::Max($regionBase, $entry - 64)
        $span = [int][Math]::Min(16384, $regionEnd - $windowBase)
        $bytes = [AaronPremiumMetadataReaderV1]::Read($ProcessId, $windowBase, $span)
        $file = $name.ToLowerInvariant() + '.native-window.bin'
        $filePath = Join-Path $nativeRoot $file
        [IO.File]::WriteAllBytes($filePath, $bytes)
        $records += [ordered]@{
            name = $name; functionObjectHeaderHex = $hex
            entryCandidate = ('0x{0:x}' -f $entry)
            taggedVectorCandidate = ('0x{0:x}' -f $taggedVector)
            vectorBaseCandidate = ('0x{0:x}' -f $vectorBase)
            vectorCandidateFirstWord = ('0x{0:x}' -f [BitConverter]::ToUInt32($vectorFirstWord, 0))
            windowBase = ('0x{0:x}' -f $windowBase)
            bytes = $bytes.Length; regionBase = ('0x{0:x}' -f $regionBase)
            regionSize = $region.RegionSize.ToUInt64(); regionProtect = ('0x{0:x}' -f $region.Protect)
            file = $file; sha256 = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
    $manifestPathCurrent = Join-Path $nativeRoot 'capture-manifest.json'
    $manifestValue = [ordered]@{
        schemaVersion = 1
        method = 'Live function headers read from the runner-owned READY report; bounded ReadProcessMemory snapshots, no memory writes'
        runtimeExecutable = (Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe')
        processId = $ProcessId
        metadataSha256 = (Get-FileHash -LiteralPath (Join-Path $nativeRoot 'ready-metadata.bin') -Algorithm SHA256).Hash.ToLowerInvariant()
        functions = $records
    }
    [IO.File]::WriteAllText($manifestPathCurrent, ($manifestValue | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{ root = $nativeRoot; manifest = $manifestPathCurrent; functions = $records }
}

function Assert-MetadataReady([string]$MetadataText) {
    $normalized = $MetadataText.Replace("`r`n", "`n")
    if ($normalized.Contains("`r") -or -not $normalized.EndsWith("`n") -or
        -not $normalized.StartsWith("BEGIN premium-callsite-metadata-v1`n") -or
        -not $normalized.Contains("INSTALL target=SELECT-SUBJECT+PICK mode=READ-ONLY-METADATA`n") -or
        -not $normalized.Contains("METHOD-COUNT total=2 emitted=2 limit=64 status=:COMPLETE truncated=NIL`n") -or
        -not $normalized.Contains("ENUMERATION-STATUS :COMPLETE`n") -or
        -not $normalized.Contains("ERROR-COUNT 0`n") -or
        -not $normalized.Contains("TRUNCATION-COUNT 0`n") -or
        -not $normalized.Contains("READY premium-callsite-metadata-v1`n")) {
        throw 'READY metadata does not contain a complete two-method CLOS census with zero errors/truncation'
    }
    $premium = @([regex]::Matches($normalized,
        '(?m)^SPECIALIZERS index=([0-9]+) values=\(\(:EQL \(:SYMBOL "COMMON-GRAPHICS-USER" "PREMIUM"\)\)\)$'))
    $free = @([regex]::Matches($normalized,
        '(?m)^SPECIALIZERS index=([0-9]+) values=\(\(:EQL \(:SYMBOL "COMMON-GRAPHICS-USER" "FREE"\)\)\)$'))
    if ($premium.Count -ne 1 -or $free.Count -ne 1 -or $premium[0].Groups[1].Value -eq $free[0].Groups[1].Value) {
        throw 'Live CLOS census does not uniquely identify the FREE and PREMIUM method indices'
    }
    foreach ($index in @($premium[0].Groups[1].Value, $free[0].Groups[1].Value)) {
        $name = "SELECT-SUBJECT-METHOD-$index"
        if (-not $normalized.Contains("METHOD index=$index type=STANDARD-METHOD`n") -or
            -not $normalized.Contains("FUNCTION name=`"$name`" type=COMPILED-FUNCTION`n") -or
            @([regex]::Matches($normalized, "(?m)^HEADER name=`"$name`" bytes=[0-9a-f]{128}$")).Count -ne 1) {
            throw "Live CLOS method $index has no unique STANDARD-METHOD compiled-function header"
        }
    }
    if (@([regex]::Matches($normalized, '(?m)^HEADER name="(SELECT-SUBJECT-METHOD-[0-9]+|PICK)" bytes=[0-9a-f]{128}$')).Count -ne 3 -or
        -not $normalized.Contains(('FUNCTION name="PICK" type=COMPILED-FUNCTION' + "`n"))) {
        throw 'READY metadata does not contain exactly two method payload headers and one PICK header'
    }
    return [pscustomobject]@{ premiumIndex = [int]$premium[0].Groups[1].Value; freeIndex = [int]$free[0].Groups[1].Value }
}

function Invoke-PremiumCapture([string]$OutputRoot, [string]$RunId, $Ready, [string]$MetadataText, [byte[]]$MetadataBytes) {
    $methodIndices = Assert-MetadataReady $MetadataText
    if ((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $coordinatorSha256 -or
        (Get-FileHash -LiteralPath $debuggerPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $debuggerSha256 -or
        (Get-FileHash -LiteralPath $mapperPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $mapperSha256 -or
        (Get-FileHash -LiteralPath $reaCensusPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $reaCensusSha256) {
        throw 'A source-bound debugger, REA census, or mapper input changed during this run'
    }
    $runtimePll = Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.pll'
    if ((Get-FileHash -LiteralPath $runtimePll -Algorithm SHA256).Hash.ToLowerInvariant() -cne $runtimeManifest['AARON.pll'].sha256) {
        throw 'Observer runtime AARON.pll differs from its extracted manifest'
    }
    $live = Read-FunctionWindows ([uint32]$Ready.process.Id) $MetadataText $OutputRoot $methodIndices
    $mappedRoot = Join-Path $live.root 'mapped'
    $mapStdout = Join-Path $logRoot 'observer.map.stdout.txt'
    $mapStderr = Join-Path $logRoot 'observer.map.stderr.txt'
    & node $mapperPath $live.manifest $runtimePll $mappedRoot 1> $mapStdout 2> $mapStderr
    $mapExit = $LASTEXITCODE
    if ($mapExit -ne 0) { throw "Live payload-to-PLL mapping failed (exit $mapExit); inspect $mapStderr" }
    $mapPath = Join-Path $mappedRoot 'native-code-map.json'
    $map = Get-Content -LiteralPath $mapPath -Raw | ConvertFrom-Json
    if ($map.schemaVersion -ne 1 -or $map.pll.sha256 -cne $runtimeManifest['AARON.pll'].sha256 -or
        @($map.functions).Count -ne 3) { throw 'Current native payload map is not bound to this run PLL and three live functions' }
    $premiumName = "SELECT-SUBJECT-METHOD-$($methodIndices.premiumIndex)"
    $premium = @($map.functions | Where-Object { $_.name -ceq $premiumName })
    $pick = @($map.functions | Where-Object { $_.name -ceq 'PICK' })
    if ($premium.Count -ne 1 -or $pick.Count -ne 1) { throw 'Live map lacks unique PREMIUM or PICK function payloads' }
    if ($premium[0].payloadBytes -ne 362 -or $premium[0].objectBytes -ne 366 -or
        -not $premium[0].uniqueCompleteObjectByteMatch) {
        throw 'Current PREMIUM method is not the unique complete 362-byte payload / 366-byte PLL object'
    }
    if (-not $pick[0].uniqueCompleteObjectByteMatch -or $pick[0].payloadBytes -lt 1) {
        throw 'Current PICK function does not have one unique complete PLL object match'
    }
    $premiumPayloadPath = Join-Path $mappedRoot $premium[0].payloadFile
    $pickPayloadPath = Join-Path $mappedRoot $pick[0].payloadFile
    $premiumPayload = [IO.File]::ReadAllBytes($premiumPayloadPath)
    $pickPayload = [IO.File]::ReadAllBytes($pickPayloadPath)
    if ($premiumPayload.Length -ne 362 -or
        (Get-Sha256Bytes $premiumPayload) -cne $premium[0].payloadSha256 -or
        (Get-Sha256Bytes $pickPayload) -cne $pick[0].payloadSha256) {
        throw 'Mapped PREMIUM or PICK payload file does not match its derived report hash'
    }
    # The REA/Ghidra static census binds this instruction boundary to the
    # exact PREMIUM payload hash. Current live bytes must then match that full
    # payload and the exact CALL encoding before computing a runtime address.
    $reaCensus = Get-Content -LiteralPath $reaCensusPath -Raw | ConvertFrom-Json
    if ($reaCensus.schemaVersion -ne 1 -or $reaCensus.status -cne 'validated-static-callsite-census-targets-unresolved' -or
        -not $reaCensus.summary.allInputsStaticOnlyAndNotExecuted) {
        throw 'REA static callsite census is missing or not explicitly static-only'
    }
    $reaMethods = @($reaCensus.methods | Where-Object {
        $_.method -ceq 'SELECT-SUBJECT-METHOD-1' -and $_.specializer.symbol -ceq 'PREMIUM'
    })
    if ($reaMethods.Count -ne 1 -or
        $reaMethods[0].sourceBinding.originalPll.sha256 -cne $runtimeManifest['AARON.pll'].sha256 -or
        $reaMethods[0].sourceBinding.originalPayload.bytes -ne 362 -or
        $reaMethods[0].sourceBinding.originalPayload.sha256 -cne $premium[0].payloadSha256) {
        throw 'REA method binding does not match this live PREMIUM payload and run PLL'
    }
    $reaCallsites = @($reaMethods[0].calls | Where-Object {
        $_.instruction -match ': CALL dword ptr \[EDI \+ 0x27\]$'
    })
    if ($reaCallsites.Count -ne 1 -or $reaCallsites[0].mechanism -cne 'computed' -or
        $reaCallsites[0].status -cne 'unresolved' -or @($reaCallsites[0].targets).Count -ne 0) {
        throw 'REA census does not identify one exact computed CALL [EDI+0x27] site in the PREMIUM payload'
    }
    $reaMethodEntry = Convert-Hex32 ([string]$reaMethods[0].entry) 'REA PREMIUM payload entry'
    $reaCallAddress = Convert-Hex32 ([string]$reaCallsites[0].address) 'REA PREMIUM callsite'
    if ($reaCallAddress -le $reaMethodEntry) { throw 'REA callsite precedes its method entry' }
    $callOffset = [int]($reaCallAddress - $reaMethodEntry)
    if ($callOffset -ne 200 -or $callOffset + 3 -gt $premiumPayload.Length -or
        ([BitConverter]::ToString($premiumPayload, $callOffset, 3)).Replace('-', '').ToLowerInvariant() -cne 'ff5727') {
        throw 'Current complete PREMIUM payload bytes at the REA instruction boundary do not equal FF 57 27'
    }
    $premiumEntry = Convert-Hex32 ([string]$premium[0].runtime.entry) 'Current PREMIUM entry'
    $pickEntry = Convert-Hex32 ([string]$pick[0].runtime.entry) 'Current PICK entry'
    $callAddress64 = $premiumEntry + [uint64]$callOffset
    if ($callAddress64 -gt [uint32]::MaxValue -or $callAddress64 + 3 -gt $premiumEntry + $premiumPayload.Length) {
        throw 'Derived current call site exceeds its complete PREMIUM payload or 32-bit address space'
    }
    $callAddress = [uint32]$callAddress64
    $debuggerTypeName = if ($FollowPickEntryCorrelation) { 'AaronPremiumCallsitePickCorrelationV1' } elseif ($UseDestinationBreakpoint) { 'AaronPremiumCallsiteDestinationBreakpointV1' } else { 'AaronPremiumCallsiteStepV1' }
    if (-not ($debuggerTypeName -as [type])) { Add-Type -Path $debuggerPath }
    try {
        if ($FollowPickEntryCorrelation) {
            $captureResult = [AaronPremiumCallsitePickCorrelationV1]::Capture(
                [uint32]$Ready.process.Id, $callAddress, $pickEntry, $releasePath, $CaptureSeconds)
        } elseif ($UseDestinationBreakpoint) {
            $captureResult = [AaronPremiumCallsiteDestinationBreakpointV1]::Capture(
                [uint32]$Ready.process.Id, $callAddress, $pickEntry, $releasePath, $CaptureSeconds)
        } else {
            $captureResult = [AaronPremiumCallsiteStepV1]::Capture(
                [uint32]$Ready.process.Id, $callAddress, [uint32]0, $releasePath, $CaptureSeconds)
        }
    } catch {
        $exceptionPath = Join-Path $live.root 'debugger-capture-exception.txt'
        [IO.File]::WriteAllText($exceptionPath, $_.Exception.ToString(), [Text.UTF8Encoding]::new($false))
        throw "Debugger helper threw before returning a capture result; inspect $exceptionPath"
    }

    # Keep the debugger's full return object as the runner's required output.
    # The explicit final END line is the runner's completion handshake.
    $directEip = $null
    $stackValue = $null
    $directToPick = $false
    $stackMatchesContinuation = $false
    $sameThread = $false
    $destinationRecord = if ($UseDr0DestinationBreakpoint) { $captureResult.destinationBreakpoint } else { $captureResult.singleStep }
    $destinationWindow = $destinationRecord.destinationWindow
    $destinationRegisters = if ($UseDr0DestinationBreakpoint) { $destinationRecord.targetRegisters } else { $destinationRecord.postStepRegisters }
    $directEipText = if ($UseDr0DestinationBreakpoint) { [string]$destinationRecord.targetEip } else { [string]$destinationRecord.postStepEip }
    if ($null -ne $destinationRecord) {
        if ($directEipText -match '^0x[0-9a-fA-F]{1,8}$') {
            $directEip = [uint64][Convert]::ToUInt32($directEipText.Substring(2), 16)
            $directToPick = ($directEip -eq $pickEntry)
        }
        if ($null -ne $destinationRecord.returnAddressAtEsp) {
            $stackValue = [string]$destinationRecord.returnAddressAtEsp.value
            $stackMatchesContinuation = ($stackValue -ieq ('0x{0:x8}' -f ($callAddress + 3)))
        }
        $callThread = [string]$captureResult.call.threadId
        $destinationThread = [string]$destinationRegisters.threadId
        $sameThread = ($callThread -and $callThread -ceq $destinationThread)
    }
    $preCallEip = [string]$captureResult.call.preCallRegisters.eip
    $slotValue = [string]$captureResult.call.preCallDispatchSlot.value
    $debuggerAcceptanceFailed = $false
    if ($UseDr0DestinationBreakpoint) {
        $debuggerAcceptanceFailed = $captureResult.schema -cne $captureSchema -or
            $captureResult.callSiteAddress -cne ('0x{0:x8}' -f $callAddress) -or
            -not $captureResult.callSiteValidation.matched -or
            $captureResult.callSiteValidation.bytesAtHitMatched -ne $true -or
            -not $captureResult.call.hit -or
            $preCallEip -ine ('0x{0:x8}' -f $callAddress) -or
            $captureResult.call.preCallDispatchSlot.offset -notin @('0x00000027', '0x27') -or
            $captureResult.call.preCallDispatchSlot.value -ine $directEipText -or
            -not $destinationRecord.attempted -or
            -not $destinationRecord.hit -or
            -not $destinationRecord.completed -or
            $destinationRecord.status -cne 'destination-execute-breakpoint-hit-before-instruction' -or
            $destinationRecord.addressMatchesPreCallSlot -ne $true -or
            $destinationRecord.firstChance -ne $true -or
            $destinationRecord.dr6B0Set -ne $true -or
            [string]$destinationRegisters.eip -ine $directEipText -or
            [string]$destinationRegisters.esp -ine [string]$destinationRecord.targetEsp -or
            $destinationRecord.espDecrementedByFour -ne $true -or
            $destinationRecord.returnAddressMatchesCallContinuation -ne $true -or
            -not $destinationRecord.debugRegistersRestored -or
            -not $captureResult.callDebugRegistersRestoredBeforeDestination -or
            -not $captureResult.debugRegistersRestored -or
            -not $captureResult.debugRegistersAndTrapFlagRestored -or
            -not $captureResult.detached -or
            -not $captureResult.readyPauseReleased -or
            @($captureResult.cleanupErrors).Count -ne 0 -or
            -not $destinationWindow -or
            [string]$destinationWindow.eip -ine $directEipText -or
            $destinationWindow.bytesRead -ne 32 -or
            $destinationWindow.requestedBytes -ne 32 -or
            -not $sameThread -or
            -not $stackMatchesContinuation -or
            ($directToPick -and -not $stackMatchesContinuation)
    } else {
        $stepEip = [string]$destinationRecord.postStepEip
        $debuggerAcceptanceFailed = $captureResult.schema -cne 'aaron-premium-callsite-step-v1' -or
            $captureResult.callSiteAddress -cne ('0x{0:x8}' -f $callAddress) -or
            -not $captureResult.callSiteValidation.matched -or
            $captureResult.callSiteValidation.bytesAtHitMatched -ne $true -or
            -not $captureResult.call.hit -or
            $preCallEip -ine ('0x{0:x8}' -f $callAddress) -or
            $captureResult.call.preCallDispatchSlot.offset -notin @('0x00000027', '0x27') -or
            -not $destinationRecord.completed -or
            $destinationRecord.postStepEipEqualsPreCallSlotValue -ne $true -or
            $slotValue -ine $stepEip -or
            [string]$destinationRegisters.eip -ine $stepEip -or
            -not $destinationRecord.tfRestored -or
            -not $captureResult.callDebugRegistersRestoredBeforeStep -or
            -not $captureResult.debugRegistersAndTrapFlagRestored -or
            -not $captureResult.detached -or
            -not $captureResult.readyPauseReleased -or
            @($captureResult.cleanupErrors).Count -ne 0 -or
            -not $destinationWindow -or
            [string]$destinationWindow.eip -ine $stepEip -or
            $destinationWindow.bytesRead -lt 1 -or
            -not $sameThread -or
            -not $stackMatchesContinuation -or
            ($directToPick -and -not $stackMatchesContinuation)
    }
    $pickCorrelationAcceptanceFailed = $false
    $pickCorrelationFailure = $null
    if ($FollowPickEntryCorrelation) {
        $pickObservation = $captureResult.pickEntryObservation
        $continuationObservation = $captureResult.callContinuationObservation
        $expectedPickEntryBytes = ([BitConverter]::ToString($pickPayload, 0, 16)).Replace('-', '').ToLowerInvariant()
        $pickHit = $pickObservation.observed -eq $true
        $continuationHit = $continuationObservation.observed -eq $true
        if ($pickHit -and $continuationHit) {
            $pickCorrelationAcceptanceFailed = $true
            $pickCorrelationFailure = 'Both mutually exclusive PICK/continuation breakpoints were reported as hit'
        } elseif ($pickHit) {
            $pickCorrelationAcceptanceFailed =
                $pickObservation.status -cne 'PICK-entry-hit-before-original-CALL-continuation' -or
                $pickObservation.firstChance -ne $true -or $pickObservation.dr6B0Set -ne $true -or
                $pickObservation.dr6B1Clear -ne $true -or
                [string]$pickObservation.eip -ine ('0x{0:x8}' -f $pickEntry) -or
                [string]$pickObservation.threadId -cne [string]$captureResult.call.threadId -or
                $pickObservation.sameThreadAsCall -ne $true -or
                $pickObservation.sameEspAsInitialDestination -ne $true -or
                $pickObservation.sameReturnAddressAsInitialDestination -ne $true -or
                $pickObservation.sameEbpAsInitialDestination -ne $true -or
                $pickObservation.sameOriginalStackFrame -ne $true -or
                -not (Test-PickCorrelationArmReadback $pickObservation $captureResult.destinationBreakpoint $pickEntry ($callAddress + 3)) -or
                [string]$pickObservation.esp -ine [string]$captureResult.destinationBreakpoint.targetEsp -or
                [string]$pickObservation.ebp -ine [string]$captureResult.destinationBreakpoint.targetRegisters.ebp -or
                [string]$pickObservation.savedStackValue -ine [string]$captureResult.destinationBreakpoint.returnAddressAtEsp.value -or
                $pickObservation.savedStackValueMatchesCallContinuation -ne $true -or
                $continuationObservation.breakpointArmed -ne $true -or
                $pickObservation.debugRegistersRestoredAtObservation -ne $true -or
                [string]$pickObservation.entryBytesAtHit -cne $expectedPickEntryBytes -or
                $continuationObservation.status -cne 'PICK-entry-hit-before-CALL-continuation'
            if ($pickCorrelationAcceptanceFailed) {
                $pickCorrelationFailure = 'PICK breakpoint did not satisfy live-entry, owner-thread, pre-continuation, code-byte, or restoration gates'
            }
        } elseif ($continuationHit) {
            $pickCorrelationAcceptanceFailed =
                $continuationObservation.status -cne 'CALL-continuation-address-reached-before-PICK-entry' -or
                $continuationObservation.firstChance -ne $true -or
                $continuationObservation.dr6B1Set -ne $true -or
                $continuationObservation.dr6B0Clear -ne $true -or
                [string]$continuationObservation.eip -ine ('0x{0:x8}' -f ($callAddress + 3)) -or
                [string]$continuationObservation.threadId -cne [string]$captureResult.call.threadId -or
                $continuationObservation.sameThreadAsCall -ne $true -or
                $continuationObservation.debugRegistersRestoredAtObservation -ne $true -or
                $pickObservation.status -cne 'CALL-continuation-address-reached-before-PICK-entry'
            if ($pickCorrelationAcceptanceFailed) {
                $pickCorrelationFailure = 'CALL-continuation guard did not satisfy exact-address, owner-thread, first-chance, B1, or restoration gates'
            }
        } else {
            $acceptedPickNoHitStatuses = @('target-exited-before-PICK-entry',
                'selected-thread-exited-before-PICK-entry', 'PICK-correlation-window-expired-before-entry',
                'capture-window-expired-before-PICK-entry')
            $acceptedContinuationNoHitStatuses = @('target-exited-before-CALL-continuation',
                'selected-thread-exited-before-CALL-continuation', 'PICK-correlation-window-expired-before-CALL-continuation',
                'capture-window-expired-before-CALL-continuation')
            $boundedNoHit =
                ($captureResult.targetExitEventObserved -eq $true -and $captureResult.captureError -eq $null) -or
                ($captureResult.pickCorrelationWindowExpired -eq $true -and $captureResult.captureError -eq $null) -or
                ($captureResult.captureWindowExpired -eq $true -and $captureResult.captureError -eq $null) -or
                ([string]$pickObservation.status -eq 'selected-thread-exited-before-PICK-entry' -and
                 [string]$continuationObservation.status -eq 'selected-thread-exited-before-CALL-continuation')
            if (-not $boundedNoHit -or -not $pickObservation.breakpointArmed -or
                -not $continuationObservation.breakpointArmed -or
                [string]$pickObservation.status -notin $acceptedPickNoHitStatuses -or
                [string]$continuationObservation.status -notin $acceptedContinuationNoHitStatuses) {
                $pickCorrelationAcceptanceFailed = $true
                $pickCorrelationFailure = 'Neither breakpoint produced an accepted hit or a bounded terminal no-hit status'
            }
        }
        if ($captureResult.schema -cne $captureSchema -or
            $captureResult.captureError -ne $null -or
            $captureResult.pickCorrelationWindowSeconds -ne 20 -or
            -not $captureResult.debugRegistersRestored -or
            -not $captureResult.debugRegistersAndTrapFlagRestored -or
            -not $captureResult.detached -or
            -not $captureResult.readyPauseReleased -or
            @($captureResult.cleanupErrors).Count -ne 0) {
            $pickCorrelationAcceptanceFailed = $true
            if (-not $pickCorrelationFailure) { $pickCorrelationFailure = 'PICK-correlation schema, deadline, or final cleanup gate failed' }
        }
        $debuggerAcceptanceFailed = $debuggerAcceptanceFailed -or $pickCorrelationAcceptanceFailed
    }
    if ($debuggerAcceptanceFailed) {
        $diagnosticPath = Join-Path $live.root 'debugger-capture-diagnostic.json'
        $diagnostic = [ordered]@{
            schemaVersion = 1
            tripletId = $tripletId
            runId = $RunId
            processId = $Ready.process.Id
            runtimeExecutable = $Ready.request.runtimeExecutable
            callSiteAddress = ('0x{0:x8}' -f $callAddress)
            pickEntry = ('0x{0:x8}' -f $pickEntry)
            debuggerHelperSha256 = $debuggerSha256
            gateSummary = [ordered]@{
                captureError = $captureResult.captureError
                callStatus = $captureResult.call.status
                callHit = $captureResult.call.hit
                callSiteValidation = $captureResult.callSiteValidation
                destinationStatus = $destinationRecord.status
                destinationError = if ($UseDr0DestinationBreakpoint) { $destinationRecord.error } else { $destinationRecord.stepError }
                destinationCompleted = $destinationRecord.completed
                pickCorrelationFailure = $pickCorrelationFailure
                pickEntryObservation = if ($FollowPickEntryCorrelation) { $captureResult.pickEntryObservation } else { $null }
                callContinuationObservation = if ($FollowPickEntryCorrelation) { $captureResult.callContinuationObservation } else { $null }
                captureWindowSeconds = $captureResult.captureWindowSeconds
                captureWindowExpired = $captureResult.captureWindowExpired
                targetExitEventObserved = $captureResult.targetExitEventObserved
                cleanupErrors = $captureResult.cleanupErrors
                detached = $captureResult.detached
                readyPauseReleased = $captureResult.readyPauseReleased
            }
            rawDebuggerResult = $captureResult
        }
        [IO.File]::WriteAllText($diagnosticPath,
            ($diagnostic | ConvertTo-Json -Depth 24), [Text.UTF8Encoding]::new($false))
        throw "Debugger output failed the strict one-instruction acceptance gate; inspect $diagnosticPath"
    }

    $resultDocument = [ordered]@{
        schemaVersion = 1
        tripletId = $tripletId
        runId = $RunId
        oracleRunId = $RunId
        mode = $mode
        runtimeExecutable = $Ready.request.runtimeExecutable
        currentPllSha256 = $runtimeManifest['AARON.pll'].sha256
        metadata = [ordered]@{
            sourcePath = 'research/introspection/premium-callsite-metadata-v1.cl'
            sourceSha256 = $probeSha256
            readyReportSha256 = (Get-Sha256Bytes $MetadataBytes)
            premiumSpecializer = 'COMMON-GRAPHICS-USER::PREMIUM'
            premiumMethodIndex = $methodIndices.premiumIndex
            pickFunction = 'COMMON-GRAPHICS-USER::PICK'
        }
        mapping = [ordered]@{
            nativeCaptureManifest = 'native-code/capture-manifest.json'
            nativeCaptureManifestSha256 = (Get-FileHash -LiteralPath $live.manifest -Algorithm SHA256).Hash.ToLowerInvariant()
            nativeMap = 'native-code/mapped/native-code-map.json'
            nativeMapSha256 = (Get-FileHash -LiteralPath $mapPath -Algorithm SHA256).Hash.ToLowerInvariant()
            liveWindows = @($live.functions | ForEach-Object {
                [ordered]@{ name = $_.name; file = $_.file; bytes = $_.bytes; sha256 = $_.sha256; entryCandidate = $_.entryCandidate }
            })
            mapperSha256 = $mapperSha256
            reaStaticCensusPath = 'research/introspection/evidence/select-subject-call-census-20261014-v1.json'
            reaStaticCensusSha256 = $reaCensusSha256
            reaPayloadEntry = $reaMethods[0].entry
            reaCallAddress = $reaCallsites[0].address
            reaCallPayloadOffset = $callOffset
            premiumEntry = $premium[0].runtime.entry
            premiumPayloadBytes = $premium[0].payloadBytes
            premiumPayloadSha256 = $premium[0].payloadSha256
            premiumObjectBytes = $premium[0].objectBytes
            premiumObjectSha256 = $premium[0].objectSha256
            premiumUniqueCompletePllMatch = $premium[0].uniqueCompleteObjectByteMatch
            pickEntry = $pick[0].runtime.entry
            pickPayloadBytes = $pick[0].payloadBytes
            pickPayloadSha256 = $pick[0].payloadSha256
            pickEntryBytesHex = ([BitConverter]::ToString($pickPayload, 0, 16)).Replace('-', '').ToLowerInvariant()
            pickObjectBytes = $pick[0].objectBytes
            pickObjectSha256 = $pick[0].objectSha256
            pickUniqueCompletePllMatch = $pick[0].uniqueCompleteObjectByteMatch
            callPayloadOffset = $callOffset
            callSiteAddress = ('0x{0:x8}' -f $callAddress)
            callSiteBytesHex = 'ff5727'
        }
        coordinatorScriptPath = 'research/tools/capture-premium-callsite-triplet-v1.ps1'
        coordinatorScriptSha256 = $coordinatorSha256
        debuggerHelperPath = if ($FollowPickEntryCorrelation) { 'research/oracle/AaronPremiumCallsitePickCorrelationV1.cs' } elseif ($UseDestinationBreakpoint) { 'research/oracle/AaronPremiumCallsiteDestinationBreakpointV1.cs' } else { 'research/oracle/AaronPremiumCallsiteStepV1.cs' }
        debuggerHelperSha256 = $debuggerSha256
        directCpuDestination = [ordered]@{
            address = $directEipText
            equalsCurrentPickEntry = $directToPick
            bytesHex = $destinationWindow.bytesHex
            bytesRead = $destinationWindow.bytesRead
            region = $destinationWindow.region
        }
        pickEntryStackCheck = [ordered]@{
            observedAtPickEntry = $directToPick
            sameThreadAsMeasuredCall = $sameThread
            threadId = $destinationRegisters.threadId
            stackValue = $stackValue
            expected = ('0x{0:x8}' -f ($callAddress + 3))
            matches = ($directToPick -and $sameThread -and $stackMatchesContinuation)
        }
        pickEntryCorrelation = if ($FollowPickEntryCorrelation) { $captureResult.pickEntryObservation } else { $null }
        callContinuationGuard = if ($FollowPickEntryCorrelation) { $captureResult.callContinuationObservation } else { $null }
        claims = [ordered]@{
            directCpuEdgeToPick = ($directToPick -and $stackMatchesContinuation -and $sameThread)
            interpretation = if ($FollowPickEntryCorrelation) {
                'The measured initial CALL destination is recorded separately. A same-thread DR0 current-PICK-entry breakpoint and DR1 callSite+3 continuation guard record which endpoint occurs first; neither endpoint names the anonymous intermediate target or recovers its instructions.'
            } elseif ($UseDestinationBreakpoint -and $directToPick) {
                'A DR0 execute breakpoint at the pre-CALL operand stopped the same thread at the independently mapped current PICK entry before its first instruction; the post-CALL stack dword equals callSite+3.'
            } elseif ($UseDestinationBreakpoint) {
                'The DR0 destination breakpoint records the measured runtime target and post-CALL stack; no Lisp name is inferred unless the current target maps uniquely.'
            } elseif ($directToPick) {
                'The single-step destination is the independently mapped current PICK entry; the post-CALL stack dword on the same thread equals callSite+3.'
            } else {
                'The single-step destination is recorded without a direct PICK-edge claim. No later PICK breakpoint was configured.'
            }
        }
        debugger = $captureResult
    }
    $json = $resultDocument | ConvertTo-Json -Depth 16
    $wrapped = "$captureBeginMarker`n$json`n$requiredEndMarker`n"
    [IO.File]::WriteAllText($stepOutputPath, $wrapped, [Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{
        result = $resultDocument
        reportPath = $stepOutputPath
        reportSha256 = (Get-FileHash -LiteralPath $stepOutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
        nativeRoot = $live.root
        mapPath = $mapPath
    }
}

function Get-Record([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required capture is missing: $Path" }
    $item = Get-Item -LiteralPath $Path
    return [ordered]@{ path = $Path; bytes = $item.Length; sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
}

function Read-Run([string]$Role, [string]$RunId, [string]$OutputRoot, [bool]$Observer) {
    $summaryPath = Join-Path $OutputRoot 'summary.json'
    $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
    if ($summary.runId -cne $RunId -or $summary.complete -ne $true -or $summary.mode -cne $mode -or
        $summary.smallImage -ne $false -or $summary.runnerSha256 -cne $runnerSha256 -or
        $summary.installerSha256 -cne $manifest.source.sha256 -or
        -not $summary.probeCompletionSatisfied) {
        throw "$Role summary is incomplete or differs from the source-bound run"
    }
    if ($Observer) {
        if ($summary.preSceneProbeSha256 -cne $probeSha256 -or
            $summary.preSceneProbePauseSeconds -ne $PauseSeconds -or
            $summary.requiredProbeOutputName -cne $stepOutputName -or
            $summary.requiredProbeEndMarker -cne $requiredEndMarker -or
            $summary.requiredProbeOutputSha256 -notmatch '^[0-9a-f]{64}$' -or
            @($summary.probeOutputNames).Count -ne 2 -or
            $summary.probeOutputNames[0] -cne $probeName -or
            $summary.probeOutputNames[1] -cne $stepOutputName) {
            throw 'Observer summary does not bind the metadata probe and debugger result output'
        }
        $stagedProbe = Join-Path (Join-Path $OutputRoot 'capture') 'aaron-pre-scene-probe.cl'
        if ((Get-FileHash -LiteralPath $stagedProbe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $probeSha256) {
            throw 'Archived staged probe differs from the source probe'
        }
    } elseif ($summary.preSceneProbeSha256 -or @($summary.probeOutputNames).Count -ne 0 -or
        $summary.preSceneProbePauseSeconds -ne 0 -or $summary.requiredProbeOutputName -or
        $summary.requiredProbeOutputSha256 -or $summary.requiredProbeEndMarker) {
        throw "$Role is not a fresh uninstrumented control"
    }
    $runtime = [ordered]@{}
    foreach ($name in @('AARON.exe', 'AARON.pll')) {
        $record = Get-Record (Join-Path (Join-Path $OutputRoot 'runtime') $name)
        if ($record.bytes -ne $runtimeManifest[$name].bytes -or $record.sha256 -cne $runtimeManifest[$name].sha256) {
            throw "$Role runtime $name differs from its extracted manifest"
        }
        $runtime[$name] = $record
    }
    $capture = Join-Path $OutputRoot 'capture'
    $artifacts = [ordered]@{}
    foreach ($name in @('aa0', 'image', 'image-id', 'aaron-scene-state-snapshot.txt', 'aaron-random-seed-loaded.txt')) {
        $artifacts[$name] = Get-Record (Join-Path $capture $name)
    }
    if ($summary.aa0Sha256 -cne $artifacts.aa0.sha256 -or
        $summary.sceneReportSha256 -cne $artifacts['aaron-scene-state-snapshot.txt'].sha256 -or
        (Get-Content -LiteralPath (Join-Path $capture 'aa0') -Tail 1) -cne 'end' -or
        -not (Select-String -LiteralPath (Join-Path $capture 'aaron-scene-state-snapshot.txt') -SimpleMatch 'END scene-state-snapshot' -Quiet)) {
        throw "$Role drawing or scene capture is incomplete or not summary-bound"
    }
    $sourceMap = [ordered]@{
        'planning-call-trace.cl' = Join-Path $repoRoot 'research\introspection\planning-call-trace.cl'
        'planning-random-seed-common.cl' = Join-Path $repoRoot 'research\oracle\planning-random-seed-common.cl'
        'scene-state-snapshot-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-seeded-1234.cl'
        'scene-state-snapshot-writer-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-seeded-1234.cl'
        'scene-state-snapshot-writer-stream-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-stream-seeded-1234.cl'
        'scene-state-snapshot.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot.cl'
    }
    $sources = [ordered]@{}
    foreach ($name in $sourceMap.Keys) {
        $record = Get-Record (Join-Path $capture $name)
        if ($record.sha256 -cne (Get-FileHash -LiteralPath $sourceMap[$name] -Algorithm SHA256).Hash.ToLowerInvariant()) {
            throw "$Role staged source differs from current file: $name"
        }
        $sources[$name] = $record
    }
    $trace = Get-Record (Join-Path $capture 'aaron-planning-call-trace.txt')
    $probeRecord = $null
    $stepRecord = $null
    if ($Observer) {
        $metadataArchived = Join-Path $capture $probeName
        $stepArchived = Join-Path $capture $stepOutputName
        $probeRecord = Get-Record $metadataArchived
        $stepRecord = Get-Record $stepArchived
        if ($summary.requiredProbeOutputSha256 -cne $stepRecord.sha256 -or
            (Get-Content -LiteralPath $stepArchived -Tail 1) -cne $requiredEndMarker) {
            throw 'Archived required debugger output differs from runner summary or lacks terminal END'
        }
        $stepText = [Text.UTF8Encoding]::new($false, $true).GetString([IO.File]::ReadAllBytes($stepArchived))
        $stepNormalized = $stepText.Replace("`r`n", "`n")
        $stepLines = @($stepNormalized.TrimEnd([char]10).Split([char]10))
        if ($stepNormalized.Contains("`r") -or $stepLines.Count -lt 4 -or
            $stepLines[0] -cne $captureBeginMarker -or
            $stepLines[-1] -cne $requiredEndMarker -or
            @($stepLines | Where-Object { $_ -ceq $requiredEndMarker }).Count -ne 1) {
            throw 'Archived debugger result does not have one complete BEGIN/END envelope'
        }
        $stepDocument = ($stepLines[1..($stepLines.Count - 2)] -join "`n") | ConvertFrom-Json
        if ($stepDocument.schemaVersion -ne 1 -or $stepDocument.tripletId -cne $tripletId -or
            $stepDocument.runId -cne $RunId -or
            $stepDocument.mapping.premiumPayloadBytes -ne 362 -or
            -not $stepDocument.mapping.premiumUniqueCompletePllMatch -or
            -not $stepDocument.mapping.pickUniqueCompletePllMatch -or
            $stepDocument.debugger.schema -cne $captureSchema -or
            $stepDocument.debugger.call.hit -ne $true -or
            $stepDocument.debugger.callSiteValidation.matched -ne $true -or
            $stepDocument.debugger.captureError -ne $null -or
            $stepDocument.debugger.detached -ne $true -or
            $stepDocument.debugger.readyPauseReleased -ne $true -or
            @($stepDocument.debugger.cleanupErrors).Count -ne 0) {
            throw 'Archived debugger output is not a source-bound completed result'
        }
        if ($UseDr0DestinationBreakpoint) {
            $destination = $stepDocument.debugger.destinationBreakpoint
            if ($destination.attempted -ne $true -or $destination.hit -ne $true -or
                $destination.completed -ne $true -or
                $destination.status -cne 'destination-execute-breakpoint-hit-before-instruction' -or
                $destination.addressMatchesPreCallSlot -ne $true -or
                $destination.firstChance -ne $true -or $destination.dr6B0Set -ne $true -or
                $destination.espDecrementedByFour -ne $true -or
                $destination.returnAddressMatchesCallContinuation -ne $true -or
                $destination.debugRegistersRestored -ne $true -or
                $stepDocument.debugger.debugRegistersRestored -ne $true -or
                $destination.destinationWindow.bytesRead -ne 32 -or
                $destination.destinationWindow.requestedBytes -ne 32 -or
                $stepDocument.directCpuDestination.address -ine $stepDocument.debugger.call.preCallDispatchSlot.value -or
                $destination.targetEip -ine $stepDocument.debugger.call.preCallDispatchSlot.value -or
                $destination.targetRegisters.eip -ine $destination.targetEip -or
                [string]$destination.targetRegisters.threadId -cne [string]$stepDocument.debugger.call.threadId -or
                $stepDocument.pickEntryStackCheck.sameThreadAsMeasuredCall -ne $true -or
                $stepDocument.pickEntryStackCheck.stackValue -ine $stepDocument.pickEntryStackCheck.expected) {
                throw 'Archived DR0 destination evidence did not satisfy the independent target/stack/restoration gate'
            }
            if ($FollowPickEntryCorrelation) {
                $pickObservation = $stepDocument.debugger.pickEntryObservation
                $continuationObservation = $stepDocument.debugger.callContinuationObservation
                $archivedCallSiteAddress = [uint32](Convert-Hex32 ([string]$stepDocument.mapping.callSiteAddress) 'Archived call-site address')
                $archivedContinuationAddress = [uint32]($archivedCallSiteAddress + 3)
                $pickHit = $pickObservation.observed -eq $true
                $continuationHit = $continuationObservation.observed -eq $true
                $validPickHit = $pickHit -and
                    $pickObservation.status -ceq 'PICK-entry-hit-before-original-CALL-continuation' -and
                    $pickObservation.firstChance -eq $true -and $pickObservation.dr6B0Set -eq $true -and
                    $pickObservation.dr6B1Clear -eq $true -and
                    $pickObservation.sameThreadAsCall -eq $true -and
                    [string]$pickObservation.threadId -ceq [string]$stepDocument.debugger.call.threadId -and
                    [string]$pickObservation.eip -ieq [string]$stepDocument.mapping.pickEntry -and
                    [string]$pickObservation.esp -ieq [string]$destination.targetEsp -and
                    [string]$pickObservation.ebp -ieq [string]$destination.targetRegisters.ebp -and
                    [string]$pickObservation.savedStackValue -ieq [string]$destination.returnAddressAtEsp.value -and
                    $pickObservation.savedStackValueMatchesCallContinuation -eq $true -and
                    $pickObservation.sameEspAsInitialDestination -eq $true -and
                    $pickObservation.sameReturnAddressAsInitialDestination -eq $true -and
                    $pickObservation.sameEbpAsInitialDestination -eq $true -and
                    $pickObservation.sameOriginalStackFrame -eq $true -and
                    $continuationObservation.breakpointArmed -eq $true -and
                    [string]$pickObservation.entryBytesAtHit -ceq [string]$stepDocument.mapping.pickEntryBytesHex -and
                    (Test-PickCorrelationArmReadback $pickObservation $destination ([uint32](Convert-Hex32 ([string]$stepDocument.mapping.pickEntry) 'Archived PICK entry')) $archivedContinuationAddress) -and
                    $pickObservation.debugRegistersRestoredAtObservation -eq $true -and
                    $continuationObservation.status -ceq 'PICK-entry-hit-before-CALL-continuation'
                $validContinuationHit = $continuationHit -and
                    $continuationObservation.status -ceq 'CALL-continuation-address-reached-before-PICK-entry' -and
                    $continuationObservation.firstChance -eq $true -and
                    $continuationObservation.dr6B1Set -eq $true -and
                    $continuationObservation.dr6B0Clear -eq $true -and
                    $continuationObservation.sameThreadAsCall -eq $true -and
                    [string]$continuationObservation.threadId -ceq [string]$stepDocument.debugger.call.threadId -and
                    [string]$continuationObservation.eip -ieq ('0x{0:x8}' -f $archivedContinuationAddress) -and
                    $continuationObservation.debugRegistersRestoredAtObservation -eq $true -and
                    $pickObservation.status -ceq 'CALL-continuation-address-reached-before-PICK-entry'
                $acceptedPickNoHitStatuses = @('target-exited-before-PICK-entry',
                    'selected-thread-exited-before-PICK-entry', 'PICK-correlation-window-expired-before-entry',
                    'capture-window-expired-before-PICK-entry')
                $acceptedContinuationNoHitStatuses = @('target-exited-before-CALL-continuation',
                    'selected-thread-exited-before-CALL-continuation', 'PICK-correlation-window-expired-before-CALL-continuation',
                    'capture-window-expired-before-CALL-continuation')
                $validBoundedNoHit = -not $pickHit -and -not $continuationHit -and
                    $stepDocument.debugger.pickEntryObservation.breakpointArmed -eq $true -and
                    $stepDocument.debugger.callContinuationObservation.breakpointArmed -eq $true -and
                    ($stepDocument.debugger.pickCorrelationWindowExpired -eq $true -or
                     $stepDocument.debugger.captureWindowExpired -eq $true -or
                     $stepDocument.debugger.targetExitEventObserved -eq $true -or
                     ([string]$pickObservation.status -eq 'selected-thread-exited-before-PICK-entry' -and
                      [string]$continuationObservation.status -eq 'selected-thread-exited-before-CALL-continuation')) -and
                    $stepDocument.debugger.captureError -eq $null -and
                    ([string]$pickObservation.status -in $acceptedPickNoHitStatuses) -and
                    ([string]$continuationObservation.status -in $acceptedContinuationNoHitStatuses)
                if (($pickHit -and -not $validPickHit) -or
                    ($continuationHit -and -not $validContinuationHit) -or
                    (-not $pickHit -and -not $continuationHit -and -not $validBoundedNoHit) -or
                    ($pickHit -and $continuationHit) -or
                    $stepDocument.debugger.pickCorrelationWindowSeconds -ne 20 -or
                    $stepDocument.debugger.debugRegistersRestored -ne $true -or
                    $stepDocument.debugger.detached -ne $true -or
                    $stepDocument.debugger.readyPauseReleased -ne $true) {
                    throw 'Archived PICK/continuation correlation did not satisfy the exclusive hit or bounded no-hit gate'
                }
            }
        } elseif (
            $stepDocument.debugger.singleStep.postStepEipEqualsPreCallSlotValue -ne $true -or
            $stepDocument.debugger.singleStep.completed -ne $true -or
            $stepDocument.debugger.debugRegistersAndTrapFlagRestored -ne $true -or
            $stepDocument.debugger.singleStep.destinationWindow.bytesRead -lt 1) {
            throw 'Archived debugger output is not a source-bound completed one-step result'
        }
        if ($stepDocument.directCpuDestination.equalsCurrentPickEntry -and
            ($stepDocument.pickEntryStackCheck.sameThreadAsMeasuredCall -ne $true -or
             $stepDocument.pickEntryStackCheck.matches -ne $true)) {
            throw 'Direct PICK destination lacks a same-thread callSite+3 saved-stack match'
        }
        $metadataText = [Text.UTF8Encoding]::new($false, $true).GetString([IO.File]::ReadAllBytes($metadataArchived))
        $metadataNorm = $metadataText.Replace("`r`n", "`n")
        if ($metadataNorm.Contains("`r") -or -not $metadataNorm.EndsWith("END premium-callsite-metadata-v1`n") -or
            -not $metadataNorm.Contains("CAPTURE-WAIT released=T`n")) {
            throw 'Archived metadata observer did not finish its READY/release/END handshake'
        }
    }
    return [pscustomobject]@{
        role = $Role; runId = $RunId; root = $OutputRoot; summary = $summary; runtime = $runtime
        # Get-Content strings carry PSPath/PSDrive/PSProvider note properties.
        # Convert to a plain string before this value enters comparison JSON;
        # ConvertTo-Json otherwise recursively serializes provider metadata.
        aa0Header = (Get-Content -LiteralPath (Join-Path $capture 'aa0') -TotalCount 1).ToString()
        artifacts = $artifacts; sources = $sources; planningTrace = $trace
        probe = $probeRecord; debuggerResult = $stepRecord
    }
}

function Release-OwnedObserver([string]$OutputRoot) {
    if (Test-Path -LiteralPath $releasePath) { return }
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    if (-not (Test-Path -LiteralPath $requestPath)) { return }
    try {
        $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
        $expected = [IO.Path]::GetFullPath((Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe'))
        $aliases = Get-PathAliases $expected
        $owned = @(Get-Process -Name AARON -ErrorAction SilentlyContinue | Where-Object { $_.Path -in $aliases })
        if ($owned.Count -eq 1 -and $request.runtimeExecutable -eq $expected -and
            $request.releaseFile -eq $releasePath) {
            [IO.File]::WriteAllText($releasePath, 'Owned observer coordinator cleanup release', [Text.UTF8Encoding]::new($false))
        }
    } catch { Write-Warning "Could not release only the runner-owned observer pause: $($_.Exception.Message)" }
}

New-Item -ItemType Directory -Path $logRoot | Out-Null
$preflightId = "$tripletId-preflight"
$preflightOutput = Join-Path $baseFullPath "$preflightId-uncreated"
$probeNamesPreflightId = "$tripletId-names"
$probeNamesPreflightOutput = Join-Path $baseFullPath "$probeNamesPreflightId-uncreated"
$preflightLines = @(& $powerShellExe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass `
    -File $runnerScript -ExtractedRoot $extractedPath -OutputRoot $preflightOutput `
    -RunId $preflightId -PowerShellPreflightOnly 2>&1)
$preflightExit = $LASTEXITCODE
if ($preflightExit -ne 0) { throw "Windows PowerShell child preflight failed (exit $preflightExit): $($preflightLines -join ' ')" }
$preflight = ($preflightLines -join "`n") | ConvertFrom-Json
if ($preflight.status -cne 'ok' -or $preflight.preflightOnly -ne $true -or
    $preflight.runId -cne $preflightId -or $preflight.runnerSha256 -cne $runnerSha256 -or
    $preflight.powershellVersion -notmatch '^5\.' -or $preflight.is64BitProcess -ne $true -or
    $preflight.getFileHashCommand -cne 'Get-FileHash') {
    throw 'Windows PowerShell runner preflight did not validate the exact 64-bit runner environment'
}
[IO.File]::WriteAllText((Join-Path $logRoot 'windows-powershell-preflight.json'),
    ($preflight | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))

$probeNamesPreflightId = "$tripletId-names"
$probeNamesPreflightOutput = Join-Path $baseFullPath "$probeNamesPreflightId-uncreated"
$probeNamesPreflightJson = ConvertTo-Json -InputObject @($probeName, $stepOutputName) -Compress
$probeNamesPreflightStdout = Join-Path $logRoot 'probe-output-names-preflight.stdout.txt'
$probeNamesPreflightStderr = Join-Path $logRoot 'probe-output-names-preflight.stderr.txt'
if ((Test-Path -LiteralPath $probeNamesPreflightStdout) -or
    (Test-Path -LiteralPath $probeNamesPreflightStderr)) {
    throw 'Probe-output preflight log path already exists; preserve it'
}
$probeNamesPreflightArguments = @(
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $runnerScript, '-ExtractedRoot', $extractedPath,
    '-OutputRoot', $probeNamesPreflightOutput, '-RunId', $probeNamesPreflightId,
    '-ProbeOutputNamesJson', $probeNamesPreflightJson, '-PowerShellPreflightOnly'
)
$probeNamesPreflightLine = ($probeNamesPreflightArguments |
    ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
$probeNamesPreflightProcess = Start-Process -FilePath $powerShellExe -ArgumentList $probeNamesPreflightLine -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $probeNamesPreflightStdout -RedirectStandardError $probeNamesPreflightStderr
$null = $probeNamesPreflightProcess.Handle
if (-not $probeNamesPreflightProcess.WaitForExit(30000)) {
    throw 'PowerShell probe-output argument preflight timed out; preserve its logs'
}
$probeNamesPreflightProcess.Refresh()
if ($null -eq $probeNamesPreflightProcess.ExitCode) {
    throw 'PowerShell probe-output argument preflight exit status is unavailable'
}
if ($probeNamesPreflightProcess.ExitCode -ne 0) {
    $details = Get-Content -LiteralPath $probeNamesPreflightStderr -Raw -ErrorAction SilentlyContinue
    throw "PowerShell probe-output argument preflight failed (exit $($probeNamesPreflightProcess.ExitCode)): $details"
}
$probeNamesPreflight = Get-Content -LiteralPath $probeNamesPreflightStdout -Raw | ConvertFrom-Json
if ($probeNamesPreflight.status -cne 'ok' -or $probeNamesPreflight.preflightOnly -ne $true -or
    $probeNamesPreflight.runId -cne $probeNamesPreflightId -or
    @($probeNamesPreflight.probeOutputNames).Count -ne 2 -or
    $probeNamesPreflight.probeOutputNames[0] -cne $probeName -or
    $probeNamesPreflight.probeOutputNames[1] -cne $stepOutputName) {
    throw 'PowerShell runner did not parse the two probe output filenames exactly'
}
[IO.File]::WriteAllText((Join-Path $logRoot 'probe-output-names-preflight.json'),
    ($probeNamesPreflight | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))

if ($PreflightOnly) {
    Write-Output $logRoot
    return
}

$runs = [Collections.Generic.List[object]]::new()
$runner = $null
$observerRoot = $null
$captureSummary = $null
try {
    foreach ($role in @('before', 'observer', 'after')) {
        Assert-NoAaronProcess
        $runId = "$tripletId-$role"
        $outputRoot = New-RunRoot $runId
        if ($role -eq 'observer') { $observerRoot = $outputRoot }
        $runner = Start-Runner $role $runId $outputRoot ($role -eq 'observer')
        try {
            if ($role -eq 'observer') {
                $ready = Wait-Ready $outputRoot $runId $runner
                $metadataBytes = [IO.File]::ReadAllBytes($metadataPath)
                $metadataText = [Text.UTF8Encoding]::new($false, $true).GetString($metadataBytes)
                $metadataShaAtReady = Get-Sha256Bytes $metadataBytes
                $captureSummary = Invoke-PremiumCapture $outputRoot $runId $ready $metadataText $metadataBytes
                $metadataDeadline = [DateTime]::UtcNow.AddSeconds($EndTimeoutSeconds)
                while ([DateTime]::UtcNow -lt $metadataDeadline) {
                    if (Test-Path -LiteralPath $metadataPath -PathType Leaf) {
                        $last = Get-Content -LiteralPath $metadataPath -Tail 1 -ErrorAction SilentlyContinue
                        if ($last -ceq $metadataEndMarker) { break }
                    }
                    $runner.Process.Refresh()
                    if ($runner.Process.HasExited) { break }
                    Start-Sleep -Milliseconds 150
                }
                if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf) -or
                    (Get-Content -LiteralPath $metadataPath -Tail 1 -ErrorAction SilentlyContinue) -cne $metadataEndMarker) {
                    throw 'Metadata probe did not write its released terminal END marker'
                }
                $captureSummary | Add-Member -NotePropertyName readyMetadataSha256 -NotePropertyValue $metadataShaAtReady
            }
            Wait-Runner $runner $role
        } catch {
            if ($role -eq 'observer') { Release-OwnedObserver $outputRoot }
            try { Wait-Runner $runner "$role cleanup" } catch { Write-Warning "Runner logs preserved: $($_.Exception.Message)" }
            throw
        }
        $runs.Add((Read-Run $role $runId $outputRoot ($role -eq 'observer')))
        $runner = $null
        Assert-NoAaronProcess
    }

    $before = $runs[0]; $observer = $runs[1]; $after = $runs[2]
    foreach ($name in $before.artifacts.Keys) {
        foreach ($other in @($observer, $after)) {
            if ($before.artifacts[$name].sha256 -cne $other.artifacts[$name].sha256 -or
                $before.artifacts[$name].bytes -ne $other.artifacts[$name].bytes) {
                throw "Fresh drawing/scene control mismatch: $name"
            }
        }
    }
    if ($before.aa0Header -cne $observer.aa0Header -or $before.aa0Header -cne $after.aa0Header) {
        throw 'Fresh AA0 headers differ across the source-bound triplet'
    }
    foreach ($name in $before.sources.Keys) {
        foreach ($other in @($observer, $after)) {
            if ($before.sources[$name].sha256 -cne $other.sources[$name].sha256) {
                throw "Staged scene source differs across triplet: $name"
            }
        }
    }
    if ($before.planningTrace.sha256 -cne $after.planningTrace.sha256 -or
        $before.planningTrace.bytes -ne $after.planningTrace.bytes) {
        throw 'Fresh uninstrumented before/after planning traces differ'
    }
    foreach ($other in @($observer, $after)) {
        if ($other.summary.registryPatchSha256 -cne $before.summary.registryPatchSha256 -or
            $other.summary.licensePatchSha256 -cne $before.summary.licensePatchSha256 -or
            $other.summary.installerSha256 -cne $before.summary.installerSha256 -or
            $other.summary.runnerSha256 -cne $before.summary.runnerSha256) {
            throw 'Runner, installer, or runtime patch identity differs across the triplet'
        }
    }
    $relative = { param([string]$path)
        $full = [IO.Path]::GetFullPath($path)
        $prefix = [IO.Path]::GetFullPath($repoRoot).TrimEnd('\') + '\'
        if ($full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $full.Substring($prefix.Length).Replace('\', '/') }
        return $full
    }
    $comparison = [ordered]@{
        schemaVersion = 1; tripletId = $tripletId; mode = $mode; aa0Header = $before.aa0Header
        observerMethod = if ($FollowPickEntryCorrelation) {
            'CLOS PREMIUM and PICK addresses rediscovered from this READY pause; both complete compiled objects matched the current run PLL before a same-thread DR0 destination capture followed by DR0 PICK-entry and DR1 call-continuation guards'
        } elseif ($UseDestinationBreakpoint) {
            'CLOS PREMIUM and PICK addresses rediscovered from this READY pause; both complete compiled objects matched the current run PLL before a DR0 destination breakpoint was armed from the current PREMIUM CALL operand'
        } else {
            'CLOS PREMIUM and PICK addresses rediscovered from this READY pause; both complete compiled objects matched the current run PLL before single-stepping the current PREMIUM CALL'
        }
        sources = [ordered]@{
            coordinator = [ordered]@{ path = 'research/tools/capture-premium-callsite-triplet-v1.ps1'; sha256 = $coordinatorSha256 }
            probe = [ordered]@{ path = 'research/introspection/premium-callsite-metadata-v1.cl'; sha256 = $probeSha256 }
            runner = [ordered]@{ path = 'research/oracle/run-local-scene-state-required-probe.ps1'; sha256 = $runnerSha256 }
            debuggerHelper = [ordered]@{ path = (& $relative $debuggerPath); sha256 = $debuggerSha256 }
            mapper = [ordered]@{ path = 'research/tools/map-native-code-to-pll.mjs'; sha256 = $mapperSha256 }
            reaStaticCensus = [ordered]@{ path = 'research/introspection/evidence/select-subject-call-census-20261014-v1.json'; sha256 = $reaCensusSha256 }
            extractedManifest = [ordered]@{ path = 'research/extracted/aaron/manifest.json'; sha256 = $manifestSha256 }
        }
        controlsMatch = $true
        beforeAfterPlanningTraceMatch = $true
        debuggerResult = [ordered]@{
            path = & $relative (Join-Path (Join-Path $observer.root 'capture') $stepOutputName)
            sha256 = $captureSummary.reportSha256
            readyMetadataSha256 = $captureSummary.readyMetadataSha256
            directCpuEdgeToPick = $captureSummary.result.claims.directCpuEdgeToPick
            callSiteAddress = $captureSummary.result.mapping.callSiteAddress
            directDestination = $captureSummary.result.directCpuDestination
            pickEntryStackCheck = $captureSummary.result.pickEntryStackCheck
            pickEntryCorrelation = $captureSummary.result.pickEntryCorrelation
            callContinuationGuard = $captureSummary.result.callContinuationGuard
            nativeMap = & $relative $captureSummary.mapPath
        }
        runs = @($runs | ForEach-Object {
            [ordered]@{
                role = $_.role; runId = $_.runId; root = & $relative $_.root
                complete = $_.summary.complete; mode = $_.summary.mode; smallImage = $_.summary.smallImage
                runnerSha256 = $_.summary.runnerSha256; installerSha256 = $_.summary.installerSha256
                summarySha256 = (Get-FileHash -LiteralPath (Join-Path $_.root 'summary.json') -Algorithm SHA256).Hash.ToLowerInvariant()
                runtime = $_.runtime; aa0Header = $_.aa0Header; artifacts = $_.artifacts; sources = $_.sources
                planningTrace = $_.planningTrace; metadata = $_.probe; debuggerResult = $_.debuggerResult
            }
        })
        diagnostics = & $relative $logRoot
    }
    $comparisonPath = Join-Path $logRoot 'triplet-comparison.json'
    [IO.File]::WriteAllText($comparisonPath, ($comparison | ConvertTo-Json -Depth 18), [Text.UTF8Encoding]::new($false))
    Write-Output $comparisonPath
} finally {
    if ($null -ne $runner) {
        if ($null -ne $observerRoot) { Release-OwnedObserver $observerRoot }
        try { Wait-Runner $runner 'final cleanup' } catch { Write-Warning "Runner/output preserved: $($_.Exception.Message)" }
    }
}
