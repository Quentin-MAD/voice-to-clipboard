// Runtime-editable appearance for the Windows (Electron) app and the Mobile PWA.
// Config is stored in the database (draft + published) and applied at runtime,
// so the look of both apps can change without rebuilding the installer.

export type AppKey = "windows" | "mobile";
export type AppearanceState = "draft" | "published";

export type AppearanceColors = {
  bg: string;
  surface: string;
  primary: string;
  text: string;
  muted: string;
};

export type AppearanceTypography = {
  headingFont: string;
  bodyFont: string;
  scale: number; // 0.85 - 1.25
  radius: number; // px
};

export type AppearanceConfig = {
  colors: AppearanceColors;
  typography: AppearanceTypography;
  texts: Record<string, string>;
  logoUrl: string; // data URI or absolute/relative URL
  show: Record<string, boolean>;
};

export const FONT_OPTIONS = [
  { value: "Poppins, sans-serif", label: "Poppins" },
  { value: "Roboto, sans-serif", label: "Roboto" },
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "'Segoe UI', system-ui, sans-serif", label: "Segoe UI" },
  { value: "Georgia, serif", label: "Georgia" },
] as const;

export const WINDOWS_TEXT_FIELDS = [
  { key: "brand", label: "Nom affiché (haut de fenêtre)" },
  { key: "tagline", label: "Sous-titre (version web)" },
  { key: "banner", label: "Bandeau d'information (vide = masqué)" },
  { key: "hint", label: "Message d'aide sous le bouton" },
] as const;

export const MOBILE_TEXT_FIELDS = [
  { key: "brand", label: "Nom affiché (en-tête)" },
  { key: "banner", label: "Bandeau d'information (vide = masqué)" },
  { key: "dialogueHint", label: "Texte au-dessus des langues" },
  { key: "buttonHint", label: "Message sous le bouton d'enregistrement" },
] as const;

export const WINDOWS_TOGGLES = [
  { key: "credits", label: "Afficher le compteur de crédits" },
  { key: "email", label: "Afficher l'email et le statut" },
  { key: "settings", label: "Afficher le bouton Paramètres" },
  { key: "translate", label: "Afficher le sélecteur de langue d'interface" },
] as const;

export const MOBILE_TOGGLES = [
  { key: "credits", label: "Afficher la carte de crédits" },
  { key: "email", label: "Afficher l'email et le statut" },
  { key: "usage", label: "Afficher le compteur d'utilisation" },
  { key: "transcript", label: "Afficher la transcription et la traduction" },
] as const;

export const DEFAULT_APPEARANCE: Record<AppKey, AppearanceConfig> = {
  windows: {
    colors: {
      bg: "#0A0A29",
      surface: "#12123a",
      primary: "#3F44D2",
      text: "#FFFFFF",
      muted: "#DBDBDF",
    },
    typography: { headingFont: "Poppins, sans-serif", bodyFont: "Roboto, sans-serif", scale: 1, radius: 10 },
    texts: {
      brand: "TalKing",
      tagline: "Traducteur vocal push-to-talk. Enregistrez → transcription → traduction → presse-papiers.",
      banner: "",
      hint: "",
    },
    logoUrl: "/logo-white.svg",
    show: { credits: true, email: true, settings: true, translate: true },
  },
  mobile: {
    colors: {
      bg: "#0A0A29",
      surface: "#12123a",
      primary: "#3F44D2",
      text: "#FFFFFF",
      muted: "#DBDBDF",
    },
    typography: { headingFont: "Poppins, sans-serif", bodyFont: "Roboto, sans-serif", scale: 1, radius: 16 },
    texts: {
      brand: "TalKing",
      banner: "",
      dialogueHint: "Dialogue - chacun parle sa langue, chacun son tour",
      buttonHint: "Après la lecture, le tour passe automatiquement à l'autre personne.",
    },
    logoUrl: "/logo-app-mobile.svg",
    show: { credits: true, email: true, usage: true, transcript: true },
  },
};

export function mergeAppearance(app: AppKey, raw: unknown): AppearanceConfig {
  const base = DEFAULT_APPEARANCE[app];
  const cfg = (raw ?? {}) as Partial<AppearanceConfig>;
  return {
    colors: { ...base.colors, ...(cfg.colors ?? {}) },
    typography: { ...base.typography, ...(cfg.typography ?? {}) },
    texts: { ...base.texts, ...(cfg.texts ?? {}) },
    logoUrl: typeof cfg.logoUrl === "string" && cfg.logoUrl ? cfg.logoUrl : base.logoUrl,
    show: { ...base.show, ...(cfg.show ?? {}) },
  };
}

/** CSS custom properties applied on the app root element. */
export function appearanceStyle(cfg: AppearanceConfig): React.CSSProperties {
  const { colors, typography } = cfg;
  return {
    // Skin tokens consumed by src/styles.css
    ["--skin-bg" as string]: colors.bg,
    ["--skin-surface" as string]: colors.surface,
    ["--skin-primary" as string]: colors.primary,
    ["--skin-text" as string]: colors.text,
    ["--skin-muted" as string]: colors.muted,
    ["--skin-radius" as string]: `${typography.radius}px`,
    ["--skin-heading-font" as string]: typography.headingFont,
    ["--skin-body-font" as string]: typography.bodyFont,
    ["--skin-scale" as string]: String(typography.scale),
  } as React.CSSProperties;
}
