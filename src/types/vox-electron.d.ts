export {};

declare global {
  interface VoxHotkeyStatus {
    accel: string;
    ok: boolean;
  }
  interface VoxElectronAPI {
    isElectron: true;
    onHotkey: (cb: (kind: "toggle" | "start" | "stop") => void) => () => void;
    onHotkeyStatus: (cb: (status: VoxHotkeyStatus) => void) => () => void;
    writeClipboard: (text: string) => Promise<boolean>;
    setHotkeys: (toggle: string) => Promise<{ toggle: string; ok: boolean }>;
    getHotkey: () => Promise<{ toggle: string; ok: boolean }>;
    setRecordingState: (isRecording: boolean) => Promise<boolean>;
    setOverlayStatus: (status: "idle" | "recording" | "processing" | "copied" | "error") => Promise<boolean>;
    hideWindow: () => Promise<boolean>;
    info: () => Promise<{ isElectron: true; toggleAccel: string; hotkeyOk: boolean }>;
  }
  interface Window {
    voxElectron?: VoxElectronAPI;
  }
}
