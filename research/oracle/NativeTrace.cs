using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

// x64 debugger for the original x86 process. No code injection or patches.
public static class AaronNativeTrace
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct StartupInfo {
        public int cb; public string reserved, desktop, title;
        public uint x, y, width, height, charsX, charsY, fill, flags;
        public ushort show, reservedSize;
        public IntPtr reservedData, stdin, stdout, stderr;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInfo { public IntPtr process, thread; public uint pid, tid; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateProcessW(string app, StringBuilder command, IntPtr pa,
        IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd,
        ref StartupInfo startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool WaitForDebugEvent(IntPtr evt, uint timeout);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ContinueDebugEvent(uint pid, uint tid, uint status);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("psapi.dll", CharSet = CharSet.Unicode)]
    static extern uint GetMappedFileNameW(IntPtr process, IntPtr address, StringBuilder name, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetProcessDEPPolicy(IntPtr process, out uint flags, out bool permanent);
    delegate bool EnumWindowProc(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowProc callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumWindowProc callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetClassNameW(IntPtr window, StringBuilder text, int size);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr SendMessageTimeoutW(IntPtr window, uint message, IntPtr wparam,
        StringBuilder text, uint flags, uint timeout, out IntPtr result);

    public static void Snapshot(uint pid, string output)
    {
        using (var log = new StreamWriter(output)) {
            EnumWindowProc write = (window, parameter) => {
                var text = new StringBuilder(2048);
                var kind = new StringBuilder(256);
                IntPtr result;
                GetClassNameW(window, kind, kind.Capacity);
                SendMessageTimeoutW(window, 13, new IntPtr(text.Capacity), text, 2, 100, out result);
                log.WriteLine("window=0x{0:X} class={1} text={2}", window.ToInt64(), kind, text);
                return true;
            };
            EnumWindows((window, parameter) => {
                uint owner;
                GetWindowThreadProcessId(window, out owner);
                if (owner == pid) {
                    write(window, IntPtr.Zero);
                    EnumChildWindows(window, write, IntPtr.Zero);
                }
                return true;
            }, IntPtr.Zero);
        }
    }

    static uint U32(IntPtr p, int offset) { return unchecked((uint)Marshal.ReadInt32(p, offset)); }
    static ulong U64(IntPtr p, int offset) { return unchecked((ulong)Marshal.ReadInt64(p, offset)); }
    public static void Run(string exe, string args, string cwd, string output, int seconds)
    {
        if (IntPtr.Size != 8) throw new InvalidOperationException("Run from x64 PowerShell.");
        var startup = new StartupInfo { cb = Marshal.SizeOf(typeof(StartupInfo)) };
        ProcessInfo process;
        using (var log = new StreamWriter(output, false)) {
            log.AutoFlush = true;
            if (!CreateProcessW(exe, new StringBuilder("\"" + exe + "\" " + args),
                IntPtr.Zero, IntPtr.Zero, false, 2, IntPtr.Zero, cwd, ref startup, out process))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            IntPtr evt = Marshal.AllocHGlobal(1024);
            bool exited = false;
            try {
                uint dep; bool permanent;
                bool depOk = GetProcessDEPPolicy(process.process, out dep, out permanent);
                log.WriteLine("pid={0} DEP-query={1} flags={2} permanent={3}", process.pid, depOk, dep, permanent);
                var timer = Stopwatch.StartNew();
                int exceptions = 0;
                while (timer.Elapsed.TotalSeconds < seconds && exceptions < 1000) {
                    if (!WaitForDebugEvent(evt, 200)) {
                        int error = Marshal.GetLastWin32Error();
                        if (error != 121) throw new Win32Exception(error);
                        continue;
                    }
                    uint kind = U32(evt, 0), pid = U32(evt, 4), tid = U32(evt, 8);
                    uint status = 0x00010002; // DBG_CONTINUE for non-exception events.
                    if (kind == 1) {
                        uint code = U32(evt, 16), first = U32(evt, 168);
                        ulong address = U64(evt, 32);
                        exceptions++;
                        if (exceptions <= 64 || first == 0 || code == 0xC00000FD) {
                            var module = new StringBuilder(1024);
                            GetMappedFileNameW(process.process, new IntPtr(unchecked((long)address)), module, 1024);
                            log.WriteLine("exception={0} thread={1} code=0x{2:X8} first={3} address=0x{4:X} module={5}",
                                exceptions, tid, code, first, address, module);
                            uint count = Math.Min(U32(evt, 40), 15u);
                            for (int i = 0; i < count; i++) log.WriteLine("  information[{0}]=0x{1:X}", i, U64(evt, 48 + i * 8));
                        }
                        // Consume only Windows loader breakpoints, pass real faults to the application.
                        status = code == 0x80000003 || code == 0x4000001F ? 0x00010002u : 0x80010001u;
                    } else if (kind == 3 || kind == 6) {
                        IntPtr file = Marshal.ReadIntPtr(evt, 16);
                        if (file != IntPtr.Zero) CloseHandle(file);
                    } else if (kind == 5) {
                        log.WriteLine("exit=0x{0:X8}", U32(evt, 16));
                        exited = true;
                    }
                    if (!ContinueDebugEvent(pid, tid, status)) throw new Win32Exception(Marshal.GetLastWin32Error());
                    if (exited) break;
                }
                log.WriteLine("finished elapsed={0:F3} exceptions={1} exited={2}", timer.Elapsed.TotalSeconds, exceptions, exited);
                if (!exited) Snapshot(process.pid, Path.ChangeExtension(output, ".windows.txt"));
            } finally {
                if (!exited) TerminateProcess(process.process, 0xDEAD);
                Marshal.FreeHGlobal(evt);
                CloseHandle(process.thread);
                CloseHandle(process.process);
            }
        }
    }
}
