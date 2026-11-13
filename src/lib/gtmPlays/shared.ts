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
  request: string;
  criteria: Array<Pick<OrgRoleCriterion, "id" | "name" | "criteria" | "requirement" | "importance">>;
};

/** #2 lists this many nearest members; Chris picks any of them for the cards (3 are pre-ticked). */
export const POOL_LIST_SIZE = 50;
export const POOL_DEFAULT_PICKS = 3;
/** No product limit on cards; the list size bounds it. */
export const POOL_CARD_LIMIT = POOL_LIST_SIZE;

/** What the company sees about one member: no name, no employer or school names, no links. */
export type AnonymousCard = {
  talentId: string;
  title: string;
  /** Career length label, written by code from the member's years (e.g. "경력 5년"). */
  years: string;
  highlights: string[];
  fit: string;
};

/** The server's limits for a card (route cardSchema). */
export const CARD_LIMIT = { title: 120, highlight: 200, highlights: 3, fit: 300 };

const CARD_BULLET = /^[-•*·]\s*/;

/** A card as one editable text: the title, a blank line, a "- " line per highlight, a blank line, the fit. */
export function cardText(card: Pick<AnonymousCard, "title" | "highlights" | "fit">) {
  return [card.title, "", ...card.highlights.map((line) => `- ${line}`), "", card.fit].join("\n");
}

/**
 * Reads cardText back: the first line (unless it is a "-" line) is the title, "-" lines are highlights and every
 * other line is the fit. What goes past the server's limits is cut, and `cut` says what was cut.
 */
export function readCardText(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const title = lines[0] && !CARD_BULLET.test(lines[0]) ? lines[0] : "";
  const rest = title ? lines.slice(1) : lines;
  const highlights = rest.filter((line) => CARD_BULLET.test(line)).map((line) => line.replace(CARD_BULLET, "").trim()).filter(Boolean);
  const fit = rest.filter((line) => !CARD_BULLET.test(line)).join(" ");
  const cut: string[] = [];
  if (title.length > CARD_LIMIT.title) cut.push(`제목은 ${CARD_LIMIT.title}자까지만 들어가요`);
  if (highlights.length > CARD_LIMIT.highlights) cut.push(`강점은 ${CARD_LIMIT.highlights}줄까지만 들어가요`);
  if (highlights.some((line) => line.length > CARD_LIMIT.highlight)) cut.push(`강점 한 줄은 ${CARD_LIMIT.highlight}자까지만 들어가요`);
  if (fit.length > CARD_LIMIT.fit) cut.push(`맞는 이유는 ${CARD_LIMIT.fit}자까지만 들어가요`);
  return {
    fields: {
      title: title.slice(0, CARD_LIMIT.title),
      highlights: highlights.slice(0, CARD_LIMIT.highlights).map((line) => line.slice(0, CARD_LIMIT.highlight)),
      fit: fit.slice(0, CARD_LIMIT.fit),
    },
    cut,
  };
}

/** The opening of a company mail; cards, buttons and the sign-off are rendered by code. */
export type CompanyMailDraft = { subject: string; intro: string };

/**
 * Who a GTM mail is from and who else gets it, set on every mail form (company and candidate mails alike).
 * The sender is any matchharper.com address (Resend's verified domain); replies go back to it.
 */
export type GtmEnvelope = { fromName: string; fromEmail: string; cc: string[] };

export const GTM_SENDER_DOMAIN = "matchharper.com";
/** Shaun 11/12: Chris by default, editable on the form. */
export const GTM_DEFAULT_ENVELOPE: GtmEnvelope = { fromName: "Chris Heo", fromEmail: "chris@matchharper.com", cc: [] };
export const GTM_MAX_CC = 5;

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

/** Comma, semicolon or space separated addresses, lower-cased and de-duplicated. */
export function parseGtmEmailList(value: string) {
  return [...new Set(value.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

/** What is wrong with an envelope, in the words the form shows; null when it can be sent. */
export function gtmEnvelopeProblem(envelope: GtmEnvelope): string | null {
  const from = envelope.fromEmail.trim().toLowerCase();
  if (!isGtmEmail(from)) return "보내는 주소를 확인해 주세요.";
  if (!from.endsWith(`@${GTM_SENDER_DOMAIN}`)) return `보내는 주소는 @${GTM_SENDER_DOMAIN} 주소만 쓸 수 있어요.`;
  if (!envelope.fromName.trim()) return "보내는 사람 이름을 적어 주세요.";
  const badCc = envelope.cc.find((item) => !isGtmEmail(item));
  if (badCc) return `참조 주소를 확인해 주세요: ${badCc}`;
  if (envelope.cc.length > GTM_MAX_CC) return `참조는 ${GTM_MAX_CC}명까지예요.`;
  return null;
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

export function careerYearsLabel(years: number | null, language: "ko" | "en") {
  if (years === null || !Number.isFinite(years)) return "";
  const whole = Math.floor(years);
  if (language === "ko") return whole < 1 ? "경력 1년 미만" : `경력 ${whole}년`;
  return whole < 1 ? "Under 1 year of experience" : `${whole} ${whole === 1 ? "year" : "years"} of experience`;
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

/** What a new GTM Role writes: a Harper Role sealed from members, active so the search Worker runs it. */
export function gtmRolePlan(jd: GtmJd, brief: GtmBrief, extraRequest = "") {
  return {
    company_roles: {
      company_workspace_id: GTM_WORKSPACE_ID,
      name: brief.roleName,
      status: "active",
      description: jd.description.slice(0, 16_000) || null,
      external_jd_url: jd.url,
      location_text: jd.location,
      information: {
        // Existing member seal: recommendations, scheduled search and member contact all skip it.
        testOnly: true,
        testTalentIds: [],
        purpose: GTM_ROLE_PURPOSE,
        gtm: {
          companyName: jd.companyName, source: jd.source, url: jd.url,
          sourceRoleId: jd.sourceRoleId, sourceWorkspaceId: jd.sourceWorkspaceId,
          key: gtmRoleKey(jd), baseRequest: brief.request.trim(), extraRequest: extraRequest.trim(),
        },
      },
    },
    company_internal_roles: { request: gtmSearchRequest(brief.request, extraRequest), criteria: brief.criteria },
  };
}
