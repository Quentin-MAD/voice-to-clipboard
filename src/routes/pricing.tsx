import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Tarifs - TalKing" },
      { name: "description", content: "Choisissez votre formule : gratuit, pack de crédits ou abonnement illimité 29,99€/an." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const { user, loading: authLoading } = useAuth();
  const { openCheckout, loading } = usePaddleCheckout();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast.success("Merci ! Votre paiement a été enregistré. Les crédits ou l'abonnement seront actifs sous quelques secondes.");
    }
  }, []);

  const buy = async (priceId: string) => {
    if (authLoading) return;
    if (!user) {
      toast.info("Connectez-vous pour finaliser l'achat.");
      navigate({ to: "/auth" });
      return;
    }
    try {
      await openCheckout({
        priceId,
        customerEmail: user.email ?? undefined,
        customData: { userId: user.id },
        successUrl: `${window.location.origin}/pricing?checkout=success`,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible d'ouvrir le paiement.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← Retour à l'accueil</Link>
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
              Formule par défaut
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
              onClick={() => buy("credits_pack_50_onetime")}
              disabled={loading || authLoading}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Chargement..." : "Acheter 50 crédits"}
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
              onClick={() => buy("vox_subscription_yearly")}
              disabled={loading || authLoading}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Chargement..." : "S'abonner - 20 €/an"}
            </button>
            <p className="mt-2 text-[10px] text-muted-foreground">
              *dans la limite de 50 traductions/heure (anti-spam).
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
