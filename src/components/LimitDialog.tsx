import { Crown, ShoppingBag, X } from "lucide-react";

export type LimitKind =
  | "text_daily"
  | "voice_daily"
  | "mobile_daily"
  | "text_credits"
  | "voice_credits"
  | "mobile_credits";

export type LimitBlock = {
  kind: LimitKind;
  detail?: string;
  resetAt?: string | null;
};

const PRICING_URL = "https://talking-translator.com/pricing";

/** Ouvre toujours la page Plans dans le navigateur du système, jamais dans l'app. */
export function openPricingExternal() {
  const bridge = (window as unknown as { voxElectron?: { openExternal?: (url: string) => void } }).voxElectron;
  if (bridge?.openExternal) {
    bridge.openExternal(PRICING_URL);
    return;
  }
  window.open(PRICING_URL, "_blank", "noopener,noreferrer");
}

function content(block: LimitBlock) {
  switch (block.kind) {
    case "text_daily":
      return {
        title: "Limite journalière atteinte",
        body: "Vous avez utilisé toutes vos traductions Texte gratuites du jour. Le compteur repart automatiquement à minuit (heure de Paris).",
        canBuy: true,
        buyLabel: "Acheter des crédits Texte",
      };
    case "voice_daily":
      return {
        title: "Limite journalière de lectures vocales atteinte",
        body: "Vous avez utilisé toutes vos lectures vocales gratuites du jour. Le compteur repart automatiquement à minuit (heure de Paris).",
        canBuy: true,
        buyLabel: "Acheter des crédits Vocaux",
      };
    case "mobile_daily":
      return {
        title: "Limite journalière atteinte",
        body: "Vous avez utilisé toutes vos traductions mobiles gratuites du jour. Le compteur repart automatiquement à minuit (heure de Paris).",
        canBuy: true,
        buyLabel: "Acheter des crédits Mobile",
      };
    case "text_credits":
      return {
        title: "Plus de crédits Texte",
        body: "Vos crédits gratuits du jour et vos crédits Texte achetés sont épuisés.",
        canBuy: true,
        buyLabel: "Acheter des crédits Texte",
      };
    case "voice_credits":
      return {
        title: "Plus de crédits Vocaux",
        body: "Vos lectures vocales gratuites du jour et vos crédits Vocaux achetés sont épuisés.",
        canBuy: true,
        buyLabel: "Acheter des crédits Vocaux",
      };
    case "mobile_credits":
    default:
      return {
        title: "Plus de crédits Mobile",
        body: "Vos traductions mobiles gratuites du jour et vos crédits Mobile achetés sont épuisés.",
        canBuy: true,
        buyLabel: "Acheter des crédits Mobile",
      };
  }
}

const SUB_PITCH = "Avec l'abonnement TalKing (24,99 €/an), vous n'avez plus aucune limite : traductions Texte, lectures vocales et traductions mobiles illimitées, sans plafond journalier ni mensuel.";

export function LimitDialog({
  block,
  onClose,
  variant,
}: {
  block: LimitBlock;
  onClose: () => void;
  variant: "native" | "mobile" | "web";
}) {
  const c = content(block);
  const resetLabel = block.resetAt
    ? new Date(block.resetAt).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })
    : null;

  const go = () => {
    openPricingExternal();
    onClose();
  };

  const body = (
    <>
      <p className="limit-dialog-text">{block.detail ?? c.body}</p>
      {resetLabel && <p className="limit-dialog-sub">Prochaine réinitialisation : {resetLabel}.</p>}
      <p className="limit-dialog-sub">{SUB_PITCH}</p>
    </>
  );

  if (variant === "mobile") {
    return (
      <div className="fixed inset-0 z-[60] bg-black/80 flex items-end" onClick={onClose}>
        <div
          className="w-full rounded-t-3xl border-t border-white/10 bg-[#111] p-5 text-white"
          onClick={(e) => e.stopPropagation()}
          style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-lg font-semibold">{c.title}</div>
            <button onClick={onClose} aria-label="Fermer" className="text-white/50 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-2 space-y-2 text-sm text-white/70 [&_.limit-dialog-text]:text-white/85">
            {body}
          </div>
          <button
            onClick={go}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#3F44D2] py-3 text-sm font-semibold text-white"
          >
            <Crown className="h-4 w-4" /> S'abonner - plus aucune limite
          </button>
          {c.canBuy && (
            <button
              onClick={go}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 py-3 text-sm text-white/80"
            >
              <ShoppingBag className="h-4 w-4" /> {c.buyLabel}
            </button>
          )}
          <button onClick={onClose} className="mt-2 w-full py-2 text-xs text-white/40">
            Fermer
          </button>
        </div>
      </div>
    );
  }

  if (variant === "native") {
    return (
      <div className="native-modal-backdrop" onClick={onClose}>
        <div className="native-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
          <div className="native-modal-head">
            <span className="native-modal-title">{c.title}</span>
          </div>
          <div className="native-modal-body">
            <div className="native-row-desc" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {body}
            </div>
          </div>
          <div className="native-modal-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button onClick={onClose}>Fermer</button>
            {c.canBuy && <button onClick={go}>{c.buyLabel}</button>}
            <button className="native-btn-primary" onClick={go}>S'abonner - plus aucune limite</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-semibold text-foreground">{c.title}</div>
        <div className="mt-2 space-y-2 text-sm text-muted-foreground">{body}</div>
        <button
          onClick={go}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <Crown className="h-4 w-4" /> S'abonner - plus aucune limite
        </button>
        {c.canBuy && (
          <button
            onClick={go}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"
          >
            <ShoppingBag className="h-4 w-4" /> {c.buyLabel}
          </button>
        )}
        <button onClick={onClose} className="mt-2 w-full py-1 text-xs text-muted-foreground">
          Fermer
        </button>
      </div>
    </div>
  );
}

/** Traduit un code d'erreur serveur en blocage affichable, ou null. */
export function limitBlockFromCode(code: string | undefined, detail?: string): LimitBlock | null {
  switch (code) {
    case "daily_limit":
    case "hourly_limit":
      return { kind: "text_daily", detail };
    case "voice_daily_limit":
      return { kind: "voice_daily", detail };
    case "mobile_daily_limit":
      return { kind: "mobile_daily", detail };
    case "no_credits":
      return { kind: "text_credits", detail };
    case "no_voice_credits":
      return { kind: "voice_credits", detail };
    case "mobile_no_credits":
      return { kind: "mobile_credits", detail };
    default:
      return null;
  }
}
