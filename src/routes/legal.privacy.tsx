import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/legal/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Notice - TalKing" },
      { name: "description", content: "How TalKing collects and processes your personal data." },
      { property: "og:title", content: "Privacy Notice - TalKing" },
      { property: "og:url", content: "https://voice-to-clipboard.lovable.app/legal/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://voice-to-clipboard.lovable.app/legal/privacy" }],
  }),
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="mt-4 text-3xl font-bold text-foreground">Privacy Notice</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 17 July 2026</p>

        <div className="prose prose-invert mt-8 max-w-none text-sm text-foreground/90 space-y-6">
          <section>
            <h2 className="text-lg font-semibold">1. Data controller</h2>
            <p>
              The data controller for personal data processed through <span className="notranslate">TalKing</span> is <strong>Quentin Rosset</strong>, sole
              trader, registered in France under SIREN 107 314 445, contact{" "}
              <a className="underline" href="mailto:rossetquentin26@gmail.com">rossetquentin26@gmail.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Data we collect</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account data:</strong> email address, authentication identifiers (e.g. Google ID if you sign in with Google).</li>
              <li><strong>Usage data:</strong> number of translations, timestamps, source/target language, credit balance.</li>
              <li><strong>Voice input:</strong> the short audio you record is transmitted to our server and to AI providers for transcription and translation. It is processed in-memory and not stored on our servers.</li>
              <li><strong>Technical data:</strong> IP address, browser/OS, error logs, needed for security and reliability.</li>
              <li><strong>Payment data:</strong> collected directly by Paddle (our Merchant of Record). We only receive limited billing metadata (order ID, plan, country, last 4 digits).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Purposes and legal bases</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide the service (account, translation, credit management) - <em>performance of contract</em>.</li>
              <li>Security, fraud and abuse prevention (including the 150/day cap) - <em>legitimate interests</em>.</li>
              <li>Billing, tax compliance and accounting - <em>legal obligation</em>.</li>
              <li>Customer support - <em>performance of contract</em> / <em>legitimate interests</em>.</li>
              <li>Product improvement (aggregated statistics only) - <em>legitimate interests</em>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. AI processing of your voice</h2>
            <p>
              Audio is sent to third-party AI providers (OpenAI for transcription, Google Gemini for translation) to produce
              the translated text. We do not use your audio or translations to train models. Providers may process data
              outside the EU under standard contractual clauses.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Recipients / subprocessors</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Hosting & database: Supabase / Cloudflare (EU regions where available).</li>
              <li>AI providers: OpenAI, Google (Gemini) for speech-to-text and translation.</li>
              <li>Payments & invoicing: Paddle.com (Merchant of Record).</li>
              <li>Authentication: Google (if you use Google sign-in).</li>
              <li>Authorities where required by law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. International transfers</h2>
            <p>
              Some subprocessors are based outside the EU/EEA (notably the US). Transfers are covered by Standard
              Contractual Clauses or adequacy decisions as applicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Retention</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Account data: kept while your account is active, deleted within 30 days after account deletion.</li>
              <li>Voice recordings: not stored (processed in-memory only).</li>
              <li>Translation logs: metadata only (no content), kept up to 12 months for abuse prevention.</li>
              <li>Billing records: kept 10 years to comply with French accounting law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Your rights (GDPR)</h2>
            <p>
              You have the right to access, rectify, erase, restrict or object to the processing of your data, to data
              portability, and to withdraw consent at any time. To exercise these rights, contact{" "}
              <a className="underline" href="mailto:rossetquentin26@gmail.com">rossetquentin26@gmail.com</a>. We respond
              within 1 month. You may also lodge a complaint with the French supervisory authority (
              <a className="underline" href="https://www.cnil.fr" target="_blank" rel="noreferrer">CNIL</a>).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Security</h2>
            <p>
              We apply appropriate technical and organisational measures: HTTPS transport, encrypted storage, access
              controls, row-level security in the database, and least-privilege service credentials.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Cookies</h2>
            <p>
              We use strictly necessary cookies/local storage for authentication and to remember your settings (language,
              hotkey). No advertising or third-party tracking cookies are used.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
