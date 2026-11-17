/**
 * #5 email lookup: a person the agent may not mail yet (an applicant from the LinkedIn export, whose email column is
 * always empty, or a person found by a post without an address) gets one paid Exa Agent run that asks for an address
 * a source ties to this same person. The agent then reads the source page itself and uses the address only when it
 * is on that page, the page shows the person's name with an employer or school (or is the person's own page), and
 * it is an address the agent may mail (mailRules.ts). GitHub addresses are never used. The rules and the prompt are
 * the worker's (harper_worker opp/external_sourcing/contacts.py). Pure, so the run, the screen and the tests agree.
 */
import { agentMailableAddress } from "./mailRules";
import { cleanEmail } from "./people";
import type { AgentEmailLookup, AgentEmailLookupReason, AgentPerson, AgentSettings } from "./types";

export const EMAIL_LOOKUP_EFFORT = "medium" as const;
/** Exa pricing (2026-10-30): a medium run, plus each email it returns; a source page read. */
export const EMAIL_LOOKUP_RUN_USD = 0.1;
export const EMAIL_LOOKUP_EMAIL_USD = 0.02;
export const EMAIL_LOOKUP_PAGE_USD = 0.001;
/** What one lookup is expected to cost: kept aside from today's cap while it runs. */
export const EMAIL_LOOKUP_ESTIMATE_USD = EMAIL_LOOKUP_RUN_USD + EMAIL_LOOKUP_EMAIL_USD;
/** A lookup still running after this is given up (the person is excluded as no_email). */
export const EMAIL_LOOKUP_TIMEOUT_MS = 15 * 60_000;
/** How much of the source page is read for the checks. */
export const EMAIL_LOOKUP_PAGE_CHARS = 20_000;

/** The Exa Agent run's structured output. */
export const EMAIL_LOOKUP_SCHEMA = {
  type: "object",
  properties: {
    email: {
      type: ["string", "null"], format: "email",
      description: "An email address of this exact person, or null when no source ties one to them.",
    },
    email_kind: { type: "string", enum: ["work", "personal", "unknown", "none"] },
    source_url: { type: ["string", "null"], description: "The page where the address appears and shows it belongs to this person." },
    same_person_basis: { type: "string", description: "What on the source matches the person (name + company/school, or their own site)." },
  },
  required: ["email", "email_kind", "source_url", "same_person_basis"],
} as const;

export const EMAIL_LOOKUP_SYSTEM_PROMPT = [
  "Find a contact email for one specific professional so a recruiter can reach them about a job.",
  "Return an email only if a source ties it to this same person (their name plus at least one matching employer or school, or a page that is the person's own: their site, blog, portfolio or profile).",
  "Prefer an address the person published themselves (personal site, blog, portfolio, résumé, paper, talk page). A personal mailbox (Gmail, Naver, Daum, Kakao, Outlook, iCloud, Proton and the like) is more useful than a work address.",
  "Never invent or pattern-guess an address. Do not use GitHub commit or profile emails.",
  "source_url must be the page where the address appears. If not found, return email null and email_kind none.",
].join(" ");

export type EmailLookupPerson = Pick<AgentPerson, "name" | "profileUrl" | "contactUrl" | "headline" | "currentCompany" | "location">;

export type EmailLookupKind = NonNullable<AgentEmailLookup["emailKind"]>;

/** What the Exa Agent run returned, cleaned (email lower-cased or null, source as an http(s) URL or null). */
export type EmailLookupFound = { email: string | null; emailKind: EmailLookupKind; sourceUrl: string | null; samePersonBasis: string };

/** One look at a lookup (emailLookup.server.ts checkEmailLookup). */
export type EmailLookupCheck =
  | { state: "running" }
  | EmailLookupDone;

export type EmailLookupDone = {
  state: "done";
  /** The address the run returned (whether or not it passed the checks); null when none. */
  email: string | null;
  emailKind: EmailLookupKind | null;
  sourceUrl: string | null;
  verified: boolean;
  costUsd: number;
  /** Why the address did not pass the checks, or why there is none; null when verified. */
  reason: AgentEmailLookupReason | null;
};

const dash = (value: string | null | undefined) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || "-";

/** The run's query: who the person is and what to find. */
export function emailLookupQuery(person: EmailLookupPerson): string {
  return [
    `Person: ${dash(person.name)}`,
    `Profile: ${dash(person.profileUrl)}`,
    `Own link: ${dash(person.contactUrl)}`,
    `Location: ${dash(person.location)}`,
    `Current: ${dash(person.headline)} at ${dash(person.currentCompany)}`,
    "Task: find this person's email address (personal preferred) and the page that shows it.",
  ].join("\n");
}

/**
 * Whether the person gets a lookup (always, no setting: Shaun 11/17): none was started yet, there is a page to start
 * from (a profile or a link the person wrote) and no address the agent may mail.
 */
export function needsEmailLookup(
  person: Pick<AgentPerson, "emailLookup" | "profileUrl" | "contactUrl" | "email" | "emailSource">,
): boolean {
  if (person.emailLookup) return false;
  if (!person.profileUrl?.trim() && !person.contactUrl?.trim()) return false;
  return !agentMailableAddress(person.email, person.emailSource);
}

/** The run's structured output, cleaned; anything missing or malformed reads as "no address". */
export function parseLookupOutput(structured: unknown): EmailLookupFound {
  const value = structured && typeof structured === "object" ? structured as Record<string, unknown> : {};
  const kind = String(value.email_kind ?? "");
  const source = String(value.source_url ?? "").trim();
  return {
    email: cleanEmail(typeof value.email === "string" ? value.email : null),
    emailKind: kind === "work" || kind === "personal" || kind === "unknown" ? kind : "none",
    sourceUrl: /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(source) ? source : null,
    samePersonBasis: String(value.same_person_basis ?? "").slice(0, 1_000),
  };
}

/** A run's cost: what Exa reports, else the price list ($0.10 a run, plus $0.02 when it returns an email). */
export function lookupRunCostUsd(run: { costDollars?: unknown; output?: { structured?: unknown } | null }): number {
  const cost = run.costDollars;
  if (typeof cost === "number" && Number.isFinite(cost)) return cost;
  if (cost && typeof cost === "object") {
    for (const key of ["total", "totalDollars", "total_dollars"]) {
      const value = (cost as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
  }
  return EMAIL_LOOKUP_RUN_USD + (parseLookupOutput(run.output?.structured).email ? EMAIL_LOOKUP_EMAIL_USD : 0);
}

/** Lower-cased host without "www." ("" when the URL has none). */
export function lookupSourceHost(url: string | null | undefined): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(String(url ?? "").trim());
  return match ? match[1].toLowerCase().replace(/^www\./, "") : "";
}

const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Never used as a source: personal social media and sites that resell people data (the worker's list). */
export const LOOKUP_BLOCKED_SOURCES = [
  "facebook.com", "instagram.com", "tiktok.com", "rocketreach.co", "zoominfo.com", "contactout.com", "signalhire.com",
  "apollo.io", "lusha.com", "spokeo.com", "peoplelooker.com", "theorg.com",
] as const;

const isGithubHost = (host: string) => onDomain(host, "github.com") || host.endsWith("githubusercontent.com");
const isGithubAddress = (email: string) => email.endsWith("noreply.github.com") || onDomain(email.slice(email.lastIndexOf("@") + 1), "github.com");

/**
 * Why the returned address cannot be used before its page is read (no address, a GitHub address or page, no source
 * page, a blocked source), or null when the page is worth reading.
 */
export function lookupSourceProblem(found: Pick<EmailLookupFound, "email" | "sourceUrl">): AgentEmailLookupReason | null {
  if (!found.email) return "not_found";
  const host = lookupSourceHost(found.sourceUrl);
  if (isGithubAddress(found.email) || (host && isGithubHost(host))) return "github";
  if (!found.sourceUrl || !host) return "no_source";
  if (LOOKUP_BLOCKED_SOURCES.some((domain) => onDomain(host, domain))) return "vendor_source";
  return null;
}

/** Lower case, one space, and the common hidden forms of an address ("jane [at] example [dot] com") written out. */
function pageForm(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/＠/g, "@")
    .replace(/\s*[[({<]\s*at\s*[\])}>]\s*/gi, "@")
    .replace(/\s*[[({<]\s*dot\s*[\])}>]\s*/gi, ".")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A word on the page: whole-word for Latin text; contained for other scripts (Korean attaches particles: 회사에서). */
function onPage(page: string, term: string): boolean {
  if (!term) return false;
  if (!/^[\x20-\x7e]+$/.test(term)) return page.includes(term);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, "u").test(page);
}

/** The person's name on the page: as written, in reverse order ("Doe Jane"), or every part of it as a word. */
function nameOnPage(name: string | null, page: string): boolean {
  const full = pageForm(name).replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  if (full.length < 2) return false;
  if (onPage(page, full)) return true;
  const parts = full.split(" ").filter((part) => part.length >= 2);
  if (parts.length < 2) return false;
  return onPage(page, [...parts].reverse().join(" ")) || parts.every((part) => onPage(page, part));
}

/** Employers and schools the agent knows for the person: the current company, and "at X" / "@ X" / "ex-X" in the headline. */
export function lookupOrgNames(person: Pick<AgentPerson, "currentCompany" | "headline">): string[] {
  const names = [person.currentCompany ?? ""];
  const marker = /(?:^|\s)(?:(?:at|formerly|former|ex)\s+|@\s*|ex-)([^|·•,/()\n@]+)/gi;
  for (const match of String(person.headline ?? "").matchAll(marker)) names.push(match[1].split(/\s[-–—]\s/)[0]);
  return [...new Set(names.map((name) => pageForm(name).slice(0, 80)).filter((name) => name.length >= 2))];
}

/** host/path without scheme, "www.", query, fragment or trailing slash. */
const urlKey = (url: string | null | undefined) => String(url ?? "").trim().toLowerCase()
  .replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

/** Sites where a bare host is everyone's, not one person's (a link to one of them proves nothing). */
const SHARED_HOSTS = [
  "linkedin.com", "github.com", "x.com", "twitter.com", "threads.net", "threads.com", "medium.com", "velog.io",
  "tistory.com", "brunch.co.kr", "naver.com", "blog.naver.com", "notion.site", "notion.so", "google.com", "youtube.com",
];

/** The source page is the person's own: under their profile or a link they wrote (their site, blog, portfolio). */
function ownPage(sourceUrl: string, person: Pick<AgentPerson, "profileUrl" | "contactUrl">): boolean {
  const source = urlKey(sourceUrl);
  return [person.profileUrl, person.contactUrl].some((url) => {
    const own = urlKey(url);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/.test(own)) return false;
    if (!own.includes("/") && SHARED_HOSTS.includes(own)) return false;
    return source === own || source.startsWith(`${own}/`);
  });
}

/**
 * What the agent itself could confirm about the returned address: it is on the source page, and the page (without
 * the address) shows the person's name plus a known employer or school, or is the person's own page.
 */
export function verifyLookup(
  person: Pick<AgentPerson, "name" | "currentCompany" | "headline" | "profileUrl" | "contactUrl">,
  found: Pick<EmailLookupFound, "email" | "sourceUrl">,
  pageText: string | null | undefined,
): { verified: boolean; reason: AgentEmailLookupReason | null; sourceHost: string | null } {
  const sourceHost = lookupSourceHost(found.sourceUrl) || null;
  const problem = lookupSourceProblem(found);
  if (problem) return { verified: false, reason: problem, sourceHost };
  const email = found.email as string;
  const page = pageForm(pageText);
  if (!page) return { verified: false, reason: "page_unreadable", sourceHost };
  if (!page.includes(email)) return { verified: false, reason: "not_on_page", sourceHost };
  // The address itself must not count as the name or the employer.
  const rest = page.split(email).join(" ");
  const samePerson = nameOnPage(person.name, rest)
    && (lookupOrgNames(person).some((name) => onPage(rest, name)) || ownPage(found.sourceUrl as string, person));
  return samePerson ? { verified: true, reason: null, sourceHost } : { verified: false, reason: "other_person", sourceHost };
}

/** Whether a lookup still running has run out of time. */
export function lookupTimedOut(lookup: Pick<AgentEmailLookup, "startedAt">, now: Date): boolean {
  const started = Date.parse(lookup.startedAt);
  return !Number.isFinite(started) || now.getTime() - started >= EMAIL_LOOKUP_TIMEOUT_MS;
}

/** The result of a lookup that gave nothing (timed out, failed, could not start). */
export function emptyLookup(reason: AgentEmailLookupReason, costUsd: number): EmailLookupDone {
  return { state: "done", email: null, emailKind: null, sourceUrl: null, verified: false, costUsd, reason };
}

/** Plain Korean for the timeline and /ops #5. */
export const LOOKUP_REASON_LABEL: Record<AgentEmailLookupReason, string> = {
  not_found: "공개된 주소가 없어요",
  github: "GitHub 주소라 쓰지 않아요",
  vendor_source: "연락처 판매 사이트·SNS에서 나온 주소라 쓰지 않아요",
  no_source: "주소가 나온 페이지가 없어요",
  page_unreadable: "주소가 나온 페이지를 읽지 못했어요",
  not_on_page: "그 페이지에 주소가 없어요",
  other_person: "그 페이지가 같은 사람인지 확인되지 않아요",
  work_address: "개인 메일(gmail 등)이 아닌 주소만 찾았어요",
  timeout: "15분 안에 끝나지 않았어요",
  failed: "찾기가 실패했어요",
  start_failed: "찾기를 시작하지 못했어요",
};

/**
 * A finished lookup as the person keeps it: the lookup record, the address to use (verified and one the agent may
 * mail, else null) and the timeline line. The address itself is kept only when it is used.
 */
export function settleEmailLookup(
  lookup: AgentEmailLookup,
  done: EmailLookupDone,
  now: Date,
): { emailLookup: AgentEmailLookup; email: string | null; note: string } {
  const email = done.verified && done.email && agentMailableAddress(done.email, "lookup") ? done.email : null;
  const reason: AgentEmailLookupReason | null = email ? null : done.verified ? "work_address" : (done.reason ?? "not_found");
  const host = lookupSourceHost(done.sourceUrl);
  return {
    emailLookup: {
      ...lookup, state: "done", finishedAt: now.toISOString(), costUsd: Math.round(done.costUsd * 1_000_000) / 1_000_000,
      verified: done.verified, used: Boolean(email), emailKind: done.emailKind, sourceUrl: done.sourceUrl, reason,
    },
    email,
    note: email ? `이메일 찾음 · ${host || "출처"}` : `이메일 못 찾음 · ${LOOKUP_REASON_LABEL[reason ?? "not_found"]}`,
  };
}
