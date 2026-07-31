import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

/**
 * Connexion intégrée à l'app mobile.
 *
 * Important : l'app installée (PWA) a un scope limité à /mobile. Toute
 * navigation vers /auth sortirait du scope et ferait ouvrir le site web dans
 * le navigateur au lieu de rester dans l'application. On affiche donc le
 * formulaire de connexion directement à l'intérieur de /mobile.
 */
export function MobileAuthPanel({ logoUrl, brand }: { logoUrl?: string; brand?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/mobile` },
        });
        if (error) throw error;
        setPendingEmail(email);
        toast.success("Vérifiez votre boîte mail pour activer le compte.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Connexion réussie");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const signInGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/mobile`,
      });
      if (result.error) throw new Error(String(result.error));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur Google");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 notranslate">
          {logoUrl && <img src={logoUrl} alt={brand ?? "TalKing"} className="h-12 w-12" draggable={false} />}
          <span className="text-2xl font-bold">
            {brand ?? "TalKing"}
            <span className="ml-0.5 text-[0.6em] align-super">®</span>
          </span>
        </div>

        <h2 className="mt-6 text-center text-lg font-semibold">
          {mode === "signin" ? "Connexion" : "Créer un compte"}
        </h2>

        {pendingEmail && (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
            Email de vérification envoyé à {pendingEmail}. Validez-le puis revenez ici.
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-white/30"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-white/30"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-60"
          >
            {busy ? "Patientez…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>

        <button
          onClick={signInGoogle}
          disabled={busy}
          className="mt-3 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-medium hover:bg-white/5 disabled:opacity-60"
        >
          Continuer avec Google
        </button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-5 w-full text-center text-xs text-white/60 underline"
        >
          {mode === "signin" ? "Pas encore de compte ? Créer un compte" : "J'ai déjà un compte"}
        </button>
      </div>
    </div>
  );
}
