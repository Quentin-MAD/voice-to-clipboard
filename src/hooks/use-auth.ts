import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Keep the same `user` object identity when the underlying user id does not
    // change: Supabase emits auth events on token refresh and on cross-tab /
    // cross-iframe sync, and a fresh object each time re-triggers every effect
    // that depends on `user` (which caused an endless reload loop on /admin).
    const applyUser = (next: User | null) =>
      setUser((prev) => (prev?.id && prev.id === next?.id ? prev : next));

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      applyUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      applyUser(s?.user ?? null);
    });

    // L'app Windows reste souvent en arrière-plan : on force la reprise du
    // rafraîchissement automatique du jeton pour éviter les déconnexions.
    const revive = () => {
      try {
        supabase.auth.startAutoRefresh();
      } catch {
        /* noop */
      }
      void supabase.auth.getSession();
    };
    revive();
    const interval = window.setInterval(revive, 10 * 60 * 1000);
    window.addEventListener("focus", revive);
    document.addEventListener("visibilitychange", revive);
    window.addEventListener("online", revive);

    return () => {
      sub.subscription.unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("focus", revive);
      document.removeEventListener("visibilitychange", revive);
      window.removeEventListener("online", revive);
    };
  }, []);



  return { session, user, loading };
}
