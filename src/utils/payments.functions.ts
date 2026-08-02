import { createServerFn } from "@tanstack/react-start";
import { gatewayFetch, type PaddleEnv } from "@/lib/paddle.server";

type PaddlePrice = { id: string; status?: string };

const cache = new Map<string, { id: string; at: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchPrice(env: PaddleEnv, priceId: string): Promise<string | null> {
  const response = await gatewayFetch(
    env,
    `/prices?status=active&external_id=${encodeURIComponent(priceId)}`
  );
  if (!response.ok) {
    throw new Error(`Paddle ${response.status}`);
  }
  const result = (await response.json()) as { data?: PaddlePrice[] };
  const active = result.data?.find((p) => p.status === "active") ?? result.data?.[0];
  return active?.id ?? null;
}

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => data)
  .handler(async ({ data }) => {
    const key = `${data.environment}:${data.priceId}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.id;

    let lastError: unknown = null;
    // Transient gateway/rate-limit errors were causing intermittent "Price not found".
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const id = await fetchPrice(data.environment, data.priceId);
        if (id) {
          cache.set(key, { id, at: Date.now() });
          return id;
        }
        lastError = new Error(`Tarif indisponible (${data.priceId})`);
      } catch (e) {
        lastError = e;
      }
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
    console.error("resolvePaddlePrice failed", data.priceId, data.environment, lastError);
    throw new Error(
      "Ce tarif est momentanément indisponible. Merci de réessayer dans quelques instants."
    );
  });
