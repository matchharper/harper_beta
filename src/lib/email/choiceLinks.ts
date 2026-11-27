import { buildReplySubject, normalizeEmailAddress } from "@/lib/email/parse";
import type { CareerChoice } from "@/lib/career/choiceButtons";
import { careerChatDraftUrl } from "@/lib/career/emailChoiceDraft";
import { signEmailChoiceDraft } from "@/lib/email/security";

/**
 * Mailboxes whose own web and mobile apps open a prefilled compose window for
 * a mailto link (checked on Gmail web and the Gmail iPhone app). Other
 * mailboxes, such as Naver or Daum, may hand the link to an unrelated desktop
 * client or ignore it, so their choices open Harper on the web instead.
 */
const REPLY_COMPOSE_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
]);
const MICROSOFT_CONSUMER_DOMAIN = /^(?:outlook|hotmail|live)\.[a-z]{2,3}(?:\.[a-z]{2})?$/;

export function opensReplyCompose(recipient: string | null | undefined) {
  const domain = normalizeEmailAddress(String(recipient ?? ""))?.split("@")[1];
  if (!domain) return false;
  return REPLY_COMPOSE_DOMAINS.has(domain) || MICROSOFT_CONSUMER_DOMAIN.test(domain);
}

/**
 * Where each answer option in a Career email leads: a reply to this email's
 * Reply-To alias, so Harper reads it against this email, or else Career chat.
 */
export function careerEmailChoiceHref(args: {
  talentId: string;
  recipient: string;
  replyTo?: string | null;
  subject: string;
  /** Whether the recipient's mailbox opens a prefilled reply, when the sender looked it up (replyComposeMx.ts). */
  opensCompose?: boolean;
}) {
  const replyTo = (args.opensCompose ?? opensReplyCompose(args.recipient)) ? args.replyTo : null;
  return (choice: CareerChoice) =>
    (replyTo && choiceMailtoHref({ replyTo, subject: args.subject, choice })) ||
    careerChatDraftUrl(choice.value, signEmailChoiceDraft(args.talentId, choice.value));
}

/**
 * RFC 6068. Subject and body are percent-encoded. In the address only `+` is, as `%2B`: a handler that
 * form-decodes the link would read a literal `+` in `reply+token@…` as a space.
 */
export function choiceMailtoHref(args: {
  replyTo: string;
  subject: string;
  choice: CareerChoice;
}) {
  const address = normalizeEmailAddress(args.replyTo);
  if (!address) return "";
  const subject = encodeURIComponent(buildReplySubject(args.subject));
  const body = encodeURIComponent(args.choice.value);
  return `mailto:${address.replace(/\+/g, "%2B")}?subject=${subject}&body=${body}`;
}
