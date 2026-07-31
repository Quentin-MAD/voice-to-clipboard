import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { toast } from "sonner";

type SubInfo = {
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  is_active?: boolean;
  has_subscription: boolean;
};

function formatRemaining(endIso: string): string {
  const ms = new Date(endIso).getTime() - Date.now();
  if (ms <= 0) return "expiré";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} j ${hours} h ${minutes} min`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

/** Subscription status + remaining time + cancel at period end. */
export function SubscriptionPanel() {
  const [info, setInfo] = useState<SubInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const environment = getPaddleEnvironment();
      const res = await fetch(`/api/subscription?environment=${environment}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Chargement impossible");
      setInfo((await res.json()) as SubInfo);
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const iv = setInterval(() => tick((v) => v + 1), 60000);
    return () => clearInterval(iv);
  }, []);

  if (loading) {
    return <div className="w-full rounded-lg border border-border bg-card p-4 text-sm text-black">Chargement de l'abonnement...</div>;
  }

  if (!info || !info.has_subscription) return null;

  const active = ["active", "trialing", "past_due"].includes(info.status);
  const end = info.current_period_end;

  const cancel = async () => {
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Session expirée. Reconnectez-vous.");
      const res = await fetch(`/api/subscription?environment=${getPaddleEnvironment()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erreur");
      toast.success("Abonnement annulé - actif jusqu'à la fin de la période payée");
      setConfirm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full rounded-lg border border-border bg-card p-4 text-black">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Abonnement</span>
        <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[11px]">
          {info.cancel_at_period_end ? "Annulé" : active ? "Actif" : info.status}
        </span>
      </div>

      {end && (
        <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {info.cancel_at_period_end ? "Accès conservé encore" : "Temps restant avant renouvellement"}
          </div>
          <div className="mt-0.5 text-lg font-bold">{formatRemaining(end)}</div>
          <div className="text-[11px] text-muted-foreground">
            {info.cancel_at_period_end ? "Fin de l'accès le " : "Prochain prélèvement le "}
            {new Date(end).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </div>
        </div>
      )}

      {info.cancel_at_period_end ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Votre abonnement ne sera pas renouvelé. Vous conservez tous les avantages jusqu'à la fin
          de la période déjà payée, puis votre compte repassera automatiquement en offre gratuite.
        </p>
      ) : confirm ? (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-black">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>
              L'annulation est <strong>non remboursable</strong>. Votre abonnement reste actif
              jusqu'à la fin de la période déjà payée, puis votre compte redevient gratuit
              (non abonné).
            </span>
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-black hover:bg-accent"
            >
              Retour
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={cancel}
              className="rounded-md border border-destructive bg-background px-3 py-1.5 text-xs font-medium text-black hover:bg-accent disabled:opacity-60"
            >
              {busy ? "…" : "Confirmer l'annulation"}
            </button>
          </div>
        </div>
      ) : (
        active && (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="mt-3 w-full rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs font-medium text-black hover:bg-accent"
          >
            Annuler mon abonnement
          </button>
        )
      )}
    </div>
  );
}
