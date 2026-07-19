import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/legal/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms & Conditions - TalKing" },
      { name: "description", content: "TalKing Terms & Conditions." },
      { property: "og:title", content: "Terms & Conditions - TalKing" },
      { property: "og:url", content: "https://voice-to-clipboard.lovable.app/legal/terms" },
    ],
    links: [{ rel: "canonical", href: "https://voice-to-clipboard.lovable.app/legal/terms" }],
  }),
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="mt-4 text-3xl font-bold text-foreground">Terms & Conditions</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 17 July 2026</p>

        <div className="prose prose-invert mt-8 max-w-none text-sm text-foreground/90 space-y-6">
          <section>
            <h2 className="text-lg font-semibold">1. Seller</h2>
            <p>
              <span className="notranslate">TalKing</span> is a service operated by <strong>Quentin Rosset</strong>, sole trader (entrepreneur individuel)
              registered in France under SIREN 107 314 445 (SIRET 107 314 445 00019), hereinafter "we", "us" or the "Seller".
              By using <span className="notranslate">TalKing</span>, you agree to contract with the Seller under these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Service</h2>
            <p>
              <span className="notranslate">TalKing</span> is a voice translation service: you record a short voice message using a hotkey or a button, the audio
              is transcribed and translated by third-party AI providers, and the translated text is delivered to your
              clipboard. The service is available as a web app and a Windows desktop application.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Acceptance</h2>
            <p>
              By creating an account or continuing to use the service, you confirm you have read, understood and accepted
              these Terms. If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Account & credentials</h2>
            <p>
              You must provide accurate information, keep your credentials confidential and are responsible for any activity
              on your account. You must be of legal age in your country of residence.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Acceptable use</h2>
            <p>You must not:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>use the service for unlawful, fraudulent, infringing or abusive purposes;</li>
              <li>send spam, malware or attempt to break, probe or scrape the service;</li>
              <li>submit content you do not have the right to submit;</li>
              <li>use the service to generate content that is illegal, hateful, defamatory or that harms minors;</li>
              <li>reverse engineer, resell or redistribute the service or circumvent its technical limits (including the
              50 translations per hour anti-abuse cap).</li>
            </ul>
            <p>
              You are responsible for what you record, for how you use the translated output, and for verifying its accuracy
              before relying on it (translations are AI-generated and may contain errors; do not use them for regulated
              professional advice without human review).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Intellectual property</h2>
            <p>
              The service, its software, branding, UI and documentation are the property of the Seller. You are granted a
              limited, non-exclusive, non-transferable right to use the service within your plan. You retain rights over the
              audio you record and the translations produced for you; you grant us a limited license to host and process
              them solely to provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Plans, credits and payments</h2>
            <p>
              The service is offered on a freemium basis: free users receive 20 credits per month (1 credit = 1 translation).
              Additional credits can be purchased (pack of 50 credits for €2.99) or an annual subscription (€20/year) grants
              unlimited translations, subject to the 50/hour anti-abuse cap.
            </p>
            <p>
              Our order process is conducted by our online reseller <strong>Paddle.com</strong>. Paddle.com is the Merchant
              of Record for all our orders. Paddle provides all customer service inquiries and handles returns. Payment,
              billing, taxes, cancellation and refund mechanics are governed by Paddle's{" "}
              <a className="underline" href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noreferrer">
                Buyer Terms
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Service level & warranties</h2>
            <p>
              The service is provided "as is". We do not guarantee uninterrupted, error-free or perfectly accurate
              operation. To the fullest extent permitted by law, all implied warranties (merchantability, fitness for a
              particular purpose) are disclaimed.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Liability</h2>
            <p>
              To the fullest extent permitted by law, our aggregate liability is capped at the fees you paid us in the
              12 months preceding the claim. We are not liable for indirect, consequential or special damages (lost profits,
              lost data, loss of goodwill). Nothing in these Terms excludes liability for fraud, death or personal injury
              where such exclusion is prohibited by law.
            </p>
            <p>
              You agree to indemnify us against third-party claims arising from your content, your use of the service in
              breach of these Terms, or your unlawful acts.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Suspension & termination</h2>
            <p>
              We may suspend or terminate your access in case of material breach, non-payment, security or fraud risk, or
              repeated policy violations. Upon termination, your access ends and unused credits are forfeited unless required
              otherwise by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">11. Governing law</h2>
            <p>
              These Terms are governed by French law. Any dispute shall be brought before the competent French courts,
              subject to any mandatory consumer protection rules of your country of residence.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">12. Changes</h2>
            <p>
              We may update these Terms. Material changes will be notified in-app or by email. Continued use after the
              effective date constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">13. Contact</h2>
            <p>Questions: <a className="underline" href="mailto:rossetquentin26@gmail.com">rossetquentin26@gmail.com</a></p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
