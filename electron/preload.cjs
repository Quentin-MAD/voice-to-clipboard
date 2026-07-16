const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voxElectron', {
  isElectron: true,
  onHotkey: (cb) => {
    const listener = (_e, kind) => cb(kind);
    ipcRenderer.on('hotkey', listener);
    return () => ipcRenderer.removeListener('hotkey', listener);
  },
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  setHotkeys: (start, stop) => ipcRenderer.invoke('hotkeys:set', { start, stop }),
  info: () => ipcRenderer.invoke('app:info'),
});
