const {
  app,
  BrowserWindow,
  globalShortcut,
  clipboard,
  Notification,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  powerSaveBlocker,
  screen,
} = require('electron');
const path = require('path');
const fs = require('fs');

const APP_URL = process.env.TALKING_URL || 'https://project--39e650b7-feb8-41f0-a90e-aa5cab35c27a.lovable.app/';
const UPDATE_MANIFEST_URL = process.env.TALKING_UPDATE_URL || 'https://voice-to-clipboard.lovable.app/talking-version.json';
const ICON_PATH = path.join(__dirname, 'tray-icon.png');
const START_HIDDEN = process.argv.includes('--hidden');
const CURRENT_VERSION = app.getVersion();

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let toggleAccel = 'F8';
let hotkeyOk = true;
let isRecording = false;
let powerBlockerId = null;

// -------- Persistent settings (userData/settings.json) --------
let SETTINGS_PATH = null;
function loadSettings() {
  try {
    SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      if (raw && typeof raw.toggleAccel === 'string') toggleAccel = raw.toggleAccel;
    }
  } catch (e) { console.error('loadSettings failed', e); }
}
function saveSettings() {
  try {
    if (!SETTINGS_PATH) return;
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ toggleAccel }, null, 2));
  } catch (e) { console.error('saveSettings failed', e); }
}

// -------- Single-instance lock --------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

// -------- Anti-throttling for background --------
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Windows: identity for native toast notifications (branding + click routing)
if (process.platform === 'win32') { try { app.setAppUserModelId('com.talking.desktop'); } catch {} }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900, height: 780, title: 'TalKing', icon: ICON_PATH,
    backgroundColor: '#0a0a0a', show: !START_HIDDEN,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(APP_URL);

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) { e.preventDefault(); mainWindow.hide(); notifyOnce(); }
  });
  mainWindow.on('minimize', (e) => { e.preventDefault(); mainWindow.hide(); notifyOnce(); });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('hotkey-status', { accel: toggleAccel, ok: hotkeyOk });
  });
}

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const { width } = display.workAreaSize;
  const W = 220, H = 44;
  overlayWindow = new BrowserWindow({
    width: W, height: H,
    x: Math.round(width / 2 - W / 2), y: 12,
    frame: false, transparent: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    type: process.platform === 'darwin' ? 'panel' : 'toolbar',
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(overlayHtml()));
}

function overlayHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;font-family:-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden;-webkit-user-select:none;user-select:none;}
    .pill{display:flex;align-items:center;gap:10px;padding:8px 14px;margin:4px 8px;border-radius:999px;background:rgba(10,10,12,.82);color:#fff;font-size:13px;font-weight:500;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.08);box-shadow:0 4px 16px rgba(0,0,0,.4);}
    .dot{width:9px;height:9px;border-radius:50%;background:#666;flex-shrink:0;}
    .idle .dot{background:#666;}
    .recording .dot{background:#ef4444;animation:pulse 1s ease-in-out infinite;}
    .processing .dot{background:#f59e0b;animation:pulse .6s ease-in-out infinite;}
    .copied .dot{background:#22c55e;}
    .error .dot{background:#ef4444;}
    @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.3;}}
  </style></head><body>
    <div id="p" class="pill idle"><span class="dot"></span><span id="t">TalKing</span></div>
    <script>
      const p=document.getElementById('p'),t=document.getElementById('t');
      const map={idle:['idle','TalKing'],recording:['recording','● Recording…'],processing:['processing','Translating…'],copied:['copied','✓ Copied'],error:['error','Error']};
      window.__setStatus=(s)=>{const[c,l]=map[s]||map.idle;p.className='pill '+c;t.textContent=l;};
    </script>
  </body></html>`;
}

function setOverlayStatus(status) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const visible = status && status !== 'idle';
  overlayWindow.webContents.executeJavaScript(`window.__setStatus(${JSON.stringify(status || 'idle')})`).catch(() => {});
  if (visible) { if (!overlayWindow.isVisible()) overlayWindow.showInactive(); }
  else { setTimeout(() => { if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) overlayWindow.hide(); }, 1200); }
}

let hideNotified = false;
function notifyOnce() {
  if (hideNotified) return;
  hideNotified = true;
  notify({
    title: 'TalKing runs in the background',
    body: `Press ${toggleAccel} anytime to record. Right-click the tray icon to quit. Click here to reopen.`,
  });
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  hotkeyOk = false;
  try {
    hotkeyOk = globalShortcut.register(toggleAccel, () => {
      if (mainWindow) mainWindow.webContents.send('hotkey', 'toggle');
    });
    if (!hotkeyOk) {
      notify({
        title: 'TalKing — hotkey conflict',
        body: `${toggleAccel} is already used by another app. Click to open TalKing and pick another key.`,
        urgent: true,
      });
    }
  } catch (e) { console.error('Failed to register hotkey', e); }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hotkey-status', { accel: toggleAccel, ok: hotkeyOk });
  }
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const updateLabel = latestUpdate
    ? `⬇ Download update v${latestUpdate.version}`
    : 'Check for updates…';
  const menu = Menu.buildFromTemplate([
    { label: `TalKing v${CURRENT_VERSION} — ${isRecording ? '🔴 recording' : hotkeyOk ? 'idle' : '⚠ hotkey blocked'}`, enabled: false },
    { type: 'separator' },
    { label: 'Show window', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: 'Hide window', click: () => { if (mainWindow) mainWindow.hide(); } },
    { label: `Toggle recording (${toggleAccel})`, click: () => mainWindow && mainWindow.webContents.send('hotkey', 'toggle') },
    { type: 'separator' },
    { label: updateLabel, click: () => {
        if (latestUpdate && latestUpdate.url) shell.openExternal(latestUpdate.url);
        else checkForUpdates({ silent: false });
      } },
    { type: 'separator' },
    { label: 'Quit TalKing', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`TalKing — ${isRecording ? 'recording…' : hotkeyOk ? `press ${toggleAccel}` : `${toggleAccel} conflict - change in Settings`}`);
}

function buildTray() {
  let icon = nativeImage.createFromPath(ICON_PATH);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  else icon = icon.resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  rebuildTrayMenu();
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

// -------- Update checker --------
const { shell, dialog, net } = require('electron');
let latestUpdate = null;

function cmpVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1; if (x < y) return -1;
  }
  return 0;
}

async function fetchUpdateManifest() {
  return new Promise((resolve) => {
    try {
      const req = net.request({ method: 'GET', url: UPDATE_MANIFEST_URL, redirect: 'follow' });
      let body = '';
      req.on('response', (res) => {
        res.on('data', (c) => { body += c.toString('utf8'); });
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.end();
    } catch { resolve(null); }
  });
}

async function checkForUpdates({ silent = true } = {}) {
  const manifest = await fetchUpdateManifest();
  if (!manifest || !manifest.version) {
    if (!silent) dialog.showMessageBox({ type: 'info', title: 'TalKing', message: 'Update check failed.', detail: 'Could not reach the update server. Try again later.' });
    return;
  }
  if (cmpVersion(manifest.version, CURRENT_VERSION) > 0) {
    latestUpdate = manifest;
    rebuildTrayMenu();
    const res = await dialog.showMessageBox({
      type: 'info',
      title: 'TalKing update available',
      message: `A new version is available: v${manifest.version}`,
      detail: (manifest.notes || '') + `\n\nYou are on v${CURRENT_VERSION}. Download and replace the folder to update.`,
      buttons: ['Download now', 'Later'],
      defaultId: 0, cancelId: 1,
    });
    if (res.response === 0 && manifest.url) shell.openExternal(manifest.url);
  } else if (!silent) {
    dialog.showMessageBox({ type: 'info', title: 'TalKing', message: `You are up to date (v${CURRENT_VERSION}).` });
  }
}

function showWindow() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function notify({ title, body, silent = false, urgent = false }) {
  try {
    const n = new Notification({
      title, body, icon: ICON_PATH, silent,
      urgency: urgent ? 'critical' : 'normal',
    });
    n.on('click', () => showWindow());
    n.show();
    return n;
  } catch { return null; }
}

ipcMain.handle('clipboard:write', (_e, payload) => {
  const { text, meta } = (payload && typeof payload === 'object' && 'text' in payload)
    ? payload : { text: payload, meta: null };
  clipboard.writeText(String(text ?? ''));
  const windowHidden = !mainWindow || !mainWindow.isVisible();
  // Native notification only when the app is in the background — avoids double sound when the UI is visible.
  if (windowHidden) {
    const langName = meta && meta.targetLangName ? meta.targetLangName : '';
    const preview = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
    notify({
      title: langName ? `✓ Copied · ${langName}` : '✓ Copied to clipboard',
      body: preview || 'Translation ready — paste with Ctrl+V',
      silent: false,
    });
  }
  return { ok: true, windowHidden };
});
ipcMain.handle('window:show', () => { showWindow(); return true; });

ipcMain.handle('hotkeys:set', (_e, payload) => {
  const toggle = payload && (payload.toggle || payload.start);
  if (toggle && typeof toggle === 'string') {
    toggleAccel = toggle;
    saveSettings();
  }
  registerHotkeys();
  return { toggle: toggleAccel, ok: hotkeyOk };
});

ipcMain.handle('hotkeys:get', () => ({ toggle: toggleAccel, ok: hotkeyOk }));

ipcMain.handle('recording:state', (_e, state) => {
  isRecording = !!state;
  rebuildTrayMenu();
  if (isRecording && powerBlockerId === null) {
    try { powerBlockerId = powerSaveBlocker.start('prevent-app-suspension'); } catch {}
  } else if (!isRecording && powerBlockerId !== null) {
    try { powerSaveBlocker.stop(powerBlockerId); } catch {}
    powerBlockerId = null;
  }
  return true;
});

ipcMain.handle('overlay:status', (_e, status) => { setOverlayStatus(status); return true; });
ipcMain.handle('window:hide', () => { if (mainWindow) mainWindow.hide(); return true; });
ipcMain.handle('app:info', () => ({ isElectron: true, toggleAccel, hotkeyOk, version: CURRENT_VERSION }));
ipcMain.handle('updates:check', async () => { await checkForUpdates({ silent: false }); return latestUpdate; });

// -------- Auto-start with Windows (hidden into tray) --------
function getAutoStart() {
  try {
    const s = app.getLoginItemSettings({ args: ['--hidden'] });
    return { enabled: !!s.openAtLogin };
  } catch { return { enabled: false }; }
}
function setAutoStart(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: true,
      args: ['--hidden'],
      path: process.execPath,
    });
    return getAutoStart();
  } catch (e) { console.error('setAutoStart failed', e); return { enabled: false }; }
}
ipcMain.handle('autostart:get', () => getAutoStart());
ipcMain.handle('autostart:set', (_e, enabled) => setAutoStart(enabled));

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  try { createOverlay(); } catch (e) { console.error('Overlay failed', e); }
  try { buildTray(); } catch (e) { console.error('Tray failed', e); }
  registerHotkeys();
  // Check for updates 8s after startup, then every 6h
  setTimeout(() => checkForUpdates({ silent: true }), 8000);
  setInterval(() => checkForUpdates({ silent: true }), 6 * 60 * 60 * 1000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (powerBlockerId !== null) { try { powerSaveBlocker.stop(powerBlockerId); } catch {} powerBlockerId = null; }
});
app.on('window-all-closed', () => { /* keep alive in tray */ });
