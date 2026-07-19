import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const LANG_NAMES: Record<string, string> = {
  fr: "French", en: "English", es: "Spanish", de: "German", it: "Italian",
  ru: "Russian", ja: "Japanese", zh: "Chinese (Simplified)", pt: "Brazilian Portuguese",
  ko: "Korean", tr: "Turkish", pl: "Polish", nl: "Dutch", ar: "Arabic",
  id: "Indonesian", vi: "Vietnamese", th: "Thai", sv: "Swedish", uk: "Ukrainian",
};

type VisionResult = {
  found: boolean;
  pseudo?: string;
  original?: string;
  translation?: string;
  reason?: string;
};

async function analyzeScreenshotAndAudio(
  audioBase64: string,
  audioFormat: string,
  screenshotBase64: string,
  targetLang: string,
): Promise<VisionResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not set");
  const targetName = LANG_NAMES[targetLang] ?? targetLang;

  const systemPrompt = `You are a real-time in-game chat assistant. The user speaks aloud to ask you to READ a message from a specific player visible on their screen.

Your job in ONE step:
1. Listen to the audio and identify the target player's pseudo/username the user is naming.
2. Look at the screenshot (a game / app screen) and find that exact player's MOST RECENT chat message.
3. Translate that message into natural, idiomatic ${targetName} (as a native speaker would say it, not word-for-word). Preserve tone, slang, sarcasm, profanity - do not censor.
4. Return ONLY a JSON object, no other text.

JSON schema (STRICT - no extra fields, no markdown fence):
{"found": boolean, "pseudo": "<the pseudo you heard>", "original": "<exact message text as it appears on screen>", "translation": "<${targetName} translation>", "reason": "<if not found, brief reason in French>"}

Rules:
- Pseudo matching is fuzzy (accents, capitalization, minor spelling variation from mishearing are OK). Match the closest visible pseudo.
- If no chat/message area is visible OR no message from that pseudo is on screen, return {"found": false, "pseudo": "<what you heard>", "reason": "..."}.
- If the target message is already in ${targetName}, still fill "translation" with the same text cleaned up.
- Keep proper nouns, game terms, brand names unchanged in the translation.
- Never invent a message. If unsure, "found": false.`;

  const body = {
    model: "google/gemini-2.5-flash",
    temperature: 0.1,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: `Read the message and translate it to ${targetName}. Listen to what I'm saying and look at the screenshot.` },
          { type: "input_audio", input_audio: { data: audioBase64, format: audioFormat } },
          { type: "image_url", image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
        ],
      },
    ],
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Vision failed [${res.status}]: ${errBody}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: VisionResult;
  try {
    parsed = JSON.parse(raw) as VisionResult;
  } catch {
    // Try to extract JSON from a fenced response as fallback
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = match ? (JSON.parse(match[0]) as VisionResult) : { found: false, reason: "parse_error" };
  }
  (parsed as VisionResult & { _usage?: unknown })._usage = json.usage;
  return parsed;
}

async function synthesizeSpeech(text: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not set");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: text,
      voice: "nova",
      response_format: "mp3",
      speed: 1.05,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`TTS failed [${res.status}]: ${errBody}`);
  }
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

async function logAiUsage(userId: string, entries: Array<{ model: string; operation: string; input_tokens?: number; output_tokens?: number; cost_credits: number }>) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_usage_log").insert(entries.map((e) => ({ ...e, user_id: userId })));
  } catch (e) {
    console.warn("ai_usage_log insert failed", e);
  }
}

export const Route = createFileRoute("/api/read-message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
          if (!token) {
            return Response.json({ error: "Vous devez être connecté.", code: "unauthorized" }, { status: 401 });
          }

          const supabaseUrl = process.env.SUPABASE_URL;
          const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
          const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!supabaseUrl || !publishable || !serviceRole) {
            return Response.json({ error: "Server misconfigured", code: "config" }, { status: 500 });
          }

          const authClient = createClient(supabaseUrl, publishable, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: userData, error: userErr } = await authClient.auth.getUser(token);
          if (userErr || !userData?.user) {
            return Response.json({ error: "Session expirée.", code: "unauthorized" }, { status: 401 });
          }
          const userId = userData.user.id;

          // ---- Parse multipart ----
          const form = await request.formData();
          const audio = form.get("audio");
          const screenshot = form.get("screenshot");
          const targetLang = String(form.get("targetLang") ?? "fr");
          const audioFormat = String(form.get("audioFormat") ?? "wav");

          if (!(audio instanceof Blob) || audio.size < 512) {
            return Response.json({ error: "Audio trop court ou manquant.", code: "bad_input" }, { status: 400 });
          }
          if (!(screenshot instanceof Blob) || screenshot.size < 1024) {
            return Response.json({ error: "Capture d'écran manquante ou invalide.", code: "bad_input" }, { status: 400 });
          }
          if (audio.size > 15 * 1024 * 1024 || screenshot.size > 8 * 1024 * 1024) {
            return Response.json({ error: "Fichier trop volumineux.", code: "too_large" }, { status: 413 });
          }
          if (!LANG_NAMES[targetLang]) {
            return Response.json({ error: "Langue cible non supportée.", code: "bad_lang" }, { status: 400 });
          }

          const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
          const screenshotBase64 = Buffer.from(await screenshot.arrayBuffer()).toString("base64");

          // ---- Vision + STT + translate in one shot ----
          const admin = createClient(supabaseUrl, serviceRole, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          let vision: VisionResult;
          try {
            vision = await analyzeScreenshotAndAudio(audioBase64, audioFormat, screenshotBase64, targetLang);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("Vision call failed:", msg);
            if (/\[402\]/.test(msg)) {
              return Response.json({ error: "Service IA temporairement indisponible.", code: "ai_credits_exhausted" }, { status: 503 });
            }
            if (/\[429\]/.test(msg)) {
              return Response.json({ error: "Service surchargé, réessayez.", code: "ai_rate_limited" }, { status: 503 });
            }
            return Response.json({ error: "Analyse impossible.", code: "vision_failed" }, { status: 500 });
          }

          if (!vision.found || !vision.translation) {
            return Response.json({
              error: vision.reason ?? `Message introuvable pour "${vision.pseudo ?? "?"}". Vérifiez que le chat du jeu est bien visible.`,
              code: "not_found",
              pseudo: vision.pseudo,
            }, { status: 422 });
          }

          // ---- Consume 2 credits AFTER success, BEFORE TTS ----
          const { data: consumeData, error: consumeErr } = await admin.rpc("consume_translation_v2", {
            _user_id: userId,
            _amount: 2,
            _operation: "read_message",
          });
          if (consumeErr) {
            console.error("consume_translation_v2 failed:", consumeErr);
            return Response.json({ error: "Erreur crédits.", code: "server" }, { status: 500 });
          }
          const row = Array.isArray(consumeData) ? consumeData[0] : consumeData;
          if (!row?.ok) {
            if (row?.reason === "daily_limit") {
              return Response.json({ error: "Limite quotidienne atteinte (150/24h).", code: "daily_limit" }, { status: 429 });
            }
            if (row?.reason === "no_credits") {
              return Response.json({
                error: "Il vous faut 2 crédits pour une lecture. Passez à l'abonnement ou achetez un pack.",
                code: "no_credits",
              }, { status: 402 });
            }
            return Response.json({ error: "Lecture refusée.", code: "denied" }, { status: 402 });
          }

          // ---- TTS ----
          let audioBase64Out: string;
          try {
            audioBase64Out = await synthesizeSpeech(vision.translation);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("TTS failed:", msg);
            // TTS failed after debit — refund purchased credits (not free ones, they'll auto-reset)
            try {
              await admin.rpc("add_purchased_credits", { _user_id: userId, _amount: 2 });
            } catch { /* best-effort */ }
            return Response.json({ error: "Synthèse vocale échouée.", code: "tts_failed" }, { status: 500 });
          }

          // ---- Log AI usage ----
          const visionUsage = (vision as VisionResult & { _usage?: { prompt_tokens?: number; completion_tokens?: number } })._usage;
          const visionInputTokens = visionUsage?.prompt_tokens ?? 0;
          const visionOutputTokens = visionUsage?.completion_tokens ?? 0;
          // Gemini 2.5 flash pricing (with image+audio): ~$0.30/M input, $2.50/M output
          const visionCost = (visionInputTokens * 0.0000003) + (visionOutputTokens * 0.0000025);
          // TTS: gpt-4o-mini-tts ~$0.60/M chars input → chars = translation length
          const ttsCost = vision.translation.length * 0.0000006;

          void logAiUsage(userId, [
            {
              model: "google/gemini-2.5-flash",
              operation: "vision_read_message",
              input_tokens: visionInputTokens,
              output_tokens: visionOutputTokens,
              cost_credits: visionCost,
            },
            {
              model: "openai/gpt-4o-mini-tts",
              operation: "tts_read_message",
              output_tokens: vision.translation.length,
              cost_credits: ttsCost,
            },
          ]);

          return Response.json({
            pseudo: vision.pseudo,
            original: vision.original,
            translation: vision.translation,
            audio: audioBase64Out,
            audioFormat: "mp3",
            usage: {
              subscribed: row.subscribed,
              remaining_free: row.remaining_free,
              remaining_purchased: row.remaining_purchased,
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("read-message failed:", message);
          return Response.json({ error: message, code: "internal" }, { status: 500 });
        }
      },
    },
  },
});
