import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const LANG_NAMES: Record<string, string> = {
  fr: "French",
  en: "English",
  es: "Spanish",
  de: "German",
  it: "Italian",
  ru: "Russian",
  ja: "Japanese",
  zh: "Chinese (Simplified)",
  pt: "Brazilian Portuguese",
  ko: "Korean",
  tr: "Turkish",
  pl: "Polish",
  nl: "Dutch",
  ar: "Arabic",
  id: "Indonesian",
  vi: "Vietnamese",
  th: "Thai",
  sv: "Swedish",
  uk: "Ukrainian",
};

const STT_LANG: Record<string, string> = {
  fr: "fr", en: "en", es: "es", de: "de", it: "it", ru: "ru", ja: "ja", zh: "zh",
  pt: "pt", ko: "ko", tr: "tr", pl: "pl", nl: "nl", ar: "ar", id: "id", vi: "vi",
  th: "th", sv: "sv", uk: "uk",
};

async function transcribe(audio: Blob, filename: string, sourceLang: string | null) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not set");
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "openai/gpt-4o-mini-transcribe");
  if (sourceLang && sourceLang !== "auto") {
    const code = STT_LANG[sourceLang];
    if (code) form.append("language", code);
  }
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Transcription failed [${res.status}]: ${body}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

async function translate(text: string, targetLang: string, sourceLang: string | null) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not set");
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const sourceName = sourceLang && sourceLang !== "auto" ? LANG_NAMES[sourceLang] : "the detected language";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      service_tier: "priority",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are an expert human translator specializing in natural, idiomatic ${targetName}. Translate the user's message from ${sourceName} into ${targetName}.

Rules:
- Never translate word-for-word. Rewrite the meaning the way a native ${targetName} speaker would actually say it in the same situation (casual chat, gaming, everyday conversation).
- Preserve intent, tone, emotion, register (casual/formal), humor, sarcasm and profanity - do not soften or censor.
- Adapt idioms, slang, expressions and cultural references to their natural equivalent in ${targetName}, not their literal meaning.
- Fix obvious speech-to-text mistakes silently.
- Keep proper nouns, brand names, game terms, usernames and technical jargon unchanged.
- Output ONLY the final translation. No quotes, no comments, no alternatives, no language labels, no explanations.
- If the input is already in ${targetName}, output it cleaned up but unchanged in meaning.`,
        },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Translation failed [${res.status}]: ${body}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: (json.choices?.[0]?.message?.content ?? "").trim(),
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

async function logAiUsage(userId: string, entries: Array<{ model: string; operation: string; input_tokens?: number; output_tokens?: number; cost_credits: number }>) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_usage_log").insert(entries.map((e) => ({ ...e, user_id: userId })));
  } catch (e) {
    console.warn("ai_usage_log insert failed", e);
  }
}

export const Route = createFileRoute("/api/translate-audio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ---- Auth: bearer token required ----
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
          if (!token) {
            return Response.json(
              { error: "Vous devez être connecté pour traduire.", code: "unauthorized" },
              { status: 401 },
            );
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
            return Response.json(
              { error: "Session expirée. Reconnectez-vous.", code: "unauthorized" },
              { status: 401 },
            );
          }
          const userId = userData.user.id;

          // ---- Consume credit atomically (rate limit + free/sub/purchased) ----
          const admin = createClient(supabaseUrl, serviceRole, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: consumeData, error: consumeErr } = await admin.rpc("consume_translation", {
            _user_id: userId,
          });
          if (consumeErr) {
            console.error("consume_translation failed:", consumeErr);
            return Response.json({ error: "Erreur serveur crédits.", code: "server" }, { status: 500 });
          }
          const row = Array.isArray(consumeData) ? consumeData[0] : consumeData;
          if (!row?.ok) {
            if (row?.reason === "hourly_limit") {
              return Response.json(
                {
                  error:
                    "Limite anti-spam atteinte : 50 traductions dans la dernière heure. Réessayez dans 1 heure.",
                  code: "hourly_limit",
                },
                { status: 429 },
              );
            }
            if (row?.reason === "no_credits") {
              return Response.json(
                {
                  error:
                    "Vous n'avez plus de crédits. Passez à l'abonnement (20 €/an, illimité) ou achetez un pack (50 crédits pour 2,99 €).",
                  code: "no_credits",
                },
                { status: 402 },
              );
            }
            return Response.json({ error: "Traduction refusée.", code: "denied" }, { status: 402 });
          }

          // ---- Do the actual work ----
          const form = await request.formData();
          const audio = form.get("audio");
          const targetLang = String(form.get("targetLang") ?? "en");
          const sourceLang = form.get("sourceLang") ? String(form.get("sourceLang")) : null;

          if (!(audio instanceof Blob) || audio.size < 1024) {
            return Response.json({ error: "Audio trop court ou manquant", code: "bad_input" }, { status: 400 });
          }
          if (audio.size > 20 * 1024 * 1024) {
            return Response.json({ error: "Enregistrement trop long (max 20MB)", code: "too_large" }, { status: 413 });
          }
          if (!LANG_NAMES[targetLang]) {
            return Response.json({ error: "Langue cible non supportée", code: "bad_lang" }, { status: 400 });
          }

          const filename = (audio as File).name || "recording.wav";
          const transcript = await transcribe(audio, filename, sourceLang);
          if (!transcript) {
            return Response.json({ error: "Aucune parole détectée", code: "no_speech" }, { status: 422 });
          }
          const translation = await translate(transcript, targetLang, sourceLang);

          return Response.json({
            transcript,
            translation,
            usage: {
              source: row.reason,
              subscribed: row.subscribed,
              remaining_free: row.remaining_free,
              remaining_purchased: row.remaining_purchased,
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("translate-audio failed:", message);
          if (/\[402\]/.test(message)) {
            return Response.json(
              {
                error:
                  "Service de traduction temporairement indisponible (quota IA épuisé côté serveur). Réessayez dans quelques minutes.",
                code: "ai_credits_exhausted",
              },
              { status: 503 },
            );
          }
          if (/\[429\]/.test(message)) {
            return Response.json(
              {
                error: "Service surchargé, réessayez dans quelques instants.",
                code: "ai_rate_limited",
              },
              { status: 503 },
            );
          }
          return Response.json({ error: message, code: "internal" }, { status: 500 });
        }

      },
    },
  },
});
