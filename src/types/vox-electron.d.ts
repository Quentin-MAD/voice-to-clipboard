export {};

declare global {
  interface VoxElectronAPI {
    isElectron: true;
    onHotkey: (cb: (kind: "toggle" | "start" | "stop") => void) => () => void;
    writeClipboard: (text: string) => Promise<boolean>;
    setHotkeys: (toggle: string) => Promise<{ toggle: string }>;
    setRecordingState: (isRecording: boolean) => Promise<boolean>;
    info: () => Promise<{ isElectron: true; toggleAccel: string }>;
  }
  interface Window {
    voxElectron?: VoxElectronAPI;
  }
}
