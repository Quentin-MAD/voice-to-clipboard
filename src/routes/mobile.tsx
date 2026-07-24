import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Loader2, Volume2, LogOut, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useMobileRecorder } from "@/hooks/useMobileRecorder";
import { supabase } from "@/integrations/supabase/client";

const LANGUAGES: Array<{ code: string; label: string; flag: string }> = [
  { code: "en", label: "Anglais", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Espagnol", flag: "🇪🇸" },
  { code: "de", label: "Allemand", flag: "🇩🇪" },
  { code: "it", label: "Italien", flag: "🇮🇹" },
  { code: "pt", label: "Portugais", flag: "🇧🇷" },
  { code: "ru", label: "Russe", flag: "🇷🇺" },
  { code: "ja", label: "Japonais", flag: "🇯🇵" },
  { code: "zh", label: "Chinois", flag: "🇨🇳" },
  { code: "ko", label: "Coréen", flag: "🇰🇷" },
  { code: "tr", label: "Turc", flag: "🇹🇷" },
  { code: "pl", label: "Polonais", flag: "🇵🇱" },
  { code: "nl", label: "Néerlandais", flag: "🇳🇱" },
  { code: "ar", label: "Arabe", flag: "🇸🇦" },
  { code: "id", label: "Indonésien", flag: "🇮🇩" },
  { code: "vi", label: "Vietnamien", flag: "🇻🇳" },
  { code: "th", label: "Thaï", flag: "🇹🇭" },
  { code: "sv", label: "Suédois", flag: "🇸🇪" },
  { code: "uk", label: "Ukrainien", flag: "🇺🇦" },
];

function isMobileDevice() {
  if (typeof window === "undefined") return true;
  const ua = navigator.userAgent || "";
  const isTouch = matchMedia("(pointer: coarse)").matches;
  const isNarrow = window.innerWidth < 900;
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile|IEMobile|BlackBerry|Opera Mini/i.test(ua);
  return uaMobile || (isTouch && isNarrow);
}

export const Route = createFileRoute("/mobile")({
  head: () => ({
    meta: [
      { title: "TalKing Mobile - Dialogue vocal traduit" },
      { name: "description", content: "Parlez, l'IA traduit et lit à voix haute dans 19 langues. Application mobile TalKing pour dialoguer avec le monde entier." },
      { property: "og:title", content: "TalKing Mobile - Dialogue vocal traduit" },
      { property: "og:description", content: "Parlez, l'IA traduit et lit à voix haute dans 19 langues." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#0a0a0a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "TalKing" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-512.png" },
    ],
  }),
  component: MobilePage,
});

function MobilePage() {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  useEffect(() => {
    setMounted(true);
    setIsMobile(isMobileDevice());
  }, []);

  if (!mounted) return null;
  if (!isMobile) return <DesktopBlocker />;
  return <MobileApp />;
}

function DesktopBlocker() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-white/5 border border-white/10">
          <Smartphone className="h-10 w-10 text-white/80" />
        </div>
        <h1 className="text-2xl font-bold">Réservé aux téléphones</h1>
        <p className="mt-3 text-sm text-white/70">
          TalKing Mobile est conçu uniquement pour smartphones. Ouvrez ce lien depuis votre téléphone pour l'utiliser :
        </p>
        <div className="mt-4 rounded-xl bg-white/5 border border-white/10 px-4 py-3 font-mono text-sm break-all">
          talking-translator.com/mobile
        </div>
        <p className="mt-4 text-xs text-white/50">Sur PC, utilisez plutôt l'application Windows.</p>
        <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}

function MobileApp() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [targetLang, setTargetLang] = useState<string>(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem("tk_mobile_target") ?? "en";
  });
  const [langOpen, setLangOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [translation, setTranslation] = useState("");
  const [usage, setUsage] = useState<{ daily_used: number; daily_limit: number } | null>(null);
  const [installVisible, setInstallVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAudioUrlRef = useRef<string | null>(null);
  const deferredPromptRef = useRef<Event | null>(null);
  const recorder = useMobileRecorder();

  useEffect(() => {
    localStorage.setItem("tk_mobile_target", targetLang);
  }, [targetLang]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      const standalone = matchMedia("(display-mode: standalone)").matches
        || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!standalone) setInstallVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const selectedLang = useMemo(() => LANGUAGES.find((l) => l.code === targetLang) ?? LANGUAGES[0], [targetLang]);

  const playAudioBase64 = async (b64: string) => {
    if (lastAudioUrlRef.current) URL.revokeObjectURL(lastAudioUrlRef.current);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    lastAudioUrlRef.current = url;
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = url;
    audio.onended = () => recorder.setState("idle");
    audio.onerror = () => recorder.setState("idle");
    try {
      recorder.setState("playing");
      await audio.play();
    } catch {
      recorder.setState("idle");
    }
  };

  const replayLast = async () => {
    const audio = audioRef.current;
    if (!audio || !lastAudioUrlRef.current) return;
    try {
      audio.currentTime = 0;
      recorder.setState("playing");
      await audio.play();
    } catch {
      recorder.setState("idle");
    }
  };

  const handleMainButton = async () => {
    if (recorder.state === "recording") {
      recorder.setState("processing");
      const blob = await recorder.stop();
      if (!blob) {
        toast.error("Enregistrement trop court, réessayez.");
        recorder.setState("idle");
        return;
      }
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          toast.error("Session expirée");
          navigate({ to: "/auth" });
          return;
        }
        const form = new FormData();
        form.append("audio", blob, "recording.wav");
        form.append("targetLang", targetLang);
        const res = await fetch("/api/mobile-dialog", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error ?? "Erreur");
          if (json.daily_used != null) setUsage({ daily_used: json.daily_used, daily_limit: json.daily_limit });
          recorder.setState("idle");
          return;
        }
        setTranscript(json.transcript ?? "");
        setTranslation(json.translation ?? "");
        setUsage(json.usage ?? null);
        await playAudioBase64(json.audio);
      } catch (err) {
        console.error(err);
        toast.error("Erreur réseau");
        recorder.setState("idle");
      }
      return;
    }
    if (recorder.state === "processing" || recorder.state === "playing") return;
    try {
      await recorder.start();
    } catch {
      toast.error("Impossible d'accéder au microphone");
    }
  };

  const doInstall = async () => {
    const p = deferredPromptRef.current as unknown as { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> } | null;
    if (!p?.prompt) {
      toast.info("Sur iPhone : bouton Partager → « Sur l'écran d'accueil »");
      return;
    }
    await p.prompt();
    setInstallVisible(false);
  };

  const btnLabel = () => {
    switch (recorder.state) {
      case "recording": return "Toucher pour arrêter";
      case "processing": return "Traduction...";
      case "playing": return "Lecture en cours";
      case "error": return "Erreur - réessayer";
      default: return "Appuyer pour parler";
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden select-none" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-black font-black text-sm">Tk</div>
          <div className="text-base font-bold">TalKing<sup className="text-xs">®</sup></div>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
          className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/60 hover:text-white"
          aria-label="Déconnexion"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* Usage bar */}
      <div className="px-5 pb-2 text-center text-xs text-white/50">
        {usage
          ? `${usage.daily_used} / ${usage.daily_limit} traductions aujourd'hui`
          : "50 traductions vocales gratuites par jour"}
      </div>

      {/* Language selector */}
      <div className="px-5 mt-4">
        <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Traduire vers</div>
        <button
          onClick={() => setLangOpen(true)}
          className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left"
        >
          <span className="flex items-center gap-3">
            <span className="text-2xl leading-none">{selectedLang.flag}</span>
            <span className="text-base font-medium">{selectedLang.label}</span>
          </span>
          <span className="text-white/40 text-sm">Changer</span>
        </button>
      </div>

      {/* Main record button */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-6">
        <button
          onClick={handleMainButton}
          disabled={recorder.state === "processing"}
          className="relative grid h-56 w-56 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-60"
          style={{
            background: recorder.state === "recording"
              ? "radial-gradient(circle, #ef4444 0%, #7f1d1d 100%)"
              : recorder.state === "playing"
              ? "radial-gradient(circle, #22c55e 0%, #14532d 100%)"
              : "radial-gradient(circle, #ffffff 0%, #d4d4d4 100%)",
            boxShadow: recorder.state === "recording"
              ? "0 0 60px rgba(239,68,68,0.5)"
              : "0 20px 60px rgba(0,0,0,0.5)",
          }}
        >
          {recorder.state === "recording" && (
            <span className="absolute inset-0 rounded-full border-4 border-red-400/50 animate-ping" />
          )}
          {recorder.state === "processing" ? (
            <Loader2 className="h-16 w-16 text-white animate-spin" />
          ) : recorder.state === "playing" ? (
            <Volume2 className="h-16 w-16 text-white" />
          ) : (
            <Mic className={`h-20 w-20 ${recorder.state === "recording" ? "text-white" : "text-black"}`} />
          )}
        </button>

        <div className="text-center">
          <div className="text-base font-medium">{btnLabel()}</div>
          {recorder.state === "recording" && (
            <div className="mt-1 text-sm text-white/50 tabular-nums">{recorder.elapsed}s</div>
          )}
        </div>
      </div>

      {/* Transcript + translation */}
      {(transcript || translation) && (
        <div className="px-5 pb-5 space-y-2">
          {transcript && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Vous avez dit</div>
              <div className="text-sm text-white/80">{transcript}</div>
            </div>
          )}
          {translation && (
            <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase tracking-wider text-white/60">Traduction ({selectedLang.label})</div>
                <button onClick={replayLast} className="text-xs text-white/70 hover:text-white flex items-center gap-1">
                  <Volume2 className="h-3 w-3" /> Rejouer
                </button>
              </div>
              <div className="text-sm">{translation}</div>
            </div>
          )}
        </div>
      )}

      {/* Install banner */}
      {installVisible && (
        <div className="mx-5 mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between">
          <div className="text-xs text-white/70">Installer TalKing sur votre écran d'accueil</div>
          <button onClick={doInstall} className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black">Installer</button>
        </div>
      )}

      {/* Language modal */}
      {langOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => setLangOpen(false)}>
          <div className="w-full max-h-[80vh] rounded-t-3xl bg-[#111] border-t border-white/10 overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="sticky top-0 bg-[#111] px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-lg font-semibold">Langue cible</div>
              <button onClick={() => setLangOpen(false)} className="text-white/60 text-sm">Fermer</button>
            </div>
            <div className="p-3">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => { setTargetLang(l.code); setLangOpen(false); }}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left ${l.code === targetLang ? "bg-white/10" : "hover:bg-white/5"}`}
                >
                  <span className="text-2xl">{l.flag}</span>
                  <span className="flex-1 text-sm font-medium">{l.label}</span>
                  {l.code === targetLang && <span className="text-xs text-white/60">Sélectionné</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
