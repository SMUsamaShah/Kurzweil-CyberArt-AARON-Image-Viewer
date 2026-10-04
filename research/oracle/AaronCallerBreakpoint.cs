using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

// One execute hardware breakpoint in an explicitly selected WOW64 oracle.
// No code patch, injection, or process-memory write. Debug registers are
// restored before detaching; unrelated exceptions are passed to AARON.
public static class AaronCallerBreakpoint
{
    [StructLayout(LayoutKind.Explicit, Size = 716)]
    struct Context {
        [FieldOffset(0)] public uint Flags;
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
        [FieldOffset(192)] public uint Eflags;
        [FieldOffset(196)] public uint Esp;
    }
    class ThreadState { public IntPtr Handle; public Context Saved; }
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DebugActiveProcess(uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DebugActiveProcessStop(uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DebugSetProcessKillOnExit(bool kill);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool WaitForDebugEvent(IntPtr evt, uint timeout);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ContinueDebugEvent(uint pid, uint tid, uint status);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenThread(uint access, bool inherit, uint tid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool Wow64GetThreadContext(IntPtr thread, ref Context context);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool Wow64SetThreadContext(IntPtr thread, ref Context context);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint SuspendThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadProcessMemory(IntPtr process,
        IntPtr address, [Out] byte[] bytes, UIntPtr size, out UIntPtr read);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    static void Check(bool value) { if (!value) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static uint U32(IntPtr p, int offset) { return unchecked((uint)Marshal.ReadInt32(p, offset)); }
    static string Hex(uint value) { return "0x" + value.ToString("x8"); }
    static byte[] Read(IntPtr process, uint address, int count) {
        var bytes = new byte[count]; UIntPtr read;
        Check(ReadProcessMemory(process, new IntPtr(address), bytes, (UIntPtr)count, out read));
        if (read.ToUInt64() != (ulong)count) throw new IOException("Short process-memory read");
        return bytes;
    }
    public static byte[] Read(uint pid, uint address, int count) {
        IntPtr process = OpenProcess(0x410, false, pid);
        Check(process != IntPtr.Zero);
        try { return Read(process, address, count); } finally { CloseHandle(process); }
    }
    static void Arm(uint tid, uint entry, Dictionary<uint, ThreadState> threads) {
        if (threads.ContainsKey(tid)) return;
        IntPtr handle = OpenThread(0x1a, false, tid);
        Check(handle != IntPtr.Zero);
        var saved = new Context { Flags = 0x10010 };
        try {
            Check(Wow64GetThreadContext(handle, ref saved));
            if ((saved.Dr7 & 0xff) != 0) throw new InvalidOperationException("An existing hardware breakpoint is active");
            var armed = saved;
            armed.Dr0 = entry;
            armed.Dr6 = 0;
            // Enable local DR0 execute breakpoint, length one. Preserve other bits.
            armed.Dr7 = (saved.Dr7 & ~0xf000fu) | 1u;
            threads.Add(tid, new ThreadState { Handle = handle, Saved = saved });
            Check(Wow64SetThreadContext(handle, ref armed));
        } catch {
            if (!threads.ContainsKey(tid)) CloseHandle(handle);
            throw;
        }
    }

    public static Dictionary<string, object> Capture(uint pid, uint entry, string releaseFile, int seconds) {
        Dictionary<string, object> result = null;
        Exception failure = null;
        // Windows binds the debug session and kill-on-exit policy to the
        // attaching thread. This thread always exits, even in an interactive
        // PowerShell session; a failure cannot leave a pending stop at a prompt.
        var debugger = new Thread(() => {
            try { result = CaptureOnDebuggerThread(pid, entry, releaseFile, seconds); }
            catch (Exception error) { failure = error; }
        });
        debugger.Name = "AARON caller breakpoint";
        debugger.Start();
        debugger.Join();
        if (failure != null) throw new InvalidOperationException(failure.Message, failure);
        return result;
    }

    static Dictionary<string, object> CaptureOnDebuggerThread(uint pid, uint entry, string releaseFile, int seconds) {
        if (IntPtr.Size != 8) throw new InvalidOperationException("Use x64 PowerShell for the WOW64 debugger");
        // TERMINATE is reserved for aborting this disposable oracle if register
        // restoration fails; never resume an unclean armed debug context.
        IntPtr process = OpenProcess(0x411, false, pid);
        Check(process != IntPtr.Zero);
        IntPtr evt = Marshal.AllocHGlobal(1024);
        var threads = new Dictionary<uint, ThreadState>();
        var exceptions = new List<string>();
        Dictionary<string, object> result = null;
        bool attached = false, pending = false, exited = false, released = false;
        uint pendingTid = 0, pendingStatus = 0x10002;
        var cleanupErrors = new List<string>();
        Exception captureError = null;
        var timer = Stopwatch.StartNew();
        try {
            Check(DebugActiveProcess(pid)); attached = true;
            Check(DebugSetProcessKillOnExit(false));
            while (timer.Elapsed.TotalSeconds < seconds) {
                if (!WaitForDebugEvent(evt, 100)) {
                    int error = Marshal.GetLastWin32Error();
                    if (error != 121) throw new Win32Exception(error);
                    continue;
                }
                pending = true;
                uint kind = U32(evt, 0), eventPid = U32(evt, 4), tid = U32(evt, 8);
                pendingTid = tid;
                pendingStatus = 0x10002;
                if (eventPid != pid) throw new InvalidOperationException("Unexpected debug-event process");
                if (kind == 3 || kind == 2) {
                    Arm(tid, entry, threads);
                }
                if (kind == 3 || kind == 6) {
                    IntPtr file = Marshal.ReadIntPtr(evt, 16);
                    if (file != IntPtr.Zero) CloseHandle(file);
                }
                // Retain only our explicitly opened handles, not event handles.
                if (kind == 3) {
                    CloseHandle(Marshal.ReadIntPtr(evt, 24));
                    CloseHandle(Marshal.ReadIntPtr(evt, 32));
                } else if (kind == 2) {
                    CloseHandle(Marshal.ReadIntPtr(evt, 16));
                }
                if (kind == 4 && threads.ContainsKey(tid)) {
                    CloseHandle(threads[tid].Handle); threads.Remove(tid);
                }
                if (kind == 1) {
                    uint code = U32(evt, 16), first = U32(evt, 168);
                    if (exceptions.Count < 64) exceptions.Add("code=" + Hex(code) + " first=" + first);
                    pendingStatus = 0x80010001; // Pass other exceptions to the application.
                    if (!released && first == 1 && (code == 0x80000003 || code == 0x4000001f)) {
                        pendingStatus = 0x10002; // Native/WOW64 attachment breakpoints.
                        if (threads.Count == 0) throw new InvalidOperationException("No threads armed");
                        File.WriteAllText(releaseFile, "Hardware breakpoint armed; continue seeded scene");
                        released = true;
                    } else if (code == 0x80000004 || code == 0x4000001e) {
                        if (!threads.ContainsKey(tid)) throw new InvalidOperationException("Untracked breakpoint thread");
                        var context = new Context { Flags = 0x10013 };
                        Check(Wow64GetThreadContext(threads[tid].Handle, ref context));
                        if (context.Eip == entry && (context.Dr6 & 1) != 0) {
                            pendingStatus = 0x10002;
                            byte[] stack = Read(process, context.Esp, 64);
                            var frames = new List<Dictionary<string, object>>();
                            uint frame = context.Ebp;
                            for (int i = 0; i < 8 && frame != 0; i++) {
                                try {
                                    byte[] words = Read(process, frame, 8);
                                    uint next = BitConverter.ToUInt32(words, 0);
                                    frames.Add(new Dictionary<string, object> {
                                        { "frame", Hex(frame) }, { "savedFrame", Hex(next) },
                                        { "returnAddress", Hex(BitConverter.ToUInt32(words, 4)) }
                                    });
                                    if (next <= frame || next - frame > 0x100000) break;
                                    frame = next;
                                } catch (Win32Exception) { break; }
                            }
                            result = new Dictionary<string, object> {
                                { "processId", pid }, { "threadId", tid }, { "entry", Hex(entry) },
                                { "exceptionCode", Hex(code) }, { "firstChance", first },
                                { "eip", Hex(context.Eip) }, { "eax", Hex(context.Eax) },
                                { "ecx", Hex(context.Ecx) }, { "edx", Hex(context.Edx) },
                                { "ebx", Hex(context.Ebx) }, { "esi", Hex(context.Esi) },
                                { "edi", Hex(context.Edi) }, { "esp", Hex(context.Esp) },
                                { "ebp", Hex(context.Ebp) }, { "eflags", Hex(context.Eflags) },
                                { "dr6", Hex(context.Dr6) },
                                { "returnAddress", Hex(BitConverter.ToUInt32(stack, 0)) },
                                { "stack64Hex", BitConverter.ToString(stack).Replace("-", "").ToLowerInvariant() },
                                { "framesBeforeEntryPrologue", frames }, { "exceptions", exceptions },
                                { "armedThreads", threads.Count }, { "elapsedSeconds", timer.Elapsed.TotalSeconds }
                            };
                            break; // Restore registers while the debug event holds all threads stopped.
                        }
                    }
                }
                if (kind == 5) { exited = true; }
                Check(ContinueDebugEvent(pid, tid, pendingStatus)); pending = false;
                if (exited) break;
            }
            if (result == null) throw new InvalidOperationException("No selected entry breakpoint observed within the deadline");
        } catch (Exception error) {
            captureError = error;
        } finally {
            if (attached && !exited) {
                foreach (var item in threads) {
                    bool suspended = false;
                    try {
                        if (!pending) {
                            if (SuspendThread(item.Value.Handle) == uint.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error());
                            suspended = true;
                        }
                        var saved = item.Value.Saved;
                        Check(Wow64SetThreadContext(item.Value.Handle, ref saved));
                    } catch (Exception error) { cleanupErrors.Add("Restore thread " + item.Key + ": " + error.Message); }
                    finally { if (suspended && ResumeThread(item.Value.Handle) == uint.MaxValue) cleanupErrors.Add("Resume failed"); }
                }
                if (cleanupErrors.Count != 0) {
                    if (TerminateProcess(process, 0xdead)) {
                        // Termination has been requested before releasing the
                        // debug stop; no armed user instruction is resumed.
                        if (pending) ContinueDebugEvent(pid, pendingTid, 0x10002);
                        DebugActiveProcessStop(pid);
                        cleanupErrors.Add("Disposable oracle aborted after restoration failure");
                    } else {
                        // Keep the outstanding stop, and kill this owned oracle
                        // when the dedicated debugger thread exits.
                        if (!DebugSetProcessKillOnExit(true)) cleanupErrors.Add("Debugger-exit kill policy failed");
                        cleanupErrors.Add("Oracle held for debugger-exit termination");
                    }
                } else {
                    if (pending && !ContinueDebugEvent(pid, pendingTid, pendingStatus)) cleanupErrors.Add("Continue failed");
                    if (!DebugActiveProcessStop(pid)) cleanupErrors.Add("Detach failed: " + Marshal.GetLastWin32Error());
                }
            }
            foreach (var state in threads.Values) CloseHandle(state.Handle);
            Marshal.FreeHGlobal(evt); CloseHandle(process);
        }
        if (captureError != null || cleanupErrors.Count != 0) {
            string failure = captureError == null ? "Cleanup failed" : captureError.Message;
            if (cleanupErrors.Count != 0) failure += "; " + String.Join("; ", cleanupErrors);
            throw new InvalidOperationException(failure, captureError);
        }
        result.Add("debugRegistersRestored", true);
        result.Add("detached", true);
        return result;
    }
}
