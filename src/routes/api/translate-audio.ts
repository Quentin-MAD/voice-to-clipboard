import { createFileRoute } from "@tanstack/react-router";

const LANG_NAMES: Record<string, string> = {
  fr: "French",
  en: "English",
  es: "Spanish",
  de: "German",
  it: "Italian",
  ru: "Russian",
  ja: "Japanese",
  zh: "Chinese (Simplified)",
};

// ISO-639-1 codes accepted by gpt-4o transcription models
const STT_LANG: Record<string, string> = {
  fr: "fr",
  en: "en",
  es: "es",
  de: "de",
  it: "it",
  ru: "ru",
  ja: "ja",
  zh: "zh",
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-5.4-mini",
      service_tier: "priority",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are an expert human translator specializing in natural, idiomatic ${targetName}. Translate the user's message from ${sourceName} into ${targetName}.

Rules:
- Never translate word-for-word. Rewrite the meaning the way a native ${targetName} speaker would actually say it in the same situation (casual chat, gaming, everyday conversation).
- Preserve intent, tone, emotion, register (casual/formal), humor, sarcasm and profanity — do not soften or censor.
- Adapt idioms, slang, expressions and cultural references to their natural equivalent in ${targetName}, not their literal meaning.
- Fix obvious speech-to-text mistakes (missing punctuation, homophones, filler words like "uh", "euh", "hum") silently.
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
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

export const Route = createFileRoute("/api/translate-audio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const audio = form.get("audio");
          const targetLang = String(form.get("targetLang") ?? "en");
          const sourceLang = form.get("sourceLang") ? String(form.get("sourceLang")) : null;

          if (!(audio instanceof Blob)) {
            return Response.json({ error: "Missing audio file" }, { status: 400 });
          }
          if (audio.size < 1024) {
            return Response.json({ error: "Recording too short" }, { status: 400 });
          }
          if (audio.size > 20 * 1024 * 1024) {
            return Response.json({ error: "Recording too large (max 20MB)" }, { status: 413 });
          }
          if (!LANG_NAMES[targetLang]) {
            return Response.json({ error: "Unsupported target language" }, { status: 400 });
          }

          const filename = (audio as File).name || "recording.wav";
          const transcript = await transcribe(audio, filename, sourceLang);
          if (!transcript) {
            return Response.json({ error: "No speech detected" }, { status: 422 });
          }
          const translation = await translate(transcript, targetLang, sourceLang);

          return Response.json({ transcript, translation });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("translate-audio failed:", message);
          const status = /\[402\]/.test(message)
            ? 402
            : /\[429\]/.test(message)
              ? 429
              : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
