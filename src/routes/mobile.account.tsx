import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Crown, ShoppingBag, Settings2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { CreditsCard, useUserStatus } from "@/components/CreditsBadge";
import { supabase } from "@/integrations/supabase/client";
import { MobileAuthPanel } from "@/components/MobileAuthPanel";
import { useAppearance } from "@/hooks/use-appearance";

export const Route = createFileRoute("/mobile/account")({
  head: () => ({
    meta: [
      { title: "Mon compte - TalKing Mobile" },
      { name: "description", content: "Gérez votre compte, rechargez vos crédits mobiles et votre abonnement TalKing depuis votre téléphone." },
    ],
  }),
  component: MobileAccountPage,
});

function MobileAccountPage() {
  const { user, loading: authLoading } = useAuth();
  const userStatus = useUserStatus();
  const { openCheckout, loading } = usePaddleCheckout();
  const navigate = useNavigate();
  const { config: skin } = useAppearance("mobile");
  const statusLoading = !!user && !userStatus;
  const isTester = !!userStatus?.is_tester;
  const isSubscribed = !!userStatus?.subscribed;
  const unlimited = isTester || isSubscribed;
  const [checkoutPriceId, setCheckoutPriceId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast.success("Merci ! Votre paiement a été enregistré. Vos crédits arrivent dans quelques secondes.");
    }
  }, []);

  const buy = async (priceId: string) => {
    if (!user?.email) {
      toast.error("Adresse email introuvable.");
      return;
    }
    if (isTester) {
      toast.info("Votre compte Testeur inclut déjà tous les avantages.");
      return;
    }
    if (unlimited && priceId !== "sub_extend_year_onetime" && priceId !== "vox_subscription_yearly") {
      toast.info("Votre abonnement inclut déjà ces crédits.");
      return;
    }
    setCheckoutPriceId(priceId);
  };

  useEffect(() => {
    if (!checkoutPriceId || !user?.email) return;
    let cancelled = false;
    const openInlineCheckout = async () => {
      // Attend que la cible soit réellement montée avant de demander à Paddle
      // d'y intégrer le paiement. Aucun nouvel onglet ni overlay système.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelled || !document.querySelector(".mobile-checkout-container")) return;
      try {
        window.Paddle?.Checkout?.close?.();
        await openCheckout({
          priceId: checkoutPriceId,
          customerEmail: user.email,
          customData: { userId: user.id },
          // Après paiement, on revient directement dans l'application mobile.
          successUrl: `${window.location.origin}/mobile?launch=app&checkout=success`,
          displayMode: "inline",
          frameTarget: "mobile-checkout-container",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Impossible d'ouvrir le paiement.";
        toast.error(message);
        setCheckoutPriceId(null);
      }
    };
    void openInlineCheckout();
    return () => { cancelled = true; };
  }, [checkoutPriceId, openCheckout, user?.email, user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/mobile" });
  };

  const btn = (label: string) => (loading ? "Chargement..." : label);

  if (!authLoading && !user) {
    return <MobileAuthPanel logoUrl={skin.logoUrl} brand={skin.texts.brand} />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-md px-5 py-6">
        <button
          onClick={() => navigate({ to: "/mobile" })}
          className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à l'app
        </button>

        <h1 className="mt-4 text-2xl font-bold">Mon compte</h1>
        <p className="mt-1 text-sm text-white/60">{user?.email}</p>

        <div className="mt-5">
          <CreditsCard variant="dark" manageHref="/mobile/account" showMobile />
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-white/60">Recharger</h2>

        {checkoutPriceId && (
          <section className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3" aria-label="Paiement sécurisé">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Paiement sécurisé</span>
              <button
                type="button"
                onClick={() => {
                  window.Paddle?.Checkout?.close?.();
                  setCheckoutPriceId(null);
                }}
                className="text-xs text-white/60 underline-offset-2 hover:underline"
              >
                Fermer
              </button>
            </div>
            <div id="mobile-checkout-container" className="mobile-checkout-container min-h-[480px] w-full overflow-hidden" />
          </section>
        )}

        {!checkoutPriceId && !unlimited && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-emerald-400" />
              <span className="font-semibold">Pack crédits Mobile</span>
            </div>
            <div className="mt-2 text-2xl font-bold">2,99 €</div>
            <ul className="mt-1 space-y-0.5 text-sm text-white/70">
              <li>✓ 75 dialogues app mobile</li>
              <li>✓ 1 crédit = 1 dialogue (2 phrases)</li>
              <li>✓ Cumulables, sans expiration</li>
            </ul>
            <button
              onClick={() => buy("mobile_credits_pack_75_onetime")}
              disabled={loading || authLoading || statusLoading}
              className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
            >
              {btn("Acheter 75 crédits Mobile")}
            </button>
          </div>
        )}

        {!checkoutPriceId && !isTester && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-400" />
              <span className="font-semibold">Abonnement illimité</span>
            </div>
            <div className="mt-2 text-2xl font-bold">24,99 € <span className="text-sm font-normal text-white/60">/ an</span></div>
            <ul className="mt-1 space-y-0.5 text-sm text-white/70">
              <li>✓ Application mobile en illimité (dialogues sans limite)</li>
              <li>✓ Application Windows en illimité (traductions F8 + lectures IA F9)</li>
              <li>✓ Aucune limite journalière ni mensuelle</li>
              <li>✓ Prioritaire sur les nouveautés</li>
            </ul>

            <button
              onClick={() => buy(isSubscribed ? "sub_extend_year_onetime" : "vox_subscription_yearly")}
              disabled={loading || authLoading || statusLoading}
              className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
            >
              {btn(isSubscribed ? "Acheter une année supplémentaire" : "S'abonner")}
            </button>
            {isSubscribed && (
              <p className="mt-2 text-[11px] text-white/50">
                L'année achetée s'ajoute à la fin de votre période en cours.
              </p>
            )}
          </div>
        )}

        {isTester && (
          <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            Votre compte Testeur inclut déjà tous les avantages : aucun achat n'est nécessaire.
          </p>
        )}

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-white/60">Compte</h2>
        <div className="mt-3 space-y-2">
          <button
            onClick={signOut}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10"
          >
            <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Se déconnecter</span>
            <span className="text-white/40">→</span>
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-white/40">
          Paiements sécurisés Paddle. TVA incluse. Consultez les <a href="/legal/terms" className="underline">CGV</a>, la <a href="/legal/privacy" className="underline">politique de confidentialité</a> et notre <a href="/legal/refunds" className="underline">politique de remboursement</a>.
        </p>
      </div>
    </div>
  );
}
