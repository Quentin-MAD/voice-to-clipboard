import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Connexion - TalKing" },
      { name: "description", content: "Connectez-vous à TalKing." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const navigate = useNavigate();
  const search = Route.useSearch();

  useEffect(() => {
    setIsElectron(typeof window !== "undefined" && !!window.voxElectron?.isElectron);
  }, []);

  const getPostAuthPath = (): "/" | "/app" | "/admin" => {
    if (search.redirect === "/admin") return "/admin";
    return typeof window !== "undefined" && window.voxElectron?.isElectron ? "/app" : "/";
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: getPostAuthPath(), replace: true });
    });
  }, [navigate]);

  const pwdChecks = {
    length: password.length >= 6,
    letter: /[A-Za-z]/.test(password),
  };
  const pwdValid = pwdChecks.length && pwdChecks.letter;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && !pwdValid) {
      toast.error("Mot de passe : min. 6 caractères, dont 1 lettre.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        toast.success("Compte créé ! Vous êtes connecté.");
        navigate({ to: getPostAuthPath(), replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Connexion réussie");
        navigate({ to: getPostAuthPath(), replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const signInGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth${search.redirect === "/admin" ? "?redirect=/admin" : ""}`,
      });
      if (result.error) throw new Error(String(result.error));
      if (!result.redirected) navigate({ to: getPostAuthPath(), replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur Google");
      setLoading(false);
    }
  };

  // ============ Electron: native software login ============
  if (isElectron) {
    return (
      <div className="native-app">
        <div className="native-window">
          <div className="native-menubar" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
            <div className="native-brand-inline">
              <span className="native-title notranslate">
                <b>TalKing</b>
                <span className="native-trademark">®</span>
              </span>
            </div>
          </div>

          <div className="native-auth-shell">
            <div className="native-auth-card">
              <div className="native-auth-logo">
                <div className="native-auth-logo-mark">Tk</div>
                <div className="native-auth-logo-glow" aria-hidden />
              </div>

              <h1 className="native-auth-title">
                {mode === "signin" ? (
                  <>Connexion à <span className="notranslate">TalKing</span></>
                ) : (
                  <>Créer un compte <span className="notranslate">TalKing</span></>
                )}
              </h1>
              <p className="native-auth-sub">
                {mode === "signin"
                  ? "Identifiez-vous pour lancer le traducteur vocal."
                  : "Créez votre compte pour commencer à traduire."}
              </p>

              <form onSubmit={onSubmit} className="native-auth-form">
                <label className="native-auth-label">
                  <span>Adresse e-mail</span>
                  <input
                    type="email"
                    required
                    placeholder="vous@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="native-auth-input"
                    autoComplete="email"
                  />
                </label>
                <label className="native-auth-label">
                  <span>Mot de passe</span>
                  <input
                    type="password"
                    required
                    minLength={mode === "signup" ? 8 : 6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="native-auth-input"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  />
                </label>
                {mode === "signup" && (
                  <ul className="native-auth-pwd-req">
                    <li className={pwdChecks.length ? "ok" : ""}>
                      {pwdChecks.length ? "✓" : "○"} Au moins 8 caractères
                    </li>
                    <li className={pwdChecks.letter ? "ok" : ""}>
                      {pwdChecks.letter ? "✓" : "○"} Au moins 1 lettre (a-z)
                    </li>
                    <li className={pwdChecks.digit ? "ok" : ""}>
                      {pwdChecks.digit ? "✓" : "○"} Au moins 1 chiffre (0-9)
                    </li>
                  </ul>
                )}

                <button type="submit" disabled={loading || (mode === "signup" && !pwdValid)} className="native-auth-primary">
                  {loading
                    ? "Connexion…"
                    : mode === "signin"
                    ? "Se connecter"
                    : "Créer mon compte"}
                </button>
              </form>

              <div className="native-auth-sep">
                <span>ou</span>
              </div>

              <button
                onClick={signInGoogle}
                disabled={loading}
                className="native-auth-secondary"
              >
                <svg viewBox="0 0 24 24" className="native-auth-gicon">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continuer avec Google
              </button>

              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="native-auth-switch"
              >
                {mode === "signin"
                  ? "Pas encore de compte ? Créer un compte"
                  : "Déjà un compte ? Se connecter"}
              </button>
            </div>

            <div className="native-auth-footnote">
              <span className="notranslate">TalKing®</span> v0.9.5 · Traducteur vocal
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ Web: original layout ============
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Retour
        </Link>
        <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-lg">
          <h1 className="mb-1 text-2xl font-bold">
            {mode === "signin" ? "Connexion" : "Créer un compte"}
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Accédez à votre compte <span className="notranslate">TalKing</span>.
          </p>

          <button
            onClick={signInGoogle}
            disabled={loading}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continuer avec Google
          </button>

          <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            ou
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="email@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              type="password"
              required
              minLength={mode === "signup" ? 8 : 6}
              placeholder={mode === "signup" ? "Mot de passe (min. 8 caractères)" : "Mot de passe"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {mode === "signup" && (
              <ul className="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                <li className={pwdChecks.length ? "text-emerald-600" : "text-muted-foreground"}>
                  {pwdChecks.length ? "✓" : "○"} Au moins 8 caractères
                </li>
                <li className={pwdChecks.letter ? "text-emerald-600" : "text-muted-foreground"}>
                  {pwdChecks.letter ? "✓" : "○"} Au moins 1 lettre (a-z)
                </li>
                <li className={pwdChecks.digit ? "text-emerald-600" : "text-muted-foreground"}>
                  {pwdChecks.digit ? "✓" : "○"} Au moins 1 chiffre (0-9)
                </li>
              </ul>
            )}
            <button
              type="submit"
              disabled={loading || (mode === "signup" && !pwdValid)}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:underline"
          >
            {mode === "signin"
              ? "Pas encore de compte ? Créer un compte"
              : "Déjà un compte ? Se connecter"}
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
