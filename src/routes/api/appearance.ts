import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const ADMIN_EMAIL = "rossetquentin26@gmail.com";

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { error: "unauthorized" as const };

  const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return { error: "unauthorized" as const };
  if ((data.user.email ?? "").toLowerCase() !== ADMIN_EMAIL) return { error: "forbidden" as const };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { userId: data.user.id, supabaseAdmin };
}

const appSchema = z.enum(["windows", "mobile"]);
const configSchema = z
  .object({
    colors: z.record(z.string(), z.string().max(64)).optional(),
    typography: z.record(z.string(), z.union([z.string().max(120), z.number()])).optional(),
    texts: z.record(z.string(), z.string().max(400)).optional(),
    logoUrl: z.string().max(400_000).optional(),
    show: z.record(z.string(), z.boolean()).optional(),
  })
  .strict();

const bodySchema = z.union([
  z.object({ action: z.literal("save_draft"), app: appSchema, config: configSchema }),
  z.object({ action: z.literal("publish"), app: appSchema, label: z.string().max(120).optional() }),
  z.object({ action: z.literal("reset_draft"), app: appSchema }),
  z.object({ action: z.literal("restore"), app: appSchema, id: z.string().uuid() }),
]);

export const Route = createFileRoute("/api/appearance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const check = await requireAdmin(request);
        if ("error" in check) {
          return Response.json({ error: check.error }, { status: check.error === "unauthorized" ? 401 : 403 });
        }
        const { supabaseAdmin } = check;
        const [{ data: rows }, { data: history }] = await Promise.all([
          supabaseAdmin.from("app_appearance").select("app,state,config,updated_at"),
          supabaseAdmin
            .from("app_appearance_history")
            .select("id,app,label,created_at")
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
        return Response.json({ rows: rows ?? [], history: history ?? [] });
      },

      POST: async ({ request }) => {
        const check = await requireAdmin(request);
        if ("error" in check) {
          return Response.json({ error: check.error }, { status: check.error === "unauthorized" ? 401 : 403 });
        }
        const { supabaseAdmin, userId } = check;

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
        const body = parsed.data;

        if (body.action === "save_draft") {
          const { error } = await supabaseAdmin.from("app_appearance").upsert(
            { app: body.app, state: "draft", config: body.config, updated_at: new Date().toISOString(), updated_by: userId },
            { onConflict: "app,state" },
          );
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ ok: true });
        }

        if (body.action === "publish") {
          const { data: draft } = await supabaseAdmin
            .from("app_appearance")
            .select("config")
            .eq("app", body.app)
            .eq("state", "draft")
            .maybeSingle();
          const config = draft?.config ?? {};
          const { error } = await supabaseAdmin.from("app_appearance").upsert(
            { app: body.app, state: "published", config, updated_at: new Date().toISOString(), updated_by: userId },
            { onConflict: "app,state" },
          );
          if (error) return Response.json({ error: error.message }, { status: 500 });
          await supabaseAdmin.from("app_appearance_history").insert({
            app: body.app,
            config,
            label: body.label ?? null,
            created_by: userId,
          });
          return Response.json({ ok: true });
        }

        if (body.action === "reset_draft") {
          const { data: published } = await supabaseAdmin
            .from("app_appearance")
            .select("config")
            .eq("app", body.app)
            .eq("state", "published")
            .maybeSingle();
          const { error } = await supabaseAdmin.from("app_appearance").upsert(
            {
              app: body.app,
              state: "draft",
              config: published?.config ?? {},
              updated_at: new Date().toISOString(),
              updated_by: userId,
            },
            { onConflict: "app,state" },
          );
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ ok: true, config: published?.config ?? {} });
        }

        // restore
        const { data: version } = await supabaseAdmin
          .from("app_appearance_history")
          .select("config,app")
          .eq("id", body.id)
          .maybeSingle();
        if (!version || version.app !== body.app) return Response.json({ error: "not_found" }, { status: 404 });
        const { error } = await supabaseAdmin.from("app_appearance").upsert(
          {
            app: body.app,
            state: "draft",
            config: version.config,
            updated_at: new Date().toISOString(),
            updated_by: userId,
          },
          { onConflict: "app,state" },
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, config: version.config });
      },
    },
  },
});
