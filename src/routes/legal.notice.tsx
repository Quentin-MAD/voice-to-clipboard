import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/legal/notice")({
  component: NoticePage,
  head: () => ({
    meta: [
      { title: "Mentions légales — TalKing" },
      { name: "description", content: "Mentions légales du site TalKing." },
      { property: "og:title", content: "Mentions légales — TalKing" },
      { property: "og:url", content: "https://voice-to-clipboard.lovable.app/legal/notice" },
    ],
    links: [{ rel: "canonical", href: "https://voice-to-clipboard.lovable.app/legal/notice" }],
  }),
});

function NoticePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Retour</Link>
        <h1 className="mt-4 text-3xl font-bold text-foreground">Mentions légales</h1>

        <div className="mt-8 space-y-6 text-sm text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold">Éditeur du site</h2>
            <p>
              <strong>Quentin Rosset</strong> — Entrepreneur individuel<br />
              SIREN : 107 314 445<br />
              SIRET : 107 314 445 00019<br />
              Pays : France<br />
              Contact : <a className="underline" href="mailto:rossetquentin26@gmail.com">rossetquentin26@gmail.com</a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Directeur de la publication</h2>
            <p>Quentin Rosset</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Hébergement</h2>
            <p>
              Le site est hébergé sur une infrastructure edge (Cloudflare Workers) et utilise Supabase pour la base de
              données et l'authentification.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Paiements</h2>
            <p>
              Les paiements sont traités par <strong>Paddle.com Market Limited</strong>, agissant en qualité de revendeur
              (Merchant of Record) et éditant les factures pour l'ensemble des commandes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Propriété intellectuelle</h2>
            <p>
              L'ensemble des contenus (textes, marques, logos, interfaces, code) présents sur ce site est protégé par le
              droit d'auteur et le droit des marques. Toute reproduction non autorisée est interdite.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Données personnelles</h2>
            <p>
              Le traitement des données personnelles est décrit dans notre{" "}
              <Link to="/legal/privacy" className="underline">politique de confidentialité</Link>.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
