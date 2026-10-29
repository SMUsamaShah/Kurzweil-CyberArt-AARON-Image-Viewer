using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

// Read-only, site-specific no-TF capture for SCREEN-AND-STORE's mapped
// CALL EDI at +0x2a6 and bounded branch edges, ending no later than +0x331.
// Only per-thread WOW64 debug registers are changed; the helper writes no
// AARON code or process memory.
public static class AaronScreenStoreCallReturnBreakpointV2
{
    const uint DBG_CONTINUE = 0x00010002;
    const uint DBG_EXCEPTION_NOT_HANDLED = 0x80010001;
    const uint STATUS_BREAKPOINT = 0x80000003;
    const uint STATUS_WX86_BREAKPOINT = 0x4000001f;
    const uint STATUS_SINGLE_STEP = 0x80000004;
    const uint STATUS_WX86_SINGLE_STEP = 0x4000001e;
    const uint CONTEXT_DEBUG_REGISTERS = 0x00010010;
    const uint CONTEXT_CONTROL_INTEGER_DEBUG = 0x00010013;
    const uint EFLAGS_TF = 0x00000100;
    const uint EFLAGS_ZF = 0x00000040;
    const uint MEM_COMMIT = 0x00001000;
    const uint PAGE_GUARD = 0x00000100;
    const uint PROCESS_ACCESS = 0x00100411; // SYNCHRONIZE | TERMINATE | VM_READ | QUERY_INFORMATION
    const uint THREAD_ACCESS = 0x0000001a; // SUSPEND_RESUME | GET_CONTEXT | SET_CONTEXT
    const uint FILE_READ_ATTRIBUTES = 0x00000080;
    const uint FILE_SHARE_READ = 0x00000001;
    const uint FILE_SHARE_WRITE = 0x00000002;
    const uint FILE_SHARE_DELETE = 0x00000004;
    const uint OPEN_EXISTING = 3;
    const uint FILE_ATTRIBUTE_NORMAL = 0x00000080;
    const uint WAIT_OBJECT_0 = 0x00000000;
    const uint WAIT_TIMEOUT = 0x00000102;
    const uint WAIT_FAILED = 0xffffffff;
    const int PAYLOAD_BYTES = 1224;
    const uint CALL_SITE_OFFSET = 0x2a6;
    const uint CONTINUATION_OFFSET = 0x2a8;
    const uint BRANCH_OFFSET = 0x2b7;
    const uint FALLTHROUGH_OFFSET = 0x2b9;
    const int TARGET_WINDOW_BYTES = 16;
    const int STACK_WINDOW_BYTES = 32;
    const int MAX_DEBUG_EVENTS = 4096;
    const int PHASE_WAIT_SOURCE = 0;
    const int PHASE_WAIT_TARGET = 1;
    const int PHASE_WAIT_RETURN = 2;
    const int PHASE_WAIT_BRANCH = 3;
    const int PHASE_WAIT_SUCCESSOR = 4;
    const int PHASE_WAIT_ROUTE_SOURCE = 5;
    const int PHASE_WAIT_ROUTE_SUCCESSOR = 6;
    const int PHASE_WAIT_JUMP_TARGET = 7;
    const int PHASE_COMPLETE = 8;
    static readonly byte[] ExpectedCallBytes = { 0xff, 0xd7 };
    static readonly byte[] ExpectedContinuationBytes = { 0x89, 0x45, 0xbc };
    static readonly byte[] ExpectedBranchBytes = { 0x75, 0x03 };
    static readonly byte[] ExpectedFallthroughBytes = { 0xff, 0x57, 0x8f };

    [StructLayout(LayoutKind.Explicit, Size = 716)]
    struct Wow64Context
    {
        [FieldOffset(0)] public uint ContextFlags;
        [FieldOffset(4)] public uint Dr0;
        [FieldOffset(8)] public uint Dr1;
        [FieldOffset(12)] public uint Dr2;
        [FieldOffset(16)] public uint Dr3;
        [FieldOffset(20)] public uint Dr6;
        [FieldOffset(24)] public uint Dr7;
        [FieldOffset(156)] public uint Edi;
        [FieldOffset(160)] public uint Esi;
        [FieldOffset(164)] public uint Ebx;
        [FieldOffset(168)] public uint Edx;
        [FieldOffset(172)] public uint Ecx;
        [FieldOffset(176)] public uint Eax;
        [FieldOffset(180)] public uint Ebp;
        [FieldOffset(184)] public uint Eip;
        [FieldOffset(192)] public uint EFlags;
        [FieldOffset(196)] public uint Esp;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MemoryBasicInformation
    {
        public IntPtr BaseAddress;
        public IntPtr AllocationBase;
        public uint AllocationProtect;
        public ushort PartitionId;
        public UIntPtr RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct NativeFileTime
    {
        public uint Low;
        public uint High;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct ByHandleFileInformation
    {
        public uint FileAttributes;
        public NativeFileTime CreationTime;
        public NativeFileTime LastAccessTime;
        public NativeFileTime LastWriteTime;
        public uint VolumeSerialNumber;
        public uint FileSizeHigh;
        public uint FileSizeLow;
        public uint NumberOfLinks;
        public uint FileIndexHigh;
        public uint FileIndexLow;
    }

    struct FileIdentity
    {
        public uint VolumeSerialNumber;
        public ulong FileIndex;
        public string Text
        {
            get { return VolumeSerialNumber.ToString("x8", CultureInfo.InvariantCulture) + ":" + FileIndex.ToString("x16", CultureInfo.InvariantCulture); }
        }
    }

    sealed class ThreadState
    {
        public uint ThreadId;
        public IntPtr Handle;
        public Wow64Context Saved;
        public bool Exited;
        public bool Modified;
        public uint[] Breakpoints = new uint[4];
    }

    sealed class SuspensionReceipt
    {
        public ThreadState State;
        public uint PreviousSuspendCount;
    }

    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenThread(uint access, bool inherit, uint tid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool IsWow64Process(IntPtr process, out bool wow64);
    [DllImport("kernel32.dll", EntryPoint = "QueryFullProcessImageNameW", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder path, ref uint size);
    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    static extern IntPtr CreateFileNative(string path, uint desiredAccess, uint shareMode, IntPtr securityAttributes,
        uint creationDisposition, uint flagsAndAttributes, IntPtr templateFile);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetFileInformationByHandle(IntPtr file, out ByHandleFileInformation information);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr process,
        out NativeFileTime creation, out NativeFileTime exit, out NativeFileTime kernel, out NativeFileTime user);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DebugActiveProcess(uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DebugActiveProcessStop(uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DebugSetProcessKillOnExit(bool kill);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool WaitForDebugEvent(IntPtr debugEvent, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ContinueDebugEvent(uint pid, uint tid, uint continueStatus);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool Wow64GetThreadContext(IntPtr thread, ref Wow64Context context);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool Wow64SetThreadContext(IntPtr thread, ref Wow64Context context);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint Wow64SuspendThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadProcessMemory(IntPtr process,
        IntPtr address, [Out] byte[] bytes, UIntPtr size, out UIntPtr bytesRead);
    [DllImport("kernel32.dll", SetLastError = true)] static extern UIntPtr VirtualQueryEx(IntPtr process,
        IntPtr address, out MemoryBasicInformation information, UIntPtr length);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);

    static void Check(bool value)
    {
        if (!value) throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    static string Hex(uint value) { return "0x" + value.ToString("x8", CultureInfo.InvariantCulture); }
    static string Hex64(ulong value) { return "0x" + value.ToString("x16", CultureInfo.InvariantCulture); }
    static string BytesHex(byte[] value) { return BitConverter.ToString(value).Replace("-", "").ToLowerInvariant(); }
    static IntPtr Address(uint value) { return new IntPtr(unchecked((long)(ulong)value)); }
    static uint ReadU32(IntPtr p, int offset) { return unchecked((uint)Marshal.ReadInt32(p, offset)); }
    static ulong ReadU64(IntPtr p, int offset) { return unchecked((ulong)Marshal.ReadInt64(p, offset)); }
    static bool IsSingleStep(uint code) { return code == STATUS_SINGLE_STEP || code == STATUS_WX86_SINGLE_STEP; }
    static bool IsBreakpoint(uint code) { return code == STATUS_BREAKPOINT || code == STATUS_WX86_BREAKPOINT; }

    static byte[] BytesFromHex(string value)
    {
        string normalized = (value ?? "").Replace(" ", "").Replace("-", "").ToLowerInvariant();
        if (normalized.Length == 0 || (normalized.Length & 1) != 0 ||
            !Regex.IsMatch(normalized, "^[0-9a-f]+$", RegexOptions.CultureInvariant))
            throw new ArgumentException("Expected byte sequence is malformed");
        byte[] bytes = new byte[normalized.Length / 2];
        for (int i = 0; i < bytes.Length; i++)
            bytes[i] = Byte.Parse(normalized.Substring(i * 2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        return bytes;
    }

    static string Sha256(byte[] bytes)
    {
        using (SHA256 sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
    }

    static string Sha256File(string path)
    {
        using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
        using (SHA256 sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }

    static bool JsonHasStringProperty(string json, string property, string value)
    {
        string escaped = (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
        string pattern = "\"" + Regex.Escape(property) + "\"\\s*:\\s*\"" + Regex.Escape(escaped) + "\"";
        return Regex.IsMatch(json, pattern, RegexOptions.CultureInvariant);
    }

    static bool IsOwnedRequest(string requestPath, string requestSha256, string runId,
        string runtimePath, string releasePath)
    {
        try {
            if (String.IsNullOrEmpty(requestPath) || String.IsNullOrEmpty(requestSha256) ||
                !Regex.IsMatch(requestSha256, "^[0-9a-f]{64}$", RegexOptions.CultureInvariant) ||
                String.IsNullOrEmpty(runId) || String.IsNullOrEmpty(runtimePath) || String.IsNullOrEmpty(releasePath))
                return false;
            string requestFull = Path.GetFullPath(requestPath);
            string runtimeFull = Path.GetFullPath(runtimePath);
            string runtimeDirectory = Path.GetDirectoryName(runtimeFull);
            string outputRoot = Path.GetDirectoryName(runtimeDirectory);
            string expectedRequest = Path.GetFullPath(Path.Combine(outputRoot, "pre-scene-probe-request.json"));
            if (!String.Equals(requestFull, expectedRequest, StringComparison.OrdinalIgnoreCase) ||
                !String.Equals(Path.GetFileName(outputRoot), runId, StringComparison.Ordinal) ||
                !String.Equals(runtimeFull, Path.GetFullPath(Path.Combine(outputRoot, "runtime", "AARON.exe")),
                    StringComparison.OrdinalIgnoreCase) || !File.Exists(requestFull))
                return false;
            byte[] bytes = File.ReadAllBytes(requestFull);
            if (!String.Equals(Sha256(bytes), requestSha256, StringComparison.Ordinal)) return false;
            string json = new UTF8Encoding(false, true).GetString(bytes);
            return JsonHasStringProperty(json, "runId", runId) &&
                JsonHasStringProperty(json, "runtimeExecutable", runtimeFull) &&
                JsonHasStringProperty(json, "releaseFile", releasePath);
        } catch { return false; }
    }

    static string ProcessImagePath(IntPtr process)
    {
        StringBuilder text = new StringBuilder(32768);
        uint size = (uint)text.Capacity;
        Check(QueryFullProcessImageName(process, 0, text, ref size));
        if (size == 0 || size > text.Capacity)
            throw new InvalidOperationException("Process image path query returned an invalid length");
        return text.ToString();
    }

    static FileIdentity ReadFileIdentity(string path)
    {
        string fullPath = Path.GetFullPath(path);
        IntPtr file = CreateFileNative(fullPath, FILE_READ_ATTRIBUTES,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, IntPtr.Zero,
            OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, IntPtr.Zero);
        if (file == IntPtr.Zero || file == new IntPtr(-1))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to open executable path for read-only file identity: " + fullPath);
        try
        {
            ByHandleFileInformation information;
            Check(GetFileInformationByHandle(file, out information));
            return new FileIdentity
            {
                VolumeSerialNumber = information.VolumeSerialNumber,
                FileIndex = ((ulong)information.FileIndexHigh << 32) | information.FileIndexLow
            };
        }
        finally
        {
            if (!CloseHandle(file)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to close read-only executable identity handle");
        }
    }

    static bool ProcessImageMatchesFileIdentity(IntPtr process, string suppliedPath,
        Dictionary<string, object> result, string prefix)
    {
        string observedPath = ProcessImagePath(process);
        string suppliedFullPath = Path.GetFullPath(suppliedPath);
        bool exactPath = String.Equals(Path.GetFullPath(observedPath), suppliedFullPath,
            StringComparison.OrdinalIgnoreCase);
        result[prefix + "ObservedProcessImagePath"] = observedPath;
        result[prefix + "SuppliedProcessImagePath"] = suppliedFullPath;
        result[prefix + "ExactPathStringMatch"] = exactPath;
        FileIdentity observedIdentity = ReadFileIdentity(observedPath);
        FileIdentity suppliedIdentity = ReadFileIdentity(suppliedFullPath);
        bool sameFile = observedIdentity.VolumeSerialNumber == suppliedIdentity.VolumeSerialNumber &&
            observedIdentity.FileIndex == suppliedIdentity.FileIndex;
        result[prefix + "ObservedFileIdentity"] = observedIdentity.Text;
        result[prefix + "SuppliedFileIdentity"] = suppliedIdentity.Text;
        result[prefix + "FileIdentityMatches"] = sameFile;
        if (String.Equals(prefix, "preRelease", StringComparison.Ordinal))
        {
            string initialObservedIdentity = result["initialObservedFileIdentity"] as string;
            string initialSuppliedIdentity = result["initialSuppliedFileIdentity"] as string;
            bool sameAsInitial = sameFile &&
                String.Equals(observedIdentity.Text, initialObservedIdentity, StringComparison.Ordinal) &&
                String.Equals(suppliedIdentity.Text, initialSuppliedIdentity, StringComparison.Ordinal);
            result["preReleaseSameIdentityAsInitial"] = sameAsInitial;
            return sameAsInitial;
        }
        return sameFile;
    }

    static ulong ProcessCreationFileTime(IntPtr process)
    {
        NativeFileTime creation, exit, kernel, user;
        Check(GetProcessTimes(process, out creation, out exit, out kernel, out user));
        return ((ulong)creation.High << 32) | creation.Low;
    }

    static Wow64Context GetContext(IntPtr thread, uint flags)
    {
        Wow64Context context = new Wow64Context();
        context.ContextFlags = flags;
        Check(Wow64GetThreadContext(thread, ref context));
        return context;
    }

    static void SetDebugContext(IntPtr thread, Wow64Context context)
    {
        context.ContextFlags = CONTEXT_DEBUG_REGISTERS;
        Check(Wow64SetThreadContext(thread, ref context));
    }

    static bool DebugRegistersEqual(Wow64Context a, Wow64Context b)
    {
        return a.Dr0 == b.Dr0 && a.Dr1 == b.Dr1 && a.Dr2 == b.Dr2 &&
            a.Dr3 == b.Dr3 && a.Dr6 == b.Dr6 && a.Dr7 == b.Dr7;
    }

    static uint GetDr(Wow64Context c, int slot)
    {
        if (slot == 0) return c.Dr0;
        if (slot == 1) return c.Dr1;
        if (slot == 2) return c.Dr2;
        return c.Dr3;
    }

    static void SetDr(ref Wow64Context c, int slot, uint value)
    {
        if (slot == 0) c.Dr0 = value;
        else if (slot == 1) c.Dr1 = value;
        else if (slot == 2) c.Dr2 = value;
        else c.Dr3 = value;
    }

    static MemoryBasicInformation QueryRegion(IntPtr process, uint address)
    {
        MemoryBasicInformation info = new MemoryBasicInformation();
        if (VirtualQueryEx(process, Address(address), out info,
            (UIntPtr)Marshal.SizeOf(typeof(MemoryBasicInformation))).ToUInt64() == 0)
            throw new Win32Exception(Marshal.GetLastWin32Error());
        ulong start = unchecked((ulong)info.BaseAddress.ToInt64());
        ulong size = info.RegionSize.ToUInt64();
        if (size == 0 || start > UInt64.MaxValue - size || start + size > 0x100000000UL ||
            (ulong)address < start || (ulong)address >= start + size)
            throw new InvalidOperationException("VirtualQueryEx returned an invalid WOW64 region");
        uint protection = info.Protect & 0xffu;
        bool readable = protection == 0x02u || protection == 0x04u || protection == 0x08u ||
            protection == 0x20u || protection == 0x40u || protection == 0x80u;
        if (info.State != MEM_COMMIT || (info.Protect & PAGE_GUARD) != 0 || !readable)
            throw new InvalidOperationException("Address is not in a committed readable region");
        return info;
    }

    static List<Dictionary<string, object>> ReadableRegions(IntPtr process, uint address, int count)
    {
        if (count <= 0 || (ulong)address + (ulong)count > 0x100000000UL)
            throw new InvalidOperationException("Requested memory range exceeds the WOW64 address space");
        ulong end = (ulong)address + (ulong)count;
        ulong cursor = address;
        List<Dictionary<string, object>> regions = new List<Dictionary<string, object>>();
        while (cursor < end) {
            MemoryBasicInformation info = QueryRegion(process, checked((uint)cursor));
            ulong start = unchecked((ulong)info.BaseAddress.ToInt64());
            ulong regionEnd = start + info.RegionSize.ToUInt64();
            if (regionEnd <= cursor) throw new InvalidOperationException("Memory region did not advance the read cursor");
            regions.Add(RegionRecord(info));
            cursor = Math.Min(end, regionEnd);
        }
        return regions;
    }

    static byte[] ReadExact(IntPtr process, uint address, int count)
    {
        ReadableRegions(process, address, count);
        byte[] bytes = new byte[count];
        UIntPtr read;
        if (!ReadProcessMemory(process, Address(address), bytes, (UIntPtr)count, out read))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        if (read.ToUInt64() != (ulong)count)
            throw new IOException("ReadProcessMemory returned a short read");
        return bytes;
    }

    static Dictionary<string, object> RegionRecord(MemoryBasicInformation info)
    {
        return new Dictionary<string, object> {
            { "baseAddress", Hex64(unchecked((ulong)info.BaseAddress.ToInt64())) },
            { "allocationBase", Hex64(unchecked((ulong)info.AllocationBase.ToInt64())) },
            { "regionSize", Hex64(info.RegionSize.ToUInt64()) },
            { "state", Hex(info.State) }, { "protection", Hex(info.Protect) },
            { "type", Hex(info.Type) }
        };
    }

    static string ReadStackHex(IntPtr process, uint esp, int count)
    {
        return BytesHex(ReadExact(process, esp, count));
    }

    static string ReadStackDword(IntPtr process, uint esp)
    {
        byte[] bytes = ReadExact(process, esp, 4);
        return Hex(BitConverter.ToUInt32(bytes, 0));
    }

    static Dictionary<string, object> RegisterRecord(Wow64Context c, uint tid)
    {
        return new Dictionary<string, object> {
            { "threadId", tid }, { "eip", Hex(c.Eip) }, { "esp", Hex(c.Esp) },
            { "eax", Hex(c.Eax) }, { "ebx", Hex(c.Ebx) }, { "ecx", Hex(c.Ecx) },
            { "edx", Hex(c.Edx) }, { "esi", Hex(c.Esi) }, { "edi", Hex(c.Edi) },
            { "ebp", Hex(c.Ebp) }, { "eflags", Hex(c.EFlags) },
            { "dr0", Hex(c.Dr0) }, { "dr1", Hex(c.Dr1) }, { "dr2", Hex(c.Dr2) },
            { "dr3", Hex(c.Dr3) }, { "dr6", Hex(c.Dr6) }, { "dr7", Hex(c.Dr7) }
        };
    }

    static Dictionary<string, object> DebugStateRecord(uint tid, Wow64Context c)
    {
        return new Dictionary<string, object> {
            { "threadId", tid }, { "dr0", Hex(c.Dr0) }, { "dr1", Hex(c.Dr1) },
            { "dr2", Hex(c.Dr2) }, { "dr3", Hex(c.Dr3) },
            { "dr6", Hex(c.Dr6) }, { "dr7", Hex(c.Dr7) }
        };
    }

    static Dictionary<string, object> ExceptionRecord(IntPtr evt, uint tid)
    {
        uint count = Math.Min(ReadU32(evt, 40), 15u);
        List<string> info = new List<string>();
        for (int i = 0; i < count; i++) info.Add(Hex64(ReadU64(evt, 48 + i * 8)));
        return new Dictionary<string, object> {
            { "code", Hex(ReadU32(evt, 16)) }, { "flags", Hex(ReadU32(evt, 20)) },
            { "exceptionRecord", Hex64(ReadU64(evt, 24)) },
            { "exceptionAddress", Hex64(ReadU64(evt, 32)) },
            { "parameterCount", count }, { "information", info },
            { "firstChance", ReadU32(evt, 168) }, { "threadId", tid }
        };
    }

    static Dictionary<string, object> NewResult(uint pid, string runtimePath, string processPath,
        ulong expectedCreationFileTimeUtc, uint liveEntry, string payloadPath, string payloadSha256,
        uint callSite, uint branchAddress, uint fallthroughAddress, uint takenAddress, string releaseFile,
        string requestPath, string requestSha256, string runId, int seconds)
    {
        return new Dictionary<string, object> {
            { "schemaVersion", 2 }, { "captureMethod", "WOW64 hardware execute breakpoints; TF remains clear" },
            { "processId", pid }, { "expectedRuntimePath", runtimePath }, { "processImagePath", processPath },
            { "expectedProcessCreationFileTimeUtc", expectedCreationFileTimeUtc },
            { "observedProcessCreationFileTimeUtc", null },
            { "initialObservedProcessImagePath", null }, { "initialSuppliedProcessImagePath", null },
            { "initialExactPathStringMatch", null }, { "initialObservedFileIdentity", null },
            { "initialSuppliedFileIdentity", null }, { "initialFileIdentityMatches", null },
            { "preReleaseObservedProcessImagePath", null }, { "preReleaseSuppliedProcessImagePath", null },
            { "preReleaseExactPathStringMatch", null }, { "preReleaseObservedFileIdentity", null },
            { "preReleaseSuppliedFileIdentity", null }, { "preReleaseFileIdentityMatches", null },
            { "preReleaseSameIdentityAsInitial", null },
            { "liveEntry", Hex(liveEntry) }, { "payloadPath", payloadPath }, { "payloadSha256", payloadSha256 },
            { "payloadBytes", PAYLOAD_BYTES }, { "callSiteOffset", Hex(CALL_SITE_OFFSET) },
            { "callSiteAddress", Hex(callSite) }, { "callBytesHex", BytesHex(ExpectedCallBytes) },
            { "continuationOffset", Hex(CONTINUATION_OFFSET) },
            { "continuationAddress", Hex(callSite + 2u) },
            { "continuationBytesHex", BytesHex(ExpectedContinuationBytes) },
            { "branchOffset", Hex(BRANCH_OFFSET) }, { "branchAddress", Hex(branchAddress) },
            { "branchBytesHex", BytesHex(ExpectedBranchBytes) },
            { "fallthroughOffset", Hex(FALLTHROUGH_OFFSET) },
            { "fallthroughAddress", Hex(fallthroughAddress) },
            { "fallthroughBytesHex", BytesHex(ExpectedFallthroughBytes) },
            { "takenAddress", Hex(takenAddress) },
            { "branchDisplacementHex", "0x" + ExpectedBranchBytes[1].ToString("x2", CultureInfo.InvariantCulture) },
            { "branchEflags", null }, { "branchZeroFlag", null },
            { "predictedSuccessorAddress", null }, { "observedSuccessorAddress", null },
            { "observedSuccessorSlot", null },
            { "releaseMarkerPath", releaseFile }, { "requestPath", requestPath },
            { "requestSha256", requestSha256 }, { "runId", runId },
            { "captureSeconds", seconds }, { "debuggerAttached", false },
            { "breakpointsArmedBeforeRelease", false }, { "readyPauseReleased", false },
            { "selectedThreadId", null }, { "sourceEsp", null }, { "sourceEbp", null }, { "ediTarget", null },
            { "targetWindowAtSourceHex", null }, { "captureCompleted", false },
            { "pathOutcome", null }, { "reached331", false }, { "terminalInstructionNotYetExecuted", false },
            { "routeInstructionRechecks", new List<Dictionary<string, object>>() },
            { "debugRegistersRestored", false }, { "detachSucceeded", false },
            { "accepted", false }, { "terminalReason", "preflight" }, { "captureError", null },
            { "preArmPayloadComparison", null },
            { "events", new List<Dictionary<string, object>>() },
            { "debugStateTransitions", new List<Dictionary<string, object>>() },
            { "debugEvents", new List<Dictionary<string, object>>() },
            { "threadStateSnapshots", new List<Dictionary<string, object>>() },
            { "debugStateRestorations", new List<Dictionary<string, object>>() },
            { "cleanupErrors", new List<string>() },
            { "cleanupReceipt", new Dictionary<string, object> {
                { "restoreAttempted", false }, { "restoreSucceeded", false },
                { "pendingEventContinued", false }, { "detachAttempted", false },
                { "detached", false }, { "killOnExitFallbackUsed", false },
                { "processTerminationConfirmed", false }, { "releaseMarkerCreated", false }
            } }
        };
    }

    static void SetFailure(Dictionary<string, object> result, string message, string reason)
    {
        if (result["captureError"] == null) result["captureError"] = message;
        result["terminalReason"] = reason;
    }

    static void VerifyPayload(IntPtr process, uint liveEntry, byte[] payload,
        Dictionary<string, object> result, string phase)
    {
        byte[] observed = ReadExact(process, liveEntry, PAYLOAD_BYTES);
        bool exact = observed.Length == payload.Length;
        for (int i = 0; exact && i < payload.Length; i++)
            if (observed[i] != payload[i]) exact = false;
        Dictionary<string, object> record = new Dictionary<string, object> {
            { "phase", phase }, { "address", Hex(liveEntry) }, { "bytesRequested", PAYLOAD_BYTES },
            { "bytesRead", observed.Length }, { "observedSha256", Sha256(observed) },
            { "expectedSha256", Sha256(payload) }, { "exactMatch", exact },
            { "regions", ReadableRegions(process, liveEntry, PAYLOAD_BYTES) }
        };
        if (phase == "before-attach") result["preArmPayloadComparison"] = record;
        else {
            List<Dictionary<string, object>> checks = (List<Dictionary<string, object>>)result["payloadRechecks"];
            checks.Add(record);
        }
        if (!exact) throw new InvalidOperationException("The complete 1,224-byte live SCREEN-AND-STORE payload differs from the mapped PLL payload at " + phase);
    }

    static void VerifyCallAndContinuation(IntPtr process, uint callSite, Dictionary<string, object> result,
        string phase)
    {
        byte[] call = ReadExact(process, callSite, ExpectedCallBytes.Length);
        byte[] continuation = ReadExact(process, checked(callSite + 2u), ExpectedContinuationBytes.Length);
        if (BytesHex(call) != BytesHex(ExpectedCallBytes))
            throw new InvalidOperationException("Live CALL EDI bytes changed at " + phase);
        if (BytesHex(continuation) != BytesHex(ExpectedContinuationBytes))
            throw new InvalidOperationException("Live continuation bytes changed at " + phase);
        Dictionary<string, object> record = new Dictionary<string, object> {
            { "phase", phase }, { "callAddress", Hex(callSite) }, { "callBytesHex", BytesHex(call) },
            { "continuationAddress", Hex(callSite + 2u) }, { "continuationBytesHex", BytesHex(continuation) }
        };
        List<Dictionary<string, object>> checks = (List<Dictionary<string, object>>)result["instructionRechecks"];
        checks.Add(record);
    }

    static readonly uint[] RouteOffsets = { 0x2bc, 0x2c3, 0x2c5, 0x2c7, 0x2cd, 0x324, 0x331, 0x363 };
    static readonly string[] RouteBytes = { "8bd8", "755f", "3bc2", "0f8496000000", "eb62", "8b9f9bfeffff", "8b467e", "8b45e4" };

    static void VerifyBoundedRoute(IntPtr process, uint entry, Dictionary<string, object> result, string phase)
    {
        List<Dictionary<string, object>> sites = new List<Dictionary<string, object>>();
        for (int i = 0; i < RouteOffsets.Length; i++) {
            uint address = checked(entry + RouteOffsets[i]);
            string observed = BytesHex(ReadExact(process, address, RouteBytes[i].Length / 2));
            if (observed != RouteBytes[i]) throw new InvalidOperationException("Bounded route instruction differs at " + Hex(RouteOffsets[i]) + " during " + phase);
            sites.Add(new Dictionary<string, object> { { "offset", Hex(RouteOffsets[i]) }, { "address", Hex(address) }, { "bytesHex", observed } });
        }
        // Relative branch targets are derived from exact signed displacement bytes.
        byte[] jnz = ReadExact(process, checked(entry + 0x2c3u), 2);
        byte[] jz = ReadExact(process, checked(entry + 0x2c7u), 6);
        byte[] jmp = ReadExact(process, checked(entry + 0x2cdu), 2);
        if ((long)entry + 0x2c3 + 2 + unchecked((sbyte)jnz[1]) != (long)entry + 0x324 ||
            (long)entry + 0x2c7 + 6 + BitConverter.ToInt32(jz, 2) != (long)entry + 0x363 ||
            (long)entry + 0x2cd + 2 + unchecked((sbyte)jmp[1]) != (long)entry + 0x331)
            throw new InvalidOperationException("Bounded route relative-target derivation failed");
        ((List<Dictionary<string, object>>)result["routeInstructionRechecks"]).Add(
            new Dictionary<string, object> { { "phase", phase }, { "sites", sites }, { "allExact", true } });
    }

    static void CompleteBoundedRoute(Dictionary<string, object> result, string outcome)
    {
        result["pathOutcome"] = outcome;
        result["reached331"] = outcome == "direct-331";
        result["terminalInstructionNotYetExecuted"] = true;
        result["captureCompleted"] = true;
        result["terminalReason"] = "bounded-route-" + outcome;
    }

    static void VerifyBranchSequence(IntPtr process, uint branchAddress, uint fallthroughAddress,
        uint takenAddress, Dictionary<string, object> result, string phase)
    {
        VerifyBoundedRoute(process, branchAddress - BRANCH_OFFSET, result, phase);
        byte[] branch = ReadExact(process, branchAddress, ExpectedBranchBytes.Length);
        byte[] fallthrough = ReadExact(process, fallthroughAddress, ExpectedFallthroughBytes.Length);
        int displacement = unchecked((sbyte)branch[1]);
        long derivedTaken = (long)branchAddress + branch.Length + displacement;
        if (BytesHex(branch) != BytesHex(ExpectedBranchBytes) ||
            BytesHex(fallthrough) != BytesHex(ExpectedFallthroughBytes) ||
            fallthroughAddress != checked(branchAddress + (uint)branch.Length) ||
            derivedTaken < 0 || derivedTaken > UInt32.MaxValue || (uint)derivedTaken != takenAddress)
            throw new InvalidOperationException("Live JNZ or its first fall-through instruction differs from the mapped payload at " + phase);
        Dictionary<string, object> record = new Dictionary<string, object> {
            { "phase", phase }, { "branchAddress", Hex(branchAddress) },
            { "branchBytesHex", BytesHex(branch) }, { "branchLength", branch.Length },
            { "fallthroughAddress", Hex(fallthroughAddress) },
            { "fallthroughBytesHex", BytesHex(fallthrough) },
            { "signedDisplacement", displacement }, { "derivedTakenAddress", Hex((uint)derivedTaken) },
            { "expectedTakenAddress", Hex(takenAddress) }
        };
        List<Dictionary<string, object>> checks = (List<Dictionary<string, object>>)result["instructionRechecks"];
        checks.Add(record);
    }

    static ThreadState OpenAndTrack(uint tid, IntPtr process, Dictionary<uint, ThreadState> threads,
        List<Dictionary<string, object>> snapshots)
    {
        ThreadState existing;
        if (threads.TryGetValue(tid, out existing)) return existing;
        IntPtr handle = OpenThread(THREAD_ACCESS, false, tid);
        Check(handle != IntPtr.Zero);
        try {
            Wow64Context saved = GetContext(handle, CONTEXT_CONTROL_INTEGER_DEBUG);
            if ((saved.EFlags & EFLAGS_TF) != 0)
                throw new InvalidOperationException("Thread already has TF set; no-TF capture refuses to continue");
            if ((saved.Dr7 & 0xffu) != 0)
                throw new InvalidOperationException("Thread already has an active DR0-DR3 hardware breakpoint");
            saved.ContextFlags = CONTEXT_DEBUG_REGISTERS;
            ThreadState state = new ThreadState { ThreadId = tid, Handle = handle, Saved = saved };
            threads.Add(tid, state);
            snapshots.Add(new Dictionary<string, object> {
                { "threadId", tid }, { "savedDebugState", DebugStateRecord(tid, saved) },
                { "activeSlotsBeforeHelper", false }, { "trapFlagBeforeHelper", false }
            });
            return state;
        } catch {
            if (!threads.ContainsKey(tid)) CloseHandle(handle);
            throw;
        }
    }

    static Dictionary<string, object> ArmSlots(ThreadState state, uint tid, uint dr0, uint dr1,
        bool useDr1)
    {
        Wow64Context c = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
        if ((c.EFlags & EFLAGS_TF) != 0)
            throw new InvalidOperationException("Thread trap flag became set; no-TF capture refuses to arm");
        uint currentEnable = c.Dr7 & 0xffu;
        if (useDr1) {
            if (!state.Modified || currentEnable != 0x01u || c.Dr0 != state.Breakpoints[0] ||
                state.Breakpoints[1] != 0)
                throw new InvalidOperationException("The source stop no longer has exactly this helper's source breakpoint enabled");
        } else if (currentEnable != 0) {
            throw new InvalidOperationException("Thread acquired an active hardware breakpoint before helper arm");
        }
        uint lowEnableMask = useDr1 ? 0x0fu : 0x03u;
        c.Dr7 &= ~0xffu;
        c.Dr7 &= 0x0000ffffu;
        c.Dr7 &= ~lowEnableMask;
        c.Dr7 &= ~(0xffff0000u);
        SetDr(ref c, 0, dr0);
        if (useDr1) SetDr(ref c, 1, dr1);
        c.Dr6 = 0;
        c.Dr7 |= 0x01u;
        if (useDr1) c.Dr7 |= 0x04u;
        state.Breakpoints[0] = dr0;
        state.Breakpoints[1] = useDr1 ? dr1 : 0;
        state.Modified = true;
        SetDebugContext(state.Handle, c);
        Wow64Context readback = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
        uint expectedLow = useDr1 ? 0x05u : 0x01u;
        if (GetDr(readback, 0) != dr0 || (useDr1 && GetDr(readback, 1) != dr1) ||
            (readback.Dr7 & 0xffu) != expectedLow || (readback.Dr7 & 0xffff0000u) != 0 ||
            (readback.Dr6 & 0xe00fu) != 0 || (readback.EFlags & EFLAGS_TF) != 0)
            throw new InvalidOperationException("Hardware execute-breakpoint arm readback did not match the requested local-only slots");
        return new Dictionary<string, object> {
            { "threadId", tid }, { "eip", Hex(readback.Eip) }, { "eflags", Hex(readback.EFlags) },
            { "dr0", Hex(readback.Dr0) }, { "dr1", Hex(readback.Dr1) },
            { "dr6", Hex(readback.Dr6) }, { "dr7", Hex(readback.Dr7) },
            { "expectedDr7LowByte", Hex(expectedLow) }
        };
    }

    static Dictionary<string, object> DisableDr0(ThreadState state, uint tid, uint continuation)
    {
        Wow64Context c = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
        if ((c.EFlags & EFLAGS_TF) != 0)
            throw new InvalidOperationException("Thread trap flag became set while disabling the target breakpoint");
        c.Dr7 &= ~0x03u;
        c.Dr7 &= ~(0x0fu << 16);
        c.Dr6 = 0;
        state.Breakpoints[0] = 0;
        state.Breakpoints[1] = continuation;
        SetDebugContext(state.Handle, c);
        Wow64Context readback = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
        if ((readback.Dr7 & 0xffu) != 0x04u || (readback.Dr7 & 0xffff0000u) != 0 ||
            (readback.Dr6 & 0xe00fu) != 0 || (readback.EFlags & EFLAGS_TF) != 0 ||
            GetDr(readback, 1) != continuation)
            throw new InvalidOperationException("DR0 disable/DR1 return-guard readback did not match");
        return new Dictionary<string, object> {
            { "threadId", tid }, { "dr0", Hex(readback.Dr0) }, { "dr1", Hex(readback.Dr1) },
            { "dr6", Hex(readback.Dr6) }, { "dr7", Hex(readback.Dr7) },
            { "targetSlotDisabled", true }, { "returnGuardStillArmed", true }
        };
    }

    static Dictionary<string, object> TransitionSlots(ThreadState state, uint tid,
        uint expectedLow, uint expectedDr0, uint expectedDr1,
        uint newDr0, uint newDr1, bool useDr1, string phase,
        Dictionary<string, object> result)
    {
        Wow64Context c = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
        if ((c.EFlags & EFLAGS_TF) != 0)
            throw new InvalidOperationException("Thread trap flag became set during a breakpoint transition");
        bool expectedSlot0 = (expectedLow & 0x03u) != 0;
        bool expectedSlot1 = (expectedLow & 0x0cu) != 0;
        if (!state.Modified || (c.Dr7 & 0xffu) != expectedLow ||
            (c.Dr7 & 0xffff0000u) != 0 || GetDr(c, 0) != expectedDr0 || GetDr(c, 1) != expectedDr1 ||
            state.Breakpoints[0] != (expectedSlot0 ? expectedDr0 : 0u) ||
            state.Breakpoints[1] != (expectedSlot1 ? expectedDr1 : 0u))
            throw new InvalidOperationException("Breakpoint transition did not start from the exact helper-owned debug-register state at " + phase);

        c.Dr7 &= ~0xffu;
        c.Dr7 &= 0x0000ffffu;
        c.Dr7 &= ~(0xffff0000u);
        SetDr(ref c, 0, newDr0);
        SetDr(ref c, 1, useDr1 ? newDr1 : 0u);
        c.Dr6 = 0;
        c.Dr7 |= 0x01u;
        if (useDr1) c.Dr7 |= 0x04u;
        state.Breakpoints[0] = newDr0;
        state.Breakpoints[1] = useDr1 ? newDr1 : 0u;
        SetDebugContext(state.Handle, c);

        Wow64Context readback = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
        uint newLow = useDr1 ? 0x05u : 0x01u;
        if (GetDr(readback, 0) != newDr0 || GetDr(readback, 1) != (useDr1 ? newDr1 : 0u) ||
            (readback.Dr7 & 0xffu) != newLow || (readback.Dr7 & 0xffff0000u) != 0 ||
            (readback.Dr6 & 0xe00fu) != 0 || (readback.EFlags & EFLAGS_TF) != 0)
            throw new InvalidOperationException("Breakpoint transition readback did not match the requested local-only slots at " + phase);
        Dictionary<string, object> record = new Dictionary<string, object> {
            { "phase", phase }, { "threadId", tid },
            { "oldDr0", Hex(expectedDr0) }, { "oldDr1", Hex(expectedDr1) },
            { "oldDr7LowByte", Hex(expectedLow) },
            { "newDr0", Hex(readback.Dr0) }, { "newDr1", Hex(readback.Dr1) },
            { "newDr6", Hex(readback.Dr6) }, { "newDr7", Hex(readback.Dr7) },
            { "newDr7LowByte", Hex(newLow) }, { "trapFlagClear", true }
        };
        ((List<Dictionary<string, object>>)result["debugStateTransitions"]).Add(record);
        return record;
    }

    static void CheckBreakpointCause(Wow64Context c, int slot, uint expectedLow,
        uint expectedDr0, uint expectedDr1)
    {
        uint expectedDr6 = 1u << slot;
        if ((c.Dr6 & 0xe00fu) != expectedDr6 || GetDr(c, slot) != c.Eip ||
            (c.Dr7 & 0xffu) != expectedLow || (c.Dr7 & 0xffff0000u) != 0 ||
            GetDr(c, 0) != expectedDr0 || (expectedLow == 0x05u && GetDr(c, 1) != expectedDr1) ||
            (expectedLow == 0x04u && GetDr(c, 1) != expectedDr1) ||
            (c.EFlags & EFLAGS_TF) != 0)
            throw new InvalidOperationException("Event is not the expected no-TF hardware execute-breakpoint cause");
    }

    static void CloseDebugEventHandles(IntPtr evt, uint kind)
    {
        if (kind == 2) {
            IntPtr thread = Marshal.ReadIntPtr(evt, 16);
            if (thread != IntPtr.Zero) CloseHandle(thread);
        } else if (kind == 3) {
            IntPtr file = Marshal.ReadIntPtr(evt, 16);
            IntPtr process = Marshal.ReadIntPtr(evt, 24);
            IntPtr thread = Marshal.ReadIntPtr(evt, 32);
            if (file != IntPtr.Zero) CloseHandle(file);
            if (process != IntPtr.Zero) CloseHandle(process);
            if (thread != IntPtr.Zero) CloseHandle(thread);
        } else if (kind == 6) {
            IntPtr file = Marshal.ReadIntPtr(evt, 16);
            if (file != IntPtr.Zero) CloseHandle(file);
        }
    }

    static Dictionary<string, object> DebugEventRecord(IntPtr evt, uint kind, uint pid, uint tid)
    {
        Dictionary<string, object> record = new Dictionary<string, object> {
            { "eventType", kind }, { "processId", pid }, { "threadId", tid }
        };
        if (kind == 1) record["exception"] = ExceptionRecord(evt, tid);
        return record;
    }

    static bool WriteReleaseAtomically(string releasePath, uint pid, string runId,
        string requestSha256, ulong processCreationFileTimeUtc)
    {
        if (File.Exists(releasePath)) throw new IOException("Runner READY release marker already exists; preserving it");
        string full = Path.GetFullPath(releasePath);
        string directory = Path.GetDirectoryName(full);
        string temporary = full + ".screen-store-" + Guid.NewGuid().ToString("N") + ".tmp";
        try {
            byte[] content = new UTF8Encoding(false).GetBytes(
                "SCREEN-AND-STORE no-TF capture armed for PID " +
                pid.ToString(CultureInfo.InvariantCulture) + " run " + runId + Environment.NewLine +
                "requestSha256 " + requestSha256 + Environment.NewLine +
                "processCreationFileTimeUtc " + processCreationFileTimeUtc.ToString(CultureInfo.InvariantCulture) + Environment.NewLine);
            using (FileStream stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                stream.Write(content, 0, content.Length);
                stream.Flush(true);
            }
            File.Move(temporary, full);
            return true;
        } finally {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    static void AddDebugEvent(List<Dictionary<string, object>> debugEvents,
        IntPtr evt, uint kind, uint pid, uint tid)
    {
        if (debugEvents.Count >= MAX_DEBUG_EVENTS)
            throw new InvalidOperationException("Debug-event diagnostic cap reached");
        debugEvents.Add(DebugEventRecord(evt, kind, pid, tid));
    }

    static void AddBreakpointEvent(Dictionary<string, object> result, string kind, int slot,
        uint tid, IntPtr evt, Wow64Context c, string stackHex, Dictionary<string, object> details)
    {
        List<Dictionary<string, object>> events = (List<Dictionary<string, object>>)result["events"];
        events.Add(new Dictionary<string, object> {
            { "order", events.Count + 1 }, { "kind", kind }, { "slot", slot },
            { "processId", ReadU32(evt, 4) }, { "threadId", tid },
            { "exception", ExceptionRecord(evt, tid) }, { "registers", RegisterRecord(c, tid) },
            { "stackAtEspHex", stackHex }, { "details", details }
        });
    }

    static void RestoreThreadsSafely(IntPtr process, Dictionary<uint, ThreadState> threads,
        uint keepThreadId, bool restoreAll, List<Dictionary<string, object>> restorations)
    {
        if (WaitForSingleObject(process, 0) != WAIT_TIMEOUT)
            throw new InvalidOperationException("Owned AARON process is not confirmed live for debug-state restoration");
        List<SuspensionReceipt> suspended = new List<SuspensionReceipt>();
        try {
            foreach (KeyValuePair<uint, ThreadState> item in threads) {
                ThreadState state = item.Value;
                if (state.Exited || state.Handle == IntPtr.Zero) continue;
                uint previous = Wow64SuspendThread(state.Handle);
                if (previous == UInt32.MaxValue || previous >= UInt32.MaxValue - 1u)
                    throw new InvalidOperationException("WOW64 suspend failed or returned an unsafe suspend count for thread " + item.Key);
                suspended.Add(new SuspensionReceipt { State = state, PreviousSuspendCount = previous });
            }
        } catch {
            for (int i = suspended.Count - 1; i >= 0; i--) {
                SuspensionReceipt receipt = suspended[i];
                uint previous = ResumeThread(receipt.State.Handle);
                if (previous == UInt32.MaxValue || previous != receipt.PreviousSuspendCount + 1u)
                    throw new InvalidOperationException("Could not unwind helper suspension after a partial thread suspend failure");
            }
            throw;
        }

        bool restoreFailed = false;
        foreach (SuspensionReceipt receipt in suspended) {
            ThreadState state = receipt.State;
            if (!restoreAll && state.ThreadId == keepThreadId) continue;
            try {
                SetDebugContext(state.Handle, state.Saved);
                Wow64Context actual = GetContext(state.Handle, CONTEXT_DEBUG_REGISTERS);
                bool exact = DebugRegistersEqual(state.Saved, actual);
                restorations.Add(new Dictionary<string, object> {
                    { "threadId", state.ThreadId }, { "saved", DebugStateRecord(state.ThreadId, state.Saved) },
                    { "restored", DebugStateRecord(state.ThreadId, actual) }, { "exactMatch", exact },
                    { "previousSuspendCount", receipt.PreviousSuspendCount }
                });
                if (!exact) restoreFailed = true;
                else {
                    state.Modified = false;
                    state.Breakpoints = new uint[4];
                }
            } catch (Exception error) {
                restoreFailed = true;
                restorations.Add(new Dictionary<string, object> {
                    { "threadId", state.ThreadId }, { "exactMatch", false },
                    { "error", error.GetType().Name + ": " + error.Message }
                });
            }
        }
        if (restoreFailed)
            throw new InvalidOperationException("Exact debug-register restoration failed; helper suspensions are retained for fail-closed abort");

        for (int i = suspended.Count - 1; i >= 0; i--) {
            SuspensionReceipt receipt = suspended[i];
            uint previous = ResumeThread(receipt.State.Handle);
            if (previous == UInt32.MaxValue || previous != receipt.PreviousSuspendCount + 1u)
                throw new InvalidOperationException("Resume count did not preserve the prior suspend count for thread " + receipt.State.ThreadId);
        }
    }

    static void ReleaseAndContinuePending(IntPtr evt, uint pid, uint tid, uint status,
        Dictionary<string, object> result)
    {
        if (!ContinueDebugEvent(pid, tid, status))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        Dictionary<string, object> receipt = (Dictionary<string, object>)result["cleanupReceipt"];
        receipt["pendingEventContinued"] = true;
    }

    static void AddCleanupError(Dictionary<string, object> result, string value)
    {
        ((List<string>)result["cleanupErrors"]).Add(value);
    }

    public static Dictionary<string, object> Capture(uint pid, string expectedRuntimePath,
        string processImagePath, string requestPath, string requestSha256, string runId,
        ulong expectedCreationFileTimeUtc,
        uint liveEntry, string payloadPath, string payloadSha256, uint callSiteOffset,
        string callBytesHex, string continuationBytesHex, string releaseFile, int seconds)
    {
        if (IntPtr.Size != 8) throw new InvalidOperationException("Use fresh 64-bit PowerShell for WOW64 debugging");
        if (pid == 0 || liveEntry == 0 || expectedCreationFileTimeUtc == 0)
            throw new ArgumentOutOfRangeException("pid/liveEntry/processCreation");
        if (callSiteOffset != CALL_SITE_OFFSET)
            throw new ArgumentException("callSiteOffset must be exactly 0x2a6");
        if (String.IsNullOrEmpty(expectedRuntimePath) || String.IsNullOrEmpty(processImagePath) ||
            String.IsNullOrEmpty(payloadPath) || String.IsNullOrEmpty(releaseFile))
            throw new ArgumentException("Runtime, payload and release paths are required");
        if (seconds < 10 || seconds > 600) throw new ArgumentOutOfRangeException("seconds");
        byte[] suppliedCall = BytesFromHex(callBytesHex);
        byte[] suppliedContinuation = BytesFromHex(continuationBytesHex);
        if (BytesHex(suppliedCall) != BytesHex(ExpectedCallBytes) ||
            BytesHex(suppliedContinuation) != BytesHex(ExpectedContinuationBytes))
            throw new ArgumentException("Expected instruction bytes must be FF D7 and continuation 89 45 BC");
        if (!Regex.IsMatch(payloadSha256 ?? "", "^[0-9a-f]{64}$", RegexOptions.CultureInvariant) ||
            !Regex.IsMatch(requestSha256 ?? "", "^[0-9a-f]{64}$", RegexOptions.CultureInvariant))
            throw new ArgumentException("Payload and runner-request SHA-256 values must be lowercase hex");
        if (!File.Exists(payloadPath)) throw new FileNotFoundException("Mapped full payload is missing", payloadPath);
        byte[] payload = File.ReadAllBytes(payloadPath);
        if (payload.Length != PAYLOAD_BYTES || !String.Equals(Sha256(payload), payloadSha256, StringComparison.Ordinal))
            throw new InvalidOperationException("Mapped SCREEN-AND-STORE payload length or SHA-256 does not match the supplied identity");
        if ((ulong)liveEntry + PAYLOAD_BYTES > 0x100000000UL)
            throw new InvalidOperationException("Live function payload exceeds the WOW64 address space");
        if (BytesHex(new byte[] { payload[CALL_SITE_OFFSET], payload[CALL_SITE_OFFSET + 1] }) != BytesHex(ExpectedCallBytes) ||
            BytesHex(new byte[] { payload[CONTINUATION_OFFSET], payload[CONTINUATION_OFFSET + 1], payload[CONTINUATION_OFFSET + 2] }) !=
                BytesHex(ExpectedContinuationBytes) ||
            BytesHex(new byte[] { payload[BRANCH_OFFSET], payload[BRANCH_OFFSET + 1] }) != BytesHex(ExpectedBranchBytes) ||
            BytesHex(new byte[] { payload[FALLTHROUGH_OFFSET], payload[FALLTHROUGH_OFFSET + 1], payload[FALLTHROUGH_OFFSET + 2] }) !=
                BytesHex(ExpectedFallthroughBytes))
            throw new InvalidOperationException("Mapped payload does not contain the exact call, continuation, JNZ and fall-through instruction signatures");
        uint callAddress = checked(liveEntry + CALL_SITE_OFFSET);
        uint branchAddress = checked(liveEntry + BRANCH_OFFSET);
        uint fallthroughAddress = checked(liveEntry + FALLTHROUGH_OFFSET);
        int branchDisplacement = unchecked((sbyte)payload[BRANCH_OFFSET + 1]);
        long takenAddressLong = (long)branchAddress + ExpectedBranchBytes.Length + branchDisplacement;
        if (fallthroughAddress != checked(branchAddress + (uint)ExpectedBranchBytes.Length) ||
            takenAddressLong < 0 || takenAddressLong > UInt32.MaxValue)
            throw new InvalidOperationException("Mapped JNZ successor address is outside the WOW64 address space");
        uint takenAddress = (uint)takenAddressLong;
        if ((ulong)callAddress + 5UL > 0x100000000UL)
            throw new InvalidOperationException("Call/continuation boundary exceeds the WOW64 address space");
        if ((ulong)branchAddress + (ulong)ExpectedBranchBytes.Length > 0x100000000UL ||
            (ulong)fallthroughAddress + (ulong)ExpectedFallthroughBytes.Length > 0x100000000UL)
            throw new InvalidOperationException("JNZ/successor boundary exceeds the WOW64 address space");
        if (File.Exists(releaseFile))
            throw new IOException("READY release marker already exists; preserving it");

        for (int i = 0; i < RouteOffsets.Length; i++) {
            byte[] signature = new byte[RouteBytes[i].Length / 2];
            Array.Copy(payload, (int)RouteOffsets[i], signature, 0, signature.Length);
            if (BytesHex(signature) != RouteBytes[i]) throw new InvalidOperationException("Mapped bounded-route signature differs at " + Hex(RouteOffsets[i]));
        }
        Dictionary<string, object> result = NewResult(pid, Path.GetFullPath(expectedRuntimePath),
            Path.GetFullPath(processImagePath), expectedCreationFileTimeUtc, liveEntry, Path.GetFullPath(payloadPath),
            payloadSha256, callAddress, branchAddress, fallthroughAddress, takenAddress,
            Path.GetFullPath(releaseFile), Path.GetFullPath(requestPath),
            requestSha256, runId, seconds);
        result["payloadRechecks"] = new List<Dictionary<string, object>>();
        result["instructionRechecks"] = new List<Dictionary<string, object>>();
        Exception failure = null;
        Thread debugger = new Thread(delegate() {
            try {
                CaptureOnDebuggerThread(pid, expectedRuntimePath, processImagePath, requestPath,
                    requestSha256, runId, expectedCreationFileTimeUtc, liveEntry, payload, callAddress,
                    branchAddress, fallthroughAddress, takenAddress, releaseFile, seconds, result);
            } catch (Exception error) {
                failure = error;
            }
        });
        debugger.Name = "AARON SCREEN-AND-STORE bounded-route no-TF capture v2";
        debugger.IsBackground = true;
        debugger.Start();
        debugger.Join();
        if (failure != null) {
            SetFailure(result, failure.GetType().Name + ": " + failure.Message, "helper-error");
        }
        List<Dictionary<string, object>> events = (List<Dictionary<string, object>>)result["events"];
        List<string> cleanupErrors = (List<string>)result["cleanupErrors"];
        result["accepted"] = result["captureCompleted"].Equals(true) &&
            result["readyPauseReleased"].Equals(true) && result["debugRegistersRestored"].Equals(true) &&
            result["detachSucceeded"].Equals(true) && cleanupErrors.Count == 0 && result["captureError"] == null &&
            ((Object.Equals(result["pathOutcome"], "alternate-2b9") && events.Count == 5) ||
             (Object.Equals(result["pathOutcome"], "alternate-324") && events.Count == 7) ||
             (Object.Equals(result["pathOutcome"], "alternate-363") && events.Count == 9) ||
             (Object.Equals(result["pathOutcome"], "direct-331") && events.Count == 10));
        if (!result["accepted"].Equals(true) && result["terminalReason"].Equals("capturing"))
            result["terminalReason"] = "incomplete";
        return result;
    }

    static void CaptureOnDebuggerThread(uint pid, string expectedRuntimePath,
        string processImagePath, string requestPath, string requestSha256, string runId,
        ulong expectedCreationFileTimeUtc,
        uint liveEntry, byte[] payload, uint callAddress, uint branchAddress,
        uint fallthroughAddress, uint takenAddress, string releaseFile, int seconds,
        Dictionary<string, object> result)
    {
        IntPtr process = IntPtr.Zero;
        IntPtr debugEvent = IntPtr.Zero;
        Dictionary<uint, ThreadState> threads = new Dictionary<uint, ThreadState>();
        List<Dictionary<string, object>> snapshots =
            (List<Dictionary<string, object>>)result["threadStateSnapshots"];
        List<Dictionary<string, object>> events =
            (List<Dictionary<string, object>>)result["events"];
        List<Dictionary<string, object>> restorations =
            (List<Dictionary<string, object>>)result["debugStateRestorations"];
        List<Dictionary<string, object>> debugEvents =
            (List<Dictionary<string, object>>)result["debugEvents"];
        List<string> cleanupErrors = (List<string>)result["cleanupErrors"];
        Dictionary<string, object> cleanup = (Dictionary<string, object>)result["cleanupReceipt"];
        uint continuation = checked(callAddress + 2u);
        bool attached = false, released = false, processExited = false;
        bool pending = false, anyModified = false, restoreSucceeded = false;
        bool restorationFailure = false, terminationConfirmed = false;
        bool restoreBeforeRejectedEvent = false;
        uint branchEflags = 0, expectedSuccessorAddress = 0;
        int expectedSuccessorSlot = -1;
        int routeIndex = 0;
        uint pendingPid = 0, pendingTid = 0, pendingStatus = DBG_EXCEPTION_NOT_HANDLED;
        int phase = PHASE_WAIT_SOURCE, debugEventCount = 0;
        uint ownerTid = 0, sourceEsp = 0, sourceEbp = 0, targetAddress = 0;
        byte[] targetWindowAtSource = null;
        Stopwatch timer = Stopwatch.StartNew();
        try {
            process = OpenProcess(PROCESS_ACCESS, false, pid);
            Check(process != IntPtr.Zero);
            if (WaitForSingleObject(process, 0) != WAIT_TIMEOUT)
                throw new InvalidOperationException("Runner-owned AARON process is not live");
            ulong creationTime = ProcessCreationFileTime(process);
            result["observedProcessCreationFileTimeUtc"] = creationTime;
            if (creationTime != expectedCreationFileTimeUtc)
                throw new InvalidOperationException("PID creation identity differs from the supplied source-process identity");
            if (!ProcessImageMatchesFileIdentity(process, processImagePath, result, "initial"))
                throw new InvalidOperationException("PID image file identity differs from the supplied executable; inspect the recorded observed path and file identities");
            bool wow64;
            Check(IsWow64Process(process, out wow64));
            if (!wow64) throw new InvalidOperationException("Selected process is not a WOW64 x86 process");
            if (!IsOwnedRequest(requestPath, requestSha256, runId, expectedRuntimePath, releaseFile))
                throw new InvalidOperationException("Runner-owned positive-pause request failed its hash/path/run binding");
            if (File.Exists(releaseFile))
                throw new InvalidOperationException("READY release marker appeared before source breakpoints were armed");

            VerifyPayload(process, liveEntry, payload, result, "before-attach");
            VerifyCallAndContinuation(process, callAddress, result, "before-attach");
            VerifyBranchSequence(process, branchAddress, fallthroughAddress, takenAddress, result, "before-attach");
            debugEvent = Marshal.AllocHGlobal(1024);
            Check(DebugActiveProcess(pid));
            attached = true;
            result["debuggerAttached"] = true;
            result["terminalReason"] = "attached-awaiting-arm";
            Check(DebugSetProcessKillOnExit(false));

            while (timer.Elapsed.TotalSeconds < seconds && phase != PHASE_COMPLETE &&
                result["captureError"] == null && !processExited) {
                if (!WaitForDebugEvent(debugEvent, 100)) {
                    int waitError = Marshal.GetLastWin32Error();
                    if (waitError == 121 || waitError == 1460) continue;
                    throw new Win32Exception(waitError);
                }
                pending = true;
                bool validatedOwnedBreakpointEvent = false;
                pendingPid = ReadU32(debugEvent, 4);
                pendingTid = ReadU32(debugEvent, 8);
                pendingStatus = DBG_EXCEPTION_NOT_HANDLED;
                uint eventKind = ReadU32(debugEvent, 0);
                debugEventCount++;
                if (debugEventCount > MAX_DEBUG_EVENTS)
                    throw new InvalidOperationException("Bounded debug-event count exceeded");
                if (pendingPid != pid)
                    throw new InvalidOperationException("Unexpected debug-event process ID");
                AddDebugEvent(debugEvents, debugEvent, eventKind, pendingPid, pendingTid);
                CloseDebugEventHandles(debugEvent, eventKind);

                try {
                    if (eventKind == 2 || eventKind == 3) {
                        ThreadState state = OpenAndTrack(pendingTid, process, threads, snapshots);
                        if (released && phase == PHASE_WAIT_SOURCE && !state.Modified) {
                            anyModified = true;
                            ArmSlots(state, pendingTid, callAddress, 0, false);
                        }
                        pendingStatus = DBG_CONTINUE;
                    } else if (eventKind == 4) {
                        ThreadState state;
                        if (threads.TryGetValue(pendingTid, out state)) {
                            state.Exited = true;
                            if (state.Handle != IntPtr.Zero) CloseHandle(state.Handle);
                            state.Handle = IntPtr.Zero;
                            threads.Remove(pendingTid);
                            if (pendingTid == ownerTid && ownerTid != 0)
                                throw new InvalidOperationException("Selected thread exited before the branch-successor event");
                        }
                        pendingStatus = DBG_CONTINUE;
                    } else if (eventKind == 5) {
                        processExited = true;
                        result["terminalReason"] = "process-exit";
                        SetFailure(result, "AARON exited before the branch-successor capture completed", "process-exit");
                        pendingStatus = DBG_CONTINUE;
                    } else if (eventKind == 1) {
                        uint exceptionCode = ReadU32(debugEvent, 16);
                        uint firstChance = ReadU32(debugEvent, 168);
                        if (IsBreakpoint(exceptionCode) && !released && !result["breakpointsArmedBeforeRelease"].Equals(true)) {
                            if (firstChance != 1)
                                throw new InvalidOperationException("Initial attach breakpoint was not first chance");
                            if (threads.Count == 0)
                                throw new InvalidOperationException("No AARON threads were available to arm");
                            VerifyPayload(process, liveEntry, payload, result, "immediately-before-arm");
                            VerifyCallAndContinuation(process, callAddress, result, "immediately-before-arm");
                            VerifyBranchSequence(process, branchAddress, fallthroughAddress, takenAddress, result, "immediately-before-arm");
                            int armedCount = 0;
                            foreach (KeyValuePair<uint, ThreadState> item in threads) {
                                if (item.Value.Exited || item.Value.Handle == IntPtr.Zero) continue;
                                if (item.Value.Modified)
                                    throw new InvalidOperationException("A thread was unexpectedly modified before the initial arm");
                                anyModified = true;
                                ArmSlots(item.Value, item.Key, callAddress, 0, false);
                                armedCount++;
                            }
                            if (armedCount == 0)
                                throw new InvalidOperationException("No live thread accepted the source execute breakpoint");
                            anyModified = true;
                            if (!IsOwnedRequest(requestPath, requestSha256, runId, expectedRuntimePath, releaseFile))
                                throw new InvalidOperationException("Runner request changed before arming was released");
                            if (!ProcessImageMatchesFileIdentity(process, processImagePath, result, "preRelease"))
                                throw new InvalidOperationException("PID image file identity changed before release; inspect the recorded observed path and file identities");
                            if (ProcessCreationFileTime(process) != expectedCreationFileTimeUtc || File.Exists(releaseFile))
                                throw new InvalidOperationException("Process creation or release-marker precondition changed before arming was released");
                            result["breakpointsArmedBeforeRelease"] = true;
                            WriteReleaseAtomically(releaseFile, pid, runId, requestSha256,
                                expectedCreationFileTimeUtc);
                            result["releaseMarkerText"] = File.ReadAllText(releaseFile, new UTF8Encoding(false, true));
                            result["releaseMarkerSha256"] = Sha256File(releaseFile);
                            released = true;
                            result["readyPauseReleased"] = true;
                            cleanup["releaseMarkerCreated"] = true;
                            result["terminalReason"] = "released-awaiting-source";
                            pendingStatus = DBG_CONTINUE;
                        } else if (IsSingleStep(exceptionCode)) {
                            if (firstChance != 1)
                                throw new InvalidOperationException("A non-first-chance single-step/debug event was observed");
                            ThreadState state;
                            if (!threads.TryGetValue(pendingTid, out state) || state.Exited || state.Handle == IntPtr.Zero)
                                throw new InvalidOperationException("Single-step event came from an untracked thread");
                            Wow64Context c = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
                            if ((c.EFlags & EFLAGS_TF) != 0)
                                throw new InvalidOperationException("TF became set during the no-TF hardware-breakpoint experiment");
                            if (phase == PHASE_WAIT_SOURCE) {
                                if (!released || !state.Modified || state.Breakpoints[0] != callAddress)
                                    throw new InvalidOperationException("Source event arrived before release or without this helper's source breakpoint");
                                CheckBreakpointCause(c, 0, 0x01u, callAddress, 0);
                                validatedOwnedBreakpointEvent = true;
                                if (c.Eip != callAddress)
                                    throw new InvalidOperationException("Source event EIP differs from the live CALL EDI address");
                                pendingStatus = DBG_CONTINUE;
                                VerifyPayload(process, liveEntry, payload, result, "source-hit");
                                VerifyCallAndContinuation(process, callAddress, result, "source-hit");
                                VerifyBranchSequence(process, branchAddress, fallthroughAddress, takenAddress, result, "source-hit");
                                if (c.Esp < 4u)
                                    throw new InvalidOperationException("Pre-call ESP cannot hold the CALL return address");
                                targetAddress = c.Edi;
                                if (targetAddress == 0)
                                    throw new InvalidOperationException("Pre-call EDI is zero");
                                if (targetAddress == continuation)
                                    throw new InvalidOperationException("EDI target aliases the return continuation and would produce an ambiguous DR0/DR1 cause");
                                targetWindowAtSource = ReadExact(process, targetAddress, TARGET_WINDOW_BYTES);
                                List<Dictionary<string, object>> targetRegions =
                                    ReadableRegions(process, targetAddress, TARGET_WINDOW_BYTES);
                                string sourceStack = ReadStackHex(process, c.Esp, STACK_WINDOW_BYTES);
                                Dictionary<string, object> details = new Dictionary<string, object> {
                                    { "callAddress", Hex(callAddress) }, { "callBytesHex", BytesHex(ExpectedCallBytes) },
                                    { "continuationAddress", Hex(continuation) },
                                    { "continuationBytesHex", BytesHex(ExpectedContinuationBytes) },
                                    { "preCallEsp", Hex(c.Esp) }, { "ediTarget", Hex(targetAddress) },
                                    { "callerFrameEbp", Hex(c.Ebp) },
                                    { "targetWindowBytes", TARGET_WINDOW_BYTES },
                                    { "targetWindowAtSourceHex", BytesHex(targetWindowAtSource) },
                                    { "targetReadableRegions", targetRegions }
                                };
                                AddBreakpointEvent(result, "source-hit", 0, pendingTid, debugEvent, c, sourceStack, details);
                                ownerTid = pendingTid;
                                sourceEsp = c.Esp;
                                sourceEbp = c.Ebp;
                                result["selectedThreadId"] = ownerTid;
                                result["sourceEsp"] = Hex(sourceEsp);
                                result["sourceEbp"] = Hex(sourceEbp);
                                result["ediTarget"] = Hex(targetAddress);
                                result["targetWindowAtSourceHex"] = BytesHex(targetWindowAtSource);
                                try { RestoreThreadsSafely(process, threads, ownerTid, false, restorations); }
                                catch {
                                    restorationFailure = true;
                                    throw;
                                }
                                anyModified = true;
                                ArmSlots(state, ownerTid, targetAddress, continuation, true);
                                phase = PHASE_WAIT_TARGET;
                                result["terminalReason"] = "source-hit-awaiting-target";
                            } else if (pendingTid != ownerTid) {
                                throw new InvalidOperationException("Hardware event came from a thread other than the selected source thread");
                            } else if (phase == PHASE_WAIT_TARGET) {
                                CheckBreakpointCause(c, 0, 0x05u, targetAddress, continuation);
                                validatedOwnedBreakpointEvent = true;
                                if (c.Eip != targetAddress)
                                    throw new InvalidOperationException("Target-entry EIP differs from the sampled pre-call EDI");
                                VerifyPayload(process, liveEntry, payload, result, "target-entry");
                                VerifyCallAndContinuation(process, callAddress, result, "target-entry");
                                VerifyBranchSequence(process, branchAddress, fallthroughAddress, takenAddress, result, "target-entry");
                                if (sourceEsp < 4u || c.Esp != sourceEsp - 4u)
                                    throw new InvalidOperationException("Target-entry ESP is not exactly source ESP minus the pushed return address");
                                if (c.Ebp != sourceEbp)
                                    throw new InvalidOperationException("Target-entry EBP differs from the original caller-frame marker");
                                string returnAtEsp = ReadStackDword(process, c.Esp);
                                if (!String.Equals(returnAtEsp, Hex(continuation), StringComparison.Ordinal))
                                    throw new InvalidOperationException("Target-entry [ESP] does not equal callsite+2");
                                byte[] targetAtEntry = ReadExact(process, targetAddress, TARGET_WINDOW_BYTES);
                                if (!BytesHex(targetAtEntry).Equals(BytesHex(targetWindowAtSource), StringComparison.Ordinal))
                                    throw new InvalidOperationException("Dynamic EDI target bytes changed between source observation and target entry");
                                string targetStack = ReadStackHex(process, c.Esp, STACK_WINDOW_BYTES);
                                MemoryBasicInformation targetRegion = QueryRegion(process, targetAddress);
                                Dictionary<string, object> details = new Dictionary<string, object> {
                                    { "ediTarget", Hex(targetAddress) }, { "returnAddressAtEsp", returnAtEsp },
                                    { "expectedReturnAddress", Hex(continuation) }, { "sourceEsp", Hex(sourceEsp) },
                                    { "targetEsp", Hex(c.Esp) }, { "espEqualsSourceMinusFour", true },
                                    { "callerFrameEbp", Hex(sourceEbp) }, { "targetEbp", Hex(c.Ebp) },
                                    { "targetEbpMatchesSourceFrame", true },
                                    { "targetWindowAtSourceHex", BytesHex(targetWindowAtSource) },
                                    { "targetWindowAtEntryHex", BytesHex(targetAtEntry) },
                                    { "targetRegion", RegionRecord(targetRegion) },
                                    { "pageExecuteProtectionRequired", false }
                                };
                                AddBreakpointEvent(result, "target-entry", 0, pendingTid, debugEvent, c, targetStack, details);
                                DisableDr0(state, ownerTid, continuation);
                                // This is our validated first-chance hardware breakpoint. Mark it handled
                                // after disarming the source slot so Windows does not redeliver it as a
                                // second-chance exception when the observer resumes the target.
                                pendingStatus = DBG_CONTINUE;
                                phase = PHASE_WAIT_RETURN;
                                result["terminalReason"] = "target-entry-awaiting-return";
                            } else if (phase == PHASE_WAIT_RETURN) {
                                CheckBreakpointCause(c, 1, 0x04u, targetAddress, continuation);
                                validatedOwnedBreakpointEvent = true;
                                if (c.Eip != continuation)
                                    throw new InvalidOperationException("Return event EIP differs from callsite+2");
                                if (c.Ebp != sourceEbp)
                                    throw new InvalidOperationException("Call continuation EBP differs from the original caller-frame marker");
                                VerifyPayload(process, liveEntry, payload, result, "call-return");
                                VerifyCallAndContinuation(process, callAddress, result, "call-return");
                                VerifyBranchSequence(process, branchAddress, fallthroughAddress, takenAddress, result, "call-return");
                                string returnStack = ReadStackHex(process, c.Esp, STACK_WINDOW_BYTES);
                                Dictionary<string, object> details = new Dictionary<string, object> {
                                    { "callAddress", Hex(callAddress) }, { "continuationAddress", Hex(continuation) },
                                    { "sourceEsp", Hex(sourceEsp) }, { "returnEsp", Hex(c.Esp) },
                                    { "returnEspDeltaFromSource", unchecked(c.Esp - sourceEsp) },
                                    { "callerFrameEbp", Hex(sourceEbp) }, { "returnEbp", Hex(c.Ebp) },
                                    { "returnEbpMatchesSourceFrame", true },
                                    { "stackCleanupSizeAssumed", false },
                                    { "captureBeforeContinuationInstruction", true },
                                    { "localStoreExecuted", false },
                                    { "eaxReturnValue", Hex(c.Eax) }, { "eflagsAtReturn", Hex(c.EFlags) }
                                };
                                AddBreakpointEvent(result, "call-return", 1, pendingTid, debugEvent, c, returnStack, details);
                                TransitionSlots(state, ownerTid, 0x04u, targetAddress, continuation,
                                    branchAddress, 0, false, "return-to-branch", result);
                                phase = PHASE_WAIT_BRANCH;
                                result["terminalReason"] = "call-return-awaiting-branch";
                                pendingStatus = DBG_CONTINUE;
                            } else if (phase == PHASE_WAIT_BRANCH) {
                                CheckBreakpointCause(c, 0, 0x01u, branchAddress, 0);
                                validatedOwnedBreakpointEvent = true;
                                if (c.Eip != branchAddress)
                                    throw new InvalidOperationException("JNZ event EIP differs from SCREEN-AND-STORE +0x2b7");
                                if (c.Ebp != sourceEbp)
                                    throw new InvalidOperationException("JNZ caller-frame EBP differs from the original source frame");
                                VerifyPayload(process, liveEntry, payload, result, "branch-hit");
                                VerifyCallAndContinuation(process, callAddress, result, "branch-hit");
                                VerifyBranchSequence(process, branchAddress, fallthroughAddress, takenAddress, result, "branch-hit");
                                branchEflags = c.EFlags;
                                bool zeroFlag = (branchEflags & EFLAGS_ZF) != 0;
                                expectedSuccessorSlot = zeroFlag ? 0 : 1;
                                expectedSuccessorAddress = zeroFlag ? fallthroughAddress : takenAddress;
                                result["branchEflags"] = Hex(branchEflags);
                                result["branchZeroFlag"] = zeroFlag;
                                result["predictedSuccessorAddress"] = Hex(expectedSuccessorAddress);
                                string branchStack = ReadStackHex(process, c.Esp, STACK_WINDOW_BYTES);
                                Dictionary<string, object> details = new Dictionary<string, object> {
                                    { "branchAddress", Hex(branchAddress) },
                                    { "branchBytesHex", BytesHex(ExpectedBranchBytes) },
                                    { "branchEflags", Hex(branchEflags) }, { "zeroFlag", zeroFlag },
                                    { "predictedSuccessorAddress", Hex(expectedSuccessorAddress) },
                                    { "predictedSuccessorSlot", expectedSuccessorSlot },
                                    { "fallthroughAddress", Hex(fallthroughAddress) },
                                    { "fallthroughBytesHex", BytesHex(ExpectedFallthroughBytes) },
                                    { "takenAddress", Hex(takenAddress) },
                                    { "signedDisplacement", unchecked((sbyte)ExpectedBranchBytes[1]) },
                                    { "callerFrameEbp", Hex(sourceEbp) }, { "branchEbp", Hex(c.Ebp) },
                                    { "branchEsp", Hex(c.Esp) }, { "ediAtBranch", Hex(c.Edi) }
                                };
                                AddBreakpointEvent(result, "branch-hit", 0, pendingTid, debugEvent, c, branchStack, details);
                                TransitionSlots(state, ownerTid, 0x01u, branchAddress, 0,
                                    fallthroughAddress, takenAddress, true, "branch-to-successors", result);
                                phase = PHASE_WAIT_SUCCESSOR;
                                result["terminalReason"] = "branch-hit-awaiting-successor";
                                pendingStatus = DBG_CONTINUE;
                            } else if (phase == PHASE_WAIT_SUCCESSOR) {
                                uint fired = c.Dr6 & 0x03u;
                                int observedSlot = fired == 0x01u ? 0 : (fired == 0x02u ? 1 : -1);
                                if (observedSlot < 0)
                                    throw new InvalidOperationException("Successor event did not identify exactly one owned DR0/DR1 cause");
                                CheckBreakpointCause(c, observedSlot, 0x05u, fallthroughAddress, takenAddress);
                                validatedOwnedBreakpointEvent = true;
                                if (observedSlot != expectedSuccessorSlot || c.Eip != expectedSuccessorAddress)
                                    throw new InvalidOperationException("Observed successor EIP/slot disagrees with the JNZ ZF-predicted edge");
                                if (c.Ebp != sourceEbp)
                                    throw new InvalidOperationException("JNZ successor caller-frame EBP differs from the original source frame");
                                VerifyPayload(process, liveEntry, payload, result, "branch-successor");
                                VerifyCallAndContinuation(process, callAddress, result, "branch-successor");
                                VerifyBranchSequence(process, branchAddress, fallthroughAddress, takenAddress, result, "branch-successor");
                                string successorStack = ReadStackHex(process, c.Esp, STACK_WINDOW_BYTES);
                                Dictionary<string, object> details = new Dictionary<string, object> {
                                    { "branchAddress", Hex(branchAddress) },
                                    { "branchEflags", Hex(branchEflags) },
                                    { "zeroFlagAtBranch", (branchEflags & EFLAGS_ZF) != 0 },
                                    { "predictedSuccessorAddress", Hex(expectedSuccessorAddress) },
                                    { "predictedSuccessorSlot", expectedSuccessorSlot },
                                    { "observedSuccessorAddress", Hex(c.Eip) },
                                    { "observedSuccessorSlot", observedSlot },
                                    { "observedEdgeMatchesPrediction", true },
                                    { "callerFrameEbp", Hex(sourceEbp) }, { "successorEbp", Hex(c.Ebp) },
                                    { "successorEsp", Hex(c.Esp) }, { "ediAtSuccessor", Hex(c.Edi) },
                                    { "fallthroughAddress", Hex(fallthroughAddress) },
                                    { "takenAddress", Hex(takenAddress) }
                                };
                                if (c.Eip == fallthroughAddress) {
                                    uint pointerSlotAddress = unchecked(c.Edi - 0x71u);
                                    details["indirectCallPointerSlotAddress"] = Hex(pointerSlotAddress);
                                    try {
                                        byte[] pointerBytes = ReadExact(process, pointerSlotAddress, 4);
                                        details["indirectCallPointerBytesHex"] = BytesHex(pointerBytes);
                                        details["indirectCallTargetCandidate"] = Hex(BitConverter.ToUInt32(pointerBytes, 0));
                                        details["indirectCallTargetProvenExecuted"] = false;
                                    } catch (Exception pointerReadError) {
                                        details["indirectCallPointerReadError"] = pointerReadError.GetType().Name + ": " + pointerReadError.Message;
                                    }
                                }
                                AddBreakpointEvent(result, "branch-successor", observedSlot, pendingTid, debugEvent, c, successorStack, details);
                                result["observedSuccessorAddress"] = Hex(c.Eip);
                                result["observedSuccessorSlot"] = observedSlot;
                                if (observedSlot == 0) {
                                    CompleteBoundedRoute(result, "alternate-2b9");
                                    phase = PHASE_COMPLETE;
                                } else {
                                    TransitionSlots(state, ownerTid, 0x05u, fallthroughAddress, takenAddress,
                                        checked(liveEntry + 0x2c3u), 0, false, "successor-to-tag-branch", result);
                                    phase = PHASE_WAIT_ROUTE_SOURCE;
                                }
                                pendingStatus = DBG_CONTINUE;
                            } else if (phase == PHASE_WAIT_ROUTE_SOURCE) {
                                uint source = checked(liveEntry + (routeIndex == 0 ? 0x2c3u : 0x2c7u));
                                uint fall = checked(liveEntry + (routeIndex == 0 ? 0x2c5u : 0x2cdu));
                                uint taken = checked(liveEntry + (routeIndex == 0 ? 0x324u : 0x363u));
                                string kind = routeIndex == 0 ? "tag-branch" : "equality-branch";
                                CheckBreakpointCause(c, 0, 0x01u, source, 0);
                                validatedOwnedBreakpointEvent = true;
                                if (c.Eip != source || c.Ebp != sourceEbp) throw new InvalidOperationException("Bounded branch source EIP/frame mismatch");
                                VerifyPayload(process, liveEntry, payload, result, kind);
                                VerifyCallAndContinuation(process, callAddress, result, kind);
                                VerifyBranchSequence(process, branchAddress, fallthroughAddress, takenAddress, result, kind);
                                branchEflags = c.EFlags;
                                bool zeroFlag = (branchEflags & EFLAGS_ZF) != 0;
                                bool take = routeIndex == 0 ? !zeroFlag : zeroFlag;
                                expectedSuccessorSlot = take ? 1 : 0;
                                expectedSuccessorAddress = take ? taken : fall;
                                Dictionary<string, object> details = new Dictionary<string, object> {
                                    { "branchAddress", Hex(source) }, { "branchBytesHex", routeIndex == 0 ? "755f" : "0f8496000000" },
                                    { "branchEflags", Hex(branchEflags) }, { "zeroFlag", zeroFlag }, { "branchTaken", take },
                                    { "predictedSuccessorSlot", expectedSuccessorSlot }, { "predictedSuccessorAddress", Hex(expectedSuccessorAddress) },
                                    { "fallthroughAddress", Hex(fall) }, { "takenAddress", Hex(taken) }
                                };
                                AddBreakpointEvent(result, kind, 0, pendingTid, debugEvent, c, ReadStackHex(process, c.Esp, STACK_WINDOW_BYTES), details);
                                TransitionSlots(state, ownerTid, 0x01u, source, 0, fall, taken, true, kind + "-to-successors", result);
                                phase = PHASE_WAIT_ROUTE_SUCCESSOR;
                                pendingStatus = DBG_CONTINUE;
                            } else if (phase == PHASE_WAIT_ROUTE_SUCCESSOR) {
                                uint source = checked(liveEntry + (routeIndex == 0 ? 0x2c3u : 0x2c7u));
                                uint fall = checked(liveEntry + (routeIndex == 0 ? 0x2c5u : 0x2cdu));
                                uint taken = checked(liveEntry + (routeIndex == 0 ? 0x324u : 0x363u));
                                string kind = routeIndex == 0 ? "tag-successor" : "equality-successor";
                                uint fired = c.Dr6 & 0x03u;
                                int observedSlot = fired == 1u ? 0 : (fired == 2u ? 1 : -1);
                                if (observedSlot < 0) throw new InvalidOperationException("Route successor does not identify exactly one slot");
                                CheckBreakpointCause(c, observedSlot, 0x05u, fall, taken);
                                validatedOwnedBreakpointEvent = true;
                                if (c.Eip != expectedSuccessorAddress || observedSlot != expectedSuccessorSlot || c.Ebp != sourceEbp)
                                    throw new InvalidOperationException("Route successor disagrees with branch prediction or original frame");
                                VerifyPayload(process, liveEntry, payload, result, kind);
                                VerifyCallAndContinuation(process, callAddress, result, kind);
                                VerifyBranchSequence(process, branchAddress, fallthroughAddress, takenAddress, result, kind);
                                Dictionary<string, object> details = new Dictionary<string, object> {
                                    { "branchAddress", Hex(source) }, { "branchEflags", Hex(branchEflags) },
                                    { "zeroFlagAtBranch", (branchEflags & EFLAGS_ZF) != 0 },
                                    { "predictedSuccessorSlot", expectedSuccessorSlot }, { "observedSuccessorSlot", observedSlot },
                                    { "predictedSuccessorAddress", Hex(expectedSuccessorAddress) }, { "observedSuccessorAddress", Hex(c.Eip) },
                                    { "observedEdgeMatchesPrediction", true }, { "fallthroughAddress", Hex(fall) }, { "takenAddress", Hex(taken) },
                                    { "jumpSourceObserved", routeIndex == 1 && observedSlot == 0 }
                                };
                                if (routeIndex == 1 && observedSlot == 0) {
                                    details["jumpBytesHex"] = "eb62";
                                    details["jumpTargetAddress"] = Hex(checked(liveEntry + 0x331u));
                                    details["jumpInstructionNotYetExecuted"] = true;
                                }
                                AddBreakpointEvent(result, kind, observedSlot, pendingTid, debugEvent, c, ReadStackHex(process, c.Esp, STACK_WINDOW_BYTES), details);
                                if (observedSlot == 1) {
                                    CompleteBoundedRoute(result, routeIndex == 0 ? "alternate-324" : "alternate-363");
                                    phase = PHASE_COMPLETE;
                                } else if (routeIndex == 0) {
                                    TransitionSlots(state, ownerTid, 0x05u, fall, taken, checked(liveEntry + 0x2c7u), 0, false, "tag-successor-to-equality-branch", result);
                                    routeIndex = 1;
                                    phase = PHASE_WAIT_ROUTE_SOURCE;
                                } else {
                                    TransitionSlots(state, ownerTid, 0x05u, fall, taken, checked(liveEntry + 0x331u), 0, false, "jump-source-to-target", result);
                                    phase = PHASE_WAIT_JUMP_TARGET;
                                }
                                pendingStatus = DBG_CONTINUE;
                            } else if (phase == PHASE_WAIT_JUMP_TARGET) {
                                uint target = checked(liveEntry + 0x331u);
                                CheckBreakpointCause(c, 0, 0x01u, target, 0);
                                validatedOwnedBreakpointEvent = true;
                                if (c.Eip != target || c.Ebp != sourceEbp) throw new InvalidOperationException("JMP target EIP/frame mismatch");
                                VerifyPayload(process, liveEntry, payload, result, "jump-target");
                                VerifyCallAndContinuation(process, callAddress, result, "jump-target");
                                VerifyBranchSequence(process, branchAddress, fallthroughAddress, takenAddress, result, "jump-target");
                                Dictionary<string, object> details = new Dictionary<string, object> {
                                    { "jumpSourceAddress", Hex(checked(liveEntry + 0x2cdu)) }, { "jumpBytesHex", "eb62" },
                                    { "predictedTargetAddress", Hex(target) }, { "observedTargetAddress", Hex(c.Eip) },
                                    { "observedEdgeMatchesPrediction", true }, { "captureBeforeTargetInstruction", true }, { "targetBytesHex", "8b467e" }
                                };
                                AddBreakpointEvent(result, "jump-target", 0, pendingTid, debugEvent, c, ReadStackHex(process, c.Esp, STACK_WINDOW_BYTES), details);
                                CompleteBoundedRoute(result, "direct-331");
                                phase = PHASE_COMPLETE;
                                pendingStatus = DBG_CONTINUE;
                            } else {
                                throw new InvalidOperationException("Unexpected hardware event after capture completion");
                            }
                        } else if (IsBreakpoint(exceptionCode)) {
                            throw new InvalidOperationException("Unexpected software breakpoint after READY release");
                        } else {
                            throw new InvalidOperationException("Unexpected first-chance exception during bounded call capture");
                        }
                    } else {
                        pendingStatus = DBG_CONTINUE;
                    }
                } catch (Exception eventError) {
                    SetFailure(result, eventError.GetType().Name + ": " + eventError.Message, "event-rejected");
                    uint failedEventKind = ReadU32(debugEvent, 0);
                    bool failedSingleStep = failedEventKind == 1 && IsSingleStep(ReadU32(debugEvent, 16));
                    if (failedSingleStep) {
                        // Preserve NOT_HANDLED for an unvalidated exception. An owned hardware
                        // event is continued only after its saved DR state has been restored.
                        pendingStatus = validatedOwnedBreakpointEvent ? DBG_CONTINUE : DBG_EXCEPTION_NOT_HANDLED;
                    } else if (failedEventKind != 1) {
                        pendingStatus = DBG_CONTINUE;
                    }
                    if (anyModified) restoreBeforeRejectedEvent = true;
                }

                if ((phase == PHASE_COMPLETE && result["captureCompleted"].Equals(true)) || restoreBeforeRejectedEvent) {
                    try {
                        cleanup["restoreAttempted"] = true;
                        RestoreThreadsSafely(process, threads, 0, true, restorations);
                        restoreSucceeded = true;
                        result["debugRegistersRestored"] = true;
                        cleanup["restoreSucceeded"] = true;
                        restoreBeforeRejectedEvent = false;
                    } catch (Exception restoreError) {
                        restorationFailure = true;
                        AddCleanupError(result, "Restore before owned hardware-event continue failed: " + restoreError.Message);
                        SetFailure(result, restoreError.Message, "debug-state-restore-failed");
                    }
                }
                if (pending) {
                    try {
                        if (restorationFailure) {
                            // The target is runner-owned and disposable. Do not let it execute with unknown DR state.
                            cleanup["killOnExitFallbackUsed"] = true;
                            DebugSetProcessKillOnExit(true);
                            if (!TerminateProcess(process, 0xdead))
                                AddCleanupError(result, "TerminateProcess after restore failure failed: " + Marshal.GetLastWin32Error());
                            else if (WaitForSingleObject(process, 5000) == WAIT_OBJECT_0) {
                                terminationConfirmed = true;
                                cleanup["processTerminationConfirmed"] = true;
                            }
                            processExited = terminationConfirmed;
                            if (terminationConfirmed) {
                                if (ContinueDebugEvent(pid, pendingTid, DBG_CONTINUE)) {
                                    cleanup["pendingEventContinued"] = true;
                                    pending = false;
                                } else AddCleanupError(result, "Continue pending event after owned-process termination failed: " + Marshal.GetLastWin32Error());
                            }
                        } else {
                            ReleaseAndContinuePending(debugEvent, pid, pendingTid, pendingStatus, result);
                            pending = false;
                        }
                    } catch (Exception continueError) {
                        AddCleanupError(result, "Continue pending debug event failed: " + continueError.Message);
                    }
                }
                if (processExited || result["captureError"] != null || phase == PHASE_COMPLETE) break;
            }

            if (result["captureError"] == null && !result["captureCompleted"].Equals(true)) {
                string reason = timer.Elapsed.TotalSeconds >= seconds ? "wall-clock-cap" : "incomplete";
                SetFailure(result, timer.Elapsed.TotalSeconds >= seconds
                    ? "Bounded capture timed out before the JNZ successor event"
                    : "Process ended before the JNZ successor event", reason);
            }
        } catch (Exception error) {
            SetFailure(result, error.GetType().Name + ": " + error.Message, "capture-error");
        } finally {
            bool processLive = false;
            if (process != IntPtr.Zero) {
                uint wait = WAIT_FAILED;
                try { wait = WaitForSingleObject(process, 0); }
                catch (Exception error) { AddCleanupError(result, "Process liveness check failed: " + error.Message); }
                processLive = wait == WAIT_TIMEOUT;
                processExited = wait == WAIT_OBJECT_0 || processExited;
                if (wait == WAIT_FAILED) AddCleanupError(result, "Could not confirm process liveness during cleanup");
            }
            if (processLive && anyModified && !restoreSucceeded && !restorationFailure) {
                try {
                    cleanup["restoreAttempted"] = true;
                    RestoreThreadsSafely(process, threads, 0, true, restorations);
                    restoreSucceeded = true;
                    result["debugRegistersRestored"] = true;
                    cleanup["restoreSucceeded"] = true;
                } catch (Exception restoreError) {
                    restorationFailure = true;
                    AddCleanupError(result, "Final exact DR restoration failed: " + restoreError.Message);
                    SetFailure(result, restoreError.Message, "debug-state-restore-failed");
                }
            } else if (!anyModified && !restorationFailure) {
                restoreSucceeded = true;
                result["debugRegistersRestored"] = true;
                cleanup["restoreSucceeded"] = true;
                cleanup["restoreNotRequired"] = true;
            }

            if (restorationFailure && attached && processLive) {
                try {
                    cleanup["killOnExitFallbackUsed"] = true;
                    Check(DebugSetProcessKillOnExit(true));
                    if (!TerminateProcess(process, 0xdead))
                        AddCleanupError(result, "Owned AARON termination after exact restore failure failed: " + Marshal.GetLastWin32Error());
                    else if (WaitForSingleObject(process, 5000) == WAIT_OBJECT_0) {
                        terminationConfirmed = true;
                        processExited = true;
                        cleanup["processTerminationConfirmed"] = true;
                    } else AddCleanupError(result, "Owned AARON termination after restore failure was not confirmed");
                } catch (Exception error) {
                    AddCleanupError(result, "Restore-failure abort fallback failed: " + error.Message);
                }
            }

            if (pending && !processExited && !restorationFailure) {
                try {
                    uint status = pendingStatus;
                    if (result["captureCompleted"].Equals(true))
                        status = DBG_CONTINUE;
                    ReleaseAndContinuePending(debugEvent, pid, pendingTid, status, result);
                    pending = false;
                } catch (Exception error) {
                    AddCleanupError(result, "Pending-event cleanup continue failed: " + error.Message);
                }
            }
            if (pending && restorationFailure)
                AddCleanupError(result, "Pending debug event was not continued after exact DR restoration failed");

            if (attached) {
                cleanup["detachAttempted"] = true;
                if (!pending || processExited) {
                    try {
                        if (!DebugActiveProcessStop(pid))
                            AddCleanupError(result, "DebugActiveProcessStop failed: " + Marshal.GetLastWin32Error());
                        else {
                            attached = false;
                            result["detachSucceeded"] = true;
                            cleanup["detached"] = true;
                        }
                    } catch (Exception error) {
                        AddCleanupError(result, "Debugger detach failed: " + error.Message);
                    }
                }
                if (attached) {
                    try {
                        cleanup["killOnExitFallbackUsed"] = true;
                        DebugSetProcessKillOnExit(true);
                    } catch (Exception error) {
                        AddCleanupError(result, "Could not enable debugger kill-on-exit after detach failure: " + error.Message);
                    }
                }
            } else {
                result["detachSucceeded"] = !result["debuggerAttached"].Equals(true);
                cleanup["detached"] = result["detachSucceeded"];
            }
            result["debugRegistersRestored"] = restoreSucceeded;
            result["readyPauseReleased"] = released;
            result["debuggerAttached"] = result["debuggerAttached"].Equals(true);
            result["terminalElapsedSeconds"] = timer.Elapsed.TotalSeconds;
            cleanup["restoreSucceeded"] = restoreSucceeded;
            cleanup["detached"] = result["detachSucceeded"];
            cleanup["releaseMarkerCreated"] = released;
            cleanup["cleanupErrors"] = cleanupErrors;
            foreach (KeyValuePair<uint, ThreadState> item in threads)
                if (item.Value.Handle != IntPtr.Zero) CloseHandle(item.Value.Handle);
            if (debugEvent != IntPtr.Zero) Marshal.FreeHGlobal(debugEvent);
            if (process != IntPtr.Zero) CloseHandle(process);
        }
    }
}
