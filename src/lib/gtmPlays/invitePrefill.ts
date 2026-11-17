/**
 * Onboarding for someone who came from a #4 후보 메일: the LinkedIn profile we mailed them from (an external search
 * result or a scraped profile) fills 프로필 연결, so they only confirm it. Pure rules, shared by the server and
 * tests: which URLs count, and who may see the value.
 */
import { gtmMailWentOut } from "./shared";

/**
 * A LinkedIn member profile (linkedin.com/in/<id>, any country subdomain) as "https://www.linkedin.com/in/<id>";
 * null for anything else (company pages, search, other sites, broken values).
 */
export function linkedinProfileUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!/^https?:$/.test(url.protocol) || !(host === "linkedin.com" || /^[a-z]{2,3}\.linkedin\.com$/.test(host))) return null;
  const [first, id] = url.pathname.split("/").filter(Boolean);
  if (first?.toLowerCase() !== "in" || !id || !/^[\p{L}\p{N}_%.-]{2,100}$/u.test(id)) return null;
  return `https://www.linkedin.com/in/${id}`;
}

export type GtmInvitePrefillMail = {
  audience: string;
  status: string;
  /** Known once the provider accepted the mail ("sending" with an id counts as sent: shared.ts gtmMailWentOut). */
  provider_message_id?: string | null;
  created_at: string;
  claimed_talent_id: string | null;
};

/**
 * Whether a signed-in viewer may get the mail's prefill: a sent candidate mail still within its link's
 * validity, not yet claimed by someone else (unclaimed, or claimed by this same viewer). Never for signed-out
 * requests.
 */
export function canSeeGtmInvitePrefill(args: {
  viewerId: string | null | undefined; mail: GtmInvitePrefillMail | null; now: number; validMs: number;
}) {
  const { viewerId, mail } = args;
  if (!viewerId || !mail) return false;
  if (mail.audience !== "candidate" || !gtmMailWentOut(mail)) return false;
  const sentAt = Date.parse(mail.created_at);
  if (!Number.isFinite(sentAt) || args.now - sentAt > args.validMs) return false;
  return mail.claimed_talent_id === null || mail.claimed_talent_id === viewerId;
}
