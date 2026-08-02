import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "rossetquentin26@gmail.com";

async function getUserAndCheckAdmin(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { error: "unauthorized" as const };

  const supabaseUrl = process.env.SUPABASE_URL!;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const authClient = createClient(supabaseUrl, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error } = await authClient.auth.getUser(token);
  if (error || !userData?.user) return { error: "unauthorized" as const };

  const email = (userData.user.email ?? "").toLowerCase();
  if (email !== ADMIN_EMAIL) return { error: "forbidden" as const };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { userId: userData.user.id, supabaseAdmin, userClient: authClient };
}


function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const Route = createFileRoute("/api/admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const check = await getUserAndCheckAdmin(request);
        if ("error" in check) {
          return Response.json({ error: check.error }, { status: check.error === "unauthorized" ? 401 : 403 });
        }
        const { supabaseAdmin } = check;

        // Mode d'affichage : réel (live), test (sandbox) ou tout
        const url = new URL(request.url);

        // === Fiche détaillée d'un membre (quotas temps réel) ===
        const detailUserId = url.searchParams.get("user");
        if (detailUserId) {
          const [statusRes, walletRes, profileRes, txRes, logRes, aiRes] = await Promise.all([
            supabaseAdmin.rpc("get_user_status", { _user_id: detailUserId }),
            supabaseAdmin.from("credit_wallets").select("*").eq("user_id", detailUserId).maybeSingle(),
            supabaseAdmin.from("profiles").select("id,email,created_at").eq("id", detailUserId).maybeSingle(),
            supabaseAdmin
              .from("payment_transactions")
              .select("created_at,amount_eur,environment,kind,paddle_transaction_id")
              .eq("user_id", detailUserId)
              .order("created_at", { ascending: false })
              .limit(30),
            supabaseAdmin
              .from("translations_log")
              .select("created_at,source_type,operation_type")
              .eq("user_id", detailUserId)
              .order("created_at", { ascending: false })
              .limit(30),
            supabaseAdmin
              .from("ai_usage_log")
              .select("cost_credits,operation,model,created_at")
              .eq("user_id", detailUserId)
              .limit(50000),
          ]);
          const aiRowsUser = (aiRes.data ?? []) as any[];
          const nowMs = Date.now();
          const sum = (days: number | null) =>
            aiRowsUser
              .filter((r) => (days === null ? true : nowMs - new Date(r.created_at).getTime() < days * 86400000))
              .reduce((s, r) => s + Number(r.cost_credits ?? 0), 0) * 0.92;
          return Response.json({
            profile: profileRes.data ?? null,
            status: (statusRes.data as any[] | null)?.[0] ?? null,
            wallet: walletRes.data ?? null,
            transactions: txRes.data ?? [],
            activity: logRes.data ?? [],
            cost_eur: { day: sum(1), week: sum(7), month: sum(30), all: sum(null) },
          });
        }

        const envParam = url.searchParams.get("env");
        const mode: "live" | "test" | "all" =
          envParam === "test" ? "test" : envParam === "all" ? "all" : "live";
        const matchesEnv = (environment: string | null | undefined) => {
          if (mode === "all") return true;
          if (mode === "live") return environment === "live";
          return environment !== "live";
        };

        // Users list (email-based admin check already performed via getUserAndCheckAdmin)
        const { data: users, error: uErr } = await supabaseAdmin.rpc("admin_list_users");
        if (uErr) {
          return Response.json({ error: uErr.message }, { status: 500 });
        }

        // Time series - last 365 days for chart
        const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
        const [pv, ai, tl, subs, tx, txAll, aiFirst] = await Promise.all([
          supabaseAdmin.from("page_views").select("created_at,path").gte("created_at", since).limit(100000),
          supabaseAdmin
            .from("ai_usage_log")
            .select("created_at,cost_credits,user_id,model,operation,input_tokens,output_tokens")
            .gte("created_at", since)
            .limit(200000),
          supabaseAdmin.from("translations_log").select("created_at,source_type,user_id,operation_type").limit(500000),
          supabaseAdmin.from("subscriptions").select("user_id,status,current_period_end,updated_at,environment"),
          supabaseAdmin.from("payment_transactions").select("created_at,amount_eur,environment,kind").gte("created_at", since).limit(100000),
          supabaseAdmin.from("payment_transactions").select("created_at,amount_eur,environment,kind").limit(500000),
          supabaseAdmin.from("ai_usage_log").select("created_at").order("created_at", { ascending: true }).limit(1),
        ]);

        // cost_credits est exprimé en USD, converti en EUR pour l'affichage
        const USD_TO_EUR = 0.92;
        const SUB_PRICE_EUR = 24.99; // par an
        const EUR_PER_PURCHASED_CREDIT = 2.99 / 75;

        const aiRows = (ai.data ?? []) as any[];
        const aiAllRows = aiRows; // ai_usage_log complet tient dans la fenêtre 365j
        const now = Date.now();
        const inWindow = (iso: string, days: number) => now - new Date(iso).getTime() < days * 86400000;

        const dayKey = (iso: string) => startOfDayUTC(new Date(iso)).toISOString().slice(0, 10);
        const agg: Record<string, { views: number; translations: number; ai_credits: number }> = {};
        for (let i = 0; i < 90; i++) {
          const d = new Date(Date.now() - i * 86400000);
          agg[dayKey(d.toISOString())] = { views: 0, translations: 0, ai_credits: 0 };
        }
        for (const row of pv.data ?? []) {
          const k = dayKey(row.created_at);
          if (agg[k]) agg[k].views++;
        }
        for (const row of tl.data ?? []) {
          const k = dayKey(row.created_at);
          if (agg[k]) agg[k].translations++;
        }
        for (const row of aiRows) {
          const k = dayKey(row.created_at);
          if (agg[k]) agg[k].ai_credits += Number(row.cost_credits ?? 0);
        }
        const daily = Object.entries(agg)
          .map(([date, v]) => ({ date, ...v }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));

        const totalAi = aiRows.reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const aiToday = aiRows.filter((r) => inWindow(r.created_at, 1)).reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const ai7 = aiRows.filter((r) => inWindow(r.created_at, 7)).reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const ai30 = aiRows.filter((r) => inWindow(r.created_at, 30)).reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const viewsToday = (pv.data ?? []).filter((r) => inWindow(r.created_at, 1)).length;
        const views7 = (pv.data ?? []).filter((r) => inWindow(r.created_at, 7)).length;
        const views30 = (pv.data ?? []).filter((r) => inWindow(r.created_at, 30)).length;

        // === Catégories de membres ===
        const allUsers = (users ?? []) as any[];
        const testerIds = new Set<string>(allUsers.filter((u) => u.is_tester).map((u) => u.user_id as string));
        const paidSubs = allUsers.filter((u) => u.is_paid_subscriber).length;
        const grantedSubs = allUsers.filter((u) => u.access_origin === "granted").length;
        const testersCount = testerIds.size;

        // === Coûts réels uniquement (aucune estimation) ===
        const costEurWindow = (days: number | null, opts?: { testersOnly?: boolean; excludeTesters?: boolean }) =>
          aiRows
            .filter((r) => (days === null ? true : inWindow(r.created_at, days)))
            .filter((r) => {
              if (opts?.testersOnly) return r.user_id && testerIds.has(r.user_id);
              if (opts?.excludeTesters) return !r.user_id || !testerIds.has(r.user_id);
              return true;
            })
            .reduce((s, r) => s + Number(r.cost_credits ?? 0), 0) * USD_TO_EUR;

        const unattributedEur = (days: number | null) =>
          aiRows
            .filter((r) => (days === null ? true : inWindow(r.created_at, days)))
            .filter((r) => !r.user_id)
            .reduce((s, r) => s + Number(r.cost_credits ?? 0), 0) * USD_TO_EUR;

        const cost = {
          day: costEurWindow(1),
          week: costEurWindow(7),
          month: costEurWindow(30),
          year: costEurWindow(365),
          all: costEurWindow(null),
        };
        const costTesters = {
          day: costEurWindow(1, { testersOnly: true }),
          week: costEurWindow(7, { testersOnly: true }),
          month: costEurWindow(30, { testersOnly: true }),
          year: costEurWindow(365, { testersOnly: true }),
          all: costEurWindow(null, { testersOnly: true }),
        };
        const costUnattributed = {
          day: unattributedEur(1),
          week: unattributedEur(7),
          month: unattributedEur(30),
          year: unattributedEur(365),
          all: unattributedEur(null),
        };
        const costPaying = { ...cost };

        // Taux de couverture : part des lignes de coût rattachées à un membre
        const attributedRows = aiAllRows.filter((r) => !!r.user_id).length;
        const coverage = aiAllRows.length > 0 ? attributedRows / aiAllRows.length : 1;

        // === Breakdown par opération + modèle ===
        type Bucket = { operation: string; model: string; calls: number; cost_eur: number; in_tokens: number; out_tokens: number; avg_cost_eur: number };
        const breakdownFor = (rows: any[]): Bucket[] => {
          const map = new Map<string, Bucket>();
          for (const r of rows) {
            const op = r.operation ?? "unknown";
            const mdl = r.model ?? "unknown";
            const k = `${op}|${mdl}`;
            const b = map.get(k) ?? { operation: op, model: mdl, calls: 0, cost_eur: 0, in_tokens: 0, out_tokens: 0, avg_cost_eur: 0 };
            b.calls++;
            b.cost_eur += Number(r.cost_credits ?? 0) * USD_TO_EUR;
            b.in_tokens += Number(r.input_tokens ?? 0);
            b.out_tokens += Number(r.output_tokens ?? 0);
            map.set(k, b);
          }
          return [...map.values()]
            .map((b) => ({ ...b, avg_cost_eur: b.calls > 0 ? b.cost_eur / b.calls : 0 }))
            .sort((a, b) => b.cost_eur - a.cost_eur);
        };
        const breakdown = {
          day: breakdownFor(aiRows.filter((r) => inWindow(r.created_at, 1))),
          week: breakdownFor(aiRows.filter((r) => inWindow(r.created_at, 7))),
          month: breakdownFor(aiRows.filter((r) => inWindow(r.created_at, 30))),
          year: breakdownFor(aiRows),
          all: breakdownFor(aiAllRows),
        };

        // === Activité utilisateurs récente (100 derniers événements) ===
        const { data: recentTl } = await supabaseAdmin
          .from("translations_log")
          .select("created_at,user_id,source_type,operation_type")
          .order("created_at", { ascending: false })
          .limit(100);
        const emailById = new Map<string, string>(allUsers.map((u) => [u.user_id, u.email ?? ""]));
        const aiByUser = new Map<string, Array<{ t: number; cost: number }>>();
        for (const r of aiRows) {
          if (!r.user_id) continue;
          const arr = aiByUser.get(r.user_id) ?? [];
          arr.push({ t: new Date(r.created_at).getTime(), cost: Number(r.cost_credits ?? 0) * USD_TO_EUR });
          aiByUser.set(r.user_id, arr);
        }
        const WINDOW_MS = 15000;
        const recent = (recentTl ?? []).map((r: any) => {
          const t = new Date(r.created_at).getTime();
          const arr = aiByUser.get(r.user_id) ?? [];
          let matched = 0;
          for (const e of arr) {
            if (Math.abs(e.t - t) <= WINDOW_MS) matched += e.cost;
          }
          return {
            created_at: r.created_at,
            operation: r.operation_type ?? "translate",
            source_type: r.source_type ?? "unknown",
            user_id: r.user_id,
            email: emailById.get(r.user_id) ?? "-",
            is_tester: testerIds.has(r.user_id),
            approx_cost_eur: matched,
            cost_known: matched > 0,
          };
        });

        // === Revenus - filtrés selon le mode choisi ===
        const txRows = (tx.data ?? []).filter((t: any) => matchesEnv(t.environment));
        const txAllRows = (txAll.data ?? []).filter((t: any) => matchesEnv(t.environment));
        const revenueInWindow = (days: number) =>
          txRows
            .filter((t: any) => inWindow(t.created_at, days))
            .reduce((s: number, t: any) => s + Number(t.amount_eur ?? 0), 0);

        const revenue = {
          day: revenueInWindow(1),
          week: revenueInWindow(7),
          month: revenueInWindow(30),
          year: revenueInWindow(365),
          all: txAllRows.reduce((s: number, t: any) => s + Number(t.amount_eur ?? 0), 0),
        };

        const profit = {
          day: revenue.day - costPaying.day,
          week: revenue.week - costPaying.week,
          month: revenue.month - costPaying.month,
          year: revenue.year - costPaying.year,
          all: revenue.all - costPaying.all,
        };
        const ratio = (rev: number, cst: number) => (cst > 0 ? rev / cst : rev > 0 ? Infinity : 0);
        const margin = (rev: number, cst: number) => (rev > 0 ? ((rev - cst) / rev) * 100 : 0);
        const finance = {
          cost,
          costTesters,
          costUnattributed,
          costPaying,
          revenue,
          profit,
          ratio: {
            day: ratio(revenue.day, costPaying.day),
            week: ratio(revenue.week, costPaying.week),
            month: ratio(revenue.month, costPaying.month),
            year: ratio(revenue.year, costPaying.year),
            all: ratio(revenue.all, costPaying.all),
          },
          margin: {
            day: margin(revenue.day, costPaying.day),
            week: margin(revenue.week, costPaying.week),
            month: margin(revenue.month, costPaying.month),
            year: margin(revenue.year, costPaying.year),
            all: margin(revenue.all, costPaying.all),
          },
          assumptions: {
            usd_to_eur: USD_TO_EUR,
            sub_price_eur_year: SUB_PRICE_EUR,
            eur_per_purchased_credit: EUR_PER_PURCHASED_CREDIT,
            active_paying_subs: paidSubs,
            testers_count: testersCount,
            first_ai_date: aiFirst.data?.[0]?.created_at ?? null,
          },
        };

        // === Bandeau d'état des données ===
        const liveTxCount = (txAll.data ?? []).filter((t: any) => t.environment === "live").length;
        const testTxCount = (txAll.data ?? []).filter((t: any) => t.environment !== "live").length;
        const dataHealth = {
          mode,
          total_users: allUsers.length,
          tester_users: testersCount,
          real_users: allUsers.filter((u) => !u.is_tester).length,
          paid_subscribers: paidSubs,
          granted_access: grantedSubs,
          live_transactions: liveTxCount,
          test_transactions: testTxCount,
          ai_rows_total: aiAllRows.length,
          ai_rows_unattributed: aiAllRows.length - attributedRows,
          cost_coverage_ratio: coverage,
          unattributed_cost_eur: costUnattributed.all,
          active_sub_rows_by_env: (subs.data ?? []).reduce((acc: Record<string, number>, s: any) => {
            const active =
              (s.status === "active" || s.status === "trialing") &&
              (!s.current_period_end || new Date(s.current_period_end).getTime() > now);
            if (!active) return acc;
            const key = s.environment ?? "unknown";
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {}),
        };

        return Response.json({
          mode,
          users: allUsers,
          daily,
          totals: {
            users: allUsers.length,
            subscribed: paidSubs,
            granted: grantedSubs,
            testers: testersCount,
            ai_credits_total: totalAi,
            ai_credits_today: aiToday,
            ai_credits_7d: ai7,
            ai_credits_30d: ai30,
            ai_credits_all: aiAllRows.reduce((s, r) => s + Number(r.cost_credits ?? 0), 0),
            views_today: viewsToday,
            views_7d: views7,
            views_30d: views30,
          },
          dataHealth,
          finance,
          breakdown,
          recent,
        });

      },
      POST: async ({ request }) => {
        const check = await getUserAndCheckAdmin(request);
        if ("error" in check) {
          return Response.json({ error: check.error }, { status: check.error === "unauthorized" ? 401 : 403 });
        }
        const { supabaseAdmin } = check;
        const body = (await request.json().catch(() => ({}))) as {
          action?:
            | "grant_lifetime" | "grant_year" | "cancel"
            | "add_credits" | "add_voice_credits" | "set_credits" | "set_voice_credits"
            | "grant_tester" | "revoke_tester"
            | "send_password_reset" | "delete_user";
          user_id?: string;
          amount?: number;
        };
        if (!body.user_id || !body.action) {
          return Response.json({ error: "bad_request" }, { status: 400 });
        }
        if (body.action === "send_password_reset" || body.action === "delete_user") {
          const { data: target, error: pErr } = await supabaseAdmin
            .from("profiles")
            .select("email")
            .eq("id", body.user_id)
            .maybeSingle();
          if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

          if (body.action === "send_password_reset") {
            const email = (target?.email ?? "").trim();
            if (!email) return Response.json({ error: "email_introuvable" }, { status: 400 });
            const reqOrigin = new URL(request.url).origin;
            // Le lien est ouvert hors contexte (autre appareil / boîte mail) :
            // on force le domaine public sauf en local/preview.
            const origin = /localhost|127\.0\.0\.1|-preview/.test(reqOrigin)
              ? reqOrigin
              : "https://talking-translator.com";
            const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
              auth: { persistSession: false, autoRefreshToken: false },
            });
            const { error } = await anon.auth.resetPasswordForEmail(email, {
              redirectTo: `${origin}/reset-password`,
            });
            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({ ok: true, email });
          }

          // delete_user : suppression définitive du compte
          if ((target?.email ?? "").toLowerCase() === ADMIN_EMAIL) {
            return Response.json({ error: "impossible de supprimer le compte admin" }, { status: 400 });
          }
          const { error } = await supabaseAdmin.auth.admin.deleteUser(body.user_id);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ ok: true });
        }

        if (body.action === "add_credits" || body.action === "set_credits") {
          const amt = Math.trunc(body.amount ?? 0);
          const rpc = body.action === "add_credits" ? "admin_add_credits" : "admin_set_credits";
          const { error } = await supabaseAdmin.rpc(rpc, { _target_user: body.user_id, _amount: amt });
          if (error) return Response.json({ error: error.message }, { status: 500 });
        } else if (body.action === "add_voice_credits" || body.action === "set_voice_credits") {
          const amt = Math.trunc(body.amount ?? 0);
          const rpc = body.action === "add_voice_credits" ? "admin_add_voice_credits" : "admin_set_voice_credits";
          const { error } = await supabaseAdmin.rpc(rpc, { _target_user: body.user_id, _amount: amt });
          if (error) return Response.json({ error: error.message }, { status: 500 });
        } else if (body.action === "grant_tester" || body.action === "revoke_tester") {
          const { error } = await supabaseAdmin.rpc("admin_set_tester", {
            _target_user: body.user_id,
            _enable: body.action === "grant_tester",
          });
          if (error) return Response.json({ error: error.message }, { status: 500 });
        } else {
          const { error } = await supabaseAdmin.rpc("admin_set_subscription", {
            _target_user: body.user_id,
            _action: body.action,
          });
          if (error) return Response.json({ error: error.message }, { status: 500 });
        }


        return Response.json({ ok: true });
      },
    },
  },
});
