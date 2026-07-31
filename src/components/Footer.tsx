import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { SupportDialog } from "@/components/SupportDialog";
import logoBlanc from "@/assets/TalKing-blanc.svg.asset.json";

export function Footer() {
  const [supportOpen, setSupportOpen] = useState(false);
  if (typeof window !== "undefined" && (window as any).voxElectron) return null;
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-16 border-t border-border bg-primary text-primary-foreground">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(0,72rem)_1fr]">
        <div className="flex items-center justify-center px-4 md:px-0">
          <img
            src={logoBlanc.url}
            alt="TalKing"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="h-28 w-auto select-none md:h-40"
          />
        </div>
        <div className="px-4 py-8">
          <div className="flex flex-col gap-8">
            {/* Top row: brand text + nav links */}
            <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-start">
              <div className="max-w-xs">
                <div className="text-lg font-semibold text-primary-foreground notranslate">TalKing</div>
                <p className="mt-1 text-sm text-primary-foreground/80">
                  Traducteur vocal en temps réel. Enregistrez avec un raccourci, récupérez la traduction dans votre presse-papiers.
                </p>
              </div>

              <nav className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-2">
                <Link to="/legal/terms" className="text-primary-foreground/80 hover:text-primary-foreground">
                  Conditions
                </Link>
                <Link to="/legal/privacy" className="text-primary-foreground/80 hover:text-primary-foreground">
                  Confidentialité
                </Link>
                <Link to="/legal/refunds" className="text-primary-foreground/80 hover:text-primary-foreground">
                  Remboursements
                </Link>
                <Link to="/legal/notice" className="text-primary-foreground/80 hover:text-primary-foreground">
                  Mentions légales
                </Link>
                <Link to="/pricing" className="text-primary-foreground/80 hover:text-primary-foreground">
                  Plans
                </Link>
                <button
                  type="button"
                  onClick={() => setSupportOpen(true)}
                  className="text-left text-primary-foreground/80 hover:text-primary-foreground"
                >
                  Contact
                </button>
              </nav>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-2 border-t border-border pt-4 text-xs text-primary-foreground/80 md:flex-row md:items-center md:justify-between">
            <div>© {year} Quentin Rosset - <span className="notranslate">TalKing</span>. Tous droits réservés.</div>
            <div>
              Paiements traités en toute sécurité par notre revendeur Paddle.com (Merchant of Record).
            </div>
          </div>
        </div>
      </div>
      {supportOpen && <SupportDialog onClose={() => setSupportOpen(false)} />}
    </footer>
  );
}
