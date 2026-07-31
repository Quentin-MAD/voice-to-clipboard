import { useEffect, useState } from "react";

/**
 * When a normal website page (not /mobile) is displayed inside the installed
 * PWA, we never auto-redirect (that caused an infinite host ping-pong loop).
 * We only offer a manual "open in browser" escape hatch.
 */
export function StandaloneSiteNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const path = window.location.pathname;
    const isMobileRoute = path === "/mobile" || path.startsWith("/mobile/");
    if (isStandalone && !isMobileRoute) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Vous consultez le site web depuis l'application TalKing.
        </p>
        <div className="flex shrink-0 gap-2">
          <a
            href="/mobile"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Ouvrir l'app
          </a>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
