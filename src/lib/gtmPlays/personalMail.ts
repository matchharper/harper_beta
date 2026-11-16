/**
 * GTM plays #4 후보 메일 go to personal mailboxes only: a person's work address belongs to their employer, and a
 * recruiting mail there is the one Chris decided not to send (11/16). Pure (no imports), so the Ops screen, the
 * sender and tests share one list.
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

/** An address at matchharper.com (the team's own tests). */
export function isHarperMailAddress(email: string | null | undefined) {
  return mailDomain(email) === HARPER_MAIL_DOMAIN;
}

/** A #4 후보 메일 can go here: a personal address, or the team's own for a test. */
export function canMailCandidateAddress(email: string | null | undefined) {
  return isPersonalMailAddress(email) || isHarperMailAddress(email);
}

/** Why a #4 candidate address is not mailed (shown on the recipient and kept on a blocked row). */
export const COMPANY_MAIL_PROBLEM = "회사 메일이라 보내지 않아요";
