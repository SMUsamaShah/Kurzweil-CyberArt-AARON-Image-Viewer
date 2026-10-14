using System;
using System.Runtime.InteropServices;
using System.Threading;

internal static class FridaStalkerX86Fixture
{
    private const int Iterations = 2000;
    private const int Repetitions = 5;
    private const uint MemCommitReserve = 0x3000;
    private const uint PageExecuteReadWrite = 0x40;
    private const uint MemRelease = 0x8000;

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int NativeThunk();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr VirtualAlloc(IntPtr address, UIntPtr size, uint allocationType, uint protect);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool VirtualFree(IntPtr address, UIntPtr size, uint freeType);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    private static byte[] MakeCode()
    {
        // x86 bytes:
        //   mov ecx, Iterations
        // loop:
        //   call subroutine
        //   dec ecx
        //   jnz loop
        //   mov eax, 42
        //   ret
        // subroutine:
        //   ret
        // The call at +5 targets +19. The short branch at +11 returns to +5.
        byte[] code = {
            0xb9, 0, 0, 0, 0,
            0xe8, 0x09, 0, 0, 0,
            0x49,
            0x75, 0xf8,
            0xb8, 0x2a, 0, 0, 0,
            0xc3,
            0xc3
        };
        Buffer.BlockCopy(BitConverter.GetBytes(Iterations), 0, code, 1, 4);
        return code;
    }

    private static int Main()
    {
        byte[] codeBytes = MakeCode();
        IntPtr code = VirtualAlloc(IntPtr.Zero, (UIntPtr)codeBytes.Length,
            MemCommitReserve, PageExecuteReadWrite);
        if (code == IntPtr.Zero)
        {
            Console.Error.WriteLine("VirtualAlloc failed: " + Marshal.GetLastWin32Error());
            return 2;
        }

        try
        {
            Marshal.Copy(codeBytes, 0, code, codeBytes.Length);
            ManualResetEvent begin = new ManualResetEvent(false);
            ManualResetEvent finish = new ManualResetEvent(false);
            int result = int.MinValue;

            Thread worker = new Thread(delegate()
            {
                uint threadId = GetCurrentThreadId();
                Console.WriteLine("READY pid={0} tid={1} code=0x{2:X8} size={3} iterations={4} repetitions={5}",
                    System.Diagnostics.Process.GetCurrentProcess().Id,
                    threadId, code.ToInt32(), codeBytes.Length, Iterations, Repetitions);
                Console.Out.Flush();
                begin.WaitOne();

                NativeThunk thunk = (NativeThunk)Marshal.GetDelegateForFunctionPointer(
                    code, typeof(NativeThunk));
                for (int repetition = 0; repetition < Repetitions; repetition++)
                {
                    result = thunk();
                    if (repetition + 1 < Repetitions)
                    {
                        // Give Stalker time to drain this invocation before the next burst.
                        Thread.Sleep(100);
                    }
                }
                Console.WriteLine("RESULT={0}", result);
                Console.Out.Flush();
                finish.WaitOne();
            });
            worker.IsBackground = false;
            worker.Start();

            if (Console.ReadLine() == null) return 3;
            begin.Set();
            if (Console.ReadLine() == null) return 4;
            finish.Set();
            worker.Join();
            Console.WriteLine("END");
            return result == 42 ? 0 : 5;
        }
        finally
        {
            VirtualFree(code, UIntPtr.Zero, MemRelease);
        }
    }
}
