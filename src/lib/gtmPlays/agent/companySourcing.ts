/**
 * Company sourcing (Shaun 11/23 17:13): someone at a hiring company who posted their own team's opening (mostly on
 * LinkedIn; a gtm_agent_people row with giver_kind hiring_leader, kept excluded as a giver) gets one company mail (S0)
 * about the Harper members who fit that opening, on the company_post channel (agent/channels.ts) within its daily max.
 * The tick is agent/companyMail.ts runCompanyMailsWith (after the interest mails); this file holds its pure parts:
 *   - why a post is left out: one of SOURCING_SKIP, kept on the row (gtm_agent_people.skip_reason, the value /ops
 *     counts as 제외) with a timeline note saying the same;
 *   - the 30-day company rule (any company mail to the same company or the same address domain);
 *   - the opening the post describes (one model call, kept on the row's timeline so it is read once);
 *   - the name the mail greets.
 * Pure.
 */
import { isSameOrg } from "../cardPrivacy";
import { isPersonalMailAddress, mailDomain } from "../personalMail";
import type { AgentEvent } from "./types";

/**
 * Why a hiring post gets no company mail (gtm_agent_people.skip_reason, exactly these words): a Harper customer, a
 * company mailed within 30 days, no Harper member fits, no address to write to (none found, the lookup found none, or
 * the address is on the opt-out list or refused the mail), the post names no opening at a company, or the company is
 * one Ops blocked.
 */
export const SOURCING_SKIP = {
  customer: "하퍼 고객사",
  recent: "30일 안에 연락한 회사",
  noMembers: "맞는 회원 0명",
  noAddress: "주소 없음",
  noOpening: "공고를 읽지 못함",
  // Ops' blocked domains (recruiting platforms, search firms, HR companies; Shaun 11/24): exclusion.server.ts isBlockedCompany.
  blocked: "막은 회사",
} as const;
export type SourcingSkipReason = (typeof SOURCING_SKIP)[keyof typeof SOURCING_SKIP];

/** The timeline note that goes with a skip reason (the reason first, so /ops can read either). */
export function sourcingSkipNote(reason: SourcingSkipReason, detail?: string | null): string {
  return `회사 소싱 제외 · ${reason}${detail?.trim() ? ` · ${detail.trim()}` : ""}`;
}

/** A company mailed within this many days gets no sourced mail (the candidates' 30-day rule, for companies). */
export const SOURCING_RECENT_DAYS = 30;
/** A post older than this is not picked up (its opening is likely filled). */
export const SOURCING_POST_MAX_DAYS = 30;

/** A company mail of the last SOURCING_RECENT_DAYS days (gtm_mails audience company, sending or sent). */
export type RecentCompanyMail = { companyName: string; toEmail: string };

const onDomain = (domain: string, parent: string) => domain === parent || domain.endsWith(`.${parent}`);
const sameDomain = (a: string, b: string) => Boolean(a && b) && (onDomain(a, b) || onDomain(b, a));
/** An address's domain when it is a company's own (a personal mailbox's domain is shared by everyone). */
const companyMailDomain = (email: string) => (email && !isPersonalMailAddress(email) ? mailDomain(email) : "");

/**
 * Whether a company mail went to this company within the window: the same company by name (cardPrivacy isSameOrg:
 * (주) and legal suffixes set aside), the same address, or the same address domain (or the company's web domain).
 * A personal mailbox's domain never matches another address. A wrong "yes" only means no mail, so it leans that way.
 */
export function mailedWithin(
  recent: readonly RecentCompanyMail[],
  company: { names: readonly (string | null | undefined)[]; email?: string | null; domain?: string | null },
): boolean {
  const names = company.names.map((name) => String(name ?? "").trim()).filter(Boolean);
  const email = String(company.email ?? "").trim().toLowerCase();
  const domains = [companyMailDomain(email), String(company.domain ?? "").trim().toLowerCase()].filter(Boolean);
  return recent.some((mail) => {
    if (names.some((name) => isSameOrg(name, mail.companyName))) return true;
    const to = mail.toEmail.trim().toLowerCase();
    if (email && to === email) return true;
    const toDomain = companyMailDomain(to);
    return Boolean(toDomain) && domains.some((domain) => sameDomain(domain, toDomain));
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The opening the post describes

/** A hiring leader's post as the sourcing step reads it (gtm_agent_people). */
export type SourcingLead = {
  /** The row's id: gtm_mails.agent_person_id of its mail, and whose timeline and spend it is. */
  personId: string;
  name: string | null;
  headline: string | null;
  profileUrl: string | null;
  currentCompany: string | null;
  location: string | null;
  /** The post (signal_url): the sourced posting's URL (agent/companyMail.ts postingKey). */
  postUrl: string;
  postText: string;
  postAt: string | null;
  /** An address the post itself gives (the row's email, written in the post). */
  email: string | null;
  /** The search's group; the opening's title when the post says it word for word. */
  searchGroup: string | null;
  /** The opening as read on an earlier tick (the timeline note), if any. */
  opening: SourcedOpening | null;
};

/** What the post says about the opening (the model's read, or the search's title). */
export type SourcedOpening = {
  /** The company as the post names it (null: the author's current company). */
  companyName: string | null;
  /** The job title (null: the post describes no opening at a company). */
  title: string | null;
  location: string | null;
  /** What the work is and what it asks, a few short lines in the post's language. */
  requirements: string | null;
  /** The company's own site, as the post shows it. */
  website: string | null;
};

const clip = (value: unknown, max: number) => {
  const text = typeof value === "string" ? value.replace(/\r/g, "").trim() : "";
  return text ? text.slice(0, max).trim() : null;
};
const oneLine = (value: string | null | undefined) => String(value ?? "").replace(/\s+/g, " ").trim();
const line = (value: unknown, max: number) => {
  const text = clip(value, max);
  return text ? oneLine(text) : null;
};

/**
 * The title from the search's group (the search's judge writes a hiring post's role titles there, comma-separated),
 * only when the post itself says it (compared without case or extra spaces): the whole group, else its first title
 * the post says. A group that is a query family's name never becomes a title in a mail.
 */
export function titleFromSearchGroup(lead: Pick<SourcingLead, "searchGroup" | "postText">): string | null {
  const group = oneLine(lead.searchGroup);
  const post = oneLine(lead.postText).toLowerCase();
  const said = [group, ...group.split(/\s*,\s*/)].map(oneLine).find((title) => title.length >= 2 && post.includes(title.toLowerCase()));
  return said ? said.slice(0, 120) : null;
}

/** The reader's output. */
export const OPENING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["companyName", "title", "location", "requirements", "website"],
  properties: {
    companyName: { type: ["string", "null"], description: "The hiring company as the post names it; null when the post does not name one." },
    title: { type: ["string", "null"], description: "The job title of the opening; null when the post describes no opening at a company." },
    location: { type: ["string", "null"], description: "Where the job is (city, country or remote), only when the post says." },
    requirements: { type: ["string", "null"], description: "What the work is and what it asks for, at most 5 short lines, in the post's language." },
    website: { type: ["string", "null"], description: "The company's own website exactly as the post shows it; null when the post shows none." },
  },
} as const;

/** The one call that reads the opening out of a post (agent/companyMail.server.ts readSourcedOpening). */
export function openingPrompt(lead: SourcingLead): { system: string; user: string } {
  const system = [
    "You read one social media post in which someone says their own team or company is hiring.",
    "Return the opening it describes: the hiring company as the post names it, the job title as a job page would write it (one role: the main one when the post lists several), where the job is, what the work is and what it asks for, and the company's own website if the post shows it.",
    "Only what the post says. Write the title and the requirements in the post's language. If the post does not describe an opening at a company, return title null.",
  ].join("\n");
  const user = [
    `AUTHOR: ${[lead.name, lead.headline].filter(Boolean).join(" · ") || "unknown"}`,
    lead.currentCompany ? `AUTHOR'S CURRENT COMPANY: ${lead.currentCompany}` : null,
    lead.postAt ? `POSTED: ${lead.postAt.slice(0, 10)}` : null,
    `POST URL: ${lead.postUrl}`,
    "",
    "POST",
    lead.postText.replace(/\r/g, "").trim().slice(0, 6_000),
  ].filter((line) => line !== null).join("\n");
  return { system, user };
}

/** The reader's output, cleaned (anything malformed reads as no opening). */
export function parseOpening(value: unknown): SourcedOpening {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    companyName: line(item.companyName, 160),
    title: line(item.title, 160),
    location: line(item.location, 80),
    requirements: clip(item.requirements, 1_200),
    website: line(item.website, 200),
  };
}

/**
 * The company's web domain from the website the reader gave, only when the post shows it (its host is in the post's
 * text) and it is not a shared or social site. Null otherwise.
 */
export function websiteDomain(website: string | null | undefined, postText: string): string | null {
  const host = String(website ?? "").trim().replace(/^https?:\/\//i, "").split(/[/:?#\s]/)[0].toLowerCase().replace(/^www\./, "");
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  if (/(^|\.)(linkedin\.com|lnkd\.in|bit\.ly|notion\.site|notion\.so|google\.com|forms\.gle|github\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|medium\.com|wanted\.co\.kr|greenhouse\.io|lever\.co|ashbyhq\.com)$/.test(host)) return null;
  return postText.toLowerCase().includes(host) ? host : null;
}

/** The posting text the member search, the lines and the company's Role read: the requirements, then the post. */
export function sourcedPostingText(opening: Pick<SourcedOpening, "requirements">, postText: string): string {
  const post = postText.replace(/\r\n/g, "\n").trim();
  return [opening.requirements?.trim() ?? "", post].filter(Boolean).join("\n\n").slice(0, 16_000);
}

const NOTE_PREFIX = "회사 소싱 · 읽은 공고";
const NOTE_SEP = " · ";
const notePart = (value: string | null | undefined) => oneLine(value).replace(/·/g, "-") || "-";

/** The timeline note that keeps the opening (read once; later ticks take it from here). */
export function openingNote(opening: SourcedOpening): string {
  const head = [NOTE_PREFIX, notePart(opening.companyName), notePart(opening.title), notePart(opening.location), notePart(opening.website)].join(NOTE_SEP);
  return opening.requirements?.trim() ? `${head}\n${opening.requirements.trim()}` : head;
}

/** The opening kept on the timeline (the latest note), null when none was kept. */
export function openingFromEvents(events: readonly Pick<AgentEvent, "kind" | "note">[]): SourcedOpening | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind !== "note" || !event.note?.startsWith(`${NOTE_PREFIX}${NOTE_SEP}`)) continue;
    const [head, ...rest] = event.note.split("\n");
    const parts = head.slice(NOTE_PREFIX.length + NOTE_SEP.length).split(NOTE_SEP);
    if (parts.length !== 4) continue;
    const value = (part: string) => (part === "-" ? null : part);
    return {
      companyName: value(parts[0]), title: value(parts[1]), location: value(parts[2]), website: value(parts[3]),
      requirements: rest.join("\n").trim() || null,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// The greeting

/** Surnames written first in a romanized Korean name ("Kim Jihoon" greets "Jihoon"). */
const KOREAN_SURNAMES = new Set([
  "kim", "lee", "yi", "park", "pak", "choi", "jung", "jeong", "chung", "kang", "cho", "jo", "yoon", "yun", "jang", "chang",
  "lim", "im", "han", "oh", "seo", "suh", "shin", "sin", "kwon", "hwang", "ahn", "an", "song", "yoo", "yu", "ryu", "hong",
  "jeon", "jun", "chun", "ko", "go", "moon", "mun", "yang", "son", "sohn", "bae", "baek", "paik", "heo", "huh", "nam",
  "shim", "sim", "noh", "roh", "ha", "kwak", "sung", "seong", "cha", "joo", "ju", "woo", "koo", "ku", "min", "na", "jin",
  "um", "eom", "chae", "won", "bang", "kong", "hyun", "ham", "byun", "yeo", "choo", "chu", "do", "seok", "sun", "ma",
]);
const HONORIFIC = /^(dr|mr|mrs|ms|miss|prof|sir)\.?$/i;

/**
 * The name the mail greets ("안녕하세요, 지훈님." / "Hi Jihoon,"): a Korean name without its surname (김지훈 → 지훈; a
 * two-syllable name stays whole), a romanized one by its given name (Jihoon Kim, Kim Jihoon → Jihoon), any other by
 * its first word. Null for a handle or no name: the mail then greets the company's hiring team.
 */
export function greetingName(name: string | null | undefined): string | null {
  const text = oneLine(name).split(/\s*[,(|/]\s*|\s+[-–—]\s+/)[0]?.trim() ?? "";
  if (!text || text.startsWith("@") || /\d/.test(text)) return null;
  const words = text.split(/\s+/).filter((word) => !HONORIFIC.test(word));
  if (!words.length) return null;
  const hangul = /^[가-힣]+$/;
  if (words.every((word) => hangul.test(word))) {
    if (words.length > 1) return words[words.length - 1];
    const whole = words[0];
    return whole.length === 3 ? whole.slice(1) : whole.length === 4 ? whole.slice(2) : whole;
  }
  if (!words.every((word) => /^[\p{L}][\p{L}'’.-]*$/u.test(word))) return null;
  const given = words.length === 2 && KOREAN_SURNAMES.has(words[0].toLowerCase()) && !KOREAN_SURNAMES.has(words[1].toLowerCase())
    ? words[1] : words[0];
  return given.length >= 2 ? given.slice(0, 40) : null;
}
