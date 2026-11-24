import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

/**
 * An email answer option opened on the web: Career chat starts with the
 * option text in the composer, and the person sends it as their own message.
 * The signature ties the text to the email's recipient (src/lib/email/security.ts).
 */
export const EMAIL_CHOICE_DRAFT_PARAM = "emailReply";
export const EMAIL_CHOICE_SIGNATURE_PARAM = "emailReplySig";
/** Stored as `career_opened_from_email_choice` in logs. */
export const EMAIL_CHOICE_OPENED_EVENT = "opened_from_email_choice";

export function careerChatDraftUrl(text: string, signature: string) {
  const url = new URL("/career/chat", getConfiguredPublicSiteUrl());
  url.searchParams.set(EMAIL_CHOICE_DRAFT_PARAM, text);
  url.searchParams.set(EMAIL_CHOICE_SIGNATURE_PARAM, signature);
  return url.href;
}
