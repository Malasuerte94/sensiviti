// Windows-only, passive Raw Input receiver. Never injects input or opens a game process.
// Compiled locally with the Windows .NET Framework compiler; no downloaded binaries.
using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

internal sealed class TurnCapture : NativeWindow, IDisposable
{
    [StructLayout(LayoutKind.Sequential)]
    internal struct Device { public ushort Page, Usage; public uint Flags; public IntPtr Target; }
    [DllImport("user32.dll", SetLastError = true)]
    internal static extern bool RegisterRawInputDevices(Device[] devices, uint count, uint size);
    [DllImport("user32.dll", SetLastError = true)]
    internal static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] internal static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] internal static extern uint GetRawInputData(IntPtr raw, uint command, IntPtr data, ref uint size, uint headerSize);
    [DllImport("user32.dll")] internal static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
    [DllImport("kernel32.dll")] private static extern bool Beep(uint frequency, uint duration);

    private readonly uint parentPid;
    private readonly Action<string> output;
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    private readonly Stopwatch session = Stopwatch.StartNew();
    private readonly Stopwatch turn = new Stopwatch();
    private readonly IntPtr buffer = Marshal.AllocHGlobal(256);
    private IntPtr gameWindow, mouseDevice;
    private bool recording, rawRegistered, hotkeyRegistered, disposed;
    private long x, y, pathX, pathY;
    private int turns;

    internal TurnCapture(uint parent, Action<string> emit)
    {
        parentPid = parent;
        output = emit;
        CreateHandle(new CreateParams { Caption = "Sensiviti turn measurement", Parent = new IntPtr(-3) });
        try
        {
            rawRegistered = RegisterRawInputDevices(new[] { new Device { Page = 1, Usage = 2, Flags = 0x100, Target = Handle } }, 1, (uint)Marshal.SizeOf(typeof(Device)));
            if (!rawRegistered) throw new Exception("Windows could not start background raw mouse capture.");
            hotkeyRegistered = RegisterHotKey(Handle, 1, 0x4000, 0x7A); // F11, no key-repeat
            if (!hotkeyRegistered) throw new Exception("F11 is already in use by another application. Release that shortcut and try again.");
            timer.Interval = 100;
            timer.Tick += delegate {
                if (session.ElapsedMilliseconds > 600000) Fail("Measurement expired. Arm it again when you are ready.");
                else if (recording && GetForegroundWindow() != gameWindow) Fail("The game lost focus during a turn. Return to the game and restart the measurement.");
                else if (recording && turn.ElapsedMilliseconds > 120000) Fail("The turn timed out. Repeat one full turn between F11 presses.");
            };
            timer.Start();
        }
        catch { Dispose(); throw; }
    }

    private void Sound(uint frequency)
    {
        // Keep the message pump draining input while a short audible cue plays.
        ThreadPool.QueueUserWorkItem(delegate { Beep(frequency, 90); });
    }
    private void Fail(string message)
    {
        if (disposed) return;
        recording = false;
        output("{\"type\":\"error\",\"message\":\"" + message + "\"}");
        Beep(300, 90);
        Dispose();
        Application.ExitThread();
    }
    private void Toggle()
    {
        IntPtr foreground = GetForegroundWindow();
        uint pid;
        GetWindowThreadProcessId(foreground, out pid);
        if (foreground == IntPtr.Zero || pid == parentPid || pid == (uint)Process.GetCurrentProcess().Id)
        { Fail("Switch to the game before pressing F11, then arm the measurement again."); return; }
        if (gameWindow != IntPtr.Zero && gameWindow != foreground)
        { Fail("The game window changed. Restart and measure all three turns in the same game."); return; }
        if (!recording)
        {
            gameWindow = foreground;
            x = y = pathX = pathY = 0;
            turn.Restart();
            recording = true;
            output("{\"type\":\"measuring\"}");
            Sound(1000);
        }
        else
        {
            recording = false;
            turn.Stop();
            output(string.Format(CultureInfo.InvariantCulture,
                "{{\"type\":\"sample\",\"x\":{0},\"y\":{1},\"pathX\":{2},\"pathY\":{3},\"elapsedMs\":{4}}}", x, y, pathX, pathY, turn.ElapsedMilliseconds));
            if (++turns == 3) { Beep(1600, 90); Dispose(); Application.ExitThread(); }
            else Sound(1600);
        }
    }
    // RAWINPUTHEADER is 24 bytes on x64, 16 on x86; RAWMOUSE's union aligns to 4 bytes.
    internal void ReadPacket(IntPtr packet, uint size)
    {
        int header = 8 + 2 * IntPtr.Size;
        if (!recording || size < header + 24 || Marshal.ReadInt32(packet) != 0) return;
        if ((Marshal.ReadInt16(packet, header) & 1) != 0)
        { Fail("An absolute pointing device was detected. Use a relative-input mouse for this measurement."); return; }
        int dx = Marshal.ReadInt32(packet, header + 12), dy = Marshal.ReadInt32(packet, header + 16);
        if (dx == 0 && dy == 0) return;
        IntPtr device = Marshal.ReadIntPtr(packet, 8);
        if (device == IntPtr.Zero) { Fail("Mouse input has no hardware device. Use a local physical mouse."); return; }
        if (mouseDevice == IntPtr.Zero) mouseDevice = device;
        else if (mouseDevice != device) { Fail("More than one mouse moved. Restart using only one mouse for all three turns."); return; }
        x += dx; y += dy;
        pathX += Math.Abs((long)dx); pathY += Math.Abs((long)dy);
    }
    protected override void WndProc(ref Message message)
    {
        if (!disposed)
        {
            if (message.Msg == 0x312) Toggle(); // WM_HOTKEY
            else if (message.Msg == 0x8001) { Dispose(); Application.ExitThread(); }
            else if (message.Msg == 0xFF && recording)
            {
                if (GetForegroundWindow() != gameWindow) Fail("The game lost focus during a turn. Restart the measurement.");
                else
                {
                    uint size = 256;
                    uint read = GetRawInputData(message.LParam, 0x10000003, buffer, ref size, (uint)(8 + 2 * IntPtr.Size));
                    if (read == uint.MaxValue || read > 256) Fail("A mouse input packet could not be read. Restart the measurement.");
                    else ReadPacket(buffer, read);
                }
            }
        }
        base.WndProc(ref message);
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        recording = false;
        timer.Stop(); timer.Dispose();
        if (hotkeyRegistered) UnregisterHotKey(Handle, 1);
        if (rawRegistered) RegisterRawInputDevices(new[] { new Device { Page = 1, Usage = 2, Flags = 1, Target = IntPtr.Zero } }, 1, (uint)Marshal.SizeOf(typeof(Device)));
        DestroyHandle();
        Marshal.FreeHGlobal(buffer);
    }
    [STAThread]
    private static int Main(string[] args)
    {
        uint parent;
        if (args.Length != 1 || !uint.TryParse(args[0], out parent)) return 2;
        Action<string> emit = delegate(string json) { Console.Out.WriteLine(json); Console.Out.Flush(); };
        try
        {
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);
            using (var capture = new TurnCapture(parent, emit))
            {
                var handle = capture.Handle;
                var commands = new Thread(delegate() {
                    // EOF also stops the receiver when Electron exits or crashes.
                    try { Console.In.ReadLine(); } catch { }
                    PostMessage(handle, 0x8001, IntPtr.Zero, IntPtr.Zero);
                });
                commands.IsBackground = true;
                commands.Start();
                emit("{\"type\":\"ready\"}");
                Application.Run();
            }
            return 0;
        }
        catch (Exception error)
        {
            emit("{\"type\":\"error\",\"message\":\"" + error.Message.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ") + "\"}");
            return 1;
        }
    }
}
