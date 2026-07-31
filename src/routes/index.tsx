import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HardDrive, Mic, Globe, Zap, Ear, Smartphone } from "lucide-react";
import { Footer } from "@/components/Footer";
import { UserMenu } from "@/components/UserMenu";
import logoBlanc from "@/assets/TalKing-blanc.svg.asset.json";

import { GoogleTranslate } from "@/components/GoogleTranslate";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TalKing - Traducteur vocal en temps réel pour gamers" },
      {
        name: "description",
        content:
          "Traducteur vocal push-to-talk pour gamers : F8 copie votre traduction dans le presse-papiers, F9 lit à voix haute le message d'un joueur.",
      },
      { property: "og:title", content: "TalKing - Traducteur vocal en temps réel pour gamers" },
      {
        property: "og:description",
        content:
          "Traducteur vocal push-to-talk pour gamers : F8 copie votre traduction dans le presse-papiers, F9 lit à voix haute le message d'un joueur.",
      },
    ],
  }),
  component: LandingPage,
});

function MobileDownloadCard() {
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const promptRef = { current: null as unknown as { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> } | null };

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const touch = matchMedia("(pointer: coarse)").matches;
    setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (touch && window.innerWidth < 900));
    setIsIOS(/iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document));
    const standalone = matchMedia("(display-mode: standalone)").matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as unknown as { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const onInstallClick = async () => {
    if (installed) {
      window.location.href = "/mobile";
      return;
    }
    if (canInstall && promptRef.current?.prompt) {
      await promptRef.current.prompt();
      return;
    }
    setShowHelp(true);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <Smartphone className="mx-auto h-10 w-10 text-primary" />
      <h2 className="mt-4 text-xl font-bold">App Mobile</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Dialoguez avec des étrangers : parlez, l'IA traduit et lit à voix haute dans 47 langues. 50 traductions gratuites par jour.
      </p>
      {isMobile ? (
        <div className="mt-6 space-y-3">
          <button
            onClick={onInstallClick}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Smartphone className="h-5 w-5" />
            {installed ? "Ouvrir TalKing" : "Installer TalKing sur mon téléphone"}
          </button>
          {!installed && (
            <p className="text-xs text-muted-foreground">
              Une fois installée, l'icône <b>TalKing</b> apparaît sur votre écran d'accueil et se lance en plein écran comme une vraie app - sans passer par le navigateur.
            </p>
          )}
          <Link
            to="/mobile"
            className="inline-flex items-center justify-center text-xs text-muted-foreground underline underline-offset-4"
          >
            ou ouvrir dans le navigateur
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            Réservé aux téléphones. Ouvrez ce lien depuis votre mobile :
          </div>
          <div className="rounded-lg bg-muted px-3 py-2 font-mono text-sm">
            talking-translator.com
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 sm:items-center sm:justify-center" onClick={() => setShowHelp(false)}>
          <div
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-card p-6 text-left sm:max-w-md sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
          >
            <div className="text-lg font-bold">Installer TalKing sur votre téléphone</div>
            {isIOS ? (
              <div className="mt-4 space-y-3 text-sm">
                <p className="text-muted-foreground">Sur iPhone/iPad, l'installation se fait en 3 gestes depuis <b>Safari</b> (obligatoire, Apple bloque les autres navigateurs) :</p>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>Touchez l'icône <b>Partager</b> en bas de l'écran (carré avec flèche vers le haut).</li>
                  <li>Faites défiler et touchez <b>« Sur l'écran d'accueil »</b>.</li>
                  <li>Touchez <b>Ajouter</b> en haut à droite. L'icône <b>TalKing</b> apparaît sur votre écran d'accueil.</li>
                </ol>
                <p className="text-xs text-muted-foreground">Ensuite, ouvrez TalKing depuis cette icône : ça se lance en plein écran, sans barre Safari, comme une vraie app.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                <p className="text-muted-foreground">Sur Android, avec <b>Chrome</b> ou <b>Edge</b> :</p>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>Touchez le menu <b>⋮</b> en haut à droite du navigateur.</li>
                  <li>Choisissez <b>« Installer l'application »</b> (ou <b>« Ajouter à l'écran d'accueil »</b>).</li>
                  <li>Confirmez avec <b>Installer</b>. L'icône <b>TalKing</b> apparaît dans votre liste d'applications.</li>
                </ol>
                <p className="text-xs text-muted-foreground">Sur Samsung Internet, l'option est dans le menu <b>≡</b> en bas. Sur Firefox Android, menu <b>⋮</b> → « Installer ».</p>
              </div>
            )}
            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full rounded-xl border border-border py-3 text-sm hover:bg-muted"
            >
              J'ai compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && typeof window !== "undefined" && window.voxElectron?.isElectron) {
      navigate({ to: "/app", replace: true });
    }
  }, [loading, user, navigate]);

  return (


    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,auto)_auto] items-center gap-3 px-4 py-4 sm:flex sm:justify-between sm:py-6">
          <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-3 notranslate">
            <img src={logoBlanc.url} alt="TalKing" draggable={false} onDragStart={(e) => e.preventDefault()} className="h-12 w-auto shrink-0 select-none sm:h-16 md:h-20" />
            <span className="truncate text-xl font-bold tracking-tight text-primary-foreground sm:text-2xl md:text-3xl">
              TalKing<span className="ml-0.5 text-[0.65em] font-sans" style={{ verticalAlign: "0.35em" }}>®</span>
            </span>
          </Link>
          <nav className="flex items-center justify-end gap-2 sm:gap-4 text-sm">
            <GoogleTranslate className="text-white" />
            <Link to="/pricing" className="hidden rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 sm:inline-block">
              Plans
            </Link>
            {loading ? null : user ? (
              <UserMenu />
            ) : (
              <Link
                to="/auth"
                className="rounded-lg bg-primary-foreground px-3 py-2 text-sm font-medium text-primary hover:bg-primary-foreground/90 sm:px-4"
              >
                <span className="hidden sm:inline">Connexion</span>
                <span className="sm:hidden">Se connecter</span>
              </Link>
            )}
          </nav>

        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Parlez dans votre langue.
          <br />
          Ctrl+v dans la leur.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          <span className="notranslate">TalKing</span> comprend deux fonctions : la Traduction Vocale (F8) traduit ce que vous dites et le copie dans votre presse-papiers, tandis que la Lecture de Message Joueur (F9) lit à voix haute, dans votre langue, le message d'un joueur dont vous donnez le pseudo afin que l'IA puisse le trouver, le traduire et le synthétiser vocalement. Si votre jeu ne prend pas en charge le copier-coller, activez l'option d'auto-écriture : TalKing tapera la traduction directement dans la zone de chat.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
          >
            Essayer gratuitement
          </Link>
          <a
            href="/__l5e/assets-v1/ec1d1909-aaea-48d0-a444-df74b32307ee/TalKing-Setup-1.0.2.exe"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-base font-medium hover:bg-accent"
          >
            <HardDrive className="h-5 w-5" />
            Télécharger pour Windows
          </a>
        </div>
        </div>

      {/* Features */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-6">
              <Mic className="mb-3 h-8 w-8 text-primary" />
              <h2 className="text-lg font-semibold">Traduction Vocale</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Parlez, relâchez la touche, et la traduction écrite est immédiatement dans votre presse-papiers.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <Ear className="mb-3 h-8 w-8 text-primary" />
              <h2 className="text-lg font-semibold">Lecture de Message Joueur</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Appuyez sur F9, dites le pseudo du joueur : l'IA lit à voix haute sa traduction dans votre langue.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <Globe className="mb-3 h-8 w-8 text-primary" />
              <h2 className="text-lg font-semibold">47 langues</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                FR, EN, ES, DE, IT, PT-BR, NL, PL, RU, JA, ZH, KO, TR, AR, ID, VI, TH, SV, UK, EL, HI, RO, CS, HU, DA, FI, NO, HE, BG, HR, SK, MS, FA.
              </p>

            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <Zap className="mb-3 h-8 w-8 text-primary" />
              <h2 className="text-lg font-semibold">Rapide</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Transcription + traduction + presse-papiers en quelques secondes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold">Comment ça marche</h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          {/* F8 - Traduction Vocale */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                F8
              </div>
              <h3 className="text-lg font-semibold">Traduction Vocale</h3>
            </div>
            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">1</span>
                <p className="text-sm text-muted-foreground">Appuyez sur la touche d'enregistrement (F8 par défaut, modifiable).</p>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">2</span>
                <p className="text-sm text-muted-foreground">Parlez votre phrase, puis appuyez de nouveau sur la même touche pour arrêter.</p>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">3</span>
                <div className="text-sm text-muted-foreground">
                  <p>La traduction écrite est copiée dans votre presse-papiers. Collez-la directement dans le chat du jeu.</p>
                  <p className="mt-2 text-xs text-primary">
                    Votre jeu bloque le copier-coller ? Activez dans les paramètres l'option « Mon jeu ne prend pas en compte le copier-coller » : la traduction sera tapée automatiquement dans la zone de chat, lettre par lettre.
                  </p>
                </div>
              </li>
            </ol>
          </div>

          {/* F9 - Lecture de Message Joueur */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                F9
              </div>
              <h3 className="text-lg font-semibold">Lecture de Message Joueur</h3>
            </div>
            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">1</span>
                <p className="text-sm text-muted-foreground">Appuyez sur la touche F9 (configurable) pendant que le message du joueur est visible à l'écran.</p>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">2</span>
                <p className="text-sm text-muted-foreground">Dites le pseudo du joueur. L'application capture votre écran et retrouve son message dans le chat.</p>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">3</span>
                <p className="text-sm text-muted-foreground">L'IA traduit le message et le lit à voix haute avec une voix féminine naturelle.</p>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Download */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-16 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <HardDrive className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-4 text-xl font-bold">App Windows</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              F8/F9 en arrière-plan, même pendant vos parties. Presse-papiers ou auto-écriture.
            </p>
            <a
              href="/__l5e/assets-v1/ec1d1909-aaea-48d0-a444-df74b32307ee/TalKing-Setup-1.0.2.exe"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
            >
              <HardDrive className="h-5 w-5" />
              Télécharger pour Windows
            </a>
          </div>
          <MobileDownloadCard />
        </div>
      </section>


      {/* Pricing teaser */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h2 className="text-2xl font-bold">Une formule pour chaque usage</h2>
        <Link
          to="/pricing"
          className="mt-6 inline-block rounded-xl border border-border bg-card px-6 py-3 text-base font-medium hover:bg-accent"
        >
          Voir les tarifs
        </Link>
      </section>

      <Footer />
    </div>
  );
}
