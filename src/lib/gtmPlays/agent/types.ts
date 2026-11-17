/**
 * 후보자 아웃리치 에이전트 (#5): the shapes every part shares (tables in 20261117140000_gtm_agent.sql). Pure.
 *
 * One person row (gtm_agent_people) walks: found → excluded | no_fit | matched → drafted → (approved) → sent
 * → replied | ended (or skipped / failed). Contact is email only (Shaun 11/17).
 */

/**
 * Where the person was discovered (Shaun 11/17: the source is the place the PERSON was found, by domain): a signal
 * source id from agent/sources.ts (linkedin, x, threads, a developer community, a blog platform), "harper" for a
 * Harper member, "other" for a page on no known platform.
 */
export type AgentSource = string;

/**
 * How the agent got to the person: applicant = uploaded LinkedIn Recruiter "Apply starters" file; signal = a post or
 * profile saying they are looking; layoff = from a company with recent layoff news; role = "Role로 사람 찾기".
 */
export type AgentMethod = "applicant" | "signal" | "layoff" | "role";
export const AGENT_METHODS: readonly AgentMethod[] = ["applicant", "signal", "layoff", "role"];

/** Where in Harper a Role run found a person (as #4's 후보 메일: Choice 1 · 2 · 3). */
export type AgentCandidateSource = "member" | "external" | "scraped";
export const AGENT_CANDIDATE_SOURCES: readonly AgentCandidateSource[] = ["member", "external", "scraped"];

export type AgentChannel = "email";

export type AgentStatus =
  | "found" | "excluded" | "no_fit" | "matched" | "drafted" | "approved" | "sent" | "skipped" | "replied" | "ended"
  | "failed";

/** Why a person was not contacted (exclude_reason). */
export type AgentExcludeReason =
  | "member" // already a Harper member: no #5 mail (Shaun 11/17)
  | "recent_contact" // a #4 / #5 mail to the same person within 30 days
  | "quiet_after_end" // ended within quiet_days_after_end (90)
  | "suppressed" // opted out, bounced or complained (shared suppression list)
  | "internal" // Harper staff or test address
  | "duplicate" // the same person again in this run
  | "stale_signal" // the post is older than 14 days
  | "not_job_seeking" // a recruiter, a company account, or no clear intent to move
  | "company_intro" // Role run, a customer's Role: the company already has this person (connection request or shown)
  | "no_email"; // email only (Shaun 11/17): no personal address the agent may mail

export type AgentPostingKind = "external" | "customer" | "gtm";

/** One of the 2-3 postings a mail proposes. */
export type AgentPosting = {
  kind: AgentPostingKind;
  /** company_roles.role_id (an external posting's Role too); null only for a posting known by URL alone. */
  roleId: string | null;
  url: string | null;
  companyName: string;
  title: string;
  location: string | null;
  /** One line, in the mail's language: why this posting fits this person. */
  why: string;
};

/** What the agent knows about a person before matching (from the import or the post). */
export type AgentPersonInput = {
  name: string | null;
  headline: string | null;
  location: string | null;
  currentCompany: string | null;
  profileUrl: string | null;
  profileText: string | null;
  signalText: string | null;
  signalUrl: string | null;
  signalAt: string | null;
};

export type AgentEventKind =
  | "found" | "excluded" | "no_fit" | "matched" | "drafted" | "approved" | "rejected" | "sent" | "skipped" | "expired"
  | "clicked" | "signed_up" | "replied" | "unsubscribed" | "bounced" | "followup_sent" | "ended" | "failed" | "note";

/** One line of a person's timeline (gtm_agent_people.events). by: "agent", or the Ops user id. */
export type AgentEvent = { at: string; kind: AgentEventKind; by: string; note?: string | null };

/** One source's settings: on/off, how many new people a day, and the search tuning Ops edits (agent/tuning.ts). */
export type AgentSourceSetting = { enabled: boolean; daily: number; tuning?: Record<string, unknown> };

/** approve: every mail waits for an Ops approval; auto: mails go out within the hours and caps. */
export type AgentSendMode = "approve" | "auto";

/** gtm_agent_settings, as the code and /ops #5 read it. */
export type AgentSettings = {
  enabled: boolean;
  senderName: string | null;
  /** chris@matchharper.com by default (as #1 and #4), changeable on /ops #5 (e.g. a separate first-contact domain). */
  senderEmail: string | null;
  dailyMailCap: number;
  dailyCostUsd: number;
  /** Korea time: mails go out only from start (inclusive) to end (exclusive). */
  sendStartHour: number;
  sendEndHour: number;
  sendMode: AgentSendMode;
  followupDays: number;
  quietDaysAfterEnd: number;
  ownDomainAllowed: boolean;
  /** The daily signal sources by id (agent/sources.ts); a source not listed is off. Role runs set their own. */
  sources: Record<string, AgentSourceSetting>;
  /** Goes up by one on every save; each person is tagged with the version that found them (compare by version). */
  version: number;
  updatedAt: string | null;
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  enabled: false,
  senderName: "Chris Heo",
  senderEmail: "chris@matchharper.com",
  dailyMailCap: 30,
  dailyCostUsd: 10,
  sendStartHour: 8,
  sendEndHour: 21,
  sendMode: "auto",
  followupDays: 7,
  quietDaysAfterEnd: 90,
  ownDomainAllowed: true,
  sources: {},
  version: 1,
  updatedAt: null,
};

/** A person row as the code reads it (gtm_agent_people, camelCase). */
export type AgentPerson = AgentPersonInput & {
  id: string;
  runId: string | null;
  source: AgentSource;
  method: AgentMethod;
  /** The settings version the agent ran with when it found the person. */
  settingsVersion: number | null;
  /** Role로 찾기: the Role the person was found for (a customer's real Role, never its GTM copy). */
  roleId: string | null;
  candidateSource: AgentCandidateSource | null;
  /** talent_users.user_id (member), external_candidates.id on the GTM Role (external) or candid.id (scraped). */
  candidateRef: string | null;
  personKey: string;
  status: AgentStatus;
  excludeReason: AgentExcludeReason | null;
  postings: AgentPosting[];
  messageKind: "posting" | "posting_post" | null;
  reason: string | null;
  channel: AgentChannel | null;
  email: string | null;
  emailSource: "import" | "post" | "lookup" | null;
  language: "ko" | "en" | null;
  draftSubject: string | null;
  draftBody: string | null;
  mailId: string | null;
  followupMailId: string | null;
  sentBy: string | null;
  sentAt: string | null;
  skipReason: string | null;
  replyText: string | null;
  repliedAt: string | null;
  followupDueAt: string | null;
  endedAt: string | null;
  costUsd: number;
  isTest: boolean;
  events: AgentEvent[];
  createdAt: string;
  updatedAt: string;
};
