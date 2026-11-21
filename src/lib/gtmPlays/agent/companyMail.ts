/**
 * #5 non-customer company mail (design 5장 "회사 쪽 흐름", Shaun 11/20): when candidates Ashley talks to show interest
 * in an outside posting (InterestSignal, agent/conversation.ts), Ashley writes once to that company's hiring address
 * with the interested candidates and strong Harper members, nameless (agent/companyMailCopy.ts has the words).
 *
 * When a posting's mail goes (runCompanyMailsWith, every dispatcher tick inside the send window, after the candidate
 * first mails and follow-ups, under the same daily cap):
 *   - an outside posting (not a Harper customer's, not a GTM Role), still open, company mails not stopped (a spam
 *     complaint on any company mail stops them all: agent/companyMail.server.ts companyMailsStopped);
 *   - visible candidates (interested external + strong Harper members) ≥ the /ops minimum (default 2), ≥ 1 interested,
 *     an address (the posting's own hiring address first, else the paid lookup's: companyAddressStep);
 *   - one mail per company per Korea-time day (signals of one day go in one mail); no other per-company limit;
 *   - after the first mail, again only when a new interested candidate appears (S3, same thread); Harper members
 *     growing alone never sends; a thread a human answered gets nothing; a thread the company answered gets an
 *     Ashley-written mail (writeWithHistory) instead of the fixed S3, or goes to a human.
 * The I/O is injected (CompanyMailIo), so the rules are tested with fakes. Pure.
 */
import { cardLeaks, identifyingTokens, isSameOrg, normalizeOrgName } from "../cardPrivacy";
import { isPersonalMailAddress, mailDomain } from "../personalMail";
import { extractEmails } from "../shared";
import type { InterestSignal } from "./conversation";
import { LOOKUP_REASON_LABEL, lookupSourceProblem, type EmailLookupFound } from "./emailLookup";
import { companyKey } from "./match";
import { onPage, pageForm } from "./mailRules";
import { DEFAULT_COMPANY_MAIL_MIN_CANDIDATES } from "./settingsFields";
import {
  candidateLine1, renderCompanyMail, renderWrittenCompanyMail, type CompanyCandidateLine, type CompanyMailLanguage,
  type CompanyMailVariant,
} from "./companyMailCopy";

/** Interest older than this no longer starts a company mail (it still counts in a later mail's N). */
export const COMPANY_SIGNAL_DAYS = 30;
/** Candidate bullets in one mail at most; the rest are behind the link. */
export const COMPANY_LINES_MAX = 3;
/** Harper members one mail counts at most (the landing evaluates each one for the company's Role). */
export const COMPANY_MEMBERS_MAX = 20;
/** A posting's member count is redone after this, or when a new signal came after it. */
export const COMPANY_MEMBERS_RECOUNT_MS = 24 * 60 * 60_000;
/** Company mails one tick sends at most. */
export const COMPANY_MAILS_PER_TICK = 3;

/** The red line on /ops (the run's problem) and the Slack alert while company mails are stopped. */
export const COMPANY_MAILS_STOPPED =
  "회사 메일에 스팸 신고가 들어와 회사 메일을 모두 멈췄어요 (후보 메일은 그대로예요). 확인한 뒤 에이전트를 껐다 켜면 다시 보내요";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------------------------------------------
// Signals → postings

/** A posting URL as one key (the mail snapshot's URL, compared without case, spaces or a trailing slash). */
export function postingKey(url: string | null | undefined): string {
  return String(url ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * The interested candidates of each posting since `since`: one signal per person (their latest), keeping the latest
 * question any of their signals carried (a later "thanks" carries none) and the latest consent.
 */
export function interestByPosting(signals: readonly InterestSignal[], since: string): Map<string, InterestSignal[]> {
  const byPosting = new Map<string, Map<string, InterestSignal>>();
  const ordered = [...signals].filter((signal) => signal.postingUrl && signal.at >= since).sort((a, b) => a.at.localeCompare(b.at));
  for (const signal of ordered) {
    const key = postingKey(signal.postingUrl);
    const people = byPosting.get(key) ?? new Map<string, InterestSignal>();
    const earlier = people.get(signal.personId);
    people.set(signal.personId, { ...signal, question: signal.question?.trim() || earlier?.question || null });
    byPosting.set(key, people);
  }
  return new Map([...byPosting].map(([key, people]) => [key, [...people.values()].sort((a, b) => a.at.localeCompare(b.at))]));
}

// ---------------------------------------------------------------------------------------------------------------
// The company's address

/** Addresses that never take a hiring mail (support, privacy, accommodation requests …). */
const NOT_HIRING = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster", "abuse", "privacy", "legal",
  "security", "support", "help", "helpdesk", "sales", "billing", "invoices", "press", "media", "pr", "marketing",
  "accommodation", "accommodations", "accessibility", "disability", "eeo", "eeoc", "benefits", "payroll", "ir",
  "investors", "webmaster", "admin", "dpo", "gdpr", "dataprotection", "unsubscribe", "feedback", "partnerships",
  "partners", "bizdev", "compliance", "ethics", "whistleblower", "info-privacy",
]);
/** The first word of a hiring mailbox's name (jobs@, careers@, talent.acquisition@, recruiting-kr@ …). */
const HIRING_WORDS = new Set([
  "job", "jobs", "career", "careers", "recruit", "recruiting", "recruitment", "recruiter", "recruiters", "talent",
  "talentacquisition", "ta", "hiring", "hire", "hr", "people", "apply", "application", "applications", "join", "joinus",
  "resume", "resumes", "cv", "workwithus", "chaeyong",
]);
/** Job boards and applicant-tracking systems: an address there is not the company's. */
const ATS_DOMAINS = [
  "greenhouse.io", "ashbyhq.com", "lever.co", "myworkdayjobs.com", "workday.com", "smartrecruiters.com", "workable.com",
  "recruitee.com", "bamboohr.com", "teamtailor.com", "breezy.hr", "jobvite.com", "icims.com", "linkedin.com",
  "indeed.com", "wanted.co.kr", "rocketpunch.com", "saramin.co.kr", "jobkorea.co.kr", "remember.co.kr", "matchharper.com",
];
/** Words right before an address that make it the posting's hiring contact ("send your resume to …", "지원: …"). */
const HIRING_CONTEXT = /(apply|application|resume|résumé|\bcv\b|portfolio|recruit|hiring|interested candidates|questions about (?:this|the) (?:role|position)|지원|이력서|채용|포트폴리오|문의)[^@\n]{0,80}$/i;

const onDomain = (domain: string, parent: string) => domain === parent || domain.endsWith(`.${parent}`);
const localWords = (email: string) => email.split("@")[0].toLowerCase().replace(/\+.*$/, "").split(/[._-]+/).filter(Boolean);

function isHiringMailbox(email: string): boolean {
  const words = localWords(email);
  return HIRING_WORDS.has(words[0] ?? "") || HIRING_WORDS.has(words.join(""));
}

function notHiringMailbox(email: string): boolean {
  const words = localWords(email);
  return NOT_HIRING.has(words.join("")) || NOT_HIRING.has(words.join("-")) || NOT_HIRING.has(words[0] ?? "");
}

function sameCompanyDomain(email: string, companyDomain: string | null): boolean {
  const domain = mailDomain(email);
  return Boolean(companyDomain && domain && (onDomain(domain, companyDomain) || onDomain(companyDomain, domain)));
}

/**
 * The hiring address a posting's own text gives (most outside postings, on Ashby, Greenhouse or Workday, give none):
 * a hiring mailbox (jobs@, careers@, recruiting@ …) first, on the company's own domain before any other; else an
 * address written right after hiring words ("send your resume to …", "지원 …"). Never a job board's or an ATS's, never
 * support/privacy/accommodation mailboxes, and a personal mailbox only when the text says to apply there. Null: none.
 */
export function hiringEmailFromText(text: string | null | undefined, companyDomain: string | null = null): string | null {
  const page = pageForm(text);
  const found = extractEmails(page).filter((email) => !notHiringMailbox(email) && !ATS_DOMAINS.some((domain) => onDomain(mailDomain(email), domain)));
  if (!found.length) return null;
  const inContext = (email: string) => {
    const at = page.indexOf(email);
    return at >= 0 && HIRING_CONTEXT.test(page.slice(Math.max(0, at - 120), at));
  };
  const ranked = found
    .map((email) => {
      const hiring = isHiringMailbox(email);
      const context = inContext(email);
      const personal = isPersonalMailAddress(email);
      if (personal && !context) return null;
      if (!hiring && !context) return null;
      const rank = (hiring ? 0 : 2) + (sameCompanyDomain(email, companyDomain) ? 0 : 1) + (personal ? 2 : 0);
      return { email, rank };
    })
    .filter((item): item is { email: string; rank: number } => Boolean(item))
    .sort((a, b) => a.rank - b.rank);
  return ranked[0]?.email ?? null;
}

/** A posting's paid hiring-contact lookup, as stored (gtm_agent_company_postings.contact_lookup). */
export type CompanyContactLookup = {
  runId: string | null;
  startedAt: string;
  state: "running" | "done";
  finishedAt?: string | null;
  costUsd?: number;
  reservedUsd?: number;
  reason?: string | null;
};

/** Where a posting's mail would go: an address, a lookup to start or wait for, or none (with why). */
export type CompanyAddressStep =
  | { kind: "address"; email: string; source: "posting" | "lookup" }
  | { kind: "start_lookup" }
  | { kind: "waiting"; reason: string }
  | { kind: "none"; reason: string };

/**
 * Address priority (Shaun 11/20 21:31): the posting's own hiring address first (free, and the channel the company
 * published), else the paid lookup's verified address for the company's recruiter or the role's hiring manager; one
 * recipient. A lookup runs once per posting; one that found nothing usable leaves the posting without a mail.
 */
export function companyAddressStep(args: {
  postingText: string | null; companyDomain: string | null;
  contact: { email: string | null; lookup: CompanyContactLookup | null } | null;
  /** Today's money allows a lookup (agent/spend.ts). */
  mayLookup: boolean;
}): CompanyAddressStep {
  const posting = hiringEmailFromText(args.postingText, args.companyDomain);
  if (posting) return { kind: "address", email: posting, source: "posting" };
  if (args.contact?.email) return { kind: "address", email: args.contact.email, source: "lookup" };
  const lookup = args.contact?.lookup ?? null;
  if (lookup?.state === "running") return { kind: "waiting", reason: "채용 담당자 주소를 찾는 중이에요" };
  if (lookup?.state === "done") {
    const why = contactReasonLabel(lookup.reason);
    return { kind: "none", reason: `채용 담당자 주소를 찾지 못했어요${why ? ` (${why})` : ""}` };
  }
  return args.mayLookup ? { kind: "start_lookup" } : { kind: "waiting", reason: "오늘 비용 한도라 주소 찾기를 내일 해요" };
}

/** Plain Korean for why a hiring-contact lookup gave no address (the timeline note). */
const CONTACT_REASON_LABEL: Record<string, string> = {
  ...LOOKUP_REASON_LABEL,
  generic: "고객지원·개인정보 같은 채용 외 주소나 채용 사이트 주소만 찾았어요",
  personal: "개인 메일 주소만 찾았어요",
  other_domain: "회사 도메인이 아닌 주소예요",
};

export function contactReasonLabel(reason: string | null | undefined): string {
  return reason ? CONTACT_REASON_LABEL[reason] ?? reason : "";
}

/** The paid lookup's instruction (the Exa Agent run of agent/emailLookup.server.ts, with the company's question). */
export const COMPANY_CONTACT_SYSTEM_PROMPT = [
  "Find one work email address to reach the people who hire for one job posting at one company: the company's published hiring mailbox (jobs@, careers@, recruiting@), a recruiter or talent acquisition partner at that company, or the hiring manager for the role.",
  "Return an email only if a public page shows it as belonging to that company (its own site, a job post, a team or contact page, or the person's own professional page naming the company).",
  "Prefer the company's published hiring mailbox, then a recruiter, then the hiring manager. Never return a personal mailbox (Gmail, Naver, Outlook and the like), a support, privacy, sales or no-reply address, or an address on a job board or applicant-tracking system.",
  "Never invent or pattern-guess an address. source_url must be the page where the address appears. If not found, return email null and email_kind none.",
].join(" ");

/** The company lookup's structured output: the same fields as the person lookup (agent/emailLookup.ts parseLookupOutput). */
export const COMPANY_CONTACT_SCHEMA = {
  type: "object",
  properties: {
    email: {
      type: ["string", "null"], format: "email",
      description: "A work email of the company's hiring mailbox, a recruiter there, or the role's hiring manager; null when no public page shows one.",
    },
    email_kind: { type: "string", enum: ["work", "personal", "unknown", "none"] },
    source_url: { type: ["string", "null"], description: "The page where the address appears and shows it belongs to that company." },
    same_person_basis: { type: "string", description: "Who the address belongs to and what on the page ties it to the company." },
  },
  required: ["email", "email_kind", "source_url", "same_person_basis"],
} as const;

export type CompanyContactQueryInput = { companyName: string; title: string; postingUrl: string; companyDomain: string | null; location: string | null };

/** The lookup's question for one posting. */
export function companyContactQuery(posting: CompanyContactQueryInput): string {
  return [
    `Company: ${posting.companyName}`,
    posting.companyDomain ? `Company website: ${posting.companyDomain}` : null,
    `Job posting: ${posting.title}${posting.location ? ` (${posting.location})` : ""}`,
    `Posting URL: ${posting.postingUrl}`,
    "Who: the company's hiring mailbox, a recruiter at the company, or the hiring manager for this role.",
  ].filter(Boolean).join("\n");
}

/**
 * Whether the lookup's address may take the company mail (null: yes, else why not): on its source page, not a job
 * board's, a vendor's or GitHub's, not a personal mailbox or a support/privacy/no-reply one, and on the company's
 * domain (when the company's site is known) or a domain named after the company.
 */
export function companyContactProblem(
  found: Pick<EmailLookupFound, "email" | "sourceUrl">, pageText: string | null,
  company: { companyName: string; companyDomain: string | null },
): string | null {
  const source = lookupSourceProblem(found);
  if (source) return source;
  const email = String(found.email);
  if (notHiringMailbox(email) || ATS_DOMAINS.some((domain) => onDomain(mailDomain(email), domain))) return "generic";
  if (isPersonalMailAddress(email)) return "personal";
  if (!pageText) return "page_unreadable";
  if (!onPage(pageForm(pageText), email)) return "not_on_page";
  if (company.companyDomain) return sameCompanyDomain(email, company.companyDomain) ? null : "other_domain";
  const name = companyKey(company.companyName).replace(/[^a-z0-9]/g, "");
  const label = mailDomain(email).split(".")[0]?.replace(/[^a-z0-9]/g, "") ?? "";
  return name.length >= 3 && label.length >= 3 && (label.includes(name) || name.includes(label)) ? null : "other_domain";
}

// ---------------------------------------------------------------------------------------------------------------
// The send rule

/** Visible ≥ the minimum, at least one interested external candidate, and an address. */
export function meetsCompanySendRule(args: { visible: number; interested: number; minCandidates: number; hasAddress: boolean }): boolean {
  const min = Number.isFinite(args.minCandidates) && args.minCandidates >= 1 ? Math.floor(args.minCandidates) : DEFAULT_COMPANY_MAIL_MIN_CANDIDATES;
  return args.interested >= 1 && args.visible >= min && args.hasAddress;
}

/** One earlier company mail of a posting (gtm_mails, campaign agent, audience company, sending or sent), oldest first. */
export type CompanyMailRecord = {
  id: string;
  toEmail: string;
  subject: string;
  createdAt: string;
  /** RFC Message-ID without <> ('' when the provider gave none; null while not read back yet). */
  rfcMessageId: string | null;
  facts: CompanyMailFacts | null;
};

/** What a company mail showed and counted (gtm_mails.company_mail). */
export type CompanyMailFacts = {
  variant: CompanyMailVariant | "written";
  /** {N}: interested external + Harper members counted. */
  visible: number;
  previousVisible: number | null;
  /** Every interested candidate counted so far in this posting's thread (gtm_agent_people ids). */
  interestedPersonIds: string[];
  /** The ones this mail added. */
  newPersonIds: string[];
  /** The Harper members counted (talent ids; gtm_mails.talent_ids too). */
  memberIds: string[];
  /** The bullets the mail showed (nameless). */
  lines: Array<{ kind: "interested" | "member"; id: string; line1: string; line2: string | null }>;
  /** The consented interested candidates' summaries so far in the thread: the landing's "직접 관심" cards. */
  interestedCards: Array<{ personId: string; line1: string; line2: string | null }>;
  /** The thread's first company mail (null on the first). */
  threadRootId: string | null;
  /** In-Reply-To / References of a mail in the thread (a stuck send is retried with the same request). */
  headers: Record<string, string> | null;
  contactSource: "posting" | "lookup" | "thread";
};

export type CompanyMailStep =
  | { action: "skip"; reason: string; note: boolean }
  | { action: "first"; interested: InterestSignal[] }
  | { action: "followup"; interested: InterestSignal[]; thread: CompanyMailRecord[] };

/**
 * What a posting's signals call for: a first mail, a mail in the thread for new interested candidates (S3), or
 * nothing (closed, not an outside posting, nobody new since the last company mail).
 */
export function companyMailStep(args: {
  posting: { open: boolean; outside: boolean; customer: boolean };
  interested: readonly InterestSignal[];
  previous: readonly CompanyMailRecord[];
}): CompanyMailStep {
  if (!args.posting.outside || args.posting.customer) return { action: "skip", reason: "고객사·Harper 공고는 회사 메일을 보내지 않아요", note: false };
  if (!args.posting.open) return { action: "skip", reason: "공고가 닫혀 회사 메일을 보내지 않아요", note: true };
  if (!args.interested.length) return { action: "skip", reason: "관심 보인 후보가 없어요", note: false };
  if (!args.previous.length) return { action: "first", interested: [...args.interested] };
  const shown = new Set(args.previous.flatMap((mail) => mail.facts?.interestedPersonIds ?? []));
  const fresh = args.interested.filter((signal) => !shown.has(signal.personId));
  if (!fresh.length) return { action: "skip", reason: "지난 회사 메일 뒤로 새로 관심 보인 후보가 없어요", note: false };
  return { action: "followup", interested: fresh, thread: [...args.previous] };
}

/**
 * Whether Ashley may tell a candidate "I'll ask the company" (agent/companyMail.server.ts canAskCompany): a mail for
 * that posting could actually go: an outside posting of a non-customer, open, company mails not stopped, an address
 * known or a lookup still possible, not an address that opted out, not a thread a human took over, and not a test
 * candidate whose mail would go to a real company.
 */
/** canAskCompany: "now" (a company mail can carry the question), "more" (once more candidates are interested), "no". */
export type AskCompany = "now" | "more" | "no";

export function canAskCompanyFrom(facts: {
  posting: { open: boolean; outside: boolean; customer: boolean } | null;
  stopped: boolean;
  address: "known" | "lookup_possible" | "none";
  suppressed: boolean;
  humanOwned: boolean;
  testToRealCompany: boolean;
  /** When a member count is at hand: whether interested + members can reach the minimum (null: not counted yet). */
  reachesMinimum?: boolean | null;
}): boolean {
  if (!facts.posting || !facts.posting.outside || facts.posting.customer || !facts.posting.open) return false;
  if (facts.stopped || facts.suppressed || facts.humanOwned || facts.testToRealCompany) return false;
  if (facts.reachesMinimum === false) return false;
  return facts.address !== "none";
}

// ---------------------------------------------------------------------------------------------------------------
// Candidates and their lines

/** What the agent knows about an interested external candidate (gtm_agent_people). */
export type InterestedPerson = {
  personId: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  currentCompany: string | null;
  profileText: string | null;
  isTest: boolean;
  /** Asked us to stop, was turned away by Ashley, bounced, or is on the opt-out list: never pitched to a company. */
  stopped?: boolean;
};

/** A strong Harper member for the posting (agent/companyMail.server.ts strongMembers). */
export type StrongMember = {
  talentId: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  years: number | null;
  experiences: Array<{ role: string | null; company: string | null; description: string | null; current: boolean }>;
  educations: Array<{ school: string | null }>;
};

/** A title without the employer: "Senior Backend Engineer at Company A | ex-B" → "Senior Backend Engineer". */
export function plainTitle(value: string | null | undefined): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  const head = text.split(/\s+(?:at|@)\s+|\s*@\s*|\s*[|·•,(]\s*|\s+[-–—]\s+/i)[0] ?? "";
  return head.trim().slice(0, 60);
}

function memberTitle(member: StrongMember): string {
  const current = member.experiences.find((row) => row.current && row.role?.trim());
  return plainTitle(current?.role ?? member.experiences.find((row) => row.role?.trim())?.role ?? member.headline);
}

/** Everything that would identify any candidate in the mail (one mail never names anyone, so all are checked together). */
export function mailTokens(people: readonly InterestedPerson[], members: readonly StrongMember[]): string[] {
  return [...new Set([
    ...people.flatMap((person) => identifyingTokens({
      name: person.name, headline: person.headline, experiences: [{ company: person.currentCompany }], educations: [],
    })),
    ...members.flatMap((member) => identifyingTokens({
      name: member.name, headline: member.headline, experiences: member.experiences, educations: member.educations,
    })),
  ])];
}

/** What in this text identifies someone (empty: safe): names, employers, schools, links, addresses. */
export function textLeaks(text: string, tokens: readonly string[]): string[] {
  return cardLeaks({ title: "", highlights: [text], fit: "" }, [...tokens]);
}

/** Line 1 by code, with any identifying title left out ("경력 6년 · 서울" when the title names an employer). */
export function safeLine1(args: { title: string; years: number | null; location: string | null }, language: CompanyMailLanguage, tokens: readonly string[]): string {
  const full = candidateLine1(args, language);
  if (!textLeaks(full, tokens).length) return full;
  const withoutTitle = candidateLine1({ ...args, title: null }, language);
  return textLeaks(withoutTitle, tokens).length ? candidateLine1({ title: null, years: args.years, location: null }, language) : withoutTitle;
}

/** The facts the line writer reads about one candidate (names stay out of the prompt; the check runs on the output). */
export function memberFactsText(member: StrongMember): string {
  return [
    member.headline ? `Headline: ${member.headline}` : null,
    member.years !== null ? `Career years: ${Math.floor(member.years)}` : null,
    ...member.experiences.slice(0, 5).map((row) =>
      `- ${row.role ?? "?"} @ ${row.company ?? "?"}${row.current ? " (now)" : ""}${row.description ? `: ${row.description.replace(/\s+/g, " ").slice(0, 240)}` : ""}`),
  ].filter(Boolean).join("\n");
}

/**
 * The facts the line writer reads about an interested outside candidate: the headline and the current company only.
 * Their profile text is free text whose past employers and schools the leak check cannot list (mailTokens knows only
 * the name, headline and current company), so it never reaches the writer: a line it cannot check is not written.
 */
export function personFactsText(person: InterestedPerson): string {
  return [
    person.headline ? `Headline: ${person.headline}` : null,
    person.currentCompany ? `Current company: ${person.currentCompany}` : null,
  ].filter(Boolean).join("\n");
}

/** One request to the line writer (agent/companyMail.server.ts writeCompanyLines). */
export type LineRequest = {
  language: CompanyMailLanguage;
  posting: { companyName: string; title: string; text: string };
  candidates: Array<{ label: string; facts: string }>;
  /** Whose spend it is (the interested candidate the mail is for). */
  personId: string;
};

export type LineWriter = (request: LineRequest) => Promise<Record<string, string>>;

/** The line writer's output: one line per label. */
export const COMPANY_LINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["label", "line"],
        properties: { label: { type: "string" }, line: { type: "string" } },
      },
    },
  },
} as const;

/**
 * The line writer's prompt (agent/companyMail.server.ts writeCompanyLines): facts in, one plain line per candidate
 * out. Names and employers are in the facts (they say what the work was); the rule keeps them out of the line, and
 * checkedLines checks every line in code before it is used.
 */
export function companyLinePrompt(request: LineRequest): { system: string; user: string } {
  const ko = request.language === "ko";
  const system = [
    "You write one short line per candidate for an email Harper sends to a company's hiring team about one of its job postings.",
    "Each line says one concrete thing the candidate has done that matters for this posting: what they built, ran or led, with a number when the facts give one. Only what the facts say.",
    "The company has not met these people: never write a person's name, any employer, client, product or school name, a link, an email address or a phone number. When the kind of company matters, say the kind ('a fintech startup', '국내 증권사').",
    ko
      ? "Write in Korean, in everyday words, as one short phrase without a subject or a period, like '결제 API를 처음부터 만들어 하루 100만 건 규모로 운영' (at most 60 characters)."
      : "Write in English, as one short phrase without a subject or a period, like 'Built a payments API from scratch and runs it at about 1M requests a day' (at most 110 characters).",
    "No hype words, no markdown, no emoji. Give every label exactly one line; when the facts say nothing concrete, give an empty line.",
  ].join("\n");
  const user = [
    `POSTING: ${request.posting.title} · ${request.posting.companyName}`,
    request.posting.text.replace(/\s+/g, " ").trim().slice(0, 3_000),
    "",
    "CANDIDATES",
    ...request.candidates.map((candidate) => `[${candidate.label}]\n${candidate.facts}`),
  ].join("\n");
  return { system, user };
}

/** The writer's output by label (anything malformed reads as no line). */
export function parseCompanyLines(value: unknown): Record<string, string> {
  const lines = value && typeof value === "object" ? (value as { lines?: unknown }).lines : null;
  if (!Array.isArray(lines)) return {};
  return Object.fromEntries(lines.flatMap((item) => {
    const label = typeof item?.label === "string" ? item.label.trim() : "";
    const line = typeof item?.line === "string" ? item.line : "";
    return label ? [[label, line]] : [];
  }));
}

/**
 * Line 2 of each candidate, written by the model and checked in code (agent/cardPrivacy.ts): a line that names
 * anyone, an employer or a school, or carries a link or an address, is written once more; still leaking (or
 * missing), the candidate gets no line 2 (an interested one then shows only as "한 분 더", a member is not shown).
 */
export async function checkedLines(args: {
  write: LineWriter; request: Omit<LineRequest, "candidates">; candidates: LineRequest["candidates"]; tokens: readonly string[];
}): Promise<Map<string, string>> {
  const kept = new Map<string, string>();
  let ask = args.candidates;
  for (let attempt = 0; attempt < 2 && ask.length; attempt += 1) {
    const written = await args.write({ ...args.request, candidates: ask });
    for (const candidate of ask) {
      const line = String(written[candidate.label] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (line && !textLeaks(line, args.tokens).length) kept.set(candidate.label, line);
    }
    ask = ask.filter((candidate) => !kept.has(candidate.label));
  }
  return kept;
}

/** A customer workspace as the customer check reads it (agent/companyMail.server.ts isCustomer). */
export type CustomerWorkspace = { id: string; names: Array<string | null>; domains: Array<string | null> };

const SHARED_HOST = /(^|\.)(linkedin\.com|notion\.site|notion\.so|oopy\.io|github\.io|github\.com|instagram\.com|facebook\.com|wixsite\.com|blogspot\.com|tistory\.com|medium\.com|google\.com|sites\.google\.com)$/i;

/** A host for comparing: lower case, no scheme, "www." or path; null for hosts many companies share. */
export function comparableHost(value: string | null | undefined): string | null {
  const host = String(value ?? "").trim().replace(/^https?:\/\//i, "").split(/[/:?#]/)[0].toLowerCase().replace(/^www\./, "");
  return host && host.includes(".") && !SHARED_HOST.test(host) ? host : null;
}

/**
 * Whether a posting's company is a Harper customer: the same workspace, the same name once (주)/legal suffixes and
 * punctuation are set aside (cardPrivacy isSameOrg), or the same web domain (or a subdomain of it). A wrong "yes"
 * only means no company mail, so the match leans that way.
 */
export function matchesCustomer(
  customers: readonly CustomerWorkspace[], posting: { names: readonly string[]; domain: string | null; workspaceId: string | null },
): boolean {
  const domain = comparableHost(posting.domain);
  return customers.some((customer) =>
    (posting.workspaceId !== null && customer.id === posting.workspaceId)
    || customer.names.some((name) => posting.names.some((other) => isSameOrg(name, other)))
    || (domain !== null && customer.domains.some((value) => {
      const host = comparableHost(value);
      return host !== null && (host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`));
    })));
}

// ---------------------------------------------------------------------------------------------------------------
// One tick

/** A posting as the company mail reads it (agent/companyMail.server.ts readCompanyPosting). */
export type CompanyPostingFacts = {
  postingUrl: string;
  roleId: string | null;
  companyName: string;
  title: string;
  location: string | null;
  /** Not closed, expired or gone. */
  open: boolean;
  /** An outside (public) posting; customer Roles go through the company's Slack and GTM Roles are Harper's own. */
  outside: boolean;
  /** The company is a Harper customer (a workspace of theirs on Harper). */
  customer: boolean;
  /** The posting's text: the address, the member search and the Role the landing makes read it. */
  text: string;
  companyDomain: string | null;
  language: CompanyMailLanguage;
};

export type CompanyAddress = { email: string; source: "posting" | "lookup" } | { waiting: string } | { none: string };

/** A mail ready to go (agent/companyMail.server.ts sendCompanyMail logs it and calls the provider). */
export type OutgoingCompanyMail = {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  language: CompanyMailLanguage;
  posting: CompanyPostingFacts;
  /** The interested candidate the mail is for (gtm_mails.agent_person_id): the earliest new one. */
  personId: string;
  facts: CompanyMailFacts;
};

/**
 * sent; blocked (this mail cannot go: a note on the candidates' timelines); paused (the provider or the sender
 * settings: sending stops for the tick and the run shows why); later (the daily cap filled up or the agent was turned
 * off meanwhile: nothing more this tick, nothing to show).
 */
export type CompanySendResult =
  | { status: "sent" } | { status: "blocked"; reason: string } | { status: "paused"; reason: string } | { status: "later"; reason: string };

/**
 * Ashley's writer for a thread the company already answered (the Ashley reply worker's; injected): her plain
 * paragraphs for this mail from the company thread's history only (never a candidate's), or null to hand it to a
 * human. The candidate facts given are the checked, nameless lines; the result is checked again before it goes.
 */
export type CompanyHistoryWriter = (input: {
  counterpartEmail: string;
  /** The thread's company mails (the first is its root), oldest first. */
  threadMailIds: string[];
  language: CompanyMailLanguage;
  posting: { companyName: string; title: string; url: string };
  visible: number;
  previousVisible: number;
  newCandidates: Array<{ line1: string; line2: string | null; question: string | null }>;
}) => Promise<{ bodyText: string } | null>;

export type CompanyMailIo = {
  now: Date;
  minCandidates: number;
  senderName: string;
  /** The send window (sendWeekdays / sendStartHour / sendEndHour) is open now. */
  windowOpen: boolean;
  /** The tick still has time for another mail. */
  timeLeft: () => boolean;
  /** Mails left of today's one daily cap (candidate and company mails together). */
  quotaLeft: () => Promise<number>;
  stopped: () => Promise<boolean>;
  signals: (since: string) => Promise<InterestSignal[]>;
  posting: (signals: readonly InterestSignal[]) => Promise<CompanyPostingFacts | null>;
  previousMails: (postingUrl: string) => Promise<CompanyMailRecord[]>;
  /** Company mails sent today (Korea time): one mail per company a day. */
  mailedToday: () => Promise<Array<{ companyName: string; toEmail: string }>>;
  isHumanOwned: (mailId: string) => Promise<boolean>;
  /** The company wrote back in the thread (its history has a mail from that address since `since`). */
  companyReplied: (toEmail: string, since: string) => Promise<boolean>;
  person: (personId: string) => Promise<InterestedPerson | null>;
  /** Strong members for the posting (counted again when stale or after `newestSignalAt`); null: not counted this tick. */
  members: (posting: CompanyPostingFacts, newestSignalAt: string) => Promise<StrongMember[] | null>;
  /** The posting's address (a paid lookup started for it is logged under `personId`, the interested candidate). */
  address: (posting: CompanyPostingFacts, personId: string) => Promise<CompanyAddress>;
  suppressed: (email: string) => Promise<boolean>;
  writeLines: LineWriter;
  newMailId: () => string;
  links: (mailId: string) => { landingUrl: string; unsubscribeUrl: string };
  send: (mail: OutgoingCompanyMail) => Promise<CompanySendResult>;
  /** A line on the candidate's timeline (once per text). */
  note: (personId: string, text: string) => Promise<void>;
  writeWithHistory?: CompanyHistoryWriter;
};

export type CompanyMailTickResult = { sent: number; problems: string[]; paused: string | null; waiting: Record<string, number> };

/** The default when no writer is wired: the thread goes to a human (a timeline line says so). */
const HAND_TO_HUMAN = "회사가 답장한 스레드라 고정 문구 대신 사람이 이어 써야 해요 (회사 메일을 보내지 않았어요)";

function headersFor(thread: readonly CompanyMailRecord[]): Record<string, string> | null {
  const ids = thread.map((mail) => mail.rfcMessageId).filter((id): id is string => Boolean(id)).map((id) => `<${id}>`);
  if (!ids.length) return null;
  return { "In-Reply-To": ids[ids.length - 1], References: ids.join(" ") };
}

/**
 * One tick's company mails. Postings go in the order their interest came (oldest first). Returns what went out, the
 * problems for the run (the stop's red line), a provider pause (sending stops for the tick), and why postings wait.
 */
export async function runCompanyMailsWith(io: CompanyMailIo): Promise<CompanyMailTickResult> {
  const result: CompanyMailTickResult = { sent: 0, problems: [], paused: null, waiting: {} };
  const wait = (reason: string) => { result.waiting[reason] = (result.waiting[reason] ?? 0) + 1; };
  if (await io.stopped()) {
    result.problems.push(COMPANY_MAILS_STOPPED);
    return result;
  }
  if (!io.windowOpen) return result;
  const since = new Date(io.now.getTime() - COMPANY_SIGNAL_DAYS * DAY_MS).toISOString();
  const groups = [...interestByPosting(await io.signals(since), since).values()].sort((a, b) => a[0].at.localeCompare(b[0].at));
  if (!groups.length) return result;
  const today = await io.mailedToday();
  const mailedCompanies = new Set(today.map((mail) => companyKey(mail.companyName)).filter(Boolean));
  const mailedAddresses = new Set(today.map((mail) => mail.toEmail.toLowerCase()));

  for (const group of groups) {
    if (result.sent >= COMPANY_MAILS_PER_TICK || !io.timeLeft()) break;
    if (await io.quotaLeft() <= 0) { wait("daily_cap"); break; }
    const posting = await io.posting(group);
    if (!posting) { wait("posting_unknown"); continue; }
    const previous = await io.previousMails(posting.postingUrl);
    const step = companyMailStep({ posting, interested: group, previous });
    if (step.action === "skip") {
      if (step.note) for (const signal of group) await io.note(signal.personId, step.reason);
      wait("skipped");
      continue;
    }
    const key = companyKey(posting.companyName);
    if ((key && mailedCompanies.has(key)) || previous.some((mail) => mailedAddresses.has(mail.toEmail.toLowerCase()))) {
      wait("company_mailed_today");
      continue;
    }
    const thread = step.action === "followup" ? step.thread : [];
    if (thread.length) {
      let owned = false;
      for (const mail of thread) owned ||= await io.isHumanOwned(mail.id);
      if (owned) {
        for (const signal of step.interested) await io.note(signal.personId, "사람이 답한 회사 스레드라 회사 메일을 자동으로 보내지 않아요");
        wait("human_owned");
        continue;
      }
      // The Message-ID of the last mail is read back from the provider within minutes: wait for it to thread.
      if (thread[thread.length - 1].rfcMessageId === null) { wait("thread_id_pending"); continue; }
    }

    // Who the mail is about: every interested candidate of the thread so far plus the new ones. Test candidates
    // never reach a real company (a company address is never a Harper one), so they start nothing, not even a lookup.
    const loaded = await Promise.all(step.interested.map(async (signal) => ({ signal, person: await io.person(signal.personId) })));
    const known = loaded.filter((item): item is { signal: InterestSignal; person: InterestedPerson } => Boolean(item.person));
    if (!known.length) { wait("person_unknown"); continue; }
    const fresh = known.filter((item) => !item.person.isTest && !item.person.stopped);
    if (!fresh.length) { wait(known.some((item) => item.person.stopped) ? "stopped_only" : "test_only"); continue; }
    const members = await io.members(posting, group[group.length - 1].at);
    if (!members) { wait("members_not_counted"); continue; }
    const earlierIds = [...new Set(thread.flatMap((mail) => mail.facts?.interestedPersonIds ?? []))];
    const stoppedIds = new Set(known.filter((item) => item.person.stopped).map((item) => item.signal.personId));
    const interestedIds = [...new Set([...earlierIds, ...fresh.map((item) => item.signal.personId)])].filter((id) => !stoppedIds.has(id));
    const visible = interestedIds.length + members.length;
    // The minimum before the address: a paid lookup only for a posting whose mail would go.
    if (!meetsCompanySendRule({ visible, interested: interestedIds.length, minCandidates: io.minCandidates, hasAddress: true })) {
      wait("below_minimum");
      continue;
    }

    const address: CompanyAddress = thread.length
      ? { email: thread[thread.length - 1].toEmail, source: "lookup" }
      : await io.address(posting, fresh[0].signal.personId);
    if ("waiting" in address) { wait("address_waiting"); continue; }
    if ("none" in address) {
      for (const { signal } of fresh) await io.note(signal.personId, `회사 메일을 보낼 주소가 없어요 · ${address.none}`);
      wait("no_address");
      continue;
    }
    if (!thread.length && mailedAddresses.has(address.email.toLowerCase())) { wait("company_mailed_today"); continue; }
    if (await io.suppressed(address.email)) {
      for (const { signal } of fresh) await io.note(signal.personId, "회사 주소가 연락 받지 않기 목록에 있어 회사 메일을 보내지 않아요");
      wait("suppressed");
      continue;
    }

    // Lines: consented interested candidates first, then members; every line checked against everyone's tokens.
    const tokens = mailTokens(fresh.map((item) => item.person), members);
    const questions = fresh.map((item) => item.signal.question?.trim() ?? "").filter(Boolean);
    if (questions.some((question) => textLeaks(question, tokens).length)) {
      for (const { signal } of fresh) await io.note(signal.personId, "질문에 이름·회사·학교·링크가 들어 있어 회사 메일을 보내지 않고 사람에게 넘겨요");
      wait("question_leak");
      continue;
    }
    const consented = fresh.filter((item) => item.signal.summaryConsent);
    const spareMembers = members.slice(0, COMPANY_LINES_MAX + 2);
    const request = { language: posting.language, posting: { companyName: posting.companyName, title: posting.title, text: posting.text }, personId: fresh[0].signal.personId };
    let written: Map<string, string>;
    try {
      written = await checkedLines({
        write: io.writeLines, request, tokens,
        candidates: [
          ...consented.map((item, index) => ({ label: `I${index + 1}`, facts: personFactsText(item.person) })),
          ...(thread.length ? [] : spareMembers.map((member, index) => ({ label: `M${index + 1}`, facts: memberFactsText(member) }))),
        ],
      });
    } catch (error) {
      // The writer is down: the mail waits for the next tick rather than going without its lines.
      console.warn("[gtm-agent] company mail lines not written", error instanceof Error ? error.message : String(error));
      wait("lines_error");
      continue;
    }
    const interestedLines = consented.flatMap((item, index) => {
      const line2 = written.get(`I${index + 1}`);
      if (!line2) return [];
      const line1 = safeLine1({ title: plainTitle(item.person.headline), years: null, location: item.person.location }, posting.language, tokens);
      return [{ item, line: { line1, line2, interested: true, question: item.signal.question } satisfies CompanyCandidateLine }];
    }).slice(0, COMPANY_LINES_MAX);
    const named = new Set(interestedLines.map((entry) => entry.item.signal.personId));
    const unnamed = fresh.filter((item) => !named.has(item.signal.personId));
    const memberSlots = thread.length ? 0 : Math.max(0, COMPANY_LINES_MAX - interestedLines.length - (unnamed.length ? 1 : 0));
    const memberLines = spareMembers.flatMap((member, index) => {
      const line2 = written.get(`M${index + 1}`);
      if (!line2) return [];
      const line1 = safeLine1({ title: memberTitle(member), years: member.years, location: member.location }, posting.language, tokens);
      return [{ member, line: { line1, line2, interested: false } satisfies CompanyCandidateLine }];
    }).slice(0, memberSlots);

    const mailId = io.newMailId();
    const links = io.links(mailId);
    const previousVisible = thread.length ? thread[thread.length - 1].facts?.visible ?? 0 : null;
    const earlierCards = thread.flatMap((mail) => mail.facts?.interestedCards ?? []);
    const facts: CompanyMailFacts = {
      variant: thread.length ? "S3" : questions.length ? "S1" : "S2",
      visible,
      previousVisible,
      interestedPersonIds: interestedIds,
      newPersonIds: fresh.map((item) => item.signal.personId),
      memberIds: members.map((member) => member.talentId),
      lines: [
        ...interestedLines.map(({ item, line }) => ({ kind: "interested" as const, id: item.signal.personId, line1: line.line1, line2: line.line2 })),
        ...memberLines.map(({ member, line }) => ({ kind: "member" as const, id: member.talentId, line1: line.line1, line2: line.line2 })),
      ],
      interestedCards: [
        ...earlierCards,
        ...interestedLines.map(({ item, line }) => ({ personId: item.signal.personId, line1: line.line1, line2: line.line2 })),
      ],
      threadRootId: thread[0]?.id ?? null,
      headers: headersFor(thread),
      contactSource: thread.length ? "thread" : address.source,
    };

    let rendered: { subject: string; html: string; text: string };
    const companyAnswered = thread.length ? await io.companyReplied(address.email, thread[0].createdAt) : false;
    if (companyAnswered) {
      // The company wrote back in this thread: Ashley writes with its history instead of the fixed S3, or a human does.
      const body = io.writeWithHistory ? await io.writeWithHistory({
        counterpartEmail: address.email, threadMailIds: thread.map((mail) => mail.id), language: posting.language,
        posting: { companyName: posting.companyName, title: posting.title, url: posting.postingUrl }, visible,
        previousVisible: previousVisible ?? 0,
        newCandidates: fresh.map((item) => {
          const line = interestedLines.find((entry) => entry.item === item)?.line;
          return { line1: line?.line1 ?? "", line2: line?.line2 ?? null, question: item.signal.question };
        }),
      }) : null;
      if (!body?.bodyText.trim() || textLeaks(body.bodyText, tokens).length) {
        for (const { signal } of fresh) await io.note(signal.personId, body ? "Ashley가 쓴 회사 메일에 이름·회사·학교·링크가 있어 보내지 않고 사람에게 넘겨요" : HAND_TO_HUMAN);
        wait("company_replied");
        continue;
      }
      facts.variant = "written";
      rendered = renderWrittenCompanyMail({
        language: posting.language, previousSubject: thread[thread.length - 1].subject, body: body.bodyText, visible,
        senderName: io.senderName, landingUrl: links.landingUrl, unsubscribeUrl: links.unsubscribeUrl,
      });
    } else {
      rendered = renderCompanyMail({
        variant: facts.variant as CompanyMailVariant, language: posting.language, companyName: posting.companyName,
        postingTitle: posting.title, visible, previousVisible, interested: fresh.length, questions,
        lines: [...interestedLines.map((entry) => entry.line), ...memberLines.map((entry) => entry.line)],
        unnamedInterested: unnamed.length,
        unnamedQuestions: unnamed.map((item) => item.signal.question?.trim() ?? "").filter(Boolean),
        previousSubject: thread.length ? thread[thread.length - 1].subject : null,
        senderName: io.senderName, landingUrl: links.landingUrl, unsubscribeUrl: links.unsubscribeUrl,
      });
    }
    // Every slot once more, as it goes in the mail (line 1 is built from titles and places; the fixed words are code's).
    const slots = [
      ...facts.lines.flatMap((line) => [line.line1, line.line2 ?? ""]),
      ...questions,
    ].join("\n");
    if (textLeaks(slots, tokens).length) {
      for (const { signal } of fresh) await io.note(signal.personId, "회사 메일에 이름·회사·학교·링크가 들어가 보내지 않았어요");
      wait("mail_leak");
      continue;
    }

    const sent = await io.send({
      id: mailId, to: address.email, subject: rendered.subject, html: rendered.html, text: rendered.text,
      headers: facts.headers ?? {}, language: posting.language, posting, personId: fresh[0].signal.personId, facts,
    });
    if (sent.status === "paused") { result.paused = sent.reason; break; }
    if (sent.status === "later") { wait(sent.reason); break; }
    if (sent.status === "blocked") {
      for (const { signal } of fresh) await io.note(signal.personId, `회사 메일을 보내지 않았어요 · ${sent.reason}`);
      wait("blocked");
      continue;
    }
    result.sent += 1;
    if (key) mailedCompanies.add(key);
    mailedAddresses.add(address.email.toLowerCase());
    for (const { signal } of fresh) {
      await io.note(signal.personId, `회사 메일 보냄 (${facts.variant}) · ${posting.companyName} · ${posting.title} · 보이는 후보 ${visible}명`);
    }
  }
  return result;
}

/** Company names compared as one key (cardPrivacy.ts normalizeOrgName), for the same-company-same-day rule's tests. */
export const sameCompany = (a: string, b: string) => Boolean(normalizeOrgName(a)) && normalizeOrgName(a) === normalizeOrgName(b);
