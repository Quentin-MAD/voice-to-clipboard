import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin - TalKing" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

type AdminUser = {
  user_id: string;
  email: string;
  created_at: string;
  subscribed: boolean;
  sub_status: string | null;
  current_period_end: string | null;
  purchased_balance: number;
  translations_total: number;
  translations_30d: number;
};

type AdminData = {
  users: AdminUser[];
  daily: Array<{ date: string; views: number; translations: number; ai_credits: number }>;
  totals: {
    users: number;
    subscribed: number;
    ai_credits_total: number;
    ai_credits_today: number;
    ai_credits_7d: number;
    ai_credits_30d: number;
    views_today: number;
    views_7d: number;
    views_30d: number;
  };
};

async function authedFetch(url: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<AdminData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "free" | "subscribed">("all");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    const res = await authedFetch("/api/admin");
    if (res.status === 401) {
      setErr("Non authentifié");
      setLoading(false);
      return;
    }
    if (res.status === 403) {
      setErr("Accès refusé");
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setErr(`Erreur (${res.status})`);
      setLoading(false);
      return;
    }
    setData((await res.json()) as AdminData);
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading && user) load();
    else if (!authLoading && !user) {
      setErr("Non authentifié");
      setLoading(false);
    }
  }, [authLoading, user]);

  async function act(user_id: string, action: string, amount?: number) {
    const res = await authedFetch("/api/admin", {
      method: "POST",
      body: JSON.stringify({ user_id, action, amount }),
    });
    if (!res.ok) {
      toast.error("Action échouée");
      return;
    }
    toast.success("OK");
    load();
  }

  if (authLoading || loading) {
    return <div className="p-8 text-center text-muted-foreground">Chargement…</div>;
  }
  if (err) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="mt-4 text-destructive">{err}</p>
          {!user && (
            <Link to="/auth" className="mt-4 inline-block underline">
              Se connecter
            </Link>
          )}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const users = data.users.filter((u) => {
    if (filter === "free" && u.subscribed) return false;
    if (filter === "subscribed" && !u.subscribed) return false;
    if (search && !u.email?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const maxCredits = Math.max(...data.daily.map((d) => d.ai_credits), 0.0001);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Admin - TalKing</h1>
          <button
            onClick={load}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
          >
            Rafraîchir
          </button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Utilisateurs" value={data.totals.users} />
          <Stat label="Abonnés" value={data.totals.subscribed} />
          <Stat label="Visites (24h)" value={data.totals.views_today} sub={`${data.totals.views_7d} / 7j - ${data.totals.views_30d} / 30j`} />
          <Stat
            label="Crédits IA (24h)"
            value={data.totals.ai_credits_today.toFixed(4)}
            sub={`${data.totals.ai_credits_7d.toFixed(4)} / 7j - ${data.totals.ai_credits_30d.toFixed(4)} / 30j`}
          />
        </div>

        {/* AI usage chart */}
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-lg font-semibold">Consommation IA - 90 derniers jours (crédits Lovable)</h2>
          <div className="flex h-40 items-end gap-[2px]">
            {data.daily.map((d) => (
              <div
                key={d.date}
                className="flex-1 bg-primary/70 hover:bg-primary transition-colors"
                style={{ height: `${(d.ai_credits / maxCredits) * 100}%` }}
                title={`${d.date} - ${d.ai_credits.toFixed(6)} cr - ${d.translations} trad. - ${d.views} visites`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{data.daily[0]?.date}</span>
            <span>Total 90j : {data.totals.ai_credits_total.toFixed(4)} cr</span>
            <span>{data.daily[data.daily.length - 1]?.date}</span>
          </div>
        </div>

        {/* Daily table */}
        <details className="rounded-lg border bg-card p-4">
          <summary className="cursor-pointer font-semibold">Historique journalier détaillé</summary>
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Visites</th>
                  <th className="p-2">Traductions</th>
                  <th className="p-2">Crédits IA</th>
                </tr>
              </thead>
              <tbody>
                {[...data.daily].reverse().map((d) => (
                  <tr key={d.date} className="border-b">
                    <td className="p-2 font-mono">{d.date}</td>
                    <td className="p-2">{d.views}</td>
                    <td className="p-2">{d.translations}</td>
                    <td className="p-2">{d.ai_credits.toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {/* Users */}
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Utilisateurs ({users.length})</h2>
            <div className="ml-auto flex gap-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              >
                <option value="all">Tous</option>
                <option value="free">Gratuits</option>
                <option value="subscribed">Abonnés</option>
              </select>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Recherche email…"
                className="rounded-md border bg-background px-2 py-1 text-sm"
              />
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Email</th>
                  <th className="p-2">Inscrit</th>
                  <th className="p-2">Statut</th>
                  <th className="p-2">Fin abo.</th>
                  <th className="p-2">Crédits</th>
                  <th className="p-2">Trad. 30j</th>
                  <th className="p-2">Trad. total</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} className="border-b hover:bg-accent/40">
                    <td className="p-2">{u.email ?? "—"}</td>
                    <td className="p-2">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="p-2">
                      <span
                        className={
                          u.subscribed
                            ? "rounded bg-green-500/20 px-2 py-0.5 text-green-700 dark:text-green-400"
                            : "rounded bg-muted px-2 py-0.5 text-muted-foreground"
                        }
                      >
                        {u.subscribed ? "Abonné" : "Gratuit"}
                      </span>
                    </td>
                    <td className="p-2 text-xs">
                      {u.current_period_end ? new Date(u.current_period_end).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-2">{u.purchased_balance}</td>
                    <td className="p-2">{u.translations_30d}</td>
                    <td className="p-2">{u.translations_total}</td>
                    <td className="p-2">
                      <UserActions userId={u.user_id} onAct={act} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function UserActions({ userId, onAct }: { userId: string; onAct: (id: string, action: string, amount?: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="rounded border px-2 py-0.5 text-xs hover:bg-accent">
        Gérer
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border bg-popover p-1 shadow-lg">
          <button
            onClick={() => { onAct(userId, "grant_lifetime"); setOpen(false); }}
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
          >
            Accorder Lifetime
          </button>
          <button
            onClick={() => { onAct(userId, "grant_year"); setOpen(false); }}
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
          >
            Accorder 1 an
          </button>
          <button
            onClick={() => { onAct(userId, "cancel"); setOpen(false); }}
            className="block w-full rounded px-2 py-1 text-left text-xs text-destructive hover:bg-accent"
          >
            Annuler l'abonnement
          </button>
          <hr className="my-1" />
          <button
            onClick={() => {
              const n = Number(prompt("Ajouter combien de crédits ? (négatif pour retirer)", "50"));
              if (Number.isFinite(n) && n !== 0) onAct(userId, "add_credits", n);
              setOpen(false);
            }}
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
          >
            Ajuster crédits…
          </button>
        </div>
      )}
    </div>
  );
}
