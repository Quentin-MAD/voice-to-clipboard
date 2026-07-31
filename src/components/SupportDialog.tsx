import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function SupportDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Vous devez être connecté pour contacter le support.");
      return;
    }
    if (subject.trim().length < 3) {
      toast.error("Indiquez un objet (3 caractères minimum).");
      return;
    }
    if (message.trim().length < 10) {
      toast.error("Votre message doit contenir au moins 10 caractères.");
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Session expirée, reconnectez-vous.");

      const res = await fetch("/api/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Envoi impossible");

      setSent(true);
      toast.success("Message envoyé au support");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-black shadow-2xl"
      >
        <h2 className="text-lg font-bold text-black">Contacter le support</h2>

        {!user ? (
          <>
            <p className="mt-3 text-sm text-black">
              Vous devez être connecté à votre compte pour envoyer un message au support.
            </p>
            <button
              onClick={onClose}
              className="mt-5 rounded-md border border-border bg-background px-3 py-2 text-sm text-black hover:bg-accent"
            >
              Fermer
            </button>
          </>
        ) : sent ? (
          <>
            <p className="mt-3 text-sm text-black">
              Merci, votre message a bien été transmis. Nous vous répondrons par email à
              l'adresse de votre compte.
            </p>
            <button
              onClick={onClose}
              className="mt-5 rounded-md border border-border bg-background px-3 py-2 text-sm text-black hover:bg-accent"
            >
              Fermer
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-black" htmlFor="support-subject">
                Objet
              </label>
              <input
                id="support-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={150}
                placeholder="Objet de votre demande"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-black"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black" htmlFor="support-message">
                Message
              </label>
              <textarea
                id="support-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={4000}
                rows={6}
                placeholder="Décrivez votre demande..."
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-black"
              />
              <p className="mt-1 text-xs text-black/60">{message.length}/4000 - 1 message par heure</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-black hover:bg-accent"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {loading ? "Envoi..." : "Envoyer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
