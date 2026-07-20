export {};

declare global {
  interface VoxHotkeyStatus {
    accel: string;
    ok: boolean;
    readAccel?: string;
    readOk?: boolean;
  }
  interface VoxScreenshotResult {
    ok: boolean;
    dataBase64?: string;
    mime?: string;
    error?: string;
  }
  interface VoxAutoTypeConfig {
    enabled: boolean;
    accel: string;
    ok?: boolean;
    hasPending?: boolean;
  }
  interface VoxElectronAPI {
    isElectron: true;
    onHotkey: (cb: (kind: "toggle" | "start" | "stop" | "read-toggle" | "auto-type") => void) => () => void;
    onHotkeyStatus: (cb: (status: VoxHotkeyStatus) => void) => () => void;
    writeClipboard: (
      text: string,
      meta?: { targetLangName?: string; preview?: string }
    ) => Promise<{ ok: boolean; windowHidden: boolean }>;
    setHotkeys: (toggle: string, read?: string) => Promise<{ toggle: string; ok: boolean; read?: string; readOk?: boolean }>;
    getHotkey: () => Promise<{ toggle: string; ok: boolean; read?: string; readOk?: boolean }>;
    setRecordingState: (isRecording: boolean) => Promise<boolean>;
    setOverlayStatus: (status: "idle" | "recording" | "processing" | "copied" | "error") => Promise<boolean>;
    hideWindow: () => Promise<boolean>;
    showWindow: () => Promise<boolean>;
    info: () => Promise<{ isElectron: true; toggleAccel: string; hotkeyOk: boolean; readAccel?: string; readHotkeyOk?: boolean; version: string }>;
    getAutoStart: () => Promise<{ enabled: boolean }>;
    setAutoStart: (enabled: boolean) => Promise<{ enabled: boolean }>;
    captureScreen: () => Promise<VoxScreenshotResult>;
    getAutoType: () => Promise<VoxAutoTypeConfig>;
    setAutoType: (cfg: { enabled?: boolean; accel?: string }) => Promise<VoxAutoTypeConfig>;
    setAutoTypePending: (text: string, meta?: { targetLangName?: string }) => Promise<{ ok: boolean }>;
    clearAutoTypePending: () => Promise<{ ok: boolean }>;
    onAutoTypeCleared: (cb: () => void) => () => void;
  }
  interface Window {
    voxElectron?: VoxElectronAPI;
  }
}
