import { Link } from "@tanstack/react-router";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-border bg-background/50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold text-foreground">TalKing</div>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Real-time voice translator. Record with a hotkey, get the translation in your clipboard.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-2">
            <Link to="/legal/terms" className="text-muted-foreground hover:text-foreground">
              Terms
            </Link>
            <Link to="/legal/privacy" className="text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            <Link to="/legal/refunds" className="text-muted-foreground hover:text-foreground">
              Refunds
            </Link>
            <Link to="/legal/notice" className="text-muted-foreground hover:text-foreground">
              Legal notice
            </Link>
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
              Pricing
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
          <div>© {year} Quentin Rosset - TalKing. All rights reserved.</div>
          <div>
            Payments securely processed by our reseller Paddle.com (Merchant of Record).
          </div>
        </div>
      </div>
    </footer>
  );
}
