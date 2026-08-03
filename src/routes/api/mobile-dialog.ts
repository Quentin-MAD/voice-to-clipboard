import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { signTtsToken } from "@/lib/mobile-tts-token";

const LANG_NAMES: Record<string, string> = {
  fr: "French", en: "English", es: "Spanish", de: "German", it: "Italian",
  ru: "Russian", ja: "Japanese", zh: "Chinese (Simplified)", pt: "Brazilian Portuguese",
  ko: "Korean", tr: "Turkish", pl: "Polish", nl: "Dutch", ar: "Arabic",
  id: "Indonesian", vi: "Vietnamese", th: "Thai", sv: "Swedish", uk: "Ukrainian",
  el: "Greek", hi: "Hindi", ro: "Romanian", cs: "Czech", hu: "Hungarian",
  da: "Danish", fi: "Finnish", no: "Norwegian", he: "Hebrew", bg: "Bulgarian",
  hr: "Croatian", sk: "Slovak", ms: "Malay", fa: "Persian",
  bn: "Bengali", ur: "Urdu", pa: "Punjabi", ta: "Tamil", te: "Telugu",
  mr: "Marathi", gu: "Gujarati", jv: "Javanese", sw: "Swahili",
  tl: "Filipino (Tagalog)", sr: "Serbian", sl: "Slovenian", ca: "Catalan",
  af: "Afrikaans",
};

const DIALOG_MODEL = "google/gemini-2.5-flash-lite";

function toBase64(buf: ArrayBuffer) {
  return Buffer.from(buf).toString("base64");
}

/**
 * Single multimodal call: the audio is transcribed AND translated in one round
 * trip (previously two sequential gateway calls).
 */
async function transcribeAndTranslate(
  audio: Blob,
  sourceLang: string | null,
  targetLang: string,
) {
  const key = process.env.LOVABLE_API_KEY!;
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const sourceName = sourceLang && LANG_NAMES[sourceLang] ? LANG_NAMES[sourceLang] : "the detected language";
  const b64 = toBase64(await audio.arrayBuffer());

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: DIALOG_MODEL,
      reasoning_effort: "none",
      max_tokens: 500,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You transcribe a short spoken message in ${sourceName} and translate it into ${targetName}. Translate the way a native ${targetName} speaker would actually say it in a real face-to-face conversation: preserve tone, register, emotion and humor, adapt idioms, silently fix obvious speech recognition mistakes. Answer with EXACTLY two lines and nothing else:\nTRANSCRIPT: <the spoken words, verbatim>\nTRANSLATION: <the ${targetName} translation>`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Transcribe then translate into ${targetName}.` },
            { type: "input_audio", input_audio: { data: b64, format: "wav" } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Dialog [${res.status}]: ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = (json.choices?.[0]?.message?.content ?? "").trim();
  const transcript = (raw.match(/TRANSCRIPT:\s*([\s\S]*?)(?:\n\s*TRANSLATION:|$)/i)?.[1] ?? "").trim();
  const translation = (raw.match(/TRANSLATION:\s*([\s\S]*)$/i)?.[1] ?? "").trim();
  return {
    transcript,
    translation: translation || (transcript ? "" : raw),
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

async function logAiUsage(userId: string, entries: Array<{ model: string; operation: string; input_tokens?: number; output_tokens?: number; cost_credits: number }>) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("ai_usage_log")
      .insert(entries.map((e) => ({ ...e, user_id: userId })));
    if (error) throw error;
  } catch (e) {
    console.warn("ai_usage_log insert failed", e);
    throw new Error("Le suivi du coût IA mobile a échoué.");
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

          // Consume a free daily dialogue first, then a purchased credit. There is no global daily cap.
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
              error: "Vous n'avez plus de crédit. Merci de recharger votre compte ou de vous abonner.",
              code: "mobile_no_credits",
              daily_used: row?.daily_used ?? 15,
              daily_limit: row?.daily_limit ?? 15,
            }, { status: 429 });
          }

          const form = await request.formData();
          const audio = form.get("audio");
          const targetLang = String(form.get("targetLang") ?? "en");
          const sourceLangRaw = form.get("sourceLang");
          const sourceLang = sourceLangRaw ? String(sourceLangRaw) : null;

          if (!(audio instanceof Blob) || audio.size < 1024) {
            return Response.json({ error: "Audio trop court.", code: "bad_input" }, { status: 400 });
          }
          if (audio.size > 15 * 1024 * 1024) {
            return Response.json({ error: "Enregistrement trop long.", code: "too_large" }, { status: 413 });
          }
          if (!LANG_NAMES[targetLang]) {
            return Response.json({ error: "Langue non supportée.", code: "bad_lang" }, { status: 400 });
          }
          if (sourceLang && !LANG_NAMES[sourceLang]) {
            return Response.json({ error: "Langue source non supportée.", code: "bad_lang" }, { status: 400 });
          }

          const result = await transcribeAndTranslate(audio, sourceLang, targetLang);
          if (!result.transcript && !result.translation) {
            return Response.json({ error: "Aucune parole détectée.", code: "no_speech" }, { status: 422 });
          }

          const cost = result.inputTokens * 0.0000001 + result.outputTokens * 0.0000004;
          await logAiUsage(userId, [
            {
              model: DIALOG_MODEL,
              operation: "mobile_translation",
              input_tokens: result.inputTokens,
              output_tokens: result.outputTokens,
              cost_credits: cost,
            },
          ]);

          // The voice is streamed separately so playback can start as soon as the
          // first bytes arrive instead of waiting for the whole file.
          const ttsToken = signTtsToken({
            userId,
            text: result.translation || result.transcript,
            lang: targetLang,
          });

          return Response.json({
            transcript: result.transcript,
            translation: result.translation,
            ttsToken,
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
