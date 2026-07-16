const { app, BrowserWindow, globalShortcut, clipboard, Notification, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

// URL of the deployed web app (front + API)
const APP_URL = process.env.VOXTRANSLATE_URL || 'https://id-preview--39e650b7-feb8-41f0-a90e-aa5cab35c27a.lovable.app/';

let mainWindow = null;
let tray = null;
let startAccel = 'F8';
let stopAccel = 'F9';

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
    globalShortcut.register(startAccel, () => {
      if (mainWindow) mainWindow.webContents.send('hotkey', 'start');
    });
    globalShortcut.register(stopAccel, () => {
      if (mainWindow) mainWindow.webContents.send('hotkey', 'stop');
    });
  } catch (e) {
    console.error('Failed to register hotkeys', e);
  }
}

function buildTray() {
  const empty = nativeImage.createEmpty();
  tray = new Tray(empty);
  const menu = Menu.buildFromTemplate([
    { label: 'Show VoxTranslate', click: () => mainWindow && mainWindow.show() },
    { label: `Start recording (${startAccel})`, click: () => mainWindow && mainWindow.webContents.send('hotkey', 'start') },
    { label: `Stop recording (${stopAccel})`, click: () => mainWindow && mainWindow.webContents.send('hotkey', 'stop') },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setToolTip('VoxTranslate — global hotkeys active');
  tray.setContextMenu(menu);
  tray.on('click', () => mainWindow && mainWindow.show());
}

// IPC from renderer
ipcMain.handle('clipboard:write', (_e, text) => {
  clipboard.writeText(String(text ?? ''));
  try {
    new Notification({ title: 'VoxTranslate', body: '✅ Translation copied to clipboard' }).show();
  } catch {}
  return true;
});

ipcMain.handle('hotkeys:set', (_e, { start, stop }) => {
  if (start) startAccel = start;
  if (stop) stopAccel = stop;
  registerHotkeys();
  return { start: startAccel, stop: stopAccel };
});

ipcMain.handle('app:info', () => ({ isElectron: true, startAccel, stopAccel }));

app.whenReady().then(() => {
  createWindow();
  registerHotkeys();
  try { buildTray(); } catch (e) { console.error('Tray failed', e); }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => { /* keep alive in tray */ });
