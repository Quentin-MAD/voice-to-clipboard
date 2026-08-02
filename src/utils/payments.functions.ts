import { createServerFn } from "@tanstack/react-start";
import type { PaddleEnv } from "@/lib/paddle.server";
import { resolveActivePaddlePrice } from "@/utils/payments.server";

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => data)
  .handler(async ({ data }) =>
    resolveActivePaddlePrice(data.environment, data.priceId),
  );
