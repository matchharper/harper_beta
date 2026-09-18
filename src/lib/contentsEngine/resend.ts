import { getResendEmail, sendResendEmail } from "@/lib/email/send";

export const GTM_OUTREACH_RESEND_FROM = "Harper <harper@matchharper.com>";
export const GTM_OUTREACH_RESEND_REPLY_TO = "harper@matchharper.com";

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

  const delivered = await getResendEmail(emailId);
  const messageId = delivered.message_id?.trim();
  if (!messageId) {
    throw new Error("Resend did not return the sent email Message-ID");
  }

  return { emailId, messageId };
}
