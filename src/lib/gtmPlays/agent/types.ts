/**
 * 후보자 아웃리치 에이전트 (#5): the shapes every part shares (tables in 20261117140000_gtm_agent.sql). Pure.
 *
 * One person row (gtm_agent_people) walks: found → excluded | no_fit | matched → drafted → (approved) →
 * sent (email) | queued_human (LinkedIn / X / Threads, a person sends it) → sent | skipped → replied | ended.
 */

export type AgentSource = "recruiter" | "opentowork" | "threads" | "manual";
export const AGENT_SOURCES: readonly AgentSource[] = ["recruiter", "opentowork", "threads", "manual"];

export type AgentChannel = "email" | "linkedin" | "x" | "threads";
export const AGENT_HUMAN_CHANNELS = ["linkedin", "x", "threads"] as const;
export type AgentHumanChannel = (typeof AGENT_HUMAN_CHANNELS)[number];

export type AgentStatus =
  | "found" | "excluded" | "no_fit" | "matched" | "drafted" | "approved" | "sent" | "queued_human" | "skipped"
  | "replied" | "ended" | "failed";

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
  | "no_contact"; // no usable email and no human channel turned on

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
  | "found" | "excluded" | "no_fit" | "matched" | "drafted" | "approved" | "rejected" | "sent" | "queued_human"
  | "sent_by_hand" | "skipped" | "expired" | "clicked" | "signed_up" | "replied" | "unsubscribed" | "bounced"
  | "followup_drafted" | "followup_sent" | "ended" | "failed" | "note";

/** One line of a person's timeline (gtm_agent_people.events). by: "agent", or the Ops user id. */
export type AgentEvent = { at: string; kind: AgentEventKind; by: string; note?: string | null };

export type AgentSourceSetting = { enabled: boolean; daily: number };
export type AgentChannelSetting = { enabled: boolean; account: string | null; daily: number };

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
  approvalRequired: boolean;
  followupDays: number;
  quietDaysAfterEnd: number;
  ownDomainAllowed: boolean;
  sources: Record<Exclude<AgentSource, "manual">, AgentSourceSetting>;
  channels: Record<AgentHumanChannel, AgentChannelSetting>;
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
  approvalRequired: false,
  followupDays: 7,
  quietDaysAfterEnd: 90,
  ownDomainAllowed: true,
  sources: {
    recruiter: { enabled: true, daily: 30 },
    opentowork: { enabled: false, daily: 30 },
    threads: { enabled: false, daily: 30 },
  },
  channels: {
    linkedin: { enabled: true, account: null, daily: 20 },
    x: { enabled: false, account: null, daily: 20 },
    threads: { enabled: false, account: null, daily: 20 },
  },
  updatedAt: null,
};

/** A person row as the code reads it (gtm_agent_people, camelCase). */
export type AgentPerson = AgentPersonInput & {
  id: string;
  runId: string | null;
  source: AgentSource;
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
  sentAccount: string | null;
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
