import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeWav } from "@/lib/wav-encoder";
import { useIsMobile } from "@/hooks/use-mobile";

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

const STORAGE_KEY = "voxtranslate:settings:v1";

function loadSettings() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { source: string; target: string; startKey: string; stopKey: string }) : null;
  } catch {
    return null;
  }
}

function Home() {
  const [source, setSource] = useState<string>("auto");
  const [target, setTarget] = useState<string>("en");
  const [startKey, setStartKey] = useState<string>("F8");
  const [stopKey, setStopKey] = useState<string>("F9");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [current, setCurrent] = useState<{ transcript: string; translation: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [capturing, setCapturing] = useState<null | "start" | "stop">(null);
  const [hydrated, setHydrated] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const isMobile = useIsMobile();

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
      setStartKey(s.startKey ?? "F8");
      setStopKey(s.stopKey ?? "F9");
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ source, target, startKey, stopKey }));
  }, [source, target, startKey, stopKey, hydrated]);

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

  // Keyboard hotkeys
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Hotkey capture mode
      if (capturing) {
        e.preventDefault();
        const key = normalizeKey(e);
        if (key) {
          if (capturing === "start") setStartKey(key);
          else setStopKey(key);
          setCapturing(null);
        }
        return;
      }

      // Ignore if typing in an input
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      const key = normalizeKey(e);
      if (!key) return;

      if (key === startKey && !recordingRef.current) {
        e.preventDefault();
        void startRecording();
      } else if (key === stopKey && recordingRef.current) {
        e.preventDefault();
        void stopRecording();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startKey, stopKey, capturing, startRecording, stopRecording]);

  // Electron global hotkeys (F8/F9 fire even when a game has focus)
  useEffect(() => {
    if (typeof window === "undefined" || !window.voxElectron) return;
    setIsElectron(true);
    void window.voxElectron.setHotkeys(startKey, stopKey);
    const off = window.voxElectron.onHotkey((kind) => {
      if (kind === "start" && !recordingRef.current) void startRecording();
      else if (kind === "stop" && recordingRef.current) void stopRecording();
    });
    return off;
  }, [startKey, stopKey, startRecording, stopRecording]);

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
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">VoxTranslate</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Push-to-talk voice translator. Record → transcribe → translate → clipboard.
          </p>
        </header>

        {/* Status + record control */}
        {isMobile ? (
          <div className="mb-6 flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-6">
            <div className={`rounded-full px-3 py-1 text-sm font-medium ${statusBadge.color}`}>
              {statusBadge.label}
            </div>
            <button
              onClick={() => {
                if (recordingRef.current) void stopRecording();
                else void startRecording();
              }}
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
                  {status === "recording" ? "Tap to stop" : "Tap to record"}
                </span>
              </span>
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Tap once to start, tap again to stop. The translation is copied to your clipboard.
            </p>
          </div>
        ) : (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-border bg-card p-4">
            <div className={`rounded-full px-3 py-1 text-sm font-medium ${statusBadge.color}`}>
              {statusBadge.label}
            </div>
            <button
              onMouseDown={() => void startRecording()}
              onMouseUp={() => void stopRecording()}
              onMouseLeave={() => recordingRef.current && void stopRecording()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-95"
            >
              Hold to record
            </button>
          </div>
        )}

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

        {/* Hotkeys — desktop only */}
        {!isMobile && (
          <div className="mb-6 rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Hotkeys</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <HotkeyRow
                label="Start recording"
                value={startKey}
                capturing={capturing === "start"}
                onCapture={() => setCapturing("start")}
              />
              <HotkeyRow
                label="Stop recording"
                value={stopKey}
                capturing={capturing === "stop"}
                onCapture={() => setCapturing("stop")}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {isElectron
                ? "✅ Desktop app detected — F8/F9 are registered as GLOBAL hotkeys and work even while a fullscreen game has focus."
                : "In the browser, hotkeys only fire when this tab has focus. Download the desktop app below for global hotkeys that work while playing."}
            </p>
          </div>

          {!isElectron && (
            <div className="mb-6 rounded-xl border border-primary/40 bg-primary/5 p-4">
              <h2 className="mb-1 text-sm font-semibold">🎮 Desktop app (Windows) — global hotkeys</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Standalone Windows app. Runs in the system tray, registers F8/F9 globally so recording
                works while you're in a fullscreen game, and copies the translation to your clipboard
                automatically. Unzip and launch <code className="rounded bg-muted px-1">VoxTranslate.exe</code>.
              </p>
              <a
                href="/downloads/VoxTranslate-win32-x64.zip"
                download
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                ⬇ Download VoxTranslate for Windows (.zip)
              </a>
            </div>
          )}
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
    </div>
  );
}

function HotkeyRow({
  label,
  value,
  capturing,
  onCapture,
}: {
  label: string;
  value: string;
  capturing: boolean;
  onCapture: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2">
      <span className="text-sm">{label}</span>
      <button
        onClick={onCapture}
        className={`min-w-[80px] rounded px-3 py-1 text-xs font-mono ${
          capturing ? "bg-amber-500/20 text-amber-600" : "bg-muted"
        }`}
      >
        {capturing ? "Press a key…" : value}
      </button>
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
