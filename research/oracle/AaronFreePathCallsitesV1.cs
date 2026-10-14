using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading;

// Read-only, one-shot WOW64 call-site capture for the three REA-mapped
// FREE-PATH instructions. It changes only this debugger's thread contexts;
// it does not patch code or write target process memory.
public static class AaronFreePathCallsitesV1
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

    sealed class ThreadState {
        public IntPtr Handle;
        public Context Saved;
        public bool Armed;
    }

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
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    static void Check(bool value) {
        if (!value) throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    static void EnableKillOnExit(List<string> errors, string context) {
        if (!DebugSetProcessKillOnExit(true))
            errors.Add(context + ": debugger-exit kill policy failed: " + Marshal.GetLastWin32Error());
        else
            errors.Add(context + ": debugger-exit kill policy enabled as the owned-oracle abort fallback");
    }
    static bool TerminateAndDetachOwnedOracle(IntPtr process, uint pid, bool pending,
        uint pendingTid, List<string> errors, string context, ref bool attached, ref bool detached) {
        if (!TerminateProcess(process, 0xdead)) {
            errors.Add(context + ": owned-oracle termination failed: " + Marshal.GetLastWin32Error());
            EnableKillOnExit(errors, context);
            return false;
        }
        errors.Add(context + ": disposable oracle termination requested");
        uint wait = WaitForSingleObject(process, 5000);
        if (wait != 0) {
            errors.Add(context + ": terminated oracle did not signal within five seconds (wait=" + Hex(wait) + ")");
            EnableKillOnExit(errors, context);
            return false;
        }
        if (pending && !ContinueDebugEvent(pid, pendingTid, 0x10002))
            errors.Add(context + ": pending debug event could not be continued after termination: " + Marshal.GetLastWin32Error());
        if (!DebugActiveProcessStop(pid)) {
            errors.Add(context + ": detach after termination failed: " + Marshal.GetLastWin32Error());
            EnableKillOnExit(errors, context);
            return false;
        }
        attached = false;
        detached = true;
        return true;
    }
    static bool HasArmedThread(Dictionary<uint, ThreadState> threads) {
        foreach (var state in threads.Values) if (state.Armed) return true;
        return false;
    }
    static uint U32(IntPtr p, int offset) {
        return unchecked((uint)Marshal.ReadInt32(p, offset));
    }
    static string Hex(uint value) { return "0x" + value.ToString("x8"); }

    static byte[] Read(IntPtr process, uint address, int count) {
        var bytes = new byte[count];
        UIntPtr read;
        Check(ReadProcessMemory(process, new IntPtr((long)address), bytes,
            (UIntPtr)count, out read));
        if (read.ToUInt64() != (ulong)count) throw new IOException("Short process-memory read");
        return bytes;
    }

    public static byte[] Read(uint pid, uint address, int count) {
        IntPtr process = OpenProcess(0x410, false, pid);
        Check(process != IntPtr.Zero);
        try { return Read(process, address, count); }
        finally { CloseHandle(process); }
    }

    public static Dictionary<string, object> Capture(uint pid, uint[] addresses,
        string releaseFile, int seconds) {
        if (addresses == null || addresses.Length != 3)
            throw new ArgumentException("Exactly three validated call-site addresses are required");
        if (seconds < 10 || seconds > 180)
            throw new ArgumentOutOfRangeException("seconds");
        Dictionary<string, object> result = null;
        Exception failure = null;
        var debugger = new Thread(() => {
            try { result = CaptureOnDebuggerThread(pid, addresses, releaseFile, seconds); }
            catch (Exception error) { failure = error; }
        });
        debugger.Name = "AARON FREE-PATH call-site capture v1";
        debugger.Start();
        debugger.Join();
        if (failure != null) throw new InvalidOperationException(failure.Message, failure);
        return result;
    }

    static Context GetContext(IntPtr thread, uint flags) {
        var context = new Context { Flags = flags };
        Check(Wow64GetThreadContext(thread, ref context));
        return context;
    }

    static void SetContext(IntPtr thread, Context context) {
        Check(Wow64SetThreadContext(thread, ref context));
    }

    static void Arm(uint tid, uint[] addresses, Dictionary<uint, ThreadState> threads) {
        if (threads.ContainsKey(tid)) return;
        IntPtr handle = OpenThread(0x1a, false, tid);
        Check(handle != IntPtr.Zero);
        try {
            Context saved = GetContext(handle, 0x10010);
            // Refuse to overwrite active slots 0-2. DR3 is preserved.
            if ((saved.Dr7 & 0x3fu) != 0)
                throw new InvalidOperationException("Existing hardware breakpoint occupies DR0-DR2");
            Context armed = saved;
            armed.Dr0 = addresses[0];
            armed.Dr1 = addresses[1];
            armed.Dr2 = addresses[2];
            armed.Dr6 = 0;
            // Local execute breakpoints, one byte each; preserve DR3 fields.
            armed.Dr7 = (saved.Dr7 & ~0x0fff003fu) | 0x15u;
            var state = new ThreadState { Handle = handle, Saved = saved, Armed = true };
            threads.Add(tid, state);
            SetContext(handle, armed);
        } catch {
            if (!threads.ContainsKey(tid)) CloseHandle(handle);
            throw;
        }
    }

    static void RestoreOne(ThreadState state) {
        if (state.Armed) {
            SetContext(state.Handle, state.Saved);
            state.Armed = false;
        }
    }

    static Dictionary<string, object> ReadSlot(IntPtr process, uint edi) {
        var record = new Dictionary<string, object>();
        if (edi > 0xffffffd8u) {
            record.Add("address", null);
            record.Add("value", null);
            record.Add("bytesHex", null);
            record.Add("readError", "EDI plus 0x27 exceeds the 32-bit address space");
            record.Add("targetAddressPreview", null);
            return record;
        }
        uint address = edi + 0x27u;
        record.Add("address", Hex(address));
        try {
            byte[] bytes = Read(process, address, 4);
            uint target = BitConverter.ToUInt32(bytes, 0);
            record.Add("value", Hex(target));
            record.Add("bytesHex", BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant());
            record.Add("readError", null);
            var preview = new Dictionary<string, object>();
            preview.Add("requestedBytes", 16);
            preview.Add("address", Hex(target));
            if (target == 0) {
                preview.Add("status", "null-address");
                preview.Add("bytesHex", null);
                preview.Add("sha256", null);
                preview.Add("readError", null);
            } else if (target > 0xfffffff0u) {
                preview.Add("status", "address-overflow");
                preview.Add("bytesHex", null);
                preview.Add("sha256", null);
                preview.Add("readError", "Sixteen-byte preview would exceed the 32-bit address space");
            } else {
                try {
                    byte[] previewBytes = Read(process, target, 16);
                    using (SHA256 digest = SHA256.Create()) {
                        preview.Add("status", "read");
                        preview.Add("bytesHex", BitConverter.ToString(previewBytes).Replace("-", "").ToLowerInvariant());
                        preview.Add("sha256", BitConverter.ToString(digest.ComputeHash(previewBytes)).Replace("-", "").ToLowerInvariant());
                        preview.Add("readError", null);
                    }
                } catch (Exception previewError) {
                    preview.Add("status", "unreadable");
                    preview.Add("bytesHex", null);
                    preview.Add("sha256", null);
                    preview.Add("readError", previewError.GetType().Name + ": " + previewError.Message);
                }
            }
            record.Add("targetAddressPreview", preview);
        } catch (Exception error) {
            record.Add("value", null);
            record.Add("bytesHex", null);
            record.Add("readError", error.GetType().Name + ": " + error.Message);
            record.Add("targetAddressPreview", null);
        }
        return record;
    }

    static Dictionary<string, object> MakeSiteRecord(int slot, uint address) {
        var site = new Dictionary<string, object>();
        site.Add("name", slot == 0 ? "call-before-branch" : slot == 1 ? "conditional-branch" : "call-after-branch");
        site.Add("offset", slot == 0 ? "0x39a" : slot == 1 ? "0x3ac" : "0x3e4");
        site.Add("address", Hex(address));
        site.Add("status", "not-observed-within-capture-window");
        site.Add("hit", false);
        site.Add("event", null);
        return site;
    }

    static Dictionary<string, object> MakeHit(int slot, uint tid, Context context,
        IntPtr process, int sequence) {
        var hit = new Dictionary<string, object>();
        hit.Add("sequence", sequence);
        hit.Add("site", slot == 0 ? "call-before-branch" : slot == 1 ? "conditional-branch" : "call-after-branch");
        hit.Add("threadId", tid);
        hit.Add("eip", Hex(context.Eip));
        hit.Add("eax", Hex(context.Eax));
        hit.Add("ecx", Hex(context.Ecx));
        hit.Add("edx", Hex(context.Edx));
        hit.Add("ebx", Hex(context.Ebx));
        hit.Add("esi", Hex(context.Esi));
        hit.Add("edi", Hex(context.Edi));
        hit.Add("ebp", Hex(context.Ebp));
        hit.Add("esp", Hex(context.Esp));
        hit.Add("eflags", Hex(context.Eflags));
        hit.Add("dr6", Hex(context.Dr6));
        hit.Add("ediSlot", slot == 1 ? null : ReadSlot(process, context.Edi));
        if (slot == 1) {
            bool zf = (context.Eflags & 0x40u) != 0;
            bool sf = (context.Eflags & 0x80u) != 0;
            bool of = (context.Eflags & 0x800u) != 0;
            hit.Add("jgConditionFromCapturedFlags", !zf && sf == of);
            hit.Add("jccClaimLimit", "Flags at the JG instruction and the independently observed later +0x3e4 breakpoint only; no step-over or causal attribution.");
        }
        return hit;
    }

    static Dictionary<string, object> CaptureOnDebuggerThread(uint pid, uint[] addresses,
        string releaseFile, int seconds) {
        if (IntPtr.Size != 8)
            throw new InvalidOperationException("Use x64 PowerShell for the WOW64 debugger");
        IntPtr process = OpenProcess(0x411, false, pid);
        Check(process != IntPtr.Zero);
        IntPtr evt = Marshal.AllocHGlobal(1024);
        var threads = new Dictionary<uint, ThreadState>();
        var sites = new List<Dictionary<string, object>>();
        var chronology = new List<Dictionary<string, object>>();
        var exceptions = new List<string>();
        for (int i = 0; i < 3; i++) sites.Add(MakeSiteRecord(i, addresses[i]));
        bool attached = false, attachSucceeded = false, pending = false, exited = false, released = false;
        bool breakpointsArmed = false, detached = false;
        bool targetExitEventObserved = false, captureWindowExpired = false;
        bool loopAborted = false, loopStoppedAfterAllSites = false;
        bool ownerPinned = false, allSitesHit = false, registersRestored = false;
        bool exitConfirmedAfterDetachFailure = false;
        int detachError = 0;
        uint ownerTid = 0, pendingTid = 0, pendingStatus = 0x10002;
        var cleanupErrors = new List<string>();
        string captureError = null;
        var timer = Stopwatch.StartNew();
        try {
            Check(DebugActiveProcess(pid)); attached = true; attachSucceeded = true;
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
                if (!ownerPinned && (kind == 3 || kind == 2)) {
                    Arm(tid, addresses, threads);
                    breakpointsArmed = breakpointsArmed || HasArmedThread(threads);
                }
                if (kind == 3 || kind == 6) {
                    IntPtr file = Marshal.ReadIntPtr(evt, 16);
                    if (file != IntPtr.Zero) CloseHandle(file);
                }
                if (kind == 3) {
                    CloseHandle(Marshal.ReadIntPtr(evt, 24));
                    CloseHandle(Marshal.ReadIntPtr(evt, 32));
                } else if (kind == 2) {
                    CloseHandle(Marshal.ReadIntPtr(evt, 16));
                }
                if (kind == 4 && threads.ContainsKey(tid)) {
                    CloseHandle(threads[tid].Handle);
                    threads.Remove(tid);
                }

                if (kind == 1) {
                    uint code = U32(evt, 16), first = U32(evt, 168);
                    if (exceptions.Count < 64) exceptions.Add("code=" + Hex(code) + " first=" + first);
                    pendingStatus = 0x80010001;
                    if (!released && first == 1 && (code == 0x80000003 || code == 0x4000001f)) {
                        pendingStatus = 0x10002;
                        if (threads.Count == 0) throw new InvalidOperationException("No threads armed");
                        if (!breakpointsArmed) throw new InvalidOperationException("No hardware breakpoints were successfully armed");
                        File.WriteAllText(releaseFile, "FREE-PATH call-site breakpoints armed");
                        released = true;
                    } else if (code == 0x80000004 || code == 0x4000001e) {
                        if (threads.ContainsKey(tid) && threads[tid].Armed) {
                            Context context = GetContext(threads[tid].Handle, 0x10013);
                            int slot = -1;
                            for (int i = 0; i < 3; i++) {
                                if (context.Eip == addresses[i] && (context.Dr6 & (1u << i)) != 0) {
                                    slot = i;
                                    break;
                                }
                            }
                            if (slot >= 0) {
                                pendingStatus = 0x10002;
                                if (!ownerPinned) {
                                    ownerPinned = true;
                                    ownerTid = tid;
                                    foreach (var item in threads) {
                                        if (item.Key == ownerTid) continue;
                                        try { RestoreOne(item.Value); }
                                        catch (Exception error) { cleanupErrors.Add("Restore non-owner thread " + item.Key + ": " + error.Message); }
                                    }
                                    if (cleanupErrors.Count != 0)
                                        throw new InvalidOperationException("A non-owner thread's debug registers could not be restored; aborting the owned oracle");
                                }
                                if (tid == ownerTid && !((bool)sites[slot]["hit"])) {
                                    var hit = MakeHit(slot, tid, context, process, chronology.Count + 1);
                                    chronology.Add(hit);
                                    sites[slot]["status"] = "hit";
                                    sites[slot]["hit"] = true;
                                    sites[slot]["event"] = hit;
                                    // One shot per native address. Never re-arm the
                                    // instruction after continuing this debug event.
                                    context.Dr7 &= ~(3u << (slot * 2));
                                    context.Dr6 = 0;
                                    SetContext(threads[tid].Handle, context);
                                    if ((bool)sites[0]["hit"] && (bool)sites[1]["hit"] && (bool)sites[2]["hit"]) {
                                        allSitesHit = true;
                                        RestoreOne(threads[tid]);
                                    }
                                } else {
                                    // A hit from another thread after pinning is
                                    // never interpreted as part of this capture.
                                    pendingStatus = 0x80010001;
                                }
                            }
                        }
                    }
                }
                if (kind == 5) { exited = true; targetExitEventObserved = true; }
                if (!ContinueDebugEvent(pid, tid, pendingStatus)) {
                    cleanupErrors.Add("Continue of debug event failed: " + Marshal.GetLastWin32Error());
                    TerminateAndDetachOwnedOracle(process, pid, true, tid, cleanupErrors,
                        "ContinueDebugEvent failure", ref attached, ref detached);
                    pending = false;
                    loopAborted = true;
                    break;
                }
                pending = false;
                if (exited) break;
                if (allSitesHit && threads.Count == 0) { loopStoppedAfterAllSites = true; break; }
            }
            captureWindowExpired = !targetExitEventObserved && !loopAborted && !loopStoppedAfterAllSites
                && timer.Elapsed.TotalSeconds >= seconds;
            if (targetExitEventObserved && captureError == null) {
                if (!ownerPinned)
                    captureError = "Target exited before a selected FREE-PATH call-site breakpoint was observed";
                else if (!allSitesHit)
                    captureError = "Target exited before every selected FREE-PATH call-site was observed";
            } else if (captureWindowExpired && !ownerPinned && captureError == null) {
                captureError = "No selected FREE-PATH call-site breakpoint observed within the deadline";
            }
            if (ownerPinned && !allSitesHit && captureWindowExpired)
                captureError = "Capture window ended before every selected call-site was observed";
        } catch (Exception error) {
            captureError = error.GetType().Name + ": " + error.Message;
        } finally {
            if (attached && !exited) {
                foreach (var item in threads) {
                    try {
                        if (pending) {
                            RestoreOne(item.Value);
                        } else {
                            bool suspended = false;
                            try {
                                if (SuspendThread(item.Value.Handle) == uint.MaxValue)
                                    throw new Win32Exception(Marshal.GetLastWin32Error());
                                suspended = true;
                                RestoreOne(item.Value);
                            } finally {
                                if (suspended && ResumeThread(item.Value.Handle) == uint.MaxValue)
                                    cleanupErrors.Add("Resume thread " + item.Key + " failed");
                            }
                        }
                    } catch (Exception error) {
                        cleanupErrors.Add("Restore thread " + item.Key + ": " + error.Message);
                    }
                }
                if (cleanupErrors.Count != 0) {
                    TerminateAndDetachOwnedOracle(process, pid, pending, pendingTid,
                        cleanupErrors, "Debug-register restoration failure", ref attached, ref detached);
                } else {
                    bool continueOk = !pending || ContinueDebugEvent(pid, pendingTid, pendingStatus);
                    if (!continueOk) {
                        cleanupErrors.Add("Continue of pending debug event failed: " + Marshal.GetLastWin32Error());
                        TerminateAndDetachOwnedOracle(process, pid, true, pendingTid,
                            cleanupErrors, "Pending ContinueDebugEvent failure", ref attached, ref detached);
                    } else if (!DebugActiveProcessStop(pid)) {
                        detachError = Marshal.GetLastWin32Error();
                        if (detachError == 5) {
                            uint wait = WaitForSingleObject(process, 60000);
                            if (wait == 0) exitConfirmedAfterDetachFailure = true;
                            else TerminateAndDetachOwnedOracle(process, pid, false, 0,
                                cleanupErrors, "ERROR_ACCESS_DENIED detach failure", ref attached, ref detached);
                        } else TerminateAndDetachOwnedOracle(process, pid, false, 0,
                            cleanupErrors, "Detach failure " + detachError, ref attached, ref detached);
                    } else { detached = true; attached = false; }
                }
            }
            foreach (var state in threads.Values) CloseHandle(state.Handle);
            registersRestored = cleanupErrors.Count == 0;
            Marshal.FreeHGlobal(evt);
            CloseHandle(process);
        }

        var sitesByName = new Dictionary<string, object>();
        foreach (var site in sites) sitesByName[(string)site["name"]] = site;
        var result = new Dictionary<string, object>();
        result.Add("processId", pid);
        result.Add("addresses", new Dictionary<string, object> {
            { "callBeforeBranch", Hex(addresses[0]) },
            { "conditionalBranch", Hex(addresses[1]) },
            { "callAfterBranch", Hex(addresses[2]) }
        });
        result.Add("ownerThreadId", ownerPinned ? (object)ownerTid : null);
        result.Add("threadPinnedAtFirstHit", ownerPinned);
        result.Add("chronology", chronology);
        result.Add("sites", sitesByName);
        result.Add("exceptions", exceptions);
        result.Add("captureWindowSeconds", timer.Elapsed.TotalSeconds);
        result.Add("captureError", captureError);
        result.Add("targetExitEventObserved", targetExitEventObserved);
        result.Add("captureWindowExpired", captureWindowExpired);
        result.Add("attached", attachSucceeded);
        result.Add("breakpointsArmed", breakpointsArmed);
        result.Add("captureReleased", released);
        result.Add("allThreeSitesHit", allSitesHit);
        result.Add("debugRegistersRestored", registersRestored);
        result.Add("debugSessionEndedByTargetExit", exited || exitConfirmedAfterDetachFailure);
        result.Add("detached", detached);
        result.Add("detachErrorCode", detachError == 0 ? (object)null : detachError);
        result.Add("cleanupErrors", cleanupErrors);
        return result;
    }
}
