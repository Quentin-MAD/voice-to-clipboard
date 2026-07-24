import { useEffect, useState } from "react";
import { Crown, Coins, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Status = {
  subscribed: boolean;
  is_tester: boolean;
  free_remaining: number;
  purchased_balance: number;
  voice_balance: number;
};

export function CreditsBadge({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc("get_user_status", { _user_id: user.id });
      if (!cancelled && !error && data && data[0]) setStatus(data[0] as Status);
    };
    load();
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [user]);

  if (!user || !status) return null;

  const isDark = variant === "dark";
  const base = isDark
    ? "border-white/10 bg-white/5 text-white"
    : "border-border bg-card text-foreground";
  const muted = isDark ? "text-white/60" : "text-muted-foreground";

  if (status.subscribed || status.is_tester) {
    const label = status.is_tester && !status.subscribed ? "Testeur" : "Abonné";
    return (
      <div
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${base}`}
        title={`${label} · crédits illimités`}
      >
        <Crown className="h-3.5 w-3.5 text-amber-400" />
        <span>{label}</span>
        <span className={muted}>·</span>
        <span>∞</span>
      </div>
    );
  }

  const total = status.free_remaining + status.purchased_balance;
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${base}`}
      title={`${status.free_remaining} gratuits + ${status.purchased_balance} achetés · ${status.voice_balance} crédits vocaux`}
    >
      <span className="flex items-center gap-1">
        <Coins className="h-3.5 w-3.5" />
        <span className="font-medium">{total}</span>
      </span>
      <span className={muted}>·</span>
      <span className="flex items-center gap-1">
        <Volume2 className="h-3.5 w-3.5" />
        <span className="font-medium">{status.voice_balance}</span>
      </span>
    </div>
  );
}
