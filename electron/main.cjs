const { app, BrowserWindow, globalShortcut, clipboard, Notification, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const APP_URL = process.env.TALKING_URL || 'https://project--39e650b7-feb8-41f0-a90e-aa5cab35c27a.lovable.app/';
const ICON_PATH = path.join(__dirname, 'tray-icon.png');

let mainWindow = null;
let tray = null;
let toggleAccel = 'F8';
let isRecording = false;

// Single-instance lock — prevents multiple TalKing processes from fighting over F8.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

// Reduce GPU/audio latency in background
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 780,
    title: 'TalKing',
    icon: ICON_PATH,
    backgroundColor: '#0a0a0a',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(APP_URL);

  // Close button → hide to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
      notifyOnce();
    }
  });

  // Minimize → hide to tray so the renderer stays fully active (no throttling)
  mainWindow.on('minimize', (e) => {
    e.preventDefault();
    mainWindow.hide();
    notifyOnce();
  });
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
    if (!ok) console.error('Hotkey registration returned false for', toggleAccel);
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
  return true;
});

ipcMain.handle('app:info', () => ({ isElectron: true, toggleAccel }));

app.whenReady().then(() => {
  createWindow();
  try { buildTray(); } catch (e) { console.error('Tray failed', e); }
  registerHotkeys();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { /* keep alive in tray */ });
