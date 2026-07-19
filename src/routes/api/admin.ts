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


        // Time series - last 365 days
        const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
        const [pv, ai, tl, subs] = await Promise.all([
          supabaseAdmin.from("page_views").select("created_at,path").gte("created_at", since).limit(100000),
          supabaseAdmin.from("ai_usage_log").select("created_at,cost_credits,model,operation").gte("created_at", since).limit(100000),
          supabaseAdmin.from("translations_log").select("created_at,source_type").gte("created_at", since).limit(200000),
          supabaseAdmin.from("subscriptions").select("status,current_period_end,updated_at,environment"),
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

        // === Coûts EUR par fenêtre ===
        const costEurWindow = (days: number) =>
          (ai.data ?? [])
            .filter((r) => inWindow(r.created_at, days))
            .reduce((s, r) => s + Number(r.cost_credits ?? 0), 0) * USD_TO_EUR;
        const cost = {
          day: costEurWindow(1),
          week: costEurWindow(7),
          month: costEurWindow(30),
          year: costEurWindow(365),
        };

        // === Revenus EUR ===
        // Exclut les abonnements offerts par admin (environment='admin')
        const activeSubs = (subs.data ?? []).filter(
          (s: any) =>
            s.status === "active" &&
            (s.environment === "sandbox" || s.environment === "live") &&
            (!s.current_period_end || new Date(s.current_period_end).getTime() > now),
        );
        const dailySubRevenue = activeSubs.length * (SUB_PRICE_EUR / 365);

        const purchasedInWindow = (days: number) =>
          (tl.data ?? []).filter(
            (r) => r.source_type === "purchased_credit" && inWindow(r.created_at, days),
          ).length;
        const packRev = (days: number) => purchasedInWindow(days) * EUR_PER_PURCHASED_CREDIT;

        const revenue = {
          day: dailySubRevenue + packRev(1),
          week: dailySubRevenue * 7 + packRev(7),
          month: dailySubRevenue * 30 + packRev(30),
          year: dailySubRevenue * 365 + packRev(365),
        };

        const profit = {
          day: revenue.day - cost.day,
          week: revenue.week - cost.week,
          month: revenue.month - cost.month,
          year: revenue.year - cost.year,
        };
        const ratio = (rev: number, cst: number) => (cst > 0 ? rev / cst : rev > 0 ? Infinity : 0);
        const margin = (rev: number, cst: number) => (rev > 0 ? ((rev - cst) / rev) * 100 : 0);
        const finance = {
          cost,
          revenue,
          profit,
          ratio: {
            day: ratio(revenue.day, cost.day),
            week: ratio(revenue.week, cost.week),
            month: ratio(revenue.month, cost.month),
            year: ratio(revenue.year, cost.year),
          },
          margin: {
            day: margin(revenue.day, cost.day),
            week: margin(revenue.week, cost.week),
            month: margin(revenue.month, cost.month),
            year: margin(revenue.year, cost.year),
          },
          assumptions: {
            usd_to_eur: USD_TO_EUR,
            sub_price_eur_year: SUB_PRICE_EUR,
            eur_per_purchased_credit: EUR_PER_PURCHASED_CREDIT,
            active_paying_subs: activeSubs.length,
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
          action?: "grant_lifetime" | "grant_year" | "cancel" | "add_credits";
          user_id?: string;
          amount?: number;
        };
        if (!body.user_id || !body.action) {
          return Response.json({ error: "bad_request" }, { status: 400 });
        }
        if (body.action === "add_credits") {
          const amt = Math.trunc(body.amount ?? 0);
          const { error } = await supabaseAdmin.rpc("admin_add_credits", {
            _target_user: body.user_id,
            _amount: amt,
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
