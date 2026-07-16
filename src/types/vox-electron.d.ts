export {};

declare global {
  interface VoxElectronAPI {
    isElectron: true;
    onHotkey: (cb: (kind: "start" | "stop") => void) => () => void;
    writeClipboard: (text: string) => Promise<boolean>;
    setHotkeys: (start: string, stop: string) => Promise<{ start: string; stop: string }>;
    info: () => Promise<{ isElectron: true; startAccel: string; stopAccel: string }>;
  }
  interface Window {
    voxElectron?: VoxElectronAPI;
  }
}
