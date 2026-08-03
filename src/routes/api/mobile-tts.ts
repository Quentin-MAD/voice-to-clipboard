import { createFileRoute } from "@tanstack/react-router";
import { verifyTtsToken } from "@/lib/mobile-tts-token";

const TTS_MODEL = "openai/gpt-4o-mini-tts";

async function logTtsUsage(userId: string, chars: number) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_usage_log").insert({
      user_id: userId,
      model: TTS_MODEL,
      operation: "mobile_tts",
      output_tokens: chars,
      cost_credits: chars * 0.0000179,
    });
  } catch (e) {
    console.warn("ai_usage_log (mobile_tts) insert failed", e);
  }
}

export const Route = createFileRoute("/api/mobile-tts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";
        const payload = verifyTtsToken(token);
        if (!payload) {
          return new Response("Lien audio expiré.", { status: 401 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Server misconfigured", { status: 500 });

        // Alternate voices so the two speakers sound different
        const voice = payload.lang === "fr" ? "onyx" : "nova";
        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: TTS_MODEL,
            input: payload.text,
            voice,
            response_format: "mp3",
            speed: 1.1,
          }),
        });
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          console.error("mobile-tts failed:", res.status, detail);
          const status = res.status === 402 || res.status === 429 ? 503 : 502;
          return new Response("Synthèse vocale indisponible.", { status });
        }

        // Fire-and-forget cost logging; never delays the audio stream.
        void logTtsUsage(payload.userId, payload.text.length);

        return new Response(res.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            // Replays reuse the browser cache instead of re-synthesizing.
            "Cache-Control": "private, max-age=900",
          },
        });
      },
    },
  },
});
