import { Link } from "@tanstack/react-router";

export function Footer() {
  if (typeof window !== "undefined" && (window as any).voxElectron) return null;
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-border bg-background/50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold text-foreground notranslate">TalKing</div>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Traducteur vocal en temps réel. Enregistrez avec un raccourci, récupérez la traduction dans votre presse-papiers.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-2">
            <Link to="/legal/terms" className="text-muted-foreground hover:text-foreground">
              Conditions
            </Link>
            <Link to="/legal/privacy" className="text-muted-foreground hover:text-foreground">
              Confidentialité
            </Link>
            <Link to="/legal/refunds" className="text-muted-foreground hover:text-foreground">
              Remboursements
            </Link>
            <Link to="/legal/notice" className="text-muted-foreground hover:text-foreground">
              Mentions légales
            </Link>
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
              Tarifs
            </Link>
            <a
              href="mailto:rossetquentin26@gmail.com"
              className="text-muted-foreground hover:text-foreground"
            >
              Contact
            </a>
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>© {year} Quentin Rosset - <span className="notranslate">TalKing</span>. Tous droits réservés.</div>
          <div>
            Paiements traités en toute sécurité par notre revendeur Paddle.com (Merchant of Record).
          </div>
        </div>
      </div>
    </footer>
  );
}
