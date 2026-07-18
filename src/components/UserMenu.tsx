import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Mail, User as UserIcon, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const SUPPORT_EMAIL = "rossetquentin26@gmail.com";

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
              className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent"
            >
              <UserIcon className="h-4 w-4" />
              Mon profil
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setSupportOpen(true);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent"
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
      {supportOpen && (
        <SupportModal email={SUPPORT_EMAIL} onClose={() => setSupportOpen(false)} />
      )}
    </>
  );
}


function ProfileModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [newEmail, setNewEmail] = useState(email);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const updates: { email?: string; password?: string } = {};
      if (newEmail && newEmail !== email) updates.email = newEmail;
      if (newPassword) {
        if (newPassword.length < 6) throw new Error("Mot de passe: 6 caractères minimum");
        updates.password = newPassword;
      }
      if (!updates.email && !updates.password) {
        toast.info("Aucun changement");
        return;
      }
      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;
      toast.success(
        updates.email
          ? "Vérifiez votre nouvelle adresse email pour confirmer"
          : "Profil mis à jour",
      );
      onClose();
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
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl"
      >
        <h2 className="text-lg font-bold">Mon profil</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Modifiez votre email ou votre mot de passe.
        </p>
        <form onSubmit={save} className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Nouveau mot de passe</label>
            <div className="relative mt-1">
              <KeyRound className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                placeholder="Laisser vide pour ne pas changer"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 pl-8 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent"
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
      </div>
    </div>
  );
}

function SupportModal({ email, onClose }: { email: string; onClose: () => void }) {
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Adresse email copiée");
    } catch {
      toast.error("Impossible de copier");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl text-center"
      >
        <h2 className="text-lg font-bold">Contacter le support</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Envoyez-nous un email à l'adresse ci-dessous :
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background p-2">
          <span className="flex-1 truncate px-2 text-sm font-mono">{email}</span>
          <button
            type="button"
            onClick={copyEmail}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Copier
          </button>
        </div>
        <button
          onClick={onClose}
          className="mt-5 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
