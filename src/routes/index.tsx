import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { encodeWav } from "@/lib/wav-encoder";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getUserStatus } from "@/lib/user-status.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VoxTranslate — Real-time voice translator" },
      {
        name: "description",
        content:
          "Push-to-talk voice translator. Record with a hotkey, get the translation copied to your clipboard instantly.",
      },
      { property: "og:title", content: "VoxTranslate — Real-time voice translator" },
      {
        property: "og:description",
        content:
          "Push-to-talk voice translator. Record with a hotkey, get the translation copied to your clipboard instantly.",
      },
    ],
  }),
  component: Home,
});

type Status = "idle" | "recording" | "processing" | "copied" | "error";

const LANGUAGES = [
  { code: "fr", label: "French 🇫🇷" },
  { code: "en", label: "English 🇬🇧" },
  { code: "es", label: "Spanish 🇪🇸" },
  { code: "de", label: "German 🇩🇪" },
  { code: "it", label: "Italian 🇮🇹" },
  { code: "ru", label: "Russian 🇷🇺" },
  { code: "ja", label: "Japanese 🇯🇵" },
  { code: "zh", label: "Chinese 🇨🇳" },
];

type HistoryItem = {
  id: string;
  transcript: string;
  translation: string;
  source: string;
  target: string;
  at: number;
};

const STORAGE_KEY = "voxtranslate:settings:v2";

type PersistedSettings = {
  source: string;
  target: string;
  toggleKey: string;
};

function loadSettings(): PersistedSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedSettings;
    // Migrate old v1 settings
    const oldRaw = localStorage.getItem("voxtranslate:settings:v1");
    if (oldRaw) {
      const old = JSON.parse(oldRaw) as { source?: string; target?: string; startKey?: string };
      return {
        source: old.source ?? "auto",
        target: old.target ?? "en",
        toggleKey: old.startKey ?? "F8",
      };
    }
    return null;
  } catch {
    return null;
  }
}

function Home() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [source, setSource] = useState<string>("auto");
  const [target, setTarget] = useState<string>("en");
  const [toggleKey, setToggleKey] = useState<string>("F8");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [current, setCurrent] = useState<{ transcript: string; translation: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const isMobile = useIsMobile();

  const statusQuery = useQuery({
    queryKey: ["user-status", user?.id],
    queryFn: () => getUserStatus(),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const userStatus = statusQuery.data;

  // Recording refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const recordingRef = useRef(false);
  const recordStartRef = useRef(0);

  // Load settings after hydration
  useEffect(() => {
    setHydrated(true);
    const s = loadSettings();
    if (s) {
      setSource(s.source ?? "auto");
      setTarget(s.target ?? "en");
      setToggleKey(s.toggleKey ?? "F8");
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ source, target, toggleKey }));
  }, [source, target, toggleKey, hydrated]);


  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;

    const duration = Date.now() - recordStartRef.current;
    processorRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const ctx = audioCtxRef.current;
    const sampleRate = ctx?.sampleRate ?? 48000;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    processorRef.current = null;
    sourceNodeRef.current = null;
    streamRef.current = null;
    if (ctx) await ctx.close().catch(() => {});
    audioCtxRef.current = null;

    if (duration < 300 || chunks.length === 0) {
      setStatus("error");
      setErrorMsg("Recording too short");
      setTimeout(() => setStatus("idle"), 1500);
      return;
    }

    setStatus("processing");
    try {
      const wav = encodeWav(chunks, sampleRate, 16000);
      const form = new FormData();
      form.append("audio", wav, "recording.wav");
      form.append("targetLang", target);
      if (source !== "auto") form.append("sourceLang", source);

      const res = await fetch("/api/translate-audio", { method: "POST", body: form });
      const json = (await res.json()) as { transcript?: string; translation?: string; error?: string };
      if (!res.ok || !json.translation) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }

      // Write to clipboard — prefer Electron API (works without focus, even from a game)
      try {
        if (typeof window !== "undefined" && window.voxElectron) {
          await window.voxElectron.writeClipboard(json.translation);
        } else {
          await navigator.clipboard.writeText(json.translation);
        }
      } catch {
        // ignore — user may need to click first
      }

      const item: HistoryItem = {
        id: crypto.randomUUID(),
        transcript: json.transcript ?? "",
        translation: json.translation,
        source,
        target,
        at: Date.now(),
      };
      setCurrent({ transcript: item.transcript, translation: item.translation });
      setHistory((h) => [item, ...h].slice(0, 20));
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 1800);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Translation failed");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [source, target]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current) return;
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      processor.onaudioprocess = (e) => {
        if (!recordingRef.current) return;
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      src.connect(processor);
      processor.connect(ctx.destination);

      audioCtxRef.current = ctx;
      streamRef.current = stream;
      sourceNodeRef.current = src;
      processorRef.current = processor;
      recordingRef.current = true;
      recordStartRef.current = Date.now();
      setStatus("recording");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Microphone access denied");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (recordingRef.current) void stopRecording();
    else void startRecording();
  }, [startRecording, stopRecording]);

  // Keyboard hotkey (browser)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Hotkey capture mode
      if (capturing) {
        e.preventDefault();
        const key = normalizeKey(e);
        if (key) {
          setToggleKey(key);
          setCapturing(false);
        }
        return;
      }

      // Ignore if typing in an input
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      const key = normalizeKey(e);
      if (!key) return;

      if (key === toggleKey) {
        e.preventDefault();
        toggleRecording();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleKey, capturing, toggleRecording]);

  // Electron global hotkey (fires even when a game has focus)
  useEffect(() => {
    if (typeof window === "undefined" || !window.voxElectron) return;
    setIsElectron(true);
    void window.voxElectron.setHotkeys(toggleKey);
    const off = window.voxElectron.onHotkey((kind) => {
      if (kind === "toggle" || kind === "start" || kind === "stop") toggleRecording();
    });
    return off;
  }, [toggleKey, toggleRecording]);


  const swap = () => {
    if (source === "auto") return;
    const s = source;
    setSource(target);
    setTarget(s);
  };

  const copyAgain = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 1200);
    } catch {
      // ignore
    }
  };

  const statusBadge = useMemo(() => {
    switch (status) {
      case "idle":
        return { label: "Idle", color: "bg-muted text-muted-foreground" };
      case "recording":
        return { label: "🎙 Recording…", color: "bg-red-500/15 text-red-500 animate-pulse" };
      case "processing":
        return { label: "⏳ Translating…", color: "bg-amber-500/15 text-amber-500" };
      case "copied":
        return { label: "✅ Copied to clipboard", color: "bg-emerald-500/15 text-emerald-500" };
      case "error":
        return { label: `⚠ ${errorMsg || "Error"}`, color: "bg-red-500/15 text-red-500" };
    }
  }, [status, errorMsg]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">VoxTranslate</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Push-to-talk voice translator. Record → transcribe → translate → clipboard.
            </p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="shrink-0 rounded-lg border border-border bg-card p-2 text-sm hover:bg-accent"
            aria-label="Settings"
            title="Settings"
          >
            ⚙️ Settings
          </button>
        </header>

        {/* Status + single toggle record button */}
        <div className="mb-6 flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-6">
          <div className={`rounded-full px-3 py-1 text-sm font-medium ${statusBadge.color}`}>
            {statusBadge.label}
          </div>
          <button
            onClick={toggleRecording}
            disabled={status === "processing"}
            className={`grid h-40 w-40 shrink-0 place-items-center rounded-full text-lg font-semibold text-primary-foreground shadow-lg transition active:scale-95 disabled:opacity-60 ${
              recordingRef.current || status === "recording"
                ? "animate-pulse bg-red-500"
                : "bg-primary hover:bg-primary/90"
            }`}
            aria-label={status === "recording" ? "Stop recording" : "Start recording"}
          >
            <span className="flex flex-col items-center gap-1">
              <span className="text-4xl">{status === "recording" ? "⏹" : "🎙"}</span>
              <span className="text-sm">
                {status === "recording" ? "Click to stop" : "Click to record"}
              </span>
            </span>
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Click once to start, click again to stop — or press{" "}
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{toggleKey}</kbd>
            {isElectron ? " (global — works from a game)" : ""}. Translation is copied to your clipboard.
          </p>
        </div>

        {/* Language selectors */}
        <div className="mb-6 grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-muted-foreground">From</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="auto">Auto-detect</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={swap}
              disabled={source === "auto"}
              title="Swap languages"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-40"
            >
              ⇄
            </button>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-muted-foreground">To</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>


        {/* Desktop app download — shown on all devices so you can grab the file from phone too */}
        {!isElectron && (
          <div className="mb-6 rounded-xl border border-primary/40 bg-primary/5 p-4">
            <h2 className="mb-1 text-sm font-semibold">🎮 Desktop app (Windows) — global hotkey</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Standalone Windows app. Runs in the system tray, registers your hotkey globally so recording
              works while you're in a fullscreen game, and copies the translation to your clipboard
              automatically. Unzip and launch <code className="rounded bg-muted px-1">VoxTranslate.exe</code>.
              {isMobile && " You can download the ZIP now and transfer it to your PC later."}
            </p>
            <a
              href="/__l5e/assets-v1/f493e3ab-bcd2-4b27-96fd-875e69f0a807/VoxTranslate-win32-x64.zip"
              download="VoxTranslate-win32-x64.zip"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              ⬇ Download VoxTranslate for Windows (.zip, 173 MB)
            </a>
          </div>
        )}


        {/* Current result */}
        {current && (
          <div className="mb-6 rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Latest translation</h2>
            <div className="mb-2">
              <div className="text-xs uppercase text-muted-foreground">Heard</div>
              <div className="text-sm">{current.transcript}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Translation (in clipboard)</div>
              <div className="text-base font-medium">{current.translation}</div>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">History</h2>
            <ul className="divide-y divide-border">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-3 py-3">
                  <div className="flex-1">
                    <div className="text-xs uppercase text-muted-foreground">
                      {h.source} → {h.target}
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-1">{h.transcript}</div>
                    <div className="text-sm font-medium">{h.translation}</div>
                  </div>
                  <button
                    onClick={() => void copyAgain(h.translation)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                  >
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Settings modal */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            setSettingsOpen(false);
            setCapturing(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Settings</h2>
              <button
                onClick={() => {
                  setSettingsOpen(false);
                  setCapturing(false);
                }}
                className="rounded p-1 text-muted-foreground hover:bg-accent"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">Record toggle hotkey</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCapturing(true)}
                  className={`flex-1 rounded-md border border-input px-3 py-2 text-sm font-mono ${
                    capturing ? "bg-amber-500/20 text-amber-600" : "bg-background hover:bg-accent"
                  }`}
                >
                  {capturing ? "Press any key…" : toggleKey}
                </button>
                <button
                  onClick={() => {
                    setToggleKey("F8");
                    setCapturing(false);
                  }}
                  className="rounded-md border border-input bg-background px-3 py-2 text-xs hover:bg-accent"
                  title="Reset to default (F8)"
                >
                  Reset
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Press once to start recording, press again to stop.{" "}
                {isElectron
                  ? "This hotkey is registered globally and works even while a fullscreen game has focus."
                  : "In the browser, the hotkey only fires when this tab has focus. Download the desktop app for global hotkeys."}
              </p>
            </div>

            <button
              onClick={() => {
                setSettingsOpen(false);
                setCapturing(false);
              }}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}




function normalizeKey(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  const k = e.key;
  if (k === "Control" || k === "Alt" || k === "Shift" || k === "Meta") return null;
  const keyLabel = k.length === 1 ? k.toUpperCase() : k;
  parts.push(keyLabel);
  return parts.join("+");
}
