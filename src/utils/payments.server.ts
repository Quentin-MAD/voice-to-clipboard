import { gatewayFetch, type PaddleEnv } from "@/lib/paddle.server";

type PaddlePrice = { id: string; status?: string };

const cache = new Map<string, { id: string; at: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchPrice(env: PaddleEnv, priceId: string): Promise<string | null> {
  const response = await gatewayFetch(
    env,
    `/prices?status=active&external_id=${encodeURIComponent(priceId)}`,
  );

  if (!response.ok) {
    throw new Error(`Paddle ${response.status}`);
  }

  const result = (await response.json()) as { data?: PaddlePrice[] };
  const active = result.data?.find((price) => price.status === "active") ?? result.data?.[0];
  return active?.id ?? null;
}

export async function resolveActivePaddlePrice(
  environment: PaddleEnv,
  priceId: string,
): Promise<string> {
  const key = `${environment}:${priceId}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.id;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const id = await fetchPrice(environment, priceId);
      if (id) {
        cache.set(key, { id, at: Date.now() });
        return id;
      }
      lastError = new Error(`Tarif indisponible (${priceId})`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }

  console.error("resolvePaddlePrice failed", priceId, environment, lastError);
  throw new Error(
    `Le tarif "${priceId}" est introuvable ou inactif dans le catalogue de paiement. Merci de réessayer ou de contacter le support (rossetquentin26@gmail.com).`,
  );
}