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
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  setHotkeys: (toggle) => ipcRenderer.invoke('hotkeys:set', { toggle }),
  getHotkey: () => ipcRenderer.invoke('hotkeys:get'),
  setRecordingState: (isRecording) => ipcRenderer.invoke('recording:state', isRecording),
  setOverlayStatus: (status) => ipcRenderer.invoke('overlay:status', status),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  info: () => ipcRenderer.invoke('app:info'),
});
