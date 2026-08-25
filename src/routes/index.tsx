import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HardDrive, Mic, Globe, Zap, Ear, Smartphone } from "lucide-react";
import { Footer } from "@/components/Footer";
import { UserMenu } from "@/components/UserMenu";
import logoBlanc from "@/assets/TalKing-blanc.svg.asset.json";

import { GoogleTranslate } from "@/components/GoogleTranslate";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TalKing - Traducteur vocal instantané pour gamers" },
      {
        name: "description",
        content:
          "TalKing traduit votre voix en temps réel : F8 copie la traduction dans le presse-papiers, F9 lit à voix haute le message d'un joueur. 47 langues, PC et mobile.",
      },
      { name: "keywords", content: "TalKing, traducteur vocal, traduction en temps réel, traducteur gaming, presse-papiers, F8, F9" },
      { property: "og:site_name", content: "TalKing" },
      { property: "og:locale", content: "fr_FR" },
      { property: "og:title", content: "TalKing - Traducteur vocal instantané pour gamers" },
      {
        property: "og:description",
        content:
          "Parlez dans votre langue, collez dans la leur. TalKing traduit votre voix en temps réel dans 47 langues, sur PC et mobile.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://talking-translator.com/" },
      { property: "og:image", content: "https://talking-translator.com/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "TalKing - Traducteur vocal instantané pour gamers" },
      { name: "twitter:image", content: "https://talking-translator.com/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "https://talking-translator.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": "https://talking-translator.com/#website",
              url: "https://talking-translator.com/",
              name: "TalKing",
              alternateName: ["TalKing Translator", "TalKing traducteur vocal"],
              inLanguage: "fr-FR",
              publisher: { "@id": "https://talking-translator.com/#org" },
            },
            {
              "@type": "Organization",
              "@id": "https://talking-translator.com/#org",
              name: "TalKing",
              url: "https://talking-translator.com/",
              logo: "https://talking-translator.com/icon-512.png",
              email: "rossetquentin26@gmail.com",
            },
            {
              "@type": "SoftwareApplication",
              name: "TalKing",
              operatingSystem: "Windows, Android, iOS",
              applicationCategory: "UtilitiesApplication",
              url: "https://talking-translator.com/",
              description:
                "Traducteur vocal push-to-talk : F8 copie votre traduction dans le presse-papiers, F9 lit à voix haute le message d'un joueur. 47 langues.",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "EUR",
                url: "https://talking-translator.com/pricing",
              },
            },
          ],
        }),
      },
    ],
  }),

  component: LandingPage,
});

function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const installPromptRef = useRef<Event | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [isSamsungBrowser, setIsSamsungBrowser] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    if (!loading && user && typeof window !== "undefined" && window.voxElectron?.isElectron) {
      navigate({ to: "/app", replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    setIsSamsungBrowser(/SamsungBrowser/i.test(window.navigator.userAgent));
    setIsAndroid(/Android/i.test(window.navigator.userAgent));
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event;
    };
    const earlyPrompt = (window as Window & { __talkingInstallPrompt?: Event }).__talkingInstallPrompt;
    if (earlyPrompt) installPromptRef.current = earlyPrompt;
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  const installMobileApp = async () => {
    // Samsung Internet peut empaqueter la PWA dans un ancien WebAPK, ensuite
    // bloqué par Play Protect sur les versions Android récentes. Dans ce
    // navigateur, ne jamais lancer son invite native : guider vers Chrome.
    if (/SamsungBrowser/i.test(window.navigator.userAgent)) {
      setShowInstallHelp(true);
      return;
    }
    const promptEvent = installPromptRef.current as (Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
    }) | null;
    if (promptEvent?.prompt) {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      installPromptRef.current = null;
      return;
    }
    setShowInstallHelp(true);
  };

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
            href="https://github.com/Quentin-MAD/voice-to-clipboard/releases/download/v1.0.2/TalKing-Setup.exe"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-base font-medium hover:bg-accent"
          >
            <HardDrive className="h-5 w-5" />
            Télécharger pour Windows
          </a>
        </div>
      </section>

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
        <div className="mx-auto grid max-w-4xl gap-6 px-4 py-16 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <HardDrive className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-4 text-xl font-bold">App Windows</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              F8/F9 en arrière-plan, même pendant vos parties. Presse-papiers ou auto-écriture.
            </p>
            <a
              href="https://github.com/Quentin-MAD/voice-to-clipboard/releases/download/v1.0.2/TalKing-Setup.exe"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
            >
              <HardDrive className="h-5 w-5" />
              Télécharger pour Windows
            </a>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Smartphone className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-4 text-xl font-bold">App Mobile</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Dialogue traduit à voix haute : chacun parle sa langue, l'IA traduit dans 47 langues.
            </p>
    <Button
              type="button"
              onClick={installMobileApp}
              variant="outline"
              className="mt-6 h-auto rounded-xl px-6 py-3 text-base"
            >
              <Smartphone className="h-5 w-5" />
              Installer sur téléphone
            </Button>
          </div>
        </div>
      </section>

      {showInstallHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/70 p-0 sm:items-center sm:p-4" onClick={() => setShowInstallHelp(false)}>
          <div className="w-full max-w-md rounded-t-lg border border-border bg-background p-6 shadow-xl sm:rounded-lg" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold">Installer TalKing</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              L'installation ajoute directement l'icône TalKing sur votre écran d'accueil.
            </p>
            {isAndroid && (
              <div className="mt-5 rounded-md border border-primary/40 bg-primary/10 p-4">
                <h3 className="font-semibold">Vous êtes dans Google ou un navigateur intégré ?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ces fenêtres ne permettent pas l'installation. Ouvrez d'abord le site dans votre navigateur Samsung ou Chrome.
                </p>
                <div className="mt-3">
                  <Button asChild size="sm" className="w-full">
                    <a href="intent://talking-translator.com/mobile#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Ftalking-translator.com%2Fmobile;end">
                      Ouvrir dans Chrome
                    </a>
                  </Button>
                </div>
              </div>
            )}
            <div className="mt-5 space-y-5 text-sm">
              <div>
                <h3 className="font-semibold">Sur iPhone avec Safari</h3>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
                  <li>Touchez le bouton Partager.</li>
                  <li>Choisissez « Sur l'écran d'accueil ».</li>
                  <li>Touchez Ajouter.</li>
                </ol>
              </div>
              {isSamsungBrowser && (
                <div className="rounded-md border border-primary/40 bg-primary/10 p-4">
                  <h3 className="font-semibold">Sur votre Samsung</h3>
                  <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
                    <li>Touchez « Ouvrir dans Chrome » ci-dessus.</li>
                    <li>Dans Chrome, ouvrez le menu <b>⋮</b>.</li>
                    <li>Touchez « Installer l'application ».</li>
                    <li>Confirmez l'installation.</li>
                  </ol>
                  <p className="mt-2 text-xs text-muted-foreground">N'utilisez pas l'installation proposée par Samsung Internet : Android peut la bloquer comme application ancienne.</p>
                </div>
              )}
              <div>
                <h3 className="font-semibold">Sur Android avec Chrome ou Edge</h3>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
                  <li>Ouvrez le menu ⋮.</li>
                  <li>Choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».</li>
                  <li>Confirmez l'installation.</li>
                </ol>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => setShowInstallHelp(false)}
              className="mt-6 h-auto w-full rounded-lg py-3"
            >
              Fermer
            </Button>
          </div>
        </div>
      )}



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
