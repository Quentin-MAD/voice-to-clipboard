const { app, BrowserWindow, globalShortcut, clipboard, Notification, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const APP_URL = process.env.VOXTRANSLATE_URL || 'https://id-preview--39e650b7-feb8-41f0-a90e-aa5cab35c27a.lovable.app/';

let mainWindow = null;
let tray = null;
let toggleAccel = 'F8';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 780,
    title: 'VoxTranslate',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(APP_URL);

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  try {
    globalShortcut.register(toggleAccel, () => {
      if (mainWindow) mainWindow.webContents.send('hotkey', 'toggle');
    });
  } catch (e) {
    console.error('Failed to register hotkey', e);
  }
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Show VoxTranslate', click: () => mainWindow && mainWindow.show() },
    { label: `Toggle recording (${toggleAccel})`, click: () => mainWindow && mainWindow.webContents.send('hotkey', 'toggle') },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function buildTray() {
  const empty = nativeImage.createEmpty();
  tray = new Tray(empty);
  tray.setToolTip('VoxTranslate — global hotkey active');
  rebuildTrayMenu();
  tray.on('click', () => mainWindow && mainWindow.show());
}

ipcMain.handle('clipboard:write', (_e, text) => {
  clipboard.writeText(String(text ?? ''));
  try {
    new Notification({ title: 'VoxTranslate', body: '✅ Translation copied to clipboard' }).show();
  } catch {}
  return true;
});

ipcMain.handle('hotkeys:set', (_e, payload) => {
  const toggle = payload && (payload.toggle || payload.start);
  if (toggle) toggleAccel = toggle;
  registerHotkeys();
  return { toggle: toggleAccel };
});

ipcMain.handle('app:info', () => ({ isElectron: true, toggleAccel }));

app.whenReady().then(() => {
  createWindow();
  try { buildTray(); } catch (e) { console.error('Tray failed', e); }
  registerHotkeys();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { /* keep alive in tray */ });
