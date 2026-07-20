import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  is_tester: boolean;
  sub_status: string | null;
  current_period_end: string | null;
  purchased_balance: number;
  voice_balance: number;
  translations_total: number;
  translations_30d: number;
  ops_today: number;
  cost_usd_7d: number;
  cost_usd_30d: number;
  cost_usd_total: number;
  revenue_eur_total: number;
  profit_eur_total: number;
};

type Windowed = { day: number; week: number; month: number; year: number; all: number };
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
    ai_credits_all: number;
    views_today: number;
    views_7d: number;
    views_30d: number;
  };
  finance: {
    cost: Windowed;
    costTesters: Windowed;
    costPaying: Windowed;
    revenue: Windowed;
    profit: Windowed;
    ratio: Windowed;
    margin: Windowed;
    assumptions: {
      usd_to_eur: number;
      sub_price_eur_year: number;
      eur_per_purchased_credit: number;
      active_paying_subs: number;
      testers_count: number;
      first_ai_date: string | null;
    };
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
  const navigate = useNavigate();
  const [data, setData] = useState<AdminData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "free" | "subscribed" | "tester">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created" | "cost_total" | "cost_30d" | "ops_today" | "profit">("cost_30d");


  async function load() {
    setLoading(true);
    setErr(null);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      navigate({ to: "/auth", search: { redirect: "/admin" }, replace: true });
      return;
    }
    const res = await authedFetch("/api/admin");
    if (res.status === 401) {
      navigate({ to: "/auth", search: { redirect: "/admin" }, replace: true });
      setLoading(false);
      return;
    }
    if (res.status === 403) {
      setErr("Accès refusé - réservé à l'administrateur");
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
      navigate({ to: "/auth", search: { redirect: "/admin" }, replace: true });
    }
  }, [authLoading, user, navigate]);



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

  const num = (v: unknown) => Number(v) || 0;
  const USD_TO_EUR = data.finance?.assumptions?.usd_to_eur ?? 0.92;

  const users = data.users
    .filter((u) => {
      if (filter === "free" && (u.subscribed || u.is_tester)) return false;
      if (filter === "subscribed" && !u.subscribed) return false;
      if (filter === "tester" && !u.is_tester) return false;
      if (search && !u.email?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })

    .sort((a, b) => {
      switch (sortBy) {
        case "cost_total": return num(b.cost_usd_total) - num(a.cost_usd_total);
        case "cost_30d": return num(b.cost_usd_30d) - num(a.cost_usd_30d);
        case "ops_today": return num(b.ops_today) - num(a.ops_today);
        case "profit": return num(a.profit_eur_total) - num(b.profit_eur_total);
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const maxCredits = Math.max(...data.daily.map((d) => num(d.ai_credits)), 0.0001);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Admin - <span className="notranslate">TalKing</span></h1>
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
            value={num(data.totals.ai_credits_today).toFixed(4)}
            sub={`${num(data.totals.ai_credits_7d).toFixed(4)} / 7j - ${num(data.totals.ai_credits_30d).toFixed(4)} / 30j`}
          />
        </div>

        {/* Finance: coûts / revenus / bénéfice */}
        <FinancePanel finance={data.finance} />



        {/* AI usage chart */}
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-lg font-semibold">Consommation IA - 90 derniers jours (crédits Lovable)</h2>
          <div className="flex h-40 items-end gap-[2px]">
            {data.daily.map((d) => (
              <div
                key={d.date}
                className="flex-1 bg-primary/70 hover:bg-primary transition-colors"
                style={{ height: `${(num(d.ai_credits) / maxCredits) * 100}%` }}
                title={`${d.date} - ${num(d.ai_credits).toFixed(6)} cr - ${d.translations} trad. - ${d.views} visites`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{data.daily[0]?.date}</span>
            <span>Total 90j : {num(data.totals.ai_credits_total).toFixed(4)} cr</span>
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
                    <td className="p-2">{num(d.ai_credits).toFixed(6)}</td>
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
            <div className="ml-auto flex flex-wrap gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded-md border bg-background px-2 py-1 text-sm"
                title="Trier par"
              >
                <option value="cost_30d">Trier : coût 30j ↓</option>
                <option value="cost_total">Trier : coût total ↓</option>
                <option value="ops_today">Trier : ops aujourd'hui ↓</option>
                <option value="profit">Trier : rentabilité ↑ (pires d'abord)</option>
                <option value="created">Trier : plus récents</option>
              </select>
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
          <p className="mb-2 text-xs text-muted-foreground">
            Coûts IA réels par membre (USD converti en € × {USD_TO_EUR}). Rentabilité = revenus payés - coût IA total.
            Une ligne rouge = membre en perte. Ops aujourd'hui &gt; 100 = à surveiller (abus potentiel).
          </p>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Email</th>
                  <th className="p-2">Statut</th>
                  <th className="p-2" title="Opérations IA aujourd'hui (F8 + F9)">Ops 24h</th>
                  <th className="p-2">Trad. 30j</th>
                  <th className="p-2">Trad. total</th>
                  <th className="p-2" title="Coût IA en € sur 7 jours">Coût 7j</th>
                  <th className="p-2" title="Coût IA en € sur 30 jours">Coût 30j</th>
                  <th className="p-2" title="Coût IA total depuis inscription">Coût total</th>
                  <th className="p-2" title="Revenus Paddle live payés par ce membre">Revenus</th>
                  <th className="p-2" title="Revenus - coût IA">Rentabilité</th>
                  <th className="p-2">Crédits texte</th>
                  <th className="p-2">Crédits vocaux</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const cost7 = num(u.cost_usd_7d) * USD_TO_EUR;
                  const cost30 = num(u.cost_usd_30d) * USD_TO_EUR;
                  const costTotal = num(u.cost_usd_total) * USD_TO_EUR;
                  const revenue = num(u.revenue_eur_total);
                  const profit = num(u.profit_eur_total);
                  const abuseToday = num(u.ops_today) > 100;
                  const heavy30 = cost30 > 1;
                  const losing = profit < -0.5;
                  return (
                    <tr
                      key={u.user_id}
                      className={
                        losing
                          ? "border-b bg-red-500/10 hover:bg-red-500/20"
                          : abuseToday
                          ? "border-b bg-amber-500/10 hover:bg-amber-500/20"
                          : "border-b hover:bg-accent/40"
                      }
                    >
                      <td className="p-2">
                        <div>{u.email ?? "—"}</div>
                        <div className="text-[10px] text-muted-foreground">
                          Inscrit {new Date(u.created_at).toLocaleDateString()}
                          {u.current_period_end && ` • fin abo ${new Date(u.current_period_end).toLocaleDateString()}`}
                        </div>
                      </td>
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
                      <td className={"p-2 font-medium " + (abuseToday ? "text-amber-600 dark:text-amber-400" : "")}>
                        {u.ops_today ?? 0}
                      </td>
                      <td className="p-2">{u.translations_30d}</td>
                      <td className="p-2">{u.translations_total}</td>
                      <td className="p-2 tabular-nums">{EUR(cost7)}</td>
                      <td className={"p-2 tabular-nums " + (heavy30 ? "font-semibold text-amber-600 dark:text-amber-400" : "")}>
                        {EUR(cost30)}
                      </td>
                      <td className="p-2 tabular-nums">{EUR(costTotal)}</td>
                      <td className="p-2 tabular-nums text-green-700 dark:text-green-400">{EUR(revenue)}</td>
                      <td className={"p-2 tabular-nums font-semibold " + (profit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                        {EUR(profit)}
                      </td>
                      <td className="p-2 font-medium">
                        {u.subscribed ? <span className="text-green-700 dark:text-green-400" title="Abonné - crédits illimités (limite quotidienne uniquement)">∞</span> : u.purchased_balance}
                      </td>
                      <td className="p-2 font-medium">
                        {u.subscribed ? <span className="text-green-700 dark:text-green-400" title="Abonné - lectures vocales limitées à 10/jour, pas de crédits">∞</span> : (u.voice_balance ?? 0)}
                      </td>
                      <td className="p-2">
                        <UserActions
                          userId={u.user_id}
                          currentText={u.purchased_balance}
                          currentVoice={u.voice_balance ?? 0}
                          onAct={act}
                        />
                      </td>
                    </tr>
                  );
                })}
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

const EUR = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

function FinancePanel({ finance }: { finance: AdminData["finance"] }) {
  const rows: Array<{ label: string; key: "day" | "week" | "month" | "year" | "all" }> = [
    { label: "Jour", key: "day" },
    { label: "Semaine", key: "week" },
    { label: "Mois", key: "month" },
    { label: "Année", key: "year" },
    { label: "All time", key: "all" },
  ];
  const fmtRatio = (r: number | null | undefined) => {
    const v = Number(r);
    return !isFinite(v) ? "∞" : v === 0 ? "—" : `${v.toFixed(2)}×`;
  };
  const fmtMargin = (m: number | null | undefined) => `${(Number(m) || 0).toFixed(1)}%`;
  const firstDate = finance.assumptions.first_ai_date
    ? new Date(finance.assumptions.first_ai_date).toLocaleDateString("fr-FR")
    : null;
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Finances (EUR)</h2>
        <div className="text-xs text-muted-foreground">
          Abo. payants actifs : {finance.assumptions.active_paying_subs}
          {firstDate ? ` · Depuis le ${firstDate}` : ""}
        </div>
      </div>

      {/* Cost highlight cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {rows.map((r) => (
          <div key={r.key} className="rounded-md border bg-background p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Coût {r.label}</div>
            <div className="mt-1 text-xl font-bold text-red-500">{EUR(finance.cost[r.key])}</div>
          </div>
        ))}
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Période</th>
              <th className="p-2">Coût IA</th>
              <th className="p-2">Revenus</th>
              <th className="p-2">Bénéfice</th>
              <th className="p-2">Ratio R/C</th>
              <th className="p-2">Marge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cost = finance.cost[r.key];
              const rev = finance.revenue[r.key];
              const prof = finance.profit[r.key];
              return (
                <tr key={r.key} className={`border-b ${r.key === "all" ? "bg-accent/30 font-medium" : ""}`}>
                  <td className="p-2 font-medium">{r.label}</td>
                  <td className="p-2 text-red-500">{EUR(cost)}</td>
                  <td className="p-2 text-green-500">{EUR(rev)}</td>
                  <td className={`p-2 font-semibold ${prof >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {EUR(prof)}
                  </td>
                  <td className="p-2">{fmtRatio(finance.ratio[r.key])}</td>
                  <td className="p-2">{fmtMargin(finance.margin[r.key])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Coût = usage IA converti USD → EUR (× {finance.assumptions.usd_to_eur}). Revenus = transactions Paddle
        live uniquement (les crédits/abonnements offerts par l'admin ne comptent pas).
      </p>
    </div>
  );
}

function UserActions({
  userId,
  currentText,
  currentVoice,
  onAct,
}: {
  userId: string;
  currentText: number;
  currentVoice: number;
  onAct: (id: string, action: string, amount?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="rounded border px-2 py-0.5 text-xs hover:bg-accent">
        Gérer
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-64 rounded-md border bg-popover p-1 shadow-lg">
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
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Crédits texte (actuel : {currentText})
          </div>
          <button
            onClick={() => {
              const raw = prompt(`Définir le solde EXACT de crédits TEXTE (actuel : ${currentText})`, String(currentText));
              if (raw === null) return;
              const n = Number(raw);
              if (Number.isFinite(n) && n >= 0) onAct(userId, "set_credits", Math.trunc(n));
              setOpen(false);
            }}
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
          >
            Définir solde texte…
          </button>
          <button
            onClick={() => {
              const n = Number(prompt("Ajouter combien de crédits TEXTE ? (négatif pour retirer)", "50"));
              if (Number.isFinite(n) && n !== 0) onAct(userId, "add_credits", n);
              setOpen(false);
            }}
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
          >
            Ajuster crédits texte (±)…
          </button>
          <hr className="my-1" />
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Crédits vocaux (actuel : {currentVoice})
          </div>
          <button
            onClick={() => {
              const raw = prompt(`Définir le solde EXACT de crédits VOCAUX (actuel : ${currentVoice})`, String(currentVoice));
              if (raw === null) return;
              const n = Number(raw);
              if (Number.isFinite(n) && n >= 0) onAct(userId, "set_voice_credits", Math.trunc(n));
              setOpen(false);
            }}
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
          >
            Définir solde vocal…
          </button>
          <button
            onClick={() => {
              const n = Number(prompt("Ajouter combien de crédits VOCALE ? (négatif pour retirer)", "10"));
              if (Number.isFinite(n) && n !== 0) onAct(userId, "add_voice_credits", n);
              setOpen(false);
            }}
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
          >
            Ajuster crédits vocaux (±)…
          </button>
        </div>
      )}
    </div>
  );
}
