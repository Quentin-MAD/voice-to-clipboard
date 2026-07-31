import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { LogOut, Mail, User as UserIcon, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { StatusPill, CreditsCard, useUserStatus } from "@/components/CreditsBadge";
import { SubscriptionPanel } from "@/components/SubscriptionPanel";

import { SupportDialog } from "@/components/SupportDialog";

export function UserMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;

  const initial = (user.email ?? "?").charAt(0).toUpperCase();

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Déconnecté");
    navigate({ to: "/" });
  };


  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1 pr-3 text-sm hover:bg-accent"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {initial}
          </span>
          <span className="hidden sm:inline max-w-[160px] truncate text-muted-foreground">
            {user.email}
          </span>
          <span className="hidden sm:inline"><StatusPill /></span>
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">Connecté</p>
              <p className="truncate text-sm font-medium">{user.email}</p>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                setProfileOpen(true);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-black hover:bg-accent"
            >
              <UserIcon className="h-4 w-4" />
              Mon profil
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setSupportOpen(true);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-black hover:bg-accent"
            >
              <Mail className="h-4 w-4" />
              Contacter le support
            </button>

            <button
              onClick={signOut}
              className="flex w-full items-center gap-2 border-t border-border px-4 py-2 text-sm text-destructive hover:bg-accent"
            >
              <LogOut className="h-4 w-4" />
              Se déconnecter
            </button>
          </div>
        )}
      </div>

      {profileOpen && (
        <ProfileModal email={user.email ?? ""} onClose={() => setProfileOpen(false)} />
      )}
      {supportOpen && <SupportDialog onClose={() => setSupportOpen(false)} />}
    </>
  );
}


function ProfileModal({ email, onClose }: { email: string; onClose: () => void }) {
  const status = useUserStatus();
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const unlimited = !!status && (status.subscribed || status.is_tester);

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (newPassword.length < 6) throw new Error("Mot de passe: 6 caractères minimum");
      if (newPassword !== confirmPassword) throw new Error("Les deux mots de passe ne correspondent pas");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Mot de passe mis à jour");
      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl"
      >
        <h2 className="text-lg font-bold">Mon profil</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Statut, crédits et gestion de votre plan.
        </p>

        <div className="mt-4 space-y-3">
          <CreditsCard manageLabel="Recharger des crédits" />
          <SubscriptionPanel />

          {!status?.is_tester && (
            <Link
              to="/pricing"
              onClick={onClose}
              className="block w-full rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {unlimited ? "Acheter une année supplémentaire" : "Gérer mon plan / recharger"}
            </Link>
          )}
        </div>

        <div className="mt-5 space-y-3 border-t border-border pt-4">
          <div>
            <label className="text-xs text-muted-foreground">Email (non modifiable)</label>
            <input
              type="email"
              value={email}
              readOnly
              disabled
              className="mt-1 w-full cursor-not-allowed rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              L'adresse email liée à votre compte est définitive et ne peut pas être changée.
            </p>
          </div>

          {!showPassword ? (
            <button
              type="button"
              onClick={() => setShowPassword(true)}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-black hover:bg-accent"
            >
              <KeyRound className="h-4 w-4" />
              Modifier mon mot de passe
            </button>
          ) : (
            <form onSubmit={savePassword} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Nouveau mot de passe</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Confirmer le mot de passe</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPassword(false)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-black hover:bg-accent"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? "…" : "Enregistrer"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-black hover:bg-accent"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
