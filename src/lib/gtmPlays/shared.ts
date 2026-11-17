/** Pure parts of GTM plays (no server-only import), shared by the server modules and tests. */
import type { OrgRoleCriterion } from "@/lib/org/roleCriteria";
import { GTM_ROLE_PURPOSE, GTM_WORKSPACE_ID } from "./constants";

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

/** The member search returns at most this many nearest members. */
export const POOL_LIST_SIZE = 50;

/**
 * Who a GTM mail is from and who else gets it. The sender is a matchharper.com address (Resend's verified
 * domain); replies go back to it.
 */
export type GtmEnvelope = { fromName: string; fromEmail: string; cc: string[] };

export const GTM_SENDER_DOMAIN = "matchharper.com";

const PLAIN_EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

export function isGtmEmail(value: string) {
  return PLAIN_EMAIL.test(value.trim());
}

/**
 * The first address in a stored contact value: plain ("a@b.com") or the scraped DB's JSON list
 * ('["a@b.com", …]'); lower-cased, null when there is none.
 */
export function firstGtmEmail(value: string | null | undefined) {
  const match = String(value ?? "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/);
  const email = match?.[0].toLowerCase() ?? null;
  return email && isGtmEmail(email) ? email : null;
}

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

/** Search phrases for the scraped DB: no brackets or wildcards, 2~40 characters, at most 6, no repeats. */
export function cleanGtmKeywords(values: readonly string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const phrase = value.replace(/[()[\]{}%_*"']/g, " ").replace(/\s+/g, " ").trim();
    const key = phrase.toLowerCase();
    if (phrase.length < 2 || phrase.length > 40 || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length === 6) break;
  }
  return out;
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

/**
 * The job title inside a GTM Role name (gtmRoleName puts the company first, "회사 · 직함"). The candidate mail and
 * the Harper posting page show the company on its own line, so the posting keeps the title without it.
 */
export function gtmPostingTitle(roleName: string, companyName: string | null | undefined) {
  const name = roleName.trim();
  const prefix = `${String(companyName ?? "").trim()} · `;
  return prefix.length > 3 && name.toLowerCase().startsWith(prefix.toLowerCase()) ? name.slice(prefix.length).trim() : name;
}

export function companyDomain(homepageUrl: string | null | undefined) {
  const host = String(homepageUrl ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/:?#]/)[0];
  return host ? host.toLowerCase() : null;
}

const EXTRA_REQUEST_HEADING = "추가 요청:";

/**
 * The request the external search reads: Chris's base text, then his extra instructions under one
 * heading. The search Worker reads only the Role's request and criteria (the reason given when a search
 * is asked for is not read), so the extra instructions have to live in the request.
 */
export function gtmSearchRequest(base: string, extra: string) {
  const extraText = extra.trim();
  return `${base.trim()}${extraText ? `\n\n${EXTRA_REQUEST_HEADING}\n${extraText}` : ""}`;
}

/**
 * The two parts back for the editor: the saved parts when the Role keeps them (information.gtm), else
 * the whole request as the base.
 */
export function splitGtmSearchRequest(request: string | null | undefined, gtm: Record<string, unknown> | null | undefined) {
  const base = typeof gtm?.baseRequest === "string" ? gtm.baseRequest : null;
  const extra = typeof gtm?.extraRequest === "string" ? gtm.extraRequest : "";
  if (base !== null && gtmSearchRequest(base, extra) === (request ?? "").trim()) return { base, extra };
  return { base: (request ?? "").trim(), extra: "" };
}

const TRACKING_PARAM = /^(utm_\w+|ref|refid|trk|trackingid|source|src|gclid|fbclid|lipi|originalsubdomain)$/i;

/**
 * A posting URL as a key: host without www, path without trailing slash, and the query kept (postings like
 * Saramin rec_idx or Greenhouse gh_jid live there) minus tracking parameters, sorted.
 */
export function gtmPostingUrlKey(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const params = [...url.searchParams.entries()].filter(([key]) => !TRACKING_PARAM.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${query}`;
  } catch {
    return null;
  }
}

/**
 * One GTM Role per posting: the same customer Role, the same posting URL, or the same company + title
 * reopens the Role made before instead of adding another one to Harper's account.
 */
export function gtmRoleKey(jd: Pick<GtmJd, "source" | "companyName" | "title" | "url" | "sourceRoleId">) {
  if (jd.source === "customer_role" && jd.sourceRoleId) return `customer_role:${jd.sourceRoleId}`;
  const url = jd.source === "url" ? gtmPostingUrlKey(jd.url) : null;
  if (url) return `url:${url}`;
  const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return `text:${norm(jd.companyName)}|${norm(jd.title)}`;
}

/**
 * What the member search (우리 DB 검색) reads for a Role, saved or not: its name, description, request and
 * criteria as one JD through the same pool as #2.
 */
export function gtmMemberSearchJd(args: {
  companyName: string | null; title: string; description: string | null; request: string | null;
  criteria: Array<{ name: string; criteria: string; requirement?: string }>; url: string | null; location: string | null;
}): GtmJd {
  return {
    source: "text",
    companyName: args.companyName?.trim() || "Harper",
    title: args.title,
    description: [
      args.description ?? "",
      args.request ?? "",
      ...args.criteria.map((item) => `- ${item.name}${item.requirement === "must" ? " (필수)" : ""}: ${item.criteria}`),
    ].filter((part) => part.trim()).join("\n\n").slice(0, 20_000),
    url: args.url,
    location: args.location,
    sourceRoleId: null,
    sourceWorkspaceId: null,
    contactEmails: [],
  };
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

/** The GTM Role name candidates read: "<설명> · <직함>", the job title without the real company. */
export function gtmCandidateRoleName(opsName: string, companyName: string | null | undefined, description: string) {
  const title = withoutCompanyName(gtmPostingTitle(opsName, companyName) || opsName.trim(), companyName ?? null, description).trim();
  return (title.toLowerCase().startsWith(description.toLowerCase()) ? title : `${description} · ${title}`).slice(0, 160);
}

/**
 * What a new GTM Role writes: a Harper Role sealed from members, active so the search Worker runs it. A candidate
 * who gets the Role from a #4 mail reads its name and description, so neither names the hiring company: the name is
 * "<설명> · <직함>" and the JD's company name reads as the description. Ops keeps the real company, its own Role name
 * and the JD as given under information.gtm.
 */
export function gtmRolePlan(jd: GtmJd, brief: GtmBrief, extraRequest = "", companyDescription?: string | null) {
  const description = cleanPublicDescription(companyDescription ?? brief.publicDescription) ?? "채용 중인 회사";
  return {
    company_roles: {
      company_workspace_id: GTM_WORKSPACE_ID,
      name: gtmCandidateRoleName(brief.roleName, jd.companyName, description),
      status: "active",
      description: withoutCompanyName(jd.description, jd.companyName, description).slice(0, 16_000) || null,
      external_jd_url: jd.url,
      location_text: jd.location,
      information: {
        // Existing member seal: recommendations, scheduled search and member contact all skip it.
        testOnly: true,
        testTalentIds: [],
        purpose: GTM_ROLE_PURPOSE,
        gtm: {
          companyName: jd.companyName, publicDescription: description, opsName: brief.roleName,
          jdText: jd.description.slice(0, 16_000) || null, source: jd.source, url: jd.url,
          sourceRoleId: jd.sourceRoleId, sourceWorkspaceId: jd.sourceWorkspaceId,
          key: gtmRoleKey(jd), baseRequest: brief.request.trim(), extraRequest: extraRequest.trim(),
        },
      },
    },
    company_internal_roles: { request: gtmSearchRequest(brief.request, extraRequest), criteria: brief.criteria },
  };
}
