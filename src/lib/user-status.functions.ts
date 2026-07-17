import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UserStatus = {
  subscribed: boolean;
  free_remaining: number;
  purchased_balance: number;
  hourly_used: number;
  hourly_limit: number;
};

export const getUserStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserStatus> => {
    const url = process.env.SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("get_user_status", { _user_id: context.userId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      subscribed: !!row?.subscribed,
      free_remaining: Number(row?.free_remaining ?? 0),
      purchased_balance: Number(row?.purchased_balance ?? 0),
      hourly_used: Number(row?.hourly_used ?? 0),
      hourly_limit: Number(row?.hourly_limit ?? 50),
    };
  });
