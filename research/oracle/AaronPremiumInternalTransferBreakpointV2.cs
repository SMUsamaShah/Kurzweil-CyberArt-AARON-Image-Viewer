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

// Read-only, source-bound no-TF capture of the two REA-identified transfers
// inside the anonymous PREMIUM destination. The only target changes are
// per-thread WOW64 debug-register contexts, restored byte-for-byte on exit.
public static class AaronPremiumInternalTransferBreakpointV2
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
    const uint DR6_BS = 0x00004000;
    const uint MEM_COMMIT = 0x00001000;
    const uint PAGE_NOACCESS = 0x00000001;
    const uint PAGE_GUARD = 0x00000100;
    const uint MEM_MAPPED = 0x00040000;
    const uint WAIT_OBJECT_0 = 0x00000000;
    const uint WAIT_TIMEOUT = 0x00000102;
    const uint WAIT_FAILED = 0xffffffff;
    const int MAX_BREAKPOINT_EVENTS = 128;
    const int MAX_SITE_HITS = 32;
    const int WINDOW_BYTES = 256;
    const int CALL_OFFSET = 0x17;
    const int JMP_OFFSET = 0xa1;
    const string ACCEPTANCE_CONTRACT = "tail-jump-edge-before-outer-continuation";
    const string INSTRUCTION_PROFILE_SHA256 = "25daebb65b53736fb37a208f44cc9a86162ec398f64703aa6bb86b351310fabe";
    const uint OUTER_CALL_SLOT_OFFSET = 0x27;
    const uint INNER_CALL_OPERAND_OFFSET = 0x35f;
    const uint INNER_JMP_OPERAND_OFFSET = 0x12;
    const int PHASE_OUTER_CALL = 0;
    const int PHASE_OUTER_DESTINATION = 1;
    const int PHASE_INTERNAL = 2;
    const int PHASE_DONE = 3;
    static readonly byte[] ExpectedOuterCall = { 0xff, 0x57, 0x27 };
    static readonly byte[] ExpectedInnerCall = { 0xff, 0x97, 0x5f, 0x03, 0x00, 0x00 };
    static readonly byte[] ExpectedInnerJmp = { 0xff, 0x66, 0x12 };
    static readonly int[] ProfileOffsets = { 0x17, 0x80, 0x82, 0x85, 0x88, 0x8b, 0x8e, 0x90, 0x99, 0x9d, 0xa1 };
    static readonly byte[][] ProfileBytes = {
        new byte[] { 0xff, 0x97, 0x5f, 0x03, 0x00, 0x00 },
        new byte[] { 0xb1, 0x02 },
        new byte[] { 0x83, 0xe1, 0x7f },
        new byte[] { 0x8b, 0x73, 0x15 },
        new byte[] { 0x89, 0x4d, 0xf0 },
        new byte[] { 0x39, 0x67, 0x9b },
        new byte[] { 0x72, 0x09 },
        new byte[] { 0xeb, 0x85 },
        new byte[] { 0x89, 0x44, 0x24, 0x04 },
        new byte[] { 0x89, 0x54, 0x24, 0x08 },
        new byte[] { 0xff, 0x66, 0x12 }
    };

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

    sealed class ThreadState
    {
        public IntPtr Handle;
        public Wow64Context Saved;
        public bool Armed;
        public bool Exited;
        public uint[] Breakpoints = new uint[4];
    }

    sealed class SuspensionReceipt
    {
        public uint ThreadId;
        public ThreadState State;
        public uint PreviousSuspendCount;
    }

    sealed class PendingTransfer
    {
        public string Site;
        public int Slot;
        public uint SiteAddress;
        public uint SourceEsp;
        public uint TargetAddress;
        public uint SourceOrder;
        public Dictionary<string, object> SourceStack;
    }

    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DebugActiveProcess(uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DebugActiveProcessStop(uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DebugSetProcessKillOnExit(bool kill);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool WaitForDebugEvent(IntPtr debugEvent, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ContinueDebugEvent(uint pid, uint tid, uint continueStatus);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenThread(uint access, bool inherit, uint tid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool IsWow64Process(IntPtr process, out bool wow64Process);
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
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    static void EnableKillOnExit(List<string> cleanupErrors, string phase)
    {
        try {
            if (!DebugSetProcessKillOnExit(true))
                cleanupErrors.Add(phase + ": DebugSetProcessKillOnExit(true) failed: " + Marshal.GetLastWin32Error());
        } catch (Exception error) {
            cleanupErrors.Add(phase + ": Could not enable debugger kill-on-exit: " + error.Message);
        }
    }

    static void Check(bool value)
    {
        if (!value) throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    static string Hex(uint value) { return "0x" + value.ToString("x8", CultureInfo.InvariantCulture); }
    static string Hex64(ulong value) { return "0x" + value.ToString("x16", CultureInfo.InvariantCulture); }
    static string BytesHex(byte[] value) { return BitConverter.ToString(value).Replace("-", "").ToLowerInvariant(); }
    static byte[] BytesFromHex(string value)
    {
        if (String.IsNullOrEmpty(value) || (value.Length & 1) != 0)
            throw new InvalidOperationException("Bounded live-byte preview is malformed");
        byte[] bytes = new byte[value.Length / 2];
        for (int i = 0; i < bytes.Length; i++)
            bytes[i] = Byte.Parse(value.Substring(i * 2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        return bytes;
    }
    static IntPtr Address(uint value) { return new IntPtr(unchecked((long)value)); }
    static uint ReadU32(IntPtr p, int offset) { return unchecked((uint)Marshal.ReadInt32(p, offset)); }
    static ulong ReadU64(IntPtr p, int offset) { return unchecked((ulong)Marshal.ReadInt64(p, offset)); }

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

    static string Sha256File(string path)
    {
        using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
        using (SHA256 sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }

    static bool JsonHasStringProperty(string json, string property, string value)
    {
        string escaped = value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        string pattern = "\"" + Regex.Escape(property) + "\"\\s*:\\s*\"" + Regex.Escape(escaped) + "\"";
        return Regex.IsMatch(json, pattern, RegexOptions.CultureInvariant);
    }

    static bool IsOwnedRequest(string requestPath, string expectedRequestSha256,
        string expectedRunId, string expectedRuntimePath, string expectedReleasePath)
    {
        if (String.IsNullOrEmpty(requestPath) || String.IsNullOrEmpty(expectedRunId) ||
            String.IsNullOrEmpty(expectedRuntimePath) || String.IsNullOrEmpty(expectedReleasePath) ||
            String.IsNullOrEmpty(expectedRequestSha256) || expectedRequestSha256.Length != 64)
            return false;
        try {
            string requestFull = Path.GetFullPath(requestPath);
            string runtimeFull = Path.GetFullPath(expectedRuntimePath);
            string runtimeDirectory = Path.GetDirectoryName(runtimeFull);
            string outputRoot = Path.GetDirectoryName(runtimeDirectory);
            string expectedRequest = Path.GetFullPath(Path.Combine(outputRoot, "pre-scene-probe-request.json"));
            if (!String.Equals(requestFull, expectedRequest, StringComparison.OrdinalIgnoreCase) ||
                !String.Equals(Path.GetFileName(outputRoot), expectedRunId, StringComparison.Ordinal) ||
                !String.Equals(runtimeFull, Path.GetFullPath(Path.Combine(outputRoot, "runtime", "AARON.exe")),
                    StringComparison.OrdinalIgnoreCase) || !File.Exists(requestFull))
                return false;
            byte[] bytes = File.ReadAllBytes(requestFull);
            string hash;
            using (SHA256 sha = SHA256.Create())
                hash = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
            if (!String.Equals(hash, expectedRequestSha256, StringComparison.Ordinal)) return false;
            string json = new UTF8Encoding(false, true).GetString(bytes);
            return JsonHasStringProperty(json, "runId", expectedRunId) &&
                JsonHasStringProperty(json, "runtimeExecutable", runtimeFull) &&
                JsonHasStringProperty(json, "releaseFile", expectedReleasePath);
        } catch { return false; }
    }

    static Dictionary<string, object> DebugStateRecord(uint tid, Wow64Context c)
    {
        return new Dictionary<string, object> {
            { "threadId", tid }, { "dr0", Hex(c.Dr0) }, { "dr1", Hex(c.Dr1) },
            { "dr2", Hex(c.Dr2) }, { "dr3", Hex(c.Dr3) },
            { "dr6", Hex(c.Dr6) }, { "dr7", Hex(c.Dr7) }
        };
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

    static byte[] ReadExact(IntPtr process, uint address, int count)
    {
        if (count <= 0 || (ulong)address + (ulong)count > 0x100000000UL)
            throw new InvalidOperationException("Requested read exceeds the WOW64 address space");
        MemoryBasicInformation info = QueryRegion(process, address);
        ulong regionEnd = unchecked((ulong)info.BaseAddress.ToInt64()) + info.RegionSize.ToUInt64();
        if ((ulong)address + (ulong)count > regionEnd)
            throw new InvalidOperationException("Requested read crosses a readable memory-region boundary");
        byte[] bytes = new byte[count];
        UIntPtr read;
        if (!ReadProcessMemory(process, Address(address), bytes, (UIntPtr)count, out read))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        if (read.ToUInt64() != (ulong)count) throw new IOException("ReadProcessMemory returned a short read");
        return bytes;
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
            address < start || (ulong)address >= start + size)
            throw new InvalidOperationException("VirtualQueryEx returned an invalid WOW64 region");
        uint baseProtection = info.Protect & 0xffu;
        bool readable = baseProtection == 0x02u || baseProtection == 0x04u ||
            baseProtection == 0x08u || baseProtection == 0x20u ||
            baseProtection == 0x40u || baseProtection == 0x80u;
        if (info.State != MEM_COMMIT || (info.Protect & PAGE_GUARD) != 0 || !readable)
            throw new InvalidOperationException("Address is not in a readable committed page");
        return info;
    }

    static Dictionary<string, object> RegionRecord(MemoryBasicInformation info)
    {
        return new Dictionary<string, object> {
            { "baseAddress", Hex64(unchecked((ulong)info.BaseAddress.ToInt64())) },
            { "allocationBase", Hex64(unchecked((ulong)info.AllocationBase.ToInt64())) },
            { "regionSize", Hex64(info.RegionSize.ToUInt64()) },
            { "state", Hex(info.State) }, { "protection", Hex(info.Protect) },
            { "allocationProtection", Hex(info.AllocationProtect) }, { "type", Hex(info.Type) }
        };
    }

    static Dictionary<string, object> ReadPagePreview(IntPtr process, uint address)
    {
        MemoryBasicInformation info = QueryRegion(process, address);
        ulong end = unchecked((ulong)info.BaseAddress.ToInt64()) + info.RegionSize.ToUInt64();
        int count = (int)Math.Min(16UL, end - address);
        byte[] bytes = ReadExact(process, address, count);
        return new Dictionary<string, object> {
            { "address", Hex(address) }, { "bytesHex", BytesHex(bytes) },
            { "bytesRead", bytes.Length }, { "region", RegionRecord(info) }
        };
    }

    static Dictionary<string, object> ReadStackDword(IntPtr process, uint address)
    {
        byte[] bytes = ReadExact(process, address, 4);
        return new Dictionary<string, object> {
            { "address", Hex(address) }, { "bytesHex", BytesHex(bytes) },
            { "value", Hex(BitConverter.ToUInt32(bytes, 0)) }, { "readError", null }
        };
    }

    static Dictionary<string, object> ReadSlot(IntPtr process, string register, uint baseValue,
        uint offset, out uint value)
    {
        ulong address64 = (ulong)baseValue + offset;
        if (address64 > UInt32.MaxValue)
            throw new InvalidOperationException(register + " operand address exceeds the 32-bit address space");
        uint address = (uint)address64;
        byte[] bytes = ReadExact(process, address, 4);
        value = BitConverter.ToUInt32(bytes, 0);
        return new Dictionary<string, object> {
            { "baseRegister", register }, { "baseValue", Hex(baseValue) },
            { "offset", Hex(offset) }, { "address", Hex(address) },
            { "value", Hex(value) }, { "bytesHex", BytesHex(bytes) }, { "readError", null }
        };
    }

    static Dictionary<string, object> ReadTargetWindow(IntPtr process, uint eip,
        uint expectedStart, string referenceWindowSha256, string instructionProfileSha256)
    {
        if (eip < 128u || (ulong)eip + 128UL > 0x100000000UL)
            throw new InvalidOperationException("Target cannot be centered in a full 256-byte window");
        uint start = eip - 128u;
        uint endExclusive = eip + 128u;
        MemoryBasicInformation info = QueryRegion(process, start);
        ulong regionStart = unchecked((ulong)info.BaseAddress.ToInt64());
        ulong regionEnd = regionStart + info.RegionSize.ToUInt64();
        bool regionContainsWindow = (ulong)start >= regionStart && (ulong)endExclusive <= regionEnd;
        if (!regionContainsWindow)
            throw new InvalidOperationException("The full centered target window crosses a memory-region boundary");
        bool regionTypeMatchesReference = info.Type == MEM_MAPPED;
        byte[] bytes = ReadExact(process, start, WINDOW_BYTES);
        int eipOffset = checked((int)(eip - start));
        string hash;
        using (SHA256 sha = SHA256.Create())
            hash = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
        List<Dictionary<string, object>> profileRecords = new List<Dictionary<string, object>>();
        bool instructionProfileMatches = instructionProfileSha256 == INSTRUCTION_PROFILE_SHA256;
        for (int i = 0; i < ProfileOffsets.Length; i++) {
            string actual = BytesHex(Slice(bytes, ProfileOffsets[i], ProfileBytes[i].Length));
            string expected = BytesHex(ProfileBytes[i]);
            bool matched = String.Equals(actual, expected, StringComparison.Ordinal);
            if (!matched) instructionProfileMatches = false;
            profileRecords.Add(new Dictionary<string, object> {
                { "offset", ProfileOffsets[i] }, { "length", ProfileBytes[i].Length },
                { "address", Hex(checked(start + (uint)ProfileOffsets[i])) },
                { "bytesHex", actual }, { "expectedBytesHex", expected }, { "matched", matched }
            });
        }
        string callBytes = BytesHex(Slice(bytes, CALL_OFFSET, ExpectedInnerCall.Length));
        string jumpBytes = BytesHex(Slice(bytes, JMP_OFFSET, ExpectedInnerJmp.Length));
        bool callMatched = callBytes == BytesHex(ExpectedInnerCall);
        bool jumpMatched = jumpBytes == BytesHex(ExpectedInnerJmp);
        bool historicalReferenceWindowBytesMatch = start == expectedStart &&
            String.Equals(hash, referenceWindowSha256, StringComparison.Ordinal);
        Dictionary<string, object> record = new Dictionary<string, object> {
            { "eip", Hex(eip) }, { "windowStartAddress", Hex64(start) },
            { "windowEndExclusive", Hex64(endExclusive) }, { "eipOffset", eipOffset },
            { "requestedBytes", WINDOW_BYTES }, { "bytesRead", bytes.Length },
            { "bytesHex", BytesHex(bytes) }, { "bytesSha256", hash },
            { "referenceWindowStart", Hex64(expectedStart) },
            { "referenceWindowSha256", referenceWindowSha256 },
            { "historicalReferenceWindowBytesMatch", historicalReferenceWindowBytesMatch },
            { "instructionProfileSha256", instructionProfileSha256 },
            { "expectedInstructionProfileSha256", INSTRUCTION_PROFILE_SHA256 },
            { "instructionProfileMatches", instructionProfileMatches },
            { "profileRecords", profileRecords },
            { "regionContainsWindow", regionContainsWindow },
            { "regionTypeMatchesReference", regionTypeMatchesReference },
            { "region", RegionRecord(info) },
            { "callSite", new Dictionary<string, object> {
                { "offset", CALL_OFFSET }, { "address", Hex(checked(start + CALL_OFFSET)) },
                { "bytesHex", callBytes }, { "expectedBytesHex", BytesHex(ExpectedInnerCall) },
                { "matched", callMatched }
            } },
            { "jumpSite", new Dictionary<string, object> {
                { "offset", JMP_OFFSET }, { "address", Hex(checked(start + JMP_OFFSET)) },
                { "bytesHex", jumpBytes }, { "expectedBytesHex", BytesHex(ExpectedInnerJmp) },
                { "matched", jumpMatched }
            } },
            { "signaturesMatch", callMatched && jumpMatched }
        };
        record["eipOffsetMatches"] = eipOffset == 128;
        record["validationPassed"] = start == expectedStart && (ulong)endExclusive == (ulong)start + WINDOW_BYTES &&
            eipOffset == 128 && regionContainsWindow && regionTypeMatchesReference &&
            bytes.Length == WINDOW_BYTES && instructionProfileMatches;
        return record;
    }

    static byte[] Slice(byte[] bytes, int offset, int count)
    {
        if (offset < 0 || count < 0 || offset > bytes.Length - count)
            throw new InvalidOperationException("Candidate instruction falls outside the captured target window");
        byte[] result = new byte[count];
        Buffer.BlockCopy(bytes, offset, result, 0, count);
        return result;
    }

    static Dictionary<string, object> MakeSite(string name, int offset, byte[] expected, uint address)
    {
        return new Dictionary<string, object> {
            { "name", name }, { "offset", offset }, { "address", Hex(address) },
            { "expectedBytesHex", BytesHex(expected) }, { "hitCount", 0 },
            { "destinationHitCount", 0 }, { "status", "armed" }
        };
    }

    static void ConfigureSlot(ThreadState state, int slot, uint address)
    {
        if (slot < 0 || slot > 3 || address == 0)
            throw new ArgumentOutOfRangeException("slot/address");
        Wow64Context c = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
        if ((c.EFlags & EFLAGS_TF) != 0)
            throw new InvalidOperationException("Thread trap flag became set; no-TF capture refuses to continue");
        SetDr(ref c, slot, address);
        c.Dr6 = 0;
        uint slotEnableMask = 3u << (slot * 2);
        uint slotLengthMask = 0xfu << (16 + slot * 4);
        c.Dr7 = (c.Dr7 & ~(slotEnableMask | slotLengthMask)) | (1u << (slot * 2));
        state.Breakpoints[slot] = address;
        state.Armed = true;
        SetDebugContext(state.Handle, c);
        Wow64Context readback = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
        if (GetDr(readback, slot) != address || (readback.Dr6 & 0xfu) != 0 ||
            (readback.Dr7 & (3u << (slot * 2))) != (1u << (slot * 2)) ||
            (readback.Dr7 & slotLengthMask) != 0 || (readback.EFlags & EFLAGS_TF) != 0)
            throw new InvalidOperationException("Hardware execute breakpoint readback did not match the requested slot");
    }

    static void SetDr(ref Wow64Context c, int slot, uint value)
    {
        if (slot == 0) c.Dr0 = value;
        else if (slot == 1) c.Dr1 = value;
        else if (slot == 2) c.Dr2 = value;
        else c.Dr3 = value;
    }

    static uint GetDr(Wow64Context c, int slot)
    {
        if (slot == 0) return c.Dr0;
        if (slot == 1) return c.Dr1;
        if (slot == 2) return c.Dr2;
        return c.Dr3;
    }

    static void RestoreThreadsSafely(IntPtr process, Dictionary<uint, ThreadState> threads,
        uint keepThreadId, bool restoreAll, List<Dictionary<string, object>> restorationRecords)
    {
        uint processWait = WaitForSingleObject(process, 0);
        if (processWait != WAIT_TIMEOUT)
            throw new InvalidOperationException("Cannot restore debug registers because the owned oracle is not confirmed live");

        List<SuspensionReceipt> suspended = new List<SuspensionReceipt>();
        foreach (KeyValuePair<uint, ThreadState> item in threads) {
            ThreadState state = item.Value;
            if (state.Exited || state.Handle == IntPtr.Zero) continue;
            uint previous = Wow64SuspendThread(state.Handle);
            if (previous == UInt32.MaxValue || previous >= UInt32.MaxValue - 1u) {
                throw new InvalidOperationException("WOW64 suspend failed or returned an unsafe suspend count for thread " + item.Key +
                    ": " + Marshal.GetLastWin32Error() + "; helper-added suspensions are retained and the owned oracle must be terminated");
            }
            suspended.Add(new SuspensionReceipt {
                ThreadId = item.Key, State = state, PreviousSuspendCount = previous
            });
        }

        foreach (SuspensionReceipt receipt in suspended) {
            if (!restoreAll && receipt.ThreadId == keepThreadId) continue;
            try {
                SetDebugContext(receipt.State.Handle, receipt.State.Saved);
                Wow64Context actual = GetContext(receipt.State.Handle, CONTEXT_DEBUG_REGISTERS);
                bool exact = DebugRegistersEqual(receipt.State.Saved, actual);
                restorationRecords.Add(new Dictionary<string, object> {
                    { "threadId", receipt.ThreadId },
                    { "saved", DebugStateRecord(receipt.ThreadId, receipt.State.Saved) },
                    { "restored", DebugStateRecord(receipt.ThreadId, actual) },
                    { "exactMatch", exact }, { "previousSuspendCount", receipt.PreviousSuspendCount }
                });
                if (!exact)
                    throw new InvalidOperationException("Saved DR0-DR3/DR6/DR7 did not restore exactly");
            } catch (Exception error) {
                throw new InvalidOperationException("Set/read back saved debug registers for thread " + receipt.ThreadId +
                    ": " + error.Message + "; helper-added suspensions are retained and the owned oracle must be terminated", error);
            }
        }

        for (int i = suspended.Count - 1; i >= 0; i--) {
            SuspensionReceipt receipt = suspended[i];
            uint previous = ResumeThread(receipt.State.Handle);
            uint expected = receipt.PreviousSuspendCount + 1u;
            if (previous == UInt32.MaxValue || previous != expected)
                throw new InvalidOperationException("Resume count did not preserve the prior suspend count for thread " + receipt.ThreadId +
                    " (expected prior count " + expected + ", got " + previous + "); abort the owned oracle before continuing");
        }

        foreach (SuspensionReceipt receipt in suspended) {
            if (!restoreAll && receipt.ThreadId == keepThreadId) continue;
            receipt.State.Armed = false;
            receipt.State.Breakpoints = new uint[4];
        }
    }

    static ThreadState OpenAndArm(uint tid, uint callSite, Dictionary<uint, ThreadState> threads)
    {
        ThreadState existing;
        if (threads.TryGetValue(tid, out existing)) return existing;
        IntPtr handle = OpenThread(0x1a, false, tid);
        Check(handle != IntPtr.Zero);
        try {
            Wow64Context saved = GetContext(handle, CONTEXT_CONTROL_INTEGER_DEBUG);
            if ((saved.Dr7 & 0xffu) != 0)
                throw new InvalidOperationException("Existing DR0-DR3 hardware breakpoint is active in thread " + tid);
            if ((saved.EFlags & EFLAGS_TF) != 0)
                throw new InvalidOperationException("Thread already has TF set; no-TF capture refuses to attach");
            saved.ContextFlags = CONTEXT_DEBUG_REGISTERS;
            ThreadState state = new ThreadState { Handle = handle, Saved = saved };
            threads.Add(tid, state);
            ConfigureSlot(state, 0, callSite);
            return state;
        } catch {
            if (!threads.ContainsKey(tid)) CloseHandle(handle);
            throw;
        }
    }

    static ThreadState OpenAndTrack(uint tid, Dictionary<uint, ThreadState> threads)
    {
        ThreadState existing;
        if (threads.TryGetValue(tid, out existing)) return existing;
        IntPtr handle = OpenThread(0x1a, false, tid);
        Check(handle != IntPtr.Zero);
        try {
            Wow64Context saved = GetContext(handle, CONTEXT_DEBUG_REGISTERS);
            saved.ContextFlags = CONTEXT_DEBUG_REGISTERS;
            ThreadState state = new ThreadState { Handle = handle, Saved = saved };
            threads.Add(tid, state);
            return state;
        } catch {
            CloseHandle(handle);
            throw;
        }
    }

    static Dictionary<string, object> ArmReadback(ThreadState state, uint tid)
    {
        Wow64Context c = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
        return new Dictionary<string, object> {
            { "threadId", tid }, { "eip", Hex(c.Eip) }, { "esp", Hex(c.Esp) },
            { "ebp", Hex(c.Ebp) }, { "eflags", Hex(c.EFlags) },
            { "dr0", Hex(c.Dr0) }, { "dr1", Hex(c.Dr1) },
            { "dr2", Hex(c.Dr2) }, { "dr3", Hex(c.Dr3) },
            { "dr6", Hex(c.Dr6) }, { "dr7", Hex(c.Dr7) }
        };
    }

    static void CheckHardwareCause(Wow64Context c, int slot)
    {
        uint expected = 1u << slot;
        if ((c.Dr6 & 0xfu) != expected || (c.Dr6 & DR6_BS) != 0 || (c.EFlags & EFLAGS_TF) != 0)
            throw new InvalidOperationException("Event is not the expected no-TF hardware execute-breakpoint cause");
    }

    static Dictionary<string, object> EventRecord(uint order, string kind, string site, int slot,
        uint tid, IntPtr evt, Wow64Context c, byte[] liveBytes, Dictionary<string, object> extra)
    {
        Dictionary<string, object> record = new Dictionary<string, object> {
            { "eventOrder", order }, { "kind", kind }, { "site", site }, { "slot", slot },
            { "threadId", tid }, { "eip", Hex(c.Eip) }, { "registers", RegisterRecord(c, tid) },
            { "liveBytesHex", liveBytes == null ? null : BytesHex(liveBytes) },
            { "firstChance", ReadU32(evt, 168) == 1 }, { "exceptionEvent", ExceptionRecord(evt, tid) }
        };
        if (extra != null) foreach (KeyValuePair<string, object> pair in extra) record[pair.Key] = pair.Value;
        return record;
    }

    static bool IsSingleStep(uint code)
    {
        return code == STATUS_SINGLE_STEP || code == STATUS_WX86_SINGLE_STEP;
    }

    static bool IsBreakpoint(uint code)
    {
        return code == STATUS_BREAKPOINT || code == STATUS_WX86_BREAKPOINT;
    }

    static void TryRelease(string path, string requestPath, string expectedRequestSha256,
        string expectedRunId, string expectedRuntimePath, IntPtr process,
        List<string> errors, ref bool released)
    {
        if (String.IsNullOrEmpty(path)) { errors.Add("Required runner release path is empty"); return; }
        if (process == IntPtr.Zero) { errors.Add("Owned process handle is unavailable; refusing release"); return; }
        uint wait = WaitForSingleObject(process, 0);
        if (wait != WAIT_TIMEOUT) {
            errors.Add("Owned oracle was not confirmed live at release time; release refused (wait=" + Hex(wait) + ")");
            return;
        }
        if (!IsOwnedRequest(requestPath, expectedRequestSha256, expectedRunId, expectedRuntimePath, path)) {
            errors.Add("Runner request ownership/hash check failed at release time");
            return;
        }
        wait = WaitForSingleObject(process, 0);
        if (wait != WAIT_TIMEOUT) {
            errors.Add("Owned oracle stopped before the exclusive release write; release refused (wait=" + Hex(wait) + ")");
            return;
        }
        try {
            byte[] marker = new UTF8Encoding(false).GetBytes("Owned no-TF internal-transfer capture released" + Environment.NewLine);
            using (FileStream stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.Read)) {
                stream.Write(marker, 0, marker.Length);
                stream.Flush(true);
            }
            released = true;
        } catch (Exception e) { errors.Add("Exclusive release marker creation failed: " + e.GetType().Name + ": " + e.Message); }
    }

    static Dictionary<string, object> NewResult(uint callSite, uint pickEntry, uint expectedWindowStart,
        string referenceWindowSha256, string instructionProfileSha256, string expectedRequestSha256, string expectedRunId,
        string expectedRuntimePath, int seconds)
    {
        return new Dictionary<string, object> {
            { "schema", "aaron-premium-internal-transfer-breakpoint-v2" },
            { "acceptanceContract", ACCEPTANCE_CONTRACT },
            { "callSiteAddress", Hex(callSite) }, { "currentPickEntry", Hex(pickEntry) },
            { "referenceWindowStart", Hex64(expectedWindowStart) },
            { "referenceWindowSha256", referenceWindowSha256 },
            { "instructionProfileSha256", instructionProfileSha256 },
            { "ownedRequestSha256", expectedRequestSha256 }, { "ownedRunId", expectedRunId },
            { "ownedRuntimePath", expectedRuntimePath },
            { "captureWindowSeconds", seconds }, { "captureWindowExpired", false },
            { "attached", false }, { "attachSucceeded", false }, { "detached", false },
            { "readyPauseReleased", false }, { "debugRegistersRestored", false },
            { "trapFlagUntouched", true }, { "captureCompleted", false },
            { "selectedThreadId", null }, { "eventCount", 0 }, { "events", new List<Dictionary<string, object>>() },
            { "debugStateRestorations", new List<Dictionary<string, object>>() },
            { "call", new Dictionary<string, object> {
                { "hit", false }, { "status", "not-observed" }, { "threadId", null },
                { "preCallRegisters", null }, { "preCallDispatchSlot", null }, { "armedContextReadback", null }
            } },
            { "outerDestination", new Dictionary<string, object> {
                { "hit", false }, { "status", "not-observed" }, { "targetEip", null },
                { "targetRegisters", null }, { "returnAddressAtEsp", null }, { "targetPage", null }
            } },
            { "outerReturnGuard", new Dictionary<string, object> {
                { "address", null }, { "armed", false }, { "armReadback", null },
                { "hit", false }, { "status", "not-observed" }
            } },
            { "targetWindow", null },
            { "sites", new List<Dictionary<string, object>>() },
            { "edges", new List<Dictionary<string, object>>() },
            { "cleanupErrors", new List<string>() }, { "captureError", null },
            { "terminalReason", "capturing" }
        };
    }

    static void AddError(Dictionary<string, object> result, string error, string reason)
    {
        if (result["captureError"] == null) result["captureError"] = error;
        result["terminalReason"] = reason;
    }

    public static Dictionary<string, object> Capture(uint pid, uint callSiteAddress,
        uint currentPickEntry, string releaseFile, string requestPath, string expectedRequestSha256,
        string expectedRunId, string expectedRuntimePath, uint expectedWindowStart,
        string referenceWindowSha256, string instructionProfileSha256, int seconds)
    {
        if (pid == 0 || callSiteAddress == 0 || currentPickEntry == 0)
            throw new ArgumentOutOfRangeException("pid/address");
        if (expectedWindowStart == 0 || String.IsNullOrEmpty(referenceWindowSha256) ||
            !Regex.IsMatch(referenceWindowSha256, "^[0-9a-f]{64}$", RegexOptions.CultureInvariant) ||
            !String.Equals(instructionProfileSha256, INSTRUCTION_PROFILE_SHA256, StringComparison.Ordinal))
            throw new ArgumentException("Reference-window address/hash or exact REA instruction-profile identity is invalid");
        if (!IsOwnedRequest(requestPath, expectedRequestSha256, expectedRunId, expectedRuntimePath, releaseFile))
            throw new InvalidOperationException("Runner request does not match the validated owned request inputs");
        if (seconds < 10 || seconds > 180) throw new ArgumentOutOfRangeException("seconds");
        if (IntPtr.Size != 8) throw new InvalidOperationException("Use x64 PowerShell for WOW64 debugging");
        Dictionary<string, object> result = null;
        Exception failure = null;
        Thread debugger = new Thread(delegate() {
            try { result = CaptureOnDebuggerThread(pid, callSiteAddress, currentPickEntry,
                releaseFile, requestPath, expectedRequestSha256, expectedRunId, expectedRuntimePath,
                expectedWindowStart, referenceWindowSha256, instructionProfileSha256, seconds); }
            catch (Exception e) { failure = e; }
        });
        debugger.Name = "AARON PREMIUM no-TF internal-transfer capture v2";
        debugger.Start();
        debugger.Join();
        if (failure != null) throw new InvalidOperationException(failure.Message, failure);
        return result;
    }

    static Dictionary<string, object> CaptureOnDebuggerThread(uint pid, uint callSiteAddress,
        uint currentPickEntry, string releaseFile, string requestPath, string expectedRequestSha256,
        string expectedRunId, string expectedRuntimePath, uint expectedWindowStart,
        string referenceWindowSha256, string instructionProfileSha256, int seconds)
    {
        const uint PROCESS_ACCESS = 0x00100411; // SYNCHRONIZE | TERMINATE | VM_READ | QUERY_INFORMATION
        IntPtr process = OpenProcess(PROCESS_ACCESS, false, pid);
        Check(process != IntPtr.Zero);
        if (WaitForSingleObject(process, 0) != WAIT_TIMEOUT ||
            !IsOwnedRequest(requestPath, expectedRequestSha256, expectedRunId, expectedRuntimePath, releaseFile)) {
            CloseHandle(process);
            throw new InvalidOperationException("Owned oracle process/request failed the live pre-attach check");
        }
        bool wow64;
        try { Check(IsWow64Process(process, out wow64)); }
        catch { CloseHandle(process); throw; }
        if (!wow64) { CloseHandle(process); throw new InvalidOperationException("Selected process is not WOW64"); }

        Dictionary<string, object> result = NewResult(callSiteAddress, currentPickEntry,
            expectedWindowStart, referenceWindowSha256, instructionProfileSha256,
            expectedRequestSha256, expectedRunId,
            expectedRuntimePath, seconds);
        Dictionary<string, object> call = (Dictionary<string, object>)result["call"];
        Dictionary<string, object> outer = (Dictionary<string, object>)result["outerDestination"];
        List<Dictionary<string, object>> events = (List<Dictionary<string, object>>)result["events"];
        List<Dictionary<string, object>> restorations = (List<Dictionary<string, object>>)result["debugStateRestorations"];
        List<Dictionary<string, object>> sites = (List<Dictionary<string, object>>)result["sites"];
        List<Dictionary<string, object>> edges = (List<Dictionary<string, object>>)result["edges"];
        List<string> cleanupErrors = (List<string>)result["cleanupErrors"];
        Dictionary<uint, ThreadState> threads = new Dictionary<uint, ThreadState>();
        IntPtr debugEvent = Marshal.AllocHGlobal(1024);
        Stopwatch timer = Stopwatch.StartNew();
        bool attached = false, pending = false, exited = false, released = false;
        bool debugRegistersRestored = false;
        bool restorationFailureObserved = false;
        bool ownerSelected = false, outerDestinationArmed = false;
        uint ownerTid = 0, pendingTid = 0, pendingStatus = DBG_EXCEPTION_NOT_HANDLED;
        int phase = PHASE_OUTER_CALL;
        uint outerTarget = 0, outerEsp = 0, outerContinuation = 0;
        uint windowStart = 0, callSite = 0, jumpSite = 0;
        int eventCount = 0;
        PendingTransfer pendingTransfer = null;
        string captureError = null;
        try {
            Check(DebugActiveProcess(pid));
            attached = true;
            result["attached"] = true;
            result["attachSucceeded"] = true;
            Check(DebugSetProcessKillOnExit(false));
            while (timer.Elapsed.TotalSeconds < seconds && phase != PHASE_DONE) {
                if (!WaitForDebugEvent(debugEvent, 100)) {
                    int error = Marshal.GetLastWin32Error();
                    if (error != 121) throw new Win32Exception(error);
                    continue;
                }
                pending = true;
                uint kind = ReadU32(debugEvent, 0);
                uint eventPid = ReadU32(debugEvent, 4);
                uint tid = ReadU32(debugEvent, 8);
                pendingTid = tid;
                pendingStatus = DBG_EXCEPTION_NOT_HANDLED;
                if (eventPid != pid) throw new InvalidOperationException("Unexpected debug-event process ID");
                if (kind == 3 || kind == 6) {
                    IntPtr fileHandle = Marshal.ReadIntPtr(debugEvent, 16);
                    if (fileHandle != IntPtr.Zero) CloseHandle(fileHandle);
                }
                if (kind == 3) {
                    IntPtr image = Marshal.ReadIntPtr(debugEvent, 24);
                    IntPtr thread = Marshal.ReadIntPtr(debugEvent, 32);
                    if (image != IntPtr.Zero) CloseHandle(image);
                    if (thread != IntPtr.Zero) CloseHandle(thread);
                } else if (kind == 2) {
                    IntPtr thread = Marshal.ReadIntPtr(debugEvent, 16);
                    if (thread != IntPtr.Zero) CloseHandle(thread);
                }
                if (kind == 4) {
                    ThreadState exitedState;
                    if (threads.TryGetValue(tid, out exitedState)) {
                        exitedState.Exited = true;
                        if (exitedState.Handle != IntPtr.Zero) CloseHandle(exitedState.Handle);
                        exitedState.Handle = IntPtr.Zero;
                        if (ownerSelected && tid == ownerTid) {
                            captureError = "Selected thread exited before the required tail-JMP edge was captured";
                            AddError(result, captureError, "selected-thread-exit");
                            phase = PHASE_DONE;
                        }
                    }
                }
                if (kind == 2 || kind == 3) {
                    if (!ownerSelected) OpenAndArm(tid, callSiteAddress, threads);
                    else OpenAndTrack(tid, threads);
                }

                if (kind == 1) {
                    uint code = ReadU32(debugEvent, 16);
                    uint firstChance = ReadU32(debugEvent, 168);
                    if (firstChance != 1)
                        throw new InvalidOperationException("A non-first-chance debug event was observed");
                    if (ownerSelected && tid != ownerTid)
                        throw new InvalidOperationException("A debug event came from a wrong thread after owner selection");
                    if (IsBreakpoint(code) && !released && firstChance == 1) {
                        if (threads.Count == 0) throw new InvalidOperationException("No thread accepted the outer call-site breakpoint");
                        TryRelease(releaseFile, requestPath, expectedRequestSha256, expectedRunId,
                            expectedRuntimePath, process, cleanupErrors, ref released);
                        result["readyPauseReleased"] = released;
                        if (!released) throw new InvalidOperationException("Could not release the owned READY pause");
                        pendingStatus = DBG_CONTINUE;
                    } else if (IsSingleStep(code)) {
                        if (firstChance != 1)
                            throw new InvalidOperationException("A non-first-chance single-step/debug event was observed");
                        ThreadState state;
                        if (!threads.TryGetValue(tid, out state) || state.Exited || state.Handle == IntPtr.Zero)
                            throw new InvalidOperationException("Single-step event came from an untracked/wrong thread");
                        Wow64Context c = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
                        if ((c.EFlags & EFLAGS_TF) != 0)
                            throw new InvalidOperationException("TF became set during the hardware-breakpoint experiment");
                        if (!ownerSelected && phase == PHASE_OUTER_CALL) {
                            if (tid == 0 || c.Eip != callSiteAddress || (c.Dr6 & 1u) == 0 ||
                                (c.Dr6 & 0x400eu) != 0 || state.Breakpoints[0] != callSiteAddress)
                                throw new InvalidOperationException("Outer event did not match the selected PREMIUM execute breakpoint");
                            CheckHardwareCause(c, 0);
                            byte[] bytes = ReadExact(process, callSiteAddress, ExpectedOuterCall.Length);
                            if (BytesHex(bytes) != BytesHex(ExpectedOuterCall))
                                throw new InvalidOperationException("Live PREMIUM CALL bytes changed before the breakpoint hit");
                            uint operand;
                            Dictionary<string, object> slot = ReadSlot(process, "EDI", c.Edi,
                                OUTER_CALL_SLOT_OFFSET, out operand);
                            if (operand == 0 || operand == callSiteAddress || c.Esp < 4u || callSiteAddress > UInt32.MaxValue - 3u)
                                throw new InvalidOperationException("Outer measured destination/stack address is invalid");
                            Dictionary<string, object> targetPage = ReadPagePreview(process, operand);
                            ownerSelected = true;
                            ownerTid = tid;
                            outerTarget = operand;
                            outerEsp = c.Esp;
                            outerContinuation = callSiteAddress + 3u;
                            result["selectedThreadId"] = tid;
                            eventCount++;
                            if (eventCount > MAX_BREAKPOINT_EVENTS)
                                throw new InvalidOperationException("Hardware breakpoint event cap reached");
                            Dictionary<string, object> outerCallEvent = EventRecord((uint)eventCount,
                                "source-hit", "PREMIUM-CALL-EDI+27", 0, tid, debugEvent, c, bytes,
                                new Dictionary<string, object> { { "operand", slot } });
                            events.Add(outerCallEvent);
                            call["hit"] = true; call["status"] = "outer-call-execute-breakpoint-hit";
                            call["threadId"] = tid; call["preCallRegisters"] = RegisterRecord(c, tid);
                            call["preCallDispatchSlot"] = slot; call["armedContextReadback"] = ArmReadback(state, tid);
                            outer["status"] = "destination-breakpoint-armed";
                            outer["targetEip"] = Hex(outerTarget); outer["targetPage"] = targetPage;
                            try { RestoreThreadsSafely(process, threads, ownerTid, false, restorations); }
                            catch { restorationFailureObserved = true; throw; }
                            ConfigureSlot(state, 0, outerTarget);
                            outerDestinationArmed = true;
                            phase = PHASE_OUTER_DESTINATION;
                            result["callDebugRegistersRestoredBeforeDestination"] = true;
                            pendingStatus = DBG_CONTINUE;
                        } else if (tid != ownerTid) {
                            throw new InvalidOperationException("Hardware execute-breakpoint event came from a wrong thread");
                        } else if (phase == PHASE_OUTER_DESTINATION) {
                            if (!outerDestinationArmed || c.Eip != outerTarget || state.Breakpoints[0] != outerTarget)
                                throw new InvalidOperationException("Outer destination event did not match the measured dynamic target");
                            CheckHardwareCause(c, 0);
                            if (c.Esp != outerEsp - 4u)
                                throw new InvalidOperationException("Outer CALL destination ESP did not decrease by four");
                            Dictionary<string, object> stack = ReadStackDword(process, c.Esp);
                            if ((string)stack["value"] != Hex(outerContinuation))
                                throw new InvalidOperationException("Outer CALL destination stack return is not callSite+3");
                            Dictionary<string, object> page = ReadPagePreview(process, c.Eip);
                            Dictionary<string, object> window = ReadTargetWindow(process, c.Eip,
                                expectedWindowStart, referenceWindowSha256, instructionProfileSha256);
                            result["targetWindow"] = window;
                            if (!(bool)window["validationPassed"])
                                throw new InvalidOperationException("The live 256-byte window failed complete-region, EIP-offset, or exact 11-span REA instruction-profile validation");
                            windowStart = checked((uint)((ulong)c.Eip - 128UL));
                            callSite = checked(windowStart + CALL_OFFSET);
                            jumpSite = checked(windowStart + JMP_OFFSET);
                            if ((ulong)callSite + (ulong)ExpectedInnerCall.Length > (ulong)windowStart + (ulong)WINDOW_BYTES ||
                                (ulong)jumpSite + (ulong)ExpectedInnerJmp.Length > (ulong)windowStart + (ulong)WINDOW_BYTES ||
                                outerTarget == callSite || outerTarget == jumpSite || callSite == jumpSite ||
                                outerContinuation == callSite || outerContinuation == jumpSite || outerContinuation == outerTarget)
                                throw new InvalidOperationException("Derived internal sites overlap or leave the validated window");
                            outer["hit"] = true; outer["status"] = "outer-destination-hit-before-instruction";
                            outer["targetRegisters"] = RegisterRecord(c, tid);
                            outer["returnAddressAtEsp"] = stack; outer["targetPage"] = page;
                            sites.Add(MakeSite("CALL-EDI+35F", CALL_OFFSET, ExpectedInnerCall, callSite));
                            sites.Add(MakeSite("JMP-ESI+12", JMP_OFFSET, ExpectedInnerJmp, jumpSite));
                            eventCount++;
                            if (eventCount > MAX_BREAKPOINT_EVENTS)
                                throw new InvalidOperationException("Hardware breakpoint event cap reached");
                            events.Add(EventRecord((uint)eventCount, "destination-hit", "PREMIUM-outer-destination",
                                0, tid, debugEvent, c, BytesFromHex((string)page["bytesHex"]),
                                new Dictionary<string, object> { { "targetPage", page }, { "returnAddressAtEsp", stack } }));
                            ConfigureSlot(state, 0, callSite);
                            ConfigureSlot(state, 1, jumpSite);
                            ConfigureSlot(state, 2, outerContinuation);
                            Dictionary<string, object> readback0 = ArmReadback(state, tid);
                            if ((string)readback0["dr0"] != Hex(callSite) ||
                                (string)readback0["dr1"] != Hex(jumpSite) ||
                                (string)readback0["dr2"] != Hex(outerContinuation))
                                throw new InvalidOperationException("Internal source/return-guard breakpoints failed readback");
                            Dictionary<string, object> guard = (Dictionary<string, object>)result["outerReturnGuard"];
                            guard["address"] = Hex(outerContinuation);
                            guard["armed"] = true;
                            guard["armReadback"] = readback0;
                            guard["status"] = "armed-before-required-tail-jmp";
                            result["internalBreakpointsArmed"] = readback0;
                            phase = PHASE_INTERNAL;
                            outerDestinationArmed = false;
                            pendingStatus = DBG_CONTINUE;
                        } else if (phase == PHASE_INTERNAL) {
                            if (c.Eip == outerContinuation && state.Breakpoints[2] == outerContinuation) {
                                CheckHardwareCause(c, 2);
                                Dictionary<string, object> stack = ReadStackDword(process, c.Esp);
                                eventCount++;
                                if (eventCount > MAX_BREAKPOINT_EVENTS)
                                    throw new InvalidOperationException("Hardware breakpoint event cap reached");
                                Dictionary<string, object> guard = (Dictionary<string, object>)result["outerReturnGuard"];
                                guard["hit"] = true;
                                guard["status"] = "outer-return-before-required-tail-jmp";
                                guard["hitEventOrder"] = eventCount;
                                guard["hitThreadId"] = tid;
                                guard["hitEsp"] = Hex(c.Esp);
                                guard["stackAtEsp"] = stack;
                                events.Add(EventRecord((uint)eventCount, "return-guard-hit", "PREMIUM-outer-continuation",
                                    2, tid, debugEvent, c, ReadExact(process, c.Eip, 1),
                                    new Dictionary<string, object> { { "stackAtEsp", stack } }));
                                AddError(result, "Outer call continuation executed before the required JMP [ESI+0x12] destination edge",
                                    "outer-return-before-required-tail-jmp");
                                phase = PHASE_DONE;
                                pendingStatus = DBG_CONTINUE;
                            } else if (pendingTransfer != null) {
                                int slot = pendingTransfer.Slot;
                                if (c.Eip != pendingTransfer.TargetAddress || state.Breakpoints[slot] != pendingTransfer.TargetAddress)
                                    throw new InvalidOperationException("Another event occurred before the measured destination breakpoint");
                                CheckHardwareCause(c, slot);
                                if (pendingTransfer.Site == "CALL-EDI+35F") {
                                    if (pendingTransfer.SourceEsp < 4u || c.Esp != pendingTransfer.SourceEsp - 4u)
                                        throw new InvalidOperationException("Inner CALL destination ESP did not decrease by four");
                                    uint expectedReturn = checked(pendingTransfer.SiteAddress + 6u);
                                    Dictionary<string, object> stack = ReadStackDword(process, c.Esp);
                                    if ((string)stack["value"] != Hex(expectedReturn))
                                        throw new InvalidOperationException("Inner CALL destination stack dword is not site+6");
                                    Dictionary<string, object> page = ReadPagePreview(process, c.Eip);
                                    eventCount++;
                                    if (eventCount > MAX_BREAKPOINT_EVENTS)
                                        throw new InvalidOperationException("Hardware breakpoint event cap reached");
                                    Dictionary<string, object> edge = new Dictionary<string, object> {
                                        { "site", pendingTransfer.Site }, { "threadId", tid },
                                        { "sourceEventOrder", pendingTransfer.SourceOrder }, { "destinationEventOrder", eventCount },
                                        { "sourceAddress", Hex(pendingTransfer.SiteAddress) },
                                        { "targetAddress", Hex(pendingTransfer.TargetAddress) },
                                        { "sameThread", true }, { "firstChance", true },
                                        { "hardwareBreakpointSlot", slot }, { "dr6BsSet", false },
                                        { "sourceEsp", Hex(pendingTransfer.SourceEsp) }, { "targetEsp", Hex(c.Esp) },
                                        { "espDecrementedByFour", true }, { "returnAddressAtEsp", stack },
                                        { "returnAddressMatchesSitePlusSix", true }, { "targetPage", page }
                                    };
                                    edges.Add(edge);
                                    Dictionary<string, object> destEvent = EventRecord((uint)eventCount,
                                        "destination-hit", pendingTransfer.Site, slot, tid, debugEvent, c,
                                        BytesFromHex((string)page["bytesHex"]),
                                        new Dictionary<string, object> { { "targetPage", page }, { "returnAddressAtEsp", stack } });
                                    events.Add(destEvent);
                                    FindSite(sites, pendingTransfer.Site)["destinationHitCount"] =
                                        (int)FindSite(sites, pendingTransfer.Site)["destinationHitCount"] + 1;
                                } else {
                                    if (c.Esp != pendingTransfer.SourceEsp)
                                        throw new InvalidOperationException("Inner JMP destination ESP changed");
                                    Dictionary<string, object> destinationStack = ReadStackDword(process, c.Esp);
                                    Dictionary<string, object> page = ReadPagePreview(process, c.Eip);
                                    eventCount++;
                                    if (eventCount > MAX_BREAKPOINT_EVENTS)
                                        throw new InvalidOperationException("Hardware breakpoint event cap reached");
                                    edges.Add(new Dictionary<string, object> {
                                        { "site", pendingTransfer.Site }, { "threadId", tid },
                                        { "sourceEventOrder", pendingTransfer.SourceOrder }, { "destinationEventOrder", eventCount },
                                        { "sourceAddress", Hex(pendingTransfer.SiteAddress) },
                                        { "targetAddress", Hex(pendingTransfer.TargetAddress) },
                                        { "sameThread", true }, { "firstChance", true },
                                        { "hardwareBreakpointSlot", slot }, { "dr6BsSet", false },
                                        { "sourceEsp", Hex(pendingTransfer.SourceEsp) }, { "targetEsp", Hex(c.Esp) },
                                        { "espUnchanged", true }, { "sourceStackAtEsp", pendingTransfer.SourceStack },
                                        { "targetStackAtEsp", destinationStack }, { "targetPage", page }
                                    });
                                    events.Add(EventRecord((uint)eventCount, "destination-hit", pendingTransfer.Site,
                                        slot, tid, debugEvent, c, BytesFromHex((string)page["bytesHex"]),
                                        new Dictionary<string, object> {
                                            { "targetPage", page }, { "stackAtEsp", destinationStack }
                                        }));
                                    FindSite(sites, pendingTransfer.Site)["destinationHitCount"] =
                                        (int)FindSite(sites, pendingTransfer.Site)["destinationHitCount"] + 1;
                                }
                                ConfigureSlot(state, slot, pendingTransfer.SiteAddress);
                                string completedSite = pendingTransfer.Site;
                                pendingTransfer = null;
                                pendingStatus = DBG_CONTINUE;
                                if (completedSite == "JMP-ESI+12") {
                                    result["captureCompleted"] = true;
                                    result["terminalReason"] = "tail-jmp-destination-before-outer-continuation";
                                    ((Dictionary<string, object>)result["outerReturnGuard"])["status"] = "not-hit-before-accepted-tail-edge";
                                    phase = PHASE_DONE;
                                }
                            } else {
                                string siteName;
                                uint expectedSite;
                                byte[] expectedBytes;
                                int slot;
                                if (c.Eip == callSite) {
                                    siteName = "CALL-EDI+35F"; expectedSite = callSite;
                                    expectedBytes = ExpectedInnerCall; slot = 0;
                                } else if (c.Eip == jumpSite) {
                                    siteName = "JMP-ESI+12"; expectedSite = jumpSite;
                                    expectedBytes = ExpectedInnerJmp; slot = 1;
                                } else {
                                    throw new InvalidOperationException("Internal single-step event is not at either validated REA site");
                                }
                                if (state.Breakpoints[slot] != expectedSite)
                                    throw new InvalidOperationException("Internal site is not armed in its expected debug-register slot");
                                CheckHardwareCause(c, slot);
                                byte[] live = ReadExact(process, expectedSite, expectedBytes.Length);
                                if (BytesHex(live) != BytesHex(expectedBytes))
                                    throw new InvalidOperationException("REA site bytes changed after the target-window preflight");
                                Dictionary<string, object> operand;
                                uint target;
                                if (siteName == "CALL-EDI+35F")
                                    operand = ReadSlot(process, "EDI", c.Edi, INNER_CALL_OPERAND_OFFSET, out target);
                                else
                                    operand = ReadSlot(process, "ESI", c.Esi, INNER_JMP_OPERAND_OFFSET, out target);
                                if (target == 0 || target == expectedSite || target == (siteName == "CALL-EDI+35F" ? jumpSite : callSite) || target == outerContinuation)
                                    throw new InvalidOperationException("Computed transfer target is null or collides with a watched source/outer-return address");
                                Dictionary<string, object> page = ReadPagePreview(process, target);
                                eventCount++;
                                if (eventCount > MAX_BREAKPOINT_EVENTS)
                                    throw new InvalidOperationException("Hardware breakpoint event cap reached");
                                Dictionary<string, object> siteRecord = FindSite(sites, siteName);
                                int hits = (int)siteRecord["hitCount"] + 1;
                                if (hits > MAX_SITE_HITS)
                                    throw new InvalidOperationException("Candidate source-site hit cap reached");
                                siteRecord["hitCount"] = hits;
                                siteRecord["lastHitEventOrder"] = eventCount;
                                siteRecord["lastHitThreadId"] = tid;
                                siteRecord["status"] = "hit";
                                PendingTransfer next = new PendingTransfer {
                                    Site = siteName, Slot = slot, SiteAddress = expectedSite,
                                    SourceEsp = c.Esp, TargetAddress = target, SourceOrder = (uint)eventCount,
                                    SourceStack = siteName == "JMP-ESI+12" ? ReadStackDword(process, c.Esp) : null
                                };
                                Dictionary<string, object> extra = new Dictionary<string, object> {
                                    { "hitCount", hits }, { "operand", operand }, { "resolvedTarget", Hex(target) },
                                    { "targetPage", page }, { "eipOffsetFromWindow", expectedSite - windowStart },
                                    { "stackAtEsp", next.SourceStack }
                                };
                                events.Add(EventRecord((uint)eventCount, "source-hit", siteName, slot,
                                    tid, debugEvent, c, live, extra));
                                ConfigureSlot(state, slot, target);
                                Dictionary<string, object> arm = ArmReadback(state, tid);
                                if (GetReadbackDr(arm, slot) != Hex(target))
                                    throw new InvalidOperationException("Resolved destination breakpoint failed readback");
                                events[events.Count - 1]["destinationArmReadback"] = arm;
                                pendingTransfer = next;
                                pendingStatus = DBG_CONTINUE;
                            }
                        }
                    } else if (ownerSelected && tid == ownerTid && phase != PHASE_DONE) {
                        throw new InvalidOperationException("Selected thread raised an unexpected exception before capture completion");
                    }
                } else if (kind == 5) {
                    exited = true;
                    if (captureError == null) {
                        captureError = "Target process exited before the no-TF capture completed";
                        AddError(result, captureError, "process-exit");
                    }
                }
                if (phase == PHASE_DONE && result["captureCompleted"].Equals(false) && captureError == null)
                    AddError(result, "Debugger phase stopped before the required tail-JMP destination edge", "incomplete");
                if (phase == PHASE_DONE && result["captureCompleted"].Equals(true) && !debugRegistersRestored) {
                    try { RestoreThreadsSafely(process, threads, 0, true, restorations); }
                    catch { restorationFailureObserved = true; throw; }
                    debugRegistersRestored = true;
                    result["debugRegistersRestored"] = true;
                }
                if (!ContinueDebugEvent(pid, tid, pendingStatus))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                pending = false;
                if (exited) break;
            }
            if (!result["captureCompleted"].Equals(true) && captureError == null) {
                result["captureWindowExpired"] = timer.Elapsed.TotalSeconds >= seconds;
                captureError = pendingTransfer == null
                    ? "Capture ended before the required tail-JMP transfer destination was observed"
                    : "Capture ended while waiting for the resolved destination breakpoint";
                AddError(result, captureError, timer.Elapsed.TotalSeconds >= seconds ? "wall-clock-cap" : "incomplete");
            }
        } catch (Exception error) {
            captureError = error.GetType().Name + ": " + error.Message;
            AddError(result, captureError, "capture-error");
        } finally {
            bool restored = debugRegistersRestored;
            bool restorationFailed = false;
            bool terminationConfirmed = false;
            bool processSignaled = false;
            uint processWait = WAIT_FAILED;
            try { processWait = WaitForSingleObject(process, 0); }
            catch (Exception error) { cleanupErrors.Add("Could not inspect owned process before debug-state cleanup: " + error.Message); }
            if (processWait == WAIT_OBJECT_0) processSignaled = true;
            else if (processWait == WAIT_TIMEOUT && !restored) {
                if (restorationFailureObserved) {
                    cleanupErrors.Add("A prior suspended restoration attempt failed; refusing a retry that could hide a changed suspend count");
                } else {
                    try {
                        RestoreThreadsSafely(process, threads, 0, true, restorations);
                        restored = true;
                        debugRegistersRestored = true;
                    } catch (Exception error) {
                        restorationFailureObserved = true;
                        cleanupErrors.Add("Exact suspended debug-register restoration failed: " + error.Message);
                    }
                }
            } else if (processWait == WAIT_FAILED) {
                cleanupErrors.Add("Owned process liveness could not be confirmed during debug-state cleanup: " + Marshal.GetLastWin32Error());
            }
            result["debugRegistersRestored"] = restored;
            if (!restored && attached && !exited && !processSignaled) {
                restorationFailed = true;
                try {
                    EnableKillOnExit(cleanupErrors, "debug-state restoration abort");
                    if (!TerminateProcess(process, 0xdead))
                        cleanupErrors.Add("Owned-oracle termination after debug-state restore failure failed: " + Marshal.GetLastWin32Error());
                    else if (WaitForSingleObject(process, 5000) != WAIT_OBJECT_0)
                        cleanupErrors.Add("Owned-oracle termination after debug-state restore failure was not confirmed");
                    else terminationConfirmed = true;
                } catch (Exception error) { cleanupErrors.Add("Cleanup abort fallback: " + error.Message); }
            }
            if (pending && !exited && !restorationFailureObserved && !(restorationFailed && !terminationConfirmed)) {
                try {
                    uint status = processSignaled || cleanupErrors.Count != 0 ? DBG_CONTINUE : pendingStatus;
                    if (!ContinueDebugEvent(pid, pendingTid, status))
                        cleanupErrors.Add("Continue pending debug event failed: " + Marshal.GetLastWin32Error());
                    else pending = false;
                } catch (Exception error) { cleanupErrors.Add("Continue pending debug event: " + error.Message); }
            } else if (pending && !exited && restorationFailureObserved) {
                cleanupErrors.Add("Pending debug event was left uncontinued after suspended debug-register restoration failed");
                if (!processSignaled && !terminationConfirmed)
                    EnableKillOnExit(cleanupErrors, "unsafe pending-event cleanup");
            } else if (pending && !exited && restorationFailed && !terminationConfirmed) {
                cleanupErrors.Add("Pending debug event was left uncontinued because restored state and oracle termination could not be proven");
                EnableKillOnExit(cleanupErrors, "unsafe pending-event cleanup");
            }
            if (attached && !exited && !(restorationFailureObserved && pending) &&
                !(restorationFailed && !terminationConfirmed)) {
                try {
                    if (!DebugActiveProcessStop(pid))
                        cleanupErrors.Add("DebugActiveProcessStop failed: " + Marshal.GetLastWin32Error());
                    else { attached = false; result["detached"] = true; }
                } catch (Exception error) { cleanupErrors.Add("Debugger detach: " + error.Message); }
            } else if (exited) result["detached"] = true;
            result["readyPauseReleased"] = released;
            result["cleanupErrors"] = cleanupErrors;
            result["eventCount"] = eventCount;
            result["captureError"] = captureError;
            if (captureError != null && (string)result["terminalReason"] == "capturing") result["terminalReason"] = "capture-error";
            foreach (KeyValuePair<uint, ThreadState> item in threads)
                if (item.Value.Handle != IntPtr.Zero) CloseHandle(item.Value.Handle);
            Marshal.FreeHGlobal(debugEvent);
            CloseHandle(process);
        }
        return result;
    }

    static Dictionary<string, object> FindSite(List<Dictionary<string, object>> sites, string name)
    {
        foreach (Dictionary<string, object> site in sites)
            if ((string)site["name"] == name) return site;
        throw new InvalidOperationException("Unknown candidate site: " + name);
    }

    static string GetReadbackDr(Dictionary<string, object> readback, int slot)
    {
        return (string)readback["dr" + slot];
    }
}
