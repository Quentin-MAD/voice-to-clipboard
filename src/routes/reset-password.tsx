import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe - TalKing" },
      {
        name: "description",
        content:
          "Choisissez un nouveau mot de passe pour votre compte TalKing après avoir demandé une réinitialisation.",
      },
      { property: "og:title", content: "Nouveau mot de passe - TalKing" },
      {
        property: "og:description",
        content: "Choisissez un nouveau mot de passe pour votre compte TalKing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const errDesc = url.searchParams.get("error_description");
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (errDesc) {
        if (!cancelled) setStatus("invalid");
        return;
      }

      try {
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          window.history.replaceState({}, "", url.pathname);
        } else if (code) {
          await supabase.auth.exchangeCodeForSession(code);
          window.history.replaceState({}, "", url.pathname);
        }
      } catch {
        /* la vérification de session ci-dessous décide */
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setStatus(data.session ? "ready" : "invalid");
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const pwdChecks = {
    length: password.length >= 6,
    letter: /[A-Za-z]/.test(password),
  };
  const pwdValid = pwdChecks.length && pwdChecks.letter;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwdValid) {
      toast.error("Mot de passe : min. 6 caractères, dont 1 lettre.");
      return;
    }
    if (password !== confirm) {
      toast.error("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Mot de passe mis à jour.");
      setTimeout(() => navigate({ to: "/app", replace: true }), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Retour
        </Link>
        <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-lg">
          <h1 className="mb-1 text-2xl font-bold">Nouveau mot de passe</h1>

          {status === "checking" && (
            <p className="text-sm text-muted-foreground">Vérification du lien…</p>
          )}

          {status === "invalid" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Ce lien de réinitialisation est invalide ou expiré. Demandez-en un nouveau
                depuis la page de connexion.
              </p>
              <Link
                to="/auth"
                className="inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Retour à la connexion
              </Link>
            </div>
          )}

          {status === "ready" && !done && (
            <>
              <p className="mb-6 text-sm text-muted-foreground">
                Choisissez le nouveau mot de passe de votre compte{" "}
                <span className="notranslate">TalKing</span>.
              </p>
              <form onSubmit={onSubmit} className="space-y-3">
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Nouveau mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Confirmez le mot de passe"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <ul className="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                  <li className={pwdChecks.length ? "text-emerald-600" : "text-muted-foreground"}>
                    {pwdChecks.length ? "✓" : "○"} Au moins 6 caractères
                  </li>
                  <li className={pwdChecks.letter ? "text-emerald-600" : "text-muted-foreground"}>
                    {pwdChecks.letter ? "✓" : "○"} Au moins 1 lettre (a-z)
                  </li>
                </ul>
                <button
                  type="submit"
                  disabled={loading || !pwdValid}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? "…" : "Enregistrer le nouveau mot de passe"}
                </button>
              </form>
            </>
          )}

          {done && (
            <p className="text-sm text-muted-foreground">
              Mot de passe mis à jour. Redirection en cours…
            </p>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
