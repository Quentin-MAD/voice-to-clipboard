/**
 * Best-effort delivery of support messages to the private support inbox.
 * The destination address is server-side only and never exposed to the client.
 *
 * Until an email sender domain is configured for the project, this returns
 * false and the message stays safely stored in the database.
 */
const SUPPORT_INBOX = "rossetquentin26@gmail.com";

export async function sendSupportEmail(params: {
  subject: string;
  message: string;
  fromEmail: string;
  userId: string;
}): Promise<boolean> {
  const senderDomain = process.env.SENDER_DOMAIN;
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!senderDomain || !apiKey) return false;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0A0A29">
      <h2 style="margin:0 0 12px">Nouveau message support</h2>
      <p style="margin:0 0 4px"><strong>De :</strong> ${escapeHtml(params.fromEmail)}</p>
      <p style="margin:0 0 4px"><strong>User ID :</strong> ${escapeHtml(params.userId)}</p>
      <p style="margin:0 0 12px"><strong>Objet :</strong> ${escapeHtml(params.subject)}</p>
      <pre style="white-space:pre-wrap;font-family:inherit;background:#f4f4f8;padding:12px;border-radius:8px">${escapeHtml(params.message)}</pre>
    </div>`;

  const res = await fetch("https://api.lovable.dev/email/v1/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `TalKing Support <support@${senderDomain}>`,
      to: [SUPPORT_INBOX],
      reply_to: params.fromEmail,
      subject: `[Support] ${params.subject}`,
      html,
    }),
  });

  if (!res.ok) {
    console.error("support email API error:", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
