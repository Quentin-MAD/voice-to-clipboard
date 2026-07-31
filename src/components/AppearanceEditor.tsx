import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_APPEARANCE,
  FONT_OPTIONS,
  MOBILE_TEXT_FIELDS,
  MOBILE_TOGGLES,
  WINDOWS_TEXT_FIELDS,
  WINDOWS_TOGGLES,
  mergeAppearance,
  type AppKey,
  type AppearanceConfig,
} from "@/lib/appearance";

type HistoryRow = { id: string; app: AppKey; label: string | null; created_at: string };

const COLOR_FIELDS = [
  { key: "bg", label: "Fond" },
  { key: "surface", label: "Panneaux" },
  { key: "primary", label: "Couleur principale" },
  { key: "text", label: "Texte" },
  { key: "muted", label: "Texte secondaire" },
] as const;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

export function AppearanceEditor() {
  const [app, setApp] = useState<AppKey>("windows");
  const [drafts, setDrafts] = useState<Record<AppKey, AppearanceConfig>>({
    windows: DEFAULT_APPEARANCE.windows,
    mobile: DEFAULT_APPEARANCE.mobile,
  });
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const config = drafts[app];
  const textFields = app === "windows" ? WINDOWS_TEXT_FIELDS : MOBILE_TEXT_FIELDS;
  const toggles = app === "windows" ? WINDOWS_TOGGLES : MOBILE_TOGGLES;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/appearance", { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "load_failed");
      const next = { windows: DEFAULT_APPEARANCE.windows, mobile: DEFAULT_APPEARANCE.mobile } as Record<AppKey, AppearanceConfig>;
      for (const row of (json.rows ?? []) as Array<{ app: AppKey; state: string; config: unknown }>) {
        if (row.state === "draft") next[row.app] = mergeAppearance(row.app, row.config);
      }
      setDrafts(next);
      setHistory(json.history ?? []);
      setDirty(false);
    } catch (e) {
      toast.error("Impossible de charger l'apparence");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pushPreview = useCallback((cfg: AppearanceConfig, target: AppKey) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "talking:appearance", app: target, config: cfg },
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    const onReady = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as { type?: string; app?: AppKey };
      if (payload?.type === "talking:appearance-ready" && payload.app === app) {
        pushPreview(drafts[app], app);
      }
    };
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [app, drafts, pushPreview]);

  const update = (patch: (cfg: AppearanceConfig) => AppearanceConfig) => {
    setDrafts((prev) => {
      const next = { ...prev, [app]: patch(prev[app]) };
      pushPreview(next[app], app);
      return next;
    });
    setDirty(true);
  };

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/appearance", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "failed");
      return json as { config?: unknown };
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    try {
      await post({ action: "save_draft", app, config });
      setDirty(false);
      toast.success("Brouillon enregistré");
    } catch {
      toast.error("Échec de l'enregistrement");
    }
  };

  const publish = async () => {
    if (dirty) await saveDraft();
    try {
      await post({ action: "publish", app, label: `Publication ${new Date().toLocaleString("fr-FR")}` });
      toast.success(`Apparence publiée pour l'app ${app === "windows" ? "Windows" : "Mobile"}`);
      await load();
    } catch {
      toast.error("Échec de la publication");
    }
  };

  const resetDraft = async () => {
    try {
      const json = await post({ action: "reset_draft", app });
      const cfg = mergeAppearance(app, json.config);
      setDrafts((prev) => ({ ...prev, [app]: cfg }));
      pushPreview(cfg, app);
      setDirty(false);
      toast.success("Brouillon réinitialisé sur la version publiée");
    } catch {
      toast.error("Échec de la réinitialisation");
    }
  };

  const restore = async (id: string) => {
    try {
      const json = await post({ action: "restore", app, id });
      const cfg = mergeAppearance(app, json.config);
      setDrafts((prev) => ({ ...prev, [app]: cfg }));
      pushPreview(cfg, app);
      setDirty(true);
      toast.success("Version restaurée dans le brouillon");
    } catch {
      toast.error("Échec de la restauration");
    }
  };

  const onLogoFile = (file: File) => {
    if (file.size > 250_000) {
      toast.error("Logo trop lourd (250 Ko max)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update((c) => ({ ...c, logoUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const previewSrc = `${app === "windows" ? "/app" : "/mobile"}?skin=draft`;
  // Real device sizes: Electron window vs phone screen.
  const previewW = app === "windows" ? 1180 : 390;
  const previewH = app === "windows" ? 760 : 780;
  const scale = Math.min(1, boxWidth ? (boxWidth - 24) / previewW : 1);

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">Chargement de l'éditeur…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["windows", "mobile"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setApp(k)}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-semibold " +
              (app === k ? "bg-primary text-primary-foreground" : "border border-border")
            }
          >
            {k === "windows" ? "App Windows" : "App Mobile"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600">Modifications non enregistrées</span>}
          <button onClick={resetDraft} disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-sm">
            Réinitialiser
          </button>
          <button onClick={saveDraft} disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-sm">
            Enregistrer le brouillon
          </button>
          <button onClick={publish} disabled={busy} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
            Publier
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Couleurs</h3>
            <div className="space-y-2">
              {COLOR_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.colors[f.key]}
                      onChange={(e) => update((c) => ({ ...c, colors: { ...c.colors, [f.key]: e.target.value } }))}
                      className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                    />
                    <input
                      value={config.colors[f.key]}
                      onChange={(e) => update((c) => ({ ...c, colors: { ...c.colors, [f.key]: e.target.value } }))}
                      className="w-24 rounded border border-border bg-background px-2 py-1 text-xs"
                    />
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Typographie et formes</h3>
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="text-muted-foreground">Police des titres</span>
                <select
                  value={config.typography.headingFont}
                  onChange={(e) => update((c) => ({ ...c, typography: { ...c.typography, headingFont: e.target.value } }))}
                  className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5"
                >
                  {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-muted-foreground">Police du texte</span>
                <select
                  value={config.typography.bodyFont}
                  onChange={(e) => update((c) => ({ ...c, typography: { ...c.typography, bodyFont: e.target.value } }))}
                  className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5"
                >
                  {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-muted-foreground">Taille du texte ({config.typography.scale.toFixed(2)}×)</span>
                <input
                  type="range" min={0.85} max={1.25} step={0.05}
                  value={config.typography.scale}
                  onChange={(e) => update((c) => ({ ...c, typography: { ...c.typography, scale: Number(e.target.value) } }))}
                  className="mt-1 w-full"
                />
              </label>
              <label className="block">
                <span className="text-muted-foreground">Arrondi des coins ({config.typography.radius} px)</span>
                <input
                  type="range" min={0} max={28} step={1}
                  value={config.typography.radius}
                  onChange={(e) => update((c) => ({ ...c, typography: { ...c.typography, radius: Number(e.target.value) } }))}
                  className="mt-1 w-full"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Textes</h3>
            <div className="space-y-3 text-sm">
              {textFields.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-muted-foreground">{f.label}</span>
                  <textarea
                    rows={2}
                    value={config.texts[f.key] ?? ""}
                    onChange={(e) => update((c) => ({ ...c, texts: { ...c.texts, [f.key]: e.target.value } }))}
                    className="mt-1 w-full resize-y rounded border border-border bg-background px-2 py-1.5"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Logo</h3>
            <div className="flex items-center gap-3">
              <img src={config.logoUrl} alt="Logo" className="h-12 w-12 rounded bg-[#0A0A29] object-contain p-1" />
              <div className="space-y-1 text-xs">
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogoFile(f); }} />
                <button
                  onClick={() => update((c) => ({ ...c, logoUrl: DEFAULT_APPEARANCE[app].logoUrl }))}
                  className="block text-muted-foreground underline"
                >
                  Remettre le logo par défaut
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Éléments affichés</h3>
            <div className="space-y-2 text-sm">
              {toggles.map((t) => (
                <label key={t.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.show[t.key] !== false}
                    onChange={(e) => update((c) => ({ ...c, show: { ...c.show, [t.key]: e.target.checked } }))}
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Publications récentes</h3>
            {history.filter((h) => h.app === app).length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucune publication pour le moment.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {history.filter((h) => h.app === app).map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">
                      {h.label ?? new Date(h.created_at).toLocaleString("fr-FR")}
                    </span>
                    <button onClick={() => restore(h.id)} className="shrink-0 underline">Restaurer</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Aperçu en direct (brouillon)</h3>
            <button onClick={() => iframeRef.current?.contentWindow?.location.reload()} className="text-xs underline">
              Recharger
            </button>
          </div>
          <div
            ref={previewBoxRef}
            className="flex justify-center overflow-hidden rounded-lg bg-black/20 p-3"
            style={{ height: previewH * scale + 24 }}
          >
            <div style={{ width: previewW * scale, height: previewH * scale }}>
              <iframe
                ref={iframeRef}
                key={app}
                src={previewSrc}
                title="Aperçu de l'application"
                className="rounded-lg border border-border bg-background"
                style={{
                  width: previewW,
                  height: previewH,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            L'aperçu reproduit la fenêtre réelle ({previewW}×{previewH}) à l'échelle {Math.round(scale * 100)} %.
            Les utilisateurs ne voient les changements qu'après un clic sur Publier.
          </p>
        </div>
      </div>
    </div>
  );
}
