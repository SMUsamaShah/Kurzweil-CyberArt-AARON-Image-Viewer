[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$OracleOutputRoot,
    [string]$MetadataPath = 'C:\temp\aaron-select-brush-native-links.txt'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$output = (Resolve-Path -LiteralPath $OracleOutputRoot).Path
$expectedRuntime = Join-Path $output 'runtime\AARON.exe'
$request = Get-Content -LiteralPath (Join-Path $output 'pre-scene-probe-request.json') -Raw | ConvertFrom-Json
if ($request.schemaVersion -ne 1 -or $request.runtimeExecutable -ne $expectedRuntime -or
    $request.pauseSeconds -le 0 -or $request.releaseFile -ne 'C:\temp\aaron-native-code-release.txt' -or
    'aaron-select-brush-native-links.txt' -notin $request.probeOutputNames) {
    throw 'Capture requires this runner-owned paused native metadata probe'
}
$processes = @(Get-Process AARON -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq $expectedRuntime
})
if ($processes.Count -ne 1) { throw 'Expected exactly one AARON process in this oracle output directory' }
$aaronProcessId = $processes[0].Id
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ((Test-Path -LiteralPath $MetadataPath) -and
            (Select-String -LiteralPath $MetadataPath -SimpleMatch 'END select-brush-native-links' -Quiet)) { break }
        Start-Sleep -Milliseconds 100
    }
    $metadata = [IO.File]::ReadAllText($MetadataPath)
    if ($metadata -notmatch 'END select-brush-native-links') { throw 'Native metadata capture is incomplete' }

    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class AaronNativeCodeReader {
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
            if (VirtualQueryEx(process, new IntPtr((long)address), out region, (UIntPtr)Marshal.SizeOf(typeof(Region))) == UIntPtr.Zero)
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return region;
        } finally { CloseHandle(process); }
    }
    public static byte[] Read(uint pid, ulong address, int count) {
        Region region = Query(pid, address);
        if (region.State != 0x1000 || (region.Protect & 0x101) != 0 ||
            address + (ulong)count > (ulong)region.BaseAddress.ToInt64() + region.RegionSize.ToUInt64())
            throw new InvalidOperationException("Requested bytes are outside one readable committed region");
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

    $captureRoot = Join-Path $output 'native-code'
    if (Test-Path -LiteralPath $captureRoot) { throw 'Native code capture directory already exists' }
    [IO.Directory]::CreateDirectory($captureRoot) | Out-Null
    [IO.File]::WriteAllText((Join-Path $captureRoot 'function-object-metadata.txt'), $metadata, [Text.UTF8Encoding]::new($false))
    $records = @()
    foreach ($match in [regex]::Matches($metadata, '(?m)^HEADER name="([A-Z-]+)" bytes=([0-9a-fA-F]{128})\r?$')) {
        $name = $match.Groups[1].Value
        $hex = $match.Groups[2].Value
        $header = [byte[]]@(0..63 | ForEach-Object { [Convert]::ToByte($hex.Substring($_ * 2, 2), 16) })
        $entryCandidate = [BitConverter]::ToUInt32($header, 18)
        $vectorCandidate = [BitConverter]::ToUInt32($header, 30)
        if (($vectorCandidate -band 7) -ne 2) { throw "Unexpected tagged pointer for $name" }
        $base = [uint64]($vectorCandidate - 2)
        $vectorHeaderBytes = [AaronNativeCodeReader]::Read($aaronProcessId, $base, 4)
        $vectorHeader = [BitConverter]::ToUInt32($vectorHeaderBytes, 0)
        # The runtime representation need not retain the PLL's on-disk 0x6c
        # object header. Preserve a bounded readable window around the pointer;
        # a later exact byte match must establish its relationship to the PLL.
        $region = [AaronNativeCodeReader]::Query($aaronProcessId, $entryCandidate)
        $windowBase = [Math]::Max([uint64]$region.BaseAddress.ToInt64(), [uint64]($entryCandidate - 64))
        $available = [uint64]$region.BaseAddress.ToInt64() + $region.RegionSize.ToUInt64() - $windowBase
        $span = [int][Math]::Min(16384, $available)
        $bytes = [AaronNativeCodeReader]::Read($aaronProcessId, $windowBase, $span)
        $fileName = $name.ToLowerInvariant() + '.native-window.bin'
        $filePath = Join-Path $captureRoot $fileName
        [IO.File]::WriteAllBytes($filePath, $bytes)
        $records += [ordered]@{
            name = $name
            functionObjectHeaderHex = $hex
            entryCandidate = ('0x{0:x}' -f $entryCandidate)
            taggedVectorCandidate = ('0x{0:x}' -f $vectorCandidate)
            vectorBaseCandidate = ('0x{0:x}' -f $base)
            vectorCandidateFirstWord = ('0x{0:x}' -f $vectorHeader)
            windowBase = ('0x{0:x}' -f $windowBase)
            bytes = $span
            regionBase = ('0x{0:x}' -f $region.BaseAddress.ToInt64())
            regionSize = $region.RegionSize.ToUInt64()
            regionProtect = ('0x{0:x}' -f $region.Protect)
            file = $fileName
            sha256 = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
    if ($records.Count -ne 5) { throw 'Expected all five selected compiled-function candidates' }
    $manifest = [ordered]@{
        schemaVersion = 1
        method = 'Bounded ReadProcessMemory windows around pointer candidates from function-object metadata; no process memory writes'
        scope = 'Pointer-field semantics, code boundaries and entry candidates require byte matching and instruction/runtime corroboration'
        processId = $aaronProcessId
        runtimeExecutable = $expectedRuntime
        metadataSha256 = (Get-FileHash -LiteralPath (Join-Path $captureRoot 'function-object-metadata.txt') -Algorithm SHA256).Hash.ToLowerInvariant()
        functions = $records
    }
    [IO.File]::WriteAllText((Join-Path $captureRoot 'manifest.json'), ($manifest | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    $manifest | ConvertTo-Json -Depth 8
} finally {
    $stillOwned = Get-Process -Id $aaronProcessId -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -eq $expectedRuntime
    }
    if ($stillOwned -and -not (Test-Path -LiteralPath $request.releaseFile)) {
        [IO.File]::WriteAllText($request.releaseFile, 'Native code snapshot parent finished')
    }
}
