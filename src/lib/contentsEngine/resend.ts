import { getResendEmail, sendResendEmail } from "@/lib/email/send";
import { htmlToPlainText } from "@/lib/email/parse";

export const GTM_OUTREACH_RESEND_FROM = "Harper <harper@matchharper.com>";
export const GTM_OUTREACH_RESEND_REPLY_TO = "harper@matchharper.com";

export function renderFinalEmailBodyHtml(body: string) {
  // Final Email Body is a human-reviewed HTML fragment. Keep the wrapper only
  // to preserve legacy plain-text line breaks; do not escape the approved HTML.
  return `<div style="white-space: pre-wrap;">${body}</div>`;
}

export function renderFinalEmailBodyText(body: string) {
  return htmlToPlainText(body).replace(/(^|\n)[ \t]+/g, "$1");
}

export async function sendGtmOutreachEmailWithResend(args: {
  body: string;
  dispatchId: string;
  subject: string;
  to: string;
  inReplyTo?: string | null;
  references?: string | null;
}) {
  if (args.inReplyTo && !/^<[^<>\s]+@[^<>\s]+>$/.test(args.inReplyTo)) {
    throw new Error("Invalid reply Message-ID");
  }
  const references = [
    ...new Set([
      ...(args.references?.match(/<[^<>\s]+@[^<>\s]+>/g) ?? []),
      ...(args.inReplyTo ? [args.inReplyTo] : []),
    ]),
  ].join(" ");
  const sent = await sendResendEmail({
    from: GTM_OUTREACH_RESEND_FROM,
    html: renderFinalEmailBodyHtml(args.body),
    idempotencyKey: `gtm-outreach/${args.dispatchId}`,
    headers: args.inReplyTo
      ? {
          "In-Reply-To": args.inReplyTo,
          References: references,
        }
      : undefined,
    replyTo: GTM_OUTREACH_RESEND_REPLY_TO,
    subject: args.subject,
    text: renderFinalEmailBodyText(args.body),
    to: args.to,
  });
  const emailId = sent.id?.trim();
  if (!emailId) throw new Error("Resend did not return an email ID");

  // Delivery has already been accepted. A failed metadata read must never turn
  // that into a failed send. The recovery worker fills in the RFC ID later.
  const delivered = await getResendEmail(emailId).catch(() => null);
  const messageId = delivered?.message_id?.trim() || null;

  return { emailId, messageId };
}
