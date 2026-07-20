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
  const tmp = path.join(os.tmpdir(), 'talking-autotype.ps1');
  const src = `
param([string]$Text)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Kb {
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public InputUnion u; }
  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)] public KEYBDINPUT ki;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk; public ushort wScan; public uint dwFlags;
    public uint time; public IntPtr dwExtraInfo;
    public uint pad1; public uint pad2;
  }
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  public const uint INPUT_KEYBOARD = 1;
  public const uint KEYEVENTF_KEYUP    = 0x0002;
  public const uint KEYEVENTF_UNICODE  = 0x0004;
  public const uint KEYEVENTF_SCANCODE = 0x0008;

  public static void SendChar(char c) {
    INPUT[] inputs = new INPUT[2];
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].u.ki.wVk = 0;
    inputs[0].u.ki.wScan = (ushort)c;
    inputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE;
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].u.ki.wVk = 0;
    inputs[1].u.ki.wScan = (ushort)c;
    inputs[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
    // Extended flag for chars in the surrogate/high range so the low byte
    // (0xE0..) isn't misinterpreted as a scancode-extended key.
    if ((c & 0xFF00) == 0xE000) {
      inputs[0].u.ki.dwFlags |= 0x0001;
      inputs[1].u.ki.dwFlags |= 0x0001;
    }
    SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@ -Language CSharp

Start-Sleep -Milliseconds 120
foreach ($ch in $Text.ToCharArray()) {
  [Kb]::SendChar($ch)
  Start-Sleep -Milliseconds 8
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
      ps = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Text', t],
        { windowsHide: true, stdio: 'ignore' },
      );
    } catch (e) {
      return resolve({ ok: false, error: String(e && e.message || e) });
    }
    ps.on('error', (e) => resolve({ ok: false, error: String(e && e.message || e) }));
    ps.on('exit', (code) => resolve({ ok: code === 0, error: code === 0 ? null : `exit ${code}` }));
  });
}

module.exports = { typeText };
