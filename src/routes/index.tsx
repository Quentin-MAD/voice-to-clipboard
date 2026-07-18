import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { HardDrive, Mic, Globe, Zap } from "lucide-react";
import { Footer } from "@/components/Footer";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TalKing - Real-time voice translator for gamers" },
      {
        name: "description",
        content:
          "Push-to-talk voice translator. Record with a hotkey, get the translation copied to your clipboard instantly.",
      },
      { property: "og:title", content: "TalKing - Real-time voice translator for gamers" },
      {
        property: "og:description",
        content:
          "Push-to-talk voice translator. Record with a hotkey, get the translation copied to your clipboard instantly.",
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
          <div className="text-xl font-bold">TalKing</div>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
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
          Collage dans la leur.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          TalKing traduit votre voix en temps réel pendant que vous jouez.
          Appuyez sur une touche, parlez, et la traduction arrive directement dans votre presse-papiers.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
          >
            Essayer gratuitement
          </Link>
          <a
            href="/__l5e/assets-v1/e2a79e8e-06e3-43b5-be52-01f93e7f548f/TalKing-Setup-0.9.3.exe"
            download="TalKing-Setup-0.9.3.exe"
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
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-6">
              <Mic className="mb-3 h-8 w-8 text-primary" />
              <h3 className="text-lg font-semibold">Push-to-talk</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Une seule touche pour enregistrer et arrêter. Parfait quand vous jouez en plein écran.
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
      <section className="mx-auto max-w-4xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold">Comment ça marche</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              1
            </div>
            <p className="mt-3 text-sm font-medium">Appuyez sur F8</p>
            <p className="text-xs text-muted-foreground">Touche configurable dans l'app.</p>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              2
            </div>
            <p className="mt-3 text-sm font-medium">Parlez</p>
            <p className="text-xs text-muted-foreground">Dites votre phrase en jeu ou sur Discord.</p>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              3
            </div>
            <p className="mt-3 text-sm font-medium">Collez</p>
            <p className="text-xs text-muted-foreground">La traduction est déjà dans votre presse-papiers.</p>
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
            href="/__l5e/assets-v1/e2a79e8e-06e3-43b5-be52-01f93e7f548f/TalKing-Setup-0.9.3.exe"
            download="TalKing-Setup-0.9.3.exe"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
          >
            <HardDrive className="h-5 w-5" />
            Télécharger TalKing-Setup-0.9.3.exe (99 MB)
          </a>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h2 className="text-2xl font-bold">Une formule pour chaque usage</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Gratuit : 20 traductions/mois. Pack 50 crédits 2,99€. Abonnement illimité 20€/an.
        </p>
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
