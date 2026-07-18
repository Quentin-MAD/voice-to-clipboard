import { useEffect } from "react";
import { Globe } from "lucide-react";

declare global {
  interface Window {
    google?: any;
    googleTranslateElementInit?: () => void;
  }
}

export function GoogleTranslate() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).voxElectron) return;

    if (document.getElementById("google-translate-script")) return;

    window.googleTranslateElementInit = () => {
      if (!window.google?.translate) return;
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "fr",
          includedLanguages: "en,es,de,it,pt,nl,pl,ru,ja,zh-CN,ar,ko,tr,fr",
          autoDisplay: false,
          layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
        },
        "google_translate_element"
      );
    };

    const s = document.createElement("script");
    s.id = "google-translate-script";
    s.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  if (typeof window !== "undefined" && (window as any).voxElectron) return null;

  return (
    <div className="flex items-center gap-1.5 text-muted-foreground" title="Traduire la page">
      <Globe className="h-4 w-4" />
      <div id="google_translate_element" className="gtranslate-wrapper" />
    </div>
  );
}
