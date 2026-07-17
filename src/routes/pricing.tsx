import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Tarifs — VoxTranslate" },
      { name: "description", content: "Choisissez votre formule : gratuit, pack de crédits ou abonnement illimité 20€/an." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← Retour à l'app</Link>
        <h1 className="mt-6 text-3xl font-bold">Tarifs</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          1 crédit = 1 traduction. Anti-spam : max 50 traductions/heure pour tout le monde.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Gratuit</h2>
            <div className="my-3 text-3xl font-bold">0 €</div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>✓ 20 traductions/mois</li>
              <li>✓ Toutes les langues</li>
              <li>✓ App Windows incluse</li>
            </ul>
            <div className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Formule actuelle
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Pack crédits</h2>
            <div className="my-3 text-3xl font-bold">2,99 €</div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>✓ 50 crédits</li>
              <li>✓ Cumulables (jamais expirés)</li>
              <li>✓ Paiement unique</li>
            </ul>
            <button
              disabled
              className="mt-4 w-full rounded-lg bg-primary/50 px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Bientôt — paiement en préparation
            </button>
          </div>

          <div className="rounded-xl border-2 border-primary bg-card p-5">
            <div className="mb-1 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
              Recommandé
            </div>
            <h2 className="text-lg font-semibold">Abonnement</h2>
            <div className="my-3 text-3xl font-bold">
              20 € <span className="text-sm font-normal text-muted-foreground">/an</span>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>✓ Traductions illimitées*</li>
              <li>✓ Support prioritaire</li>
              <li>✓ Économie vs packs</li>
            </ul>
            <button
              disabled
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-60"
            >
              Bientôt — paiement en préparation
            </button>
            <p className="mt-2 text-[10px] text-muted-foreground">
              *dans la limite de 50 traductions/heure (anti-spam).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
