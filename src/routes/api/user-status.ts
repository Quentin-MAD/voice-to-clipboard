import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type UserStatus = {
  subscribed: boolean;
  free_remaining: number;
  purchased_balance: number;
  hourly_used: number;
  hourly_limit: number;
  daily_used: number;
  daily_limit: number;
  daily_reset_at: string | null;
  voice_balance: number;
  voice_daily_used: number;
  voice_daily_limit: number;
  voice_daily_reset_at: string | null;
};

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

export const Route = createFileRoute("/api/user-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

        if (!token) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;

        if (!supabaseUrl || !publishable) {
          return Response.json({ error: "Server misconfigured" }, { status: 500 });
        }

        const authClient = createClient(supabaseUrl, publishable, {
          global: { fetch: createSupabaseFetch(publishable) },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: userData, error: userError } = await authClient.auth.getUser(token);
        if (userError || !userData.user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("get_user_status", {
          _user_id: userData.user.id,
        });

        if (error) {
          console.error("get_user_status failed:", error);
          return Response.json({ error: "Unable to load user status" }, { status: 500 });
        }

        const row = Array.isArray(data) ? data[0] : data;
        const status: UserStatus = {
          subscribed: !!row?.subscribed,
          free_remaining: Number(row?.free_remaining ?? 0),
          purchased_balance: Number(row?.purchased_balance ?? 0),
          hourly_used: Number(row?.hourly_used ?? 0),
          hourly_limit: Number(row?.hourly_limit ?? 150),
          daily_used: Number(row?.daily_used ?? row?.hourly_used ?? 0),
          daily_limit: Number(row?.daily_limit ?? 150),
          daily_reset_at: row?.daily_reset_at ? new Date(row.daily_reset_at).toISOString() : null,
          voice_balance: Number(row?.voice_balance ?? 0),
          voice_daily_used: Number(row?.voice_daily_used ?? 0),
          voice_daily_limit: Number(row?.voice_daily_limit ?? 5),
          voice_daily_reset_at: row?.voice_daily_reset_at ? new Date(row.voice_daily_reset_at).toISOString() : null,
        };

        return Response.json(status);

        return Response.json(status);
      },
    },
  },
});