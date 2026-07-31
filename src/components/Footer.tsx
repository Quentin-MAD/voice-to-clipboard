import { Link } from "@tanstack/react-router";
import logoBlanc from "@/assets/TalKing-blanc.svg.asset.json";

export function Footer() {
  if (typeof window !== "undefined" && (window as any).voxElectron) return null;
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-border bg-primary text-primary-foreground">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <img src={logoBlanc.url} alt="TalKing" draggable={false} onDragStart={(e) => e.preventDefault()} className="h-20 w-auto shrink-0 select-none" />
            <div>
              <div className="text-lg font-semibold text-primary-foreground notranslate">TalKing</div>
              <p className="mt-1 max-w-sm text-sm text-primary-foreground/80">
                Traducteur vocal en temps réel. Enregistrez avec un raccourci, récupérez la traduction dans votre presse-papiers.
              </p>
            </div>
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
            <a
              href="mailto:rossetquentin26@gmail.com"
              className="text-primary-foreground/80 hover:text-primary-foreground"
            >
              Contact
            </a>
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-4 text-xs text-primary-foreground/80 md:flex-row md:items-center md:justify-between">
          <div>© {year} Quentin Rosset - <span className="notranslate">TalKing</span>. Tous droits réservés.</div>
          <div>
            Paiements traités en toute sécurité par notre revendeur Paddle.com (Merchant of Record).
          </div>
        </div>
      </div>
    </footer>
  );
}
