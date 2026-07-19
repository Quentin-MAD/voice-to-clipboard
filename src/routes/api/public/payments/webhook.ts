import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { verifyWebhook, EventName, type PaddleEnv } from "@/lib/paddle.server";

let _supabase: any = null;
function getSupabase(): any {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

async function handleSubscriptionCreated(data: any, env: PaddleEnv) {
  const { id, customerId, items, status, currentBillingPeriod, customData } = data;
  const userId = customData?.userId;
  if (!userId) {
    console.error("No userId in customData");
    return;
  }
  const item = items[0];
  const priceId = item.price.importMeta?.externalId;
  const productId = item.product.importMeta?.externalId;
  if (!priceId || !productId) {
    console.warn("Skipping subscription: missing importMeta.externalId");
    return;
  }

  await getSupabase().from("subscriptions").upsert(
    {
      user_id: userId,
      paddle_subscription_id: id,
      paddle_customer_id: customerId,
      product_id: productId,
      price_id: priceId,
      status,
      current_period_start: currentBillingPeriod?.startsAt,
      current_period_end: currentBillingPeriod?.endsAt,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "paddle_subscription_id" },
  );
}

function centsToEur(v: any): number {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return 0;
  return n / 100;
}

async function handleSubscriptionUpdated(data: any, env: PaddleEnv) {
  const { id, status, currentBillingPeriod, scheduledChange } = data;
  await getSupabase()
    .from("subscriptions")
    .update({
      status,
      current_period_start: currentBillingPeriod?.startsAt,
      current_period_end: currentBillingPeriod?.endsAt,
      cancel_at_period_end: scheduledChange?.action === "cancel",
      updated_at: new Date().toISOString(),
    })
    .eq("paddle_subscription_id", id)
    .eq("environment", env);
}

async function handleSubscriptionCanceled(data: any, env: PaddleEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("paddle_subscription_id", data.id)
    .eq("environment", env);
}

// Pack de crédits (paiement unique) : on écoute transaction.completed
async function handleTransactionCompleted(data: any, env: PaddleEnv) {
  const userId = data.customData?.userId;
  if (!userId) return;

  // Log every real Paddle transaction (subscription renewals + one-off packs)
  const kind = data.subscriptionId ? "subscription" : "one_time";
  const totalEur = centsToEur(data.details?.totals?.total ?? data.details?.totals?.grandTotal);
  await getSupabase().from("payment_transactions").upsert(
    {
      user_id: userId,
      paddle_transaction_id: data.id,
      paddle_subscription_id: data.subscriptionId ?? null,
      environment: env,
      kind,
      amount_eur: totalEur,
      currency: data.currencyCode ?? "EUR",
      raw: data,
    },
    { onConflict: "paddle_transaction_id" },
  );

  // Une transaction récurrente est déjà gérée par les events subscription.*
  if (data.subscriptionId) return;

  let creditsToAdd = 0;
  let voiceCreditsToAdd = 0;
  for (const item of data.items ?? []) {
    const externalId = item.price?.importMeta?.externalId;
    const qty = item.quantity ?? 1;
    if (externalId === "credits_pack_50_onetime") {
      creditsToAdd += 50 * qty;
    } else if (externalId === "voice_pack_10_onetime") {
      voiceCreditsToAdd += 10 * qty;
    }
  }
  if (creditsToAdd > 0) {
    await getSupabase().rpc("add_purchased_credits", { _user_id: userId, _amount: creditsToAdd });
  }
  if (voiceCreditsToAdd > 0) {
    await getSupabase().rpc("add_voice_credits", { _user_id: userId, _amount: voiceCreditsToAdd });
  }
}

async function handleWebhook(req: Request, env: PaddleEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.eventType) {
    case EventName.SubscriptionCreated:
      await handleSubscriptionCreated(event.data, env);
      break;
    case EventName.SubscriptionUpdated:
      await handleSubscriptionUpdated(event.data, env);
      break;
    case EventName.SubscriptionCanceled:
      await handleSubscriptionCanceled(event.data, env);
      break;
    case EventName.TransactionCompleted:
      await handleTransactionCompleted(event.data, env);
      break;
    default:
      console.log("Unhandled event:", event.eventType);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const env = (url.searchParams.get("env") || "sandbox") as PaddleEnv;
        try {
          await handleWebhook(request, env);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
