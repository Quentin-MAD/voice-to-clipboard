import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { HardDrive, Mic, Globe, Zap, MessageSquare, Ear } from "lucide-react";
import { Footer } from "@/components/Footer";
import { UserMenu } from "@/components/UserMenu";
import { GoogleTranslate } from "@/components/GoogleTranslate";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TalKing - Traducteur vocal en temps réel pour gamers" },
      {
        name: "description",
        content:
          "Traducteur vocal push-to-talk pour gamers. F8 : dites votre phrase, la traduction arrive dans votre presse-papiers. F9 : lisez à voix haute le message d'un joueur en jeu.",
      },
      { property: "og:title", content: "TalKing - Traducteur vocal en temps réel pour gamers" },
      {
        property: "og:description",
        content:
          "Traducteur vocal push-to-talk pour gamers. F8 : dites votre phrase, la traduction arrive dans votre presse-papiers. F9 : lisez à voix haute le message d'un joueur en jeu.",
      },
    ],
  }),
  component: LandingPage,
});

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
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="text-xl font-bold notranslate">TalKing<sup className="relative -top-1 ml-0.5 text-base">®</sup></div>
          <nav className="flex items-center gap-4 text-sm">
            <GoogleTranslate />
            <Link to="/pricing" className="rounded-lg border border-foreground px-3 py-1.5 text-muted-foreground hover:text-foreground">
              Tarifs
            </Link>
            {loading ? null : user ? (
              <UserMenu />
            ) : (
              <Link
                to="/auth"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Connexion
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
          <span className="notranslate">TalKing</span> comprend deux fonctions : la Traduction Vocale (F8) traduit ce que vous dites et le copie dans votre presse-papiers, tandis que la Lecture de Message Joueur (F9) lit à voix haute, dans votre langue, le message d'un joueur dont vous donnez le pseudo afin que l'IA puisse le trouver, le traduire et le synthétiser vocalement.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
          >
            Essayer gratuitement
          </Link>
          <a
            href="/__l5e/assets-v1/39d8fd2c-52cb-43ea-b5e5-c42166360267/TalKing-Setup-0.9.9.exe"
            download="TalKing-Setup-0.9.9.exe"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-base font-medium hover:bg-accent"
          >
            <HardDrive className="h-5 w-5" />
            Télécharger pour Windows
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          20 traductions gratuites par mois. Aucune carte requise.
        </p>
      </section>

      {/* Features */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-6">
              <Mic className="mb-3 h-8 w-8 text-primary" />
              <h3 className="text-lg font-semibold">Traduction Vocale</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Parlez, relâchez la touche, et la traduction écrite est immédiatement dans votre presse-papiers.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <Ear className="mb-3 h-8 w-8 text-primary" />
              <h3 className="text-lg font-semibold">Lecture de Message Joueur</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Appuyez sur F9, dites le pseudo du joueur : l'IA lit à voix haute sa traduction dans votre langue.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <Globe className="mb-3 h-8 w-8 text-primary" />
              <h3 className="text-lg font-semibold">19 langues</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                FR, EN, ES, DE, IT, JA, ZH, PT-BR, KO, TR, PL, NL, AR, ID, VI, TH, SV, UK, RU.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <Zap className="mb-3 h-8 w-8 text-primary" />
              <h3 className="text-lg font-semibold">Rapide</h3>
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
                <p className="text-sm text-muted-foreground">La traduction écrite est copiée dans votre presse-papiers. Collez-la directement dans le chat du jeu.</p>
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
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold">Téléchargez l'app Windows</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            L'application fonctionne en arrière-plan et reste active même quand vous jouez.
          </p>
          <a
            href="/__l5e/assets-v1/39d8fd2c-52cb-43ea-b5e5-c42166360267/TalKing-Setup-0.9.9.exe"
            download="TalKing-Setup-0.9.9.exe"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
          >
            <HardDrive className="h-5 w-5" />
            Télécharger <span className="notranslate">TalKing-Setup-0.9.9.exe</span> (99 MB)
          </a>
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
