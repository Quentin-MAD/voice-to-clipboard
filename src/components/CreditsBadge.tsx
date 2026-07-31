import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, Volume2, Gift, ShoppingBag, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type UserStatus = {
  subscribed: boolean;
  is_tester: boolean;
  free_remaining: number;
  purchased_balance: number;
  voice_balance: number;
  voice_daily_used?: number;
  voice_daily_limit?: number;
  mobile_balance: number;
  mobile_daily_used: number;
  mobile_daily_limit: number;
};

export function useUserStatus() {
  const { user } = useAuth();
  const [status, setStatus] = useState<UserStatus | null>(null);

  useEffect(() => {
    if (!user) { setStatus(null); return; }
    let cancelled = false;
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch("/api/user-status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data) setStatus(data as UserStatus);
      } catch {
        /* ignore */
      }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [user]);

  return status;
}

export function planLabelOf(s: UserStatus): "Abonné" | "Testeur" | "Gratuit+" | "Gratuit" {
  if (s.is_tester) return "Testeur";
  if (s.subscribed) return "Abonné";
  if (s.purchased_balance > 0) return "Gratuit+";
  return "Gratuit";
}

/** Small pill: "Gratuit · 12" — use next to the email. */
export function StatusPill({ variant = "light" }: { variant?: "light" | "dark" }) {
  const status = useUserStatus();
  if (!status) return null;
  const isDark = variant === "dark";
  const base = isDark
    ? "border-white/10 bg-white/5 text-white"
    : "border-border bg-card text-foreground";
  const label = planLabelOf(status);


  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${base}`}
      title={label}
    >
      {(status.subscribed || status.is_tester) && <Crown className="h-3 w-3 text-amber-400" />}
      <span>{label}</span>
    </span>
  );

}

/** Compact header badge (existing usage). */
export function CreditsBadge({ variant = "light" }: { variant?: "light" | "dark" }) {
  const status = useUserStatus();
  const { user } = useAuth();
  if (!user || !status) return null;

  const isDark = variant === "dark";
  const base = isDark
    ? "border-white/10 bg-white/5 text-white"
    : "border-border bg-card text-foreground";
  const muted = isDark ? "text-white/60" : "text-muted-foreground";

  if (status.subscribed || status.is_tester) {
    const label = status.is_tester ? "Testeur" : "Abonné";
    return (
      <Link
        to="/pricing"
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium hover:opacity-90 ${base}`}
        title={label}
      >
        <Crown className="h-3.5 w-3.5 text-amber-400" />
        <span>{label}</span>
      </Link>
    );
  }


  const planLabel = status.purchased_balance > 0 ? "Gratuit+" : "Gratuit";
  return (
    <Link
      to="/pricing"
      className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs hover:opacity-90 ${base}`}
      title={planLabel}
    >
      <span className="font-semibold">{planLabel}</span>
    </Link>
  );
}


/** Framed detail card — used on mobile and inside the profile modal. */
export function CreditsCard({ variant = "light", manageHref = "/pricing", manageLabel = "Gérer / recharger", showMobile = false }: { variant?: "light" | "dark"; manageHref?: string; manageLabel?: string; showMobile?: boolean }) {
  const status = useUserStatus();
  if (!status) return null;

  const isDark = variant === "dark";
  const wrap = isDark
    ? "border-white/10 bg-white/5 text-white"
    : "border-border bg-card text-foreground";
  const rowBg = isDark ? "bg-white/5" : "bg-muted/40";
  const muted = isDark ? "text-white/60" : "text-muted-foreground";
  const label = planLabelOf(status);
  const unlimited = status.subscribed || status.is_tester;

  return (
    <div className={`w-full rounded-2xl border p-4 ${wrap}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {unlimited && <Crown className="h-4 w-4 text-amber-400" />}
          <span className="text-sm font-semibold">{label}</span>
        </div>
        {!unlimited && (
          <Link
            to={manageHref}
            className={`text-[11px] underline-offset-2 hover:underline ${muted}`}
          >
            {manageLabel}
          </Link>
        )}
      </div>

      {showMobile ? (
        unlimited ? (
          <div className="mt-3 space-y-2">
            <div className={`rounded-xl px-3 py-2.5 ${rowBg} text-center`}>
              <div className={`text-[11px] uppercase tracking-wider ${muted}`}>
                {status.is_tester ? "Testeur - traductions mobile" : "Ce mois-ci (abonnement)"}
              </div>
              <div className="mt-0.5 text-2xl font-bold">
                {status.is_tester ? (
                  "∞ illimité"
                ) : (
                  <>
                    {Math.max(0, (status.mobile_daily_limit ?? 500) - (status.mobile_daily_used ?? 0))}
                    <span className={`ml-1 text-xs font-normal ${muted}`}>/ {status.mobile_daily_limit ?? 500} ce mois</span>
                  </>
                )}
              </div>
            </div>
            {(status.mobile_balance ?? 0) > 0 && (
              <div className={`rounded-xl px-3 py-2.5 ${rowBg}`}>
                <div className={`flex items-center gap-1 text-[11px] ${muted}`}>
                  <Smartphone className="h-3 w-3" /> Crédits mobiles achetés
                </div>
                <div className="mt-0.5 text-lg font-bold">{status.mobile_balance ?? 0}</div>
              </div>
            )}
            <p className={`text-[11px] leading-relaxed ${muted}`}>
              {status.is_tester
                ? "Compte testeur : aucune limite sur les traductions mobiles."
                : "Votre abonnement couvre 500 traductions mobiles par mois. Le compteur est mensuel, il repart à zéro chaque début de mois."}
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className={`rounded-xl px-3 py-2.5 ${rowBg}`}>
              <div className={`flex items-center gap-1 text-[11px] ${muted}`}>
                <Gift className="h-3 w-3" /> Gratuits aujourd'hui <span className={muted}>(reset chaque jour)</span>
              </div>
              <div className="mt-0.5 text-lg font-bold">
                {Math.max(0, (status.mobile_daily_limit ?? 35) - (status.mobile_daily_used ?? 0))}
                <span className={`ml-1 text-xs font-normal ${muted}`}>/ {status.mobile_daily_limit ?? 35}</span>
              </div>
            </div>
            <div className={`rounded-xl px-3 py-2.5 ${rowBg}`}>
              <div className={`flex items-center gap-1 text-[11px] ${muted}`}>
                <Smartphone className="h-3 w-3" /> Crédits mobiles achetés
              </div>
              <div className="mt-0.5 text-lg font-bold">{status.mobile_balance ?? 0}</div>
            </div>
            <p className={`text-[11px] leading-relaxed ${muted}`}>
              Les <strong>35 gratuits/jour</strong> sont consommés en priorité et se réinitialisent chaque jour (non cumulables). Les <strong>crédits achetés</strong> ne sont utilisés qu'ensuite et sont permanents, sans expiration.
            </p>
          </div>

        )
      ) : unlimited ? (
        <div className={`mt-3 rounded-xl px-3 py-3 ${rowBg} text-center`}>
          <div className={`text-[11px] uppercase tracking-wider ${muted}`}>Crédits</div>
          <div className="mt-0.5 text-2xl font-bold">∞ illimités</div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className={`rounded-xl px-3 py-2.5 ${rowBg}`}>
            <div className={`flex items-center gap-1 text-[11px] ${muted}`}>
              <Gift className="h-3 w-3" /> Texte gratuit aujourd'hui
            </div>
            <div className="mt-0.5 text-lg font-bold">{status.free_remaining}</div>
            <div className={`text-[11px] ${muted}`}>Limite journalière : 30</div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${rowBg}`}>
            <div className={`flex items-center gap-1 text-[11px] ${muted}`}>
              <ShoppingBag className="h-3 w-3" /> Crédit Texte
            </div>
            <div className="mt-0.5 text-lg font-bold">{status.purchased_balance}</div>
          </div>

          <div className={`rounded-xl px-3 py-2.5 ${rowBg}`}>
            <div className={`flex items-center gap-1 text-[11px] ${muted}`}>
              <Gift className="h-3 w-3" /> Vocal gratuit aujourd'hui
            </div>
            <div className="mt-0.5 text-lg font-bold">
              {Math.max(0, (status.voice_daily_limit ?? 15) - (status.voice_daily_used ?? 0))}
            </div>
            <div className={`text-[11px] ${muted}`}>Limite journalière : 15</div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 ${rowBg}`}>
            <div className={`flex items-center gap-1 text-[11px] ${muted}`}>
              <Volume2 className="h-3 w-3" /> Crédits vocaux (lecture IA)
            </div>
            <div className="mt-0.5 text-lg font-bold">{status.voice_balance}</div>
          </div>
        </div>

      )}

      {!unlimited && !showMobile && (
        <p className={`mt-3 text-[11px] leading-relaxed ${muted}`}>
          Les <strong>crédits gratuits journaliers</strong> se réinitialisent chaque jour (non cumulables) et sont toujours consommés <strong>avant</strong> les crédits achetés. Tous les crédits achetés (texte, vocaux, mobiles) sont permanents et n'expirent jamais.
        </p>
      )}

    </div>
  );
}
