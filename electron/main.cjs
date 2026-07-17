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

const APP_URL = process.env.TALKING_URL || 'https://project--39e650b7-feb8-41f0-a90e-aa5cab35c27a.lovable.app/';
const ICON_PATH = path.join(__dirname, 'tray-icon.png');
const START_HIDDEN = process.argv.includes('--hidden');

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let toggleAccel = 'F8';
let isRecording = false;
let powerBlockerId = null;

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

// Anti-throttling for background operation
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 780,
    title: 'TalKing',
    icon: ICON_PATH,
    backgroundColor: '#0a0a0a',
    show: !START_HIDDEN,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(APP_URL);

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
      notifyOnce();
    }
  });

  mainWindow.on('minimize', (e) => {
    e.preventDefault();
    mainWindow.hide();
    notifyOnce();
  });
}

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const { width } = display.workAreaSize;
  const W = 220;
  const H = 44;
  overlayWindow = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(width / 2 - W / 2),
    y: 12,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
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
    .pill{display:flex;align-items:center;gap:10px;padding:8px 14px;margin:4px 8px;border-radius:999px;background:rgba(10,10,12,.82);color:#fff;font-size:13px;font-weight:500;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.08);box-shadow:0 4px 16px rgba(0,0,0,.4);transition:opacity .2s;}
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
  if (visible) {
    if (!overlayWindow.isVisible()) overlayWindow.showInactive();
  } else {
    // Fade delay so users see "Copied" briefly
    setTimeout(() => {
      if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) overlayWindow.hide();
    }, 1200);
  }
}

let hideNotified = false;
function notifyOnce() {
  if (hideNotified) return;
  hideNotified = true;
  try {
    new Notification({
      title: 'TalKing runs in the background',
      body: `Press ${toggleAccel} anytime to record. Right-click the tray icon to quit.`,
      icon: ICON_PATH,
    }).show();
  } catch {}
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  try {
    const ok = globalShortcut.register(toggleAccel, () => {
      if (mainWindow) mainWindow.webContents.send('hotkey', 'toggle');
    });
    if (!ok) {
      try {
        new Notification({
          title: 'TalKing — hotkey conflict',
          body: `${toggleAccel} is already used by another app. Open TalKing settings to pick another key.`,
          icon: ICON_PATH,
        }).show();
      } catch {}
    }
  } catch (e) {
    console.error('Failed to register hotkey', e);
  }
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: `TalKing — ${isRecording ? '🔴 recording' : 'idle'}`, enabled: false },
    { type: 'separator' },
    { label: 'Show window', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: 'Hide window', click: () => { if (mainWindow) mainWindow.hide(); } },
    { label: `Toggle recording (${toggleAccel})`, click: () => mainWindow && mainWindow.webContents.send('hotkey', 'toggle') },
    { type: 'separator' },
    { label: 'Quit TalKing', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`TalKing — ${isRecording ? 'recording…' : `press ${toggleAccel}`}`);
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

ipcMain.handle('clipboard:write', (_e, text) => {
  clipboard.writeText(String(text ?? ''));
  try {
    new Notification({ title: 'TalKing', body: '✅ Translation copied to clipboard', icon: ICON_PATH }).show();
  } catch {}
  return true;
});

ipcMain.handle('hotkeys:set', (_e, payload) => {
  const toggle = payload && (payload.toggle || payload.start);
  if (toggle) toggleAccel = toggle;
  registerHotkeys();
  return { toggle: toggleAccel };
});

ipcMain.handle('recording:state', (_e, state) => {
  isRecording = !!state;
  rebuildTrayMenu();
  // Prevent OS from suspending the app while mic is active
  if (isRecording && powerBlockerId === null) {
    try { powerBlockerId = powerSaveBlocker.start('prevent-app-suspension'); } catch {}
  } else if (!isRecording && powerBlockerId !== null) {
    try { powerSaveBlocker.stop(powerBlockerId); } catch {}
    powerBlockerId = null;
  }
  return true;
});

ipcMain.handle('overlay:status', (_e, status) => {
  setOverlayStatus(status);
  return true;
});

ipcMain.handle('window:hide', () => {
  if (mainWindow) mainWindow.hide();
  return true;
});

ipcMain.handle('app:info', () => ({ isElectron: true, toggleAccel }));

app.whenReady().then(() => {
  createWindow();
  try { createOverlay(); } catch (e) { console.error('Overlay failed', e); }
  try { buildTray(); } catch (e) { console.error('Tray failed', e); }
  registerHotkeys();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (powerBlockerId !== null) {
    try { powerSaveBlocker.stop(powerBlockerId); } catch {}
    powerBlockerId = null;
  }
});
app.on('window-all-closed', () => { /* keep alive in tray */ });
