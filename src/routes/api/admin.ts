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

        // Users list (email-based admin check already performed via getUserAndCheckAdmin)
        const { data: users, error: uErr } = await supabaseAdmin.rpc("admin_list_users");
        if (uErr) {
          return Response.json({ error: uErr.message }, { status: 500 });
        }


        // Time series - last 365 days for chart
        const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
        const [pv, ai, tl, subs, tx, aiAll, txAll, aiFirst] = await Promise.all([
          supabaseAdmin.from("page_views").select("created_at,path").gte("created_at", since).limit(100000),
          supabaseAdmin.from("ai_usage_log").select("created_at,cost_credits,model,operation").gte("created_at", since).limit(100000),
          supabaseAdmin.from("translations_log").select("created_at,source_type").gte("created_at", since).limit(200000),
          supabaseAdmin.from("subscriptions").select("status,current_period_end,updated_at,environment"),
          supabaseAdmin.from("payment_transactions").select("created_at,amount_eur,environment").gte("created_at", since).limit(100000),
          // All-time (minimal fields)
          supabaseAdmin.from("ai_usage_log").select("cost_credits").limit(500000),
          supabaseAdmin.from("payment_transactions").select("amount_eur,environment").limit(500000),
          supabaseAdmin.from("ai_usage_log").select("created_at").order("created_at", { ascending: true }).limit(1),
        ]);

        // === Business constants (EUR) ===
        // cost_credits estimates are in USD, convert to EUR
        const USD_TO_EUR = 0.92;
        const SUB_PRICE_EUR = 29.99; // per year
        const EUR_PER_PURCHASED_CREDIT = 2.99 / 50; // 50 crédits texte = 2,99€
        const EUR_PER_VOICE_CREDIT = 2.99 / 10; // 10 crédits vocaux = 2,99€

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
        for (const row of ai.data ?? []) {
          const k = dayKey(row.created_at);
          if (agg[k]) agg[k].ai_credits += Number(row.cost_credits ?? 0);
        }
        const daily = Object.entries(agg)
          .map(([date, v]) => ({ date, ...v }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));

        const totalAi = (ai.data ?? []).reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const now = Date.now();
        const inWindow = (iso: string, days: number) => now - new Date(iso).getTime() < days * 86400000;
        const aiToday = (ai.data ?? []).filter((r) => inWindow(r.created_at, 1)).reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const ai7 = (ai.data ?? []).filter((r) => inWindow(r.created_at, 7)).reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const ai30 = (ai.data ?? []).filter((r) => inWindow(r.created_at, 30)).reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const viewsToday = (pv.data ?? []).filter((r) => inWindow(r.created_at, 1)).length;
        const views7 = (pv.data ?? []).filter((r) => inWindow(r.created_at, 7)).length;
        const views30 = (pv.data ?? []).filter((r) => inWindow(r.created_at, 30)).length;

        // === IDs des membres testeurs (exclus des revenus / rentabilité) ===
        const testerIds = new Set<string>(
          ((users ?? []) as any[]).filter((u) => u.is_tester).map((u) => u.user_id as string),
        );

        // === Fetch ai_usage_log user_ids + détails sur la fenêtre 365j ===
        const { data: aiWithUser } = await supabaseAdmin
          .from("ai_usage_log")
          .select("created_at,cost_credits,user_id,model,operation,input_tokens,output_tokens")
          .gte("created_at", since)
          .limit(200000);

        const costEurWindowFiltered = (days: number, includeTesters: boolean) =>
          (aiWithUser ?? [])
            .filter((r: any) => inWindow(r.created_at, days))
            .filter((r: any) => (includeTesters ? true : !testerIds.has(r.user_id)))
            .reduce((s: number, r: any) => s + Number(r.cost_credits ?? 0), 0) * USD_TO_EUR;

        // All-time - séparer coût testeurs
        const { data: aiAllWithUser } = await supabaseAdmin
          .from("ai_usage_log")
          .select("cost_credits,user_id,model,operation,input_tokens,output_tokens")
          .limit(500000);
        const aiAllTotalCredits = (aiAllWithUser ?? []).reduce((s: number, r: any) => s + Number(r.cost_credits ?? 0), 0);
        const costAllEur = aiAllTotalCredits * USD_TO_EUR;
        const costAllEurExclTesters =
          (aiAllWithUser ?? [])
            .filter((r: any) => !testerIds.has(r.user_id))
            .reduce((s: number, r: any) => s + Number(r.cost_credits ?? 0), 0) * USD_TO_EUR;
        const revenueAllEur = (txAll.data ?? [])
          .filter((t: any) => t.environment === "live")
          .reduce((s: number, t: any) => s + Number(t.amount_eur ?? 0), 0);
        const firstAiDate = aiFirst.data?.[0]?.created_at ?? null;

        // === Breakdown par opération + modèle, par fenêtre ===
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
        const rows365 = aiWithUser ?? [];
        const breakdown = {
          day: breakdownFor(rows365.filter((r: any) => inWindow(r.created_at, 1))),
          week: breakdownFor(rows365.filter((r: any) => inWindow(r.created_at, 7))),
          month: breakdownFor(rows365.filter((r: any) => inWindow(r.created_at, 30))),
          year: breakdownFor(rows365),
          all: breakdownFor(aiAllWithUser ?? []),
        };

        // === Activité IA récente (50 derniers événements) - live feed ===
        const { data: recentAi } = await supabaseAdmin
          .from("ai_usage_log")
          .select("created_at,cost_credits,user_id,model,operation,input_tokens,output_tokens")
          .order("created_at", { ascending: false })
          .limit(50);
        const emailById = new Map<string, string>(
          ((users ?? []) as any[]).map((u) => [u.user_id, u.email ?? ""]),
        );
        const recent = (recentAi ?? []).map((r: any) => ({
          created_at: r.created_at,
          operation: r.operation,
          model: r.model,
          input_tokens: r.input_tokens ?? 0,
          output_tokens: r.output_tokens ?? 0,
          cost_eur: Number(r.cost_credits ?? 0) * USD_TO_EUR,
          user_id: r.user_id,
          email: emailById.get(r.user_id) ?? "—",
          is_tester: testerIds.has(r.user_id),
        }));


        // Coût total (tous membres inclus, testeurs compris) - pour affichage brut
        const cost = {
          day: costEurWindowFiltered(1, true),
          week: costEurWindowFiltered(7, true),
          month: costEurWindowFiltered(30, true),
          year: costEurWindowFiltered(365, true),
          all: costAllEur,
        };
        // Coût des testeurs uniquement (à afficher séparément)
        const costTesters = {
          day: cost.day - costEurWindowFiltered(1, false),
          week: cost.week - costEurWindowFiltered(7, false),
          month: cost.month - costEurWindowFiltered(30, false),
          year: cost.year - costEurWindowFiltered(365, false),
          all: costAllEur - costAllEurExclTesters,
        };
        // Coût "payant" utilisé pour le calcul de rentabilité (exclut testeurs)
        const costPaying = {
          day: cost.day - costTesters.day,
          week: cost.week - costTesters.week,
          month: cost.month - costTesters.month,
          year: cost.year - costTesters.year,
          all: cost.all - costTesters.all,
        };

        // === Revenus EUR - basés uniquement sur les vraies transactions Paddle ===
        const realTx = (tx.data ?? []).filter((t: any) => t.environment === "live");
        const revenueInWindow = (days: number) =>
          realTx
            .filter((t: any) => inWindow(t.created_at, days))
            .reduce((s: number, t: any) => s + Number(t.amount_eur ?? 0), 0);

        const revenue = {
          day: revenueInWindow(1),
          week: revenueInWindow(7),
          month: revenueInWindow(30),
          year: revenueInWindow(365),
          all: revenueAllEur,
        };

        // Rentabilité = revenus - coût des membres payants (testeurs exclus)
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
            active_paying_subs: (subs.data ?? []).filter(
              (s: any) => s.status === "active" && s.environment === "live" &&
                (!s.current_period_end || new Date(s.current_period_end).getTime() > now),
            ).length,
            testers_count: testerIds.size,
            first_ai_date: firstAiDate,
          },
        };


        return Response.json({
          users,
          daily,
          totals: {
            users: users?.length ?? 0,
            subscribed: (users ?? []).filter((u: any) => u.subscribed).length,
            ai_credits_total: totalAi,
            ai_credits_today: aiToday,
            ai_credits_7d: ai7,
            ai_credits_30d: ai30,
            ai_credits_all: aiAllTotalCredits,
            views_today: viewsToday,
            views_7d: views7,
            views_30d: views30,
          },
          finance,
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
            | "grant_tester" | "revoke_tester";
          user_id?: string;
          amount?: number;
        };
        if (!body.user_id || !body.action) {
          return Response.json({ error: "bad_request" }, { status: 400 });
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
