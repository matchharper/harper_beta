/** Pure parts of GTM plays (no server-only import), shared by the server modules and tests. */
import type { OrgRoleCriterion } from "@/lib/org/roleCriteria";

/** One job description, wherever it came from. Every play starts from this shape. */
export type GtmJd = {
  source: "customer_role" | "url" | "text";
  companyName: string;
  title: string;
  description: string;
  url: string | null;
  location: string | null;
  /** The customer's own Role when the JD came from one (kept on the GTM Role for later hand-off). */
  sourceRoleId: string | null;
  sourceWorkspaceId: string | null;
  /** Addresses the posting itself shows (hiring post contact, or written in the text). */
  contactEmails: string[];
};

/** What the external search reads about a GTM Role: the same request + criteria a company Brief stores. */
export type GtmBrief = {
  roleName: string;
  /**
   * How candidates read the hiring company of a GTM Role made from an outside posting: a short description, never
   * its name ("결제 스타트업"). One per company: a company that already has one keeps it.
   */
  publicDescription?: string;
  request: string;
  criteria: Array<Pick<OrgRoleCriterion, "id" | "name" | "criteria" | "requirement" | "importance">>;
};

/**
 * Who a GTM mail is from and who else gets it. The sender is a matchharper.com address (Resend's verified
 * domain); replies go back to it.
 */
export type GtmEnvelope = { fromName: string; fromEmail: string; cc: string[] };

export const GTM_SENDER_DOMAIN = "matchharper.com";

/** The From header: the name without characters that would break the header, then the address. */
export function gtmFromHeader(envelope: Pick<GtmEnvelope, "fromName" | "fromEmail">) {
  const name = envelope.fromName.replace(/["<>,;:\r\n\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${name} <${envelope.fromEmail.trim().toLowerCase()}>`;
}

/** Where GTM mails' links point. */
export const GTM_HARPER_ORIGIN = "https://matchharper.com";

/**
 * Where a mail's buttons and opt-out link point: matchharper.com. A local server may set GTM_MAIL_LINK_ORIGIN
 * to its own loopback address (e.g. http://127.0.0.1:3103) so a test mail opened in the inbox comes back to the
 * code under test. Only http loopback values are accepted, so a production setting can never send people to
 * another site.
 */
export function gtmMailLinkOrigin(env: Record<string, string | undefined> = process.env) {
  const value = env.GTM_MAIL_LINK_ORIGIN?.trim().replace(/\/+$/, "");
  return value && /^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?$/.test(value) ? value : GTM_HARPER_ORIGIN;
}

/**
 * The last line of every GTM mail: how to stop them. With a link (the one-click opt-out page) when there is
 * one; the reply line is only for previews that have no mail yet.
 */
export function gtmOptOutMarkdown(language: "ko" | "en", unsubscribeUrl: string | null | undefined) {
  if (unsubscribeUrl) {
    return language === "en"
      ? `*If you'd rather not hear from Harper again, [unsubscribe here](${unsubscribeUrl}).*`
      : `*이런 메일을 더 받지 않으시려면 [여기](${unsubscribeUrl})를 눌러 주세요.*`;
  }
  return language === "en"
    ? "*If you'd rather not hear from Harper again, just reply and let me know.*"
    : "*이런 메일을 더 받지 않으시려면 답장으로 알려 주세요.*";
}

const GENERIC_LOCAL_PARTS = /^(no-?reply|do-?not-?reply|mailer-daemon|privacy|legal|abuse|postmaster)$/i;

export function extractEmails(...texts: Array<string | null | undefined>) {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of String(text ?? "").matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      const email = match[0].toLowerCase().replace(/[.]+$/, "");
      if (!GENERIC_LOCAL_PARTS.test(email.split("@")[0] ?? "")) found.add(email);
    }
  }
  return [...found].slice(0, 10);
}

/**
 * The Role name carries the hiring company because the Role lives in Harper's workspace (the search and
 * the invitation would otherwise read only "Harper").
 */
export function gtmRoleName(jd: Pick<GtmJd, "companyName" | "title">) {
  const company = jd.companyName.trim();
  const title = jd.title.trim();
  return (company && !title.toLowerCase().includes(company.toLowerCase()) ? `${company} · ${title}` : title).slice(0, 160);
}

export function companyDomain(homepageUrl: string | null | undefined) {
  const host = String(homepageUrl ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/:?#]/)[0];
  return host ? host.toLowerCase() : null;
}

/** The company's description, cleaned (2~40 characters); null when there is none. */
export function cleanPublicDescription(value: string | null | undefined) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().replace(/^["'“‘(（]+|["'”’)）]+$/g, "").trim();
  return text.length >= 2 ? text.slice(0, 40) : null;
}

/** "Harper 고객사(결제 스타트업)": how a mail and its Harper page name the company of a GTM Role. */
export function gtmCandidateCompanyLabel(workspaceName: string, description: string | null | undefined) {
  const desc = cleanPublicDescription(description);
  return desc ? `${workspaceName}(${desc})` : workspaceName;
}

/** The real company's name, taken out of what a candidate reads (words only, case-insensitive). */
export function withoutCompanyName(text: string, realName: string | null, replacement: string) {
  const name = realName?.trim();
  if (!name || name.length < 2) return text;
  return text.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), replacement);
}
