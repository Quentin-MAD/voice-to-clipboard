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
let loadError = null;

// Load uiohook-napi. In a packaged app the native .node binary lives outside
// app.asar (asarUnpack), and depending on how the app was built the plain
// require() can fail. Try the unpacked path explicitly before giving up,
// because the globalShortcut fallback does NOT work inside games.
function loadUiohook() {
  const candidates = ['uiohook-napi'];
  try {
    const dir = __dirname;
    const asarIdx = dir.indexOf('app.asar');
    if (asarIdx !== -1) {
      const base = dir.slice(0, asarIdx) + 'app.asar.unpacked';
      candidates.push(require('path').join(base, 'node_modules', 'uiohook-napi'));
    }
    if (process.resourcesPath) {
      const p = require('path');
      candidates.push(p.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'uiohook-napi'));
      candidates.push(p.join(process.resourcesPath, 'app', 'node_modules', 'uiohook-napi'));
    }
  } catch {}

  for (const c of candidates) {
    try {
      const mod = require(c);
      if (mod && mod.uIOhook) {
        uIOhook = mod.uIOhook;
        UiohookKey = mod.UiohookKey;
        available = true;
        console.log('[hotkeys] uiohook-napi loaded from', c);
        return;
      }
    } catch (e) {
      loadError = e && e.message;
    }
  }
  console.error('[hotkeys] uiohook-napi failed to load, falling back to globalShortcut:', loadError);
}

loadUiohook();


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

let registered = []; // { spec, cb, accel }

// Physically-held keycodes, tracked independently of the registration list.
// Using a global set (instead of a per-registration `_down` flag) means that
// re-registering hotkeys - which happens every time an auto-type translation
// is armed or consumed - can never leave a hotkey stuck in the "down" state
// and therefore permanently dead.
const heldKeys = new Set();

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
      // Games send repeated keydown while a key is held; each callback is
      // stateful (toggle) so we only fire on the first physical press.
      const wasHeld = heldKeys.has(e.keycode);
      heldKeys.add(e.keycode);
      if (wasHeld) return;
      // Iterate a snapshot: a callback may re-register hotkeys synchronously.
      for (const r of registered.slice()) {
        if (matches(r.spec, e)) {
          try { r.cb(); } catch (err) { console.error('[hotkeys] cb error', err); }
        }
      }
    });
    uIOhook.on('keyup', (e) => {
      heldKeys.delete(e.keycode);
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
  if (!available) return false;
  registered.push({ spec, cb, accel });
  return true;
}

function unregisterAll() {
  // Replace the array instead of truncating it, so any in-flight iteration
  // over a previous snapshot stays coherent.
  registered = [];
}

function stop() {
  try { if (started && uIOhook) uIOhook.stop(); } catch {}
  started = false;
  heldKeys.clear();
}

function isAvailable() { return available; }

/** 'lowlevel' when the game-compatible keyboard hook is active. */
function getBackend() { return available ? 'lowlevel' : 'globalShortcut'; }

function getLoadError() { return loadError; }


module.exports = { register, unregisterAll, stop, isAvailable, parseAccelerator };
