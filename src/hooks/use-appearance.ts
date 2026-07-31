import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_APPEARANCE,
  mergeAppearance,
  type AppKey,
  type AppearanceConfig,
} from "@/lib/appearance";

/**
 * Loads the appearance config for an app.
 * - Normal mode: the published config (readable by everyone).
 * - Preview mode (`?skin=draft`): the draft config (admins only) and live
 *   updates pushed by the admin editor through postMessage.
 */
export function useAppearance(app: AppKey): { config: AppearanceConfig; preview: boolean } {
  const [preview, setPreview] = useState(false);
  const [config, setConfig] = useState<AppearanceConfig>(DEFAULT_APPEARANCE[app]);

  useEffect(() => {
    let cancelled = false;
    const isDraft =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).get("skin") === "draft";
    setPreview(isDraft);

    const fetchConfig = async () => {
      const { data, error } = await supabase
        .from("app_appearance")
        .select("config")
        .eq("app", app)
        .eq("state", isDraft ? "draft" : "published")
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[appearance] load failed", error.message);
        return;
      }
      if (data?.config) setConfig(mergeAppearance(app, data.config));
    };

    void fetchConfig();

    if (!isDraft) {
      // Apply published changes instantly in every running app. The focus and
      // polling listeners remain as a fallback for suspended phones or a
      // temporarily interrupted realtime connection.
      const channel = supabase
        .channel(`appearance:${app}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "app_appearance",
            filter: "state=eq.published",
          },
          (payload) => {
            const row = payload.new as { app?: string; state?: string; config?: unknown } | undefined;
            if (cancelled || row?.app !== app || row.state !== "published") return;
            setConfig(mergeAppearance(app, row.config));
          },
        )
        .subscribe();

      const onVisible = () => {
        if (document.visibilityState === "visible") void fetchConfig();
      };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", onVisible);
      const timer = window.setInterval(() => void fetchConfig(), 15_000);
      return () => {
        cancelled = true;
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", onVisible);
        window.clearInterval(timer);
        void supabase.removeChannel(channel);
      };
    }


    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as { type?: string; app?: string; config?: unknown };
      if (payload?.type !== "talking:appearance" || payload.app !== app) return;
      setConfig(mergeAppearance(app, payload.config));
    };
    window.addEventListener("message", onMessage);
    window.parent?.postMessage({ type: "talking:appearance-ready", app }, window.location.origin);
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
    };
  }, [app]);

  return { config, preview };
}
