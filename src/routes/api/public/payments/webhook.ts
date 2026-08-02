import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { verifyWebhook, EventName, gatewayFetch, type PaddleEnv } from "@/lib/paddle.server";

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

/** Credits granted per one-time price (human-readable Paddle price id). */
const CREDIT_PACKS: Record<string, { text?: number; voice?: number; mobile?: number }> = {
  credits_pack_50_onetime: { text: 75 },
  voice_pack_10_onetime: { voice: 45 },
  mobile_credits_pack_75_onetime: { mobile: 75 },
};

/** One-time price that extends an existing subscription instead of creating one. */
const SUBSCRIPTION_EXTENSION_PRICE = "sub_extend_year_onetime";

function centsToEur(v: any): number {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return 0;
  return n / 100;
}

/** Filet de sécurité : retrouve le membre via l'email du client Paddle. */
async function findUserByPaddleCustomer(
  customerId: string | undefined,
  env: PaddleEnv,
): Promise<string | null> {
  if (!customerId) return null;
  try {
    const res = await gatewayFetch(env, `/customers/${customerId}`);
    if (!res.ok) return null;
    const json: any = await res.json();
    const email = json?.data?.email;
    if (!email) return null;
    const { data } = await getSupabase()
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    return data?.id ?? null;
  } catch (e) {
    console.error("Failed to resolve user from Paddle customer", customerId, e);
    return null;
  }
}

/** userId depuis customData, sinon repli par email client Paddle. */
async function resolveUserId(data: any, env: PaddleEnv): Promise<string | null> {
  const direct = data?.customData?.userId;
  if (direct) return direct;
  const fallback = await findUserByPaddleCustomer(data?.customerId, env);
  if (fallback) {
    console.warn("Webhook: customData.userId manquant, membre retrouve par email", data?.id, fallback);
  } else {
    console.error("Webhook: paiement non attribuable a un membre", data?.id, data?.customerId);
  }
  return fallback;
}

async function upsertSubscriptionRow(data: any, env: PaddleEnv, statusOverride?: string) {
  const { id, customerId, items, status, currentBillingPeriod, scheduledChange } = data;
  const userId = await resolveUserId(data, env);
  if (!userId) {
    console.error("Webhook: no userId for subscription", id);
    return;
  }
  const item = items?.[0];
  const priceId = item?.price?.importMeta?.externalId ?? null;
  const productId = item?.product?.importMeta?.externalId ?? null;


  // One row per user (subscriptions.user_id is the primary key).
  await getSupabase()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        paddle_subscription_id: id,
        paddle_customer_id: customerId,
        product_id: productId,
        price_id: priceId,
        status: statusOverride ?? status,
        current_period_start: currentBillingPeriod?.startsAt ?? null,
        current_period_end: currentBillingPeriod?.endsAt ?? null,
        cancel_at_period_end: scheduledChange?.action === "cancel",
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
}

/** Updates driven by the Paddle subscription id (no customData guarantee). */
async function updateSubscriptionByPaddleId(data: any, env: PaddleEnv, statusOverride?: string) {
  const { id, status, currentBillingPeriod, scheduledChange } = data;
  const patch: Record<string, unknown> = {
    status: statusOverride ?? status,
    cancel_at_period_end: scheduledChange?.action === "cancel",
    updated_at: new Date().toISOString(),
  };
  if (currentBillingPeriod?.startsAt) patch.current_period_start = currentBillingPeriod.startsAt;
  if (currentBillingPeriod?.endsAt) patch.current_period_end = currentBillingPeriod.endsAt;

  const { data: updated } = await getSupabase()
    .from("subscriptions")
    .update(patch)
    .eq("paddle_subscription_id", id)
    .select("user_id");

  // Row missing (e.g. the created event was lost): rebuild it from this payload.
  if (!updated?.length) {
    await upsertSubscriptionRow(data, env, statusOverride);
  }
}

async function handleSubscriptionCanceled(data: any, env: PaddleEnv) {
  // Keep current_period_end untouched: paid access runs until the end of the period.
  await updateSubscriptionByPaddleId(data, env, "canceled");
}

/** Paddle webhooks sometimes omit importMeta: resolve the external id via the API. */
async function resolveExternalId(item: any, env: PaddleEnv): Promise<string | null> {
  const inline = item.price?.importMeta?.externalId ?? item.price?.import_meta?.external_id;
  if (inline) return inline;
  const priceId = item.price?.id ?? item.priceId ?? item.price_id;
  if (!priceId) return null;
  try {
    const res = await gatewayFetch(env, `/prices/${priceId}`);
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.data?.import_meta?.external_id ?? null;
  } catch (e) {
    console.error("Failed to resolve price external id", priceId, e);
    return null;
  }
}

async function grantOneTimePurchase(data: any, env: PaddleEnv, resolvedUserId: string) {
  const userId = resolvedUserId;
  if (!userId) return;

  let text = 0;
  let voice = 0;
  let mobile = 0;
  let extraYears = 0;

  for (const item of data.items ?? []) {
    const externalId = await resolveExternalId(item, env);
    const qty = item.quantity ?? 1;
    if (!externalId) continue;
    if (externalId === SUBSCRIPTION_EXTENSION_PRICE) {
      extraYears += qty;
      continue;
    }
    const pack = CREDIT_PACKS[externalId];
    if (!pack) continue;
    text += (pack.text ?? 0) * qty;
    voice += (pack.voice ?? 0) * qty;
    mobile += (pack.mobile ?? 0) * qty;
  }

  if (text > 0) await getSupabase().rpc("add_purchased_credits", { _user_id: userId, _amount: text });
  if (voice > 0) await getSupabase().rpc("add_voice_credits", { _user_id: userId, _amount: voice });
  if (mobile > 0) await getSupabase().rpc("add_mobile_credits", { _user_id: userId, _amount: mobile });
  if (extraYears > 0) {
    await getSupabase().rpc("extend_subscription_year", { _user_id: userId, _years: extraYears });
  }
}

async function handleTransactionCompleted(data: any, env: PaddleEnv) {
  const userId = await resolveUserId(data, env);
  if (!userId) return;

  const kind = data.subscriptionId ? "subscription" : "one_time";
  const totalEur = centsToEur(data.details?.totals?.total ?? data.details?.totals?.grandTotal);

  // Idempotency guard: the insert fails on replay, so credits are granted once only.
  const { error: insertError } = await getSupabase().from("payment_transactions").insert({
    user_id: userId,
    paddle_transaction_id: data.id,
    paddle_subscription_id: data.subscriptionId ?? null,
    environment: env,
    kind,
    amount_eur: totalEur,
    currency: data.currencyCode ?? "EUR",
    raw: data,
  });

  if (insertError) {
    // 23505 = already processed. Anything else is a real failure worth retrying.
    if (insertError.code === "23505") {
      console.log("Transaction already processed, skipping grants:", data.id);
      return;
    }
    throw new Error(`payment_transactions insert failed: ${insertError.message}`);
  }

  // Recurring charges are reflected by the subscription.* events.
  if (data.subscriptionId) return;

  await grantOneTimePurchase(data, env, userId);
}

/** Refund / chargeback: revoke paid access and wipe purchased credits. */
async function handleAdjustment(data: any) {
  const action = data.action;
  const status = data.status;
  if (action !== "refund" && action !== "chargeback" && action !== "chargeback_warning") return;
  if (status && status !== "approved") return;

  let userId: string | null = data.customData?.userId ?? null;

  if (!userId && data.transactionId) {
    const { data: tx } = await getSupabase()
      .from("payment_transactions")
      .select("user_id")
      .eq("paddle_transaction_id", data.transactionId)
      .maybeSingle();
    userId = tx?.user_id ?? null;
  }

  if (!userId && data.subscriptionId) {
    const { data: sub } = await getSupabase()
      .from("subscriptions")
      .select("user_id")
      .eq("paddle_subscription_id", data.subscriptionId)
      .maybeSingle();
    userId = sub?.user_id ?? null;
  }

  if (!userId) {
    console.warn("Adjustment without resolvable user:", data.id);
    return;
  }

  await getSupabase().rpc("revoke_for_refund", {
    _user_id: userId,
    _revoke_subscription: true,
    _revoke_credits: true,
  });
  console.log("Refund processed, access revoked for user", userId);
}

async function handleWebhook(req: Request, env: PaddleEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionActivated:
    case EventName.SubscriptionTrialing:
      await upsertSubscriptionRow(event.data, env);
      break;
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionResumed:
      await updateSubscriptionByPaddleId(event.data, env);
      break;
    case EventName.SubscriptionPastDue:
      await updateSubscriptionByPaddleId(event.data, env, "past_due");
      break;
    case EventName.SubscriptionPaused:
      await updateSubscriptionByPaddleId(event.data, env, "paused");
      break;
    case EventName.SubscriptionCanceled:
      await handleSubscriptionCanceled(event.data, env);
      break;
    case EventName.TransactionCompleted:
      await handleTransactionCompleted(event.data, env);
      break;
    case EventName.AdjustmentCreated:
    case EventName.AdjustmentUpdated:
      await handleAdjustment(event.data);
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
