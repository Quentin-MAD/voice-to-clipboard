import { useEffect, useMemo, useState } from "react";
import { Globe } from "lucide-react";

declare global {
  interface Window {
    google?: any;
    googleTranslateElementInit?: () => void;
  }
}

export function GoogleTranslate({ alwaysShow = false }: { alwaysShow?: boolean } = {}) {
  const languages = useMemo(
    () => [
      { code: "fr", label: "Français" },
      { code: "en", label: "Anglais" },
      { code: "es", label: "Espagnol" },
      { code: "de", label: "Allemand" },
      { code: "it", label: "Italien" },
      { code: "pt", label: "Portugais" },
      { code: "nl", label: "Néerlandais" },
      { code: "pl", label: "Polonais" },
      { code: "ru", label: "Russe" },
      { code: "ja", label: "Japonais" },
      { code: "zh-CN", label: "Chinois" },
      { code: "ar", label: "Arabe" },
      { code: "ko", label: "Coréen" },
      { code: "tr", label: "Turc" },
    ],
    []
  );
  const [selectedLanguage, setSelectedLanguage] = useState("fr");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!alwaysShow && (window as any).voxElectron) return;

    const cookieLanguage = document.cookie
      .split("; ")
      .find((row) => row.startsWith("googtrans="))
      ?.split("/")
      .pop();
    if (cookieLanguage) setSelectedLanguage(cookieLanguage);

    if (document.getElementById("google-translate-script")) return;

    window.googleTranslateElementInit = () => {
      if (!window.google?.translate) return;
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "fr",
          includedLanguages: "en,es,de,it,pt,nl,pl,ru,ja,zh-CN,ar,ko,tr,fr",
          autoDisplay: false,
        },
        "google_translate_element"
      );
    };

    const s = document.createElement("script");
    s.id = "google-translate-script";
    s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  const applyLanguage = (languageCode: string) => {
    setSelectedLanguage(languageCode);

    if (languageCode === "fr") {
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${window.location.hostname}`;
      window.location.reload();
      return;
    }

    const translateValue = `/fr/${languageCode}`;
    document.cookie = `googtrans=${translateValue}; path=/`;
    document.cookie = `googtrans=${translateValue}; path=/; domain=.${window.location.hostname}`;

    const googleCombo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
    if (googleCombo) {
      googleCombo.value = languageCode;
      googleCombo.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    window.location.reload();
  };

  if (typeof window !== "undefined" && (window as any).voxElectron) return null;

  return (
    <div className="flex items-center gap-1.5 text-muted-foreground" title="Traduire la page">
      <Globe className="h-4 w-4" />
      <select
        aria-label="Changer la langue du site"
        className="gtranslate-select"
        value={selectedLanguage}
        onChange={(event) => applyLanguage(event.target.value)}
      >
        {languages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
      <div id="google_translate_element" className="gtranslate-wrapper" aria-hidden="true" />
    </div>
  );
}
