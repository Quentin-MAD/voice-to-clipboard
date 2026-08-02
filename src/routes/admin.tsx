import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppearanceEditor } from "@/components/AppearanceEditor";


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
  sub_environment: string | null;
  access_origin: "paid" | "granted" | "none";
  is_paid_subscriber: boolean;
  current_period_end: string | null;
  purchased_balance: number;
  voice_balance: number;
  mobile_balance?: number;
  translations_total: number;
  translations_30d: number;
  ops_today: number;
  cost_usd_7d: number;
  cost_usd_30d: number;
  cost_usd_total: number;
  revenue_eur_total: number;
  revenue_eur_test?: number;
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
  cost_known?: boolean;
};
type DataHealth = {
  mode: "live" | "test" | "all";
  total_users: number;
  tester_users: number;
  real_users: number;
  paid_subscribers: number;
  granted_access: number;
  live_transactions: number;
  test_transactions: number;
  ai_rows_total: number;
  ai_rows_unattributed: number;
  cost_coverage_ratio: number;
  unattributed_cost_eur: number;
  active_sub_rows_by_env: Record<string, number>;
};
type AdminData = {
  mode: "live" | "test" | "all";
  users: AdminUser[];
  daily: Array<{ date: string; views: number; translations: number; ai_credits: number }>;
  totals: {
    users: number;
    subscribed: number;
    granted: number;
    testers: number;
    ai_credits_total: number;
    ai_credits_today: number;
    ai_credits_7d: number;
    ai_credits_30d: number;
    ai_credits_all: number;
    views_today: number;
    views_7d: number;
    views_30d: number;
  };
  dataHealth: DataHealth;
  finance: {
    cost: Windowed;
    costTesters: Windowed;
    costUnattributed: Windowed;
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
  const [filter, setFilter] = useState<"all" | "free" | "paid" | "granted" | "tester">("all");
  const [envMode, setEnvMode] = useState<"live" | "test" | "all">("live");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created" | "cost_total" | "cost_30d" | "ops_today" | "profit">("cost_30d");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [tab, setTab] = useState<"overview" | "members" | "costs" | "activity" | "appearance" | "emails">("overview");
  const [selected, setSelected] = useState<string | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setErr(null);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      navigate({ to: "/auth", search: { redirect: "/admin" }, replace: true });
      return;
    }
    const res = await authedFetch(`/api/admin?env=${envMode}`);
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

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!authLoading && userId) load();
    else if (!authLoading && !userId) {
      navigate({ to: "/auth", search: { redirect: "/admin" }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userId, envMode]);

  useEffect(() => {
    if (!autoRefresh || !userId) return;
    const id = setInterval(() => load(true), 15000);
    return () => clearInterval(id);
  }, [autoRefresh, userId]);

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
    await load(true);
  }

  // Keep the dashboard mounted once loaded: a refresh must not unmount the
  // appearance editor (and its preview iframes).
  if ((authLoading || loading) && !data) {
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
      if (filter === "paid" && !u.is_paid_subscriber) return false;
      if (filter === "granted" && u.access_origin !== "granted") return false;
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

  const selectedUser = data.users.find((u) => u.user_id === selected) ?? null;
  const maxCredits = Math.max(...data.daily.map((d) => num(d.ai_credits)), 0.0001);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
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

        {/* Onglets */}
        <div className="flex flex-wrap gap-2 border-b">
          {([
            { k: "overview", label: "Vue d'ensemble" },
            { k: "members", label: `Membres (${data.totals.users})` },
            { k: "costs", label: "Coûts IA" },
            { k: "activity", label: "Activité" },
            { k: "appearance", label: "Apparence des apps" },
            { k: "emails", label: "Emails" },
          ] as const).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={
                "px-4 py-2 text-sm font-semibold -mb-px border-b-2 " +
                (tab === t.k
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "emails" && <EmailPreviewPanel />}
        {tab === "appearance" && <AppearanceEditor />}

        {tab === "overview" && (
          <>
            {/* Filtre environnement */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
              <span className="text-sm font-semibold">Données affichées :</span>
              {([
                { k: "live", label: "Réel (live)" },
                { k: "test", label: "Test (sandbox)" },
                { k: "all", label: "Tout" },
              ] as const).map((m) => (
                <button
                  key={m.k}
                  onClick={() => setEnvMode(m.k)}
                  className={
                    "rounded-md border px-3 py-1 text-sm " +
                    (envMode === m.k ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-accent")
                  }
                >
                  {m.label}
                </button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">
                Le filtre s'applique aux revenus et paiements. Les coûts IA sont toujours réels.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <Stat label="Utilisateurs" value={data.totals.users} sub={`${data.dataHealth.real_users} hors testeurs`} />
              <Stat label="Abonnés payants" value={data.totals.subscribed} sub="Paiement Paddle live vérifié" />
              <Stat label="Accès offerts" value={data.totals.granted} sub="Lifetime / 1 an accordés par l'admin" />
              <Stat label="Visites (24h)" value={data.totals.views_today} sub={`${data.totals.views_7d} / 7j - ${data.totals.views_30d} / 30j`} />
              <Stat
                label="Crédits IA (24h)"
                value={num(data.totals.ai_credits_today).toFixed(4)}
                sub={`${num(data.totals.ai_credits_7d).toFixed(4)} / 7j - ${num(data.totals.ai_credits_30d).toFixed(4)} / 30j`}
              />
            </div>

            <DataHealthBanner health={data.dataHealth} />
            <FinancePanel finance={data.finance} />

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
          </>
        )}

        {tab === "costs" && (
          <>
            <AiBreakdownPanel breakdown={data.breakdown} />
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
          </>
        )}

        {tab === "activity" && <RecentAiFeed recent={data.recent} />}

        {tab === "members" && (
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Membres ({users.length})</h2>
              <div className="ml-auto flex flex-wrap gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                >
                  <option value="cost_30d">Trier : coût 30j ↓</option>
                  <option value="cost_total">Trier : coût total ↓</option>
                  <option value="ops_today">Trier : ops aujourd'hui ↓</option>
                  <option value="profit">Trier : rentabilité ↑</option>
                  <option value="created">Trier : plus récents</option>
                </select>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                >
                  <option value="all">Tous</option>
                  <option value="free">Gratuits</option>
                  <option value="paid">Abonnés payants</option>
                  <option value="granted">Accès offerts</option>
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
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Membre</th>
                    <th className="p-2">Statut</th>
                    <th className="p-2 text-center" title="Crédits texte / vocaux / mobile">Crédits (T / V / M)</th>
                    <th className="p-2 text-right">Ops 24h</th>
                    <th className="p-2 text-right">Coût 30j</th>
                    <th className="p-2 text-right">Coût total</th>
                    <th className="p-2 text-right">Rentabilité</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const cost30 = num(u.cost_usd_30d) * USD_TO_EUR;
                    const costTotal = num(u.cost_usd_total) * USD_TO_EUR;
                    const profit = num(u.revenue_eur_total) - costTotal;
                    const abuseToday = num(u.ops_today) > 100;
                    const unlimited = u.subscribed || u.is_tester;
                    return (
                      <tr
                        key={u.user_id}
                        className={
                          "border-b cursor-pointer " +
                          (u.is_tester
                            ? "bg-blue-500/5 hover:bg-blue-500/15"
                            : profit < -0.5
                            ? "bg-red-500/5 hover:bg-red-500/15"
                            : "hover:bg-accent/40")
                        }
                        onClick={() => setSelected(u.user_id)}
                      >
                        <td className="p-2">
                          <div className="font-medium">{u.email ?? "—"}</div>
                          <div className="text-[10px] text-muted-foreground">
                            Inscrit {new Date(u.created_at).toLocaleDateString("fr-FR")} · {u.translations_total} trad.
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            <StatusBadges u={u} />
                          </div>
                        </td>
                        <td className="p-2 text-center font-semibold tabular-nums">
                          {unlimited ? <span className="text-green-600">∞</span> : u.purchased_balance}
                          {" / "}
                          {u.voice_balance ?? 0}
                          {" / "}
                          {u.mobile_balance ?? 0}
                        </td>
                        <td className={"p-2 text-right tabular-nums " + (abuseToday ? "font-semibold text-amber-600" : "")}>
                          {u.ops_today ?? 0}
                        </td>
                        <td className="p-2 text-right tabular-nums">{EURPrecise(cost30)}</td>
                        <td className="p-2 text-right tabular-nums">{EURPrecise(costTotal)}</td>
                        <td className="p-2 text-right tabular-nums font-semibold">
                          <span className={profit >= 0 ? "text-green-600" : "text-red-500"}>{EURPrecise(profit)}</span>
                        </td>
                        <td className="p-2 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelected(u.user_id); }}
                            className="rounded-md border px-3 py-1 text-xs font-semibold hover:bg-accent"
                          >
                            Gérer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Clique sur une ligne pour ouvrir la fiche complète du membre (crédits, quotas du jour, paiements, actions).
            </p>
          </div>
        )}
      </div>

      {selectedUser && (
        <MemberDrawer user={selectedUser} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}


function DataHealthBanner({ health }: { health: DataHealth }) {
  const coverage = Math.round((Number(health.cost_coverage_ratio) || 0) * 100);
  const modeLabel = health.mode === "live" ? "Réel (live)" : health.mode === "test" ? "Test (sandbox)" : "Tout";
  const warn = coverage < 100 || (health.mode === "live" && health.test_transactions > 0);
  return (
    <div className={"rounded-lg border p-4 text-sm " + (warn ? "border-amber-500/50 bg-amber-500/5" : "bg-card")}>
      <div className="mb-2 font-semibold">État des données - mode {modeLabel}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">Membres</div>
          <div className="font-medium">
            {health.total_users} au total · {health.real_users} réels · {health.tester_users} testeurs
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Accès actifs</div>
          <div className="font-medium">
            {health.paid_subscribers} payants · {health.granted_access} offerts
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Transactions</div>
          <div className="font-medium">
            {health.live_transactions} live · {health.test_transactions} test
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Couverture des coûts</div>
          <div className={"font-medium " + (coverage < 100 ? "text-amber-600 dark:text-amber-400" : "")}>
            {coverage}% ({health.ai_rows_unattributed} lignes sans membre)
          </div>
        </div>
      </div>
      {health.unattributed_cost_eur > 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Coûts non attribués (anciennes écritures sans membre) :{" "}
          {EURPrecise(health.unattributed_cost_eur)}. Ils sont comptés dans le coût global mais dans aucune fiche membre.
        </p>
      )}
      {health.mode === "live" && health.test_transactions > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {health.test_transactions} paiement(s) en environnement de test sont exclus des revenus affichés.
        </p>
      )}
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

const EURPrecise = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 });

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
              <div className="mt-1 text-[10px] text-blue-600 dark:text-blue-400" title="Coût généré par les membres testeurs (inclus dans la rentabilité)">
                dont testeurs : {EUR(finance.costTesters[r.key])}
              </div>
            )}
            {Number(finance.costUnattributed?.[r.key]) > 0 && (
              <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400" title="Anciennes écritures de coût sans membre rattaché">
                dont non attribué : {EUR(finance.costUnattributed[r.key])}
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
              <th className="p-2" title="Coût IA généré par les testeurs (inclus dans la rentabilité)">dont testeurs</th>

              <th className="p-2">Revenus</th>
              <th className="p-2" title="Revenus - coût IA total">Bénéfice</th>
              <th className="p-2">Ratio R/C</th>
              <th className="p-2">Marge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cost = finance.cost[r.key];
              const costT = finance.costTesters[r.key];
              const rev = finance.revenue[r.key];
              const prof = finance.profit[r.key];
              return (
                <tr key={r.key} className={`border-b ${r.key === "all" ? "bg-accent/30 font-medium" : ""}`}>
                  <td className="p-2 font-medium">{r.label}</td>
                  <td className="p-2 text-red-500">{EUR(cost)}</td>
                  <td className="p-2 text-blue-600 dark:text-blue-400">{EUR(costT)}</td>
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
        Le coût des membres <span className="text-blue-600 dark:text-blue-400">Testeurs</span> est désormais
        inclus dans la rentabilité (bénéfice / ratio / marge), et affiché à part pour information.
      </p>

    </div>
  );
}


type MemberDetail = {
  profile: { id: string; email: string | null; created_at: string } | null;
  status: {
    subscribed: boolean;
    is_tester: boolean;
    has_purchased: boolean;
    free_remaining: number;
    purchased_balance: number;
    daily_used: number;
    daily_limit: number;
    daily_reset_at: string;
    voice_balance: number;
    voice_daily_used: number;
    voice_daily_limit: number;
    mobile_balance: number;
    mobile_daily_used: number;
    mobile_daily_limit: number;
  } | null;
  wallet: { purchased_balance: number; voice_balance: number; mobile_balance: number } | null;
  transactions: Array<{ created_at: string; amount_eur: number; environment: string; kind: string; paddle_transaction_id: string }>;
  activity: Array<{ created_at: string; source_type: string; operation_type: string }>;
  cost_eur: { day: number; week: number; month: number; all: number };
};

function Gauge({ label, used, limit, hint }: { label: string; used: number; limit: number; hint?: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const danger = pct >= 90;
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={"text-sm font-semibold tabular-nums " + (danger ? "text-red-500" : "")}>
          {used} / {limit}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className={"h-full " + (danger ? "bg-red-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function BigCredit({ label, value, unlimited, tone }: { label: string; value: number; unlimited?: boolean; tone: string }) {
  return (
    <div className={"rounded-lg border p-4 " + tone}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-4xl font-bold tabular-nums">{unlimited ? "∞" : value}</div>
    </div>
  );
}

function MemberDrawer({
  user,
  onClose,
  onAct,
}: {
  user: AdminUser;
  onClose: () => void;
  onAct: (id: string, action: string, amount?: number) => Promise<void> | void;
}) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadDetail() {
    setLoading(true);
    const res = await authedFetch(`/api/admin?user=${user.user_id}`);
    if (res.ok) setDetail((await res.json()) as MemberDetail);
    setLoading(false);
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.user_id]);

  async function run(action: string, amount?: number) {
    await onAct(user.user_id, action, amount);
    loadDetail();
  }

  const st = detail?.status;
  const unlimitedText = !!(st?.subscribed || st?.is_tester);
  const btn = "rounded-md border px-3 py-1.5 text-xs hover:bg-accent";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-auto border-l bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{user.email ?? "—"}</h2>
            <p className="text-xs text-muted-foreground">
              Inscrit le {new Date(user.created_at).toLocaleDateString("fr-FR")}
              {user.current_period_end && ` · fin d'accès ${new Date(user.current_period_end).toLocaleDateString("fr-FR")}`}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadges u={user} />
            </div>
          </div>
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            Fermer
          </button>
        </div>

        {loading && !detail ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Chargement de la fiche…</p>
        ) : (
          <div className="space-y-6">
            {/* Crédits en gros */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Solde de crédits</h3>
              <div className="grid grid-cols-3 gap-3">
                <BigCredit label="Texte" value={st?.purchased_balance ?? user.purchased_balance} unlimited={unlimitedText} tone="bg-card" />
                <BigCredit label="Vocaux" value={st?.voice_balance ?? user.voice_balance ?? 0} tone="bg-card" />
                <BigCredit label="Mobile" value={st?.mobile_balance ?? user.mobile_balance ?? 0} tone="bg-card" />
              </div>
            </section>

            {/* Quotas du jour */}
            {st && (
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Utilisation en cours
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <Gauge
                    label="Opérations aujourd'hui"
                    used={st.daily_used}
                    limit={st.daily_limit}
                    hint={`Remise à zéro : ${new Date(st.daily_reset_at).toLocaleString("fr-FR")}`}
                  />
                  <Gauge
                    label="Crédits texte gratuits restants"
                    used={30 - (st.free_remaining ?? 0)}
                    limit={30}
                    hint={unlimitedText ? "Accès illimité (abonné / testeur)" : `${st.free_remaining} restants aujourd'hui`}
                  />
                  <Gauge label="Lectures vocales (jour)" used={st.voice_daily_used} limit={st.voice_daily_limit} />
                  <Gauge
                    label={st.subscribed || st.is_tester ? "Dialogues mobile (mois)" : "Dialogues mobile (jour)"}
                    used={st.mobile_daily_used}
                    limit={st.mobile_daily_limit}
                  />
                </div>
              </section>
            )}

            {/* Coûts & revenus */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Coûts &amp; revenus</h3>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Coût 24h</div>
                  <div className="font-semibold text-red-500">{EURPrecise(detail?.cost_eur.day ?? 0)}</div>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Coût 30j</div>
                  <div className="font-semibold text-red-500">{EURPrecise(detail?.cost_eur.month ?? 0)}</div>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Coût total</div>
                  <div className="font-semibold text-red-500">{EURPrecise(detail?.cost_eur.all ?? 0)}</div>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Revenus</div>
                  <div className="font-semibold text-green-600">{EUR(user.revenue_eur_total)}</div>
                </div>
              </div>
            </section>

            {/* Actions */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Abonnement</h3>
              <div className="flex flex-wrap gap-2">
                <button className={btn} onClick={() => run("grant_lifetime")}>Accorder Lifetime</button>
                <button className={btn} onClick={() => run("grant_year")}>Accorder 1 an</button>
                <button className={btn + " text-destructive"} onClick={() => run("cancel")}>Annuler l'abonnement</button>
                {user.is_tester ? (
                  <button className={btn + " text-destructive"} onClick={() => run("revoke_tester")}>Retirer le statut Testeur</button>
                ) : (
                  <button className={btn + " text-blue-600"} onClick={() => run("grant_tester")}>Accorder le statut Testeur</button>
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Crédits</h3>
              <div className="space-y-2">
                {([
                  { key: "text", label: "Texte", set: "set_credits", add: "add_credits", cur: st?.purchased_balance ?? user.purchased_balance, step: 75 },
                  { key: "voice", label: "Vocaux", set: "set_voice_credits", add: "add_voice_credits", cur: st?.voice_balance ?? user.voice_balance ?? 0, step: 45 },
                  { key: "mobile", label: "Mobile", set: "set_mobile_credits", add: "add_mobile_credits", cur: st?.mobile_balance ?? user.mobile_balance ?? 0, step: 75 },
                ] as const).map((c) => (
                  <div key={c.key} className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
                    <span className="w-20 text-xs font-semibold">{c.label}</span>
                    <span className="text-xs text-muted-foreground">solde : {c.cur}</span>
                    <div className="ml-auto flex flex-wrap gap-1.5">
                      <button className={btn} onClick={() => run(c.add, c.step)}>+{c.step}</button>
                      <button className={btn} onClick={() => run(c.add, 10)}>+10</button>
                      <button className={btn} onClick={() => run(c.add, -10)}>-10</button>
                      <button
                        className={btn}
                        onClick={() => {
                          const raw = prompt(`Solde exact de crédits ${c.label} (actuel : ${c.cur})`, String(c.cur));
                          if (raw === null) return;
                          const n = Number(raw);
                          if (Number.isFinite(n) && n >= 0) run(c.set, Math.trunc(n));
                        }}
                      >
                        Définir…
                      </button>
                      <button className={btn + " text-destructive"} onClick={() => run(c.set, 0)}>Remettre à 0</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Compte</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  className={btn}
                  onClick={() => {
                    if (user.email) navigator.clipboard?.writeText(user.email);
                    toast.success("Email copié");
                  }}
                >
                  Copier l'email
                </button>
                <button
                  className={btn}
                  onClick={() => {
                    if (confirm("Envoyer un email de réinitialisation de mot de passe ?")) run("send_password_reset");
                  }}
                >
                  Envoyer le mail de réinitialisation
                </button>
                <button
                  className={btn + " text-destructive"}
                  onClick={() => {
                    if (confirm("Supprimer DÉFINITIVEMENT ce compte et toutes ses données ?")) {
                      run("delete_user");
                      onClose();
                    }
                  }}
                >
                  Supprimer le compte
                </button>
              </div>
            </section>

            {/* Paiements */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Paiements ({detail?.transactions.length ?? 0})
              </h3>
              {(detail?.transactions.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-1.5">Date</th>
                      <th className="p-1.5">Type</th>
                      <th className="p-1.5">Env.</th>
                      <th className="p-1.5 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail!.transactions.map((t) => (
                      <tr key={t.paddle_transaction_id} className="border-b">
                        <td className="p-1.5">{new Date(t.created_at).toLocaleString("fr-FR")}</td>
                        <td className="p-1.5">{t.kind}</td>
                        <td className="p-1.5">{t.environment}</td>
                        <td className="p-1.5 text-right tabular-nums">{EUR(t.amount_eur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Activité récente */}
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Dernières actions
              </h3>
              {(detail?.activity.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune activité.</p>
              ) : (
                <div className="max-h-64 overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <tbody>
                      {detail!.activity.map((a, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-1.5 text-muted-foreground">{new Date(a.created_at).toLocaleString("fr-FR")}</td>
                          <td className="p-1.5">{operationLabel(a.operation_type)}</td>
                          <td className="p-1.5 text-muted-foreground">{a.source_type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadges({ u }: { u: AdminUser }) {
  return (
    <>
      {u.is_tester && (
        <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300">Testeur</span>
      )}
      {u.access_origin === "paid" ? (
        <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">Abonné payant</span>
      ) : u.access_origin === "granted" ? (
        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">Accès offert</span>
      ) : (
        !u.is_tester && <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">Gratuit</span>
      )}
    </>
  );
}


function operationLabel(op: string) {
  switch (op) {
    case "transcription": return "Transcription (F8 - Whisper)";
    case "translation": return "Traduction (F8 - Gemini)";
    case "translate": return "Traduction texte (F8)";
    case "read_message": return "Lecture message (F9)";
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


type EmailPreviewData = {
  types: Array<{ key: string; label: string }>;
  type: string;
  subject: string;
  from: string;
  html: string;
  pending: Array<{ email: string; created_at: string; expires_in_min: number }>;
};

function EmailPreviewPanel() {
  const [type, setType] = useState("signup");
  const [data, setData] = useState<EmailPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  async function load(t = type) {
    setLoading(true);
    const res = await authedFetch(`/api/admin-emails?type=${encodeURIComponent(t)}`);
    if (res.ok) setData((await res.json()) as EmailPreviewData);
    else toast.error("Impossible de charger l'aperçu");
    setLoading(false);
  }

  useEffect(() => {
    load(type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function purge() {
    setCleaning(true);
    const res = await authedFetch("/api/admin-emails", { method: "POST" });
    setCleaning(false);
    if (!res.ok) return toast.error("Purge échouée");
    const json = (await res.json()) as { deleted: number };
    toast.success(`${json.deleted} compte(s) non vérifié(s) supprimé(s)`);
    load(type);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Aperçu des emails automatiques</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Rendu réel des emails envoyés depuis noreply@notify.talking-translator.com. La
          vérification d'adresse est obligatoire : les comptes non validés sont supprimés
          au bout de 2 heures.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(data?.types ?? [{ key: "signup", label: "Vérification d'adresse email (inscription)" }]).map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={
                "rounded-md border px-3 py-1.5 text-xs " +
                (type === t.key ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 space-y-1 text-sm">
          <div><span className="text-muted-foreground">Expéditeur :</span> {data?.from ?? "-"}</div>
          <div><span className="text-muted-foreground">Objet :</span> <strong>{data?.subject ?? "-"}</strong></div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Chargement de l'aperçu…</div>
        ) : (
          <iframe
            title="Aperçu email"
            srcDoc={data?.html ?? ""}
            className="h-[620px] w-full rounded-md border bg-white"
          />
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Comptes en attente de vérification</h3>
          <button
            onClick={purge}
            disabled={cleaning}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            {cleaning ? "Purge…" : "Purger maintenant (> 2h)"}
          </button>
        </div>
        {(data?.pending?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Aucun compte en attente.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="p-2">Email</th>
                <th className="p-2">Inscrit le</th>
                <th className="p-2">Suppression dans</th>
              </tr>
            </thead>
            <tbody>
              {data!.pending.map((p) => (
                <tr key={p.email} className="border-b">
                  <td className="p-2">{p.email}</td>
                  <td className="p-2">{new Date(p.created_at).toLocaleString("fr-FR")}</td>
                  <td className="p-2 tabular-nums">
                    {p.expires_in_min > 0 ? `${p.expires_in_min} min` : "en attente de purge"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
