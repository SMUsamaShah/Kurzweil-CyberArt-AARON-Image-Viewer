# One source-bound Frida observer leg for the SELECT-SUBJECT PREMIUM CALL -> PICK edge.
# This coordinator never attaches a Windows debugger and never changes the system clock.
[CmdletBinding()]
param(
    [string]$ExtractedRoot = 'research\extracted\aaron',
    [string]$BaseRoot = 'C:\AaronOracleRuns',
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,9}$')]
    [string]$RunPrefix = 'prem-pick',
    [ValidateRange(120, 600)] [int]$RunSeconds = 360,
    [ValidateRange(90, 300)] [int]$PauseSeconds = 150,
    [ValidateRange(30, 600)] [int]$ObserverTimeoutSeconds = 300,
    [ValidateRange(10, 120)] [int]$ReadyTimeoutSeconds = 60,
    [ValidateRange(10, 180)] [int]$EndTimeoutSeconds = 90,
    [ValidateRange(1, 512)] [int]$MaxRecords = 64,
    [ValidateRange(50, 5000)] [int]$PollIntervalMs = 250,
    [string]$PythonPath,
    [switch]$AllowMeasuredWriterStreamAt30MiB,
    [switch]$AllowMeasuredWriterStreamAt26MiB,
    [switch]$AllowAARONInjectionAfterCrash,
    [switch]$PreflightOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PauseSeconds -ge $RunSeconds) { throw 'PauseSeconds must be shorter than RunSeconds' }
if ($ObserverTimeoutSeconds -ge $RunSeconds) {
    throw 'ObserverTimeoutSeconds must be shorter than RunSeconds so the runner retains a completion margin'
}
if ($AllowMeasuredWriterStreamAt30MiB -and $AllowMeasuredWriterStreamAt26MiB) {
    throw 'Select at most one measured writer-stream staging allowance'
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$prepareScript = Join-Path $repoRoot 'research\tools\prepare-local-aaron-oracle-run.ps1'
$runnerScript = Join-Path $repoRoot 'research\oracle\run-local-scene-state-required-probe.ps1'
$probePath = Join-Path $repoRoot 'research\introspection\premium-callsite-metadata-v1.cl'
$mapperPath = Join-Path $repoRoot 'research\tools\map-native-code-to-pll.mjs'
$censusPath = Join-Path $repoRoot 'research\introspection\evidence\select-subject-call-census-20261014-v1.json'
$manifestPath = Join-Path (Join-Path $repoRoot $ExtractedRoot) 'manifest.json'
$observerPath = Join-Path $repoRoot 'research\tools\frida-aaron-premium-callsite-observer.py'
$lispDelimiterCheckPath = Join-Path $repoRoot 'research\tools\check-lisp-delimiters.mjs'
$fridaToolRoot = Join-Path $repoRoot 'research\artifacts\frida-stalker-trial'
$venvPython = Join-Path $fridaToolRoot 'venv\Scripts\python.exe'
if (-not $PythonPath) { $PythonPath = $venvPython }
$PythonPath = [IO.Path]::GetFullPath($PythonPath)
$extractedPath = if ([IO.Path]::IsPathRooted($ExtractedRoot)) {
    (Resolve-Path -LiteralPath $ExtractedRoot).Path
} else {
    (Resolve-Path -LiteralPath (Join-Path $repoRoot $ExtractedRoot)).Path
}
$manifestPath = Join-Path $extractedPath 'manifest.json'
$applicationPath = Join-Path $extractedPath 'application'
$mode = 'writer-stream-seed-1234'
$probeName = 'aaron-premium-callsite-metadata-v1.txt'
$requiredReportName = 'aaron-premium-pick-frida-observer-v1.txt'
$releasePath = 'C:\temp\aaron-native-code-release.txt'
$metadataPath = Join-Path 'C:\temp' $probeName
$runnerScenePath = 'C:\temp\aaron-scene-state-snapshot.txt'
$runnerAa0Path = 'C:\temp\aa0'
$requiredEndMarker = $null
$externalRuns = Join-Path $repoRoot 'research\extracted\local-oracle\external-runs'
$baseFullPath = [IO.Path]::GetFullPath($BaseRoot)
$powerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue

foreach ($path in @($prepareScript, $runnerScript, $probePath, $mapperPath,
    $censusPath, $manifestPath, $observerPath, $lispDelimiterCheckPath,
    $PythonPath, $powerShellExe)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required input is missing: $path" }
}
if ($null -eq $nodeCommand) { throw 'node.exe is required for the live PLL object mapper' }
if ([IntPtr]::Size -ne 8) { throw 'Run this coordinator in 64-bit PowerShell for live process memory reads' }
if (-not (Test-Path -LiteralPath 'C:\temp' -PathType Container)) {
    throw 'C:\temp is missing; read research/oracle.md and inspect the documented staging target'
}
if ($PauseSeconds -lt 90) { throw 'Live metadata mapping needs a bounded pre-scene pause of at least 90 seconds' }
if ($AllowMeasuredWriterStreamAt30MiB -and $mode -ne 'writer-stream-seed-1234') { throw '30 MiB allowance is for writer-stream-seed-1234 only' }
if ($AllowMeasuredWriterStreamAt26MiB -and $mode -ne 'writer-stream-seed-1234') { throw '26 MiB allowance is for writer-stream-seed-1234 only' }

function Get-Sha256Bytes([byte[]]$Bytes) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

function Get-Sha256Text([string]$Text) {
    return Get-Sha256Bytes ([Text.UTF8Encoding]::new($false).GetBytes($Text))
}

function Get-FileRecord([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required file is missing: $Path" }
    $item = Get-Item -LiteralPath $Path
    return [ordered]@{ path = $Path; bytes = $item.Length; sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
}

function Write-Utf8NoBom([string]$Path, [string]$Text, [bool]$Exclusive = $false) {
    $encoding = [Text.UTF8Encoding]::new($false, $true)
    $bytes = $encoding.GetBytes($Text)
    if ($Exclusive) {
        $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) }
        finally { $stream.Dispose() }
    } else {
        [IO.File]::WriteAllBytes($Path, $bytes)
    }
}

function Write-BytesNoOverwrite([string]$Path, [byte[]]$Bytes) {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($Bytes, 0, $Bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
}

function Get-CanonicalJson([System.Collections.IDictionary]$Value) {
    $keys = [string[]]@($Value.Keys)
    [Array]::Sort($keys, [StringComparer]::Ordinal)
    $sorted = [ordered]@{}
    foreach ($key in $keys) { $sorted[$key] = $Value[$key] }
    return ConvertTo-Json -InputObject $sorted -Compress -Depth 12
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
    if ($active.Count -gt 0) { throw "An AARON process is active (PID $(($active.Id) -join ', ')); refusing to overlap oracle runs" }
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
                    if (-not [IO.Path]::IsPathRooted($target)) { $target = Join-Path (Split-Path -Parent $externalRuns) $target }
                    $aliases.Add([IO.Path]::GetFullPath((Join-Path $target $relative)))
                }
            }
        }
    }
    return @($aliases | Select-Object -Unique)
}

function Assert-RuntimeManifest([string]$Path) {
    $manifest = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    $records = @{}
    foreach ($name in @('AARON.exe', 'AARON.pll')) {
        $matches = @($manifest.files | Where-Object { $_.installedName -ceq $name })
        if ($matches.Count -ne 1) { throw "Extracted manifest must identify exactly one $name" }
        $source = Join-Path $applicationPath $name
        $record = Get-FileRecord $source
        if ($record.bytes -ne $matches[0].bytes -or $record.sha256 -cne $matches[0].sha256) {
            throw "Extracted runtime differs from its manifest: $source"
        }
        $records[$name] = $matches[0]
    }
    return [pscustomobject]@{ manifest = $manifest; files = $records; sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
}

function Assert-StaticCensus([string]$CensusPath, [string]$PllSha256) {
    $census = Get-Content -LiteralPath $CensusPath -Raw | ConvertFrom-Json
    if ($census.schemaVersion -ne 1 -or $census.status -cne 'validated-static-callsite-census-targets-unresolved' -or
        $census.summary.allInputsStaticOnlyAndNotExecuted -ne $true) {
        throw 'REA census must be the validated static-only unresolved callsite census'
    }
    $methods = @($census.methods | Where-Object {
        $_.method -ceq 'SELECT-SUBJECT-METHOD-1' -and $_.specializer.symbol -ceq 'PREMIUM'
    })
    if ($methods.Count -ne 1 -or $methods[0].sourceBinding.originalPll.sha256 -cne $PllSha256 -or
        $methods[0].sourceBinding.originalPayload.bytes -ne 362 -or
        $methods[0].sourceBinding.originalPayload.sha256 -cne '80c35cab667f0b8ad615ca03339ad9ada8747a45d4ceb98ce70fa4581a6636ae') {
        throw 'REA PREMIUM method does not bind to the extracted PLL and expected complete payload'
    }
    $calls = @($methods[0].calls | Where-Object { $_.address -ceq '0x1fe4c07c' })
    if ($calls.Count -ne 1 -or $calls[0].instruction -cne '0x1fe4c07c: CALL dword ptr [EDI + 0x27]' -or
        $calls[0].mechanism -cne 'computed' -or $calls[0].status -cne 'unresolved' -or @($calls[0].targets).Count -ne 0) {
        throw 'REA census does not contain the exact unresolved PREMIUM CALL [EDI+0x27] candidate'
    }
    return [pscustomobject]@{ census = $census; method = $methods[0]; call = $calls[0] }
}

if (-not ('AaronFridaMetadataReaderV1' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class AaronFridaMetadataReaderV1 {
    [StructLayout(LayoutKind.Sequential)] public struct Region {
        public IntPtr BaseAddress, AllocationBase;
        public uint AllocationProtect;
        public UIntPtr RegionSize;
        public uint State, Protect, Type;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr process, IntPtr address, [Out] byte[] bytes, UIntPtr size, out UIntPtr read);
    [DllImport("kernel32.dll", SetLastError=true)] static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, out Region region, UIntPtr size);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    public static Region Query(uint pid, ulong address) {
        IntPtr process = OpenProcess(0x410, false, pid);
        if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
            Region region;
            if (VirtualQueryEx(process, new IntPtr((long)address), out region, (UIntPtr)Marshal.SizeOf(typeof(Region))).ToUInt64() == 0)
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return region;
        } finally { CloseHandle(process); }
    }
    public static byte[] Read(uint pid, ulong address, int count) {
        Region region = Query(pid, address);
        ulong start = unchecked((ulong)region.BaseAddress.ToInt64());
        ulong size = region.RegionSize.ToUInt64();
        if (size == 0 || region.State != 0x1000 || (region.Protect & 0x101) != 0 || count <= 0 ||
            address > UInt64.MaxValue - (ulong)count || address + (ulong)count > start + size)
            throw new InvalidOperationException("Read is outside one readable committed process region");
        IntPtr process = OpenProcess(0x410, false, pid);
        if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
            byte[] bytes = new byte[count]; UIntPtr read;
            if (!ReadProcessMemory(process, new IntPtr((long)address), bytes, (UIntPtr)count, out read) || read.ToUInt64() != (ulong)count)
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return bytes;
        } finally { CloseHandle(process); }
    }
}
'@
}

function Assert-MetadataReady([string]$MetadataText) {
    $normalized = $MetadataText.Replace("`r`n", "`n")
    if ($normalized.Contains("`r") -or -not $normalized.EndsWith("`n") -or
        -not $normalized.StartsWith("BEGIN premium-callsite-metadata-v1`n") -or
        -not $normalized.Contains("INSTALL target=SELECT-SUBJECT+PICK mode=READ-ONLY-METADATA`n") -or
        -not $normalized.Contains("METHOD-COUNT total=2 emitted=2 limit=64 status=:COMPLETE truncated=NIL`n") -or
        -not $normalized.Contains("ENUMERATION-STATUS :COMPLETE`n") -or
        -not $normalized.Contains("ERROR-COUNT 0`n") -or -not $normalized.Contains("TRUNCATION-COUNT 0`n") -or
        -not $normalized.Contains("READY premium-callsite-metadata-v1`n")) {
        throw 'READY metadata is not a complete two-method census with zero errors or truncation'
    }
    $premium = @([regex]::Matches($normalized, '(?m)^SPECIALIZERS index=([0-9]+) values=\(\(:EQL \(:SYMBOL "COMMON-GRAPHICS-USER" "PREMIUM"\)\)\)$'))
    $free = @([regex]::Matches($normalized, '(?m)^SPECIALIZERS index=([0-9]+) values=\(\(:EQL \(:SYMBOL "COMMON-GRAPHICS-USER" "FREE"\)\)\)$'))
    if ($premium.Count -ne 1 -or $free.Count -ne 1 -or $premium[0].Groups[1].Value -eq $free[0].Groups[1].Value) {
        throw 'Live CLOS census does not uniquely identify FREE and PREMIUM method indices'
    }
    foreach ($index in @($premium[0].Groups[1].Value, $free[0].Groups[1].Value)) {
        $name = "SELECT-SUBJECT-METHOD-$index"
        if (-not $normalized.Contains("METHOD index=$index type=STANDARD-METHOD`n") -or
            -not $normalized.Contains("FUNCTION name=`"$name`" type=COMPILED-FUNCTION`n") -or
            @([regex]::Matches($normalized, "(?m)^HEADER name=`"$name`" bytes=[0-9a-fA-F]{128}$")).Count -ne 1) {
            throw "Live CLOS method $index has no unique compiled-function header"
        }
    }
    if (-not $normalized.Contains("FUNCTION name=`"PICK`" type=COMPILED-FUNCTION`n") -or
        @([regex]::Matches($normalized, '(?m)^HEADER name="(SELECT-SUBJECT-METHOD-[0-9]+|PICK)" bytes=[0-9a-fA-F]{128}$')).Count -ne 3) {
        throw 'READY metadata must contain exactly two method headers and one PICK header'
    }
    return [pscustomobject]@{ premiumIndex = [int]$premium[0].Groups[1].Value; freeIndex = [int]$free[0].Groups[1].Value }
}

function Read-FunctionWindows([uint32]$ProcessId, [string]$MetadataText, [byte[]]$ReadyMetadataBytes, [string]$ReadySnapshotPath, [string]$OutputRoot, $MethodIndices) {
    $headers = @{}
    foreach ($match in [regex]::Matches($MetadataText, '(?m)^HEADER name="(SELECT-SUBJECT-METHOD-[0-9]+|PICK)" bytes=([0-9a-fA-F]{128})\r?$')) {
        $name = $match.Groups[1].Value
        if ($headers.ContainsKey($name)) { throw "Duplicate live header: $name" }
        $headers[$name] = $match.Groups[2].Value
    }
    if ($headers.Count -ne 3 -or -not $headers.ContainsKey('PICK')) { throw 'READY headers must identify two methods and PICK' }
    $nativeRoot = Join-Path $OutputRoot 'native-code'
    [IO.Directory]::CreateDirectory($nativeRoot) | Out-Null
    [IO.File]::WriteAllBytes($ReadySnapshotPath, $ReadyMetadataBytes)
    $records = @()
    foreach ($name in @("SELECT-SUBJECT-METHOD-$($MethodIndices.freeIndex)", "SELECT-SUBJECT-METHOD-$($MethodIndices.premiumIndex)", 'PICK')) {
        if (-not $headers.ContainsKey($name)) { throw "READY metadata does not contain $name" }
        $hex = $headers[$name]
        $header = [byte[]]@(0..63 | ForEach-Object { [Convert]::ToByte($hex.Substring($_ * 2, 2), 16) })
        $entry = [uint64][BitConverter]::ToUInt32($header, 18)
        $taggedVector = [uint64][BitConverter]::ToUInt32($header, 30)
        if ($entry -lt 64 -or ($taggedVector -band 7) -ne 2) { throw "Invalid live entry/vector candidate for $name" }
        $vectorBase = $taggedVector - 2
        $vectorFirstWord = [AaronFridaMetadataReaderV1]::Read($ProcessId, $vectorBase, 4)
        $region = [AaronFridaMetadataReaderV1]::Query($ProcessId, $entry)
        $regionBase = [uint64]$region.BaseAddress.ToInt64()
        $regionSize = $region.RegionSize.ToUInt64()
        if ($region.State -ne 0x1000 -or ($region.Protect -band 0x101) -ne 0 -or $regionSize -eq 0 -or
            $regionBase -gt ([uint64]::MaxValue - $regionSize)) { throw "Entry region for $name is not readable committed memory" }
        $regionEnd = $regionBase + $regionSize
        $windowBase = [Math]::Max($regionBase, $entry - 64)
        $span = [int][Math]::Min(16384, $regionEnd - $windowBase)
        $bytes = [AaronFridaMetadataReaderV1]::Read($ProcessId, $windowBase, $span)
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
            regionSize = $regionSize; regionProtect = ('0x{0:x}' -f $region.Protect)
            file = $file; sha256 = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
    $manifestPathCurrent = Join-Path $nativeRoot 'capture-manifest.json'
    $manifest = [ordered]@{
        schemaVersion = 1
        method = 'Live function headers read at READY; bounded ReadProcessMemory snapshots; read-only'
        runtimeExecutable = $Ready.runtimeLexicalPath
        runtimeCanonicalPath = $Ready.runtimeCanonicalPath
        processId = $ProcessId
        processStartTimeUtc = $Ready.processStartTimeUtc
        metadataSha256 = (Get-FileHash -LiteralPath $readySnapshotPath -Algorithm SHA256).Hash.ToLowerInvariant()
        functions = $records
    }
    Write-Utf8NoBom $manifestPathCurrent (ConvertTo-Json -InputObject $manifest -Depth 10)
    return [pscustomobject]@{ root = $nativeRoot; manifest = $manifestPathCurrent; functions = $records; readySnapshot = $readySnapshotPath }
}

function Convert-Hex32([string]$Value, [string]$Label) {
    if ($Value -cnotmatch '^0x[0-9a-fA-F]{1,8}$') { throw "$Label is not a 32-bit hexadecimal address" }
    return [uint64][Convert]::ToUInt32($Value.Substring(2), 16)
}

function Wait-Ready([string]$OutputRoot, [string]$RunId, $Runner, [string]$RunnerSha256, [string]$ProbeSha256, [int]$Pause) {
    $requestPath = Join-Path $OutputRoot 'pre-scene-probe-request.json'
    $deadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Runner.Process.Refresh()
        if ($Runner.Process.HasExited) { throw "Oracle runner exited before READY; inspect $($Runner.Stderr)" }
        if (Test-Path -LiteralPath $requestPath -PathType Leaf) {
            try { $request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json } catch { Start-Sleep -Milliseconds 100; continue }
            if ($request.schemaVersion -ne 1 -or $request.runId -cne $RunId -or
                $request.runnerSha256 -cne $RunnerSha256 -or $request.probeSha256 -cne $ProbeSha256 -or
                $request.releaseFile -cne $releasePath -or $request.pauseSeconds -ne $Pause -or
                $request.requiredProbeOutputName -cne $requiredReportName -or
                $request.requiredProbeEndMarker -cne $requiredEndMarker -or
                @($request.probeOutputNames).Count -ne 2 -or
                $request.probeOutputNames[0] -cne $probeName -or $request.probeOutputNames[1] -cne $requiredReportName -or
                $request.runtimeExecutable -cne (Join-Path (Join-Path $OutputRoot 'runtime') 'AARON.exe')) {
                throw 'Runner READY request differs from the exact source-bound observer configuration'
            }
            $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
            if ($all.Count -gt 1) { throw 'More than one AARON process is active during the isolated observer run' }
            $candidate = $null
            if ($all.Count -eq 1) {
                $lexicalRuntime = $request.runtimeExecutable
                $aliases = Get-PathAliases $lexicalRuntime
                if ($all[0].Path -notin $aliases) { throw 'The sole AARON process is not running this isolated run executable' }
                $process = $all[0]
                $process.Refresh()
                if ($process.HasExited -or -not $process.Path) { throw 'Isolated AARON process exited or has no canonical executable path' }
                $canonicalPath = [IO.Path]::GetFullPath($process.Path)
                if ($canonicalPath -notin $aliases) { throw 'AARON process path is not an alias of this run runtime executable' }
                $candidate = [pscustomobject]@{
                    request = $request; process = $process; runtimeLexicalPath = $lexicalRuntime
                    runtimeCanonicalPath = $canonicalPath; processStartTimeUtc = $process.StartTime.ToUniversalTime().ToString('o')
                }
                $script:ready = $candidate
            }
            if ($candidate -and (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
                $metadataBytes = [IO.File]::ReadAllBytes($metadataPath)
                $text = [Text.UTF8Encoding]::new($false, $true).GetString($metadataBytes)
                $text = $text.Replace("`r`n", "`n")
                if ($text.Contains("`r")) { throw 'READY metadata has an invalid carriage return' }
                if ($text.Contains("READY premium-callsite-metadata-v1`n")) {
                    $runtimeRecord = Get-FileRecord $candidate.runtimeCanonicalPath
                    $runtimeExpected = (Assert-RuntimeManifest $manifestPath).files['AARON.exe']
                    if ($runtimeRecord.sha256 -cne $runtimeExpected.sha256 -or $runtimeRecord.bytes -ne $runtimeExpected.bytes) {
                        throw 'READY process executable bytes differ from the extracted source manifest'
                    }
                    $candidate | Add-Member -NotePropertyName runtimeRecord -NotePropertyValue $runtimeRecord
                    $candidate | Add-Member -NotePropertyName metadataText -NotePropertyValue $text
                    $candidate | Add-Member -NotePropertyName metadataBytes -NotePropertyValue $metadataBytes
                    return $candidate
                }
            }
        }
        Start-Sleep -Milliseconds 200
    }
    throw "Observer did not reach READY within $ReadyTimeoutSeconds seconds"
}

function Get-RunnerRoot([string]$RunId) {
    Assert-NoAaronProcess
    $prepareArgs = @{ RunId = $RunId; Mode = $mode; BaseRoot = $baseFullPath }
    if ($AllowMeasuredWriterStreamAt30MiB) { $prepareArgs.AllowMeasuredWriterStreamAt30MiB = $true }
    if ($AllowMeasuredWriterStreamAt26MiB) { $prepareArgs.AllowMeasuredWriterStreamAt26MiB = $true }
    $made = @(& $prepareScript @prepareArgs)
    if ($made.Count -ne 1) { throw 'Fresh run-root preparation did not return exactly one output path' }
    $full = [IO.Path]::GetFullPath(([string]$made[0]).Trim())
    if (Test-Path -LiteralPath $full) { throw "Prepared output root already exists: $full" }
    return $full
}

function Start-Runner([string]$RunId, [string]$OutputRoot, [string]$RunnerHash) {
    $args = @('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
        '-File',$runnerScript,'-ExtractedRoot',$extractedPath,'-OutputRoot',$OutputRoot,
        '-RunId',$RunId,'-Mode',$mode,'-RunSeconds',[string]$RunSeconds,
        '-PreSceneProbePath',$probePath,'-PreSceneProbePauseSeconds',[string]$PauseSeconds,
        '-ProbeOutputNamesCsv',"$probeName,$requiredReportName",'-RequiredProbeOutputName',$requiredReportName,
        '-RequiredProbeEndMarker',$requiredEndMarker)
    $line = ($args | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
    $stdout = Join-Path $logRoot 'runner.stdout.txt'
    $stderr = Join-Path $logRoot 'runner.stderr.txt'
    $process = Start-Process -FilePath $powerShellExe -ArgumentList $line -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $process.Handle
    return [pscustomobject]@{
        Process = $process; Stdout = $stdout; Stderr = $stderr; runnerSha256 = $RunnerHash
        StartTimeUtc = $process.StartTime.ToUniversalTime().ToString('o')
        # Keep the exact executable path used for launch. Process.Path can be
        # empty after a fast child exit, which would mask its real failure when
        # passed to GetFullPath during cleanup.
        ExecutablePath = [IO.Path]::GetFullPath($powerShellExe)
    }
}

function Wait-Runner($Runner, [string]$Role) {
    if (-not $Runner.Process.WaitForExit(($RunSeconds + 900) * 1000)) { throw "$Role runner exceeded its bounded wait; preserve its output root" }
    $Runner.Process.Refresh()
    if ($null -eq $Runner.Process.ExitCode -or $Runner.Process.ExitCode -ne 0) {
        throw "$Role runner exited unsuccessfully; inspect $($Runner.Stderr)"
    }
    Assert-NoAaronProcess
}

function Stop-ExactOwnedHost($HostProcess, [string]$ExpectedPath, [string]$ExpectedStartTimeUtc, [string]$Role) {
    if (-not $HostProcess) { return $false }
    $current = @(Get-Process -Id $HostProcess.Id -ErrorAction SilentlyContinue)
    if ($current.Count -eq 0) { return $true }
    if ($current.Count -ne 1) { Write-Warning "Cannot verify the $Role host PID; leaving it untouched"; return $false }
    $currentProcess = $current[0]
    $currentProcess.Refresh()
    $actualStartTimeUtc = $currentProcess.StartTime.ToUniversalTime().ToString('o')
    $actualPath = if ($currentProcess.Path) { [IO.Path]::GetFullPath($currentProcess.Path) } else { '' }
    if ($currentProcess.Id -ne $HostProcess.Id -or $actualStartTimeUtc -cne $ExpectedStartTimeUtc -or
        $actualPath -ine [IO.Path]::GetFullPath($ExpectedPath)) {
        Write-Warning "The $Role host no longer matches its recorded PID/start/path; leaving the process untouched"
        return $false
    }
    $currentProcess.Kill()
    return $HostProcess.WaitForExit(10000)
}

function Stop-ExactReadyAaron($ReadyRecord, $RunnerRequest) {
    if (-not $ReadyRecord -or -not $RunnerRequest) { return $false }
    $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
    $aliases = Get-PathAliases $RunnerRequest.runtimeExecutable
    $owned = @($all | Where-Object {
        $_.Id -eq $ReadyRecord.process.Id -and $_.Path -in $aliases -and
        $_.StartTime.ToUniversalTime().ToString('o') -ceq $ReadyRecord.processStartTimeUtc
    })
    if ($owned.Count -eq 0) { return $true }
    if ($all.Count -ne 1 -or $owned.Count -ne 1) {
        Write-Warning 'AARON cleanup identity is ambiguous; leaving all AARON processes untouched'
        return $false
    }
    Stop-Process -Id $owned[0].Id -Force -ErrorAction Stop
    return $ReadyRecord.process.WaitForExit(10000)
}

function Test-RunnerRequestOwnership($RunnerRequest) {
    if (-not $RunnerRequest -or -not $runnerOutputRoot -or -not $runnerSha256 -or -not $probeSha256) { return $false }
    $expectedRuntime = [IO.Path]::GetFullPath((Join-Path (Join-Path $runnerOutputRoot 'runtime') 'AARON.exe'))
    $requestRuntime = ''
    $requestRelease = ''
    try {
        $requestRuntime = [IO.Path]::GetFullPath([string]$RunnerRequest.runtimeExecutable)
        $requestRelease = [IO.Path]::GetFullPath([string]$RunnerRequest.releaseFile)
    } catch { return $false }
    return ($RunnerRequest.schemaVersion -eq 1 -and $RunnerRequest.runId -ceq $runId -and
        $RunnerRequest.runnerSha256 -ceq $runnerSha256 -and $RunnerRequest.probeSha256 -ceq $probeSha256 -and
        $requestRuntime -ieq $expectedRuntime -and $requestRelease -ieq [IO.Path]::GetFullPath($releasePath))
}

function Stop-RunOwnedAaronFallback($RunnerRequest) {
    # Used only when READY was never accepted. The isolated runner request binds
    # the run/runtime, and the sole matching AARON must have started after this
    # exact runner process. If any ownership fact is missing, leave it alone.
    if (-not (Test-RunnerRequestOwnership $RunnerRequest) -or -not $runner -or -not $runnerStartTimeUtc) {
        Write-Warning 'Cannot prove fallback AARON ownership from this run request and runner start time; leaving AARON untouched'
        return $false
    }
    $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
    if ($all.Count -eq 0) { return $true }
    if ($all.Count -ne 1) {
        Write-Warning 'Fallback AARON ownership is ambiguous because multiple AARON processes exist; leaving them untouched'
        return $false
    }
    $process = $all[0]
    $aliases = Get-PathAliases $RunnerRequest.runtimeExecutable
    $runnerStart = [DateTime]::Parse($runnerStartTimeUtc).ToUniversalTime()
    $processStart = $process.StartTime.ToUniversalTime()
    if (-not $process.Path -or $process.Path -notin $aliases -or $processStart -lt $runnerStart) {
        Write-Warning 'Fallback AARON does not match the isolated runtime path and runner start boundary; leaving it untouched'
        return $false
    }
    Stop-Process -Id $process.Id -Force -ErrorAction Stop
    return $process.WaitForExit(10000)
}

function Read-RunSummary([string]$OutputRoot, [string]$RunId, [string]$RunnerSha256, [string]$ProbeSha256) {
    $summaryPath = Join-Path $OutputRoot 'summary.json'
    $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
    if ($summary.runId -cne $RunId -or $summary.complete -ne $true -or $summary.mode -cne $mode -or
        $summary.smallImage -ne $false -or $summary.runnerSha256 -cne $RunnerSha256 -or
        $summary.preSceneProbeSha256 -cne $ProbeSha256 -or $summary.preSceneProbePauseSeconds -ne $PauseSeconds -or
        $summary.requiredProbeOutputName -cne $requiredReportName -or $summary.requiredProbeEndMarker -cne $requiredEndMarker -or
        $summary.probeCompletionSatisfied -ne $true -or
        @($summary.probeOutputNames).Count -ne 2 -or $summary.probeOutputNames[0] -cne $probeName -or
        $summary.probeOutputNames[1] -cne $requiredReportName) { throw 'Runner summary does not bind a complete exact observer run' }
    $runtime = Join-Path $OutputRoot 'runtime'
    foreach ($name in @('AARON.exe','AARON.pll')) {
        $record = Get-FileRecord (Join-Path $runtime $name)
        $expected = (Assert-RuntimeManifest $manifestPath).files[$name]
        if ($record.bytes -ne $expected.bytes -or $record.sha256 -cne $expected.sha256) { throw "Run runtime $name differs from extracted manifest" }
    }
    $capture = Join-Path $OutputRoot 'capture'
    foreach ($name in @('aa0','image','image-id','aaron-scene-state-snapshot.txt','aaron-random-seed-loaded.txt')) {
        $null = Get-FileRecord (Join-Path $capture $name)
    }
    if ($summary.aa0Sha256 -cne (Get-FileHash -LiteralPath (Join-Path $capture 'aa0') -Algorithm SHA256).Hash.ToLowerInvariant() -or
        $summary.sceneReportSha256 -cne (Get-FileHash -LiteralPath (Join-Path $capture 'aaron-scene-state-snapshot.txt') -Algorithm SHA256).Hash.ToLowerInvariant() -or
        (Get-Content -LiteralPath (Join-Path $capture 'aa0') -Tail 1) -cne 'end' -or
        -not (Select-String -LiteralPath (Join-Path $capture 'aaron-scene-state-snapshot.txt') -SimpleMatch 'END scene-state-snapshot' -Quiet)) {
        throw 'Runner drawing or scene artifacts are incomplete or not summary-bound'
    }
    $stagedProbe = Join-Path $capture 'aaron-pre-scene-probe.cl'
    if ((Get-FileHash -LiteralPath $stagedProbe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ProbeSha256) {
        throw 'Archived staged metadata source differs from the current probe'
    }
    return [pscustomobject]@{ summary = $summary; capture = $capture }
}

function Get-SourceHashRecord([string]$Path) {
    $record = Get-FileRecord $Path
    return [ordered]@{ path = $record.path; sha256 = $record.sha256; bytes = $record.bytes }
}

function Assert-CapturedSourcesUnchanged([string]$RuntimePath, [string]$RuntimeSha256, [string]$PllPath, [string]$PllSha256) {
    $checks = @(
        [pscustomobject]@{ name = 'runner'; path = $runnerScript; sha256 = $runnerSha256 }
        [pscustomobject]@{ name = 'probe'; path = $probePath; sha256 = $probeSha256 }
        [pscustomobject]@{ name = 'native mapper'; path = $mapperPath; sha256 = $mapperSha256 }
        [pscustomobject]@{ name = 'REA census'; path = $censusPath; sha256 = $censusSha256 }
        [pscustomobject]@{ name = 'Python observer'; path = $observerPath; sha256 = $driverSha256 }
        [pscustomobject]@{ name = 'coordinator'; path = $PSCommandPath; sha256 = $coordinatorSha256 }
        [pscustomobject]@{ name = 'extracted manifest'; path = $manifestPath; sha256 = $runtimeIdentity.sha256 }
        [pscustomobject]@{ name = 'extracted AARON.exe'; path = (Join-Path $applicationPath 'AARON.exe'); sha256 = $runtimeIdentity.files['AARON.exe'].sha256 }
        [pscustomobject]@{ name = 'extracted AARON.pll'; path = (Join-Path $applicationPath 'AARON.pll'); sha256 = $runtimeIdentity.files['AARON.pll'].sha256 }
        [pscustomobject]@{ name = 'live runtime executable'; path = $RuntimePath; sha256 = $RuntimeSha256 }
        [pscustomobject]@{ name = 'run PLL'; path = $PllPath; sha256 = $PllSha256 }
    )
    foreach ($check in $checks) {
        $actual = (Get-FileHash -LiteralPath $check.path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -cne $check.sha256) { throw "Source changed during observer capture: $($check.name) ($($check.path))" }
    }
}

# Preflight the exact source files and runtime before creating any run roots.
$runtimeIdentity = Assert-RuntimeManifest $manifestPath
$reaBinding = Assert-StaticCensus $censusPath $runtimeIdentity.files['AARON.pll'].sha256
$runnerSha256 = (Get-FileHash -LiteralPath $runnerScript -Algorithm SHA256).Hash.ToLowerInvariant()
$probeSha256 = (Get-FileHash -LiteralPath $probePath -Algorithm SHA256).Hash.ToLowerInvariant()
$mapperSha256 = (Get-FileHash -LiteralPath $mapperPath -Algorithm SHA256).Hash.ToLowerInvariant()
$censusSha256 = (Get-FileHash -LiteralPath $censusPath -Algorithm SHA256).Hash.ToLowerInvariant()
$driverSha256 = (Get-FileHash -LiteralPath $observerPath -Algorithm SHA256).Hash.ToLowerInvariant()
$coordinatorSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($PreflightOnly) {
    Assert-NoAaronProcess
    $preflightRunRootId = 'frida-preflight-' + [Guid]::NewGuid().ToString('N')
    $preflightRunRoot = Get-RunnerRoot $preflightRunRootId
    if (Test-Path -LiteralPath $preflightRunRoot) {
        throw "Run-root preparation preflight unexpectedly created an output root: $preflightRunRoot"
    }
    foreach ($reserved in @($metadataPath, $releasePath, (Join-Path 'C:\temp' $requiredReportName))) {
        if (Test-Path -LiteralPath $reserved) { throw "Reserved C:\temp staging path already exists; preserve it: $reserved" }
    }
    $delimiterOutput = @(& node $lispDelimiterCheckPath $probePath 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "Metadata-probe delimiter preflight failed: $($delimiterOutput -join ' ')" }
    $fridaImportOutput = @(& $PythonPath -c 'import frida; print(frida.__version__)' 2>&1)
    if ($LASTEXITCODE -ne 0 -or $fridaImportOutput.Count -eq 0) {
        throw "Frida Python import preflight failed: $($fridaImportOutput -join ' ')"
    }
    $fridaSelfTestOutput = @(& $PythonPath $observerPath --self-test 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Frida observer contract self-test failed: $($fridaSelfTestOutput -join ' ')"
    }
    $tempWriteProbe = Join-Path 'C:\temp' ('.aaron-frida-coordinator-preflight-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $tempProbeCreated = $false
    $tempStream = $null
    try {
        $tempStream = [IO.File]::Open($tempWriteProbe, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $tempProbeCreated = $true
        $tempProbeBytes = [Text.UTF8Encoding]::new($false).GetBytes('AARON Frida coordinator preflight')
        $tempStream.Write($tempProbeBytes, 0, $tempProbeBytes.Length)
        $tempStream.Flush($true)
        $tempStream.Dispose()
        $tempStream = $null
        if ((Get-FileHash -LiteralPath $tempWriteProbe -Algorithm SHA256).Hash.ToLowerInvariant() -cne (Get-Sha256Bytes $tempProbeBytes)) {
            throw 'C:\temp staging write probe did not preserve its exact bytes'
        }
    } finally {
        if ($tempStream) { $tempStream.Dispose() }
        if ($tempProbeCreated -and (Test-Path -LiteralPath $tempWriteProbe -PathType Leaf)) {
            Remove-Item -LiteralPath $tempWriteProbe -Force -ErrorAction Stop
        }
    }
    $preflightRunId = 'prem-pick-preflight'
    $preflightOutput = Join-Path $baseFullPath "$preflightRunId-uncreated"
    $runnerPreflight = @(& $powerShellExe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runnerScript `
        -ExtractedRoot $extractedPath -OutputRoot $preflightOutput -RunId $preflightRunId -Mode $mode `
        -RunSeconds $RunSeconds -PreSceneProbePath $probePath -PreSceneProbePauseSeconds $PauseSeconds `
        -ProbeOutputNamesCsv "$probeName,$requiredReportName" -RequiredProbeOutputName $requiredReportName `
        -RequiredProbeEndMarker 'END frida-observer-prem-pick-preflight' -PowerShellPreflightOnly 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "Runner argument preflight failed: $($runnerPreflight -join ' ')" }
    Write-Output ([ordered]@{
        status = 'preflight-ok'; preflightOnly = $true; runtimeManifestSha256 = $runtimeIdentity.sha256
        runnerSha256 = $runnerSha256; metadataProbeSha256 = $probeSha256; mapperSha256 = $mapperSha256
        reaCensusSha256 = $censusSha256; fridaDriverSha256 = $driverSha256; coordinatorSha256 = $coordinatorSha256
        fridaVersion = ($fridaImportOutput -join ' '); fridaObserverSelfTest = 'passed'
        cTempWriteProbe = 'created-verified-deleted'
        expectedPremiumPayloadSha256 = $reaBinding.method.sourceBinding.originalPayload.sha256
        expectedCallsiteOffset = 200; expectedCallsiteBytes = 'ff5727'; oracleLaunched = $false
    } | ConvertTo-Json -Compress -Depth 6)
    return
}

if (-not $AllowAARONInjectionAfterCrash) {
    throw 'Frida 17.23.3 crashed two source-bound AARON runs in frida-agent.dll before script load. Use the REA/no-TF native route. Only pass -AllowAARONInjectionAfterCrash after materially changing and separately validating the agent/runtime conditions.'
}

if (-not (Test-Path -LiteralPath 'C:\temp\aaron-frida-observers' -PathType Container)) {
    # Keep Frida-owned files in a task-specific fresh child of C:\temp. This is
    # intentionally a single-level directory creation and never removes siblings.
    New-Item -ItemType Directory -Path 'C:\temp\aaron-frida-observers' -ErrorAction Stop | Out-Null
}
if (Get-Process -Name AARON -ErrorAction SilentlyContinue) { throw 'An AARON process is active; refusing to overlap original-runtime runs' }

$tripletId = '{0}-{1}-{2}' -f $RunPrefix, [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss'), [Guid]::NewGuid().ToString('N').Substring(0,8)
$runId = "$tripletId-observer"
if ($runId.Length -gt 45) { throw 'Generated runId exceeds the Frida driver bound' }
$requiredEndMarker = "END frida-observer-$runId"
$logRoot = Join-Path $repoRoot "research\extracted\local-oracle\premium-pick-frida-observer-v1-logs\$tripletId"
$observerTaskRoot = Join-Path 'C:\temp\aaron-frida-observers' $tripletId
$observerInputRoot = Join-Path $observerTaskRoot 'input'
$observerDataRoot = Join-Path $observerTaskRoot 'observer-output'
if (Test-Path -LiteralPath $logRoot) { throw "Log root already exists; preserve it: $logRoot" }
if (Test-Path -LiteralPath $observerTaskRoot) { throw "Frida observer root already exists; preserve it: $observerTaskRoot" }
if (-not (Test-Path -LiteralPath 'C:\temp' -PathType Container)) { throw 'C:\temp disappeared after preflight' }
foreach ($reserved in @($metadataPath, $releasePath, (Join-Path 'C:\temp' $requiredReportName))) {
    if (Test-Path -LiteralPath $reserved) { throw "Reserved C:\temp staging path already exists; preserve it: $reserved" }
}
New-Item -ItemType Directory -Path $logRoot -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Path $observerTaskRoot -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Path $observerInputRoot -ErrorAction Stop | Out-Null

$runner = $null
$pythonProcess = $null
$runnerStartTimeUtc = $null
$runnerExecutablePath = $null
$pythonStartTimeUtc = $null
$pythonExecutablePath = $null
$ready = $null
$script:ready = $null
$runnerOutputRoot = $null
$releaseWritten = $false
$coordinatorSucceeded = $false
$requestPath = Join-Path $observerInputRoot 'frida-observer-request.json'
$ackPath = Join-Path $observerDataRoot 'controller-ready.json'
$statusPath = Join-Path $observerDataRoot 'status.json'
$stopPath = Join-Path $observerDataRoot 'stop.request'
$driverOutputPath = Join-Path $observerDataRoot 'observer.txt'
$sourceEvidencePath = Join-Path $observerInputRoot 'source-evidence.json'
$requiredReportPath = Join-Path 'C:\temp' $requiredReportName

try {
    $runnerOutputRoot = Get-RunnerRoot $runId
    $runner = Start-Runner $runId $runnerOutputRoot $runnerSha256
    $runnerStartTimeUtc = $runner.StartTimeUtc
    $runnerExecutablePath = $runner.ExecutablePath
    $ready = Wait-Ready $runnerOutputRoot $runId $runner $runnerSha256 $probeSha256 $PauseSeconds
    $methodIndices = Assert-MetadataReady $ready.metadataText
    if ((Get-FileHash -LiteralPath $runnerScript -Algorithm SHA256).Hash.ToLowerInvariant() -cne $runnerSha256 -or
        (Get-FileHash -LiteralPath $probePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $probeSha256 -or
        (Get-FileHash -LiteralPath $mapperPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $mapperSha256 -or
        (Get-FileHash -LiteralPath $censusPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $censusSha256) {
        throw 'Source files changed while the oracle reached READY'
    }
    $runtimePll = Join-Path (Join-Path $runnerOutputRoot 'runtime') 'AARON.pll'
    $pllRecord = Get-FileRecord $runtimePll
    if ($pllRecord.sha256 -cne $runtimeIdentity.files['AARON.pll'].sha256) { throw 'READY-run AARON.pll differs from the extracted manifest' }

    $readySnapshotPath = Join-Path $observerInputRoot 'ready-metadata.bin'
    $live = Read-FunctionWindows ([uint32]$ready.process.Id) $ready.metadataText $ready.metadataBytes $readySnapshotPath $runnerOutputRoot $methodIndices
    $mappedRoot = Join-Path $live.root 'mapped'
    $mapStdout = Join-Path $logRoot 'mapper.stdout.txt'
    $mapStderr = Join-Path $logRoot 'mapper.stderr.txt'
    & node $mapperPath $live.manifest $runtimePll $mappedRoot 1> $mapStdout 2> $mapStderr
    if ($LASTEXITCODE -ne 0) { throw "Live PLL object mapping failed (exit $LASTEXITCODE); preserve $mapStderr" }
    $mapPath = Join-Path $mappedRoot 'native-code-map.json'
    $map = Get-Content -LiteralPath $mapPath -Raw | ConvertFrom-Json
    if ($map.schemaVersion -ne 1 -or $map.pll.sha256 -cne $pllRecord.sha256 -or @($map.functions).Count -ne 3) {
        throw 'Live native map is not bound to the current PLL and three READY functions'
    }
    $premiumName = "SELECT-SUBJECT-METHOD-$($methodIndices.premiumIndex)"
    $premium = @($map.functions | Where-Object { $_.name -ceq $premiumName })
    $pick = @($map.functions | Where-Object { $_.name -ceq 'PICK' })
    if ($premium.Count -ne 1 -or $pick.Count -ne 1 -or $premium[0].payloadBytes -ne 362 -or
        $premium[0].objectBytes -ne 366 -or -not $premium[0].uniqueCompleteObjectByteMatch -or
        -not $pick[0].uniqueCompleteObjectByteMatch -or $pick[0].payloadBytes -lt 1) {
        throw 'Current PREMIUM/PICK objects do not have unique complete PLL matches'
    }
    $premiumPayload = [IO.File]::ReadAllBytes((Join-Path $mappedRoot $premium[0].payloadFile))
    $pickPayload = [IO.File]::ReadAllBytes((Join-Path $mappedRoot $pick[0].payloadFile))
    if ((Get-Sha256Bytes $premiumPayload) -cne $premium[0].payloadSha256 -or
        (Get-Sha256Bytes $pickPayload) -cne $pick[0].payloadSha256 -or
        $premium[0].payloadSha256 -cne $reaBinding.method.sourceBinding.originalPayload.sha256) {
        throw 'Mapped payload bytes or REA source binding changed'
    }
    $reaMethodEntry = Convert-Hex32 ([string]$reaBinding.method.entry) 'REA PREMIUM payload entry'
    $reaCallAddress = Convert-Hex32 ([string]$reaBinding.call.address) 'REA callsite'
    $callOffset = [int]($reaCallAddress - $reaMethodEntry)
    if ($callOffset -ne 200 -or $callOffset + 3 -gt $premiumPayload.Length -or
        ([BitConverter]::ToString($premiumPayload, $callOffset, 3)).Replace('-', '').ToLowerInvariant() -cne 'ff5727') {
        throw 'Live PREMIUM payload does not match the static REA FF 57 27 instruction at offset 200'
    }
    $premiumEntry = Convert-Hex32 ([string]$premium[0].runtime.entry) 'Current PREMIUM entry'
    $pickEntry = Convert-Hex32 ([string]$pick[0].runtime.entry) 'Current PICK entry'
    $callAddress = $premiumEntry + [uint64]$callOffset
    if ($callAddress -gt [uint32]::MaxValue -or $callAddress + 3 -gt $premiumEntry + $premiumPayload.Length) {
        throw 'Dynamic callsite exceeds mapped PREMIUM payload or IA-32 address space'
    }
    $callBytes = [AaronFridaMetadataReaderV1]::Read([uint32]$ready.process.Id, $callAddress, 3)
    if (([BitConverter]::ToString($callBytes)).Replace('-', '').ToLowerInvariant() -cne 'ff5727') {
        throw 'Current live bytes at the dynamically derived callsite differ from FF 57 27'
    }
    $continuation = $callAddress + 3
    if ($continuation -gt [uint32]::MaxValue) { throw 'Dynamic return continuation exceeds IA-32 address space' }
    $callAddressText = '0x{0:x8}' -f $callAddress
    $continuationText = '0x{0:x8}' -f $continuation
    $premiumEntryText = '0x{0:x8}' -f $premiumEntry
    $pickEntryText = '0x{0:x8}' -f $pickEntry

    # Store immutable READY bytes separately: the live CLOS report is appended
    # after release, so its final hash is expected to differ from this prefix.
    $readyRecord = Get-FileRecord $live.readySnapshot
    $runtimePath = $ready.runtimeCanonicalPath
    $runtimeRecord = Get-FileRecord $runtimePath
    $sourceEvidence = [ordered]@{
        schema = 'aaron-premium-callsite-pick-observer-source-v1'
        runId = $runId; tripletId = $tripletId; readyPid = [int]$ready.process.Id
        runtimePath = $runtimePath; runtimeSha256 = $runtimeRecord.sha256
        premiumEntry = $premiumEntryText; premiumCallsite = $callAddressText; premiumReturnContinuation = $continuationText
        pickEntry = $pickEntryText; callsiteOffset = $callOffset; callsiteBytes = 'ff5727'
        premiumPayloadSha256 = $premium[0].payloadSha256; pickPayloadSha256 = $pick[0].payloadSha256
        scenePath = $runnerScenePath; sceneName = [IO.Path]::GetFileName($runnerScenePath)
        aa0Path = $runnerAa0Path; aa0Name = [IO.Path]::GetFileName($runnerAa0Path)
        runtimeLexicalPath = $ready.runtimeLexicalPath; pllSha256 = $pllRecord.sha256
        pllPath = [IO.Path]::GetFullPath($runtimePll)
        runnerSha256 = $runnerSha256; probeSha256 = $probeSha256; mapperSha256 = $mapperSha256
        reaCensusSha256 = $censusSha256; manifestSha256 = $runtimeIdentity.sha256
        nativeCaptureManifestPath = [IO.Path]::GetFullPath($live.manifest)
        nativeCaptureManifestSha256 = (Get-FileHash -LiteralPath $live.manifest -Algorithm SHA256).Hash.ToLowerInvariant()
        nativeMapReportPath = [IO.Path]::GetFullPath($mapPath)
        nativeMapSha256 = (Get-FileHash -LiteralPath $mapPath -Algorithm SHA256).Hash.ToLowerInvariant()
        processStartTimeUtc = $ready.processStartTimeUtc
    }
    Write-Utf8NoBom $sourceEvidencePath (ConvertTo-Json -InputObject $sourceEvidence -Depth 12)
    $sourceEvidenceRecord = Get-FileRecord $sourceEvidencePath
    $sourceBinding = [ordered]@{
        readyPid = [int]$ready.process.Id
        readyRecordPath = [IO.Path]::GetFullPath($live.readySnapshot)
        readyRecordSha256 = $readyRecord.sha256
        sourceEvidencePath = [IO.Path]::GetFullPath($sourceEvidencePath)
        sourceEvidenceSha256 = $sourceEvidenceRecord.sha256
        runtimeSha256 = $runtimeRecord.sha256
        premiumPayloadSha256 = $premium[0].payloadSha256
        pickPayloadSha256 = $pick[0].payloadSha256
        controllerPath = [IO.Path]::GetFullPath($PSCommandPath)
        controllerSha256 = $coordinatorSha256
    }
    $sourceBindingSha256 = Get-Sha256Text (Get-CanonicalJson $sourceBinding)
    $endMarker = $requiredEndMarker
    $request = [ordered]@{
        schema = 'aaron-premium-callsite-pick-observer-request-v1'
        runId = $runId; readyPid = [int]$ready.process.Id; runtimePath = $runtimePath
        premiumCallsite = $callAddressText; premiumReturnContinuation = $continuationText; pickEntry = $pickEntryText
        scenePath = $runnerScenePath; aa0Path = $runnerAa0Path; sceneEndMarker = 'END scene-state-snapshot'
        outputRoot = $observerDataRoot; outputPath = $driverOutputPath; controllerReadyPath = $ackPath
        statusPath = $statusPath; stopPath = $stopPath; endMarker = $endMarker
        sourceBinding = $sourceBinding; timeoutSeconds = $ObserverTimeoutSeconds
        maxRecords = $MaxRecords; pollIntervalMs = $PollIntervalMs
    }
    Write-Utf8NoBom $requestPath (ConvertTo-Json -InputObject $request -Compress -Depth 12)
    $requestSha256 = (Get-FileHash -LiteralPath $requestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-CapturedSourcesUnchanged $runtimePath $runtimeRecord.sha256 $runtimePll $pllRecord.sha256
    foreach ($path in @($ackPath, $statusPath, $stopPath, $driverOutputPath)) {
        if (Test-Path -LiteralPath $path) { throw "Frida observer output path is not fresh: $path" }
    }

    $pythonArgs = @($observerPath, '--request', $requestPath)
    if ($AllowAARONInjectionAfterCrash) { $pythonArgs += '--allow-aaron-injection-after-crash' }
    $pythonLine = ($pythonArgs | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
    $pythonStdout = Join-Path $observerInputRoot 'driver.stdout.txt'
    $pythonStderr = Join-Path $observerInputRoot 'driver.stderr.txt'
    # PythonPath was normalized and verified before the run. Preserve that
    # launch identity rather than querying Process.Path after a possible fast
    # exit, where Windows may return an empty string.
    $pythonExecutablePath = [IO.Path]::GetFullPath($PythonPath)
    $pythonProcess = Start-Process -FilePath $PythonPath -ArgumentList $pythonLine -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $pythonStdout -RedirectStandardError $pythonStderr
    $pythonStartTimeUtc = $pythonProcess.StartTime.ToUniversalTime().ToString('o')
    $null = $pythonProcess.Handle

    $ackDeadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    $ack = $null
    while ([DateTime]::UtcNow -lt $ackDeadline) {
        $pythonProcess.Refresh(); $ready.process.Refresh()
        if ($pythonProcess.HasExited) { throw "Frida driver exited before controller-ready acknowledgement; inspect $pythonStderr" }
        if ($ready.process.HasExited) { throw 'AARON exited before Frida hook arm acknowledgement' }
        if (Test-Path -LiteralPath $ackPath -PathType Leaf) {
            try { $ack = Get-Content -LiteralPath $ackPath -Raw | ConvertFrom-Json } catch { Start-Sleep -Milliseconds 100; continue }
            break
        }
        Start-Sleep -Milliseconds 100
    }
    if (-not $ack) { throw "Frida observer did not acknowledge an armed hook within $ReadyTimeoutSeconds seconds" }
    if ($ack.schema -cne 'aaron-premium-callsite-pick-observer-controller-ready-v1' -or
        $ack.runId -cne $runId -or $ack.ready -ne $true -or $ack.pid -ne $ready.process.Id -or
        $ack.requestSha256 -cne $requestSha256 -or $ack.sourceBindingSha256 -cne $sourceBindingSha256 -or
        $ack.hostWillNotReleaseAARON -ne $true -or $ack.agentSourceSha256 -notmatch '^[0-9a-f]{64}$' -or
        $ack.identity.arch -cne 'ia32' -or $ack.identity.pointerSize -ne 4 -or
        [string]$ack.identity.mainModulePath -ine $runtimePath -or
        [string]$ack.addresses.premiumCallsite -ine $callAddressText -or
        [string]$ack.addresses.premiumReturnContinuation -ine $continuationText -or
        [string]$ack.addresses.pickEntry -ine $pickEntryText) {
        throw 'Frida controller-ready acknowledgement does not match the exact READY process, source binding, addresses, or IA-32 identity'
    }
    if ((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $coordinatorSha256 -or
        (Get-FileHash -LiteralPath $observerPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $driverSha256) {
        throw 'Coordinator or Python driver source changed after request creation'
    }
    Assert-CapturedSourcesUnchanged $runtimePath $runtimeRecord.sha256 $runtimePll $pllRecord.sha256

    # Release only the exact C:\temp marker owned by this READY run, and only
    # after the driver proves the correct process and hook are armed.
    $releaseText = "Frida controller-ready release runId=$runId pid=$($ready.process.Id)`n"
    Write-Utf8NoBom $releasePath $releaseText $true
    $releaseWritten = $true

    $waitMs = ($ObserverTimeoutSeconds + $EndTimeoutSeconds + 60) * 1000
    if (-not $pythonProcess.WaitForExit($waitMs)) {
        if (-not (Test-Path -LiteralPath $stopPath)) { Write-Utf8NoBom $stopPath "coordinator-timeout runId=$runId`n" $true }
        throw 'Frida observer exceeded its bounded scene/report wait; preserve its diagnostics and the incomplete oracle root'
    }
    $pythonProcess.Refresh()
    if ($pythonProcess.ExitCode -ne 0) { throw "Frida driver exited $($pythonProcess.ExitCode); inspect $pythonStderr and observer-diagnostics.json" }
    if (-not (Test-Path -LiteralPath $driverOutputPath -PathType Leaf)) { throw 'Frida driver exited successfully without its source-bound report' }
    $driverReportBytes = [IO.File]::ReadAllBytes($driverOutputPath)
    $driverReportText = [Text.UTF8Encoding]::new($false, $true).GetString($driverReportBytes)
    if ($driverReportText.Contains("`r")) { throw 'Frida report must use LF line endings' }
    $reportLines = @($driverReportText.TrimEnd([char]10).Split([char]10))
    if ($reportLines.Count -lt 3 -or $reportLines[0] -cne "BEGIN aaron-premium-callsite-pick-observer-report-v1 $runId" -or
        $reportLines[-1] -cne $endMarker -or @($reportLines | Where-Object { $_ -ceq $endMarker }).Count -ne 1 -or
        -not $reportLines[1].StartsWith('REPORT ')) { throw 'Frida report lacks its exact source-bound BEGIN/REPORT/END envelope' }
    $report = ($reportLines[1].Substring(7)) | ConvertFrom-Json
    if ($report.schema -cne 'aaron-premium-callsite-pick-observer-report-v1' -or $report.runId -cne $runId -or
        $report.pid -ne $ready.process.Id -or $report.identity.pid -ne $ready.process.Id -or
        $report.identity.arch -cne 'ia32' -or $report.identity.pointerSize -ne 4 -or
        [string]$report.identity.mainModulePath -ine $runtimePath -or
        $report.status -notin @('complete','no-hit') -or $report.lifecycle.attached -ne $true -or
        $report.lifecycle.agentIdentityVerified -ne $true -or $report.lifecycle.hookInstalled -ne $true -or
        $report.lifecycle.controllerReadyWritten -ne $true -or $report.lifecycle.interceptorDetached -ne $true -or
        $report.lifecycle.scriptUnloaded -ne $true -or $report.lifecycle.sessionDetached -ne $true -or
        $report.lifecycle.sceneComplete -ne $true -or $report.lifecycle.aa0Complete -ne $true -or
        $report.lifecycle.endWritten -ne $true) { throw 'Frida report is incomplete or has an unsuccessful attach/detach/scene lifecycle' }
    if ($report.sourceBindingSha256 -cne $sourceBindingSha256 -or
        $report.hashes.requestSha256 -cne $requestSha256 -or $report.hashes.driverSha256 -cne $driverSha256 -or
        $report.hashes.agentSourceSha256 -cne $ack.agentSourceSha256 -or
        $report.hashes.readyRecordSha256 -cne $readyRecord.sha256 -or
        $report.hashes.sourceEvidenceSha256 -cne $sourceEvidenceRecord.sha256 -or
        $report.hashes.runtimeSha256 -cne $runtimeRecord.sha256 -or
        $report.hashes.controllerSha256 -cne $coordinatorSha256 -or
        $report.hashes.premiumPayloadSha256 -cne $premium[0].payloadSha256 -or
        $report.hashes.pickPayloadSha256 -cne $pick[0].payloadSha256) { throw 'Frida report hashes differ from the source-bound request and current mapping' }
    Assert-CapturedSourcesUnchanged $runtimePath $runtimeRecord.sha256 $runtimePll $pllRecord.sha256
    if ([string]$report.addresses.premiumCallsite -ine $callAddressText -or
        [string]$report.addresses.premiumReturnContinuation -ine $continuationText -or
        [string]$report.addresses.pickEntry -ine $pickEntryText) { throw 'Frida report address tuple differs from the live PLL mapping' }
    $counts = $report.counts
    if ($counts.counterOverflow -ne $false -or $counts.droppedMatchedRecords -ne 0 -or $counts.inFlightMatched -ne 0 -or
        $counts.matchedEntries -ne $counts.matchedReturns -or $counts.matchedEntries -ne $counts.completedPairs -or
        @($report.matchedRecords).Count -ne $counts.matchedEntries) { throw 'Frida hook counters do not reconcile without overflow or dropped records' }
    foreach ($record in @($report.matchedRecords)) {
        if ([string]$record.entryAddress -ine $pickEntryText -or
            [string]$record.returnAddress -ine $continuationText -or $record.returned -ne $true) {
            throw 'A Frida matched record does not identify the current PICK entry and PREMIUM continuation'
        }
    }
    if (($report.status -ceq 'complete') -ne ($counts.matchedEntries -gt 0)) { throw 'Frida complete/no-hit status contradicts matched-entry counters' }

    # Publish the already validated driver report into the runner's required
    # C:\temp report slot. The runner only uses the terminal END as its barrier;
    # this coordinator performs the semantic validation above.
    Write-BytesNoOverwrite $requiredReportPath $driverReportBytes
    $runnerEndDeadline = [DateTime]::UtcNow.AddSeconds($EndTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $runnerEndDeadline) {
        $runner.Process.Refresh()
        if ($runner.Process.HasExited) { break }
        if ((Test-Path -LiteralPath (Join-Path $runnerOutputRoot 'summary.json')) -and
            (Get-Content -LiteralPath (Join-Path $runnerOutputRoot 'summary.json') -Raw -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 150
    }
    Wait-Runner $runner 'observer'
    $runEvidence = Read-RunSummary $runnerOutputRoot $runId $runnerSha256 $probeSha256
    $capture = $runEvidence.capture
    $archivedReportPath = Join-Path $capture $requiredReportName
    $archivedReport = Get-FileRecord $archivedReportPath
    if ($runEvidence.summary.requiredProbeOutputSha256 -cne $archivedReport.sha256 -or
        (Get-Content -LiteralPath $archivedReportPath -Tail 1) -cne $requiredEndMarker) {
        throw 'Archived Frida report differs from runner summary or lacks the exact runner END marker'
    }
    $archivedScenePath = Join-Path $capture 'aaron-scene-state-snapshot.txt'
    $archivedAa0Path = Join-Path $capture 'aa0'
    $archivedSceneRecord = Get-FileRecord $archivedScenePath
    $archivedAa0Record = Get-FileRecord $archivedAa0Path
    if ($report.hashes.sceneSha256 -cne $archivedSceneRecord.sha256 -or
        $report.hashes.aa0Sha256 -cne $archivedAa0Record.sha256 -or
        $report.scene.scene.sha256 -cne $archivedSceneRecord.sha256 -or
        $report.scene.aa0.sha256 -cne $archivedAa0Record.sha256 -or
        [string]$report.scene.scene.path -ine $runnerScenePath -or
        [string]$report.scene.aa0.path -ine $runnerAa0Path) {
        throw 'Frida report scene/AA0 hashes and staging paths do not match the runner-archived complete controls'
    }
    $archivedMetadata = Join-Path $capture $probeName
    $archivedMetadataBytes = [IO.File]::ReadAllBytes($archivedMetadata)
    $readyMetadataBytes = [IO.File]::ReadAllBytes($live.readySnapshot)
    if ($archivedMetadataBytes.Length -lt $readyMetadataBytes.Length) { throw 'Archived metadata is shorter than the READY prefix snapshot' }
    for ($byteIndex = 0; $byteIndex -lt $readyMetadataBytes.Length; $byteIndex++) {
        if ($archivedMetadataBytes[$byteIndex] -ne $readyMetadataBytes[$byteIndex]) {
            throw 'Archived Lisp metadata does not begin with the exact immutable READY byte snapshot'
        }
    }
    $metadataText = [Text.UTF8Encoding]::new($false, $true).GetString($archivedMetadataBytes)
    $metadataNorm = $metadataText.Replace("`r`n", "`n")
    if ($metadataNorm.Contains("`r")) { throw 'Archived Lisp metadata has invalid line endings' }
    $metadataLines = @($metadataNorm.TrimEnd([char]10).Split([char]10))
    $orderedMarkers = @('READY premium-callsite-metadata-v1','CAPTURE-WAIT released=T','COMPLETE execution=finished','END premium-callsite-metadata-v1')
    $previous = -1
    foreach ($marker in $orderedMarkers) {
        $positions = @(); for ($i = 0; $i -lt $metadataLines.Count; $i++) { if ($metadataLines[$i] -ceq $marker) { $positions += $i } }
        if ($positions.Count -ne 1 -or $positions[0] -le $previous) { throw 'Archived metadata did not complete the exact READY/release/COMPLETE/END handshake' }
        $previous = $positions[0]
    }
    if ($previous -ne ($metadataLines.Count - 1)) { throw 'Archived metadata END is not terminal' }
    Assert-CapturedSourcesUnchanged $runtimePath $runtimeRecord.sha256 $runtimePll $pllRecord.sha256
    Assert-NoAaronProcess

    $nativeManifestRecord = Get-SourceHashRecord $live.manifest
    $nativeMapRecord = Get-SourceHashRecord $mapPath
    $observerRootFull = [IO.Path]::GetFullPath($runnerOutputRoot)
    $contextPath = Join-Path $capture 'capture-context.json'
    $context = [ordered]@{
        schema = 'aaron-premium-pick-frida-capture-context-v1'
        tripletId = $tripletId
        observer = [ordered]@{ runId = $runId; root = $observerRootFull }
        runner = [ordered]@{
            mode = $mode; smallImage = $false; runnerSha256 = $runnerSha256
            installerSha256 = $runEvidence.summary.installerSha256
            registryPatchSha256 = $runEvidence.summary.registryPatchSha256
            licensePatchSha256 = $runEvidence.summary.licensePatchSha256
            requiredProbeOutputName = $requiredReportName; requiredProbeEndMarker = $requiredEndMarker
        }
        files = [ordered]@{
            fridaRequest = Get-SourceHashRecord $requestPath
            fridaReport = Get-SourceHashRecord $archivedReportPath
            readyMetadata = Get-SourceHashRecord $live.readySnapshot
            sourceEvidence = Get-SourceHashRecord $sourceEvidencePath
            reaCensus = Get-SourceHashRecord $censusPath
            probeSource = Get-SourceHashRecord $probePath
            pythonDriver = Get-SourceHashRecord $observerPath
            controller = Get-SourceHashRecord $PSCommandPath
            runtimeExecutable = [ordered]@{ path = $runtimePath; sha256 = $runtimeRecord.sha256; bytes = $runtimeRecord.bytes; lexicalPath = $ready.runtimeLexicalPath }
            pll = Get-SourceHashRecord $runtimePll
            nativeCaptureManifest = Get-SourceHashRecord $live.manifest
            nativeMapReport = Get-SourceHashRecord $mapPath
            agentSource = [ordered]@{ sha256 = $ack.agentSourceSha256 }
            runner = Get-SourceHashRecord $runnerScript
        }
        process = [ordered]@{ pid = [int]$ready.process.Id; startTimeUtc = $ready.processStartTimeUtc; executablePath = $runtimePath }
        mapping = [ordered]@{
            premiumEntry = $premiumEntryText; premiumPayloadSha256 = $premium[0].payloadSha256
            pickEntry = $pickEntryText; pickPayloadSha256 = $pick[0].payloadSha256
            callsiteOffset = $callOffset; callsiteAddress = $callAddressText; callsiteBytes = 'ff5727'
            returnContinuation = $continuationText
        }
        observerResult = [ordered]@{ status = $report.status; matchedEntries = $counts.matchedEntries; matchedRecords = @($report.matchedRecords).Count }
        sourceBindingSha256 = $sourceBindingSha256
    }
    Write-Utf8NoBom $contextPath (ConvertTo-Json -InputObject $context -Depth 18)
    $coordinatorSucceeded = $true
    Write-Output "TRIPLET_ID=$tripletId"
    Write-Output "OBSERVER_ROOT=$observerRootFull"
    Write-Output "CAPTURE_CONTEXT=$contextPath"
    Write-Output "OBSERVER_STATUS=$($report.status)"
} catch {
    throw
} finally {
    if (-not $coordinatorSucceeded) {
        $cleanupReady = $ready
        if (-not $cleanupReady) { $cleanupReady = $script:ready }
        $runnerRequestPath = if ($runnerOutputRoot) { Join-Path $runnerOutputRoot 'pre-scene-probe-request.json' } else { $null }
        $cleanupRequest = $null
        if ($runnerRequestPath -and (Test-Path -LiteralPath $runnerRequestPath -PathType Leaf)) {
            try { $cleanupRequest = Get-Content -LiteralPath $runnerRequestPath -Raw | ConvertFrom-Json }
            catch { Write-Warning "Could not read run ownership record during cleanup: $($_.Exception.Message)" }
        }
        $cleanupRequestOwned = Test-RunnerRequestOwnership $cleanupRequest
        if ($cleanupRequest -and -not $cleanupRequestOwned) {
            Write-Warning 'Runner request does not bind this exact run/runtime/source; cleanup will not use it to release or terminate AARON'
        }

        # The observer treats stop.request as fail-closed and emits no END.
        # Stop and join that exact host before touching AARON or the runner.
        if ($pythonProcess) {
            try {
                $pythonProcess.Refresh()
                if (-not $pythonProcess.HasExited -and (Test-Path -LiteralPath $observerDataRoot -PathType Container) -and
                    -not (Test-Path -LiteralPath $stopPath)) {
                    Write-Utf8NoBom $stopPath "coordinator-failure runId=$runId`n" $true
                }
            } catch { Write-Warning "Could not request Frida observer stop: $($_.Exception.Message)" }
        }
        if ($pythonProcess) {
            try {
                $pythonProcess.Refresh()
                if (-not $pythonProcess.HasExited -and -not $pythonProcess.WaitForExit(10000)) {
                    $null = Stop-ExactOwnedHost $pythonProcess $pythonExecutablePath $pythonStartTimeUtc 'Python observer'
                }
            } catch { Write-Warning "Python observer cleanup watchdog failed: $($_.Exception.Message)" }
        }

        # If READY was accepted, release only that run's exact AARON process,
        # then terminate it on failure after a short bounded grace period.
        if ($cleanupReady -and $cleanupRequestOwned) {
            try {
                if (-not $releaseWritten) {
                    $all = @(Get-Process -Name AARON -ErrorAction SilentlyContinue)
                    $aliases = Get-PathAliases $cleanupRequest.runtimeExecutable
                    $owned = @($all | Where-Object {
                        $_.Id -eq $cleanupReady.process.Id -and $_.Path -in $aliases -and
                        $_.StartTime.ToUniversalTime().ToString('o') -ceq $cleanupReady.processStartTimeUtc
                    })
                    if ($all.Count -eq 1 -and $owned.Count -eq 1 -and -not (Test-Path -LiteralPath $releasePath)) {
                        Write-Utf8NoBom $releasePath "Coordinator cleanup release runId=$runId pid=$($cleanupReady.process.Id)`n" $true
                        $releaseWritten = $true
                    } elseif ($all.Count -gt 0) {
                        Write-Warning 'Cannot release AARON because its READY process identity is no longer exact; leaving release state untouched'
                    }
                }
                if ($releaseWritten) {
                    $cleanupReady.process.Refresh()
                    if (-not $cleanupReady.process.HasExited -and -not $cleanupReady.process.WaitForExit(3000)) {
                        $null = Stop-ExactReadyAaron $cleanupReady $cleanupRequest
                    }
                }
            } catch { Write-Warning "Exact READY AARON cleanup failed: $($_.Exception.Message)" }
        }

        $runnerStillActive = $false
        if ($runner) {
            try {
                $runner.Process.Refresh()
                $runnerStillActive = -not $runner.Process.HasExited
                if ($runnerStillActive -and -not $runner.Process.WaitForExit(20000)) {
                    if ($cleanupReady -and $cleanupRequestOwned) {
                        try { $null = Stop-ExactReadyAaron $cleanupReady $cleanupRequest }
                        catch { Write-Warning "Exact READY AARON process cleanup failed: $($_.Exception.Message)" }
                    } elseif ($cleanupRequestOwned) {
                        try { $null = Stop-RunOwnedAaronFallback $cleanupRequest }
                        catch { Write-Warning "Fallback isolated AARON cleanup failed: $($_.Exception.Message)" }
                    }
                    if (-not $runner.Process.WaitForExit(10000)) {
                        try { $null = Stop-ExactOwnedHost $runner.Process $runnerExecutablePath $runnerStartTimeUtc 'oracle runner' }
                        catch { Write-Warning "Oracle runner cleanup watchdog failed: $($_.Exception.Message)" }
                    }
                }
                $runner.Process.Refresh()
                $runnerStillActive = -not $runner.Process.HasExited
            } catch { Write-Warning "Runner join failed: $($_.Exception.Message)" }
        }
        if (-not $runnerStillActive -and $cleanupRequestOwned) {
            try {
                if ($cleanupReady) { $null = Stop-ExactReadyAaron $cleanupReady $cleanupRequest }
                else { $null = Stop-RunOwnedAaronFallback $cleanupRequest }
            } catch { Write-Warning "Orphaned run-owned AARON cleanup failed: $($_.Exception.Message)" }
        }
    }
}
