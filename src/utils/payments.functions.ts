import { createServerFn } from "@tanstack/react-start";
import { gatewayFetch, type PaddleEnv } from "@/lib/paddle.server";

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => data)
  .handler(async ({ data }) => {
    const response = await gatewayFetch(
      data.environment,
      `/prices?status=active&external_id=${encodeURIComponent(data.priceId)}`
    );
    const result = (await response.json()) as { data?: Array<{ id: string; status?: string }> };
    const active = result.data?.find((p) => p.status !== "archived") ?? result.data?.[0];
    if (!active) throw new Error("Price not found");
    return active.id;
  });
