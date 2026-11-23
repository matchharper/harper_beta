/**
 * GTM plays 후보 메일 (now the #5 agent's) go to personal mailboxes only: a person's work address belongs to their
 * employer, and a recruiting mail there is the one the team decided not to send (11/16). Pure (no imports), so
 * the sender and tests share one list.
 */

/** Free mail providers people use as their own address (Korea first, then global). Lower case, exact domains. */
export const PERSONAL_MAIL_DOMAINS = [
  "gmail.com", "googlemail.com",
  "naver.com", "daum.net", "hanmail.net", "kakao.com", "nate.com", "hanmir.com", "korea.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "yahoo.com", "yahoo.co.kr",
  "proton.me", "protonmail.com",
] as const;

/** Harper's own domain: the team's test sends, never someone outside. */
export const HARPER_MAIL_DOMAIN = "matchharper.com";

const PERSONAL = new Set<string>(PERSONAL_MAIL_DOMAINS);

/** The part after the last @, trimmed and lower-cased ("" when there is none). */
export function mailDomain(email: string | null | undefined) {
  const value = String(email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  return at > 0 ? value.slice(at + 1) : "";
}

/** An address at a free personal mail provider (gmail.com, naver.com, …). Subdomains do not count. */
export function isPersonalMailAddress(email: string | null | undefined) {
  return PERSONAL.has(mailDomain(email));
}

/** Gmail's own domains: a username there is letters, digits and periods only. */
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Whether the provider could have this mailbox at all. A Gmail username has only letters, digits and periods
 * (Google's rule: https://support.google.com/mail/answer/9211434), so a gmail.com address with "_" or "-" before any
 * "+tag" does not exist and only bounces (11/23: 3 of the applicant file's 6 bounces were such addresses). Other
 * providers: no rule here, true.
 */
export function mailboxCanExist(email: string | null | undefined) {
  const value = String(email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0) return false;
  if (!GMAIL_DOMAINS.has(value.slice(at + 1))) return true;
  return /^[a-z0-9.]+$/.test(value.slice(0, at).split("+")[0]);
}

/** An address at matchharper.com (the team's own tests). */
export function isHarperMailAddress(email: string | null | undefined) {
  return mailDomain(email) === HARPER_MAIL_DOMAIN;
}
