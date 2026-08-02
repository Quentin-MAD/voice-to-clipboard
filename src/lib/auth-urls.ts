/**
 * Base URL utilisée dans les liens envoyés par email (confirmation, magic link,
 * réinitialisation). Les emails sont ouverts en dehors du contexte d'origine
 * (autre navigateur, autre appareil, app Windows/PWA) : le lien doit donc
 * toujours pointer vers le domaine public et stable du site, sauf en preview.
 */
const CANONICAL = "https://talking-translator.com";

export function emailLinkOrigin(): string {
  if (typeof window === "undefined") return CANONICAL;
  const host = window.location.hostname;
  const isPreview =
    host === "localhost" ||
    host === "127.0.0.1" ||
    (host.endsWith(".lovable.app") && host.includes("-preview"));
  return isPreview ? window.location.origin : CANONICAL;
}
