const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voxElectron', {
  isElectron: true,
  onHotkey: (cb) => {
    const listener = (_e, kind) => cb(kind);
    ipcRenderer.on('hotkey', listener);
    return () => ipcRenderer.removeListener('hotkey', listener);
  },
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  setHotkeys: (toggle) => ipcRenderer.invoke('hotkeys:set', { toggle }),
  setRecordingState: (isRecording) => ipcRenderer.invoke('recording:state', isRecording),
  info: () => ipcRenderer.invoke('app:info'),
});
