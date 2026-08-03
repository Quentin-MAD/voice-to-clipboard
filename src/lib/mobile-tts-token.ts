// Short-lived signed token that lets the mobile app stream the voice of a
// dialogue it already paid for, without re-authenticating or spending a credit.

import { createHmac, timingSafeEqual } from "crypto";

export type TtsPayload = {
  userId: string;
  text: string;
  lang: string;
  /** Expiry, epoch seconds. */
  exp: number;
};

const TTL_SECONDS = 15 * 60;
const MAX_TEXT = 1200;

function secret() {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.LOVABLE_API_KEY;
  if (!s) throw new Error("Missing signing secret");
  return s;
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function signTtsToken(input: { userId: string; text: string; lang: string }): string {
  const payload: TtsPayload = {
    userId: input.userId,
    text: input.text.slice(0, MAX_TEXT),
    lang: input.lang,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyTtsToken(token: string): TtsPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as TtsPayload;
    if (!payload?.text || !payload.userId) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
