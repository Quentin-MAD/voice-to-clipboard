import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

async function authenticate(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishable) return null;

  const authClient = createClient(supabaseUrl, publishable, {
    global: { fetch: createSupabaseFetch(publishable) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export const Route = createFileRoute("/api/subscription")({
  server: {
    handlers: {
      // Current subscription info (status, period end, cancellation flag)
      GET: async ({ request }) => {
        const user = await authenticate(request);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const environment = new URL(request.url).searchParams.get("environment");
        if (environment !== "sandbox" && environment !== "live") {
          return Response.json({ error: "Environnement invalide" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // One row per user (user_id is the primary key), so no environment filter here:
        // manually granted subscriptions use the 'admin' environment.
        const { data, error } = await supabaseAdmin
          .from("subscriptions")
          .select(
            "status, current_period_start, current_period_end, cancel_at_period_end, paddle_subscription_id, environment",
          )
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("subscription read failed:", error);
          return Response.json({ error: "Unable to load subscription" }, { status: 500 });
        }

        const end = data?.current_period_end ? new Date(data.current_period_end).getTime() : null;
        const stillInPeriod = end === null || end > Date.now();
        const isActive =
          !!data &&
          ((["active", "trialing"].includes(data.status) && stillInPeriod) ||
            (data.status === "canceled" && end !== null && end > Date.now()));

        return Response.json({
          status: data?.status ?? "inactive",
          current_period_start: data?.current_period_start ?? null,
          current_period_end: data?.current_period_end ?? null,
          cancel_at_period_end: !!data?.cancel_at_period_end,
          is_active: isActive,
          has_subscription: !!data && data.status !== "inactive",
        });
      },

      // Cancel at the end of the paid period (no refund, access kept until then)
      POST: async ({ request }) => {
        const user = await authenticate(request);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const environment = new URL(request.url).searchParams.get("environment");
        if (environment !== "sandbox" && environment !== "live") {
          return Response.json({ error: "Environnement invalide" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: sub, error } = await supabaseAdmin
          .from("subscriptions")
          .select("paddle_subscription_id, environment, status, current_period_end")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error || !sub || sub.status === "inactive" || sub.status === "canceled") {
          return Response.json({ error: "Aucun abonnement actif à annuler." }, { status: 400 });
        }

        // Paddle-billed subscription: stop the renewal on Paddle's side.
        // Manually granted subscriptions have no Paddle id: only flag them locally.
        if (sub.paddle_subscription_id) {
          try {
            const { getPaddleClient } = await import("@/lib/paddle.server");
            const paddle = getPaddleClient((sub.environment as "sandbox" | "live") ?? "live");
            await paddle.subscriptions.cancel(sub.paddle_subscription_id, {
              effectiveFrom: "next_billing_period" as never,
            });
          } catch (e) {
            console.error("Paddle cancel failed:", e);
            return Response.json(
              { error: "Annulation impossible pour le moment. Réessayez plus tard." },
              { status: 502 },
            );
          }
        }

        await supabaseAdmin
          .from("subscriptions")
          .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);

        return Response.json({ ok: true, current_period_end: sub.current_period_end ?? null });
      },
    },
  },
});
