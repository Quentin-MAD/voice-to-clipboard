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
type Bucket = {
  operation: string;
  model: string;
  calls: number;
  cost_eur: number;
  in_tokens: number;
  out_tokens: number;
  avg_cost_eur: number;
};
type RecentEvent = {
  created_at: string;
  operation: string;
  source_type: string;
  user_id: string;
  email: string;
  is_tester: boolean;
  approx_cost_eur: number;
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
  breakdown: {
    day: Bucket[];
    week: Bucket[];
    month: Bucket[];
    year: Bucket[];
    all: Bucket[];
  };
  recent: RecentEvent[];
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
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);



  async function load(silent = false) {
    if (!silent) setLoading(true);
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
    setLastUpdate(new Date());
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading && user) load();
    else if (!authLoading && !user) {
      navigate({ to: "/auth", search: { redirect: "/admin" }, replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!autoRefresh || !user) return;
    const id = setInterval(() => load(true), 15000);
    return () => clearInterval(id);
  }, [autoRefresh, user]);





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
          <div className="flex items-center gap-3">
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                MAJ {lastUpdate.toLocaleTimeString("fr-FR")}
              </span>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto (15s)
            </label>
            <button
              onClick={() => load()}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
            >
              Rafraîchir
            </button>
          </div>

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

        {/* Détail coût IA par opération / modèle */}
        <AiBreakdownPanel breakdown={data.breakdown} />

        {/* Activité IA en temps réel (50 derniers événements) */}
        <RecentAiFeed recent={data.recent} />





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
                <option value="tester">Testeurs</option>

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
                  const losing = !u.is_tester && profit < -0.5;
                  const unlimited = u.subscribed || u.is_tester;
                  return (
                    <tr
                      key={u.user_id}
                      className={
                        u.is_tester
                          ? "border-b bg-blue-500/10 hover:bg-blue-500/20"
                          : losing
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
                        {u.is_tester ? (
                          <span
                            className="rounded bg-blue-500/20 px-2 py-0.5 text-blue-700 dark:text-blue-300"
                            title="Testeur - accès gratuit accordé par l'admin, exclu de la rentabilité"
                          >
                            Testeur
                          </span>
                        ) : (
                          <span
                            className={
                              u.subscribed
                                ? "rounded bg-green-500/20 px-2 py-0.5 text-green-700 dark:text-green-400"
                                : "rounded bg-muted px-2 py-0.5 text-muted-foreground"
                            }
                          >
                            {u.subscribed ? "Abonné" : "Gratuit"}
                          </span>
                        )}
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
                      <td className="p-2 tabular-nums text-green-700 dark:text-green-400">
                        {u.is_tester ? <span className="text-muted-foreground" title="Testeur - non facturé">—</span> : EUR(revenue)}
                      </td>
                      <td className="p-2 tabular-nums font-semibold">
                        {u.is_tester ? (
                          <span className="text-muted-foreground" title="Exclu du calcul de rentabilité">exclu</span>
                        ) : (
                          <span className={profit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                            {EUR(profit)}
                          </span>
                        )}
                      </td>
                      <td className="p-2 font-medium">
                        {unlimited ? <span className="text-green-700 dark:text-green-400" title="Accès illimité (limite quotidienne uniquement)">∞</span> : u.purchased_balance}
                      </td>
                      <td className="p-2 font-medium">
                        {unlimited ? <span className="text-green-700 dark:text-green-400" title="10 lectures vocales/jour, pas de crédits">∞</span> : (u.voice_balance ?? 0)}
                      </td>
                      <td className="p-2">
                        <UserActions
                          userId={u.user_id}
                          currentText={u.purchased_balance}
                          currentVoice={u.voice_balance ?? 0}
                          isTester={u.is_tester}
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
          {" · "}Testeurs : {finance.assumptions.testers_count}
          {firstDate ? ` · Depuis le ${firstDate}` : ""}
        </div>
      </div>

      {/* Cost highlight cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {rows.map((r) => (
          <div key={r.key} className="rounded-md border bg-background p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Coût {r.label}</div>
            <div className="mt-1 text-xl font-bold text-red-500">{EUR(finance.cost[r.key])}</div>
            {Number(finance.costTesters[r.key]) > 0 && (
              <div className="mt-1 text-[10px] text-blue-600 dark:text-blue-400" title="Coût généré par les membres testeurs (exclus de la rentabilité)">
                dont testeurs : {EUR(finance.costTesters[r.key])}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Période</th>
              <th className="p-2" title="Coût IA total, tous membres inclus (testeurs compris)">Coût IA total</th>
              <th className="p-2" title="Coût IA généré par les testeurs (exclu de la rentabilité)">dont testeurs</th>
              <th className="p-2" title="Coût IA utilisé pour la rentabilité (testeurs exclus)">Coût facturable</th>
              <th className="p-2">Revenus</th>
              <th className="p-2" title="Revenus - coût facturable">Bénéfice</th>
              <th className="p-2">Ratio R/C</th>
              <th className="p-2">Marge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cost = finance.cost[r.key];
              const costT = finance.costTesters[r.key];
              const costP = finance.costPaying[r.key];
              const rev = finance.revenue[r.key];
              const prof = finance.profit[r.key];
              return (
                <tr key={r.key} className={`border-b ${r.key === "all" ? "bg-accent/30 font-medium" : ""}`}>
                  <td className="p-2 font-medium">{r.label}</td>
                  <td className="p-2 text-red-500">{EUR(cost)}</td>
                  <td className="p-2 text-blue-600 dark:text-blue-400">{EUR(costT)}</td>
                  <td className="p-2 text-red-500">{EUR(costP)}</td>
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
        Les membres <span className="text-blue-600 dark:text-blue-400">Testeurs</span> ont un accès gratuit accordé manuellement :
        leur coût est affiché mais exclu de la rentabilité (bénéfice / ratio / marge).
      </p>
    </div>
  );
}


function UserActions({
  userId,
  currentText,
  currentVoice,
  isTester,
  onAct,
}: {
  userId: string;
  currentText: number;
  currentVoice: number;
  isTester: boolean;
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
            Statut Testeur (gratuit, hors rentabilité)
          </div>
          {isTester ? (
            <button
              onClick={() => { onAct(userId, "revoke_tester"); setOpen(false); }}
              className="block w-full rounded px-2 py-1 text-left text-xs text-destructive hover:bg-accent"
            >
              Retirer le statut Testeur
            </button>
          ) : (
            <button
              onClick={() => { onAct(userId, "grant_tester"); setOpen(false); }}
              className="block w-full rounded px-2 py-1 text-left text-xs text-blue-600 dark:text-blue-400 hover:bg-accent"
            >
              Accorder le statut Testeur
            </button>
          )}

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

function operationLabel(op: string) {
  switch (op) {
    case "transcription": return "Transcription (F8 - Whisper)";
    case "translation": return "Traduction (F8 - Gemini)";
    case "tts": return "Synthèse vocale (F9 - TTS)";
    case "vision_read": return "Lecture écran (F9 - Vision)";
    default: return op;
  }
}

function AiBreakdownPanel({ breakdown }: { breakdown: AdminData["breakdown"] }) {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year" | "all">("day");
  const periods: Array<{ key: typeof period; label: string }> = [
    { key: "day", label: "24h" },
    { key: "week", label: "7j" },
    { key: "month", label: "30j" },
    { key: "year", label: "1 an" },
    { key: "all", label: "All time" },
  ];
  const rows = breakdown[period] ?? [];
  const totalCost = rows.reduce((s, b) => s + b.cost_eur, 0);
  const totalCalls = rows.reduce((s, b) => s + b.calls, 0);
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Détail coût IA - par opération / modèle</h2>
        <div className="ml-auto flex gap-1">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={
                "rounded px-2 py-1 text-xs " +
                (period === p.key ? "bg-primary text-primary-foreground" : "border hover:bg-accent")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-2 text-xs text-muted-foreground">
        Total période : <span className="font-semibold text-red-500">{EUR(totalCost)}</span> · {totalCalls} appels
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Aucune activité IA sur cette période.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Opération</th>
                <th className="p-2">Modèle</th>
                <th className="p-2 text-right">Appels</th>
                <th className="p-2 text-right">Tokens in</th>
                <th className="p-2 text-right">Tokens out</th>
                <th className="p-2 text-right">Coût moy./appel</th>
                <th className="p-2 text-right">Coût total</th>
                <th className="p-2 text-right">% coût</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const pct = totalCost > 0 ? (b.cost_eur / totalCost) * 100 : 0;
                return (
                  <tr key={`${b.operation}|${b.model}`} className="border-b hover:bg-accent/40">
                    <td className="p-2 font-medium">{operationLabel(b.operation)}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{b.model}</td>
                    <td className="p-2 text-right tabular-nums">{b.calls}</td>
                    <td className="p-2 text-right tabular-nums">{b.in_tokens.toLocaleString("fr-FR")}</td>
                    <td className="p-2 text-right tabular-nums">{b.out_tokens.toLocaleString("fr-FR")}</td>
                    <td className="p-2 text-right tabular-nums">
                      {b.avg_cost_eur.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 5 })}
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold text-red-500">{EUR(b.cost_eur)}</td>
                    <td className="p-2 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecentAiFeed({ recent }: { recent: AdminData["recent"] }) {
  const [filterOp, setFilterOp] = useState<string>("all");
  const ops = Array.from(new Set(recent.map((r) => r.operation)));
  const filtered = recent.filter((r) => filterOp === "all" || r.operation === filterOp);
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
    const rel =
      diffSec < 60 ? `il y a ${diffSec}s`
      : diffSec < 3600 ? `il y a ${Math.round(diffSec / 60)} min`
      : diffSec < 86400 ? `il y a ${Math.round(diffSec / 3600)} h`
      : d.toLocaleString("fr-FR");
    const abs = d.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", day: "2-digit", month: "2-digit" });
    return { rel, abs };
  };
  const sourceLabel = (s: string) => {
    switch (s) {
      case "subscription": return { label: "Abonné", cls: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" };
      case "tester": return { label: "Testeur", cls: "bg-blue-500/20 text-blue-700 dark:text-blue-300" };
      case "free_monthly": return { label: "Gratuit", cls: "bg-slate-500/20 text-slate-700 dark:text-slate-300" };
      case "purchased_credit": return { label: "Crédit texte", cls: "bg-amber-500/20 text-amber-700 dark:text-amber-300" };
      case "voice_purchased": return { label: "Crédit vocal", cls: "bg-purple-500/20 text-purple-700 dark:text-purple-300" };
      default: return { label: s, cls: "bg-muted text-muted-foreground" };
    }
  };
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Activité utilisateurs en direct</h2>
        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
          LIVE
        </span>
        <span className="text-xs text-muted-foreground">({filtered.length} événements)</span>
        <div className="ml-auto flex flex-wrap gap-1">
          <button
            onClick={() => setFilterOp("all")}
            className={"rounded px-2 py-1 text-xs " + (filterOp === "all" ? "bg-primary text-primary-foreground" : "border hover:bg-accent")}
          >
            Tout
          </button>
          {ops.map((op) => (
            <button
              key={op}
              onClick={() => setFilterOp(op)}
              className={"rounded px-2 py-1 text-xs " + (filterOp === op ? "bg-primary text-primary-foreground" : "border hover:bg-accent")}
            >
              {operationLabel(op)}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[32rem] overflow-auto">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun événement.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left">
                <th className="p-2">Quand</th>
                <th className="p-2">Membre</th>
                <th className="p-2">Action</th>
                <th className="p-2">Origine</th>
                <th className="p-2 text-right">Coût est.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const t = fmtTime(r.created_at);
                const src = sourceLabel(r.source_type);
                return (
                  <tr key={`${r.created_at}-${i}`} className="border-b hover:bg-accent/40">
                    <td className="p-2 text-xs">
                      <div>{t.rel}</div>
                      <div className="text-[10px] text-muted-foreground">{t.abs}</div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[240px]" title={r.email}>{r.email || "—"}</span>
                        {r.is_tester && (
                          <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] text-blue-700 dark:text-blue-300">
                            T
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2">{operationLabel(r.operation)}</td>
                    <td className="p-2">
                      <span className={"rounded px-1.5 py-0.5 text-[10px] font-medium " + src.cls}>{src.label}</span>
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs text-muted-foreground">
                      {r.approx_cost_eur > 0
                        ? r.approx_cost_eur.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 5 })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

