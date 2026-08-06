import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/legal/refunds")({
  component: RefundsPage,
  head: () => ({
    meta: [
      { title: "Refund Policy - TalKing" },
      { name: "description", content: "14-day money-back guarantee." },
      { property: "og:title", content: "Refund Policy - TalKing" },
      { property: "og:url", content: "https://talking-translator.com/legal/refunds" },
    ],
    links: [{ rel: "canonical", href: "https://talking-translator.com/legal/refunds" }],
  }),
});

function RefundsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="mt-4 text-3xl font-bold text-foreground">Refund Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 31 July 2026</p>

        <div className="prose prose-invert mt-8 max-w-none text-sm text-foreground/90 space-y-6">
          <section>
            <h2 className="text-lg font-semibold">14-day money-back guarantee</h2>
            <p>
              We offer a <strong>14-day money-back guarantee</strong> on all purchases (credit packs and annual
              subscriptions). If you are not satisfied, you can request a full refund within 14 days of your order date.
            </p>
            <p>
              <strong>Important:</strong> a refund cancels the corresponding entitlement immediately. When a refund is
              approved, your subscription access ends straight away and any purchased credits (text, voice and mobile)
              are removed from your account, which returns to the free plan. This is stated again at checkout.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">How to request a refund</h2>
            <p>
              Refunds are processed by our payment provider, <strong>Paddle</strong>, which is the Merchant of Record for
              all <span className="notranslate">TalKing</span> orders.
            </p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>Go to <a className="underline" href="https://paddle.net" target="_blank" rel="noreferrer">paddle.net</a> and look up your order using the email you paid with.</li>
              <li>Request a refund from there, or contact us at{" "}
                <a className="underline" href="mailto:rossetquentin26@gmail.com">rossetquentin26@gmail.com</a> with your order ID.
              </li>
            </ol>
            <p>Refunds are returned to the original payment method, typically within 5–10 business days.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Subscription cancellation</h2>
            <p>
              You can cancel your annual subscription at any time from your Paddle customer portal. Cancellation stops
              future renewals; the current paid period remains active until its end date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">EU right of withdrawal</h2>
            <p>
              Consumers residing in the EU have a 14-day statutory right of withdrawal for digital purchases, unless the
              service has been fully performed with your prior express consent. Our 14-day guarantee aligns with this
              statutory right.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
