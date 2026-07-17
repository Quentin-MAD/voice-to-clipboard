import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/track-view")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { path, session_id, user_id } = (await request.json().catch(() => ({}))) as {
            path?: string;
            session_id?: string;
            user_id?: string;
          };
          if (!path || typeof path !== "string" || path.length > 500) {
            return Response.json({ ok: false }, { status: 400 });
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("page_views").insert({
            path,
            session_id: session_id ?? null,
            user_id: user_id ?? null,
          });
          return Response.json({ ok: true });
        } catch (e) {
          console.error("track-view failed:", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
