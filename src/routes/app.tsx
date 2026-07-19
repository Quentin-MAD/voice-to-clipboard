import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HardDrive, Settings, LogOut, Wallet, Mic } from "lucide-react";
import { GoogleTranslate } from "@/components/GoogleTranslate";
import { useQuery } from "@tanstack/react-query";
import { encodeWav } from "@/lib/wav-encoder";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Footer } from "@/components/Footer";
import { playProcessingLoop, playSuccessChime } from "@/lib/sounds";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "TalKing®, v0.9.7" },
      {
        name: "description",
        content:
          "Traducteur vocal push-to-talk. Enregistrez avec un raccourci et la traduction est copiée dans votre presse-papiers instantanément.",
      },
      { property: "og:title", content: "TalKing - Traducteur vocal en temps réel" },
      {
        property: "og:description",
        content:
          "Traducteur vocal push-to-talk. Enregistrez avec un raccourci et la traduction est copiée dans votre presse-papiers instantanément.",
      },
    ],
  }),
  component: AppGate,
});

function AppGate() {
  const [checked, setChecked] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  useEffect(() => {
    setIsElectron(typeof window !== "undefined" && !!window.voxElectron?.isElectron);
    setChecked(true);
  }, []);
  if (!checked) return null;
  if (!isElectron) return <BrowserBlocked />;
  return <Home />;
}

function BrowserBlocked() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
        <HardDrive className="h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold"><span className="notranslate">TalKing</span> s'utilise uniquement via l'application</h1>
        <p className="text-sm text-muted-foreground">
          Pour des raisons techniques (raccourcis clavier globaux et presse-papiers en arrière-plan),
          <span className="notranslate">TalKing</span> ne fonctionne pas dans un navigateur. Téléchargez l'application Windows pour l'utiliser.
        </p>
        <a
          href="/__l5e/assets-v1/056b9cc2-836a-424b-844c-1c44cb369b46/TalKing-Setup-0.9.7.exe"
          download="TalKing-Setup-0.9.7.exe"
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
        >
          <HardDrive className="h-5 w-5" />
          Télécharger pour Windows
        </a>
        <Link to="/" className="text-xs text-muted-foreground hover:underline">
          ← Retour à l'accueil
        </Link>
      </div>
      <Footer />
    </div>
  );
}


type Status = "idle" | "recording" | "processing" | "copied" | "error";

const LANGUAGES = [
  { code: "fr", label: "Français 🇫🇷" },
  { code: "en", label: "Anglais 🇬🇧" },
  { code: "es", label: "Espagnol 🇪🇸" },
  { code: "de", label: "Allemand 🇩🇪" },
  { code: "it", label: "Italien 🇮🇹" },
  { code: "ru", label: "Russe 🇷🇺" },
  { code: "ja", label: "Japonais 🇯🇵" },
  { code: "zh", label: "Chinois 🇨🇳" },
  { code: "pt", label: "Portugais (BR) 🇧🇷" },
  { code: "ko", label: "Coréen 🇰🇷" },
  { code: "tr", label: "Turc 🇹🇷" },
  { code: "pl", label: "Polonais 🇵🇱" },
  { code: "nl", label: "Néerlandais 🇳🇱" },
  { code: "ar", label: "Arabe 🇸🇦" },
  { code: "id", label: "Indonésien 🇮🇩" },
  { code: "vi", label: "Vietnamien 🇻🇳" },
  { code: "th", label: "Thaï 🇹🇭" },
  { code: "sv", label: "Suédois 🇸🇪" },
  { code: "uk", label: "Ukrainien 🇺🇦" },
];

type HistoryItem = {
  id: string;
  transcript: string;
  translation: string;
  source: string;
  target: string;
  at: number;
};

type UserStatus = {
  subscribed: boolean;
  free_remaining: number;
  purchased_balance: number;
  hourly_used: number;
  hourly_limit: number;
  daily_used: number;
  daily_limit: number;
  daily_reset_at: string | null;
  voice_balance: number;
  voice_daily_used: number;
  voice_daily_limit: number;
  voice_daily_reset_at: string | null;
};

const STORAGE_KEY = "voxtranslate:settings:v3";

type PersistedSettings = {
  source: string;
  target: string;
  toggleKey: string;
  readKey: string;
  readLang?: string;
  micDeviceId?: string;
};

function loadSettings(): PersistedSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedSettings;
    // Migrate v2
    const v2 = localStorage.getItem("voxtranslate:settings:v2");
    if (v2) {
      const old = JSON.parse(v2) as { source?: string; target?: string; toggleKey?: string };
      return {
        source: old.source ?? "auto",
        target: old.target ?? "en",
        toggleKey: old.toggleKey ?? "F8",
        readKey: "F9",
        readLang: "fr",
      };
    }
    // Migrate v1
    const oldRaw = localStorage.getItem("voxtranslate:settings:v1");
    if (oldRaw) {
      const old = JSON.parse(oldRaw) as { source?: string; target?: string; startKey?: string };
      return {
        source: old.source ?? "auto",
        target: old.target ?? "en",
        toggleKey: old.startKey ?? "F8",
        readKey: "F9",
        readLang: "fr",
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
  const [readKey, setReadKey] = useState<string>("F9");
  const [readLang, setReadLang] = useState<string>("fr");
  const [micDeviceId, setMicDeviceId] = useState<string>("");
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [current, setCurrent] = useState<{ transcript: string; translation: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [capturing, setCapturing] = useState<"toggle" | "read" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [hotkeyBlocked, setHotkeyBlocked] = useState(false);
  const [autoStart, setAutoStartState] = useState<boolean>(false);
  const [readResult, setReadResult] = useState<{ pseudo?: string; original?: string; translation?: string } | null>(null);
  const isMobile = useIsMobile();


  const statusQuery = useQuery({
    queryKey: ["user-status", user?.id],
    queryFn: async (): Promise<UserStatus> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/user-status", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Unable to load status (${res.status})`);
      return (await res.json()) as UserStatus;
    },
    enabled: !!user,
    refetchInterval: 30_000,
    retry: 1,
  });
  const userStatus = statusQuery.data;

  // Access blocking
  const dailyLimitReached = !!userStatus && userStatus.daily_used >= userStatus.daily_limit;
  const noCreditsLeft =
    !!userStatus && !userStatus.subscribed && userStatus.free_remaining <= 0 && userStatus.purchased_balance <= 0;
  const accessBlocked = dailyLimitReached || noCreditsLeft;

  // Live countdown for daily reset
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!dailyLimitReached || !userStatus?.daily_reset_at) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [dailyLimitReached, userStatus?.daily_reset_at]);
  const resetCountdown = useMemo(() => {
    if (!userStatus?.daily_reset_at) return null;
    const diff = new Date(userStatus.daily_reset_at).getTime() - now;
    if (diff <= 0) return "moins d'une minute";
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
    if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
    return `${s}s`;
  }, [userStatus?.daily_reset_at, now]);

  // Auto-refetch status once countdown hits zero
  useEffect(() => {
    if (!dailyLimitReached || !userStatus?.daily_reset_at) return;
    const diff = new Date(userStatus.daily_reset_at).getTime() - Date.now();
    if (diff <= 0) return;
    const id = setTimeout(() => statusQuery.refetch(), diff + 500);
    return () => clearTimeout(id);
  }, [dailyLimitReached, userStatus?.daily_reset_at, statusQuery]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const recordingRef = useRef(false);
  const recordStartRef = useRef(0);
  const stopProcessingSoundRef = useRef<(() => void) | null>(null);

  // Load settings after hydration
  useEffect(() => {
    setHydrated(true);
    const s = loadSettings();
    if (s) {
      setSource(s.source ?? "auto");
      setTarget(s.target ?? "en");
      setToggleKey(s.toggleKey ?? "F8");
      setReadKey(s.readKey ?? "F9");
      setReadLang(s.readLang ?? "fr");
      setMicDeviceId(s.micDeviceId ?? "");
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ source, target, toggleKey, readKey, readLang, micDeviceId }));
  }, [source, target, toggleKey, readKey, readLang, micDeviceId, hydrated]);

  // Enumerate microphones
  const refreshMicDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      let devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      // If labels are empty, we need permission first
      if (mics.length > 0 && mics.every((d) => !d.label)) {
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
          tmp.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
        } catch {
          /* ignore */
        }
      }
      setMicDevices(devices.filter((d) => d.kind === "audioinput"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshMicDevices();
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const handler = () => void refreshMicDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", handler);
  }, [refreshMicDevices]);



  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    if (typeof window !== "undefined" && window.voxElectron?.setRecordingState) {
      void window.voxElectron.setRecordingState(false);
    }


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
      setErrorMsg("Enregistrement trop court");
      setTimeout(() => setStatus("idle"), 1500);
      return;
    }

    setStatus("processing");
    stopProcessingSoundRef.current?.();
    stopProcessingSoundRef.current = playProcessingLoop();
    try {
      const wav = encodeWav(chunks, sampleRate, 16000);
      const form = new FormData();
      form.append("audio", wav, "recording.wav");
      form.append("targetLang", target);
      if (source !== "auto") form.append("sourceLang", source);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setStatus("error");
        setErrorMsg("Vous devez être connecté");
        toast.error("Vous devez être connecté pour traduire");
        navigate({ to: "/auth" });
        return;
      }

      const res = await fetch("/api/translate-audio", {
        method: "POST",
        body: form,
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        transcript?: string;
        translation?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok || !json.translation) {
        // Refetch status so the UI reflects new usage/limits
        statusQuery.refetch();
        if (json.code === "daily_limit" || json.code === "hourly_limit") {
          toast.error(
            `🛑 Limite quotidienne atteinte (150 traductions/24h). Vous pourrez recommencer bientôt.`,
            { duration: 7000 },
          );
        } else if (json.code === "no_credits") {
          toast.error("Plus de crédits disponibles. Consultez les tarifs pour continuer.", {
            duration: 7000,
            action: {
              label: "Voir les plans",
              onClick: () => window.open("https://talking-translator.com/pricing", "_blank", "noopener"),
            },
          });
        } else if (json.code === "unauthorized") {
          toast.error("Session expirée");
          navigate({ to: "/auth" });
        } else if (json.code === "ai_credits_exhausted") {
          toast.error("Service temporairement indisponible. Réessayez dans quelques minutes.", { duration: 6000 });
        } else if (json.code === "ai_rate_limited") {
          toast.error("Service surchargé, réessayez dans quelques instants.", { duration: 5000 });
        }

        throw new Error(json.error ?? `Request failed (${res.status})`);
      }

      // Write to clipboard - prefer Electron API (works without focus, even from a game)
      let windowHidden = false;
      try {
        if (typeof window !== "undefined" && window.voxElectron) {
          const targetLangName = LANGUAGES.find((l) => l.code === target)?.label ?? target;
          const result = await window.voxElectron.writeClipboard(json.translation, {
            targetLangName,
            preview: json.translation,
          });
          windowHidden = !!(result && typeof result === "object" && result.windowHidden);
        } else {
          await navigator.clipboard.writeText(json.translation);
        }
      } catch {
        // ignore - user may need to click first
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
      setHistory([item]);
      stopProcessingSoundRef.current?.();
      stopProcessingSoundRef.current = null;
      // Small delay so the chime doesn't overlap with processing-loop teardown.
      setTimeout(() => playSuccessChime(), 40);
      setStatus("copied");
      statusQuery.refetch();
      setTimeout(() => setStatus("idle"), 1800);
    } catch (err) {
      stopProcessingSoundRef.current?.();
      stopProcessingSoundRef.current = null;
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Échec de la traduction");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [source, target, navigate, statusQuery]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current) return;
    if (dailyLimitReached) {
      toast.error(
        `🛑 Limite quotidienne atteinte (150 traductions/24h). Réessayez dans ${resetCountdown ?? "quelques instants"}.`,
        { duration: 6000 },
      );
      return;
    }
    if (noCreditsLeft) {
      toast.error("Plus de crédits disponibles. Consultez les tarifs pour continuer.", {
        duration: 6000,
        action: {
          label: "Voir les plans",
          onClick: () => window.open("https://talking-translator.com/pricing", "_blank", "noopener"),
        },
      });
      return;
    }
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
      if (typeof window !== "undefined" && window.voxElectron?.setRecordingState) {
        void window.voxElectron.setRecordingState(true);
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Accès au microphone refusé");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }, [dailyLimitReached, noCreditsLeft, resetCountdown]);

  const toggleRecording = useCallback(() => {
    if (recordingRef.current) void stopRecording();
    else void startRecording();
  }, [startRecording, stopRecording]);

  // Read-message flow refs / state
  const readAudioCtxRef = useRef<AudioContext | null>(null);
  const readStreamRef = useRef<MediaStream | null>(null);
  const readProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const readSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const readChunksRef = useRef<Float32Array[]>([]);
  const readRecordingRef = useRef(false);
  const readStartRef = useRef(0);
  const [readActive, setReadActive] = useState(false);
  const [readProcessing, setReadProcessing] = useState(false);
  const readAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const stopReadRecording = useCallback(async () => {
    if (!readRecordingRef.current) return;
    readRecordingRef.current = false;
    setReadActive(false);
    if (typeof window !== "undefined" && window.voxElectron?.setRecordingState) {
      void window.voxElectron.setRecordingState(false);
    }
    const duration = Date.now() - readStartRef.current;
    readProcessorRef.current?.disconnect();
    readSourceNodeRef.current?.disconnect();
    readStreamRef.current?.getTracks().forEach((t) => t.stop());
    const ctx = readAudioCtxRef.current;
    const sampleRate = ctx?.sampleRate ?? 48000;
    const chunks = readChunksRef.current;
    readChunksRef.current = [];
    readProcessorRef.current = null;
    readSourceNodeRef.current = null;
    readStreamRef.current = null;
    if (ctx) await ctx.close().catch(() => {});
    readAudioCtxRef.current = null;

    if (duration < 400 || chunks.length === 0) {
      toast.error("Enregistrement trop court");
      return;
    }
    if (typeof window === "undefined" || !window.voxElectron?.captureScreen) {
      toast.error("Fonction disponible uniquement dans l'application Windows");
      return;
    }

    setReadProcessing(true);
    stopProcessingSoundRef.current?.();
    stopProcessingSoundRef.current = playProcessingLoop();
    try {
      // 1. Capture screenshot NOW (after speaking, chat is still visible)
      const shot = await window.voxElectron.captureScreen();
      if (!shot?.ok || !shot.dataBase64) {
        throw new Error(shot?.error ?? "Capture d'écran impossible");
      }
      const screenshotBlob = await (await fetch(`data:${shot.mime ?? "image/png"};base64,${shot.dataBase64}`)).blob();

      // 2. Encode audio to WAV
      const wav = encodeWav(chunks, sampleRate, 16000);

      const form = new FormData();
      form.append("audio", wav, "recording.wav");
      form.append("audioFormat", "wav");
      form.append("screenshot", screenshotBlob, "screen.png");
      form.append("targetLang", readLang);


      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("Vous devez être connecté");
        navigate({ to: "/auth" });
        return;
      }

      const res = await fetch("/api/read-message", {
        method: "POST",
        body: form,
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        pseudo?: string;
        original?: string;
        translation?: string;
        audio?: string;
        audioFormat?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok || !json.translation || !json.audio) {
        statusQuery.refetch();
        if (json.code === "daily_limit") {
          toast.error("🛑 Limite quotidienne atteinte (150 / 24h).", { duration: 6000 });
        } else if (json.code === "voice_daily_limit") {
          toast.error(json.error ?? "🔊 Limite quotidienne de lectures vocales atteinte.", {
            duration: 7000,
            action: {
              label: "Voir les plans",
              onClick: () => window.open("https://talking-translator.com/pricing", "_blank", "noopener"),
            },
          });
        } else if (json.code === "no_voice_credits" || json.code === "no_credits") {
          toast.error(json.error ?? "Vous n'avez plus de crédits vocaux.", {
            duration: 7000,
            action: {
              label: "Acheter des crédits Vocale",
              onClick: () => window.open("https://talking-translator.com/pricing", "_blank", "noopener"),
            },
          });
        } else if (json.code === "not_found") {
          toast.error(json.error ?? "Message introuvable.", { duration: 5000 });
        } else if (json.code === "unauthorized") {
          toast.error("Session expirée");
          navigate({ to: "/auth" });
        } else {
          toast.error(json.error ?? "Échec de la lecture");
        }
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }

      // 3. Play the returned audio (MP3)
      setReadResult({ pseudo: json.pseudo, original: json.original, translation: json.translation });
      const audioUrl = `data:audio/${json.audioFormat ?? "mp3"};base64,${json.audio}`;
      try { readAudioPlayerRef.current?.pause(); } catch { /* ignore */ }
      const audio = new Audio(audioUrl);
      audio.volume = 1;
      readAudioPlayerRef.current = audio;
      stopProcessingSoundRef.current?.();
      stopProcessingSoundRef.current = null;
      setTimeout(() => playSuccessChime(), 30);
      await audio.play().catch(() => {
        toast.info("Cliquez dans la fenêtre pour autoriser la lecture audio.");
      });
      statusQuery.refetch();
    } catch (err) {
      stopProcessingSoundRef.current?.();
      stopProcessingSoundRef.current = null;
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      console.error("read-message flow failed:", msg);
    } finally {
      setReadProcessing(false);
    }
  }, [target, navigate, statusQuery]);

  const startReadRecording = useCallback(async () => {
    if (readRecordingRef.current || recordingRef.current) return;
    if (typeof window === "undefined" || !window.voxElectron?.captureScreen) {
      toast.error("Fonction disponible uniquement dans l'application Windows.");
      return;
    }
    if (dailyLimitReached) {
      toast.error("🛑 Limite quotidienne atteinte.");
      return;
    }
    // Read-message needs 1 voice credit (subscribers exempt from credit cost)
    if (!userStatus?.subscribed) {
      if ((userStatus?.voice_balance ?? 0) < 1) {
        toast.error("Vous n'avez plus de crédits vocaux. Achetez un Pack crédits Vocale (10 pour 2,99 €).", {
          duration: 7000,
          action: {
            label: "Acheter",
            onClick: () => window.open("https://talking-translator.com/pricing", "_blank", "noopener"),
          },
        });
        return;
      }
    }
    // Voice daily cap: 5/jour gratuit, 10/jour avec abonnement (les packs de credits ne touchent pas a cette limite)
    if ((userStatus?.voice_daily_used ?? 0) >= (userStatus?.voice_daily_limit ?? 5)) {
      toast.error(`🔊 Limite quotidienne atteinte (${userStatus?.voice_daily_limit ?? 5} lectures/jour).`, {
        duration: 7000,
        action: {
          label: "Voir les plans",
          onClick: () => window.open("https://talking-translator.com/pricing", "_blank", "noopener"),
        },
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      readChunksRef.current = [];
      processor.onaudioprocess = (e) => {
        if (!readRecordingRef.current) return;
        readChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      src.connect(processor);
      processor.connect(ctx.destination);
      readAudioCtxRef.current = ctx;
      readStreamRef.current = stream;
      readSourceNodeRef.current = src;
      readProcessorRef.current = processor;
      readRecordingRef.current = true;
      readStartRef.current = Date.now();
      setReadActive(true);
      if (typeof window !== "undefined" && window.voxElectron?.setRecordingState) {
        void window.voxElectron.setRecordingState(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Accès au microphone refusé");
    }
  }, [dailyLimitReached, userStatus]);

  const toggleReadRecording = useCallback(() => {
    if (readRecordingRef.current) void stopReadRecording();
    else void startReadRecording();
  }, [startReadRecording, stopReadRecording]);

  // Keyboard hotkey (browser)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Hotkey capture mode
      if (capturing) {
        e.preventDefault();
        const key = normalizeKey(e);
        if (key) {
          if (capturing === "toggle") setToggleKey(key);
          else if (capturing === "read") setReadKey(key);
          setCapturing(null);
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
      } else if (key === readKey) {
        e.preventDefault();
        toggleReadRecording();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleKey, readKey, capturing, toggleRecording, toggleReadRecording]);

  // Electron global hotkey (fires even when a game has focus)
  useEffect(() => {
    if (typeof window === "undefined" || !window.voxElectron) return;
    setIsElectron(true);
    void window.voxElectron.setHotkeys(toggleKey, readKey).then((res) => {
      if (res) setHotkeyBlocked(!res.ok);
    });
    const offHotkey = window.voxElectron.onHotkey((kind) => {
      if (kind === "toggle" || kind === "start" || kind === "stop") toggleRecording();
      else if (kind === "read-toggle") toggleReadRecording();
    });
    const offStatus = window.voxElectron.onHotkeyStatus?.((s) => setHotkeyBlocked(!s.ok));
    return () => { offHotkey(); offStatus?.(); };
  }, [toggleKey, readKey, toggleRecording, toggleReadRecording]);

  // Load current auto-start state from Electron
  useEffect(() => {
    if (typeof window === "undefined" || !window.voxElectron?.getAutoStart) return;
    void window.voxElectron.getAutoStart().then((r) => setAutoStartState(!!r?.enabled));
  }, []);

  // Sync status to Electron overlay (shows over fullscreen games)
  useEffect(() => {
    if (typeof window === "undefined" || !window.voxElectron?.setOverlayStatus) return;
    void window.voxElectron.setOverlayStatus(status);
  }, [status]);




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
        return { label: "Prêt", color: "bg-muted text-muted-foreground" };
      case "recording":
        return { label: "🎙 Enregistrement…", color: "bg-red-500/15 text-red-500 animate-pulse" };
      case "processing":
        return { label: "⏳ Traduction…", color: "bg-amber-500/15 text-amber-500" };
      case "copied":
        return { label: "✅ Copié dans le presse-papiers", color: "bg-emerald-500/15 text-emerald-500" };
      case "error":
        return { label: `⚠ ${errorMsg || "Erreur"}`, color: "bg-red-500/15 text-red-500" };
    }
  }, [status, errorMsg]);

  // Auth guard - redirect to /auth if not signed in
  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  if (authLoading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground text-sm">
        Chargement…
      </div>
    );
  }

  const voiceCount = userStatus?.voice_balance ?? 0;
  const voiceUsed = userStatus?.voice_daily_used ?? 0;
  const voiceCap = userStatus?.voice_daily_limit ?? 5;
  const textUsed = userStatus?.daily_used ?? 0;
  const textCap = userStatus?.daily_limit ?? 150;
  const resetAt = userStatus?.daily_reset_at ?? userStatus?.voice_daily_reset_at ?? null;
  const resetLabel = resetAt
    ? new Date(resetAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "00:00";
  const resetDateLabel = resetAt
    ? new Date(resetAt).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : "";
  const pct = (u: number, c: number) => (c > 0 ? Math.min(100, Math.round((u / c) * 100)) : 0);
  const barClass = (u: number, c: number) => {
    const p = pct(u, c);
    if (p >= 100) return "full";
    if (p >= 80) return "warn";
    return "";
  };
  const resetTooltip = `Les limites journalières se réinitialisent automatiquement à 00h00 (heure de Paris). Prochaine réinitialisation : ${resetDateLabel}.`;

  const limitsPanel = userStatus ? (
    <>
      <div className="limits-stack" title={resetTooltip}>
        <div className="limits-row">
          <span className="limits-row-label">Texte</span>
          <span className="limits-bar"><span className={`limits-bar-fill ${barClass(textUsed, textCap)}`} style={{ width: `${pct(textUsed, textCap)}%` }} /></span>
          <span className="limits-row-count">{textUsed}/{textCap}</span>
        </div>
        <div className="limits-row">
          <span className="limits-row-label">Voix</span>
          <span className="limits-bar"><span className={`limits-bar-fill ${barClass(voiceUsed, voiceCap)}`} style={{ width: `${pct(voiceUsed, voiceCap)}%` }} /></span>
          <span className="limits-row-count">{voiceUsed}/{voiceCap}</span>
        </div>
      </div>
      <span className="limits-sep" />
      <div className="limits-meta" title={resetTooltip}>
        {userStatus.subscribed ? (
          <strong>
            <Wallet size={12} className="limits-icon" /> Illimité · <Mic size={12} className="limits-icon" /> {voiceCount} voix
          </strong>
        ) : (
          <strong>
            <Wallet size={12} className="limits-icon" /> {userStatus.purchased_balance + userStatus.free_remaining} · <Mic size={12} className="limits-icon" /> {voiceCount} voix
          </strong>
        )}
        <span className="limits-reset">Reset {resetLabel}</span>
      </div>
    </>
  ) : (
    <span className="native-credits-text">…</span>
  );



  

  return (
    <div className={`min-h-screen bg-background text-foreground ${isElectron ? "native-app" : ""}`}>
      <div className={isElectron ? "native-window" : ""}>
        <div className={isElectron ? "native-main" : ""}>
          {/* Titlebar (Electron only) */}
          {isElectron && (
            <div className="native-menubar">
              <div className="native-brand-inline">
                <span className="native-title notranslate"><b>TalKing</b><sup className="native-trademark">®</sup></span>
              </div>
              <div className="native-menubar-center">
                <div className="native-credits-pill" title={resetTooltip}>
                  <span className="native-credits-dot" />
                  {limitsPanel}
                </div>

              </div>
              <div className="flex items-center gap-2">
                <div className="native-translate-slot">
                  <GoogleTranslate alwaysShow />
                </div>
                <span className="native-email" title={user.email}>{user.email}</span>
                <button
                  className="native-icon-btn"
                  title="Paramètres"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Paramètres"
                >
                  <Settings size={15} />
                </button>
                <button
                  className="native-icon-btn native-icon-btn-danger"
                  title="Se déconnecter"
                  onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
                  aria-label="Se déconnecter"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          )}


          <div className={isElectron ? "native-scroll" : "mx-auto max-w-3xl px-6 py-10"}>
          {/* Web-only header */}
          {!isElectron && (
            <header className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight notranslate">TalKing</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Traducteur vocal push-to-talk. Enregistrez → transcription → traduction → presse-papiers.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-lg border border-border bg-card p-2 text-sm hover:bg-accent"
                  aria-label="Paramètres"
                  title="Paramètres"
                >
                  ⚙️
                </button>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate({ to: "/auth" });
                  }}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs hover:bg-accent"
                  title="Se déconnecter"
                >
                  Déconnexion
                </button>
              </div>
            </header>
          )}

          {/* Credits + subscription status (web only — Electron shows in statusbar) */}
          {!isElectron && (
            <div className="mb-6 rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col">
                  <div className="text-xs uppercase text-muted-foreground">{user.email}</div>
                  <div className="text-sm font-semibold">
                    {userStatus?.subscribed ? (
                      <>⭐ Abonné illimité</>
                    ) : userStatus ? (
                      <>
                        <span>{userStatus.purchased_balance + userStatus.free_remaining}</span>
                        {" crédits texte · 🔊 "}
                        <span>{voiceCount}</span> vocaux
                      </>
                    ) : "…"}
                  </div>
                </div>
                {!userStatus?.subscribed && (
                  <Link
                    to="/pricing"
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Passer à l'illimité
                  </Link>
                )}
              </div>
              {userStatus && (
                <div className="space-y-2" title={resetTooltip}>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Traductions texte aujourd'hui</span>
                      <span className="tabular-nums">{textUsed} / {textCap}</span>
                    </div>
                    <div className="limits-bar"><span className={`limits-bar-fill ${barClass(textUsed, textCap)}`} style={{ width: `${pct(textUsed, textCap)}%` }} /></div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Lectures vocales (F9) aujourd'hui</span>
                      <span className="tabular-nums">{voiceUsed} / {voiceCap}</span>
                    </div>
                    <div className="limits-bar"><span className={`limits-bar-fill ${barClass(voiceUsed, voiceCap)}`} style={{ width: `${pct(voiceUsed, voiceCap)}%` }} /></div>
                  </div>
                  <div className="pt-1 text-[11px] text-muted-foreground">
                    Réinitialisation automatique toutes les 24h à 00h00 (Paris) · prochaine : <strong className="text-foreground">{resetDateLabel}</strong>
                  </div>
                </div>
              )}
            </div>
          )}


          {/* Blocking banner - daily limit reached */}
          {dailyLimitReached && (
            <div
              className={isElectron ? "native-panel" : "mb-6 rounded-xl border p-4"}
              style={{
                borderColor: "rgba(239,68,68,0.6)",
                background: "rgba(239,68,68,0.1)",
                marginBottom: isElectron ? 12 : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, color: isElectron ? "var(--nx-text)" : undefined, fontSize: 14 }}>
                    🛑 Limite quotidienne atteinte (150 traductions / 24h)
                  </div>
                  <div style={{ fontSize: 12, color: isElectron ? "var(--nx-text-dim)" : undefined, opacity: 0.85, marginTop: 4 }}>
                    Vous avez atteint la limite anti-abus. Toute nouvelle traduction est bloquée.
                    {resetCountdown && (
                      <>
                        {" "}Prochain crédit disponible dans{" "}
                        <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{resetCountdown}</strong>.
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Blocking banner - out of credits */}
          {!dailyLimitReached && noCreditsLeft && (
            <div
              className={isElectron ? "native-panel" : "mb-6 rounded-xl border p-4"}
              style={{
                borderColor: "rgba(245,158,11,0.6)",
                background: "rgba(245,158,11,0.1)",
                marginBottom: isElectron ? 12 : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>💳 Vous n'avez plus de crédits</div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                    Vous avez utilisé vos 20 crédits gratuits du mois et n'avez plus de crédits achetés.
                    Achetez un pack (50 crédits pour 2,99 €) ou passez à l'abonnement illimité (29,99 €/an) pour continuer.
                  </div>
                </div>
                <a
                  href="https://talking-translator.com/pricing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={isElectron ? "" : "rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"}
                  style={
                    isElectron
                      ? {
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 14px",
                          borderRadius: 6,
                          background: "var(--nx-warn, #f59e0b)",
                          color: "#0b0b0b",
                          fontWeight: 600,
                          fontSize: 12,
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }
                      : undefined
                  }
                >
                  Voir les plans →
                </a>
              </div>
            </div>
          )}

          {isElectron && hotkeyBlocked && (
            <div className="native-panel" style={{ borderColor: "rgba(245,158,11,0.5)", background: "rgba(245,158,11,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--nx-text)" }}>⚠ Le raccourci {toggleKey} est déjà utilisé</div>
                  <div style={{ fontSize: 11.5, color: "var(--nx-text-dim)", marginTop: 2 }}>Discord, OBS, Steam ou un jeu l'a peut-être déjà pris.</div>
                </div>
                <button onClick={() => setSettingsOpen(true)}>Changer</button>
              </div>
            </div>
          )}

          {/* Record hero */}
          <div className={isElectron ? "native-panel native-hero" : "mb-6 flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-6"}>
            {isElectron && <div className="native-eyebrow" style={{ marginBottom: 0 }}>Enregistrement</div>}
            <div className={isElectron ? "native-status-pill" : `rounded-full px-3 py-1 text-sm font-medium ${statusBadge.color}`}>
              {statusBadge.label}
            </div>
            {isMobile ? (
              <button
                onClick={toggleRecording}
                disabled={status === "processing" || accessBlocked}
                title={accessBlocked ? (dailyLimitReached ? `Limite quotidienne atteinte (réinit. dans ${resetCountdown ?? "…"})` : "Plus de crédits - voir les plans") : undefined}
                className={`native-record grid h-40 w-40 shrink-0 place-items-center rounded-full text-lg font-semibold text-primary-foreground shadow-lg transition active:scale-95 disabled:opacity-60 ${
                  recordingRef.current || status === "recording"
                    ? "is-recording animate-pulse bg-red-500"
                    : "bg-primary hover:bg-primary/90"
                }`}
                aria-label={status === "recording" ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"}
              >
                <span className="flex flex-col items-center gap-1">
                  <span className="text-4xl">{status === "recording" ? "⏹" : "🎙"}</span>
                  <span className="text-sm">
                    {status === "recording" ? "Toucher pour arrêter" : "Toucher pour enregistrer"}
                  </span>
                </span>
              </button>
            ) : (
              <button
                onClick={toggleRecording}
                disabled={status === "processing" || accessBlocked}
                title={accessBlocked ? (dailyLimitReached ? `Limite quotidienne atteinte (réinit. dans ${resetCountdown ?? "…"})` : "Plus de crédits - voir les plans") : undefined}
                className={`native-record flex min-w-[12rem] items-center justify-center gap-3 rounded-xl px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg transition active:scale-95 disabled:opacity-60 ${
                  recordingRef.current || status === "recording"
                    ? "is-recording animate-pulse bg-red-500"
                    : "bg-primary hover:bg-primary/90"
                }`}
                aria-label={status === "recording" ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"}
              >
                <span className="text-xl">{status === "recording" ? "⏹" : "🎙"}</span>
                <span>{status === "recording" ? "Arrêter l'enregistrement" : "Appuyer pour enregistrer"}</span>
              </button>
            )}
            <p className={isElectron ? "native-hero-hint" : "text-center text-xs text-muted-foreground"}>
              {isMobile ? (
                <>Touchez une fois pour démarrer, touchez à nouveau pour arrêter. La traduction est copiée dans votre presse-papiers.</>
              ) : (
                <>
                  Cliquez une fois pour démarrer, cliquez à nouveau pour arrêter — ou appuyez sur{" "}
                  <kbd>{toggleKey}</kbd>
                  {isElectron ? " (raccourci global, fonctionne depuis un jeu)" : ""}. La traduction est copiée dans votre presse-papiers.
                </>
              )}
            </p>

            {/* Read player message (F9) */}
            <div style={{ width: "100%", borderTop: isElectron ? "1px solid var(--nx-border, rgba(255,255,255,0.08))" : "1px solid hsl(var(--border))", marginTop: 12, paddingTop: 12 }}>
              <button
                onClick={toggleReadRecording}
                disabled={readProcessing || accessBlocked}
                className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition disabled:opacity-60 ${
                  readActive
                    ? "bg-amber-500 text-white animate-pulse"
                    : readProcessing
                    ? "bg-muted text-muted-foreground"
                    : "border border-input bg-background hover:bg-accent"
                }`}
                title={`Lire un message d'un joueur (${readKey}) - 1 crédit vocal`}
              >
                <span className="text-lg">{readActive ? "⏹" : readProcessing ? "⏳" : "🔊"}</span>
                <span>
                  {readActive
                    ? "Parlez... (ré-appuyez pour analyser)"
                    : readProcessing
                    ? "Analyse et lecture..."
                    : `Lire un message de joueur (${readKey}) - 1 crédit vocal`}
                </span>
              </button>
              {readResult && !readActive && !readProcessing && (
                <div className="mt-3 rounded-lg border border-border bg-background/50 p-3 text-xs">
                  {readResult.pseudo && <div className="mb-1 font-semibold text-primary">{readResult.pseudo}</div>}
                  {readResult.original && <div className="text-muted-foreground italic">"{readResult.original}"</div>}
                  {readResult.translation && <div className="mt-1 font-medium">→ {readResult.translation}</div>}
                </div>
              )}
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Appuyez, dites "Lis-moi le message de [pseudo du joueur]" en remplaçant [pseudo du joueur] par le pseudo réel visible dans le chat, ré-appuyez. L'IA analyse votre écran et lit la traduction à voix haute.
              </p>
            </div>
          </div>

          {/* Language selectors */}
          <div className={isElectron ? "native-panel" : "mb-6 grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto_1fr]"}>
            {isElectron && <div className="native-eyebrow">Langues</div>}
            <div className={isElectron ? "grid gap-3 sm:grid-cols-[1fr_auto_1fr] items-end" : "contents"}>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-muted-foreground">Depuis</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="auto">Détection auto</option>
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
                  title="Inverser les langues"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-40"
                >
                  ⇄
                </button>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-muted-foreground">Vers</label>
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
          </div>

          {/* Desktop app download - hidden in Electron */}
          {!isElectron && (
            <div className="mb-6 rounded-xl border border-primary/40 bg-primary/5 p-4">
              <h2 className="mb-1 text-sm font-semibold inline-flex items-center gap-2"><HardDrive className="h-4 w-4" /> Application Windows - raccourci global</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Application Windows autonome. Fonctionne dans la barre des tâches, enregistre votre raccourci
                globalement pour que l'enregistrement marche en jeu plein écran, et copie la traduction
                automatiquement dans le presse-papiers. L'installeur crée des raccourcis Bureau et Menu Démarrer
                et peut lancer <span className="notranslate">TalKing</span> masqué avec Windows.
                {isMobile && " Téléchargez maintenant et transférez sur votre PC plus tard."}
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/__l5e/assets-v1/056b9cc2-836a-424b-844c-1c44cb369b46/TalKing-Setup-0.9.7.exe"
                  download="TalKing-Setup-0.9.7.exe"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  ⬇ Télécharger l'installeur v0.9.7 (.exe, 118 Mo)
                </a>
                <a
                  href="/__l5e/assets-v1/2cc33a27-9552-4f04-b8f2-79ba4b08e1cb/TalKing-win32-x64.zip"
                  download="TalKing-win32-x64.zip"
                  className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
                  title="ZIP portable - pas d'installation, décompresser et lancer"
                >
                  ZIP portable (148 Mo)
                </a>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Windows SmartScreen peut avertir au premier lancement (app non signée). Cliquez sur <em>Informations complémentaires</em> → <em>Exécuter quand même</em>.
              </p>
            </div>
          )}

          {/* Current result */}
          {current && (
            <div className={isElectron ? "native-panel" : "mb-6 rounded-xl border border-border bg-card p-4"}>
              <div className={isElectron ? "native-eyebrow" : "mb-3 text-sm font-semibold"}>Dernière traduction</div>
              <div className="mb-2">
                <div className="text-xs uppercase text-muted-foreground">Entendu</div>
                <div className="text-sm">{current.transcript}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Traduction (dans le presse-papiers)</div>
                <div className="text-base font-medium">{current.translation}</div>
              </div>
            </div>
          )}
          </div>

          {/* Bottom statusbar removed - all info already visible in the header */}
        </div>
      </div>



      {/* Settings modal */}
      {settingsOpen && (
        <div
          className={isElectron ? "native-modal-backdrop" : "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"}
          onClick={() => {
            setSettingsOpen(false);
            setCapturing(null);
          }}
        >
          <div
            className={isElectron ? "native-modal" : "w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"}
            onClick={(e) => e.stopPropagation()}
          >
            {isElectron ? (
              <>
                <div className="native-modal-head">
                  <span className="native-modal-title">Paramètres</span>
                  <button
                    onClick={() => { setSettingsOpen(false); setCapturing(null); }}
                    aria-label="Fermer"
                    style={{ minHeight: 26, padding: "2px 10px" }}
                  >✕</button>
                </div>
                <div className="native-modal-body">
                  <div className="native-field">
                    <span className="native-label">Raccourci d'enregistrement (traduction)</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setCapturing("toggle")}
                        style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", height: 36,
                                 background: capturing === "toggle" ? "rgba(245,158,11,0.15)" : undefined,
                                 borderColor: capturing === "toggle" ? "rgba(245,158,11,0.6)" : undefined,
                                 color: capturing === "toggle" ? "#fbbf24" : undefined }}
                      >
                        {capturing === "toggle" ? "Appuyez sur une touche…" : toggleKey}
                      </button>
                      <button onClick={() => { setToggleKey("F8"); setCapturing(null); }} title="Réinitialiser (F8)">
                        Réinit.
                      </button>
                    </div>
                  </div>

                  <div className="native-field">
                    <span className="native-label">Raccourci "Lire un message" (1 crédit vocal)</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setCapturing("read")}
                        style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", height: 36,
                                 background: capturing === "read" ? "rgba(245,158,11,0.15)" : undefined,
                                 borderColor: capturing === "read" ? "rgba(245,158,11,0.6)" : undefined,
                                 color: capturing === "read" ? "#fbbf24" : undefined }}
                      >
                        {capturing === "read" ? "Appuyez sur une touche…" : readKey}
                      </button>
                      <button onClick={() => { setReadKey("F9"); setCapturing(null); }} title="Réinitialiser (F9)">
                        Réinit.
                      </button>
                    </div>
                    <p className="native-field-help">
                      Appuyez, dites "Lis-moi le message de [pseudo]", ré-appuyez. L'IA capture votre écran, trouve le message et le lit à voix haute traduit dans la langue choisie ci-dessous.
                    </p>
                  </div>

                  <div className="native-field">
                    <span className="native-label">Langue de réponse (lecture vocale)</span>
                    <select
                      value={readLang}
                      onChange={(e) => setReadLang(e.target.value)}
                      style={{ width: "100%", height: 36, background: "#1a1a1a", color: "#eee", border: "1px solid #333", borderRadius: 6, padding: "0 8px" }}
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                    <p className="native-field-help">Langue dans laquelle l'IA vous lira le message traduit.</p>
                  </div>


                  <div className="native-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="native-row-title">Lancer <span className="notranslate">TalKing</span> au démarrage de Windows</div>
                      <div className="native-row-desc">Démarre masqué dans la barre des tâches pour que votre raccourci fonctionne immédiatement, même avant d'ouvrir quoi que ce soit.</div>
                    </div>
                    <input
                      type="checkbox"
                      className="native-switch"
                      checked={autoStart}
                      onChange={async (e) => {
                        const next = e.target.checked;
                        setAutoStartState(next);
                        const r = await window.voxElectron?.setAutoStart?.(next);
                        if (r) setAutoStartState(!!r.enabled);
                      }}
                    />
                  </div>
                </div>
                <div className="native-modal-foot">
                  <button onClick={() => { setSettingsOpen(false); setCapturing(null); }} className="native-btn-primary">
                    Terminé
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Paramètres</h2>
                  <button
                    onClick={() => { setSettingsOpen(false); setCapturing(null); }}
                    className="rounded p-1 text-muted-foreground hover:bg-accent"
                    aria-label="Fermer"
                  >✕</button>
                </div>
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium">Raccourci d'enregistrement (traduction)</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCapturing("toggle")}
                      className={`flex-1 rounded-md border border-input px-3 py-2 text-sm font-mono ${
                        capturing === "toggle" ? "bg-amber-500/20 text-amber-600" : "bg-background hover:bg-accent"
                      }`}
                    >
                      {capturing === "toggle" ? "Appuyez sur une touche…" : toggleKey}
                    </button>
                    <button
                      onClick={() => { setToggleKey("F8"); setCapturing(null); }}
                      className="rounded-md border border-input bg-background px-3 py-2 text-xs hover:bg-accent"
                    >Réinit.</button>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium">Raccourci "Lire un message" (1 crédit vocal)</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCapturing("read")}
                      className={`flex-1 rounded-md border border-input px-3 py-2 text-sm font-mono ${
                        capturing === "read" ? "bg-amber-500/20 text-amber-600" : "bg-background hover:bg-accent"
                      }`}
                    >
                      {capturing === "read" ? "Appuyez sur une touche…" : readKey}
                    </button>
                    <button
                      onClick={() => { setReadKey("F9"); setCapturing(null); }}
                      className="rounded-md border border-input bg-background px-3 py-2 text-xs hover:bg-accent"
                    >Réinit.</button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Disponible uniquement dans l'app Windows (capture d'écran requise).
                  </p>
                </div>
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium">Langue de réponse (lecture vocale)</label>
                  <select
                    value={readLang}
                    onChange={(e) => setReadLang(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-muted-foreground">Langue dans laquelle l'IA vous lira le message traduit.</p>
                </div>

                <button
                  onClick={() => { setSettingsOpen(false); setCapturing(null); }}
                  className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Terminé
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <Footer />
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
