import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { Footer } from "@/components/Footer";
import { useUserStatus } from "@/components/CreditsBadge";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Tarifs - TalKing" },
      { name: "description", content: "Choisissez votre formule : gratuit, pack de crédits ou abonnement illimité 24,99€/an." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const { user, loading: authLoading } = useAuth();
  const userStatus = useUserStatus();
  const { openCheckout, loading } = usePaddleCheckout();
  const navigate = useNavigate();
  const statusLoading = !!user && !userStatus;
  const cannotBuyCredits = !!userStatus && (userStatus.subscribed || userStatus.is_tester);
  const cannotBuySubscription = !!userStatus?.is_tester;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast.success("Merci ! Votre paiement a été enregistré. Les crédits ou l'abonnement seront actifs sous quelques secondes.");
    }
  }, []);

  const buy = async (priceId: string, purchaseType: "credits" | "subscription") => {
    if (authLoading || statusLoading) return;
    if (!user) {
      toast.info("Connectez-vous pour finaliser l'achat en toute sécurité.");
      navigate({ to: "/auth", search: { redirect: `/pricing` } as any });
      return;
    }
    if (userStatus?.is_tester) {
      toast.info("Votre compte Testeur inclut déjà tous les avantages. Aucun achat n'est nécessaire.");
      return;
    }
    if (purchaseType === "credits" && userStatus?.subscribed) {
      toast.info("Votre abonnement inclut déjà les crédits illimités.");
      return;
    }
    if (!user.email) {
      toast.error("Votre compte n'a pas d'adresse email vérifiée. Impossible de procéder au paiement.");
      return;
    }
    try {
      await openCheckout({
        priceId,
        customerEmail: user.email,
        customData: { userId: user.id },
        successUrl: `${window.location.origin}/pricing?checkout=success`,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible d'ouvrir le paiement.");
    }
  };

  const buttonLabel = (defaultLabel: string) => {
    if (authLoading || statusLoading) return "Chargement...";
    if (!user) return "Se connecter pour acheter";
    if (loading) return "Chargement...";
    return defaultLabel;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← Retour à l'accueil</Link>
        <h1 className="mt-6 text-3xl font-bold">Tarifs</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          1 crédit Texte = 1 traduction vocale (F8) : vous parlez, TalKing écrit la traduction dans votre presse-papiers. 1 crédit Vocale = 1 lecture à voix haute (F9) : vous donnez un pseudo, TalKing lit le message du joueur dans votre langue. Limite anti-spam : 150 traductions/jour. Le compte Gratuit est régulé par des limites journalières uniquement (30 texte/jour, 15 vocale/jour).
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Gratuit</h2>
            <div className="my-3 text-3xl font-bold">0 €</div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>✓ 30 traductions Texte/jour (F8)</li>
              <li>✓ 15 lectures Vocale/jour (F9)</li>
              <li>✓ Toutes les langues</li>
              <li>✓ App Windows incluse</li>
            </ul>
            <div className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Formule par défaut
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Pack crédits Texte</h2>
            <div className="my-3 text-3xl font-bold">2,99 €</div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>✓ 75 crédits Texte</li>
              <li>✓ 1 crédit = 1 traduction (F8)</li>
              <li>✓ Cumulables, sans expiration</li>
            </ul>
            <button
              onClick={() => buy("credits_pack_50_onetime", "credits")}
              disabled={loading || authLoading || statusLoading || cannotBuyCredits}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {cannotBuyCredits ? "Inclus dans votre compte" : buttonLabel("Acheter 75 crédits Texte")}
            </button>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Pack crédits Vocaux</h2>
            <div className="my-3 text-3xl font-bold">2,99 €</div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>✓ 45 crédits vocaux</li>
              <li>✓ 1 crédit = 1 lecture d'un message (F9)</li>
              <li>✓ Cumulables, sans expiration</li>
            </ul>
            <button
              onClick={() => buy("voice_pack_10_onetime", "credits")}
              disabled={loading || authLoading || statusLoading || cannotBuyCredits}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {cannotBuyCredits ? "Inclus dans votre compte" : buttonLabel("Acheter 45 crédits vocaux")}
            </button>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Pack crédits Mobile</h2>
            <div className="my-3 text-3xl font-bold">2,99 €</div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>✓ 75 traductions app mobile</li>
              <li>✓ Crédits gratuits consommés en priorités (35/jours)</li>
              <li>✓ Cumulables, sans expiration</li>
            </ul>
            <button
              onClick={() => buy("mobile_credits_pack_75_onetime", "credits")}
              disabled={loading || authLoading || statusLoading || cannotBuyCredits}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {cannotBuyCredits ? "Inclus dans votre compte" : buttonLabel("Acheter 75 crédits Mobile")}
            </button>
          </div>



          <div className="rounded-xl border-2 border-primary bg-card p-5">
            <div className="mb-1 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
              Recommandé
            </div>
            <h2 className="text-lg font-semibold">Abonnement</h2>
            <div className="my-3 text-3xl font-bold">
              24,99 € <span className="text-sm font-normal text-muted-foreground">/an</span>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>✓ Traductions Texte (F8) illimitées*</li>
              <li>✓ 50 lectures Vocale/jour (350/mois)</li>
              <li>✓ 500 traductions Mobile/mois</li>
              <li>✓ Support prioritaire</li>
            </ul>
            <button
              onClick={() =>
                buy(
                  userStatus?.subscribed ? "sub_extend_year_onetime" : "vox_subscription_yearly",
                  "subscription",
                )
              }
              disabled={loading || authLoading || statusLoading || cannotBuySubscription}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {cannotBuySubscription
                ? "Inclus dans votre compte Testeur"
                : buttonLabel(userStatus?.subscribed ? "Acheter une année supplémentaire" : "S'abonner - 24,99 €/an")}
            </button>
            <p className="mt-2 text-[10px] text-muted-foreground">
              *dans la limite de 150 traductions/jour (anti-spam).
              {userStatus?.subscribed && " L'année achetée s'ajoute à la fin de votre période en cours."}
            </p>
          </div>
        </div>

        {!authLoading && !user && (
          <div className="mt-6 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
            <p className="font-medium text-foreground">Connexion requise pour acheter</p>
            <p className="mt-1 text-muted-foreground">
              Pour que vos crédits ou votre abonnement soient correctement attribués à votre compte, vous devez être connecté avant de payer.
              {" "}
              <Link to="/auth" className="text-primary underline">Se connecter ou créer un compte</Link>.
            </p>
          </div>
        )}

        <p className="mt-8 text-xs text-muted-foreground">
          En finalisant votre achat, vous acceptez nos{" "}
          <Link to="/legal/terms" className="underline hover:text-foreground">Conditions Générales de Vente</Link>,
          notre{" "}
          <Link to="/legal/privacy" className="underline hover:text-foreground">Politique de confidentialité</Link>{" "}
          et notre{" "}
          <Link to="/legal/refunds" className="underline hover:text-foreground">Politique de remboursement</Link>.
          Les paiements sont traités de manière sécurisée par <span className="notranslate">Paddle</span> (Merchant of Record), qui gère la TVA applicable dans votre pays.
        </p>
      </div>
      <Footer />
    </div>
  );
}
