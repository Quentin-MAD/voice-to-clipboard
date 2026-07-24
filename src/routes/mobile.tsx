import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Loader2, Volume2, LogOut, Smartphone, ArrowLeftRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useMobileRecorder } from "@/hooks/useMobileRecorder";
import { supabase } from "@/integrations/supabase/client";
import { CreditsBadge, StatusPill, CreditsCard } from "@/components/CreditsBadge";

const LANGUAGES: Array<{ code: string; label: string; flag: string }> = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "Anglais", flag: "🇬🇧" },
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

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
}

export const Route = createFileRoute("/mobile")({
  head: () => ({
    meta: [
      { title: "TalKing Mobile - Dialogue vocal traduit" },
      { name: "description", content: "Dialoguez à deux voix : chacun parle sa langue, l'IA traduit à voix haute dans 19 langues." },
      { property: "og:title", content: "TalKing Mobile - Dialogue vocal traduit" },
      { property: "og:description", content: "Dialoguez à deux voix : chacun parle sa langue, l'IA traduit à voix haute." },
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

type Turn = "me" | "them";

function MobileApp() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [myLang, setMyLang] = useState<string>(() => {
    if (typeof window === "undefined") return "fr";
    return localStorage.getItem("tk_mobile_mylang") ?? "fr";
  });
  const [theirLang, setTheirLang] = useState<string>(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem("tk_mobile_theirlang") ?? "en";
  });
  const [turn, setTurn] = useState<Turn>("me");
  const [langModal, setLangModal] = useState<null | "me" | "them">(null);

  const [transcript, setTranscript] = useState("");
  const [translation, setTranslation] = useState("");
  const [lastDirection, setLastDirection] = useState<Turn>("me");
  const [usage, setUsage] = useState<{ daily_used: number; daily_limit: number } | null>(null);

  const [installVisible, setInstallVisible] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAudioUrlRef = useRef<string | null>(null);
  const deferredPromptRef = useRef<Event | null>(null);
  const recorder = useMobileRecorder();

  useEffect(() => { localStorage.setItem("tk_mobile_mylang", myLang); }, [myLang]);
  useEffect(() => { localStorage.setItem("tk_mobile_theirlang", theirLang); }, [theirLang]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/mobile" }, replace: true });
  }, [loading, user, navigate]);

  // Auto-update: detect a new build by hashing the served HTML shell
  useEffect(() => {
    let lastHash: string | null = localStorage.getItem("tk_mobile_html_hash");
    const hashString = async (s: string) => {
      const buf = new TextEncoder().encode(s);
      const digest = await crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    };
    const check = async () => {
      try {
        const res = await fetch(`/mobile?u=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
        if (!res.ok) return;
        const html = await res.text();
        // Only keep the <script>/<link> asset references — they change on every build
        const assets = (html.match(/(?:src|href)="\/[^"]+\.(?:js|css)[^"]*"/g) || []).sort().join("|");
        if (!assets) return;
        const hash = await hashString(assets);
        if (lastHash && lastHash !== hash) {
          localStorage.setItem("tk_mobile_html_hash", hash);
          window.location.reload();
          return;
        }
        if (!lastHash) {
          lastHash = hash;
          localStorage.setItem("tk_mobile_html_hash", hash);
        }
      } catch {}
    };
    check();
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    const iv = setInterval(check, 5 * 60 * 1000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(iv); };
  }, []);



  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      const standalone = matchMedia("(display-mode: standalone)").matches
        || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!standalone) setInstallVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Ouvre automatiquement le guide d'installation à la première visite
    // si l'app n'est pas déjà installée (crucial iOS : pas d'invite native).
    try {
      const standalone = matchMedia("(display-mode: standalone)").matches
        || (navigator as unknown as { standalone?: boolean }).standalone === true;
      const seen = localStorage.getItem("tk_install_help_seen");
      if (!standalone && !seen) {
        setShowInstallHelp(true);
        localStorage.setItem("tk_install_help_seen", "1");
      }
    } catch {}

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const myLangObj = useMemo(() => LANGUAGES.find((l) => l.code === myLang) ?? LANGUAGES[0], [myLang]);
  const theirLangObj = useMemo(() => LANGUAGES.find((l) => l.code === theirLang) ?? LANGUAGES[1], [theirLang]);

  const sourceLang = turn === "me" ? myLang : theirLang;
  const targetLang = turn === "me" ? theirLang : myLang;
  const sourceLangObj = turn === "me" ? myLangObj : theirLangObj;
  const targetLangObj = turn === "me" ? theirLangObj : myLangObj;

  const playAudioBase64 = async (b64: string) => {
    if (lastAudioUrlRef.current) URL.revokeObjectURL(lastAudioUrlRef.current);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    lastAudioUrlRef.current = url;
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = url;
    const finish = () => {
      recorder.setState("idle");
      // Auto-hand-off: flip the turn after playback ends
      setTurn((t) => (t === "me" ? "them" : "me"));
    };
    audio.onended = finish;
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
      await audio.play();
    } catch { /* ignore */ }
  };

  const swapTurn = () => {
    if (recorder.state === "recording" || recorder.state === "processing") return;
    setTurn((t) => (t === "me" ? "them" : "me"));
  };

  const swapLangs = () => {
    setMyLang(theirLang);
    setTheirLang(myLang);
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
        form.append("sourceLang", sourceLang);
        form.append("targetLang", targetLang);
        const currentDirection = turn;
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
        setLastDirection(currentDirection);
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
    if (p?.prompt) {
      await p.prompt();
      setInstallVisible(false);
      return;
    }
    setShowInstallHelp(true);
  };

  const btnLabel = () => {
    switch (recorder.state) {
      case "recording": return "Toucher pour arrêter";
      case "processing": return "Traduction...";
      case "playing": return "Lecture en cours";
      default: return turn === "me" ? "À vous - appuyez pour parler" : "À lui/elle - passez le téléphone";
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

      {/* Email + status */}
      <div className="px-5 pt-1 pb-2 flex items-center justify-center gap-2 flex-wrap">
        {user?.email && (
          <span className="max-w-[220px] truncate text-xs text-white/70">{user.email}</span>
        )}
        <StatusPill variant="dark" />
      </div>

      {/* Credits card */}
      <div className="px-5 pb-2">
        <CreditsCard variant="dark" />
      </div>

      {/* Usage */}
      <div className="px-5 pb-2 text-center text-xs text-white/50">
        {usage
          ? `${usage.daily_used} / ${usage.daily_limit} traductions aujourd'hui`
          : "50 traductions vocales gratuites par jour"}
      </div>


      {/* Language pair */}
      <div className="px-5 mt-3">
        <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2 text-center">
          Dialogue - chacun parle sa langue, chacun son tour
        </div>
        <div className="flex items-stretch gap-2">
          <button
            onClick={() => setLangModal("me")}
            className={`flex-1 rounded-2xl border px-3 py-3 text-left transition ${turn === "me" ? "border-white/40 bg-white/10" : "border-white/10 bg-white/5"}`}
          >
            <div className="text-[10px] uppercase tracking-wider text-white/50">Vous</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl leading-none">{myLangObj.flag}</span>
              <span className="text-sm font-semibold truncate">{myLangObj.label}</span>
            </div>
          </button>
          <button
            onClick={swapLangs}
            className="grid place-items-center rounded-2xl border border-white/10 bg-white/5 px-3 text-white/70 hover:text-white"
            aria-label="Inverser les langues"
            title="Inverser les langues"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setLangModal("them")}
            className={`flex-1 rounded-2xl border px-3 py-3 text-left transition ${turn === "them" ? "border-white/40 bg-white/10" : "border-white/10 bg-white/5"}`}
          >
            <div className="text-[10px] uppercase tracking-wider text-white/50">Lui/elle</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl leading-none">{theirLangObj.flag}</span>
              <span className="text-sm font-semibold truncate">{theirLangObj.label}</span>
            </div>
          </button>
        </div>

        {/* Direction indicator */}
        <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <span className="text-lg">{sourceLangObj.flag}</span>
          <span className="text-xs text-white/60">{sourceLangObj.label}</span>
          <span className="text-white/40">→</span>
          <span className="text-lg">{targetLangObj.flag}</span>
          <span className="text-xs text-white/60">{targetLangObj.label}</span>
          <button
            onClick={swapTurn}
            className="ml-3 text-[10px] uppercase tracking-wider text-white/50 hover:text-white"
            title="Changer de tour manuellement"
          >
            Changer de tour
          </button>
        </div>
      </div>

      {/* Main record button */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 gap-5">
        <button
          onClick={handleMainButton}
          disabled={recorder.state === "processing"}
          className="relative grid h-52 w-52 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-60"
          style={{
            background: recorder.state === "recording"
              ? "radial-gradient(circle, #ef4444 0%, #7f1d1d 100%)"
              : recorder.state === "playing"
              ? "radial-gradient(circle, #22c55e 0%, #14532d 100%)"
              : turn === "me"
              ? "radial-gradient(circle, #ffffff 0%, #d4d4d4 100%)"
              : "radial-gradient(circle, #a3a3a3 0%, #525252 100%)",
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
          {recorder.state === "idle" && (
            <div className="mt-1 text-xs text-white/40">
              Après la lecture, le tour passe automatiquement à l'autre personne.
            </div>
          )}
        </div>
      </div>

      {/* Transcript + translation */}
      {(transcript || translation) && (
        <div className="px-5 pb-5 space-y-2">
          {transcript && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                {lastDirection === "me" ? "Vous avez dit" : "Il/elle a dit"} ({(lastDirection === "me" ? myLangObj : theirLangObj).label})
              </div>
              <div className="text-sm text-white/80">{transcript}</div>
            </div>
          )}
          {translation && (
            <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase tracking-wider text-white/60">
                  Traduction en {(lastDirection === "me" ? theirLangObj : myLangObj).label}
                </div>
                <button onClick={replayLast} className="text-xs text-white/70 hover:text-white flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" /> Rejouer
                </button>
              </div>
              <div className="text-sm">{translation}</div>
            </div>
          )}
        </div>
      )}

      {/* Install banner (Android/Chrome) */}
      {installVisible && (
        <div className="mx-5 mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between">
          <div className="text-xs text-white/70">Installer TalKing sur votre écran d'accueil</div>
          <button onClick={doInstall} className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black">Installer</button>
        </div>
      )}

      {/* Install help modal */}
      {showInstallHelp && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => setShowInstallHelp(false)}>
          <div className="w-full max-h-[80vh] rounded-t-3xl bg-[#111] border-t border-white/10 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
            <div className="text-lg font-semibold mb-3">Installer TalKing</div>
            {isIOS() ? (
              <div className="space-y-3 text-sm text-white/80">
                <p className="text-white/70">Sur iPhone/iPad, il faut utiliser Safari :</p>
                <ol className="list-decimal list-inside space-y-2 text-white/80">
                  <li>Touchez le bouton <b>Partager</b> en bas de Safari (carré avec flèche vers le haut).</li>
                  <li>Faites défiler et touchez <b>« Sur l'écran d'accueil »</b>.</li>
                  <li>Confirmez avec <b>Ajouter</b>. L'icône Tk apparaît sur votre écran d'accueil.</li>
                </ol>
                <p className="text-xs text-white/50">Chrome/Firefox iOS ne permettent pas l'installation - Apple oblige à passer par Safari.</p>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-white/80">
                <p className="text-white/70">Sur Android, avec Chrome ou Edge :</p>
                <ol className="list-decimal list-inside space-y-2 text-white/80">
                  <li>Touchez le menu <b>⋮</b> en haut à droite du navigateur.</li>
                  <li>Choisissez <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b>.</li>
                  <li>Confirmez. L'icône Tk apparaît sur votre écran d'accueil.</li>
                </ol>
                <p className="text-xs text-white/50">Si l'option n'apparaît pas, essayez avec Chrome (à jour). Sur Samsung Internet, l'option est dans le menu ≡.</p>
              </div>
            )}
            <button
              onClick={() => setShowInstallHelp(false)}
              className="mt-5 w-full rounded-xl border border-white/20 py-3 text-sm hover:bg-white/5"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Language modal */}
      {langModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => setLangModal(null)}>
          <div className="w-full max-h-[80vh] rounded-t-3xl bg-[#111] border-t border-white/10 overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="sticky top-0 bg-[#111] px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-lg font-semibold">
                {langModal === "me" ? "Votre langue" : "Sa langue"}
              </div>
              <button onClick={() => setLangModal(null)} className="text-white/60 text-sm">Fermer</button>
            </div>
            <div className="p-3">
              {LANGUAGES.map((l) => {
                const active = langModal === "me" ? l.code === myLang : l.code === theirLang;
                const otherSide = langModal === "me" ? theirLang : myLang;
                const disabled = l.code === otherSide;
                return (
                  <button
                    key={l.code}
                    disabled={disabled}
                    onClick={() => {
                      if (langModal === "me") setMyLang(l.code);
                      else setTheirLang(l.code);
                      setLangModal(null);
                    }}
                    className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left ${active ? "bg-white/10" : "hover:bg-white/5"} ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
                  >
                    <span className="text-2xl">{l.flag}</span>
                    <span className="flex-1 text-sm font-medium">{l.label}</span>
                    {active && <span className="text-xs text-white/60">Sélectionné</span>}
                    {disabled && !active && <span className="text-xs text-white/40">Utilisée par l'autre</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
