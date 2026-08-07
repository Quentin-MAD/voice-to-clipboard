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
  session,
  desktopCapturer,
  shell,
  dialog,
  net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const logger = require('./logger.cjs');
const lowLevelHotkeys = require('./hotkeys.cjs');
const autotype = require('./autotype.cjs');

// -------- Session persistence (step 9) --------
// Electron persists localStorage / cookies / IndexedDB in the userData
// directory by default, which is exactly what the Supabase JS client uses to
// keep the user signed in across restarts. We keep the DEFAULT partition on
// mainWindow so upgrading users don't get logged out, and we never call
// session.clearStorageData() automatically - only the user-triggered
// "Sign out" tray action / IPC clears it.

const APP_URL = process.env.TALKING_URL || 'https://voice-to-clipboard.lovable.app/app';
const UPDATE_MANIFEST_URL = process.env.TALKING_UPDATE_URL || 'https://talking-translator.com/talking-version.json';
const TRAY_ICON_PATH = path.join(__dirname, 'tray-icon.png');
const WINDOW_ICON_PATH = process.platform === 'win32'
  ? path.join(__dirname, 'tray-icon.ico')
  : TRAY_ICON_PATH;
const START_HIDDEN = process.argv.includes('--hidden');
const CURRENT_VERSION = app.getVersion();

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let toggleAccel = 'F8';
let readAccel = 'F9';
let autoTypeAccel = 'Backspace';
let autoTypeEnabled = false;
let autoTypeHotkeyOk = false;
let pendingAutoTypeText = '';
let pendingAutoTypeMeta = null;
let autoTypeInProgress = false;
let hotkeyOk = true;
let lowLevelWarned = false;
let readHotkeyOk = true;
let isRecording = false;
let powerBlockerId = null;

// -------- Persistent settings (userData/settings.json) --------
let SETTINGS_PATH = null;
let autoTypeMigratedV2 = false;
function loadSettings() {
  try {
    SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      if (raw && typeof raw.toggleAccel === 'string') toggleAccel = raw.toggleAccel;
      if (raw && typeof raw.readAccel === 'string') readAccel = raw.readAccel;
      if (raw && typeof raw.autoTypeAccel === 'string') autoTypeAccel = raw.autoTypeAccel;
      if (raw && typeof raw.autoTypeEnabled === 'boolean') autoTypeEnabled = raw.autoTypeEnabled;
      // A translation waiting to be written must survive an app restart: it is
      // only consumed once actually typed (auto-type key) or pasted (Ctrl+V).
      if (raw && typeof raw.pendingAutoTypeText === 'string') pendingAutoTypeText = raw.pendingAutoTypeText;
      if (raw && raw.pendingAutoTypeMeta && typeof raw.pendingAutoTypeMeta === 'object') pendingAutoTypeMeta = raw.pendingAutoTypeMeta;
      autoTypeMigratedV2 = !!(raw && raw.autoTypeMigratedV2);
      // One-time migration: earlier builds shipped F10 as the default auto-type
      // key. New default is Backspace. Reset it once so existing installs pick
      // up the new default without wiping user-chosen non-F10 values.
      if (!autoTypeMigratedV2 && autoTypeAccel === 'F10') {
        autoTypeAccel = 'Backspace';
      }
      autoTypeMigratedV2 = true;
    } else {
      autoTypeMigratedV2 = true;
    }
  } catch (e) { console.error('loadSettings failed', e); }
}
function saveSettings() {
  try {
    if (!SETTINGS_PATH) return;
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({
      toggleAccel, readAccel, autoTypeAccel, autoTypeEnabled, autoTypeMigratedV2,
      pendingAutoTypeText, pendingAutoTypeMeta,
    }, null, 2));
  } catch (e) { console.error('saveSettings failed', e); }
}

// Central place to change the waiting translation: keeps disk, hotkey arming
// and the renderer in sync. The text stays in memory until it is really
// written (auto-type key) or pasted (Ctrl+V).
function setPendingAutoType(text, meta) {
  pendingAutoTypeText = String(text ?? '');
  pendingAutoTypeMeta = pendingAutoTypeText ? (meta || null) : null;
  saveSettings();
  registerHotkeys();
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('autotype:pending', { hasPending: !!pendingAutoTypeText }); } catch {}
    if (!pendingAutoTypeText) {
      try { mainWindow.webContents.send('autotype:cleared'); } catch {}
    }
  }
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
// Windows: use a fresh branded identity so the taskbar cannot reuse the icon
// cached for the legacy purple-microphone builds.
if (process.platform === 'win32') { try { app.setAppUserModelId('com.talking.desktop.frameless.v3'); } catch {} }

function createWindow() {
  const WINDOW_TITLE = `v${CURRENT_VERSION}`;
  mainWindow = new BrowserWindow({
    width: 980, height: 720, minWidth: 820, minHeight: 560, title: WINDOW_TITLE, icon: WINDOW_ICON_PATH,
    backgroundColor: '#1e1f22', show: false, autoHideMenuBar: true,
    // Fully frameless on Windows: guarantees that no native caption icon or
    // duplicate native title can be rendered. The renderer supplies the drag
    // strip and window controls; the packaged icon remains used by Windows.
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  // Prevent the renderer's <title> from overriding our custom window title
  mainWindow.on('page-title-updated', (e) => { e.preventDefault(); });
  mainWindow.setTitle(WINDOW_TITLE);
  mainWindow.loadURL(APP_URL);

  // Keep window sizing tied to the actual route instead of relying only on a
  // renderer bridge call. This also covers in-app links, redirects and reloads.
  let restoreBoundsAfterPricing = null;
  const syncWindowToRoute = (rawUrl) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    let isPricing = false;
    try { isPricing = new URL(rawUrl).pathname === '/pricing'; } catch {}
    if (isPricing) {
      if (!restoreBoundsAfterPricing) restoreBoundsAfterPricing = mainWindow.getBounds();
      if (!mainWindow.isMaximized()) mainWindow.maximize();
      return;
    }
    if (restoreBoundsAfterPricing) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      mainWindow.setBounds(restoreBoundsAfterPricing);
      restoreBoundsAfterPricing = null;
    }
  };
  mainWindow.webContents.on('did-navigate', (_event, url) => syncWindowToRoute(url));
  mainWindow.webContents.on('did-navigate-in-page', (_event, url) => syncWindowToRoute(url));

  // Tout lien externe s'ouvre dans le navigateur du système, jamais dans l'app.
  const appOrigin = (() => { try { return new URL(APP_URL).origin; } catch { return null; } })();
  const isInternal = (url) => {
    try { return !!appOrigin && new URL(url).origin === appOrigin; } catch { return false; }
  };
  // Les fenêtres OAuth (Google / broker Lovable) doivent rester DANS l'app :
  // ouvertes dans le navigateur système, la session ne revient jamais au logiciel.
  const isOAuthUrl = (url) => {
    try {
      const u = new URL(url);
      return (
        u.pathname.startsWith('/~oauth') ||
        /(^|\.)oauth\.lovable\.app$/i.test(u.hostname) ||
        /(^|\.)accounts\.google\.com$/i.test(u.hostname) ||
        /(^|\.)accounts\.youtube\.com$/i.test(u.hostname) ||
        /(^|\.)supabase\.co$/i.test(u.hostname) ||
        /(^|\.)appleid\.apple\.com$/i.test(u.hostname)
      );
    } catch { return false; }
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isOAuthUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520, height: 680, autoHideMenuBar: true, minimizable: false,
          parent: mainWindow, modal: false, backgroundColor: '#0A0A29',
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    if (/^https?:/i.test(url)) { try { shell.openExternal(url); } catch {} }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (isOAuthUrl(url)) return; // flux de connexion : on reste dans l'app
    if (!isInternal(url) && /^https?:/i.test(url)) {
      e.preventDefault();
      try { shell.openExternal(url); } catch {}
    }
  });


  // Avoid the white flash: only show the window once the renderer has content ready.
  mainWindow.once('ready-to-show', () => {
    mainWindow.setTitle(WINDOW_TITLE);
    if (!START_HIDDEN) mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) { e.preventDefault(); mainWindow.hide(); notifyOnce(); }
  });
  mainWindow.on('minimize', (e) => { e.preventDefault(); mainWindow.hide(); notifyOnce(); });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle(WINDOW_TITLE);
    mainWindow.webContents.send('hotkey-status', { accel: toggleAccel, ok: hotkeyOk });
  });
  logger.attachRenderer(mainWindow.webContents);
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
  // Prefer the low-level keyboard hook (uiohook-napi): works in DirectInput /
  // exclusive-fullscreen games (Star Citizen, Valorant, LoL, Fortnite, Apex,
  // CS2...) where Electron's globalShortcut (RegisterHotKey) is silently
  // swallowed by the game. Same technique used by Discord/OBS push-to-talk.
  const useLowLevel = lowLevelHotkeys.isAvailable();
  try { globalShortcut.unregisterAll(); } catch {}
  lowLevelHotkeys.unregisterAll();

  hotkeyOk = false;
  readHotkeyOk = false;
  autoTypeHotkeyOk = false;

  const bind = (accel, kind, customCb, allowGlobalShortcut = true) => {
    const cb = customCb || (() => { if (mainWindow) mainWindow.webContents.send('hotkey', kind); });
    if (useLowLevel) {
      const ok = lowLevelHotkeys.register(accel, cb);
      if (ok) return true;
    }
    // Never register ordinary typing keys such as Backspace through Electron's
    // globalShortcut API. RegisterHotKey consumes them at Windows level, which
    // prevents their normal use in browsers, Discord and every other app.
    if (!allowGlobalShortcut) return false;
    // Fallback to Electron globalShortcut if the low-level hook is unavailable
    // (module load failure) or the accelerator can't be parsed by uiohook.
    try { return !!globalShortcut.register(accel, cb); } catch { return false; }
  };

  try { hotkeyOk = bind(toggleAccel, 'toggle'); } catch (e) { console.error('Failed to register toggle hotkey', e); }
  if (!hotkeyOk) {
    notify({
      title: 'TalKing — hotkey conflict',
      body: `${toggleAccel} is already used by another app. Click to open TalKing and pick another key.`,
      urgent: true,
    });
  }
  try {
    if (readAccel && readAccel !== toggleAccel) {
      readHotkeyOk = bind(readAccel, 'read-toggle');
    }
  } catch (e) { console.error('Failed to register read hotkey', e); }

  // Auto-type hotkey: only registered when the "my game blocks paste" option is
  // ON *and* a translation is actually waiting. Otherwise the key (Backspace by
  // default) would stay captured system-wide and break normal typing elsewhere.
  try {
    if (autoTypeEnabled && !autoTypeInProgress && !!pendingAutoTypeText && autoTypeAccel && autoTypeAccel !== toggleAccel && autoTypeAccel !== readAccel) {
      // The low-level observer detects this key without swallowing it. There is
      // intentionally no globalShortcut fallback because that would disable
      // Backspace system-wide for as long as a translation remains pending.
      autoTypeHotkeyOk = bind(autoTypeAccel, 'auto-type', fireAutoType, false);
    }
  } catch (e) { console.error('Failed to register auto-type hotkey', e); }

  // Passive Ctrl+V observer: when the user pastes the translation manually, the
  // message has been delivered, so the pending translation is consumed too.
  try {
    if (!autoTypeInProgress && !!pendingAutoTypeText) {
      bind('Ctrl+V', 'auto-type-pasted', () => {
        if (!pendingAutoTypeText || autoTypeInProgress) return;
        console.log('[autotype] pending cleared by Ctrl+V');
        setPendingAutoType('', null);
      }, false);
    }
  } catch (e) { console.error('Failed to register paste observer', e); }




  console.log(`[hotkeys] backend=${useLowLevel ? 'uIOhook (low-level)' : 'globalShortcut'} toggle=${toggleAccel}(${hotkeyOk}) read=${readAccel}(${readHotkeyOk}) autotype=${autoTypeEnabled ? autoTypeAccel + '(' + autoTypeHotkeyOk + ')' : 'off'}`);
  if (!useLowLevel) {
    console.error('[hotkeys] LOW-LEVEL HOOK UNAVAILABLE - hotkeys will NOT work inside games.', lowLevelHotkeys.getLoadError() || '');
    if (!lowLevelWarned) {
      lowLevelWarned = true;
      notify({
        title: 'TalKing - raccourcis limités',
        body: "Le hook clavier bas niveau n'a pas pu démarrer : les raccourcis risquent de ne pas fonctionner en jeu. Réinstallez la dernière version de TalKing.",
        urgent: true,
      });
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hotkey-status', { accel: toggleAccel, ok: hotkeyOk, readAccel, readOk: readHotkeyOk, autoTypeAccel, autoTypeOk: autoTypeHotkeyOk, autoTypeEnabled, backend: lowLevelHotkeys.getBackend() });
  }
  rebuildTrayMenu();
}

// Fire from the global hotkey: if a translation is pending, type it into the focused window.
async function fireAutoType() {
  if (autoTypeInProgress) return;
  if (mainWindow) {
    try { mainWindow.webContents.send('autotype:typing'); } catch {}
  }
  const text = pendingAutoTypeText;
  if (!text) {
    notify({
      title: 'TalKing — auto-écriture',
      body: `Aucune traduction en attente. Enregistrez d'abord avec ${toggleAccel}.`,
      silent: false,
    });
    return;
  }
  // Always keep a clipboard copy as a safety net. This does not paste anything
  // and therefore remains compatible with games that block Ctrl+V.
  try { clipboard.writeText(text); } catch {}
  const meta = pendingAutoTypeMeta;
  autoTypeInProgress = true;
  // Release the trigger registration while SendInput is running. This avoids
  // recursively firing auto-type if the translated text contains that key.
  registerHotkeys();

  try {
    const res = await autotype.typeText(text);
    if (res.ok) {
      autoTypeInProgress = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        try { mainWindow.webContents.send('hotkey', 'auto-type'); } catch {}
      }
      setPendingAutoType('', null);
      console.log('[autotype] completed', { chars: text.length });

    } else {
      console.error('[autotype] SendInput failed', res.error || 'unknown');
      notify({
        title: 'TalKing — auto-écriture',
        body: `Échec de l'écriture (${res.error || 'inconnu'}). La traduction reste prête : réessayez ou utilisez Ctrl+V.`,
        urgent: true,
      });
      try { clipboard.writeText(text); } catch {}
    }
  } catch (e) {
    console.error('autotype failed', e);
    try { clipboard.writeText(text); } catch {}
  } finally {
    autoTypeInProgress = false;
    registerHotkeys();
  }
}

function rebuildTrayMenu() {
  if (!tray) return;
  const updateLabel = latestUpdate
    ? `Installer la mise à jour v${latestUpdate.version}`
    : 'Check for updates…';
  const menu = Menu.buildFromTemplate([
    { label: `TalKing v${CURRENT_VERSION} - ${isRecording ? '🔴 recording' : hotkeyOk ? 'idle' : '⚠ hotkey blocked'}`, enabled: false },
    { type: 'separator' },
    { label: 'Show window', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: 'Hide window', click: () => { if (mainWindow) mainWindow.hide(); } },
    { label: `Toggle recording (${toggleAccel})`, click: () => mainWindow && mainWindow.webContents.send('hotkey', 'toggle') },
    { type: 'separator' },
    { label: updateLabel, click: () => {
        if (latestUpdate && latestUpdate.url) installUpdate(latestUpdate);
        else checkForUpdates({ silent: false });
      } },
    { type: 'separator' },
    { label: 'Sign out (clear saved session)', click: () => signOutAndReload({ confirm: true }) },
    { label: 'Open logs folder', click: () => { const p = logger.getPaths(); if (p.logDir) shell.openPath(p.logDir); } },
    { type: 'separator' },
    { label: 'Quit TalKing', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`TalKing - ${isRecording ? 'recording...' : hotkeyOk ? `press ${toggleAccel}` : `${toggleAccel} conflict - change in Settings`}`);
}

function buildTray() {
  let icon = nativeImage.createFromPath(TRAY_ICON_PATH);
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

async function downloadUpdate(manifest) {
  const updateDir = path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(updateDir, { recursive: true });
  const destination = path.join(updateDir, `TalKing-Update-${manifest.version}.exe`);
  try { fs.rmSync(destination, { force: true }); } catch {}
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url: manifest.url, redirect: 'follow' });
    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const output = fs.createWriteStream(destination);
      response.on('data', (chunk) => output.write(chunk));
      response.on('end', () => output.end(() => resolve(destination)));
      response.on('error', (error) => { output.destroy(); reject(error); });
      output.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

async function installUpdate(manifest) {
  if (!manifest || !manifest.url || process.platform !== 'win32') return;
  const progress = new BrowserWindow({
    width: 430, height: 150, resizable: false, minimizable: false,
    maximizable: false, title: 'Mise à jour TalKing', parent: mainWindow || undefined,
    modal: !!mainWindow, autoHideMenuBar: true, backgroundColor: '#0A0A29',
  });
  progress.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html><body style="margin:0;background:#0A0A29;color:#fff;font:15px Segoe UI,Arial,sans-serif;display:grid;place-items:center;height:100vh;text-align:center"><div><b>Mise à jour v${manifest.version}</b><p style="color:#DBDBDF">Téléchargement en cours... TalKing redémarrera automatiquement.</p></div></body></html>`));
  try {
    const installerPath = await downloadUpdate(manifest);
    app.isQuiting = true;
    const child = spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    app.quit();
  } catch (error) {
    if (!progress.isDestroyed()) progress.close();
    await dialog.showMessageBox({
      type: 'error', title: 'Mise à jour TalKing',
      message: 'La mise à jour n’a pas pu être installée.',
      detail: String(error && error.message || error),
    });
  }
}

async function checkForUpdates({ silent = true } = {}) {
  const manifest = await fetchUpdateManifest();
  if (!manifest || !manifest.version) {
    if (!silent) dialog.showMessageBox({ type: 'info', title: 'TalKing', message: 'Update check failed.', detail: 'Could not reach the update server. Try again later.' });
    return;
  }
  // Toute version différente du manifeste est proposée (permet aussi de repartir
  // sur une numérotation plus basse, ex. retour à la v1.0.1).
  if (String(manifest.version) !== String(CURRENT_VERSION)) {
    latestUpdate = manifest;
    rebuildTrayMenu();
    const res = await dialog.showMessageBox({
      type: 'info',
      title: 'TalKing update available',
      message: `Une nouvelle version est disponible : v${manifest.version}`,
      detail: (manifest.notes || '') + `\n\nVous \u00EAtes en v${CURRENT_VERSION}. Le t\u00E9l\u00Echargement va s'ouvrir dans votre navigateur.`,
      buttons: ['Mettre à jour', 'Plus tard'],
      defaultId: 0, cancelId: 1,
    });
    if (res.response !== 0 || !manifest.url) return;
    await installUpdate(manifest);
  } else if (!silent) {
    dialog.showMessageBox({ type: 'info', title: 'TalKing', message: `Vous \u00EAtes \u00E0 jour (v${CURRENT_VERSION}).` });
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
      title, body, icon: TRAY_ICON_PATH, silent,
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
ipcMain.handle('window:minimize', () => { if (mainWindow) mainWindow.minimize(); return true; });
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
// Agrandit (ou restaure) la fenetre : utilise par la page Tarifs pour l'afficher en grand.
ipcMain.handle('window:set-maximized', (_e, on) => {
  if (!mainWindow) return false;
  if (on) { if (!mainWindow.isMaximized()) mainWindow.maximize(); }
  else if (mainWindow.isMaximized()) mainWindow.unmaximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:close', () => { if (mainWindow) mainWindow.close(); return true; });

ipcMain.handle('hotkeys:set', (_e, payload) => {
  const toggle = payload && (payload.toggle || payload.start);
  const read = payload && payload.read;
  if (toggle && typeof toggle === 'string') {
    toggleAccel = toggle;
  }
  if (read && typeof read === 'string') {
    readAccel = read;
  }
  saveSettings();
  registerHotkeys();
  return { toggle: toggleAccel, ok: hotkeyOk, read: readAccel, readOk: readHotkeyOk };
});

ipcMain.handle('hotkeys:get', () => ({ toggle: toggleAccel, ok: hotkeyOk, read: readAccel, readOk: readHotkeyOk }));

// -------- Auto-type IPC (F8 sans presse-papiers) --------
ipcMain.handle('autotype:get-config', () => ({
  enabled: autoTypeEnabled,
  accel: autoTypeAccel,
  ok: autoTypeHotkeyOk,
  hasPending: !!pendingAutoTypeText,
}));

ipcMain.handle('autotype:set-config', (_e, payload) => {
  if (payload && typeof payload.enabled === 'boolean') autoTypeEnabled = payload.enabled;
  if (payload && typeof payload.accel === 'string' && payload.accel.trim()) autoTypeAccel = payload.accel.trim();
  // The waiting translation is intentionally kept even when auto-write is
  // turned off: it stays available in the clipboard until it is used.
  saveSettings();
  registerHotkeys();
  return { enabled: autoTypeEnabled, accel: autoTypeAccel, ok: autoTypeHotkeyOk, hasPending: !!pendingAutoTypeText };
});

ipcMain.handle('autotype:set-pending', (_e, payload) => {
  const text = payload && typeof payload === 'object' ? payload.text : payload;
  const meta = (payload && typeof payload === 'object' && payload.meta) ? payload.meta : null;
  // Preserve every successful translation in the clipboard too, even when
  // auto-write is selected. The keyboard injector remains the primary action.
  if (text) {
    try { clipboard.writeText(String(text)); } catch {}
  }
  // Arm (or release) the auto-type key only while a translation is pending,
  // and persist it so it survives an app restart.
  setPendingAutoType(text, meta);
  if (pendingAutoTypeText) {
    const langName = pendingAutoTypeMeta && pendingAutoTypeMeta.targetLangName ? pendingAutoTypeMeta.targetLangName : '';
    const preview = pendingAutoTypeText.replace(/\s+/g, ' ').trim().slice(0, 140);
    notify({
      title: langName ? `Traduction prête · ${langName}` : 'Traduction prête',
      body: `Cliquez dans le chat du jeu puis appuyez sur ${autoTypeAccel}. ${preview ? '\n' + preview : ''}`.trim(),
      silent: false,
    });
    if (!autoTypeHotkeyOk) {
      notify({
        title: 'TalKing - auto-écriture indisponible',
        body: `La touche ${autoTypeAccel} n'a pas pu être activée. La traduction reste disponible dans le presse-papiers.`,
        urgent: true,
      });
    }
  }
  return { ok: true };
});

ipcMain.handle('autotype:clear', () => {
  setPendingAutoType('', null);
  return { ok: true };
});





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
ipcMain.handle('shell:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) { try { shell.openExternal(url); } catch {} }
  return true;
});
ipcMain.handle('app:info', () => ({ isElectron: true, toggleAccel, hotkeyOk, readAccel, readHotkeyOk, hotkeyBackend: lowLevelHotkeys.getBackend(), hotkeyLoadError: lowLevelHotkeys.getLoadError() || null, version: CURRENT_VERSION, userDataPath: app.getPath('userData') }));

// -------- Screenshot capture for "Read message" feature --------
ipcMain.handle('screenshot:capture', async () => {
  // Hide our own window first so the screenshot captures the game/app behind,
  // not TalKing itself. Restore visibility after (without stealing focus).
  const wasVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
  try {
    if (wasVisible) {
      try { mainWindow.hide(); } catch { /* noop */ }
      // Give the OS compositor a moment to repaint the window behind us.
      await new Promise((r) => setTimeout(r, 180));
    }
    // Multi-monitor: capture EVERY display, not just the primary one. The game
    // chat the user is asking about is often on a secondary screen.
    const displays = screen.getAllDisplays();
    const maxW = displays.reduce(
      (m, d) => Math.max(m, Math.round((d.size.width || 1920) * (d.scaleFactor || 1))),
      1920,
    );
    const maxH = displays.reduce(
      (m, d) => Math.max(m, Math.round((d.size.height || 1080) * (d.scaleFactor || 1))),
      1080,
    );
    // Capture at native resolution, then downscale + JPEG-encode before upload.
    // Chat text stays readable at 1600px wide, but the payload goes from several
    // MB (PNG) to ~200-400 KB, which removes most of the F9 upload latency.
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxW, height: maxH },
    });
    if (!sources || sources.length === 0) return { ok: false, error: 'no-source' };

    // Cap the number of uploaded screens so a 4-monitor rig doesn't blow up
    // latency or cost. 3 screens covers virtually every setup.
    const MAX_SCREENS = 3;
    const MAX_W = 1600;
    const shots = [];
    for (const src of sources.slice(0, MAX_SCREENS)) {
      try {
        let image = src.thumbnail;
        if (!image || image.isEmpty()) continue;
        const size = image.getSize();
        if (size.width > MAX_W) image = image.resize({ width: MAX_W, quality: 'good' });
        const jpeg = image.toJPEG(80);
        if (jpeg && jpeg.length > 1024) {
          shots.push({ dataBase64: jpeg.toString('base64'), mime: 'image/jpeg' });
        }
      } catch { /* skip an unreadable display */ }
    }
    if (shots.length === 0) return { ok: false, error: 'no-source' };
    // `dataBase64` / `mime` stay for backward compatibility with older renderers.
    return { ok: true, dataBase64: shots[0].dataBase64, mime: shots[0].mime, shots };
  } catch (e) {
    console.error('screenshot:capture failed', e);
    return { ok: false, error: String(e && e.message || e) };
  } finally {
    if (wasVisible && mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.showInactive(); } catch { try { mainWindow.show(); } catch { /* noop */ } }
    }
  }
});


// -------- Session sign-out (step 9) --------
async function signOutAndReload({ confirm = false } = {}) {
  if (confirm) {
    const res = await dialog.showMessageBox({
      type: 'question', title: 'Sign out of TalKing',
      message: 'Sign out and clear the saved session on this computer?',
      detail: 'You will need to log in again next time you open TalKing. Your hotkey and auto-start settings are kept.',
      buttons: ['Sign out', 'Cancel'], defaultId: 0, cancelId: 1,
    });
    if (res.response !== 0) return { ok: false, canceled: true };
  }
  try {
    await session.defaultSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
    });
    await session.defaultSession.clearCache();
  } catch (e) { console.error('clearStorageData failed', e); }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.reloadIgnoringCache();
  }
  return { ok: true };
}
ipcMain.handle('session:signout', () => signOutAndReload({ confirm: false }));
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

// -------- Logs (step 10) --------
ipcMain.handle('logs:paths', () => logger.getPaths());
ipcMain.handle('logs:open', () => { const p = logger.getPaths(); if (p.logDir) shell.openPath(p.logDir); return p; });
ipcMain.handle('logs:tail', (_e, maxBytes) => {
  try {
    const { logFile } = logger.getPaths();
    if (!logFile || !fs.existsSync(logFile)) return '';
    const size = fs.statSync(logFile).size;
    const cap = Math.min(Number(maxBytes) || 64 * 1024, 512 * 1024);
    const start = Math.max(0, size - cap);
    const fd = fs.openSync(logFile, 'r');
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch (e) { return `read error: ${e && e.message}`; }
});
ipcMain.handle('logs:write', (_e, payload) => {
  const level = (payload && payload.level) || 'INFO';
  const msg = (payload && payload.message) || '';
  const extra = payload && payload.extra;
  if (level === 'ERROR') logger.error('[renderer]', msg, extra || '');
  else if (level === 'WARN') logger.warn('[renderer]', msg, extra || '');
  else logger.log('[renderer]', msg, extra || '');
  return true;
});

app.whenReady().then(() => {
  logger.init(app.getPath('userData'));
  console.log('[TalKing] userData (persistent session):', app.getPath('userData'));
  loadSettings();
  saveSettings();
  createWindow();
  try { createOverlay(); } catch (e) { console.error('Overlay failed', e); }
  try { buildTray(); } catch (e) { console.error('Tray failed', e); }
  registerHotkeys();
  // Check for updates 8s after startup, then every 6h
  setTimeout(() => checkForUpdates({ silent: true }), 8000);
  setInterval(() => checkForUpdates({ silent: true }), 6 * 60 * 60 * 1000);
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch {}
  try { lowLevelHotkeys.unregisterAll(); lowLevelHotkeys.stop(); } catch {}
  if (powerBlockerId !== null) { try { powerSaveBlocker.stop(powerBlockerId); } catch {} powerBlockerId = null; }
});
app.on('window-all-closed', () => { /* keep alive in tray */ });
