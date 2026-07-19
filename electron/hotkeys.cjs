// Low-level keyboard hook via uiohook-napi
// Replaces Electron's globalShortcut (RegisterHotKey) with a WH_KEYBOARD_LL
// hook so hotkeys work in DirectInput / exclusive-fullscreen games (Star Citizen,
// Valorant, LoL, Fortnite, Apex, CS2, etc.) exactly like Discord/OBS push-to-talk.
//
// Same API surface as globalShortcut: register(accelerator, cb) / unregisterAll().
// Accepts standard Electron accelerator strings ("F8", "Ctrl+Shift+X", "Alt+Space")
// so the renderer doesn't need to change.

let uIOhook = null;
let UiohookKey = null;
let started = false;
let available = false;

try {
  const mod = require('uiohook-napi');
  uIOhook = mod.uIOhook;
  UiohookKey = mod.UiohookKey;
  available = true;
} catch (e) {
  console.error('[hotkeys] uiohook-napi failed to load, falling back to globalShortcut:', e && e.message);
}

// Map an Electron accelerator token to a uiohook keycode.
function tokenToKeycode(token) {
  if (!UiohookKey) return null;
  const t = String(token || '').trim();
  if (!t) return null;
  const up = t.toUpperCase();

  // Direct table
  const alias = {
    'ESC': 'Escape', 'ESCAPE': 'Escape',
    'RETURN': 'Enter', 'ENTER': 'Enter',
    'SPACE': 'Space', 'SPACEBAR': 'Space',
    'TAB': 'Tab', 'BACKSPACE': 'Backspace', 'DELETE': 'Delete', 'DEL': 'Delete',
    'INSERT': 'Insert', 'INS': 'Insert', 'HOME': 'Home', 'END': 'End',
    'PAGEUP': 'PageUp', 'PAGEDOWN': 'PageDown',
    'UP': 'ArrowUp', 'DOWN': 'ArrowDown', 'LEFT': 'ArrowLeft', 'RIGHT': 'ArrowRight',
    'CAPSLOCK': 'CapsLock', 'NUMLOCK': 'NumLock', 'SCROLLLOCK': 'ScrollLock',
    'PRINTSCREEN': 'PrintScreen',
    'PLUS': 'Equal', '=': 'Equal',
    '-': 'Minus',
    ',': 'Comma', '.': 'Period', '/': 'Slash', ';': 'Semicolon',
    "'": 'Quote', '\\': 'Backslash', '`': 'Backquote',
    '[': 'BracketLeft', ']': 'BracketRight',
  };

  // Single char letter A-Z / digit 0-9
  if (/^[A-Z]$/.test(up)) return UiohookKey[up];
  if (/^[0-9]$/.test(up)) return UiohookKey[up];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(up)) return UiohookKey[up];
  if (/^NUMPAD[0-9]$/.test(up)) return UiohookKey['Numpad' + up.slice(6)];
  if (up === 'NUM_LOCK') return UiohookKey.NumLock;

  if (alias[up]) return UiohookKey[alias[up]];
  // Try canonical spelling directly (case-sensitive keys like "F8" / "ArrowUp")
  if (UiohookKey[t] !== undefined) return UiohookKey[t];
  return null;
}

// Parse "Ctrl+Shift+X" -> { keycode, ctrl, shift, alt, meta }
function parseAccelerator(accel) {
  if (!accel) return null;
  const parts = String(accel).split('+').map((s) => s.trim()).filter(Boolean);
  const spec = { keycode: null, ctrl: false, shift: false, alt: false, meta: false };
  for (const p of parts) {
    const up = p.toUpperCase();
    if (up === 'CTRL' || up === 'CONTROL' || up === 'COMMANDORCONTROL' || up === 'CMDORCTRL') { spec.ctrl = true; continue; }
    if (up === 'SHIFT') { spec.shift = true; continue; }
    if (up === 'ALT' || up === 'OPTION') { spec.alt = true; continue; }
    if (up === 'META' || up === 'CMD' || up === 'COMMAND' || up === 'SUPER' || up === 'WIN') { spec.meta = true; continue; }
    const kc = tokenToKeycode(p);
    if (kc !== null && kc !== undefined) spec.keycode = kc;
  }
  if (spec.keycode == null) return null;
  return spec;
}

const registered = []; // { spec, cb, accel }

function matches(spec, e) {
  return e.keycode === spec.keycode
    && !!e.ctrlKey === !!spec.ctrl
    && !!e.shiftKey === !!spec.shift
    && !!e.altKey === !!spec.alt
    && !!e.metaKey === !!spec.meta;
}

function ensureStarted() {
  if (!available || started) return;
  try {
    uIOhook.on('keydown', (e) => {
      // Debounce: many games get repeated keydown events; each registered cb
      // is stateful (toggle) so calling twice per press would flip back.
      // We only trigger on the very first keydown; keyup resets the latch.
      for (const r of registered) {
        if (matches(r.spec, e) && !r._down) {
          r._down = true;
          try { r.cb(); } catch (err) { console.error('[hotkeys] cb error', err); }
        }
      }
    });
    uIOhook.on('keyup', (e) => {
      for (const r of registered) {
        if (r._down && e.keycode === r.spec.keycode) r._down = false;
      }
    });
    uIOhook.start();
    started = true;
    console.log('[hotkeys] uIOhook started (low-level keyboard hook active)');
  } catch (e) {
    console.error('[hotkeys] uIOhook.start() failed', e);
    available = false;
  }
}

function register(accel, cb) {
  if (!available) return false;
  const spec = parseAccelerator(accel);
  if (!spec) return false;
  ensureStarted();
  registered.push({ spec, cb, accel, _down: false });
  return true;
}

function unregisterAll() {
  registered.length = 0;
}

function stop() {
  try { if (started && uIOhook) uIOhook.stop(); } catch {}
  started = false;
}

function isAvailable() { return available; }

module.exports = { register, unregisterAll, stop, isAvailable, parseAccelerator };
