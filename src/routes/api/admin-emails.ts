import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { render } from "@react-email/render";
import { SignupEmail } from "@/lib/email-templates/signup";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { EmailChangeEmail } from "@/lib/email-templates/email-change";

const ADMIN_EMAIL = "rossetquentin26@gmail.com";
const SITE_NAME = "TalKing®";
const SITE_URL = "https://talking-translator.com";
const SAMPLE_URL = `${SITE_URL}/auth?token=EXEMPLE-DE-LIEN-DE-VERIFICATION`;

const TEMPLATES: Record<string, { label: string; subject: string; el: () => React.ReactElement }> = {
  signup: {
    label: "Vérification d'adresse email (inscription)",
    subject: "Confirmez votre adresse email - TalKing®",
    el: () =>
      React.createElement(SignupEmail, {
        siteName: SITE_NAME,
        siteUrl: SITE_URL,
        recipient: "nouveau.membre@exemple.com",
        confirmationUrl: SAMPLE_URL,
      }),
  },
  recovery: {
    label: "Réinitialisation du mot de passe",
    subject: "Réinitialisation de votre mot de passe - TalKing®",
    el: () => React.createElement(RecoveryEmail, { siteName: SITE_NAME, confirmationUrl: SAMPLE_URL }),
  },
  magiclink: {
    label: "Lien de connexion",
    subject: "Votre lien de connexion - TalKing®",
    el: () => React.createElement(MagicLinkEmail, { siteName: SITE_NAME, confirmationUrl: SAMPLE_URL }),
  },
  email_change: {
    label: "Changement d'adresse email",
    subject: "Confirmez votre nouvelle adresse email - TalKing®",
    el: () =>
      React.createElement(EmailChangeEmail, {
        siteName: SITE_NAME,
        oldEmail: "ancienne@exemple.com",
        email: "nouvelle@exemple.com",
        newEmail: "nouvelle@exemple.com",
        confirmationUrl: SAMPLE_URL,
      }),
  },
};

async function checkAdmin(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { error: "unauthorized" as const };
  const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return { error: "unauthorized" as const };
  if ((data.user.email ?? "").toLowerCase() !== ADMIN_EMAIL) return { error: "forbidden" as const };
  return { ok: true as const };
}

export const Route = createFileRoute("/api/admin-emails")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const check = await checkAdmin(request);
        if ("error" in check) {
          return Response.json({ error: check.error }, { status: check.error === "unauthorized" ? 401 : 403 });
        }
        const url = new URL(request.url);
        const type = url.searchParams.get("type") ?? "signup";
        const entry = TEMPLATES[type] ?? TEMPLATES.signup;
        const html = await render(entry.el());

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let pending: Array<{ email: string; created_at: string; expires_in_min: number }> = [];
        try {
          const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          const now = Date.now();
          pending = (data?.users ?? [])
            .filter((u: any) => !(u.email_confirmed_at || u.confirmed_at))
            .map((u: any) => ({
              email: u.email ?? "",
              created_at: u.created_at,
              expires_in_min: Math.round((new Date(u.created_at).getTime() + 2 * 3600_000 - now) / 60000),
            }))
            .sort((a, b) => a.expires_in_min - b.expires_in_min);
        } catch {
          pending = [];
        }

        return Response.json({
          types: Object.entries(TEMPLATES).map(([k, v]) => ({ key: k, label: v.label })),
          type,
          subject: entry.subject,
          from: "TalKing® <noreply@notify.talking-translator.com>",
          html,
          pending,
        });
      },
      POST: async ({ request }) => {
        const check = await checkAdmin(request);
        if ("error" in check) {
          return Response.json({ error: check.error }, { status: check.error === "unauthorized" ? 401 : 403 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = Date.now() - 2 * 3600_000;
        let deleted = 0;
        const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        for (const u of (data?.users ?? []) as any[]) {
          const confirmed = u.email_confirmed_at || u.confirmed_at;
          const hasPassword = (u.identities ?? []).some((i: any) => i.provider === "email");
          if (!confirmed && hasPassword && new Date(u.created_at).getTime() < cutoff) {
            const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id);
            if (!error) deleted++;
          }
        }
        return Response.json({ ok: true, deleted });
      },
    },
  },
});
