import { getResendEmail, sendResendEmail } from "@/lib/email/send";

export const GTM_OUTREACH_RESEND_FROM = "Harper <harper@matchharper.com>";
export const GTM_OUTREACH_RESEND_REPLY_TO = "harper@matchharper.com";
const MESSAGE_ID_LOOKUP_ATTEMPTS = 3;

function renderExactTextBodyHtml(body: string) {
  return `<div style="white-space: pre-wrap;">${body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")}</div>`;
}

export async function sendGtmOutreachEmailWithResend(args: {
  body: string;
  dispatchId: string;
  subject: string;
  to: string;
}) {
  const sent = await sendResendEmail({
    from: GTM_OUTREACH_RESEND_FROM,
    html: renderExactTextBodyHtml(args.body),
    idempotencyKey: `gtm-outreach/${args.dispatchId}`,
    replyTo: GTM_OUTREACH_RESEND_REPLY_TO,
    subject: args.subject,
    text: args.body,
    to: args.to,
  });
  const emailId = sent.id?.trim();
  if (!emailId) throw new Error("Resend did not return an email ID");

  for (let attempt = 0; attempt < MESSAGE_ID_LOOKUP_ATTEMPTS; attempt += 1) {
    const delivered = await getResendEmail(emailId);
    const messageId = delivered.message_id?.trim();
    if (messageId) return { emailId, messageId };
    if (attempt + 1 < MESSAGE_ID_LOOKUP_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  throw new Error("Resend did not return the sent email Message-ID");
}
