// Auto-type: injects Unicode characters into the currently-focused window
// via Win32 SendInput with KEYEVENTF_UNICODE. Works in games that block
// Ctrl+V paste (Star Citizen, some MMOs, etc.) because the input is fed
// through the low-level keyboard queue exactly like real key presses.
//
// Implementation choice: we shell out to a tiny embedded PowerShell script
// that P/Invokes SendInput. No native npm module = no build/packaging issues,
// works on every stock Windows 10+ install.

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

let scriptPath = null;
function ensureScript() {
  if (scriptPath && fs.existsSync(scriptPath)) return scriptPath;
  // Version the temp file so an update cannot reuse a stale script left by an
  // older TalKing release.
  const tmp = path.join(os.tmpdir(), 'talking-autotype-v3.ps1');
  const src = `
param([string]$TextBase64)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Kb {
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public InputUnion u; }
  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)] public KEYBDINPUT ki;
    // INPUT is a union. Keeping only KEYBDINPUT makes the x64 structure 32
    // bytes instead of 40, causing SendInput to reject every call (error 87).
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public HARDWAREINPUT hi;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk; public ushort wScan; public uint dwFlags;
    public uint time; public UIntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx; public int dy; public uint mouseData; public uint dwFlags;
    public uint time; public UIntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct HARDWAREINPUT {
    public uint uMsg; public ushort wParamL; public ushort wParamH;
  }
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);
  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint idThread);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern short VkKeyScanExW(char ch, IntPtr keyboardLayout);
  public const uint INPUT_KEYBOARD = 1;
  public const uint KEYEVENTF_KEYUP    = 0x0002;
  public const uint KEYEVENTF_UNICODE  = 0x0004;

  static INPUT Key(ushort vk, ushort scan, uint flags) {
    INPUT i = new INPUT();
    i.type = INPUT_KEYBOARD;
    i.u.ki.wVk = vk;
    i.u.ki.wScan = scan;
    i.u.ki.dwFlags = flags;
    return i;
  }

  static bool Push(INPUT[] inputs) {
    return SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) == inputs.Length;
  }

  // Games commonly ignore KEYEVENTF_UNICODE while accepting ordinary virtual
  // key presses. Prefer layout-aware physical keys and only use Unicode for a
  // character that the active Windows keyboard layout cannot produce.
  public static bool SendChar(char c) {
    IntPtr foreground = GetForegroundWindow();
    uint threadId = GetWindowThreadProcessId(foreground, IntPtr.Zero);
    short mapped = VkKeyScanExW(c, GetKeyboardLayout(threadId));
    if (mapped != -1) {
      ushort vk = (ushort)(mapped & 0xff);
      int modifiers = (mapped >> 8) & 0xff;
      System.Collections.Generic.List<INPUT> inputs = new System.Collections.Generic.List<INPUT>();
      if ((modifiers & 2) != 0) inputs.Add(Key(0x11, 0, 0)); // Ctrl
      if ((modifiers & 4) != 0) inputs.Add(Key(0x12, 0, 0)); // Alt
      if ((modifiers & 1) != 0) inputs.Add(Key(0x10, 0, 0)); // Shift
      inputs.Add(Key(vk, 0, 0));
      inputs.Add(Key(vk, 0, KEYEVENTF_KEYUP));
      if ((modifiers & 1) != 0) inputs.Add(Key(0x10, 0, KEYEVENTF_KEYUP));
      if ((modifiers & 4) != 0) inputs.Add(Key(0x12, 0, KEYEVENTF_KEYUP));
      if ((modifiers & 2) != 0) inputs.Add(Key(0x11, 0, KEYEVENTF_KEYUP));
      return Push(inputs.ToArray());
    }
    return Push(new INPUT[] {
      Key(0, (ushort)c, KEYEVENTF_UNICODE),
      Key(0, (ushort)c, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)
    });
  }
}
"@ -Language CSharp

try {
  $Text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextBase64))
} catch {
  Write-Error "Invalid text payload"
  exit 21
}

# Let the physical trigger key finish before injecting the first character.
Start-Sleep -Milliseconds 120
foreach ($ch in $Text.ToCharArray()) {
  if (-not [Kb]::SendChar($ch)) {
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    Write-Error "SendInput failed: $code"
    exit 20
  }
  Start-Sleep -Milliseconds 10
}
`;
  fs.writeFileSync(tmp, src, 'utf8');
  scriptPath = tmp;
  return tmp;
}

// Type a Unicode string into the currently focused window.
// Returns a Promise<{ ok, error? }>. Non-blocking for the caller.
function typeText(text) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ ok: false, error: 'not-windows' });
    const t = String(text ?? '');
    if (!t) return resolve({ ok: false, error: 'empty' });
    let ps;
    try {
      const script = ensureScript();
      // Base64 protects accents, quotes, new lines and leading dashes from the
      // PowerShell command-line parser.
      const payload = Buffer.from(t, 'utf8').toString('base64');
      ps = spawn(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-TextBase64', payload],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
      );
    } catch (e) {
      return resolve({ ok: false, error: String(e && e.message || e) });
    }
    let stderr = '';
    ps.stderr?.on('data', (chunk) => { stderr += String(chunk).slice(0, 1000); });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    ps.on('error', (e) => finish({ ok: false, error: String(e && e.message || e) }));
    ps.on('exit', (code) => finish({
      ok: code === 0,
      error: code === 0 ? null : (stderr.trim().slice(0, 300) || `exit ${code}`),
    }));
  });
}

module.exports = { typeText };
