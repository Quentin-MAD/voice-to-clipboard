import { sendTemplateEmail } from './email-templates/send-email'

/**
 * Delivery of support messages to the private support inbox.
 * The destination address is server-side only and never exposed to the client.
 */
const SUPPORT_INBOX = "rossetquentin26@gmail.com";

export async function sendSupportEmail(params: {
  subject: string;
  message: string;
  fromEmail: string;
  userId: string;
  messageId?: string;
}): Promise<boolean> {
  try {
    const result = await sendTemplateEmail("support-message", SUPPORT_INBOX, {
      templateData: {
        fromEmail: params.fromEmail,
        userId: params.userId,
        subjectLine: params.subject,
        message: params.message,
      },
      replyTo: params.fromEmail,
      idempotencyKey: params.messageId
        ? `support-message-${params.messageId}`
        : undefined,
    });
    return result.sent;
  } catch (error) {
    console.error("support email send failed:", error);
    return false;
  }
}
