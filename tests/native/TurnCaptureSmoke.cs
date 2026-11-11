using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;

internal static class TurnCaptureSmoke
{
    private static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static FieldInfo Field(string name) { return typeof(TurnCapture).GetField(name, BindingFlags.Instance | BindingFlags.NonPublic); }
    [STAThread]
    private static int Main()
    {
        var messages = new List<string>();
        IntPtr packet = Marshal.AllocHGlobal(48);
        try
        {
            using (var receiver = new TurnCapture(0, messages.Add))
            {
                Check(!TurnCapture.RegisterHotKey(IntPtr.Zero, 991, 0x4000, 0x7A), "F11 was not reserved.");
                for (int i = 0; i < 48; i++) Marshal.WriteByte(packet, i, 0);
                Marshal.WriteIntPtr(packet, 8, new IntPtr(123));
                int header = 8 + IntPtr.Size * 2;
                Marshal.WriteInt32(packet, header + 12, 16000);
                receiver.ReadPacket(packet, 48);
                Check((long)Field("x").GetValue(receiver) == 0, "Unarmed input was counted.");
                Field("recording").SetValue(receiver, true);
                receiver.ReadPacket(packet, 48);
                Marshal.WriteInt32(packet, header + 12, -50);
                Marshal.WriteInt32(packet, header + 16, -5);
                receiver.ReadPacket(packet, 48);
                Check((long)Field("x").GetValue(receiver) == 15950, "Signed raw counts were decoded incorrectly.");
                Check((long)Field("pathX").GetValue(receiver) == 16050, "Horizontal travel was decoded incorrectly.");
                Check((long)Field("pathY").GetValue(receiver) == 5, "Vertical travel was decoded incorrectly.");
                Marshal.WriteIntPtr(packet, 8, new IntPtr(456));
                receiver.ReadPacket(packet, 48);
                Check(messages.Count == 1 && messages[0].Contains("More than one mouse"), "Device changes were not rejected.");
            }
            Check(TurnCapture.RegisterHotKey(IntPtr.Zero, 991, 0x4000, 0x7A), "F11 was not released after disposal.");
            TurnCapture.UnregisterHotKey(IntPtr.Zero, 991);
            using (var receiver = new TurnCapture(0, messages.Add))
            {
                Field("recording").SetValue(receiver, true);
                Marshal.WriteInt16(packet, 8 + IntPtr.Size * 2, 1);
                receiver.ReadPacket(packet, 48);
                Check(messages[messages.Count - 1].Contains("absolute pointing"), "Absolute input was not rejected.");
            }
            Console.WriteLine("Native smoke passed: real Windows Raw Input registration, F11 ownership/release, x64 packet decoding, unarmed input exclusion, multiple-device and absolute-input rejection. Packet samples are synthetic.");
            return 0;
        }
        finally { Marshal.FreeHGlobal(packet); }
    }
}
