import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const LANG_NAMES: Record<string, string> = {
  fr: "French", en: "English", es: "Spanish", de: "German", it: "Italian",
  ru: "Russian", ja: "Japanese", zh: "Chinese (Simplified)", pt: "Brazilian Portuguese",
  ko: "Korean", tr: "Turkish", pl: "Polish", nl: "Dutch", ar: "Arabic",
  id: "Indonesian", vi: "Vietnamese", th: "Thai", sv: "Swedish", uk: "Ukrainian",
};

async function transcribe(audio: Blob, filename: string) {
  const key = process.env.LOVABLE_API_KEY!;
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "openai/gpt-4o-mini-transcribe");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`STT [${res.status}]: ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

async function translate(text: string, targetLang: string) {
  const key = process.env.LOVABLE_API_KEY!;
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are a natural, idiomatic translator into ${targetName}. Translate the user's spoken message into ${targetName} the way a native speaker would actually say it in a real conversation. Preserve tone, register, emotion, humor. Adapt idioms. Fix obvious speech-to-text mistakes silently. Output ONLY the translation, no quotes, no comments.`,
        },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Translate [${res.status}]: ${await res.text().catch(() => "")}`);
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

async function synthesize(text: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY!;
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
  if (!res.ok) throw new Error(`TTS [${res.status}]: ${await res.text().catch(() => "")}`);
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

export const Route = createFileRoute("/api/mobile-dialog")({
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

          const admin = createClient(supabaseUrl, serviceRole, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          // Rate limit mobile: 50/day
          const { data: consumeData, error: consumeErr } = await admin.rpc("consume_mobile_translation", {
            _user_id: userId,
          });
          if (consumeErr) {
            console.error("consume_mobile_translation failed:", consumeErr);
            return Response.json({ error: "Erreur serveur.", code: "server" }, { status: 500 });
          }
          const row = Array.isArray(consumeData) ? consumeData[0] : consumeData;
          if (!row?.ok) {
            return Response.json({
              error: "Limite quotidienne atteinte : 50 traductions vocales par jour. Revenez demain.",
              code: "mobile_daily_limit",
              daily_used: row?.daily_used ?? 50,
              daily_limit: row?.daily_limit ?? 50,
            }, { status: 429 });
          }

          const form = await request.formData();
          const audio = form.get("audio");
          const targetLang = String(form.get("targetLang") ?? "en");

          if (!(audio instanceof Blob) || audio.size < 1024) {
            return Response.json({ error: "Audio trop court.", code: "bad_input" }, { status: 400 });
          }
          if (audio.size > 15 * 1024 * 1024) {
            return Response.json({ error: "Enregistrement trop long.", code: "too_large" }, { status: 413 });
          }
          if (!LANG_NAMES[targetLang]) {
            return Response.json({ error: "Langue non supportée.", code: "bad_lang" }, { status: 400 });
          }

          const filename = (audio as File).name || "recording.wav";
          const transcript = await transcribe(audio, filename);
          if (!transcript) {
            return Response.json({ error: "Aucune parole détectée.", code: "no_speech" }, { status: 422 });
          }

          const translation = await translate(transcript, targetLang);
          const audioB64 = await synthesize(translation.text);

          const audioSec = Math.max(1, Math.round(audio.size / 32000));
          const transcribeCost = 0.00018 * (audioSec / 5);
          const translateCost = translation.inputTokens * 0.0000001 + translation.outputTokens * 0.0000004;
          const ttsCost = translation.text.length * 0.0000006;
          void logAiUsage(userId, [
            { model: "openai/gpt-4o-mini-transcribe", operation: "mobile_transcription", cost_credits: transcribeCost },
            { model: "google/gemini-2.5-flash-lite", operation: "mobile_translation", input_tokens: translation.inputTokens, output_tokens: translation.outputTokens, cost_credits: translateCost },
            { model: "openai/gpt-4o-mini-tts", operation: "mobile_tts", output_tokens: translation.text.length, cost_credits: ttsCost },
          ]);

          return Response.json({
            transcript,
            translation: translation.text,
            audio: audioB64,
            audioFormat: "mp3",
            usage: {
              daily_used: row.daily_used,
              daily_limit: row.daily_limit,
              remaining: row.remaining,
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("mobile-dialog failed:", message);
          if (/\[402\]/.test(message)) {
            return Response.json({ error: "Service IA indisponible.", code: "ai_credits_exhausted" }, { status: 503 });
          }
          if (/\[429\]/.test(message)) {
            return Response.json({ error: "Service surchargé.", code: "ai_rate_limited" }, { status: 503 });
          }
          return Response.json({ error: message, code: "internal" }, { status: 500 });
        }
      },
    },
  },
});
