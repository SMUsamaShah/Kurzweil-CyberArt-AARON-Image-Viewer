using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// Bounded read-only WOW64 capture for PREMIUM's CALL [EDI+0x27]. This v2
// helper uses a second DR0 execute breakpoint at the operand read immediately
// before the CALL. It does not use or relax the v1 DR6.BS single-step gate.
// Target memory remains read-only; both breakpoint states are restored before
// detach. The caller must bind pid to its runner-owned READY request.
public static class AaronPremiumCallsiteDestinationBreakpointV1
{
    const uint DBG_CONTINUE = 0x00010002;
    const uint DBG_EXCEPTION_NOT_HANDLED = 0x80010001;
    const uint STATUS_BREAKPOINT = 0x80000003;
    const uint STATUS_WX86_BREAKPOINT = 0x4000001f;
    const uint STATUS_SINGLE_STEP = 0x80000004;
    const uint STATUS_WX86_SINGLE_STEP = 0x4000001e;
    const uint CONTEXT_CONTROL = 0x00010001;
    const uint CONTEXT_DEBUG_REGISTERS = 0x00010010;
    const uint CONTEXT_CONTROL_INTEGER_DEBUG = 0x00010013;
    const uint CONTEXT_AMD64_CONTROL_INTEGER_DEBUG = 0x00100013;
    const int AMD64_CONTEXT_SIZE = 1232;
    const uint EFLAGS_TF = 0x00000100;
    const uint DR6_BS = 0x00004000;
    const uint MEM_COMMIT = 0x00001000;
    const uint PAGE_NOACCESS = 0x00000001;
    const uint PAGE_GUARD = 0x00000100;
    const uint WAIT_OBJECT_0 = 0x00000000;
    const uint WAIT_TIMEOUT = 0x00000102;
    const uint WAIT_FAILED = 0xffffffff;
    const int PHASE_CALL = 0;
    const int PHASE_DESTINATION = 1;
    const int PHASE_DONE = 3;
    static readonly byte[] ExpectedCallBytes = new byte[] { 0xff, 0x57, 0x27 };

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
        [FieldOffset(188)] public uint SegCs;
        [FieldOffset(192)] public uint EFlags;
        [FieldOffset(196)] public uint Esp;
        [FieldOffset(200)] public uint SegSs;
    }

    // VirtualQueryEx returns the native 64-bit structure from this x64 helper,
    // including when the selected process is WOW64.
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
        public Wow64Context SavedDebugContext;
        public bool Armed;
        public uint BreakpointAddress;
        public bool StepTfArmed;
        public bool OriginalTf;
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
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetThreadContext(IntPtr thread, IntPtr context);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint SuspendThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadProcessMemory(IntPtr process,
        IntPtr address, [Out] byte[] bytes, UIntPtr size, out UIntPtr bytesRead);
    [DllImport("kernel32.dll", SetLastError = true)] static extern UIntPtr VirtualQueryEx(IntPtr process,
        IntPtr address, out MemoryBasicInformation information, UIntPtr length);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    static void Check(bool value)
    {
        if (!value) throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    static uint ReadU32(IntPtr buffer, int offset)
    {
        return unchecked((uint)Marshal.ReadInt32(buffer, offset));
    }

    static ulong ReadU64(IntPtr buffer, int offset)
    {
        return unchecked((ulong)Marshal.ReadInt64(buffer, offset));
    }

    static Dictionary<string, object> ExceptionEventRecord(IntPtr debugEvent, uint tid)
    {
        uint parameterCount = ReadU32(debugEvent, 40);
        int count = (int)Math.Min(parameterCount, 15u);
        List<string> information = new List<string>();
        for (int i = 0; i < count; i++)
            information.Add(Hex64(ReadU64(debugEvent, 48 + i * 8)));
        return new Dictionary<string, object> {
            { "code", Hex(ReadU32(debugEvent, 16)) },
            { "flags", Hex(ReadU32(debugEvent, 20)) },
            { "exceptionRecord", Hex64(ReadU64(debugEvent, 24)) },
            { "exceptionAddress", Hex64(ReadU64(debugEvent, 32)) },
            { "parameterCount", parameterCount },
            { "information", information },
            { "firstChance", ReadU32(debugEvent, 168) },
            { "threadId", tid }
        };
    }

    // Capture the native AMD64 view separately from WOW64_CONTEXT. The native
    // CONTEXT is 1232 bytes and 16-byte aligned; this record is diagnostic only
    // because its RIP may be in the WOW64 transition path rather than guest code.
    static Dictionary<string, object> NativeContextRecord(IntPtr thread)
    {
        IntPtr allocation = Marshal.AllocHGlobal(AMD64_CONTEXT_SIZE + 15);
        long alignedValue = (allocation.ToInt64() + 15L) & ~15L;
        IntPtr context = new IntPtr(alignedValue);
        try {
            for (int i = 0; i < AMD64_CONTEXT_SIZE; i++) Marshal.WriteByte(context, i, 0);
            Marshal.WriteInt32(context, 48, unchecked((int)CONTEXT_AMD64_CONTROL_INTEGER_DEBUG));
            bool retrieved = GetThreadContext(thread, context);
            if (!retrieved) {
                int error = Marshal.GetLastWin32Error();
                return new Dictionary<string, object> {
                    { "available", false }, { "errorCode", error },
                    { "error", new Win32Exception(error).Message },
                    { "requestedContextFlags", Hex(CONTEXT_AMD64_CONTROL_INTEGER_DEBUG) },
                    { "contextAlignment", (ulong)context.ToInt64() & 15UL }
                };
            }
            return new Dictionary<string, object> {
                { "available", true },
                { "requestedContextFlags", Hex(CONTEXT_AMD64_CONTROL_INTEGER_DEBUG) },
                { "contextFlags", Hex(ReadU32(context, 48)) },
                { "segCs", "0x" + unchecked((ushort)Marshal.ReadInt16(context, 56)).ToString("x4", CultureInfo.InvariantCulture) },
                { "eflags", Hex(ReadU32(context, 68)) },
                { "dr0", Hex64(ReadU64(context, 72)) },
                { "dr1", Hex64(ReadU64(context, 80)) },
                { "dr2", Hex64(ReadU64(context, 88)) },
                { "dr3", Hex64(ReadU64(context, 96)) },
                { "dr6", Hex64(ReadU64(context, 104)) },
                { "dr7", Hex64(ReadU64(context, 112)) },
                { "rsp", Hex64(ReadU64(context, 152)) },
                { "rip", Hex64(ReadU64(context, 248)) },
                { "contextAlignment", (ulong)context.ToInt64() & 15UL }
            };
        } finally {
            Marshal.FreeHGlobal(allocation);
        }
    }

    static string Hex(uint value)
    {
        return "0x" + value.ToString("x8", CultureInfo.InvariantCulture);
    }

    static string Hex64(ulong value)
    {
        return "0x" + value.ToString("x16", CultureInfo.InvariantCulture);
    }

    static string BytesHex(byte[] bytes)
    {
        return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
    }

    static IntPtr Address(uint address)
    {
        return new IntPtr(unchecked((long)address));
    }

    static Wow64Context GetContext(IntPtr thread, uint flags)
    {
        Wow64Context context = new Wow64Context();
        context.ContextFlags = flags;
        Check(Wow64GetThreadContext(thread, ref context));
        return context;
    }

    static void SetContext(IntPtr thread, Wow64Context context)
    {
        Check(Wow64SetThreadContext(thread, ref context));
    }

    static byte[] ReadExact(IntPtr process, uint address, int count)
    {
        byte[] bytes = new byte[count];
        UIntPtr read;
        Check(ReadProcessMemory(process, Address(address), bytes, (UIntPtr)count, out read));
        if (read.ToUInt64() != (ulong)count) throw new IOException("Short process-memory read");
        return bytes;
    }

    static Dictionary<string, object> RegisterRecord(Wow64Context context, uint tid)
    {
        return new Dictionary<string, object> {
            { "threadId", tid }, { "eip", Hex(context.Eip) }, { "esp", Hex(context.Esp) },
            { "eax", Hex(context.Eax) }, { "ebx", Hex(context.Ebx) },
            { "ecx", Hex(context.Ecx) }, { "edx", Hex(context.Edx) },
            { "esi", Hex(context.Esi) }, { "edi", Hex(context.Edi) },
            { "ebp", Hex(context.Ebp) }, { "eflags", Hex(context.EFlags) },
            { "dr6", Hex(context.Dr6) }
        };
    }

    static Dictionary<string, object> ReadDispatchSlot(IntPtr process, uint edi, out uint? value)
    {
        Dictionary<string, object> record = new Dictionary<string, object>();
        ulong address64 = (ulong)edi + 0x27UL;
        value = null;
        record["baseRegister"] = "EDI";
        record["baseValue"] = Hex(edi);
        record["offset"] = "0x00000027";
        if (address64 > uint.MaxValue) {
            record["address"] = null;
            record["value"] = null;
            record["bytesHex"] = null;
            record["readError"] = "EDI plus 0x27 exceeds the 32-bit address space";
            return record;
        }
        uint address = (uint)address64;
        record["address"] = Hex(address);
        try {
            byte[] bytes = ReadExact(process, address, 4);
            value = BitConverter.ToUInt32(bytes, 0);
            record["value"] = Hex(value.Value);
            record["bytesHex"] = BytesHex(bytes);
            record["readError"] = null;
        } catch (Exception error) {
            record["value"] = null;
            record["bytesHex"] = null;
            record["readError"] = error.GetType().Name + ": " + error.Message;
        }
        return record;
    }

    static Dictionary<string, object> ReadStackDword(IntPtr process, uint address)
    {
        Dictionary<string, object> record = new Dictionary<string, object>();
        record["address"] = Hex(address);
        try {
            byte[] bytes = ReadExact(process, address, 4);
            record["bytesHex"] = BytesHex(bytes);
            record["value"] = Hex(BitConverter.ToUInt32(bytes, 0));
            record["readError"] = null;
        } catch (Exception error) {
            record["bytesHex"] = null;
            record["value"] = null;
            record["readError"] = error.GetType().Name + ": " + error.Message;
        }
        return record;
    }

    static Dictionary<string, object> ReadDestinationWindow(IntPtr process, uint eip)
    {
        Dictionary<string, object> record = new Dictionary<string, object>();
        record["eip"] = Hex(eip);
        record["maximumBytes"] = 32;
        MemoryBasicInformation information = new MemoryBasicInformation();
        UIntPtr queried = VirtualQueryEx(process, Address(eip), out information,
            (UIntPtr)Marshal.SizeOf(typeof(MemoryBasicInformation)));
        if (queried.ToUInt64() == 0) {
            record["queryError"] = "VirtualQueryEx failed: " + Marshal.GetLastWin32Error();
            record["region"] = null;
            record["bytesHex"] = null;
            record["bytesRead"] = 0;
            record["requestedBytes"] = 0;
            record["readError"] = null;
            return record;
        }

        ulong baseAddress = unchecked((ulong)information.BaseAddress.ToInt64());
        ulong regionSize = information.RegionSize.ToUInt64();
        ulong endAddress = baseAddress + regionSize;
        Dictionary<string, object> region = new Dictionary<string, object> {
            { "baseAddress", Hex64(baseAddress) },
            { "allocationBase", Hex64(unchecked((ulong)information.AllocationBase.ToInt64())) },
            { "regionSize", Hex64(regionSize) },
            { "state", Hex(information.State) },
            { "protection", Hex(information.Protect) },
            { "allocationProtection", Hex(information.AllocationProtect) },
            { "type", Hex(information.Type) }
        };
        record["queryError"] = null;
        record["region"] = region;
        record["bytesHex"] = null;
        record["bytesRead"] = 0;
        record["requestedBytes"] = 0;
        record["readError"] = null;
        if ((ulong)eip < baseAddress || (ulong)eip >= endAddress || regionSize == 0) {
            record["readError"] = "VirtualQueryEx region does not contain the resulting EIP";
            return record;
        }
        if (information.State != MEM_COMMIT) {
            record["readError"] = "Resulting EIP is not in a committed region";
            return record;
        }
        uint protection = information.Protect & 0xffu;
        if (protection == PAGE_NOACCESS || (information.Protect & PAGE_GUARD) != 0) {
            record["readError"] = "Resulting EIP region is guarded or inaccessible";
            return record;
        }

        ulong remaining = endAddress - (ulong)eip;
        int requested = (int)Math.Min(32UL, remaining);
        byte[] bytes = new byte[requested];
        UIntPtr bytesRead;
        bool ok = ReadProcessMemory(process, Address(eip), bytes, (UIntPtr)requested, out bytesRead);
        ulong actual64 = Math.Min((ulong)requested, bytesRead.ToUInt64());
        int actual = (int)actual64;
        if (actual != bytes.Length) Array.Resize(ref bytes, actual);
        record["requestedBytes"] = requested;
        record["bytesRead"] = actual;
        record["bytesHex"] = BytesHex(bytes);
        if (!ok) record["readError"] = "ReadProcessMemory failed: " + Marshal.GetLastWin32Error();
        else if (actual != requested) record["readError"] = "ReadProcessMemory returned a short read";
        return record;
    }

    static void ArmBreakpoint(uint tid, uint address, Dictionary<uint, ThreadState> threads)
    {
        ThreadState state;
        if (!threads.TryGetValue(tid, out state)) {
            IntPtr handle = OpenThread(0x1a, false, tid);
            Check(handle != IntPtr.Zero);
            try {
                Wow64Context saved = GetContext(handle, CONTEXT_DEBUG_REGISTERS);
                if ((saved.Dr7 & 0xffu) != 0)
                    throw new InvalidOperationException("A debug-register breakpoint is already active in thread " + tid);
                state = new ThreadState { Handle = handle, SavedDebugContext = saved };
                threads.Add(tid, state);
            } catch {
                if (!threads.ContainsKey(tid)) CloseHandle(handle);
                throw;
            }
        }
        if (state.Armed) {
            if (state.BreakpointAddress != address)
                throw new InvalidOperationException("Thread already has a different helper breakpoint armed");
            return;
        }

        Wow64Context current = GetContext(state.Handle, CONTEXT_DEBUG_REGISTERS);
        if ((current.Dr7 & 0xffu) != 0)
            throw new InvalidOperationException("A debug-register breakpoint became active before the helper breakpoint was installed");
        current.Dr0 = address;
        current.Dr6 = 0;
        // Local DR0 execute breakpoint, length one; preserve DR1-DR3 fields.
        current.Dr7 = (current.Dr7 & ~0x000f0003u) | 1u;
        SetContext(state.Handle, current);
        state.OriginalTf = false;
        state.Armed = true;
        state.BreakpointAddress = address;
    }

    static void RestoreOne(ThreadState state)
    {
        if (!state.Armed) return;
        Wow64Context saved = state.SavedDebugContext;
        SetContext(state.Handle, saved);
        state.Armed = false;
        state.BreakpointAddress = 0;
    }

    static void RestoreThreads(Dictionary<uint, ThreadState> threads, bool processStopped,
        List<string> errors)
    {
        foreach (KeyValuePair<uint, ThreadState> item in threads) {
            ThreadState state = item.Value;
            if (!state.Armed) continue;
            bool suspended = false;
            try {
                if (!processStopped) {
                    if (SuspendThread(state.Handle) == 0xffffffffu)
                        throw new Win32Exception(Marshal.GetLastWin32Error());
                    suspended = true;
                }
                RestoreOne(state);
            } catch (Exception error) {
                errors.Add("Restore debug registers for thread " + item.Key + ": " + error.Message);
            } finally {
                if (suspended && ResumeThread(state.Handle) == 0xffffffffu)
                    errors.Add("Resume thread " + item.Key + " after debug-register restoration failed");
            }
        }
    }

    static void RestoreStepFlag(ThreadState state, bool processStopped, List<string> errors, uint tid)
    {
        if (!state.StepTfArmed) return;
        bool suspended = false;
        try {
            if (!processStopped) {
                if (SuspendThread(state.Handle) == 0xffffffffu)
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                suspended = true;
            }
            Wow64Context context = GetContext(state.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
            if (state.OriginalTf) context.EFlags |= EFLAGS_TF;
            else context.EFlags &= ~EFLAGS_TF;
            context.Dr0 = state.SavedDebugContext.Dr0;
            context.Dr1 = state.SavedDebugContext.Dr1;
            context.Dr2 = state.SavedDebugContext.Dr2;
            context.Dr3 = state.SavedDebugContext.Dr3;
            context.Dr6 = state.SavedDebugContext.Dr6;
            context.Dr7 = state.SavedDebugContext.Dr7;
            SetContext(state.Handle, context);
            state.StepTfArmed = false;
        } catch (Exception error) {
            errors.Add("Restore TF for thread " + tid + ": " + error.Message);
        } finally {
            if (suspended && ResumeThread(state.Handle) == 0xffffffffu)
                errors.Add("Resume thread " + tid + " after TF restoration failed");
        }
    }

    static bool TryWriteRelease(string releaseFile, string message, IntPtr process, List<string> errors)
    {
        if (String.IsNullOrEmpty(releaseFile)) {
            errors.Add("Release path is empty");
            return false;
        }
        if (process == IntPtr.Zero) return false;
        uint wait = WaitForSingleObject(process, 0);
        if (wait == WAIT_OBJECT_0) return false;
        if (wait == WAIT_FAILED) {
            errors.Add("Could not confirm the owned process is running before release: " + Marshal.GetLastWin32Error());
            return false;
        }
        if (wait != WAIT_TIMEOUT) {
            errors.Add("Unexpected process wait state before release: " + Hex(wait));
            return false;
        }
        try {
            // CreateNew preserves any unknown/reserved marker rather than
            // overwriting it. The caller's READY preflight should ensure absent.
            using (FileStream stream = new FileStream(releaseFile, FileMode.CreateNew, FileAccess.Write, FileShare.Read))
            using (StreamWriter writer = new StreamWriter(stream, new UTF8Encoding(false))) {
                writer.WriteLine(message);
            }
            return true;
        } catch (Exception error) {
            errors.Add("Release marker write failed: " + error.GetType().Name + ": " + error.Message);
            return false;
        }
    }

    static void EnableKillOnExit(List<string> errors, string context)
    {
        if (!DebugSetProcessKillOnExit(true))
            errors.Add(context + ": debugger-exit kill policy failed: " + Marshal.GetLastWin32Error());
        else
            errors.Add(context + ": debugger-exit kill policy enabled for the caller-verified disposable oracle");
    }

    static bool TerminateAndDetachOwnedProcess(IntPtr process, uint pid, bool pending,
        uint pendingTid, List<string> errors, string context, ref bool attached, ref bool detached)
    {
        if (!TerminateProcess(process, 0xdead)) {
            errors.Add(context + ": disposable oracle termination failed: " + Marshal.GetLastWin32Error());
            EnableKillOnExit(errors, context);
            return false;
        }
        errors.Add(context + ": disposable oracle termination requested after unsafe debugger cleanup");
        // A stopped debug event can prevent shutdown from completing. Resume
        // that event and detach before waiting on the process signal.
        if (pending && !ContinueDebugEvent(pid, pendingTid, DBG_CONTINUE))
            errors.Add(context + ": pending debug event could not be continued after termination: " + Marshal.GetLastWin32Error());
        if (DebugActiveProcessStop(pid)) {
            attached = false;
            detached = true;
        } else {
            int detachError = Marshal.GetLastWin32Error();
            // EXIT_PROCESS can itself be pending. Drain events for at most
            // five seconds so its acknowledgement can finish kernel shutdown.
            IntPtr terminationEvent = Marshal.AllocHGlobal(1024);
            Stopwatch deadline = Stopwatch.StartNew();
            try {
                while (deadline.ElapsedMilliseconds < 5000 && WaitForSingleObject(process, 0) == WAIT_TIMEOUT) {
                    if (!WaitForDebugEvent(terminationEvent, 100)) {
                        int waitError = Marshal.GetLastWin32Error();
                        if (waitError != 121) break;
                        continue;
                    }
                    uint eventKind = ReadU32(terminationEvent, 0);
                    uint eventPid = ReadU32(terminationEvent, 4);
                    uint eventTid = ReadU32(terminationEvent, 8);
                    if (eventKind == 3 || eventKind == 6) {
                        IntPtr file = Marshal.ReadIntPtr(terminationEvent, 16);
                        if (file != IntPtr.Zero) CloseHandle(file);
                    }
                    if (!ContinueDebugEvent(eventPid, eventTid, DBG_CONTINUE)) break;
                    if (eventKind == 5 && eventPid == pid) {
                        attached = false;
                        detached = true;
                        break;
                    }
                }
            } finally { Marshal.FreeHGlobal(terminationEvent); }
            if (!detached && WaitForSingleObject(process, 0) == WAIT_OBJECT_0) {
                attached = false;
                detached = true;
            }
            if (!detached) {
                errors.Add(context + ": detach after termination failed: " + detachError);
                EnableKillOnExit(errors, context);
                return false;
            }
        }
        uint wait = WaitForSingleObject(process, 5000);
        if (wait != WAIT_OBJECT_0) {
            errors.Add(context + ": terminated oracle did not signal after debug-event cleanup (wait=" + Hex(wait) + ")");
            return false;
        }
        return true;
    }

    public static Dictionary<string, object> Capture(uint pid, uint callSiteAddress,
        uint pickEntry, string releaseFile, int seconds)
    {
        if (pid == 0) throw new ArgumentOutOfRangeException("pid");
        if (callSiteAddress == 0) throw new ArgumentOutOfRangeException("callSiteAddress");
        if (seconds < 10 || seconds > 180) throw new ArgumentOutOfRangeException("seconds");
        if (String.IsNullOrEmpty(releaseFile)) throw new ArgumentException("A runner-owned release path is required", "releaseFile");
        if (IntPtr.Size != 8) throw new InvalidOperationException("Use x64 PowerShell for the WOW64 debugger");

        Dictionary<string, object> result = null;
        Exception failure = null;
        Thread debugger = new Thread(delegate() {
            try { result = CaptureOnDebuggerThread(pid, callSiteAddress, pickEntry, releaseFile, seconds); }
            catch (Exception error) { failure = error; }
        });
        debugger.Name = "AARON PREMIUM call-site destination breakpoint v1";
        debugger.Start();
        debugger.Join();
        if (failure != null) throw new InvalidOperationException(failure.Message, failure);
        return result;
    }

    static Dictionary<string, object> CaptureOnDebuggerThread(uint pid, uint callSiteAddress,
        uint pickEntry, string releaseFile, int seconds)
    {
        const uint processAccess = 0x00100411; // SYNCHRONIZE | TERMINATE | VM_READ | QUERY_INFORMATION
        IntPtr process = OpenProcess(processAccess, false, pid);
        Check(process != IntPtr.Zero);
        bool wow64 = false;
        try { Check(IsWow64Process(process, out wow64)); }
        catch { CloseHandle(process); throw; }
        if (!wow64) {
            CloseHandle(process);
            throw new InvalidOperationException("The selected process is not a WOW64 32-bit process");
        }

        IntPtr debugEvent = Marshal.AllocHGlobal(1024);
        Dictionary<uint, ThreadState> threads = new Dictionary<uint, ThreadState>();
        List<string> exceptions = new List<string>();
        List<string> cleanupErrors = new List<string>();
        Stopwatch timer = Stopwatch.StartNew();
        int phase = PHASE_CALL;
        bool attached = false;
        bool attachSucceeded = false;
        bool pending = false;
        bool exited = false;
        bool detached = false;
        bool released = false;
        bool callSiteValidated = false;
        bool callSiteBytesAtAttachMatched = false;
        bool callHit = false;
        bool callStepped = false;
        bool pickEntryObserved = false;
        bool targetExitEventObserved = false;
        bool captureWindowExpired = false;
        uint pendingTid = 0;
        uint pendingStatus = DBG_CONTINUE;
        uint steppingTid = 0;
        ThreadState steppingState = null;
        bool callDebugRegistersRestored = false;
        string captureError = null;
        uint? preCallSlotValue = null;
        uint preCallEsp = 0;
        uint expectedContinuation = unchecked(callSiteAddress + 3u);

        Dictionary<string, object> callSiteValidation = new Dictionary<string, object> {
            { "address", Hex(callSiteAddress) }, { "expectedBytesHex", BytesHex(ExpectedCallBytes) },
            { "observedBytesHex", null }, { "matched", false }, { "readError", null },
            { "bytesAtAttachMatched", null }, { "bytesAtHitHex", null }, { "bytesAtHitMatched", null }
        };
        Dictionary<string, object> call = new Dictionary<string, object> {
            { "status", "not-observed-within-capture-window" }, { "hit", false },
            { "threadId", null }, { "preCallRegisters", null }, { "preCallDispatchSlot", null }
        };
        Dictionary<string, object> destinationBreakpoint = new Dictionary<string, object> {
            { "attempted", false }, { "hit", false }, { "completed", false },
            { "expectedAddress", null }, { "targetEip", null }, { "targetEsp", null },
            { "targetRegisters", null }, { "returnAddressAtEsp", null },
            { "addressMatchesPreCallSlot", false }, { "destinationWindow", null },
            { "hitExceptionEvent", null }, { "firstChance", false }, { "dr6B0Set", false },
            { "espDecrementedByFour", false }, { "returnAddressMatchesCallContinuation", false },
            { "debugRegistersRestored", false }, { "status", "not-armed" }, { "error", null },
            { "expectedContinuation", Hex(expectedContinuation) }
        };
        Dictionary<string, object> pickObservation = new Dictionary<string, object> {
            { "configuredEntryAddress", pickEntry == 0 ? null : (object)Hex(pickEntry) },
            { "status", pickEntry == 0 ? "not-configured" : "not-yet-observed" },
            { "observed", false }, { "threadId", null }, { "sameThreadAsCall", null },
            { "eip", null }, { "esp", null }, { "eflags", null },
            { "expectedSavedStackValue", Hex(unchecked(callSiteAddress + 3u)) },
            { "savedStackValue", null }, { "savedStackValueMatchesCallContinuation", null },
            { "stackReadError", null }, { "observationPoint", null }, { "error", null }
        };
        pickObservation["sameOriginalStackFrame"] = false;
        pickObservation["deferredCorrelationEnabled"] = false;

        try {
            Check(DebugActiveProcess(pid));
            attached = true;
            attachSucceeded = true;
            Check(DebugSetProcessKillOnExit(false));

            while (timer.Elapsed.TotalSeconds < seconds && phase != PHASE_DONE) {
                if (!WaitForDebugEvent(debugEvent, 100)) {
                    int waitError = Marshal.GetLastWin32Error();
                    if (waitError != 121) throw new Win32Exception(waitError);
                    continue;
                }

                pending = true;
                uint kind = ReadU32(debugEvent, 0);
                uint eventPid = ReadU32(debugEvent, 4);
                uint tid = ReadU32(debugEvent, 8);
                pendingTid = tid;
                pendingStatus = DBG_CONTINUE;
                if (eventPid != pid) throw new InvalidOperationException("Unexpected debug-event process ID");

                if (kind == 3 || kind == 6) {
                    IntPtr fileHandle = Marshal.ReadIntPtr(debugEvent, 16);
                    if (fileHandle != IntPtr.Zero) CloseHandle(fileHandle);
                }
                // CREATE_PROCESS / CREATE_THREAD event handles are owned by
                // the debug-event contract and are closed by the system when
                // corresponding exit event is continued. Our separately opened process and
                // thread handles are tracked in `process` and `threads`.
                if (kind == 4 && threads.ContainsKey(tid)) {
                    CloseHandle(threads[tid].Handle);
                    threads.Remove(tid);
                    if (tid == steppingTid) steppingState = null;
                    if (phase == PHASE_DESTINATION && tid == steppingTid) {
                        captureError = "Selected call thread exited before the destination breakpoint";
                        destinationBreakpoint["error"] = captureError;
                        phase = PHASE_DONE;
                    }
                }

                // At the first attach stop, validate the live bytes before any
                // breakpoint is armed or the READY pause is released.
                if (!callSiteValidated && kind != 5) {
                    try {
                        byte[] live = ReadExact(process, callSiteAddress, 3);
                        string observed = BytesHex(live);
                        callSiteValidation["observedBytesHex"] = observed;
                        callSiteBytesAtAttachMatched = live[0] == ExpectedCallBytes[0] &&
                            live[1] == ExpectedCallBytes[1] && live[2] == ExpectedCallBytes[2];
                        callSiteValidation["matched"] = callSiteBytesAtAttachMatched;
                        callSiteValidation["bytesAtAttachMatched"] = callSiteBytesAtAttachMatched;
                        callSiteValidated = true;
                        if (!callSiteBytesAtAttachMatched)
                            captureError = "Current call-site bytes do not equal FF 57 27";
                    } catch (Exception error) {
                        callSiteValidation["readError"] = error.GetType().Name + ": " + error.Message;
                        captureError = "Could not validate the current three-byte call site: " + error.Message;
                    }
                }

                if ((kind == 3 || kind == 2) && phase == PHASE_CALL &&
                    callSiteBytesAtAttachMatched && captureError == null) {
                    ArmBreakpoint(tid, callSiteAddress, threads);
                }

                if (kind == 1) {
                    uint code = ReadU32(debugEvent, 16);
                    uint firstChance = ReadU32(debugEvent, 168);
                    if (exceptions.Count < 64)
                        exceptions.Add("code=" + Hex(code) + " firstChance=" + firstChance + " threadId=" + tid);

                    pendingStatus = DBG_EXCEPTION_NOT_HANDLED;
                    if (!released && firstChance == 1 &&
                        (code == STATUS_BREAKPOINT || code == STATUS_WX86_BREAKPOINT)) {
                        pendingStatus = DBG_CONTINUE;
                        if (captureError == null && (!callSiteValidated || !callSiteBytesAtAttachMatched))
                            captureError = "Call-site validation did not complete before READY pause release";
                        if (callSiteBytesAtAttachMatched && captureError == null && threads.Count == 0)
                            captureError = "No thread accepted the call-site hardware breakpoint";
                        released = TryWriteRelease(releaseFile,
                            captureError == null ? "PREMIUM call-site hardware breakpoint armed" : "PREMIUM call-site capture setup failed",
                            process, cleanupErrors);
                        if (!released && captureError == null)
                            captureError = "Could not release the runner-owned READY pause";
                        if (captureError != null) phase = PHASE_DONE;
                    } else if (code == STATUS_SINGLE_STEP || code == STATUS_WX86_SINGLE_STEP) {
                        pendingStatus = DBG_EXCEPTION_NOT_HANDLED;
                        ThreadState eventThread;
                        if (phase == PHASE_CALL && threads.TryGetValue(tid, out eventThread)) {
                            Wow64Context atCall = GetContext(eventThread.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
                            if (firstChance == 1 && atCall.Eip == callSiteAddress && (atCall.Dr6 & 1u) != 0 && eventThread.Armed) {
                                pendingStatus = DBG_CONTINUE;
                                callHit = true;
                                call["status"] = "stopped-before-call";
                                call["hit"] = true;
                                call["threadId"] = tid;
                                call["preCallRegisters"] = RegisterRecord(atCall, tid);

                                byte[] bytesAtHit = null;
                                try { bytesAtHit = ReadExact(process, callSiteAddress, 3); }
                                catch (Exception error) {
                                    call["bytesAtHitReadError"] = error.GetType().Name + ": " + error.Message;
                                }
                                bool bytesAtHitMatched = bytesAtHit != null &&
                                    bytesAtHit[0] == ExpectedCallBytes[0] &&
                                    bytesAtHit[1] == ExpectedCallBytes[1] &&
                                    bytesAtHit[2] == ExpectedCallBytes[2];
                                callSiteValidation["bytesAtHitHex"] = bytesAtHit == null ? null : BytesHex(bytesAtHit);
                                callSiteValidation["bytesAtHitMatched"] = bytesAtHit == null ? (object)null : bytesAtHitMatched;
                                call["bytesAtHitHex"] = bytesAtHit == null ? null : BytesHex(bytesAtHit);
                                call["bytesAtHitMatched"] = bytesAtHit == null ? (object)null : bytesAtHitMatched;

                                Dictionary<string, object> slot = ReadDispatchSlot(process, atCall.Edi, out preCallSlotValue);
                                call["preCallDispatchSlot"] = slot;
                                destinationBreakpoint["preCallEip"] = Hex(atCall.Eip);
                                preCallEsp = atCall.Esp;

                                RestoreThreads(threads, true, cleanupErrors);
                                if (cleanupErrors.Count != 0)
                                    throw new InvalidOperationException("Could not restore original debug registers before arming the destination breakpoint");
                                callDebugRegistersRestored = true;

                                if (!bytesAtHitMatched) {
                                    call["status"] = "callsite-bytes-changed-before-execution";
                                    captureError = "The stopped instruction no longer equals FF 57 27; it was not stepped";
                                    phase = PHASE_DONE;
                                } else if (!preCallSlotValue.HasValue || preCallSlotValue.Value == 0 ||
                                    preCallSlotValue.Value == callSiteAddress) {
                                    call["status"] = "call-hit-slot-read-failed";
                                    captureError = "The pre-call destination is unreadable, null, or equals the call site; refusing to arm it";
                                    destinationBreakpoint["error"] = captureError;
                                    phase = PHASE_DONE;
                                } else {
                                    Wow64Context atCallAgain = GetContext(eventThread.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
                                    if (atCallAgain.Eip != callSiteAddress)
                                        throw new InvalidOperationException("Selected EIP changed before the destination breakpoint was armed");
                                    if ((atCallAgain.EFlags & EFLAGS_TF) != 0)
                                        throw new InvalidOperationException("Selected call thread already had TF set; refusing an ambiguous destination capture");
                                    destinationBreakpoint["expectedAddress"] = Hex(preCallSlotValue.Value);
                                    destinationBreakpoint["attempted"] = true;
                                    steppingState = eventThread;
                                    steppingTid = tid;
                                    ArmBreakpoint(tid, preCallSlotValue.Value, threads);
                                    Wow64Context armed = GetContext(eventThread.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
                                    destinationBreakpoint["armedContextReadback"] = RegisterRecord(armed, tid);
                                    destinationBreakpoint["armedDr0"] = Hex(armed.Dr0);
                                    destinationBreakpoint["armedDr6"] = Hex(armed.Dr6);
                                    destinationBreakpoint["armedDr7"] = Hex(armed.Dr7);
                                    if (!eventThread.Armed || eventThread.BreakpointAddress != preCallSlotValue.Value || armed.Dr0 != preCallSlotValue.Value) {
                                        destinationBreakpoint["status"] = "breakpoint-arm-readback-mismatch";
                                        destinationBreakpoint["error"] = "WOW64 context did not retain the requested DR0 execute breakpoint";
                                        captureError = (string)destinationBreakpoint["error"];
                                        phase = PHASE_DONE;
                                    } else {
                                        destinationBreakpoint["status"] = "destination-execute-breakpoint-armed";
                                        phase = PHASE_DESTINATION;
                                    }
                                }
                            } else if (firstChance != 1 && atCall.Eip == callSiteAddress &&
                                (atCall.Dr6 & 1u) != 0 && eventThread.Armed) {
                                // The terminal-event path restores our DR state
                                // before forwarding this exception to the target.
                                captureError = "Call-site breakpoint was not a first-chance exception";
                                call["status"] = "non-first-chance-callsite-exception";
                                phase = PHASE_DONE;
                            }
                        } else if (phase == PHASE_DESTINATION && tid == steppingTid &&
                            threads.TryGetValue(tid, out eventThread) && eventThread.Armed &&
                            preCallSlotValue.HasValue && eventThread.BreakpointAddress == preCallSlotValue.Value) {
                            Wow64Context atTarget = GetContext(eventThread.Handle, CONTEXT_CONTROL_INTEGER_DEBUG);
                            bool firstChanceTarget = firstChance == 1;
                            bool dr6B0Set = (atTarget.Dr6 & 1u) != 0;
                            bool expectedTarget = atTarget.Eip == preCallSlotValue.Value;
                            if (firstChanceTarget && dr6B0Set && expectedTarget) {
                                pendingStatus = DBG_CONTINUE;
                                destinationBreakpoint["hit"] = true;
                                destinationBreakpoint["hitExceptionEvent"] = ExceptionEventRecord(debugEvent, tid);
                                destinationBreakpoint["firstChance"] = true;
                                destinationBreakpoint["dr6B0Set"] = true;
                                destinationBreakpoint["targetEip"] = Hex(atTarget.Eip);
                                destinationBreakpoint["targetEsp"] = Hex(atTarget.Esp);
                                destinationBreakpoint["targetRegisters"] = RegisterRecord(atTarget, tid);
                                Dictionary<string, object> targetStack = ReadStackDword(process, atTarget.Esp);
                                destinationBreakpoint["returnAddressAtEsp"] = targetStack;
                                destinationBreakpoint["destinationWindow"] = ReadDestinationWindow(process, atTarget.Eip);
                                destinationBreakpoint["addressMatchesPreCallSlot"] = true;
                                bool expectedEsp = atTarget.Esp == unchecked(preCallEsp - 4u);
                                bool expectedStack = targetStack["value"] != null &&
                                    String.Equals((string)targetStack["value"], Hex(expectedContinuation), StringComparison.OrdinalIgnoreCase);
                                destinationBreakpoint["espDecrementedByFour"] = expectedEsp;
                                destinationBreakpoint["returnAddressMatchesCallContinuation"] = expectedStack;

                                RestoreThreads(threads, true, cleanupErrors);
                                if (cleanupErrors.Count != 0)
                                    throw new InvalidOperationException("Could not restore original debug registers at the destination breakpoint");
                                destinationBreakpoint["debugRegistersRestored"] = true;
                                pendingStatus = DBG_CONTINUE;
                                bool validTarget = expectedTarget && expectedEsp && expectedStack;
                                if (!validTarget) {
                                    destinationBreakpoint["status"] = "destination-stack-evidence-mismatch";
                                    captureError = "Destination breakpoint did not satisfy the same-thread CALL stack invariants";
                                    destinationBreakpoint["error"] = captureError;
                                    call["status"] = "destination-hit-stack-unverified";
                                } else {
                                    destinationBreakpoint["completed"] = true;
                                    destinationBreakpoint["status"] = "destination-execute-breakpoint-hit-before-instruction";
                                    callStepped = true;
                                    call["status"] = "call-destination-captured";
                                    if (atTarget.Eip == pickEntry) {
                                        pickEntryObserved = true;
                                        pickObservation["status"] = "observed-at-destination-breakpoint-before-entry-instruction";
                                        pickObservation["observed"] = true;
                                        pickObservation["threadId"] = tid;
                                        pickObservation["sameThreadAsCall"] = tid == steppingTid;
                                        pickObservation["sameOriginalStackFrame"] = true;
                                        pickObservation["eip"] = Hex(atTarget.Eip);
                                        pickObservation["esp"] = Hex(atTarget.Esp);
                                        pickObservation["eflags"] = Hex(atTarget.EFlags);
                                        pickObservation["savedStackValue"] = targetStack["value"];
                                        pickObservation["stackReadError"] = targetStack["readError"];
                                        pickObservation["savedStackValueMatchesCallContinuation"] = expectedStack;
                                        pickObservation["observationPoint"] = "hardware execute breakpoint before the first destination instruction";
                                    } else if (pickEntry != 0) {
                                        pickObservation["status"] = "direct-destination-differs-from-current-PICK-entry";
                                    }
                                }
                                phase = PHASE_DONE;
                            } else {
                                pendingStatus = DBG_EXCEPTION_NOT_HANDLED;
                                destinationBreakpoint["status"] = "destination-breakpoint-event-mismatch";
                                captureError = "DR0 event did not match a first-chance breakpoint at the measured CALL destination";
                                destinationBreakpoint["error"] = captureError;
                                phase = PHASE_DONE;
                            }
                        } else if (phase == PHASE_DESTINATION && tid == steppingTid) {
                            pendingStatus = DBG_EXCEPTION_NOT_HANDLED;
                            ThreadState targetState;
                            if (threads.TryGetValue(tid, out targetState) && targetState.Armed) {
                                destinationBreakpoint["hitExceptionEvent"] = ExceptionEventRecord(debugEvent, tid);
                                destinationBreakpoint["status"] = "selected-thread-exception-before-destination-breakpoint";
                                destinationBreakpoint["error"] = "Selected call thread raised exception " + Hex(code) + " before the destination execute breakpoint";
                                captureError = (string)destinationBreakpoint["error"];
                                phase = PHASE_DONE;
                            }
                        }
                    } else if (phase == PHASE_DESTINATION && tid == steppingTid) {
                        pendingStatus = DBG_EXCEPTION_NOT_HANDLED;
                        ThreadState targetState;
                        if (threads.TryGetValue(tid, out targetState) && targetState.Armed) {
                            destinationBreakpoint["hitExceptionEvent"] = ExceptionEventRecord(debugEvent, tid);
                            destinationBreakpoint["status"] = "selected-thread-exception-before-destination-breakpoint";
                            destinationBreakpoint["error"] = "Selected call thread raised exception " + Hex(code) + " before the destination execute breakpoint";
                            captureError = (string)destinationBreakpoint["error"];
                            phase = PHASE_DONE;
                        }
                    }
                } else if (kind == 5) {
                    exited = true;
                    targetExitEventObserved = true;
                    pendingStatus = DBG_CONTINUE;
                    if (!callHit && captureError == null)
                        captureError = "Target exited before the PREMIUM call site was observed";
                    if (callHit && !callStepped && captureError == null)
                        captureError = "Target exited before the selected CALL destination breakpoint completed";
                    if (callStepped && pickEntry != 0 && !pickEntryObserved)
                        pickObservation["status"] = "target-exited-before-entry-observation";
                }

                // A fault or evidence mismatch must never resume the target
                // while our TF or hardware breakpoint is still installed.
                if (phase == PHASE_DONE && !exited) {
                    RestoreThreads(threads, true, cleanupErrors);
                    if (steppingState != null && steppingState.StepTfArmed)
                        RestoreStepFlag(steppingState, true, cleanupErrors, steppingTid);
                    if (cleanupErrors.Count != 0)
                        throw new InvalidOperationException("Debugger-state restoration failed before final event continuation");
                }
                if (!ContinueDebugEvent(pid, tid, pendingStatus))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                pending = false;
                if (exited) break;
            }

            captureWindowExpired = !targetExitEventObserved && timer.Elapsed.TotalSeconds >= seconds;
            if (!callHit && captureError == null && captureWindowExpired)
                captureError = "PREMIUM call-site breakpoint was not observed within the deadline";
            if (callHit && !callStepped && captureError == null && captureWindowExpired)
                captureError = "Selected CALL destination breakpoint was not observed within the deadline";
        } catch (Exception error) {
            if (captureError == null) captureError = error.GetType().Name + ": " + error.Message;
            if (callHit && !callStepped && destinationBreakpoint["error"] == null)
                destinationBreakpoint["error"] = error.GetType().Name + ": " + error.Message;
        } finally {
            if (attached && !exited) {
                if (!released) {
                    released = TryWriteRelease(releaseFile,
                        "PREMIUM call-site capture setup failed", process, cleanupErrors);
                }

                RestoreThreads(threads, pending, cleanupErrors);
                if (steppingState != null && steppingState.StepTfArmed)
                    RestoreStepFlag(steppingState, pending, cleanupErrors, steppingTid);

                if (cleanupErrors.Count != 0) {
                    TerminateAndDetachOwnedProcess(process, pid, pending, pendingTid,
                        cleanupErrors, "Debugger-state restoration failure", ref attached, ref detached);
                } else {
                    bool continued = !pending || ContinueDebugEvent(pid, pendingTid, pendingStatus);
                    if (!continued) {
                        cleanupErrors.Add("Continue of pending debug event failed: " + Marshal.GetLastWin32Error());
                        TerminateAndDetachOwnedProcess(process, pid, true, pendingTid,
                            cleanupErrors, "Pending debug-event continuation failure", ref attached, ref detached);
                    } else {
                        pending = false;
                        if (!DebugActiveProcessStop(pid)) {
                            int detachError = Marshal.GetLastWin32Error();
                            if (detachError == 5) {
                                uint wait = WaitForSingleObject(process, 5000);
                                if (wait == WAIT_OBJECT_0) {
                                    detached = true;
                                } else {
                                    cleanupErrors.Add("Detach failed with access denied and the owned process did not exit within five seconds");
                                    TerminateAndDetachOwnedProcess(process, pid, false, 0,
                                        cleanupErrors, "Access-denied detach failure", ref attached, ref detached);
                                }
                            } else {
                                cleanupErrors.Add("DebugActiveProcessStop failed: " + detachError);
                                TerminateAndDetachOwnedProcess(process, pid, false, 0,
                                    cleanupErrors, "Detach failure", ref attached, ref detached);
                            }
                        } else {
                            attached = false;
                            detached = true;
                        }
                    }
                }
            }

            foreach (ThreadState state in threads.Values)
                if (state.Handle != IntPtr.Zero) CloseHandle(state.Handle);
            Marshal.FreeHGlobal(debugEvent);
            CloseHandle(process);
        }

        bool allThreadStateRestored = cleanupErrors.Count == 0;
        foreach (ThreadState state in threads.Values)
            if (state.Armed || state.StepTfArmed) allThreadStateRestored = false;
        call["hit"] = callHit;
        if (callHit && !callStepped && call["status"].Equals("not-observed-within-capture-window"))
            call["status"] = "call-hit-step-incomplete";
        destinationBreakpoint["attempted"] = callHit && destinationBreakpoint["attempted"].Equals(true);
        pickObservation["observed"] = pickEntryObserved;

        return new Dictionary<string, object> {
            { "schema", "aaron-premium-callsite-destination-breakpoint-v1" },
            { "processId", pid }, { "processWow64", true },
            { "callSiteAddress", Hex(callSiteAddress) },
            { "callSiteValidation", callSiteValidation },
            { "call", call }, { "destinationBreakpoint", destinationBreakpoint },
            { "pickEntryObservation", pickObservation },
            { "exceptions", exceptions }, { "captureError", captureError },
            { "captureWindowSeconds", timer.Elapsed.TotalSeconds },
            { "captureWindowExpired", captureWindowExpired },
            { "targetExitEventObserved", targetExitEventObserved },
            { "attached", attachSucceeded }, { "readyPauseReleased", released },
            { "callSiteHardwareBreakpointHit", callHit },
            { "callDebugRegistersRestoredBeforeDestination", callDebugRegistersRestored },
            { "callDebugRegistersRestoredBeforeStep", callDebugRegistersRestored },
            { "debugRegistersRestored", allThreadStateRestored },
            { "debugRegistersAndTrapFlagRestored", allThreadStateRestored },
            { "detached", detached }, { "debugSessionEndedByTargetExit", exited },
            { "cleanupErrors", cleanupErrors }
        };
    }
}
