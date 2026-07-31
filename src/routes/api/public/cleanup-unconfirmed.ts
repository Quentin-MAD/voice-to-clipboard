import { createFileRoute } from "@tanstack/react-router";

// Supprime les comptes dont l'email n'a jamais été vérifié après 2 heures.
// Appelé par le planificateur (pg_cron) avec le secret CLEANUP_CRON_SECRET.
async function runCleanup() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  const deleted: string[] = [];

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    if (users.length === 0) break;

    for (const u of users) {
      const confirmed = (u as any).email_confirmed_at || (u as any).confirmed_at;
      const createdAt = new Date(u.created_at).getTime();
      const hasPassword = ((u as any).identities ?? []).some((i: any) => i.provider === "email");
      if (!confirmed && hasPassword && createdAt < cutoff) {
        const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(u.id);
        if (!delErr) deleted.push(u.id);
      }
    }
    if (users.length < 200) break;
  }

  return deleted;
}

export const Route = createFileRoute("/api/public/cleanup-unconfirmed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cleanup-secret") ?? "";
        const envSecret = process.env.CLEANUP_CRON_SECRET;
        let allowed = !!envSecret && provided === envSecret;
        if (!allowed && provided) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("internal_config")
            .select("value")
            .eq("key", "cleanup_cron_secret")
            .maybeSingle();
          allowed = !!data?.value && data.value === provided;
        }
        if (!allowed) return new Response("Unauthorized", { status: 401 });
        try {
          const deleted = await runCleanup();
          return Response.json({ ok: true, deleted: deleted.length });
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
