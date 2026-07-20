const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voxElectron', {
  isElectron: true,
  onHotkey: (cb) => {
    const listener = (_e, kind) => cb(kind);
    ipcRenderer.on('hotkey', listener);
    return () => ipcRenderer.removeListener('hotkey', listener);
  },
  onHotkeyStatus: (cb) => {
    const listener = (_e, status) => cb(status);
    ipcRenderer.on('hotkey-status', listener);
    return () => ipcRenderer.removeListener('hotkey-status', listener);
  },
  writeClipboard: (text, meta) => ipcRenderer.invoke('clipboard:write', { text, meta }),
  setHotkeys: (toggle, read) => ipcRenderer.invoke('hotkeys:set', { toggle, read }),
  getHotkey: () => ipcRenderer.invoke('hotkeys:get'),
  setRecordingState: (isRecording) => ipcRenderer.invoke('recording:state', isRecording),
  setOverlayStatus: (status) => ipcRenderer.invoke('overlay:status', status),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  showWindow: () => ipcRenderer.invoke('window:show'),
  info: () => ipcRenderer.invoke('app:info'),
  getAutoStart: () => ipcRenderer.invoke('autostart:get'),
  setAutoStart: (enabled) => ipcRenderer.invoke('autostart:set', !!enabled),
  signOut: () => ipcRenderer.invoke('session:signout'),
  openLogs: () => ipcRenderer.invoke('logs:open'),
  getLogPaths: () => ipcRenderer.invoke('logs:paths'),
  tailLogs: (maxBytes) => ipcRenderer.invoke('logs:tail', maxBytes),
  writeLog: (level, message, extra) => ipcRenderer.invoke('logs:write', { level, message, extra }),
  captureScreen: () => ipcRenderer.invoke('screenshot:capture'),
  getAutoType: () => ipcRenderer.invoke('autotype:get-config'),
  setAutoType: (cfg) => ipcRenderer.invoke('autotype:set-config', cfg),
  setAutoTypePending: (text, meta) => ipcRenderer.invoke('autotype:set-pending', { text, meta }),
  clearAutoTypePending: () => ipcRenderer.invoke('autotype:clear'),
  onAutoTypeCleared: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('autotype:cleared', listener);
    return () => ipcRenderer.removeListener('autotype:cleared', listener);
  },
});
