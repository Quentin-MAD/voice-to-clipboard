import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

async function getUserAndCheckAdmin(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { error: "unauthorized" as const };

  const supabaseUrl = process.env.SUPABASE_URL!;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const authClient = createClient(supabaseUrl, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error } = await authClient.auth.getUser(token);
  if (error || !userData?.user) return { error: "unauthorized" as const };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdmin) return { error: "forbidden" as const };
  return { userId: userData.user.id, supabaseAdmin };
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

        // Users list
        const { data: users, error: uErr } = await supabaseAdmin.rpc("admin_list_users");
        if (uErr) {
          return Response.json({ error: uErr.message }, { status: 500 });
        }

        // Time series - last 90 days
        const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
        const [pv, ai, tl] = await Promise.all([
          supabaseAdmin.from("page_views").select("created_at,path").gte("created_at", since).limit(50000),
          supabaseAdmin.from("ai_usage_log").select("created_at,cost_credits,model,operation").gte("created_at", since).limit(50000),
          supabaseAdmin.from("translations_log").select("created_at,source_type").gte("created_at", since).limit(50000),
        ]);

        // Aggregate by day
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

        // Totals
        const totalAi = (ai.data ?? []).reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const now = Date.now();
        const inWindow = (iso: string, days: number) => now - new Date(iso).getTime() < days * 86400000;
        const aiToday = (ai.data ?? []).filter((r) => inWindow(r.created_at, 1)).reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const ai7 = (ai.data ?? []).filter((r) => inWindow(r.created_at, 7)).reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const ai30 = (ai.data ?? []).filter((r) => inWindow(r.created_at, 30)).reduce((s, r) => s + Number(r.cost_credits ?? 0), 0);
        const viewsToday = (pv.data ?? []).filter((r) => inWindow(r.created_at, 1)).length;
        const views7 = (pv.data ?? []).filter((r) => inWindow(r.created_at, 7)).length;
        const views30 = (pv.data ?? []).filter((r) => inWindow(r.created_at, 30)).length;

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
