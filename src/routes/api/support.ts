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

export const Route = createFileRoute("/api/support")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) {
          return Response.json({ error: "Vous devez être connecté." }, { status: 401 });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !publishable) {
          return Response.json({ error: "Serveur mal configuré" }, { status: 500 });
        }

        const authClient = createClient(supabaseUrl, publishable, {
          global: { fetch: createSupabaseFetch(publishable) },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userError } = await authClient.auth.getUser(token);
        if (userError || !userData.user) {
          return Response.json({ error: "Vous devez être connecté." }, { status: 401 });
        }
        const user = userData.user;

        let body: { subject?: unknown; message?: unknown };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Requête invalide" }, { status: 400 });
        }

        const subject = typeof body.subject === "string" ? body.subject.trim() : "";
        const message = typeof body.message === "string" ? body.message.trim() : "";

        if (subject.length < 3 || subject.length > 150) {
          return Response.json({ error: "L'objet doit contenir entre 3 et 150 caractères." }, { status: 400 });
        }
        if (message.length < 10 || message.length > 4000) {
          return Response.json({ error: "Le message doit contenir entre 10 et 4000 caractères." }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recent, error: recentError } = await supabaseAdmin
          .from("support_messages")
          .select("created_at")
          .eq("user_id", user.id)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1);

        if (recentError) {
          console.error("support rate check failed:", recentError);
          return Response.json({ error: "Erreur serveur" }, { status: 500 });
        }

        if (recent && recent.length > 0) {
          const last = new Date(recent[0].created_at as string).getTime();
          const waitMs = Math.max(0, last + 60 * 60 * 1000 - Date.now());
          const waitMin = Math.ceil(waitMs / 60000);
          return Response.json(
            {
              error: `Vous avez déjà envoyé un message. Réessayez dans ${waitMin} minute${waitMin > 1 ? "s" : ""}.`,
            },
            { status: 429 },
          );
        }

        const { data: inserted, error: insertError } = await supabaseAdmin
          .from("support_messages")
          .insert({
            user_id: user.id,
            email: user.email ?? null,
            subject,
            message,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("support insert failed:", insertError);
          return Response.json({ error: "Impossible d'envoyer le message." }, { status: 500 });
        }

        // Best-effort email delivery to the (hidden) support address.
        let delivered = false;
        try {
          const { sendSupportEmail } = await import("@/lib/support-mail.server");
          delivered = await sendSupportEmail({
            subject,
            message,
            fromEmail: user.email ?? "inconnu",
            userId: user.id,
          });
        } catch (err) {
          console.error("support email send failed:", err);
        }

        if (delivered && inserted?.id) {
          await supabaseAdmin
            .from("support_messages")
            .update({ delivered: true })
            .eq("id", inserted.id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
